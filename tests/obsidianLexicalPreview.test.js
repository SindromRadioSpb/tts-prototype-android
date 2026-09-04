"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Preview = require("../public/js/obsidian-lexical-preview.js");

function fixture() {
  return {
    library: {
      texts: [{
        text_id: "T1", text_key: "text-kfar", title: "Кфар Аза - 2", updated_at: "2026-09-04T00:00:00Z",
        rows: [
          { row_id: "R1", order_index: 0, hebrew_plain: "שרפו את הבתים", hebrew_niqqud: "שָׂרְפוּ אֶת הַבָּתִּים", russian: "Сожгли дома" },
          { row_id: "R2", order_index: 1, hebrew_plain: "הבתים של נטע", hebrew_niqqud: "הַבָּתִּים שֶׁל נֶטַע", russian: "Дома Неты" }
        ]
      }]
    },
    notes_advanced: {
      notes: [
        { id: "N1", note_type: "word_study", gen_dedup_key: "ff:שרפו#verb", source: "autogen", confidence: 0.92,
          body_json: JSON.stringify({ word: "שרפו", niqqud_variant: "שָׂרְפוּ", lemma: "לשרוף", pos: "verb", root: "שרף", binyan: "paal", meaning: "жечь", pealim_id: "2321" }) },
        { id: "N2", note_type: "word_study", gen_dedup_key: "ff:הבתים#noun", source: "autogen", confidence: 0.85,
          body_json: JSON.stringify({ word: "הבתים", niqqud_variant: "הַבָּתִּים", lemma: "בית", pos: "noun", root: "בית", meaning: "дом", pealim_id: "18" }) },
        { id: "N3", note_type: "word_study", gen_dedup_key: "ff:נטע#noun", source: "autogen", confidence: 0.85,
          body_json: JSON.stringify({ word: "נטע", niqqud_variant: "נֶטַע", lemma: "נטע", pos: "noun", root: "נטע", meaning: "растение", pealim_id: "7361" }) }
      ],
      occurrences: [
        { note_id: "N1", text_id: "T1", sentence_id: "R1", word_offset: 0, surface: "שרפו" },
        { note_id: "N2", text_id: "T1", sentence_id: "R1", word_offset: 2, surface: "הבתים" },
        { note_id: "N2", text_id: "T1", sentence_id: "R2", word_offset: 0, surface: "הבתים" },
        { note_id: "N3", text_id: "T1", sentence_id: "R2", word_offset: 2, surface: "נטע" }
      ],
      sentence_morph: [
        { text_id: "T1", sentence_id: "R1", model_version: "dicta-v1", tokens: [
          { word: "שרפו", niqqud: "שָׂרְפוּ", lemma: "לשרוף", posDicta: "verb", binyan: "paal" },
          { word: "את", niqqud: "אֶת", stem: "את", posDicta: "preposition" },
          { word: "הבתים", niqqud: "הַבָּתִּים", lemma: "בית", posDicta: "noun" }
        ] },
        { text_id: "T1", sentence_id: "R2", model_version: "dicta-v1", tokens: [
          { word: "הבתים", niqqud: "הַבָּתִּים", lemma: "בית", posDicta: "noun" },
          { word: "של", niqqud: "שֶׁל", stem: "של", posDicta: "preposition" },
          { word: "נטע", niqqud: "נֶטַע", lemma: "נטע", posDicta: "noun", kind: "propernoun", ambiguous: true,
            alts: [{ lemma: "נֶטַע", pos: "noun" }] }
        ] }
      ],
      review_log: [{ id: "must-remain-untouched" }],
      srs_cards: [{ id: "must-remain-untouched" }]
    }
  };
}

test("normalizes the complete approved POS vocabulary", () => {
  assert.equal(Preview.normalizePos("PROPN"), "propernoun");
  assert.equal(Preview.normalizePos("noun", "propernoun"), "propernoun");
  assert.equal(Preview.normalizePos("ADP"), "preposition");
  assert.equal(Preview.normalizePos("DET"), "particle");
  assert.equal(Preview.normalizePos(""), "unknown");
  assert.equal(Preview.normalizePos("provider-new-tag"), "other");
});

