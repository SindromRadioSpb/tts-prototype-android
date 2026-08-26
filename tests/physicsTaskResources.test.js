"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");

const ROOT = path.resolve(__dirname, "..");
const UP = path.join(ROOT, "migrations", "064_physics_task_resources.sql");
const DOWN = path.join(ROOT, "migrations", "down", "064_physics_task_resources.sql");
const REPO = path.join(ROOT, "db", "physicsTaskResourceRepo.js");
const BACKUP_VERIFY = path.join(ROOT, "scripts", "premium", "verify-physics-task-resource-backup.js");

const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
const close = db => new Promise(resolve => db.close(resolve));
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function open(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db));
  });
}

function snapshot(chapter, taskNumber) {
  return {
    library: {
      schema_version: 3,
      texts: [{
        text_key: `physics-year1-task-${taskNumber.replace(".", "-")}`,
        title: `Физика — задача ${taskNumber}`,
        topic: `Глава ${chapter}`,
        source_meta: { physics_task: { schema: "linguistpro.physics.task-card.1", chapter, task_number: taskNumber } },
        rows: [{ row_id: `row-${taskNumber}`, order_index: 0, hebrew_plain: "שאלה", russian: "Задача" }],
      }],
      audio_assets: [],
    },
  };
}

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-physics-resources-"));
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await open(path.join(dataDir, "app.db"));
  await exec(db, "PRAGMA foreign_keys=ON");
  await exec(db, fs.readFileSync(path.join(ROOT, "migrations", "020_identity.sql"), "utf8"));
  await exec(db, fs.readFileSync(path.join(ROOT, "migrations", "063_publication_domain.sql"), "utf8"));
  await exec(db, fs.readFileSync(UP, "utf8"));
  const now = "2026-08-26T00:00:00.000Z";
  await run(db, "INSERT INTO users(id,role,display_name) VALUES('owner-a','owner','Owner')");
  await run(db, `INSERT INTO published_corpora(corpus_id,slug,title,description,status,current_edition_id,created_by,updated_by,created_at,updated_at)
                 VALUES('pc-physics','physics-year1-problems','Физика','', 'DRAFT_ACTIVE',NULL,'owner-a','owner-a',?,?)`, [now, now]);
  await run(db, `INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at)
                 VALUES('draft-1','pc-physics',1,1,'PUBLISHED','owner-a','owner-a',?,?)`, [now, now]);
  const manifest = JSON.stringify({ schema_version: 1, fixture: true });
  const manifestHash = sha256(Buffer.from(manifest));
  await run(db, `INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,asset_missing,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
                 VALUES('ed-2','pc-physics',2,'draft-1',?,?,2,0,0,1,'published-corpora/fixture.zip',0,?,'owner-a',?)`, [manifest, manifestHash, sha256(Buffer.alloc(0)), now]);
  for (const [position, chapter, task] of [[1, 1, "1.1"], [2, 2, "2.1"]]) {
    const body = JSON.stringify(snapshot(chapter, task));
    const hash = sha256(Buffer.from(body));
    await run(db, `INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
                   VALUES(?, 'ed-2', ?, ?, ?, ?, NULL, ?, ?, 1, 1, 1, 'FIXTURE', '2026-08-26', 0, 0, 0, 1)`,
    [`ei-${task}`, `source-${task}`, `physics-year1-task-${task.replace(".", "-")}`, position, `Физика — задача ${task}`, body, hash]);
  }
  await run(db, "UPDATE published_corpora SET status='PUBLISHED',current_edition_id='ed-2' WHERE corpus_id='pc-physics'");
  const pdf = Buffer.from("%PDF-1.4\n% fixture physics solution\n%%EOF\n", "utf8");
  const sourcePath = path.join(root, "1.1.pdf");
  fs.writeFileSync(sourcePath, pdf);
  delete require.cache[require.resolve(REPO)];
  const { createPhysicsTaskResourceRepo } = require(REPO);
  return { root, dataDir, db, sourcePath, pdf, repo: createPhysicsTaskResourceRepo({ db, dataDir, now: () => now }), owner: { id: "owner-a", role: "owner" } };
}

