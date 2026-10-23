// public/js/work-zip.js — one ZIP for a work made of parts (Modern release Ф4б, design
// docs/planning/modern-release/2026-10-23/F4B_WORK_ZIP_DESIGN.md). Built from the PUBLIC learning bodies of the parts,
// each verified against the sealed table of contents — never from the device copy, so no notes, progress or other
// learner data can enter it, and nothing is written to the device. The archive is an ordinary learning bundle
// (manifest.json + library/library.json with one text per part, in table-of-contents order) plus work/toc.json:
// every part keeps its text_key, learning edition and part identity, so importing it equals opening the parts.
// Dependencies come as arguments (Node-testable):
//   fetchBody(part) → ArrayBuffer of the part body; Edition: BenYehudaLearningEdition; WorkParts; Share: ShareService.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WorkZip = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function abortError() { var e = new Error("aborted"); e.name = "AbortError"; return e; }

  // → { blob, filename, manifest, facts } — throws { code: 'PART_FAILED', part, order, cause } when a part cannot be
  // fetched or does not match its seal; no partial archive is ever produced.
  async function buildWorkZip(o) {
    var card = o.card, toc = o.toc, WP = o.WorkParts, Edition = o.Edition;
    if (!card || !toc || !Array.isArray(toc.parts) || !toc.parts.length) throw new TypeError("work and table of contents are required");
    if (!o.tocBytes) throw new TypeError("sealed table of contents bytes are required");
    var texts = [], head = null;
    for (var i = 0; i < toc.parts.length; i++) {
      if (o.signal && o.signal.aborted) throw abortError();
      var part = toc.parts[i], partCard = WP.partCard(card, part), bundle;
      try {
        var bytes = await o.fetchBody(part, partCard);
        bundle = await Edition.verifyBundle(partCard, bytes);
      } catch (cause) {
        if (o.signal && o.signal.aborted) throw abortError();
        var err = new Error("PART_FAILED"); err.code = "PART_FAILED"; err.part = part.part_id; err.order = i + 1; err.cause = cause; throw err;
      }
      var lib = bundle && bundle.library;
      if (!lib || !Array.isArray(lib.texts) || lib.texts.length !== 1) { var bad = new Error("PART_FAILED"); bad.code = "PART_FAILED"; bad.part = part.part_id; bad.order = i + 1; throw bad; }
      if (!head) head = { schema_version: lib.schema_version, corpus_meta_version: lib.corpus_meta_version };
      texts.push(lib.texts[0]);
      if (typeof o.onPart === "function") o.onPart(i + 1, toc.parts.length);
    }
    var work = {
      schema: "benyehuda-work-zip-v1", work_id: String(card.id), title: card.title || toc.title || "", author: card.author || toc.author || "",
      catalog_version: o.catalogVersion || null, toc_sha256: card.toc_sha256, scope: toc.scope || null,
      parts: toc.parts.map(function (p) { return { part_id: p.part_id, order: p.order, track: p.track, parent: p.parent || null, title: p.title,
        text_key: p.text_key, learning_edition_id: p.learning_edition_id, bundle_sha256: p.bundle_sha256, rows: p.rows }; }),
    };
    var bundleOut = { manifest: { work: work }, library: { schema_version: head.schema_version, corpus_meta_version: head.corpus_meta_version,
      texts: texts, shelves: [], audio_assets: [] } };
    return o.Share.buildLearningPackage({
      JSZip: o.JSZip, bundle: bundleOut, signal: o.signal,
      fetchAudio: function () { return Promise.reject(new Error("no audio in a public learning edition")); },
      filename: "work-" + String(card.id) + "-" + (o.slug || "ben-yehuda") + "-learning.zip",
      generator: "work-zip", generatedAt: o.generatedAt, outputType: o.outputType,
      augmentZip: function (zip) { zip.file("work/toc.json", o.tocBytes); },
      onPackProgress: o.onPackProgress,
    });
  }

  return { buildWorkZip: buildWorkZip };
});
