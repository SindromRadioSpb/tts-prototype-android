// W2-S4 · Браузер→Google Gemini Files API (BYOK): resumable upload + poll ACTIVE + ASR-вызов.
// Raw REST без SDK (прецедент: ttsBake → GCP TTS REST). Сервер НЕ участвует (архитектура A,
// решение S4-TRANSPORT): ни байта медиа и ни ASR-вызова через CX23. Протокол верифицирован
// scripts/premium/ingest-audio-live-smoke.js + ingest-audio-cors-check.js (spike Task 2).
(function () {
  "use strict";
  var GL = "https://generativelanguage.googleapis.com";
  var MODEL = (typeof window !== "undefined" && window.AsrTranscript) ? window.AsrTranscript.ASR_MODEL
            : (typeof module !== "undefined" ? require("./asr-transcript.js").ASR_MODEL : "gemini-flash-latest");

  function buildStartUploadRequest(apiKey, meta) {
    return {
      url: GL + "/upload/v1beta/files",
      init: {
        method: "POST",
        headers: {
          "x-goog-api-key": String(apiKey),
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(meta.sizeBytes),
          "X-Goog-Upload-Header-Content-Type": String(meta.mimeType),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: String(meta.displayName || "audio") } }),
      },
    };
  }

  function buildAsrRequest(apiKey, fileUri, mimeType, promptText) {
    return {
      url: GL + "/v1beta/models/" + MODEL + ":generateContent",
      init: {
        method: "POST",
        headers: { "x-goog-api-key": String(apiKey), "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { file_data: { file_uri: String(fileUri), mime_type: String(mimeType) } },
            { text: String(promptText) },
          ] }],
          generationConfig: { temperature: 0 },
        }),
      },
    };
  }

  async function httpErr(resp, fallback) {
    var body = ""; try { body = await resp.text(); } catch (_) {}
    var e = new Error(body || fallback); e.status = resp.status; return e;
  }

  async function uploadFile(apiKey, blob, mimeType, onPhase) {
    if (onPhase) onPhase("upload-start");
    var size = blob.byteLength != null ? blob.byteLength : blob.size;
    var r = buildStartUploadRequest(apiKey, { sizeBytes: size, mimeType: mimeType, displayName: "studio-import" });
    var start = await fetch(r.url, r.init);
    if (!start.ok) throw await httpErr(start, "upload start failed");
    var uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl) { var e = new Error("no x-goog-upload-url"); e.code = "UPLOAD_FAILED"; throw e; }
    if (onPhase) onPhase("upload-bytes");
    var up = await fetch(uploadUrl, {
      method: "POST",
      headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
      body: blob,
    });
    if (!up.ok) throw await httpErr(up, "upload failed");
    var file = (await up.json()).file || {};
    return { fileUri: file.uri, name: file.name, state: file.state };
  }

  async function waitActive(apiKey, name, opts) {
    var interval = (opts && opts.intervalMs) || 2000;
    var deadline = Date.now() + ((opts && opts.timeoutMs) || 60000);
    for (;;) {
      var g = await fetch(GL + "/v1beta/" + name, { headers: { "x-goog-api-key": String(apiKey) } });
      if (!g.ok) throw await httpErr(g, "files.get failed");
      var state = (await g.json()).state;
      if (state === "ACTIVE") return;
      if (state === "FAILED") { var e = new Error("file processing failed"); e.code = "FILE_FAILED"; throw e; }
      if (Date.now() > deadline) { var t = new Error("file processing timeout"); t.code = "FILE_TIMEOUT"; throw t; }
      await new Promise(function (res) { setTimeout(res, interval); });
    }
  }

  async function transcribeAudio(apiKey, fileUri, mimeType) {
    var prompt = (typeof window !== "undefined" && window.AsrTranscript) ? window.AsrTranscript.ASR_PROMPT
               : require("./asr-transcript.js").ASR_PROMPT;
    var r = buildAsrRequest(apiKey, fileUri, mimeType, prompt);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 180000) : null;
    var resp;
    try { resp = await fetch(r.url, Object.assign({}, r.init, ctrl ? { signal: ctrl.signal } : {})); }
    catch (e) {
      if (e && e.name === "AbortError") { var t = new Error("ASR timeout"); t.code = "ASR_TIMEOUT"; throw t; }
      throw e;
    } finally { if (timer) clearTimeout(timer); }
    if (!resp.ok) throw await httpErr(resp, "generateContent failed");
    var data = await resp.json();
    var parts = ((data.candidates || [])[0] || {}).content;
    return ((parts && parts.parts) || []).map(function (p) { return p.text || ""; }).join("");
  }

  var API = { buildStartUploadRequest: buildStartUploadRequest, buildAsrRequest: buildAsrRequest,
              uploadFile: uploadFile, waitActive: waitActive, transcribeAudio: transcribeAudio };
  if (typeof window !== "undefined") window.GeminiFiles = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
