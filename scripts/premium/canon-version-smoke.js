#!/usr/bin/env node
"use strict";

// canon-version-smoke.js — BRR-P0-008 REAL-OPFS versioned canon dedup gate.
//
// Proves the import-side reconcile that lets a shipped canon edition cleanly
// SUPERSEDE a prior one on an upgrading user, WITHOUT touching user content.
// Drives the actual browser transport (importBundle) headless over OPFS:
//   • a v1 bundle (canon_version:1) publishes a monolithic canon text + canon
//     shelves; the user ALSO has their own (non-canon) text + shelf
//   • a v2 bundle (canon_version:2) chapterizes that work (new text_keys) +
//     drops one canon shelf — the new manifest is AUTHORITATIVE for canon
//   • after v2: the v1 monolith is GONE (orphan reconciled), chapters + work
//     shelf present, the dropped canon shelf GONE, and BOTH user rows intact
//   • a re-import of the SAME v2 is idempotent (zero further deletions)
//
// Canon identity: texts via source_meta.corpus.byehuda_id (producer-only, catches
// legacy v1 rows); shelves via origin='benyehuda-ingest'. User rows have neither.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3286;
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
  catch (e) { console.error("[canon-version-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[canon-version-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[canon-version-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    // ?canon=skip so index.html does not auto-publish its own canon over our fixtures.
    await pg.goto(BASE + "/index.html?canon=skip", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.importBundle === "function" && typeof l.dbQuery === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((rr) => setTimeout(rr, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const CANON = "benyehuda-ingest";
      const corpus = (byehuda_id, extra) => Object.assign({ schema: 1, byehuda_id: String(byehuda_id), track: "literary", review_status: "machine", audio_status: "none" }, extra || {});
      const ctext = (text_key, byehuda_id, extra) => ({ text_id: text_key, text_key, title: text_key, source_text: "", rows: [{ hebrew_plain: "אָב", russian: "x" }], corpus: corpus(byehuda_id, extra) });
      const utext = (text_key) => ({ text_id: text_key, text_key, title: text_key, source_text: "", rows: [{ hebrew_plain: "אֵם", russian: "y" }] }); // NO corpus → user text
      const cshelf = (slug, items, ver) => ({ schema: 1, slug, title: slug, track: "literary", items: items.map((tk, i) => ({ text_key: tk, order: i })), origin: CANON, canon_version: ver });
      const ushelf = (slug, items) => ({ schema: 1, slug, title: slug, track: "literary", items: items.map((tk, i) => ({ text_key: tk, order: i })) }); // NO origin → user shelf
      const lib = (canon_version, texts, shelves) => ({ library: { schema_version: 1, corpus_meta_version: 1, canon_version, texts, shelves, audio_assets: [] } });

      // clean any prior test rows
      try { await ldb.dbRun("DELETE FROM texts WHERE text_key LIKE 'cv-%'"); } catch (_) {}
      try { await ldb.dbRun("DELETE FROM shelves WHERE slug LIKE 'cv-%'"); } catch (_) {}

      const has = async (sql, p) => Number((await ldb.dbQuery(sql, p))[0].n) > 0;
      const txtExists = (tk) => has("SELECT COUNT(*) n FROM texts WHERE text_key = ?", [tk]);
      const shfExists = async (slug) => !!(await ldb.getShelfBySlug(slug));

      // ── 0) user content (non-canon import — no canon_version → no reconcile) ──
      await ldb.importBundle({ library: { schema_version: 1, texts: [utext("cv-user-text")], shelves: [ushelf("cv-my-shelf", ["cv-user-text"])] } }, { mode: "skip" });
      out.U0_userText = await txtExists("cv-user-text");
      out.U0_userShelf = await shfExists("cv-my-shelf");

      // ── 1) v1 canon: monolith #95 + two canon shelves (by-literary, by-extra) ──
      const r1 = await ldb.importBundle(lib(1, [ctext("cv-95", 95)], [
        cshelf("cv-literary", ["cv-95"], 1),
        cshelf("cv-extra", ["cv-95"], 1),
      ]), { mode: "skip" });
      out.V1_reconcileRanNoDelete = !!r1.reconciled && r1.reconciled.textsDeleted === 0 && r1.reconciled.shelvesDeleted === 0;
      out.V1_monoPresent = await txtExists("cv-95");
      out.V1_extraShelfPresent = await shfExists("cv-extra");

      // ── 2) v2 canon: #95 chapterized (NEW keys), by-extra DROPPED, by-literary refreshed ──
      const r2 = await ldb.importBundle(lib(2, [
        ctext("cv-95-c1", 95, { series: { work_byehuda_id: "95", work_title: "W", part: 1, total: 2 } }),
        ctext("cv-95-c2", 95, { series: { work_byehuda_id: "95", work_title: "W", part: 2, total: 2 } }),
      ], [
        cshelf("cv-work-95", ["cv-95-c1", "cv-95-c2"], 2),
        cshelf("cv-literary", ["cv-95-c1"], 2),
      ]), { mode: "skip" });
      out.V2_reconciled = r2.reconciled || null;
      out.V2_monoGone = !(await txtExists("cv-95"));               // orphan removed
      out.V2_ch1 = await txtExists("cv-95-c1");
      out.V2_ch2 = await txtExists("cv-95-c2");
      out.V2_workShelf = await shfExists("cv-work-95");
      out.V2_extraShelfGone = !(await shfExists("cv-extra"));       // orphan canon shelf removed
      const litV2 = await ldb.getShelfBySlug("cv-literary");
      out.V2_literaryRefreshed = !!litV2 && litV2.canon_version === 2 && litV2.items.length === 1 && litV2.items[0].text_key === "cv-95-c1";
      // user content untouched
      out.V2_userTextIntact = await txtExists("cv-user-text");
      out.V2_userShelfIntact = await shfExists("cv-my-shelf");

      // ── 3) idempotent re-import of the SAME v2 (zero further deletions) ──
      const r3 = await ldb.importBundle(lib(2, [
        ctext("cv-95-c1", 95), ctext("cv-95-c2", 95),
      ], [
        cshelf("cv-work-95", ["cv-95-c1", "cv-95-c2"], 2),
        cshelf("cv-literary", ["cv-95-c1"], 2),
      ]), { mode: "skip" });
      out.V3_idempotent = !!r3.reconciled && r3.reconciled.textsDeleted === 0 && r3.reconciled.shelvesDeleted === 0;
      out.V3_chaptersStill = (await txtExists("cv-95-c1")) && (await txtExists("cv-95-c2"));

      // cleanup
      try { await ldb.dbRun("DELETE FROM texts WHERE text_key LIKE 'cv-%'"); } catch (_) {}
      try { await ldb.dbRun("DELETE FROM shelves WHERE slug LIKE 'cv-%'"); } catch (_) {}
      return out;
    });

    if (R.dbSkipped) { console.log("[canon-version-smoke] OPFS DB unavailable — SKIP"); await browser.close(); await stopServer(srv.child); process.exit(0); }

    test("setup: user text imported (non-canon, no reconcile)", R.U0_userText);
    test("setup: user shelf imported", R.U0_userShelf);
    test("v1: reconcile runs but deletes nothing (no prior canon)", R.V1_reconcileRanNoDelete);
    test("v1: monolith #95 present", R.V1_monoPresent);
    test("v1: extra canon shelf present", R.V1_extraShelfPresent);
    test("v2: reconcile removed 1 orphan text", !!R.V2_reconciled && R.V2_reconciled.textsDeleted === 1, JSON.stringify(R.V2_reconciled));
    test("v2: reconcile removed 1 orphan shelf", !!R.V2_reconciled && R.V2_reconciled.shelvesDeleted === 1, JSON.stringify(R.V2_reconciled));
    test("v2: monolith #95 GONE (superseded)", R.V2_monoGone);
    test("v2: chapter 1 present", R.V2_ch1);
    test("v2: chapter 2 present", R.V2_ch2);
    test("v2: work-shelf (TOC) present", R.V2_workShelf);
    test("v2: dropped canon shelf GONE", R.V2_extraShelfGone);
    test("v2: by-literary refreshed to v2 membership", R.V2_literaryRefreshed);
    test("v2: USER text untouched", R.V2_userTextIntact);
    test("v2: USER shelf untouched", R.V2_userShelfIntact);
    test("v3: same-version re-import is idempotent (0 deletions)", R.V3_idempotent, JSON.stringify(R.V2_reconciled));
    test("v3: chapters still present after re-import", R.V3_chaptersStill);
    test("no pageerror on index.html", errs.length === 0, errs[0]);

    await browser.close();
  } finally {
    await stopServer(srv.child);
  }

  console.log(`\n[canon-version-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("[canon-version-smoke] fatal", e); process.exit(1); });
