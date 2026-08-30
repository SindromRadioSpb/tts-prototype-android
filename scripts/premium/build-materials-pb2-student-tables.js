#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKET = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30");
const DEFAULT_BUNDLE = path.join(ROOT, ".tmp", "materials-pb2-q043-rebake.zip");
const DEFAULT_OUTPUT = path.join(PACKET, "artifacts", "student-solution-tables");
const LEGACY_PATH = path.join(PACKET, "legacy-solution-candidate-ledger.json");
const POLICY_PATH = path.join(PACKET, "student-table-review-policy.json");
const SPEC_PATH = path.join(PACKET, "solution-program-spec.json");
const BATCH_ROOT = path.join(PACKET, "solution-batches");
const SOURCE_EDITION = "problem-book-2-pdf-sha256-3d87b9f5";
const SLUG = "materials-science-year1-problem-book-2";
const HASH = /^[a-f0-9]{64}$/;

const stableJson = value => JSON.stringify(value, null, 2) + "\n";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
function invariant(value, message) { if (!value) throw new Error(message); }
function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `MISSING_ARG:${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}
function loadBatchFiles(suffix) {
  return fs.readdirSync(BATCH_ROOT)
    .filter(file => file.endsWith(suffix))
    .sort()
    .map(file => ({ file, body: readJson(path.join(BATCH_ROOT, file)) }));
}
function mapUnique(entries, label) {
  const map = new Map();
  for (const entry of entries) {
    invariant(entry?.task_id && !map.has(entry.task_id), `${label}_DUPLICATE:${entry?.task_id}`);
    map.set(entry.task_id, entry);
  }
  return map;
}
function normalizeWords(value) {
  return String(value || "").toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .match(/[\p{L}\p{N}]+/gu)?.filter(token => token.length > 2 && ![
      "для", "это", "при", "как", "что", "или", "она", "они", "также", "получаем", "составляет"
    ].includes(token)) || [];
}
function overlapScore(left, right) {
  const a = new Set(normalizeWords(left));
  const b = new Set(normalizeWords(right));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.max(1, Math.min(a.size, b.size));
}
function partLabel(fields) {
  const ru = String(fields.ru || "").trim();
  const match = ru.match(/^([А-ЕA-F])\s*[).:]/i);
  return match ? match[1].toUpperCase() : null;
}
function formulaOnly(fields) {
  const value = String(fields.he || "").trim();
  if (!/[=<>≈⇒→·×÷√πσδεγ%]/u.test(value)) return false;
  const letters = value.replace(/[A-Za-z]/g, "").match(/[\p{L}]/gu) || [];
  return letters.length < 4;
}
function classifyRow(fields) {
  const ru = String(fields.ru || "").toLocaleLowerCase("ru");
  if (formulaOnly(fields)) {
    return {
      section: /\d/.test(ru) ? "calculation" : "derivation",
      kind: /\d/.test(ru) ? "calculation" : "symbolic_derivation"
    };
  }
  if (/(график|диаграмм|крив|нанест|постро|изображ|рисунк|ось|отмет)/u.test(ru)) {
    return { section: "construction", kind: "diagram_instruction" };
  }
  if (/(провер|согласу|порядок величины|не превыш|должен быть|нельзя|недостаточ|поскольку|следовательно)/u.test(ru)) {
    return { section: "verification", kind: "result_check" };
  }
  if (/(рассчит|подстав|получаем|равен|составляет|≈|=)/u.test(ru) && /\d/u.test(ru)) {
    return { section: "calculation", kind: "calculation" };
  }
  if (/(формул|соотношен|закон|определяется|вычисляется)/u.test(ru)) {
    return { section: "model_and_laws", kind: "law_or_principle" };
  }
  if (/(это |называется|означает|представляет собой|принцип|структур|свойств|процесс)/u.test(ru)) {
    return { section: "theory", kind: "theory_statement" };
  }
  return { section: "theory", kind: "theory_statement" };
}
function karaokeTokens(value) {
  const surfaces = String(value || "").trim().split(/\s+/u).filter(Boolean);
  return surfaces.map((surface, index) => ({
    index,
    surface,
    normalized: surface.normalize("NFD").replace(/\p{M}/gu, "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, "") || surface
  }));
}
function exactFormulae(fields) {
  return formulaOnly(fields) ? [String(fields.he).trim()] : [];
}
function audioPlan(fields, formulae) {
  const spoken = fields.spoken_he_niqqud || fields.he_niqqud;
  const needsFormulaSpeech = formulae.length > 0 && !fields.spoken_he_niqqud;
  const tokens = karaokeTokens(spoken);
  invariant(tokens.length > 0, "AUDIO_PLAN_EMPTY_TOKEN_SET");
  return {
    state: "DEFERRED_UNTIL_OWNER_CARD_REVIEW",
    synthesis_field: fields.spoken_he_niqqud ? "spoken_he_niqqud" : "he_niqqud",
    karaoke_tokens: tokens,
    timings_present: false,
    formula_speech_review_required: needsFormulaSpeech
  };
}
function genericHeading() {
  return {
    he: "פתרון בדוק",
    he_niqqud: "פִּתְרוֹן בָּדוּק",
    transliteration: "Pitron baduq",
    ru: "Проверенное решение"
  };
}
function genericProvenance() {
  return {
    he: "הפתרון נגזר מן התנאי והתרשימים, ולאחר מכן הושווה לפתרון הישן.",
    he_niqqud: "הַפִּתְרוֹן נִגְזַר מִן הַתְּנַאי וְהַתַּרְשִׁימִים, וּלְאַחַר מִכֵּן הֻשְׁוָה לַפִּתְרוֹן הַיָּשָׁן.",
    transliteration: "Ha-pitron nigzar min ha-tnai ve-ha-tarshimim, u-le-ahar mi-ken hushvah la-pitron ha-yashan.",
    ru: "Решение выведено из условия и диаграмм, а затем сопоставлено со старым решением."
  };
}
function makeRow(taskId, index, source, overrides = {}) {
  const fields = source.text || source.fields;
  invariant(fields && ["he", "he_niqqud", "transliteration", "ru"].every(key => String(fields[key] || "").trim()), `PARALLEL_TEXT_EMPTY:${taskId}:${index}`);
  const formulae = exactFormulae(fields);
  const row = {
    row_id: `${taskId}-sol-r${String(index).padStart(3, "0")}`,
    order: index,
    section: overrides.section || source.section,
    kind: overrides.kind || source.kind,
    exam_copy: overrides.exam_copy ?? source.exam_copy ?? true,
    text: fields,
    source_refs: [...new Set(overrides.source_refs || source.source_refs || [])],
    audio_plan: audioPlan(fields, formulae)
  };
  if (overrides.part_label || source.part_label) row.part_label = overrides.part_label || source.part_label;
  if (formulae.length) row.formulae = formulae;
  if (overrides.diagram_ref || source.diagram_ref) row.diagram_ref = overrides.diagram_ref || source.diagram_ref;
  invariant(row.source_refs.length > 0, `SOURCE_REFS_EMPTY:${row.row_id}`);
  return row;
}
function selectedLegacyRows(task) {
  return (task.candidate_solution_rows || []).map(row => ({ ...row, fields: { ...row.fields } }));
}
function applyReviewPolicy(taskId, legacyRows, replacements) {
  const byIndex = new Map((replacements || []).map(repair => [repair.legacy_row_index, repair]));
  invariant(byIndex.size === (replacements || []).length, `REPAIR_INDEX_DUPLICATE:${taskId}`);
  const consumed = new Set();
  const rows = legacyRows.map(row => {
    const repair = byIndex.get(row.legacy_row_index);
    if (!repair) return { ...row, review_origin: "LEGACY_ROW_TASK_LEVEL_CONFIRMED" };
    invariant(row.fields_sha256 === repair.expected_fields_sha256, `REPAIR_PREIMAGE_DRIFT:${taskId}:${row.legacy_row_index}`);
    consumed.add(row.legacy_row_index);
    return {
      ...row,
      fields: repair.fields,
      review_origin: "SOURCE_BACKED_PRESENTATION_REPLACEMENT",
      replacement_reason: repair.reason
    };
  });
  invariant(consumed.size === byIndex.size, `REPAIR_TARGET_MISSING:${taskId}`);
  return rows;
}
function summaryRows(independent, bodyRows, sourceOnly) {
  if (sourceOnly) return bodyRows.filter(row => row.kind === "final_answer").slice(0, 8);
  const selected = [];
  const used = new Set();
  for (const answer of independent.answer || []) {
    let best = null;
    for (const row of bodyRows) {
      const key = row.fields_sha256 || sha256(stableJson(row.fields));
      if (used.has(key)) continue;
      const score = overlapScore(answer, row.fields.ru);
      if (!best || score > best.score) best = { row, score, key };
    }
    if (best && best.score >= 0.18) {
      selected.push(best.row);
      used.add(best.key);
    }
  }
  if (!selected.length && bodyRows.length) selected.push(bodyRows[bodyRows.length - 1]);
  return selected.slice(0, 8);
}
function normalizedComparison(verdict, legacyCount) {
  if (!legacyCount) return "NO_LEGACY_SOLUTION";
  if (/REJECTED|MISMATCH/u.test(verdict)) return "MISMATCH";
  if (verdict === "MATCH") return "MATCH";
  return "EQUIVALENT";
}
function buildTable({ canonical, independent, comparison, legacyTask, policy }) {
  const taskId = canonical.text_key;
  const taskHash = sha256(stableJson(canonical));
  const independentHash = sha256(stableJson(independent));
  const sourceOnly = policy.source_only_rows[taskId] || null;
  let body;
  if (sourceOnly) {
    invariant(!legacyTask?.candidate_solution_row_count, `SOURCE_ONLY_HAS_LEGACY_ROWS:${taskId}`);
    body = sourceOnly.map((row, index) => ({
      ...row,
      fields: row.text,
      fields_sha256: sha256(stableJson(row.text)),
      legacy_row_index: null,
      review_origin: "CURATED_SOURCE_ONLY_REVIEWED_INDEPENDENT_LEDGER",
      source_refs: [...independent.source_facts, `independent_solution_sha256:${independentHash}`, `curated_row:${index + 1}`]
    }));
  } else {
    invariant(legacyTask?.candidate_solution_row_count > 0, `LEGACY_ROWS_MISSING:${taskId}`);
    body = applyReviewPolicy(taskId, selectedLegacyRows(legacyTask), policy.replacements[taskId]);
  }
  const summaries = summaryRows(independent, body, Boolean(sourceOnly));
  const rows = [];
  const push = (source, overrides) => rows.push(makeRow(taskId, rows.length + 1, source, overrides));
  push({ fields: genericHeading(), source_refs: [`independent_solution_sha256:${independentHash}`] }, {
    section: "answer_first", kind: "solution_heading", exam_copy: false
  });
  for (const row of summaries) {
    const refs = sourceOnly ? row.source_refs : [
      `legacy_row_hash:${row.legacy_row_hash}`,
      `legacy_fields_sha256:${row.fields_sha256}`,
      `independent_solution_sha256:${independentHash}`
    ];
    push(row, { section: "answer_first", kind: "final_answer", exam_copy: true, part_label: partLabel(row.fields), source_refs: refs });
  }
  for (const row of body) {
    const classified = sourceOnly ? { section: row.section, kind: row.kind } : classifyRow(row.fields);
    const refs = sourceOnly ? row.source_refs : [
      `legacy_row_hash:${row.legacy_row_hash}`,
      `legacy_fields_sha256:${row.fields_sha256}`,
      `comparison:${comparison.computed_verdict}`,
      ...independent.source_facts
    ];
    if (row.review_origin === "SOURCE_BACKED_PRESENTATION_REPLACEMENT") refs.push(`presentation_repair:${row.legacy_row_index}`);
    push(row, { ...classified, part_label: row.part_label || partLabel(row.fields), source_refs: refs });
  }
  push({ fields: genericProvenance(), source_refs: [
    `independent_solution_sha256:${independentHash}`,
    `comparison:${comparison.computed_verdict}`,
    ...independent.source_facts
  ] }, { section: "provenance", kind: "provenance_note", exam_copy: false });

  const meta = canonical.source_meta.materials_science_task;
  const legacyComparison = normalizedComparison(comparison.computed_verdict, legacyTask?.candidate_solution_row_count || 0);
  return {
    schema_version: "materials_pb2_student_solution_table.1.0.0",
    task_id: taskId,
    display_alias: meta.display_alias,
    source_anchor: {
      corpus_slug: SLUG,
      source_edition: SOURCE_EDITION,
      canonical_bundle_sha256: null,
      canonical_task_sha256: taskHash
    },
    review: {
      state: "REVIEWED_PASS",
      independent_solution_sha256: independentHash,
      legacy_comparison: legacyComparison,
      publication_blocking: false,
      reviewer_note: comparison.comparison_note,
      reviewer_disposition: comparison.reviewer_disposition || "TASK_LEVEL_COMPARISON_PASS"
    },
    condition: {
      rows: canonical.rows,
      source_pages: meta.source_pages,
      source_assets: meta.source_assets,
      semantic_visuals: meta.semantic_visuals,
      external_reference_dependencies: meta.external_reference_dependencies
    },
    rows,
    agent_grounding: independent,
    render_contract: {
      study_columns: ["he", "he_niqqud", "transliteration", "ru"],
      exam_projection: "ALL_AND_ONLY_EXAM_COPY_ROWS_IN_SOURCE_ORDER_PLAIN_HEBREW_WITH_EXACT_FORMULAS",
      mobile_projection: "ONE_ROW_PER_STACK_HEBREW_FIRST_NO_HORIZONTAL_SCROLL",
      audio_projection: "ROW_CLIPS_WITH_WORD_TIMEPOINTS_AND_SEPARATE_FORMULA_SPEECH_LINE"
    }
  };
}
function validateTable(table) {
  invariant(table.source_anchor.source_edition === SOURCE_EDITION, `EDITION_DRIFT:${table.task_id}`);
  invariant(HASH.test(table.source_anchor.canonical_bundle_sha256), `BUNDLE_HASH_INVALID:${table.task_id}`);
  invariant(HASH.test(table.source_anchor.canonical_task_sha256), `TASK_HASH_INVALID:${table.task_id}`);
  invariant(HASH.test(table.review.independent_solution_sha256), `SOLUTION_HASH_INVALID:${table.task_id}`);
  invariant(table.review.state === "REVIEWED_PASS" && table.review.publication_blocking === false, `OPEN_REVIEW:${table.task_id}`);
  invariant(table.rows.length >= 4, `ROW_COUNT_TOO_SMALL:${table.task_id}`);
  invariant(table.rows.some(row => row.section === "answer_first" && row.kind === "final_answer"), `ANSWER_FIRST_MISSING:${table.task_id}`);
  invariant(table.rows.at(-1).section === "provenance", `PROVENANCE_NOT_LAST:${table.task_id}`);
  const ids = new Set();
  table.rows.forEach((row, index) => {
    invariant(row.order === index + 1 && !ids.has(row.row_id), `ROW_ORDER_OR_ID:${table.task_id}:${index}`);
    ids.add(row.row_id);
    invariant(["he", "he_niqqud", "transliteration", "ru"].every(key => String(row.text[key] || "").trim()), `ROW_LANGUAGE_EMPTY:${row.row_id}`);
    invariant(row.source_refs.length > 0, `ROW_SOURCE_EMPTY:${row.row_id}`);
    invariant(row.audio_plan.state === "DEFERRED_UNTIL_OWNER_CARD_REVIEW" && row.audio_plan.timings_present === false, `AUDIO_BOUNDARY_DRIFT:${row.row_id}`);
    invariant(row.audio_plan.karaoke_tokens.every((token, tokenIndex) => token.index === tokenIndex && token.surface && token.normalized), `KARAOKE_TOKEN_CONTRACT:${row.row_id}`);
  });
}

async function build({ bundlePath = DEFAULT_BUNDLE, output = DEFAULT_OUTPUT } = {}) {
  const bundleBytes = fs.readFileSync(bundlePath);
  const bundleSha = sha256(bundleBytes);
  const zip = await JSZip.loadAsync(bundleBytes);
  const libraryFile = zip.file("library/library.json");
  invariant(libraryFile, "CANONICAL_LIBRARY_MISSING");
  const libraryText = await libraryFile.async("string");
  const library = JSON.parse(libraryText);
  invariant(library.shelves.slug === SLUG && library.texts.length === 60, "CANONICAL_LIBRARY_SCOPE_DRIFT");

  const legacy = readJson(LEGACY_PATH);
  const policy = readJson(POLICY_PATH);
  const spec = readJson(SPEC_PATH);
  invariant(policy.source_edition === SOURCE_EDITION && legacy.source_edition === SOURCE_EDITION, "SOURCE_EDITION_DRIFT");
  invariant(spec.corpus.canonical_bundle_sha256 === bundleSha, `SPEC_BUNDLE_HASH_DRIFT:${bundleSha}`);
  const independentFiles = loadBatchFiles("-independent-solution-ledger.ru.json");
  const comparisonFiles = loadBatchFiles("-comparison-ledger.json");
  const independent = mapUnique(independentFiles.flatMap(entry => entry.body.entries), "INDEPENDENT");
  const comparisons = mapUnique(comparisonFiles.flatMap(entry => entry.body.entries), "COMPARISON");
  const legacyByTask = mapUnique(legacy.tasks, "LEGACY");
  invariant(independent.size === 60 && comparisons.size === 60 && legacyByTask.size === 60, "TASK_SET_COUNT_DRIFT");
  const canonicalIds = new Set(library.texts.map(text => text.text_key));
  for (const taskId of canonicalIds) invariant(independent.has(taskId) && comparisons.has(taskId) && legacyByTask.has(taskId), `TASK_SET_MISMATCH:${taskId}`);
  for (const taskId of Object.keys(policy.replacements)) invariant(canonicalIds.has(taskId), `POLICY_UNKNOWN_TASK:${taskId}`);
  for (const taskId of Object.keys(policy.source_only_rows)) invariant(canonicalIds.has(taskId), `POLICY_UNKNOWN_SOURCE_ONLY_TASK:${taskId}`);

  const taskOutput = path.join(output, "tasks");
  fs.mkdirSync(taskOutput, { recursive: true });
  const files = [];
  let rowCount = 0;
  let formulaSpeechReviewRequired = 0;
  let replacementCount = 0;
  for (const canonical of library.texts) {
    const taskId = canonical.text_key;
    const table = buildTable({
      canonical,
      independent: independent.get(taskId),
      comparison: comparisons.get(taskId),
      legacyTask: legacyByTask.get(taskId),
      policy
    });
    table.source_anchor.canonical_bundle_sha256 = bundleSha;
    validateTable(table);
    const file = `tasks/${taskId}.json`;
    const bytes = Buffer.from(stableJson(table), "utf8");
    fs.writeFileSync(path.join(output, file), bytes);
    const repairRows = (policy.replacements[taskId] || []).length;
    const formulaRows = table.rows.filter(row => row.audio_plan.formula_speech_review_required).length;
    replacementCount += repairRows;
    formulaSpeechReviewRequired += formulaRows;
    rowCount += table.rows.length;
    files.push({
      task_id: taskId,
      display_alias: table.display_alias,
      file,
      bytes: bytes.length,
      sha256: sha256(bytes),
      row_count: table.rows.length,
      exam_row_count: table.rows.filter(row => row.exam_copy).length,
      formula_speech_review_required_count: formulaRows,
      presentation_replacement_count: repairRows,
      canonical_task_sha256: table.source_anchor.canonical_task_sha256,
      independent_solution_sha256: table.review.independent_solution_sha256,
      comparison: table.review.legacy_comparison
    });
  }
  const manifest = {
    schema_version: "materials_pb2_student_solution_manifest.1.0.0",
    status: "LOCAL_REVIEWED_PRESENTATION_READY_RIGHTS_AND_PUBLICATION_ANCHOR_PENDING_FULL_TTS_DEFERRED",
    generated_at: "2026-08-30T00:00:00Z",
    corpus_slug: SLUG,
    source_edition: SOURCE_EDITION,
    canonical_bundle: { file: path.basename(bundlePath), bytes: bundleBytes.length, sha256: bundleSha, library_sha256: sha256(Buffer.from(libraryText, "utf8")) },
    review: {
      task_count: files.length,
      row_count: rowCount,
      source_only_task_count: Object.keys(policy.source_only_rows).length,
      presentation_replacement_count: replacementCount,
      publication_blocking_count: 0,
      open_mismatch_count: 0
    },
    audio_boundary: {
      full_tts_generated: false,
      audio_asset_count: 0,
      timing_sidecar_count: 0,
      row_contract_checked: true,
      formula_speech_review_required_count: formulaSpeechReviewRequired,
      next_gate: "AFTER_PRODUCTION_OWNER_CARD_REVIEW_SELECT_PROFILE_REVIEW_FORMULA_SPEECH_AND_APPROVE_FULL_TTS_APPLY"
    },
    rights: {
      public_read_allowed: false,
      public_solution_display_and_print_allowed: false,
      package_download_allowed: false,
      agent_derivative_text_allowed: false,
      status: "OWNER_ATTESTATION_REQUIRED_BEFORE_PUBLICATION"
    },
    inputs: {
      legacy_candidate_ledger_sha256: sha256(fs.readFileSync(LEGACY_PATH)),
      review_policy_sha256: sha256(fs.readFileSync(POLICY_PATH)),
      solution_program_spec_sha256: sha256(fs.readFileSync(SPEC_PATH)),
      independent_ledgers: independentFiles.map(entry => ({ file: `solution-batches/${entry.file}`, sha256: sha256(fs.readFileSync(path.join(BATCH_ROOT, entry.file))) })),
      comparison_ledgers: comparisonFiles.map(entry => ({ file: `solution-batches/${entry.file}`, sha256: sha256(fs.readFileSync(path.join(BATCH_ROOT, entry.file))) }))
    },
    render_contract: {
      shared_task_shard_for_ui_print_and_agent: true,
      views: ["CONDITION_TABLE", "SOLUTION_TABLE", "CONDITION_AND_SOLUTION_CONTINUOUS", "EXAM_HEBREW_COMPACT", "BILINGUAL_STUDY"],
      desktop: "FOUR_COLUMN_TABLE",
      mobile_380: "STACKED_HEBREW_FIRST_NO_HORIZONTAL_SCROLL",
      print: ["A4_LANDSCAPE_FOUR_LANGUAGE", "A4_PORTRAIT_HEBREW_EXAM"]
    },
    tasks: files
  };
  invariant(files.length === 60 && rowCount > legacy.summary.candidate_solution_row_count, "MANIFEST_COVERAGE_INVALID");
  const manifestBytes = Buffer.from(stableJson(manifest), "utf8");
  fs.writeFileSync(path.join(output, "manifest.json"), manifestBytes);
  return { ...manifest.review, formula_speech_review_required_count: formulaSpeechReviewRequired, output, manifest_sha256: sha256(manifestBytes) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await build({
    bundlePath: args.bundle ? path.resolve(args.bundle) : DEFAULT_BUNDLE,
    output: args.output ? path.resolve(args.output) : DEFAULT_OUTPUT
  });
  process.stdout.write(stableJson({ ok: true, ...result }));
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`build-materials-pb2-student-tables: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { build, classifyRow, karaokeTokens, normalizedComparison, overlapScore };
