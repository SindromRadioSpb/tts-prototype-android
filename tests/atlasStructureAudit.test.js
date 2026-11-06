'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
function audit(item,groups=[]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-structure-audit-'));
 try{
  fs.mkdirSync(path.join(dir,'sections'));
  fs.writeFileSync(path.join(dir,'sections/s01.json'),JSON.stringify({id:'s01',translated:true,pages:[{page:1,items:[{id:'a97001:p1:b001',type:'block',kind:'prose',...item}],legacy_groups:groups,figures:[],tables:[],editor:[]}]}));
  const out=path.join(dir,'findings.json'),r=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/atlas/audit-reader.cjs'),dir,'--json',out],{encoding:'utf8'});
  assert.equal(r.error,undefined);assert(fs.existsSync(out),r.stderr);
  return {status:r.status,findings:JSON.parse(fs.readFileSync(out)),dispositions:JSON.parse(fs.readFileSync(out+'.dispositions.json'))};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('audit still rejects an active blank source and an undisclosed translation omission',()=>{
 assert.equal(audit({he:'',ru:'Translation'}).status,1);
 const r=audit({he:'מקור',ru:'',training_eligible:false,structure:{parent_ref:'missing'}});
 assert(r.findings.some(f=>f.rule==='1.6'));assert.deepEqual(r.dispositions,[]);
});
test('source-only editorial context is separately disclosed, never passed off as a translated learning row',()=>{
 const r=audit({he:'',ru:'Existing editorial explanation',kind:'editor_note',training_eligible:false,structure:{parent_ref:'old'}});
 assert.equal(r.status,0);assert.deepEqual(r.findings,[]);assert.equal(r.dispositions.length,1);assert.equal(r.dispositions[0].missing_he,true);assert.equal(r.dispositions[0].training_eligible,false);
});
test('a held group can disclose an absent translation without suppressing active source checks',()=>{
 const r=audit({he:'מקור',ru:'',training_eligible:false,structure:{parent_ref:'old'}},[{id:'old',children:['a97001:p1:b001'],review_status:'needs_review',review_notes:['Review required'],original:{he:'מקור',ru:''}}]);
 assert.equal(r.status,0);assert.equal(r.dispositions.length,1);
});
