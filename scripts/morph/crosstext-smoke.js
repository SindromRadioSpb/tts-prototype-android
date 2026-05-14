#!/usr/bin/env node
// scripts/morph/crosstext-smoke.js — CrossText service-level smoke (v3.3.2 D15 C1).
//
// Pipeline: spawn server → launch Chromium → /crosstext-test.html →
//   install mock window.__localDB.dbQuery + MorphProvider (root=שלם
//   stub) + load real morph-normalize.js + load crosstext.js → drive
//   the public API.
//
// Cases (C1 service-level):
//   1. ensureIndex completes; getStats reflects fixture size.
//   2. Direct surface-form lookup "שלום" → 4 occurrences.
//   3. Niqqud-insensitive lookup "שָׁלוֹם" → identical 4 occurrences.
//   4. includeRoot=true on "שלום" → strict superset (adds root form).
//   5. Cache hit second lookup of same word → < 30 ms.
//   6. Empty result for an unmatched Hebrew word.
//   7. invalidate() drops the index; next call rebuilds.
//   8. excludeTextId filter omits target text's occurrences.
//
// C2 (UI commit) will add cases for the side-panel render + click-through.
// Exits 0 on success, 1 on any failure.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3195;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer(port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(port) },
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
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(baseUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(baseUrl + "/healthz");
      if (r.status === 200) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

// Synthetic library used by the smoke. Designed so:
//   key "שלומ" (normalize "שלום") appears in 4 sentences across 3 texts.
//   key "שלמ"  (normalize "שלם", standalone form) appears in 1 sentence (t4).
//   includeRoot test relies on the MorphProvider mock returning root="שלם".
const FIXTURE = [
  // t1: 3 sentences, "שלום" appears in s1-1 (1×) and s1-3 (2× same sentence).
  { sentence_id: "s1-1", text_id: "t1", text_title: "Berakhot Greetings", order_index: 0, he_plain: "שלום עליכם" },
  { sentence_id: "s1-2", text_id: "t1", text_title: "Berakhot Greetings", order_index: 1, he_plain: "ברוך הבא בית" },
  { sentence_id: "s1-3", text_id: "t1", text_title: "Berakhot Greetings", order_index: 2, he_plain: "שלום שלום ועד" },
  // t2: 2 sentences; "שלום" twice in s2-2.
  { sentence_id: "s2-1", text_id: "t2", text_title: "Ulpan Aleph",        order_index: 0, he_plain: "אהבה רבה אהבה" },
  { sentence_id: "s2-2", text_id: "t2", text_title: "Ulpan Aleph",        order_index: 1, he_plain: "שלום אהבה ושלום" },
  // t3: niqqud variant should still match via MorphNormalize.
  { sentence_id: "s3-1", text_id: "t3", text_title: "With Niqqud",        order_index: 0, he_plain: "שָׁלוֹם בית" },
  // t4: root-only form (no final ם here — base stem "שלם"). includeRoot=true should pick this up.
  { sentence_id: "s4-1", text_id: "t4", text_title: "Root Test",          order_index: 0, he_plain: "שלם הוא" },
];

async function main() {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log(`[crosstext-smoke] starting server on ${baseUrl}…`);

  const { child, logs } = startServer(PORT);
  let exitCode = 1;
  let playwright;
  try { playwright = require("playwright"); }
  catch (_) {
    console.error("[crosstext-smoke] playwright not installed");
    await stopServer(child);
    process.exit(1);
  }

  let browser;
  try {
    const ready = await waitForReady(baseUrl);
    if (!ready) throw new Error("server did not become ready in 15s");
    console.log("[crosstext-smoke] server up");

    browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    await page.goto(`${baseUrl}/crosstext-test.html`, { waitUntil: "domcontentloaded" });

    // Install mocks BEFORE loading crosstext.js so its first lookup hits
    // our fixture. The mock pattern-matches the SELECT query CrossText
    // uses and returns the FIXTURE rows.
    await page.addScriptTag({ content: `
      window.__FIXTURE = ${JSON.stringify(FIXTURE)};
      window.__localDB = {
        dbQuery: async function (sql) {
          // crosstext.js issues exactly one SELECT joining sentences+texts.
          if (/FROM sentences\\s+s\\s+JOIN texts/i.test(sql)) {
            // Return shallow copies so the module doesn't mutate fixture.
            return window.__FIXTURE.map((r) => Object.assign({}, r));
          }
          return [];
        },
      };
      // MorphProvider mock — minimal surface for _resolveRoot.
      window.MorphProvider = {
        analyze: async function (word) {
          // For "שלום" return analysis with root "שלם". Anything else: empty.
          if (typeof word === 'string' && word.trim() === 'שלום') {
            return [{ r: 'שלם', l: 'שלם', b: null, p: 'noun', s: 'mock', k: 0, u: word }];
          }
          return [];
        },
      };
    `});

    // Real morph-normalize.js (final-letter mapping + niqqud strip).
    await page.addScriptTag({ url: `/js/morph-normalize.js` });
    // Subject under test.
    await page.addScriptTag({ url: `/js/crosstext.js` });
    await page.waitForFunction(() => !!window.CrossText, { timeout: 5000 });

    const results = await page.evaluate(async () => {
      const out = [];
      const test = async (name, fn) => {
        try { await fn(); out.push({ name, ok: true }); }
        catch (e) { out.push({ name, ok: false, err: String((e && e.message) || e) }); }
      };
      const ct = window.CrossText;

      // 1. ensureIndex + getStats
      await test('ensureIndex completes; stats reflect 7 sentences across 4 texts', async () => {
        await ct._ensureIndex();
        const s = ct.getStats();
        if (!s.index_built) throw new Error('index_built=false');
        if (s.sentences_indexed !== 7) throw new Error('expected 7 sentences, got ' + s.sentences_indexed);
        if (s.texts_indexed !== 4) throw new Error('expected 4 texts, got ' + s.texts_indexed);
      });

      // 2. Direct lookup "שלום"
      let directHits = null;
      await test('direct surface-form "שלום" → 4 occurrences', async () => {
        directHits = await ct.findOccurrences('שלום'); // שלום
        if (directHits.length !== 4) throw new Error('expected 4, got ' + directHits.length + ': ' + JSON.stringify(directHits.map((o)=>o.sentence_id)));
        const ids = directHits.map((o) => o.sentence_id).sort();
        const wantIds = ['s1-1','s1-3','s2-2','s3-1'].sort();
        if (JSON.stringify(ids) !== JSON.stringify(wantIds)) {
          throw new Error('sentence_ids: got ' + JSON.stringify(ids) + ' want ' + JSON.stringify(wantIds));
        }
      });

      // 3. Niqqud-insensitive
      await test('niqqud-insensitive "שָׁלוֹם" → same 4 occurrences', async () => {
        const hits = await ct.findOccurrences('שָׁלוֹם'); // שָׁלוֹם
        if (hits.length !== 4) throw new Error('expected 4, got ' + hits.length);
      });

      // 4. includeRoot=true → strict superset
      await test('includeRoot=true on "שלום" → superset (adds root form)', async () => {
        const withRoot = await ct.findOccurrences('שלום', { includeRoot: true });
        if (withRoot.length <= 4) throw new Error('expected > 4, got ' + withRoot.length);
        // s4-1 (the "שלם" sentence) should be present.
        const ids = withRoot.map((o) => o.sentence_id);
        if (!ids.includes('s4-1')) throw new Error('expected s4-1 in result; got ' + JSON.stringify(ids));
        // root field populated
        const sample = withRoot.find((o) => o.root);
        if (!sample) throw new Error('expected at least one occurrence to have .root populated');
        if (sample.root !== 'שלם') throw new Error('root wrong: ' + sample.root);
      });

      // 5. Cache hit < 30 ms
      await test('second lookup of same word → cache hit < 30 ms', async () => {
        await ct.findOccurrences('שלום'); // prime cache (already primed actually)
        const t0 = performance.now();
        await ct.findOccurrences('שלום');
        const dt = performance.now() - t0;
        const stat = ct.getStats().last_query_ms;
        if (dt > 30 || stat > 30) throw new Error('cache hit too slow: actual=' + Math.round(dt) + ' stat=' + stat);
      });

      // 6. Empty result for unmatched word
      await test('unmatched Hebrew word → []', async () => {
        const hits = await ct.findOccurrences('טרקטור'); // טרקטור — not in fixture
        if (hits.length !== 0) throw new Error('expected 0, got ' + hits.length);
      });

      // 7. invalidate drops index; next call rebuilds
      await test('invalidate() drops index; next call rebuilds with fresh stats', async () => {
        ct.invalidate();
        const s1 = ct.getStats();
        if (s1.index_built !== false) throw new Error('expected index_built=false after invalidate');
        // Re-trigger build.
        await ct.findOccurrences('שלום');
        const s2 = ct.getStats();
        if (s2.index_built !== true) throw new Error('expected index rebuilt');
        if (s2.sentences_indexed !== 7) throw new Error('expected 7 sentences after rebuild');
      });

      // 8. excludeTextId filter
      await test('excludeTextId="t1" omits t1 occurrences', async () => {
        const hits = await ct.findOccurrences('שלום', { excludeTextId: 't1' });
        // 4 total - 2 in t1 (s1-1, s1-3) = 2 remaining (s2-2, s3-1)
        if (hits.length !== 2) throw new Error('expected 2, got ' + hits.length + ': ' + JSON.stringify(hits.map((o)=>o.sentence_id)));
        if (hits.some((o) => o.text_id === 't1')) throw new Error('t1 leaked: ' + JSON.stringify(hits.map((o)=>o.text_id)));
      });

      return out;
    });

    let passed = 0, failed = 0;
    for (const r of results) {
      console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.err}`);
      if (r.ok) passed++; else failed++;
    }
    if (pageErrors.length) {
      console.error('\n[crosstext-smoke] page errors:');
      for (const e of pageErrors) console.error('  ' + e);
    }
    console.log(`\n[crosstext-smoke] ${passed}/${passed + failed} passed`);
    exitCode = failed === 0 && pageErrors.length === 0 ? 0 : 1;
  } catch (e) {
    console.error('[crosstext-smoke] fatal:', e && e.message ? e.message : e);
    for (const line of logs.slice(-20)) console.error('  ' + line);
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[crosstext-smoke] unhandled:", e); process.exit(1); });
}
