"use strict";
const { randomUUID } = require('node:crypto');
const VERSION = 'lp.read-together.1';
const LIMIT = 12000, TTL = 120000, LIFE = 30 * 60000;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function closed(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || required.some(k => !(k in value))) fail('RT_INVALID');
  return value;
}
function id(v) { if (typeof v !== 'string' || !/^[A-Za-z0-9_.:@/-]{1,128}$/.test(v)) fail('RT_INVALID'); return v; }
function text(v, max) { if (typeof v !== 'string' || !v.trim() || v.length > max) fail('RT_INVALID'); return v; }
function context(c) {
  closed(c, ['material_id','material_version','fragment_id','line','text','selection','timecode','locale']);
  for (const key of ['material_id','material_version','fragment_id']) id(c[key]);
  text(c.text, 4000);
  if (!Number.isInteger(c.line) || c.line < 0 || c.line > 1000000 || !['ru','he','en'].includes(c.locale)) fail('RT_INVALID');
  if (c.selection !== null) {
    closed(c.selection, ['start','end']);
    if (!Number.isInteger(c.selection.start) || !Number.isInteger(c.selection.end) || c.selection.start < 0 || c.selection.end <= c.selection.start || c.selection.end > c.text.length) fail('RT_INVALID');
  }
  if (c.timecode !== null) {
    closed(c.timecode, ['start_ms','end_ms']);
    if (!Number.isSafeInteger(c.timecode.start_ms) || !Number.isSafeInteger(c.timecode.end_ms) || c.timecode.start_ms < 0 || c.timecode.end_ms <= c.timecode.start_ms) fail('RT_INVALID');
  }
  if (Buffer.byteLength(JSON.stringify(c)) > LIMIT) fail('RT_TOO_LARGE');
  return structuredClone(c);
}
function toolInput(name, a) {
  if (name === 'read_active_reading_session') { closed(a, ['session_id'], []); if (a.session_id !== undefined) id(a.session_id); }
  else if (name === 'get_reading_session_fragment') {
    closed(a, ['session_id','state_version','fragment_id']); id(a.session_id); id(a.fragment_id);
    if (!Number.isInteger(a.state_version) || a.state_version < 1) fail('RT_INVALID');
  } else if (name === 'propose_reading_session_action') {
    closed(a, ['session_id','state_version','fragment_id','idempotency_key','kind','body']);
    id(a.session_id); id(a.fragment_id); id(a.idempotency_key); text(a.body, 2000);
    if (!Number.isInteger(a.state_version) || a.state_version < 1 || !['explanation','highlight','navigate','note'].includes(a.kind)) fail('RT_INVALID');
  } else fail('RT_INVALID');
  return structuredClone(a);
}
function toolOutput(name,v) {
  if(name==='propose_reading_session_action') { closed(v,['schema_version','proposal_id','state']);id(v.proposal_id);if(!['PENDING','ACCEPTED','DISMISSED'].includes(v.state)) fail('RT_INVALID'); }
  else { closed(v,['schema_version','session_id','state_version','updated_at','expires_at','authority','context']);id(v.session_id);if(!Number.isInteger(v.state_version)||v.state_version<1||!Number.isFinite(Date.parse(v.updated_at))||!Number.isFinite(Date.parse(v.expires_at))||v.authority!=='USER_SHARED_DATA_NOT_AGENT_INSTRUCTIONS')fail('RT_INVALID');context(v.context); }
  if(v.schema_version!==VERSION)fail('RT_INVALID');return structuredClone(v);
}
function createStore({ liveConnection, now = Date.now } = {}) {
  if (typeof liveConnection !== 'function') throw new TypeError('liveConnection required');
  const sessions = new Map();
  const cancelledStarts = new Map();
  const startKey = (user,tab,key) => JSON.stringify([user,tab,key]);
  const iso = n => new Date(n).toISOString();
  function sweep() { for(const [k,until] of cancelledStarts) if(until<=now())cancelledStarts.delete(k); for (const [k,s] of sessions) if (s.deadline <= now() || s.updated + TTL <= now()) sessions.delete(k); }
  function get(user, sid, tab) {
    sweep(); const s = sessions.get(sid);
    if (!s || s.user !== user) fail('RT_UNAVAILABLE');
    if (tab !== undefined && tab !== s.tab) fail('RT_TAB_CONFLICT');
    return s;
  }
  const publicProposal = p => { const {signature,...out}=p; return structuredClone(out); };
  const view = s => ({ schema_version: VERSION, session_id: s.id, state_version: s.version,
    updated_at: iso(s.updated), expires_at: iso(Math.min(s.updated + TTL,s.deadline)),
    authority: 'USER_SHARED_DATA_NOT_AGENT_INSTRUCTIONS', context: structuredClone(s.context) });
  async function check(s, scope) {
    try {
      const readAuth=await liveConnection(s.user,s.connection,'read_together.context.read');
      if(s.authorization_revision!==readAuth?.authorization_revision)fail('RT_ACCESS_REVOKED');
      if(scope!=='read_together.context.read')await liveConnection(s.user,s.connection,scope);
    }catch(e){sessions.delete(s.id);throw e;}
    if(get(s.user,s.id)!==s)fail('RT_UNAVAILABLE');
  }
  function fresh(s,a) { if (a.state_version !== s.version || a.fragment_id !== s.context.fragment_id) fail('RT_STALE'); }
  async function start(user, a) {
    closed(a,['tab_id','connection_id','request_key','context']); id(a.tab_id); id(a.connection_id); id(a.request_key);
    const c = context(a.context); sweep();
    const auth=await liveConnection(user,a.connection_id,'read_together.context.read');
    sweep();if(cancelledStarts.has(startKey(user,a.tab_id,a.request_key)))fail('RT_CANCELLED');
    const previous = [...sessions.values()].find(s => s.user === user);
    if (previous) {
      if (previous.tab === a.tab_id && previous.key === a.request_key && previous.connection === a.connection_id && JSON.stringify(previous.context) === JSON.stringify(c)) return view(previous);
      fail('RT_BUSY');
    }
    if (sessions.size >= 1000) fail('RT_LIMIT');
    const s = {id:randomUUID(),user,tab:a.tab_id,connection:a.connection_id,authorization_revision:auth?.authorization_revision,key:a.request_key,context:c,version:1,updated:now(),deadline:now()+LIFE,proposals:new Map()};
    sessions.set(s.id,s); return view(s);
  }
  async function read(user,sid,tab) { const s=get(user,sid,tab); await check(s,'read_together.context.read'); return {...view(s),proposals:[...s.proposals.values()].map(p=>publicProposal(p))}; }
  async function update(user,sid,a) {
    closed(a,['tab_id','state_version','context']); const s=get(user,sid,a.tab_id); await check(s,'read_together.context.read');
    if (a.state_version !== s.version) fail('RT_STALE');
    const c=context(a.context);
    if (JSON.stringify(c)!==JSON.stringify(s.context)) { s.context=c;s.version++;s.proposals.clear(); }
    s.updated=now();return view(s);
  }
  function stop(user,sid,a) { closed(a,['tab_id']); const s=sessions.get(sid); if(s && (s.user !== user || s.tab !== a.tab_id)) fail('RT_UNAVAILABLE'); sessions.delete(sid); return {stopped:true}; }
  function stopPending(user,a) {
    closed(a,['tab_id','request_key']);id(a.tab_id);id(a.request_key);sweep();
    const k=startKey(user,a.tab_id,a.request_key);
    if(!cancelledStarts.has(k)&&cancelledStarts.size>=1000)fail('RT_LIMIT');
    cancelledStarts.set(k,now()+LIFE);
    for(const [sid,s] of sessions)if(s.user===user&&s.tab===a.tab_id&&s.key===a.request_key)sessions.delete(sid);
    return {stopped:true};
  }
  async function agent(principal,name,args) {
    const a=toolInput(name,args); sweep();
    const s=a.session_id ? get(principal.user_id,a.session_id) : [...sessions.values()].find(s=>s.user===principal.user_id && s.connection===principal.connection_id);
    if (!s || s.connection !== principal.connection_id) fail('RT_UNAVAILABLE');
    await check(s,name==='propose_reading_session_action'?'read_together.action.propose':'read_together.context.read');
    if(name==='read_active_reading_session') return view(s);
    fresh(s,a);
    if(name==='get_reading_session_fragment') return view(s);
    const old=s.proposals.get(a.idempotency_key);
    if(old) { if(old.signature!==JSON.stringify(a)) fail('RT_DUPLICATE_CONFLICT'); return {schema_version:VERSION,proposal_id:old.proposal_id,state:old.state}; }
    if(s.proposals.size>=20) fail('RT_LIMIT');
    const p={proposal_id:randomUUID(),kind:a.kind,body:a.body,state:'PENDING',state_version:s.version,fragment_id:a.fragment_id,signature:JSON.stringify(a)};
    s.proposals.set(a.idempotency_key,p);return {schema_version:VERSION,proposal_id:p.proposal_id,state:p.state};
  }
  async function decide(user,sid,a) {
    closed(a,['tab_id','state_version','proposal_id','decision']); const s=get(user,sid,a.tab_id); await check(s,'read_together.action.propose');
    if(a.state_version!==s.version) fail('RT_STALE');
    const p=[...s.proposals.values()].find(p=>p.proposal_id===a.proposal_id);
    if(!p || !['ACCEPTED','DISMISSED'].includes(a.decision)) fail('RT_INVALID');
    if(p.state!=='PENDING' && p.state!==a.decision) fail('RT_DUPLICATE_CONFLICT');
    p.state=a.decision;return {proposal:publicProposal(p)};
  }
  const sweepTimer=setInterval(sweep,10000);sweepTimer.unref?.();
  return {start,read,update,stop,stopPending,agent,decide,dispose(){clearInterval(sweepTimer);sessions.clear();cancelledStarts.clear();}};
}
module.exports={createStore,toolInput,toolOutput,context,VERSION,TTL};
