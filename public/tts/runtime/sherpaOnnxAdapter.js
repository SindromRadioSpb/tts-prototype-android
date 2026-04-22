(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root, require("./runtimeStatus.js"));
  } else {
    root.LocalNeuralTtsSherpaAdapter = factory(root, root.LocalNeuralTtsRuntimeStatus);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, statusLib) {
  "use strict";

  if (!statusLib) {
    throw new Error("LocalNeuralTtsRuntimeStatus is required before LocalNeuralTtsSherpaAdapter");
  }

  var RuntimeStates = statusLib.RuntimeStates;
  var ModelStates = statusLib.ModelStates;
  var SynthesisStates = statusLib.SynthesisStates;

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function joinUrl(basePath, fileName) {
    return String(basePath || "").replace(/\/$/, "") + "/" + String(fileName || "").replace(/^\//, "");
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function defaultLocator(runtimePath) {
    return {
      workerScriptUrl: joinUrl(runtimePath, "sherpa-onnx-tts.worker.js"),
      glueScriptUrl: joinUrl(runtimePath, "sherpa-onnx-tts.js"),
      mainScriptUrl: joinUrl(runtimePath, "sherpa-onnx-wasm-main-tts.js"),
      wasmUrl: joinUrl(runtimePath, "sherpa-onnx-wasm-main-tts.wasm"),
      dataUrl: joinUrl(runtimePath, "sherpa-onnx-wasm-main-tts.data")
    };
  }

  function createWorkerSession(worker) {
    var currentRequest = null;

    function handleMessage(event) {
      var payload = event && event.data ? event.data : {};
      if (!currentRequest) return;
      if (payload.type === "sherpa-onnx-tts-result") {
        var resolve = currentRequest.resolve;
        currentRequest = null;
        resolve({
          samples: payload.samples,
          sampleRate: payload.sampleRate
        });
        return;
      }
      if (payload.type === "error") {
        var reject = currentRequest.reject;
        currentRequest = null;
        reject(new Error(String(payload.message || "Sherpa worker failed")));
      }
    }

    worker.addEventListener("message", handleMessage);

    return {
      generate: function (input) {
        if (currentRequest) {
          return Promise.reject(new Error("Sherpa worker is busy"));
        }

        var text = String(input && input.text ? input.text : "").trim();
        if (!text) {
          return Promise.reject(new Error("TTS text is empty"));
        }

        return new Promise(function (resolve, reject) {
          currentRequest = { resolve: resolve, reject: reject };
          worker.postMessage({
            type: "generate",
            text: text,
            sid: Number(input && input.speakerId ? input.speakerId : 0),
            speed: Number(input && input.speed ? input.speed : 1.0)
          });
        });
      },
      dispose: function () {
        if (currentRequest && typeof currentRequest.reject === "function") {
          currentRequest.reject(new Error("Sherpa worker terminated"));
          currentRequest = null;
        }
        worker.removeEventListener("message", handleMessage);
      }
    };
  }

  function DefaultSherpaOnnxAdapter(options) {
    options = options || {};
    this.runtimePath = options.runtimePath || "/tts/runtime/sherpa-onnx";
    this.fetchImpl =
      options.fetchImpl ||
      (root && typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    this.locator = options.locator || defaultLocator;
    this.externalRuntimeFactory = options.externalRuntimeFactory || null;
    this.WorkerCtor = options.workerCtor || (root && root.Worker ? root.Worker : null);
    this.status = statusLib.createInitialStatus();
    this.status.runtimePath = this.runtimePath;
    this.runtime = null;
    this.runtimePromise = null;
    this.loadedModelKey = null;
  }

  DefaultSherpaOnnxAdapter.prototype._probeFile = async function (url) {
    if (typeof this.fetchImpl !== "function") {
      return false;
    }

    try {
      var response = await this.fetchImpl(url, { method: "HEAD", cache: "no-store" });
      if (response && response.ok) return true;
    } catch (_) {}

    try {
      var fallbackResponse = await this.fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        headers: { Range: "bytes=0-0" }
      });
      return !!(fallbackResponse && fallbackResponse.ok);
    } catch (_) {
      return false;
    }
  };

  DefaultSherpaOnnxAdapter.prototype._getFactory = function () {
    if (typeof this.externalRuntimeFactory === "function") return this.externalRuntimeFactory;
    if (root && typeof root.__LOCAL_TTS_SHERPA_FACTORY__ === "function") {
      return root.__LOCAL_TTS_SHERPA_FACTORY__;
    }
    return null;
  };

  DefaultSherpaOnnxAdapter.prototype.getStatus = function () {
    return Object.assign({}, this.status);
  };

  DefaultSherpaOnnxAdapter.prototype.detectRuntime = async function () {
    var urls = this.locator(this.runtimePath);
    var probeTargets = [
      urls.workerScriptUrl,
      urls.glueScriptUrl,
      urls.mainScriptUrl,
      urls.wasmUrl,
      urls.dataUrl
    ];
    for (var i = 0; i < probeTargets.length; i += 1) {
      var ok = await this._probeFile(probeTargets[i]);
      if (!ok) return false;
    }
    return true;
  };

  DefaultSherpaOnnxAdapter.prototype._createRuntimeFromWorker = function (urls) {
    var self = this;
    if (!this.WorkerCtor) {
      throw new Error("Worker is not available");
    }

    return new Promise(function (resolve, reject) {
      var worker = new self.WorkerCtor(urls.workerScriptUrl);
      var settled = false;

      function cleanup() {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      }

      function onError(event) {
        if (settled) return;
        settled = true;
        cleanup();
        worker.terminate();
        reject(new Error("Failed to load sherpa worker"));
      }

      function onMessage(event) {
        var payload = event && event.data ? event.data : {};
        if (payload.type === "sherpa-onnx-tts-progress") {
          self.status.runtimeStatus = RuntimeStates.LOADING;
          return;
        }
        if (payload.type === "sherpa-onnx-tts-ready") {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({
            worker: worker,
            session: null,
            sampleRate: Number(payload.sampleRate || 22050),
            numSpeakers: Number(payload.numSpeakers || 1),
            createSession: async function () {
              if (!this.session) {
                this.session = createWorkerSession(worker);
              }
              return this.session;
            },
            dispose: async function () {
              if (this.session && typeof this.session.dispose === "function") {
                this.session.dispose();
              }
              worker.terminate();
            }
          });
          return;
        }
        if (payload.type === "error" && !settled) {
          settled = true;
          cleanup();
          worker.terminate();
          reject(new Error(String(payload.message || "Sherpa runtime init failed")));
        }
      }

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
    });
  };

  DefaultSherpaOnnxAdapter.prototype.loadRuntime = async function () {
    if (this.runtime) {
      this.status.runtimeStatus = RuntimeStates.READY;
      return this.runtime;
    }
    if (this.runtimePromise) {
      return this.runtimePromise;
    }

    this.status.runtimeStatus = RuntimeStates.LOADING;
    this.status.runtimeError = null;
    this.status.runtimePath = this.runtimePath;

    var urls = this.locator(this.runtimePath);
    var detected = await this.detectRuntime();
    if (!detected) {
      this.status.runtimeStatus = RuntimeStates.MISSING;
      this.status.runtimeError = "runtime assets are not staged";
      throw new Error("runtime assets are not staged");
    }

    var factory = this._getFactory();
    this.runtimePromise = (async function () {
      var runtime;
      if (factory) {
        runtime = await factory({
          runtimePath: this.runtimePath,
          urls: urls
        });
      } else {
        runtime = await this._createRuntimeFromWorker(urls);
      }

      if (!runtime || typeof runtime.createSession !== "function") {
        this.status.runtimeStatus = RuntimeStates.ERROR;
        this.status.runtimeError = "runtime factory returned invalid runtime";
        throw new Error("runtime factory returned invalid runtime");
      }

      this.runtime = runtime;
      this.status.runtimeStatus = RuntimeStates.READY;
      return runtime;
    }.bind(this))();

    try {
      return await this.runtimePromise;
    } catch (error) {
      this.runtimePromise = null;
      if (this.status.runtimeStatus !== RuntimeStates.ERROR) {
        this.status.runtimeStatus = RuntimeStates.ERROR;
        this.status.runtimeError = String(error && error.message ? error.message : error);
      }
      throw error;
    }
  };

  DefaultSherpaOnnxAdapter.prototype.loadModel = async function (manifest) {
    if (!manifest || !manifest.modelPath || !manifest.configPath) {
      this.status.modelStatus = ModelStates.MISSING;
      this.status.modelError = "modelPath/configPath missing";
      throw new Error("modelPath/configPath missing");
    }

    var key = String(manifest.voiceId || "") + "::" + String(manifest.modelVersion || "");
    if (this.loadedModelKey === key && this.runtime && this.runtime.session) {
      this.status.modelStatus = ModelStates.READY;
      return this.runtime.session;
    }

    this.status.modelStatus = ModelStates.LOADING;
    this.status.modelError = null;
    this.status.modelPath = manifest.modelPath;
    this.status.configPath = manifest.configPath;
    this.status.tokensPath = manifest.tokensPath || null;
    this.status.dataDirPath = manifest.dataDirPath || null;
    this.status.checksumStatus = manifest.checksumSha256 ? "present" : "missing";
    this.status.configChecksumStatus = manifest.configChecksumSha256 ? "present" : "missing";

    var startedAt = nowMs();
    await this.loadRuntime();

    var modelExists = await this._probeFile(manifest.modelPath);
    if (!modelExists) {
      this.status.modelStatus = ModelStates.MISSING;
      this.status.modelError = "model missing";
      throw new Error("model missing");
    }

    var configExists = await this._probeFile(manifest.configPath);
    if (!configExists) {
      this.status.modelStatus = ModelStates.MISSING;
      this.status.modelError = "config missing";
      throw new Error("config missing");
    }

    if (manifest.tokensPath) {
      var tokensExists = await this._probeFile(manifest.tokensPath);
      if (!tokensExists) {
        this.status.modelStatus = ModelStates.MISSING;
        this.status.modelError = "tokens missing";
        throw new Error("tokens missing");
      }
    }

    if (manifest.dataDirIndexPath) {
      var dataDirIndexExists = await this._probeFile(manifest.dataDirIndexPath);
      if (!dataDirIndexExists) {
        this.status.modelStatus = ModelStates.MISSING;
        this.status.modelError = "data dir missing";
        throw new Error("data dir missing");
      }
    }

    this.runtime.session = await this.runtime.createSession({
      manifest: manifest,
      runtimePath: this.runtimePath
    });

    if (!this.runtime.session || typeof this.runtime.session.generate !== "function") {
      this.status.modelStatus = ModelStates.ERROR;
      this.status.modelError = "runtime session is invalid";
      throw new Error("runtime session is invalid");
    }

    this.loadedModelKey = key;
    this.status.modelStatus = ModelStates.READY;
    this.status.modelLoadMs = Math.round(nowMs() - startedAt);
    return this.runtime.session;
  };

  DefaultSherpaOnnxAdapter.prototype.synthesize = async function (request, context) {
    this.status.synthesisStatus = SynthesisStates.RUNNING;
    this.status.synthesisError = null;

    var session = await this.loadModel(context && context.manifest ? context.manifest : null);
    var output = await session.generate({
      text: request.text,
      speed: request.speed,
      speakerId: context && context.manifest ? context.manifest.speakerId : 0
    });

    if (!output || !output.samples || !output.sampleRate) {
      this.status.synthesisStatus = SynthesisStates.FAILED;
      this.status.synthesisError = "runtime returned empty audio";
      throw new Error("runtime returned empty audio");
    }

    this.status.synthesisStatus = SynthesisStates.IDLE;
    return {
      audioBuffer: {
        kind: "pcm_f32",
        channels: ensureArray(output.channels).length ? output.channels : [output.samples],
        sampleRate: Number(output.sampleRate)
      },
      sampleRate: Number(output.sampleRate),
      durationMs: Math.round(
        ((ensureArray(output.channels).length ? output.channels[0].length : output.samples.length) /
          Number(output.sampleRate)) *
          1000
      )
    };
  };

  DefaultSherpaOnnxAdapter.prototype.unload = async function () {
    if (this.runtime && typeof this.runtime.dispose === "function") {
      await this.runtime.dispose();
    }
    this.runtime = null;
    this.runtimePromise = null;
    this.loadedModelKey = null;
    this.status = statusLib.createInitialStatus();
    this.status.runtimePath = this.runtimePath;
  };

  return {
    DefaultSherpaOnnxAdapter: DefaultSherpaOnnxAdapter,
    RuntimeStates: RuntimeStates,
    ModelStates: ModelStates,
    SynthesisStates: SynthesisStates
  };
});
