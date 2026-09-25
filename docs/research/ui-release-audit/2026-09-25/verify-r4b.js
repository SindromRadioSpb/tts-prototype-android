"use strict";
// R4b: section header hidden in an open text on a phone without study mode; back restores it.
const { chromium } = require("playwright"); const fs = require("fs"), os = require("os"), path = require("path"); const L = require("./lib");
(async () => {
  const [,, tag, w, loc] = process.argv; const width = +w, mobile = width < 600;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r4b-")), { viewport: { width, height: 800 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = ctx.pages()[0];
  await ctx.route(/\/api\/(public-corpora|publication|mediatheque)/, async (route) => { const u = new URL(route.request().url()); const r = await fetch("https://linguistpro.kolosei.com" + u.pathname + u.search); const h = {}; r.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) h[k] = v; }); await route.fulfill({ status: r.status, headers: h, body: Buffer.from(await r.arrayBuffer()) }); });
  await page.addInitScript((l) => { localStorage.setItem("onboardingSeen_v1", "1"); localStorage.setItem("room.studyMode", "0"); if (l) localStorage.setItem("app.locale", l); }, loc);
  await page.goto(L.BASE + "/mediatheque.html"); await page.waitForTimeout(5000);
  await page.locator("a,button").filter({ hasText: /Изучать|ללמוד/ }).first().click(); await page.waitForSelector("#proTable tbody tr", { timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500);
  const inText = await page.evaluate(() => { const h = document.querySelector("header.room-header"); const v = document.querySelector("iframe, video"); const t = document.querySelector("#proTable"); return { study: document.body.classList.contains("room-study"), headerShown: !!(h && h.offsetHeight), videoTop: v ? Math.round(v.getBoundingClientRect().top) : null, tableTop: t ? Math.round(t.getBoundingClientRect().top) : null }; });
  fs.mkdirSync(path.join(__dirname, "R4", "after"), { recursive: true });
  await L.shot(page, `../R4/after/r4b-open-${tag}`);
  await page.click("#readerBack").catch(() => {}); await page.waitForTimeout(3000);
  const afterBack = await page.evaluate(() => { const h = document.querySelector("header.room-header"); return { url: location.pathname, headerShown: !!(h && h.offsetHeight) }; });
  console.log(JSON.stringify({ inText, afterBack }));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
