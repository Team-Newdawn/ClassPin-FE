"""Fixed OCR+layout+context pipeline, one model changed per comparison."""
import argparse
import copy
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path
import psutil

from compare_visual_layout import save, attach_ocr
from pin_region_mapping import map_deck_anchors, bbox_iou, bbox_from_region
from report_ablation import inputs_for, schema, validate_result, aggregate, REFERENCE
from compare_meaning_models import PROFILE_4B
from run_local_semantic_grouping import (MODEL_PROFILES, PeakTreeMemory, sha256_file,
    _available_local_port, _wait_for_server, _post_chat_completion)
from ocr_redaction import redact_text

GRANITE={'name':'Granite-3.3-2B-Instruct Q4_K_M','source':'ibm-granite/granite-3.3-2b-instruct-GGUF',
    'revision':'7cdf86ccd1f1bb3491c9b7017b033f2e51367397','license':'Apache-2.0',
    'sha256':'ac71e9e32c0bea919b409c5918f69ca74339854b0319c5065e4e9fb6d95c4852',
    'file':'granite-3.3-2b-instruct-Q4_K_M.gguf'}
MODELS={'qwen4':{**PROFILE_4B,'file':'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'},
        'qwen17':next(v for v in MODEL_PROFILES.values() if '1.7B' in v['name']), 'granite2':GRANITE}
COMBINATIONS=[('base','tesseract','ppv3','qwen4'),('ocr-easy','easyocr','ppv3','qwen4'),
    ('ocr-paddle','paddleocr','ppv3','qwen4'),('layout-small','tesseract','pps','qwen4'),
    ('layout-florence','tesseract','florence','qwen4'),('llm-small','tesseract','ppv3','qwen17'),
    ('llm-granite','tesseract','ppv3','granite2')]


def normalized_text(text):
    return re.sub(r'\s+','',unicodedata.normalize('NFC',text))


def edit_distance(a,b):
    row=list(range(len(b)+1))
    for i,ca in enumerate(a,1):
        following=[i]
        for j,cb in enumerate(b,1):following.append(min(following[-1]+1,row[j]+1,row[j-1]+(ca!=cb)))
        row=following
    return row[-1]


def evaluate_ocr(data, reference):
    samples=[]
    for ref in reference['ocr']:
        page=next(p for p in data['pages'] if p['pageNumber']==ref['page'])
        b=dict(zip(('x1','y1','x2','y2'),ref['box']))
        text,_=attach_ocr(b,page['regions']); a=normalized_text(ref['text']);b=normalized_text(text)
        samples.append({**ref,'observed':text,'editDistance':edit_distance(a,b),'referenceChars':len(a),'exact':a==b})
    total=sum(r['referenceChars'] for r in samples)
    numeric=[r for r in samples if r.get('numeric')]
    return {'samples':samples,'cer':sum(r['editDistance'] for r in samples)/total,
            'exact':sum(r['exact'] for r in samples),'count':len(samples),
            'numericExact':sum(r['exact'] for r in numeric),'numericCount':len(numeric)}


def broad_type(label):
    if label=='table':return 'table'
    if label in {'image','chart','figure','diagram'}:return 'visual'
    return 'text'


def evaluate_layout(data,reference):
    pairs=[]
    for i,ref in enumerate(reference['layout']):
        page=next(p for p in data['pages'] if p['pageNumber']==ref['page'])
        for r in page['regions']:
            if broad_type(r['label'])==ref['type']:
                iou=bbox_iou(tuple(ref['box']),bbox_from_region(r))
                if iou>=.5:pairs.append((iou,i,ref['page'],r['alias']))
    used_ref=set();used_pred=set();matches=[]
    for iou,i,page,alias in sorted(pairs,reverse=True):
        if i not in used_ref and (page,alias) not in used_pred:
            used_ref.add(i);used_pred.add((page,alias));matches.append({'reference':i,'page':page,'alias':alias,'iou':iou})
    return {'partialReferenceRecall':len(matches)/len(reference['layout']),'matched':len(matches),
            'count':len(reference['layout']),'matches':matches,'precision':None}


