// Orchestration between the local companion, the subtitle parser and OPFS for materials built
// from container subtitle tracks. Every dependency is injected, so this file stays testable and
// free of DOM. Decisions live in subtitle-material-core.js; bytes policy lives here.
(function () {
  "use strict";

  var SHA_RE = /^[a-f0-9]{64}$/i;

  function fail(code, detail, extra) {
    var error = new Error(detail || code);
    error.code = code;
    if (extra) Object.keys(extra).forEach(function (key) { error[key] = extra[key]; });
    return error;
  }

  function readinessModule(options) {
    if (options && options.mediaReadiness) return options.mediaReadiness;
    if (typeof window !== "undefined" && window.MediaReadiness) return window.MediaReadiness;
    if (typeof require === "function") { try { return require("./media-readiness.js"); } catch (_) {} }
    return null;
  }

  function subtitleParser(options) {
    if (options && typeof options.parseSubtitles === "function") return options.parseSubtitles;
    if (typeof window !== "undefined" && window.MediaPackageCore) {
      return function (raw, opts) { return window.MediaPackageCore.parseSubtitles(raw, opts); };
    }
    if (typeof require === "function") {
      try {
        var core = require("./media-package-core.js");
        return function (raw, opts) { return core.parseSubtitles(raw, opts); };
      } catch (_) {}
    }
    return null;
  }

  function cuesFromSegments(segments) {
    return (Array.isArray(segments) ? segments : []).map(function (segment) {
      var start = Number(segment.start_ms);
      var end = Number(segment.end_ms);
      return {
        start: Number.isFinite(start) ? start / 1000 : 0,
        end: Number.isFinite(end) ? end / 1000 : 0,
        text: String(segment.text == null ? "" : segment.text),
      };
    });
  }

  // Per-item best effort: a track that fails verification or parsing is named in `failed`, and the
  // remaining tracks still make a material. Nothing is silently dropped.
  async function loadSubtitleTracks(options) {
    var opts = options || {};
    var client = opts.client;
    var readiness = opts.readiness || {};
    var parse = subtitleParser(opts);
    if (!client || typeof client.mediaSubtitleTrack !== "function") throw fail("COMPANION_CLIENT_UNAVAILABLE");
    if (!parse) throw fail("SUBTITLE_PARSER_UNAVAILABLE");
    var all = Array.isArray(readiness.subtitle_tracks) ? readiness.subtitle_tracks : [];
    var module = readinessModule(opts);
    var usable = module && typeof module.usableSubtitleTracks === "function"
      ? module.usableSubtitleTracks(readiness)
      : all.filter(function (track) {
        return track && track.status === "extracted"
          && (track.format === "srt" || track.format === "vtt")
          && SHA_RE.test(String(track.sha256 || ""));
      });
    var tracks = [];
    var failed = [];
    for (var i = 0; i < usable.length; i++) {
      var reported = usable[i];
      var served = null;
      try {
        served = await client.mediaSubtitleTrack(opts.jobId, reported.index);
      } catch (error) {
        failed.push({ index: reported.index, code: (error && error.code) || "SUBTITLE_TRACK_FETCH_FAILED" });
        continue;
      }
      // The report hash and the transferred bytes are two independent statements about the same
      // track; a material is built only when they agree.
      if (String(served.sha256 || "").toLowerCase() !== String(reported.sha256 || "").toLowerCase()) {
        failed.push({ index: reported.index, code: "SUBTITLE_TRACK_SHA_MISMATCH" });
        continue;
      }
      var parsed = null;
      try {
        parsed = parse(served.text, { hint: served.format || reported.format });
      } catch (error) {
        failed.push({ index: reported.index, code: (error && error.code) || "SUBTITLES_UNPARSEABLE" });
        continue;
      }
      if (!parsed || parsed.ok === false || !Array.isArray(parsed.segments) || !parsed.segments.length) {
        failed.push({ index: reported.index, code: (parsed && parsed.error_code) || "SUBTITLES_UNPARSEABLE" });
        continue;
      }
      tracks.push({
        index: reported.index,
        language: reported.language == null ? null : reported.language,
        language_tag: reported.language_tag == null ? null : reported.language_tag,
        title: reported.title == null ? null : reported.title,
        disposition: reported.disposition || {},
        format: served.format || reported.format || null,
        sha256: String(reported.sha256 || "").toLowerCase(),
        bytes: served.bytes == null ? null : Number(served.bytes),
        raw: served.text,
        cues: cuesFromSegments(parsed.segments),
      });
    }
    var usableIndexes = usable.map(function (track) { return track.index; });
    var skipped = all.filter(function (track) { return usableIndexes.indexOf(track.index) < 0; });
    return { tracks: tracks, failed: failed, skipped_non_text: skipped.length, skipped: skipped };
  }

  // A plan is confirmed by its own hash, so a plan that changed between the screen and the click
  // is refused by the companion instead of silently running something else.
  async function confirmMediaPlan(options) {
    var opts = options || {};
    var client = opts.client;
    var rendition = opts.rendition || "full";
    if (!client || typeof client.prepareMediaJob !== "function") throw fail("COMPANION_CLIENT_UNAVAILABLE");
    if (!opts.mode || !SHA_RE.test(String(opts.planSha256 || ""))) {
      throw fail("MEDIA_PLAN_UNCONFIRMED", "The media plan has no confirmable hash", { rendition: rendition });
    }
    var queued = await client.prepareMediaJob(opts.jobId, opts.mode, opts.planSha256, rendition);
    var wait = typeof opts.waitFn === "function"
      ? opts.waitFn
      : function (jobId, waitOptions, initial) { return client.waitForMediaJob(jobId, waitOptions, initial); };
    return wait(opts.jobId, opts.waitOptions, queued);
  }

  function renditionOutput(job, rendition) {
    var manifest = job || {};
    if (rendition === "lite") {
      var entry = (manifest.renditions || {}).lite || {};
      return { sha256: entry.sha256 || null, sizeBytes: entry.size_bytes == null ? null : Number(entry.size_bytes), name: entry.name || null };
    }
    var full = (manifest.renditions || {}).full || {};
    var size = manifest.output_bytes == null ? manifest.output_size_bytes : manifest.output_bytes;
    return {
      sha256: manifest.output_sha256 || full.sha256 || null,
      sizeBytes: size == null ? (full.size_bytes == null ? null : Number(full.size_bytes)) : Number(size),
      name: manifest.output_name || full.name || null,
    };
  }

  // The prepared file is streamed into OPFS and verified while it arrives: a 1.6 GB copy never
  // exists as one buffer, and unverified bytes are never written.
  async function storePreparedMedia(options) {
    var opts = options || {};
    var client = opts.client;
    var store = opts.store || (typeof window !== "undefined" ? window.MediaStreamStore : null);
    var rendition = opts.rendition || "full";
    if (!client || typeof client.mediaFileResponse !== "function") throw fail("COMPANION_CLIENT_UNAVAILABLE");
    if (!store || typeof store.streamToOpfs !== "function") throw fail("MEDIA_STREAM_STORE_UNAVAILABLE");
    var job = opts.job || {};
    var output = renditionOutput(job, rendition);
    if (job.state !== "COMPLETE" || !SHA_RE.test(String(output.sha256 || ""))) {
      throw fail("MEDIA_OUTPUT_UNVERIFIED", "The companion has no verified output for this rendition", { rendition: rendition });
    }
    var module = readinessModule(opts);
    var maxBytes = opts.maxBytes == null ? (module ? module.VIDEO_MAX_BYTES : undefined) : opts.maxBytes;
    var response = await client.mediaFileResponse(opts.jobId, rendition);
    var stored = await store.streamToOpfs({
      response: response,
      fileName: String(output.sha256).toLowerCase() + ".mp4",
      expectedSha256: String(output.sha256).toLowerCase(),
      expectedSize: output.sizeBytes,
      maxBytes: maxBytes,
      mimeType: opts.mimeType || "video/mp4",
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
    return {
      rendition: rendition,
      opfsPath: stored.opfsPath,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      mimeType: stored.mimeType || opts.mimeType || "video/mp4",
      name: output.name,
    };
  }

  var API = {
    loadSubtitleTracks: loadSubtitleTracks,
    confirmMediaPlan: confirmMediaPlan,
    storePreparedMedia: storePreparedMedia,
  };
  if (typeof window !== "undefined") window.SubtitleMaterialImport = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
