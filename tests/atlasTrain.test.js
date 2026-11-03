"use strict";
// Atlas P5 — the exam-skill trainer (plan docs/planning/ENGINEERING_ATLAS_P5_TRAINER_PLAN_2026_11_03.md).
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseHTML } = require("linkedom");
const T = require("../public/js/atlas-train.js");

const ALL = { he: true, niqqud: true, translit: true, ru: true, script: "lat" };

// ---- G1: translation stages ----
test("stage 0 keeps the reader's own columns", () => {
  assert.deepEqual(T.layersFor(0, ALL), ALL);
  const mine = { he: false, niqqud: true, translit: false, ru: true, script: "cyr" };
  assert.deepEqual(T.layersFor(0, mine), mine);
});

test("stages 1 and 2 hide the translation and the transliteration, keep the Hebrew columns", () => {
  for (const s of [1, 2]) {
    assert.deepEqual(T.layersFor(s, ALL), { he: true, niqqud: true, translit: false, ru: false, script: "lat" });
    assert.deepEqual(T.layersFor(s, { he: false, niqqud: true, translit: true, ru: true, script: "cyr" }),
      { he: false, niqqud: true, translit: false, ru: false, script: "cyr" });
  }
});

test("stages 1 and 2 never leave a row without Hebrew when the reader kept only the transliteration", () => {
  const onlyTranslit = { he: false, niqqud: false, translit: true, ru: true, script: "lat" };
  const l = T.layersFor(1, onlyTranslit);
  assert.equal(l.he || l.niqqud, true);
  assert.equal(l.translit, false);
});

test("stage 3 is the book: plain Hebrew only, no pointing (owner Г1)", () => {
  assert.deepEqual(T.layersFor(3, ALL), { he: true, niqqud: false, translit: false, ru: false, script: "lat" });
  assert.deepEqual(T.layersFor(3, { he: false, niqqud: true, translit: false, ru: true, script: "lat" }),
    { he: true, niqqud: false, translit: false, ru: false, script: "lat" });
});

test("gloss policy per stage", () => {
  assert.deepEqual([0, 1, 2, 3].map(T.glossPolicy), ["none", "unknown", "terms", "none"]);
});

test("the stage of a section: missing, broken or out-of-range values are stage 0", () => {
  assert.equal(T.stageOf(null, "s01"), 0);
  assert.equal(T.stageOf({}, "s01"), 0);
  assert.equal(T.stageOf({ s01: 7 }, "s01"), 0);
  assert.equal(T.stageOf({ s01: "2" }, "s01"), 2);
  assert.equal(T.stageOf({ s01: 3, s02: 1 }, "s02"), 1);
  const next = T.setStage({ s01: 1 }, "s02", 3);
  assert.deepEqual(next, { s01: 1, s02: 3 });
  assert.deepEqual(T.setStage({ s01: 1 }, "s01", 0), {}, "stage 0 is the default and is not stored");
});

test("a known word: know/known, almost-known (l4) and do-not-learn", () => {
  for (const s of ["know", "known", "l4", "ignore"]) assert.equal(T.isKnownStatus(s), true, s);
  for (const s of ["", "new", "l1", "l2", "l3", "learning", undefined]) assert.equal(T.isKnownStatus(s), false, String(s));
});

test("next-stage hint: 80% strong terms and at least 5; never past stage 3 (owner Г2)", () => {
  assert.equal(T.nextStageHint(0, { termsTotal: 5, termsStrong: 3 }), null);
  assert.deepEqual(T.nextStageHint(0, { termsTotal: 5, termsStrong: 4 }), { stage: 1, share: 0.8 });
  assert.deepEqual(T.nextStageHint(2, { termsTotal: 10, termsStrong: 10 }), { stage: 3, share: 1 });
  assert.equal(T.nextStageHint(1, { termsTotal: 4, termsStrong: 4 }), null, "too few terms to judge");
  assert.equal(T.nextStageHint(3, { termsTotal: 10, termsStrong: 10 }), null);
  assert.equal(T.nextStageHint(0, null), null);
});

// a section row as the reader renders it once the word card wrapped the Hebrew words
function sectionDom() {
  const { document } = parseHTML(`<!doctype html><html><body><div class="atlas-section">
    <div class="atlas-row" data-ref="b1" data-wg-row="1">
      <div class="atlas-he atlas-niqqud" data-col="niqqud"><span class="rm-w" data-w-offset="0">כֹּחַ</span> <span class="rm-w" data-w-offset="1">הֶיקֵּפִי</span> <span class="rm-w rm-w-l4" data-w-offset="2">גָּדוֹל</span></div>
      <div class="atlas-he" data-col="he"><span class="rm-w" data-w-offset="0">כוח</span> <span class="rm-w" data-w-offset="1">היקפי</span> <span class="rm-w" data-w-offset="2">גדול</span></div>
      <div class="atlas-ru" data-col="ru">Большая окружная сила</div>
    </div>
    <div class="atlas-row" data-ref="b2" data-wg-row="1">
      <div class="atlas-he" data-col="he"><span class="rm-w" data-w-offset="0">רצועה</span></div>
    </div>
  </div></body></html>`);
  return document.querySelector(".atlas-section");
}
const ctx = {
  terms: { "a97002:term:tangential-force": { lemma_he: "כוח היקפי", senses: [{ sense: "tf", ru: "окружная сила" }] } },
  located: (id) => (id === "b1"
    ? { he: { spans: [{ from: 0, to: 1, id: "a97002:term:tangential-force", sense: "tf" }] },
      niqqud: { spans: [{ from: 0, to: 1, id: "a97002:term:tangential-force", sense: "tf" }] }, loose: [] }
    : { he: { spans: [] }, niqqud: { spans: [] }, loose: [] }),
};
const GL = { b1: ["сила", "окружная", "большая"], b2: ["ремень"] };
const wordAt = (row, k) => { const g = GL[row.getAttribute("data-ref")]; return g && g[k] ? { gloss: g[k] } : null; };
const glossOf = (sec, ref, col, k) => sec.querySelector(`[data-ref="${ref}"] [data-col="${col}"] .rm-w[data-w-offset="${k}"]`).getAttribute("data-atlas-gloss");

test("stage 1: every unknown word gets its in-context gloss, a known word does not", () => {
  const sec = sectionDom();
  const r = T.paintStage(sec, 1, ctx, wordAt);
  assert.equal(glossOf(sec, "b1", "niqqud", 0), "сила");
  assert.equal(glossOf(sec, "b1", "he", 1), "окружная");
  assert.equal(glossOf(sec, "b1", "niqqud", 2), null, "l4 is almost known: no gloss");
  assert.equal(glossOf(sec, "b2", "he", 0), "ремень");
  assert.equal(r.painted > 0, true);
  assert.equal(sec.classList.contains("atlas-stage-1"), true);
});

