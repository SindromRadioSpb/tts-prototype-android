"use strict";

const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8");
const version = source.match(/CACHE_VERSION = "v([^"]+)"/)[1];
const origin = "https://example.test";

function fixture(urls, { badIntegrity = false } = {}) {
  const events = {}, actions = [], body = Buffer.from("verified coherent shell");
  const clients = urls.map((url, index) => ({
    id: String(index), url,
    navigate: target => { actions.push({ kind: "navigate", target }); return Promise.resolve(); },
  }));
  const hash = crypto.createHash("sha256").update(body).digest("hex");
  const self = {
    location: { origin }, addEventListener: (type, handler) => { events[type] = handler; },
    skipWaiting: async () => { actions.push({ kind: "skipWaiting" }); },
    clients: { matchAll: async () => clients, claim: async () => { actions.push({ kind: "claim" }); } },
  };
  const cache = { add: async () => {}, match: async () => new Response(body) };
  class BrowserRequest extends Request { constructor(url, options) { super(new URL(url, origin), options); } }
  vm.runInContext(source, vm.createContext({
    self, URL, Request: BrowserRequest, Response, crypto: crypto.webcrypto,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    console: { warn() {} }, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ version,
      shellIntegrity: { "/library.html": badIntegrity ? "0".repeat(64) : hash },
    }) }),
  }));
  return {
    actions,
    run: async type => { let pending; events[type]({ waitUntil: promise => { pending = promise; } }); await pending; },
    message: data => { events.message({ data }); },
  };
}

test("even an exact Room URL marker cannot activate an installed update", async () => {
  const f = fixture([origin + "/library.html?room_update=" + version + "#room=hub"]);
  await f.run("install");
  assert.deepEqual(f.actions, []);
});

test("activation never forcibly navigates marked or ordinary windows", async () => {
  const f = fixture([origin + "/library.html?room_update=" + version,
    origin + "/library.html#room=hub", "https://other.test/library.html?room_update=" + version]);
  await f.run("activate");
  assert.deepEqual(f.actions, [{ kind: "claim" }]);
});

test("an explicit update message remains separate from a URL marker", async () => {
  const f = fixture([origin + "/library.html?room_update=" + version]);
  await f.run("install");
  assert.deepEqual(f.actions, []);
  f.message({ type: "SKIP_WAITING" });
  assert.deepEqual(f.actions, [{ kind: "skipWaiting" }]);
});

test("even a marked window cannot install an incoherent shell cohort", async () => {
  const f = fixture([origin + "/library.html?room_update=" + version], { badIntegrity: true });
  await assert.rejects(f.run("install"), /shell integrity mismatch/);
  assert.deepEqual(f.actions, []);
});
