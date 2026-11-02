"use strict";
// Search navigation, responsive RU/HE, history, phrases, errors and print.
const { chromium } = require("playwright");
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
(async () => {
  const base = process.argv[2] || "http://localhost:3399",
    out = path.resolve(process.argv[3] || ".tmp/atlas-search-browser");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const lang of ["ru", "he"])
      for (const width of [390, 768, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.route("**/data/atlas/a97002/assets/**", async (route) => {
          const url = new URL(route.request().url());
          try {
            const r = await route.fetch({
              url: "https://linguistpro.kolosei.com" + url.pathname,
            });
            await route.fulfill({ response: r });
          } catch {
            await route.abort();
          }
        });
        await page.goto(base + "/library.html#room=atlas%3Aa97002");
        await page.waitForSelector(".atlas-home");
        await page
          .locator("select")
          .filter({ has: page.locator('option[value="he"]') })
          .first()
          .selectOption(lang);
        await page.locator(".atlas-search").fill("пружинами");
        await page.locator(".atlas-book-search").press("Enter");
        await page.waitForSelector("[data-search-result]");
        assert.equal(
          await page.locator("[data-search-unavailable]").count(),
          0,
        );
        await page.locator(".atlas-book-search").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(out, lang + "-" + width + "-results.png"),
        });
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        assert.ok(overflow <= 1, "overflow " + width + ":" + overflow);
        const address = page.url();
        await page.locator("[data-search-result]").first().click();
        await page.waitForSelector(".atlas-section .atlas-hit");
        await page.goBack();
        await page.waitForSelector("[data-search-result]");
        assert.equal(
          await page.locator(".atlas-search").inputValue(),
          "пружинами",
        );
        await page.reload();
        await page.waitForSelector("[data-search-result]");
        assert.equal(
          await page.locator(".atlas-search").inputValue(),
          "пружинами",
        );
        await page.locator("[data-search-result]").first().focus();
        await page.keyboard.press("ArrowDown");
        assert.ok(
          await page.locator(".atlas-search-results button:focus").count(),
        );
        await page.locator(".atlas-search").fill('"жёсткость пружины"');
        await page.locator(".atlas-book-search").press("Enter");
        await page.waitForSelector("[data-search-result]");
        await page.locator(".atlas-search").fill("zzzzunknown");
        await page.locator(".atlas-book-search").press("Enter");
        await page.waitForFunction(() =>
          document.querySelector('.atlas-search-results[aria-busy="false"]'),
        );
        assert.equal(await page.locator("[data-search-result]").count(), 0);
        if (width === 1440 && lang === "ru") {
          await page.evaluate(async () => {
            const data = await (
              await fetch("/data/atlas/a97002/sections/s09-belt.json")
            ).json();
            window.AtlasReader.preparePrint(document, data);
          });
          await page.emulateMedia({ media: "print" });
          await page.pdf({
            path: path.join(out, "print-s09-belt.pdf"),
            format: "A4",
            printBackground: true,
          });
        }
        report.push({
          lang,
          width,
          overflow,
          history: true,
          reload: true,
          phrase: true,
          keyboard: true,
          errors,
          address,
        });
        assert.deepEqual(errors, []);
        await context.close();
      }
  } finally {
    await browser.close();
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
  }
  console.log(JSON.stringify(report));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
