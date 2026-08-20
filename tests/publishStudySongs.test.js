"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const { main } = require("../scripts/premium/publish-study-songs");

const ROOT = path.resolve(__dirname, "..");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-study-songs-runner-")), dataDir = path.join(root, "data"), dbPath = path.join(dataDir, "app.db");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await open(dbPath);
  for (const migration of ["020_identity.sql", "056_group_song_corpus_p0.sql", "057_group_corpus_audio_revisions.sql", "058_group_corpus_catalog_metadata.sql", "063_publication_domain.sql"])
    await exec(db, fs.readFileSync(path.join(ROOT, "migrations", migration), "utf8"));
  const now = "2026-08-20T00:00:00.000Z";
  await run(db, "INSERT INTO users(id,role,display_name) VALUES('owner','owner','Owner')");
  await run(db, "INSERT INTO reading_groups VALUES('songs-group','owner','Учебные песни','ACTIVE',?,?)", [now, now]);
  await run(db, "INSERT INTO reading_group_members VALUES('songs-group','owner','OWNER','ACTIVE',?,?,NULL)", [now, now]);
  await run(db, "INSERT INTO group_corpora VALUES('study-source','songs-group','study-songs-source','Study Songs source','GROUP_RESTRICTED',1,'ACTIVE','LICENSED',?,?)", [now, now]);
  for (let index = 1; index <= 5; index += 1) {
    const workId = "song-" + index, audio = Buffer.from("valid-fixture-audio-" + index), audioKey = sha(audio);
    const bundle = Buffer.from(JSON.stringify({ group_corpus_schema_version: 1, corpus_id: "study-source", work_id: workId, library: { texts: [{ text_key: workId, title: "Song " + index, source_meta: { group_corpus: { corpus_id: "study-source" } }, rows: [{ order_index: 0, hebrew_plain: "שלום", russian: "Привет", audio_asset_key: audioKey }] }], audio_assets: [{ asset_key: audioKey, mime: "audio/mpeg" }] } }));
    const workRel = `group-corpora/study-source/v1/works/${workId}.json`, audioRel = `group-corpora/study-source/v1/audio/${audioKey}.mp3`;
    fs.mkdirSync(path.dirname(path.join(dataDir, workRel)), { recursive: true }); fs.mkdirSync(path.dirname(path.join(dataDir, audioRel)), { recursive: true });
    fs.writeFileSync(path.join(dataDir, workRel), bundle); fs.writeFileSync(path.join(dataDir, audioRel), audio);
    await run(db, `INSERT INTO group_corpus_works(corpus_id,work_id,text_key,position_no,title,artist,source_url,rights_status,bundle_path,bundle_sha256,rows_count,audio_count,notes_count,morph_count,source_updated_at,created_at,updated_at,audio_revision,tags_json)
      VALUES('study-source',?,?,?,?,NULL,NULL,'APPROVED',?,?,1,1,0,0,?,?,?,1,'[]')`, [workId, workId, index, "Song " + index, workRel, sha(bundle), now, now, now]);
    await run(db, `INSERT INTO group_corpus_audio(corpus_id,work_id,asset_key,relative_path,bytes,sha256,mime,created_at,revision) VALUES('study-source',?,?,?,?,?,'audio/mpeg',?,1)`, [workId, audioKey, audioRel, audio.length, audioKey, now]);
  }
  await close(db); return { root, dataDir, dbPath };
}

test("production runner publishes a pilot then a full immutable edition and is restart-safe", async () => {
  const value = await fixture();
  try {
    const beforeDb = await open(value.dbPath), before = await get(beforeDb, "SELECT COUNT(*) works,COALESCE(SUM(audio_count),0) audio FROM group_corpus_works WHERE corpus_id='study-source'"); await close(beforeDb);
    const dry = await main(["--db-path", value.dbPath, "--data-dir", value.dataDir, "--source-corpus-id", "study-source", "--expected-works", "5", "--pilot-size", "2"]);
    assert.equal(dry.mode, "DRY_RUN"); assert.equal(dry.source.works, 5);
    const first = await main(["--apply", "--db-path", value.dbPath, "--data-dir", value.dataDir, "--source-corpus-id", "study-source", "--expected-works", "5", "--pilot-size", "2"]);
    assert.equal(first.ok, true); assert.equal(first.pilot.items, 2); assert.equal(first.full.items, 5); assert.equal(first.source_unchanged, true); assert.equal(first.learner_private_review_unchanged, true);
    const second = await main(["--apply", "--db-path", value.dbPath, "--data-dir", value.dataDir, "--source-corpus-id", "study-source", "--expected-works", "5", "--pilot-size", "2"]);
    assert.equal(second.ok, true); assert.equal(second.full.items, 5); assert.equal(second.full_receipt, null);
    const db = await open(value.dbPath);
    const editions = await all(db, "SELECT edition_number,item_count FROM published_corpus_editions ORDER BY edition_number");
    const after = await get(db, "SELECT COUNT(*) works,COALESCE(SUM(audio_count),0) audio FROM group_corpus_works WHERE corpus_id='study-source'");
    const rights = await get(db, `SELECT COUNT(*) n,SUM(allowed) allowed,COUNT(DISTINCT permission) permissions FROM publication_rights_facts f
      JOIN published_corpus_edition_items i ON i.source_item_id=f.item_id WHERE i.edition_id=(SELECT current_edition_id FROM published_corpora WHERE slug='study-songs')`);
    await close(db);
    assert.deepEqual(editions, [{ edition_number: 1, item_count: 2 }, { edition_number: 2, item_count: 5 }]); assert.deepEqual(after, before);
    assert.deepEqual(rights, { n: 15, allowed: 15, permissions: 3 });
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});