test("stage 2: only the words of a term, its reviewed sense once on the first word", () => {
  const sec = sectionDom();
  T.paintStage(sec, 2, ctx, wordAt);
  assert.equal(glossOf(sec, "b1", "niqqud", 0), "окружная сила");
  assert.equal(glossOf(sec, "b1", "niqqud", 1), "", "second word of the term: marked, no repeated meaning");
  assert.equal(glossOf(sec, "b1", "niqqud", 2), null);
  assert.equal(glossOf(sec, "b2", "he", 0), null);
});

test("stage 3 and stage 0 leave no gloss; changing stage removes the previous one", () => {
  const sec = sectionDom();
  T.paintStage(sec, 1, ctx, wordAt);
  T.paintStage(sec, 3, ctx, wordAt);
  assert.equal(sec.querySelectorAll("[data-atlas-gloss]").length, 0);
  assert.equal(sec.classList.contains("atlas-stage-3"), true);
  assert.equal(sec.classList.contains("atlas-stage-1"), false);
  T.paintStage(sec, 0, ctx, wordAt);
  assert.equal(sec.className.includes("atlas-stage-"), false);
});

test("stage 1 without the in-context layer reports it instead of painting nothing silently", () => {
  const sec = sectionDom();
  const r = T.paintStage(sec, 1, ctx, () => null);
  assert.equal(r.painted, 0);
  assert.equal(r.missing, true);
});

test("the stylesheet hides the gloss of a known word even when its status arrives after painting", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/css/atlas-reader.css"), "utf8");
  for (const c of ["rm-w-known", "rm-w-l4", "rm-w-ignore"]) assert.match(css, new RegExp("atlas-stage-1 \\.rm-w\\." + c + "\\[data-atlas-gloss\\]::before"), c);
});

// ---- G1: the «Тренировать» panel ----
test("the train panel: four stages, the current one checked, a choice reported and described", () => {
  const { document, window } = parseHTML("<!doctype html><html><body><div class=\"atlas-root\"><div id=\"bar\"></div></div></body></html>");
  global.window = global.window || window;
  const UI = require("../public/js/atlas-train-ui.js");
  const chosen = [];
  const p = UI.panel(document, { T: (k, fb) => fb, stage: 1, onStage: (n) => chosen.push(n) });
  document.getElementById("bar").append(p.btn, p.panel);
  assert.ok(p.panel.hasAttribute("hidden"));
  p.btn.dispatchEvent(new window.Event("click"));
  assert.ok(!p.panel.hasAttribute("hidden"));
  assert.equal(p.btn.getAttribute("aria-expanded"), "true");
  const chips = p.panel.querySelectorAll("[data-stage]");
  assert.equal(chips.length, 4);
  assert.equal(p.panel.querySelector('[data-stage="1"]').getAttribute("aria-checked"), "true");
  const desc1 = p.panel.querySelector(".atlas-stage-desc").textContent;
  p.panel.querySelector('[data-stage="3"]').dispatchEvent(new window.Event("click"));
  assert.deepEqual(chosen, [3]);
  assert.equal(p.panel.querySelector('[data-stage="3"]').getAttribute("aria-checked"), "true");
  assert.equal(p.panel.querySelector('[data-stage="1"]').getAttribute("aria-checked"), "false");
  assert.notEqual(p.panel.querySelector(".atlas-stage-desc").textContent, desc1);
  p.note("Для этого раздела подстрочника нет.");
  assert.ok(!p.panel.querySelector(".atlas-train-note").hidden);
  p.note(null);
  assert.ok(p.panel.querySelector(".atlas-train-note").hidden);
  const esc = new window.Event("keydown"); esc.key = "Escape"; p.panel.dispatchEvent(esc);
  assert.ok(p.panel.hasAttribute("hidden"));
});

test("the next-stage hint offers one button and changes nothing by itself (owner Г2)", () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const chosen = [];
  const p = UI.panel(document, { T: (k, fb) => fb, stage: 0, onStage: (n) => chosen.push(n) });
  p.hint({ stage: 1, share: 0.85 });
  const box = p.panel.querySelector(".atlas-stage-hint");
  assert.ok(!box.hidden);
  assert.match(box.textContent, /85/);
  assert.deepEqual(chosen, []);
  box.querySelector("button").dispatchEvent(new window.Event("click"));
  assert.deepEqual(chosen, [1]);
  p.hint(null);
  assert.ok(box.hidden);
});

// ---- G2: adding terms (owner 2026-11-03) ----
test("a personal term id comes from the spelling without pointing, so adding it again finds the same term", () => {
  const a = T.personalTermId("a97002", "כוח היקפי"), b = T.personalTermId("a97002", "כֹּחַ הֶיקֵּפִי");
  assert.match(a, /^a97002:term:u-[0-9a-f]{8}$/);
  assert.equal(a, b);
  assert.notEqual(a, T.personalTermId("a97002", "כוח"));
  assert.equal(T.personalTermId("a97002", "abc"), null, "no Hebrew — no term");
});

test("a term that is already in the atlas is found instead of a duplicate", () => {
  const terms = { "a97002:term:force": { lemma_he: "כוח", niqqud: "כֹּחַ", senses: [{ sense: "force", ru: "сила" }] } };
  assert.equal(T.findTermDuplicate(terms, "כֹּחַ"), "a97002:term:force");
  assert.equal(T.findTermDuplicate(terms, "כוח היקפי"), null);
});

test("a personal term: Hebrew and a meaning are required; one sense «main»", () => {
  const t = T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", niqqud: "כֹּחַ הֶיקֵּפִי", ru: " окружная сила ", scope: "section", sid: "s09-belt", block: "a97002:p197:b003" });
  assert.equal(t.id, T.personalTermId("a97002", "כוח היקפי"));
  assert.equal(t.lemma_he, "כוח היקפי");
  assert.equal(t.niqqud, "כֹּחַ הֶיקֵּפִי");
  assert.deepEqual(t.senses, [{ sense: "main", ru: "окружная сила", context: "s09-belt" }]);
  assert.equal(t.personal, true);
  assert.equal(t.scope, "section");
  assert.equal(T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח", ru: "" }), null);
  assert.equal(T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "abc", ru: "x" }), null);
  assert.equal(T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח", ru: "сила", scope: "x" }).scope, "atlas");
});

