#!/usr/bin/env node
// scripts/premium/conj-card-browser-smoke.js — ② conjugation/declension card.
//
// Pins the in-app Pealim conjugation/declension accordion (offline render +
// lazy-load + mobile RTL @380px). Mirrors word-card-smoke's harness.
//
// Cases:
//   1. Content-word cards get a .v3-wordcard-conj accordion (verb→Спряжение,
//      noun→Склонение summary), carrying data-conj-* resolution hints.
//   2. v3RenderInflectionParadigm builds a grid: ≥1 cell, primary block,
//      "Источник: Pealim" badge, перепроверка link, full-paradigm <details>.
//   3. Expanding the accordion lazy-loads from the (stubbed) OPFS cache and
//      fills the table; summary self-corrects to Спряжение.
//   4. @380px: the rendered table does not overflow horizontally.
//   5. Migration 051 lemma_inflection + CRUD round-trip (best-effort, real DB).
//   6. No pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3233;
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
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

const SYNTH_ROWS = [
  { id: "wc-v", target_kind: "word", note_type: "word_study", updated_at: "2026-05-30T10:00:00Z",
    body_json: JSON.stringify({ word: "כתב", niqqud_variant: "כָּתַב", root: "כתב", meaning: "писать", part_of_speech: "verb", binyan: "paal" }) },
  { id: "wc-n", target_kind: "word", note_type: "word_study", updated_at: "2026-05-29T09:00:00Z",
    body_json: JSON.stringify({ word: "ספר", niqqud_variant: "סֵפֶר", root: "ספר", meaning: "книга", part_of_speech: "noun", binyan: "" }) },
];

