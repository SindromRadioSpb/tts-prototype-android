'use strict';
// Persist verified source identities, never grades or synthetic successor marks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require('../../public/js/atlas-edition'),{reader}=require('./rc32-context.cjs');
const {W,RM}=reader(),[oldArg,newArg]=process.argv.slice(2);
for(const f of fs.readdirSync(path.join(oldArg,'sections')).filter(f=>f.endsWith('.json'))){
 const old=E.projectCorpus(JSON.parse(fs.readFileSync(path.join(oldArg,'sections',f))),''),file=path.join(newArg,'sections',f),next=JSON.parse(fs.readFileSync(file));
 const purposes={};
 for(const purpose of ['lexical','source_find','term_context','inspection']){
  const ctx=W.sectionContext('a97001rc32',old,RM,purpose==='lexical'?{}:{purpose});
  purposes[purpose]={rows:[...ctx.items].map(([id,it])=>({id,he:String(it.he||''),he_niqqud:String(it.he_niqqud||''),ru:String(it.ru||''),order_index:ctx.order.get(id),text_key:ctx.textKeys.get(id)}))};
  assert.equal(new Set(purposes[purpose].rows.map(r=>r.order_index)).size,ctx.items.size);
 }
 // Store supplier IDs; the normal post-SHA corpus projection converts them.
 next.occurrence_compatibility={...next.occurrence_compatibility,purposes:JSON.parse(JSON.stringify(purposes).replaceAll('a97001rc32','a97001'))};
 fs.writeFileSync(file,JSON.stringify(next));
}