test("merge: the atlas term wins over a personal one with the same id; section scope stays in its section", () => {
  const official = { "a97002:term:force": { lemma_he: "כוח", senses: [{ sense: "force", ru: "сила" }] } };
  const mine = [
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", ru: "окружная сила", scope: "section", sid: "s09-belt" }),
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "רצועה", ru: "ремень", scope: "atlas", sid: "s09-belt" }),
  ];
  const s09 = T.mergeTerms(official, mine, "s09-belt"), s10 = T.mergeTerms(official, mine, "s10-spur-gears");
  assert.equal(Object.keys(s09).length, 3);
  assert.equal(Object.keys(s10).length, 2, "a section-scoped term does not reach another section");
  assert.ok(s10[mine[1].id], "an atlas-wide term reaches every section");
  const promoted = Object.assign({}, official, { [mine[0].id]: { lemma_he: "כוח היקפי", senses: [{ sense: "main", ru: "окружная сила" }] } });
  const m = T.mergeTerms(promoted, mine, "s09-belt");
  assert.equal(m[mine[0].id].personal, undefined, "after the term moved into the atlas file the atlas copy is shown");
  assert.equal(Object.keys(official).length, 1, "inputs are not changed");
});

test("export → import: the personal terms travel as lines of the atlas additions file", () => {
  const mine = [
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", niqqud: "כֹּחַ הֶיקֵּפִי", ru: "окружная сила", scope: "section", sid: "s09-belt" }),
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "רצועה", niqqud: "רְצוּעָה", ru: "ремень", scope: "atlas", sid: "s09-belt" }),
  ];
  const text = T.exportAdditions(mine);
  const lines = text.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].sections, ["s09-belt"]);
  assert.deepEqual(lines[1].sections, [], "atlas-wide: every section where it occurs");
  const back = T.parseAdditions(text);
  assert.deepEqual(back.rejected, []);
  assert.deepEqual(back.terms.map((t) => [t.id, t.scope, t.senses[0].ru]), mine.map((t) => [t.id, t.scope, t.senses[0].ru]));
});

test("import rejects a line with a reason instead of taking it half-way", () => {
  const ok = T.exportAdditions([T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "רצועה", ru: "ремень", scope: "atlas" })]).trim();
  const bad = [
    "{not json",
    JSON.stringify({ id: "x:term:u-00000000", lemma_he: "רצועה", senses: [{ sense: "main", ru: "ремень" }] }),
    JSON.stringify({ id: T.personalTermId("a97002", "רצועה"), lemma_he: "רצועה", niqqud: "כֹּחַ", senses: [{ sense: "main", ru: "ремень" }] }),
    JSON.stringify({ id: T.personalTermId("a97002", "רצועה"), lemma_he: "רצועה", senses: [{ sense: "main", ru: "" }] }),
  ];
  const r = T.parseAdditions([ok].concat(bad).join("\n"));
  assert.equal(r.terms.length, 1);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["json", "id", "niqqud", "ru"]);
});

test("the place of a personal term is found in the text; a personal term never becomes a loose «terms of this paragraph»", () => {
  const RM = require("../public/js/reader-morph.js");
  const W = require("../public/js/atlas-words.js");
  const section = { id: "s09-belt", content_pack_sha256: "a".repeat(64), pages: [{ page: 197, items: [
    { id: "b1", type: "block", he: "הכוח ההיקפי פועל על הרצועה", he_niqqud: "", ru: "Окружная сила действует на ремень", terms: ["a97002:term:belt#belt"] },
    { id: "b2", type: "block", he: "גלגל מניע", ru: "Ведущий шкив" }] }],
    terms: { "a97002:term:belt": { lemma_he: "רצועה", senses: [{ sense: "belt", ru: "ремень" }] } } };
  const ctx = W.sectionContext("a97002", section, RM);
  const mine = T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", ru: "окружная сила", scope: "section", sid: "s09-belt" });
  ctx.setPersonal(T.mergeTerms({}, [mine], "s09-belt"));
  const loc = ctx.located("b1");
  assert.deepEqual(loc.he.spans.map((s) => [s.from, s.to, s.id]), [[0, 1, mine.id], [4, 4, "a97002:term:belt"]]);
  assert.deepEqual(ctx.located("b2").loose, []);
  const occ = W.occurrence(ctx, "b1", 1, "ההיקפי", "he");
  assert.deepEqual(occ.atlas_term, { id: mine.id, sense: "main" });
  const top = W.cardTop(occ, ctx, { kicker: "Термин атласа", mine: "Мой термин" });
  assert.equal(top.kicker, "Мой термин");
  assert.deepEqual(top.lines, ["окружная сила"]);
  ctx.setPersonal({});
  assert.deepEqual(ctx.located("b1").he.spans.map((s) => s.id), ["a97002:term:belt"], "removing a personal term clears its place");
});

test("the word card shows a surface's actions, with or without a term above", () => {
  const RM = require("../public/js/reader-morph.js");
  const withTerm = RM.surfaceTopHtml({ kicker: "Мой термин", title: "כוח היקפי", lines: ["окружная сила"], actions: [{ id: "edit", label: "Изменить" }] }, "ltr");
  assert.match(withTerm, /class="rm-surface-top"/);
  assert.match(withTerm, /data-rm-surface-action="edit"/);
  const onlyActions = RM.surfaceTopHtml({ title: "", actions: [{ id: "add", label: "Добавить в термины <b>" }] }, "ltr");
  assert.match(onlyActions, /data-rm-surface-action="add"/);
  assert.match(onlyActions, /&lt;b&gt;/, "labels are escaped");
  assert.equal(RM.surfaceTopHtml({ title: "" }, "ltr"), "");
  assert.equal(RM.surfaceTopHtml(null, "ltr"), "");
});

