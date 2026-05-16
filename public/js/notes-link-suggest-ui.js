/* notes-link-suggest-ui.js — v3.6 Phase 3.
 *
 * The "Подтвердите связи / Confirm what you know" panel: the learner-
 * confirmation surface of the Smart Learning Graph. It renders the
 * read-only A2 candidates (notes-graph-suggest.js) inside the Notes
 * editor's already-saved-gated Links panel and lets the learner
 * confirm / reject / defer each — the confirmation act is the
 * learning event (retrieval practice), not mere UI.
 *
 * PHASE 3 SCOPE (hard): decisions are IN-MEMORY for the page session
 * ONLY. No DB writes, no note_links, no note_link_suggestions, no
 * addNoteLink — durability is Phase 4. No graph-canvas authoring. No
 * network, no telemetry. The generator is read-only/offline; this
 * module only reads its output and updates the DOM + an in-memory
 * decision list that feeds back into the generator's suppression
 * contract so a decided card does not reappear this session.
 *
 * Pedagogical wording is MANDATORY (owner-approved): heading
 * «Подтвердите связи», buttons «Я понимаю связь» / «Не связано» /
 * «Позже» — never technical "Suggested links / Accept / Reject".
 *
 * Public API (window.NotesLinkSuggestUI):
 *   refresh(noteId)  debounced; (re)render for the open saved note
 *   reset()          clear the rendered list + cancel pending render
 *                    (session decisions are kept — session-scoped)
 *   _state()         test hook { decisions, rendered, open }
 */
