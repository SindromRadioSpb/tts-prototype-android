// First-party media intake. Persist job receipts/references, never capabilities or signed URLs.
(function () {
  "use strict";
  var HISTORY_KEY = "studio.media-downloads.v1";
  var S = { capability: null, resolved: null, selectedId: null, kind: "video", record: null,
    acquired: null, abort: null, busy: false, serial: 0, playerUrl: null, run: null };
  function failure(code) { var error = new Error(code); error.code = code; return error; }
  function el(id) { return typeof document === "undefined" ? null : document.getElementById(id); }
  function tr(key, fallback, vars) {
    var value = key;
    try { value = typeof t === "function" ? t(key) : key; } catch (_) {}
    if (!value || value === key) value = fallback || key;
    Object.keys(vars || {}).forEach(function (name) { value = String(value).split("{" + name + "}").join(String(vars[name])); });
    return String(value);
  }
  function text(id, value) { var node = el(id); if (node) node.textContent = value || ""; }
  function show(id, value) { var node = el(id); if (node) node.hidden = !value; }
  function humanBytes(value) {
    if (value == null || !Number.isFinite(Number(value))) return tr("studio.remoteMedia.sizeUnknown", "Size checked during transfer");
    return (Number(value) / (1024 * 1024)).toFixed(1) + " MB";
  }
  function clock(seconds) {
    var total = Math.max(0, Math.round(Number(seconds) || 0)), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") : m + ":" + String(s).padStart(2, "0");
  }
  function presentOptions(options) {
    var video = (options || []).filter(function (item) { return item.kind === "video" && item.has_audio === true; });
    var audio = (options || []).filter(function (item) { return item.kind === "audio" && item.has_audio !== false; });
    video.sort(function (a, b) { return Number(a.quality) - Number(b.quality); });
    return { video: video, audio: audio };
  }
  function buildJobRequest(input) {
    if (!input || !input.rightsConfirmed) throw failure("RIGHTS_REQUIRED");
    if (!input.planToken || !input.optionId) throw failure("PLAN_SELECTION_REQUIRED");
    var request = { plan_token: input.planToken, option_id: input.optionId, rights_basis: { kind: "rights_holder_permission" } };
    if (input.requestId) request.request_id = input.requestId;
    return request;
  }
  function validateRecord(record) {
    return !!record && record.version === 1 && /^[a-f0-9]{32}$/.test(record.requestId || "")
      && /^[a-f0-9]{64}$/.test(record.scope || "") && record.source && /^[A-Za-z0-9_-]{11}$/.test(record.source.video_id || "")
      && record.option && ["video", "audio"].includes(record.option.kind)
      && (!record.jobId || /^rma_[a-f0-9]{32}$/.test(record.jobId))
      && (!record.stored || (/^media\/[a-f0-9]{64}\.[a-z0-9]+$/.test(record.stored.opfsPath || "")
        && /^[a-f0-9]{64}$/.test(record.stored.sha256 || "") && Number.isSafeInteger(record.stored.sizeBytes)
        && record.stored.sizeBytes > 0 && record.stored.opfsPath.split('/')[1].split('.')[0] === record.stored.sha256))
      && (record.state !== "complete" || (!!record.stored && !!record.receipt
        && record.receipt.output_sha256 === record.stored.sha256 && record.receipt.output_size_bytes === record.stored.sizeBytes))
      && ["pending", "paused", "stored", "complete", "cancelled", "failed"].includes(record.state);
  }
  function readRecords(storage) {
    try { var rows = JSON.parse(storage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(rows) ? rows.filter(validateRecord) : []; }
    catch (_) { return []; }
  }
  function records() { return readRecords(localStorage); }
  function persist(record) {
    if (!validateRecord(record)) throw failure("RESUME_IDENTITY_INVALID");
    var rows = records(), index = rows.findIndex(function (row) { return row.requestId === record.requestId; });
    record.updatedAt = Date.now();
    if (index < 0) rows.unshift(record); else rows[index] = record;
    // No eviction of completed media references. Storage failure is shown before acquiring bytes.
    localStorage.setItem(HISTORY_KEY, JSON.stringify(rows));
    renderHistory();
  }
  function setStatus(key, fallback, danger) {
    var node = el("v3RemoteMediaStatus"); if (!node) return;
    node.textContent = key ? tr(key, fallback) : ""; node.hidden = !key; node.dataset.danger = danger ? "true" : "false";
  }
  function reportError(error) {
    var code = error && error.code || "NETWORK_ERROR";
    setStatus("studio.remoteMedia.error." + String(code).toLowerCase(), tr("studio.remoteMedia.failed", "Transfer stopped. Check your connection and retry."), true);
  }
  function setBusy(value) {
    S.busy = !!value;
    ["v3RemoteMediaResolve", "v3ImportVideoUrl", "v3RemoteMediaVideo", "v3RemoteMediaAudio", "v3RemoteMediaQuality", "v3RemoteMediaRights"]
      .forEach(function (id) { var node = el(id); if (node) node.disabled = !!value; });
    var add = el("v3RemoteMediaAdd"); if (add) add.disabled = !!value || !S.selectedId || !!S.record;
    show("v3RemoteMediaPause", value && !!S.record);
    show("v3RemoteMediaCancel", !!S.record && !["complete", "cancelled", "failed"].includes(S.record.state));
    show("v3RemoteMediaResume", !value && !!S.record && ["pending", "paused", "stored"].includes(S.record.state));
    show("v3RemoteMediaNew", !value && !!S.record);
    var card = el("v3RemoteMediaCard"); if (card) card.setAttribute("aria-busy", String(!!value));
  }
  async function jsonResponse(response) {
    var body = {}; try { body = await response.json(); } catch (_) {}
    if (!response.ok || !body.ok) throw failure(body.error_code || body.error || ("HTTP_" + response.status));
    return body;
  }
  async function mintCapability() {
    if (window.CloudSync && window.CloudSync.me) await window.CloudSync.me();
    var csrf = ""; try { csrf = localStorage.getItem("cloud.csrf") || ""; } catch (_) {}
    var response = await fetch("/api/media-acquisition/capability", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf }, body: "{}", cache: "no-store" });
    var capability = await jsonResponse(response);
    if (!/^[a-f0-9]{64}$/.test(capability.subject_scope || "")) throw failure("WORKER_UPDATE_REQUIRED");
    if (S.record && S.record.scope !== capability.subject_scope) throw failure("ACCOUNT_CHANGED");
    S.capability = capability;
    return capability;
  }
  async function workerFetch(path, options, retry) {
    var capability = S.capability;
    if (!capability || Number(capability.expires_at || 0) <= Math.floor(Date.now() / 1000) + 5) capability = await mintCapability();
    if (S.record && capability.subject_scope !== S.record.scope) throw failure("ACCOUNT_CHANGED");
    options = Object.assign({}, options || {}); options.headers = Object.assign({}, options.headers || {}, { Authorization: "Bearer " + capability.capability });
    var response = await fetch(capability.worker_url + path, options);
    if (response.status === 401 && retry !== false) { await mintCapability(); return workerFetch(path, options, false); }
    return response;
  }
  function selected() { return S.resolved && S.resolved.options.find(function (item) { return item.id === S.selectedId; }); }
  function renderChoice() {
    if (!S.resolved) return;
    var matrix = presentOptions(S.resolved.options), options = matrix[S.kind];
    if (!options.some(function (item) { return item.id === S.selectedId; })) {
      var best = options.find(function (item) { return item.recommended; }) || options[0];
      S.selectedId = best ? best.id : null;
    }
    ["video", "audio"].forEach(function (kind) {
      var button = el(kind === "video" ? "v3RemoteMediaVideo" : "v3RemoteMediaAudio");
      if (button) { button.disabled = !matrix[kind].length || S.busy || !!S.record; button.setAttribute("aria-pressed", String(S.kind === kind)); }
    });
    var quality = el("v3RemoteMediaQuality");
    quality.replaceChildren();
    options.forEach(function (item) {
      var option = document.createElement("option"); option.value = item.id;
      option.textContent = item.kind === "video" ? item.quality + "p" : "M4A";
      option.selected = item.id === S.selectedId; quality.appendChild(option);
    });
    quality.disabled = S.busy || !!S.record;
    show("v3RemoteMediaQualityWrap", S.kind === "video" && options.length > 1 && !S.record);
    var item = selected();
    text("v3RemoteMediaSize", item ? (item.kind === "video" ? "MP4 " + item.quality + "p" : "M4A") + " · " + humanBytes(item.size_bytes) : "");
    show("v3RemoteMediaChoices", !S.record); show("v3RemoteMediaRightsWrap", !S.record);
    show("v3RemoteMediaAdd", !S.record);
  }
  function renderResolved() {
    if (!S.resolved) return;
    show("v3RemoteMediaCard", true);
    text("v3RemoteMediaTitle", S.resolved.source.title);
    text("v3RemoteMediaMeta", clock(S.resolved.source.duration_seconds) + " · YouTube");
    renderChoice(); setBusy(S.busy);
  }
  function chooseKind(kind) { if (S.busy || S.record || !["video", "audio"].includes(kind)) return; S.kind = kind; S.selectedId = null; renderChoice(); }
  function chooseQuality(id) { if (S.busy || S.record) return; S.selectedId = id; renderChoice(); }
  function clearPlayer() {
    var mount = el("v3RemoteMediaPlayer");
    if (mount) { var player = mount.querySelector("video,audio"); if (player) { player.pause(); player.removeAttribute("src"); player.load(); } mount.replaceChildren(); }
    if (S.playerUrl) URL.revokeObjectURL(S.playerUrl);
    S.playerUrl = null;
  }
  function newSource() {
    if (S.busy) return;
    S.serial++; S.record = null; S.acquired = null; S.resolved = null; S.selectedId = null;
    clearPlayer(); show("v3RemoteMediaCard", false); show("v3RemoteMediaDone", false); show("v3RemoteMediaProgressWrap", false);
    var rights = el("v3RemoteMediaRights"); if (rights) rights.checked = false;
    setStatus(null); setBusy(false);
  }
  function sourceChanged() { if (!S.busy) newSource(); }
  async function resolveFromField() {
    if (S.busy) return;
    var field = el("v3ImportVideoUrl"), url = String(field && field.value || "").trim();
    newSource();
    var serial = S.serial, abort = new AbortController(); S.abort = abort;
    setBusy(true); setStatus("studio.remoteMedia.resolving", "Checking available formats…");
    try {
      await mintCapability();
      var runtime = await jsonResponse(await workerFetch("/v1/runtime", { signal: abort.signal }));
      if (!(runtime.worker_runtime.features || []).includes("range-resume-v1")) throw failure("WORKER_UPDATE_REQUIRED");
      var response = await workerFetch("/v1/resolve", { method: "POST", signal: abort.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url }) });
      var resolved = await jsonResponse(response);
      if (serial !== S.serial) return;
      var matrix = presentOptions(resolved.options);
      if (!matrix.video.length && !matrix.audio.length) throw failure("NO_COMPATIBLE_FORMAT");
      S.resolved = resolved; S.kind = matrix.video.length ? "video" : "audio";
      renderResolved(); setStatus(null);
    } catch (error) { if (serial === S.serial) reportError(error); }
    finally { if (serial === S.serial) { S.abort = null; setBusy(false); if (S.resolved) renderChoice(); } }
  }
  function progress(phase, done, total) {
    show("v3RemoteMediaProgressWrap", true);
    text("v3RemoteMediaProgressText", tr("studio.remoteMedia.phase." + phase, "Preparing") + (done ? " · " + humanBytes(done) : ""));
    var bar = el("v3RemoteMediaProgress");
    if (bar) { if (total > 0) { bar.max = total; bar.value = Math.min(done || 0, total); } else bar.removeAttribute("value"); }
  }
  async function pollJob(record, signal) {
    while (true) {
      if (signal.aborted) throw failure("STREAM_PAUSED");
      var job = await jsonResponse(await workerFetch("/v1/jobs/" + record.jobId, { cache: "no-store", signal: signal }));
      record.expiresAt = job.expires_at; record.ready = job;
      progress(String(job.phase).toLowerCase(), job.bytes_done, job.bytes_total);
      if (["READY", "COMPLETE"].includes(job.state)) { persist(record); return job; }
      if (["FAILED", "CANCELED", "EXPIRED"].includes(job.state)) throw failure(job.error_code || ("JOB_" + job.state));
      await new Promise(function (resolve) { setTimeout(resolve, 900); });
    }
  }
  async function attach(record) {
    var file = await window.MediaStore.readMedia(record.stored.opfsPath);
    if (!file) throw failure("MEDIA_FILE_MISSING");
    var acquired = { stored: record.stored, receipt: Object.assign({}, record.receipt, {
      owner_saved_copy: !!(record.exportReceipt && record.exportReceipt.owner_saved_copy),
      owner_saved_copy_receipt: record.exportReceipt || null }), source: record.source,
      option: record.option, downloadName: record.downloadName };
    var accepted = await window.StudioImport.acceptRemoteAcquisition(acquired);
    if (!accepted || !accepted.ok) throw failure("STUDIO_ATTACH_FAILED");
    S.acquired = Object.assign(acquired, { file: file });
    clearPlayer(); S.playerUrl = URL.createObjectURL(file);
    var player = document.createElement(record.option.kind === "video" ? "video" : "audio");
    player.controls = true; player.preload = "metadata"; player.setAttribute("playsinline", "");
    player.setAttribute("aria-label", record.source.title); player.src = S.playerUrl;
    el("v3RemoteMediaPlayer").appendChild(player);
    show("v3RemoteMediaDone", true); show("v3RemoteMediaProgressWrap", false);
    setStatus(record.receipt.deletion_receipt && record.receipt.deletion_receipt.deleted ? "studio.remoteMedia.added" : "studio.remoteMedia.addedCleanupPending", "Added to LinguistPro on this device");
  }
  function lockWork(task) {
    if (navigator.locks && navigator.locks.request) return navigator.locks.request("linguistpro-media-download", { ifAvailable: true }, function (lock) {
      if (!lock) throw failure("DOWNLOAD_IN_OTHER_TAB"); return task();
    });
    return Promise.reject(failure("BROWSER_UNSUPPORTED"));
  }
  async function transfer(record, createRequest) {
    if (S.busy) return;
    var abort = new AbortController(); S.abort = abort; setBusy(true);
    S.run = lockWork(async function () {
      await mintCapability();
      if (!record.jobId) {
        var job = createRequest
          ? await jsonResponse(await workerFetch("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createRequest), signal: abort.signal }))
          : await jsonResponse(await workerFetch("/v1/requests/" + record.requestId, { signal: abort.signal }));
        record.jobId = job.job_id; record.expiresAt = job.expires_at; persist(record);
      }
      var ready = await pollJob(record, abort.signal);
      if (abort.signal.aborted) throw failure("STREAM_PAUSED");
      record.downloadName = record.downloadName || ready.download_name;
      var path = window.MediaStore.mediaFileName(ready.output_sha256, ready.mime_type, record.downloadName);
      var options = { jobId: record.jobId, fileName: path, expectedSha256: ready.output_sha256,
        expectedSize: ready.output_size_bytes, mimeType: ready.mime_type, signal: abort.signal };
      record.stored = await window.MediaStreamStore.downloadToOpfs(Object.assign(options, {
        fetchResponse: async function (offset, signal) {
          var headers = offset ? { Range: "bytes=" + offset + "-", "If-Range": '"' + ready.output_sha256 + '"' } : {};
          var response = await workerFetch("/v1/jobs/" + record.jobId + "/stream", { headers: headers, signal: signal, cache: "no-store" });
          if (!response.ok) await jsonResponse(response);
          return response;
        }, onProgress: function (value) { progress("device", value.bytes, value.total); }
      }));
      record.state = "stored"; persist(record);
      record.receipt = await jsonResponse(await workerFetch("/v1/jobs/" + record.jobId + "/device-receipt", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ sha256: record.stored.sha256, size_bytes: record.stored.sizeBytes }) }));
      record.state = "complete"; persist(record);
      await attach(record);
    });
    try { await S.run; }
    catch (error) {
      // Losing the short-lived server receipt must not strand already verified local bytes.
      // Re-verify locally and report cleanup as unconfirmed, never invent server deletion.
      if (["JOB_NOT_FOUND", "JOB_EXPIRED"].includes(error.code) && record.stored && record.ready && record.ready.output_verification) {
        try {
          await window.MediaStreamStore.verifyStored({ fileName: record.stored.opfsPath,
            expectedSha256: record.ready.output_sha256, expectedSize: record.ready.output_size_bytes });
          record.receipt = { job_id: record.jobId, output_sha256: record.ready.output_sha256,
            output_size_bytes: record.ready.output_size_bytes, output_verification: record.ready.output_verification,
            stored_in_studio_opfs: true, owner_saved_copy: false,
            deletion_receipt: { deleted: false, reason: "server_receipt_unavailable" } };
          record.state = "complete"; persist(record); await attach(record); return;
        } catch (localError) { error = localError; }
      }
      if (record.state !== "complete") {
        var terminal = ["JOB_NOT_FOUND", "JOB_EXPIRED", "JOB_CANCELED", "SOURCE_UNAVAILABLE", "SOURCE_BOT_BLOCKED", "SOURCE_REGION_BLOCKED", "SOURCE_ACCESS_BLOCKED", "FORMAT_UNAVAILABLE", "OUTPUT_MEDIA_INVALID", "OUTPUT_SIZE_LIMIT", "LOGIN_REQUIRED"];
        record.state = terminal.includes(error.code) ? "failed" : (record.stored ? "stored" : "paused");
        if (record.state === "failed" && record.ready && record.ready.output_sha256) {
          try { await window.MediaStreamStore.discardPartial(record.jobId, record.ready.output_sha256); } catch (_) {}
        }
        try { persist(record); } catch (_) {}
      }
      if (abort.signal.aborted) setStatus("studio.remoteMedia.paused", "Paused. Continue from the saved position.");
      else reportError(error);
    } finally { S.abort = null; S.run = null; setBusy(false); renderChoice(); }
  }
  async function addSelected() {
    if (S.busy || S.record || !selected()) return;
    try {
      var requestId = crypto.randomUUID().replace(/-/g, "");
      var request = buildJobRequest({ planToken: S.resolved.plan_token, optionId: S.selectedId,
        requestId: requestId, rightsConfirmed: el("v3RemoteMediaRights").checked });
      setBusy(true);
      await window.MediaStreamStore.checkCapacity(selected().size_bytes);
      S.record = { version: 1, requestId: requestId, scope: S.capability.subject_scope,
        source: S.resolved.source, option: selected(), state: "pending", jobId: null, createdAt: Date.now() };
      persist(S.record); renderChoice();
      setBusy(false);
      await transfer(S.record, request);
    } catch (error) { reportError(error); setBusy(false); }
  }
  function pause() { if (S.abort) S.abort.abort(); var player = el("v3RemoteMediaPlayer"); if (player) { var media = player.querySelector("video,audio"); if (media) media.pause(); } }
  async function resume() { if (S.record && !S.busy) await transfer(S.record); }
  async function cancel() {
    var record = S.record; if (!record) return;
    pause(); if (S.run) { try { await S.run; } catch (_) {} }
    if (record.state === "complete") return;
    try {
      if (!record.jobId) { var found = await jsonResponse(await workerFetch("/v1/requests/" + record.requestId)); record.jobId = found.job_id; }
      await jsonResponse(await workerFetch("/v1/jobs/" + record.jobId, { method: "DELETE" }));
      if (record.ready && record.ready.output_sha256) await window.MediaStreamStore.discardPartial(record.jobId, record.ready.output_sha256);
      record.state = "cancelled"; persist(record); setBusy(false);
      setStatus("studio.remoteMedia.cancelled", "Download cancelled");
    } catch (error) { reportError(error); }
  }
  async function restoreRecord(requestId) {
    if (S.busy) return;
    var record = records().find(function (row) { return row.requestId === requestId; });
    if (!record) return;
    newSource(); S.record = record; S.selectedId = record.option.id; S.kind = record.option.kind;
    S.resolved = { source: record.source, options: [record.option] };
    el("v3ImportVideoUrl").value = record.source.canonical_url;
    renderResolved();
    if (record.state === "complete") {
      setBusy(true);
      try {
        await window.MediaStreamStore.verifyStored({ fileName: record.stored.opfsPath, expectedSha256: record.stored.sha256,
          expectedSize: record.stored.sizeBytes, mimeType: record.stored.mimeType });
        await attach(record);
      } catch (error) { reportError(error); }
      finally { setBusy(false); renderChoice(); }
    } else setStatus("studio.remoteMedia.paused", "Continue the saved download");
  }
  function renderHistory() {
    var list = el("v3RemoteMediaHistoryList"); if (!list) return;
    var rows = records().filter(function (row) { return !["cancelled", "failed"].includes(row.state); });
    list.replaceChildren(); show("v3RemoteMediaHistory", rows.length > 0);
    rows.forEach(function (record) {
      var button = document.createElement("button"); button.type = "button"; button.className = "v3-rma-history-item";
      var title = document.createElement("strong"), detail = document.createElement("span");
      title.textContent = record.source.title;
      detail.textContent = (record.option.kind === "video" ? "MP4 " + record.option.quality + "p" : "M4A") + " · " +
        tr(record.state === "complete" ? "studio.remoteMedia.localCopy" : "studio.remoteMedia.resume", record.state === "complete" ? "On this device" : "Continue download");
      button.append(title, detail); button.addEventListener("click", function () { restoreRecord(record.requestId); }); list.appendChild(button);
    });
  }
  function onOpen() {
    renderHistory();
    if (S.record) {
      window.StudioImport.switchTab("video");
      var field = el("v3ImportVideoUrl"); if (field) field.value = S.record.source.canonical_url;
      if (S.resolved) renderResolved();
      return;
    }
    var pending = records().find(function (row) { return ["pending", "paused", "stored"].includes(row.state); });
    if (pending) { window.StudioImport.switchTab("video"); restoreRecord(pending.requestId); }
  }
  async function saveCopy() {
    if (!S.acquired) return;
    try {
      var receipt = await window.MediaStreamStore.saveCopyFromOpfs(S.acquired.stored.opfsPath, S.acquired.downloadName, S.acquired.file);
      if (window.StudioImport.recordRemoteSavedCopy) window.StudioImport.recordRemoteSavedCopy(receipt);
      S.acquired.receipt.owner_saved_copy = receipt.owner_saved_copy === true;
      S.acquired.receipt.owner_saved_copy_receipt = receipt;
      S.record.exportReceipt = receipt; persist(S.record);
      setStatus(receipt.owner_saved_copy ? "studio.remoteMedia.fileSaved" : "studio.remoteMedia.copySaved", receipt.owner_saved_copy ? "File saved" : "Device save requested");
    } catch (error) { if (error.name !== "AbortError") reportError(failure("COPY_FAILED")); }
  }
  async function continueToTranscript() {
    if (!S.acquired) return;
    await window.StudioImport.acceptRemoteAcquisition(S.acquired);
    window.StudioImport.switchTab("file");
    var action = el("v3ImportAudioGo"); if (action) action.focus();
  }
  var API = { presentOptions: presentOptions, buildJobRequest: buildJobRequest, validateRecord: validateRecord,
    readRecords: readRecords, resolveFromField: resolveFromField, chooseKind: chooseKind, chooseQuality: chooseQuality,
    addSelected: addSelected, pause: pause, resume: resume, cancel: cancel, onOpen: onOpen, sourceChanged: sourceChanged,
    newSource: newSource, restoreRecord: restoreRecord, saveCopy: saveCopy, continueToTranscript: continueToTranscript };
  if (typeof window !== "undefined") { window.RemoteMediaAcquisition = API; window.addEventListener("pagehide", pause); }
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
