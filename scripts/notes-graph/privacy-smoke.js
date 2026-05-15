#!/usr/bin/env node
// scripts/notes-graph/privacy-smoke.js — v3.3.6 C7 privacy hardening.
//
// 8 cases per docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md §10 + blind-spot §D.
// Spies are installed via addInitScript BEFORE any graph code runs, then
// reset immediately before NotesGraph.open() so the assertions cover the
// FULL graph session (open → render → interact → close) only.
//
//   1. fetch(): zero graph-initiated fetch calls during the session.
//   2. XMLHttpRequest: zero opens during the session.
//   3. navigator.sendBeacon: zero calls during the session.
//   4. DOM injection: no new <script> outside the 3-chunk allow-list,
//      no new <img>/<link rel=preload> during the session.
//   5. DB writes: every SQL the graph issued is a bare SELECT (the
//      read-only _q guard). Zero INSERT/UPDATE/DELETE/etc.
//   6. research payload: LinguistProResearch.upload queue length
//      unchanged across the session.
//   7. research/validate.js unchanged by C0–C7 (git-level: not in the
//      v3.3.6 diff file list).
//   8. CONSENT_VERSION still '1.0' in public/js/research.js.
//
// Cases 7–8 are static (Node fs/git); 1–6 are browser-session.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3207;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  // ── Static cases 7–8 (no browser) ──────────────────────────────────
  let validateUnchanged = false, consentOk = false;
  try {
    const r = spawnSync("git", ["log", "--name-only", "--pretty=format:",
      "a1cac74..HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
    const touched = new Set((r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    validateUnchanged = !touched.has("research/validate.js");
  } catch (e) { validateUnchanged = false; }
  try {
    const rj = fs.readFileSync(path.join(REPO_ROOT, "public/js/research.js"), "utf8");
    consentOk = /CONSENT_VERSION\s*=\s*['"]1\.0['"]/.test(rj);
  } catch (_) { consentOk = false; }

  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[privacy-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[privacy-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[privacy-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    serviceWorkers: "block", viewport: { width: 1280, height: 720 },
  });

  // Spies installed BEFORE any page script runs.
  await context.addInitScript(() => {
    window.__spy = { fetch: [], xhr: [], beacon: [], dom: [], sql: [], armed: false };
    const of = window.fetch;
    window.fetch = function (...a) {
      if (window.__spy.armed) window.__spy.fetch.push(String(a[0]));
      return of.apply(this, a);
    };
    const OX = window.XMLHttpRequest;
    function SpyXHR() {
      const x = new OX();
      const oo = x.open;
      x.open = function (m, u) {
        if (window.__spy.armed) window.__spy.xhr.push(m + " " + u);
        return oo.apply(this, arguments);
      };
      return x;
    }
    SpyXHR.prototype = OX.prototype;
    window.XMLHttpRequest = SpyXHR;
    if (navigator.sendBeacon) {
      const ob = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (u, d) {
        if (window.__spy.armed) window.__spy.beacon.push(String(u));
        return ob(u, d);
      };
    }
    const mo = new MutationObserver((muts) => {
      if (!window.__spy.armed) return;
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!n.tagName) continue;
          const tag = n.tagName.toLowerCase();
          if (tag === "script") window.__spy.dom.push("script:" + (n.src || "inline"));
          else if (tag === "img") window.__spy.dom.push("img:" + (n.src || ""));
          else if (tag === "link" && (n.rel || "").includes("preload"))
            window.__spy.dom.push("link-preload:" + (n.href || ""));
        }
      }
    });
    // addInitScript runs before <html> exists; attach the observer once
    // a root node is available (harness timing, not a graph concern).
    const _attach = () => {
      const root = document.documentElement || document.body;
      if (root) { mo.observe(root, { childList: true, subtree: true }); }
      else { setTimeout(_attach, 0); }
    };
    _attach();
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

  try {
    await page.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    // Mocked ready DB; dbQuery records EVERY SQL it is asked (case 5).
    await page.addScriptTag({ content: `
      window.__localDBInitPromise = Promise.resolve();
      window.__localDBInitError = null;
      window.LinguistProResearch = window.LinguistProResearch || {
        _lsKeys: { uploadQueue: "lp_research_upload_queue_v1" },
      };
      window.__localDB = {
        isReady: function () { return true; },
        dbQuery: async function (sql) {
          if (window.__spy) window.__spy.sql.push(String(sql));
          if (/FROM notes_v2/i.test(sql)) return [
            { id:"n1", title:"A", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:00:00Z" },
            { id:"n2", title:"B", target_kind:"word", target_id:"שלום", text_id:"t1", note_type:"word_study", j_root:"שלם",j_binyan:"PA'AL",j_word:"שלום", updated_at:"2026-05-15T00:01:00Z" }
          ];
          if (/FROM note_links/i.test(sql)) return [
            { from_note_id:"n1", to_kind:"note", to_id:"n2", link_alias:null }
          ];
          if (/FROM texts/i.test(sql)) return [{ id:"t1", title:"Text One" }];
          return [];
        },
      };
      window.MorphNormalize = { normalizeHebrew: function (w){ return String(w||"").trim(); } };
      window.MorphProvider = { ensureReady: async function(){}, analyze: async function(){ return []; } };
      // Seed a research upload queue to assert it stays untouched.
      try { localStorage.setItem("lp_research_upload_queue_v1", JSON.stringify(["pre-existing"])); } catch (_) {}
    `});
    await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
    await page.addScriptTag({ url: "/js/notes-graph-render.js" });
    await page.addScriptTag({ url: "/js/notes-graph.js" });
    await page.waitForFunction(() => !!window.NotesGraph, null, { timeout: 5000 });

    const queueBefore = await page.evaluate(() =>
      (localStorage.getItem("lp_research_upload_queue_v1") || "").length);

    // ARM the spies — everything from here is the graph session.
    await page.evaluate(() => { window.__spy.armed = true; });
    await page.evaluate(() => window.NotesGraph.open());
    await page.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 });
    await sleep(1200);
    // Interact: toggle list, legend, reset, close.
    await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const cl = q("[data-graph-toggle-list]"); if (cl) cl.click();
      const lg = q("[data-graph-legend]"); if (lg) lg.click();
      const rs = q("[data-graph-reset]"); if (rs) rs.click();
    });
    await sleep(500);
    await page.evaluate(() => window.NotesGraph.close());
    await sleep(200);

    const spy = await page.evaluate(() => window.__spy);
    const queueAfter = await page.evaluate(() =>
      (localStorage.getItem("lp_research_upload_queue_v1") || "").length);

    test("Case 1: zero graph-initiated fetch() during the session",
         spy.fetch.length === 0, JSON.stringify(spy.fetch).slice(0, 200));
    test("Case 2: zero XMLHttpRequest opens during the session",
         spy.xhr.length === 0, JSON.stringify(spy.xhr).slice(0, 200));
    test("Case 3: zero navigator.sendBeacon calls during the session",
         spy.beacon.length === 0, JSON.stringify(spy.beacon).slice(0, 200));

    const ALLOW = ["/vendor/d3-graph.min.js", "/js/notes-graph-render.js", "/js/notes-graph.js"];
    const badDom = (spy.dom || []).filter((d) => {
      if (d.startsWith("script:")) {
        const src = d.slice(7);
        if (src === "inline") return false; // inline graph helper styles ok
        return !ALLOW.some((a) => src.indexOf(a) !== -1);
      }
      return true; // any img / link-preload is disallowed
    });
    test("Case 4: no DOM-injected resource outside the 3-chunk allow-list",
         badDom.length === 0, JSON.stringify(badDom).slice(0, 200));

    const nonSelect = (spy.sql || []).filter((s) =>
      !/^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i.test(String(s)) ||
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i.test(String(s)));
    test("Case 5: every DB statement the graph issued is a bare SELECT (read-only)",
         (spy.sql || []).length > 0 && nonSelect.length === 0,
         "total=" + (spy.sql || []).length + " bad=" + JSON.stringify(nonSelect).slice(0, 160));

    test("Case 6: research upload queue length unchanged across the session",
         queueAfter === queueBefore,
         `before=${queueBefore} after=${queueAfter}`);

    test("Case 7: research/validate.js not in the v3.3.6 commit diff",
         validateUnchanged);
    test("Case 8: CONSENT_VERSION still '1.0' in public/js/research.js",
         consentOk);

    if (pageErrors.length) {
      failed++;
      console.log("  ✗ Bonus: pageerror — " + pageErrors.join(" | "));
    } else {
      console.log("  · (bonus) no pageerror during privacy session");
    }
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[privacy-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[privacy-smoke] fatal:", e); process.exit(1); });
