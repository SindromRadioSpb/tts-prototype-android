"use strict";
// R7: Studio after build — the table comes into view, one status line, the save dialog and receipt.
// Usage: AUDIT_BASE=http://localhost:3310 node verify-r7.js <tag> <width> [locale] [dark]
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const L = require("./lib");
const TEXT = "שלום לכולם. היום אני לומד עברית בבית.\nהספר הזה מעניין מאוד, ואני קורא אותו כל ערב.\nמחר נלך לים עם החברים.";

(async () => {
  const [,, tag, w, loc, dark] = process.argv;
  const width = +w, mobile = width < 600;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r7-")), {
    viewport: { width, height: 800 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    colorScheme: dark ? "dark" : "light", forcedColors: process.env.FORCED ? "active" : "none",
  });
  const page = ctx.pages()[0];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript((l) => {
    localStorage.setItem("phase6FirstOpenSeen", "decline"); localStorage.setItem("onboardingSeen_v1", "1");
    if (l) localStorage.setItem("app.locale", l);
  }, loc || "ru");
  await page.goto(L.BASE + "/");
  await page.waitForTimeout(4000);
  const out = path.join(__dirname, "R7", "after");
  fs.mkdirSync(out, { recursive: true });
  const before = await page.evaluate(() => ({
    fab: !!(document.getElementById("classicOrientationFab") || {}).offsetHeight,
    usage: !!(document.getElementById("classicStatusStrip") || {}).offsetHeight,
  }));
  await page.fill("#inputText", TEXT);
  await page.click("#btnAiTranslate");
  await page.waitForSelector("#proTable tbody tr", { timeout: 60000 });
  await page.waitForTimeout(2500);
  const built = await page.evaluate(() => {
    const row = document.querySelector("#proTable tbody tr");
    const r = row.getBoundingClientRect();
    const meta = document.getElementById("classicResultPanelMeta");
    const more = document.getElementById("classicResultMore");
    const fab = document.getElementById("classicOrientationFab");
    return {
      firstRowTop: Math.round(r.top), firstRowInView: r.top >= 0 && r.bottom <= innerHeight,
      panelMeta: meta && meta.textContent, moreOpen: more && more.open,
      chipsVisible: !!document.getElementById("classicResultTrust").offsetHeight,
      jsonVisible: !!document.getElementById("btnTableEvidenceJson").offsetHeight,
      hotkeysVisible: !!(document.getElementById("hotkeysPanel") || {}).offsetHeight,
      fab: fab && { shown: !!fab.offsetHeight, pos: getComputedStyle(fab).position, text: fab.textContent },
    };
  });
  await L.shot(page, `../R7/after/built-${tag}`);
  // A locale pass must not reset the status line.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("i18n:changed")));
  await page.waitForTimeout(400);
  const afterLocale = await page.evaluate(() => document.getElementById("classicResultPanelMeta").textContent);
  await page.evaluate(() => { const s = document.getElementById("classicResultPanel"); if (s) s.scrollIntoView({ block: "start" }); });
  await L.shot(page, `../R7/after/result-${tag}`);
  await page.click("#btnSaveToLibrary");
  await page.waitForSelector("#v3SaveMetaModal:not(.hidden)", { timeout: 15000 });
  await page.waitForTimeout(800);
  const dialog = await page.evaluate(() => ({
    placeholders: ["v3SaveMetaTags", "v3SaveMetaSource", "v3SaveMetaTopic"].map((id) => document.getElementById(id).placeholder),
    closeButtons: [...document.querySelectorAll("#v3SaveMetaModal button")].filter((b) => b.offsetHeight && /Закрыть|Отмена|Close|Cancel|סגור|ביטול/.test(b.textContent)).length,
    saveBottom: Math.round(document.getElementById("v3SaveMetaSaveBtn").getBoundingClientRect().bottom), vh: innerHeight,
  }));
  await L.shot(page, `../R7/after/save-${tag}`);
  await page.click("#v3SaveMetaSaveBtn");
  await page.waitForSelector("#v3SaveMetaReceipt:not([hidden])", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const receipt = await page.evaluate(() => {
    const body = document.querySelector("#v3SaveMetaModal .v3-modal-body");
    const done = [...document.querySelectorAll("#v3SaveMetaCompleteActions button")].pop();
    const r = done && done.getBoundingClientRect();
    const summaryText = document.getElementById("v3SaveMetaReceiptSummary").textContent.trim();
    return {
      shown: !document.getElementById("v3SaveMetaReceipt").hidden,
      summaryRepeats: (body.innerText.split(summaryText).length - 1),
      providerVisible: !!document.getElementById("v3SaveMetaReceiptProvider").offsetHeight,
      cacheVisible: !!document.getElementById("v3SaveMetaReceiptCache").offsetHeight,
      doneInView: !!r && r.bottom <= innerHeight && r.top >= 0,
    };
  });
  await L.shot(page, `../R7/after/receipt-${tag}`);
  console.log(JSON.stringify({ tag, before, built, afterLocale, dialog, receipt, errors }, null, 1));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
