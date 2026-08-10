// RMA-2 · network response -> incremental SHA -> OPFS partial -> verified promotion.
// Never calls response.arrayBuffer(), Blob(responseBytes) or URL.createObjectURL(responseBytes).
(function () {
  "use strict";

  var DIR = "media";
  var DEFAULT_MAX_BYTES = 300 * 1024 * 1024;
  var QUOTA_MARGIN_BYTES = 32 * 1024 * 1024;

  function failure(code) { var error = new Error(code); error.code = code; return error; }
  function baseName(value) {
    var name = String(value || "").replace(/^media\//, "");
    if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") throw failure("FILE_NAME_INVALID");
    return name;
  }
  function header(response, name) { return String(response && response.headers && response.headers.get(name) || "").trim(); }
  function finiteSize(value) {
    var number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }
  async function defaultHasherFactory() {
    if (typeof hashwasm === "undefined" || typeof hashwasm.createSHA256 !== "function") throw failure("HASH_RUNTIME_UNAVAILABLE");
    return hashwasm.createSHA256();
  }
  async function defaultRoot() {
    if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.getDirectory !== "function") {
      throw failure("OPFS_UNAVAILABLE");
    }
    return navigator.storage.getDirectory();
  }
  async function ensureCapacity(expectedSize, storageEstimate) {
    if (expectedSize == null) return;
    var estimate = storageEstimate;
    if (!estimate && typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      estimate = await navigator.storage.estimate();
    }
    if (!estimate || !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return;
    // Cross-browser promotion copies partial -> final when FileSystemHandle.move is absent.
    var required = expectedSize * 2 + QUOTA_MARGIN_BYTES;
    if (estimate.quota - estimate.usage < required) throw failure("OPFS_QUOTA_LOW");
  }
  async function checkCapacity(expectedSize) {
    var size = finiteSize(expectedSize);
    if (size != null && size > DEFAULT_MAX_BYTES) throw failure("SIZE_LIMIT");
    await ensureCapacity(size, null);
    return { ok: true, expectedSize: size };
  }
  async function removeQuietly(dir, name) {
    try { await dir.removeEntry(name); } catch (error) { if (!error || error.name !== "NotFoundError") return false; }
    return true;
  }
  async function copyFileToHandle(file, handle, signal) {
    var reader = file.stream().getReader(), writable = await handle.createWritable();
    try {
      while (true) {
        if (signal && signal.aborted) throw failure("STREAM_ABORTED");
        var next = await reader.read();
        if (next.done) break;
        await writable.write(next.value);
      }
      await writable.close();
    } catch (error) {
      try { if (writable.abort) await writable.abort(); else await writable.close(); } catch (_) {}
      try { await reader.cancel(error); } catch (_) {}
      throw error;
    }
  }

  async function streamToOpfs(options) {
    options = options || {};
    var response = options.response;
    if (!response || response.ok === false || !response.body || typeof response.body.getReader !== "function") throw failure("STREAM_RESPONSE_INVALID");
    var finalName = baseName(options.fileName);
    var maxBytes = finiteSize(options.maxBytes);
    if (maxBytes == null) maxBytes = DEFAULT_MAX_BYTES;
    var expectedSize = finiteSize(options.expectedSize);
    var responseSize = finiteSize(header(response, "content-length"));
    if (expectedSize != null && responseSize != null && expectedSize !== responseSize) throw failure("RESPONSE_SIZE_MISMATCH");
    var declaredSize = expectedSize != null ? expectedSize : responseSize;
    if (declaredSize != null && declaredSize > maxBytes) throw failure("SIZE_LIMIT");
    var expectedSha = String(options.expectedSha256 || header(response, "x-lp-media-sha256") || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedSha)) throw failure("EXPECTED_HASH_INVALID");
    await ensureCapacity(declaredSize, options.storageEstimate);

    var root = options.root || await defaultRoot();
    var dir = await root.getDirectoryHandle(DIR, { create: true });
    var partialName = "." + finalName + "." + Math.random().toString(36).slice(2) + ".partial";
    var partial = await dir.getFileHandle(partialName, { create: true });
    var writable = await partial.createWritable();
    var reader = response.body.getReader();
    var hasher = await (options.hasherFactory || defaultHasherFactory)();
    if (hasher.init) hasher.init();
    var total = 0;
    try {
      while (true) {
        if (options.signal && options.signal.aborted) throw failure("STREAM_ABORTED");
        var next = await reader.read();
        if (next.done) break;
        var chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
        total += chunk.byteLength;
        if (total > maxBytes) throw failure("SIZE_LIMIT");
        hasher.update(chunk);
        await writable.write(chunk);
        if (typeof options.onProgress === "function") options.onProgress({ bytes: total, total: declaredSize });
      }
      await writable.close();
      writable = null;
      var actualSha = String(hasher.digest("hex")).toLowerCase();
      if (total !== (declaredSize == null ? total : declaredSize)) throw failure("SIZE_MISMATCH");
      if (actualSha !== expectedSha) throw failure("HASH_MISMATCH");

      // `move()` is not yet universal on Safari. When absent, createWritable.close() gives an
      // atomic final-file commit; the verified partial is removed only after that commit.
      if (typeof partial.move === "function") {
        try { await partial.move(finalName); }
        catch (_) {
          var finalFallback = await dir.getFileHandle(finalName, { create: true });
          await copyFileToHandle(await partial.getFile(), finalFallback, options.signal);
          await removeQuietly(dir, partialName);
        }
      } else {
        var finalHandle = await dir.getFileHandle(finalName, { create: true });
        await copyFileToHandle(await partial.getFile(), finalHandle, options.signal);
        await removeQuietly(dir, partialName);
      }
      return { ok: true, opfsPath: DIR + "/" + finalName, sha256: actualSha, sizeBytes: total,
        mimeType: header(response, "content-type") || options.mimeType || "application/octet-stream" };
    } catch (error) {
      try { if (writable && writable.abort) await writable.abort(); } catch (_) {}
      try { await reader.cancel(error); } catch (_) {}
      await removeQuietly(dir, partialName);
      throw error;
    }
  }

  async function saveCopyFromOpfs(opfsPath, suggestedName) {
    if (typeof window === "undefined" || !window.MediaStore) throw failure("MEDIA_STORE_UNAVAILABLE");
    var file = await window.MediaStore.readMedia(opfsPath);
    if (!file) throw failure("MEDIA_FILE_MISSING");
    var name = baseName(suggestedName || opfsPath);
    if (typeof window.showSaveFilePicker === "function") {
      var handle = await window.showSaveFilePicker({ suggestedName: name });
      await copyFileToHandle(file, handle, null);
      return { owner_saved_copy: true, destination: "file_picker", at: new Date().toISOString() };
    }
    var shareFile = file.name === name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      await navigator.share({ files: [shareFile], title: name });
      return { owner_saved_copy: true, destination: "share_sheet", at: new Date().toISOString() };
    }
    var url = URL.createObjectURL(file), anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.hidden = true; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60_000);
    return { owner_saved_copy: true, destination: "browser_download", at: new Date().toISOString() };
  }

  var API = { streamToOpfs: streamToOpfs, saveCopyFromOpfs: saveCopyFromOpfs, checkCapacity: checkCapacity,
    DEFAULT_MAX_BYTES: DEFAULT_MAX_BYTES, QUOTA_MARGIN_BYTES: QUOTA_MARGIN_BYTES };
  if (typeof window !== "undefined") window.MediaStreamStore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