test("the add-term form: a word grows into a phrase, the meaning follows the in-context gloss, a duplicate cannot be saved", () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const words = [{ he: "הכוח", niqqud: "הַכֹּחַ" }, { he: "ההיקפי", niqqud: "הַהֶיקֵּפִי" }, { he: "פועל", niqqud: "פּוֹעֵל" }];
  const saved = [], cancelled = [];
  const f = UI.termForm(document, { T: (k, fb) => fb, words, at: 0,
    glossOf: (from, to) => (from === 0 && to === 1 ? "окружная сила" : from === 0 && to === 0 ? "сила" : ""),
    duplicateOf: (lemma) => (lemma === "פועל" ? "פּוֹעֵל — действует" : null),
    onSave: (r) => saved.push(r), onCancel: () => cancelled.push(1) });
  document.body.appendChild(f.el);
  const phrase = () => f.el.querySelector(".atlas-term-phrase").textContent;
  const ru = f.el.querySelector('input[name="ru"]'), save = f.el.querySelector("[data-term-save]");
  assert.equal(phrase(), "הַכֹּחַ");
  assert.equal(ru.value, "сила");
  f.el.querySelector('[data-extend="next"]').dispatchEvent(new window.Event("click"));
  assert.equal(phrase(), "הַכֹּחַ הַהֶיקֵּפִי");
  assert.equal(ru.value, "окружная сила", "an untouched meaning follows the phrase");
  assert.equal(f.el.querySelector('input[name="scope"][value="section"]').checked, true, "this section by default");
  save.dispatchEvent(new window.Event("click"));
  assert.deepEqual(saved, [{ from: 0, to: 1, lemmaHe: "הכוח ההיקפי", niqqud: "הַכֹּחַ הַהֶיקֵּפִי", ru: "окружная сила", scope: "section" }]);
  // the learner's own wording is kept when the phrase changes
  ru.value = "сила окружная (моё)"; ru.dispatchEvent(new window.Event("input"));
  f.el.querySelector('[data-shrink="next"]').dispatchEvent(new window.Event("click"));
  assert.equal(ru.value, "сила окружная (моё)");
  // a term the atlas already has: saving is off, the reason is shown
  const g = UI.termForm(document, { T: (k, fb) => fb, words, at: 2, glossOf: () => "действует", duplicateOf: (l) => (l === "פועל" ? "פּוֹעֵל — действует" : null), onSave: (r) => saved.push(r) });
  assert.equal(g.el.querySelector("[data-term-save]").disabled, true);
  assert.match(g.el.querySelector(".atlas-term-dup").textContent, /действует/);
  // an empty meaning cannot be saved; Cancel closes
  ru.value = " "; ru.dispatchEvent(new window.Event("input"));
  assert.equal(save.disabled, true);
  f.el.querySelector("[data-term-cancel]").dispatchEvent(new window.Event("click"));
  assert.deepEqual(cancelled, [1]);
});

// ---- G2: the atlas additions file (for everyone, after a rebuild) ----
function addSections() {
  return [
    { id: "s09-belt", content_pack_sha256: "a".repeat(64), pages: [{ page: 197, items: [
      { id: "b1", type: "block", he: "הכוח ההיקפי פועל על הרצועה", ru: "Окружная сила действует на ремень", terms: ["a97002:term:belt#belt"] },
      { id: "b2", type: "block", he: "חישוב הכוח ההיקפי", ru: "Расчёт окружной силы" }] }],
      terms: { "a97002:term:belt": { lemma_he: "רצועה", senses: [{ sense: "belt", ru: "ремень" }] } } },
    { id: "s10-spur-gears", content_pack_sha256: "b".repeat(64), pages: [{ page: 240, items: [
      { id: "c1", type: "block", he: "הכוח ההיקפי על השן", ru: "Окружная сила на зубе" }] }], terms: {} },
  ];
}
const ADD = require("../scripts/atlas/apply-term-additions.cjs");

test("an additions line becomes an atlas term with the places of its sections", () => {
  const line = { id: "a97002:term:u-0000abcd", lemma_he: "כוח היקפי", niqqud: "כֹּחַ הֶיקֵּפִי", senses: [{ sense: "main", ru: "окружная сила" }], sections: ["s09-belt"] };
  const r = ADD.applyAdditions(addSections(), [JSON.stringify(line)]);
  assert.deepEqual(r.rejected, []);
  const s09 = r.sections[0], s10 = r.sections[1];
  assert.equal(s09.terms[line.id].lemma_he, "כוח היקפי");
  assert.equal(s09.terms[line.id].source, "additions");
  assert.deepEqual(s09.pages[0].items[0].terms, ["a97002:term:belt#belt", line.id + "#main"]);
  assert.deepEqual(s09.pages[0].items[1].terms, [line.id + "#main"]);
  assert.equal(s10.terms[line.id], undefined, "a section-scoped addition stays in its section");
  assert.deepEqual(r.report, [{ id: line.id, places: 2, sections: ["s09-belt"] }]);
  // the same file again changes nothing
  const again = ADD.applyAdditions(r.sections, [JSON.stringify(line)]);
  assert.equal(JSON.stringify(again.sections), JSON.stringify(r.sections));
});

test("sections: [] puts the term into every section where it occurs", () => {
  const line = { id: "a97002:term:tangential-force", lemma_he: "כוח היקפי", senses: [{ sense: "tf", ru: "окружная сила" }], sections: [] };
  const r = ADD.applyAdditions(addSections(), [JSON.stringify(line)]);
  assert.ok(r.sections[0].terms[line.id] && r.sections[1].terms[line.id]);
  assert.deepEqual(r.report[0].sections, ["s09-belt", "s10-spur-gears"]);
});

test("an additions line that does not hold is rejected with its reason", () => {
  const sense = [{ sense: "main", ru: "x" }];
  const lines = [
    "{bad",
    JSON.stringify({ id: "a97002:term:belt", lemma_he: "רצועה", senses: sense, sections: [] }),            // the atlas has this id
    JSON.stringify({ id: "a97002:term:u-00000001", lemma_he: "רצועה", senses: sense, sections: [] }),      // the atlas has this term
    JSON.stringify({ id: "a97002:term:u-00000002", lemma_he: "גלגל שיניים", senses: sense, sections: [] }), // no place anywhere
    JSON.stringify({ id: "a97002:term:u-00000003", lemma_he: "כוח", niqqud: "רְצוּעָה", senses: sense, sections: [] }),
    JSON.stringify({ id: "a97002:term:u-00000004", lemma_he: "כוח", senses: [{ sense: "main", ru: "" }], sections: [] }),
    JSON.stringify({ id: "Bad Id", lemma_he: "כוח", senses: sense, sections: [] }),
  ];
  const r = ADD.applyAdditions(addSections(), lines);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["json", "id-taken", "duplicate", "no-place", "niqqud", "ru", "id"]);
  assert.equal(JSON.stringify(r.sections), JSON.stringify(addSections()), "a rejected line changes nothing");
});

test("a new sense of an atlas term: add_senses", () => {
  const line = { id: "a97002:term:belt", add_senses: [{ sense: "strap", ru: "лента" }], sections: ["s09-belt"] };
  const r = ADD.applyAdditions(addSections(), [JSON.stringify(line)]);
  assert.deepEqual(r.rejected, []);
  assert.deepEqual(r.sections[0].terms["a97002:term:belt"].senses.map((s) => s.sense), ["belt", "strap"]);
  const clash = ADD.applyAdditions(addSections(), [JSON.stringify({ id: "a97002:term:belt", add_senses: [{ sense: "belt", ru: "пояс" }], sections: [] })]);
  assert.deepEqual(clash.rejected.map((x) => x.reason), ["sense-taken"], "one meaning — one translation");
});

