#!/usr/bin/env node
"use strict";

// autogen-srs-browser-smoke.js — Stage 4 (Concept D, Option B) smoke.
//
// Covers per-text learning coverage + the i+1 SRS frontier seed (creation only;
// review stays in Anki — locked SRS strategy):
//   • setting round-trip v3NotesSrsSeedMode on/off (default off)
//   • getTextLearningCoverage buckets (known/learning/new) + i1_ratio on a fixture
//   • frontier = uncarded notes whose root family is ENGAGED (cold-start excluded)
//   • v3NotesSeedFrontierToSrs creates one card per frontier note (word_study),
//     IDEMPOTENT (re-run creates 0), and the seeded notes leave the frontier
//
// Fixture (canonical word_study notes, occurrences in text T_SRS):
//   root כתב:  A=known(carded)  B=new(uncarded)   → B frontier (engaged root)
//   root למד:  C=learning(carded) D=new(uncarded) → D frontier (engaged root)
//   root שמר:  E=new F=new (cold — no carded sibling) → NOT frontier
//   root אכל:  G=known(carded, no uncarded sibling) → nothing to seed
//   Expect: total 7 · known 2 (A,G) · learning 1 (C) · new 4 (B,D,E,F) · i1 71% · frontier [B,D]
//
// Headless OPFS init is best-effort — if it can't initialize, DB cases are SKIPPED.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3253;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
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
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[autogen-srs-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[autogen-srs-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[autogen-srs-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      // ── setting round-trip ─────────────────────────────────────────────
      window.v3NotesSetSrsSeedMode(false); out.defOff = window.v3NotesSrsSeedMode() === "off";
      window.v3NotesSetSrsSeedMode(true);  out.setOn = window.v3NotesSrsSeedMode() === "on";
      window.v3NotesSetSrsSeedMode(false); out.setOff = window.v3NotesSrsSeedMode() === "off";

      // ── DB-dependent ───────────────────────────────────────────────────
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.getTextLearningCoverage === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((r) => setTimeout(r, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const T = "T_SRS";
      // clean prior fixture (idempotent re-runs)
      try {
        const old = await ldb.dbQuery("SELECT DISTINCT note_id FROM note_occurrences WHERE text_id = ?", [T]);
        for (const o of (old || [])) { try { await ldb.deleteNoteById(o.note_id); } catch (_) {} }
      } catch (_) {}

      const mkNote = async (key, root, word) => {
        const n = await ldb.createCanonicalNote({
          gen_dedup_key: "pid:SRS_" + key, source: "auto", confidence: 0.9, model_version: "v", user_touched: 0,
          title: word, body: { word, root, lemma: word, pos: "verb", part_of_speech: "verb", meaning: "m_" + key, pealim_id: "SRS_" + key },
        });
        await ldb.addNoteOccurrence(n.id, { text_id: T, sentence_id: "S1", word_offset: 0, surface: word });
        return n.id;
      };
      const cardNote = async (noteId, state) => {
        const cid = "card_" + noteId;
        const due = new Date(Date.now() + 86400000).toISOString();
        await ldb.dbRun(
          "INSERT INTO srs_cards (id, entity_type, entity_id, template_id, source_note_id, state, due_date, lapses, reps) VALUES (?,?,?,?,?,?,?,0,1)",
          [cid, "note", noteId, "tpl_note_word_study", noteId, state, due]);
        await ldb.dbRun(
          "INSERT INTO srs_attempts (id, card_id, attempt_type, is_correct) VALUES (?,?,?,1)",
          ["att_" + noteId, cid, "recall"]);
        await ldb.dbRun("UPDATE notes_v2 SET srs_card_id = ? WHERE id = ?", [cid, noteId]);
      };

      const A = await mkNote("A", "כתב", "כתב");    await cardNote(A, "review");    // known
      const B = await mkNote("B", "כתב", "כתיבה");                                  // new, engaged → frontier
      const C = await mkNote("C", "למד", "למד");    await cardNote(C, "learning");  // learning
      const D = await mkNote("D", "למד", "לימוד");                                  // new, engaged → frontier
      const E = await mkNote("E", "שמר", "שמר");                                    // cold
      const F = await mkNote("F", "שמר", "שמירה");                                  // cold
      const G = await mkNote("G", "אכל", "אכל");    await cardNote(G, "review");    // known, no uncarded sibling

      const cov = await ldb.getTextLearningCoverage(T);
      out.cov = cov;
      out.covOk = cov && cov.ok;
      out.totals = cov && cov.total === 7 && cov.known === 2 && cov.learning === 1 && cov.new === 4 && cov.weak === 0;
      out.i1 = cov && cov.i1_ratio === 71;
      const fset = new Set((cov && cov.frontier) || []);
      out.frontierExact = fset.size === 2 && fset.has(B) && fset.has(D); // B,D only; cold E,F excluded
      out.coldExcluded = !fset.has(E) && !fset.has(F);

      // seed → 2 created, B/D carded, frontier empties; re-run idempotent
      const s1 = await window.v3NotesSeedFrontierToSrs(T);
      out.seed1 = s1 && s1.created === 2 && s1.skipped === 0;
      const bCard = (await ldb.getNoteById(B)).srs_card_id;
      const dCard = (await ldb.getNoteById(D)).srs_card_id;
      out.seededCards = !!bCard && !!dCard;
      const cov2 = await ldb.getTextLearningCoverage(T);
      out.frontierEmptied = cov2 && Array.isArray(cov2.frontier) && cov2.frontier.length === 0;
      const s2 = await window.v3NotesSeedFrontierToSrs(T);
      out.seedIdempotent = s2 && s2.created === 0;

      // coverage line helper renders
      out.covLine = typeof window.v3NotesCoverageLine === "function" && /📚/.test(window.v3NotesCoverageLine(cov));

      // cleanup
      for (const id of [A, B, C, D, E, F, G]) { try { await ldb.deleteNoteById(id); } catch (_) {} }
      try {
        for (const id of [A, B, C, D, G]) { await ldb.dbRun("DELETE FROM srs_cards WHERE source_note_id = ?", [id]); }
      } catch (_) {}
      return out;
    });

    test("setting round-trip: default off", R.defOff === true);
    test("setting round-trip: on/off persists", R.setOn === true && R.setOff === true);
    if (R.dbSkipped) console.log("  · DB cases skipped (headless OPFS)");
    else {
      test("getTextLearningCoverage ok", R.covOk === true, JSON.stringify(R.cov));
      test("coverage buckets known/learning/new exact (2/1/4, total 7)", R.totals === true, JSON.stringify(R.cov));
      test("i+1 ratio = 71%", R.i1 === true, R.cov && String(R.cov.i1_ratio));
      test("frontier = exactly the 2 engaged-root uncarded notes", R.frontierExact === true, JSON.stringify(R.cov && R.cov.frontier));
      test("cold-start root excluded from frontier", R.coldExcluded === true);
      test("seed creates one card per frontier note (2)", R.seed1 === true);
      test("seeded notes now carded (srs_card_id set)", R.seededCards === true);
      test("frontier empties after seed", R.frontierEmptied === true);
      test("re-seed is idempotent (0 created)", R.seedIdempotent === true);
      test("coverage line helper renders 📚", R.covLine === true);
    }
    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[autogen-srs-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
