(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TtsSettingsStore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "ttsDashboard_voiceConfig_v1";
  var PROVIDERS = Object.freeze([
    "online_tts",
    "hebrew_phonikud_piper",
    "local_neural_tts_piper",
    "system_fallback"
  ]);
  var DEFAULT_SETTINGS = Object.freeze({
    selectedProvider: "online_tts",
    speed: 1.0,
    pitch: 0.0,
    voices: Object.freeze({
      online_tts: "",
      hebrew_phonikud_piper: "shaul",
      local_neural_tts_piper: "en-default",
      system_fallback: ""
    })
  });

  function cloneDefaultSettings() {
    return {
      selectedProvider: DEFAULT_SETTINGS.selectedProvider,
      speed: DEFAULT_SETTINGS.speed,
      pitch: DEFAULT_SETTINGS.pitch,
      voices: Object.assign({}, DEFAULT_SETTINGS.voices)
    };
  }

  function normalizeProviderId(providerId) {
    var value = String(providerId || "").trim();
    return PROVIDERS.indexOf(value) >= 0 ? value : DEFAULT_SETTINGS.selectedProvider;
  }

  function normalizeSpeed(speed) {
    var value = Number(speed);
    if (!Number.isFinite(value)) value = DEFAULT_SETTINGS.speed;
    if (value < 0.5) value = 0.5;
    if (value > 2.0) value = 2.0;
    return Math.round(value * 10) / 10;
  }

  function normalizePitch(pitch) {
    var value = Number(pitch);
    if (!Number.isFinite(value)) value = DEFAULT_SETTINGS.pitch;
    if (value < -5) value = -5;
    if (value > 5) value = 5;
    return Math.round(value * 10) / 10;
  }

  function normalizeVoiceMap(voices) {
    var result = Object.assign({}, DEFAULT_SETTINGS.voices);
    if (!voices || typeof voices !== "object") return result;
    PROVIDERS.forEach(function (providerId) {
      if (typeof voices[providerId] === "string") {
        result[providerId] = voices[providerId];
      }
    });
    return result;
  }

  function isLegacyConfig(config) {
    return !!(
      config &&
      typeof config === "object" &&
      !config.selectedProvider &&
      (Object.prototype.hasOwnProperty.call(config, "voice") ||
        Object.prototype.hasOwnProperty.call(config, "rate") ||
        Object.prototype.hasOwnProperty.call(config, "pitch"))
    );
  }

  function migrateLegacyConfig(config) {
    var next = cloneDefaultSettings();
    if (!config || typeof config !== "object") return next;
    next.speed = normalizeSpeed(config.rate);
    next.pitch = normalizePitch(config.pitch);
    if (typeof config.voice === "string") {
      next.voices.online_tts = config.voice;
    }
    return next;
  }

  function normalizeSettings(config) {
    if (isLegacyConfig(config)) return migrateLegacyConfig(config);

    var next = cloneDefaultSettings();
    if (!config || typeof config !== "object") return next;

    next.selectedProvider = normalizeProviderId(config.selectedProvider);
    next.speed = normalizeSpeed(config.speed);
    next.pitch = normalizePitch(config.pitch);
    next.voices = normalizeVoiceMap(config.voices);

    return next;
  }

  function parseStoredSettings(raw) {
    if (!raw) return cloneDefaultSettings();
    try {
      var parsed = JSON.parse(raw);
      return normalizeSettings(parsed);
    } catch (_) {
      return cloneDefaultSettings();
    }
  }

  function serializeSettings(settings) {
    var normalized = normalizeSettings(settings);
    return JSON.stringify(normalized);
  }

  function getVoiceForProvider(settings, providerId) {
    var normalized = normalizeSettings(settings);
    var resolvedProvider = normalizeProviderId(providerId || normalized.selectedProvider);
    return normalized.voices[resolvedProvider] || "";
  }

  function setVoiceForProvider(settings, providerId, voiceId) {
    var normalized = normalizeSettings(settings);
    var resolvedProvider = normalizeProviderId(providerId || normalized.selectedProvider);
    normalized.voices[resolvedProvider] = String(voiceId || "");
    return normalized;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    PROVIDERS: PROVIDERS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    cloneDefaultSettings: cloneDefaultSettings,
    normalizeProviderId: normalizeProviderId,
    normalizeSpeed: normalizeSpeed,
    normalizePitch: normalizePitch,
    normalizeSettings: normalizeSettings,
    migrateLegacyConfig: migrateLegacyConfig,
    parseStoredSettings: parseStoredSettings,
    serializeSettings: serializeSettings,
    getVoiceForProvider: getVoiceForProvider,
    setVoiceForProvider: setVoiceForProvider
  };
});
