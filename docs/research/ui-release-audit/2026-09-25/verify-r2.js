"use strict";
// R2 verification: study table on a public video material. Page code comes from AUDIT_BASE
// (local server with the release under test); public-corpus API calls are proxied to production
// so a real material with video and timing is available. Usage:
//   AUDIT_BASE=http://127.0.0.1:3310 node verify-r2.js <tag> <width> <locale> [dark]
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const L = require("./lib");
const PROD = "https://linguistpro.kolosei.com";

(async () => {
  const [,, tag, w, loc, dark] = process.argv;
  const width = Number(w);
  const mobile = width < 600;
  const out = path.join(__dirname, "R2", "after");
  fs.mkdirSync(out, { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lp-r2-")), {
    viewport: { width, height: 800 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    colorScheme: dark ? "dark" : "light",
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await ctx.route(/\/api\/(public-corpora|publication|mediatheque)/, async (route) => {
    const u = new URL(route.request().url());
    const r = await fetch(PROD + u.pathname + u.search, { headers: { accept: route.request().headers().accept || "*/*" } });
    const body = Buffer.from(await r.arrayBuffer());
    const headers = {}; r.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) headers[k] = v; });
    await route.fulfill({ status: r.status, headers, body });
  });
  await page.addInitScript((l) => {
    localStorage.setItem("phase6FirstOpenSeen", "decline"); localStorage.setItem("onboardingSeen_v1", "1");
    if (l) localStorage.setItem("app.locale", l);
  }, loc || "ru");
  await page.goto(L.BASE + "/mediatheque.html");
  await page.waitForTimeout(5000);
  await page.locator("a,button").filter({ hasText: /Изучать|ללמוד|Study/ }).first().click();
  await page.waitForTimeout(10000);
  // Study mode on, as the owner uses it on the phone.
  await page.evaluate(() => { const cb = document.getElementById("roomStudyToggle"); if (cb && !cb.checked) cb.click(); }).catch(() => {});
  await page.click("#readerAidsToggle").catch(() => {});
  await page.waitForTimeout(600);
  const t = document => 0;
  const study = await page.$("#roomStudyToggle");
  if (study && !(await study.isChecked())) { await study.click(); await page.waitForTimeout(800); }
  await L.shot(page, `../R2/after/aa-${tag}`);
  await page.click("#readerAidsToggle").catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => { const v = document.querySelector("#proTable tbody tr"); if (v) v.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(600);
  await page.evaluate(() => scrollTo(0, 0));
  await L.shot(page, `../R2/after/study-${tag}`);
  const facts = await page.evaluate(() => {
    const tbl = document.querySelector("#proTable");
    const heads = tbl ? [...tbl.querySelectorAll("thead th")].map((th) => ({ text: th.textContent.trim(), h: Math.round(th.getBoundingClientRect().height), ws: getComputedStyle(th).whiteSpace })) : [];
    const firstRow = tbl && tbl.querySelector("tbody tr[data-row-idx]");
    const action = firstRow && firstRow.querySelector("td.col-action-cell");
    const btn = tbl && tbl.querySelector(".smk-row-replay");
    const r = btn && btn.getBoundingClientRect();
    const cell = tbl && tbl.querySelector("tbody td[data-col=ru]");
    const small = [...document.querySelectorAll("#proTable button")].filter((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && (q.width < 44 || q.height < 44); }).map((b) => b.className + " " + Math.round(b.getBoundingClientRect().width) + "x" + Math.round(b.getBoundingClientRect().height));
    return {
      app: window.APP_VERSION || (document.getElementById("roomFooterVersion") || {}).textContent,
      heads,
      rowNumber: action && action.getAttribute("data-row-n"),
      replay: btn ? { w: Math.round(r.width), h: Math.round(r.height), glued: btn.previousSibling && btn.previousSibling.textContent === " ", text: btn.textContent.trim(), inLastCell: btn.closest("td") === btn.closest("tr").lastElementChild } : null,
      wrap: cell ? { overflowWrap: getComputedStyle(cell).overflowWrap, wordBreak: getComputedStyle(cell).wordBreak } : null,
      smallButtons: [...new Set(small)].slice(0, 8),
      presetChecked: (document.querySelector(".reader-preset-row[aria-checked=true]") || {}).dataset?.preset || null,
    };
  });
  console.log(JSON.stringify(facts, null, 1));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
