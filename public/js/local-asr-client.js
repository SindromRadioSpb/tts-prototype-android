// Default-off Studio L1 browser client for the fixed loopback ASR companion.
(function () {
  "use strict";

  var BASE_URL = "http://127.0.0.1:8799";
  var EXPERIMENT_KEY = "linguistpro.experimental.localAsr";
  var TOKEN_KEY = "linguistpro.localAsr.pairingToken";
  var TERMINAL = new Set(["COMPLETE", "FAILED", "CANCELED"]);
  var runtimeBetaEnabled = false;
  var companionDownloadUrl = "";

  function browserStore(kind) {
    try { return kind === "session" ? window.sessionStorage : window.localStorage; }
    catch (_) { return null; }
  }

  function isExperimentalEnabled(store) {
    var target = store || (typeof window !== "undefined" ? browserStore("local") : null);
    try {
      var enrolled = !!target && target.getItem(EXPERIMENT_KEY) === "1";
      // An explicitly supplied store is a pure/unit-test seam. Product calls
      // omit it and must also pass the default-off runtime gate.
      return enrolled && (!!store || runtimeBetaEnabled);
    }
    catch (_) { return false; }
  }

  function setRuntimeConfig(config) {
    var value = config || {};
    runtimeBetaEnabled = value.beta === true;
    companionDownloadUrl = runtimeBetaEnabled ? String(value.companionDownloadUrl || "") : "";
    if (!runtimeBetaEnabled) {
      var session = typeof window !== "undefined" ? browserStore("session") : null;
      try { if (session) session.removeItem(TOKEN_KEY); } catch (_) {}
    }
    return { beta: runtimeBetaEnabled, companionDownloadUrl: companionDownloadUrl };
  }

  function enroll(store) {
    if (!runtimeBetaEnabled) throw new Error("LOCAL_ASR_BETA_DISABLED");
    var target = store || (typeof window !== "undefined" ? browserStore("local") : null);
    if (!target) throw new Error("LOCAL_ASR_STORAGE_UNAVAILABLE");
    target.setItem(EXPERIMENT_KEY, "1");
  }

  function unenroll(store) {
    var local = store || (typeof window !== "undefined" ? browserStore("local") : null);
    var session = typeof window !== "undefined" ? browserStore("session") : null;
    try { if (local) local.removeItem(EXPERIMENT_KEY); } catch (_) {}
    try { if (session) session.removeItem(TOKEN_KEY); } catch (_) {}
  }

  function getPairingToken(store) {
    var target = store || (typeof window !== "undefined" ? browserStore("session") : null);
    try { return target ? String(target.getItem(TOKEN_KEY) || "") : ""; }
    catch (_) { return ""; }
  }

  function setPairingToken(token, store) {
    var value = String(token || "").trim();
    if (value.length < 32) throw new Error("LOCAL_ASR_PAIRING_TOKEN_INVALID");
    var target = store || (typeof window !== "undefined" ? browserStore("session") : null);
    if (!target) throw new Error("LOCAL_ASR_SESSION_STORAGE_UNAVAILABLE");
    target.setItem(TOKEN_KEY, value);
    return value;
  }

  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function LocalAsrError(code, detail, status, job) {
    var error = new Error(detail || code);
    error.name = "LocalAsrError";
    error.code = code;
    error.status = status == null ? null : status;
    error.job = job || null;
    return error;
  }

  function Client(options) {
    var opts = options || {};
    this.fetchFn = opts.fetchFn || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    this.tokenProvider = opts.tokenProvider || getPairingToken;
    this.wait = opts.wait || delay;
    this.normalizer = opts.normalizer ||
      (typeof window !== "undefined" && window.LocalAsrNormalizer
        ? window.LocalAsrNormalizer.normalizeLocalAsrResult : null);
    if (!this.fetchFn) throw new Error("LOCAL_ASR_FETCH_UNAVAILABLE");
  }

  Client.prototype._request = async function (path, options) {
    var token = String(this.tokenProvider() || "");
    if (token.length < 32) throw LocalAsrError("LOCAL_ASR_PAIRING_REQUIRED", "Pairing token required");
    var opts = Object.assign({ method: "GET", cache: "no-store", credentials: "omit", redirect: "error" }, options || {});
    opts.headers = Object.assign({}, opts.headers || {}, { authorization: "Bearer " + token });
    var response;
    try { response = await this.fetchFn(BASE_URL + path, opts); }
    catch (error) { throw LocalAsrError("LOCAL_ASR_UNAVAILABLE", error && error.message); }
    var data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      var detail = data && (data.detail || data.error);
      throw LocalAsrError("LOCAL_ASR_HTTP_" + response.status, String(detail || "Local ASR request failed"), response.status, data);
    }
    return data;
  };

  Client.prototype.capabilities = function () { return this._request("/v1/capabilities"); };
  Client.prototype.modelStatus = function () { return this._request("/v1/asr/model/status?verify_hash=true"); };
  Client.prototype.preflight = function () { return this._request("/v1/companion/preflight"); };
  Client.prototype.installStatus = function () { return this._request("/v1/asr/model/install-status"); };
  Client.prototype.installModel = function (revision) {
    return this._request("/v1/asr/model/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: revision, accepted_license: true }),
    });
  };
  Client.prototype.cancelModelInstall = function () {
    return this._request("/v1/asr/model/install-cancel", { method: "POST" });
  };
  Client.prototype.deleteModel = function () {
    return this._request("/v1/asr/model", { method: "DELETE" });
  };
  Client.prototype.deleteAllJobs = function () {
    return this._request("/v1/companion/jobs", { method: "DELETE" });
  };
  Client.prototype.warmup = function () {
    return this._request("/v1/asr/model/warmup", { method: "POST" });
  };
  Client.prototype.createJob = function (file) {
    return this._request("/v1/asr/jobs", {
      method: "POST",
      headers: { "content-type": (file && file.type) || "application/octet-stream" },
      body: file,
    });
  };
  Client.prototype.getJob = function (id) { return this._request("/v1/asr/jobs/" + encodeURIComponent(id)); };
  Client.prototype.getResult = function (id) { return this._request("/v1/asr/jobs/" + encodeURIComponent(id) + "/result"); };
  Client.prototype.cancel = function (id) {
    return this._request("/v1/asr/jobs/" + encodeURIComponent(id) + "/cancel", { method: "POST" });
  };
  Client.prototype.resume = function (id) {
    return this._request("/v1/asr/jobs/" + encodeURIComponent(id) + "/resume", { method: "POST" });
  };
  Client.prototype.selectAudioStream = function (id, streamIndex) {
    return this._request("/v1/asr/jobs/" + encodeURIComponent(id) + "/audio-stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream_index: streamIndex }),
    });
  };
  Client.prototype.deleteJob = function (id) {
    return this._request("/v1/asr/jobs/" + encodeURIComponent(id), { method: "DELETE" });
  };
  Client.prototype.retryChunks = function (id, chunkIndexes, reason) {
    return this._request("/v1/asr/jobs/" + encodeURIComponent(id) + "/retry-chunks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chunk_indexes: chunkIndexes, reason: reason }),
    });
  };

  Client.prototype.waitForJob = async function (id, options, initial) {
    var opts = options || {}, onStatus = typeof opts.onStatus === "function" ? opts.onStatus : function () {};
    var cancelSent = false;
    if (initial) onStatus(initial);
    while (true) {
      if (opts.signal && opts.signal.aborted && !cancelSent) {
        cancelSent = true;
        onStatus(await this.cancel(id));
      }
      var job = await this.getJob(id);
      onStatus(job);
      if (job.state === "WAITING_FOR_INPUT") {
        if (typeof opts.chooseAudioStream !== "function") {
          throw LocalAsrError("LOCAL_ASR_AUDIO_STREAM_REQUIRED", "Audio stream choice required", null, job);
        }
        var selected = await opts.chooseAudioStream(job.available_audio_streams || []);
        if (!Number.isInteger(selected)) throw LocalAsrError("LOCAL_ASR_AUDIO_STREAM_REQUIRED", "Audio stream choice cancelled", null, job);
        onStatus(await this.selectAudioStream(id, selected));
      } else if (job.state === "COMPLETE") {
        var raw = await this.getResult(id);
        if (!this.normalizer) throw LocalAsrError("LOCAL_ASR_NORMALIZER_UNAVAILABLE", "Local ASR normalizer is unavailable");
        var transcript = await this.normalizer(raw, {
          codeVersion: opts.codeVersion,
          knownSpeechChunkIndexes: opts.knownSpeechChunkIndexes,
        });
        return { job: job, raw: raw, transcript: transcript };
      } else if (job.state === "FAILED" || job.state === "CANCELED") {
        throw LocalAsrError("LOCAL_ASR_" + job.state, job.error_detail || job.state, null, job);
      }
      await this.wait(job.state === "QUEUED" || job.state === "WAITING_FOR_GPU" ? 1000 : 500);
    }
  };

  Client.prototype.run = async function (file, options) {
    var created = await this.createJob(file);
    return this.waitForJob(created.job_id, options, created);
  };

  var API = {
    BASE_URL: BASE_URL,
    EXPERIMENT_KEY: EXPERIMENT_KEY,
    TOKEN_KEY: TOKEN_KEY,
    TERMINAL: TERMINAL,
    setRuntimeConfig: setRuntimeConfig,
    enroll: enroll,
    unenroll: unenroll,
    runtimeConfig: function () { return { beta: runtimeBetaEnabled, companionDownloadUrl: companionDownloadUrl }; },
    isExperimentalEnabled: isExperimentalEnabled,
    getPairingToken: getPairingToken,
    setPairingToken: setPairingToken,
    Client: Client,
  };
  if (typeof window !== "undefined") window.LocalAsrClient = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
