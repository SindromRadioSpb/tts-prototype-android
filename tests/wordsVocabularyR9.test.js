"use strict";

// R9 (UI release program, audit P1-2, P1-3, P2-7, P2-8): one name for the learner's words.
// Before: «Сохранить слово» → toast «Слово сохранено в заметки» → badge «🆕 в заметках» →
// sheet «Разобрать слова» → mode «Тренировка», while the nav says «Повторение».

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const locale = (l) => { const box = { window: {} }; vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box); return box.window.I18N_LOCALES[l]; };
const at = (obj, key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

const EXPECT = {
  ru: {
    "room.morph.save": "＋ Добавить в мои слова",
    "room.morph.savedToast": "Добавлено в мои слова",
    "room.morph.life.created": "в моих словах",
    "room.morph.study.open": "Мои слова",
    "room.morph.study.title": "Мои слова",
    "room.morph.study.modeTrain": "Повторение",
    "room.morph.study.trainTitle": "Повторение",
    "room.morph.study.heatShort": "Календарь",
    "room.morph.study.reportShort": "Запоминание",
  },
  en: {
    "room.morph.save": "＋ Add to my words",
    "room.morph.savedToast": "Added to my words",
    "room.morph.life.created": "in my words",
    "room.morph.study.open": "My words",
    "room.morph.study.title": "My words",
    "room.morph.study.modeTrain": "Review",
    "room.morph.study.trainTitle": "Review",
    "room.morph.study.heatShort": "Calendar",
    "room.morph.study.reportShort": "Memory",
  },
  he: {
    "room.morph.save": "＋ הוספה למילים שלי",
    "room.morph.savedToast": "נוסף למילים שלי",
    "room.morph.life.created": "במילים שלי",
    "room.morph.study.open": "המילים שלי",
    "room.morph.study.title": "המילים שלי",
    "room.morph.study.modeTrain": "חזרה",
    "room.morph.study.trainTitle": "חזרה",
    "room.morph.study.heatShort": "לוח שנה",
    "room.morph.study.reportShort": "זכירה",
  },
};

test("one name from the word card to review, in ru, en and he", () => {
  for (const [l, keys] of Object.entries(EXPECT)) {
    const loc = locale(l);
    for (const [key, value] of Object.entries(keys)) assert.equal(at(loc, key), value, `${l} ${key}`);
  }
});

test("the JS fallbacks say the same (a stale locale never shows the old chain)", () => {
  const morph = read("public/js/reader-morph.js");
  assert.match(morph, /tt\("room\.morph\.save", "＋ Добавить в мои слова"\)/);
  assert.doesNotMatch(morph, /"＋ Сохранить слово"/);
  assert.match(morph, /created: \["room\.morph\.life\.created", "в моих словах"\]/);   // R11a: no 🆕
  assert.match(read("public/js/morph-host.js"), /_tt\("room\.morph\.savedToast", "Добавлено в мои слова"\)/);
  const ui = read("public/js/library-ui.js");
  assert.doesNotMatch(ui, /'📚 Разобрать слова'/);
  assert.doesNotMatch(ui, /'🎯 Тренировка'/);
});

test("the sheet's calendar and memory buttons carry visible labels", () => {
  const ui = read("public/js/library-ui.js");
  const head = ui.slice(ui.indexOf("function ensureStudySheet()"), ui.indexOf("card.appendChild(head);", ui.indexOf("function ensureStudySheet()")));
  // R11a: a sprite icon plus the visible label (was the '📅 ' / '📊 ' emoji + label).
  assert.match(head, /calBtn\.replaceChildren\(roomIcon\('lp-icon-calendar', '📅'\), document\.createTextNode\(tt\('room\.morph\.study\.heatShort', 'Календарь'\)\)\);/);
  assert.match(head, /repBtn\.replaceChildren\(roomIcon\('lp-icon-chart', '📊'\), document\.createTextNode\(tt\('room\.morph\.study\.reportShort', 'Запоминание'\)\)\);/);
  assert.match(head, /tools\.appendChild\(calBtn\);[\s\S]*tools\.appendChild\(repBtn\);\n  head\.appendChild\(tools\);/, "one row of tools");
});

test("toasts rise above an open word card or words sheet", () => {
  const css = read("public/css/app-nav.css");
  assert.match(css, /body:has\(\.rm-sheet\.rm-open:not\(\[hidden\]\)\) \.room-toast,\nbody:has\(\.room-study\.room-study-open:not\(\[hidden\]\)\) \.room-toast,\nbody:has\(\.rm-sheet\.rm-open:not\(\[hidden\]\)\) #toastContainer \{\n  top: calc\(12px \+ env\(safe-area-inset-top, 0px\)\); bottom: auto;\n\}/);
});

test("the glossary names every term in three languages and records the «Мои материалы» decision", () => {
  const g = read("docs/planning/UI_GLOSSARY_2026_09_26.md");
  for (const term of ["Зал", "Медиатека", "Студия", "Мои слова", "Повторение", "Добавить в мои слова"]) assert.match(g, new RegExp("\\| " + term + " \\|"), term);
  assert.match(g, /המילים שלי/);
  assert.match(g, /My words/);
  assert.match(g, /решение владельца 2026-09-26/);   // the «Библиотека» clash is decided
});

// R9 verification (380): «Календарь» / «Запоминание» spilled out of 44px icon buttons, and the
// reader header told a new profile «Не менее 0% знакомы · 0/104» (the R8 rule, missed there).
test("labelled sheet buttons size to their text; the reader chip stays quiet for a new profile", () => {
  const html = read("public/library.html");
  assert.match(html, /\.room-study-cal \{\s*width: auto !important; min-width: 44px; height: 44px;[^}]*white-space: nowrap;/);
  const ui = read("public/js/library-ui.js");
  const chip = ui.slice(ui.indexOf("async function refreshCovChip()"), ui.indexOf("// ── PAS-D2b Scaffold"));
  assert.match(chip, /const newProfile = fit\.status === 'NEEDS_PROFILE'\s*\|\| \(\(fit\.status === 'AVAILABLE' \|\| fit\.status === 'AVAILABLE_LIMITED'\) && fit\.counts && Number\(fit\.counts\.familiar\) === 0\);/);
  assert.match(chip, /if \(newProfile\) \{ clearCovChip\(\); return; \}/);
});
