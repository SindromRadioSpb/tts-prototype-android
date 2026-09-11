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

// ── транскрипт → паспорт материала (той же дверью, что и субтитры YouTube) ──
test('the transcript becomes an import passport that names its real origin',()=>{
  const meta=Y.buildImportMeta({video_id:ID,url:`https://www.youtube.com/watch?v=${ID}`,durationSec:1560,blind:false,
    timing:{verdict:'verified',medianErrorSec:0,checked:3,matched:3},warnings:['PARTIALLY_UNCLEAR'],
    segments:[{startSec:7,text:'שלום'},{startSec:20,text:'עולם'}]},'gemini-flash-latest');
  assert.equal(meta.kind,'captions');
  assert.equal(meta.captions.captions.origin,'gemini-url-asr');
  assert.equal(meta.captions.captions.asr.provider,'gemini-url');
  assert.equal(meta.captions.captions.asr.model,'gemini-flash-latest');
  assert.deepEqual(meta.captions.video,{platform:'youtube',videoId:ID,url:`https://www.youtube.com/watch?v=${ID}`});
  assert.equal(meta.captions.media.durationSec,1560);
  assert.deepEqual(meta.captions.segments,[{i:0,start:7,text:'שלום'},{i:1,start:20,text:'עולם'}]);
  assert.equal(meta.textSnapshot,'שלום\nעולם');
  assert.deepEqual(meta.warnings,['PARTIALLY_UNCLEAR']);
  assert.equal(meta.captions.timingDropReason,null);
  assert.equal(meta.captions.captions.timing.verdict,'verified');
});

test('a withdrawn clock is stated in the passport instead of being hidden',()=>{
  const meta=Y.buildImportMeta({video_id:ID,url:`https://www.youtube.com/watch?v=${ID}`,durationSec:1560,blind:true,
    timing:{verdict:'suspect',medianErrorSec:210,checked:3,matched:3},warnings:[],
    segments:[{startSec:null,text:'שלום'},{startSec:null,text:'עולם'}]},'gemini-flash-latest');
  assert.equal(meta.captions.timingDropReason,'ASR_CLOCK_UNVERIFIED');
  assert.deepEqual(meta.captions.segments.map(s=>s.start),[null,null]);
  assert.equal(meta.textSnapshot,'שלום\nעולם','no word is lost with the clock');
});

// ── непригодный ответ: 200 ещё не значит «есть транскрипт» (живой прогон 2026-09-11) ──
const emptyBody={candidates:[{content:{parts:[]},finishReason:'MAX_TOKENS'}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:8192}};
const blockedBody={candidates:[],promptFeedback:{blockReason:'SAFETY'}};
const truncatedBody={candidates:[{content:{parts:[{text:'{"language":"he","segments":[{"start":"0:07","text":"שלום'}]},finishReason:'MAX_TOKENS'}],usageMetadata:{}};

test('an answer that ran out of room is named for what it is, not called bad JSON',()=>{
  assert.equal(Y.classifyResponse(emptyBody),'ASR_TRUNCATED');
  assert.equal(Y.classifyResponse(truncatedBody),'ASR_TRUNCATED');
  assert.equal(Y.classifyResponse(blockedBody),'ASR_BLOCKED');
  assert.equal(Y.classifyResponse({candidates:[{content:{parts:[{text:'{"language":"he","segments":[]}'}]},finishReason:'STOP'}]}),null);
});

test('a transcript that would not fit is recovered by halving the audio, not abandoned',async()=>{
  const half=segs=>({status:200,body:asrBody(segs)});
  const fetch=fakeFetch([{status:200,body:countBody},
    {status:200,body:emptyBody},                                    // whole video: no usable answer
    half([seg('0:07','ראשון של החצי הראשון'),seg('12:00','אמצע ההקלטה כאן')]),
    half([seg('13:00','ההמשך אחרי האמצע'),seg('25:00','סוף ההקלטה הזאת')])]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:false});
  const clips=fetch.calls.slice(1).map(c=>c.body.contents[0].parts[0].video_metadata);
  assert.equal(clips[0].start_offset,undefined,'the first attempt is still the whole video');
  assert.deepEqual([clips[1].start_offset,clips[1].end_offset],['0s','780s']);
  assert.deepEqual([clips[2].start_offset,clips[2].end_offset],['750s','1560s']);
  assert.equal(out.segments.length,4);
  assert.equal(out.recovered,'split');
});

test('a blocked answer is never retried by splitting, because splitting cannot unblock it',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},{status:200,body:blockedBody}]);
  await assert.rejects(Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:false}),e=>e.code==='ASR_BLOCKED');
  assert.equal(fetch.calls.length,2);
});

test('a window that is already short is not split forever',async()=>{
  const short={...countBody,promptTokensDetails:[{modality:'AUDIO',tokenCount:32*60}]};
  const fetch=fakeFetch([{status:200,body:short},{status:200,body:emptyBody}]);
  await assert.rejects(Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,null,{verifyTiming:false}),e=>e.code==='ASR_TRUNCATED');
  assert.equal(fetch.calls.length,2,'a one-minute clip has nothing left to halve');
});

