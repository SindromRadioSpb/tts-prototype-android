#!/usr/bin/env node
"use strict";

// room-smoke.js — BRR-P0-002 Reading Room surface gate. Drives the real
// library.html over OPFS (seeded via index.html, shared origin), no network:
//   • populated accessible track renders shelves + work cards
//   • work card is a semantic <a> whose href decodes to the right deep-link
//     target {v:1,type:'text',id:<textId>} (the index.html reader handoff)
//   • a dangling member (text_key with no text) → disabled card, no href (R8)
//   • track tab switch shows the literary shelf
//   • empty-state when there are no shelves
//   • no pageerror on library.html

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3268;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", (c) => logs.push(String(c))); child.stderr.on("data", (c) => logs.push(String(c)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return; child.kill("SIGTERM");
  const exited = await new Promise((res) => { const tm = setTimeout(() => res(false), 5000); child.once("exit", () => { clearTimeout(tm); res(true); }); });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL");
}
async function waitForReady(t = 15000) { const s = Date.now(); while (Date.now() - s < t) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

// Decode a deep-link href the same way index.html's v3DeeplinkBase64urlDecode does.
function decodeDeepLink(href) {
  const m = href && href.match(/#\/t\/(.+)$/); if (!m) return null;
  let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4; if (pad === 2) b64 += "=="; else if (pad === 3) b64 += "=";
  try { return JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch (_) { return null; }
}

const SEED = `(async () => {
  const ldb = await window.ensureLocalDB();
  try { await ldb.dbRun("DELETE FROM shelves WHERE slug LIKE 'rt-%'"); } catch(_) {}
  try { await ldb.dbRun("DELETE FROM texts WHERE id LIKE 'rt-t-%'"); } catch(_) {}
  for (const [id,key,title] of [['rt-t-gan','rt-k-gan','גן'],['rt-t-nad','rt-k-nad','נד'],['rt-t-prh','rt-k-prh','פרח'],['rt-t-men','rt-k-men','מנדלי']])
    { try { await ldb.createText({ id, text_key:key, title, source_text:'…' }); } catch(_) {} }
  // bialik-kids includes a DANGLING member (rt-k-missing → no text)
  await ldb.createShelf({ slug:'rt-bialik', track:'accessible', order:0, title:'ביאליק', editorial_intro:'intro', items:[{text_key:'rt-k-gan',order:0},{text_key:'rt-k-nad',order:1},{text_key:'rt-k-prh',order:2},{text_key:'rt-k-missing',order:3}] });
  await ldb.createShelf({ slug:'rt-meshalim', track:'accessible', order:1, title:'משלים', editorial_intro:'intro', items:[{text_key:'rt-k-gan',order:0},{text_key:'rt-k-prh',order:1}] });
  await ldb.createShelf({ slug:'rt-canon', track:'literary', order:0, title:'קאנון', editorial_intro:'intro', items:[{text_key:'rt-k-men',order:0}] });
  return true;
})()`;

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[room-smoke] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[room-smoke] server failed"); srv.logs.forEach((l) => process.stderr.write(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[room-smoke] server up");
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));

    // seed via index.html (shared OPFS)
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false)) break; await sleep(500); }
    const seeded = await pg.evaluate(SEED).catch((e) => { console.error("seed error", e); return false; });
    test("fixture seeded", seeded === true);

    // populated Room (accessible default)
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForSelector(".shelf, .room-state", { timeout: 10000 }).catch(() => {});
    await sleep(300);
    const A = await pg.evaluate(() => {
      const c = document.getElementById("roomContent");
      const firstLink = c.querySelector("a.work-card");
      return {
        shelves: c.querySelectorAll(".shelf").length,
        cards: c.querySelectorAll(".work-card").length,
        links: c.querySelectorAll("a.work-card").length,
        disabled: c.querySelectorAll(".work-card[disabled]").length,
        firstHref: firstLink ? firstLink.getAttribute("href") : null,
        accTabSel: document.getElementById("tabAccessible").getAttribute("aria-selected"),
      };
    });
    test("accessible track shows 2 shelves", A.shelves === 2, "got " + A.shelves);
    test("accessible track shows 6 work cards", A.cards === 6, "got " + A.cards);
    test("dangling member rendered as 1 disabled card", A.disabled === 1, "got " + A.disabled);
    test("resolved members are 5 anchors", A.links === 5, "got " + A.links);
    test("accessible tab is selected by default", A.accTabSel === "true");
    const target = decodeDeepLink(A.firstHref);
    test("work-card href is a room deep-link (?room=1#/t/)", !!A.firstHref && /\/index\.html\?room=1#\/t\//.test(A.firstHref), A.firstHref);
    test("href carries room=1 (opens clean reading view)", !!A.firstHref && /[?&]room=1(?:&|#|$)/.test(A.firstHref));
    test("deep-link payload still decodes to {v:1,type:text,id:rt-t-gan} (query outside base64)", !!target && target.v === 1 && target.type === "text" && target.id === "rt-t-gan", JSON.stringify(target));

    // tab switch → literary
    await pg.click("#tabLiterary"); await sleep(200);
    const L = await pg.evaluate(() => {
      const c = document.getElementById("roomContent");
      return { shelves: c.querySelectorAll(".shelf").length, cards: c.querySelectorAll(".work-card").length, litSel: document.getElementById("tabLiterary").getAttribute("aria-selected") };
    });
    test("literary track shows 1 shelf", L.shelves === 1, "got " + L.shelves);
    test("literary shelf shows 1 card", L.cards === 1, "got " + L.cards);
    test("literary tab is selected after click", L.litSel === "true");

    // empty-state (wipe via index.html, reload)
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false)) break; await sleep(500); }
    await pg.evaluate(async () => { const l = await window.ensureLocalDB(); try { await l.dbRun("DELETE FROM shelves WHERE slug LIKE 'rt-%'"); } catch (_) {} }).catch(() => {});
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForSelector(".shelf, .room-state", { timeout: 10000 }).catch(() => {});
    await sleep(200);
    const E = await pg.evaluate(() => ({ states: document.querySelectorAll(".room-state").length, shelves: document.querySelectorAll(".shelf").length }));
    test("empty-state shown when no shelves", E.states === 1 && E.shelves === 0, JSON.stringify(E));

    test("no pageerror on library.html", errs.length === 0, errs[0]);

    // cleanup
    await pg.goto(BASE + "/index.html", { waitUntil: "load" }).catch(() => {});
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false)) break; await sleep(300); }
    await pg.evaluate(async () => { const l = await window.ensureLocalDB(); try { await l.dbRun("DELETE FROM shelves WHERE slug LIKE 'rt-%'"); await l.dbRun("DELETE FROM texts WHERE id LIKE 'rt-t-%'"); } catch (_) {} }).catch(() => {});

    await browser.close();
  } finally { await stopServer(srv.child); }
  console.log("\n[room-smoke] " + passed + "/" + (passed + failed) + " passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[room-smoke] fatal", e); process.exit(1); });
