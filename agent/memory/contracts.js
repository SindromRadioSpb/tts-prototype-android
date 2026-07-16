"use strict";

const crypto = require("crypto");

const SCHEMA_VERSION = "f1-memory.1.0.0";
const POLICY_VERSION = "f1-memory-policy.1.0.0";
const KINDS = new Set(["declared_goal", "unfinished_thread"]);
const AUTHORITIES = new Set(["USER_DECLARED", "DERIVED_CANDIDATE", "USER_CONFIRMED_DERIVED"]);
const STATUSES = new Set(["PENDING", "ACTIVE", "SUPPRESSED", "EXPIRED", "ANNULLED", "RESOLVED"]);
const ACTIONS = new Set(["KEEP", "CORRECT", "SUPPRESS", "UNSUPPRESS", "RECONFIRM", "RESOLVE", "ANNUL", "DELETE"]);
const GOALS = new Set(["READ_MORE", "REVIEW_REGULARLY", "IMPROVE_VOCABULARY", "IMPROVE_WRITING", "IMPROVE_SPEAKING", "CUSTOM"]);
const NEXT_ACTIONS = new Set(["OPEN_TASK", "OPEN_EXPLANATION", "OPEN_READING", "OPEN_MENTOR"]);
const SOURCE_KINDS = new Set(["USER_ACTION", "AGENT_TASK", "AGENT_EXPLANATION", "PUBLIC_CORPUS_ANCHOR", "PERSONAL_TEXT_ANCHOR", "CANONICAL_EVENT_REF"]);
const RELATIONS = new Set(["DECLARED_AT", "CONTINUES", "EVIDENCED_BY", "DERIVED_FROM"]);
const SOURCE_AUTHORITIES = new Set(["USER_ACTION", "DERIVED", "PUBLIC_ASSERTED", "PRIVATE_SELECTED", "CANONICAL_REF"]);
const MAX_PAYLOAD_BYTES = 2048;
const MAX_ANCHOR_BYTES = 1024;
const MAX_SOURCES = 5;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}
function canonicalJson(value) { return JSON.stringify(canonical(value)); }
function bytes(value) { return Buffer.byteLength(String(value), "utf8"); }
function closedObject(value, allowed, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  for (const k of Object.keys(value)) if (!allowed.has(k)) throw new Error(code + "_FIELD");
}
function boundedText(value, max, code, optional = false) {
  if (value == null && optional) return null;
  const s = String(value == null ? "" : value).trim();
  if ((!optional && !s) || bytes(s) > max) throw new Error(code);
  return s || null;
}

function validatePayload(kind, raw) {
  if (!KINDS.has(kind)) throw new Error("BAD_MEMORY_KIND");
  if (kind === "declared_goal") {
    closedObject(raw, new Set(["goal_code", "text", "language"]), "BAD_GOAL_PAYLOAD");
    const goal = String(raw.goal_code || "");
    if (!GOALS.has(goal)) throw new Error("BAD_GOAL_CODE");
    const language = raw.language == null ? null : String(raw.language);
    if (language && !["ru", "en", "he"].includes(language)) throw new Error("BAD_GOAL_LANGUAGE");
    const out = { goal_code: goal };
    const text = boundedText(raw.text, 280, "BAD_GOAL_TEXT", true);
    if (text) out.text = text;
    if (language) out.language = language;
    if (goal === "CUSTOM" && !text) throw new Error("CUSTOM_GOAL_TEXT_REQUIRED");
    if (bytes(canonicalJson(out)) > MAX_PAYLOAD_BYTES) throw new Error("MEMORY_PAYLOAD_TOO_LARGE");
    return out;
  }
  closedObject(raw, new Set(["next_action", "label"]), "BAD_THREAD_PAYLOAD");
  const action = String(raw.next_action || "");
  if (!NEXT_ACTIONS.has(action)) throw new Error("BAD_NEXT_ACTION");
  const out = { next_action: action, label: boundedText(raw.label, 160, "BAD_THREAD_LABEL") };
  if (bytes(canonicalJson(out)) > MAX_PAYLOAD_BYTES) throw new Error("MEMORY_PAYLOAD_TOO_LARGE");
  return out;
}

function validateSource(raw) {
  closedObject(raw, new Set(["source_kind", "relation_kind", "source_ref", "source_revision_ref", "source_authority", "anchor", "anchor_json", "keyed_digest"]), "BAD_SOURCE");
  const source_kind = String(raw.source_kind || "");
  const relation_kind = String(raw.relation_kind || "");
  const source_authority = String(raw.source_authority || "");
  if (!SOURCE_KINDS.has(source_kind)) throw new Error("BAD_SOURCE_KIND");
  if (!RELATIONS.has(relation_kind)) throw new Error("BAD_SOURCE_RELATION");
  if (!SOURCE_AUTHORITIES.has(source_authority)) throw new Error("BAD_SOURCE_AUTHORITY");
  const source_ref = boundedText(raw.source_ref, 200, "BAD_SOURCE_REF");
  const source_revision_ref = boundedText(raw.source_revision_ref, 200, "BAD_SOURCE_REVISION", true);
  const anchor = raw.anchor == null ? {} : raw.anchor;
  closedObject(anchor, new Set(["text_key", "work_id", "corpus", "order_index", "row_id", "task_kind", "action_target"]), "BAD_SOURCE_ANCHOR");
  const anchor_json = canonicalJson(anchor);
  if (bytes(anchor_json) > MAX_ANCHOR_BYTES) throw new Error("SOURCE_ANCHOR_TOO_LARGE");
  return { source_kind, relation_kind, source_ref, source_revision_ref, source_authority, anchor, anchor_json, keyed_digest: raw.keyed_digest ? boundedText(raw.keyed_digest, 160, "BAD_SOURCE_DIGEST") : null };
}

function validateSources(raw) {
  const a = Array.isArray(raw) ? raw : [];
  if (!a.length || a.length > MAX_SOURCES) throw new Error("BAD_SOURCE_COUNT");
  return a.map(validateSource);
}

function digest(userId, value) {
  const root = process.env.F1_MEMORY_DIGEST_SECRET || process.env.AUTH_BOOTSTRAP_SECRET || "";
  if (root.length < 16) throw new Error("F1_DIGEST_SECRET_REQUIRED");
  const key = crypto.createHmac("sha256", root).update(String(userId)).digest();
  return "h1:" + crypto.createHmac("sha256", key).update(canonicalJson(value)).digest("hex");
}
function opaque(prefix) { return prefix + crypto.randomUUID(); }
function iso(value) {
  const s = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error("BAD_TIME");
  return s;
}

module.exports = {
  SCHEMA_VERSION, POLICY_VERSION, KINDS, AUTHORITIES, STATUSES, ACTIONS, GOALS, NEXT_ACTIONS,
  SOURCE_KINDS, MAX_PAYLOAD_BYTES, MAX_ANCHOR_BYTES, MAX_SOURCES,
  canonicalJson, validatePayload, validateSource, validateSources, digest, opaque, iso,
};