// ---- G3: section terms in SRS ----
test("a term key: at1:<atlas>:<slug>#<sense>; words and forms are not terms", () => {
  assert.equal(T.termKey("a97002", "a97002:term:force", "force"), "at1:a97002:force#force");
  assert.equal(T.termKey("a97002", "a97002:term:u-1a2b3c4d", "main"), "at1:a97002:u-1a2b3c4d#main");
  assert.deepEqual(T.parseTermKey("at1:a97002:force#force"), { atlasId: "a97002", termId: "a97002:term:force", sense: "force" });
  for (const bad of ["", "at1:a97002:force", "at1:a97002:force#", "at1:a97002:Fo rce#x", "at1:a97002:force#a b", "pid:1612", "ft1:1612:PERF-2ms:sh", "at2:a97002:force#force"])
    assert.equal(T.parseTermKey(bad), null, bad);
  assert.equal(T.isTermKey("at1:a97002:force#force"), true);
  assert.equal(T.isTermKey("pid:1612"), false);
  assert.equal(T.termKey("a97002", "other:term:force", "force"), null, "a term of another atlas");
});

test("the keys of a section: every sense with a place or a block link, plus my terms here; in order of first place", () => {
  const RM = require("../public/js/reader-morph.js");
  const W = require("../public/js/atlas-words.js");
  const section = { id: "s09-belt", content_pack_sha256: "a".repeat(64), pages: [{ page: 197, items: [
    { id: "b1", type: "block", he: "הכוח ההיקפי פועל על הרצועה", ru: "x", terms: ["a97002:term:belt#belt", "a97002:term:pulley#pulley"] },
    { id: "b2", type: "block", he: "גלגל מניע", ru: "y" }] }],
    terms: { "a97002:term:belt": { lemma_he: "רצועה", senses: [{ sense: "belt", ru: "ремень" }] },
      "a97002:term:pulley": { lemma_he: "גלגל", senses: [{ sense: "pulley", ru: "шкив" }] },
      "a97002:term:unused": { lemma_he: "בורג", senses: [{ sense: "bolt", ru: "болт" }] } } };
  const ctx = W.sectionContext("a97002", section, RM);
  const mine = T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", ru: "окружная сила", scope: "section", sid: "s09-belt" });
  ctx.setPersonal(T.mergeTerms(section.terms, [mine], "s09-belt"));
  const items = T.sectionTermItems(ctx);
  assert.deepEqual(items.map((x) => x.key), [T.termKey("a97002", mine.id, "main"), "at1:a97002:belt#belt", "at1:a97002:pulley#pulley"]);
  const first = items[0];
  assert.equal(first.ru, "окружная сила");
  assert.equal(first.block, "b1");
  assert.deepEqual([first.from, first.to], [0, 1]);
  assert.equal(first.personal, true);
  assert.equal(items[2].block, "b1", "a loose link keeps the paragraph it links, without a word position");
  assert.equal(items[2].from, null);
});

test("term stats: strong = stability ≥ 7 days or marked almost known/known; due counted at now", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const keys = ["at1:a:a#x", "at1:a:b#x", "at1:a:c#x", "at1:a:d#x", "at1:a:e#x"];
  const states = { "at1:a:a#x": { stability: 9, due: now + 86400e3 }, "at1:a:b#x": { stability: 2, due: now - 1 },
    "at1:a:c#x": { status: "l4" }, "at1:a:d#x": { stability: 7, due: now } };
  assert.deepEqual(T.termStats(keys, states, now), { termsTotal: 5, termsStrong: 3, due: 2, fresh: 2 });
  assert.deepEqual(T.termStats([], {}, now), { termsTotal: 0, termsStrong: 0, due: 0, fresh: 0 });
});

test("a study session: due terms first (oldest first), then never-seen ones, then nothing else", () => {
  const now = 1000;
  const items = ["a", "b", "c", "d", "e"].map((k) => ({ key: "at1:a:" + k + "#x" }));
  const states = { "at1:a:a#x": { due: now + 5 }, "at1:a:b#x": { due: 10 }, "at1:a:c#x": { due: 5 } };
  assert.deepEqual(T.sessionOrder(items, states, now, 10).map((x) => x.key.slice(6, 7)), ["c", "b", "d", "e"]);
  assert.deepEqual(T.sessionOrder(items, states, now, 3).map((x) => x.key.slice(6, 7)), ["c", "b", "d"]);
  assert.deepEqual(T.sessionOrder(items, states, now, 10, { dueOnly: true }).map((x) => x.key.slice(6, 7)), ["c", "b"]);
});

test("«Мой словарь» does not list atlas terms: they are the atlas's own targets, not words", () => {
  const D = require("../public/js/dictionary-core.js");
  const map = D.mergeSources({ statuses: { "pid:1612": "l4", "at1:a97002:belt#belt": "l1" },
    logAgg: [{ key: "at1:a97002:belt#belt", n: 3, first: 1, last: 2, fails: 1, surface: "" }] });
  const keys = Array.from(map.keys ? map.keys() : Object.keys(map));
  assert.ok(keys.includes("pid:1612"));
  assert.ok(!keys.some((k) => String(k).startsWith("at1:")));
});

test("a term session: the term and its sentence first, the meaning on request; a miss comes back once at the end", async () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const items = [
    { key: "at1:a97002:belt#belt", title: "רְצוּעָה", plain: "רצועה", translit: "retsua", ru: "ремень", sentence: "הכוח פועל על הרצועה", from: 3, to: 3, page: 197 },
    { key: "at1:a97002:pulley#pulley", title: "גַּלְגַּל", plain: "גלגל", translit: "galgal", ru: "шкив", sentence: "", from: null, to: null, page: 198 },
  ];
  const graded = [], opened = [];
  let closed = 0;
  const s = UI.termSession(document, { T: (k, fb) => fb, items, plainHebrew: false,
    onGrade: (key, ok) => { graded.push([key, ok]); return Promise.resolve(true); },
    onOpenPage: (it) => opened.push(it.page), onClose: () => closed++ });
  document.body.appendChild(s.el);
  const q = (sel) => s.el.querySelector(sel);
  const click = async (sel) => { q(sel).dispatchEvent(new window.Event("click")); await new Promise((r) => setTimeout(r, 0)); };
  assert.equal(q(".atlas-ts-term").textContent, "רְצוּעָה");
  assert.match(q(".atlas-ts-sentence").innerHTML, /<mark>הרצועה<\/mark>/, "the term is marked in the book's sentence");
  assert.equal(q(".atlas-ts-answer").hidden, true, "the meaning waits for the learner");
  assert.equal(q("[data-ts-grade]"), null, "no grading before the meaning is shown");
  await click("[data-ts-reveal]");
  assert.equal(q(".atlas-ts-answer").hidden, false);
  assert.match(q(".atlas-ts-answer").textContent, /ремень/);
  await click('[data-ts-grade="0"]');                 // «Не помню»
  assert.equal(q(".atlas-ts-term").textContent, "גַּלְגַּל");
  await click("[data-ts-open]");
  assert.deepEqual(opened, [198]);
  await click("[data-ts-reveal]");
  await click('[data-ts-grade="1"]');                 // «Помню»
  assert.equal(q(".atlas-ts-term").textContent, "רְצוּעָה", "the missed term comes back once");
  await click("[data-ts-reveal]");
  await click('[data-ts-grade="1"]');
  assert.deepEqual(graded, [["at1:a97002:belt#belt", false], ["at1:a97002:pulley#pulley", true], ["at1:a97002:belt#belt", true]]);
  assert.match(q(".atlas-ts-done").textContent, /1\D+2/, "the summary: remembered 1 of 2 on the first try");
  await click("[data-ts-close]");
  assert.equal(closed, 1);
});