def execute_stage(python,script,engine,output,reference):
    started=time.perf_counter()
    process=subprocess.Popen([str(python),str(script),'--engine',engine,'--output',str(output)],
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    monitor=PeakTreeMemory();monitor.start(process.pid)
    status='complete'
    try:
        code=process.wait(timeout=1200)
        if code:status='failed'
    except subprocess.TimeoutExpired:
        status='timeout'
        for child in psutil.Process(process.pid).children(recursive=True):
            try: child.kill()
            except psutil.Error: pass
        process.kill();process.wait()
    finally:monitor.stop()
    result_path=output/'result.json'
    data=json.loads(result_path.read_text(encoding='utf-8')) if result_path.exists() else {'engine':engine,'pages':[]}
    data['status']=status if status!='complete' else data.get('status','failed')
    data['processMs']=(time.perf_counter()-started)*1000
    data['peakRssMiB']=monitor.peak_bytes/1048576
    if data['status']=='complete':data['evaluation']=evaluate_ocr(data,reference) if data['stage']=='ocr' else evaluate_layout(data,reference)
    output.mkdir(parents=True,exist_ok=True);save(result_path,data)
    return data


def compose(ocr,layout):
    """Only observed OCR changes; detector coordinates and mapping rules stay fixed."""
    result=copy.deepcopy(layout)
    for page in result['pages']:
        op=next(p for p in ocr['pages'] if p['pageNumber']==page['pageNumber'])
        for region in page['regions']:
            region['textRedacted'],region['ocrMembers']=attach_ocr(region['bboxNorm'],op['regions'])
    return result


def llm_run(server,model,requests,descriptors,path,metadata):
    url=f'http://127.0.0.1:{_available_local_port()}'
    start=time.perf_counter()
    p=subprocess.Popen([str(server),'-m',str(model),'--host','127.0.0.1','--port',url.rsplit(':',1)[1],
        '-c','8192','-t','4','-np','1','-ngl','0','--jinja','--no-warmup'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    memory=PeakTreeMemory();memory.start(p.pid)
    run={**metadata,'status':'running','records':[],'promptTokens':0,'completionTokens':0}
    try:
        _wait_for_server(url,p)
        run['readyMs']=(time.perf_counter()-start)*1000
        for (prompt,output_schema),(q,m,region,sources) in zip(requests,descriptors):
            began=time.perf_counter();output={};issues=[];finish=None
            try:
                response=_post_chat_completion(url,prompt,output_schema,384)
                usage=response.get('usage',{})
                for key,field in [('promptTokens','prompt_tokens'),('completionTokens','completion_tokens')]:run[key]+=int(usage.get(field,0))
                choice=response['choices'][0];finish=choice.get('finish_reason')
                output=json.loads(choice['message']['content'])
                issues=validate_result(output,q['questionAlias'],sources)
                if finish=='length':issues.append('token-limit')
            except Exception as error:
                issues.append('output-or-request-failed:'+type(error).__name__)
                output={}
            output={k:redact_text(v)[0] if isinstance(v,str) else v for k,v in output.items()}
            record={'alias':q['questionAlias'],'page':q['slideNumber'],'question':redact_text(q['question'])[0],
                'regionAlias':region['alias'] if region else 'PAGE','regionType':region['label'] if region else None,
                'geometryStatus':m['mappingStatus'],'output':output,'issues':issues,'displayable':not issues,
                'referenceAgreement':output.get('intent') in REFERENCE[q['questionAlias']],
                'elapsedMs':(time.perf_counter()-began)*1000,'finishReason':finish}
            run['records'].append(record);save(path,run)
            print(metadata['id'],q['questionAlias'],len(issues),'issues',flush=True)
        run['status']='complete'
    except Exception as error:run['status']='failed';run['errorType']=type(error).__name__
    finally:
        if p.poll() is None:
            p.terminate()
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        memory.stop()
        run['reportStageMs']=(time.perf_counter()-start)*1000
        run['peakRssMiB']=memory.peak_bytes/1048576
        run['outputGatePassCount']=sum(r['displayable'] for r in run['records'])
        run['referenceAgreementCount']=sum(r['referenceAgreement'] for r in run['records'])
        run['regionGroups']=aggregate(run['records'])
        save(path,run)
    return run


def main(args):
    root=args.output;root.mkdir(parents=True,exist_ok=True)
    reference_path=Path(__file__).parent/'fixtures/model_benchmark_reference.json'
    reference=json.loads(reference_path.read_text(encoding='utf-8'))
    questions_path=Path('tmp/classpin-soi-3373b744/questions-with-pins.json')
    questions=json.loads(questions_path.read_text(encoding='utf-8'))['questions']
    protocol={'pipeline':'OCR+layout+page-context+PIN-report','combinations':COMBINATIONS,'models':MODELS,
        'repeats':1,'referenceHash':sha256_file(reference_path),'questionHash':sha256_file(questions_path),
        'threads':4,'gpuLayers':0,'context':8192,'maxTokens':384,'postHoc':False,'reference':reference,
        'costAssumption':'1000 KRW/hour identical-performance worker; not actual bill'}
    if (root/'protocol.json').exists():
        if json.loads((root/'protocol.json').read_text(encoding='utf-8'))!=json.loads(json.dumps(protocol)):raise ValueError('Protocol changed')
    else:save(root/'protocol.json',protocol)
    stages={}
    for engine in ('tesseract','easyocr','paddleocr','ppv3','pps','florence'):
        path=root/engine/'result.json'
        if path.exists():
            stages[engine]=json.loads(path.read_text(encoding='utf-8'))
            if stages[engine].get('status')=='running':raise ValueError('Incomplete stage requires explicit retry directory')
        else:
            print('stage',engine,flush=True)
            stages[engine]=execute_stage(args.python,Path(__file__).with_name('model_benchmark_stage.py'),engine,root/engine,reference)
        print(engine,stages[engine]['status'],flush=True)
    result={'status':'running','protocol':protocol,'stages':stages,'runs':[]}
    for ident,ocr,layout,llm in COMBINATIONS:
        path=root/(ident+'.json')
        if path.exists():
            previous=json.loads(path.read_text(encoding='utf-8'))
            if previous['status']=='running':raise ValueError('Incomplete inference run; preserve and retry explicitly')
            result['runs'].append(previous);continue
        if any(stages[k]['status']!='complete' for k in (ocr,layout)):
            run={'id':ident,'ocr':ocr,'layout':layout,'llm':llm,'status':'blocked-by-stage'}
        else:
            profile=MODELS[llm]
            model=args.cache/('models--'+profile['source'].replace('/','--'))/'snapshots'/profile['revision']/profile['file']
            if not model.is_file() or sha256_file(model)!=profile['sha256']:raise ValueError('Missing or different model: '+llm)
            deck=compose(stages[ocr],stages[layout]);mappings=map_deck_anchors(deck,questions)
            requests=[];descriptors=[]
            for q,m in zip(questions,mappings):
                page=next(p for p in stages[ocr]['pages'] if p['pageNumber']==q['slideNumber'])
                lp=next(p for p in deck['pages'] if p['pageNumber']==q['slideNumber'])
                prompt,sources,region=inputs_for('C',q,page,m,lp)
                requests.append((prompt,schema(q['questionAlias'])));descriptors.append((q,m,region,sources))
            input_hash=__import__('hashlib').sha256(json.dumps(requests,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
            run=llm_run(args.server,model,requests,descriptors,path,
                {'id':ident,'ocr':ocr,'layout':layout,'llm':llm,'inputHash':input_hash,'modelBytes':model.stat().st_size})
            run['pipelineMs']=run['reportStageMs']+stages[ocr]['processMs']+stages[layout]['processMs']
            run['scenarioCostKRW']=run['pipelineMs']/3600
            run['mappedCount']=sum(r['geometryStatus']=='mapped' for r in run['records'])
        save(path,run);result['runs'].append(run);save(root/'results.json',result)
    result['status']='complete' if all(r['status']=='complete' for r in result['runs']) else 'partial'
    save(root/'results.json',result)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=Path('output/model-benchmark-cpu-v1'))
    p.add_argument('--python',type=Path,default=Path('.local/model-benchmark-venv/Scripts/python.exe'))
    p.add_argument('--cache',type=Path,default=Path('C:/Users/praisy/.cache/huggingface/hub'))
    p.add_argument('--server',type=Path,default=Path('C:/Users/praisy/AppData/Local/Microsoft/WinGet/Packages/ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe/llama-server.exe'))
    main(p.parse_args())
