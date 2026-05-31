"use strict";

// Decode Dicta's Nakdan `addmorph` morphId — a fixed 64-bit feature bitfield.
//
// The bit layout below was reverse-engineered from Dicta's own Nakdan client
// (the BASEFORM_* enum table it ships) and VALIDATED against a controlled
// matrix of forms: all 7 binyanim, present/past/future × m/f × sg/pl × 1/2/3,
// and nouns (m/f, sg/pl). The labels are Dicta-authoritative; the bit offsets
// are empirical-but-tested. See scripts/premium/morphid-decode-smoke for the
// pinned ground-truth cases.
//
// IMPORTANT: morphId exceeds Number.MAX_SAFE_INTEGER — decode with BigInt only.
//
//   pos    : (id >> 16) & 0x1F  1=adjective 2=adverb 6=noun 7=numeral 8=preposition 9=pronoun 10=propernoun 13=verb
//   binyan : (id >> 51) & 0x7   1=paal 2=nifal 3=hifil 4=hufal 5=piel 6=pual 7=hitpael  (0 = not a verb)
//   gender : (id >> 21) & 0x3   1=m 2=f 3=m/f
//   number : (id >> 24) & 0x7   1=sg 2=pl 3=dual
//   person : (id >> 27) & 0x7   1/2/3   (0 or 4 = none, e.g. present participle / nouns)
//   tense  : (id >> 32) & 0xFF  2=past 6=present 8=future 10=imperative 12=infinitive  (0 = none)

const MORPH_DECODE_VERSION = "dicta-morphid-v2";

const POS = { 1: "adjective", 2: "adverb", 6: "noun", 7: "numeral", 8: "preposition", 9: "pronoun", 10: "propernoun", 13: "verb" };
const BINYAN = { 1: "paal", 2: "nifal", 3: "hifil", 4: "hufal", 5: "piel", 6: "pual", 7: "hitpael" };
const GENDER = { 1: "m", 2: "f", 3: "mf" };
const NUMBER = { 1: "sg", 2: "pl", 3: "dual" };
const PERSON = { 1: "1", 2: "2", 3: "3" };
const TENSE  = { 2: "past", 6: "present", 8: "future", 10: "imperative", 12: "infinitive" };

// decodeMorphId(idString) → { binyan, feats:{gender,number,person,tense}, valid, raw }
// Unknown/unmapped sub-fields come back null; `valid` is false only when the
// id can't be parsed (so callers can fall back to heuristics).
function decodeMorphId(idStr) {
  let v;
  try { v = BigInt(String(idStr == null ? "0" : idStr)); }
  catch (_) { return { binyan: null, feats: { gender: null, number: null, person: null, tense: null }, valid: false, raw: String(idStr || "") }; }
  if (v <= 0n) {
    return { pos: null, binyan: null, feats: { gender: null, number: null, person: null, tense: null }, valid: false, raw: String(idStr || "") };
  }
  const pos = POS[Number((v >> 16n) & 0x1Fn)] || null;
  const binyan = BINYAN[Number((v >> 51n) & 0x7n)] || null;
  const personCode = Number((v >> 27n) & 0x7n);
  const tenseByte = Number((v >> 32n) & 0xFFn);
  const feats = {
    gender: GENDER[Number((v >> 21n) & 0x3n)] || null,
    number: NUMBER[Number((v >> 24n) & 0x7n)] || null,
    // person only for verbs (1/2/3); present participle uses 4 → none
    person: (binyan && personCode >= 1 && personCode <= 3) ? PERSON[personCode] : null,
    tense:  binyan ? (TENSE[tenseByte] || null) : null,
  };
  return { pos, binyan, feats, valid: true, raw: String(idStr) };
}

// Heuristic binyan from the VOCALIZED lemma template (fallback when morphId is
// absent/zero). Best-effort: gizra/irregular forms may misfire — mark as such.
function binyanFromVocalizedLemma(vocalized) {
  const s = String(vocalized || "");
  if (!s) return null;
  // strip a leading prefix segment marker if present
  const stem = s.includes("|") ? s.split("|").pop() : s;
  // order matters: more specific prefixes first
  if (/^הִת|^הִס|^הִצ|^הִז|^הִשׁ|^הִשׂ/.test(stem)) return "hitpael";
  if (/^הֻ|^הוּ/.test(stem)) return "hufal";
  if (/^הִ|^הֶ|^הֵ/.test(stem)) return "hifil";
  if (/^נִ|^נָ|^נֶ/.test(stem)) return "nifal";
  // piel/pual: doubled middle radical (dagesh) — distinguish by theme vowel
  // (tsere/segol → piel, qubuts/shuruk → pual). Heuristic on second vowel.
  if (/[ֻּ]/.test(stem) && /^[בכלמנפצקרשת]?[ֻ]/.test(stem)) return "pual";
  if (/ֵּ|ֶּ/.test(stem)) return "piel";
  return "paal";
}

module.exports = { decodeMorphId, binyanFromVocalizedLemma, MORPH_DECODE_VERSION };
