"use strict";
// O-033, 2026-09-28: a Gemini-built trigonometry card stored only learner Latin; switching the
// Studio profile to "Russian phonetics" changed nothing, and "SBL" showed learner Latin under an
// SBL header. The column is derived from the pointed text for the selected profile.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const D = require("../public/js/translit-display.js");
const { transliterateWithProfile: T } = require("../db/premium/translit.js");

const row = { he_niqqud: "שָׁלוֹם לָכֶם", translit: "Shalom lakhem", translit_ru: "" };
test('prepared profiles avoid derivation only for the exact pointing and engine version, while manual edits win', () => {
  let calls = 0; const derive = (text, profile) => { calls++; return T(text, profile); };
  derive.profileVersions = T.profileVersions;
  const profiles = Object.fromEntries(D.PROFILES.map(profile => [profile, T(row.he_niqqud, profile)]));
  const prepared = { ...row, translit_precomputed: { source: row.he_niqqud, versions: { ...T.profileVersions }, profiles } };
  const show = D.createDisplay(derive);
  for (const profile of D.PROFILES) assert.equal(show(prepared, profile), profiles[profile]);
  assert.equal(calls, 0);
  assert.equal(show({ ...prepared, edit_meta_json: { edited: { translit: true } }, translit: 'My Latin' }, 'sbl'), 'My Latin');
  assert.equal(calls, 0);
  show({ ...prepared, he_niqqud: 'בְּדִיקָה' }, 'sbl'); assert.equal(calls, 1);
  prepared.translit_precomputed.versions.sbl = 'old-engine'; show(prepared, 'sbl'); assert.equal(calls, 2);
});

test("every profile is derived from the pointed text, not from the stored column", () => {
  const show = D.createDisplay(T);
  assert.equal(show(row, "ru-phonetic"), T(row.he_niqqud, "ru-phonetic"));
  assert.equal(show(row, "sbl"), T(row.he_niqqud, "sbl"));
  assert.equal(show(row, "learner-latin"), T(row.he_niqqud, "learner-latin"));
  assert.notEqual(show(row, "sbl"), row.translit);
});

test("a hand-edited cell is shown as the person wrote it", () => {
  const show = D.createDisplay(T);
  const edited = { ...row, translit: "Shalom lakhem (my note)", edit_meta_json: JSON.stringify({ edited: { translit: true } }) };
  assert.equal(show(edited, "learner-latin"), "Shalom lakhem (my note)");
  const editedRu = { ...row, translit_ru: "шалом", edit_meta_json: { edited: { translit_ru: true } } };
  assert.equal(show(editedRu, "ru-phonetic"), "шалом");
});

test("without niqqud or an engine the stored text stays", () => {
  assert.equal(D.createDisplay(T)({ translit: "abc", he_niqqud: "" }, "sbl"), "abc");
  assert.equal(D.createDisplay(null)(row, "ru-phonetic"), "Shalom lakhem");
});

test("the Studio renders the column through the display and loads it in the shell", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8");
  assert.match(html, /<script src="\/js\/translit-display\.js\?v=\d+"><\/script>/);
  assert.match(html, /v3TranslitDisplay\(row, _tProfile\)/);
  assert.match(sw, /"\/js\/translit-display\.js\?v=\d+"/);
});

test("a render past its budget shows stored text, fills in the background, then asks for one redraw", async () => {
  const calls = [];
  const slowT = (text, profile) => { calls.push(profile); return T(text, profile); };
  const queue = [];
  const store = D.createStore(slowT, { budgetMs: 0, sliceMs: 1000, defer: (fn) => queue.push(fn) });
  const rows = [row, { ...row, he_niqqud: "תּוֹדָה" }];
  store.beginRender();
  assert.deepEqual(rows.map((r) => store.display(r, "sbl")), [row.translit, row.translit], "no budget: stored text");
  let redraws = 0;
  assert.equal(store.endRender(() => { redraws++; }), true);
  assert.equal(store.isFilling(), true);
  while (queue.length) queue.shift()();
  assert.equal(redraws, 1);
  store.beginRender();
  assert.equal(store.display(rows[1], "sbl"), T("תּוֹדָה", "sbl"), "derived after the fill");
  assert.equal(store.endRender(() => { redraws++; }), false, "nothing left: no second redraw");
  assert.equal(calls.length, 2);
});

