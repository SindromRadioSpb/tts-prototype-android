#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3291;
const BASE = `http://127.0.0.1:${PORT}`;
const failures = [];
let checks = 0;
const ok = (condition, message) => { checks++; if (!condition) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), C1_EXPERIMENTAL_ENABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push("[out] " + String(chunk)));
  child.stderr.on("data", (chunk) => logs.push("[err] " + String(chunk)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function ready(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if ((await fetch(BASE + "/healthz")).status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

const exercises = Array.from({ length: 25 }, (_, index) => ({
  id: `c1-xd${String(index + 1).padStart(2, "0")}`,
  target_word: `מילה${index + 1}`,
  expected_target_vocalized: index === 0 ? "שָׁלוֹם" : `מִלָּה${index + 1}`,
  sentence: index === 0 ? "אָמַרְתִּי שָׁלוֹם לַחָבֵר." : `זֶה מִשְׁפָּט לְמִלָּה ${index + 1}.`,
  target_index: 1,
}));

async function inspect(browser, locale) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
  await context.addInitScript(({ locale }) => {
    localStorage.setItem("app.locale", locale);
    localStorage.setItem("linguistpro.c1.experimental.optin.v1", "1");
    localStorage.setItem("linguistpro.c1.companion.token.v1", "browser-smoke-token");
  }, { locale });
  const companionRequests = [];
  await context.route("http://127.0.0.1:8766/v1/**", async (route) => {
    const request = route.request();
    companionRequests.push({ url: request.url(), token: request.headers()["x-c1-token"] });
    const body = request.url().endsWith("/v1/health")
      ? { ok: true, profile_ready: true, phonikud_model_present: true, mms_fa_checkpoint_present: true }
      : { ok: true, exercises };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": BASE } });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(BASE + "/pronunciation.html", { waitUntil: "load", timeout: 60000 });
  await page.click("#c1ConnectButton");
  await page.waitForFunction(() => !document.getElementById("c1Lab").hidden, null, { timeout: 10000 });
  const result = await page.evaluate((locale) => {
    const disclosure = document.querySelector(".c1-disclosure").innerText;
    const lab = document.getElementById("c1Lab").getBoundingClientRect();
    const select = document.getElementById("c1Exercise");
    return {
      locale,
      dir: document.documentElement.dir,
      disclosure,
      options: select.options.length,
      tokenType: document.getElementById("c1Token").type,
      labInside: lab.left >= -1 && lab.right <= 381,
      resultHidden: document.getElementById("c1Result").hidden,
      connectStatus: document.getElementById("c1ConnectStatus").textContent,
    };
  }, locale);
  ok(result.dir === (locale === "he" ? "rtl" : "ltr"), `${locale}: document direction`);
  ok(result.disclosure.includes("60%") && result.disclosure.includes("30%") && result.disclosure.includes("2/10"), `${locale}: visible measured limits`);
  ok(result.options === 25, `${locale}: exactly 25 exercises`);
  ok(result.tokenType === "password", `${locale}: token must not be displayed in clear text`);
  ok(result.labInside, `${locale}: lab must fit 380px viewport`);
  ok(result.resultHidden, `${locale}: no guessed result before a recording`);
  ok(result.connectStatus.length > 10, `${locale}: localized connected status`);
  ok(companionRequests.length === 2 && companionRequests.every((request) => request.token === "browser-smoke-token"), `${locale}: token-gated companion requests only`);
  ok(pageErrors.length === 0, `${locale}: no page errors (${pageErrors.join(" | ")})`);
  const shotDir = path.join(REPO, ".tmp", "c1-experimental", "screenshots");
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, `c1-${locale}-380x844.png`), fullPage: true });
  await context.close();
}

(async () => {
  let playwright;
  try { playwright = require("playwright"); } catch (error) {
    console.error("[c1-experimental-browser-smoke] playwright missing:", error.message);
    process.exit(1);
  }
  const server = startServer();
  if (!(await ready())) {
    console.error("[c1-experimental-browser-smoke] server failed\n" + server.logs.join(""));
    await stopServer(server.child);
    process.exit(1);
  }
  const browser = await playwright.chromium.launch();
  try {
    for (const locale of ["ru", "en", "he"]) await inspect(browser, locale);
  } finally {
    await browser.close();
    await stopServer(server.child);
  }
  if (failures.length) {
    console.error(`[c1-experimental-browser-smoke] FAIL ${checks - failures.length}/${checks}`);
    failures.forEach((failure) => console.error(" - " + failure));
    process.exit(1);
  }
  console.log(`[c1-experimental-browser-smoke] PASS ${checks}/${checks}`);
})().catch((error) => { console.error(error); process.exit(1); });
