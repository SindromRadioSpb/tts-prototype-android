#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3314;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, ".tmp", "room-b8-reading-journey");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const done = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
  if (!done && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}

async function serverReady() {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

const groupCorpus = {
  corpus_id: "fixture-corpus", slug: "b8-study-songs", title: "Учебные песни B8",
  version: 1, status: "PILOT", visibility: "GROUP_RESTRICTED", role: "MEMBER",
};

async function routeGroupCorpus(page) {
  await page.route("**/api/group-corpora**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/group-corpora") {
      return route.fulfill({ json: { ok: true, corpora: [{ ...groupCorpus, works_count: 1 }] } });
    }
    if (url.pathname === "/api/group-corpora/fixture-corpus/works") {
      return route.fulfill({ json: { ok: true, corpus: groupCorpus, works: [] } });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });
}

async function seed(page) {
  return page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    await db.initLocalDB();
    const makeText = async (id, key, title, meta, rows) => {
      await db.createText({ id, text_key: key, title, source_text: "fixture", source_meta_json: meta ? JSON.stringify(meta) : null });
      for (let i = 0; i < rows; i++) {
        await db.addSentence(id, { id: `${id}-s${i}`, order_index: i, he_plain: `שורה ${i}`, ru: `строка ${i}` });
      }
    };
    await makeText("b8-ben", "b8-ben-key", "מסע הקריאה B8", { origin: "benyehuda-ingest", corpus: { byehuda_id: "b8-ben" } }, 100);
    await makeText("b8-my", "b8-my-key", "Мой завершённый текст B8", null, 12);
    await makeText("b8-group", "b8-group-key", "שיר לימודי B8", { group_corpus: { corpus_id: "fixture-corpus", work_id: "b8-song", visibility: "GROUP_RESTRICTED" } }, 8);

    await db.setProgress("b8-ben", { last_row_idx: 80, last_step_id: "furthest" });
    await db.setProgress("b8-my", { last_row_idx: 11, last_step_id: null });
    await db.setTextFinished("b8-my", "2026-08-13T08:00:00.000Z");
    await db.setProgress("b8-group", { last_row_idx: 7, last_step_id: null });
    await db.setTextFinished("b8-group", "2026-08-13T08:01:00.000Z");
    await db.createNote({ target_kind: "text", target_id: "b8-my", text_id: "b8-my", note_type: "free", title: "B8", body: "private fixture" });
    await db.createNote({ target_kind: "text", target_id: "b8-group", text_id: "b8-group", note_type: "free", title: "B8", body: "private fixture" });

    for (let i = 20; i < 75; i++) {
      await db.addBookmark({ text_id: "b8-ben", text_key: "b8-ben-key", sentence_id: `b8-ben-s${i}`, order_index: i, title: "מסע הקריאה B8", snippet: `B8 passage ${i}` });
    }
    await db.addBookmark({ text_id: "b8-ben", text_key: "b8-ben-key", sentence_id: "b8-ben-s10", order_index: 10, title: "מסע הקריאה B8", snippet: "B8 earlier passage" });
    await db.addBookmark({ text_id: "b8-group", text_key: "b8-group-key", sentence_id: "b8-group-s0", order_index: 0, title: "שיר לימודי B8", snippet: "B8 group passage" });

    // B6-scale floor: 5k additional local rows with progress, no bodies/notes/bookmarks.
    const now = "2026-08-13T08:02:00.000Z";
    await db.dbRun("BEGIN");
    try {
      for (let start = 0; start < 5000; start += 100) {
        const values = [], params = [];
        for (let i = start; i < Math.min(5000, start + 100); i++) {
          values.push("(?,?,?,?,?,?,?)");
          params.push(`b8-scale-${i}`, `b8-scale-key-${i}`, `Scale ${i}`, "", 0, now, now);
        }
        await db.dbRun(`INSERT INTO texts(id,text_key,title,source_text,is_archived,created_at,updated_at) VALUES ${values.join(",")}`, params);
      }
      for (let start = 0; start < 5000; start += 200) {
        const values = [], params = [];
        for (let i = start; i < Math.min(5000, start + 200); i++) {
          values.push("(?,?,?,?)"); params.push(`b8-scale-${i}`, 1, null, now);
        }
        await db.dbRun(`INSERT INTO text_progress(text_id,last_row_idx,last_step_id,updated_at) VALUES ${values.join(",")}`, params);
      }
      await db.dbRun("COMMIT");
    } catch (error) { try { await db.dbRun("ROLLBACK"); } catch (_) {} throw error; }

    const beforeReview = await db.countReviewLog();
    const authorized = await db.getReadingJourneySummary(["fixture-corpus"]);
    const unauthorized = await db.getReadingJourneySummary([]);
    const bookmarkPage = await db.listReadingJourneyItems("bookmark", { limit: 999, authorizedGroupIds: ["fixture-corpus"] });
    const bookmarkPage2 = await db.listReadingJourneyItems("bookmark", { limit: 48, offset: 48, authorizedGroupIds: ["fixture-corpus"] });
    const benBookmarkPage = await db.listReadingJourneyItems("bookmark", { limit: 48, sourceKind: "benyehuda", authorizedGroupIds: ["fixture-corpus"] });
    const notePage = await db.listReadingJourneyItems("note", { limit: 48, authorizedGroupIds: ["fixture-corpus"] });
    const finishedPage = await db.listReadingJourneyItems("finished", { limit: 48, authorizedGroupIds: ["fixture-corpus"] });

    // Owner-live D2 correction: the durable writer follows the last worked row,
    // including an intentional move back to an earlier paragraph.
    await db.setProgress("b8-ben", { last_row_idx: 10, last_step_id: "behind" });
    const lastPosition = await db.getProgress("b8-ben");
    // The browser route below starts with a farther stored position, then proves
    // that opening the explicit row-10 bookmark makes row 10 the next Continue.
    await db.setProgress("b8-ben", { last_row_idx: 80, last_step_id: "furthest" });

    const timings = [];
    for (let i = 0; i < 11; i++) {
      const started = performance.now();
      await db.getReadingJourneySummary(["fixture-corpus"]);
      timings.push(performance.now() - started);
    }
    const warm = timings.slice(1).sort((a, b) => a - b);
    return {
      beforeReview, authorized, unauthorized,
      bookmarkCount: bookmarkPage.items.length, bookmarkHasMore: bookmarkPage.hasMore,
      bookmarkPage2: { count: bookmarkPage2.items.length, hasMore: bookmarkPage2.hasMore, hasPrevious: bookmarkPage2.hasPrevious, offset: bookmarkPage2.offset },
      benBookmarkPage: { count: benBookmarkPage.items.length, hasMore: benBookmarkPage.hasMore, sources: Array.from(new Set(benBookmarkPage.items.map((item) => item.source_kind))) },
      bookmarkSources: Array.from(new Set(bookmarkPage.items.map((item) => item.source_kind))).sort(),
      noteSources: Array.from(new Set(notePage.items.map((item) => item.source_kind))).sort(),
      finishedSources: Array.from(new Set(finishedPage.items.map((item) => item.source_kind))).sort(),
      lastPosition: { row: lastPosition && lastPosition.last_row_idx, step: lastPosition && lastPosition.last_step_id },
      coldMs: timings[0], warmP95Ms: warm[Math.floor((warm.length - 1) * 0.95)],
    };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer();
  if (!(await serverReady())) { console.error(server.logs.join("")); throw new Error("server failed"); }
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  try {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [], contentRequests = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
    page.on("request", (request) => {
      if (/rum|telemetry|analytics/i.test(request.url())) contentRequests.push(request.url());
    });
    await page.addInitScript(() => { localStorage.setItem("app.locale", "ru"); localStorage.setItem("app.theme", "light"); });
    await routeGroupCorpus(page);
    await page.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("tabCorpus") && !document.getElementById("tabCorpus").hidden, null, { timeout: 30000 });
    const direct = await seed(page);
    check(JSON.stringify(direct.authorized) === JSON.stringify({ bookmarks: 57, finished: 2, notes: 2 }), "authorized summary mismatch: " + JSON.stringify(direct.authorized));
    check(JSON.stringify(direct.unauthorized) === JSON.stringify({ bookmarks: 56, finished: 1, notes: 1 }), "entitlement filter mismatch: " + JSON.stringify(direct.unauthorized));
    check(direct.bookmarkCount === 48 && direct.bookmarkHasMore === true, "bookmark window must be exactly 48 + hasMore");
    check(JSON.stringify(direct.bookmarkPage2) === JSON.stringify({ count: 9, hasMore: false, hasPrevious: true, offset: 48 }), "bookmark page 2 mismatch: " + JSON.stringify(direct.bookmarkPage2));
    check(direct.benBookmarkPage.count === 48 && direct.benBookmarkPage.hasMore === true && JSON.stringify(direct.benBookmarkPage.sources) === JSON.stringify(["benyehuda"]), "source-filtered page mismatch: " + JSON.stringify(direct.benBookmarkPage));
    check(direct.bookmarkSources.includes("benyehuda") && direct.bookmarkSources.includes("group"), "typed bookmark sources missing: " + direct.bookmarkSources);
    check(direct.noteSources.includes("mytext") && direct.noteSources.includes("group"), "typed note sources missing: " + direct.noteSources);
    check(direct.finishedSources.includes("mytext") && direct.finishedSources.includes("group"), "typed finished sources missing: " + direct.finishedSources);
    check(Number(direct.lastPosition.row) === 10 && direct.lastPosition.step === "behind", "LocalDb last-position writer rejected backward study: " + JSON.stringify(direct.lastPosition));
    check(direct.coldMs <= 100 && direct.warmP95Ms <= 50, `5k summary budget exceeded cold=${direct.coldMs.toFixed(2)} warmP95=${direct.warmP95Ms.toFixed(2)}`);

    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".learning-home-journey", { timeout: 30000 });
    await page.evaluate(() => {
      window.__b8LongTasks = [];
      if (typeof PerformanceObserver === "function") {
        try {
          window.__b8LongTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) window.__b8LongTasks.push(Number(entry.duration) || 0);
          });
          window.__b8LongTaskObserver.observe({ type: "longtask" });
        } catch (_) {}
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const heapUsed = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      const metrics = await cdp.send("Performance.getMetrics");
      return Number((metrics.metrics || []).find((metric) => metric.name === "JSHeapUsedSize")?.value || 0);
    };
    const home = await page.evaluate(() => ({
      counts: Object.fromEntries(Array.from(document.querySelectorAll(".learning-home-journey-view")).map((node) => [node.dataset.journeyKind, Number(node.querySelector(".learning-home-journey-count")?.textContent || 0)])),
      boundary: document.querySelector(".learning-home-journey-boundary")?.textContent || "",
      types: document.querySelector(".learning-home-journey-types")?.textContent || "",
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }));
    check(home.counts.bookmark === 57 && home.counts.finished === 2 && home.counts.note === 2, "home counts mismatch: " + JSON.stringify(home.counts));
    check(/этом устройстве/.test(home.boundary) && /Закладка/.test(home.types) && /Читать позже/.test(home.types), "device/typed honesty copy missing");
    check(home.overflow === 0, "380px RU home has horizontal overflow");
    await page.screenshot({ path: path.join(OUT, "room-b8-home-380-ru.png"), fullPage: true });

    const bookmarks = page.locator('.learning-home-journey-view[data-journey-kind="bookmark"]');
    await bookmarks.focus(); await bookmarks.press("Enter");
    await page.waitForFunction(() => document.querySelector('.learning-home-journey-view[data-journey-kind="bookmark"]')?.getAttribute('aria-expanded') === 'true', null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('.learning-journey-item[data-journey-kind="bookmark"]').length === 48, null, { timeout: 30000 }).catch(async (error) => {
      const state = await page.evaluate(() => ({
        expanded: document.querySelector('.learning-home-journey-view[data-journey-kind="bookmark"]')?.getAttribute('aria-expanded'),
        panelHidden: document.getElementById('learningHomeJourneyPanel')?.hidden,
        panelText: document.getElementById('learningHomeJourneyPanel')?.textContent,
        itemCount: document.querySelectorAll('.learning-home-journey-item').length,
      }));
      throw new Error(error.message + "\njourney-state=" + JSON.stringify(state) + "\ndirect=" + JSON.stringify(direct) + "\npageErrors=" + JSON.stringify(pageErrors));
    });
    check(await bookmarks.getAttribute("aria-expanded") === "true" && await bookmarks.getAttribute("aria-pressed") === "true", "bookmark control state not exposed");
    const benFilter = page.locator('.learning-journey-filter[data-journey-source="benyehuda"]');
    await benFilter.click();
    await page.waitForFunction(() => document.querySelector('.learning-journey-filter[data-journey-source="benyehuda"]')?.getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.learning-journey-item[data-work-source="benyehuda"]').length === 48);
    check(await page.locator('.learning-journey-item:not([data-work-source="benyehuda"])').count() === 0, "source filter mixed non-Ben items into result page");
    await page.locator('.learning-journey-filter[data-journey-source="all"]').click();
    await page.waitForFunction(() => document.querySelector('.learning-journey-filter[data-journey-source="all"]')?.getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.learning-journey-item').length === 48);
    await page.locator('.learning-journey-page').filter({ hasText: "Дальше" }).click();
    await page.waitForFunction(() => /Страница 2/.test(document.querySelector('.learning-journey-page-label')?.textContent || '') && document.querySelectorAll('.learning-journey-item').length === 9);
    await page.locator('.learning-journey-page').filter({ hasText: "Назад" }).click();
    await page.waitForFunction(() => /Страница 1/.test(document.querySelector('.learning-journey-page-label')?.textContent || '') && document.querySelectorAll('.learning-journey-item').length === 48);
    const earlier = page.locator('.learning-journey-item[data-journey-kind="bookmark"]', { hasText: "B8 earlier passage" });
    check(await earlier.count() === 1, "earlier passage missing from first bounded window");
    await earlier.click();
    await page.waitForFunction(() => !document.getElementById("roomReader").hidden && /מסע הקריאה B8/.test(document.getElementById("readerTitle")?.textContent || ""));
    await page.click("#readerBack");
    await page.waitForSelector(".learning-home-journey", { timeout: 15000 });
    const afterBookmark = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const progress = await db.getProgress("b8-ben");
      return { row: progress && progress.last_row_idx, step: progress && progress.last_step_id, review: await db.countReviewLog() };
    });
    check(Number(afterBookmark.row) === 10 && afterBookmark.step == null, "bookmark row did not become the next Continue position: " + JSON.stringify(afterBookmark));
    check(afterBookmark.review === direct.beforeReview, "journey view/open/close changed review_log");

    // Reload the Learning Home and take the real Continue action. It must reopen
    // exactly the earlier row just stored, while the passage bookmark still exists.
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector('.learning-home-feature[data-feature-kind="continue"] .learning-home-primary', { timeout: 30000 });
    await page.locator('.learning-home-feature[data-feature-kind="continue"] .learning-home-primary').click();
    await page.waitForFunction(() => !document.getElementById("roomReader").hidden && document.querySelector('tr[data-row-idx="10"].rm-row-current[aria-current="location"]'), null, { timeout: 15000 }).catch(async (error) => {
      const state = await page.evaluate(async () => {
        const db = await import("/db/local-db.js");
        const progress = await db.getProgress("b8-ben");
        return {
          href: location.href,
          readerHidden: document.getElementById("roomReader")?.hidden,
          readerTitle: document.getElementById("readerTitle")?.textContent,
          currentRows: Array.from(document.querySelectorAll('tr.rm-row-current[aria-current="location"]')).map((node) => node.getAttribute("data-row-idx")),
          selectedFeature: document.querySelector('.learning-home-feature[data-feature-kind="continue"] .learning-home-feature-title')?.textContent,
          storedRow: progress && progress.last_row_idx,
          storedStep: progress && progress.last_step_id,
        };
      });
      throw new Error(error.message + "\ncontinue-state=" + JSON.stringify(state) + "\nafterBookmark=" + JSON.stringify(afterBookmark));
    });
    const resumedEarlier = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const progress = await db.getProgress("b8-ben");
      const bookmarks = await db.listBookmarks("b8-ben");
      return { row: progress && progress.last_row_idx, earlierBookmark: bookmarks.some((item) => Number(item.order_index) === 10) };
    });
    check(Number(resumedEarlier.row) === 10, "Continue did not reopen the last earlier working row: " + JSON.stringify(resumedEarlier));
    check(resumedEarlier.earlierBookmark === true, "last-position write altered the explicit passage bookmark");
    check(await page.locator('tr.rm-row-current[aria-current="location"]').count() === 1,
      "Continue must expose exactly one semantic working row");
    const currentRow = page.locator('tr[data-row-idx="10"].rm-row-current[aria-current="location"]');
    await currentRow.hover();
    const focusedPaint = await currentRow.evaluate((row) => {
      const control = row.querySelector('button, [tabindex="0"]');
      if (control) control.focus();
      const cell = row.querySelector('td');
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        actual: cell ? getComputedStyle(cell).backgroundColor : '',
        expected: rootStyle.getPropertyValue('--row-hl-playing').trim(),
        current: row.classList.contains('rm-row-current') && row.getAttribute('aria-current') === 'location',
      };
    });
    check(focusedPaint.current && focusedPaint.actual === focusedPaint.expected,
      "hover/focus must not replace the persistent warm working-row base: " + JSON.stringify(focusedPaint));
    // Owner-live regression 2026-08-14: browsing neighbouring context on the
    // same page must not silently choose a different working row. Both the
    // Room projection and the canonical Continue row stay at the last explicit
    // engagement until the learner engages another row.
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1100);
    const afterPassiveScroll = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const progress = await db.getProgress("b8-ben");
      return {
        storedRow: progress && Number(progress.last_row_idx),
        currentRows: Array.from(document.querySelectorAll('tr.rm-row-current[aria-current="location"]'))
          .map((node) => Number(node.getAttribute("data-row-idx"))),
      };
    });
    check(afterPassiveScroll.storedRow === 10 && JSON.stringify(afterPassiveScroll.currentRows) === "[10]",
      "passive scroll moved the working row without engagement: " + JSON.stringify(afterPassiveScroll));
    // Row 0 is still a real deliberate position. It should restore the yellow
    // marker after reload, while the Learning Home correctly omits a redundant
    // «Продолжить с начала» affordance/banner.
    await page.evaluate(() => {
      const row = document.querySelector('tr[data-row-idx="0"]');
      if (row) row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await page.waitForTimeout(1100);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => !document.getElementById("roomReader").hidden
      && document.querySelector('tr[data-row-idx="0"].rm-row-current[aria-current="location"]'), null, { timeout: 15000 });
    const rowZeroReload = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const progress = await db.getProgress("b8-ben");
      return {
        storedRow: progress && Number(progress.last_row_idx),
        currentRows: Array.from(document.querySelectorAll('tr.rm-row-current[aria-current="location"]'))
          .map((node) => Number(node.getAttribute("data-row-idx"))),
        resumeBanner: !!document.getElementById("readerResume"),
      };
    });
    check(rowZeroReload.storedRow === 0 && JSON.stringify(rowZeroReload.currentRows) === "[0]" && !rowZeroReload.resumeBanner,
      "reload did not restore row 0 as a marker-only working position: " + JSON.stringify(rowZeroReload));
    await page.evaluate(() => {
      const row = document.querySelector('tr[data-row-idx="10"]');
      if (row) row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await page.waitForTimeout(1100);
    // A full reload intentionally drops the in-memory return context. Back now
    // returns to the source corpus; use its real «Библиотека» control to reach Home.
    await page.click("#readerBack");
    await page.waitForFunction(() => document.getElementById("roomReader").hidden);
    await page.locator(".corpus-back").click();
    await page.waitForSelector(".learning-home-journey", { timeout: 15000 });

    const notes = page.locator('.learning-home-journey-view[data-journey-kind="note"]');
    await notes.focus(); await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll('.learning-journey-item[data-journey-kind="note"]').length === 2);
    check(await page.locator('.learning-journey-item[data-work-source="group"][data-journey-kind="note"]').count() === 1, "authorized Study Song note projection missing");
    await page.locator('.learning-journey-item[data-journey-kind="note"]').first().focus();
    await page.keyboard.press("Escape");
    check(await page.locator("#learningHomeJourneyPanel").isHidden(), "Escape did not close journey region");
    check(await notes.evaluate((node) => document.activeElement === node), "Escape did not return focus to disclosure control");

    const stabilityBefore = { nodes: await page.locator("*").count(), heapBytes: await heapUsed() };
    for (let cycle = 0; cycle < 20; cycle++) {
      await bookmarks.click();
      await page.waitForFunction(() => document.querySelectorAll('.learning-journey-item[data-journey-kind="bookmark"]').length === 48);
      await bookmarks.click();
      await page.waitForFunction(() => document.getElementById("learningHomeJourneyPanel")?.hidden === true);
    }
    const stability = {
      before: stabilityBefore,
      after: { nodes: await page.locator("*").count(), heapBytes: await heapUsed() },
      longTasks: await page.evaluate(() => (window.__b8LongTasks || []).slice()),
    };
    stability.nodeDelta = stability.after.nodes - stability.before.nodes;
    stability.heapDeltaBytes = stability.after.heapBytes - stability.before.heapBytes;
    check(stability.nodeDelta <= 8, "20-cycle DOM budget exceeded: " + JSON.stringify(stability));
    check(stability.heapDeltaBytes <= 10 * 1024 * 1024, "20-cycle retained heap budget exceeded: " + JSON.stringify(stability));
    check(stability.longTasks.filter((duration) => duration >= 50).length === 0, "journey interactions emitted >=50ms long tasks: " + JSON.stringify(stability.longTasks));

    await page.evaluate(() => window.appSetLocale("he"));
    await page.waitForFunction(() => document.documentElement.dir === "rtl" && /נשמר/.test(document.querySelector(".learning-home-journey .learning-home-section-title")?.textContent || ""));
    const rtl = await page.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      undersized: Array.from(document.querySelectorAll(".learning-home-journey button")).filter((node) => { const r = node.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length,
      dir: document.documentElement.dir,
    }));
    check(rtl.dir === "rtl" && rtl.overflow === 0 && rtl.undersized === 0, "HE/RTL gate failed: " + JSON.stringify(rtl));
    await page.screenshot({ path: path.join(OUT, "room-b8-home-380-he-rtl.png"), fullPage: true });

    await page.setViewportSize({ width: 320, height: 844 });
    const spacing = await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "b8-text-spacing-gate";
      style.textContent = "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";
      document.head.appendChild(style);
      const root = document.querySelector(".learning-home-journey");
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        clipped: Array.from(root.querySelectorAll("button")).filter((node) => { const r = node.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length,
      };
    });
    check(spacing.overflow === 0 && spacing.clipped === 0, "320px text-spacing gate failed: " + JSON.stringify(spacing));
    await page.screenshot({ path: path.join(OUT, "room-b8-home-320-he-rtl-text-spacing.png"), fullPage: true });
    await page.evaluate(() => document.getElementById("b8-text-spacing-gate")?.remove());

    await page.setViewportSize({ width: 1280, height: 900 });
    const zoom = await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
      const root = document.querySelector(".learning-home-journey");
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        clipped: Array.from(root.querySelectorAll("button")).filter((node) => { const r = node.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length,
      };
    });
    check(zoom.overflow === 0 && zoom.clipped === 0, "200% zoom gate failed: " + JSON.stringify(zoom));
    await page.screenshot({ path: path.join(OUT, "room-b8-home-1280-he-rtl-200pct.png"), fullPage: false });

    const finalReview = await page.evaluate(async () => (await import("/db/local-db.js")).countReviewLog());
    check(finalReview === direct.beforeReview, "locale/zoom journey inspection changed review_log");
    check(pageErrors.length === 0, "page errors: " + pageErrors.join(" | "));
    check(contentRequests.length === 0, "unexpected telemetry/RUM request: " + contentRequests.join(" | "));
    await context.close();

    const evidence = { direct, home, afterBookmark, resumedEarlier, stability, rtl, spacing, zoom, pageErrors, contentRequests };
    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
    await stopServer(server.child);
  }
  if (failures.length) {
    for (const failure of failures) console.error("  ✗ " + failure);
    process.exit(1);
  }
  console.log("room-b8-reading-journey-smoke: PASS — last-worked-position + separate bookmark + typed My/Ben/Study + 5k/48 + 20-cycle DOM/heap/long-task + RU/HE/RTL/320/text-spacing/200% + zero review_log/RUM");
  console.log("evidence: " + path.relative(ROOT, OUT));
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
