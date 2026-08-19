#!/usr/bin/env node
"use strict";

// MASS-ACCESS I3 browser gate. Uses isolated Playwright profiles and fixture-only
// OPFS data; it never opens or mutates the owner's browser profile.
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3326;
const BASE = `http://127.0.0.1:${PORT}`;
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const OUT = outArg
  ? path.resolve(ROOT, outArg.slice("--out=".length))
  : path.join(ROOT, "docs", "research", "mass-access-i3-share", "2026-08-19", "screenshots");
const failures = [];
let checks = 0;
const check = (condition, message) => { checks += 1; if (!condition) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
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

async function ready() {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function seedOwnText(page, id, title) {
  return page.evaluate(async ({ id, title }) => {
    const db = await import("/db/local-db.js");
    await db.initLocalDB();
    await db.createText({ id, text_key: id, title, source_text: "שלום עולם", level: "alef", tags_json: JSON.stringify(["fixture"]) });
    await db.addSentence(id, { id: id + "-s1", order_index: 0, he_plain: "שלום עולם", he_niqqud: "שָׁלוֹם עוֹלָם", translit: "shalom olam", translit_ru: "шалом олам", ru: "привет, мир" });
  }, { id, title });
}

async function studioGate(browser) {
  console.log("[I3] Studio: open isolated context");
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  await page.addInitScript(() => {
    localStorage.setItem("app.locale", "ru");
    localStorage.setItem("phase6FirstOpenSeen", "declined");
    localStorage.setItem("localMode", "1");
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    } });
  });
  await page.goto(BASE + "/index.html", { waitUntil: "load", timeout: 60000 });
  console.log("[I3] Studio: shell loaded");
  await page.evaluate(() => {
    for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) { const node = document.getElementById(id); if (node) node.remove(); }
  });
  await seedOwnText(page, "mass-access-i3-studio", "Учебный диалог — fixture");
  console.log("[I3] Studio: fixture seeded");
  await page.evaluate(async () => {
    const trigger = document.createElement("button");
    trigger.id = "massAccessShareTrigger";
    trigger.textContent = "fixture";
    document.body.appendChild(trigger);
    trigger.focus();
    await window.v3TextCardShareOpen("mass-access-i3-studio");
  });
  await page.waitForFunction(() => {
    const node = document.getElementById("v3TcsPackageFacts");
    return node && ["ready", "partial"].includes(node.dataset.state);
  }, { timeout: 30000 });
  await page.waitForTimeout(350); // allow the legacy button transition to settle after enablement
  console.log("[I3] Studio: ZIP ready");
  const state = await page.evaluate(() => {
    const modal = document.getElementById("v3TextCardShareModal");
    const panel = modal.querySelector(".v3-tcs-panel").getBoundingClientRect();
    const save = document.getElementById("v3TcsBtnZip");
    const share = document.getElementById("v3TcsBtnNative");
    return {
      role: modal.getAttribute("role"), labelled: modal.getAttribute("aria-labelledby"),
      activeInside: modal.contains(document.activeElement),
      saveEnabled: !save.disabled, shareReady: share.hidden || !share.disabled,
      advancedClosed: !modal.querySelector(".v3-tcs-advanced").open,
      facts: ["v3TcsExpectedAudio", "v3TcsIncludedAudio", "v3TcsMissingAudio"].map((id) => document.getElementById(id).textContent.trim()),
      panelInside: panel.left >= 0 && panel.right <= innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      minAction: Math.min(save.getBoundingClientRect().height, share.hidden ? 999 : share.getBoundingClientRect().height),
      shareStyle: { hidden: share.hidden, background: getComputedStyle(share).backgroundColor, color: getComputedStyle(share).color, className: share.className },
      saveStyle: { background: getComputedStyle(save).backgroundColor, color: getComputedStyle(save).color, disabled: save.disabled, disabledAttribute: save.hasAttribute('disabled'), disabledPseudo: save.matches(':disabled'), className: save.className },
    };
  });
  console.log("[I3] Studio: action " + JSON.stringify(state.saveStyle));
  check(state.role === "dialog" && state.labelled === "v3TcsDialogTitle", "Studio dialog has a programmatic name");
  check(state.activeInside, "Studio focus enters the dialog");
  check(state.saveEnabled && state.shareReady, "Studio exposes a ready Save or native Share action");
  check(!state.shareStyle.hidden && state.shareStyle.background === "rgb(37, 99, 235)" && state.shareStyle.color === "rgb(255, 255, 255)", "Studio native Share is visibly primary before the platform attempt");
  check(state.advancedClosed, "Studio keeps JSON compatibility controls secondary");
  check(state.facts.join(",") === "0,0,0", "Studio reports exact zero-audio package facts");
  check(state.panelInside && state.overflow <= 0, "Studio share dialog fits 380px without horizontal overflow");
  check(state.minAction >= 44, "Studio share actions meet the 44px target floor");
  const studioDownloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.click("#v3TcsBtnNative");
  const studioDownload = await studioDownloadPromise;
  const studioDownloadPath = await studioDownload.path();
  const studioZip = fs.readFileSync(studioDownloadPath);
  const studioFallback = await page.evaluate(() => {
    const share = document.getElementById("v3TcsBtnNative");
    const save = document.getElementById("v3TcsBtnZip");
    return {
      shareHidden: share.hidden,
      saveEnabled: !save.disabled,
      savePrimary: save.classList.contains("btn-primary"),
      status: document.getElementById("v3TcsStatus").textContent.trim(),
    };
  });
  check(studioDownload.suggestedFilename().endsWith("-learning.zip") && studioZip[0] === 0x50 && studioZip[1] === 0x4b, "Studio platform failure physically downloads the prepared ZIP fallback");
  check(studioFallback.shareHidden && studioFallback.saveEnabled && studioFallback.savePrimary, "Studio retires the failed Share action and promotes Save");
  check(studioFallback.status.includes("браузер начал сохранять ZIP"), "Studio announces the actionable save fallback in Russian");
  await page.screenshot({ path: path.join(OUT, "studio-send-or-save-380-ru.png") });
  for (let i = 0; i < 12; i += 1) await page.keyboard.press("Tab");
  const studioFocus = await page.evaluate(() => ({
    inside: document.getElementById("v3TextCardShareModal").contains(document.activeElement),
    id: document.activeElement && document.activeElement.id,
    tag: document.activeElement && document.activeElement.tagName,
    text: document.activeElement && document.activeElement.textContent && document.activeElement.textContent.trim().slice(0, 60),
  }));
  check(studioFocus.inside, "Studio Tab focus stays in the dialog: " + JSON.stringify(studioFocus));
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => document.getElementById("v3TextCardShareModal").classList.contains("hidden") && document.activeElement.id === "massAccessShareTrigger"), "Studio Escape closes and restores focus");
  check(errors.length === 0, "Studio has no page errors: " + errors.join(" | "));
  await context.close();
}

