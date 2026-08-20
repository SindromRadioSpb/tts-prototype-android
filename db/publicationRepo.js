"use strict";

// MASS-ACCESS I1 — the only writer for the public-corpus publication domain.
// Restricted/My Texts sources are read as snapshots and are never edited or
// deleted here. Published editions and audit events are append-only in schema.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const { getDb } = require("./sqlite");
const { DATA_DIR } = require("../storage");

const PERMISSIONS = Object.freeze([
  ["PUBLIC_READ", "public_read_allowed"],
  ["PUBLIC_STREAM", "public_stream_allowed"],
  ["PACKAGE_DOWNLOAD", "package_download_allowed"],
]);
const FORBIDDEN_KEYS = new Set([
  "progress", "bookmarks", "reading_lists", "reading_list", "review_log", "word_status",
  "srs_cards", "srs_review_events", "srs_attempts", "srs_card_exports", "study_day",
  "anki_word_exports", "translation_overrides", "events", "provider_keys", "api_keys",
  "mentor_memory", "mentor_history", "telegram_identity", "telegram_preferences",
  "absolute_path", "browser_profile_id", "session", "sessions", "consent_records",
]);

function fail(code, status) {
  const error = new Error(code);
  error.code = code;
  if (status) error.status = status;
  throw error;
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function id(prefix) { return prefix + crypto.randomBytes(12).toString("hex"); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
  return out;
}
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function cleanId(value, code = "CORPUS_NOT_FOUND", max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max || !/^[A-Za-z0-9_.:-]+$/.test(text)) fail(code);
  return text;
}
function cleanSlug(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text) || text.length > 80) fail("PUBLICATION_INPUT_INVALID", 400);
  return text;
}
function cleanText(value, maxBytes, required = false) {
  const text = String(value == null ? "" : value).trim();
  if ((required && !text) || Buffer.byteLength(text, "utf8") > maxBytes) fail("PUBLICATION_INPUT_INVALID", 400);
  return text;
}
function sanitizeSnapshot(value, depth = 0) {
  if (depth > 80) fail("SOURCE_SNAPSHOT_INVALID", 400);
  if (Array.isArray(value)) return value.map(item => sanitizeSnapshot(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const normalized = String(key).toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized) || normalized === "group_corpus" || normalized === "group_corpus_schema_version" || normalized.startsWith("srs_") || normalized.includes("private_key")) continue;
    if (normalized === "source_meta_json" && typeof child === "string") {
      try { out[key] = canonicalJson(sanitizeSnapshot(JSON.parse(child), depth + 1)); } catch (_) { out[key] = "{}"; }
      continue;
    }
    out[key] = sanitizeSnapshot(child, depth + 1);
  }
  return out;
}
function sanitizeGroupSnapshot(value) {
  const snapshot = sanitizeSnapshot(value);
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    delete snapshot.corpus_id;
    delete snapshot.work_id;
  }
  return snapshot;
}
function parseJson(text, code = "SOURCE_SNAPSHOT_INVALID") {
  try { return JSON.parse(String(text)); } catch (_) { fail(code, 400); }
}
function dbGet(db, sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null))); }
function dbAll(db, sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []))); }
function dbRun(db, sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); })); }
function dbExec(db, sql) { return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve())); }

