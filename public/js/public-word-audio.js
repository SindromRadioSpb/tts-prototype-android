(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PublicWordAudio = api.createResolver({});
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var HASH = /^[a-f0-9]{64}$/;
  var DEFAULT_ENDPOINT = "/api/public-corpora/materials-science-year1-problem-book-2/learning-support/word-audio-index";
  function normalize(value) { return String(value == null ? "" : value).normalize("NFC").replace(/\s+/g, " ").trim(); }
  function createResolver(options) {
    options = options || {};
    var endpoint = String(options.endpoint || DEFAULT_ENDPOINT);
    var fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(typeof window !== "undefined" ? window : null) : null);
    var loading = null, index = null, unavailable = false;
    async function load() {
      if (index || unavailable) return index;
      if (loading) return loading;
      loading = (async function () {
        try {
          if (!fetchImpl) return null;
          var response = await fetchImpl(endpoint, { cache: "force-cache", credentials: "same-origin" });
          if (!response || !response.ok) return null;
          var payload = await response.json();
          if (!payload || payload.schema_version !== "materials_pb2_public_word_audio.1.0.0"
            || !HASH.test(String(payload.edition_manifest_sha256 || "")) || !String(payload.edition_id || "")
            || !String(payload.profile_id || "") || !Array.isArray(payload.words)) return null;
          var next = new Map();
          for (var word of payload.words) {
            var text = normalize(word && word.text), key = String(word && word.asset_key || "");
            var url = String(word && word.audio_url || "");
            if (!text || !HASH.test(key) || url !== "/api/audio/" + encodeURIComponent(key) || next.has(text)) return null;
            next.set(text, Object.freeze({ text: text, asset_key: key, audio_url: url, profile_id: payload.profile_id,
              edition_id: payload.edition_id, edition_manifest_sha256: payload.edition_manifest_sha256 }));
          }
          index = next; return index;
        } catch (_) { return null; }
        finally { loading = null; }
      })();
      var result = await loading;
      if (!result) unavailable = true;
      return result;
    }
    async function resolve(text) {
      var key = normalize(text); if (!key) return null;
      var values = await load(); return values && values.get(key) || null;
    }
    return Object.freeze({ resolve: resolve, load: load, normalize: normalize });
  }
  return Object.freeze({ DEFAULT_ENDPOINT: DEFAULT_ENDPOINT, normalize: normalize, createResolver: createResolver });
});
