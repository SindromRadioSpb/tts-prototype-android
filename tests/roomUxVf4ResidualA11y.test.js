"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const decision = read("docs/planning/ROOM_UX_VISUAL_FINISHING_VF4_DECISION_PACKET_2026_08_16.md");
const packet = read("docs/planning/ROOM_UX_VISUAL_FINISHING_VF4_IMPLEMENTATION_PACKET_2026_08_16.md");
const readerCss = read("public/css/reader-core.css");
const readerJs = read("public/js/reader-core.js");
const roomJs = read("public/js/library-ui.js");
const roomHtml = read("public/library.html");
const studio = read("public/index.html");
const sw = read("public/sw.js");
const server = read("server.js");
const locales = Object.fromEntries(["ru", "en", "he"].map((locale) => [
  locale,
  read(`public/i18n/locales/${locale}.js`),
]));

test("VF4 owner approval is formalized with one exact row-audio scope", () => {
  for (const value of [
    "F1=TARGETED_RESIDUAL_A11Y_STATE",
    "F2=ROW_AUDIO_STATE_NONCOLOR_LOCALE_ACTION_PARITY",
    "F3=ROOM_STUDIO_ROW_AUDIO_ONLY",
    "F4=EXISTING_GLYPHS_PLUS_NONCOLOR_MARKER_SEMANTICS",
    "F5=STATE_EXACT_NAMES_FORCED_COLORS_REDUCED_MOTION",
    "F6=READER_SHARED_CORE_WITH_STUDIO_PARITY_OVERRIDE",
    "F7=RED_GREEN_VERSION_LOCK_STATIC_ROLLBACK",
    "F8=SERIALIZED_ONE_SLICE_UPDATED_OWNER_CLIENT",
    "SCOPE=ROW_AUDIO_MARKER_AND_ROW_TTS_CONTROL_ONLY",
  ]) {
    assert.ok(decision.includes(value), `decision packet missing ${value}`);
    assert.ok(packet.includes(value), `implementation packet missing ${value}`);
  }
  assert.match(packet, /No visual-foundations, sprite, font, Morph, Trainer, Mentor/);
});

