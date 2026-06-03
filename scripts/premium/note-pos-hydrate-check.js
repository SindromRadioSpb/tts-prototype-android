#!/usr/bin/env node
// Verifies the word_study note editor hydrates POS from a ②-style body_json
// that uses `pos` (not the form key `part_of_speech`) — the altKey fallback.
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3229;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const t = (n, c, e) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (e ? " — " + e : "")); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await new Promise(r => { const tm = setTimeout(() => r(), 4000); c.once("exit", () => { clearTimeout(tm); r(); }); }); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  const playwright = require("playwright");
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", e => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html?v=poshydrate", { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const r = await pg.evaluate(() => {
      if (typeof window.v3NotesTemplateHydrate !== "function" || typeof window.v3NotesSetNoteType !== "function") return { miss: true };
      window.v3NotesSetNoteType("word_study");           // sets type + renders the word_study form
      const posVal = () => { const e = document.getElementById("v3NotesTplWordStudyPos"); return e ? e.value : "(no el)"; };
      const rootVal = () => { const e = document.getElementById("v3NotesTplWordStudyRoot"); return e ? e.value : "(no el)"; };
      // ②-style body: uses `pos` (kmap key), NOT `part_of_speech` (form key)
      window.v3NotesTemplateHydrate({ word: "כותב", pos: "verb", root: "כתב", binyan: "paal", meaning: "писать" });
      const posVerb = posVal(), rootAfter = rootVal();
      window.v3NotesTemplateHydrate({ word: "את", pos: "pronoun", root: "", meaning: "(частица)" });
      const posPron = posVal();
      window.v3NotesTemplateHydrate({ word: "ספר", part_of_speech: "noun", root: "ספר", meaning: "книга" });
      const posCanon = posVal();
      return { posVerb, posPron, posCanon, rootAfter };
    });
    t("POS hydrates from ②-key `pos` (verb)", r.posVerb === "verb", JSON.stringify(r));
    t("POS hydrates from ②-key `pos` (pronoun = את case)", r.posPron === "pronoun", JSON.stringify(r));
    t("canonical key `part_of_speech` still hydrates (noun)", r.posCanon === "noun", JSON.stringify(r));
    t("no pageerror", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[note-pos-hydrate-check] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
