'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {deploymentClients,validateApprovedClient}=require('../agent/access/approvedClients');
const client={client_id:'future-client-fixture',client_name:'Future client fixture',software_id:'future-client',software_version:'1',token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],redirect_uris:['https://example.com/exact-callback']};
test('approved static OAuth metadata is optional, bounded and never broadens defaults',()=>{
 assert.equal(deploymentClients('').length,2);assert.equal(deploymentClients(JSON.stringify([client])).length,3);
 assert.deepEqual(validateApprovedClient(client),client);
 for(const uri of ['https://example.com/*','http://example.com/cb','https://user:pass@example.com/cb','https://example.com/cb?anything=1','https://localhost/cb'])assert.throws(()=>validateApprovedClient({...client,redirect_uris:[uri]}));
 assert.throws(()=>deploymentClients(JSON.stringify([client,client])));
 assert.throws(()=>validateApprovedClient({...client,client_secret:'secret'}));
 assert.throws(()=>validateApprovedClient({...client,token_endpoint_auth_method:'client_secret_post'}));
});
