// A finished recognition that has not become a material yet survives a page reload.
//
// Owner, 2026-10-18: a 68-minute local ASR lived only in the tab's memory until the build task
// was created, so a reload (or a crash) meant recognising the whole file again. The record keeps
// the recognition itself and a handle to the media file — not a copy of the media: a video can
// be gigabytes, and the file is still on the owner's disk. On resume the bytes are re-read and
// must match the recorded SHA-256; a different file is refused, never silently accepted.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.StudioImportResume = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var DB_NAME = "linguistpro-import-resume-v1";
  var STORE = "recognition";
  var SLOT = "last";
  var MAX_AGE_MS = 14 * 864e5;
  // Live objects that are either not cloneable or must come back from the file itself.
  var LIVE_KEYS = ["file", "originalFile", "sourceHandle", "preparedHandle", "buf"];

  function plain(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  // The handle that points at the bytes the recognition was made from: the prepared copy when
  // one replaced the original, otherwise the original the owner picked.
  function fileHandleOf(audio) {
    if (!audio) return null;
    var prepared = audio.originalFile && audio.file && audio.file !== audio.originalFile;
    return (prepared ? audio.preparedHandle : audio.sourceHandle) || null;
  }

  function snapshot(pending, audio, previewText, now) {
    if (!pending || pending.kind !== "audio" || !audio || !audio.parsed || !audio.sha256) return null;
    var copy = {};
    Object.keys(audio).forEach(function (key) { if (LIVE_KEYS.indexOf(key) < 0) copy[key] = audio[key]; });
    var file = audio.file || {};
    return {
      v: 1,
      savedAt: Number(now) || Date.now(),
      name: audio.name || file.name || "",
      sha256: audio.sha256,
      isVideo: !!audio.isVideo,
      size: Number(file.size) || null,
      durationSec: audio.durationSec == null ? null : Number(audio.durationSec),
      pending: plain(pending),
      previewText: String(previewText == null ? pending.text || "" : previewText),
      audio: plain(copy),
      fileHandle: fileHandleOf(audio),
    };
  }

  function usable(record, now) {
    if (!record || record.v !== 1 || !record.sha256 || !record.pending || !record.audio) return false;
    return (Number(now) || Date.now()) - Number(record.savedAt || 0) <= MAX_AGE_MS;
  }

  // Rebuilds the in-memory import state from a record and the re-read, verified file.
  function restoreAudio(record, file, handle, buf) {
    var audio = plain(record.audio);
    audio.file = file;
    audio.originalFile = file;
    audio.sourceHandle = handle || null;
    audio.preparedHandle = null;
    audio.buf = buf || null;
    audio.sha256 = record.sha256;
    return audio;
  }

  // Video is hashed in slices without a buffer; audio keeps its buffer (the sliced transports
  // cut chunks out of it), exactly as the import does when it first locks the identity.
  async function verifyFile(record, file, store) {
    if (!record || !file || !store) return { ok: false, reason: "NO_FILE" };
    if (record.size != null && Number(file.size) !== Number(record.size)) return { ok: false, reason: "SIZE_MISMATCH" };
    var buf = record.isVideo ? null : await file.arrayBuffer();
    var sha = record.isVideo ? await store.sha256File(file) : await store.sha256Hex(buf);
    if (sha !== record.sha256) return { ok: false, reason: "SHA_MISMATCH" };
    return { ok: true, buf: buf };
  }

  function openDb(indexedDB) {
    return new Promise(function (resolve) {
      try {
        var request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function () { request.result.createObjectStore(STORE); };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
  }

  function run(indexedDB, mode, body) {
    return openDb(indexedDB).then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, mode), store = tx.objectStore(STORE), out = { value: null };
          body(store, out);
          tx.oncomplete = function () { db.close(); resolve(out.value); };
          tx.onerror = tx.onabort = function () { db.close(); resolve(null); };
        } catch (_) { try { db.close(); } catch (__) {} resolve(null); }
      });
    });
  }

  function createStore(indexedDB) {
    var idb = indexedDB || (typeof window !== "undefined" ? window.indexedDB : null);
    return {
      save: function (record) {
        if (!idb || !record) return Promise.resolve(false);
        return run(idb, "readwrite", function (store, out) { store.put(record, SLOT); out.value = true; })
          .then(function (v) { return v === true; })
          // A handle that cannot be cloned must not cost the recognition itself.
          .then(function (ok) {
            if (ok || !record.fileHandle) return ok;
            var bare = Object.assign({}, record, { fileHandle: null });
            return run(idb, "readwrite", function (store, out) { store.put(bare, SLOT); out.value = true; })
              .then(function (v) { return v === true; });
          });
      },
      load: function () {
        if (!idb) return Promise.resolve(null);
        return run(idb, "readonly", function (store, out) {
          var request = store.get(SLOT);
          request.onsuccess = function () { out.value = request.result || null; };
        });
      },
      clear: function () {
        if (!idb) return Promise.resolve(false);
        return run(idb, "readwrite", function (store, out) { store.delete(SLOT); out.value = true; });
      },
    };
  }

  return { snapshot: snapshot, usable: usable, restoreAudio: restoreAudio, verifyFile: verifyFile,
           fileHandleOf: fileHandleOf, createStore: createStore, MAX_AGE_MS: MAX_AGE_MS };
});
