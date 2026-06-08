#!/usr/bin/env node
"use strict";
// Dev: measure reader render time for the largest single text (~486 rows) to decide
// whether B (virtualization) is needed now. Imports canon-v2, opens the biggest text
// via the room deep-link, times navigation→fully-rendered table.
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3279, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer() { const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x))); return { c, logs }; }
async function stop(c) { if (!c || c.killed) return; c.kill("SIGTERM"); const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); }); if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }
function b64url(s) { return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const srv = startServer(); if (!(await ready())) { console.error("server fail"); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    // 1) publish canon into OPFS
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    for (let i = 0; i < 40 && !(await pg.$(".work-card")); i++) await sleep(500);
    // 2) find the largest text's OPFS id via index.html (same origin)
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(2500);
    const big = await pg.evaluate(async () => {
      let ldb = null; for (let i = 0; i < 20 && !ldb; i++) { try { if (window.__localDBInitPromise) await window.__localDBInitPromise; const l = await window.ensureLocalDB(); if (l && l.dbQuery) ldb = l; } catch (_) {} if (!ldb) await new Promise((r) => setTimeout(r, 500)); }
      if (!ldb) return null;
      const r = await ldb.dbQuery("SELECT t.id, t.title, COUNT(s.id) n FROM texts t JOIN sentences s ON s.text_id=t.id GROUP BY t.id ORDER BY n DESC LIMIT 1");
      return r && r[0] ? { id: r[0].id, title: r[0].title, n: r[0].n } : null;
    });
    if (!big) { console.error("no text found"); await b.close(); await stop(srv.c); process.exit(1); }
    console.log("largest text: \"" + big.title + "\" " + big.n + " rows (id " + big.id + ")");
    // 3) open via room deep-link, time until the table has all rows
    const dl = "/index.html?room=1#/t/" + b64url(JSON.stringify({ v: 1, type: "text", id: String(big.id) }));
    const t0 = Date.now();
    await pg.goto(BASE + dl, { waitUntil: "load" });
    let rendered = 0, waited = 0;
    for (let i = 0; i < 60; i++) { rendered = await pg.evaluate(() => document.querySelectorAll("#proTable tbody tr").length); if (rendered >= 1) { /* table appeared */ } if (rendered >= big.n - 2) break; await sleep(200); waited += 200; }
    const elapsed = Date.now() - t0;
    // interactivity probe: time a forced layout read after render
    const layoutMs = await pg.evaluate(() => { const t = performance.now(); const tb = document.querySelector("#proTable"); if (tb) { void tb.getBoundingClientRect(); void tb.offsetHeight; } return Math.round(performance.now() - t); });
    console.log("rendered " + rendered + "/" + big.n + " rows | nav→full-table ~" + elapsed + "ms | forced-layout " + layoutMs + "ms");
    await pg.screenshot({ path: path.join(REPO, ".tmp", "reader-largest.png") });
    console.log("verdict: " + (elapsed < 1500 ? "render OK (B not urgent)" : "render SLOW (B justified)"));
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
