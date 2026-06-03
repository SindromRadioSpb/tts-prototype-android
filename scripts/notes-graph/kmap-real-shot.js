#!/usr/bin/env node
// Dev screenshot tool — renders the Knowledge Map view on the REAL corpus
// (Library/test-enriched.zip → notes_advanced.json, 9037 notes) by injecting
// the projected rows as the mock DB. Real Hebrew roots/lemmas at scale, no
// fragile OPFS/audio import. Captures .tmp/kmap-real-*.png. Self-skips if the
// library is absent.
"use strict";
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const JSZip = require("../../public/db/jszip.min.js");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO_ROOT, ".tmp");
const ZIP = path.join(REPO_ROOT, "Library", "test-enriched.zip");
const PORT = 3223;
const BASE = `http://127.0.0.1:${PORT}`;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
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

async function main() {
  if (!fs.existsSync(ZIP)) { console.log("SKIPPED: " + ZIP + " not found"); process.exit(0); }
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP));
  const entry = zip.file("library/notes_advanced.json");
  if (!entry) { console.log("SKIPPED: notes_advanced.json missing in zip"); process.exit(0); }
  const advanced = JSON.parse(await entry.async("string"));
  const notes = (advanced.notes || []).map((n) => {
    let b = {}; try { b = JSON.parse(n.body_json || "{}"); } catch (_) {}
    return { id: String(n.id), text_id: String(n.text_id || ""), note_type: n.note_type || "word_study",
      j_root: b.root || null, j_binyan: b.binyan || null, j_word: b.word || null, j_pos: b.pos || null,
      _meaning: b.meaning || "", _niqqud: b.niqqud_variant || "" };
  });
  console.log("real notes:", notes.length);
  // write to a temp JSON the page will fetch via a data URL injection
  const rowsJson = JSON.stringify(notes.map((n) => ({ id: n.id, text_id: n.text_id, note_type: n.note_type,
    j_root: n.j_root, j_binyan: n.j_binyan, j_word: n.j_word, j_pos: n.j_pos })));
  const prevMap = {}; notes.forEach((n) => { prevMap[n.id] = { meaning: n._meaning, niqqud: n._niqqud }; });

  const playwright = require("playwright");
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const inject = `
      window.__KMAP_ROWS = ${rowsJson};
      window.__KMAP_PREV = ${JSON.stringify(prevMap)};
      window.__localDBInitPromise = Promise.resolve();
      window.__localDB = {
        isReady: function(){return true;},
        dbQuery: async function (sql, p) {
          if (/WHERE id = \\?/i.test(sql)) { var id=p&&p[0]; var pv=window.__KMAP_PREV[id]||{}; return [{ meaning: pv.meaning||null, niqqud: pv.niqqud||null }]; }
          if (/FROM notes_v2/i.test(sql)) return window.__KMAP_ROWS;
          return [];
        },
        getLearningStateOverlay: async function(){ return {}; }
      };
      window.MorphNormalize = { normalizeHebrew: function(w){ return String(w||"").replace(/[\\u0591-\\u05C7]/g,"").trim(); } };
    `;
    // desktop
    let ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    let pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: inject });
    await pg.addScriptTag({ url: "/js/knowledge-map-data.js" });
    await pg.addScriptTag({ url: "/js/knowledge-map-view.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMap, null, { timeout: 5000 });
    const t0 = Date.now();
    const stats = await pg.evaluate(async () => { await window.KnowledgeMap.open(); return window.KnowledgeMapData ? null : null; });
    await sleep(900);
    console.log("build+render ms:", Date.now() - t0);
    await pg.screenshot({ path: path.join(TMP, "kmap-real-desktop.png") });
    await pg.close(); await ctx.close();

    // mobile 380 RTL
    ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 820 } });
    pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
    await pg.addScriptTag({ content: inject });
    await pg.addScriptTag({ url: "/js/knowledge-map-data.js" });
    await pg.addScriptTag({ url: "/js/knowledge-map-view.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMap, null, { timeout: 5000 });
    await pg.evaluate(async () => { await window.KnowledgeMap.open(); });
    await sleep(700);
    await pg.screenshot({ path: path.join(TMP, "kmap-real-mobile.png") });
    await pg.evaluate(() => { const b = document.querySelector("[data-kmap-root]"); if (b) b.click(); });
    await sleep(800);
    await pg.screenshot({ path: path.join(TMP, "kmap-real-mobile-radial.png") });
    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv);
  }
  console.log("screenshots → .tmp/kmap-real-*.png");
  console.log("pageerrors:", errs.length ? errs.join(" | ") : "none");
  process.exit(0);
}
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
