#!/usr/bin/env node
// scripts/notes-graph/suggest-persist-smoke.js — v3.6 Phase 4.
//
// Proves the durable decision lifecycle:
//   - the note_link_suggestions migration is appended & idempotent;
//   - the suggest/confirm modules are statically network/telemetry
//     free (privacy invariant for the confirm flow — kept here,
//     feature-cohesive, instead of bloating the graph privacy-smoke);
//   - confirm persists + writes a durable note_links row AND survives
//     an editor "reopen"; reject is suppressed FOREVER; later is
//     suppressed inside the cooldown and resurfaces after it.
//
// Browser portion drives the real panel + a faithful in-memory
// note_link_suggestions store (same harness pattern as every other
// DB-touching smoke in this repo; real wa-sqlite SQL is exercised in
// production and is plain UPSERT/SELECT).
//
// Cases:
//   1. Migration appended (version = MIGRATIONS.length), idempotent
//      (IF NOT EXISTS), no destructive verbs, FK + reason_code PK.
//   2. Static: notes-graph-suggest.js & notes-link-suggest-ui.js
//      contain no fetch/XHR/sendBeacon/EventSource/`events` writes.
//   3. Confirm → durable note_links (addNoteLink once) + persisted
//      `confirmed`; after an editor REOPEN the card stays hidden.
//   4. Reject persists `rejected` and is suppressed FOREVER
//      (generator, now far in the future).
//   5. `later` suppressed inside cooldown, resurfaces after it
//      (deterministic — only `now` advances); confirm flow added
//      zero xhr/fetch; no pageerror.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3223;
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

