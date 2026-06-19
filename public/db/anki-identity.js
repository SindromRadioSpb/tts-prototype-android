/* ── anki-identity.js — canonical cross-transport note identity (⑤ hardening P0) ──────────────────────
 * ONE source of truth for how a word maps to an Anki tag, used by BOTH write paths (the `.apkg` builder
 * and the AnkiConnect push) AND the read-back. Fixes the cross-surface identity split (audit 2026-06-19):
 * the read-back used to key only on the per-note `lp_note_<id>` tag (stamped only by AnkiConnect push), so
 * `.apkg`-imported cards were invisible to it. Now every word card also carries `lp_lemma_<hash>` (a
 * tag-safe hash of the lemma key), and the read-back fans a lemma's Anki mastery out to ALL `word_study`
 * notes sharing that lemma. `.apkg` dedups by lemma (1 card ↔ many notes), so lemma — not note — is the
 * right identity unit. The hash is forward-computed identically on both sides (export stamps it; read-back
 * builds a {tag → noteIds} map), so it round-trips without needing to be reversible.
 * UMD: require() in Node, global `AnkiIdentity` in the browser. Depends on anki-apkg-core (sha1Hex).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./anki-apkg-core.js"));
  else root.AnkiIdentity = factory(root.AnkiApkgCore);
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  // The lemma key for a word_study note body — byte-identical to anki-srs-export's existing key (so the
  // export GUID `word:<key>` is unchanged) and used by BOTH the tag-stamp and the read-back's tag→notes map:
  // `pid:<pealim_id>` when present, else `w:<stripped word|lemma|niqqud>#<pos>` (HTML/media stripped, trimmed).
  function lemmaKey(body) {
    body = body || {};
    if (body.pealim_id != null && String(body.pealim_id) !== "") return "pid:" + String(body.pealim_id);
    const w = core.stripHtmlMedia(body.word || body.lemma || body.niqqud_variant || body.niqqud).trim();
    return "w:" + w + "#" + String(body.pos || body.part_of_speech || "");
  }

  // A tag-safe, collision-resistant Anki tag for a lemma key. Hash → only [0-9a-f], so no spaces/colons/#/
  // Hebrew-char issues in Anki tags. Forward-computed on both export and read-back.
  function lemmaTag(key) {
    return "lp_lemma_" + core.sha1Hex(String(key || "")).slice(0, 12);
  }
  function lemmaTagForBody(body) { return lemmaTag(lemmaKey(body)); }

  // Canonical tag set for a word card (both transports). `noteId` (optional) adds the per-note fast-path tag.
  function wordTags(body, noteId) {
    const tags = ["lp", "lp_word"];
    const pos = String((body && (body.pos || body.part_of_speech)) || "");
    if (pos) tags.push("lp_pos_" + pos.replace(/\s+/g, "_"));
    tags.push(lemmaTagForBody(body));
    if (noteId != null && String(noteId) !== "") tags.push("lp_note_" + String(noteId));
    return tags;
  }

  return { lemmaKey, lemmaTag, lemmaTagForBody, wordTags, LEMMA_TAG_PREFIX: "lp_lemma_", NOTE_TAG_PREFIX: "lp_note_" };
});
