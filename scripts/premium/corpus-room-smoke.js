#!/usr/bin/env node
"use strict";

// corpus-room-smoke.js — BRR-P1-015 A3 gate (served-on-open, v3). Drives the REAL
// library.html against the SHIPPED v3 corpus catalog (corpus-catalog-v3.json root +
// corpus-index-v3.json sidecar + catalog/*.json manifests + works/*.json), no canon, no
// network beyond localhost:
//   • the "Корпус" tab appears once the thin root loads (hidden until then)
//   • opening the Корпус track lazily loads the sidecar + renders the "✓ Готовы к чтению"
//     rail of openable corpus cards (role=button — NOT <a>: no no-JS deep-link to a
//     not-yet-imported work)
//   • a ready card carries honest provenance badges (review_status=machine / audio=none)
//   • opening a ready card materialises the work into OPFS (served-on-open import) and the
//     warm reader paints its bilingual rows
//   • re-opening the same work resolves it from OPFS (no second work fetch — idempotent)
//   • no pageerror on library.html
//
// Loads with ?canon=skip so the heavy curated-canon auto-import never runs — this gate is
// the corpus path ONLY. (?corpus=skip would disable the very thing under test.)

const path = require("path");
const fs = require("fs");
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

  // sanity: the LIVE root + sidecar + a work file are served. Version-derived from the
  // client (CORPUS_CATALOG_VERSION) so a re-publish version bump doesn't churn this gate.
  const CV = (fs.readFileSync(path.join(REPO_ROOT, "public", "js", "library-ui.js"), "utf8").match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/) || [])[1] || "3";
  const rootFile = "corpus-catalog-v" + CV + ".json";
  const root = await fetch(BASE + "/data/benyehuda/" + rootFile).then((r) => r.ok ? r.json() : null).catch(() => null);
  test(rootFile + " (thin root) served", !!root && Array.isArray(root.era_taxonomy) && root.counts && root.counts.works > 0, root ? ("works=" + (root.counts && root.counts.works)) : "no fetch");
  test("root declares its sidecar (index_file)", !!root && typeof root.index_file === "string", root ? root.index_file : "");
  const idx = await fetch(BASE + "/data/benyehuda/" + (root && root.index_file || ("corpus-index-v" + CV + ".json"))).then((r) => r.ok ? r.json() : null).catch(() => null);
  test("sidecar " + (root && root.index_file) + " served with ready rail + author index + facets", !!idx && Array.isArray(idx.ready) && idx.ready.length > 0 && idx.authors && idx.facets, idx ? ("ready=" + (idx.ready || []).length) : "no fetch");
  const sampleFile = idx && idx.ready[0] && idx.ready[0].file;
  test("a ready card carries a work file + text_key (served-on-open inputs)", !!sampleFile && !!(idx.ready[0].text_key));
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
      return { present: !!tab, hidden: tab ? tab.hidden : true };
    });
    test("Корпус tab present + visible after root load", T.present && !T.hidden, JSON.stringify(T));

    // open the Корпус track → ready rail (lazy sidecar)
    await pg.click("#tabCorpus");
    await pg.waitForSelector(".corpus-ready .work-card", { timeout: 15000 }).catch(() => {});
    const C = await pg.evaluate(() => {
      const c = document.getElementById("roomContent");
      const cards = c.querySelectorAll(".corpus-ready .work-card");
      const first = cards[0];
      return {
        readyRail: !!c.querySelector(".corpus-ready"),
        periodGrid: !!c.querySelector(".corpus-period-grid"),
        cards: cards.length,
        anchors: c.querySelectorAll("a.work-card").length,
        buttons: c.querySelectorAll('.corpus-ready .work-card[role="button"]').length,
        firstRsBadge: first ? !!first.querySelector(".prov-badge.rs-machine") : false,
        firstAudioBadge: first ? !!first.querySelector(".prov-badge.audio-none") : false,
        corpusSel: document.getElementById("tabCorpus").getAttribute("aria-selected"),
      };
    });
    test("Корпус tab selected after click", C.corpusSel === "true");
    test("L1 renders the «✓ Готовы к чтению» rail", C.readyRail && C.cards > 0, "cards=" + C.cards);
    test("L1 renders the period grid (browse-all axis)", C.periodGrid);
    test("ready cards are role=button (served-on-open, no no-JS deep-link)", C.buttons > 0 && C.anchors === 0, "buttons=" + C.buttons + " anchors=" + C.anchors);
    test("ready card shows honest review_status=machine badge", C.firstRsBadge);
    test("ready card shows honest audio_status=none badge", C.firstAudioBadge);

    // open a ready work — served-on-open: fetch works/<id>.json → importBundle → warm reader
    await pg.click('.corpus-ready .work-card[role="button"]');
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
    await pg.click('.corpus-ready .work-card[role="button"]');
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
