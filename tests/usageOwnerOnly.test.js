"use strict";
// O-013 (audit P0-3): /api/usage is the server's aggregate over ALL users (TTS chars, Gemini
// requests, model). Hiding it in the Studio UI (R7) left the raw endpoint open to anyone.
// It answers the signed-in owner only, like the Product Pulse dashboard.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const start = server.indexOf('app.get("/api/usage"');
const handler = server.slice(start, server.indexOf("\n});", start));

test("/api/usage exists", () => {
  assert.ok(start > 0);
});

test("/api/usage checks the owner before reading any counter", () => {
  const gate = handler.indexOf("requireUser(req, res)");
  const role = handler.search(/role \|\| ""\)\.toLowerCase\(\) !== "owner"/);
  const read = handler.indexOf("getUsage()");
  assert.ok(gate > 0, "requireUser missing");
  assert.ok(role > gate, "owner role check missing");
  assert.ok(read > role, "counters read before the owner check");
  assert.match(handler.slice(role, read), /status\(404\)/);
});

test("the Studio diag strip appears only after the owner-only answer succeeds", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const load = html.slice(html.indexOf("async function loadStats()"), html.indexOf("function applyGeminiUsageToUI()"));
  const ok = load.indexOf("if (!res.ok) throw");
  const unhide = load.indexOf("strip.hidden = false");
  assert.ok(ok > 0 && unhide > ok, "strip is unhidden before the response is known");
});

test("/api/usage is never cached by a shared cache", () => {
  assert.match(handler, /Cache-Control", "private, no-store"/);
});
