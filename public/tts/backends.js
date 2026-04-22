(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      root,
      require("./core.js"),
      require("./runtime/runtimeStatus.js"),
      require("./runtime/sherpaOnnxAdapter.js")
    );
  } else {
    root.LocalNeuralTtsBackends = factory(
      root,
      root.LocalNeuralTtsCore,
      root.LocalNeuralTtsRuntimeStatus,
      root.LocalNeuralTtsSherpaAdapter
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, core, statusLib, adapterLib) {
  "use strict";

  if (!core) {
    throw new Error("LocalNeuralTtsCore is required before LocalNeuralTtsBackends");
  }
  if (!statusLib) {
    throw new Error("LocalNeuralTtsRuntimeStatus is required before LocalNeuralTtsBackends");
  }
  if (!adapterLib) {
    throw new Error("LocalNeuralTtsSherpaAdapter is required before LocalNeuralTtsBackends");
  }

  var PROVIDER_NAME = core.PROVIDER_NAME;
  var RuntimeStates = statusLib.RuntimeStates;
  var ModelStates = statusLib.ModelStates;
  var SynthesisStates = statusLib.SynthesisStates;

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function noop() {}

  function MemoryAudioCache() {
    this.items = new Map();
  }

  MemoryAudioCache.prototype.get = async function (cacheKey) {
    return this.items.get(cacheKey) || null;
  };
  MemoryAudioCache.prototype.put = async function (cacheKey, audioData, metadata) {
    this.items.set(cacheKey, {
      audioData: audioData,
      metadata: metadata || {},
      touchedAt: Date.now()
    });
  };
  MemoryAudioCache.prototype.touch = async function (cacheKey) {
    var item = this.items.get(cacheKey);
    if (item) item.touchedAt = Date.now();
  };
  MemoryAudioCache.prototype.evictIfNeeded = async function () {};
  MemoryAudioCache.prototype.clear = async function () {
    this.items.clear();
  };

  function IndexedDbAudioCache(options) {
    options = options || {};
    this.dbName = options.dbName || "local-neural-tts";
    this.storeName = options.storeName || "audio";
    this.maxBytes = Number(options.maxBytes) || 250 * 1024 * 1024;
    this.indexedDb = options.indexedDb || (root && root.indexedDB ? root.indexedDB : null);
    this.dbPromise = null;
  }

  IndexedDbAudioCache.prototype.isSupported = function () {
    return !!this.indexedDb;
  };

  IndexedDbAudioCache.prototype._open = function () {
    var self = this;
    if (!this.isSupported()) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise(function (resolve, reject) {
      var request = self.indexedDb.open(self.dbName, 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        var store = db.createObjectStore(self.storeName, { keyPath: "cacheKey" });
        store.createIndex("lastAccessedAt", "lastAccessedAt", { unique: false });
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });

    return this.dbPromise;
  };

  IndexedDbAudioCache.prototype._withStore = async function (mode, handler) {
    var db = await this._open();
    if (!db) return null;
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([this.storeName], mode);
      var store = transaction.objectStore(this.storeName);
      var result;
      transaction.oncomplete = function () {
        resolve(result);
      };
      transaction.onerror = function () {
        reject(transaction.error);
      };
      result = handler(store, transaction);
    }.bind(this));
  };

  IndexedDbAudioCache.prototype.get = async function (cacheKey) {
    return this._withStore("readonly", function (store) {
      var request = store.get(cacheKey);
      return new Promise(function (resolve, reject) {
        request.onsuccess = function () {
          resolve(request.result || null);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    });
  };

  IndexedDbAudioCache.prototype.put = async function (cacheKey, audioData, metadata) {
    var sizeBytes =
      audioData && typeof audioData.byteLength === "number"
        ? audioData.byteLength
        : audioData && typeof audioData.size === "number"
          ? audioData.size
          : 0;
    var entry = {
      cacheKey: cacheKey,
      audioData: audioData,
      metadata: metadata || {},
      sizeBytes: sizeBytes,
      createdAt: Date.now(),
      lastAccessedAt: Date.now()
    };

    await this._withStore("readwrite", function (store) {
      store.put(entry);
      return null;
    });
    await this.evictIfNeeded();
  };

  IndexedDbAudioCache.prototype.touch = async function (cacheKey) {
    var existing = await this.get(cacheKey);
    if (!existing) return;
    existing.lastAccessedAt = Date.now();
    await this._withStore("readwrite", function (store) {
      store.put(existing);
      return null;
    });
  };

  IndexedDbAudioCache.prototype.evictIfNeeded = async function () {
    return this._withStore("readwrite", function (store) {
      var request = store.getAll();
      return new Promise(function (resolve, reject) {
        request.onsuccess = function () {
          var items = request.result || [];
          var totalBytes = items.reduce(function (sum, item) {
            return sum + Number(item && item.sizeBytes ? item.sizeBytes : 0);
          }, 0);

          if (totalBytes <= this.maxBytes) {
            resolve();
            return;
          }

          items.sort(function (left, right) {
            return Number(left.lastAccessedAt || 0) - Number(right.lastAccessedAt || 0);
          });

          while (items.length && totalBytes > this.maxBytes) {
            var next = items.shift();
            totalBytes -= Number(next && next.sizeBytes ? next.sizeBytes : 0);
            store.delete(next.cacheKey);
          }
          resolve();
        }.bind(this);
        request.onerror = function () {
          reject(request.error);
        };
      }.bind(this));
    }.bind(this));
  };

  IndexedDbAudioCache.prototype.clear = async function () {
    return this._withStore("readwrite", function (store) {
      store.clear();
      return null;
    });
  };

  function WebAudioRenderer(options) {
    options = options || {};
    this.AudioContextCtor =
      options.AudioContextCtor ||
      root.AudioContext ||
      root.webkitAudioContext ||
      null;
    this.audioContext = null;
    this.currentSource = null;
    this.currentResolve = null;
  }

  WebAudioRenderer.prototype.isSupported = function () {
    return !!this.AudioContextCtor;
  };

  WebAudioRenderer.prototype._ensureContext = async function () {
    if (!this.AudioContextCtor) {
      throw core.createTtsError("audio_context_unavailable", "AudioContext is not available");
    }
    if (!this.audioContext) {
      this.audioContext = new this.AudioContextCtor();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    return this.audioContext;
  };

  WebAudioRenderer.prototype.play = async function (result) {
    var context = await this._ensureContext();
    await this.stop();

    var audioBuffer = result.audioBuffer;
    if (audioBuffer && typeof AudioBuffer !== "undefined" && audioBuffer instanceof AudioBuffer) {
      // Keep as-is.
    } else if (audioBuffer && audioBuffer.kind === "pcm_f32") {
      var channels = Array.isArray(audioBuffer.channels) ? audioBuffer.channels : [];
      if (!channels.length) {
        throw core.createTtsError("invalid_audio_buffer", "PCM payload contains no channels");
      }
      var frameCount = channels[0].length || 0;
      var sampleRate = Number(audioBuffer.sampleRate || result.sampleRate || 22050);
      var created = context.createBuffer(channels.length, frameCount, sampleRate);
      channels.forEach(function (channelData, index) {
        created.getChannelData(index).set(channelData);
      });
      audioBuffer = created;
    } else if (audioBuffer && typeof audioBuffer.byteLength === "number") {
      audioBuffer = await context.decodeAudioData(audioBuffer.slice ? audioBuffer.slice(0) : audioBuffer);
    } else {
      throw core.createTtsError("invalid_audio_buffer", "Web audio playback requires an AudioBuffer or ArrayBuffer");
    }

    return new Promise(function (resolve) {
      var source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      source.onended = function () {
        this.currentSource = null;
        if (this.currentResolve) this.currentResolve = null;
        resolve({ stopped: false });
      }.bind(this);
      this.currentSource = source;
      this.currentResolve = resolve;
      source.start(0);
    }.bind(this));
  };

  WebAudioRenderer.prototype.stop = async function () {
    if (this.currentSource) {
      try {
        this.currentSource.stop(0);
      } catch (_) {}
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    if (this.currentResolve) {
      var resolve = this.currentResolve;
      this.currentResolve = null;
      resolve({ stopped: true });
    }
  };

  function WebPiperSherpaBackend(options) {
    options = options || {};
    this.cache = options.cache || new MemoryAudioCache();
    this.renderer = options.renderer || new WebAudioRenderer();
    this.runtimeAdapter =
      options.runtimeAdapter ||
      new adapterLib.DefaultSherpaOnnxAdapter({
        runtimePath: options.runtimePath || "/tts/runtime/sherpa-onnx",
        fetchImpl: options.fetchImpl
      });
    this.config = options.config || {};
    this.status = statusLib.createInitialStatus();
    this.lastUnavailableReason = "web_wasm_runtime_not_ready";
  }

  WebPiperSherpaBackend.prototype.getStatus = function () {
    var adapterStatus =
      this.runtimeAdapter && typeof this.runtimeAdapter.getStatus === "function"
        ? this.runtimeAdapter.getStatus()
        : {};
    return Object.assign({}, this.status, adapterStatus);
  };

  WebPiperSherpaBackend.prototype._syncStatus = function (patch) {
    this.status = Object.assign({}, this.status, patch || {});
    return this.getStatus();
  };

  WebPiperSherpaBackend.prototype.isAvailable = async function () {
    if (this.config && this.config.webWasmEnabled === false) {
      this._syncStatus({
        runtimeStatus: RuntimeStates.MISSING,
        actualBackend: "unavailable",
        fallbackReason: "web_wasm_disabled"
      });
      this.lastUnavailableReason = "web_wasm_disabled";
      return false;
    }

    var detected = false;
    if (this.runtimeAdapter && typeof this.runtimeAdapter.detectRuntime === "function") {
      detected = !!(await this.runtimeAdapter.detectRuntime());
    }

    this._syncStatus({
      runtimeStatus: detected ? RuntimeStates.READY : RuntimeStates.MISSING,
      actualBackend: detected ? "web_wasm" : "unavailable",
      fallbackReason: detected ? null : "web_wasm_runtime_not_ready"
    });
    this.lastUnavailableReason = detected ? null : "web_wasm_runtime_not_ready";
    return detected;
  };

  WebPiperSherpaBackend.prototype.supportsRequest = async function (request, context) {
    var manifest = request.manifest || (context && context.manifest) || null;
    if (!manifest) return false;
    var platforms = Array.isArray(manifest.platforms) ? manifest.platforms : [];
    return platforms.indexOf("web_wasm") >= 0;
  };

  WebPiperSherpaBackend.prototype.preload = async function (_lang, _voiceId, context) {
    var manifest = context && context.manifest ? context.manifest : null;
    if (!manifest) return;
    await this.runtimeAdapter.loadModel(manifest);
    this._syncStatus({
      runtimeStatus: RuntimeStates.READY,
      modelStatus: ModelStates.READY,
      synthesisStatus: SynthesisStates.IDLE,
      actualBackend: "web_wasm",
      fallbackReason: null
    });
  };

  WebPiperSherpaBackend.prototype.synthesize = async function (request, context) {
    var manifest = request.manifest || (context && context.manifest) || null;
    if (!manifest) {
      this._syncStatus({
        modelStatus: ModelStates.MISSING,
        fallbackReason: "manifest_missing"
      });
      this.lastUnavailableReason = "manifest_missing";
      throw core.createTtsError("manifest_missing", "TTS model manifest is missing");
    }
    if (!manifest.modelPath) {
      this._syncStatus({
        modelStatus: ModelStates.MISSING,
        fallbackReason: "model_missing"
      });
      this.lastUnavailableReason = "model_missing";
      throw core.createTtsError("model_missing", "TTS model path is missing");
    }
    if (!manifest.configPath) {
      this._syncStatus({
        modelStatus: ModelStates.MISSING,
        fallbackReason: "config_missing"
      });
      this.lastUnavailableReason = "config_missing";
      throw core.createTtsError("config_missing", "TTS model config path is missing");
    }

    var cacheKey = await core.buildTtsCacheKey({
      provider: PROVIDER_NAME,
      voiceId: request.voiceId,
      lang: request.lang,
      normalizedText: request.text,
      speed: request.speed,
      modelVersion: manifest.modelVersion,
      preprocessingVersion: context && context.processed ? context.processed.preprocessingVersion : core.PREPROCESSING_VERSION
    });

    var cacheAllowed = request.cache !== false && context && context.config ? context.config.cacheEnabled !== false : true;
    if (cacheAllowed) {
      var cached = await this.cache.get(cacheKey);
      if (cached && cached.audioData) {
        this._syncStatus({
          runtimeStatus: RuntimeStates.READY,
          modelStatus: ModelStates.READY,
          synthesisStatus: SynthesisStates.IDLE,
          actualBackend: "web_wasm",
          fallbackReason: null
        });
        return {
          audioBuffer: cached.audioData,
          sampleRate: manifest.sampleRate || 22050,
          durationMs: Number((cached.metadata && cached.metadata.durationMs) || 0),
          provider: PROVIDER_NAME,
          backend: "web_wasm",
          voiceId: request.voiceId,
          cacheHit: true,
          diagnostics: core.createDiagnostics({
            synthMs: 0,
            textChars: request.text.length,
            backend: "web_wasm",
            actualBackend: "web_wasm",
            preferredBackend: context && context.config ? context.config.preferredBackend : "web_wasm",
            cacheHit: true,
            modelVersion: manifest.modelVersion,
            voiceId: request.voiceId,
            runtime: manifest.runtime || "sherpa-onnx",
            runtimeStatus: RuntimeStates.READY,
            modelStatus: ModelStates.READY,
            synthesisStatus: SynthesisStates.IDLE,
            modelPath: manifest.modelPath,
            configPath: manifest.configPath,
            tokensPath: manifest.tokensPath,
            dataDirPath: manifest.dataDirPath,
            checksumStatus: manifest.checksumSha256 ? "present" : "missing",
            configChecksumStatus: manifest.configChecksumSha256 ? "present" : "missing",
            manifestStatus: "valid"
          })
        };
      }
    }

    var startedAt = nowMs();
    this._syncStatus({
      runtimeStatus: RuntimeStates.LOADING,
      modelStatus: ModelStates.LOADING,
      synthesisStatus: SynthesisStates.RUNNING,
      actualBackend: "web_wasm",
      fallbackReason: null
    });
    if (!this.runtimeAdapter || typeof this.runtimeAdapter.synthesize !== "function") {
      this._syncStatus({
        runtimeStatus: RuntimeStates.MISSING,
        synthesisStatus: SynthesisStates.FAILED,
        fallbackReason: "runtime_load_failed"
      });
      this.lastUnavailableReason = "runtime_load_failed";
      throw core.createTtsError("runtime_load_failed", "Web WASM runtime adapter is missing");
    }

    var synthesized;
    try {
      synthesized = await this.runtimeAdapter.synthesize(request, context);
    } catch (error) {
      var message = String(error && error.message ? error.message : error);
      var code = error && error.code ? error.code : "";
      var fallbackReason = code || (/config missing/i.test(message)
        ? "config_missing"
        : /model missing/i.test(message)
          ? "model_missing"
          : /tokens missing/i.test(message)
            ? "tokens_missing"
            : /data dir missing/i.test(message)
              ? "data_dir_missing"
          : /runtime assets are not staged|runtime factory is not available/i.test(message)
            ? "web_wasm_runtime_not_ready"
            : "synthesis_failed");
      var statusPatch = {
        synthesisStatus: SynthesisStates.FAILED,
        fallbackReason: fallbackReason
      };
      if (fallbackReason === "web_wasm_runtime_not_ready" || fallbackReason === "runtime_load_failed") {
        statusPatch.runtimeStatus = RuntimeStates.MISSING;
      }
      if (fallbackReason === "model_missing" || fallbackReason === "config_missing") {
        statusPatch.modelStatus = ModelStates.MISSING;
      }
      this._syncStatus(statusPatch);
      this.lastUnavailableReason = fallbackReason;
      throw core.createTtsError(fallbackReason, message);
    }
    var audioData = synthesized.audioBuffer || synthesized.arrayBuffer;
    var durationMs = Number(synthesized.durationMs || 0);

    if (cacheAllowed && audioData) {
      await this.cache.put(cacheKey, audioData, {
        durationMs: durationMs,
        backend: "web_wasm",
        sampleRate: Number(synthesized.sampleRate || manifest.sampleRate || 22050)
      });
    }

    this._syncStatus({
      runtimeStatus: RuntimeStates.READY,
      modelStatus: ModelStates.READY,
      synthesisStatus: SynthesisStates.IDLE,
      actualBackend: "web_wasm",
      fallbackReason: null
    });

    return {
      audioBuffer: audioData,
      sampleRate: Number(synthesized.sampleRate || manifest.sampleRate || 22050),
      durationMs: durationMs,
      provider: PROVIDER_NAME,
      backend: "web_wasm",
      voiceId: request.voiceId,
      cacheHit: false,
      diagnostics: core.createDiagnostics({
        synthMs: Math.round(nowMs() - startedAt),
        textChars: request.text.length,
        backend: "web_wasm",
        actualBackend: "web_wasm",
        preferredBackend: context && context.config ? context.config.preferredBackend : "web_wasm",
        cacheHit: false,
        modelVersion: manifest.modelVersion,
        voiceId: request.voiceId,
        runtime: manifest.runtime || "sherpa-onnx",
        runtimeStatus: this.getStatus().runtimeStatus || RuntimeStates.READY,
        modelStatus: this.getStatus().modelStatus || ModelStates.READY,
        synthesisStatus: this.getStatus().synthesisStatus || SynthesisStates.IDLE,
        modelPath: manifest.modelPath,
        configPath: manifest.configPath,
        tokensPath: manifest.tokensPath,
        dataDirPath: manifest.dataDirPath,
        modelLoadMs: this.getStatus().modelLoadMs,
        checksumStatus: manifest.checksumSha256 ? "present" : "missing",
        configChecksumStatus: manifest.configChecksumSha256 ? "present" : "missing",
        manifestStatus: "valid"
      })
    };
  };

  WebPiperSherpaBackend.prototype.play = async function (result) {
    return this.renderer.play(result);
  };

  WebPiperSherpaBackend.prototype.stop = async function () {
    await this.renderer.stop();
  };

  WebPiperSherpaBackend.prototype.unload = async function () {
    await this.stop();
    if (this.runtimeAdapter && typeof this.runtimeAdapter.unload === "function") {
      await this.runtimeAdapter.unload();
    }
    this.status = statusLib.createInitialStatus();
  };

  function SystemSpeechFallbackBackend(options) {
    options = options || {};
    this.speechSynthesisImpl =
      options.speechSynthesisImpl ||
      (root && root.speechSynthesis ? root.speechSynthesis : null);
    this.UtteranceCtor =
      options.UtteranceCtor ||
      (root && root.SpeechSynthesisUtterance ? root.SpeechSynthesisUtterance : null);
    this.activePlayback = null;
  }

  SystemSpeechFallbackBackend.prototype.isAvailable = async function () {
    return !!(this.speechSynthesisImpl && this.UtteranceCtor);
  };

  SystemSpeechFallbackBackend.prototype.supportsRequest = async function (request) {
    var lang = core.normalizeToTtsLang(request.lang);
    return ["he", "ru", "en"].indexOf(lang) >= 0;
  };

  SystemSpeechFallbackBackend.prototype.preload = async function () {};

  SystemSpeechFallbackBackend.prototype.synthesize = async function (request) {
    return {
      audioBuffer: new ArrayBuffer(0),
      sampleRate: 0,
      durationMs: 0,
      provider: PROVIDER_NAME,
      backend: "system_fallback",
      voiceId: request.voiceId,
      cacheHit: false,
      diagnostics: core.createDiagnostics({
        synthMs: 0,
        textChars: request.text.length,
        backend: "system_fallback",
        actualBackend: "system_fallback",
        cacheHit: false,
        modelVersion: "system-fallback",
        voiceId: request.voiceId,
        runtimeStatus: RuntimeStates.MISSING,
        modelStatus: ModelStates.MISSING,
        synthesisStatus: SynthesisStates.FALLBACK,
        checksumStatus: "missing",
        fallbackReason: request.fallbackReason || "web_wasm_runtime_not_ready",
        manifestStatus: "fallback"
      }),
      _speech: {
        text: request.text,
        lang: request.lang,
        speed: request.speed,
        pitch: request.pitch
      }
    };
  };

  SystemSpeechFallbackBackend.prototype._pickVoice = function (lang) {
    if (!this.speechSynthesisImpl || typeof this.speechSynthesisImpl.getVoices !== "function") return null;
    var voices = this.speechSynthesisImpl.getVoices() || [];
    var preferredPrefix = lang === "he" ? "he" : lang === "ru" ? "ru" : "en";
    return voices.find(function (voice) {
      return String(voice && voice.lang || "").toLowerCase().indexOf(preferredPrefix) === 0;
    }) || null;
  };

  SystemSpeechFallbackBackend.prototype.play = async function (result) {
    await this.stop();

    if (!(await this.isAvailable())) {
      throw core.createTtsError("system_fallback_unavailable", "System speech fallback is not available");
    }

    return new Promise(function (resolve, reject) {
      var utterance = new this.UtteranceCtor(result._speech.text);
      utterance.lang = result._speech.lang === "he" ? "he-IL" : result._speech.lang === "ru" ? "ru-RU" : "en-US";
      utterance.rate = core.normalizeSpeed(result._speech.speed, 1.0);
      utterance.pitch = 1 + (Number(result._speech.pitch || 0) / 20);
      utterance.voice = this._pickVoice(result._speech.lang);
      utterance.onend = function () {
        this.activePlayback = null;
        resolve({ stopped: false });
      }.bind(this);
      utterance.onerror = function (event) {
        this.activePlayback = null;
        reject(core.createTtsError("system_fallback_playback_failed", "System fallback playback failed", {
          event: event
        }));
      }.bind(this);

      this.activePlayback = { resolve: resolve, reject: reject, utterance: utterance };
      this.speechSynthesisImpl.cancel();
      this.speechSynthesisImpl.speak(utterance);
    }.bind(this));
  };

  SystemSpeechFallbackBackend.prototype.stop = async function () {
    if (!this.speechSynthesisImpl) return;
    if (this.activePlayback && typeof this.activePlayback.resolve === "function") {
      var resolve = this.activePlayback.resolve;
      this.activePlayback = null;
      this.speechSynthesisImpl.cancel();
      resolve({ stopped: true });
      return;
    }
    this.speechSynthesisImpl.cancel();
  };

  SystemSpeechFallbackBackend.prototype.unload = async function () {
    await this.stop();
  };

  return {
    MemoryAudioCache: MemoryAudioCache,
    IndexedDbAudioCache: IndexedDbAudioCache,
    WebAudioRenderer: WebAudioRenderer,
    WebPiperSherpaBackend: WebPiperSherpaBackend,
    SystemSpeechFallbackBackend: SystemSpeechFallbackBackend,
    RuntimeStates: RuntimeStates,
    ModelStates: ModelStates,
    SynthesisStates: SynthesisStates,
    DefaultSherpaOnnxAdapter: adapterLib.DefaultSherpaOnnxAdapter
  };
});
