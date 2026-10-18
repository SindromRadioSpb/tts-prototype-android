// public/js/room-media-attach.js
// O-102 (owner, 2026-10-18): a material that was built without media gets its video or audio in
// the Reading Room, in the "Источник" dialog. It reuses the Studio pieces: SubtitleMediaAttach
// prepares the file (the Companion converts video, checks speech sync while it still holds the
// audio), the repository binds the media to the material's own package in place, and a found
// shift or frame-rate stretch goes through StudyTimingRepair as a derived timing revision —
// the rows, the text and the raw track never change.
(function () {
  "use strict";

  function tr(key, params) {
    var value = typeof window.t === "function" ? window.t(key, params) : key;
    return value === key ? key : value;
  }

  async function sha256Hex(buffer) {
    var digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function probeDuration(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), el = document.createElement("audio");
      el.preload = "metadata";
      el.onloadedmetadata = function () { URL.revokeObjectURL(url); resolve(Number.isFinite(el.duration) ? el.duration : null); };
      el.onerror = function () { URL.revokeObjectURL(url); reject(new Error("MEDIA_DURATION_UNREADABLE")); };
      el.src = url;
    });
  }

  // The package this material is bound to, when it has no media yet; otherwise null.
  async function unboundTarget(textId) {
    if (!window.StudioMediaPackage) return null;
    var repo = window.StudioMediaPackage.browserRepository(), binding = await repo.getTextBinding(String(textId));
    if (!binding) return null;
    var pkg = await repo.getPackage(binding.package_id), revision = await repo.getRevision(binding.revision_id);
    if (!pkg || pkg.media_sha256 || !revision) return null;
    return { repo: repo, binding: binding, pkg: pkg, revision: revision };
  }

  function correctedTimes(revision, sync) {
    var scale = Number(sync.apply_scale) || 1, offset = Number(sync.apply_offset_ms) || 0;
    return revision.segments.map(function (s) {
      var timed = s.start_ms != null && s.end_ms != null;
      return { text: s.text, startSec: timed ? (Math.round(s.start_ms * scale) + offset) / 1000 : null,
        endSec: timed ? (Math.round(s.end_ms * scale) + offset) / 1000 : null };
    });
  }

  function syncNote(sync) {
    var m = window.SubtitleMediaAttach && window.SubtitleMediaAttach.syncMessage(sync);
    if (!m) return "";
    return tr(m.key, Object.assign({}, m.params || {}, m.directionKey ? { direction: tr(m.directionKey) } : {}));
  }

  async function attach(textId, file, options) {
    var opts = options || {}, say = opts.onStatus || function () {};
    var A = window.SubtitleMediaAttach, target = await unboundTarget(textId);
    if (!target) throw Object.assign(new Error("ROOM_MEDIA_NOT_ATTACHABLE"), { code: "ROOM_MEDIA_NOT_ATTACHABLE" });
    var video = A.isVideoFile(file);
    var client = null;
    if (video) {
      if (!window.LocalAsrClient || !window.LocalAsrClient.getPairingToken()) {
        throw Object.assign(new Error("COMPANION_REQUIRED"), { code: "COMPANION_REQUIRED" });
      }
      client = new window.LocalAsrClient.Client();
    }
    var segments = target.revision.segments;
    var media = await A.prepareLocalMedia({
      file: file, client: client, importer: window.SubtitleMaterialImport, readiness: window.MediaReadiness,
      store: window.MediaStore, lite: opts.lite !== false, signal: opts.signal, sha256: sha256Hex, probeDuration: probeDuration,
      onStep: function (step) { say(tr("studio.import.captionsMediaStep_" + step, { name: file.name })); },
      // The bound revision is the timing being checked; its hash names it to the Companion.
      syncInput: async function () {
        return { sha256: target.revision.canonical_sha256,
          cueStarts: segments.filter(function (s) { return s.start_ms != null; }).map(function (s) { return s.start_ms / 1000; }) };
      },
    });
    var check = A.durationCheck(segments.map(function (s) {
      return { start: s.start_ms == null ? null : s.start_ms / 1000, end: s.end_ms == null ? null : s.end_ms / 1000 };
    }), media.durationSec);
    // A stretch that is going to be applied explains a long track; only an unexplained one asks.
    var explained = media.subtitleSync && media.subtitleSync.status === "correctable" && media.subtitleSync.apply_scale !== 1;
    if (check.status === "subtitles_outrun_media" && !explained && typeof opts.confirm === "function" &&
        !opts.confirm(tr("studio.import.captionsMediaOutrunConfirm", { subs: clock(check.subtitle_end_sec), media: clock(check.media_sec) }))) {
      return { attached: false, reason: "declined" };
    }
    var pkg = await target.repo.attachMediaToUnboundPackage(target.pkg.package_id, {
      sha256: media.sha256, opfs_path: media.opfsPath, size_bytes: media.sizeBytes,
      duration_ms: Math.round(Number(media.durationSec) * 1000), mime: media.mime,
      original_name: media.originalName, compatibility: media.compatibility,
    }, { method: media.compatibility ? "companion-prepared" : "stored-as-is", surface: "room-source-dialog",
      source_sha256: media.source_sha256 || null, audio_stream: media.audio || null, duration_check: check,
      subtitle_sync: media.subtitleSync || null, lite: media.renditions ? "made" : (media.lite_error ? { failed: media.lite_error } : "not_made") });
    if (media.renditions && media.renditions[0]) {
      var lite = media.renditions[0];
      try {
        await window.StudioMediaPackage.relinkStoredRendition(pkg.package_id, { rendition: "lite", sha256: lite.sha256,
          opfsPath: lite.opfsPath, sizeBytes: lite.sizeBytes, mimeType: "video/mp4" }, pkg.media_sha256, pkg.duration_ms, media.source_sha256 || null);
      } catch (_) { /* The light copy is optional; the full copy is bound. */ }
    }
    var timingApplied = false, sync = media.subtitleSync;
    if (sync && sync.status === "correctable" && window.StudyTimingRepair) {
      var ctx = await window.StudyTimingRepair.context(String(textId));
      if (ctx.revision.revision_id === target.revision.revision_id) {
        await window.StudyTimingRepair.apply(ctx, correctedTimes(ctx.revision, sync), sync, "derived");
        timingApplied = true;
      }
    }
    window.dispatchEvent(new CustomEvent("playback-source-changed", { detail: { textId: String(textId) } }));
    return { attached: true, media: media, package: pkg, timingApplied: timingApplied, syncNote: syncNote(sync), check: check };
  }

  function clock(sec) {
    var s = Math.max(0, Math.round(Number(sec) || 0)), h = Math.floor(s / 3600);
    var mm = String(Math.floor(s % 3600 / 60)), ss = String(s % 60).padStart(2, "0");
    return h ? h + ":" + mm.padStart(2, "0") + ":" + ss : mm + ":" + ss;
  }

  // The dialog section: shown only for a material whose package has no media.
  async function mount(dialog, textId) {
    var target = null;
    try { target = await unboundTarget(textId); } catch (_) { target = null; }
    if (!target || !dialog.isConnected) return null;
    var box = document.createElement("section");
    box.className = "room-media-attach";
    var title = document.createElement("strong");
    title.textContent = tr("room.mediaAttach.title");
    var help = document.createElement("p");
    help.textContent = tr("room.mediaAttach.help");
    var input = document.createElement("input");
    input.type = "file"; input.accept = "video/*,audio/*,.avi,.mkv,.m4a,.opus,.oga"; input.hidden = true;
    var pick = document.createElement("button");
    pick.type = "button"; pick.textContent = tr("studio.import.captionsMediaLocalBtn");
    var liteLabel = document.createElement("label"), lite = document.createElement("input");
    lite.type = "checkbox"; lite.checked = true;
    liteLabel.append(lite, document.createTextNode(" " + tr("studio.import.subtitlePlanLiteToggle")));
    var status = document.createElement("p");
    status.setAttribute("role", "status");
    pick.onclick = function () { input.click(); };
    input.onchange = async function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      pick.disabled = true; lite.disabled = true;
      try {
        var result = await attach(textId, file, { lite: lite.checked, onStatus: function (text) { status.textContent = text; },
          confirm: function (text) { return window.confirm(text); } });
        if (!result.attached) { status.textContent = tr("room.mediaAttach.declined"); return; }
        status.textContent = tr("room.mediaAttach.done", { name: file.name }) + (result.syncNote ? " " + result.syncNote : "")
          + (result.timingApplied ? " " + tr("room.mediaAttach.timingApplied") : "");
        pick.hidden = true; liteLabel.hidden = true;
      } catch (error) {
        var code = (error && (error.code || error.message)) || "MEDIA_FAILED";
        status.textContent = code === "COMPANION_REQUIRED" ? tr("room.mediaAttach.needsCompanion")
          : code === "MEDIA_ALREADY_IN_PACKAGE" ? tr("room.mediaAttach.alreadyUsed")
          : tr("room.mediaAttach.failed", { code: code + (error && error.detail ? " · " + error.detail : "") });
      } finally { pick.disabled = false; lite.disabled = false; }
    };
    box.append(title, help, pick, input, liteLabel, status);
    dialog.append(box);
    return box;
  }

  var API = { mount: mount, attach: attach, unboundTarget: unboundTarget, correctedTimes: correctedTimes };
  if (typeof window !== "undefined") window.RoomMediaAttach = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
