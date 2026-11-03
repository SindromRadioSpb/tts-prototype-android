"use strict";
// Atlas P4 W1 in a real browser: Hebrew words open the Room's word card, a word of a reviewed term shows the term
// above the card, loose term links get their own line, a tap with the player open opens the card (E3) and does not
// jump the reading, status colours stay off (E4), phone and desktop in
// RU and HE without horizontal scroll, print hides the word layer, wrap time of the longest section on a 4× CPU.
//   node scripts/atlas/atlas-words-smoke.cjs <base> [outDir]
const { chromium } = require("playwright");
// the Room's status paint classes (reader-morph _RM_W_CLASSES), the active-word highlight excluded
const STATUS = ".atlas-row .rm-w:is(.rm-w-new,.rm-w-unassessed,.rm-w-l1,.rm-w-l2,.rm-w-l3,.rm-w-l4,.rm-w-known,.rm-w-ignore)";
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
      const counts = await page.evaluate((STATUS) => ({
        words: document.querySelectorAll(".atlas-row .rm-w").length,
        terms: document.querySelectorAll(".atlas-row .rm-w.atlas-term").length,
        loose: document.querySelectorAll(".atlas-row > .atlas-row-terms").length,
        coloured: document.querySelectorAll(STATUS).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }), STATUS);
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
      assert.equal(await page.locator(".rm-sheet.rm-open .rm-surface-title").count(), 0, "no term block for a plain word");
      // P5 G2: a plain word offers only «Добавить в термины»
      assert.equal(await page.locator('.rm-sheet.rm-open [data-rm-surface-action="add-term"]').count(), 1, "a plain word can be added to the terms");
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
        const reading = () => page.evaluate(() => { const r = document.querySelector(".atlas-speaking"); return r ? r.getAttribute("data-ref") : null; });
        // paused, the player stays open: before E3 a tap on a paragraph read from it here
        await page.locator('.atlas-player [data-act="toggle"]').click();
        await page.waitForTimeout(300);
        const at = await reading();
        const far = page.locator(".atlas-row .rm-w:visible").nth(200);
        await far.scrollIntoViewIfNeeded();
        const tapped = await far.evaluate((w) => w.closest(".atlas-row").getAttribute("data-ref"));
        await far.click();
        await page.waitForSelector(".rm-sheet.rm-open", { timeout: 15000 });
        await page.waitForTimeout(800);
        const now = await reading();
        report.push({ e3: { readingBefore: at, tappedRow: tapped, readingAfter: now, cardOpen: true } });
        assert.ok(at, "the player was reading a line");
        assert.notEqual(tapped, at, "the tapped word is in another paragraph");
        assert.equal(now, at, "a word tap opens the card and does not move the reading (E3)");
      } else report.push({ e3: "no recordings on this server — skipped" });
      await context.close();
    }

    if (!process.argv.includes("--no-w3")) // W3: colours by status — off by default even when the Room's own «Статус слов» is on; the switch in «Колонки»
    // paints and unpaints; opening and painting write nothing into word_status / review_log
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => { try { localStorage.setItem("room.wordStatus", "1"); localStorage.removeItem("room.atlasWordStatus"); } catch (_) {} });
      await page.goto(base + "/library.html#room=atlas%3Aa97002");
      await page.waitForSelector(".atlas-home");
      const rowsOf = () => page.evaluate(async () => {
        try {
          const db = await import("/db/local-db.js?v=815");
          const one = async (sql) => { const r = await db.dbQuery(sql); return r && r[0] ? Number(r[0].n) : null; };
          return { word_status: await one("SELECT COUNT(*) AS n FROM word_status"), review_log: await one("SELECT COUNT(*) AS n FROM review_log") };
        } catch (e) { return { error: String(e && e.message || e) }; }
      });
      const before = await rowsOf();
      await page.locator('[data-section="s02-rivets"]').click();
      await page.waitForSelector(".atlas-row .rm-w", { state: "attached", timeout: 15000 });
      await page.waitForTimeout(1500);
      const offByDefault = await page.locator(STATUS).count();
      await page.locator(".atlas-view-btn").click();
      const legendHidden = await page.locator(".atlas-word-colours .reader-status-legend").isHidden();
      await page.locator("[data-atlas-colours]").check();
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 100, STATUS, { timeout: 30000 });
      const on = await page.locator(STATUS).count();
      const legendShown = await page.locator(".atlas-word-colours .reader-status-legend").isVisible();
      const termsKept = await page.locator(".atlas-row .rm-w.atlas-term").count();
      await page.screenshot({ path: path.join(out, "colours-on-390.png") });
      const after = await rowsOf();
      // an explicit mark in the card (the learner's own action, the one write) repaints the word at once
      await page.locator(".atlas-view-btn").click();
      const target = page.locator(".atlas-row .rm-w.rm-w-unassessed:visible").first();
      await target.scrollIntoViewIfNeeded();
      const surface = await target.getAttribute("data-surface");
      await target.click();
      await page.waitForSelector('.rm-sheet.rm-open [data-rm-status="known"]', { timeout: 15000 });
      await page.locator('.rm-sheet.rm-open [data-rm-status="known"]').click();
      await page.waitForTimeout(1200);
      await page.keyboard.press("Escape");
      await page.waitForFunction((s) => Array.from(document.querySelectorAll(".atlas-row .rm-w.rm-w-known")).some((w) => w.getAttribute("data-surface") === s), surface, { timeout: 15000 });
      const marked = await rowsOf();
      await page.locator(".atlas-view-btn").click();
      await page.locator("[data-atlas-colours]").uncheck();
      await page.waitForTimeout(800);
      const offAgain = await page.locator(STATUS).count();
      report.push({ w3: { offByDefault, legendHidden, on, legendShown, termsKept, offAgain, before, after, markedWord: surface, marked, errors: errors.length } });
      assert.equal(marked.word_status, (before.word_status || 0) + 1, "the explicit mark is the one write");
      assert.equal(offByDefault, 0, "the atlas is not coloured by default, even with the Room's «Статус слов» on (E4)");
      assert.ok(legendHidden && legendShown, "the legend follows the switch");
      assert.ok(on > 100, "the switch colours the words: " + on);
      assert.ok(termsKept > 50, "term underlines survive the paint");
      assert.equal(offAgain, 0, "switching off removes the colours");
      assert.deepEqual(after, before, "opening and painting write nothing into word_status / review_log");
      assert.deepEqual(errors, [], "no page errors");
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
