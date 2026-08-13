#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.ROOM_B7_PORT || 3317);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(ROOT, process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) || ".tmp/room-b7-learning-compass");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
let checks = 0;
const check = (value, message) => { checks += 1; if (!value) failures.push(message); };

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : 0;
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, windowsHide: true,
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

function calibrationLedger() {
  const hashes = ["a", "a", "b", "b", "c"];
  return {
    schema_version: "room.reading_calibration.2.0.0",
    samples: hashes.map((char, index) => ({
      sample_id: `b7-smoke-${index + 1}`,
      revision_hash: char.repeat(64), resolver_version: "recorded-familiarity-v2",
      token_count: 500, elapsed_foreground_ms: 300000 + index * 15000,
      modality: "FOREGROUND_READING", completed_at: `2026-08-0${index + 1}T12:00:00.000Z`,
    })),
  };
}

async function seed(page, withProfile) {
  return page.evaluate(async ({ profile, ledger }) => {
    const db = await import("/db/local-db.js");
    for (let index = 1; index <= 8; index += 1) {
      const suffix = String(index).padStart(2, "0");
      await db.createText({
        id: `b7-text-${suffix}`, text_key: `b7-text-${suffix}`,
        title: `טקסט מצפן ${suffix}`, source_text: `שלום עולם לימוד ${suffix}`,
        level: index % 2 ? "alef" : "bet", topic: "B7 smoke", tags_json: '["b7"]',
      });
      await db.addSentence(`b7-text-${suffix}`, {
        id: `b7-text-${suffix}-s1`, order_index: 0,
        he_plain: "שלום עולם לימוד", he_niqqud: "שָׁלוֹם עוֹלָם לִמּוּד", ru: "привет мир обучение",
      });
    }
    if (profile) {
      await db.applyWordStatusFromSync("pid:1", "known");
      await db.applyWordStatusFromSync("pid:2", "new");
    }
    const listed = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc" });
    for (let index = 0; index < listed.items.length; index += 1) {
      if (index === 4) continue; // honest NOT_PREPARED; idle behavior is scenario-controlled.
      const item = listed.items[index];
      const stale = index === 3;
      const limited = index === 1;
      const unsupported = index === 2;
      const frequencies = unsupported
        ? [{ key: "pid:1", token_count: 250001 }]
        : [{ key: "pid:1", token_count: 480 }, { key: "pid:2", token_count: 120 }];
      const unresolved = limited ? 60 : 0;
      const ingredients = {
        schema_version: "room.learning_ingredients.2.0.1", source_class: "mytext", source_key: String(item.text_key),
        content_revision: stale ? "stale-revision" : String(item.updated_at || "unknown"),
        content_sha256: String(index + 1).padStart(64, "0"), entitlement_revision: null,
        resolver_version: "recorded-familiarity-v2", lexical_resolver_version: "b7-smoke-resolver",
        dataset_version: "b7-smoke", key_frequencies: frequencies,
        unresolved_token_count: unresolved, proper_name_token_count: 0,
        total_token_count: unsupported ? 250001 : 600 + unresolved,
        built_at: "2026-08-12T12:00:00.000Z",
      };
      await db.putLearningCompassIngredients({
        cache_key: `mytext:${item.id}`, source_class: "mytext", source_key: item.text_key,
        content_revision: ingredients.content_revision, content_sha256: ingredients.content_sha256,
        entitlement_revision: null, resolver_version: "recorded-familiarity-v2", ingredients,
      });
    }
    localStorage.setItem("room.learningCompass.calibration.v2", JSON.stringify(ledger));
    return { count: listed.matchedTotal };
  }, { profile: withProfile, ledger: calibrationLedger() });
}

