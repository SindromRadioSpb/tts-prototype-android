#!/usr/bin/env node
"use strict";

// Controlled publication runner for the owner-approved Physics Year 1 corpus.
// It consumes the locally verified learning ZIP, materializes only its referenced
// TTS assets into the shared server cache, and delegates every canonical write to
// publicationRepo. Default mode is a read-only plan; --apply is required.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const AdmZip = require("adm-zip");
const { createPublicationRepo } = require("../../db/publicationRepo");
const { sensitiveFingerprint } = require("./publication-migration-rehearsal");
const { DEFAULT_PROFILE, validMp3, verifyOutputBundle } = require("./physics-corpus-tts");

const SLUG = "physics-year1-problems";
const TITLE = "Физика — задачник, 1 год";
const DESCRIPTION = "74 задачи первого года: условия и подпункты на иврите с русским переводом и построчной озвучкой.";
const ATTESTATION = Object.freeze({
  public_read_allowed: true,
  public_stream_allowed: true,
  package_download_allowed: true,
  basis: "OWNER_ATTESTATION_PHYSICS_YEAR1_2026_08_25",
  asserted_at: "2026-08-25",
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));

function parseArgs(argv) {
  const out = { apply: false, pilotSize: 3, slug: SLUG, title: TITLE, description: DESCRIPTION };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--db-path") out.dbPath = argv[++index];
    else if (arg === "--data-dir") out.dataDir = argv[++index];
    else if (arg === "--bundle") out.bundle = argv[++index];
    else if (arg === "--owner-user-id") out.ownerUserId = argv[++index];
    else if (arg === "--pilot-size") out.pilotSize = Number(argv[++index]);
    else throw new Error("UNKNOWN_ARG:" + arg);
  }
  for (const key of ["dbPath", "dataDir", "bundle"]) if (!out[key]) throw new Error("MISSING_OPTION:" + key);
  if (!Number.isInteger(out.pilotSize) || out.pilotSize < 1 || out.pilotSize > 10) throw new Error("PILOT_SIZE_INVALID");
  return out;
}

function readSourceBundle(bundlePath) {
  const verified = verifyOutputBundle(bundlePath, DEFAULT_PROFILE);
  const zip = new AdmZip(path.resolve(bundlePath));
  const library = JSON.parse(zip.readAsText("library/library.json"));
  const assets = new Map((library.audio_assets || []).map(asset => [String(asset.asset_key), asset]));
  const items = (library.texts || []).map(text => {
    const keys = [...new Set((text.rows || []).map(row => String(row.audio_asset_key || "")))].sort();
    if (!keys.length || keys.some(key => !assets.has(key))) throw new Error("PHYSICS_ITEM_AUDIO_INCOMPLETE:" + text.text_key);
    return {
      sourceWorkId: String(text.text_key),
      title: String(text.title),
      creator: "LinguistPro Physics corpus",
      expectedAudioCount: keys.length,
      snapshot: {
        library: {
          schema_version: library.schema_version,
          corpus_meta_version: library.corpus_meta_version,
          shelves: [],
          texts: [text],
          audio_assets: keys.map(key => assets.get(key)),
        },
      },
      keys,
    };
  });
  return { zip, library, assets, items, verified, bundleSha256: verified.bundle_sha256 };
}

async function ownerActor(db, requested) {
  const rows = requested
    ? await all(db, "SELECT id,role FROM users WHERE id=? AND lower(role)='owner'", [String(requested)])
    : await all(db, "SELECT id,role FROM users WHERE lower(role)='owner' ORDER BY id");
  if (rows.length !== 1) throw new Error(rows.length ? "OWNER_USER_AMBIGUOUS" : "OWNER_USER_NOT_FOUND");
  return rows[0];
}

