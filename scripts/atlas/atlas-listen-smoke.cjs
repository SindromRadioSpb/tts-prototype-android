"use strict";
// Listening in a real browser (P3 V3): buttons only where recordings exist, real MP3 playback, the mini-player on
// phone and desktop in RU and HE, no horizontal scroll, no page errors.
//   node scripts/atlas/atlas-listen-smoke.cjs <base> [outDir] [--section s09-belt --page 197]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert/strict");

(async () => {
  const base = process.argv[2] || "http://127.0.0.1:3411";
  const out = path.resolve(process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : ".tmp/atlas-listen-browser");
  const arg = (name, fb) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fb; };
  const section = arg("section", "s09-belt"), pageNo = Number(arg("page", "197"));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const report = [];
  try {
    for (const lang of ["ru", "he"]) for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [], audioRequests = [], failed = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + new URL(r.url()).pathname); });
      page.on("request", (r) => { if (/\/api\/audio\//.test(r.url())) audioRequests.push(r.url()); });
      if (new URL(base).hostname !== "linguistpro.kolosei.com") await page.route("**/data/atlas/a97002/assets/**", async (route) => {
        try { await route.fulfill({ response: await route.fetch({ url: "https://linguistpro.kolosei.com" + new URL(route.request().url()).pathname }) }); }
        catch { await route.abort(); }
      });
      await page.goto(base + "/library.html#room=atlas%3Aa97002");
      await page.waitForSelector(".atlas-home");
      await page.locator("select").filter({ has: page.locator('option[value="he"]') }).first().selectOption(lang);
      await page.locator(`[data-section="${section}"]`).click();
      await page.waitForSelector(".atlas-listen-btn", { timeout: 15000 });
      const says = await page.locator(".atlas-say").count();
      await page.locator(".atlas-pagejump input").fill(String(pageNo));
      await page.locator(".atlas-pagejump input").press("Enter");
      await page.waitForTimeout(800);
      await page.locator(".atlas-listen-btn").click();
      await page.waitForSelector(".atlas-player");
      // the audio element plays a real recording
      const played = await page.waitForFunction(() => {
        const el = document.querySelector(".atlas-speaking");
        return el ? el.getAttribute("data-ref") : null;
      }, null, { timeout: 10000 }).then((h) => h.jsonValue());
      await page.waitForTimeout(2500);
      const status = await page.locator(".atlas-player-status").textContent();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const playerBox = await page.locator(".atlas-player").boundingBox();
      await page.screenshot({ path: path.join(out, `${lang}-${width}-player.png`) });
      // next / pause / close
      await page.locator('.atlas-player [data-act="next"]').click();
      await page.waitForTimeout(600);
      const second = await page.locator(".atlas-speaking").getAttribute("data-ref");
      await page.locator('.atlas-player [data-act="toggle"]').click();
      const pausedLabel = await page.locator('.atlas-player [data-act="toggle"]').getAttribute("aria-label");
      await page.locator('.atlas-player [data-act="close"]').click();
      const closed = await page.locator(".atlas-player").count();
      // one formula
      let formula = null;
      if (says) {
        const say = page.locator(".atlas-say").first();
        await say.scrollIntoViewIfNeeded();
        await say.click();
        await page.waitForTimeout(1500);
        formula = { pressed: await say.getAttribute("aria-pressed"), player: await page.locator(".atlas-player").count() };
        await page.locator(".atlas-back").click();
      }
      await page.waitForTimeout(300);
      const row = { lang, width, says, played, second, status, overflow, playerBox, pausedLabel, closed, formula,
        audioRequests: audioRequests.length, errors, failed };
      // the Room asks for the signed-in user (401 for a guest) and optional files; the atlas itself must not fail
      report.push(row);
      assert.deepEqual(failed.filter((f) => /\/data\/atlas\/|\/api\/audio\//.test(f)), [], "atlas and audio requests succeed");
      assert.ok(played && second && second !== played, "plays and moves on");
      assert.ok(overflow <= 0, "no horizontal scroll");
      assert.ok(playerBox && playerBox.x >= 0 && playerBox.x + playerBox.width <= width, "player inside the screen");
      assert.equal(closed, 0);
      assert.ok(audioRequests.length >= 2, "recordings requested");
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(report.map((r) => ({ lang: r.lang, width: r.width, says: r.says, status: r.status, overflow: r.overflow, formula: r.formula, errors: r.errors.length, failed: r.failed })), null, 1));
})().catch((e) => { console.error(e); process.exitCode = 1; });
