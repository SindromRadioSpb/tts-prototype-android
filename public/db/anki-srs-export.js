/* ── anki-srs-export.js — map OPFS word_study notes → an Anki deck spec (⑤ A2b / A-unify) ──────────────
 * Turns the user's `word_study` notes (the S10 search→notes + ②-notes vocabulary) into a spec for the
 * client `.apkg` builder (public/db/anki-apkg.js). Uses the SHARED «LinguistPro Word v2» model
 * (public/db/anki-models.js) — the SAME model the AnkiConnect export uses → identical cards, no divergence
 * (was a standalone «Word v1» in A2b; reconciled in A-unify). The global Trainer export fills what the note
 * body carries (word/niqqud/translit/meaning/root/binyan/pos/mnemonic); Conjugation/Example/Audio stay empty
 * (the per-text AnkiConnect path adds those) → the front falls back to `{{tts he_IL:Word}}` device TTS.
 * Pure logic (no I/O) → gate `smoke:anki-srs-export`. UMD: require() in Node, global `AnkiSrsExport` in the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./anki-apkg-core.js"), require("./anki-models.js"));
  else root.AnkiSrsExport = factory(root.AnkiApkgCore, root.AnkiModels);
})(typeof self !== "undefined" ? self : this, function (core, models) {
  "use strict";

  const MODEL = models.wordV2(); // { modelName, fieldNames, templates, css }

  // Parse a note row { id, body, body_json? } → the word body object.
  function noteBody(note) {
    let b = note.body;
    if (!b && note.body_json) { try { b = JSON.parse(note.body_json); } catch (_) { b = {}; } }
    return b || {};
  }

  // word body → the 11 «Word v2» field values. Conjugation/Example/Audio empty here (global export);
  // the per-text AnkiConnect path fills them (paradigm/example/audio).
  function bodyToFields(b) {
    return {
      Word: String(b.word || b.lemma || ""),
      Niqqud: String(b.niqqud_variant || b.niqqud || ""),
      Translit: String(b.translit_ru || b.translit || ""),
      Russian: String(b.meaning || ""),
      Root: String(b.root || ""),
      Binyan: String(b.binyan || ""),
      POS: String(b.pos || b.part_of_speech || ""),
      Conjugation: "",
      Example: "",
      Mnemonic: String(b.mnemonic || ""),
      Audio: "",
    };
  }

  // Lemma-stable key (same shape as corpus-vocab) → GUID, so re-export updates instead of duplicating and
  // homograph/duplicate-lemma notes collapse to one card.
  function lemmaKey(b) {
    if (b.pealim_id != null && String(b.pealim_id) !== "") return "pid:" + String(b.pealim_id);
    const w = core.stripHtmlMedia(b.word || b.lemma || b.niqqud_variant || b.niqqud).trim();
    return "w:" + w + "#" + String(b.pos || b.part_of_speech || "");
  }

  // Build the Anki deck spec from word_study note rows. opts.deckName overrides the deck.
  function buildWordStudySpec(notes, opts) {
    opts = opts || {};
    const seen = new Set();
    const outNotes = [];
    for (const n of (notes || [])) {
      const b = noteBody(n);
      if (!(b.word || b.lemma) && !(b.niqqud_variant || b.niqqud)) continue; // nothing for the front → skip
      const key = lemmaKey(b);
      if (seen.has(key)) continue;                                            // dedup by lemma
      seen.add(key);
      const f = bodyToFields(b);
      outNotes.push({
        guid: core.stableGuid("word:" + key),
        fields: MODEL.fieldNames.map((name) => f[name] || ""),
        tags: ["lp", "lp_word"].concat(f.POS ? ["lp_pos_" + f.POS.replace(/\s+/g, "_")] : []),
      });
    }
    return {
      deckName: opts.deckName || "LinguistPro::Words",
      modelName: MODEL.modelName,
      fieldNames: MODEL.fieldNames,
      templates: MODEL.templates,
      css: MODEL.css,
      notes: outNotes,
    };
  }

  // ── A-unify-2b — sentence + multi-group builders (the modal words/sentences/both `.apkg`) ────────────
  const SENT_MODEL = models.srsCardV1(); // «LinguistPro SRS Card v1»

  // OPFS sentence row → the 6 «SRS Card v1» fields. Text-first (Audio empty). `noteText` = the optional
  // per-sentence annotation (only when includeHint).
  function sentenceFields(s, noteText) {
    s = s || {};
    return {
      Hebrew: String(s.he_plain || s.he_niqqud || s.hebrew_plain || ""),
      Niqqud: String(s.he_niqqud || s.hebrew_niqqud || ""),
      Translit: String(s.translit || s.translit_ru || ""),
      Russian: String(s.ru || s.russian || ""),
      Note: String(noteText || ""),
      Audio: "",
    };
  }
  // sentences[] (+ opts.noteBySid[sid]) → an «SRS Card v1» deck group. Stable guid per sentence id.
  function sentenceGroup(sentences, opts) {
    opts = opts || {};
    const noteBySid = opts.noteBySid || {};
    const out = [];
    for (const s of (sentences || [])) {
      const f = sentenceFields(s, s ? noteBySid[s.id] : "");
      if (!f.Hebrew && !f.Niqqud) continue;
      out.push({ guid: core.stableGuid("sent:" + (s && s.id != null ? s.id : f.Hebrew)), fields: SENT_MODEL.fieldNames.map((n) => f[n] || ""), tags: ["lp", "lp_sentence"] });
    }
    return { deckName: opts.deckName || "LinguistPro::SRS", modelName: SENT_MODEL.modelName, fieldNames: SENT_MODEL.fieldNames, templates: SENT_MODEL.templates, css: SENT_MODEL.css, notes: out };
  }
  // items[]: { key, fields } where `fields` is a Word v2 field OBJECT (built in the browser by
  // v3AnkiBuildWordCardFields — carries Conjugation/Example) and `key` is the lemma key (lemmaKey(body)).
  // → a «Word v2» group, deduped by lemma, same guid scheme as buildWordStudySpec (one card per lemma).
  function wordGroupFromCards(items, opts) {
    opts = opts || {};
    const seen = new Set();
    const out = [];
    for (const it of (items || [])) {
      const f = (it && it.fields) || {};
      if (!f.Word && !f.Niqqud) continue;
      const key = (it && it.key) || ("w:" + core.stripHtmlMedia(f.Word || f.Niqqud).trim() + "#" + (f.POS || ""));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ guid: core.stableGuid("word:" + key), fields: MODEL.fieldNames.map((n) => f[n] || ""), tags: ["lp", "lp_word"].concat(f.POS ? ["lp_pos_" + String(f.POS).replace(/\s+/g, "_")] : []) });
    }
    return { deckName: opts.deckName || "LinguistPro::Words", modelName: MODEL.modelName, fieldNames: MODEL.fieldNames, templates: MODEL.templates, css: MODEL.css, notes: out };
  }

  return {
    buildWordStudySpec, noteBody, bodyToFields, lemmaKey, MODEL_NAME: MODEL.modelName, FIELD_NAMES: MODEL.fieldNames,
    sentenceFields, sentenceGroup, wordGroupFromCards, SENT_MODEL_NAME: SENT_MODEL.modelName, SENT_FIELD_NAMES: SENT_MODEL.fieldNames,
  };
});
