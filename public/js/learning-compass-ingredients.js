// B7 Learning Compass — shared lexical ingredient producer.
// Pure/UMD so the browser Worker and the membership-gated server index use the
// same conservative resolver. The returned object contains aggregates only.
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LearningCompassIngredients = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RESOLVER_VERSION = "recorded-familiarity-v2";
  var LEXICAL_RESOLVER_VERSION = "room-lexical-worker-v2+pealim-infl-v12+function-links-v1";
  var INGREDIENTS_SCHEMA = "room.learning_ingredients.2.0.1";
  var MAX_TOKENS = 250000;
  var MAX_TYPES = 50000;
  var MAX_PACKET_BYTES = 256 * 1024;
  var HEBREW_TOKEN = /[א-ת][א-ת\u0591-\u05C7\u05F3\u05F4'’-]*/gu;
  var PROCLITIC = /^[ובכלמשה]/;

  function stripMarks(value) {
    return String(value || "").normalize("NFC").replace(/[\u0591-\u05C7]/g, "").replace(/[\u05F3\u05F4'’-]/g, "");
  }

  function exactForm(value) {
    return String(value || "").normalize("NFC").replace(/[\u0591-\u05AF]/g, "").replace(/[\u05F3\u05F4'’-]/g, "");
  }

  function addCandidate(map, form, pid) {
    if (!form || !pid) return;
    var values = map.get(form);
    if (!values) { values = new Set(); map.set(form, values); }
    values.add(pid);
  }

  function addParadigmForms(paradigm, exact, skeleton) {
    var pid = paradigm && paradigm.pealim_id != null ? String(paradigm.pealim_id) : "";
    if (!pid) return;
    var forms = [paradigm.lemma, paradigm.lemma_niqqud, paradigm.form];
    Object.keys(paradigm.cells || {}).forEach(function (key) { forms.push(paradigm.cells[key] && paradigm.cells[key].he); });
    forms.forEach(function (form) {
      var precise = exactForm(form), bare = stripMarks(form);
      if (precise) addCandidate(exact, precise, pid);
      if (bare) addCandidate(skeleton, bare, pid);
    });
  }

  function buildResolver(dataset, functionData) {
    var exact = new Map(), skeleton = new Map(), functions = new Map();
    (dataset && Array.isArray(dataset.paradigms) ? dataset.paradigms : []).forEach(function (paradigm) {
      addParadigmForms(paradigm, exact, skeleton);
    });
    Object.keys(functionData && functionData.links || {}).forEach(function (form) {
      var row = functionData.links[form];
      if (row && row.id != null) functions.set(stripMarks(form), String(row.id));
    });
    return {
      exact: exact,
      skeleton: skeleton,
      functions: functions,
      dataset_version: dataset && dataset.model_version || "pealim-infl-v12",
    };
  }

  function uniqueCandidate(map, form) {
    var values = map.get(form);
    return values && values.size === 1 ? values.values().next().value : null;
  }

  function resolveToken(token, resolver) {
    var precise = exactForm(token), bare = stripMarks(token);
    if (!bare) return null;
    var functionPid = resolver.functions.get(bare);
    if (functionPid) return functionPid;
    if (precise !== bare) {
      var exactPid = uniqueCandidate(resolver.exact, precise);
      if (exactPid) return exactPid;
    }
    var plainPid = uniqueCandidate(resolver.skeleton, bare);
    if (plainPid) return plainPid;
    if (bare.length >= 3 && PROCLITIC.test(bare)) {
      var base = bare.slice(1);
      var baseFunction = resolver.functions.get(base);
      if (baseFunction) return baseFunction;
      var basePid = uniqueCandidate(resolver.skeleton, base);
      if (basePid) return basePid;
    }
    return null;
  }

  function rowHebrew(row) {
    return String(row && (row.he_niqqud || row.hebrew_niqqud || row.he_plain || row.hebrew_plain) || "");
  }

  function normalizedContent(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) { return rowHebrew(row).normalize("NFC"); }).join("\n");
  }

  function byteLength(value) {
    var encoded = JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(encoded).byteLength;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(encoded, "utf8");
    return encoded.length;
  }

  function analyzeRows(rows, resolver, meta) {
    if (!resolver || !resolver.exact || !resolver.skeleton || !resolver.functions) throw new Error("LEXICAL_RESOLVER_UNAVAILABLE");
    meta = meta || {};
    var frequencies = new Map();
    var total = 0, unresolved = 0;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var source = rowHebrew(row).normalize("NFC");
      var tokens = source.match(HEBREW_TOKEN) || [];
      tokens.forEach(function (token) {
        total += 1;
        if (total > MAX_TOKENS) throw new Error("TOKEN_LIMIT_EXCEEDED");
        var pid = resolveToken(token, resolver);
        if (!pid) { unresolved += 1; return; }
        var key = "pid:" + pid;
        frequencies.set(key, (frequencies.get(key) || 0) + 1);
        if (frequencies.size > MAX_TYPES) throw new Error("TYPE_LIMIT_EXCEEDED");
      });
    });
    if (!total) throw new Error("NO_HEBREW_TOKENS");
    var result = {
      schema_version: "room.learning_ingredients.2.0.1",
      source_class: String(meta.source_class || ""),
      source_key: String(meta.source_key || ""),
      content_revision: String(meta.content_revision || ""),
      content_sha256: String(meta.content_sha256 || ""),
      entitlement_revision: meta.entitlement_revision == null ? null : String(meta.entitlement_revision),
      resolver_version: RESOLVER_VERSION,
      lexical_resolver_version: LEXICAL_RESOLVER_VERSION,
      dataset_version: resolver.dataset_version,
      key_frequencies: Array.from(frequencies, function (entry) { return [entry[0], entry[1]]; })
        .sort(function (a, b) { return a[0].localeCompare(b[0]); }),
      unresolved_token_count: unresolved,
      proper_name_token_count: 0,
      total_token_count: total,
      built_at: meta.built_at || new Date().toISOString(),
    };
    if (byteLength(result) > MAX_PACKET_BYTES) throw new Error("PACKET_LIMIT_EXCEEDED");
    return result;
  }

  return Object.freeze({
    RESOLVER_VERSION: RESOLVER_VERSION,
    LEXICAL_RESOLVER_VERSION: LEXICAL_RESOLVER_VERSION,
    INGREDIENTS_SCHEMA: INGREDIENTS_SCHEMA,
    MAX_TOKENS: MAX_TOKENS,
    MAX_TYPES: MAX_TYPES,
    MAX_PACKET_BYTES: MAX_PACKET_BYTES,
    buildResolver: buildResolver,
    resolveToken: resolveToken,
    normalizedContent: normalizedContent,
    analyzeRows: analyzeRows,
    byteLength: byteLength,
  });
});
