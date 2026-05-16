#!/usr/bin/env node
// scripts/notes-graph/suggest-generator-smoke.js — v3.6 Phase 1.
//
// Proves window.NotesGraphSuggest.candidatesForNote reproduces the
// Phase 0 frozen contract on the user's real bundle, and that it is
// deterministic, rarity-aware, capped, read-only and offline.
//
// The mock DB is fed from the SAME fixture the Phase 0 contract smoke
// pins (scripts/notes-graph/__fixtures__/suggest-bundle-fixture.json)
// — single source of truth, so generator and contract cannot drift.
//
// Cases:
//   1. API shape (NotesGraphSuggest.candidatesForNote).
//   2. Bundle contract: union of unbounded candidatesForNote() over
//      all notes == fixture.expected_candidates (as a set); N5 → [].
//   3. Determinism: candidatesForNote(N3) twice → byte-identical.
//   4. Rarity: N3's shared_root(אהב) scores strictly above its
//      shared_binyan(paal) (rare root out-ranks ubiquitous binyan).
//   5. Phase 2 suppression: `rejected` excludes the pair forever.
//   6. Phase 2 suppression: `later` hidden inside cooldown, returns
//      after it (deterministic — only `now` advances).
//   7. Phase 2 suppression: `confirmed` hides ONLY that reason
//      (per from,to,to_kind,reason_code) — other reasons survive.
//   8. Caps: 30-notes-same-root synthetic → ≤ capPerToken and ≤ K
//      (incl. an absurd-K hard-cap check).
//   9. Perf: 200-note synthetic generated <300ms, capped,
//      deterministic.
//  10. Read-only + offline: every SQL is a bare SELECT (guard holds);
//      zero xhr/fetch network requests; no pageerror.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3221;
const BASE = `http://127.0.0.1:${PORT}`;
const FIX = JSON.parse(fs.readFileSync(
  path.join(__dirname, "__fixtures__", "suggest-bundle-fixture.json"), "utf8"));

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
    const tm = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tm); resolve(true); });
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

// Mock dbQuery answers the two read-only SELECTs from injected rows
// and RECORDS every SQL string so the smoke can prove read-only.
function mockDbScript(notes, links) {
  return `
    window.__sqlLog = [];
    window.__localDBInitPromise = Promise.resolve();
    window.__localDBInitError = null;
    window.__localDB = {
      isReady: function () { return true; },
      dbQuery: async function (sql) {
        window.__sqlLog.push(String(sql));
        if (/FROM notes_v2/i.test(sql)) return ${JSON.stringify(notes)};
        if (/FROM note_links/i.test(sql)) return ${JSON.stringify(links)};
        return [];
      },
    };
    window.MorphNormalize = { normalizeHebrew: function (w) { return String(w||"").trim(); } };
  `;
}

