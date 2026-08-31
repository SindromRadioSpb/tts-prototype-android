"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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
  const stale = JSON.parse(JSON.stringify(reviewed)); stale.source_manifest_sha256 = "0".repeat(64);
  assert.throws(() => tts.validateFormulaReview(stale, ["materials-science-y1-pb2-q001"]), /FORMULA_LEDGER_SOURCE_DRIFT/);
});

test("formula review pack deduplicates only exact display forms and expands reviewed decisions safely", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const row = (row_id, display_he_niqqud) => ({ task_id: "task", display_alias: "1", row_id, row_order: 1,
    display_he: display_he_niqqud, display_he_niqqud, display_ru: display_he_niqqud,
    spoken_he_niqqud: "", status: "PENDING_OWNER_REVIEW", reviewed_by: null, reviewed_at: null, note: "" });
  const ledger = { schema_version: "materials_pb2_formula_speech_review.1.0.0", corpus_slug: "materials-science-year1-problem-book-2",
    source_manifest_sha256: "a".repeat(64), entries: [row("r1", "σ = F/A"), row("r2", "σ = F/A"), row("r3", "E=σ/ε")] };
  const pack = tts.buildFormulaReviewPack(ledger);
  assert.equal(pack.row_count, 3); assert.equal(pack.unique_display_form_count, 2); assert.equal(pack.pending_unique_form_count, 2);
  const sigma = pack.items.find(item => item.display_he_niqqud === "σ = F/A");
  sigma.status = "REVIEWED_PASS"; sigma.spoken_he_niqqud = "סִיגְמָה שָׁוָה אֶף חֶלְקֵי אַי";
  sigma.reviewed_by = "owner"; sigma.reviewed_at = "2026-09-01T00:00:00Z";
  const applied = tts.applyFormulaReviewPack(ledger, pack);
  assert.equal(applied.entries.filter(entry => entry.status === "REVIEWED_PASS").length, 2);
  assert.equal(applied.entries[0].spoken_he_niqqud, applied.entries[1].spoken_he_niqqud);
  const drift = JSON.parse(JSON.stringify(pack)); drift.items[0].occurrences[0].row_id = "missing";
  assert.throws(() => tts.applyFormulaReviewPack(JSON.parse(JSON.stringify(ledger)), drift), /FORMULA_REVIEW_OCCURRENCE_DRIFT/);
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
  assert.throws(() => tts.buildPublicAssetManifest([{ ...good, timing: { v: 1, n: 2, got: 1, words: [{ o: 0, t: 0 }] } }]), /TIMING_INCOMPLETE/);
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

test("secret gate validates redacted key material before generation", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  assert.throws(() => tts.validateSecretGate({}), /TTS_SECRET_GATE_BLOCKED/);
  assert.throws(() => tts.validateSecretGate({ apiKey: "replace-me" }), /TTS_SECRET_GATE_BLOCKED/);
  assert.throws(() => tts.validateSecretGate({ credentialPath: path.join(os.tmpdir(), "missing-materials-pb2-key.json") }), /TTS_ADC_FILE_MISSING/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-secret-"));
  const credentialPath = path.join(dir, "adc.json");
  fs.writeFileSync(credentialPath, JSON.stringify({ type: "service_account", project_id: "project", client_email: "tts@example.invalid", private_key: "private" }));
  try {
    assert.deepEqual(tts.validateSecretGate({ credentialPath }), {
      status: "PASS", mode: "adc-service-account", source: "GOOGLE_APPLICATION_CREDENTIALS",
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bake performs all gates before creating output or calling the provider", async () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const ledger = tts.buildFormulaReviewLedger({ tableRoot: TABLE_ROOT });
  for (const entry of ledger.entries.filter(row => row.task_id === "materials-science-y1-pb2-q001")) {
    entry.status = "REVIEWED_PASS"; entry.spoken_he_niqqud = "נֻסְחָה בְּדוּקָה";
    entry.reviewed_by = "owner"; entry.reviewed_at = "2026-09-01T00:00:00Z";
  }
  const rights = { schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: "materials-science-year1-problem-book-2",
    owner_attested: true, basis: "Owner approves public TTS", asserted_at: "2026-09-01T00:00:00Z",
    classes: { public_read: true, public_solution_display_and_print: true, full_tts_audio_and_timings: true } };
  const root = path.join(os.tmpdir(), `materials-pb2-no-secret-${process.pid}-${Date.now()}`);
  let calls = 0;
  const client = { synthesizeSpeech: async () => { calls += 1; return []; } };
  await assert.rejects(tts.bake({ tableRoot: TABLE_ROOT, taskIds: ["materials-science-y1-pb2-q001"],
    formulaLedger: ledger, rights, output: root, client, credentialPath: "" }), /TTS_SECRET_GATE_BLOCKED/);
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(root), false);
});

test("release preflight can prove all gates without synthesis or filesystem output", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const ledger = tts.buildFormulaReviewLedger({ tableRoot: TABLE_ROOT });
  for (const entry of ledger.entries.filter(row => row.task_id === "materials-science-y1-pb2-q001")) {
    entry.status = "REVIEWED_PASS"; entry.spoken_he_niqqud = "נֻסְחָה בְּדוּקָה";
    entry.reviewed_by = "owner"; entry.reviewed_at = "2026-09-01T00:00:00Z";
  }
  const rights = { schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: "materials-science-year1-problem-book-2",
    owner_attested: true, basis: "Owner approves public TTS", asserted_at: "2026-09-01T00:00:00Z",
    classes: { public_read: true, public_solution_display_and_print: true, full_tts_audio_and_timings: true } };
  const result = tts.releasePreflight({ tableRoot: TABLE_ROOT, taskIds: ["materials-science-y1-pb2-q001"],
    formulaLedger: ledger, rights, client: { __materialsPb2SecretGateVerified: true, synthesizeSpeech() {} } });
  assert.equal(result.ready, true);
  assert.deepEqual(result.gates, { rights: "PASS", formula_speech: "PASS", cost: "PASS", secret: "PASS" });
  assert.equal(result.inventory.total_billed_character_count, 2168);
  assert.equal(result.planned_asset_count, 88);
  assert.equal(result.inventory.unique_row_asset_count, result.planned_row_asset_count,
    "cost inventory must use approved formula speech, not the shorter display formula");
});

test("bake verifier proves every MP3 and complete timing sidecar by hash", () => {
  const tts = require("../scripts/premium/materials-pb2-tts.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-verify-"));
  const audioDir = path.join(root, "audio-cache"); fs.mkdirSync(audioDir);
  const row = { asset_key: tts.assetKey("row", "שָׁלוֹם"), asset_type: "row", text: "שָׁלוֹם",
    mp3: Buffer.from("ID3-row"), timing: { v: 1, n: 1, got: 1, words: [{ o: 0, t: 0 }] } };
  const word = { asset_key: tts.assetKey("word", "שָׁלוֹם"), asset_type: "word", text: "שָׁלוֹם", mp3: Buffer.from("ID3-word") };
  const manifest = tts.buildPublicAssetManifest([row, word], { references: [{ task_id: "task", row_id: "row", asset_key: row.asset_key }] });
  manifest.word_index = [{ text: tts.normalizeSpeech(word.text), asset_key: word.asset_key, lookup_kind: "exact" }];
  fs.writeFileSync(path.join(audioDir, row.asset_key + ".mp3"), row.mp3);
  fs.writeFileSync(path.join(audioDir, row.asset_key + ".timing.json"), JSON.stringify(row.timing, null, 2) + "\n");
  fs.writeFileSync(path.join(audioDir, word.asset_key + ".mp3"), word.mp3);
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  try {
    const verified = tts.verifyBake({ root });
    assert.equal(verified.asset_count, 2);
    assert.equal(verified.row_asset_count, 1);
    assert.equal(verified.complete_timing_count, 1);
    fs.writeFileSync(path.join(audioDir, word.asset_key + ".mp3"), Buffer.from("BAD-word"));
    assert.throws(() => tts.verifyBake({ root }), /AUDIO_SHA256_MISMATCH/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
