(function(root){
'use strict';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(x);
const str=(x,n)=>typeof x==='string'&&x.length<=n;
const time=x=>Number.isFinite(x)&&x>=0;
const DAY=86400000;
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
const fields={anchor:['attemptId','anchorAt'],resolve_anchor:['candidateIds','anchorId','supersedes'],start:['runId','sessionId','activityBreak','externalExposure','priorStimuli','priorKey','aided'],stimulus:['runId','taskId'],response:['runId','taskId','input','aided','channel','phase'],complete:['runId'],key:['runId','taskId'],score:['runId','taskId','rubricId','value','source']};
function validEvent(e){
 if(!object(e)||!id(e.id)||!id(e.planId)||!Number.isInteger(e.planVersion)||e.planVersion<1||!time(e.at)||!Object.hasOwn(fields,e.type))return false;
 if(Object.keys(e).some(k=>!['id','planId','planVersion','at','type',...fields[e.type]].includes(k)))return false;
 if(e.type==='anchor')return id(e.attemptId)&&time(e.anchorAt);
 if(e.type==='resolve_anchor')return Array.isArray(e.candidateIds)&&e.candidateIds.length>0&&e.candidateIds.length<=100&&e.candidateIds.every(id)&&new Set(e.candidateIds).size===e.candidateIds.length&&id(e.anchorId)&&e.candidateIds.includes(e.anchorId)&&(e.supersedes===undefined||(Array.isArray(e.supersedes)&&e.supersedes.length<=10000&&e.supersedes.every(id)&&new Set(e.supersedes).size===e.supersedes.length&&!e.supersedes.includes(e.id)));
 if(!id(e.runId))return false;
 if(e.type==='start')return id(e.sessionId)&&typeof e.activityBreak==='boolean'&&[true,false,'unknown'].includes(e.aided)&&['externalExposure','priorStimuli','priorKey'].every(k=>['yes','no','unknown'].includes(e[k]));
 if(e.type==='complete')return true;
 if(e.type==='key')return e.taskId===undefined||id(e.taskId);
 if(!id(e.taskId))return false;
 if(e.type==='stimulus')return true;
 if(e.type==='response')return str(e.input,8000)&&typeof e.aided==='boolean'&&e.channel==='text'&&['initial','repair'].includes(e.phase);
 return id(e.rubricId)&&Number.isFinite(e.value)&&e.value>=0&&e.value<=100&&['self','auto_exact'].includes(e.source);
}
function validEvents(es){return Array.isArray(es)&&es.length<=10000&&es.every(validEvent)&&bytes(es)<1900000;}
function mergeEvents(a=[],b=[]){const m=new Map();for(const e of [...a,...b])m.set(JSON.stringify(canonical(e)),structuredClone(e));return [...m.values()].sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id)||JSON.stringify(canonical(x)).localeCompare(JSON.stringify(canonical(y))));}
function validatePlan(p,course){
 const issues=[],bad=(path,message)=>issues.push({level:'error',code:'REVIEW_PLAN',path:'reviewPlan.'+path,message});
 if(!object(p)){bad('','Expected plan');return issues;}
 if(!id(p.id)||p.version!==1||!id(p.anchorLessonId)||!course.lessons?.includes(p.anchorLessonId))bad('','Invalid plan identity or anchor lesson');
 if(!Array.isArray(p.sessions)||!p.sessions.length||p.sessions.length>50){bad('sessions','Expected 1–50 sessions');return issues;}
 const seen=new Map(); const ru=x=>object(x)&&str(x.ru,16000)&&x.ru.trim();
 for(const [n,s]of p.sessions.entries()){
  if(!object(s)){bad('sessions.'+n,'Expected session');continue;}
  if(!id(s.id)||seen.has(s.id)||!Number.isInteger(s.day)||s.day<0||s.day>3650||!['review','assessment'].includes(s.kind)||!ru(s.title)||!ru(s.instructions))bad('sessions.'+n,'Invalid session');
  if(s.requiresActivityBreak!==undefined&&s.requiresActivityBreak!==true)bad(s.id,'Invalid break requirement');
  seen.set(s.id,s);
  if(!Array.isArray(s.tasks)||!s.tasks.length||s.tasks.length>100){bad(s.id,'Expected tasks');continue;}
  const ids=new Set();for(const t of s.tasks){
   if(!object(t)||!id(t.id)||ids.has(t.id)||!ru(t.prompt)||!ru(t.key)||(t.stimulus!==undefined&&!ru(t.stimulus))){bad(s.id,'Invalid task');continue;}ids.add(t.id);
   if(t.accepts!==undefined&&(!Array.isArray(t.accepts)||!t.accepts.length||t.accepts.length>50||!t.accepts.every(a=>str(a,8000)&&a.trim())))bad(t.id,'Invalid exact answers');
   if(t.repair!==undefined&&(!object(t.repair)||!ru(t.repair.prompt)||!ru(t.repair.key)))bad(t.id,'Invalid repair');
   const rs=new Set();if(!Array.isArray(t.rubric)||!t.rubric.length)bad(t.id,'Missing rubric');else for(const r of t.rubric){if(!object(r)||!id(r.id)||rs.has(r.id)||!ru(r.label)||!Number.isInteger(r.max)||r.max<1||r.max>100)bad(t.id,'Invalid rubric');else rs.add(r.id);}
  }
 }
 for(const s of p.sessions.filter(object)){if(s.after!==undefined&&(!seen.has(s.after)||seen.get(s.after).day>s.day))bad(s.id,'Invalid predecessor');const chain=new Set([s.id]);let next=s.after;while(next&&seen.has(next)){if(chain.has(next)){bad(s.id,'Dependency cycle');break;}chain.add(next);next=seen.get(next).after;}}
 return issues;
}
const events=(p,plan)=>(p.reviewEvents||[]).filter(e=>e.planId===plan.id&&e.planVersion===plan.version);
function conflicts(es){const m=new Map();for(const e of es){let v=JSON.stringify(canonical(e));if(m.has(e.id)&&m.get(e.id)!==v)return true;m.set(e.id,v);}return false;}
// UUID ordering is only a stable merge order, never evidence of which tied
// answer came first. Keep all records and treat different earliest answers as
// ambiguous (including different assistance declarations).
function firstResponse(responses,taskId){
 const initial=responses.filter(e=>e.taskId===taskId&&e.phase==='initial');
 if(!initial.length)return {response:null,ambiguous:false};
 const earliest=Math.min(...initial.map(e=>e.at)),tied=initial.filter(e=>e.at===earliest);
 const ambiguous=new Set(tied.map(e=>JSON.stringify([e.input,e.aided]))).size>1;
 return {response:ambiguous?null:tied[0],ambiguous};
}
// Shape validation is not enough for imported/cloud journals. Preserve suspect
// evidence, but never use impossible relationships to open keys or claim a test.
function invalidHistory(es,plan){
 const byId=new Map(es.map(e=>[e.id,e])),anchors=es.filter(e=>e.type==='anchor');
 if(anchors.some(e=>e.at<e.anchorAt))return true;
 const resolutions=es.filter(e=>e.type==='resolve_anchor');
 for(const e of resolutions){
  if(e.candidateIds.some(k=>!anchors.some(a=>a.id===k&&a.at<=e.at)))return true;
  if((e.supersedes||[]).some(k=>byId.get(k)?.type!=='resolve_anchor'||byId.get(k).at>e.at))return true;

 }
 // Topological cycle check stays bounded even for a deeply nested import.
 const degrees=new Map(resolutions.map(e=>[e.id,0]));
 for(const e of resolutions)for(const k of e.supersedes||[])degrees.set(k,degrees.get(k)+1);
 const queue=resolutions.filter(e=>degrees.get(e.id)===0);let visited=0;
 for(let i=0;i<queue.length;i++){const e=queue[i];visited++;for(const k of e.supersedes||[]){degrees.set(k,degrees.get(k)-1);if(degrees.get(k)===0)queue.push(byId.get(k));}}
 if(visited!==resolutions.length)return true;
 const groups=new Map();for(const e of es){if(!e.runId)continue;if(!groups.has(e.runId))groups.set(e.runId,[]);groups.get(e.runId).push(e);}
 for(const entries of groups.values()){
  const starts=entries.filter(e=>e.type==='start');if(starts.length!==1)return true;
  const start=starts[0],s=plan.sessions.find(x=>x.id===start.sessionId);
  if(!s||s.requiresActivityBreak&&!start.activityBreak||entries.some(e=>e.at<start.at))return true;
  if(!anchors.length||start.at<Math.min(...anchors.map(a=>a.anchorAt))+s.day*DAY)return true;
  if(s.after&&!es.some(e=>e.type==='complete'&&e.at<=start.at&&es.some(x=>x.type==='start'&&x.runId===e.runId&&x.sessionId===s.after)))return true;
  const responses=entries.filter(e=>e.type==='response'),done=entries.filter(e=>e.type==='complete'),keys=entries.filter(e=>e.type==='key');
  for(const e of entries){
   const t=s.tasks.find(t=>t.id===e.taskId);
   if(e.taskId!==undefined&&!t)return true;
   if(e.type==='complete'&&s.tasks.some(t=>!responses.some(r=>r.taskId===t.id&&r.phase==='initial'&&r.at<=e.at)))return true;
   if(e.type==='key'&&!done.some(d=>d.at<=e.at))return true;
   if(e.type==='response'&&e.phase==='initial'&&done.some(d=>d.at<e.at))return true;
   if(e.type==='response'&&e.phase==='repair'&&(!t.repair||!done.some(d=>d.at<=e.at)||!keys.some(k=>k.at<=e.at&&(k.taskId===undefined||k.taskId===e.taskId))))return true;
   if(e.type==='score'){
    const rubric=t.rubric.find(r=>r.id===e.rubricId);
    if(!rubric||e.value>rubric.max||!done.some(d=>d.at<=e.at)||!keys.some(k=>k.at<=e.at&&(k.taskId===undefined||k.taskId===e.taskId)))return true;
    if(e.source==='auto_exact'){
     const first=firstResponse(responses,e.taskId);
     if(!t.accepts||t.rubric.length!==1||(!first.ambiguous&&(!first.response||e.value!==(t.accepts.some(a=>a.normalize('NFC').trim()===first.response.input.normalize('NFC').trim())?rubric.max:0))))return true;
     // A valid old score can become ambiguous after an offline merge. Keep
     // it for audit, but omit it from derived scores rather than blocking history.
    }
   }
  }
 }
 return false;
}
function anchorState(p,plan){
 const es=events(p,plan),candidates=es.filter(e=>e.type==='anchor');
 if(conflicts(es))return {status:'conflict',reason:'event_id_conflict',candidates};
 if(invalidHistory(es,plan))return {status:'conflict',reason:'invalid_history',candidates};
 if(!candidates.length)return {status:'missing',candidates};
 if(candidates.some(e=>!p.attempts.some(a=>a.id===e.attemptId&&a.lessonId===plan.anchorLessonId&&a.at===e.anchorAt)))return {status:'conflict',reason:'invalid_anchor',candidates};
 const ids=[...new Set(candidates.map(e=>e.id))].sort();
 const resolutions=es.filter(e=>e.type==='resolve_anchor');
 const superseded=new Set(resolutions.flatMap(e=>e.supersedes||[]));
 const active=resolutions.filter(e=>!superseded.has(e.id)&&JSON.stringify([...e.candidateIds].sort())===JSON.stringify(ids));
 const selected=[...new Set(active.map(e=>e.anchorId))];
 // Different devices may independently anchor the very same attempt.
 const distinct=new Set(candidates.map(e=>JSON.stringify([e.attemptId,e.anchorAt])));
 if(selected.length>1||(!selected.length&&distinct.size>1))return {status:'conflict',reason:'anchor_choices',candidates};
 const a=candidates.find(e=>e.id===(selected[0]||ids[0]));return {status:'provisional',id:a.id,at:a.anchorAt,candidates};
}
function validateAction(p,plan,type,payload,at){
 if(type==='anchor'){
  if(!p.attempts.some(a=>a.id===payload.attemptId&&a.lessonId===plan.anchorLessonId&&a.at===payload.anchorAt)||at<payload.anchorAt)throw Error('INVALID_ANCHOR');return;
 }
 if(type==='resolve_anchor'){
  const ids=[...new Set(anchorState(p,plan).candidates.map(e=>e.id))].sort();
  if(events(p,plan).some(e=>['anchor','resolve_anchor'].includes(e.type)&&e.at>at))throw Error('STALE_ANCHOR_RESOLUTION');
  const resolutionIds=events(p,plan).filter(e=>e.type==='resolve_anchor').map(e=>e.id).sort();
  if(JSON.stringify([...(payload.supersedes||[])].sort())!==JSON.stringify(resolutionIds))throw Error('STALE_ANCHOR_RESOLUTION');
  if(!Array.isArray(payload.candidateIds)||JSON.stringify([...payload.candidateIds].sort())!==JSON.stringify(ids)||!ids.includes(payload.anchorId))throw Error('STALE_ANCHOR_RESOLUTION');return;
 }
 if(type==='start'){
  const state=sessionState(p,plan,payload.sessionId,at),session=plan.sessions.find(s=>s.id===payload.sessionId);
  if(!state||['blocked','upcoming'].includes(state.status)||state.runs.some(r=>!r.completed)||events(p,plan).some(e=>e.runId===payload.runId))throw Error('REVIEW_NOT_AVAILABLE');
  if(session.requiresActivityBreak&&!payload.activityBreak)throw Error('ACTIVITY_BREAK_REQUIRED');return;
 }
 const r=runState(p,plan,payload.runId),s=plan.sessions.find(s=>s.id===r?.sessionId),t=s?.tasks.find(t=>t.id===payload.taskId);
 if(!r||anchorState(p,plan).status==='conflict'||at<r.startedAt)throw Error('INVALID_REVIEW_RUN');
 if(['response','stimulus','score'].includes(type)&&!t)throw Error('INVALID_REVIEW_TASK');
 if(type==='response'&&r.responses.some(e=>e.at>at))throw Error('INVALID_RESPONSE_TIME');
 if(type==='response'&&payload.phase==='repair'&&!events(p,plan).some(e=>e.runId===r.runId&&e.type==='key'&&e.at<=at&&(e.taskId===undefined||e.taskId===payload.taskId)))throw Error('INVALID_RESPONSE_PHASE');
 if(type==='response'&&((payload.phase==='initial'&&r.completed)||(payload.phase==='repair'&&(!r.completed||!r.keyExposed||!t.repair))))throw Error('INVALID_RESPONSE_PHASE');
 if(type==='complete'&&(r.completed||s.tasks.some(t=>!r.responses.some(x=>x.taskId===t.id&&x.phase==='initial'))||at<Math.max(r.startedAt,...r.responses.map(x=>x.at))))throw Error('REVIEW_INCOMPLETE');
 if(type==='key'&&(!r.completed||at<r.completedAt||(payload.taskId!==undefined&&!t)))throw Error('REVIEW_KEY_LOCKED');
 if(type==='score'){
  const rubric=t.rubric.find(x=>x.id===payload.rubricId);
  if(!r.completed||at<r.completedAt||!events(p,plan).some(e=>e.runId===r.runId&&e.type==='key'&&e.at<=at&&(e.taskId===undefined||e.taskId===payload.taskId))||!rubric||payload.value>rubric.max)throw Error('INVALID_REVIEW_SCORE');
  if(payload.source==='auto_exact'){
   const first=firstResponse(r.responses,t.id);
   if(first.ambiguous)throw Error('AMBIGUOUS_FIRST_RESPONSE');
   const response=first.response;
   if(!t.accepts||t.rubric.length!==1||!response)throw Error('NO_EXACT_RUBRIC');
   const expected=t.accepts.some(x=>x.normalize('NFC').trim()===response.input.normalize('NFC').trim())?rubric.max:0;
   if(payload.value!==expected)throw Error('INVALID_EXACT_SCORE');
  }
 }
}
function append(p,plan,type,payload,at=Date.now()){
 validateAction(p,plan,type,payload,at);
 const e={...payload,id:globalThis.crypto.randomUUID(),planId:plan.id,planVersion:plan.version,type,at};
 if(!validEvent(e))throw Error('INVALID_REVIEW_EVENT');const next=structuredClone(p);next.reviewEvents=mergeEvents(next.reviewEvents,[e]);if(!validEvents(next.reviewEvents)||bytes(next)>=2*1024*1024)throw Error('REVIEW_PAYLOAD_TOO_BIG');return next;
}
function ensureAnchor(p,plan){if(events(p,plan).some(e=>e.type==='anchor'))return p;const a=p.attempts.filter(a=>a.lessonId===plan.anchorLessonId).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))[0];return a?append(p,plan,'anchor',{attemptId:a.id,anchorAt:a.at},a.at):p;}
function runState(p,plan,runId){
 const all=events(p,plan),es=all.filter(e=>e.runId===runId),starts=es.filter(e=>e.type==='start');if(starts.length!==1)return null;
 const start=starts[0],session=plan.sessions.find(s=>s.id===start.sessionId);if(!session)return null;
 const invalid=invalidHistory(all,plan);
 const done=invalid?null:es.filter(e=>e.type==='complete').sort((a,b)=>a.at-b.at)[0];
 const responses=es.filter(e=>e.type==='response');const previous=all.some(e=>e.type==='start'&&e.sessionId===session.id&&e.runId!==runId&&(e.at<start.at||(e.at===start.at&&e.id<start.id)));
 const ambiguousFirstTaskIds=session.tasks.filter(t=>firstResponse(responses,t.id).ambiguous).map(t=>t.id);
 const foreignRuns=new Set(all.filter(e=>e.type==='start'&&e.sessionId===session.id&&e.runId!==runId).map(e=>e.runId));
 const exposed=all.some(e=>['stimulus','key'].includes(e.type)&&foreignRuns.has(e.runId)&&e.at<=start.at);
 const keyExposed=!invalid&&es.some(e=>e.type==='key');const anchor=anchorState(p,plan);
 const practice=ambiguousFirstTaskIds.length>0||invalid||conflicts(all)||previous||exposed||start.priorStimuli!=='no'||start.priorKey!=='no'||start.aided!==false||responses.filter(e=>e.phase==='initial').some(e=>e.aided)||es.some(e=>e.type==='key'&&(!done||e.at<done.at));
 return {runId,sessionId:session.id,startedAt:start.at,completed:!!done,completedAt:done?.at,actualDelayDays:anchor.at===undefined?null:(start.at-anchor.at)/DAY,practice,independentEligible:session.kind==='assessment'&&!practice&&anchor.status!=='conflict'&&anchor.at!==undefined&&start.at>=anchor.at+session.day*DAY,responses,keyExposed,ambiguousFirstTaskIds,scores:es.filter(e=>e.type==='score'&&!(e.source==='auto_exact'&&ambiguousFirstTaskIds.includes(e.taskId))),externalExposure:start.externalExposure,aided:start.aided,priorStimuli:start.priorStimuli,priorKey:start.priorKey};
}
function sessionState(p,plan,sessionId,now=Date.now()){
 const session=plan.sessions.find(s=>s.id===sessionId);if(!session)return null;
 const anchor=anchorState(p,plan),es=events(p,plan);const runs=es.filter(e=>e.type==='start'&&e.sessionId===sessionId).map(e=>runState(p,plan,e.runId)).filter(Boolean);
 const dueAt=anchor.at===undefined?null:anchor.at+session.day*DAY;
 const predecessor= session.after && es.filter(e=>e.type==='start'&&e.sessionId===session.after).some(e=>runState(p,plan,e.runId)?.completed);
 const status=anchor.status==='conflict'||dueAt===null||session.after&&!predecessor?'blocked':runs.some(r=>!r.completed)?'in_progress':runs.some(r=>r.completed)?'completed':now<dueAt?'upcoming':now===dueAt?'due':'overdue';
 return {id:sessionId,dueAt,status,runs};
}
function summary(p,plan,now=Date.now()){const anchor=anchorState(p,plan);return {anchor,conflict:anchor.status==='conflict',sessions:plan.sessions.map(s=>sessionState(p,plan,s.id,now))};}
function start(p,plan,sessionId,options={},at=Date.now()){
 const state=sessionState(p,plan,sessionId,at),s=plan.sessions.find(s=>s.id===sessionId);if(!state||['blocked','upcoming'].includes(state.status))throw Error('REVIEW_NOT_AVAILABLE');
 if(state.runs.some(r=>!r.completed))throw Error('REVIEW_ALREADY_STARTED');
 if(s.requiresActivityBreak&&!options.activityBreak)throw Error('ACTIVITY_BREAK_REQUIRED');
 const runId=globalThis.crypto.randomUUID();return {progress:append(p,plan,'start',{runId,sessionId,activityBreak:options.activityBreak===true,externalExposure:options.externalExposure||'unknown',priorStimuli:options.priorStimuli||'unknown',priorKey:options.priorKey||'unknown',aided:[true,false].includes(options.aided)?options.aided:'unknown'},at),runId};
}
function respond(p,plan,runId,taskId,input,options={},at=Date.now()){
 const run=runState(p,plan,runId),s=plan.sessions.find(s=>s.id===run?.sessionId);if(!run||(run.completed&&options.phase!=='repair')||!s.tasks.some(t=>t.id===taskId)||at<run.startedAt)throw Error('INVALID_REVIEW_RESPONSE');
 return append(p,plan,'response',{runId,taskId,input,aided:options.aided===true,channel:'text',phase:options.phase||'initial'},at);
}
function complete(p,plan,runId,at=Date.now()){
 const run=runState(p,plan,runId),s=plan.sessions.find(s=>s.id===run?.sessionId);if(!run||run.completed||s.tasks.some(t=>!run.responses.some(r=>r.taskId===t.id&&r.phase==='initial'))||at<Math.max(run.startedAt,...run.responses.map(r=>r.at)))throw Error('REVIEW_INCOMPLETE');
 return append(p,plan,'complete',{runId},at);
}
const api={DAY,validEvents,mergeEvents,validatePlan,append,ensureAnchor,summary,sessionState,runState,start,respond,complete};root.CourseReview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
