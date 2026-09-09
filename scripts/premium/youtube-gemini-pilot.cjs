'use strict';
// Explicit owner pilot only. Never reads browser storage; no automatic retries/fallbacks.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {GoogleGenAI}=require('@google/genai');
const VIDEO='djzKaEoqka8',MODEL='gemini-3.8-flash',BUDGET=5,MAX_OUTPUT=16384;
const args=process.argv.slice(2),mode=args[0]||'count',start=Number(args[1]||0),end=Number(args[2]||45);
if(!['count','run'].includes(mode)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>726||end<=start)throw new Error('BAD_PILOT_RANGE');
const dir=path.resolve('artifacts/youtube-gemini-pilot');fs.mkdirSync(dir,{recursive:true});
const ledgerPath=path.join(dir,'budget.json'),keyPath=process.env.PILOT_ENV_FILE;
if(!keyPath)throw new Error('PILOT_ENV_FILE_REQUIRED');
const key=require('dotenv').parse(fs.readFileSync(keyPath)).GEMINI_API_KEY;
if(!key)throw new Error('PILOT_KEY_MISSING');
const ai=new GoogleGenAI({apiKey:key,httpOptions:{timeout:180000,retryOptions:{attempts:1}}});
const contents=[{role:'user',parts:[{fileData:{fileUri:'https://www.youtube.com/watch?v='+VIDEO,mimeType:'video/mp4'},videoMetadata:{startOffset:start+'s',endOffset:end+'s',fps:1}},
  {text:'Transcribe the audible speech of the provided video clip faithfully in its original language. Do not translate or summarize. Keep repetitions and spoken numbers. Mark inaudible speech as [לא ברור]. Do not invent speech during silence. Return JSON with language, segments [{start_seconds,end_seconds,text}], and warnings. Use ABSOLUTE timestamps on the original video timeline. Segment at natural short utterances. Include all audible speech in this supplied clip. Timestamp estimates are unverified; list uncertainty in warnings.'}]}];
const signature=crypto.createHash('sha256').update(JSON.stringify({MODEL,contents})).digest('hex');
const outPath=path.join(dir,`${start}-${end}-${signature.slice(0,12)}.json`);
(async()=>{
  const modelInfo=await ai.models.get({model:MODEL});
  if(!Number.isFinite(modelInfo.inputTokenLimit)||modelInfo.inputTokenLimit>1048576)throw new Error('MODEL_BUDGET_BOUND_CHANGED');
  const count=await ai.models.countTokens({model:MODEL,contents});
  if(!Number.isFinite(count.totalTokens)||count.totalTokens<=0)throw new Error('TOKEN_ESTIMATE_MISSING');
  // Current standard rates verified 2026-09-09; reserve the MODEL'S WHOLE input limit,
  // not just clipping/countTokens. Previous failed calls retain their original $1.90 reserve.
  if(new Date()>=new Date('2027-01-01'))throw new Error('PILOT_PRICING_RECHECK_REQUIRED');
  const reserve=0.90; // > 1,048,576 input tokens * $0.75/M + 16,384 output/thinking * $3.75/M.
  console.log(JSON.stringify({stage:'estimate',video:VIDEO,model:MODEL,start,end,input_tokens:count.totalTokens,estimated_ceiling_usd:count.totalTokens*1.5/1e6+MAX_OUTPUT*7.5/1e6,reservation_usd:reserve,budget_usd:BUDGET}));
  if(mode==='count')return;
  if(fs.existsSync(outPath)){console.log(JSON.stringify({stage:'cached',file:path.relative(process.cwd(),outPath)}));return;}
  const ledger=fs.existsSync(ledgerPath)?JSON.parse(fs.readFileSync(ledgerPath)): {video:VIDEO,budget_usd:BUDGET,entries:[]};
  if(ledger.video!==VIDEO||ledger.budget_usd!==BUDGET)throw new Error('BUDGET_LEDGER_MISMATCH');
  const used=ledger.entries.reduce((sum,e)=>sum+(e.accounted_usd==null?e.reserved_usd:e.accounted_usd),0);
  if(used+reserve>BUDGET)throw new Error('PILOT_BUDGET_EXHAUSTED');
  const entry={signature,start,end,at:new Date().toISOString(),reserved_usd:reserve,status:'requested'};ledger.entries.push(entry);
  fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));
  try{
    const result=await ai.models.generateContent({model:MODEL,contents,config:{maxOutputTokens:MAX_OUTPUT,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'medium'}}});
    const usage=result.usageMetadata||{};
    const payload={video:VIDEO,model:MODEL,modelVersion:result.modelVersion||null,responseId:result.responseId||null,start,end,requested_contents:contents,usage,finishReason:result.candidates?.[0]?.finishReason||null,text:result.text||'',timing_status:'unverified'};
    fs.writeFileSync(outPath,JSON.stringify(payload,null,2));
    const inputTokens=Number(usage.promptTokenCount),outTokens=Number(usage.candidatesTokenCount||0)+Number(usage.thoughtsTokenCount||0);
    entry.status='received';entry.accounted_usd=Number.isFinite(inputTokens)&&inputTokens>0 ? inputTokens*1.5/1e6+outTokens*7.5/1e6 : null;
    entry.current_rate_estimate_usd=entry.accounted_usd==null?null:entry.accounted_usd/2;
    fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));
    let parsed;try{parsed=JSON.parse(payload.text);}catch(_){}
    console.log(JSON.stringify({stage:'received',finishReason:payload.finishReason,modelVersion:payload.modelVersion,usage,segments:parsed?.segments?.length||0,accounted_usd:entry.accounted_usd,current_rate_estimate_usd:entry.current_rate_estimate_usd,file:path.relative(process.cwd(),outPath)}));
  }catch(error){entry.status='failed-charge-unknown';entry.error_status=error.status||null;fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));console.log(JSON.stringify({stage:'failed',status:error.status||null,name:error.name,reason:String(error.message||'').replaceAll(key,'[redacted]').slice(0,500)}));process.exitCode=1;}
})().catch(error=>{console.log(JSON.stringify({stage:'preflight-failed',status:error.status||null,name:error.name,reason:String(error.message||'').replaceAll(key,'[redacted]').slice(0,500)}));process.exitCode=1;});
