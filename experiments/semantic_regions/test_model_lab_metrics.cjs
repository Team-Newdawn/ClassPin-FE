const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const model={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_model/model-lab-metrics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:model});
const cached={status:'complete',processMs:12000,peakRssMiB:100,pages:Array(15).fill({})};
test('cache times stay historical; local fee is zero but operating cost unknown',()=>{
 const m=model.modelLabMetrics({mode:'cached',status:'complete',createdAt:'2026-09-08T00:00:00Z'},cached,cached,{reportStageMs:30000,records:[]});
 assert.equal(m.stages[0].status,'cached');assert.equal(m.stages[0].measuredMs,12000);
 assert.equal(m.stages[2].status,'cached');assert.equal(m.requestElapsedMs,null);
 assert.equal(m.apiCostKrw,0);assert.equal(m.operatingCostKrw,null);
});
test('running partial metrics update without inventing final duration or memory',()=>{
 const m=model.modelLabMetrics({mode:'fresh',status:'running',createdAt:'2026-09-08T00:00:00Z'},cached,cached,{promptTokens:100,records:[{alias:'Q001',page:2,elapsedMs:2300,displayable:false}]},Date.parse('2026-09-08T00:00:05Z'));
 assert.equal(m.requestElapsedMs,5000);assert.equal(m.stages[2].measuredMs,null);
 assert.equal(m.stages[2].peakRssMiB,null);assert.equal(m.stages[2].completed,1);
 assert.equal(m.pins[0].elapsedMs,2300);assert.equal(m.pins[0].passed,false);
});
test('failure and missing metrics are not represented as successful zero-duration runs',()=>{
 const m=model.modelLabMetrics({mode:'fresh',status:'failed',createdAt:'bad'},null,null,{reportStageMs:NaN,peakRssMiB:-1});
 assert.equal(m.stages[0].status,'unavailable');assert.equal(m.stages[2].status,'failed');
 assert.equal(m.stages[2].measuredMs,null);assert.equal(m.stages[2].peakRssMiB,null);
 assert.equal(model.labSeconds(null),'미측정');assert.equal(model.labSeconds(0),'0초');
});
