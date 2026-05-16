/* notes-graph-srs-candidates.js — v3.6 Phase 6.
 *
 * Turns CONFIRMED connections (the learner's "Я понимаю связь"
 * decisions) into retrieval-practice CANDIDATE OBJECTS — e.g.
 *   «Почему связаны "למדתי" и "תלמיד"?» → «Общий корень למד».
 *
 * HARD SCOPE (owner-approved, v3.6): this module produces candidate
 * OBJECTS ONLY. It is the bridge data for a future SRS/quiz release.
 * In v3.6 it has NO UI, NO consumer, and it MUST NOT:
 *   - modify the SRS scheduling engine,
 *   - read or write ANY srs_* table,
 *   - create real cards,
 *   - touch the network or emit telemetry/events,
 *   - mutate anything (read-only: bare-SELECT guard, like the graph).
 * It only reads note_link_suggestions (state='confirmed') + notes_v2
 * labels and returns a deterministic in-memory list. Degrades to []
 * (never throws) if the DB / table is unavailable.
 *
 * Public API (window.NotesGraphSrsCandidates):
 *   fromConfirmed(opts?) → Promise<Array<{
 *       kind:'connection_recall', from, to, to_kind, reason_code,
 *       evidence, from_label, to_label, prompt, answer,
 *       srs_template:'note_connection' }>>
 *     opts: { max?:number=200 }
 */
(function () {
  "use strict";

  var DEFAULT_MAX = 200;

  // read-only DB guard — identical to notes-graph-suggest.js / graph _q
  var _RO = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
  var _FORB = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
  // defence-in-depth: this module must never even READ srs_* tables.
  var _SRS = /\bsrs_[a-z_]+/i;
  async function _q(sql, params) {
    var ldb = (typeof window !== "undefined") && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== "function") {
      throw new Error("notes-graph-srs-candidates: local-db not ready");
    }
    var s = String(sql || "");
    if (!_RO.test(s) || _FORB.test(s) || _SRS.test(s)) {
      throw new Error("notes-graph-srs-candidates: refused SQL (read-only, no srs_*)");
    }
    return ldb.dbQuery(s, params || []);
  }

  function t(key, fallback, vars) {
    var s = fallback;
    try {
      if (typeof window.v3NotesT === "function") {
        var r = window.v3NotesT(key, fallback);
        if (r && r !== key) s = r;
      }
    } catch (_) {}
    if (vars) Object.keys(vars).forEach(function (k) {
      s = String(s).replace("{" + k + "}", String(vars[k]));
    });
    return s;
  }

  function _norm(w) {
    if (typeof window !== "undefined" && window.MorphNormalize &&
        typeof window.MorphNormalize.normalizeHebrew === "function") {
      try { return String(window.MorphNormalize.normalizeHebrew(w) || "").trim(); }
      catch (_) {}
    }
    return String(w == null ? "" : w).trim();
  }

  function reasonAnswer(reason, evidence) {
    switch (reason) {
      case "shared_root":
        return t("notes.suggest.reason.sharedRoot", "Общий корень {root}", { root: evidence });
      case "shared_lemma":
        return t("notes.suggest.reason.sharedLemma", "То же слово {word}", { word: evidence });
      case "shared_binyan":
        return t("notes.suggest.reason.sharedBinyan", "Тот же биньян {binyan}", { binyan: evidence });
      case "same_text":
        return t("notes.suggest.reason.sameText", "Из того же текста");
      default:
        return t("notes.suggest.reason.related", "Связано");
    }
  }

  async function fromConfirmed(opts) {
    opts = opts || {};
    var max = Number.isFinite(opts.max) ? opts.max : DEFAULT_MAX;
    var conf, notes;
    try {
      conf = await _q(
        "SELECT from_note_id, to_kind, to_id, reason_code, evidence" +
        " FROM note_link_suggestions WHERE state = 'confirmed'", []);
      notes = await _q(
        // privacy parity with the graph: never select the freeform
        // body — only the label-bearing scalars.
        "SELECT id, title, json_extract(body_json,'$.word') AS j_word" +
        " FROM notes_v2", []);
    } catch (_) { return []; }            // degrade, never throw

    var label = new Map();
    for (var i = 0; i < (notes || []).length; i++) {
      var n = notes[i];
      var lab = String(n.title || "").trim() || _norm(n.j_word) || String(n.id);
      label.set(String(n.id), lab);
    }

    var out = [];
    for (var j = 0; j < (conf || []).length; j++) {
      var c = conf[j];
      var fromId = String(c.from_note_id);
      var toId = String(c.to_id);
      var fromLabel = label.get(fromId) || fromId;
      var toLabel = (String(c.to_kind) === "note" && label.get(toId)) || toId;
      var ev = c.evidence == null ? "" : String(c.evidence);
      out.push({
        kind: "connection_recall",
        from: fromId, to: toId, to_kind: String(c.to_kind || "note"),
        reason_code: String(c.reason_code || ""),
        evidence: ev,
        from_label: fromLabel,
        to_label: toLabel,
        prompt: t("notes.suggest.srs.prompt",
          "Почему связаны «{a}» и «{b}»?", { a: fromLabel, b: toLabel }),
        answer: reasonAnswer(String(c.reason_code || ""), ev),
        srs_template: "note_connection",
      });
    }
    // deterministic order
    out.sort(function (x, y) {
      return x.from.localeCompare(y.from) ||
        x.to.localeCompare(y.to) ||
        x.reason_code.localeCompare(y.reason_code);
    });
    return out.slice(0, max);
  }

  window.NotesGraphSrsCandidates = { fromConfirmed: fromConfirmed };
})();
