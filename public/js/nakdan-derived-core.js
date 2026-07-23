(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.NakdanDerivedCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseJson(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try { var parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" ? parsed : {}; }
    catch (_) { return {}; }
  }

  function splitLines(text) {
    return String(text == null ? "" : text).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function plainBody(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      return String((row && (row.he_plain != null ? row.he_plain : row.he)) || "").trim();
    }).filter(Boolean).join("\n");
  }

  function hasAssertedNiqqud(row) {
    if (!row) return false;
    if (String(row.he_niqqud != null ? row.he_niqqud : (row.heNiqqud || "")).trim()) return true;
    var edit = parseJson(row.edit_meta_json);
    return !!(edit.edited && edit.edited.he_niqqud);
  }

  function derivedOf(row) {
    var meta = parseJson(row && row.meta_json);
    var derived = meta.niqqud_derived;
    return derived && typeof derived === "object" ? derived : null;
  }

  function applyProjection(rows, sourceHash) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      var out = Object.assign({}, row);
      if (hasAssertedNiqqud(row)) {
        out.niqqud_authority = "ASSERTED";
        return out;
      }
      var derived = derivedOf(row);
      if (derived && derived.source_hash === sourceHash && String(derived.value || "").trim()) {
        out.he_niqqud = String(derived.value);
        out.niqqud_authority = "DERIVED";
        out.niqqud_provenance = String(derived.provenance || "");
      }
      return out;
    });
  }

  function mergeDerivedMeta(row, value, details) {
    if (hasAssertedNiqqud(row)) {
      var error = new Error("NIQQUD_ASSERTED_PROTECTED");
      error.code = "NIQQUD_ASSERTED_PROTECTED";
      throw error;
    }
    var meta = parseJson(row && row.meta_json);
    meta.niqqud_derived = {
      value: String(value || ""),
      authority: "DERIVED",
      provider: "DICTA_NAKDAN",
      provenance: String(details.provenance || ""),
      source_hash: String(details.source_hash || ""),
      generated_at: String(details.generated_at || ""),
      model_version: String(details.model_version || ""),
    };
    return JSON.stringify(meta);
  }

  return Object.freeze({ parseJson: parseJson, splitLines: splitLines, plainBody: plainBody,
    hasAssertedNiqqud: hasAssertedNiqqud, derivedOf: derivedOf,
    applyProjection: applyProjection, mergeDerivedMeta: mergeDerivedMeta });
});
