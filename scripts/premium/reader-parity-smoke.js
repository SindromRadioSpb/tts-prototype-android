#!/usr/bin/env node
"use strict";
// BRR-P0-002b · Stage 1 · slice 0 — reader-parity GOLDEN gate.
//
// Locks the byte-for-byte (parser-normalized) output of index.html's renderTable
// so the soon-to-be-extracted public/js/reader-core.js can be proven to reproduce
// it EXACTLY before any extraction touches behaviour. The golden IS index.html's
// current renderTable (the source of truth) — reader-core must match it.
//
// What it does (no canon data needed — deterministic synthetic fixture):
//   1) boot /index.html?room=1 with SW blocked + locale pinned ('ru') + 380x844,
//   2) for each (preset × translit-profile) it sets #translitProfileSelect.value,
//      applyPreset(preset), then calls window.renderTable(FIXTURE),
//   3) snapshots normalized #proTable.outerHTML (col widths stripped — layout-
//      nondeterministic) + the per-row window.buildRowTtsCacheKey() array,
//   4) runs R1 Hebrew-fidelity assertions that are INDEPENDENT of the golden
//      (exact niqqud codepoints survive, rtl/rtl-he/-niqqud dir classes present,
//      translit column swaps SBL↔ru-phonetic correctly, audio cache-key is
//      invariant across translit profile yet sensitive to niqqud, escapeHtml holds),
//   5) diffs against the committed golden (scripts/premium/fixtures/reader-parity-golden.json);
//      run with `--update` to (re)generate the golden.
//
// NOTE: index.html renderTable has a latent ASI bug — the thead `</th>` literal is
// swallowed (no `+` before it on l.32878→32879), so the HTML STRING omits </th>;
// the browser auto-closes it on parse. We snapshot the PARSED outerHTML, so the
// golden carries proper </th>. reader-core may emit a correct </th> and still match.
//
// Run:  node scripts/premium/reader-parity-smoke.js            (gate)
//       node scripts/premium/reader-parity-smoke.js --update   (regenerate golden)

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3282, BASE = "http://127.0.0.1:" + PORT;
const GOLDEN_PATH = path.join(__dirname, "fixtures", "reader-parity-golden.json");
const UPDATE = process.argv.includes("--update");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── server lifecycle (same pattern as measure-reader-*.js) ───────────────────
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

// ── fixture: deterministic rows exercising every R1 fidelity dimension ────────
// row0/1/2 carry niqqud (multiple combining vowel points); 0/1/3 carry translit_ru
// (so _hasRuTranslit=true → ru-phonetic honoured); row2 has NO translit_ru (tests the
// per-row `translit_ru || translit` fallback inside a ru-phonetic render); row3 has
// HTML-special chars + empty niqqud (tests escapeHtml + niqqud-empty cell).
const FIXTURE = [
  { he: "שלום",   he_niqqud: "שָׁלוֹם",     translit: "šālôm",   translit_ru: "шало́м",  ru: "мир",      _v3_sentenceId: "s1", _v3_textId: "t1" },
  { he: "בראשית", he_niqqud: "בְּרֵאשִׁית", translit: "bərēšîṯ", translit_ru: "берешит", ru: "в начале", _v3_sentenceId: "s2", _v3_textId: "t1" },
  { he: "אלהים",  he_niqqud: "אֱלֹהִים",    translit: "ʾĕlōhîm", translit_ru: "",        ru: "Бог",      _v3_sentenceId: "s3", _v3_textId: "t1" },
  { he: "A<b>&",  he_niqqud: "",            translit: "x<y",     translit_ru: "и&ли",    ru: "<tag>",    _v3_sentenceId: "s4", _v3_textId: "t1" },
];
const CFG = { providerId: "online_tts", voiceId: "he-IL-Standard-A", rate: 1.0, pitch: 0.0 };
const PRESETS = ["full", "he_ru"];
const PROFILES = ["sbl", "ru-phonetic"];