// ── Case 1+2 — pure static checks (no browser) ───────────────────────────
function staticChecks() {
  const mig = fs.readFileSync(path.join(REPO_ROOT, "public/db/migrations.js"), "utf8");
  const posTable = mig.indexOf("CREATE TABLE IF NOT EXISTS note_link_suggestions");
  // appended last: no further CREATE TABLE after ours (it is the
  // newest migration element, not an edit of an existing one).
  const noLaterTable = posTable > 0 &&
    mig.indexOf("CREATE TABLE", posTable + 20) === -1;
  const ownBlock = posTable > 0 ? mig.slice(posTable) : "";
  const migOk =
    posTable > 0 && noLaterTable &&
    /CREATE INDEX IF NOT EXISTS ix_nls_from/.test(mig) &&
    /CREATE INDEX IF NOT EXISTS ix_nls_state/.test(mig) &&
    /PRIMARY KEY \(from_note_id, to_kind, to_id, reason_code\)/.test(mig) &&
    /FOREIGN KEY \(from_note_id\) REFERENCES notes_v2\(id\) ON DELETE CASCADE/.test(mig) &&
    // destructive STATEMENTS only — "ON DELETE CASCADE" is a benign
    // FK clause, not a DELETE FROM.
    !/\b(DROP\s+TABLE|ALTER\s+TABLE|DELETE\s+FROM|TRUNCATE)\b/i.test(ownBlock);
  test("Case 1: note_link_suggestions migration appended & idempotent & non-destructive",
       migOk,
       JSON.stringify({ posTable, noLaterTable }));

  // strip JS comments before scanning so a comment that *describes*
  // the invariant ("no fetch/XHR…") isn't a false positive — we want
  // real call-sites only.
  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }
  const CALL = /\bfetch\s*\(|new\s+XMLHttpRequest|\.sendBeacon\s*\(|new\s+EventSource|new\s+WebSocket/;
  const EVT = /INSERT\s+INTO\s+events|recordEvent\s*\(|emitEvent\s*\(/i;
  const files = ["public/js/notes-graph-suggest.js", "public/js/notes-link-suggest-ui.js"];
  const offenders = [];
  for (const f of files) {
    const src = stripComments(fs.readFileSync(path.join(REPO_ROOT, f), "utf8"));
    if (CALL.test(src)) offenders.push(f + ":network");
    if (EVT.test(src)) offenders.push(f + ":events");
  }
  test("Case 2: suggest/confirm modules contain no network/telemetry call-sites",
       offenders.length === 0, offenders.join(", "));
}

// faithful note_link_suggestions store + spies, injected before app JS.
const SETUP = async () => {
  for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
    const e = document.getElementById(id);
    if (e && e.parentNode) e.parentNode.removeChild(e);
  }
  if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
  window.__sqlLog = [];
  window.__addNoteLinkCalls = [];
  window.__suggestStore = [];
  window.__localDBInitError = null;
  const sk = (s) => [s.from || s.from_note_id, s.to_kind || "note",
    s.to != null ? s.to : s.to_id, s.reason_code].join("|");
  window.__localDB = {
    isReady: () => true,
    upsertSuggestion: async (s) => {
      const row = { from_note_id: s.from, to_kind: s.to_kind || "note",
        to_id: s.to, reason_code: s.reason_code, evidence: s.evidence,
        score: s.score || 0, state: s.state || "pending",
        decided_at: s.decided_at || new Date().toISOString() };
      const i = window.__suggestStore.findIndex((x) => sk({
        from: x.from_note_id, to_kind: x.to_kind, to: x.to_id,
        reason_code: x.reason_code }) === sk(s));
      if (i >= 0) window.__suggestStore[i] = row;
      else window.__suggestStore.push(row);
    },
    listSuggestionDecisions: async (noteId) =>
      window.__suggestStore
        .filter((x) => x.from_note_id === noteId &&
          ["confirmed", "rejected", "later"].includes(x.state))
        .map((x) => ({ from: x.from_note_id, to: x.to_id,
          to_kind: x.to_kind, reason_code: x.reason_code,
          state: x.state, decided_at: x.decided_at })),
    dbQuery: async (sql) => {
      window.__sqlLog.push(String(sql));
      if (/FROM notes_v2/i.test(sql)) return [
        { id: "note-7", title: "My note",     text_id: "TX", note_type: "word_study", j_root: "שלם", j_binyan: "paal", j_word: "שלום" },
        { id: "sib1",   title: "Sibling One", text_id: "TX", note_type: "word_study", j_root: "שלם", j_binyan: "paal", j_word: "שלמה" },
      ];
      if (/FROM note_links/i.test(sql)) return [];
      return [];
    },
    createNote: async () => ({ id: "note-7", updated_at: new Date().toISOString() }),
    updateNote: async () => ({ id: "note-7", updated_at: new Date().toISOString() }),
    listOutgoingLinks: async () => [],
    listBacklinks: async () => [],
    addNoteLink: async (noteId, link) => {
      window.__addNoteLinkCalls.push({ noteId: String(noteId), link });
      return true;
    },
  };
  window.v3NotesOpen("", "", null, { entryKind: "free", targetKind: "free", noteType: "free" });
  const ta = document.getElementById("v3NotesText");
  if (ta) ta.value = "persist body";
  const ed = document.getElementById("v3NotesEditor");
  if (ed) ed.textContent = "persist body";
  try { await window.v3NotesSave(false); } catch (_) {}
};

async function main() {
  staticChecks();

  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[suggest-persist-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[suggest-persist-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[suggest-persist-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  const netReqs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    pg.on("request", (r) => {
      const t = r.resourceType();
      if (t === "xhr" || t === "fetch" || t === "websocket") netReqs.push(t);
    });
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);
    await pg.evaluate(SETUP);
    await sleep(700);                       // debounced suggest render

    const netMark = netReqs.length;

    // Case 3 — confirm → durable link + persisted; survives reopen.
    const c3 = await pg.evaluate(async () => {
      const conf = document.querySelector('[data-sg-act="confirm"]');
      if (!conf) return { noCard: true };
      conf.click();
      await new Promise((r) => setTimeout(r, 800));   // persist + links refresh
      // simulate an editor REOPEN: reset the panel, then re-render
      // from the persisted store (decisions come from the DB layer).
      window.NotesLinkSuggestUI.reset();
      await new Promise((r) => setTimeout(r, 100));
      window.NotesLinkSuggestUI.refresh("note-7");
      await new Promise((r) => setTimeout(r, 600));
      const cardsAfterReopen = Array.prototype.map.call(
        document.querySelectorAll(".v3-notes-suggest-card"),
        (c) => c.textContent);
      const stillConfirmed = window.__suggestStore.some((x) => x.state === "confirmed");
      const linkRow = (window.__addNoteLinkCalls || [])[0] || null;
      // the confirmed (root) pair must NOT reappear after reopen.
      const reappeared = cardsAfterReopen.some((tx) =>
        /Sibling One/.test(tx) && /корень|root|שורש/i.test(tx));
      return { stillConfirmed, addCalls: window.__addNoteLinkCalls.length,
               linkRow, reappeared };
    });
    test("Case 3: confirm writes durable note_links + persists; survives reopen",
         !c3.noCard && c3.stillConfirmed && c3.addCalls === 1 &&
         c3.linkRow && c3.linkRow.link.to_kind === "note" &&
         c3.reappeared === false,
         JSON.stringify(c3));

    // Case 4 — reject persists + suppressed FOREVER (generator-level,
    // now far in the future).
    const c4 = await pg.evaluate(async () => {
      await window.__localDB.upsertSuggestion({
        from: "note-7", to: "sib1", to_kind: "note",
        reason_code: "shared_binyan", evidence: "paal",
        state: "rejected", decided_at: "2026-05-16T10:00:00Z" });
      const decisions = await window.__localDB.listSuggestionDecisions("note-7");
      const c = await window.NotesGraphSuggest.candidatesForNote("note-7", {
        k: 9999, capPerToken: 9999, decisions,
        now: Date.parse("2031-01-01") });
      return c.some((x) => x.to === "sib1" && x.reason_code === "shared_binyan");
    });
    test("Case 4: rejected decision suppresses that pair forever",
         c4 === false);

    // Case 5 — later: suppressed inside cooldown, resurfaces after;
    // confirm flow added zero xhr/fetch; no pageerror.
    const c5 = await pg.evaluate(async () => {
      await window.__localDB.upsertSuggestion({
        from: "note-7", to: "sib1", to_kind: "note",
        reason_code: "same_text", evidence: "TX",
        state: "later", decided_at: "2026-05-16T10:00:00Z" });
      const decisions = await window.__localDB.listSuggestionDecisions("note-7");
      const within = await window.NotesGraphSuggest.candidatesForNote("note-7", {
        k: 9999, capPerToken: 9999, decisions,
        now: Date.parse("2026-05-16T12:00:00Z"), laterCooldownMs: 24 * 3600 * 1000 });
      const after = await window.NotesGraphSuggest.candidatesForNote("note-7", {
        k: 9999, capPerToken: 9999, decisions,
        now: Date.parse("2026-05-18T12:00:00Z"), laterCooldownMs: 24 * 3600 * 1000 });
      const has = (a) => a.some((x) => x.to === "sib1" && x.reason_code === "same_text");
      return { within: has(within), after: has(after) };
    });
    test("Case 5: `later` suppressed in cooldown, resurfaces after; offline; clean",
         c5.within === false && c5.after === true &&
         (netReqs.length - netMark) === 0 && errs.length === 0,
         JSON.stringify({ c5, netDelta: netReqs.length - netMark, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[suggest-persist-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[suggest-persist-smoke] fatal:", e); process.exit(1); });
