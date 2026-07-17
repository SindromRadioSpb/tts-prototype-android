"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ERA = Object.freeze({
  biblical: "BIBLICAL",
  medieval: "MEDIEVAL",
  haskalah: "REVIVAL",
  tehiya: "REVIVAL",
  mandate: "MODERN",
  modern: "CONTEMPORARY",
  unknown: "UNKNOWN",
});
const GENRE = Object.freeze({
  prose: "PROSE",
  poetry: "POETRY",
  article: "ESSAY",
  drama: "DRAMA",
  reference: "REFERENCE",
  lexicon: "REFERENCE",
  fables: "OTHER",
  memoir: "OTHER",
  letters: "OTHER",
});

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function plain(value) { return value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function normalizeText(value) { return String(value == null ? "" : value).replace(/[\u0591-\u05C7]/g, "").toLowerCase().trim(); }
function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function boundedText(value, maxBytes) {
  const input = String(value == null ? "" : value);
  if (!input) fail("AA_PUBLIC_CATALOG_TEXT_INVALID");
  if (Buffer.byteLength(input, "utf8") <= maxBytes) return input;
  const suffix = "…";
  let out = "";
  for (const char of input) {
    if (Buffer.byteLength(out + char + suffix, "utf8") > maxBytes) break;
    out += char;
  }
  if (!out) fail("AA_PUBLIC_CATALOG_TEXT_INVALID");
  return out + suffix;
}
function mapEra(value) {
  const key = value == null || value === "" ? "unknown" : String(value);
  if (!Object.prototype.hasOwnProperty.call(ERA, key)) fail("AA_PUBLIC_CATALOG_ERA_UNKNOWN");
  return ERA[key];
}
function mapGenre(value) {
  const key = value == null ? "" : String(value);
  return GENRE[key] || "UNKNOWN";
}
function matchRank(value, query) {
  if (!query) return 0;
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (value.includes(query)) return 2;
  return 3;
}
function canonicalFingerprint(input) {
  return JSON.stringify({
    query: input.query || "", era: input.era || null, genre: input.genre || null,
    language: input.language, audio: input.audio, ready: input.ready, sort: input.sort,
  });
}

function createPublicReadingCatalog(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, "..", "..", "public", "data", "benyehuda");
  const versionSource = options.catalogVersion;
  const readFile = options.readFileSync || fs.readFileSync;
  const cursorKey = options.cursorKey || crypto.randomBytes(32);
  if (typeof versionSource !== "function" || typeof readFile !== "function") fail("AA_PUBLIC_CATALOG_DEPENDENCY_INVALID");
  if (!Buffer.isBuffer(cursorKey) && !(cursorKey instanceof Uint8Array) && typeof cursorKey !== "string") fail("AA_PUBLIC_CATALOG_CURSOR_KEY_INVALID");
  let cache = null;

  function parseFile(file) {
    try { return JSON.parse(readFile(path.join(baseDir, file), "utf8")); }
    catch (_) { fail("AA_PUBLIC_CATALOG_JSON_INVALID"); }
  }
  function load() {
    if (cache) return cache;
    const version = Number(versionSource());
    if (!Number.isInteger(version) || version < 1) fail("AA_PUBLIC_CATALOG_VERSION_INVALID");
    const rootName = `corpus-catalog-v${version}.json`;
    const indexName = `corpus-index-v${version}.json`;
    const searchName = `corpus-search-v${version}.json`;
    const root = parseFile(rootName);
    if (!plain(root) || Number(root.version) !== version || root.index_file !== indexName || root.search_file !== searchName) fail("AA_PUBLIC_CATALOG_VERSION_MISMATCH");
    const search = parseFile(searchName);
    const index = parseFile(indexName);
    if (!Array.isArray(search) || !plain(index) || Number(index.version) !== version || !Array.isArray(index.ready)) fail("AA_PUBLIC_CATALOG_SHAPE_INVALID");
    if (!plain(root.counts) || Number(root.counts.works) !== search.length || Number(root.counts.baked) !== index.ready.length) fail("AA_PUBLIC_CATALOG_COUNT_MISMATCH");

    const flat = new Map();
    for (const row of search) {
      if (!plain(row) || !/^[A-Za-z0-9_.:@/-]{1,128}$/.test(String(row.id || "")) || ![0, 1].includes(row.r)) fail("AA_PUBLIC_CATALOG_ROW_INVALID");
      const id = String(row.id);
      if (flat.has(id)) fail("AA_PUBLIC_CATALOG_DUPLICATE_ID");
      flat.set(id, row);
    }
    const ready = new Map();
    for (const card of index.ready) {
      if (!plain(card) || !/^[A-Za-z0-9_.:@/-]{1,128}$/.test(String(card.id || ""))
        || !Number.isInteger(card.segments) || card.segments < 0 || card.segments > 1000000
        || typeof card.audio_status !== "string" || !card.audio_status) fail("AA_PUBLIC_CATALOG_READY_INVALID");
      const id = String(card.id);
      if (ready.has(id)) fail("AA_PUBLIC_CATALOG_DUPLICATE_READY_ID");
      const row = flat.get(id);
      if (!row || row.r !== 1 || row.t !== card.title || row.a !== card.author || row.e !== card.era || row.g !== card.genre) fail("AA_PUBLIC_CATALOG_READY_JOIN_MISMATCH");
      ready.set(id, card);
    }
    for (const [id, row] of flat) if ((row.r === 1) !== ready.has(id)) fail("AA_PUBLIC_CATALOG_READY_JOIN_MISMATCH");

    const eligible = [];
    for (const [id, row] of flat) {
      if (row.l !== "he") continue;
      const card = ready.get(id) || null;
      const title = String(row.t == null ? "" : row.t);
      const author = String(row.a == null ? "" : row.a);
      if (!title || !author) fail("AA_PUBLIC_CATALOG_TEXT_INVALID");
      eligible.push(Object.freeze({
        work_id: id, title, author, normalized_title: normalizeText(title), normalized_author: normalizeText(author),
        era: mapEra(row.e), genre: mapGenre(row.g), ready: Boolean(card),
        sentence_count: card ? card.segments : 0, audio_available: Boolean(card && card.audio_status !== "none"),
      }));
    }
    cache = Object.freeze({ version: String(version), rows: Object.freeze(eligible) });
    return cache;
  }

  function signature(payload) { return crypto.createHmac("sha256", cursorKey).update(payload).digest("base64url"); }
  function encodeCursor(version, fingerprint, position) {
    const payload = Buffer.from(JSON.stringify({ v: version, f: fingerprint, p: position }), "utf8").toString("base64url");
    return `${payload}.${signature(payload)}`;
  }
  function decodeCursor(cursor, version, fingerprint) {
    const parts = String(cursor || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) fail("AA_PUBLIC_CATALOG_CURSOR_INVALID");
    const expected = signature(parts[0]);
    const supplied = parts[1];
    if (Buffer.byteLength(expected) !== Buffer.byteLength(supplied)
      || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) fail("AA_PUBLIC_CATALOG_CURSOR_INVALID");
    let value;
    try { value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
    catch (_) { fail("AA_PUBLIC_CATALOG_CURSOR_INVALID"); }
    if (!plain(value) || Object.keys(value).sort().join(",") !== "f,p,v" || value.v !== version || value.f !== fingerprint
      || !Number.isInteger(value.p) || value.p < 0) fail("AA_PUBLIC_CATALOG_CURSOR_INVALID");
    return value.p;
  }

  function search(input) {
    const loaded = load();
    const normalized = Object.freeze({ ...input, query: normalizeText(input.query || "") });
    const fingerprint = crypto.createHash("sha256").update(canonicalFingerprint(normalized)).digest("base64url");
    let rows = loaded.rows.filter((row) => {
      if (normalized.query && !row.normalized_title.includes(normalized.query) && !row.normalized_author.includes(normalized.query)) return false;
      if (normalized.era && row.era !== normalized.era) return false;
      if (normalized.genre && row.genre !== normalized.genre) return false;
      if (normalized.ready === "READY" && !row.ready) return false;
      if (normalized.ready === "METADATA_ONLY" && row.ready) return false;
      if (normalized.audio === "AVAILABLE" && !row.audio_available) return false;
      if (normalized.audio === "UNAVAILABLE" && row.audio_available) return false;
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      let result = 0;
      if (normalized.sort === "RELEVANCE") {
        if (normalized.query) result = matchRank(a.normalized_title, normalized.query) - matchRank(b.normalized_title, normalized.query)
          || matchRank(a.normalized_author, normalized.query) - matchRank(b.normalized_author, normalized.query);
        result ||= Number(b.ready) - Number(a.ready);
      } else if (normalized.sort === "TITLE") result = compareText(a.normalized_title, b.normalized_title) || compareText(a.normalized_author, b.normalized_author);
      else if (normalized.sort === "AUTHOR") result = compareText(a.normalized_author, b.normalized_author) || compareText(a.normalized_title, b.normalized_title);
      else if (normalized.sort === "LENGTH_ASC" || normalized.sort === "LENGTH_DESC") {
        result = Number(b.ready) - Number(a.ready);
        if (!result && a.ready && b.ready) result = normalized.sort === "LENGTH_ASC" ? a.sentence_count - b.sentence_count : b.sentence_count - a.sentence_count;
        result ||= compareText(a.normalized_title, b.normalized_title);
      }
      return result || compareText(a.normalized_title, b.normalized_title) || compareText(a.normalized_author, b.normalized_author) || compareText(a.work_id, b.work_id);
    });
    const offset = normalized.cursor ? decodeCursor(normalized.cursor, loaded.version, fingerprint) : 0;
    if (offset > rows.length) fail("AA_PUBLIC_CATALOG_CURSOR_INVALID");
    const page = rows.slice(offset, offset + normalized.limit);
    const results = page.map((row) => Object.freeze({
      work_id: row.work_id, title: boundedText(row.title, 240), author: boundedText(row.author, 200),
      era: row.era, genre: row.genre, language: "he", sentence_count: row.sentence_count,
      audio_available: row.audio_available, ready_state: row.ready ? "READY" : "METADATA_ONLY",
      first_party_path: "/library.html",
    }));
    const next = offset + page.length;
    return Object.freeze({ catalog_version: loaded.version, results: Object.freeze(results), next_cursor: next < rows.length ? encodeCursor(loaded.version, fingerprint, next) : null });
  }

  return Object.freeze({ isReadable: () => Boolean(load()), search, catalogVersion: () => load().version });
}

module.exports = { createPublicReadingCatalog, normalizeText, mapEra, mapGenre };
