#!/usr/bin/env node
"use strict";
// BRR-P1-011 · smoke:reader-morph — browser gate for the Reading-Room light
// morphology-on-tap layer (public/js/reader-morph.js + library.html wiring).
//
// Boots library.html in a real browser (SW blocked, locale 'ru', 380x844) and proves:
//   1) the offline engine loads the REAL shipped Pealim dataset and resolves words
//      (form-first: root + gloss + provenance) — incl. niqqud homograph disambiguation;
//   2) R1 honesty — unknown/proper-noun words return an empty gloss labelled "unknown"
//      (never a fabricated certainty);
//   3) the post-render word-wrap is parity-safe — wrapping preserves the cell's exact
//      textContent (no characters added/dropped);
//   4) a real tap opens the light card with the resolved fields;
//   5) offline-capable — the 3.3 MB dataset is fetched EXACTLY ONCE; subsequent taps
//      resolve from the resident dataset with no further network.
// Also writes a 380px RTL screenshot of the open card.
//
// Run:  node scripts/premium/reader-morph-smoke.js   (gate)   [--keep-screenshot]

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3284, BASE = "http://127.0.0.1:" + PORT;
const SHOT = path.join(REPO, ".tmp", "reader-morph-380.png");
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
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed to start"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const fail = (m) => failures.push(m);
  const eq = (cond, m) => { if (!cond) fail(m); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); } catch (_) {} });
    // Count fetches of the heavy inflection dataset — must be exactly one (offline-capable).
    let dictFetches = 0;
    ctx.on("request", (r) => { if (/\/data\/inflection\/pealim-infl-.*\.json\.gz/.test(r.url())) dictFetches++; });
    const pg = await ctx.newPage();
    const pageErrors = [];
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });

    await pg.waitForFunction(() =>
      !!window.ReaderMorph && !!window.InflectionDict && !!window.NotesAutoGen && !!window.PealimFunctionLinks,
      { timeout: 20000 });

    // ── 1) engine: resolve real words (form-first) + R1 honesty ───────────────
    const eng = await pg.evaluate(async () => {
      const R = window.ReaderMorph;
      const shalom = await R.resolveWordLight("שלום", "שָׁלוֹם");
      const sefer = await R.resolveWordLight("ספר", "סֵפֶר");   // book (noun)
      const siper = await R.resolveWordLight("ספר", "סִפֵּר");  // tell (piel)
      const xyz = await R.resolveWordLight("xyz", "xyz");
      const avraham = await R.resolveWordLight("אברהם", "אַבְרָהָם");
      // Epic 1 P1.1 — multi-id (homograph) cell must NOT claim «точно»: שָׁנָה (year/repeat)
      // is a classic homograph; it must demote to «вероятно» (likely) + carry alternatives.
      const shana = await R.resolveWordLight("שנה", "שָׁנָה");
      // R10 honest-gloss gate: function-form homograph traps + content guards.
      const ein = await R.resolveWordLight("אין", "אֵין");          // negation, was «уничтожить»
      const aleinu = await R.resolveWordLight("עלינו", "עָלֵינוּ");  // prep+suf, was «лист»
      const afilu = await R.resolveWordLight("אפלו", "אֲפִלּוּ");    // «даже» (defective ktiv), was «темнота»
      const lihyot = await R.resolveWordLight("להיות", "לִהְיוֹת");  // content guard: «быть», NOT gated
      const libenu = await R.resolveWordLight("לבנו", "לִבֵּנוּ");   // content guard: «сердце», NOT gated
      const gateNeg = R.functionGate("אין"), gatePrep = R.functionGate("עלינו"), gateContent = R.functionGate("לבנו");
      return { shalom, sefer, siper, xyz, avraham, shana, ein, aleinu, afilu, lihyot, libenu, gateNeg, gatePrep, gateContent };
    });
    eq(eng.shalom && eng.shalom.root === "שלם", "shalom root should be שלם, got " + JSON.stringify(eng.shalom && eng.shalom.root));
    eq(eng.shalom && /мир/.test(eng.shalom.meaning || ""), "shalom gloss should contain 'мир'");
    eq(eng.shalom && eng.shalom.label === "exact", "shalom should be labelled exact");
    eq(eng.shalom && eng.shalom.ambiguous === false, "shalom (unique cell) must be ambiguous=false (stays «точно»)");
    // Epic 1 P1.1 — honesty floor: an homograph (multi-id) cell may not be sold as «точно».
    eq(eng.shana && eng.shana.channel === "form-first", "שָׁנָה should still resolve form-first");
    eq(eng.shana && eng.shana.ambiguous === true, "שָׁנָה (homograph) must be flagged ambiguous");
    eq(eng.shana && eng.shana.label !== "exact", "שָׁנָה must NOT claim «точно», got label " + JSON.stringify(eng.shana && eng.shana.label));
    eq(eng.shana && eng.shana.label === "likely", "שָׁנָה should demote to «вероятно» (likely), got " + JSON.stringify(eng.shana && eng.shana.label));
    eq(eng.shana && Array.isArray(eng.shana.alts) && eng.shana.alts.length >= 1, "שָׁנָה must carry ≥1 alternative reading for «возможно также»");
    eq(eng.shana && /повтор|год/.test(eng.shana.meaning || ""), "שָׁנָה must still surface a real gloss (best-effort pick), got " + JSON.stringify(eng.shana && eng.shana.meaning));
    eq(eng.shalom && eng.shalom.pealim_direct === true, "shalom should have a direct Pealim page");
    eq(eng.sefer && eng.sefer.pos === "noun", "סֵפֶר should be noun");
    eq(eng.siper && eng.siper.pos === "verb" && eng.siper.binyan === "piel", "סִפֵּר should be verb/piel (homograph disambiguation)");
    eq(eng.sefer && eng.siper && eng.sefer.pealim_id !== eng.siper.pealim_id, "homographs must resolve to distinct Pealim ids");
    // R1: never fabricate.
    eq(eng.xyz && eng.xyz.meaning === "" && eng.xyz.label === "unknown", "xyz must be honest-empty/unknown");
    eq(eng.avraham && eng.avraham.meaning === "" && eng.avraham.label === "unknown", "proper noun must be honest-empty/unknown");

    // R10 honest-gloss gate — function forms get the honest reading (no homograph content gloss,
    // no leaf-noun table); genuine content words keep their full reading + paradigm.
    eq(eng.ein && eng.ein.functionWord === true && /нет/.test(eng.ein.meaning || "") && eng.ein.label === "function",
      "אֵין must gate to «нет» (function), got " + JSON.stringify(eng.ein && eng.ein.meaning));
    eq(eng.ein && !eng.ein.paradigm, "gated אֵין must NOT carry a (wrong) conjugation table");
    eq(eng.aleinu && eng.aleinu.functionWord === true && /на нас/.test(eng.aleinu.meaning || ""),
      "עָלֵינוּ must gate to «на нас» (prep+suffix), got " + JSON.stringify(eng.aleinu && eng.aleinu.meaning));
    eq(eng.aleinu && !eng.aleinu.paradigm && !eng.aleinu.root, "gated עָלֵינוּ must drop the leaf-noun root/table");
    eq(eng.afilu && /даже/.test(eng.afilu.meaning || ""), "אֲפִלּוּ (defective) must gate to «даже», got " + JSON.stringify(eng.afilu && eng.afilu.meaning));
    // content guards — must NOT be gated, must keep full reading + table.
    eq(eng.lihyot && eng.lihyot.functionWord !== true && /быть/.test(eng.lihyot.meaning || "") && eng.lihyot.paradigm,
      "לִהְיוֹת must stay content «быть» with a table (not gated as «поскольку»)");
    eq(eng.libenu && eng.libenu.functionWord !== true && /сердце/.test(eng.libenu.meaning || "") && eng.libenu.paradigm,
      "לִבֵּנוּ must stay content «сердце» with a table (single-letter base guard)");
    // pure functionGate contract
    eq(eng.gateNeg && eng.gateNeg.isFunc === true && eng.gatePrep && eng.gatePrep.isFunc === true, "functionGate must flag אין + עלינו");
    eq(eng.gateContent && eng.gateContent.isFunc === false, "functionGate must NOT flag content לבנו");

    // Epic 1 tail — broadened pickContextReading: Dicta's context FUNCTION POS demotes an
    // offline CONTENT reading (homograph trap), curated gloss when known, else POS-only.
    const ctxPick = await pg.evaluate(() => {
      const R = window.ReaderMorph;
      const offNoun = { pos: "noun", pealim_id: "1", meaning: "вечность" };
      return {
        prep: R.pickContextReading(offNoun, null, { posDicta: "preposition" }, "עד"),     // curated → «до»
        advUncurated: R.pickContextReading(offNoun, null, { posDicta: "adverb" }, "כזותי"), // no gloss → POS-only
        agree: R.pickContextReading({ pos: "noun", pealim_id: "1" }, null, { posDicta: "noun" }, "ספר"), // no demotion
        soften: R.pickContextReading({ pos: "verb", pealim_id: "9" }, null, { posDicta: "noun" }, "מת"),  // participle↔noun → soften
      };
    });
    eq(ctxPick.prep && ctxPick.prep.use === "gloss" && ctxPick.prep.pos === "preposition" && /до/.test(ctxPick.prep.gloss || ""),
      "Dicta preposition over offline noun → curated function gloss «до» (עד)");
    eq(ctxPick.advUncurated && ctxPick.advUncurated.use === "gloss" && ctxPick.advUncurated.pos === "adverb" && ctxPick.advUncurated.gloss === "",
      "Dicta function POS over offline content, no curated gloss → POS-only demotion (no fabricated gloss)");
    eq(ctxPick.agree && ctxPick.agree.use === "offline", "agreeing content POS must NOT trigger a spurious demotion");
    eq(ctxPick.soften && ctxPick.soften.use === "soften" && ctxPick.soften.pos === "noun",
      "offline verb vs Dicta noun (participle↔noun) → soften «точно»→«вероятно» (not suppress)");

    // ── 2/3/4) DOM: wrap parity-safe + tap opens card ─────────────────────────
    const dom = await pg.evaluate(() => {
      const mount = document.createElement("div");
      mount.id = "rm-mount";
      mount.innerHTML =
        '<table id="proTable"><tbody>' +
        '<tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">שלום עולם</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">שָׁלוֹם עוֹלָם</td>' +
        "</tr></tbody></table>";
      document.body.appendChild(mount);
      const rows = [{ he: "שלום עולם", he_niqqud: "שָׁלוֹם עוֹלָם" }];
      window.__rmHandle = window.ReaderMorph.attach(mount, { getRow: (i) => rows[i] });
      const heCell = mount.querySelector('td[data-col="he"]');
      const spans = heCell.querySelectorAll(".rm-w");
      return { spanCount: spans.length, heText: heCell.textContent, firstSurface: spans[0] && spans[0].getAttribute("data-surface") };
    });
    eq(dom.spanCount === 2, "he cell should wrap 2 words, got " + dom.spanCount);
    eq(dom.heText === "שלום עולם", "wrap must preserve exact cell text, got " + JSON.stringify(dom.heText));
    eq(dom.firstSurface === "שלום", "first word surface should be שלום, got " + JSON.stringify(dom.firstSurface));

    await pg.locator('#rm-mount td[data-col="he"] .rm-w').first().click();
    await pg.waitForSelector(".rm-sheet.rm-open", { timeout: 10000 });
    const card = await pg.evaluate(() => {
      const body = document.querySelector(".rm-sheet-body");
      return { text: body ? body.textContent : "", hasProvExact: !!document.querySelector(".rm-prov-exact"), hasLink: !!document.querySelector(".rm-link") };
    });
    eq(/שלם/.test(card.text), "card should show the root שלם");
    eq(/мир/.test(card.text), "card should show the gloss мир");
    eq(card.hasProvExact, "card should show the 'exact' provenance badge");
    eq(card.hasLink, "card should show a Pealim link");

    // ── Epic 1 P1.2 — ambiguous homograph card: «возможно также» + enrichment gated ──
    await pg.evaluate(() => { try { window.ReaderMorph.closeSheet(); } catch (_) {} });
    await pg.waitForSelector(".rm-sheet.rm-open", { state: "hidden", timeout: 5000 }).catch(() => {});
    await pg.evaluate(() => {
      const mount = document.createElement("div"); mount.id = "rm-amb";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">שנה</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">שָׁנָה</td></tr></tbody></table>';
      document.body.appendChild(mount);
      const rows = [{ he: "שנה", he_niqqud: "שָׁנָה" }];
      window.ReaderMorph.attach(mount, { getRow: (i) => rows[i] });
    });
    await pg.locator('#rm-amb td[data-col="he"] .rm-w').first().click();
    await pg.waitForSelector(".rm-sheet.rm-open", { timeout: 10000 });
    const amb = await pg.evaluate(() => {
      const body = document.querySelector(".rm-sheet-body"), link = document.querySelector(".rm-link");
      const lp = document.querySelector("[data-rm-legend-panel]");
      return {
        text: body ? body.textContent : "",
        hasAlts: !!document.querySelector(".rm-alts"), hasProvLikely: !!document.querySelector(".rm-prov-likely"),
        hasFamily: !!document.querySelector(".rm-rootfam"), hasUncertainTable: !!document.querySelector(".rm-acc-uncertain"),
        linkHref: link ? link.getAttribute("href") : "",
        // Epic-2 #1 legend «?» + #3 machine-niqqud caption
        hasHelp: !!document.querySelector(".rm-prov-help"), legendHiddenInitially: lp ? lp.hidden : null,
        hasNiqqudProv: !!document.querySelector(".rm-niqqud-prov"),
      };
    });
    eq(amb.hasProvLikely, "שָׁנָה card should carry the «вероятно» badge");
    eq(amb.hasAlts && /возможно также/.test(amb.text), "ambiguous card must render «возможно также» alternatives (F4)");
    eq(!amb.hasFamily, "ambiguous card must HIDE the root family (root uncertain) (F5)");
    eq(/\/search\//.test(amb.linkHref) && !/\/dict\//.test(amb.linkHref), "ambiguous card Pealim link must be SEARCH, not a direct page (F5), got " + JSON.stringify(amb.linkHref));
    eq(amb.hasUncertainTable, "ambiguous card conjugation table must be flagged «возможная парадигма» (F5)");
    // Epic-2 #1 — confidence-taxonomy legend behind a «?» (starts collapsed).
    eq(amb.hasHelp, "card must show the «?» confidence-legend helper (Epic-2 #1)");
    eq(amb.legendHiddenInitially === true, "legend must start collapsed (hidden)");
    // Epic-2 #3 — vocalized card asserts the niqqud is machine-made (R9).
    eq(amb.hasNiqqudProv, "vocalized card must show the machine-niqqud provenance caption (Epic-2 #3)");

    // expand the legend → it reveals all 6 badge meanings + the «возможно также» row.
    await pg.locator(".rm-prov-help").click();
    const legend = await pg.evaluate(() => {
      const p = document.querySelector("[data-rm-legend-panel]"), btn = document.querySelector(".rm-prov-help");
      return { visible: p ? !p.hidden : false, rows: p ? p.querySelectorAll(".rm-legend-row").length : 0,
        expanded: btn ? btn.getAttribute("aria-expanded") : null, text: p ? p.textContent : "" };
    });
    eq(legend.visible, "clicking «?» must reveal the confidence legend (Epic-2 #1)");
    eq(legend.rows === 7, "legend must list 6 badges + the «возможно также» row, got " + legend.rows);
    eq(legend.expanded === "true", "«?» must reflect aria-expanded=true when the legend is open");
    eq(/офлайн-словарь распознал/.test(legend.text), "legend must carry the «точно» explanation copy");

    // screenshot the open card @380px RTL (legend expanded)
    try { fs.mkdirSync(path.dirname(SHOT), { recursive: true }); } catch (_) {}
    await pg.screenshot({ path: SHOT });

    // ── 5) offline-capable: dataset fetched exactly once ──────────────────────
    eq(dictFetches === 1, "inflection dataset must be fetched exactly once (offline-capable), got " + dictFetches);
    eq(pageErrors.length === 0, "no pageerror, got: " + pageErrors.join(" | "));

    console.log("reader-morph: engine + homograph + R1-honesty + R10-function-gate + wrap-parity + tap-card + offline-once");
    console.log("screenshot → " + path.relative(REPO, SHOT));
    if (failures.length) {
      console.error("\nFAIL (" + failures.length + "):");
      for (const f of failures) console.error("  ✗ " + f);
      await b.close(); await stop(srv.c); process.exit(1);
    }
    console.log("PASS — reader-morph smoke green");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
