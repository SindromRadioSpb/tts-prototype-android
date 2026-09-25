"use strict";

// R2 (UI release program 2026-09-25): the study table stays a table on every width (owner D1);
// on phones it opens with a column preset instead of all five columns (owner D8).

const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../public/js/table-presets.js");

test("presets map to the owner's column pairs", () => {
  assert.deepEqual(P.toColumns("niqqud"), { he: false, niqqud: true, translit: false, ru: true });
  assert.deepEqual(P.toColumns("translit"), { he: false, niqqud: false, translit: true, ru: true });
  assert.deepEqual(P.toColumns("plain"), { he: true, niqqud: false, translit: false, ru: true });
  assert.deepEqual(P.toColumns("three"), { he: false, niqqud: true, translit: true, ru: true });
  assert.deepEqual(P.toColumns("hebrew"), { he: false, niqqud: true, translit: false, ru: false });
  assert.deepEqual(P.toColumns("all"), { he: true, niqqud: true, translit: true, ru: true });
  assert.deepEqual(P.toColumns("nope"), P.toColumns("all"));
});

test("fromColumns round-trips and reports custom", () => {
  for (const id of P.PRESETS) assert.equal(P.fromColumns(P.toColumns(id)), id);
  assert.equal(P.fromColumns({ he: true, niqqud: false, translit: true, ru: false }), "custom");
});

test("phone default is niqqud + translation, desktop shows all", () => {
  assert.equal(P.defaultFor(380), "niqqud");
  assert.equal(P.defaultFor(599), "niqqud");
  assert.equal(P.defaultFor(600), "all");
});

const fs = require("node:fs");
const path = require("node:path");
const readLf = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
const roomUi = readLf("public/js/library-ui.js");
const fnBody = (src, name) => {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  return src.slice(start, src.indexOf("\n}\n", start));
};

test("Room applies the viewport default only to a profile without saved columns", () => {
  const load = fnBody(roomUi, "loadReaderCfg");
  assert.match(load, /room\.niqqudMode/);
  assert.match(load, /TablePresets\.defaultFor\(/);
  assert.match(load, /if \(!hasSaved/, "default only when nothing is stored");
});

test("a Room preset keeps adaptive niqqud and tap-to-reveal translation", () => {
  const cols = fnBody(roomUi, "applyRoomPresetCols");
  assert.match(cols, /niqqudMode === 'off' \? 'full' : readerCfg\.niqqudMode/);
  assert.match(cols, /ruMode === 'off' \? 'show' : readerCfg\.ruMode/);
  const apply = fnBody(roomUi, "applyRoomPreset");
  assert.match(apply, /saveReaderCfg\(\)/);
  assert.match(apply, /rerenderReader\(\)/);
});

test("the Aa panel offers the presets as a radio group with every label in ru/en/he", () => {
  const aids = fnBody(roomUi, "buildAidsPanel");
  assert.match(aids, /role: 'radiogroup'/);
  assert.match(aids, /TablePresets\.PRESETS/);
  for (const locale of ["ru", "en", "he"]) {
    const src = readLf(`public/i18n/locales/${locale}.js`);
    for (const id of ["niqqud", "translit", "plain", "three", "hebrew", "all"]) {
      assert.match(src, new RegExp(`preset_${id}:`), `${locale}: room.aids.preset_${id}`);
    }
    assert.match(src, /presetsTitle:/, `${locale}: room.aids.presetsTitle`);
  }
});

const studio = readLf("public/index.html");
test("the Studio offers the same presets and applies them without touching the action column", () => {
  const apply = fnBody(studio, "applyPreset");
  assert.match(apply, /TablePresets\.PRESETS\.indexOf\(preset\)/);
  assert.match(apply, /action: tableVisibleColumns\.action/, "a preset never hides «Действие»");
  const group = studio.slice(studio.indexOf('class="table-presets"'), studio.indexOf('class="table-settings-row table-settings-cols"'));
  for (const id of ["niqqud", "translit", "plain", "three", "hebrew", "all"]) {
    assert.match(group, new RegExp(`data-preset="${id}"[^>]*data-i18n="room\.aids\.preset_${id}"`));
  }
});

test("a Studio profile without saved table settings opens with the preset for its screen", () => {
  const load = fnBody(studio, "loadTableSettings");
  assert.match(load, /if \(!raw\)[\s\S]{0,200}TablePresets\.defaultFor\(window\.innerWidth\)/);
});
