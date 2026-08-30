#!/usr/bin/env node
"use strict";

// Controlled publisher for the reviewed Materials Science PB2 corpus.
// It cannot synthesize or publish TTS. Default mode is a read-only plan;
// --apply, an exact bundle hash and an owner rights attestation are required.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sqlite3 = require("sqlite3");
const AdmZip = require("adm-zip");
const { createPublicationRepo, canonicalJson, sanitizeSnapshot } = require("../../db/publicationRepo");
const { sensitiveFingerprint } = require("./publication-migration-rehearsal");

const ROOT = path.resolve(__dirname, "..", "..");
const SLUG = "materials-science-year1-problem-book-2";
const TITLE = "Материаловедение — задачник 2";
const DESCRIPTION = "60 проверенных задач по материаловедению: условия на иврите, огласовки, транслитерация и русский перевод; отдельные экзаменационные решения доступны в карточках.";
const CURRENT_BUNDLE_SHA256 = "04bb4b69741a0ec4cdc188b04ab9e630ae90994f252e0cc233cb6d33f8bc97d5";
const TABLE_MANIFEST = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "artifacts", "student-solution-tables", "manifest.json");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const stableJson = value => JSON.stringify(value, null, 2) + "\n";
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
function invariant(value, message) { if (!value) throw new Error(message); }

function parseArgs(argv) {
  const out = { apply: false, pilotSize: 3, expectedBundleSha256: CURRENT_BUNDLE_SHA256, slug: SLUG, title: TITLE, description: DESCRIPTION };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--db-path") out.dbPath = argv[++index];
    else if (arg === "--data-dir") out.dataDir = argv[++index];
    else if (arg === "--bundle") out.bundle = argv[++index];
    else if (arg === "--rights") out.rights = argv[++index];
    else if (arg === "--anchor-output") out.anchorOutput = argv[++index];
    else if (arg === "--owner-user-id") out.ownerUserId = argv[++index];
    else if (arg === "--pilot-size") out.pilotSize = Number(argv[++index]);
    else if (arg === "--expected-bundle-sha256") out.expectedBundleSha256 = String(argv[++index] || "").toLowerCase();
    else throw new Error("UNKNOWN_ARG:" + arg);
  }
  for (const key of ["dbPath", "dataDir", "bundle", "rights", "anchorOutput"]) if (!out[key]) throw new Error("MISSING_OPTION:" + key);
  if (!/^[a-f0-9]{64}$/.test(out.expectedBundleSha256)) throw new Error("EXPECTED_BUNDLE_SHA256_INVALID");
  if (!Number.isInteger(out.pilotSize) || out.pilotSize < 1 || out.pilotSize > 10) throw new Error("PILOT_SIZE_INVALID");
  return out;
}

function readRights(file) {
  const rights = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  invariant(rights.schema_version === "materials_pb2_publication_rights.1.0.0" && rights.corpus_slug === SLUG
    && rights.owner_attested === true, "RIGHTS_ATTESTATION_MISSING");
  for (const key of ["source_text_and_diagrams", "generated_learning_columns", "independent_solutions", "bilingual_solution_derivatives", "public_read", "public_solution_display_and_print", "public_stream_current_zero_audio_edition", "package_download"])
    invariant(rights.classes?.[key] === true, `RIGHTS_CLASS_NOT_COVERED:${key}`);
  invariant(rights.classes.full_tts_audio_and_timings === false, "FULL_TTS_MUST_REMAIN_DEFERRED");
  const basis = String(rights.basis || ""), assertedAt = String(rights.asserted_at || "");
  const match = basis.match(/(\d{4})_(\d{2})_(\d{2})$/);
  invariant(match && assertedAt === `${match[1]}-${match[2]}-${match[3]}`, "RIGHTS_BASIS_DATE_INVALID");
  return Object.freeze({
    source: rights,
    publicationPreset: Object.freeze({ public_read_allowed: true, public_stream_allowed: true, package_download_allowed: true, basis, asserted_at: assertedAt }),
  });
}

