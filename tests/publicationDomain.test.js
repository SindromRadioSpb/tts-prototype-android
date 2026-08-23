"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const AdmZip = require("adm-zip");

const ROOT = path.resolve(__dirname, "..");
const UP = path.join(ROOT, "migrations", "063_publication_domain.sql");
const DOWN = path.join(ROOT, "migrations", "down", "063_publication_domain.sql");
const REPO = path.join(ROOT, "db", "publicationRepo.js");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
const close = db => new Promise(resolve => db.close(() => resolve()));

function openDatabase(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db));
  });
}

function writeExact(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function buildFixture({ missingSecondAudio = false, sharedAudio = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-domain-"));
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await openDatabase(path.join(dataDir, "app.db"));
  await exec(db, "PRAGMA foreign_keys=ON");
  for (const migration of ["020_identity.sql", "056_group_song_corpus_p0.sql", "057_group_corpus_audio_revisions.sql", "058_group_corpus_catalog_metadata.sql"])
    await exec(db, fs.readFileSync(path.join(ROOT, "migrations", migration), "utf8"));
  await exec(db, fs.readFileSync(UP, "utf8"));

  const owner = { id: "owner-a", role: "owner" };
  const publisherA = { id: "publisher-a", role: "member" };
  const publisherB = { id: "publisher-b", role: "member" };
  for (const actor of [owner, publisherA, publisherB])
    await run(db, "INSERT INTO users(id,role,display_name) VALUES(?,?,?)", [actor.id, actor.role, actor.id]);
  await run(db, "INSERT INTO reading_groups(group_id,owner_user_id,name,status,created_at,updated_at) VALUES('songs-group',?,'Songs','ACTIVE',?,?)", [owner.id, "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z"]);
  await run(db, "INSERT INTO reading_group_members(group_id,user_id,role,status,created_at,updated_at) VALUES('songs-group',?,'OWNER','ACTIVE',?,?)", [owner.id, "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z"]);
  await run(db, `INSERT INTO group_corpora(corpus_id,group_id,slug,title,visibility,version,status,rights_basis,created_at,updated_at)
                 VALUES('study-songs-pilot','songs-group','study-songs','Учебные песни','GROUP_RESTRICTED',1,'PILOT','EDUCATIONAL_GROUP_RESTRICTED_REVIEW_REQUIRED',?,?)`, ["2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z"]);

  const works = [];
  for (let index = 1; index <= 2; index += 1) {
    const workId = `song-${index}`;
    const audioKey = sha256(sharedAudio ? "audio-shared" : `audio-${index}`);
    const bundle = {
      group_corpus_schema_version: 1,
      corpus_id: "study-songs-pilot",
      work_id: workId,
      library: {
        schema_version: 3,
        texts: [{ text_key: `text-${index}`, title: `שיר ${index}`, rows: [{ row_id: `r-${index}`, he: `שלום ${index}`, ru: `Привет ${index}`, audio_asset_key: audioKey }], progress: { forbidden: true }, bookmarks: [{ forbidden: true }], source_meta: { group_corpus: { corpus_id: "study-songs-pilot", work_id: workId } } }],
        audio_assets: [{ asset_key: audioKey, mime: "audio/mpeg" }],
      },
      notes_advanced: { notes: [], sentence_morph: [], occurrences: [], review_log: [{ forbidden: true }], srs_cards: [{ forbidden: true }], events: [{ forbidden: true }] },
    };
    const bundleBytes = Buffer.from(JSON.stringify(bundle), "utf8");
    const bundleRel = `group-corpora/study-songs-pilot/v1/works/${workId}.json`;
    const bundleFact = writeExact(path.join(dataDir, bundleRel), bundleBytes);
    const audioBytes = Buffer.from(sharedAudio ? "fixture-mp3-shared" : `fixture-mp3-${index}`);
    const audioRel = `group-corpora/study-songs-pilot/v1/audio/${audioKey}.mp3`;
    const audioFact = missingSecondAudio && index === 2 ? { bytes: audioBytes.length, sha256: sha256(audioBytes) } : writeExact(path.join(dataDir, audioRel), audioBytes);
    await run(db, `INSERT INTO group_corpus_works(corpus_id,work_id,text_key,position_no,title,artist,source_url,rights_status,bundle_path,bundle_sha256,rows_count,audio_count,notes_count,morph_count,source_updated_at,created_at,updated_at,audio_revision,tags_json)
                   VALUES('study-songs-pilot',?,?,?,?,?,NULL,'REVIEW_REQUIRED',?,?,?,?,0,0,?,?,?,1,'[]')`,
      [workId, `text-${index}`, index, `שיר ${index}`, `Artist ${index}`, bundleRel, bundleFact.sha256, 1, 1, "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z"]);
    await run(db, `INSERT INTO group_corpus_audio(corpus_id,work_id,asset_key,relative_path,bytes,sha256,mime,created_at,revision)
                   VALUES('study-songs-pilot',?,?,?,?,?,'audio/mpeg',?,1)`, [workId, audioKey, audioRel, audioFact.bytes, audioFact.sha256, "2026-08-20T00:00:00.000Z"]);
    works.push({ workId, audioKey, bundleRel, audioRel });
  }

  delete require.cache[require.resolve(REPO)];
  const { createPublicationRepo } = require(REPO);
  const repo = createPublicationRepo({ db, dataDir, now: () => "2026-08-20T12:00:00.000Z" });
  return { root, dataDir, db, repo, owner, publisherA, publisherB, works };
}

async function sourceFingerprint(db) {
  return {
    corpora: await all(db, "SELECT * FROM group_corpora ORDER BY corpus_id"),
    works: await all(db, "SELECT * FROM group_corpus_works ORDER BY corpus_id,work_id"),
    audio: await all(db, "SELECT * FROM group_corpus_audio ORDER BY corpus_id,work_id,asset_key"),
  };
}

async function prepareDraft(fixture) {
  const { repo, owner } = fixture;
  const created = await repo.createCorpus(owner, { slug: "study-songs", title: "Учебные песни", description: "Песни для изучения иврита" }, { idempotencyKey: "create-study-songs" });
  const copied = await repo.copyGroupCorpusItems(owner, created.corpus_id, {
    sourceCorpusId: "study-songs-pilot",
    workIds: fixture.works.map(work => work.workId),
    expectedVersion: created.draft_version,
  }, { idempotencyKey: "copy-study-songs-snapshot" });
  const rights = await repo.applyRightsPreset(owner, created.corpus_id, {
    itemIds: copied.items.map(item => item.item_id),
    expectedVersion: copied.draft_version,
    preset: {
      public_read_allowed: true,
      public_stream_allowed: true,
      package_download_allowed: true,
      basis: "OWNER_ATTESTATION_2026_08_20",
      asserted_at: "2026-08-20",
    },
  }, { idempotencyKey: "rights-study-songs-snapshot" });
  return { created, copied, rights };
}

test("I1 red contract files exist", () => {
  assert.ok(fs.existsSync(UP), "063 publication migration is missing");
  assert.ok(fs.existsSync(DOWN), "063 down migration is missing");
  assert.ok(fs.existsSync(REPO), "single publication repository is missing");
});

test("063 migration supports up, down and reapply", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-migration-"));
  const db = await openDatabase(path.join(root, "app.db"));
  try {
    await exec(db, "PRAGMA foreign_keys=ON");
    await exec(db, fs.readFileSync(path.join(ROOT, "migrations", "020_identity.sql"), "utf8"));
    await exec(db, fs.readFileSync(UP, "utf8"));
    assert.ok(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='published_corpora'"));
    await exec(db, fs.readFileSync(DOWN, "utf8"));
    assert.equal(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='published_corpora'"), null);
    await exec(db, fs.readFileSync(UP, "utf8"));
    assert.ok(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='publication_events'"));
  } finally { await close(db); fs.rmSync(root, { recursive: true, force: true }); }
});

test("copy is source-preserving and owner attestation becomes three append-only facts per item", async () => {
  const fixture = await buildFixture();
  try {
    const before = await sourceFingerprint(fixture.db);
    const prepared = await prepareDraft(fixture);
    assert.deepEqual(await sourceFingerprint(fixture.db), before, "publication changed the restricted source corpus");
    assert.equal(prepared.copied.items.length, 2);
    const facts = await all(fixture.db, `SELECT item_id,permission,allowed,basis,asserted_at FROM publication_rights_facts ORDER BY item_id,permission`);
    assert.equal(facts.length, 6);
    for (const item of prepared.copied.items) {
      const itemFacts = facts.filter(fact => fact.item_id === item.item_id);
      assert.deepEqual(itemFacts.map(fact => fact.permission), ["PACKAGE_DOWNLOAD", "PUBLIC_READ", "PUBLIC_STREAM"]);
      assert.ok(itemFacts.every(fact => fact.allowed === 1 && fact.basis === "OWNER_ATTESTATION_2026_08_20" && fact.asserted_at === "2026-08-20"));
    }
    const copiedJson = (await all(fixture.db, "SELECT snapshot_json FROM publication_draft_items")).map(row => row.snapshot_json).join("\n");
    assert.doesNotMatch(copiedJson, /review_log|srs_cards|bookmarks|progress|forbidden/i);
  } finally { await close(fixture.db); fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("publish is idempotent, immutable, hash-read-back verified and pointer/event driven", async () => {
  const fixture = await buildFixture();
  try {
    const prepared = await prepareDraft(fixture);
    const validation = await fixture.repo.validateDraft(fixture.owner, prepared.created.corpus_id);
    assert.equal(validation.ready, true);
    const receipt = await fixture.repo.publish(fixture.owner, prepared.created.corpus_id, {
      expectedVersion: prepared.rights.draft_version,
    }, { idempotencyKey: "publish-study-songs-edition-1" });
    const retry = await fixture.repo.publish(fixture.owner, prepared.created.corpus_id, {
      expectedVersion: prepared.rights.draft_version,
    }, { idempotencyKey: "publish-study-songs-edition-1" });
    assert.deepEqual(retry, receipt);
    assert.match(receipt.manifest_sha256, /^[0-9a-f]{64}$/);
    const corpus = await get(fixture.db, "SELECT current_edition_id,status FROM published_corpora WHERE corpus_id=?", [prepared.created.corpus_id]);
    assert.deepEqual(corpus, { current_edition_id: receipt.edition_id, status: "PUBLISHED" });
    const publicRead = await fixture.repo.getPublicCorpus("study-songs");
    assert.equal(publicRead.edition.edition_id, receipt.edition_id);
    assert.equal(publicRead.edition.manifest_sha256, receipt.manifest_sha256);
    const learning = await fixture.repo.getPublicLearningIndex("study-songs");
    assert.equal(learning.index.schema_version, "public_learning_index.1.0.0");
    assert.equal(learning.index.edition_id, receipt.edition_id);
    assert.equal(learning.index.manifest_sha256, receipt.manifest_sha256);
    assert.equal(learning.index.matched_total, 2);
    assert.equal(learning.index.prepared_total, 2);
    assert.ok(learning.index.items.every(item => item.status === "PREPARED" && item.ingredients && item.ingredients.total_token_count > 0));
    assert.doesNotMatch(JSON.stringify(learning.index), /שיר|שלום|Привет|Artist|"(?:title|creator|russian|hebrew(?:_plain|_niqqud))"\s*:/i);
    const packageRead = await fixture.repo.getPublicPackage("study-songs");
    assert.equal(packageRead.edition.package_sha256, receipt.package_sha256);
    const archive = new AdmZip(packageRead.absolute_path);
    assert.ok(archive.getEntry("manifest.json"));
    assert.equal(archive.getEntries().filter(entry => entry.entryName.startsWith("audio/")).length, 2);
    await assert.rejects(run(fixture.db, "UPDATE published_corpus_edition_items SET title='mutated' WHERE edition_id=?", [receipt.edition_id]), /IMMUTABLE/);
    await assert.rejects(run(fixture.db, "DELETE FROM publication_events WHERE corpus_id=?", [prepared.created.corpus_id]), /APPEND_ONLY/);
    const events = await all(fixture.db, "SELECT event_type FROM publication_events WHERE corpus_id=? ORDER BY event_seq", [prepared.created.corpus_id]);
    assert.ok(events.some(event => event.event_type === "PUBLISHED"));
    const withdrawn = await fixture.repo.withdraw(fixture.owner, prepared.created.corpus_id, { reasonCode: "OWNER_REQUEST" }, { idempotencyKey: "withdraw-study-songs" });
    assert.equal(withdrawn.withdrawn, true);
    await assert.rejects(fixture.repo.getPublicCorpus("study-songs"), error => error && error.code === "CORPUS_NOT_FOUND");
    const restored = await fixture.repo.restore(fixture.owner, prepared.created.corpus_id, { editionId: receipt.edition_id }, { idempotencyKey: "restore-study-songs" });
    assert.equal(restored.edition_id, receipt.edition_id);
    assert.equal((await fixture.repo.getPublicCorpus("study-songs")).edition.edition_id, receipt.edition_id);
  } finally { await close(fixture.db); fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("content-addressed audio shared by multiple works is stored once and remains visible in every work", async () => {
  const fixture = await buildFixture({ sharedAudio: true });
  try {
    const prepared = await prepareDraft(fixture);
    const receipt = await fixture.repo.publish(fixture.owner, prepared.created.corpus_id, {
      expectedVersion: prepared.rights.draft_version,
    }, { idempotencyKey: "publish-shared-audio" });
    assert.equal(receipt.asset_count, 1);
    const publicCorpus = await fixture.repo.getPublicCorpus("study-songs");
    for (const item of publicCorpus.items) {
      const work = await fixture.repo.getPublicWork("study-songs", item.public_work_id);
      assert.deepEqual(work.assets.map(asset => asset.asset_key), [fixture.works[0].audioKey]);
    }
    const archive = new AdmZip((await fixture.repo.getPublicPackage("study-songs")).absolute_path);
    assert.equal(archive.getEntries().filter(entry => entry.entryName.startsWith("audio/")).length, 1);
  } finally { await close(fixture.db); fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("missing audio stays a technical exception and cannot be represented as a complete package", async () => {
  const fixture = await buildFixture({ missingSecondAudio: true });
  try {
    const prepared = await prepareDraft(fixture);
    const validation = await fixture.repo.validateDraft(fixture.owner, prepared.created.corpus_id);
    assert.equal(validation.ready, true, "owner-attested text should remain publishable when an asset is missing");
    assert.equal(validation.asset_missing, 1);
    const receipt = await fixture.repo.publish(fixture.owner, prepared.created.corpus_id, { expectedVersion: prepared.rights.draft_version }, { idempotencyKey: "publish-with-missing-asset" });
    assert.equal(receipt.asset_missing, 1);
    assert.equal(receipt.package_complete, false);
    const items = await all(fixture.db, "SELECT asset_missing,package_complete FROM published_corpus_edition_items WHERE edition_id=? ORDER BY position_no", [receipt.edition_id]);
    assert.deepEqual(items, [{ asset_missing: 0, package_complete: 1 }, { asset_missing: 1, package_complete: 0 }]);
  } finally { await close(fixture.db); fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("faults before and after pointer switch roll back both canonical rows and public visibility", async () => {
  const fixture = await buildFixture();
  try {
    const prepared = await prepareDraft(fixture);
    for (const faultAt of ["BEFORE_POINTER", "AFTER_POINTER"]) {
      await assert.rejects(fixture.repo.publish(fixture.owner, prepared.created.corpus_id, {
        expectedVersion: prepared.rights.draft_version,
      }, { idempotencyKey: `fault-${faultAt.toLowerCase()}`, faultAt }), new RegExp(`FAULT_${faultAt}`));
      assert.equal(Number((await get(fixture.db, "SELECT COUNT(*) n FROM published_corpus_editions WHERE corpus_id=?", [prepared.created.corpus_id])).n), 0);
      assert.deepEqual(await get(fixture.db, "SELECT current_edition_id,status FROM published_corpora WHERE corpus_id=?", [prepared.created.corpus_id]), { current_edition_id: null, status: "DRAFT_ACTIVE" });
      await assert.rejects(fixture.repo.getPublicCorpus("study-songs"), error => error && error.code === "CORPUS_NOT_FOUND");
    }
    const receipt = await fixture.repo.publish(fixture.owner, prepared.created.corpus_id, {
      expectedVersion: prepared.rights.draft_version,
    }, { idempotencyKey: "publish-after-faults" });
    assert.equal((await fixture.repo.getPublicCorpus("study-songs")).edition.edition_id, receipt.edition_id);
  } finally { await close(fixture.db); fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("publisher authorization is explicit and corpus scope does not enumerate another publisher", async () => {
  const fixture = await buildFixture();
  try {
    await assert.rejects(fixture.repo.createCorpus(fixture.publisherA, { slug: "forbidden", title: "Forbidden" }, { idempotencyKey: "forbidden-create" }), error => error && error.code === "PUBLISHER_FORBIDDEN");
    await fixture.repo.grantPublisher(fixture.owner, fixture.publisherA.id, { idempotencyKey: "grant-publisher-a" });
    await fixture.repo.grantPublisher(fixture.owner, fixture.publisherB.id, { idempotencyKey: "grant-publisher-b" });
    const corpusA = await fixture.repo.createCorpus(fixture.publisherA, { slug: "publisher-a", title: "Publisher A" }, { idempotencyKey: "publisher-a-create" });
    await assert.rejects(fixture.repo.getPublisherCorpus(fixture.publisherB, corpusA.corpus_id), error => error && error.code === "CORPUS_NOT_FOUND");
    assert.equal((await fixture.repo.getPublisherCorpus(fixture.owner, corpusA.corpus_id)).corpus_id, corpusA.corpus_id);
  } finally { await close(fixture.db); fs.rmSync(fixture.root, { recursive: true, force: true }); }
});
