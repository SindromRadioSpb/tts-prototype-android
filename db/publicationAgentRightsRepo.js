"use strict";

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");

const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;
const KINDS = new Set(["EDITION_ITEM", "EDITION_ASSET", "PACKAGE"]);
const USE_CLASSES = new Set(["DISCOVER", "SOURCE_TEXT", "SOURCE_BINARY", "DERIVATIVE_TEXT"]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function run(db, sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); })); }
function get(db, sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null))); }
function all(db, sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []))); }
function exec(db, sql) { return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve())); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function text(value, max, pattern, code = "PUBLICATION_AGENT_RIGHTS_INPUT_INVALID") {
  const out = String(value == null ? "" : value).trim();
  if (!out || Buffer.byteLength(out, "utf8") > max || (pattern && !pattern.test(out))) fail(code);
  return out;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function makeId(prefix) { return prefix + crypto.randomBytes(12).toString("hex"); }
function owner(actor) {
  if (!actor || !ID.test(String(actor.id || "")) || String(actor.role || "").toLowerCase() !== "owner") fail("PUBLICATION_AGENT_RIGHTS_FORBIDDEN");
  return String(actor.id);
}
function latestAllowed(alias, kindExpression, targetExpression, useClass) {
  return `(SELECT f.allowed FROM published_corpus_agent_rights_facts f
    WHERE f.edition_id=${alias}.edition_id AND f.target_kind=${kindExpression} AND f.target_id=${targetExpression} AND f.use_class='${useClass}'
    ORDER BY f.fact_seq DESC LIMIT 1)`;
}
function latestPhysicsAllowed(permission) {
  return `(SELECT pf.allowed FROM physics_task_resource_rights_facts pf
    WHERE pf.revision_id=prv.revision_id AND pf.permission='${permission}'
    ORDER BY pf.created_at DESC,pf.fact_id DESC LIMIT 1)`;
}
function physicsDiscoverable(itemAlias = "i") {
  return `EXISTS (SELECT 1 FROM physics_task_resources pr
    JOIN physics_task_resource_revisions prv ON prv.revision_id=pr.current_revision_id
    WHERE pr.corpus_id=c.corpus_id AND pr.public_work_id=${itemAlias}.public_work_id
      AND pr.status='PUBLISHED' AND prv.edition_id=e.edition_id
      AND prv.edition_item_id=${itemAlias}.edition_item_id AND prv.work_snapshot_sha256=${itemAlias}.snapshot_sha256
      AND COALESCE(${latestPhysicsAllowed("PUBLIC_READ")},0)=1
      AND COALESCE(${latestPhysicsAllowed("AGENT_READ")},0)=1)`;
}

function createPublicationAgentRightsRepo(options = {}) {
  const db = options.db || getDb();
  const now = options.now || (() => new Date().toISOString());

  async function applyFacts(actor, inputValue, optionsValue = {}) {
    const actorId = owner(actor);
    const editionId = text(inputValue && inputValue.editionId, 160, ID);
    const key = text(optionsValue.idempotencyKey, 160, /^[A-Za-z0-9_.:-]+$/, "PUBLICATION_AGENT_RIGHTS_IDEMPOTENCY_REQUIRED");
    // Keep idempotency receipts and append-only event detail under their DB byte
    // bounds. Larger owner assertions are split into deterministic batches by
    // the canonical writer.
    if (!inputValue || !Array.isArray(inputValue.facts) || !inputValue.facts.length || inputValue.facts.length > 100) fail("PUBLICATION_AGENT_RIGHTS_INPUT_INVALID");
    const facts = inputValue.facts.map(value => {
      const targetKind = text(value && value.targetKind, 40);
      const targetId = text(value && value.targetId, 160, ID);
      const useClass = text(value && value.useClass, 40);
      const basis = text(value && value.basis, 500);
      const assertedAt = text(value && value.assertedAt, 40, DATE);
      if (!KINDS.has(targetKind) || !USE_CLASSES.has(useClass) || (value.allowed !== true && value.allowed !== false)) fail("PUBLICATION_AGENT_RIGHTS_INPUT_INVALID");
      if ((targetKind === "EDITION_ASSET" || targetKind === "PACKAGE") && useClass !== "SOURCE_BINARY") fail("PUBLICATION_AGENT_RIGHTS_USE_CLASS_INVALID");
      return { targetKind, targetId, useClass, allowed: value.allowed, basis, assertedAt };
    });
    const request = { editionId, facts };
    const requestSha256 = digest(request);
    return withTxnLock(async () => {
      await exec(db, "BEGIN IMMEDIATE");
      try {
        const prior = await get(db, `SELECT request_sha256,result_json FROM publication_agent_rights_idempotency
          WHERE actor_user_id=? AND operation='APPLY_FACTS' AND idempotency_key=?`, [actorId, key]);
        if (prior) {
          if (prior.request_sha256 !== requestSha256) fail("PUBLICATION_AGENT_RIGHTS_IDEMPOTENCY_CONFLICT");
          await exec(db, "COMMIT");
          return JSON.parse(prior.result_json);
        }
        if (!await get(db, "SELECT 1 ok FROM published_corpus_editions WHERE edition_id=?", [editionId])) fail("PUBLICATION_AGENT_RIGHTS_TARGET_INVALID");
        const createdAt = now();
        const factIds = [];
        for (const fact of facts) {
          const factId = makeId("parf_");
          try {
            await run(db, `INSERT INTO published_corpus_agent_rights_facts
              (fact_id,edition_id,target_kind,target_id,use_class,allowed,basis,asserted_at,asserted_by,created_at)
              VALUES(?,?,?,?,?,?,?,?,?,?)`, [factId, editionId, fact.targetKind, fact.targetId, fact.useClass, fact.allowed ? 1 : 0, fact.basis, fact.assertedAt, actorId, createdAt]);
          } catch (error) {
            if (/TARGET_INVALID/.test(String(error && error.message))) fail("PUBLICATION_AGENT_RIGHTS_TARGET_INVALID");
            if (/USE_CLASS_INVALID/.test(String(error && error.message))) fail("PUBLICATION_AGENT_RIGHTS_USE_CLASS_INVALID");
            throw error;
          }
          factIds.push(factId);
        }
        const result = { edition_id: editionId, fact_ids: factIds, applied: factIds.length, created_at: createdAt };
        await run(db, `INSERT INTO publication_agent_rights_events
          (event_id,edition_id,actor_user_id,event_type,idempotency_key,fact_count,detail_json,occurred_at)
          VALUES(?,?,?,'RIGHTS_FACTS_ASSERTED',?,?,?,?)`, [makeId("pare_"), editionId, actorId, key, factIds.length, JSON.stringify({ fact_ids: factIds }), createdAt]);
        await run(db, `INSERT INTO publication_agent_rights_idempotency
          (actor_user_id,operation,idempotency_key,request_sha256,result_json,created_at)
          VALUES(?,'APPLY_FACTS',?,?,?,?)`, [actorId, key, requestSha256, JSON.stringify(result), createdAt]);
        await exec(db, "COMMIT");
        return result;
      } catch (error) {
        try { await exec(db, "ROLLBACK"); } catch (_) {}
        throw error;
      }
    });
  }

  async function isAllowed(editionIdValue, targetKindValue, targetIdValue, useClassValue) {
    const editionId = text(editionIdValue, 160, ID);
    const targetKind = text(targetKindValue, 40);
    const targetId = text(targetIdValue, 160, ID);
    const useClass = text(useClassValue, 40);
    if (!KINDS.has(targetKind) || !USE_CLASSES.has(useClass)) fail("PUBLICATION_AGENT_RIGHTS_INPUT_INVALID");
    const row = await get(db, `SELECT allowed FROM published_corpus_agent_rights_facts
      WHERE edition_id=? AND target_kind=? AND target_id=? AND use_class=?
      ORDER BY fact_seq DESC LIMIT 1`, [editionId, targetKind, targetId, useClass]);
    return !!(row && Number(row.allowed));
  }

  async function listDiscoverableCorpora({ afterSlug = "", limit = 20 } = {}) {
    return all(db, `SELECT c.corpus_id,c.slug,c.title,c.description,e.edition_id,e.edition_number,e.manifest_sha256,e.item_count,e.asset_count,e.published_at
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
     WHERE c.status='PUBLISHED' AND c.slug>?
       AND EXISTS (SELECT 1 FROM published_corpus_edition_items i WHERE i.edition_id=e.edition_id AND i.public_read_allowed=1
         AND (COALESCE(${latestAllowed("i", "'EDITION_ITEM'", "i.edition_item_id", "DISCOVER")},0)=1 OR ${physicsDiscoverable("i")}))
     ORDER BY c.slug LIMIT ?`, [String(afterSlug || ""), Number(limit)]);
  }

  async function searchDiscoverableItems({ slug, editionId, query = "", afterPosition = 0, afterId = "", limit = 20 }) {
    const cleanSlug = text(slug, 80, SLUG);
    const cleanEdition = text(editionId, 160, ID);
    const needle = `%${String(query || "").trim().replace(/[\\%_]/g, value => "\\" + value)}%`;
    return all(db, `SELECT c.corpus_id,c.slug,c.title corpus_title,e.edition_id,e.edition_number,e.manifest_sha256,
      i.edition_item_id,i.public_work_id,i.position_no,i.title,i.creator,i.snapshot_sha256
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      JOIN published_corpus_edition_items i ON i.edition_id=e.edition_id
     WHERE c.slug=? AND c.status='PUBLISHED' AND e.edition_id=? AND i.public_read_allowed=1
       AND (COALESCE(${latestAllowed("i", "'EDITION_ITEM'", "i.edition_item_id", "DISCOVER")},0)=1 OR ${physicsDiscoverable("i")})
       AND (i.position_no>? OR (i.position_no=? AND i.edition_item_id>?))
       AND (?='%%' OR i.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(i.creator,'') LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ORDER BY i.position_no,i.edition_item_id LIMIT ?`,
    [cleanSlug, cleanEdition, Number(afterPosition), Number(afterPosition), String(afterId || ""), needle, needle, needle, Number(limit)]);
  }

  async function getDiscoverableItem({ slug, editionId, editionItemId }) {
    const rows = await searchDiscoverableItems({ slug, editionId, limit: 2 });
    return rows.find(row => row.edition_item_id === editionItemId) || get(db, `SELECT c.corpus_id,c.slug,c.title corpus_title,e.edition_id,e.edition_number,e.manifest_sha256,
      i.edition_item_id,i.public_work_id,i.position_no,i.title,i.creator,i.snapshot_sha256
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      JOIN published_corpus_edition_items i ON i.edition_id=e.edition_id
     WHERE c.slug=? AND c.status='PUBLISHED' AND e.edition_id=? AND i.edition_item_id=? AND i.public_read_allowed=1
       AND (COALESCE(${latestAllowed("i", "'EDITION_ITEM'", "i.edition_item_id", "DISCOVER")},0)=1 OR ${physicsDiscoverable("i")})`, [text(slug, 80, SLUG), text(editionId, 160, ID), text(editionItemId, 160, ID)]);
  }

  async function getTextReadableItem({ slug, editionId, editionItemId }) {
    return get(db, `SELECT c.corpus_id,c.slug,c.title corpus_title,e.edition_id,e.edition_number,e.manifest_sha256,
      i.edition_item_id,i.public_work_id,i.position_no,i.title,i.creator,i.snapshot_json,i.snapshot_sha256
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      JOIN published_corpus_edition_items i ON i.edition_id=e.edition_id
     WHERE c.slug=? AND c.status='PUBLISHED' AND e.edition_id=? AND i.edition_item_id=? AND i.public_read_allowed=1
       AND COALESCE(${latestAllowed("i", "'EDITION_ITEM'", "i.edition_item_id", "SOURCE_TEXT")},0)=1`, [text(slug, 80, SLUG), text(editionId, 160, ID), text(editionItemId, 160, ID)]);
  }

  async function getDerivativeReadableItem({ slug, editionId, editionItemId }) {
    return get(db, `SELECT c.corpus_id,c.slug,c.title corpus_title,e.edition_id,e.edition_number,e.manifest_sha256,
      i.edition_item_id,i.public_work_id,i.position_no,i.title,i.creator,i.snapshot_json,i.snapshot_sha256
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      JOIN published_corpus_edition_items i ON i.edition_id=e.edition_id
     WHERE c.slug=? AND c.status='PUBLISHED' AND e.edition_id=? AND i.edition_item_id=? AND i.public_read_allowed=1
       AND COALESCE(${latestAllowed("i", "'EDITION_ITEM'", "i.edition_item_id", "DERIVATIVE_TEXT")},0)=1`,
    [text(slug, 80, SLUG), text(editionId, 160, ID), text(editionItemId, 160, ID)]);
  }

  async function listReadableAssets({ slug, editionId, editionItemId, afterKey = "", limit = 20 }) {
    return all(db, `SELECT a.edition_asset_id,a.edition_id,a.edition_item_id,a.asset_key,a.bytes,a.sha256,a.mime
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      JOIN published_corpus_edition_items i ON i.edition_id=e.edition_id
      JOIN published_corpus_assets a ON a.edition_item_id=i.edition_item_id AND a.edition_id=e.edition_id
     WHERE c.slug=? AND c.status='PUBLISHED' AND e.edition_id=? AND i.edition_item_id=? AND i.public_read_allowed=1
       AND a.public_stream_allowed=1 AND a.asset_key>?
       AND COALESCE(${latestAllowed("a", "'EDITION_ASSET'", "a.edition_asset_id", "SOURCE_BINARY")},
                    ${latestAllowed("i", "'EDITION_ITEM'", "i.edition_item_id", "SOURCE_BINARY")},0)=1
     ORDER BY a.asset_key LIMIT ?`, [text(slug, 80, SLUG), text(editionId, 160, ID), text(editionItemId, 160, ID), String(afterKey || ""), Number(limit)]);
  }

  return Object.freeze({ applyFacts, isAllowed, listDiscoverableCorpora, searchDiscoverableItems, getDiscoverableItem, getTextReadableItem, getDerivativeReadableItem, listReadableAssets });
}

let singleton = null;
function getPublicationAgentRightsRepo() { if (!singleton) singleton = createPublicationAgentRightsRepo(); return singleton; }

module.exports = { createPublicationAgentRightsRepo, getPublicationAgentRightsRepo };
