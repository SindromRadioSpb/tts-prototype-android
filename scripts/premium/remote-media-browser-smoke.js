#!/usr/bin/env node
"use strict";

// External-handoff visual gate: the real Studio shell, a deterministic player adapter, and no
// upstream request. Proves that preview/transcript no longer depends on acquisition-worker and
// that the Downr handoff fits/works at the 380px mobile contract in both LTR and RTL.
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3296;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "docs", "research", "studio-downr-handoff", "2026-08-11", "screenshots");
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

async function inspect(browser, locale, viewport, label) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  await context.addInitScript((value) => localStorage.setItem("app.locale", value), locale);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  await page.goto(BASE + "/index.html", { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => {
    for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
      const node = document.getElementById(id); if (node) node.remove();
    }
    window.StudioYtPlayer.capability = () => ({ supported: true, reason: "fixture" });
    window.StudioYtPlayer.create = async (mount) => {
      const frame = document.createElement("div");
      frame.style.cssText = "display:grid;place-items:center;min-height:150px;border-radius:8px;background:#173f3c;color:white;font-weight:700";
      frame.textContent = "YouTube preview";
      mount.appendChild(frame);
      return {
        tracklist: () => [{ languageCode: "he", languageName: "Hebrew", kind: "manual", isDefault: true }],
        addEventListener: () => {}, removeEventListener: () => {}, destroy: () => frame.remove(),
      };
    };
    window.StudioYtPlayer.destroy = (adapter) => adapter && adapter.destroy();
    document.execCommand = () => true;
    window.__downrOpened = null;
    window.open = () => ({ opener: window, location: { replace: (url) => { window.__downrOpened = url; } } });
    window.StudioImport.open();
    window.StudioImport.switchTab("video");
  });
  await page.fill("#v3ImportVideoUrl", "https://www.youtube.com/watch?v=wJgtBgZvQnU");
  await page.click("#v3ImportVideoBtn");
  await page.waitForSelector("#v3ImportCaptionsHow:not([hidden])", { timeout: 10000 });
  await page.click("#v3DownrOpen");
  await page.waitForSelector("#v3DownrChoose:not([hidden])", { timeout: 10000 });
  const result = await page.evaluate(() => {
    const panel = document.querySelector("#v3ImportModal .v3-modal-panel");
    const handoff = document.getElementById("v3DownrHandoff");
    const allTargets = [...handoff.querySelectorAll("button,a")].filter((node) => node.getClientRects().length > 0);
    return {
      dir: document.documentElement.dir,
      panelInside: panel.getBoundingClientRect().left >= 0 && panel.getBoundingClientRect().right <= innerWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      targets: allTargets.map((node) => Math.round(node.getBoundingClientRect().height)),
      title: document.getElementById("v3ImportTitle").textContent.trim(),
      pageLang: document.documentElement.lang,
      previewMounted: !document.getElementById("v3ImportYtMount").hidden && !document.getElementById("v3ImportCaptionsHow").hidden,
      oldWorkerSurfaceAbsent: !document.getElementById("v3RemoteMediaCard"),
      downrOpened: window.__downrOpened,
      status: document.getElementById("v3DownrStatus").textContent.trim(),
    };
  });
  const prefix = `${locale}/${label}`;
  check(result.dir === (locale === "he" ? "rtl" : "ltr"), `${prefix}: direction`);
  check(result.pageLang === locale, `${prefix}: language`);
  check(result.panelInside && result.noHorizontalOverflow, `${prefix}: horizontal fit`);
  check(result.previewMounted && result.oldWorkerSurfaceAbsent, `${prefix}: preview is independent from worker UI`);
  check(result.downrOpened === "https://downr.org/" && result.status.length > 0, `${prefix}: explicit Downr handoff`);
  check(result.targets.every((height) => height >= 44), `${prefix}: tap targets >=44px (${result.targets.join(",")})`);
  check(!/studio\.|remoteMedia/.test(result.title), `${prefix}: localized title`);
  check(pageErrors.length === 0, `${prefix}: no page errors (${pageErrors.join(" | ")})`);
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `downr-${label}-${locale}.png`), fullPage: false });
  const fileChoice = await page.evaluate(() => {
    let clicks = 0;
    document.getElementById("v3ImportAudio").click = () => { clicks++; };
    window.StudioImport.chooseDownloadedMedia();
    return { clicks, filePaneVisible: !document.getElementById("v3ImportPaneFile").hidden };
  });
  check(fileChoice.clicks === 1 && fileChoice.filePaneVisible, `${prefix}: return action opens device media picker`);
  await context.close();
}

(async () => {
  const server = startServer();
  if (!(await ready())) { await stopServer(server); throw new Error("local server did not become ready"); }
  const browser = await chromium.launch({ headless: true });
  try {
    await inspect(browser, "ru", { width: 380, height: 844 }, "380");
    await inspect(browser, "he", { width: 380, height: 844 }, "380");
    await inspect(browser, "ru", { width: 1280, height: 900 }, "desktop");
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
