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
  await page.goto(base + "/library.html#room=atlas%3Aa97002", { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!lang) {   // a reload: the Room restores the open section by itself
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".atlas-row .rm-w", { state: "attached", timeout: 30000 });
    return;
  }
  await page.waitForSelector(".atlas-home", { timeout: 90000 });   // a cold production load can take long
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
    const db = await import("/db/local-db.js?v=852");
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
    // G2: a word → «Добавить в термины» → my term underlined, «Мой термин» in its card, export file, delete;
    // no writes into word_status / review_log
    if (!process.argv.includes("--no-g2")) for (const [lang, width] of [["ru", 390], ["he", 1440]]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block", acceptDownloads: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => { try { if (!sessionStorage.getItem("smoke.init")) { localStorage.removeItem("room.atlas.stage.v1"); localStorage.removeItem("room.atlas.myTerms.v1"); sessionStorage.setItem("smoke.init", "1"); } } catch (_) {} });
      await openSection(page, base, lang);
      const before = await rowsOf(page);
      let added = null;
      for (let n = 4; n < 40 && !added; n += 3) {
        const w = page.locator(".atlas-row .rm-w:not(.atlas-term):visible").nth(n);
        await w.scrollIntoViewIfNeeded();
        const ref = await w.evaluate((x) => ({ row: x.closest(".atlas-row").getAttribute("data-ref"), off: x.getAttribute("data-w-offset"), col: x.closest("[data-col]").getAttribute("data-col") }));
        await w.click();
        await page.waitForSelector('.rm-sheet.rm-open [data-rm-surface-action="add-term"]', { timeout: 15000 });
        await page.locator('.rm-sheet.rm-open [data-rm-surface-action="add-term"]').click();
        await page.waitForSelector(".atlas-term-dialog");
        const ok = await page.evaluate(() => {
          const d = document.querySelector(".atlas-term-dialog"), ru = d.querySelector('input[name="ru"]');
          if (!ru.value.trim()) { ru.value = "проверка"; ru.dispatchEvent(new Event("input")); }
          return !d.querySelector("[data-term-save]").disabled;
        });
        if (!ok) { await page.locator(".atlas-term-dialog [data-term-cancel]").click(); continue; }
        await page.screenshot({ path: path.join(out, `add-term-${lang}-${width}.png`) });
        await page.locator(".atlas-term-dialog [data-term-save]").click();
        await page.waitForSelector(".atlas-term-dialog", { state: "detached" });
        added = ref;
      }
      assert.ok(added, "a word could be added as a term");
      const sel = `.atlas-row[data-ref="${added.row}"] [data-col="${added.col}"] .rm-w[data-w-offset="${added.off}"]`;
      await page.waitForFunction((q) => document.querySelector(q) && document.querySelector(q).classList.contains("atlas-term"), sel, { timeout: 10000 });
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("room.atlas.myTerms.v1") || "[]"));
      assert.equal(stored.length, 1, "one personal term stored");
      await page.locator(sel).click();
      await page.waitForSelector('.rm-sheet.rm-open [data-rm-surface-action="edit-term"]', { timeout: 15000 });
      const kicker = await page.locator(".rm-sheet.rm-open .rm-surface-kicker").innerText();
      await page.screenshot({ path: path.join(out, `my-term-card-${lang}-${width}.png`) });
      // export from «Тренировать»
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);
      await page.locator(".atlas-train-btn").click();
      const head = await page.locator(".atlas-my-terms .atlas-view-head").innerText();
      const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("[data-my-terms-export]").click()]);
      const file = await dl.path();
      const exported = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      assert.equal(exported[0].id, stored[0].id, "the export holds the term");
      // an import whose save fails must not report success (final review 2026-11-03)
      await page.evaluate(() => { const orig = Storage.prototype.setItem; window.__lpOrigSetItem = orig;
        Storage.prototype.setItem = function (k, v) { if (k === "room.atlas.myTerms.v1") throw new Error("QuotaExceededError"); return orig.call(this, k, v); }; });
      await page.locator('.atlas-my-terms input[type="file"]').setInputFiles(file);
      await page.waitForFunction(() => { const st = document.querySelector(".atlas-my-terms .atlas-train-note"); return st && !st.hidden && st.textContent.length > 0; }, null, { timeout: 10000 });
      const importStatus = await page.locator(".atlas-my-terms .atlas-train-note").innerText();
      await page.evaluate(() => { Storage.prototype.setItem = window.__lpOrigSetItem; });
      assert.ok(!/Загружено|Terms imported|נטענו/.test(importStatus), "a failed save is not reported as imported: " + importStatus);
      await page.locator(".atlas-train-btn").click();
      // delete it from its card
      await page.locator(sel).click();
      await page.locator('.rm-sheet.rm-open [data-rm-surface-action="edit-term"]').click();
      await page.locator(".atlas-term-dialog [data-term-delete]").click();
      await page.waitForFunction((q) => !document.querySelector(q).classList.contains("atlas-term"), sel, { timeout: 10000 });
      const after = await rowsOf(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      report.push({ g2: { lang, width, added, kicker, head, exported: exported.length, before, after, overflow, errors: errors.length } });
      assert.ok(/Мой термин|המונח שלי|My term/.test(kicker), "the card says it is my term: " + kicker);
      assert.match(head, /\(1\)/);
      assert.deepEqual(after, before, "adding and deleting a term write nothing into word_status / review_log");
      assert.ok(overflow <= 1, "no horizontal scroll");
      assert.deepEqual(errors, [], "no page errors");
      await context.close();
    }
    // G3: «Термины раздела» → a session; one review per explicit answer, the term is the atlas's own target (not in the
    // Room's due queue or word counts), replay of the log gives the same schedule; «Учить этот термин» from the card
    if (!process.argv.includes("--no-g3")) for (const [lang, width] of [["ru", 390], ["he", 1440]]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openSection(page, base, lang);
      const before = await rowsOf(page);
      await page.locator(".atlas-train-btn").click();
      const line0 = await page.locator(".atlas-section-terms .atlas-stage-desc").innerText();
      await page.locator("[data-terms-learn]").click();
      await page.waitForSelector(".atlas-ts-term");
      const term = await page.locator(".atlas-ts-term").innerText();
      const marked = await page.locator(".atlas-ts-sentence mark").count();
      await page.locator("[data-ts-reveal]").click();
      const meaning = await page.locator(".atlas-ts-ru").innerText();
      await page.screenshot({ path: path.join(out, `term-session-${lang}-${width}.png`) });
      await page.locator('[data-ts-grade="1"]').click();
      await page.waitForFunction(() => !document.querySelector("[data-ts-grade]"), null, { timeout: 10000 });
      await page.locator("[data-ts-reveal]").click();
      await page.locator('[data-ts-grade="0"]').click();
      await page.waitForTimeout(500);
      await page.locator('[data-ts-close]').last().click();
      await page.waitForSelector(".atlas-term-dialog", { state: "detached" });
      const after = await rowsOf(page);
      const db = await page.evaluate(async () => {
        const db = await import("/db/local-db.js?v=852");
        const terms = await db.getAtlasTermStates("a97002"), keys = Object.keys(terms);
        const sched = await db.getSrsSchedule(), due = await db.getDueWithSource(Date.now() + 400 * 86400e3), words = await db.getAllWordStatuses();
        const log = await db.dbQuery("SELECT item_key, kind, channel, grade, meta_json FROM review_log WHERE item_key LIKE 'at1:%' ORDER BY reviewed_at");
        // the canon's independent oracle (memory-canon B4): replay the raw log, compare the DSR state
        const k = keys[0], st = terms[k], o = window.FsrsCore.replay(await db.getReviewLog(k));
        const same = !!(o && Math.abs(o.stability - st.stability) < 1e-7 && Math.abs(o.difficulty - st.difficulty) < 1e-7 &&
          o.reps === st.reps && o.lapses === st.lapses && o.lastReviewedAt === st.reviewedAt);
        const stored = JSON.stringify(st), replayed = JSON.stringify(o);
        const day = new Date(); day.setHours(0, 0, 0, 0);
        const budget = await db.getDayGradeCounts(day.toISOString());
        return { budget, keys, log, inSchedule: Object.keys(sched).filter((x) => x.startsWith("at1:")).length,
          inDue: due.filter((x) => String(x.lemmaKey).startsWith("at1:")).length, inWords: Object.keys(words).filter((x) => x.startsWith("at1:")).length,
          replaySame: same, stored, replayed };
      });
      const line1 = await page.locator(".atlas-section-terms .atlas-stage-desc").innerText();
      // «Учить этот термин» from a term word's card: a session of one
      if (await page.locator(".atlas-train-panel").isVisible()) await page.locator(".atlas-train-btn").click();
      const tw = page.locator(".atlas-row .rm-w.atlas-term:visible").nth(2);
      await tw.scrollIntoViewIfNeeded(); await tw.click();
      await page.waitForSelector('.rm-sheet.rm-open [data-rm-surface-action="learn-term"]', { timeout: 15000 });
      await page.locator('.rm-sheet.rm-open [data-rm-surface-action="learn-term"]').click();
      await page.waitForSelector(".atlas-ts-term");
      const single = await page.locator(".atlas-view-head").filter({ hasText: "/ 1" }).count();
      await page.locator('[data-ts-close]').last().click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      report.push({ g3: { lang, width, line0, term, marked, meaning, line1, before, after, db, single, overflow, errors: errors.length } });
      assert.ok(/\d/.test(line0), "the section terms are counted: " + line0);
      assert.ok(/[א-ת]/.test(term) && meaning.length > 1, "the term is asked in Hebrew and answered with its meaning");
      assert.equal(after.review_log - before.review_log, db.log.filter((r) => r.kind === "review").length + db.log.filter((r) => r.kind === "seed").length);
      assert.equal(db.log.filter((r) => r.kind === "review").length, 2, "one review per answer (remember, then forgot; the session closed before the miss came back)");
      assert.ok(db.log.every((r) => r.kind !== "review" || r.channel === "atlas:term"));
      assert.equal(db.inSchedule + db.inDue + db.inWords, 0, "an atlas term is not a word: not in the Room's schedule, due queue or word list");
      assert.deepEqual(db.budget, { reviews: 0, newWords: 0 }, "atlas term reviews do not use the Room's daily budget");
      assert.ok(db.replaySame, "replay(log) == stored: " + db.stored + " vs " + db.replayed);
      assert.ok(line1 !== line0, "the counts follow the session");
      assert.equal(single, 1, "«Учить этот термин» asks one term");
      assert.ok(overflow <= 1, "no horizontal scroll");
      assert.deepEqual(errors, [], "no page errors");
      await context.close();
    }
    // G4: «Найди в книге» — a right answer is «exact», a wrong section is said, the answer's page opens with the paragraph
    // marked, the history is on the device, nothing is written into word_status / review_log
    if (!process.argv.includes("--no-g4")) for (const [lang, width] of [["ru", 390], ["he", 1440]]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openSection(page, base, lang);
      const before = await rowsOf(page);
      await page.locator(".atlas-train-btn").click();
      await page.locator("[data-find-here]").click();
      await page.waitForSelector(".atlas-find-text");
      const bank = await page.evaluate(() => fetch("/data/atlas/a97002/train/find.json").then((r) => r.json()));
      const answerOf = async () => { const t = await page.locator(".atlas-find-text").innerText(); return bank.items.find((x) => x.he === t.trim()); };
      const first = await answerOf();
      assert.ok(first && first.sid === "s09-belt", "«Этот раздел» asks this section: " + (first && first.sid));
      await page.locator('select[name="sid"]').selectOption(first.sid);
      await page.locator('input[name="page"]').fill(String(first.page));
      await page.screenshot({ path: path.join(out, `find-ask-${lang}-${width}.png`) });
      await page.locator("[data-find-check]").click();
      const verdict1 = await page.locator(".atlas-find-result .atlas-ts-ru").innerText();
      await page.locator("[data-find-next]").click();
      const second = await answerOf();
      await page.locator('select[name="sid"]').selectOption("s10-spur-gears");
      await page.locator("[data-find-check]").click();
      const verdict2 = await page.locator(".atlas-find-result .atlas-ts-ru").innerText();
      await page.screenshot({ path: path.join(out, `find-answer-${lang}-${width}.png`) });
      await page.locator("[data-find-open]").click();
      await page.waitForFunction((b) => { const r = document.querySelector('.atlas-row.atlas-row-flash'); return r && r.getAttribute("data-ref") === b; }, second.block, { timeout: 15000 });
      const history = await page.evaluate(() => JSON.parse(localStorage.getItem("room.atlas.find.v1") || "[]"));
      const after = await rowsOf(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      report.push({ g4: { lang, width, bank: bank.items.length, first: first.id, verdict1, second: second.id, verdict2, history: history.map((x) => [x.section, x.page]), before, after, overflow, errors: errors.length } });
      assert.deepEqual(history.map((x) => [x.section, x.page]), [[true, "exact"], [false, "wrong"]]);
      assert.notEqual(verdict1, verdict2);
      assert.deepEqual(after, before, "the exercise writes nothing into word_status / review_log");
      assert.ok(overflow <= 1, "no horizontal scroll");
      assert.deepEqual(errors, [], "no page errors");
      await context.close();
    }
    // G5: «Что это за символ?» — the formula and the symbol in MathML, four options, feedback, the whole table after the
    // last symbol, «Открыть» marks the formula; Hebrew options at stage 3 (Г5); nothing written
    if (!process.argv.includes("--no-g5")) for (const [lang, width, stage] of [["ru", 390, 0], ["he", 1440, 3]]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((st) => { try { if (!sessionStorage.getItem("smoke.init")) { localStorage.setItem("room.atlas.stage.v1", JSON.stringify(st ? { "s09-belt": st } : {})); sessionStorage.setItem("smoke.init", "1"); } } catch (_) {} }, stage);
      await openSection(page, base, lang);
      const before = await rowsOf(page);
      await page.locator(".atlas-train-btn").click();
      const intro = await page.locator(".atlas-sym-block .atlas-stage-desc").innerText();
      await page.locator("[data-sym-start]").click();
      await page.waitForSelector(".atlas-sym-formula math", { state: "attached" });
      const firstOptions = await page.locator("[data-sym-meaning]").allInnerTexts();
      await page.screenshot({ path: path.join(out, `symbol-ask-${lang}-${width}.png`) });
      let symbols = 0;
      while (await page.locator("[data-sym-meaning]").count()) {
        await page.locator("[data-sym-meaning]").first().click();
        if (await page.locator("[data-sym-unit]").count()) await page.locator("[data-sym-unit]").first().click();
        await page.locator("[data-sym-check]").click();
        await page.waitForSelector(".atlas-sym-feedback");
        symbols++;
        await page.locator("[data-sym-next]").first().click();
        if (await page.locator(".atlas-sym-table").count()) break;
      }
      const rows = await page.locator(".atlas-sym-table tr").count();
      await page.screenshot({ path: path.join(out, `symbol-table-${lang}-${width}.png`) });
      await page.locator("[data-sym-open]").click();
      await page.waitForSelector(".atlas-formula.atlas-row-flash", { timeout: 10000 });
      const after = await rowsOf(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      report.push({ g5: { lang, width, stage, intro, firstOptions, symbols, rows, before, after, overflow, errors: errors.length } });
      assert.ok(/\d/.test(intro), "the section's formulas are counted: " + intro);
      assert.equal(firstOptions.length, 4);
      if (stage >= 2) assert.ok(firstOptions.every((x) => /[א-ת]/.test(x)), "Hebrew options at stage 3: " + firstOptions);
      else assert.ok(firstOptions.every((x) => /[а-яА-Я]/.test(x)), "Russian options at stage 0: " + firstOptions);
      assert.ok(symbols >= 2 && rows === symbols, "one question per symbol, then the whole table");
      assert.deepEqual(after, before, "the exercise writes nothing into word_status / review_log");
      assert.ok(overflow <= 1, "no horizontal scroll");
      assert.deepEqual(errors, [], "no page errors");
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1) + "\n");
    console.log(JSON.stringify(report, null, 1));
  }
})().catch((e) => { console.error(e); process.exit(1); });
