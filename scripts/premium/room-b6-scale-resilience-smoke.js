#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.ROOM_B6_PORT || 3316);
const BASE = `http://127.0.0.1:${PORT}`;
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const OUT = path.resolve(ROOT, outArg ? outArg.slice(6) : ".tmp/room-b6-scale-resilience");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
let checks = 0;
const check = (condition, message) => { checks++; if (!condition) failures.push(message); };

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : 0;
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

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function seedRange(page, from, count) {
  await page.evaluate(async ({ from, count }) => {
    const db = await import("/db/local-db.js");
    const chunks = [];
    for (let offset = 0; offset < count; offset += 1000) chunks.push({ start: from + offset, size: Math.min(1000, count - offset) });
    await db.execRaw("BEGIN;");
    try {
      for (const chunk of chunks) {
        await db.dbRun(`WITH RECURSIVE seq(x) AS (
            SELECT 0 UNION ALL SELECT x + 1 FROM seq WHERE x + 1 < ?
          ), numbered AS (SELECT ? + x AS n FROM seq)
          INSERT INTO texts (id, text_key, title, source_text, level, tags_json, source, topic, created_at, updated_at, last_opened_at)
          SELECT printf('b6-text-%05d', n), printf('b6-text-%05d', n),
                 CASE WHEN n IN (1,2500,5000)
                      THEN printf('Edge marker %05d%s', n, CASE WHEN n = 5000 THEN ' TAIL-5000' ELSE '' END)
                      ELSE printf('Scale text %05d', n) END,
                 printf('Body %05d', n), CASE WHEN n % 2 = 0 THEN 'B1' ELSE 'A2' END,
                 CASE WHEN n % 3 = 0 THEN '["news","scale"]' ELSE '["lesson"]' END,
                 'B6 synthetic fixture', CASE WHEN n % 2 = 0 THEN 'Even' ELSE 'Odd' END,
                 strftime('%Y-%m-%dT%H:%M:%fZ','now', printf('+%d seconds', n)),
                 strftime('%Y-%m-%dT%H:%M:%fZ','now', printf('+%d seconds', n)), NULL
            FROM numbered`, [chunk.size, chunk.start]);
      }
      await db.execRaw("COMMIT;");
    } catch (error) { await db.execRaw("ROLLBACK;").catch(() => {}); throw error; }
  }, { from, count });
}

async function seedScopeEdges(page) {
  await page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    for (const n of [1, 2500, 5000]) {
      const id = `b6-text-${String(n).padStart(5, "0")}`;
      await db.dbRun(`INSERT INTO sentences (id,text_id,order_index,he_plain,ru,created_at)
        VALUES (?,?,0,?,'scope-marker row',strftime('%Y-%m-%dT%H:%M:%fZ','now'))`, [`b6-s-${n}`, id, `שורה ${n}`]);
      await db.dbRun(`INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,created_at,updated_at)
        VALUES (?,'text',?,?,'free','scope-marker note','{"markdown":"scope-marker note"}',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))`, [`b6-n-${n}`, id, id]);
    }
    await db.dbRun(`INSERT OR IGNORE INTO review_log (id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json)
      VALUES ('b6-review-proof','lemma:b6-proof','review',strftime('%Y-%m-%dT%H:%M:%fZ','now'),3,'b6-fixture','lab',123,'{}')`, []);
  });
}

async function reviewSnapshot(page) {
  return page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    return db.dbQuery("SELECT id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json FROM review_log ORDER BY id", []);
  });
}

