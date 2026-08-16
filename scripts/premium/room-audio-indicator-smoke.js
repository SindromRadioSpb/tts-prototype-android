#!/usr/bin/env node
"use strict";

// Isolated browser regression gate for Studio-parity row-audio indicators in the
// embedded Reading Room. Uses fixture-only OPFS rows and a mocked BYOK TTS response;
// it never touches production or owner data.

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3298;
const BASE = `http://127.0.0.1:${PORT}`;
const TEXT_ID = "rt-room-audio-indicator";
const TEXT_KEY = "rt-room-audio-indicator-key";
const READY_SENTENCE_ID = TEXT_ID + "-s0";
const FRESH_SENTENCE_ID = TEXT_ID + "-s1";
const READY_KEY = "rt-audio-ready-key";
const FRESH_KEY = "rt-audio-fresh-key";
const LOCALE = ((process.argv.find((arg) => arg.startsWith("--locale=")) || "--locale=ru").split("=")[1] || "ru").toLowerCase();
const SHOT_DIR = process.env.ROOM_AUDIO_SHOT_DIR ? path.resolve(process.env.ROOM_AUDIO_SHOT_DIR) : "";
const DESKTOP = process.argv.includes("--desktop");
const ERROR_CASE = process.argv.includes("--error");
const VIEWPORT = DESKTOP ? { width: 1440, height: 1000 } : { width: 380, height: 844 };
const ROW_LABELS = {
  ru: { play: "Озвучить строку", loading: "Загрузка аудио строки", stop: "Остановить аудио строки", retry: "Повторить озвучивание строки" },
  en: { play: "Play row audio", loading: "Loading row audio", stop: "Stop row audio", retry: "Retry row audio" },
  he: { play: "השמעת השורה", loading: "השמע של השורה נטען", stop: "עצירת השמע של השורה", retry: "ניסיון חוזר להשמעת השורה" },
};

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function textDeepLink(textId) {
  const payload = Buffer.from(JSON.stringify({ v: 1, type: "text", id: textId }), "utf8")
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "/index.html#/t/" + payload;
}
function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"],
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
  if (!exited) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  }
}
async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (err) { console.error("[room-audio-indicator-smoke] playwright missing:", err.message); process.exit(1); }

  const server = startServer();
  if (!(await waitReady())) {
    server.logs.forEach((line) => process.stderr.write(line));
    await stopServer(server.child);
    process.exit(1);
  }

  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: VIEWPORT });
  await ctx.addInitScript(() => {
    class QuietAudio {
      constructor() { this.paused = true; this.currentTime = 0; this.ended = false; this._events = {}; }
      addEventListener(type, fn) { (this._events[type] ||= []).push(fn); }
      removeEventListener() {}
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    }
    window.Audio = QuietAudio;
  });
  if (ERROR_CASE) {
    await ctx.addInitScript(() => {
      try { delete window.speechSynthesis; } catch (_) { window.speechSynthesis = null; }
      try { delete window.SpeechSynthesisUtterance; } catch (_) { window.SpeechSynthesisUtterance = undefined; }
    });
  }
  const page = await ctx.newPage();
  const pageErrors = [];
  let pendingTtsRoute = null;
  let resolveTtsRoute;
  const ttsRouteSeen = new Promise((resolve) => { resolveTtsRoute = resolve; });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.route("**/api/tts", async (route) => {
    pendingTtsRoute = route;
    resolveTtsRoute();
  });
  await page.route("**/api/audio/**/timing", async (route) => route.fulfill({ status: 404, body: "" }));

  try {
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.ensureLocalDB === "function");
    const seeded = await page.evaluate(async ({ textId, textKey, readySid, freshSid, readyKey, locale }) => {
      const db = await window.ensureLocalDB();
      try { await db.dbRun("DELETE FROM sentence_audio WHERE sentence_id IN (?,?)", [readySid, freshSid]); } catch (_) {}
      try { await db.dbRun("DELETE FROM sentences WHERE text_id = ?", [textId]); } catch (_) {}
      try { await db.dbRun("DELETE FROM texts WHERE id = ?", [textId]); } catch (_) {}
      try { await db.dbRun("DELETE FROM audio_assets WHERE asset_key IN (?,?)", [readyKey, "rt-audio-fresh-key"]); } catch (_) {}
      await db.createText({ id: textId, text_key: textKey, title: "בדיקת מחוון שמע", source_text: "שלום עולם\nמה נשמע" });
      await db.dbRun(
        "INSERT INTO sentences (id,text_id,order_index,he_plain,he_niqqud,translit,ru) VALUES (?,?,?,?,?,?,?)",
        [readySid, textId, 0, "שלום עולם", "שָׁלוֹם עוֹלָם", "shalom olam", "привет мир"]
      );
      await db.dbRun(
        "INSERT INTO sentences (id,text_id,order_index,he_plain,he_niqqud,translit,ru) VALUES (?,?,?,?,?,?,?)",
        [freshSid, textId, 1, "מה נשמע", "מַה נִּשְׁמַע", "ma nishma", "как дела"]
      );
      const asset = await db.upsertAudioAsset({
        id: "rt-audio-ready-id", asset_key: readyKey, asset_type: "row",
        relative_path: "audio-cache/" + readyKey + ".mp3", mime: "audio/mpeg",
        tts_profile_json: JSON.stringify({ language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 0.8, pitch: 2.5 }),
      });
      await db.linkSentenceAudio(readySid, asset.id, 1);
      // Reuse an existing non-default asset row to prove the canonical writer
      // promotes links and refreshes metadata on conflict (Studio uses it too).
      const preexistingFresh = await db.upsertAudioAsset({
        id: "rt-audio-fresh-id", asset_key: "rt-audio-fresh-key", asset_type: "row",
        relative_path: "audio-cache/rt-audio-fresh-key.mp3", mime: "audio/mpeg", tts_profile_json: null,
      });
      await db.linkSentenceAudio(freshSid, preexistingFresh.id, 0);
      localStorage.setItem("v3.gcpTtsApiKey", "fixture-key");
      localStorage.setItem("app.locale", locale);
      return true;
    }, { textId: TEXT_ID, textKey: TEXT_KEY, readySid: READY_SENTENCE_ID, freshSid: FRESH_SENTENCE_ID, readyKey: READY_KEY, locale: LOCALE });
    check("fixture seeded", seeded === true);

    // Baseline the source surface: the same linked row must already paint green
    // in Studio. This guards against "fixing" Room to a broken reference.
    await page.goto(BASE + textDeepLink(TEXT_ID), { waitUntil: "load" });
    await page.waitForSelector("#proTable .row-audio-ind[data-row-idx='0'].state-ok", { state: "attached", timeout: 20000 });
    check("Studio source surface paints the stored row green", true);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    const studioSignatures = await page.evaluate(() => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const out = {};
      for (const state of ["ok", "missing", "mismatch", "too-long", "working"]) {
        const marker = document.createElement("span");
        marker.className = "row-audio-ind state-" + state;
        host.appendChild(marker);
        const style = getComputedStyle(marker);
        out[state] = { borderStyle: style.borderStyle, borderWidth: style.borderWidth, borderRadius: style.borderRadius, animationName: style.animationName };
      }
      host.remove();
      return out;
    });
    check("Studio forced-colors markers retain five non-colour signatures",
      studioSignatures.ok.borderWidth === "1px" &&
      studioSignatures.missing.borderWidth === "2px" &&
      studioSignatures.mismatch.borderStyle === "dashed" &&
      studioSignatures["too-long"].borderRadius === "2px" &&
      studioSignatures.working.borderStyle === "double",
      JSON.stringify(studioSignatures));
    check("Studio reduced motion removes working-marker animation", studioSignatures.working.animationName === "none", JSON.stringify(studioSignatures.working));

    await page.goto(BASE + "/library.html?canon=skip&corpus=skip#room=mytexts", { waitUntil: "load", timeout: 60000 });
    const fixtureCard = page.locator('.mytexts-grid .mytext-card').filter({ hasText: 'בדיקת מחוון שמע' });
    await fixtureCard.locator('.mytext-open').click();
    await page.waitForSelector("#roomReaderTable tr[data-row-idx='1'] .row-tts-btn", { state: "attached", timeout: 20000 });

    const initial = await page.evaluate(() => Array.from(document.querySelectorAll("#roomReaderTable .row-audio-ind")).map((el) => ({
      cls: el.className, label: el.getAttribute("aria-label"), hidden: el.getAttribute("aria-hidden"),
    })));
    check("stored row paints green on first Room render", /state-ok/.test(initial[0] && initial[0].cls), JSON.stringify(initial[0]));
    check("missing row remains neutral", /state-missing/.test(initial[1] && initial[1].cls), JSON.stringify(initial[1]));
    check("indicator exposes a non-colour accessible label", !!(initial[0] && initial[0].label) && initial[0].hidden !== "true", JSON.stringify(initial[0]));
    const roomSignatures = await page.evaluate(() => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const out = {};
      for (const state of ["ok", "missing", "mismatch", "too-long", "working"]) {
        const marker = document.createElement("span");
        marker.className = "row-audio-ind state-" + state;
        host.appendChild(marker);
        const style = getComputedStyle(marker);
        out[state] = { borderStyle: style.borderStyle, borderWidth: style.borderWidth, borderRadius: style.borderRadius, animationName: style.animationName };
      }
      host.remove();
      return out;
    });
    check("Room forced-colors markers retain five non-colour signatures",
      roomSignatures.ok.borderWidth === "1px" && roomSignatures.missing.borderWidth === "2px" &&
      roomSignatures.mismatch.borderStyle === "dashed" && roomSignatures["too-long"].borderRadius === "2px" &&
      roomSignatures.working.borderStyle === "double",
      JSON.stringify(roomSignatures));
    check("Room reduced motion removes working-marker animation", roomSignatures.working.animationName === "none", JSON.stringify(roomSignatures.working));
    const idleButton = await page.locator("#roomReaderTable .row-tts-btn[data-row-idx='1']").evaluate((button) => ({
      state: button.dataset.audioControlState,
      label: button.getAttribute("aria-label"),
      busy: button.getAttribute("aria-busy"),
      pressed: button.getAttribute("aria-pressed"),
    }));
    check("idle row action has the exact localized current name",
      idleButton.state === "idle" && idleButton.label === ROW_LABELS[LOCALE].play && idleButton.busy === "false" && idleButton.pressed === "false",
      JSON.stringify(idleButton));
    check("document direction matches locale", (await page.getAttribute("html", "dir")) === (LOCALE === "he" ? "rtl" : "ltr"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check((DESKTOP ? "desktop" : "380px") + " page has no horizontal overflow", overflow <= 1, "overflow=" + overflow);
    if (SHOT_DIR) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(SHOT_DIR, `room-audio-indicator-${LOCALE}-${DESKTOP ? "desktop" : "380"}.png`), fullPage: true });
    }

    await page.hover("#roomReaderTable tr[data-row-idx='1']");
    await page.click("#roomReaderTable .row-tts-btn[data-row-idx='1']");
    await ttsRouteSeen;
    await page.waitForFunction(() => document.querySelector("#roomReaderTable .row-tts-btn[data-row-idx='1']")?.dataset.audioControlState === "loading");
    const loadingButton = await page.locator("#roomReaderTable .row-tts-btn[data-row-idx='1']").evaluate((button) => ({
      label: button.getAttribute("aria-label"), busy: button.getAttribute("aria-busy"), pressed: button.getAttribute("aria-pressed"), disabled: button.disabled,
    }));
    check("loading row action is named, busy and disabled atomically",
      loadingButton.label === ROW_LABELS[LOCALE].loading && loadingButton.busy === "true" && loadingButton.pressed === "false" && loadingButton.disabled,
      JSON.stringify(loadingButton));
    if (ERROR_CASE) {
      await pendingTtsRoute.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "fixture provider detail must stay private" }) });
      await page.waitForFunction(() => document.querySelector("#roomReaderTable .row-tts-btn[data-row-idx='1']")?.dataset.audioControlState === "error");
      const errorButton = await page.locator("#roomReaderTable .row-tts-btn[data-row-idx='1']").evaluate((button) => ({
        label: button.getAttribute("aria-label"), title: button.title, busy: button.getAttribute("aria-busy"), pressed: button.getAttribute("aria-pressed"), disabled: button.disabled,
      }));
      check("error row action becomes the exact localized Retry action without provider detail",
        errorButton.label === ROW_LABELS[LOCALE].retry && errorButton.title === ROW_LABELS[LOCALE].retry &&
        errorButton.busy === "false" && errorButton.pressed === "false" && !errorButton.disabled &&
        !JSON.stringify(errorButton).includes("fixture provider detail"),
        JSON.stringify(errorButton));
      check("failed TTS leaves the missing marker truthful", await page.locator("#roomReaderTable .row-audio-ind[data-row-idx='1']").evaluate((marker) => marker.classList.contains("state-missing")));
      check("no pageerror", pageErrors.length === 0, pageErrors[0]);
    } else {
      await pendingTtsRoute.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assetKey: FRESH_KEY }) });
      await page.waitForFunction(() => document.querySelector("#roomReaderTable .row-audio-ind[data-row-idx='1']")?.classList.contains("state-ok"));
      await page.waitForFunction(() => document.querySelector("#roomReaderTable .row-tts-btn[data-row-idx='1']")?.dataset.audioControlState === "playing");
    const playingButton = await page.locator("#roomReaderTable .row-tts-btn[data-row-idx='1']").evaluate((button) => ({
      label: button.getAttribute("aria-label"), busy: button.getAttribute("aria-busy"), pressed: button.getAttribute("aria-pressed"), disabled: button.disabled,
    }));
    check("playing row action becomes the exact localized Stop action",
      playingButton.label === ROW_LABELS[LOCALE].stop && playingButton.busy === "false" && playingButton.pressed === "true" && !playingButton.disabled,
      JSON.stringify(playingButton));
      let persisted = false;
      try {
        await page.waitForFunction(async ({ sid, key }) => {
        const db = await import("/db/local-db.js");
        const rows = await db.dbQuery(
          `SELECT aa.asset_key, aa.tts_profile_json FROM sentence_audio sa JOIN audio_assets aa ON aa.id=sa.audio_id WHERE sa.sentence_id=? AND sa.is_default=1`,
          [sid]
        );
        return rows.length === 1 && String(rows[0].asset_key) === key && !!rows[0].tts_profile_json;
        }, { sid: FRESH_SENTENCE_ID, key: FRESH_KEY }, { timeout: 10000 });
        persisted = true;
      } catch (_) {}
      check("successful BYOK TTS repaints the row green", true);
      check("successful BYOK TTS persists through canonical local-db writer", persisted === true);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("#roomReaderTable .row-audio-ind[data-row-idx='1'].state-ok", { state: "attached", timeout: 20000 });
      check("fresh TTS indicator survives Room reload", true);
      check("no pageerror", pageErrors.length === 0, pageErrors[0]);
    }
  } finally {
    try {
      await page.goto(BASE + "/index.html", { waitUntil: "load" });
      await page.waitForFunction(() => typeof window.ensureLocalDB === "function");
      await page.evaluate(async ({ textId, readySid, freshSid, readyKey, freshKey }) => {
        const db = await window.ensureLocalDB();
        try { await db.dbRun("DELETE FROM sentence_audio WHERE sentence_id IN (?,?)", [readySid, freshSid]); } catch (_) {}
        try { await db.dbRun("DELETE FROM sentences WHERE text_id = ?", [textId]); } catch (_) {}
        try { await db.dbRun("DELETE FROM texts WHERE id = ?", [textId]); } catch (_) {}
        try { await db.dbRun("DELETE FROM audio_assets WHERE asset_key IN (?,?)", [readyKey, freshKey]); } catch (_) {}
        localStorage.removeItem("v3.gcpTtsApiKey");
        localStorage.removeItem("app.locale");
      }, { textId: TEXT_ID, readySid: READY_SENTENCE_ID, freshSid: FRESH_SENTENCE_ID, readyKey: READY_KEY, freshKey: FRESH_KEY });
    } catch (_) {}
    await browser.close();
    await stopServer(server.child);
  }

  console.log(`\n[room-audio-indicator-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error("[room-audio-indicator-smoke] fatal", err); process.exit(1); });
