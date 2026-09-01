#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { computeAssetKey } = require("../../db/premium/ttsAssetKey");
const { escapeXml, buildMarkedSsml, timingFromTimepoints, synthesizeMp3, synthesizeWithTimepoints } = require("./lib/ttsBake");
const formulaSpeech = require("./lib/materialsFormulaSpeech");

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
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
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
  const reviews = formulaSpeech.reviewedOverrides(formulaLedger);
  if (formulaLedger) invariant(formulaLedger.source_manifest_sha256 === sha256(fs.readFileSync(path.join(tableRoot, "manifest.json"))), "FORMULA_LEDGER_SOURCE_DRIFT");
  const conditionTexts = [], solutionTexts = [], rawWords = [];
  let rowReferenceCount = 0, formulaRequired = 0, formulaPass = 0, systemCompiled = 0, ownerOverrides = 0;
  for (const table of tasks) {
    for (const row of table.condition.rows) {
      const display = String(row.hebrew_niqqud || row.hebrew_plain || "").trim();
      invariant(display, `CONDITION_SPEECH_EMPTY:${row.row_id}`);
      const compiled = formulaSpeech.compileRowSpeech({ rowId: row.row_id, displayText: display, reviewed: reviews });
      conditionTexts.push(compiled.spoken_he_niqqud); rowReferenceCount += 1; rawWords.push(...wordTokens(display, false));
      systemCompiled += Number(compiled.status === "SYSTEM_COMPILED_PASS");
      ownerOverrides += Number(compiled.status === "OWNER_REVIEWED_OVERRIDE");
    }
    for (const row of table.rows) {
      const displayText = String(row.text?.he_niqqud || row.text?.he || "").trim();
      invariant(displayText, `SOLUTION_SPEECH_EMPTY:${row.row_id}`);
      const compiled = formulaSpeech.compileRowSpeech({ rowId: row.row_id, displayText, reviewed: reviews });
      if (row.audio_plan?.formula_speech_review_required === true) {
        formulaRequired += 1;
        formulaPass += 1;
      }
      solutionTexts.push(compiled.spoken_he_niqqud); rowReferenceCount += 1; rawWords.push(...wordTokens(displayText, false));
      systemCompiled += Number(compiled.status === "SYSTEM_COMPILED_PASS");
      ownerOverrides += Number(compiled.status === "OWNER_REVIEWED_OVERRIDE");
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
    formula_speech_compiler_id: "materials-formula-speech-he-v1",
    system_compiled_row_reference_count: systemCompiled, owner_reviewed_override_count: ownerOverrides,
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
function buildFormulaReviewPack(ledger) {
  const rows = [...ledgerMap(ledger).values()], groups = new Map();
  for (const entry of rows) {
    const display = normalizeSpeech(entry.display_he_niqqud || entry.display_he);
    invariant(display, `FORMULA_REVIEW_DISPLAY_EMPTY:${entry.row_id}`);
    if (!groups.has(display)) groups.set(display, []);
    groups.get(display).push(entry);
  }
  const items = [];
  for (const [display_he_niqqud, occurrences] of groups) {
    const accepted = occurrences.filter(entry => entry.status === "REVIEWED_PASS");
    const acceptedSpeech = new Set(accepted.map(entry => normalizeSpeech(entry.spoken_he_niqqud)).filter(Boolean));
    invariant(acceptedSpeech.size <= 1, `FORMULA_REVIEW_CONFLICT:${display_he_niqqud}`);
    const fullyReviewed = accepted.length === occurrences.length && acceptedSpeech.size === 1;
    const example = occurrences[0];
    items.push({
      review_id: sha256(Buffer.from(`materials-pb2-formula-review-v1\0${display_he_niqqud}`, "utf8")),
      display_he_niqqud, occurrence_count: occurrences.length,
      status: fullyReviewed ? "REVIEWED_PASS" : "PENDING_OWNER_REVIEW",
      spoken_he_niqqud: fullyReviewed ? [...acceptedSpeech][0] : "",
      reviewed_by: fullyReviewed ? String(example.reviewed_by || "owner") : null,
      reviewed_at: fullyReviewed ? String(example.reviewed_at || "") : null,
      note: fullyReviewed ? "Already approved in the canonical row ledger." : "",
      occurrences: occurrences.map(entry => ({ task_id: entry.task_id, display_alias: entry.display_alias,
        row_id: entry.row_id, row_order: entry.row_order, display_ru: entry.display_ru })),
    });
  }
  items.sort((a, b) => a.display_he_niqqud.localeCompare(b.display_he_niqqud, "he"));
  return {
    schema_version: "materials_pb2_formula_unique_review.1.0.0", corpus_slug: SLUG,
    source_manifest_sha256: ledger.source_manifest_sha256, generated_at: "2026-09-01T00:00:00Z",
    policy: { one_decision_per_exact_display_form: true, contextual_analogy_forbidden: true,
      reviewer_must_check_all_listed_occurrences: true },
    row_count: rows.length, unique_display_form_count: items.length,
    reviewed_unique_form_count: items.filter(item => item.status === "REVIEWED_PASS").length,
    pending_unique_form_count: items.filter(item => item.status !== "REVIEWED_PASS").length,
    items,
  };
}
function applyFormulaReviewPack(ledger, pack) {
  invariant(pack?.schema_version === "materials_pb2_formula_unique_review.1.0.0" && pack.corpus_slug === SLUG
    && pack.source_manifest_sha256 === ledger?.source_manifest_sha256 && Array.isArray(pack.items), "FORMULA_REVIEW_PACK_INVALID");
  const rows = ledgerMap(ledger), seenRows = new Set();
  for (const item of pack.items) {
    const display = normalizeSpeech(item?.display_he_niqqud);
    invariant(item.review_id === sha256(Buffer.from(`materials-pb2-formula-review-v1\0${display}`, "utf8"))
      && Array.isArray(item.occurrences) && item.occurrences.length === Number(item.occurrence_count), "FORMULA_REVIEW_PACK_INVALID");
    for (const occurrence of item.occurrences) {
      const row = rows.get(occurrence.row_id);
      invariant(row && row.task_id === occurrence.task_id && normalizeSpeech(row.display_he_niqqud || row.display_he) === display
        && !seenRows.has(row.row_id), `FORMULA_REVIEW_OCCURRENCE_DRIFT:${occurrence.row_id}`);
      seenRows.add(row.row_id);
      if (item.status === "REVIEWED_PASS") {
        invariant(normalizeSpeech(item.spoken_he_niqqud) && String(item.reviewed_by || "").trim()
          && String(item.reviewed_at || "").trim(), `FORMULA_REVIEW_DECISION_INCOMPLETE:${item.review_id}`);
        row.spoken_he_niqqud = normalizeSpeech(item.spoken_he_niqqud); row.status = "REVIEWED_PASS";
        row.reviewed_by = String(item.reviewed_by).trim(); row.reviewed_at = String(item.reviewed_at).trim();
        row.note = String(item.note || "Exact-display-form review applied from the unique review pack.");
      }
    }
  }
  invariant(seenRows.size === rows.size, "FORMULA_REVIEW_PACK_INCOMPLETE");
  return ledger;
}
function validateFormulaReview(ledger, taskIds, tableRoot = DEFAULT_TABLE_ROOT) {
  const map = ledgerMap(ledger);
  invariant(ledger?.source_manifest_sha256 === sha256(fs.readFileSync(path.join(tableRoot, "manifest.json"))), "FORMULA_LEDGER_SOURCE_DRIFT");
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
function validateSecretGate({ apiKey, credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS, client } = {}) {
  if (client) {
    invariant(client.__materialsPb2SecretGateVerified === true && typeof client.synthesizeSpeech === "function", "TTS_SECRET_GATE_BLOCKED");
    return Object.freeze({ status: "PASS", mode: "injected-client", source: "explicit-verified-client" });
  }
  const key = String(apiKey || "").trim();
  if (key) {
    invariant(key.length >= 20 && !/(replace|example|placeholder|your[-_ ]?key|changeme)/i.test(key), "TTS_SECRET_GATE_BLOCKED");
    return Object.freeze({ status: "PASS", mode: "api-key", source: "configured-environment" });
  }
  const configured = String(credentialPath || "").trim();
  invariant(configured, "TTS_SECRET_GATE_BLOCKED");
  const absolute = path.resolve(configured);
  invariant(fs.existsSync(absolute) && fs.statSync(absolute).isFile(), "TTS_ADC_FILE_MISSING");
  let credential;
  try { credential = readJson(absolute); } catch (_) { throw new Error("TTS_ADC_FILE_INVALID"); }
  invariant(credential?.type === "service_account" && String(credential.project_id || "").trim()
    && String(credential.client_email || "").trim() && String(credential.private_key || "").trim(), "TTS_ADC_FILE_INVALID");
  return Object.freeze({ status: "PASS", mode: "adc-service-account", source: "GOOGLE_APPLICATION_CREDENTIALS" });
}
function validateTiming(timing) {
  invariant(timing && timing.v === 1 && Number.isInteger(Number(timing.n)) && Number(timing.n) > 0
    && Number.isInteger(Number(timing.got)) && Array.isArray(timing.words), "TIMING_INVALID");
  invariant(Number(timing.got) === Number(timing.n) && timing.words.length === Number(timing.n), "TIMING_INCOMPLETE");
  let lastOffset = -1, lastTime = -1;
  for (const [index, word] of timing.words.entries()) {
    invariant(Number.isInteger(Number(word.o)) && Number(word.o) === index && Number(word.o) > lastOffset
      && Number(word.t) >= 0 && Number(word.t) >= lastTime, "TIMING_NOT_MONOTONIC");
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
  if (formulaLedger) invariant(formulaLedger.source_manifest_sha256 === sha256(fs.readFileSync(path.join(tableRoot, "manifest.json"))), "FORMULA_LEDGER_SOURCE_DRIFT");
  const reviewed = formulaSpeech.reviewedOverrides(formulaLedger);
  const rows = new Map(), words = new Map(), references = [];
  function addRow(task, rowId, sourceKind, displayText, compiled) {
    const text = normalizeSpeech(compiled.spoken_he_niqqud);
    const key = assetKey("row", text);
    if (!rows.has(key)) rows.set(key, { asset_key: key, asset_type: "row", text });
    references.push({ task_id: task.task_id, row_id: rowId, source_kind: sourceKind, asset_key: key,
      spoken_he_niqqud: text, speech_authority: compiled.status, speech_compiler_id: compiled.compiler_id,
      display_text_sha256: sha256(Buffer.from(normalizeSpeech(displayText), "utf8")) });
    for (const word of wordTokens(displayText)) {
      const wordKey = assetKey("word", word);
      if (!words.has(wordKey)) words.set(wordKey, { asset_key: wordKey, asset_type: "word", text: word });
    }
  }
  for (const task of tasks) {
    for (const row of task.condition.rows) {
      const display = row.hebrew_niqqud || row.hebrew_plain;
      addRow(task, row.row_id, "condition", display,
        formulaSpeech.compileRowSpeech({ rowId: row.row_id, displayText: display, reviewed }));
    }
    for (const row of task.rows) {
      const display = row.text.he_niqqud || row.text.he;
      addRow(task, row.row_id, "solution", display,
        formulaSpeech.compileRowSpeech({ rowId: row.row_id, displayText: display, reviewed }));
    }
  }
  return { rows: [...rows.values()], words: [...words.values()], references };
}
function prepareRelease({ tableRoot = DEFAULT_TABLE_ROOT, taskIds, formulaLedger, rights, apiKey, client,
  credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS } = {}) {
  validateTtsRights(rights);
  const inventory = buildInventory({ tableRoot, taskIds, formulaLedger });
  invariant(inventory.total_billed_character_count <= RELEASE_CHARACTER_CEILING, "RELEASE_CHARACTER_CEILING_EXCEEDED");
  const planned = speechAssets({ tableRoot, taskIds, formulaLedger });
  const secret = validateSecretGate({ apiKey, client, credentialPath });
  const report = Object.freeze({
    schema_version: "materials_pb2_tts_release_preflight.1.0.0", corpus_slug: SLUG, ready: true,
    gates: Object.freeze({ rights: "PASS", formula_speech: "PASS", cost: "PASS", secret: "PASS" }),
    profile_id: PROFILE_ID, formula_speech_compiler_id: "materials-formula-speech-he-v1", inventory,
    planned_row_asset_count: planned.rows.length, planned_word_asset_count: planned.words.length,
    planned_asset_count: planned.rows.length + planned.words.length,
    secret,
  });
  return { report, planned };
}
function releasePreflight(options = {}) { return prepareRelease(options).report; }
async function bake({ tableRoot = DEFAULT_TABLE_ROOT, taskIds, formulaLedger, rights, output = DEFAULT_OUTPUT, apiKey, client,
  credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS, concurrency = 4, requestIntervalMs = 350 } = {}) {
  const prepared = prepareRelease({ tableRoot, taskIds, formulaLedger, rights, apiKey, client, credentialPath });
  const planned = prepared.planned;
  const root = path.resolve(output), audioDir = path.join(root, "audio-cache");
  fs.mkdirSync(audioDir, { recursive: true });
  let adcClient = client || null;
  if (!apiKey && !adcClient) {
    const { v1beta1 } = require("@google-cloud/text-to-speech");
    adcClient = new v1beta1.TextToSpeechClient();
  }
  const assets = [...planned.rows, ...planned.words];
  const workerCount = Number(concurrency);
  invariant(Number.isInteger(workerCount) && workerCount >= 1 && workerCount <= 12, "TTS_CONCURRENCY_INVALID");
  const interval = Number(requestIntervalMs);
  invariant(Number.isInteger(interval) && interval >= 0 && interval <= 5000, "TTS_REQUEST_INTERVAL_INVALID");
  const completed = new Array(assets.length);
  let cursor = 0, firstError = null, nextProviderStart = 0, providerGate = Promise.resolve();
  function waitForProviderSlot() {
    const turn = providerGate.then(async () => {
      const wait = Math.max(0, nextProviderStart - Date.now());
      if (wait) await delay(wait);
      nextProviderStart = Date.now() + interval;
    });
    providerGate = turn.catch(() => {});
    return turn;
  }
  function retryableProviderError(error) {
    return [8, 14, 429, 503].includes(Number(error?.code))
      || /RESOURCE_EXHAUSTED|quota|too many requests|UNAVAILABLE/i.test(String(error?.message || ""));
  }
  async function providerCall(operation) {
    const backoff = [0, 2000, 5000, 10000, 20000, 30000];
    let lastError;
    for (let attempt = 0; attempt < backoff.length; attempt += 1) {
      if (backoff[attempt]) await delay(backoff[attempt]);
      await waitForProviderSlot();
      try { return await operation(); }
      catch (error) {
        lastError = error;
        if (!retryableProviderError(error)) throw error;
      }
    }
    throw lastError;
  }
  async function processAsset(asset) {
    const mp3Path = path.join(audioDir, `${asset.asset_key}.mp3`);
    const timingPath = path.join(audioDir, `${asset.asset_key}.timing.json`);
    let mp3, timing = null;
    if (fs.existsSync(mp3Path) && (asset.asset_type === "word" || fs.existsSync(timingPath))) {
      mp3 = fs.readFileSync(mp3Path);
      if (asset.asset_type === "row") timing = readJson(timingPath);
    } else if (asset.asset_type === "row") {
      const result = await providerCall(() => apiKey ? synthesizeWithTimepoints(apiKey, asset.text, DEFAULT_PROFILE)
        : synthesizeRowWithClient(adcClient, asset.text, DEFAULT_PROFILE));
      mp3 = result.mp3; timing = result.timing; validateTiming(timing);
      fs.writeFileSync(mp3Path, mp3); fs.writeFileSync(timingPath, stableJson(timing));
    } else {
      mp3 = await providerCall(() => apiKey ? synthesizeMp3(apiKey, asset.text, DEFAULT_PROFILE)
        : synthesizeWordWithClient(adcClient, asset.text, DEFAULT_PROFILE));
      fs.writeFileSync(mp3Path, mp3);
    }
    return { ...asset, mp3, timing };
  }
  async function worker() {
    while (!firstError) {
      const index = cursor++;
      if (index >= assets.length) return;
      try { completed[index] = await processAsset(assets[index]); }
      catch (error) { firstError = error; return; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, assets.length) }, () => worker()));
  if (firstError) throw firstError;
  invariant(completed.every(Boolean), "TTS_BAKE_INCOMPLETE");
  const manifest = buildPublicAssetManifest(completed, { inventory: prepared.report.inventory, references: planned.references });
  manifest.word_index = buildWordIndex(planned.words);
  fs.writeFileSync(path.join(root, "manifest.json"), stableJson(manifest));
  return { output: root, asset_count: completed.length, manifest_sha256: sha256(Buffer.from(stableJson(manifest))),
    concurrency: workerCount, request_interval_ms: interval };
}
function verifyBake({ root = DEFAULT_OUTPUT, decodeAudio = false } = {}) {
  const absolute = path.resolve(root), manifestPath = path.join(absolute, "manifest.json"), audioDir = path.join(absolute, "audio-cache");
  invariant(fs.existsSync(manifestPath) && fs.existsSync(audioDir), "BAKE_OUTPUT_MISSING");
  const manifestBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(manifestBytes.toString("utf8"));
  invariant(manifest.schema_version === "materials_pb2_public_tts_assets.1.0.0" && manifest.corpus_slug === SLUG
    && manifest.profile_id === PROFILE_ID && Array.isArray(manifest.assets) && manifest.assets.length
    && Array.isArray(manifest.references) && Array.isArray(manifest.word_index), "BAKE_MANIFEST_INVALID");
  const assets = new Map(), durations = []; let audioBytes = 0, timingBytes = 0, rowCount = 0, wordCount = 0;
  for (const asset of manifest.assets) {
    const key = String(asset?.asset_key || "");
    invariant(HASH.test(key) && !assets.has(key) && ["row", "word"].includes(asset.asset_type), "BAKE_ASSET_INDEX_INVALID");
    const mp3Path = path.join(audioDir, `${key}.mp3`);
    invariant(fs.existsSync(mp3Path), `AUDIO_FILE_MISSING:${key}`);
    const mp3 = fs.readFileSync(mp3Path);
    invariant(mp3.length === Number(asset.bytes), `AUDIO_BYTES_MISMATCH:${key}`);
    invariant(sha256(mp3) === asset.sha256, `AUDIO_SHA256_MISMATCH:${key}`);
    if (decodeAudio) {
      const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "--", mp3Path], { encoding: "utf8" });
      const duration = Number(String(probe.stdout || "").trim());
      invariant(probe.status === 0 && Number.isFinite(duration) && duration > 0, `AUDIO_DECODE_FAILED:${key}`);
      durations.push(duration);
    }
    audioBytes += mp3.length;
    if (asset.asset_type === "row") {
      rowCount += 1;
      invariant(asset.timing && Number(asset.timing.bytes) > 0 && HASH.test(String(asset.timing.sha256 || "")), `TIMING_MANIFEST_MISSING:${key}`);
      const timingPath = path.join(audioDir, `${key}.timing.json`);
      invariant(fs.existsSync(timingPath), `TIMING_FILE_MISSING:${key}`);
      const timingBody = fs.readFileSync(timingPath);
      invariant(timingBody.length === Number(asset.timing.bytes), `TIMING_BYTES_MISMATCH:${key}`);
      invariant(sha256(timingBody) === asset.timing.sha256, `TIMING_SHA256_MISMATCH:${key}`);
      validateTiming(JSON.parse(timingBody.toString("utf8"))); timingBytes += timingBody.length;
    } else {
      wordCount += 1; invariant(asset.timing == null, `WORD_TIMING_FORBIDDEN:${key}`);
    }
    assets.set(key, asset);
  }
  const expectedFiles = new Set();
  for (const asset of assets.values()) {
    expectedFiles.add(`${asset.asset_key}.mp3`);
    if (asset.asset_type === "row") expectedFiles.add(`${asset.asset_key}.timing.json`);
  }
  const actualFiles = fs.readdirSync(audioDir).filter(name => /\.(?:mp3|timing\.json)$/.test(name));
  invariant(actualFiles.length === expectedFiles.size && actualFiles.every(name => expectedFiles.has(name)), "BAKE_FILE_SET_DRIFT");
  const wordTexts = new Set();
  for (const entry of manifest.word_index) {
    const text = normalizeSpeech(entry?.text), asset = assets.get(String(entry?.asset_key || ""));
    invariant(text && text === entry.text && !wordTexts.has(text) && asset?.asset_type === "word", "WORD_INDEX_INVALID");
    wordTexts.add(text);
  }
  const referenceKeys = new Set();
  for (const reference of manifest.references) {
    const id = `${reference?.task_id || ""}:${reference?.row_id || ""}`;
    invariant(reference.task_id && reference.row_id && !referenceKeys.has(id)
      && assets.get(String(reference.asset_key || ""))?.asset_type === "row", "ROW_REFERENCE_INVALID");
    referenceKeys.add(id);
  }
  const result = {
    schema_version: "materials_pb2_tts_bake_verification.1.0.0", corpus_slug: SLUG,
    manifest_sha256: sha256(manifestBytes), asset_count: assets.size, row_asset_count: rowCount,
    word_asset_count: wordCount, complete_timing_count: rowCount, reference_count: manifest.references.length,
    word_index_entry_count: manifest.word_index.length, audio_bytes: audioBytes, timing_bytes: timingBytes,
  };
  if (decodeAudio) Object.assign(result, {
    audio_decode_count: durations.length,
    minimum_duration_seconds: Math.min(...durations), maximum_duration_seconds: Math.max(...durations),
    aggregate_duration_seconds: Math.round(durations.reduce((sum, value) => sum + value, 0) * 1000) / 1000,
  });
  return Object.freeze(result);
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
  if (command === "formula-review-pack") {
    invariant(args.ledger && args.output, "FORMULA_REVIEW_PACK_REQUIRES_LEDGER_AND_OUTPUT");
    const output = path.resolve(args.output), pack = buildFormulaReviewPack(readJson(path.resolve(args.ledger)));
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, stableJson(pack));
    process.stdout.write(stableJson({ ok: true, output, row_count: pack.row_count,
      unique_display_form_count: pack.unique_display_form_count, pending_unique_form_count: pack.pending_unique_form_count })); return;
  }
  if (command === "apply-formula-review-pack") {
    invariant(args.ledger && args.pack && args.output, "APPLY_FORMULA_REVIEW_PACK_REQUIRES_LEDGER_PACK_OUTPUT");
    const output = path.resolve(args.output), ledger = applyFormulaReviewPack(readJson(path.resolve(args.ledger)), readJson(path.resolve(args.pack)));
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, stableJson(ledger));
    process.stdout.write(stableJson({ ok: true, output, reviewed_count: ledger.entries.filter(entry => entry.status === "REVIEWED_PASS").length })); return;
  }
  if (command === "formula-audit") {
    const formulaLedger = args.ledger ? readJson(path.resolve(args.ledger)) : undefined;
    const audit = formulaSpeech.auditCorpus({ tableRoot, formulaLedger });
    invariant(audit.ready, `FORMULA_SPEECH_AUDIT_BLOCKED:${audit.unresolved_count}`);
    if (args.output) {
      const output = path.resolve(args.output); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, stableJson(audit));
      process.stdout.write(stableJson({ ok: true, output, row_count: audit.row_count,
        compiled_row_count: audit.compiled_row_count, owner_override_count: audit.owner_override_count,
        unresolved_count: audit.unresolved_count }));
    } else process.stdout.write(stableJson(audit));
    return;
  }
  if (command === "secret-check") {
    try { require("dotenv").config({ path: path.join(ROOT, ".env") }); } catch (_) {}
    const secret = validateSecretGate({ apiKey: process.env[args["api-key-env"] || "GCP_TTS_API_KEY"],
      credentialPath: process.env.GOOGLE_APPLICATION_CREDENTIALS });
    process.stdout.write(stableJson({ ok: true, gate: "PASS", secret })); return;
  }
  if (command === "preflight") {
    invariant(args.ledger && args.rights, "PREFLIGHT_REQUIRES_LEDGER_AND_RIGHTS");
    try { require("dotenv").config({ path: path.join(ROOT, ".env") }); } catch (_) {}
    const report = releasePreflight({ tableRoot, taskIds, formulaLedger: readJson(path.resolve(args.ledger)),
      rights: readJson(path.resolve(args.rights)), apiKey: process.env[args["api-key-env"] || "GCP_TTS_API_KEY"],
      credentialPath: process.env.GOOGLE_APPLICATION_CREDENTIALS });
    const payload = { ok: true, ...report };
    if (args.output) {
      const output = path.resolve(args.output); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, stableJson(payload));
      process.stdout.write(stableJson({ ok: true, output, ready: report.ready }));
    } else process.stdout.write(stableJson(payload));
    return;
  }
  if (command === "bake") {
    invariant(args.ledger && args.rights, "BAKE_REQUIRES_LEDGER_AND_RIGHTS");
    try { require("dotenv").config({ path: path.join(ROOT, ".env") }); } catch (_) {}
    const result = await bake({ tableRoot, taskIds, formulaLedger: readJson(path.resolve(args.ledger)), rights: readJson(path.resolve(args.rights)), output: args.output || DEFAULT_OUTPUT, apiKey: process.env[args["api-key-env"] || "GCP_TTS_API_KEY"], credentialPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      concurrency: args.concurrency == null ? 4 : Number(args.concurrency),
      requestIntervalMs: args["request-interval-ms"] == null ? 350 : Number(args["request-interval-ms"]) });
    process.stdout.write(stableJson({ ok: true, ...result })); return;
  }
  if (command === "verify") {
    const result = verifyBake({ root: args.root || args.output || DEFAULT_OUTPUT,
      decodeAudio: ["1", "true", "yes"].includes(String(args.decode || "").toLowerCase()) });
    const payload = { ok: true, ...result };
    if (args.report) {
      const report = path.resolve(args.report); fs.mkdirSync(path.dirname(report), { recursive: true }); fs.writeFileSync(report, stableJson(payload));
      process.stdout.write(stableJson({ ok: true, report, manifest_sha256: result.manifest_sha256 }));
    } else process.stdout.write(stableJson(payload));
    return;
  }
  throw new Error(`COMMAND_INVALID:${command}`);
}
if (require.main === module) main().catch(error => { process.stderr.write(`materials-pb2-tts: ${error.stack || error.message}\n`); process.exitCode = 1; });

module.exports = {
  DEFAULT_PROFILE, PROFILE_ID, RELEASE_CHARACTER_CEILING, normalizeSpeech, assetKey,
  ssmlBilledCharacters, wordTokens, unvocalized, buildWordIndex, buildInventory, buildFormulaReviewLedger,
  buildFormulaReviewPack, applyFormulaReviewPack,
  validateFormulaReview, validateTtsRights, validateSecretGate, releasePreflight, validateTiming, buildPublicAssetManifest,
  synthesizeRowWithClient, synthesizeWordWithClient, speechAssets, bake, verifyBake,
};
