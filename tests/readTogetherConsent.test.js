'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const testDb=require('../scripts/premium/lib/cp0-test-db');
const oauthRepo=require('../db/agentAccessOAuthRepo'),identity=require('../db/identityRepo');
const {CONSENT_VERSION,RETENTION_NOTICE_VERSION}=require('../agent/access/consentCeremony');
const {createConsentGuard}=require('../agent/readTogether/consentGuard');
const {createStore}=require('../agent/readTogether/store');
const scopes=['tutor.context.read','tutor.artifact.propose'];
const context={material_id:'local:fixture',material_version:'v:fixture',fragment_id:'row:fixture',line:0,text:'only explicit fixture',selection:null,timecode:null,locale:'en'};

test('real consent/grant database: tenant, latest consent, revoke/regrant and client status',async()=>{
 const db=await testDb.setup('cp0-read-together-consent');
 try{
  await oauthRepo.registerClientFixture({oauth_client_id:'rt-client',display_name:'Disposable test client',software_id:'rt-test',software_version:'1',redirect_uris:['https://example.com/exact-callback'],registration_version:'rt-test-v1'});
  await oauthRepo.createSubjectMapping('u1','rt-subject','rt-subject-v1');
  await oauthRepo.createPendingConnection('u1',{connection_id:'rt-connection',oauth_client_id:'rt-client',display_label:'Test',consent_version:CONSENT_VERSION,capability_version:'aa-v0.1',retention_notice_version:RETENTION_NOTICE_VERSION});
  for(const scope of scopes)await identity.recordConsent('u1','external_agent_access:rt-connection:'+scope,true,CONSENT_VERSION);
  await oauthRepo.activateConnectionWithGrants('u1','rt-connection',scopes);
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
