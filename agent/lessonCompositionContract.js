"use strict";

// LB2-A single source of truth for model instructions, provider schema,
// deterministic validation and fixture expectations. Provider schemas reduce
// malformed output; this validator remains the publication authority.
const TYPES = ["source_reading", "vocabulary", "grammar", "writing", "dialogue"];
const CONTROLLED_TYPES = new Set(["vocabulary", "grammar"]);
const INSTRUCTION_MIN_LENGTH = 30;
const VALIDATION_CODES = [
  "INVALID_JSON",
  "MISSING_OBJECTIVE",
  "MISSING_SECTION",
  "MISSING_SOURCE_ID",
  "FOREIGN_SOURCE_ID",
  "MISSING_ANCHOR",
  "FOREIGN_ANCHOR",
  "MISSING_FOCUS",
  "MISSING_PURPOSE",
  "GENERIC_INSTRUCTION",
  "MISSING_SUCCESS_CRITERIA",
  "MISSING_EXPECTED_ANSWER",
  "LOAD_EXCEEDED",
];

function text(value, max) { return String(value == null ? "" : value).trim().slice(0, max); }
function hasText(value) { return typeof value === "string" && value.trim().length > 0; }
function ids(value) { return [...new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : [])]; }
function strings(value, max, count) {
  return (Array.isArray(value) ? value : []).map((x) => text(x, max)).filter(Boolean).slice(0, count);
}

function compositionSchema(maxItems) {
  const limit = Math.max(1, Number(maxItems) || 1);
  const idArray = { type: "array", minItems: 1, items: { type: "string", minLength: 1 } };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["objective", "sections", "exercises"],
    properties: {
      objective: { type: "string", minLength: 1, maxLength: 500 },
      sections: {
        type: "array", minItems: 1, maxItems: limit,
        items: {
          type: "object", additionalProperties: false,
          required: ["title", "body", "source_ids", "anchor_ids"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 120 },
            body: { type: "string", minLength: 1, maxLength: 1200 },
            source_ids: idArray,
            anchor_ids: idArray,
          },
        },
      },
      exercises: {
        type: "array", minItems: 1, maxItems: limit,
        items: {
          type: "object", additionalProperties: false,
          required: ["type", "purpose", "instruction", "source_ids", "anchor_ids", "expected_answer", "hints", "success_criteria"],
          properties: {
            type: { type: "string", enum: TYPES },
            purpose: { type: "string", minLength: 1, maxLength: 300 },
            instruction: { type: "string", minLength: INSTRUCTION_MIN_LENGTH, maxLength: 600 },
            source_ids: idArray,
            anchor_ids: idArray,
            expected_answer: { type: ["string", "null"], maxLength: 1200 },
            hints: { type: "array", maxItems: 3, items: { type: "string", minLength: 1, maxLength: 300 } },
            success_criteria: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 300 } },
          },
        },
      },
    },
  };
}

function promptInstructions(maxItems) {
  return "Return exactly one JSON object matching this contract: " + JSON.stringify(compositionSchema(maxItems)) +
    ". Every section and exercise must cite supplied source and anchor IDs. Every exercise needs a concrete purpose, an instruction of at least " +
    INSTRUCTION_MIN_LENGTH + " characters, and success criteria. Vocabulary and grammar exercises also need an expected answer. " +
    "Include source_reading and every selected focus. Do not add fields or exceed the declared array limits.";
}

function ordered(codes) {
  const found = new Set(codes);
  return VALIDATION_CODES.filter((code) => found.has(code));
}

function validateCompositionDetailed(parsed, { sourceIds, anchorIds, maxItems, focuses } = {}) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, value: null, codes: ["INVALID_JSON"] };
  }
  const codes = [];
  const sourceAllowlist = new Set((sourceIds || []).map(String));
  const anchorAllowlist = new Set((anchorIds || []).map(String));
  const limit = Math.max(1, Number(maxItems) || 1);
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const rawExercises = Array.isArray(parsed.exercises) ? parsed.exercises : [];

  if (!hasText(parsed.objective)) codes.push("MISSING_OBJECTIVE");
  if (!rawSections.length || rawSections.some((s) => !s || !hasText(s.title) || !hasText(s.body))) codes.push("MISSING_SECTION");
  if (rawSections.length > limit || rawExercises.length > limit) codes.push("LOAD_EXCEEDED");

  for (const item of [...rawSections, ...rawExercises]) {
    const rawSource = item && item.source_ids;
    const rawAnchors = item && item.anchor_ids;
    if (!Array.isArray(rawSource) || !rawSource.length) codes.push("MISSING_SOURCE_ID");
    else if (rawSource.some((id) => !hasText(id) || !sourceAllowlist.has(id))) codes.push("FOREIGN_SOURCE_ID");
    if (!Array.isArray(rawAnchors) || !rawAnchors.length) codes.push("MISSING_ANCHOR");
    else if (rawAnchors.some((id) => !hasText(id) || !anchorAllowlist.has(id))) codes.push("FOREIGN_ANCHOR");
  }

  const exerciseTypes = rawExercises.map((e) => typeof (e && e.type) === "string" ? text(e.type, 40) : "");
  const required = new Set(["source_reading", ...(focuses || []).filter((x) => x !== "reading")]);
  if (!rawExercises.length || exerciseTypes.some((type) => !TYPES.includes(type)) ||
      [...required].some((type) => !exerciseTypes.includes(type))) codes.push("MISSING_FOCUS");
  for (const exercise of rawExercises) {
    const type = typeof (exercise && exercise.type) === "string" ? text(exercise.type, 40) : "";
    if (!hasText(exercise && exercise.purpose)) codes.push("MISSING_PURPOSE");
    if (typeof (exercise && exercise.instruction) !== "string" || exercise.instruction.trim().length < INSTRUCTION_MIN_LENGTH) codes.push("GENERIC_INSTRUCTION");
    const criteria = exercise && exercise.success_criteria;
    if (!Array.isArray(criteria) || !criteria.length || criteria.some((x) => !hasText(x))) codes.push("MISSING_SUCCESS_CRITERIA");
    if (CONTROLLED_TYPES.has(type) && !hasText(exercise && exercise.expected_answer)) codes.push("MISSING_EXPECTED_ANSWER");
  }

  const finalCodes = ordered(codes);
  if (finalCodes.length) return { ok: false, value: null, codes: finalCodes };
  return { ok: true, value: {
    objective: text(parsed.objective, 500),
    sections: rawSections.map((s) => ({
      title: text(s.title, 120), body: text(s.body, 1200), source_ids: ids(s.source_ids), anchor_ids: ids(s.anchor_ids),
    })),
    exercises: rawExercises.map((e) => ({
      type: text(e.type, 40), purpose: text(e.purpose, 300), instruction: text(e.instruction, 600),
      source_ids: ids(e.source_ids), anchor_ids: ids(e.anchor_ids), expected_answer: text(e.expected_answer, 1200) || null,
      hints: strings(e.hints, 300, 3), success_criteria: strings(e.success_criteria, 300, 4),
    })),
  }, codes: [] };
}

function parseAndValidateComposition(raw, contract) {
  let parsed;
  try { parsed = JSON.parse(String(raw || "")); }
  catch (_) { return { ok: false, value: null, codes: ["INVALID_JSON"] }; }
  return validateCompositionDetailed(parsed, contract);
}

module.exports = { TYPES, CONTROLLED_TYPES, INSTRUCTION_MIN_LENGTH, VALIDATION_CODES,
  compositionSchema, promptInstructions, validateCompositionDetailed, parseAndValidateComposition };
