#!/usr/bin/env node
"use strict";

// Controlled Study Songs publication runner. It is intentionally a repository
// client, not a second writer: every canonical mutation delegates to
// db/publicationRepo.js. Source corpora and learner tables are read-only and
// fingerprinted before/after. Default mode is dry-run; --apply is required.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const { createPublicationRepo } = require("../../db/publicationRepo");
const { sensitiveFingerprint } = require("./publication-migration-rehearsal");

const ATTESTATION = Object.freeze({
  public_read_allowed: true,
  public_stream_allowed: true,
  package_download_allowed: true,
  basis: "OWNER_ATTESTATION_2026_08_20",
  asserted_at: "2026-08-20",
});

function parseArgs(argv) {
  const out = { apply: false, pilotSize: 3, slug: "study-songs", title: "Учебные песни", description: "Песни для изучения языка: текст, перевод и оригинальное аудио." };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--db-path") out.dbPath = argv[++index];
    else if (arg === "--data-dir") out.dataDir = argv[++index];
    else if (arg === "--source-corpus-id") out.sourceCorpusId = argv[++index];
    else if (arg === "--expected-works") out.expectedWorks = Number(argv[++index]);
    else if (arg === "--pilot-size") out.pilotSize = Number(argv[++index]);
    else throw new Error("UNKNOWN_ARG:" + arg);
  }
  if (!out.dbPath || !out.dataDir) throw new Error("MISSING_DB_OR_DATA_DIR");
  if (!Number.isInteger(out.pilotSize) || out.pilotSize < 1 || out.pilotSize > 10) throw new Error("PILOT_SIZE_INVALID");
  return out;
}

const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const stable = value => JSON.stringify(value, Object.keys(value || {}).sort());

async function fileHash(file) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => { const stream = fs.createReadStream(file); stream.on("data", chunk => hash.update(chunk)); stream.once("error", reject); stream.once("end", resolve); });
  return hash.digest("hex");
}
function sourceFile(dataDir, relative) {
  const root = path.resolve(dataDir, "group-corpora"), absolute = path.resolve(dataDir, String(relative || ""));
  if (!absolute.startsWith(root + path.sep)) throw new Error("SOURCE_PATH_INVALID");
  return absolute;
}

async function findSource(db, requestedId) {
  const params = [], where = requestedId ? "c.corpus_id=?" : "(lower(c.slug) LIKE '%study%song%' OR lower(c.title) LIKE '%study%song%' OR c.title LIKE '%Учебн%пес%')";
  if (requestedId) params.push(requestedId);
  const rows = await all(db, `SELECT c.corpus_id,c.slug,c.title,c.status,c.visibility,g.owner_user_id,COUNT(w.work_id) works,COALESCE(SUM(w.audio_count),0) expected_audio
    FROM group_corpora c JOIN reading_groups g ON g.group_id=c.group_id JOIN group_corpus_works w ON w.corpus_id=c.corpus_id
    WHERE ${where} AND c.status!='REMOVED' AND w.rights_status!='REMOVED' GROUP BY c.corpus_id ORDER BY works DESC`, params);
  if (rows.length !== 1) throw new Error(rows.length ? "SOURCE_CORPUS_AMBIGUOUS" : "SOURCE_CORPUS_NOT_FOUND");
  const source = rows[0];
  if (source.visibility !== "GROUP_RESTRICTED") throw new Error("SOURCE_NOT_RESTRICTED");
  const actor = await get(db, "SELECT id,role FROM users WHERE id=?", [source.owner_user_id]);
  if (!actor || String(actor.role).toLowerCase() !== "owner") throw new Error("SOURCE_OWNER_INVALID");
  const member = await get(db, `SELECT 1 ok FROM group_corpora c JOIN reading_group_members m ON m.group_id=c.group_id
    WHERE c.corpus_id=? AND m.user_id=? AND m.role='OWNER' AND m.status='ACTIVE'`, [source.corpus_id, actor.id]);
  if (!member) throw new Error("SOURCE_OWNER_MEMBERSHIP_INVALID");
  return { source, actor };
}

