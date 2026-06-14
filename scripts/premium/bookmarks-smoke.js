#!/usr/bin/env node
"use strict";

// bookmarks-smoke.js — BRR-P2-003 REAL-OPFS bookmark gate.
//
// Drives the ACTUAL browser SQLite boundary (addBookmark / isBookmarked /
// listBookmarks / searchBookmarks / removeBookmark + migration 056) headless
// over OPFS, no network:
//   • add → isBookmarked → list round-trip (denormalised title/snippet survive)
//   • idempotent toggle: re-add same (text, sentence) keeps ONE row (UNIQUE index)
//   • search: niqqud-free snippet LIKE matches the Hebrew word AND the Russian gloss
//   • global list carries the live text title; per-text list is in order_index order
//   • remove clears it; ON DELETE CASCADE — deleting the text removes its bookmarks
//     (the FK that foreign_keys=ON enforces in db-worker.js)

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3277;
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
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[bookmarks-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[bookmarks-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[bookmarks-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try {
          const l = await window.ensureLocalDB();
          if (l && typeof l.addBookmark === "function" && typeof l.isBookmarked === "function" &&
              typeof l.listBookmarks === "function" && typeof l.searchBookmarks === "function" &&
              typeof l.removeBookmark === "function" && typeof l.dbRun === "function") ldb = l;
        } catch (_) {}
        if (!ldb) await new Promise((rr) => setTimeout(rr, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const TID = "bmtest-text-1";
      const cleanup = async () => {
        try { await ldb.dbRun("DELETE FROM bookmarks WHERE text_id LIKE 'bmtest-%'"); } catch (_) {}
        try { await ldb.dbRun("DELETE FROM texts WHERE id LIKE 'bmtest-%'"); } catch (_) {}
      };
      await cleanup();
      // FK target — a minimal real text (id/text_key/title/source_text are NOT NULL).
      await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)",
        [TID, "bmtest-key-1", "Бмтест", ""]);

      // 1) add → isBookmarked → list
      const id1 = await ldb.addBookmark({ text_id: TID, text_key: "bmtest-key-1", sentence_id: "s1", order_index: 2, title: "Бмтест", snippet: "שלום עולם · Привет мир" });
      out.A_idReturned = !!id1;
      out.A_isBookmarked = !!(await ldb.isBookmarked(TID, "s1"));
      let list = await ldb.listBookmarks(TID);
      out.A_listOne = list.length === 1 && list[0].sentence_id === "s1" && list[0].snippet === "שלום עולם · Привет мир" && list[0].title === "Бмтест";

      // 2) idempotent re-add keeps ONE row (UNIQUE(text_id, sentence_id))
      await ldb.addBookmark({ text_id: TID, sentence_id: "s1", order_index: 2, title: "Бмтест", snippet: "שלום עולם · Привет мир" });
      const cnt = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM bookmarks WHERE text_id = ? AND sentence_id = 's1'", [TID]))[0].n;
      out.B_idempotent = Number(cnt) === 1;

      // 3) search matches Hebrew word AND Russian gloss
      const sHe = await ldb.searchBookmarks("עולם");
      const sRu = await ldb.searchBookmarks("Привет");
      out.S_hebrew = sHe.some((b) => b.text_id === TID);
      out.S_russian = sRu.some((b) => b.text_id === TID);
      out.S_miss = (await ldb.searchBookmarks("zzzнеттакого")).every((b) => b.text_id !== TID);

      // 4) global list carries live title; per-text list is order_index order
      await ldb.addBookmark({ text_id: TID, sentence_id: "s0", order_index: 0, title: "Бмтест", snippet: "ראשון" });
      const perText = (await ldb.listBookmarks(TID)).map((b) => b.sentence_id);
      out.O_order = JSON.stringify(perText) === JSON.stringify(["s0", "s1"]);
      const glob = await ldb.listBookmarks(null, 50);
      const g = glob.find((b) => b.text_id === TID);
      out.G_title = !!g && g.text_title === "Бмтест";

      // 5) remove clears it
      await ldb.removeBookmark(TID, "s1");
      out.R_removed = !(await ldb.isBookmarked(TID, "s1")) && (await ldb.listBookmarks(TID)).length === 1;

      // 6) ON DELETE CASCADE — deleting the text removes its bookmarks
      await ldb.dbRun("DELETE FROM texts WHERE id = ?", [TID]);
      const after = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM bookmarks WHERE text_id = ?", [TID]))[0].n;
      out.C_cascade = Number(after) === 0;

      await cleanup();
      return out;
    });

    if (R.dbSkipped) { console.log("[bookmarks-smoke] OPFS DB unavailable — SKIP"); await browser.close(); await stopServer(srv.child); process.exit(0); }

    test("add → isBookmarked returns an id", R.A_idReturned);
    test("isBookmarked true after add", R.A_isBookmarked);
    test("listBookmarks(text) carries denormalised snippet + title", R.A_listOne);
    test("idempotent toggle keeps ONE row (UNIQUE)", R.B_idempotent);
    test("search matches Hebrew word in snippet", R.S_hebrew);
    test("search matches Russian gloss in snippet", R.S_russian);
    test("search ignores non-matching query", R.S_miss);
    test("per-text list is order_index order", R.O_order);
    test("global list carries live text title", R.G_title);
    test("remove clears the bookmark", R.R_removed);
    test("ON DELETE CASCADE drops bookmarks with the text", R.C_cascade);

    await browser.close();
  } finally {
    await stopServer(srv.child);
  }

  console.log(`smoke:bookmarks — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
