'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseHTML}=require('linkedom');const {window,document}=parseHTML('<html><body></body></html>');global.window=window;global.document=document;
window.indexedDB=undefined;window.ReaderMorph=require('../public/js/reader-morph');require('../public/js/word-gloss-ai');
const AI=window.WordGlossAI,W=require('../public/js/atlas-words'),C=require('../public/js/atlas-context-contract'),A=require('../public/js/atlas-context-addressed'),L=require('../public/js/atlas-context-rc32-loader'),E=require('../public/js/atlas-edition');
const root=path.join(__dirname,'../atlas-context/a97001rc32',E.contextPinFor('a97001rc32')),read=n=>fs.readFileSync(path.join(root,n)),map=JSON.parse(read('addressed-map.json')),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const opts={purpose:A.PURPOSE,bytes:read('addressed-map.json'),sha256:sha(read('addressed-map.json')),editionRevision:E.pinFor('a97001rc32').revision,sourcePdfSha256:E.rc32SourceBinding.source_pdf_sha256,sourceOverlayManifestSha256:E.rc32SourceBinding.source_overlay_manifest_sha256,contract:C,ai:AI,crypto:crypto.webcrypto};
const answer=e=>JSON.parse(read(e.section+'.json')).rows.find(r=>r.row_id===e.row_id);
const fetch=async url=>new Response(read(url.split('/').pop()));
test('all 263 addressed rows retain strict guards, offsets, and unknown-row rejection',async()=>{
 const a=await A.create(opts);let mutations=0,lookups=0;
 for(const e of map.entries){assert.equal(a.describe([e.guard]).length,1);
  for(const prop of ['id','he','he_niqqud','ru','order_index','source_context','edition']){
   const bad=clone(e.guard);if(prop==='source_context')bad.source_context.reviewed_terms=[{id:'changed'}];else if(prop==='edition')bad.source_context.structure_revision='0'.repeat(64);else bad[prop]=prop==='order_index'?bad[prop]+1:bad[prop]+'א';
   assert.throws(()=>a.describe([bad]),/ATLAS_ADDRESSED/);mutations++;
  }
  const r=answer(e);if(r)for(let i=0;i<e.source_words.length;i++){assert(a.lookup(e.guard,r,'he',i).gloss);lookups++;}
 }
 assert.equal(mutations,1841);assert.equal(lookups,3782); // RC3.3: 7 rows with corrected source text carry no prepared reading
 const e=map.entries[0],bad=clone(e.guard);bad.id='a97001rc32:p999:unknown';assert.throws(()=>a.describe([bad]),/UNKNOWN_ROW/);
 const arow=answer(e);assert.throws(()=>a.lookup(e.guard,arow,'he',9999),/RANGE/);assert.throws(()=>a.lookup(e.guard,arow,'niqqud',-1),/INDEX/);
});
test('adapter rejects wrong hash, edition, overlay, purpose, PDF and malformed segment offsets',async()=>{
 for(const extra of [{sha256:'0'.repeat(64)},{editionRevision:'0'.repeat(64)},{sourceOverlayManifestSha256:'0'.repeat(64)},{purpose:'lexical'},{sourcePdfSha256:'0'.repeat(64)}])await assert.rejects(A.create({...opts,...extra}),/ATLAS_ADDRESSED/);
 const doc=clone(map);doc.entries[0].segments[0].pointed_to=999;const bytes=Buffer.from(JSON.stringify(doc));await assert.rejects(A.create({...opts,bytes,sha256:sha(bytes)}),/ATLAS_ADDRESSED/);
});
test('loader rejects bad pins, every source binding and corrupt manifest/map/layer without fallback',async()=>{
 for(const key of ['edition_revision','edition_manifest_sha256','source_pdf_sha256','ai_dependencies_sha256','source_overlay_manifest_sha256']){
  const l=L.create({contextPin:E.contextPinFor('a97001rc32'),sourceBinding:{...E.rc32SourceBinding,[key]:'0'.repeat(64)},contract:C,ai:AI,addressed:A,fetch});await assert.rejects(l.load('s00-front',[]),/SOURCE/);
 }
 for(const name of ['manifest.json','addressed-map.json','s00-front.json']){
  const l=L.create({contextPin:E.contextPinFor('a97001rc32'),sourceBinding:E.rc32SourceBinding,contract:C,ai:AI,addressed:A,fetch:async url=>new Response(Buffer.concat([read(url.split('/').pop()),Buffer.from(url.endsWith('/'+name)?' ':'')]))});await assert.rejects(l.load('s00-front',[]),/HASH|SIZE/);
 }
 const l=L.create({contextPin:'0'.repeat(64),sourceBinding:E.rc32SourceBinding,fetch});await assert.rejects(l.manifest(),/MANIFEST_HASH/);
});
test('contract rejects changed revision, row, order, counts, MWE, provenance and uncertainty without reason',async()=>{
 const e=map.entries.find(e=>answer(e)),a=await A.create(opts),expected=a.describe([e.guard]),revision=await C.revision(expected),valid={schema:AI.LAYER_SCHEMA,contract:C.CONTRACT,atlas:'a97001rc32',section:e.section,source_revision:revision,coverage_mode:'complete',provenance:{kind:'prepared_ai',producer:'fixture',review_scope:'technical'},rows:[clone(answer(e))]};
 const check=l=>C.validate(l,expected,{atlas:'a97001rc32',section:e.section,revision});assert(check(valid).ok);
 for(const mutate of [l=>l.source_revision='0'.repeat(64),l=>l.atlas='a97001',l=>l.rows[0].row_id+='x',l=>l.rows[0].key+='x',l=>l.rows[0].order_index++,l=>l.rows[0].glosses.pop(),l=>l.rows[0].mwe=[{from:0,to:999,gloss:'сломано'}],l=>l.provenance=null,l=>{l.rows[0].glosses[0].uncertain=true;delete l.rows[0].glosses[0].reason}]){const bad=clone(valid);mutate(bad);assert(!check(bad).ok);}
 const uncertain=clone(valid);uncertain.rows[0].mwe=[{from:0,to:0,gloss:'?',uncertain:true,reason:'Источник неясен'}];assert(check(uncertain).ok);assert(a.lookup(e.guard,uncertain.rows[0],'he',0).uncertain);assert(a.lookup(e.guard,uncertain.rows[0],'niqqud',0).reason.includes('Источник неясен'));
 const expected2=[...expected,{...expected[0],id:expected[0].id+'2',order_index:expected[0].order_index+1}];const reordered=clone(valid);reordered.rows.push({...clone(valid.rows[0]),row_id:expected2[1].id,order_index:expected2[1].order_index});reordered.rows.reverse();assert(C.validate(reordered,expected2,{atlas:'a97001rc32',section:e.section,revision}).errors.some(e=>e.code==='row_order'));
});
test('HE expanded span uses mapped gloss, manual corrections win; corpus caches and SRS keys stay isolated',async()=>{
 const a=await A.create(opts),e=map.entries.find(e=>e.segments.some(s=>s.pointed_to>s.pointed_from)&&answer(e));const row=e.guard,r=answer(e),s=e.segments.find(s=>s.pointed_to>s.pointed_from);
 const ctx={atlasId:'a97001rc32',items:new Map([[row.id,{...row,type:row.row_type}]]),order:new Map([[row.id,row.order_index]]),preparedContext:{adapter:a,answers:new Map([[row.id,r]])}};
 const el=document.createElement('div');el.setAttribute('data-ref',row.id);W.bindGlossRow(el,ctx);
 const p=AI.rowPayloadFromData(row),old=AI.rowPayloadFromData({...row,id:row.id.replace('a97001rc32:','a97001:')});assert.notEqual(p.storageKey,old.storageKey);assert.equal(p.key,old.key);
 AI._mem.clear();AI._mem.set(p.key,{glosses:r.glosses.map(()=>({gloss:'чужая общая правка',manual:true})),mwe:[]});await AI.hydrateDataRows([row]);assert(!AI._mem.has(p.storageKey));
 AI._mem.set(p.storageKey,{glosses:r.glosses.map((g,i)=>i===s.pointed_from?{...g,gloss:'моя правка',manual:true}:g),mwe:r.mwe});const before=JSON.stringify([...AI._mem]);
 assert(AI.wordAt(el,s.source_from,'he').gloss.includes('моя правка'));assert(AI.wordAt(el,s.source_from,'he').manual);assert.equal(AI.wordAt(el,s.pointed_from,'niqqud').gloss,'моя правка');assert.equal(JSON.stringify([...AI._mem]),before);
 ctx.preparedContext={adapter:a,answers:new Map()};assert.equal(AI.wordAt(el,s.pointed_from,'niqqud').gloss,'моя правка');ctx.preparedContext=null;assert.equal(AI.wordAt(el,s.pointed_from,'niqqud').gloss,'моя правка');
 const T=require('../public/js/atlas-train');assert.notEqual(T.termKey('a97001','a97001:term:force','s1'),T.termKey('a97001rc32','a97001rc32:term:force','s1'));
});
