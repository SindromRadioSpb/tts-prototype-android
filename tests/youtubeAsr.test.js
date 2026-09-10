const {test}=require('node:test'),assert=require('node:assert/strict');
const Y=require('../public/js/youtube-asr');
const AT=require('../public/js/asr-transcript');

const ID='eLYgTqNFn-s';

test('canonicalize strips the extra parameters the provider rejects with HTTP 400',()=>{
  // Measured 2026-09-11: watch?v=<id>&t=42s&list=… returns 400 INVALID_ARGUMENT.
  for(const url of [`https://www.youtube.com/watch?v=${ID}&t=42s&list=PLxxxx`,`https://youtu.be/${ID}?t=20`,`https://m.youtube.com/watch?v=${ID}`]){
    assert.deepEqual(Y.canonicalize(url),{video_id:ID,url:`https://www.youtube.com/watch?v=${ID}`},url);
  }
  for(const url of ['https://example.com/video.mp4',`https://user:pw@youtube.com/watch?v=${ID}`,'not a url','']) assert.equal(Y.canonicalize(url),null,url);
});

test('a window request clips the input and never asks the model to honour a range',()=>{
  const req=Y.buildRequest(`https://www.youtube.com/watch?v=${ID}`,{startSec:900,endSec:1800});
  const [media,prompt]=req.contents[0].parts;
  assert.deepEqual(media.file_data,{file_uri:`https://www.youtube.com/watch?v=${ID}`});
  assert.deepEqual(media.video_metadata,{start_offset:'900s',end_offset:'1800s',fps:0.2});
  // S12.5: the range must constrain the AUDIO, never the prompt — a range prompt forged timestamps.
  assert.equal(prompt.text,AT.ASR_PROMPT);
  assert.doesNotMatch(prompt.text,/IMPORTANT SCOPE|TIMESTAMPS ARE ABSOLUTE|15:00|30:00/);
  assert.notEqual(prompt.text,AT.ASR_RANGE_PROMPT(900,1800));
});

test('a single-window video is sent whole but still drops the frames nobody transcribes',()=>{
  // Measured: fps 0.2 costs 72,073 tokens instead of 160,681 for the same video, same timing quality.
  const req=Y.buildRequest(`https://www.youtube.com/watch?v=${ID}`,null);
  assert.deepEqual(req.contents[0].parts[0].video_metadata,{fps:0.2});
});

test('windows follow the shipped ASR window plan',()=>{
  assert.deepEqual(Y.planWindows(1560),[]);            // 26 min fits one call
  assert.deepEqual(Y.planWindows(2000),AT.asrWindows(2000));
  assert.equal(Y.planWindows(0).length,0);
});

test('duration comes from the audio token rate, not from the model',()=>{
  // Measured: audio modality is exactly 32 tokens/sec (49919 tokens for a 1560 s video).
  assert.equal(Y.durationFromTokens([{modality:'AUDIO',tokenCount:49919},{modality:'VIDEO',tokenCount:110760}]),1560);
  assert.equal(Y.durationFromTokens([{modality:'VIDEO',tokenCount:10}]),null);
  assert.equal(Y.durationFromTokens(null),null);
});

test('provider failures are classified so the user is told what actually happened',()=>{
  assert.equal(Y.classifyFailure(400,'{"error":{"status":"INVALID_ARGUMENT"}}'),'YT_URL_REJECTED');
  assert.equal(Y.classifyFailure(429,''),'YT_QUOTA');
  assert.equal(Y.classifyFailure(403,''),'YT_QUOTA');
  assert.equal(Y.classifyFailure(503,''),'YT_OVERLOADED');
  assert.equal(Y.classifyFailure(500,''),'YT_FAILED');
});

test('only transient provider failures are retried',()=>{
  assert.equal(Y.retryable('YT_OVERLOADED'),true);
  assert.equal(Y.retryable('YT_QUOTA'),true);
  assert.equal(Y.retryable('YT_URL_REJECTED'),false);
  assert.equal(Y.retryable('YT_FAILED'),false);
});

