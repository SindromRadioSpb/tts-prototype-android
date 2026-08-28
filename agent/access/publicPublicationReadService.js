"use strict";

const crypto = require("crypto");

const MAX_TEXT_BYTES = 16 * 1024;
const MAX_ROWS = 20;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function integer(value, min, max, fallback) {
  const out = value == null ? fallback : Number(value);
  if (!Number.isInteger(out) || out < min || out > max) fail("AA_PUBLICATION_INPUT_INVALID");
  return out;
}
function bounded(value, max, required = true) {
  const out = String(value == null ? "" : value).trim();
  if ((required && !out) || Buffer.byteLength(out, "utf8") > max) fail("AA_PUBLICATION_INPUT_INVALID");
  return out;
}
function byteSlice(value, max) {
  const source = String(value == null ? "" : value);
  if (Buffer.byteLength(source, "utf8") <= max) return source;
  let low = 0;
  let high = source.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(source.slice(0, middle), "utf8") <= max) low = middle;
    else high = middle - 1;
  }
  return source.slice(0, low);
}
function base64url(value) { return Buffer.from(value).toString("base64url"); }
function hmac(key, value) { return crypto.createHmac("sha256", key).update(value).digest("base64url"); }

function createPublicPublicationReadService(options = {}) {
  if (!options.rightsRepo) fail("AA_PUBLICATION_DEPENDENCY_MISSING");
  const rightsRepo = options.rightsRepo;
  const physicsRepo = options.physicsRepo || null;
  const physicsLearningSupport = options.physicsLearningSupport || null;
  const origin = String(options.canonicalOrigin || "").replace(/\/$/, "");
  if (!/^https:\/\//.test(origin)) fail("AA_PUBLICATION_ORIGIN_INVALID");
  const cursorKey = bounded(options.cursorKey, 256);
  if (Buffer.byteLength(cursorKey, "utf8") < 24) fail("AA_PUBLICATION_CURSOR_KEY_INVALID");
  const now = options.now || (() => new Date().toISOString());

  function encodeCursor(kind, state) {
    const body = base64url(JSON.stringify({ v: 1, kind, state }));
    return `${body}.${hmac(cursorKey, body)}`;
  }
  function decodeCursor(cursor, kind) {
    if (!cursor) return null;
    const parts = String(cursor).split(".");
    if (parts.length !== 2 || !crypto.timingSafeEqual(Buffer.from(hmac(cursorKey, parts[0])), Buffer.from(parts[1]))) fail("AA_PUBLICATION_CURSOR_INVALID");
    let value; try { value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch (_) { fail("AA_PUBLICATION_CURSOR_INVALID"); }
    if (!value || value.v !== 1 || value.kind !== kind || !value.state || typeof value.state !== "object") fail("AA_PUBLICATION_CURSOR_INVALID");
    return value.state;
  }
  function projection(row) {
    return {
      corpus_id: row.corpus_id, corpus_slug: row.slug, corpus_title: byteSlice(row.corpus_title, 500),
      edition_id: row.edition_id, edition_number: Number(row.edition_number), manifest_sha256: row.manifest_sha256,
      edition_item_id: row.edition_item_id, public_work_id: row.public_work_id, position_no: Number(row.position_no),
      title: byteSlice(row.title, 500), creator: row.creator ? byteSlice(row.creator, 300) : null, snapshot_sha256: row.snapshot_sha256,
    };
  }

  async function listCorpora(input = {}) {
    const limit = integer(input.limit, 1, 20, 20);
    const cursor = decodeCursor(input.cursor, "corpora");
    const rows = await rightsRepo.listDiscoverableCorpora({ afterSlug: cursor ? cursor.slug : "", limit: limit + 1 });
    const visible = rows.slice(0, limit);
    return {
      schema_version: "aa.published_public_corpora.1.0.0",
      corpora: visible.map(row => ({ corpus_id: row.corpus_id, slug: row.slug, title: byteSlice(row.title, 500), description: byteSlice(row.description, 4000),
        edition_id: row.edition_id, edition_number: Number(row.edition_number), manifest_sha256: row.manifest_sha256,
        item_count: Number(row.item_count), asset_count: Number(row.asset_count), published_at: row.published_at })),
      next_cursor: rows.length > limit ? encodeCursor("corpora", { slug: visible[visible.length - 1].slug }) : null,
      generated_at: now(),
    };
  }

  async function searchItems(input = {}) {
    const corpusSlug = bounded(input.corpusSlug, 80);
    const editionId = bounded(input.editionId, 160);
    const query = bounded(input.query, 160, false);
    const limit = integer(input.limit, 1, 20, 20);
    const cursor = decodeCursor(input.cursor, "items");
    if (cursor && (cursor.corpusSlug !== corpusSlug || cursor.editionId !== editionId || cursor.query !== query)) fail("AA_PUBLICATION_CURSOR_INVALID");
    const rows = await rightsRepo.searchDiscoverableItems({ slug: corpusSlug, editionId, query,
      afterPosition: cursor ? cursor.position : 0, afterId: cursor ? cursor.id : "", limit: limit + 1 });
    const visible = rows.slice(0, limit);
    return { schema_version: "aa.published_public_items.1.0.0", items: visible.map(projection),
      next_cursor: rows.length > limit ? encodeCursor("items", { corpusSlug, editionId, query, position: Number(visible[visible.length - 1].position_no), id: visible[visible.length - 1].edition_item_id }) : null,
      generated_at: now() };
  }

  async function getItem(input = {}) {
    const row = await rightsRepo.getDiscoverableItem({ slug: bounded(input.corpusSlug, 80), editionId: bounded(input.editionId, 160), editionItemId: bounded(input.editionItemId, 160) });
    if (!row) fail("AA_PUBLICATION_ITEM_NOT_FOUND");
    return { schema_version: "aa.published_public_item.1.0.0", item: projection(row), generated_at: now() };
  }

  async function readTextWindow(input = {}) {
    const row = await rightsRepo.getTextReadableItem({ slug: bounded(input.corpusSlug, 80), editionId: bounded(input.editionId, 160), editionItemId: bounded(input.editionItemId, 160) });
    if (!row) fail("AA_PUBLICATION_TEXT_NOT_FOUND");
    const start = integer(input.start, 0, 1000000, 0);
    const requested = integer(input.rows, 1, MAX_ROWS, MAX_ROWS);
    let snapshot; try { snapshot = JSON.parse(row.snapshot_json); } catch (_) { fail("AA_PUBLICATION_SNAPSHOT_INVALID"); }
    const texts = snapshot && snapshot.library && Array.isArray(snapshot.library.texts) ? snapshot.library.texts : [];
    const sourceRows = texts.flatMap(text => Array.isArray(text.rows) ? text.rows : []).map((value, index) => ({ value, index }));
    const selected = [];
    for (const entry of sourceRows) {
      const order = Number.isInteger(entry.value.order_index) ? entry.value.order_index : entry.index;
      if (order < start || selected.length >= requested) continue;
      const item = { order_index: order, he: byteSlice(entry.value.hebrew_plain || entry.value.hebrew_niqqud || entry.value.he || "", 800),
        ru: entry.value.russian == null && entry.value.ru == null ? null : byteSlice(entry.value.russian || entry.value.ru, 800) };
      const candidate = [...selected, item];
      if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_TEXT_BYTES - 2048) break;
      selected.push(item);
    }
    return { schema_version: "aa.published_text_window.1.0.0", item: projection(row), start_order_index: start,
      rows: selected, rows_total: sourceRows.length, has_more: sourceRows.some(entry => (Number.isInteger(entry.value.order_index) ? entry.value.order_index : entry.index) > (selected.length ? selected[selected.length - 1].order_index : start - 1)), generated_at: now() };
  }

  async function listResources(input = {}) {
    const corpusSlug = bounded(input.corpusSlug, 80);
    const editionId = bounded(input.editionId, 160);
    const editionItemId = bounded(input.editionItemId, 160);
    const limit = integer(input.limit, 1, 20, 20);
    const cursor = decodeCursor(input.cursor, "resources");
    if (cursor && (cursor.corpusSlug !== corpusSlug || cursor.editionId !== editionId || cursor.editionItemId !== editionItemId)) fail("AA_PUBLICATION_CURSOR_INVALID");
    if (cursor && !new Set(["generic", "physics"]).has(cursor.source)) fail("AA_PUBLICATION_CURSOR_INVALID");
    const generic = cursor?.source === "physics" ? [] : await rightsRepo.listReadableAssets({ slug: corpusSlug, editionId, editionItemId, afterKey: cursor ? cursor.key : "", limit: limit + 1 });
    let rows = generic.map(row => ({ resource_id: row.edition_asset_id, resource_kind: "PUBLICATION_ASSET", revision_id: null,
      asset_key: row.asset_key, bytes: Number(row.bytes), sha256: row.sha256, mime: row.mime,
      url: `${origin}/api/public-corpora/${encodeURIComponent(corpusSlug)}/assets/${encodeURIComponent(row.asset_key)}` }));
    let source = "generic";
    if (!rows.length && cursor?.source !== "generic" && physicsRepo) {
      const item = await rightsRepo.getDiscoverableItem({ slug: corpusSlug, editionId, editionItemId });
      if (item) {
        source = "physics";
        const offset = cursor ? integer(cursor.offset, 0, 1000000, 0) : 0;
        rows = (await physicsRepo.listPublicResources(corpusSlug, item.public_work_id, { agent: true }))
        .filter(resource => resource.resource_kind === "PDF").map(resource => ({
        resource_id: resource.resource_id, resource_kind: resource.resource_kind, revision_id: resource.revision_id, asset_key: null,
        bytes: Number(resource.bytes), sha256: resource.sha256, mime: resource.mime,
        url: `${origin}${resource.file_url}`,
        })).slice(offset, offset + limit + 1);
      }
    }
    const visible = rows.slice(0, limit);
    return { schema_version: "aa.published_item_resources.1.0.0", edition_id: editionId, edition_item_id: editionItemId, resources: visible,
      next_cursor: rows.length > limit ? encodeCursor("resources", source === "generic"
        ? { corpusSlug, editionId, editionItemId, source, key: visible[visible.length - 1].asset_key }
        : { corpusSlug, editionId, editionItemId, source, offset: (cursor ? cursor.offset : 0) + visible.length }) : null,
      generated_at: now() };
  }

  async function readLearningSupport(input = {}) {
    if (!physicsLearningSupport || typeof rightsRepo.getDerivativeReadableItem !== "function") fail("AA_PUBLICATION_DERIVATIVE_NOT_FOUND");
    const row = await rightsRepo.getDerivativeReadableItem({
      slug: bounded(input.corpusSlug, 80), editionId: bounded(input.editionId, 160), editionItemId: bounded(input.editionItemId, 160),
    });
    if (!row) fail("AA_PUBLICATION_DERIVATIVE_NOT_FOUND");
    let body;
    try {
      body = physicsLearningSupport.resolveLearningSupport({
        slug: row.slug, editionId: row.edition_id, editionNumber: row.edition_number,
        editionManifestSha256: row.manifest_sha256, editionItemId: row.edition_item_id,
        publicWorkId: row.public_work_id, snapshotSha256: row.snapshot_sha256, snapshot: row.snapshot_json,
      });
    } catch (_) { fail("AA_PUBLICATION_DERIVATIVE_NOT_FOUND"); }
    const markdown = physicsLearningSupport.toAgentMarkdown(body);
    return { schema_version: "aa.published_learning_support.1.0.0", item: projection(row), task_number: body.task_number,
      locale: "ru", content_markdown: markdown, derivative_sha256: body.derivative_sha256, generated_at: now() };
  }

  return Object.freeze({ listCorpora, searchItems, getItem, readTextWindow, listResources, readLearningSupport });
}

module.exports = { createPublicPublicationReadService, MAX_TEXT_BYTES, MAX_ROWS };
