#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3317;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, "docs", "research", "room-library-surface-unification", "2026-08-14", "implementation", "screenshots");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
  if (!exited && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

const groupCorpus = {
  corpus_id: "ia-study-songs", slug: "ia-study-songs", title: "Учебные песни IA",
  version: 1, status: "PILOT", visibility: "GROUP_RESTRICTED", role: "MEMBER",
};
const groupWorks = Array.from({ length: 81 }, (_, index) => ({
  work_id: `ia-song-${index + 1}`, text_key: `ia-song-key-${index + 1}`, position_no: index + 1,
  title: `שיר לימוד ארוך ${String(index + 1).padStart(2, "0")}`, artist: index % 2 ? "זמר א" : "זמר ב",
  rows_count: 30 + (index % 9), audio_count: index % 3 ? 30 : 0, level: index % 2 ? "א" : "ב",
  tags: [index % 2 ? "קצב" : "אוצר מילים"], topic: "שירים",
}));

async function installRoutes(page) {
  await page.route("**/api/group-corpora**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/group-corpora") {
      return route.fulfill({ json: { ok: true, corpora: [{ ...groupCorpus, works_count: groupWorks.length }] } });
    }
    if (url.pathname === `/api/group-corpora/${groupCorpus.corpus_id}/works`) {
      return route.fulfill({ json: { ok: true, corpus: groupCorpus, works: groupWorks } });
    }
    return route.fulfill({ status: 404, json: { ok: false, error: "FIXTURE_ROUTE_NOT_FOUND" } });
  });
}

