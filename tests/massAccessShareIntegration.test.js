"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("shared Send or save service is loaded and precached on Studio and Room", () => {
  const studio = read("public/index.html");
  const room = read("public/library.html");
  const sw = read("public/sw.js");
  for (const [surface, source] of [["Studio", studio], ["Room", room]]) {
    assert.match(source, /<script src="\/js\/share-service\.js"><\/script>/, `${surface} does not load share-service.js`);
  }
  assert.match(sw, /"\/js\/share-service\.js"/, "offline shell does not precache share-service.js");
});

test("Studio primary Share uses a prepared learning ZIP while JSON stays compatibility-only", () => {
  const studio = read("public/index.html");
  const modalStart = studio.indexOf('id="v3TextCardShareModal"');
  const modalEnd = studio.indexOf('id="v3TextCardImportModal"', modalStart);
  const modal = studio.slice(modalStart, modalEnd);
  assert.match(modal, /id="v3TcsPackageFacts"/);
  assert.match(modal, /<details[^>]+v3-tcs-advanced/);
  assert.match(modal, /id="v3TcsBtnNative"[^>]+data-i18n="tcs\.btnShareZip"/);
  assert.match(modal, /id="v3TcsBtnZip"[^>]+data-i18n="tcs\.btnSaveZip"/);
  assert.match(modal, /id="v3TcsBtnJson"[\s\S]*?<\/details>/);

  const shareStart = studio.indexOf("async function v3TextCardShareNative");
  const shareEnd = studio.indexOf("window.v3TextCardShareNative", shareStart);
  const shareSource = studio.slice(shareStart, shareEnd);
  assert.match(shareSource, /ShareService\.shareFile/);
  assert.match(shareSource, /v3TcsPreparedArtifact/);
  assert.doesNotMatch(shareSource, /_v3TcsJsonBlob/);

  const saveStart = studio.indexOf("function v3TextCardShareDownloadZip");
  const saveEnd = studio.indexOf("window.v3TextCardShareDownloadZip", saveStart);
  assert.match(studio.slice(saveStart, saveEnd), /ShareService\.saveFile/);
});

test("Studio package build is separate from share/save and exposes exact audio facts", () => {
  const studio = read("public/index.html");
  assert.match(studio, /ShareService\.buildLearningPackage/);
  assert.match(studio, /expectedAudio/);
  assert.match(studio, /includedAudio/);
  assert.match(studio, /missingAudio/);
  assert.match(studio, /v3TextCardPrepareZip/);
  assert.match(studio, /SHARE_SHEET_COMPLETED/);
  assert.match(studio, /SAVE_STARTED/);
  assert.match(studio, /SHARE_CANCELLED/);
});

test("Studio keeps the canonical learning ZIP usable when optional portable history is unavailable", () => {
  const studio = read("public/index.html");
  assert.match(studio, /optional portable material lookup unavailable/);
  assert.match(studio, /optional portable ZIP extension unavailable/);
  assert.match(studio, /portable_learning_packages_complete = false/);
  assert.match(studio, /portable_learning_packages_unavailable_reason/);
  assert.match(studio, /tcs\.portableHistoryUnavailable/);
});

test("Send or save dialogs isolate their background and keep touch targets accessible", () => {
  const studio = read("public/index.html");
  const room = read("public/js/library-ui.js");
  assert.match(studio, /function v3TcsSuspendBackground/);
  assert.match(studio, /setAttribute\('inert', ''\)/);
  assert.match(studio, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(studio, /#v3TextCardShareModal \.v3-modal-header button \{ min-height: 44px; \}/);
  assert.match(studio, /\.v3-tcs-advanced summary \{[^}]*min-height: 44px;/);
  assert.match(studio, /closest\('details:not\(\[open\]\)'\)/);
  assert.match(room, /function roomSuspendBackground/);
  assert.match(room, /roomRestoreBackground\(backgroundA11y\)/);
});

test("Reading Room reuses the shared service for protected links and My Texts ZIP", () => {
  const room = read("public/js/library-ui.js");
  assert.match(room, /ShareService\.shareLink/);
  assert.match(room, /GROUP_RESTRICTED/);
  assert.match(room, /function openMyTextShare/);
  assert.match(room, /service\.buildLearningPackage/);
  assert.match(room, /service\.shareFile/);
  assert.match(room, /service\.saveFile/);
  assert.match(room, /room\.share\.open/);
  assert.match(room, /optional portable ZIP extension unavailable/);
  assert.match(room, /tcs\.portableHistoryUnavailable/);
});

test("RU EN HE expose the same Send or save state vocabulary", () => {
  for (const locale of ["ru", "en", "he"]) {
    const source = read(`public/i18n/locales/${locale}.js`);
    for (const key of [
      "sendOrSave", "btnShareZip", "btnSaveZip", "advanced", "packagePreparing",
      "packageReady", "packagePartial", "portableHistoryUnavailable", "shareCompleted", "shareCancelled",
      "shareUnsupported", "saveStarted", "expectedAudio", "includedAudio", "missingAudio",
    ]) {
      assert.match(source, new RegExp(`\\b${key}\\s*:`), `${locale} missing tcs.${key}`);
    }
    for (const key of ["open", "title", "protectedAccess", "preparing", "ready", "partial"]) {
      assert.match(source, new RegExp(`\\b${key}\\s*:`), `${locale} missing room.share.${key}`);
    }
  }
});

test("Studio library cards name the new Send or save action in every locale", () => {
  const expected = {
    ru: "Отправить или сохранить",
    en: "Send or save",
    he: "שליחה או שמירה",
  };
  for (const [locale, label] of Object.entries(expected)) {
    const source = read(`public/i18n/locales/${locale}.js`);
    assert.match(source, new RegExp(`share:\\s*"↗ ${label}"`));
  }
});

test("I3 does not add migration, public-corpus writer or B9 entities", () => {
  const migrations = fs.readdirSync(path.join(root, "migrations")).filter((name) => name.endsWith(".sql")).join("\n");
  assert.doesNotMatch(migrations, /published_corpora|curated_paths|path_assignments/i);
  const service = read("public/js/share-service.js");
  assert.doesNotMatch(service, /review_log|fetch\([^)]*\/api\/publication|localStorage\.setItem/);
});
