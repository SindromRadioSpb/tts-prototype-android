#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3317;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-api-"));
const data = path.join(tmp, "data");
const dbPath = path.join(data, "app.db");
const secret = "publication-center-smoke-secret";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const close = db => new Promise(resolve => db.close(resolve));
async function readOnlyFingerprint(file) {
  const db = await open(file);
  try {
    const tables = ["review_log", "learner_events", "reading_lists", "reading_list_items", "bookmarks", "word_status", "audit_log", "group_corpora", "group_corpus_works", "group_corpus_audio"];
    const out = {};
    for (const table of tables) {
      const exists = await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?", [table]);
      if (exists) out[table] = await get(db, `SELECT COUNT(*) rows,COALESCE(SUM(length(CAST(rowid AS TEXT))),0) rowid_bytes FROM "${table}"`);
    }
    return out;
  } finally { await close(db); }
}

async function ready() {
  for (let index = 0; index < 120; index += 1) {
    try { const response = await fetch(BASE + "/healthz"); const body = await response.json(); if (response.ok && body.db && body.db.ready && body.migrations && body.migrations.ready) return true; } catch (_) {}
    await sleep(150);
  }
  return false;
}
async function stop(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const done = await new Promise(resolve => { const timer = setTimeout(() => resolve(false), 5000); child.once("exit", () => { clearTimeout(timer); resolve(true); }); });
  if (!done && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
async function removeTemp() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); return; }
    catch (error) { if (error && error.code !== "EBUSY" && error.code !== "EPERM") throw error; await sleep(200); }
  }
  throw new Error("TEMP_CLEANUP_BUSY: " + tmp);
}

