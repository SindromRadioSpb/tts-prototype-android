"use strict";
// R11 inventory: visible emoji used as icons, per surface (380, ru). Writes nothing to the app
// beyond a throwaway profile.
// Usage: AUDIT_BASE=http://localhost:3310 node inventory-r11.js <tag> [width]
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const L = require("./lib");
const PROD = "https://linguistpro.kolosei.com";

async function collect(page, surface) {
  return page.evaluate((surface) => {
    const RE = /\p{Extended_Pictographic}/u;
    const out = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; const t = n.nodeValue;
      if (!t || !RE.test(t)) continue;
      const host = n.parentElement; if (!host) continue;
      const r = host.getBoundingClientRect(); const cs = getComputedStyle(host);
      if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none") continue;
      if (host.closest("[hidden], .room-icon-fallback")) continue;
      for (const ch of t.match(/\p{Extended_Pictographic}️?/gu) || []) {
        const ctx = (host.closest("[id]") || {}).id || host.className || host.tagName;
        const key = ch + " @ " + String(ctx).slice(0, 40);
        if (!out.has(key)) out.set(key, t.trim().slice(0, 40));
      }
    }
    return { surface, items: [...out.entries()].map(([k, v]) => k + "  «" + v + "»") };
  }, surface);
}

(async () => {
  const [,, tag, w] = process.argv;
  const width = +(w || 380), mobile = width < 600;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r11-")), {
    viewport: { width, height: 800 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile,
  });
  const page = ctx.pages()[0];
  await ctx.route(/\/api\/(public-corpora|publication|mediatheque)/, async (route) => {
    const u = new URL(route.request().url());
    const r = await fetch(PROD + u.pathname + u.search);
    const headers = {}; r.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) headers[k] = v; });
    await route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
  });
  await page.addInitScript(() => { localStorage.setItem("phase6FirstOpenSeen", "decline"); localStorage.setItem("onboardingSeen_v1", "1"); });
  const report = [];
  await page.goto(L.BASE + "/library.html");
  await page.waitForSelector(".learning-home", { timeout: 90000 });
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(800);
  report.push(await collect(page, "room-home"));
  await page.locator("a.learning-home-primary").first().click();
  await page.waitForSelector("#proTable .rm-w", { timeout: 60000 }); await page.waitForTimeout(1500);
  report.push(await collect(page, "room-reader"));
  await page.click("#readerAidsToggle").catch(() => {}); await page.waitForTimeout(700);
  report.push(await collect(page, "room-reader-aids"));
  await page.click("#readerAidsToggle").catch(() => {}); await page.waitForTimeout(400);
  await page.locator(".rm-w").first().click();
  await page.waitForSelector(".rm-sheet.rm-open [data-rm-save], .rm-sheet.rm-open .rm-status-btn", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  report.push(await collect(page, "word-card"));
  await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(400);
  await page.evaluate(() => { const a = document.getElementById("readerAidsToggle"); if (a) a.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector(".reader-aids-study"); if (b) b.click(); });
  await page.waitForSelector(".room-study.room-study-open", { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1500);
  report.push(await collect(page, "words-sheet"));
  await page.goto(L.BASE + "/"); await page.waitForTimeout(4000);
  report.push(await collect(page, "studio-home"));
  await page.goto(L.BASE + "/mediatheque.html"); await page.waitForTimeout(5000);
  report.push(await collect(page, "mediatheque"));
  fs.mkdirSync(path.join(__dirname, "R11"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "R11", "emoji-inventory-" + tag + ".json"), JSON.stringify(report, null, 1));
  for (const s of report) { console.log("## " + s.surface + " (" + s.items.length + ")"); for (const i of s.items) console.log("  " + i); }
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
