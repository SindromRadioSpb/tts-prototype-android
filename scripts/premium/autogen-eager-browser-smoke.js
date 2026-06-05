#!/usr/bin/env node
"use strict";

// autogen-eager-browser-smoke.js — Stage 3 (Concept A) regression smoke.
//
// Covers the eager auto-build core WITHOUT seeding sentence_morph:
//   • setting round-trip (v3NotesSetAutogenMode / v3NotesAutogenMode, invalid→off)
//   • partition decision (v3NotesAutoBuildClassify) across the full matrix:
//       known→auto; new-ok-i+1→auto(both); new-ok-newroot→aggressive:auto/conservative:pending;
//       low-confidence(review)→pending(both) — R1 «never silently persisted»
//   • source='auto' persist round-trip + provenance badge (v3NotesRowIndexProvBadge):
//       source=auto,user_touched=0 → «✨ авто»; user_touched=1 → «✍ ваше» (no badge)
//
// Headless OPFS init is best-effort — if it can't initialize, DB cases are SKIPPED.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3237;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
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

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[autogen-eager-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[autogen-eager-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[autogen-eager-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      // ── setting round-trip ─────────────────────────────────────────────
      window.v3NotesSetAutogenMode("aggressive");
      out.setAggr = window.v3NotesAutogenMode() === "aggressive";
      window.v3NotesSetAutogenMode("conservative");
      out.setCons = window.v3NotesAutogenMode() === "conservative";
      window.v3NotesSetAutogenMode("garbage");
      out.setInvalid = window.v3NotesAutogenMode() === "off";   // invalid → off

      // ── partition matrix (pure decision) ───────────────────────────────
      const C = window.v3NotesAutoBuildClassify;
      const ok = { status: "ok" }, review = { status: "review" };
      out.knownAuto = C(ok, { known: true, i1: false, mode: "conservative" }) === "auto"
        && C(review, { known: true, i1: false, mode: "conservative" }) === "auto";       // known always auto (occ)
      out.i1BothAuto = C(ok, { known: false, i1: true, mode: "conservative" }) === "auto"
        && C(ok, { known: false, i1: true, mode: "aggressive" }) === "auto";              // new+ok+i+1 → auto both
      out.newRootCons = C(ok, { known: false, i1: false, mode: "conservative" }) === "pending"; // new root → review (cons)
      out.newRootAggr = C(ok, { known: false, i1: false, mode: "aggressive" }) === "auto";       // new root → auto (aggr)
      out.reviewPending = C(review, { known: false, i1: true, mode: "aggressive" }) === "pending"
        && C(review, { known: false, i1: false, mode: "conservative" }) === "pending";   // low-conf NEVER auto

      // ── source='auto' persist + provenance badge ───────────────────────
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.createCanonicalNote === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((r) => setTimeout(r, 500));
      }
      if (ldb) {
        const n = await ldb.createCanonicalNote({
          gen_dedup_key: "pid:EAGER1", source: "auto", confidence: 0.9, model_version: "v", user_touched: 0,
          title: "מבחן", body: { word: "מבחן", root: "בחן", lemma: "מבחן", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "экзамен", pealim_id: "EAGER1" },
        });
        const row = await ldb.getNoteById(n.id);
        out.autoPersisted = row && String(row.source) === "auto" && Number(row.user_touched) === 0;
        // provenance badge
        const PB = window.v3NotesRowIndexProvBadge;
        out.badgeAuto = /✨/.test(PB({ source: "auto", user_touched: 0 }));
        out.badgeUserNone = PB({ source: "auto", user_touched: 1 }) === "" && PB({ source: "user", user_touched: 0 }) === "";

        // R1 invariant — a user BODY edit flips user_touched=1 (→ badge gone) and
        // is then sacrosanct under regeneration.
        const editedBody = Object.assign({}, JSON.parse(row.body_json), { meaning: "МОЙ перевод" });
        await ldb.updateNote(n.id, { body: editedBody, note_type: "word_study" });
        const afterEdit = await ldb.getNoteById(n.id);
        out.editFlips = Number(afterEdit.user_touched) === 1
          && JSON.parse(afterEdit.body_json).meaning === "МОЙ перевод"
          && PB(afterEdit) === "";                                   // badge gone (now «ваше»)
        // metadata-only update must NOT flip a still-auto note
        const n2 = await ldb.createCanonicalNote({ gen_dedup_key: "pid:EAGER2", source: "auto", confidence: 0.9, model_version: "v", user_touched: 0, title: "y", body: { word: "ספר", root: "ספר", lemma: "ספר", pos: "noun", part_of_speech: "noun", meaning: "книга", pealim_id: "EAGER2" } });
        await ldb.updateNote(n2.id, { audio_anchor_ms: 1234 });
        out.metaNoFlip = Number((await ldb.getNoteById(n2.id)).user_touched) === 0;
        // regeneration after the edit must NOT clobber the user's meaning
        await window.v3NotesAutoGenPersist([{ dedup_key: "pid:EAGER1", confidence: 0.95, occurrences: [], body: Object.assign({}, editedBody, { meaning: "ENGINE перевод" }) }], { source: "auto" });
        out.editSurvives = JSON.parse((await ldb.getNoteById(n.id)).body_json).meaning === "МОЙ перевод";
      } else out.dbSkipped = true;

      // ── symmetric section render (DOM, no DB needed) ───────────────────
      const list = document.getElementById("v3NotesRowIndexList");
      if (list && typeof window.v3NotesRowIndexRender === "function") {
        const mk = (o) => Object.assign({ target_kind: "word", note_type: "free", title: "t", body_json: JSON.stringify({ markdown: "x" }), updated_at: new Date(0).toISOString(), confidence: null }, o);
        // both groups: 2 user (incl. an edited auto) + 4 auto
        window.v3NotesRowIndexRender([
          mk({ id: "u1", source: "user", user_touched: 1 }), mk({ id: "u2", source: "auto", user_touched: 1 }),
          mk({ id: "a1", source: "auto", user_touched: 0 }), mk({ id: "a2", source: "auto", user_touched: 0 }),
          mk({ id: "a3", source: "curated", user_touched: 0 }), mk({ id: "a4", source: "auto", user_touched: 0 }),
        ]);
        const secs = list.querySelectorAll(".v3-notes-rowidx-section");
        const lists = list.querySelectorAll(".v3-notes-rowidx-section-list");
        out.secBoth = secs.length === 2;
        out.yoursOpen = !!lists[0] && lists[0].style.display !== "none" && lists[0].children.length === 2;
        out.autoCollapsed = !!lists[1] && lists[1].style.display === "none" && lists[1].children.length === 4;
        const cnt = document.getElementById("v3NotesRowIndexCount");
        out.headerBreakdown = !!cnt && /✍2/.test(cnt.textContent) && /✨4/.test(cnt.textContent);
        window.v3NotesRowIndexToggleSection(secs[1].querySelector(".v3-notes-rowidx-section-toggle"));
        out.toggleExpands = lists[1].style.display !== "none";
        // user-only → flat (0 sections)
        window.v3NotesRowIndexRender([mk({ id: "u1", source: "user", user_touched: 1 })]);
        out.userOnlyFlat = list.querySelectorAll(".v3-notes-rowidx-section").length === 0 && list.children.length === 1;
        // auto-only small (3) → 1 section, expanded
        window.v3NotesRowIndexRender([mk({ id: "a1", source: "auto", user_touched: 0 }), mk({ id: "a2", source: "auto", user_touched: 0 }), mk({ id: "a3", source: "auto", user_touched: 0 })]);
        const s2 = list.querySelectorAll(".v3-notes-rowidx-section");
        const l2 = list.querySelector(".v3-notes-rowidx-section-list");
        out.autoOnlyOneOpen = s2.length === 1 && !!l2 && l2.style.display !== "none" && l2.children.length === 3;
      } else out.renderSkipped = true;
      return out;
    });

    test("setting round-trip: aggressive/conservative persist", R.setAggr && R.setCons);
    test("setting: invalid value → off", R.setInvalid === true);
    test("partition: known sense → auto (occurrence)", R.knownAuto === true);
    test("partition: new ok + i+1 → auto (both modes)", R.i1BothAuto === true);
    test("partition: new ok + new root → pending (conservative)", R.newRootCons === true);
    test("partition: new ok + new root → auto (aggressive)", R.newRootAggr === true);
    test("partition: low-confidence → pending (never silent, both modes)", R.reviewPending === true);
    if (R.dbSkipped) console.log("  · DB cases skipped (headless OPFS)");
    else {
      test("persist source='auto' round-trip", R.autoPersisted === true);
      test("provenance badge «✨ авто» for auto+untouched", R.badgeAuto === true);
      test("provenance badge empty for user / user_touched=1", R.badgeUserNone === true);
      test("R1: user body edit flips user_touched=1 + badge gone", R.editFlips === true);
      test("metadata-only update does NOT flip user_touched", R.metaNoFlip === true);
      test("R1: edited meaning survives regeneration (not clobbered)", R.editSurvives === true);
    }
    if (R.renderSkipped) console.log("  · section-render skipped (no list element)");
    else {
      test("sections: both groups → 2 symmetric sections", R.secBoth === true);
      test("sections: «Ваши» expanded, 2 cards", R.yoursOpen === true);
      test("sections: «Авто» (4>3) collapsed, count visible", R.autoCollapsed === true);
      test("sections: header breakdown «✍2 · ✨4»", R.headerBreakdown === true);
      test("sections: tapping «Авто» header expands it", R.toggleExpands === true);
      test("sections: user-only → flat (no section chrome)", R.userOnlyFlat === true);
      test("sections: auto-only (≤3) → one expanded section", R.autoOnlyOneOpen === true);
    }
    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[autogen-eager-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
