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
    // root-family drill «‹ Назад»: tap a chip → card replaced + back row appears → back → original restored.
    if (card.famCount > 0) {
      const headOf = () => pg.evaluate(() => { const w = document.querySelector(".rm-sheet-body .rm-word"); return w ? w.textContent : ""; });
      const baseHead = await headOf();
      await pg.evaluate(() => { const c = document.querySelector(".rm-sheet-body .rm-rootfam-chip"); const d = c && c.closest ? c.closest("details") : null; if (d) d.open = true; });
      await pg.locator(".rm-sheet-body .rm-rootfam-chip").first().click();
      await pg.waitForFunction((h) => { const w = document.querySelector(".rm-sheet-body .rm-word"); return w && w.textContent !== h && document.querySelector(".rm-back"); }, baseHead, { timeout: 8000 }).catch(() => {});
      const drilled = await pg.evaluate(() => ({ head: (document.querySelector(".rm-sheet-body .rm-word") || {}).textContent || "", hasBack: !!document.querySelector(".rm-back") }));
      eq(drilled.hasBack && drilled.head !== baseHead, "drilling into a root-family chip must open its card + show «‹ Назад», got " + JSON.stringify(drilled));
      await pg.locator(".rm-back").click();
      await pg.waitForFunction((h) => { const w = document.querySelector(".rm-sheet-body .rm-word"); return w && w.textContent === h; }, baseHead, { timeout: 8000 }).catch(() => {});
      const backHead = await headOf();
      eq(backHead === baseHead, "«‹ Назад» must restore the original word, got " + JSON.stringify(backHead) + " want " + JSON.stringify(baseHead));
    }

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
      const knownCall = window.__statusCalls[window.__statusCalls.length - 1] || null;
      const active = document.querySelector(".rm-status-btn.rm-status-active");
      // «new» is now a real storable status (not a clear): tapping it must STORE 'new', not ''.
      const newBtn = document.querySelector('.rm-status-btn[data-rm-status="new"]');
      if (newBtn) newBtn.click();
      await new Promise((r) => setTimeout(r, 60));
      const newCall = window.__statusCalls[window.__statusCalls.length - 1] || null;
      return { hasSel: !!sel, btnCount, knownCall, activeVal: active ? active.getAttribute("data-rm-status") : "", newCall };
    });
    eq(statusUi.hasSel, "card must show the one-tap status selector when setWordStatus is wired (Epic 4)");
    eq(statusUi.btnCount === 7, "status selector must offer 7 options (new/1-4/known/ignore), got " + statusUi.btnCount);
    eq(statusUi.knownCall && statusUi.knownCall[1] === "known" && /^(pid:|[^#]*#)/.test(statusUi.knownCall[0] || ""), "tapping «знаю» must call setWordStatus(lemmaKey, 'known'), got " + JSON.stringify(statusUi.knownCall));
    eq(statusUi.activeVal === "known", "the chosen status must be highlighted active, got " + JSON.stringify(statusUi.activeVal));
    eq(statusUi.newCall && statusUi.newCall[1] === "new", "tapping «новое» must STORE 'new' (not clear) so unconfident words can be marked purple, got " + JSON.stringify(statusUi.newCall));

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

    // ── T-b — manual translation for out-of-dict words. An unknown word (no offline gloss)
    //    offers «＋ Добавить перевод» when saveUserMeaning is wired; add→type→save persists the
    //    learner's own meaning (saveUserMeaning) + re-renders with «ваш»; lookupUserMeaning
    //    re-surfaces a saved meaning on re-open. בנימה = confirmed out-of-dict (no fabrication).
    const tb = await pg.evaluate(async () => {
      const R = window.ReaderMorph;
      try { R.closeSheet(); } catch (_) {}
      document.querySelectorAll("#rm-tb").forEach((n) => n.remove());
      const mount = document.createElement("div"); mount.id = "rm-tb";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">בנימה</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">בְּנִימָה</td></tr></tbody></table>';
      document.body.appendChild(mount);
      const rows = [{ he: "בנימה", he_niqqud: "בְּנִימָה" }];
      window.__umCalls = [];
      if (window.__rmTB) { try { window.__rmTB.detach(); } catch (_) {} }
      window.__rmTB = R.attach(mount, {
        getRow: (i) => rows[i],
        lookupUserMeaning: async () => "",
        saveUserMeaning: async (card, occ, m) => { window.__umCalls.push([card.lemmaKey, m]); return { ok: true }; },
      });
      mount.querySelector('td[data-col="he"] .rm-w').click();
      for (let i = 0; i < 60; i++) { if (document.querySelector(".rm-sheet.rm-open .rm-prov")) break; await new Promise((r) => setTimeout(r, 100)); }
      const emptyBefore = !!document.querySelector(".rm-meaning-empty");
      const addBtn = document.querySelector("[data-rm-meaning-add]");
      const ctaShown = !!addBtn;
      // editor must be visually hidden until invoked (computed display, not just the .hidden prop —
      // author display:flex would otherwise beat the UA [hidden] rule).
      const editorPre = document.querySelector("[data-rm-meaning-editor]");
      const editorHiddenBefore = editorPre ? getComputedStyle(editorPre).display === "none" : false;
      if (addBtn) addBtn.click();
      await new Promise((r) => setTimeout(r, 40));
      const editor = document.querySelector("[data-rm-meaning-editor]");
      const editorOpen = editor ? (!editor.hidden && getComputedStyle(editor).display !== "none") : false;
      const input = document.querySelector("[data-rm-meaning-input]");
      if (input) input.value = "тест-перевод";
      const saveBtn = document.querySelector("[data-rm-meaning-save]");
      if (saveBtn) saveBtn.click();
      await new Promise((r) => setTimeout(r, 140));
      const mine = document.querySelector(".rm-meaning-mine");
      const meaningText = (document.querySelector(".rm-meaning") || {}).textContent || "";
      return { emptyBefore, ctaShown, editorHiddenBefore, editorOpen, call: window.__umCalls[window.__umCalls.length - 1] || null, hasMine: !!mine, meaningText };
    });
    eq(tb.emptyBefore, "an out-of-dict word must render the honest empty-gloss state (no fabricated meaning)");
    eq(tb.ctaShown, "unknown word + wired saveUserMeaning must offer «＋ Добавить перевод» (T-b)");
    eq(tb.editorHiddenBefore, "the translation editor must be hidden until «＋ Добавить перевод» is tapped (computed display:none)");
    eq(tb.editorOpen, "tapping «＋ Добавить перевод» must reveal the inline translation editor");
    eq(tb.call && tb.call[1] === "тест-перевод" && /^(pid:|[^#]*#)/.test(tb.call[0] || ""), "saving must call saveUserMeaning(lemmaKey, meaning), got " + JSON.stringify(tb.call));
    eq(tb.hasMine && tb.meaningText.indexOf("тест-перевод") >= 0, "after save the card must show the user meaning marked «ваш», got " + JSON.stringify({ hasMine: tb.hasMine, meaningText: tb.meaningText }));

    // re-surface: a saved user-meaning fills an honest-empty gloss on re-open (lookupUserMeaning).
    const tbRe = await pg.evaluate(async () => {
      const R = window.ReaderMorph;
      try { R.closeSheet(); } catch (_) {}
      document.querySelectorAll("#rm-tb2").forEach((n) => n.remove());
      const mount = document.createElement("div"); mount.id = "rm-tb2";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0"><td data-col="he" class="rtl rtl-he">בנימה</td></tr></tbody></table>';
      document.body.appendChild(mount);
      if (window.__rmTB2) { try { window.__rmTB2.detach(); } catch (_) {} }
      window.__rmTB2 = R.attach(mount, { getRow: () => ({ he: "בנימה", he_niqqud: "בְּנִימָה" }), lookupUserMeaning: async () => "моё значение" });
      const card = await R.resolveWordLight("בנימה", "בְּנִימָה");
      return { meaning: card.meaning, src: card.meaningSource };
    });
    eq(tbRe.meaning === "моё значение" && tbRe.src === "user", "lookupUserMeaning must re-surface a saved user-meaning on re-open (meaningSource=user), got " + JSON.stringify(tbRe));

    // ── T-a regression — ktiv male/chaser cross-column consistency. The plain text (חרישי, plene)
    //    and the vocalized form (חֵרִשִׁי → חרשי, defective) differ, so an UNCONFIDENT word's surface
    //    key used to split between the two columns: a status set once coloured only one column.
    //    Fix = positional alignment fallback (gives the plene word its niqqud) + niqqud-derived
    //    status key. A single tap must now colour the word in BOTH columns. (Real owner-reported
    //    case from «חֲרוּז נִשְׁכָּח».)
    const kv = await pg.evaluate(async () => {
      const R = window.ReaderMorph;
      try { R.closeSheet(); } catch (_) {}
      document.querySelectorAll("#rm-kv").forEach((n) => n.remove());
      const row = { he: "לקול חרישי", he_niqqud: "לְקוֹל חֵרִשִׁי" };
      const mount = document.createElement("div"); mount.id = "rm-kv";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">' + row.he + '</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">' + row.he_niqqud + '</td></tr></tbody></table>';
      document.body.appendChild(mount);
      if (window.__rmKV) { try { window.__rmKV.detach(); } catch (_) {} }
      window.__rmKV = R.attach(mount, { getRow: () => row });
      const eng = await R.ensureEngine();
      const al = R.alignSurfaceNiqqud(row.he, row.he_niqqud);
      const alignedNiqqud = (al[1] || {}).niqqud || "";
      const heSpans = mount.querySelectorAll('td[data-col="he"] .rm-w');
      const niqSpans = mount.querySelectorAll('td[data-col="niqqud"] .rm-w');
      const heW = heSpans[heSpans.length - 1], niqW = niqSpans[niqSpans.length - 1];
      // ONE tap (niqqud column) → save key
      const card = await R.resolveWordLight(niqW.getAttribute("data-surface"), niqW.getAttribute("data-niqqud"));
      const states = {}; states[card.lemmaKey] = "l3";
      await R.decorateWords(mount, states, { color: true, fadeMode: "full" });
      return {
        alignedNiqqud, saveKey: card.lemmaKey,
        heSurf: heW.getAttribute("data-surface"), niqSurf: niqW.getAttribute("data-surface"),
        hePainted: heW.classList.contains("rm-w-l3"), niqPainted: niqW.classList.contains("rm-w-l3"),
      };
    });
    eq(kv.alignedNiqqud.length > 0, "alignSurfaceNiqqud must pair a plene plain word (חרישי) with its defective vocalized form (חֵרִשִׁי), got " + JSON.stringify(kv.alignedNiqqud));
    eq(kv.heSurf !== kv.niqSurf, "sanity: plene plain surface vs niqqud-stripped surface should genuinely differ here, got " + JSON.stringify([kv.heSurf, kv.niqSurf]));
    eq(kv.hePainted && kv.niqPainted, "a status set once must colour a ktiv-variant word in BOTH columns, got " + JSON.stringify({ hePainted: kv.hePainted, niqPainted: kv.niqPainted, saveKey: kv.saveKey }));

    // ── T-a regression — function word carrying a Pealim-link id (גם→pid, owner-reported on prod).
    //    resolveWordLight enriches a function word with a PealimFunctionLinks id (key → pid:N), but
    //    decorateWords resolves with resolveCore only; without mirroring the function-link lookup the
    //    paint key stayed surface#pos and the marked word never coloured. Mock the links so the
    //    assertion is deterministic regardless of the shipped dataset (prod has גם→3304, לא→2943).
    const fnpid = await pg.evaluate(async () => {
      const R = window.ReaderMorph;
      try { R.closeSheet(); } catch (_) {}
      const savedFL = window.PealimFunctionLinks;
      window.PealimFunctionLinks = { lookup: (s) => (R.stripNiqqud(s) === "גם" ? { id: "999777", pos: "other" } : null) };
      try {
        document.querySelectorAll("#rm-fp").forEach((n) => n.remove());
        const row = { he: "גם זה", he_niqqud: "גַם זֶה" };
        const mount = document.createElement("div"); mount.id = "rm-fp";
        mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
          '<td data-col="he" class="rtl rtl-he">' + row.he + '</td>' +
          '<td data-col="niqqud" class="rtl rtl-he-niqqud">' + row.he_niqqud + '</td></tr></tbody></table>';
        document.body.appendChild(mount);
        if (window.__rmFP) { try { window.__rmFP.detach(); } catch (_) {} }
        window.__rmFP = R.attach(mount, { getRow: () => row });
        const niqSpans = mount.querySelectorAll('td[data-col="niqqud"] .rm-w');
        const card = await R.resolveWordLight(niqSpans[0].getAttribute("data-surface"), niqSpans[0].getAttribute("data-niqqud"));
        const states = {}; states[card.lemmaKey] = "known";
        await R.decorateWords(mount, states, { color: true, fadeMode: "full" });
        const heW = mount.querySelector('td[data-col="he"] .rm-w');
        const niqW = mount.querySelector('td[data-col="niqqud"] .rm-w');
        return { saveKey: card.lemmaKey, hePainted: heW.classList.contains("rm-w-known"), niqPainted: niqW.classList.contains("rm-w-known") };
      } finally { window.PealimFunctionLinks = savedFL; }
    });
    eq(fnpid.saveKey === "pid:999777", "a function word with a PealimFunctionLinks id must key by pid (save path), got " + JSON.stringify(fnpid.saveKey));
    eq(fnpid.hePainted && fnpid.niqPainted, "decorateWords must mirror the function-link pid so a marked function word (גם/לא) colours in BOTH columns, got " + JSON.stringify(fnpid));

    // ── Palette — status→class mapping (decorateWords paints the right .rm-w-* per state) ──
    const palette = await pg.evaluate(async () => {
      const R = window.ReaderMorph, NA = window.NotesAutoGen;
      document.querySelectorAll("#rm-pal").forEach((n) => n.remove());
      const mount = document.createElement("div"); mount.id = "rm-pal";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">שלום</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">שָׁלוֹם</td></tr></tbody></table>';
      document.body.appendChild(mount);
      R.attach(mount, { getRow: () => ({ he: "שלום", he_niqqud: "שָׁלוֹם" }) });   // wrap words into .rm-w spans
      const eng = await R.ensureEngine();
      const card = await R.resolveCore(eng, "שלום", "שָׁלוֹם");
      const lk = NA.lemmaKey({ pealim_id: card.pealim_id, lemma: card.lemma, word: card.word, pos: card.pos });
      const CLS = { "new": "rm-w-new", l1: "rm-w-l1", l2: "rm-w-l2", l3: "rm-w-l3", l4: "rm-w-l4", known: "rm-w-known", ignore: "rm-w-ignore", learning: "rm-w-learning" };
      const got = {};
      for (const st of Object.keys(CLS)) {
        const states = {}; states[lk] = st;
        await R.decorateWords(mount, states, { color: true, fadeMode: "full" });
        const span = mount.querySelector('td[data-col="he"] .rm-w');
        got[st] = CLS[st] && span.classList.contains(CLS[st]);
      }
      return got;
    });
    for (const st of ["new", "l1", "l2", "l3", "l4", "known", "ignore", "learning"]) {
      eq(palette[st], "status '" + st + "' must paint its .rm-w class (decorateWords mapping)");
    }

    // ── Regression: row «ועברה על לבי, ונגעה בנימה» — על=function, בנימה=unknown (NOT coloured),
    //    while ועברה/לבי/ונגעה are content «exact» (coloured). Honest-gate, measured 2026-06-27. ──
    const row = await pg.evaluate(async () => {
      const R = window.ReaderMorph, eng = await R.ensureEngine(), strip = R.stripNiqqud;
      const probe = async (s, n) => { const c = await R.resolveCore(eng, strip(n) || s, n); return { label: c.label, confident: c.label === "exact" || c.label === "likely", fn: R.functionGate(strip(n) || s).isFunc }; };
      return {
        overa: await probe("ועברה", "וְעָבְרָה"), al: await probe("על", "עַל"), libi: await probe("לבי", "לִבִּי"),
        nagea: await probe("ונגעה", "וְנָגְעָה"), benima: await probe("בנימה", "בְּנִימָה"),
      };
    });
    eq(row.overa.confident && row.libi.confident && row.nagea.confident, "content words ועברה/לבי/ונגעה must resolve «exact» (coloured)");
    eq(row.al.label === "function" && row.al.fn && !row.al.confident, "על must be a FUNCTION word → honestly NOT coloured (not a bug), got " + JSON.stringify(row.al));
    eq(row.benima.label === "unknown" && !row.benima.confident, "בנימה must be «unknown» (נימה not in offline dict) → honestly NOT coloured (not a keying bug), got " + JSON.stringify(row.benima));

    // ── T-a — manual status colours UNCONFIDENT words (function/unknown) by SURFACE; without an
    //    explicit user engagement they stay plain (honest — never auto-fabricated). ──
    const ta = await pg.evaluate(async () => {
      const R = window.ReaderMorph, NA = window.NotesAutoGen;
      document.querySelectorAll("#rm-ta").forEach((n) => n.remove());
      const mount = document.createElement("div"); mount.id = "rm-ta";
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
        '<td data-col="he" class="rtl rtl-he">על בנימה</td>' +
        '<td data-col="niqqud" class="rtl rtl-he-niqqud">עַל בְּנִימָה</td></tr></tbody></table>';
      document.body.appendChild(mount);
      R.attach(mount, { getRow: () => ({ he: "על בנימה", he_niqqud: "עַל בְּנִימָה" }) });
      const eng = await R.ensureEngine();
      const key = async (s, n) => { const c = await R.resolveCore(eng, s, n); return NA.lemmaKey({ pealim_id: c.pealim_id, lemma: c.lemma, word: c.word, pos: c.pos }); };
      const alKey = await key("על", "עַל"), bnKey = await key("בנימה", "בְּנִימָה");
      const clsOf = (surf) => { const s = mount.querySelector('td[data-col="he"] .rm-w[data-surface="' + surf + '"]'); return s ? s.className : ""; };
      await R.decorateWords(mount, {}, { color: true, fadeMode: "full" });   // (b) no engagement → plain
      const plainAl = clsOf("על"), plainBn = clsOf("בנימה");
      const states = {}; states[alKey] = "known"; states[bnKey] = "l2";       // (a) manual → colour by surface
      await R.decorateWords(mount, states, { color: true, fadeMode: "full" });
      return { alKey, bnKey, plainAl, plainBn, colAl: clsOf("על"), colBn: clsOf("בנימה") };
    });
    eq(!/rm-w-/.test(ta.plainAl) && !/rm-w-/.test(ta.plainBn), "T-a: unconfident words with NO engagement must stay plain (no rm-w-*), got al=" + JSON.stringify(ta.plainAl) + " bn=" + JSON.stringify(ta.plainBn));
    eq(/rm-w-known/.test(ta.colAl), "T-a: a manual status on the FUNCTION word על must colour it by surface, got " + JSON.stringify(ta.colAl) + " key=" + ta.alKey);
    eq(/rm-w-l2/.test(ta.colBn), "T-a: a manual status on the OUT-OF-DICT word בנימה must colour it by surface, got " + JSON.stringify(ta.colBn) + " key=" + ta.bnKey);

    // ── Epic 4.3a+ — collectNewWords v2: full frontier (uncapped), freq-rank, key-parity, function
    //    exclusion, scope (rowFrom/rowTo), name-suspect flag. Two-row mount for the scope test.
    const cnw = await pg.evaluate(async () => {
      const R = window.ReaderMorph, NA = window.NotesAutoGen;
      document.querySelectorAll("#rm-cnw").forEach((n) => n.remove());
      const r0 = { he: "שלום שלום שלום צבי אין", he_niqqud: "שָׁלוֹם שָׁלוֹם שָׁלוֹם צְבִי אֵין" };
      const r1 = { he: "ספר ספר", he_niqqud: "סֵפֶר סֵפֶר" };
      const rows = [r0, r1];
      const mount = document.createElement("div"); mount.id = "rm-cnw";
      mount.innerHTML = '<table id="proTable"><tbody>' +
        '<tr data-row-idx="0"><td data-col="he" class="rtl rtl-he">' + r0.he + '</td><td data-col="niqqud" class="rtl rtl-he-niqqud">' + r0.he_niqqud + '</td></tr>' +
        '<tr data-row-idx="1"><td data-col="he" class="rtl rtl-he">' + r1.he + '</td><td data-col="niqqud" class="rtl rtl-he-niqqud">' + r1.he_niqqud + '</td></tr>' +
        '</tbody></table>';
      document.body.appendChild(mount);
      R.attach(mount, { getRow: (i) => rows[i] });
      const eng = await R.ensureEngine();
      const keyOf = async (s, n) => { const c = await R.resolveCore(eng, s, n); return NA.lemmaKey({ pealim_id: c.pealim_id, lemma: c.lemma, word: c.word, pos: c.pos }); };
      const shalomKey = await keyOf("שלום", "שָׁלוֹם");
      const seferKey = await keyOf("ספר", "סֵפֶר");
      const all = await R.collectNewWords(mount, {});                              // NO topN → full frontier
      const scoped = await R.collectNewWords(mount, {}, { rowFrom: 1 });           // only row 1 (ספר)
      const minus = await R.collectNewWords(mount, { [shalomKey]: "known" });      // mark known → must drop
      const withNew = await R.collectNewWords(mount, { [shalomKey]: "new" });      // mark new → must stay
      const e0 = all[0] || {};
      const tzvi = all.find((w) => R.stripNiqqud(w.niqqud || w.surface || "") === "צבי") || null;
      const shalomEntry = all.find((w) => w.lemmaKey === shalomKey) || null;
      return {
        shalomKey, seferKey, allLen: all.length,
        words: all.map((w) => ({ k: w.lemmaKey, he: w.niqqud, freq: w.freq, name: w.nameSuspect })),
        firstKey: e0.lemmaKey,
        hasFunc: all.some((w) => R.stripNiqqud(w.niqqud || w.surface || "") === "אין"),
        shalomEntry, tzviName: tzvi ? tzvi.nameSuspect : null, shalomName: shalomEntry ? shalomEntry.nameSuspect : null,
        scopedKeys: scoped.map((w) => w.lemmaKey), scopedLen: scoped.length,
        minusHasShalom: minus.some((w) => w.lemmaKey === shalomKey),
        withNewHasShalom: withNew.some((w) => w.lemmaKey === shalomKey),
      };
    });
    eq(cnw.shalomEntry, "collectNewWords must include the confident frontier word שלום, got " + JSON.stringify(cnw.words));
    eq(cnw.shalomEntry && cnw.shalomEntry.freq === 3, "collectNewWords must count in-text frequency (שלום ×3), got " + JSON.stringify(cnw.shalomEntry && cnw.shalomEntry.freq));
    eq(cnw.firstKey === cnw.shalomKey, "collectNewWords must rank most-frequent first (שלום ×3 before others), got " + JSON.stringify(cnw.words));
    eq(cnw.allLen >= 3, "collectNewWords WITHOUT topN must return the FULL frontier (שלום+ספר+צבי ≥3), got " + cnw.allLen);
    eq(cnw.shalomEntry && /мир/.test(cnw.shalomEntry.gloss || "") && /[֑-ׇ]/.test(cnw.shalomEntry.niqqud || ""), "a collected word must carry its vocalized form + gloss, got " + JSON.stringify(cnw.shalomEntry));
    eq(!cnw.hasFunc, "collectNewWords must EXCLUDE function words (אין — no paradigm to study), got " + JSON.stringify(cnw.words));
    eq(cnw.tzviName === true, "צבי (a NAME_HINT homograph) must carry nameSuspect=true, got " + JSON.stringify(cnw.tzviName) + " words=" + JSON.stringify(cnw.words));
    eq(cnw.shalomName === false, "שלום (not a name homograph) must NOT be nameSuspect, got " + JSON.stringify(cnw.shalomName));
    eq(cnw.scopedLen === 1 && cnw.scopedKeys[0] === cnw.seferKey, "scope {rowFrom:1} must collect ONLY row-1 words (ספר), not row-0 (שלום/צבי), got " + JSON.stringify(cnw.scopedKeys));
    eq(!cnw.minusHasShalom, "a word marked 'known' must DROP from collectNewWords (frontier = new/undefined) — proves save-key==collect-key parity");
    eq(cnw.withNewHasShalom, "a word marked 'new' must STAY in collectNewWords (new = tracking, not known)");

    // ── Epic 4.3a+ — openWordCard: a «📚 Учить» row expands to the SAME rich tap-card, surfacing the
    //    FORM-level analysis (כּוֹתֵב present m.sg → verb/paal + conjugation), not just the lemma gloss.
    const owc = await pg.evaluate(async () => {
      const R = window.ReaderMorph;
      try { R.closeSheet(); } catch (_) {}
      await R.openWordCard("כותב", "כּוֹתֵב");
      for (let i = 0; i < 60; i++) { if (document.querySelector(".rm-sheet.rm-open .rm-prov")) break; await new Promise((r) => setTimeout(r, 100)); }
      const body = document.querySelector(".rm-sheet-body");
      return { open: !!document.querySelector(".rm-sheet.rm-open"), text: body ? body.textContent : "", hasConj: !!document.querySelector(".rm-acc-conj"), isVerb: !!(body && /глагол|paal/i.test(body.textContent)) };
    });
    eq(owc.open, "openWordCard must open the rich card sheet (study-row expand)");
    eq(/כתב/.test(owc.text), "openWordCard card must show the root כתב (form→lemma analysis), got " + JSON.stringify(owc.text.slice(0, 80)));
    eq(owc.hasConj, "openWordCard card must include the conjugation table (form-level detail beyond the lemma gloss «писать»)");
    eq(owc.isVerb, "openWordCard for כּוֹתֵב must reveal it is a verb/paal (not just the bare infinitive gloss)");

    // ── Epic 4.3b — recall-loop / cloze engine core (pure helpers + collectReviewItems). ──
    const rc = await pg.evaluate(async () => {
      const R = window.ReaderMorph, NA = window.NotesAutoGen;
      // pure: buildCloze — blank the 2nd word (offset 1), keep separators
      const toks = R.tokenize("שלום עולם טוב");
      const cz = R.buildCloze(toks, 1);
      // pure: nextLevel — gentle floors
      const up = ["new", "l1", "l2", "l3", "l4", "known"].map((s) => R.nextLevel(s, true));
      const down = ["new", "l1", "l2", "l3", "l4", "known"].map((s) => R.nextLevel(s, false));
      // pure: isMcLevel
      const mc = { newm: R.isMcLevel("new"), l2: R.isMcLevel("l2"), l3: R.isMcLevel("l3"), known: R.isMcLevel("known") };
      // pure: pickDistractors — morpho-honest, deterministic
      const answer = { lemmaKey: "pid:1", surface: "כותב", niqqud: "כּוֹתֵב", root: "כתב", pos: "verb", freq: 5 };
      const pool = [
        answer,
        { lemmaKey: "pid:2", surface: "נכתב", niqqud: "נִכְתָּב", root: "כתב", pos: "verb", freq: 2 },   // same root → top
        { lemmaKey: "pid:3", surface: "קורא", niqqud: "קוֹרֵא", root: "קרא", pos: "verb", freq: 9 },     // same POS
        { lemmaKey: "pid:4", surface: "בית", niqqud: "בַּיִת", root: "בית", pos: "noun", freq: 9 },       // other POS
      ];
      const d1 = R.pickDistractors(answer, pool, 3);
      const d2 = R.pickDistractors(answer, pool, 3);
      // browser: collectReviewItems on a 2-row mount; mark שלום l2
      document.querySelectorAll("#rm-rc").forEach((n) => n.remove());
      const r0 = { he: "שלום עולם", he_niqqud: "שָׁלוֹם עוֹלָם" };
      const r1 = { he: "ספר טוב", he_niqqud: "סֵפֶר טוֹב" };
      const rows = [r0, r1];
      const mount = document.createElement("div"); mount.id = "rm-rc";
      mount.innerHTML = '<table id="proTable"><tbody>' +
        '<tr data-row-idx="0"><td data-col="he" class="rtl rtl-he">' + r0.he + '</td><td data-col="niqqud" class="rtl rtl-he-niqqud">' + r0.he_niqqud + '</td></tr>' +
        '<tr data-row-idx="1"><td data-col="he" class="rtl rtl-he">' + r1.he + '</td><td data-col="niqqud" class="rtl rtl-he-niqqud">' + r1.he_niqqud + '</td></tr>' +
        '</tbody></table>';
      document.body.appendChild(mount);
      R.attach(mount, { getRow: (i) => rows[i] });
      const eng = await R.ensureEngine();
      const sc = await R.resolveCore(eng, "שלום", "שָׁלוֹם");
      const shalomKey = NA.lemmaKey({ pealim_id: sc.pealim_id, lemma: sc.lemma, word: sc.word, pos: sc.pos });
      const items = await R.collectReviewItems(mount, { [shalomKey]: "l2" });
      const sh = items.find((x) => x.lemmaKey === shalomKey) || null;
      return {
        cz, up, down, mc, d1Keys: d1.map((x) => x.lemmaKey), d2Keys: d2.map((x) => x.lemmaKey),
        itemCount: items.length, shStatus: sh ? sh.status : null, shOcc: sh ? sh.occ : null,
        hasAllStatuses: items.every((x) => !!x.status), anyOcc: !!(sh && sh.occ && sh.occ.length && sh.occ[0].rowIdx === 0 && typeof sh.occ[0].wordOffset === "number"),
      };
    });
    eq(rc.cz && rc.cz.answer === "עולם" && /שלום/.test(rc.cz.before) && /טוב/.test(rc.cz.after), "buildCloze must blank the offset-th word keeping separators, got " + JSON.stringify(rc.cz));
    eq(JSON.stringify(rc.up) === JSON.stringify(["l1", "l2", "l3", "l4", "known", "known"]), "nextLevel(correct) must climb new→l1→…→known→known, got " + JSON.stringify(rc.up));
    eq(JSON.stringify(rc.down) === JSON.stringify(["new", "l1", "l1", "l2", "l3", "l4"]), "nextLevel(wrong) must be gentle with floors (new→new, l1→l1, known→l4), got " + JSON.stringify(rc.down));
    eq(rc.mc.newm && rc.mc.l2 && !rc.mc.l3 && !rc.mc.known, "isMcLevel: MC for new/l1/l2, typed for l3/l4/known, got " + JSON.stringify(rc.mc));
    eq(rc.d1Keys.length === 3 && rc.d1Keys.indexOf("pid:1") < 0, "pickDistractors must return 3 distractors excluding the answer, got " + JSON.stringify(rc.d1Keys));
    eq(rc.d1Keys[0] === "pid:2", "pickDistractors must rank a SAME-ROOT word first (morpho-honest), got " + JSON.stringify(rc.d1Keys));
    eq(JSON.stringify(rc.d1Keys) === JSON.stringify(rc.d2Keys), "pickDistractors must be deterministic (same input → same output)");
    eq(rc.itemCount >= 3, "collectReviewItems must return ALL confident lemmas (שלום/עולם/ספר/טוב ≥3), got " + rc.itemCount);
    eq(rc.hasAllStatuses, "every review item must carry an effective status (states[lk]||'new')");
    eq(rc.shStatus === "l2", "collectReviewItems must reflect the stored status (שלום→l2), got " + JSON.stringify(rc.shStatus));
    eq(rc.anyOcc, "a review item must carry occurrences {rowIdx,wordOffset} (for the cloze sentence), got " + JSON.stringify(rc.shOcc));

    // ── Epic 4.3b Phase A — buildClozeForTarget (blank-by-skeleton, blank-ALL) + distractor collision guard.
    const phA = await pg.evaluate(() => {
      const R = window.ReaderMorph, strip = R.stripNiqqud;
      const toks = R.tokenize("שלום עולם שלום טוב");                 // target repeats → both must blank
      const cz = R.buildClozeForTarget(toks, strip("שלום"));
      const visible = (cz.segments || []).filter((s) => !s.blank).map((s) => s.t).join("");
      const answer = { lemmaKey: "pid:1", surface: "כתב", niqqud: "כָּתַב", root: "כתב", pos: "verb", freq: 5 };
      const pool = [
        answer,
        { lemmaKey: "pid:2", surface: "כתב", niqqud: "כָּתַב", root: "כתב", pos: "verb", freq: 3 },   // same DISPLAY as answer → must drop
        { lemmaKey: "pid:3", surface: "קרא", niqqud: "קָרָא", root: "קרא", pos: "verb", freq: 9 },
        { lemmaKey: "pid:4", surface: "אמר", niqqud: "אָמַר", root: "אמר", pos: "verb", freq: 8 },
        { lemmaKey: "pid:5", surface: "הלך", niqqud: "הָלַךְ", root: "הלך", pos: "verb", freq: 7 },
      ];
      const d = R.pickDistractors(answer, pool, 3);
      return {
        count: cz.count, answer: cz.answer, blanks: (cz.segments || []).filter((s) => s.blank).length,
        visibleHasTarget: strip(visible).indexOf("שלום") >= 0, nullOnMiss: R.buildClozeForTarget(toks, "זזזז") === null,
        distKeys: d.map((x) => x.lemmaKey), distDisplays: d.map((x) => strip(x.niqqud || x.surface)), answerDisp: strip(answer.niqqud),
      };
    });
    eq(phA.count === 2 && phA.blanks === 2, "A2: buildClozeForTarget must blank ALL copies of a repeated target, got count=" + phA.count + " blanks=" + phA.blanks);
    eq(phA.answer === "שלום", "buildClozeForTarget answer must be the matched vocalized token, got " + JSON.stringify(phA.answer));
    eq(!phA.visibleHasTarget, "A2: no visible copy of the target may remain in the cloze sentence");
    eq(phA.nullOnMiss, "buildClozeForTarget must return null when the target skeleton isn't present (→ unusable occurrence)");
    eq(phA.distKeys.indexOf("pid:2") < 0, "A4: pickDistractors must DROP a distractor whose displayed form equals the answer (pid:2), got " + JSON.stringify(phA.distKeys));
    eq(phA.distDisplays.indexOf(phA.answerDisp) < 0, "A4: no distractor may display the answer's skeleton, got " + JSON.stringify(phA.distDisplays) + " ans=" + phA.answerDisp);
    eq(phA.distKeys.length === 3, "pickDistractors still returns 3 valid distractors after the collision guard, got " + JSON.stringify(phA.distKeys));

    // ── Epic 4.3b Phase C2 — nextSrs (SM2-lite, pure, deterministic with nowMs). ──
    const srs = await pg.evaluate(() => {
      const R = window.ReaderMorph, now = 1000000000000, day = 86400000;
      const a = R.nextSrs(null, true, now);   // new+correct → reps1 interval1
      const b = R.nextSrs(a, true, now);      // reps2 interval3
      const c = R.nextSrs(b, true, now);      // reps3 interval round(3*2.3)=7
      const d = R.nextSrs(c, false, now);     // wrong → reps0 interval0 lapses1 due=now
      return { a, b, c, d, day, now };
    });
    eq(srs.a.reps === 1 && srs.a.interval === 1 && srs.a.due === srs.now + srs.day, "nextSrs new+correct → reps1/interval1/due+1d, got " + JSON.stringify(srs.a));
    eq(srs.b.interval === 3 && srs.b.reps === 2, "nextSrs 2nd correct → interval 3, got " + JSON.stringify(srs.b));
    eq(srs.c.interval === 7 && srs.c.reps === 3, "nextSrs 3rd correct → interval ≈7 (round 3×2.3), got " + JSON.stringify(srs.c));
    eq(srs.d.reps === 0 && srs.d.interval === 0 && srs.d.lapses === 1 && srs.d.due === srs.now, "nextSrs wrong → reps0/interval0/lapse1/due=now, got " + JSON.stringify(srs.d));

    // ── Epic 4.3b Phase D3 — dueCounts (visible due-counter; pure, deterministic, badge==trainer). ──
    const dc = await pg.evaluate(() => {
      const R = window.ReaderMorph, now = 1000000000000, day = 86400000;
      const status = { a: 'l1', b: 'l2', c: 'l4', d: 'known', e: 'new', f: 'ignore', g: 'l3' };  // l1–l4 = 4 in-progress
      const sched = {
        a: { due: now - day },        // overdue → due
        c: { due: now },              // exactly now → due
        f: { due: now - day },        // overdue BUT ignored → NOT counted
        d: { due: now + 2 * day },    // future
        h: { due: now + 5 * day },    // future (further)
      };
      const r = R.dueCounts(status, sched, now);
      const empty = R.dueCounts({}, {}, now);
      const nullSafe = R.dueCounts(null, null, now);
      return { r, empty, nullSafe, now, day };
    });
    eq(dc.r.inProgress === 4, "dueCounts inProgress must count l1–l4 only (=4), got " + dc.r.inProgress);
    eq(dc.r.dueNow === 2, "dueCounts dueNow must count due<=now scheduled, excluding «ignore» (=2), got " + dc.r.dueNow);
    eq(dc.r.nextDue === dc.now + 2 * dc.day, "dueCounts nextDue must be the soonest FUTURE due, got " + JSON.stringify(dc.r.nextDue));
    eq(dc.empty.inProgress === 0 && dc.empty.dueNow === 0 && dc.empty.nextDue === null, "dueCounts empty → 0/0/null, got " + JSON.stringify(dc.empty));
    eq(dc.nullSafe.inProgress === 0 && dc.nullSafe.dueNow === 0 && dc.nullSafe.nextDue === null, "dueCounts null-safe → 0/0/null, got " + JSON.stringify(dc.nullSafe));

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
