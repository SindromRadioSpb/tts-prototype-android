'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const testDb=require('../scripts/premium/lib/cp0-test-db');
const oauthRepo=require('../db/agentAccessOAuthRepo'),identity=require('../db/identityRepo');
const {CONSENT_VERSION,RETENTION_NOTICE_VERSION,createConsentCeremony}=require('../agent/access/consentCeremony');
const {createConsentGuard}=require('../agent/readTogether/consentGuard');
const {createStore}=require('../agent/readTogether/store');
const scopes=['read_together.context.read','read_together.action.propose'];
const context={material_id:'local:fixture',material_version:'v:fixture',fragment_id:'row:fixture',line:0,text:'only explicit fixture',selection:null,timecode:null,locale:'en'};

test('real consent/grant database: tenant, latest consent, revoke/regrant and client status',async()=>{
 const db=await testDb.setup('cp0-read-together-consent');
 try{
  await oauthRepo.registerClientFixture({oauth_client_id:'rt-client',display_name:'Disposable test client',software_id:'rt-test',software_version:'1',redirect_uris:['https://example.com/exact-callback'],registration_version:'rt-test-v1'});
  await oauthRepo.createSubjectMapping('u1','rt-subject','rt-subject-v1');
  await oauthRepo.createPendingConnection('u1',{connection_id:'rt-connection',oauth_client_id:'rt-client',display_label:'Test',consent_version:CONSENT_VERSION,capability_version:'aa-v0.1',retention_notice_version:RETENTION_NOTICE_VERSION});
  const ceremony=createConsentCeremony({oauthRepo,recordConsent:identity.recordConsent});
  await ceremony.stageTrustedRequest('u1',{request_id:'rt-consent',oauth_client_id:'rt-client',client_display_name:'Disposable test client',redirect_uri:'https://example.com/exact-callback',resource_uri:require('../agent/access/oauthContracts').RESOURCE_URI,requested_scopes:scopes,pkce_method:'S256',connection_id:'rt-connection',consent_version:CONSENT_VERSION,capability_version:'aa-v0.1',retention_notice_version:RETENTION_NOTICE_VERSION,expires_at:new Date(Date.now()+300000).toISOString()});
  const preview=ceremony.preview('u1','rt-consent');
  assert.deepEqual(preview.requested_scopes.map(x=>x.scope).sort(),scopes.slice().sort());
  assert(preview.requested_scopes.every(x=>x.retention_tier==='PERSONAL'));
  assert.throws(()=>ceremony.preview('u2','rt-consent'),{code:'AA_CONSENT_REQUEST_NOT_FOUND'});
  await assert.rejects(ceremony.decide('u1',{request_id:'rt-consent',decision:'approve',selected_scopes:[...scopes,'tutor.context.read'],retention_ack:true}),{code:'AA_CONSENT_APPROVAL_INVALID'});
  await assert.rejects(ceremony.decide('u1',{request_id:'rt-consent',decision:'approve',selected_scopes:scopes,retention_ack:false}),{code:'AA_CONSENT_APPROVAL_INVALID'});
  await ceremony.decide('u1',{request_id:'rt-consent',decision:'approve',selected_scopes:scopes,retention_ack:true});
  assert.deepEqual((await oauthRepo.loadConnection('u1','rt-connection')).grants.map(x=>x.scope).sort(),scopes.slice().sort());
  // Neither an old tutor grant nor a scope from another owner is inherited.
  await assert.rejects(createConsentGuard({oauthRepo,getDb:()=>db.db})('u1','rt-connection','tutor.context.read'),{code:'RT_ACCESS_REVOKED'});
  const liveConnection=createConsentGuard({oauthRepo,getDb:()=>db.db});
  await liveConnection('u1','rt-connection',scopes[0]);
  await assert.rejects(liveConnection('u2','rt-connection',scopes[0]),{code:'RT_ACCESS_REVOKED'});
  const store=createStore({liveConnection});const input={tab_id:'rt-tab',connection_id:'rt-connection',request_key:'rt-key',context};
  const s=await store.start('u1',input);const p={user_id:'u1',connection_id:'rt-connection'};
  assert.equal((await store.agent(p,'read_active_reading_session',{})).context.text,context.text);
  // Deterministic same-timestamp reversal, including IDs sorted in the opposite order.
  await db.run("INSERT INTO consent_records(id,user_id,consent_key,granted,consent_version,created_at) VALUES ('zz-granted','u1',?,1,?,'2099-01-01T00:00:00Z'),('aa-revoked','u1',?,0,?,'2099-01-01T00:00:00Z')",['external_agent_access:rt-connection:'+scopes[0],CONSENT_VERSION,'external_agent_access:rt-connection:'+scopes[0],CONSENT_VERSION]);
  await assert.rejects(store.agent(p,'read_active_reading_session',{}),{code:'RT_ACCESS_REVOKED'});
  await db.run("INSERT INTO consent_records(id,user_id,consent_key,granted,consent_version,created_at) VALUES ('ab-regranted','u1',?,1,?,'2099-01-01T00:00:00Z')",['external_agent_access:rt-connection:'+scopes[0],CONSENT_VERSION]);
  await liveConnection('u1','rt-connection',scopes[0]);
  await assert.rejects(store.agent(p,'read_active_reading_session',{session_id:s.session_id}),{code:'RT_UNAVAILABLE'});
  const next=await store.start('u1',{...input,request_key:'rt-key-next'});
  // Revocation/regrant between calls also changes the authority revision and cannot revive the old session.
  await db.run("INSERT INTO consent_records(id,user_id,consent_key,granted,consent_version,created_at) VALUES ('ac-regranted','u1',?,1,?,'2099-01-01T00:00:00Z')",['external_agent_access:rt-connection:'+scopes[0],CONSENT_VERSION]);
  await assert.rejects(store.agent(p,'read_active_reading_session',{session_id:next.session_id}),{code:'RT_ACCESS_REVOKED'});
  const last=await store.start('u1',{...input,request_key:'rt-key-last'});
  await oauthRepo.setClientStatus('rt-client','REVOKED');
  await assert.rejects(store.read('u1',last.session_id,'rt-tab'),{code:'RT_ACCESS_REVOKED'});
 }finally{await testDb.cleanup(db);}
});
