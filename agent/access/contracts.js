"use strict";

const CONTRACT_VERSION = "aa-contracts.1.0.0";
const MAX_ARGUMENT_BYTES = 4096;
const MAX_PRINCIPAL_BYTES = 2048;
const ID = /^[A-Za-z0-9_.:@/-]{1,128}$/;
const CURSOR = /^[A-Za-z0-9_.~:@/+\-=]{1,256}$/;

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
]);

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
    scopes: uniqueStrings(p.scopes, 16, (v) => oneOf(v, SCOPES, "PRINCIPAL_INVALID"), "PRINCIPAL_INVALID"),
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
  const keys = ["schema_version", "connection_id", "oauth_client_id", "client_display_name", "connection_status", "granted_scopes", "access_expires_at", "consent_version", "capability_version", "downstream_retention_notice", "generated_at"];
  const x = closed(value, keys, keys, "OUTPUT_SCHEMA_INVALID"); bytes(x, 2048, "OUTPUT_TOO_LARGE");
  if (x.schema_version !== "aa.connection.1.0.0" || x.capability_version !== "aa-v0.1" || x.downstream_retention_notice !== "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO") fail("OUTPUT_SCHEMA_INVALID");
  id(x.connection_id); id(x.oauth_client_id); string(x.client_display_name, 120); oneOf(x.connection_status, CONNECTION_STATES); uniqueStrings(x.granted_scopes, 16, (v) => oneOf(v, SCOPES)); timestamp(x.access_expires_at); id(x.consent_version); timestamp(x.generated_at);
  return Object.freeze({ ...x, granted_scopes: Object.freeze([...x.granted_scopes]) });
}

const INPUT_VALIDATORS = Object.freeze({
  get_learning_brief: emptyInput,
  get_review_summary: emptyInput,
  search_public_reading_catalog: validateSearchInput,
  get_recent_explanation_metadata: validateExplanationInput,
  get_agent_connection: emptyInput,
});
const OUTPUT_VALIDATORS = Object.freeze({
  get_learning_brief: learningBrief,
  get_review_summary: reviewSummary,
  search_public_reading_catalog: publicSearch,
  get_recent_explanation_metadata: explanationMetadata,
  get_agent_connection: connection,
});

function validateInput(tool, value) { const fn = INPUT_VALIDATORS[tool]; if (!fn) fail("UNKNOWN_TOOL"); return fn(value); }
function validateOutput(tool, value) { const fn = OUTPUT_VALIDATORS[tool]; if (!fn) fail("UNKNOWN_TOOL"); return fn(value); }

module.exports = {
  CONTRACT_VERSION, MAX_ARGUMENT_BYTES, MAX_PRINCIPAL_BYTES, AgentAccessError,
  SCOPES, CONNECTION_STATES, validatePrincipal, validateInput, validateOutput,
};