// ── смета (бесплатный countTokens) ──
function fakeFetch(handlers){const calls=[];const f=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});const h=handlers.shift();if(!h)throw new Error('UNEXPECTED_CALL');return {ok:h.status===200,status:h.status,text:async()=>JSON.stringify(h.body||{})};};f.calls=calls;return f;}
const countBody={totalTokens:160681,promptTokensDetails:[{modality:'TEXT',tokenCount:2},{modality:'VIDEO',tokenCount:22152},{modality:'AUDIO',tokenCount:49919}]};

test('the estimate is taken before paying, from the free token count',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody}]);
  const out=await Y.estimate({fetch,apiKey:'k'},`https://www.youtube.com/watch?v=${ID}&t=9s`);
  assert.match(fetch.calls[0].url,/:countTokens$/);
  assert.equal(fetch.calls[0].body.contents[0].parts[0].file_data.file_uri,`https://www.youtube.com/watch?v=${ID}`);
  assert.equal(out.durationSec,1560);
  assert.equal(out.windows,1);
  assert.equal(out.inputTokens,160681);
  assert.ok(out.estimatedUsd>0&&out.estimatedUsd<1,'26 min must not cost a dollar: '+out.estimatedUsd);
});

test('an unusable link is reported as rejected, never as a provider outage',async()=>{
  await assert.rejects(Y.estimate({fetch:fakeFetch([]),apiKey:'k'},'https://example.com/v.mp4'),e=>e.code==='YT_URL_REJECTED');
  const fetch=fakeFetch([{status:400,body:{error:{status:'INVALID_ARGUMENT'}}}]);
  await assert.rejects(Y.estimate({fetch,apiKey:'k'},`https://www.youtube.com/watch?v=${ID}`),e=>e.code==='YT_URL_REJECTED');
});

// ── прогон ──
const seg=(start,text)=>({start,text});
const asrBody=segments=>({candidates:[{content:{parts:[{text:JSON.stringify({language:'he',segments,warnings:[]})}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:10}});

test('a short video is transcribed in one paid call after the free estimate',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},{status:200,body:asrBody([seg('0:07','שלום עולם'),seg('0:20','מה שלומך היום')])}]);
  const out=await Y.transcribe({fetch,apiKey:'k'},`https://youtu.be/${ID}`,null,{verifyTiming:false});
  assert.equal(fetch.calls.length,2);
  assert.match(fetch.calls[1].url,/:generateContent$/);
  assert.equal(fetch.calls[1].body.contents[0].parts[0].video_metadata.start_offset,undefined);
  assert.equal(out.segments.length,2);
  assert.equal(out.segments[0].startSec,7);
  assert.equal(out.text.includes('שלום עולם'),true);
  assert.equal(out.durationSec,1560);
});

test('the transcript survives a provider overload instead of losing the run',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},{status:503,body:{}},{status:429,body:{}},{status:200,body:asrBody([seg('0:07','שלום')])}]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:false});
  assert.equal(out.segments.length,1);
  assert.equal(out.attempts,3);
});

test('a rejected link is never retried',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},{status:400,body:{}}]);
  await assert.rejects(Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:false}),e=>e.code==='YT_URL_REJECTED');
  assert.equal(fetch.calls.length,2);
});

test('a long video is cut into windows on the provider side and stitched by text',async()=>{
  const long={...countBody,promptTokensDetails:[{modality:'AUDIO',tokenCount:32*2000}]};
  const fetch=fakeFetch([{status:200,body:long},
    {status:200,body:asrBody([seg('0:10','ראשון'),seg('14:50','משפט השוו')])},
    {status:200,body:asrBody([seg('14:50','משפט השוו'),seg('20:00','שני')])},
    {status:200,body:asrBody([seg('30:00','שלישי')])}]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:false});
  const windows=fetch.calls.slice(1).map(c=>c.body.contents[0].parts[0].video_metadata);
  assert.deepEqual(windows[0],{fps:0.2,start_offset:'0s',end_offset:'900s'});
  assert.deepEqual(windows[1],{fps:0.2,start_offset:'870s',end_offset:'1800s'});
  assert.equal(out.segments.filter(s=>s.text==='משפט השוו').length,1,'the seam must not duplicate speech');
});

