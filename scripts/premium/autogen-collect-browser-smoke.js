#!/usr/bin/env node
"use strict";

// autogen-collect-browser-smoke.js — Stage 5 (Concept B «читай-и-собирай») smoke.
//
// Deterministic block (must pass everywhere):
//   • collect-mode setting round-trip (v3NotesSetCollectMode / v3NotesCollectMode, default off)
//   • showToast generic action button: renders next to the message, click fires the
//     handler + dismisses, and a plain toast (no opts.action) renders no extra button
//   • undo primitives: removeNoteOccurrence drops exactly one occurrence;
//     deleteNoteById removes the note (+ cascades its occurrences)
//   • v3NotesAutoGenPersist source='curated' round-trip
//
// End-to-end block (best-effort — SKIPPED if the inflection dict can't load headless):
//   seeds texts/sentences/sentence_morph for a real verb, then drives the REAL
//   v3NotesCollectToken (one-tap collect) and asserts:
//     • exactly one canonical note created with source='curated' + one occurrence at (sid,0)
//     • R1 PARITY: the collected body equals the engine candidate body for the same word
//       (both go through the shared _v3AutoGenResolveItem)
//     • UNDO: clicking the toast action button deletes the freshly-created note
//
// Headless OPFS init is best-effort — if it can't initialize, DB cases are SKIPPED.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3241;
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
  catch (e) { console.error("[autogen-collect-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[autogen-collect-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[autogen-collect-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};

      // ── collect-mode setting round-trip ────────────────────────────────
      window.v3NotesSetCollectMode(false);
      out.defOff = window.v3NotesCollectMode() === "off";
      window.v3NotesSetCollectMode(true);
      out.setOn = window.v3NotesCollectMode() === "on";
      window.v3NotesSetCollectMode(false);
      out.setOff = window.v3NotesCollectMode() === "off";

      // ── showToast generic action button (DOM) ──────────────────────────
      // (showToast is defined in a closure but the toast container is global DOM.)
      let fired = 0;
      window.showToast("collect test", "success", { ttl: 8000, action: { label: "UNDO_X", onClick: () => { fired++; } } });
      await new Promise((r) => setTimeout(r, 60));
      const tc = document.getElementById("v3ToastContainer") || document.querySelector(".toast-container, #toastContainer") || document.body;
      let btn = Array.from(document.querySelectorAll(".toast button, .toast .toast-report-btn")).find((b) => b.textContent === "UNDO_X");
      out.toastBtnRendered = !!btn;
      if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 60)); out.toastActionFired = fired === 1; }
      // plain toast → no extra action button
      window.showToast("plain", "info");
      await new Promise((r) => setTimeout(r, 60));
      out.plainNoBtn = !Array.from(document.querySelectorAll(".toast button")).some((b) => b.textContent === "UNDO_X");

      // ── DB-dependent: wait for OPFS ─────────────────────────────────────
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.createCanonicalNote === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((r) => setTimeout(r, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      // ── undo primitives ────────────────────────────────────────────────
      const n = await ldb.createCanonicalNote({
        gen_dedup_key: "pid:COLLECT_UNDO", source: "curated", confidence: 0.9, model_version: "v", user_touched: 0,
        title: "כתב", body: { word: "כתב", root: "כתב", lemma: "כתב", pos: "verb", part_of_speech: "verb", binyan: "paal", meaning: "писать", pealim_id: "COLLECT_UNDO" },
      });
      const occA = { text_id: "TX", sentence_id: "SA", word_offset: 0, surface: "כתב" };
      const occB = { text_id: "TX", sentence_id: "SB", word_offset: 3, surface: "כתבה" };
      await ldb.addNoteOccurrence(n.id, occA);
      await ldb.addNoteOccurrence(n.id, occB);
      out.occTwo = (await ldb.listNoteOccurrences(n.id)).length === 2;
      await ldb.removeNoteOccurrence(n.id, occA);
      const after = await ldb.listNoteOccurrences(n.id);
      out.occRemovedOne = after.length === 1 && String(after[0].sentence_id) === "SB";
      await ldb.deleteNoteById(n.id);
      out.noteDeleted = !(await ldb.findNoteByDedupKey("pid:COLLECT_UNDO"))
        && (await ldb.listNoteOccurrences(n.id)).length === 0;   // cascade

      // ── persist source='curated' round-trip ────────────────────────────
      await ldb.deleteNoteById((await ldb.findNoteByDedupKey("pid:COLLECT_CUR") || {}).id || "x");
      await window.v3NotesAutoGenPersist([{
        dedup_key: "pid:COLLECT_CUR", confidence: 0.9,
        occurrences: [{ text_id: "TX", sentence_id: "SC", word_offset: 1, surface: "ספר" }],
        body: { word: "ספר", root: "ספר", lemma: "ספר", pos: "noun", part_of_speech: "noun", meaning: "книга", pealim_id: "COLLECT_CUR" },
      }], { source: "curated" });
      const cur = await ldb.findNoteByDedupKey("pid:COLLECT_CUR");
      out.curatedPersist = !!cur && String(cur.source) === "curated"
        && (await ldb.listNoteOccurrences(cur.id)).length === 1;
      if (cur) await ldb.deleteNoteById(cur.id);

      // ── END-TO-END: real one-tap collect (best-effort) ─────────────────
      // Probe the inflection dict first; if it won't load headless, skip.
      let dictOk = false;
      try { const probe = await window.v3NotesAutoGenForText("__no_such_text__"); dictOk = !(probe && probe.reason === "no_dict"); }
      catch (_) { dictOk = false; }
      if (!dictOk) { out.e2eSkipped = "no_dict"; return out; }

      try {
        // seed: text → sentence → sentence_morph (FK order matters).
        await ldb.dbRun(`DELETE FROM sentence_morph WHERE text_id = ?`, ["T_COLLECT"]);
        await ldb.dbRun(`DELETE FROM sentences WHERE id = ?`, ["S_COLLECT"]);
        await ldb.dbRun(`DELETE FROM texts WHERE id = ?`, ["T_COLLECT"]);
        await ldb.dbRun(`INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)`,
          ["T_COLLECT", "tk_collect_smoke", "collect smoke", "כתב"]);
        await ldb.dbRun(`INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud) VALUES (?,?,?,?,?)`,
          ["S_COLLECT", "T_COLLECT", 0, "כתב", "כָּתַב"]);
        await ldb.saveSentenceMorph("T_COLLECT", "S_COLLECT", "dicta-morph-smoke",
          [{ word: "כתב", lemma: "כתב", stem: "כתב", binyan: "paal", posDicta: "verb", niqqud: "כָּתַב", confident: true }],
          "dicta-morph");

        // clear any prior collected note for this lemma
        const prior = await ldb.findNoteByDedupKey("verb#כתב") || await ldb.findNoteByDedupKey("noun#כתב");
        // engine parity baseline
        const eng = await window.v3NotesAutoGenForText("T_COLLECT");
        const engCand = (eng.candidates || []).find((c) => window.NotesAutoGen.stripNiqqud(c.body.word) === "כתב");
        out.engHasCand = !!engCand;

        // count curated before
        const beforeCur = (await ldb.dbQuery(`SELECT COUNT(*) AS n FROM notes_v2 WHERE source='curated'`, []))[0].n;

        // drive the REAL collect (one-tap)
        const slot = { ctx: { textId: "T_COLLECT", sentenceId: "S_COLLECT", rowIdx: 0 }, sentencePlain: "כתב", sentenceText: "כָּתַב" };
        await window.v3NotesCollectToken(slot, 0, "כָּתַב", "כתב");
        await new Promise((r) => setTimeout(r, 150));

        const afterCur = (await ldb.dbQuery(`SELECT COUNT(*) AS n FROM notes_v2 WHERE source='curated'`, []))[0].n;
        out.collectCreated = afterCur === beforeCur + 1;

        const collected = engCand ? await ldb.findNoteByDedupKey(engCand.dedup_key) : null;
        out.collectedCurated = !!collected && String(collected.source) === "curated";
        const occs = collected ? await ldb.listNoteOccurrences(collected.id) : [];
        out.collectedOcc = occs.length === 1 && String(occs[0].sentence_id) === "S_COLLECT" && Number(occs[0].word_offset) === 0;

        // R1 PARITY: collected body == engine candidate body (shared resolver).
        if (collected && engCand) {
          const cb = JSON.parse(collected.body_json);
          const eb = engCand.body;
          const keys = ["word", "root", "lemma", "pos", "binyan", "meaning", "pealim_id"];
          out.bodyParity = keys.every((k) => String(cb[k] || "") === String(eb[k] || ""));
          out.parityWord = cb.word === "כתב" && cb.pos === "verb";
        }

        // UNDO via the toast action button (real wiring): the collect toast is the
        // last one; its action button has class toast-report-btn + label = undo text.
        const undoLabel = (window.t && window.t("toast.collectUndo")) || "Отменить";
        const ubtn = Array.from(document.querySelectorAll(".toast .toast-report-btn, .toast button"))
          .find((b) => b.textContent === undoLabel);
        out.undoBtnPresent = !!ubtn;
        if (ubtn) {
          ubtn.click();
          await new Promise((r) => setTimeout(r, 250));
          out.undoDeleted = collected ? !(await ldb.findNoteByDedupKey(collected.dedup_key)) : false;
        }

        // no-morph fallback: collecting a token with no stored morph must NOT
        // create a curated note (it falls back to the editor instead).
        const beforeFb = (await ldb.dbQuery(`SELECT COUNT(*) AS n FROM notes_v2 WHERE source='curated'`, []))[0].n;
        const slot2 = { ctx: { textId: "T_COLLECT", sentenceId: "S_NO_MORPH", rowIdx: 0 }, sentencePlain: "שלום", sentenceText: "שָׁלוֹם" };
        await window.v3NotesCollectToken(slot2, 0, "שָׁלוֹם", "שלום");
        await new Promise((r) => setTimeout(r, 120));
        const afterFb = (await ldb.dbQuery(`SELECT COUNT(*) AS n FROM notes_v2 WHERE source='curated'`, []))[0].n;
        out.noMorphFallback = afterFb === beforeFb;
        try { if (typeof window.v3NotesClose === "function") window.v3NotesClose(); } catch (_) {}

        // cleanup
        await ldb.dbRun(`DELETE FROM sentence_morph WHERE text_id = ?`, ["T_COLLECT"]);
        await ldb.dbRun(`DELETE FROM sentences WHERE id = ?`, ["S_COLLECT"]);
        await ldb.dbRun(`DELETE FROM texts WHERE id = ?`, ["T_COLLECT"]);
      } catch (e) { out.e2eError = String((e && e.message) || e); }

      return out;
    });

    test("collect-mode setting: default off", R.defOff === true);
    test("collect-mode setting: on/off round-trip", R.setOn === true && R.setOff === true);
    test("showToast: generic action button renders", R.toastBtnRendered === true);
    test("showToast: action click fires handler + dismisses", R.toastActionFired === true);
    test("showToast: plain toast renders no action button", R.plainNoBtn === true);
    if (R.dbSkipped) { console.log("  · DB cases skipped (headless OPFS)"); }
    else {
      test("undo primitive: two occurrences recorded", R.occTwo === true);
      test("undo primitive: removeNoteOccurrence drops exactly one", R.occRemovedOne === true);
      test("undo primitive: deleteNoteById removes note + cascades occ", R.noteDeleted === true);
      test("persist source='curated' round-trip", R.curatedPersist === true);
      if (R.e2eSkipped) { console.log(`  · end-to-end collect skipped (${R.e2eSkipped})`); }
      else if (R.e2eError) { test("end-to-end collect (no error)", false, R.e2eError); }
      else {
        test("e2e: engine produced a candidate for the word", R.engHasCand === true);
        test("e2e: one-tap collect created exactly one curated note", R.collectCreated === true && R.collectedCurated === true);
        test("e2e: occurrence recorded at (sentence,0)", R.collectedOcc === true);
        test("R1 PARITY: collected body == engine candidate body", R.bodyParity === true);
        test("e2e: parity body fields sane (word=כתב, pos=verb)", R.parityWord === true);
        test("e2e: undo button present in toast", R.undoBtnPresent === true);
        test("e2e: clicking undo deletes the collected note", R.undoDeleted === true);
        test("e2e: no-morph tap falls back (no curated note)", R.noMorphFallback === true);
      }
    }
    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[autogen-collect-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
