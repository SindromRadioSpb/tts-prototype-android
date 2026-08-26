"use strict";

// Isolated HTTP acceptance for PHYSICS-SOLUTION-DOCUMENTS-R2. Every byte lives
// under mkdtemp; no account/owner/production database is opened.

const assert = require("node:assert/strict");
const child = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");

const ROOT = path.resolve(__dirname, "../..");
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.unref(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function waitFor(url, processRef) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (processRef.exitCode != null) throw new Error("SMOKE_SERVER_EXITED:" + processRef.exitCode);
    try { const response = await fetch(url); if (response.ok) { const body = await response.json(); if (body && body.db && body.db.ready && body.migrations && body.migrations.ready) return; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("SMOKE_SERVER_TIMEOUT");
}
async function stop(processRef) {
  if (!processRef || processRef.exitCode != null) return;
  processRef.kill("SIGTERM");
  await Promise.race([new Promise(resolve => processRef.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (processRef.exitCode == null) processRef.kill("SIGKILL");
}
async function start(dataDir, port, enabled) {
  const processRef = child.spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, "app.db"),
      AUTH_BOOTSTRAP_SECRET: "physics-resource-smoke-secret-0123456789", PHYSICS_TASK_RESOURCES_PUBLIC_READ: enabled ? "1" : "0",
      AGENT_ACCESS_UI_ENABLED: "0", AGENT_ACCESS_OAUTH_ENABLED: "0", AGENT_ACCESS_OAUTH_CLIENTS_ENABLED: "0", AGENT_ACCESS_MCP_ENABLED: "0" },
  });
  let diagnostics = ""; processRef.stdout.on("data", bytes => { diagnostics += bytes; }); processRef.stderr.on("data", bytes => { diagnostics += bytes; });
  try { await waitFor(`http://127.0.0.1:${port}/healthz`, processRef); }
  catch (error) { await stop(processRef); throw new Error(error.message + "\n" + diagnostics.slice(-4000)); }
  return processRef;
}

function snapshot(chapter = 1, task = 1) {
  const taskNumber = `${chapter}.${task}`;
  return { library: { schema_version: 3, texts: [{ text_key: `physics-year1-task-${chapter}-${task}`, title: `Физика — задача ${taskNumber}`, topic: `Глава ${chapter}`,
    source_meta: { physics_task: { schema: "linguistpro.physics.task-card.1", chapter, task_number: taskNumber } }, rows: [{ row_id: `row-${chapter}-${task}`, order_index: 0, hebrew_plain: "שאלה", russian: `Задача ${taskNumber}` }] }], audio_assets: [] } };
}

async function seed(dataDir) {
  const db = await open(path.join(dataDir, "app.db")); const now = "2026-08-26T00:00:00.000Z";
  try {
    const owner = await get(db, "SELECT id,role FROM users WHERE lower(role)='owner' ORDER BY id LIMIT 1");
    const actor = owner || { id: "physics-smoke-owner", role: "owner" };
    if (!owner) await run(db, "INSERT INTO users(id,role,display_name) VALUES(?,?,?)", [actor.id, actor.role, "Physics smoke owner"]);
    await run(db, `INSERT INTO published_corpora(corpus_id,slug,title,description,status,current_edition_id,created_by,updated_by,created_at,updated_at)
      VALUES('pc-physics-smoke','physics-year1-problems','Физика','Smoke','DRAFT_ACTIVE',NULL,?,?,?,?)`, [actor.id, actor.id, now, now]);
    await run(db, `INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at)
      VALUES('draft-physics-smoke','pc-physics-smoke',1,1,'PUBLISHED',?,?,?,?)`, [actor.id, actor.id, now, now]);
    const manifest = JSON.stringify({ schema_version: 1, smoke: true }), manifestHash = sha256(Buffer.from(manifest));
    await run(db, `INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,asset_missing,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
      VALUES('ed-physics-smoke','pc-physics-smoke',2,'draft-physics-smoke',?,?,74,0,0,1,'published-corpora/smoke.zip',0,?,?,?)`, [manifest, manifestHash, sha256(Buffer.alloc(0)), actor.id, now]);
    const chapterCounts = [10, 3, 8, 14, 3, 12, 8, 5, 11];
    let position = 0, firstSnapshotHash = null;
    for (let chapter = 1; chapter <= chapterCounts.length; chapter += 1) {
      for (let task = 1; task <= chapterCounts[chapter - 1]; task += 1) {
        position += 1;
        const taskNumber = `${chapter}.${task}`;
        const body = JSON.stringify(snapshot(chapter, task));
        const snapshotHash = sha256(Buffer.from(body));
        if (chapter === 1 && task === 1) firstSnapshotHash = snapshotHash;
        await run(db, `INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
          VALUES(?, 'ed-physics-smoke', ?, ?, ?, ?, NULL, ?, ?, 1,1,1,'SMOKE','2026-08-26',0,0,0,1)`,
        [`ei-physics-${chapter}-${task}`, `source-${chapter}-${task}`, `physics-year1-task-${chapter}-${task}`, position, `Физика — задача ${taskNumber}`, body, snapshotHash]);
      }
    }
    await run(db, "UPDATE published_corpora SET status='PUBLISHED',current_edition_id='ed-physics-smoke' WHERE corpus_id='pc-physics-smoke'");
    const pdf = Buffer.from("%PDF-1.4\n% isolated smoke\n%%EOF\n", "utf8"), sourcePath = path.join(dataDir, "fixture.pdf"); fs.writeFileSync(sourcePath, pdf);
    const { createPhysicsTaskResourceRepo } = require(path.join(ROOT, "db", "physicsTaskResourceRepo.js"));
    const repo = createPhysicsTaskResourceRepo({ db, dataDir, now: () => now });
    const receipt = await repo.publishPdf(actor, { corpusId: "pc-physics-smoke", editionId: "ed-physics-smoke", publicWorkId: "physics-year1-task-1-1", workSnapshotSha256: firstSnapshotHash,
      logicalKey: "owner-scan", contentKind: "CONDITION_AND_SOLUTION", title: "Условие и решение 1.1", language: "MULTI", sourcePath,
      expectedSha256: sha256(pdf), expectedBytes: pdf.length, qualityStatus: "ORIGINAL", rightsBasis: "SMOKE", rightsAssertedAt: "2026-08-26", publicReadAllowed: true, agentReadAllowed: false },
    { idempotencyKey: "physics-smoke-publish" });
    return { pdf, receipt };
  } finally { await close(db); }
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-physics-resource-http-")); let processRef = null; let checks = 0;
  try {
    if (process.argv.includes("--hold")) {
      await start(dataDir, await freePort(), false).then(stop);
      const seeded = await seed(dataDir);
      const port = await freePort(); processRef = await start(dataDir, port, true);
      process.stdout.write(JSON.stringify({ ok: true, mode: "hold", url: `http://127.0.0.1:${port}/library.html?public_corpus=physics-year1-problems`,
        revision_id: seeded.receipt.revision_id, isolated_data_dir: true, production_writes: false }) + "\n");
      await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
      return;
    }
    let port = await freePort(); processRef = await start(dataDir, port, false);
    let response = await fetch(`http://127.0.0.1:${port}/api/public-corpora/physics-year1-problems/sections`);
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { ok: false, error: "PUBLIC_MATERIAL_NOT_FOUND" }); checks += 1;
    await stop(processRef); processRef = null;
    const seeded = await seed(dataDir);
    port = await freePort(); processRef = await start(dataDir, port, true); const base = `http://127.0.0.1:${port}`;
    response = await fetch(base + "/api/public-corpora/physics-year1-problems/sections");
    assert.equal(response.status, 200); const sections = await response.json(); assert.equal(sections.sections.length, 9); assert.equal(sections.sections[0].task_count, 10);
    assert.equal(sections.sections.reduce((sum, section) => sum + section.task_count, 0), 74); checks += 1;
    response = await fetch(base + "/api/public-corpora/physics-year1-problems/resource-index");
    assert.equal(response.status, 200); const index = await response.json(); assert.equal(index.resources[0].revision_id, seeded.receipt.revision_id); checks += 1;
    response = await fetch(base + `/api/public-corpora/physics-year1-problems/works/physics-year1-task-1-1/resources`);
    assert.equal(response.status, 200); assert.equal((await response.json()).resources.length, 1); checks += 1;
    const fileUrl = base + index.resources[0].file_url;
    response = await fetch(fileUrl); assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff"); assert.equal(response.headers.get("accept-ranges"), "bytes");
    const etag = response.headers.get("etag"); assert.ok(etag); assert.deepEqual(Buffer.from(await response.arrayBuffer()), seeded.pdf); checks += 1;
    response = await fetch(fileUrl, { headers: { "If-None-Match": etag } }); assert.equal(response.status, 304); checks += 1;
    response = await fetch(fileUrl, { headers: { Range: "bytes=0-4" } }); assert.equal(response.status, 206); assert.equal(Buffer.from(await response.arrayBuffer()).toString("ascii"), "%PDF-"); checks += 1;
    response = await fetch(fileUrl, { headers: { Range: "bytes=-5" } }); assert.equal(response.status, 206); assert.equal((await response.arrayBuffer()).byteLength, 5); checks += 1;
    response = await fetch(fileUrl, { headers: { Range: "bytes=999999-1000000" } }); assert.equal(response.status, 416); checks += 1;
    response = await fetch(base + "/api/public-corpora/physics-year1-problems/resources/prv_missing/file"); assert.equal(response.status, 404); checks += 1;
    process.stdout.write(JSON.stringify({ ok: true, checks, isolated_data_dir: true, production_writes: false }) + "\n");
  } finally { await stop(processRef); fs.rmSync(dataDir, { recursive: true, force: true }); }
}

if (require.main === module) main().catch(error => { process.stderr.write("physics-task-resources-smoke: " + (error.stack || error.message) + "\n"); process.exitCode = 1; });
