"use strict";

// Transliteration for what leaves the app: DOCX, Anki, mentor/agent context (O-033, 2026-09-28).
//
// The canonical data of a row is its pointed text plus the person's own edits; the stored
// `translit` / `translit_ru` columns are a cache built with whatever profile and engine were
// current at build time. Outside readers (Word, Anki, an LLM) cannot derive, so an export writes
// the transliteration of the requested profile at export time, from `he_niqqud`, with the same
// rules as the Studio and the Reading Room (TranslitDisplay). A cell edited by hand is exported
// as written.

const TranslitDisplay = require("../../public/js/translit-display.js");
const { transliterateWithProfile } = require("./translit");

const display = TranslitDisplay.createDisplay(transliterateWithProfile);
const DEFAULT_PROFILE = "learner-latin";

function exportProfile(value) {
  return TranslitDisplay.PROFILES.includes(value) ? value : DEFAULT_PROFILE;
}

// row: any sentence shape — he_niqqud|hebrew_niqqud, translit, translit_ru,
// edit_meta_json|edit_meta (string or object).
function exportTranslit(row, profile) {
  const r = row || {};
  return display({
    he_niqqud: r.he_niqqud != null ? r.he_niqqud : (r.hebrew_niqqud || ""),
    translit: r.translit || "",
    translit_ru: r.translit_ru || "",
    edit_meta_json: r.edit_meta_json != null ? r.edit_meta_json : (r.edit_meta || null),
  }, exportProfile(profile));
}

module.exports = { exportTranslit, exportProfile, DEFAULT_PROFILE };
