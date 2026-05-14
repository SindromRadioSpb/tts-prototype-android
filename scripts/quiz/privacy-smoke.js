#!/usr/bin/env node
// scripts/quiz/privacy-smoke.js — v3.3.5 Calibrated Quiz privacy smoke (C4).
//
// 5 cases per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §8 + §13:
//   1. After submitQuiz, localStorage.quizState_v1 is removed.
//   2. Captured submitQuizOutcome payload contains NO Q01-Q20 substrings
//      (item-level response leak prohibited).
//   3. Captured payload contains NO 'responses_transient' substring.
//   4. localStorage.quizCompleted_v1 has ONLY {version, completed_at,
//      cohort_code} keys — no item data.
//   5. quiz_completed_at in payload matches ^\d{4}-\d{2}-\d{2}$
//      (ISO day, NOT a sub-day timestamp).
//
// Approach: install a window-side stub that captures the payload object
// passed to LinguistProResearch.submitQuizOutcome — this is the canonical
// privacy contract that C5 will preserve when wiring the real POST. The
// smoke is therefore equivalent to an HAR audit of the real submit:
// the same payload object will be JSON.stringify'd into the POST body.
//
// Spawns server.js → opens index.html → answers 20 items → finalize →
// inspects captured payload + localStorage. Exit 0 if 5/5 green.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3197;
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

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[privacy-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[privacy-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[privacy-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  // Capture any outbound network requests that could leak quiz data —
  // belt-and-suspenders alongside the payload assertion.
  const outboundBodies = [];
  page.on("request", (req) => {
    const m = req.method();
    if (m === "POST" || m === "PUT" || m === "PATCH") {
      const body = req.postData();
      if (body) outboundBodies.push({ url: req.url(), method: m, body });
    }
  });

  try {
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.LinguistProQuiz && typeof window.LinguistProQuiz.open === "function", null, { timeout: 10000 });
    await sleep(800);

    // Install the capture stub on LinguistProResearch so the quiz finalize
    // path will hand the payload to it. The submitQuizOutcome contract is
    // an async function returning {ok, ...}; the real C5 wiring will keep
    // that shape.
    await page.evaluate(() => {
      window.LinguistProQuiz.reset();
      for (const id of ["v3Phase6Modal", "v3OnboardingModal"]) {
        const m = document.getElementById(id);
        if (m && m.parentNode) m.parentNode.removeChild(m);
      }
      window.__capturedQuizPayload = null;
      window.LinguistProResearch = window.LinguistProResearch || {};
      window.LinguistProResearch.getState = function () {
        return { enabled: true, cohortCode: "TEST-COHORT", studentId: "anon-stub" };
      };
      window.LinguistProResearch.submitQuizOutcome = async function (payload) {
        window.__capturedQuizPayload = JSON.parse(JSON.stringify(payload));
        return { ok: true };
      };
    });

    // Drive the quiz through all 20 items with a varied pick pattern.
    await page.evaluate(() => window.LinguistProQuiz.open());
    await page.waitForSelector("[data-quiz-panel]", { timeout: 5000 });
    const picks = ["a", "b", "c", "d", "a", "b", "c", "d", "a", "b",
                   "c", "d", "a", "b", "c", "d", "a", "b", "c", "d"];
    for (let i = 0; i < 20; i++) {
      await page.click(`[data-quiz-radio="${picks[i]}"]`);
      await sleep(15);
      await page.click('[data-quiz-next]'); await sleep(25);
    }
    await page.waitForSelector('[data-quiz-state="result"]', { timeout: 5000 });

    // Inspect captured payload + LS.
    const audit = await page.evaluate(() => {
      const payload = window.__capturedQuizPayload;
      const payloadJson = payload ? JSON.stringify(payload) : null;
      const state = localStorage.getItem("quizState_v1");
      const done = JSON.parse(localStorage.getItem("quizCompleted_v1") || "null");
      return {
        payload, payloadJson,
        stateNull: state === null,
        done,
        doneKeys: done ? Object.keys(done).sort() : [],
      };
    });

    // Case 1 — LS state cleared.
    test("Case 1: localStorage.quizState_v1 is removed after submit",
         audit.stateNull, "state=" + (audit.stateNull ? "null" : "PRESENT"));

    // Case 2 — payload has no Q01..Q20 substrings.
    const leakIds = [];
    if (audit.payloadJson) {
      for (let i = 1; i <= 20; i++) {
        const id = "Q" + String(i).padStart(2, "0");
        if (audit.payloadJson.includes(id)) leakIds.push(id);
      }
    }
    test("Case 2: payload contains no Q01-Q20 substrings (no item-level leak)",
         audit.payloadJson && leakIds.length === 0,
         leakIds.length ? "leaked: " + leakIds.join(",") : "");

    // Case 3 — payload has no 'responses_transient' substring.
    const hasResponsesTransient = audit.payloadJson && audit.payloadJson.includes("responses_transient");
    test("Case 3: payload contains no 'responses_transient' substring",
         audit.payloadJson && !hasResponsesTransient);

    // Case 4 — completed marker has exactly {version, completed_at, cohort_code} keys.
    const expectedKeys = ["cohort_code", "completed_at", "version"];
    test("Case 4: quizCompleted_v1 has only {version, completed_at, cohort_code}",
         audit.done && JSON.stringify(audit.doneKeys) === JSON.stringify(expectedKeys),
         "keys=" + JSON.stringify(audit.doneKeys));

    // Case 5 — quiz_completed_at is ISO day, not sub-day timestamp.
    const completedAt = audit.payload && audit.payload.quiz_completed_at;
    const isoDayRe = /^\d{4}-\d{2}-\d{2}$/;
    test("Case 5: payload.quiz_completed_at is ISO day (no sub-day timestamp)",
         completedAt && isoDayRe.test(completedAt),
         "got=" + completedAt);

    // Bonus diagnostic: verify outbound network audit also clean (no Q01-Q20
    // in any POST body that happened during the run).
    let outboundLeak = "";
    for (const b of outboundBodies) {
      for (let i = 1; i <= 20; i++) {
        const id = "Q" + String(i).padStart(2, "0");
        if (b.body.includes(id)) { outboundLeak = `${b.method} ${b.url} contains ${id}`; break; }
      }
      if (outboundLeak) break;
    }
    if (outboundLeak) {
      failed++; console.log(`  ✗ Bonus: outbound POST leak — ${outboundLeak}`);
    } else {
      console.log("  · (bonus) no outbound POST body contained Q01-Q20");
    }
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[privacy-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[privacy-smoke] fatal:", e); process.exit(1); });
