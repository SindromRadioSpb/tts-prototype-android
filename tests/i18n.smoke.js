/**
 * i18n smoke tests — run in Node.js (no browser required).
 *
 * Loads locale files via JSDOM-free shim, exercises core i18n module behaviour:
 *   1. All three locale files load without syntax errors
 *   2. All keys present in ru.js exist in en.js and he.js (symmetry check)
 *   3. t() resolves keys and falls back to ru for missing keys
 *   4. t() interpolates {param} placeholders
 *   5. t() returns the key string (not undefined) for completely unknown keys
 *   6. appSetLocale() rejects unknown locales and falls back to "ru"
 *   7. appSetLocale() persists selection (localStorage mock)
 *   8. RTL: appSetLocale("he") sets dir="rtl", others set dir="ltr"
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");

// ── Minimal browser globals shim ─────────────────────────────────────────────

let _lsStore = {};
const localStorageMock = {
  getItem: (k) => (_lsStore[k] !== undefined ? _lsStore[k] : null),
  setItem: (k, v) => { _lsStore[k] = String(v); },
  removeItem: (k) => { delete _lsStore[k]; },
};

const _docEl = { lang: "", dir: "", _attrs: {} };
const documentMock = {
  documentElement: _docEl,
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  readyState: "complete",
  dispatchEvent: () => {},
};

global.window = global;
global.localStorage = localStorageMock;
global.document = documentMock;
global.console = console;
global.CustomEvent = function (type, opts) { this.type = type; this.detail = opts && opts.detail; };

// ── Load locale files ─────────────────────────────────────────────────────────

const localeDir = path.join(__dirname, "../public/i18n/locales");

function loadLocale(name) {
  const code = fs.readFileSync(path.join(localeDir, `${name}.js`), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", code)(global.window);
}

loadLocale("ru");
loadLocale("en");
loadLocale("he");

// ── Load i18n core ────────────────────────────────────────────────────────────

const i18nCode = fs.readFileSync(path.join(__dirname, "../public/i18n/index.js"), "utf8");
// eslint-disable-next-line no-new-func
new Function("window", "document", "localStorage", i18nCode)(global.window, global.document, global.localStorage);

const { t, appSetLocale, appGetLocale, applyI18n } = global.window;

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function flatKeys(obj, prefix) {
  prefix = prefix || "";
  let keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (obj[k] && typeof obj[k] === "object") {
      keys = keys.concat(flatKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

// ── Suite 1: Locale file symmetry ────────────────────────────────────────────

console.log("\n[Suite 1] Locale file symmetry");

const ruKeys  = flatKeys(global.window.I18N_LOCALES.ru);
const enKeys  = flatKeys(global.window.I18N_LOCALES.en);
const heKeys  = flatKeys(global.window.I18N_LOCALES.he);

test("ru.js loads and has keys", () => assert.ok(ruKeys.length > 0, "ru.js is empty"));
test("en.js loads and has keys", () => assert.ok(enKeys.length > 0, "en.js is empty"));
test("he.js loads and has keys", () => assert.ok(heKeys.length > 0, "he.js is empty"));

test("en.js has all keys from ru.js", () => {
  const enSet = new Set(enKeys);
  const missing = ruKeys.filter(k => !enSet.has(k));
  assert.strictEqual(missing.length, 0, `Missing in en.js: ${missing.join(", ")}`);
});

test("he.js has all keys from ru.js", () => {
  const heSet = new Set(heKeys);
  const missing = ruKeys.filter(k => !heSet.has(k));
  assert.strictEqual(missing.length, 0, `Missing in he.js: ${missing.join(", ")}`);
});

// ── Suite 2: t() resolution ───────────────────────────────────────────────────

console.log("\n[Suite 2] t() key resolution");

test("default locale is ru", () => assert.strictEqual(appGetLocale(), "ru"));

test("t() resolves a simple key in ru", () => {
  const val = t("status.ready");
  assert.strictEqual(val, "Готово");
});

test("t() resolves a nested key in ru", () => {
  const val = t("classic.speak");
  assert.ok(val.includes("Озвучить") || val.includes("🔊"), `Got: ${val}`);
});

test("t() falls back to ru for key missing in current locale", () => {
  // temporarily corrupt en locale for one key
  const orig = global.window.I18N_LOCALES.en.status.ready;
  delete global.window.I18N_LOCALES.en.status.ready;
  appSetLocale("en");
  const val = t("status.ready");
  // restore
  global.window.I18N_LOCALES.en.status.ready = orig;
  appSetLocale("ru");
  assert.strictEqual(val, "Готово", `Expected ru fallback, got: ${val}`);
});

test("t() returns key string for unknown key", () => {
  const key = "nonexistent.deep.key";
  const val = t(key);
  assert.strictEqual(val, key);
});

// ── Suite 3: Parameter interpolation ─────────────────────────────────────────

console.log("\n[Suite 3] Interpolation");

test("t() interpolates {param} in en", () => {
  appSetLocale("en");
  const val = t("toast.ankiAvailable", { ver: "6" });
  assert.ok(val.includes("6"), `Expected version in output, got: ${val}`);
  appSetLocale("ru");
});

test("t() interpolates multiple params", () => {
  appSetLocale("en");
  const val = t("toast.ankiExported", { notes: 3, cards: 3 });
  assert.ok(val.includes("3"), `Expected count in output, got: ${val}`);
  appSetLocale("ru");
});

test("t() leaves unfilled {placeholders} as-is", () => {
  appSetLocale("en");
  const val = t("toast.ankiAvailable", {});
  assert.ok(val.includes("{ver}"), `Expected unfilled placeholder, got: ${val}`);
  appSetLocale("ru");
});

// ── Suite 4: appSetLocale() ───────────────────────────────────────────────────

console.log("\n[Suite 4] appSetLocale()");

test("appSetLocale('en') switches locale", () => {
  appSetLocale("en");
  assert.strictEqual(appGetLocale(), "en");
  assert.strictEqual(t("status.ready"), "Ready");
  appSetLocale("ru");
});

test("appSetLocale('he') switches locale", () => {
  appSetLocale("he");
  assert.strictEqual(appGetLocale(), "he");
  assert.ok(t("status.ready").length > 0);
  appSetLocale("ru");
});

test("appSetLocale() persists to localStorage", () => {
  appSetLocale("en");
  assert.strictEqual(localStorageMock.getItem("app.locale"), "en");
  appSetLocale("ru");
});

test("appSetLocale() rejects unknown locale, falls back to ru", () => {
  appSetLocale("xx");
  assert.strictEqual(appGetLocale(), "ru");
});

// ── Suite 5: RTL / dir attribute ─────────────────────────────────────────────

console.log("\n[Suite 5] RTL / dir attribute");

test("appSetLocale('he') sets dir=rtl on documentElement", () => {
  appSetLocale("he");
  assert.strictEqual(_docEl.dir, "rtl");
  appSetLocale("ru");
});

test("appSetLocale('ru') sets dir=ltr on documentElement", () => {
  appSetLocale("ru");
  assert.strictEqual(_docEl.dir, "ltr");
});

test("appSetLocale('en') sets dir=ltr on documentElement", () => {
  appSetLocale("en");
  assert.strictEqual(_docEl.dir, "ltr");
  appSetLocale("ru");
});

test("appSetLocale('he') sets lang=he on documentElement", () => {
  appSetLocale("he");
  assert.strictEqual(_docEl.lang, "he");
  appSetLocale("ru");
});

// ── Suite 6: Toast / confirm key completeness ─────────────────────────────────

console.log("\n[Suite 6] Critical toast key presence");

const criticalKeys = [
  "toast.ankiAvailable",
  "toast.ankiUnavailable",
  "toast.ankiPreviewFailed",
  "toast.ankiExported",
  "toast.ankiExportFailed",
  "toast.openLibraryFirst",
  "toast.audioBatchUnavailable",
  "toast.selectRowFirst",
  "toast.copied",
  "toast.copyFailed",
  "toast.ankiModalUnavailable",
  "toast.noTextSelected",
  "toast.generatingDocx",
  "toast.docxDownloaded",
  "toast.docxFailed",
  "toast.srsUnavailable",
  "toast.srsAdded",
  "toast.srsFailed",
  "toast.srsReviewUnavailable",
  "toast.srsReviewSaved",
  "toast.srsReviewFailed",
  "toast.srsSessionFailed",
  "toast.srsModeChangeFailed",
  "toast.srsAudioUnavailable",
  "toast.srsTypeAnswerFirst",
  "toast.srsAnswerCheckFailed",
  "confirm.clearText",
  "confirm.resetAllEdits",
];

for (const key of criticalKeys) {
  test(`key "${key}" resolves in all locales`, () => {
    for (const locale of ["ru", "en", "he"]) {
      appSetLocale(locale);
      const val = t(key);
      assert.notStrictEqual(val, key, `Missing in ${locale}: ${key}`);
    }
    appSetLocale("ru");
  });
}

// ── Suite 7: Premium completion key coverage ──────────────────────────────────

console.log("\n[Suite 7] Premium completion key coverage");

const premiumKeys = [
  // Stats panel
  "classic.statusSummary",
  "classic.statTtsLabel",
  "classic.statTtsSub",
  "classic.statTtsCostInfo",
  "classic.statTtsQuotaInfo",
  "classic.statAiLabel",
  "classic.statAiSub",
  "classic.statConsoleLabel",
  "classic.statConsoleBtn",
  "classic.statResetIn",
  "classic.statResetSoon",
  "classic.statResetUnknown",
  // Buttons
  "classic.rebuildTable",
  "classic.updateTable",
  "classic.reSpeak",
  "classic.speakAgain",
  // Primary hints
  "classic.primaryHintEmpty",
  "classic.primaryHintStale",
  "classic.primaryHintNoTable",
  "classic.primaryHintReady",
  // Source chip
  "classic.sourceLocal",
  "classic.sourceLibrary",
  "classic.sourceCache",
  // Trust chips — freshness
  "classic.chipFreshnessNone",
  "classic.chipFreshnessStale",
  "classic.chipFreshnessRestored",
  "classic.chipFreshnessCurrent",
  // Trust chips — library
  "classic.chipLibraryNone",
  "classic.chipLibrarySaved",
  "classic.chipLibraryNeedSave",
  // Trust chips — export
  "classic.chipExportUnavailable",
  "classic.chipExportAfterRebuild",
  "classic.chipExportReady",
  "classic.chipExportAfterSave",
  // Result summaries
  "classic.resultSummaryNoTable",
  "classic.resultSummaryStale",
  "classic.resultSummaryExportReady",
  "classic.resultSummarySaved",
  "classic.resultSummaryUnsaved",
  // Audio + header
  "classic.downloadAudio",
  "classic.statusDraft",
  "classic.statusSaved",
  "classic.noTitle",
  "classic.tableBuilt",
  "classic.tableStaleSub",
  "classic.providerLabel",
  "classic.niqqudLabel",
  "classic.openedFromDashboard",
  "classic.openedFromLibrary",
  "classic.modeResume",
  "classic.audioNiqqudToHebrew",
  "classic.sourceLabel",
  // Table column headers
  "table.colTranslitLat",
  "table.colTranslitRu",
  "table.colTranslitSbl",
  // Library card
  "library.level",
  "library.progressRow",
  "library.source",
  "library.lastOpened",
  "library.created",
  "library.open",
  "library.resume",
  "library.edit",
  "library.archive",
  "library.delete",
  // Dashboard
  "dashboard.pin",
  "dashboard.unpin",
  "dashboard.badgeSeen",
  "dashboard.badgeLast",
  "dashboard.badgeArchived",
  "dashboard.levelChip",
  "dashboard.shownOf",
  "dashboard.allTextsScope",
  "dashboard.loadingRows",
  "dashboard.noActivity",
  "dashboard.source",
  "dashboard.continue",
  "dashboard.open",
  "dashboard.edit",
  // Diagnostics
  "diag.online",
  "diag.unavailable",
  "diag.ready",
  "diag.unloadedIdle",
  "diag.configured",
  "diag.notConfigured",
  "diag.lastRequest",
  "diag.quotaChars",
  "diag.used",
  "diag.quota",
  "diag.nearLimit",
  "diag.periodFrom",
  "diag.textsActive",
  "diag.sentences",
  "diag.cacheCard",
  "diag.libCard",
  "diag.versionsCard",
  "diag.updated",
  // Time formatting
  "time.hourMin",
  "time.minSec",
  "time.sec",
  "time.min",
];

for (const key of premiumKeys) {
  test(`premium key "${key}" resolves in all locales`, () => {
    for (const locale of ["ru", "en", "he"]) {
      appSetLocale(locale);
      const val = t(key);
      assert.notStrictEqual(val, key, `Missing in ${locale}: ${key}`);
    }
    appSetLocale("ru");
  });
}

// interpolation smoke for new templates
test("classic.statTtsQuotaInfo interpolates {used} and {percent}", () => {
  appSetLocale("ru");
  const val = t("classic.statTtsQuotaInfo", { used: "1,234,567", percent: 31 });
  assert.ok(!val.includes("{used}") && !val.includes("{percent}"), `Unfilled placeholders: ${val}`);
});

test("classic.statResetIn interpolates {duration}", () => {
  appSetLocale("en");
  const val = t("classic.statResetIn", { duration: "2h 5m" });
  assert.ok(!val.includes("{duration}"), `Unfilled: ${val}`);
  appSetLocale("ru");
});

test("time.hourMin interpolates {h} and {m}", () => {
  for (const locale of ["ru", "en", "he"]) {
    appSetLocale(locale);
    const val = t("time.hourMin", { h: 3, m: 15 });
    assert.ok(!val.includes("{h}") && !val.includes("{m}"), `Unfilled in ${locale}: ${val}`);
  }
  appSetLocale("ru");
});

test("dashboard.shownOf interpolates {shown}, {total}, {scope}", () => {
  appSetLocale("en");
  const val = t("dashboard.shownOf", { shown: 10, total: 42, scope: "All texts" });
  assert.ok(!val.includes("{shown}") && !val.includes("{total}") && !val.includes("{scope}"), `Unfilled: ${val}`);
  appSetLocale("ru");
});

// ── Suite 8: PATCH-17 key coverage ───────────────────────────────────────────

console.log("\n[Suite 8] PATCH-17 key coverage");

const patch17Keys = [
  // Classic state chips
  "classic.chipTextStale", "classic.chipTextReady",
  "classic.chipResultStale", "classic.chipResultRestored",
  "classic.chipResultSaved", "classic.chipResultDraft",
  // AI today
  "classic.statAiTodayEmpty", "classic.statAiToday", "classic.statAiTodayLow",
  // Status labels
  "classic.ttsStatusLabel", "classic.tableStatusLabel",
  // Key badges
  "classic.keyUploaded", "classic.keyFromEnv", "classic.keySet",
  // Library
  "library.loaded",
  // Text metadata modal
  "textMeta.title", "textMeta.close", "textMeta.labelTopic", "textMeta.tagsHint",
  // Dashboard
  "dashboard.summaryLine", "dashboard.stats7days", "dashboard.statsAll",
  "dashboard.metricsNA", "dashboard.noPinned", "dashboard.noRecent",
  "dashboard.goToRow", "dashboard.playRow", "dashboard.rowMeta",
  "dashboard.levelLabel", "dashboard.topicLabel",
];

for (const key of patch17Keys) {
  test(`patch17 key "${key}" resolves in all locales`, () => {
    for (const locale of ["ru", "en", "he"]) {
      appSetLocale(locale);
      const val = t(key);
      assert.notStrictEqual(val, key, `Missing in ${locale}: ${key}`);
    }
    appSetLocale("ru");
  });
}

// interpolation tests for new templates
test("classic.statAiToday interpolates {used} and {limit}", () => {
  for (const locale of ["ru", "en", "he"]) {
    appSetLocale(locale);
    const val = t("classic.statAiToday", { used: 42, limit: 50 });
    assert.ok(!val.includes("{used}") && !val.includes("{limit}"), `Unfilled in ${locale}: ${val}`);
  }
  appSetLocale("ru");
});

test("library.loaded interpolates {count} and {date}", () => {
  for (const locale of ["ru", "en", "he"]) {
    appSetLocale(locale);
    const val = t("library.loaded", { count: 78, date: "02.05.2026" });
    assert.ok(!val.includes("{count}") && !val.includes("{date}"), `Unfilled in ${locale}: ${val}`);
  }
  appSetLocale("ru");
});

test("dashboard.summaryLine interpolates {pinned}, {recent}, {activity}", () => {
  appSetLocale("en");
  const val = t("dashboard.summaryLine", { pinned: 0, recent: 5, activity: 42 });
  assert.ok(!val.includes("{pinned}") && !val.includes("{recent}") && !val.includes("{activity}"), `Unfilled: ${val}`);
  appSetLocale("ru");
});

test("dashboard.stats7days interpolates all params", () => {
  appSetLocale("en");
  const val = t("dashboard.stats7days", { plays: 27, unique_rows: 15, unique_texts: 3, time: "1m 30s" });
  assert.ok(!val.includes("{plays}") && !val.includes("{unique_rows}") && !val.includes("{unique_texts}") && !val.includes("{time}"), `Unfilled: ${val}`);
  appSetLocale("ru");
});

test("dashboard.rowMeta interpolates {count} and {date}", () => {
  for (const locale of ["ru", "en", "he"]) {
    appSetLocale(locale);
    const val = t("dashboard.rowMeta", { count: 16, date: "02.05.2026" });
    assert.ok(!val.includes("{count}") && !val.includes("{date}"), `Unfilled in ${locale}: ${val}`);
  }
  appSetLocale("ru");
});

// ── Suite 9: P0-1 / P1-1 i18n-leak fix coverage ──────────────────────────────

console.log("\n[Suite 9] P0-1 / P1-1 new key coverage");

const p11Keys = [
  // P1-1a — export hint (was hard-coded RU)
  "classic.exportHint.noTable",
  "classic.exportHint.stale",
  "classic.exportHint.saveToLibrary",
  // P1-1b — SRS Trainer (was hard-coded EN)
  "srs.trainer.queueReady",
  "srs.trainer.direction",
  "srs.trainer.mode",
  "srs.trainer.start",
  "srs.trainer.dueToday",
  "srs.trainer.learning",
  "srs.trainer.review",
  "srs.trainer.new",
  "srs.trainer.help1",
  "srs.trainer.help2",
  "srs.trainer.cardDirection",
  "srs.trainer.trainerMode",
  "srs.trainer.correct",
  "srs.trainer.differs",
  "srs.trainer.expected",
  "srs.trainer.typeAnswer",
  "srs.trainer.check",
  "srs.trainer.replay",
  // P1-1c — IDE right-panel tabs (had no data-i18n)
  "ide.tabNotes",
  "ide.tabSrs",
  "ide.tabAudio",
  "ide.tabExport",
  // P0-1/P0-2/P1-6 — multi-tab + DB-error recovery strings
  "multitab.title",
  "multitab.body",
  "multitab.useHere",
  "multitab.reload",
  "multitab.takingOver",
  "db.error.ownedByTab",
  "db.error.unavailable",
  "library.error.title",
  "library.error.status",
  "library.error.retry",
  "library.error.backup",
  "library.error.ownedByTab",
];

for (const key of p11Keys) {
  test(`P1-1 key "${key}" resolves (not passthrough) in all locales`, () => {
    for (const locale of ["ru", "en", "he"]) {
      appSetLocale(locale);
      const val = t(key);
      assert.notStrictEqual(val, key, `Missing/passthrough in ${locale}: ${key}`);
      assert.ok(typeof val === "string" && val.trim().length > 0, `Empty in ${locale}: ${key}`);
    }
    appSetLocale("ru");
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
