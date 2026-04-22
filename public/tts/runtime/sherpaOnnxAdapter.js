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

  function joinUrl(basePath, fileName) {
    return String(basePath || "").replace(/\/$/, "") + "/" + String(fileName || "").replace(/^\//, "");
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function loadScript(url) {
    if (!root || !root.document) {
      return Promise.reject(new Error("document is not available"));
    }

    return new Promise(function (resolve, reject) {
      var existing = root.document.querySelector('script[data-sherpa-runtime="' + url + '"]');
      if (existing && existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      if (existing) {
        existing.addEventListener("load", function () { resolve(); }, { once: true });
        existing.addEventListener("error", function () { reject(new Error("Failed to load " + url)); }, { once: true });
        return;
      }

      var script = root.document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.sherpaRuntime = url;
      script.onload = function () {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = function () {
        reject(new Error("Failed to load " + url));
      };
      root.document.head.appendChild(script);
    });
  }

  function defaultLocator(runtimePath) {
    return {
      glueScriptUrl: joinUrl(runtimePath, "sherpa-onnx.js"),
      mainScriptUrl: joinUrl(runtimePath, "sherpa-onnx-wasm-main.js"),
      wasmUrl: joinUrl(runtimePath, "sherpa-onnx-wasm-main.wasm"),
      dataUrl: joinUrl(runtimePath, "sherpa-onnx-wasm-main.data")
    };
  }

  function DefaultSherpaOnnxAdapter(options) {
    options = options || {};
    this.runtimePath = options.runtimePath || "/tts/runtime/sherpa-onnx";
    this.fetchImpl =
      options.fetchImpl ||
      (root && typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    this.scriptLoader = options.scriptLoader || loadScript;
    this.locator = options.locator || defaultLocator;
    this.externalRuntimeFactory = options.externalRuntimeFactory || null;
    this.status = statusLib.createInitialStatus();
    this.status.runtimePath = this.runtimePath;
    this.runtime = null;
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
      var fallbackResponse = await this.fetchImpl(url, { method: "GET", cache: "no-store" });
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
    var probeTargets = [urls.glueScriptUrl, urls.mainScriptUrl, urls.wasmUrl];
    for (var i = 0; i < probeTargets.length; i += 1) {
      var ok = await this._probeFile(probeTargets[i]);
      if (!ok) return false;
    }
    return true;
  };

  DefaultSherpaOnnxAdapter.prototype.loadRuntime = async function () {
    if (this.runtime) {
      this.status.runtimeStatus = RuntimeStates.READY;
      return this.runtime;
    }

    this.status.runtimeStatus = RuntimeStates.LOADING;
    this.status.runtimeError = null;

    var urls = this.locator(this.runtimePath);
    this.status.runtimePath = this.runtimePath;

    var detected = await this.detectRuntime();
    if (!detected) {
      this.status.runtimeStatus = RuntimeStates.MISSING;
      this.status.runtimeError = "runtime assets are not staged";
      throw new Error("runtime assets are not staged");
    }

    var factory = this._getFactory();
    if (!factory) {
      try {
        await this.scriptLoader(urls.glueScriptUrl);
      } catch (_) {}
      try {
        await this.scriptLoader(urls.mainScriptUrl);
      } catch (_) {}
      factory = this._getFactory();
    }

    if (!factory) {
      this.status.runtimeStatus = RuntimeStates.MISSING;
      this.status.runtimeError = "runtime factory is not available";
      throw new Error("runtime factory is not available");
    }

    this.runtime = await factory({
      runtimePath: this.runtimePath,
      locateFile: function (fileName) {
        return joinUrl(this.runtimePath, fileName);
      }.bind(this),
      urls: urls
    });

    if (!this.runtime || typeof this.runtime.createSession !== "function") {
      this.status.runtimeStatus = RuntimeStates.ERROR;
      this.status.runtimeError = "runtime factory returned invalid runtime";
      throw new Error("runtime factory returned invalid runtime");
    }

    this.status.runtimeStatus = RuntimeStates.READY;
    return this.runtime;
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
    this.status.checksumStatus = manifest.checksumSha256 ? "present" : "missing";
    this.status.configChecksumStatus = manifest.configChecksumSha256 ? "present" : "missing";

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
      durationMs: Math.round((ensureArray(output.channels).length ? output.channels[0].length : output.samples.length) / Number(output.sampleRate) * 1000)
    };
  };

  DefaultSherpaOnnxAdapter.prototype.unload = async function () {
    if (this.runtime && typeof this.runtime.dispose === "function") {
      await this.runtime.dispose();
    }
    this.runtime = null;
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
