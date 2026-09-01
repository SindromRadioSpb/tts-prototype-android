#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const BASE = String(process.argv[2] || "https://linguistpro.kolosei.com").replace(/\/$/, "");
const SLUG = "materials-science-year1-problem-book-2";
const TASK_ID = "materials-science-y1-pb2-q001";
const BAKE_ROOT = path.join(ROOT, ".tmp", "materials-pb2-tts-task1");
const AUDIO_ROOT = path.join(BAKE_ROOT, "audio-cache");
const OUT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-09-01", "tts", "production-pilot");
const SHOTS = path.join(OUT, "screenshots");

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  assert.equal(response.status, 200, `${response.status} ${url}`);
  return response.json();
}

function task1Support(publicSupport, ttsManifest) {
  const refs = new Map(ttsManifest.references.map(ref => [ref.row_id, ref]));
  const assetKeys = new Set(ttsManifest.assets.map(asset => asset.asset_key));
  const readyPlan = (row, ref) => ({
    ...(row.audio_plan || {}), state: "READY", synthesis_field: "hebrew_niqqud",
    audio_asset_key: ref.asset_key, spoken_he_niqqud: ref.spoken_he_niqqud,
    tts_profile: ttsManifest.profile, timings_present: true,
    timing_url: `/api/audio/${ref.asset_key}/timing`,
  });
  const conditionRows = publicSupport.condition.rows.map(row => {
    const ref = refs.get(row.row_id);
    assert.equal(ref?.source_kind, "condition", `condition ref ${row.row_id}`);
    assert.ok(assetKeys.has(ref.asset_key), `condition asset ${row.row_id}`);
    refs.delete(row.row_id);
    return { ...row, audio_asset_key: ref.asset_key, audio_tts_profile: ttsManifest.profile,
      audio_plan: readyPlan(row, ref) };
  });
  const solutionRows = publicSupport.solution_rows.map(row => {
    const ref = refs.get(row.row_id);
    assert.equal(ref?.source_kind, "solution", `solution ref ${row.row_id}`);
    assert.ok(assetKeys.has(ref.asset_key), `solution asset ${row.row_id}`);
    refs.delete(row.row_id);
    return { ...row, audio_plan: readyPlan(row, ref) };
  });
  assert.equal(refs.size, 0, "every Task 1 TTS row reference must be consumed");
  return {
    ...publicSupport,
    condition: { ...publicSupport.condition, rows: conditionRows },
    solution_rows: solutionRows,
    audio_boundary: {
      ...publicSupport.audio_boundary, full_tts_generated: true, timing_sidecars_present: true,
      profile_id: ttsManifest.profile_id, profile: ttsManifest.profile,
    },
    rights: { ...publicSupport.rights, full_tts_audio_and_timings_allowed: true },
  };
}

function wordIndex(support, manifest) {
  return {
    schema_version: "materials_pb2_public_word_audio.1.0.0", corpus_slug: SLUG,
    edition_id: support.edition_id, edition_number: Number(support.edition_number),
    edition_manifest_sha256: support.edition_manifest_sha256,
    profile_id: manifest.profile_id, profile: manifest.profile,
    words: manifest.word_index.map(word => ({ ...word, audio_url: `/api/audio/${word.asset_key}` })),
  };
}

