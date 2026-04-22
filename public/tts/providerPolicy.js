(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LocalNeuralTtsProviderPolicy = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PROVIDERS = Object.freeze({
    ONLINE: "online_tts",
    HEBREW_LOCAL: "hebrew_phonikud_piper",
    WEB_WASM: "local_neural_tts_piper",
    SYSTEM: "system_fallback"
  });

  var DEFAULT_PROVIDER_POLICY = Object.freeze({
    hebrewLocalExperimentalEnabled: true,
    hebrewLocalLicenseMode: "noncommercial"
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

  function isHebrewLocalAllowed(config) {
    var policy = getEffectivePolicy(config);
    if (policy.hebrewLocalExperimentalEnabled !== true) return false;
    return ["research_only", "noncommercial"].indexOf(String(policy.hebrewLocalLicenseMode || "")) >= 0;
  }

  function shouldUseLocalTts(lang, config) {
    var normalizedLang = normalizeLang(lang);
    var policy = getEffectivePolicy(config);

    if (normalizedLang === "en") return true;
    if (normalizedLang === "he") return isHebrewLocalAllowed(policy);
    return false;
  }

  function isProviderSupportedForLang(providerId, lang, config) {
    var normalizedProvider = String(providerId || "").trim();
    var normalizedLang = normalizeLang(lang);

    if (normalizedProvider === PROVIDERS.ONLINE || normalizedProvider === PROVIDERS.SYSTEM) return true;
    if (normalizedProvider === PROVIDERS.HEBREW_LOCAL) {
      return normalizedLang === "he" && isHebrewLocalAllowed(config);
    }
    if (normalizedProvider === PROVIDERS.WEB_WASM) {
      return normalizedLang === "en";
    }
    return false;
  }

  function getDefaultProviderForLang(lang, config) {
    var normalizedLang = normalizeLang(lang);
    if (normalizedLang === "en") return PROVIDERS.WEB_WASM;
    if (normalizedLang === "he" && isHebrewLocalAllowed(config)) return PROVIDERS.HEBREW_LOCAL;
    return PROVIDERS.ONLINE;
  }

  function resolveSelectedProvider(lang, selectedProvider, config) {
    var providerId = String(selectedProvider || "").trim();
    if (isProviderSupportedForLang(providerId, lang, config)) return providerId;
    return getDefaultProviderForLang(lang, config);
  }

  function describeTtsMode(lang, config) {
    return shouldUseLocalTts(lang, config) ? "local" : "online";
  }

  return {
    PROVIDERS: PROVIDERS,
    DEFAULT_PROVIDER_POLICY: DEFAULT_PROVIDER_POLICY,
    normalizeLang: normalizeLang,
    getEffectivePolicy: getEffectivePolicy,
    isHebrewLocalAllowed: isHebrewLocalAllowed,
    shouldUseLocalTts: shouldUseLocalTts,
    isProviderSupportedForLang: isProviderSupportedForLang,
    getDefaultProviderForLang: getDefaultProviderForLang,
    resolveSelectedProvider: resolveSelectedProvider,
    describeTtsMode: describeTtsMode
  };
});
