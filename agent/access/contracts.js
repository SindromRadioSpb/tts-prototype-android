"use strict";

const CONTRACT_VERSION = "aa-contracts.1.0.0";
const MAX_ARGUMENT_BYTES = 4096;
const MAX_PRINCIPAL_BYTES = 2048;
const ID = /^[A-Za-z0-9_.:@/-]{1,128}$/;
const CURSOR = /^[A-Za-z0-9_.~:@/+\-=]{1,256}$/;
const GROUP_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

const PRIORITY = new Set(["REVIEW_DUE", "READING_AVAILABLE", "MENTOR_AVAILABLE", "NO_CURRENT_ACTION"]);
const UNFINISHED = new Set(["READING_AVAILABLE", "REVIEW_AVAILABLE", "MENTOR_AVAILABLE", "NONE"]);
const EXPLANATION_KINDS = new Set(["sentence", "word", "study_summary", "draft_retell"]);
const PURGE_STATES = new Set(["AVAILABLE", "PURGED", "DELETED"]);
const CONNECTION_STATES = new Set(["ACTIVE", "SCOPE_REDUCED", "SUSPENDED", "REVOKED"]);
const AUDIO = new Set(["ANY", "AVAILABLE", "UNAVAILABLE"]);
const READY_FILTER = new Set(["ANY", "READY", "METADATA_ONLY"]);
const READY_STATE = new Set(["READY", "METADATA_ONLY"]);
const SORT = new Set(["RELEVANCE", "TITLE", "AUTHOR", "LENGTH_ASC", "LENGTH_DESC"]);
const ERAS = new Set(["BIBLICAL", "RABBINIC", "MEDIEVAL", "REVIVAL", "MODERN", "CONTEMPORARY", "UNKNOWN"]);
const GENRES = new Set(["PROSE", "POETRY", "ESSAY", "DRAMA", "CHILDREN", "REFERENCE", "OTHER", "UNKNOWN"]);
const SCOPES = new Set([
  "learning.brief.read",
  "review.summary.read",
  "reading.public.search",
  "explanations.metadata.read",
  "agent.connection.read",
  // AA3 slice-1 (kept in lockstep with oauthContracts.SCOPES + migration 044 CHECK).
  "review.items.read",
  "profile.read",
  "explanations.body.read",
  "reading.corpus.read",
  "reading.handoff.create",
  "intent.propose",
  "review.activity.read",
  "review.handoff.create",
  // S-пакет (PERSONAL_TEXTS_S1S2_DESIGN): личные тексты владельца. ОБА scope заведены в S1
  // (одна re-авторизация Hermes); content-инструмент приходит в S2. Lockstep: oauthContracts +
  // Lockstep: oauthContracts + owner-approved migration 061 CHECK (23 scopes).
  "personal.texts.metadata.read",
  "personal.texts.content.read",
  "morphology.read",
  "learner.coverage.read",
  "reading.group_corpus.read",
  "learner.group_coverage.read",
  "intent.import_text.propose",
  "intent.track_word.propose",
  "intent.goal.propose",
  "goal.read",
]);
const STRUGGLE = new Set(["none", "some", "high"]);
const PROFILE_MODE = new Set(["silent", "coach", "intensive"]);
const PROFILE_DEPTH = new Set(["brief", "detailed"]);
const ACCESS_LIFETIME = new Set(["PERSISTENT_WINDOW", "TIMED_WINDOW", "TOKEN_ONLY"]);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WORK_ID_RE = /^\d{1,8}$/;
const TEXT_KEY_RE = /^[a-f0-9]{16,64}$/;
// ЛИЧНЫЕ text_key ≠ корпусные hex-хэши: реальные ключи Студии — 'text-<ts>-<rand>',
// 'text-card-…', импортированные бандлы — произвольные ≤200 (server-кап BAD_KEY). Критика
// S-пакета: копипаст TEXT_KEY_RE зарубил бы 100% личных ключей. Безопасный алфавит, bounded.
const PERSONAL_TEXT_KEY_RE = /^[A-Za-z0-9._:-]{1,200}$/;
const HANDOFF_URL_RE = /^https:\/\/linguistpro\.kolosei\.com\/library\.html\?handoff=[A-Za-z0-9_-]{16,256}$/;
const HEBREW_WORD_RE = /^[֑-ׇא-ת׳״'-]+$/u;
const MORPH_RESOLUTION = new Set(["EXACT", "AMBIGUOUS", "UNRESOLVED"]);
const MORPH_UNRESOLVED = new Set(["NOT_IN_DICTIONARY", "AMBIGUOUS_WITHOUT_CONTEXT", "NON_HEBREW"]);
const MORPH_CONFIDENCE = new Set(["EXACT", "PROBABLE", "POSSIBLE"]);
const MORPH_POS = new Set(["adjective", "adverb", "conjunction", "interjection", "noun", "other", "preposition", "pronoun", "verb"]);
const MORPH_BINYAN = new Set(["hifil", "hitpael", "hufal", "nifal", "paal", "piel", "pual"]);
const MORPH_GENDER = new Set(["MASCULINE", "FEMININE"]);
const MORPH_NUMBER = new Set(["SINGULAR", "PLURAL"]);
const MORPH_PERSON = new Set(["1", "2", "3"]);
const MORPH_TENSE = new Set(["PAST", "PRESENT", "FUTURE", "IMPERATIVE", "INFINITIVE"]);
const COVERAGE_STATUS = new Set(["AVAILABLE", "AVAILABLE_LIMITED", "NEEDS_PROFILE", "NOT_PREPARED", "PENDING", "STALE", "UNSUPPORTED", "UNAVAILABLE"]);
const IMPORT_ORIGINS = new Set(["LRCLIB", "YOUTUBE_TRANSCRIPT", "SEFARIA", "AGENT_COMPOSED", "OWNER_SUPPLIED", "OTHER"]);
const NIQQUD_STATES = new Set(["NONE", "PARTIAL", "FULL", "MACHINE_ADDED"]);
const TRACK_EVIDENCE = new Set(["USER_PRODUCED_SPEECH", "USER_PRODUCED_TEXT", "AGENT_SHOWN_ONLY", "USER_ASKED_ABOUT"]);
const TRACK_CAVEATS = new Set(["POSSIBLE_ASR_ERROR", "POSSIBLE_MORPH_AMBIGUITY", "STYLE_SUGGESTION"]);
const GOAL_TYPES = new Set(["PROCESS", "OUTCOME"]);

class AgentAccessError extends Error {
  constructor(code, message, retryable = false) {
    super(message || code);
    this.name = "AgentAccessError";
    this.code = code;
    this.retryable = Boolean(retryable);
  }
}

function fail(code, message) { throw new AgentAccessError(code, message); }
function plain(value, code = "INVALID_OBJECT") {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  return value;
}
function closed(value, allowed, required = [], code = "SCHEMA_INVALID") {
  const obj = plain(value, code);
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) fail("UNKNOWN_FIELD", key);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(obj, key)) fail(code, `missing:${key}`);
  return obj;
}
function bytes(value, max, code) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch (_) { fail(code || "PAYLOAD_INVALID"); }
  if (Buffer.byteLength(encoded, "utf8") > max) fail(code || "PAYLOAD_TOO_LARGE");
}
function string(value, maxBytes, code = "SCHEMA_INVALID", nullable = false) {
  if (value == null && nullable) return null;
  if (typeof value !== "string" || !value.length || Buffer.byteLength(value, "utf8") > maxBytes) fail(code);
  return value;
}
function id(value, code = "SCHEMA_INVALID") {
  const out = string(value, 128, code);
  if (!ID.test(out)) fail(code);
  return out;
}
function integer(value, min, max, code = "SCHEMA_INVALID") {
  if (!Number.isInteger(value) || value < min || value > max) fail(code);
  return value;
}
function decimal(value, min, max, code = "SCHEMA_INVALID") {
  if (!Number.isFinite(value) || value < min || value > max) fail(code);
  return value;
}
function bool(value, code = "SCHEMA_INVALID") { if (typeof value !== "boolean") fail(code); return value; }
function oneOf(value, allowed, code = "SCHEMA_INVALID") { if (!allowed.has(value)) fail(code); return value; }
function timestamp(value, code = "SCHEMA_INVALID", nullable = false) {
  if (value == null && nullable) return null;
  const out = string(value, 40, code);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(out) || !Number.isFinite(Date.parse(out))) fail(code);
  return out;
}
function uniqueStrings(value, maxItems, validator, code = "SCHEMA_INVALID") {
  if (!Array.isArray(value) || value.length > maxItems) fail(code);
  const out = value.map((item) => validator(item));
  if (new Set(out).size !== out.length) fail(code);
  return out;
}

