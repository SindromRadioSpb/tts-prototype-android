// RMA-3 · premium URL -> resolved choices -> isolated worker -> verified OPFS handoff.
(function () {
  "use strict";

  var S = { capability: null, resolved: null, selectedId: null, job: null, acquired: null, abort: null };
  function failure(code) { var error = new Error(code); error.code = code; return error; }
  function el(id) { return typeof document === "undefined" ? null : document.getElementById(id); }
  function tr(key, fallback, vars) {
    var value = key;
    try { value = typeof t === "function" ? t(key) : key; } catch (_) {}
    if (!value || value === key) value = fallback || key;
    Object.keys(vars || {}).forEach(function (name) { value = String(value).split("{" + name + "}").join(String(vars[name])); });
    return String(value);
  }
  function humanBytes(value) {
    if (value == null || !Number.isFinite(Number(value))) return tr("studio.remoteMedia.sizeUnknown", "size checked during transfer");
    var mib = Number(value) / (1024 * 1024);
    return (mib >= 100 ? Math.round(mib) : mib.toFixed(1)) + " MiB";
  }
  function clock(seconds) {
    var total = Math.max(0, Math.round(Number(seconds) || 0)), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") : m + ":" + String(s).padStart(2, "0");
  }
  function presentOptions(options) {
    var complete = (options || []).filter(function (item) { return item.kind === "video" && item.has_audio === true; });
    var alternatives = (options || []).filter(function (item) { return item.kind === "audio" || item.kind === "captions"; });
    complete.sort(function (a, b) { return Number(b.recommended) - Number(a.recommended) || Number(b.quality) - Number(a.quality); });
    var primary = complete.slice();
    var more = [];
    if (complete.length > 2) {
      var recommended = complete.find(function (item) { return item.recommended; }) || complete[0];
      var compact = complete.slice().sort(function (a, b) { return Number(a.quality) - Number(b.quality); })[0];
      primary = [recommended];
      if (compact && compact.id !== recommended.id) primary.push(compact);
      more = complete.filter(function (item) { return !primary.some(function (row) { return row.id === item.id; }); });
    }
    if (!primary.length) {
      primary = alternatives.slice(0, 2);
      more = alternatives.slice(2);
    } else {
      more = more.concat(alternatives);
    }
    return { primary: primary, more: more };
  }
  function buildJobRequest(input) {
    if (!input || !input.rightsConfirmed) throw failure("RIGHTS_REQUIRED");
    if (!input.planToken || !input.optionId) throw failure("PLAN_SELECTION_REQUIRED");
    return { plan_token: input.planToken, option_id: input.optionId,
      rights_basis: { kind: "rights_holder_permission" } };
  }
  function optionLabel(item) {
    if (item.kind === "video") return item.quality + "p MP4 · " + tr("studio.remoteMedia.videoSound", "video + sound") + " · " + humanBytes(item.size_bytes);
    if (item.kind === "audio") return "M4A · " + tr("studio.remoteMedia.audioOnly", "audio only") + " · " + humanBytes(item.size_bytes);
    return tr("studio.remoteMedia.hebrewCaptions", "Hebrew captions") + " · " +
      tr(item.source_kind === "manual" ? "studio.remoteMedia.captionsManual" : "studio.remoteMedia.captionsAuto",
         item.source_kind === "manual" ? "manual" : "automatic") + " · VTT";
  }
  function setStatus(key, fallback, danger) {
    var node = el("v3RemoteMediaStatus"); if (!node) return;
    node.textContent = key ? tr(key, fallback) : ""; node.hidden = !key; node.dataset.danger = danger ? "true" : "false";
  }
  function setRail(phase) {
    var rail = el("v3RemoteMediaRail"); if (!rail) return;
    var order = ["source", "prepare", "device", "verify", "ready"], current = Math.max(0, order.indexOf(phase));
    rail.querySelectorAll("[data-rma-phase]").forEach(function (node, index) {
      node.dataset.state = index < current ? "done" : (index === current ? "current" : "waiting");
    });
  }
  function setBusy(value) {
    var resolve = el("v3ImportVideoBtn"), add = el("v3RemoteMediaAdd"), cancel = el("v3RemoteMediaCancel");
    if (resolve) resolve.disabled = !!value;
    if (add) add.disabled = !!value;
    if (cancel) cancel.hidden = !value;
  }
  async function jsonResponse(response) {
    var body = {}; try { body = await response.json(); } catch (_) {}
    if (!response.ok || !body.ok) throw failure(body.error_code || body.error || ("HTTP_" + response.status));
    return body;
  }
  async function mintCapability() {
    var csrf = ""; try { csrf = localStorage.getItem("cloud.csrf") || ""; } catch (_) {}
    var response = await fetch("/api/media-acquisition/capability", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf }, body: "{}", cache: "no-store" });
    S.capability = await jsonResponse(response);
    return S.capability;
  }
  async function workerFetch(path, options, retry) {
    var capability = S.capability;
    if (!capability || Number(capability.expires_at || 0) <= Math.floor(Date.now() / 1000) + 5) capability = await mintCapability();
    options = Object.assign({}, options || {}); options.headers = Object.assign({}, options.headers || {}, { Authorization: "Bearer " + capability.capability });
    var response = await fetch(capability.worker_url + path, options);
    if (response.status === 401 && retry !== false) { await mintCapability(); return workerFetch(path, options, false); }
    return response;
  }
  function createOptionRow(item) {
    var label = document.createElement("label"); label.className = "v3-rma-option"; label.dataset.recommended = item.recommended ? "true" : "false";
    var input = document.createElement("input"); input.type = "radio"; input.name = "v3RemoteMediaOption"; input.value = item.id;
    input.checked = item.id === S.selectedId; input.addEventListener("change", function () { S.selectedId = item.id; updatePrimaryLabel(); });
    var copy = document.createElement("span"), title = document.createElement("strong"), note = document.createElement("small");
    title.textContent = optionLabel(item); copy.appendChild(title);
    note.textContent = item.recommended ? tr("studio.remoteMedia.recommended", "Recommended for Studio")
      : (item.kind === "video" ? tr("studio.remoteMedia.complete", "complete compatible copy") : tr("studio.remoteMedia.separateChoice", "separate import choice"));
    copy.appendChild(note); label.append(input, copy); return label;
  }
  function updatePrimaryLabel() {
    var button = el("v3RemoteMediaAdd"), selected = S.resolved && S.resolved.options.find(function (item) { return item.id === S.selectedId; });
    if (!button || !selected) return;
    button.textContent = selected.kind === "captions"
      ? tr("studio.remoteMedia.addCaptions", "Add captions to Studio")
      : tr("studio.remoteMedia.addSelected", "Add to Studio · {choice}", { choice: selected.kind === "video" ? selected.quality + "p" : "M4A" });
  }
  function renderResolved() {
    var card = el("v3RemoteMediaCard"), primary = el("v3RemoteMediaPrimary"), more = el("v3RemoteMediaMoreOptions");
    if (!card || !S.resolved) return;
    card.hidden = false; el("v3RemoteMediaTitle").textContent = S.resolved.source.title;
    el("v3RemoteMediaMeta").textContent = clock(S.resolved.source.duration_seconds) + " · YouTube";
    var matrix = presentOptions(S.resolved.options), recommended = S.resolved.options.find(function (item) { return item.recommended; });
    S.selectedId = recommended ? recommended.id : (matrix.primary[0] || matrix.more[0]).id;
    primary.replaceChildren(); matrix.primary.forEach(function (item) { primary.appendChild(createOptionRow(item)); });
    more.replaceChildren(); matrix.more.forEach(function (item) { more.appendChild(createOptionRow(item)); });
    var details = el("v3RemoteMediaMore"); if (details) details.hidden = !matrix.more.length;
    updatePrimaryLabel(); setRail("source"); setStatus(null);
  }
  async function resolveFromField() {
    var field = el("v3ImportVideoUrl"), url = String(field && field.value || "").trim();
    if (!url) return setStatus("studio.import.errBadUrl", "Enter a video link", true);
    setBusy(true); setRail("source"); setStatus("studio.remoteMedia.resolving", "Checking available formats…");
    try {
      var response = await workerFetch("/v1/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url }) });
      S.resolved = await jsonResponse(response); renderResolved();
    } catch (error) { setStatus("studio.remoteMedia.error." + String(error.code || "").toLowerCase(), tr("studio.remoteMedia.resolveFailed", "Could not prepare this link. Check access and try again."), true); }
    finally { setBusy(false); }
  }
  async function pollJob(jobId) {
    while (true) {
      if (S.abort && S.abort.signal.aborted) throw failure("STREAM_ABORTED");
      var response = await workerFetch("/v1/jobs/" + encodeURIComponent(jobId), { cache: "no-store" });
      var job = await jsonResponse(response); S.job = job;
      var progress = el("v3RemoteMediaProgress"), status = el("v3RemoteMediaProgressText");
      if (progress) { progress.hidden = false; progress.max = job.bytes_total || 1; progress.value = job.bytes_done || 0; }
      if (status) status.textContent = tr("studio.remoteMedia.phase." + String(job.phase).toLowerCase(), job.phase) +
        (job.bytes_done ? " · " + humanBytes(job.bytes_done) : "");
      if (job.state === "READY") return job;
      if (["FAILED", "CANCELED", "EXPIRED"].includes(job.state)) throw failure(job.error_code || ("JOB_" + job.state));
      await new Promise(function (resolve) { setTimeout(resolve, 900); });
    }
  }
  async function addSelected() {
    var rights = el("v3RemoteMediaRights"), selected = S.resolved && S.resolved.options.find(function (item) { return item.id === S.selectedId; });
    if (!selected) return;
    var request;
    try { request = buildJobRequest({ planToken: S.resolved.plan_token, optionId: selected.id, rightsConfirmed: rights && rights.checked }); }
    catch (_) { return setStatus("studio.remoteMedia.rightsRequired", "Confirm the rights-holder permission before acquisition.", true); }
    setBusy(true); S.abort = new AbortController(); setRail("prepare"); setStatus("studio.remoteMedia.preparing", "Preparing the selected copy…");
    try {
      if (window.MediaStreamStore && window.MediaStreamStore.checkCapacity) await window.MediaStreamStore.checkCapacity(selected.size_bytes);
      var created = await jsonResponse(await workerFetch("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }));
      S.job = created; var ready = await pollJob(created.job_id); setRail("device");
      var stream = await workerFetch("/v1/jobs/" + encodeURIComponent(created.job_id) + "/stream", { signal: S.abort.signal, cache: "no-store" });
      if (!stream.ok) await jsonResponse(stream);
      var opfsPath = window.MediaStore.mediaFileName(ready.output_sha256, ready.mime_type, ready.download_name);
      var stored = await window.MediaStreamStore.streamToOpfs({ response: stream, fileName: opfsPath,
        expectedSha256: ready.output_sha256, expectedSize: ready.output_size_bytes, signal: S.abort.signal,
        onProgress: function (value) {
          setRail("device"); var progress = el("v3RemoteMediaProgress"); if (progress) { progress.max = value.total || 1; progress.value = value.bytes; }
          var text = el("v3RemoteMediaProgressText"); if (text) text.textContent = tr("studio.remoteMedia.writingDevice", "Writing to this device") + " · " + humanBytes(value.bytes);
        } });
      setRail("verify");
      var receipt = await jsonResponse(await workerFetch("/v1/jobs/" + encodeURIComponent(created.job_id) + "/device-receipt",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha256: stored.sha256, size_bytes: stored.sizeBytes }) }));
      S.acquired = { stored: stored, receipt: receipt, option: selected, source: S.resolved.source, downloadName: ready.download_name };
      var accepted;
      if (selected.kind === "captions" && window.StudioImport && window.StudioImport.acceptRemoteCaptions) {
        accepted = await window.StudioImport.acceptRemoteCaptions(S.acquired);
      } else if (window.StudioImport && window.StudioImport.acceptRemoteAcquisition) {
        accepted = await window.StudioImport.acceptRemoteAcquisition(S.acquired);
      }
      if (!accepted || accepted.ok !== true) throw failure("STUDIO_ATTACH_FAILED");
      setRail("ready");
      setStatus(receipt.deletion_receipt && receipt.deletion_receipt.deleted === false
        ? "studio.remoteMedia.addedCleanupPending" : "studio.remoteMedia.added",
        receipt.deletion_receipt && receipt.deletion_receipt.deleted === false
          ? "Added to Studio. Worker cleanup will retry automatically." : "Added to Studio on this device");
      var copy = el("v3RemoteMediaSaveCopy"), next = el("v3RemoteMediaContinue"); if (copy) copy.hidden = false; if (next) next.hidden = selected.kind === "captions";
    } catch (error) {
      if (S.acquired && S.acquired.stored) {
        var savedCopy = el("v3RemoteMediaSaveCopy"); if (savedCopy) savedCopy.hidden = false;
        setStatus("studio.remoteMedia.savedNotAttached", "The verified file is on this device, but Studio could not attach it. You can still save a separate copy.", true);
      } else {
        setStatus("studio.remoteMedia.error." + String(error.code || "").toLowerCase(), tr("studio.remoteMedia.failed", "Acquisition stopped. No complete-looking file was added."), true);
      }
    } finally { S.abort = null; setBusy(false); }
  }
  async function cancel() {
    if (S.abort) S.abort.abort();
    if (S.job && S.job.job_id) { try { await workerFetch("/v1/jobs/" + encodeURIComponent(S.job.job_id), { method: "DELETE" }); } catch (_) {} }
    setBusy(false); setStatus("studio.remoteMedia.cancelled", "Acquisition cancelled; partial data removed.");
  }
  async function saveCopy() {
    if (!S.acquired) return;
    try {
      var saved = await window.MediaStreamStore.saveCopyFromOpfs(S.acquired.stored.opfsPath, S.acquired.downloadName);
      S.acquired.receipt.owner_saved_copy = true; S.acquired.receipt.owner_saved_copy_receipt = saved;
      if (window.StudioImport && window.StudioImport.recordRemoteSavedCopy) window.StudioImport.recordRemoteSavedCopy(saved);
      setStatus("studio.remoteMedia.copySaved", "A separate device copy was requested.");
    } catch (error) { setStatus("studio.remoteMedia.copyFailed", "Could not open the device save action.", true); }
  }
  function continueToTranscript() {
    if (window.StudioImport && window.StudioImport.switchTab) window.StudioImport.switchTab("file");
    var action = el("v3ImportAudioGo"); if (action) action.focus();
  }
  function reset() {
    S.resolved = null; S.selectedId = null; S.job = null; S.acquired = null;
    var card = el("v3RemoteMediaCard"); if (card) card.hidden = true;
    var copy = el("v3RemoteMediaSaveCopy"), next = el("v3RemoteMediaContinue"); if (copy) copy.hidden = true; if (next) next.hidden = true;
    setStatus(null); setRail("source");
  }

  var API = { presentOptions: presentOptions, buildJobRequest: buildJobRequest, resolveFromField: resolveFromField,
    addSelected: addSelected, cancel: cancel, saveCopy: saveCopy, continueToTranscript: continueToTranscript, reset: reset };
  if (typeof window !== "undefined") window.RemoteMediaAcquisition = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
