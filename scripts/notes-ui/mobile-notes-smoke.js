#!/usr/bin/env node
// scripts/notes-ui/mobile-notes-smoke.js — v3.4 C6 mobile notes pass.
//
// Pins the responsive fix for the note-editor "Links" add-row + forms
// (audit A-G7). Opens the notes editor through the real app path
// (`v3NotesOpen`, fresh free note) so the modal is genuinely laid
// out, then force-expands the Links panel/body (collapsed-until-save
// by design, A-G1) purely to measure its responsive CSS at a phone
// vs a desktop viewport. Deterministic; no DB seeding needed.
//
// Cases:
//   1. @414px: .v3-notes-links-add-row is a COLUMN (flex-direction).
//   2. @414px: kind/target/alias are full-width (no inline max-width
//      cramp) and the add-row has NO horizontal overflow.
//   3. @414px: select/target/alias/button touch targets ≥ 38px tall.
//   4. @1280px: the add-row is NOT a column (desktop unchanged —
//      the change is mobile-only).
//   5. no pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3213;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

// Open the editor via the real app path, then force-expand the
// (collapsed-until-save by design) Links panel/body for measurement.
const REVEAL = async () => {
  for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
    const e = document.getElementById(id);
    if (e && e.parentNode) e.parentNode.removeChild(e);
  }
  if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
  if (typeof window.v3NotesOpen !== "function") throw new Error("v3NotesOpen missing");
  window.v3NotesOpen("", "", null, { entryKind: "free", targetKind: "free", noteType: "free" });
  const p = document.getElementById("v3NotesLinksPanel");
  if (p) p.style.display = "block";
  const b = document.getElementById("v3NotesLinksBody");
  if (b) b.style.display = "block";
};

function measure() {
  const row = document.querySelector(".v3-notes-links-add-row");
  if (!row) return { found: false };
  const cs = getComputedStyle(row);
  const kind = document.getElementById("v3NotesLinksAddKind");
  const tgt = document.getElementById("v3NotesLinksAddTarget");
  const ali = document.getElementById("v3NotesLinksAddAlias");
  const btn = row.querySelector("button");
  const rw = row.clientWidth;
  const h = (el) => el ? el.getBoundingClientRect().height : 0;
  const w = (el) => el ? el.getBoundingClientRect().width : 0;
  return {
    found: true,
    flexDir: cs.flexDirection,
    rowClientW: rw,
    rowScrollW: row.scrollWidth,
    kindW: w(kind), tgtW: w(tgt), aliW: w(ali),
    kindH: h(kind), tgtH: h(tgt), aliH: h(ali), btnH: h(btn),
  };
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[mobile-notes-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[mobile-notes-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[mobile-notes-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];

  try {
    // ── Phone viewport ──────────────────────────────────────────────────
    const mctx = await browser.newContext({
      serviceWorkers: "block", viewport: { width: 414, height: 896 },
    });
    const mp = await mctx.newPage();
    mp.on("pageerror", (e) => errs.push(String(e.message || e)));
    await mp.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);
    await mp.evaluate(REVEAL);
    await sleep(150);
    const m = await mp.evaluate(measure);
    await mp.close(); await mctx.close();

    test("Case 1: @414px .v3-notes-links-add-row is a column",
         m.found && m.flexDir === "column",
         JSON.stringify({ found: m.found, flexDir: m.flexDir }));

    const fullW = m.found &&
      m.kindW >= m.rowClientW * 0.9 &&
      m.tgtW  >= m.rowClientW * 0.9 &&
      m.aliW  >= m.rowClientW * 0.9;
    const noOverflow = m.found && m.rowScrollW <= m.rowClientW + 2;
    test("Case 2: @414px kind/target/alias full-width + no horizontal overflow",
         fullW && noOverflow,
         JSON.stringify({ rowClientW: m.rowClientW, rowScrollW: m.rowScrollW,
                          kindW: m.kindW, tgtW: m.tgtW, aliW: m.aliW }));

    const touchOk = m.found &&
      m.kindH >= 38 && m.tgtH >= 38 && m.aliH >= 38 && m.btnH >= 38;
    test("Case 3: @414px touch targets ≥ 38px (kind/target/alias/button)",
         touchOk,
         JSON.stringify({ kindH: m.kindH, tgtH: m.tgtH, aliH: m.aliH, btnH: m.btnH }));

    // ── Desktop viewport (control: change is mobile-only) ───────────────
    const dctx = await browser.newContext({
      serviceWorkers: "block", viewport: { width: 1280, height: 800 },
    });
    const dp = await dctx.newPage();
    dp.on("pageerror", (e) => errs.push(String(e.message || e)));
    await dp.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);
    await dp.evaluate(REVEAL);
    await sleep(150);
    const d = await dp.evaluate(measure);
    await dp.close(); await dctx.close();

    test("Case 4: @1280px add-row is NOT a column (desktop layout unchanged)",
         d.found && d.flexDir !== "column",
         JSON.stringify({ flexDir: d.flexDir }));

    test("Case 5: no pageerror",
         errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[mobile-notes-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[mobile-notes-smoke] fatal:", e); process.exit(1); });
