#!/usr/bin/env node
"use strict";
// train-queue-shots — mandatory pre-commit UI evidence for the T1 launch screen (CLAUDE.md).
// Seeds a due backlog in an isolated OPFS profile, opens the cross-text review, and captures
// the launch screen at 380px RU, 380px HE/RTL and 1280px RU.
//
// Run: node scripts/premium/train-queue-shots.js
// Output: docs/research/room-trainer-maturity/2026-09-02/screenshots/

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3319;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "docs", "research", "room-trainer-maturity", "2026-09-02", "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  child.stdout.on("data", (x) => logs.push(String(x)));
  child.stderr.on("data", (x) => logs.push(String(x)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const done = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); child.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!done && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready() {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {} await sleep(200); }
  return false;
}

// Seed enough due words that the queue is genuinely backlogged and the load line has something
// honest to say. Intervals are short so the inflow exceeds a modest daily cap.
async function seed(page) {
  return page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    const now = Date.now();
    const words = [
      ["בית", "בַּיִת"], ["ספר", "סֵפֶר"], ["שיר", "שִׁיר"], ["ילד", "יֶלֶד"], ["דרך", "דֶּרֶךְ"],
      ["עיר", "עִיר"], ["לילה", "לַיְלָה"], ["שמש", "שֶׁמֶשׁ"], ["מים", "מַיִם"], ["ארץ", "אֶרֶץ"],
    ];
    await db.createText({ id: "tq-shot", text_key: "tq:shot:1", title: "Fixture", source_text: "זֶה בַּיִת גָּדוֹל.", source_meta_json: JSON.stringify({ origin: "studio" }) });
    await db.addSentence("tq-shot", { id: "tq-shot-s0", he_plain: "זה בית גדול", he_niqqud: "זֶה בַּיִת גָּדוֹל.", ru: "Это большой дом." });
    let seeded = 0;
    for (let i = 0; i < words.length; i++) {
      const card = await window.ReaderMorph.resolveWordLight(words[i][0], words[i][1]);
      if (!card || !card.lemmaKey) continue;
      await db.setWordStatus(card.lemmaKey, "l1",
        { due: now - (i + 1) * 3600000, interval: 2 + (i % 3), reps: 2, lapses: i % 4, stability: 2.5, difficulty: 5, reviewedAt: now - 5 * 86400000, scheme: "fsrs" },
        { textKey: "tq:shot:1", sentenceId: "tq-shot-s0", orderIndex: 0, surface: words[i][0] });
      seeded++;
    }
    return seeded;
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = startServer();
  if (!(await ready())) { console.error("server failed:\n" + srv.logs.join("")); await stopServer(srv.child); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  const taken = [];
  try {
    for (const view of [
      { name: "launch-380-ru", w: 380, h: 844, locale: "ru" },
      { name: "launch-380-he-rtl", w: 380, h: 844, locale: "he" },
      { name: "launch-desktop-ru", w: 1280, h: 900, locale: "ru" },
    ]) {
      const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: view.w, height: view.h } });
      await ctx.addInitScript(`(() => {
        localStorage.setItem("localMode", "1");
        localStorage.setItem("app.locale", ${JSON.stringify(view.locale)});
        localStorage.setItem("phase6FirstOpenSeen", "smoke");
        localStorage.setItem("onboardingSeen_v1", JSON.stringify({ action: "smoke" }));
        localStorage.setItem("v3.byokOnboardingDismissed", "1");
        localStorage.setItem("room.trainPrefs.v1", JSON.stringify({ sessionSize: 20, reviewsPerDay: 5, newPerDay: 10 }));
      })()`);
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });
      await page.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, null, { timeout: 30000 });
      const n = await seed(page);
      if (!n) throw new Error("seeding resolved no words");
      // Re-enter through the canonical Studio→Room deep-link so the launch screen is reached
      // exactly the way a learner reaches it, not by poking internals.
      await page.goto(BASE + "/library.html?canon=skip&review=due&from=studio", { waitUntil: "load" });
      await page.waitForSelector(".room-train-launch", { timeout: 25000 });
      await sleep(400);
      const file = path.join(SHOTS, view.name + ".png");
      await page.screenshot({ path: file, fullPage: false });
      taken.push({ file: path.relative(ROOT, file), seeded: n, pageErrors: errs.length });
      // horizontal-overflow guard: the page body must never scroll sideways
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) throw new Error(view.name + ": horizontal overflow detected");
      await ctx.close();
    }
    console.log(JSON.stringify(taken, null, 2));
    console.log("OK — launch screen captured at 380 RU, 380 HE/RTL and 1280 RU with no horizontal overflow");
  } catch (e) {
    console.error("FAILED:", e && e.message ? e.message : e);
    await browser.close(); await stopServer(srv.child); process.exit(1);
  } finally { await browser.close(); await stopServer(srv.child); }
})();