// ── независимая проверка часов (R17: генератор не сертифицирует свои метки) ──
const timeline=[{startSec:600,text:'יש מקרי גירושים בציבור החרדי'},{startSec:612,text:'אני בגיל שמונה עשרה וחצי התארסתי'},{startSec:620,text:'שלושה חודשים אחרי זה התגרשתי'}];

test('an anchor probe measures the timeline against an independently clipped window',()=>{
  const probe=[{startSec:612,text:'אני בגיל שמונה עשרה וחצי התארסתי'},{startSec:620,text:'שלושה חודשים אחרי זה התגרשתי'}];
  assert.deepEqual(Y.matchAnchors(timeline,probe),{checked:2,matched:2,medianErrorSec:0});
});

test('a compressed clock shows up as a systematic anchor error',()=>{
  // S12.7 shape: the model stamped a constant step, so real speech sits minutes off its mark.
  const probe=[{startSec:402,text:'אני בגיל שמונה עשרה וחצי התארסתי'},{startSec:410,text:'שלושה חודשים אחרי זה התגרשתי'}];
  const m=Y.matchAnchors(timeline,probe);
  assert.equal(m.matched,2);
  assert.equal(m.medianErrorSec,210);
  assert.equal(Y.judgeTiming(m),'suspect');
});

test('too few anchors is inconclusive, never a silent pass',()=>{
  assert.equal(Y.judgeTiming({checked:5,matched:1,medianErrorSec:0}),'inconclusive');
  assert.equal(Y.judgeTiming({checked:0,matched:0,medianErrorSec:null}),'inconclusive');
  assert.equal(Y.judgeTiming({checked:4,matched:3,medianErrorSec:2}),'verified');
});

test('the run pays for one short independent probe and reports a timing verdict',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},
    {status:200,body:asrBody([seg('10:00','יש מקרי גירושים בציבור החרדי'),seg('10:12','אני בגיל שמונה עשרה וחצי התארסתי'),seg('10:20','שלושה חודשים אחרי זה התגרשתי')])},
    {status:200,body:asrBody([seg('10:00','יש מקרי גירושים בציבור החרדי'),seg('10:12','אני בגיל שמונה עשרה וחצי התארסתי'),seg('10:20','שלושה חודשים אחרי זה התגרשתי')])}]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:true});
  const probeWindow=fetch.calls[2].body.contents[0].parts[0].video_metadata;
  assert.ok(probeWindow.start_offset,'the probe must be an API-side clip, not a prompt request');
  assert.equal(out.timing.verdict,'verified');
  assert.equal(out.timing.medianErrorSec,0);
  assert.equal(out.blind,false);
});

test('a suspect clock keeps every word and only withdraws the timing',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},
    {status:200,body:asrBody([seg('10:00','יש מקרי גירושים בציבור החרדי'),seg('10:12','אני בגיל שמונה עשרה וחצי התארסתי'),seg('10:20','שלושה חודשים אחרי זה התגרשתי')])},
    {status:200,body:asrBody([seg('6:40','אני בגיל שמונה עשרה וחצי התארסתי'),seg('6:48','שלושה חודשים אחרי זה התגרשתי')])}]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:true});
  assert.equal(out.timing.verdict,'suspect');
  assert.equal(out.blind,true);
  assert.equal(out.segments.length,3,'text is never dropped because timing is untrustworthy');
  assert.equal(out.segments.every(s=>s.startSec===null),true,'no mark may survive a withdrawn clock');
});

test('a failed probe does not destroy an otherwise complete transcript',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},
    {status:200,body:asrBody([seg('10:00','יש מקרי גירושים בציבור החרדי')])},
    {status:503,body:{}},{status:503,body:{}},{status:503,body:{}}]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:true});
  assert.equal(out.segments.length,1);
  assert.equal(out.timing.verdict,'inconclusive');
  assert.equal(out.blind,false,'an unproven clock is not a disproven one');
});
