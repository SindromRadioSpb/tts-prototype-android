#!/usr/bin/env node
// scripts/research/teacher-screenshots.js — visual regression captures for
// /teacher.html. Companion to teacher-smoke.js (functional asserts).
//
// Pipeline mirrors teacher-smoke.js: temp RESEARCH_DATA_DIR → seed cohort →
// spawn server → Chromium → login → screenshot at multiple states.
//
// Output: Smoke-check/teacher-dashboard/<timestamp>/ — six PNGs:
//   01-login-empty.png         — fresh login screen, no values
//   02-login-filled.png        — cohort + token entered, before click
//   03-dashboard-full.png      — full page after login (fullPage)
//   04-summary-tiles.png       — header + summary tiles closeup
//   05-charts-row.png          — engagement + audio + SRS/notes charts
//   06-student-table.png       — per-student table closeup
//   07-correlations.png        — correlations table + scatter
//   08-mobile-375.png          — narrow viewport (375×667), full page
//
// Exit 0 on success.

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.SCREENSHOT_PORT || 3198);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ts() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}
function mkTemp() {
  const dir = path.join(os.tmpdir(), `teacher-shots-${Date.now()}-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function runSeed(researchDir, code) {
  const res = spawnSync(process.execPath, [
    "scripts/research/seed_research_fake_cohort.js",
    "--code", code,
  ], {
    cwd: REPO_ROOT,
    env: { ...process.env, RESEARCH_DATA_DIR: researchDir },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`seed failed (status=${res.status}): ${res.stderr || res.stdout}`);
  }
  const m = res.stdout.match(/Researcher token \(plaintext.*?\):\s*\n\s*(\S+)/);
  if (!m) throw new Error(`could not parse token from seed output:\n${res.stdout}`);
  return m[1];
}

function startServer(researchDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT), RESEARCH_DATA_DIR: researchDir },
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
    try { const r = await fetch(BASE_URL + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

async function captureClip(page, selector, outPath) {
  // ElementHandle.screenshot() handles scroll-into-view and outside-of-viewport
  // bounds for us. Falls back to fullPage if the element vanished.
  const handle = await page.$(selector);
  if (!handle) {
    console.warn(`[screenshots] selector not found, skipping clip: ${selector}`);
    return;
  }
  try {
    await handle.screenshot({ path: outPath });
  } catch (e) {
    console.warn(`[screenshots] clip failed for ${selector} (${e.message}); fullPage fallback`);
    await page.screenshot({ path: outPath, fullPage: true });
  }
}

async function main() {
  const code = "FAKE-COH-" + String(Date.now()).slice(-5);
  const researchDir = mkTemp();
  const stamp = ts();
  const outDir = path.join(REPO_ROOT, "Smoke-check", "teacher-dashboard", stamp);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[screenshots] output dir: ${outDir}`);
  console.log(`[screenshots] seeding cohort ${code}…`);
  const token = runSeed(researchDir, code);

  const { child, logs } = startServer(researchDir);
  let browser, exitCode = 1;
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) {
    console.error("[screenshots] playwright missing");
    await stopServer(child);
    process.exit(1);
  }

  try {
    if (!(await waitForReady())) throw new Error("server not ready in 15s");
    console.log("[screenshots] server up; launching headless Chromium…");
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on("pageerror", (e) => console.error("[pageerror]", e.message));
    page.on("console", (m) => { if (m.type() === "error") console.error("[console.error]", m.text()); });

    // 01 — login empty
    await page.goto(`${BASE_URL}/teacher.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#cohortInput");
    await sleep(150);
    await page.screenshot({ path: path.join(outDir, "01-login-empty.png"), fullPage: true });
    console.log("  ✓ 01-login-empty.png");

    // 02 — login filled
    await page.fill("#cohortInput", code);
    await page.fill("#tokenInput", token);
    await sleep(80);
    await page.screenshot({ path: path.join(outDir, "02-login-filled.png"), fullPage: true });
    console.log("  ✓ 02-login-filled.png");

    // Submit login.
    await page.click("#loginBtn");
    await page.waitForSelector(".summary-tile", { timeout: 10000 });
    await sleep(500); // settle SVG layout

    // 03 — full dashboard (entire scrollable page)
    await page.screenshot({ path: path.join(outDir, "03-dashboard-full.png"), fullPage: true });
    console.log("  ✓ 03-dashboard-full.png");

    // 04 — header + summary tiles closeup
    await captureClip(page, ".summary-grid", path.join(outDir, "04-summary-tiles.png"));
    console.log("  ✓ 04-summary-tiles.png");

    // 05 — engagement chart card (top-of-charts area)
    await captureClip(page, "#engagementChart", path.join(outDir, "05-engagement-chart.png"));
    console.log("  ✓ 05-engagement-chart.png");

    // 06 — per-student table card
    await captureClip(page, "#studentTable", path.join(outDir, "06-student-table.png"));
    console.log("  ✓ 06-student-table.png");

    // 07 — correlations table + scatter (capture both adjacent cards)
    // Scroll to bring scatter into view first so SVG renders if any lazy paint.
    await page.evaluate(() => {
      const el = document.getElementById("scatterChart");
      if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await sleep(300);
    await captureClip(page, "#correlationsTable", path.join(outDir, "07a-correlations-table.png"));
    await captureClip(page, "#scatterChart",      path.join(outDir, "07b-scatter-chart.png"));
    console.log("  ✓ 07a/b-correlations + scatter");

    // 08 — narrow viewport (mobile)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/teacher.html`, { waitUntil: "domcontentloaded" });
    // Auto-resume should kick in (cohort+token still in localStorage).
    try {
      await page.waitForSelector(".summary-tile", { timeout: 8000 });
      await sleep(400);
      await page.screenshot({ path: path.join(outDir, "08-mobile-375.png"), fullPage: true });
      console.log("  ✓ 08-mobile-375.png");
    } catch (e) {
      console.warn("  ⚠ 08 mobile capture failed:", e.message);
    }

    // Index file with quick metadata.
    const meta = {
      captured_at: new Date().toISOString(),
      cohort_code: code,
      researcher_token: token,
      base_url: BASE_URL,
      viewport_desktop: "1366×900",
      viewport_mobile: "375×667",
      files: fs.readdirSync(outDir).filter((f) => f.endsWith(".png")).sort(),
    };
    fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(meta, null, 2));
    console.log(`[screenshots] meta written; ${meta.files.length} PNGs total`);

    exitCode = 0;
  } catch (e) {
    console.error("[screenshots] fatal:", e && e.message ? e.message : e);
    console.error("[screenshots] server log tail:");
    for (const line of logs.slice(-15)) console.error("  " + line);
    exitCode = 1;
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[screenshots] unhandled:", e); process.exit(1); });
}
