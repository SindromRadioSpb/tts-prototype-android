// Honest resumable journal for long Studio table jobs. Pure core + one bounded localStorage slot.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TableJob = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var STATES = ["cache", "generate", "retry", "repair", "split", "done", "stopped"];
  var STORAGE_KEY = "studio_table_job_v1";
  var OPFS_DIRECTORY = "recovery", OPFS_FILE = "studio-table-job-v1.json";

  function fingerprint(value) {
    var s = String(value == null ? "" : value), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, "0") + ":" + s.length;
  }
  function signature(input) {
    var segments = Array.isArray(input.segments) ? input.segments : [];
    return fingerprint(JSON.stringify({ text: String(input.text || ""), provider: String(input.provider || ""),
      chunkSize: Number(input.chunkSize) || 0, segments: segments.map(function (s) { return [s.i, String(s.text || "")]; }) }));
  }
  function create(input) {
    var segments = Array.isArray(input.segments) ? input.segments : [];
    var size = Math.max(1, Number(input.chunkSize) || 1), plan = [];
    for (var base = 0, index = 0; base < segments.length; base += size, index++) {
      plan.push({ index: index, base: base, count: Math.min(size, segments.length - base) });
    }
    return { schema: "studio-table-job-v1", signature: signature(input), provider: String(input.provider || ""),
      plan: plan, completed: [], repairs: [], mediaSha: /^[a-f0-9]{64}$/i.test(String(input.mediaSha || "")) ? String(input.mediaSha).toLowerCase() : null,
      startedAt: Number(input.now) || Date.now(), updatedAt: Number(input.now) || Date.now(), state: "stopped" };
  }
  function acceptChunk(journal, input) {
    var j = JSON.parse(JSON.stringify(journal || {}));
    var index = Number(input.index), expected = Array.isArray(j.completed) ? j.completed.length : 0;
    if (!Number.isInteger(index) || index !== expected || !j.plan || !j.plan[index]) throw new Error("NON_CONTIGUOUS_CHUNK");
    if (!Array.isArray(input.rows)) throw new Error("ROWS_REQUIRED");
    j.completed.push({ index: index, rows: input.rows, meta: input.meta || {} });
    j.updatedAt = Number(input.now) || Date.now();
    return j;
  }
  function acceptRepair(journal, input) {
    var j = JSON.parse(JSON.stringify(journal || {}));
    var indexes = Array.isArray(input.indexes) ? input.indexes.slice() : [];
    if (!indexes.length || indexes.some(function (index) { return !Number.isInteger(index) || index < 0; })) throw new Error("REPAIR_INDEXES_REQUIRED");
    var repairs = Array.isArray(j.repairs) ? j.repairs : [];
    var seen = new Set(repairs.flatMap(function (entry) { return entry.indexes || []; }));
    if (indexes.some(function (index) { return seen.has(index); })) throw new Error("REPAIR_INDEX_ALREADY_RECORDED");
    if (!Array.isArray(input.rows)) throw new Error("ROWS_REQUIRED");
    repairs.push({ indexes: indexes, rows: input.rows, meta: input.meta || {} });
    j.repairs = repairs; j.updatedAt = Number(input.now) || Date.now();
    return j;
  }
  function resume(journal, input) {
    if (!journal || journal.schema !== "studio-table-job-v1" || journal.signature !== signature(input)) return null;
    var completed = Array.isArray(journal.completed) ? journal.completed : [], rows = [];
    for (var i = 0; i < completed.length; i++) {
      if (!completed[i] || completed[i].index !== i || !Array.isArray(completed[i].rows)) return null;
      rows.push.apply(rows, completed[i].rows);
    }
    var chunkRows = rows.slice(), repairRows = [], repairs = Array.isArray(journal.repairs) ? journal.repairs : [];
    for (var r = 0; r < repairs.length; r++) {
      if (!repairs[r] || !Array.isArray(repairs[r].indexes) || !repairs[r].indexes.length || !Array.isArray(repairs[r].rows)) return null;
      repairRows.push.apply(repairRows, repairs[r].rows); rows.push.apply(rows, repairs[r].rows);
    }
    return { rows: rows, chunkRows: chunkRows, repairRows: repairRows,
      nextChunk: completed.length, repairs: repairs.length,
      mediaSha: journal.mediaSha || null, journal: journal };
  }
  function telemetry(input) {
    var state = String(input.state || "stopped");
    if (STATES.indexOf(state) < 0) throw new Error("UNKNOWN_STATE");
    return { state: state, chunk: Number(input.chunk) || 0, chunks: Number(input.chunks) || 0,
      attempt: Number(input.attempt) || 0, attempts: Number(input.attempts) || 0,
      readyRows: Number(input.readyRows) || 0, totalRows: Number(input.totalRows) || 0,
      elapsedSec: Math.max(0, Math.floor(((Number(input.now) || Date.now()) - (Number(input.startedAt) || Date.now())) / 1000)),
      nextAction: String(input.nextAction || "") };
  }
  function markState(journal, state, now) {
    if (STATES.indexOf(state) < 0) throw new Error("UNKNOWN_STATE");
    var j = JSON.parse(JSON.stringify(journal || {})); j.state = state;
    j.updatedAt = Number(now) || Date.now(); return j;
  }
  function load(storage) { try { return JSON.parse((storage || localStorage).getItem(STORAGE_KEY) || "null"); } catch (_) { return null; } }
  function store(journal, storage) { try { (storage || localStorage).setItem(STORAGE_KEY, JSON.stringify(journal)); return true; } catch (_) { return false; } }
  function clear(storage) { try { (storage || localStorage).removeItem(STORAGE_KEY); } catch (_) {} }
  async function opfsRoot() {
    if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.getDirectory !== "function") return null;
    return navigator.storage.getDirectory();
  }
  async function loadDurable(storage) {
    try {
      var root = await opfsRoot();
      if (root) {
        var dir = await root.getDirectoryHandle(OPFS_DIRECTORY), handle = await dir.getFileHandle(OPFS_FILE);
        return JSON.parse(await (await handle.getFile()).text());
      }
    } catch (_) {}
    return load(storage);
  }
  async function storeDurable(journal, storage) {
    try {
      var root = await opfsRoot();
      if (root) {
        var dir = await root.getDirectoryHandle(OPFS_DIRECTORY, { create: true });
        var handle = await dir.getFileHandle(OPFS_FILE, { create: true });
        var writer = await handle.createWritable(); await writer.write(JSON.stringify(journal)); await writer.close();
        try { (storage || localStorage).removeItem(STORAGE_KEY); } catch (_) {}
        return { ok: true, backend: "opfs", file: OPFS_DIRECTORY + "/" + OPFS_FILE };
      }
    } catch (_) {}
    return { ok: store(journal, storage), backend: "localStorage", file: null };
  }
  async function clearDurable(storage) {
    clear(storage);
    try {
      var root = await opfsRoot(); if (!root) return;
      var dir = await root.getDirectoryHandle(OPFS_DIRECTORY); await dir.removeEntry(OPFS_FILE);
    } catch (_) {}
  }
  return { STATES: STATES, STORAGE_KEY: STORAGE_KEY, fingerprint: fingerprint, create: create,
    acceptChunk: acceptChunk, acceptRepair: acceptRepair, resume: resume, telemetry: telemetry,
    markState: markState, load: load, store: store, clear: clear,
    loadDurable: loadDurable, storeDurable: storeDurable, clearDurable: clearDurable };
});
