#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const BASE = String(process.argv[2] || "https://linguistpro.kolosei.com").replace(/\/$/, "");
const SLUG = "materials-science-year1-problem-book-2";
const OUT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "production");
const SHOTS = path.join(OUT, "screenshots");
const PDF_OUT = path.join(ROOT, "output", "pdf");
const EXPECTED_MANIFEST = "47c95fa3268afbebfc5f75078755813290b3e67e2148a56c78ea16e4169879c0";
const sha256File = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function surfaceReport(page) {
  return page.evaluate(() => {
    const viewer = document.querySelector(".materials-learning-viewer");
    const visibleControls = [...viewer.querySelectorAll("button")].filter(node => node.getClientRects().length);
    const table = viewer.querySelector(".materials-solution-section .materials-learning-table");
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      document_overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      viewer_overflow: viewer.scrollWidth > viewer.clientWidth,
      table_rows: table.querySelectorAll("tbody tr").length,
      visible_columns: [...table.querySelectorAll("thead th")].filter(node => getComputedStyle(node).display !== "none").length,
      source_figures: viewer.querySelectorAll(".materials-source-figure img").length,
      tiny_controls: visibleControls.filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).map(node => node.textContent.trim()),
      audio_controls: viewer.querySelectorAll("audio, [data-materials-audio], .materials-audio-play").length,
      audio_deferred: /Аудио|Audio|שמע/.test(viewer.querySelector(".materials-audio-note")?.textContent || ""),
      morph_tokens: viewer.querySelectorAll(".materials-learning-table .rm-w").length,
      roving_cells_invalid: [...viewer.querySelectorAll('.materials-learning-table td[data-col="he"], .materials-learning-table td[data-col="niqqud"]')]
        .filter(cell => cell.querySelectorAll('.rm-w').length && cell.querySelectorAll('.rm-w[tabindex="0"]').length !== 1).length,
      derivation_rail: getComputedStyle(viewer.querySelector('.materials-solution-section .materials-step-cell')).borderInlineStartWidth,
    };
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(PDF_OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
    const page = await context.newPage();
    const pageErrors = [], failed = [], consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400 && /\/api\/public-corpora/.test(response.url())) failed.push(`${response.status()} ${response.url()}`); });
    await page.addInitScript(() => {
      localStorage.setItem("localMode", "1");
      localStorage.setItem("v3OnboardingSeenV1", "1");
      localStorage.setItem("onboardingSeen_v1", "1");
      localStorage.setItem("appLocale", "ru");
      localStorage.setItem("room.contextConsent", "declined");
    });
    await page.goto(`${BASE}/library.html?canon=skip&public_corpus=${SLUG}&cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-public-corpus="${SLUG}"]`).waitFor({ timeout: 30000 });
    const cardCount = await page.locator(".materials-learning-action.primary").count();
    assert.equal(cardCount, 48);
    const nextPage = page.locator(".public-corpus-page-next");
    assert.equal(await nextPage.isEnabled(), true);
    await nextPage.click();
    const secondPageCount = await page.locator(".materials-learning-action.primary").count();
    assert.equal(secondPageCount, 12);
    await page.locator(".public-corpus-page-prev").click();
    assert.equal(await page.locator(".materials-learning-action.primary").count(), 48);

    await page.locator(".materials-learning-action.answer").first().click();
    await page.locator(".materials-inline-answer:not([hidden])").first().waitFor();
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-production-card-answer-desktop-ru.png") });
    await page.locator(".materials-learning-action.primary").first().click();
    await page.locator(".materials-learning-viewer").waitFor();
    await page.locator(".materials-source-figure img").first().waitFor({ state: "attached" });
    const desktop = await surfaceReport(page);
    assert.equal(desktop.document_overflow, false);
    assert.equal(desktop.viewer_overflow, false);
    assert.equal(desktop.visible_columns, 5);
    assert.ok(desktop.table_rows > 10 && desktop.source_figures > 0 && desktop.audio_deferred && desktop.morph_tokens > 0);
    assert.equal(desktop.audio_controls, 0);
    assert.equal(desktop.roving_cells_invalid, 0);
    assert.equal(desktop.derivation_rail, "3px");
    assert.deepEqual(desktop.tiny_controls, []);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-production-solution-desktop-ru.png") });

    const firstMorphToken = page.locator('.materials-solution-section .materials-niqqud-cell .rm-w[tabindex="0"]').first();
    await firstMorphToken.focus();
    await page.keyboard.press("Enter");
    await page.locator(".rm-sheet.rm-open").waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('.rm-sheet.rm-open .rm-loading'), null, { timeout: 30000 });
    const morphology = await page.evaluate(() => {
      const viewer = document.querySelector('.materials-learning-viewer');
      const sheet = document.querySelector('.rm-sheet.rm-open');
      const card = sheet?.querySelector('.rm-sheet-card');
      const rect = card?.getBoundingClientRect();
      const top = rect && document.elementFromPoint(rect.left + rect.width / 2, rect.top + 12);
      return {
        viewer_open: !!viewer, sheet_open: !!sheet, sheet_topmost: !!top?.closest('.rm-sheet'),
        anchored_row: new URL(location.href).searchParams.get('materials_row'),
        active_row: viewer?.getAttribute('data-active-row') || null,
      };
    });
    assert.ok(morphology.viewer_open && morphology.sheet_open && morphology.sheet_topmost);
    assert.ok(morphology.anchored_row && morphology.anchored_row === morphology.active_row);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-production-morphology-desktop-ru.png") });
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.evaluate(() => ({
      viewer_open: !!document.querySelector('.materials-learning-viewer'),
      sheet_open: !!document.querySelector('.rm-sheet.rm-open'),
      focus_returned: document.activeElement?.classList.contains('rm-w') || false,
    })), { viewer_open: true, sheet_open: false, focus_returned: true });

    await page.locator('[data-mode="exam"]').click();
    const exam = await surfaceReport(page);
    assert.equal(exam.visible_columns, 2);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-production-exam-desktop-ru.png") });
    await page.locator('[data-mode="study"]').click();
    await page.setViewportSize({ width: 380, height: 844 });
    const mobileRu = await surfaceReport(page);
    assert.equal(mobileRu.document_overflow, false);
    assert.deepEqual(mobileRu.tiny_controls, []);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-production-solution-380-ru.png") });

    await page.locator(".materials-learning-close").click();
    await page.evaluate(() => window.appSetLocale("he"));
    await page.locator(".materials-learning-action.primary").first().click();
    await page.locator(".materials-learning-viewer").waitFor();
    const mobileHe = await surfaceReport(page);
    assert.equal(mobileHe.dir, "rtl");
    assert.equal(mobileHe.document_overflow, false);
    assert.deepEqual(mobileHe.tiny_controls, []);
    await page.screenshot({ path: path.join(SHOTS, "materials-pb2-production-solution-380-he-rtl.png") });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.appSetLocale("ru"));
    await page.locator(".materials-learning-close").click();
    await page.locator(".materials-learning-action.primary").first().click();
    await page.locator(".materials-learning-viewer").waitFor();
    await page.emulateMedia({ media: "print" });
    await page.locator(".materials-source-figure img").first().waitFor({ state: "visible" });
    await page.locator(".materials-source-figure img").first().evaluate(async image => { if (!image.complete) await new Promise(resolve => image.addEventListener("load", resolve, { once: true })); await image.decode(); });
    await page.evaluate(() => document.fonts.ready);
    const studyPdf = path.join(PDF_OUT, "materials-pb2-production-q001-study-4-columns.pdf");
    const examPdf = path.join(PDF_OUT, "materials-pb2-production-q001-exam-hebrew.pdf");
    await page.locator(".materials-learning-viewer").evaluate(async node => {
      node.setAttribute("data-print-mode", "study"); node.setAttribute("data-language-mode", "study");
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.notEqual(await page.locator(".materials-niqqud-cell").first().evaluate(node => getComputedStyle(node).display), "none");
    await page.pdf({ path: studyPdf, printBackground: true, preferCSSPageSize: true });
    await page.locator(".materials-learning-viewer").evaluate(async node => {
      node.setAttribute("data-print-mode", "exam"); node.setAttribute("data-language-mode", "exam");
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await page.locator(".materials-niqqud-cell").first().evaluate(node => getComputedStyle(node).display), "none");
    await page.pdf({ path: examPdf, printBackground: true, preferCSSPageSize: true });
    assert.notEqual(sha256File(studyPdf), sha256File(examPdf));
    await page.emulateMedia({ media: "screen" });

    const works = await page.request.get(`${BASE}/api/public-corpora/${SLUG}/works?limit=60`);
    assert.equal(works.status(), 200);
    const catalog = await works.json();
    assert.equal(catalog.items.length, 60);
    assert.equal(catalog.edition.manifest_sha256, EXPECTED_MANIFEST);
    let conditionRowCount = 0, solutionRowCount = 0, formulaSpeechReviewCount = 0;
    let firstSupportResponse = null, firstSupport = null;
    const sourceAssets = new Map();
    for (const item of catalog.items) {
      const response = await page.request.get(`${BASE}/api/public-corpora/${SLUG}/works/${item.public_work_id}/learning-support`);
      assert.equal(response.status(), 200);
      const support = await response.json();
      if (!firstSupport) { firstSupportResponse = response; firstSupport = support; }
      assert.equal(support.public_work_id, item.public_work_id);
      assert.equal(support.snapshot_sha256, item.snapshot_sha256);
      assert.equal(support.edition_manifest_sha256, EXPECTED_MANIFEST);
      assert.equal(support.review.publication_blocking, false);
      assert.equal(support.rights.public_read_allowed, true);
      assert.equal(support.rights.public_solution_display_and_print_allowed, true);
      assert.equal(support.audio_boundary.full_tts_generated, false);
      assert.equal(support.audio_boundary.timing_sidecars_present, false);
      assert.ok(support.agent_grounding && Array.isArray(support.solution_rows));
      conditionRowCount += support.condition.rows.length;
      solutionRowCount += support.solution_rows.length;
      for (const row of support.solution_rows) {
        assert.equal(row.audio_plan.timings_present, false);
        assert.ok(Array.isArray(row.audio_plan.karaoke_tokens));
        row.audio_plan.karaoke_tokens.forEach((token, index) => assert.equal(token.index, index));
        if (row.audio_plan.formula_speech_review_required) formulaSpeechReviewCount += 1;
      }
      for (const asset of support.condition.source_assets) sourceAssets.set(asset.sha256, asset);
    }
    assert.equal(conditionRowCount, 693);
    assert.equal(solutionRowCount, 1919);
    assert.equal(formulaSpeechReviewCount, 275);
    assert.equal(sourceAssets.size, 72);
    for (const [expectedSha256, asset] of sourceAssets) {
      const response = await page.request.get(BASE + asset.public_url);
      assert.equal(response.status(), 200);
      const bytes = await response.body();
      assert.equal(bytes.length, Number(asset.bytes));
      assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expectedSha256);
    }
    const supportResponse = firstSupportResponse, support = firstSupport;
    const assetResponse = await page.request.get(BASE + support.condition.source_assets[0].public_url);
    assert.equal(assetResponse.status(), 200);
    assert.match(assetResponse.headers().etag || "", /[a-f0-9]{64}/);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(consoleErrors.filter(value => /materials|TypeError|ReferenceError/i.test(value)), []);

    const report = {
      schema_version: "materials_pb2_production_browser_verification.1.0.0",
      verified_at: "2026-08-31",
      release_version: "3.11.452",
      anonymous: true,
      publication: { item_count: 60, first_page_items: cardCount, second_page_items: secondPageCount, edition_number: catalog.edition.edition_number, manifest_sha256: catalog.edition.manifest_sha256, audio_assets: 0 },
      desktop_ru: desktop,
      morphology,
      exam_desktop_ru: exam,
      mobile_ru: mobileRu,
      mobile_he: mobileHe,
      full_sweep: { support_cards: 60, condition_rows: conditionRowCount, solution_rows: solutionRowCount, source_assets: sourceAssets.size, formula_speech_review_required_rows: formulaSpeechReviewCount, audio_assets: 0, timing_sidecars: 0 },
      api: { works: works.status(), learning_support: supportResponse.status(), source_asset: assetResponse.status(), etag: assetResponse.headers().etag },
      pdf: {
        study: { file: path.relative(ROOT, studyPdf).replaceAll("\\", "/"), bytes: fs.statSync(studyPdf).size, sha256: sha256File(studyPdf) },
        exam: { file: path.relative(ROOT, examPdf).replaceAll("\\", "/"), bytes: fs.statSync(examPdf).size, sha256: sha256File(examPdf) }
      },
      page_errors: pageErrors,
      failed_public_responses: failed,
      screenshots: fs.readdirSync(SHOTS).filter(name => name.startsWith("materials-pb2-production-")).sort()
    };
    fs.writeFileSync(path.join(OUT, "production-live-browser-and-print-verification.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ ok: true, ...report }, null, 2) + "\n");
  } finally {
    await browser.close();
  }
})().catch(error => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
