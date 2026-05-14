#!/usr/bin/env node
// scripts/research/teacher-multicohort-smoke.js — D12 multicohort dashboard
// smoke (v3.3.2). Spawns server + seeds 3 cohorts of different sizes
// (12 / 4 / 8 students) so the per-cohort k-anonymity behavior matrix
// from PHASE_PLAN §7 can be exercised.
//
// Case progression across the commit sequence:
//   C3 (current): only case #10 — legacy v1 → v2 migration on boot.
//   C4: cases 1-4 + 6 + 11 (bulk paste, single-add, switch, remove, error chip).
//   C5: cases 5 + 8 (compare view + k-not-met cohort tile).
//   C6: case 7 (cross_cohort CSV).
//   C7: case 12 (regression on existing 14 single-cohort cases — already
//                lives in teacher-smoke.js so we just re-run it here).
//
// Tests grow incrementally; the smoke runner is wired into all-smoke.js
// from C3 so each commit keeps the matrix green.
//
// Usage: node scripts/research/teacher-multicohort-smoke.js

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3193;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer(port, researchDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), RESEARCH_DATA_DIR: researchDir },
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

function provisionCohort(researchDir, code, tokenPlain) {
  const cdir = path.join(researchDir, code);
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, "cohort_meta.json"), JSON.stringify({
    code, schema_version: "v1", created_at: new Date().toISOString(),
    k_anonymity_threshold: 5, retention_until: "2028-12-31",
    outcome_scale: "0-100", consent_version_minimum: "1.0",
    researcher_token_hash: crypto.createHash("sha256").update(tokenPlain).digest("hex"),
  }, null, 2));
}