function fixtureLists() {
  const items = Array.from({ length: 53 }, (_, index) => ({
    id: `ia-not-ready-${index + 1}`, text_key: "", file: "",
    title: `כותרת עברית ארוכה לבדיקת זרימה ${String(index + 1).padStart(2, "0")}`,
    author: index % 2 ? "מחברת ניסוי" : "מחבר ניסוי", r: false, era: "revival", genre: "poetry",
  }));
  return [
    { id: "ia-long", name: "Тестовый список для чтения — isolated fixture", items },
    { id: "ia-short", name: "רשימה קצרה מאוד", items: items.slice(0, 1) },
  ];
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer();
  if (!(await waitForServer())) throw new Error("server failed\n" + server.logs.join(""));
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  let checks = 0;
  const check = (condition, message) => { checks += 1; if (!condition) failures.push(message); };
  try {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
    await page.addInitScript((lists) => {
      localStorage.setItem("app.locale", "ru");
      localStorage.setItem("appTheme_v1", "light");
      localStorage.setItem("corpus_reading_lists_v1", JSON.stringify(lists));
    }, fixtureLists());
    await installRoutes(page);
    await page.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });
    await page.waitForSelector(".learning-home-reading-lists", { timeout: 30000 });

    const truthBefore = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const one = async (sql) => Number((await db.dbQuery(sql))[0]?.n || 0);
      return { progress: await one("SELECT COUNT(*) n FROM text_progress"), bookmarks: await one("SELECT COUNT(*) n FROM bookmarks"), reviews: await one("SELECT COUNT(*) n FROM review_log") };
    });
    const home = await page.evaluate(() => {
      const section = document.querySelector(".learning-home-reading-lists");
      const toggle = section.querySelector(".room-section-toggle");
      const controlled = document.getElementById(toggle.getAttribute("aria-controls"));
      const rect = toggle.getBoundingClientRect();
      const headRect = section.querySelector(".room-long-list-head").getBoundingClientRect();
      return {
        summaries: section.querySelectorAll(".reading-list-summary-row").length,
        expanded: toggle.getAttribute("aria-expanded"), controlled: !!controlled,
        toggleAtInlineEnd: Math.abs(headRect.right - rect.right) < 20,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });
    check(home.summaries === 2, "L0 must consolidate two named lists into one module");
    check(home.expanded === "true" && home.controlled, "L0 list module disclosure semantics missing");
    check(home.toggleAtInlineEnd, "RU disclosure is not in the first-row inline-end slot");
    check(home.overflow === 0, "desktop RU L0 has horizontal page overflow");
    await page.screenshot({ path: path.join(OUT, "library-l0-desktop-ru.png"), fullPage: true });

    const moduleToggle = page.locator(".learning-home-reading-lists .room-section-toggle");
    await moduleToggle.focus(); await moduleToggle.press("Enter");
    check(await moduleToggle.getAttribute("aria-expanded") === "false", "keyboard collapse did not update aria-expanded");
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".learning-home-reading-lists .room-section-toggle");
    check(await page.locator(".learning-home-reading-lists .room-section-toggle").getAttribute("aria-expanded") === "false", "collapse state did not survive reload");
    await page.locator(".learning-home-reading-lists .room-section-toggle").click();

    await page.locator(".reading-list-open").first().click();
    await page.waitForSelector(".reading-list-dialog");
    const detailPage1 = await page.evaluate(() => {
      const list = document.querySelector(".reading-list-detail-list");
      return {
        rows: list.querySelectorAll(".reading-list-material-row").length,
        removeLabels: Array.from(list.querySelectorAll(".reading-list-remove")).every((button) => !/[✕×]/.test(button.textContent) && !!button.textContent.trim()),
        nestedOverflow: Math.max(0, list.scrollWidth - list.clientWidth),
      };
    });
    check(detailPage1.rows === 48, "named-list first page must be bounded to 48 rows");
    check(detailPage1.removeLabels, "work removal must be a labelled secondary action");
    check(detailPage1.nestedOverflow === 0, "named-list detail has horizontal overflow");
    await page.locator(".reading-list-pager button").last().click();
    check(await page.locator(".reading-list-material-row").count() === 5, "named-list second page must replace page 1 with five rows");
    await page.locator(".reading-list-dialog-close").click();

    await page.locator(".reading-list-open").first().click();
    await page.locator(".reading-list-remove").first().click();
    check(/52/.test(await page.locator(".reading-list-dialog-head h2").textContent()), "remove did not update the list through the existing writer");
    await page.locator(".room-toast-action").click();
    check(/53/.test(await page.locator(".reading-list-dialog-head h2").textContent()), "Undo did not restore the removed fixture item");
    await page.locator(".reading-list-dialog-close").click();

    await page.locator(".reading-list-manage").first().click();
    let confirmCopy = "";
    page.once("dialog", async (dialog) => { confirmCopy = dialog.message(); await dialog.dismiss(); });
    await page.locator(".reading-list-delete-action").click();
    await page.waitForTimeout(50);
    check(/Тестовый список/.test(confirmCopy) && /53/.test(confirmCopy), "delete confirmation must name the list and item count");
    await page.locator(".reading-list-dialog-close").click();
    check(await page.locator(".reading-list-summary-row").count() === 2, "cancelled delete changed isolated list data");

    await page.locator(".reading-list-manage").first().click();
    await page.locator(".reading-list-name-input").fill("רשימת קריאה עם שם עברי ארוך");
    await page.locator(".reading-list-save").click();
    check(await page.locator(".reading-list-summary-title", { hasText: "רשימת קריאה עם שם עברי ארוך" }).count() === 1, "Rename did not repaint the consolidated module");
    const listShape = await page.evaluate(() => {
      const lists = JSON.parse(localStorage.getItem("corpus_reading_lists_v1") || "[]");
      return lists.map((list) => Object.keys(list).sort().join(","));
    });
    check(listShape.every((shape) => shape === "id,items,name"), "Rename evolved the approved v1 list payload shape");

    await page.selectOption("#roomLang", "he");
    await page.waitForFunction(() => document.documentElement.dir === "rtl" && document.querySelector(".learning-home-reading-lists .room-section-toggle"));
    const heDisclosure = await page.locator(".learning-home-reading-lists .room-section-toggle").textContent();
    check(/סגירה|פתיחה/.test(heDisclosure), "HE disclosure copy stayed in the previous locale: " + heDisclosure);

    await page.setViewportSize({ width: 380, height: 844 });
    const mobileHome = await page.evaluate(() => ({ overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), dir: document.documentElement.dir }));
    check(mobileHome.dir === "rtl" && mobileHome.overflow === 0, "380px HE/RTL L0 does not reflow");
    await page.screenshot({ path: path.join(OUT, "library-l0-380-he-rtl.png"), fullPage: true });

    await page.locator('.learning-corpus-entry[data-corpus="benyehuda"]').click();
    await page.waitForSelector(".corpus-ready", { timeout: 30000 });
    await page.waitForTimeout(500);
    const ben = await page.evaluate(() => {
      const recommendation = document.querySelector(".corpus-nextforyou,.corpus-coldstart");
      return {
        globalShelves: document.querySelectorAll(".corpus-continue,.corpus-finished,.corpus-bookmarks,.corpus-readinglist").length,
        recommendationRows: recommendation ? recommendation.querySelectorAll(".room-material-row").length : 0,
        recommendationRails: recommendation ? recommendation.querySelectorAll(".shelf-rail").length : 0,
        readyRows: document.querySelectorAll(".corpus-ready .room-material-row").length,
        nestedOverflow: Array.from(document.querySelectorAll(".corpus-ready .room-material-row,.corpus-nextforyou .room-material-row,.corpus-coldstart .room-material-row")).filter((row) => row.scrollWidth > row.clientWidth + 1).length,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });
    check(ben.globalShelves === 0, "Ben still mounts global Continue/Finished/Bookmarks/Lists");
    check(ben.recommendationRows > 0 && ben.recommendationRails === 0, "Ben recommendation collection is not a vertical row list");
    check(ben.readyRows > 0 && ben.readyRows <= 12, "Ben Ready preview is not bounded");
    check(ben.nestedOverflow === 0 && ben.overflow === 0, "380px HE Ben has material-row or page horizontal overflow");
    await page.screenshot({ path: path.join(OUT, "ben-380-he-rtl.png"), fullPage: true });

    await page.locator(".corpus-switch-pill").click();
    await page.locator(".corpus-switch-item", { hasText: "Учебные песни IA" }).click();
    await page.waitForSelector(".group-corpus-grid .room-material-row", { timeout: 30000 });
    const group = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll(".group-corpus-controls input,.group-corpus-controls select,.group-corpus-controls button")).filter((node) => {
        const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
      });
      return {
        rows: document.querySelectorAll(".group-corpus-grid .room-material-row").length,
        clipped: controls.filter((node) => { const rect = node.getBoundingClientRect(); return rect.left < -0.5 || rect.right > innerWidth + 0.5; }).length,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });
    check(group.rows === 48, "Study Songs first page must be a 48-row replacement window");
    check(group.clipped === 0 && group.overflow === 0, "380px HE Study Songs controls or page are clipped");
    await page.locator(".group-corpus-more button").last().click();
    await page.waitForFunction(() => document.querySelectorAll(".group-corpus-grid .room-material-row").length === 33);
    check(await page.locator(".group-corpus-grid .room-material-row").count() === 33, "Study Songs page 2 grew rather than replaced the DOM");

    await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      await db.createText({
        id: "ia-mytext", text_key: "ia-mytext", title: "הטקסט האישי הארוך שלי",
        source_text: "משפט בדיקה", level: "alef", tags_json: JSON.stringify(["בדיקה ארוכה"]),
      });
    });
    await page.locator(".corpus-back").click();
    await page.waitForSelector('.learning-corpus-entry[data-corpus="mytexts"]');
    await page.locator('.learning-corpus-entry[data-corpus="mytexts"]').click();
    await page.waitForSelector(".mytexts-corpus .mytexts-filter-controls", { state: "attached", timeout: 30000 });
    const myFilterSummary = page.locator(".mytexts-corpus .corpus-filter-summary");
    if (await myFilterSummary.count()) await myFilterSummary.click();
    await page.waitForSelector(".mytexts-corpus .mytexts-filter-controls", { state: "visible", timeout: 5000 });
    const myTexts = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll(".mytexts-filter-controls input,.mytexts-filter-controls select,.mytexts-filter-controls button")).filter((node) => {
        const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
      });
      const clipped = controls.filter((node) => { const rect = node.getBoundingClientRect(); return rect.left < -0.5 || rect.right > innerWidth + 0.5; });
      return {
        clipped: clipped.length,
        clippedDetails: clipped.map((node) => { const rect = node.getBoundingClientRect(); return { tag: node.tagName, className: node.className, left: rect.left, right: rect.right, width: rect.width }; }),
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });
    check(myTexts.clipped === 0 && myTexts.overflow === 0, "380px HE My Texts controls or page are clipped: " + JSON.stringify(myTexts));
    await page.screenshot({ path: path.join(OUT, "mytexts-380-he-rtl.png"), fullPage: true });

    await page.setViewportSize({ width: 640, height: 700 });
    const reflowProxy = await page.evaluate(() => ({ overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
    check(reflowProxy.overflow === 0, "200% reflow proxy (1280→640 CSS px) has horizontal page overflow");

    const truthAfter = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const one = async (sql) => Number((await db.dbQuery(sql))[0]?.n || 0);
      return { progress: await one("SELECT COUNT(*) n FROM text_progress"), bookmarks: await one("SELECT COUNT(*) n FROM bookmarks"), reviews: await one("SELECT COUNT(*) n FROM review_log") };
    });
    check(JSON.stringify(truthAfter) === JSON.stringify(truthBefore), "navigation wrote progress/bookmark/review truth");
    check(pageErrors.length === 0, "page errors: " + pageErrors.join(" | "));

    if (failures.length) throw new Error(`ROOM-LIBRARY-IA smoke failed (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
    console.log(JSON.stringify({ ok: true, checks, evidence: path.relative(ROOT, OUT).replaceAll("\\", "/"), truthBefore, truthAfter }, null, 2));
  } finally {
    await browser.close();
    await stopServer(server.child);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
