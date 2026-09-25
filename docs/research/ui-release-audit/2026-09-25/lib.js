"use strict";
// Shared helpers for the UI release audit (2026-09-25). Fresh Chromium profile per run.
const { chromium } = require("playwright");
const path = require("node:path");
const OUT = path.join(__dirname, "shots");
const BASE = process.env.AUDIT_BASE || "https://linguistpro.kolosei.com";

async function open({ width = 380, height = 800, locale = "ru", dark = false } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600,
    colorScheme: dark ? "dark" : "light", locale: locale === "he" ? "he-IL" : locale === "en" ? "en-US" : "ru-RU",
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("PAGEERROR " + String(e).slice(0, 200)));
  return { browser, ctx, page, logs };
}

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file, fullPage: !!opts.full });
  return file;
}

// Visible interactive elements: label, rect, and whether below 44x44 (WCAG 2.5.5 / Apple HIG).
async function targets(page, rootSel) {
  return page.evaluate((sel) => {
    const root = (sel && document.querySelector(sel)) || document.body;
    const q = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=link],[onclick]";
    const out = [];
    for (const n of root.querySelectorAll(q)) {
      const s = getComputedStyle(n); const r = n.getBoundingClientRect();
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0 || r.width === 0 || r.height === 0) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const label = (n.getAttribute("aria-label") || n.textContent || n.value || n.title || n.id || n.tagName).trim().replace(/\s+/g, " ").slice(0, 48);
      out.push({ label, id: n.id || "", cls: String(n.className || "").slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), small: r.width < 44 || r.height < 44, fs: s.fontSize });
    }
    return out;
  }, rootSel || null);
}

// Text contrast sample of visible text nodes (simple: element color vs first opaque ancestor bg).
async function contrast(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] == null ? 1 : +m[3] }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (n) => { while (n && n.nodeType === 1) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.9) return c; n = n.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const bad = []; const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode; const el = t.parentElement; if (!el || seen.has(el)) continue; if (!t.textContent.trim()) continue;
      seen.add(el); const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      if (s.display === "none" || s.visibility === "hidden" || r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
      const fg = parse(s.color); if (!fg) continue; const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(s.fontSize); const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      if (ratio < (large ? 3 : 4.5)) bad.push({ text: t.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2), size, color: s.color, bg: `rgb(${bg.r},${bg.g},${bg.b})` });
    }
    return bad;
  });
}

async function fonts(page) {
  return page.evaluate(() => {
    const m = new Map();
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect(); if (!r.width || r.top > innerHeight || r.bottom < 0) continue;
      if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      const s = getComputedStyle(el); const k = `${s.fontSize}/${s.fontWeight}/${s.fontFamily.split(",")[0]}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });
}

module.exports = { open, shot, targets, contrast, fonts, BASE, OUT };
