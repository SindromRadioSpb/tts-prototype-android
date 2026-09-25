const L = require("./lib");
(async () => {
  const [,, url, name, w, loc] = process.argv;
  const { browser, page, logs } = await L.open({ width: +w || 380, locale: loc || "ru" });
  await page.goto(L.BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2500);
  await L.shot(page, name);
  console.log("title", await page.title(), "ver", await page.evaluate(() => window.APP_VERSION));
  const t = await L.targets(page);
  console.log("targets", t.length, "small", t.filter((x) => x.small).length);
  for (const x of t) console.log(JSON.stringify(x));
  console.log("errors", logs);
  await browser.close();
})();
