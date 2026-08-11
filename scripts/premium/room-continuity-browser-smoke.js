#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3307;
const BASE = `http://127.0.0.1:${PORT}`;
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const OUT = outArg ? path.resolve(ROOT, outArg.slice(6)) : path.join(ROOT, ".tmp", "room-continuity");
const failures = [];
let checks = 0;
const check = (condition, message) => { checks++; if (!condition) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const corpus = {
  corpus_id: "room-continuity-fixture", slug: "study-songs", title: "Учебные песни", version: 1,
  status: "PILOT", visibility: "GROUP_RESTRICTED",
  rights_basis: "EDUCATIONAL_GROUP_RESTRICTED_REVIEW_REQUIRED", role: "OWNER",
};
const groupWorks = Array.from({ length: 58 }, (_, index) => {
  const n = index + 1;
  return {
    work_id: `song-${n}`, text_key: `continuity-song-key-${n}`, position_no: n,
    title: `שיר לימוד ${String(n).padStart(2, "0")}`, artist: n % 2 ? "זמר א" : "זמר ב",
    rows_count: 3, audio_count: 0, audio_revision: 1, level: n % 2 ? "א" : "ב",
    tags: [n % 2 ? "קצב" : "אוצר-מילים"], topic: "שירים",
  };
});

function groupBundle(work) {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    row_id: `r${index}`, order_index: index,
    hebrew_plain: `שורת לימוד ${index + 1}`, hebrew_niqqud: `שׁוּרַת לִמּוּד ${index + 1}`,
    translit: `šurat limmud ${index + 1}`, translit_ru: `шурат лимуд ${index + 1}`,
    russian: `Учебная строка ${index + 1}`, edit_meta: null, note: "", note_updated_at: null, audio_asset_key: null,
  }));
  const groupMeta = { schema: 1, corpus_id: corpus.corpus_id, work_id: work.work_id, role: "OWNER" };
  return {
    group_corpus_schema_version: 1, corpus_id: corpus.corpus_id, work_id: work.work_id, audio_revision: 1,
    library: { schema_version: 1, corpus_meta_version: 1, shelves: [], audio_assets: [], texts: [{
      text_id: `group-${work.work_id}`, text_key: work.text_key, title: work.title, level: work.level,
      tags: work.tags, source_label: corpus.title, topic: work.topic, source_text: "",
      source_meta: { origin: "room-continuity-smoke", group_corpus: groupMeta }, group_corpus: groupMeta,
      rows, text_audio_asset_key: null, created_at: "2026-08-11T00:00:00.000Z",
      updated_at: "2026-08-11T00:00:00.000Z", is_archived: false,
    }] }, notes_advanced: { notes: [], sentence_morph: [] },
  };
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
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
  if (!exited && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}

async function waitForServer(timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function installRoutes(page) {
  await page.route("**/api/group-corpora**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/group-corpora") {
      return route.fulfill({ json: { ok: true, schema_version: "group_corpora.1.0.0", corpora: [{ ...corpus, works_count: groupWorks.length }] } });
    }
    if (url.pathname === `/api/group-corpora/${corpus.corpus_id}/works`) {
      return route.fulfill({ json: { ok: true, schema_version: "group_corpus_catalog.1.0.0", corpus, works: groupWorks } });
    }
    const match = url.pathname.match(new RegExp(`^/api/group-corpora/${corpus.corpus_id}/works/([^/]+)$`));
    if (match) {
      const work = groupWorks.find((item) => item.work_id === decodeURIComponent(match[1]));
      return work ? route.fulfill({ json: groupBundle(work) }) : route.fulfill({ status: 404, json: { ok: false } });
    }
    return route.fulfill({ status: 404, json: { ok: false, error: "FIXTURE_ROUTE_NOT_FOUND" } });
  });
}

