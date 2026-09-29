"use strict";
// A connector can return display data, never HTML, actions, grades or tool calls.
const ERRORS = new Set(["reauth_required", "quota_exhausted", "runtime_failed", "invalid_output"]);
function fail(code = "invalid_output") { throw Object.assign(new Error(code), { code }); }
function closed(v, keys) {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail();
}
function validateResponse(value, context) {
  closed(value, ["schema_version", "context_id", "excerpt_digest", "text", "error"]);
  if (value.schema_version !== "lp-tutor-response.1" || value.context_id !== context.context_id ||
      value.excerpt_digest !== context.excerpt_digest) fail();
  if (value.error !== undefined) {
    if (!ERRORS.has(value.error) || value.text !== undefined) fail();
    return { schema_version: value.schema_version, context_id: value.context_id, excerpt_digest: value.excerpt_digest, error: value.error };
  }
  if (typeof value.text !== "string" || !value.text.trim() || Buffer.byteLength(value.text, "utf8") > 16000) fail();
  return { schema_version: value.schema_version, context_id: value.context_id, excerpt_digest: value.excerpt_digest, text: value.text };
}
module.exports = { validateResponse, fail, closed };
