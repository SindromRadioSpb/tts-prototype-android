#!/usr/bin/env node
// note-trueroot-table-check.js — Phase 5-R1 regression gate.
//
// The word card's spine chip shows the TRUE triliteral root (R1), but the
// conjugation/declension table is keyed by the LEMMA (dictionary form), NOT the
// root (the offline table for מילים resolves via lemma מילה, never root מלל; the
// adjective רחוקה via lemma רחוק, never root רחק). These two are stored in SEPARATE
// body_json fields (`root` and `lemma`) and the card must wire them to the right
// places — else changing root to the true root silently breaks the table lookup
// (data-conj-lemma) for ~2.4K notes.
//
// This check renders v3WordCardRichHtml for cases where root ≠ lemma and asserts:
//   • data-conj-lemma === the LEMMA field  (table query stays correct)
//   • the spine chip shows the TRUE ROOT   (R1 honesty)
//   • an empty root falls back to a pending self-heal chip (no dead-end)
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3231;
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
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", e => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html?v=trueroot", { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const r = await pg.evaluate(() => {
      if (typeof window.v3WordCardRichHtml !== "function") return { miss: true };
      const render = (body) => window.v3WordCardRichHtml({ id: "t", body_json: JSON.stringify(body) });
      const attr = (html, name) => { const m = html.match(new RegExp(name + '="([^"]*)"')); return m ? m[1] : null; };
      // adjective: root רחק (true) ≠ lemma רחוק (dictionary)
      const adj = render({ word: "רחוקה", niqqud_variant: "רְחוֹקָה", root: "רחק", lemma: "רחוק", pos: "adjective", part_of_speech: "adjective", meaning: "далёкая" });
      // participle-noun: root כתב (true) ≠ lemma כותב (dictionary)
      const noun = render({ word: "כותב", niqqud_variant: "כּוֹתֵב", root: "כתב", lemma: "כותב", pos: "noun", part_of_speech: "noun", meaning: "писатель" });
      // verb ל״ה: root עשה (true) ≠ lemma עשי (Dicta) — query must stay on lemma (legacy behaviour)
      const verb = render({ word: "לעשות", niqqud_variant: "לַעֲשׂוֹת", root: "עשה", lemma: "עשי", pos: "verb", part_of_speech: "verb", binyan: "paal", meaning: "делать" });
      // loanword noun: empty root → pending self-heal chip (no dead-end)
      const loan = render({ word: "פנתר", niqqud_variant: "פַּנְתֵר", root: "", lemma: "פנתר", pos: "noun", part_of_speech: "noun", meaning: "пантера" });
      return {
        adjLemma: attr(adj, "data-conj-lemma"), adjRootAttr: attr(adj, "data-conj-root"), adjChipRoot: /🌳 רחק/.test(adj),
        nounLemma: attr(noun, "data-conj-lemma"), nounChipRoot: /🌳 כתב/.test(noun),
        verbLemma: attr(verb, "data-conj-lemma"), verbChipRoot: /🌳 עשה/.test(verb),
        loanPending: /v3-wordcard-rootchip-pending/.test(loan),
      };
    });
    if (r.miss) { t("v3WordCardRichHtml exposed", false, "window.v3WordCardRichHtml missing"); }
    else {
      t("adjective table query uses LEMMA (רחוק), not root (רחק)", r.adjLemma === "רחוק", "data-conj-lemma=" + r.adjLemma);
      t("adjective chip shows TRUE ROOT (רחק)", r.adjChipRoot, JSON.stringify(r));
      t("adjective data-conj-root carries true root (רחק)", r.adjRootAttr === "רחק", "data-conj-root=" + r.adjRootAttr);
      t("participle-noun table query uses LEMMA (כותב), not root (כתב)", r.nounLemma === "כותב", "data-conj-lemma=" + r.nounLemma);
      t("participle-noun chip shows TRUE ROOT (כתב)", r.nounChipRoot, JSON.stringify(r));
      t("verb table query stays on LEMMA (עשי), chip shows true root (עשה)", r.verbLemma === "עשי" && r.verbChipRoot, JSON.stringify(r));
      t("empty root → pending self-heal chip (no dead-end)", r.loanPending, JSON.stringify(r));
    }
    t("no pageerror", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[note-trueroot-table-check] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
