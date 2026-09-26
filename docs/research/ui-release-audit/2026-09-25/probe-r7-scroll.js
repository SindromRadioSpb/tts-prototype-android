"use strict";
// R7 probe: who scrolls after «Создать таблицу», and where the table ends up.
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const L = require("./lib");
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r7p-")), {
    viewport: { width: 380, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = ctx.pages()[0];
  await page.addInitScript(() => {
    localStorage.setItem("phase6FirstOpenSeen", "decline"); localStorage.setItem("onboardingSeen_v1", "1");
    window.__scrolls = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) {
      window.__scrolls.push({ t: Math.round(performance.now()), id: this.id || this.className || this.tagName, o: JSON.stringify(o), y0: Math.round(scrollY) });
      return orig.apply(this, arguments);
    };
    const origTo = window.scrollTo;
    window.scrollTo = function () { window.__scrolls.push({ t: Math.round(performance.now()), id: "window.scrollTo", o: JSON.stringify([...arguments]), stack: new Error().stack.split("\n").slice(2, 4).join(" | ") }); return origTo.apply(this, arguments); };
  });
  await page.goto(L.BASE + "/");
  await page.waitForTimeout(4000);
  await page.fill("#inputText", "שלום לכולם. היום אני לומד עברית בבית.\nמחר נלך לים.");
  await page.click("#btnAiTranslate");
  const samples = [];
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    samples.push(await page.evaluate(() => { const t = document.querySelector("#proTable"); return { y: Math.round(scrollY), tbl: t ? Math.round(t.getBoundingClientRect().top) : null }; }));
  }
  console.log(JSON.stringify({ samples, scrolls: await page.evaluate(() => window.__scrolls) }, null, 1));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