async function directContract(page, expectedTotal) {
  return page.evaluate(async ({ expectedTotal }) => {
    const db = await import("/db/local-db.js");
    const encodeBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const started = performance.now();
    const first = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc" });
    const cold_ms = performance.now() - started;
    const warm_ms = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now(); await db.listPersonalTextsPage({ limit: 48, sort: "title_asc" }); warm_ms.push(performance.now() - t);
    }
    const search_ms = [];
    let tail = null;
    for (let i = 0; i < 12; i++) {
      const t = performance.now(); tail = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc", q: "TAIL-5000" }); search_ms.push(performance.now() - t);
    }
    const edgeMeta = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc", q: "Edge marker", scope: "texts" });
    const edgeRows = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc", q: "scope-marker", scope: "rows" });
    const edgeNotes = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc", q: "scope-marker", scope: "notes" });
    const ids = [];
    let cursor = null, loops = 0;
    do {
      const pageResult = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc", cursor });
      ids.push(...pageResult.items.map((item) => item.id)); cursor = pageResult.nextCursor; loops++;
      if (loops > Math.ceil(expectedTotal / 48) + 2) throw new Error("CURSOR_LOOP");
    } while (cursor);
    const queryPlan = await db.dbQuery(`EXPLAIN QUERY PLAN
      WITH matched AS (
        SELECT t.id, COALESCE(t.title, '') AS sort_primary
          FROM texts t LEFT JOIN text_progress tp ON tp.text_id = t.id
         WHERE NOT EXISTS (
           SELECT 1 FROM json_each(CASE WHEN json_valid(t.source_meta_json) THEN t.source_meta_json ELSE '{}' END)
            WHERE json_extract(CASE WHEN json_valid(t.source_meta_json) THEN t.source_meta_json ELSE '{}' END, '$.corpus') IS NOT NULL
               OR json_extract(CASE WHEN json_valid(t.source_meta_json) THEN t.source_meta_json ELSE '{}' END, '$.group_corpus') IS NOT NULL
         )
      ), counted AS (SELECT matched.*, COUNT(*) OVER() AS matched_total FROM matched)
      SELECT * FROM counted ORDER BY sort_primary COLLATE NOCASE ASC, id ASC LIMIT 49`, []);
    return {
      expectedTotal, matchedTotal: first.matchedTotal, firstCount: first.items.length,
      payloadBytes: encodeBytes(first.items), forbiddenKeys: Array.from(new Set(first.items.flatMap(Object.keys))).filter((key) => ["source_text","source_meta_json","table_model_meta_json"].includes(key)),
      nextCursor: !!first.nextCursor, cold_ms, warm_ms, search_ms,
      tailTotal: tail.matchedTotal, tailIds: tail.items.map((item) => item.id),
      edgeMeta: edgeMeta.items.map((item) => item.id), edgeRows: edgeRows.items.map((item) => item.id), edgeNotes: edgeNotes.items.map((item) => item.id),
      traversed: ids.length, unique: new Set(ids).size, firstId: ids[0], lastId: ids[ids.length - 1], loops, queryPlan,
    };
  }, { expectedTotal });
}

