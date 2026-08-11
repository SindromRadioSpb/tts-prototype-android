#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3306;
const BASE = `http://127.0.0.1:${PORT}`;
const args = new Set(process.argv.slice(2));
const expectRed = args.has("--expect-red");
const writeBaseline = args.has("--write-baseline");
const stageArg = process.argv.find((arg) => arg.startsWith("--stage="));
const stage = stageArg ? stageArg.slice("--stage=".length).toUpperCase() : (expectRed ? "B0" : "B5");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const OUT = outArg
  ? path.resolve(ROOT, outArg.slice("--out=".length))
  : writeBaseline
    ? path.join(ROOT, "docs", "research", "room-ux-maturity", "2026-08-11", "b0-baseline")
    : path.join(ROOT, ".tmp", "room-ux-maturity");
const failures = [];
let checks = 0;
const check = (condition, message) => { checks++; if (!condition) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const corpus = {
  corpus_id: "room-ux-fixture", slug: "study-songs", title: "Учебные песни", version: 1,
  status: "PILOT", visibility: "GROUP_RESTRICTED",
  rights_basis: "EDUCATIONAL_GROUP_RESTRICTED_REVIEW_REQUIRED", role: "OWNER",
};
const groupWorks = Array.from({ length: 81 }, (_, index) => {
  const n = index + 1;
  const rows = 24 + (n % 31);
  const audio = n % 3 === 0 ? 0 : n % 3 === 1 ? rows : Math.max(1, rows - 7);
  return {
    work_id: `song-${n}`, text_key: `song-key-${n}`, position_no: n,
    title: `שיר לימוד ${String(n).padStart(2, "0")}`, artist: n % 2 ? "זמר א" : "זמר ב",
    rows_count: rows, audio_count: audio, audio_revision: 1, level: n % 2 ? "א" : "ב",
    tags: [n % 2 ? "קצב" : "אוצר-מילים"], topic: "שירים",
  };
});

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
  if (!exited && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
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
    return route.fulfill({ status: 404, json: { ok: false, error: "FIXTURE_ROUTE_NOT_FOUND" } });
  });
}

async function seedMyTexts(page, count, withContinue) {
  await page.evaluate(async ({ n, continueReading }) => {
    const db = await import("/db/local-db.js");
    for (let index = 1; index <= n; index++) {
      const suffix = String(index).padStart(3, "0");
      await db.createText({
        id: `room-ux-mine-${suffix}`, text_key: `room-ux-mine-${suffix}`,
        title: `הטקסט שלי ${suffix}`, source_text: `משפט לימוד ${suffix}`,
        level: index % 2 ? "alef" : "bet", topic: index % 3 ? "Урок" : "Песня",
        tags_json: JSON.stringify([index % 2 ? "ульпан" : "дом"]),
      });
    }
    if (continueReading && n > 0) {
      await db.setProgress("room-ux-mine-001", { last_row_idx: 1, last_step_id: null });
      await db.touchOpened("room-ux-mine-001");
    }
  }, { n: count, continueReading: !!withContinue });
}

