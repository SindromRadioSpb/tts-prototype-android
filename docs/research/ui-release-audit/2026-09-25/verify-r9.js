"use strict";
// R9: one name for the learner's words — word card action, toast placement, «Мои слова» sheet.
// Usage: AUDIT_BASE=http://localhost:3310 node verify-r9.js <phase> <tag> <width> [locale] [dark]
// Writes only to a throwaway profile (a temp persistent context).
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const L = require("./lib");
const PROD = "https://linguistpro.kolosei.com";

(async () => {
  const [,, phase, tag, w, loc, dark] = process.argv;
  const width = +w, mobile = width < 600;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r9-")), {
    viewport: { width, height: 800 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
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
    if (l) localStorage.setItem("app.locale", l);
  }, loc || "ru");
  fs.mkdirSync(path.join(__dirname, "R9", phase), { recursive: true });
  await page.goto(L.BASE + "/library.html");
  await page.waitForSelector(".learning-home", { timeout: 90000 });
  await page.locator("a.learning-home-primary").first().click();
  await page.waitForSelector("#proTable tbody tr .rm-w, #roomReaderTable .rm-w", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator(".rm-w").first().click();
  await page.waitForSelector(".rm-sheet.rm-open .rm-save, .rm-sheet.rm-open [data-rm-save]", { timeout: 30000 });
  await page.waitForTimeout(600);
  const saveText = await page.locator(".rm-sheet.rm-open [data-rm-save]").first().textContent();
  await page.locator(".rm-sheet.rm-open [data-rm-save]").first().click();
  await page.waitForSelector(".room-toast.show", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(250);
  const toast = await page.evaluate(() => {
    const t = document.querySelector(".room-toast.show");
    const sheet = document.querySelector(".rm-sheet.rm-open");
    if (!t) return { shown: false };
    const r = t.getBoundingClientRect();
    const buttons = sheet ? [...sheet.querySelectorAll("button")].filter((b) => b.offsetHeight) : [];
    const overlaps = buttons.filter((b) => { const q = b.getBoundingClientRect(); return !(q.right < r.left || q.left > r.right || q.bottom < r.top || q.top > r.bottom); }).map((b) => b.textContent.trim().slice(0, 30));
    return { shown: true, text: t.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), overlaps };
  });
  await L.shot(page, `../R9/${phase}/card-toast-${tag}`);
  const badge = await page.evaluate(() => { const s = document.querySelector(".rm-sheet.rm-open"); return s ? (s.innerText.match(/🆕[^\n]*/) || [""])[0] : ""; });
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);
  // «Мои слова» sheet from the reading aids.
  await page.evaluate(() => { const b = document.querySelector(".reader-aids-study"); if (b) b.click(); else { const a = document.getElementById("readerAidsToggle"); if (a) a.click(); } });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector(".reader-aids-study"); if (b) b.click(); });
  await page.waitForSelector(".room-study.room-study-open", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const sheet = await page.evaluate(() => {
    const s = document.querySelector(".room-study.room-study-open");
    if (!s) return { shown: false };
    return {
      shown: true,
      title: (s.querySelector(".room-study-title") || {}).textContent,
      modes: [...s.querySelectorAll("[data-study-mode]")].map((b) => b.textContent.trim()),
      headButtons: [...s.querySelectorAll(".room-study-cal")].map((b) => b.textContent.trim()),
    };
  });
  await L.shot(page, `../R9/${phase}/sheet-${tag}`);
  console.log(JSON.stringify({ phase, tag, saveText, toast, badge, sheet, errors }, null, 1));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
