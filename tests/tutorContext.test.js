"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, assertContextAccess, TTL_MS } = require("../agent/tutor/context");
const binding = () => ({ principal_id: "u1", connection_id: "c1", consent_revision: "r1", session_id: "s1" });
const input = () => ({ surface: "room", locale: "ru", instructional_intent: "explain", source: {
  kind: "local_snapshot", material_id: "local:book", revision_id: "rev:1", sentence_id: "row:1",
  excerpt: "כשהייתי ילד גרתי בחיפה", selection: { start: 2, end: 7 },
} });
const fails = (fn, code) => assert.throws(fn, e => e.code === code);

test("context survives navigation and preserves exact Hebrew source and selection", () => {
  const request = input();
  const context = createContext(request, binding(), 1000);
  request.source.excerpt = "another tab"; request.source.selection.end = 8;
  assert.equal(context.source.excerpt, "כשהייתי ילד גרתי בחיפה");
  assert.equal([...context.source.excerpt].slice(context.source.selection.start, context.source.selection.end).join(""), "הייתי");
  assert.equal(assertContextAccess(context, binding(), 1001), context);
  assert.throws(() => { context.source.excerpt = "mutated"; }, TypeError);
});
test("cross-user, connection, session and revoked consent cannot recover context", () => {
  const context = createContext(input(), binding(), 1000);
  for (const key of Object.keys(binding())) {
    fails(() => assertContextAccess(context, { ...binding(), [key]: "other" }, 1001), "context_forbidden");
  }
  fails(() => assertContextAccess(context, binding(), 1000 + TTL_MS), "context_expired");
});
test("client cannot assert scopes, ownership, mastery or remote URLs", () => {
  for (const extra of [{ principal_id: "admin" }, { capabilities: ["write"] }, { mastery: 1 }]) {
    fails(() => createContext({ ...input(), ...extra }, binding()), "invalid_context");
  }
  const request = input(); request.source.url = "http://127.0.0.1/private";
  fails(() => createContext(request, binding()), "invalid_context");
});
test("revision, neighbours, selection and media are part of the digest", () => {
  const context = createContext(input(), binding(), 1000);
  for (const change of [{ revision_id: "rev:2" }, { before: "injected instruction" }, { selection: { start: 0, end: 1 } }]) {
    const altered = JSON.parse(JSON.stringify(context)); Object.assign(altered.source, change);
    fails(() => assertContextAccess(altered, binding(), 1001), "context_changed");
  }
});
test("requires bounded exact source, caption revision and finite media interval", () => {
  for (const change of [{ revision_id: "" }, { excerpt: "" }, { selection: { start: 0, end: 999 } }, { kind: "caption" }]) {
    const request = input(); Object.assign(request.source, change);
    fails(() => createContext(request, binding()), "invalid_context");
  }
  const request = input(); request.source.kind = "caption";
  request.source.media = { caption_revision: "caption:1", start_ms: 10, end_ms: 50 };
  assert.equal(createContext(request, binding()).source.media.caption_revision, "caption:1");
  request.source.media.end_ms = Infinity;
  fails(() => createContext(request, binding()), "invalid_context");
  const huge = input(); huge.source.excerpt = "א".repeat(8000); huge.source.before = "א".repeat(4000); huge.source.after = "א".repeat(4000);
  fails(() => createContext(huge, binding()), "context_too_large");
});