async function auditSurface(page, surface) {
  return page.evaluate((surfaceName) => {
    const interactiveSelector = "a[href],button,input,select,textarea,summary,[role='button'],[role='link'],[tabindex]:not([tabindex='-1'])";
    const root = document.querySelector(".corpus-nav") || document.getElementById("roomContent") || document.body;
    const isVisible = (node) => {
      const closed = node.closest && node.closest("details:not([open])");
      if (closed && node !== closed && node !== closed.querySelector(":scope > summary") && !node.closest("summary")) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const rgba = (raw) => {
      const value = String(raw || "").trim();
      const values = value.match(/[\d.]+/g);
      if (!values || values.length < 3) return null;
      const srgb = value.startsWith("color(srgb");
      return {
        r: Number(values[0]) * (srgb ? 255 : 1),
        g: Number(values[1]) * (srgb ? 255 : 1),
        b: Number(values[2]) * (srgb ? 255 : 1),
        a: values[3] == null ? 1 : Number(values[3]),
      };
    };
    const composite = (front, back) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });
    const backgroundFor = (node) => {
      const layers = [];
      let current = node;
      while (current) {
        const color = rgba(getComputedStyle(current).backgroundColor);
        if (color && color.a > 0.001) layers.unshift(color);
        current = current.parentElement;
      }
      let result = { r: 255, g: 255, b: 255, a: 1 };
      for (const layer of layers) result = composite(layer, result);
      return result;
    };
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const x = value / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (front, back) => {
      const a = luminance(front), b = luminance(back);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };

    const interactive = Array.from(root.querySelectorAll(interactiveSelector));
    const nested = interactive.filter((node) => node.querySelector(interactiveSelector));
    const visibleTargets = interactive.filter(isVisible);
    const smallTargets = visibleTargets.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width < 24 || rect.height < 24;
    });
    const formControls = Array.from(root.querySelectorAll("input:not([type='hidden']),select,textarea")).filter(isVisible);
    const unlabeled = formControls.filter((node) => {
      const explicit = node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
      const wrapping = node.closest("label");
      return !explicit && !wrapping;
    });
    const textNodes = Array.from(root.querySelectorAll("p,span,small,label,h1,h2,h3,h4,a,button,summary,option"))
      .filter((node) => isVisible(node) && String(node.textContent || "").trim() && node.children.length === 0);
    const contrastFailures = [];
    for (const node of textNodes) {
      const style = getComputedStyle(node);
      const front = rgba(style.color); if (!front) continue;
      const back = backgroundFor(node);
      const ratio = contrast(front.a < 1 ? composite(front, back) : front, back);
      const size = parseFloat(style.fontSize) || 16;
      const weight = parseInt(style.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      if (ratio + 0.01 < (large ? 3 : 4.5)) contrastFailures.push({ selector: node.className || node.tagName, ratio: Number(ratio.toFixed(2)), text: String(node.textContent).trim().slice(0, 40) });
    }
    const itemSelector = surfaceName === "learning-home" ? ".learning-home-ready-list .room-text-row"
      : surfaceName === "benyehuda" ? ".corpus-ready .room-text-row"
      : surfaceName === "mytexts" ? ".mytexts-grid .mytext-card-v" : ".group-corpus-grid .group-work-card";
    const items = Array.from(document.querySelectorAll(itemSelector));
    const first = items[0];
    const itemCompasses = items.map((node) => node.querySelector('.learning-compass')).filter(Boolean);
    const readinessSignals = items.flatMap((node) => Array.from(node.querySelectorAll('.learning-signal')));
    const visibleReadinessSignals = readinessSignals.filter((node) => {
      if (!isVisible(node)) return false;
      const signal = node.getBoundingClientRect();
      const compass = node.closest('.learning-compass');
      if (!compass) return false;
      const viewport = compass.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(signal.right, viewport.right) - Math.max(signal.left, viewport.left));
      const visibleHeight = Math.max(0, Math.min(signal.bottom, viewport.bottom) - Math.max(signal.top, viewport.top));
      return visibleWidth >= Math.min(12, signal.width * .5) && visibleHeight >= Math.min(12, signal.height * .5);
    });
    const confidenceValues = itemCompasses.map((node) => node.getAttribute('data-confidence')).filter(Boolean);
    const rectTop = (selector) => { const node = document.querySelector(selector); return node ? Math.round(node.getBoundingClientRect().top) : null; };
    return {
      surface: surfaceName,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      viewport: { width: innerWidth, height: innerHeight },
      domElements: document.querySelectorAll("*").length,
      readyItems: document.querySelectorAll(".corpus-ready .room-text-row").length,
      listItems: items.length,
      itemHeights: items.slice(0, 12).map((node) => Math.round(node.getBoundingClientRect().height)),
      itemSamples: items.slice(0, 12).map((node) => ({
        height: Math.round(node.getBoundingClientRect().height),
        title: String((node.querySelector(".corpus-work-title,.work-card-title,.group-work-title") || {}).textContent || "").trim().slice(0, 80),
        titleHeight: Math.round((node.querySelector(".corpus-work-title,.work-card-title,.group-work-title") || node).getBoundingClientRect().height),
        authorHeight: Math.round((node.querySelector(".corpus-work-author-link,.group-work-artist") || node).getBoundingClientRect().height),
        learningHeight: Math.round((node.querySelector(".work-card-difficulty,.group-work-progress") || node).getBoundingClientRect().height),
        learningText: String((node.querySelector('.learning-compass') || {}).textContent || '').trim().slice(0, 120),
      })),
      learningCompasses: itemCompasses.length,
      maxReadinessSignals: itemCompasses.length ? Math.max(...itemCompasses.map((node) => node.querySelectorAll('.learning-signal').length)) : 0,
      visibleReadinessSignals: visibleReadinessSignals.length,
      assertedCompasses: confidenceValues.filter((value) => value === 'asserted').length,
      derivedCompasses: confidenceValues.filter((value) => value === 'derived-high' || value === 'derived-soft').length,
      familiaritySignals: items.reduce((n, node) => n + node.querySelectorAll('.learning-familiar').length, 0),
      cosmeticZeroFamiliarity: items.filter((node) => /(?:≈\s*)?0%/.test((node.querySelector('.learning-familiar') || {}).textContent || '')).length,
      exactAudioCoverage: items.filter((node) => /\d+\s*\/\s*\d+/.test((node.querySelector('.learning-media') || {}).textContent || '')).length,
      ttsProvenanceDetails: items.filter((node) => /TTS/.test((node.querySelector('.learning-compass-panel') || {}).textContent || '')).length,
      readingStateLabels: items.filter((node) => node.querySelector('.learner-state-chip.is-reading')).length,
      firstUsefulTop: first ? Math.round(first.getBoundingClientRect().top) : null,
      firstLearningTop: Math.min(...[first ? Math.round(first.getBoundingClientRect().top) : null, rectTop(".corpus-next-action")].filter((value) => value != null)),
      nestedInteractive: nested.length,
      nestedExamples: nested.slice(0, 5).map((node) => node.className || node.tagName),
      visibleTargets: visibleTargets.length,
      smallTargets: smallTargets.length,
      smallTargetExamples: smallTargets.slice(0, 5).map((node) => {
        const rect = node.getBoundingClientRect();
        return { selector: node.className || node.tagName, width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
      unlabeledControls: unlabeled.length,
      contrastFailures: contrastFailures.length,
      contrastExamples: contrastFailures.slice(0, 8),
      overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      metaDescription: !!document.querySelector("meta[name='description']"),
      groupInSwitcher: !!Array.from(document.querySelectorAll(".corpus-switch-item")).find((node) => /Учебные песни|לימוד/.test(node.textContent || "")),
      shellHeaders: document.querySelectorAll(".corpus-shell-head").length,
      nextActions: document.querySelectorAll(".corpus-next-action").length,
      browseTools: document.querySelectorAll(".corpus-browse-tools").length,
      filterDisclosures: document.querySelectorAll(".corpus-filter-disclosure").length,
      filterOpen: !!document.querySelector(".corpus-filter-disclosure[open]"),
      filterPanelVisible: !!Array.from(document.querySelectorAll(".corpus-filter-panel")).find(isVisible),
      filterSummaryVisible: !!Array.from(document.querySelectorAll(".corpus-filter-summary")).find(isVisible),
      managementDisclosures: document.querySelectorAll(".corpus-management").length,
      visibleManagementActions: Array.from(document.querySelectorAll(".group-admin-action,.corpus-management-actions a")).filter(isVisible).length,
      myTextSecondary: document.querySelectorAll(".mytexts-grid .mytext-secondary").length,
      directNakdan: document.querySelectorAll(".mytexts-grid .mytext-card-v > .mytext-nakdan").length,
      corpusTops: {
        shell: rectTop(".corpus-shell-head"),
        next: rectTop(".corpus-next-action"),
        browse: rectTop(".corpus-browse-tools"),
        management: rectTop(".corpus-management"),
      },
      featureCount: document.querySelectorAll(".learning-home-feature").length,
      featureKind: document.querySelector(".learning-home-feature")?.getAttribute("data-feature-kind") || null,
      todayActions: document.querySelectorAll(".learning-home-actions .learning-home-action:not([hidden])").length,
      homeReadyItems: document.querySelectorAll(".learning-home-ready-list .room-text-row").length,
      corpusEntries: document.querySelectorAll(".learning-corpus-list .learning-corpus-entry").length,
      legacyHubCards: document.querySelectorAll(".hub-card").length,
      teaserInsideCorpusList: !!document.querySelector(".learning-corpus-list .learning-home-teaser"),
      homeTops: {
        feature: rectTop(".learning-home-feature"),
        today: rectTop(".learning-home-today"),
        ready: rectTop(".learning-home-ready"),
        corpora: rectTop(".learning-home-corpora"),
      },
    };
  }, surface);
}

