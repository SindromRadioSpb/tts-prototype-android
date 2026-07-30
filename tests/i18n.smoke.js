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
 *   9. Critical/premium/patch key coverage (Suites 6-9)
 *  10. Locale cache-bust version lock — guards the `?v=` query on the three
 *      <script src="/i18n/locales/{ru,en,he}.js?v=N"> tags in public/index.html.
 *      That number is a SEPARATE invalidation channel from CACHE_VERSION in
 *      public/sw.js. If locale file content changes but `?v=` does not move,
 *      browsers/the service-worker precache keep serving the stale copy and
 *      users see raw i18n keys instead of translated text (this happened in
 *      prod: see docs referenced in the Suite 10 comment below). This suite
 *      fails the build in that exact situation, using a committed content-hash
 *      lock file (tests/i18n.locale-version.lock.json) so it works identically
 *      in CI, a fresh clone, or a local run — no git history needed.
 *
 *      Run `node tests/i18n.smoke.js --write-lock` after bumping `?v=` (and
 *      CACHE_VERSION in public/sw.js) to regenerate the lock file for the new
 *      baseline.
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

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

// ── Suite 1b: duplicate keys inside a single locale object ───────────────────
//
// Why this cannot ride on Suite 1: a repeated key in an object literal is NOT a
// JS error. A second `tcs: { … }` block silently REPLACES the first one whole,
// and symmetry stays perfect (the same block vanishes in ru/en/he alike), so
// Suite 1 and every "key resolves" suite stay green while real keys are gone.
// Observed cost: appending a new `tcs`/`tci` block instead of extending the
// existing one deleted 25 share/import-modal keys in one commit — t() then
// returns the raw key, applyI18n keeps the hardcoded Russian in index.html, and
// English/Hebrew users silently get Russian UI with no gate saying a word.
//
// Scanner, not regex: tracks string/template/comment state and only counts an
// identifier or quoted literal as a KEY when the previous significant character
// was `{` or `,` (so `a ? b : c` and colons inside strings can't masquerade).

function duplicateKeyPaths(src) {
  const dups = [];
  const frames = [];                 // {keys:Set, label:string}
  let prevSig = "";                  // last significant (non-space/comment) char
  let lastKey = "";                  // key that may open the next `{`
  let i = 0;
  const n = src.length;

  const record = (name) => {
    const f = frames[frames.length - 1];
    if (!f) return;
    const full = f.label ? `${f.label}.${name}` : name;
    if (f.keys.has(name)) dups.push(full);
    else f.keys.add(name);
    lastKey = name;
  };

  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) { if (src[j] === "\\") { j += 2; continue; } if (src[j] === c) break; j++; }
      const raw = src.slice(i + 1, j);
      let k = j + 1;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ":" && (prevSig === "{" || prevSig === ",")) record(raw);
      i = j + 1; prevSig = "s";
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ":" && (prevSig === "{" || prevSig === ",")) record(word);
      i = j; prevSig = "w";
      continue;
    }
    if (c === "{") {
      const parent = frames[frames.length - 1];
      const base = parent ? (parent.label ? `${parent.label}.${lastKey}` : lastKey) : "";
      frames.push({ keys: new Set(), label: frames.length ? base : "" });
      lastKey = ""; prevSig = "{"; i++; continue;
    }
    if (c === "}") { frames.pop(); prevSig = "}"; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    prevSig = c; i++;
  }
  return dups;
}

for (const name of ["ru", "en", "he"]) {
  test(`${name}.js has no duplicate keys inside one object (a dup silently deletes the earlier block)`, () => {
    const dups = duplicateKeyPaths(fs.readFileSync(path.join(localeDir, `${name}.js`), "utf8"));
    assert.strictEqual(
      dups.length, 0,
      `Duplicate key(s) in ${name}.js: ${dups.join(", ")}. ` +
      "The LATER literal wins and wipes every key of the earlier one. " +
      "Extend the existing block instead of appending a second one with the same name."
    );
  });
}

