#!/usr/bin/env node
"use strict";

// Real-browser L1-D matrix. Chrome/Edge use the installed system binaries;
// Firefox uses Playwright's instrumented Mozilla build because stock Firefox
// has no Playwright Juggler endpoint. No provider/network mocking is used.

const fs = require("fs");
const path = require("path");
const { chromium, firefox } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const OUT = __dirname;
const APP = process.env.STUDIO_MATRIX_ORIGIN || "http://127.0.0.1:3000";
const PNA_ORIGIN = process.env.STUDIO_MATRIX_PNA_ORIGIN || "http://192.168.1.228:3000";
const TOKEN_FILE = process.env.STUDIO_MATRIX_TOKEN_FILE ||
  path.join(ROOT, ".tmp", "studio-local-asr-evidence-closure", "pairing-token");
const AUDIO = process.env.STUDIO_MATRIX_AUDIO ||
  path.join(ROOT, ".tmp", "h3-c1-owner-audio", "c1-n01.wav");
const CANCEL_AUDIO = process.env.STUDIO_MATRIX_CANCEL_AUDIO ||
  path.join(ROOT, ".tmp", "studio-local-asr-browser-cancel.wav");
const JOB_ROOT = path.join(ROOT, ".tmp", "studio-local-asr-evidence-closure", "jobs");
const MODE = process.argv.includes("--down-only") ? "down" : "live";
const TOKEN = fs.readFileSync(TOKEN_FILE, "utf8").trim();

function installedFirefoxExecutable() {
  const expected = firefox.executablePath();
  if (fs.existsSync(expected)) return expected;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "D:/playwright-browsers";
  const builds = fs.existsSync(root) ? fs.readdirSync(root).filter((name) => /^firefox-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])) : [];
  const candidate = builds.length ? path.join(root, builds[0], "firefox", "firefox.exe") : "";
  if (!candidate || !fs.existsSync(candidate)) throw new Error("no Playwright Firefox build is installed");
  return candidate;
}

const ALL_ENGINES = [
  { name: "chrome", type: chromium, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    provenance: "installed-system-browser" },
  { name: "edge", type: chromium, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    provenance: "installed-system-browser" },
  { name: "firefox", type: firefox, executablePath: installedFirefoxExecutable(),
    provenance: "playwright-instrumented-mozilla-build; stock Firefox 153 rejects Juggler automation" },
];
const ENGINE_FILTER = process.env.STUDIO_MATRIX_ENGINE || "";
const ENGINES = ENGINE_FILTER ? ALL_ENGINES.filter((engine) => engine.name === ENGINE_FILTER) : ALL_ENGINES;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function dismissAndOpen(page) {
  await page.waitForSelector("#classicComposerPanel");
  await page.evaluate(() => {
    const composer = document.getElementById("classicComposerPanel");
    if (composer) composer.open = true;
  });
  await page.locator("#v3ImportEntry button").filter({ hasText: "Импорт" }).click();
  await page.waitForSelector("#v3ImportModal:not(.hidden)");
  await page.locator("#v3ImportTabFile").click();
}

function cloudRequests(requests) {
  return requests.filter((request) => /generativelanguage\.googleapis\.com|\/upload\/v1beta\/files/i.test(request.url));
}

