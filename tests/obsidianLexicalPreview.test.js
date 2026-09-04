"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Preview = require("../public/js/obsidian-lexical-preview.js");
const Core = require("../public/js/lexical-resolution-core.js");
const Service = require("../public/js/lexical-resolution-service.js");

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
  assert.equal(report.counts.uncertain_occurrences, 1);
  assert.equal(report.counts.queued_uncertain_occurrences, 1);
  assert.equal(report.counts.resolution_queue_coverage_pct, 100);
  assert.equal(report.resolution_queue.items.length, 1);
  assert.deepEqual(report.resolution_queue.items[0].reasons, ["ambiguous", "identity_guarded"]);
  assert.equal(report.resolution_queue.items[0].candidate_evidence[0].pealim_id, "7361");
  assert.equal(report.resolution_queue.items[0].sentence_he_niqqud, "הַבָּתִּים שֶׁל נֶטַע");
  assert.equal(report.resolution_queue.clusters.length, 1);
  assert.equal(report.resolution_queue.clusters[0].occurrence_count, 1);
  assert.equal(report.resolution_queue.reason_counts.ambiguous, 1);
  assert.equal(report.resolution_queue.reason_counts.identity_guarded, 1);
  assert.equal(Object.hasOwn(report, "learning_state"), false);
  assert.equal(Object.hasOwn(report, "review_log"), false);
});

test("conserves every uncertain occurrence in the visible resolution queue", () => {
  const input = fixture();
  input.notes_advanced.sentence_morph[0].tokens[1].posDicta = "";
  const report = Preview.analyzeBundle(input, { textId: "T1" });
  const itemIds = report.resolution_queue.items.map((x) => x.lp_occurrence_id);
  const clusteredIds = report.resolution_queue.clusters.flatMap((x) => x.occurrence_ids);

  assert.equal(report.counts.uncertain_occurrences, 2);
  assert.equal(report.counts.queued_uncertain_occurrences, 2);
  assert.equal(report.counts.resolution_queue_coverage_pct, 100);
  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.deepEqual(new Set(clusteredIds), new Set(itemIds));
  assert.ok(report.resolution_queue.items.some((x) => x.reasons.includes("unknown_pos")));
  assert.ok(report.resolution_queue.items.some((x) => x.reasons.includes("identity_guarded")));
});

test("turns an unparsed token into a contextual queue item instead of a hidden skip", () => {
  const input = fixture();
  input.notes_advanced.sentence_morph[0].tokens.push({ word: "—", posDicta: "punctuation" });
  const report = Preview.analyzeBundle(input, { textId: "T1" });
  const skipped = report.resolution_queue.items.find((x) => x.reasons.includes("skipped_token"));

  assert.equal(report.counts.skipped_tokens, 1);
  assert.equal(report.resolution_queue.reason_counts.skipped_token, 1);
  assert.ok(skipped);
  assert.equal(skipped.surface, "—");
  assert.equal(skipped.row_id, "R1");
  assert.equal(skipped.word_offset, 3);
  assert.equal(skipped.sentence_ru, "Сожгли дома");
  assert.equal(report.counts.uncertain_occurrences, 2);
  assert.equal(report.counts.resolution_queue_coverage_pct, 100);
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
  assert.equal(first.would_create_files, report.counts.unique_lexemes + report.counts.resolution_clusters + 10);
  assert.equal(new Set(first.files.map((x) => x.path)).size, first.files.length);
  assert.ok(first.files.every((x) => x.path.startsWith("_LinguistPro/")));
  assert.match(first.base_preview, /name: "Глаголы"/);
  assert.match(first.base_preview, /note\.lp_text_ids\.contains\("T1"\)/);
  assert.match(first.resolution_base_preview, /note\.type == "lp-resolution-cluster"/);
  assert.ok(first.files.some((x) => x.kind === "resolution-cluster"));
  assert.ok(first.files.some((x) => x.path.endsWith("Очередь разбора.md")));
  assert.ok(first.would_write_bytes > 0);
  assert.equal(first.files.find((x) => x.path.endsWith("occurrences.tsv")).content.split("\n").length - 2, 6);
  assert.equal(first.files.find((x) => x.path.endsWith("resolution-occurrences.tsv")).content.split("\n").length - 2, report.counts.uncertain_occurrences);
  assert.equal(first.receipt.active_resolution_occurrences, 1);
  assert.equal(first.receipt.resolved_resolution_occurrences, 0);
  assert.ok(first.files.some((x) => x.path.endsWith("resolution-audit.json")));
});

test("receipts prove unresolved to resolved without losing the audited occurrence", async () => {
  const report = Preview.analyzeBundle(fixture(), { textId: "T1" });
  const before = Preview.planObsidianPackage(report);
  const hydrated = await Service.hydrate(report, [], Core);
  const item = hydrated.resolution_audit.items[0];
  const event = {
    id: "resolution-1", occurrence_id: item.lp_occurrence_id, text_id: "T1", sentence_id: item.row_id,
    word_offset: item.word_offset, text_key: "text-kfar", order_index: item.order_index,
    surface_norm: item.surface, source_anchor: item.source_anchor, action: "manual_correction",
    chosen_analysis: { lemma: "נטע", lp_pos: "propernoun" }, candidate_fingerprint: item.candidate_fingerprint,
    actor_kind: "owner", created_at: "2026-09-04T01:00:00Z"
  };
  const resolved = await Service.hydrate(report, [event], Core);
  const after = Preview.planObsidianPackage(resolved, { previousReceipt: before.receipt });

  assert.equal(after.receipt.active_resolution_occurrences, 0);
  assert.equal(after.receipt.resolved_resolution_occurrences, 1);
  assert.deepEqual(after.receipt.resolution_transitions, [{ lp_occurrence_id: item.lp_occurrence_id, from: "unresolved", to: "resolved" }]);
  assert.equal(resolved.resolution_queue.items.length, 0);
  const audit = JSON.parse(after.files.find((x) => x.path.endsWith("resolution-audit.json")).content);
  assert.equal(audit.items.length, 1);
  assert.equal(audit.items[0].resolution_event_id, "resolution-1");
});

test("requires an explicit selection when a bundle contains multiple texts", () => {
  const input = fixture();
  input.library.texts.push({ text_id: "T2", title: "Other", rows: [] });
  assert.throws(() => Preview.analyzeBundle(input), /Select exactly one text/);
});
