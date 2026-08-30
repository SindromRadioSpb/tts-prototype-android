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
const PORT = 3349, BASE = `http://127.0.0.1:${PORT}`, SECRET = "materials-pb2-local-browser-secret";
const BUNDLE = path.join(ROOT, ".tmp", "materials-pb2-q043-rebake.zip");
const OUT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "production");
const SHOTS = path.join(OUT, "screenshots"), PDF_OUT = path.join(ROOT, "output", "pdf");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-browser-"));
const dataDir = path.join(temp, "data"), dbPath = path.join(dataDir, "app.db"), rightsPath = path.join(temp, "rights.json"), anchorPath = path.join(temp, "anchor.json"), supportRoot = path.join(temp, "support");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
function writeRights() {
  fs.writeFileSync(rightsPath, JSON.stringify({
    schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: publisher.SLUG, owner_attested: true,
    basis: "OWNER_ATTESTATION_MATERIALS_PB2_LOCAL_VISUAL_2026_08_30", asserted_at: "2026-08-30",
    classes: { source_text_and_diagrams: true, generated_learning_columns: true, independent_solutions: true,
      bilingual_solution_derivatives: true, public_read: true, public_solution_display_and_print: true,
      public_stream_current_zero_audio_edition: true,
      package_download: true, agent_derivative_text: true, full_tts_audio_and_timings: false },
  }, null, 2) + "\n");
}
async function surfaceReport(page) {
  return page.evaluate(() => {
    const viewer = document.querySelector(".materials-learning-viewer"), visibleControls = [...viewer.querySelectorAll("button")].filter(node => node.getClientRects().length);
    const table = viewer.querySelector(".materials-solution-section .materials-learning-table");
    return { lang: document.documentElement.lang, dir: document.documentElement.dir,
      document_overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      viewer_overflow: viewer.scrollWidth > viewer.clientWidth,
      table_rows: table.querySelectorAll("tbody tr").length,
      visible_columns: [...table.querySelectorAll("thead th")].filter(node => getComputedStyle(node).display !== "none").length,
      source_figures: viewer.querySelectorAll(".materials-source-figure img").length,
      tiny_controls: visibleControls.filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).map(node => node.textContent.trim()),
      audio_deferred: /Аудио|Audio|שמע/.test(viewer.querySelector(".materials-audio-note")?.textContent || ""),
    };
  });
}