async function publishOne(fx, overrides = {}, options = {}) {
  return fx.repo.publishPdf(fx.owner, {
    corpusId: "pc-physics",
    editionId: "ed-2",
    publicWorkId: "physics-year1-task-1-1",
    workSnapshotSha256: (await get(fx.db, "SELECT snapshot_sha256 FROM published_corpus_edition_items WHERE public_work_id='physics-year1-task-1-1'")).snapshot_sha256,
    logicalKey: "owner-scan",
    contentKind: "CONDITION_AND_SOLUTION",
    title: "Условие и решение 1.1",
    language: "MULTI",
    sourcePath: fx.sourcePath,
    expectedSha256: sha256(fx.pdf),
    expectedBytes: fx.pdf.length,
    qualityStatus: "ORIGINAL",
    rightsBasis: "OWNER_ATTESTATION_FIXTURE",
    rightsAssertedAt: "2026-08-26",
    publicReadAllowed: true,
    agentReadAllowed: false,
    ...overrides,
  }, { idempotencyKey: options.idempotencyKey || "publish-1-1", faultAt: options.faultAt });
}

test("R2 red contract files exist", () => {
  assert.ok(fs.existsSync(UP), "064 migration is missing");
  assert.ok(fs.existsSync(DOWN), "064 down migration is missing");
  assert.ok(fs.existsSync(REPO), "physicsTaskResourceRepo is missing");
});

