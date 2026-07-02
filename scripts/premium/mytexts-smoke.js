#!/usr/bin/env node
"use strict";
// smoke:reader-mytexts — multi-corpus surface (B+C «витрина + линза») + «Мои тексты» corpus.
// Design: docs/planning/BRR_MULTI_CORPUS_DESIGN_2026_07_02.md. In a real browser @380px, OPFS
// seeded in-session (headless OPFS does not survive reloads; small writes are safe):
//   1) the «Библиотека» tab lands on the L0 HUB: corpus cards (Бен-Иегуда + Мои тексты) + teaser;
//   2) the Мои-тексты hub card counts OWN texts only (corpus-meta text excluded);
//   3) tapping the card opens the «Мои тексты» CORPUS: header + facets + search;
//      search narrows; the level facet filters; corpus-meta text never appears;
//   4) the switcher pill lists corpora and swaps to Ben-Yehuda IN PLACE (the C half);
//      the Ben-Yehuda home carries the switchbar + the «Мои тексты» mini-rail;
//   5) tapping an own-text card opens the SAME Room reader (no pageerror);
//   6) 380px screenshots (hub + corpus).
// Run: node scripts/premium/mytexts-smoke.js

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3297, BASE = "http://127.0.0.1:" + PORT;
const SHOT_HUB = path.join(REPO, ".tmp", "corpus-hub-380.png");
const SHOT_CORPUS = path.join(REPO, ".tmp", "mytexts-380.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const ok = (cond, msg) => { if (!cond) failures.push(msg); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, { timeout: 20000 });

    // seed OPFS in-session: two OWN texts + one corpus-meta text (must be excluded everywhere)
    const seeded = await pg.evaluate(async () => {
      const db = await import("/db/local-db.js");
      await db.createText({ id: "mytexts-smoke-a", text_key: "mytexts-smoke-a", title: "שלום עולם — свой текст", source_text: "שלום עולם", level: "alef", tags_json: JSON.stringify(["ульпан"]) });
      await db.addSentence("mytexts-smoke-a", { id: "mytexts-smoke-a-s1", he_plain: "שלום עולם טוב", he_niqqud: "", ru: "привет добрый мир" });
      await db.createText({ id: "mytexts-smoke-b", text_key: "mytexts-smoke-b", title: "Второй свой текст", source_text: "טקסט", level: "bet" });
      await db.createText({ id: "mytexts-smoke-c", text_key: "mytexts-smoke-c", title: "CORPUS-META TEXT", source_text: "x", source_meta_json: JSON.stringify({ corpus: { byehuda_id: "999999" } }) });
      return true;
    }).catch((e) => { failures.push("seed failed: " + e.message); return false; });

    if (seeded) {
      // 1) the tab lands on the L0 hub
      await pg.click("#tabCorpus");
      await pg.waitForSelector(".hub-cards", { timeout: 15000 }).catch(() => failures.push("L0 hub did not render"));
      const hub = await pg.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".hub-card"));
        const my = cards.find((c) => c.dataset.corpus === "mytexts");
        return {
          n: cards.filter((c) => c.dataset.corpus).length,
          teaser: !!document.querySelector(".hub-teaser"),
          myCounts: my ? (my.querySelector(".hub-card-counts") || {}).textContent || "" : "",
          myBadges: my ? my.querySelectorAll(".hub-badge").length : 0,
          myCta: my ? !!my.querySelector(".hub-cta") : false,
        };
      });
      ok(hub.n === 2, "hub expected 2 corpus cards, got " + hub.n);
      ok(hub.teaser, "hub roadmap teaser missing");
      ok(/^2\b/.test(hub.myCounts.trim()), "mytexts hub count must be 2 (own only), got '" + hub.myCounts + "'");
      ok(hub.myBadges >= 3, "mytexts capability badges missing");
      ok(hub.myCta, "mytexts «+ Добавить текст» CTA missing");
      await pg.screenshot({ path: SHOT_HUB });

      // 2) open the «Мои тексты» corpus
      await pg.click('.hub-card[data-corpus="mytexts"]');
      await pg.waitForSelector(".mytexts-corpus .mytexts-grid", { timeout: 10000 }).catch(() => failures.push("mytexts corpus home did not render"));
      const corpusText = await pg.evaluate(() => (document.querySelector(".mytexts-corpus") || {}).textContent || "");
      ok(corpusText.includes("Второй свой текст"), "own text B missing from the corpus");
      ok(!corpusText.includes("CORPUS-META TEXT"), "corpus-meta text LEAKED into «Мои тексты» (discriminator broken)");
      // search narrows
      await pg.fill(".mytexts-search", "Второй");
      await sleep(450);   // > the 200ms input debounce
      let gridCount = await pg.evaluate(() => document.querySelectorAll(".mytexts-grid .mytext-card-v").length);
      ok(gridCount === 1, "search 'Второй' expected exactly 1 card, got " + gridCount);
      await pg.fill(".mytexts-search", "");
      await sleep(450);
      // level facet filters
      await pg.evaluate(() => { const chips = Array.from(document.querySelectorAll(".mytexts-facets .corpus-sort-btn")); const alef = chips.find((c) => c.textContent.trim() === "alef"); if (alef) alef.click(); });
      await sleep(150);
      gridCount = await pg.evaluate(() => document.querySelectorAll(".mytexts-grid .mytext-card-v").length);
      ok(gridCount === 1, "level facet 'alef' expected exactly 1 card, got " + gridCount);
      await pg.evaluate(() => { const chips = Array.from(document.querySelectorAll(".mytexts-facets .corpus-sort-btn")); const alef = chips.find((c) => /alef/.test(c.textContent)); if (alef) alef.click(); });
      await sleep(150);
      // PRO parity with the Studio v3 search (feedback_feature_parity_inventory):
      // #tag query syntax narrows by tag
      await pg.fill(".mytexts-search", "#ульпан");
      await sleep(400);
      gridCount = await pg.evaluate(() => document.querySelectorAll(".mytexts-grid .mytext-card-v").length);
      ok(gridCount === 1, "#tag query expected exactly 1 card, got " + gridCount);
      // scope «только строки»: the query matches INSIDE a seeded sentence, not the metadata
      await pg.fill(".mytexts-search", "טוב");
      await pg.selectOption(".mytexts-select", "rows");
      await sleep(500);
      gridCount = await pg.evaluate(() => document.querySelectorAll(".mytexts-grid .mytext-card-v").length);
      ok(gridCount === 1, "rows-scope search 'טוב' expected exactly 1 card (sentence hit), got " + gridCount);
      await pg.selectOption(".mytexts-select", "texts");
      await pg.fill(".mytexts-search", "");
      await sleep(400);
      // smart-chips rail renders all 8 (v3 parity); toggling one repaints without errors
      const smartN = await pg.evaluate(() => document.querySelectorAll(".mytexts-smart [data-smart]").length);
      ok(smartN === 8, "smart rail expected 8 chips, got " + smartN);
      await pg.evaluate(() => { const c = document.querySelector('.mytexts-smart [data-smart="recent"]'); if (c) c.click(); });
      await sleep(150);
      await pg.evaluate(() => { const c = document.querySelector('.mytexts-smart [data-smart="recent"]'); if (c) c.click(); });
      await sleep(150);
      // sort select present with the v3 sort set
      const sortOpts = await pg.evaluate(() => { const s = document.querySelectorAll(".mytexts-select")[1]; return s ? s.options.length : 0; });
      ok(sortOpts === 5, "sort select expected 5 options, got " + sortOpts);
      await pg.screenshot({ path: SHOT_CORPUS });

      // 3) the switcher pill swaps to Ben-Yehuda in place; its home carries switchbar + mini-rail
      await pg.click(".corpus-switch-pill");
      await pg.waitForSelector(".corpus-switch-menu:not([hidden])", { timeout: 5000 }).catch(() => failures.push("switcher menu did not open"));
      await pg.evaluate(() => { const items = Array.from(document.querySelectorAll(".corpus-switch-item")); const by = items.find((i) => !i.classList.contains("on")); if (by) by.click(); });
      await pg.waitForSelector(".corpus-switchbar", { timeout: 15000 }).catch(() => failures.push("Ben-Yehuda home lacks the switchbar"));
      // uniform retrieval contract: the SAME personal smart-rail on the Ben-Yehuda home
      const byRail = await pg.evaluate(() => document.querySelectorAll(".corpus-smart-rail [data-smart]").length);
      ok(byRail === 8, "Ben-Yehuda home smart rail expected 8 chips (uniform contract), got " + byRail);
      await pg.waitForSelector(".mytexts-shelf", { timeout: 15000 }).catch(() => failures.push("«Мои тексты» mini-rail missing on the Ben-Yehuda home"));
      const railHasWhole = await pg.evaluate(() => { const t = document.querySelector(".mytexts-shelf .mytexts-toggle"); return t ? t.textContent : ""; });
      ok(/→/.test(railHasWhole), "mini-rail «Весь корпус →» button missing");

      // 4) back to the corpus via the mini-rail button, open a text in the Room reader
      await pg.click(".mytexts-shelf .mytexts-toggle");
      await pg.waitForSelector(".mytexts-corpus .mytexts-grid", { timeout: 10000 });
      await pg.evaluate(() => { const cards = Array.from(document.querySelectorAll(".mytexts-grid .mytext-card-v")); const a = cards.find((c) => c.textContent.includes("שלום")); if (a) a.click(); });
      await pg.waitForFunction(() => { const t = document.getElementById("readerTitle"); return t && /שלום/.test(t.textContent || ""); }, { timeout: 15000 }).catch(() => failures.push("tapping an own-text card did not open the Room reader"));
    }
    ok(!pageErrors.length, "pageerror(s): " + pageErrors.join(" | "));
  } finally { await b.close(); await stop(srv.c); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s):"); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
  console.log("screenshots → " + path.relative(REPO, SHOT_HUB) + " · " + path.relative(REPO, SHOT_CORPUS));
  console.log("PASS — multi-corpus smoke green (hub + mytexts corpus + facets + switcher + mini-rail + reader-open @380px)");
})().catch((e) => { console.error("fatal:", e && e.stack || e); process.exit(1); });
