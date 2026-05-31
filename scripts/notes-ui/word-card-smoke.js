#!/usr/bin/env node
// scripts/notes-ui/word-card-smoke.js — v3.5 Slice 1.
//
// Pins the root-aware rich word card (read view in the row-index panel):
// the "root is the spine" premium concept built on the Slice 0 model fix.
//
// Cases:
//   1. Flag wordCardRich_v1 defaults ON (v3WordCardRichEnabled()===true).
//   2. word_study notes render as .v3-wordcard (one per row).
//   3. Headword is PLAIN consonantal (no niqqud marks); niqqud_variant is a
//      SEPARATE muted line — the Slice 0 model surfaced in the read view.
//   4. Root chip (amber brand atom) + POS pill render from body_json.
//   5. SRS state badge reuses the EXACT LEARN_STYLE palette — a 'weak'
//      overlay paints the badge #D55E00 (rgb(213,94,0)).
//   6. Pealim deep-link points at pealim.com (link only, never scrape) and
//      the Edit button escapes the mobile button{width:100%} trap.
//   7. Flag OFF → falls back to the generic .v3-notes-row-index-card.
//   8. i18n: the "words from this root" label is localized (not passthrough).
//   9. No pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3231;
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

// Two synthetic word_study rows: one niqqud noun (root, no binyan), one verb.
const SYNTH_ROWS = [
  { id: "wc-1", target_kind: "word", note_type: "word_study", updated_at: "2026-05-30T10:00:00Z",
    body_json: JSON.stringify({ word: "שלום", niqqud_variant: "שָׁלוֹם", root: "שלם", meaning: "мир", part_of_speech: "noun", binyan: "" }) },
  { id: "wc-2", target_kind: "word", note_type: "word_study", updated_at: "2026-05-29T09:00:00Z",
    body_json: JSON.stringify({ word: "כתב", niqqud_variant: "כָּתַב", root: "כתב", meaning: "писать", part_of_speech: "verb", binyan: "paal" }) },
];

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[word-card-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[word-card-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[word-card-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(700);

    // Stub the local DB so the SRS overlay is deterministic ('wc-1' weak).
    // Null the init error + settle the init promise so ensureLocalDB() returns
    // the stub (the real OPFS init may error under serviceWorkers:'block').
    await pg.evaluate(async () => {
      for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
        const e = document.getElementById(id); if (e && e.parentNode) e.parentNode.removeChild(e);
      }
      if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
      window.__localDBInitError = null;
      window.__localDBInitPromise = Promise.resolve();
      window.__localDB = {
        isReady: () => true,
        getLearningStateOverlay: async () => ({ "wc-1": "weak" }),
        listNotesForRow: async () => [],
      };
    });

    const flagDefault = await pg.evaluate(() => window.v3WordCardRichEnabled && window.v3WordCardRichEnabled());
    test("Case 1: wordCardRich_v1 defaults ON", flagDefault === true, JSON.stringify({ flagDefault }));

    // Render the rich cards through the real panel path.
    const r1 = await pg.evaluate(async (rows) => {
      window.v3NotesRowIndexOpen("t", "s", 0, rows);
      await new Promise((r) => setTimeout(r, 600));
      const list = document.getElementById("v3NotesRowIndexList");
      const cards = Array.from(list.querySelectorAll(".v3-wordcard"));
      const head0 = list.querySelector(".v3-wordcard-headword");
      const niq0 = list.querySelector(".v3-wordcard-niqqud");
      const root0 = list.querySelector(".v3-wordcard-rootchip");
      const pos0 = list.querySelector(".v3-wordcard-pos");
      const badge = list.querySelector('.v3-wordcard[data-note-id="wc-1"] .v3-wordcard-state');
      const badgeBg = badge ? getComputedStyle(badge).backgroundColor : "";
      const pealim = list.querySelector(".v3-wordcard-pealim");
      const edit = list.querySelector(".v3-wordcard-edit");
      const editW = edit ? getComputedStyle(edit).width : "";
      const formsLabel = list.querySelector(".v3-wordcard-acc-summary");
      return {
        count: cards.length,
        headword: head0 ? head0.textContent : "",
        niqqud: niq0 ? niq0.textContent : "",
        rootText: root0 ? root0.textContent.trim() : "",
        posText: pos0 ? pos0.textContent.trim() : "",
        badgeState: badge ? badge.getAttribute("data-state") : "",
        badgeBg,
        pealimHref: pealim ? pealim.getAttribute("href") : "",
        editWidth: editW,
        panelWidth: list.clientWidth,
        formsLabel: formsLabel ? formsLabel.textContent.trim() : "",
      };
    }, SYNTH_ROWS);

    test("Case 2: word_study → .v3-wordcard (one per row)", r1.count === 2, JSON.stringify(r1));

    const niqqudRe = /[֑-ׇ]/;
    test("Case 3: headword PLAIN, niqqud_variant separate",
         r1.headword === "שלום" && !niqqudRe.test(r1.headword) && niqqudRe.test(r1.niqqud),
         JSON.stringify({ headword: r1.headword, niqqud: r1.niqqud }));

    test("Case 4: root chip + POS pill render",
         r1.rootText.includes("שלם") && r1.posText.length > 0,
         JSON.stringify({ root: r1.rootText, pos: r1.posText }));

    test("Case 5: state badge reuses LEARN_STYLE 'weak' (#D55E00)",
         r1.badgeState === "weak" && r1.badgeBg.replace(/\s/g, "") === "rgb(213,94,0)",
         JSON.stringify({ state: r1.badgeState, bg: r1.badgeBg }));

    test("Case 6: Pealim deep-link + Edit escapes width:100% trap",
         /pealim\.com/.test(r1.pealimHref) &&
         r1.editWidth && r1.panelWidth && parseFloat(r1.editWidth) < r1.panelWidth * 0.9,
         JSON.stringify({ href: r1.pealimHref, editWidth: r1.editWidth, panel: r1.panelWidth }));

    test("Case 8: 'words from root' label localized (not passthrough)",
         r1.formsLabel.length > 0 && r1.formsLabel !== "notes.card.wordsFromRoot",
         JSON.stringify({ label: r1.formsLabel }));

    // Phase A — spine self-heal: notes saved WITHOUT a root resolve their
    // spine against the (auto-promoted) full dict — a true root when
    // available, else the LEMMA (base form), never empty. Loads the full
    // dict, so a generous wait.
    const r3 = await pg.evaluate(async () => {
      try { localStorage.removeItem("morphDictTier_v1"); } catch (_) {}
      const rows = [
        { id: "sh-root", target_kind: "word", note_type: "word_study", updated_at: "2026-05-30T10:00:00Z",
          body_json: JSON.stringify({ word: "תלמד", niqqud_variant: "", root: "", meaning: "будешь учить", part_of_speech: "verb", binyan: "" }) },
        { id: "sh-lemma", target_kind: "word", note_type: "word_study", updated_at: "2026-05-29T10:00:00Z",
          body_json: JSON.stringify({ word: "תסתכלי", niqqud_variant: "", root: "", meaning: "посмотришь", part_of_speech: "verb", binyan: "" }) },
        { id: "sh-prefix", target_kind: "word", note_type: "word_study", updated_at: "2026-05-28T10:00:00Z",
          body_json: JSON.stringify({ word: "ובורחת", niqqud_variant: "", root: "", meaning: "и убегает", part_of_speech: "verb", binyan: "" }) },
      ];
      window.v3NotesRowIndexOpen("t", "s", 0, rows);
      // Wait for full-dict promotion + spine resolve.
      const deadline = Date.now() + 14000;
      const list = document.getElementById("v3NotesRowIndexList");
      while (Date.now() < deadline) {
        const pend = list.querySelectorAll(".v3-wordcard-rootchip-pending").length;
        if (pend === 0) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      const chip = (id) => list.querySelector(`.v3-wordcard[data-note-id="${id}"] .v3-wordcard-rootchip`);
      const cRoot = chip("sh-root"), cLemma = chip("sh-lemma"), cPrefix = chip("sh-prefix");
      return {
        tier: window.MorphProvider.getDictTier(),
        rootText: cRoot ? cRoot.textContent.trim().replace(/\s+/g, " ") : "",
        rootIsLemma: cRoot ? cRoot.classList.contains("v3-wordcard-rootchip-lemma") : null,
        lemmaText: cLemma ? cLemma.textContent.trim().replace(/\s+/g, " ") : "",
        lemmaIsLemma: cLemma ? cLemma.classList.contains("v3-wordcard-rootchip-lemma") : null,
        prefixText: cPrefix ? cPrefix.textContent.trim().replace(/\s+/g, " ") : "",
        prefixIsLemma: cPrefix ? cPrefix.classList.contains("v3-wordcard-rootchip-lemma") : null,
        anyPending: list.querySelectorAll(".v3-wordcard-rootchip-pending").length,
      };
    });
    test("Case 8b: word path auto-promotes to the full dict",
         r3.tier === "full", JSON.stringify({ tier: r3.tier }));
    test("Case 8c: resolvable form self-heals to a SOLID root chip",
         r3.rootIsLemma === false && /למד/.test(r3.rootText), JSON.stringify(r3));
    test("Case 8d: null-root form falls back to a LEMMA (base form) chip, never empty",
         r3.lemmaIsLemma === true && /הסתכל/.test(r3.lemmaText) && r3.anyPending === 0,
         JSON.stringify(r3));
    test("Case 8e: prefixed form (ובורחת) self-heals to its root via prefix segmentation",
         r3.prefixIsLemma === false && /ברח/.test(r3.prefixText), JSON.stringify(r3));

    // Flag OFF → generic card fallback.
    const r2 = await pg.evaluate(async (rows) => {
      try { localStorage.setItem("wordCardRich_v1", "0"); } catch (_) {}
      window.v3NotesRowIndexOpen("t", "s", 0, rows);
      await new Promise((r) => setTimeout(r, 200));
      const list = document.getElementById("v3NotesRowIndexList");
      return {
        rich: list.querySelectorAll(".v3-wordcard").length,
        generic: list.querySelectorAll(".v3-notes-row-index-card").length,
      };
    }, SYNTH_ROWS);
    test("Case 7: flag OFF → generic .v3-notes-row-index-card fallback",
         r2.rich === 0 && r2.generic === 2, JSON.stringify(r2));

    test("Case 9: no pageerror", errs.length === 0, errs.join(" | "));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[word-card-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
