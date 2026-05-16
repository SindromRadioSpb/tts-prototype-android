/* notes-link-autocomplete.js — v3.4 C1.
 *
 * Inline `[[` autocomplete for the WYSIWYG note editor (#v3NotesEditor).
 * Closes audit finding A-G1 (PRODUCT_COHESION_PLAN_v3_4.md): linking
 * was a hidden power-user surface (raw-ID panel only). Typing `[[`
 * now opens a picker over notes / texts / roots by label; selecting
 * one inserts a visible `[[Label]]` token and remembers its resolved
 * target for this editor session. On save the host calls collect()
 * to materialise real note_links rows (idempotent, INSERT OR IGNORE).
 *
 * Hard scope (self-contained, low risk):
 *  - No graph code (graph stays read-only).
 *  - Read-only DB use for candidates; the ONLY write is the host's
 *    existing ldb.addNoteLink, fed by collect().
 *  - The raw-ID "Links" panel remains the power path (word/sentence/
 *    binyan, manual entry) — unchanged.
 *  - No deletions: editing/removing a `[[token]]` never drops an
 *    existing note_links row (link removal stays in the panel).
 *
 * Public API (window.NotesLinkAutocomplete):
 *   attach(editorEl)  idempotent listener wiring for one editor element
 *   reset()           clear the per-open session label→target map
 *   collect(markdown) → Array<{to_kind,to_id,link_alias}> for tokens
 *                       still present in the saved body
 *   _state()          test hook (session map size, open flag)
 */
