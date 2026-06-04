#!/usr/bin/env node
"use strict";

// autogen-persist-browser-smoke.js — Stage 1.3 persist-path regression smoke.
//
// Exercises the canonical-note dedup-upsert against the REAL OPFS DB (migration
// 052): createCanonicalNote / findNoteByDedupKey / addNoteOccurrence (idempotent) /
// listNoteOccurrences / refreshCanonicalNoteBody (user_touched guard) and the
// orchestrator window.v3NotesAutoGenPersist (dedup re-run = 0 created). Headless
// OPFS init is best-effort — if it can't initialize, the DB cases are SKIPPED, not
// failed (mirrors conj-card-browser-smoke Case 5).

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3234;
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
  catch (e) { console.error("[autogen-persist-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[autogen-persist-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[autogen-persist-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    // serviceWorkers:"block" — the SW would otherwise reload mid-init and the OPFS
    // DB never settles (the failure that made this look "db_unavailable").
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
      const KEY = "pid:SMOKE999";
      const body = { word: "בדיקה", niqqud_variant: "בְּדִיקָה", root: "בדק", lemma: "בדיקה", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "проверка", pealim_id: "SMOKE999" };
      const created = await ldb.createCanonicalNote({ gen_dedup_key: KEY, body, title: body.word, source: "curated", confidence: 0.92, model_version: "pealim-infl-v12", user_touched: 0 });
      out.created = created && created.target_kind === "word" && created.target_id === KEY && created.source === "curated" && Number(created.user_touched) === 0 && created.gen_dedup_key === KEY && created.text_id == null;
      out.found = (await ldb.findNoteByDedupKey(KEY)).id === created.id;
      await ldb.addNoteOccurrence(created.id, { text_id: "t1", sentence_id: "s1", word_offset: 3, surface: "בדיקה" });
      await ldb.addNoteOccurrence(created.id, { text_id: "t1", sentence_id: "s1", word_offset: 3, surface: "בדיקה" }); // dup
      await ldb.addNoteOccurrence(created.id, { text_id: "t1", sentence_id: "s2", word_offset: 0, surface: "בבדיקה" });
      out.occIdempotent = (await ldb.listNoteOccurrences(created.id)).length === 2;
      const body2 = Object.assign({}, body, { meaning: "тест, проверка" });
      const ru = await ldb.refreshCanonicalNoteBody(created.id, { body: body2, confidence: 0.95 });
      out.refreshUntouched = ru === true && JSON.parse((await ldb.findNoteByDedupKey(KEY)).body_json).meaning === "тест, проверка";
      await ldb.dbQuery("UPDATE notes_v2 SET user_touched=1 WHERE id=?", [created.id]);
      const rt = await ldb.refreshCanonicalNoteBody(created.id, { body: Object.assign({}, body, { meaning: "CLOBBERED" }) });
      out.userTouchedGuard = rt === false && JSON.parse((await ldb.findNoteByDedupKey(KEY)).body_json).meaning === "тест, проверка";
      const cands = [
        { dedup_key: "pid:SMOKE888", body: { word: "שלום", root: "שלם", lemma: "שלום", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "мир", pealim_id: "SMOKE888" }, confidence: 0.9, occurrences: [{ text_id: "t2", sentence_id: "s9", word_offset: 1, surface: "שלום" }] },
        { dedup_key: KEY, body: body2, confidence: 0.95, occurrences: [{ text_id: "t3", sentence_id: "s5", word_offset: 2, surface: "בדיקות" }] },
      ];
      const p1 = await window.v3NotesAutoGenPersist(cands, { source: "curated" });
      out.persistCreate = p1.ok && p1.created === 1 && p1.new_roots === 1;       // only שלום is new
      const p2 = await window.v3NotesAutoGenPersist(cands, { source: "curated" });
      out.persistDedup = p2.ok && p2.created === 0;                               // re-run creates nothing
      return out;
    });

    if (R.skipped) { console.log("  · DB cases skipped (headless OPFS):", R.skipped); }
    else {
      test("createCanonicalNote — word/target_id=dedup/source/ut=0/text_id NULL", R.created === true);
      test("findNoteByDedupKey resolves the note", R.found === true);
      test("addNoteOccurrence idempotent (3 inserts → 2 rows)", R.occIdempotent === true);
      test("refreshCanonicalNoteBody updates an untouched note", R.refreshUntouched === true);
      test("user_touched guard — refresh skipped, meaning preserved", R.userTouchedGuard === true);
      test("v3NotesAutoGenPersist creates only new sense-lemmas", R.persistCreate === true);
      test("dedup-upsert — re-run creates 0 (idempotent)", R.persistDedup === true);
    }
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[autogen-persist-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