// self-check: the scanner must actually be able to see a duplicate, otherwise the
// three tests above would pass vacuously forever (independent-oracle discipline).
test("duplicate-key scanner detects a planted duplicate (guards against a vacuous gate)", () => {
  const planted = 'window.X = { a: { one: "1" }, b: "2", a: { two: "3" } };';
  assert.deepStrictEqual(duplicateKeyPaths(planted), ["a"]);
  assert.deepStrictEqual(duplicateKeyPaths('window.X = { a: { p: "1", p: "2" } };'), ["a.p"]);
  assert.deepStrictEqual(duplicateKeyPaths('window.X = { a: "x: y", b: "c: d" };'), []);
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

// ── Suite 10: Locale cache-bust version lock ─────────────────────────────────
//
// Guards a real production incident: public/index.html loads the three locale
// files with their own cache-busting query (`?v=N`), a channel entirely
// separate from CACHE_VERSION in public/sw.js. Six commits edited all three
// locale files without ever bumping that number; browsers and the
// service-worker precache kept serving the previous copy, and users saw raw
// i18n keys (e.g. "studio.import.captionsTracksHeManual") where translated
// text belonged. Suites 1-9 above check file CONTENT, not what a browser will
// actually fetch — they passed throughout that incident. This suite closes
// that gap with a committed content-hash lock, so it needs neither git history
// nor a live browser to catch the regression.

console.log("\n[Suite 10] Locale cache-bust version lock (public/index.html ?v= vs public/sw.js precache)");

const REPO_ROOT = path.join(__dirname, "..");
const INDEX_HTML_PATH = path.join(REPO_ROOT, "public/index.html");
const LOCALE_REL_PATHS = [
  "public/i18n/locales/ru.js",
  "public/i18n/locales/en.js",
  "public/i18n/locales/he.js",
];
const LOCK_PATH = path.join(__dirname, "i18n.locale-version.lock.json");

function readIndexHtml() {
  return fs.readFileSync(INDEX_HTML_PATH, "utf8");
}

// Extracts the `?v=` number for one locale's <script> tag. Returns null if the
// tag is missing/reshaped so callers can fail loudly instead of silently
// skipping the check.
function extractLocaleVersion(indexHtml, localeCode) {
  const re = new RegExp(`/i18n/locales/${localeCode}\\.js\\?v=(\\d+)`);
  const m = indexHtml.match(re);
  return m ? m[1] : null;
}

// Stable sha256 over the three locale files' raw bytes. Each file is framed
// with its relative path + byte length before its content so that e.g.
// moving a byte from the end of ru.js to the start of en.js can never
// produce an accidental hash collision.
function computeLocaleContentHash() {
  const hash = crypto.createHash("sha256");
  for (const relPath of LOCALE_REL_PATHS) {
    const buf = fs.readFileSync(path.join(REPO_ROOT, relPath));
    hash.update(relPath, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(buf.length), "utf8");
    hash.update("\0", "utf8");
    hash.update(buf);
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function buildLockObject(version, sha256) {
  return {
    _purpose:
      "Cache-bust lock for public/i18n/locales/*.js, checked by Suite 10 in " +
      "tests/i18n.smoke.js (npm run smoke:i18n). If the content hash below no " +
      "longer matches the locale files AND `version` was not bumped past this " +
      "value in public/index.html's locale <script ?v=> tags, the gate fails: " +
      "browsers/service-worker keep serving the stale locale file and users " +
      "see raw i18n keys instead of translations. Regenerate with: " +
      "node tests/i18n.smoke.js --write-lock",
    version: String(version),
    sha256,
    files: LOCALE_REL_PATHS,
  };
}

function formatLockFileContent(version, sha256) {
  return JSON.stringify(buildLockObject(version, sha256), null, 2) + "\n";
}

function indent(text, prefix) {
  return text.split("\n").map((l) => (l.length ? prefix + l : l)).join("\n");
}

// `--write-lock`: regenerate the lock file from the CURRENT index.html
// version + locale content, then fall through to the normal check (which will
// now trivially pass against the freshly written baseline). This is the
// copy-paste-free way to do the "update the lock file" half of the fix after
// bumping `?v=` — the failure message below also spells out the manual edit.
if (process.argv.includes("--write-lock")) {
  const html = readIndexHtml();
  const v = extractLocaleVersion(html, "ru");
  if (!v) {
    console.error("--write-lock: could not read the ru.js ?v= from public/index.html; aborting write.");
    process.exit(1);
  }
  const content = formatLockFileContent(v, computeLocaleContentHash());
  fs.writeFileSync(LOCK_PATH, content, "utf8");
  console.log(`  --write-lock: wrote ${LOCK_PATH}`);
  console.log(indent(content, "    "));
}

test("locale <script> tags in index.html share one ?v= number", () => {
  const html = readIndexHtml();
  const ruV = extractLocaleVersion(html, "ru");
  const enV = extractLocaleVersion(html, "en");
  const heV = extractLocaleVersion(html, "he");
  assert.ok(
    ruV && enV && heV,
    `Could not find all three "/i18n/locales/{ru,en,he}.js?v=N" <script> tags in ` +
    `public/index.html (found ru=${ruV}, en=${enV}, he=${heV}). The tag pattern may ` +
    `have changed — update extractLocaleVersion() in tests/i18n.smoke.js Suite 10.`
  );
  assert.strictEqual(
    ruV, enV,
    `BUG: ru.js and en.js locale <script> tags carry DIFFERENT ?v= numbers ` +
    `(ru=${ruV}, en=${enV}) in public/index.html. All three MUST share one number ` +
    `— fix this mismatch directly, it is a bug on its own regardless of the lock check.`
  );
  assert.strictEqual(
    ruV, heV,
    `BUG: ru.js and he.js locale <script> tags carry DIFFERENT ?v= numbers ` +
    `(ru=${ruV}, he=${heV}) in public/index.html. All three MUST share one number ` +
    `— fix this mismatch directly, it is a bug on its own regardless of the lock check.`
  );
});

test("locale files match the committed cache-bust lock (content changed => ?v= must bump)", () => {
  const html = readIndexHtml();
  const currentVersion = extractLocaleVersion(html, "ru");
  if (!currentVersion) {
    throw new Error(
      "Cannot run the cache-bust lock check: no ?v= found on the ru.js <script> tag in " +
      "public/index.html. See the previous test's failure for details."
    );
  }

  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  } catch (e) {
    throw new Error(
      `Cannot read the locale cache-bust lock file at ${LOCK_PATH}: ${e.message}\n` +
      `If it is missing, create it with: node tests/i18n.smoke.js --write-lock`
    );
  }

  const currentHash = computeLocaleContentHash();

  if (currentHash === lock.sha256) {
    return; // Content matches the locked baseline. Pass regardless of version bookkeeping.
  }

  const versionBumped = Number(currentVersion) > Number(lock.version);

  if (versionBumped) {
    // Content changed AND the developer already moved ?v= past the lock —
    // this is the correct fix in progress. Pass, but the lock itself is now
    // stale (still points at the old baseline) and must be refreshed too.
    const freshLockContent = formatLockFileContent(currentVersion, currentHash);
    console.log(
      "    NOTE: locale content changed and ?v= was bumped " +
      `(${lock.version} -> ${currentVersion}) — correct. The lock file is now stale; ` +
      "refresh it (node tests/i18n.smoke.js --write-lock), or write this to " +
      `${path.relative(REPO_ROOT, LOCK_PATH)}:`
    );
    console.log(indent(freshLockContent, "      "));
    return;
  }

  const suggestedVersion = String(Number(lock.version) + 1);
  const suggestedLockContent = formatLockFileContent(suggestedVersion, currentHash);

  throw new Error("\n" + [
    "STALE-CACHE REGRESSION GUARD TRIPPED — this is the exact bug that hit prod.",
    "",
    "public/i18n/locales/{ru,en,he}.js changed content, but the `?v=` cache-bust number",
    "on their <script> tags in public/index.html was NOT increased past the locked",
    "baseline.",
    "",
    "Why this matters: index.html loads each locale file with ITS OWN cache-busting",
    "query, a channel completely separate from CACHE_VERSION in public/sw.js. If this",
    "number does not change, browsers AND the service-worker precache keep serving the",
    "PREVIOUS copy of the locale file — your edits never reach any user. This already",
    'happened in production: users saw raw i18n keys (e.g. "studio.import.',
    'captionsTracksHeManual") instead of translated sentences, because six commits',
    "edited the locale files while ?v= stayed put. The files on the server were correct",
    "the whole time — the browser was simply executing an older cached copy.",
    "",
    `Current ?v= on all three <script> tags: ${currentVersion}`,
    `Locked (last-known-good) ?v=:            ${lock.version}`,
    `Current locale file content hash:        ${currentHash}`,
    `Locked content hash:                     ${lock.sha256}`,
    "",
    "Fix — TWO edits are required in the SAME change:",
    "",
    "  1) Bump the ?v= number on ALL THREE locale <script> tags in public/index.html",
    `     (any number greater than ${lock.version} works; keep all three identical):`,
    "",
    `       <script src="/i18n/locales/ru.js?v=${suggestedVersion}"></script>`,
    `       <script src="/i18n/locales/en.js?v=${suggestedVersion}"></script>`,
    `       <script src="/i18n/locales/he.js?v=${suggestedVersion}"></script>`,
    "",
    `  2) Update the lock file at ${path.relative(REPO_ROOT, LOCK_PATH)} — replace its`,
    "     entire contents with exactly this (or run `node tests/i18n.smoke.js",
    "     --write-lock` after step 1 to generate it automatically):",
    "",
    indent(suggestedLockContent, "     "),
    "ALSO: bump CACHE_VERSION in public/sw.js in this SAME change. That is the other",
    "half of cache invalidation (the service-worker precache) — forgetting it produces",
    "the identical symptom (stale locale served from precache) even after ?v= is fixed.",
  ].join("\n"));
});

// ── Suite 10b: page code-version stamp lock (S12.5 T4) ───────────────────────
//
// public/index.html carries a LITERAL `window.APP_VERSION = "3.11.N"` — the only
// version marker that ages together with the loaded tab (everything computed —
// window.__v3AppVersion, /api/client-config — reports the SERVER's version, so a
// stale tab would "prove" its own freshness). Two consumers depend on it being
// the truth: the stale-tab guard in studio-import.js (refuses to start a paid
// hour-long transcription run on outdated code) and the asr.codeVersion
// provenance stamp (the 2026-07-29 diagnostic session burned a whole hypothesis,
// H1, reconstructing "which code produced this run" by feature-detection).
//
// A literal only stays true while someone bumps it. This lives in Suite 10
// because that is already the "cache-bust / version bookkeeping" gate of the
// repo (`?v=` + CACHE_VERSION); the same edit that bumps CACHE_VERSION must move
// APP_VERSION with it, so one gate covers both halves of the same bookkeeping.

console.log("\n[Suite 10b] Page version stamp (public/index.html window.APP_VERSION vs public/sw.js CACHE_VERSION)");

const SW_JS_PATH = path.join(REPO_ROOT, "public/sw.js");

test("window.APP_VERSION in index.html matches CACHE_VERSION in sw.js", () => {
  const html = readIndexHtml();
  const swSrc = fs.readFileSync(SW_JS_PATH, "utf8");
  const appM = html.match(/window\.APP_VERSION\s*=\s*"v?([^"]+)"/);
  assert.ok(
    appM && appM[1],
    'Could not find the literal `window.APP_VERSION = "3.11.N"` in public/index.html. ' +
    "It must stay an inline literal in the document (NOT derived from /api/client-config — " +
    "that reports the server's version and would make a stale tab look fresh). Consumers: " +
    "the transcription stale-tab guard in public/js/studio-import.js, the asr.codeVersion " +
    "provenance stamp, and source_client_version in public/js/cloud-sync.js."
  );
  // Same anchored pattern server.js resolveAppVersion() and scripts/api-smoke.js use — a loose
  // /CACHE_VERSION\s*=/ also matches the SUFFIX of GRAPH_CACHE_VERSION in the same file.
  const swM = swSrc.match(/\bconst\s+CACHE_VERSION\s*=\s*"v?([^"]+)"/);
  assert.ok(swM && swM[1], "public/sw.js: `const CACHE_VERSION = \"vX.Y.Z\"` not found — cannot compare versions.");
  assert.strictEqual(
    appM[1], swM[1],
    `VERSION DRIFT: public/index.html window.APP_VERSION = "${appM[1]}" but public/sw.js ` +
    `CACHE_VERSION = "v${swM[1]}". They MUST be bumped in the same change: /api/client-config ` +
    "serves the sw.js number, so a mismatch makes every freshly loaded tab report itself as " +
    "stale — the transcription stale-tab guard would then refuse to run on perfectly current " +
    "code, and asr.codeVersion would stamp runs with a version that never shipped."
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
