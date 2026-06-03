#!/usr/bin/env node
// scripts/notes-graph/kmap-privacy-smoke.js — Knowledge Map v3.8 privacy gate.
//
// privacy-smoke.js drives the OLD note-graph; this pins the NEW root-centric
// view. Opens window.KnowledgeMap, selects a root, taps a node (fires the lazy
// _fetchPreview), and asserts:
//   1. zero network (fetch / XHR / sendBeacon) during the whole session
//   2. every DB statement issued is a bare SELECT (read-only invariant)
//   3. the preview path reads ONLY the declared body scalars (meaning, niqqud)
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3226;
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
function test(n, c, e) { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.log("  ✗ " + n + (e ? " — " + e : "")); } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await new Promise(r => { const t = setTimeout(() => r(), 4000); c.once("exit", () => { clearTimeout(t); r(); }); }); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

const SETUP = `
  window.__kmapNet = { fetch: 0, xhr: 0, beacon: 0 };
  (function(){
    var of = window.fetch; window.fetch = function(){ window.__kmapNet.fetch++; return of ? of.apply(this, arguments) : Promise.reject(); };
    var ox = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
    if (ox) window.XMLHttpRequest.prototype.open = function(){ window.__kmapNet.xhr++; return ox.apply(this, arguments); };
    if (navigator.sendBeacon) navigator.sendBeacon = function(){ window.__kmapNet.beacon++; return true; };
  })();
  window.__kmapSql = [];
  window.__localDBInitPromise = Promise.resolve();
  window.__localDB = {
    isReady: function(){ return true; },
    dbQuery: async function (sql, p) {
      window.__kmapSql.push(String(sql));
      if (/WHERE id = \\?/i.test(sql)) return [{ meaning: "пример", niqqud: "כּוֹתֵב" }];
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"a1", text_id:"T1", note_type:"word_study", j_root:"כתב", j_binyan:"paal", j_word:"כותב", j_pos:"verb" },
        { id:"a2", text_id:"T1", note_type:"word_study", j_root:"כתב", j_binyan:null,   j_word:"מכתב", j_pos:"noun" }
      ];
      return [];
    },
    getLearningStateOverlay: async function(){ return { a1: "known" }; }
  };
  window.MorphNormalize = { normalizeHebrew: function(w){ return String(w||"").replace(/[\\u0591-\\u05C7]/g,"").trim(); } };
`;

async function main() {
  const playwright = require("playwright");
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", e => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: SETUP });
    await pg.addScriptTag({ url: "/js/knowledge-map-data.js" });
    await pg.addScriptTag({ url: "/js/knowledge-map-view.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMap, null, { timeout: 5000 });
    await pg.evaluate(async () => { await window.KnowledgeMap.open(); });
    await sleep(600);
    // tap a lemma node (fires _fetchPreview)
    const node = await pg.$("[data-kmap-node]");
    if (node) { await node.click(); await sleep(500); }

    const r = await pg.evaluate(() => ({ net: window.__kmapNet, sql: window.__kmapSql }));
    const nonSelect = (r.sql || []).filter(s => !/^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i.test(s) || /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i.test(s));
    const previewFired = (r.sql || []).some(s => /WHERE id = \?/i.test(s));
    const previewFieldsOk = (r.sql || []).filter(s => /WHERE id = \?/i.test(s)).every(s => /\$\.meaning/.test(s) && /\$\.niqqud_variant/.test(s) && !/\$\.body|body_json\s*FROM|SELECT\s+body_json/i.test(s));

    test("Case 1: zero network (fetch/xhr/beacon) during the session",
      r.net.fetch === 0 && r.net.xhr === 0 && r.net.beacon === 0, JSON.stringify(r.net));
    test("Case 2: every DB statement is a bare SELECT (read-only)",
      nonSelect.length === 0, JSON.stringify(nonSelect));
    test("Case 3: preview path fired and reads only meaning+niqqud scalars",
      previewFired && previewFieldsOk, JSON.stringify({ previewFired, previewFieldsOk }));
    test("Case 4: no pageerror", errs.length === 0, errs.join(" | "));

    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[kmap-privacy-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch(e => { console.error("[kmap-privacy-smoke] fatal:", e); process.exit(1); });
