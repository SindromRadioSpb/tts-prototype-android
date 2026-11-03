"use strict";
// Atlas P5 trainer in a real browser (plan ENGINEERING_ATLAS_P5_TRAINER_PLAN_2026_11_03.md).
// G1: «Тренировать» → translation stages: stage 1 glosses unknown words and hides the translation, stage 2 glosses only
// terms, stage 3 shows plain Hebrew, stage 0 gives the saved columns back; RU/HE × 390/1440 without horizontal scroll;
// print ignores the stage; opening and changing stages write nothing into word_status / review_log.
//   node scripts/atlas/atlas-train-smoke.cjs <base> [outDir]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert/strict");

const SECTION = "s09-belt";
const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).filter((e) => e.offsetParent !== null).length`;

async function openSection(page, base, lang) {
  await page.goto(base + "/library.html#room=atlas%3Aa97002");
  if (!lang) {   // a reload: the Room restores the open section by itself
    await page.reload();
    await page.waitForSelector(".atlas-row .rm-w", { state: "attached", timeout: 30000 });
    return;
  }
  await page.waitForSelector(".atlas-home");
  if (lang) await page.locator("select").filter({ has: page.locator('option[value="he"]') }).first().selectOption(lang);
  await page.locator(`[data-section="${SECTION}"]`).click();
  await page.waitForSelector(".atlas-row .rm-w", { state: "attached", timeout: 15000 });
}
async function chooseStage(page, n) {
  if (await page.locator(".atlas-train-panel").isHidden()) await page.locator(".atlas-train-btn").click();
  await page.locator(`.atlas-train-panel [data-stage="${n}"]`).click();
  await page.waitForTimeout(400);
}
const rowsOf = (page) => page.evaluate(async () => {
  try {
    const db = await import("/db/local-db.js?v=815");
    const one = async (sql) => { const r = await db.dbQuery(sql); return r && r[0] ? Number(r[0].n) : null; };
    return { word_status: await one("SELECT COUNT(*) AS n FROM word_status"), review_log: await one("SELECT COUNT(*) AS n FROM review_log") };
  } catch (e) { return { error: String(e && e.message || e) }; }
});

(async () => {
  const base = process.argv[2] || "http://127.0.0.1:3399";
  const out = path.resolve(process.argv[3] || ".tmp/atlas-train-browser");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const lang of ["ru", "he"]) for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => { try { if (!sessionStorage.getItem("smoke.init")) { localStorage.removeItem("room.atlas.stage.v1"); sessionStorage.setItem("smoke.init", "1"); } } catch (_) {} });
      await openSection(page, base, lang);
      const before = await rowsOf(page);
      const ru0 = await page.evaluate(visible(".atlas-row > .atlas-ru"));
      assert.ok(ru0 > 10, "stage 0 shows the translation: " + ru0);

      await chooseStage(page, 1);
      await page.waitForFunction(() => document.querySelectorAll(".atlas-stage-1 .rm-w[data-atlas-gloss]").length > 100, null, { timeout: 15000 });
      const s1 = await page.evaluate((v) => ({
        glossed: document.querySelectorAll(".atlas-stage-1 .rm-w[data-atlas-gloss]").length,
        ru: eval(v), translit: Array.from(document.querySelectorAll(".atlas-translit")).filter((e) => e.offsetParent !== null).length,
        glossShown: (() => { const w = document.querySelector(".atlas-stage-1 .rm-w[data-atlas-gloss]:not(.rm-w-known):not(.rm-w-l4):not(.rm-w-ignore)");
          return w ? getComputedStyle(w, "::before").content : ""; })(),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }), visible(".atlas-row > .atlas-ru"));
      assert.equal(s1.ru, 0, "stage 1 hides the paragraph translation");
      assert.equal(s1.translit, 0, "stage 1 hides the transliteration");
      assert.ok(/[а-яА-Яa-zA-Z]/.test(s1.glossShown), "the gloss is shown under the word: " + s1.glossShown);
      assert.ok(s1.overflow <= 1, "stage 1: no horizontal scroll: " + s1.overflow);
      await page.locator(".atlas-train-btn").click();
      await page.screenshot({ path: path.join(out, `stage1-${lang}-${width}.png`) });

      await chooseStage(page, 2);
      const s2 = await page.evaluate(() => ({
        glossed: document.querySelectorAll(".atlas-stage-2 .rm-w[data-atlas-gloss]").length,
        nonTerm: document.querySelectorAll(".atlas-stage-2 .rm-w[data-atlas-gloss]:not(.atlas-term)").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      assert.ok(s2.glossed > 10, "stage 2 glosses terms: " + s2.glossed);
      assert.equal(s2.nonTerm, 0, "stage 2 glosses only term words");
      assert.ok(s2.overflow <= 1, "stage 2: no horizontal scroll");

      await chooseStage(page, 3);
      const s3 = await page.evaluate(() => ({
        glossed: document.querySelectorAll(".rm-w[data-atlas-gloss]").length,
        niqqud: Array.from(document.querySelectorAll(".atlas-row > .atlas-niqqud")).filter((e) => e.offsetParent !== null).length,
        plain: Array.from(document.querySelectorAll(".atlas-row > .atlas-he:not(.atlas-niqqud)")).filter((e) => e.offsetParent !== null).length,
        locked: !!document.querySelector('.atlas-view-panel input[data-col="ru"]:disabled'),
      }));
      assert.equal(s3.glossed, 0, "stage 3: no glosses");
      assert.equal(s3.niqqud, 0, "stage 3: no pointed line (owner Г1)");
      assert.ok(s3.plain > 10, "stage 3: plain Hebrew of the book");
      assert.ok(s3.locked, "columns are locked while a stage is on");
      await page.locator(".atlas-train-btn").click();
      await page.screenshot({ path: path.join(out, `stage3-${lang}-${width}.png`) });

      // print ignores the stage: the whole bilingual section is printed
      await page.emulateMedia({ media: "print" });
      const printed = await page.evaluate(() => {
        const w = document.querySelector(".rm-w[data-atlas-gloss]");
        return { gloss: w ? getComputedStyle(w, "::before").content : "none" };
      });
      await page.emulateMedia({ media: "screen" });

      // the stage survives a reopen; stage 0 gives the saved columns back
      await openSection(page, base, null);
      const kept = await page.evaluate(() => document.querySelector(".atlas-section").className);
      assert.match(kept, /atlas-stage-3/, "the stage is remembered per section");
      await chooseStage(page, 0);
      const ru0b = await page.evaluate(visible(".atlas-row > .atlas-ru"));
      assert.equal(ru0b, ru0, "stage 0 shows the saved columns again");
      const after = await rowsOf(page);
      assert.deepEqual(after, before, "opening and changing stages write nothing into word_status / review_log");
      report.push({ lang, width, ru0, s1, s2, s3, printed, before, after, errors: errors.length });
      assert.deepEqual(errors, [], "no page errors");
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1) + "\n");
    console.log(JSON.stringify(report, null, 1));
  }
})().catch((e) => { console.error(e); process.exit(1); });
