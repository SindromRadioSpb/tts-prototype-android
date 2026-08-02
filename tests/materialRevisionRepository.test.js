const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const Core = require('../public/js/material-revision-core.js');
const Repository = require('../public/js/material-revision-repository.js');

let SQL;
test.before(async () => { SQL = await initSqlJs(); });

async function migration46() {
  const migrations = await import('../public/db/migrations.js');
  assert.equal(migrations.MIGRATIONS.length, 47, 'v47 must follow the existing v46 material migration');
  return migrations.MIGRATIONS[45];
}

async function harness() {
  const db = new SQL.Database();
  db.run(`PRAGMA foreign_keys=ON;
    CREATE TABLE texts(id TEXT PRIMARY KEY, text_key TEXT, source_meta_json TEXT, updated_at TEXT);
    CREATE TABLE sentences(
      id TEXT PRIMARY KEY, text_id TEXT NOT NULL, order_index INTEGER NOT NULL,
      he_plain TEXT, he_niqqud TEXT, translit TEXT, translit_ru TEXT, ru TEXT,
      meta_json TEXT, edit_meta_json TEXT, translation_provider TEXT, translation_meta_json TEXT,
      created_at TEXT, UNIQUE(text_id, order_index)
    );
    CREATE TABLE studio_media_packages(package_id TEXT PRIMARY KEY);
    CREATE TABLE studio_caption_revisions(revision_id TEXT PRIMARY KEY, canonical_sha256 TEXT);
    CREATE TABLE studio_text_media_bindings(text_id TEXT PRIMARY KEY, package_id TEXT, revision_id TEXT, revision_sha256 TEXT, mapping_json TEXT);
  `);
  db.run(await migration46());
  const rows = (sql, params = []) => { const s = db.prepare(sql); s.bind(params); const out=[]; while(s.step()) out.push(s.getAsObject()); s.free(); return out; };
  const adapter = {
    dbQuery: async (sql,p) => rows(sql,p),
    dbRun: async (sql,p) => { const s=db.prepare(sql); s.run(p||[]); s.free(); return {changes:db.getRowsModified()}; },
    execRaw: async (sql) => db.run(sql),
  };
  db.run("INSERT INTO texts VALUES ('text-1','portable-1','{\"provider\":\"gcp\",\"model\":\"nmt-v1\"}','2026-08-01T00:00:00Z')");
  db.run("INSERT INTO sentences VALUES ('s1','text-1',0,'שלום','שָׁלוֹם','shalom','шалом','привет',NULL,'{\"edited\":{\"ru\":true}}','gcp','{\"model\":\"nmt-v1\"}','2026-08-01T00:00:00Z')");
  db.run("INSERT INTO sentences VALUES ('s2','text-1',1,'מיה','','Mia','Мия','Мия',NULL,NULL,'gcp','{\"model\":\"nmt-v1\"}','2026-08-01T00:00:00Z')");
  return { db, rows, repo: Repository.createRepository(adapter, Core) };
}

test('migration v46 creates the first-class material revision schema', async () => {
  const h=await harness();
  const names=h.rows("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%' ORDER BY name").map(x=>x.name);
  for (const name of ['studio_learning_materials','studio_table_revisions','studio_learning_row_versions','studio_table_revision_rows']) assert.ok(names.includes(name), name);
});

test('legacy promotion is idempotent, preserves sentence ids and promotes manual authority', async () => {
  const h=await harness();
  const first=await h.repo.promoteLegacyText('text-1');
  const second=await h.repo.promoteLegacyText('text-1');
  assert.equal(second.material_id, first.material_id);
  assert.equal(second.current_table_revision_id, first.current_table_revision_id);
  assert.equal(h.rows('SELECT COUNT(*) n FROM studio_learning_materials')[0].n,1);
  assert.equal(h.rows('SELECT COUNT(*) n FROM studio_table_revisions')[0].n,1);
  const current=await h.repo.getCurrentRevision(first.material_id);
  assert.deepEqual(current.rows.map(r=>r.stable_row_id),['s1','s2']);
  assert.deepEqual(current.rows[0].field_meta.ru,{authority:'user',locked:true,status:'current'});
});

test('immutable commit updates compatibility projection atomically and keeps history', async () => {
  const h=await harness(); const material=await h.repo.promoteLegacyText('text-1');
  const base=await h.repo.getCurrentRevision(material.material_id);
  const next=JSON.parse(JSON.stringify(base.rows));
  next[1].ru='Миа'; next[1].field_meta.ru={authority:'user',locked:true};
  next.push({stable_row_id:'s3',he_plain:'חדשה',he_niqqud:'',translit:'hadasha',translit_ru:'хадаша',ru:'новая',caption_segment_id:null,source_segment_ids:[],field_meta:{}});
  const committed=await h.repo.commitRevision({material_id:material.material_id,base_table_revision_id:base.table_revision_id,rows:next,impact:{kind:'manual'}});
  assert.equal(committed.revision_no,2);
  assert.equal(h.rows('SELECT COUNT(*) n FROM studio_table_revisions')[0].n,2);
  assert.deepEqual(h.rows('SELECT id,ru,order_index FROM sentences ORDER BY order_index'),[
    {id:'s1',ru:'привет',order_index:0},{id:'s2',ru:'Миа',order_index:1},{id:'s3',ru:'новая',order_index:2},
  ]);
});

test('stale base and injected faults never advance canon or projection', async () => {
  for (const fault of [null,'after_revision_insert','after_projection','before_commit']) {
    const h=await harness(); const material=await h.repo.promoteLegacyText('text-1'); const base=await h.repo.getCurrentRevision(material.material_id);
    if (fault) {
      await assert.rejects(()=>h.repo.commitRevision({material_id:material.material_id,base_table_revision_id:base.table_revision_id,rows:[{...base.rows[0],ru:'сломано'},base.rows[1]],fault_inject:fault}),new RegExp('FAULT_INJECT:'+fault));
      assert.equal((await h.repo.getCurrentRevision(material.material_id)).table_revision_id,base.table_revision_id);
      assert.equal(h.rows("SELECT ru FROM sentences WHERE id='s1'")[0].ru,'привет');
    } else {
      const committed=await h.repo.commitRevision({material_id:material.material_id,base_table_revision_id:base.table_revision_id,rows:base.rows});
      await assert.rejects(()=>h.repo.commitRevision({material_id:material.material_id,base_table_revision_id:base.table_revision_id,rows:base.rows}),/TABLE_BASE_STALE/);
      assert.equal((await h.repo.getCurrentRevision(material.material_id)).table_revision_id,committed.table_revision_id);
    }
  }
});
