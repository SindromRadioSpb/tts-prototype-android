#!/usr/bin/env node
"use strict";

// Canonical owner-only writer for Study Songs publication-agent rights.
// Dry-run is the default. Apply requires exact edition + manifest coordinates.

const crypto = require("crypto");
const path = require("path");
const sqlite3 = require("sqlite3");
const { createPublicationAgentRightsRepo } = require("../../db/publicationAgentRightsRepo");

const BATCH_SIZE = 100;
const EXPECTED_SLUG = "study-songs";

function parseArgs(argv) {
  const out = { apply: false, slug: EXPECTED_SLUG };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db-path") out.dbPath = argv[++index];
    else if (arg === "--corpus-slug") out.slug = argv[++index];
    else if (arg === "--edition-id") out.editionId = argv[++index];
    else if (arg === "--expected-manifest-sha256") out.manifestSha256 = argv[++index];
    else if (arg === "--owner-id") out.ownerId = argv[++index];
    else if (arg === "--idempotency-key") out.idempotencyKey = argv[++index];
    else if (arg === "--apply") out.apply = true;
    else throw new Error(`UNKNOWN_ARG:${arg}`);
  }
  for (const key of ["dbPath", "editionId", "manifestSha256", "ownerId", "idempotencyKey"])
    if (!out[key]) throw new Error(`MISSING_OPTION:${key}`);
  if (out.slug !== EXPECTED_SLUG) throw new Error("STUDY_SONGS_SLUG_REQUIRED");
  if (!/^[0-9a-f]{64}$/.test(out.manifestSha256)) throw new Error("MANIFEST_SHA256_INVALID");
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(out.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_INVALID");
  return out;
}

const open = (file, mode) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(file, mode, error => error ? reject(error) : resolve(db));
});
const close = db => new Promise(resolve => db.close(() => resolve()));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

function planFacts(editionId, items) {
  const facts = [];
  for (const item of items) {
    facts.push(
      { targetKind: "EDITION_ITEM", targetId: item.edition_item_id, useClass: "DISCOVER", allowed: true, basis: "OWNER_APPROVAL_ALL_CORPORA_AGENT_ACCESS_MCP_R_2026_08_26", assertedAt: "2026-08-26" },
      { targetKind: "EDITION_ITEM", targetId: item.edition_item_id, useClass: "SOURCE_TEXT", allowed: true, basis: "OWNER_APPROVAL_ALL_CORPORA_AGENT_ACCESS_MCP_R_2026_08_26", assertedAt: "2026-08-26" },
      { targetKind: "EDITION_ITEM", targetId: item.edition_item_id, useClass: "SOURCE_BINARY", allowed: true, basis: "OWNER_APPROVAL_ALL_CORPORA_AGENT_ACCESS_MCP_R_2026_08_26", assertedAt: "2026-08-26" },
      { targetKind: "EDITION_ITEM", targetId: item.edition_item_id, useClass: "DERIVATIVE_TEXT", allowed: false, basis: "DERIVATIVE_TEXT_DEFERRED_2026_08_26", assertedAt: "2026-08-26" },
    );
  }
  facts.push({ targetKind: "PACKAGE", targetId: editionId, useClass: "SOURCE_BINARY", allowed: false, basis: "PACKAGE_AGENT_ACCESS_DENIED_2026_08_26", assertedAt: "2026-08-26" });
  return facts;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const db = await open(path.resolve(options.dbPath), options.apply ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY);
  try {
    if (options.apply) await exec(db, "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    const owner = await get(db, "SELECT id,role FROM users WHERE id=?", [options.ownerId]);
    if (!owner || String(owner.role).toLowerCase() !== "owner") throw new Error("OWNER_AUTHORITY_REQUIRED");
    const edition = await get(db, `SELECT c.slug,c.status,c.current_edition_id,e.edition_id,e.manifest_sha256,e.item_count,e.asset_count
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      WHERE c.slug=? AND c.status='PUBLISHED' AND e.edition_id=?`, [options.slug, options.editionId]);
    if (!edition || edition.current_edition_id !== options.editionId) throw new Error("CURRENT_EDITION_EXACT_MATCH_REQUIRED");
    if (edition.manifest_sha256 !== options.manifestSha256) throw new Error("MANIFEST_SHA256_MISMATCH");
    if (!await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='published_corpus_agent_rights_facts'")) throw new Error("MIGRATION_065_REQUIRED");
    const items = await all(db, `SELECT edition_item_id FROM published_corpus_edition_items
      WHERE edition_id=? AND public_read_allowed=1 ORDER BY position_no,edition_item_id`, [options.editionId]);
    const publicAssets = Number((await get(db, "SELECT COUNT(*) n FROM published_corpus_assets WHERE edition_id=? AND public_stream_allowed=1", [options.editionId])).n);
    if (items.length !== Number(edition.item_count) || publicAssets !== Number(edition.asset_count)) throw new Error("PUBLICATION_RIGHTS_OR_ASSET_COUNT_MISMATCH");
    const facts = planFacts(options.editionId, items);
    const planSha256 = crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    const report = { ok: true, mode: options.apply ? "APPLY" : "DRY_RUN", corpus_slug: options.slug,
      edition_id: options.editionId, manifest_sha256: options.manifestSha256, items: items.length,
      public_assets: publicAssets, planned_facts: facts.length, batches: Math.ceil(facts.length / BATCH_SIZE),
      plan_sha256: planSha256, package_allowed: false, derivative_text_allowed: false };
    if (options.apply) {
      const repo = createPublicationAgentRightsRepo({ db });
      let applied = 0;
      for (let offset = 0; offset < facts.length; offset += BATCH_SIZE) {
        const batch = facts.slice(offset, offset + BATCH_SIZE);
        const receipt = await repo.applyFacts({ id: owner.id, role: owner.role }, { editionId: options.editionId, facts: batch },
          { idempotencyKey: `${options.idempotencyKey}.b${String(offset / BATCH_SIZE + 1).padStart(2, "0")}` });
        applied += receipt.applied;
      }
      report.applied_facts = applied;
    } else report.applied_facts = 0;
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally { await close(db); }
}

if (require.main === module) main().catch(error => { process.stderr.write(`apply-study-songs-agent-rights: ${error.message}\n`); process.exitCode = 1; });
module.exports = { main, parseArgs, planFacts, BATCH_SIZE };
