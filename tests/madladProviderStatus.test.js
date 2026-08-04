"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name + " must exist");
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated function " + name);
}

test("server status never claims that a user-local MADLAD Companion is configured", () => {
  assert.doesNotMatch(serverSource, /madlad\s*:\s*\{\s*configured\s*:\s*true/);
  assert.match(serverSource, /madlad\s*:\s*\{[\s\S]{0,240}configured\s*:\s*false/);
});

test("server translation pipeline rejects MADLAD before receiving user text", () => {
  const routeStart = serverSource.indexOf('app.post("/api/translate-table-v2"');
  assert.notEqual(routeStart, -1);
  const routeEnd = serverSource.indexOf("app.get(\"/api/premium/status\"", routeStart);
  const route = serverSource.slice(routeStart, routeEnd);
  assert.match(route, /provider\s*===\s*["']madlad["']/);
  assert.match(route, /LOCAL_MADLAD_COMPANION_REQUIRED/);
});

test("UI ignores a false-positive server flag and does not switch providers", () => {
  const madlad = { disabled: false, textContent: "", title: "" };
  const gcp = { disabled: true, textContent: "", title: "" };
  const select = {
    value: "madlad",
    querySelector(selector) { return selector.includes('"gcp"') ? gcp : madlad; },
  };
  const context = {
    document: { getElementById: (id) => id === "providerSelect" ? select : null },
  };
  vm.runInNewContext(extractFunction(indexSource, "applyPremiumStatusToUI"), context);
  context.applyPremiumStatusToUI({ providers: { madlad: { configured: true } } });

  assert.equal(madlad.disabled, true);
  assert.equal(select.value, "madlad", "readiness loss must not silently select Gemini");
  assert.match(madlad.textContent, /Companion|unavailable|недоступ/i);
});
