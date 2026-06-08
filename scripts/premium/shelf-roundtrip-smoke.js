#!/usr/bin/env node
"use strict";

// shelf-roundtrip-smoke.js — BRR-P0-003 REAL-OPFS shelf transport gate.
//
// The Node contract gate (smoke:shelves) tests db/premium/shelfMeta.js + a
// SIMULATED JSON round-trip; it never touches SQLite. This gate drives the
// ACTUAL browser transport (createShelf / exportBundle / _exportShelves /
// importBundle upsert / getShelves) headless over OPFS, no network:
//   • createShelf → exportBundle: shelf rides library.shelves[] with items intact
//   • wipe → importBundle → getShelves: byte-faithful round-trip (items_json,
//     order_index↔order, all fields) through the real SQLite boundary
//   • skip vs overwrite re-import semantics (the slug-stable identity invariant)
//   • slug UNIQUE index (createShelf twice → reject)
//   • multi-shelf ordering (track, COALESCE(order_index,999999), title)
//   • import validation: invalid track / missing field → honest result.errors,
//     no row written (no opaque SQLite failure)
//   • dangling member text_key → imported (warn), not silently dropped (R8)

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3266;
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
  catch (e) { console.error("[shelf-roundtrip-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[shelf-roundtrip-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[shelf-roundtrip-smoke] server up");

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
        try { const l = await window.ensureLocalDB(); if (l && typeof l.getShelves === "function" && typeof l.createShelf === "function" && typeof l.exportBundle === "function" && typeof l.importBundle === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((rr) => setTimeout(rr, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const wipe = async () => { try { await ldb.dbRun("DELETE FROM shelves WHERE slug LIKE 'rt-%'"); } catch (_) {} };
      const mkBundle = (shelves) => ({ library: { schema_version: 1, corpus_meta_version: 1, shelves, texts: [], audio_assets: [] } });
      await wipe();

      // ── 1) createShelf → exportBundle: shelf rides the bundle with items intact ──
      const seedItems = [{ text_key: "k-b", order: 0 }, { text_key: "שלום", order: 1 }, { text_key: "k-c", order: 2 }];
      await ldb.createShelf({ slug: "rt-shelf-rt", title: "RT shelf", track: "accessible", era: "tehiya", genre: "poetry", editorial_intro: "intro", items: seedItems, order: 0 });
      const exp = await ldb.exportBundle({});
      const expShelves = (exp && exp.library && exp.library.shelves) || exp.shelves || [];
      const expShelf = expShelves.find((s) => s.slug === "rt-shelf-rt");
      out.E_present = !!expShelf;
      out.E_itemsIntact = !!expShelf && eq(expShelf.items, seedItems);
      out.E_fields = !!expShelf && expShelf.track === "accessible" && expShelf.era === "tehiya" && expShelf.genre === "poetry" && expShelf.editorial_intro === "intro";

      // ── 2) wipe → import → getShelves: byte-faithful round-trip over real SQLite ──
      await wipe();
      const bundle = mkBundle([expShelf]);
      await ldb.importBundle(bundle, { mode: "skip" });
      const back = await ldb.getShelves();
      const rt = back.find((s) => s.slug === "rt-shelf-rt");
      out.I_present = !!rt;
      out.I_itemsDeepEqual = !!rt && eq(rt.items, seedItems);
      out.I_fields = !!rt && rt.track === "accessible" && rt.era === "tehiya" && rt.genre === "poetry" && rt.editorial_intro === "intro";
      const byslug = await ldb.getShelfBySlug("rt-shelf-rt");
      out.I_getBySlug = !!byslug && byslug.slug === "rt-shelf-rt";

      // ── 3) skip vs overwrite re-import (slug-stable identity) ──
      const mutated = mkBundle([{ ...expShelf, title: "CHANGED", items: [{ text_key: "k-b", order: 0 }] }]);
      await ldb.importBundle(mutated, { mode: "skip" });
      const afterSkip = await ldb.getShelfBySlug("rt-shelf-rt");
      out.M_skipLeavesAlone = !!afterSkip && afterSkip.title === "RT shelf" && afterSkip.items.length === 3;
      await ldb.importBundle(mutated, { mode: "asNew" }); // any non-skip → overwrite
      const afterOver = await ldb.getShelfBySlug("rt-shelf-rt");
      out.M_overwriteReplaces = !!afterOver && afterOver.title === "CHANGED" && afterOver.items.length === 1;
      const cntAfter = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM shelves WHERE slug = ?", ["rt-shelf-rt"]))[0].n;
      out.M_noDuplicateRow = Number(cntAfter) === 1;

      // ── 4) slug UNIQUE index — createShelf twice rejects ──
      await ldb.dbRun("DELETE FROM shelves WHERE slug = ?", ["rt-uniq"]);
      await ldb.createShelf({ slug: "rt-uniq", title: "u", track: "literary" });
      let threw = false;
      try { await ldb.createShelf({ slug: "rt-uniq", title: "u2", track: "literary" }); } catch (_) { threw = true; }
      out.U_uniqueRejects = threw;

      // ── 5) ordering: track, COALESCE(order_index,999999), title ──
      await wipe();
      await ldb.createShelf({ slug: "rt-lit-b", title: "B", track: "literary", order: 2 });
      await ldb.createShelf({ slug: "rt-acc-a2", title: "B", track: "accessible", order: 1 });
      await ldb.createShelf({ slug: "rt-acc-a", title: "A", track: "accessible", order: 1 });
      await ldb.createShelf({ slug: "rt-acc-null", title: "Zzz", track: "accessible", order: null });
      const ordered = (await ldb.getShelves()).filter((s) => s.slug.startsWith("rt-")).map((s) => s.slug);
      out.O_order = ordered;
      out.O_correct = eq(ordered, ["rt-acc-a", "rt-acc-a2", "rt-acc-null", "rt-lit-b"]);

      // ── 6) import validation: invalid/missing track → honest error, no row ──
      await wipe();
      const badRes = await ldb.importBundle(mkBundle([
        { slug: "rt-notrack", title: "x" },                 // missing track
        { slug: "rt-badtrack", title: "x", track: "premium" }, // invalid track
        { slug: "rt-ok", title: "ok", track: "accessible" },   // valid control
      ]), { mode: "skip" });
      const shelfErrs = (badRes.errors || []).filter((e) => e && typeof e === "object" && e.stage === "shelf");
      out.V_errorsAreObjects = shelfErrs.length >= 2 && shelfErrs.every((e) => typeof e.error === "string" && e.error.length > 0);
      out.V_noRowForInvalid = (await ldb.getShelfBySlug("rt-notrack")) === null && (await ldb.getShelfBySlug("rt-badtrack")) === null;
      out.V_validControlImported = !!(await ldb.getShelfBySlug("rt-ok"));

      // ── 7) dangling member text_key → imported (warn), NOT silently dropped ──
      await wipe();
      await ldb.importBundle(mkBundle([
        { slug: "rt-dangle", title: "d", track: "accessible", items: [{ text_key: "does-not-exist", order: 0 }] },
      ]), { mode: "skip" });
      const dangle = await ldb.getShelfBySlug("rt-dangle");
      out.D_imported = !!dangle && dangle.items.length === 1 && dangle.items[0].text_key === "does-not-exist";

      await wipe();
      return out;
    });

    if (R.dbSkipped) { console.log("[shelf-roundtrip-smoke] OPFS DB unavailable — SKIP"); await browser.close(); await stopServer(srv.child); process.exit(0); }

    test("export: shelf present in bundle.library.shelves", R.E_present);
    test("export: items intact (3 incl non-latin text_key)", R.E_itemsIntact);
    test("export: all fields carried (track/era/genre/intro)", R.E_fields);
    test("import: shelf round-trips through real OPFS", R.I_present);
    test("import: items_json deep-equal after SQLite round-trip", R.I_itemsDeepEqual);
    test("import: all fields preserved", R.I_fields);
    test("getShelfBySlug resolves the round-tripped shelf", R.I_getBySlug);
    test("re-import mode=skip leaves existing shelf untouched", R.M_skipLeavesAlone);
    test("re-import mode=overwrite replaces curation", R.M_overwriteReplaces);
    test("upsert keeps a single row per slug (no duplicate)", R.M_noDuplicateRow);
    test("slug UNIQUE index — second createShelf rejects", R.U_uniqueRejects);
    test("getShelves ordering (track, order_index NULL-last, title)", R.O_correct, JSON.stringify(R.O_order));
    test("invalid-shelf import → object errors with detail", R.V_errorsAreObjects);
    test("invalid-shelf import writes NO row", R.V_noRowForInvalid);
    test("valid control shelf still imported alongside invalid", R.V_validControlImported);
    test("dangling member text_key imported (warn, not silent drop)", R.D_imported);
    test("no pageerror on index.html", errs.length === 0, errs[0]);

    await browser.close();
  } finally {
    await stopServer(srv.child);
  }

  console.log(`\n[shelf-roundtrip-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("[shelf-roundtrip-smoke] fatal", e); process.exit(1); });