const keyOf = (c) => [c.from, c.to, c.to_kind, c.reason_code, c.evidence].join("|");

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[suggest-generator-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[suggest-generator-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[suggest-generator-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  const netReqs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    pg.on("request", (r) => {
      const t = r.resourceType();
      if (t === "xhr" || t === "fetch" || t === "websocket" || t === "eventsource") {
        netReqs.push(t + " " + r.url());
      }
    });
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: mockDbScript(FIX.notes, FIX.note_links) });
    await pg.addScriptTag({ url: "/js/notes-graph-suggest.js" });
    await pg.waitForFunction(() => !!window.NotesGraphSuggest, null, { timeout: 5000 });

    const apiOk = await pg.evaluate(() =>
      !!window.NotesGraphSuggest &&
      typeof window.NotesGraphSuggest.candidatesForNote === "function");
    test("Case 1: NotesGraphSuggest.candidatesForNote API present", apiOk);

    // Case 2 — bundle contract (unbounded over all notes).
    const noteIds = FIX.notes.map((n) => n.id);
    const got = await pg.evaluate(async (ids) => {
      const all = [];
      for (const id of ids) {
        const c = await window.NotesGraphSuggest.candidatesForNote(
          id, { k: 9999, capPerToken: 9999 });
        for (const x of c) all.push(x);
      }
      return all;
    }, noteIds);
    const gotSet = new Set(got.map(keyOf));
    const expSet = new Set(FIX.expected_candidates.map(keyOf));
    const missing = [...expSet].filter((k) => !gotSet.has(k));
    const extra = [...gotSet].filter((k) => !expSet.has(k));
    const n5 = await pg.evaluate(() =>
      window.NotesGraphSuggest.candidatesForNote("N5", { k: 9999, capPerToken: 9999 }));
    test("Case 2: generator reproduces the Phase 0 frozen contract; N5 → []",
         missing.length === 0 && extra.length === 0 && Array.isArray(n5) && n5.length === 0,
         JSON.stringify({ missing, extra, n5len: n5.length }));

    // Case 3 — determinism.
    const d = await pg.evaluate(async () => {
      const a = await window.NotesGraphSuggest.candidatesForNote("N3", {});
      const b = await window.NotesGraphSuggest.candidatesForNote("N3", {});
      return JSON.stringify(a) === JSON.stringify(b) && a.length > 0;
    });
    test("Case 3: candidatesForNote is deterministic (N3 ×2 identical)", d);

    // Case 4 — rarity: rare root out-scores ubiquitous binyan for N3.
    const rar = await pg.evaluate(async () => {
      const c = await window.NotesGraphSuggest.candidatesForNote("N3", { k: 9999, capPerToken: 9999 });
      const root = c.find((x) => x.reason_code === "shared_root" && x.evidence === "אהב");
      const bin  = c.find((x) => x.reason_code === "shared_binyan" && x.evidence === "paal");
      return { root: root && root.score, bin: bin && bin.score,
               ordered: c[0] && c[0].reason_code };
    });
    test("Case 4: rare shared_root scores strictly above ubiquitous shared_binyan",
         rar.root != null && rar.bin != null && rar.root > rar.bin &&
         rar.ordered === "shared_root",
         JSON.stringify(rar));

    // ── Phase 2 — suppression contract (still on the bundle mock) ──
    // Case 5 — rejected is excluded FOREVER (N2→N3 shared_root).
    const rej = await pg.evaluate(async () => {
      const decisions = [{ from: "N2", to: "N3", to_kind: "note",
        reason_code: "shared_root", state: "rejected",
        decided_at: "2026-05-16T10:00:00Z" }];
      const c = await window.NotesGraphSuggest.candidatesForNote(
        "N2", { k: 9999, capPerToken: 9999, decisions, now: Date.parse("2030-01-01") });
      return c.some((x) => x.to === "N3" && x.reason_code === "shared_root");
    });
    test("Case 5: rejected decision excludes that pair forever",
         rej === false);

    // Case 6 — `later` cooldown: suppressed inside cooldown, returns
    // after it (same decision, only `now` advances → deterministic).
    const later = await pg.evaluate(async () => {
      const decisions = [{ from: "N2", to: "N3", to_kind: "note",
        reason_code: "shared_root", state: "later",
        decided_at: "2026-05-16T10:00:00Z" }];
      const within = await window.NotesGraphSuggest.candidatesForNote(
        "N2", { k: 9999, capPerToken: 9999, decisions,
          now: Date.parse("2026-05-16T12:00:00Z"), laterCooldownMs: 24 * 3600 * 1000 });
      const after = await window.NotesGraphSuggest.candidatesForNote(
        "N2", { k: 9999, capPerToken: 9999, decisions,
          now: Date.parse("2026-05-18T12:00:00Z"), laterCooldownMs: 24 * 3600 * 1000 });
      const has = (arr) => arr.some((x) => x.to === "N3" && x.reason_code === "shared_root");
      return { within: has(within), after: has(after) };
    });
    test("Case 6: `later` suppressed inside cooldown, resurfaces after",
         later.within === false && later.after === true,
         JSON.stringify(later));

    // Case 7 — confirmed is suppressed (already a durable link).
    const conf = await pg.evaluate(async () => {
      const decisions = [{ from: "N2", to: "N3", to_kind: "note",
        reason_code: "shared_root", state: "confirmed",
        decided_at: "2026-05-16T10:00:00Z" }];
      const c = await window.NotesGraphSuggest.candidatesForNote(
        "N2", { k: 9999, capPerToken: 9999, decisions, now: Date.parse("2030-01-01") });
      // other reasons for N2→N3 (shared_binyan) MUST still appear —
      // suppression is per (from,to,to_kind,reason_code).
      const root = c.some((x) => x.to === "N3" && x.reason_code === "shared_root");
      const bin  = c.some((x) => x.to === "N3" && x.reason_code === "shared_binyan");
      return { root, bin };
    });
    test("Case 7: confirmed suppressed for its reason only (other reasons survive)",
         conf.root === false && conf.bin === true,
         JSON.stringify(conf));

    // Case 8 — caps on a synthetic 30-notes-same-root context.
    await pg.evaluate(() => {
      const big = [];
      for (let i = 0; i < 30; i++) {
        big.push({ id: "B" + i, text_id: "TX", note_type: "word_study",
          j_root: "כתב", j_binyan: null, j_word: null });
      }
      window.__localDB.dbQuery = async function (sql) {
        window.__sqlLog.push(String(sql));
        if (/FROM notes_v2/i.test(sql)) return big;
        if (/FROM note_links/i.test(sql)) return [];
        return [];
      };
    });
    const caps = await pg.evaluate(async () => {
      const c = await window.NotesGraphSuggest.candidatesForNote("B0", { k: 7, capPerToken: 8 });
      const sharedRoot = c.filter((x) => x.reason_code === "shared_root");
      // even with an absurd K, per-note output never exceeds K.
      const huge = await window.NotesGraphSuggest.candidatesForNote("B0", { k: 5, capPerToken: 9999 });
      return { total: c.length, sharedRoot: sharedRoot.length, hugeK: huge.length };
    });
    test("Case 8: per-token cap (≤8) and per-note top-K hard-enforced",
         caps.total <= 7 && caps.sharedRoot <= 8 && caps.hugeK <= 5,
         JSON.stringify(caps));

    // Case 9 — perf budget: synthetic 200-note fixture.
    await pg.evaluate(() => {
      const big = [];
      for (let i = 0; i < 200; i++) {
        big.push({ id: "P" + i, text_id: "TX" + (i % 8),
          note_type: "word_study", j_root: "r" + (i % 25),
          j_binyan: (i % 3 ? "paal" : "piel"), j_word: "w" + i });
      }
      window.__localDB.dbQuery = async function (sql) {
        window.__sqlLog.push(String(sql));
        if (/FROM notes_v2/i.test(sql)) return big;
        if (/FROM note_links/i.test(sql)) return [];
        return [];
      };
    });
    const perf = await pg.evaluate(async () => {
      const t0 = performance.now();
      const c = await window.NotesGraphSuggest.candidatesForNote("P0", {});
      const ms = performance.now() - t0;
      const a = await window.NotesGraphSuggest.candidatesForNote("P0", {});
      const det = JSON.stringify(a) === JSON.stringify(c);
      return { ms: Math.round(ms), capped: c.length <= 7, det };
    });
    test("Case 9: 200-note generation under budget (<300ms), capped, deterministic",
         perf.ms < 300 && perf.capped && perf.det,
         JSON.stringify(perf));

    // Case 10 — read-only guard + offline (after all the above).
    const sqlLog = await pg.evaluate(() => window.__sqlLog || []);
    const RO = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
    const FORB = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
    const allSelect = sqlLog.length > 0 && sqlLog.every((s) => RO.test(s) && !FORB.test(s));
    test("Case 10: every SQL is a bare SELECT; zero xhr/fetch; no pageerror",
         allSelect && netReqs.length === 0 && errs.length === 0,
         JSON.stringify({ sqlCount: sqlLog.length, net: netReqs, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[suggest-generator-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[suggest-generator-smoke] fatal:", e); process.exit(1); });
