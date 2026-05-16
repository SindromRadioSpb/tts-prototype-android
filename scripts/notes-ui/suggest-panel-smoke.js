#!/usr/bin/env node
// scripts/notes-ui/suggest-panel-smoke.js — v3.6 Phase 3.
//
// Pins the "Подтвердите связи / Confirm what you know" panel: it
// renders read-only A2 candidates inside the saved-note Links panel,
// uses the MANDATED pedagogical wording, and the 3 learner actions
// update the UI via the in-memory suppression contract WITHOUT any
// durable write (durability is Phase 4) and without graph mutation.
//
// Cases:
//   1. After saving a note, the panel is visible with ≥1 candidate
//      card; heading + buttons use pedagogical i18n (NOT "Accept").
//   2. ARIA: region+label, status role/aria-live; card has a reason
//      chip + a real target label.
//   3. «Не связано» (reject) removes the card + DURABLY persists a
//      `rejected` decision (suppression hides it); status announces.
//   4. «Я понимаю связь» (confirm) persists `confirmed` AND writes a
//      durable note_links row (addNoteLink once) — Phase 4; still
//      offline, no graph mutation, no telemetry.
//   5. 414 px reflow: panel renders, card row has no horizontal
//      overflow. No pageerror; zero xhr/fetch; generator SQL is
//      SELECT-only.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3222;
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

