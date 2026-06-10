#!/usr/bin/env node
"use strict";

// corpus-nav-smoke.js — BRR-P1-015 A3 gate (Период→Автор→Работа drill, v3). Drives the REAL
// library.html against the SHIPPED v3 catalog and proves the benyehuda-parity navigation:
//   • L1: opening the Корпус track renders the chronological PERIOD GRID (≥7 cards), each
//     with a floruit range + gloss + counts; eras with baked works carry a «✓ готовы N» chip,
//     0-ready eras carry «перевод позже» (graduated default, honest)
//   • L2: drilling a populous era (Тхия) renders the LEAN AUTHOR LIST in graduated order
//     (the first author has ready works), with RTL Hebrew names
//   • L3: drilling an author renders WORK ROWS split into «Готовы к чтению» (role=button,
//     openable) and «В каталоге · перевод позже» (.is-later, aria-disabled — NOT openable:
//     no dead-end, never posing as readable)
//   • lazy-load budget (D1/R4): drilling ONE author fetches only that author's block(s)
//     (≤2 manifest files), NOT the whole era / all 18 manifests
//   • breadcrumb back navigates up the hierarchy
//   • no pageerror
//
// ?canon=skip → corpus path only (the canon auto-import is out of scope here).

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3272;
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
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[corpus-nav-smoke] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[corpus-nav-smoke] server failed"); srv.logs.forEach((l) => process.stderr.write(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[corpus-nav-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    const manifestFetches = new Set(); pg.on("request", (r) => { const m = /\/data\/benyehuda\/(catalog\/[^?]+)/.exec(r.url()); if (m) manifestFetches.add(m[1]); });

    await pg.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, { timeout: 15000 }).catch(() => {});
    await pg.click("#tabCorpus");

    // ── L1 period grid ──────────────────────────────────────────────────────
    await pg.waitForSelector(".corpus-period-grid .period-card", { timeout: 15000 }).catch(() => {});
    const L1 = await pg.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".period-card"));
      const tehiya = cards.find((c) => /Тхия/.test(c.textContent));
      const anyReadyChip = cards.some((c) => c.querySelector(".period-chip.ready"));
      const anyLaterChip = cards.some((c) => c.querySelector(".period-chip.later"));
      return {
        count: cards.length,
        tehiyaHasRange: tehiya ? /~18/.test(tehiya.querySelector(".period-card-range")?.textContent || "") : false,
        tehiyaHasGloss: tehiya ? !!(tehiya.querySelector(".period-card-gloss")?.textContent || "").trim() : false,
        tehiyaReady: tehiya ? !!tehiya.querySelector(".period-chip.ready") : false,
        anyReadyChip, anyLaterChip,
      };
    });
    test("L1 period grid renders ≥7 period cards", L1.count >= 7, "cards=" + L1.count);
    test("period card carries a floruit range", L1.tehiyaHasRange);
    test("period card carries a one-line gloss", L1.tehiyaHasGloss);
    test("a baked era shows «✓ готовы N» (graduated)", L1.tehiyaReady && L1.anyReadyChip);
    test("a 0-ready era shows «перевод позже» (honest)", L1.anyLaterChip);
    const manifestsBeforeDrill = manifestFetches.size;
    test("L1 loaded NO manifests (root + sidecar only — mobile budget)", manifestsBeforeDrill === 0, "manifests=" + manifestsBeforeDrill);

    // ── L2 author list (drill into Тхия) ────────────────────────────────────
    await pg.evaluate(() => { const c = Array.from(document.querySelectorAll(".period-card")).find((x) => /Тхия/.test(x.textContent)); c && c.click(); });
    await pg.waitForSelector(".corpus-author-row", { timeout: 15000 }).catch(() => {});
    const L2 = await pg.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".corpus-author-row"));
      const first = rows[0];
      return {
        rows: rows.length,
        crumb: (document.querySelector(".corpus-crumb-trail") || {}).textContent || "",
        firstReady: first ? !!first.querySelector(".corpus-author-ready") : false,
        firstNameRtl: first ? (first.querySelector(".corpus-author-name") || {}).getAttribute?.("dir") === "rtl" : false,
      };
    });
    test("L2 author list renders rows", L2.rows > 0, "rows=" + L2.rows);
    test("L2 breadcrumb shows Корпус ▸ Тхия", /Корпус/.test(L2.crumb) && /Тхия/.test(L2.crumb), JSON.stringify(L2.crumb));
    test("L2 graduated: first author has ready works (✓)", L2.firstReady);
    test("L2 Hebrew author name is RTL-isolated", L2.firstNameRtl);
    test("L2 still loaded NO manifests (author index from sidecar)", manifestFetches.size === 0, "manifests=" + manifestFetches.size);

    // ── L3 work rows (drill into the first/graduated author) ─────────────────
    await pg.click(".corpus-author-row");
    await pg.waitForSelector(".corpus-work-row", { timeout: 20000 }).catch(() => {});
    await sleep(200);
    const L3 = await pg.evaluate(() => {
      const sections = Array.from(document.querySelectorAll(".corpus-work-section"));
      const readyRows = document.querySelectorAll('.corpus-work-row[role="button"]');
      const laterRows = document.querySelectorAll(".corpus-work-row.is-later");
      const laterOpenable = document.querySelectorAll('.corpus-work-row.is-later[role="button"]');
      const firstReady = readyRows[0];
      return {
        sections: sections.length,
        readyRows: readyRows.length,
        laterRows: laterRows.length,
        laterOpenable: laterOpenable.length,
        laterDisabled: document.querySelectorAll('.corpus-work-row.is-later[aria-disabled="true"]').length,
        firstReadyHasLen: firstReady ? !!firstReady.querySelector(".corpus-work-len") : false,
        firstReadyHasRsBadge: firstReady ? !!firstReady.querySelector(".prov-badge.rs-machine") : false,
        laterHasLaterBadge: laterRows[0] ? !!laterRows[0].querySelector(".prov-badge.later") : false,
        crumb: (document.querySelector(".corpus-crumb-trail") || {}).textContent || "",
      };
    });
    test("L3 splits works into sections (Готовы / В каталоге)", L3.sections >= 1, "sections=" + L3.sections);
    test("L3 ready rows are role=button (openable)", L3.readyRows > 0, "ready=" + L3.readyRows);
    test("L3 ready row shows a length gauge + machine badge", L3.firstReadyHasLen && L3.firstReadyHasRsBadge);
    test("L3 unprocessed rows present + NOT openable (honest, no dead-end)", L3.laterRows > 0 && L3.laterOpenable === 0 && L3.laterDisabled > 0, JSON.stringify({ later: L3.laterRows, openable: L3.laterOpenable, disabled: L3.laterDisabled }));
    test("L3 unprocessed row carries «перевод позже»", L3.laterHasLaterBadge);

    // lazy-load budget: drilling ONE author fetched only its block(s), not the whole era
    test("L3 fetched only the author's block(s) (≤2 manifests, not all 18)", manifestFetches.size >= 1 && manifestFetches.size <= 2, "manifests=" + manifestFetches.size + " [" + Array.from(manifestFetches).join(", ") + "]");

    // clicking an unprocessed row does NOT open a reader (dead-end guard)
    await pg.evaluate(() => { const r = document.querySelector(".corpus-work-row.is-later"); r && r.click(); });
    await sleep(300);
    const afterLaterClick = await pg.evaluate(() => { const rd = document.getElementById("roomReader"); return rd ? rd.hidden : true; });
    test("clicking an unprocessed row opens nothing (reader stays hidden)", afterLaterClick === true);

    // ── breadcrumb back: L3 → L2 → L1 ───────────────────────────────────────
    await pg.click(".corpus-back");
    await pg.waitForSelector(".corpus-author-row", { timeout: 10000 }).catch(() => {});
    const backToL2 = await pg.evaluate(() => !!document.querySelector(".corpus-author-row") && !document.querySelector(".corpus-work-row"));
    test("breadcrumb back returns L3 → L2 (author list)", backToL2);
    await pg.click(".corpus-back");
    await pg.waitForSelector(".corpus-period-grid", { timeout: 10000 }).catch(() => {});
    const backToL1 = await pg.evaluate(() => !!document.querySelector(".corpus-period-grid") && !document.querySelector(".corpus-author-row"));
    test("breadcrumb back returns L2 → L1 (period grid)", backToL1);

    test("no pageerror on library.html", errs.length === 0, errs[0]);

    await browser.close();
  } finally { await stopServer(srv.child); }
  console.log("\n[corpus-nav-smoke] " + passed + "/" + (passed + failed) + " passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[corpus-nav-smoke] fatal", e); process.exit(1); });
