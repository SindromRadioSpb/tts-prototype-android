#!/usr/bin/env node
// scripts/quiz/ui-smoke.js — v3.3.5 Calibrated Diagnostic Quiz UI smoke.
//
// 8 Playwright cases per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §13:
//   1. Quiz modal opens with title + first item + progress label
//   2. Click answer → "Next" enabled → click → advances to item 2
//   3. "← Back" returns to previous item with selection preserved
//   4. Refresh mid-quiz → quizState_v1 restored; modal re-opens at the
//      same item with selection preserved
//   5. Submit at item 20 → score reveal screen (no per-item DOM)
//   6. Modal close after submit → quizCompleted_v1 flag set
//      AND quizState_v1 cleared (privacy invariant)
//   7. Re-open quiz after submit → "уже прошли" notice rendered
//   8. No JS errors throughout
//
// Spawns server.js → loads public/index.html → exercises
// window.LinguistProQuiz directly (independent of research consent
// + cohort code, since the launcher button only appears once research
// is enabled — that path is exercised by a separate research-ui smoke).
//
// Exit 0 if all green, 1 otherwise.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3196;
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
  catch (e) {
    console.error("[ui-smoke] playwright not installed:", e.message);
    process.exit(1);
  }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[ui-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child);
    process.exit(1);
  }
  console.log("[ui-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const pageErrors = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
  page.on("crash", () => pageErrors.push("page crashed"));

  try {
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    // Wait for the quiz module to be loaded onto window.
    await page.waitForFunction(() => window.LinguistProQuiz && typeof window.LinguistProQuiz.open === "function", null, { timeout: 10000 });
    // Allow the page to settle (Phase 6 prompt fires asynchronously after
    // OPFS readiness check).
    await sleep(800);

    // Reset any pre-existing state so cases start clean.
    // Dismiss all first-visit modals that would intercept clicks
    // (v3Phase6Modal — OPFS migration prompt; v3OnboardingModal — welcome).
    await page.evaluate(() => {
      window.LinguistProQuiz.reset();
      for (const id of ["v3Phase6Modal", "v3OnboardingModal"]) {
        const m = document.getElementById(id);
        if (m && m.parentNode) m.parentNode.removeChild(m);
      }
    });

    // Case 1 — open modal at item 1.
    await page.evaluate(() => window.LinguistProQuiz.open());
    await page.waitForSelector("[data-quiz-panel]", { timeout: 5000 });
    const c1 = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      if (!panel) return null;
      const title = panel.querySelector("#quizPanelTitle");
      const progress = panel.querySelector("[data-quiz-progress]");
      const opts = panel.querySelectorAll("[data-quiz-option]");
      const itemId = panel.querySelector("[data-quiz-item-id]").getAttribute("data-quiz-item-id");
      return {
        hasTitle: !!title && title.textContent.length > 0,
        progressText: progress ? progress.textContent : null,
        optCount: opts.length,
        itemId,
      };
    });
    test("Case 1: modal opens with title + first item (Q01) + 4 options + progress",
         c1 && c1.hasTitle && c1.optCount === 4 && c1.itemId === "Q01" && /1/.test(c1.progressText || ""),
         JSON.stringify(c1));

    // Case 2 — click an answer on item 1, advance to item 2.
    await page.click('[data-quiz-radio="b"]');
    await sleep(50);
    await page.click('[data-quiz-next]');
    await sleep(80);
    const c2 = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const itemId = panel.querySelector("[data-quiz-item-id]").getAttribute("data-quiz-item-id");
      const ls = JSON.parse(localStorage.getItem("quizState_v1") || "{}");
      return { itemId, q01: ls.responses_transient && ls.responses_transient.Q01, idx: ls.current_item_index };
    });
    test("Case 2: select option b on Q01 → advance to Q02; LS captures responses_transient.Q01='b'",
         c2.itemId === "Q02" && c2.q01 === "b" && c2.idx === 1,
         JSON.stringify(c2));

    // Case 3 — go back to item 1; selection preserved.
    await page.click('[data-quiz-back]');
    await sleep(80);
    const c3 = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const itemId = panel.querySelector("[data-quiz-item-id]").getAttribute("data-quiz-item-id");
      const radioB = panel.querySelector('[data-quiz-radio="b"]');
      return { itemId, bChecked: !!(radioB && radioB.checked) };
    });
    test("Case 3: ← Back returns to Q01 with selection b preserved",
         c3.itemId === "Q01" && c3.bChecked,
         JSON.stringify(c3));

    // Case 4 — advance to item 5, refresh, expect resume at item 5 with selection preserved.
    await page.click('[data-quiz-next]');                       // → Q02
    await page.click('[data-quiz-radio="a"]'); await sleep(20);
    await page.click('[data-quiz-next]');                       // → Q03
    await page.click('[data-quiz-radio="c"]'); await sleep(20);
    await page.click('[data-quiz-next]');                       // → Q04
    await page.click('[data-quiz-radio="d"]'); await sleep(20);
    await page.click('[data-quiz-next]');                       // → Q05
    await page.click('[data-quiz-radio="b"]'); await sleep(20);
    await page.reload();
    await page.waitForFunction(() => window.LinguistProQuiz && typeof window.LinguistProQuiz.open === "function", null, { timeout: 10000 });
    await sleep(800);
    await page.evaluate(() => {
      for (const id of ["v3Phase6Modal", "v3OnboardingModal"]) {
        const m = document.getElementById(id);
        if (m && m.parentNode) m.parentNode.removeChild(m);
      }
      window.LinguistProQuiz.open();
    });
    await page.waitForSelector("[data-quiz-panel]", { timeout: 5000 });
    const c4 = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const itemId = panel.querySelector("[data-quiz-item-id]").getAttribute("data-quiz-item-id");
      const radioB = panel.querySelector('[data-quiz-radio="b"]');
      return { itemId, bChecked: !!(radioB && radioB.checked) };
    });
    test("Case 4: refresh mid-quiz → resume at Q05 with selection 'b' preserved",
         c4.itemId === "Q05" && c4.bChecked,
         JSON.stringify(c4));

    // Case 5 — answer items 5..20, submit, expect result screen.
    // Items 1-4 already have answers in LS; we just step through.
    for (let i = 5; i <= 20; i++) {
      await page.click('[data-quiz-radio="a"]'); await sleep(15);
      await page.click('[data-quiz-next]'); await sleep(30);
    }
    await page.waitForSelector('[data-quiz-state="result"]', { timeout: 5000 });
    const c5 = await page.evaluate(() => {
      const score = document.querySelector("[data-quiz-score]");
      const band = document.querySelector("[data-quiz-band]");
      const se = document.querySelector("[data-quiz-se]");
      // Ensure no item-level DOM survives.
      const itemDom = document.querySelector("[data-quiz-item-id]");
      const radios = document.querySelectorAll("[data-quiz-radio]");
      return {
        scoreText: score ? score.textContent : null,
        bandText:  band  ? band.textContent  : null,
        seText:    se    ? se.textContent    : null,
        itemDomGone: !itemDom,
        radiosGone: radios.length === 0,
      };
    });
    test("Case 5: submit at item 20 → score reveal renders (score + band + SE); no item DOM remains",
         c5.scoreText && /\/ 100/.test(c5.scoreText) && c5.bandText && c5.seText && c5.itemDomGone && c5.radiosGone,
         JSON.stringify(c5));

    // Case 6 — close after submit → completion flag set, transient state cleared.
    await page.click('[data-quiz-close]');
    await sleep(60);
    const c6 = await page.evaluate(() => {
      const state = localStorage.getItem("quizState_v1");
      const done = JSON.parse(localStorage.getItem("quizCompleted_v1") || "null");
      const keys = done ? Object.keys(done).sort() : [];
      return { stateNull: state === null, done, keys };
    });
    const c6Ok = c6.stateNull &&
                 c6.done && c6.done.version === "ulpan_diagnostic_v1" &&
                 /^\d{4}-\d{2}-\d{2}$/.test(c6.done.completed_at) &&
                 JSON.stringify(c6.keys) === JSON.stringify(["cohort_code", "completed_at", "version"]);
    test("Case 6: close after submit → quizCompleted_v1 set with only {version,completed_at,cohort_code}, quizState_v1 cleared",
         c6Ok, JSON.stringify(c6));

    // Case 7 — re-open quiz → "уже пройдена" notice rendered, no item DOM, no Submit button.
    await page.evaluate(() => window.LinguistProQuiz.open());
    await page.waitForSelector('[data-quiz-state="completed"]', { timeout: 5000 });
    const c7 = await page.evaluate(() => {
      const completed = document.querySelector('[data-quiz-state="completed"]');
      const itemDom = document.querySelector("[data-quiz-item-id]");
      const nextBtn = document.querySelector("[data-quiz-next]");
      return {
        hasCompletedScreen: !!completed,
        completedText: completed ? completed.textContent : null,
        noItemDom: !itemDom,
        noNextBtn: !nextBtn,
      };
    });
    test("Case 7: re-open after submit → completed notice renders, no item nav buttons",
         c7.hasCompletedScreen && c7.noItemDom && c7.noNextBtn, JSON.stringify(c7));

    // Case 8 — no page errors throughout.
    test("Case 8: no JS errors throughout the flow",
         pageErrors.length === 0,
         pageErrors.join(" | "));
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[ui-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[ui-smoke] fatal:", e); process.exit(1); });
