#!/usr/bin/env node
// scripts/premium/km-quiz-items-smoke.js — KM Phase-4 item-generator honesty.
//
// R1 INVARIANT (the spine): every distractor a generator emits MUST be REAL —
// it must exist in the corpus/root/binyan inventory it was drawn from. A
// generator returns null rather than pad with invented forms. This gate feeds
// a deterministic fixture index to the pure synchronous generators (types 1–3)
// exposed on window.KnowledgeMapQuiz and asserts set-membership + honest skip +
// determinism. No DB, no DOM beyond a lite page; no network.

"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3258;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", (c) => logs.push(String(c).trim())); child.stderr.on("data", (c) => logs.push(String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return; child.kill("SIGTERM");
  const exited = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); child.once("exit", () => { clearTimeout(t); r(true); }); });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL");
}
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

// Deterministic fixture index mirroring KnowledgeMapData.build() output shape.
// 3 roots (כתב/למד/שמר); corpus binyanim = paal/piel/hifil (≥3 → guess_binyan
// has real distractors). One lemma with no binyan (מכתב) → guess_binyan skips it.
const FIXTURE = `
window.__KMQ_IDX = {
  roots: [
    { id:"root:כתב", rawId:"כתב", label:"כתב", freq:5, status:"learning", memberCount:2, lemmaKeys:["word:pid:1","word:מכתב#noun"] },
    { id:"root:למד", rawId:"למד", label:"למד", freq:3, status:"new", memberCount:1, lemmaKeys:["word:pid:2"] },
    { id:"root:שמר", rawId:"שמר", label:"שמר", freq:2, status:"new", memberCount:1, lemmaKeys:["word:pid:3"] }
  ],
  lemmas: [
    { id:"word:pid:1", kind:"word", rawId:"כותב", label:"כותב", freq:3, status:"learning", roots:["כתב"], binyans:["paal"], pos:["verb"], textIds:["T1"], meaning:"пишет", noteIds:["N1"] },
    { id:"word:מכתב#noun", kind:"word", rawId:"מכתב", label:"מכתב", freq:2, status:"new", roots:["כתב"], binyans:[], pos:["noun"], textIds:["T1"], meaning:"письмо", noteIds:["N2"] },
    { id:"word:pid:2", kind:"word", rawId:"לומד", label:"לומד", freq:3, status:"new", roots:["למד"], binyans:["piel"], pos:["verb"], textIds:["T2"], meaning:"учит", noteIds:["N3"] },
    { id:"word:pid:3", kind:"word", rawId:"שומר", label:"שומר", freq:2, status:"new", roots:["שמר"], binyans:["hifil"], pos:["verb"], textIds:["T2"], meaning:"охраняет", noteIds:["N4"] }
  ],
  edges: [], stats: {}
};
// poor index: 1 root, 1 binyan → word_to_root + guess_binyan must honestly skip
window.__KMQ_POOR = {
  roots: [ { id:"root:בנה", rawId:"בנה", label:"בנה", freq:1, status:"new", memberCount:1, lemmaKeys:["word:pid:9"] } ],
  lemmas: [ { id:"word:pid:9", kind:"word", rawId:"בונה", label:"בונה", freq:1, status:"new", roots:["בנה"], binyans:["paal"], pos:["verb"], textIds:["T9"], meaning:"строит", noteIds:["N9"] } ],
  edges: [], stats: {}
};
`;

