"use strict";

// Owner decision 2026-09-26: Studio's store of saved cards is «Мои материалы»; «Библиотека» stays
// only for the Reading Room's corpus tab. One name per entity (glossary). phoneDownload.* is the
// owner-qualified iPhone helper package copy: it changes only with a package rebuild.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const locale = (l) => { const b = { window: {} }; vm.runInNewContext(read(`public/i18n/locales/${l}.js`), b); return b.window.I18N_LOCALES[l]; };

test("outside the Reading Room no Russian string calls the saved cards «библиотека»", () => {
  const ru = locale("ru");
  const bad = [];
  (function walk(o, p) {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? p + "." + k : k;
      if (typeof v === "string") { if (/библиотек/i.test(v) && !/^(room|discovery|phoneDownload)\./.test(key)) bad.push(key + " = " + v); }
      else if (v && typeof v === "object") walk(v, key);
    }
  })(ru, "");
  assert.deepEqual(bad, []);
});

test("the names in each language", () => {
  const expect = { ru: ["Мои материалы", "Сохранить в мои материалы", "Библиотека"], en: ["My materials", "Save to My materials", "Library"], he: ["החומרים שלי", "שמור לחומרים שלי", "ספרייה"] };
  for (const [l, [lib, save, roomTab]] of Object.entries(expect)) {
    const L = locale(l);
    assert.equal(L.classic.library, lib, l);
    assert.equal(L.saveMeta.title, save, l);
    assert.equal(L.room.tabs.corpus, roomTab, l + ": the Room tab keeps its name");
  }
  const g = read("docs/planning/UI_GLOSSARY_2026_09_26.md");
  assert.match(g, /\| Мои материалы \|/);
  assert.doesNotMatch(g, /## Открытый вопрос владельцу/);
});