test("a term session in the book's form: plain Hebrew without pointing at stage 3", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const s = UI.termSession(document, { T: (k, fb) => fb, plainHebrew: true, onGrade: () => Promise.resolve(true),
    items: [{ key: "at1:a97002:belt#belt", title: "רְצוּעָה", plain: "רצועה", ru: "ремень", sentence: "", from: null, to: null }] });
  assert.equal(s.el.querySelector(".atlas-ts-term").textContent, "רצועה");
});

test("a grade that could not be saved is said, and the term is not counted", async () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const s = UI.termSession(document, { T: (k, fb) => fb, onGrade: () => Promise.resolve(false),
    items: [{ key: "at1:a97002:belt#belt", title: "רְצוּעָה", plain: "רצועה", ru: "ремень", sentence: "", from: null, to: null }] });
  s.el.querySelector("[data-ts-reveal]").dispatchEvent(new window.Event("click"));
  s.el.querySelector('[data-ts-grade="1"]').dispatchEvent(new window.Event("click"));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!s.el.querySelector(".atlas-ts-error").hidden);
  assert.ok(s.el.querySelector('[data-ts-grade="1"]'), "the same term stays to grade again");
});

// ---- G4: «Найди в книге» ----
const BANK = require("../scripts/atlas/build-train-bank.cjs");
function bankSections() {
  const w = (n, x) => Array.from({ length: n }, (_, i) => x + i).join(" ");
  return [
    { id: "s00-front", content_pack_sha256: "0", pages: [{ page: 1, items: [{ id: "a97002:p1:b001", type: "block", kind: "prose", he: "מילה " + w(8, "א") }] }] },
    { id: "s09-belt", content_pack_sha256: "9", pages: [
      { page: 197, items: [
        { id: "a97002:p197:b001", type: "block", kind: "prose", he: "הממסרת מעבירה תנועה סיבובית בין שני גלגלים בעזרת רצועה", he_niqqud: "x", terms: ["a97002:term:belt#belt"] },
        { id: "a97002:p197:b002", type: "block", kind: "heading", he: "תמסורת רצועה ומה שקורה בה כאשר היא עובדת" },
        { id: "a97002:p197:b003", type: "block", kind: "list_item", he: "• קצר מדי" },
        { id: "a97002:p197:f01", type: "formula", latex: "i=n_2/n_1" },
        { id: "a97002:p197:b004", type: "block", kind: "caption", he: "איור 77 - תמסורת רצועה בין שני גלגלים עם מתיחות קבועה" }] },
      { page: 198, items: [
        { id: "a97002:p198:b001", type: "block", kind: "prose", he: "יתרונות: פשטות הבנייה ועלות נמוכה של הרכיבים במערכת" },
        { id: "a97002:p198:b002", type: "block", kind: "prose", he: "הממסרת מעבירה תנועה סיבובית בין שני גלגלים בעזרת רצועה" }] }] },
  ];
}

test("the find bank: book fragments of 5–35 words from prose, lists and captions, never a verbatim repeat, never the title pages", () => {
  const b = BANK.buildFindBank(bankSections(), { "s00-front": "f0", "s09-belt": "f9" }, "a97002");
  assert.equal(b.schema, "linguistpro.atlas-train-find.1.0.0");
  assert.deepEqual(b.built_from.sections, { "s00-front": "f0", "s09-belt": "f9" });
  assert.deepEqual(b.items.map((x) => x.block), ["a97002:p197:b004", "a97002:p198:b001"],
    "the repeated sentence (p197 b001 = p198 b002), the heading, the short list item and the title pages are out");
  const cap = b.items[0];
  assert.deepEqual([cap.sid, cap.page, cap.kind], ["s09-belt", 197, "book"]);
  assert.deepEqual(cap.formulas, ["a97002:p197:f01"]);
  assert.equal(cap.id, "find:a97002:p197:b004");
  assert.equal(JSON.stringify(BANK.buildFindBank(bankSections(), { "s00-front": "f0", "s09-belt": "f9" }, "a97002")), JSON.stringify(b), "the same data — the same bank");
});

test("checking an answer: the section first, then the page (exact, ±1 near, else wrong)", () => {
  const it = { id: "find:x", sid: "s09-belt", page: 197 };
  assert.deepEqual(T.checkFind(it, { sid: "s09-belt", page: 197 }), { section: true, page: "exact" });
  assert.deepEqual(T.checkFind(it, { sid: "s09-belt", page: 198 }), { section: true, page: "near" });
  assert.deepEqual(T.checkFind(it, { sid: "s09-belt", page: 201 }), { section: true, page: "wrong" });
  assert.deepEqual(T.checkFind(it, { sid: "s10-spur-gears", page: 197 }), { section: false, page: "wrong" }, "the right page of a wrong section is not a hit");
  assert.deepEqual(T.checkFind(it, { sid: "s09-belt", page: null }), { section: true, page: "wrong" });
});

test("picking a fragment: this section only when asked, unseen first, stale ones never", () => {
  const bank = { items: [{ id: "a", sid: "s1" }, { id: "b", sid: "s1" }, { id: "c", sid: "s2" }] };
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  assert.equal(T.pickFind(bank, { sid: "s2", rnd: seq([0.9]) }).id, "c");
  assert.equal(T.pickFind(bank, { seen: new Set(["a"]), stale: new Set(["c"]), rnd: seq([0.99]) }).id, "b");
  assert.equal(T.pickFind(bank, { sid: "s1", seen: new Set(["a", "b"]), rnd: seq([0]) }).id, "a", "all seen: start again");
  assert.equal(T.pickFind(bank, { sid: "s3" }), null);
});

