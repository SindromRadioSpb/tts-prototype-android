#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_RESEARCH = path.join(
  ROOT,
  "docs",
  "research",
  "materials-science-problem-solutions",
  "2026-08-30"
);
const DEFAULT_MAPPING = path.join(
  ROOT,
  "docs",
  "research",
  "materials-science-problem-corpus",
  "2026-08-30",
  "prepare",
  "reviewed-legacy-row-mapping.json"
);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("he")
    .replace(/[־–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bigrams(value) {
  const compact = normalizeText(value).replace(/\s+/g, " ");
  if (compact.length < 2) return compact ? [compact] : [];
  const result = [];
  for (let i = 0; i < compact.length - 1; i += 1) result.push(compact.slice(i, i + 2));
  return result;
}

function diceSimilarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  for (const gram of left) counts.set(gram, (counts.get(gram) || 0) + 1);
  let overlap = 0;
  for (const gram of right) {
    const count = counts.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

function rowSimilarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (Math.min(left.length, right.length) >= 8 && (left.includes(right) || right.includes(left))) {
    return 0.96 * (Math.min(left.length, right.length) / Math.max(left.length, right.length)) + 0.04;
  }
  return diceSimilarity(left, right);
}

function isSolutionHeading(row) {
  const he = normalizeText(row.he_plain || row.hebrew_plain);
  const ru = normalizeText(row.ru || row.russian);
  return /^(פתרון|פיתרון|תשובה|פתרונות)$/.test(he) || /^(решение|ответ|решения)$/.test(ru);
}

function isStructuralCanonicalRow(row) {
  const kind = row?.meta?.materials_science?.kind;
  return !["task_heading", "source_note"].includes(kind) && normalizeText(row.hebrew_plain).length >= 2;
}

function alignCanonicalRows(canonicalRows, legacyRows) {
  const source = canonicalRows.filter(isStructuralCanonicalRow);
  const matches = [];
  let cursor = 0;

  for (const canonical of source) {
    let selected = null;
    for (let i = cursor; i < legacyRows.length; i += 1) {
      const score = rowSimilarity(canonical.hebrew_plain, legacyRows[i].he_plain);
      if (score >= 0.9) {
        selected = { canonical_row_id: canonical.row_id, legacy_offset: i, score };
        break;
      }
      if (!selected || score > selected.score) {
        selected = { canonical_row_id: canonical.row_id, legacy_offset: i, score };
      }
    }
    if (selected && selected.score >= 0.72) {
      matches.push(selected);
      cursor = selected.legacy_offset + 1;
    }
  }

  const coverage = source.length ? matches.length / source.length : 0;
  const lastOffset = matches.length ? matches[matches.length - 1].legacy_offset : null;
  const tailMatched = source.length > 0 && matches.some((match) => match.canonical_row_id === source[source.length - 1].row_id);
  return {
    canonical_row_count: source.length,
    matched_row_count: matches.length,
    coverage: Number(coverage.toFixed(6)),
    tail_matched: tailMatched,
    last_legacy_offset: lastOffset,
    matches
  };
}

function determineBoundary(canonicalRows, legacyRows) {
  const explicitOffset = legacyRows.findIndex(isSolutionHeading);
  if (explicitOffset >= 0) {
    return {
      status: "BOUNDARY_ACCEPTED",
      method: "EXPLICIT_SOLUTION_HEADING",
      confidence: "HIGH",
      solution_heading_offset: explicitOffset,
      solution_start_offset: explicitOffset + 1,
      alignment: alignCanonicalRows(canonicalRows, legacyRows)
    };
  }

  const alignment = alignCanonicalRows(canonicalRows, legacyRows);
  if (alignment.last_legacy_offset !== null && alignment.coverage >= 0.8 && alignment.tail_matched) {
    return {
      status: "BOUNDARY_ACCEPTED",
      method: "CANONICAL_SEQUENCE_ALIGNMENT",
      confidence: "HIGH",
      solution_heading_offset: null,
      solution_start_offset: alignment.last_legacy_offset + 1,
      alignment
    };
  }
  if (alignment.last_legacy_offset !== null && alignment.coverage >= 0.6 && alignment.tail_matched) {
    return {
      status: "BOUNDARY_REVIEW_REQUIRED",
      method: "CANONICAL_SEQUENCE_ALIGNMENT",
      confidence: "MEDIUM",
      solution_heading_offset: null,
      solution_start_offset: alignment.last_legacy_offset + 1,
      alignment
    };
  }
  return {
    status: "BOUNDARY_REVIEW_REQUIRED",
    method: "INSUFFICIENT_ALIGNMENT",
    confidence: "LOW",
    solution_heading_offset: null,
    solution_start_offset: null,
    alignment
  };
}

function cleanCandidateRow(row, absoluteIndex) {
  const fields = {
    he: String(row.he_plain || ""),
    he_niqqud: String(row.he_niqqud || ""),
    transliteration: String(row.translit || ""),
    ru: String(row.ru || "")
  };
  return {
    legacy_row_index: absoluteIndex,
    legacy_row_id: row.id || null,
    legacy_row_hash: row.row_hash || sha256(stableJson(fields)),
    candidate_role: "LEGACY_SOLUTION_EVIDENCE_UNVALIDATED",
    fields,
    fields_sha256: sha256(stableJson(fields))
  };
}

function segmentRowsHash(rows) {
  return sha256(stableJson(rows.map((row) => ({
    he: String(row.he_plain || ""),
    he_niqqud: String(row.he_niqqud || ""),
    transliteration: String(row.translit || ""),
    ru: String(row.ru || "")
  }))));
}

function finalizeVariant(variant, { startOffset, selectionStatus, method, basis, componentLabel = null }) {
  if (!Number.isInteger(startOffset) || startOffset < 0 || startOffset > variant._segmentRows.length) {
    throw new Error(`Invalid solution boundary for ${variant.task_id}: ${startOffset}`);
  }
  const candidateRows = variant._segmentRows.slice(startOffset).map((row) => ({
    ...cleanCandidateRow(row, row.order_index),
    legacy_card_key_sha256: variant.legacy_card_key_sha256,
    component_label: componentLabel
  }));
  return {
    task_id: variant.task_id,
    legacy_card_title: variant.legacy_card_title,
    legacy_card_key_sha256: variant.legacy_card_key_sha256,
    segment: variant.segment,
    segment_rows_sha256: variant.segment_rows_sha256,
    selection_status: selectionStatus,
    component_label: componentLabel,
    boundary: {
      ...variant.boundary,
      status: "BOUNDARY_ACCEPTED",
      method,
      confidence: "HIGH",
      solution_start_offset: startOffset,
      disposition_basis: basis
    },
    candidate_solution_row_count: candidateRows.length,
    candidate_solution_rows: candidateRows
  };
}

function rejectedVariant(variant, selectionStatus, basis) {
  return {
    task_id: variant.task_id,
    legacy_card_title: variant.legacy_card_title,
    legacy_card_key_sha256: variant.legacy_card_key_sha256,
    segment: variant.segment,
    segment_rows_sha256: variant.segment_rows_sha256,
    selection_status: selectionStatus,
    boundary: variant.boundary,
    candidate_solution_row_count: 0,
    candidate_solution_rows: [],
    disposition_basis: basis
  };
}

function resolveTaskVariants(taskId, canonical, variants, policy = null) {
  const basis = policy?.basis || null;
  let selected = [];
  let presented = [];
  let disposition = policy?.type || "SINGLE_SEGMENT";

  if (policy?.type === "MANUAL_BOUNDARY") {
    if (variants.length !== 1 || variants[0].legacy_card_key_sha256 !== policy.legacy_card_key_sha256) {
      throw new Error(`Manual boundary policy does not match ${taskId}`);
    }
    selected = [finalizeVariant(variants[0], {
      startOffset: policy.solution_start_offset,
      selectionStatus: "SELECTED_MANUAL_BOUNDARY",
      method: "MANUAL_VISUAL_BOUNDARY_REVIEW",
      basis
    })];
    presented = selected;
  } else if (policy?.type === "EQUIVALENT_DUPLICATE") {
    const primary = variants.find((entry) => entry.legacy_card_key_sha256 === policy.selected_legacy_card_key_sha256);
    const duplicate = variants.find((entry) => entry.legacy_card_key_sha256 === policy.duplicate_legacy_card_key_sha256);
    if (!primary || !duplicate || segmentRowsHash(primary._segmentRows) !== segmentRowsHash(duplicate._segmentRows)) {
      throw new Error(`Equivalent duplicate policy failed content equality for ${taskId}`);
    }
    if (primary.boundary.status !== "BOUNDARY_ACCEPTED") throw new Error(`Selected duplicate boundary is not accepted for ${taskId}`);
    selected = [finalizeVariant(primary, {
      startOffset: primary.boundary.solution_start_offset,
      selectionStatus: "SELECTED_EQUIVALENT_DUPLICATE",
      method: primary.boundary.method,
      basis
    })];
    presented = [
      ...selected,
      rejectedVariant(duplicate, "REJECTED_BYTE_EQUIVALENT_DUPLICATE", basis)
    ];
  } else if (policy?.type === "SELECT_EXACT_LEGACY_CARD") {
    const primary = variants.find((entry) => entry.legacy_card_key_sha256 === policy.selected_legacy_card_key_sha256);
    const rejected = variants.find((entry) => entry.legacy_card_key_sha256 === policy.rejected_legacy_card_key_sha256);
    if (!primary || !rejected) throw new Error(`Exact legacy-card policy does not match ${taskId}`);
    if (primary.boundary.status !== "BOUNDARY_ACCEPTED") throw new Error(`Selected legacy boundary is not accepted for ${taskId}`);
    selected = [finalizeVariant(primary, {
      startOffset: primary.boundary.solution_start_offset,
      selectionStatus: "SELECTED_EXACT_SOURCE_MATCH",
      method: primary.boundary.method,
      basis
    })];
    presented = [
      ...selected,
      rejectedVariant(rejected, "REJECTED_CONFLICTING_SOURCE_VARIANT_NO_MERGE", basis)
    ];
  } else if (policy?.type === "COMPOSITE_ORDERED") {
    const structuralIds = new Set(canonical.rows.filter(isStructuralCanonicalRow).map((row) => row.row_id));
    const matchedIds = new Set();
    selected = policy.components.map((component, index) => {
      const variant = variants.find((entry) => entry.legacy_card_key_sha256 === component.legacy_card_key_sha256);
      if (!variant) throw new Error(`Composite component ${component.label} not found for ${taskId}`);
      for (const match of variant.boundary.alignment?.matches || []) matchedIds.add(match.canonical_row_id);
      return finalizeVariant(variant, {
        startOffset: component.solution_start_offset,
        selectionStatus: "SELECTED_COMPOSITE_COMPONENT",
        method: "OWNER_REVIEWED_COMPOSITE_BOUNDARY",
        basis,
        componentLabel: component.label || String(index + 1)
      });
    });
    if ([...structuralIds].some((id) => !matchedIds.has(id))) {
      throw new Error(`Composite components do not cover the canonical condition for ${taskId}`);
    }
    presented = selected;
  } else if (variants.length === 1 && variants[0].boundary.status === "BOUNDARY_ACCEPTED") {
    selected = [finalizeVariant(variants[0], {
      startOffset: variants[0].boundary.solution_start_offset,
      selectionStatus: "SELECTED_SINGLE_SEGMENT",
      method: variants[0].boundary.method,
      basis: "DETERMINISTIC_HIGH_CONFIDENCE_BOUNDARY"
    })];
    presented = selected;
  } else {
    disposition = variants.length === 1 ? "SINGLE_SEGMENT_REVIEW_REQUIRED" : "UNRESOLVED_MULTIPLE_VARIANTS";
    presented = variants.map((variant) => rejectedVariant(
      variant,
      "BOUNDARY_OR_VARIANT_REVIEW_REQUIRED",
      "NO_CANDIDATE_ROWS_ASSERTED_UNTIL_REVIEW"
    ));
  }

  const accepted = selected.length > 0;
  const candidateRows = selected.flatMap((variant) => variant.candidate_solution_rows);
  return {
    task_id: taskId,
    source_edition: `problem-book-2-pdf-sha256-${canonical.source_meta.materials_science_task.source_pdf_sha256.slice(0, 8)}`,
    legacy_disposition: {
      type: disposition,
      basis,
      selected_component_count: selected.length,
      observed_variant_count: variants.length
    },
    boundary_status: accepted ? "BOUNDARY_ACCEPTED" : "BOUNDARY_REVIEW_REQUIRED",
    legacy_variants: presented,
    candidate_solution_row_count: candidateRows.length,
    candidate_solution_rows: candidateRows,
    truth_status: accepted
      ? "LEGACY_SOLUTION_CANDIDATES_EXTRACTED_NOT_TRANSCRIBED_NOT_VERIFIED"
      : "LEGACY_BOUNDARY_REVIEW_REQUIRED_NO_SOLUTION_CANDIDATES_ASSERTED"
  };
}

function buildRecon({ canonicalLibrary, legacyExport, reviewedMapping, inputFacts, variantPolicies = {} }) {
  const canonicalByTask = new Map(canonicalLibrary.texts.map((text) => [text.text_key, text]));
  const legacyByKey = new Map(legacyExport.texts.map((entry) => [sha256(String(entry.text?.id || "")), entry]));
  const observedSegments = [];

  for (const card of reviewedMapping.cards) {
    const legacy = legacyByKey.get(card.legacy_card_key_sha256);
    if (!legacy) throw new Error(`Legacy card not found by exact id hash: ${card.legacy_card_key_sha256}`);
    for (const segment of card.segments.filter((entry) => entry.target_kind === "task")) {
      const canonical = canonicalByTask.get(segment.target_id);
      if (!canonical) throw new Error(`Canonical task not found: ${segment.target_id}`);
      const segmentRows = legacy.sentences
        .filter((row) => row.order_index >= segment.row_start && row.order_index <= segment.row_end)
        .sort((a, b) => a.order_index - b.order_index);
      const boundary = determineBoundary(canonical.rows, segmentRows);
      observedSegments.push({
        task_id: segment.target_id,
        source_edition: canonical.source_meta.materials_science_task.source_pdf_sha256
          ? `problem-book-2-pdf-sha256-${canonical.source_meta.materials_science_task.source_pdf_sha256.slice(0, 8)}`
          : null,
        legacy_card_title: card.legacy_title,
        legacy_card_key_sha256: card.legacy_card_key_sha256,
        segment: {
          row_start: segment.row_start,
          row_end: segment.row_end,
          row_count: segmentRows.length
        },
        boundary,
        segment_rows_sha256: segmentRowsHash(segmentRows),
        _segmentRows: segmentRows
      });
    }
  }

  const observedByTask = new Map();
  for (const segment of observedSegments) {
    if (!observedByTask.has(segment.task_id)) observedByTask.set(segment.task_id, []);
    observedByTask.get(segment.task_id).push(segment);
  }

  const tasks = [];
  for (const canonical of canonicalLibrary.texts) {
    const variants = observedByTask.get(canonical.text_key) || [];
    if (!variants.length) {
      tasks.push({
        task_id: canonical.text_key,
        source_edition: `problem-book-2-pdf-sha256-${canonical.source_meta.materials_science_task.source_pdf_sha256.slice(0, 8)}`,
        legacy_disposition: { type: "NO_LEGACY_CARD", basis: null, selected_component_count: 0, observed_variant_count: 0 },
        boundary_status: "NO_LEGACY_CARD",
        legacy_variants: [],
        candidate_solution_row_count: 0,
        candidate_solution_rows: [],
        truth_status: "NO_LEGACY_SOLUTION_CANDIDATE_IN_LIBRARY_EXPORT"
      });
    } else {
      tasks.push(resolveTaskVariants(
        canonical.text_key,
        canonical,
        variants,
        variantPolicies[canonical.text_key] || null
      ));
    }
  }

  const accepted = tasks.filter((entry) => entry.boundary_status === "BOUNDARY_ACCEPTED");
  const review = tasks.filter((entry) => entry.boundary_status === "BOUNDARY_REVIEW_REQUIRED");
  const missing = tasks.filter((entry) => entry.boundary_status === "NO_LEGACY_CARD");
  const candidateRows = accepted.reduce((sum, entry) => sum + entry.candidate_solution_row_count, 0);

  return {
    schema: "linguistpro.materials-pb2.legacy-solution-recon.1",
    status: review.length
      ? "PARTIAL_BOUNDARIES_REQUIRE_VISUAL_REVIEW_NO_SOLUTION_TRUTH_ASSERTED"
      : "ALL_BOUNDARIES_ACCEPTED_NO_SOLUTION_TRUTH_ASSERTED",
    generated_at: "2026-08-30T00:00:00Z",
    corpus_slug: canonicalLibrary.shelves.slug,
    source_edition: canonicalLibrary.texts[0]?.source_meta?.materials_science_task?.source_pdf_sha256
      ? `problem-book-2-pdf-sha256-${canonicalLibrary.texts[0].source_meta.materials_science_task.source_pdf_sha256.slice(0, 8)}`
      : null,
    truth_boundary: "CANDIDATE_EXTRACTION_ONLY_LEGACY_ROWS_ARE_NOT_ANSWER_OR_SOLUTION_TRUTH",
    inputs: inputFacts,
    summary: {
      canonical_task_count: canonicalLibrary.texts.length,
      mapped_task_count: tasks.length - missing.length,
      observed_legacy_segment_count: observedSegments.length,
      accepted_task_boundary_count: accepted.length,
      review_required_task_boundary_count: review.length,
      no_legacy_card_count: missing.length,
      candidate_solution_row_count: candidateRows,
      answer_ledger_transcribed_count: 0,
      independent_solution_count: 0
    },
    review_queue: review.map((entry) => ({
      task_id: entry.task_id,
      legacy_disposition: entry.legacy_disposition,
      legacy_variants: entry.legacy_variants.map((variant) => ({
        legacy_card_title: variant.legacy_card_title,
        legacy_card_key_sha256: variant.legacy_card_key_sha256,
        boundary: variant.boundary,
        segment: variant.segment
      }))
    })),
    no_legacy_card_task_ids: missing.map((entry) => entry.task_id),
    tasks
  };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result[key] = value;
    i += 1;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundlePath = args.bundle;
  const legacyPath = args.legacy;
  const mappingPath = args.mapping || DEFAULT_MAPPING;
  const solutionSpecPath = args["solution-spec"] || path.join(DEFAULT_RESEARCH, "solution-program-spec.json");
  const outputPath = args.output || path.join(DEFAULT_RESEARCH, "legacy-solution-candidate-ledger.json");
  if (!bundlePath || !legacyPath) {
    throw new Error("Usage: --bundle <canonical-learning.zip> --legacy <library-export.json> [--mapping <json>] [--output <json>]");
  }

  const bundleBytes = fs.readFileSync(bundlePath);
  const zip = await JSZip.loadAsync(bundleBytes);
  const libraryEntry = zip.file("library/library.json");
  const manifestEntry = zip.file("manifest.json");
  if (!libraryEntry || !manifestEntry) throw new Error("Canonical bundle is missing manifest.json or library/library.json");
  const canonicalLibraryText = await libraryEntry.async("string");
  const manifestText = await manifestEntry.async("string");
  const legacyBytes = fs.readFileSync(legacyPath);
  const mappingBytes = fs.readFileSync(mappingPath);
  const solutionSpecBytes = fs.readFileSync(solutionSpecPath);
  const legacyExport = JSON.parse(legacyBytes.toString("utf8"));
  const reviewedMapping = JSON.parse(mappingBytes.toString("utf8"));
  const canonicalLibrary = JSON.parse(canonicalLibraryText);
  const solutionSpec = JSON.parse(solutionSpecBytes.toString("utf8"));

  const result = buildRecon({
    canonicalLibrary,
    legacyExport,
    reviewedMapping,
    variantPolicies: solutionSpec.legacy_variant_dispositions || {},
    inputFacts: {
      canonical_bundle: {
        filename: path.basename(bundlePath),
        sha256: sha256(bundleBytes),
        manifest_sha256: sha256(Buffer.from(manifestText, "utf8")),
        library_sha256: sha256(Buffer.from(canonicalLibraryText, "utf8"))
      },
      legacy_export: {
        filename: path.basename(legacyPath),
        sha256: sha256(legacyBytes)
      },
      reviewed_mapping: {
        repository_path: path.relative(ROOT, mappingPath).replaceAll("\\", "/"),
        sha256: sha256(mappingBytes)
      },
      solution_program_spec: {
        repository_path: path.relative(ROOT, solutionSpecPath).replaceAll("\\", "/"),
        sha256: sha256(solutionSpecBytes)
      }
    }
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stableJson(result), "utf8");
  console.log(stableJson({ output: outputPath, status: result.status, summary: result.summary }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  alignCanonicalRows,
  buildRecon,
  determineBoundary,
  diceSimilarity,
  isSolutionHeading,
  normalizeText,
  resolveTaskVariants,
  rowSimilarity
};
