"use strict";

// Isolated visual/interaction acceptance. Run against the --hold URL emitted by
// physics-task-resources-smoke.js. The browser context is fresh and anonymous.

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_OUT = path.join(ROOT, "docs", "research", "physics-solutions-forum", "2026-08-25", "implementation", "screenshots");

async function main() {
  const target = process.argv[2];
  if (!/^http:\/\/127\.0\.0\.1:\d+\/library\.html\?public_corpus=physics-year1-problems$/.test(target || "")) {
    throw new Error("usage: node physics-task-resources-browser-smoke.js <isolated-hold-url>");
  }
  const outDir = path.resolve(process.argv[3] || DEFAULT_OUT);
  if (!outDir.startsWith(ROOT + path.sep)) throw new Error("SCREENSHOT_PATH_OUTSIDE_REPO");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const checks = [];
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "ru-RU" });
    await desktop.goto(target, { waitUntil: "domcontentloaded" });
    await desktop.getByRole("heading", { name: "Выберите раздел" }).waitFor();
    assert.equal(await desktop.locator(".physics-section-button").count(), 10); checks.push("ten-section-controls");
    assert.deepEqual(await desktop.locator(".physics-section-copy > span").allTextContents(),
      ["74 задачи", "10 задач", "3 задачи", "8 задач", "14 задач", "3 задачи", "12 задач", "8 задач", "5 задач", "11 задач"]); checks.push("localized-counts");
    await desktop.screenshot({ path: path.join(outDir, "physics-sections-ru-desktop.png"), fullPage: false });
    await desktop.getByRole("button", { name: /Глава 4:/ }).click();
    await desktop.waitForTimeout(180);
    assert.equal(await desktop.locator("[data-public-work]").count(), 14);
    assert.equal(await desktop.locator("[data-public-work^='physics-year1-task-4-']").count(), 14); checks.push("section-filter");

    const mobile = await browser.newPage({ viewport: { width: 380, height: 844 }, isMobile: true, hasTouch: true, locale: "ru-RU" });
    await mobile.goto(target, { waitUntil: "domcontentloaded" });
    await mobile.getByRole("heading", { name: "Выберите раздел" }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 380); checks.push("mobile-no-overflow");
    const heights = await mobile.locator(".physics-section-button").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    assert.ok(Math.min(...heights) >= 44); checks.push("touch-targets");
    await mobile.screenshot({ path: path.join(outDir, "physics-sections-ru-380.png"), fullPage: false });
    await mobile.locator("#roomLang").selectOption("he");
    await mobile.waitForFunction(() => document.documentElement.lang === "he" && document.documentElement.dir === "rtl");
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 380);
    assert.notEqual(await mobile.locator(".physics-section-arrow").first().evaluate(node => getComputedStyle(node).transform), "none"); checks.push("he-rtl");
    await mobile.screenshot({ path: path.join(outDir, "physics-sections-he-rtl-380.png"), fullPage: false });

    await mobile.locator("#roomLang").selectOption("ru");
    await mobile.locator(".physics-section-button").filter({ hasText: "Все задачи" }).click();
    await mobile.waitForTimeout(180);
    await mobile.locator(".physics-task-resource").click();
    assert.equal(await mobile.locator(".physics-resource-overlay").count(), 1);
    assert.match(await mobile.locator(".physics-resource-frame").getAttribute("src"), /^\/api\/public-corpora\/physics-year1-problems\/resources\/[^/]+\/file#view=FitH$/);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 380); checks.push("mobile-pdf-viewer");
    await mobile.screenshot({ path: path.join(outDir, "physics-resource-viewer-ru-380.png"), fullPage: false });
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ ok: true, checks, screenshots: 4, isolated_browser: true, owner_profile: false, production_writes: false }) + "\n");
}

if (require.main === module) main().catch(error => { process.stderr.write((error.stack || error.message) + "\n"); process.exitCode = 1; });
