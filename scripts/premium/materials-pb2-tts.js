#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { computeAssetKey } = require("../../db/premium/ttsAssetKey");
const { escapeXml, buildMarkedSsml, timingFromTimepoints, synthesizeMp3, synthesizeWithTimepoints } = require("./lib/ttsBake");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_TABLE_ROOT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "artifacts", "student-solution-tables");
const DEFAULT_LEDGER = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-09-01", "tts", "formula-speech-review.json");
const DEFAULT_OUTPUT = path.join(ROOT, ".tmp", "materials-pb2-tts");
const SLUG = "materials-science-year1-problem-book-2";
const DEFAULT_PROFILE = Object.freeze({ language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 0.8, pitch: 2.5 });
const PROFILE_ID = "materials-pb2-standard-a-0.8-pitch-2.5-v1";
const RELEASE_CHARACTER_CEILING = 320000;
const HASH = /^[a-f0-9]{64}$/;
const HEBREW_TOKEN = /[א-ת\u0591-\u05C7]+/gu;

function invariant(value, message) { if (!value) throw new Error(message); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function stableJson(value) { return JSON.stringify(value, null, 2) + "\n"; }
function normalizeSpeech(value) { return String(value == null ? "" : value).normalize("NFC").replace(/\s+/g, " ").trim(); }
function assetKey(assetType, text, profile = DEFAULT_PROFILE) {
  return computeAssetKey({ assetType, ttsProfile: profile, text: normalizeSpeech(text) });
}
function ssmlBilledCharacters(text) { return `<speak>${escapeXml(String(text || ""))}</speak>`.length; }
function wordTokens(text, normalize = true) {
  const matches = String(text || "").match(HEBREW_TOKEN) || [];
  return matches.map(value => normalize ? normalizeSpeech(value) : String(value)).filter(Boolean);
}
function unvocalized(value) {
  return normalizeSpeech(value).replace(/[\u0591-\u05C7]/g, "");
}
function buildWordIndex(words) {
  const exact = new Map(), aliasCandidates = new Map();
  for (const asset of words || []) {
    const text = normalizeSpeech(asset.text), key = String(asset.asset_key || "");
    invariant(text && HASH.test(key) && !exact.has(text), `WORD_INDEX_INVALID:${text}`);
    exact.set(text, key);
    const alias = unvocalized(text);
    if (!alias || alias === text) continue;
    if (!aliasCandidates.has(alias)) aliasCandidates.set(alias, new Set());
    aliasCandidates.get(alias).add(key);
  }
  const index = [...exact].map(([text, asset_key]) => ({ text, asset_key, lookup_kind: "exact" }));
  for (const [text, keys] of aliasCandidates) {
    if (keys.size !== 1) continue;
    const asset_key = [...keys][0], exactKey = exact.get(text);
    if (exactKey && exactKey !== asset_key) continue;
    if (!exactKey) index.push({ text, asset_key, lookup_kind: "unvocalized_unambiguous_alias" });
  }
  return index.sort((a, b) => a.text.localeCompare(b.text, "he"));
}
function loadTables(tableRoot = DEFAULT_TABLE_ROOT, taskIds) {
  const manifest = readJson(path.join(tableRoot, "manifest.json"));
  invariant(manifest.schema_version === "materials_pb2_student_solution_manifest.1.0.0" && manifest.corpus_slug === SLUG, "TABLE_MANIFEST_INVALID");
  const selected = taskIds && taskIds.length ? new Set(taskIds) : null;
  const tasks = manifest.tasks.filter(entry => !selected || selected.has(entry.task_id)).map(entry => {
    const table = readJson(path.join(tableRoot, entry.file));
    invariant(table.task_id === entry.task_id && Array.isArray(table.condition?.rows) && Array.isArray(table.rows), `TABLE_INVALID:${entry.task_id}`);
    return table;
  });
  if (selected) {
    for (const id of selected) invariant(tasks.some(table => table.task_id === id), `TASK_NOT_FOUND:${id}`);
  }
  return { manifest, tasks };
}
function ledgerMap(ledger) {
  const map = new Map();
  if (!ledger) return map;
  invariant(ledger.schema_version === "materials_pb2_formula_speech_review.1.0.0" && ledger.corpus_slug === SLUG && Array.isArray(ledger.entries), "FORMULA_LEDGER_INVALID");
  for (const entry of ledger.entries) {
    invariant(entry && entry.row_id && !map.has(entry.row_id), `FORMULA_LEDGER_DUPLICATE:${entry && entry.row_id}`);
    map.set(entry.row_id, entry);
  }
  return map;
}
function buildInventory({ tableRoot = DEFAULT_TABLE_ROOT, taskIds, formulaLedger } = {}) {
  const { manifest, tasks } = loadTables(tableRoot, taskIds);
  const reviews = ledgerMap(formulaLedger);
  const conditionTexts = [], solutionTexts = [], rawWords = [];
  let rowReferenceCount = 0, formulaRequired = 0, formulaPass = 0;
  for (const table of tasks) {
    for (const row of table.condition.rows) {
      const text = String(row.hebrew_niqqud || row.hebrew_plain || "").trim();
      invariant(text, `CONDITION_SPEECH_EMPTY:${row.row_id}`);
      conditionTexts.push(text); rowReferenceCount += 1; rawWords.push(...wordTokens(text, false));
    }
    for (const row of table.rows) {
      const displayText = String(row.text?.he_niqqud || row.text?.he || "").trim();
      invariant(displayText, `SOLUTION_SPEECH_EMPTY:${row.row_id}`);
      solutionTexts.push(displayText); rowReferenceCount += 1; rawWords.push(...wordTokens(displayText, false));
      if (row.audio_plan?.formula_speech_review_required === true) {
        formulaRequired += 1;
        const review = reviews.get(row.row_id);
        if (review?.status === "REVIEWED_PASS" && normalizeSpeech(review.spoken_he_niqqud)) formulaPass += 1;
      }
    }
  }
  const uniqueCondition = [...new Set(conditionTexts)];
  const uniqueSolution = [...new Set(solutionTexts)];
  const uniqueRows = [...new Set([...conditionTexts, ...solutionTexts])];
  const discoveredWords = [...new Set(rawWords)];
  const normalizedWords = [...new Set(rawWords.map(normalizeSpeech))];
  const rowBilled = uniqueRows.reduce((sum, text) => sum + ssmlBilledCharacters(text), 0);
  const wordBilled = discoveredWords.reduce((sum, text) => sum + text.length, 0);
  const normalizedWordBilled = normalizedWords.reduce((sum, text) => sum + text.length, 0);
  const total = rowBilled + wordBilled;
  invariant(total <= RELEASE_CHARACTER_CEILING, `RELEASE_CHARACTER_CEILING_EXCEEDED:${total}`);
  return Object.freeze({
    schema_version: "materials_pb2_tts_inventory.1.0.0", corpus_slug: SLUG,
    source_manifest_sha256: sha256(fs.readFileSync(path.join(tableRoot, "manifest.json"))),
    source_bundle_sha256: manifest.canonical_bundle?.sha256 || null,
    profile_id: PROFILE_ID, profile: DEFAULT_PROFILE,
    task_count: tasks.length, row_reference_count: rowReferenceCount,
    unique_condition_row_count: uniqueCondition.length, unique_solution_row_count: uniqueSolution.length,
    unique_row_asset_count: uniqueRows.length, word_reference_count: rawWords.length,
    discovered_word_form_count: discoveredWords.length, unique_word_asset_count: normalizedWords.length,
    row_billed_character_count: rowBilled, word_billed_character_count: wordBilled,
    normalized_word_billed_character_count: normalizedWordBilled,
    total_billed_character_count: total, release_character_ceiling: RELEASE_CHARACTER_CEILING,
    formula_review_required_count: formulaRequired, formula_review_pass_count: formulaPass,
    gates: Object.freeze({ cost: "PASS", formula_speech: formulaRequired === formulaPass ? "PASS" : "BLOCKED" }),
  });
}
function buildFormulaReviewLedger({ tableRoot = DEFAULT_TABLE_ROOT } = {}) {
  const { manifest, tasks } = loadTables(tableRoot);
  const entries = [];
  for (const table of tasks) for (const row of table.rows) {
    if (row.audio_plan?.formula_speech_review_required !== true) continue;
    entries.push({
      task_id: table.task_id, display_alias: table.display_alias, row_id: row.row_id,
      row_order: Number(row.order), section: row.section, kind: row.kind,
      display_he: String(row.text?.he || ""), display_he_niqqud: String(row.text?.he_niqqud || ""),
      display_ru: String(row.text?.ru || ""), spoken_he_niqqud: "",
      status: "PENDING_OWNER_REVIEW", reviewed_by: null, reviewed_at: null, note: "",
    });
  }
  invariant(entries.length === Number(manifest.audio_boundary?.formula_speech_review_required_count), "FORMULA_LEDGER_COUNT_DRIFT");
  return {
    schema_version: "materials_pb2_formula_speech_review.1.0.0", corpus_slug: SLUG,
    source_manifest_sha256: sha256(fs.readFileSync(path.join(tableRoot, "manifest.json"))),
    generated_at: "2026-09-01T00:00:00Z", authority: "OWNER_REVIEW_REQUIRED",
    policy: { display_text_is_not_speech_authority: true, raw_formula_inference_forbidden: true }, entries,
  };
}
function validateFormulaReview(ledger, taskIds) {
  const map = ledgerMap(ledger);
  const selected = taskIds && taskIds.length ? new Set(taskIds) : null;
  const accepted = new Map();
  for (const entry of map.values()) {
    if (selected && !selected.has(entry.task_id)) continue;
    invariant(entry.status === "REVIEWED_PASS" && normalizeSpeech(entry.spoken_he_niqqud)
      && String(entry.reviewed_by || "").trim() && String(entry.reviewed_at || "").trim(), `FORMULA_SPEECH_REVIEW_BLOCKED:${entry.row_id}`);
    accepted.set(entry.row_id, normalizeSpeech(entry.spoken_he_niqqud));
  }
  return accepted;
}
function validateTtsRights(rights) {
  invariant(rights?.schema_version === "materials_pb2_publication_rights.1.0.0" && rights.corpus_slug === SLUG && rights.owner_attested === true, "TTS_RIGHTS_ATTESTATION_MISSING");
  invariant(String(rights.basis || "").trim() && String(rights.asserted_at || "").trim(), "TTS_RIGHTS_BASIS_MISSING");
  invariant(rights.classes?.full_tts_audio_and_timings === true, "FULL_TTS_RIGHTS_BLOCKED");
  invariant(rights.classes?.public_read === true && rights.classes?.public_solution_display_and_print === true, "PUBLIC_TTS_RIGHTS_SCOPE_INVALID");
  return true;
}
function validateTiming(timing) {
  invariant(timing && timing.v === 1 && Number.isInteger(Number(timing.n)) && Array.isArray(timing.words), "TIMING_INVALID");
  let lastOffset = -1, lastTime = -1;
  for (const word of timing.words) {
    invariant(Number.isInteger(Number(word.o)) && Number(word.o) > lastOffset && Number(word.t) >= lastTime, "TIMING_NOT_MONOTONIC");
    lastOffset = Number(word.o); lastTime = Number(word.t);
  }
  return true;
}
function buildPublicAssetManifest(assets, metadata = {}) {
  const rows = [];
  for (const asset of assets || []) {
    const text = normalizeSpeech(asset.text);
    invariant(["row", "word"].includes(asset.asset_type) && text && Buffer.isBuffer(asset.mp3) && asset.mp3.length, "ASSET_BODY_INVALID");
    const expected = assetKey(asset.asset_type, text, asset.profile || DEFAULT_PROFILE);
    invariant(asset.asset_key === expected, `ASSET_KEY_DRIFT:${asset.asset_key}`);
    if (asset.asset_type === "row") validateTiming(asset.timing);
    const timingBytes = asset.timing ? Buffer.from(stableJson(asset.timing), "utf8") : null;
    rows.push({
      asset_key: expected, asset_type: asset.asset_type, text_sha256: sha256(Buffer.from(text, "utf8")),
      profile_id: PROFILE_ID, bytes: asset.mp3.length, sha256: sha256(asset.mp3), mime: "audio/mpeg",
      timing: timingBytes ? { bytes: timingBytes.length, sha256: sha256(timingBytes), format: "reader-word-timepoints-v1" } : null,
    });
  }
  rows.sort((a, b) => a.asset_key.localeCompare(b.asset_key));
  invariant(new Set(rows.map(row => row.asset_key)).size === rows.length, "ASSET_MANIFEST_DUPLICATE");
  return { schema_version: "materials_pb2_public_tts_assets.1.0.0", corpus_slug: SLUG, profile_id: PROFILE_ID, profile: DEFAULT_PROFILE, ...metadata, assets: rows };
}
async function synthesizeRowWithClient(client, text, profile = DEFAULT_PROFILE) {
  invariant(client && typeof client.synthesizeSpeech === "function", "TTS_CLIENT_REQUIRED");
  const clean = normalizeSpeech(text), marked = buildMarkedSsml(clean);
  const [response] = await client.synthesizeSpeech({
    input: { ssml: marked.ssml },
    voice: { languageCode: profile.language, name: profile.voiceName },
    audioConfig: { audioEncoding: "MP3", speakingRate: profile.speakingRate, pitch: profile.pitch },
    enableTimePointing: ["SSML_MARK"],
  });
  const mp3 = Buffer.from(response && response.audioContent || []);
  invariant(mp3.length, "TTS_AUDIO_EMPTY");
  const timing = timingFromTimepoints(response && response.timepoints, marked.wordCount);
  validateTiming(timing);
  return { mp3, timing };
}
async function synthesizeWordWithClient(client, text, profile = DEFAULT_PROFILE) {
  invariant(client && typeof client.synthesizeSpeech === "function", "TTS_CLIENT_REQUIRED");
  const [response] = await client.synthesizeSpeech({
    input: { text: normalizeSpeech(text) },
    voice: { languageCode: profile.language, name: profile.voiceName },
    audioConfig: { audioEncoding: "MP3", speakingRate: profile.speakingRate, pitch: profile.pitch },
  });
  const mp3 = Buffer.from(response && response.audioContent || []);
  invariant(mp3.length, "TTS_AUDIO_EMPTY"); return mp3;
}
function speechAssets({ tableRoot = DEFAULT_TABLE_ROOT, taskIds, formulaLedger }) {
  const { tasks } = loadTables(tableRoot, taskIds);
  const formulaSpeech = validateFormulaReview(formulaLedger, taskIds);
  const rows = new Map(), words = new Map(), references = [];
  function addRow(task, rowId, sourceKind, displayText, speechText) {
    const text = normalizeSpeech(speechText);
    const key = assetKey("row", text);
    if (!rows.has(key)) rows.set(key, { asset_key: key, asset_type: "row", text });
    references.push({ task_id: task.task_id, row_id: rowId, source_kind: sourceKind, asset_key: key,
      spoken_he_niqqud: text, display_text_sha256: sha256(Buffer.from(normalizeSpeech(displayText), "utf8")) });
    for (const word of wordTokens(displayText)) {
      const wordKey = assetKey("word", word);
      if (!words.has(wordKey)) words.set(wordKey, { asset_key: wordKey, asset_type: "word", text: word });
    }
  }
  for (const task of tasks) {
    for (const row of task.condition.rows) {
      const display = row.hebrew_niqqud || row.hebrew_plain;
      addRow(task, row.row_id, "condition", display, display);
    }
    for (const row of task.rows) {
      const display = row.text.he_niqqud || row.text.he;
      const speech = row.audio_plan?.formula_speech_review_required ? formulaSpeech.get(row.row_id) : display;
      invariant(speech, `FORMULA_SPEECH_REVIEW_BLOCKED:${row.row_id}`);
      addRow(task, row.row_id, "solution", display, speech);
    }
  }
  return { rows: [...rows.values()], words: [...words.values()], references };
}
async function bake({ tableRoot = DEFAULT_TABLE_ROOT, taskIds, formulaLedger, rights, output = DEFAULT_OUTPUT, apiKey, client } = {}) {
  validateTtsRights(rights);
  const inventory = buildInventory({ tableRoot, taskIds, formulaLedger });
  invariant(inventory.total_billed_character_count <= RELEASE_CHARACTER_CEILING, "RELEASE_CHARACTER_CEILING_EXCEEDED");
  const planned = speechAssets({ tableRoot, taskIds, formulaLedger });
  const root = path.resolve(output), audioDir = path.join(root, "audio-cache");
  fs.mkdirSync(audioDir, { recursive: true });
  let adcClient = client || null;
  if (!apiKey && !adcClient) {
    const { v1beta1 } = require("@google-cloud/text-to-speech");
    adcClient = new v1beta1.TextToSpeechClient();
  }
  const completed = [];
  for (const asset of [...planned.rows, ...planned.words]) {
    const mp3Path = path.join(audioDir, `${asset.asset_key}.mp3`);
    const timingPath = path.join(audioDir, `${asset.asset_key}.timing.json`);
    let mp3, timing = null;
    if (fs.existsSync(mp3Path) && (asset.asset_type === "word" || fs.existsSync(timingPath))) {
      mp3 = fs.readFileSync(mp3Path);
      if (asset.asset_type === "row") timing = readJson(timingPath);
    } else if (asset.asset_type === "row") {
      const result = apiKey ? await synthesizeWithTimepoints(apiKey, asset.text, DEFAULT_PROFILE)
        : await synthesizeRowWithClient(adcClient, asset.text, DEFAULT_PROFILE);
      mp3 = result.mp3; timing = result.timing; validateTiming(timing);
      fs.writeFileSync(mp3Path, mp3); fs.writeFileSync(timingPath, stableJson(timing));
    } else {
      mp3 = apiKey ? await synthesizeMp3(apiKey, asset.text, DEFAULT_PROFILE)
        : await synthesizeWordWithClient(adcClient, asset.text, DEFAULT_PROFILE);
      fs.writeFileSync(mp3Path, mp3);
    }
    completed.push({ ...asset, mp3, timing });
  }
  const manifest = buildPublicAssetManifest(completed, { inventory, references: planned.references });
  manifest.word_index = buildWordIndex(planned.words);
  fs.writeFileSync(path.join(root, "manifest.json"), stableJson(manifest));
  return { output: root, asset_count: completed.length, manifest_sha256: sha256(Buffer.from(stableJson(manifest))) };
}
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) { out._.push(argv[i]); continue; }
    const key = argv[i].slice(2), value = argv[i + 1]; invariant(value && !value.startsWith("--"), `MISSING_ARG:${key}`); out[key] = value; i += 1;
  }
  return out;
}
async function main() {
  const args = parseArgs(process.argv.slice(2)), command = args._[0] || "inventory";
  const tableRoot = args["table-root"] ? path.resolve(args["table-root"]) : DEFAULT_TABLE_ROOT;
  const taskIds = args.task ? String(args.task).split(",").filter(Boolean) : undefined;
  if (command === "inventory") {
    const formulaLedger = args.ledger ? readJson(path.resolve(args.ledger)) : undefined;
    const inventory = buildInventory({ tableRoot, taskIds, formulaLedger });
    if (args.output) {
      const output = path.resolve(args.output); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, stableJson(inventory));
      process.stdout.write(stableJson({ ok: true, output, total_billed_character_count: inventory.total_billed_character_count }));
    } else process.stdout.write(stableJson(inventory));
    return;
  }
  if (command === "formula-ledger") {
    const output = path.resolve(args.output || DEFAULT_LEDGER), ledger = buildFormulaReviewLedger({ tableRoot });
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, stableJson(ledger));
    process.stdout.write(stableJson({ ok: true, output, entry_count: ledger.entries.length })); return;
  }
  if (command === "bake") {
    invariant(args.ledger && args.rights, "BAKE_REQUIRES_LEDGER_AND_RIGHTS");
    try { require("dotenv").config({ path: path.join(ROOT, ".env") }); } catch (_) {}
    const result = await bake({ tableRoot, taskIds, formulaLedger: readJson(path.resolve(args.ledger)), rights: readJson(path.resolve(args.rights)), output: args.output || DEFAULT_OUTPUT, apiKey: process.env[args["api-key-env"] || "GCP_TTS_API_KEY"] });
    process.stdout.write(stableJson({ ok: true, ...result })); return;
  }
  throw new Error(`COMMAND_INVALID:${command}`);
}
if (require.main === module) main().catch(error => { process.stderr.write(`materials-pb2-tts: ${error.stack || error.message}\n`); process.exitCode = 1; });

module.exports = {
  DEFAULT_PROFILE, PROFILE_ID, RELEASE_CHARACTER_CEILING, normalizeSpeech, assetKey,
  ssmlBilledCharacters, wordTokens, unvocalized, buildWordIndex, buildInventory, buildFormulaReviewLedger,
  validateFormulaReview, validateTtsRights, validateTiming, buildPublicAssetManifest,
  synthesizeRowWithClient, synthesizeWordWithClient, speechAssets, bake,
};
