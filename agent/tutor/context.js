"use strict";

// Server-side context boundary. Not an HTTP endpoint or an authorization service.
// The caller supplies an authenticated binding AFTER checking current consent.
const { createHash, randomUUID } = require("node:crypto");
const VERSION = "lp-tutor-context.1";
const MAX_BYTES = 24 * 1024;
const TTL_MS = 15 * 60 * 1000;
const ID = /^[A-Za-z0-9_.:@/-]{1,128}$/;
const SURFACES = new Set(["studio", "room", "mediatheque", "review"]);
const KINDS = new Set(["local_snapshot", "personal_text", "public_corpus", "caption"]);
const INTENTS = new Set(["explain", "comprehension", "retell", "discuss", "practice"]);

class ContextError extends Error {
  constructor(code) { super(code); this.name = "ContextError"; this.code = code; }
}
function check(ok, code = "invalid_context") { if (!ok) throw new ContextError(code); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  check(object(value));
  check(Object.keys(value).every(key => keys.includes(key)));
}
function string(value, max, empty = false) {
  check(typeof value === "string" && value.length <= max && (empty || value.trim().length > 0));
  return value;
}
function id(value) { check(typeof value === "string" && ID.test(value)); return value; }
function freeze(value) {
  if (object(value) || Array.isArray(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function digest(value) { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }

function createContext(input, binding, now = Date.now()) {
  exact(input, ["surface", "source", "locale", "instructional_intent"]);
  exact(binding, ["principal_id", "connection_id", "consent_revision", "session_id"]);
  for (const value of Object.values(binding)) id(value);
  check(["principal_id", "connection_id", "consent_revision", "session_id"].every(k => binding[k]));
  check(Number.isSafeInteger(now) && now >= 0);
  check(SURFACES.has(input.surface) && INTENTS.has(input.instructional_intent));
  check(["ru", "he", "en"].includes(input.locale));
  const source = input.source;
  exact(source, ["kind", "material_id", "revision_id", "sentence_id", "excerpt", "before", "after", "selection", "media"]);
  check(KINDS.has(source.kind));
  id(source.material_id); id(source.revision_id); id(source.sentence_id);
  string(source.excerpt, 8000);
  string(source.before ?? "", 4000, true); string(source.after ?? "", 4000, true);
  let selection = null;
  if (source.selection != null) {
    exact(source.selection, ["start", "end"]);
    const { start, end } = source.selection;
    // Offsets are Unicode code points in EXACT source text (no niqqud normalization).
    check(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= [...source.excerpt].length);
    selection = { start, end };
  }
  let media = null;
  if (source.media != null) {
    exact(source.media, ["caption_revision", "start_ms", "end_ms"]);
    id(source.media.caption_revision);
    const { start_ms, end_ms } = source.media;
    check(source.kind === "caption" && Number.isSafeInteger(start_ms) && Number.isSafeInteger(end_ms) && start_ms >= 0 && end_ms > start_ms);
    media = { caption_revision: source.media.caption_revision, start_ms, end_ms };
  }
  check(source.kind !== "caption" || media !== null);
  const snapshot = {
    kind: source.kind, material_id: source.material_id, revision_id: source.revision_id,
    sentence_id: source.sentence_id, excerpt: source.excerpt,
    before: source.before ?? "", after: source.after ?? "", selection, media,
  };
  check(Buffer.byteLength(JSON.stringify(snapshot), "utf8") <= MAX_BYTES, "context_too_large");
  return freeze({
    schema_version: VERSION, context_id: randomUUID(), session_id: binding.session_id,
    principal_binding: { principal_id: binding.principal_id, connection_id: binding.connection_id },
    consent_snapshot_ref: binding.consent_revision,
    issued_at: now, expires_at: now + TTL_MS,
    surface: input.surface, locale: input.locale, instructional_intent: input.instructional_intent,
    source: snapshot, excerpt_digest: digest(snapshot),
    // Source text is untrusted learning material, never runtime instructions.
    authority: source.kind === "local_snapshot" ? "user_supplied_snapshot" : "source_snapshot",
  });
}

function assertContextAccess(context, binding, now = Date.now()) {
  check(object(context) && context.schema_version === VERSION, "invalid_context");
  check(object(binding), "context_forbidden");
  check(context.principal_binding?.principal_id === binding.principal_id &&
    context.principal_binding?.connection_id === binding.connection_id &&
    context.session_id === binding.session_id &&
    context.consent_snapshot_ref === binding.consent_revision, "context_forbidden");
  check(Number.isSafeInteger(now) && now >= context.issued_at && now < context.expires_at, "context_expired");
  check(digest(context.source) === context.excerpt_digest, "context_changed");
  return context;
}

module.exports = { VERSION, MAX_BYTES, TTL_MS, ContextError, createContext, assertContextAccess };
