#!/usr/bin/env node
/* Design review harness: the production site with this working copy's public/ laid over it.
   Every GET for a file that exists under public/ is answered from disk; everything else (API, data)
   goes to production, read-only. Service workers are blocked so nothing stale is served.
   Usage: node scripts/art/gouache/shots.js <plan.js> — plan exports async (ctx) => {...}. */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PUB = path.join(ROOT, "public");
const ORIGIN = "https://linguistpro.kolosei.com";
const OUT = path.join(ROOT, ".tmp", "shots");
const ALIAS = { "/": "/index.html", "/study-studio.html": "/index.html", "/study-library.html": "/library.html" };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".mjs": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };

async function open(browser, o) {
  o = o || {};
  const context = await browser.newContext({
    viewport: o.viewport || { width: 1440, height: 900 },
    deviceScaleFactor: o.dpr || 1,
    isMobile: !!o.mobile, hasTouch: !!o.mobile,
    colorScheme: o.scheme || "light",
    serviceWorkers: process.env.LIVE === "1" ? "allow" : "block",
    locale: "ru-RU",
  });
  /* LIVE=1: no overlay at all, production exactly as served */
  if (process.env.LIVE !== "1") await context.route(ORIGIN + "/**", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.continue();
    const u = new URL(req.url());
    const p = ALIAS[u.pathname] || u.pathname;
    const file = path.join(PUB, decodeURIComponent(p));
    if (file.startsWith(PUB) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const headers = { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store", "cross-origin-resource-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" };
      if (path.extname(file) === ".html") { headers["cross-origin-opener-policy"] = "same-origin"; headers["cross-origin-embedder-policy"] = "require-corp"; }
      return route.fulfill({ status: 200, headers, body: fs.readFileSync(file) });
    }
    return route.continue();
  });
  if (o.storage) await context.addInitScript((s) => { try { for (const k in s) localStorage.setItem(k, s[k]); } catch (_) {} }, o.storage);
  const page = await context.newPage();
  if (process.env.LOG === "1") page.on("console", (m) => { if (["error","warning"].includes(m.type())) console.log("  console:", m.text().slice(0, 220)); });
  page.on("pageerror", (e) => console.log("  pageerror:", e.message.slice(0, 160)));
  return { context, page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const plan = require(path.resolve(process.argv[2]));
  const browser = process.env.ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ headless: process.env.HEADED !== "1" });
  const shot = async (page, name, opts) => {
    const file = path.join(OUT, name + ".jpg");
    await page.screenshot(Object.assign({ path: file, type: "jpeg", quality: 82 }, opts || {}));
    console.log("shot", name);
  };
  try { await plan({ browser, open: (o) => open(browser, o), shot, ORIGIN, OUT }); }
  finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
