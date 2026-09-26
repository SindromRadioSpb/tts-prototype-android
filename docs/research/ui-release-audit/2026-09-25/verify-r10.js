"use strict";
// R10: desktop study screen — video left (sticky), word card under it, table right.
// Usage: AUDIT_BASE=http://localhost:3310 node verify-r10.js <phase> <tag> <width> [locale] [dark]
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const L = require("./lib");
const PROD = "https://linguistpro.kolosei.com";

(async () => {
  const [,, phase, tag, w, loc, dark] = process.argv;
  const width = +w, mobile = width < 600;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r10-")), {
    viewport: { width, height: mobile ? 800 : 860 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    colorScheme: dark ? "dark" : "light", forcedColors: process.env.FORCED ? "active" : "none",
  });
  const page = ctx.pages()[0];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await ctx.route(/\/api\/(public-corpora|publication|mediatheque)/, async (route) => {
    const u = new URL(route.request().url());
    const r = await fetch(PROD + u.pathname + u.search, { headers: { accept: route.request().headers().accept || "*/*" } });
    const headers = {}; r.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) headers[k] = v; });
    await route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
  });
  await page.addInitScript((l) => {
    localStorage.setItem("phase6FirstOpenSeen", "decline"); localStorage.setItem("onboardingSeen_v1", "1");
    localStorage.setItem("room.studyMode", "1");
    if (l) localStorage.setItem("app.locale", l);
  }, loc || "ru");
  fs.mkdirSync(path.join(__dirname, "R10", phase), { recursive: true });
  await page.goto(L.BASE + "/mediatheque.html");
  await page.waitForTimeout(5000);
  await page.locator("a,button").filter({ hasText: /Изучать|ללמוד|Study/ }).first().click();
  await page.waitForSelector("#proTable tbody tr", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const measure = () => page.evaluate(() => {
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
    const video = document.querySelector("#roomMediaYtMount iframe, #roomReader video, .room-media iframe, .room-media video");
    const sheet = document.querySelector(".rm-sheet.rm-open");
    const card = sheet && (sheet.querySelector(".rm-sheet-card, .rm-sheet-panel, .rm-sheet-body") || sheet);
    return {
      study: document.body.classList.contains("room-study"),
      video: rect(video), table: rect(document.querySelector("#proTable")),
      firstRow: rect(document.querySelector("#proTable tbody tr")),
      sheet: rect(card), scrollY: Math.round(scrollY),
      bar: rect(document.querySelector("#roomReader .reader-bar")), nav: rect(document.querySelector("nav.lp-app-nav")),
      modal: (document.querySelector(".rm-sheet") || { getAttribute: () => null }).getAttribute("aria-modal"),
    };
  });
  const open = await measure();
  await L.shot(page, `../R10/${phase}/study-${tag}`);
  // Tap a word: where does the word card open, and does the video stay in view while reading on?
  await page.locator("#proTable .rm-w").nth(3).click().catch(() => {});
  await page.waitForSelector(".rm-sheet.rm-open .rm-status-btn, .rm-sheet.rm-open [data-rm-save]", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const word = await measure();
  await L.shot(page, `../R10/${phase}/word-${tag}`);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => { const rows = document.querySelectorAll("#proTable tbody tr"); const r = rows[Math.min(rows.length - 1, 25)]; if (r) r.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(800);
  const scrolled = await measure();
  await L.shot(page, `../R10/${phase}/scrolled-${tag}`);
  console.log(JSON.stringify({ phase, tag, open, word, scrolled, errors }, null, 1));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