// Open a fresh free note, save it through a stubbed createNote so the
// host sets v3NotesModalNoteId itself (script-scoped let). The stub
// dbQuery feeds the generator a note set where the saved note shares
// root/binyan/text with one sibling → ≥1 candidate.
const SETUP = async () => {
  for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
    const e = document.getElementById(id);
    if (e && e.parentNode) e.parentNode.removeChild(e);
  }
  if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
  window.__sqlLog = [];
  window.__addNoteLinkCalls = [];
  window.__suggestStore = [];          // faithful note_link_suggestions
  window.__localDBInitError = null;
  const _skey = (s) => [s.from || s.from_note_id, s.to_kind || "note",
    s.to != null ? s.to : s.to_id, s.reason_code].join("|");
  window.__localDB = {
    isReady: () => true,
    upsertSuggestion: async (s) => {
      const k = _skey(s);
      const row = {
        from_note_id: s.from, to_kind: s.to_kind || "note", to_id: s.to,
        reason_code: s.reason_code, evidence: s.evidence,
        score: s.score || 0, state: s.state || "pending",
        decided_at: s.decided_at || new Date().toISOString(),
      };
      const i = window.__suggestStore.findIndex((x) => _skey({
        from: x.from_note_id, to_kind: x.to_kind, to: x.to_id,
        reason_code: x.reason_code }) === k);
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
        { id: "note-7", title: "My note",     text_id: "TX",  note_type: "word_study", j_root: "שלם", j_binyan: "paal", j_word: "שלום" },
        { id: "sib1",   title: "Sibling One", text_id: "TX",  note_type: "word_study", j_root: "שלם", j_binyan: "paal", j_word: "שלמה" },
        { id: "sib2",   title: "Other",       text_id: "TX2", note_type: "word_study", j_root: "כתב", j_binyan: "piel", j_word: "כתב" },
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
  if (ta) ta.value = "panel body";
  const ed = document.getElementById("v3NotesEditor");
  if (ed) ed.textContent = "panel body";
  try { await window.v3NotesSave(false); } catch (_) {}
};

async function runContext(browser, vp, errs, netReqs) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: vp });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e.message || e)));
  pg.on("request", (r) => {
    const t = r.resourceType();
    if (t === "xhr" || t === "fetch" || t === "websocket") netReqs.push(t + " " + r.url());
  });
  await pg.goto(BASE + "/index.html", { waitUntil: "load" });
  await sleep(800);
  await pg.evaluate(SETUP);
  // suggest refresh is debounced (~300ms) off v3NotesLinksRefresh.
  await sleep(700);
  return { ctx, pg };
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[suggest-panel-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[suggest-panel-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[suggest-panel-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  const netReqs = [];
  try {
    // ── Desktop ───────────────────────────────────────────────────────
    const d = await runContext(browser, { width: 1280, height: 900 }, errs, netReqs);

    const c1 = await d.pg.evaluate(() => {
      const p = document.getElementById("v3NotesSuggestPanel");
      const list = document.getElementById("v3NotesSuggestList");
      const cards = list ? list.querySelectorAll(".v3-notes-suggest-card") : [];
      const head = p ? p.querySelector('[data-i18n="notes.suggest.title"]') : null;
      const btns = list ? Array.prototype.map.call(
        list.querySelectorAll("[data-sg-act]"), (b) => b.textContent.trim()) : [];
      return {
        visible: !!(p && p.style.display !== "none"),
        cards: cards.length,
        head: head ? head.textContent.trim() : "",
        btns: btns,
      };
    });
    const pedHead = /Подтвердите|Confirm what you know|אשרו/.test(c1.head);
    const pedBtns = c1.btns.some((b) => /Я понимаю|I understand|אני מבין/.test(b)) &&
      !c1.btns.some((b) => /^Accept$|^Reject$/i.test(b));
    test("Case 1: panel visible, ≥1 card, pedagogical heading + buttons",
         c1.visible && c1.cards >= 1 && pedHead && pedBtns,
         JSON.stringify(c1));

    const c2 = await d.pg.evaluate(() => {
      const p = document.getElementById("v3NotesSuggestPanel");
      const st = document.getElementById("v3NotesSuggestStatus");
      const card = document.querySelector(".v3-notes-suggest-card");
      return {
        role: p && p.getAttribute("role"),
        hasLabel: !!(p && (p.getAttribute("aria-label") || p.getAttribute("data-i18n-aria-label"))),
        stRole: st && st.getAttribute("role"),
        stLive: st && st.getAttribute("aria-live"),
        cardText: card ? card.textContent : "",
      };
    });
    test("Case 2: ARIA region+label, aria-live status, reason+label in card",
         c2.role === "region" && c2.hasLabel &&
         c2.stRole === "status" && c2.stLive === "polite" &&
         /Sibling One/.test(c2.cardText) &&
         /корень|root|שורש|текст|text|טקסט|биньян|binyan/i.test(c2.cardText),
         JSON.stringify({ ...c2, cardText: c2.cardText.slice(0, 80) }));

    // Network baseline AFTER app boot + panel render: from here on the
    // learner actions (reject/confirm) MUST add zero xhr/fetch. (We
    // don't assert net==0 globally — index.html is the real app and
    // legitimately fetches its own assets/i18n on boot; the Phase 3
    // invariant is that the suggest/confirm flow itself is offline.)
    const netMark = netReqs.length;

    const c3 = await d.pg.evaluate(async () => {
      const before = document.querySelectorAll(".v3-notes-suggest-card").length;
      const rej = document.querySelector('[data-sg-act="reject"]');
      rej.click();
      await new Promise((r) => setTimeout(r, 600));   // persist + re-render
      const after = document.querySelectorAll(".v3-notes-suggest-card").length;
      const status = document.getElementById("v3NotesSuggestStatus").textContent;
      return { before, after,
        rejectedPersisted: window.__suggestStore.some((x) => x.state === "rejected"),
        status };
    });
    test("Case 3: «Не связано» removes the card + DURABLY persists rejected",
         c3.before >= 1 && c3.after < c3.before &&
         c3.rejectedPersisted && c3.status.length > 0,
         JSON.stringify({ before: c3.before, after: c3.after }));

    const c4 = await d.pg.evaluate(async () => {
      const conf = document.querySelector('[data-sg-act="confirm"]');
      let clicked = false;
      if (conf) { conf.click(); clicked = true; await new Promise((r) => setTimeout(r, 800)); }
      return {
        clicked,
        confirmedPersisted: window.__suggestStore.some((x) => x.state === "confirmed"),
        addNoteLinkCalls: (window.__addNoteLinkCalls || []).length,
        firstLink: (window.__addNoteLinkCalls || [])[0] || null,
      };
    });
    const actionsOffline = netReqs.length === netMark;
    test("Case 4: «Я понимаю связь» persists confirmed + writes durable note_links, offline",
         c4.clicked && c4.confirmedPersisted &&
         c4.addNoteLinkCalls === 1 &&
         c4.firstLink && c4.firstLink.link && c4.firstLink.link.to_kind === "note" &&
         actionsOffline,
         JSON.stringify({ ...c4, netDelta: netReqs.length - netMark }));

    // v3.6 UX polish — a first-time student with NO candidates must
    // NOT see an empty "Подтвердите связи" box: the whole panel hides
    // (no dead/empty surface). Lock it.
    const c4b = await d.pg.evaluate(async () => {
      const real = window.NotesGraphSuggest.candidatesForNote;
      window.NotesGraphSuggest.candidatesForNote = async () => [];
      window.NotesLinkSuggestUI.refresh("note-7");
      await new Promise((r) => setTimeout(r, 600));
      const p = document.getElementById("v3NotesSuggestPanel");
      const hidden = !p || p.style.display === "none";
      const cards = p ? p.querySelectorAll(".v3-notes-suggest-card").length : -1;
      window.NotesGraphSuggest.candidatesForNote = real;   // restore
      return { hidden, cards };
    });
    test("Case 4b: zero candidates → panel hidden (no empty box for newcomers)",
         c4b.hidden === true && c4b.cards === 0,
         JSON.stringify(c4b));

    await d.pg.close(); await d.ctx.close();

    // ── Mobile 414 px reflow ──────────────────────────────────────────
    const m = await runContext(browser, { width: 414, height: 896 }, errs, netReqs);
    const c5 = await m.pg.evaluate(() => {
      const p = document.getElementById("v3NotesSuggestPanel");
      const card = document.querySelector(".v3-notes-suggest-card");
      const sqlLog = window.__sqlLog || [];
      const RO = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
      const FORB = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
      return {
        visible: !!(p && p.style.display !== "none"),
        overflow: card ? (card.scrollWidth - card.clientWidth) : 0,
        selectOnly: sqlLog.length > 0 && sqlLog.every((s) => RO.test(s) && !FORB.test(s)),
      };
    });
    await m.pg.close(); await m.ctx.close();
    test("Case 5: 414px panel renders, card no overflow; SELECT-only; no pageerror",
         c5.visible && c5.overflow <= 2 && c5.selectOnly && errs.length === 0,
         JSON.stringify({ c5, errs }));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[suggest-panel-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[suggest-panel-smoke] fatal:", e); process.exit(1); });
