"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const html = read("public/library.html");
const js = read("public/js/library-ui.js");
const ru = read("public/i18n/locales/ru.js");
const en = read("public/i18n/locales/en.js");
const he = read("public/i18n/locales/he.js");
const indexHtml = read("public/index.html");
const sw = read("public/sw.js");
const packet = read("docs/planning/ROOM_UX_VISUAL_FINISHING_VF1_IMPLEMENTATION_PACKET_2026_08_15.md");

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  return source.slice(start, end > start ? end : start + 6000);
}

test("VF1 records exact authority, slice and evidence limitations", () => {
  assert.match(packet, /Status: `VF1_[A-Z0-9_]+`/);
  assert.match(packet, /VF0 PROD=PASS/);
  assert.match(packet, /editorial calm, operational clarity/i);
  assert.match(packet, /physical mobile and assistive technology are `NOT_RUN`/);
  assert.match(packet, /Reader\/Morph\/Trainer\/Mentor content and Studio content remain backlog/);
  assert.match(packet, /no learner\/provider\/network write/i);
});

test("VF1 Room shell uses first-party and system icons with localized native names", () => {
  assert.match(html, /class="room-title"[\s\S]*data-room-icon="lp-mark-room"[\s\S]*data-i18n="room\.header\.title"/);
  for (const [id, symbol, key] of [
    ["roomStudioLink", "lp-mark-studio", "room.header.studio"],
    ["roomMentor", "lp-mark-mentor", "room.mentor.btn"],
    ["roomCloud", "lp-icon-sync", "room.cloud.btn"],
  ]) {
    const control = new RegExp(`id="${id}"[^>]*data-room-icon="${symbol}"[^>]*data-i18n-title="${key}"[^>]*data-i18n-aria-label="${key}"`);
    assert.match(html, control, `${id} must own a localized name and an approved symbol`);
  }
  assert.match(html, /id="roomTheme"[^>]*data-room-icon="lp-icon-theme"[^>]*aria-label="Тема"/);
  assert.match(extractFunction(js, "applyTheme", "cycleTheme"), /setAttribute\('title', lbl\)[\s\S]*setAttribute\('aria-label', lbl\)/,
    "theme owns a localized mode-specific name that generic applyI18n must not overwrite");
  assert.match(html, /id="roomFooterStudioLink"[\s\S]*data-room-icon="lp-mark-studio"[\s\S]*data-i18n="room\.footer\.studio"/);
  assert.doesNotMatch(html, /<h1[^>]*data-i18n="room\.header\.title"/,
    "i18n text replacement must not destroy the Room mark");
  assert.match(html, /<button[^>]*class="[^"]*room-vf1-focus[^"]*"[^>]*id="roomDueCta"/,
    "the cross-text due CTA must use the shared keyboard focus contract");
  const due = extractFunction(js, "refreshDueBadge", "renderHome");
  assert.match(due, /roomIcon\('lp-icon-train', '🔁'\)/);
  assert.match(due, /roomIcon\('lp-icon-chevron-right', '→', 'room-icon-directional'\)/);
  assert.match(due, /tt\('room\.morph\.study\.due'/);
  assert.match(due, /roomNumber\(n\)/);
  assert.match(extractFunction(js, "wireChrome", "openAbout"), /_paintDueCTA\(\)/,
    "locale changes must repaint the dynamic due CTA");
});

test("VF1 icon enhancement is fallback-first, bounded and read-only", () => {
  assert.match(js, /const ROOM_ICON_SPRITE = '\/icons\/linguistpro-ui\.svg'/);
  assert.match(js, /fetch\(ROOM_ICON_SPRITE,\s*\{\s*cache: 'force-cache'/);
  assert.match(js, /response\.ok[\s\S]*image\/svg\+xml/);
  assert.match(js, /function roomIcon\(/);
  assert.match(js, /room-icon-fallback/);
  assert.match(js, /function hydrateRoomIcons\(/);
  const helper = js.slice(js.indexOf("const ROOM_ICON_SPRITE"), js.indexOf("// B4 Learning Compass"));
  assert.doesNotMatch(helper, /(?:POST|PUT|PATCH|DELETE)|\/api\/|localStorage|indexedDB|localDb|sendBeacon/i,
    "icon enhancement may only read the pinned static sprite");
});

test("VF1 adopts the bounded L0 and corpus icon set without changing ownership", () => {
  assert.match(js, /function roomCorpusIconSpec\(/);
  for (const symbol of [
    "lp-mark-room", "lp-mark-studio", "lp-icon-train", "lp-icon-audio",
    "lp-icon-bookmark", "lp-icon-success", "lp-icon-note", "lp-icon-list-add",
    "lp-icon-search", "lp-icon-settings", "lp-icon-close",
  ]) assert.match(js, new RegExp(symbol), `missing VF1 consumer ${symbol}`);
  assert.match(extractFunction(js, "learningHomeJourney", "renderCorpusHub"), /'bookmark', 'lp-icon-bookmark'[\s\S]*roomIcon\(symbol, iconFallback/);
  assert.match(extractFunction(js, "corpusShellHeader", "corpusSecondaryDisclosure"), /roomCorpusIconSpec/);
  assert.match(extractFunction(js, "updateListBtn", "openListPicker"), /lp-icon-(?:success|list-add)/);
  assert.doesNotMatch(js, /ROOM-UX-VF1[\s\S]*(?:recommendation|assignment|review_log)\s*=/i,
    "VF1 must not introduce a new truth writer");
});

test("VF1 generic Room states use shared anatomy and keep surface-owned copy", () => {
  assert.match(js, /const ROOM_STATE_PRESENTATION = Object\.freeze/);
  assert.match(js, /'room\.state\.loading':\s*\{\s*kind: 'info',\s*symbol: 'lp-icon-loading'/);
  assert.match(js, /'room\.state\.error':\s*\{\s*kind: 'error',\s*symbol: 'lp-icon-error'/);
  assert.match(js, /'room\.connection\.offlinePartial':\s*\{\s*kind: 'warning',\s*symbol: 'lp-icon-offline'/);
  const state = extractFunction(js, "stateBoxNode", "corpusNavTo");
  assert.match(state, /class: 'room-state lp-state'/);
  assert.match(state, /'data-kind': spec\.kind/);
  assert.match(state, /role: spec\.kind === 'error' \? 'alert' : 'status'/);
  assert.match(state, /i18n: i18nKey/);
  assert.doesNotMatch(state, /\.focus\(|click\(|fetch\(/);
});

test("VF1 typography, bidi and numeric formatting use approved existing roles", () => {
  assert.match(html, /html\[lang="he"\] body[\s\S]*var\(--lp-font-hebrew-ui\)/);
  assert.match(html, /\.learning-home-feature-title\[lang="he"\][\s\S]*var\(--lp-font-hebrew-reading\)/);
  assert.doesNotMatch(html, /Noto Serif Hebrew/);
  assert.match(js, /function markRoomTextLanguage\(/);
  assert.match(js, /setAttribute\('lang', 'he'\)/);
  assert.match(js, /function roomNumber\([\s\S]*Intl\.NumberFormat/);
  assert.match(js, /el\('bdi', \{ class: 'learning-corpus-title'/);
  assert.match(js, /el\('bdi', \{ class: 'corpus-work-title'/);
});

test("VF1 focus, density, motion, reduced-motion and forced-colors stay bounded", () => {
  assert.match(html, /\.room-theme-btn[\s\S]*min-height:\s*var\(--lp-target-compact\)/);
  assert.match(html, /\.room-vf1-focus:focus-visible[\s\S]*var\(--lp-focus-ring\)/);
  assert.match(html, /var\(--lp-motion-hover\) var\(--lp-ease-standard\)/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.room-vf1-lift:hover[\s\S]*transform:\s*none/);
  assert.match(html, /@media \(forced-colors: active\)[\s\S]*\.room-vf1-focus:focus-visible/);
  assert.match(html, /@media \(max-width: 480px\)[\s\S]*\.room-head-controls[\s\S]*flex-wrap:\s*wrap/);
});

test("shared Room identity text remains emoji-free at the current locale cache key", () => {
  for (const [source, title, studio, cloud, mentor] of [
    [ru, "Читальный зал", "Студия", "Синхронизация", "Наставник"],
    [en, "Reading Room", "Studio", "Sync", "Mentor"],
    [he, "חדר קריאה", "סטודיו", "סנכרון", "מנטור"],
  ]) {
    assert.match(source, new RegExp(`header: \\{[\\s\\S]{0,180}title: "${title}"`));
    assert.match(source, new RegExp(`footer: \\{[\\s\\S]{0,100}studio: "${studio}"`));
    assert.match(source, new RegExp(`cloud: \\{[\\s\\S]{0,120}title: "${cloud}"`));
    assert.match(source, new RegExp(`mentor: \\{[\\s\\S]{0,120}title: "${mentor}"`));
  }
  for (const locale of ["ru", "en", "he"]) {
    assert.match(html, new RegExp(`/i18n/locales/${locale}\\.js\\?v=169`));
    assert.match(indexHtml, new RegExp(`/i18n/locales/${locale}\\.js\\?v=169`));
  }
});

test("current release surfaces lock together and retain the corrected Room module URL", () => {
  const app = indexHtml.match(/window\.APP_VERSION\s*=\s*"([^"]+)"/);
  const room = html.match(/id="roomFooterVersion"[^>]*>v([^<]+)</);
  const worker = sw.match(/const CACHE_VERSION\s*=\s*"v([^"]+)"/);
  assert.ok(app && room && worker);
  assert.equal(app[1], "3.11.399");
  assert.equal(room[1], app[1]);
  assert.equal(worker[1], app[1]);
  assert.match(html, /<script type="module" src="\/js\/library-ui\.js\?v=399"><\/script>/,
    "a stale controlling SW must not reuse the pre-VF2 Room module URL");
});

test("VF2 Room reports the loaded shell version honestly and has a network fallback", () => {
  assert.match(js, /const roomShellVersion[\s\S]*roomFooterVersion/);
  assert.match(js, /roomVersionMismatch = !!\(roomShellVersion && roomAppVersion !== roomShellVersion\)/);
  assert.match(js, /url\.searchParams\.set\('room_update', roomAppVersion/);
  assert.match(js, /roomWaitingWorker \|\| roomVersionMismatch/);
  assert.match(js, /watch\(reg\.installing\)/,
    "an already-installing worker must not miss the update-ready notification");
  const versionLoader = extractFunction(js, "loadRoomVersion", "refreshAboutUpdateStatus");
  assert.match(versionLoader, /const displayedVersion = roomShellVersion \|\| roomAppVersion/);
  assert.doesNotMatch(versionLoader, /fv\.textContent = roomAppVersion/,
    "server config must not impersonate the bytes loaded in the current document");
});
