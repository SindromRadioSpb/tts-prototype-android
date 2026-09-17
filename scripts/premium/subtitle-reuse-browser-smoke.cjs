// Isolated browser DB; verifies durable identity, not owner-profile data.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({serviceWorkers:'block'});
 await page.addInitScript(()=>{localStorage.setItem('localMode','1');localStorage.setItem('v3OnboardingSeenV1','1');});
 await page.goto('http://localhost:3000/?subtitle-reuse=584');
 const key=await page.evaluate(async()=>{
  const key=await SubtitleMaterialImport.materialImportKey({sourceSha256:'a'.repeat(64),plan:{audio:{index:2},text:{index:7}},tracks:[{index:7,sha256:'b'.repeat(64)}]});
  const db=await ensureLocalDB();
  await db.createText({id:'repeat-fixture',text_key:'repeat-fixture',title:'Subtitle repeat fixture',source_text:'שלום',
   source_meta_json:JSON.stringify({source:{captions:{captions:{origin:'container-track',material_import_key:key}}}})});
  return key;
 });
 await page.reload();await page.waitForFunction(()=>window.SubtitleMaterialImport&&window.ensureLocalDB);
 const result=await page.evaluate(async key=>{
  const db=await ensureLocalDB(),before=await db.dbQuery('SELECT COUNT(*) AS n FROM texts');
  const id=await SubtitleMaterialImport.findSavedMaterial(db,key);
  const after=await db.dbQuery('SELECT COUNT(*) AS n FROM texts');
  return {id,before:before[0].n,after:after[0].n};
 },key);
 assert.equal(result.id,'repeat-fixture');assert.equal(result.before,result.after);console.log(JSON.stringify(result));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