function validatePrincipal(value) {
  const keys = ["user_id", "oauth_client_id", "connection_id", "external_actor_id", "request_id", "scopes", "connection_status", "access_expires_at"];
  const p = closed(value, keys, keys, "PRINCIPAL_INVALID");
  bytes(p, MAX_PRINCIPAL_BYTES, "PRINCIPAL_TOO_LARGE");
  const out = {
    user_id: id(p.user_id, "PRINCIPAL_INVALID"),
    oauth_client_id: id(p.oauth_client_id, "PRINCIPAL_INVALID"),
    connection_id: id(p.connection_id, "PRINCIPAL_INVALID"),
    external_actor_id: id(p.external_actor_id, "PRINCIPAL_INVALID"),
    request_id: id(p.request_id, "PRINCIPAL_INVALID"),
    scopes: uniqueStrings(p.scopes, SCOPES.size, (v) => oneOf(v, SCOPES, "PRINCIPAL_INVALID"), "PRINCIPAL_INVALID"),
    connection_status: oneOf(p.connection_status, CONNECTION_STATES, "PRINCIPAL_INVALID"),
    access_expires_at: timestamp(p.access_expires_at, "PRINCIPAL_INVALID"),
  };
  return Object.freeze({ ...out, scopes: Object.freeze(out.scopes) });
}

