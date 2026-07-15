#!/usr/bin/env node
"use strict";

// Wave 2 C3a live-page UI gate. Opens the real Room/Studio sheets at 380x844
// in ru/en/he with a fake browser SpeechRecognition implementation. No real
// microphone or learner-content request is used.
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3289;
const BASE = `http://127.0.0.1:${PORT}`;
const SENTINEL = "סוד־קולי־c3a";
const failures = [];
let checks = 0;
const eq = (c, m) => { checks++; if (!c) failures.push(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT), C3A_VOICE_ENABLED: "true" }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c)));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => { const tm = setTimeout(() => resolve(false), 5000); child.once("exit", () => { clearTimeout(tm); resolve(true); }); });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function ready(ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if ((await fetch(BASE + "/healthz")).status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function inspectSurface(browser, locale, surface) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
  await ctx.addInitScript(({ locale }) => {
    localStorage.setItem("app.locale", locale);
    class FakeRecognition {
      constructor() { window.__c3aFakeRecognition = this; }
      start() {}
      stop() { if (this.onend) this.onend(); }
      abort() { if (this.onend) this.onend(); }
      emit(text) {
        if (this.onresult) this.onresult({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true, length: 1 }] });
      }
    }
    window.SpeechRecognition = FakeRecognition;
  }, { locale });
  const page = await ctx.newPage();
  const roleplayTurns = [];
  const pageErrors = [];
  page.on("request", (r) => { if (r.url().includes("/api/agent/roleplay/turn")) roleplayTurns.push(r.url()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const isRoom = surface === "room";
  await page.goto(BASE + (isRoom ? "/library.html" : "/index.html"), { waitUntil: "load", timeout: 60000 });
  const hook = isRoom ? "__c3aEnsureRoomTalkSheet" : "__c3aEnsureStudioTalkSheet";
  await page.waitForFunction((name) => typeof window[name] === "function", hook, { timeout: 30000 });
  await page.evaluate(({ hook, isRoom }) => {
    const sheet = window[hook]();
    sheet.hidden = false;
    const feed = sheet.querySelector(isRoom ? ".room-talk-feed" : ".sa-talk-feed");
    const passage = sheet.querySelector(isRoom ? ".room-talk-passage-body" : "#saTalkPassageBody");
    if (passage) passage.textContent = "הקטע נשאר זמין לעיון";
    if (feed) {
      const mentor = document.createElement("div"); mentor.className = isRoom ? "room-talk-m" : "sa-talk-m";
      mentor.textContent = "מה דעתכם על הקטע?"; mentor.setAttribute("lang", "he"); feed.appendChild(mentor);
    }
  }, { hook, isRoom });
  const buttonSel = isRoom ? ".room-talk-voice" : "#saTalkVoice";
  const inputSel = isRoom ? ".room-talk-input" : "#saTalkInput";
  const statusSel = isRoom ? ".room-talk-voice-status" : "#saTalkVoiceStatus";
  const sendSel = isRoom ? ".room-talk-send" : "#saTalkSend";
  const cardSel = isRoom ? ".room-talk-card" : ".sa-talk-card";
  await page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.hidden; }, buttonSel, { timeout: 10000 });
  await page.fill(inputSel, "טיוטה");
  await page.click(buttonSel);
  await page.evaluate((sentinel) => window.__c3aFakeRecognition.emit(sentinel), SENTINEL);
  const result = await page.evaluate(({ locale, inputSel, statusSel, buttonSel, sendSel, cardSel }) => {
    const input = document.querySelector(inputSel), status = document.querySelector(statusSel);
    const mic = document.querySelector(buttonSel), send = document.querySelector(sendSel), card = document.querySelector(cardSel);
    const box = card.getBoundingClientRect();
    const micBox = mic.getBoundingClientRect(), sendBox = send.getBoundingClientRect();
    return {
      dir: document.documentElement.dir,
      value: input.value,
      status: status.textContent,
      micLabel: mic.getAttribute("aria-label"),
      cardInside: box.left >= -1 && box.right <= 381 && box.bottom <= 845,
      controlsVisible: micBox.width >= 40 && sendBox.width >= 40 && micBox.bottom <= 845 && sendBox.bottom <= 845,
      locale,
    };
  }, { locale, inputSel, statusSel, buttonSel, sendSel, cardSel });
  eq(result.dir === (locale === "he" ? "rtl" : "ltr"), `${surface}/${locale}: document direction must match locale`);
  eq(result.value === "טיוטה " + SENTINEL, `${surface}/${locale}: speech must remain an editable appended draft`);
  eq(result.status.length > 10 && result.micLabel.length > 4, `${surface}/${locale}: localized status and accessible mic label must be visible`);
  eq(result.cardInside && result.controlsVisible, `${surface}/${locale}: sheet and controls must fit 380x844`);
  eq(roleplayTurns.length === 0, `${surface}/${locale}: recognition must not auto-send a role-play turn`);
  eq(pageErrors.length === 0, `${surface}/${locale}: live page must have no page errors (${pageErrors.join(" | ")})`);
  await page.screenshot({ path: path.join(REPO, `c3a-${surface}-${locale}-380x844.png`), fullPage: false });
  await ctx.close();
}

(async () => {
  let playwright;
  try { playwright = require("playwright"); } catch (e) { console.error("[voice-draft-browser-smoke] playwright missing:", e.message); process.exit(1); }
  const server = startServer();
  if (!(await ready())) { console.error("[voice-draft-browser-smoke] server failed\n" + server.logs.join("")); await stopServer(server.child); process.exit(1); }
  const browser = await playwright.chromium.launch();
  try {
    for (const locale of ["ru", "en", "he"]) {
      await inspectSurface(browser, locale, "room");
      await inspectSurface(browser, locale, "studio");
    }
    eq(!server.logs.join("").includes(SENTINEL), "recognized sentinel must be absent from server stdout/stderr");
  } finally {
    await browser.close();
    await stopServer(server.child);
  }
  if (failures.length) {
    console.error(`[voice-draft-browser-smoke] FAIL ${checks - failures.length}/${checks}`);
    failures.forEach((f) => console.error(" - " + f));
    process.exit(1);
  }
  console.log(`[voice-draft-browser-smoke] PASS ${checks}/${checks}`);
})().catch((e) => { console.error(e); process.exit(1); });
