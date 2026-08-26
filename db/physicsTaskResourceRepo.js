"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../storage");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");
const { SLUG, physicsTaskMeta, sectionLabels } = require("../physics/physicsYear1Sections");

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const LOGICAL_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTENT_KINDS = new Set(["CONDITION_ONLY", "CONDITION_AND_SOLUTION", "SOLUTION_ONLY", "SUPPLEMENT"]);
const LANGUAGES = new Set(["HE", "RU", "EN", "MULTI", "UND"]);
const QUALITY = new Set(["ORIGINAL", "QUALITY_LIMITED", "VERIFIED_DERIVATIVE"]);

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
}
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
}
function dbExec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function requestHash(value) { return hash(Buffer.from(JSON.stringify(stable(value)), "utf8")); }
function clean(value, max, pattern, code = "PHYSICS_RESOURCE_INPUT_INVALID") {
  const out = String(value == null ? "" : value).trim();
  if (!out || Buffer.byteLength(out, "utf8") > max || (pattern && !pattern.test(out))) fail(code);
  return out;
}
function boolean(value, code = "PHYSICS_RESOURCE_INPUT_INVALID") {
  if (value !== true && value !== false) fail(code);
  return value;
}
function actorOwner(actor) {
  if (!actor || !ID.test(String(actor.id || "")) || String(actor.role || "").toLowerCase() !== "owner") fail("PHYSICS_RESOURCE_FORBIDDEN");
  return String(actor.id);
}
function makeId(prefix) { return prefix + crypto.randomBytes(12).toString("hex"); }
function pathInside(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(root, String(relativePath || "").replace(/\\/g, "/"));
  if (!absolute.startsWith(absoluteRoot + path.sep)) fail("PHYSICS_RESOURCE_STORAGE_PATH_INVALID");
  return absolute;
}
function latestRightsSql(permission) {
  return `(SELECT allowed FROM physics_task_resource_rights_facts f WHERE f.revision_id=rv.revision_id AND f.permission='${permission}' ORDER BY f.created_at DESC,f.fact_id DESC LIMIT 1)`;
}

