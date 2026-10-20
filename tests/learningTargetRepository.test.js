'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), sqlite3 = require('sqlite3');
const Targets = require('../public/js/learning-targets'), Canon = require('../public/js/lemma-canon');
const { createRepository } = require('../public/js/learning-target-repository');
const Fsrs = require('../public/js/fsrs-core'), Reader = require('../public/js/reader-morph');
async function fixture(t, fault) {
  const db = new sqlite3.Database(':memory:'); t.after(() => new Promise(r => db.close(r)));
  const query = (sql,p=[]) => new Promise((yes,no)=>db.all(sql,p,(e,rows)=>e?no(e):yes(rows)));
  const exec = sql => new Promise((yes,no)=>db.exec(sql,e=>e?no(e):yes()));
  const run = (sql,p=[]) => new Promise((yes,no)=>{
    if(fault&&fault(sql))return no(Error('injected write failure'));
    db.run(sql,p,function(e){e?no(e):yes({changes:this.changes});});
  });
  await exec(`CREATE TABLE word_status(lemma_key TEXT PRIMARY KEY,status TEXT NOT NULL,updated_at TEXT,
    srs_due TEXT,srs_interval INTEGER DEFAULT 0,srs_reps INTEGER DEFAULT 0,srs_lapses INTEGER DEFAULT 0,
    srs_stability REAL,srs_difficulty REAL,srs_reviewed_at TEXT,srs_scheme TEXT,
    srs_text_key TEXT,srs_sentence_id TEXT,srs_order_index INTEGER,srs_surface TEXT);
    CREATE TABLE review_log(id TEXT PRIMARY KEY,item_key TEXT,kind TEXT,reviewed_at TEXT,grade INTEGER,source TEXT,channel TEXT,latency_ms INTEGER,meta_json TEXT);
    INSERT INTO word_status(lemma_key,status,updated_at,srs_due,srs_interval) VALUES('pid:1612','l4','2026-01-01T00:00:00.000Z','2026-12-01T00:00:00.000Z',57);
    INSERT INTO review_log(id,item_key,kind,reviewed_at,source,meta_json) VALUES('parent-event','pid:1612','mark','2026-01-01T00:00:00.000Z','word-mark','{"status":"l4"}');`);
  let n=0;
  const repo=createRepository({query,run,exec,now:()=>new Date(Date.UTC(2026,9,21,0,0,n++)).toISOString(),newId:()=>String(n)},Targets,Canon);
  return {repo,query};
}
const key='ft1:1612:PERF-2ms:sh';
test('enrollment is idempotent, keeps its actual source, and preserves every parent byte',async t=>{
  const {repo,query}=await fixture(t);
  const before=JSON.stringify(await query("SELECT * FROM word_status WHERE lemma_key='pid:1612'"));
  await repo.mark({key,status:'new',enrollOnly:true,source:{textKey:'text',sentenceId:'sentence',orderIndex:21,surface:'שפחדת'}});
  await repo.mark({key,status:'new',enrollOnly:true});
  const rows=await repo.list('pid:1612');assert.equal(rows.length,1);assert.equal(rows[0].status,'new');
  assert.equal(rows[0].srs_surface,'שפחדת');assert.equal(rows[0].srs_due,null);
  assert.equal((await query('SELECT * FROM review_log WHERE item_key=?',[key])).length,1);
  assert.equal(JSON.stringify(await query("SELECT * FROM word_status WHERE lemma_key='pid:1612'")),before);
});
test('a failed mark insert rolls back both projection and enrollment',async t=>{
  const {repo,query}=await fixture(t,sql=>/INSERT INTO review_log/.test(sql));
  await assert.rejects(repo.mark({key,status:'new'}),/injected/);
  assert.equal((await query('SELECT * FROM word_status WHERE lemma_key=?',[key])).length,0);
  assert.equal((await query('SELECT * FROM review_log')).length,1);
});
test('the first level seeds only that target, and later levels preserve its due date',async t=>{
  const {repo,query}=await fixture(t),seed=Reader.manualMarkSeed(Fsrs,'l2',Date.UTC(2026,9,21));
  const meta={...seed.seedMeta,keyer_version:Canon.KEYER_VERSION};
  const seedRow={id:Canon.seedId(key,meta),item_key:key,kind:'seed',reviewed_at:'2026-10-21T00:00:00.000Z',source:'seed-manual',meta};
  await repo.mark({key,status:'l2',seedRow,sched:seed.sched});
  const due=(await repo.list())[0].srs_due;assert.ok(due);
  await repo.mark({key,status:'l4',seedRow,sched:Reader.manualMarkSeed(Fsrs,'l4',Date.UTC(2026,10,1)).sched});
  assert.equal((await repo.list())[0].srs_due,due);
  assert.equal((await query("SELECT * FROM review_log WHERE item_key=? AND kind='seed'",[key])).length,1);
  assert.equal((await query("SELECT status FROM word_status WHERE lemma_key='pid:1612'"))[0].status,'l4');
});
test('a seed failure cannot leave a mark or schedule behind',async t=>{
  const {repo,query}=await fixture(t,sql=>/INSERT INTO review_log/.test(sql)),seed=Reader.manualMarkSeed(Fsrs,'l1',Date.UTC(2026,9,21));
  await assert.rejects(repo.mark({key,status:'l1',seedRow:{id:'seed',item_key:key,kind:'seed',reviewed_at:'2026-10-21T00:00:00.000Z',source:'seed-manual'},sched:seed.sched}));
  assert.equal((await query('SELECT * FROM word_status WHERE lemma_key=?',[key])).length,0);
});
test('re-enrollment does not overwrite a stored assessment and invalid keys write nothing',async t=>{
  const {repo,query}=await fixture(t);
  await repo.mark({key,status:'known'});await repo.mark({key,status:'new',enrollOnly:true});
  assert.equal((await repo.list())[0].status,'known');
  await assert.rejects(repo.mark({key:'pid:1612',status:'new'}),/INVALID/);
  assert.equal((await query('SELECT * FROM review_log')).length,2);
});
