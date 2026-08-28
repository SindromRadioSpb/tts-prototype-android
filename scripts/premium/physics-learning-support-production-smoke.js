#!/usr/bin/env node
"use strict";

// Read-only production acceptance for the reviewed Physics learning layer.
// It verifies every immutable task anchor and exercises the learner UI from a
// fresh browser context. It never authenticates and never opens production DB.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = require("../../physics/year1-support/manifest.json");
const BASE = String(process.env.PHYSICS_PRODUCTION_ORIGIN || "https://linguistpro.kolosei.com").replace(/\/$/, "");
const EXPECTED_VERSION = "3.11.446";
const OUT = path.join(ROOT, "docs/research/physics-learning-derivatives/2026-08-27/production/screenshots");

async function mapLimited(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function endpoint(entry) {
  return `${BASE}/api/public-corpora/${encodeURIComponent(MANIFEST.corpus_slug)}/works/${encodeURIComponent(entry.public_work_id)}/learning-support`;
}

async function verifyApi() {
  const healthResponse = await fetch(`${BASE}/healthz`, { cache: "no-store" });
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.db?.ready, true);
  assert.equal(health.migrations?.ready, true);

  const shell = await (await fetch(`${BASE}/?physics_release_probe=${Date.now()}`, { cache: "no-store" })).text();
  assert.match(shell, new RegExp(`window\\.APP_VERSION\\s*=\\s*["']${EXPECTED_VERSION}["']`));

  await mapLimited(MANIFEST.tasks, 8, async entry => {
    const response = await fetch(endpoint(entry), { headers: { accept: "application/json" }, cache: "no-store" });
    assert.equal(response.status, 200, entry.task_number);
    assert.equal(response.headers.get("set-cookie"), null, entry.task_number);
    assert.match(response.headers.get("cache-control") || "", /public.*immutable/i, entry.task_number);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", entry.task_number);
    assert.match(response.headers.get("content-type") || "", /^application\/json/i, entry.task_number);
    assert.equal(response.headers.get("etag"), `"${entry.sha256}"`, entry.task_number);
    const body = await response.json();
    assert.equal(body.ok, true, entry.task_number);
    assert.equal(body.corpus_slug, MANIFEST.corpus_slug, entry.task_number);
    assert.equal(body.edition_id, MANIFEST.edition.edition_id, entry.task_number);
    assert.equal(body.edition_number, MANIFEST.edition.edition_number, entry.task_number);
    assert.equal(body.edition_manifest_sha256, MANIFEST.edition.manifest_sha256, entry.task_number);
    assert.equal(body.edition_item_id, entry.edition_item_id, entry.task_number);
    assert.equal(body.public_work_id, entry.public_work_id, entry.task_number);
    assert.equal(body.snapshot_sha256, entry.snapshot_sha256, entry.task_number);
    assert.equal(body.task_number, entry.task_number, entry.task_number);
    assert.equal(body.source?.image_sha256, entry.source_image_sha256, entry.task_number);
    assert.equal(body.derivative_sha256, entry.sha256, entry.task_number);
    assert.equal(body.review?.state, "OWNER_APPROVED_FOR_PRODUCTION", entry.task_number);
    assert.equal(body.review?.open_mismatch, false, entry.task_number);
    assert.equal(body.rights?.public_read_allowed, true, entry.task_number);
    assert.equal(body.rights?.agent_derivative_text_allowed, true, entry.task_number);
    assert.ok(body.beginner?.roadmap?.length >= 2, entry.task_number);
    assert.ok(body.exam_solution?.laws?.length >= 1, entry.task_number);
    assert.ok(body.exam_solution?.calculation?.length >= 1, entry.task_number);
    assert.ok(body.answer?.result, entry.task_number);
    assert.ok(body.agent_guidance?.rules?.length >= 3, entry.task_number);
  });

  const first = MANIFEST.tasks[0];
  let response = await fetch(endpoint(first), { headers: { "If-None-Match": `"${first.sha256}"` } });
  assert.equal(response.status, 304);
  response = await fetch(`${BASE}/api/public-corpora/${MANIFEST.corpus_slug}/works/work_missing/learning-support`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("set-cookie"), null);
  return { health, tasks: MANIFEST.tasks.length };
}

