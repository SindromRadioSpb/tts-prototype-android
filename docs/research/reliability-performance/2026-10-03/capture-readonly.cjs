// Kapture HTTP API, with the extension's per-tab JavaScript permission enforced.
// Run: node <this file> <studio-tab> <room-tab> <mediatheque-tab>
// Uses existing tabs only. No navigation, storage writes, grading or provider calls.
// Output deliberately omits URLs with queries, local material IDs, titles and row contents.
const fs = require('node:fs');
const path = require('node:path');
async function evaluate(tab, code) {
  const response = await fetch('http://localhost:61822/tab/' + encodeURIComponent(tab) + '/evaluate', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code,timeout:20000})
  });
  const result = await response.json();
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.value;
}
async function surface() {
  return { path:location.pathname, visible:document.visibilityState, version:window.APP_VERSION || null,
    nodes:document.querySelectorAll('*').length, scripts:document.scripts.length,
    tables:Array.from(document.querySelectorAll('table')).map(e=>({id:e.id,rows:e.rows.length,visible:!!e.getClientRects().length})).filter(e=>e.rows>5),
    navigation:performance.getEntriesByType('navigation').map(n=>({type:n.type,dclMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,decodedBytes:n.decodedBodySize,transferBytes:n.transferSize})),
    paints:performance.getEntriesByType('paint').map(n=>({name:n.name,ms:n.startTime})),
    resources:performance.getEntriesByType('resource').filter(r=>new URL(r.name).origin===location.origin&&r.startTime<15000)
      .sort((a,b)=>b.duration-a.duration).slice(0,12)
      .map(r=>({path:new URL(r.name).pathname,startMs:r.startTime,ms:r.duration,decodedBytes:r.decodedBodySize,transferBytes:r.transferSize})) };
}
async function studioState() {
  const key='ttsDashboard_session_state_v1';
  const parse = value => { try { return JSON.parse(value); } catch { return null; } };
  const current=parse(sessionStorage.getItem(key)), legacy=parse(localStorage.getItem(key));
  const db=window.__localDB;
  const rows=await db.dbQuery('SELECT * FROM review_log ORDER BY rowid',[]);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rows))))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const p=current?.textId ? await db.getProgress(current.textId) : null;
  const reads=[];
  if(current?.textId) for(let i=0;i<3;i++) {
    const start=performance.now(); await db.getTextByIdLite(current.textId); const metaEnd=performance.now();
    const sentences=await db.getSentences(current.textId);
    reads.push({metaMs:metaEnd-start,sentencesMs:performance.now()-metaEnd,rowCount:sentences.length});
  }
  return {currentMatchesLegacy:!!current?.textId&&current.textId===legacy?.textId,
    legacyUpdatedAt:legacy?.updatedAt,currentUpdatedAt:current?.updatedAt,
    migrationMarker:sessionStorage.getItem('studio.tabDraftMigrated.v1'),ownership:db.getOwnershipState?.(),
    progress:p?{lastRow:p.last_row_idx,updatedAt:p.updated_at}:null,
    review:{count:rows.length,sha256:hash},reads};
}
(async()=>{
  const [studio,room,media]=process.argv.slice(2);
  if(!studio||!room||!media)throw new Error('Provide the three existing Kapture tab IDs');
  const report={sourceCommit:'9d1d11e7',capturedAt:new Date().toISOString(),
    evidence:'existing desktop owner tabs; retrospective resource timings, not controlled cold load or p95',surfaces:{}};
  report.studioStateBefore=await evaluate(studio,'('+studioState.toString()+')()');
  for(const [name,tab] of [['studio',studio],['room',room],['mediatheque',media]]) report.surfaces[name]=await evaluate(tab,'('+surface.toString()+')()');
  report.studioStateAfter=await evaluate(studio,'('+studioState.toString()+')()');
  report.reviewUnchanged=report.studioStateBefore.review.sha256===report.studioStateAfter.review.sha256;
  fs.writeFileSync(path.join(__dirname,'owner-readonly-evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({reviewUnchanged:report.reviewUnchanged,studioState:report.studioStateAfter,
    surfaces:Object.fromEntries(Object.entries(report.surfaces).map(([k,v])=>[k,{nodes:v.nodes,tables:v.tables}]))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
