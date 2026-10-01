"use strict";
const C=require('./oauthContracts');
const {FIXTURE_CLIENTS,validateFixtureClient}=require('./oauthDeploymentContracts');
const READ_TOGETHER_SCOPES=Object.freeze(['read_together.context.read','read_together.action.propose']);
// New operator-approved clients are restricted to active reading. Legacy
// Hermes/Inspector retain their existing scopes and authorization behavior.
function allowedScopes(clientId,clients=deploymentClients()) {
  if(!clients.some(c=>c.client_id===clientId)||FIXTURE_CLIENTS.some(c=>c.client_id===clientId))return null;
  return READ_TOGETHER_SCOPES;
}
// Operator-reviewed metadata only. No registration, credentials or grant writes.
function validateApprovedClient(value) {
  if(FIXTURE_CLIENTS.some(c=>c.client_id===value?.client_id))return validateFixtureClient(value);
  const x=C.closed(value,['client_id','client_name','software_id','software_version','token_endpoint_auth_method','grant_types','response_types','redirect_uris']);
  C.safeId(x.client_id);C.bounded(x.client_name,120);C.safeId(x.software_id);C.bounded(x.software_version,64);
  if(x.token_endpoint_auth_method!=='none'||JSON.stringify(x.grant_types)!=='["authorization_code","refresh_token"]'||JSON.stringify(x.response_types)!=='["code"]')C.fail('AA_OAUTH_BAD_CLIENT');
  if(!Array.isArray(x.redirect_uris)||!x.redirect_uris.length||x.redirect_uris.length>4||new Set(x.redirect_uris).size!==x.redirect_uris.length)C.fail('AA_OAUTH_BAD_REDIRECT_URIS');
  for(const uri of x.redirect_uris){C.redirectUri(uri);const u=new URL(uri);if(u.protocol!=='https:'||u.search||uri.includes('*')||u.hostname==='localhost'||u.hostname==='127.0.0.1')C.fail('AA_OAUTH_BAD_REDIRECT_URI');}
  return Object.freeze(structuredClone(x));
}
function deploymentClients(json=process.env.AGENT_ACCESS_OAUTH_APPROVED_CLIENTS_JSON) {
  if(!json)return FIXTURE_CLIENTS;
  if(typeof json!=='string'||Buffer.byteLength(json)>8192)C.fail('AA_OAUTH_BAD_CLIENT');
  let values;try{values=JSON.parse(json);}catch(_){C.fail('AA_OAUTH_BAD_CLIENT');}
  if(!Array.isArray(values)||values.length>4)C.fail('AA_OAUTH_BAD_CLIENT');
  const clients=[...FIXTURE_CLIENTS,...values.map(validateApprovedClient)];
  if(new Set(clients.map(c=>c.client_id)).size!==clients.length)C.fail('AA_OAUTH_BAD_CLIENT');
  return Object.freeze(clients);
}
module.exports={validateApprovedClient,deploymentClients,allowedScopes,READ_TOGETHER_SCOPES};