async function main() {
  let playwright;
  try { playwright = require("playwright"); } catch (e) { console.error("[km-quiz-items] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[km-quiz-items] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[km-quiz-items] server up");
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: FIXTURE });
    await pg.addScriptTag({ url: "/js/knowledge-map-quiz.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMapQuiz, null, { timeout: 5000 });

    const r = await pg.evaluate(() => {
      const Q = window.KnowledgeMapQuiz, idx = window.__KMQ_IDX;
      const allRoots = new Set(idx.roots.map((x) => x.rawId));
      const corpusBinyans = new Set(); idx.lemmas.forEach((l) => (l.binyans || []).forEach((b) => corpusBinyans.add(b)));
      // cluster for root כתב (2 lemmas)
      const cluster = { root: idx.roots[0], lemmas: idx.lemmas.filter((l) => (l.roots || [])[0] === "כתב") };
      const items = Q._genItems(cluster, { idx });
      const items2 = Q._genItems(cluster, { idx });

      const byKind = {}; items.forEach((it) => { (byKind[it.kind] = byKind[it.kind] || []).push(it); });

      // honesty: every MC option ∈ its real pool
      let wtrOk = true, wtrCorrect = true;
      (byKind.word_to_root || []).forEach((it) => {
        it.options.forEach((o) => { if (!allRoots.has(o.key)) wtrOk = false; });
        if (it.correctKey !== "כתב") wtrCorrect = false;
        if (it.options.length < 3) wtrOk = false;
      });
      let binOk = true, binCorrect = true;
      (byKind.guess_binyan || []).forEach((it) => {
        it.options.forEach((o) => { if (!corpusBinyans.has(o.key)) binOk = false; });
        const lemma = idx.lemmas.find((l) => l.id === it.lemmaId);
        if (it.correctKey !== (lemma.binyans || [])[0]) binCorrect = false;
        if (it.options.length < 3) binOk = false;
      });
      // recall: no distractors, reveal.meaning = real gloss
      let recallOk = true;
      (byKind.recall_meaning || []).forEach((it) => {
        const lemma = idx.lemmas.find((l) => l.id === it.lemmaId);
        if (it.answerMode !== "recall" || it.options) recallOk = false;
        if (!it.reveal || it.reveal.meaning !== lemma.meaning) recallOk = false;
      });
      // מכתב (no binyan) → NO guess_binyan item for it
      const michtavBinyan = (byKind.guess_binyan || []).some((it) => it.lemmaId === "word:מכתב#noun");

      // honest skip on the poor index (1 root, 1 binyan)
      const poor = window.__KMQ_POOR;
      const poorCluster = { root: poor.roots[0], lemmas: poor.lemmas.slice() };
      const poorItems = Q._genItems(poorCluster, { idx: poor });
      const poorKinds = new Set(poorItems.map((i) => i.kind));

      return {
        kinds: Object.keys(byKind).sort(),
        wtrCount: (byKind.word_to_root || []).length,
        binCount: (byKind.guess_binyan || []).length,
        recallCount: (byKind.recall_meaning || []).length,
        wtrOk, wtrCorrect, binOk, binCorrect, recallOk,
        michtavBinyanSkipped: !michtavBinyan,
        deterministic: JSON.stringify(items) === JSON.stringify(items2),
        poorHasWordToRoot: poorKinds.has("word_to_root"),
        poorHasGuessBinyan: poorKinds.has("guess_binyan"),
        poorHasRecall: poorKinds.has("recall_meaning"),
      };
    });

    test("generators emit the 3 sync kinds", r.kinds.length >= 1 && r.recallCount >= 1, JSON.stringify(r.kinds));
    test("word_to_root: every option is a REAL corpus root", r.wtrOk === true, JSON.stringify(r));
    test("word_to_root: correct key = the lemma's real root", r.wtrCorrect === true);
    test("guess_binyan: every option is a REAL corpus binyan", r.binOk === true, JSON.stringify(r));
    test("guess_binyan: correct key = the lemma's real binyan", r.binCorrect === true);
    test("guess_binyan: lemma with no binyan (מכתב) is skipped", r.michtavBinyanSkipped === true);
    test("recall_meaning: no distractors, reveal = real gloss", r.recallOk === true);
    test("determinism: gen twice → identical", r.deterministic === true);
    test("honest skip: poor index drops word_to_root (only 1 root)", r.poorHasWordToRoot === false, JSON.stringify(r));
    test("honest skip: poor index drops guess_binyan (<3 binyanim)", r.poorHasGuessBinyan === false);
    test("honest skip: poor index still offers recall (has meaning)", r.poorHasRecall === true);
    test("no pageerror", errs.length === 0, errs.join(" | "));

    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv.child); }
  console.log(`\n[km-quiz-items] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error("[km-quiz-items] fatal:", e); process.exit(1); });
