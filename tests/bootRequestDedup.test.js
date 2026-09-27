"use strict";
// O-025: the Room boot sent /api/client-config three times (footer, Room version, telemetry) and
// /api/auth/me three times in a row (~130 ms each). Boot-time readers now share one answer for a
// few seconds. Freshness probes (Room reconnect / update checks) still go to the network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", "public", "js", p), "utf8");

function footerSandbox(fetchImpl, now) {
  const window = { t: null };
  const sandbox = { window, fetch: fetchImpl, Date: { now }, document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, readyState: "complete" }, navigator: {}, console, setTimeout, clearTimeout, Promise };
  sandbox.globalThis = sandbox;
  try { vm.runInNewContext(read("app-footer.js"), sandbox); } catch (_) { /* mount() needs a DOM; the helper is defined first */ }
  return window;
}

test("LPClientConfig shares one request across boot readers and expires", async () => {
  let calls = 0, t = 1000;
  const window = footerSandbox(async () => { calls++; return { ok: true, json: async () => ({ version: "v3.11.669" }) }; }, () => t);
  assert.ok(window.LPClientConfig, "helper must be defined before mount()");
  const [a, b] = await Promise.all([window.LPClientConfig.get(), window.LPClientConfig.get()]);
  assert.equal(a.version, "v3.11.669"); assert.equal(b.version, "v3.11.669");
  await window.LPClientConfig.get();
  assert.equal(calls, 1);
  t += 6000;
  await window.LPClientConfig.get();
  assert.equal(calls, 2);
});

test("a failed read is not remembered", async () => {
  let calls = 0;
  const window = footerSandbox(async () => { calls++; throw new Error("offline"); }, () => 1000);
  assert.equal(await window.LPClientConfig.get(), null);
  assert.equal(await window.LPClientConfig.get(), null);
  assert.equal(calls, 2);
});

test("boot readers use the shared helper; freshness probes do not", () => {
  const ui = read("library-ui.js");
  const loadRoomVersion = ui.slice(ui.indexOf("async function loadRoomVersion()"), ui.indexOf("async function loadRoomVersion()") + 300);
  assert.match(loadRoomVersion, /LPClientConfig/);
  assert.match(ui, /fetch\('\/api\/client-config\?room_reconnect=/);
  assert.match(ui, /fetch\('\/api\/client-config\?room_update_probe=/);
  assert.match(read("product-telemetry.js"), /window\.LPClientConfig/);
});

test("CloudSync.me shares one session read for a few seconds and forgets it on login/logout", () => {
  const cs = read("cloud-sync.js");
  const me = cs.slice(cs.indexOf("async function me()"), cs.indexOf("async function login("));
  assert.match(me, /_meShared/);
  assert.match(cs, /ME_SHARE_MS = 3000/);
  const login = cs.slice(cs.indexOf("async function login("), cs.indexOf("async function login(") + 200);
  assert.match(login, /_meShared = null/);
  const logout = cs.slice(cs.indexOf("async function logout()"), cs.indexOf("async function logout()") + 200);
  assert.match(logout, /_meShared = null/);
});
