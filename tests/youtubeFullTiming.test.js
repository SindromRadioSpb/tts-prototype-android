const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../public/js/youtube-full-timing');
const source={video_id:'cPooKT5rFxc',url:'https://www.youtube.com/watch?v=cPooKT5rFxc',durationSec:150};
const rows=[{text:'שלום עולם חדש היום',startSec:null,endSec:null},{text:'אנחנו לומדים כאן עכשיו',startSec:125,endSec:129}];
const response=x=>({ok:true,text:async()=>JSON.stringify(x)});
test('full plan covers the entire video with overlapping boundaries',()=>{const p=F.plan(701);assert.equal(p.length,7);assert.equal(p[0].startSec,0);assert.equal(p.at(-1).endSec,701);p.slice(1).forEach((w,i)=>assert.ok(w.startSec<p[i].endSec));});
test('collect rejects invalid speech, missing ends and conflicting observations',()=>{
  const e={timeline:rows,calls:[{state:'complete',window:{startSec:0,endSec:120},segments:[{row:1,startSec:2,endSec:5,heard:rows[0].text}]}]};
  assert.equal(F.collect(e).coverage.playable,2);
  e.calls[0].segments[0].heard='not the speech';assert.equal(F.collect(e).coverage.playable,1);
  e.calls[0].segments[0].heard=rows[0].text;e.calls.push({state:'complete',window:{startSec:0,endSec:120},segments:[{row:1,startSec:30,endSec:33,heard:rows[0].text}]});assert.equal(F.collect(e).coverage.playable,1);
});
test('quote counts input without generating; paid calls persist first, resume never repeats',async()=>{
  let generated=0,saved=null;const deps={apiKey:'fixture',fetch:async(url,opts)=>{
    if(url.endsWith(':countTokens'))return response({totalTokens:1000});
    assert.equal(saved.calls.at(-1).state,'pending-charge-unknown');generated++;
    const body=JSON.parse(opts.body);assert.equal(body.generationConfig.maxOutputTokens,8192);
    return response({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({segments:[{row:1,startSec:2,endSec:5,heard:rows[0].text}]})}]}}]});
  }};
  const q=await F.estimate(deps,source,rows);assert.equal(generated,0);assert.ok(q.maxUsd>0);
  const persist=async e=>{saved=structuredClone(e);};const r=await F.run(deps,source,rows,q,null,persist);assert.equal(generated,2);assert.equal(r.completedWindows,2);
  await F.run({...deps,savedEvidence:r.evidence},source,rows,q,null,persist);assert.equal(generated,2);
  await F.run(deps,source,rows,q,null,persist);assert.equal(generated,4,'explicit fresh run is allowed');
});
test('errors and persistence failures stop further paid calls',async()=>{
  let calls=0,saved;const deps={apiKey:'fixture',fetch:async url=>{if(url.endsWith(':countTokens'))return response({totalTokens:1000});calls++;return {ok:false,status:503,text:async()=>''};}};
  const q=await F.estimate(deps,source,rows);
  await assert.rejects(()=>F.run(deps,source,rows,q,null,async()=>{throw Error('quota');}),/quota/);assert.equal(calls,0);
  const r=await F.run(deps,source,rows,q,null,async e=>{saved=structuredClone(e);});assert.equal(calls,1);assert.equal(saved.calls[0].state,'failed-charge-unknown');assert.equal(r.coverage.playable,1);
  await assert.rejects(()=>F.run(deps,{...source,durationSec:151},rows,q,null,async()=>{}),/QUOTE/);assert.equal(calls,1);
  await assert.rejects(()=>F.run(deps,source,rows,{...q,expiresAt:0},null,async()=>{}),/QUOTE/);
});
test('speech alignment tolerates minor transcription differences only for unique long phrases',()=>{
  const reference=[{text:'היום אנחנו הולכים ביחד לבית הספר כדי ללמוד משהו חדש בעברית'}];
  assert.equal(F.matchSpeech(reference,0,'היום אנחנו הולכים לבית הספר כדי ללמוד משהו חדש בעברית'),true);
  assert.equal(F.matchSpeech(reference,0,'היום אנחנו לא הולכים ביחד לבית הספר כדי ללמוד משהו חדש בעברית'),false);
  assert.equal(F.matchSpeech([...reference,...reference],0,'היום אנחנו הולכים לבית הספר כדי ללמוד משהו חדש בעברית'),false);
  assert.equal(F.matchSpeech([{text:'שלום עולם חדש היום'}],0,'שלום עולם קטן היום'),false);
});
test('prefer observed intervals away from cut edges and refine coarse existing boundaries',()=>{
  const timeline=[{text:'שלום עולם',startSec:119,endSec:123},{text:'משפט נוסף',startSec:null,endSec:null}];
  const evidence={timeline,calls:[{state:'complete',window:{startSec:0,endSec:120},segments:[{row:1,startSec:118,endSec:120,heard:'שלום עולם'}]},
    {state:'complete',window:{startSec:100,endSec:220},segments:[{row:1,startSec:18,endSec:21,heard:'שלום עולם'},{row:2,startSec:21.2,endSec:24,heard:'משפט נוסף'}]}]};
  const r=F.collect(evidence);assert.equal(r.coverage.playable,2);assert.equal(r.segments[0].endSec,121);assert.equal(r.segments[1].startSec,121.2);
});
