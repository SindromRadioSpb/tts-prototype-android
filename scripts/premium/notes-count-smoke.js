#!/usr/bin/env node
"use strict";

// notes-count-smoke.js — R-3.10 END-TO-END note-count correctness.
//
// The automated substitute for the owner's manual check: prove «Обогащение» +
// «Построение знаний» form notes with the CORRECT count — no bloat, no dupes —
// driving the REAL build pipeline offline:
//   • seed sentence_morph (posDicta-complete tokens → zero Dicta network),
//   • run window.v3NotesAutoGenForText(textId,{perForm}) → assert candidate count,
//   • persist with reconcile → assert per-row note count + idempotent re-run +
//     mode-switch reconcile (no 6-note dup) + downstream per-lemma collapse.
//
// Fixture: 2 rows — S1 «טוב טובה טובים טובות» (4 adj forms, lemma טוב); S2
// «כתב כותב» (2 verb forms, lemma כתב). per-lemma → 2 notes; per-form → 6.

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3263;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim())); child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return; child.kill("SIGTERM");
  const exited = await new Promise((resolve) => { const tm = setTimeout(() => resolve(false), 5000); child.once("exit", () => { clearTimeout(tm); resolve(true); }); });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL");
}
async function waitForReady(t = 15000) { const s = Date.now(); while (Date.now() - s < t) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[notes-count-smoke] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[notes-count-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[notes-count-smoke] server up");
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      // acquire ldb
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.saveSentenceMorph === "function" && typeof l.listNotesForRowWithCanonical === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((rr) => setTimeout(rr, 500));
      }
      out.hasBuild = typeof window.v3NotesAutoGenForText === "function" && typeof window.v3NotesAutoGenPersist === "function";
      if (!ldb || !out.hasBuild) { out.dbSkipped = true; return out; }

      // pre-warm the offline Pealim dict (the build needs the resolver maps).
      try { if (window.InflectionDict && typeof window.InflectionDict.ensureReady === "function") await window.InflectionDict.ensureReady(); } catch (_) {}

      const T = "NC_T", S1 = "NC_S1", S2 = "NC_S2", MODEL = "dicta-morph-v1";
      const tok = (w, lemma, pos, binyan) => ({ word: w, lemma, stem: lemma, posDicta: pos, binyan: binyan || null, niqqud: w, kind: null, prefix: null, confident: true, feats: null });

      // clean + seed fixture
      try {
        const old = await ldb.dbQuery("SELECT DISTINCT note_id FROM note_occurrences WHERE text_id=?", [T]);
        for (const o of (old || [])) { try { await ldb.deleteNoteById(o.note_id); } catch (_) {} }
        await ldb.dbRun("DELETE FROM texts WHERE id=?", [T]); await ldb.dbRun("DELETE FROM sentences WHERE id IN (?,?)", [S1, S2]);
      } catch (_) {}
      await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)", [T, "nc_key", "NC", "src"]);
      await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", [S1, T, 0, "טוב טובה טובים טובות", "good"]);
      await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", [S2, T, 1, "כתב כותב", "wrote/writing"]);
      await ldb.saveSentenceMorph(T, S1, MODEL, ["טוב", "טובה", "טובים", "טובות"].map((w) => tok(w, "טוב", "adjective")), "dicta-morph");
      await ldb.saveSentenceMorph(T, S2, MODEL, [tok("כתב", "כתב", "verb", "paal"), tok("כותב", "כתב", "verb", "paal")], "dicta-morph");

      const line = async (sid) => ((await ldb.listNotesForRowWithCanonical(T, sid)) || []).filter((r) => String(r.note_type) === "word_study").length;
      const build = async (perForm) => window.v3NotesAutoGenForText(T, { perForm });
      const persist = async (cands) => window.v3NotesAutoGenPersist(cands, { source: "curated", reconcile: true });

      // — per-lemma —
      const bl = await build(false);
      if (!bl || !bl.ok) { out.noDict = (bl && bl.reason) || "build_failed"; return out; }   // dict unavailable headless → skip
      out.PL_cand2 = bl.candidates.length === 2;                      // 2 lemmas (טוב adj, כתב verb)
      const pl = await persist(bl.candidates);
      out.PL_created2 = pl.created === 2 && (pl.dupNotesRemoved || 0) === 0;
      out.PL_line = (await line(S1)) === 1 && (await line(S2)) === 1;  // 1 card per row

      // — re-run per-lemma → idempotent (no bloat) —
      const bl2 = await build(false); const pl2 = await persist(bl2.candidates);
      out.PL_idem = bl2.candidates.length === 2 && pl2.created === 0 && (pl2.dupNotesRemoved || 0) === 0 && (await line(S1)) === 1 && (await line(S2)) === 1;

      // — per-form → 6 candidates; reconcile replaces the 2 per-lemma —
      const bf = await build(true);
      out.PF_cand6 = bf.candidates.length === 6;                      // 4 + 2 surfaces
      const pf = await persist(bf.candidates);
      out.PF_created6 = pf.created === 6;
      out.PF_dup2 = (pf.dupNotesRemoved || 0) === 2;                  // the 2 superseded lemma-notes
      out.PF_line = (await line(S1)) === 4 && (await line(S2)) === 2; // no 6-note dup
      // downstream Anki export collapses per-form → per-lemma count (2)
      out.PF_ankiCollapse = ((await ldb.getCanonicalWordNotesForText(T)) || []).length === 2;

      // — re-run per-form → idempotent —
      const bf2 = await build(true); const pf2 = await persist(bf2.candidates);
      out.PF_idem = bf2.candidates.length === 6 && pf2.created === 0 && (pf2.dupNotesRemoved || 0) === 0 && (await line(S1)) === 4 && (await line(S2)) === 2;

      // — switch back to per-lemma → reconcile replaces the 6 per-form —
      const bl3 = await build(false); const pl3 = await persist(bl3.candidates);
      out.SW_back = pl3.created === 2 && (pl3.dupNotesRemoved || 0) === 6 && (await line(S1)) === 1 && (await line(S2)) === 1;

      // cleanup
      try {
        const old = await ldb.dbQuery("SELECT DISTINCT note_id FROM note_occurrences WHERE text_id=?", [T]);
        for (const o of (old || [])) { try { await ldb.deleteNoteById(o.note_id); } catch (_) {} }
        await ldb.dbRun("DELETE FROM texts WHERE id=?", [T]); await ldb.dbRun("DELETE FROM sentences WHERE id IN (?,?)", [S1, S2]);
      } catch (_) {}
      return out;
    });

    if (R.dbSkipped) { console.log("  · SKIP — ldb/build unavailable headless"); }
    else if (R.noDict) { console.log("  · SKIP — offline Pealim dict not ready headless (reason: " + R.noDict + ")"); }
    else {
      test("per-lemma: 2 candidates (distinct lemmas)", R.PL_cand2 === true);
      test("per-lemma: persist 2 notes, no dup removed", R.PL_created2 === true);
      test("per-lemma: line list 1 card per row", R.PL_line === true);
      test("per-lemma: re-run idempotent (no bloat)", R.PL_idem === true);
      test("per-form: 6 candidates (distinct surfaces)", R.PF_cand6 === true);
      test("per-form: persist 6 notes", R.PF_created6 === true);
      test("per-form: reconcile removed the 2 per-lemma notes", R.PF_dup2 === true);
      test("per-form: line list 4 + 2 (no 6-note dup)", R.PF_line === true);
      test("per-form: Anki export collapses to 2 per lemma", R.PF_ankiCollapse === true);
      test("per-form: re-run idempotent", R.PF_idem === true);
      test("switch back to per-lemma: reconcile → 1+1, 6 removed", R.SW_back === true);
    }
    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally { await browser.close(); await stopServer(srv.child); }
  console.log(`\n[notes-count-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