function createPublicationRepo(options = {}) {
  const database = options.db || getDb();
  const dataDir = path.resolve(options.dataDir || DATA_DIR);
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  if (!database) fail("DB_NOT_AVAILABLE", 503);
  let writeQueue = Promise.resolve();

  const serialize = task => {
    const result = writeQueue.then(task, task);
    writeQueue = result.catch(() => {});
    return result;
  };
  const transaction = async task => {
    await dbExec(database, "BEGIN IMMEDIATE");
    try {
      const result = await task();
      await dbExec(database, "COMMIT");
      return result;
    } catch (error) {
      try { await dbExec(database, "ROLLBACK"); } catch (_) {}
      throw error;
    }
  };
  const actorId = actor => cleanId(actor && actor.id, "PUBLISHER_FORBIDDEN");
  const requestHash = value => sha256(Buffer.from(canonicalJson(value), "utf8"));
  const idemKey = value => {
    const text = String(value || "").trim();
    if (!text || text.length > 200) fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    return text;
  };
  const existingIdempotency = async (actor, operation, key, hash) => {
    const row = await dbGet(database, `SELECT request_sha256,result_json FROM publication_idempotency
                                       WHERE actor_user_id=? AND operation=? AND idempotency_key=?`, [actorId(actor), operation, key]);
    if (!row) return null;
    if (row.request_sha256 !== hash) fail("IDEMPOTENCY_CONFLICT", 409);
    return parseJson(row.result_json, "IDEMPOTENCY_RECEIPT_INVALID");
  };
  const saveIdempotency = (actor, operation, key, hash, result) => dbRun(database,
    `INSERT INTO publication_idempotency(actor_user_id,operation,idempotency_key,request_sha256,result_json,created_at)
     VALUES(?,?,?,?,?,?)`, [actorId(actor), operation, key, hash, canonicalJson(result), now()]);
  const withIdempotency = (actor, operation, opts, request, action) => serialize(async () => {
    const key = idemKey(opts && opts.idempotencyKey);
    const hash = requestHash(request);
    return transaction(async () => {
      const prior = await existingIdempotency(actor, operation, key, hash);
      if (prior) return prior;
      const result = await action(key);
      await saveIdempotency(actor, operation, key, hash, result);
      return result;
    });
  });
  const appendEvent = (actor, corpusId, eventType, { editionId = null, idempotencyKey = null, reasonCode = null, detail = {} } = {}) => dbRun(database,
    `INSERT INTO publication_events(event_id,corpus_id,edition_id,actor_user_id,event_type,idempotency_key,reason_code,detail_json,occurred_at)
     VALUES(?,?,?,?,?,?,?,?,?)`, [id("pe_"), corpusId, editionId, actorId(actor), eventType, idempotencyKey, reasonCode, canonicalJson(detail), now()]);

  async function assertPublisher(actor) {
    const uid = actorId(actor);
    if (String(actor && actor.role).toLowerCase() === "owner") return uid;
    const row = await dbGet(database, "SELECT 1 ok FROM publication_publishers WHERE user_id=? AND role='PUBLISHER' AND status='ACTIVE'", [uid]);
    if (!row) fail("PUBLISHER_FORBIDDEN", 403);
    return uid;
  }
  async function corpusForActor(actor, corpusId) {
    const uid = await assertPublisher(actor);
    const cid = cleanId(corpusId);
    const isOwner = String(actor && actor.role).toLowerCase() === "owner";
    const row = isOwner
      ? await dbGet(database, "SELECT * FROM published_corpora WHERE corpus_id=?", [cid])
      : await dbGet(database, `SELECT c.* FROM published_corpora c
          JOIN publication_corpus_publishers p ON p.corpus_id=c.corpus_id
         WHERE c.corpus_id=? AND p.user_id=? AND p.status='ACTIVE'`, [cid, uid]);
    if (!row) fail("CORPUS_NOT_FOUND", 404);
    return row;
  }
  async function activeDraft(actor, corpusId, expectedVersion) {
    const corpus = await corpusForActor(actor, corpusId);
    const draft = await dbGet(database, "SELECT * FROM publication_drafts WHERE corpus_id=? AND state='ACTIVE'", [corpus.corpus_id]);
    if (!draft) fail("DRAFT_NOT_FOUND", 404);
    if (expectedVersion != null && Number(expectedVersion) !== Number(draft.version)) fail("DRAFT_VERSION_CONFLICT", 409);
    return { corpus, draft };
  }
  function sourcePath(relative) {
    const rel = String(relative || "").replace(/\\/g, "/");
    if (!rel || rel.startsWith("/") || rel.includes("../") || rel.includes("\0")) fail("SOURCE_SNAPSHOT_INVALID", 400);
    const root = path.resolve(dataDir, "group-corpora");
    const absolute = path.resolve(dataDir, rel);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) fail("SOURCE_SNAPSHOT_INVALID", 400);
    return absolute;
  }
  function publicationPath(relative) {
    const rel = String(relative || "").replace(/\\/g, "/");
    if (!rel || rel.startsWith("/") || rel.includes("../") || rel.includes("\0")) fail("PUBLICATION_ASSET_INVALID", 500);
    const root = path.resolve(dataDir, "published-corpora");
    const absolute = path.resolve(dataDir, rel);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) fail("PUBLICATION_ASSET_INVALID", 500);
    return absolute;
  }
  async function fileHash(file) {
    const hash = crypto.createHash("sha256");
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(file);
      stream.on("data", chunk => hash.update(chunk));
      stream.once("error", reject);
      stream.once("end", resolve);
    });
    return hash.digest("hex");
  }
  async function sourceAudio(item) {
    if (item.source_domain !== "GROUP_CORPUS") return [];
    return dbAll(database, `SELECT asset_key,relative_path,bytes,sha256,mime FROM group_corpus_audio
                             WHERE corpus_id=? AND work_id=? ORDER BY asset_key`, [item.source_corpus_id, item.source_work_id]);
  }
  async function latestRights(itemId) {
    const rows = await dbAll(database, `SELECT permission,allowed,basis,asserted_at,created_at,fact_id
      FROM publication_rights_facts WHERE item_id=? ORDER BY rowid`, [itemId]);
    const out = {};
    for (const row of rows) out[row.permission] = row;
    return out;
  }
  async function inspectAsset(asset) {
    const absolute = sourcePath(asset.relative_path);
    try {
      const stat = await fs.promises.stat(absolute);
      if (!stat.isFile() || stat.size !== Number(asset.bytes)) return { present: false, absolute };
      if ((await fileHash(absolute)) !== String(asset.sha256).toLowerCase()) return { present: false, absolute };
      return { present: true, absolute, bytes: stat.size };
    } catch (_) { return { present: false, absolute }; }
  }
  async function computeDraft(actor, corpusId, expectedVersion) {
    const { corpus, draft } = await activeDraft(actor, corpusId, expectedVersion);
    const items = await dbAll(database, "SELECT * FROM publication_draft_items WHERE draft_id=? ORDER BY position_no,item_id", [draft.draft_id]);
    const blockers = [];
    const checked = [];
    let assetMissing = 0;
    let includedAssets = 0;
    for (const item of items) {
      const snapshotSha = sha256(Buffer.from(item.snapshot_json, "utf8"));
      if (snapshotSha !== item.snapshot_sha256) blockers.push({ item_id: item.item_id, code: "EDITION_HASH_MISMATCH" });
      const rights = await latestRights(item.item_id);
      const read = rights.PUBLIC_READ;
      const stream = rights.PUBLIC_STREAM;
      const download = rights.PACKAGE_DOWNLOAD;
      if (!read || read.allowed !== 1) blockers.push({ item_id: item.item_id, code: "PUBLIC_READ_NOT_ALLOWED" });
      if (!stream) blockers.push({ item_id: item.item_id, code: "RIGHTS_REVIEW_REQUIRED", permission: "PUBLIC_STREAM" });
      if (!download) blockers.push({ item_id: item.item_id, code: "RIGHTS_REVIEW_REQUIRED", permission: "PACKAGE_DOWNLOAD" });
      const assets = await sourceAudio(item);
      const available = [];
      let missing = Math.max(0, Number(item.expected_audio_count) - assets.length);
      for (const asset of assets) {
        const fact = await inspectAsset(asset);
        if (fact.present) available.push({ ...asset, absolute_path: fact.absolute });
        else missing += 1;
      }
      if (stream && stream.allowed === 1) includedAssets += available.length;
      assetMissing += missing;
      const packageComplete = !!(download && download.allowed === 1 && missing === 0 && available.length === Number(item.expected_audio_count));
      checked.push({ item, rights, available_assets: available, asset_missing: missing, package_complete: packageComplete });
    }
    return {
      corpus, draft, items: checked, blockers,
      ready: items.length > 0 && blockers.length === 0,
      item_count: items.length,
      included_assets: includedAssets,
      asset_missing: assetMissing,
      package_complete: items.length > 0 && checked.every(item => item.package_complete),
    };
  }

  async function grantPublisher(actor, userId, opts) {
    if (String(actor && actor.role).toLowerCase() !== "owner") fail("PUBLISHER_FORBIDDEN", 403);
    const target = cleanId(userId, "PUBLICATION_INPUT_INVALID");
    return withIdempotency(actor, "GRANT_PUBLISHER", opts, { target }, async () => {
      if (!await dbGet(database, "SELECT id FROM users WHERE id=?", [target])) fail("PUBLICATION_INPUT_INVALID", 400);
      const at = now();
      await dbRun(database, `INSERT INTO publication_publishers(user_id,role,status,granted_by,created_at,updated_at)
        VALUES(?,'PUBLISHER','ACTIVE',?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET role='PUBLISHER',status='ACTIVE',granted_by=excluded.granted_by,updated_at=excluded.updated_at`, [target, actorId(actor), at, at]);
      return { user_id: target, role: "PUBLISHER", status: "ACTIVE" };
    });
  }

  async function createCorpus(actor, input, opts) {
    await assertPublisher(actor);
    const request = { slug: cleanSlug(input && input.slug), title: cleanText(input && input.title, 500, true), description: cleanText(input && input.description, 4000) };
    return withIdempotency(actor, "CREATE_CORPUS", opts, request, async key => {
      const corpusId = id("pc_");
      const draftId = id("pd_");
      const at = now();
      await dbRun(database, `INSERT INTO published_corpora(corpus_id,slug,title,description,status,current_edition_id,created_by,updated_by,created_at,updated_at)
        VALUES(?,?,?,?, 'DRAFT_ACTIVE',NULL,?,?,?,?)`, [corpusId, request.slug, request.title, request.description, actorId(actor), actorId(actor), at, at]);
      await dbRun(database, `INSERT INTO publication_corpus_publishers(corpus_id,user_id,role,status,created_at,updated_at)
        VALUES(?,?,'OWNER','ACTIVE',?,?)`, [corpusId, actorId(actor), at, at]);
      await dbRun(database, `INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at)
        VALUES(?,?,1,1,'ACTIVE',?,?,?,?)`, [draftId, corpusId, actorId(actor), actorId(actor), at, at]);
      await appendEvent(actor, corpusId, "DRAFT_CREATED", { idempotencyKey: key, detail: { draft_number: 1 } });
      return { corpus_id: corpusId, draft_id: draftId, draft_version: 1, slug: request.slug };
    });
  }

  async function copyGroupCorpusItems(actor, corpusId, input, opts) {
    await corpusForActor(actor, corpusId);
    const sourceCorpusId = cleanId(input && input.sourceCorpusId, "SOURCE_SNAPSHOT_INVALID");
    const workIds = Array.isArray(input && input.workIds) ? [...new Set(input.workIds.map(value => cleanId(value, "SOURCE_SNAPSHOT_INVALID")))] : [];
    if (!workIds.length || workIds.length > 1000) fail("SOURCE_SNAPSHOT_INVALID", 400);
    const expectedVersion = Number(input && input.expectedVersion);
    const sourceOwner = await dbGet(database, `SELECT 1 ok FROM group_corpora c
      JOIN reading_group_members m ON m.group_id=c.group_id
     WHERE c.corpus_id=? AND m.user_id=? AND m.role='OWNER' AND m.status='ACTIVE'`, [sourceCorpusId, actorId(actor)]);
    if (!sourceOwner) fail("SOURCE_SNAPSHOT_INVALID", 404);
    const prepared = [];
    for (const workId of workIds) {
      const row = await dbGet(database, `SELECT w.* FROM group_corpus_works w WHERE w.corpus_id=? AND w.work_id=? AND w.rights_status!='REMOVED'`, [sourceCorpusId, workId]);
      if (!row) fail("SOURCE_SNAPSHOT_INVALID", 404);
      const absolute = sourcePath(row.bundle_path);
      const raw = await fs.promises.readFile(absolute).catch(() => fail("SOURCE_SNAPSHOT_INVALID", 400));
      if (sha256(raw) !== row.bundle_sha256) fail("SOURCE_CHANGED", 409);
      const snapshot = sanitizeGroupSnapshot(parseJson(raw.toString("utf8")));
      const snapshotJson = canonicalJson(snapshot);
      if (Buffer.byteLength(snapshotJson, "utf8") > 12 * 1024 * 1024) fail("SOURCE_SNAPSHOT_INVALID", 413);
      prepared.push({ row, snapshotJson, snapshotSha256: sha256(Buffer.from(snapshotJson, "utf8")) });
    }
    const request = { corpusId, sourceCorpusId, workIds, expectedVersion, sourceHashes: prepared.map(item => item.row.bundle_sha256) };
    return withIdempotency(actor, "COPY_GROUP_ITEMS", opts, request, async key => {
      const { draft } = await activeDraft(actor, corpusId, expectedVersion);
      let position = Number((await dbGet(database, "SELECT COALESCE(MAX(position_no),0) n FROM publication_draft_items WHERE draft_id=?", [draft.draft_id])).n);
      const items = [];
      for (const item of prepared) {
        const current = await dbGet(database, "SELECT bundle_sha256 FROM group_corpus_works WHERE corpus_id=? AND work_id=?", [sourceCorpusId, item.row.work_id]);
        if (!current || current.bundle_sha256 !== item.row.bundle_sha256) fail("SOURCE_CHANGED", 409);
        const itemId = id("pi_");
        position += 1;
        try {
          await dbRun(database, `INSERT INTO publication_draft_items(item_id,draft_id,position_no,source_domain,source_corpus_id,source_work_id,source_revision,source_hash,snapshot_json,snapshot_sha256,title,creator,expected_audio_count,copied_at)
            VALUES(?,?,?,'GROUP_CORPUS',?,?,?,?,?,?,?,?,?,?)`, [itemId, draft.draft_id, position, sourceCorpusId, item.row.work_id, String(item.row.audio_revision || 1), item.row.bundle_sha256, item.snapshotJson, item.snapshotSha256, item.row.title, item.row.artist, Number(item.row.audio_count) || 0, now()]);
        } catch (error) {
          if (String(error && error.message).includes("UNIQUE")) fail("SOURCE_ALREADY_COPIED", 409);
          throw error;
        }
        items.push({ item_id: itemId, source_work_id: item.row.work_id, title: item.row.title, snapshot_sha256: item.snapshotSha256 });
      }
      const nextVersion = Number(draft.version) + 1;
      await dbRun(database, "UPDATE publication_drafts SET version=?,updated_by=?,updated_at=? WHERE draft_id=?", [nextVersion, actorId(actor), now(), draft.draft_id]);
      await appendEvent(actor, corpusId, "ITEMS_COPIED", { idempotencyKey: key, detail: { count: items.length, source_domain: "GROUP_CORPUS" } });
      return { corpus_id: corpusId, draft_id: draft.draft_id, draft_version: nextVersion, items };
    });
  }

  async function copyMyTextItems(actor, corpusId, input, opts) {
    const items = Array.isArray(input && input.items) ? input.items : [];
    if (!items.length || items.length > 100) fail("SOURCE_SNAPSHOT_INVALID", 400);
    const expectedVersion = Number(input && input.expectedVersion);
    const prepared = items.map(item => {
      const sourceWorkId = cleanId(item && item.sourceWorkId, "SOURCE_SNAPSHOT_INVALID");
      const title = cleanText(item && item.title, 500, true);
      const snapshotJson = canonicalJson(sanitizeSnapshot(item && item.snapshot));
      if (Buffer.byteLength(snapshotJson, "utf8") > 12 * 1024 * 1024) fail("SOURCE_SNAPSHOT_INVALID", 413);
      return { sourceWorkId, title, creator: cleanText(item && item.creator, 500), expectedAudioCount: Math.max(0, Math.trunc(Number(item && item.expectedAudioCount) || 0)), snapshotJson, snapshotSha256: sha256(Buffer.from(snapshotJson, "utf8")) };
    });
    const request = { corpusId, expectedVersion, items: prepared.map(item => ({ sourceWorkId: item.sourceWorkId, snapshotSha256: item.snapshotSha256 })) };
    return withIdempotency(actor, "COPY_MY_TEXT_ITEMS", opts, request, async key => {
      const { draft } = await activeDraft(actor, corpusId, expectedVersion);
      let position = Number((await dbGet(database, "SELECT COALESCE(MAX(position_no),0) n FROM publication_draft_items WHERE draft_id=?", [draft.draft_id])).n);
      const copied = [];
      for (const item of prepared) {
        const itemId = id("pi_"); position += 1;
        await dbRun(database, `INSERT INTO publication_draft_items(item_id,draft_id,position_no,source_domain,source_corpus_id,source_work_id,source_revision,source_hash,snapshot_json,snapshot_sha256,title,creator,expected_audio_count,copied_at)
          VALUES(?,?,?,'MY_TEXTS',NULL,?,'local',?,?,?,?,?,?,?)`, [itemId, draft.draft_id, position, item.sourceWorkId, item.snapshotSha256, item.snapshotJson, item.snapshotSha256, item.title, item.creator || null, item.expectedAudioCount, now()]);
        copied.push({ item_id: itemId, source_work_id: item.sourceWorkId, title: item.title, snapshot_sha256: item.snapshotSha256 });
      }
      const nextVersion = Number(draft.version) + 1;
      await dbRun(database, "UPDATE publication_drafts SET version=?,updated_by=?,updated_at=? WHERE draft_id=?", [nextVersion, actorId(actor), now(), draft.draft_id]);
      await appendEvent(actor, corpusId, "ITEMS_COPIED", { idempotencyKey: key, detail: { count: copied.length, source_domain: "MY_TEXTS" } });
      return { corpus_id: corpusId, draft_id: draft.draft_id, draft_version: nextVersion, items: copied };
    });
  }

  async function reorderDraftItems(actor, corpusId, input, opts) {
    const itemIds = Array.isArray(input && input.itemIds)
      ? input.itemIds.map(value => cleanId(value, "PUBLICATION_INPUT_INVALID")) : [];
    if (!itemIds.length || itemIds.length > 1000 || new Set(itemIds).size !== itemIds.length)
      fail("PUBLICATION_INPUT_INVALID", 400);
    const expectedVersion = Number(input && input.expectedVersion);
    const request = { corpusId, itemIds, expectedVersion };
    return withIdempotency(actor, "REORDER_DRAFT_ITEMS", opts, request, async key => {
      const { draft } = await activeDraft(actor, corpusId, expectedVersion);
      const existing = await dbAll(database, "SELECT item_id FROM publication_draft_items WHERE draft_id=? ORDER BY position_no,item_id", [draft.draft_id]);
      if (existing.length !== itemIds.length || existing.some(row => !itemIds.includes(row.item_id)))
        fail("DRAFT_VERSION_CONFLICT", 409);
      for (let index = 0; index < itemIds.length; index += 1) {
        await dbRun(database, "UPDATE publication_draft_items SET position_no=? WHERE draft_id=? AND item_id=?", [index + 1, draft.draft_id, itemIds[index]]);
      }
      const nextVersion = Number(draft.version) + 1;
      await dbRun(database, "UPDATE publication_drafts SET version=?,updated_by=?,updated_at=? WHERE draft_id=?", [nextVersion, actorId(actor), now(), draft.draft_id]);
      await appendEvent(actor, corpusId, "DRAFT_REORDERED", { idempotencyKey: key, detail: { count: itemIds.length } });
      return { corpus_id: corpusId, draft_id: draft.draft_id, draft_version: nextVersion, item_ids: itemIds };
    });
  }

  async function applyRightsPreset(actor, corpusId, input, opts) {
    if (String(actor && actor.role).toLowerCase() !== "owner") fail("PUBLISHER_FORBIDDEN", 403);
    const itemIds = Array.isArray(input && input.itemIds) ? [...new Set(input.itemIds.map(value => cleanId(value, "PUBLICATION_INPUT_INVALID")))] : [];
    const preset = input && input.preset || {};
    if (!itemIds.length || itemIds.length > 1000 || preset.basis !== "OWNER_ATTESTATION_2026_08_20" || preset.asserted_at !== "2026-08-20"
        || preset.public_read_allowed !== true || preset.public_stream_allowed !== true || preset.package_download_allowed !== true)
      fail("RIGHTS_PRESET_INVALID", 400);
    const expectedVersion = Number(input && input.expectedVersion);
    const request = { corpusId, itemIds, expectedVersion, preset };
    return withIdempotency(actor, "APPLY_RIGHTS_PRESET", opts, request, async key => {
      const { draft } = await activeDraft(actor, corpusId, expectedVersion);
      const known = await dbAll(database, `SELECT item_id FROM publication_draft_items WHERE draft_id=? AND item_id IN (${itemIds.map(() => "?").join(",")})`, [draft.draft_id, ...itemIds]);
      if (known.length !== itemIds.length) fail("CORPUS_NOT_FOUND", 404);
      for (const itemId of itemIds) {
        for (const [permission, field] of PERMISSIONS) await dbRun(database,
          `INSERT INTO publication_rights_facts(fact_id,item_id,permission,allowed,basis,asserted_at,asserted_by,created_at)
           VALUES(?,?,?,?,?,?,?,?)`, [id("prf_"), itemId, permission, preset[field] ? 1 : 0, preset.basis, preset.asserted_at, actorId(actor), now()]);
      }
      const nextVersion = Number(draft.version) + 1;
      await dbRun(database, "UPDATE publication_drafts SET version=?,updated_by=?,updated_at=? WHERE draft_id=?", [nextVersion, actorId(actor), now(), draft.draft_id]);
      await appendEvent(actor, corpusId, "RIGHTS_PRESET_APPLIED", { idempotencyKey: key, detail: { item_count: itemIds.length, basis: preset.basis } });
      return { corpus_id: corpusId, draft_id: draft.draft_id, draft_version: nextVersion, item_count: itemIds.length, facts_created: itemIds.length * 3 };
    });
  }

  async function validateDraft(actor, corpusId, expectedVersion) {
    const result = await computeDraft(actor, corpusId, expectedVersion);
    return { ready: result.ready, blockers: result.blockers, item_count: result.item_count, included_assets: result.included_assets, asset_missing: result.asset_missing, package_complete: result.package_complete, draft_version: Number(result.draft.version) };
  }

  async function publish(actor, corpusId, input, opts = {}) {
    await corpusForActor(actor, corpusId);
    const expectedVersion = Number(input && input.expectedVersion);
    const key = idemKey(opts.idempotencyKey);
    const request = { corpusId, expectedVersion };
    const hash = requestHash(request);
    const early = await existingIdempotency(actor, "PUBLISH", key, hash);
    if (early) return early;
    return serialize(async () => {
      const prior = await existingIdempotency(actor, "PUBLISH", key, hash);
      if (prior) return prior;
      const checked = await computeDraft(actor, corpusId, expectedVersion);
      if (!checked.ready) fail(checked.blockers[0] && checked.blockers[0].code || "RIGHTS_REVIEW_REQUIRED", 409);
      const editionNumber = Number((await dbGet(database, "SELECT COALESCE(MAX(edition_number),0)+1 n FROM published_corpus_editions WHERE corpus_id=?", [checked.corpus.corpus_id])).n);
      const editionId = id("ed_");
      const stageRel = path.posix.join("published-corpora", checked.corpus.corpus_id, ".staging", editionId);
      const finalRel = path.posix.join("published-corpora", checked.corpus.corpus_id, "editions", editionId);
      const stageAbs = publicationPath(stageRel);
      const finalAbs = publicationPath(finalRel);
      const manifestItems = [];
      const stagedAssets = [];
      const stagedAssetByKey = new Map();
      await fs.promises.mkdir(stageAbs, { recursive: true });
      try {
        for (const checkedItem of checked.items) {
          const item = checkedItem.item;
          const rights = checkedItem.rights;
          const publicWorkId = "work-" + sha256(`${item.source_domain}:${item.source_corpus_id || "local"}:${item.source_work_id}`).slice(0, 24);
          const editionItemId = id("ei_");
          const streamAllowed = rights.PUBLIC_STREAM.allowed === 1;
          const downloadAllowed = rights.PACKAGE_DOWNLOAD.allowed === 1;
          const assets = [];
          if (streamAllowed || downloadAllowed) {
            for (const asset of checkedItem.available_assets) {
              const fileName = asset.asset_key + ".mp3";
              let record = stagedAssetByKey.get(asset.asset_key);
              if (!record) {
                const staged = path.join(stageAbs, "audio", fileName);
                await fs.promises.mkdir(path.dirname(staged), { recursive: true });
                await fs.promises.copyFile(asset.absolute_path, staged, fs.constants.COPYFILE_EXCL);
                if ((await fileHash(staged)) !== asset.sha256 || (await fs.promises.stat(staged)).size !== Number(asset.bytes)) fail("EDITION_HASH_MISMATCH", 500);
                const storagePath = path.posix.join(finalRel, "audio", fileName);
                record = { edition_asset_id: id("ea_"), edition_item_id: editionItemId, asset_key: asset.asset_key, storage_path: storagePath, bytes: Number(asset.bytes), sha256: asset.sha256, mime: asset.mime, public_stream_allowed: streamAllowed ? 1 : 0, package_download_allowed: downloadAllowed ? 1 : 0 };
                stagedAssetByKey.set(asset.asset_key, record);
                stagedAssets.push(record);
              } else {
                if (record.sha256 !== asset.sha256 || record.bytes !== Number(asset.bytes) || record.mime !== asset.mime) fail("ASSET_KEY_COLLISION", 500);
                record.public_stream_allowed = record.public_stream_allowed || (streamAllowed ? 1 : 0);
                record.package_download_allowed = record.package_download_allowed || (downloadAllowed ? 1 : 0);
              }
              assets.push({ asset_key: asset.asset_key, bytes: Number(asset.bytes), sha256: asset.sha256, stream: streamAllowed, download: downloadAllowed });
            }
          }
          manifestItems.push({
            edition_item_id: editionItemId, source_item_id: item.item_id, public_work_id: publicWorkId,
            position_no: Number(item.position_no), title: item.title, creator: item.creator || null,
            snapshot_sha256: item.snapshot_sha256, public_read_allowed: true,
            public_stream_allowed: streamAllowed, package_download_allowed: downloadAllowed,
            rights_basis: rights.PUBLIC_READ.basis, rights_asserted_at: rights.PUBLIC_READ.asserted_at,
            expected_audio_count: Number(item.expected_audio_count), included_audio_count: assets.length,
            asset_missing: checkedItem.asset_missing, package_complete: checkedItem.package_complete, assets,
            snapshot_json: item.snapshot_json,
          });
        }
        const publicManifest = {
          schema_version: "published_corpus_edition.1.0.0", edition_id: editionId,
          corpus_id: checked.corpus.corpus_id, slug: checked.corpus.slug,
          edition_number: editionNumber, published_at: now(),
          items: manifestItems.map(item => ({ ...item, snapshot_json: undefined })),
        };
        const manifestJson = canonicalJson(publicManifest);
        const manifestSha256 = sha256(Buffer.from(manifestJson, "utf8"));
        const packageRelativeWithinEdition = "packages/corpus.zip";
        const stagedPackage = path.join(stageAbs, packageRelativeWithinEdition);
        const archive = new AdmZip();
        archive.addFile("manifest.json", Buffer.from(manifestJson, "utf8"));
        for (const item of manifestItems) archive.addFile(`works/${item.public_work_id}.json`, Buffer.from(item.snapshot_json, "utf8"));
        for (const asset of stagedAssets) {
          if (!asset.package_download_allowed) continue;
          archive.addLocalFile(path.join(stageAbs, "audio", asset.asset_key + ".mp3"), "audio", asset.asset_key + ".mp3");
        }
        archive.addFile("metadata/missing_audio.json", Buffer.from(canonicalJson({
          schema_version: "published_corpus_missing_audio.1.0.0",
          package_complete: checked.package_complete,
          asset_missing: checked.asset_missing,
          items: manifestItems.filter(item => item.asset_missing > 0).map(item => ({ public_work_id: item.public_work_id, missing: item.asset_missing })),
        }), "utf8"));
        await fs.promises.mkdir(path.dirname(stagedPackage), { recursive: true });
        archive.writeZip(stagedPackage);
        const packageBytes = (await fs.promises.stat(stagedPackage)).size;
        const packageSha256 = await fileHash(stagedPackage);
        const packagePath = path.posix.join(finalRel, packageRelativeWithinEdition);
        await fs.promises.mkdir(path.dirname(finalAbs), { recursive: true });
        await fs.promises.rename(stageAbs, finalAbs);
        const receipt = await transaction(async () => {
          const locked = await activeDraft(actor, corpusId, expectedVersion);
          if (locked.draft.draft_id !== checked.draft.draft_id) fail("DRAFT_VERSION_CONFLICT", 409);
          const idem = await existingIdempotency(actor, "PUBLISH", key, hash);
          if (idem) return idem;
          await dbRun(database, `INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,asset_missing,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [editionId, checked.corpus.corpus_id, editionNumber, checked.draft.draft_id, manifestJson, manifestSha256, manifestItems.length, stagedAssets.length, checked.asset_missing, checked.package_complete ? 1 : 0, packagePath, packageBytes, packageSha256, actorId(actor), publicManifest.published_at]);
          for (const item of manifestItems) await dbRun(database, `INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [item.edition_item_id, editionId, item.source_item_id, item.public_work_id, item.position_no, item.title, item.creator, item.snapshot_json, item.snapshot_sha256, 1, item.public_stream_allowed ? 1 : 0, item.package_download_allowed ? 1 : 0, item.rights_basis, item.rights_asserted_at, item.expected_audio_count, item.included_audio_count, item.asset_missing, item.package_complete ? 1 : 0]);
          for (const asset of stagedAssets) await dbRun(database, `INSERT INTO published_corpus_assets(edition_asset_id,edition_id,edition_item_id,asset_key,storage_path,bytes,sha256,mime,public_stream_allowed,package_download_allowed,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [asset.edition_asset_id, editionId, asset.edition_item_id, asset.asset_key, asset.storage_path, asset.bytes, asset.sha256, asset.mime, asset.public_stream_allowed, asset.package_download_allowed, now()]);
          const readBackEdition = await dbGet(database, "SELECT manifest_json,manifest_sha256,item_count,asset_count,package_bytes,package_sha256 FROM published_corpus_editions WHERE edition_id=?", [editionId]);
          const readBackItems = Number((await dbGet(database, "SELECT COUNT(*) n FROM published_corpus_edition_items WHERE edition_id=?", [editionId])).n);
          const readBackAssets = Number((await dbGet(database, "SELECT COUNT(*) n FROM published_corpus_assets WHERE edition_id=?", [editionId])).n);
          if (!readBackEdition || sha256(Buffer.from(readBackEdition.manifest_json, "utf8")) !== manifestSha256 || readBackEdition.manifest_sha256 !== manifestSha256 || readBackItems !== manifestItems.length || readBackAssets !== stagedAssets.length || Number(readBackEdition.package_bytes) !== packageBytes || readBackEdition.package_sha256 !== packageSha256) fail("EDITION_HASH_MISMATCH", 500);
          if (opts.faultAt === "BEFORE_POINTER") fail("FAULT_BEFORE_POINTER", 500);
          await dbRun(database, "UPDATE published_corpora SET current_edition_id=?,status='PUBLISHED',updated_by=?,updated_at=? WHERE corpus_id=?", [editionId, actorId(actor), now(), checked.corpus.corpus_id]);
          if (opts.faultAt === "AFTER_POINTER") fail("FAULT_AFTER_POINTER", 500);
          await dbRun(database, "UPDATE publication_drafts SET state='PUBLISHED',updated_by=?,updated_at=? WHERE draft_id=?", [actorId(actor), now(), checked.draft.draft_id]);
          await appendEvent(actor, checked.corpus.corpus_id, "PUBLISHED", { editionId, idempotencyKey: key, detail: { edition_number: editionNumber, item_count: manifestItems.length, asset_count: stagedAssets.length, asset_missing: checked.asset_missing } });
          const out = { corpus_id: checked.corpus.corpus_id, slug: checked.corpus.slug, edition_id: editionId, edition_number: editionNumber, manifest_sha256: manifestSha256, item_count: manifestItems.length, asset_count: stagedAssets.length, asset_missing: checked.asset_missing, package_complete: checked.package_complete, package_bytes: packageBytes, package_sha256: packageSha256, canonical_committed: true, cache_warm: "NOT_ATTEMPTED" };
          await saveIdempotency(actor, "PUBLISH", key, hash, out);
          return out;
        });
        return receipt;
      } catch (error) {
        try {
          if (fs.existsSync(stageAbs)) await fs.promises.rm(stageAbs, { recursive: true, force: true });
          if (fs.existsSync(finalAbs) && !await dbGet(database, "SELECT 1 ok FROM published_corpus_editions WHERE edition_id=?", [editionId])) await fs.promises.rm(finalAbs, { recursive: true, force: true });
        } catch (_) {}
        throw error;
      }
    });
  }

  async function getPublisherCorpus(actor, corpusId) {
    const corpus = await corpusForActor(actor, corpusId);
    const draft = await dbGet(database, "SELECT * FROM publication_drafts WHERE corpus_id=? AND state='ACTIVE'", [corpus.corpus_id]);
    const items = draft ? await dbAll(database, "SELECT * FROM publication_draft_items WHERE draft_id=? ORDER BY position_no", [draft.draft_id]) : [];
    const enriched = [];
    for (const item of items) enriched.push({ ...item, rights: await latestRights(item.item_id) });
    const editions = await dbAll(database, `SELECT edition_id,edition_number,manifest_sha256,item_count,asset_count,asset_missing,package_complete,package_bytes,package_sha256,published_by,published_at
      FROM published_corpus_editions WHERE corpus_id=? ORDER BY edition_number DESC`, [corpus.corpus_id]);
    const events = await dbAll(database, `SELECT event_id,edition_id,actor_user_id,event_type,reason_code,detail_json,occurred_at
      FROM publication_events WHERE corpus_id=? ORDER BY occurred_at DESC,event_id DESC LIMIT 200`, [corpus.corpus_id]);
    return { ...corpus, draft: draft || null, items: enriched, editions, events: events.map(event => ({ ...event, detail: parseJson(event.detail_json, "PUBLICATION_EVENT_INVALID"), detail_json: undefined })) };
  }
  async function listPublisherCorpora(actor) {
    await assertPublisher(actor);
    if (String(actor && actor.role).toLowerCase() === "owner") return dbAll(database, "SELECT * FROM published_corpora ORDER BY updated_at DESC,corpus_id");
    return dbAll(database, `SELECT c.* FROM published_corpora c JOIN publication_corpus_publishers p ON p.corpus_id=c.corpus_id
      WHERE p.user_id=? AND p.status='ACTIVE' ORDER BY c.updated_at DESC,c.corpus_id`, [actorId(actor)]);
  }
  async function listPublicCorpora() {
    return dbAll(database, `SELECT c.corpus_id,c.slug,c.title,c.description,c.current_edition_id,e.edition_number,e.manifest_sha256,e.item_count,e.asset_count,e.asset_missing,e.package_complete,e.published_at
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
     WHERE c.status='PUBLISHED' ORDER BY c.title,c.corpus_id`);
  }
  async function getPublicCorpus(slug) {
    const clean = cleanSlug(slug);
    const corpus = await dbGet(database, `SELECT c.corpus_id,c.slug,c.title,c.description,c.status,c.current_edition_id,
      e.edition_id,e.edition_number,e.manifest_sha256,e.item_count,e.asset_count,e.asset_missing,e.package_complete,e.published_at
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
     WHERE c.slug=? AND c.status='PUBLISHED'`, [clean]);
    if (!corpus) fail("CORPUS_NOT_FOUND", 404);
    const items = await dbAll(database, `SELECT public_work_id,position_no,title,creator,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete
      FROM published_corpus_edition_items WHERE edition_id=? AND public_read_allowed=1 ORDER BY position_no`, [corpus.edition_id]);
    return { corpus: { corpus_id: corpus.corpus_id, slug: corpus.slug, title: corpus.title, description: corpus.description }, edition: { edition_id: corpus.edition_id, edition_number: Number(corpus.edition_number), manifest_sha256: corpus.manifest_sha256, item_count: Number(corpus.item_count), asset_count: Number(corpus.asset_count), asset_missing: Number(corpus.asset_missing), package_complete: !!corpus.package_complete, published_at: corpus.published_at }, items };
  }
  async function getPublicWork(slug, workId) {
    const published = await getPublicCorpus(slug);
    const item = await dbGet(database, `SELECT * FROM published_corpus_edition_items WHERE edition_id=? AND public_work_id=? AND public_read_allowed=1`, [published.edition.edition_id, cleanId(workId, "CORPUS_NOT_FOUND")]);
    if (!item) fail("CORPUS_NOT_FOUND", 404);
    const snapshot = parseJson(item.snapshot_json);
    const referenced = new Set();
    (function collect(value) {
      if (!value || typeof value !== "object") return;
      if (typeof value.audio_asset_key === "string" && /^[0-9a-f]{64}$/.test(value.audio_asset_key)) referenced.add(value.audio_asset_key);
      if (Array.isArray(value)) value.forEach(collect);
      else Object.values(value).forEach(collect);
    })(snapshot);
    let assets = [];
    if (item.public_stream_allowed === 1 && referenced.size) {
      const keys = [...referenced].sort();
      assets = await dbAll(database, `SELECT asset_key,bytes,sha256,mime,public_stream_allowed,package_download_allowed FROM published_corpus_assets
        WHERE edition_id=? AND public_stream_allowed=1 AND asset_key IN (${keys.map(() => "?").join(",")}) ORDER BY asset_key`, [published.edition.edition_id, ...keys]);
    }
    return { ...published, item: { ...item, snapshot, snapshot_json: undefined }, assets };
  }
  async function getPublicAsset(slug, assetKey, purpose = "stream") {
    const published = await getPublicCorpus(slug);
    const key = String(assetKey || "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key)) fail("CORPUS_NOT_FOUND", 404);
    const permission = purpose === "download" ? "package_download_allowed" : "public_stream_allowed";
    const asset = await dbGet(database, `SELECT * FROM published_corpus_assets WHERE edition_id=? AND asset_key=? AND ${permission}=1`, [published.edition.edition_id, key]);
    if (!asset) fail("CORPUS_NOT_FOUND", 404);
    const absolutePath = publicationPath(asset.storage_path);
    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile() || stat.size !== Number(asset.bytes) || (await fileHash(absolutePath)) !== asset.sha256) fail("CORPUS_NOT_FOUND", 404);
    } catch (error) { if (error && error.code === "CORPUS_NOT_FOUND") throw error; fail("CORPUS_NOT_FOUND", 404); }
    return { asset, absolute_path: absolutePath };
  }
  async function getPublicPackage(slug) {
    const clean = cleanSlug(slug);
    const edition = await dbGet(database, `SELECT e.edition_id,e.package_path,e.package_bytes,e.package_sha256,e.package_complete,e.asset_missing
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
     WHERE c.slug=? AND c.status='PUBLISHED'`, [clean]);
    if (!edition) fail("CORPUS_NOT_FOUND", 404);
    const absolutePath = publicationPath(edition.package_path);
    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile() || stat.size !== Number(edition.package_bytes) || (await fileHash(absolutePath)) !== edition.package_sha256) fail("CORPUS_NOT_FOUND", 404);
    } catch (error) { if (error && error.code === "CORPUS_NOT_FOUND") throw error; fail("CORPUS_NOT_FOUND", 404); }
    return { edition, absolute_path: absolutePath };
  }

  async function pointerMutation(actor, corpusId, operation, eventType, input, opts) {
    const editionId = input && input.editionId ? cleanId(input.editionId, "CORPUS_NOT_FOUND") : null;
    const reasonCode = cleanText(input && input.reasonCode, 100);
    return withIdempotency(actor, operation, opts, { corpusId, editionId, reasonCode }, async key => {
      const corpus = await corpusForActor(actor, corpusId);
      let target = editionId;
      if (eventType === "WITHDRAWN") target = null;
      else {
        if (!target) fail("CORPUS_NOT_FOUND", 404);
        if (!await dbGet(database, "SELECT 1 ok FROM published_corpus_editions WHERE edition_id=? AND corpus_id=?", [target, corpus.corpus_id])) fail("CORPUS_NOT_FOUND", 404);
      }
      await dbRun(database, `UPDATE published_corpora SET current_edition_id=?,status=?,updated_by=?,updated_at=? WHERE corpus_id=?`, [target, target ? "PUBLISHED" : "WITHDRAWN", actorId(actor), now(), corpus.corpus_id]);
      await appendEvent(actor, corpus.corpus_id, eventType, { editionId: target || corpus.current_edition_id, idempotencyKey: key, reasonCode });
      return target ? { corpus_id: corpus.corpus_id, edition_id: target, restored: eventType === "RESTORED", rolled_back: eventType === "POINTER_ROLLED_BACK" } : { corpus_id: corpus.corpus_id, withdrawn: true };
    });
  }
  const withdraw = (actor, corpusId, input, opts) => pointerMutation(actor, corpusId, "WITHDRAW", "WITHDRAWN", input, opts);
  const restore = (actor, corpusId, input, opts) => pointerMutation(actor, corpusId, "RESTORE", "RESTORED", input, opts);
  const rollback = (actor, corpusId, input, opts) => pointerMutation(actor, corpusId, "ROLLBACK_POINTER", "POINTER_ROLLED_BACK", input, opts);

  async function createRevisionDraft(actor, corpusId, opts) {
    return withIdempotency(actor, "CREATE_REVISION_DRAFT", opts, { corpusId }, async key => {
      const corpus = await corpusForActor(actor, corpusId);
      if (!corpus.current_edition_id) fail("CORPUS_NOT_FOUND", 404);
      if (await dbGet(database, "SELECT 1 ok FROM publication_drafts WHERE corpus_id=? AND state='ACTIVE'", [corpus.corpus_id])) fail("DRAFT_VERSION_CONFLICT", 409);
      const draftNumber = Number((await dbGet(database, "SELECT COALESCE(MAX(draft_number),0)+1 n FROM publication_drafts WHERE corpus_id=?", [corpus.corpus_id])).n);
      const draftId = id("pd_"); const at = now();
      await dbRun(database, `INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,based_on_edition_id,created_by,updated_by,created_at,updated_at)
        VALUES(?,?,?,1,'ACTIVE',?,?,?,?,?)`, [draftId, corpus.corpus_id, draftNumber, corpus.current_edition_id, actorId(actor), actorId(actor), at, at]);
      const prior = await dbAll(database, `SELECT ei.*,di.source_domain,di.source_corpus_id,di.source_work_id,di.source_revision,di.source_hash
        FROM published_corpus_edition_items ei JOIN publication_draft_items di ON di.item_id=ei.source_item_id
       WHERE ei.edition_id=? ORDER BY ei.position_no`, [corpus.current_edition_id]);
      for (const old of prior) {
        const newItemId = id("pi_");
        await dbRun(database, `INSERT INTO publication_draft_items(item_id,draft_id,position_no,source_domain,source_corpus_id,source_work_id,source_revision,source_hash,snapshot_json,snapshot_sha256,title,creator,expected_audio_count,copied_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [newItemId, draftId, old.position_no, old.source_domain, old.source_corpus_id, old.source_work_id, old.source_revision, old.source_hash, old.snapshot_json, old.snapshot_sha256, old.title, old.creator, old.expected_audio_count, at]);
        const rights = [["PUBLIC_READ", old.public_read_allowed], ["PUBLIC_STREAM", old.public_stream_allowed], ["PACKAGE_DOWNLOAD", old.package_download_allowed]];
        for (const [permission, allowed] of rights) await dbRun(database, `INSERT INTO publication_rights_facts(fact_id,item_id,permission,allowed,basis,asserted_at,asserted_by,created_at) VALUES(?,?,?,?,?,?,?,?)`, [id("prf_"), newItemId, permission, allowed, old.rights_basis, old.rights_asserted_at, actorId(actor), at]);
      }
      await appendEvent(actor, corpus.corpus_id, "DRAFT_CREATED", { editionId: corpus.current_edition_id, idempotencyKey: key, detail: { draft_number: draftNumber, based_on_edition_id: corpus.current_edition_id } });
      return { corpus_id: corpus.corpus_id, draft_id: draftId, draft_number: draftNumber, draft_version: 1, item_count: prior.length };
    });
  }

  return {
    grantPublisher, createCorpus, copyGroupCorpusItems, copyMyTextItems, reorderDraftItems, applyRightsPreset,
    validateDraft, publish, createRevisionDraft, getPublisherCorpus, listPublisherCorpora,
    listPublicCorpora, getPublicCorpus, getPublicWork, getPublicAsset, getPublicPackage,
    withdraw, restore, rollback,
  };
}

let singleton = null;
function singletonRepo() {
  if (!singleton) singleton = createPublicationRepo();
  return singleton;
}

module.exports = {
  createPublicationRepo,
  getPublicationRepo: singletonRepo,
  sanitizeSnapshot,
  canonicalJson,
};