(function () {
  "use strict";

  var KINDS = ["note", "text", "root"];
  var MAX_PER_KIND = 6;
  // session label(lower) → { to_kind, to_id, label }
  var sessionMap = new Map();
  var attached = new WeakSet();
  var pop = null;          // picker DOM
  var items = [];          // current candidates
  var activeIdx = -1;
  var triggerNode = null;  // text node holding the `[[query`
  var triggerStart = -1;   // index in triggerNode of the `[`
  var queryStr = "";
  var openFlag = false;
  var seq = 0;             // async race guard

  function t(key, fallback) {
    try {
      if (typeof window.v3NotesT === "function") {
        var s = window.v3NotesT(key, fallback);
        if (s && s !== key) return s;
      }
    } catch (_) {}
    return fallback;
  }

  function db() {
    var d = window.__localDB;
    return d && typeof d === "object" ? d : null;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function noteLabel(row) {
    var title = String((row && row.title) || "").trim();
    if (title) return title;
    // derive a short label from the body when untitled
    var body = String((row && (row.body_json || row.body)) || "");
    body = body.replace(/[#*_`>\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (body) return body.slice(0, 48);
    return t("notes.linkAuto.untitled", "Без названия");
  }

  // ── Candidate search (read-only) ─────────────────────────────────────────
  async function search(qstr) {
    var ldb = db();
    if (!ldb || !qstr) return [];
    var out = [];
    try {
      if (typeof ldb.searchAllNotes === "function") {
        var notes = await ldb.searchAllNotes(qstr, MAX_PER_KIND);
        (notes || []).forEach(function (n) {
          var id = String(n.id);
          if (window.v3NotesModalNoteId && id === String(window.v3NotesModalNoteId)) return; // no self-loop
          out.push({ to_kind: "note", to_id: id, label: noteLabel(n),
                     sub: t("notes.linkAuto.kindNote", "Заметка") });
        });
      }
    } catch (_) {}
    try {
      if (typeof ldb.listTexts === "function") {
        var texts = await ldb.listTexts({ query: qstr, limit: MAX_PER_KIND });
        (texts || []).forEach(function (x) {
          out.push({ to_kind: "text", to_id: String(x.id),
                     label: String(x.title || x.id),
                     sub: t("notes.linkAuto.kindText", "Текст") });
        });
      }
    } catch (_) {}
    try {
      if (typeof ldb.searchRootsAutocomplete === "function") {
        var roots = await ldb.searchRootsAutocomplete(qstr, MAX_PER_KIND);
        (roots || []).forEach(function (rt) {
          var rootStr = String((rt && (rt.root || rt.root_text || rt)) || "").trim();
          if (!rootStr) return;
          out.push({ to_kind: "root", to_id: rootStr, label: rootStr,
                     sub: t("notes.linkAuto.kindRoot", "Корень") });
        });
      }
    } catch (_) {}
    return out;
  }

  // v3.5 Fix 4 — browse-on-`[[`. A newcomer typing `[[` with no query
  // shouldn't have to guess names. Show the most recent texts (the
  // most common + highest-value organic link target) so they can pick
  // by recognition, not recall. listTexts() works without a query
  // (ordered pinned/recent); notes/roots still need a typed query
  // (their search APIs are query-only) and resume on the first char.
  async function browse() {
    var ldb = db();
    if (!ldb || typeof ldb.listTexts !== "function") return [];
    var out = [];
    try {
      var texts = await ldb.listTexts({ limit: 8 });
      (texts || []).forEach(function (x) {
        out.push({ to_kind: "text", to_id: String(x.id),
                   label: String(x.title || x.id),
                   sub: t("notes.linkAuto.kindText", "Текст") });
      });
    } catch (_) {}
    return out;
  }

  // ── Caret / trigger detection ────────────────────────────────────────────
  // We only act on a collapsed caret inside a text node whose content,
  // up to the caret, ends with `[[<query>` (no closing `]]`, no newline,
  // no nested bracket). Robust against the rich-text editor: we never
  // touch element nodes, only the local text node.
  var TRIG = /\[\[([^\[\]\n]*)$/;

  function detect() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    var node = sel.anchorNode;
    if (!node || node.nodeType !== 3) return null; // text node only
    var offset = sel.anchorOffset;
    var before = String(node.nodeValue || "").slice(0, offset);
    var m = TRIG.exec(before);
    if (!m) return null;
    return { node: node, start: offset - m[0].length, query: m[1] };
  }

  // ── Picker DOM ───────────────────────────────────────────────────────────
  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.id = "v3NotesLinkAutocomplete";
    pop.setAttribute("role", "listbox");
    pop.setAttribute("aria-label", t("notes.linkAuto.aria", "Подсказки связей"));
    pop.style.cssText =
      "position:absolute;z-index:100000;min-width:240px;max-width:340px;" +
      "max-height:260px;overflow:auto;background:#fff;color:#111;" +
      "border:1px solid #cbd5e1;border-radius:8px;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.18);font-size:13px;display:none;";
    document.body.appendChild(pop);
    return pop;
  }

  function hide() {
    openFlag = false;
    activeIdx = -1;
    items = [];
    triggerNode = null;
    if (pop) pop.style.display = "none";
  }

  function render() {
    var el = ensurePop();
    if (!items.length) {
      el.innerHTML =
        '<div style="padding:10px 12px;color:#64748b;">' +
        esc(t("notes.linkAuto.empty", "Ничего не найдено — продолжайте печатать")) +
        "</div>";
      return;
    }
    el.innerHTML = items
      .map(function (it, i) {
        var on = i === activeIdx;
        return (
          '<div role="option" data-i="' + i + '" aria-selected="' + (on ? "true" : "false") + '" ' +
          'style="padding:7px 12px;cursor:pointer;display:flex;gap:8px;align-items:baseline;' +
          (on ? "background:#eff6ff;" : "") + '">' +
          '<span style="flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          esc(it.label) + "</span>" +
          '<span style="flex:0 0 auto;font-size:11px;color:#64748b;">' + esc(it.sub) + "</span>" +
          "</div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(el.querySelectorAll("[data-i]"), function (row) {
      row.addEventListener("mousedown", function (ev) {
        ev.preventDefault(); // keep editor selection
        choose(parseInt(row.getAttribute("data-i"), 10));
      });
    });
  }

  function place() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    var rect;
    try {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch (_) { return; }
    var el = ensurePop();
    var top = window.scrollY + rect.bottom + 4;
    var left = window.scrollX + rect.left;
    var vw = document.documentElement.clientWidth;
    el.style.display = "block";
    var pw = el.offsetWidth || 260;
    if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
    el.style.top = top + "px";
    el.style.left = left + "px";
  }

  // ── Insertion ────────────────────────────────────────────────────────────
  function choose(i) {
    if (i < 0 || i >= items.length || !triggerNode) { hide(); return; }
    var it = items[i];
    var node = triggerNode;
    var val = String(node.nodeValue || "");
    var sel = window.getSelection && window.getSelection();
    var caret = sel && sel.anchorNode === node ? sel.anchorOffset : val.length;
    var token = "[[" + it.label + "]]";
    node.nodeValue = val.slice(0, triggerStart) + token + " " + val.slice(caret);

    // remember the resolved target for this session (by label, lowercased)
    sessionMap.set(it.label.toLowerCase(), {
      to_kind: it.to_kind, to_id: String(it.to_id), label: it.label,
    });

    // place caret right after the inserted "token "
    try {
      var r = document.createRange();
      var pos = triggerStart + token.length + 1;
      r.setStart(node, Math.min(pos, node.nodeValue.length));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (_) {}

    hide();
    // re-sync the hidden markdown buffer + char counter
    try {
      if (typeof window.v3NotesEditorSyncToTextarea === "function") {
        window.v3NotesEditorSyncToTextarea();
      }
    } catch (_) {}
  }

  // ── Event handlers ───────────────────────────────────────────────────────
  async function onInput() {
    var d = detect();
    if (!d) { if (openFlag) hide(); return; }
    triggerNode = d.node;
    triggerStart = d.start;
    queryStr = d.query;
    openFlag = true;
    if (!queryStr || queryStr.trim().length < 1) {
      // v3.5 Fix 4 — browse mode: show recent texts so the user can
      // pick by recognition instead of guessing a name.
      var bSeq = ++seq;
      var brs = await browse();
      if (bSeq !== seq || !openFlag) return;
      items = brs;
      activeIdx = items.length ? 0 : -1;
      render();
      place();
      return;
    }
    var mySeq = ++seq;
    var res = await search(queryStr.trim());
    if (mySeq !== seq || !openFlag) return; // superseded
    items = res.slice(0, MAX_PER_KIND * KINDS.length);
    activeIdx = items.length ? 0 : -1;
    render();
    place();
  }

  function onKeyDown(ev) {
    if (!openFlag) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); hide(); return; }
    if (!items.length) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      activeIdx = (activeIdx + 1) % items.length;
      render(); return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      render(); return;
    }
    if (ev.key === "Enter" || ev.key === "Tab") {
      if (activeIdx >= 0) {
        ev.preventDefault();
        ev.stopPropagation();
        choose(activeIdx);
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function attach(ed) {
    if (!ed || attached.has(ed)) return;
    attached.add(ed);
    // capture phase for keydown so Enter/Tab/Esc are intercepted before the
    // editor's own markdown-shortcut / focus handling.
    ed.addEventListener("keydown", onKeyDown, true);
    ed.addEventListener("input", function () { onInput(); });
    ed.addEventListener("blur", function () { setTimeout(hide, 150); });
  }

  function reset() {
    sessionMap.clear();
    hide();
  }

  // Scan the saved markdown for `[[label]]` tokens; for each whose label
  // was resolved via the picker this session, emit a link row. Idempotent
  // de-dup by kind+id. Never deletes.
  function collect(markdown) {
    var src = String(markdown == null ? "" : markdown);
    var re = /\[\[([^\[\]\n]+)\]\]/g;
    var seen = Object.create(null);
    var links = [];
    var m;
    while ((m = re.exec(src)) !== null) {
      var label = String(m[1] || "").trim();
      if (!label) continue;
      var hit = sessionMap.get(label.toLowerCase());
      if (!hit) continue;
      var key = hit.to_kind + "::" + hit.to_id;
      if (seen[key]) continue;
      seen[key] = 1;
      links.push({ to_kind: hit.to_kind, to_id: String(hit.to_id), link_alias: label });
    }
    return links;
  }

  function _state() {
    return { session: sessionMap.size, open: openFlag, items: items.length };
  }

  window.NotesLinkAutocomplete = {
    attach: attach,
    reset: reset,
    collect: collect,
    _state: _state,
  };
})();