test("064 supports up, down and reapply with immutable child truth", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-physics-resource-migration-"));
  const db = await open(path.join(root, "app.db"));
  try {
    await exec(db, "PRAGMA foreign_keys=ON");
    await exec(db, fs.readFileSync(path.join(ROOT, "migrations", "020_identity.sql"), "utf8"));
    await exec(db, fs.readFileSync(path.join(ROOT, "migrations", "063_publication_domain.sql"), "utf8"));
    await exec(db, fs.readFileSync(UP, "utf8"));
    assert.ok(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='physics_task_resources'"));
    await exec(db, fs.readFileSync(DOWN, "utf8"));
    assert.equal(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='physics_task_resources'"), null);
    await exec(db, fs.readFileSync(UP, "utf8"));
    assert.ok(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='physics_task_resource_events'"));
  } finally { await close(db); fs.rmSync(root, { recursive: true, force: true }); }
});

test("publish preserves exact PDF bytes, pins the immutable work and is idempotent", async () => {
  const fx = await fixture();
  try {
    const receipt = await publishOne(fx);
    const retry = await publishOne(fx);
    assert.deepEqual(retry, receipt);
    assert.equal(receipt.sha256, sha256(fx.pdf));
    assert.deepEqual(fs.readFileSync(receipt.absolute_path), fx.pdf);
    assert.match(receipt.storage_path, /^physics-task-resources\//);
    assert.equal((await get(fx.db, "SELECT COUNT(*) n FROM physics_task_resource_revisions")).n, 1);
    assert.equal((await get(fx.db, "SELECT COUNT(*) n FROM physics_task_resource_rights_facts")).n, 2);
    await assert.rejects(run(fx.db, "UPDATE physics_task_resource_revisions SET title='mutated'"), /IMMUTABLE/);
    await assert.rejects(run(fx.db, "DELETE FROM physics_task_resource_events"), /APPEND_ONLY/);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("wrong anchor/hash/MIME are rejected without rows or files", async () => {
  const fx = await fixture();
  try {
    await assert.rejects(publishOne(fx, { workSnapshotSha256: "0".repeat(64) }), /TASK_ANCHOR_MISMATCH/);
    await assert.rejects(publishOne(fx, { expectedSha256: "f".repeat(64) }), /RESOURCE_SOURCE_HASH_MISMATCH/);
    const bad = path.join(fx.root, "bad.pdf"); fs.writeFileSync(bad, Buffer.from("not a pdf"));
    await assert.rejects(publishOne(fx, { sourcePath: bad, expectedSha256: sha256(Buffer.from("not a pdf")), expectedBytes: 9 }), /RESOURCE_PDF_INVALID/);
    assert.equal((await get(fx.db, "SELECT COUNT(*) n FROM physics_task_resources")).n, 0);
    const storageRoot = path.join(fx.dataDir, "physics-task-resources");
    const pdfFiles = fs.existsSync(storageRoot) ? fs.readdirSync(storageRoot, { recursive: true }).filter(name => String(name).endsWith(".pdf")) : [];
    assert.deepEqual(pdfFiles, []);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("fault before pointer rolls back DB visibility and removes staged/final files", async () => {
  const fx = await fixture();
  try {
    await assert.rejects(publishOne(fx, {}, { idempotencyKey: "fault", faultAt: "BEFORE_POINTER" }), /FAULT_BEFORE_POINTER/);
    assert.equal((await get(fx.db, "SELECT COUNT(*) n FROM physics_task_resources")).n, 0);
    const root = path.join(fx.dataDir, "physics-task-resources");
    const files = fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }).filter(name => String(name).endsWith(".pdf")) : [];
    assert.deepEqual(files, []);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("public reads expose only current approved exact-edition resources; withdrawal is reversible", async () => {
  const fx = await fixture();
  try {
    const receipt = await publishOne(fx);
    const resources = await fx.repo.listPublicResources("physics-year1-problems", "physics-year1-task-1-1");
    assert.equal(resources.length, 1);
    assert.equal(resources[0].revision_id, receipt.revision_id);
    assert.equal(resources[0].agent_read_allowed, false);
    assert.equal((await fx.repo.listPublicResources("physics-year1-problems", "physics-year1-task-2-1")).length, 0);
    await fx.repo.withdraw(fx.owner, receipt.resource_id, { reasonCode: "OWNER_REVIEW" }, { idempotencyKey: "withdraw" });
    assert.equal((await fx.repo.listPublicResources("physics-year1-problems", "physics-year1-task-1-1")).length, 0);
    await fx.repo.restore(fx.owner, receipt.resource_id, { revisionId: receipt.revision_id }, { idempotencyKey: "restore" });
    assert.equal((await fx.repo.listPublicResources("physics-year1-problems", "physics-year1-task-1-1")).length, 1);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("section projection is derived from pinned snapshot metadata and counts tasks", async () => {
  const fx = await fixture();
  try {
    const sections = await fx.repo.listPublicSections("physics-year1-problems");
    assert.deepEqual(sections.map(section => [section.section_no, section.task_count]), [[1, 1], [2, 1]]);
    assert.match(sections[0].title_ru, /равноускоренного/i);
    assert.match(sections[0].title_he, /^פרק 1:/);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("coordinated DB and immutable-file backup restores with exact read-back parity", async () => {
  const fx = await fixture();
  let sourceManifest;
  try {
    await publishOne(fx);
    await close(fx.db); fx.db = null;
    const { inspectBackupSet } = require(BACKUP_VERIFY);
    sourceManifest = await inspectBackupSet({ dbPath: path.join(fx.dataDir, "app.db"), dataDir: fx.dataDir });
    const restored = path.join(fx.root, "restored");
    fs.mkdirSync(restored, { recursive: true });
    fs.copyFileSync(path.join(fx.dataDir, "app.db"), path.join(restored, "app.db"));
    fs.cpSync(path.join(fx.dataDir, "physics-task-resources"), path.join(restored, "physics-task-resources"), { recursive: true });
    const restoredManifest = await inspectBackupSet({ dbPath: path.join(restored, "app.db"), dataDir: restored });
    assert.deepEqual(restoredManifest, sourceManifest);
    assert.equal(restoredManifest.db_integrity, "ok");
    assert.equal(restoredManifest.revision_count, 1);
  } finally {
    if (fx.db) await close(fx.db);
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});
