"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore,TTL}=require('../agent/readTogether/store');
const {createAgentAccessService}=require('../agent/access/service');
const fragment={material_id:'text:one',material_version:'v:one',fragment_id:'row:one',line:0,text:'שלום עולם',selection:{start:0,end:4},timecode:{start_ms:0,end_ms:1000},locale:'he'};
function setup(){let clock=1000000,revoked=false;const store=createStore({now:()=>clock,liveConnection:async(user,connection)=>{if(user!=='user1'||connection!=='connection1'||revoked)throw Object.assign(Error('revoked'),{code:'RT_ACCESS_REVOKED'});}});return {store,advance:n=>clock+=n,revoke:()=>revoked=true};}
const start=store=>store.start('user1',{tab_id:'tab1',connection_id:'connection1',request_key:'request1',context:fragment});
const principal={user_id:'user1',connection_id:'connection1'};
const action=s=>({session_id:s.session_id,state_version:s.state_version,fragment_id:s.context.fragment_id,idempotency_key:'action1',kind:'explanation',body:'Explanation'});
test('real session state and agent proposals: isolation, versions, duplicate, selection and media',async()=>{
 const {store}=setup();const s=await start(store);assert.deepEqual(await start(store),s);
 assert.equal((await store.agent(principal,'read_active_reading_session',{})).context.text,fragment.text);
 await assert.rejects(store.agent({user_id:'other',connection_id:'connection1'},'read_active_reading_session',{session_id:s.session_id}),{code:'RT_UNAVAILABLE'});
 await assert.rejects(store.agent({user_id:'user1',connection_id:'other'},'read_active_reading_session',{}),{code:'RT_UNAVAILABLE'});
 await assert.rejects(store.start('user1',{tab_id:'tab2',connection_id:'connection1',request_key:'r2',context:fragment}),{code:'RT_BUSY'});
 await assert.rejects(store.update('user1',s.session_id,{tab_id:'tab2',state_version:1,context:fragment}),{code:'RT_TAB_CONFLICT'});
 const a=action(s),p=await store.agent(principal,'propose_reading_session_action',a);
 assert.deepEqual(await store.agent(principal,'propose_reading_session_action',a),p);
 await assert.rejects(store.agent(principal,'propose_reading_session_action',{...a,body:'Changed'}),{code:'RT_DUPLICATE_CONFLICT'});
 const result=await store.read('user1',s.session_id,'tab1');assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].signature,undefined);
 const decision={tab_id:'tab1',state_version:1,proposal_id:p.proposal_id,decision:'ACCEPTED'};
 assert.deepEqual(await store.decide('user1',s.session_id,decision),await store.decide('user1',s.session_id,decision));
 const next=await store.update('user1',s.session_id,{tab_id:'tab1',state_version:1,context:{...fragment,material_id:'text:two',fragment_id:'row:two'}});
 assert.equal(next.state_version,2);assert.equal((await store.read('user1',s.session_id,'tab1')).proposals.length,0);
 await assert.rejects(store.agent(principal,'propose_reading_session_action',a),{code:'RT_STALE'});
 await store.stop('user1',s.session_id,{tab_id:'tab1'});await store.stop('user1',s.session_id,{tab_id:'tab1'});
 await assert.rejects(store.agent(principal,'read_active_reading_session',{}),{code:'RT_UNAVAILABLE'});
});
test('expiry, reconnect, revoke, bounded data and malformed context',async()=>{
 const {store,advance,revoke}=setup();let s=await start(store);advance(TTL-1);
 await store.update('user1',s.session_id,{tab_id:'tab1',state_version:1,context:fragment});advance(TTL-1);
 assert.equal((await store.read('user1',s.session_id,'tab1')).state_version,1);
 advance(2);await assert.rejects(store.read('user1',s.session_id,'tab1'),{code:'RT_UNAVAILABLE'});
 s=await start(store);revoke();await assert.rejects(store.agent(principal,'read_active_reading_session',{}),{code:'RT_ACCESS_REVOKED'});
 await store.stop('user1',s.session_id,{tab_id:'tab1'});
 const fresh=setup().store;
 await assert.rejects(fresh.start('user1',{tab_id:'tab1',connection_id:'connection1',request_key:'r',context:{...fragment,text:'x'.repeat(4001)}}),{code:'RT_INVALID'});
 await assert.rejects(fresh.start('user1',{tab_id:'tab1',connection_id:'connection1',request_key:'r',context:{...fragment,selection:{start:5,end:999}}}),{code:'RT_INVALID'});
});
test('stop during async authorization cannot return context',async()=>{
 let wait=null;const store=createStore({liveConnection:async()=>{if(wait)await wait.promise;}});const s=await start(store);
 let release;wait={promise:new Promise(r=>release=r)};const reading=store.agent(principal,'read_active_reading_session',{});
 store.stop('user1',s.session_id,{tab_id:'tab1'});release();await assert.rejects(reading,{code:'RT_UNAVAILABLE'});
});
test('Stop cancels a pending Start and duplicate retry without granting another tenant control',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const store=createStore({liveConnection:()=>gate});
 const creating=start(store);
 store.stopPending('other',{tab_id:'tab1',request_key:'request1'});
 store.stopPending('user1',{tab_id:'tab1',request_key:'request1'});
 release();await assert.rejects(creating,{code:'RT_CANCELLED'});
 await assert.rejects(start(store),{code:'RT_CANCELLED'});
 const next=await store.start('user1',{tab_id:'tab1',connection_id:'connection1',request_key:'request2',context:fragment});
 store.stopPending('other',{tab_id:'tab1',request_key:'request2'});
 assert.equal((await store.read('user1',next.session_id,'tab1')).session_id,next.session_id);
});
test('MCP service validates scope and marshals new tool contracts',async()=>{
 const {store}=setup();const s=await start(store);
 const names=['read_active_reading_session','get_reading_session_fragment','propose_reading_session_action'];
 const service=createAgentAccessService({enabled:true,ownerIds:['user1'],now:()=>1000000,handlers:Object.fromEntries(names.map(n=>[n,(p,a)=>store.agent(p,n,a)]))});
 const p={...principal,oauth_client_id:'test',external_actor_id:'test',request_id:'request',scopes:['read_together.context.read','read_together.action.propose'],connection_status:'ACTIVE',access_expires_at:new Date(2000000).toISOString()};
 assert.equal((await service.execute(p,names[0],{})).ok,true);
 assert.equal((await service.execute({...p,scopes:[]},names[0],{})).error.code,'INSUFFICIENT_SCOPE');
 assert.equal((await service.execute(p,names[1],{session_id:s.session_id,state_version:1,fragment_id:fragment.fragment_id})).ok,true);
 assert.equal((await service.execute(p,names[2],action(s))).ok,true);
 // Minimal read-together grants cannot authorize any older tutor/general tool.
 for(const name of require('../agent/access/capabilities').capabilityNames().filter(n=>!names.includes(n))) {
  assert.equal((await service.execute(p,name,{})).error.code,'INSUFFICIENT_SCOPE',name);
 }
 assert.equal((await service.execute({...p,scopes:['tutor.context.read','tutor.artifact.propose']},names[0],{})).error.code,'INSUFFICIENT_SCOPE');
 assert.equal((await service.execute({...p,user_id:'other'},names[0],{})).error.code,'OWNER_NOT_ALLOWED');
 assert.equal((await service.execute(p,names[0],{session_id:'another-session'})).error.code,'RT_UNAVAILABLE');
});
