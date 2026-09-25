const L = require("./lib");
(async () => {
  const { browser, page, logs } = await L.open({ width: 380 });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("nav", f.url()); });
  const r = await page.goto(L.BASE + "/", { waitUntil: "domcontentloaded" });
  console.log("status", r.status());
  for (const s of [2, 5, 10, 20]) { await page.waitForTimeout(s * 1000 - (s > 2 ? 0 : 0));
    console.log(s, await page.evaluate(() => ({ url: location.href, ver: window.APP_VERSION, len: document.body ? document.body.innerText.length : -1, txt: document.body ? document.body.innerText.slice(0, 200) : "" }))); }
  console.log(logs);
  await L.shot(page, "01-first-run-380-ru");
  await browser.close();
})();
