#!/usr/bin/env node
"use strict";

// notes-perform-smoke.js — R-3.8 per-form note mode + downstream stays per-lemma.
//
// Verifies, headless:
//   • NotesAutoGen.dedupKey(body,{perForm}) / lemmaKey / buildCandidates: 4 forms
//     of one lemma → 1 candidate (per-lemma, default) vs 4 (per-form); lemmaKey
//     always collapses to the lemma.
//   • setting v3NotesPerFormMode get/set.
//   • DB (best-effort OPFS): 4 per-form notes (one lemma) + occurrences →
//     - getCanonicalWordNotesForText collapses to 1 (Anki keeps per-lemma),
//     - listNotesForRowWithCanonical returns 4 (line list shows 4 cards).

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3262;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => { const tm = setTimeout(() => resolve(false), 5000); child.once("exit", () => { clearTimeout(tm); resolve(true); }); });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); } catch (e) { console.error("[notes-perform-smoke] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[notes-perform-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[notes-perform-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      const NA = window.NotesAutoGen;
      out.hasNA = !!(NA && NA.dedupKey && NA.lemmaKey && NA.buildCandidates);
      out.hasSetting = typeof window.v3NotesPerFormMode === "function" && typeof window.v3NotesSetPerFormMode === "function";

      if (out.hasNA) {
        // 4 forms of lemma טוב (adjective), shared pealim_id.
        const forms = ["טוב", "טובה", "טובים", "טובות"];
        const items = forms.map((w, i) => ({
          unit: { sampleWord: w, niqqud: w, lemma: "טוב", stem: "טוב", pos: "adjective", binyan: "", root: "טוב", kind: "adj" },
          resolved: { confidence: 0.9, status: "ok", meaning: "хороший", pealim_id: "P_tov", trueRoot: "טוב" },
          occurrences: [{ text_id: "T", sentence_id: "S", word_offset: i, surface: w }],
        }));
        const perLemma = NA.buildCandidates(items, { perForm: false });
        const perForm = NA.buildCandidates(items, { perForm: true });
        out.K_perLemmaOne = perLemma.length === 1;          // pid collapses all 4
        out.K_perFormFour = perForm.length === 4;           // ff: per surface
        out.K_perFormKeys = perForm.every((c) => /^ff:/.test(c.dedup_key)) && new Set(perForm.map((c) => c.dedup_key)).size === 4;
        out.K_lemmaCollapses = new Set(perForm.map((c) => NA.lemmaKey(c.body))).size === 1;  // all → pid:P_tov
        // without pealim_id → lemma#pos path
        const items2 = items.map((it) => ({ ...it, resolved: { ...it.resolved, pealim_id: null } }));
        out.K_noPidPerLemmaOne = NA.buildCandidates(items2, { perForm: false }).length === 1;
        out.K_noPidPerFormFour = NA.buildCandidates(items2, { perForm: true }).length === 4;
      }
      if (out.hasSetting) {
        const orig = window.v3NotesPerFormMode();
        window.v3NotesSetPerFormMode(true); out.S_on = window.v3NotesPerFormMode() === "on";
        window.v3NotesSetPerFormMode(false); out.S_off = window.v3NotesPerFormMode() === "off";
        window.v3NotesSetPerFormMode(orig === "on");
      }

      // ── DB downstream collapse (best-effort OPFS) ──
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.getCanonicalWordNotesForText === "function" && typeof l.listNotesForRowWithCanonical === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((rr) => setTimeout(rr, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const T = "PF_T", S = "PF_S";
      const forms = ["טוב", "טובה", "טובים", "טובות"];
      try {
        for (const f of forms) { for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key=?", ["ff:" + f + "#adjective"]) || [])) await ldb.deleteNoteById(e.id); }
        await ldb.dbRun("DELETE FROM texts WHERE id=?", [T]); await ldb.dbRun("DELETE FROM sentences WHERE id=?", [S]);
      } catch (_) {}
      await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)", [T, "pf_key", "PF", "src"]);
      await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", [S, T, 0, "טוב, טובה, טובים, טובות", "хороший"]);
      // 4 per-form canonical notes (one lemma טוב), each at its own offset.
      for (let i = 0; i < forms.length; i++) {
        const n = await ldb.createCanonicalNote({
          gen_dedup_key: "ff:" + forms[i] + "#adjective", source: "auto", user_touched: 0, title: forms[i],
          body: { word: forms[i], niqqud_variant: forms[i], lemma: "טוב", root: "טוב", pos: "adjective", meaning: "хороший" },
        });
        await ldb.addNoteOccurrence(n.id, { text_id: T, sentence_id: S, word_offset: i, surface: forms[i] });
      }
      // line list shows one card PER FORM (4 distinct notes occurring in this sentence)
      const rowNotes = await ldb.listNotesForRowWithCanonical(T, S);
      out.D_lineFour = (rowNotes || []).filter((r) => String(r.note_type) === "word_study").length === 4;
      // Anki export collapses to ONE per lemma
      const anki = await ldb.getCanonicalWordNotesForText(T);
      out.D_ankiOne = (anki || []).length === 1;
      // cleanup
      try { for (const f of forms) { for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key=?", ["ff:" + f + "#adjective"]) || [])) await ldb.deleteNoteById(e.id); } await ldb.dbRun("DELETE FROM texts WHERE id=?", [T]); await ldb.dbRun("DELETE FROM sentences WHERE id=?", [S]); } catch (_) {}

      // ── R-3.9 — reconcile on build: per-lemma → per-form replaces (no 6-note dup) ──
      const T2 = "PF_RT", S2 = "PF_RS";
      const dk = (k) => "RC:" + k;     // distinct keys so prior runs don't collide
      try {
        for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key LIKE 'RC:%'") || [])) await ldb.deleteNoteById(e.id);
        await ldb.dbRun("DELETE FROM texts WHERE id=?", [T2]); await ldb.dbRun("DELETE FROM sentences WHERE id=?", [S2]);
      } catch (_) {}
      await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)", [T2, "pf_rt", "RT", "src"]);
      await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", [S2, T2, 0, "טוב טובה טובים טובות", "x"]);
      // seed 2 per-lemma notes covering offsets 0..3; noteA also exported + carded.
      const noteA = await ldb.createCanonicalNote({ gen_dedup_key: dk("טוב#adverb"), source: "auto", user_touched: 0, title: "טוב", body: { word: "טוב", lemma: "טוב", root: "טוב", pos: "adverb" } });
      await ldb.addNoteOccurrence(noteA.id, { text_id: T2, sentence_id: S2, word_offset: 0, surface: "טוב" });
      await ldb.recordAnkiWordExports([{ note_id: noteA.id, deck_name: "RC", model_name: "M", body_json: (await ldb.dbQuery("SELECT body_json FROM notes_v2 WHERE id=?", [noteA.id]))[0].body_json }]);
      const cardA = await ldb.srs.createCardFromNote(noteA.id);
      const noteB = await ldb.createCanonicalNote({ gen_dedup_key: dk("טוב#adjective"), source: "auto", user_touched: 0, title: "טוב", body: { word: "טוב", lemma: "טוב", root: "טוב", pos: "adjective" } });
      for (let i = 1; i <= 3; i++) await ldb.addNoteOccurrence(noteB.id, { text_id: T2, sentence_id: S2, word_offset: i, surface: ["", "טובה", "טובים", "טובות"][i] });
      out.RC_seed2 = (await ldb.listNotesForRowWithCanonical(T2, S2) || []).filter((r) => String(r.note_type) === "word_study").length === 2;

      // build per-form (4 candidates, one per surface) WITH reconcile.
      const surf = ["טוב", "טובה", "טובים", "טובות"];
      const cands = surf.map((w, i) => ({ dedup_key: dk("ff:" + w + "#adjective"), confidence: 0.9, status: "ok",
        body: { word: w, niqqud_variant: w, lemma: "טוב", root: "טוב", pos: "adjective", meaning: "x" },
        occurrences: [{ text_id: T2, sentence_id: S2, word_offset: i, surface: w }] }));
      const rc = await window.v3NotesAutoGenPersist(cands, { source: "auto", reconcile: true });
      out.RC_dupRemoved = rc && rc.dupNotesRemoved === 2;            // noteA + noteB orphaned → deleted
      out.RC_lineFour = (await ldb.listNotesForRowWithCanonical(T2, S2) || []).filter((r) => String(r.note_type) === "word_study").length === 4;
      out.RC_oldGone = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM notes_v2 WHERE id IN (?,?)", [noteA.id, noteB.id]))[0].n === 0;
      out.RC_ankiRefGone = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM anki_word_exports WHERE note_id=?", [noteA.id]))[0].n === 0;
      out.RC_cardGone = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM srs_cards WHERE source_note_id=?", [noteA.id]))[0].n === 0;

      // same-mode rebuild → no-op (no other-scheme notes left).
      const rc2 = await window.v3NotesAutoGenPersist(cands, { source: "auto", reconcile: true });
      out.RC_idempotent = rc2 && rc2.dupNotesRemoved === 0 && (await ldb.listNotesForRowWithCanonical(T2, S2) || []).filter((r) => String(r.note_type) === "word_study").length === 4;

      // reverse: per-lemma rebuild replaces the 4 per-form notes → 1.
      const lemmaCand = [{ dedup_key: dk("טוב#adjective2"), confidence: 0.9, status: "ok",
        body: { word: "טוב", niqqud_variant: "טוב", lemma: "טוב", root: "טוב", pos: "adjective", meaning: "x" },
        occurrences: surf.map((w, i) => ({ text_id: T2, sentence_id: S2, word_offset: i, surface: w })) }];
      const rc3 = await window.v3NotesAutoGenPersist(lemmaCand, { source: "auto", reconcile: true });
      out.RC_reverseOne = rc3 && rc3.dupNotesRemoved === 4 && (await ldb.listNotesForRowWithCanonical(T2, S2) || []).filter((r) => String(r.note_type) === "word_study").length === 1;

      // user note at a position is NEVER touched by reconcile (guard skips it).
      const T3 = "PF_UT", S3 = "PF_US";
      try { for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key LIKE 'RCU:%'") || [])) await ldb.deleteNoteById(e.id); await ldb.dbRun("DELETE FROM texts WHERE id=?", [T3]); await ldb.dbRun("DELETE FROM sentences WHERE id=?", [S3]); await ldb.dbRun("DELETE FROM notes_v2 WHERE id='RCU_user'"); } catch (_) {}
      await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)", [T3, "pf_ut", "UT", "src"]);
      await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", [S3, T3, 0, "טוב", "x"]);
      const nowU = new Date().toISOString();
      await ldb.dbRun("INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,source,user_touched,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ["RCU_user", "word", S3 + ":0", T3, "word_study", "", JSON.stringify({ word: "טוב" }), "user", 1, nowU, nowU]);
      const uc = [{ dedup_key: "RCU:ff:טוב#adjective", confidence: 0.9, status: "ok", body: { word: "טוב", lemma: "טוב", root: "טוב", pos: "adjective" }, occurrences: [{ text_id: T3, sentence_id: S3, word_offset: 0, surface: "טוב" }] }];
      await window.v3NotesAutoGenPersist(uc, { source: "auto", reconcile: true });
      out.RC_userSafe = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM notes_v2 WHERE id='RCU_user'"))[0].n === 1;

      // cleanup
      try {
        for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key LIKE 'RC:%' OR gen_dedup_key LIKE 'RCU:%'") || [])) await ldb.deleteNoteById(e.id);
        await ldb.dbRun("DELETE FROM notes_v2 WHERE id='RCU_user'");
        for (const t of [T2, T3]) await ldb.dbRun("DELETE FROM texts WHERE id=?", [t]);
        for (const s of [S2, S3]) await ldb.dbRun("DELETE FROM sentences WHERE id=?", [s]);
        await ldb.dbRun("DELETE FROM anki_word_exports WHERE deck_name='RC'");
      } catch (_) {}
      return out;
    });

    test("exports present (NotesAutoGen keying + per-form setting)", R.hasNA === true && R.hasSetting === true);
    test("keying: per-lemma → 1 candidate (pid collapses 4 forms)", R.K_perLemmaOne === true);
    test("keying: per-form → 4 candidates (ff: per surface)", R.K_perFormFour === true && R.K_perFormKeys === true);
    test("keying: lemmaKey collapses per-form bodies to the lemma", R.K_lemmaCollapses === true);
    test("keying: no-pid per-lemma 1 / per-form 4", R.K_noPidPerLemmaOne === true && R.K_noPidPerFormFour === true);
    test("setting: per-form on/off round-trips", R.S_on === true && R.S_off === true);
    if (R.dbSkipped) console.log("  · DB downstream cases skipped (headless OPFS)");
    else {
      test("downstream: line list shows 4 per-form cards", R.D_lineFour === true);
      test("downstream: Anki export collapses to 1 per lemma", R.D_ankiOne === true);
      // R-3.9 reconcile
      test("reconcile: seed has 2 per-lemma notes", R.RC_seed2 === true);
      test("reconcile: per-form build replaces 2 per-lemma (dup removed)", R.RC_dupRemoved === true);
      test("reconcile: line list now 4 (no 6-note dup)", R.RC_lineFour === true);
      test("reconcile: superseded notes deleted + anki/srs refs cleaned", R.RC_oldGone === true && R.RC_ankiRefGone === true && R.RC_cardGone === true);
      test("reconcile: same-mode rebuild is a no-op", R.RC_idempotent === true);
      test("reconcile: reverse (per-lemma rebuild) → 1 note", R.RC_reverseOne === true);
      test("reconcile: user note at position never touched", R.RC_userSafe === true);
    }
    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }
  console.log(`\n[notes-perform-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