function emptyInput(value) { const out = closed(value, [], [], "ARGUMENT_SCHEMA_INVALID"); bytes(out, MAX_ARGUMENT_BYTES, "ARGUMENTS_TOO_LARGE"); return Object.freeze({}); }
function validateSearchInput(value) {
  const allowed = ["query", "era", "genre", "language", "audio", "ready", "sort", "cursor", "limit"];
  const x = closed(value, allowed, ["language", "audio", "ready", "sort", "limit"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 2048, "ARGUMENTS_TOO_LARGE");
  const out = {
    language: oneOf(x.language, new Set(["he"]), "ARGUMENT_SCHEMA_INVALID"),
    audio: oneOf(x.audio, AUDIO, "ARGUMENT_SCHEMA_INVALID"),
    ready: oneOf(x.ready, READY_FILTER, "ARGUMENT_SCHEMA_INVALID"),
    sort: oneOf(x.sort, SORT, "ARGUMENT_SCHEMA_INVALID"),
    limit: integer(x.limit, 1, 20, "ARGUMENT_SCHEMA_INVALID"),
  };
  if (x.query != null) out.query = string(x.query, 160, "ARGUMENT_SCHEMA_INVALID");
  if (x.era != null) out.era = oneOf(x.era, ERAS, "ARGUMENT_SCHEMA_INVALID");
  if (x.genre != null) out.genre = oneOf(x.genre, GENRES, "ARGUMENT_SCHEMA_INVALID");
  if (x.cursor != null) {
    out.cursor = string(x.cursor, 256, "ARGUMENT_SCHEMA_INVALID");
    if (!CURSOR.test(out.cursor)) fail("ARGUMENT_SCHEMA_INVALID");
  }
  return Object.freeze(out);
}
function validateExplanationInput(value) {
  const x = closed(value, ["before", "kinds", "limit"], ["kinds", "limit"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 1024, "ARGUMENTS_TOO_LARGE");
  const out = {
    kinds: uniqueStrings(x.kinds, 4, (v) => oneOf(v, EXPLANATION_KINDS, "ARGUMENT_SCHEMA_INVALID"), "ARGUMENT_SCHEMA_INVALID"),
    limit: integer(x.limit, 1, 20, "ARGUMENT_SCHEMA_INVALID"),
  };
  if (x.before != null) out.before = timestamp(x.before, "ARGUMENT_SCHEMA_INVALID");
  return Object.freeze({ ...out, kinds: Object.freeze(out.kinds) });
}

function validateDueItemsInput(value) {
  const x = closed(value, ["limit", "cursor"], [], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const out = {};
  if (x.limit != null) out.limit = integer(x.limit, 1, 100, "ARGUMENT_SCHEMA_INVALID");
  // Decode + validate the pagination cursor HERE so a malformed cursor is a
  // clean client ARGUMENT_SCHEMA_INVALID (retryable:false) instead of reaching
  // the handler as INTERNAL_ERROR — the latter makes clients retry and can trip
  // their transport circuit breaker (Hermes-observed).
  if (x.cursor != null) {
    out.cursor = string(x.cursor, 256, "ARGUMENT_SCHEMA_INVALID");
    if (!CURSOR.test(out.cursor)) fail("ARGUMENT_SCHEMA_INVALID");
    let decoded = "";
    try { decoded = Buffer.from(out.cursor, "base64url").toString("utf8"); } catch (_) { fail("ARGUMENT_SCHEMA_INVALID"); }
    const m = /^o(\d{1,6})$/.exec(decoded);
    if (!m || Number(m[1]) > 500) fail("ARGUMENT_SCHEMA_INVALID");
    out.cursor_offset = Number(m[1]);
  }
  return Object.freeze(out);
}

function dueReviewItems(value) {
  const keys = ["schema_version", "items", "due_total", "next_cursor", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 24576, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.due_review_items.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  integer(x.due_total, 0, 100000); timestamp(x.generated_at);
  if (x.next_cursor !== null && (typeof x.next_cursor !== "string" || !CURSOR.test(x.next_cursor))) fail("OUTPUT_SCHEMA_INVALID");
  if (!Array.isArray(x.items) || x.items.length > 100) fail("OUTPUT_SCHEMA_INVALID");
  const itemKeys = ["display", "gloss", "struggle", "due_day", "content_available"];
  const items = x.items.map((row) => {
    const r = closed(row, itemKeys, itemKeys, "OUTPUT_SCHEMA_INVALID");
    string(r.display, 64); // HE lemma display form; never the acceptance set (no expected/alts)
    if (r.gloss !== null) string(r.gloss, 120);
    oneOf(r.struggle, STRUGGLE); bool(r.content_available);
    if (typeof r.due_day !== "string" || !DAY_RE.test(r.due_day)) fail("OUTPUT_SCHEMA_INVALID");
    return Object.freeze({ ...r });
  });
  if (items.length > x.due_total) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x, items: Object.freeze(items) });
}

function validateExplanationBodyInput(value) {
  const x = closed(value, ["explanation_id"], ["explanation_id"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 256, "ARGUMENTS_TOO_LARGE");
  return Object.freeze({ explanation_id: id(x.explanation_id, "ARGUMENT_SCHEMA_INVALID") });
}
function explanationBody(value) {
  const keys = ["schema_version", "explanation_id", "created_at", "kind", "purge_state", "language", "text", "lines", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 8192, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.explanation_body.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  id(x.explanation_id); timestamp(x.created_at); timestamp(x.generated_at); oneOf(x.purge_state, PURGE_STATES);
  if (x.kind !== null) oneOf(x.kind, EXPLANATION_KINDS);
  if (x.language !== null) string(x.language, 8);
  if (x.text !== null) string(x.text, 6000);
  if (x.lines !== null) {
    if (!Array.isArray(x.lines) || x.lines.length > 8) fail("OUTPUT_SCHEMA_INVALID");
    x.lines.forEach((row) => { const r = closed(row, ["he", "ru"], ["he", "ru"], "OUTPUT_SCHEMA_INVALID"); string(r.he, 500); if (r.ru !== null) string(r.ru, 500); });
  }
  // Tombstone: a purged explanation must expose no content and no kind.
  if (x.purge_state === "PURGED" && (x.kind !== null || x.text !== null || x.lines !== null || x.language !== null)) fail("OUTPUT_SCHEMA_INVALID");
  if (x.purge_state === "AVAILABLE" && x.kind === null) fail("OUTPUT_SCHEMA_INVALID");
  if (x.text !== null && x.lines !== null) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x, lines: x.lines === null ? null : Object.freeze(x.lines.map((r) => Object.freeze({ ...r }))) });
}

function workId(v, code = "ARGUMENT_SCHEMA_INVALID") { const s = string(v, 8, code); if (!WORK_ID_RE.test(s)) fail(code); return s; }
function textKey(v, code = "ARGUMENT_SCHEMA_INVALID") { const s = string(v, 64, code); if (!TEXT_KEY_RE.test(s.toLowerCase())) fail(code); return s.toLowerCase(); }

function validateReadingContentInput(value) {
  const x = closed(value, ["work_id", "text_key", "start", "rows"], ["work_id"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const out = { work_id: workId(x.work_id) };
  if (x.text_key != null) out.text_key = textKey(x.text_key);
  if (x.start != null) out.start = integer(x.start, 0, 1000000, "ARGUMENT_SCHEMA_INVALID");
  if (x.rows != null) out.rows = integer(x.rows, 1, 20, "ARGUMENT_SCHEMA_INVALID");
  return Object.freeze(out);
}
function readingContent(value) {
  const keys = ["schema_version", "work", "anchor", "rows", "available_text_keys", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 16384, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.reading_content.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  timestamp(x.generated_at);
  const w = closed(x.work, ["title", "author", "era", "license"], ["title", "author", "era", "license"], "OUTPUT_SCHEMA_INVALID");
  if (w.title !== null) string(w.title, 200); if (w.author !== null) string(w.author, 200);
  if (w.era !== null) oneOf(w.era, ERAS); if (w.license !== "public-domain") fail("OUTPUT_SCHEMA_INVALID");
  const a = closed(x.anchor, ["work_id", "text_key", "start_order_index", "row_count"], ["work_id", "text_key", "start_order_index", "row_count"], "OUTPUT_SCHEMA_INVALID");
  if (!WORK_ID_RE.test(String(a.work_id)) || !TEXT_KEY_RE.test(String(a.text_key))) fail("OUTPUT_SCHEMA_INVALID");
  integer(a.start_order_index, 0, 1000000); integer(a.row_count, 0, 20);
  if (!Array.isArray(x.rows) || x.rows.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  const rows = x.rows.map((row) => { const r = closed(row, ["order_index", "he", "ru"], ["order_index", "he", "ru"], "OUTPUT_SCHEMA_INVALID"); integer(r.order_index, 0, 1000000); string(r.he, 400); if (r.ru !== null) string(r.ru, 400); return Object.freeze({ ...r }); });
  if (!Array.isArray(x.available_text_keys) || x.available_text_keys.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  x.available_text_keys.forEach((k) => { if (!TEXT_KEY_RE.test(String(k))) fail("OUTPUT_SCHEMA_INVALID"); });
  return Object.freeze({ ...x, work: Object.freeze({ ...w }), anchor: Object.freeze({ ...a }), rows: Object.freeze(rows), available_text_keys: Object.freeze([...x.available_text_keys]) });
}

// S-пакет S1 — list_personal_texts (PERSONAL_TEXTS_S1S2_DESIGN §1.2). Каталог синкованных
// личных текстов из sidecar-меты; НИКАКОГО контента. title nullable — мета может отсутствовать
// у битого payload'а: деградация одной строки, не отказ всего списка (урок silent-batch).
// Свежесть: content_updated_at (client-claimed LWW) + replica_ingested_at (server-set) +
// authority-константа: сервер — LWW-реплика, истина живёт на устройстве владельца.
function personalTextKey(v, code = "ARGUMENT_SCHEMA_INVALID") { const s = string(v, 200, code); if (!PERSONAL_TEXT_KEY_RE.test(s)) fail(code); return s; }

function validatePersonalTextsListInput(value) {
  const x = closed(value, ["limit", "cursor"], [], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const out = {};
  if (x.limit != null) out.limit = integer(x.limit, 1, 100, "ARGUMENT_SCHEMA_INVALID");
  // Курсор декодируется и валидируется ЗДЕСЬ (паттерн validateDueItemsInput): кривой курсор =
  // чистый клиентский ARGUMENT_SCHEMA_INVALID, не INTERNAL_ERROR-ретраи у транспорта Hermes.
  if (x.cursor != null) {
    out.cursor = string(x.cursor, 256, "ARGUMENT_SCHEMA_INVALID");
    if (!CURSOR.test(out.cursor)) fail("ARGUMENT_SCHEMA_INVALID");
    let decoded = "";
    try { decoded = Buffer.from(out.cursor, "base64url").toString("utf8"); } catch (_) { fail("ARGUMENT_SCHEMA_INVALID"); }
    const m = /^o(\d{1,6})$/.exec(decoded);
    if (!m || Number(m[1]) > 2000) fail("ARGUMENT_SCHEMA_INVALID");   // MAX_ARTIFACTS_PER_USER
    out.cursor_offset = Number(m[1]);
  }
  return Object.freeze(out);
}
function personalTextsList(value) {
  const keys = ["schema_version", "items", "total", "next_cursor", "authority", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 24576, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.personal_texts_list.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  if (x.authority !== "OWNER_DEVICE_CANONICAL") fail("OUTPUT_SCHEMA_INVALID");
  integer(x.total, 0, 100000); timestamp(x.generated_at);
  if (x.next_cursor !== null && (typeof x.next_cursor !== "string" || !CURSOR.test(x.next_cursor))) fail("OUTPUT_SCHEMA_INVALID");
  if (!Array.isArray(x.items) || x.items.length > 100) fail("OUTPUT_SCHEMA_INVALID");
  const itemKeys = ["text_key", "title", "rows_count", "content_updated_at", "replica_ingested_at"];
  const items = x.items.map((row) => {
    const r = closed(row, itemKeys, itemKeys, "OUTPUT_SCHEMA_INVALID");
    personalTextKey(r.text_key, "OUTPUT_SCHEMA_INVALID");
    if (r.title !== null) string(r.title, 512);   // char-slice(0,128) меты ≤ 512 байт UTF-8
    if (r.rows_count !== null) integer(r.rows_count, 0, 1000000);
    timestamp(r.content_updated_at); timestamp(r.replica_ingested_at);
    return Object.freeze({ ...r });
  });
  if (items.length > x.total) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x, items: Object.freeze(items) });
}

// S2 — get_personal_text_content (DESIGN §2.3): bounded-окно ТЕЛА личного текста, только по
// живому agent_text_grants поверх scope (трёхслойный гейт в хендлере). Per-row byte-caps;
// адаптивное сужение до капа — на стороне хендлера (has_more двигается честно).
function validatePersonalTextContentInput(value) {
  const x = closed(value, ["text_key", "from", "rows"], ["text_key"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const out = { text_key: personalTextKey(x.text_key) };
  if (x.from != null) out.from = integer(x.from, 0, 1000000, "ARGUMENT_SCHEMA_INVALID");
  if (x.rows != null) out.rows = integer(x.rows, 1, 20, "ARGUMENT_SCHEMA_INVALID");
  return Object.freeze(out);
}

// H2.1 — malformed/non-Hebrew words are a stable AA_INVALID_INPUT client
// error; an unknown but valid Hebrew word is handled normally as UNRESOLVED.
function validateWordMorphologyInput(value) {
  const x = closed(value, ["word", "context_sentence"], ["word"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 2048, "ARGUMENTS_TOO_LARGE");
  if (typeof x.word !== "string" || [...x.word].length < 1 || [...x.word].length > 40
    || !HEBREW_WORD_RE.test(x.word) || !/[א-ת]/.test(x.word)) fail("AA_INVALID_INPUT");
  const out = { word: x.word.normalize("NFC") };
  if (x.context_sentence != null) {
    if (typeof x.context_sentence !== "string" || !x.context_sentence.length || [...x.context_sentence].length > 280
      || Buffer.byteLength(x.context_sentence, "utf8") > 1120) fail("AA_INVALID_INPUT");
    out.context_sentence = x.context_sentence.normalize("NFC");
  }
  return Object.freeze(out);
}

function wordMorphology(value) {
  const keys = ["schema_version", "resolution", "entries", "unresolved_reason", "resolver_version", "dataset_version", "generated_at"];
  const required = ["schema_version", "resolution", "entries", "resolver_version", "dataset_version", "generated_at"];
  const x = closed(value, keys, required, "OUTPUT_SCHEMA_INVALID"); bytes(x, 8192, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.word_morphology.1.0.0" || x.dataset_version !== "pealim-infl-v12") fail("OUTPUT_SCHEMA_INVALID");
  oneOf(x.resolution, MORPH_RESOLUTION); id(x.resolver_version); timestamp(x.generated_at);
  if (!Array.isArray(x.entries) || x.entries.length > 5) fail("OUTPUT_SCHEMA_INVALID");
  const entryKeys = ["lemma", "root", "pos", "binyan", "mishkal", "gender", "number", "person", "tense", "niqqud_form", "gloss_ru", "confidence", "provenance"];
  const entries = x.entries.map((row) => {
    const r = closed(row, entryKeys, ["lemma", "pos", "confidence", "provenance"], "OUTPUT_SCHEMA_INVALID");
    string(r.lemma, 160); oneOf(r.pos, MORPH_POS); oneOf(r.confidence, MORPH_CONFIDENCE);
    if (r.provenance !== "PEALIM_OFFLINE_V12") fail("OUTPUT_SCHEMA_INVALID");
    if (r.root != null) string(r.root, 80); if (r.binyan != null) oneOf(r.binyan, MORPH_BINYAN);
    if (r.mishkal != null) string(r.mishkal, 80); if (r.gender != null) oneOf(r.gender, MORPH_GENDER);
    if (r.number != null) oneOf(r.number, MORPH_NUMBER); if (r.person != null) oneOf(r.person, MORPH_PERSON);
    if (r.tense != null) oneOf(r.tense, MORPH_TENSE); if (r.niqqud_form != null) string(r.niqqud_form, 160);
    if (r.gloss_ru != null) string(r.gloss_ru, 800);
    return Object.freeze({ ...r });
  });
  if (x.unresolved_reason != null) oneOf(x.unresolved_reason, MORPH_UNRESOLVED);
  if (x.resolution === "UNRESOLVED" && (entries.length !== 0 || !x.unresolved_reason)) fail("OUTPUT_SCHEMA_INVALID");
  if (x.resolution === "AMBIGUOUS" && (entries.length < 2 || x.unresolved_reason !== "AMBIGUOUS_WITHOUT_CONTEXT")) fail("OUTPUT_SCHEMA_INVALID");
  if (x.resolution === "EXACT" && (entries.length !== 1 || x.unresolved_reason != null)) fail("OUTPUT_SCHEMA_INVALID");
  if (x.resolution !== "EXACT" && entries.some((entry) => entry.confidence === "EXACT")) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x, entries: Object.freeze(entries) });
}

// H2.2 — exactly one source namespace: work_id is the public Ben-Yehuda
// corpus, text_key is an owner-synced personal text. The latter's grant gate is
// in the production handler, not expressible in a JSON argument schema.
function validateTextCoverageInput(value) {
  const x = closed(value, ["target", "top_unknown_limit"], ["target"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const target = closed(x.target, ["work_id", "text_key"], [], "ARGUMENT_SCHEMA_INVALID");
  const count = Number(target.work_id != null) + Number(target.text_key != null);
  if (count !== 1) fail("AA_INVALID_INPUT");
  const outTarget = {};
  if (target.work_id != null) outTarget.work_id = workId(target.work_id, "AA_INVALID_INPUT");
  if (target.text_key != null) outTarget.text_key = personalTextKey(target.text_key, "AA_INVALID_INPUT");
  const out = { target: Object.freeze(outTarget) };
  if (x.top_unknown_limit != null) out.top_unknown_limit = integer(x.top_unknown_limit, 1, 20, "AA_INVALID_INPUT");
  return Object.freeze(out);
}

function groupId(value, code = "ARGUMENT_SCHEMA_INVALID") {
  const s = string(value, 128, code);
  if (!GROUP_ID_RE.test(s)) fail(code);
  return s;
}

const GROUP_AUDIO = new Set(["ANY", "AVAILABLE", "UNAVAILABLE"]);
const GROUP_SORT = new Set(["RELEVANCE", "POSITION", "TITLE", "ROWS_ASC", "ROWS_DESC"]);
function validateGroupSearchInput(value) {
  const x = closed(value, ["corpus_id", "query", "level", "tag", "audio", "sort", "cursor", "limit"], ["audio", "sort", "limit"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 1024, "ARGUMENTS_TOO_LARGE");
  const out = { audio: oneOf(x.audio, GROUP_AUDIO, "ARGUMENT_SCHEMA_INVALID"), sort: oneOf(x.sort, GROUP_SORT, "ARGUMENT_SCHEMA_INVALID"), limit: integer(x.limit, 1, 20, "ARGUMENT_SCHEMA_INVALID") };
  if (x.corpus_id != null) out.corpus_id = groupId(x.corpus_id);
  if (x.query != null) out.query = string(x.query, 160, "ARGUMENT_SCHEMA_INVALID");
  if (x.level != null) out.level = string(x.level, 40, "ARGUMENT_SCHEMA_INVALID");
  if (x.tag != null) out.tag = string(x.tag, 80, "ARGUMENT_SCHEMA_INVALID");
  if (x.cursor != null) {
    if (typeof x.cursor !== "string" || !/^\d{1,6}$/.test(x.cursor)) fail("ARGUMENT_SCHEMA_INVALID");
    out.cursor_offset = integer(Number(x.cursor), 0, 999999, "ARGUMENT_SCHEMA_INVALID");
  }
  return Object.freeze(out);
}

function validateGroupContentInput(value) {
  const x = closed(value, ["corpus_id", "work_id", "start", "rows"], ["corpus_id", "work_id"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const out = { corpus_id: groupId(x.corpus_id), work_id: groupId(x.work_id) };
  if (x.start != null) out.start = integer(x.start, 0, 1000000, "ARGUMENT_SCHEMA_INVALID");
  if (x.rows != null) out.rows = integer(x.rows, 1, 20, "ARGUMENT_SCHEMA_INVALID");
  return Object.freeze(out);
}

function validateGroupCoverageInput(value) {
  const x = closed(value, ["corpus_id", "work_id", "top_unknown_limit"], ["corpus_id", "work_id"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const out = { corpus_id: groupId(x.corpus_id), work_id: groupId(x.work_id) };
  if (x.top_unknown_limit != null) out.top_unknown_limit = integer(x.top_unknown_limit, 1, 20, "ARGUMENT_SCHEMA_INVALID");
  return Object.freeze(out);
}

function textCoverage(value) {
  const metricKeys = ["counts", "recorded_familiar_pct_lower_bound", "unresolved_uncertainty_pp", "rank_eligible", "top_unknown"];
  const keys = ["schema_version", "status", "reason_code", ...metricKeys,
    "learner_projection_version", "tokenizer_version", "resolver_version", "generated_at"];
  const base = ["schema_version", "status", "reason_code", ...metricKeys,
    "learner_projection_version", "tokenizer_version", "resolver_version", "generated_at"];
  const x = closed(value, keys, base, "OUTPUT_SCHEMA_INVALID"); bytes(x, 8192, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.text_coverage.2.0.0") fail("OUTPUT_SCHEMA_INVALID");
  oneOf(x.status, COVERAGE_STATUS); string(x.learner_projection_version, 120);
  string(x.reason_code, 80); string(x.tokenizer_version, 80); string(x.resolver_version, 160); timestamp(x.generated_at);
  bool(x.rank_eligible);
  const available = x.status === "AVAILABLE" || x.status === "AVAILABLE_LIMITED";
  let counts = null;
  if (available) {
    counts = closed(x.counts, ["lexical_total", "eligible_denominator", "familiar", "explicit_new", "untracked", "unresolved", "ignored_excluded", "proper_names_excluded"],
      ["lexical_total", "eligible_denominator", "familiar", "explicit_new", "untracked", "unresolved", "ignored_excluded", "proper_names_excluded"], "OUTPUT_SCHEMA_INVALID");
    for (const key of Object.keys(counts)) integer(counts[key], 0, 1000000, "OUTPUT_SCHEMA_INVALID");
    if (counts.familiar + counts.explicit_new + counts.untracked + counts.unresolved !== counts.eligible_denominator) fail("OUTPUT_SCHEMA_INVALID");
    if (counts.eligible_denominator + counts.ignored_excluded + counts.proper_names_excluded !== counts.lexical_total) fail("OUTPUT_SCHEMA_INVALID");
    decimal(x.recorded_familiar_pct_lower_bound, 0, 100, "OUTPUT_SCHEMA_INVALID");
    decimal(x.unresolved_uncertainty_pp, 0, 100, "OUTPUT_SCHEMA_INVALID");
  } else if (x.counts !== null || x.recorded_familiar_pct_lower_bound !== null || x.unresolved_uncertainty_pp !== null || x.rank_eligible) fail("OUTPUT_SCHEMA_INVALID");
  if (!Array.isArray(x.top_unknown) || x.top_unknown.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  const top = x.top_unknown.map((row) => {
    const r = closed(row, ["lemma", "freq_in_text", "gloss_ru"], ["lemma", "freq_in_text"], "OUTPUT_SCHEMA_INVALID");
    string(r.lemma, 160); integer(r.freq_in_text, 1, 1000000, "OUTPUT_SCHEMA_INVALID");
    if (r.gloss_ru != null) string(r.gloss_ru, 800);
    return Object.freeze({ ...r });
  });
  return Object.freeze({ ...x, counts: counts ? Object.freeze({ ...counts }) : null, top_unknown: Object.freeze(top) });
}

function groupSearch(value) {
  const keys = ["schema_version", "results", "next_cursor", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 12288, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.group_reading_search.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  timestamp(x.generated_at);
  if (x.next_cursor !== null && (typeof x.next_cursor !== "string" || !/^\d{1,6}$/.test(x.next_cursor))) fail("OUTPUT_SCHEMA_INVALID");
  if (!Array.isArray(x.results) || x.results.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  const rowKeys = ["corpus_id", "corpus_title", "corpus_version", "work_id", "title", "artist", "position_no", "rows_count", "audio_available", "level", "topic", "tags", "access", "first_party_path"];
  const results = x.results.map((row) => {
    const r = closed(row, rowKeys, rowKeys, "OUTPUT_SCHEMA_INVALID");
    groupId(r.corpus_id, "OUTPUT_SCHEMA_INVALID"); groupId(r.work_id, "OUTPUT_SCHEMA_INVALID");
    string(r.corpus_title, 240); integer(r.corpus_version, 1, 1000000); string(r.title, 500);
    if (r.artist !== null) string(r.artist, 300); if (r.position_no !== null) integer(r.position_no, 0, 1000000);
    integer(r.rows_count, 0, 1000000); bool(r.audio_available);
    if (r.level !== null) string(r.level, 40); if (r.topic !== null) string(r.topic, 200);
    uniqueStrings(r.tags, 20, (tag) => string(tag, 80));
    if (r.access !== "GROUP_RESTRICTED" || r.first_party_path !== "/library.html") fail("OUTPUT_SCHEMA_INVALID");
    return Object.freeze({ ...r, tags: Object.freeze([...r.tags]) });
  });
  if (new Set(results.map((r) => `${r.corpus_id}\0${r.work_id}`)).size !== results.length) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x, results: Object.freeze(results) });
}

function groupContent(value) {
  const keys = ["schema_version", "corpus", "work", "anchor", "rows", "rows_total", "has_more", "authority", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 16384, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.group_reading_content.1.0.0" || x.authority !== "GROUP_CORPUS_SERVER_CANONICAL") fail("OUTPUT_SCHEMA_INVALID");
  const corpus = closed(x.corpus, ["corpus_id", "title", "version", "access"], ["corpus_id", "title", "version", "access"], "OUTPUT_SCHEMA_INVALID");
  groupId(corpus.corpus_id, "OUTPUT_SCHEMA_INVALID"); string(corpus.title, 240); integer(corpus.version, 1, 1000000); if (corpus.access !== "GROUP_RESTRICTED") fail("OUTPUT_SCHEMA_INVALID");
  const work = closed(x.work, ["work_id", "title", "artist", "source_url", "rights_status"], ["work_id", "title", "artist", "source_url", "rights_status"], "OUTPUT_SCHEMA_INVALID");
  groupId(work.work_id, "OUTPUT_SCHEMA_INVALID"); string(work.title, 500); if (work.artist !== null) string(work.artist, 300); if (work.source_url !== null) string(work.source_url, 1000); oneOf(work.rights_status, new Set(["REVIEW_REQUIRED", "CLEARED"]));
  const anchor = closed(x.anchor, ["corpus_id", "work_id", "start_order_index", "row_count"], ["corpus_id", "work_id", "start_order_index", "row_count"], "OUTPUT_SCHEMA_INVALID");
  if (anchor.corpus_id !== corpus.corpus_id || anchor.work_id !== work.work_id) fail("OUTPUT_SCHEMA_INVALID");
  integer(anchor.start_order_index, 0, 1000000); integer(anchor.row_count, 0, 20);
  integer(x.rows_total, 0, 1000000); bool(x.has_more); timestamp(x.generated_at);
  if (!Array.isArray(x.rows) || x.rows.length > 20 || x.rows.length !== anchor.row_count) fail("OUTPUT_SCHEMA_INVALID");
  const rows = x.rows.map((row) => { const r = closed(row, ["order_index", "he", "ru"], ["order_index", "he", "ru"], "OUTPUT_SCHEMA_INVALID"); integer(r.order_index, 0, 1000000); string(r.he, 800); if (r.ru !== null) string(r.ru, 800); return Object.freeze({ ...r }); });
  return Object.freeze({ ...x, corpus: Object.freeze({ ...corpus }), work: Object.freeze({ ...work }), anchor: Object.freeze({ ...anchor }), rows: Object.freeze(rows) });
}

function groupTextCoverage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("OUTPUT_SCHEMA_INVALID");
  bytes(value, 8192, "OUTPUT_TOO_LARGE");
  const target = closed(value.target, ["corpus_id", "work_id", "title"], ["corpus_id", "work_id", "title"], "OUTPUT_SCHEMA_INVALID");
  groupId(target.corpus_id, "OUTPUT_SCHEMA_INVALID"); groupId(target.work_id, "OUTPUT_SCHEMA_INVALID"); string(target.title, 500);
  const core = { ...value }; delete core.target; core.schema_version = "aa.text_coverage.2.0.0";
  const validated = textCoverage(core);
  if (value.schema_version !== "aa.group_text_coverage.2.0.0") fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...validated, schema_version: value.schema_version, target: Object.freeze({ ...target }) });
}
function personalTextContent(value) {
  const keys = ["schema_version", "text_key", "title", "rows", "rows_total", "has_more", "content_updated_at", "replica_ingested_at", "authority", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 16384, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.personal_text_content.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  personalTextKey(x.text_key, "OUTPUT_SCHEMA_INVALID");
  if (x.title !== null) string(x.title, 512);
  if (x.authority !== "OWNER_DEVICE_CANONICAL") fail("OUTPUT_SCHEMA_INVALID");
  integer(x.rows_total, 0, 1000000); bool(x.has_more);
  timestamp(x.content_updated_at); timestamp(x.replica_ingested_at); timestamp(x.generated_at);
  if (!Array.isArray(x.rows) || x.rows.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  const rows = x.rows.map((row) => {
    const r = closed(row, ["order_index", "he", "ru"], ["order_index", "he", "ru"], "OUTPUT_SCHEMA_INVALID");
    integer(r.order_index, 0, 1000000); string(r.he, 800); if (r.ru !== null) string(r.ru, 800);
    return Object.freeze({ ...r });
  });
  return Object.freeze({ ...x, rows: Object.freeze(rows) });
}

// AA3 commit 3c — propose_action. Per-kind CLOSED payload schema (R14: no
// cross-kind field bleed; the MCP JSON schema is a stable superset, exact
// closedness is enforced HERE). The returned payload is the NORMALIZED object
// the handler stores — never the raw agent bytes. No dedupe field exists in
// the input by construction (server derives it, R17).
const PROPOSAL_KINDS = new Set(["open_reading", "note", "suggestion"]);
const PROPOSAL_ID_RE = /^ap_[a-f0-9]{32}$/;
function validateProposeInput(value) {
  const x = closed(value, ["kind", "payload"], ["kind", "payload"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 3072, "ARGUMENTS_TOO_LARGE");
  const kind = oneOf(x.kind, PROPOSAL_KINDS, "ARGUMENT_SCHEMA_INVALID");
  let payload;
  if (kind === "open_reading") {
    const y = closed(x.payload, ["work_id", "text_key", "order_index", "reason"], ["work_id"], "ARGUMENT_SCHEMA_INVALID");
    payload = { work_id: workId(y.work_id) };
    if (y.text_key != null) payload.text_key = textKey(y.text_key);
    if (y.order_index != null) payload.order_index = integer(y.order_index, 0, 1000000, "ARGUMENT_SCHEMA_INVALID");
    if (y.reason != null) payload.reason = string(y.reason, 280, "ARGUMENT_SCHEMA_INVALID");
  } else if (kind === "note") {
    const y = closed(x.payload, ["title", "body"], ["body"], "ARGUMENT_SCHEMA_INVALID");
    payload = { body: string(y.body, 2000, "ARGUMENT_SCHEMA_INVALID") };
    if (y.title != null) payload.title = string(y.title, 160, "ARGUMENT_SCHEMA_INVALID");
  } else {
    const y = closed(x.payload, ["body"], ["body"], "ARGUMENT_SCHEMA_INVALID");
    payload = { body: string(y.body, 2000, "ARGUMENT_SCHEMA_INVALID") };
  }
  return Object.freeze({ kind, payload: Object.freeze(payload) });
}
function proposal(value) {
  const keys = ["schema_version", "proposal_id", "kind", "status", "expires_at", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 1024, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.proposal.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  if (typeof x.proposal_id !== "string" || !PROPOSAL_ID_RE.test(x.proposal_id)) fail("OUTPUT_SCHEMA_INVALID");
  oneOf(x.kind, PROPOSAL_KINDS);
  // The agent may see PENDING or (deny-cooldown transparency) DENIED — NEVER
  // CONFIRMED: confirmation state does not flow back through the propose channel.
  if (x.status !== "PENDING" && x.status !== "DENIED") fail("OUTPUT_SCHEMA_INVALID");
  timestamp(x.expires_at); timestamp(x.generated_at);
  return Object.freeze({ ...x });
}

function validateProposeImportInput(value) {
  const x = closed(value, ["source","body_preview","language","niqqud_status","transformation_disclosure","reason"], ["source","body_preview","language","niqqud_status","reason"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 16384, "ARGUMENTS_TOO_LARGE");
  const s = closed(x.source, ["url","title","author","origin"], ["title","origin"], "ARGUMENT_SCHEMA_INVALID");
  const source = { title: string(s.title, 600, "ARGUMENT_SCHEMA_INVALID"), origin: oneOf(s.origin, IMPORT_ORIGINS, "ARGUMENT_SCHEMA_INVALID") };
  if (s.url != null) source.url = string(s.url, 2000, "ARGUMENT_SCHEMA_INVALID");
  if (s.author != null) source.author = string(s.author, 360, "ARGUMENT_SCHEMA_INVALID");
  if (!["AGENT_COMPOSED","OWNER_SUPPLIED"].includes(source.origin) && !source.url) fail("AA_INVALID_INPUT");
  if (String(s.title).length > 200 || (s.author != null && String(s.author).length > 120) || (s.url != null && String(s.url).length > 500) || String(x.body_preview || "").length > 4000 || String(x.reason || "").length > 280 || (x.transformation_disclosure != null && String(x.transformation_disclosure).length > 500)) fail("AA_INVALID_INPUT");
  const out = { source: Object.freeze(source), body_preview: string(x.body_preview, 12000, "AA_INVALID_INPUT"), language: oneOf(x.language, new Set(["he"]), "AA_INVALID_INPUT"), niqqud_status: oneOf(x.niqqud_status, NIQQUD_STATES, "AA_INVALID_INPUT"), reason: string(x.reason, 840, "AA_INVALID_INPUT") };
  if (x.transformation_disclosure != null) out.transformation_disclosure = string(x.transformation_disclosure, 1500, "AA_INVALID_INPUT");
  return Object.freeze(out);
}
function validateProposeTrackInput(value) {
  const x = closed(value, ["items"], ["items"], "ARGUMENT_SCHEMA_INVALID"); bytes(x, 16384, "ARGUMENTS_TOO_LARGE");
  if (!Array.isArray(x.items) || x.items.length < 1 || x.items.length > 10) fail("AA_INVALID_INPUT");
  const items = x.items.map((raw) => {
    const y = closed(raw, ["surface","lemma_hint","evidence","caveat","context_snippet","reason"], ["surface","evidence","reason"], "ARGUMENT_SCHEMA_INVALID");
    if (String(y.surface || "").length > 40 || String(y.reason || "").length > 200 || (y.lemma_hint != null && String(y.lemma_hint).length > 40) || (y.context_snippet != null && String(y.context_snippet).length > 200)) fail("AA_INVALID_INPUT");
    const z = { surface: string(y.surface, 120, "AA_INVALID_INPUT"), evidence: oneOf(y.evidence, TRACK_EVIDENCE, "AA_INVALID_INPUT"), reason: string(y.reason, 600, "AA_INVALID_INPUT") };
    if (y.lemma_hint != null) z.lemma_hint = string(y.lemma_hint, 120, "AA_INVALID_INPUT");
    if (y.caveat != null) z.caveat = oneOf(y.caveat, TRACK_CAVEATS, "AA_INVALID_INPUT");
    if (y.context_snippet != null) z.context_snippet = string(y.context_snippet, 600, "AA_INVALID_INPUT");
    return Object.freeze(z);
  });
  return Object.freeze({ items: Object.freeze(items) });
}
function validateProposeGoalInput(value) {
  const x = closed(value, ["statement","goal_type","anchor","period_days","reason"], ["statement","goal_type","period_days","reason"], "ARGUMENT_SCHEMA_INVALID"); bytes(x, 4096, "ARGUMENTS_TOO_LARGE");
  if (String(x.statement || "").length > 280 || String(x.reason || "").length > 200 || (x.anchor != null && String(x.anchor).length > 280)) fail("AA_INVALID_INPUT");
  const out = { statement: string(x.statement, 840, "AA_INVALID_INPUT"), goal_type: oneOf(x.goal_type, GOAL_TYPES, "AA_INVALID_INPUT"), period_days: integer(x.period_days, 7, 14, "AA_INVALID_INPUT"), reason: string(x.reason, 600, "AA_INVALID_INPUT") };
  if (x.anchor != null) out.anchor = string(x.anchor, 840, "AA_INVALID_INPUT"); return Object.freeze(out);
}
function h2ProposalOutput(value, schemaVersion, withItems = false) {
  const allowed = ["schema_version","proposal_id","status","duplicate_of_text_key","per_item","generated_at"];
  const x = closed(value, allowed, ["schema_version","proposal_id","status","generated_at"], "OUTPUT_SCHEMA_INVALID"); bytes(x, 4096, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== schemaVersion || typeof x.proposal_id !== "string" || !PROPOSAL_ID_RE.test(x.proposal_id)) fail("OUTPUT_SCHEMA_INVALID");
  oneOf(x.status, new Set(["PENDING","DUPLICATE"]), "OUTPUT_SCHEMA_INVALID"); timestamp(x.generated_at);
  if (x.duplicate_of_text_key != null) string(x.duplicate_of_text_key, 200, "OUTPUT_SCHEMA_INVALID");
  if (withItems) {
    if (!Array.isArray(x.per_item) || x.per_item.length < 1 || x.per_item.length > 10) fail("OUTPUT_SCHEMA_INVALID");
    x.per_item.forEach((r) => { const y=closed(r,["surface","resolution"],["surface","resolution"],"OUTPUT_SCHEMA_INVALID"); string(y.surface,120,"OUTPUT_SCHEMA_INVALID"); oneOf(y.resolution,new Set(["RESOLVED","UNRESOLVED_IN_DICTIONARY"]),"OUTPUT_SCHEMA_INVALID"); });
  } else if (x.per_item != null) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x });
}
function currentGoal(value) {
  const x=closed(value,["schema_version","goal","generated_at"],["schema_version","goal","generated_at"],"OUTPUT_SCHEMA_INVALID"); bytes(x,2048,"OUTPUT_TOO_LARGE");
  if(x.schema_version!=="aa.current_goal.1.0.0")fail("OUTPUT_SCHEMA_INVALID"); timestamp(x.generated_at);
  if(x.goal!==null){const g=closed(x.goal,["statement","goal_type","anchor","week_start","status","source"],["statement","goal_type","week_start","status","source"],"OUTPUT_SCHEMA_INVALID");string(g.statement,840,"OUTPUT_SCHEMA_INVALID");oneOf(g.goal_type,GOAL_TYPES,"OUTPUT_SCHEMA_INVALID");if(g.anchor!=null)string(g.anchor,840,"OUTPUT_SCHEMA_INVALID");if(typeof g.week_start!=="string"||!DAY_RE.test(g.week_start))fail("OUTPUT_SCHEMA_INVALID");oneOf(g.status,new Set(["ACTIVE","COMPLETED_SELF_REPORT","DROPPED"]),"OUTPUT_SCHEMA_INVALID");oneOf(g.source,new Set(["OWNER","AGENT_PROPOSED_OWNER_CONFIRMED"]),"OUTPUT_SCHEMA_INVALID");}
  return Object.freeze({ ...x });
}

function validateHandoffInput(value) {
  const x = closed(value, ["work_id", "text_key", "order_index"], ["work_id"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 512, "ARGUMENTS_TOO_LARGE");
  const out = { work_id: workId(x.work_id) };
  if (x.text_key != null) out.text_key = textKey(x.text_key);
  if (x.order_index != null) out.order_index = integer(x.order_index, 0, 1000000, "ARGUMENT_SCHEMA_INVALID");
  return Object.freeze(out);
}
function readingHandoff(value) {
  const keys = ["schema_version", "handoff_url", "expires_in_ms", "work_id", "text_key", "action", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 1024, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.reading_handoff.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  if (typeof x.handoff_url !== "string" || !HANDOFF_URL_RE.test(x.handoff_url)) fail("OUTPUT_SCHEMA_INVALID"); // canonical origin only, no PII
  integer(x.expires_in_ms, 1, 3600000); if (!WORK_ID_RE.test(String(x.work_id)) || !TEXT_KEY_RE.test(String(x.text_key))) fail("OUTPUT_SCHEMA_INVALID");
  if (x.action !== "open_corpus") fail("OUTPUT_SCHEMA_INVALID"); timestamp(x.generated_at);
  return Object.freeze({ ...x });
}

// AA4 slice 4a — progress delta. Input: strict ISO shape here (clock-free —
// contracts have no clock); the [now-90d, now] window check lives in the
// handler as typed AA_ACTIVITY_SINCE_OUT_OF_RANGE (retryable:false).
function validateProgressDeltaInput(value) {
  const x = closed(value, ["since", "top_limit"], ["since"], "ARGUMENT_SCHEMA_INVALID");
  bytes(x, 256, "ARGUMENTS_TOO_LARGE");
  const out = { since: timestamp(x.since, "ARGUMENT_SCHEMA_INVALID") };
  if (x.top_limit != null) out.top_limit = integer(x.top_limit, 1, 20, "ARGUMENT_SCHEMA_INVALID");
  return Object.freeze(out);
}
const CHANNEL_NAME_RE = /^[a-z0-9_-]{1,16}$/;
function progressDelta(value) {
  const keys = ["schema_version", "since", "reviews_total", "skips_total", "distinct_items", "new_items_scheduled", "active_days", "by_channel", "top_items", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 8192, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.progress_delta.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  timestamp(x.since); timestamp(x.generated_at);
  integer(x.reviews_total, 0, 1000000); integer(x.skips_total, 0, 1000000);
  integer(x.distinct_items, 0, 1000000); integer(x.new_items_scheduled, 0, 1000000);
  integer(x.active_days, 0, 100);
  if (!Array.isArray(x.by_channel) || x.by_channel.length > 8) fail("OUTPUT_SCHEMA_INVALID");
  const channels = x.by_channel.map((row) => {
    const r = closed(row, ["channel", "count"], ["channel", "count"], "OUTPUT_SCHEMA_INVALID");
    if (typeof r.channel !== "string" || !CHANNEL_NAME_RE.test(r.channel)) fail("OUTPUT_SCHEMA_INVALID");
    integer(r.count, 1, 1000000);
    return Object.freeze({ ...r });
  });
  if (new Set(channels.map((c) => c.channel)).size !== channels.length) fail("OUTPUT_SCHEMA_INVALID");
  if (!Array.isArray(x.top_items) || x.top_items.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  // Pure activity: display + gloss + times only. NO struggle band, NO grades,
  // NO item_key — the excludes claim in the consent card must stay true.
  const items = x.top_items.map((row) => {
    const r = closed(row, ["display", "gloss", "times"], ["display", "gloss", "times"], "OUTPUT_SCHEMA_INVALID");
    string(r.display, 64);
    if (r.gloss !== null) string(r.gloss, 120);
    integer(r.times, 1, 1000000);
    return Object.freeze({ ...r });
  });
  return Object.freeze({ ...x, by_channel: Object.freeze(channels), top_items: Object.freeze(items) });
}

// AA4 slice 4b-final — anchor-less review handoff (same canonical-origin URL
// shape; action pinned to open_review; deliberately NO due count in the output
// so summary data cannot launder through the mint scope).
function reviewHandoff(value) {
  const keys = ["schema_version", "handoff_url", "expires_in_ms", "action", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 512, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.review_handoff.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  if (typeof x.handoff_url !== "string" || !HANDOFF_URL_RE.test(x.handoff_url)) fail("OUTPUT_SCHEMA_INVALID");
  integer(x.expires_in_ms, 1, 3600000);
  if (x.action !== "open_review") fail("OUTPUT_SCHEMA_INVALID");
  timestamp(x.generated_at);
  return Object.freeze({ ...x });
}

function learnerProfile(value) {
  const keys = ["schema_version", "mode", "language", "depth", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 512, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.learner_profile.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  oneOf(x.mode, PROFILE_MODE); oneOf(x.depth, PROFILE_DEPTH); timestamp(x.generated_at);
  string(x.language, 8);
  // No user_id, goals_json, or timestamps ever leave the boundary.
  return Object.freeze({ ...x });
}

function learningBrief(value) {
  const keys = ["schema_version", "due_total", "urgent_total", "scheduled_total", "estimated_minutes", "priority_code", "unfinished_action_code", "generated_at", "expires_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 1024, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.learning_brief.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  integer(x.due_total, 0, 100000); integer(x.urgent_total, 0, 100000); integer(x.scheduled_total, 0, 100000); integer(x.estimated_minutes, 0, 120);
  oneOf(x.priority_code, PRIORITY); oneOf(x.unfinished_action_code, UNFINISHED); timestamp(x.generated_at); timestamp(x.expires_at);
  if (x.urgent_total > x.due_total || x.due_total > x.scheduled_total) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x });
}
function reviewSummary(value) {
  const keys = ["schema_version", "due_total", "urgent_total", "estimated_minutes", "handoff_eligible", "handoff_scope_available", "generated_at", "expires_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 768, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.review_summary.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  integer(x.due_total, 0, 100000); integer(x.urgent_total, 0, 100000); integer(x.estimated_minutes, 0, 120); bool(x.handoff_eligible); bool(x.handoff_scope_available); timestamp(x.generated_at); timestamp(x.expires_at);
  if (x.urgent_total > x.due_total || x.handoff_eligible || x.handoff_scope_available) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x });
}
function publicSearch(value) {
  const keys = ["schema_version", "catalog_version", "results", "next_cursor", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 12288, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.public_reading_search.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  id(x.catalog_version); timestamp(x.generated_at);
  if (x.next_cursor != null && (!CURSOR.test(string(x.next_cursor, 256)) || x.next_cursor.length > 256)) fail("OUTPUT_SCHEMA_INVALID");
  if (!Array.isArray(x.results) || x.results.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  const resultKeys = ["work_id", "title", "author", "era", "genre", "language", "sentence_count", "audio_available", "ready_state", "first_party_path"];
  const results = x.results.map((row) => {
    const r = closed(row, resultKeys, resultKeys, "OUTPUT_SCHEMA_INVALID");
    id(r.work_id); string(r.title, 240); string(r.author, 200); oneOf(r.era, ERAS); oneOf(r.genre, GENRES); oneOf(r.language, new Set(["he"])); integer(r.sentence_count, 0, 1000000); bool(r.audio_available); oneOf(r.ready_state, READY_STATE);
    if (r.first_party_path !== "/library.html") fail("OUTPUT_SCHEMA_INVALID");
    return Object.freeze({ ...r });
  });
  if (new Set(results.map((r) => r.work_id)).size !== results.length) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x, results: Object.freeze(results) });
}
function explanationMetadata(value) {
  const keys = ["schema_version", "items", "next_before", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 8192, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.explanation_metadata.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  timestamp(x.next_before, "OUTPUT_SCHEMA_INVALID", true); timestamp(x.generated_at);
  if (!Array.isArray(x.items) || x.items.length > 20) fail("OUTPUT_SCHEMA_INVALID");
  const itemKeys = ["explanation_id", "created_at", "kind", "construct_ids", "purge_state"];
  const items = x.items.map((row) => {
    const r = closed(row, itemKeys, itemKeys, "OUTPUT_SCHEMA_INVALID");
    id(r.explanation_id); timestamp(r.created_at); oneOf(r.kind, EXPLANATION_KINDS); uniqueStrings(r.construct_ids, 12, (v) => id(v)); oneOf(r.purge_state, PURGE_STATES);
    return Object.freeze({ ...r, construct_ids: Object.freeze([...r.construct_ids]) });
  });
  if (new Set(items.map((r) => r.explanation_id)).size !== items.length) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x, items: Object.freeze(items) });
}
function connection(value) {
  // Stable contract — AA3 keeps this UNCHANGED. Access-window state moved to the
  // separate additive get_access_window tool so a schema mutation never breaks a
  // client that cached this tool's output with additionalProperties:false.
  const keys = ["schema_version", "connection_id", "oauth_client_id", "client_display_name", "connection_status", "granted_scopes", "access_expires_at", "consent_version", "capability_version", "downstream_retention_notice", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 2048, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.connection.1.0.0" || x.capability_version !== "aa-v0.1" || x.downstream_retention_notice !== "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO") fail("OUTPUT_SCHEMA_INVALID");
  id(x.connection_id); id(x.oauth_client_id); string(x.client_display_name, 120); oneOf(x.connection_status, CONNECTION_STATES); uniqueStrings(x.granted_scopes, 16, (v) => oneOf(v, SCOPES)); timestamp(x.access_expires_at); id(x.consent_version); timestamp(x.generated_at);
  return Object.freeze({ ...x, granted_scopes: Object.freeze([...x.granted_scopes]) });
}
function accessWindow(value) {
  const keys = ["schema_version", "access_lifetime", "window_expires_at", "access_expires_at", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 512, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.access_window.1.0.0") fail("OUTPUT_SCHEMA_INVALID");
  oneOf(x.access_lifetime, ACCESS_LIFETIME); timestamp(x.access_expires_at); timestamp(x.generated_at);
  timestamp(x.window_expires_at, "OUTPUT_SCHEMA_INVALID", true);
  if ((x.access_lifetime === "TIMED_WINDOW") !== (x.window_expires_at !== null)) fail("OUTPUT_SCHEMA_INVALID");
  return Object.freeze({ ...x });
}

const INPUT_VALIDATORS = Object.freeze({
  get_learning_brief: emptyInput,
  get_review_summary: emptyInput,
  search_public_reading_catalog: validateSearchInput,
  get_recent_explanation_metadata: validateExplanationInput,
  get_agent_connection: emptyInput,
  get_access_window: emptyInput,
  get_due_review_items: validateDueItemsInput,
  get_learner_profile: emptyInput,
  get_explanation_body: validateExplanationBodyInput,
  get_reading_content: validateReadingContentInput,
  create_reading_handoff: validateHandoffInput,
  propose_action: validateProposeInput,
  get_progress_delta: validateProgressDeltaInput,
  create_review_handoff: emptyInput,
  list_personal_texts: validatePersonalTextsListInput,
  get_personal_text_content: validatePersonalTextContentInput,
  get_word_morphology: validateWordMorphologyInput,
  get_text_coverage: validateTextCoverageInput,
  search_group_reading_catalog: validateGroupSearchInput,
  get_group_reading_content: validateGroupContentInput,
  get_group_text_coverage: validateGroupCoverageInput,
  propose_import_text: validateProposeImportInput,
  propose_track_word: validateProposeTrackInput,
  propose_goal: validateProposeGoalInput,
  get_current_goal: emptyInput,
});
const OUTPUT_VALIDATORS = Object.freeze({
  get_learning_brief: learningBrief,
  get_review_summary: reviewSummary,
  search_public_reading_catalog: publicSearch,
  get_recent_explanation_metadata: explanationMetadata,
  get_agent_connection: connection,
  get_access_window: accessWindow,
  get_due_review_items: dueReviewItems,
  get_learner_profile: learnerProfile,
  get_explanation_body: explanationBody,
  get_reading_content: readingContent,
  create_reading_handoff: readingHandoff,
  propose_action: proposal,
  get_progress_delta: progressDelta,
  create_review_handoff: reviewHandoff,
  list_personal_texts: personalTextsList,
  get_personal_text_content: personalTextContent,
  get_word_morphology: wordMorphology,
  get_text_coverage: textCoverage,
  search_group_reading_catalog: groupSearch,
  get_group_reading_content: groupContent,
  get_group_text_coverage: groupTextCoverage,
  propose_import_text: (v) => h2ProposalOutput(v, "aa.propose_import_text.1.0.0"),
  propose_track_word: (v) => h2ProposalOutput(v, "aa.propose_track_word.1.0.0", true),
  propose_goal: (v) => h2ProposalOutput(v, "aa.propose_goal.1.0.0"),
  get_current_goal: currentGoal,
});

function validateInput(tool, value) { const fn = INPUT_VALIDATORS[tool]; if (!fn) fail("UNKNOWN_TOOL"); return fn(value); }
function validateOutput(tool, value) { const fn = OUTPUT_VALIDATORS[tool]; if (!fn) fail("UNKNOWN_TOOL"); return fn(value); }

module.exports = {
  CONTRACT_VERSION, MAX_ARGUMENT_BYTES, MAX_PRINCIPAL_BYTES, AgentAccessError,
  SCOPES, CONNECTION_STATES, validatePrincipal, validateInput, validateOutput,
};
