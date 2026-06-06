#!/usr/bin/env node
"use strict";

// anki-lifecycle-smoke.js — R-3.5 per-word Anki SRS lifecycle status.
//
// Verifies, WITHOUT a live Anki (serviceWorkers blocked):
//   • pure exports present: V3_WORDCARD_LIFECYCLE_STYLE, V3_GRADE_STYLE,
//     v3WordLifecycleLabel, v3GradeLabel, v3ApplyWordLifecycleBadges.
//   • ldb.recordAnkiWordExports + ldb.getWordNoteLifecycle (best-effort OPFS DB):
//     created → in_anki (export marker) → known/learning (synced review) →
//     suspended; last-grade surfaced; «изменено после экспорта» stale detection;
//     export marker upsert is idempotent.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3259;
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
  catch (e) { console.error("[anki-lifecycle-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[anki-lifecycle-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[anki-lifecycle-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      // ── pure exports ──
      out.hasStyle = !!(window.V3_WORDCARD_LIFECYCLE_STYLE && window.V3_GRADE_STYLE);
      out.hasFns = typeof window.v3WordLifecycleLabel === "function"
        && typeof window.v3GradeLabel === "function"
        && typeof window.v3ApplyWordLifecycleBadges === "function";
      if (out.hasStyle) {
        const ls = window.V3_WORDCARD_LIFECYCLE_STYLE, gs = window.V3_GRADE_STYLE;
        out.styleTiers = ["created", "in_anki", "learning", "known", "suspended"].every((k) => ls[k] && ls[k].color && ls[k].icon);
        out.gradeTiers = [1, 2, 3, 4].every((k) => gs[k] && gs[k].color && gs[k].dot && gs[k].key);
        out.gradeKeys = gs[1].key === "again" && gs[2].key === "hard" && gs[3].key === "good" && gs[4].key === "easy";
        out.gradeLabel = typeof window.v3GradeLabel(3) === "string" && window.v3GradeLabel(3).length > 0 && window.v3GradeLabel(9) === "";
      }

      // ── DB cases (best-effort) ──
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.getWordNoteLifecycle === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((rr) => setTimeout(rr, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const MOD = 1700000000;
      const mkNote = (key) => ldb.createCanonicalNote({
        gen_dedup_key: key, source: "auto", confidence: 0.9, model_version: "v", user_touched: 0,
        title: "t", body: { word: "w", niqqud_variant: "w", root: "כתב", lemma: "כתב", pos: "verb", binyan: "paal", meaning: "m" },
      });
      const life1 = async (id) => (await ldb.getWordNoteLifecycle([id]))[String(id)];
      const mkState = (id, over) => ({ localNoteId: id, ankiNoteId: 7, cardIds: [70],
        stat: Object.assign({ state: "review", interval_days: 30, ease_factor: 2.6, reps: 8, lapses: 0,
                              due_date: "2099-01-01", anki_mod: MOD, anki_type: 2, anki_queue: 2 }, over || {}) });
      const KEYS = ["LIFE_created", "LIFE_inanki", "LIFE_known", "LIFE_learning", "LIFE_susp", "LIFE_stale", "LIFE_upsert"];
      for (const k of KEYS) {
        try { const ex = await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key = ?", [k]); for (const e of (ex || [])) { await ldb.deleteNoteById(e.id); await ldb.dbRun("DELETE FROM anki_word_exports WHERE note_id = ?", [e.id]); } } catch (_) {}
      }

      // L1 — created: note only.
      {
        const n = await mkNote("LIFE_created");
        const lc = await life1(n.id);
        out.L1_created = lc && lc.status === "created" && lc.exported === false && lc.grade === null;
        await ldb.deleteNoteById(n.id);
      }
      // L2 — in_anki: export marker only (no review).
      {
        const n = await mkNote("LIFE_inanki");
        await ldb.recordAnkiWordExports([{ note_id: n.id, deck_name: "D::Words", model_name: "M", body_json: (await ldb.dbQuery("SELECT body_json FROM notes_v2 WHERE id=?", [n.id]))[0].body_json }]);
        const lc = await life1(n.id);
        out.L2_inAnki = lc && lc.status === "in_anki" && lc.exported === true && lc.deck === "D::Words" && lc.staleExport === false;
        await ldb.deleteNoteById(n.id); await ldb.dbRun("DELETE FROM anki_word_exports WHERE note_id=?", [n.id]);
      }
      // L3 — known: exported + synced review + a grade event.
      {
        const n = await mkNote("LIFE_known");
        await ldb.recordAnkiWordExports([{ note_id: n.id, deck_name: "D", model_name: "M", body_json: (await ldb.dbQuery("SELECT body_json FROM notes_v2 WHERE id=?", [n.id]))[0].body_json }]);
        await ldb.applyAnkiReviewStates([mkState(n.id, { state: "review", reps: 9 })]);
        await ldb.recordAnkiReviews([{ ankiReviewId: "L3r1", localNoteId: n.id, ts: "2023-11-10T00:00:00.000Z", ease: 3, type: 1 },
                                     { ankiReviewId: "L3r2", localNoteId: n.id, ts: "2023-11-20T00:00:00.000Z", ease: 4, type: 1 }]);
        const lc = await life1(n.id);
        out.L3_known = lc && lc.status === "known" && lc.exported === true;
        out.L3_grade = lc && lc.grade === 4;          // most-recent (2023-11-20, Easy)
        await ldb.deleteNoteById(n.id); await ldb.dbRun("DELETE FROM anki_word_exports WHERE note_id=?", [n.id]);
        try { await ldb.dbRun("DELETE FROM events WHERE id LIKE 'anki:L3%'", []); } catch (_) {}
      }
      // L4 — learning: synced learning-state card.
      {
        const n = await mkNote("LIFE_learning");
        await ldb.applyAnkiReviewStates([mkState(n.id, { state: "learning", reps: 3, due_date: "2099-01-01" })]);
        const lc = await life1(n.id);
        out.L4_learning = lc && lc.status === "learning";
        await ldb.deleteNoteById(n.id);
      }
      // L5 — suspended.
      {
        const n = await mkNote("LIFE_susp");
        await ldb.applyAnkiReviewStates([mkState(n.id, { state: "suspended", anki_queue: -1, reps: 8 })]);
        const lc = await life1(n.id);
        out.L5_suspended = lc && lc.status === "suspended";
        await ldb.deleteNoteById(n.id);
      }
      // L6 — staleExport: export, then change body → stale true.
      {
        const n = await mkNote("LIFE_stale");
        const body0 = (await ldb.dbQuery("SELECT body_json FROM notes_v2 WHERE id=?", [n.id]))[0].body_json;
        await ldb.recordAnkiWordExports([{ note_id: n.id, deck_name: "D", model_name: "M", body_json: body0 }]);
        const fresh = await life1(n.id);
        out.L6_freshNotStale = fresh && fresh.staleExport === false;
        await ldb.dbRun("UPDATE notes_v2 SET body_json = ? WHERE id = ?", [JSON.stringify({ word: "w2", meaning: "changed" }), n.id]);
        const after = await life1(n.id);
        out.L6_staleAfterEdit = after && after.staleExport === true;
        await ldb.deleteNoteById(n.id); await ldb.dbRun("DELETE FROM anki_word_exports WHERE note_id=?", [n.id]);
      }
      // L7 — recordAnkiWordExports upsert (one row per note; re-export updates deck).
      {
        const n = await mkNote("LIFE_upsert");
        const bj = (await ldb.dbQuery("SELECT body_json FROM notes_v2 WHERE id=?", [n.id]))[0].body_json;
        await ldb.recordAnkiWordExports([{ note_id: n.id, deck_name: "D1", model_name: "M", body_json: bj }]);
        await ldb.recordAnkiWordExports([{ note_id: n.id, deck_name: "D2", model_name: "M", body_json: bj }]);
        const rows = await ldb.dbQuery("SELECT deck_name FROM anki_word_exports WHERE note_id = ?", [n.id]);
        out.L7_upsert = rows.length === 1 && rows[0].deck_name === "D2";
        await ldb.deleteNoteById(n.id); await ldb.dbRun("DELETE FROM anki_word_exports WHERE note_id=?", [n.id]);
      }

      return out;
    });

    test("exports present (lifecycle + grade style maps)", R.hasStyle === true && R.hasFns === true, JSON.stringify({ s: R.hasStyle, f: R.hasFns }));
    test("style: 5 lifecycle tiers have color+icon", R.styleTiers === true);
    test("style: 4 grade tiers have color+dot+key", R.gradeTiers === true);
    test("style: grade keys again/hard/good/easy", R.gradeKeys === true);
    test("label: v3GradeLabel returns text, '' for unknown", R.gradeLabel === true);

    if (R.dbSkipped) console.log("  · DB lifecycle cases skipped (headless OPFS)");
    else {
      test("lifecycle: note only → 'created' (not exported)", R.L1_created === true);
      test("lifecycle: export marker → 'in_anki' (+ deck, not stale)", R.L2_inAnki === true);
      test("lifecycle: exported + synced review → 'known'", R.L3_known === true);
      test("lifecycle: last grade = most-recent Anki review (Easy)", R.L3_grade === true);
      test("lifecycle: learning-state card → 'learning'", R.L4_learning === true);
      test("lifecycle: suspended card → 'suspended'", R.L5_suspended === true);
      test("lifecycle: fresh export not stale", R.L6_freshNotStale === true);
      test("lifecycle: body edited after export → staleExport", R.L6_staleAfterEdit === true);
      test("lifecycle: export marker upsert (one row, latest deck)", R.L7_upsert === true);
    }

    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[anki-lifecycle-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
