const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const result={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_model/model-lab.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:result,URL});
test('all 27 allowed combinations validate; unknown model and path injection fail',()=>{
  let count=0;
  for(const [ocr] of result.labModels.ocr)for(const [layout] of result.labModels.layout)for(const [llm] of result.labModels.llm){assert.equal(result.validLabSelection({ocr,layout,llm}),true);count++;}
  assert.equal(count,27);
  for(const value of [null,{}, {ocr:'../../secret',layout:'ppv3',llm:'qwen4'},{ocr:'tesseract',layout:'sam',llm:'qwen4'}])assert.equal(result.validLabSelection(value),false);
});
test('development loopback and same origin required; production and remote DB denied',()=>{
  const req=(url,headers={})=>new Request(url,{headers:{host:new URL(url).host,...headers}});
  const local='http://127.0.0.1:3000/api/dev/model-lab';const db='http://127.0.0.1:55321';
  assert.equal(result.labLocalRequest(req(local),'development',db),true);
  assert.equal(result.labLocalRequest(req('http://localhost:3000/api/dev/model-lab',{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}),'development',db),true);
  assert.equal(result.labLocalRequest(req(local,{host:'127.0.0.1:4000'}),'development',db),false);
  assert.equal(result.labLocalRequest(req(local),'production',db),false);
  assert.equal(result.labLocalRequest(req(local),'development','https://remote.supabase.co'),false);
  assert.equal(result.labLocalRequest(req(local,{origin:'https://evil.example'}),'development',db),false);
  assert.equal(result.labLocalRequest(req(local,{'sec-fetch-site':'cross-site'}),'development',db),false);
  assert.equal(result.labLocalRequest(req(local,{host:'evil.example'}),'development',db),false);
});