async function defaultOff(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("v3.byokOnboardingDismissed", "1");
    localStorage.setItem("v3OnboardingSeenV1", "1");
    localStorage.setItem("onboardingSeen_v1", JSON.stringify({ action: "matrix" }));
    localStorage.setItem("phase6FirstOpenSeen", "matrix");
    localStorage.setItem("localMode", "1");
  });
  const page = await context.newPage();
  await page.goto(APP + "/index.html", { waitUntil: "load" });
  await dismissAndOpen(page);
  const result = await page.evaluate(() => ({
    experimental: window.LocalAsrClient.isExperimentalEnabled(),
    providerHidden: document.getElementById("v3ImportAudioProviderWrap").hidden,
    providerValue: document.getElementById("v3ImportAudioProvider").value,
    width: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(result.experimental === false, engine.name + ": local ASR must be default-off");
  assert(result.providerHidden === true, engine.name + ": provider must be hidden by default");
  assert(result.providerValue === "gemini", engine.name + ": product provider reset must remain Gemini");
  assert(result.width <= result.clientWidth, engine.name + ": default-off modal overflows 380 px");
  await page.screenshot({ path: path.join(OUT, `${engine.name}-default-off-380x844.png`) });
  await context.close();
  return result;
}

async function enabledContext(browser) {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript((token) => {
    localStorage.setItem("v3.byokOnboardingDismissed", "1");
    localStorage.setItem("v3OnboardingSeenV1", "1");
    localStorage.setItem("onboardingSeen_v1", JSON.stringify({ action: "matrix" }));
    localStorage.setItem("phase6FirstOpenSeen", "matrix");
    localStorage.setItem("localMode", "1");
    localStorage.setItem("linguistpro.experimental.localAsr", "1");
    sessionStorage.setItem("linguistpro.localAsr.pairingToken", token);
  }, TOKEN);
  return context;
}

async function openLocal(page, origin = APP) {
  await page.goto(origin + "/index.html", { waitUntil: "load" });
  await dismissAndOpen(page);
  const provider = page.locator("#v3ImportAudioProvider");
  await provider.selectOption("local");
  await page.waitForFunction(() => !document.getElementById("v3ImportLocalAsrSetup").hidden);
}

async function pnaProbe(browser, engine) {
  const context = await enabledContext(browser);
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => {
    if (request.url().startsWith("http://127.0.0.1:8799"))
      requests.push({ url: request.url(), method: request.method() });
  });
  await openLocal(page, PNA_ORIGIN);
  const status = await pair(page);
  const state = await page.evaluate(() => ({ secureContext: window.isSecureContext,
    cryptoSubtle: !!(window.crypto && window.crypto.subtle) }));
  assert(requests.some((request) => request.url.includes("/v1/asr/model/status")),
    engine.name + ": LAN-origin loopback request was not observed");
  await context.close();
  return { origin: PNA_ORIGIN, status, requests, ...state,
    note: "LAN HTTP can prove the browser Origin/CORS/loopback handshake, but media hashing requires a trustworthy origin; full upload runs from 127.0.0.1." };
}

async function pair(page) {
  await page.locator("#v3ImportLocalAsrPair").click();
  await page.waitForFunction(() => /готов|ready|מוכן/i.test(document.getElementById("v3ImportStatus").textContent), null,
    { timeout: 30000 });
  return page.locator("#v3ImportStatus").textContent();
}

async function waitForJobId(responsePromise, startedAt) {
  const response = await responsePromise;
  try {
    const payload = await response.json();
    if (payload && payload.job_id) return payload.job_id;
  } catch (_) {}
  // Chromium may evict a streamed-upload response body from the inspector cache.
  // The sidecar state root is local and isolated for this evidence run, so recover
  // the one newly-created UUID without reading media or transcript bytes.
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidates = fs.existsSync(JOB_ROOT) ? fs.readdirSync(JOB_ROOT).map((name) => ({
      name, mtime: fs.statSync(path.join(JOB_ROOT, name)).mtimeMs,
    })).filter((item) => item.mtime >= startedAt - 1000).sort((a, b) => b.mtime - a.mtime) : [];
    if (candidates.length) return candidates[0].name;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("created job id unavailable");
}

async function liveFlow(browser, engine) {
  const context = await enabledContext(browser);
  const page = await context.newPage();
  const requests = [];
  const failedRequests = [];
  const consoleErrors = [];
  page.on("request", (request) => requests.push({ url: request.url(), method: request.method(),
    origin: request.headers()["origin"] || null }));
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), method: request.method(),
    error: request.failure() && request.failure().errorText }));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await openLocal(page);
  const enabledState = await page.evaluate(() => ({
    experimental: window.LocalAsrClient.isExperimentalEnabled(),
    providerHidden: document.getElementById("v3ImportAudioProviderWrap").hidden,
    setupHidden: document.getElementById("v3ImportLocalAsrSetup").hidden,
    providerValue: document.getElementById("v3ImportAudioProvider").value,
  }));
  assert(enabledState.experimental && !enabledState.providerHidden && !enabledState.setupHidden,
    engine.name + ": explicit enable did not reveal Local controls");
  assert(enabledState.providerValue === "local", engine.name + ": explicit provider selection failed");
  const pairedStatus = await pair(page);

  await page.locator("#v3ImportAudio").setInputFiles(AUDIO);
  await page.waitForFunction(() => !document.getElementById("v3ImportAudioInfo").hidden);
  const statuses = await page.evaluate(() => {
    window.__studioMatrixStatuses = [];
    const target = document.getElementById("v3ImportStatus");
    new MutationObserver(() => window.__studioMatrixStatuses.push(target.textContent)).observe(target,
      { subtree: true, childList: true, characterData: true });
    return [];
  });
  const createStartedAt = Date.now();
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/v1/asr/jobs") &&
    response.request().method() === "POST", { timeout: 30000 }).catch(() => null);
  await page.locator("#v3ImportAudioGo").click();
  const observedCreate = await createResponse;
  if (!observedCreate) {
    const debug = await page.evaluate(() => ({ status: document.getElementById("v3ImportStatus").textContent,
      goDisabled: document.getElementById("v3ImportAudioGo").disabled,
      goText: document.getElementById("v3ImportAudioGo").textContent,
      appVersion: window.APP_VERSION }));
    throw new Error(engine.name + ": no create-job response: " + JSON.stringify({ debug, requests, failedRequests, consoleErrors }));
  }
  const jobId = await waitForJobId(Promise.resolve(observedCreate), createStartedAt);
  await page.waitForFunction(() => !document.getElementById("v3ImportLocalAsrDelete").hidden, null,
    { timeout: 120000 });
  const completeStatuses = await page.evaluate(() => window.__studioMatrixStatuses.slice());
  assert(completeStatuses.some((value) => /очеред|queue|תור/i.test(value)), engine.name + ": QUEUED UI state absent");
  const completionSignal = await page.evaluate(() => ({
    deleteVisible: !document.getElementById("v3ImportLocalAsrDelete").hidden,
    previewVisible: !document.getElementById("v3ImportPreviewWrap").hidden,
    previewLength: document.getElementById("v3ImportPreview").value.length,
  }));
  assert(completionSignal.deleteVisible && completionSignal.previewVisible && completionSignal.previewLength > 0,
    engine.name + ": completion preview/delete state absent");

  // Actual browser-to-sidecar retry boundary. The visible retry control remains correctly hidden
  // for a gate-clean result; the API is exercised once with the permitted s12_7 reason.
  const retryInitiallyHidden = await page.locator("#v3ImportLocalAsrRetry").evaluate((element) => element.hidden);
  const retryStates = await page.evaluate(async ({ jobId }) => {
    const client = new window.LocalAsrClient.Client();
    const queued = await client.retryChunks(jobId, [0], "s12_7");
    const seen = [];
    const completed = await client.waitForJob(jobId, { onStatus: (status) => seen.push(status.state) }, queued);
    return { seen, state: completed.job.state };
  }, { jobId });
  assert(retryStates.state === "COMPLETE", engine.name + ": retry did not return COMPLETE");
  await page.locator("#v3ImportLocalAsrDelete").click();
  await page.waitForFunction(() => /удален|deleted|נמחק/i.test(document.getElementById("v3ImportStatus").textContent), null,
    { timeout: 30000 });

  // Second real job: exercise cancel and delete through the same browser boundary.
  await page.locator("#v3ImportAudio").setInputFiles(CANCEL_AUDIO);
  await page.waitForFunction(() => !document.getElementById("v3ImportAudioInfo").hidden);
  const cancelCreateStartedAt = Date.now();
  const cancelCreateResponse = page.waitForResponse((response) => response.url().endsWith("/v1/asr/jobs") &&
    response.request().method() === "POST");
  await page.locator("#v3ImportAudioGo").click();
  const observedCancelCreate = await cancelCreateResponse;
  await page.waitForFunction(() => !document.getElementById("v3ImportLocalAsrCancel").hidden, null,
    { timeout: 30000 });
  await page.locator("#v3ImportLocalAsrCancel").click();
  const cancelJobId = await waitForJobId(Promise.resolve(observedCancelCreate), cancelCreateStartedAt);
  const canceled = await page.evaluate(async ({ jobId }) => {
    const client = new window.LocalAsrClient.Client();
    for (let index = 0; index < 60; index++) {
      const status = await client.getJob(jobId);
      if (["CANCELED", "COMPLETE", "FAILED"].includes(status.state)) {
        const receipt = await client.deleteJob(jobId);
        return { state: status.state, receipt };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("cancel did not become terminal");
  }, { jobId: cancelJobId });
  assert(canceled.state === "CANCELED", engine.name + ": cancel raced to " + canceled.state);
  assert(canceled.receipt && canceled.receipt.deleted, engine.name + ": canceled job deletion failed");

  await page.locator("#appLangSelect").selectOption("he");
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  const rtl = await page.evaluate(() => ({ dir: document.documentElement.dir,
    width: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert(rtl.dir === "rtl" && rtl.width <= rtl.clientWidth, engine.name + ": RTL/380 overflow failure");
  await page.screenshot({ path: path.join(OUT, `${engine.name}-local-complete-rtl-380x844.png`) });
  const cloud = cloudRequests(requests);
  assert(cloud.length === 0, engine.name + ": implicit cloud request detected");
  const result = { enabledState, pairedStatus, statuses: completeStatuses, completionSignal, retryInitiallyHidden,
    retryStates, canceled, rtl, requests: requests.filter((r) => r.url.startsWith("http://127.0.0.1:8799")),
    cloudRequests: cloud, consoleErrors };
  await context.close();
  return result;
}

async function downFlow(browser, engine) {
  const context = await enabledContext(browser);
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => requests.push({ url: request.url(), method: request.method() }));
  await openLocal(page);
  await page.locator("#v3ImportLocalAsrPair").click();
  await page.waitForFunction(() => /недоступ|unavailable|זמין/i.test(document.getElementById("v3ImportStatus").textContent), null,
    { timeout: 30000 });
  const status = await page.locator("#v3ImportStatus").textContent();
  const cloud = cloudRequests(requests);
  assert(cloud.length === 0, engine.name + ": sidecar-down caused cloud fallback");
  await context.close();
  return { status, cloudRequests: cloud, localRequests: requests.filter((r) => r.url.startsWith("http://127.0.0.1:8799")) };
}

(async () => {
  const report = { schema: "studio-local-asr-browser-matrix-v1", mode: MODE, appOrigin: APP,
    pnaOrigin: PNA_ORIGIN, viewport: { width: 380, height: 844 }, generated_at: new Date().toISOString(), engines: {} };
  for (const engine of ENGINES) {
    const browser = await engine.type.launch({ headless: true, executablePath: engine.executablePath });
    try {
      const page = await browser.newPage();
      const userAgent = await page.evaluate(() => navigator.userAgent);
      await page.close();
      report.engines[engine.name] = { provenance: engine.provenance, executablePath: engine.executablePath,
        browserVersion: browser.version(), userAgent };
      if (MODE === "live") {
        report.engines[engine.name].defaultOff = await defaultOff(browser, engine);
        report.engines[engine.name].pna = await pnaProbe(browser, engine);
        report.engines[engine.name].live = await liveFlow(browser, engine);
      } else {
        report.engines[engine.name].sidecarDown = await downFlow(browser, engine);
      }
      report.engines[engine.name].pass = true;
      process.stdout.write(`${engine.name}: PASS\n`);
    } finally {
      await browser.close();
    }
  }
  const output = path.join(OUT, MODE === "live" ? "browser-matrix-live.json" : "browser-matrix-sidecar-down.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
})().catch((error) => { console.error(error); process.exit(1); });
