"use strict";

// R3 (UI release program 2026-09-25, owner D5): word statuses are named instead of «1–4».
// Labels only — the stored values new|l1|l2|l3|l4|known|ignore do not change.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

test("every locale names the four learning levels and «do not learn»", () => {
  const expected = {
    ru: { l1: "незнакомо", l2: "узнаю", l3: "вспоминаю", l4: "почти знаю", ignore: "не учить" },
    en: { l1: "unfamiliar", l2: "recognize", l3: "recalling", l4: "almost know", ignore: "don't learn" },
    he: { l1: "לא מוכר", l2: "מזהה", l3: "נזכר", l4: "כמעט יודע", ignore: "לא ללמוד" },
  };
  for (const [locale, labels] of Object.entries(expected)) {
    const src = read(`public/i18n/locales/${locale}.js`);
    const start = src.indexOf("status: { title:");
    assert.ok(start > 0, `${locale}: room.morph.status block`);
    const block = src.slice(start, src.indexOf("}", start));
    for (const [code, label] of Object.entries(labels)) {
      assert.ok(block.includes(`${code}: "${label}"`) || block.includes(`"${code}": "${label}"`), `${locale}: ${code} → ${label}`);
    }
  }
});

test("no surface prints a bare digit for a level", () => {
  const morph = read("public/js/reader-morph.js");
  assert.doesNotMatch(morph, /\["l[1-4]", null\]/);
  assert.doesNotMatch(morph, /val\.replace\("l", ""\)/);
  const room = read("public/js/library-ui.js");
  assert.doesNotMatch(room, /\['l[1-4]', null, '[1-4]'\]/);
  assert.doesNotMatch(room, /\['l[1-4]', '[1-4]'\]/);
  assert.doesNotMatch(read("public/index.html"), /\["l[1-4]", "[1-4]"\]/);
});

test("stored status values are unchanged", () => {
  const morph = read("public/js/reader-morph.js");
  assert.match(morph, /var _LV_UP = \{ "new": "l1", l1: "l2", l2: "l3", l3: "l4", l4: "known", known: "known" \};/);
});

test("status chips are dark text on the status tint, 44px tall", () => {
  const css = read("public/css/reader-morph.css");
  const start = css.indexOf(".rm-status-btn {");
  const rule = css.slice(start, css.indexOf("}", start));
  assert.doesNotMatch(rule, /color: #fff/);
  assert.match(rule, /color: var\(--text-primary\)/);
  assert.match(rule, /min-height: 44px/);
  for (const code of ["new", "l1", "l2", "l3", "l4", "known", "ignore"]) {
    assert.match(css, new RegExp(`\\.rm-status-btn\\.rm-status-${code} +\\{ background: var\\(--ws-${code}-fill\\); border-color: var\\(--ws-${code}\\); \\}`));
  }
});