// ── UI обязан назвать причину, а не показать одну и ту же фразу на всё ──
test('the task dialog has a named sentence for every failure the route can produce',()=>{
  const fs=require('node:fs');
  const src=fs.readFileSync(require.resolve('../public/js/learning-material-task-ui.js'),'utf8');
  for(const code of ['YT_QUOTA','YT_OVERLOADED','YT_URL_REJECTED','ASR_TRUNCATED','ASR_BLOCKED','GEMINI_KEY_REQUIRED']){
    // Границу слева задаём явно: иначе счёт ловит и ключи коротких причин (causeYT_OVERLOADED).
    assert.equal((src.match(new RegExp('[,{]'+code+':',"g"))||[]).length,3,code+' must be phrased in ru, en and he');
  }
});

// ── единая смета: одна кнопка не должна ломаться вторым вопросом посреди прогона ──
test('the table price is quoted as a range, because its size is unknown until speech is recognised',()=>{
  // Замер пилота 2026-09-11: 26-мин интервью дало 300 сегментов = 11.5/мин, тогда как общая
  // константа рассчитана на монолог (6/мин). Точка вместо диапазона занизила бы цену вдвое.
  const r=Y.estimateTableRange(1560,120);
  assert.ok(r.lowUsd>0 && r.highUsd>r.lowUsd,JSON.stringify(r));
  assert.ok(r.highRows>=300,'the range must cover the density actually measured: '+r.highRows);
  assert.ok(r.lowRows<r.highRows);
  assert.equal(Y.estimateTableRange(0,120),null);
});

test('a run only stops to ask again when reality outgrows the price already shown',()=>{
  assert.equal(Y.tableCostWithinQuote(0.18,{highUsd:0.20}),true);
  assert.equal(Y.tableCostWithinQuote(0.20,{highUsd:0.20}),true);
  assert.equal(Y.tableCostWithinQuote(0.31,{highUsd:0.20}),false,'a materially bigger bill must be asked about');
  assert.equal(Y.tableCostWithinQuote(0.18,null),false,'no quote shown means no silent spending');
});

test('a quote also covers the size of the table, not only its dollars',()=>{
  // Премиум-провайдер (google-free/gcp) не считает долларов вовсе — там согласуется ОБЪЁМ.
  const quote={highUsd:0.20,highRows:315};
  assert.equal(Y.tableCostWithinQuote({rows:300},quote),true);
  assert.equal(Y.tableCostWithinQuote({rows:600},quote),false,'twice the promised size must be asked about');
  assert.equal(Y.tableCostWithinQuote({usd:0.18,rows:300},quote),true);
  assert.equal(Y.tableCostWithinQuote({usd:0.40,rows:300},quote),false);
  assert.equal(Y.tableCostWithinQuote({rows:300},{highUsd:0.2}),false,'a quote without a size cannot vouch for size');
});

test('a wait between attempts is announced, not spent in silence',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},{status:503,body:{}},{status:200,body:asrBody([seg('0:07','שלום')])}]);
  const seen=[];
  await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{}},`https://youtu.be/${ID}`,
    (phase,at)=>seen.push({phase,at}),{verifyTiming:false});
  const retry=seen.find(s=>s.phase==='retrying');
  assert.ok(retry,'the pause before a retry must be reported: '+JSON.stringify(seen));
  assert.equal(retry.at.code,'YT_OVERLOADED');
  assert.equal(retry.at.attempt,1);
  assert.equal(retry.at.attempts,4);
  assert.equal(retry.at.waitMs,4000);
});

test('every configured wait is actually used before the run gives up',async()=>{
  // Наблюдение 2026-09-11: лестница объявляла три задержки, а цикл сдавался после двух —
  // последняя (самая длинная, и потому самая полезная при перегрузке) не использовалась никогда.
  const waits=[];
  const fetch=fakeFetch([{status:200,body:countBody},...Y.RETRY_DELAYS_MS.map(()=>({status:503,body:{}})),{status:200,body:asrBody([seg('0:07','שלום')])}]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async(ms)=>{waits.push(ms);}},`https://youtu.be/${ID}`,null,{verifyTiming:false});
  assert.deepEqual(waits.join(','),Y.RETRY_DELAYS_MS.join(','),'all configured waits must be reachable');
  assert.equal(out.segments.length,1,'the run survives when the provider finally answers');
});

test('a stop asked for during a retry wait is honoured at once, not after the wait',async()=>{
  // Кнопка «Остановить» во время паузы 30 с выглядела неработающей: отмена проверялась только
  // между фазами, а ожидание её не слушало.
  let stopped=false,slept=0;
  const fetch=fakeFetch([{status:200,body:countBody},{status:503,body:{}},{status:200,body:asrBody([seg('0:07','שלום')])}]);
  const deps={fetch,apiKey:'k',shouldStop:()=>stopped,
    sleep:async(ms)=>{slept+=ms;stopped=true;}};   // человек нажал «Остановить» посреди ожидания
  await assert.rejects(Y.transcribe(deps,`https://youtu.be/${ID}`,null,{verifyTiming:false}),e=>e.code==='TASK_CANCELLED');
  assert.equal(fetch.calls.length,2,'no further paid call may start after a stop');
});

test('a run with no stop signal is unaffected',async()=>{
  const fetch=fakeFetch([{status:200,body:countBody},{status:503,body:{}},{status:200,body:asrBody([seg('0:07','שלום')])}]);
  const out=await Y.transcribe({fetch,apiKey:'k',sleep:async()=>{},shouldStop:()=>false},`https://youtu.be/${ID}`,null,{verifyTiming:false});
  assert.equal(out.segments.length,1);
});