(function () {
  "use strict";

  var DEBOUNCE_MS = 300;
  var sessionDecisions = [];   // [{from,to,to_kind,reason_code,state,decided_at}]
  var _timer = null;
  var _seq = 0;                // async race guard
  var _lastRendered = 0;

  function t(key, fallback, vars) {
    var s = fallback;
    try {
      if (typeof window.v3NotesT === "function") {
        var r = window.v3NotesT(key, fallback);
        if (r && r !== key) s = r;
      }
    } catch (_) {}
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = String(s).replace("{" + k + "}", String(vars[k]));
      });
    }
    return s;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function el(id) { return document.getElementById(id); }

  function reasonText(reason, evidence) {
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

  function setStatus(msg) {
    var s = el("v3NotesSuggestStatus");
    if (s) s.textContent = msg || "";
  }

  function _db() {
    var d = (typeof window !== "undefined") && window.__localDB;
    return d && typeof d === "object" ? d : null;
  }

  // Phase 4 — DURABLE decision. Persists into note_link_suggestions
  // (via local-db upsertSuggestion); CONFIRM additionally writes a
  // real note_links row (idempotent addNoteLink) so the connection
  // becomes a first-class durable link. Degrades to an in-memory
  // session store if the DB CRUD is unavailable (never throws). No
  // telemetry, no network, no graph-canvas mutation.
  async function decide(cand, state) {
    var d = _db();
    var rec = {
      from: cand.from, to: cand.to, to_kind: cand.to_kind || "note",
      reason_code: cand.reason_code, evidence: cand.evidence,
      score: cand.score, state: state,
      decided_at: new Date().toISOString(),
    };
    var persisted = false;
    if (d && typeof d.upsertSuggestion === "function") {
      try { await d.upsertSuggestion(rec); persisted = true; } catch (_) {}
    }
    if (!persisted) sessionDecisions.push(rec);   // graceful fallback

    if (state === "confirmed" && d && typeof d.addNoteLink === "function") {
      // durable note_links row — the single link truth. Idempotent.
      try {
        await d.addNoteLink(cand.from, {
          to_kind: cand.to_kind || "note", to_id: cand.to,
          link_alias: cand.to_label || null,
        });
      } catch (_) {}
    }

    var msg =
      state === "confirmed" ? t("notes.suggest.doneConfirmed", "Связь отмечена как понятная.") :
      state === "rejected"  ? t("notes.suggest.doneRejected", "Скрыто — не связано.") :
                              t("notes.suggest.doneLater", "Отложено — вернёмся позже.");
    setStatus(msg);
    // Re-render: decisions are reloaded (DB) so the suppression
    // contract now hides this card. On confirm also refresh the
    // existing links list so the new note_links row shows as an
    // outgoing link (debounced — safe re-entrancy).
    if (state === "confirmed" && typeof window.v3NotesLinksRefresh === "function") {
      try { window.v3NotesLinksRefresh(); } catch (_) {}
    } else {
      render(cand.from);
    }
  }

  // Decisions feed the generator's suppression contract. Prefer the
  // durable store; fall back to the in-memory session store.
  async function loadDecisions(noteId) {
    var d = _db();
    if (d && typeof d.listSuggestionDecisions === "function") {
      try {
        var rows = await d.listSuggestionDecisions(noteId);
        if (Array.isArray(rows)) return rows;
      } catch (_) {}
    }
    return sessionDecisions;
  }

  function cardHtml(c, i) {
    var rid = "v3sg-" + i;
    return (
      '<li class="v3-notes-suggest-card" role="group" aria-labelledby="' + rid + '" ' +
      'style="border:1px solid var(--theme-border,#dde);border-radius:8px;' +
      'padding:9px 11px;margin:0 0 8px 0;display:flex;flex-wrap:wrap;gap:8px;' +
      'align-items:center;">' +
        '<span id="' + rid + '" style="flex:1 1 160px;min-width:120px;font-size:13px;">' +
          '<b style="font-weight:600;">' + esc(c.to_label || c.to) + '</b>' +
          '<span style="display:block;font-size:11.5px;color:var(--theme-text-secondary,#6b7280);">' +
            esc(reasonText(c.reason_code, c.evidence)) + '</span>' +
        '</span>' +
        '<span class="v3-notes-suggest-actions" style="display:flex;gap:6px;flex:0 0 auto;">' +
          '<button type="button" class="btn-secondary" data-sg-act="confirm" data-sg-i="' + i + '" ' +
            'style="padding:4px 9px;font-size:12px;">' +
            esc(t("notes.suggest.btnConfirm", "Я понимаю связь")) + '</button>' +
          '<button type="button" class="btn-secondary" data-sg-act="reject" data-sg-i="' + i + '" ' +
            'style="padding:4px 9px;font-size:12px;">' +
            esc(t("notes.suggest.btnReject", "Не связано")) + '</button>' +
          '<button type="button" class="btn-secondary" data-sg-act="later" data-sg-i="' + i + '" ' +
            'style="padding:4px 9px;font-size:12px;">' +
            esc(t("notes.suggest.btnLater", "Позже")) + '</button>' +
        '</span>' +
      '</li>'
    );
  }

  async function render(noteId) {
    var panel = el("v3NotesSuggestPanel");
    var list = el("v3NotesSuggestList");
    if (!panel || !list) return;
    var gen = window.NotesGraphSuggest;
    if (!noteId || !gen || typeof gen.candidatesForNote !== "function") {
      panel.style.display = "none";
      list.innerHTML = "";
      _lastRendered = 0;
      return;
    }
    var mySeq = ++_seq;
    var cands = [];
    try {
      var decisions = await loadDecisions(noteId);   // durable (DB) or fallback
      if (mySeq !== _seq) return;          // superseded during the await
      cands = await gen.candidatesForNote(noteId, {
        decisions: decisions, now: Date.now(),
      });
    } catch (_) { cands = []; }
    if (mySeq !== _seq) return;            // superseded by a newer refresh
    if (!Array.isArray(cands)) cands = [];

    panel.style.display = "";
    _lastRendered = cands.length;
    if (!cands.length) {
      list.innerHTML =
        '<li class="v3-notes-suggest-empty" style="list-style:none;color:' +
        'var(--theme-text-secondary,#6b7280);font-size:12.5px;padding:4px 0;">' +
        esc(t("notes.suggest.empty",
          "Пока нет предложенных связей для этой заметки.")) + '</li>';
      var cnt0 = el("v3NotesSuggestCount");
      if (cnt0) cnt0.textContent = "";
      return;
    }
    list.innerHTML = cands.map(cardHtml).join("");
    var cnt = el("v3NotesSuggestCount");
    if (cnt) {
      cnt.textContent = t("notes.suggest.count", "{n}", { n: cands.length });
    }
    Array.prototype.forEach.call(
      list.querySelectorAll("[data-sg-act]"), function (b) {
        b.addEventListener("click", function () {
          var i = parseInt(b.getAttribute("data-sg-i"), 10);
          var act = b.getAttribute("data-sg-act");
          var c = cands[i];
          if (!c) return;
          decide(c, act === "confirm" ? "confirmed"
                  : act === "reject" ? "rejected" : "later");
        });
      });
  }

  function refresh(noteId) {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    // Debounced + off the editor links lifecycle only — NEVER called
    // on graph open (perf invariant). Fire-and-forget.
    _timer = setTimeout(function () {
      _timer = null;
      render(noteId).catch(function () {});
    }, DEBOUNCE_MS);
  }

  function reset() {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _seq++;                                 // cancel any in-flight render
    var list = el("v3NotesSuggestList");
    if (list) list.innerHTML = "";
    var panel = el("v3NotesSuggestPanel");
    if (panel) panel.style.display = "none";
    _lastRendered = 0;
    // sessionDecisions are intentionally KEPT (page-session scoped).
  }

  function _state() {
    return {
      decisions: sessionDecisions.slice(),
      rendered: _lastRendered,
      open: !!(el("v3NotesSuggestPanel") &&
               el("v3NotesSuggestPanel").style.display !== "none"),
    };
  }

  window.NotesLinkSuggestUI = {
    refresh: refresh, reset: reset, _state: _state,
  };
})();