function slicedStore() {
  // Independent virtual clock: each clock check costs one tick, so a three-tick slice can
  // process exactly two entries. No wall-clock timing or busy waits in scheduling assertions.
  let tick = 0;
  const context = { module: { exports: {} }, performance: { now: () => ++tick } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public/js/translit-display.js"), "utf8"), context);
  const tasks = [], calls = [];
  const store = context.module.exports.createStore((text, profile) => {
    calls.push([text, profile]);
    return profile + ':' + text;
  }, { budgetMs: 0, sliceMs: 3, defer: fn => tasks.push(fn) });
  return { store, tasks, calls };
}

test("repeated rows and overlapping renders share one background job per source and profile", () => {
  const { store, tasks, calls } = slicedStore();
  let redraws = 0;
  for (let render = 0; render < 3; render++) {
    store.beginRender();
    for (let i = 0; i < 10000; i++) store.display(row, 'sbl');
    store.display(row, 'ru-phonetic');
    assert.equal(store.endRender(() => redraws++), true);
  }
  assert.equal(tasks.length, 1, 'overlapping renders use one scheduled worker');
  tasks.shift()();
  assert.equal(tasks.length, 0, 'duplicate rows do not consume additional slices');
  assert.equal(calls.length, 2, 'each profile is still derived separately');
  assert.equal(redraws, 3, 'all callers are notified when their data is ready');
  assert.equal(store.isFilling(), false);
});

test("switching material cancels queued slices and old callbacks while keeping completed values", () => {
  const { store, tasks, calls } = slicedStore();
  const rows = Array.from({ length: 6 }, (_, i) => ({ ...row, he_niqqud: row.he_niqqud + i }));
  let oldRedraws = 0, newRedraws = 0;
  store.beginRender();
  rows.forEach(r => store.display(r, 'sbl'));
  store.endRender(() => oldRedraws++);
  tasks.shift()();
  assert.equal(calls.length, 2, 'the first bounded slice completes two rows');
  assert.equal(tasks.length, 1, 'the old material has unfinished scheduled work');
  store.cancelPending();
  assert.equal(store.isFilling(), false);
  store.beginRender();
  assert.equal(store.display(rows[0], 'sbl'), 'sbl:' + rows[0].he_niqqud, 'completed cache survives cancellation');
  store.display(row, 'ru-phonetic');
  store.endRender(() => newRedraws++);
  tasks.shift()();
  assert.equal(calls.length, 2, 'the stale scheduled slice does no work');
  assert.equal(store.isFilling(), true, 'stale slice cannot clear the new fill');
  tasks.shift()();
  assert.equal(calls.length, 3);
  assert.equal(oldRedraws, 0);
  assert.equal(newRedraws, 1);
  assert.equal(store.isFilling(), false);
});

test("studio and reader pick the profile and title the same way", () => {
  assert.equal(D.resolveProfile("ru-phonetic", false, true), "ru-phonetic");
  assert.equal(D.resolveProfile("ru-phonetic", false, false), "sbl");
  assert.equal(D.resolveProfile("learner-latin", false, false), "learner-latin");
  assert.equal(D.resolveProfile("sbl", true, true), "sbl");
});

test("the Reading Room offers all three profiles and reads a pre-680 'sbl' as learner Latin", () => {
  const lib = fs.readFileSync(path.join(__dirname, "..", "public", "library.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "..", "public", "js", "library-ui.js"), "utf8");
  const core = fs.readFileSync(path.join(__dirname, "..", "public", "js", "reader-core.js"), "utf8");
  const libIdx = lib.indexOf('src="/js/translit-display.js'), uiIdx = lib.indexOf('src="/js/library-ui.js');
  assert.ok(lib.includes('src="/js/local-translit-bundle.js') && libIdx > 0 && libIdx < uiIdx, "engine and store load before the Room module");
  assert.match(ui, /\['learner-latin', 'room\.reader\.profileLearner'/);
  assert.match(ui, /\(tp === 'sbl' && !tpV2\) \? 'learner-latin' : tp/);
  assert.match(ui, /translitDisplay: roomTranslit\(\) \? roomTranslit\(\)\.display : undefined/);
  assert.match(core, /translitDisplay\(row, tProfile\)/);
  for (const l of ["ru", "en", "he"]) {
    const loc = fs.readFileSync(path.join(__dirname, "..", "public", "i18n", "locales", l + ".js"), "utf8");
    assert.match(loc, /profileLearner: "/, l);
  }
});
