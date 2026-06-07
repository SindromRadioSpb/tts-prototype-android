#!/usr/bin/env node
// scripts/premium/km-quiz-boot-smoke.js — KM Phase-4 lazy-load + overlay boot.
//
// Verifies the real app page boots with the quiz LOADER eager but the heavy
// quiz MODULE lazy:
//   • window.KnowledgeMapQuizLoader exists immediately (buttons can bind).
//   • window.KnowledgeMapQuiz is UNDEFINED until the first loader.open().
//   • after loader.open() the module loads, the overlay opens, close() removes it.
//   • no fatal pageerror.

"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3259;
const BASE = `http://127.0.0.1:${PORT}`;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
let passed = 0, failed = 0;
function test(n, c, e) { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.log("  ✗ " + n + (e ? " — " + e : "")); } }
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await new Promise((r) => { const t = setTimeout(() => r(), 4000); c.once("exit", () => { clearTimeout(t); r(); }); }); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  const playwright = require("playwright");
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html?v=kmquizboot", { waitUntil: "domcontentloaded" });
    await sleep(2000);

    const pre = await pg.evaluate(() => ({
      hasLoader: !!window.KnowledgeMapQuizLoader,
      moduleUndefBeforeOpen: typeof window.KnowledgeMapQuiz === "undefined",
      loaderNotLoaded: window.KnowledgeMapQuizLoader && window.KnowledgeMapQuizLoader.isLoaded() === false,
    }));
    test("KnowledgeMapQuizLoader exists immediately", pre.hasLoader === true, JSON.stringify(pre));
    test("KnowledgeMapQuiz UNDEFINED until first open (lazy)", pre.moduleUndefBeforeOpen === true, JSON.stringify(pre));
    test("loader reports not-loaded before open", pre.loaderNotLoaded === true);

    // first open → lazy module load + overlay
    await pg.evaluate(() => window.KnowledgeMapQuizLoader.open({ mode: "root" }));
    await sleep(1500);
    const post = await pg.evaluate(() => ({
      moduleDefined: typeof window.KnowledgeMapQuiz !== "undefined",
      loaded: window.KnowledgeMapQuizLoader.isLoaded() === true,
      overlayOpen: !!document.getElementById("kmQuizOverlay"),
      isOpen: window.KnowledgeMapQuiz && window.KnowledgeMapQuiz.isOpen(),
    }));
    test("module defined after open", post.moduleDefined === true, JSON.stringify(post));
    test("loader reports loaded after open", post.loaded === true);
    test("overlay opens", post.overlayOpen === true && post.isOpen === true, JSON.stringify(post));

    await pg.screenshot({ path: path.join(REPO_ROOT, ".tmp", "km-quiz-boot.png") });

    const closed = await pg.evaluate(() => { window.KnowledgeMapQuiz.close(); return !document.getElementById("kmQuizOverlay"); });
    test("close() removes overlay", closed === true);
    test("no fatal pageerror", errs.length === 0, errs.join(" | "));

    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[km-quiz-boot] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
