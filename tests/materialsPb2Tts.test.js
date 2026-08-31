"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TABLE_ROOT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "artifacts", "student-solution-tables");

test("Materials PB2 TTS inventory is deterministic, deduplicated and below the release ceiling", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const inventory = tts.buildInventory({ tableRoot: TABLE_ROOT });
  assert.deepEqual(tts.DEFAULT_PROFILE, {
    language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 0.8, pitch: 2.5,
  });
  assert.equal(inventory.task_count, 60);
  assert.equal(inventory.row_reference_count, 2612);
  assert.equal(inventory.unique_condition_row_count, 674);
  assert.equal(inventory.unique_solution_row_count, 1577);
  assert.equal(inventory.unique_row_asset_count, 2251);
  assert.equal(inventory.word_reference_count, 19996);
  assert.equal(inventory.discovered_word_form_count, 5688);
  assert.equal(inventory.unique_word_asset_count, 5072);
  assert.equal(inventory.row_billed_character_count, 215752);
  assert.equal(inventory.word_billed_character_count, 54928);
  assert.equal(inventory.normalized_word_billed_character_count, 48760);
  assert.equal(inventory.total_billed_character_count, 270680);
  assert.ok(inventory.total_billed_character_count <= tts.RELEASE_CHARACTER_CEILING);
  assert.equal(inventory.formula_review_required_count, 275);
  assert.equal(inventory.formula_review_pass_count, 0);
  assert.equal(inventory.gates.formula_speech, "BLOCKED");
});

test("Task 1 cost inventory matches the accepted release estimate", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const inventory = tts.buildInventory({ tableRoot: TABLE_ROOT, taskIds: ["materials-science-y1-pb2-q001"] });
  assert.equal(inventory.task_count, 1);
  assert.equal(inventory.unique_row_asset_count, 29);
  assert.equal(inventory.unique_word_asset_count, 62);
  assert.equal(inventory.row_billed_character_count, 1672);
  assert.equal(inventory.word_billed_character_count, 537);
  assert.equal(inventory.total_billed_character_count, 2209);
  assert.equal(inventory.formula_review_required_count, 4);
});

test("row and word keys are intentionally distinct while duplicate words share one key", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const text = "פִּתְרוֹן";
  const rowKey = tts.assetKey("row", text);
  const wordKey = tts.assetKey("word", text);
  assert.match(rowKey, /^[a-f0-9]{64}$/);
  assert.match(wordKey, /^[a-f0-9]{64}$/);
  assert.notEqual(rowKey, wordKey);
  assert.equal(wordKey, tts.assetKey("word", "  פִּתְרוֹן  "));
});

test("word index adds only unambiguous unvocalized aliases for morphology cards", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const assets = ["יְסוֹד", "בַּיִת", "בֵּית"].map(text => ({
    text, asset_key: tts.assetKey("word", text),
  }));
  const index = tts.buildWordIndex(assets);
  const yesod = index.find(entry => entry.text === "יסוד");
  assert.equal(yesod.lookup_kind, "unvocalized_unambiguous_alias");
  assert.equal(yesod.asset_key, assets[0].asset_key);
  assert.equal(index.some(entry => entry.text === "בית"), false,
    "an unvocalized form shared by distinct vocalizations must fail closed");
});

test("formula speech ledger is complete and fails closed until selected rows are reviewed", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const ledger = tts.buildFormulaReviewLedger({ tableRoot: TABLE_ROOT });
  assert.equal(ledger.schema_version, "materials_pb2_formula_speech_review.1.0.0");
  assert.equal(ledger.entries.length, 275);
  assert.equal(ledger.entries.filter(entry => entry.task_id === "materials-science-y1-pb2-q001").length, 4);
  assert.ok(ledger.entries.every(entry => entry.status === "PENDING_OWNER_REVIEW" && entry.spoken_he_niqqud === ""));
  assert.throws(() => tts.validateFormulaReview(ledger, ["materials-science-y1-pb2-q001"]), /FORMULA_SPEECH_REVIEW_BLOCKED:materials-science-y1-pb2-q001-sol-r011/);

  const reviewed = JSON.parse(JSON.stringify(ledger));
  for (const entry of reviewed.entries.filter(row => row.task_id === "materials-science-y1-pb2-q001")) {
    entry.status = "REVIEWED_PASS";
    entry.spoken_he_niqqud = "נֻסְחָה בְּדוּקָה";
    entry.reviewed_by = "owner";
    entry.reviewed_at = "2026-09-01T00:00:00Z";
  }
  const accepted = tts.validateFormulaReview(reviewed, ["materials-science-y1-pb2-q001"]);
  assert.equal(accepted.size, 4);
});

test("public asset manifest rejects missing bodies, hash drift and non-monotonic timings", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const good = {
    asset_key: tts.assetKey("row", "שָׁלוֹם"), asset_type: "row", text: "שָׁלוֹם",
    mp3: Buffer.from("ID3-test"), timing: { v: 1, n: 2, got: 2, words: [{ o: 0, t: 0 }, { o: 1, t: 0.4 }] },
  };
  const manifest = tts.buildPublicAssetManifest([good]);
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].asset_key, good.asset_key);
  assert.throws(() => tts.buildPublicAssetManifest([{ ...good, asset_key: "0".repeat(64) }]), /ASSET_KEY_DRIFT/);
  assert.throws(() => tts.buildPublicAssetManifest([{ ...good, timing: { ...good.timing, words: [{ o: 1, t: 0.5 }, { o: 0, t: 0.2 }] } }]), /TIMING_NOT_MONOTONIC/);
});

test("ADC client synthesis returns row MP3 and timings from one provider request", async () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  let calls = 0, request = null;
  const client = { synthesizeSpeech: async value => {
    calls += 1; request = value;
    return [{ audioContent: Buffer.from("ID3-audio"), timepoints: [{ markName: "w0", timeSeconds: 0 }] }];
  } };
  const result = await tts.synthesizeRowWithClient(client, "שָׁלוֹם");
  assert.equal(calls, 1);
  assert.match(request.input.ssml, /<mark name="w0"\/>/);
  assert.deepEqual(request.enableTimePointing, ["SSML_MARK"]);
  assert.equal(result.mp3.toString(), "ID3-audio");
  assert.equal(result.timing.got, 1);
});

test("full TTS rights require an explicit owner basis and do not reuse zero-audio authority", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const rights = { schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: "materials-science-year1-problem-book-2",
    owner_attested: true, basis: "Owner approves public TTS", asserted_at: "2026-09-01T00:00:00Z",
    classes: { public_read: true, public_solution_display_and_print: true, full_tts_audio_and_timings: true } };
  assert.equal(tts.validateTtsRights(rights), true);
  assert.throws(() => tts.validateTtsRights({ ...rights, basis: "" }), /TTS_RIGHTS_BASIS_MISSING/);
  assert.throws(() => tts.validateTtsRights({ ...rights, classes: { ...rights.classes, full_tts_audio_and_timings: false } }), /FULL_TTS_RIGHTS_BLOCKED/);
});
