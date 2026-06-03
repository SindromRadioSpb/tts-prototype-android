#!/usr/bin/env node
// Verifies that opening a word_study note via a DEEP-LINK / backlink path
// (v3NotesOpen("","",null,{noteId}) — no sentence context) still self-heals the
// form fields to the FRESH corpus Dicta morphology (sentence_morph), instead of
// showing only the saved (possibly stale) body_json. Regression guard for the
// fix in v3NotesLoadFullNoteIntoModal (recover sentenceId from target_id +
// run v3MorphStoredResolve→v3MorphApplyResultToForm on every open path).
//
// Scenario: a note saved with a WRONG/stale POS=noun + root=שונות for עדיין,
// while sentence_morph says it's an adverb with no root. After a deep-link open
// the form POS must become "adverb" and the root must NOT remain "שונות".
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
    await pg.goto(BASE + "/index.html?v=dlselfheal", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => window.__localDB && window.__localDB.isReady && window.__localDB.isReady(), null, { timeout: 12000 }).catch(() => {});
    await sleep(800);

    const r = await pg.evaluate(async () => {
      const ldb = window.__localDB;
      const tk = "dl-" + Math.random().toString(36).slice(2, 8);
      // word note saved with a STALE/wrong analysis (noun + root שונות); the
      // sentence_morph says עדיין is an adverb (no root) → self-heal must win.
      const staleBody = JSON.stringify({ word: "עדיין", niqqud_variant: "עֲדַיִן", root: "שונות", pos: "noun", part_of_speech: "noun", binyan: "", meaning: "разное (устаревшее)" });
      const bundle = {
        manifest: { export_schema_version: 1, app_id: "linguist-pro-web" },
        library: { schema_version: 1, texts: [{ text_key: tk, text_id: "T1", title: "DL test", rows: [{ row_id: "S1", hebrew_plain: "עדיין", he_plain: "עדיין", order_index: 0 }] }], audio_assets: [] },
        texts: [{ text_key: tk, text_id: "T1", title: "DL test", rows: [{ row_id: "S1", hebrew_plain: "עדיין", he_plain: "עדיין", order_index: 0 }] }],
        notes_advanced: { schema_version: 1, versions: [], links: [], roots: [],
          notes: [{ id: "gen-T1-S1-0", target_kind: "word", target_id: "S1:0", text_id: "T1", note_type: "word_study", title: "עדיין", body_json: staleBody, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
          sentence_morph: [{ sentence_id: "S1", text_id: "T1", model_version: "dicta-morph-v2", provider: "dicta-morph",
            tokens: [{ word: "עדיין", posDicta: "adverb", binyan: null, lemma: "עדין", niqqud: "עֲדַיִן", prefix: null, stem: "עדין", kind: null }] }] },
      };
      const res = await ldb.importBundle(bundle, { mode: "skip" });
      // find the imported word note id + its remapped target_id
      const rows = await ldb.dbQuery("SELECT id, target_id, target_kind FROM notes_v2 WHERE note_type = 'word_study' AND target_kind = 'word' ORDER BY created_at DESC LIMIT 1");
      const noteId = rows && rows[0] ? String(rows[0].id) : null;
      const targetId = rows && rows[0] ? String(rows[0].target_id) : null;
      if (!noteId) return { err: "no imported word note", res: res && res.notes };

      // DEEP-LINK open: no sentence context (mirrors v3NotesLinksOpenBacklink).
      window.v3NotesOpen("", "", null, { noteId });

      // poll until the async load + self-heal updates the POS select (or timeout)
      const posEl = () => document.getElementById("v3NotesTplWordStudyPos");
      const rootEl = () => document.getElementById("v3NotesTplWordStudyRoot");
      let pos = "", root = "", healed = false;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 100));
        pos = posEl() ? String(posEl().value || "") : "";
        root = rootEl() ? String(rootEl().value || "") : "";
        if (pos === "adverb") { healed = true; break; }
      }
      return { noteId, targetId, pos, root, healed, importedWordOk: !!(res && res.notes && res.notes.inserted) };
    });

    t("imported word note found", !r.err && !!r.noteId, JSON.stringify(r));
    // composite target_id "<sid>:<offset>" is the recovery precondition; the POS
    // self-heal below can ONLY happen if the sid was recovered from it on deep-link.
    t("note has composite target_id <sid>:<offset>", !!r.targetId && /:\d+$/.test(r.targetId), JSON.stringify({ targetId: r.targetId }));
    t("POS self-healed noun→adverb on deep-link open", r.pos === "adverb", JSON.stringify({ pos: r.pos, healed: r.healed }));
    t("stale root 'שונות' replaced by fresh Dicta", r.root !== "שונות", JSON.stringify({ root: r.root }));
    t("no pageerror", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[note-deeplink-selfheal-check] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
