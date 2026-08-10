#!/usr/bin/env node
"use strict";

// RMA-3 owner-independent visual gate: real Studio shell and controller, fixture-only
// worker boundary. No media bytes, account state or upstream request participates.
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3296;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "docs", "research", "studio-remote-media-acquisition", "2026-08-11", "screenshots");
const failures = [];
let checks = 0;
const check = (condition, message) => { checks++; if (!condition) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer() {
  return spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
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
async function ready(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

const fixture = {
  ok: true,
  schema_version: "lp_media_resolve.1.0.0",
  source: { provider: "youtube", video_id: "wJgtBgZvQnU", canonical_url: "https://www.youtube.com/watch?v=wJgtBgZvQnU", title: "כשאבא הפסיק להאמין — שיחה בעברית", duration_seconds: 2260 },
  options: [
    { id: "video-360", kind: "video", quality: 360, container: "mp4", has_audio: true, size_bytes: 101690163, recommended: false },
    { id: "video-480", kind: "video", quality: 480, container: "mp4", has_audio: true, size_bytes: 71701606, recommended: false },
    { id: "video-720", kind: "video", quality: 720, container: "mp4", has_audio: true, size_bytes: 89286246, recommended: true },
    { id: "video-1080", kind: "video", quality: 1080, container: "mp4", has_audio: true, size_bytes: 262888693, recommended: false },
    { id: "audio-m4a", kind: "audio", container: "m4a", has_audio: true, size_bytes: 36563845, recommended: false },
    { id: "captions-he-manual", kind: "captions", language: "he", source_kind: "manual", container: "vtt", size_bytes: null, recommended: false },
  ],
  plan_sha256: "a".repeat(64),
  plan_token: "fixture.plan",
};

async function inspect(browser, locale) {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript((value) => localStorage.setItem("app.locale", value), locale);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  await page.route("**/api/media-acquisition/capability", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, worker_url: BASE + "/__rma-worker", capability: "fixture", expires_at: Math.floor(Date.now() / 1000) + 300 }),
  }));
  await page.route("**/__rma-worker/v1/resolve", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }));
  await page.goto(BASE + "/index.html", { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => {
    for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
      const node = document.getElementById(id); if (node) node.remove();
    }
    window.StudioImport.open();
    window.StudioImport.switchTab("video");
  });
  await page.fill("#v3ImportVideoUrl", "https://www.youtube.com/watch?v=wJgtBgZvQnU");
  await page.click("#v3ImportVideoBtn");
  await page.waitForSelector("#v3RemoteMediaCard:not([hidden])", { timeout: 10000 });
  const result = await page.evaluate(() => {
    const panel = document.querySelector("#v3ImportModal .v3-modal-panel");
    const card = document.getElementById("v3RemoteMediaCard");
    const primary = [...document.querySelectorAll("#v3RemoteMediaPrimary .v3-rma-option")];
    const allTargets = [...card.querySelectorAll("button,.v3-rma-option,.v3-rma-rights")].filter((node) => node.getClientRects().length > 0);
    return {
      dir: document.documentElement.dir,
      panelInside: panel.getBoundingClientRect().left >= 0 && panel.getBoundingClientRect().right <= innerWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      primaryCount: primary.length,
      recommendedVisible: primary.some((node) => node.dataset.recommended === "true"),
      completeOnly: primary.every((node) => /MP4/.test(node.textContent) && !/audio only|только аудио|אודיו בלבד/i.test(node.textContent)),
      targets: allTargets.map((node) => Math.round(node.getBoundingClientRect().height)),
      title: document.getElementById("v3ImportTitle").textContent.trim(),
      pageLang: document.documentElement.lang,
      hashRuntime: typeof window.hashwasm === "object" && typeof window.hashwasm.createSHA256 === "function",
    };
  });
  check(result.dir === (locale === "he" ? "rtl" : "ltr"), `${locale}: direction`);
  check(result.pageLang === locale, `${locale}: language`);
  check(result.panelInside && result.noHorizontalOverflow, `${locale}: 380px horizontal fit`);
  check(result.primaryCount === 2 && result.recommendedVisible && result.completeOnly, `${locale}: progressive compatible matrix`);
  check(result.targets.every((height) => height >= 44), `${locale}: tap targets >=44px (${result.targets.join(",")})`);
  check(!/studio\.|remoteMedia/.test(result.title), `${locale}: localized title`);
  check(result.hashRuntime, `${locale}: pinned incremental SHA runtime loaded`);
  check(pageErrors.length === 0, `${locale}: no page errors (${pageErrors.join(" | ")})`);
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `rma3-380-${locale}.png`), fullPage: false });
  await context.close();
}

(async () => {
  const server = startServer();
  if (!(await ready())) { await stopServer(server); throw new Error("local server did not become ready"); }
  const browser = await chromium.launch({ headless: true });
  try {
    await inspect(browser, "ru");
    await inspect(browser, "he");
  } finally {
    await browser.close();
    await stopServer(server);
  }
  if (failures.length) {
    console.error(`[remote-media-browser-smoke] FAIL ${checks - failures.length}/${checks}`);
    failures.forEach((failure) => console.error(" - " + failure));
    process.exit(1);
  }
  console.log(`[remote-media-browser-smoke] PASS ${checks}/${checks}`);
})().catch((error) => { console.error("[remote-media-browser-smoke]", error); process.exit(1); });