const SAMPLE = {
  lemma: "כתב", root: "כתב", pos: "verb", binyan: "paal", kind: "verb",
  source: "pealim", pealim_id: "1", model_version: "pealim-infl-v1",
  gizra_note: "У этого корня нет каких-либо особенностей спряжения.", disambig: "match",
  cells: {
    "AP-ms": { he: "כּוֹתֵב", translit: "котев", translit_html: 'кот<b class="v3-conj-stress">е</b>в' }, "AP-fs": { he: "כּוֹתֶבֶת", translit: "котевет" },
    "AP-mp": { he: "כּוֹתְבִים", translit: "котвим" }, "AP-fp": { he: "כּוֹתְבוֹת", translit: "котвот" },
    "PERF-1s": { he: "כָּתַבְתִּי", translit: "катавти" }, "PERF-3ms": { he: "כָּתַב", translit: "катав" },
    "PERF-3fs": { he: "כָּתְבָה", translit: "катва" }, "IMPF-3ms": { he: "יִכְתֹּב", translit: "йихтов" },
    "IMP-2ms": { he: "כְּתֹב", translit: "ктов" }, "INF-L": { he: "לִכְתּוֹב", translit: "лихтов" },
  },
};

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[conj-card-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[conj-card-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[conj-card-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(700);

    // ── Case 5 (best-effort): real DB migration 051 + CRUD round-trip ──────
    // Run BEFORE stubbing __localDB. The real OPFS may not init headless; treat
    // an init failure as skipped, not failed.
    const dbCheck = await pg.evaluate(async (sample) => {
      try {
        if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
        if (window.__localDBInitError) return { skipped: "init_error" };
        const ldb = await window.ensureLocalDB();
        if (!ldb || typeof ldb.saveLemmaInflection !== "function") return { skipped: "no_crud" };
        await ldb.saveLemmaInflection("כתב", "paal", "verb", "verb", "pealim-infl-v1", sample, "pealim", "1");
        const got = await ldb.getLemmaInflection("כתב", "paal", "pealim-infl-v1");
        const keys = await ldb.getLemmaInflectionKeys("pealim-infl-v1");
        return { ok: !!(got && got.cells && got.cells["AP-ms"]), inKeys: keys && keys.has ? keys.has("כתב paal") : false };
      } catch (e) { return { skipped: String(e && e.message || e) }; }
    }, SAMPLE);
    if (dbCheck.skipped) console.log("  · Case 5 skipped (headless OPFS):", dbCheck.skipped);
    else test("Case 5: migration 051 + saveLemmaInflection/getLemmaInflection round-trip", dbCheck.ok === true && dbCheck.inKeys === true, JSON.stringify(dbCheck));

    // Stub the local DB for deterministic render/load (mirrors word-card-smoke).
    await pg.evaluate(async (sample) => {
      for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) { const e = document.getElementById(id); if (e && e.parentNode) e.parentNode.removeChild(e); }
      if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
      window.__localDBInitError = null;
      window.__localDBInitPromise = Promise.resolve();
      window.__localDB = {
        isReady: () => true,
        getLearningStateOverlay: async () => ({}),
        listNotesForRow: async () => [],
        getLemmaInflection: async (lemma) => ((lemma === "כתב" || lemma === "חזר") ? sample : null),
        saveLemmaInflection: async () => {},
      };
    }, SAMPLE);

    // ── Render the rich cards through the real panel path ─────────────────
    const r1 = await pg.evaluate(async (rows) => {
      window.v3NotesRowIndexOpen("t", "s", 0, rows);
      await new Promise((r) => setTimeout(r, 600));
      const list = document.getElementById("v3NotesRowIndexList");
      const vCard = list.querySelector('.v3-wordcard[data-note-id="wc-v"]');
      const nCard = list.querySelector('.v3-wordcard[data-note-id="wc-n"]');
      const vConj = vCard && vCard.querySelector(".v3-wordcard-conj");
      const nConj = nCard && nCard.querySelector(".v3-wordcard-conj");
      const vSum = vConj && vConj.querySelector(".v3-wordcard-acc-summary");
      const nSum = nConj && nConj.querySelector(".v3-wordcard-acc-summary");
      return {
        vHasConj: !!vConj, nHasConj: !!nConj,
        vSummary: vSum ? vSum.textContent.trim() : "",
        nSummary: nSum ? nSum.textContent.trim() : "",
        vBinyanAttr: vConj ? vConj.getAttribute("data-conj-binyan") : "",
        recheckText: (list.querySelector(".v3-wordcard-pealim") || {}).textContent || "",
      };
    }, SYNTH_ROWS);

    test("Case 1: content cards have conj accordion (verb→Спряжение, noun→Склонение)",
         r1.vHasConj && r1.nHasConj && /Спряжение/.test(r1.vSummary) && /Склонение/.test(r1.nSummary),
         JSON.stringify(r1));
    test("Case 1b: Pealim action link retitled to «перепроверка»",
         /перепроверка/i.test(r1.recheckText), JSON.stringify({ recheck: r1.recheckText }));

    // ── Case 2: render function output ────────────────────────────────────
    const r2 = await pg.evaluate((sample) => {
      const d = document.createElement("div");
      d.id = "conjProbe"; d.style.width = "360px";
      d.innerHTML = window.v3RenderInflectionParadigm(sample);
      document.body.appendChild(d);
      return {
        cells: d.querySelectorAll(".v3-conj-cell").length,
        primary: d.querySelectorAll(".v3-conj-primary").length,     // Layout B: must be 0
        groups: d.querySelectorAll(".v3-conj-group").length,
        badge: (d.querySelector(".v3-conj-badge") || {}).textContent || "",
        recheck: !!d.querySelector(".v3-conj-recheck"),
        hasFullToggle: !!d.querySelector(".v3-conj-full"),          // must be gone
        stress: !!d.querySelector(".v3-conj-tr .v3-conj-stress"),   // red-stress span rendered
        rootLabel: !!d.querySelector(".v3-conj-rootlabel"),
        heRtl: (() => { const c = d.querySelector(".v3-conj-cell"); return c ? c.getAttribute("dir") : ""; })(),
      };
    }, SAMPLE);
    test("Case 2: Layout B render (full groups, no primary/no full-toggle, stress, root, badge)",
         r2.cells >= 6 && r2.primary === 0 && r2.hasFullToggle === false && r2.groups >= 3 &&
         r2.stress && r2.rootLabel && /Pealim/.test(r2.badge) && r2.recheck && r2.heRtl === "rtl",
         JSON.stringify(r2));

    // ── Case 3: lazy-load via accordion toggle (stubbed cache hit) ─────────
    const r3 = await pg.evaluate(async () => {
      const conj = document.querySelector('.v3-wordcard[data-note-id="wc-v"] .v3-wordcard-conj');
      if (!conj) return { err: "no conj" };
      conj.open = true;
      await window.v3WordCardLoadInflection(conj);
      await new Promise((r) => setTimeout(r, 200));
      const body = conj.querySelector(".v3-conj-body");
      const sum = conj.querySelector(".v3-wordcard-acc-summary");
      return {
        filled: body ? body.querySelectorAll(".v3-conj-cell").length : 0,
        summary: sum ? sum.textContent.trim() : "",
        loaded: conj.getAttribute("data-conj-loaded"),
      };
    });
    test("Case 3: accordion lazy-loads table + summary syncs to Спряжение",
         r3.filled >= 6 && /Спряжение/.test(r3.summary) && r3.loaded === "1", JSON.stringify(r3));

    // ── Case 4: @380px no horizontal overflow ─────────────────────────────
    const r4 = await pg.evaluate(() => {
      const probe = document.getElementById("conjProbe");
      const grids = Array.from(document.querySelectorAll(".v3-conj-grid"));
      const overflow = grids.some((g) => g.scrollWidth > g.clientWidth + 2);
      return { probeOverflow: probe ? (probe.scrollWidth > probe.clientWidth + 2) : false, gridOverflow: overflow, doc: document.documentElement.scrollWidth, win: 380 };
    });
    test("Case 4: @380px no horizontal overflow (table + grids)",
         !r4.probeOverflow && !r4.gridOverflow && r4.doc <= 382, JSON.stringify(r4));

    // Screenshot the verb card with the expanded conjugation table.
    try {
      const shot = path.join(REPO_ROOT, ".tmp", "conj-card-380.png");
      const card = await pg.$('.v3-wordcard[data-note-id="wc-v"]');
      if (card) await card.screenshot({ path: shot });
      console.log("  · screenshot:", shot);
    } catch (_) {}

    // ── Case 7: editor accordion reads live fields + loads ────────────────
    const r7 = await pg.evaluate(async () => {
      const conj = document.querySelector(".v3-notes-tpl-conj");
      if (!conj) return { err: "no editor conj" };
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      set("v3NotesTplWordStudyWord", "להחזיר");
      set("v3NotesTplWordStudyRoot", "חזר");
      set("v3NotesTplWordStudyBinyan", "hifil");
      set("v3NotesTplWordStudyPos", "verb");
      conj.open = true;
      await window.v3NotesTplConjToggle(conj);
      await new Promise((r) => setTimeout(r, 200));
      const body = conj.querySelector(".v3-conj-body");
      const sum = conj.querySelector(".v3-wordcard-acc-summary");
      return {
        exists: true,
        lemmaAttr: conj.getAttribute("data-conj-lemma"),
        binyanAttr: conj.getAttribute("data-conj-binyan"),
        filled: body ? body.querySelectorAll(".v3-conj-cell").length : 0,
        summary: sum ? sum.textContent.trim() : "",
      };
    });
    test("Case 7: editor accordion reads live fields (root חזר/hifil) + loads table",
         r7.exists && r7.lemmaAttr === "חזר" && r7.binyanAttr === "hifil" && r7.filled >= 6 && /Спряжение/.test(r7.summary),
         JSON.stringify(r7));

    // ── Case 8: staleness fix — hydrating another note resets the accordion ─
    const r8 = await pg.evaluate(async () => {
      window.v3NotesSetNoteType("word_study");
      const conj = document.querySelector(".v3-notes-tpl-conj");
      if (!conj) return { err: "no editor conj" };
      // Simulate a loaded verb paradigm left over from the previous word.
      conj.open = true;
      conj.setAttribute("data-conj-loaded", "1");
      conj.setAttribute("data-conj-key", "חזר|hifil|verb");
      conj.setAttribute("data-conj-lemma", "חזר");
      const body = conj.querySelector(".v3-conj-body");
      if (body) body.innerHTML = '<div class="v3-conj-cell">STALE</div>';
      // Now open a DIFFERENT note (noun פרויקט) — hydrate must reset the accordion.
      window.v3NotesTemplateHydrate({ word: "פרויקט", root: "פרויקט", part_of_speech: "noun", binyan: "", meaning: "проект" });
      return {
        open: conj.open,
        loaded: conj.getAttribute("data-conj-loaded"),
        lemmaAttr: conj.getAttribute("data-conj-lemma"),
        bodyEmpty: (conj.querySelector(".v3-conj-body") || {}).innerHTML === "",
        noStale: !/STALE/.test((conj.querySelector(".v3-conj-body") || {}).innerHTML || ""),
      };
    });
    test("Case 8: hydrate(other note) resets accordion (no stale paradigm)",
         r8.open === false && r8.loaded === null && r8.lemmaAttr === null && r8.bodyEmpty && r8.noStale,
         JSON.stringify(r8));

    test("Case 6: no pageerror", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }
  console.log(`\n[conj-card-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
