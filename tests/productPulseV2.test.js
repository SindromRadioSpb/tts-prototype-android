"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto"), { EventEmitter } = require("node:events");
const { contractManifest, normalizeEvent, V1_UNTIL } = require("../product-pulse/contract");
const { createDashboard } = require("../product-pulse/dashboard");
const { createDelivery, operationMiddleware } = require("../product-pulse/runtime");
const { createUmamiClient, buildSendPayloads } = require("../product-pulse/umami");
const manifest = contractManifest(), now = Date.parse("2026-09-22T10:00:00.000Z");
function event(name = "app_open", properties = { surface: "studio" }) {
  return { schema_version: 2, event_id: randomUUID(), session_id: randomUUID(), event_name: name, app_version: "3.11.606", occurred_at: new Date(now).toISOString(), properties };
}
function validFor(def) {
  const p = { surface: ["material_open", "study_completed"].includes(def.name) ? "reading_room" : "studio" };
  for (const key of def.required_properties) if (!(key in p)) p[key] = { duration_bucket: "30_sec_2_min", operation: "tts", media_kind: "audio", result: "success" }[key];
  return event(def.name, p);
}
test("v2 manifest drives accepted/rejected event matrix and transport parity", () => {
  assert.equal(manifest.schema_version, 2); assert.equal(manifest.contract_revision, "1.1");
  for (const def of manifest.events) {
    const e = validFor(def); assert.equal(normalizeEvent(e, now).ok, true, def.name);
    for (const key of def.required_properties) { const bad = structuredClone(e); delete bad.properties[key]; assert.equal(normalizeEvent(bad, now).error, "PROPERTY_REQUIRED"); }
    for (const key of def.optional_properties) { const good = structuredClone(e); good.properties[key] = "lt_30_sec"; assert.equal(normalizeEvent(good, now).ok, true); }
    for (const p of manifest.properties) if (!def.properties_used.includes(p.name)) { const bad=structuredClone(e);bad.properties[p.name]=p.values[0];assert.equal(normalizeEvent(bad, now).ok,false); }
    for (const combination of def.forbidden_combinations) { const bad=structuredClone(e);Object.assign(bad.properties,combination);assert.equal(normalizeEvent(bad,now).error,"COMBINATION_NOT_ALLOWED"); }
    for (const key of ["contract_revision","introduced_in","owner","metric","retention_class","status"]) assert.ok(def[key]);
    const bodies=buildSendPayloads({websiteId:"fixture",hostname:"app.test"},e);
    assert.equal(bodies.length,def.name==="app_open"?2:1);
    assert.equal(bodies.filter(b=>b.payload.name===def.name).length,1);
    assert.equal(bodies.at(-1).payload.tag,"pulse-v2");
    assert.deepEqual(Object.keys(bodies.at(-1).payload.data).sort(),["schema_version","app_version",...Object.keys(e.properties)].sort());
  }
});
test("v2 privacy rejects free strings, nested objects, local IDs, unknown envelope and types",()=>{
  for(const props of [{surface:{text:"private"}},{surface:["studio"]},{surface:"studio",note_id:"local-42"},{surface:"https://app.test/?q=secret"},{surface:"studio",operation:"private-user-input"}]) assert.equal(normalizeEvent(event("app_open",props),now).ok,false);
  for(const extra of [{text:"secret"},{metadata:{nested:{url:"https://private"}}},{session_id:"material-123"},{app_version:"text-id-123"},{event_id:123},{properties:null}]) assert.equal(normalizeEvent({...event(),...extra},now).ok,false);
});
test("v2 time bounds are exact; frozen v1 expires and is labelled legacy",()=>{
  for(const delta of [-86400000,300000]) assert.equal(normalizeEvent({...event(),occurred_at:new Date(now+delta).toISOString()},now).ok,true);
  for(const delta of [-86400001,300001]) assert.equal(normalizeEvent({...event(),occurred_at:new Date(now+delta).toISOString()},now).ok,false);
  const v1={...event(),schema_version:1,event_id:"old",session_id:"old",properties:{operation:"formerly-allowed"}};
  assert.equal(normalizeEvent(v1,now).legacy,true);
  assert.equal(normalizeEvent(v1,Date.parse(V1_UNTIL)).error,"SCHEMA_VERSION_EXPIRED");
});
test("bounded delivery is at-most-once, expires dedupe and tolerates outage",async()=>{
  let time=now,calls=0,release;const wait=new Promise(r=>release=r);
  const d=createDelivery({send:async()=>{calls++;await wait;return{accepted:true};}},{now:()=>time,limit:1});
  const e=event(),first=d.deliver(e);
  assert.equal((await d.deliver(e)).duplicate,true);assert.equal((await d.deliver(event())).reason,"capacity");
  release();await first;time+=86400001;await d.deliver(e);assert.equal(calls,2);
  const out=createDelivery({send:async()=>{throw new Error("secret-url");}});
  assert.equal((await out.deliver(event())).reason,"delivery_unavailable");
});
test("operation outcome is emitted once after finish/close, failure/cancel and exclusion",async()=>{
  for(const [code,closed,expected] of [[200,false,"success"],[422,false,"failure"],[200,true,"cancelled"]]) {
    const events=[],res=new EventEmitter();res.statusCode=code;res.writableFinished=!closed;
    operationMiddleware({deliver:async e=>events.push(e),excluded:async()=>false,version:"3.11.606",now:()=>now})({method:"POST",path:"/api/tts"},res,()=>{});
    res.emit(closed?"close":"finish");res.emit("close");await new Promise(r=>setImmediate(r));
    assert.equal(events.length,1);assert.equal(events[0].properties.result,expected);assert.equal(normalizeEvent(events[0],now).ok,true);
  }
  let count=0;const res=new EventEmitter();res.statusCode=200;
  operationMiddleware({deliver:async()=>count++,excluded:async()=>true,version:"3.11.606"})({method:"POST",path:"/api/translate-table-v2"},res,()=>{});res.emit("finish");await new Promise(r=>setImmediate(r));assert.equal(count,0);
});
test("dashboard distinguishes legitimate zero, unavailable, partial; caches and bounds concurrency",async()=>{
  let calls=0,active=0,max=0;
  const read=async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return[];};
  const get=createDashboard({read,stats:async()=>({visits:0,visitors:0,pageviews:0})},{now:()=>now});
  const [a,b]=await Promise.all([get(),get()]);assert.equal(a,b);assert.equal(a.state,"available");assert.equal(a.usage[0].state,"available zero");assert.equal(a.ratios[0].value,null);assert.equal(max,3);const n=calls;await get();assert.equal(calls,n);
  assert.deepEqual(a.usage.map(x=>x.name),manifest.events.map(x=>x.name));
  const unavailable=createDashboard({read:async()=>{throw Error();},stats:async()=>{throw Error();}});assert.equal((await unavailable()).state,"unavailable");
  const partial=createDashboard({read:async()=>[],stats:async()=>({visits:1})});assert.equal((await partial()).state,"partial");
  await assert.rejects(get("all"),/PERIOD_INVALID/);
});
test("deterministic local fake Umami authenticates, sends only app_open pageview, reads without exposing credentials",async()=>{
  const http=require("node:http"),received=[];
  const server=http.createServer(async(req,res)=>{let body="";for await(const part of req)body+=part;res.setHeader("Content-Type","application/json");
    if(req.url==="/api/auth/login")return res.end(JSON.stringify({token:"fixture-secret-token"}));
    if(req.url==="/api/send"){received.push(JSON.parse(body));return res.end("{}");}
    assert.equal(req.headers.authorization,"Bearer fixture-secret-token");assert.ok(req.url.includes("tag=eq.pulse-v2"));res.end(req.url.includes("/stats?")?'{"visits":0,"visitors":0,"pageviews":0}':"[]");
  });
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  try {const c=createUmamiClient(()=>({enabled:true,baseUrl:"http://127.0.0.1:"+server.address().port,websiteId:"site",username:"fixture",password:"fixture-secret",hostname:"app.test"}));
    for(const def of manifest.events)await c.send(validFor(def));
    assert.equal(received.length,8);assert.equal(received.filter(b=>!b.payload.name).length,1);
    const data=await createDashboard(c,{now:()=>now})();assert.equal(data.state,"available");assert.equal(JSON.stringify(data).includes("fixture-secret"),false);
  }finally{await new Promise(r=>server.close(r));}
});
test("real Umami PostgreSQL expanded SUM strings are exact counts; malformed numbers fail closed",async()=>{
  const source={stats:async()=>({visits:1,visitors:1,pageviews:1}),read:async p=>p==="event-data/values"?[{value:"3.11.606",total:"2"}]:[{name:"app_open",pageviews:"1",visitors:1,visits:1,totaltime:"0"}]};
  const data=await createDashboard(source)();assert.equal(data.state,"available");assert.equal(data.usage[0].value,1);assert.equal(data.reliability[0].value,2);
  for(const bad of [null,"",-1,"-1","1.5","9007199254740992",{},"1e3"]){const d=await createDashboard({...source,read:async()=>[{name:"app_open",pageviews:bad,visitors:1}]})();assert.equal(d.usage[0].value,null);}
});