async function main() {
  const manifest = readJson(path.join(BAKE_ROOT, "manifest.json"));
  assert.deepEqual([...new Set(manifest.references.map(ref => ref.task_id))], [TASK_ID]);
  assert.equal(manifest.references.length, 33);
  assert.equal(manifest.assets.length, 91);
  const catalog = await fetchJson(`${BASE}/api/public-corpora/${SLUG}/works?limit=1`);
  assert.equal(catalog.items.length, 1);
  const item = catalog.items[0];
  const supportUrl = `${BASE}/api/public-corpora/${SLUG}/works/${item.public_work_id}/learning-support`;
  const publicSupport = await fetchJson(supportUrl);
  assert.equal(publicSupport.task_id, TASK_ID);
  assert.equal(publicSupport.audio_boundary.full_tts_generated, false,
    "the public edition must remain zero-audio until the whole formula gate passes");
  const injectedSupport = task1Support(publicSupport, manifest);
  const injectedWords = wordIndex(publicSupport, manifest);
  const config = await fetchJson(`${BASE}/api/client-config`);
  assert.equal(config.version, "3.11.454");
  const publicWordResponse = await fetch(`${BASE}/api/public-corpora/${SLUG}/learning-support/word-audio-index`);
  assert.equal(publicWordResponse.status, 404, "partial pilot must not leak through the public word index");

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const network = { rowHead: 0, timingGet: 0, audioGet: 0, wordIndex: 0 };
  const errors = [];
  try {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(String(error)));
    await page.addInitScript(() => {
      localStorage.setItem("localMode", "1");
      localStorage.setItem("v3OnboardingSeenV1", "1");
      localStorage.setItem("onboardingSeen_v1", "1");
      localStorage.setItem("appLocale", "ru");
      localStorage.setItem("room.contextConsent", "declined");
      window.__materialsPilotPlayed = [];
      const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
      if (src && src.set && src.get) Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true, enumerable: src.enumerable,
        get() { return src.get.call(this); },
        set(value) { window.__materialsPilotPlayed.push(String(value)); src.set.call(this, value); },
      });
      HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () {};
    });
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.href.split("?")[0] === supportUrl) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(injectedSupport) });
      }
      if (url.pathname === `/api/public-corpora/${SLUG}/learning-support/word-audio-index`) {
        network.wordIndex += 1;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(injectedWords) });
      }
      const match = url.pathname.match(/^\/api\/audio\/([a-f0-9]{64})(\/timing)?$/);
      if (match) {
        const key = match[1];
        assert.ok(manifest.assets.some(asset => asset.asset_key === key), `unknown pilot asset ${key}`);
        if (match[2]) {
          network.timingGet += 1;
          return route.fulfill({ status: 200, contentType: "application/json",
            body: fs.readFileSync(path.join(AUDIO_ROOT, `${key}.timing.json`)) });
        }
        if (request.method() === "HEAD") {
          network.rowHead += 1;
          return route.fulfill({ status: 200, contentType: "audio/mpeg", headers: { "Cache-Control": "public,max-age=31536000,immutable" } });
        }
        network.audioGet += 1;
        return route.fulfill({ status: 200, contentType: "audio/mpeg",
          headers: { "Cache-Control": "public,max-age=31536000,immutable" },
          body: fs.readFileSync(path.join(AUDIO_ROOT, `${key}.mp3`)) });
      }
      return route.continue();
    });

    await page.goto(`${BASE}/library.html?canon=skip&public_corpus=${SLUG}&cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-public-corpus="${SLUG}"]`).waitFor({ timeout: 30000 });
    await page.locator(".materials-learning-action.primary").first().click();
    const viewer = page.locator('.materials-learning-viewer[data-full-tts-generated="true"]');
    await viewer.waitFor({ timeout: 30000 });
    assert.equal(await page.locator(".materials-condition-section .row-tts-btn").count(), 2);
    assert.equal(await page.locator(".materials-solution-section .row-tts-btn").count(), 31);
    assert.equal(await page.locator(".materials-listen-section").count(), 2);
    assert.match(await page.locator(".materials-audio-note").innerText(), /аудио готово/i);

    const firstRow = page.locator(".materials-solution-section .materials-learning-row").first();
    const firstRowKey = await firstRow.evaluate(row => row.__materialsAudioRow._v3_audioAssetKey);
    await firstRow.locator(".row-tts-btn").click();
    await page.waitForFunction(() => window.__materialsPilotPlayed.some(url => /\/api\/audio\/[a-f0-9]{64}$/.test(url)));
    await page.waitForFunction(() => document.querySelector('.materials-solution-section .materials-learning-row')?.classList.contains('row-playing'));
    await page.waitForTimeout(100);
    assert.ok(network.rowHead >= 1 && network.timingGet >= 1);
    assert.ok((await page.evaluate(() => window.__materialsPilotPlayed)).some(url => url.endsWith(`/api/audio/${firstRowKey}`)));

    await page.screenshot({ path: path.join(SHOTS, "task-001-tts-solution-desktop-ru.png") });
    const token = page.locator('.materials-solution-section .materials-niqqud-cell .rm-w[tabindex="0"]').first();
    const tokenText = await token.innerText();
    await token.click();
    await page.locator(".rm-sheet.rm-open").waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('.rm-sheet.rm-open .rm-loading'), null, { timeout: 30000 });
    const resolvedWord = manifest.word_index.find(word => word.text === tokenText.normalize("NFC").trim());
    assert.ok(resolvedWord, `word index must contain ${tokenText}`);
    await page.locator(".rm-sheet.rm-open [data-rm-speak]").click();
    await page.waitForFunction(key => window.__materialsPilotPlayed.some(url => url.endsWith(`/api/audio/${key}`)), resolvedWord.asset_key);
    assert.equal(network.wordIndex, 1, "Room and Studio share one cached public word index resolver");
    await page.screenshot({ path: path.join(SHOTS, "task-001-tts-morphology-desktop-ru.png") });
    await page.keyboard.press("Escape");

    const fetchProof = await page.evaluate(async ({ rowKey, wordKey }) => {
      const [rowAudio, timing, wordAudio] = await Promise.all([
        fetch(`/api/audio/${rowKey}`).then(r => r.arrayBuffer()),
        fetch(`/api/audio/${rowKey}/timing`).then(r => r.json()),
        fetch(`/api/audio/${wordKey}`).then(r => r.arrayBuffer()),
      ]);
      return { row_bytes: rowAudio.byteLength, timing_n: timing.n, timing_got: timing.got, word_bytes: wordAudio.byteLength };
    }, { rowKey: firstRowKey, wordKey: resolvedWord.asset_key });
    assert.ok(fetchProof.row_bytes > 1000 && fetchProof.word_bytes > 1000);
    assert.ok(fetchProof.timing_n > 0 && fetchProof.timing_n === fetchProof.timing_got);

    await page.setViewportSize({ width: 380, height: 844 });
    const mobile = await page.evaluate(() => {
      const viewer = document.querySelector(".materials-learning-viewer");
      const controls = [...viewer.querySelectorAll("button")].filter(node => node.getClientRects().length);
      return {
        document_overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        viewer_overflow: viewer.scrollWidth > viewer.clientWidth,
        tiny_controls: controls.filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).length,
        audio_buttons: viewer.querySelectorAll(".row-tts-btn").length,
      };
    });
    assert.deepEqual(mobile, { document_overflow: false, viewer_overflow: false, tiny_controls: 0, audio_buttons: 33 });
    await page.screenshot({ path: path.join(SHOTS, "task-001-tts-solution-380-ru.png") });
    assert.deepEqual(errors, []);

    const report = {
      schema_version: "materials_pb2_task1_production_shell_tts_pilot.1.0.0",
      verified_at: "2026-09-01", release_version: config.version,
      boundary: { public_edition_full_tts_generated: false, public_word_audio_index_status: publicWordResponse.status,
        task1_assets_injected_only_into_isolated_browser: true, production_publication_performed: false },
      pilot: { task_id: TASK_ID, row_references: manifest.references.length, assets: manifest.assets.length,
        row_assets: manifest.assets.filter(asset => asset.asset_type === "row").length,
        word_assets: manifest.assets.filter(asset => asset.asset_type === "word").length,
        condition_audio_buttons: 2, solution_audio_buttons: 31, section_audio_buttons: 2,
        word_index_entries: manifest.word_index.length, first_row_asset_key: firstRowKey,
        first_word_asset_key: resolvedWord.asset_key, fetch_proof: fetchProof },
      network, mobile, page_errors: errors,
      screenshots: fs.readdirSync(SHOTS).filter(name => name.endsWith(".png")).sort(),
    };
    fs.writeFileSync(path.join(OUT, "task-001-production-shell-browser-verification.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ ok: true, ...report }, null, 2) + "\n");
  } finally { await browser.close(); }
}

main().catch(error => { process.stderr.write(`materials-pb2-tts-pilot-browser-smoke: ${error.stack || error.message}\n`); process.exitCode = 1; });
