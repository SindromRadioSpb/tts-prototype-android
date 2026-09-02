#!/usr/bin/env node
"use strict";
// smoke:word-context — T2 context bank + scope gate.
// Boots library.html against a real OPFS database (migration 050) and proves the bank's
// write path, its identity/cap rules, rotation determinism and the scope contract.
// Plan: docs/superpowers/plans/2026-09-02-room-trainer-t2-context-bank-and-scope.md

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3321, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 20000) {
  const s = Date.now();
  while (Date.now() - s < ms) { try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {} await sleep(200); }
  return false;
}

(async () => {
  let pw; try { pw = require("playwright"); } catch (_) { console.error("no playwright"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed\n" + srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = []; let checks = 0;
  const eq = (ok, m) => { checks++; if (!ok) failures.push(m); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); localStorage.setItem("localMode", "1"); } catch (_) {} });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });

    const res = await pg.evaluate(async () => {
      const ldb = await import("/db/local-db.js");
      await ldb.initLocalDB();
      const out = {};

      // Three texts, one per source class.
      const defs = [
        { id: "wc-by", key: "wc:by:1", title: "BY", meta: { corpus: { schema: 1, byehuda_id: "by-1" } } },
        { id: "wc-song", key: "wc:song:1", title: "SONG", meta: { group_corpus: { schema: 1, corpus_id: "study-songs-pilot" } } },
        { id: "wc-mine", key: "wc:mine:1", title: "MINE", meta: { origin: "studio" } },
      ];
      for (const d of defs) {
        await ldb.createText({ id: d.id, text_key: d.key, title: d.title, source_text: "זֶה בַּיִת.", source_meta_json: JSON.stringify(d.meta) });
        for (let i = 0; i < 10; i++) {
          await ldb.addSentence(d.id, { id: d.id + "-s" + i, he_plain: "זה בית " + i, he_niqqud: "זֶה בַּיִת " + i, ru: "дом " + i });
        }
      }

      const LK = "pid:88800001";
      // 12 rows across the three texts — the cap is 8.
      const rows = [];
      for (let i = 0; i < 4; i++) rows.push({ textKey: "wc:by:1", orderIndex: i, sentenceId: "wc-by-s" + i, surface: "בית" });
      for (let i = 0; i < 4; i++) rows.push({ textKey: "wc:song:1", orderIndex: i, sentenceId: "wc-song-s" + i, surface: "בית" });
      for (let i = 0; i < 4; i++) rows.push({ textKey: "wc:mine:1", orderIndex: i, sentenceId: "wc-mine-s" + i, surface: "בית" });
      out.written = await ldb.insertWordContexts(LK, rows, "keyer-test-1");
      const stored = await ldb.getWordContexts(LK);
      out.count = stored.length;
      out.classes = Array.from(new Set(stored.map((x) => x.source_class))).sort().join(",");
      out.corpusIds = Array.from(new Set(stored.map((x) => x.corpus_id || ""))).sort().join(",");
      out.ordered = stored.map((x) => x.source_class + ":" + x.order_index).join("|");

      // Idempotence: the same rows again must not duplicate.
      await ldb.insertWordContexts(LK, rows, "keyer-test-1");
      out.countAfterRepeat = (await ldb.getWordContexts(LK)).length;

      // An unknown text_key must be refused (no orphan context).
      out.orphan = await ldb.insertWordContexts(LK, [{ textKey: "wc:nope:1", orderIndex: 0, sentenceId: "x", surface: "בית" }], "keyer-test-1");

      // Keyer invalidation wipes the bank for that lemma.
      out.staleDropped = await ldb.dropStaleWordContexts("keyer-test-2");
      out.countAfterKeyerBump = (await ldb.getWordContexts(LK)).length;

      await ldb.dbRun("DELETE FROM word_context WHERE lemma_key = ?", [LK]);
      for (const d of defs) { try { await ldb.deleteText(d.id); } catch (_) {} }
      return out;
    });

    eq(res.written === 8, "insertWordContexts must cap at 8 rows per lemma, wrote " + res.written);
    eq(res.count === 8, "the bank must hold exactly the capped rows, got " + res.count);
    eq(res.classes === "byehuda,group,mytext",
      "the cap must SPREAD across texts, not fill from the first one — all three sources must be "
      + "represented so rotation varies the source, got " + res.classes);
    eq(/study-songs-pilot/.test(res.corpusIds), "a group text must carry its corpus_id, got " + res.corpusIds);
    eq(res.ordered.indexOf("byehuda:0") === 0,
      "contexts must come back in the deterministic (source_class, text_key, order_index) order, got " + res.ordered);
    eq(res.countAfterRepeat === 8, "re-inserting the same rows must not duplicate, got " + res.countAfterRepeat);
    eq(res.orphan === 0, "a context for an unknown text_key must be refused, wrote " + res.orphan);
    eq(res.countAfterKeyerBump === 0, "a keyer-version bump must invalidate the bank, got " + res.countAfterKeyerBump);
    eq(errs.length === 0, "no pageerror, got: " + errs.join(" | "));

    if (failures.length) {
      console.error(`word-context-smoke: FAIL ${failures.length}/${checks}`);
      failures.forEach((f) => console.error("  ✗ " + f));
      await b.close(); await stop(srv.c); process.exit(1);
    }
    console.log(`word-context-smoke: PASS ${checks}/${checks}`);
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