async function runColdLibraryScenario(browser) {
  const coldTotal = 115;
  const context = await browser.newContext({
    viewport: { width: 380, height: 844 }, locale: "ru-RU", colorScheme: "light", serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  await page.addInitScript(() => {
    localStorage.setItem("app.locale", "ru"); localStorage.setItem("appTheme_v1", "light");
    window.requestIdleCallback = (callback) => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 12 }), 0);
  });
  await page.goto(BASE + "/library.html?canon=skip#room=mytexts", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__localDB?.isReady?.(), null, { timeout: 60000 });
  const seeded = await page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    const total = 115;
    for (let index = 1; index <= total; index += 1) {
      const suffix = String(index).padStart(3, "0"), id = `b7-cold-${suffix}`;
      const hebrew = `${"שלום ".repeat(index)}${"עולם ".repeat(total + 1 - index)}`.trim();
      const vocalized = `${"שָׁלוֹם ".repeat(index)}${"עוֹלָם ".repeat(total + 1 - index)}`.trim();
      await db.createText({ id, text_key: id, title: `Холодный текст ${suffix}`, source_text: hebrew, topic: "cold B7" });
      await db.addSentence(id, { id: `${id}-s1`, order_index: 0, he_plain: hebrew, he_niqqud: vocalized, ru: "привет мир" });
    }
    await db.applyWordStatusFromSync("pid:b7-cold-profile", "known");
    await db.dbRun("DELETE FROM room_learning_compass_cache");
    return {
      canonical: {
        review_log: await db.dbQuery("SELECT * FROM review_log ORDER BY id"),
        word_status: await db.dbQuery("SELECT * FROM word_status ORDER BY lemma_key"),
        progress: await db.dbQuery("SELECT * FROM text_progress ORDER BY text_id"),
        texts: await db.dbQuery("SELECT id,text_key,title,source_text,updated_at,last_opened_at FROM texts WHERE id LIKE 'b7-cold-%' ORDER BY id"),
      },
    };
  });
  await page.reload({ waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(".mytexts-grid .mytext-card", { timeout: 60000 });
  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll(".mytexts-grid .mytext-card").length,
    unprepared: document.querySelectorAll(".mytexts-grid .coverage-not_prepared").length,
    pending: document.querySelectorAll(".mytexts-grid .coverage-pending").length,
    readerOpen: document.body.classList.contains("room-reading"),
  }));
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll(".mytexts-grid .mytext-card").length;
    const unresolved = document.querySelectorAll(".mytexts-grid .coverage-not_prepared,.mytexts-grid .coverage-pending,.mytexts-grid .coverage-unavailable,.mytexts-grid .coverage-unsupported,.mytexts-grid .coverage-stale").length;
    return cards === 48 && unresolved === 0;
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector("[data-learning-index-status]")?.getAttribute("data-state") === "ready", null, { timeout: 120000 });
  const final = await page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    return {
      cards: document.querySelectorAll(".mytexts-grid .mytext-card").length,
      available: document.querySelectorAll(".mytexts-grid .coverage-available,.mytexts-grid .coverage-available_limited").length,
      progress: document.querySelector("[data-learning-index-copy]")?.textContent || "",
      readerOpen: document.body.classList.contains("room-reading"),
      cache: Number((await db.dbQuery("SELECT COUNT(*) n FROM room_learning_compass_cache WHERE source_class='mytext'"))[0]?.n || 0),
      canonical: {
        review_log: await db.dbQuery("SELECT * FROM review_log ORDER BY id"),
        word_status: await db.dbQuery("SELECT * FROM word_status ORDER BY lemma_key"),
        progress_rows: await db.dbQuery("SELECT * FROM text_progress ORDER BY text_id"),
        texts: await db.dbQuery("SELECT id,text_key,title,source_text,updated_at,last_opened_at FROM texts WHERE id LIKE 'b7-cold-%' ORDER BY id"),
      },
    };
  });
  check(initial.cards === 48, `cold-library: bounded first page renders 48 of ${coldTotal} cards (${initial.cards})`);
  check(initial.unprepared + initial.pending === 48, `cold-library: every visible card starts in an honest preparation state (${initial.unprepared}+${initial.pending})`);
  check(!initial.readerOpen && !final.readerOpen, "cold-library: preparation completes without opening Reader");
  check(final.available === 48, `cold-library: every visible card becomes usable for familiarity matching (${final.available}/48)`);
  check(final.cache === coldTotal, `cold-library: all ${coldTotal} personal texts receive a derived cache entry (${final.cache}/${coldTotal})`);
  check(new RegExp(`${coldTotal}\\s+текст`).test(final.progress), `cold-library: full catalog readiness is visible (${final.progress})`);
  check(JSON.stringify(final.canonical.review_log) === JSON.stringify(seeded.canonical.review_log), "cold-library: analysis writes no review events");
  check(JSON.stringify(final.canonical.word_status) === JSON.stringify(seeded.canonical.word_status), "cold-library: analysis changes no learner status");
  check(JSON.stringify(final.canonical.progress_rows) === JSON.stringify(seeded.canonical.progress), "cold-library: analysis changes no reading progress");
  check(JSON.stringify(final.canonical.texts) === JSON.stringify(seeded.canonical.texts), "cold-library: analysis changes no personal text or last-opened state");
  check(errors.length === 0, `cold-library: no page errors (${errors.join(" | ")})`);
  const packetFixture = await page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    const requests = [];
    for (let index = 1; index <= 48; index += 1) {
      const cacheKey = `mytext:b7-packet-${index}`;
      const ingredients = {
        schema_version: "room.learning_ingredients.2.0.1", source_class: "mytext", source_key: `b7-packet-${index}`,
        content_revision: "r1", content_sha256: "", entitlement_revision: null,
        resolver_version: "recorded-familiarity-v2", lexical_resolver_version: "b7-packet-fixture",
        dataset_version: "fixture", key_frequencies: Array.from({ length: 320 }, (_, keyIndex) => ({ key: `pid:${keyIndex + 1}`, token_count: 1 })),
        unresolved_token_count: 0, proper_name_token_count: 0, total_token_count: 320,
        built_at: "2026-08-13T00:00:00.000Z",
      };
      await db.putLearningCompassIngredients({ cache_key: cacheKey, source_class: "mytext", source_key: `b7-packet-${index}`,
        content_revision: "r1", content_sha256: "", entitlement_revision: null,
        resolver_version: "recorded-familiarity-v2", ingredients });
      requests.push({ cache_key: cacheKey, source_class: "mytext", source_key: `b7-packet-${index}`,
        content_revision: "r1", content_sha256: "", entitlement_revision: null, resolver_version: "recorded-familiarity-v2" });
    }
    const batch = await db.getLearningCompassIngredientsBatch(requests);
    const stored = await db.dbQuery("SELECT ingredients_json FROM room_learning_compass_cache WHERE cache_key='mytext:b7-packet-1'");
    const tupleStored = Array.isArray(JSON.parse(stored[0].ingredients_json).key_frequencies[0]);
    for (const request of requests) await db.deleteLearningCompassIngredients(request.cache_key);
    return { entries: Object.keys(batch.entries).length, sizeBytes: batch.size_bytes, tupleStored };
  });
  check(packetFixture.entries === 48, `cold-library: one real-size compact page batch returns all 48 entries (${JSON.stringify(packetFixture)})`);
  check(packetFixture.sizeBytes <= 256 * 1024, `cold-library: compact 48-card packet stays within 256 KiB (${packetFixture.sizeBytes})`);
  check(packetFixture.tupleStored, "cold-library: derived cache persists compact [key,count] rows");
  const sortFixture = await page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    const rows = await db.dbQuery("SELECT cache_key,ingredients_json FROM room_learning_compass_cache WHERE cache_key IN ('mytext:b7-cold-001','mytext:b7-cold-115') ORDER BY cache_key");
    const parsed = rows.map((row) => ({ key: row.cache_key, frequencies: JSON.parse(row.ingredients_json).key_frequencies || [] }));
    const pair = (entry) => Array.isArray(entry) ? [String(entry[0]), Number(entry[1]) || 0] : [entry.key, Number(entry.token_count) || 0];
    const first = new Map((parsed[0]?.frequencies || []).map(pair));
    const last = new Map((parsed[1]?.frequencies || []).map(pair));
    const knownKey = Array.from(first.keys()).find((key) => (first.get(key) || 0) > (last.get(key) || 0));
    if (knownKey) await db.applyWordStatusFromSync(knownKey, "known");
    return { knownKey, first: first.get(knownKey) || 0, last: last.get(knownKey) || 0 };
  });
  check(!!sortFixture.knownKey && sortFixture.first > sortFixture.last, `cold-library: ranking fixture has a resolved varying familiar key (${JSON.stringify(sortFixture)})`);
  await page.reload({ waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(".mytexts-grid .mytext-card", { timeout: 60000 });
  await page.selectOption("#roomMyTextsSort", "familiar_desc");
  await page.waitForTimeout(2500);
  const sortState = await page.evaluate(() => ({
    selected: document.querySelector("#roomMyTextsSort")?.value || "",
    label: document.querySelector("#roomMyTextsSort")?.selectedOptions?.[0]?.textContent?.trim() || "",
    first: document.querySelector(".mytexts-grid .work-card-title")?.textContent?.trim() || "",
    toast: document.querySelector(".room-toast,.toast")?.textContent?.trim() || "",
  }));
  check(sortState.selected === "familiar_desc", `cold-library: familiarity sort remains selected (${JSON.stringify(sortState)})`);
  check(sortState.label === "Сначала достоверно знакомые", `cold-library: sort label states the rank-eligibility contract (${JSON.stringify(sortState)})`);
  const sorted = await page.evaluate(() => ({
    titles: Array.from(document.querySelectorAll(".mytexts-grid .work-card-title")).map((node) => node.textContent.trim()),
    scores: Array.from(document.querySelectorAll(".mytexts-grid .learning-familiar")).map((node) => Number((node.textContent.match(/\d+/) || [])[0])),
  }));
  check(sorted.titles[0] === "Холодный текст 001", `cold-library: explicit familiarity sort changes the first text (${sorted.titles[0]})`);
  check(sorted.scores.length === 48 && sorted.scores.every((value, index) => index === 0 || sorted.scores[index - 1] >= value),
    `cold-library: familiarity order is monotonically descending (${sorted.scores.join(",")})`);
  check(new Set(sorted.scores).size > 1, "cold-library: sort evidence is not a tie-only fixture");
  await page.screenshot({ path: path.join(OUT, "380-ru-cold-library-ready.png"), fullPage: true });
  await context.close();
  return { name: "380-ru-cold-library", initial,
    final: { cards: final.cards, available: final.available, cache: final.cache, progress: final.progress },
    packet_budget: packetFixture,
    familiarity_sort: { known_key: sortFixture.knownKey, first_titles: sorted.titles.slice(0, 3), scores: sorted.scores } };
}

async function directBatchMetrics(page) {
  return page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    const listed = await db.listPersonalTextsPage({ limit: 48, sort: "title_asc" });
    const requests = listed.items.map((item) => ({
      cache_key: `mytext:${item.id}`, content_revision: String(item.updated_at || "unknown"),
      content_sha256: "", entitlement_revision: null, resolver_version: "recorded-familiarity-v2",
    }));
    const times = [];
    let last;
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      last = await db.getLearningCompassIngredientsBatch(requests);
      times.push(performance.now() - started);
    }
    const projectionStarted = performance.now();
    const projection = await db.getLearningCompassProjection();
    return {
      times, size_bytes: last.size_bytes, entry_count: Object.keys(last.entries).length,
      stale_count: last.stale_keys.length, projection_ms: performance.now() - projectionStarted,
      projection_tracked: projection.tracked_lexeme_count,
    };
  });
}

