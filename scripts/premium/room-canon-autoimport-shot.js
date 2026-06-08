#!/usr/bin/env node
"use strict";

// room-canon-autoimport-shot.js — BRR-P0-004 ship-as-asset verification (dev).
// Loads library.html on a FRESH OPFS (no pre-import) and asserts the shipped canon
// bundle (public/data/benyehuda/canon-v1.zip) AUTO-IMPORTS on first visit, then
// screenshots @380px. Proves the "published shelf for all users" path end to end.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3277;
const BASE = "http://127.0.0.1:" + PORT;
const TMP = path.join(REPO, ".tmp");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", (c) => logs.push(String(c).trim())); child.stderr.on("data", (c) => logs.push(String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const ok = await new Promise((res) => { const t = setTimeout(() => res(false), 5000); child.once("exit", () => { clearTimeout(t); res(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
async function waitReady(ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("playwright missing:", e.message); process.exit(1); }
  // sanity: the asset must be served
  const srv = startServer();
  if (!(await waitReady())) { console.error("server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  const assetR = await fetch(BASE + "/data/benyehuda/canon-v1.zip", { method: "HEAD" }).catch(() => null);
  console.log("[canon-shot] asset /data/benyehuda/canon-v1.zip →", assetR ? assetR.status : "ERR");

  const browser = await pw.chromium.launch();
  let failed = 0;
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => { console.error("[pageerror]", String(e)); });
    pg.on("console", (m) => { const t = m.text(); if (/canon|publish|room\]/i.test(t)) console.log("  [page]", t); });
    // FRESH OPFS — first ever visit. Auto-import must populate the canon.
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    // wait for auto-import to finish (fetch 1.4MB + unzip + 54-text import)
    let R = null; const t0 = Date.now();
    for (let i = 0; i < 480; i++) { // up to ~240s — first-visit import of 54 texts/4417 rows into OPFS is slow
      R = await pg.evaluate(() => ({
        shelves: document.querySelectorAll(".shelf").length,
        cards: document.querySelectorAll(".work-card").length,
        badges: document.querySelectorAll(".prov-badge").length,
      }));
      if (R.cards > 0) break;
      await sleep(500);
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log("[canon-shot] auto-import rendered after ~" + elapsed + "s (accessible track):", JSON.stringify(R));
    await pg.screenshot({ path: path.join(TMP, "room-canon-autoimport.png"), fullPage: true });
    // switch to literary track (3 shelves)
    await pg.evaluate(() => { const b = document.getElementById("tabLiterary"); if (b) b.click(); });
    await sleep(800);
    const lit = await pg.evaluate(() => ({ shelves: document.querySelectorAll(".shelf").length, cards: document.querySelectorAll(".work-card").length }));
    console.log("[canon-shot] literary track:", JSON.stringify(lit));
    await pg.screenshot({ path: path.join(TMP, "room-canon-literary.png"), fullPage: true });

    // reload → must NOT re-import (idempotent: shelves already in OPFS)
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await sleep(1500);
    const reload = await pg.evaluate(() => ({ cards: document.querySelectorAll(".work-card").length }));
    console.log("[canon-shot] after reload (idempotent):", JSON.stringify(reload));

    // integrity + counts via index.html (same OPFS origin exposes ensureLocalDB + dbQuery)
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(2500);
    const integ = await pg.evaluate(async () => {
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) { try { if (window.__localDBInitPromise) await window.__localDBInitPromise; const l = await window.ensureLocalDB(); if (l && l.dbQuery) ldb = l; } catch (_) {} if (!ldb) await new Promise((r) => setTimeout(r, 500)); }
      if (!ldb) return { err: "no ldb" };
      const ic = await ldb.dbQuery("PRAGMA integrity_check");
      const t = await ldb.dbQuery("SELECT COUNT(*) n FROM texts");
      const sn = await ldb.dbQuery("SELECT COUNT(*) n FROM sentences");
      const s = await ldb.getShelves();
      return { integrity: (ic && ic[0]) ? Object.values(ic[0])[0] : "?", texts: t[0].n, sentences: sn[0].n, shelves: s.length };
    });
    console.log("[canon-shot] integrity+counts:", JSON.stringify(integ));
    if (integ.integrity !== "ok") { console.error("FAIL: integrity_check != ok"); failed++; }
    if (integ.texts !== 79) { console.error("FAIL: expected 79 texts (canon-v2 incl. chapters), got " + integ.texts); failed++; }
    if (integ.shelves !== 7) { console.error("FAIL: expected 7 shelves (4 canon + 3 work), got " + integ.shelves); failed++; }

    if (!R || R.cards === 0) { console.error("FAIL: canon did not auto-import on fresh OPFS"); failed++; }
    if (reload.cards === 0) { console.error("FAIL: shelves gone after reload"); failed++; }
    console.log("[canon-shot] screenshots → .tmp/room-canon-*.png");
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("[canon-shot] fatal", e); process.exit(1); });
