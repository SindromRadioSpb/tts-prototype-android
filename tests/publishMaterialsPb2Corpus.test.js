"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3");

const ROOT = path.resolve(__dirname, "..");
const BUNDLE = path.join(ROOT, "tests", "fixtures", "materials-pb2", "canonical-source.zip");
const publish = require("../scripts/premium/publish-materials-pb2-corpus.js");
const { createPublicationRepo } = require("../db/publicationRepo.js");
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-materials-pb2-")), dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.db"), db = await open(dbPath);
  await exec(db, "PRAGMA foreign_keys=ON");
  for (const migration of ["020_identity.sql", "056_group_song_corpus_p0.sql", "057_group_corpus_audio_revisions.sql", "058_group_corpus_catalog_metadata.sql", "063_publication_domain.sql"])
    await exec(db, fs.readFileSync(path.join(ROOT, "migrations", migration), "utf8"));
  await run(db, "INSERT INTO users(id,role,display_name) VALUES(?,?,?)", ["materials-owner", "owner", "Materials owner"]);
  await close(db);
  const rightsPath = path.join(root, "synthetic-rights.json"), anchorPath = path.join(root, "anchor.json");
  fs.writeFileSync(rightsPath, JSON.stringify({
    schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: publish.SLUG,
    owner_attested: true, basis: "OWNER_ATTESTATION_MATERIALS_PB2_TEST_2026_08_30", asserted_at: "2026-08-30",
    classes: { source_text_and_diagrams: true, generated_learning_columns: true, independent_solutions: true,
      bilingual_solution_derivatives: true, public_read: true, public_solution_display_and_print: true,
      public_stream_current_zero_audio_edition: true,
      package_download: true, agent_derivative_text: true, full_tts_audio_and_timings: false },
  }, null, 2) + "\n");
  return { root, dataDir, dbPath, rightsPath, anchorPath };
}

test("Materials PB2 publisher rehearses 3-item pilot, full immutable edition and pointer rollback without audio", async () => {
  const f = await fixture();
  try {
    const result = await publish.main(["--apply", "--db-path", f.dbPath, "--data-dir", f.dataDir, "--bundle", BUNDLE,
      "--rights", f.rightsPath, "--anchor-output", f.anchorPath, "--owner-user-id", "materials-owner", "--pilot-size", "3"]);
    assert.equal(result.ok, true);
    assert.equal(result.pilot.items, 3);
    assert.equal(result.full.items, 60);
    assert.equal(result.full.physical_audio_assets, 0);
    assert.equal(result.learner_private_review_unchanged, true);
    const anchor = JSON.parse(fs.readFileSync(f.anchorPath, "utf8"));
    assert.equal(anchor.items.length, 60);
    assert.notEqual(anchor.items[0].canonical_task_sha256, anchor.items[0].source_canonical_task_sha256,
      "published canonical hash must account for publication sanitization");

    const db = await open(f.dbPath);
    try {
      const repo = createPublicationRepo({ db, dataDir: f.dataDir, now: () => "2026-08-30T12:00:00.000Z" });
      const actor = { id: "materials-owner", role: "owner" };
      const corpus = (await repo.listPublisherCorpora(actor)).find(item => item.slug === publish.SLUG);
      const detail = await repo.getPublisherCorpus(actor, corpus.corpus_id);
      const pilot = detail.editions.find(edition => Number(edition.item_count) === 3);
      const full = detail.editions.find(edition => Number(edition.item_count) === 60);
      assert.ok(pilot && full);
      await repo.rollback(actor, corpus.corpus_id, { editionId: pilot.edition_id, reasonCode: "LOCAL_REHEARSAL" }, { idempotencyKey: "materials-local-rollback" });
      assert.equal((await repo.getPublicCorpus(publish.SLUG)).items.length, 3);
      await repo.restore(actor, corpus.corpus_id, { editionId: full.edition_id, reasonCode: "LOCAL_REHEARSAL_RESTORE" }, { idempotencyKey: "materials-local-restore" });
      assert.equal((await repo.getPublicCorpus(publish.SLUG)).items.length, 60);
    } finally { await close(db); }
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("Materials PB2 publisher refuses bundle drift and any full-TTS rights", () => {
  assert.throws(() => publish.readSourceBundle(BUNDLE, "f".repeat(64)), /SOURCE_BUNDLE_HASH_MISMATCH/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-materials-rights-"));
  try {
    const file = path.join(root, "rights.json");
    fs.writeFileSync(file, JSON.stringify({ schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: publish.SLUG,
      owner_attested: true, basis: "OWNER_ATTESTATION_MATERIALS_PB2_TEST_2026_08_30", asserted_at: "2026-08-30",
      classes: { source_text_and_diagrams: true, generated_learning_columns: true, independent_solutions: true,
        bilingual_solution_derivatives: true, public_read: true, public_solution_display_and_print: true,
        public_stream_current_zero_audio_edition: true,
        package_download: true, full_tts_audio_and_timings: true } }, null, 2));
    assert.throws(() => publish.readRights(file), /FULL_TTS_MUST_REMAIN_DEFERRED/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Materials PB2 publisher refuses an implicit zero-audio public-stream grant", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-materials-stream-rights-"));
  try {
    const file = path.join(root, "rights.json");
    fs.writeFileSync(file, JSON.stringify({ schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: publish.SLUG,
      owner_attested: true, basis: "OWNER_ATTESTATION_MATERIALS_PB2_TEST_2026_08_30", asserted_at: "2026-08-30",
      classes: { source_text_and_diagrams: true, generated_learning_columns: true, independent_solutions: true,
        bilingual_solution_derivatives: true, public_read: true, public_solution_display_and_print: true,
        public_stream_current_zero_audio_edition: false, package_download: true,
        full_tts_audio_and_timings: false } }, null, 2));
    assert.throws(() => publish.readRights(file), /RIGHTS_CLASS_NOT_COVERED:public_stream_current_zero_audio_edition/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
