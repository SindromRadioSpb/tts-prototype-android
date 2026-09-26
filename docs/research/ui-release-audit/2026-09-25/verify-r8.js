"use strict";
// R8: Room shelves — tabs, shelf rows, badges for a new profile, loading skeleton, end-of-text cards.
// Usage: AUDIT_BASE=http://localhost:3310 node verify-r8.js <phase: before|after> <tag> <width> [locale] [dark]
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const L = require("./lib");
const PROD = "https://linguistpro.kolosei.com";

(async () => {
  const [,, phase, tag, w, loc, dark] = process.argv;
  const width = +w, mobile = width < 600;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r8-")), {
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
  const dir = path.join(__dirname, "R8", phase);
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  await page.goto(L.BASE + "/library.html");
  // Loading timeline: what is on screen in the first seconds.
  const timeline = [];
  for (const ms of [400, 1200, 2500, 5000, 8000]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    timeline.push(await page.evaluate((ms) => ({
      ms,
      rows: document.querySelectorAll(".room-shelf-row, .room-book-row, [data-room-row]").length,
      skeleton: document.querySelectorAll("[data-skeleton], .room-skeleton, .is-skeleton").length,
      status: (document.querySelector(".room-loading, #roomLoading, [data-room-status]") || {}).textContent || "",
    }), ms));
    if (ms === 1200) await L.shot(page, `../R8/${phase}/load1200-${tag}`);
  }
  await page.waitForSelector(".learning-home, .room-shelf, .corpus-nav", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await L.shot(page, `../R8/${phase}/shelves-y0-${tag}`);
  const facts = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')].filter((t) => t.offsetHeight).map((t) => ({
      text: t.textContent.trim(), clipped: t.scrollWidth > t.clientWidth + 1, w: Math.round(t.getBoundingClientRect().width),
    }));
    const text = document.body.innerText;
    return {
      tabs,
      needProfile: /Нужен профиль слов|Needs a word profile|נדרש פרופיל/.test(text),
      notLess0: /Не менее 0%|At least 0%/.test(text),
      strAbbr: (text.match(/\d+\s?стр\./g) || []).length,
      yourReading: /Ваше чтение/.test(text),
    };
  });
  await page.evaluate(() => scrollTo(0, 700));
  await page.waitForTimeout(500);
  await L.shot(page, `../R8/${phase}/shelves-y700-${tag}`);
  // End of text: the one-row «Короткий текст» from «Сегодня» ends at once.
  let endOfText = null;
  const short = page.locator("a.learning-home-action").filter({ hasText: /Короткий|Short|קצר/ }).first();
  if (await short.count()) {
    await short.click();
    await page.waitForSelector("#readerEndCard .reader-end-next", { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1200);
    endOfText = await page.evaluate(() => {
      const next = document.querySelector("#readerEndCard .reader-end-next");
      if (!next) return { shown: false };
      const rows = [...next.querySelectorAll(".corpus-work-row, .work-card")];
      if (rows[0]) rows[0].scrollIntoView({ block: "center" });
      return { shown: true, kinds: rows.map((r) => r.className.split(" ")[0]), heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)) };
    });
    await L.shot(page, `../R8/${phase}/end-${tag}`);
  }
  console.log(JSON.stringify({ phase, tag, timeline, facts, endOfText, errors }, null, 1));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
