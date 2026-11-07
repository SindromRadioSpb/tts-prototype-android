const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../public/js/atlas-edition');
const T = require('../public/js/atlas-train');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
test('RC3.2 is a separate corpus; original pin and learning keys stay unchanged', () => {
 assert.equal(E.pin.revision,'50253381cb255822678b07e0ed41a608a3a701a661527eb796837b2f3ee64edc');
 assert.match(E.base('a97001rc32'), /cea369d4/);
 assert.match(E.base('a97001'), /50253381/);
 assert.notEqual(T.termKey('a97001','a97001:term:force','s1'),T.termKey('a97001rc32','a97001rc32:term:force','s1'));
});
test('native corpus verifies supplier bytes before projecting identities; source IDs and texts retained',async()=>{
 const revision='a'.repeat(64), raw={atlas_id:'a97001',structure_revision:revision,id:'s01-test',pages:[{image:'/data/atlas/a97001/assets/test.png',items:[{id:'a97001:p1:b001',he:'כוח',ru:'Сила',terms:['a97001:term:force#s1']}]}],terms:{'a97001:term:force':{id:'a97001:term:force'}}};
 const bytes=Buffer.from(JSON.stringify(raw)), manifest=Buffer.from(JSON.stringify({schema:'linguistpro.atlas-edition.1',atlas_id:'a97001',structure_revision:revision,files:{'sections/s01-test.json':{bytes:bytes.length,sha256:sha(bytes)}}}));
 const calls=[];let corrupt=false;
 const c=E.createClient('a97001rc32',{pin:{atlas_id:'a97001',revision,manifest_sha256:sha(manifest)},crypto:crypto.webcrypto,fetch:async url=>{calls.push(url);return new Response(url.endsWith('manifest.json')?manifest:corrupt?Buffer.from('{}'):bytes);}});
 const data=await c.json('sections/s01-test.json');assert.equal(data.atlas_id,'a97001rc32');
 assert.equal(data.pages[0].items[0].id,'a97001rc32:p1:b001');assert.equal(data.pages[0].items[0].source_id,raw.pages[0].items[0].id);
 assert.equal(data.pages[0].items[0].he,raw.pages[0].items[0].he);assert.equal(data.pages[0].items[0].ru,'Сила');
 assert(data.terms['a97001rc32:term:force']);assert.match(data.pages[0].image,new RegExp('/a97001/'+revision+'/assets/'));
 assert(calls.every(url=>url.startsWith('/data/atlas-editions/a97001/')));
 const before=calls.length;await assert.rejects(c.contextJson('s01-test.json'),/ATLAS_CONTEXT_ROWS_REQUIRED/);assert.equal(calls.length,before);
 await c.checkLink('sections/s01-test.json',sha(bytes));await assert.rejects(c.checkLink('sections/s01-test.json','b'.repeat(64)),/ATLAS_EDITION_LINK_HASH/);
 corrupt=true;await assert.rejects(c.json('sections/s01-test.json'),/ATLAS_EDITION_FILE_HASH/);
});

test('scoped edition never trains unaccepted formula symbols',()=>{
 const section={activation:{learning_mode:'scoped'},pages:[{page:1,items:[{type:'formula',id:'a97001rc32:p1:f1',vars:[{latex:'F',ru:'Сила'},{latex:'m',ru:'Масса'}]}]}]};
 assert.deepEqual(T.symbolQuestions(section),[]);
});
