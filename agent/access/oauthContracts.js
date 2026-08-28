"use strict";

const OAUTH_LIFECYCLE_VERSION = "aa-oauth-lifecycle.1.0.0";
const RESOURCE_URI = "https://linguistpro.kolosei.com/agent-access";
const SCOPES = Object.freeze([
  "learning.brief.read",
  "review.summary.read",
  "reading.public.search",
  "explanations.metadata.read",
  "agent.connection.read",
  // AA3 slice-1: richer reads (content), first-party handoff, propose-then-confirm.
  "review.items.read",
  "profile.read",
  "explanations.body.read",
  "reading.corpus.read",
  "reading.handoff.create",
  "intent.propose",
  // AA4 slice 4a: pure-activity delta (kept in lockstep with contracts.SCOPES + migration 046 CHECK).
  "review.activity.read",
  // AA4 slice 4b-final: anchor-less review handoff (migration 047 CHECK).
  "review.handoff.create",
  // S-пакет S1: личные тексты (migration 049 CHECK; content-инструмент — S2).
  "personal.texts.metadata.read",
  "personal.texts.content.read",
  // H2.1: offline Pealim morphology grounding (migration 054 CHECK).
  "morphology.read",
  // H2.2: learner coverage over Ben-Yehuda + consented personal texts (migration 055 CHECK).
  "learner.coverage.read",
  // Restricted Group Song Corpus (migration 060 CHECK). Reading and coverage
  // stay independently revocable because coverage also reveals learner state.
  "reading.group_corpus.read",
  "learner.group_coverage.read",
  // H2.3 owner-confirmed proposal family + server goal read.
  "intent.import_text.propose",
  "intent.track_word.propose",
  "intent.goal.propose",
  "goal.read",
  "reading.publication.catalog.read",
  "reading.publication.item.read",
  "reading.publication.resource.read",
  "reading.publication.derivative.read",
]);
const SCOPE_SET = new Set(SCOPES);
const SAFE = /^[A-Za-z0-9_.:@/-]+$/;
const HASH = /^[A-Fa-f0-9]{64,128}$/;
const PKCE_S256 = /^[A-Za-z0-9_-]{43,128}$/;

function fail(code) { const e = new Error(code); e.code = code; throw e; }
function plain(value, code = "AA_OAUTH_BAD_OBJECT") {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  return value;
}
function closed(value, allowed, required = allowed) {
  const x = plain(value);
  for (const key of Object.keys(x)) if (!allowed.includes(key)) fail("AA_OAUTH_UNKNOWN_FIELD");
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(x, key)) fail("AA_OAUTH_MISSING_FIELD");
  return x;
}
function bounded(value, maxBytes, code = "AA_OAUTH_BAD_STRING") {
  if (typeof value !== "string" || !value.length || Buffer.byteLength(value, "utf8") > maxBytes) fail(code);
  return value;
}
function safeId(value, max = 128) {
  const s = bounded(value, max, "AA_OAUTH_BAD_ID");
  if (!SAFE.test(s)) fail("AA_OAUTH_BAD_ID");
  return s;
}
function connectionId(value) { return safeId(value, 24); }
function digest(value) { const s = bounded(value, 128, "AA_OAUTH_BAD_DIGEST"); if (!HASH.test(s)) fail("AA_OAUTH_BAD_DIGEST"); return s.toLowerCase(); }
function iso(value) { const s = bounded(value, 40, "AA_OAUTH_BAD_TIME"); if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !Number.isFinite(Date.parse(s))) fail("AA_OAUTH_BAD_TIME"); return s; }
function scope(value) { if (!SCOPE_SET.has(value)) fail("AA_OAUTH_BAD_SCOPE"); return value; }
function scopes(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length > SCOPES.length || (!allowEmpty && !value.length)) fail("AA_OAUTH_BAD_SCOPES");
  const out = value.map(scope);
  if (new Set(out).size !== out.length) fail("AA_OAUTH_BAD_SCOPES");
  return Object.freeze([...out].sort());
}
function redirectUri(value) {
  const s = bounded(value, 1024, "AA_OAUTH_BAD_REDIRECT_URI");
  let u; try { u = new URL(s); } catch (_) { fail("AA_OAUTH_BAD_REDIRECT_URI"); }
  if (u.username || u.password || u.hash) fail("AA_OAUTH_BAD_REDIRECT_URI");
  const localhost = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  if (u.protocol !== "https:" && !localhost) fail("AA_OAUTH_BAD_REDIRECT_URI");
  if (u.toString() !== s) fail("AA_OAUTH_BAD_REDIRECT_URI");
  return s;
}
function resourceUri(value) { if (value !== RESOURCE_URI) fail("AA_OAUTH_BAD_RESOURCE"); return value; }
function pkceChallenge(value) { const s = bounded(value, 128, "AA_OAUTH_BAD_PKCE"); if (!PKCE_S256.test(s)) fail("AA_OAUTH_BAD_PKCE"); return s; }
function consentKey(connection, requestedScope) {
  const key = `external_agent_access:${connectionId(connection)}:${scope(requestedScope)}`;
  if (key.length > 80) fail("AA_OAUTH_CONSENT_KEY_TOO_LONG");
  return key;
}
function canonicalJson(value, maxBytes) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > maxBytes) fail("AA_OAUTH_JSON_TOO_LARGE");
  return text;
}
function parseJson(value, fallback) { try { return JSON.parse(String(value)); } catch (_) { return fallback; } }

function validateClient(value) {
  const x = closed(value, ["oauth_client_id", "display_name", "software_id", "software_version", "redirect_uris", "registration_version"]);
  const uris = Array.isArray(x.redirect_uris) ? x.redirect_uris.map(redirectUri) : fail("AA_OAUTH_BAD_REDIRECT_URIS");
  if (!uris.length || uris.length > 8 || new Set(uris).size !== uris.length) fail("AA_OAUTH_BAD_REDIRECT_URIS");
  return Object.freeze({ oauth_client_id: safeId(x.oauth_client_id), display_name: bounded(x.display_name, 120), software_id: safeId(x.software_id), software_version: bounded(x.software_version, 64), redirect_uris: Object.freeze(uris), registration_version: safeId(x.registration_version, 64) });
}

module.exports = {
  OAUTH_LIFECYCLE_VERSION, RESOURCE_URI, SCOPES, fail, plain, closed, bounded, safeId,
  connectionId, digest, iso, scope, scopes, redirectUri, resourceUri, pkceChallenge,
  consentKey, canonicalJson, parseJson, validateClient,
};