async function audit(page, scenario) {
  return page.evaluate(({ name, zoom }) => {
    if (zoom) document.documentElement.style.zoom = String(zoom);
    const root = document.querySelector(".corpus-nav") || document.body;
    const visible = (node) => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const statusClasses = Array.from(root.querySelectorAll(".learning-familiar")).map((node) =>
      Array.from(node.classList).find((value) => value.startsWith("coverage-") && value !== "coverage-badge")).filter(Boolean);
    const controls = Array.from(root.querySelectorAll("button,a[href],summary,input,select")).filter(visible);
    const small = controls.filter((node) => {
      const rect = node.getBoundingClientRect(); return rect.width < 24 || rect.height < 24;
    }).map((node) => ({ tag: node.tagName, cls: node.className, text: node.textContent.trim().slice(0, 40) }));
    const clippedSignals = Array.from(root.querySelectorAll('.learning-signal')).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < 0 || rect.right > innerWidth || node.scrollWidth > node.clientWidth + 1;
    });
    return {
      name, lang: document.documentElement.lang, dir: document.documentElement.dir,
      zoom: zoom || 1, cards: root.querySelectorAll(".mytexts-grid .mytext-card").length,
      dom_nodes: document.getElementsByTagName("*").length,
      overflow_px: Math.max(0, Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth)),
      max_signals: Math.max(0, ...Array.from(root.querySelectorAll(".learning-compass")).map((node) => node.querySelectorAll(".learning-signal").length)),
      compass_details: root.querySelectorAll('.mytexts-grid .learning-compass-details').length,
      clipped_signals: clippedSignals.length,
      status_classes: statusClasses, small_targets: small,
      range_count: Array.from(root.querySelectorAll(".learning-reading-time")).filter((node) => /\d+.*[–-].*\d+/.test(node.textContent)).length,
      fabricated_zero: Array.from(root.querySelectorAll(".learning-familiar")).filter((node) => /^0%/.test(node.textContent.trim())).length,
      familiarity_copy: Array.from(root.querySelectorAll(".learning-familiar")).map((node) => node.textContent.trim()),
      raw_provenance_types: Array.from(root.querySelectorAll(".learning-compass-panel")).filter((node) => /\b(asserted|derived|unknown|curated)\b/.test(node.textContent)).length,
    };
  }, { name: scenario.name, zoom: scenario.zoom || 1 });
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height || 844 },
    locale: scenario.locale === "he" ? "he-IL" : scenario.locale === "en" ? "en-US" : "ru-RU",
    colorScheme: scenario.theme, reducedMotion: scenario.reduced ? "reduce" : "no-preference", serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [], telemetry = [];
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  page.on("request", (request) => { if (/rum|telemetry|analytics/i.test(request.url())) telemetry.push(request.url()); });
  if (scenario.worker === "pending") {
    await page.route("**/data/inflection/pealim-infl-v12.json.gz", async (route) => { await sleep(20000); await route.abort(); });
  } else if (scenario.worker === "failed") {
    await page.route("**/data/inflection/pealim-infl-v12.json.gz", (route) => route.abort());
  }
  await page.addInitScript(({ locale, theme, idle }) => {
    localStorage.setItem("app.locale", locale);
    localStorage.setItem("appTheme_v1", theme);
    if (idle === "delayed") window.requestIdleCallback = (callback) => setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 60000);
    else window.requestIdleCallback = (callback) => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 10 }), 0);
  }, { locale: scenario.locale, theme: scenario.theme, idle: scenario.idle });
  await page.goto(BASE + "/library.html?canon=skip#room=mytexts", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__localDB?.isReady?.(), null, { timeout: 60000 });
  await seed(page, scenario.profile);
  const started = Date.now();
  await page.reload({ waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(".mytexts-grid .mytext-card", { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll(".mytexts-grid .learning-familiar").length >= 5, null, { timeout: 30000 });
  if (scenario.worker === "pending") await page.waitForSelector(".learning-familiar.coverage-pending", { timeout: 10000 });
  if (scenario.worker === "failed") await page.waitForSelector(".learning-familiar.coverage-unavailable", { timeout: 15000 });
  const settleMs = Date.now() - started;
  const metrics = await directBatchMetrics(page);
  const result = await audit(page, scenario);
  result.settle_ms = settleMs;
  result.batch = {
    p50_ms: percentile(metrics.times, .5), p95_ms: percentile(metrics.times, .95),
    size_bytes: metrics.size_bytes, entry_count: metrics.entry_count, stale_count: metrics.stale_count,
    projection_ms: metrics.projection_ms, projection_tracked: metrics.projection_tracked,
  };
  result.errors = errors; result.telemetry = telemetry;

  check(result.cards <= 48, `${scenario.name}: visible card window <=48 (${result.cards})`);
  check(result.dom_nodes <= 2438, `${scenario.name}: DOM <=2438 (${result.dom_nodes})`);
  check(result.overflow_px === 0, `${scenario.name}: no horizontal overflow (${result.overflow_px}px)`);
  check(result.max_signals <= 2, `${scenario.name}: at most two scan signals (${result.max_signals})`);
  check(result.compass_details === result.cards, `${scenario.name}: every My Text exposes structured Compass details (${result.compass_details}/${result.cards})`);
  check(result.clipped_signals === 0, `${scenario.name}: no B7 signal clips or leaves the viewport (${result.clipped_signals})`);
  check(result.small_targets.length === 0, `${scenario.name}: 24px target floor (${JSON.stringify(result.small_targets)})`);
  check(result.fabricated_zero === 0 || scenario.profile, `${scenario.name}: empty profile never fabricates 0%`);
  if (scenario.locale !== 'en') check(result.raw_provenance_types === 0, `${scenario.name}: provenance types are localized, not raw enum labels`);
  check(result.batch.size_bytes <= 256 * 1024, `${scenario.name}: batch <=256KiB (${result.batch.size_bytes})`);
  check(result.batch.p95_ms <= 250, `${scenario.name}: cached batch p95 <=250ms (${result.batch.p95_ms.toFixed(2)})`);
  check(result.batch.projection_ms <= 250, `${scenario.name}: projection <=250ms (${result.batch.projection_ms.toFixed(2)})`);
  check(errors.length === 0, `${scenario.name}: no page errors (${errors.join(" | ")})`);
  check(telemetry.length === 0, `${scenario.name}: no RUM/telemetry requests`);
  if (scenario.profile) check(result.range_count > 0, `${scenario.name}: calibrated range is visible`);
  else check(result.status_classes.includes("coverage-needs_profile"), `${scenario.name}: empty profile is NEEDS_PROFILE`);
  if (scenario.name === "380-ru-light") {
    check(result.familiarity_copy.some((copy) => /^Не менее \d+% знакомы$/.test(copy)), `${scenario.name}: compact lower-bound familiarity copy is rendered`);
    check(result.familiarity_copy.some((copy) => /^\d+% знакомы$/.test(copy)), `${scenario.name}: compact exact familiarity copy is rendered`);
    check(result.familiarity_copy.every((copy) => !/зафиксировано знакомыми/.test(copy)), `${scenario.name}: old noisy familiarity wording is absent`);
  }

  if (scenario.name === "1366-ru-desktop") {
    const summaries = page.locator(".mytexts-grid .learning-compass-details > summary");
    const summary = summaries.first();
    await summary.evaluate((node) => node.scrollIntoView({ block: "start" }));
    await summary.focus(); await page.keyboard.press("Enter");
    const painted = await page.evaluate(() => {
      const panel = document.querySelector(".mytexts-grid .learning-compass-details[open] .learning-compass-panel");
      if (!panel) return false;
      const rect = panel.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + 8, rect.top + 8);
      return !!hit && panel.contains(hit);
    });
    check(painted, `${scenario.name}: open Compass detail panel is painted, not overflow-clipped`);
    const second = summaries.nth(1);
    await second.focus(); await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".mytexts-grid .learning-compass-details[open]").length === 1, null, { timeout: 2000 });
    check(await page.locator(".mytexts-grid .learning-compass-details[open]").count() === 1,
      `${scenario.name}: opening another disclosure closes the previous panel`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelectorAll(".mytexts-grid .learning-compass-details[open]").length === 0, null, { timeout: 2000 });
    const escaped = await page.evaluate(() => ({
      open: document.querySelectorAll(".mytexts-grid .learning-compass-details[open]").length,
      focused: document.activeElement?.matches?.(".learning-compass-details > summary") || false,
    }));
    check(escaped.open === 0 && escaped.focused, `${scenario.name}: Escape closes the panel and returns focus (${JSON.stringify(escaped)})`);
  }

  if (scenario.name === "380-ru-light") {
    for (const status of ["coverage-available", "coverage-available_limited", "coverage-unsupported"]) {
      check(result.status_classes.includes(status), `${scenario.name}: visual status ${status}`);
    }
    check(!result.status_classes.includes("coverage-not_prepared") && !result.status_classes.includes("coverage-stale"),
      `${scenario.name}: missing/stale visible cards self-heal without a Reader open`);
    const limitedDisclosure = await page.evaluate(() => {
      const row = document.querySelector(".mytexts-grid .coverage-available_limited")?.closest(".learning-compass");
      return String(row?.querySelector(".learning-compass-panel")?.textContent || "");
    });
    check(/Неоднозначность слишком велика для сортировки; показана только нижняя граница\./.test(limitedDisclosure),
      `${scenario.name}: limited familiarity explains why it is excluded from ranking (${limitedDisclosure})`);
    check(!/unresolved-above-rank-limit/.test(limitedDisclosure), `${scenario.name}: raw caveat code is not exposed`);
    const summary = page.locator(".mytexts-grid .learning-compass-details > summary").first();
    const canonicalBefore = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      return {
        review_log: await db.dbQuery("SELECT * FROM review_log ORDER BY id", []),
        word_status: await db.dbQuery("SELECT * FROM word_status ORDER BY lemma_key", []),
        progress: await db.dbQuery("SELECT * FROM text_progress ORDER BY text_id", []),
        bodies: await db.dbQuery("SELECT id,text_key,title,source_text,updated_at FROM texts WHERE id LIKE 'b7-text-%' ORDER BY id", []),
      };
    });
    await summary.focus(); await page.keyboard.press("Enter");
    const reset = page.locator(".mytexts-grid .learning-calibration-reset").first();
    await reset.focus(); await page.keyboard.press("Enter");
    const resetProof = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      return {
        ledger: JSON.parse(localStorage.getItem("room.learningCompass.calibration.v2") || "null"),
        after: {
          review_log: await db.dbQuery("SELECT * FROM review_log ORDER BY id", []),
          word_status: await db.dbQuery("SELECT * FROM word_status ORDER BY lemma_key", []),
          progress: await db.dbQuery("SELECT * FROM text_progress ORDER BY text_id", []),
          bodies: await db.dbQuery("SELECT id,text_key,title,source_text,updated_at FROM texts WHERE id LIKE 'b7-text-%' ORDER BY id", []),
        },
      };
    });
    check(resetProof.ledger?.samples?.length === 0, "keyboard reset deletes local calibration samples");
    check(JSON.stringify(resetProof.after) === JSON.stringify(canonicalBefore), "calibration reset changes no canonical learner/content store");
    await summary.focus(); await page.keyboard.press("Enter");
    const toggle = page.locator(".mytexts-grid .learning-calibration-toggle").first();
    await toggle.focus(); await page.keyboard.press("Enter");
    const disableProof = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      return {
        disabled: localStorage.getItem("room.learningCompass.calibrationDisabled.v2"),
        ledger: JSON.parse(localStorage.getItem("room.learningCompass.calibration.v2") || "null"),
        canonical: {
          review_log: await db.dbQuery("SELECT * FROM review_log ORDER BY id", []),
          word_status: await db.dbQuery("SELECT * FROM word_status ORDER BY lemma_key", []),
          progress: await db.dbQuery("SELECT * FROM text_progress ORDER BY text_id", []),
          bodies: await db.dbQuery("SELECT id,text_key,title,source_text,updated_at FROM texts WHERE id LIKE 'b7-text-%' ORDER BY id", []),
        },
      };
    });
    check(disableProof.disabled === "1" && disableProof.ledger?.samples?.length === 0, "keyboard disable persists local opt-out with an empty ledger");
    check(JSON.stringify(disableProof.canonical) === JSON.stringify(canonicalBefore), "calibration disable changes no canonical learner/content store");
    await page.waitForTimeout(2400);
  }
  if (scenario.worker === "pending") check(result.status_classes.includes("coverage-pending"), `${scenario.name}: PENDING is visible`);
  if (scenario.worker === "failed") check(result.status_classes.includes("coverage-unavailable"), `${scenario.name}: worker failure is UNAVAILABLE`);

  await page.screenshot({ path: path.join(OUT, `${scenario.name}.png`), fullPage: true });
  await context.close();
  return result;
}

