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
      HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () {};
    });
    await page.route("**/api/audio/**", async route => {
      if (/\/timing(?:\?|$)/.test(route.request().url())) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ words: [] }) });
      return route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from("ID3") });
    });
    await page.goto(`${BASE}/library.html?canon=skip&public_corpus=${publisher.SLUG}&cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-public-corpus="${publisher.SLUG}"]`).waitFor({ timeout: 30000 });
    await page.locator(".room-text-title-link").first().click();
    await page.locator("#readerTaskLearningSupport:not([hidden]) .materials-learning-action.primary").waitFor({ timeout: 30000 });
    const reviewBefore = await page.evaluate(() => window.__localDB.countReviewLog());
    await page.locator("#readerTaskLearningSupport .materials-learning-action.primary").click();
    const inline = page.locator("#materialsInlineSolution"); await inline.waitFor({ timeout: 30000 });
    assert.equal(await page.locator(".materials-learning-viewer").count(), 0, "Reader action must not open the standalone dialog");
    const initial = await page.evaluate(() => {
      const main = document.querySelector("#roomReaderTable #proTable"), tables = [...document.querySelectorAll(".materials-inline-table")];
      const controls = [...document.querySelectorAll("#materialsInlineSolution button")].filter(node => node.getClientRects().length);
      return { tables: tables.length, rows: document.querySelectorAll(".materials-inline-table tbody tr[data-row-idx]").length,
        colsMatch: tables.every(table => table.dataset.cols === main.dataset.cols),
        widthsMatch: tables.every(table => [...table.querySelectorAll("col")].every((col, index) => col.style.width === main.querySelectorAll("col")[index]?.style.width)),
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tinyControls: controls.filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).map(node => node.textContent.trim()),
        expanded: document.querySelector("#readerTaskLearningSupport .materials-learning-action.primary")?.getAttribute("aria-expanded"),
        inlineOpen: document.body.classList.contains("materials-inline-open") };
    });
    assert.ok(initial.tables === 1 && initial.rows > 10, JSON.stringify(initial));
    assert.ok(initial.colsMatch && initial.widthsMatch && !initial.documentOverflow && initial.expanded === "true" && initial.inlineOpen, JSON.stringify(initial));
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

    const trigger = page.locator("#readerTaskLearningSupport .materials-learning-action.primary");
    await trigger.click(); assert.equal(await inline.count(), 0); assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true, "collapse returns focus to its trigger");
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors.filter(value => /TypeError|ReferenceError|materials/i.test(value)), []);
    const report = { gate: "MATERIALS_PB2_INLINE_READER_LOCAL_BROWSER", version: "3.11.455", viewport: "380x845",
      publication_items: publication.full.items, solution: initial, reflow_200pct: reflow200, mobile_he: mobileHe, desktop,
      review_log_delta: 0, page_errors: pageErrors,
      screenshots: fs.readdirSync(OUT).filter(name => name.endsWith(".png")).sort() };
    fs.writeFileSync(path.join(OUT, "local-browser-verification.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    await context.close();
  } catch (error) { error.message += `\nSERVER_LOGS=${logs.slice(-3000)}`; throw error; }
  finally { if (browser) await browser.close(); await stop(server); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { process.stderr.write((error.stack || error.message) + "\n"); process.exitCode = 1; });
