// public/js/studio-import.js
// W1 «Импорт»: единая точка входа внешнего контента (URL/файл/фото) в Студию.
// Канон: docs/planning/STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25.md.
// Извлечение делает сервер (/api/ingest/*); модуль приземляет ЧИСТЫЙ ТЕКСТ в
// #inputText и публикует провенанс-паспорт window.v3LastImportMeta (R9: derived).
// Зависимости-глобалы Студии: geminiKeyGet(), showToast(), t(), #inputText.
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var MAX_FILE_BYTES = 6 * 1024 * 1024;
  var pending = null; // {kind, source, method, model, warnings, text}

  // W2-S4 — Import → Audio (BYOK Gemini ASR). Канон:
  // docs/planning/STUDIO_INGEST_W2_S4_AUDIO_KARAOKE_DESIGN_2026_07_26.md.
  var MAX_AUDIO_SEC = 20 * 60;           // решение S4-CAP: 20 минут hard cap (R16)
  var MAX_AUDIO_BYTES = 300 * 1024 * 1024; // sanity
  var pendingAudio = null; // {file, buf, sha256, mime, durationSec, name, parsed, validation}

  // W2-S5a — Import → Captions (.vtt/.srt file or pasted YouTube transcript panel) + optional
  // embedded YouTube player for capability preview. Канон:
  // docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md.
  var pendingCaptions = null; // {parsed, origin, fileName, video}
  var ytAdapter = null;       // адаптер плеера, если ролик встроен

  function $(id) { return document.getElementById(id); }
  function tr(key) { return (typeof window.t === "function") ? window.t(key) : key; }
  function toast(key, type) { if (typeof window.showToast === "function") window.showToast(tr(key), type || "info"); }

  function setStatus(msgKey, extra) {
    var el = $("v3ImportStatus");
    if (el) el.textContent = msgKey ? (tr(msgKey) + (extra ? " " + extra : "")) : "";
  }

  function setBusy(b) {
    var btn = $("v3ImportUrlBtn");
    if (btn) btn.disabled = b;
    var f = $("v3ImportFile");
    if (f) f.disabled = b;
    var ab = $("v3ImportAudioGo");
    if (ab) ab.disabled = b;
  }

  function probeAudioDuration(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var a = new Audio();
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; URL.revokeObjectURL(url); reject(new Error("AUDIO_BAD_FILE")); } }, 10000);
      a.onloadedmetadata = function () {
        if (done) return; done = true; clearTimeout(to); URL.revokeObjectURL(url);
        (isFinite(a.duration) && a.duration > 0) ? resolve(a.duration) : reject(new Error("AUDIO_BAD_FILE"));
      };
      a.onerror = function () { if (!done) { done = true; clearTimeout(to); URL.revokeObjectURL(url); reject(new Error("AUDIO_BAD_FILE")); } };
      a.src = url;
    });
  }

  async function onAudioChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    $("v3ImportAudioInfo").hidden = true;
    pendingAudio = null;
    var isVideo = String(file.type || "").toLowerCase().startsWith("video/");
    if (file.size > MAX_AUDIO_BYTES) { setStatus(isVideo ? "studio.import.errVideoTooLarge" : "studio.import.errAudioTooLarge"); return; }
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    var dur;
    try { dur = await probeAudioDuration(file); }
    catch (_) { setStatus("studio.import.errAudioBadFile"); return; }
    if (dur > MAX_AUDIO_SEC + 1) { setStatus("studio.import.errAudioTooLong"); return; }
    var mime = file.type || "audio/mpeg";
    pendingAudio = { file: file, buf: null, sha256: null, mime: mime, durationSec: dur, name: file.name, parsed: null, validation: null, isVideo: isVideo };
    var est = window.AsrTranscript.estimateAsrCostUsd(dur, { video: isVideo });
    var durRounded = Math.round(dur);
    var mm = Math.floor(durRounded / 60), ss = String(durRounded % 60).padStart(2, "0");
    var metaText = mm + ":" + ss + " · " + (file.size / (1024 * 1024)).toFixed(1) + "MB";
    if (isVideo) metaText += " · " + tr("studio.import.videoNote");
    $("v3ImportAudioMeta").textContent = metaText;
    $("v3ImportAudioGo").textContent = tr("studio.import.audioGo") + " (≈$" + Math.max(0.01, est).toFixed(2) + ")";
    $("v3ImportAudioInfo").hidden = false;
    setStatus(null);
  }

  async function transcribeAudio() {
    if (!pendingAudio) return;
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    setBusy(true);
    try {
      setStatus("studio.import.audioUploading");
      pendingAudio.buf = await pendingAudio.file.arrayBuffer();
      pendingAudio.sha256 = await window.MediaStore.sha256Hex(pendingAudio.buf);
      var up = await window.GeminiFiles.uploadFile(key, pendingAudio.file, pendingAudio.mime);
      setStatus("studio.import.audioProcessing");
      if (up.state !== "ACTIVE") await window.GeminiFiles.waitActive(key, up.name);
      setStatus("studio.import.audioTranscribing");
      var raw = await window.GeminiFiles.transcribeAudio(key, up.fileUri, pendingAudio.mime);
      var parsed;
      try { parsed = window.AsrTranscript.parseAsrResponse(raw); }
      catch (e1) {
        if (e1.code !== "ASR_BAD_JSON") throw e1;
        raw = await window.GeminiFiles.transcribeAudio(key, up.fileUri, pendingAudio.mime); // 1 повтор
        parsed = window.AsrTranscript.parseAsrResponse(raw);
      }
      if (!parsed.segments.length || parsed.warnings.includes("NO_SPEECH")) { setStatus("studio.import.errNoSpeech"); return; }
      pendingAudio.parsed = parsed;
      pendingAudio.validation = window.AsrTranscript.validateSegments(parsed.segments, pendingAudio.durationSec);
      showPreview({
        kind: "audio", source: pendingAudio.name, method: "gemini-asr",
        model: window.AsrTranscript.ASR_MODEL,
        warnings: parsed.warnings.concat(pendingAudio.validation.timingOk ? [] : ["ASR_TIMING_INVALID"]),
        text: pendingAudio.validation.segments.map(function (s) { return s.text; }).join("\n"),
      });
    } catch (e) {
      var code = e && e.code;
      if (!code && e && (e.status != null)) code = window.GeminiError.classifyGeminiError(e).error_code;
      setStatus(errKey(code || "UPLOAD_FAILED"));
    } finally { setBusy(false); }
  }

  function showPreview(p) {
    pending = p;
    $("v3ImportPreview").value = p.text;
    var provKey = { url: "studio.import.provUrl", image: "studio.import.provOcr", pdf: "studio.import.provPdf", docx: "studio.import.provDocx", audio: "studio.import.provAudio", captions: "studio.import.provCaptions" }[p.kind];
    var prov = tr(provKey) + " · " + p.source + (p.model ? " · " + p.model : "");
    if (p.warnings && p.warnings.length) prov += " · ⚠ " + tr("studio.import.warnCheck");
    $("v3ImportProv").textContent = prov;
    $("v3ImportPreviewWrap").hidden = false;
    setStatus(null);
  }

  async function postJson(url, body) {
    var res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    var data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok !== true) {
      var code = (data && data.error_code) || ("HTTP_" + res.status);
      var err = new Error(code);
      err.code = code;
      throw err;
    }
    return data;
  }

  var ERROR_KEY = {
    BAD_URL: "studio.import.errBadUrl", BAD_SCHEME: "studio.import.errBadUrl", BAD_PORT: "studio.import.errBadUrl",
    PRIVATE_ADDR: "studio.import.errPrivateUrl", NOT_HTML: "studio.import.errNotHtml",
    TOO_LARGE: "studio.import.errTooLarge", FILE_TOO_LARGE: "studio.import.errTooLarge",
    EXTRACT_EMPTY: "studio.import.errEmpty", DOCX_EMPTY: "studio.import.errEmpty", BAD_DOCX: "studio.import.errBadFile",
    BAD_MIME: "studio.import.errBadFile", BAD_KIND: "studio.import.errBadFile",
    GEMINI_KEY_REQUIRED: "studio.import.errNoKey", GEMINI_KEY_INVALID: "studio.import.errNoKey",
    GEMINI_KEY_REJECTED: "studio.import.errKeyRejected",
    GEMINI_QUOTA: "studio.import.errQuota", GEMINI_OVERLOADED: "studio.import.errOverloaded",
    EXTRACT_BAD_JSON: "studio.import.errExtractBadJson",
    // W2-S4 — audio ASR path
    AUDIO_BAD_FILE: "studio.import.errAudioBadFile", AUDIO_TOO_LONG: "studio.import.errAudioTooLong",
    UPLOAD_FAILED: "studio.import.errUpload", FILE_FAILED: "studio.import.errUpload", FILE_TIMEOUT: "studio.import.errUpload",
    ASR_TIMEOUT: "studio.import.errOverloaded", ASR_BAD_JSON: "studio.import.errExtractBadJson",
    NO_SPEECH: "studio.import.errNoSpeech",
    // W2-S5a — captions parsing path
    CAPTIONS_EMPTY: "studio.import.errCaptionsEmpty",
    CAPTIONS_NO_TIMESTAMPS: "studio.import.errCaptionsNoTimestamps",
    CAPTIONS_UNPARSEABLE: "studio.import.errCaptionsUnparseable",
    CAPTIONS_TOO_MANY: "studio.import.errCaptionsTooMany",
  };
  function errKey(code) { return ERROR_KEY[code] || "studio.import.errGeneric"; }

  function open() {
    var m = $("v3ImportModal");
    if (m) m.classList.remove("hidden");
    var pw = $("v3ImportPreviewWrap");
    if (pw) pw.hidden = true;
    var ai = $("v3ImportAudioInfo");
    if (ai) ai.hidden = true;
    pendingAudio = null;
    // MINOR (whole-branch review 2026-07-28): reopening the dialog after a captions-paste
    // import showed the PREVIOUS paste sitting in the textarea — clear it, matching the
    // pendingAudio reset just above.
    var cp = $("v3ImportCaptionsPaste");
    if (cp) cp.value = "";
    setStatus(null);
  }
  function close() {
    var m = $("v3ImportModal");
    if (m) m.classList.add("hidden");
    // W2-S5a: this modal owns ytAdapter's lifetime (it created it in mountVideo()) — every path
    // that hides the modal (Cancel, backdrop click, post-commit close() at the end of useText())
    // funnels through here, so this is the single teardown point. Leaving it live would keep a
    // YouTube iframe (and possibly playing audio) mounted inside a hidden modal indefinitely.
    if (ytAdapter) {
      if (window.StudioYtPlayer) window.StudioYtPlayer.destroy(ytAdapter);
      ytAdapter = null;
    }
    var ytm = $("v3ImportYtMount");
    if (ytm) { ytm.hidden = true; ytm.innerHTML = ""; }
    var yth = $("v3ImportYtHint");
    if (yth) yth.textContent = "";
    pendingCaptions = null;
  }

  async function fetchUrl() {
    var url = ($("v3ImportUrl").value || "").trim();
    if (!url) { setStatus("studio.import.errBadUrl"); return; }
    setBusy(true); setStatus("studio.import.working");
    try {
      var r = await postJson("/api/ingest/fetch-url", { url: url });
      showPreview({ kind: "url", source: r.sourceUrl, method: r.method, model: null, warnings: r.warnings || [], text: r.text });
    } catch (e) { setStatus(errKey(e.code)); }
    finally { setBusy(false); }
  }

  function kindForFile(file) {
    var name = (file.name || "").toLowerCase();
    if (name.endsWith(".docx")) return { kind: "docx", mimeType: file.type || "application/octet-stream" };
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return { kind: "pdf", mimeType: "application/pdf" };
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { kind: "image", mimeType: file.type };
    return null;
  }

  function onFileChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = ""; // тот же файл можно выбрать повторно
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var k = kindForFile(file);
    if (!k) { setStatus("studio.import.errBadFile"); return; }
    var needsKey = k.kind !== "docx";
    var key = needsKey && (typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "");
    if (needsKey && !key) { setStatus("studio.import.errNoKey"); return; }
    setBusy(true); setStatus("studio.import.working");
    var reader = new FileReader();
    reader.onerror = function () { setBusy(false); setStatus("studio.import.errGeneric"); };
    reader.onload = async function () {
      try {
        var b64 = String(reader.result).split(",")[1] || "";
        var body = { kind: k.kind, mimeType: k.mimeType, dataBase64: b64, filename: file.name };
        if (needsKey) body.geminiApiKey = key;
        var r = await postJson("/api/ingest/extract-file", body);
        showPreview({ kind: k.kind, source: file.name, method: r.method, model: r.model, warnings: r.warnings || [], text: r.text });
      } catch (e) { setStatus(errKey(e.code)); }
      finally { setBusy(false); }
    };
    reader.readAsDataURL(file);
  }

  async function useText() {
    if (!pending) return;
    var text = ($("v3ImportPreview").value || "").trim(); // пользователь мог поправить в превью — это ок
    if (!text) { setStatus("studio.import.errEmpty"); return; }
    var audioMetaForImport = null;
    if (pending.kind === "audio" && pendingAudio && pendingAudio.validation) {
      var lines = text.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var v = pendingAudio.validation;
      var editedAway = lines.length !== v.segments.length;
      var segs = editedAway
        ? lines.map(function (t2, k) { return { i: k, start: null, text: t2 }; })
        : v.segments.map(function (s, k) { return { i: k, start: s.start, text: lines[k] }; });
      var dropReason = editedAway ? "PREVIEW_EDITED" : (v.timingOk ? null : v.dropReason);
      var fileName = window.MediaStore.mediaFileName(pendingAudio.sha256, pendingAudio.mime, pendingAudio.name);
      // OPFS-запись; недоступна (старый Safari) → session-only blob + честный warning
      window.v3SessionMediaBlob = null;
      var saved = window.MediaStore.canWrite()
        ? await window.MediaStore.saveMedia(pendingAudio.buf, fileName)
        : { ok: false, reason: "NO_CREATE_WRITABLE" };
      audioMetaForImport = {
        v: 1,
        media: { opfsPath: saved.ok ? fileName : null, sessionOnly: !saved.ok, sha256: pendingAudio.sha256,
                 mime: pendingAudio.mime, sizeBytes: pendingAudio.file.size,
                 durationSec: pendingAudio.durationSec, originalName: pendingAudio.name },
        asr: { method: "gemini-asr", model: window.AsrTranscript.ASR_MODEL, at: new Date().toISOString(),
               language: pendingAudio.parsed.language, filesApi: true, warnings: pendingAudio.parsed.warnings },
        segments: segs, timing: null, timingDropReason: dropReason,
      };
      if (!saved.ok) window.v3SessionMediaBlob = pendingAudio.file;
      if (editedAway) toast("studio.import.audioTimingDropped", "warning");
    }
    var captionsMetaForImport = null;
    if (pending.kind === "captions" && pendingCaptions && pendingCaptions.parsed) {
      var cl = text.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var ps = pendingCaptions.parsed.segments;
      var cEdited = cl.length !== ps.length;
      captionsMetaForImport = {
        v: 1,
        captions: { origin: pendingCaptions.origin, format: pendingCaptions.parsed.format,
                    kindHint: pendingCaptions.parsed.kindHint,
                    kindEvidence: pendingCaptions.parsed.rolling ? "vtt-rolling"
                                : (pendingCaptions.parsed.format === "vtt" || pendingCaptions.parsed.format === "srt" ? "vtt-plain" : "none"),
                    language: pendingCaptions.parsed.language, fileName: pendingCaptions.fileName,
                    at: new Date().toISOString(), droppedHeadings: pendingCaptions.parsed.droppedHeadings,
                    warnings: pending.warnings || [] },
        video: pendingCaptions.video || undefined,
        segments: cEdited ? cl.map(function (t2, k) { return { i: k, start: null, text: t2 }; })
                          : ps.map(function (s, k) { return { i: k, start: s.start, text: cl[k] }; }),
        timing: null,
        timingDropReason: cEdited ? "PREVIEW_EDITED" : null,
      };
      if (cEdited) toast("studio.import.audioTimingDropped", "warning");
    }
    var input = $("inputText");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true })); // пусть существующие слушатели Студии отработают
    window.v3LastImportMeta = {
      kind: pending.kind, source: pending.source, method: pending.method, model: pending.model,
      warnings: pending.warnings, at: new Date().toISOString(), textSnapshot: text,
      audio: audioMetaForImport || undefined,
      captions: captionsMetaForImport || undefined,
    };
    close();
    toast(pending.warnings && pending.warnings.length ? "studio.import.warnCheck" : "studio.import.done",
          pending.warnings && pending.warnings.length ? "warning" : "success");
  }

  // W2-S5a — Классификация URL: ссылка на YouTube уходит в ветку S5a, а НЕ в
  // /api/ingest/fetch-url — тот вернул бы либо EXTRACT_EMPTY, либо мусор из SPA-шелла (разведка
  // 2026-07-27).
  async function fetchUrlOrVideo() {
    var url = ($("v3ImportUrl").value || "").trim();
    if (!url) { setStatus("studio.import.errBadUrl"); return; }
    var vid = window.StudioYtPlayer && window.StudioYtPlayer.parseVideoId(url);
    if (!vid) return fetchUrl();
    // IMPORTANT 3 (review 2026-07-27): fetchUrl() already disables #v3ImportUrlBtn for the
    // duration of its request (setBusy(true)/finally(false)) — mountVideo()'s create() is just
    // as async (real network + YouTube IFrame API boot) and was missing the same guard. Without
    // it, a second submit while the first create() is in flight races in: ytAdapter is still
    // null (mountVideo()'s own `if (ytAdapter)` destroy-guard hasn't been assigned yet), so BOTH
    // create() calls land in the same #v3ImportYtMount and whichever resolves first is silently
    // orphaned when the second overwrites `ytAdapter`. Disabling the button prevents the second
    // click from ever firing in the first place — same mechanism fetchUrl() already relies on.
    setBusy(true); setStatus(null);
    try { await mountVideo(vid, url); }
    finally { setBusy(false); }
  }

  // IMPORTANT 1 (whole-branch review 2026-07-28): YouTube's captions module — the thing
  // getOption("captions","tracklist") reads — does not load until playback actually starts;
  // measured live (task-8-report.md): a video with 64 real tracks (incl. manual Hebrew) reads
  // tracklist().length === 0 at onReady AND immediately after calling play(), then populates
  // within ~300-500ms of real playback. Querying once at onReady and treating an empty result
  // as "no captions" is this project's own "тихий 0 ≠ реальный 0" trap — absence of evidence
  // is not evidence of absence, and the old wording sent users toward paid ASR for videos that
  // DO have subtitles. Fix: describeTracks() never asserts "none" from an unconfirmed read; the
  // hint is re-queried on the adapter's own 'play' event (RE_CONFIRM_DELAY_MS after — the
  // measurement above showed ~300-500ms is already enough, this leaves headroom) and only THEN
  // may it settle on the genuine "no captions" message.
  var RE_CONFIRM_DELAY_MS = 800;

  async function mountVideo(videoId, url) {
    var mount = $("v3ImportYtMount"), hint = $("v3ImportYtHint");
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.video = { platform: "youtube", videoId: videoId, url: url };
    if (ytAdapter) { window.StudioYtPlayer.destroy(ytAdapter); ytAdapter = null; }
    mount.innerHTML = "";
    var cap = window.StudioYtPlayer.capability();
    if (!cap.supported) { mount.hidden = true; hint.textContent = tr("studio.import.captionsNoPlayer"); return; }
    mount.hidden = false;
    hint.textContent = tr("studio.import.captionsPlayerLoading");
    try {
      ytAdapter = await window.StudioYtPlayer.create(mount, videoId);
      var thisAdapter = ytAdapter;
      hint.textContent = describeTracks(thisAdapter.tracklist(), /* confirmed */ false);
      var onPlay = function () {
        thisAdapter.removeEventListener("play", onPlay); // one real confirmation is enough
        setTimeout(function () {
          if (ytAdapter !== thisAdapter) return; // superseded by a later mountVideo()/destroyed
          hint.textContent = describeTracks(thisAdapter.tracklist(), /* confirmed */ true);
        }, RE_CONFIRM_DELAY_MS);
      };
      thisAdapter.addEventListener("play", onPlay);
    } catch (e) {
      mount.hidden = true;
      hint.textContent = tr(e && e.code === "YT_EMBED_DENIED"
        ? "studio.import.captionsEmbedDenied" : "studio.import.captionsNoPlayer");
    }
  }

  // R9: сообщаем, ЧТО есть у ролика — это свидетельство о дорожках, а не о принесённом файле.
  // `confirmed` = true only after a real 'play' event + grace delay (see RE_CONFIRM_DELAY_MS
  // above) — an EMPTY unconfirmed read means "not reported yet", never "there are none".
  function describeTracks(list, confirmed) {
    if (!list || !list.length) {
      return tr(confirmed ? "studio.import.captionsTracksNone" : "studio.import.captionsTracksPending");
    }
    var manual = list.filter(function (t) { return t.kind !== "asr"; });
    // MINOR (whole-branch review 2026-07-28): a track with neither languageName nor
    // languageCode must not render the literal string "undefined" — drop it instead.
    var langs = (manual.length ? manual : list)
      .map(function (t) { return t.languageName || t.languageCode; })
      .filter(Boolean);
    var uniq = langs.filter(function (v, i) { return langs.indexOf(v) === i; }).slice(0, 4).join(", ");
    var label = tr(manual.length ? "studio.import.captionsTracksManual" : "studio.import.captionsTracksAuto");
    return uniq ? label + " " + uniq : label;
  }

  function acceptCaptions(parsed, origin, fileName) {
    if (!parsed.ok) { setStatus(errKey(parsed.error_code)); return; }
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.parsed = parsed;
    pendingCaptions.origin = origin;
    pendingCaptions.fileName = fileName || null;
    var warn = [];
    if (parsed.kindHint === "auto") warn.push("AUTO_CAPTIONS");
    if (parsed.droppedHeadings > 0) warn.push("HEADINGS_DROPPED");
    showPreview({
      kind: "captions", source: fileName || tr("studio.import.captionsSourcePaste"),
      method: origin === "file" ? "captions-file" : "captions-panel", model: null,
      warnings: warn,
      text: parsed.segments.map(function (s) { return s.text; }).join("\n"),
    });
  }

  function onCaptionsFileChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var reader = new FileReader();
    reader.onerror = function () { setStatus("studio.import.errGeneric"); };
    reader.onload = function () {
      acceptCaptions(window.CaptionsParse.parse(String(reader.result || "")), "file", file.name);
    };
    reader.readAsText(file, "utf-8");
  }

  function useCaptionsPaste() {
    var raw = ($("v3ImportCaptionsPaste").value || "");
    if (!raw.trim()) { setStatus("studio.import.errCaptionsEmpty"); return; }
    acceptCaptions(window.CaptionsParse.parse(raw), "paste", null);
  }

  window.StudioImport = { open: open, close: close, fetchUrl: fetchUrl, fetchUrlOrVideo: fetchUrlOrVideo,
                           onFileChosen: onFileChosen, onAudioChosen: onAudioChosen, transcribeAudio: transcribeAudio,
                           onCaptionsFileChosen: onCaptionsFileChosen, useCaptionsPaste: useCaptionsPaste,
                           useText: useText };
})();