function readSourceBundle(bundlePath, expectedBundleSha256 = CURRENT_BUNDLE_SHA256) {
  const absolute = path.resolve(bundlePath), bundleBytes = fs.readFileSync(absolute), bundleSha256 = sha256(bundleBytes);
  invariant(bundleSha256 === expectedBundleSha256, `SOURCE_BUNDLE_HASH_MISMATCH:${bundleSha256}`);
  const zip = new AdmZip(bundleBytes);
  const manifestBytes = zip.readFile("manifest.json"), libraryBytes = zip.readFile("library/library.json");
  invariant(manifestBytes && libraryBytes, "SOURCE_BUNDLE_STRUCTURE_INVALID");
  const manifest = JSON.parse(manifestBytes.toString("utf8")), library = JSON.parse(libraryBytes.toString("utf8"));
  invariant(manifest.format === "linguistpro-bundle" && manifest.generator === "materials-science-pb2-canonical-pipeline"
    && manifest.text_count === 60 && manifest.row_count === 693 && manifest.audio_count === 0 && manifest.asset_count === 72
    && sha256(libraryBytes) === manifest.library_sha256, "SOURCE_BUNDLE_MANIFEST_INVALID");
  invariant(Array.isArray(library.texts) && library.texts.length === 60 && (!library.audio_assets || library.audio_assets.length === 0), "SOURCE_LIBRARY_INVALID");
  const tableManifest = JSON.parse(fs.readFileSync(TABLE_MANIFEST, "utf8"));
  const tableByTask = new Map(tableManifest.tasks.map(task => [task.task_id, task]));
  const seenTasks = new Set(), seenAssets = new Map();
  let rowCount = 0;
  const items = library.texts.map((text, index) => {
    const meta = text?.source_meta?.materials_science_task;
    invariant(meta?.schema === "linguistpro.materials-science.task-card.1" && /^materials-science-y1-pb2-[a-z0-9-]+$/.test(meta.task_id)
      && !seenTasks.has(meta.task_id) && tableByTask.has(meta.task_id), `SOURCE_TASK_INVALID:${index + 1}`);
    seenTasks.add(meta.task_id);
    const rows = Array.isArray(text.rows) ? text.rows : [];
    invariant(rows.length > 0, `SOURCE_TASK_ROWS_EMPTY:${meta.task_id}`);
    for (const row of rows) {
      for (const field of ["hebrew_plain", "hebrew_niqqud", "translit", "russian"])
        invariant(String(row[field] || "").trim(), `SOURCE_ROW_COLUMN_MISSING:${meta.task_id}:${field}`);
      invariant(!row.audio_asset_key, `FULL_TTS_PRESENT_IN_SOURCE:${meta.task_id}`);
    }
    for (const asset of (meta.source_assets || [])) {
      const entry = zip.getEntry(String(asset.path || "").replaceAll("\\", "/"));
      invariant(entry && !entry.isDirectory, `SOURCE_FIGURE_MISSING:${asset.path}`);
      const body = entry.getData();
      invariant(body.length === Number(asset.bytes) && sha256(body) === asset.sha256, `SOURCE_FIGURE_DRIFT:${asset.path}`);
      seenAssets.set(asset.sha256, asset.path);
    }
    rowCount += rows.length;
    const sourceCanonicalTaskSha256 = sha256(Buffer.from(stableJson(text), "utf8"));
    invariant(sourceCanonicalTaskSha256 === tableByTask.get(meta.task_id).canonical_task_sha256, `STUDENT_TABLE_SOURCE_DRIFT:${meta.task_id}`);
    const sanitizedText = sanitizeSnapshot(text);
    return {
      taskId: meta.task_id, sourceCanonicalTaskSha256,
      publishedCanonicalTaskSha256: sha256(Buffer.from(canonicalJson(sanitizedText), "utf8")),
      sourceWorkId: String(text.text_key), title: String(text.title), creator: "LinguistPro Materials Science corpus", expectedAudioCount: 0,
      snapshot: { library: { schema_version: library.schema_version, corpus_meta_version: library.corpus_meta_version, shelves: [], texts: [text], audio_assets: [] } },
    };
  });
  invariant(rowCount === 693 && seenAssets.size === 72 && seenTasks.size === 60, "SOURCE_BUNDLE_TOTALS_INVALID");
  return { manifest, library, items, bundleSha256, rowCount, assetCount: seenAssets.size };
}

async function ownerActor(db, requested) {
  const rows = requested ? await all(db, "SELECT id,role FROM users WHERE id=? AND lower(role)='owner'", [String(requested)])
    : await all(db, "SELECT id,role FROM users WHERE lower(role)='owner' ORDER BY id");
  if (rows.length !== 1) throw new Error(rows.length ? "OWNER_USER_AMBIGUOUS" : "OWNER_USER_NOT_FOUND");
  return rows[0];
}

function idem(stage, source) { return `materials-pb2-20260830-${stage}-${source.bundleSha256.slice(0, 16)}`; }

async function publishDraft(repo, actor, corpusId, source, rights, stage) {
  let detail = await repo.getPublisherCorpus(actor, corpusId);
  const preset = rights.publicationPreset;
  const pending = (detail.items || []).filter(item => !item.rights || !["PUBLIC_READ", "PUBLIC_STREAM", "PACKAGE_DOWNLOAD"].every(permission => {
    const fact = item.rights[permission]; return fact && Number(fact.allowed) === 1 && fact.basis === preset.basis && fact.asserted_at === preset.asserted_at;
  }));
  let version = Number(detail.draft.version);
  if (pending.length) version = Number((await repo.applyRightsPreset(actor, corpusId, { itemIds: pending.map(item => item.item_id), expectedVersion: version, preset }, { idempotencyKey: idem(`${stage}-rights`, source) })).draft_version);
  const validation = await repo.validateDraft(actor, corpusId, version);
  invariant(validation.ready && validation.package_complete && validation.asset_missing === 0 && validation.included_assets === 0, `MATERIALS_DRAFT_NOT_COMPLETE:${JSON.stringify(validation)}`);
  return repo.publish(actor, corpusId, { expectedVersion: version }, { idempotencyKey: idem(`${stage}-publish`, source) });
}

