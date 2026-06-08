#!/usr/bin/env node
"use strict";

// room-prov-shot.js — BRR-P0-004/005 visual verification harness (manual/dev).
// Imports a produced bundle ZIP into OPFS and screenshots the Reading Room
// @380px RTL for BOTH tracks, asserting the P0-005 provenance badges render.
//
//   node scripts/premium/room-prov-shot.js --zip .tmp/benyehuda-pilot.zip
//
// Not a CI gate (needs a produced bundle); a real-content eyeball + badge check.

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const JSZip = require("../../public/db/jszip.min.js");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3274;
const BASE = "http://127.0.0.1:" + PORT;
const TMP = path.join(REPO, ".tmp");
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def; }
const ZIP = path.resolve(arg("zip", path.join(TMP, "benyehuda-pilot.zip")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", (c) => logs.push(String(c).trim())); child.stderr.on("data", (c) => logs.push(String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((res) => { const tm = setTimeout(() => res(false), 5000); child.once("exit", () => { clearTimeout(tm); res(true); }); });
  if (!exited && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
async function waitReady(ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

(async () => {
  if (!fs.existsSync(ZIP)) { console.error("[room-prov-shot] bundle not found:", ZIP); process.exit(2); }
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("playwright missing:", e.message); process.exit(1); }
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP));
  const lib = JSON.parse(await (zip.file("library/library.json") || zip.file("library.json")).async("string"));
  console.log("[room-prov-shot] bundle:", lib.texts.length, "texts,", (lib.shelves || []).length, "shelves");

  const srv = startServer();
  if (!(await waitReady())) { console.error("server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }

  const browser = await playwright.chromium.launch();
  let failed = 0;
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => { console.error("[pageerror]", String(e)); });
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);
    // import the bundle into OPFS
    const imp = await pg.evaluate(async (bundleLib) => {
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) { try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {} try { const l = await window.ensureLocalDB(); if (l && l.importBundle) ldb = l; } catch (_) {} if (!ldb) await new Promise((r) => setTimeout(r, 500)); }
      if (!ldb) return { ok: false, err: "no ldb" };
      const res = await ldb.importBundle({ library: bundleLib }, { mode: "asNew" });
      const texts = await ldb.dbQuery("SELECT COUNT(*) n FROM texts");
      const shelves = await ldb.getShelves();
      return { ok: true, res, texts: texts[0].n, shelves: shelves.length };
    }, lib);
    console.log("[room-prov-shot] import:", JSON.stringify(imp));
    if (!imp.ok) { failed++; }

    // open the Reading Room (accessible track default)
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await sleep(1800);
    const acc = await pg.evaluate(() => ({
      shelves: document.querySelectorAll(".shelf").length,
      cards: document.querySelectorAll(".work-card").length,
      badges: document.querySelectorAll(".prov-badge").length,
      authors: document.querySelectorAll(".work-card-author").length,
      sample: (document.querySelector(".prov-badge") || {}).textContent || "",
      dir: document.documentElement.getAttribute("dir") || "",
    }));
    console.log("[room-prov-shot] accessible track:", JSON.stringify(acc));
    fs.mkdirSync(TMP, { recursive: true });
    await pg.screenshot({ path: path.join(TMP, "room-prov-accessible.png"), fullPage: true });

    // switch to Hebrew to verify RTL + HE badge labels, screenshot
    await pg.evaluate(() => { try { window.appSetLocale && window.appSetLocale("he"); } catch (_) {} });
    await sleep(700);
    const he = await pg.evaluate(() => ({ dir: document.documentElement.getAttribute("dir") || "", sample: (document.querySelector(".prov-badge") || {}).textContent || "" }));
    console.log("[room-prov-shot] HE:", JSON.stringify(he));
    await pg.screenshot({ path: path.join(TMP, "room-prov-he-rtl.png"), fullPage: true });

    // literary track (back to RU)
    await pg.evaluate(() => { try { window.appSetLocale && window.appSetLocale("ru"); } catch (_) {} });
    await sleep(400);
    await pg.evaluate(() => { const b = document.getElementById("tabLiterary"); if (b) b.click(); });
    await sleep(700);
    const lit = await pg.evaluate(() => ({ shelves: document.querySelectorAll(".shelf").length, cards: document.querySelectorAll(".work-card").length, badges: document.querySelectorAll(".prov-badge").length }));
    console.log("[room-prov-shot] literary track:", JSON.stringify(lit));
    await pg.screenshot({ path: path.join(TMP, "room-prov-literary.png"), fullPage: true });

    if (acc.cards === 0) { console.error("FAIL: no work cards rendered"); failed++; }
    if (acc.badges < acc.cards * 1) { console.error("FAIL: fewer provenance badges than cards"); failed++; }
    if (acc.authors === 0) { console.error("FAIL: no author lines rendered"); failed++; }

    // open a work in room-mode → verify the reader provenance bar (P0-005 reader side)
    const tid = (imp.res && imp.res.importedIds && imp.res.importedIds[0]) || null;
    if (tid) {
      const b64url = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const dl = "/index.html?room=1#/t/" + b64url(JSON.stringify({ v: 1, type: "text", id: String(tid) }));
      await pg.goto(BASE + dl, { waitUntil: "load" });
      await sleep(3200); // let v3RoomShowProvenance's first-load retry loop populate the bar
      const rd = await pg.evaluate(() => ({
        roomMode: document.body.classList.contains("room-mode"),
        provBadges: document.querySelectorAll("#roomProvenance .prov-badge").length,
        srcHref: (document.querySelector("#roomProvenance .room-prov-src") || {}).href || "",
        attr: (document.querySelector("#roomProvenance .room-prov-attr") || {}).textContent || "",
      }));
      console.log("[room-prov-shot] reader provenance:", JSON.stringify(rd));
      await pg.screenshot({ path: path.join(TMP, "room-prov-reader.png") });
      if (!rd.roomMode) { console.error("FAIL: reader not in room-mode"); failed++; }
      if (rd.provBadges < 2) { console.error("FAIL: reader provenance badges missing"); failed++; }
      if (!/benyehuda\.org\/read\//.test(rd.srcHref)) { console.error("FAIL: reader source link missing/wrong"); failed++; }
    }
    console.log("[room-prov-shot] screenshots → .tmp/room-prov-*.png");
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("[room-prov-shot] fatal", e); process.exit(1); });
