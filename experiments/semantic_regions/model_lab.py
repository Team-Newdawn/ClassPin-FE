"""Fixed-snapshot model lab. Cached OCR/layout plus fresh local LLM; no DB writes."""
import argparse
import hashlib
import json
import os
import threading
from pathlib import Path
import psutil

from model_benchmark import MODELS, compose, llm_run
from pin_region_mapping import map_deck_anchors
from report_ablation import inputs_for, schema
from run_local_semantic_grouping import sha256_file

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'output/model-benchmark-final-v1'
JOBS = ROOT / 'output/model-lab'


def write(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf8')
    temporary.replace(path)


def dataset(ocr, layout):
    protocol = json.loads((DATA/'protocol.json').read_text(encoding='utf8'))
    question_path = ROOT/'tmp/classpin-soi-3373b744/questions-with-pins.json'
    if sha256_file(question_path) != protocol['questionHash']:
        raise ValueError('DATASET_CHANGED')
    questions = json.loads(question_path.read_text(encoding='utf8'))['questions']
    stages = [json.loads((DATA/k/'result.json').read_text(encoding='utf8')) for k in (ocr, layout)]
    if any(s['status'] != 'complete' or len(s['pages']) != 15 for s in stages):
        raise ValueError('INCOMPLETE_STAGE')
    sources = [{p['pageNumber']: p['sourceSha256'] for p in s['pages']} for s in stages]
    if sources[0] != sources[1] or len(questions) != 17:
        raise ValueError('DATASET_CHANGED')
    return questions, stages


def main(args):
    folder = JOBS / args.job
    meta_path = folder/'meta.json'
    meta = json.loads(meta_path.read_text(encoding='utf8'))
    lock = (JOBS/'inference.lock').open('a+b')
    acquired = False
    timer = None
    try:
        if os.name == 'nt':
            import msvcrt
            lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        acquired = True
        # Hard wall time bound; kill only this runner's descendants.
        def timeout():
            meta.update(status='failed', error='TIME_LIMIT')
            write(meta_path, meta)
            for child in psutil.Process().children(recursive=True):
                try: child.kill()
                except psutil.Error: pass
            os._exit(1)
        timer = threading.Timer(1200, timeout); timer.daemon = True; timer.start()
        questions, (ocr, layout) = dataset(meta['ocr'], meta['layout'])
        profile = MODELS[meta['llm']]
        cache = Path(os.environ.get('HF_HUB_CACHE', str(Path.home()/'.cache/huggingface/hub')))
        model = cache/('models--'+profile['source'].replace('/', '--'))/'snapshots'/profile['revision']/profile['file']
        if not model.is_file() or sha256_file(model) != profile['sha256']:
            raise ValueError('MODEL_MISSING_OR_CHANGED')
        server = Path(os.environ.get('CLASSPIN_LLAMA_SERVER', str(Path(os.environ['LOCALAPPDATA'])/'Microsoft/WinGet/Packages/ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe/llama-server.exe')))
        if not server.is_file(): raise ValueError('LLAMA_SERVER_MISSING')
        deck = compose(ocr, layout)
        mappings = map_deck_anchors(deck, questions)
        requests, descriptors = [], []
        for q, mapping in zip(questions, mappings):
            page = next(p for p in ocr['pages'] if p['pageNumber'] == q['slideNumber'])
            lp = next(p for p in deck['pages'] if p['pageNumber'] == q['slideNumber'])
            prompt, sources, region = inputs_for('C', q, page, mapping, lp)
            requests.append((prompt, schema(q['questionAlias'])))
            descriptors.append((q, mapping, region, sources))
        input_hash = hashlib.sha256(json.dumps(requests, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        result = llm_run(server, model, requests, descriptors, folder/'run.json',
            {'id':args.job, 'ocr':meta['ocr'], 'layout':meta['layout'], 'llm':meta['llm'],
             'inputHash':input_hash, 'cachedPreprocessing':True,
             'stageHashes':{'ocr':sha256_file(DATA/meta['ocr']/'result.json'), 'layout':sha256_file(DATA/meta['layout']/'result.json')}})
        result['pipelineMs'] = result['reportStageMs'] + ocr['processMs'] + layout['processMs']
        result['freshElapsedMs'] = result['reportStageMs']
        result['layoutRegionCounts'] = {str(p['pageNumber']):len(p['regions']) for p in layout['pages']}
        write(folder/'run.json', result)
        meta.update(status='complete' if result['status']=='complete' and len(result['records'])==17 else 'failed', error=None)
    except (OSError, ValueError, KeyError) as error:
        code = str(error)
        allowed = {'DATASET_CHANGED','INCOMPLETE_STAGE','MODEL_MISSING_OR_CHANGED','LLAMA_SERVER_MISSING'}
        meta.update(status='failed', error=code if code in allowed else ('RUN_FAILED' if acquired else 'ANOTHER_RUN_ACTIVE'))
    except Exception:
        meta.update(status='failed', error='RUN_FAILED')
    finally:
        if timer: timer.cancel()
        lock.close()
        write(meta_path, meta)


if __name__ == '__main__':
    import uuid
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True, type=lambda value: str(uuid.UUID(value)))
    main(parser.parse_args())
