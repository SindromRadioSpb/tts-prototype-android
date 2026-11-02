"use strict";
// Atlas P4 W1 in a real browser: Hebrew words open the Room's word card, a word of a reviewed term shows the term
// above the card, loose term links get their own line, a tap with the player open opens the card (E3) and does not
// jump the reading, status colours stay off (E4), phone and desktop in
// RU and HE without horizontal scroll, print hides the word layer, wrap time of the longest section on a 4× CPU.
//   node scripts/atlas/atlas-words-smoke.cjs <base> [outDir]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert/strict");

(async () => {
  const base = process.argv[2] || "http://127.0.0.1:3399";
  const out = path.resolve(process.argv[3] || ".tmp/atlas-words-browser");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const report = [];
  try {
    for (const lang of ["ru", "he"]) for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/library.html#room=atlas%3Aa97002");
      await page.waitForSelector(".atlas-home");
      await page.locator("select").filter({ has: page.locator('option[value="he"]') }).first().selectOption(lang);
      await page.locator('[data-section="s02-rivets"]').click();
      await page.waitForSelector(".atlas-row .rm-w", { state: "attached", timeout: 15000 });
      const counts = await page.evaluate(() => ({
        words: document.querySelectorAll(".atlas-row .rm-w").length,
        terms: document.querySelectorAll(".atlas-row .rm-w.atlas-term").length,
        loose: document.querySelectorAll(".atlas-row > .atlas-row-terms").length,
        coloured: document.querySelectorAll(".atlas-row .rm-w[class*='rm-st-'], .atlas-row .rm-w[data-status]").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      assert.ok(counts.words > 500, "words wrapped: " + counts.words);
      assert.ok(counts.terms > 50, "term words: " + counts.terms);
      assert.ok(counts.loose > 0, "loose term lines: " + counts.loose);
      assert.equal(counts.coloured, 0, "no status colours in the atlas by default (E4)");
      assert.ok(counts.overflow <= 1, "no horizontal scroll: " + counts.overflow);
      // a term word → the card with the reviewed term on top
      const term = page.locator(".atlas-row .rm-w.atlas-term:visible").first();
      await term.scrollIntoViewIfNeeded();
      await term.click();
      await page.waitForSelector(".rm-sheet.rm-open .rm-surface-top", { timeout: 15000 });
      const top = await page.locator(".rm-sheet.rm-open .rm-surface-top").innerText();
      assert.ok(/[א-ת]/.test(top), "term title in Hebrew");
      await page.screenshot({ path: path.join(out, `term-card-${lang}-${width}.png` ) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      // a plain word → the card without the term block
      const plain = page.locator(".atlas-row .rm-w:not(.atlas-term):visible").nth(3);
      await plain.scrollIntoViewIfNeeded();
      await plain.click();
      await page.waitForSelector(".rm-sheet.rm-open .rm-sheet-body:not(:has(.rm-loading))", { timeout: 15000 });
      assert.equal(await page.locator(".rm-sheet.rm-open .rm-surface-top").count(), 0, "no term block for a plain word");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      // print: the word layer is not printed
      await page.emulateMedia({ media: "print" });
      const printed = await page.evaluate(() => {
        const t = document.querySelector(".atlas-row .rm-w.atlas-term"), l = document.querySelector(".atlas-row > .atlas-row-terms");
        return { underline: t ? getComputedStyle(t).textDecorationLine : "none", loose: l ? getComputedStyle(l).display : "none" };
      });
      await page.emulateMedia({ media: "screen" });
      assert.equal(printed.loose, "none", "loose terms are not printed");
      assert.ok(!/underline/.test(printed.underline), "term underline is not printed");
      report.push({ lang, width, ...counts, top: top.replace(/\s+/g, " ").slice(0, 80), errors: errors.length });
      assert.deepEqual(errors, [], "no page errors");
      await context.close();
    }

    // E3: with the player open, a word opens its card and the reading does not jump to that paragraph
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      await page.goto(base + "/library.html#room=atlas%3Aa97002");
      await page.waitForSelector(".atlas-home");
      await page.locator('[data-section="s02-rivets"]').click();
      await page.waitForSelector(".atlas-row .rm-w", { state: "attached", timeout: 15000 });
      const listen = page.locator(".atlas-listen-btn");
      if (await listen.count()) {
        await listen.click();
        await page.waitForSelector(".atlas-player");
        await page.waitForTimeout(800);
        const reading = () => page.evaluate(() => { const r = document.querySelector(".atlas-reading"); return r ? r.getAttribute("data-ref") : null; });
        const at = await reading();
        const far = page.locator(".atlas-row .rm-w:visible").nth(200);
        await far.scrollIntoViewIfNeeded();
        await far.click();
        await page.waitForSelector(".rm-sheet.rm-open", { timeout: 15000 });
        await page.waitForTimeout(500);
        const now = await reading();
        report.push({ e3: { readingBefore: at, readingAfter: now, cardOpen: true } });
        assert.equal(now, at, "a word tap does not move the reading (E3)");
      } else report.push({ e3: "no recordings on this server — skipped" });
      await context.close();
    }

    // the longest section (s22, 3 724 words) on a phone with a 4× slower CPU: wrap + decorate time
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.goto(base + "/library.html#room=atlas%3Aa97002");
      await page.waitForSelector(".atlas-home");
      await page.evaluate(() => {
        const AW = window.AtlasWords, orig = AW.decorateRow;
        window.__atlasWordsMs = 0;
        // measure the host's whole attach: wrap (ReaderMorph) + decorate, from the first row decorated back to the open
        const origMount = window.ReaderMorph.attach;
        window.ReaderMorph.attach = function () { const t = performance.now(); const r = origMount.apply(this, arguments); window.__atlasWrapMs = performance.now() - t; return r; };
        AW.decorateRow = function () { const t = performance.now(); const r = orig.apply(this, arguments); window.__atlasWordsMs += performance.now() - t; return r; };
      });
      await page.locator('[data-section="s22-machine-tools"]').click();
      await page.waitForSelector(".atlas-row .rm-w", { state: "attached", timeout: 30000 });
      const t = await page.evaluate(() => ({ wrapMs: Math.round(window.__atlasWrapMs || 0), decorateMs: Math.round(window.__atlasWordsMs || 0),
        words: document.querySelectorAll(".atlas-row .rm-w").length }));
      report.push({ longestSectionCpu4x: t });
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1) + "\n");
    console.log(JSON.stringify(report, null, 1));
  }
})().catch((e) => { console.error(e); process.exit(1); });