(async () => {
  fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(PDF_OUT, { recursive: true });
  writeRights();
  const server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BIND_HOST: "127.0.0.1", DATA_DIR: dataDir, DB_PATH: dbPath,
    AUTH_BOOTSTRAP_SECRET: SECRET, MATERIALS_PB2_LEARNING_SUPPORT_PUBLIC_READ: "1", MATERIALS_PB2_LEARNING_SUPPORT_ROOT: supportRoot }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  let browser;
  try {
    await ready();
    const loginResponse = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: "materials-browser" }) });
    const login = await loginResponse.json(); assert.equal(loginResponse.status, 200, JSON.stringify(login));
    const publication = await publisher.main(["--apply", "--db-path", dbPath, "--data-dir", dataDir, "--bundle", BUNDLE,
      "--rights", rightsPath, "--anchor-output", anchorPath, "--owner-user-id", login.user.id, "--pilot-size", "3"]);
    const runtime = runtimeBuilder.build({ anchorPath, rightsPath, bundlePath: BUNDLE, output: supportRoot });
    assert.equal(publication.full.items, 60); assert.equal(runtime.task_count, 60); assert.equal(runtime.asset_count, 72);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
    const page = await context.newPage(), pageErrors = [], failed = [], consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400 && /\/api\/public-corpora/.test(response.url())) failed.push(`${response.status()} ${response.url()}`); });
    await page.addInitScript(() => { localStorage.setItem("localMode", "1"); localStorage.setItem("v3OnboardingSeenV1", "1"); localStorage.setItem("onboardingSeen_v1", "1"); localStorage.setItem("appLocale", "ru"); });
    await page.goto(`${BASE}/library.html?canon=skip&public_corpus=${publisher.SLUG}&cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-public-corpus="${publisher.SLUG}"]`).waitFor({ timeout: 30000 });
    await page.locator(".materials-learning-action.answer").first().click();
    await page.locator(".materials-inline-answer:not([hidden])").first().waitFor();
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-card-answer-desktop-ru.png"), fullPage: false });
    await page.locator(".materials-learning-action.primary").first().click();
    await page.locator(".materials-learning-viewer").waitFor();
    await page.locator(".materials-source-figure img").first().waitFor({ state: "attached" });
    const desktop = await surfaceReport(page);
    assert.equal(desktop.document_overflow, false); assert.equal(desktop.viewer_overflow, false); assert.equal(desktop.visible_columns, 5);
    assert.ok(desktop.table_rows > 10 && desktop.source_figures > 0 && desktop.audio_deferred); assert.deepEqual(desktop.tiny_controls, []);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-solution-desktop-ru.png"), fullPage: false });

    await page.locator('[data-mode="exam"]').click();
    const examScreen = await surfaceReport(page); assert.equal(examScreen.visible_columns, 2);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-exam-desktop-ru.png"), fullPage: false });
    await page.locator('[data-mode="study"]').click();
    await page.setViewportSize({ width: 380, height: 844 });
    const mobileRu = await surfaceReport(page);
    assert.equal(mobileRu.document_overflow, false); assert.deepEqual(mobileRu.tiny_controls, []);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-solution-380-ru.png"), fullPage: false });
    await page.locator(".materials-learning-close").click();
    await page.evaluate(() => window.appSetLocale("he"));
    await page.locator(".materials-learning-action.primary").first().click();
    await page.locator(".materials-learning-viewer").waitFor();
    const mobileHe = await surfaceReport(page);
    assert.equal(mobileHe.dir, "rtl"); assert.equal(mobileHe.document_overflow, false); assert.deepEqual(mobileHe.tiny_controls, []);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-solution-380-he-rtl.png"), fullPage: false });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.appSetLocale("ru"));
    await page.locator(".materials-learning-close").click();
    await page.locator(".materials-learning-action.primary").first().click();
    await page.locator(".materials-learning-viewer").waitFor();
    await page.emulateMedia({ media: "print" });
    const studyPdf = path.join(PDF_OUT, "materials-pb2-q001-study-4-columns.pdf"), examPdf = path.join(PDF_OUT, "materials-pb2-q001-exam-hebrew.pdf");
    await page.locator(".materials-learning-viewer").evaluate(async node => { node.setAttribute("data-print-mode", "study"); node.setAttribute("data-language-mode", "study"); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    assert.notEqual(await page.locator(".materials-niqqud-cell").first().evaluate(node => getComputedStyle(node).display), "none");
    await page.pdf({ path: studyPdf, printBackground: true, preferCSSPageSize: true });
    await page.locator(".materials-learning-viewer").evaluate(async node => { node.setAttribute("data-print-mode", "exam"); node.setAttribute("data-language-mode", "exam"); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    assert.equal(await page.locator(".materials-niqqud-cell").first().evaluate(node => getComputedStyle(node).display), "none");
    await page.pdf({ path: examPdf, printBackground: true, preferCSSPageSize: true });
    assert.notEqual(fs.readFileSync(studyPdf).toString("hex"), fs.readFileSync(examPdf).toString("hex"), "study and exam print artifacts must differ");
    await page.emulateMedia({ media: "screen" });

    const firstSupportResponse = await page.request.get(`${BASE}/api/public-corpora/${publisher.SLUG}/works/${publication.full.anchors?.[0]?.public_work_id || JSON.parse(fs.readFileSync(anchorPath)).items[0].public_work_id}/learning-support`);
    assert.equal(firstSupportResponse.status(), 200);
    const support = await firstSupportResponse.json(), assetResponse = await page.request.get(BASE + support.condition.source_assets[0].public_url);
    assert.equal(assetResponse.status(), 200); assert.match(assetResponse.headers().etag || "", /[a-f0-9]{64}/);
    assert.deepEqual(pageErrors, []); assert.deepEqual(failed, []);
    assert.deepEqual(consoleErrors.filter(value => /materials|TypeError|ReferenceError/i.test(value)), []);
    const report = { gate: "MATERIALS_PB2_LOCAL_BROWSER_AND_PRINT", publication: { pilot_items: 3, full_items: 60, audio_assets: 0, source_figures: 72 },
      desktop_ru: desktop, exam_desktop_ru: examScreen, mobile_ru: mobileRu, mobile_he: mobileHe,
      api: { learning_support: firstSupportResponse.status(), source_asset: assetResponse.status(), etag: assetResponse.headers().etag },
      pdf: { study: studyPdf, exam: examPdf }, page_errors: pageErrors, failed_public_responses: failed,
      screenshots: fs.readdirSync(SHOTS).filter(name => name.startsWith("materials-pb2-")).sort() };
    fs.writeFileSync(path.join(OUT, "local-browser-and-print-verification.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    await context.close();
  } catch (error) { error.message += `\nSERVER_LOGS=${logs.slice(-3000)}`; throw error; }
  finally { if (browser) await browser.close(); await stop(server); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { process.stderr.write((error.stack || error.message) + "\n"); process.exitCode = 1; });
