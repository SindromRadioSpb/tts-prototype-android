#!/usr/bin/env node
"use strict";
// BRR-P1-009 Stage 1 · smoke:reader-notes — the Reading-Room learner-loop:
// tap a word → rich card → «Сохранить» creates a word_study note → re-tap shows it
// saved (lifecycle badge) → «Статус слов» colours the text. Real browser, real OPFS.
//
// Asserts: card has a Save button; Save → button flips to «✓ В заметках» + lifecycle
// badge + toast; re-tapping the SAME word shows it already saved (persisted note,
// idempotent); enabling the status toggle colours at least one word; 0 pageerror.
// Writes a 380px RTL screenshot of the rich card.
//
// Run:  node scripts/premium/reader-notes-smoke.js

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3286, BASE = "http://127.0.0.1:" + PORT;
const SHOT = path.join(REPO, ".tmp", "reader-notes-380.png");
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
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const eq = (cond, m) => { if (!cond) failures.push(m); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    // Pre-decline the Tier-3 context consent so the one-time consent overlay never appears
    // (it would intercept the «Сохранить» click). This test is about OFFLINE note capture,
    // not Tier-3 — declining keeps it offline-pure. (The overlay path is gated by reader-context.)
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); localStorage.setItem("room.contextConsent", "declined"); } catch (_) {} });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.NotesAutoGen && !!window.InflectionDict, { timeout: 20000 });

    // open a real baked work
    await pg.click("#tabCorpus");
    await pg.waitForSelector('.corpus-ready .work-card[role="button"]', { timeout: 20000 });
    await pg.click('.corpus-ready .work-card[role="button"]');
    await pg.waitForFunction(() => { const t = document.getElementById("roomReaderTable"); return t && t.querySelectorAll("tr").length > 0; }, { timeout: 20000 });
    await pg.waitForSelector("#roomReaderTable .rm-w", { timeout: 15000 });

    const firstSurface = await pg.evaluate(() => document.querySelector("#roomReaderTable .rm-w").getAttribute("data-surface"));

    // tap → card → resolved → has Save
    await pg.locator("#roomReaderTable .rm-w").first().click();
    await pg.waitForSelector(".rm-sheet.rm-open", { timeout: 12000 });
    await pg.waitForSelector(".rm-sheet .rm-prov, .rm-sheet .rm-card-empty", { timeout: 40000 });
    eq(await pg.locator(".rm-save").count() > 0, "card should show a «Сохранить» button");
    eq(await pg.locator(".rm-save.rm-save-done").count() === 0, "Save button should NOT be 'done' before saving");

    // save → done + lifecycle badge + toast
    await pg.click(".rm-save");
    await pg.waitForSelector(".rm-save.rm-save-done", { timeout: 12000 });
    eq(await pg.locator(".rm-life:not([hidden])").count() > 0, "lifecycle badge should appear after save");
    const toastShown = await pg.evaluate(() => { const t = document.querySelector(".room-toast"); return !!(t && t.classList.contains("show")); });
    eq(toastShown, "a toast should appear after save");

    // close, re-tap SAME word → already saved (persisted note, idempotent lookup)
    await pg.keyboard.press("Escape");
    await pg.waitForSelector(".rm-sheet.rm-open", { state: "hidden", timeout: 5000 }).catch(() => {});
    await pg.evaluate((surf) => {
      const spans = document.querySelectorAll('#roomReaderTable .rm-w[data-surface="' + surf + '"]');
      if (spans[0]) spans[0].click();
    }, firstSurface);
    await pg.waitForSelector(".rm-sheet.rm-open", { timeout: 12000 });
    await pg.waitForSelector(".rm-save", { timeout: 12000 });
    await pg.waitForSelector(".rm-save.rm-save-done", { timeout: 12000 }).catch(() => {});
    eq(await pg.locator(".rm-save.rm-save-done").count() > 0, "re-tapping a saved word should show it already saved (persisted)");

    await pg.screenshot({ path: SHOT });
    await pg.keyboard.press("Escape");

    // enable «Статус слов» → at least one word coloured
    await pg.click("#readerAidsToggle");
    await pg.waitForSelector("#readerAids .reader-aids-status input", { timeout: 8000 });
    await pg.check("#readerAids .reader-aids-status input");
    await pg.waitForFunction(() => document.querySelectorAll("#roomReaderTable .rm-w-known, #roomReaderTable .rm-w-learning, #roomReaderTable .rm-w-new").length > 0, { timeout: 30000 }).catch(() => {});
    const coloured = await pg.evaluate(() => document.querySelectorAll("#roomReaderTable .rm-w-known, #roomReaderTable .rm-w-learning, #roomReaderTable .rm-w-new").length);
    eq(coloured > 0, "word-status colouring should colour at least one word, got " + coloured);

    eq(errs.length === 0, "no pageerror, got: " + errs.slice(0, 3).join(" | "));

    console.log("reader-notes: save→note + lifecycle + toast + persisted re-tap + status colouring (" + coloured + " words)");
    console.log("screenshot → " + path.relative(REPO, SHOT));
    if (failures.length) { console.error("\nFAIL (" + failures.length + "):"); for (const f of failures) console.error("  ✗ " + f); await b.close(); await stop(srv.c); process.exit(1); }
    console.log("PASS — reader-notes smoke green");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