async function sourceSnapshot(db, dataDir, corpusId) {
  const works = await all(db, `SELECT work_id,position_no,title,artist,bundle_path,bundle_sha256,rows_count,audio_count,notes_count,morph_count,audio_revision
    FROM group_corpus_works WHERE corpus_id=? AND rights_status!='REMOVED' ORDER BY position_no,work_id`, [corpusId]);
  const assets = await all(db, `SELECT work_id,asset_key,relative_path,bytes,sha256,mime,revision FROM group_corpus_audio WHERE corpus_id=? ORDER BY work_id,asset_key`, [corpusId]);
  for (const work of works) {
    const absolute = sourceFile(dataDir, work.bundle_path), stat = await fs.promises.stat(absolute);
    if (!stat.isFile() || await fileHash(absolute) !== work.bundle_sha256) throw new Error("SOURCE_BUNDLE_INVALID");
  }
  for (const asset of assets) {
    const absolute = sourceFile(dataDir, asset.relative_path), stat = await fs.promises.stat(absolute);
    if (!stat.isFile() || stat.size !== Number(asset.bytes) || await fileHash(absolute) !== asset.sha256) throw new Error("SOURCE_AUDIO_INVALID");
  }
  return { works, assets, works_sha256: sha(Buffer.from(JSON.stringify(works))), assets_sha256: sha(Buffer.from(JSON.stringify(assets))), rows: works.reduce((sum, row) => sum + Number(row.rows_count || 0), 0) };
}

function idem(stage, snapshot) { return "study-songs-20260820-" + stage + "-" + snapshot.works_sha256.slice(0, 16); }

async function ensureRights(repo, actor, corpusId, detail, snapshot, stage) {
  const pending = (detail.items || []).filter(item => !item.rights || !["PUBLIC_READ", "PUBLIC_STREAM", "PACKAGE_DOWNLOAD"].every(permission => {
    const fact = item.rights[permission]; return fact && Number(fact.allowed) === 1 && fact.basis === ATTESTATION.basis && fact.asserted_at === ATTESTATION.asserted_at;
  }));
  if (!pending.length) return Number(detail.draft.version);
  const result = await repo.applyRightsPreset(actor, corpusId, { itemIds: pending.map(item => item.item_id), expectedVersion: Number(detail.draft.version), preset: ATTESTATION }, { idempotencyKey: idem(stage + "-rights", snapshot) });
  return Number(result.draft_version);
}

async function publishActive(repo, actor, corpusId, snapshot, stage) {
  let detail = await repo.getPublisherCorpus(actor, corpusId);
  const version = await ensureRights(repo, actor, corpusId, detail, snapshot, stage);
  const validation = await repo.validateDraft(actor, corpusId, version);
  if (!validation.ready) throw new Error("DRAFT_NOT_READY:" + JSON.stringify(validation.blockers));
  const receipt = await repo.publish(actor, corpusId, { expectedVersion: version }, { idempotencyKey: idem(stage + "-publish", snapshot) });
  if (!receipt.canonical_committed) throw new Error("CANONICAL_COMMIT_MISSING");
  return receipt;
}

