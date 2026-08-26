"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const sqlite3 = require("sqlite3");

const ROOT = path.resolve(__dirname, "..");
const UP = path.join(ROOT, "migrations", "065_publication_agent_access.sql");
const DOWN = path.join(ROOT, "migrations", "down", "065_publication_agent_access.sql");
const RIGHTS_REPO = path.join(ROOT, "db", "publicationAgentRightsRepo.js");
const READ_SERVICE = path.join(ROOT, "agent", "access", "publicPublicationReadService.js");
const PHYSICS_REPO = path.join(ROOT, "db", "physicsTaskResourceRepo.js");
const RIGHTS_WRITER = path.join(ROOT, "scripts", "premium", "apply-study-songs-agent-rights.js");
const CONTRACTS = path.join(ROOT, "agent", "access", "contracts.js");

const now = "2026-08-26T12:00:00.000Z";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const close = db => new Promise(resolve => db.close(resolve));

function open(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db));
  });
}

async function applyBase(db) {
  const migrations = fs.readdirSync(path.join(ROOT, "migrations"))
    .filter(name => /^\d{3}_.+\.sql$/.test(name) && Number(name.slice(0, 3)) <= 64)
    .sort();
  for (const migration of migrations)
    await exec(db, fs.readFileSync(path.join(ROOT, "migrations", migration), "utf8"));
}

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-agent-"));
  const db = await open(path.join(root, "app.db"));
  await exec(db, "PRAGMA foreign_keys=ON");
  await applyBase(db);
  await exec(db, fs.readFileSync(UP, "utf8"));
  await run(db, "INSERT INTO users(id,role,display_name) VALUES('owner-a','owner','Owner')");
  await run(db, `INSERT INTO published_corpora(corpus_id,slug,title,description,status,current_edition_id,created_by,updated_by,created_at,updated_at)
                 VALUES('pc-songs','study-songs','Study Songs','', 'DRAFT_ACTIVE',NULL,'owner-a','owner-a',?,?)`, [now, now]);
  await run(db, `INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at)
                 VALUES('draft-1','pc-songs',1,1,'PUBLISHED','owner-a','owner-a',?,?)`, [now, now]);
  const manifest = JSON.stringify({ schema_version: 1 });
  await run(db, `INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,asset_missing,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
                 VALUES('ed-songs-1','pc-songs',1,'draft-1',?,?,1,1,0,1,'published-corpora/songs.zip',10,?,'owner-a',?)`,
    [manifest, sha256(manifest), sha256("package"), now]);
  const snapshot = JSON.stringify({ library: { texts: [{ text_key: "song-1", title: "Song", rows: [
    { order_index: 0, hebrew_plain: "שלום", russian: "Привет" },
    { order_index: 1, hebrew_plain: "עולם", russian: "Мир" },
  ], progress: { forbidden: true } }] }, notes_advanced: { review_log: [{ forbidden: true }] } });
  await run(db, `INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
                 VALUES('ei-song-1','ed-songs-1','src-song-1','song-1',1,'Song','Author',?,?,1,1,1,'OWNER_ATTESTATION','2026-08-20',1,1,0,1)`, [snapshot, sha256(snapshot)]);
  const assetKey = sha256("audio");
  await run(db, `INSERT INTO published_corpus_assets(edition_asset_id,edition_id,edition_item_id,asset_key,storage_path,bytes,sha256,mime,public_stream_allowed,package_download_allowed,created_at)
                 VALUES('ea-song-1','ed-songs-1','ei-song-1',?,'published-corpora/audio.mp3',5,?,'audio/mpeg',1,1,?)`, [assetKey, sha256("audio"), now]);
  await run(db, "UPDATE published_corpora SET status='PUBLISHED',current_edition_id='ed-songs-1' WHERE corpus_id='pc-songs'");

  delete require.cache[require.resolve(RIGHTS_REPO)];
  delete require.cache[require.resolve(READ_SERVICE)];
  const { createPublicationAgentRightsRepo } = require(RIGHTS_REPO);
  const { createPublicPublicationReadService } = require(READ_SERVICE);
  const rightsRepo = createPublicationAgentRightsRepo({ db, now: () => now });
  const service = createPublicPublicationReadService({ rightsRepo, canonicalOrigin: "https://linguistpro.kolosei.com", cursorKey: "test-cursor-key-32-bytes-minimum-000" });
  return { root, db, rightsRepo, service, owner: { id: "owner-a", role: "owner" }, assetKey };
}