async function seedMyTexts(page, count) {
  await page.evaluate(async (n) => {
    const db = await import("/db/local-db.js");
    for (let index = 1; index <= n; index++) {
      const suffix = String(index).padStart(3, "0");
      await db.createText({
        id: `continuity-mine-${suffix}`, text_key: `continuity-mine-${suffix}`,
        title: `הטקסט שלי ${suffix}`, source_text: `משפט לימוד ${suffix}\nמשפט שני ${suffix}\nמשפט שלישי ${suffix}`,
        level: index % 2 ? "alef" : "bet", topic: "Урок", tags_json: JSON.stringify([index % 2 ? "ульпан" : "дом"]),
      });
    }
  }, count);
}

async function capturePerformance(browser) {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await installRoutes(page);
  await page.addInitScript(() => {
    window.__roomReleasePerf = { longTasks: [], lcp: 0 };
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__roomReleasePerf.longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true }); } catch (_) {}
    try { new PerformanceObserver((list) => { const entries = list.getEntries(); if (entries.length) window.__roomReleasePerf.lcp = entries[entries.length - 1].startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch (_) {}
    localStorage.setItem("app.locale", "ru"); localStorage.setItem("appTheme_v1", "light");
  });
  const visit = async (kind, reload) => {
    if (reload) await page.reload({ waitUntil: "load", timeout: 60000 });
    else await page.goto(BASE + "/library.html?canon=skip&roomUxMaturity=1", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => { const tab = document.getElementById("tabCorpus"); return tab && !tab.hidden; }, null, { timeout: 30000 });
    await page.click("#tabAccessible");
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      const tab = document.getElementById("tabCorpus");
      tab.addEventListener("click", () => { window.__roomReleasePerf.interactionStart = performance.now(); }, { capture: true, once: true });
    });
    await page.click("#tabCorpus");
    await page.waitForSelector(".learning-home");
    await page.evaluate(() => { window.__roomReleasePerf.interactionMs = performance.now() - window.__roomReleasePerf.interactionStart; });
    await page.waitForTimeout(500);
    return page.evaluate((label) => {
      const nav = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      return {
        kind: label,
        navigationMs: Math.round((nav && nav.duration || 0) * 10) / 10,
        domContentLoadedMs: Math.round((nav && nav.domContentLoadedEventEnd || 0) * 10) / 10,
        loadEventMs: Math.round((nav && nav.loadEventEnd || 0) * 10) / 10,
        transferBytes: Math.round((nav && nav.transferSize || 0) + resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)),
        lcpMs: Math.round((window.__roomReleasePerf.lcp || 0) * 10) / 10,
        maxLongTaskMs: Math.round(Math.max(0, ...window.__roomReleasePerf.longTasks) * 10) / 10,
        interactionMs: Math.round((window.__roomReleasePerf.interactionMs || 0) * 10) / 10,
      };
    }, kind);
  };
  try {
    const cold = await visit("cold", false);
    const cached = await visit("cached", true);
    check(cold.navigationMs > 0 && cached.navigationMs > 0, `performance: cold and cached navigation are measured (${cold.navigationMs}/${cached.navigationMs}ms)`);
    check(cached.transferBytes <= cold.transferBytes, `performance: cached transfer does not exceed cold (${cached.transferBytes}/${cold.transferBytes} bytes)`);
    check(cached.domContentLoadedMs <= Math.max(1200, cold.domContentLoadedMs * 1.5), `performance: cached DCL stays bounded (${cached.domContentLoadedMs}/${cold.domContentLoadedMs}ms)`);
    check(cold.interactionMs <= 200 && cached.interactionMs <= 200, `performance: Learning Home interaction <=200ms (${cold.interactionMs}/${cached.interactionMs}ms)`);
    check(cold.maxLongTaskMs <= 50 && cached.maxLongTaskMs <= 50, `performance: no >50ms main-thread task (${cold.maxLongTaskMs}/${cached.maxLongTaskMs}ms)`);
    check(cold.lcpMs > 0 && cold.lcpMs <= 2500 && cached.lcpMs > 0 && cached.lcpMs <= 2500, `performance: local LCP <=2.5s (${cold.lcpMs}/${cached.lcpMs}ms)`);
    return { cold, cached };
  } finally { await context.close(); }
}

