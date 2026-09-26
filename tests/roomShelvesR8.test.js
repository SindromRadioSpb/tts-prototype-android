"use strict";

// R8 (UI release program, audit P1-10, P1-12, P1-13, P1-14, P2-12): the Reading Room shelves.
// Measured before (3.11.646, 380, fresh profile): tabs 2 → 3 with a jump, «Литерату…» clipped,
// up to 8 s of spinners and no shelves, «Нужен профиль слов» over the author, «1 строк».

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const html = read("public/library.html");
const ui = read("public/js/library-ui.js");
const fnSource = (name) => {
  const start = ui.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " exists");
  let depth = 0, i = ui.indexOf("{", start);
  for (; i < ui.length; i++) { if (ui[i] === "{") depth++; else if (ui[i] === "}" && --depth === 0) break; }
  return ui.slice(start, i + 1);
};

test("tabs: a fixed set, the default «Библиотека» first and selected from the first frame", () => {
  const tabs = html.match(/<div class="room-tabs" id="roomTabs" role="tablist">([\s\S]*?)<\/div>/)[1];
  const ids = [...tabs.matchAll(/id="(tab\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["tabCorpus", "tabAccessible", "tabLiterary"]);
  assert.match(tabs, /id="tabCorpus" role="tab" aria-selected="true"/);
  assert.doesNotMatch(tabs, /id="tabCorpus"[^>]*\shidden/);
  assert.match(tabs, /id="tabAccessible" role="tab" aria-selected="false"/);
  assert.match(ui, /let activeTrack = 'corpus';/);
  // Hidden only when the catalog did not load (it used to stay visible and empty on a failure).
  const load = fnSource("loadCorpusCatalog");
  assert.match(load, /finally \{[\s\S]*tab\.hidden = !corpusTabReady;/);
});

test("tabs: a segmented control with 44px segments that never ellipsize", () => {
  assert.match(html, /\.room-tabs \{[^}]*background: var\(--bg-muted\);[^}]*border-radius: 12px;[^}]*padding: 4px;/);
  assert.match(html, /\.room-tab \{[^}]*flex: 1 1 auto;[^}]*min-height: 44px;/);
  assert.doesNotMatch(html, /\.room-tab \{[^}]*text-overflow: ellipsis/);
  assert.match(html, /@media \(min-width: 600px\) \{\s*\.room-tabs \{ width: fit-content; \}/, "a desktop control fits its labels");
});

test("loading: a shelf skeleton instead of spinners; the catalog root loads beside the canon import", () => {
  const initial = html.match(/<main id="roomContent">([\s\S]*?)<\/main>/)[1];
  assert.match(initial, /class="room-skeleton" role="status" aria-busy="true"/);
  assert.match(initial, /<span class="room-skeleton-caption" data-i18n="room.state.loading">/);
  assert.match(html, /\.room-skeleton \{ display: grid; gap: 10px; padding: 16px 12px; \}/);
  assert.match(ui, /function roomSkeletonNode\(i18nKey\)/);
  const show = fnSource("showState");
  assert.match(show, /ROOM_SKELETON_STATES\.has\(i18nKey\)/);
  assert.match(ui, /const ROOM_SKELETON_STATES = new Set\(\['room\.state\.loading', 'room\.state\.publishing', 'room\.home\.loading'\]\);/);
  const hub = fnSource("renderCorpusHub");
  assert.match(hub, /roomSkeletonNode\('room\.home\.loading'\)/);
  assert.match(ui, /const corpusCatalogLoad = loadCorpusCatalog\(\);[\s\S]{0,200}await autoImportCanon\(\);[\s\S]{0,200}await corpusCatalogLoad;/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{\s*\.room-skeleton-block \{ animation: none; \}/);
});

test("new profile: no «Нужен профиль слов», no «Не менее 0%», no «0/N» chips", () => {
  const paint = fnSource("paintLearningCompass");
  assert.match(paint, /if \(value\.status === 'NEEDS_PROFILE'\) continue;/);
  assert.match(paint, /Math\.round\(Number\(value\.lower_bound_pct\)\) === 0\) continue;/);
  const feature = fnSource("learningHomeFeature");
  assert.match(feature, /Number\(pick\.familiar\) > 0 && Number\(pick\.denominator\) > 0/);
  const hub = fnSource("renderCorpusHub");
  assert.match(hub, /continueRow \? tt\('room\.home\.overline'/);
  assert.match(hub, /tt\('room\.home\.titleNew'/);
});

test("one material component: end-of-text picks are shelf rows; the author is secondary text", () => {
  const picks = fnSource("appendHandoffPicks");
  assert.match(picks, /renderCorpusWorkRow\(c, true, \{ compact: true, showAuthor: true, materialKind: 'handoff' \}\)/);
  assert.doesNotMatch(picks, /renderCorpusCard\(c\)/);
  assert.match(picks, /class: 'reader-end-next-rail learning-home-ready-list'/);
  assert.match(html, /\.learning-home-ready-list \.work-card-difficulty:not\(:has\(\.learning-signal/);
  assert.match(html, /\.learning-home-ready-list \.work-card-difficulty \{\s*grid-column: 1 \/ -1; grid-row: 3;/);
  assert.match(html, /\.corpus-work-author-link \{\s*width: fit-content;[^}]*color: var\(--text-secondary\);/);
  assert.match(html, /\.corpus-work-author-link:hover, \.corpus-work-author-link:focus-visible \{ text-decoration: underline; \}/);
});

test("row and part counts use plural forms in ru, en and he", () => {
  const src = fnSource("roomCountLabel");
  const locales = {};
  for (const l of ["ru", "en", "he"]) {
    const box = { window: {} };
    vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box);
    const all = box.window.LP_I18N_LOCALES || box.window.I18N_LOCALES || box.window.__LOCALES__ || box.window;
    locales[l] = all;
  }
  const lookup = (l, key) => {
    const roots = Object.values(locales[l]).filter((v) => v && typeof v === "object");
    for (const r of roots) {
      let cur = r;
      for (const k of key.split(".")) cur = cur && cur[k];
      if (typeof cur === "string") return cur;
    }
    return undefined;
  };
  const run = (l, n, kind) => {
    const box = { Intl, document: { documentElement: { lang: l } }, tt: (k, fb) => lookup(l, k) || fb };
    vm.runInNewContext(src + "\nthis.out = roomCountLabel(" + n + ", '" + kind + "');", box);
    return box.out;
  };
  assert.equal(run("ru", 1, "rows"), "1 строка");
  assert.equal(run("ru", 3, "rows"), "3 строки");
  assert.equal(run("ru", 17, "rows"), "17 строк");
  assert.equal(run("ru", 21, "rows"), "21 строка");
  assert.equal(run("ru", 2, "parts"), "2 части");
  assert.equal(run("en", 1, "rows"), "1 line");
  assert.equal(run("en", 17, "rows"), "17 lines");
  assert.equal(run("he", 17, "rows"), "17 שורות");
  assert.match(fnSource("corpusLengthLabel"), /roomCountLabel\(c\.segments, 'rows'\)/);
  assert.doesNotMatch(ui, /tt\('room\.home\.rows', 'строк'\)/);
});

test("new strings exist in every locale", () => {
  for (const l of ["ru", "en", "he"]) {
    const src = read(`public/i18n/locales/${l}.js`);
    for (const re of [/\btitleNew: "/, /\boverlineNew: "/, /units: \{/, /\brows: \{ one: "/, /\bparts: \{ one: "/]) assert.match(src, re, l + " " + re);
  }
});
