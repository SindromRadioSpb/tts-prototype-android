#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const AdmZip = require("adm-zip");
const sqlite3 = require("sqlite3");

const root = path.resolve(__dirname, "..", "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-group-corpus-"));
const archive = path.join(temp, "fixture.zip");
const dbPath = path.join(temp, "app.db");
const dataDir = path.join(temp, "data");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const dbOpen = (f) => new Promise((resolve, reject) => { const db = new sqlite3.Database(f, (e) => e ? reject(e) : resolve(db)); });
const dbExec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, (e) => e ? reject(e) : resolve()));
const dbClose = (db) => new Promise((resolve) => db.close(resolve));

function makeArchive() {
  const zip = new AdmZip();
  const texts = [], assets = [], notes = [], morph = [];
  for (const p of [1, 13, 101]) {
    const key = sha(Buffer.from("asset-key-" + p));
    const audio = Buffer.from("synthetic-public-domain-audio-" + p);
    zip.addFile("audio/" + key + ".mp3", audio);
    assets.push({ asset_key:key, relative_export_path:"audio/" + key + ".mp3", mime_type:"audio/mpeg", size_bytes:audio.length, content_hash:null });
    texts.push({ text_id:"old-" + p, text_key:"fixture-" + p, title:"Position " + p + ". Public Domain - Fixture " + p,
      level:"A1", tags:["fixture"], source_label:"smoke", topic:null, source_text:"fixture", source_meta:{}, corpus:null,
      rows:[{ row_id:"sentence-" + p, order_index:0, hebrew_plain:"אב", hebrew_niqqud:"אָב", translit:"av", russian:"тест", audio_asset_key:key }],
      text_audio_asset_key:null, created_at:"2026-01-01T00:00:00Z", updated_at:"2026-01-01T00:00:00Z",
      is_archived:false, is_pinned:true, pin_order:1, manual_smart_tag:"mastered", progress:{last_row_idx:1}, bookmarks:[{id:"private"}] });
    notes.push({ id:"note-" + p, text_id:"old-" + p, target_kind:"text", target_id:"old-" + p, note_type:"free", title:"fixture", body_json:"{}", audio_asset_key:null, srs_card_id:"private-card" });
    morph.push({ sentence_id:"sentence-" + p, text_id:"old-" + p, model_version:"fixture", provider:"fixture", tokens:[] });
  }
  const library = { schema_version:1, corpus_meta_version:1, shelves:[], texts, audio_assets:assets };
  const advanced = { schema_version:4, exported_at:"2026-01-01T00:00:00Z", app_id:"fixture", format:"notes-advanced",
    notes, versions:[], links:[], roots:[], sentence_morph:morph, occurrences:[], srs_cards:[{id:"private"}], srs_review_events:[{id:"private"}],
    srs_attempts:[{id:"private"}], srs_card_exports:[{id:"private"}], anki_word_exports:[{id:"private"}], events:[{id:"private"}],
    translation_overrides:[{id:"private"}], review_log:[{id:"private"}], word_status:[{id:"private"}], study_day:[{id:"private"}] };
  const manifest = { library_json_path:"library/library.json", notes_advanced_path:"library/notes_advanced.json" };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
  zip.addFile("library/library.json", Buffer.from(JSON.stringify(library)));
  zip.addFile("library/notes_advanced.json", Buffer.from(JSON.stringify(advanced)));
  zip.writeZip(archive);
}

async function seedDb() {
  const db = await dbOpen(dbPath);
  await dbExec(db, "PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('owner'),('member'),('outsider');");
  await dbExec(db, fs.readFileSync(path.join(root, "migrations", "056_group_song_corpus_p0.sql"), "utf8"));
  await dbExec(db, fs.readFileSync(path.join(root, "migrations", "057_group_corpus_audio_revisions.sql"), "utf8"));
  await dbClose(db);
}

function invoke(apply, expectedSha) {
  const args = [path.join(root,"scripts","premium","group-song-corpus-import.js"), "--archive",archive,"--archive-sha256",expectedSha,
    "--db-path",dbPath,"--data-dir",dataDir,"--owner-user-id","owner","--member-user-id","member",
    "--group-id","fixture-group","--corpus-id","fixture-corpus","--positions","1,13,101"];
  if (apply) args.push("--apply");
  return spawnSync(process.execPath, args, { cwd:root, encoding:"utf8" });
}

