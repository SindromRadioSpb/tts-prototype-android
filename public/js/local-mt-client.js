// Default-off Studio L4 browser client for authenticated loopback MADLAD MT.
(function () {
  "use strict";

  var BASE_URL = "http://127.0.0.1:8799";
  var EXPERIMENT_KEY = "linguistpro.experimental.localMt";
  var MODEL_REVISION = "9f2797629c31e69617186dbe5f0ca43bf662f36d";
  var runtimeBetaEnabled = false;

  function browserStore(kind) {
    try { return kind === "session" ? window.sessionStorage : window.localStorage; }
    catch (_) { return null; }
  }

  function pairingToken(store) {
    if (typeof window !== "undefined" && window.LocalAsrClient) {
      return window.LocalAsrClient.getPairingToken(store);
    }
    return "";
  }

  function isExperimentalEnabled(store) {
    var target = store || (typeof window !== "undefined" ? browserStore("local") : null);
    try {
      var enrolled = !!target && target.getItem(EXPERIMENT_KEY) === "1";
      return enrolled && (!!store || runtimeBetaEnabled);
    } catch (_) { return false; }
  }

  function setRuntimeConfig(value) {
    runtimeBetaEnabled = !!(value && value.beta === true);
    return { beta: runtimeBetaEnabled };
  }

  function enroll(store) {
    if (!runtimeBetaEnabled) throw new Error("LOCAL_MT_BETA_DISABLED");
    var target = store || (typeof window !== "undefined" ? browserStore("local") : null);
    if (!target) throw new Error("LOCAL_MT_STORAGE_UNAVAILABLE");
    target.setItem(EXPERIMENT_KEY, "1");
  }

  function unenroll(store) {
    var target = store || (typeof window !== "undefined" ? browserStore("local") : null);
    try { if (target) target.removeItem(EXPERIMENT_KEY); } catch (_) {}
  }

  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function LocalMtError(code, detail, status, job) {
    var error = new Error(detail || code);
    error.name = "LocalMtError";
    error.code = code;
    error.status = status == null ? null : status;
    error.job = job || null;
    return error;
  }

  function utf8(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value);
    return Buffer.from(value, "utf8");
  }

  async function sha256(value) {
    var bytes = utf8(value);
    if (typeof crypto !== "undefined" && crypto.subtle) {
      var digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
    }
    if (typeof require === "function") return require("node:crypto").createHash("sha256").update(bytes).digest("hex");
    throw LocalMtError("LOCAL_MT_CRYPTO_UNAVAILABLE");
  }

  function canonicalInput(sourceLang, targetLang, segments) {
    // Matches Python json.dumps(sort_keys=True,separators=(",",":"),ensure_ascii=False).
    return JSON.stringify({
      segments: segments.map(function (segment) { return { index: segment.index, text: segment.text }; }),
      source_lang: sourceLang,
      target_lang: targetLang,
    });
  }

  function Client(options) {
    var opts = options || {};
    this.fetchFn = opts.fetchFn || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    this.tokenProvider = opts.tokenProvider || pairingToken;
    this.wait = opts.wait || delay;
    if (!this.fetchFn) throw new Error("LOCAL_MT_FETCH_UNAVAILABLE");
  }

  Client.prototype._request = async function (path, options) {
    var token = String(this.tokenProvider() || "");
    if (token.length < 32) throw LocalMtError("LOCAL_MT_UNPAIRED", "Pair the Companion first");
    var opts = Object.assign(
      { method: "GET", cache: "no-store", credentials: "omit", redirect: "error" },
      options || {}
    );
    opts.headers = Object.assign({}, opts.headers || {}, { authorization: "Bearer " + token });
    var response;
    try { response = await this.fetchFn(BASE_URL + path, opts); }
    catch (_) { throw LocalMtError("LOCAL_MT_ABSENT", "Local Companion is unavailable"); }
    var data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      var detail = data && (data.detail || data.error);
      throw LocalMtError("LOCAL_MT_HTTP_" + response.status, String(detail || "Local MT request failed"), response.status, data);
    }
    return data;
  };

  Client.prototype.capabilities = function () { return this._request("/v1/capabilities"); };
  Client.prototype.modelStatus = function (verifyHash) {
    return this._request("/v1/mt/model/status?verify_hash=" + (verifyHash ? "true" : "false"));
  };
  Client.prototype.installStatus = function () { return this._request("/v1/mt/model/install-status"); };
  Client.prototype.installModel = function (acceptedLicense) {
    return this._request("/v1/mt/model/install", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: MODEL_REVISION, accepted_license: acceptedLicense === true }),
    });
  };
  Client.prototype.cancelModelInstall = function () {
    return this._request("/v1/mt/model/install-cancel", { method: "POST" });
  };
  Client.prototype.deleteModel = function () { return this._request("/v1/mt/model", { method: "DELETE" }); };
  Client.prototype.warmup = function () { return this._request("/v1/mt/model/warmup", { method: "POST" }); };
  Client.prototype.unload = function () { return this._request("/v1/mt/model/unload", { method: "POST" }); };

  Client.prototype.readiness = async function () {
    if (!runtimeBetaEnabled || !isExperimentalEnabled()) return { state: "absent", reason: "beta_disabled" };
    if (String(this.tokenProvider() || "").length < 32) return { state: "unpaired", reason: "pairing_required" };
    try {
      var caps = await this.capabilities();
      if (!caps || !caps.local_mt || caps.local_mt.enabled !== true) return { state: "absent", reason: "capability_disabled" };
      var install = await this.installStatus();
      if (install && ["QUEUED", "DOWNLOADING", "CONVERTING", "VERIFYING", "VERIFYING_AND_COPYING"].includes(install.state)) {
        return { state: "installing", install: install, capability: caps.local_mt };
      }
      var model = await this.modelStatus(false);
      if (!model || model.verified !== true) return { state: "model_missing", model: model, capability: caps.local_mt };
      if (model.gpu && (model.gpu.active || model.gpu.waiting > 0)) {
        return { state: "busy", model: model, capability: caps.local_mt };
      }
      return { state: "ready", model: model, capability: caps.local_mt };
    } catch (error) {
      if (error && error.code === "LOCAL_MT_ABSENT") return { state: "absent", reason: "companion_unavailable" };
      return { state: "error", reason: error && error.code ? error.code : "LOCAL_MT_ERROR" };
    }
  };

  Client.prototype.createJob = function (payload) {
    return this._request("/v1/mt/jobs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
  };
  Client.prototype.getJob = function (id) { return this._request("/v1/mt/jobs/" + encodeURIComponent(id)); };
  Client.prototype.getResult = function (id) { return this._request("/v1/mt/jobs/" + encodeURIComponent(id) + "/result"); };
  Client.prototype.cancel = function (id) { return this._request("/v1/mt/jobs/" + encodeURIComponent(id) + "/cancel", { method: "POST" }); };
  Client.prototype.retry = function (id) { return this._request("/v1/mt/jobs/" + encodeURIComponent(id) + "/retry", { method: "POST" }); };
  Client.prototype.deleteJob = function (id) { return this._request("/v1/mt/jobs/" + encodeURIComponent(id), { method: "DELETE" }); };

  Client.prototype.waitForJob = async function (jobId, options) {
    var opts = options || {}, cancelSent = false;
    while (true) {
      if (opts.signal && opts.signal.aborted && !cancelSent) {
        cancelSent = true;
        await this.cancel(jobId);
      }
      var job = await this.getJob(jobId);
      if (typeof opts.onStatus === "function") opts.onStatus(job);
      if (job.state === "COMPLETE") {
        var result = await this.getResult(jobId);
        if (!result.complete || result.provider !== "madlad" || result.local_execution !== true) {
          throw LocalMtError("LOCAL_MT_RESULT_PROVENANCE_INVALID", null, null, result);
        }
        return result;
      }
      if (job.state === "FAILED" || job.state === "CANCELED") {
        throw LocalMtError("LOCAL_MT_" + job.state, job.error_code || job.state, null, job);
      }
      await this.wait(job.state === "RUNNING" ? 500 : 1000);
    }
  };

  Client.prototype.translate = async function (texts, sourceLang, targetLang, options) {
    if (!Array.isArray(texts) || !texts.length || texts.length > 120) throw LocalMtError("LOCAL_MT_SEGMENT_COUNT_INVALID");
    var segments = texts.map(function (text, index) { return { index: index, text: String(text) }; });
    var checksum = await sha256(canonicalInput(sourceLang, targetLang, segments));
    var requestId = await sha256("studio-local-mt-v1:" + checksum);
    var created = await this.createJob({
      request_id: requestId, input_checksum: checksum,
      source_lang: sourceLang, target_lang: targetLang, segments: segments,
    });
    var result = await this.waitForJob(created.job_id, options);
    if (!Array.isArray(result.results) || result.results.length !== segments.length ||
        result.results.some(function (row, index) { return row.index !== index || typeof row.text !== "string"; })) {
      throw LocalMtError("LOCAL_MT_RESULT_MAPPING_INVALID", null, null, result);
    }
    return result;
  };

  var API = {
    BASE_URL: BASE_URL,
    EXPERIMENT_KEY: EXPERIMENT_KEY,
    MODEL_REVISION: MODEL_REVISION,
    Client: Client,
    canonicalInput: canonicalInput,
    sha256: sha256,
    setRuntimeConfig: setRuntimeConfig,
    isExperimentalEnabled: isExperimentalEnabled,
    enroll: enroll,
    unenroll: unenroll,
    runtimeConfig: function () { return { beta: runtimeBetaEnabled }; },
  };
  if (typeof window !== "undefined") window.LocalMtClient = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