async function selectCorpus(page, id, readySelector) {
  if (!await page.locator(`.learning-corpus-entry[data-corpus="${id}"]`).count()) {
    await page.locator(".corpus-back:visible").first().click();
    await page.waitForSelector(".learning-home");
  }
  await page.locator(`.learning-corpus-entry[data-corpus="${id}"]`).click();
  await page.waitForSelector(readySelector, { timeout: 30000 });
}

async function openAndReturn(page, rowSelector, index, expectedState) {
  const count = await page.locator(rowSelector).count();
  check(count > 0, `${expectedState}: filtered result has an openable row`);
  const row = page.locator(rowSelector).nth(Math.max(0, Math.min(index, count - 1)));
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const before = await row.evaluate((node) => ({
    key: node.getAttribute("data-continuity-key"), top: node.getBoundingClientRect().top,
    scrollY: window.scrollY,
    landmarks: [".corpus-switchbar", ".corpus-shell-head", ".corpus-next-action", ".corpus-browse-tools", ".corpus-results-summary", ".corpus-l1-body"]
      .map((selector) => { const item = document.querySelector(selector); return [selector, item ? Math.round(item.getBoundingClientRect().top + window.scrollY) : null, item ? Math.round(item.getBoundingClientRect().height) : null]; }),
    disclosures: Array.from(document.querySelectorAll("details[id]")).map((item) => [item.id, item.open]),
  }));
  const open = row.locator('[data-continuity-action="open"]');
  await open.focus();
  await open.press("Enter");
  await page.waitForSelector("#roomReader:not([hidden])", { timeout: 30000 });
  const backName = await page.locator("#readerBack").evaluate((node) => String(node.getAttribute("aria-label") || node.textContent || "").trim());
  check(!!backName, `${expectedState}: Reader Back has an accessible name`);
  await page.evaluate(() => {
    window.__roomContinuityEvents = [];
    if (window.__roomContinuityEventsWired) return;
    window.__roomContinuityEventsWired = true;
    for (const type of ["keydown", "keyup", "click", "focusin"]) document.addEventListener(type, (event) => {
      const target = event.target;
      window.__roomContinuityEvents.push({ type, key: event.key || null, detail: event.detail == null ? null : event.detail,
        target: target && (target.id || target.className || target.tagName), at: Math.round(performance.now()),
        readerHidden: document.getElementById("roomReader").hidden });
      if (window.__roomContinuityEvents.length > 80) window.__roomContinuityEvents.shift();
    }, true);
  });
  await page.locator("#readerBack").focus();
  await page.locator("#readerBack").press("Enter");
  try {
    await page.waitForFunction((key) => {
      const reader = document.getElementById("roomReader");
      const content = document.getElementById("roomContent");
      const node = Array.from(document.querySelectorAll("[data-continuity-key]")).find((item) => item.getAttribute("data-continuity-key") === key);
      const active = document.activeElement && document.activeElement.closest("[data-continuity-key]");
      return reader && reader.hidden && content && !content.hidden && !!node && active && active.getAttribute("data-continuity-key") === key;
    }, before.key, { timeout: 30000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({ events: window.__roomContinuityEvents, active: document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName), readerHidden: document.getElementById("roomReader").hidden, contentHidden: document.getElementById("roomContent").hidden }));
    throw new Error(`${expectedState}: continuity timeout ${JSON.stringify(debug)}`);
  }
  await page.waitForTimeout(180);
  const after = await page.evaluate((key) => {
    const node = Array.from(document.querySelectorAll("[data-continuity-key]")).find((item) => item.getAttribute("data-continuity-key") === key);
    return {
      key: node && node.getAttribute("data-continuity-key"), top: node && node.getBoundingClientRect().top,
      focusKey: document.activeElement && document.activeElement.closest("[data-continuity-key]")
        ? document.activeElement.closest("[data-continuity-key]").getAttribute("data-continuity-key") : null,
      focusAction: document.activeElement && document.activeElement.getAttribute("data-continuity-action"),
      scrollY: window.scrollY,
      readerHidden: document.getElementById("roomReader").hidden,
      contentHidden: document.getElementById("roomContent").hidden,
      landmarks: [".corpus-switchbar", ".corpus-shell-head", ".corpus-next-action", ".corpus-browse-tools", ".corpus-results-summary", ".corpus-l1-body"]
        .map((selector) => { const item = document.querySelector(selector); return [selector, item ? Math.round(item.getBoundingClientRect().top + window.scrollY) : null, item ? Math.round(item.getBoundingClientRect().height) : null]; }),
      disclosures: Array.from(document.querySelectorAll("details[id]")).map((item) => [item.id, item.open]),
    };
  }, before.key);
  check(after.key === before.key, `${expectedState}: the same work survives canonical repaint`);
  check(after.focusKey === before.key && after.focusAction === "open", `${expectedState}: keyboard focus returns to the exact opening action`);
  check(after.readerHidden && !after.contentHidden, `${expectedState}: return completes before the smoke continues`);
  check(Math.abs(after.top - before.top) <= 8, `${expectedState}: the work returns to its visual place (${before.top.toFixed(1)} → ${Number(after.top).toFixed(1)})`);
  return { before, after };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer();
  if (!await waitForServer()) throw new Error(`local server did not become ready\n${server.logs.join("")}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [], serverErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  page.on("response", (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  try {
    await installRoutes(page);
    await page.addInitScript(() => { localStorage.setItem("app.locale", "ru"); localStorage.setItem("appTheme_v1", "light"); });
    await page.goto(BASE + "/library.html?canon=skip&roomUxMaturity=1", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => { const tab = document.getElementById("tabCorpus"); return tab && !tab.hidden; }, null, { timeout: 30000 });
    await seedMyTexts(page, 70);
    await page.click("#tabCorpus");
    await page.waitForSelector(".learning-home");

    await selectCorpus(page, "mytexts", ".mytexts-grid .mytext-card-v");
    await page.locator("#roomMyTextsSearch").fill("הטקסט");
    await page.waitForTimeout(280);
    await page.locator(".corpus-filter-disclosure > summary").click();
    await page.locator(".mytexts-facets .corpus-sort-btn").first().click();
    await page.waitForTimeout(180);
    const myFilterBefore = await page.evaluate(() => ({ q: document.getElementById("roomMyTextsSearch").value, active: document.querySelectorAll(".corpus-active-chip").length }));
    const myResult = await openAndReturn(page, ".mytexts-grid .mytext-card-v", 14, "My Texts");
    const myFilterAfter = await page.evaluate(() => ({ q: document.getElementById("roomMyTextsSearch").value, active: document.querySelectorAll(".corpus-active-chip").length }));
    check(JSON.stringify(myFilterAfter) === JSON.stringify(myFilterBefore), `My Texts: query and facets survive (${JSON.stringify(myFilterAfter)})`);
    await page.screenshot({ path: path.join(OUT, "mytexts-return-380-ru.png"), fullPage: false });

    await selectCorpus(page, "benyehuda", ".corpus-ready .room-text-row");
    await page.locator(".corpus-filter-disclosure > summary").click();
    await page.locator(".corpus-filterbar .corpus-facet-chip").first().click();
    // The ready-only adapter may need to load its indexed result set after the
    // synchronous filter toggle. Wait for the repainted, openable result rather
    // than coupling continuity evidence to a fixed local-I/O delay.
    await page.waitForSelector(".corpus-nav .corpus-work-row[data-continuity-key]", { timeout: 30000 });
    const benFilters = await page.locator(".corpus-active-chip").count();
    const benResult = await openAndReturn(page, ".corpus-nav .corpus-work-row[data-continuity-key]", 7, "Ben-Yehuda");
    check(await page.locator(".corpus-active-chip").count() === benFilters && benFilters > 0, "Ben-Yehuda: active filter survives Reader");
    await page.screenshot({ path: path.join(OUT, "benyehuda-return-380-ru.png"), fullPage: false });

    await selectCorpus(page, `group:${corpus.corpus_id}`, ".group-corpus-grid .group-work-card");
    await page.locator("#roomGroupCorpusSearch").fill("שיר");
    await page.waitForTimeout(280);
    const groupResult = await openAndReturn(page, ".group-corpus-grid .group-work-card", 14, "Study Songs");
    check(await page.locator("#roomGroupCorpusSearch").inputValue() === "שיר", "Study Songs: search query survives Reader");

    const groupRow = page.locator('.group-corpus-grid [data-continuity-key="group:room-continuity-fixture:song-15"]');
    await groupRow.locator('[data-continuity-action="open"]').press("Enter");
    await page.waitForSelector("#readerEndCard", { timeout: 30000 });
    const paths = await page.locator(".reader-end-paths button").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent.trim(), name: node.getAttribute("aria-label") || node.textContent.trim() })));
    check(paths.length === 2 && paths.every((item) => item.name), `finish handoff exposes two named paths (${JSON.stringify(paths)})`);
    const infiniteMotion = await page.locator(".reader-end").evaluate((root) => Array.from(root.querySelectorAll("*")).filter((node) => getComputedStyle(node).animationIterationCount === "infinite").length);
    check(infiniteMotion === 0, "reduced-motion finish surface has no looping animation");
    await page.locator(".reader-end-home").click();
    await page.waitForSelector(".learning-home");
    await page.waitForTimeout(180);
    const homeState = await page.evaluate(async (textKey) => {
      const db = await import("/db/local-db.js");
      const rows = await db.dbQuery("SELECT id FROM texts WHERE text_key = ? LIMIT 1", [textKey]);
      const progress = rows && rows[0] ? await db.getProgress(rows[0].id) : null;
      return {
        scrollY: window.scrollY,
        focusKey: document.activeElement && document.activeElement.getAttribute("data-focus-key"),
        finished: !!(progress && progress.finished_at),
        selected: document.getElementById("tabCorpus").getAttribute("aria-selected"),
      };
    }, groupWorks[14].text_key);
    check(homeState.scrollY === 0 && homeState.focusKey === "learning-home-feature-open", `finish Home lands at the primary Learning Home action (${JSON.stringify(homeState)})`);
    check(!homeState.finished, "Home route does not silently mark the text finished");
    check(homeState.selected === "true", "Home route selects the corpus learning track");
    await page.screenshot({ path: path.join(OUT, "finish-home-380-ru.png"), fullPage: false });

    check(pageErrors.length === 0, `no page errors (${pageErrors.join(" | ")})`);
    check(serverErrors.length === 0, `no 5xx responses (${serverErrors.join(" | ")})`);
    const performance = await capturePerformance(browser);
    const evidence = { capturedAt: new Date().toISOString(), viewport: { width: 380, height: 844 }, locale: "ru", theme: "light", reducedMotion: true, myResult, benResult, groupResult, myFilterBefore, myFilterAfter, homeState, paths, performance, pageErrors, serverErrors, checks, failures };
    fs.writeFileSync(path.join(OUT, "continuity.json"), JSON.stringify(evidence, null, 2) + "\n");
  } finally {
    await context.close();
    await browser.close();
    await stopServer(server.child);
  }
  if (failures.length) {
    console.error(`[room-continuity-browser-smoke] FAIL ${checks - failures.length}/${checks}`);
    for (const failure of failures) console.error(" - " + failure);
    process.exit(1);
  }
  console.log(`[room-continuity-browser-smoke] PASS ${checks}/${checks}`);
  console.log(`evidence -> ${path.relative(ROOT, OUT)}`);
})().catch((error) => { console.error("[room-continuity-browser-smoke]", error && error.stack || error); process.exit(1); });