async function selectCorpus(page, id) {
  const corpusEntry = `.learning-corpus-entry[data-corpus="${id}"]`;
  if (!await page.locator(corpusEntry).count()) {
    const back = page.locator(".corpus-back").first();
    if (await back.count()) await back.click();
    await page.waitForSelector(".learning-home");
  }
  await page.locator(corpusEntry).click();
  if (id === "benyehuda") await page.waitForSelector(".corpus-ready .room-text-row", { timeout: 30000 });
  else if (id === "mytexts") await page.waitForSelector(".mytexts-grid .mytext-card-v", { timeout: 30000 });
  else await page.waitForSelector(".group-corpus-grid .group-work-card", { timeout: 30000 });
  if (id === "benyehuda") {
    // B4 readiness is intentionally IntersectionObserver-lazy. Exercise one real
    // visible row, then restore the corpus top before geometry is audited.
    await page.locator(".corpus-ready .room-text-row").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !!document.querySelector(".corpus-ready .room-text-row .learning-compass[data-confidence]"), null, { timeout: 30000 });
    await page.evaluate(() => scrollTo(0, 0));
  }
  await page.waitForTimeout(250);
}

async function captureMatrix(browser, locale, viewport, theme, label, myTextCount) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  await installRoutes(page);
  await page.addInitScript(({ localeName, themeName }) => {
    localStorage.setItem("app.locale", localeName);
    localStorage.setItem("appTheme_v1", themeName);
  }, { localeName: locale, themeName: theme });
  await page.goto(BASE + "/library.html?canon=skip&roomUxMaturity=1", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => { const tab = document.getElementById("tabCorpus"); return tab && !tab.hidden; }, null, { timeout: 30000 });
  await seedMyTexts(page, myTextCount, locale === "ru");
  await page.click("#tabCorpus");
  await page.waitForSelector(".learning-home");
  await page.screenshot({ path: path.join(OUT, `${label}-hub.png`), fullPage: false });

  const results = [await auditSurface(page, "learning-home")];
  for (const [id, name] of [["benyehuda", "benyehuda"], ["mytexts", "mytexts"], [`group:${corpus.corpus_id}`, "study-songs"]]) {
    await selectCorpus(page, id);
    results.push(await auditSurface(page, name));
    await page.screenshot({ path: path.join(OUT, `${label}-${name}.png`), fullPage: false });
    if (viewport.width <= 760) {
      await page.locator(".corpus-filter-disclosure > summary").click();
      const opened = await page.locator(".corpus-filter-disclosure").evaluate((node) => node.open);
      check(opened, `${label}/${name}: mobile filter drawer opens explicitly`);
      if (name === "benyehuda") await page.locator(".corpus-filterbar .corpus-facet-chip").first().click();
      else if (name === "mytexts") await page.locator(".mytexts-facets .corpus-sort-btn").first().click();
      else await page.locator("#roomGroupStatus").selectOption("reading");
      await page.waitForTimeout(120);
      const activeState = await page.evaluate(() => ({
        summary: (document.querySelector(".corpus-filter-summary") || {}).textContent || "",
        chips: document.querySelectorAll(".corpus-active-filters .corpus-active-chip").length,
      }));
      check(/\d/.test(activeState.summary) && activeState.chips >= 1,
        `${label}/${name}: active filter count and summary stay visible (${JSON.stringify(activeState)})`);
      await page.screenshot({ path: path.join(OUT, `${label}-${name}-filters.png`), fullPage: false });
      if (name === "benyehuda") await page.locator(".corpus-filterbar .corpus-facet-chip").first().click();
      else if (name === "mytexts") await page.locator(".mytexts-facets .corpus-sort-btn").first().click();
      else await page.locator("#roomGroupStatus").selectOption("all");
      await page.locator(".corpus-filter-disclosure > summary").click();
    }
    const rowSelector = name === "benyehuda" ? ".corpus-ready .room-text-row"
      : name === "mytexts" ? ".mytexts-grid .mytext-card-v" : ".group-corpus-grid .group-work-card";
    await page.locator(rowSelector).first().evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
    await page.waitForTimeout(180);
    const rowCapture = await page.locator(rowSelector).first().evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { top: rect.top, bottom: rect.bottom, width: rect.width, opacity: style.opacity, visibility: style.visibility };
    });
    check(rowCapture.bottom > 0 && rowCapture.top < viewport.height && rowCapture.width > 40 && rowCapture.opacity !== "0" && rowCapture.visibility !== "hidden",
      `${label}/${name}: row evidence capture contains a visible item (${JSON.stringify(rowCapture)})`);
    await page.screenshot({ path: path.join(OUT, `${label}-${name}-rows.png`), fullPage: false });
    await page.evaluate(() => scrollTo(0, 0));
  }
  check(pageErrors.length === 0, `${label}: no page errors (${pageErrors.join(" | ")})`);
  await context.close();
  return results;
}

