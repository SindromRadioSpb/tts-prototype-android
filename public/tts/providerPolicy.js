(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LocalNeuralTtsProviderPolicy = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_PROVIDER_POLICY = Object.freeze({
    hebrewLocalExperimentalEnabled: false
  });

  function normalizeLang(lang) {
    var raw = String(lang || "").trim().toLowerCase();
    if (raw === "en" || raw.indexOf("en-") === 0) return "en";
    if (raw === "he" || raw.indexOf("he-") === 0) return "he";
    if (raw === "ru" || raw.indexOf("ru-") === 0) return "ru";
    return raw || "he";
  }

  function getEffectivePolicy(config) {
    return Object.assign({}, DEFAULT_PROVIDER_POLICY, config || {});
  }

  function shouldUseLocalTts(lang, config) {
    var normalizedLang = normalizeLang(lang);
    var policy = getEffectivePolicy(config);

    if (normalizedLang === "en") return true;
    if (normalizedLang === "he") return policy.hebrewLocalExperimentalEnabled === true;
    return false;
  }

  function describeTtsMode(lang, config) {
    return shouldUseLocalTts(lang, config) ? "local" : "online";
  }

  return {
    DEFAULT_PROVIDER_POLICY: DEFAULT_PROVIDER_POLICY,
    normalizeLang: normalizeLang,
    getEffectivePolicy: getEffectivePolicy,
    shouldUseLocalTts: shouldUseLocalTts,
    describeTtsMode: describeTtsMode
  };
});