async function runBenRailDisclosureScenario(browser) {
  const context = await browser.newContext({
    viewport: { width: 380, height: 844 }, locale: "ru-RU", colorScheme: "light", serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [], telemetry = [];
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  page.on("request", (request) => { if (/rum|telemetry|analytics/i.test(request.url())) telemetry.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem("app.locale", "ru"); localStorage.setItem("appTheme_v1", "light");
  });
  await page.goto(BASE + "/library.html?canon=skip#room=benyehuda", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__localDB?.isReady?.(), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const db = await import("/db/local-db.js");
    await db.applyWordStatusFromSync("pid:b7-ben-rail-profile", "known");
  });
  await page.reload({ waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[data-learning-index-status="benyehuda"]')?.getAttribute("data-state") === "ready", null, { timeout: 60000 });
  const benPrepared = await page.evaluate(async () => {
    const corpus = await (await fetch("/data/benyehuda/corpus-index-v7.json")).json();
    return {
      expected: Array.isArray(corpus.ready) ? corpus.ready.length : 0,
      copy: document.querySelector('[data-learning-index-status="benyehuda"] [data-learning-index-copy]')?.textContent || "",
      familiarSort: !!document.querySelector('#roomCorpusSort option[value="familiar_desc"]'),
    };
  });
  check(benPrepared.expected > 0 && benPrepared.copy.includes(String(benPrepared.expected)), `ben-rail: every readable public work is prepared (${benPrepared.copy})`);
  check(benPrepared.familiarSort, "ben-rail: public corpus exposes the shared familiarity sort");
  const firstCard = page.locator(".work-card[data-work-id]").first();
  await firstCard.waitFor({ state: "visible", timeout: 60000 });
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.locator(".learning-compass-details > summary").waitFor({ state: "visible", timeout: 30000 });
  const summary = firstCard.locator(".learning-compass-details > summary");
  await summary.focus(); await page.keyboard.press("Enter");
  const disclosure = await page.evaluate(() => {
    const details = document.querySelector(".work-card[data-work-id] .learning-compass-details[open]");
    const panel = details?.querySelector(".learning-compass-panel");
    if (!panel) return { open: false };
    const rect = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.max(0, rect.left + 8), Math.max(0, rect.top + 8));
    return {
      open: true, panelText: panel.textContent || "", openCount: document.querySelectorAll(".learning-compass-details[open]").length,
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      painted: !!hit && panel.contains(hit), overflow: document.documentElement.scrollWidth > innerWidth,
      readerOpen: document.body.classList.contains("room-reading"),
    };
  });
  check(disclosure.open && disclosure.openCount === 1, `ben-rail: compact card exposes one structured disclosure (${JSON.stringify(disclosure)})`);
  check(disclosure.inViewport && disclosure.painted && !disclosure.overflow,
    `ben-rail: disclosure is visible, unclipped, and causes no page overflow (${JSON.stringify(disclosure)})`);
  check(/Знакомые слова:/.test(disclosure.panelText || ""), `ben-rail: exact familiarity provenance is disclosed (${disclosure.panelText || ""})`);
  check(!disclosure.readerOpen, "ben-rail: inspecting Compass never opens Reader");
  await page.screenshot({ path: path.join(OUT, "380-ru-ben-rail-details.png"), fullPage: true });
  await page.keyboard.press("Escape");
  const escaped = await page.evaluate(() => ({
    open: document.querySelectorAll(".learning-compass-details[open]").length,
    focused: document.activeElement?.matches?.(".learning-compass-details > summary") || false,
  }));
  check(escaped.open === 0 && escaped.focused, `ben-rail: Escape closes disclosure and returns focus (${JSON.stringify(escaped)})`);
  check(errors.length === 0, `ben-rail: no page errors (${errors.join(" | ")})`);
  check(telemetry.length === 0, "ben-rail: no RUM/telemetry requests");
  await context.close();
  return { name: "380-ru-ben-rail", prepared: benPrepared, disclosure, errors, telemetry };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const uiSource = fs.readFileSync(path.join(ROOT, "public/js/library-ui.js"), "utf8");
  const htmlSource = fs.readFileSync(path.join(ROOT, "public/library.html"), "utf8");
  const ruSource = fs.readFileSync(path.join(ROOT, "public/i18n/locales/ru.js"), "utf8");
  const enSource = fs.readFileSync(path.join(ROOT, "public/i18n/locales/en.js"), "utf8");
  const heSource = fs.readFileSync(path.join(ROOT, "public/i18n/locales/he.js"), "utf8");
  check(!/COMFORT_95_98|STRETCH_90_95|FRUSTRATION_BELOW_90|TRIVIAL_ABOVE_98/.test(uiSource + htmlSource), "active Room surface has no universal readiness bands");
  check(!/≈\s*['"+]|pick\.cov\)\s*\*\s*100/.test(uiSource), "active Room surface has no soft familiarity estimate");
  check(/async function pumpCompassBuilds\([\s\S]*localDb\.getSentences/.test(uiSource), "full-body reads are isolated to the bounded background builder");
  check(/COMPASS_FULL_CATALOG_MAX = 5000/.test(uiSource) && !/COMPASS_IDLE_SESSION_MAX/.test(uiSource), "cold-library sweep prepares the full verified 5k personal-library scale");
  check(!/filter\(\(item\) => item && item\.local_id\)\.slice\(0, 8\)/.test(uiSource), "cold-library preparation is no longer silently capped at eight cards");
  check(/recordedFamiliarLowerBound:\s*"Не менее \{value\}% знакомы"/.test(ruSource), "RU lower-bound familiarity copy stays compact");
  check(/recordedFamiliarLowerBound:\s*"At least \{value\}% familiar"/.test(enSource), "EN lower-bound familiarity copy stays compact");
  check(/recordedFamiliarLowerBound:\s*"לפחות \{value\}% מוכרות"/.test(heSource), "HE lower-bound familiarity copy stays compact");
  check(!/recordedFamiliarLowerBound[^\n]+(?:зафиксировано знакомыми|recorded as familiar|תועדו כמוכרות)/.test(ruSource + enSource + heSource), "visible lower-bound copy does not repeat provenance wording");
  check(/sortFamiliar:\s*"Сначала достоверно знакомые"/.test(ruSource), "RU sort label states reliable-rank semantics");
  check(/limitedFamiliarityDetail:\s*"Неоднозначность слишком велика для сортировки/.test(ruSource), "RU limited status explains no-ranking semantics");

  const server = startServer();
  if (!await waitForServer()) { await stopServer(server.child); throw new Error("server did not become ready\n" + server.logs.join("")); }
  const browser = await chromium.launch({ headless: true });
  const scenarios = [
    { name: "1366-ru-desktop", width: 1366, height: 900, locale: "ru", theme: "light", reduced: false, profile: true, idle: "delayed" },
    { name: "320-en-needs-profile", width: 320, height: 780, locale: "en", theme: "light", reduced: false, profile: false, idle: "delayed" },
    { name: "360-he-rtl-dark", width: 360, height: 800, locale: "he", theme: "dark", reduced: false, profile: true, idle: "delayed" },
    { name: "380-ru-light", width: 380, height: 844, locale: "ru", theme: "light", reduced: false, profile: true, idle: "delayed" },
    { name: "430-ru-pending-reduced", width: 430, height: 900, locale: "ru", theme: "dark", reduced: true, profile: true, idle: "immediate", worker: "pending" },
    { name: "510-he-worker-failure", width: 510, height: 900, locale: "he", theme: "light", reduced: false, profile: true, idle: "immediate", worker: "failed" },
    { name: "1280-en-200pct", width: 1280, height: 900, locale: "en", theme: "dark", reduced: false, profile: true, idle: "delayed", zoom: 2 },
  ];
  const matrix = [];
  try {
    matrix.push(await runColdLibraryScenario(browser));
    for (const scenario of scenarios) matrix.push(await runScenario(browser, scenario));
    matrix.push(await runBenRailDisclosureScenario(browser));
  }
  finally { await browser.close(); await stopServer(server.child); }
  fs.writeFileSync(path.join(OUT, "ROOM_B7_AUTOMATION_EVIDENCE.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    evidence_class: "desktop Chromium automation, not physical or AT",
    checks: { passed: checks - failures.length, total: checks },
    matrix,
  }, null, 2) + "\n");
  if (failures.length) {
    console.error(`[room-b7-learning-compass-smoke] FAIL ${checks - failures.length}/${checks}`);
    for (const failure of failures) console.error(" - " + failure);
    process.exit(1);
  }
  console.log(`[room-b7-learning-compass-smoke] PASS ${checks}/${checks}`);
  console.log(`evidence -> ${path.relative(ROOT, OUT)}`);
})().catch((error) => { console.error("[room-b7-learning-compass-smoke]", error && error.stack || error); process.exit(1); });
