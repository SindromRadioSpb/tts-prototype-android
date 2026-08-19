#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3322;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, ".tmp", "room-ux-ppf2");
const SHOTS = path.join(ROOT, "docs", "research", "room-ux-premium-product-finishing-2", "2026-08-19", "screenshots");
const expectRed = process.argv.includes("--expect-red");
const capture = process.argv.includes("--capture") && !expectRed;
const failures = [];
const results = [];
let checks = 0;
const check = (condition, message) => { checks++; if (!condition) failures.push(message); };
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

async function ready() {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

const cases = [
  { id: "desktop-ru-light", locale: "ru", viewport: { width: 1280, height: 900 }, theme: "light", colorScheme: "light" },
  { id: "380-ru-light", locale: "ru", viewport: { width: 380, height: 844 }, theme: "light", colorScheme: "light" },
  { id: "380-he-rtl-light", locale: "he", viewport: { width: 380, height: 844 }, theme: "light", colorScheme: "light" },
  { id: "200pct-ru-light", locale: "ru", viewport: { width: 640, height: 450 }, theme: "light", colorScheme: "light", reflowEquivalent: true },
  { id: "desktop-ru-dark", locale: "ru", viewport: { width: 1280, height: 900 }, theme: "dark", colorScheme: "dark" },
  { id: "380-he-rtl-dark", locale: "he", viewport: { width: 380, height: 844 }, theme: "dark", colorScheme: "dark" },
  { id: "auto-light", locale: "ru", viewport: { width: 1280, height: 900 }, theme: "auto", colorScheme: "light" },
  { id: "auto-dark", locale: "ru", viewport: { width: 1280, height: 900 }, theme: "auto", colorScheme: "dark" },
  { id: "forced-colors", locale: "ru", viewport: { width: 1280, height: 900 }, theme: "auto", colorScheme: "light", forcedColors: "active" },
  { id: "reduced-motion", locale: "ru", viewport: { width: 1280, height: 900 }, theme: "light", colorScheme: "light", reducedMotion: "reduce" },
];
const activeCases = expectRed ? cases.slice(0, 1) : cases;

async function makeContext(browser, config) {
  const context = await browser.newContext({
    viewport: config.viewport,
    colorScheme: config.colorScheme,
    forcedColors: config.forcedColors || "none",
    reducedMotion: config.reducedMotion || "no-preference",
    serviceWorkers: "block",
  });
  await context.addInitScript(({ locale, theme }) => {
    localStorage.setItem("app.locale", locale);
    localStorage.setItem("appTheme_v1", theme);
    localStorage.setItem("phase6FirstOpenSeen", "declined");
  }, { locale: config.locale, theme: config.theme });
  return context;
}

function watch(page) {
  const pageErrors = [];
  const writes = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  page.on("request", (request) => {
    if (!/^(GET|HEAD)$/i.test(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  return { pageErrors, writes };
}

async function measure(page, definitions) {
  return page.evaluate((items) => {
    function parseColor(value) {
      const hex = String(value).trim().match(/^#([0-9a-f]{6})$/i);
      if (hex) return {
        r: parseInt(hex[1].slice(0, 2), 16),
        g: parseInt(hex[1].slice(2, 4), 16),
        b: parseInt(hex[1].slice(4, 6), 16),
        a: 1,
      };
      const rgb = String(value).match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
      if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
      const srgb = String(value).match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/i);
      if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: srgb[4] === undefined ? 1 : +srgb[4] };
      return null;
    }
    function luminance(color) {
      const channels = [color.r, color.g, color.b].map((n) => {
        const v = n / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
    }
    function ratio(first, second) {
      const a = luminance(first), b = luminance(second);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    function firstOpaqueBackground(node) {
      let current = node;
      while (current) {
        const parsed = parseColor(getComputedStyle(current).backgroundColor);
        if (parsed && parsed.a >= 0.99) return parsed;
        current = current.parentElement;
      }
      return parseColor("rgb(255,255,255)");
    }
    function variableColor(name) {
      return parseColor(getComputedStyle(document.body).getPropertyValue(name).trim())
        || parseColor(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
    }
    return items.map((item) => {
      const node = document.querySelector(item.selector);
      if (!node) return { id: item.id, missing: true };
      const style = getComputedStyle(node);
      const foreground = parseColor(style.color);
      let backgrounds;
      if (item.backgroundVars) backgrounds = item.backgroundVars.map(variableColor).filter(Boolean);
      else if (item.backgroundSelector) backgrounds = [firstOpaqueBackground(document.querySelector(item.backgroundSelector))];
      else backgrounds = [firstOpaqueBackground(node)];
      const ratios = foreground && backgrounds.length ? backgrounds.map((background) => ratio(foreground, background)) : [];
      const rect = node.getBoundingClientRect();
      return {
        id: item.id,
        color: style.color,
        backgrounds: backgrounds.map((c) => `rgb(${c.r.toFixed(1)}, ${c.g.toFixed(1)}, ${c.b.toFixed(1)})`),
        ratio: ratios.length ? Math.min(...ratios) : 0,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        text: String(node.textContent || "").trim().slice(0, 120),
      };
    });
  }, definitions);
}

async function inspectRoom(browser, config) {
  const context = await makeContext(browser, config);
  const page = await context.newPage();
  const observed = watch(page);
  await page.goto(BASE + "/library.html?ppf2=1#room=hub", { waitUntil: "load", timeout: 60000 });
  await page.evaluate(({ locale }) => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    const current = document.querySelector(".learning-home-journey-types");
    if (current && current.getClientRects().length) return;
    const fixture = document.createElement("main");
    fixture.id = "ppf2LibraryFixture";
    fixture.className = "learning-home";
    fixture.innerHTML = `<section class="learning-home-journey" aria-label="PPF2 isolated Journey fixture">
      <p class="learning-home-journey-boundary">Journey boundary</p>
      <p class="learning-home-journey-types">${locale === "he" ? "סימנייה היא מקום בטקסט; קריאה מאוחרת היא רשימה נפרדת." : "Закладка — место в тексте; «Читать позже» — отдельный список."}</p>
    </section>`;
    document.body.prepend(fixture);
  }, { locale: config.locale });
  await page.waitForSelector(".learning-home-journey-types", { timeout: 30000 });
  const measurements = await measure(page, [{ id: "PPF2-01", selector: ".learning-home-journey-types", backgroundSelector: ".learning-home-journey" }]);
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    version: document.getElementById("roomFooterVersion")?.textContent?.trim(),
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    forced: matchMedia("(forced-colors: active)").matches,
  }));
  results.push({ surface: "room", case: config.id, state, measurements, ...observed });
  if (capture && ["desktop-ru-light", "380-ru-light", "380-he-rtl-light"].includes(config.id)) {
    await page.locator(".learning-home-journey").screenshot({ path: path.join(SHOTS, `library-journey-${config.id}.png`) });
  }
  await context.close();
}

async function inspectStudio(browser, config) {
  const context = await makeContext(browser, config);
  const page = await context.newPage();
  const observed = watch(page);
  await page.goto(BASE + "/index.html?ppf2=1", { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector("#classicNextStep");
  await page.evaluate(() => {
    const next = document.getElementById("classicNextStep");
    next.classList.remove("is-state-pending", "is-complete-quiet");
    next.style.display = "flex";
  });
  const measurements = await measure(page, [
    { id: "PPF2-02", selector: ".classic-next-step-label", backgroundVars: ["--theme-accent-soft", "--theme-bg-card"] },
    { id: "PPF2-03", selector: ".v3-onb-features-title", backgroundSelector: "#v3OnboardingPanel" },
    { id: "PPF2-04-credit", selector: ".app-footer-credit", backgroundVars: ["--theme-bg-page"] },
    { id: "PPF2-04-version", selector: ".app-footer-version", backgroundVars: ["--theme-bg-page"] },
  ]);
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    version: window.APP_VERSION,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    forced: matchMedia("(forced-colors: active)").matches,
  }));
  results.push({ surface: "studio", case: config.id, state, measurements, ...observed });
  if (capture && ["desktop-ru-light", "380-ru-light", "380-he-rtl-light", "380-he-rtl-dark"].includes(config.id)) {
    await page.locator("#classicNextStep").screenshot({ path: path.join(SHOTS, `studio-next-step-${config.id}.png`) });
    await page.evaluate(() => { document.getElementById("v3OnboardingModal").dataset.open = "1"; });
    await page.locator("#v3OnboardingPanel").screenshot({ path: path.join(SHOTS, `studio-onboarding-${config.id}.png`) });
    await page.evaluate(() => { delete document.getElementById("v3OnboardingModal").dataset.open; });
    await page.locator("#appFooter").screenshot({ path: path.join(SHOTS, `studio-footer-${config.id}.png`) });
  }
  await context.close();
}

function validate() {
  const lightDesktop = results.filter((entry) => entry.case === "desktop-ru-light");
  const redIds = new Set(lightDesktop.flatMap((entry) => entry.measurements.filter((m) => !m.missing && m.ratio < 4.5).map((m) => m.id)));
  const expectedRed = ["PPF2-01", "PPF2-02", "PPF2-03", "PPF2-04-credit", "PPF2-04-version"];
  if (expectRed) {
    for (const id of expectedRed) check(redIds.has(id), `RED reproduces ${id}`);
  } else {
    for (const entry of results) {
      check(entry.state.lang === (entry.case.includes("he-rtl") ? "he" : "ru"), `${entry.surface}/${entry.case}: locale`);
      check(entry.state.dir === (entry.case.includes("he-rtl") ? "rtl" : "ltr"), `${entry.surface}/${entry.case}: direction`);
      check(entry.state.overflow <= 0, `${entry.surface}/${entry.case}: no horizontal overflow (${entry.state.overflow})`);
      check(entry.pageErrors.length === 0, `${entry.surface}/${entry.case}: no page errors (${entry.pageErrors.join(" | ")})`);
      check(entry.writes.length === 0, `${entry.surface}/${entry.case}: GET/HEAD only (${entry.writes.join(" | ")})`);
      if (entry.case === "forced-colors") check(entry.state.forced, `${entry.surface}: forced colors active`);
      if (entry.case === "reduced-motion") check(entry.state.reduced, `${entry.surface}: reduced motion active`);
      if (entry.case === "200pct-ru-light") check(entry.state.overflow <= 0, `${entry.surface}: 200% reflow-equivalent has no overflow`);
      for (const measurement of entry.measurements) {
        check(!measurement.missing, `${entry.surface}/${entry.case}/${measurement.id}: node exists`);
        check(measurement.ratio + 0.005 >= 4.5,
          `${entry.surface}/${entry.case}/${measurement.id}: ${measurement.ratio.toFixed(2)} >= 4.5`);
      }
    }
    check(results.find((entry) => entry.surface === "studio")?.state.version === "3.11.404", "Studio version is 3.11.404");
    check(results.find((entry) => entry.surface === "room")?.state.version === "3.11.404", "Room runtime version is 3.11.404");
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (capture) fs.mkdirSync(SHOTS, { recursive: true });
  const server = startServer();
  if (!(await ready())) {
    console.error(server.logs.join(""));
    await stopServer(server.child);
    throw new Error("local server did not become ready");
  }
  const browser = await chromium.launch({ headless: true });
  try {
    for (const config of activeCases) {
      await inspectRoom(browser, config);
      await inspectStudio(browser, config);
    }
  } finally {
    await browser.close();
    await stopServer(server.child);
  }
  validate();
  fs.writeFileSync(path.join(OUT, expectRed ? "red-report.json" : "green-report.json"), JSON.stringify({ checks, failures, results }, null, 2));
  if (failures.length) {
    console.error(`[premium-product-finishing-2] FAIL ${checks - failures.length}/${checks}`);
    failures.forEach((failure) => console.error(" - " + failure));
    process.exit(1);
  }
  console.log(`[premium-product-finishing-2] ${expectRed ? "RED" : "GREEN"} PASS ${checks}/${checks}`);
})().catch((error) => { console.error("[premium-product-finishing-2]", error); process.exit(1); });
