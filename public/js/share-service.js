// Shared Send or save contract for Studio and Reading Room.
//
// The service deliberately separates four outcomes:
//   buildLearningPackage -> reusable bytes + exact audio facts
//   shareFile            -> OS hand-off attempt under a fresh user activation
//   saveFile             -> browser save started (not proof that the file was kept)
//   shareLink            -> link hand-off (never confused with file sharing)
//
// It owns no learner state, no corpus permissions and no UI. Surfaces provide an
// already-authorized bundle or URL and render the returned stable status codes.
(function () {
  "use strict";

  var DOMAINS = {
    PUBLIC_PUBLISHED: "PUBLIC_PUBLISHED",
    PRIVATE_LOCAL: "PRIVATE_LOCAL",
    GROUP_RESTRICTED: "GROUP_RESTRICTED",
    PUBLISHER_DRAFT: "PUBLISHER_DRAFT",
  };

  function abortError() {
    var error = new Error("Operation cancelled");
    error.name = "AbortError";
    error.code = "OPERATION_CANCELLED";
    return error;
  }

  function ensureNotAborted(signal) {
    if (signal && signal.aborted) throw abortError();
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  function resolveSharePlan(input) {
    var value = input || {};
    if (value.domain === DOMAINS.PUBLIC_PUBLISHED) {
      return value.url
        ? { kind: "PUBLIC_LINK", url: String(value.url) }
        : { kind: "UNAVAILABLE", reason: "PUBLIC_URL_MISSING" };
    }
    if (value.domain === DOMAINS.PRIVATE_LOCAL) {
      return value.canPackage
        ? { kind: "LEARNING_ZIP" }
        : { kind: "UNAVAILABLE", reason: "PACKAGE_UNAVAILABLE" };
    }
    if (value.domain === DOMAINS.GROUP_RESTRICTED) {
      return value.url
        ? { kind: "PROTECTED_LINK", url: String(value.url), recipientAccessRequired: true }
        : { kind: "UNAVAILABLE", reason: "PROTECTED_URL_MISSING" };
    }
    if (value.domain === DOMAINS.PUBLISHER_DRAFT) {
      return value.previewUrl
        ? { kind: "PREVIEW_LINK", url: String(value.previewUrl), expires: value.expires || null }
        : { kind: "UNAVAILABLE", reason: "PREVIEW_URL_MISSING" };
    }
    return { kind: "UNAVAILABLE", reason: "DOMAIN_UNSUPPORTED" };
  }

  function collectAudioKeys(bundle) {
    var keys = new Set();
    var texts = bundle && bundle.library && Array.isArray(bundle.library.texts)
      ? bundle.library.texts : [];
    texts.forEach(function (text) {
      (Array.isArray(text && text.rows) ? text.rows : []).forEach(function (row) {
        var key = String(row && row.audio_asset_key || "").trim();
        if (key) keys.add(key);
      });
    });
    return Array.from(keys).sort();
  }

  function missingReason(error) {
    if (!error) return "fetch_error";
    if (error.code === "AUDIO_NOT_FOUND" || error.code === "AUDIO_HTTP_404") return "not_in_cache";
    if (error.code === "AUDIO_TIMEOUT" || error.name === "TimeoutError") return "timeout";
    return "fetch_error";
  }

  async function fetchAudioAsset(assetKey, options) {
    var opts = options || {};
    var fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) {
      var unavailable = new Error("Fetch is unavailable");
      unavailable.code = "AUDIO_FETCH_UNAVAILABLE";
      throw unavailable;
    }
    ensureNotAborted(opts.signal);
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timedOut = false;
    var timeoutMs = Math.max(1, Number(opts.timeoutMs) || 8000);
    var timer = null;
    var onAbort = function () { if (controller) controller.abort(); };
    if (opts.signal && controller) opts.signal.addEventListener("abort", onAbort, { once: true });
    if (controller) timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      var response = await fetchImpl("/api/audio/" + encodeURIComponent(String(assetKey)), {
        signal: controller ? controller.signal : opts.signal,
        headers: { "X-Bulk": "1" },
      });
      if (!response || !response.ok) {
        var status = response && response.status ? Number(response.status) : 0;
        var failed = new Error("Audio fetch failed" + (status ? ": " + status : ""));
        failed.code = "AUDIO_HTTP_" + status;
        throw failed;
      }
      return response.arrayBuffer();
    } catch (error) {
      if (opts.signal && opts.signal.aborted) throw abortError();
      if (timedOut) {
        var timeout = new Error("Audio fetch timed out");
        timeout.name = "TimeoutError";
        timeout.code = "AUDIO_TIMEOUT";
        throw timeout;
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (opts.signal && controller) opts.signal.removeEventListener("abort", onAbort);
    }
  }

  function facts(expected, included, missing) {
    var expectedAudio = Math.max(0, Number(expected) || 0);
    var includedAudio = Math.max(0, Number(included) || 0);
    var missingAudio = Math.max(0, Number(missing) || 0);
    return {
      expectedAudio: expectedAudio,
      includedAudio: includedAudio,
      missingAudio: missingAudio,
      complete: missingAudio === 0 && includedAudio === expectedAudio,
      partial: missingAudio > 0 || includedAudio !== expectedAudio,
    };
  }

  async function buildLearningPackage(options) {
    var opts = options || {};
    if (typeof opts.JSZip !== "function") throw new TypeError("JSZip constructor is required");
    if (!opts.bundle || !opts.bundle.library || !Array.isArray(opts.bundle.library.texts)) {
      throw new TypeError("A library bundle is required");
    }
    if (typeof opts.fetchAudio !== "function") throw new TypeError("fetchAudio callback is required");
    ensureNotAborted(opts.signal);

    var payload = cloneJson(opts.bundle);
    var keys = collectAudioKeys(payload);
    var zip = new opts.JSZip();
    var audioFolder = zip.folder("audio");
    var missing = [];
    var included = 0;
    var cursor = 0;
    var concurrency = Math.max(1, Math.min(12, Number(opts.concurrency) || 6));
    var onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};

    onProgress(facts(keys.length, 0, 0));
    async function worker() {
      while (cursor < keys.length) {
        ensureNotAborted(opts.signal);
        var key = keys[cursor++];
        try {
          var bytes = await opts.fetchAudio(key, { signal: opts.signal });
          ensureNotAborted(opts.signal);
          audioFolder.file(key + ".mp3", bytes, { compression: "STORE" });
          included += 1;
          var asset = (payload.library.audio_assets || []).find(function (entry) {
            return entry && String(entry.asset_key) === key;
          });
          if (asset && bytes && Number.isFinite(Number(bytes.byteLength))) asset.size_bytes = Number(bytes.byteLength);
        } catch (error) {
          if (opts.signal && opts.signal.aborted) throw abortError();
          missing.push({ asset_key: key, reason: missingReason(error) });
        }
        onProgress(facts(keys.length, included, missing.length));
      }
    }

    var workers = [];
    for (var i = 0; i < Math.min(concurrency, Math.max(1, keys.length)); i += 1) workers.push(worker());
    await Promise.all(workers);
    ensureNotAborted(opts.signal);
    missing.sort(function (a, b) { return a.asset_key.localeCompare(b.asset_key); });

    var packageFacts = facts(keys.length, included, missing.length);
    var manifest = Object.assign({}, cloneJson(opts.manifest || payload.manifest || {}), {
      format: "linguistpro-bundle",
      schema_version: 1,
      generated_at: opts.generatedAt || new Date().toISOString(),
      generator: opts.generator || "send-or-save",
      text_count: payload.library.texts.length,
      expected_audio_count: packageFacts.expectedAudio,
      audio_count: packageFacts.includedAudio,
      missing_audio_count: packageFacts.missingAudio,
      partial_backup: packageFacts.partial,
      export_mode: "audio",
    });

    if (typeof opts.augmentZip === "function") await opts.augmentZip(zip, manifest);
    ensureNotAborted(opts.signal);
    zip.file("library/library.json", JSON.stringify(payload.library, null, 2));
    if (payload.notes_advanced && payload.manifest && payload.manifest.notes_advanced_present) {
      zip.file("library/notes_advanced.json", JSON.stringify(payload.notes_advanced, null, 2));
    }
    if (missing.length) {
      zip.file("metadata/missing_audio.json", JSON.stringify({
        missing_audio: missing,
        count: missing.length,
        expected_audio_count: packageFacts.expectedAudio,
        included_audio_count: packageFacts.includedAudio,
      }, null, 2));
    }
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    var blob = await zip.generateAsync({
      type: opts.outputType || "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }, function (meta) {
      if (typeof opts.onPackProgress === "function") opts.onPackProgress(meta && Number(meta.percent) || 0);
    });
    ensureNotAborted(opts.signal);
    return {
      blob: blob,
      filename: String(opts.filename || "linguistpro-learning.zip"),
      type: "application/zip",
      manifest: manifest,
      facts: packageFacts,
      missingAudio: missing,
    };
  }

  function fileFromArtifact(artifact, FileCtor) {
    if (!artifact) throw new TypeError("Package artifact is required");
    if (artifact.file) return artifact.file;
    var Ctor = FileCtor || (typeof File !== "undefined" ? File : null);
    if (!Ctor) throw new Error("File constructor is unavailable");
    return new Ctor([artifact.blob], artifact.filename, { type: artifact.type || "application/zip" });
  }

  function canShareFile(file, navigatorLike) {
    var nav = navigatorLike || (typeof navigator !== "undefined" ? navigator : null);
    if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
    try { return !!nav.canShare({ files: [file] }); } catch (_) { return false; }
  }

  async function shareFile(options) {
    var opts = options || {};
    var nav = opts.navigator || (typeof navigator !== "undefined" ? navigator : null);
    if (!opts.file || !canShareFile(opts.file, nav)) {
      return { status: "unsupported", code: "FILE_SHARE_UNSUPPORTED" };
    }
    try {
      // Keep capability detection and the actual native payload identical.
      // Some share implementations accept {files} but reject a mixed
      // {title,text,files} payload before opening the system sheet.
      await nav.share({ files: [opts.file] });
      return { status: "handed-off", code: "SHARE_SHEET_COMPLETED" };
    } catch (error) {
      if (error && error.name === "AbortError") return { status: "cancelled", code: "SHARE_CANCELLED" };
      return { status: "failed", code: "SHARE_FAILED", message: String(error && error.message || error || "Share failed") };
    }
  }

  async function shareLink(options) {
    var opts = options || {};
    var nav = opts.navigator || (typeof navigator !== "undefined" ? navigator : null);
    if (!nav || typeof nav.share !== "function") return { status: "unsupported", code: "LINK_SHARE_UNSUPPORTED" };
    try {
      await nav.share({ title: opts.title || "", text: opts.text || "", url: String(opts.url || "") });
      return { status: "handed-off", code: "SHARE_SHEET_COMPLETED" };
    } catch (error) {
      if (error && error.name === "AbortError") return { status: "cancelled", code: "SHARE_CANCELLED" };
      return { status: "failed", code: "SHARE_FAILED", message: String(error && error.message || error || "Share failed") };
    }
  }

  function saveFile(options) {
    var opts = options || {};
    var doc = opts.document || (typeof document !== "undefined" ? document : null);
    var urlApi = opts.urlApi || (typeof URL !== "undefined" ? URL : null);
    if (!doc || !doc.body || !urlApi || typeof urlApi.createObjectURL !== "function") {
      return { status: "failed", code: "SAVE_UNAVAILABLE" };
    }
    var url = urlApi.createObjectURL(opts.blob);
    var anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = String(opts.filename || "download");
    doc.body.appendChild(anchor);
    anchor.click();
    if (typeof anchor.remove === "function") anchor.remove();
    var schedule = opts.schedule || function (fn) { setTimeout(fn, 1500); };
    schedule(function () { try { urlApi.revokeObjectURL(url); } catch (_) {} });
    return { status: "save-started", code: "SAVE_STARTED" };
  }

  var API = {
    DOMAINS: DOMAINS,
    resolveSharePlan: resolveSharePlan,
    collectAudioKeys: collectAudioKeys,
    fetchAudioAsset: fetchAudioAsset,
    buildLearningPackage: buildLearningPackage,
    fileFromArtifact: fileFromArtifact,
    canShareFile: canShareFile,
    shareFile: shareFile,
    shareLink: shareLink,
    saveFile: saveFile,
  };
  if (typeof window !== "undefined") window.ShareService = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
