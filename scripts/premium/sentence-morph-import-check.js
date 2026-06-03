#!/usr/bin/env node
// Verifies bundle sentence_morph round-trips through importBundle (remap of
// text_id + sentence_id → saveSentenceMorph) and resolves offline via
// v3MorphStoredResolve — i.e. the word_study editor will auto-fill POS/root-hint
// for an imported library WITHOUT a live Dicta call. Loads the real app page.
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3230;
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
    await pg.goto(BASE + "/index.html?v=smimport", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => window.__localDB && window.__localDB.isReady && window.__localDB.isReady(), null, { timeout: 12000 }).catch(() => {});
    await sleep(800);
    const r = await pg.evaluate(async () => {
      const ldb = window.__localDB;
      const tk = "smtest-" + Math.random().toString(36).slice(2, 8);
      const bundle = {
        manifest: { export_schema_version: 1, app_id: "linguist-pro-web" },
        library: { schema_version: 1, texts: [{ text_key: tk, text_id: "T1", title: "SM test", rows: [{ row_id: "S1", hebrew_plain: "את מלכה אבל עדיין", he_plain: "את מלכה אבל עדיין", order_index: 0 }] }], audio_assets: [] },
        texts: [{ text_key: tk, text_id: "T1", title: "SM test", rows: [{ row_id: "S1", hebrew_plain: "את מלכה אבל עדיין", he_plain: "את מלכה אבל עדיין", order_index: 0 }] }],
        notes_advanced: { schema_version: 1, notes: [], versions: [], links: [], roots: [],
          sentence_morph: [{ sentence_id: "S1", text_id: "T1", model_version: "dicta-morph-v2", provider: "dicta-morph",
            tokens: [{ word: "את", posDicta: "pronoun", binyan: null, lemma: "אני", niqqud: "אַתְּ", prefix: null, stem: "את", kind: null }] }] },
      };
      const res = await ldb.importBundle(bundle, { mode: "skip" });
      const adv = res && res.notes_advanced;
      const newTid = (res.importedIds && res.importedIds[0]) || null;
      let smForText = {}; try { smForText = await ldb.getSentenceMorphForText(newTid); } catch (e) { smForText = { err: String(e) }; }
      const newSid = Object.keys(smForText).find((k) => k !== "err") || null;
      // resolve like the editor: v3MorphStoredResolve(word, sentenceId)
      let resolved = null;
      if (newSid && typeof window.v3MorphStoredResolve === "function") {
        try { resolved = await window.v3MorphStoredResolve("את", newSid); } catch (e) { resolved = { err: String(e) }; }
      }
      return { advSm: adv && adv.sentence_morph, newTid, newSid, smCount: Object.keys(smForText).filter(k => k !== "err").length, resolved };
    });
    t("importBundle applied sentence_morph (inserted 1)", r.advSm && r.advSm.inserted === 1, JSON.stringify(r.advSm));
    t("sentence_morph stored under remapped (new) sentence id", !!r.newSid && r.smCount === 1, JSON.stringify({ newTid: r.newTid, newSid: r.newSid, smCount: r.smCount }));
    t("v3MorphStoredResolve('את') → pronoun, particle (offline auto-fill works)", r.resolved && r.resolved.pos === "pronoun" && r.resolved.kind === "particle", JSON.stringify(r.resolved));
    t("no pageerror", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[sentence-morph-import-check] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
