#!/usr/bin/env node
// scripts/notes-graph/build-data-smoke.js — v3.3.6 C2 data-layer smoke.
//
// 7 cases per docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md §13 + blind-spot §E:
//   1. All 6 node kinds enumerable from a seeded DB.
//   2. All 3 edge kinds populated.
//   3. Dedup: target_anchor + explicit_link on the same pair keeps ONE
//      explicit_link edge with also_target=true.
//   4. derived_morph edges synthesized from body_json $.root/$.binyan/$.word.
//   5. Top-N degree fallback at > MAX_NODES (deterministic tie-break).
//   6. Cross-text root parity: NotesGraphData._resolveRoot("שלום")
//      resolves the same root crosstext's contract yields.
//   7. Niqqud parity: _resolveRoot("שָׁלוֹם") (niqqud variant) → same root
//      (both modules normalize via the shared window.MorphNormalize).
//
// Harness mirrors scripts/morph/crosstext-smoke.js: spawn server →
// Chromium → mock window.__localDB.dbQuery + window.MorphProvider →
// load real morph-normalize.js + crosstext.js + notes-graph.js →
// drive NotesGraphData.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3203;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
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
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

// Fixture rows. Note Q-shape mirrors notes_v2 SELECT projection in
// notes-graph.js _fetchRaw (json_extract already applied → j_root etc).
const NOTES = [
  // n1: free note anchored to a text → target_anchor note→text:t1
  { id: "n1", title: "Free note A", target_kind: "text", target_id: "t1",
    text_id: "t1", note_type: "free", j_root: null, j_binyan: null, j_word: null,
    updated_at: "2026-05-15T00:00:00Z" },
  // n2: word_study with root+binyan+word → 3 derived_morph edges
  { id: "n2", title: "Word שלום", target_kind: "word", target_id: "שלום",
    text_id: "t1", note_type: "word_study", j_root: "שלם", j_binyan: "PA'AL",
    j_word: "שלום", updated_at: "2026-05-15T00:01:00Z" },
  // n3: grammar_rule with root only
  { id: "n3", title: "Rule about שלם", target_kind: "free", target_id: null,
    text_id: "t2", note_type: "grammar_rule", j_root: "שלם", j_binyan: null,
    j_word: null, updated_at: "2026-05-15T00:02:00Z" },
  // n4: free note anchored to a sentence → target_anchor note→sentence:s1
  { id: "n4", title: "Note on s1", target_kind: "sentence", target_id: "s1",
    text_id: "t1", note_type: "free", j_root: null, j_binyan: null, j_word: null,
    updated_at: "2026-05-15T00:03:00Z" },
  // n5: free note anchored to text t1 AND ALSO has an explicit [[t1]]
  //     link → the dedup case (case 3).
  { id: "n5", title: "Dedup note", target_kind: "text", target_id: "t1",
    text_id: "t1", note_type: "free", j_root: null, j_binyan: null, j_word: null,
    updated_at: "2026-05-15T00:04:00Z" },
];
const LINKS = [
  // explicit note→note
  { from_note_id: "n1", to_kind: "note", to_id: "n2", link_alias: null },
  // explicit note→root
  { from_note_id: "n1", to_kind: "root", to_id: "שרש", link_alias: "корень" },
  // explicit note→binyan
  { from_note_id: "n3", to_kind: "binyan", to_id: "HIF'IL", link_alias: null },
  // explicit note→word
  { from_note_id: "n3", to_kind: "word", to_id: "כתב", link_alias: null },
  // explicit note→sentence
  { from_note_id: "n2", to_kind: "sentence", to_id: "s2", link_alias: null },
  // explicit note→text — SAME pair as n5's target_anchor (dedup case 3)
  { from_note_id: "n5", to_kind: "text", to_id: "t1", link_alias: "see text" },
];
const TEXTS = [
  { id: "t1", title: "Text One" },
  { id: "t2", title: "Text Two" },
];

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[build-data-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[build-data-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[build-data-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

  try {
    await page.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });

    await page.addScriptTag({ content: `
      window.__N = ${JSON.stringify(NOTES)};
      window.__L = ${JSON.stringify(LINKS)};
      window.__T = ${JSON.stringify(TEXTS)};
      window.__bigN = (function () {
        // 260 word_study notes each with a unique root → > MAX_NODES.
        var arr = [];
        for (var i = 0; i < 260; i++) {
          arr.push({ id: 'b' + i, title: 'note ' + i, target_kind: 'free',
            target_id: null, text_id: 't1', note_type: 'word_study',
            j_root: 'rt' + i, j_binyan: null, j_word: null,
            updated_at: '2026-05-15T00:00:00Z' });
        }
        return arr;
      })();
      window.__mode = 'normal';
      window.__localDB = {
        dbQuery: async function (sql) {
          if (/FROM notes_v2/i.test(sql)) {
            return (window.__mode === 'big' ? window.__bigN : window.__N)
              .map(function (r) { return Object.assign({}, r); });
          }
          if (/FROM note_links/i.test(sql)) {
            return (window.__mode === 'big' ? [] : window.__L)
              .map(function (r) { return Object.assign({}, r); });
          }
          if (/FROM texts/i.test(sql)) {
            return window.__T.map(function (r) { return Object.assign({}, r); });
          }
          return [];
        },
      };
      // The REAL MorphProvider is niqqud-insensitive (the morph dict
      // normalizes internally). Mirror that here: normalize the input
      // via the shared MorphNormalize before matching, so a niqqud
      // variant resolves the same root — exactly the parity contract
      // crosstext relies on.
      window.MorphProvider = {
        ensureReady: async function () {},
        analyze: async function (word) {
          var raw = String(word || '').trim();
          var w = (window.MorphNormalize &&
                   typeof window.MorphNormalize.normalizeHebrew === 'function')
                    ? window.MorphNormalize.normalizeHebrew(raw) : raw;
          if (w === 'שלום' || w === 'שלומ' || w === 'שלם' || w === 'שלמ') {
            return [{ r: 'שלם', b: null, p: 'noun' }];
          }
          return [];
        },
      };
    `});
    await page.addScriptTag({ url: "/js/morph-normalize.js" });
    await page.addScriptTag({ url: "/js/crosstext.js" });
    await page.addScriptTag({ url: "/js/notes-graph.js" });
    await page.waitForFunction(
      () => !!window.NotesGraphData && !!window.CrossText, { timeout: 5000 });

    const r = await page.evaluate(async () => {
      const g = await window.NotesGraphData.buildGraph();
      // big mode for top-N
      window.__mode = "big";
      const big = await window.NotesGraphData.buildGraph();
      window.__mode = "normal";
      // parity
      const pRaw = await window.NotesGraphData._resolveRoot("שלום");
      const pNiq = await window.NotesGraphData._resolveRoot("שָׁלוֹם");
      // crosstext shares the same window.MorphNormalize ref → parity by
      // construction; assert the normalize fn identity + that the
      // niqqud variant normalizes to the same key the mock matches.
      const sharedNormalize =
        typeof window.MorphNormalize.normalizeHebrew === "function";
      const niqNormalized = window.MorphNormalize.normalizeHebrew("שָׁלוֹם");
      return { g, big, pRaw, pNiq, sharedNormalize, niqNormalized };
    });

    const kinds = new Set(r.g.nodes.map((n) => n.kind));
    test("Case 1: all 6 node kinds present (note/text/sentence/root/word/binyan)",
         ["note", "text", "sentence", "root", "word", "binyan"].every((k) => kinds.has(k)),
         "got: " + Array.from(kinds).sort().join(","));

    const ekinds = new Set(r.g.edges.map((e) => e.edge_kind));
    test("Case 2: all 3 edge kinds present (explicit_link/target_anchor/derived_morph)",
         ["explicit_link", "target_anchor", "derived_morph"].every((k) => ekinds.has(k)),
         "got: " + Array.from(ekinds).sort().join(","));

    // n5 targets t1 (anchor) AND links [[t1]] (explicit). Expect exactly
    // ONE edge note:n5→text:t1, edge_kind=explicit_link, also_target=true.
    const dedupEdges = r.g.edges.filter(
      (e) => e.source === "note:n5" && e.target === "text:t1");
    test("Case 3: target_anchor+explicit_link dedup → 1 explicit_link edge, also_target=true",
         dedupEdges.length === 1 &&
         dedupEdges[0].edge_kind === "explicit_link" &&
         dedupEdges[0].also_target === true,
         JSON.stringify(dedupEdges));

    // n2 word_study has root+binyan+word → 3 derived_morph edges.
    const dm = r.g.edges.filter(
      (e) => e.source === "note:n2" && e.edge_kind === "derived_morph");
    const dmTargets = new Set(dm.map((e) => e.target));
    test("Case 4: derived_morph from $.root/$.binyan/$.word (n2 → root+binyan+word)",
         dm.length === 3 &&
         dmTargets.has("root:שלם") &&
         dmTargets.has("binyan:PA'AL") &&
         Array.from(dmTargets).some((t) => t.startsWith("word:")),
         JSON.stringify(Array.from(dmTargets)));

    // big mode: 260 word_study notes (all text_id='t1') + 260 unique
    // roots + 1 shared source-text node = 521 nodes. v3.5: the
    // `auto_text` backbone now materialises the source text from
    // notes_v2.text_id, so the count is 521 (was 520 before notes
    // were auto-attached to their text). Cap still trims to 200.
    test("Case 5: top-N degree fallback at > MAX_NODES (521 → 200, deterministic)",
         r.big.reduced &&
         r.big.reduced.total === 521 &&
         r.big.reduced.shown === 200 &&
         r.big.nodes.length === 200,
         JSON.stringify(r.big.reduced) + " nodes=" + r.big.nodes.length);

    test("Case 6: cross-text root parity — _resolveRoot('שלום') → {root:'שלם'}",
         r.pRaw && r.pRaw.root === "שלם" && r.sharedNormalize,
         JSON.stringify(r.pRaw));

    test("Case 7: niqqud parity — _resolveRoot('שָׁלוֹם') → same root via shared MorphNormalize",
         r.pNiq && r.pNiq.root === "שלם",
         "resolved=" + JSON.stringify(r.pNiq) + " niqNormalized=" + r.niqNormalized);

    if (pageErrors.length) {
      failed++;
      console.log("  ✗ Bonus: pageerror during data build — " + pageErrors.join(" | "));
    } else {
      console.log("  · (bonus) no pageerror during data build");
    }
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[build-data-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[build-data-smoke] fatal:", e); process.exit(1); });
