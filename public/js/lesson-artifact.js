/* Wave 2 LB0 typed artifact + storage boundary. The session adapter can later
 * be replaced by an M1 durable adapter without changing UI artifact semantics. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.LessonArtifact = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var KEY = "linguistpro.lesson.lb0.v1";
  var SCHEMA_VERSION = 2;
  var POLICY_VERSION = "lesson-builder-lb1-v2";
  var MAX_SECTIONS = 7, MAX_EXERCISES = 7;

  function str(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
  function validSourceRefs(refs) {
    if (!Array.isArray(refs) || refs.length < 1 || refs.length > 3) return false;
    var ids = new Set();
    return refs.every(function (r) {
      if (!r || (r.kind !== "personal" && r.kind !== "corpus") || !str(r.id, 40) || !str(r.text_key, 80)) return false;
      if (r.kind === "corpus" && !str(r.work_id, 16)) return false;
      if (ids.has(r.id)) return false; ids.add(r.id);
      return Number.isInteger(Number(r.start_order_index)) && Number(r.start_order_index) >= 0 &&
        Number.isInteger(Number(r.row_count)) && Number(r.row_count) >= 1 && Number(r.row_count) <= 2000;
    });
  }
  function validate(draft) {
    var supported = draft && ((draft.schemaVersion === SCHEMA_VERSION && draft.policyVersion === POLICY_VERSION) ||
      (draft.schemaVersion === 1 && draft.policyVersion === "lesson-builder-lb0-v1"));
    if (!supported ||
        !str(draft.id, 80) || !["draft", "active", "discarded"].includes(draft.status) || !validSourceRefs(draft.sourceRefs)) return null;
    var expires = Date.parse(draft.expiresAt), created = Date.parse(draft.createdAt);
    if (!Number.isFinite(expires) || !Number.isFinite(created) || expires <= created) return null;
    var ids = new Set(draft.sourceRefs.map(function (r) { return r.id; }));
    var anchors = new Set();
    (Array.isArray(draft.sourceMap) ? draft.sourceMap : []).forEach(function (s) {
      (Array.isArray(s && s.anchor_windows) ? s.anchor_windows : []).forEach(function (a) { if (a && a.id) anchors.add(String(a.id)); });
    });
    var sections = (Array.isArray(draft.sections) ? draft.sections : []).slice(0, MAX_SECTIONS).map(function (s) {
      return { title: str(s && s.title, 120), body: str(s && s.body, 1200),
        source_ids: Array.from(new Set(Array.isArray(s && s.source_ids) ? s.source_ids.map(String) : [])),
        anchor_ids: Array.from(new Set(Array.isArray(s && s.anchor_ids) ? s.anchor_ids.map(String) : [])) };
    }).filter(function (s) { return s.title && s.body && s.source_ids.length && s.source_ids.every(function (id) { return ids.has(id); }) &&
      (!anchors.size || (s.anchor_ids.length && s.anchor_ids.every(function (id) { return anchors.has(id); }))); });
    var exercises = (Array.isArray(draft.exercises) ? draft.exercises : []).slice(0, MAX_EXERCISES).map(function (e) {
      return { type: str(e && e.type, 40), purpose: str(e && e.purpose, 300), instruction: str(e && e.instruction, 600),
        source_ids: Array.from(new Set(Array.isArray(e && e.source_ids) ? e.source_ids.map(String) : [])),
        anchor_ids: Array.from(new Set(Array.isArray(e && e.anchor_ids) ? e.anchor_ids.map(String) : [])),
        expected_answer: str(e && e.expected_answer, 1200) || null,
        hints: (Array.isArray(e && e.hints) ? e.hints : []).map(function (x) { return str(x, 300); }).filter(Boolean).slice(0, 3),
        success_criteria: (Array.isArray(e && e.success_criteria) ? e.success_criteria : []).map(function (x) { return str(x, 300); }).filter(Boolean).slice(0, 4) };
    }).filter(function (e) { return e.type && e.instruction && e.source_ids.length && e.source_ids.every(function (id) { return ids.has(id); }) &&
      (!anchors.size || (e.anchor_ids.length && e.anchor_ids.every(function (id) { return anchors.has(id); }))); });
    var objective = str(draft.objective, 500);
    if (!objective || !sections.length || !exercises.length || !exercises.some(function (e) { return e.type === "source_reading"; })) return null;
    return Object.assign({}, draft, { objective: objective, sections: sections, exercises: exercises });
  }

  function createSessionStore(storage, nowFn) {
    var s = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    var now = nowFn || Date.now;
    function clear() { try { if (s) s.removeItem(KEY); } catch (_) {} }
    function load() {
      if (!s) return null;
      var value = null; try { value = JSON.parse(s.getItem(KEY) || "null"); } catch (_) { clear(); return null; }
      var checked = validate(value);
      if (!checked || Date.parse(checked.expiresAt) <= now() || checked.status === "discarded") { clear(); return null; }
      return checked;
    }
    function save(value) {
      var checked = validate(value); if (!checked || Date.parse(checked.expiresAt) <= now()) return { ok: false, error: "INVALID_DRAFT" };
      try { if (!s) return { ok: false, error: "STORAGE_UNAVAILABLE" }; s.setItem(KEY, JSON.stringify(checked)); return { ok: true, draft: checked }; }
      catch (_) { return { ok: false, error: "STORAGE_UNAVAILABLE" }; }
    }
    function activate(value) { var checked = validate(Object.assign({}, value, { status: "active" })); return checked ? save(checked) : { ok: false, error: "INVALID_DRAFT" }; }
    function discard() { clear(); return { ok: true }; }
    return { kind: "session-ttl", load: load, save: save, activate: activate, discard: discard };
  }
  return { KEY: KEY, SCHEMA_VERSION: SCHEMA_VERSION, POLICY_VERSION: POLICY_VERSION, validate: validate,
    createSessionStore: createSessionStore };
});
