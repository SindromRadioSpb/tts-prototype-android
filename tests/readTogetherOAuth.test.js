'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const approved=require('../agent/access/approvedClients');
const profile={client_id:'rt-policy-fixture',client_name:'Disposable fixture',software_id:'rt-test',software_version:'1',token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],redirect_uris:['https://example.com/exact-callback']};
test('approved reading client rejects broad authorization and signed broad bearer before any repository access',async()=>{
 const {generateKeyPair,exportJWK,SignJWT}=await import('jose');
 const {createOidcDeployment}=await import('../agent/access/oidcDeployment.mjs');
 const {createMcpResourceValidator}=await import('../agent/access/mcpResourceValidator.mjs');
 const {privateKey,publicKey}=await generateKeyPair('ES256',{extractable:true});
 const jwk=await exportJWK(privateKey),pub=await exportJWK(publicKey);Object.assign(jwk,{kid:'fixture-rt',alg:'ES256',use:'sig'});Object.assign(pub,{kid:'fixture-rt',alg:'ES256',use:'sig'});
 const clients=approved.deploymentClients(JSON.stringify([profile]));
 assert.deepEqual(approved.allowedScopes(profile.client_id,clients),['read_together.context.read','read_together.action.propose']);
 assert.equal(approved.allowedScopes(clients[0].client_id,clients),null);
 const deployment=createOidcDeployment({issuer:'https://linguistpro.kolosei.com/oauth',privateJwks:{keys:[jwk]},cookieKeys:['fixture-cookie-key-never-production-32'],Adapter:class Adapter{},clients,findAccount:async()=>undefined,interactionUrl:()=>'',principalForToken:async()=>undefined});
 for(const scope of ['tutor.context.read','profile.read','read_together.context.read tutor.artifact.propose']) {
  const response={writeHead(code){this.code=code;},end(text){this.body=JSON.parse(text);}};
  await deployment.nodeHandler({method:'GET',url:'/auth?client_id='+profile.client_id+'&scope='+encodeURIComponent(scope)},response);
  assert.equal(response.code,400);assert.equal(response.body.error,'invalid_scope');
 }
 const previous=process.env.AGENT_ACCESS_OAUTH_APPROVED_CLIENTS_JSON;
 process.env.AGENT_ACCESS_OAUTH_APPROVED_CLIENTS_JSON=JSON.stringify([profile]);
 try {
  const now=Math.floor(Date.now()/1000),resource='https://linguistpro.kolosei.com/agent-access';
  let touched=false;const repo={userForSubject:async()=>{touched=true;throw Error('unexpected');},validateConnectionSnapshot:async()=>{},isAccessTokenDenied:async()=>false};
  const validator=createMcpResourceValidator({keyset:{public_jwks:{keys:[pub]}},repo,issuer:'https://linguistpro.kolosei.com/oauth',resource,allowedClientIds:[profile.client_id],allowedOwnerIds:['owner']});
  const token=await new SignJWT({sub:'fixture',client_id:profile.client_id,connection_id:'fixture',scope:'tutor.context.read',security_epoch:1,subject_epoch:1,jti:'fixture'}).setProtectedHeader({alg:'ES256',kid:'fixture-rt',typ:'at+jwt'}).setIssuer('https://linguistpro.kolosei.com/oauth').setAudience(resource).setIssuedAt(now).setExpirationTime(now+60).sign(privateKey);
  await assert.rejects(validator.validate('Bearer '+token,'fixture'),{code:'AA_MCP_SCOPE_NOT_ALLOWED'});assert.equal(touched,false);
  const {createDefaultOffOAuthRuntime}=await import('../agent/access/oauthRuntime.mjs');
  let repoCalls=0;
  const runtimeRepo=Object.fromEntries(['ensureSubjectForUser','providerPrincipal','providerClientMetadata','providerGrant','validateProviderGrant','revokeProviderGrant','storeProviderAuthorizationCode','findProviderAuthorizationCode','consumeProviderAuthorizationCode','destroyProviderAuthorizationCode','storeInitialProviderRefreshToken','prepareProviderRefreshRotation','completeProviderRefreshRotation','findProviderRefreshToken','revokeProviderRefreshByGrant','revokeProviderRefreshToken'].map(name=>[name,async()=>{repoCalls++;throw Error('unexpected repository access');}]));
  const runtime=await createDefaultOffOAuthRuntime({repo:runtimeRepo,consentCeremony:{},interactionBridge:{},resolveUser:async()=>({id:'another-user'}),privateJwksJson:JSON.stringify({keys:[jwk]}),cookieKeys:['fixture-cookie-key-never-production-32'],limiter:{take:()=>({ok:true})},readingOwnerIds:['owner']});
  runtime.provider.interactionDetails=async()=>({uid:'fixture',params:{client_id:profile.client_id}});
  for(const url of ['/oauth/interaction/fixture','/oauth/interaction/fixture/complete?request_id=fixture']) {
    const response={setHeader(){},end(text){this.body=JSON.parse(text);}};
    await runtime.nodeHandler({originalUrl:url,url,method:'GET'},response);
    assert.equal(response.statusCode,403);assert.equal(response.body.error,'access_denied');
  }
  assert.equal(repoCalls,0,'non-owner cannot create a subject, connection or grant');
 }finally{if(previous===undefined)delete process.env.AGENT_ACCESS_OAUTH_APPROVED_CLIENTS_JSON;else process.env.AGENT_ACCESS_OAUTH_APPROVED_CLIENTS_JSON=previous;}
});
