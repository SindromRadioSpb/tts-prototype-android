(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.LocalNeuralTtsCore = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var PROVIDER_NAME = "local_neural_tts_piper";
  var PREPROCESSING_VERSION = "hebrew-preprocess-v1";
  var DEFAULT_TTS_CONFIG = Object.freeze({
    enabled: true,
    provider: PROVIDER_NAME,
    preferredBackend: "web_wasm",
    webWasmEnabled: true,
    webWasmRuntimePath: "/tts/runtime/sherpa-onnx",
    allowSystemFallback: true,
    preload: false,
    modelStagingRequired: true,
    cacheEnabled: true,
    maxChars: 2000,
    cacheMaxMb: 250,
    defaultSpeed: 1.0,
    debugDiagnostics: true,
    manifestBasePath: "/tts/models"
  });

  var DEFAULT_VOICES = Object.freeze({
    "he-default": Object.freeze({
      voiceId: "he-default",
      lang: "he",
      provider: PROVIDER_NAME,
      displayName: "Hebrew Piper Local",
      qualityTier: "baseline",
      defaultSpeed: 1.0
    }),
    "ru-default": Object.freeze({
      voiceId: "ru-default",
      lang: "ru",
      provider: PROVIDER_NAME,
      displayName: "Russian Piper Local",
      qualityTier: "baseline",
      defaultSpeed: 1.0
    }),
    "en-default": Object.freeze({
      voiceId: "en-default",
      lang: "en",
      provider: PROVIDER_NAME,
      displayName: "English Piper Local",
      qualityTier: "baseline",
      defaultSpeed: 1.0
    })
  });

  function assignShallow() {
    var result = {};
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (!value || typeof value !== "object") continue;
      Object.keys(value).forEach(function (key) {
        result[key] = value[key];
      });
    }
    return result;
  }

  function normalizeToTtsLang(lang) {
    var raw = String(lang || "").trim().toLowerCase();
    if (!raw) return "he";
    if (raw === "he" || raw.indexOf("he-") === 0) return "he";
    if (raw === "ru" || raw.indexOf("ru-") === 0) return "ru";
    if (raw === "en" || raw.indexOf("en-") === 0) return "en";
    throw createTtsError("unsupported_lang", "Unsupported TTS language: " + lang);
  }

  function normalizeSpeed(speed, fallbackValue) {
    var value = Number(speed);
    if (!Number.isFinite(value)) value = Number(fallbackValue);
    if (!Number.isFinite(value)) value = DEFAULT_TTS_CONFIG.defaultSpeed;
    if (value < 0.5) value = 0.5;
    if (value > 2.0) value = 2.0;
    return Math.round(value * 10) / 10;
  }

  function normalizePitch(pitch, fallbackValue) {
    var value = Number(pitch);
    if (!Number.isFinite(value)) value = Number(fallbackValue);
    if (!Number.isFinite(value)) value = 0.0;
    if (value < -20) value = -20;
    if (value > 20) value = 20;
    return value;
  }

  function stripHtml(input) {
    return String(input || "").replace(/<[^>]*>/g, " ");
  }

  function normalizeWhitespace(input) {
    return String(input || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitSentences(text) {
    var normalized = normalizeWhitespace(text);
    if (!normalized) return [];

    var chunks = [];
    var buffer = "";
    for (var i = 0; i < normalized.length; i += 1) {
      var char = normalized[i];
      buffer += char;
      if (/[.!?׃]/.test(char)) {
        var nextChar = normalized[i + 1] || "";
        if (!nextChar || /\s/.test(nextChar)) {
          chunks.push(buffer.trim());
          buffer = "";
        }
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks.length ? chunks : [normalized];
  }

  function splitByLength(text, maxChars) {
    var value = normalizeWhitespace(text);
    if (!value) return [];
    if (value.length <= maxChars) return [value];

    var words = value.split(" ");
    var chunks = [];
    var current = "";

    words.forEach(function (word) {
      var candidate = current ? current + " " + word : word;
      if (candidate.length <= maxChars) {
        current = candidate;
        return;
      }
      if (current) chunks.push(current);
      if (word.length <= maxChars) {
        current = word;
        return;
      }
      for (var start = 0; start < word.length; start += maxChars) {
        chunks.push(word.slice(start, start + maxChars));
      }
      current = "";
    });

    if (current) chunks.push(current);
    return chunks;
  }

  function createTtsError(code, message, extras) {
    var error = new Error(message);
    error.code = code;
    if (extras && typeof extras === "object") {
      Object.keys(extras).forEach(function (key) {
        error[key] = extras[key];
      });
    }
    return error;
  }

  function createDiagnostics(base) {
    var defaults = {
      modelLoadMs: undefined,
      synthMs: 0,
      renderMs: undefined,
      textChars: 0,
      backend: "system_fallback",
      provider: PROVIDER_NAME,
      preferredBackend: "web_wasm",
      actualBackend: "system_fallback",
      cacheHit: false,
      modelVersion: undefined,
      voiceId: "he-default",
      runtime: "sherpa-onnx",
      runtimeStatus: "runtime_missing",
      modelStatus: "model_missing",
      synthesisStatus: "idle",
      modelPath: undefined,
      configPath: undefined,
      tokensPath: undefined,
      dataDirPath: undefined,
      checksumStatus: "missing",
      configChecksumStatus: "missing",
      fallbackReason: null,
      manifestStatus: "unknown"
    };
    return assignShallow(defaults, base || {});
  }

  function stableStringify(value) {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(stableStringify).join(",") + "]";
    }
    if (typeof value !== "object") return JSON.stringify(value);
    var keys = Object.keys(value).sort();
    var pairs = keys.map(function (key) {
      return JSON.stringify(key) + ":" + stableStringify(value[key]);
    });
    return "{" + pairs.join(",") + "}";
  }

  async function sha256Hex(text) {
    var payload = String(text || "");

    if (root && root.crypto && root.crypto.subtle && typeof TextEncoder !== "undefined") {
      var bytes = new TextEncoder().encode(payload);
      var digest = await root.crypto.subtle.digest("SHA-256", bytes);
      return Array.prototype.map
        .call(new Uint8Array(digest), function (value) {
          return value.toString(16).padStart(2, "0");
        })
        .join("");
    }

    if (typeof require === "function") {
      var crypto = require("node:crypto");
      return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
    }

    throw createTtsError("sha256_unavailable", "SHA-256 is not available in this runtime");
  }

  async function buildTtsCacheKey(input) {
    var payload = {
      provider: String(input && input.provider ? input.provider : PROVIDER_NAME),
      voiceId: String(input && input.voiceId ? input.voiceId : ""),
      lang: normalizeToTtsLang(input && input.lang),
      normalizedText: String(input && input.normalizedText ? input.normalizedText : ""),
      speed: normalizeSpeed(input && input.speed, DEFAULT_TTS_CONFIG.defaultSpeed),
      modelVersion: String(input && input.modelVersion ? input.modelVersion : ""),
      preprocessingVersion: String(
        input && input.preprocessingVersion ? input.preprocessingVersion : PREPROCESSING_VERSION
      )
    };
    return sha256Hex(stableStringify(payload));
  }

  function TextNormalizer() {}
  TextNormalizer.prototype.normalize = function (text) {
    return normalizeWhitespace(stripHtml(text));
  };

  function HebrewPreprocessor(options) {
    this.options = assignShallow({ maxChars: DEFAULT_TTS_CONFIG.maxChars }, options || {});
    this.textNormalizer = new TextNormalizer();
  }

  HebrewPreprocessor.prototype.preprocess = function (text, request) {
    var lang = normalizeToTtsLang(request && request.lang);
    var maxChars = Number(request && request.maxChars);
    if (!Number.isFinite(maxChars) || maxChars < 1) maxChars = this.options.maxChars;

    var stripped = stripHtml(text);
    var normalized = this.textNormalizer.normalize(stripped);
    if (normalized.length > maxChars) normalized = normalized.slice(0, maxChars).trim();

    var chunks = [];
    splitSentences(normalized).forEach(function (chunk) {
      splitByLength(chunk, maxChars).forEach(function (nested) {
        if (nested) chunks.push(nested);
      });
    });

    if (!chunks.length && normalized) chunks.push(normalized);

    return {
      lang: lang,
      normalizedText: normalized,
      chunks: chunks,
      preprocessingVersion: PREPROCESSING_VERSION,
      textChars: normalized.length
    };
  };

  function TTSVoiceRegistry(voices) {
    this.voices = assignShallow(DEFAULT_VOICES, voices || {});
  }

  TTSVoiceRegistry.prototype.getVoice = function (voiceId) {
    return this.voices[String(voiceId || "").trim()] || null;
  };

  TTSVoiceRegistry.prototype.getDefaultVoice = function (lang) {
    var normalizedLang = normalizeToTtsLang(lang);
    var voices = Object.keys(this.voices).map(
      function (voiceId) {
        return this.voices[voiceId];
      }.bind(this)
    );
    return voices.find(function (voice) {
      return voice && voice.lang === normalizedLang;
    }) || null;
  };

  TTSVoiceRegistry.prototype.resolveVoiceId = function (voiceId, lang) {
    var requested = this.getVoice(voiceId);
    if (requested) return requested.voiceId;
    var fallbackVoice = this.getDefaultVoice(lang);
    return fallbackVoice ? fallbackVoice.voiceId : "he-default";
  };

  TTSVoiceRegistry.prototype.list = function () {
    return Object.keys(this.voices).map(
      function (voiceId) {
        return this.voices[voiceId];
      }.bind(this)
    );
  };

  function fetchJson(fetchImpl, url) {
    if (typeof fetchImpl !== "function") {
      return Promise.reject(createTtsError("fetch_unavailable", "fetch() is not available"));
    }
    return fetchImpl(url).then(function (response) {
      if (!response || !response.ok) {
        var status = response && typeof response.status === "number" ? response.status : 0;
        throw createTtsError("manifest_fetch_failed", "Failed to fetch manifest: " + url, {
          status: status,
          url: url
        });
      }
      return response.json();
    });
  }

  function ModelManifestLoader(options) {
    this.basePath = (options && options.basePath) || "/tts/models";
    this.fetchImpl =
      (options && options.fetchImpl) ||
      (root && typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    this.cache = new Map();
    this.voiceRegistry = (options && options.voiceRegistry) || new TTSVoiceRegistry();
  }

  ModelManifestLoader.prototype._manifestUrlForLang = function (lang) {
    return this.basePath.replace(/\/$/, "") + "/" + normalizeToTtsLang(lang) + "/manifest.json";
  };

  ModelManifestLoader.prototype.validate = function (manifest) {
    if (!manifest || typeof manifest !== "object") {
      throw createTtsError("invalid_manifest", "Manifest must be an object");
    }
    var required = [
      "voiceId",
      "lang",
      "provider",
      "runtime",
      "modelVersion",
      "modelPath",
      "configPath",
      "sampleRate"
    ];
    required.forEach(function (field) {
      if (!manifest[field]) {
        throw createTtsError("invalid_manifest", "Manifest field is required: " + field);
      }
    });
    if (!Array.isArray(manifest.platforms) || !manifest.platforms.length) {
      throw createTtsError("invalid_manifest", "Manifest field is required: platforms");
    }
    return manifest;
  };

  function shouldFallbackAfterWebWasmError(error) {
    var code = String(error && error.code ? error.code : "");
    return [
      "model_missing",
      "config_missing",
      "tokens_missing",
      "data_dir_missing",
      "web_wasm_runtime_not_ready",
      "runtime_load_failed"
    ].indexOf(code) >= 0;
  }

  ModelManifestLoader.prototype.loadForLang = async function (lang) {
    var normalizedLang = normalizeToTtsLang(lang);
    if (this.cache.has(normalizedLang)) return this.cache.get(normalizedLang);

    try {
      var manifest = await fetchJson(this.fetchImpl, this._manifestUrlForLang(normalizedLang));
      this.validate(manifest);
      this.cache.set(normalizedLang, manifest);
      return manifest;
    } catch (error) {
      if (error && error.status === 404) {
        this.cache.set(normalizedLang, null);
        return null;
      }
      throw error;
    }
  };

  ModelManifestLoader.prototype.loadForVoiceId = async function (voiceId, lang) {
    var resolvedVoiceId = this.voiceRegistry.resolveVoiceId(voiceId, lang);
    var voice = this.voiceRegistry.getVoice(resolvedVoiceId);
    if (!voice) return null;
    var manifest = await this.loadForLang(voice.lang);
    if (!manifest) return null;
    return manifest.voiceId === resolvedVoiceId ? manifest : null;
  };

  function NativeTTSBridge() {}
  NativeTTSBridge.prototype.isAvailable = async function () {
    return false;
  };
  NativeTTSBridge.prototype.preload = async function () {};
  NativeTTSBridge.prototype.synthesize = async function () {
    throw createTtsError("native_bridge_unavailable", "Native TTS bridge is not available");
  };
  NativeTTSBridge.prototype.play = async function () {
    throw createTtsError("native_bridge_unavailable", "Native TTS bridge is not available");
  };
  NativeTTSBridge.prototype.stop = async function () {};
  NativeTTSBridge.prototype.unload = async function () {};

  function validateRequest(request, config, voiceRegistry) {
    if (!request || typeof request !== "object") {
      throw createTtsError("invalid_request", "TTS request must be an object");
    }
    if (!request.text || typeof request.text !== "string" || !request.text.trim()) {
      throw createTtsError("invalid_request", "TTS text must be a non-empty string");
    }

    var lang = normalizeToTtsLang(request.lang);
    var voiceId = voiceRegistry.resolveVoiceId(request.voiceId, lang);
    return {
      text: request.text,
      lang: lang,
      voiceId: voiceId,
      speed: normalizeSpeed(request.speed, config.defaultSpeed),
      pitch: normalizePitch(request.pitch, 0),
      format: request.format || "wav",
      cache: request.cache !== false
    };
  }

  function TTSProviderRouter(options) {
    this.config = assignShallow(DEFAULT_TTS_CONFIG, (options && options.config) || {});
    this.backends = assignShallow({}, (options && options.backends) || {});
  }

  TTSProviderRouter.prototype.selectBackend = async function (request, context) {
    if (this.config.enabled === false) {
      return {
        backend: null,
        backendId: "unavailable",
        unavailableReason: "tts_disabled"
      };
    }

    var webBackend = this.backends.web_wasm;
    var webUnavailableReason = this.config.webWasmEnabled === false ? "web_wasm_disabled" : "web_wasm_runtime_not_ready";
    if (this.config.enabled && this.config.webWasmEnabled !== false && webBackend) {
      var webAvailable = await webBackend.isAvailable(context);
      var webSupported = await webBackend.supportsRequest(request, context);
      if (webAvailable && webSupported) {
        return { backend: webBackend, backendId: "web_wasm" };
      }
      if (!webSupported) {
        webUnavailableReason = "language_not_supported";
      } else if (webBackend.lastUnavailableReason) {
        webUnavailableReason = webBackend.lastUnavailableReason;
      }
    }

    var fallback = this.backends.system_fallback;
    if (this.config.allowSystemFallback && fallback && (await fallback.isAvailable(context))) {
      return {
        backend: fallback,
        backendId: "system_fallback",
        fallbackReason: webUnavailableReason
      };
    }

    return {
      backend: null,
      backendId: "unavailable",
      unavailableReason: webUnavailableReason || "tts_unavailable"
    };
  };

  function PortableTtsProvider(options) {
    options = options || {};
    this.config = assignShallow(DEFAULT_TTS_CONFIG, options.config || {});
    this.voiceRegistry = options.voiceRegistry || new TTSVoiceRegistry();
    this.manifestLoader =
      options.manifestLoader ||
      new ModelManifestLoader({
        basePath: (options.config && options.config.manifestBasePath) || "/tts/models",
        fetchImpl: options.fetchImpl,
        voiceRegistry: this.voiceRegistry
      });
    this.backends = assignShallow({}, options.backends || {});
    this.router = options.router || new TTSProviderRouter({ config: this.config, backends: this.backends });
    this.preprocessor = options.preprocessor || new HebrewPreprocessor({ maxChars: this.config.maxChars });
  }

  PortableTtsProvider.prototype.setConfig = function (partialConfig) {
    this.config = assignShallow(this.config, partialConfig || {});
    this.router.config = this.config;
  };

  PortableTtsProvider.prototype.isAvailable = async function () {
    var selection = await this.router.selectBackend({ lang: "he", voiceId: "he-default", text: "test" }, {
      manifestLoader: this.manifestLoader
    });
    return !!selection.backend;
  };

  PortableTtsProvider.prototype.preload = async function (lang, voiceId) {
    var request = validateRequest({ text: "warmup", lang: lang, voiceId: voiceId }, this.config, this.voiceRegistry);
    var manifest = await this.manifestLoader.loadForVoiceId(request.voiceId, request.lang);
    var selection = await this.router.selectBackend(request, { manifest: manifest, manifestLoader: this.manifestLoader });
    if (!selection.backend) return;
    return selection.backend.preload(request.lang, request.voiceId, { manifest: manifest });
  };

  PortableTtsProvider.prototype.synthesize = async function (request) {
    var normalizedRequest = validateRequest(request, this.config, this.voiceRegistry);
    var processed = this.preprocessor.preprocess(normalizedRequest.text, {
      lang: normalizedRequest.lang,
      maxChars: this.config.maxChars
    });
    var manifest = await this.manifestLoader.loadForVoiceId(normalizedRequest.voiceId, normalizedRequest.lang);
    var selection = await this.router.selectBackend(normalizedRequest, {
      manifest: manifest,
      processed: processed,
      manifestLoader: this.manifestLoader
    });

    if (!selection.backend) {
      throw createTtsError(
        selection.unavailableReason || "tts_unavailable",
        "No TTS backend is available for this request"
      );
    }

    var backendRequest = assignShallow({}, normalizedRequest, {
      text: processed.normalizedText,
      manifest: manifest,
      fallbackReason: selection.fallbackReason || null
    });
    var backendContext = {
      config: this.config,
      manifest: manifest,
      processed: processed,
      provider: PROVIDER_NAME
    };

    try {
      return await selection.backend.synthesize(backendRequest, backendContext);
    } catch (error) {
      if (
        selection.backendId === "web_wasm" &&
        this.config.allowSystemFallback &&
        shouldFallbackAfterWebWasmError(error) &&
        this.backends.system_fallback &&
        (await this.backends.system_fallback.isAvailable(backendContext))
      ) {
        return this.backends.system_fallback.synthesize(
          assignShallow({}, backendRequest, {
            fallbackReason: error.code || "web_wasm_runtime_not_ready"
          }),
          backendContext
        );
      }
      throw error;
    }
  };

  PortableTtsProvider.prototype.play = async function (result) {
    var backend = this.backends[result.backend];
    if (!backend) {
      throw createTtsError("backend_missing", "Unknown TTS backend: " + result.backend);
    }
    var startedAt =
      typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var playback = await backend.play(result, { config: this.config });
    if (result && result.diagnostics) {
      var finishedAt =
        typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      result.diagnostics.renderMs = Math.round(finishedAt - startedAt);
    }
    return playback;
  };

  PortableTtsProvider.prototype.synthesizeAndPlay = async function (request) {
    var result = await this.synthesize(request);
    await this.play(result);
    return result;
  };

  PortableTtsProvider.prototype.stop = async function () {
    var keys = Object.keys(this.backends);
    for (var i = 0; i < keys.length; i += 1) {
      var backend = this.backends[keys[i]];
      if (backend && typeof backend.stop === "function") {
        await backend.stop();
      }
    }
  };

  PortableTtsProvider.prototype.unload = async function () {
    var keys = Object.keys(this.backends);
    for (var i = 0; i < keys.length; i += 1) {
      var backend = this.backends[keys[i]];
      if (backend && typeof backend.unload === "function") {
        await backend.unload();
      }
    }
  };

  return {
    PROVIDER_NAME: PROVIDER_NAME,
    PREPROCESSING_VERSION: PREPROCESSING_VERSION,
    DEFAULT_TTS_CONFIG: DEFAULT_TTS_CONFIG,
    DEFAULT_VOICES: DEFAULT_VOICES,
    TextNormalizer: TextNormalizer,
    HebrewPreprocessor: HebrewPreprocessor,
    TTSVoiceRegistry: TTSVoiceRegistry,
    ModelManifestLoader: ModelManifestLoader,
    NativeTTSBridge: NativeTTSBridge,
    TTSProviderRouter: TTSProviderRouter,
    PortableTtsProvider: PortableTtsProvider,
    createDiagnostics: createDiagnostics,
    createTtsError: createTtsError,
    normalizeToTtsLang: normalizeToTtsLang,
    normalizeSpeed: normalizeSpeed,
    normalizePitch: normalizePitch,
    stripHtml: stripHtml,
    normalizeWhitespace: normalizeWhitespace,
    splitSentences: splitSentences,
    buildTtsCacheKey: buildTtsCacheKey,
    validateRequest: validateRequest
  };
});
