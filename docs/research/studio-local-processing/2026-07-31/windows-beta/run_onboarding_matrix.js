#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const OUT = __dirname;
const ROOT = path.resolve(OUT, "..", "..", "..", "..", "..");
const ORIGIN = "http://127.0.0.1:3000";
const TOKEN_FILE = process.env.LOCAL_ASR_PAIRING_TOKEN_FILE ||
  path.join(process.env.LOCALAPPDATA || "", "LinguistPro", "LocalASR", "state", "pairing-token");
const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
const engines = [
  { name: "chrome", executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" },
  { name: "edge", executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" },
];

function assert(value, message) { if (!value) throw new Error(message); }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(ORIGIN + "/api/client-config");
      if (response.ok) return;
    } catch (_) {}
    await wait(250);
  }
  throw new Error("local product server did not start");
}

async function runEngine(engine) {
  assert(fs.existsSync(engine.executablePath), engine.name + " executable missing");
  const browser = await chromium.launch({ executablePath: engine.executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("v3.byokOnboardingDismissed", "1");
    localStorage.setItem("v3OnboardingSeenV1", "1");
    localStorage.setItem("onboardingSeen_v1", JSON.stringify({ action: "windows-beta-matrix" }));
    localStorage.setItem("phase6FirstOpenSeen", "windows-beta-matrix");
  });
  const page = await context.newPage();
  const cloudRequests = [];
  page.on("request", (request) => {
    if (/generativelanguage\.googleapis\.com|\/upload\/v1beta\/files/i.test(request.url())) {
      cloudRequests.push({ method: request.method(), url: request.url() });
    }
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(ORIGIN + "/index.html#local-asr-beta", { waitUntil: "load" });
  await page.waitForSelector("#localAsrBetaModal:not([hidden])");
  await page.locator("#localAsrToken").fill(token);
  await page.locator("#localAsrConnect").click();
  await page.waitForFunction(() => /Connected|Подключ|מחובר/i.test(document.getElementById("localAsrBetaStatus").textContent));
  await page.locator("#localAsrDeviceCheck").click();
  await page.waitForFunction(() => document.getElementById("localAsrDeviceState").textContent.trim().length > 0);
  const deviceResult = await page.evaluate(() => ({
    text: document.getElementById("localAsrDeviceState").textContent.trim(),
    kind: document.getElementById("localAsrBetaStatus").dataset.kind,
  }));
  assert(deviceResult.kind === "ok", engine.name + ": device preflight failed: " + deviceResult.text);
  await page.waitForFunction(() => document.getElementById("localAsrModelState").textContent.trim().length > 0,
    null, { timeout: 30000 });
  const ltr = await page.evaluate(() => ({
    enrolled: window.LocalAsrClient.isExperimentalEnabled(),
    runtimeBeta: window.LocalAsrClient.runtimeConfig().beta,
    settingsVisible: !document.getElementById("btnLocalAsrSettings").hidden,
    modalVisible: !document.getElementById("localAsrBetaModal").hidden,
    direction: document.documentElement.dir || "ltr",
    width: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    privacy: document.querySelector(".local-asr-privacy").textContent.replace(/\s+/g, " ").trim(),
    modelState: document.getElementById("localAsrModelState").textContent.trim(),
  }));
  assert(ltr.enrolled && ltr.runtimeBeta, engine.name + ": beta did not enroll");
  assert(ltr.settingsVisible && ltr.modalVisible, engine.name + ": onboarding surface hidden");
  assert(ltr.modelState.length > 0, engine.name + ": model readiness was not rendered");
  assert(ltr.width <= ltr.clientWidth, engine.name + ": LTR overflow at 380px");
  await page.screenshot({ path: path.join(OUT, `${engine.name}-onboarding-ltr-380x844.png`) });

  await page.evaluate(() => { window.appSetLocale("he"); window.LocalAsrOnboarding.open(); });
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  const rtl = await page.evaluate(() => ({
    direction: document.documentElement.dir,
    width: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(rtl.width <= rtl.clientWidth, engine.name + ": RTL overflow at 380px");
  await page.screenshot({ path: path.join(OUT, `${engine.name}-onboarding-rtl-380x844.png`) });

  await page.locator("#localAsrChoose").click();
  await page.waitForSelector("#v3ImportModal:not(.hidden)");
  const provider = await page.locator("#v3ImportAudioProvider").inputValue();
  assert(provider === "local", engine.name + ": Local was not explicitly selected");
  assert(cloudRequests.length === 0, engine.name + ": unexpected Gemini request");
  await context.close();
  await browser.close();
  return { engine: engine.name, provenance: "installed-system-browser", viewport: "380x844", ltr, rtl,
    explicitProvider: provider, implicitGeminiRequests: cloudRequests.length, result: "PASS" };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: "3000", LOCAL_ASR_BETA_ENABLED: "true", LOCAL_ASR_COMPANION_DOWNLOAD_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let serverLog = "";
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
  try {
    await waitForServer();
    const results = [];
    for (const engine of engines) results.push(await runEngine(engine));
    const report = {
      schema: "linguistpro-local-asr-windows-beta-browser-matrix-v1",
      generatedAt: new Date().toISOString(),
      origin: ORIGIN,
      productionOriginRun: false,
      engines: results,
      result: results.every((item) => item.result === "PASS") ? "PASS" : "FAIL",
    };
    fs.writeFileSync(path.join(OUT, "browser-matrix-report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    server.kill("SIGTERM");
    await wait(500);
    if (!server.killed) server.kill("SIGKILL");
    if (server.exitCode && server.exitCode !== 0) process.stderr.write(serverLog.slice(-4000));
  }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
