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
    if (file.size > MAX_AUDIO_BYTES) { setStatus("studio.import.errAudioTooLarge"); return; }
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    var dur;
    try { dur = await probeAudioDuration(file); }
    catch (_) { setStatus("studio.import.errAudioBadFile"); return; }
    if (dur > MAX_AUDIO_SEC + 1) { setStatus("studio.import.errAudioTooLong"); return; }
    var mime = file.type || "audio/mpeg";
    pendingAudio = { file: file, buf: null, sha256: null, mime: mime, durationSec: dur, name: file.name, parsed: null, validation: null };
    var est = window.AsrTranscript.estimateAsrCostUsd(dur);
    var durRounded = Math.round(dur);
    var mm = Math.floor(durRounded / 60), ss = String(durRounded % 60).padStart(2, "0");
    $("v3ImportAudioMeta").textContent = mm + ":" + ss + " · " + (file.size / (1024 * 1024)).toFixed(1) + "MB";
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
    var provKey = { url: "studio.import.provUrl", image: "studio.import.provOcr", pdf: "studio.import.provPdf", docx: "studio.import.provDocx", audio: "studio.import.provAudio" }[p.kind];
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
    setStatus(null);
  }
  function close() {
    var m = $("v3ImportModal");
    if (m) m.classList.add("hidden");
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
    var input = $("inputText");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true })); // пусть существующие слушатели Студии отработают
    window.v3LastImportMeta = {
      kind: pending.kind, source: pending.source, method: pending.method, model: pending.model,
      warnings: pending.warnings, at: new Date().toISOString(), textSnapshot: text,
      audio: audioMetaForImport || undefined,
    };
    close();
    toast(pending.warnings && pending.warnings.length ? "studio.import.warnCheck" : "studio.import.done",
          pending.warnings && pending.warnings.length ? "warning" : "success");
  }

  window.StudioImport = { open: open, close: close, fetchUrl: fetchUrl, onFileChosen: onFileChosen,
                           onAudioChosen: onAudioChosen, transcribeAudio: transcribeAudio, useText: useText };
})();
