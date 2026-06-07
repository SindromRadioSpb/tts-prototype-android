#!/usr/bin/env node
// scripts/premium/km-quiz-cta-smoke.js — KM Phase-4 «Повторять в Anki» CTA +
// the hybrid no-grade-push invariant.
//
//   • _routeToAnkiExport reuses the canonical word-export route
//     (window.v3SrsTrainerOpenAnkiExport → #btnAnki) — no dead-end.
//   • STATIC: the quiz module never pushes a review GRADE into Anki — it makes
//     no AnkiConnect call at all (no v3AnkiConnectDirect / guiAnswerCard /
//     answerCards). This is the structural guarantee behind the hybrid model.
//   • i18n: the new quiz.* keys resolve in ru/en/he.

"use strict";
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3262;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() { const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); const logs = []; child.stdout.on("data", (c) => logs.push(String(c).trim())); child.stderr.on("data", (c) => logs.push(String(c).trim())); return { child, logs }; }
async function stopServer(child) { if (!child || child.killed) return; child.kill("SIGTERM"); const exited = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); child.once("exit", () => { clearTimeout(t); r(true); }); }); if (exited) return; if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL"); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  // ── STATIC: no Anki grade-push anywhere in the quiz module ───────────────
  const src = fs.readFileSync(path.join(REPO_ROOT, "public", "js", "knowledge-map-quiz.js"), "utf8");
  test("quiz module makes NO AnkiConnect call (no v3AnkiConnectDirect)", !/v3AnkiConnectDirect/.test(src));
  test("quiz module pushes NO grade (no guiAnswerCard / answerCards)", !/guiAnswerCard|answerCards/.test(src));
  test("quiz module writes NO SM2 / scheduler fields (no srs_attempts/srs_reviews/ease_factor)", !/srs_attempts|srs_reviews|ease_factor|interval_days/.test(src));

  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[km-quiz-cta] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[km-quiz-cta] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[km-quiz-cta] server up");
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html?v=kmquizcta", { waitUntil: "domcontentloaded" });
    await sleep(1500);

    const r = await pg.evaluate(async () => {
      const out = {};
      // ensure the lazy module is loaded
      if (!window.KnowledgeMapQuiz && window.KnowledgeMapQuizLoader) {
        try { await window.KnowledgeMapQuizLoader.open({ mode: "root" }); if (window.KnowledgeMapQuiz) window.KnowledgeMapQuiz.close(); } catch (_) {}
      }
      // mock the canonical Anki route; assert the CTA reuses it
      let routed = 0; const orig = window.v3SrsTrainerOpenAnkiExport;
      window.v3SrsTrainerOpenAnkiExport = function () { routed++; };
      try { window.KnowledgeMapQuiz._routeToAnkiExport("T1"); } catch (_) {}
      window.v3SrsTrainerOpenAnkiExport = orig;
      out.routedToCanonical = routed === 1;
      // i18n keys resolve in all three locales (API: window.appSetLocale / window.t)
      out.i18n = {};
      const keys = ["kmquiz.title", "kmquiz.reviewInAnki", "kmquiz.trainRoot", "kmquiz.q.wordToRoot", "kmquiz.q.whichForm", "kmquiz.q.connection"];
      for (const L of ["ru", "en", "he"]) {
        try { if (typeof window.appSetLocale === "function") window.appSetLocale(L); } catch (_) {}
        const t = (k) => { try { return window.t(k); } catch (_) { return k; } };
        out.i18n[L] = keys.every((k) => { const v = t(k); return typeof v === "string" && v && v !== k; });
      }
      try { if (typeof window.appSetLocale === "function") window.appSetLocale("ru"); } catch (_) {}
      return out;
    });

    test("CTA routes to the canonical Anki export (v3SrsTrainerOpenAnkiExport)", r.routedToCanonical === true, JSON.stringify(r));
    test("i18n quiz.* resolves in ru", r.i18n.ru === true);
    test("i18n quiz.* resolves in en", r.i18n.en === true);
    test("i18n quiz.* resolves in he", r.i18n.he === true);
    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv.child); }
  console.log(`\n[km-quiz-cta] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error("[km-quiz-cta] fatal:", e); process.exit(1); });
