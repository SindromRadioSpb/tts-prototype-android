const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../public/js/learning-material-task');
const input={source_text:'שלום',title:'Greeting',provider:'gemini'};
function memory(){const rows=new Map();return {add:async j=>(rows.set(j.id,structuredClone(j)),j),get:async id=>structuredClone(rows.get(id)),update:async(id,fn)=>{const j=fn(structuredClone(rows.get(id)));rows.set(id,structuredClone(j));return j;}};}
test('task journal refuses credentials and learning profile',async()=>{await assert.rejects(T.create({...input,import_meta:{apiKey:'secret'}}),/PRIVATE_DATA/);await assert.rejects(T.create({...input,import_meta:{review_log:[]}}),/PRIVATE_DATA/);});
for(const failAt of ['translate','save','preparePackage'])test('resume after '+failAt+' failure reuses completed stages',async()=>{
  const store=memory(),job=await T.create(input);await store.add(job);let failing=true;const calls={translate:0,save:0,preparePackage:0};
  const ops={translate:async()=>({rows:[{he:'שלום',ru:'Привет'}]}),save:async j=>({id:j.id}),preparePackage:async()=>({sha256:'a'.repeat(64)})};
  for(const k of Object.keys(ops)){const original=ops[k];ops[k]=async(...args)=>{calls[k]++;if(k===failAt&&failing){failing=false;throw new Error('injected');}return original(...args);};}
  const runner=T.createRunner(store,ops);await assert.rejects(runner.run(job.id),/injected/);await runner.run(job.id);
  assert.equal((await store.get(job.id)).state,'ready');assert.equal(calls[failAt],2);for(const k of Object.keys(calls).filter(k=>k!==failAt))assert.equal(calls[k],1);
});
test('cancel during translation retains result and prevents saving; explicit resume uses result',async()=>{
  const store=memory(),job=await T.create(input);await store.add(job);let translate=0,save=0,runner;
  runner=T.createRunner(store,{translate:async()=>{translate++;await runner.cancel(job.id);return {rows:[{he:'שלום'}]};},save:async j=>(save++,{id:j.id}),preparePackage:async()=>({sha256:'b'.repeat(64)})});
  await runner.run(job.id);assert.equal(save,0);assert.equal((await store.get(job.id)).state,'cancelled');await runner.run(job.id);assert.equal(translate,1);assert.equal(save,1);
});
