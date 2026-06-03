#!/usr/bin/env node
// Dev screenshot tool for the Knowledge Map view (Phase 2) — isolated render
// with a realistic mock fixture. Captures desktop + 380px RTL screenshots to
// .tmp/. Not a smoke (no assertions); used for live visual iteration.
"use strict";
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO_ROOT, ".tmp");
const PORT = 3222;
const BASE = `http://127.0.0.1:${PORT}`;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"] });
  return child;
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((r) => { const t = setTimeout(() => r(), 4000); child.once("exit", () => { clearTimeout(t); r(); }); });
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
async function waitForReady(ms = 15000) {
  const s = Date.now();
  while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); }
  return false;
}

// Realistic fixture: 6 roots, varied family sizes + statuses + frequency.
const MOCK = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDB = {
    isReady: function(){return true;},
    dbQuery: async function (sql, p) {
      if (/WHERE id = \\?/i.test(sql)) {
        return [{ meaning: "писать (пример перевода)", niqqud: "כּוֹתֵב" }];
      }
      if (/FROM notes_v2/i.test(sql)) return [
        {id:"a1",text_id:"T1",note_type:"word_study",j_root:"כתב",j_binyan:"paal",j_word:"כותב",j_pos:"verb"},
        {id:"a2",text_id:"T1",note_type:"word_study",j_root:"כתב",j_binyan:"paal",j_word:"כותב",j_pos:"verb"},
        {id:"a3",text_id:"T2",note_type:"word_study",j_root:"כתב",j_binyan:null,j_word:"מכתב",j_pos:"noun"},
        {id:"a4",text_id:"T2",note_type:"word_study",j_root:"כתב",j_binyan:null,j_word:"כתובת",j_pos:"noun"},
        {id:"a5",text_id:"T1",note_type:"word_study",j_root:"כתב",j_binyan:"hifil",j_word:"הכתיב",j_pos:"verb"},
        {id:"b1",text_id:"T1",note_type:"word_study",j_root:"למד",j_binyan:"paal",j_word:"לומד",j_pos:"verb"},
        {id:"b2",text_id:"T2",note_type:"word_study",j_root:"למד",j_binyan:"piel",j_word:"מלמד",j_pos:"verb"},
        {id:"b3",text_id:"T2",note_type:"word_study",j_root:"למד",j_binyan:null,j_word:"תלמיד",j_pos:"noun"},
        {id:"c1",text_id:"T1",note_type:"word_study",j_root:"אכל",j_binyan:"paal",j_word:"אוכל",j_pos:"verb"},
        {id:"c2",text_id:"T1",note_type:"word_study",j_root:"אכל",j_binyan:null,j_word:"אוכל",j_pos:"noun"},
        {id:"d1",text_id:"T3",note_type:"word_study",j_root:"הלך",j_binyan:"paal",j_word:"הולך",j_pos:"verb"},
        {id:"d2",text_id:"T3",note_type:"word_study",j_root:"הלך",j_binyan:"paal",j_word:"הליכה",j_pos:"noun"},
        {id:"e1",text_id:"T3",note_type:"word_study",j_root:"ראה",j_binyan:"paal",j_word:"רואה",j_pos:"verb"},
        {id:"f1",text_id:"T3",note_type:"word_study",j_root:"דבר",j_binyan:"piel",j_word:"מדבר",j_pos:"verb"},
        {id:"f2",text_id:"T3",note_type:"word_study",j_root:"דבר",j_binyan:null,j_word:"דיבור",j_pos:"noun"}
      ];
      return [];
    },
    getLearningStateOverlay: async function(){ return {
      a1:"known", a2:"known", a3:"learning", b1:"learning", c1:"known", d1:"known", e1:"new"
    }; }
  };
  window.MorphNormalize = { normalizeHebrew: function(w){ return String(w||"").replace(/[\\u0591-\\u05C7]/g,"").trim(); } };
`;

async function main() {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const playwright = require("playwright");
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    // desktop
    let ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    let pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: MOCK });
    await pg.addScriptTag({ url: "/js/knowledge-map-data.js" });
    await pg.addScriptTag({ url: "/js/knowledge-map-view.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMap && !!window.KnowledgeMapData, null, { timeout: 5000 });
    await pg.evaluate(async () => { await window.KnowledgeMap.open(); });
    await sleep(700);
    await pg.screenshot({ path: path.join(TMP, "kmap-desktop.png") });
    // click a lemma node to show preview
    await pg.evaluate(() => { const n = document.querySelector("[data-kmap-node]"); if (n) n.dispatchEvent(new MouseEvent("click", {bubbles:true})); });
    await sleep(500);
    await pg.screenshot({ path: path.join(TMP, "kmap-desktop-preview.png") });
    await pg.close(); await ctx.close();

    // mobile 380 RTL
    ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 820 } });
    pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
    await pg.addScriptTag({ content: MOCK });
    await pg.addScriptTag({ url: "/js/knowledge-map-data.js" });
    await pg.addScriptTag({ url: "/js/knowledge-map-view.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMap, null, { timeout: 5000 });
    await pg.evaluate(async () => { await window.KnowledgeMap.open(); });
    await sleep(600);
    await pg.screenshot({ path: path.join(TMP, "kmap-mobile-list.png") });
    // tap first root → root sheet (radial)
    await pg.evaluate(() => { const b = document.querySelector("[data-kmap-root]"); if (b) b.click(); });
    await sleep(700);
    await pg.screenshot({ path: path.join(TMP, "kmap-mobile-radial.png") });
    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv);
  }
  console.log("screenshots → .tmp/kmap-*.png");
  console.log("pageerrors:", errs.length ? errs.join(" | ") : "none");
  process.exit(0);
}
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