async function waitForRoom(page) {
  await page.waitForFunction(() => document.querySelector(".mytexts-grid") && !document.querySelector(".mytexts-grid").hasAttribute("aria-busy"), null, { timeout: 60000 });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer();
  if (!await waitForServer()) { await stopServer(server.child); throw new Error("server did not become ready\n" + server.logs.join("")); }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, locale: "ru-RU", colorScheme: "light", serviceWorkers: "allow" });
  const page = await context.newPage();
  const consoleErrors = [];
  const rumRequests = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", (request) => { if (/rum|telemetry|analytics/i.test(request.url())) rumRequests.push(request.url()); });
  const evidence = { generated_at: new Date().toISOString(), environment: { base: BASE, viewport: "380x844", browser: "chromium-headless automation" } };
  try {
    await page.goto(BASE + "/library.html?canon=skip#room=mytexts", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.__localDB && window.__localDB.isReady && window.__localDB.isReady(), null, { timeout: 60000 });
    await seedRange(page, 1, 1000);
    const at1k = await directContract(page, 1000);
    check(at1k.matchedTotal === 1000, "1k exact matchedTotal");
    check(at1k.traversed === 1000 && at1k.unique === 1000, "1k cursor traversal has no skip/duplicate");
    await seedRange(page, 1001, 4000);
    await seedScopeEdges(page);
    const beforeReview = await reviewSnapshot(page);
    const at5k = await directContract(page, 5000);
    evidence.contract_1k = at1k; evidence.contract_5k = at5k;
    evidence.performance = {
      cold_ms: at5k.cold_ms,
      warm_p50_ms: percentile(at5k.warm_ms, .50), warm_p95_ms: percentile(at5k.warm_ms, .95),
      search_p95_ms: percentile(at5k.search_ms, .95),
    };
    check(at5k.matchedTotal === 5000, "5k exact matchedTotal");
    check(at5k.firstCount === 48 && at5k.nextCursor, "5k page is 48 with next cursor");
    check(at5k.payloadBytes <= 256 * 1024 && at5k.forbiddenKeys.length === 0, "48-card payload is <=256 KiB and light");
    check(at5k.tailTotal === 1 && at5k.tailIds[0] === "b6-text-05000", "tail metadata search finds item 5000");
    check(at5k.edgeMeta.length === 3 && at5k.edgeRows.length === 3 && at5k.edgeNotes.length === 3, "first/middle/last are found in metadata/rows/notes scopes");
    check(at5k.traversed === 5000 && at5k.unique === 5000, "5k cursor traversal has no skip/duplicate");
    check(Array.isArray(at5k.queryPlan) && at5k.queryPlan.length > 0, "5k representative exact-total query plan is captured");
    check(evidence.performance.cold_ms <= 900, "cold page query <=900ms");
    check(evidence.performance.warm_p95_ms <= 500, "warm page p95 <=500ms");
    check(evidence.performance.search_p95_ms <= 600, "search p95 <=600ms");

    await page.reload({ waitUntil: "load", timeout: 60000 });
    await waitForRoom(page);
    const firstDom = await page.evaluate(() => ({
      cards: document.querySelectorAll(".mytexts-grid .mytext-card").length,
      nodes: document.getElementsByTagName("*").length,
      summary: document.querySelector(".mytexts-results") && document.querySelector(".mytexts-results").textContent,
      navCount: performance.getEntriesByType("navigation").length,
      stateBytes: new TextEncoder().encode(JSON.stringify(history.state || {})).byteLength,
      state: history.state,
      url: location.href,
    }));
    evidence.first_dom = firstDom;
    check(firstDom.cards === 48, "UI mounts exactly 48 cards at 5k");
    check(firstDom.nodes <= 2438, "DOM stays below B0 ceiling");
    check(/5[\s,.]?000/.test(firstDom.summary || ""), "UI shows exact 5000 total");
    check(firstDom.stateBytes <= 8 * 1024, "history state <=8 KiB");
    check(firstDom.state && firstDom.state.v === 1 && firstDom.state.corpus === "mytexts", "initial structural Room entry is versioned in history.state");

    await page.locator(".mytexts-grid .mytext-card .mytext-open").first().click();
    await page.waitForSelector("#roomReader:not([hidden])", { timeout: 30000 });
    await page.goBack();
    await page.waitForSelector("#roomReader", { state: "hidden", timeout: 30000 });
    await waitForRoom(page);
    const pristineBack = await page.evaluate(() => ({ state: history.state, cards: document.querySelectorAll(".mytexts-grid .mytext-card").length }));
    check(pristineBack.state && pristineBack.state.surface === "mytexts", "Back from a pristine Room entry restores the catalog state");
    check(pristineBack.cards === 48, "Back from a pristine Room entry restores one bounded window");

    const firstCardId = await page.locator(".mytexts-grid .mytext-card").first().getAttribute("data-continuity-key");
    await page.locator(".mytexts-page-next").click(); await waitForRoom(page);
    const nextCardId = await page.locator(".mytexts-grid .mytext-card").first().getAttribute("data-continuity-key");
    check(firstCardId !== nextCardId, "Next replaces the 48-card window");
    check(await page.locator(".mytexts-grid .mytext-card").count() === 48, "Next keeps 48 cards");
    await page.locator(".mytexts-page-prev").click(); await waitForRoom(page);
    check(await page.locator(".mytexts-grid .mytext-card").first().getAttribute("data-continuity-key") === firstCardId, "Previous restores the prior keyset window");

    await page.locator(".mytexts-page-next").click(); await waitForRoom(page);
    await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      await db.dbRun("UPDATE texts SET updated_at='2999-01-01T00:00:00.000Z' WHERE id='b6-text-00001'", []);
    });
    await page.locator(".mytexts-page-next").click(); await waitForRoom(page);
    check((await page.locator(".mytexts-results").textContent()).includes("1–48"), "snapshot mutation restarts pagination at page 1");
    check(await page.locator(".mytexts-grid .mytext-card").first().getAttribute("data-continuity-key") === "mytexts:b6-text-00001", "mutation restart paints the new canonical first item");

    const input = page.locator("#roomMyTextsSearch");
    await input.fill("TAIL-5000");
    await page.waitForFunction(() => document.querySelectorAll(".mytexts-grid .mytext-card").length === 1, null, { timeout: 30000 });
    check((await page.locator(".mytexts-results").textContent()).includes("1"), "tail search paints one exact result");
    const localState = await page.evaluate(() => ({ state: history.state, url: location.href, mirror: sessionStorage.getItem("room.presentation.v1") }));
    check(localState.state && localState.state.filters.q === "TAIL-5000", "query is browser-local in history.state");
    check(!localState.url.includes("TAIL-5000"), "query is absent from URL");
    check(Buffer.byteLength(localState.mirror || "") <= 8 * 1024, "session mirror <=8 KiB");

    await page.reload({ waitUntil: "load", timeout: 60000 }); await waitForRoom(page);
    check(await page.locator("#roomMyTextsSearch").inputValue() === "TAIL-5000", "reload restores query from history/session");
    await page.locator(".mytexts-grid .mytext-card .mytext-open").click();
    await page.waitForSelector("#roomReader:not([hidden])", { timeout: 30000 });
    const openedStamp = await page.evaluate(async () => {
      const db = await import("/db/local-db.js"); return (await db.dbQuery("SELECT last_opened_at FROM texts WHERE id='b6-text-05000'", []))[0].last_opened_at;
    });
    await page.goBack(); await page.waitForSelector("#roomReader", { state: "hidden", timeout: 30000 }); await waitForRoom(page);
    const afterBackStamp = await page.evaluate(async () => {
      const db = await import("/db/local-db.js"); return (await db.dbQuery("SELECT last_opened_at FROM texts WHERE id='b6-text-05000'", []))[0].last_opened_at;
    });
    check(afterBackStamp === openedStamp, "popstate Back adds no last-opened write");
    await page.goForward(); await page.waitForSelector("#roomReader:not([hidden])", { timeout: 30000 });
    const afterForwardStamp = await page.evaluate(async () => {
      const db = await import("/db/local-db.js"); return (await db.dbQuery("SELECT last_opened_at FROM texts WHERE id='b6-text-05000'", []))[0].last_opened_at;
    });
    check(afterForwardStamp === openedStamp, "popstate Forward restores reader read-only");
    await page.goBack(); await page.waitForSelector("#roomReader", { state: "hidden", timeout: 30000 }); await waitForRoom(page);

    // History restoration above intentionally keeps the tail-search query. Reset
    // to the complete collection before exercising repeated cursor windows.
    await page.locator("#roomMyTextsSearch").fill("");
    await page.waitForFunction(() => document.querySelectorAll(".mytexts-grid .mytext-card").length === 48);

    const client = await page.context().newCDPSession(page);
    await client.send("HeapProfiler.collectGarbage");
    const heapBefore = (await client.send("Runtime.getHeapUsage")).usedSize;
    const domBefore = await client.send("Memory.getDOMCounters");
    await page.evaluate(() => {
      window.__b6LongTasks = [];
      try { new PerformanceObserver((list) => window.__b6LongTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ type: "longtask", buffered: true }); } catch (_) {}
    });
    for (let i = 0; i < 20; i++) {
      await page.locator(".mytexts-page-next").click(); await waitForRoom(page);
      await page.locator(".mytexts-page-prev").click(); await waitForRoom(page);
    }
    await client.send("HeapProfiler.collectGarbage");
    const heapAfter = (await client.send("Runtime.getHeapUsage")).usedSize;
    const domAfter = await client.send("Memory.getDOMCounters");
    const longTasks = await page.evaluate(() => window.__b6LongTasks || []);
    evidence.memory = { before_bytes: heapBefore, after_bytes: heapAfter, retained_delta_bytes: heapAfter - heapBefore, dom_before: domBefore, dom_after: domAfter, long_tasks_over_50ms: longTasks.filter((value) => value > 50) };
    check(heapAfter - heapBefore <= 10 * 1024 * 1024, "20 paging cycles retain <=10 MiB after controlled GC");
    check(domAfter.nodes - domBefore.nodes <= 500, "20 paging cycles retain <=500 additional DOM nodes after controlled GC");
    check(evidence.memory.long_tasks_over_50ms.length === 0, "paging cycle reports no >50ms long tasks");

    await page.screenshot({ path: path.join(OUT, "room-b6-5000-380-ru.png"), fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: path.join(OUT, "room-b6-5000-380-ru-dark.png"), fullPage: true });
    await page.selectOption("#roomLang", "he");
    await page.waitForFunction(() => document.documentElement.dir === "rtl");
    await page.locator("#roomMyTextsSearch").fill("__b6-no-match__");
    await page.waitForFunction(() => {
      const grid = document.querySelector(".mytexts-grid"), summary = document.querySelector(".mytexts-results")?.textContent || "";
      return document.documentElement.dir === "rtl" && grid && !grid.hasAttribute("aria-busy") && grid.querySelectorAll(".mytext-card").length === 0 && /0\s*\/\s*0/.test(summary);
    });
    await page.locator("#roomMyTextsSearch").fill("");
    await page.waitForFunction(() => {
      const grid = document.querySelector(".mytexts-grid"), next = document.querySelector(".mytexts-page-next");
      return document.documentElement.dir === "rtl" && grid && !grid.hasAttribute("aria-busy") && grid.querySelectorAll(".mytext-card").length === 48 && next && !next.disabled;
    });
    await page.screenshot({ path: path.join(OUT, "room-b6-5000-380-he-rtl-dark.png"), fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({ path: path.join(OUT, "room-b6-5000-380-he-rtl.png"), fullPage: true });
    evidence.visual_matrix = await page.evaluate(() => ({
      viewport: `${innerWidth}x${innerHeight}`, locale: document.documentElement.lang, direction: document.documentElement.dir,
      cards: document.querySelectorAll(".mytexts-grid .mytext-card").length,
      nodes: document.getElementsByTagName("*").length,
    }));

    await page.selectOption("#roomLang", "ru");
    await page.waitForFunction(() => document.documentElement.dir === "ltr");
    await page.locator("#roomMyTextsSearch").fill("");
    await page.waitForFunction(() => {
      const grid = document.querySelector(".mytexts-grid"), next = document.querySelector(".mytexts-page-next");
      return grid && !grid.hasAttribute("aria-busy") && grid.querySelectorAll(".mytext-card").length === 48 && next && !next.disabled;
    });
    await client.send("Emulation.setDeviceMetricsOverride", { width: 640, height: 450, screenWidth: 1280, screenHeight: 900, deviceScaleFactor: 2, mobile: false });
    // Finish any locale-triggered repaint before the keyboard assertion. A
    // no-result -> full-result transition makes the final pager generation
    // observable instead of relying on animation-frame timing.
    await page.locator("#roomMyTextsSearch").fill("__b6-no-match__");
    await page.waitForFunction(() => {
      const grid = document.querySelector(".mytexts-grid"), summary = document.querySelector(".mytexts-results")?.textContent || "";
      return grid && !grid.hasAttribute("aria-busy") && grid.querySelectorAll(".mytext-card").length === 0 && /0\s*\/\s*0/.test(summary);
    });
    await page.locator("#roomMyTextsSearch").fill("");
    await page.waitForFunction(() => {
      const grid = document.querySelector(".mytexts-grid"), next = document.querySelector(".mytexts-page-next");
      return grid && !grid.hasAttribute("aria-busy") && grid.querySelectorAll(".mytext-card").length === 48 && next && !next.disabled;
    });
    const desktopA11y = await page.evaluate(() => {
      const selectors = ["#roomMyTextsSearch", "#roomMyTextsScope", "#roomMyTextsSort", ".mytexts-page-prev", ".mytexts-page-next", "#roomDiagnosticExport"];
      const targets = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))).filter((node) => {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).map((node) => ({ selector: node.id ? "#" + node.id : "." + node.classList[0], width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
      return {
        inner_width_css_px: innerWidth, device_pixel_ratio: devicePixelRatio,
        result_live: document.querySelector(".mytexts-results")?.getAttribute("aria-live"),
        connection_live: document.querySelector("#roomConnectionStatus")?.getAttribute("aria-live"),
        targets, undersized: targets.filter((target) => target.width < 24 || target.height < 24),
        horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });
    await page.locator("#roomMyTextsSearch").focus();
    await page.keyboard.press("Tab");
    desktopA11y.focus_after_search = await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.className));
    const keyboardBefore = await page.locator(".mytexts-grid .mytext-card").first().getAttribute("data-continuity-key");
    desktopA11y.keyboard_before = keyboardBefore;
    await page.locator(".mytexts-page-next").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction((before) => {
      const grid = document.querySelector(".mytexts-grid");
      const current = grid && grid.querySelector(".mytext-card")?.getAttribute("data-continuity-key");
      return !!current && current !== before && !grid.hasAttribute("aria-busy");
    }, keyboardBefore);
    desktopA11y.keyboard_next_first = await page.locator(".mytexts-grid .mytext-card").first().getAttribute("data-continuity-key");
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, "room-b6-5000-desktop-1280-zoom200.png"), fullPage: false });
    await page.locator(".mytexts-page-next").focus();
    await page.screenshot({ path: path.join(OUT, "room-b6-5000-desktop-1280-zoom200-keyboard-next.png"), fullPage: false });
    evidence.desktop_zoom_a11y = desktopA11y;
    check(desktopA11y.inner_width_css_px === 640 && desktopA11y.device_pixel_ratio === 2, "1280 physical matrix simulates 200% zoom as 640 CSS px at DPR 2");
    check(desktopA11y.result_live === "polite" && desktopA11y.connection_live === "polite", "result and connection changes expose polite live regions");
    check(desktopA11y.undersized.length === 0, "B6 controls meet the 24x24 CSS px target floor");
    check(desktopA11y.horizontal_overflow_px === 0, "200% zoom has no horizontal document overflow");
    check(desktopA11y.keyboard_next_first && desktopA11y.keyboard_next_first !== keyboardBefore, "Next pagination is keyboard operable at 200% zoom");
    await client.send("Emulation.clearDeviceMetricsOverride");
    await page.setViewportSize({ width: 380, height: 844 });

    await context.setOffline(true); await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }); await waitForRoom(page);
    const offlineState = await page.evaluate(() => ({ state: document.querySelector("#roomConnectionStatus")?.dataset.state, cards: document.querySelectorAll(".mytexts-grid .mytext-card").length }));
    evidence.offline = offlineState;
    check(offlineState.state === "offline-ready" && offlineState.cards <= 48, "warm offline restores local Room with explicit offline-ready");
    await context.setOffline(false);
    await page.waitForFunction(() => document.querySelector("#roomConnectionStatus")?.dataset.state === "online", null, { timeout: 30000 });
    const afterReconnect = await page.evaluate(() => ({ state: document.querySelector("#roomConnectionStatus")?.dataset.state, navCount: performance.getEntriesByType("navigation").length }));
    evidence.reconnect = afterReconnect;
    check(afterReconnect.navCount === 1, "reconnect refreshes projections without full reload");

    const afterReview = await reviewSnapshot(page);
    check(JSON.stringify(afterReview) === JSON.stringify(beforeReview), "review_log row content is unchanged across B6 flows");
    const diagnostics = await page.evaluate(async () => {
      const core = await import("/js/room-b6-core.js");
      const ring = JSON.parse(localStorage.getItem("room.diagnostics.local.v1") || "[]");
      return { ring, exported: core.sanitizeDiagnosticExport(ring, Date.now()) };
    });
    evidence.diagnostics = { entries: diagnostics.ring.length, export_schema: diagnostics.exported.schema_version, network_requests: rumRequests };
    check(diagnostics.ring.length <= 120 && diagnostics.ring.length > 0, "local diagnostics ring is nonempty and bounded");
    check(rumRequests.length === 0, "local diagnostics emit no RUM/analytics request");
    check(consoleErrors.filter((line) => !/401|favicon|Failed to load resource/.test(line)).length === 0, "no unexpected browser console errors");
  } finally {
    fs.writeFileSync(path.join(OUT, "ROOM_B6_AUTOMATION_EVIDENCE.json"), JSON.stringify({ ...evidence, checks, failures, result: failures.length ? "FAIL" : "PASS" }, null, 2));
    await browser.close(); await stopServer(server.child);
  }
  if (failures.length) {
    console.error(`[room-b6-scale-resilience-smoke] FAIL ${checks - failures.length}/${checks}`);
    for (const failure of failures) console.error(" - " + failure);
    process.exit(1);
  }
  console.log(`[room-b6-scale-resilience-smoke] PASS ${checks}/${checks}`);
  console.log(`evidence -> ${path.relative(ROOT, OUT)}`);
}

main().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