function createPhysicsTaskResourceRepo(options = {}) {
  const db = options.db || getDb();
  const dataDir = path.resolve(options.dataDir || DATA_DIR);
  const now = options.now || (() => new Date().toISOString());

  async function idemLookup(actorId, operation, key, digest) {
    const row = await dbGet(db, `SELECT request_sha256,result_json FROM physics_task_resource_idempotency
      WHERE actor_user_id=? AND operation=? AND idempotency_key=?`, [actorId, operation, key]);
    if (!row) return null;
    if (row.request_sha256 !== digest) fail("PHYSICS_RESOURCE_IDEMPOTENCY_CONFLICT");
    return JSON.parse(row.result_json);
  }
  async function idemWrite(actorId, operation, key, digest, result) {
    await dbRun(db, `INSERT INTO physics_task_resource_idempotency(actor_user_id,operation,idempotency_key,request_sha256,result_json,created_at)
      VALUES(?,?,?,?,?,?)`, [actorId, operation, key, digest, JSON.stringify(result), now()]);
  }
  function operationOptions(value) {
    const key = clean(value && value.idempotencyKey, 160, /^[A-Za-z0-9_.:-]+$/, "PHYSICS_RESOURCE_IDEMPOTENCY_REQUIRED");
    return { key, faultAt: value && value.faultAt };
  }

  async function publishPdf(actor, input, optionsValue) {
    const actorId = actorOwner(actor);
    const operation = operationOptions(optionsValue);
    const corpusId = clean(input && input.corpusId, 160, ID);
    const editionId = clean(input && input.editionId, 160, ID);
    const publicWorkId = clean(input && input.publicWorkId, 160, ID);
    const workSnapshotSha256 = clean(input && input.workSnapshotSha256, 64, HASH);
    const logicalKey = clean(input && input.logicalKey, 80, LOGICAL_KEY);
    const contentKind = clean(input && input.contentKind, 60);
    const title = clean(input && input.title, 500);
    const language = clean(input && input.language, 16);
    const sourcePath = path.resolve(clean(input && input.sourcePath, 4000));
    const expectedSha256 = clean(input && input.expectedSha256, 64, HASH);
    const expectedBytes = Number(input && input.expectedBytes);
    const qualityStatus = clean(input && input.qualityStatus, 40);
    const rightsBasis = clean(input && input.rightsBasis, 200);
    const rightsAssertedAt = clean(input && input.rightsAssertedAt, 10, DATE);
    const publicReadAllowed = boolean(input && input.publicReadAllowed);
    const agentReadAllowed = boolean(input && input.agentReadAllowed);
    if (!CONTENT_KINDS.has(contentKind) || !LANGUAGES.has(language) || !QUALITY.has(qualityStatus)) fail("PHYSICS_RESOURCE_INPUT_INVALID");
    if (!Number.isInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_PDF_BYTES) fail("PHYSICS_RESOURCE_SIZE_INVALID");
    let body;
    try { body = fs.readFileSync(sourcePath); } catch (_) { fail("PHYSICS_RESOURCE_SOURCE_UNREADABLE"); }
    if (body.length !== expectedBytes || hash(body) !== expectedSha256) fail("RESOURCE_SOURCE_HASH_MISMATCH");
    if (body.subarray(0, 5).toString("ascii") !== "%PDF-") fail("RESOURCE_PDF_INVALID");

    const digestInput = { corpusId, editionId, publicWorkId, workSnapshotSha256, logicalKey, contentKind, title, language,
      expectedSha256, expectedBytes, qualityStatus, rightsBasis, rightsAssertedAt, publicReadAllowed, agentReadAllowed };
    const digest = requestHash(digestInput);
    const prior = await idemLookup(actorId, "PUBLISH_PDF", operation.key, digest);
    if (prior) return { ...prior, absolute_path: pathInside(dataDir, prior.storage_path) };

    const stageRoot = path.resolve(dataDir, "physics-task-resources", ".staging");
    fs.mkdirSync(stageRoot, { recursive: true });
    const staged = path.join(stageRoot, makeId("stage_") + ".pdf");
    fs.writeFileSync(staged, body, { flag: "wx" });
    if (hash(fs.readFileSync(staged)) !== expectedSha256) { fs.rmSync(staged, { force: true }); fail("PHYSICS_RESOURCE_STAGE_READBACK_FAILED"); }

    let finalAbsolute = null;
    try {
      const result = await withTxnLock(async () => {
        await dbExec(db, "BEGIN IMMEDIATE");
        try {
          const repeated = await idemLookup(actorId, "PUBLISH_PDF", operation.key, digest);
          if (repeated) { await dbExec(db, "ROLLBACK"); return repeated; }
          const anchor = await dbGet(db, `SELECT c.slug,c.current_edition_id,i.edition_item_id,i.snapshot_sha256
            FROM published_corpora c JOIN published_corpus_editions e ON e.corpus_id=c.corpus_id
            JOIN published_corpus_edition_items i ON i.edition_id=e.edition_id
            WHERE c.corpus_id=? AND c.status='PUBLISHED' AND c.current_edition_id=? AND e.edition_id=? AND i.public_work_id=?`,
          [corpusId, editionId, editionId, publicWorkId]);
          if (!anchor || anchor.snapshot_sha256 !== workSnapshotSha256) fail("TASK_ANCHOR_MISMATCH");
          if (anchor.slug !== SLUG) fail("PHYSICS_RESOURCE_CORPUS_UNSUPPORTED");

          let resource = await dbGet(db, `SELECT resource_id FROM physics_task_resources WHERE corpus_id=? AND public_work_id=? AND logical_key=?`, [corpusId, publicWorkId, logicalKey]);
          const createdAt = now();
          const resourceId = resource ? resource.resource_id : makeId("ptr_");
          if (!resource) await dbRun(db, `INSERT INTO physics_task_resources(resource_id,corpus_id,public_work_id,logical_key,status,current_revision_id,created_by,updated_by,created_at,updated_at)
            VALUES(?,?,?,?, 'WITHDRAWN',NULL,?,?,?,?)`, [resourceId, corpusId, publicWorkId, logicalKey, actorId, actorId, createdAt, createdAt]);
          const last = await dbGet(db, "SELECT COALESCE(MAX(revision_no),0) n FROM physics_task_resource_revisions WHERE resource_id=?", [resourceId]);
          const revisionNo = Number(last.n) + 1;
          const revisionId = makeId("prv_");
          const storagePath = path.posix.join("physics-task-resources", corpusId, editionId, resourceId, revisionId, expectedSha256 + ".pdf");
          finalAbsolute = pathInside(dataDir, storagePath);
          fs.mkdirSync(path.dirname(finalAbsolute), { recursive: true });
          fs.renameSync(staged, finalAbsolute);
          if (hash(fs.readFileSync(finalAbsolute)) !== expectedSha256) fail("PHYSICS_RESOURCE_FINAL_READBACK_FAILED");
          await dbRun(db, `INSERT INTO physics_task_resource_revisions(revision_id,resource_id,revision_no,edition_id,edition_item_id,public_work_id,work_snapshot_sha256,resource_kind,content_kind,title,language,storage_path,external_url,bytes,sha256,mime,quality_status,provenance_json,created_by,created_at)
            VALUES(?,?,?,?,?,?,?,'PDF',?,?,?,?,NULL,?,?, 'application/pdf',?,'{}',?,?)`,
          [revisionId, resourceId, revisionNo, editionId, anchor.edition_item_id, publicWorkId, workSnapshotSha256, contentKind, title, language, storagePath, expectedBytes, expectedSha256, qualityStatus, actorId, createdAt]);
          for (const [permission, allowed] of [["PUBLIC_READ", publicReadAllowed], ["AGENT_READ", agentReadAllowed]]) {
            await dbRun(db, `INSERT INTO physics_task_resource_rights_facts(fact_id,revision_id,permission,allowed,basis,asserted_at,asserted_by,created_at)
              VALUES(?,?,?,?,?,?,?,?)`, [makeId("prf_"), revisionId, permission, allowed ? 1 : 0, rightsBasis, rightsAssertedAt, actorId, createdAt]);
          }
          if (operation.faultAt === "BEFORE_POINTER") fail("FAULT_BEFORE_POINTER");
          await dbRun(db, `UPDATE physics_task_resources SET status='PUBLISHED',current_revision_id=?,updated_by=?,updated_at=? WHERE resource_id=?`, [revisionId, actorId, createdAt, resourceId]);
          await dbRun(db, `INSERT INTO physics_task_resource_events(event_id,resource_id,revision_id,actor_user_id,event_type,idempotency_key,detail_json,occurred_at)
            VALUES(?,?,?,?, 'PUBLISHED',?,'{}',?)`, [makeId("pre_"), resourceId, revisionId, actorId, operation.key, createdAt]);
          const receipt = { resource_id: resourceId, revision_id: revisionId, revision_no: revisionNo, corpus_id: corpusId, edition_id: editionId,
            public_work_id: publicWorkId, work_snapshot_sha256: workSnapshotSha256, storage_path: storagePath, bytes: expectedBytes, sha256: expectedSha256,
            content_kind: contentKind, quality_status: qualityStatus, public_read_allowed: publicReadAllowed, agent_read_allowed: agentReadAllowed };
          await idemWrite(actorId, "PUBLISH_PDF", operation.key, digest, receipt);
          await dbExec(db, "COMMIT");
          return receipt;
        } catch (error) { try { await dbExec(db, "ROLLBACK"); } catch (_) {} throw error; }
      });
      if (fs.existsSync(staged)) fs.rmSync(staged, { force: true });
      return { ...result, absolute_path: pathInside(dataDir, result.storage_path) };
    } catch (error) {
      if (fs.existsSync(staged)) fs.rmSync(staged, { force: true });
      if (finalAbsolute && fs.existsSync(finalAbsolute)) fs.rmSync(finalAbsolute, { force: true });
      throw error;
    }
  }

  async function lifecycle(actor, resourceIdValue, input, optionsValue, type) {
    const actorId = actorOwner(actor);
    const resourceId = clean(resourceIdValue, 160, ID);
    const operation = operationOptions(optionsValue);
    const reasonCode = type === "WITHDRAWN" ? clean(input && input.reasonCode, 100, /^[A-Z0-9_:-]+$/) : null;
    const revisionId = type === "RESTORED" ? clean(input && input.revisionId, 160, ID) : null;
    const digest = requestHash({ resourceId, reasonCode, revisionId });
    const prior = await idemLookup(actorId, type, operation.key, digest); if (prior) return prior;
    return withTxnLock(async () => {
      await dbExec(db, "BEGIN IMMEDIATE");
      try {
        const resource = await dbGet(db, "SELECT * FROM physics_task_resources WHERE resource_id=?", [resourceId]);
        if (!resource) fail("PHYSICS_RESOURCE_NOT_FOUND");
        let target = resource.current_revision_id;
        if (type === "RESTORED") {
          const revision = await dbGet(db, "SELECT revision_id FROM physics_task_resource_revisions WHERE resource_id=? AND revision_id=?", [resourceId, revisionId]);
          if (!revision) fail("PHYSICS_RESOURCE_REVISION_NOT_FOUND");
          target = revisionId;
        }
        await dbRun(db, "UPDATE physics_task_resources SET status=?,current_revision_id=?,updated_by=?,updated_at=? WHERE resource_id=?", [type === "WITHDRAWN" ? "WITHDRAWN" : "PUBLISHED", target, actorId, now(), resourceId]);
        const result = { resource_id: resourceId, revision_id: target, status: type === "WITHDRAWN" ? "WITHDRAWN" : "PUBLISHED" };
        await dbRun(db, `INSERT INTO physics_task_resource_events(event_id,resource_id,revision_id,actor_user_id,event_type,idempotency_key,reason_code,detail_json,occurred_at)
          VALUES(?,?,?,?,?,?,?,'{}',?)`, [makeId("pre_"), resourceId, target, actorId, type, operation.key, reasonCode, now()]);
        await idemWrite(actorId, type, operation.key, digest, result);
        await dbExec(db, "COMMIT"); return result;
      } catch (error) { try { await dbExec(db, "ROLLBACK"); } catch (_) {} throw error; }
    });
  }

  async function listPublicResources(slugValue, publicWorkIdValue, optionsValue = {}) {
    const slug = clean(slugValue, 80, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const publicWorkId = clean(publicWorkIdValue, 160, ID);
    const requireAgent = optionsValue.agent === true;
    const rows = await dbAll(db, `SELECT r.resource_id,r.logical_key,rv.revision_id,rv.revision_no,rv.edition_id,rv.public_work_id,rv.work_snapshot_sha256,
      rv.resource_kind,rv.content_kind,rv.title,rv.language,rv.bytes,rv.sha256,rv.mime,rv.quality_status,rv.created_at,
      ${latestRightsSql("PUBLIC_READ")} AS public_read_allowed,${latestRightsSql("AGENT_READ")} AS agent_read_allowed
      FROM published_corpora c JOIN physics_task_resources r ON r.corpus_id=c.corpus_id
      JOIN physics_task_resource_revisions rv ON rv.revision_id=r.current_revision_id
      JOIN published_corpus_edition_items i ON i.edition_id=c.current_edition_id AND i.public_work_id=r.public_work_id
      WHERE c.slug=? AND c.status='PUBLISHED' AND r.status='PUBLISHED' AND r.public_work_id=?
        AND rv.edition_id=c.current_edition_id AND rv.edition_item_id=i.edition_item_id AND rv.work_snapshot_sha256=i.snapshot_sha256
        AND COALESCE(${latestRightsSql("PUBLIC_READ")},0)=1 ${requireAgent ? `AND COALESCE(${latestRightsSql("AGENT_READ")},0)=1` : ""}
      ORDER BY CASE rv.content_kind WHEN 'CONDITION_AND_SOLUTION' THEN 1 WHEN 'CONDITION_ONLY' THEN 2 ELSE 3 END,r.resource_id`, [slug, publicWorkId]);
    return rows.map(row => ({ ...row, bytes: Number(row.bytes), public_read_allowed: !!Number(row.public_read_allowed), agent_read_allowed: !!Number(row.agent_read_allowed),
      file_url: `/api/public-corpora/${encodeURIComponent(slug)}/resources/${encodeURIComponent(row.revision_id)}/file` }));
  }

  async function listPublicResourceIndex(slugValue, optionsValue = {}) {
    const slug = clean(slugValue, 80, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const rows = await dbAll(db, `SELECT r.resource_id,r.logical_key,rv.revision_id,rv.revision_no,rv.edition_id,rv.public_work_id,rv.work_snapshot_sha256,
      rv.resource_kind,rv.content_kind,rv.title,rv.language,rv.bytes,rv.sha256,rv.mime,rv.quality_status,rv.created_at,
      ${latestRightsSql("PUBLIC_READ")} AS public_read_allowed,${latestRightsSql("AGENT_READ")} AS agent_read_allowed
      FROM published_corpora c JOIN physics_task_resources r ON r.corpus_id=c.corpus_id
      JOIN physics_task_resource_revisions rv ON rv.revision_id=r.current_revision_id
      JOIN published_corpus_edition_items i ON i.edition_id=c.current_edition_id AND i.public_work_id=r.public_work_id
      WHERE c.slug=? AND c.status='PUBLISHED' AND r.status='PUBLISHED'
        AND rv.edition_id=c.current_edition_id AND rv.edition_item_id=i.edition_item_id AND rv.work_snapshot_sha256=i.snapshot_sha256
        AND COALESCE(${latestRightsSql("PUBLIC_READ")},0)=1 ${optionsValue.agent === true ? `AND COALESCE(${latestRightsSql("AGENT_READ")},0)=1` : ""}
      ORDER BY i.position_no,CASE rv.content_kind WHEN 'CONDITION_AND_SOLUTION' THEN 1 WHEN 'CONDITION_ONLY' THEN 2 ELSE 3 END,r.resource_id`, [slug]);
    return rows.map(row => ({ ...row, bytes: Number(row.bytes), public_read_allowed: !!Number(row.public_read_allowed), agent_read_allowed: !!Number(row.agent_read_allowed),
      file_url: `/api/public-corpora/${encodeURIComponent(slug)}/resources/${encodeURIComponent(row.revision_id)}/file` }));
  }

  async function getPublicFile(slugValue, revisionIdValue, optionsValue = {}) {
    const revisionId = clean(revisionIdValue, 160, ID);
    const rows = await dbAll(db, `SELECT rv.storage_path,rv.bytes,rv.sha256,rv.mime,rv.title,rv.revision_id,r.public_work_id
      FROM published_corpora c JOIN physics_task_resources r ON r.corpus_id=c.corpus_id
      JOIN physics_task_resource_revisions rv ON rv.revision_id=r.current_revision_id
      JOIN published_corpus_edition_items i ON i.edition_id=c.current_edition_id AND i.public_work_id=r.public_work_id
      WHERE c.slug=? AND c.status='PUBLISHED' AND r.status='PUBLISHED' AND rv.revision_id=? AND rv.resource_kind='PDF'
        AND rv.edition_id=c.current_edition_id AND rv.edition_item_id=i.edition_item_id AND rv.work_snapshot_sha256=i.snapshot_sha256
        AND COALESCE(${latestRightsSql("PUBLIC_READ")},0)=1 ${optionsValue.agent === true ? `AND COALESCE(${latestRightsSql("AGENT_READ")},0)=1` : ""}`, [String(slugValue || ""), revisionId]);
    if (rows.length !== 1) fail("PHYSICS_RESOURCE_NOT_FOUND");
    const row = rows[0];
    if (!String(row.storage_path || "").replace(/\\/g, "/").startsWith("physics-task-resources/")) fail("PHYSICS_RESOURCE_STORAGE_PATH_INVALID");
    const absolutePath = pathInside(dataDir, row.storage_path);
    let stat; try { stat = fs.statSync(absolutePath); } catch (_) { fail("PHYSICS_RESOURCE_FILE_UNAVAILABLE"); }
    if (!stat.isFile() || stat.size !== Number(row.bytes)) fail("PHYSICS_RESOURCE_FILE_UNAVAILABLE");
    return { ...row, bytes: Number(row.bytes), absolute_path: absolutePath };
  }

  async function listPublicSections(slugValue) {
    const slug = clean(slugValue, 80, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (slug !== SLUG) return [];
    const rows = await dbAll(db, `SELECT e.edition_id,e.edition_number,i.public_work_id,i.position_no,i.title,i.snapshot_json,i.snapshot_sha256
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      JOIN published_corpus_edition_items i ON i.edition_id=e.edition_id
      WHERE c.slug=? AND c.status='PUBLISHED' AND i.public_read_allowed=1 ORDER BY i.position_no`, [slug]);
    const sections = new Map();
    for (const row of rows) {
      let snapshot; try { snapshot = JSON.parse(row.snapshot_json); } catch (_) { fail("PHYSICS_SECTION_METADATA_INVALID"); }
      const task = physicsTaskMeta(snapshot); const labels = sectionLabels(task.chapter);
      if (!sections.has(task.chapter)) sections.set(task.chapter, { section_no: task.chapter, ...labels, task_count: 0, tasks: [] });
      const section = sections.get(task.chapter); section.task_count += 1;
      section.tasks.push({ public_work_id: row.public_work_id, position_no: Number(row.position_no), task_number: task.task_number, title: row.title, snapshot_sha256: row.snapshot_sha256 });
    }
    return [...sections.values()].sort((a, b) => a.section_no - b.section_no);
  }

  return Object.freeze({ publishPdf, withdraw: (actor, resourceId, input, optionsValue) => lifecycle(actor, resourceId, input, optionsValue, "WITHDRAWN"),
    restore: (actor, resourceId, input, optionsValue) => lifecycle(actor, resourceId, input, optionsValue, "RESTORED"),
    listPublicResources, listPublicResourceIndex, getPublicFile, listPublicSections });
}

let singleton = null;
function getPhysicsTaskResourceRepo() {
  if (!singleton) singleton = createPhysicsTaskResourceRepo();
  return singleton;
}

module.exports = { createPhysicsTaskResourceRepo, getPhysicsTaskResourceRepo, MAX_PDF_BYTES };
