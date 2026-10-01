'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {protectedReadTogetherResourceMetadata,protectedTutorResourceMetadata}=require('../agent/access/oauthDeploymentContracts');
const {routeClass,createOAuthDefaultOffGate,PROTECTED_READ_TOGETHER_RESOURCE_METADATA_PATH:path}=require('../agent/access/oauthDefaultOffGate');
test('dedicated discovery advertises exactly two active-reading scopes and fails closed',async()=>{
 const metadata=protectedReadTogetherResourceMetadata();
 assert.deepEqual(metadata.scopes_supported,['read_together.context.read','read_together.action.propose']);
 assert(protectedTutorResourceMetadata().scopes_supported.every(s=>!s.startsWith('read_together.')));
 assert.equal(routeClass(path,'GET'),'discovery');assert.equal(routeClass(path+'?broaden=true','GET'),null);
 const req={originalUrl:path,url:path,method:'GET',headers:{host:'linguistpro.kolosei.com'},socket:{encrypted:true}};
 const response=()=>({code:200,status(n){this.code=n;return this;},json(x){this.body=x;return this;}});
 let res=response();await createOAuthDefaultOffGate({resolveFlags:async()=>({ui:'0',oauth:'0',clients:'0'})})(req,res);assert.equal(res.code,404);
 res=response();await createOAuthDefaultOffGate({resolveFlags:async()=>({ui:'1',oauth:'1',clients:'0'}),getRuntime:async()=>({nodeHandler(){throw Error('must not dispatch');}})})(req,res);assert.equal(res.code,200);assert.deepEqual(res.body,metadata);
});