async function applyPilotRights(fx) {
  return fx.rightsRepo.applyFacts(fx.owner, {
    editionId: "ed-songs-1",
    facts: [
      { targetKind: "EDITION_ITEM", targetId: "ei-song-1", useClass: "DISCOVER", allowed: true, basis: "OWNER_APPROVAL_2026_08_26", assertedAt: "2026-08-26" },
      { targetKind: "EDITION_ITEM", targetId: "ei-song-1", useClass: "SOURCE_TEXT", allowed: true, basis: "OWNER_APPROVAL_2026_08_26", assertedAt: "2026-08-26" },
      { targetKind: "EDITION_ITEM", targetId: "ei-song-1", useClass: "SOURCE_BINARY", allowed: true, basis: "OWNER_APPROVAL_2026_08_26", assertedAt: "2026-08-26" },
    ],
  }, { idempotencyKey: "pilot-rights" });
}

test("R implementation contract files exist", () => {
  assert.ok(fs.existsSync(UP), "065 migration is missing");
  assert.ok(fs.existsSync(DOWN), "065 down migration is missing");
  assert.ok(fs.existsSync(RIGHTS_REPO), "publication rights repository is missing");
  assert.ok(fs.existsSync(READ_SERVICE), "public publication read service is missing");
  assert.ok(fs.existsSync(RIGHTS_WRITER), "canonical Study Songs rights writer is missing");
});