function evaluateRed(matrix) {
  const mobile = matrix.filter((entry) => entry.viewport.width === 380 && entry.lang === "ru");
  const by = mobile.find((entry) => entry.surface === "benyehuda");
  const my = mobile.find((entry) => entry.surface === "mytexts");
  const group = mobile.find((entry) => entry.surface === "study-songs");
  check(by && by.readyItems > 12, `B0 RED: Ben-Yehuda ready rail is unbounded (${by && by.readyItems})`);
  check(by && by.domElements > 2438, `B0 RED: initial Ben-Yehuda DOM exceeds 2,438 (${by && by.domElements})`);
  check(by && by.nestedInteractive > 0, `B0 RED: nested corpus-card controls are detected (${by && by.nestedInteractive})`);
  check(my && my.listItems > 60, `B0 RED: My Texts browse is unbounded (${my && my.listItems})`);
  check(group && group.listItems > 60, `B0 RED: Study Songs browse is unbounded (${group && group.listItems})`);
  check(matrix.every((entry) => !entry.metaDescription), "B0 RED: Room meta description is absent");
  check(matrix.some((entry) => entry.smallTargets > 0), "B0 RED: undersized in-scope targets are detected");
  check(matrix.some((entry) => entry.unlabeledControls > 0), "B0 RED: persistent form-label gaps are detected");
  check(matrix.some((entry) => entry.contrastFailures > 0), "B0 RED: in-scope contrast failures are detected");
}

