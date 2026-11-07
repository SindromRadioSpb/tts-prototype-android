#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");
const publisher = require("./publish-materials-pb2-corpus.js");
const runtimeBuilder = require("./build-materials-pb2-runtime-support.js");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3352, BASE = `http://127.0.0.1:${PORT}`, SECRET = "materials-inline-reader-secret";
const BUNDLE = path.join(ROOT, ".tmp", "materials-pb2-q043-rebake.zip");
const TTS_MANIFEST = path.join(ROOT, ".tmp", "materials-pb2-tts-full", "manifest.json");
const OUT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-09-01", "inline-reader");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "materials-inline-reader-"));
const dataDir = path.join(temp, "data"), dbPath = path.join(dataDir, "app.db");
const rightsPath = path.join(temp, "rights.json"), anchorPath = path.join(temp, "anchor.json"), supportRoot = path.join(temp, "support");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function writeRights(fullTts) {
  fs.writeFileSync(rightsPath, JSON.stringify({
    schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: publisher.SLUG,
    owner_attested: true, basis: "OWNER_ATTESTATION_MATERIALS_PB2_2026_08_30", asserted_at: "2026-08-30",
    classes: { source_text_and_diagrams: true, generated_learning_columns: true, independent_solutions: true,
      bilingual_solution_derivatives: true, public_read: true, public_solution_display_and_print: true,
      public_stream_current_zero_audio_edition: true, package_download: true, agent_derivative_text: true,
      full_tts_audio_and_timings: !!fullTts },
  }, null, 2) + "\n");
}
async function ready() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { const response = await fetch(BASE + "/healthz"), body = await response.json(); if (response.ok && body.db?.ready && body.migrations?.ready) return; } catch (_) {}
    await sleep(150);
  }
  throw new Error("SERVER_NOT_READY");
}
async function stop(child) {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
  const done = await new Promise(resolve => { const timer = setTimeout(() => resolve(false), 4000); child.once("exit", () => { clearTimeout(timer); resolve(true); }); });
  if (!done && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}

(async () => {
  fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  writeRights(false);
  const server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env,
    PORT: String(PORT), BIND_HOST: "127.0.0.1", DATA_DIR: dataDir, DB_PATH: dbPath,
    AUTH_BOOTSTRAP_SECRET: SECRET, MATERIALS_PB2_LEARNING_SUPPORT_PUBLIC_READ: "1",
    MATERIALS_PB2_LEARNING_SUPPORT_ROOT: supportRoot }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "", browser;
  server.stdout.on("data", value => { logs += value; }); server.stderr.on("data", value => { logs += value; });
  try {
    await ready();
    const loginResponse = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: "materials-inline-reader" }) });
    const login = await loginResponse.json(); assert.equal(loginResponse.status, 200, JSON.stringify(login));
    const publication = await publisher.main(["--apply", "--db-path", dbPath, "--data-dir", dataDir, "--bundle", BUNDLE,
      "--rights", rightsPath, "--anchor-output", anchorPath, "--owner-user-id", login.user.id, "--pilot-size", "3"]);
    writeRights(true);
    const runtime = runtimeBuilder.build({ anchorPath, rightsPath, bundlePath: BUNDLE, ttsManifestPath: TTS_MANIFEST, output: supportRoot });
    assert.equal(publication.full.items, 60); assert.equal(runtime.task_count, 60);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 845 }, locale: "ru-RU" });
    const page = await context.newPage(), pageErrors = [], consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.addInitScript(() => {
      localStorage.setItem("localMode", "1"); localStorage.setItem("v3OnboardingSeenV1", "1");
      localStorage.setItem("onboardingSeen_v1", "1"); localStorage.setItem("appLocale", "ru");
      localStorage.setItem("room.contextConsent", "declined");
      window.__materialsInlinePlayed = [];
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
      if (descriptor?.set && descriptor?.get) Object.defineProperty(HTMLMediaElement.prototype, "src", { configurable: true,
        get() { return descriptor.get.call(this); }, set(value) { window.__materialsInlinePlayed.push(String(value)); descriptor.set.call(this, value); } });
      HTMLMediaElement.prototype.play = function () { window.__lastMedia = this; this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () {};
    });
    await page.route("**/api/audio/**", async route => {
      if (/\/timing(?:\?|$)/.test(route.request().url())) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ words: [] }) });
      return route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from("ID3") });
    });
    await page.goto(`${BASE}/library.html?canon=skip&public_corpus=${publisher.SLUG}&cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-public-corpus="${publisher.SLUG}"]`).waitFor({ timeout: 30000 });
    const catalogCard = page.locator(".room-material-row").first();
    assert.equal(await catalogCard.locator(".materials-learning-action").count(), 1, "catalog card must expose only the full solution");
    assert.equal(await catalogCard.getByText("Краткий ответ", { exact: true }).count(), 0);
    // Озвученный учебный пакет — не «Аудио отсутствует» на карточке каталога.
    await catalogCard.locator(".learning-media").waitFor({ timeout: 30000 });
    assert.equal(await catalogCard.locator(".learning-media").getAttribute("class"), "learning-media media-full");
    await page.screenshot({ path: path.join(OUT, "materials-pb2-catalog-audio-380-ru.png"), fullPage: false });
    await catalogCard.locator(".materials-learning-action.primary").click();
    const standaloneViewer = page.locator(".materials-learning-viewer"); await standaloneViewer.waitFor({ timeout: 30000 });
    assert.equal(await page.locator(".materials-learning-viewer .materials-step-cell, .materials-learning-viewer .materials-step-col").count(), 0, "no «Шаг» column");
    assert.equal(await page.locator(".materials-learning-viewer .materials-audio-note").count(), 0, "ready audio needs no banner");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(OUT, "materials-pb2-standalone-desktop-ru.png"), fullPage: false });
    await page.setViewportSize({ width: 380, height: 845 });
    const standalone = await page.evaluate(() => ({
      rows: document.querySelectorAll(".materials-learning-table.is-solution .materials-learning-row").length,
      answerFirstRows: document.querySelectorAll('.materials-learning-table.is-solution [data-section="answer_first"]').length,
      semanticHeadings: document.querySelectorAll(".materials-section-name, .materials-inline-section-row").length,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert.ok(standalone.rows > 10 && standalone.answerFirstRows === 0 && standalone.semanticHeadings === 0 && !standalone.documentOverflow, JSON.stringify(standalone));
    await page.locator(".materials-learning-close").click();
    await page.locator(".room-text-title-link").first().click();
    // Решение раскрыто сразу под условием: кнопки «Открыть решение» в «Читать» больше нет.
    const inline = page.locator("#materialsInlineSolution"); await inline.waitFor({ timeout: 30000 });
    const reviewBefore = await page.evaluate(() => window.__localDB.countReviewLog());
    assert.equal(await page.locator("#readerTaskLearningSupport .materials-learning-action").count(), 0, "no expand/collapse toggle in the reader");
    assert.equal(await page.locator(".materials-learning-viewer").count(), 0, "Reader action must not open the standalone dialog");
    const initial = await page.evaluate(() => {
      const main = document.querySelector("#roomReaderTable #proTable"), tables = [...document.querySelectorAll(".materials-inline-table")];
      const controls = [...document.querySelectorAll("#materialsInlineSolution button")].filter(node => node.getClientRects().length);
      return { tables: tables.length, rows: document.querySelectorAll(".materials-inline-table tbody tr[data-row-idx]").length,
        answerFirstRows: document.querySelectorAll('.materials-inline-table [data-section="answer_first"]').length,
        semanticHeadings: document.querySelectorAll(".materials-section-name, .materials-inline-section-row").length,
        colsMatch: tables.every(table => table.dataset.cols === main.dataset.cols),
        widthsMatch: tables.every(table => [...table.querySelectorAll("col")].every((col, index) => col.style.width === main.querySelectorAll("col")[index]?.style.width)),
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tinyControls: controls.filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 24 || rect.height < 24; }).map(node => node.textContent.trim()),
        stepColumn: document.querySelectorAll(".materials-step-cell").length,
        inlineOpen: document.body.classList.contains("materials-inline-open") };
    });
    assert.ok(initial.tables === 1 && initial.rows > 10 && initial.answerFirstRows === 0 && initial.semanticHeadings === 0, JSON.stringify(initial));
    assert.ok(initial.colsMatch && initial.widthsMatch && !initial.documentOverflow && initial.stepColumn === 0 && initial.inlineOpen, JSON.stringify(initial));
    assert.deepEqual(initial.tinyControls, []);

    await page.locator("#readerAidsToggle").click();
    const translitToggle = page.locator("#readerAids label").filter({ hasText: "Транслит" }).locator('input[type="checkbox"]');
    await translitToggle.click();
    await page.waitForFunction(() => {
      const main = document.querySelector("#roomReaderTable #proTable");
      return main && [...document.querySelectorAll(".materials-inline-table")].every(table => table.dataset.cols === main.dataset.cols);
    });
    assert.equal(await inline.isVisible(), true, "settings rerender must retain the expanded solution");
    const studyToggle = page.locator("#roomStudyToggle"); await studyToggle.check();
    assert.equal(await page.evaluate(() => document.body.matches(".room-study.materials-inline-open") && !!document.querySelector("#materialsInlineSolution")), true);

    const firstRowButton = page.locator(".materials-inline-table .row-tts-btn").first();
    await firstRowButton.click();
    await page.waitForFunction(() => window.__materialsInlinePlayed.length > 0);
    // Выбранная строка решения остаётся подсвеченной, и «Прослушать решение» стартует с неё.
    const thirdRow = page.locator(".materials-inline-table tbody tr[data-row-idx]").nth(2);
    const thirdIdx = await thirdRow.getAttribute("data-row-idx");
    await thirdRow.locator(".row-tts-btn").click();
    await page.waitForFunction(i => document.querySelector(`.materials-inline-table tr[data-row-idx="${i}"]`)?.classList.contains("rm-row-current"), thirdIdx);
    assert.equal(await page.locator("#roomReaderTable tr.rm-row-current").count(), 0, "one working row for the whole task");
    await page.evaluate(() => window.__lastMedia && window.__lastMedia.dispatchEvent(new Event("ended")));   // строка доиграла
    await page.locator('[data-audio-action="play-solution"]').click();
    await page.waitForFunction(i => document.querySelector(".materials-inline-table tr.row-playing")?.getAttribute("data-row-idx") === i, thirdIdx);
    assert.equal(await page.locator(`.materials-inline-table tr[data-row-idx="${thirdIdx}"]`).getAttribute("class").then(c => /rm-row-current/.test(c)), true);
    // Верхняя ▶ начинает с выделенной строки условия, а не с первой.
    await page.locator("#roomReadAloud").click();   // старт: рабочая строка в решении → решение
    await page.waitForFunction(i => document.querySelector(".materials-inline-table tr.row-playing")?.getAttribute("data-row-idx") === i, thirdIdx);
    await page.locator("#roomReadAloud").click();   // стоп
    const conditionRow = page.locator("#roomReaderTable #proTable tbody tr[data-row-idx]").nth(1);
    await conditionRow.scrollIntoViewIfNeeded(); await conditionRow.locator("td").last().click();   // тап по строке условия
    await page.waitForFunction(() => document.querySelector("#roomReaderTable tr.rm-row-current")?.getAttribute("data-row-idx") === "1");
    assert.equal(await page.locator(".materials-inline-table tr.rm-row-current").count(), 0, "condition work clears the solution selection");
    await page.evaluate(() => window.__lastMedia && window.__lastMedia.dispatchEvent(new Event("ended")));   // строка доиграла
    await page.locator("#roomReadAloud").click();
    await page.waitForFunction(() => document.querySelector("#roomReaderTable tr.row-playing")?.getAttribute("data-row-idx") === "1");
    await page.locator("#roomReadAloud").click();
    const firstWord = page.locator('.materials-inline-table td[data-col="niqqud"] .rm-w[tabindex="0"]').first();
    await firstWord.click(); await page.locator(".rm-sheet.rm-open").waitFor({ timeout: 30000 });
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.__localDB.countReviewLog()), reviewBefore, "solution reading and morphology must not write review_log");
    await page.screenshot({ path: path.join(OUT, "materials-pb2-inline-solution-380-ru.png"), fullPage: false });

    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const reflow200 = await page.evaluate(() => ({ documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      inlineVisible: !!document.querySelector("#materialsInlineSolution")?.getClientRects().length }));
    assert.deepEqual(reflow200, { documentOverflow: false, inlineVisible: true });
    await page.screenshot({ path: path.join(OUT, "materials-pb2-inline-solution-380-ru-200pct.png"), fullPage: false });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; window.appSetLocale("he"); });
    await page.waitForFunction(() => document.documentElement.dir === "rtl");
    const mobileHe = await page.evaluate(() => ({ dir: document.documentElement.dir,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      inlineVisible: !!document.querySelector("#materialsInlineSolution")?.getClientRects().length }));
    assert.deepEqual(mobileHe, { dir: "rtl", documentOverflow: false, inlineVisible: true });
    await page.screenshot({ path: path.join(OUT, "materials-pb2-inline-solution-380-he-rtl.png"), fullPage: false });
    await page.evaluate(() => window.appSetLocale("ru")); await page.setViewportSize({ width: 1280, height: 900 });
    const desktop = await page.evaluate(() => ({ documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      inlineVisible: !!document.querySelector("#materialsInlineSolution")?.getClientRects().length }));
    assert.deepEqual(desktop, { documentOverflow: false, inlineVisible: true });
    await page.screenshot({ path: path.join(OUT, "materials-pb2-inline-solution-desktop-ru.png"), fullPage: false });

    // «Прочитано» и «Следующий для тебя» — после решения, а не между условием и решением.
    await page.locator("#materialsInlineSolution .materials-inline-table tbody tr[data-row-idx]").last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 4000);
    await page.locator("#readerEndCard").waitFor({ timeout: 15000 });
    const endCard = await page.evaluate(() => {
      const card = document.querySelector("#readerEndCard"), region = document.querySelector("#materialsInlineSolution");
      return { afterSolution: !!(card && region && (region.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)),
        insideConditionTable: !!card?.closest("#roomReaderTable"), endHead: !!card?.querySelector(".reader-end-head") };
    });
    assert.deepEqual(endCard, { afterSolution: true, insideConditionTable: false, endHead: false });
    await page.locator("#readerEndCard").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "materials-pb2-inline-solution-end-desktop-ru.png"), fullPage: false });
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors.filter(value => /TypeError|ReferenceError|materials/i.test(value)), []);
    const report = { gate: "MATERIALS_PB2_HONEST_FLAT_SOLUTION_LOCAL_BROWSER", version: "3.11.878", viewport: "380x845",
      publication_items: publication.full.items, standalone, solution: initial, reflow_200pct: reflow200, mobile_he: mobileHe, desktop,
      end_card: endCard, review_log_delta: 0, page_errors: pageErrors,
      screenshots: fs.readdirSync(OUT).filter(name => name.endsWith(".png")).sort() };
    fs.writeFileSync(path.join(OUT, "local-browser-verification.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    await context.close();
  } catch (error) { error.message += `\nSERVER_LOGS=${logs.slice(-3000)}`; throw error; }
  finally { if (browser) await browser.close(); await stop(server); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { process.stderr.write((error.stack || error.message) + "\n"); process.exitCode = 1; });