async function verifyPublished(repo, db, expectedCount) {
  const catalog = await repo.getPublicCorpus("study-songs");
  if (catalog.items.length !== expectedCount || Number(catalog.edition.item_count) !== expectedCount) throw new Error("PUBLIC_ITEM_COUNT_MISMATCH");
  let assets = 0, missing = 0;
  for (const item of catalog.items) {
    if (!item.public_read_allowed || !item.public_stream_allowed || !item.package_download_allowed || item.rights_basis !== ATTESTATION.basis || item.rights_asserted_at !== ATTESTATION.asserted_at) throw new Error("PUBLIC_RIGHTS_MISMATCH");
    const work = await repo.getPublicWork("study-songs", item.public_work_id);
    if (!work.item.snapshot || work.item.snapshot_sha256 !== item.snapshot_sha256) throw new Error("PUBLIC_WORK_READBACK_MISMATCH");
    for (const asset of work.assets) { await repo.getPublicAsset("study-songs", asset.asset_key, "stream"); assets += 1; }
    missing += Number(item.asset_missing || 0);
  }
  const archive = await repo.getPublicPackage("study-songs");
  const rights = await get(db, `SELECT COUNT(*) facts,SUM(CASE WHEN allowed=1 THEN 1 ELSE 0 END) allowed,COUNT(DISTINCT permission) permissions
    FROM publication_rights_facts f JOIN published_corpus_edition_items i ON i.source_item_id=f.item_id WHERE i.edition_id=?`, [catalog.edition.edition_id]);
  if (Number(rights.facts) !== expectedCount * 3 || Number(rights.allowed) !== expectedCount * 3 || Number(rights.permissions) !== 3) throw new Error("PER_ITEM_RIGHTS_FACTS_MISMATCH");
  return { edition_id: catalog.edition.edition_id, edition_number: catalog.edition.edition_number, manifest_sha256: catalog.edition.manifest_sha256, items: catalog.items.length, assets, asset_missing: missing, package_complete: !!catalog.edition.package_complete, package_bytes: Number(archive.edition.package_bytes), package_sha256: archive.edition.package_sha256 };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv), dbPath = path.resolve(options.dbPath), dataDir = path.resolve(options.dataDir);
  const db = await open(dbPath);
  try {
    await new Promise((resolve, reject) => db.exec("PRAGMA foreign_keys=ON", error => error ? reject(error) : resolve()));
    const migrationReady = !!(await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='published_corpora'"));
    const { source, actor } = await findSource(db, options.sourceCorpusId);
    const beforeSource = await sourceSnapshot(db, dataDir, source.corpus_id);
    const beforeSensitive = await sensitiveFingerprint(db);
    if (options.expectedWorks != null && beforeSource.works.length !== options.expectedWorks) throw new Error("EXPECTED_WORK_COUNT_MISMATCH");
    const plan = { mode: options.apply ? "APPLY" : "DRY_RUN", migration_ready: migrationReady, source: { works: beforeSource.works.length, rows: beforeSource.rows, audio_assets: beforeSource.assets.length, works_sha256: beforeSource.works_sha256, assets_sha256: beforeSource.assets_sha256 }, pilot_size: Math.min(options.pilotSize, beforeSource.works.length), attestation: ATTESTATION };
    if (!options.apply) { process.stdout.write(JSON.stringify(plan, null, 2) + "\n"); return plan; }
    if (!migrationReady) throw new Error("PUBLICATION_MIGRATION_NOT_APPLIED");

    const repo = createPublicationRepo({ db, dataDir });
    let corpus = (await repo.listPublisherCorpora(actor)).find(item => item.slug === options.slug);
    if (!corpus) {
      const created = await repo.createCorpus(actor, { slug: options.slug, title: options.title, description: options.description }, { idempotencyKey: idem("create", beforeSource) });
      corpus = { corpus_id: created.corpus_id, current_edition_id: null };
    }
    let detail = await repo.getPublisherCorpus(actor, corpus.corpus_id), pilotReceipt = null, pilotEvidence = null;
    if (!detail.current_edition_id) {
      if (!detail.draft) throw new Error("INITIAL_DRAFT_MISSING");
      const pilotIds = beforeSource.works.slice(0, options.pilotSize).map(work => work.work_id);
      const present = new Set(detail.items.map(item => item.source_work_id));
      const missingPilot = pilotIds.filter(workId => !present.has(workId));
      if (missingPilot.length) await repo.copyGroupCorpusItems(actor, corpus.corpus_id, { sourceCorpusId: source.corpus_id, workIds: missingPilot, expectedVersion: Number(detail.draft.version) }, { idempotencyKey: idem("pilot-copy", beforeSource) });
      pilotReceipt = await publishActive(repo, actor, corpus.corpus_id, beforeSource, "pilot");
      pilotEvidence = await verifyPublished(repo, db, pilotIds.length);
    }

    detail = await repo.getPublisherCorpus(actor, corpus.corpus_id);
    if (!detail.draft && Number((detail.editions && detail.editions[0] && detail.editions[0].item_count) || 0) < beforeSource.works.length) {
      await repo.createRevisionDraft(actor, corpus.corpus_id, { idempotencyKey: idem("full-revision", beforeSource) });
      detail = await repo.getPublisherCorpus(actor, corpus.corpus_id);
    }
    let fullReceipt = null;
    if (detail.draft) {
      const present = new Set(detail.items.map(item => item.source_work_id));
      const missing = beforeSource.works.map(work => work.work_id).filter(workId => !present.has(workId));
      if (missing.length) {
        await repo.copyGroupCorpusItems(actor, corpus.corpus_id, { sourceCorpusId: source.corpus_id, workIds: missing, expectedVersion: Number(detail.draft.version) }, { idempotencyKey: idem("full-copy", beforeSource) });
      }
      fullReceipt = await publishActive(repo, actor, corpus.corpus_id, beforeSource, "full");
    }
    const fullEvidence = await verifyPublished(repo, db, beforeSource.works.length);
    const afterSource = await sourceSnapshot(db, dataDir, source.corpus_id), afterSensitive = await sensitiveFingerprint(db);
    if (beforeSource.works_sha256 !== afterSource.works_sha256 || beforeSource.assets_sha256 !== afterSource.assets_sha256) throw new Error("OWNER_SOURCE_CHANGED");
    if (JSON.stringify(beforeSensitive) !== JSON.stringify(afterSensitive)) throw new Error("LEARNER_OR_PRIVATE_STATE_CHANGED");
    const result = { ok: true, plan, pilot: pilotEvidence, pilot_receipt: pilotReceipt, full: fullEvidence, full_receipt: fullReceipt, source_unchanged: true, learner_private_review_unchanged: true, publication_events: Number((await get(db, "SELECT COUNT(*) n FROM publication_events WHERE corpus_id=?", [corpus.corpus_id])).n) };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n"); return result;
  } finally { await close(db); }
}

if (require.main === module) main().catch(error => { process.stderr.write("publish-study-songs: " + error.message + "\n"); process.exitCode = 1; });
module.exports = { main, parseArgs, sourceSnapshot, verifyPublished, ATTESTATION };
