// W2-S4 · OPFS-хранилище импортированных медиа: media/<sha256>.<ext> (R15: данные пользователя,
// OPFS-first; имя = хэш содержимого → идемпотентный повтор-импорт). Dual-export: pure-часть
// (mediaFileName, sha256Hex) тестируется в Node; файловые операции — только браузер.
// НЕ пишет в audio_assets/sentence_audio (консьюмеры ждут серверные TTS-ассеты — gate-consumers).
(function () {
  "use strict";

  var DIR = "media";
  var EXT_BY_MIME = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/aac": "aac", "audio/mp4": "m4a",
    "audio/x-m4a": "m4a", "audio/flac": "flac", "audio/aiff": "aiff",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "video/3gpp": "3gp", "video/x-matroska": "mkv",
  };

  function mediaFileName(sha256, mimeType, originalName) {
    var ext = EXT_BY_MIME[String(mimeType || "").toLowerCase()];
    if (!ext) {
      var m = /\.([a-z0-9]{1,5})$/i.exec(String(originalName || ""));
      ext = m ? m[1].toLowerCase() : "bin";
    }
    return DIR + "/" + String(sha256) + "." + ext;
  }

  function cryptoObj() {
    if (typeof crypto !== "undefined" && crypto.subtle) return crypto;
    return require("node:crypto").webcrypto; // Node-тесты
  }
  async function sha256Hex(buf) {
    var digest = await cryptoObj().subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // A multi-gigabyte video cannot become one ArrayBuffer: hash it slice by slice with the same
  // incremental SHA-256 the stream store uses. Only a small file may fall back to one digest.
  async function sha256File(file, options) {
    var chunk = (options && options.chunkBytes) || 16 * 1024 * 1024;
    var size = Number(file && file.size) || 0;
    var runtime = typeof hashwasm !== "undefined" ? hashwasm : null;
    if (!runtime || typeof runtime.createSHA256 !== "function") {
      if (size > 512 * 1024 * 1024) throw new Error("HASH_RUNTIME_UNAVAILABLE");
      return sha256Hex(await file.arrayBuffer());
    }
    var hasher = await runtime.createSHA256();
    hasher.init();
    for (var offset = 0; offset < size; offset += chunk) {
      var part = await file.slice(offset, Math.min(size, offset + chunk)).arrayBuffer();
      hasher.update(part instanceof Uint8Array ? part : new Uint8Array(part));
    }
    return String(hasher.digest("hex")).toLowerCase();
  }

  function canWrite() {
    try { return typeof FileSystemFileHandle !== "undefined" && !!FileSystemFileHandle.prototype.createWritable; }
    catch (_) { return false; }
  }
  function baseName(fileName) { return String(fileName).replace(/^media\//, ""); }
  async function dirHandle(create) {
    var root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DIR, { create: !!create });
  }
  async function saveMedia(buf, fileName) {
    if (!canWrite()) return { ok: false, reason: "NO_CREATE_WRITABLE" };
    try {
      var dir = await dirHandle(true);
      var fh = await dir.getFileHandle(baseName(fileName), { create: true });
      var w = await fh.createWritable();
      await w.write(buf);
      await w.close();
      return { ok: true };
    } catch (e) { return { ok: false, reason: (e && e.name) || "WRITE_FAILED" }; }
  }
  async function readMedia(fileName) {
    try {
      var dir = await dirHandle(false);
      var fh = await dir.getFileHandle(baseName(fileName));
      return await fh.getFile();
    } catch (_) { return null; }
  }
  async function mediaExists(fileName) { return (await readMedia(fileName)) !== null; }
  async function deleteMedia(fileName) {
    try { var dir = await dirHandle(false); await dir.removeEntry(baseName(fileName)); return { ok: true, removed: true }; }
    catch (e) { if (e && e.name === 'NotFoundError') return { ok: true, removed: false }; return { ok: false, removed: false, reason: (e && e.name) || 'DELETE_FAILED' }; }
  }

  var API = { mediaFileName: mediaFileName, sha256Hex: sha256Hex, sha256File: sha256File, canWrite: canWrite,
              saveMedia: saveMedia, readMedia: readMedia, mediaExists: mediaExists, deleteMedia: deleteMedia };
  if (typeof window !== "undefined") window.MediaStore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
