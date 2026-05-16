#!/usr/bin/env node
// scripts/notes-ui/type-switch-smoke.js — v3.4 C4.
//
// Pins the non-destructive in-modal note-type switch (audit A-G4).
// Previously: note_type was locked at creation and converting blanked
// the new form (working text only survived in history) → "lost work"
// from the user's POV. Now: the convert button is reachable for any
// saved note and conversion carries the current body forward.
//
// Cases:
//   1. After save, #v3NotesConvertBtn is visible (in-modal switch
//      reachable for a saved note).
//   2. The convert confirm copy promises carry-forward (no "blank").
//   3. After confirming a convert, the editor still holds the body
//      (NON-DESTRUCTIVE — not blanked).
//   4. The switch took effect: the target type's template form shows
//      + the locked type badge reflects the new type.
//   5. No pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3218;
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
  catch (e) { console.error("[type-switch-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[type-switch-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[type-switch-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);

    // Open a fresh free note + save through a stubbed createNote so the
    // host sets v3NotesModalNoteId itself (script-scoped let). Also stub
    // convertNoteType for the conversion API.
    const setup = await pg.evaluate(async () => {
      for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
        const e = document.getElementById(id);
        if (e && e.parentNode) e.parentNode.removeChild(e);
      }
      if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
      window.__localDBInitError = null;
      window.__localDB = {
        isReady: () => true,
        createNote: async () => ({ id: "note-9", updated_at: new Date().toISOString() }),
        updateNote: async () => ({ id: "note-9", updated_at: new Date().toISOString() }),
        convertNoteType: async (id, to) => ({ id: String(id), note_type: to }),
        listOutgoingLinks: async () => [],
        listBacklinks: async () => [],
        addNoteLink: async () => true,
      };
      window.v3NotesOpen("", "", null, { entryKind: "free", targetKind: "free", noteType: "free" });
      const ta = document.getElementById("v3NotesText");
      if (ta) ta.value = "carry me forward";
      const ed = document.getElementById("v3NotesEditor");
      if (ed) ed.textContent = "carry me forward";
      try { await window.v3NotesSave(false); } catch (_) {}
      const cBtn = document.getElementById("v3NotesConvertBtn");
      return { convertVisible: !!(cBtn && cBtn.style.display !== "none") };
    });
    test("Case 1: convert button visible for a saved note",
         setup.convertVisible === true, JSON.stringify(setup));

    // Fire conversion (don't await — it awaits the confirm modal).
    await pg.evaluate(() => { window.v3NotesConvertExecute("grammar_rule"); });
    await pg.waitForFunction(() => {
      const m = document.getElementById("v3ConfirmModal");
      return m && m.style.display !== "none";
    }, null, { timeout: 6000 }).catch(() => {});

    const copy = await pg.evaluate(() => {
      const m = document.getElementById("v3ConfirmModal");
      return m ? m.textContent : "";
    });
    test("Case 2: convert confirm copy promises carry-forward (no blank)",
         /перенес|carried|יועבר/i.test(copy) && !/пустой|blank|ריק/i.test(copy),
         JSON.stringify({ copy: copy.slice(0, 160) }));

    await pg.evaluate(() => {
      const ok = document.getElementById("v3ConfirmOk");
      if (ok) ok.click();
    });
    await sleep(700);

    const after = await pg.evaluate(() => {
      const ta = document.getElementById("v3NotesText");
      const ed = document.getElementById("v3NotesEditor");
      const yBadge = document.getElementById("v3NotesLockedTypeBadge");
      const tpl = document.querySelector('.v3-notes-tpl[data-tpl="grammar_rule"]');
      return {
        taVal: ta ? ta.value : "(none)",
        edText: ed ? ed.textContent : "(none)",
        badge: yBadge ? yBadge.textContent : "",
        tplShown: !!(tpl && tpl.style.display !== "none"),
      };
    });
    test("Case 3: convert is NON-DESTRUCTIVE (body carried, not blanked)",
         /carry me forward/.test(after.taVal) && /carry me forward/.test(after.edText),
         JSON.stringify(after));
    test("Case 4: switch took effect (new type form shown + badge)",
         after.tplShown === true && after.badge && after.badge.trim().length > 0,
         JSON.stringify(after));

    test("Case 5: no pageerror",
         errs.length === 0, errs.join(" | "));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[type-switch-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[type-switch-smoke] fatal:", e); process.exit(1); });