test("find stats over the device's history", () => {
  const h = [{ section: true, page: "exact", ms: 20000 }, { section: true, page: "near", ms: 40000 }, { section: false, page: "wrong", ms: 90000 }];
  assert.deepEqual(T.findStats(h), { attempts: 3, sectionRate: 2 / 3, pageRate: 1 / 3, nearRate: 1 / 3, medianMs: 40000 });
  assert.deepEqual(T.findStats([]), { attempts: 0, sectionRate: 0, pageRate: 0, nearRate: 0, medianMs: 0 });
});

test("the find session: a fragment, a section and a page, the answer with the time and the way to the page", async () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const items = [{ id: "find:a", sid: "s09-belt", page: 197, he: "תמסורת רצועה בין שני גלגלים" }, { id: "find:b", sid: "s10-spur-gears", page: 240, he: "גלגלי שיניים ישרים" }];
  let i = 0, t = 1000;
  const answered = [], opened = [];
  let closed = 0;
  const s = UI.findSession(document, { T: (k, fb) => fb, now: () => t,
    sections: [{ id: "s09-belt", he: "תמסורת רצועה", ru: "Ременная передача", first: 195, last: 234 }, { id: "s10-spur-gears", he: "גלגלי שיניים", ru: "Прямозубые колёса", first: 235, last: 270 }],
    next: () => items[i++] || null, check: (it, a) => T.checkFind(it, a),
    onAnswer: (it, r, ms) => answered.push([it.id, r.section, r.page, ms]), onOpen: (it) => opened.push(it.page), onClose: () => closed++ });
  document.body.appendChild(s.el);
  const q = (sel) => s.el.querySelector(sel);
  const fire = (el, type) => el.dispatchEvent(new window.Event(type));
  assert.equal(q(".atlas-find-text").textContent, "תמסורת רצועה בין שני גלגלים");
  assert.equal(q(".atlas-find-text").getAttribute("dir"), "rtl");
  assert.equal(q("[data-find-check]").disabled, true, "a section is needed first");
  const sel = q('select[name="sid"]');
  assert.equal(sel.querySelectorAll("option[value]:not([value=''])").length, 2);
  sel.querySelector('option[value="s09-belt"]').setAttribute("selected", ""); fire(sel, "change");   // linkedom: no value setter
  assert.equal(sel.value, "s09-belt");
  assert.equal(q('input[name="page"]').getAttribute("min"), "195");
  assert.equal(q('input[name="page"]').getAttribute("max"), "234");
  q('input[name="page"]').value = "198"; fire(q('input[name="page"]'), "input");
  t = 26000;
  fire(q("[data-find-check]"), "click");
  assert.deepEqual(answered, [["find:a", true, "near", 25000]]);
  assert.match(q(".atlas-find-result").textContent, /197/);
  assert.match(q(".atlas-find-result").textContent, /0:25/);
  fire(q("[data-find-open]"), "click");
  assert.deepEqual(opened, [197]);
  fire(q("[data-find-next]"), "click");
  assert.equal(q(".atlas-find-text").textContent, "גלגלי שיניים ישרים");
  assert.equal(q('select[name="sid"]').value || "", "", "a new question starts empty");
  fire(q("[data-find-next]") || q("[data-find-skip]"), "click");      // skip: no answer is recorded
  assert.equal(answered.length, 1);
  assert.ok(q(".atlas-find-empty"), "the bank is over: said so");
  fire(q("[data-find-close]"), "click");
  assert.equal(closed, 1);
});

// ---- G5: «Что это за символ?» ----
function symSection() {
  const v = (latex, ru, he, unit) => ({ latex, ru, he, unit, mathml: "<math><mi>" + latex + "</mi></math>" });
  return { id: "s09-belt", pages: [
    { page: 196, items: [{ id: "f1", type: "formula", latex: "H=M n", mathml: "<math>H</math>",
      vars: [v("H", "Мощность", "הספק", "kW"), v("M_t", "Крутящий момент", "מומנט", "N·mm"), v("n", "Частота вращения", "מהירות סיבוב", "rpm")] },
      { id: "f2", type: "formula", latex: "i=n_2/n_1", mathml: "<math>i</math>",
        vars: [v("i", "Передаточное отношение", "יחס תמסורת", ""), v("n_1", "Частота вращения", "מהירות סיבוב", "rpm"), v("n_2", "Частота вращения", "מהירות סיבוב", "rpm")] }] },
    { page: 197, items: [{ id: "f3", type: "formula", latex: "d", mathml: "<math>d</math>", vars: [v("d", "Диаметр", "קוטר", "mm")] },
      { id: "f4", type: "formula", latex: "v=πdn", mathml: "<math>v</math>",
        vars: [v("v", "Скорость ремня", "מהירות רצועה", "m/s"), v("d", "Диаметр", "קוטר", "mm"), { latex: "x", he: "", ru: "", unit: "" }] }] }] };
}
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test("symbol questions: formulas with at least two symbols that have a meaning; one question per such symbol", () => {
  const qs = T.symbolQuestions(symSection(), { rnd: seq([0.1, 0.5, 0.9]), lang: "ru" });
  assert.deepEqual(qs.map((q) => q.formulaId), ["f1", "f2", "f4"], "f3 has one symbol; f4 keeps its two symbols with a meaning");
  assert.deepEqual(qs[0].symbols.map((s) => s.latex), ["H", "M_t", "n"]);
  assert.equal(qs[2].symbols.length, 2);
  assert.equal(qs[0].page, 196);
});

test("the four meanings: the right one and three others of the same section, never two equal ones", () => {
  const qs = T.symbolQuestions(symSection(), { rnd: seq([0.3, 0.7, 0.1, 0.9]), lang: "ru" });
  for (const q of qs) for (const s of q.symbols) {
    const m = s.options.meaning;
    assert.equal(m.length, 4, s.latex);
    assert.ok(m.includes(s.answer.text), s.latex + ": the right meaning is offered");
    assert.equal(new Set(m).size, 4, s.latex + ": no two equal options");
  }
});

test("units: asked when the symbol has one and the section has three other units; otherwise only the meaning", () => {
  const qs = T.symbolQuestions(symSection(), { rnd: seq([0.2, 0.6]), lang: "ru" });
  const h = qs[0].symbols[0];
  assert.equal(h.options.unit.length, 4);
  assert.ok(h.options.unit.includes("kW"));
  assert.equal(new Set(h.options.unit).size, 4);
  const i = qs[1].symbols[0];
  assert.equal(i.options.unit, null, "a symbol without a unit is asked its meaning only");
});

