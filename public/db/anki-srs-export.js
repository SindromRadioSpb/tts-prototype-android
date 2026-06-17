/* ── anki-srs-export.js — map OPFS word_study notes → an Anki deck spec (⑤ A2b) ────────────────────────
 * Turns the user's `word_study` notes (the S10 search→notes + ②-notes vocabulary, body_json with
 * word/niqqud/root/binyan/pos/meaning/pealim_id) into a spec for the client `.apkg` builder
 * (public/db/anki-apkg.js). A purpose-built «LinguistPro Word v1» model — these are vocabulary cards, a
 * different content type from the sentence-oriented «LinguistPro SRS Card v1» (sentence-card export is a
 * follow-up). Pure logic (no I/O) → gate `smoke:anki-srs-export`. UMD: require() in Node, global
 * `AnkiSrsExport` in the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./anki-apkg-core.js"));
  else root.AnkiSrsExport = factory(root.AnkiApkgCore);
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  const WORD_MODEL_NAME = "LinguistPro Word v1";
  const FIELD_NAMES = ["Word", "Niqqud", "Root", "Binyan", "POS", "Meaning", "PealimId", "NoteId"];
  const TEMPLATES = [{
    Name: "He→Ru",
    // Front: vocalized Hebrew (fall back to plain). Back: + Russian meaning + morphology chips.
    Front: '{{#Niqqud}}<div class="lp-he">{{Niqqud}}</div>{{/Niqqud}}{{^Niqqud}}<div class="lp-he">{{Word}}</div>{{/Niqqud}}',
    Back: '{{FrontSide}}<hr><div class="lp-ru">{{Meaning}}</div>'
      + '<div class="lp-meta">{{#Root}}שורש {{Root}}{{/Root}}{{#Binyan}} · {{Binyan}}{{/Binyan}}{{#POS}} · {{POS}}{{/POS}}</div>',
  }];
  const CSS = [
    ".card{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;text-align:center;}",
    ".lp-he{direction:rtl;font-size:40px;font-weight:700;margin:10px 0;}",
    ".lp-ru{font-size:24px;margin:10px 0;}",
    ".lp-meta{direction:rtl;font-size:14px;opacity:.6;margin-top:8px;}",
  ].join("\n");

  // A word_study note → the 8 field values (aligned to FIELD_NAMES). `note` = { id, body } where body is
  // the PARSED body_json (or pass body_json string as `note.body_json`).
  function noteToFields(note) {
    let b = note.body;
    if (!b && note.body_json) { try { b = JSON.parse(note.body_json); } catch (_) { b = {}; } }
    b = b || {};
    return {
      Word: String(b.word || b.lemma || ""),
      Niqqud: String(b.niqqud_variant || b.niqqud || ""),
      Root: String(b.root || ""),
      Binyan: String(b.binyan || ""),
      POS: String(b.pos || b.part_of_speech || ""),
      Meaning: String(b.meaning || ""),
      PealimId: b.pealim_id != null ? String(b.pealim_id) : "",
      NoteId: String(note.id != null ? note.id : ""),
    };
  }

  // Lemma-stable key (same shape as corpus-vocab) → GUID, so re-export updates instead of duplicating and
  // homograph/duplicate notes collapse to one card.
  function lemmaKey(f) {
    if (f.PealimId) return "pid:" + f.PealimId;
    const w = core.stripHtmlMedia(f.Word || f.Niqqud).trim();
    return "w:" + w + "#" + (f.POS || "");
  }

  // Build the Anki deck spec from word_study note rows. opts.deckName overrides the deck.
  function buildWordStudySpec(notes, opts) {
    opts = opts || {};
    const seen = new Set();
    const outNotes = [];
    for (const n of (notes || [])) {
      const f = noteToFields(n);
      if (!f.Word && !f.Niqqud) continue;            // nothing to put on the front → skip honestly
      const key = lemmaKey(f);
      if (seen.has(key)) continue;                    // dedup by lemma (homographs/repeats collapse)
      seen.add(key);
      outNotes.push({
        guid: core.stableGuid("word:" + key),
        fields: FIELD_NAMES.map((name) => f[name] || ""),
        tags: ["lp", "lp_word"].concat(f.POS ? ["lp_pos_" + f.POS.replace(/\s+/g, "_")] : []),
      });
    }
    return {
      deckName: opts.deckName || "LinguistPro::Words",
      modelName: WORD_MODEL_NAME,
      fieldNames: FIELD_NAMES,
      templates: TEMPLATES,
      css: CSS,
      notes: outNotes,
    };
  }

  return { buildWordStudySpec, noteToFields, lemmaKey, WORD_MODEL_NAME, FIELD_NAMES, TEMPLATES, CSS };
});