(async () => {
  fs.mkdirSync(data, { recursive: true });
  const server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BIND_HOST: "127.0.0.1", DATA_DIR: data, DB_PATH: dbPath, AUTH_BOOTSTRAP_SECRET: secret }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  try {
    assert.ok(await ready(), logs);
    let response = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, deviceLabel: "publication-smoke" }) });
    const login = await response.json();
    assert.strictEqual(response.status, 200, JSON.stringify(login) + "\n" + logs);
    const cookie = String(response.headers.get("set-cookie") || "").split(";")[0];
    const authHeaders = { Cookie: cookie, "Content-Type": "application/json", "X-LP-CSRF": login.csrf, Origin: BASE };

    const audio = Buffer.from("publication-smoke-original-audio");
    const bundle = Buffer.from(JSON.stringify({ library: { texts: [{ text_key: "study-song-1", title: "Fixture song", rows: [{ order_index: 0, hebrew_plain: "שלום עולם", hebrew_niqqud: "שָׁלוֹם עוֹלָם", transliteration: "shalom olam", russian: "Привет, мир", audio_asset_key: sha(audio) }] }], audio_assets: [{ asset_key: sha(audio), mime: "audio/mpeg" }] }, notes_advanced: {} }));
    const workRel = "group-corpora/study-songs/v1/works/song-1.json";
    const audioRel = "group-corpora/study-songs/v1/audio/" + sha(audio) + ".mp3";
    fs.mkdirSync(path.dirname(path.join(data, workRel)), { recursive: true });
    fs.mkdirSync(path.dirname(path.join(data, audioRel)), { recursive: true });
    fs.writeFileSync(path.join(data, workRel), bundle);
    fs.writeFileSync(path.join(data, audioRel), audio);
    const db = await open(dbPath), now = new Date().toISOString();
    await run(db, "INSERT INTO reading_groups VALUES(?,?,'Study Songs','ACTIVE',?,?)", ["study-group", login.user.id, now, now]);
    await run(db, "INSERT INTO reading_group_members VALUES(?,?,'OWNER','ACTIVE',?,?,NULL)", ["study-group", login.user.id, now, now]);
    await run(db, "INSERT INTO group_corpora VALUES(?,'study-group','study-songs-source','Study Songs source','GROUP_RESTRICTED',1,'ACTIVE','LICENSED',?,?)", ["study-source", now, now]);
    await run(db, `INSERT INTO group_corpus_works(corpus_id,work_id,text_key,position_no,title,artist,source_url,rights_status,bundle_path,bundle_sha256,rows_count,audio_count,notes_count,morph_count,source_updated_at,created_at,updated_at,audio_revision,audio_profile_json,audio_published_at,level,topic,tags_json,source_created_at)
      VALUES('study-source','song-1','study-song-1',1,'Fixture song','Fixture artist',NULL,'APPROVED',?,?,1,1,0,0,?,?,?,1,NULL,NULL,'A1','songs','["song"]',?)`, [workRel, sha(bundle), now, now, now, now]);
    await run(db, `INSERT INTO group_corpus_audio(corpus_id,work_id,asset_key,relative_path,bytes,sha256,mime,created_at,revision)
      VALUES('study-source','song-1',?,?,?,?,'audio/mpeg',?,1)`, [sha(audio), audioRel, audio.length, sha(audio), now]);
    const sourceBefore = await get(db, "SELECT COUNT(*) works,COALESCE(SUM(audio_count),0) audio FROM group_corpus_works WHERE corpus_id='study-source'");
    const sourceHashBefore = (await get(db, "SELECT bundle_sha256 FROM group_corpus_works WHERE corpus_id='study-source' AND work_id='song-1'")).bundle_sha256;
    const reviewBefore = Number((await get(db, "SELECT COUNT(*) n FROM review_log")).n);
    await close(db);

    response = await fetch(BASE + "/api/publication/corpora");
    assert.strictEqual(response.status, 401, "anonymous reached writer list");
    response = await fetch(BASE + "/api/publication/corpora", { method: "POST", headers: { ...authHeaders, Origin: "https://attacker.invalid", "X-Idempotency-Key": "bad-origin" }, body: JSON.stringify({ slug: "study-songs", title: "Study Songs" }) });
    assert.strictEqual(response.status, 403, "cross-origin write accepted");
    response = await fetch(BASE + "/api/publication/corpora", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: BASE, "X-Idempotency-Key": "no-csrf" }, body: JSON.stringify({ slug: "study-songs", title: "Study Songs" }) });
    assert.strictEqual(response.status, 403, "write accepted without CSRF");

    response = await fetch(BASE + "/api/publication/corpora", { method: "POST", headers: { ...authHeaders, "X-Idempotency-Key": "create-study-songs" }, body: JSON.stringify({ slug: "study-songs", title: "Study Songs", description: "Fixture" }) });
    const createdText = await response.text(); assert.strictEqual(response.status, 201, createdText); const created = JSON.parse(createdText);
    response = await fetch(BASE + `/api/publication/corpora/${created.corpus_id}/draft/items:copy`, { method: "POST", headers: { ...authHeaders, "X-Idempotency-Key": "copy-snapshot" }, body: JSON.stringify({ sourceDomain: "GROUP_CORPUS", sourceCorpusId: "study-source", workIds: ["song-1"], expectedVersion: created.draft_version }) });
    const copiedText = await response.text(); assert.strictEqual(response.status, 200, copiedText); const copied = JSON.parse(copiedText);
    response = await fetch(BASE + `/api/publication/corpora/${created.corpus_id}/draft/rights:apply-study-songs-preset`, { method: "POST", headers: { ...authHeaders, "X-Idempotency-Key": "rights-snapshot" }, body: JSON.stringify({ itemIds: copied.items.map(item => item.item_id), expectedVersion: copied.draft_version, preset: { public_read_allowed: true, public_stream_allowed: true, package_download_allowed: true, basis: "OWNER_ATTESTATION_2026_08_20", asserted_at: "2026-08-20" } }) });
    const rightsText = await response.text(); assert.strictEqual(response.status, 200, rightsText); const rights = JSON.parse(rightsText); assert.strictEqual(rights.facts_created, 3);
    response = await fetch(BASE + `/api/publication/corpora/${created.corpus_id}/draft:validate`, { method: "POST", headers: { ...authHeaders, "X-Idempotency-Key": "validate-snapshot" }, body: JSON.stringify({ expectedVersion: rights.draft_version }) });
    const validationText = await response.text(); assert.strictEqual(response.status, 200, validationText); const validation = JSON.parse(validationText); assert.strictEqual(validation.ready, true); assert.strictEqual(validation.asset_missing, 0);
    const publishHeaders = { ...authHeaders, "X-Idempotency-Key": "publish-study-songs" };
    response = await fetch(BASE + `/api/publication/corpora/${created.corpus_id}:publish`, { method: "POST", headers: publishHeaders, body: JSON.stringify({ expectedVersion: rights.draft_version }) });
    const receiptText = await response.text(); assert.strictEqual(response.status, 200, receiptText); const receipt = JSON.parse(receiptText); assert.strictEqual(receipt.canonical_committed, true); assert.strictEqual(receipt.item_count, 1); assert.strictEqual(receipt.asset_count, 1); assert.strictEqual(receipt.package_complete, true);
    response = await fetch(BASE + `/api/publication/corpora/${created.corpus_id}:publish`, { method: "POST", headers: publishHeaders, body: JSON.stringify({ expectedVersion: rights.draft_version }) });
    assert.strictEqual(response.status, 200); assert.strictEqual((await response.json()).edition_id, receipt.edition_id, "idempotent publish created another edition");

    const sensitiveBeforePublicReads = await readOnlyFingerprint(dbPath);
    response = await fetch(BASE + "/api/group-corpora");
    assert.strictEqual(response.status, 401, "anonymous group corpus read became public");
    response = await fetch(BASE + "/api/public-corpora");
    assert.strictEqual(response.status, 200); assert.strictEqual(response.headers.get("set-cookie"), null); assert.match(response.headers.get("cache-control"), /public/);
    const publicList = await response.json(); assert.strictEqual(publicList.corpora.length, 1); assert.strictEqual(publicList.corpora[0].slug, "study-songs");
    response = await fetch(BASE + "/api/public-corpora/study-songs");
    assert.strictEqual(response.status, 200); assert.match(response.headers.get("etag"), /^[\"].{64}[\"]$/);
    const catalog = await response.json(); assert.strictEqual(catalog.items.length, 1); assert.strictEqual(catalog.items[0].public_read_allowed, 1); assert.strictEqual(catalog.items[0].public_stream_allowed, 1); assert.strictEqual(catalog.items[0].package_download_allowed, 1);
    const publicWorkId = catalog.items[0].public_work_id;
    response = await fetch(BASE + "/api/public-corpora/study-songs/works?limit=1&q=fixture&sort=title&facet=complete");
    const page = await response.json(); assert.strictEqual(response.status, 200); assert.strictEqual(page.items.length, 1); assert.strictEqual(page.next_cursor, null);
    response = await fetch(BASE + "/api/public-corpora/study-songs/works/" + encodeURIComponent(publicWorkId));
    const publicWorkText = await response.text(); assert.strictEqual(response.status, 200, publicWorkText); assert.doesNotMatch(publicWorkText, /study-source|group_corpus|study-group/);
    const publicWork = JSON.parse(publicWorkText); assert.strictEqual(publicWork.assets.length, 1); assert.strictEqual(publicWork.item.snapshot.library.texts[0].rows[0].hebrew_plain, "שלום עולם");
    const publicAssetKey = publicWork.assets[0].asset_key;
    response = await fetch(BASE + "/api/public-corpora/study-songs/assets/" + publicAssetKey, { headers: { Range: "bytes=0-3" } });
    assert.strictEqual(response.status, 206); assert.strictEqual(Buffer.from(await response.arrayBuffer()).length, 4); assert.match(response.headers.get("cache-control"), /immutable/);
    response = await fetch(BASE + "/api/public-corpora/study-songs/package");
    const packageBytes = Buffer.from(await response.arrayBuffer()); assert.strictEqual(response.status, 200); assert.strictEqual(packageBytes.subarray(0, 2).toString(), "PK"); assert.strictEqual(response.headers.get("x-publication-package-complete"), "true"); assert.strictEqual(response.headers.get("x-publication-asset-missing"), "0");
    const sensitiveAfterPublicReads = await readOnlyFingerprint(dbPath);
    assert.deepStrictEqual(sensitiveAfterPublicReads, sensitiveBeforePublicReads, "anonymous GET changed source, learner, review or audit state");

    response = await fetch(BASE + `/api/publication/corpora/${created.corpus_id}:withdraw`, { method: "POST", headers: { ...authHeaders, "X-Idempotency-Key": "withdraw-smoke" }, body: JSON.stringify({ reasonCode: "SMOKE" }) });
    assert.strictEqual(response.status, 200);
    const withdrawn = await fetch(BASE + "/api/public-corpora/study-songs");
    const unknown = await fetch(BASE + "/api/public-corpora/not-a-real-corpus");
    assert.strictEqual(withdrawn.status, 404); assert.strictEqual(unknown.status, 404); assert.strictEqual(await withdrawn.text(), await unknown.text(), "withdrawn and unknown responses disclose different facts");
    response = await fetch(BASE + `/api/publication/corpora/${created.corpus_id}:restore`, { method: "POST", headers: { ...authHeaders, "X-Idempotency-Key": "restore-smoke" }, body: JSON.stringify({ editionId: receipt.edition_id, reasonCode: "SMOKE" }) });
    assert.strictEqual(response.status, 200); assert.strictEqual((await fetch(BASE + "/api/public-corpora/study-songs")).status, 200);

    const verify = await open(dbPath);
    const sourceAfter = await get(verify, "SELECT COUNT(*) works,COALESCE(SUM(audio_count),0) audio FROM group_corpus_works WHERE corpus_id='study-source'");
    const sourceHashAfter = (await get(verify, "SELECT bundle_sha256 FROM group_corpus_works WHERE corpus_id='study-source' AND work_id='song-1'")).bundle_sha256;
    const reviewAfter = Number((await get(verify, "SELECT COUNT(*) n FROM review_log")).n);
    const facts = await get(verify, "SELECT COUNT(*) n,SUM(allowed) allowed,COUNT(DISTINCT permission) permissions,MIN(basis) basis,MIN(asserted_at) asserted_at FROM publication_rights_facts");
    const editions = Number((await get(verify, "SELECT COUNT(*) n FROM published_corpus_editions")).n);
    await close(verify);
    assert.deepStrictEqual(sourceAfter, sourceBefore); assert.strictEqual(sourceHashAfter, sourceHashBefore); assert.strictEqual(reviewAfter, reviewBefore);
    assert.deepStrictEqual({ n: facts.n, allowed: facts.allowed, permissions: facts.permissions, basis: facts.basis, asserted_at: facts.asserted_at }, { n: 3, allowed: 3, permissions: 3, basis: "OWNER_ATTESTATION_2026_08_20", asserted_at: "2026-08-20" });
    assert.strictEqual(editions, 1);
    console.log("publication-center-api-smoke: PASS (writer isolation + anonymous catalog/work/Range-audio/ZIP + generic withdrawal + GET source/learner/review/audit unchanged)");
  } finally {
    await stop(server);
    try { await removeTemp(); } catch (error) { console.warn(error.message); }
  }
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
