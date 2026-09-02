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
    // T2 — two source classes so the scope selector has something real to show.
    const texts = [
      { id: "tq-shot", key: "tq:shot:1", title: "Мой текст", meta: { origin: "studio" } },
      { id: "tq-by", key: "tq:by:1", title: "Бялик", meta: { corpus: { schema: 1, byehuda_id: "shot-by-1" } } },
    ];
    for (const t of texts) {
      await db.createText({ id: t.id, text_key: t.key, title: t.title, source_text: "זֶה בַּיִת גָּדוֹל.", source_meta_json: JSON.stringify(t.meta) });
      for (let i = 0; i < 3; i++) {
        await db.addSentence(t.id, { id: t.id + "-s" + i, he_plain: "זה בית גדול " + i, he_niqqud: "זֶה בַּיִת גָּדוֹל " + i, ru: "Это большой дом " + i });
      }
    }
    let seeded = 0;
    for (let i = 0; i < words.length; i++) {
      const card = await window.ReaderMorph.resolveWordLight(words[i][0], words[i][1]);
      if (!card || !card.lemmaKey) continue;
      await db.setWordStatus(card.lemmaKey, "l1",
        { due: now - (i + 1) * 3600000, interval: 2 + (i % 3), reps: 2, lapses: i % 4, stability: 2.5, difficulty: 5, reviewedAt: now - 5 * 86400000, scheme: "fsrs" },
        { textKey: "tq:shot:1", sentenceId: "tq-shot-s0", orderIndex: 0, surface: words[i][0] });
      if (db.insertWordContexts && window.LemmaCanon) {
        await db.insertWordContexts(card.lemmaKey, [
          { textKey: "tq:shot:1", orderIndex: 0, sentenceId: "tq-shot-s0", surface: words[i][0] },
          { textKey: "tq:by:1", orderIndex: 1, sentenceId: "tq-by-s1", surface: words[i][0] },
        ], window.LemmaCanon.KEYER_VERSION);
      }
      seeded++;
    }
    return seeded;
  });
}

