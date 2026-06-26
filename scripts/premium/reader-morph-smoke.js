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
        // R11 do-no-harm / source-precedence: Dicta must NOT override a DECISIVE offline reading.
        // בקר: offline exact «утро» (4235) vs Dicta «скот» (9185), same noun POS → keep offline.
        overrideExact: R.pickContextReading({ pos: "noun", pealim_id: "4235", label: "exact" }, { pos: "noun", pealim_id: "9185", label: "exact", meaning: "крупный рогатый скот" }, { posDicta: "noun" }, "בקר"),
        // but when offline FAILED (non-exact), context may still resolve it.
        overrideNonExact: R.pickContextReading({ pos: "noun", pealim_id: "4235", label: "likely" }, { pos: "noun", pealim_id: "9185", label: "exact", meaning: "крупный рогатый скот" }, { posDicta: "noun" }, "בקר"),
      };
    });
    eq(ctxPick.prep && ctxPick.prep.use === "gloss" && ctxPick.prep.pos === "preposition" && /до/.test(ctxPick.prep.gloss || ""),
      "Dicta preposition over offline noun → curated function gloss «до» (עד)");
    eq(ctxPick.advUncurated && ctxPick.advUncurated.use === "gloss" && ctxPick.advUncurated.pos === "adverb" && ctxPick.advUncurated.gloss === "",
      "Dicta function POS over offline content, no curated gloss → POS-only demotion (no fabricated gloss)");
    eq(ctxPick.agree && ctxPick.agree.use === "offline", "agreeing content POS must NOT trigger a spurious demotion");
    eq(ctxPick.soften && ctxPick.soften.use === "soften" && ctxPick.soften.pos === "noun",
      "offline verb vs Dicta noun (participle↔noun) → soften «точно»→«вероятно» (not suppress)");
    // R11 regression guard (the בקר → «скот» bug): never override a decisive corpus-grounded reading.
    eq(ctxPick.overrideExact && ctxPick.overrideExact.use === "offline",
      "R11: Dicta must NOT override an offline-EXACT corpus-grounded reading (בקר «утро» must stay, not flip to «скот»), got " + JSON.stringify(ctxPick.overrideExact));
    eq(ctxPick.overrideNonExact && ctxPick.overrideNonExact.use === "context",
      "R11: context MAY still resolve a NON-exact offline reading (offline failed → Dicta helps)");
    // R11 end-to-end (no network — ctx supplied): tapping בֹּקֶר with a cattle-Dicta context must
    // stay «утро»/בֹּקֶר/exact + correct direct link — the card must equal the niqqud column.
    const r11 = await pg.evaluate(async () => {
      const c = await window.ReaderMorph.resolveWordLight("בקר", "בֹּקֶר", { niqqud: "בָּקָר", posDicta: "noun", lemma: "בקר" });
      return { label: c.label, meaning: c.meaning, niqqud: c.niqqud, pid: c.pealim_id, direct: c.pealim_direct };
    });
    eq(r11 && /утро/.test(r11.meaning || "") && r11.niqqud === "בֹּקֶר" && r11.label === "exact" && r11.pid === "4235",
      "R11 e2e: בֹּקֶר + cattle-Dicta-context must stay «утро»/בֹּקֶר/exact/4235 (card == column), got " + JSON.stringify(r11));

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
      // scope to the head VERDICT badge: the confidence legend (Epic-2 #1) renders a sample of
      // every badge class, so a doc-wide .rm-prov-* query would also match the legend.
      const fam = body ? body.querySelectorAll(".rm-rootfam-chip") : [];
      const famHe = body ? body.querySelector(".rm-rootfam-chip .rm-fam-he") : null;
      return { text: body ? body.textContent : "", hasProvExact: !!document.querySelector(".rm-head .rm-prov-exact"), hasLink: !!document.querySelector(".rm-link"),
        hasSpeak: !!document.querySelector(".rm-head .rm-speak"), famCount: fam.length, famHasHe: !!famHe };
    });
    eq(/שלם/.test(card.text), "card should show the root שלם");
    eq(/мир/.test(card.text), "card should show the gloss мир");
    eq(card.hasProvExact, "card should show the 'exact' provenance badge");
    eq(card.hasLink, "card should show a Pealim link");
    // Epic-3a — pronounce button + enriched root-family chips (vocalized form span per chip).
    eq(card.hasSpeak, "card head must show a 🔊 pronounce button (Epic-3a)");
    eq(card.famCount === 0 || card.famHasHe, "root-family chips (when present) must render a .rm-fam-he vocalized form (Epic-3a), got famCount=" + card.famCount + " famHasHe=" + card.famHasHe);

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
        hasAlts: !!document.querySelector(".rm-alts"), hasProvLikely: !!document.querySelector(".rm-head .rm-prov-likely"),
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

    // ── Epic-2 #2 — per-card refine UI gating (pure UI; no real Dicta) ─────────
    // The «уточнить в контексте» button is offered ONLY when a refine provider is wired AND
    // canRefine() is true (app: online && global mode off). Tapping it reveals a one-line
    // consent confirm; «уточнить разово» re-resolves (here the stub returns null → «miss» note),
    // never silently. With canRefine()=false (offline / globally-granted) the button is HIDDEN.
    async function tapShanaWith(canRefine) {
      return await pg.evaluate(async (canR) => {
        try { window.ReaderMorph.closeSheet(); } catch (_) {}
        document.querySelectorAll("#rm-refine").forEach((n) => n.remove());
        const mount = document.createElement("div"); mount.id = "rm-refine";
        mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
          '<td data-col="he" class="rtl rtl-he">שנה</td>' +
          '<td data-col="niqqud" class="rtl rtl-he-niqqud">שָׁנָה</td></tr></tbody></table>';
        document.body.appendChild(mount);
        const rows = [{ he: "שנה אחת", he_niqqud: "שָׁנָה אַחַת" }];
        if (window.__rmR) { try { window.__rmR.detach(); } catch (_) {} }
        window.__rmR = window.ReaderMorph.attach(mount, {
          getRow: (i) => rows[i],
          refineContext: async () => null,            // stub: Dicta "miss" (no network)
          canRefine: () => canR,
          grantContextConsent: () => {},
        });
        mount.querySelector('td[data-col="he"] .rm-w').click();
        for (let i = 0; i < 60; i++) { if (document.querySelector(".rm-sheet.rm-open .rm-prov")) break; await new Promise((r) => setTimeout(r, 100)); }
        return { hasBtn: !!document.querySelector(".rm-refine-btn") };
      }, canRefine);
    }
    const refOn = await tapShanaWith(true);
    eq(refOn.hasBtn, "non-exact card must OFFER «уточнить в контексте» when canRefine() is true (Epic-2 #2)");
    // reveal the confirm, then run a one-off refine (stub returns null → honest «miss» note)
    await pg.locator(".rm-refine-btn").click();
    const confirm = await pg.evaluate(() => {
      const c = document.querySelector("[data-rm-refine-confirm]");
      return { visible: c ? !c.hidden : false, hasGo: !!document.querySelector("[data-rm-refine-go]"), hasAll: !!document.querySelector("[data-rm-refine-all]") };
    });
    eq(confirm.visible && confirm.hasGo && confirm.hasAll, "tapping refine must reveal the one-off consent confirm with both actions (R5)");
    await pg.locator("[data-rm-refine-go]").click();
    await pg.waitForFunction(() => !!document.querySelector(".rm-refine-miss") || !!document.querySelector(".rm-prov-context"), { timeout: 8000 }).catch(() => {});
    const afterGo = await pg.evaluate(() => ({ miss: !!document.querySelector(".rm-refine-miss"), btn: !!document.querySelector(".rm-refine-btn") }));
    eq(afterGo.miss && !afterGo.btn, "a refine that adds nothing must show an honest «контекст не дал уточнения», not re-offer the button");
    // privacy / redundancy: offline OR globally-granted → canRefine()=false → button hidden.
    const refOff = await tapShanaWith(false);
    eq(!refOff.hasBtn, "card must HIDE the refine button when canRefine() is false (offline / globally granted) — R5 privacy");

    // ── Epic 4 — manual one-tap status selector (LingQ levels). Gated on a wired setWordStatus;
    //    tapping a level calls setWordStatus(lemmaKey, value) + highlights it. Pure UI (no DB).
    const statusUi = await pg.evaluate(async () => {
      try { window.ReaderMorph.closeSheet(); } catch (_) {}
      document.querySelectorAll("#rm-status-m").forEach((n) => n.remove());
      const mount = document.createElement("div"); mount.id = "rm-status-m";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">שלום</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">שָׁלוֹם</td></tr></tbody></table>';
      document.body.appendChild(mount);
      const rows = [{ he: "שלום", he_niqqud: "שָׁלוֹם" }];
      window.__statusCalls = [];
      if (window.__rmS) { try { window.__rmS.detach(); } catch (_) {} }
      window.__rmS = window.ReaderMorph.attach(mount, {
        getRow: (i) => rows[i],
        getWordStatus: async () => "",
        setWordStatus: async (lk, st) => { window.__statusCalls.push([lk, st]); },
      });
      mount.querySelector('td[data-col="he"] .rm-w').click();
      for (let i = 0; i < 60; i++) { if (document.querySelector(".rm-sheet.rm-open .rm-prov")) break; await new Promise((r) => setTimeout(r, 100)); }
      const sel = document.querySelector(".rm-status");
      const btnCount = sel ? sel.querySelectorAll(".rm-status-btn").length : 0;
      const knownBtn = document.querySelector('.rm-status-btn[data-rm-status="known"]');
      if (knownBtn) knownBtn.click();
      await new Promise((r) => setTimeout(r, 60));
      const active = document.querySelector(".rm-status-btn.rm-status-active");
      return { hasSel: !!sel, btnCount, call: window.__statusCalls[window.__statusCalls.length - 1] || null, activeVal: active ? active.getAttribute("data-rm-status") : "" };
    });
    eq(statusUi.hasSel, "card must show the one-tap status selector when setWordStatus is wired (Epic 4)");
    eq(statusUi.btnCount === 7, "status selector must offer 7 options (new/1-4/known/ignore), got " + statusUi.btnCount);
    eq(statusUi.call && statusUi.call[1] === "known" && /^(pid:|[^#]*#)/.test(statusUi.call[0] || ""), "tapping «знаю» must call setWordStatus(lemmaKey, 'known'), got " + JSON.stringify(statusUi.call));
    eq(statusUi.activeVal === "known", "the chosen status must be highlighted active, got " + JSON.stringify(statusUi.activeVal));

    // ── Epic 4.2 — long-press a word → quick-status popover (no card opened). ──
    const lp = await pg.evaluate(async () => {
      try { window.ReaderMorph.closeSheet(); } catch (_) {}
      document.querySelectorAll("#rm-lp").forEach((n) => n.remove());
      const mount = document.createElement("div"); mount.id = "rm-lp";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">שלום</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">שָׁלוֹם</td></tr></tbody></table>';
      document.body.appendChild(mount);
      const rows = [{ he: "שלום", he_niqqud: "שָׁלוֹם" }];
      window.__lpCalls = [];
      if (window.__rmLP) { try { window.__rmLP.detach(); } catch (_) {} }
      window.__rmLP = window.ReaderMorph.attach(mount, { getRow: (i) => rows[i], getWordStatus: async () => "", setWordStatus: async (lk, st) => { window.__lpCalls.push([lk, st]); } });
      const span = mount.querySelector('td[data-col="he"] .rm-w');
      span.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 12, clientY: 12 }));   // hold (no pointerup)
      await new Promise((r) => setTimeout(r, 700));   // > LP_MS → long-press fires
      const pop = document.querySelector(".rm-statpop");
      const popVisible = pop ? !pop.hidden : false;
      const cardOpen = !!document.querySelector(".rm-sheet.rm-open");
      const known = pop ? pop.querySelector('[data-rm-statpop="known"]') : null;
      if (known) known.click();
      await new Promise((r) => setTimeout(r, 60));
      const popAfter = document.querySelector(".rm-statpop");
      return { popVisible, cardOpen, call: window.__lpCalls[window.__lpCalls.length - 1] || null, closedAfter: popAfter ? popAfter.hidden : true };
    });
    eq(lp.popVisible, "long-press a word must show the quick-status popover (Epic 4.2)");
    eq(!lp.cardOpen, "long-press must NOT also open the full card (gesture suppression)");
    eq(lp.call && lp.call[1] === "known", "tapping a popover level must call setWordStatus(lemmaKey, value), got " + JSON.stringify(lp.call));
    eq(lp.closedAfter, "the quick-status popover must close after a status is chosen");

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
