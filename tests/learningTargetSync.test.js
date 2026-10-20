'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sqlite=require('../db/sqlite'),Log=require('../db/learnerLogRepo'),Projection=require('../db/learnerProjectionRepo');
const Graph=require('../db/learnerGraphRepo'),Alias=require('../public/js/key-alias-core'),Cloud=require('../public/js/cloud-sync');
const parent='pid:1612',child='ft1:1612:PERF-2ms:sh',bare='ft1:1612:PERF-2ms:_';
const row=(id,key,day,kind,meta,grade)=>({id,item_key:key,reviewed_at:`2026-10-${day}T10:00:00.000Z`,kind,source:'form-practice',grade:grade??null,meta_json:JSON.stringify(meta||{})});
test('selected targets survive cloud ingestion/replay/duplicates/annul without merging word history',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lp-target-sync-'));
  t.after(async()=>{await sqlite.closeDb();fs.rmSync(root,{recursive:true,force:true});});
  await sqlite.initDb(path.join(root,'app.db'));
  await sqlite._exec(sqlite.getDb(),"CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('u'); INSERT INTO users VALUES('other');");
  for(const m of ['021_cloud_event_log.sql','022_srs_projections.sql','025_channel_stats.sql'])
    await sqlite._exec(sqlite.getDb(),fs.readFileSync(path.join(__dirname,'../migrations',m),'utf8'));
  const rows=[row('parent-mark',parent,19,'mark',{status:'l4'}),row('parent-review',parent,19,'review',{},3),
    row('child-mark',child,20,'mark',{status:'l2'}),row('child-review',child,20,'review',{},1),
    row('bare-mark',bare,20,'mark',{status:'known'}),row('bare-review',bare,20,'review',{},3)];
  const first=await Log.ingestBatch('u','device-a',{idempotency_key:'first',review_log:rows});
  assert.equal(first.review_log.new,rows.length);await Projection.recomputeForKeys('u',first.new_item_keys);
  const before=await Projection.listProjections('u',{}),parentBefore=before.find(p=>p.item_key===parent);
  assert.equal(before.length,3);assert.equal(before.find(p=>p.item_key===child).reps,1);
  const dup=await Log.ingestBatch('u','device-b',{idempotency_key:'duplicate',review_log:rows});
  assert.equal(dup.review_log.new,0);assert.deepEqual(await Projection.listProjections('u',{}),before);
  assert.deepEqual(Object.keys(await Graph.getKnownWords('u')),[parent]);
  const coverage=await Graph.getCoverageProjection('u',{nowMs:Date.UTC(2026,9,21)});
  assert.deepEqual(Object.keys(coverage.manual),[parent]);assert.equal(coverage.scheduled.length,1);
  const invalid=await Log.ingestBatch('u','device-b',{idempotency_key:'invalid',review_log:[
    row('invalid','ft1:1612:PERF-2ms:fake',21,'review',{},3),
    Alias.aliasRow(child,parent,'2026-10-21T10:00:00.000Z'),Alias.aliasRow(parent,bare,'2026-10-21T10:00:00.000Z')
  ]});
  assert.equal(invalid.review_log.rejected,3);
  const annul=await Log.ingestBatch('u','device-b',{idempotency_key:'annul',review_log:[row('child-annul',child,21,'annul',{annul_of:'child-review'})]});
  await Projection.recomputeForKeys('u',annul.new_item_keys);
  const after=await Projection.listProjections('u',{});
  assert.deepEqual(after.find(p=>p.item_key===parent),parentBefore);
  assert.equal(after.find(p=>p.item_key===bare).reps,1);
  assert.ok(!after.find(p=>p.item_key===child)||after.find(p=>p.item_key===child).reps===0);
  const oracle=await Projection.oracle('u',{});assert.equal(oracle.mismatched,0);assert.equal(oracle.missing,0);
  assert.deepEqual(await Projection.listProjections('other',{}),[]);
  const clean=Cloud.stripMeta(JSON.stringify({status:'l2',keyer_version:1,surface:'שפחדת',answer:'שפחדת',gloss:'что ты боялся'}));
  assert.deepEqual(JSON.parse(clean),{status:'l2',keyer_version:1});assert.ok(!/[א-ת]/.test(child));
});
test('aliases cannot absorb a selected reading into a word or another reading',()=>{
  const events=[Alias.aliasRow(child,parent),Alias.aliasRow(parent,child),Alias.aliasRow(child,bare)];
  for(const event of events)assert.equal(Alias.validate(event).ok,false);
  assert.equal(Alias.mapFromRows(events).size,0);assert.equal(Alias.validate(Alias.aliasRow(child,child)).ok,true);
});
test('unsupported server exercise channels never substitute the lemma for a form',async()=>{
  const KS=require('../db/keyingService');
  assert.equal(await KS.glossForItemKey(child),null);assert.equal(await KS.clozeFormsForItemKey(child),null);
  assert.equal(await KS.dictateFormForItemKey(child),null);
  const display=await KS.displayForItemKey(child);
  assert.match(display,/לפחוד.*форма/);assert.doesNotMatch(display,/PERF-2ms/);KS.unloadNow();
});
