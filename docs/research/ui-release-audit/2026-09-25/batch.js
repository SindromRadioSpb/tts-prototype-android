"use strict";
// Key screens for one profile/viewport. node batch.js <profile> <width> <locale> <tag> [dark]
const { chromium } = require("playwright");
const path = require("node:path");
const L = require("./lib");
const PROF = path.join(require("os").tmpdir(), "lp-audit-profiles");
(async () => {
  const [,, prof, w, loc, tag, dark] = process.argv; const width = +w; const mobile = width < 600;
  const ctx = await chromium.launchPersistentContext(path.join(PROF, prof), { viewport: { width, height: 800 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: loc === "he" ? "he-IL" : "ru-RU", colorScheme: dark ? "dark" : "light" });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on("dialog", (d) => d.dismiss());
  const report = {};
  const snap = async (name, extra) => { await page.waitForTimeout(700); await L.shot(page, `${name}-${tag}`); const t = await L.targets(page); report[name] = { small: t.filter((x) => x.small).length, total: t.length, contrastFails: (await L.contrast(page)).length, ...(extra || {}) }; };
  const setLocale = async () => { if (loc) await page.evaluate((l) => { try { localStorage.setItem("app.locale", l); } catch (_) {} }, loc); };
  await page.goto(L.BASE + "/"); await setLocale(); await page.reload(); await page.waitForTimeout(3500);
  await snap("01-first-run", { dir: await page.evaluate(() => document.documentElement.dir) });
  await page.evaluate(() => { for (const [k, v] of [["phase6FirstOpenSeen", "decline"], ["v3.byokOnboardingDismissed", "1"], ["onboardingSeen_v1", "1"]]) localStorage.setItem(k, v); });
  await page.goto(L.BASE + "/"); await page.waitForTimeout(3500);
  await snap("04-studio-home");
  await page.fill("#inputText", "שלום לכולם. היום אני לומד עברית בבית. הספר הזה מעניין מאוד, ואני קורא אותו כל ערב.");
  await page.click("#classicNextActionBtn");
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => document.querySelectorAll("table tbody tr").length) > 2) break; }
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const t = document.querySelector("table tbody tr"); if (t) t.scrollIntoView({ block: "center" }); });
  await snap("15-studio-table", { tableY: await page.evaluate(() => { const t = document.querySelector("table"); return t ? Math.round(t.getBoundingClientRect().top + scrollY) : -1; }) });
  await page.goto(L.BASE + "/library.html"); await page.waitForTimeout(6000);
  await snap("07-room-shelves", { dir: await page.evaluate(() => document.documentElement.dir) });
  const start = page.locator(".room-start-cta, [data-action=start-reading]").first();
  const startBtn = (await start.count()) ? start : page.locator("text=/Начать читать|להתחיל לקרוא|Start reading/").first();
  await startBtn.click().catch((e) => console.log("start", String(e).slice(0, 120)));
  await page.waitForTimeout(6000);
  await snap("08-reader");
  const word = page.locator(".reader-word, [data-word]").first();
  if (await word.count()) { await word.click().catch(() => {}); await page.waitForTimeout(2500); const ns = page.locator(".room-consent button").first(); if (await ns.count() && await ns.isVisible()) await ns.click(); await page.waitForTimeout(2500); await snap("12-morph-card"); await page.keyboard.press("Escape"); }
  await page.goto(L.BASE + "/mediatheque.html"); await page.waitForTimeout(4500);
  await snap("17-mediatheque");
  const study = page.locator("a,button").filter({ hasText: /Изучать|ללמוד|Study/ }).first();
  await study.click().catch((e) => console.log("study", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  await snap("18-study-media", { video: await page.evaluate(() => { const f = document.querySelector("iframe, video"); if (!f) return null; const r = f.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), right: Math.round(r.right), vw: innerWidth }; }) });
  console.log(JSON.stringify(report, null, 1));
  await ctx.close();
})();
