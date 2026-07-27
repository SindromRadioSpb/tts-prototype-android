// ingest/segTable.js
// W2-S4 · Сегмент-режим /api/translate-table: транскрипт приходит ПРЕ-сегментированным (ASR),
// модель обязана сохранить границы (1 сегмент → ≥1 строк, segment_index на каждой строке) —
// структурная привязка тайминга к строкам вместо текст-матчинга (R11). Существующие
// HE_RU_PROMPT/ANY_HE_PROMPT не тронуты; promptId he-ru-table-seg-v1 = отдельный кэш-неймспейс.
"use strict";

const MAX_SEGMENTS = 400;
const MAX_SEG_TEXT = 2000;

function validateSegmentsInput(segments) {
  if (!Array.isArray(segments) || !segments.length || segments.length > MAX_SEGMENTS) {
    return { ok: false, error_code: "BAD_SEGMENTS" };
  }
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k];
    if (!s || s.i !== k || typeof s.text !== "string" || !s.text.trim() || s.text.length > MAX_SEG_TEXT) {
      return { ok: false, error_code: "BAD_SEGMENTS" };
    }
  }
  return { ok: true };
}

function buildSegInput(segments) {
  return segments.map((s) => "[" + s.i + "] " + s.text.trim().replace(/\s+/g, " ")).join("\n");
}

function HE_RU_SEG_PROMPT(segInput) {
  return `You are a strict JSON generator for a Hebrew learning app.
INPUT: a numbered list of Hebrew transcript segments, one per line, in the form "[k] text".
TASK:
1) Keep the given segmentation: NEVER merge text from two different input segments into one row.
2) You MAY split one long input segment into several rows (in original order).
3) Every row MUST carry "segment_index" = the k of the input segment the row came from.
4) For each row produce: "he" (Hebrew as in the input, cleaned, WITHOUT niqqud), "he_niqqud" (the same Hebrew fully vocalized), "translit" (Latin transliteration of the vocalized Hebrew), "ru" (Russian translation).
5) Echo the input segments as "segments": [{"index": k, "he": "<input segment text>"}].
Rules:
- Preserve the original order; "segment_index" values must be non-decreasing, starting at 0.
- Do NOT invent, drop or reorder content; do NOT translate the Hebrew column.
- The input is a speech transcript and may contain fillers or "[…]" for unclear regions — keep them as-is.
Output ONLY JSON, no markdown fences:
{"segments":[{"index":0,"he":"..."}],"rows":[{"segment_index":0,"he":"...","he_niqqud":"...","translit":"...","ru":"..."}]}
INPUT SEGMENTS:
${segInput}`;
}

function validateSegMapping(rows, segCount) {
  if (!Array.isArray(rows) || !rows.length) return false;
  let last = -1;
  for (const r of rows) {
    const si = r && r.segment_index;
    if (!Number.isInteger(si) || si < 0 || si >= segCount || si < last) return false;
    last = si;
  }
  return true;
}

// W2-S4.1 FIX A: mapping can be structurally VALID (non-decreasing, in-range) yet still
// skip whole input segments (model dropped content, not just bounds). Pure — no side effects,
// caller decides what to do (warn, never strips segment_index/timing — R11 honest degradation).
function segCoverage(rows, segCount) {
  const seen = new Set();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const si = r && r.segment_index;
      if (Number.isInteger(si)) seen.add(si);
    }
  }
  const missing = [];
  for (let i = 0; i < segCount; i++) {
    if (!seen.has(i)) missing.push(i);
  }
  return { covered: missing.length === 0, missing };
}

module.exports = { MAX_SEGMENTS, validateSegmentsInput, buildSegInput, HE_RU_SEG_PROMPT, validateSegMapping, segCoverage };
