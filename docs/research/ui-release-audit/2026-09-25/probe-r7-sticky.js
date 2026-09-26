"use strict";
// R7 probe: on a desktop the sticky app nav vs the sticky table header and scrollIntoView targets.
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const L = require("./lib");
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r7s-")), { viewport: { width: 1280, height: 800 } });
  const page = ctx.pages()[0];
  await page.addInitScript(() => { localStorage.setItem("phase6FirstOpenSeen", "decline"); localStorage.setItem("onboardingSeen_v1", "1"); });
  await page.goto(L.BASE + "/");
  await page.waitForTimeout(3500);
  await page.fill("#inputText", Array.from({ length: 30 }, (_, i) => "שלום לכולם מספר " + (i + 1) + ".").join("\n"));
  await page.click("#btnAiTranslate");
  await page.waitForSelector("#proTable tbody tr", { timeout: 60000 });
  await page.waitForTimeout(2500);
  const probe = () => page.evaluate(() => {
    const nav = document.querySelector("nav.lp-app-nav").getBoundingClientRect();
    const th = document.querySelector("#proTable thead th").getBoundingClientRect();
    const panel = document.getElementById("classicResultPanel").getBoundingClientRect();
    return { scrollY: Math.round(scrollY), navBottom: Math.round(nav.bottom), thTop: Math.round(th.top), panelTop: Math.round(panel.top) };
  });
  const a = await probe();
  await page.evaluate(() => { const t = document.querySelector("#proTable tbody tr:nth-child(12)"); scrollTo(0, scrollY + t.getBoundingClientRect().top - 300); });
  await page.waitForTimeout(300);
  const b = await probe();
  await page.evaluate(() => document.getElementById("classicResultPanel").scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  const c = await probe();
  await L.shot(page, "../R7/after/probe-sticky-d1280");
  console.log(JSON.stringify({ afterBuild: a, midTable: b, panelIntoView: c }));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
