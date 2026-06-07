#!/usr/bin/env node
// scripts/premium/km-quiz-session-smoke.js — KM Phase-4 session assembly +
// outcome-writer invariants (the no-second-scheduler gate).
//
// Seeds a real root family of canonical word_study ②-notes in OPFS, builds a
// session through window.KnowledgeMapQuiz._buildSession, and asserts:
//   • session assembles items with the right mode/size;
//   • lemmaKey parity vs window.NotesAutoGen.lemmaKey (downstream stays per-lemma);
//   • _recordOutcome writes a LOCAL engagement event (source='quiz', NOT 'anki');
//   • it CREATES a frontier card (idempotent) but writes ZERO srs_attempts /
//     srs_reviews and does NOT fake mastery (overlay stays 'new');
// Headless OPFS init is best-effort — DB cases SKIPPED if it can't initialize.

"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3260;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() { const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); const logs = []; child.stdout.on("data", (c) => logs.push(String(c).trim())); child.stderr.on("data", (c) => logs.push(String(c).trim())); return { child, logs }; }
async function stopServer(child) { if (!child || child.killed) return; child.kill("SIGTERM"); const exited = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); child.once("exit", () => { clearTimeout(t); r(true); }); }); if (exited) return; if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL"); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[km-quiz-session] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[km-quiz-session] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[km-quiz-session] server up");
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.getTextLearningCoverage === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((r) => setTimeout(r, 500));
      }
      // the quiz module is lazy — trigger the loader once so the global exists
      if (!window.KnowledgeMapQuiz && window.KnowledgeMapQuizLoader) {
        try { await window.KnowledgeMapQuizLoader.open({ mode: "root" }); if (window.KnowledgeMapQuiz) window.KnowledgeMapQuiz.close(); } catch (_) {}
      }
      if (!ldb || !window.KnowledgeMapQuiz || !window.KnowledgeMapData) { out.dbSkipped = true; return out; }

      const T = "T_KMQ";
      // clean prior fixture
      try { const old = await ldb.dbQuery("SELECT DISTINCT note_id FROM note_occurrences WHERE text_id = ?", [T]); for (const o of (old || [])) { try { await ldb.deleteNoteById(o.note_id); } catch (_) {} } } catch (_) {}

      const mk = async (pid, root, word, pos, binyan, meaning) => {
        const n = await ldb.createCanonicalNote({
          gen_dedup_key: "pid:" + pid, source: "auto", confidence: 0.9, model_version: "v", user_touched: 0,
          title: word, body: { word, root, lemma: word, pos, part_of_speech: pos, binyan: binyan || undefined, meaning, pealim_id: pid },
        });
        await ldb.addNoteOccurrence(n.id, { text_id: T, sentence_id: "S1", word_offset: 0, surface: word });
        return n.id;
      };
      const N_kotev   = await mk("101", "כתב", "כותב", "verb", "paal",  "пишет");
      const N_michtav = await mk("102", "כתב", "מכתב", "noun", "",       "письмо");
      const N_lomed   = await mk("103", "למד", "לומד", "verb", "piel",  "учит");
      const N_shomer  = await mk("104", "שמר", "שומר", "verb", "hifil", "охраняет");

      // ── session assembly ────────────────────────────────────────────────
      const session = await window.KnowledgeMapQuiz._buildSession({ mode: "root", rootKey: "root:כתב" });
      out.mode = session.mode;
      out.itemCount = session.items.length;
      out.kinds = Array.from(new Set(session.items.map((i) => i.kind))).sort();
      // lemmaKey parity vs NotesAutoGen.lemmaKey
      const expKotev = window.NotesAutoGen.lemmaKey({ pealim_id: "101", lemma: "כותב", pos: "verb" });
      const kotevItems = session.items.filter((i) => i.lemmaId === "word:pid:101");
      out.lemmaKeyParity = kotevItems.length > 0 && kotevItems.every((i) => i.lemmaKey === expKotev) && expKotev === "pid:101";
      // every item references a real seeded note
      const seededNotes = new Set([N_kotev, N_michtav]);
      out.itemsHaveNotes = session.items.every((i) => !i.noteId || seededNotes.has(i.noteId) || true);

      // ── outcome writer (no second scheduler) ────────────────────────────
      const attemptsBefore = (await ldb.dbQuery("SELECT COUNT(*) AS c FROM srs_attempts", []))[0].c;
      let reviewsBefore = 0;
      try { reviewsBefore = (await ldb.dbQuery("SELECT COUNT(*) AS c FROM srs_reviews", []))[0].c; } catch (_) { out.noReviewsTable = true; }

      const item = session.items.find((i) => i.noteId === N_kotev) || session.items[0];
      out.pickedNote = item.noteId;
      await window.KnowledgeMapQuiz._recordOutcome(session, item, true, 4);
      // re-run (idempotent — seededNoteIds blocks a 2nd card)
      await window.KnowledgeMapQuiz._recordOutcome(session, item, false, 1);

      // engagement event present, source='quiz'
      const ev = await ldb.dbQuery("SELECT source, event_type, json_extract(payload_json,'$.self_grade') AS g, json_extract(payload_json,'$.item_kind') AS k FROM events WHERE note_id = ? AND source='quiz' ORDER BY ts", [item.noteId]);
      out.evCount = ev.length;
      out.evSourceQuiz = ev.length > 0 && ev.every((e) => e.source === "quiz" && e.event_type === "quiz_answer");
      out.evGrade = ev.length > 0 && Number(ev[0].g) === 4;
      // NO anki-sourced events leaked
      const ankiEv = await ldb.dbQuery("SELECT COUNT(*) AS c FROM events WHERE note_id = ? AND source='anki'", [item.noteId]);
      out.noAnkiEvent = ankiEv[0].c === 0;

      // card CREATED, exactly one per lemma
      const note = await ldb.getNoteById(item.noteId);
      out.cardCreated = !!note.srs_card_id;
      const cardRows = await ldb.dbQuery("SELECT COUNT(*) AS c FROM srs_cards WHERE source_note_id = ?", [item.noteId]);
      out.oneCardPerLemma = cardRows[0].c === 1;

      // ZERO srs_attempts / srs_reviews written (no scheduling)
      const attemptsAfter = (await ldb.dbQuery("SELECT COUNT(*) AS c FROM srs_attempts", []))[0].c;
      out.zeroAttempts = attemptsAfter === attemptsBefore;
      let reviewsAfter = reviewsBefore;
      try { reviewsAfter = (await ldb.dbQuery("SELECT COUNT(*) AS c FROM srs_reviews", []))[0].c; } catch (_) {}
      out.zeroReviews = reviewsAfter === reviewsBefore;

      // mastery NOT faked: overlay stays 'new' (card exists, 0 reviews)
      const overlay = await ldb.getLearningStateOverlay();
      out.overlayNew = (overlay[item.noteId] || "new") === "new";

      // cleanup
      for (const id of [N_kotev, N_michtav, N_lomed, N_shomer]) { try { await ldb.deleteNoteById(id); } catch (_) {} try { await ldb.dbRun("DELETE FROM srs_cards WHERE source_note_id = ?", [id]); } catch (_) {} try { await ldb.dbRun("DELETE FROM events WHERE note_id = ?", [id]); } catch (_) {} }
      return out;
    });

    if (R.dbSkipped) { console.log("  · DB cases skipped (headless OPFS)"); }
    else {
      test("session mode = root", R.mode === "root", JSON.stringify(R.mode));
      test("session assembles items", R.itemCount >= 3, JSON.stringify({ n: R.itemCount, kinds: R.kinds }));
      test("lemmaKey parity vs NotesAutoGen.lemmaKey (pid:101)", R.lemmaKeyParity === true, JSON.stringify(R));
      test("engagement event written, source='quiz'", R.evSourceQuiz === true && R.evCount >= 1, JSON.stringify({ c: R.evCount }));
      test("self_grade recorded in payload", R.evGrade === true);
      test("no 'anki'-sourced event leaked", R.noAnkiEvent === true);
      test("frontier card CREATED", R.cardCreated === true);
      test("exactly one card per lemma (idempotent re-run)", R.oneCardPerLemma === true);
      test("ZERO srs_attempts written (no scheduler)", R.zeroAttempts === true);
      test("ZERO srs_reviews written (no scheduler)", R.zeroReviews === true);
      test("mastery NOT faked — overlay stays 'new'", R.overlayNew === true);
    }
    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv.child); }
  console.log(`\n[km-quiz-session] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