test("065 is additive, re-applicable and extends grants without losing legacy scopes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-agent-migration-"));
  const db = await open(path.join(root, "app.db"));
  try {
    await exec(db, "PRAGMA foreign_keys=ON");
    await applyBase(db);
    await exec(db, fs.readFileSync(UP, "utf8"));
    assert.ok(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='published_corpus_agent_rights_facts'"));
    const sql = (await get(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_connection_grants'")).sql;
    assert.match(sql, /reading\.publication\.catalog\.read/);
    assert.match(sql, /reading\.publication\.item\.read/);
    assert.match(sql, /reading\.publication\.resource\.read/);
    await exec(db, fs.readFileSync(DOWN, "utf8"));
    assert.equal(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='published_corpus_agent_rights_facts'"), null);
    await exec(db, fs.readFileSync(UP, "utf8"));
  } finally { await close(db); fs.rmSync(root, { recursive: true, force: true }); }
});

test("065 down migration refuses to discard asserted publication agent rights", async () => {
  const fx = await fixture();
  try {
    await applyPilotRights(fx);
    await assert.rejects(exec(fx.db, fs.readFileSync(DOWN, "utf8")), /CHECK constraint failed/);
    assert.equal((await get(fx.db, "SELECT COUNT(*) n FROM published_corpus_agent_rights_facts")).n, 3);
    assert.ok(await get(fx.db, "SELECT name FROM sqlite_master WHERE type='table' AND name='publication_agent_rights_events'"));
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("rights are owner-only, idempotent, append-only and latest exact fact wins", async () => {
  const fx = await fixture();
  try {
    const first = await applyPilotRights(fx);
    assert.deepEqual(await applyPilotRights(fx), first);
    assert.equal((await get(fx.db, "SELECT COUNT(*) n FROM published_corpus_agent_rights_facts")).n, 3);
    await assert.rejects(run(fx.db, "UPDATE published_corpus_agent_rights_facts SET allowed=0"), /APPEND_ONLY/);
    await assert.rejects(fx.rightsRepo.applyFacts({ id: "member-a", role: "member" }, { editionId: "ed-songs-1", facts: [] }, { idempotencyKey: "forbidden" }), /FORBIDDEN/);
    await assert.rejects(fx.rightsRepo.applyFacts(fx.owner, { editionId: "ed-songs-1", facts: [{ targetKind: "EDITION_ITEM", targetId: "wrong", useClass: "DISCOVER", allowed: true, basis: "x", assertedAt: "2026-08-26" }] }, { idempotencyKey: "wrong-target" }), /TARGET_INVALID/);
    await fx.rightsRepo.applyFacts(fx.owner, { editionId: "ed-songs-1", facts: [{ targetKind: "EDITION_ITEM", targetId: "ei-song-1", useClass: "SOURCE_TEXT", allowed: false, basis: "OWNER_REVOKED", assertedAt: "2026-08-26" }] }, { idempotencyKey: "revoke-text" });
    assert.equal(await fx.rightsRepo.isAllowed("ed-songs-1", "EDITION_ITEM", "ei-song-1", "SOURCE_TEXT"), false);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("public rights alone do not authorize agents; approved rights expose bounded text and descriptors without private truth or bytes", async () => {
  const fx = await fixture();
  try {
    assert.deepEqual((await fx.service.listCorpora({ limit: 10 })).corpora, []);
    await applyPilotRights(fx);
    const corpora = await fx.service.listCorpora({ limit: 10 });
    assert.equal(corpora.corpora[0].edition_id, "ed-songs-1");
    const items = await fx.service.searchItems({ corpusSlug: "study-songs", editionId: "ed-songs-1", query: "song", limit: 10 });
    assert.equal(items.items[0].edition_item_id, "ei-song-1");
    const window = await fx.service.readTextWindow({ corpusSlug: "study-songs", editionId: "ed-songs-1", editionItemId: "ei-song-1", start: 0, rows: 20 });
    assert.equal(window.rows.length, 2);
    const resources = await fx.service.listResources({ corpusSlug: "study-songs", editionId: "ed-songs-1", editionItemId: "ei-song-1", limit: 20 });
    assert.equal(resources.resources[0].sha256, sha256("audio"));
    assert.equal(resources.resources[0].url, `https://linguistpro.kolosei.com/api/public-corpora/study-songs/assets/${fx.assetKey}`);
    const contracts = require(CONTRACTS);
    assert.equal(contracts.validateOutput("list_published_public_corpora", corpora).schema_version, corpora.schema_version);
    assert.equal(contracts.validateOutput("search_published_public_items", items).schema_version, items.schema_version);
    assert.equal(contracts.validateOutput("read_published_text_window", window).schema_version, window.schema_version);
    assert.equal(contracts.validateOutput("list_published_item_resources", resources).schema_version, resources.schema_version);
    const serialized = JSON.stringify({ corpora, items, window, resources });
    assert.doesNotMatch(serialized, /review_log|progress|bookmarks|notes_advanced|base64|binary/i);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("an exact asset deny overrides item binary permission", async () => {
  const fx = await fixture();
  try {
    await applyPilotRights(fx);
    await fx.rightsRepo.applyFacts(fx.owner, { editionId: "ed-songs-1", facts: [{ targetKind: "EDITION_ASSET", targetId: "ea-song-1", useClass: "SOURCE_BINARY", allowed: false, basis: "ASSET_REVOKED", assertedAt: "2026-08-26" }] }, { idempotencyKey: "deny-asset" });
    assert.deepEqual((await fx.service.listResources({ corpusSlug: "study-songs", editionId: "ed-songs-1", editionItemId: "ei-song-1", limit: 20 })).resources, []);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("item cursors are authenticated and bound to the exact corpus edition and query", async () => {
  const fx = await fixture();
  try {
    await applyPilotRights(fx);
    const snapshot = JSON.stringify({ library: { texts: [{ rows: [{ order_index: 0, hebrew_plain: "שני", russian: "Второй" }] }] } });
    await run(fx.db, `INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
      VALUES('ei-song-2','ed-songs-1','src-song-2','song-2',2,'Song Two','Author',?,?,1,1,0,'OWNER_ATTESTATION','2026-08-20',0,0,0,1)`, [snapshot, sha256(snapshot)]);
    await fx.rightsRepo.applyFacts(fx.owner, { editionId: "ed-songs-1", facts: [
      { targetKind: "EDITION_ITEM", targetId: "ei-song-2", useClass: "DISCOVER", allowed: true, basis: "OWNER_APPROVAL_2026_08_26", assertedAt: "2026-08-26" },
    ] }, { idempotencyKey: "second-item" });
    const page = await fx.service.searchItems({ corpusSlug: "study-songs", editionId: "ed-songs-1", query: "song", limit: 1 });
    assert.ok(page.next_cursor);
    const tampered = page.next_cursor.slice(0, -1) + (page.next_cursor.endsWith("a") ? "b" : "a");
    await assert.rejects(fx.service.searchItems({ corpusSlug: "study-songs", editionId: "ed-songs-1", query: "song", cursor: tampered, limit: 1 }), /CURSOR_INVALID/);
    await assert.rejects(fx.service.searchItems({ corpusSlug: "study-songs", editionId: "ed-songs-2", query: "song", cursor: page.next_cursor, limit: 1 }), /CURSOR_INVALID/);
    await assert.rejects(fx.service.searchItems({ corpusSlug: "study-songs", editionId: "ed-songs-1", query: "other", cursor: page.next_cursor, limit: 1 }), /CURSOR_INVALID/);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("Physics discovery reuses exact existing PUBLIC_READ and AGENT_READ facts without a second rights writer", async () => {
  const fx = await fixture();
  try {
    await run(fx.db, `INSERT INTO published_corpora(corpus_id,slug,title,description,status,current_edition_id,created_by,updated_by,created_at,updated_at)
      VALUES('pc-physics','physics-year1-problems','Физика — задачник, 1 год','', 'DRAFT_ACTIVE',NULL,'owner-a','owner-a',?,?)`, [now, now]);
    await run(fx.db, `INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at)
      VALUES('draft-physics','pc-physics',1,1,'PUBLISHED','owner-a','owner-a',?,?)`, [now, now]);
    const manifest = JSON.stringify({ schema_version: 1, corpus: "physics" });
    await run(fx.db, `INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,asset_missing,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
      VALUES('ed-physics-2','pc-physics',2,'draft-physics',?,?,1,0,0,1,'published-corpora/physics.zip',10,?,'owner-a',?)`, [manifest, sha256(manifest), sha256("physics-package"), now]);
    const snapshot = JSON.stringify({ library: { texts: [{ source_meta: { physics_task: { schema: "linguistpro.physics.task-card.1", chapter: 1, task_number: "1.1" } }, rows: [] }] } });
    const snapshotHash = sha256(snapshot);
    await run(fx.db, `INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
      VALUES('ei-physics-1','ed-physics-2','src-physics-1','physics-year1-task-1-1',1,'Физика — задача 1.1',NULL,?,?,1,1,0,'OWNER_ATTESTATION','2026-08-25',0,0,0,1)`, [snapshot, snapshotHash]);
    await run(fx.db, `INSERT INTO physics_task_resources(resource_id,corpus_id,public_work_id,logical_key,status,current_revision_id,created_by,updated_by,created_at,updated_at)
      VALUES('ptr-physics-1','pc-physics','physics-year1-task-1-1','owner-scan','PUBLISHED',NULL,'owner-a','owner-a',?,?)`, [now, now]);
    await run(fx.db, `INSERT INTO physics_task_resource_revisions(revision_id,resource_id,revision_no,edition_id,edition_item_id,public_work_id,work_snapshot_sha256,resource_kind,content_kind,title,language,storage_path,external_url,bytes,sha256,mime,quality_status,provenance_json,created_by,created_at)
      VALUES('prv-physics-1','ptr-physics-1',1,'ed-physics-2','ei-physics-1','physics-year1-task-1-1',?,'PDF','CONDITION_AND_SOLUTION','Условие и решение 1.1','MULTI','physics-task-resources/fixture.pdf',NULL,100,?,'application/pdf','ORIGINAL','{}','owner-a',?)`, [snapshotHash, sha256("physics-pdf"), now]);
    await run(fx.db, "UPDATE physics_task_resources SET current_revision_id='prv-physics-1' WHERE resource_id='ptr-physics-1'");
    for (const permission of ["PUBLIC_READ", "AGENT_READ"]) await run(fx.db, `INSERT INTO physics_task_resource_rights_facts(fact_id,revision_id,permission,allowed,basis,asserted_at,asserted_by,created_at)
      VALUES(?, 'prv-physics-1', ?, 1, 'OWNER_ATTESTATION_2026_08_26', '2026-08-26', 'owner-a', ?)`, [`fact-${permission.toLowerCase()}`, permission, now]);
    await run(fx.db, `INSERT INTO physics_task_resources(resource_id,corpus_id,public_work_id,logical_key,status,current_revision_id,created_by,updated_by,created_at,updated_at)
      VALUES('ptr-physics-link','pc-physics','physics-year1-task-1-1','external-reference','PUBLISHED',NULL,'owner-a','owner-a',?,?)`, [now, now]);
    await run(fx.db, `INSERT INTO physics_task_resource_revisions(revision_id,resource_id,revision_no,edition_id,edition_item_id,public_work_id,work_snapshot_sha256,resource_kind,content_kind,title,language,storage_path,external_url,bytes,sha256,mime,quality_status,provenance_json,created_by,created_at)
      VALUES('prv-physics-link','ptr-physics-link',1,'ed-physics-2','ei-physics-1','physics-year1-task-1-1',?,'EXTERNAL_LINK','SUPPLEMENT','Внешний материал','RU',NULL,'https://example.invalid/resource',NULL,NULL,NULL,'ORIGINAL','{}','owner-a',?)`, [snapshotHash, now]);
    await run(fx.db, "UPDATE physics_task_resources SET current_revision_id='prv-physics-link' WHERE resource_id='ptr-physics-link'");
    for (const permission of ["PUBLIC_READ", "AGENT_READ"]) await run(fx.db, `INSERT INTO physics_task_resource_rights_facts(fact_id,revision_id,permission,allowed,basis,asserted_at,asserted_by,created_at)
      VALUES(?, 'prv-physics-link', ?, 1, 'OWNER_ATTESTATION_2026_08_26', '2026-08-26', 'owner-a', ?)`, [`fact-link-${permission.toLowerCase()}`, permission, now]);
    await run(fx.db, "UPDATE published_corpora SET status='PUBLISHED',current_edition_id='ed-physics-2' WHERE corpus_id='pc-physics'");

    delete require.cache[require.resolve(PHYSICS_REPO)];
    const { createPhysicsTaskResourceRepo } = require(PHYSICS_REPO);
    const { createPublicPublicationReadService } = require(READ_SERVICE);
    const service = createPublicPublicationReadService({ rightsRepo: fx.rightsRepo,
      physicsRepo: createPhysicsTaskResourceRepo({ db: fx.db, dataDir: fx.root, now: () => now }),
      canonicalOrigin: "https://linguistpro.kolosei.com", cursorKey: "test-cursor-key-32-bytes-minimum-000" });
    const corpora = await service.listCorpora({ limit: 10 });
    assert.deepEqual(corpora.corpora.map(row => row.slug), ["physics-year1-problems"]);
    const resources = await service.listResources({ corpusSlug: "physics-year1-problems", editionId: "ed-physics-2", editionItemId: "ei-physics-1", limit: 20 });
    assert.equal(resources.resources.length, 1, "external links remain outside the first MCP pilot");
    assert.equal(resources.resources[0].revision_id, "prv-physics-1");
    assert.equal(resources.resources[0].url, "https://linguistpro.kolosei.com/api/public-corpora/physics-year1-problems/resources/prv-physics-1/file");
    assert.equal((await get(fx.db, "SELECT COUNT(*) n FROM published_corpus_agent_rights_facts WHERE edition_id='ed-physics-2'")).n, 0);
  } finally { await close(fx.db); fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("Study Songs rights writer is dry-run by default and applies an idempotent exact-manifest plan only on --apply", async () => {
  const fx = await fixture();
  const dbPath = path.join(fx.root, "app.db");
  const manifestSha = (await get(fx.db, "SELECT manifest_sha256 FROM published_corpus_editions WHERE edition_id='ed-songs-1'")).manifest_sha256;
  await close(fx.db);
  const args = [RIGHTS_WRITER, "--db-path", dbPath, "--edition-id", "ed-songs-1", "--expected-manifest-sha256", manifestSha,
    "--owner-id", "owner-a", "--idempotency-key", "study-songs-agent-rights-fixture"];
  try {
    const dry = JSON.parse(childProcess.execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" }));
    assert.equal(dry.mode, "DRY_RUN"); assert.equal(dry.planned_facts, 5); assert.equal(dry.applied_facts, 0);
    let verify = await open(dbPath);
    assert.equal((await get(verify, "SELECT COUNT(*) n FROM published_corpus_agent_rights_facts")).n, 0);
    await close(verify);
    const applied = JSON.parse(childProcess.execFileSync(process.execPath, [...args, "--apply"], { cwd: ROOT, encoding: "utf8" }));
    assert.equal(applied.mode, "APPLY"); assert.equal(applied.applied_facts, 5);
    const retried = JSON.parse(childProcess.execFileSync(process.execPath, [...args, "--apply"], { cwd: ROOT, encoding: "utf8" }));
    assert.equal(retried.plan_sha256, applied.plan_sha256);
    verify = await open(dbPath);
    assert.equal((await get(verify, "SELECT COUNT(*) n FROM published_corpus_agent_rights_facts")).n, 5);
    assert.equal((await get(verify, "SELECT allowed FROM published_corpus_agent_rights_facts WHERE target_kind='PACKAGE'")).allowed, 0);
    assert.equal((await get(verify, "SELECT allowed FROM published_corpus_agent_rights_facts WHERE use_class='DERIVATIVE_TEXT'")).allowed, 0);
    await close(verify);
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("Physics resource descriptors paginate without repeating and exclude external links", async () => {
  const { createPublicPublicationReadService } = require(READ_SERVICE);
  const item = { corpus_id: "pc-physics", slug: "physics-year1-problems", corpus_title: "Physics", edition_id: "ed-2",
    edition_number: 2, manifest_sha256: "a".repeat(64), edition_item_id: "ei-1", public_work_id: "work-1",
    position_no: 1, title: "Task", creator: null, snapshot_sha256: "b".repeat(64) };
  const rightsRepo = {
    async listReadableAssets() { return []; },
    async getDiscoverableItem() { return item; },
  };
  const physicsRepo = { async listPublicResources() { return [
    { resource_id: "r1", resource_kind: "PDF", revision_id: "v1", bytes: 10, sha256: "c".repeat(64), mime: "application/pdf", file_url: "/api/public-corpora/physics-year1-problems/resources/v1/file" },
    { resource_id: "r-link", resource_kind: "EXTERNAL_LINK", revision_id: "vl", bytes: null, sha256: null, mime: null, file_url: "/not-used" },
    { resource_id: "r2", resource_kind: "PDF", revision_id: "v2", bytes: 11, sha256: "d".repeat(64), mime: "application/pdf", file_url: "/api/public-corpora/physics-year1-problems/resources/v2/file" },
  ]; } };
  const service = createPublicPublicationReadService({ rightsRepo, physicsRepo, canonicalOrigin: "https://linguistpro.kolosei.com", cursorKey: "test-cursor-key-32-bytes-minimum-000" });
  const first = await service.listResources({ corpusSlug: "physics-year1-problems", editionId: "ed-2", editionItemId: "ei-1", limit: 1 });
  const second = await service.listResources({ corpusSlug: "physics-year1-problems", editionId: "ed-2", editionItemId: "ei-1", limit: 1, cursor: first.next_cursor });
  assert.deepEqual(first.resources.map(row => row.resource_id), ["r1"]);
  assert.deepEqual(second.resources.map(row => row.resource_id), ["r2"]);
  assert.equal(second.next_cursor, null);
});