function materializeAudioCache(source, dataDir, options = {}) {
  const apply = options.apply !== false;
  const root = path.resolve(dataDir, "audio-cache");
  if (apply) fs.mkdirSync(root, { recursive: true });
  const receipts = [];
  for (const [key, meta] of source.assets) {
    const entry = source.zip.getEntry("audio/" + key + ".mp3");
    if (!entry) throw new Error("SOURCE_AUDIO_ENTRY_MISSING:" + key);
    const body = entry.getData();
    const bodySha = sha256(body);
    if (body.length !== Number(meta.size_bytes) || bodySha !== meta.content_hash) throw new Error("SOURCE_AUDIO_HASH_MISMATCH:" + key);
    const target = path.join(root, key + ".mp3");
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target);
      if (!validMp3(existing)) throw new Error("SHARED_CACHE_INVALID_MP3:" + key);
      const existingSha = sha256(existing);
      const action = existingSha === bodySha ? "EXISTING" : "REUSED_CANONICAL";
      meta.size_bytes = existing.length;
      meta.content_hash = existingSha;
      receipts.push({ key, bytes: existing.length, sha256: existingSha, action });
      continue;
    }
    if (!apply) {
      receipts.push({ key, bytes: body.length, sha256: bodySha, action: "MISSING" });
      continue;
    }
    const temp = target + ".tmp-" + process.pid;
    fs.writeFileSync(temp, body, { flag: "wx" });
    fs.renameSync(temp, target);
    receipts.push({ key, bytes: body.length, sha256: bodySha, action: "CREATED" });
  }
  return receipts;
}

function idem(stage, source) { return "physics-year1-20260825-" + stage + "-" + source.bundleSha256.slice(0, 16); }

async function publishDraft(repo, actor, corpusId, source, stage) {
  let detail = await repo.getPublisherCorpus(actor, corpusId);
  const pending = (detail.items || []).filter(item => !item.rights || !["PUBLIC_READ", "PUBLIC_STREAM", "PACKAGE_DOWNLOAD"].every(permission => {
    const fact = item.rights[permission];
    return fact && Number(fact.allowed) === 1 && fact.basis === ATTESTATION.basis && fact.asserted_at === ATTESTATION.asserted_at;
  }));
  let version = Number(detail.draft.version);
  if (pending.length) {
    const rights = await repo.applyRightsPreset(actor, corpusId, { itemIds: pending.map(item => item.item_id), expectedVersion: version, preset: ATTESTATION }, { idempotencyKey: idem(stage + "-rights", source) });
    version = Number(rights.draft_version);
  }
  const validation = await repo.validateDraft(actor, corpusId, version);
  if (!validation.ready || !validation.package_complete || validation.asset_missing !== 0) throw new Error("PHYSICS_DRAFT_NOT_COMPLETE:" + JSON.stringify(validation));
  return repo.publish(actor, corpusId, { expectedVersion: version }, { idempotencyKey: idem(stage + "-publish", source) });
}