test("the options speak the stage's language: Hebrew on stages 2–3 (owner Г5)", () => {
  const he = T.symbolQuestions(symSection(), { rnd: seq([0.5]), lang: "he" });
  const s = he[0].symbols[0];
  assert.equal(s.answer.text, "הספק");
  assert.ok(s.options.meaning.every((x) => /[א-ת]/.test(x)));
});

test("checking: two symbols with the same meaning in one formula — that meaning is right for both", () => {
  const q = T.symbolQuestions(symSection(), { rnd: seq([0.4]), lang: "ru" })[1];
  const [i, n1, n2] = q.symbols;
  assert.deepEqual(T.checkSymbol(n1, { meaning: "Частота вращения", unit: "rpm" }), { meaning: true, unit: true });
  assert.deepEqual(T.checkSymbol(n2, { meaning: "Частота вращения", unit: "kW" }), { meaning: true, unit: false });
  assert.deepEqual(T.checkSymbol(i, { meaning: "Частота вращения" }), { meaning: false, unit: null });
});

test("a section without suitable formulas gives no questions", () => {
  assert.deepEqual(T.symbolQuestions({ id: "s", pages: [{ page: 1, items: [{ id: "b", type: "block", he: "x" }] }] }, { lang: "ru" }), []);
});

test("the symbol session: a formula, one symbol at a time, the meaning and the unit, then the whole table and the page", () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const qs = T.symbolQuestions(symSection(), { rnd: seq([0.5]), lang: "ru" }).slice(0, 1);
  const answers = [], opened = [];
  let closed = 0;
  const s = UI.symbolSession(document, { T: (k, fb) => fb, questions: qs, check: T.checkSymbol,
    onAnswer: (q, sym, r) => answers.push([sym.latex, r.meaning, r.unit]), onOpen: (q) => opened.push(q.page), onClose: () => closed++ });
  document.body.appendChild(s.el);
  const q = (sel) => s.el.querySelector(sel);
  const fire = (el) => el.dispatchEvent(new window.Event("click"));
  assert.match(q(".atlas-sym-formula").innerHTML, /<math>/);
  assert.match(q(".atlas-sym-symbol").innerHTML, /<mi>H<\/mi>/);
  assert.equal(q("[data-sym-check]").disabled, true);
  const pickMeaning = (text) => fire(Array.from(s.el.querySelectorAll("[data-sym-meaning]")).find((b) => b.getAttribute("data-sym-meaning") === text));
  const pickUnit = (u) => fire(Array.from(s.el.querySelectorAll("[data-sym-unit]")).find((b) => b.getAttribute("data-sym-unit") === u));
  pickMeaning("Мощность");
  assert.equal(q("[data-sym-check]").disabled, true, "the unit is asked too");
  pickUnit("rpm");
  fire(q("[data-sym-check]"));
  assert.deepEqual(answers[0], ["H", true, false]);
  assert.match(q(".atlas-sym-feedback").textContent, /kW/, "a wrong unit shows the right one");
  fire(q("[data-sym-next]"));
  assert.match(q(".atlas-sym-symbol").innerHTML, /M_t/);
  pickMeaning("Крутящий момент"); pickUnit("N·mm"); fire(q("[data-sym-check]"));
  fire(q("[data-sym-next]"));
  pickMeaning("Частота вращения"); pickUnit("rpm"); fire(q("[data-sym-check]"));
  fire(q("[data-sym-next]"));
  assert.equal(s.el.querySelectorAll(".atlas-sym-table tr").length, 3, "after the last symbol: the whole table");
  fire(q("[data-sym-open]"));
  assert.deepEqual(opened, [196]);
  fire(q("[data-sym-next]"));
  assert.match(q(".atlas-ts-done").textContent, /2\D+3/, "the summary: 2 of 3 fully right");
  fire(q("[data-sym-close]"));
  assert.equal(closed, 1);
});

test("Hebrew options never mix in Russian: a symbol without a Hebrew description is not asked in Hebrew", () => {
  const sec = symSection();
  sec.pages[0].items[0].vars[0].he = "";                     // H has no Hebrew description
  const qs = T.symbolQuestions(sec, { rnd: seq([0.5]), lang: "he" });
  const all = qs.flatMap((q) => q.symbols);
  assert.ok(!all.some((s) => s.latex === "H"), "H is not asked in Hebrew");
  assert.ok(all.every((s) => s.options.meaning.every((x) => /[א-ת]/.test(x))), "every option is Hebrew");
  const ru = T.symbolQuestions(sec, { rnd: seq([0.5]), lang: "ru" });
  assert.ok(ru.flatMap((q) => q.symbols).some((s) => s.latex === "H"), "it is still asked in Russian");
});

test("the same symbol described otherwise elsewhere in the section is never a wrong option", () => {
  const v = (latex, ru, unit) => ({ latex, ru, he: "", unit });
  // H has exactly three other meanings in the section, one of them is H itself described as «Выходная мощность»:
  // without the rule it is always offered; with it H has too few honest options and is not asked
  const sec = { id: "s", pages: [{ page: 1, items: [
    { id: "f1", type: "formula", latex: "H=Mn", vars: [v("H", "Мощность", "kW"), v("M_t", "Крутящий момент", "N·mm"), v("n", "Частота вращения", "rpm")] },
    { id: "f5", type: "formula", latex: "H=Fv", vars: [v("H", "Выходная мощность", "kW"), v("M_t", "Крутящий момент", "N·mm")] }] }] };
  const all = T.symbolQuestions(sec, { rnd: seq([0.5]), lang: "ru" }).flatMap((q) => q.symbols);
  for (const s of all.filter((x) => x.latex === "H")) assert.ok(!s.options.meaning.some((m) => /мощность/i.test(m)), s.answer.text + ": " + s.options.meaning);
});

test("the symbol session can say why its options are not in the stage's language", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const qs = T.symbolQuestions(symSection(), { rnd: seq([0.5]), lang: "ru" }).slice(0, 1);
  const s = UI.symbolSession(document, { T: (k, fb) => fb, questions: qs, check: T.checkSymbol, note: "Описаний на иврите нет — варианты на русском." });
  assert.equal(s.el.querySelector(".atlas-train-note").textContent, "Описаний на иврите нет — варианты на русском.");
  const t = UI.symbolSession(document, { T: (k, fb) => fb, questions: qs, check: T.checkSymbol });
  assert.equal(t.el.querySelector(".atlas-train-note"), null);
});
