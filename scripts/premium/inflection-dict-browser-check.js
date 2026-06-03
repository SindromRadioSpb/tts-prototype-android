#!/usr/bin/env node
// Browser check: the shipped offline dict loads + decompresses IN-BROWSER
// (DecompressionStream) and resolves words by root/lemma/invariant — the offline
// path that replaces server scraping. Loads the real app page.
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3228;
const URL_ARG = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : null;
const BASE = URL_ARG || `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const t = (n, c, e) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (e ? " — " + e : "")); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await new Promise(r => { const tm = setTimeout(() => r(), 4000); c.once("exit", () => { clearTimeout(tm); r(); }); }); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  const playwright = require("playwright");
  const srv = URL_ARG ? null : startServer();
  if (!URL_ARG && !(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  if (URL_ARG) console.log("[check] external target:", BASE);
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", e => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html?v=infldict", { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const r = await pg.evaluate(async () => {
      const out = { hasDict: !!window.InflectionDict };
      if (!window.InflectionDict) return out;
      try { await window.InflectionDict.ensureReady(); out.ready = true; } catch (e) { out.readyErr = String(e && e.message || e); return out; }
      out.status = window.InflectionDict.getStatus();
      const verbRoot = await window.InflectionDict.lookup("כתב", "paal");   // make-or-break: verb by ROOT
      const verbLemma = await window.InflectionDict.lookup("לכתוב", "paal"); // verb by lemma
      const noun = await window.InflectionDict.lookup("שלום", "");          // noun by lemma
      const inv = await window.InflectionDict.lookup("זאת", "");            // invariant (כזאת base)
      out.verbRoot = verbRoot && { pos: verbRoot.pos, lemma: verbRoot.lemma_niqqud, cells: verbRoot.cells ? Object.keys(verbRoot.cells).length : 0 };
      out.verbLemma = !!verbLemma;
      out.noun = noun && { pos: noun.pos, lemma: noun.lemma_niqqud };
      out.inv = inv && { kind: inv.kind, lemma: inv.lemma_niqqud };
      return out;
    });
    t("window.InflectionDict present", r.hasDict, JSON.stringify(r));
    t("dataset loads + decompresses in-browser (DecompressionStream)", r.ready === true && r.status && r.status.meta && r.status.meta.entry_count > 9000, JSON.stringify(r.status && r.status.meta));
    t("VERB by ROOT (כתב paal) → verb w/ cells (make-or-break)", !!r.verbRoot && r.verbRoot.pos === "verb" && r.verbRoot.cells > 0, JSON.stringify(r.verbRoot));
    t("VERB by lemma (לכתוב paal)", r.verbLemma === true);
    t("NOUN by lemma (שלום)", !!r.noun && r.noun.pos === "noun", JSON.stringify(r.noun));
    t("INVARIANT (זאת) present (כזאת base)", !!r.inv, JSON.stringify(r.inv));
    t("no pageerror", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[inflection-dict-browser-check] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