async function verifyPublished(repo, db, slug, expectedItems) {
  const catalog = await repo.getPublicCorpus(slug);
  if (catalog.items.length !== expectedItems || Number(catalog.edition.item_count) !== expectedItems) throw new Error("PUBLIC_ITEM_COUNT_MISMATCH");
  let references = 0;
  for (const item of catalog.items) {
    if (!item.public_read_allowed || !item.public_stream_allowed || !item.package_download_allowed || item.rights_basis !== ATTESTATION.basis || item.rights_asserted_at !== ATTESTATION.asserted_at || Number(item.asset_missing) !== 0 || !item.package_complete) throw new Error("PUBLIC_ITEM_RECEIPT_MISMATCH");
    const work = await repo.getPublicWork(slug, item.public_work_id);
    if (!work.item.snapshot || work.item.snapshot_sha256 !== item.snapshot_sha256 || work.assets.length !== Number(item.included_audio_count)) throw new Error("PUBLIC_WORK_READBACK_MISMATCH");
    references += work.assets.length;
  }
  const archive = await repo.getPublicPackage(slug);
  const facts = await get(db, `SELECT COUNT(*) facts,SUM(CASE WHEN allowed=1 THEN 1 ELSE 0 END) allowed,COUNT(DISTINCT permission) permissions
    FROM publication_rights_facts f JOIN published_corpus_edition_items i ON i.source_item_id=f.item_id WHERE i.edition_id=?`, [catalog.edition.edition_id]);
  if (Number(facts.facts) !== expectedItems * 3 || Number(facts.allowed) !== expectedItems * 3 || Number(facts.permissions) !== 3) throw new Error("PUBLIC_RIGHTS_FACTS_MISMATCH");
  return { corpus_id: catalog.corpus.corpus_id, edition_id: catalog.edition.edition_id, edition_number: catalog.edition.edition_number, items: catalog.items.length, physical_assets: catalog.edition.asset_count, item_asset_references: references, asset_missing: catalog.edition.asset_missing, package_complete: catalog.edition.package_complete, manifest_sha256: catalog.edition.manifest_sha256, package_bytes: Number(archive.edition.package_bytes), package_sha256: archive.edition.package_sha256 };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const dbPath = path.resolve(options.dbPath), dataDir = path.resolve(options.dataDir);
  const source = readSourceBundle(options.bundle);
  const db = await open(dbPath);
  try {
    await exec(db, "PRAGMA foreign_keys=ON");
    const actor = await ownerActor(db, options.ownerUserId);
    const migrationReady = !!(await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='published_corpora'"));
    const cacheAudit = materializeAudioCache(source, dataDir, { apply: false });
    const plan = { mode: options.apply ? "APPLY" : "DRY_RUN", migration_ready: migrationReady, slug: options.slug, source_bundle_sha256: source.bundleSha256, texts: source.items.length, rows: source.verified.row_count, physical_audio_assets: source.assets.size, audio_bytes: source.verified.audio_bytes, profile: source.verified.profile, pilot_size: Math.min(options.pilotSize, source.items.length), attestation: ATTESTATION,
      cache: { assets: cacheAudit.length, existing: cacheAudit.filter(item => item.action === "EXISTING").length, canonical_reuse: cacheAudit.filter(item => item.action === "REUSED_CANONICAL").length, missing: cacheAudit.filter(item => item.action === "MISSING").length } };
    if (!options.apply) { process.stdout.write(JSON.stringify(plan, null, 2) + "\n"); return plan; }
    if (!migrationReady) throw new Error("PUBLICATION_MIGRATION_NOT_APPLIED");
    const beforeSensitive = await sensitiveFingerprint(db);
    const cacheReceipts = materializeAudioCache(source, dataDir);
    const repo = createPublicationRepo({ db, dataDir });
    let corpus = (await repo.listPublisherCorpora(actor)).find(item => item.slug === options.slug);
    if (!corpus) corpus = await repo.createCorpus(actor, { slug: options.slug, title: options.title, description: options.description }, { idempotencyKey: idem("create", source) });
    let detail = await repo.getPublisherCorpus(actor, corpus.corpus_id), pilot = null;
    if (!detail.current_edition_id) {
      const pilotItems = source.items.slice(0, options.pilotSize);
      const present = new Set(detail.items.map(item => item.source_work_id));
      const missing = pilotItems.filter(item => !present.has(item.sourceWorkId));
      if (missing.length) await repo.copyMyTextItems(actor, corpus.corpus_id, { items: missing, expectedVersion: Number(detail.draft.version) }, { idempotencyKey: idem("pilot-copy", source) });
      await publishDraft(repo, actor, corpus.corpus_id, source, "pilot");
      pilot = await verifyPublished(repo, db, options.slug, pilotItems.length);
    }
    detail = await repo.getPublisherCorpus(actor, corpus.corpus_id);
    if (!detail.draft && Number((detail.editions && detail.editions[0] && detail.editions[0].item_count) || 0) < source.items.length) {
      await repo.createRevisionDraft(actor, corpus.corpus_id, { idempotencyKey: idem("full-revision", source) });
      detail = await repo.getPublisherCorpus(actor, corpus.corpus_id);
    }
    if (detail.draft) {
      const present = new Set(detail.items.map(item => item.source_work_id));
      const missing = source.items.filter(item => !present.has(item.sourceWorkId));
      if (missing.length) await repo.copyMyTextItems(actor, corpus.corpus_id, { items: missing, expectedVersion: Number(detail.draft.version) }, { idempotencyKey: idem("full-copy", source) });
      await publishDraft(repo, actor, corpus.corpus_id, source, "full");
    }
    const full = await verifyPublished(repo, db, options.slug, source.items.length);
    const afterSensitive = await sensitiveFingerprint(db);
    if (JSON.stringify(beforeSensitive) !== JSON.stringify(afterSensitive)) throw new Error("LEARNER_PRIVATE_REVIEW_CHANGED");
    const result = { ok: true, plan, pilot, full, cache: { assets: cacheReceipts.length, created: cacheReceipts.filter(item => item.action === "CREATED").length, existing: cacheReceipts.filter(item => item.action === "EXISTING").length, canonical_reuse: cacheReceipts.filter(item => item.action === "REUSED_CANONICAL").length }, learner_private_review_unchanged: true };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return result;
  } finally { await close(db); }
}

if (require.main === module) main().catch(error => { process.stderr.write("publish-physics-corpus: " + error.message + "\n"); process.exitCode = 1; });
module.exports = { SLUG, ATTESTATION, parseArgs, readSourceBundle, materializeAudioCache, verifyPublished, main };
