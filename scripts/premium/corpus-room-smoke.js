#!/usr/bin/env node
"use strict";

// corpus-room-smoke.js — BRR-P0-007 Проход-3 Slice 2 gate. Drives the REAL library.html
// against the SHIPPED corpus catalog (public/data/benyehuda/corpus-catalog-v2.json +
// works/*.json served by server.js), no canon, no network beyond localhost:
//   • the "Корпус" tab appears once the catalog loads (hidden until then)
//   • the Корпус track renders era shelves + corpus cards (role=button, NOT <a> — there
//     is no no-JS deep-link to a not-yet-imported work)
//   • a corpus card carries honest provenance badges (review_status=machine / audio=none)
//   • opening a corpus card materialises the work into OPFS (served-on-open import) and
//     the warm reader paints its bilingual rows
//   • re-opening the same work resolves it from OPFS (no second import)
//   • no pageerror on library.html
//
// Loads with ?canon=skip so the heavy curated-canon auto-import never runs — this gate
// is the corpus path ONLY. (?corpus=skip would disable the very thing under test.)

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3271;
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

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[corpus-room-smoke] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[corpus-room-smoke] server failed"); srv.logs.forEach((l) => process.stderr.write(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[corpus-room-smoke] server up");

  // sanity: the catalog + a work file are actually served
  const cat = await fetch(BASE + "/data/benyehuda/corpus-catalog-v2.json").then((r) => r.ok ? r.json() : null).catch(() => null);
  test("corpus-catalog-v2.json served", !!cat && Array.isArray(cat.works) && cat.works.length > 0, cat ? ("works=" + (cat.works || []).length) : "no fetch");
  const sampleFile = cat && cat.works[0] && cat.works[0].file;
  const work0 = sampleFile ? await fetch(BASE + "/data/benyehuda/" + sampleFile).then((r) => r.ok ? r.json() : null).catch(() => null) : null;
  test("a per-work file is served (Shape A)", !!work0 && work0.library && Array.isArray(work0.library.texts) && work0.library.texts.length > 0);

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    const workFetches = []; pg.on("request", (r) => { if (/\/data\/benyehuda\/works\//.test(r.url())) workFetches.push(r.url()); });

    // canon skipped → corpus path only
    await pg.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, { timeout: 15000 }).catch(() => {});

    const T = await pg.evaluate(() => {
      const tab = document.getElementById("tabCorpus");
      return { present: !!tab, hidden: tab ? tab.hidden : true, label: tab ? tab.textContent : null };
    });
    test("Корпус tab present + visible after catalog load", T.present && !T.hidden, JSON.stringify(T));

    // open the Корпус track
    await pg.click("#tabCorpus"); await sleep(300);
    const C = await pg.evaluate(() => {
      const c = document.getElementById("roomContent");
      const cards = c.querySelectorAll(".work-card");
      const first = cards[0];
      return {
        shelves: c.querySelectorAll(".shelf").length,
        cards: cards.length,
        anchors: c.querySelectorAll("a.work-card").length,
        buttons: c.querySelectorAll('.work-card[role="button"]').length,
        firstRsBadge: first ? !!first.querySelector(".prov-badge.rs-machine") : false,
        firstAudioBadge: first ? !!first.querySelector(".prov-badge.audio-none") : false,
        corpusSel: document.getElementById("tabCorpus").getAttribute("aria-selected"),
        shelfTitles: Array.from(c.querySelectorAll(".shelf-title")).map((h) => h.textContent),
      };
    });
    test("Корпус tab selected after click", C.corpusSel === "true");
    test("corpus track renders era shelves", C.shelves >= 1, "shelves=" + C.shelves);
    test("corpus track renders work cards", C.cards > 0, "cards=" + C.cards);
    test("corpus cards are role=button (served-on-open, no no-JS deep-link)", C.buttons > 0 && C.anchors === 0, "buttons=" + C.buttons + " anchors=" + C.anchors);
    test("corpus card shows honest review_status=machine badge", C.firstRsBadge);
    test("corpus card shows honest audio_status=none badge", C.firstAudioBadge);
    test("era shelf titles are honest period names (Хаскала/Тхия)", C.shelfTitles.some((t) => /Хаскала|Тхия/.test(t)), JSON.stringify(C.shelfTitles));

    // open a corpus work — served-on-open: fetch works/<id>.json → importBundle → warm reader
    await pg.click('.work-card[role="button"]'); // first corpus card
    await pg.waitForFunction(() => {
      const reader = document.getElementById("roomReader");
      const tbl = document.getElementById("roomReaderTable");
      return reader && !reader.hidden && tbl && tbl.querySelectorAll("tr").length > 0;
    }, { timeout: 20000 }).catch(() => {});
    const R = await pg.evaluate(() => {
      const reader = document.getElementById("roomReader");
      const tbl = document.getElementById("roomReaderTable");
      return {
        readerOpen: reader && !reader.hidden,
        rows: tbl ? tbl.querySelectorAll("tr").length : 0,
        hasHe: tbl ? /[֐-׿]/.test(tbl.textContent || "") : false,
        errorBox: tbl ? !!tbl.querySelector(".room-state") : false,
      };
    });
    test("reader opens for the corpus work", R.readerOpen, JSON.stringify(R));
    test("served-on-open painted bilingual rows (proves OPFS materialisation)", R.rows > 0 && !R.errorBox, "rows=" + R.rows);
    test("reader shows Hebrew content", R.hasHe);
    const fetchesAfterFirst = workFetches.length;
    test("served-on-open fetched the work payload exactly once", fetchesAfterFirst === 1, "fetches=" + fetchesAfterFirst);

    // re-open the SAME work → resolved from OPFS, NO second network fetch
    await pg.click("#readerBack"); await sleep(150);
    await pg.click('.work-card[role="button"]');
    await pg.waitForFunction(() => { const t = document.getElementById("roomReaderTable"); return t && t.querySelectorAll("tr").length > 0; }, { timeout: 15000 }).catch(() => {});
    await sleep(200);
    test("re-opening resolves from OPFS (no second work fetch — idempotent)", workFetches.length === fetchesAfterFirst, "fetches=" + workFetches.length);

    test("no pageerror on library.html", errs.length === 0, errs[0]);

    await browser.close();
  } finally { await stopServer(srv.child); }
  console.log("\n[corpus-room-smoke] " + passed + "/" + (passed + failed) + " passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[corpus-room-smoke] fatal", e); process.exit(1); });
