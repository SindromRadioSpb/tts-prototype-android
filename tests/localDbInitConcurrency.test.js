"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness() {
  const source = fs.readFileSync(path.join(__dirname, "../public/db/local-db.js"), "utf8");
  const body = source.slice(source.indexOf("export async function initLocalDB()"), source.indexOf("export function isReady()"));
  const calls = [];
  let proxies = 0;
  const context = vm.createContext({
    _initialized: false, _initInFlight: null, _followerMode: false, _worker: null,
    _pending: new Map(), _VFS_PREF_KEY: "test-vfs", _vfs: null,
    acquireDbOwnership: async () => {}, _preflightSupport: async () => {},
    Worker: class {}, DbUnavailableError: class extends Error {},
    _call: () => new Promise((resolve, reject) => calls.push({ resolve, reject })),
    _startProxyServer: () => { proxies++; },
  });
  vm.runInContext(body.replace("export async function", "async function"), context);
  return { init: () => context.initLocalDB(), calls, proxies: () => proxies };
}

test("concurrent local DB callers share one worker initialization and proxy startup", async () => {
  const h = harness();
  const pending = Promise.all([h.init(), h.init(), h.init()]);
  await new Promise(resolve => setImmediate(resolve));
  const count = h.calls.length;
  h.calls.forEach(call => call.resolve());
  await pending;
  assert.equal(count, 1, "a second init closes the connection used by the first caller");
  assert.equal(h.proxies(), 1);
  await h.init();
  assert.equal(h.calls.length, 1);
});

test("failed shared initialization rejects all callers and permits an explicit retry", async () => {
  const h = harness();
  const pending = Promise.allSettled([h.init(), h.init()]);
  await new Promise(resolve => setImmediate(resolve));
  h.calls.forEach(call => call.reject(new Error("fixture open failure")));
  assert.deepEqual((await pending).map(result => result.status), ["rejected", "rejected"]);
  const retry = h.init();
  await new Promise(resolve => setImmediate(resolve));
  h.calls.at(-1).resolve();
  await retry;
  assert.equal(h.calls.length, 2);
  assert.equal(h.proxies(), 1);
});
