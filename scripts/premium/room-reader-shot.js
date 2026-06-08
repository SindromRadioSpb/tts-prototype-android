#!/usr/bin/env node
"use strict";
// BRR-P0-002b · Stage 1 · slice 3 — embedded-reader screenshot + functional smoke.
// Boots /library.html?embed=1 (seeds canon, warms the worker), opens a canon text
// via the in-document warm reader (work-card click → reader-core.openText), and
// shots @380px: (1) SBL, (2) reading-aids open + ru-phonetic, (3) HE locale (RTL).
// If #proTable renders inside #roomReaderTable, the embed + reader-core.css + warm
// open all work. Shots → .tmp/room-reader-*.png.
//
// Run: node scripts/premium/room-reader-shot.js

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3283, BASE = "http://127.0.0.1:" + PORT;
const OUT = path.join(REPO, ".tmp");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  let failed = false;
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    await pg.goto(BASE + "/library.html?embed=1", { waitUntil: "load" });
    // canon publishes + worker warms during boot → wait for a real (enabled) work-card.
    await pg.waitForSelector("a.work-card", { timeout: 30000 });
    const cardInfo = await pg.evaluate(() => {
      const a = document.querySelector("a.work-card");
      return a ? { title: (a.querySelector(".work-card-title") || {}).textContent || "" } : null;
    });
    // Warm open: click the first work-card (embed path = reader-core.openText).
    await pg.click("a.work-card");
    await pg.waitForSelector("#roomReaderTable #proTable tbody tr", { timeout: 15000 });
    const info = await pg.evaluate(() => ({
      url: location.href,
      rows: document.querySelectorAll("#roomReaderTable #proTable tbody tr").length,
      niqqud: !!document.querySelector('#roomReaderTable td[data-col="niqqud"]'),
      heCell: (document.querySelector('#roomReaderTable td[data-col="he"]') || {}).textContent || "",
      contentHidden: !!(document.getElementById("roomContent") || {}).hidden,
      title: (document.getElementById("readerTitle") || {}).textContent || "",
    }));
    await pg.screenshot({ path: path.join(OUT, "room-reader-380-sbl.png") });
    console.log("opened:", JSON.stringify({ card: cardInfo && cardInfo.title, ...info }));
    if (info.rows < 1) { console.error("✗ no rows rendered"); failed = true; }
    if (!info.niqqud) console.warn("⚠ no niqqud cell (text may lack vocalization)");
    if (!info.contentHidden) { console.error("✗ shelves not hidden behind reader"); failed = true; }

    // Action header must be "▶" in the Room (not "▶📝" — note buttons are hidden).
    const actionHdr = await pg.evaluate(() => (document.querySelector('#roomReaderTable th[data-col="action"]') || {}).textContent || "");
    console.log("action header:", JSON.stringify(actionHdr));
    if (actionHdr.indexOf("📝") !== -1) { console.error("✗ action header still advertises 📝"); failed = true; }
    // Note/edit row buttons must be hidden (CSS), ▶ visible.
    const afford = await pg.evaluate(() => {
      const note = document.querySelector('#roomReaderTable .row-note-btn');
      const tts = document.querySelector('#roomReaderTable .row-tts-btn');
      const vis = (el) => el && getComputedStyle(el).display !== 'none';
      return { ttsVisible: vis(tts), noteVisible: vis(note) };
    });
    console.log("affordances:", JSON.stringify(afford));
    if (!afford.ttsVisible) { console.error("✗ ▶ button not visible"); failed = true; }
    if (afford.noteVisible) { console.error("✗ note button visible in Room (should be hidden)"); failed = true; }
    // Click ▶ → honest response (not a dead button): playing / error / busy state.
    await pg.click('#roomReaderTable button.row-tts-btn[data-row-idx="0"]');
    await sleep(1500);
    const btnState = await pg.evaluate(() => {
      const b = document.querySelector('#roomReaderTable button.row-tts-btn[data-row-idx="0"]');
      return b ? { cls: b.className, txt: b.textContent, busy: b.getAttribute('aria-busy') } : null;
    });
    console.log("▶ after click:", JSON.stringify(btnState));
    await pg.screenshot({ path: path.join(OUT, "room-reader-380-audio-click.png") });

    // Reading-aids open + ru-phonetic profile.
    await pg.click("#readerAidsToggle");
    await pg.waitForSelector("#readerAids select", { timeout: 5000 });
    await pg.selectOption("#readerAids select", "ru-phonetic");
    await sleep(150);
    await pg.screenshot({ path: path.join(OUT, "room-reader-380-aids-ruphon.png") });
    const translitHdr = await pg.evaluate(() => (document.querySelector('#roomReaderTable th[data-col="translit"]') || {}).textContent || "");
    console.log("aids/ru-phonetic translit header:", JSON.stringify(translitHdr));

    // HE locale → RTL chrome.
    await pg.selectOption("#roomLang", "he");
    await sleep(300);
    await pg.screenshot({ path: path.join(OUT, "room-reader-380-he-rtl.png") });
    const dir = await pg.evaluate(() => document.documentElement.getAttribute("dir"));
    console.log("HE locale <html dir>:", dir);

    // Acceptance: warm-open latency. The worker is hot (boot() initialised it), so this
    // is the embedded-reader's real per-open cost — the whole point of Option A.
    const warm = await pg.evaluate(async () => {
      const m = await import("/js/reader-core.js");
      const ldb = await import("/db/local-db.js");
      const r = await ldb.dbQuery("SELECT t.id AS id, COUNT(s.id) AS n FROM texts t JOIN sentences s ON s.text_id=t.id GROUP BY t.id ORDER BY n DESC LIMIT 1");
      const id = r && r[0] && r[0].id;
      if (!id) return { err: "no text" };
      // measure a couple of warm opens; report the median-ish (2nd) to avoid first-call jitter.
      const mount = document.createElement("div");
      let last = 0, rows = 0;
      for (let i = 0; i < 3; i++) { const t0 = performance.now(); const res = await m.openText(id, { localDb: ldb, mount, config: { t: (k) => k } }); last = Math.round(performance.now() - t0); rows = res && res.rows ? res.rows.length : 0; }
      return { ms: last, rows: rows, id: String(id) };
    });
    console.log("warm-open (worker hot):", JSON.stringify(warm), warm && warm.ms != null ? (warm.ms < 300 ? "✓ <300ms" : "⚠ >=300ms") : "");
    if (warm && warm.ms != null && warm.ms >= 300) console.warn("⚠ warm-open >=300ms — acceptance target missed");

    console.log(failed ? "\nFAIL — see errors above" : "\nOK — shots in .tmp/room-reader-380-*.png");
  } catch (e) {
    console.error("fatal", e); failed = true;
  } finally { await b.close(); await stop(srv.c); }
  process.exit(failed ? 1 : 0);
})();
