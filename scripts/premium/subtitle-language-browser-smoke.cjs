// Both product table renderers; synthetic metadata, no learner state or providers.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({serviceWorkers:'block'});
 await page.addInitScript(()=>{localStorage.setItem('localMode','1');localStorage.setItem('v3OnboardingSeenV1','1');});
 await page.goto('http://localhost:3000/?subtitle-language=582');
 for(const locale of ['ru','he'])for(const width of [380,1280]){
  await page.setViewportSize({width,height:900});
  const proof=await page.evaluate(async locale=>{
   appSetLocale(locale);
   const rows=['other','target_assumed','unknown'].map(speech_language=>({he:'שלום',he_niqqud:'שָׁלוֹם',ru:'Привет',translit:'shalom',translation_meta_json:JSON.stringify({provider:'subtitle-track',speech_language})}));
   const before=JSON.stringify(rows);renderTable(rows);
   const studio=document.querySelector('#tableContainer table').cloneNode(true);
   const reader=await import('/js/reader-core.js?badge-smoke=582');
   const room=reader.buildBilingualTableHtml(rows,{tableId:'room-badge-fixture',t:key=>window.t?.(key)||key});
   let box=document.getElementById('subtitle-badge-fixture');if(box)box.remove();
   box=document.createElement('div');box.id='subtitle-badge-fixture';
   box.style.cssText='position:fixed;inset:40px 8px auto;z-index:2147483647;background:white;color:#17232b;padding:8px;overflow:auto;max-height:80vh';
   box.append(studio);box.insertAdjacentHTML('beforeend',room);document.body.append(box);
   ReaderMorph.attach(box,{getRow:index=>rows[index],cellSelector:'tbody td[data-col="he"],tbody td[data-col="niqqud"]'});
   return {badges:box.querySelectorAll('[data-speech-language="other"]').length,unchanged:JSON.stringify(rows)===before,
    cellText:[...box.querySelectorAll('td[data-col="he"]')].map(cell=>cell.textContent)};
  },locale);
  assert.equal(proof.badges,2);assert.equal(proof.unchanged,true);
  assert.ok(proof.cellText.every(text=>text==='שלום'));
  await page.locator('#subtitle-badge-fixture').screenshot({path:`.tmp/subtitle-language-${locale}-${width}.png`});
  console.log(JSON.stringify({locale,width,...proof}));
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
