// Honest resumable journal for long Studio table jobs. Pure core + one bounded localStorage slot.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TableJob = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var STATES = ["cache", "generate", "retry", "repair", "split", "done", "stopped"];
  var STORAGE_KEY = "studio_table_job_v1";

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
      plan: plan, completed: [], mediaSha: /^[a-f0-9]{64}$/i.test(String(input.mediaSha || "")) ? String(input.mediaSha).toLowerCase() : null,
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
  function resume(journal, input) {
    if (!journal || journal.schema !== "studio-table-job-v1" || journal.signature !== signature(input)) return null;
    var completed = Array.isArray(journal.completed) ? journal.completed : [], rows = [];
    for (var i = 0; i < completed.length; i++) {
      if (!completed[i] || completed[i].index !== i || !Array.isArray(completed[i].rows)) return null;
      rows.push.apply(rows, completed[i].rows);
    }
    return { rows: rows, nextChunk: completed.length, mediaSha: journal.mediaSha || null, journal: journal };
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
  function load(storage) { try { return JSON.parse((storage || localStorage).getItem(STORAGE_KEY) || "null"); } catch (_) { return null; } }
  function store(journal, storage) { try { (storage || localStorage).setItem(STORAGE_KEY, JSON.stringify(journal)); return true; } catch (_) { return false; } }
  function clear(storage) { try { (storage || localStorage).removeItem(STORAGE_KEY); } catch (_) {} }
  return { STATES: STATES, STORAGE_KEY: STORAGE_KEY, fingerprint: fingerprint, create: create,
    acceptChunk: acceptChunk, resume: resume, telemetry: telemetry, load: load, store: store, clear: clear };
});
