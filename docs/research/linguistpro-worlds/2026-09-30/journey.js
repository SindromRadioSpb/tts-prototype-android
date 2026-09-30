"use strict";
// LinguistPro Worlds — journey evidence: Studio phase changes drive Timsah through the four
// locations (HQ → press → polling station + ballot drop → counting night). Writes ./v2/journey-*.png
// Usage: node journey.js [width=380] [locale=ru]
const { chromium } = require("playwright");
const path = require("node:path");
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:3000";
const [,, w = "380", locale = "ru"] = process.argv;
const width = Number(w);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1, isMobile: width < 600, hasTouch: width < 600, locale: locale === "he" ? "he-IL" : "ru-RU" });
  await ctx.addInitScript((l) => { localStorage.setItem("onboardingSeen_v1", "1"); localStorage.setItem("app.locale", l); localStorage.setItem("lp_world_v1", JSON.stringify({ id: "israel-elections-2026", mode: "live" })); }, locale);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(3500);
  const shot = async (name) => { await page.screenshot({ path: path.join(__dirname, "v2", `journey-${width}-${locale}-${name}.png`) }); console.log(name, JSON.stringify(await page.evaluate(() => window.LPWorld.debugState()))); };
  const phase = (p) => page.evaluate((p) => document.getElementById("classicNextStep").setAttribute("data-phase", p), p);
  await shot("1-hq");
  await phase("table"); await page.waitForTimeout(700); await shot("2-walking");
  await page.waitForTimeout(2600); await shot("3-press");
  await phase("save"); await page.waitForTimeout(1300 + 1450); await shot("4-polling-ballot");
  await page.waitForTimeout(2500);
  await page.mouse.click(Math.round(width * 0.3), 0); // no-op click outside the street band
  const tap = await page.evaluate(() => { const c = document.querySelector(".lp-world-stage canvas"); const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.42, y: r.bottom - 40 }; });
  await page.mouse.click(tap.x, tap.y); await page.waitForTimeout(300); await shot("5-tap-bubble");
  await phase("learn"); await page.waitForTimeout(3600); await shot("6-count-night");
  console.log(errors.length ? "ERRORS " + JSON.stringify(errors) : "no page errors");
  await browser.close();
})();
