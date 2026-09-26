"use strict";

// R7 (UI release program, audit P0-3): the Studio showed every visitor the server's aggregate
// usage (all users' TTS characters and Gemini requests, «Сегодня 21 / 50») as if it were their own.
// Gemini locking reacts only to the provider's answer for the user's own key, so the panel was
// display-only: it is hidden for users and fetched only in the owner's diagnostic view (?diag=1).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public/index.html"), "utf8").replace(/\r\n/g, "\n");

test("the server usage panel is hidden by default and never fetched outside diagnostics", () => {
  assert.match(html, /<details id="classicStatusStrip" class="classic-status-strip-wrap" hidden>/);
  assert.match(html, /#classicStatusStrip\[hidden\] \{ display: none !important; \}/);
  const load = html.slice(html.indexOf("async function loadStats()"), html.indexOf('await fetch("/api/usage")'));
  assert.match(load, /if \(!v3ServerUsageVisible\(\)\) return;/);
  assert.match(html, /function v3ServerUsageVisible\(\) \{[\s\S]{0,300}diag[\s\S]{0,200}\}/);
});

// R7 (audit P1-5): after «Создать таблицу» the table sat ~1800px down, under status cards.
// The first render with rows after a user-started build scrolls the table into view — once.
test("a user-started build brings the table into view once", () => {
  assert.match(html, /btnAiTranslateEl\.addEventListener\("click", function \(\) \{ v3ScrollToTablePending = true; \}, true\);/);
  const tail = html.slice(html.indexOf('document.getElementById("tableContainer").innerHTML = html;'), html.indexOf('document.getElementById("tableContainer").innerHTML = html;') + 1200);
  assert.match(tail, /if \(v3ScrollToTablePending && rows && rows\.length\)/);
  assert.match(tail, /v3ScrollToTablePending = false;/);
  // Instant, after two frames: a smooth scroll was cancelled by the re-layout above (648→629 px).
  assert.match(tail, /requestAnimationFrame\(\(\) => requestAnimationFrame\(/);
  assert.match(tail, /scrollIntoView\(\{ block: "start", behavior: "auto" \}\)/);
});

// R7 (audit P1-6): «Результат: Пока нет таблицы» next to a built table. The panel line and the
// summary carried data-i18n, so every locale pass overwrote the computed state with the empty one.
test("the result status comes from one source and survives a locale pass", () => {
  assert.match(html, /<span id="classicResultPanelMeta" class="classic-mobile-panel-meta"><\/span>/);
  assert.match(html, /<div id="classicResultSummary" class="classic-result-summary"><\/div>/);
  const onLocale = html.slice(html.indexOf('document.addEventListener("i18n:changed", function () {\n  try { classicSyncMainPanels(); }'));
  assert.match(onLocale.slice(0, 400), /classicSyncStateUi\(\)/);
});

// R7 (audit P1-5, P2-5): three status pills and «Скачать JSON результата» fold into «Подробнее»;
// the summary line stays the one visible status. Hotkeys are hidden where there is no keyboard.
test("status pills and the result JSON live under «Подробнее»; hotkeys stay off phones", () => {
  const more = html.match(/<details id="classicResultMore" class="classic-result-more">([\s\S]*?)<\/details>/);
  assert.ok(more, "the «Подробнее» block exists");
  assert.match(more[1], /<summary data-i18n="classic.resultMore">/);
  assert.match(more[1], /id="classicResultTrust"/);
  assert.match(more[1], /id="btnTableEvidenceJson"/);
  assert.match(html, /@media \(max-width: 599px\), \(hover: none\) \{\s*#hotkeysPanel \{ display: none; \}/);
  for (const locale of ["ru", "en", "he"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", `public/i18n/locales/${locale}.js`), "utf8");
    assert.match(src, /\bresultMore: "/, locale);
  }
});

// R7 (audit P1-7): the save dialog — localized hints, one close control, a footer that stays
// in reach, and a receipt that says «Повторно сохранять не нужно.» once and keeps technical rows
// (provider, table cache) under «Подробнее».
test("save dialog: localized hints, one close control, sticky footer", () => {
  assert.doesNotMatch(html, /id="v3SaveMetaCancelBtn"/);
  assert.match(html, /#v3SaveMetaModal \.v3-modal-actions,\n#v3SaveMetaCompleteActions \{[^}]*position: sticky;[^}]*bottom: 0;/);
  for (const id of ["v3TextMetaTags", "v3TextMetaSource", "v3TextMetaTopic"]) {
    const input = html.match(new RegExp(`<input id="${id}"[^>]*>`));
    if (input) assert.match(input[0], /data-i18n-placeholder="saveMeta\.placeholder/, id);
  }
  const ru = fs.readFileSync(path.join(__dirname, "..", "public/i18n/locales/ru.js"), "utf8");
  for (const key of ["placeholderTags", "placeholderSource", "placeholderTopic"]) {
    const line = ru.match(new RegExp(`\\b${key}: "([^"]*)"`));
    assert.ok(line && !/\b(song|idf|lyrics|politics|family)\b/.test(line[1]), "ru " + key + " is Russian");
  }
});

test("save receipt: the summary appears once, technical rows sit under «Подробнее»", () => {
  const receipt = html.match(/<section id="v3SaveMetaReceipt"[\s\S]*?<\/section>/)[0];
  const more = receipt.match(/<details id="v3SaveMetaReceiptMore">([\s\S]*?)<\/details>/);
  assert.ok(more, "receipt details");
  assert.match(more[1], /id="v3SaveMetaReceiptProvider"/);
  assert.match(more[1], /id="v3SaveMetaReceiptCache"/);
  const show = html.slice(html.indexOf("function v3SaveMetaShowReceipt(receipt)"), html.indexOf("function v3SaveMetaShowFailure("));
  assert.doesNotMatch(show, /v3SaveMetaSetStatus\(t\("saveMeta\.completeSummary"\)/);
  assert.match(show, /v3SaveMetaSetStatus\("", false\)/);
});

// R7 (audit P2-9): «↔ Альбом» floated over Studio content from the first screen. It is now an
// in-flow button above a built table, labelled from the locale, and the edit pencil clears the nav.
test("the orientation toggle sits in the flow above a built table", () => {
  const fn = html.slice(html.indexOf("function orientationFabUpdate()"), html.indexOf("async function orientationFabClick()"));
  assert.match(fn, /currentTableData\.length > 0/);
  assert.match(html, /function classicSyncStateUi\(\) \{\n\s+try \{ orientationFabUpdate\(\); \} catch \(_\) \{\}/, "re-evaluated after every render");
  assert.match(fn, /t\(isLandscape \? "classic\.editOrientationPortrait" : "classic\.editOrientationLandscape"\)/);
  assert.ok(html.indexOf('id="classicOrientationFab"') < html.indexOf('<div id="tableContainer"></div>'), "above the table");
  const css = html.slice(html.indexOf("#classicOrientationFab {"), html.indexOf("#classicOrientationFab {") + 400);
  assert.doesNotMatch(css, /position: fixed/);
  assert.match(html, /body\.lp-has-app-nav #tableEditFab \{ bottom: calc\(80px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
});

// R7 verification (forced colors, 380): «Готово» had no visible edge, and the save toast sat on
// the phone navigation bar.
test("primary buttons keep an edge in forced colors; Studio toasts clear the phone nav", () => {
  assert.match(html, /@media \(forced-colors: active\) \{\n  \.btn-primary,\n  \.btn-secondary \{ border: 2px solid ButtonText; \}/);
  const nav = fs.readFileSync(path.join(__dirname, "..", "public/css/app-nav.css"), "utf8");
  assert.match(nav, /body\.lp-has-app-nav #toastContainer,\n  body\.lp-has-app-nav \.v3-toast \{ bottom: calc\(72px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
});
