"use strict";
// LinguistPro Worlds — evidence screenshots of the real Studio (2026-09-30).
// Usage: node shoot.js <outDir> [world=off|elections] [scenario=empty|demo] [widths=380,768,1280] [locales=ru,he] [dark=0|1|both]
// Fresh Chromium profile per shot; onboarding dismissed by its own persisted key (onboardingSeen_v1).
// Base URL: AUDIT_BASE (default http://127.0.0.1:3000).
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:3000";
const [,, outDir = "shots", world = "off", scenario = "empty", widthsArg = "380,768,1280", locArg = "ru,he", darkArg = "0"] = process.argv;
const OUT = path.resolve(__dirname, outDir);
fs.mkdirSync(OUT, { recursive: true });
const widths = widthsArg.split(",").map(Number);
const locales = locArg.split(",");
const darks = darkArg === "both" ? [false, true] : [darkArg === "1"];

async function one(width, locale, dark) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1,
    isMobile: width < 600, hasTouch: width < 600, colorScheme: dark ? "dark" : "light",
    locale: locale === "he" ? "he-IL" : locale === "en" ? "en-US" : "ru-RU",
  });
  await ctx.addInitScript(({ world, locale }) => {
    try {
      localStorage.setItem("onboardingSeen_v1", JSON.stringify({ ts: 1, action: "dismissed" }));
      localStorage.setItem("app.locale", locale);
      if (world !== "off") localStorage.setItem("lp_world_v1", JSON.stringify({ id: world, mode: "calm" }));
    } catch (_) {}
  }, { world: world === "elections" ? "israel-elections-2026" : "off", locale });
  const page = await ctx.newPage();
  const logs = [];
  page.on("pageerror", (e) => logs.push("PAGEERROR " + String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|401/.test(m.text())) logs.push(m.text().slice(0, 160)); });
  const requests = [];
  page.on("request", (r) => { if (/\/worlds\//.test(r.url())) requests.push(r.url().replace(BASE, "")); });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(3500);
  if (scenario === "demo") {
    await page.evaluate(() => { try { window.v3OnboardingTryDemo && window.v3OnboardingTryDemo(); } catch (_) {} });
    await page.waitForTimeout(3000);
  }
  if (scenario === "scene") {
    await page.evaluate(() => window.LPWorld && window.LPWorld.play("ballot-drop"));
    await page.waitForTimeout(Number(process.env.SCENE_AT || 1650));
  }
  const name = `studio-${scenario}-${world}-${width}-${locale}${dark ? "-dark" : ""}`;
  await page.screenshot({ path: path.join(OUT, name + ".png") });
  const metrics = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, stage: r("[data-world-slot]"), next: r("#classicNextStep"), worldAttr: document.documentElement.getAttribute("data-world") };
  });
  console.log(name, JSON.stringify(metrics), requests.length ? "worldReq=" + requests.length : "", logs.length ? JSON.stringify(logs) : "");
  await browser.close();
}

(async () => {
  for (const w of widths) for (const l of locales) for (const d of darks) await one(w, l, d);
})();