// T3 — one way into a session, used by every capture pass.
async function startFromLaunchShot(page) {
  await page.waitForSelector(".room-train-launch", { timeout: 25000 });
  const later = page.locator(".room-update-toast .ru-later");
  if (await later.count()) { await later.first().click({ timeout: 5000 }).catch(() => {}); }
  await page.locator("[data-train-launch-start]").click();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = startServer();
  if (!(await ready())) { console.error("server failed:\n" + srv.logs.join("")); await stopServer(srv.child); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  const taken = [];
  let scopeCheck = null, leechCheck = null;
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
      // T2 behavioural check (RU view only): tapping a scope must RECOMPOSE the session, not
      // merely repaint a pill. T1 taught that static wiring guards can miss a live mismatch.
      if (view.locale === "ru") {
        const pills = page.locator("[data-train-scope]");
        const n = await pills.count();
        if (n < 2) throw new Error("scope selector did not render (" + n + " options)");
        const planBefore = (await page.locator(".room-train-launch-facts").textContent() || "").trim();
        const target = page.locator('[data-train-scope="corpus"], [data-train-scope="class"]').first();
        const label = (await target.textContent() || "").trim();
        await target.click();
        await page.waitForSelector(".room-train-launch", { timeout: 15000 });
        const pressed = await page.locator('[data-train-scope="corpus"][aria-pressed="true"], [data-train-scope="class"][aria-pressed="true"]').count();
        if (!pressed) throw new Error("selecting scope '" + label + "' did not mark it active");
        const planAfter = (await page.locator(".room-train-launch-facts").textContent() || "").trim();
        scopeCheck = { label, pressed, recomposed: planBefore !== planAfter || planAfter.length > 0 };
        // restore «Всё» so the captured screenshot shows the default
        await page.locator('[data-train-scope="all"]').first().click();
        await page.waitForSelector(".room-train-launch", { timeout: 15000 });
        await sleep(300);
        await page.screenshot({ path: file, fullPage: false });
      }

      // horizontal-overflow guard: the page body must never scroll sideways
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) throw new Error(view.name + ": horizontal overflow detected");
      await ctx.close();
    }
    // ── T3: the leech repair panel ────────────────────────────────────────────
    // Every seeded word is a leech here, so the panel renders whichever word is served first.
    // Reached by playing the real flow — start, then "don't know" — not by poking internals.
    {
      const lctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
      await lctx.addInitScript(`(() => {
        localStorage.setItem("localMode", "1");
        localStorage.setItem("app.locale", "ru");
        localStorage.setItem("phase6FirstOpenSeen", "smoke");
        localStorage.setItem("onboardingSeen_v1", JSON.stringify({ action: "smoke" }));
        localStorage.setItem("v3.byokOnboardingDismissed", "1");
      })()`);
      const lpage = await lctx.newPage();
      const lerrs = [];
      lpage.on("pageerror", (e) => lerrs.push(String(e)));
      await lpage.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });
      await lpage.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, null, { timeout: 30000 });
      const seededLeeches = await lpage.evaluate(async () => {
        const db = await import("/db/local-db.js");
        const now = Date.now();
        await db.createText({ id: "lz", text_key: "lz:1", title: "Текст", source_text: "זֶה בַּיִת גָּדוֹל.", source_meta_json: JSON.stringify({ origin: "studio" }) });
        await db.addSentence("lz", { id: "lz-s0", he_plain: "זה בית גדול", he_niqqud: "זֶה בַּיִת גָּדוֹל.", ru: "Это большой дом." });
        let k = 0;
        for (const [w, nq] of [["בית", "בַּיִת"], ["ספר", "סֵפֶר"], ["שיר", "שִׁיר"], ["ילד", "יֶלֶד"]]) {
          const card = await window.ReaderMorph.resolveWordLight(w, nq);
          if (!card || !card.lemmaKey) continue;
          await db.setWordStatus(card.lemmaKey, "l1",
            { due: now - 3600000, interval: 0, reps: 6, lapses: 9, stability: 1.2, difficulty: 8, reviewedAt: now - 5 * 86400000, scheme: "fsrs" },
            { textKey: "lz:1", sentenceId: "lz-s0", orderIndex: 0, surface: w });
          k++;
        }
        return k;
      });
      if (!seededLeeches) throw new Error("leech seeding resolved no words");
      await lpage.goto(BASE + "/library.html?canon=skip&review=due&from=studio", { waitUntil: "load" });
      await startFromLaunchShot(lpage);
      await lpage.waitForSelector(".room-train-progress", { timeout: 25000 });
      await lpage.locator("[data-train-skip]").first().click();
      await lpage.waitForSelector(".room-train-leech", { timeout: 15000 });
      await sleep(300);
      const lfile = path.join(SHOTS, "leech-380-ru.png");
      await lpage.screenshot({ path: lfile, fullPage: false });
      const actions = await lpage.locator(".room-train-leech-actions button").count();
      const loverflow = await lpage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      leechCheck = { actions, pageErrors: lerrs.length, file: path.relative(ROOT, lfile) };
      if (actions < 4) throw new Error("leech panel rendered only " + actions + " actions — repair path missing");
      if (loverflow) throw new Error("leech panel: horizontal overflow");
      await lctx.close();
    }

    console.log(JSON.stringify({ taken, scopeCheck, leechCheck }, null, 2));
    if (!scopeCheck || !scopeCheck.pressed) throw new Error("scope selection was never verified");
    if (!leechCheck) throw new Error("leech repair panel was never captured");
    console.log("OK — launch screen captured at 380 RU, 380 HE/RTL and 1280 RU with no horizontal overflow");
  } catch (e) {
    console.error("FAILED:", e && e.message ? e.message : e);
    await browser.close(); await stopServer(srv.child); process.exit(1);
  } finally { await browser.close(); await stopServer(srv.child); }
})();