function evaluateGreen(matrix) {
  const all = (surface) => matrix.filter((entry) => entry.surface === surface);
  if (["B1", "B2", "B3", "B4", "B5"].includes(stage)) {
    for (const entry of all("benyehuda")) {
      check(entry.readyItems <= 12, `${stage}/${entry.lang}/${entry.viewport.width}: ready preview <=12 (${entry.readyItems})`);
      check(entry.domElements <= 2438, `${stage}/${entry.lang}/${entry.viewport.width}: DOM <=2,438 (${entry.domElements})`);
    }
    for (const entry of matrix) {
      check(entry.listItems <= 60, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: browse <=60 (${entry.listItems})`);
      check(entry.nestedInteractive === 0, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: zero nested interactive (${entry.nestedInteractive})`);
      check(entry.smallTargets === 0, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: 24px target floor (${entry.smallTargets})`);
      check(entry.unlabeledControls === 0, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: persistent labels (${entry.unlabeledControls})`);
      check(entry.contrastFailures === 0, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: contrast AA (${entry.contrastFailures})`);
      check(entry.overflowPx === 0, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: no overflow (${entry.overflowPx}px)`);
      check(entry.metaDescription, `${stage}/${entry.surface}: meta description present`);
      const minRow = entry.itemHeights.length ? Math.min(...entry.itemHeights) : null;
      const maxRow = entry.itemHeights.length ? Math.max(...entry.itemHeights) : null;
      const maxAllowed = entry.viewport.width <= 760 ? 104 : 88;
      check(minRow != null && minRow >= 72, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: row >=72px (${minRow})`);
      check(maxRow != null && maxRow <= maxAllowed, `${stage}/${entry.surface}/${entry.lang}/${entry.viewport.width}: compact row <=${maxAllowed}px (${maxRow})`);
    }
  }
  if (["B2", "B3", "B4", "B5"].includes(stage)) {
    const homes = all("learning-home");
    for (const entry of homes) {
      check(entry.featureCount === 1, `${stage}/${entry.lang}/${entry.viewport.width}: exactly one featured action (${entry.featureCount})`);
      check(entry.todayActions >= 1 && entry.todayActions <= 3, `${stage}/${entry.lang}/${entry.viewport.width}: Today has 1..3 honest actions (${entry.todayActions})`);
      check(entry.homeReadyItems >= 2 && entry.homeReadyItems <= 4, `${stage}/${entry.lang}/${entry.viewport.width}: ready shelf has 2..4 rows (${entry.homeReadyItems})`);
      check(entry.corpusEntries === 3, `${stage}/${entry.lang}/${entry.viewport.width}: two built-in plus authorized group corpus (${entry.corpusEntries})`);
      check(entry.legacyHubCards === 0, `${stage}/${entry.lang}/${entry.viewport.width}: old hub-card wall removed (${entry.legacyHubCards})`);
      check(!entry.teaserInsideCorpusList, `${stage}/${entry.lang}/${entry.viewport.width}: teaser is outside real corpus list`);
      check(entry.homeTops.feature != null && entry.homeTops.today != null && entry.homeTops.ready != null && entry.homeTops.corpora != null,
        `${stage}/${entry.lang}/${entry.viewport.width}: all Learning Home zones render`);
      check(entry.homeTops.ready > entry.homeTops.feature && entry.homeTops.ready > entry.homeTops.today,
        `${stage}/${entry.lang}/${entry.viewport.width}: feature/Today precede ready shelf`);
      check(entry.homeTops.corpora > entry.homeTops.ready,
        `${stage}/${entry.lang}/${entry.viewport.width}: corpus inventory follows ready shelf`);
    }
    for (const entry of homes.filter((item) => item.viewport.width <= 430)) {
      check(entry.homeTops.feature != null && entry.homeTops.feature <= 844, `${stage}/${entry.lang}: featured action begins in first viewport (${entry.homeTops.feature})`);
      check(entry.homeTops.ready != null && entry.homeTops.ready <= 844, `${stage}/${entry.lang}: ready shelf begins in first viewport (${entry.homeTops.ready})`);
    }
    for (const entry of homes.filter((item) => item.lang === "ru")) check(entry.featureKind === "continue", `${stage}/ru/${entry.viewport.width}: real progress wins the feature (${entry.featureKind})`);
    for (const entry of homes.filter((item) => item.lang === "he")) check(["start", "recommended"].includes(entry.featureKind), `${stage}/he/${entry.viewport.width}: empty profile gets an honest start (${entry.featureKind})`);
  }
  if (["B3", "B4", "B5"].includes(stage)) {
    for (const entry of matrix.filter((item) => item.surface !== "learning-home")) {
      check(entry.groupInSwitcher, `${stage}/${entry.surface}/${entry.lang}: authorized group appears in switcher`);
      check(entry.shellHeaders === 1, `${stage}/${entry.surface}/${entry.lang}: one identity header (${entry.shellHeaders})`);
      check(entry.nextActions === 1, `${stage}/${entry.surface}/${entry.lang}: one next learning action (${entry.nextActions})`);
      check(entry.browseTools === 1 && entry.filterDisclosures === 1, `${stage}/${entry.surface}/${entry.lang}: one shared browse/filter shell`);
      check(entry.managementDisclosures === 1, `${stage}/${entry.surface}/${entry.lang}: one secondary management disclosure (${entry.managementDisclosures})`);
      check(entry.corpusTops.shell != null && entry.corpusTops.next > entry.corpusTops.shell && entry.corpusTops.browse > entry.corpusTops.next,
        `${stage}/${entry.surface}/${entry.lang}: identity → next action → browse order (${JSON.stringify(entry.corpusTops)})`);
      check(entry.corpusTops.management == null || entry.corpusTops.management > entry.firstUsefulTop,
        `${stage}/${entry.surface}/${entry.lang}: management follows learning content`);
      if (entry.surface === "mytexts") {
        check(entry.directNakdan === 0, `${stage}/${entry.lang}: Nakdan is not a direct row action (${entry.directNakdan})`);
        check(entry.myTextSecondary === entry.listItems, `${stage}/${entry.lang}: every own text keeps secondary actions (${entry.myTextSecondary}/${entry.listItems})`);
      }
      if (entry.viewport.width <= 760) {
        check(entry.firstLearningTop != null && entry.firstLearningTop <= 844, `${stage}/${entry.surface}/${entry.lang}: useful learning action in first viewport (${entry.firstLearningTop})`);
        check(entry.filterSummaryVisible && !entry.filterOpen && !entry.filterPanelVisible,
          `${stage}/${entry.surface}/${entry.lang}: mobile filters start compact`);
        check(entry.visibleManagementActions === 0, `${stage}/${entry.surface}/${entry.lang}: management does not precede study (${entry.visibleManagementActions})`);
      } else {
        check(entry.filterOpen && entry.filterPanelVisible, `${stage}/${entry.surface}/${entry.lang}: desktop filter bar is expanded`);
      }
    }
  }
  if (["B4", "B5"].includes(stage)) {
    for (const entry of matrix.filter((item) => item.surface !== "learning-home")) {
      check(entry.maxReadinessSignals <= 2,
        `${stage}/${entry.surface}/${entry.lang}: at most two readiness signals (${entry.maxReadinessSignals})`);
      check(entry.cosmeticZeroFamiliarity === 0,
        `${stage}/${entry.surface}/${entry.lang}: missing familiarity never becomes 0% (${entry.cosmeticZeroFamiliarity})`);
      if (entry.surface === "benyehuda") {
        check(entry.learningCompasses >= 1 && entry.derivedCompasses >= 1,
          `${stage}/${entry.lang}: Ben-Yehuda maps derived readiness (${entry.derivedCompasses}/${entry.learningCompasses})`);
        check(entry.visibleReadinessSignals >= 1,
          `${stage}/${entry.lang}: Ben-Yehuda readiness is visibly scannable (${entry.visibleReadinessSignals})`);
      } else if (entry.surface === "mytexts") {
        check(entry.learningCompasses === entry.listItems && entry.assertedCompasses === entry.listItems,
          `${stage}/${entry.lang}: every My Text row uses asserted adapter (${entry.assertedCompasses}/${entry.listItems})`);
        check(entry.visibleReadinessSignals >= 1,
          `${stage}/${entry.lang}: My Text readiness is visibly scannable (${entry.visibleReadinessSignals})`);
        check(entry.familiaritySignals === 0,
          `${stage}/${entry.lang}: My Texts shows no unsupported familiarity (${entry.familiaritySignals})`);
        if (entry.lang === "ru") check(entry.readingStateLabels >= 1,
          `${stage}/${entry.viewport.width}: My Texts preserves honest row-position Continue (${entry.readingStateLabels})`);
      } else if (entry.surface === "study-songs") {
        check(entry.learningCompasses === entry.listItems && entry.assertedCompasses === entry.listItems,
          `${stage}/${entry.lang}: every group row uses asserted adapter (${entry.assertedCompasses}/${entry.listItems})`);
        check(entry.visibleReadinessSignals >= 1,
          `${stage}/${entry.lang}: group readiness is visibly scannable (${entry.visibleReadinessSignals})`);
        check(entry.familiaritySignals === 0,
          `${stage}/${entry.lang}: group corpus shows no unsupported familiarity (${entry.familiaritySignals})`);
        check(entry.exactAudioCoverage === entry.listItems,
          `${stage}/${entry.lang}: group audio coverage remains exact N/N (${entry.exactAudioCoverage}/${entry.listItems})`);
        check(entry.ttsProvenanceDetails === entry.listItems,
          `${stage}/${entry.lang}: TTS revision stays in provenance detail (${entry.ttsProvenanceDetails}/${entry.listItems})`);
      }
    }
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer();
  if (!await waitForServer()) {
    await stopServer(server.child);
    throw new Error(`local server did not become ready\n${server.logs.join("")}`);
  }
  const browser = await chromium.launch({ headless: true });
  let matrix = [];
  try {
    matrix = matrix.concat(await captureMatrix(browser, "ru", { width: 380, height: 844 }, "light", "380-ru-light", 65));
    matrix = matrix.concat(await captureMatrix(browser, "he", { width: 380, height: 844 }, "dark", "380-he-dark", 8));
    matrix = matrix.concat(await captureMatrix(browser, "ru", { width: 1280, height: 900 }, "light", "1280-ru-light", 65));
    if (stage === "B5") {
      matrix = matrix.concat(await captureMatrix(browser, "ru", { width: 320, height: 780 }, "dark", "320-ru-dark", 24));
      matrix = matrix.concat(await captureMatrix(browser, "he", { width: 360, height: 800 }, "light", "360-he-light", 12));
      matrix = matrix.concat(await captureMatrix(browser, "ru", { width: 430, height: 900 }, "dark", "430-ru-dark", 24));
      matrix = matrix.concat(await captureMatrix(browser, "he", { width: 510, height: 900 }, "light", "510-he-light", 12));
      matrix = matrix.concat(await captureMatrix(browser, "he", { width: 1280, height: 900 }, "dark", "1280-he-dark", 12));
    }
  } finally {
    await browser.close();
    await stopServer(server.child);
  }
  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify({ capturedAt: new Date().toISOString(), mode: expectRed ? "expect-red" : "gate", stage, matrix }, null, 2) + "\n");
  if (expectRed) evaluateRed(matrix); else evaluateGreen(matrix);
  if (failures.length) {
    console.error(`[room-ux-maturity-browser-smoke] FAIL ${checks - failures.length}/${checks}`);
    for (const failure of failures) console.error(" - " + failure);
    process.exit(1);
  }
  console.log(`[room-ux-maturity-browser-smoke] PASS ${checks}/${checks} · ${expectRed ? "expected red baseline" : stage + " gate"}`);
  console.log(`evidence -> ${path.relative(ROOT, OUT)}`);
})().catch((error) => { console.error("[room-ux-maturity-browser-smoke]", error && error.stack || error); process.exit(1); });
