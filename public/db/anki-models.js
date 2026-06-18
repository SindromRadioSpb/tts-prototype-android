/* ── anki-models.js — canonical Anki note models (single source of truth) (⑤ A-unify) ────────────────
 * The «LinguistPro Word v2» (vocabulary) + «LinguistPro SRS Card v1» (sentence) models, in the `.apkg`
 * builder shape { modelName, fieldNames, templates:[{Name,Front,Back}], css }. BOTH transports use these
 * → AnkiConnect push (index.html `v3AnkiWordModelSpec` delegates here) and the client `.apkg` export
 * (public/db/anki-srs-export.js) produce IDENTICAL cards (same model name+fields → Anki merges them; re-
 * import updates). Keeping ONE copy avoids the A2b `Word v1` divergence. Gate: smoke:anki-srs-export.
 * UMD: require() in Node, global `AnkiModels` in the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AnkiModels = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── «LinguistPro Word v2» — vocabulary card (11 fields incl. conjugation paradigm) ──────────────────
  const WORD_V2_FIELDS = ["Word", "Niqqud", "Translit", "Russian", "Root", "Binyan", "POS", "Conjugation", "Example", "Mnemonic", "Audio"];
  const WORD_V2_CSS = `
.card { font-family: "Helvetica", Arial, sans-serif; font-size: 20px; color: #1f2937; background-color: #f9fafb; text-align: center; padding: 16px; }
.he { font-size: 30px; direction: rtl; font-family: "Times New Roman", "David", serif; font-weight: 700; }
.niqqud { font-size: 24px; direction: rtl; color: #374151; margin-top: 2px; }
.translit { font-style: italic; color: #6b7280; margin-top: 6px; }
.russian { font-size: 22px; color: #111827; margin-top: 10px; }
.wc-meta { font-size: 14px; color: #475569; margin-top: 8px; }
.wc-meta .wc-root { direction: rtl; font-weight: 700; color: #0f172a; }
.wc-example { direction: rtl; text-align: right; font-size: 17px; color: #1f2937; background: #f1f5f9; border-radius: 8px; padding: 8px 12px; margin-top: 12px; }
.note { background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px 12px; text-align: left; margin-top: 14px; font-size: 15px; }
hr { border: none; border-top: 1px solid #d1d5db; margin: 14px 0; }
.v3-wordcard-conj { margin-top: 12px; }
.v3-conj-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 10px; margin-bottom: 6px; }
.v3-conj-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 7px; background: #0F766E; color: #fff; letter-spacing: 0.02em; white-space: nowrap; }
.v3-conj-gizra { font-size: 11px; color: #6b7280; }
.v3-conj-recheck { font-size: 11.5px; font-weight: 600; color: #b45309; text-decoration: none; }
.v3-conj-besteffort { font-size: 11px; color: #92400e; background: rgba(230,159,0,0.12); border: 1px dashed #E69F00; border-radius: 7px; padding: 3px 8px; margin-bottom: 6px; }
.v3-conj-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; }
.v3-conj-cell { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; min-width: 62px; padding: 3px 8px; border-radius: 8px; background: #f1f5f9; border: 1px solid #e2e8f0; font-family: inherit; }
.v3-conj-cell-hl { background: #fef3c7; border-color: #D55E00; box-shadow: inset 0 0 0 1px #D55E00; }
.v3-conj-cell-hl .v3-conj-he { color: #b45309; }
.v3-conj-he { font-size: 15px; font-weight: 600; color: #1f2937; direction: rtl; }
.v3-conj-lab { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
.v3-conj-tr { font-size: 9.5px; color: #6b7280; font-style: italic; }
.v3-conj-tr .v3-conj-stress { color: #D55E00; font-weight: 700; font-style: normal; }
.v3-conj-rootlabel { font-size: 11px; color: #475569; font-weight: 600; }
.v3-conj-group { margin-top: 8px; }
.v3-conj-group-h { font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; }
.v3-conj-voice-h { font-size: 12px; font-weight: 800; color: #1f2937; margin: 12px 0 4px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0; }
.v3-conj-invariant { margin-top: 2px; }
.v3-conj-cell-lg { min-width: 96px; padding: 8px 14px; }
.v3-conj-cell-lg .v3-conj-he { font-size: 22px; }
.v3-conj-note { font-size: 11px; color: #6b7280; margin-top: 6px; }
.v3-conj-empty { font-size: 12px; color: #6b7280; }
.nightMode .card { color: #e5e7eb; background-color: #1f2937; }
.nightMode .russian { color: #f1f5f9; }
.nightMode .wc-meta .wc-root { color: #f1f5f9; }
.nightMode .wc-example { background: #334155; color: #e5e7eb; }
.nightMode .v3-conj-cell { background: #334155; border-color: #475569; }
.nightMode .v3-conj-he { color: #e5e7eb; }`.trim();
  const WORD_V2_FRONT =
    '<div class="he">{{Word}}</div>\n' +
    '{{#Niqqud}}<div class="niqqud">{{Niqqud}}</div>{{/Niqqud}}\n' +
    '{{#Audio}}<div>{{Audio}}</div>{{/Audio}}\n' +
    '{{^Audio}}{{tts he_IL:Word}}{{/Audio}}';
  const WORD_V2_BACK =
    '{{FrontSide}}\n<hr>\n' +
    '<div class="russian">{{Russian}}</div>\n' +
    '{{#Translit}}<div class="translit">{{Translit}}</div>{{/Translit}}\n' +
    '<div class="wc-meta">{{#Root}}<span class="wc-root" dir="rtl">{{Root}}</span>{{/Root}}{{#Binyan}} · {{Binyan}}{{/Binyan}}{{#POS}} · {{POS}}{{/POS}}</div>\n' +
    '{{#Conjugation}}<div class="v3-wordcard-conj">{{Conjugation}}</div>{{/Conjugation}}\n' +
    '{{#Example}}<div class="wc-example">{{Example}}</div>{{/Example}}\n' +
    '{{#Mnemonic}}<div class="note"><b>🧠</b> {{Mnemonic}}</div>{{/Mnemonic}}';

  // ── «LinguistPro SRS Card v1» — sentence card (6 fields) ────────────────────────────────────────────
  const SENT_V1_FIELDS = ["Hebrew", "Niqqud", "Translit", "Russian", "Note", "Audio"];
  const SENT_V1_CSS =
    '.card { font-family: "Helvetica", Arial, sans-serif; font-size: 22px; color: #1f2937; background-color: #f9fafb; text-align: center; padding: 16px; }\n' +
    '.he { font-size: 28px; direction: rtl; font-family: "Times New Roman", "David", serif; }\n' +
    '.niqqud { font-size: 26px; direction: rtl; color: #374151; }\n' +
    '.translit { font-style: italic; color: #6b7280; margin-top: 8px; }\n' +
    '.russian { font-size: 24px; color: #111827; margin-top: 12px; }\n' +
    '.note { background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px 12px; text-align: left; margin-top: 16px; font-size: 16px; }\n' +
    'hr { border: none; border-top: 1px solid #d1d5db; margin: 14px 0; }';
  const SENT_V1_FRONT =
    '<div class="he">{{Hebrew}}</div>\n' +
    '{{#Niqqud}}<div class="niqqud">{{Niqqud}}</div>{{/Niqqud}}\n' +
    '{{#Audio}}<div>{{Audio}}</div>{{/Audio}}';
  const SENT_V1_BACK =
    '{{FrontSide}}\n<hr>\n' +
    '{{#Translit}}<div class="translit">{{Translit}}</div>{{/Translit}}\n' +
    '<div class="russian">{{Russian}}</div>\n' +
    '{{#Note}}<div class="note"><b>Note:</b> {{Note}}</div>{{/Note}}';

  function wordV2() {
    return { modelName: "LinguistPro Word v2", fieldNames: WORD_V2_FIELDS.slice(), templates: [{ Name: "Card 1", Front: WORD_V2_FRONT, Back: WORD_V2_BACK }], css: WORD_V2_CSS };
  }
  function srsCardV1() {
    return { modelName: "LinguistPro SRS Card v1", fieldNames: SENT_V1_FIELDS.slice(), templates: [{ Name: "Card 1", Front: SENT_V1_FRONT, Back: SENT_V1_BACK }], css: SENT_V1_CSS };
  }
  // AnkiConnect shape { modelName, fields, css, front, back } — so index.html's v3AnkiWordModelSpec can delegate.
  function toAnkiConnect(spec) {
    return { modelName: spec.modelName, fields: spec.fieldNames, css: spec.css, front: spec.templates[0].Front, back: spec.templates[0].Back };
  }

  return { wordV2, srsCardV1, toAnkiConnect, WORD_V2_FIELDS, SENT_V1_FIELDS };
});
