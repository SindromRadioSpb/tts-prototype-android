#!/usr/bin/env node
// scripts/research/browser-smoke.js — headless browser runner for the
// Phase 11.2 + 11.3 client smoke (public/research-client-test.html).
//
// Spawns server.js on a free port with a temp RESEARCH_DATA_DIR, launches
// headless Chromium via Playwright, navigates to the test page, waits for
// the summary div to render, and parses pass/fail counts.
//
// Exit code:
//   0 — all browser cases green
//   1 — any case failed, or fatal runner error
//
// Usage:
//   node scripts/research/browser-smoke.js [--port 3199] [--keep-open]
//   --keep-open  — leave browser + server running for manual inspection.

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

// Force project-local browser cache so the runner doesn't depend on a
// system-wide playwright install location.
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

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `research-browser-smoke-${Date.now()}-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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
  } else {
    child.kill("SIGKILL");
  }
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const researchDir = makeTempDir();
  console.log(`[browser-smoke] RESEARCH_DATA_DIR = ${researchDir}`);
  console.log(`[browser-smoke] starting server on ${baseUrl}…`);

  const { child, logs } = startServer(args.port, researchDir);
  let exitCode = 1;
  let playwright;
  try {
    playwright = require("playwright");
  } catch (e) {
    console.error("[browser-smoke] playwright not installed. Run: npm install playwright");
    await stopServer(child);
    process.exit(1);
  }

  let browser;
  try {
    const ready = await waitForReady(baseUrl);
    if (!ready) throw new Error("server did not become ready in 15s");
    console.log("[browser-smoke] server up; launching headless Chromium…");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push("[pageerror] " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push("[console.error] " + m.text());
    });

    const url = `${baseUrl}/research-client-test.html`;
    console.log(`[browser-smoke] navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for the summary div the test runner appends at the end.
    await page.waitForSelector(".summary", { timeout: 30000 });
    const summaryText = (await page.textContent(".summary")) || "";

    // Parse "N/M passed" — passing summary uses bold + "all green ✓".
    const match = summaryText.match(/(\d+)\/(\d+)\s+passed/);
    const passed = match ? Number(match[1]) : -1;
    const total  = match ? Number(match[2]) : -1;
    const allGreen = /all green/i.test(summaryText);
    const failed = total - passed;

    // Also dump per-line ❌ entries if any.
    let failedNames = [];
    try {
      failedNames = await page.$$eval("p.err", (els) => els.map((e) => e.textContent || ""));
    } catch (_) {}

    console.log("");
    console.log(`[browser-smoke] summary: ${summaryText.trim()}`);
    if (failed > 0 || !allGreen) {
      console.log("[browser-smoke] FAILED:");
      for (const name of failedNames.slice(0, 30)) console.log("  - " + name);
      if (consoleErrors.length) {
        console.log("[browser-smoke] console errors:");
        for (const e of consoleErrors.slice(0, 10)) console.log("  " + e);
      }
      exitCode = 1;
    } else if (passed > 0) {
      exitCode = 0;
    } else {
      console.log("[browser-smoke] WARN: could not parse passed count from summary.");
      exitCode = 1;
    }
  } catch (e) {
    console.error("[browser-smoke] fatal:", e && e.message ? e.message : e);
    console.error("[browser-smoke] server log tail:");
    for (const line of logs.slice(-20)) console.error("  " + line);
    exitCode = 1;
  } finally {
    if (args.keepOpen) {
      console.log(`[browser-smoke] --keep-open: server + browser left running. URL: ${baseUrl}/research-client-test.html`);
      console.log("[browser-smoke] Ctrl+C to teardown.");
      return; // skip cleanup
    }
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("[browser-smoke] unhandled:", e);
    process.exit(1);
  });
}