(async () => {
  try {
    makeArchive(); await seedDb();
    const archiveSha = sha(fs.readFileSync(archive));
    let p = invoke(false, archiveSha); assert.strictEqual(p.status,0,p.stderr); assert.strictEqual(JSON.parse(p.stdout).mode,"PLAN");
    assert.strictEqual(fs.existsSync(path.join(dataDir,"group-corpora")),false,"plan mutated filesystem");
    p = invoke(false, "0".repeat(64)); assert.notStrictEqual(p.status,0,"wrong archive hash accepted");
    p = invoke(true, archiveSha); assert.strictEqual(p.status,0,p.stderr); assert.strictEqual(JSON.parse(p.stdout).works.length,3);
    // Idempotent exact replay.
    p = invoke(true, archiveSha); assert.strictEqual(p.status,0,p.stderr);
    const revoice = spawnSync(process.execPath, [path.join(root,"scripts","premium","group-corpus-revoice.js"),
      "--db-path",dbPath,"--data-dir",dataDir,"--corpus-id","fixture-corpus","--revision","2","--voice","he-IL-Wavenet-B"], {cwd:root,encoding:"utf8"});
    assert.strictEqual(revoice.status,0,revoice.stderr); const rp=JSON.parse(revoice.stdout);
    assert.strictEqual(rp.mode,"PLAN"); assert.strictEqual(rp.revision,2); assert.strictEqual(rp.works.length,3);
    const bundle = JSON.parse(fs.readFileSync(path.join(dataDir,"group-corpora","fixture-corpus","v1","works","song-pos-001.json"),"utf8"));
    const t = bundle.library.texts[0];
    assert.strictEqual(t.progress,null); assert.deepStrictEqual(t.bookmarks,[]); assert.strictEqual(t.is_pinned,false);
    assert.strictEqual(t.source_meta.group_corpus.visibility,"GROUP_RESTRICTED");
    for (const k of ["srs_cards","srs_review_events","srs_attempts","srs_card_exports","anki_word_exports","events","translation_overrides","review_log","word_status","study_day"])
      assert.deepStrictEqual(bundle.notes_advanced[k],[],"personal payload leaked: " + k);
    assert.strictEqual(bundle.notes_advanced.notes[0].srs_card_id,null);

    process.env.DB_PATH = dbPath; process.env.DATA_DIR = dataDir;
    const sqlite = require(path.join(root,"db","sqlite")); await sqlite.initDb(dbPath);
    const repo = require(path.join(root,"db","groupCorpusRepo"));
    assert.strictEqual((await repo.listCorpora("owner")).length,1);
    assert.strictEqual((await repo.listCorpora("member"))[0].works_count,3);
    assert.strictEqual((await repo.listCorpora("outsider")).length,0);
    await assert.rejects(() => repo.getWork("outsider","fixture-corpus","song-pos-001"), /GROUP_CORPUS_NOT_FOUND/);
    const work = await repo.getWork("member","fixture-corpus","song-pos-001"); assert.ok(work.absolute_path.startsWith(path.resolve(dataDir,"group-corpora") + path.sep));
    const assetKey = bundle.library.audio_assets[0].asset_key;
    const audio = await repo.getAudio("member","fixture-corpus",assetKey); assert.strictEqual(fs.statSync(audio.absolute_path).size,audio.audio.bytes);
    await assert.rejects(() => repo.getAudioTiming("member","fixture-corpus",assetKey), /GROUP_CORPUS_TIMING_NOT_FOUND/);
    const revoiceMod = require(path.join(root,"scripts","premium","group-corpus-revoice"));
    assert.throws(() => revoiceMod.timingBytes({v:1,n:2,got:1,words:[{o:0,t:0}]}), /TIMING_INCOMPLETE/);
    const timingBody = revoiceMod.timingBytes({v:1,n:2,got:2,words:[{o:0,t:0},{o:1,t:0.2}]});
    assert.ok(timingBody.length>0);
    const timingRel = path.join("group-corpora","fixture-corpus","v1","audio",assetKey+".timing.json");
    fs.writeFileSync(path.join(dataDir,timingRel),timingBody);
    const timingSha = crypto.createHash("sha256").update(timingBody).digest("hex");
    const timingDb = await sqlite.getDb();
    await new Promise((resolve,reject)=>timingDb.run(
      "UPDATE group_corpus_audio SET timing_relative_path=?,timing_bytes=?,timing_sha256=? WHERE corpus_id=? AND work_id=? AND asset_key=?",
      [timingRel.replace(/\\/g,"/"),timingBody.length,timingSha,"fixture-corpus","song-pos-001",assetKey],(e)=>e?reject(e):resolve()));
    const timing = await repo.getAudioTiming("member","fixture-corpus",assetKey);
    assert.strictEqual(fs.readFileSync(timing.absolute_path,"utf8"),timingBody.toString("utf8"));
    assert.throws(() => repo.privatePath("group-corpora/../secret"), /GROUP_CORPUS_FILE_INVALID/);
    await sqlite.closeDb();
    process.stdout.write("group-song-corpus-smoke: PASS (plan/hash/privacy/idempotency/membership/path/audio/revoice-plan/timing-gate)\n");
  } finally { fs.rmSync(temp, { recursive:true, force:true }); }
})().catch((e) => { process.stderr.write("group-song-corpus-smoke: FAIL " + (e && e.stack || e) + "\n"); process.exitCode=1; });