// Normalize for a DOM-structural (whitespace-insensitive) diff:
//   • strip layout-nondeterministic <col style="width:NN.NNNNNN%"> floats,
//   • collapse whitespace-only gaps BETWEEN tags (>\s+<) so the index.html ASI bug
//     (which parks the stray indentation inside the last <th>) reconciles with the
//     correct </th> reader-core emits. Cell text (incl. niqqud) sits between >...<
//     as NON-whitespace, so it is never touched.
const normalizeHtml = (h) => (h == null ? null : h.replace(/width:\s*[\d.]+%/g, "width:%").replace(/>\s+</g, "><").trim());

// Preset → visible-columns (mirrors index.html applyPreset). Used to drive the
// reader-core builder with the same column set the golden case used.
const PRESET_COLS = {
  full: { action: true, he: true, niqqud: true, translit: true, ru: true },
  he_ru: { action: true, he: true, niqqud: false, translit: false, ru: true },
};

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed to start"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const fail = (msg) => failures.push(msg);
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    // Pin locale BEFORE any page script runs so thead i18n titles are deterministic.
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); } catch (_) {} });
    const pg = await ctx.newPage();
    await pg.goto(BASE + "/index.html?room=1", { waitUntil: "load" });

    // renderTable & friends are top-level functions in index.html's classic scripts → on window.
    await pg.waitForFunction(() =>
      typeof window.renderTable === "function" &&
      typeof window.t === "function" &&
      typeof window.applyPreset === "function" &&
      typeof window.buildRowTtsCacheKey === "function" &&
      typeof window.getRowTtsTextForRow === "function" &&
      !!document.getElementById("tableContainer") &&
      !!document.getElementById("translitProfileSelect"),
      { timeout: 20000 });

    const cases = {}; // key "preset|profile" -> { html, cells, dataCols, keys, keyNoNiqqud0, renderErr }
    for (const preset of PRESETS) {
      for (const profile of PROFILES) {
        const cap = await pg.evaluate(({ rows, profile, preset, cfg }) => {
          // Neutralize POST-render Studio mutators so we snapshot the PURE builder
          // output (what reader-core reproduces), not environmental DOM mutations.
          // v3PortableTtsApplyUiState rewrites row-tts-btn title/aria-label from the
          // async TTS-provider state ("unavailable"→"System fallback") — non-deterministic
          // and NOT part of the builder. v3AudioPrefetchRefreshMarkers paints row-audio-ind.
          window.v3PortableTtsApplyUiState = function () {};
          window.v3AudioPrefetchRefreshMarkers = function () {};
          // attachResizeHandlers (bare call in renderTable's tail) stamps the table
          // with data-resize-bound="1" — a MOUNT concern the pure builder doesn't emit
          // (library.html wires resize at mount in slice 3). No-op it so the golden is
          // the pure builder output that reader-core.buildBilingualTableHtml reproduces.
          window.attachResizeHandlers = function () {};
          const sel = document.getElementById("translitProfileSelect");
          if (sel) sel.value = profile;
          let renderErr = null;
          try { window.applyPreset(preset); } catch (e) { renderErr = "applyPreset: " + e; }
          try { window.renderTable(rows); } catch (e) { renderErr = (renderErr ? renderErr + "; " : "") + "renderTable: " + e; }
          const tbl = document.getElementById("proTable");
          const cellOf = (tr, col) => { const td = tr && tr.querySelector('td[data-col="' + col + '"]'); return td ? { text: td.textContent, cls: td.className } : null; };
          const cells = rows.map((_row, i) => {
            const tr = tbl ? tbl.querySelector('tbody tr[data-row-idx="' + i + '"]') : null;
            return { he: cellOf(tr, "he"), niqqud: cellOf(tr, "niqqud"), translit: cellOf(tr, "translit"), ru: cellOf(tr, "ru") };
          });
          const keys = rows.map((row) => window.buildRowTtsCacheKey(window.getRowTtsTextForRow(row), "he-IL", cfg));
          const keyNoNiqqud0 = window.buildRowTtsCacheKey(rows[0].he, "he-IL", cfg); // row0's he-only text
          return { html: tbl ? tbl.outerHTML : null, cells, dataCols: tbl ? tbl.getAttribute("data-cols") : null, keys, keyNoNiqqud0, renderErr };
        }, { rows: FIXTURE, profile, preset, cfg: CFG });

        const key = preset + "|" + profile;
        if (cap.renderErr) fail(`[${key}] render error: ${cap.renderErr}`);
        if (!cap.html) { fail(`[${key}] no #proTable produced`); continue; }
        cases[key] = cap;

        const visible = (cap.dataCols || "").split(",");
        // ── R1 assertions (golden-independent) ──────────────────────────────
        FIXTURE.forEach((row, i) => {
          const c = cap.cells[i];
          // A1+A2 niqqud: exact codepoints survive + dir class present (when column visible)
          if (visible.includes("niqqud") && row.he_niqqud) {
            if (!c.niqqud || c.niqqud.text !== row.he_niqqud) fail(`[${key}] row${i} niqqud codepoints altered: got ${JSON.stringify(c.niqqud && c.niqqud.text)} want ${JSON.stringify(row.he_niqqud)}`);
            if (c.niqqud && !/\brtl-he-niqqud\b/.test(c.niqqud.cls)) fail(`[${key}] row${i} niqqud cell missing rtl-he-niqqud class (dir mechanism): ${c.niqqud.cls}`);
          }
          // A2 he: rtl-he class + escapeHtml round-trip (textContent === raw, proves no HTML interpretation)
          if (visible.includes("he")) {
            if (!c.he || c.he.text !== row.he) fail(`[${key}] row${i} he cell mismatch (escapeHtml?): got ${JSON.stringify(c.he && c.he.text)} want ${JSON.stringify(row.he)}`);
            if (c.he && !/\brtl-he\b/.test(c.he.cls)) fail(`[${key}] row${i} he cell missing rtl-he class: ${c.he.cls}`);
          }
          // A3 translit profile swap (only where translit column visible)
          if (visible.includes("translit")) {
            const want = profile === "ru-phonetic" ? (row.translit_ru || row.translit || "") : (row.translit || "");
            if (!c.translit || c.translit.text !== want) fail(`[${key}] row${i} translit swap wrong: got ${JSON.stringify(c.translit && c.translit.text)} want ${JSON.stringify(want)}`);
          }
        });
        // A5 cache-key niqqud-sensitivity: row0 (niqqud) key differs from its he-only key
        if (cap.keys[0] === cap.keyNoNiqqud0) fail(`[${key}] cache-key NOT niqqud-sensitive (getRowTtsTextForRow must prefer he_niqqud)`);
      }
    }

    // A4 cache-key invariance across translit profile AND across column presets
    const allKeys = Object.entries(cases).map(([k, v]) => [k, JSON.stringify(v.keys)]);
    if (allKeys.length) {
      const ref = allKeys[0][1];
      for (const [k, kk] of allKeys) if (kk !== ref) fail(`[${k}] audio cache-keys diverged from ${allKeys[0][0]} (must be profile/column-independent): ${kk} vs ${ref}`);
    }

    // ── golden compare / update ─────────────────────────────────────────────
    const goldenCases = {};
    for (const [k, v] of Object.entries(cases)) goldenCases[k] = { html: normalizeHtml(v.html), cacheKeys: v.keys };
    const golden = { _meta: { fixtureVersion: 1, locale: "ru", cfg: CFG, presets: PRESETS, profiles: PROFILES, note: "Generated from index.html renderTable (source of truth). tbody = R1 fidelity surface. col widths normalized to 'width:%'." }, cases: goldenCases };

    if (UPDATE) {
      fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
      fs.writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + "\n", "utf8");
      console.log("golden written → " + path.relative(REPO, GOLDEN_PATH) + " (" + Object.keys(goldenCases).length + " cases)");
    } else if (!fs.existsSync(GOLDEN_PATH)) {
      fail("no golden file — run with --update first: " + path.relative(REPO, GOLDEN_PATH));
    } else {
      const prev = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
      for (const k of Object.keys(goldenCases)) {
        const a = prev.cases && prev.cases[k], cur = goldenCases[k];
        if (!a) { fail(`golden missing case ${k}`); continue; }
        if (a.html !== cur.html) fail(`[${k}] table DOM drift vs golden`);
        if (JSON.stringify(a.cacheKeys) !== JSON.stringify(cur.cacheKeys)) fail(`[${k}] audio cache-keys drift vs golden`);
      }
      for (const k of Object.keys((prev && prev.cases) || {})) if (!goldenCases[k]) fail(`golden has extra case ${k} not produced`);
    }

    // ── slice 1: reader-core.js leaf parity (vs index.html live fns + golden) ──
    const refKeys = (cases["full|sbl"] || {}).keys || [];
    const leaf = await pg.evaluate(async ({ fixture, cfg, refKeys }) => {
      let m; try { m = await import("/js/reader-core.js"); } catch (e) { return { err: "import /js/reader-core.js failed: " + e }; }
      const fails = [];
      let checks = 0;
      const eq = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
      const hasW = (n) => typeof window[n] === "function" || (eq(false, "index.html missing window." + n), false);
      // escapeHtml — byte-identical to index.html
      if (hasW("escapeHtml")) for (const s of ["A<b>&", "\"q'q\"", "", "<>&\"'", "שָׁלוֹם", null])
        eq(m.escapeHtml(s) === window.escapeHtml(s), "escapeHtml(" + JSON.stringify(s) + "): " + JSON.stringify(m.escapeHtml(s)) + " vs " + JSON.stringify(window.escapeHtml(s)));
      // fnv1aHash
      if (hasW("fnv1aHash")) for (const s of ["", "abc", "שָׁלוֹם", "v1|online_tts|he-IL"])
        eq(m.fnv1aHash(s) === window.fnv1aHash(s), "fnv1aHash(" + JSON.stringify(s) + ")");
      // getRowTtsTextForRow + buildRowTtsCacheKey — vs index.html AND vs golden keys
      const hasTxt = hasW("getRowTtsTextForRow"), hasKey = hasW("buildRowTtsCacheKey");
      fixture.forEach((row, i) => {
        if (hasTxt) eq(m.getRowTtsTextForRow(row) === window.getRowTtsTextForRow(row), "getRowTtsTextForRow row" + i);
        if (hasTxt && hasKey) {
          const k = m.buildRowTtsCacheKey(m.getRowTtsTextForRow(row), "he-IL", cfg);
          eq(k === window.buildRowTtsCacheKey(window.getRowTtsTextForRow(row), "he-IL", cfg), "buildRowTtsCacheKey row" + i + " vs index.html");
          if (refKeys[i] != null) eq(k === refKeys[i], "buildRowTtsCacheKey row" + i + " vs golden: " + k + " vs " + refKeys[i]);
        }
      });
      // mapSentenceRowToUiRow — vs index.html v3MapSentenceApiRowToUiRow
      if (hasW("v3MapSentenceApiRowToUiRow")) {
        const dbRows = [
          { id: 7, he_plain: "שלום", he_niqqud: "שָׁלוֹם", translit: "x", translit_ru: "ы", ru: "мир", order_index: 2, audio_asset_key: "ak", audio_tts_profile_json: "{}" },
          { sentenceId: "z", heNiqqud: "בְּ", ru: "b" },
          {},
        ];
        dbRows.forEach((r, i) => {
          const a = JSON.stringify(m.mapSentenceRowToUiRow(r, "t1")), bb = JSON.stringify(window.v3MapSentenceApiRowToUiRow(r, "t1"));
          eq(a === bb, "mapSentenceRowToUiRow row" + i + ": " + a + " vs " + bb);
        });
      }
      // column-geometry invariants (sum→100, hidden→0)
      const near100 = (n) => Math.abs(n - 100) < 1e-6;
      const presets = {
        full: { action: true, he: true, niqqud: true, translit: true, ru: true },
        he_ru: { action: true, he: true, niqqud: false, translit: false, ru: true },
        he_only: { action: false, he: true, niqqud: false, translit: false, ru: false },
      };
      for (const [name, vc] of Object.entries(presets)) {
        const bw = [15, 20, 20, 21, 24];
        m.normalizeVisibleBaseWidthsTo100(vc, bw);
        let svis = 0; m.TABLE_COL_ORDER.forEach((k, idx) => { if (vc[k]) svis += bw[idx]; });
        eq(near100(svis), "normalize " + name + " visible-sum=" + svis);
        const eff = m.computeEffectiveWidths(vc, bw);
        let evis = 0; m.TABLE_COL_ORDER.forEach((k) => { if (vc[k]) evis += eff[k]; else eq(eff[k] === 0, "effWidth hidden " + name + "/" + k + "=" + eff[k]); });
        eq(near100(evis), "computeEffectiveWidths " + name + " visible-sum=" + evis);
      }
      return { fails, checks };
    }, { fixture: FIXTURE, cfg: CFG, refKeys });
    if (leaf.err) fail("reader-core leaf: " + leaf.err);
    else for (const f of leaf.fails) fail("reader-core leaf: " + f);
    if (!leaf.err) console.log(`reader-core leaf parity: ${leaf.checks} checks vs index.html live fns + golden`);

    // ── slice 2: reader-core.buildBilingualTableHtml parity vs golden ─────────
    // Drive the pure builder with the same fixture/preset/profile the golden used,
    // parse it (detached, so the browser normalizes the bug-free </th> the same way),
    // and assert DOM-identity with index.html renderTable (whitespace-normalized).
    const firstDiff = (a, b) => {
      const n = Math.min(a.length, b.length); let i = 0; while (i < n && a[i] === b[i]) i++;
      return `@${i} (lenGot=${a.length} lenWant=${b.length}) got…${JSON.stringify(a.slice(Math.max(0, i - 30), i + 30))} want…${JSON.stringify(b.slice(Math.max(0, i - 30), i + 30))}`;
    };
    const build = await pg.evaluate(async ({ presetCols, profiles, fixture }) => {
      let m; try { m = await import("/js/reader-core.js"); } catch (e) { return { err: "import: " + e }; }
      if (typeof m.buildBilingualTableHtml !== "function") return { err: "reader-core has no buildBilingualTableHtml" };
      const t = typeof window.t === "function" ? window.t : (k) => k;
      const out = {};
      for (const preset of Object.keys(presetCols)) {
        for (const profile of profiles) {
          const html = m.buildBilingualTableHtml(fixture, {
            visibleColumns: JSON.parse(JSON.stringify(presetCols[preset])),
            baseWidths: [15, 20, 20, 21, 24],
            translitProfile: profile, ideMode: false, t,
          });
          const d = document.createElement("div"); d.innerHTML = html;
          const tbl = d.querySelector("table");
          out[preset + "|" + profile] = tbl ? tbl.outerHTML : null;
        }
      }
      return { out };
    }, { presetCols: PRESET_COLS, profiles: PROFILES, fixture: FIXTURE });
    if (build.err) fail("reader-core builder: " + build.err);
    else {
      let n = 0;
      for (const [k, raw] of Object.entries(build.out)) {
        n++;
        const got = normalizeHtml(raw), want = (goldenCases[k] || {}).html;
        if (!want) fail(`builder ${k}: no golden case to compare`);
        else if (got !== want) fail(`builder ${k}: DOM differs from renderTable golden — ${firstDiff(got, want)}`);
      }
      console.log(`reader-core builder parity: ${n} cases (buildBilingualTableHtml === renderTable golden, whitespace-normalized)`);
    }

    const total = Object.keys(cases).length;
    console.log(`reader-parity: ${total} cases (${PRESETS.length}×${PROFILES.length}), ${FIXTURE.length} fixture rows`);
    if (failures.length) {
      console.error("\nFAIL (" + failures.length + "):");
      for (const f of failures) console.error("  ✗ " + f);
      await b.close(); await stop(srv.c); process.exit(1);
    }
    console.log("PASS — reader-parity golden + R1 fidelity assertions green");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
