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
    if(process.argv.includes('--measure-index')){
      const page=await browser.newPage();await page.goto(base+'/robots.txt');
      for(const name of ['corpus-fts','atlas-reader','atlas-search'])await page.addScriptTag({url:base+'/js/'+name+'.js'});
      const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      const performance=await page.evaluate(async()=>{const text=await(await fetch('/data/atlas/a97002/search.json')).text(),times=[];for(let n=0;n<5;n++){const start=window.performance.now();window.AtlasSearch.unpack(JSON.parse(text));times.push(window.performance.now()-start);}return {cpuThrottle:4,isolation:'Index only; no world renderer or app startup',indexBytes:new TextEncoder().encode(text).length,parseAndUnpackMs:times};});
      fs.writeFileSync(path.join(out,'index-performance.json'),JSON.stringify(performance,null,2));console.log(JSON.stringify(performance));return;
    }
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
        if (
          (width === 390 && lang === "he") ||
          (width === 1440 && lang === "ru")
        ) {
          await page.evaluate(() => {
            document.body.classList.remove("theme-light");
            document.body.classList.add("theme-dark");
          });
          await page
            .locator(".atlas-book-search")
            .evaluate((n) => n.scrollIntoView({ block: "start" }));
          await page.screenshot({
            path: path.join(out, lang + "-" + width + "-dark.png"),
          });
          const contrasts = await page.evaluate(() => {
            const rgb = (s) => (s.match(/[0-9.]+/g) || []).map(Number);
            const lum = (c) => {
              const v = c.slice(0, 3).map((n) => {
                n /= 255;
                return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
              });
              return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
            };
            return [
              ...document.querySelectorAll(
                ".atlas-result-page,.atlas-result-group h3,.atlas-book-search button",
              ),
            ]
              .slice(0, 10)
              .map((n) => {
                let b = n,
                  background;
                while (b) {
                  const c = rgb(getComputedStyle(b).backgroundColor);
                  if (c.length === 3 || c[3] === 1) {
                    background = c;
                    break;
                  }
                  b = b.parentElement;
                }
                const a = lum(rgb(getComputedStyle(n).color)),
                  v = lum(background || [255, 255, 255]);
                return (Math.max(a, v) + 0.05) / (Math.min(a, v) + 0.05);
              });
          });
          assert.ok(
            contrasts.every((v) => v >= 4.5),
            "text contrast " + contrasts,
          );
          await page.evaluate(() => {
            document.body.classList.remove("theme-dark");
            document.body.classList.add("theme-light");
          });
        }
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        assert.ok(overflow <= 1, "overflow " + width + ":" + overflow);
        let shown=50;
        if(width===390&&lang==='ru'){await page.locator('.atlas-search-more').click();shown=100;assert.equal(await page.locator('[data-search-result]').count(),shown);}
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
        if(shown===100)assert.equal(await page.locator("[data-search-result]").count(),100);
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
        // A real book example exercises the condition navigator through the UI.
        if (width === 390) {
          const gold = JSON.parse(
            fs.readFileSync(path.join(__dirname, "search-gold.a97002.json")),
          );
          const fragment = gold.queries.find((q) => q.id === "fragment-p38");
          await page.locator(".atlas-search").fill(fragment.q);
          await page.locator(".atlas-book-search").press("Enter");
          await page.waitForSelector(".atlas-search-fragment");
          await page.locator("[data-search-result]").first().click();
          await page.waitForSelector(".atlas-section .atlas-hit");
          assert.equal(
            await page.locator(".atlas-hit").first().getAttribute("data-ref"),
            "a97002:p38:b002",
          );
          await page.goBack();
          await page.waitForSelector(".atlas-search-fragment");
          await page.route("**/search.json", (route) =>
            route.fulfill({
              status: 503,
              body: "{}",
              contentType: "application/json",
            }),
          );
          await page.reload();
          await page.waitForSelector("[data-search-unavailable]");
          assert.equal(await page.locator("[data-search-result]").count(), 0);
          await page.unroute("**/search.json");
          await page.locator(".atlas-search").fill("пружина");
          await page.locator(".atlas-book-search").press("Enter");
          await page.waitForSelector("[data-search-result]");
        }
        if(width===390&&lang==='ru'){await page.locator('.atlas-search').press('Escape');await page.waitForSelector('.atlas-home');}
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