test("shared Reader builder and playback expose localized, current row-TTS actions", () => {
  assert.match(readerJs, /export function normalizeRowTtsLabels\(/);
  assert.match(readerJs, /export function applyRowTtsButtonState\(/);
  assert.match(readerJs, /const rowTtsLabels\s*=\s*normalizeRowTtsLabels/);
  assert.match(readerJs, /applyRowTtsButtonState\(b,\s*"loading"/);
  assert.match(readerJs, /applyRowTtsButtonState\(b,\s*"playing"/);
  assert.match(readerJs, /applyRowTtsButtonState\(b,\s*"error"/);
  assert.match(readerJs, /applyRowTtsButtonState\(b,\s*"idle"/);
  assert.match(readerJs, /aria-pressed="false"/);

  const buttonMarkup = readerJs.match(/<button type="button" class="row-tts-btn"[\s\S]{0,500}?<\/button>/);
  assert.ok(buttonMarkup, "shared row-TTS button markup missing");
  assert.doesNotMatch(buttonMarkup[0], /Озвучить/);
  assert.match(buttonMarkup[0], /rowTtsLabels\.play/);

  assert.match(roomJs, /rowTtsLabels:\s*roomRowTtsLabels\(\)/);
  assert.match(roomJs, /\/js\/reader-core\.js\?v=402/);
});

test("Studio Classic and IDE share localized row-TTS markup and atomic state updates", () => {
  assert.match(studio, /function v3RowTtsButtonMarkup\(/);
  assert.match(studio, /function v3ApplyRowTtsButtonState\(/);
  assert.ok((studio.match(/v3RowTtsButtonMarkup\(/g) || []).length >= 3,
    "helper definition plus Classic and IDE consumers required");
  const stateHelperStart = studio.indexOf("function v3ApplyRowTtsButtonState(");
  const stateHelperEnd = studio.indexOf("function v3RowTtsButtonMarkup(", stateHelperStart);
  assert.ok(stateHelperStart >= 0 && stateHelperEnd > stateHelperStart,
    "atomic Studio row-TTS state helper missing");
  const stateHelper = studio.slice(stateHelperStart, stateHelperEnd);
  for (const state of ["idle", "loading", "playing", "error"]) {
    assert.match(stateHelper, new RegExp(`${state}:\\s*\\{`));
  }
  assert.ok((studio.match(/v3ApplyRowTtsButtonState\(/g) || []).length >= 10,
    "Studio row-TTS state paths must use the atomic helper");
  assert.match(studio, /aria-pressed/);
});

test("Studio marker painter exposes localized existing truth without a new focus target", () => {
  assert.match(studio, /function v3SetRowAudioIndicator\(/);
  assert.match(studio, /removeAttribute\(["']aria-hidden["']\)/);
  assert.match(studio, /setAttribute\(["']role["'],\s*["']img["']\)/);
  assert.match(studio, /setAttribute\(["']aria-label["']/);
  assert.match(studio, /V3_ROW_AUDIO_STATES\s*=\s*Object\.freeze\(\["ok", "missing", "mismatch", "too-long", "working"\]\)/);
  for (const state of ["ok", "missing", "mismatch", "too-long"]) {
    assert.match(studio, new RegExp(`v3SetRowAudioIndicator\\([\\s\\S]{0,120}?["']${state}["']`));
  }
  assert.doesNotMatch(studio, /row-audio-ind[^>]+tabindex/);
});

test("Room and Studio markers have five non-color signatures and reduced-motion equivalence", () => {
  for (const css of [readerCss, studio]) {
    assert.match(css, /\.row-audio-ind\.state-ok\s*\{[\s\S]{0,220}?background:[^;]+;[\s\S]{0,220}?border-style:\s*solid/);
    assert.match(css, /\.row-audio-ind\.state-missing\s*\{[\s\S]{0,220}?background:\s*transparent;[\s\S]{0,220}?border-style:\s*solid/);
    assert.match(css, /\.row-audio-ind\.state-mismatch\s*\{[\s\S]{0,220}?background:\s*transparent;[\s\S]{0,220}?border-style:\s*dashed/);
    assert.match(css, /\.row-audio-ind\.state-too-long\s*\{[\s\S]{0,220}?border-radius:\s*2px;[\s\S]{0,220}?border-style:\s*solid/);
    assert.match(css, /\.row-audio-ind\.state-working\s*\{[\s\S]{0,220}?background:\s*transparent;[\s\S]{0,220}?border-style:\s*double/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.row-audio-ind\.state-working\s*\{[^}]*animation:\s*none/);
    assert.match(css, /@media \(forced-colors: active\)[\s\S]*?\.row-audio-ind\.state-mismatch[\s\S]*?border-style:\s*dashed/);
    assert.match(css, /@media \(forced-colors: active\)[\s\S]*?\.row-audio-ind\.state-working[\s\S]*?border-style:\s*double/);
  }
});

test("RU EN HE carry exact row-audio action and state keys", () => {
  for (const [locale, source] of Object.entries(locales)) {
    for (const key of [
      "playRow",
      "loadingRow",
      "stopRow",
      "retryRow",
      "tooLong",
      "working",
      "libraryOnly",
    ]) {
      assert.match(source, new RegExp(`${key}:`), `${locale} missing room.reader.audio.${key}`);
    }
  }
});

test("current release lock cache-busts changed Room, media host and locale assets exactly", () => {
  assert.match(studio, /window\.APP_VERSION\s*=\s*"3\.11\.473"/);
  assert.match(roomHtml, /id="roomFooterVersion"[^>]*>v3\.11\.473</);
  assert.match(sw, /const CACHE_VERSION = "v3\.11\.473"/);
  assert.match(studio, /\/js\/media-host\.js\?v=403/);
  assert.match(roomHtml, /\/js\/media-host\.js\?v=403/);
  assert.match(roomHtml, /\/css\/reader-core\.css\?v=399/);
  assert.match(roomHtml, /\/js\/library-ui\.js\?v=465/);
  for (const url of [
    "/js/library-ui.js?v=465",
    "/js/reader-core.js?v=402",
    "/css/reader-core.css?v=399",
    "/js/media-host.js?v=403",
    "/i18n/locales/ru.js?v=200",
    "/i18n/locales/en.js?v=200",
    "/i18n/locales/he.js?v=200",
  ]) {
    assert.ok(sw.includes(JSON.stringify(url)), `SW missing ${url}`);
    assert.ok(server.includes(JSON.stringify(url)), `integrity manifest missing ${url}`);
  }
  for (const locale of ["ru", "en", "he"]) {
    assert.match(studio, new RegExp(`/i18n/locales/${locale}\\.js\\?v=200`));
    assert.match(roomHtml, new RegExp(`/i18n/locales/${locale}\\.js\\?v=200`));
  }
});
