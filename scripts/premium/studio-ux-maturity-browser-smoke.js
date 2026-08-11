#!/usr/bin/env node
"use strict";

// B1 browser gate. Uses isolated Playwright contexts and never saves a real material.
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3297;
const BASE = `http://127.0.0.1:${PORT}`;
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
  if (!exited && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}

async function ready(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function prepare(page, locale, dark) {
  await page.addInitScript(({ locale, dark }) => {
    localStorage.setItem("app.locale", locale);
    localStorage.setItem("appTheme_v1", dark ? "dark" : "light");
  }, { locale, dark });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  await page.goto(BASE + "/index.html", { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => {
    for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
      const node = document.getElementById(id); if (node) node.remove();
    }
    const input = document.getElementById("inputText");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    window.v3LastImportMeta = null;
    document.dispatchEvent(new CustomEvent("studio:source-context-changed", { detail: { resolve: false } }));
  });
  await page.waitForTimeout(100);
  return pageErrors;
}

async function inspect(browser, locale, viewport, dark, label) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = await prepare(page, locale, dark);
  const prefix = `${label}/${locale}/${dark ? "dark" : "light"}`;

  const shell = await page.evaluate(() => {
    function luminance(rgb) {
      const parts = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => {
        const v = n / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }
    function contrast(a, b) {
      const la = luminance(a), lb = luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    const primary = [...document.querySelectorAll("[data-studio-primary='true']")].filter((node) => node.getClientRects().length);
    const label = document.querySelector(".classic-nav-label");
    const style = getComputedStyle(label);
    let background = style.backgroundColor;
    let parent = label.parentElement;
    while (parent && (background === "rgba(0, 0, 0, 0)" || background === "transparent")) {
      background = getComputedStyle(parent).backgroundColor;
      parent = parent.parentElement;
    }
    const visibleMains = [...document.querySelectorAll("main,[role='main']")].filter((node) => node.getClientRects().length);
    return {
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      primaryCount: primary.length,
      primaryHeight: primary[0] ? primary[0].getBoundingClientRect().height : 0,
      nextAction: primary[0] && primary[0].dataset.action,
      overflow: document.documentElement.scrollWidth - innerWidth,
      mainCount: visibleMains.length,
      navContrast: contrast(style.color, background),
    };
  });
  check(shell.dir === (locale === "he" ? "rtl" : "ltr") && shell.lang === locale, `${prefix}: locale direction`);
  check(shell.primaryCount === 1 && shell.primaryHeight >= 48, `${prefix}: one primary CTA >=48px`);
  check(shell.nextAction === "add", `${prefix}: empty state recommends adding material`);
  check(shell.overflow <= 0, `${prefix}: no page horizontal overflow (${shell.overflow}px)`);
  check(shell.mainCount === 1, `${prefix}: exactly one visible main landmark`);
  check(shell.navContrast >= 4.5, `${prefix}: navigation contrast ${shell.navContrast.toFixed(2)} >= 4.5`);

  await page.focus("#classicNextActionBtn");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#v3ImportModal:not(.hidden)");
  const openState = await page.evaluate(() => {
    const modal = document.getElementById("v3ImportModal");
    const panel = modal.querySelector(".v3-modal-panel").getBoundingClientRect();
    return {
      activeId: document.activeElement && document.activeElement.id,
      outsideInert: [...document.body.children].filter((node) => node !== modal && !node.contains(modal) && node.tagName !== "SCRIPT").every((node) => node.inert),
      inside: panel.left >= 0 && panel.right <= innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  check(openState.activeId === "v3ImportTabUrl", `${prefix}: focus enters selected import tab`);
  check(openState.outsideInert, `${prefix}: dialog background is inert`);
  check(openState.inside && openState.overflow <= 0, `${prefix}: dialog fits viewport`);

  for (let i = 0; i < 24; i++) await page.keyboard.press("Tab");
  const trapped = await page.evaluate(() => document.getElementById("v3ImportModal").contains(document.activeElement));
  check(trapped, `${prefix}: Tab focus remains in dialog`);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("v3ImportModal").classList.contains("hidden"));
  await page.waitForTimeout(20);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === "classicNextActionBtn"), `${prefix}: Escape returns focus`);

  const picker = await page.evaluate(() => {
    window.StudioMediaPackage.openWorkspaceLibrary();
    window.__b1PickerClicks = { audio: 0, captions: 0 };
    document.getElementById("v3ImportAudio").click = () => { window.__b1PickerClicks.audio++; };
    document.getElementById("v3ImportCaptionsFile").click = () => { window.__b1PickerClicks.captions++; };
    return { selected: document.getElementById("v3ImportTabFile").getAttribute("aria-selected") };
  });
  check(picker.selected === "true", `${prefix}: Drafts opens existing continuation shelf`);
  await page.focus("#v3ImportAudioPicker");
  await page.keyboard.press("Enter");
  const audioPickerHeight = await page.locator("#v3ImportAudioPicker").evaluate((node) => node.getBoundingClientRect().height);
  await page.evaluate(() => StudioImport.switchTab("video"));
  await page.focus("#v3ImportCaptionsPicker");
  await page.keyboard.press("Enter");
  const pickerResult = await page.evaluate(() => ({
    captionsKeyboard: document.getElementById("v3ImportCaptionsPicker").getBoundingClientRect().height,
    clicks: window.__b1PickerClicks,
  }));
  check(audioPickerHeight >= 44 && pickerResult.captionsKeyboard >= 44, `${prefix}: file-picker targets >=44px (${audioPickerHeight}, ${pickerResult.captionsKeyboard})`);
  check(pickerResult.clicks.audio === 1 && pickerResult.clicks.captions === 1, `${prefix}: Enter activates native file inputs`);
  await page.evaluate(() => StudioImport.close());

  const sourceState = await page.evaluate(() => {
    const input = document.getElementById("inputText");
    input.value = "שלום עולם";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    window.v3LastImportMeta = { kind: "captions", method: "captions-panel", textSnapshot: "שלום עולם" };
    document.dispatchEvent(new CustomEvent("studio:source-context-changed", { detail: { resolve: false } }));
    const exact = document.getElementById("classicSourceStateChip").textContent.trim();
    document.dispatchEvent(new CustomEvent("studio:source-context-changed", { detail: { resolve: true } }));
    const exactAfterShelfRefresh = document.getElementById("classicSourceStateChip").textContent.trim();
    const phase = document.getElementById("classicNextActionBtn").dataset.action;
    input.value = "שלום עולם!";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const changed = document.getElementById("classicSourceStateChip").textContent.trim();
    const meta = document.getElementById("classicComposerPanelMeta").textContent.trim();
    return { exact, exactAfterShelfRefresh, changed, phase, meta };
  });
  check(sourceState.exact === sourceState.exactAfterShelfRefresh, `${prefix}: shelf refresh preserves an exact import passport`);
  check(sourceState.exact !== sourceState.changed, `${prefix}: exact import source is not retained after text change`);
  check(sourceState.phase === "table", `${prefix}: text state recommends table creation`);
  check(!/classic\.source|\{count\}/.test(sourceState.exact + sourceState.changed + sourceState.meta), `${prefix}: dynamic strings are localized`);
  if (locale === "he") check(!/[А-Яа-яЁё]/.test(sourceState.meta), `${prefix}: composed metadata has no Russian leakage`);
  check(pageErrors.length === 0, `${prefix}: no uncaught page errors (${pageErrors.join(" | ")})`);
  await context.close();
}

(async () => {
  const server = startServer();
  if (!(await ready())) { await stopServer(server); throw new Error("local server did not become ready"); }
  const browser = await chromium.launch({ headless: true });
  try {
    await inspect(browser, "ru", { width: 1280, height: 900 }, false, "desktop");
    await inspect(browser, "ru", { width: 380, height: 844 }, true, "380");
    await inspect(browser, "he", { width: 380, height: 844 }, true, "380");
  } finally {
    await browser.close();
    await stopServer(server);
  }
  if (failures.length) {
    console.error(`[studio-ux-maturity-browser-smoke] FAIL ${checks - failures.length}/${checks}`);
    failures.forEach((failure) => console.error(" - " + failure));
    process.exit(1);
  }
  console.log(`[studio-ux-maturity-browser-smoke] PASS ${checks}/${checks}`);
})().catch((error) => { console.error("[studio-ux-maturity-browser-smoke]", error); process.exit(1); });