async function verifyBrowser() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  try {
    const first = MANIFEST.tasks[0];
    const target = `${BASE}/library.html?public_corpus=${MANIFEST.corpus_slug}&public_work=${first.public_work_id}&physics_release_probe=${Date.now()}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ru-RU", serviceWorkers: "block" });
    const desktop = await context.newPage();
    await desktop.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    const desktopAnswerButton = desktop.getByRole("button", { name: "Проверить ответ" }).first();
    await desktopAnswerButton.waitFor({ timeout: 90000 });
    const desktopActions = desktopAnswerButton.locator("xpath=..");
    await desktopAnswerButton.click();
    const inlineAnswer = desktopActions.locator(".physics-inline-answer");
    await inlineAnswer.waitFor();
    assert.ok((await inlineAnswer.innerText()).length > 10);
    checks.push("answer-first");
    await desktop.screenshot({ path: path.join(OUT, "physics-learning-card-answer-desktop-ru.png"), fullPage: false });

    await desktopActions.getByRole("button", { name: "Понять и решить" }).click();
    await desktop.locator(".physics-learning-disclosure summary", { hasText: "Экзаменационное решение" }).waitFor();
    assert.equal(await desktop.locator(".physics-learning-overlay").count(), 1);
    checks.push("full-walkthrough");
    await desktop.screenshot({ path: path.join(OUT, "physics-learning-solution-desktop-ru.png"), fullPage: false });
    const examSummary = desktop.locator(".physics-learning-exam > summary");
    await examSummary.click();
    await examSummary.scrollIntoViewIfNeeded();
    assert.ok(await desktop.locator(".physics-learning-exam .physics-math-op").count() > 0);
    assert.ok(await desktop.locator(".physics-learning-exam sub").count() > 0);
    assert.doesNotMatch(await desktop.locator(".physics-learning-exam").innerText(), /\*/);
    checks.push("unambiguous-math");
    await desktop.screenshot({ path: path.join(OUT, "physics-learning-exam-desktop-ru.png"), fullPage: false });

    await desktop.getByRole("button", { name: "Закрыть разбор" }).click();
    await desktop.setViewportSize({ width: 380, height: 844 });
    const mobile = desktop;
    await desktopActions.getByRole("button", { name: "Понять и решить" }).click();
    await mobile.locator(".physics-learning-disclosure summary", { hasText: "Экзаменационное решение" }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    checks.push("mobile-no-overflow");
    await mobile.screenshot({ path: path.join(OUT, "physics-learning-solution-380-ru.png"), fullPage: false });
    await mobile.getByRole("button", { name: "Закрыть разбор" }).click();
    const backToShelves = mobile.getByRole("button", { name: /Полки/ });
    if (await backToShelves.count()) await backToShelves.click();
    await mobile.locator("#roomLang").selectOption("he");
    await mobile.waitForFunction(() => document.documentElement.lang === "he" && document.documentElement.dir === "rtl");
    const heUnderstand = mobile.getByRole("button", { name: "להבין ולפתור" }).first();
    await heUnderstand.waitFor({ timeout: 30000 });
    await heUnderstand.click();
    await mobile.locator(".physics-learning-disclosure summary", { hasText: "פתרון מלא במבנה בחינה" }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    checks.push("he-rtl");
    await mobile.screenshot({ path: path.join(OUT, "physics-learning-solution-380-he-rtl.png"), fullPage: false });
  } finally {
    await browser.close();
  }
  return checks;
}

async function main() {
  const api = await verifyApi();
  const browserChecks = await verifyBrowser();
  process.stdout.write(JSON.stringify({ ok: true, origin: BASE, version: EXPECTED_VERSION,
    api_tasks: api.tasks, db_ready: api.health.db.ready, migrations_ready: api.health.migrations.ready,
    browser_checks: browserChecks, screenshots: 5, authenticated: false, production_writes: false }) + "\n");
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`physics-learning-support-production-smoke: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
