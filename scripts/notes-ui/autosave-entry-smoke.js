#!/usr/bin/env node
// scripts/notes-ui/autosave-entry-smoke.js — v3.4 C5 + C7.
//
// Pins:
//   C5 (A-G5) autosave is no longer silent — v3NotesSetSaveStatus
//     renders "saving" / "failed + Retry" in the aria-live status.
//   C7 (A-G9) the floating selection-bubble toolbar buttons are
//     i18n-wired (data-i18n-title + aria-label), no hardcoded-only RU.
//   C7 (A-G8) the Notes-tab empty-state has a global "+ New note"
//     entry wired to a free-note open.
//
// Cases:
//   1. #v3NotesStatus is an aria-live status region.
//   2. v3NotesSetSaveStatus("saving") shows the saving text, no error.
//   3. v3NotesSetSaveStatus("failed") shows error text + a Retry
//      button; clicking it flips the status back to "saving".
//   4. All 5 bubble buttons have data-i18n-title + data-i18n-aria-label
//      + aria-label (A-G9 closed).
//   5. Notes-tab empty-state has a wired "+ New note" button and
//      clicking it opens the notes modal. No pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3217;
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
    const tm = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tm); resolve(true); });
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

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[autosave-entry-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[autosave-entry-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[autosave-entry-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);

    const live = await pg.evaluate(() => {
      const el = document.getElementById("v3NotesStatus");
      return el ? { role: el.getAttribute("role"), live: el.getAttribute("aria-live") } : null;
    });
    test("Case 1: #v3NotesStatus is an aria-live status region",
         live && live.role === "status" && live.live === "polite",
         JSON.stringify(live));

    const saving = await pg.evaluate(() => {
      window.v3NotesSetSaveStatus("saving");
      const el = document.getElementById("v3NotesStatus");
      return { text: el.textContent, err: el.classList.contains("v3-error") };
    });
    test("Case 2: saving state shows progress text, no error class",
         /Сохран|Saving|שומר/i.test(saving.text) && saving.err === false,
         JSON.stringify(saving));

    const failed = await pg.evaluate(() => {
      window.v3NotesSetSaveStatus("failed");
      const el = document.getElementById("v3NotesStatus");
      const btn = el.querySelector("button");
      const beforeErr = el.classList.contains("v3-error");
      const beforeText = el.textContent;
      let afterText = null;
      if (btn) {
        btn.click();                      // retry handler runs synchronously
        afterText = document.getElementById("v3NotesStatus").textContent;
      }
      return { beforeErr, beforeText, hasBtn: !!btn,
               btnText: btn ? btn.textContent : "", afterText };
    });
    test("Case 3: failed state has error text + working Retry button",
         failed.beforeErr === true && failed.hasBtn &&
         /Повтор|Retry|נסו/i.test(failed.btnText) &&
         /Сохран|Saving|שומר/i.test(failed.afterText || ""),
         JSON.stringify(failed));

    const bubble = await pg.evaluate(() => {
      const wrap = document.getElementById("v3NotesEditBubble");
      if (!wrap) return { ok: false };
      const btns = Array.prototype.slice.call(wrap.querySelectorAll("button"));
      const allWired = btns.length === 5 && btns.every((b) =>
        b.getAttribute("data-i18n-title") &&
        b.getAttribute("data-i18n-aria-label") &&
        b.getAttribute("aria-label"));
      return { ok: true, count: btns.length, allWired };
    });
    test("Case 4: bubble toolbar buttons i18n-wired (A-G9 closed)",
         bubble.ok && bubble.count === 5 && bubble.allWired,
         JSON.stringify(bubble));

    const entry = await pg.evaluate(() => {
      const c = document.getElementById("v3IdeNotesContent");
      const btn = c ? c.querySelector('[data-i18n="ide.notesEmpty.newNote"]') : null;
      const onclick = btn ? String(btn.getAttribute("onclick") || "") : "";
      const wired = /v3NotesOpen\(/.test(onclick) && /'free'/.test(onclick);
      let modalOpen = false;
      if (btn) {
        btn.click();
        const m = document.getElementById("v3NotesModal");
        modalOpen = !!(m && !m.classList.contains("hidden"));
      }
      return { hasBtn: !!btn, wired, modalOpen };
    });
    test("Case 5: Notes-tab '+ New note' entry opens a note + no pageerror",
         entry.hasBtn && entry.wired && entry.modalOpen && errs.length === 0,
         JSON.stringify({ entry, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[autosave-entry-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[autosave-entry-smoke] fatal:", e); process.exit(1); });