test("builds a per-text reference index and collapses repeated occurrences", () => {
  const report = Preview.analyzeBundle(fixture(), { textId: "T1" });
  assert.equal(report.read_only, true);
  assert.equal(report.text.rows_total, 2);
  assert.equal(report.text.rows_with_morph, 2);
  assert.equal(report.counts.analyzed_occurrences, 6);
  assert.equal(report.counts.unique_lexemes, 5);
  assert.equal(report.counts.duplicate_occurrences_collapsed, 1);
  assert.equal(report.counts.ambiguity_signal_occurrences, 1);
  assert.equal(report.lexemes_by_pos.verb, 1);
  assert.equal(report.lexemes_by_pos.noun, 1);
  assert.equal(report.lexemes_by_pos.preposition, 2);
  assert.equal(report.lexemes_by_pos.propernoun, 1);
  assert.equal(report.lexemes_by_pos.unknown, 0);

  const houses = report.lexemes.find((x) => x.lp_lexeme_id === "pid:18");
  assert.ok(houses);
  assert.equal(houses.occurrence_count, 2);
  assert.deepEqual(houses.occurrences.map((x) => x.row_id), ["R1", "R2"]);
});

test("keeps ambiguity visible and does not turn the reference index into learning state", () => {
  const report = Preview.analyzeBundle(fixture(), { title: "Кфар Аза" });
  assert.equal(report.counts.ambiguous_occurrences, 1);
  const name = report.lexemes.find((x) => x.lp_pos === "propernoun");
  assert.ok(name && name.ambiguity);
  assert.equal(name.lp_lexeme_id, "name:נטע");
  assert.equal(name.pealim_id, "");
  assert.equal(name.meaning_ru, "");
  assert.equal(name.candidate_evidence[0].meaning, "растение");
  assert.deepEqual(name.identity_guard_reasons, ["propernoun-vs-dictionary-sense"]);
  assert.equal(report.counts.context_identity_guarded_occurrences, 1);
  assert.equal(Object.hasOwn(report, "learning_state"), false);
  assert.equal(Object.hasOwn(report, "review_log"), false);
});

test("can recompute an observable ambiguity signal with the shared resolver", () => {
  const report = Preview.analyzeBundle(fixture(), {
    textId: "T1",
    ambiguityResolver: (unit) => unit.sampleWord === "את" ? { ambiguous: true, alts: [{ pealim_id: "A" }, { pealim_id: "B" }] } : null
  });
  assert.equal(report.counts.ambiguity_signal_occurrences, 6);
  assert.equal(report.counts.ambiguity_signal_coverage_pct, 100);
  assert.equal(report.counts.ambiguous_occurrences, 2);
});

test("is deterministic and never mutates bundle, review_log, or SRS arrays", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const first = Preview.analyzeBundle(input, { textId: "T1" });
  const second = Preview.analyzeBundle(input, { textId: "T1" });
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input.notes_advanced.review_log, [{ id: "must-remain-untouched" }]);
  assert.deepEqual(input.notes_advanced.srs_cards, [{ id: "must-remain-untouched" }]);
});

test("plans a deterministic Obsidian package entirely in memory", () => {
  const report = Preview.analyzeBundle(fixture(), { textId: "T1" });
  const first = Preview.planObsidianPackage(report);
  const second = Preview.planObsidianPackage(report);
  assert.deepEqual(second, first);
  assert.equal(first.read_only, true);
  assert.equal(first.would_create_files, report.counts.unique_lexemes + 6);
  assert.equal(new Set(first.files.map((x) => x.path)).size, first.files.length);
  assert.ok(first.files.every((x) => x.path.startsWith("_LinguistPro/")));
  assert.match(first.base_preview, /name: "Глаголы"/);
  assert.match(first.base_preview, /note\.lp_text_ids\.contains\("T1"\)/);
  assert.ok(first.would_write_bytes > 0);
  assert.equal(first.files.find((x) => x.path.endsWith("occurrences.tsv")).content.split("\n").length - 2, 6);
});

test("requires an explicit selection when a bundle contains multiple texts", () => {
  const input = fixture();
  input.library.texts.push({ text_id: "T2", title: "Other", rows: [] });
  assert.throws(() => Preview.analyzeBundle(input), /Select exactly one text/);
});
