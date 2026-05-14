#!/usr/bin/env node
// scripts/quiz/client-submit-smoke.js — v3.3.5 C5 submitQuizOutcome smoke.
//
// 8 cases pinning the client-side contract of
// LinguistProResearch.submitQuizOutcome:
//
//   1. function is exposed on window.LinguistProResearch
//   2. valid payload + research enabled → fetch goes to /api/research/v1/metrics
//   3. POST body contains outcome_capture_method="calibrated-quiz"
//   4. POST body contains no Q01-Q20 / no responses_transient
//   5. BAD_SCORE on quiz_score_normalized=105
//   6. BAD_BAND on quiz_cefr_band="D1"
//   7. BAD_COMPLETED_AT on sub-day timestamp "2026-05-15T10:23:00Z"
//   8. ITEM_LEVEL_LEAK on payload containing key "Q01"
//
// Server validator extension (cases like server-side 400 SCHEMA_VIOLATION)
// lives in scripts/research/quiz-validator-smoke.js (C6).

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3198;
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
    try {
      const r = await fetch(BASE + "/healthz");
      if (r.status === 200) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

const GOOD_PAYLOAD = {
  quiz_score_normalized: 72,
  quiz_cefr_band: "B2",
  quiz_se: 0.412,
  quiz_completed_at: "2026-05-15",
  quiz_version: "ulpan_diagnostic_v1",
  outcome_capture_method: "calibrated-quiz",
};

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[client-submit-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[client-submit-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[client-submit-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  const interceptedBodies = [];
  // Mock /api/research/v1/metrics so submitQuizOutcome resolves quickly
  // without persisting; capture the JSON body for case 4 + case 3 + case 2.
  await page.route("**/api/research/v1/metrics", async (route) => {
    const req = route.request();
    const body = req.postData();
    interceptedBodies.push({ url: req.url(), body });
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, stored: true }),
    });
  });

  try {
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.LinguistProResearch && typeof window.LinguistProResearch.submitOutcome === "function", null, { timeout: 10000 });
    await sleep(600);

    // Case 1 — function exposed.
    const exposed = await page.evaluate(() => typeof window.LinguistProResearch.submitQuizOutcome === "function");
    test("Case 1: window.LinguistProResearch.submitQuizOutcome is a function", exposed);

    // Bootstrap state: accept consent (mock studentId + cohort) so the
    // submit path is unblocked. Directly poke localStorage (avoids modal flow).
    await page.evaluate(() => {
      // Minimum LS to satisfy submitQuizOutcome guards (matches research.js
      // LS keys — see _lsKeys export).
      const LS = window.LinguistProResearch._lsKeys;
      localStorage.setItem(LS.enabled, "1");
      localStorage.setItem(LS.studentId, "00000000-0000-0000-0000-000000000001");
      localStorage.setItem(LS.cohortCode, "TEST-COHORT");
      localStorage.setItem(LS.consentVersion, window.LinguistProResearch.getCurrentConsentVersion());
      localStorage.setItem(LS.consentTs, String(Date.now()));
    });

    // Case 2 + 3 + 4 — valid payload → POST observed.
    const submitRes = await page.evaluate(async (payload) => {
      try { return await window.LinguistProResearch.submitQuizOutcome(payload); }
      catch (e) { return { ok: false, error: "THROW", message: String(e && e.message) }; }
    }, GOOD_PAYLOAD);
    test("Case 2: valid payload triggers POST /api/research/v1/metrics",
         submitRes.ok && interceptedBodies.length === 1 && /\/api\/research\/v1\/metrics/.test(interceptedBodies[0].url),
         JSON.stringify({ submitRes, count: interceptedBodies.length }));

    const lastBody = interceptedBodies[interceptedBodies.length - 1].body;
    const parsed = JSON.parse(lastBody);
    test("Case 3: POST body contains outcome_capture_method='calibrated-quiz'",
         parsed.metrics && parsed.metrics.outcome &&
         parsed.metrics.outcome.outcome_capture_method === "calibrated-quiz",
         "metrics.outcome=" + JSON.stringify(parsed.metrics && parsed.metrics.outcome));

    let bodyLeak = "";
    for (let i = 1; i <= 20 && !bodyLeak; i++) {
      const qid = "Q" + String(i).padStart(2, "0");
      if (lastBody.includes(qid)) bodyLeak = qid;
    }
    if (!bodyLeak && lastBody.includes("responses_transient")) bodyLeak = "responses_transient";
    test("Case 4: POST body contains no Q01-Q20 / no responses_transient",
         !bodyLeak, "leak=" + bodyLeak);

    // Case 5 — BAD_SCORE.
    const r5 = await page.evaluate((p) => window.LinguistProResearch.submitQuizOutcome(
      { ...p, quiz_score_normalized: 105 }), GOOD_PAYLOAD);
    test("Case 5: quiz_score_normalized=105 → BAD_SCORE", !r5.ok && r5.error === "BAD_SCORE", JSON.stringify(r5));

    // Case 6 — BAD_BAND.
    const r6 = await page.evaluate((p) => window.LinguistProResearch.submitQuizOutcome(
      { ...p, quiz_cefr_band: "D1" }), GOOD_PAYLOAD);
    test("Case 6: quiz_cefr_band='D1' → BAD_BAND", !r6.ok && r6.error === "BAD_BAND", JSON.stringify(r6));

    // Case 7 — BAD_COMPLETED_AT.
    const r7 = await page.evaluate((p) => window.LinguistProResearch.submitQuizOutcome(
      { ...p, quiz_completed_at: "2026-05-15T10:23:00Z" }), GOOD_PAYLOAD);
    test("Case 7: quiz_completed_at sub-day → BAD_COMPLETED_AT",
         !r7.ok && r7.error === "BAD_COMPLETED_AT", JSON.stringify(r7));

    // Case 8 — ITEM_LEVEL_LEAK.
    const r8 = await page.evaluate((p) => window.LinguistProResearch.submitQuizOutcome(
      { ...p, Q01: "b" }), GOOD_PAYLOAD);
    test("Case 8: payload with Q01 key → ITEM_LEVEL_LEAK",
         !r8.ok && r8.error === "ITEM_LEVEL_LEAK" && r8.field === "Q01", JSON.stringify(r8));
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[client-submit-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[client-submit-smoke] fatal:", e); process.exit(1); });
