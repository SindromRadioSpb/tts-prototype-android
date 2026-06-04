#!/usr/bin/env node
"use strict";

// autogen-surfacing-browser-smoke.js — Stage 2 (FORK 1 + FORK 2) regression smoke.
//
// FORK 1 (reading-view/editor visibility): canonical autogen notes live with
//   text_id=NULL and their positions in note_occurrences. The new canonical-aware
//   ldb methods must surface them where the user reads — and the LEGACY methods
//   must NOT (proving the additive JOIN is actually required, not redundant).
//     getRowNoteCountsWithCanonical / listNotesForRowWithCanonical / getNoteByOccurrence
//
// FORK 2 (knowledge-map sense key, Option C): two homograph senses sharing a
//   spelling+root must render as SEPARATE lemma nodes keyed by pid (mirror of
//   gen_dedup_key), not collapse into one; no-pid notes degrade to <lemma>#<pos>.
//
// Headless OPFS init is best-effort — if it can't initialize, cases are SKIPPED.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3236;
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
  catch (e) { console.error("[autogen-surfacing-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[autogen-surfacing-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[autogen-surfacing-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      async function getLdb() {
        for (let i = 0; i < 20; i++) {
          try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
          try { const l = await window.ensureLocalDB(); if (l && typeof l.createCanonicalNote === "function") return l; } catch (_) {}
          await new Promise((r) => setTimeout(r, 500));
        }
        return null;
      }
      const out = {};
      const ldb = await getLdb();
      if (!ldb) return { skipped: "db_unavailable" };

      // ── FORK 1: occurrence-visibility ──────────────────────────────────
      const TID = "surf-text-1", SID = "surf-sent-1", OFF = 4;
      const n1 = await ldb.createCanonicalNote({
        gen_dedup_key: "pid:SURF1001",
        body: { word: "מבחן", niqqud_variant: "מִבְחָן", root: "בחן", lemma: "מבחן", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "экзамен", pealim_id: "SURF1001" },
        title: "מבחן", source: "curated", confidence: 0.9, model_version: "pealim-infl-v12", user_touched: 0,
      });
      await ldb.addNoteOccurrence(n1.id, { text_id: TID, sentence_id: SID, word_offset: OFF, surface: "מבחן" });
      await ldb.addNoteOccurrence(n1.id, { text_id: TID, sentence_id: SID, word_offset: OFF, surface: "מבחן" }); // dup → idempotent

      const counts = await ldb.getRowNoteCountsWithCanonical(TID);
      const row = (counts || []).find((r) => String(r.sentence_id) === SID);
      out.b_count = !!row && Number(row.count) === 1;                                   // once, not double (idempotent occ)
      const listC = await ldb.listNotesForRowWithCanonical(TID, SID);
      out.b_list = Array.isArray(listC) && listC.some((r) => r.id === n1.id);
      const byOcc = await ldb.getNoteByOccurrence(SID, OFF);
      out.b_byocc = byOcc && byOcc.id === n1.id;
      // Legacy methods MUST NOT see a text_id=NULL canonical note (fix is required).
      const legacyList = await ldb.listNotesForRow(TID, SID);
      const legacyCounts = await ldb.getRowNoteCounts(TID);
      out.b_legacy_blind = (!legacyList.some((r) => r.id === n1.id)) &&
        (!(legacyCounts || []).some((r) => String(r.sentence_id) === SID));

      // ── FORK 2: knowledge-map sense-split (Option C) ───────────────────
      if (window.KnowledgeMapData && typeof window.KnowledgeMapData.build === "function") {
        // two homograph senses (same spelling+root, distinct pid) + one no-pid note
        await ldb.createCanonicalNote({ gen_dedup_key: "pid:SURF_BOOK", body: { word: "ספר", root: "ספר", lemma: "ספר", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "книга", pealim_id: "SURF_BOOK" }, title: "ספר", source: "curated", confidence: 0.9, model_version: "v", user_touched: 0 });
        await ldb.createCanonicalNote({ gen_dedup_key: "pid:SURF_BARBER", body: { word: "ספר", root: "ספר", lemma: "ספר", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "парикмахер", pealim_id: "SURF_BARBER" }, title: "ספר", source: "curated", confidence: 0.9, model_version: "v", user_touched: 0 });
        await ldb.createCanonicalNote({ gen_dedup_key: "דבר#noun", body: { word: "דבר", root: "דבר", lemma: "דבר", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "вещь" }, title: "דבר", source: "curated", confidence: 0.8, model_version: "v", user_touched: 0 });

        const idx = await window.KnowledgeMapData.build();
        const lemmaIds = new Set(idx.lemmas.map((l) => l.id));
        out.c_split = lemmaIds.has("word:pid:SURF_BOOK") && lemmaIds.has("word:pid:SURF_BARBER");
        const rootSefer = idx.roots.find((r) => r.id === "root:ספר");
        out.c_root_two = !!rootSefer && rootSefer.lemmaKeys.length === 2;               // two senses, NOT collapsed
        out.c_degrade = lemmaIds.has("word:דבר#noun");                                  // no-pid → <lemma>#<pos>
        const lBook = idx.lemmas.find((l) => l.id === "word:pid:SURF_BOOK");
        const lBarber = idx.lemmas.find((l) => l.id === "word:pid:SURF_BARBER");
        out.c_meanings = !!lBook && !!lBarber && lBook.meaning === "книга" && lBarber.meaning === "парикмахер" && lBook.meaning !== lBarber.meaning;
        out.c_edges = idx.edges.some((e) => e.source === "root:ספר" && e.target === "word:pid:SURF_BOOK") &&
          idx.edges.some((e) => e.source === "root:ספר" && e.target === "word:pid:SURF_BARBER");
      } else {
        out.c_skipped = true;
      }
      return out;
    });

    if (R.skipped) { console.log("  · cases skipped (headless OPFS):", R.skipped); }
    else {
      test("FORK1: getRowNoteCountsWithCanonical counts canonical note once", R.b_count === true);
      test("FORK1: listNotesForRowWithCanonical surfaces the canonical note", R.b_list === true);
      test("FORK1: getNoteByOccurrence resolves (sentence,offset) → note", R.b_byocc === true);
      test("FORK1: legacy listNotesForRow/getRowNoteCounts are blind to it (fix required)", R.b_legacy_blind === true);
      if (R.c_skipped) console.log("  · FORK2 skipped (KnowledgeMapData not loaded)");
      else {
        test("FORK2: homograph senses are SEPARATE lemma nodes (pid keys)", R.c_split === true);
        test("FORK2: root ספר holds 2 sense nodes (not collapsed)", R.c_root_two === true);
        test("FORK2: no-pid note degrades to <lemma>#<pos> key", R.c_degrade === true);
        test("FORK2: each sense node carries its own meaning (chip data)", R.c_meanings === true);
        test("FORK2: root→lemma edges intact for both senses", R.c_edges === true);
      }
    }
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[autogen-surfacing-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
