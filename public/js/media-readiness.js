// Studio video preflight truth: the selected bytes are unresolved until the
// authenticated local Companion returns READY for the exact canonical SHA.
(function () {
  "use strict";

  var VIDEO_RE = /\.(mp4|mov|m4v|mkv|webm|avi)$/i;

  function isVideo(file) {
    return !!file && (String(file.type || "").toLowerCase().indexOf("video/") === 0 || VIDEO_RE.test(String(file.name || "")));
  }

  function initialForFile(file) {
    if (isVideo(file)) {
      return { outcome: "PROBING", canonical_sha256: null, canonical_name: null, bind_outcome: "pending" };
    }
    return { outcome: "AUDIO_READY", canonical_sha256: null, canonical_name: file && file.name || null, bind_outcome: "bound_pending_sha" };
  }

  function canStartAsr(state) {
    if (!state) return false;
    if (state.outcome === "AUDIO_READY" || state.outcome === "TRANSCRIPT_ONLY") return true;
    return state.outcome === "READY" && /^[a-f0-9]{64}$/i.test(String(state.canonical_sha256 || ""));
  }

  function acceptReport(job) {
    var report = job && job.report || {};
    var sha = job && (job.output_sha256 || (report.outcome === "READY" ? job.source_sha256 : null));
    return {
      outcome: report.outcome || job && job.state || "BLOCKED",
      canonical_sha256: sha || null,
      canonical_name: job && (job.output_name || job.source_name) || null,
      bind_outcome: sha ? "bound_pending_import" : "pending",
      target_contract: report.target_contract || null,
      codec_summary: report.codec_summary || null,
      reason: report.reason || null,
      next_action: report.next_action || null,
      plan: report.plan || null,
      plan_sha256: report.plan_sha256 || null,
      estimated_output_bytes: report.estimated_output_bytes || null,
      estimated_time_seconds: report.estimated_time_seconds || null,
      disk_free_bytes: report.disk_free_bytes || null,
      disk_sufficient: report.disk_sufficient !== false,
      job_id: job && job.job_id || null,
      progress: Number(job && job.progress || 0),
      state: job && job.state || null,
      verification: job && job.verification || null,
      cleanup_receipt: job && job.cleanup_receipt || null,
    };
  }

  function acceptPrepared(job) {
    var state = acceptReport(job);
    if (!job || job.state !== "COMPLETE" || !/^[a-f0-9]{64}$/i.test(String(job.output_sha256 || ""))) {
      throw new Error("MEDIA_PREPARED_OUTPUT_NOT_VERIFIED");
    }
    state.outcome = "READY";
    state.canonical_sha256 = job.output_sha256;
    state.canonical_name = job.output_name;
    state.bind_outcome = "bound_pending_import";
    return state;
  }

  function transcriptOnly() {
    return { outcome: "TRANSCRIPT_ONLY", canonical_sha256: null, canonical_name: null, bind_outcome: "not_bound" };
  }

  function compatibilityEvidence(state) {
    if (!state || state.outcome !== "READY") return null;
    var codec = state.codec_summary || {}, level = Number(codec.declared_level || codec.required_level || 0);
    var levelHex = level > 0 ? Math.round(level).toString(16).toUpperCase().padStart(2, "0") : null;
    var profile = String(codec.profile || "").toLowerCase(), avcProfile = profile.indexOf("main") === 0 ? "4D" : profile.indexOf("high") === 0 ? "64" : "42";
    var audioProfile = String(codec.audio_profile || "").toLowerCase();
    var audioObjectType = audioProfile.indexOf("he-aac") === 0 ? "5" : "2";
    var codecHint = levelHex ? "avc1." + avcProfile + "00" + levelHex + ",mp4a.40." + audioObjectType : null;
    var intOrNull = function (value) { var number = Number(value); return value != null && Number.isInteger(number) ? number : null; };
    var normalizedCodec = {
      container: codec.container || null,
      faststart: codec.faststart !== false,
      video_codec: codec.video_codec || null,
      profile: codec.profile || null,
      declared_level: intOrNull(codec.declared_level),
      required_level: intOrNull(codec.required_level),
      pixel_format: codec.pixel_format || null,
      color_transfer: codec.color_transfer || null,
      color_primaries: codec.color_primaries || null,
      sdr: codec.sdr !== false,
      width: intOrNull(codec.width),
      height: intOrNull(codec.height),
      fps: codec.fps == null ? null : String(codec.fps),
      audio_codec: codec.audio_codec || null,
      audio_profile: codec.audio_profile || null,
      sample_rate: intOrNull(codec.sample_rate),
      channels: intOrNull(codec.channels),
    };
    return {
      contract: state.target_contract || "linguistpro-mobile-v1",
      outcome: "READY",
      canonical_sha256: state.canonical_sha256,
      codec_summary: normalizedCodec,
      codec_hint: codecHint,
    };
  }

  function humanBytes(bytes) {
    var value = Number(bytes || 0);
    if (!value) return "—";
    if (value < 1024 * 1024) return Math.ceil(value / 1024) + " KB";
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }

  function devicePlatform(userAgent) {
    var ua = String(userAgent || "");
    var deviceFamily = /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad" : /Android/i.test(ua) ? "Android" : "other";
    var osFamily = /iPhone|iPad|iPod/i.test(ua) ? "iOS/iPadOS" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "other";
    var browserFamily = /CriOS/i.test(ua) ? "Chrome iOS" : /FxiOS/i.test(ua) ? "Firefox iOS" : /EdgiOS/i.test(ua) ? "Edge iOS" : /EdgA|Edg\//i.test(ua) ? "Edge" : /Chrome|Chromium/i.test(ua) ? "Chrome" : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "other";
    return { device_family: deviceFamily, os_family: osFamily, browser_family: browserFamily };
  }

  async function actualFilePlaySeek(file, options) {
    if (!isVideo(file)) throw new Error("MEDIA_DEVICE_GATE_VIDEO_REQUIRED");
    if (typeof document === "undefined" || typeof URL === "undefined") throw new Error("MEDIA_DEVICE_GATE_BROWSER_REQUIRED");
    var opts = options || {}, video = document.createElement("video"), url = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (opts.mount) opts.mount.appendChild(video);
    var terminalFailure = null;
    ["error", "abort", "stalled"].forEach(function (name) {
      video.addEventListener(name, function () { terminalFailure = name; });
    });
    function event(name, timeout) {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { reject(new Error("MEDIA_DEVICE_GATE_" + name.toUpperCase() + "_TIMEOUT")); }, timeout || 15000);
        video.addEventListener(name, function handler() { clearTimeout(timer); video.removeEventListener(name, handler); resolve(); }, { once: true });
        video.addEventListener("error", function handler() { clearTimeout(timer); reject(new Error("MEDIA_DEVICE_GATE_PLAYBACK_ERROR")); }, { once: true });
      });
    }
    async function seek(fraction) {
      var done = event("seeked");
      video.currentTime = Math.max(0, Math.min(video.duration - 0.1, video.duration * fraction));
      await done;
      var at = video.currentTime;
      await video.play();
      await new Promise(function (resolve) { setTimeout(resolve, 350); });
      video.pause();
      if (video.currentTime <= at) throw new Error("MEDIA_DEVICE_GATE_POST_SEEK_DID_NOT_ADVANCE");
      return video.currentTime;
    }
    try {
      video.src = url;
      await event("loadedmetadata");
      if (video.readyState < 2) await event("loadeddata");
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth <= 0) throw new Error("MEDIA_DEVICE_GATE_METADATA_INVALID");
      var before = video.currentTime;
      await video.play();
      await new Promise(function (resolve) { setTimeout(resolve, 750); });
      video.pause();
      if (video.currentTime <= before) throw new Error("MEDIA_DEVICE_GATE_PLAY_DID_NOT_ADVANCE");
      var seek25 = await seek(0.25), seek75 = await seek(0.75);
      if (terminalFailure) throw new Error("MEDIA_DEVICE_GATE_" + terminalFailure.toUpperCase());
      var audioEvidence = video.audioTracks && typeof video.audioTracks.length === "number"
        ? (video.audioTracks.length > 0 ? "audioTracks" : "missing")
        : (typeof video.webkitAudioDecodedByteCount === "number" && video.webkitAudioDecodedByteCount > 0 ? "decodedBytes" : "not_exposed");
      if (audioEvidence === "missing") throw new Error("MEDIA_DEVICE_GATE_AUDIO_MISSING");
      if (audioEvidence === "not_exposed" && opts.expectAudio !== false) throw new Error("MEDIA_DEVICE_GATE_AUDIO_UNVERIFIED");
      var ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      var platform = devicePlatform(ua);
      return { pass: true, tested_at: new Date().toISOString(), device_family: platform.device_family, os_family: platform.os_family, browser_family: platform.browser_family, audio_evidence: audioEvidence,
               duration: video.duration, width: video.videoWidth, height: video.videoHeight, seek25: seek25, seek75: seek75 };
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (video.parentNode && !opts.keepMounted) video.parentNode.removeChild(video);
    }
  }

  async function exactFileDeviceGate(file, expectedSha, options) {
    var expected = String(expectedSha || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error("MEDIA_DEVICE_GATE_EXPECTED_SHA_INVALID");
    if (!file || typeof file.arrayBuffer !== "function") throw new Error("MEDIA_DEVICE_GATE_FILE_REQUIRED");
    var opts = options || {}, hash = opts.sha256Hex;
    if (typeof hash !== "function") {
      hash = async function (bytes) {
        if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("MEDIA_DEVICE_GATE_HASH_UNAVAILABLE");
        var digest = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest), function (value) { return value.toString(16).padStart(2, "0"); }).join("");
      };
    }
    var bytes = await file.arrayBuffer(), actual = String(await hash(bytes)).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(actual)) throw new Error("MEDIA_DEVICE_GATE_ACTUAL_SHA_INVALID");
    if (actual !== expected) {
      var mismatch = new Error("MEDIA_DEVICE_GATE_SHA_MISMATCH");
      mismatch.code = "MEDIA_DEVICE_GATE_SHA_MISMATCH";
      mismatch.expected_sha = expected;
      mismatch.actual_sha = actual;
      mismatch.file_name = String(file.name || "media");
      mismatch.file_size = Number(file.size || bytes.byteLength || 0);
      throw mismatch;
    }
    var playback = typeof opts.playback === "function" ? opts.playback : actualFilePlaySeek;
    var receipt = await playback(file, opts.playbackOptions);
    if (!receipt || receipt.pass !== true) throw new Error("MEDIA_DEVICE_GATE_PLAYBACK_NOT_VERIFIED");
    return Object.assign({}, receipt, { media_sha256: expected });
  }

  var API = {
    isVideo: isVideo,
    initialForFile: initialForFile,
    canStartAsr: canStartAsr,
    acceptReport: acceptReport,
    acceptPrepared: acceptPrepared,
    transcriptOnly: transcriptOnly,
    compatibilityEvidence: compatibilityEvidence,
    humanBytes: humanBytes,
    devicePlatform: devicePlatform,
    actualFilePlaySeek: actualFilePlaySeek,
    exactFileDeviceGate: exactFileDeviceGate,
  };
  if (typeof window !== "undefined") window.MediaReadiness = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
