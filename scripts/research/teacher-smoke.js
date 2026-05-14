#!/usr/bin/env node
// scripts/research/teacher-smoke.js — headless test for /teacher.html.
//
// Pipeline:
//   1. mktemp -d for RESEARCH_DATA_DIR.
//   2. Run seed_research_fake_cohort.js — capture cohort code + token.
//   3. Spawn server.js on a free port pointing at the temp dir.
//   4. Launch headless Chromium via Playwright, navigate to /teacher.html.
//   5. Fill login form (cohort + token), click login.
//   6. Wait for #summaryGrid to populate.
//   7. Assert cohort_size, k-anonymity met, student table rows, charts rendered,
//      correlations rendered, scatter rendered.
//   8. Teardown.
//
// Exit code 0 on success, 1 on any failure.
//
// Usage:
//   node scripts/research/teacher-smoke.js [--port 3199] [--keep-open]

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = { port: 3199, keepOpen: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") args.port = Number(argv[++i]) || 3199;
    else if (argv[i] === "--keep-open") args.keepOpen = true;
  }
  return args;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function mkTemp() {
  const dir = path.join(os.tmpdir(), `teacher-smoke-${Date.now()}-${process.pid}`);
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
  // Parse plaintext token from output.
  const match = res.stdout.match(/Researcher token \(plaintext.*?\):\s*\n\s*(\S+)/);
  if (!match) throw new Error(`could not parse token from seed output:\n${res.stdout}`);
  return match[1];
}

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
    try { const r = await fetch(baseUrl + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

const cases = [];
function record(name, passed, detail) {
  cases.push({ name, passed, detail });
  const tag = passed ? "PASS" : "FAIL";
  const line = detail ? ` — ${detail}` : "";
  console.log(`  [${tag}] ${name}${line}`);
}

async function runTests(page) {
  // 1. Header + summary tiles.
  const meta = await page.textContent('#cohortMeta');
  record("1. Cohort meta header populated", /FAKE-COH/.test(meta || ''), `meta="${meta}"`);

  const tiles = await page.$$eval('.summary-tile', (els) => els.map((e) => ({
    label: e.querySelector('.label')?.textContent || '',
    value: e.querySelector('.value')?.textContent || '',
  })));
  const cohortSizeTile = tiles.find((t) => /cohort size/i.test(t.label));
  record("2. Cohort size tile = 12", cohortSizeTile && cohortSizeTile.value === '12', `value="${cohortSizeTile && cohortSizeTile.value}"`);

  // 3. Engagement chart rendered (svg.chart present).
  const engagementSvgs = await page.$$('#engagementChart svg.chart');
  record("3. Engagement chart rendered", engagementSvgs.length > 0, `svg.chart count=${engagementSvgs.length}`);

  // 4. Audio + SRS/notes charts.
  const audioSvgs = await page.$$('#audioChart svg.chart');
  record("4. Audio chart rendered", audioSvgs.length > 0);
  const srsSvgs = await page.$$('#srsNotesChart svg.chart');
  record("5. SRS+notes chart rendered", srsSvgs.length > 0);

  // 6. k-anonymity met badge.
  const kBadge = await page.textContent('#kBadge');
  record("6. k-anonymity met badge shown", /met/i.test(kBadge || ''), `badge="${(kBadge || '').trim()}"`);

  // 7. Per-student table rows = 12.
  const studentRows = await page.$$('#studentTable tbody tr');
  record("7. Per-student table has 12 rows", studentRows.length === 12, `rows=${studentRows.length}`);

  // 8. Correlation table has rows.
  const corrRows = await page.$$('#correlationsTable tbody tr');
  record("8. Correlations table populated", corrRows.length >= 5, `rows=${corrRows.length}`);

  // 9. Pearson r for active_minutes vs post_test should be positive (engagement
  //    drives outcome in the seed).
  const corrText = await page.textContent('#correlationsTable');
  const m = (corrText || '').match(/Total active minutes[\s\S]{0,80}?(-?\d+\.\d+)/);
  const rActive = m ? Number(m[1]) : null;
  record("9. Pearson r(active_min, post_test) > 0.4", rActive != null && rActive > 0.4, `r=${rActive}`);

  // 10. Scatter chart rendered.
  const scatter = await page.$$('#scatterChart svg.chart');
  record("10. Scatter chart rendered", scatter.length > 0);

  // 11. CSV export buttons present.
  const exportBtns = await page.$$eval('header button', (els) => els.map((e) => e.textContent || ''));
  const hasAggregates = exportBtns.some((t) => /Aggregates CSV/.test(t));
  const hasTimeseries = exportBtns.some((t) => /Timeseries CSV/.test(t));
  record("11. Export buttons present", hasAggregates && hasTimeseries);

  // 12. logout button present.
  const hasLogout = exportBtns.some((t) => /Logout/.test(t));
  record("12. Logout button present", hasLogout);

  // 13. Upload outcomes CSV button present (Phase 11.6).
  const hasUpload = exportBtns.some((t) => /Upload outcomes/.test(t));
  record("13. Upload outcomes CSV button present", hasUpload);

  // 14. Outcomes from outcomes.csv joined into students[].outcome —
  // locate the 'pre' / 'post' columns by header label (v3.3.5 added
  // quiz/CEFR/SE columns AFTER post, so positional indexing is no
  // longer safe).
  const outcomeCells = await page.$$eval('#studentTable', (tables) => {
    const t = tables[0]; if (!t) return [];
    const headers = Array.from(t.querySelectorAll('thead th'))
      .map((th) => th.textContent.trim().replace(/[↑↓]\s*$/, '').trim());
    const preIdx  = headers.indexOf('pre');
    const postIdx = headers.indexOf('post');
    return Array.from(t.querySelectorAll('tbody tr')).map((tr) => {
      const tds = tr.querySelectorAll('td');
      return {
        pre:  preIdx  >= 0 ? (tds[preIdx]  && tds[preIdx].textContent  || '').trim() : '',
        post: postIdx >= 0 ? (tds[postIdx] && tds[postIdx].textContent || '').trim() : '',
      };
    });
  });
  const numericRows = outcomeCells.filter((c) =>
    /^\d/.test(c.pre) || /^\d/.test(c.post)
  );
  record(
    "14. Outcomes joined into per-student table",
    numericRows.length >= 5,
    `numeric rows=${numericRows.length}/12 (expected ≥ 5; one student is withdrawn so ≤ 11)`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const code = "FAKE-COH-" + String(Date.now()).slice(-5);
  const researchDir = mkTemp();
  console.log(`[teacher-smoke] RESEARCH_DATA_DIR = ${researchDir}`);
  console.log(`[teacher-smoke] seeding cohort ${code}…`);
  let token;
  try {
    token = runSeed(researchDir, code);
    console.log(`[teacher-smoke] cohort seeded, token captured (${token.length} chars)`);
  } catch (e) {
    console.error(`[teacher-smoke] seed failed:`, e.message);
    process.exit(1);
  }

  const { child, logs } = startServer(args.port, researchDir);
  let browser, exitCode = 1;
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) {
    console.error("[teacher-smoke] playwright missing. Run: npm install playwright");
    await stopServer(child);
    process.exit(1);
  }

  try {
    if (!(await waitForReady(baseUrl))) throw new Error("server not ready in 15s");
    console.log("[teacher-smoke] server up; launching headless Chromium…");
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("[pageerror]", e.message));
    page.on("console", (m) => { if (m.type() === "error") console.error("[console.error]", m.text()); });

    await page.goto(`${baseUrl}/teacher.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('#cohortInput');
    await page.fill('#cohortInput', code);
    await page.fill('#tokenInput', token);
    await page.click('#loginBtn');
    // After successful login the dashboard reveals itself; wait for tiles.
    await page.waitForSelector('.summary-tile', { timeout: 10000 });
    await sleep(500); // allow chart svg layout to settle

    console.log("[teacher-smoke] dashboard rendered; running assertions…");
    await runTests(page);

    const fails = cases.filter((c) => !c.passed);
    console.log("");
    console.log(`[teacher-smoke] ${cases.length - fails.length}/${cases.length} passed`);
    if (fails.length) {
      console.log("[teacher-smoke] FAILED:");
      for (const f of fails) console.log("  - " + f.name + (f.detail ? " — " + f.detail : ""));
      exitCode = 1;
    } else {
      console.log("[teacher-smoke] all green ✓");
      exitCode = 0;
    }
  } catch (e) {
    console.error("[teacher-smoke] fatal:", e && e.message ? e.message : e);
    console.error("[teacher-smoke] server log tail:");
    for (const line of logs.slice(-20)) console.error("  " + line);
    exitCode = 1;
  } finally {
    if (args.keepOpen) {
      console.log(`[teacher-smoke] --keep-open: ${baseUrl}/teacher.html — cohort=${code} token=${token}`);
      return;
    }
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[teacher-smoke] unhandled:", e); process.exit(1); });
}
