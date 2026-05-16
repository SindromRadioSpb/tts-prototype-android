#!/usr/bin/env node
// scripts/notes-ui/suggest-srs-candidate-smoke.js — v3.6 Phase 6.
//
// Pins the SRS/quiz CANDIDATE-OBJECT generator. Hard scope: produces
// candidate objects ONLY — no SRS engine change, no srs_* access, no
// card creation, no UI, no network/telemetry, no mutation.
//
// Cases:
//   1. Static: notes-graph-srs-candidates.js has no network call-site
//      and no srs_* / write reference at all.
//   2. API shape (NotesGraphSrsCandidates.fromConfirmed) + a confirmed
//      row → well-formed deterministic candidate (kind/from/to/
//      reason/evidence/labels/prompt/answer); twice → identical.
//   3. Only `confirmed` rows yield candidates — the issued SQL
//      filters `state = 'confirmed'` at the DB.
//   4. No SRS engine touch: every dbQuery is a bare SELECT, NONE
//      references an srs_* table; no INSERT/UPDATE; addNoteLink /
//      upsertSuggestion never called.
//   5. Offline: zero xhr/fetch; no pageerror.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3242;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO, env: { ...process.env, PORT: String(PORT) },
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
  const ok = await new Promise((res) => {
    const t = setTimeout(() => res(false), 5000);
    child.once("exit", () => { clearTimeout(t); res(true); });
  });
  if (!ok && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}
async function waitReady(ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__sqlLog = [];
  window.__writeCalls = [];
  window.__localDB = {
    isReady: function () { return true; },
    addNoteLink: async function () { window.__writeCalls.push("addNoteLink"); },
    upsertSuggestion: async function () { window.__writeCalls.push("upsertSuggestion"); },
    dbQuery: async function (sql) {
      window.__sqlLog.push(String(sql));
      if (/FROM note_link_suggestions/i.test(sql)) {
        // module filters state='confirmed' in SQL; mock returns the
        // confirmed set it would get.
        return [
          { from_note_id:"n1", to_kind:"note", to_id:"n2", reason_code:"shared_root",  evidence:"למד" },
          { from_note_id:"n3", to_kind:"note", to_id:"n4", reason_code:"shared_lemma", evidence:"שלום" }
        ];
      }
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"n1", title:"למדתי", j_word:"למד" },
        { id:"n2", title:"תלמיד", j_word:"תלמיד" },
        { id:"n3", title:"", j_word:"שלום" },
        { id:"n4", title:"שלומית", j_word:"שלום" }
      ];
      return [];
    },
  };
  window.MorphNormalize = { normalizeHebrew: function (w){ return String(w||"").trim(); } };
`;

async function main() {
  // Case 1 — static purity scan (no browser).
  function strip(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }
  const src = strip(fs.readFileSync(
    path.join(REPO, "public/js/notes-graph-srs-candidates.js"), "utf8"));
  // Narrow: a real srs_* TABLE access (FROM/INTO/UPDATE/JOIN srs_) or
  // any write/telemetry call-site. The legit `srs_template` field name
  // and the module's own defensive `srs_` guard regex are NOT matches.
  const NET = /\bfetch\s*\(|new\s+XMLHttpRequest|\.sendBeacon\s*\(|new\s+EventSource|new\s+WebSocket/;
  const SRSWRITE = /(FROM|INTO|UPDATE|JOIN)\s+srs_|INSERT\s+INTO\s+\w|UPDATE\s+\w+\s+SET|recordEvent\s*\(|emitEvent\s*\(/i;
  test("Case 1: module has no network call-site and no srs_* table access / write",
       !NET.test(src) && !SRSWRITE.test(src),
       JSON.stringify({ net: NET.test(src), srsWrite: SRSWRITE.test(src) }));

  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[suggest-srs-candidate-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitReady())) {
    console.error("[suggest-srs-candidate-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[suggest-srs-candidate-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  const net = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    pg.on("request", (r) => {
      const t = r.resourceType();
      if (t === "xhr" || t === "fetch" || t === "websocket") net.push(t);
    });
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: MOCK_DB });
    await pg.addScriptTag({ url: "/js/notes-graph-srs-candidates.js" });
    await pg.waitForFunction(() => !!window.NotesGraphSrsCandidates, null, { timeout: 5000 });
    const netMark = net.length;

    const c2 = await pg.evaluate(async () => {
      const api = window.NotesGraphSrsCandidates;
      const a = await api.fromConfirmed();
      const b = await api.fromConfirmed();
      const c0 = a[0] || {};
      return {
        isFn: typeof api.fromConfirmed === "function",
        count: a.length,
        deterministic: JSON.stringify(a) === JSON.stringify(b),
        c0: c0,
        promptHasLabels: /למדתי/.test(c0.prompt || "") && /תלמיד/.test(c0.prompt || ""),
        answerHasRoot: /למד/.test(c0.answer || ""),
      };
    });
    test("Case 2: well-formed deterministic candidate from a confirmed link",
         c2.isFn && c2.count === 2 && c2.deterministic &&
         c2.c0.kind === "connection_recall" && c2.c0.from === "n1" &&
         c2.c0.to === "n2" && c2.c0.reason_code === "shared_root" &&
         c2.c0.evidence === "למד" && c2.c0.srs_template === "note_connection" &&
         c2.promptHasLabels && c2.answerHasRoot,
         JSON.stringify(c2.c0));

    const sqlLog = await pg.evaluate(() => window.__sqlLog || []);
    const confirmedFiltered = sqlLog.some((s) =>
      /FROM note_link_suggestions/i.test(s) && /state\s*=\s*'confirmed'/i.test(s));
    test("Case 3: only confirmed — SQL filters state='confirmed' at the DB",
         confirmedFiltered, JSON.stringify(sqlLog));

    const RO = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
    const FORB = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
    const SRS = /\bsrs_[a-z_]+/i;
    const writes = await pg.evaluate(() => window.__writeCalls || []);
    const cleanSql = sqlLog.length > 0 &&
      sqlLog.every((s) => RO.test(s) && !FORB.test(s) && !SRS.test(s));
    test("Case 4: no SRS engine touch — SELECT-only, no srs_*, no writes",
         cleanSql && writes.length === 0,
         JSON.stringify({ sql: sqlLog.length, writes }));

    test("Case 5: offline — zero xhr/fetch during generation; no pageerror",
         (net.length - netMark) === 0 && errs.length === 0,
         JSON.stringify({ netDelta: net.length - netMark, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[suggest-srs-candidate-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[suggest-srs-candidate-smoke] fatal:", e); process.exit(1); });
