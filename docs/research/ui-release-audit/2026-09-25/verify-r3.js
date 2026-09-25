"use strict";
// R3 verification: named status chips in the word card (study table of a real public video material).
const { chromium } = require("playwright");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const L = require("./lib");
const PROD = "https://linguistpro.kolosei.com";
(async () => {
  const [,, tag, w, loc, dark] = process.argv;
  const width = Number(w), mobile = width < 600;
  fs.mkdirSync(path.join(__dirname, "R3", "after"), { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r3-")), { viewport: { width, height: 800 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: dark ? "dark" : "light" });
  const page = ctx.pages()[0] || await ctx.newPage();
  await ctx.route(/\/api\/(public-corpora|publication|mediatheque)/, async (route) => {
    const u = new URL(route.request().url());
    const r = await fetch(PROD + u.pathname + u.search);
    const headers = {}; r.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) headers[k] = v; });
    await route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
  });
  await page.addInitScript((l) => { localStorage.setItem("onboardingSeen_v1", "1"); if (l) localStorage.setItem("app.locale", l); }, loc || "ru");
  await page.goto(L.BASE + "/mediatheque.html"); await page.waitForTimeout(5000);
  await page.locator("a,button").filter({ hasText: /Изучать|ללמוד|Study/ }).first().click(); await page.waitForTimeout(9000);
  await page.locator("#proTable td[data-col=niqqud] .rm-w, #proTable td[data-col=niqqud] [data-word]").nth(Number(process.env.R_WORD || 0)).click().catch((e) => console.log("tap", String(e).slice(0, 100)));
  await page.waitForTimeout(2500);
  console.log("MODAL_AFTER_TAP", await page.evaluate(() => !!document.querySelector(".room-consent")));
  const consent = page.locator(".room-consent button").first();
  if (await consent.count() && await consent.isVisible()) { await consent.click(); await page.waitForTimeout(2000); }
  // A fresh profile downloads the morphology dictionary on the first tap; wait for the card.
  await page.waitForSelector(".rm-status-btn", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await L.shot(page, `../R3/after/card-${tag}`);
  console.log("MODAL", await page.evaluate(() => !!document.querySelector(".room-consent")), "REFINE", await page.evaluate(() => !!document.querySelector("[data-rm-refine]")));
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".rm-status-btn")].filter((b) => b.offsetWidth).map((b) => {
    const s = getComputedStyle(b), r = b.getBoundingClientRect();
    return b.textContent.trim() + " " + Math.round(r.width) + "x" + Math.round(r.height) + " " + s.color + " on " + s.backgroundColor;
  }))));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
