// public/js/subtitle-media-attach.js
// A material built from a subtitle FILE can carry its own media (owner, 2026-10-18): the person
// picks the subtitles, then the video or audio they belong to, and the finished material opens
// with that media. The media is chosen while the subtitles are on screen, so a video conversion
// runs while the text is being checked; the material is created only after the media's final
// hash is known, because a media package is bound to that hash for good.
// No DOM here: the companion client, the stores and the hash are injected.
(function () {
  "use strict";

  var SHA_RE = /^[a-f0-9]{64}$/i;
  var AUDIO_CHOICE = "AUDIO_STREAM_CHOICE_REQUIRED";
  // Subtitles that end this far past the media are for another cut or another frame rate.
  var OUTRUN_TOLERANCE_SEC = 5;

  function fail(code, extra) {
    var error = new Error(code);
    error.code = code;
    if (extra) Object.keys(extra).forEach(function (key) { error[key] = extra[key]; });
    return error;
  }

  function isVideoFile(file) {
    var type = String(file && file.type || "").toLowerCase(), name = String(file && file.name || "").toLowerCase();
    if (type.indexOf("video/") === 0) return true;
    if (type.indexOf("audio/") === 0) return false;
    return /\.(avi|mkv|mp4|m4v|mov|webm|wmv|mpg|mpeg|ts|flv|3gp)$/.test(name);
  }

  // Hebrew audio first, then the container's default, then the first stream: the choice is
  // returned so the screen names it instead of making it silently.
  function pickAudioStream(choices) {
    var list = Array.isArray(choices) ? choices.filter(function (c) { return c && Number.isInteger(Number(c.index)); }) : [];
    if (!list.length) return null;
    var hebrew = list.find(function (c) { return /^(he|heb|iw)$/i.test(String(c.language || "")); });
    var preferred = hebrew || list.find(function (c) { return c.disposition && c.disposition.default; }) || list[0];
    return { index: Number(preferred.index), language: preferred.language || null, reason: hebrew ? "hebrew" : (preferred === list[0] ? "first" : "default") };
  }

  function subtitleEnd(segments) {
    var end = 0;
    (Array.isArray(segments) ? segments : []).forEach(function (s) {
      var value = Number(s && (s.end != null ? s.end : s.start));
      if (Number.isFinite(value) && value > end) end = value;
    });
    return end;
  }

  // Independent of the subtitles' own claims: the media's measured length against the last cue.
  function durationCheck(segments, durationSec) {
    var end = subtitleEnd(segments), duration = Number(durationSec);
    if (!Number.isFinite(duration) || duration <= 0 || !end) return { status: "unknown", subtitle_end_sec: end || null, media_sec: Number.isFinite(duration) ? duration : null };
    return {
      status: end > duration + OUTRUN_TOLERANCE_SEC ? "subtitles_outrun_media" : "fits",
      subtitle_end_sec: Math.round(end * 10) / 10, media_sec: Math.round(duration * 10) / 10,
    };
  }

  function errorSummary(error) {
    var job = error && error.job || {};
    var detail = job.error_detail || job.error || (error && error.message !== (error && error.code) ? error.message : null) || null;
    return { code: (error && error.code) || "MEDIA_FAILED", detail: detail ? String(detail).slice(0, 300) : null };
  }

  async function prepareVideo(opts) {
    var client = opts.client, file = opts.file, step = opts.onStep || function () {};
    var importer = opts.importer, readiness = opts.readiness;
    if (!client || typeof client.createMediaJob !== "function") throw fail("COMPANION_REQUIRED");
    step("upload", { done: 0, total: file.size });
    var created = await client.createMediaJob(file, {
      onUploadProgress: function (p) { step("upload", { done: p.bytes, total: p.total }); }, signal: opts.signal,
    });
    var jobId = created.job_id;
    try {
      step("probe");
      var job = await client.waitForMediaJob(jobId, { signal: opts.signal }, created);
      var report = job.report || {}, audio = null;
      if (report.outcome === AUDIO_CHOICE) {
        audio = pickAudioStream(report.audio_choices);
        if (!audio) throw fail("MEDIA_AUDIO_STREAM_MISSING");
        job = await client.waitForMediaJob(jobId, { signal: opts.signal }, await client.chooseMediaAudioStream(jobId, audio.index));
        report = job.report || {};
      }
      if (job.state === "BLOCKED") throw fail("MEDIA_BLOCKED", { reason: report.reason || job.error || null });
      if (report.disk_sufficient === false) throw fail("MEDIA_DISK_SHORT", { needed: report.estimated_output_bytes, free: report.disk_free_bytes });
      if (job.state !== "COMPLETE") {
        var plan = report.plan || {};
        step("video", { done: 0, total: 1 });
        job = await importer.confirmMediaPlan({
          client: client, jobId: jobId, mode: plan.mode, planSha256: report.plan_sha256,
          waitOptions: { signal: opts.signal, onStatus: function (j) { step("video", { done: Number(j && j.progress) || 0, total: 1 }); } },
        });
      }
      step("store", { done: 0, total: job.output_bytes || null });
      var stored = await importer.storePreparedMedia({
        client: client, jobId: jobId, job: job, maxBytes: readiness.VIDEO_MAX_BYTES, signal: opts.signal,
        onProgress: function (p) { step("store", { done: p && p.bytes, total: p && p.total }); },
      });
      var renditions, liteError = null;
      if (opts.lite && report.lite_plan_sha256) {
        // The light copy is optional: the full copy is already verified and stored, so a failed
        // light copy is reported next to it and never takes the material's media away.
        try {
          step("lite", { done: 0, total: 1 });
          var liteJob = await importer.confirmMediaPlan({
            client: client, jobId: jobId, mode: "lite_transcode", planSha256: report.lite_plan_sha256, rendition: "lite",
            waitOptions: { signal: opts.signal, onStatus: function (j) { step("lite", { done: Number(j && j.progress) || 0, total: 1 }); } },
          });
          var lite = await importer.storePreparedMedia({ client: client, jobId: jobId, job: liteJob, rendition: "lite", signal: opts.signal });
          renditions = [{ role: "lite", sha256: lite.sha256, opfsPath: lite.opfsPath, sizeBytes: lite.sizeBytes,
            derived_from_source_sha256: job.source_sha256 || null }];
        } catch (error) {
          if (opts.signal && opts.signal.aborted) throw error;
          liteError = errorSummary(error);
        }
      }
      var prepared = readiness.acceptPrepared(job);
      return {
        opfsPath: stored.opfsPath, sha256: stored.sha256, mime: stored.mimeType || "video/mp4",
        sizeBytes: stored.sizeBytes, durationSec: (job.report && job.report.duration_seconds) || report.duration_seconds || null,
        originalName: file.name || stored.name || null,
        compatibility: readiness.compatibilityEvidence(prepared) || undefined,
        renditions: renditions, audio: audio, source_sha256: job.source_sha256 || null,
        lite_requested: !!opts.lite, lite_available: !!report.lite_plan_sha256, lite_error: liteError,
      };
    } catch (error) {
      // The companion job is released below, so what it said about the failure travels here.
      var summary = errorSummary(error);
      if (error && !error.detail) error.detail = summary.detail;
      throw error;
    } finally {
      // The material holds the prepared copy now; the companion's copies are temporary.
      try { if (typeof client.deleteMediaJob === "function") await client.deleteMediaJob(jobId); } catch (_) {}
    }
  }

  async function prepareAudio(opts) {
    var file = opts.file, store = opts.store, step = opts.onStep || function () {};
    if (!store || !store.canWrite()) throw fail("MEDIA_STORE_UNAVAILABLE");
    step("store", { done: 0, total: file.size });
    var buffer = await file.arrayBuffer();
    var sha = String(await opts.sha256(buffer)).toLowerCase();
    if (!SHA_RE.test(sha)) throw fail("MEDIA_SHA_FAILED");
    var mime = file.type || "audio/mpeg";
    var path = store.mediaFileName(sha, mime, file.name);
    var saved = await store.saveMedia(buffer, path);
    if (!saved || !saved.ok) throw fail("MEDIA_STORE_FAILED", { reason: saved && saved.reason });
    var durationSec = null;
    if (typeof opts.probeDuration === "function") { try { durationSec = await opts.probeDuration(file); } catch (_) {} }
    step("store", { done: file.size, total: file.size });
    return { opfsPath: path, sha256: sha, mime: mime, sizeBytes: file.size, durationSec: durationSec, originalName: file.name || null };
  }

  function prepareLocalMedia(options) {
    var opts = options || {};
    if (!opts.file) return Promise.reject(fail("MEDIA_FILE_MISSING"));
    return isVideoFile(opts.file) ? prepareVideo(opts) : prepareAudio(opts);
  }

  var API = {
    prepareLocalMedia: prepareLocalMedia, durationCheck: durationCheck, pickAudioStream: pickAudioStream,
    isVideoFile: isVideoFile, OUTRUN_TOLERANCE_SEC: OUTRUN_TOLERANCE_SEC,
  };
  if (typeof window !== "undefined") window.SubtitleMediaAttach = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
