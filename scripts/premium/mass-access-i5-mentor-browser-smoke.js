#!/usr/bin/env node
"use strict";

// MASS-ACCESS I5 browser gate. Fresh server DB + isolated browser contexts only;
// no owner profile, Telegram delivery, consent mutation or production write.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3334;
const baseArg = process.argv.find((arg) => arg.startsWith("--base-url="));
const BASE = baseArg ? baseArg.slice(11).replace(/\/$/, "") : `http://127.0.0.1:${PORT}`;
const LIVE = !!baseArg;
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const OUT = outArg ? path.resolve(ROOT, outArg.slice(6)) : path.join(ROOT, ".tmp", "mass-access-i5-mentor");
const failures = [];
let checks = 0;
const check = (condition, message) => { checks += 1; if (!condition) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer(dataDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
  if (!exited && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}

async function ready(server) {
  for (let i = 0; i < 150; i += 1) {
    if (server.logs.some((line) => line.includes("EADDRINUSE"))) return false;
    try {
      const response = await fetch(BASE + "/healthz");
      const json = await response.json();
      if (response.ok && json.db && json.db.ready && json.migrations && json.migrations.ready) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function guestGate(browser) {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  await page.addInitScript(() => localStorage.setItem("app.locale", "ru"));
  await page.goto(BASE + "/library.html#room=hub", { waitUntil: "load", timeout: 60000 });
  await page.locator("#roomMentor").click();
  await page.waitForSelector(".mentor-connection", { timeout: 30000 });
  const initial = await page.locator(".mentor-connection-step").evaluateAll((nodes) => nodes.map((node) => node.className));
  check(initial.length === 4, "guest journey renders four capability steps");
  check(initial[0].includes("is-current") && initial.slice(1).every((item) => item.includes("is-locked")), "guest exposes Account only");
  check(await page.getByRole("button", { name: "Открыть вход" }).isVisible(), "guest has a clear account action");
  await page.getByRole("button", { name: "Открыть вход" }).click();
  check(await page.locator("#roomCloudModal").isVisible(), "account action opens the canonical Cloud Sync writer");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "roomCloudSecret", null, { timeout: 5000 }).catch(() => {});
  check(await page.locator("#roomCloudSecret").evaluate((node) => node === document.activeElement), "account writer receives focus");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".mentor-connection");
  await page.locator(".mentor-connection").screenshot({ path: path.join(OUT, "mentor-connection-guest-380-ru.png") });

  await page.locator("#roomLang").selectOption("he");
  await page.waitForFunction(() => document.documentElement.lang === "he" && document.documentElement.dir === "rtl");
  await page.waitForSelector(".mentor-connection");
  check(await page.getByRole("button", { name: "פתיחת הכניסה" }).isVisible(), "Hebrew journey action is localized");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, "Hebrew 380px journey has no horizontal overflow");
  await page.locator(".mentor-connection").screenshot({ path: path.join(OUT, "mentor-connection-guest-380-he-rtl.png") });
  check(errors.length === 0, "guest journey has no page errors: " + errors.join(" | "));
  await context.close();
}

async function connectedGate(browser) {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  await page.addInitScript(() => localStorage.setItem("app.locale", "en"));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "fixture-owner", role: "owner" }, csrf: "fixture-csrf", consents: {} }),
  }));
  await page.route("**/api/agent/telegram/status", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, linked: false, pending: false, consent: false, bot_url: "https://t.me/LinguistProMentorBot" }),
  }));
  await page.route("**/api/agent/status", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, kill_switch: false, key_source: "none", usage: {}, limits: {} }),
  }));
  await page.goto(BASE + "/library.html#room=hub", { waitUntil: "load", timeout: 60000 });
  await page.locator("#roomMentor").click();
  await page.waitForSelector(".mentor-connection");
  const states = await page.locator(".mentor-connection-step").evaluateAll((nodes) => nodes.map((node) => node.className));
  check(states[0].includes("is-complete") && states[1].includes("is-current"), "connected account advances to Sync");
  check(states[2].includes("is-locked") && states[3].includes("is-locked"), "Telegram and AI remain ordered after Sync");
  check(await page.getByRole("button", { name: "Sync now" }).isVisible(), "connected journey exposes one explicit Sync action");
  check((await page.locator("#roomMentorMount #roomCloudSecret").count()) === 0, "Mentor does not duplicate the login writer");
  await page.getByRole("button", { name: "Sync now" }).focus();
  check(await page.getByRole("button", { name: "Sync now" }).evaluate((node) => node === document.activeElement), "journey action is keyboard-focusable");
  await page.locator(".mentor-connection").screenshot({ path: path.join(OUT, "mentor-connection-account-380-en.png") });
  check(errors.length === 0, "connected journey has no page errors: " + errors.join(" | "));
  await context.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const scratch = LIVE ? null : fs.mkdtempSync(path.join(os.tmpdir(), "lp-i5-mentor-"));
  const server = LIVE ? { child: null, logs: [] } : startServer(scratch);
  let browser;
  try {
    if (!(await ready(server))) throw new Error("server failed: " + server.logs.join("").slice(-2000));
    browser = await chromium.launch({ headless: true });
    await guestGate(browser);
    await connectedGate(browser);
  } finally {
    if (browser) await browser.close();
    await stopServer(server.child);
    if (scratch) { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {} }
  }
  if (failures.length) {
    console.error(`MASS_ACCESS_I5_MENTOR_BROWSER FAIL (${failures.length}/${checks})`);
    failures.forEach((failure) => console.error(" - " + failure));
    process.exit(1);
  }
  console.log(`MASS_ACCESS_I5_MENTOR_BROWSER PASS (${checks}/${checks})`);
  console.log(" screenshots=" + OUT);
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