async function verifyPublished(repo, db, slug, expectedSource, rights) {
  const catalog = await repo.getPublicCorpus(slug);
  invariant(catalog.items.length === expectedSource.items.length && Number(catalog.edition.item_count) === expectedSource.items.length, "PUBLIC_ITEM_COUNT_MISMATCH");
  const editionRows = await all(db, "SELECT edition_item_id,public_work_id,position_no,snapshot_sha256 FROM published_corpus_edition_items WHERE edition_id=? ORDER BY position_no", [catalog.edition.edition_id]);
  invariant(editionRows.length === expectedSource.items.length, "PUBLIC_EDITION_ITEMS_MISSING");
  const anchors = [];
  for (const [index, item] of catalog.items.entries()) {
    const expected = expectedSource.items[index], edition = editionRows[index];
    invariant(Number(item.position_no) === index + 1 && edition.public_work_id === item.public_work_id && item.public_read_allowed
      && item.public_stream_allowed && item.package_download_allowed && item.rights_basis === rights.publicationPreset.basis
      && item.rights_asserted_at === rights.publicationPreset.asserted_at && Number(item.expected_audio_count) === 0
      && Number(item.included_audio_count) === 0 && Number(item.asset_missing) === 0 && item.package_complete, "PUBLIC_ITEM_RECEIPT_MISMATCH");
    const work = await repo.getPublicWork(slug, item.public_work_id);
    const canonical = work.item.snapshot?.library?.texts?.[0];
    invariant(canonical && work.assets.length === 0 && work.item.snapshot_sha256 === item.snapshot_sha256
      && sha256(Buffer.from(canonicalJson(canonical), "utf8")) === expected.publishedCanonicalTaskSha256, "PUBLIC_WORK_READBACK_MISMATCH");
    anchors.push({ task_id: expected.taskId, position_no: index + 1, edition_item_id: edition.edition_item_id,
      public_work_id: item.public_work_id, snapshot_sha256: item.snapshot_sha256,
      canonical_task_sha256: expected.publishedCanonicalTaskSha256, source_canonical_task_sha256: expected.sourceCanonicalTaskSha256 });
  }
  const facts = await get(db, `SELECT COUNT(*) facts,SUM(CASE WHEN allowed=1 THEN 1 ELSE 0 END) allowed,COUNT(DISTINCT permission) permissions
    FROM publication_rights_facts f JOIN published_corpus_edition_items i ON i.source_item_id=f.item_id WHERE i.edition_id=?`, [catalog.edition.edition_id]);
  invariant(Number(facts.facts) === expectedSource.items.length * 3 && Number(facts.allowed) === expectedSource.items.length * 3 && Number(facts.permissions) === 3, "PUBLIC_RIGHTS_FACTS_MISMATCH");
  const archive = await repo.getPublicPackage(slug);
  invariant(Number(catalog.edition.asset_count) === 0 && Number(catalog.edition.asset_missing) === 0 && catalog.edition.package_complete, "PUBLIC_EDITION_AUDIO_BOUNDARY_INVALID");
  return { corpus_id: catalog.corpus.corpus_id, edition_id: catalog.edition.edition_id, edition_number: catalog.edition.edition_number,
    manifest_sha256: catalog.edition.manifest_sha256, items: catalog.items.length, physical_audio_assets: 0, asset_missing: 0,
    package_complete: true, package_bytes: Number(archive.edition.package_bytes), package_sha256: archive.edition.package_sha256, anchors };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv), source = readSourceBundle(options.bundle, options.expectedBundleSha256), rights = readRights(options.rights);
  const dbPath = path.resolve(options.dbPath), dataDir = path.resolve(options.dataDir), db = await open(dbPath);
  let repo = null, actor = null, corpus = null, initialEditionId = null, mutationStarted = false;
  try {
    await exec(db, "PRAGMA foreign_keys=ON");
    actor = await ownerActor(db, options.ownerUserId);
    const migrationReady = !!(await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='published_corpora'"));
    const plan = { mode: options.apply ? "APPLY" : "DRY_RUN", migration_ready: migrationReady, slug: options.slug,
      source_bundle_sha256: source.bundleSha256, texts: source.items.length, rows: source.rowCount, source_figures: source.assetCount,
      physical_audio_assets: 0, full_tts_generated: false, pilot_size: Math.min(options.pilotSize, source.items.length),
      attestation: { basis: rights.publicationPreset.basis, asserted_at: rights.publicationPreset.asserted_at, content_classes: rights.source.classes } };
    if (!options.apply) { process.stdout.write(stableJson(plan)); return plan; }
    invariant(migrationReady, "PUBLICATION_MIGRATION_NOT_APPLIED");
    const beforeSensitive = await sensitiveFingerprint(db);
    repo = createPublicationRepo({ db, dataDir });
    corpus = (await repo.listPublisherCorpora(actor)).find(item => item.slug === options.slug);
    if (corpus) initialEditionId = corpus.current_edition_id || null;
    if (!corpus) corpus = await repo.createCorpus(actor, { slug: options.slug, title: options.title, description: options.description }, { idempotencyKey: idem("create", source) });
    mutationStarted = true;
    let detail = await repo.getPublisherCorpus(actor, corpus.corpus_id), pilot = null;
    if (!detail.current_edition_id) {
      const pilotItems = source.items.slice(0, options.pilotSize), present = new Set(detail.items.map(item => item.source_work_id));
      const missing = pilotItems.filter(item => !present.has(item.sourceWorkId));
      if (missing.length) await repo.copyMyTextItems(actor, corpus.corpus_id, { items: missing, expectedVersion: Number(detail.draft.version) }, { idempotencyKey: idem("pilot-copy", source) });
      await publishDraft(repo, actor, corpus.corpus_id, source, rights, "pilot");
      pilot = await verifyPublished(repo, db, options.slug, { ...source, items: pilotItems }, rights);
    }
    detail = await repo.getPublisherCorpus(actor, corpus.corpus_id);
    if (!detail.draft && Number((detail.editions?.[0]?.item_count) || 0) < source.items.length) {
      await repo.createRevisionDraft(actor, corpus.corpus_id, { idempotencyKey: idem("full-revision", source) });
      detail = await repo.getPublisherCorpus(actor, corpus.corpus_id);
    }
    if (detail.draft) {
      const present = new Set(detail.items.map(item => item.source_work_id)), missing = source.items.filter(item => !present.has(item.sourceWorkId));
      if (missing.length) await repo.copyMyTextItems(actor, corpus.corpus_id, { items: missing, expectedVersion: Number(detail.draft.version) }, { idempotencyKey: idem("full-copy", source) });
      await publishDraft(repo, actor, corpus.corpus_id, source, rights, "full");
    }
    const full = await verifyPublished(repo, db, options.slug, source, rights);
    const afterSensitive = await sensitiveFingerprint(db);
    invariant(JSON.stringify(beforeSensitive) === JSON.stringify(afterSensitive), "LEARNER_PRIVATE_REVIEW_CHANGED");
    const anchor = { schema_version: "materials_pb2_production_publication_anchor.1.0.0", corpus_slug: SLUG,
      source_bundle_sha256: source.bundleSha256, edition: { edition_id: full.edition_id, edition_number: full.edition_number, manifest_sha256: full.manifest_sha256 }, items: full.anchors };
    fs.mkdirSync(path.dirname(path.resolve(options.anchorOutput)), { recursive: true });
    fs.writeFileSync(path.resolve(options.anchorOutput), stableJson(anchor));
    const result = { ok: true, plan, pilot: pilot && { ...pilot, anchors: undefined }, full: { ...full, anchors: undefined },
      anchor_output: path.resolve(options.anchorOutput), learner_private_review_unchanged: true, rollback_target_before_apply: initialEditionId };
    process.stdout.write(stableJson(result)); return result;
  } catch (error) {
    if (options.apply && mutationStarted && repo && actor && corpus) {
      try {
        const rollback = initialEditionId
          ? await repo.rollback(actor, corpus.corpus_id, { editionId: initialEditionId, reasonCode: "MATERIALS_PB2_APPLY_FAILED" }, { idempotencyKey: idem("automatic-rollback", source) })
          : await repo.withdraw(actor, corpus.corpus_id, { reasonCode: "MATERIALS_PB2_APPLY_FAILED" }, { idempotencyKey: idem("automatic-withdraw", source) });
        error.message += `; AUTOMATIC_POINTER_RECOVERY=${JSON.stringify(rollback)}`;
      } catch (rollbackError) { error.message += `; AUTOMATIC_POINTER_RECOVERY_FAILED=${rollbackError.message}`; }
    }
    throw error;
  } finally { await close(db); }
}

if (require.main === module) main().catch(error => { process.stderr.write(`publish-materials-pb2-corpus: ${error.message}\n`); process.exitCode = 1; });
module.exports = { SLUG, TITLE, CURRENT_BUNDLE_SHA256, parseArgs, readRights, readSourceBundle, publishDraft, verifyPublished, main };
