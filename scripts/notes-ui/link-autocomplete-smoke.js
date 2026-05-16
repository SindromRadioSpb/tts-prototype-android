#!/usr/bin/env node
// scripts/notes-ui/link-autocomplete-smoke.js — v3.4 C1.
//
// Pins the inline `[[` link-autocomplete contract (audit A-G1):
// opens the real note editor, stubs the read-only candidate methods,
// drives the picker via DOM events, and asserts the round-trip
// insert → session-map → collect() → save-hook addNoteLink.
//
// Cases:
//   1. window.NotesLinkAutocomplete API shape (attach/reset/collect).
//   2. Typing `[[Alph` opens the picker with the stubbed note option.
//   3. Enter inserts a visible `[[Alpha Note]]` token in the editor.
//   4. collect(markdown) resolves that token → {note, note-xyz}.
//   5. v3NotesSave materialises it via ldb.addNoteLink (the save-hook).
//   6. A `[[token]]` NOT chosen via the picker is ignored by collect()
//      (no phantom links) — and no pageerror anywhere.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3214;
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

// ── In-page: stub read-only candidate methods + open the editor ──────────────
const SETUP = async () => {
  for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
    const e = document.getElementById(id);
    if (e && e.parentNode) e.parentNode.removeChild(e);
  }
  if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
  window.__addNoteLinkCalls = [];
  // window.__localDB is a sealed ES-module namespace — property writes
  // no-op. Replace the whole reference with a plain stub (both the
  // module's db() and the host's ensureLocalDB() read window.__localDB
  // live; ensureLocalDB also requires isReady()).
  window.__localDBInitError = null;
  window.__localDB = {
    isReady: () => true,
    searchAllNotes: async (qstr) =>
      String(qstr || "").toLowerCase().startsWith("alph")
        ? [{ id: "note-xyz", title: "Alpha Note", body_json: "body" }]
        : [],
    listTexts: async () => [],
    searchRootsAutocomplete: async () => [],
    createNote: async () => ({ id: "host-note-1", updated_at: new Date().toISOString() }),
    updateNote: async () => ({ id: "host-note-1", updated_at: new Date().toISOString() }),
    addNoteLink: async (noteId, link) => {
      window.__addNoteLinkCalls.push({ noteId: String(noteId), link });
      return true;
    },
    listOutgoingLinks: async () => [],
    listBacklinks: async () => [],
  };
  if (typeof window.v3NotesOpen !== "function") throw new Error("v3NotesOpen missing");
  window.v3NotesOpen("", "", null, { entryKind: "free", targetKind: "free", noteType: "free" });
};

const API_SHAPE = () => {
  const a = window.NotesLinkAutocomplete;
  return !!a && typeof a.attach === "function" &&
         typeof a.reset === "function" && typeof a.collect === "function";
};

// Put `text` into the contenteditable editor as a single text node and
// place the caret at the end, then fire `input`.
const TYPE = (text) => {
  const ed = document.getElementById("v3NotesEditor");
  ed.focus();
  ed.textContent = text;
  const node = ed.firstChild;
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(node, text.length);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  ed.dispatchEvent(new InputEvent("input", { bubbles: true }));
};

const PICKER_VISIBLE = () => {
  const p = document.getElementById("v3NotesLinkAutocomplete");
  if (!p || p.style.display === "none") return { open: false };
  const opts = p.querySelectorAll('[role="option"]');
  return { open: true, count: opts.length, first: opts[0] ? opts[0].textContent : "" };
};

const PRESS_ENTER = () => {
  const ed = document.getElementById("v3NotesEditor");
  ed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
};

const EDITOR_TEXT = () => document.getElementById("v3NotesEditor").textContent;

const COLLECT = (md) => window.NotesLinkAutocomplete.collect(md);

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[link-autocomplete-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[link-autocomplete-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[link-autocomplete-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);

    const apiOk = await pg.evaluate(API_SHAPE);
    test("Case 1: NotesLinkAutocomplete API shape", apiOk);

    await pg.evaluate(SETUP);
    await sleep(150);

    await pg.evaluate(TYPE, "[[Alph");
    await sleep(400);
    const pick = await pg.evaluate(PICKER_VISIBLE);
    test("Case 2: typing `[[Alph` opens the picker with the note option",
         pick.open && pick.count >= 1 && /Alpha Note/.test(pick.first || ""),
         JSON.stringify(pick));

    await pg.evaluate(PRESS_ENTER);
    await sleep(150);
    const edText = await pg.evaluate(EDITOR_TEXT);
    test("Case 3: Enter inserts a visible `[[Alpha Note]]` token",
         /\[\[Alpha Note\]\]/.test(edText), JSON.stringify({ edText }));

    const collected = await pg.evaluate(COLLECT, edText);
    const c0 = (collected && collected[0]) || {};
    test("Case 4: collect() resolves the token → note/note-xyz",
         collected && collected.length === 1 &&
         c0.to_kind === "note" && c0.to_id === "note-xyz" &&
         c0.link_alias === "Alpha Note",
         JSON.stringify(collected));

    // Drive the real save path; the C1 hook should call addNoteLink.
    await pg.evaluate(async () => {
      try { await window.v3NotesSave(false); } catch (e) { /* surfaced via pageerror */ }
    });
    await sleep(400);
    const calls = await pg.evaluate(() => window.__addNoteLinkCalls || []);
    const hookOk = Array.isArray(calls) &&
      calls.some((c) => c.link && c.link.to_kind === "note" && c.link.to_id === "note-xyz");
    test("Case 5: v3NotesSave materialises the link via ldb.addNoteLink",
         hookOk, JSON.stringify(calls));

    // A token never chosen via the picker must NOT become a link.
    const phantom = await pg.evaluate(COLLECT, "see [[Totally Unknown Thing]] here");
    test("Case 6: un-picked `[[token]]` ignored by collect() + no pageerror",
         Array.isArray(phantom) && phantom.length === 0 && errs.length === 0,
         JSON.stringify({ phantom, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[link-autocomplete-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[link-autocomplete-smoke] fatal:", e); process.exit(1); });