async function main() {
  const researchDir = fs.mkdtempSync(path.join(os.tmpdir(), "teacher-multi-smoke-"));
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log(`[teacher-multi-smoke] researchDir = ${researchDir}`);

  // Provision a single small cohort for the C3 migration test. (C4+ will
  // provision multiple cohorts.)
  const COHORT_A = "MULTI-A";
  const TOKEN_A = "multi-a-token-" + crypto.randomBytes(6).toString("hex");
  provisionCohort(researchDir, COHORT_A, TOKEN_A);

  const { child, logs } = startServer(PORT, researchDir);
  let exitCode = 1;
  let playwright;
  try { playwright = require("playwright"); }
  catch (_) {
    console.error("[teacher-multi-smoke] playwright not installed");
    await stopServer(child);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(1);
  }

  let browser;
  try {
    const ready = await waitForReady(baseUrl);
    if (!ready) throw new Error("server did not become ready");
    console.log("[teacher-multi-smoke] server up");

    browser = await playwright.chromium.launch({ headless: true });
    let ctx = await browser.newContext();
    let page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    let passed = 0, failed = 0;
    const test = (name, cond, extra) => {
      if (cond) { passed++; console.log(`  ✓ ${name}`); }
      else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
    };

    // ── Case 10: legacy v1 keys migrate on first boot to v2 array. ─────
    // Seed legacy v1 keys via add_init_script so they're set BEFORE
    // teacher.js runs.
    await page.addInitScript(({ code, token }) => {
      localStorage.setItem('teacherDashCohort_v1', code);
      localStorage.setItem('teacherDashToken_v1', token);
    }, { code: COHORT_A, token: TOKEN_A });

    await page.goto(`${baseUrl}/teacher.html`, { waitUntil: "domcontentloaded" });
    // Boot auto-resume: wait for header to populate from successful
    // fetchAggregates(MULTI-A, valid token).
    await page.waitForSelector("#cohortMeta", { state: "attached", timeout: 5000 });
    await page.waitForFunction(() => {
      const m = document.getElementById("cohortMeta");
      return m && /MULTI-A/.test(m.textContent || "");
    }, { timeout: 10000 });

    const lsState = await page.evaluate(() => ({
      v1Cohort: localStorage.getItem('teacherDashCohort_v1'),
      v1Token:  localStorage.getItem('teacherDashToken_v1'),
      v2Array:  JSON.parse(localStorage.getItem('teacherDashCohorts_v2') || '[]'),
      v2Active: localStorage.getItem('teacherDashActiveView_v2'),
    }));

    test("legacy v1 'teacherDashCohort_v1' removed", lsState.v1Cohort === null,
         "still: " + lsState.v1Cohort);
    test("legacy v1 'teacherDashToken_v1' removed", lsState.v1Token === null,
         "still: " + lsState.v1Token);
    test("v2 cohorts array has exactly 1 entry after migration",
         lsState.v2Array.length === 1, "got " + lsState.v2Array.length);
    test("v2 entry has correct code", lsState.v2Array[0] && lsState.v2Array[0].code === COHORT_A,
         "got code=" + (lsState.v2Array[0] && lsState.v2Array[0].code));
    test("v2 entry has correct token", lsState.v2Array[0] && lsState.v2Array[0].token === TOKEN_A);
    test("v2 entry has added_at ISO timestamp",
         lsState.v2Array[0] && /^\d{4}-\d{2}-\d{2}T/.test(lsState.v2Array[0].added_at || ""));
    test("v2 activeView is set to migrated cohort code",
         lsState.v2Active === COHORT_A, "got " + lsState.v2Active);
    test("no page errors during migration boot", pageErrors.length === 0,
         "errors: " + pageErrors.join(" | "));
    test("dashboard rendered (cohort meta header visible)", true);

    // ── C4 cases: bulk paste, chip strip, add/remove/switch ───────────
    // Provision 2 additional cohorts in the same researchDir so we can
    // exercise the multicohort UX.
    const COHORT_B = "MULTI-B";
    const TOKEN_B = "multi-b-token-" + crypto.randomBytes(6).toString("hex");
    provisionCohort(researchDir, COHORT_B, TOKEN_B);
    const COHORT_C = "MULTI-C";
    const TOKEN_C = "multi-c-token-" + crypto.randomBytes(6).toString("hex");
    provisionCohort(researchDir, COHORT_C, TOKEN_C);
    const BAD_TOKEN = "invalid-token-aaa";

    // The C3 case used addInitScript to seed legacy v1 keys; that script
    // runs on EVERY navigation in the same context, so for C4 we open a
    // fresh context with no init scripts. localStorage is per-origin per-
    // context, so the new context starts empty.
    await ctx.close();
    const ctxC4 = await browser.newContext();
    const pageC4 = await ctxC4.newPage();
    pageC4.on("pageerror", (e) => pageErrors.push(String(e.message)));
    page = pageC4;
    await page.goto(`${baseUrl}/teacher.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#bulkCohortsInput", { state: "visible", timeout: 5000 });

    // Case 1: bulk-paste 3 valid pairs.
    const bulkText = `${COHORT_A}  ${TOKEN_A}\n${COHORT_B}  ${TOKEN_B}\n# comment line ignored\n${COHORT_C}  ${TOKEN_C}\n`;
    await page.fill("#bulkCohortsInput", bulkText);
    await page.click("#bulkLoginBtn");
    await page.waitForFunction(() => {
      const cm = document.getElementById("cohortMeta");
      return cm && /MULTI-/.test(cm.textContent || "");
    }, { timeout: 10000 });

    const chips = await page.$$('[data-testid="cohort-chip"]');
    test("bulk paste with 3 valid pairs → 3 chips rendered", chips.length === 3,
         "got " + chips.length);

    const allChip = await page.$('[data-testid="cohort-chip-all"]');
    test("'🌐 All cohorts' chip rendered when ≥ 2 cohorts", !!allChip);

    const v2State = await page.evaluate(() => ({
      arr: JSON.parse(localStorage.getItem('teacherDashCohorts_v2') || '[]'),
      active: localStorage.getItem('teacherDashActiveView_v2'),
    }));
    test("3 entries persisted in v2 array", v2State.arr.length === 3, "got " + v2State.arr.length);
    test("active view = first successful cohort (MULTI-A)",
         v2State.active === COHORT_A, "got " + v2State.active);

    // Case 2: bulk paste with 1 bad token (validation step happens via
    // server fetch — we mix valid + invalid and verify only valid ones land).
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${baseUrl}/teacher.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#bulkCohortsInput", { state: "visible", timeout: 5000 });
    const mixedText = `${COHORT_A}  ${TOKEN_A}\n${COHORT_B}  ${BAD_TOKEN}\n`;
    await page.fill("#bulkCohortsInput", mixedText);
    await page.click("#bulkLoginBtn");
    await page.waitForFunction(() => {
      const cm = document.getElementById("cohortMeta");
      return cm && /MULTI-A/.test(cm.textContent || "");
    }, { timeout: 10000 });
    const afterMixed = await page.evaluate(() => ({
      arr: JSON.parse(localStorage.getItem('teacherDashCohorts_v2') || '[]'),
      err: (document.getElementById('loginErr') || {}).textContent || '',
    }));
    test("bulk paste with 1 bad token → only valid cohorts persisted",
         afterMixed.arr.length === 1 && afterMixed.arr[0].code === COHORT_A,
         "got " + JSON.stringify(afterMixed.arr.map((c) => c.code)));
    test("error summary mentions failed cohort code",
         afterMixed.err.includes(COHORT_B), "err: " + afterMixed.err);

    // Case 4: switch active chip A → C.
    // Re-load with all 3 cohorts.
    await page.evaluate((s) => {
      localStorage.setItem('teacherDashCohorts_v2', JSON.stringify(s.cohorts));
      localStorage.setItem('teacherDashActiveView_v2', s.active);
    }, {
      cohorts: [
        { code: COHORT_A, token: TOKEN_A, added_at: '2026-05-14T00:00:00Z', last_ok_at: null },
        { code: COHORT_B, token: TOKEN_B, added_at: '2026-05-14T00:00:00Z', last_ok_at: null },
        { code: COHORT_C, token: TOKEN_C, added_at: '2026-05-14T00:00:00Z', last_ok_at: null },
      ],
      active: COHORT_A,
    });
    await page.goto(`${baseUrl}/teacher.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const cm = document.getElementById("cohortMeta");
      return cm && /MULTI-A/.test(cm.textContent || "");
    }, { timeout: 10000 });

    // Click the chip for COHORT_C.
    await page.click(`[data-testid="cohort-chip"][data-cohort-code="${COHORT_C}"]`);
    await page.waitForFunction((target) => {
      const cm = document.getElementById("cohortMeta");
      return cm && (cm.textContent || "").includes(target);
    }, COHORT_C, { timeout: 10000 });
    const afterSwitch = await page.evaluate(() => ({
      active: localStorage.getItem('teacherDashActiveView_v2'),
      cohortMetaText: (document.getElementById('cohortMeta') || {}).textContent || '',
    }));
    test("clicking chip switches active view", afterSwitch.active === COHORT_C,
         "active=" + afterSwitch.active);
    test("dashboard re-renders for switched cohort", afterSwitch.cohortMetaText.includes(COHORT_C));

    // Case 6: remove a cohort via × handler.
    // Wait for the remove × inside the chip for COHORT_B and click it.
    page.on('dialog', (d) => d.accept()); // auto-accept logout confirm dialog if any
    const removeBtn = await page.$(`[data-testid="cohort-chip"][data-cohort-code="${COHORT_B}"] [data-testid="cohort-chip-remove"]`);
    if (removeBtn) {
      await removeBtn.click();
      await page.waitForFunction((target) => {
        return !document.querySelector(`[data-testid="cohort-chip"][data-cohort-code="${target}"]`);
      }, COHORT_B, { timeout: 5000 });
    }
    const afterRemove = await page.evaluate(() => ({
      arr: JSON.parse(localStorage.getItem('teacherDashCohorts_v2') || '[]'),
    }));
    test("removing chip drops cohort from v2 array",
         !afterRemove.arr.some((c) => c.code === COHORT_B),
         "still: " + JSON.stringify(afterRemove.arr.map((c) => c.code)));
    test("remaining cohorts preserved",
         afterRemove.arr.length === 2 &&
           afterRemove.arr.some((c) => c.code === COHORT_A) &&
           afterRemove.arr.some((c) => c.code === COHORT_C));

    // Case 11: failed cohort fetch surfaces error chip state.
    await page.evaluate((s) => {
      localStorage.setItem('teacherDashCohorts_v2', JSON.stringify(s.cohorts));
      localStorage.setItem('teacherDashActiveView_v2', s.active);
    }, {
      cohorts: [
        { code: COHORT_A, token: TOKEN_A, added_at: '2026-05-14T00:00:00Z', last_ok_at: null },
        { code: COHORT_B, token: BAD_TOKEN, added_at: '2026-05-14T00:00:00Z', last_ok_at: null },
      ],
      active: COHORT_A,
    });
    await page.goto(`${baseUrl}/teacher.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`[data-testid="cohort-chip"][data-cohort-code="${COHORT_B}"]`, { timeout: 10000 });
    const errChipClass = await page.evaluate((code) => {
      const el = document.querySelector(`[data-testid="cohort-chip"][data-cohort-code="${code}"]`);
      return el ? el.className : null;
    }, COHORT_B);
    test("failed-fetch chip has is-error class", errChipClass && errChipClass.includes('is-error'),
         "className: " + errChipClass);

    console.log(`\n[teacher-multi-smoke] ${passed}/${passed + failed} passed`);
    exitCode = (failed === 0 && pageErrors.length === 0) ? 0 : 1;
  } catch (e) {
    console.error("[teacher-multi-smoke] fatal:", e && e.message ? e.message : e);
    for (const line of logs.slice(-20)) console.error("  " + line);
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[teacher-multi-smoke] unhandled:", e); process.exit(1); });
}