async function roomGate(browser) {
  console.log("[I3] Room: open isolated context");
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  await page.addInitScript(() => {
    localStorage.setItem("app.locale", "he");
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    } });
  });
  await page.goto(BASE + "/library.html#room=hub", { waitUntil: "load", timeout: 60000 });
  console.log("[I3] Room: shell loaded");
  await page.waitForFunction(() => window.__roomReady === true && document.getElementById("tabCorpus"), { timeout: 30000 });
  await seedOwnText(page, "mass-access-i3-room", "שיר לימודי — fixture");
  console.log("[I3] Room: fixture seeded");
  // This gate owns only the My Texts adapter. Enter the Library track directly
  // so a transient Ben-Yehuda root fetch cannot relabel a Share regression as a
  // corpus-catalog failure in the isolated profile.
  await page.evaluate(() => {
    const tab = document.getElementById("tabCorpus");
    if (tab) { tab.hidden = false; tab.click(); }
  });
  await page.waitForSelector('.learning-corpus-entry[data-corpus="mytexts"]', { timeout: 20000 });
  await page.click('.learning-corpus-entry[data-corpus="mytexts"]');
  await page.waitForSelector(".mytexts-grid .mytext-card-v", { timeout: 20000 });
  console.log("[I3] Room: My texts rendered");
  const card = page.locator(".mytexts-grid .mytext-card-v").filter({ hasText: "שיר לימודי" }).first();
  await card.locator(".mytext-secondary summary").click();
  await card.locator(".mytext-share").click();
  await page.waitForFunction(() => {
    const node = document.querySelector(".room-share-status");
    return node && ["ready", "partial", "error"].includes(node.dataset.state);
  }, { timeout: 30000 });
  console.log("[I3] Room: ZIP terminal state");
  const state = await page.evaluate(() => {
    const dialog = document.querySelector(".room-share-sheet");
    const overlay = document.querySelector(".room-share-ov");
    const rect = dialog.getBoundingClientRect();
    const save = dialog.querySelector(".room-share-action:not([hidden]):last-child");
    const visibleActions = Array.from(dialog.querySelectorAll(".room-share-action")).filter((node) => !node.hidden);
    return {
      dir: document.documentElement.dir,
      role: dialog.getAttribute("role"), labelled: !!document.getElementById(dialog.getAttribute("aria-labelledby")),
      activeInside: dialog.contains(document.activeElement),
      status: dialog.querySelector(".room-share-status").dataset.state,
      facts: Array.from(dialog.querySelectorAll("[data-share-fact]")).map((node) => node.textContent.trim()),
      saveEnabled: save && !save.disabled,
      minAction: Math.min(...visibleActions.map((node) => node.getBoundingClientRect().height)),
      panelInside: rect.left >= 0 && rect.right <= innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      overlayPresent: !!overlay,
    };
  });
  check(state.dir === "rtl", "Room uses Hebrew RTL");
  check(state.role === "dialog" && state.labelled, "Room dialog has a programmatic name");
  check(state.activeInside, "Room focus enters the dialog");
  check(state.status === "ready", "Room prepares a complete zero-audio learning ZIP");
  check(state.facts.join(",") === "0,0,0", "Room reports exact zero-audio package facts");
  check(state.saveEnabled && state.minAction >= 44, "Room exposes an enabled 44px Save action");
  check(state.panelInside && state.overflow <= 0 && state.overlayPresent, "Room share sheet fits 380px without horizontal overflow");
  const roomDownloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.click(".room-share-action.primary");
  const roomDownload = await roomDownloadPromise;
  const roomDownloadPath = await roomDownload.path();
  const roomZip = fs.readFileSync(roomDownloadPath);
  const roomFallback = await page.evaluate(() => {
    const dialog = document.querySelector(".room-share-sheet");
    const buttons = dialog.querySelectorAll(".room-share-action");
    return {
      shareHidden: buttons[0].hidden,
      saveEnabled: !buttons[1].disabled,
      savePrimary: buttons[1].classList.contains("primary"),
      status: dialog.querySelector(".room-share-status").textContent.trim(),
    };
  });
  check(roomDownload.suggestedFilename().endsWith("-learning.zip") && roomZip[0] === 0x50 && roomZip[1] === 0x4b, "Room platform failure physically downloads the prepared ZIP fallback");
  check(roomFallback.shareHidden && roomFallback.saveEnabled && roomFallback.savePrimary, "Room retires the failed Share action and promotes Save");
  check(roomFallback.status.includes("הדפדפן התחיל לשמור"), "Room announces the actionable save fallback in Hebrew");
  await page.screenshot({ path: path.join(OUT, "room-send-or-save-380-he-rtl.png") });
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("Tab");
  check(await page.evaluate(() => document.querySelector(".room-share-sheet").contains(document.activeElement)), "Room Tab focus stays in the dialog");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => !document.querySelector(".room-share-ov") && document.activeElement.classList.contains("room-row-more")), "Room Escape closes and restores focus to More actions");
  check(errors.length === 0, "Room has no page errors: " + errors.join(" | "));
  await context.close();
}

(async () => {
  const studioOnly = process.argv.includes("--studio-only");
  const roomOnly = process.argv.includes("--room-only");
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer();
  if (!(await ready())) {
    console.error(server.logs.join(""));
    await stopServer(server.child);
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    if (!roomOnly) await studioGate(browser);
    if (!studioOnly) await roomGate(browser);
  } finally {
    await browser.close();
    await stopServer(server.child);
  }
  if (failures.length) {
    console.error(`MASS_ACCESS_I3_SHARE_BROWSER FAIL (${failures.length}/${checks})`);
    failures.forEach((failure) => console.error(" - " + failure));
    process.exit(1);
  }
  console.log(`MASS_ACCESS_I3_SHARE_BROWSER PASS (${checks}/${checks})`);
  console.log(" screenshots=" + OUT);
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
