// public/js/notes-graph.js — v3.3.6 Knowledge Graph.
//
// C2 scope: READ-ONLY data layer + ontology. No UI, no DOM, no d3.
// C3 adds the renderer hook-up; C4 adds the modal/state machine.
//
// Exposes:
//   window.NotesGraphData          — the data layer (this file, C2)
//   window.NotesGraph              — the orchestrator (added C3/C4)
//
// HARD invariants enforced here:
//   • Read-only. Only SELECT queries via window.__localDB.dbQuery.
//   • No raw document text reaches the graph layer. body_json markdown
//     is NEVER selected — only the scalar structured fields
//     json_extract($.root|$.binyan|$.word) come back from SQL.
//     Sentence nodes are labelled positionally ("Строка #N в «…»"),
//     never from he_plain, so zero sentence content crosses the
//     boundary (stricter than the original plan's 24-char snippet).
//   • Root/word resolution reuses window.MorphProvider.analyze +
//     window.MorphNormalize.normalizeHebrew — the SAME contracts
//     Cross-text uses. No duplicate normalization logic. Parity is
//     smoke-pinned (build-data cases 6+7).
//   • No telemetry, no fetch, no events, no research payload writes.

(function () {
  "use strict";

  const MAX_NODES = 200;          // top-N degree cap (perf budget §7)
  const NODE_KINDS = ["note", "text", "sentence", "root", "word", "binyan"];
  // v3.5 — `auto_text` is the data-derived backbone: every note is
  // attached to the text it was written against (notes_v2.text_id),
  // so the library structure shows up with ZERO manual linking. This
  // is read-only synthesis from data the app already has — it does
  // NOT create note_links rows or mutate anything.
  // v3.6 Phase 5 — `auto_shared_root` / `auto_shared_lemma` are the
  // computed "suggested" view-only layer: notes that share a root /
  // lemma. Read-only synthesis (NO note_links written; the graph
  // stays read-only). Capped + rarity-skipped (no hairball);
  // explicit/confirmed links supersede; learner-rejected / deferred
  // pairs are suppressed via note_link_suggestions so the graph
  // honours decisions.
  const EDGE_KINDS = ["explicit_link", "target_anchor", "derived_morph",
                      "auto_text", "auto_shared_root", "auto_shared_lemma"];

  // ── DB shim — identical access path to crosstext.js ────────────────────
  // READ-ONLY enforcement (C7 privacy hardening): the graph is a
  // read-only feature. _q refuses any statement that is not a bare
  // SELECT — a defensive guard so a future edit cannot silently turn
  // the graph into a write surface. Smoke-pinned.
  const _READONLY_RE = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
  const _FORBIDDEN_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
  async function _q(sql, params) {
    const ldb = (typeof window !== "undefined") && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== "function") {
      throw new Error("notes-graph: local-db not ready (window.__localDB.dbQuery missing)");
    }
    const s = String(sql || "");
    if (!_READONLY_RE.test(s) || _FORBIDDEN_RE.test(s)) {
      throw new Error("notes-graph: refused non-SELECT SQL (read-only invariant)");
    }
    return ldb.dbQuery(s, params || []);
  }

  // ── Normalization — delegate to the shared contract ────────────────────
  function _normalize(word) {
    if (typeof window === "undefined" || !window.MorphNormalize ||
        typeof window.MorphNormalize.normalizeHebrew !== "function") {
      return String(word || "").trim();
    }
    return window.MorphNormalize.normalizeHebrew(word);
  }

  // Root/binyan resolution — byte-for-byte the same logic as
  // crosstext.js _resolveRoot (lines 63-76): MorphProvider.analyze
  // returns Array<{r, b}>; take the first analysis with non-empty r
  // (Tier-1 hspell wins by priority order). Smoke-pinned for parity.
  async function _resolveRoot(word) {
    if (typeof window === "undefined" || !window.MorphProvider) return null;
    if (typeof window.MorphProvider.analyze !== "function") return null;
    try {
      const analyses = await window.MorphProvider.analyze(word);
      if (!Array.isArray(analyses) || analyses.length === 0) return null;
      for (const a of analyses) {
        if (a && a.r) return { root: String(a.r), binyan: a.b || null };
      }
      return null;
    } catch (_) { return null; }
  }

  function _nid(kind, rawId) { return kind + ":" + String(rawId); }

  // ── Data fetch (read-only) ─────────────────────────────────────────────
  //
  // Note the SQL: body_json markdown is never selected. Only the
  // structured scalar fields the ontology needs are json_extract'd,
  // so the freeform note body cannot cross into the graph layer.
  async function _fetchRaw() {
    const notes = await _q(
      `SELECT id,
              title,
              target_kind,
              target_id,
              text_id,
              note_type,
              json_extract(body_json, '$.root')   AS j_root,
              json_extract(body_json, '$.binyan') AS j_binyan,
              json_extract(body_json, '$.word')   AS j_word,
              updated_at
         FROM notes_v2`, []);
    const links = await _q(
      `SELECT from_note_id, to_kind, to_id, link_alias
         FROM note_links`, []);
    const texts = await _q(
      `SELECT id, title FROM texts WHERE is_archived = 0`, []);
    return { notes: notes || [], links: links || [], texts: texts || [] };
  }

  // ── Graph build ────────────────────────────────────────────────────────
  //
  // Returns { nodes, edges, stats, reduced }.
  //   node = { id, kind, rawId, label, degree, meta }
  //   edge = { source, target, edge_kind, alias?, also_target? }
  // No raw document text in any field.
  async function buildGraph(opts) {
    opts = opts || {};
    const cap = Number.isFinite(opts.maxNodes) ? opts.maxNodes : MAX_NODES;
    const { notes, links, texts } = await _fetchRaw();

    const nodes = new Map();   // id -> node
    const edges = [];
    const edgeKey = new Set(); // dedup key "src→tgt" → already has explicit_link

    function ensureNode(kind, rawId, label, meta) {
      const id = _nid(kind, rawId);
      let n = nodes.get(id);
      if (!n) {
        n = { id, kind, rawId: String(rawId), label: label || String(rawId),
              degree: 0, meta: meta || {} };
        nodes.set(id, n);
      } else if (label && (!n.label || n.label === n.rawId)) {
        n.label = label;
      }
      return n;
    }

    // texts → title lookup ONLY. Text nodes are materialized on first
    // edge reference (same rule as root/word/binyan), so a library text
    // with zero notes/links does not pollute the knowledge graph with a
    // degree-0 island. Premium-quality: the graph shows *connected
    // knowledge*, not the full library inventory.
    const textTitle = new Map();
    for (const t of texts) {
      textTitle.set(String(t.id), t.title || "");
    }

    // Notes → note nodes + target_anchor edges + derived_morph edges.
    for (const note of notes) {
      const noteNode = ensureNode("note", note.id,
        (note.title && note.title.trim()) ? note.title.trim().slice(0, 48)
                                          : "(заметка)",
        { note_type: note.note_type, target_kind: note.target_kind,
          updated_at: note.updated_at });

      // target_anchor — the note's own anchor (text/sentence).
      if (note.target_kind === "text" && note.target_id) {
        const tt = textTitle.get(String(note.target_id)) || "(текст)";
        ensureNode("text", note.target_id, tt, { kind_label: "text" });
        _addEdge(note.id, _nid("text", note.target_id), "target_anchor");
      } else if (note.target_kind === "sentence" && note.target_id) {
        // Positional label only — NEVER he_plain content.
        const parentTitle = note.text_id ? (textTitle.get(String(note.text_id)) || "") : "";
        ensureNode("sentence", note.target_id,
          parentTitle ? `Строка · ${parentTitle.slice(0, 24)}` : "Строка",
          { text_id: note.text_id || null });
        _addEdge(note.id, _nid("sentence", note.target_id), "target_anchor");
      }

      // derived_morph — structured root/binyan on word_study/grammar_rule.
      if (note.note_type === "word_study" || note.note_type === "grammar_rule") {
        if (note.j_root) {
          const r = String(note.j_root);
          ensureNode("root", r, r, { derived: true });
          _addEdge(note.id, _nid("root", r), "derived_morph");
        }
        if (note.j_binyan) {
          const b = String(note.j_binyan);
          ensureNode("binyan", b, b, { derived: true });
          _addEdge(note.id, _nid("binyan", b), "derived_morph");
        }
        if (note.j_word) {
          const w = _normalize(String(note.j_word));
          if (w) {
            ensureNode("word", w, String(note.j_word), { normalized: w });
            _addEdge(note.id, _nid("word", w), "derived_morph");
          }
        }
      }
      void noteNode;
    }

    // Explicit [[…]] links — note_links table verbatim.
    for (const lnk of links) {
      const toKind = String(lnk.to_kind);
      if (NODE_KINDS.indexOf(toKind) === -1) continue;
      // The source note may not be in notes_v2 anymore (broken link
      // tolerated by the UI); skip dangling sources.
      const srcId = _nid("note", lnk.from_note_id);
      if (!nodes.has(srcId)) continue;
      let tgtRaw = lnk.to_id;
      let tgtLabel = String(lnk.to_id);
      if (toKind === "word") { tgtRaw = _normalize(String(lnk.to_id)); tgtLabel = String(lnk.to_id); }
      if (toKind === "text") tgtLabel = textTitle.get(String(lnk.to_id)) || String(lnk.to_id);
      ensureNode(toKind, tgtRaw, tgtLabel,
                 toKind === "word" ? { normalized: tgtRaw } : {});
      _addEdge(lnk.from_note_id, _nid(toKind, tgtRaw), "explicit_link",
               lnk.link_alias || null);
    }

    // v3.5 Fix 1+2 — auto-attach every note to its SOURCE TEXT
    // (notes_v2.text_id). This is the data-derived backbone of the
    // map: with zero manual `[[` linking the user immediately sees
    // their library (texts that have notes) with each note grouped
    // under the text it belongs to, plus the existing shared
    // root/binyan/word clustering. Read-only synthesis — no
    // note_links written, graph stays read-only. Texts with no notes
    // are still omitted (knowledge, not raw inventory). Runs AFTER
    // explicit/anchor edges so we never double-connect a note to a
    // text it is already (anchor/explicit) linked to.
    for (const note of notes) {
      if (!note.text_id) continue;
      const tId = String(note.text_id);
      const noteNodeId = _nid("note", note.id);
      if (!nodes.has(noteNodeId)) continue;
      const tNodeId = _nid("text", tId);
      const already = edges.some((e) =>
        e.source === noteNodeId && e.target === tNodeId);
      if (already) continue;
      ensureNode("text", tId, textTitle.get(tId) || "(текст)",
        { kind_label: "text" });
      edges.push({ source: noteNodeId, target: tNodeId,
                   edge_kind: "auto_text", alias: null });
    }

    // Degree.
    // ── Phase 5 — computed shared-root / shared-lemma view layers ──
    // Read-only. Capped per token + rarity-skip so a ubiquitous root
    // cannot create a hairball. A pair already joined by ANY edge
    // (explicit/confirmed/anchor/derived) is skipped — those layers
    // win. Pairs the learner rejected (forever) or deferred (within
    // cooldown) are suppressed so the graph honours decisions.
    const SHARED_CAP = 6;          // max emitted edges per token
    const SHARED_SKIP_OVER = 24;   // a token in > N notes is noise
    const _supp = new Set();
    try {
      const _dr = await _q(
        `SELECT from_note_id, to_id, reason_code, state, decided_at
           FROM note_link_suggestions WHERE state IN ('rejected','later')`, []);
      const _now = Date.now(), _COOL = 24 * 60 * 60 * 1000;
      for (const d of (_dr || [])) {
        const k = String(d.from_note_id) + "|" + String(d.to_id) + "|" + String(d.reason_code);
        if (d.state === "rejected") { _supp.add(k); continue; }
        const tms = Date.parse(d.decided_at);
        if (!isFinite(tms) || (_now - tms) < _COOL) _supp.add(k);
      }
    } catch (_) { /* table may not exist on old DBs — no suppression */ }

    // Phase 8 perf-hardening: a single O(|edges|) pass builds an
    // undirected pair-set so the inner check is O(1) instead of an
    // edges.some() scan per pair (was O(pairs × |edges|) — the
    // large-graph blowup risk). Shared edges added below also update
    // the set, so the two passes never double-connect a pair.
    const _pairKey = (x, y) => (x < y ? x + "" + y : y + "" + x);
    const _connected = new Set();
    for (const e of edges) _connected.add(_pairKey(e.source, e.target));

    function _sharedPass(getKey, reason, edgeKind) {
      const groups = new Map();
      for (const n of notes) {
        const key = getKey(n);
        if (!key) continue;
        let arr = groups.get(key);
        if (!arr) { arr = []; groups.set(key, arr); }
        arr.push(String(n.id));
      }
      for (const [token, ids] of groups) {
        if (ids.length < 2 || ids.length > SHARED_SKIP_OVER) continue;
        const sorted = ids.slice().sort((a, b) => a.localeCompare(b));
        let added = 0;
        for (let i = 0; i < sorted.length && added < SHARED_CAP; i++) {
          for (let j = i + 1; j < sorted.length && added < SHARED_CAP; j++) {
            const a = sorted[i], b = sorted[j];
            const sId = _nid("note", a), tId = _nid("note", b);
            if (!nodes.has(sId) || !nodes.has(tId)) continue;
            const pk = _pairKey(sId, tId);
            if (_connected.has(pk)) continue;            // O(1)
            if (_supp.has(a + "|" + b + "|" + reason) ||
                _supp.has(b + "|" + a + "|" + reason)) continue;
            edges.push({ source: sId, target: tId, edge_kind: edgeKind,
                         alias: null, evidence: token });
            _connected.add(pk);
            added++;
          }
        }
      }
    }
    _sharedPass((n) => _normalize(n.j_root), "shared_root", "auto_shared_root");
    _sharedPass((n) => _normalize(n.j_word), "shared_lemma", "auto_shared_lemma");

    for (const e of edges) {
      const s = nodes.get(e.source), t = nodes.get(e.target);
      if (s) s.degree++;
      if (t) t.degree++;
    }

    // Top-N degree fallback.
    let nodeList = Array.from(nodes.values());
    let reduced = null;
    if (nodeList.length > cap) {
      const total = nodeList.length;
      nodeList = nodeList
        .slice()
        .sort((a, b) => b.degree - a.degree ||
                        a.id.localeCompare(b.id)) // deterministic tie-break
        .slice(0, cap);
      const keep = new Set(nodeList.map((n) => n.id));
      const keptEdges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
      reduced = { total, shown: cap };
      return _finalize(nodeList, keptEdges, reduced);
    }
    return _finalize(nodeList, edges, reduced);

    // ── helpers (closures over nodes/edges/edgeKey) ──
    function _addEdge(fromNoteId, targetId, edgeKind, alias) {
      const source = _nid("note", fromNoteId);
      const k = source + "→" + targetId;
      if (edgeKind === "explicit_link") {
        // Explicit wins. If a target_anchor already drew this pair,
        // upgrade it: mark also_target and switch kind.
        const existing = edges.find((e) => e.source === source && e.target === targetId);
        if (existing) {
          existing.edge_kind = "explicit_link";
          existing.also_target = existing.also_target ||
                                 existing._wasAnchor || false;
          if (alias && !existing.alias) existing.alias = alias;
          existing.also_target = true; // it was previously anchored
          edgeKey.add(k);
          return;
        }
        edges.push({ source, target: targetId, edge_kind: "explicit_link",
                     alias: alias || null });
        edgeKey.add(k);
        return;
      }
      // Non-explicit (target_anchor / derived_morph).
      if (edgeKey.has(k)) {
        // An explicit_link already covers this pair — mark also_target
        // if this was an anchor, but don't add a duplicate edge.
        if (edgeKind === "target_anchor") {
          const existing = edges.find((e) => e.source === source && e.target === targetId);
          if (existing) existing.also_target = true;
        }
        return;
      }
      const dupe = edges.find((e) => e.source === source &&
                                     e.target === targetId &&
                                     e.edge_kind === edgeKind);
      if (dupe) return;
      const edge = { source, target: targetId, edge_kind: edgeKind, alias: null };
      if (edgeKind === "target_anchor") edge._wasAnchor = true;
      edges.push(edge);
    }
  }

  function _finalize(nodeList, edgeList, reduced) {
    const stats = { note: 0, text: 0, sentence: 0, root: 0, word: 0, binyan: 0 };
    for (const n of nodeList) if (stats[n.kind] != null) stats[n.kind]++;
    // Drop internal scratch fields from edges before handing off.
    const cleanEdges = edgeList.map((e) => {
      const out = { source: e.source, target: e.target, edge_kind: e.edge_kind };
      if (e.alias) out.alias = e.alias;
      if (e.also_target) out.also_target = true;
      if (e.evidence) out.evidence = e.evidence;  // Phase 5 — explainability
      return out;
    });
    return {
      nodes: nodeList,
      edges: cleanEdges,
      stats: {
        nodes_total: nodeList.length,
        edges_total: cleanEdges.length,
        by_kind: stats,
      },
      reduced,
    };
  }

  // ── public data API (C2) ───────────────────────────────────────────────
  const dataApi = {
    buildGraph,
    _resolveRoot,
    _normalize,
    NODE_KINDS: NODE_KINDS.slice(),
    EDGE_KINDS: EDGE_KINDS.slice(),
    MAX_NODES,
  };
  if (typeof window !== "undefined") {
    window.NotesGraphData = dataApi;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = dataApi;
  }
})();

// ─────────────────────────────────────────────────────────────────────────
// window.NotesGraph — orchestrator + modal + 10-state machine (C4).
// Keyboard nav + structured list/table a11y = C5. Premium mobile
// cluster cards = C6. This C4 layer ships every state with real copy
// (no blank modal, no dead controls) + a functional minimal list view
// so the "List" toolbar button is never a coming-soon stub.
// ─────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";

  const OVERLAY_ID = "notesGraphOverlay";
  const PANEL_ID = "notesGraphPanel";
  const LOAD_TIMEOUT_MS = 10000;
  const FILTER_SS_KEY = "graphFilters_v1";   // sessionStorage (Λ5)

  // a11y primitives — inline copy of the quiz-ui pattern (Λ2 decision:
  // no shared module; ~40 LOC duplication accepted).
  const FOCUSABLE = [
    "a[href]", "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])", "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  let previouslyFocused = null;

  function focusablesIn(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE))
      .filter((el) => (!el.hasAttribute("disabled") && el.offsetParent !== null) ||
                      el === document.activeElement);
  }
  function installFocusTrap(panel) {
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const items = focusablesIn(panel);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const a = document.activeElement;
      if (e.shiftKey) {
        if (a === first || !panel.contains(a)) { e.preventDefault(); last.focus(); }
      } else {
        if (a === last || !panel.contains(a)) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function T(key, fallback, vars) {
    let s = fallback;
    try {
      if (typeof window !== "undefined" && typeof window.t === "function") {
        const v = window.t(key);
        if (typeof v === "string" && v !== key) s = v;
      }
    } catch (_) {}
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", String(vars[k]));
    return s;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toast(msg, kind) {
    try {
      if (typeof window !== "undefined" && typeof window.showToast === "function") {
        window.showToast(msg, kind || "info");
      }
    } catch (_) {}
  }

  function isFullGraphAllowed() {
    try {
      return window.matchMedia("(min-width: 1024px)").matches &&
             window.matchMedia("(orientation: landscape)").matches;
    } catch (_) { return true; }
  }

  function loadFilters() {
    try {
      const raw = sessionStorage.getItem(FILTER_SS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { note: true, text: true, sentence: true, root: true, word: true, binyan: true };
  }
  function saveFilters(f) {
    try { sessionStorage.setItem(FILTER_SS_KEY, JSON.stringify(f)); } catch (_) {}
  }

  let _renderHandle = null;
  let _loadTimer = null;
  // C2 (v3.4) — pending "spotlight this node" request from a deep-link
  // (note editor → graph). Node id form is `${kind}:${rawId}`. Consumed
  // once in the loaded branch; cleared on every open and on destroy so
  // a stale request never applies to a later session.
  let _focusReq = null;

  function destroy() {
    _focusReq = null;
    if (_loadTimer) { clearTimeout(_loadTimer); _loadTimer = null; }
    if (_renderHandle && typeof _renderHandle.destroy === "function") {
      try { _renderHandle.destroy(); } catch (_) {}
      _renderHandle = null;
    }
    const ov = document.getElementById(OVERLAY_ID);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    try {
      if (previouslyFocused && document.body.contains(previouslyFocused) &&
          typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    } catch (_) {}
    previouslyFocused = null;
  }

  function buildShell() {
    if (!document.getElementById(OVERLAY_ID)) {
      try { previouslyFocused = document.activeElement; } catch (_) {}
    }
    destroy();
    const ov = document.createElement("div");
    ov.id = OVERLAY_ID;
    ov.setAttribute("data-graph-overlay", "1");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10500;display:flex;align-items:stretch;justify-content:center;padding:24px;overflow:auto;";
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "notesGraphTitle");
    panel.setAttribute("data-graph-panel", "1");
    panel.style.cssText = "background:var(--theme-bg,#fff);color:var(--theme-text,#000);border-radius:12px;max-width:1100px;width:100%;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.35);overflow:hidden;";
    ov.appendChild(panel);
    document.body.appendChild(ov);
    ov.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); destroy(); }
    });
    installFocusTrap(panel);
    return panel;
  }

  function header(panel, extraHtml) {
    return (
      `<div style="display:flex;align-items:center;justify-content:space-between;` +
      `padding:14px 18px;border-bottom:1px solid var(--theme-border,#e2e2e2);">` +
        `<h3 id="notesGraphTitle" style="margin:0;font-size:16px;">` +
          esc(T("graph.title", "Карта знаний")) + `</h3>` +
        `<div style="display:flex;gap:6px;align-items:center;">` + (extraHtml || "") +
          `<button type="button" data-graph-help="1" aria-label="${esc(T("graph.toolbar.help", "Помощь"))}" ` +
            `style="background:transparent;border:1px solid var(--theme-border,#ccc);border-radius:6px;padding:4px 8px;cursor:pointer;">❓</button>` +
          `<button type="button" data-graph-close="1" aria-label="${esc(T("graph.toolbar.close", "Закрыть"))}" ` +
            `style="background:transparent;border:none;font-size:20px;cursor:pointer;color:#888;">×</button>` +
        `</div>` +
      `</div>`
    );
  }

  function wireCommon(panel) {
    const closeBtn = panel.querySelector("[data-graph-close]");
    if (closeBtn) closeBtn.addEventListener("click", destroy);
    const helpBtn = panel.querySelector("[data-graph-help]");
    if (helpBtn) helpBtn.addEventListener("click", () => openHelp(panel));
  }

  function renderState(panel, state, payload) {
    panel.setAttribute("data-graph-state", state);

    if (state === "loading") {
      // U6 (v3.4) — a graph-shaped skeleton instead of a bare spinner:
      // faint placeholder nodes + edges shimmer behind the spinner so
      // the loading state previews the thing being built. SVG is
      // aria-hidden; the role=status text is the AT signal. Honors
      // prefers-reduced-motion (no shimmer, no spin).
      const sk = [
        [70, 60], [180, 40], [120, 130], [250, 110], [60, 170],
        [210, 180], [150, 70], [30, 90],
      ];
      const skEdges = [[0, 6], [6, 1], [6, 2], [2, 4], [2, 5], [1, 3], [0, 7]];
      const skNodes = sk.map(([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 13 : 9}" ` +
        `class="graph-sk-node" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`).join("");
      const skLines = skEdges.map(([a, b]) =>
        `<line x1="${sk[a][0]}" y1="${sk[a][1]}" x2="${sk[b][0]}" y2="${sk[b][1]}" ` +
        `class="graph-sk-edge"/>`).join("");
      panel.innerHTML = header(panel) +
        `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px;` +
        `flex-direction:column;gap:18px;" role="status" aria-live="polite">` +
          `<svg viewBox="0 0 290 220" width="260" height="200" aria-hidden="true" ` +
          `style="max-width:70%;opacity:.65;">${skLines}${skNodes}</svg>` +
          `<div style="display:flex;align-items:center;gap:10px;">` +
            `<div class="graph-spinner" aria-hidden="true" style="width:22px;height:22px;border:3px solid var(--theme-border,#ddd);` +
            `border-top-color:var(--theme-accent,#0a5);border-radius:50%;animation:graphspin 0.8s linear infinite;"></div>` +
            `<div>${esc(T("graph.state.loading", "Загружаем карту знаний…"))}</div>` +
          `</div>` +
          `<button type="button" class="btn-secondary" data-graph-close="1">${esc(T("graph.toolbar.close", "Закрыть"))}</button>` +
        `</div>` +
        `<style>@keyframes graphspin{to{transform:rotate(360deg)}}` +
        `@keyframes graphskpulse{0%,100%{opacity:.25}50%{opacity:.7}}` +
        `.graph-sk-node{fill:var(--theme-accent,#0a5);animation:graphskpulse 1.4s ease-in-out infinite}` +
        `.graph-sk-edge{stroke:var(--theme-border,#bbb);stroke-width:2}` +
        `@media (prefers-reduced-motion: reduce){.graph-spinner{animation:none}` +
        `.graph-sk-node{animation:none;opacity:.4}}</style>`;
      wireCommon(panel);
      return;
    }

    if (state === "empty_no_notes" || state === "empty_no_links" ||
        state === "filtered_all_hidden" ||
        state === "error_data_load" || state === "error_db_unavailable") {
      const copyKey =
        state === "empty_no_notes"  ? "graph.state.empty.noNotes" :
        state === "empty_no_links"  ? "graph.state.empty.noLinks" :
        state === "filtered_all_hidden" ? "graph.state.filtered.allHidden" :
                                       "graph.state.error.dataLoad";
      const copyFallback =
        state === "empty_no_notes"  ? "Пока нет заметок для карты знаний. Добавьте заметки и ссылки [[…]] в библиотеке, чтобы увидеть граф." :
        state === "empty_no_links"  ? "Пока нет связей для карты знаний. Добавьте ссылки [[…]] в заметках, чтобы увидеть граф." :
        state === "filtered_all_hidden" ? "Фильтр скрывает все элементы. Сбросьте фильтры." :
                                       "Карта знаний временно недоступна. Проверьте локальное хранилище и повторите попытку.";
      const isError = state.indexOf("error") === 0;
      const isFilter = state === "filtered_all_hidden";
      const isEmpty = state === "empty_no_notes" || state === "empty_no_links";
      // U8 (v3.4) — turn the empty graph into the teaching surface for
      // the create → [[link]] → map loop. Copy-only; the graph stays
      // read-only (no note/link creation from the canvas).
      const teach = isEmpty
        ? `<div style="max-width:440px;text-align:left;background:var(--theme-accent-bg,#eef2ff);` +
          `border-radius:10px;padding:14px 18px;line-height:1.55;font-size:13px;">` +
            `<div style="font-weight:600;margin-bottom:8px;">` +
              `${esc(T("graph.state.empty.teach.title", "Как наполнить карту знаний"))}</div>` +
            `<ol style="margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:5px;">` +
              `<li>${esc(T("graph.state.empty.teach.step1", "Откройте строку текста и создайте заметку."))}</li>` +
              `<li>${esc(T("graph.state.empty.teach.step2", "В заметке введите [[ — появится подсказка; выберите заметку, текст или корень."))}</li>` +
              `<li>${esc(T("graph.state.empty.teach.step3", "Сохраните — связь появится здесь, на карте знаний."))}</li>` +
            `</ol>` +
          `</div>`
        : "";
      panel.innerHTML = header(panel) +
        `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:48px;` +
        `flex-direction:column;gap:16px;text-align:center;" role="status" aria-live="polite">` +
          `<div style="font-size:40px;" aria-hidden="true">${isError ? "⚠️" : "🕸"}</div>` +
          `<p style="margin:0;max-width:420px;line-height:1.5;">${esc(T(copyKey, copyFallback))}</p>` +
          teach +
          `<div style="display:flex;gap:8px;">` +
            (isFilter ? `<button type="button" class="btn-primary" data-graph-clearfilters="1">${esc(T("graph.toolbar.clearFilters", "Сбросить фильтры"))}</button>` : "") +
            (isError ? `<button type="button" class="btn-primary" data-graph-retry="1">${esc(T("graph.toolbar.retry", "Повторить"))}</button>` : "") +
            `<button type="button" class="btn-secondary" data-graph-close="1">${esc(T("graph.toolbar.close", "Закрыть"))}</button>` +
          `</div>` +
        `</div>`;
      wireCommon(panel);
      const retry = panel.querySelector("[data-graph-retry]");
      if (retry) retry.addEventListener("click", () => { destroy(); open(); });
      const cf = panel.querySelector("[data-graph-clearfilters]");
      if (cf) cf.addEventListener("click", () => {
        saveFilters({ note: true, text: true, sentence: true, root: true, word: true, binyan: true });
        destroy(); open();
      });
      // Initial focus → primary action.
      const primary = panel.querySelector("[data-graph-retry],[data-graph-clearfilters],[data-graph-close]");
      if (primary) primary.focus();
      return;
    }

    if (state === "fallback_mobile") {
      // C6 — premium mobile: searchable, collapsible cluster cards.
      const g = payload.graph;
      const clusters = buildClusters(g);
      panel.innerHTML = header(panel) +
        `<div style="flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;">` +
          `<div style="background:var(--theme-accent-bg,#eef);border-radius:8px;padding:11px 14px;line-height:1.5;font-size:13px;">` +
            `${esc(T("graph.fallback.headline", "Полный граф доступен на планшете или ПК в альбомной ориентации."))}` +
          `</div>` +
          `<p style="margin:0;color:var(--theme-text-secondary,#666);line-height:1.45;font-size:12.5px;">` +
            `${esc(T("graph.fallback.listHint", "Здесь карта знаний по кластерам."))}` +
          `</p>` +
          `<input type="search" data-graph-cluster-search="1" ` +
            `placeholder="${esc(T("graph.fallback.searchPlaceholder", "Поиск…"))}" ` +
            `aria-label="${esc(T("graph.fallback.searchPlaceholder", "Поиск…"))}" ` +
            `style="width:100%;padding:9px 12px;border:1px solid var(--theme-border,#ccc);border-radius:8px;font-size:14px;box-sizing:border-box;">` +
          `<div data-graph-cluster-count="1" role="status" aria-live="polite" ` +
            `style="font-size:12px;color:var(--theme-text-secondary,#666);">` +
            esc(T("graph.fallback.clustersFound", "Найдено {n} кластеров", { n: clusters.length })) +
          `</div>` +
          `<div data-graph-cluster-list="1" style="display:flex;flex-direction:column;gap:10px;"></div>` +
        `</div>`;
      wireCommon(panel);
      _renderClusterCards(panel, clusters, g, "");

      const searchEl = panel.querySelector("[data-graph-cluster-search]");
      if (searchEl) {
        let _deb = null;
        searchEl.addEventListener("input", () => {
          if (_deb) clearTimeout(_deb);
          _deb = setTimeout(() => {
            _renderClusterCards(panel, clusters, g, searchEl.value || "");
          }, 160);
        });
      }
      return;
    }

    if (state === "loaded") {
      const g = payload.graph;
      const reducedToast = payload.reduced
        ? `<div data-graph-reduced-toast="1" role="status" aria-live="polite" ` +
          `style="background:#fff8e1;border:1px solid #ffe08a;border-radius:6px;padding:8px 10px;font-size:12.5px;margin:0 0 8px 0;">` +
          esc(T("graph.toast.reducedToTopN",
            "Показаны 200 самых связанных элементов из {n}. Полный список доступен в режиме списка.",
            { n: payload.reduced.total })) + `</div>`
        : "";
      const zg = "min-width:40px;height:34px;font-size:15px;line-height:1;";
      const toolbar =
        `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-bottom:1px solid var(--theme-border,#e2e2e2);align-items:center;">` +
          `<button type="button" class="btn-secondary" data-graph-reset="1">${esc(T("graph.toolbar.reset", "Сбросить вид"))}</button>` +
          `<button type="button" class="btn-secondary" data-graph-clearfilters="1">${esc(T("graph.toolbar.clearFilters", "Сбросить фильтры"))}</button>` +
          `<button type="button" class="btn-secondary" data-graph-toggle-list="1" aria-pressed="false">${esc(T("graph.toolbar.listView", "Список"))}</button>` +
          `<button type="button" class="btn-secondary" data-graph-legend="1" aria-pressed="false">${esc(T("graph.toolbar.legend", "Легенда"))}</button>` +
          `<span style="flex:1"></span>` +
          // U4: visible zoom controls (touch/tablet where wheel is awkward)
          `<button type="button" class="btn-secondary" data-graph-zoomout="1" style="${zg}" aria-label="${esc(T("graph.toolbar.zoomOut", "Уменьшить"))}" title="${esc(T("graph.toolbar.zoomOut", "Уменьшить"))}">−</button>` +
          `<button type="button" class="btn-secondary" data-graph-zoomin="1" style="${zg}" aria-label="${esc(T("graph.toolbar.zoomIn", "Увеличить"))}" title="${esc(T("graph.toolbar.zoomIn", "Увеличить"))}">＋</button>` +
          `<button type="button" class="btn-secondary" data-graph-fit="1" style="${zg}" aria-label="${esc(T("graph.toolbar.fit", "По размеру"))}" title="${esc(T("graph.toolbar.fit", "По размеру"))}">⤢</button>` +
        `</div>`;
      // U5 + U7 (v3.4) — second toolbar row: node search (with `/`
      // jump-to) + per-kind filter chips that mirror the legend.
      // Read-only: search just focuses an existing node (reuses the C2
      // focusNode path); chips persist via the existing sessionStorage
      // filter model + re-open (same mechanism as "clear filters").
      const _flt = loadFilters();
      const _present = ["note", "text", "sentence", "root", "word", "binyan"]
        .filter((k) => (g.stats && g.stats.by_kind && g.stats.by_kind[k]) > 0);
      const chips = _present.map((k) => {
        const on = _flt[k] !== false;
        return `<button type="button" class="btn-secondary" data-graph-filter-chip="${k}" ` +
          `aria-pressed="${on ? "true" : "false"}" ` +
          `style="padding:3px 10px;font-size:12px;border-radius:999px;${on ? "" : "opacity:.5;"}">` +
          `${esc(T("graph.legend.nodes." + k, k))}</button>`;
      }).join("");
      // Phase 5 — edge-LAYER chip: toggles the computed suggested
      // (shared-root/lemma) layer. Reuses the generic chip wiring
      // (data-graph-filter-chip) → flips filters.edgeSuggested →
      // re-open (same mechanism as the node-kind chips). Default on.
      const _sgOn = _flt.edgeSuggested !== false;
      const _sgTitle = esc(T("graph.toolbar.suggestedLayerTitle",
        "Пунктир — возможные связи (общий корень/лемма). Подтвердите их в заметке, в панели «Подтвердите связи»."));
      const suggChip =
        `<button type="button" class="btn-secondary" data-graph-filter-chip="edgeSuggested" ` +
        `aria-pressed="${_sgOn ? "true" : "false"}" title="${_sgTitle}" aria-label="${_sgTitle}" ` +
        `style="padding:3px 10px;font-size:12px;border-radius:999px;` +
        `border-style:dashed;${_sgOn ? "" : "opacity:.5;"}">` +
        `${esc(T("graph.toolbar.suggestedLayer", "Подсказки связей"))}</button>`;
      // Phase 7 (A5) — learning-state overlay toggle chip (default-on).
      const _loOn = _flt.learnOverlay !== false;
      const _loTitle = esc(T("graph.toolbar.activityOverlayTitle",
        "Цветное кольцо вокруг заметки = насколько вы её усвоили (по тренировкам SRS)."));
      const learnChip =
        `<button type="button" class="btn-secondary" data-graph-filter-chip="learnOverlay" ` +
        `aria-pressed="${_loOn ? "true" : "false"}" title="${_loTitle}" aria-label="${_loTitle}" ` +
        `style="padding:3px 10px;font-size:12px;border-radius:999px;` +
        `border-style:dotted;${_loOn ? "" : "opacity:.5;"}">` +
        `${esc(T("graph.toolbar.activityOverlay", "Прогресс"))}</button>`;
      const toolbar2 =
        `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px;border-bottom:1px solid var(--theme-border,#e2e2e2);align-items:center;">` +
          `<input type="search" data-graph-node-search="1" ` +
          `placeholder="${esc(T("graph.toolbar.searchPlaceholder", "Поиск узла…  (/)"))}" ` +
          `aria-label="${esc(T("graph.toolbar.searchPlaceholder", "Поиск узла…"))}" ` +
          `style="flex:0 1 220px;min-width:140px;padding:6px 10px;border:1px solid var(--theme-border,#ccc);` +
          `border-radius:6px;font-size:13px;box-sizing:border-box;">` +
          `<span data-graph-search-count="1" role="status" aria-live="polite" ` +
          `style="font-size:12px;color:var(--theme-text-secondary,#888);min-width:60px;"></span>` +
          `<span style="flex:1"></span>` +
          (chips ? `<span style="font-size:12px;color:var(--theme-text-secondary,#888);margin-inline-end:4px;">` +
            `${esc(T("graph.toolbar.filterLabel", "Показывать:"))}</span>` + chips : "") +
          suggChip + learnChip +
        `</div>`;
      panel.innerHTML = header(panel) + toolbar + toolbar2 +
        `<div style="flex:1;display:flex;min-height:480px;position:relative;">` +
          // role="group" (NOT "application"): the canonical screen-reader
          // path is the always-present structured table below; forcing
          // focus-mode via role="application" was unverifiable and a
          // potential SR regression, so we use the safe default. Sighted
          // keyboard users still get arrow-key node nav (real keydown
          // handler, tabindex=0 — independent of the role). Decision
          // recorded 2026-05-16; see PHASE_PLAN_v3_3_6 §"role decision".
          `<div data-graph-canvas="1" role="group" ` +
          `aria-label="${esc(T("graph.a11yContainer", "Карта знаний", { nodes: g.stats.nodes_total, edges: g.stats.edges_total }))}" ` +
          `style="flex:1;min-height:480px;position:relative;"></div>` +
          // U1: hover/focus detail rail (canonical extra-info surface;
          // role=status aria-live so SR users hear the focused node).
          `<aside data-graph-detail="1" role="status" aria-live="polite" ` +
          `style="width:240px;flex:none;border-left:1px solid var(--theme-border,#e2e2e2);` +
          `padding:14px;overflow:auto;font-size:12.5px;line-height:1.55;">` +
            `<div data-graph-detail-empty="1" style="color:var(--theme-text-secondary,#888);">` +
            esc(T("graph.detail.empty", "Наведите или сфокусируйте узел, чтобы увидеть детали.")) +
            `</div></aside>` +
          `<div data-graph-listpane="1" hidden style="flex:1;overflow:auto;padding:12px;"></div>` +
        `</div>` +
        `<div data-graph-summary="1" role="status" aria-live="polite" ` +
          `style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;">` +
          esc(T("graph.summary", "{notes} заметок", {
            notes: g.stats.by_kind.note, texts: g.stats.by_kind.text,
            roots: g.stats.by_kind.root, words: g.stats.by_kind.word,
            binyanim: g.stats.by_kind.binyan, sentences: g.stats.by_kind.sentence,
            edges: g.stats.edges_total })) +
        `</div>` +
        // Canonical AT path: an always-present structured table mirroring
        // the graph (the SVG itself is aria-hidden). Screen-reader users
        // navigate this; sighted users see the force graph + optional
        // visible list toggle. clip-based sr-only (no -9999px which can
        // cause horizontal scroll / focus jumps).
        `<div data-graph-at-table="1" aria-label="${esc(T("graph.title", "Карта знаний"))}" ` +
          `style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;">` +
          renderListView(g) +
        `</div>`;
      wireCommon(panel);

      const canvas = panel.querySelector("[data-graph-canvas]");
      if (reducedToast) {
        const tw = document.createElement("div");
        tw.innerHTML = reducedToast;
        canvas.parentNode.insertBefore(tw.firstChild, canvas.parentNode.firstChild);
      }
      // v3.5 Fix 3 — sparse (no `[[` links yet) → dismissible teaching
      // banner instead of the old blocking empty card. The entities are
      // already on the canvas; this just nudges toward richer linking.
      if (payload.sparse) {
        const bw = document.createElement("div");
        bw.setAttribute("data-graph-sparse-banner", "1");
        bw.setAttribute("role", "status");
        bw.style.cssText =
          "background:var(--theme-accent-bg,#eef2ff);border:1px solid var(--theme-border,#dde);" +
          "border-radius:6px;padding:8px 10px;font-size:12.5px;line-height:1.5;" +
          "margin:0 0 8px 0;display:flex;gap:10px;align-items:flex-start;";
        bw.innerHTML =
          `<span style="flex:1;">${esc(T("graph.state.empty.teach.title", "Как наполнить карту знаний"))}: ` +
          `${esc(T("graph.state.empty.teach.step2", "В заметке введите [[ — выберите заметку, текст или корень."))}</span>` +
          `<button type="button" data-graph-sparse-dismiss="1" aria-label="${esc(T("graph.toolbar.close", "Закрыть"))}" ` +
          `style="border:none;background:transparent;cursor:pointer;font-size:15px;line-height:1;">×</button>`;
        canvas.parentNode.insertBefore(bw, canvas.parentNode.firstChild);
        const db = bw.querySelector("[data-graph-sparse-dismiss]");
        if (db) db.addEventListener("click", () => bw.remove());
      }
      const byId = new Map(g.nodes.map((n) => [n.id, n]));
      try {
        _renderHandle = window.NotesGraphRender.renderGraph(canvas, g, {
          // Read-only navigation (no edit affordance anywhere).
          onNodeActivate(n) { const real = byId.get(n.id) || n; navigateTo(real); },
          // H toggles cluster isolate / show-all.
          onClusterIsolate(n) {
            if (!_renderHandle) return;
            if (_renderHandle.isIsolated && _renderHandle.isIsolated()) {
              _renderHandle.showAll();
            } else if (_renderHandle.isolateCluster) {
              _renderHandle.isolateCluster(n.id);
            }
          },
          // R resets view.
          onReset() { if (_renderHandle && _renderHandle.resetView) _renderHandle.resetView(); },
          // U1: hover/focus → fill the detail rail.
          onNodeDetail(d) { _renderDetail(panel, d); },
          // UX (v3.6 polish): plain-language native <title> on every
          // edge so a student hovering a line learns what it MEANS
          // (esp. the faint dashed "suggested" lines). Tooltip only —
          // zero pixel change, no baseline churn. i18n via T().
          edgeTitle(edge) {
            switch (edge.edge_kind) {
              case "auto_shared_root":
                return T("graph.edgeHelp.sharedRoot",
                  "Возможная связь: общий корень {t}. Подтвердите её в заметке.",
                  { t: edge.evidence || "" });
              case "auto_shared_lemma":
                return T("graph.edgeHelp.sharedLemma",
                  "Возможная связь: общая лемма {t}. Подтвердите её в заметке.",
                  { t: edge.evidence || "" });
              case "explicit_link":
                return T("graph.edgeHelp.explicit", "Подтверждённая связь.");
              case "auto_text":
                return T("graph.edgeHelp.autoText", "Заметка относится к этому тексту.");
              case "derived_morph":
                return T("graph.edgeHelp.morph", "Связь по морфологии (корень/биньян/слово).");
              case "target_anchor":
                return T("graph.edgeHelp.anchor", "Заметка о тексте/строке.");
              default: return "";
            }
          },
        });
      } catch (e) {
        console.error("[graph] render failed:", e);
        renderState(panel, "error_data_load", {});
        return;
      }
      // SVG-node tap→navigate is owned by the renderer (single owner of
      // tap-vs-drag disambiguation; see notes-graph-render.js endDrag).
      // The orchestrator only wires the always-present AT table.
      wireListNav(panel, g);

      // C2 (v3.4) — consume a pending deep-link spotlight. Defer until
      // the first layout settle so the node has coordinates to centre
      // on. One-shot: cleared whether or not the node still exists
      // (it may have been filtered out or deleted since the link).
      if (_focusReq) {
        const want = _focusReq;
        _focusReq = null;
        if (byId.has(want)) {
          setTimeout(() => {
            try {
              if (_renderHandle && typeof _renderHandle.focusNode === "function") {
                _renderHandle.focusNode(want);
              }
            } catch (_) {}
          }, 350);
        }
      }

      panel.querySelector("[data-graph-reset]").addEventListener("click", () => {
        if (_renderHandle && _renderHandle.resetView) _renderHandle.resetView();
      });
      panel.querySelector("[data-graph-clearfilters]").addEventListener("click", () => {
        saveFilters({ note: true, text: true, sentence: true, root: true, word: true, binyan: true });
        destroy(); open();
      });
      // U4: visible zoom controls.
      const zin = panel.querySelector("[data-graph-zoomin]");
      const zout = panel.querySelector("[data-graph-zoomout]");
      const zfit = panel.querySelector("[data-graph-fit]");
      if (zin)  zin.addEventListener("click",  () => { _renderHandle && _renderHandle.zoomBy && _renderHandle.zoomBy(1.25); });
      if (zout) zout.addEventListener("click", () => { _renderHandle && _renderHandle.zoomBy && _renderHandle.zoomBy(0.8); });
      if (zfit) zfit.addEventListener("click", () => { _renderHandle && _renderHandle.fitView && _renderHandle.fitView(); });
      const listBtn = panel.querySelector("[data-graph-toggle-list]");
      const listPane = panel.querySelector("[data-graph-listpane]");
      listBtn.addEventListener("click", () => {
        const showing = !listPane.hasAttribute("hidden");
        if (showing) {
          listPane.setAttribute("hidden", "");
          canvas.style.display = "";
          listBtn.setAttribute("aria-pressed", "false");
        } else {
          listPane.innerHTML = renderListView(g);
          listPane.removeAttribute("hidden");
          canvas.style.display = "none";
          listBtn.setAttribute("aria-pressed", "true");
          wireListNav(panel, g);
        }
      });
      panel.querySelector("[data-graph-legend]").addEventListener("click", () => openLegend(panel));

      // U7 — filter chips: toggle a kind, persist, re-open (the filter
      // is applied in open(); same mechanism as "clear filters").
      panel.querySelectorAll("[data-graph-filter-chip]").forEach((chip) => {
        chip.addEventListener("click", () => {
          const k = chip.getAttribute("data-graph-filter-chip");
          const f = loadFilters();
          f[k] = (f[k] === false); // flip: hidden→shown, shown→hidden
          saveFilters(f);
          destroy(); open();
        });
      });

      // U5 — node search + `/` jump-to. Pure navigation: matches by
      // label substring and focuses the node (reuses C2 focusNode →
      // isolate + focus + detail/SR). No graph mutation.
      const searchEl = panel.querySelector("[data-graph-node-search]");
      const countEl = panel.querySelector("[data-graph-search-count]");
      const _matches = (q) => {
        const s = String(q || "").trim().toLowerCase();
        if (!s) return [];
        return g.nodes.filter((n) =>
          String(n.label || "").toLowerCase().indexOf(s) !== -1).slice(0, 50);
      };
      const _jump = () => {
        const m = _matches(searchEl && searchEl.value);
        if (countEl) {
          countEl.textContent = (searchEl && searchEl.value.trim())
            ? T("graph.toolbar.searchCount", "{n} найдено", { n: m.length })
            : "";
        }
        if (m.length && _renderHandle && typeof _renderHandle.focusNode === "function") {
          _renderHandle.focusNode(m[0].id);
        }
      };
      if (searchEl) {
        searchEl.addEventListener("input", () => {
          const m = _matches(searchEl.value);
          if (countEl) {
            countEl.textContent = searchEl.value.trim()
              ? T("graph.toolbar.searchCount", "{n} найдено", { n: m.length })
              : "";
          }
        });
        searchEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); _jump(); }
          else if (e.key === "Escape") { searchEl.value = ""; if (countEl) countEl.textContent = ""; searchEl.blur(); }
        });
      }
      // `/` anywhere in the graph (not already typing) focuses search.
      panel.addEventListener("keydown", (e) => {
        if (e.key !== "/" || !searchEl) return;
        const tag = (e.target && e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        e.preventDefault();
        searchEl.focus();
      });

      // Initial focus → first toolbar control (canvas keyboard nav is C5).
      const firstBtn = panel.querySelector("[data-graph-reset]");
      if (firstBtn) firstBtn.focus();
      return;
    }
  }

  // Minimal but FUNCTIONAL list view (not a coming-soon stub). C5
  // upgrades it with full keyboard semantics + neighbor columns.
  // ── clustering (C6 premium mobile fallback) ───────────────────────────
  // Connected components over all edge kinds. Each cluster carries its
  // dominant node (highest degree), dominant kind (modal kind), and the
  // top-3 connected labels — everything the cluster card surfaces.
  function buildClusters(g) {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const adj = new Map();
    for (const n of g.nodes) adj.set(n.id, []);
    for (const e of g.edges) {
      if (adj.has(e.source)) adj.get(e.source).push(e.target);
      if (adj.has(e.target)) adj.get(e.target).push(e.source);
    }
    const seen = new Set();
    const clusters = [];
    // Deterministic order: start BFS from nodes sorted by degree desc.
    const order = g.nodes.slice()
      .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
    for (const start of order) {
      if (seen.has(start.id)) continue;
      const members = [];
      const q = [start.id]; seen.add(start.id);
      while (q.length) {
        const cur = q.shift();
        members.push(byId.get(cur));
        for (const nb of (adj.get(cur) || [])) {
          if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
        }
      }
      let edgeCount = 0;
      const memberSet = new Set(members.map((m) => m.id));
      for (const e of g.edges) {
        if (memberSet.has(e.source) && memberSet.has(e.target)) edgeCount++;
      }
      const kindCount = {};
      for (const m of members) kindCount[m.kind] = (kindCount[m.kind] || 0) + 1;
      const dominantKind = Object.keys(kindCount)
        .sort((a, b) => kindCount[b] - kindCount[a] || a.localeCompare(b))[0];
      const dominantNode = members.slice()
        .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))[0];
      const top3 = (adj.get(dominantNode.id) || [])
        .map((id) => byId.get(id)).filter(Boolean)
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 3).map((n) => n.label);
      clusters.push({
        id: "cl:" + start.id, members, edgeCount,
        dominantKind, dominantNode, top3,
        searchBlob: members.map((m) => (m.label || "") + " " + (m.rawId || ""))
          .join(" ").toLowerCase(),
      });
    }
    // Largest clusters first.
    clusters.sort((a, b) => b.members.length - a.members.length);
    return clusters;
  }

  function _clusterSubgraph(cluster, g, cap) {
    const ids = new Set(cluster.members.slice(0, cap).map((m) => m.id));
    return {
      nodes: cluster.members.filter((m) => ids.has(m.id))
        .map((m) => Object.assign({}, m)),
      edges: g.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
      stats: g.stats, reduced: null,
    };
  }

  function _renderClusterCards(panel, clusters, g, query) {
    const list = panel.querySelector("[data-graph-cluster-list]");
    const countEl = panel.querySelector("[data-graph-cluster-count]");
    if (!list) return;
    const q = String(query || "").trim().toLowerCase();
    const filtered = q ? clusters.filter((c) => c.searchBlob.indexOf(q) !== -1)
                       : clusters;
    if (countEl) {
      countEl.textContent = T("graph.fallback.clustersFound",
        "Найдено {n} кластеров", { n: filtered.length });
    }
    list.innerHTML = filtered.map((c, i) => {
      const dn = c.dominantNode;
      const kindLabel = T("graph.legend.nodes." + c.dominantKind, c.dominantKind);
      const chips = c.top3.map((lbl) =>
        `<span style="display:inline-block;background:var(--theme-accent-bg,#eef);` +
        `border-radius:10px;padding:2px 8px;font-size:11px;margin:0 4px 4px 0;">` +
        esc(String(lbl).slice(0, 22)) + `</span>`).join("");
      return (
        `<div data-graph-cluster-card="${esc(c.id)}" ` +
        `style="border:1px solid var(--theme-border,#ddd);border-radius:10px;overflow:hidden;">` +
          `<button type="button" data-cluster-toggle="${esc(c.id)}" aria-expanded="false" ` +
          `style="width:100%;text-align:left;background:transparent;border:none;cursor:pointer;` +
          `padding:12px 14px;display:flex;flex-direction:column;gap:6px;">` +
            `<span style="font-weight:600;font-size:13.5px;">` +
              esc(T("graph.legend.nodes." + c.dominantKind, c.dominantKind)) + ` · ` +
              esc(String(dn.label).slice(0, 28)) +
            `</span>` +
            `<span style="font-size:11.5px;color:var(--theme-text-secondary,#666);">` +
              `${c.members.length} ${esc(T("graph.listView.degree", "узлов"))} · ` +
              `${c.edgeCount} ${esc(T("graph.legend.title", "связей"))}` +
            `</span>` +
            (chips ? `<span style="margin-top:2px;">${chips}</span>` : "") +
          `</button>` +
          `<div data-cluster-body="${esc(c.id)}" hidden style="border-top:1px solid var(--theme-border,#eee);padding:12px;">` +
            `<div data-cluster-mini="${esc(c.id)}" style="width:100%;height:220px;"></div>` +
            `<button type="button" data-cluster-open="${esc(c.id)}" class="btn-primary" ` +
            `style="margin-top:10px;width:100%;">` +
              esc(T("graph.toolbar.graphView", "Открыть в библиотеке")) +
            `</button>` +
          `</div>` +
        `</div>`
      );
    }).join("") || `<div style="color:var(--theme-text-secondary,#666);font-size:13px;">` +
      esc(T("graph.fallback.clustersFound", "Найдено {n} кластеров", { n: 0 })) + `</div>`;

    const byClId = new Map(filtered.map((c) => [c.id, c]));
    list.querySelectorAll("[data-cluster-toggle]").forEach((btn) => {
      const cid = btn.getAttribute("data-cluster-toggle");
      btn.addEventListener("click", () => {
        const body = list.querySelector(`[data-cluster-body="${CSS.escape(cid)}"]`);
        if (!body) return;
        const willOpen = body.hasAttribute("hidden");
        if (willOpen) {
          body.removeAttribute("hidden");
          btn.setAttribute("aria-expanded", "true");
          const mini = body.querySelector(`[data-cluster-mini="${CSS.escape(cid)}"]`);
          const cl = byClId.get(cid);
          if (mini && cl && window.NotesGraphRender) {
            try {
              window.NotesGraphRender.renderGraph(mini,
                _clusterSubgraph(cl, g, 50), {});
            } catch (e) { console.warn("[graph] mini render:", e); }
          }
        } else {
          body.setAttribute("hidden", "");
          btn.setAttribute("aria-expanded", "false");
        }
      });
    });
    list.querySelectorAll("[data-cluster-open]").forEach((b) => {
      const cid = b.getAttribute("data-cluster-open");
      b.addEventListener("click", () => {
        const cl = byClId.get(cid);
        if (cl && cl.dominantNode) navigateTo(cl.dominantNode);
      });
    });
  }

  // U1: detail rail content. d is the renderer's detail object or null.
  function _renderDetail(panel, d) {
    const rail = panel.querySelector("[data-graph-detail]");
    if (!rail) return;
    if (!d) {
      rail.innerHTML = `<div data-graph-detail-empty="1" ` +
        `style="color:var(--theme-text-secondary,#888);">` +
        esc(T("graph.detail.empty", "Наведите или сфокусируйте узел, чтобы увидеть детали.")) +
        `</div>`;
      return;
    }
    const kindLabel = T("graph.legend.nodes." + d.kind, d.kind);
    const nb = (d.neighbours || []).map((x) =>
      `<li style="margin:2px 0;">${esc(T("graph.legend.nodes." + x.kind, x.kind))}: ` +
      `${esc(String(x.label).slice(0, 30))}</li>`).join("");
    const metaRows = Object.keys(d.meta || {})
      .filter((k) => d.meta[k] != null && d.meta[k] !== "")
      .slice(0, 6)
      .map((k) => `<div><b>${esc(k)}:</b> ${esc(String(d.meta[k]).slice(0, 40))}</div>`)
      .join("");
    rail.innerHTML =
      `<div data-graph-detail-node="${esc(d.id)}">` +
        `<div style="font-weight:700;font-size:13.5px;margin-bottom:2px;">${esc(d.label)}</div>` +
        `<div style="color:var(--theme-text-secondary,#666);margin-bottom:8px;">${esc(kindLabel)}</div>` +
        `<div><b>${esc(T("graph.detail.degree", "Связей"))}:</b> ${d.degree} ` +
          `(${esc(T("graph.detail.in", "вх"))} ${d.inDegree} / ${esc(T("graph.detail.out", "исх"))} ${d.outDegree})</div>` +
        (d.pinned ? `<div style="color:var(--theme-accent,#0a5);margin-top:4px;">📌 ` +
          esc(T("graph.detail.pinnedHint", "Закреплён — двойной клик снимает")) + `</div>` : "") +
        (d.learn ? `<div data-detail-learn="${esc(d.learn)}" style="margin-top:6px;">` +
          `<b>${esc(T("graph.legend.learnTitle", "Прогресс"))}:</b> ` +
          esc(T("graph.legend.learn." + d.learn, d.learn)) + `</div>` : "") +
        (metaRows ? `<div style="margin-top:8px;">${metaRows}</div>` : "") +
        (nb ? `<div style="margin-top:8px;"><b>${esc(T("graph.detail.neighbours", "Соседи"))}:</b>` +
          `<ul style="margin:4px 0 0 0;padding-left:16px;">${nb}</ul></div>` : "") +
      `</div>`;
  }

  function renderListView(g) {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const neighbors = new Map();
    for (const e of g.edges) {
      if (!neighbors.has(e.source)) neighbors.set(e.source, []);
      if (!neighbors.has(e.target)) neighbors.set(e.target, []);
      neighbors.get(e.source).push(e.target);
      neighbors.get(e.target).push(e.source);
    }
    const rows = g.nodes.slice()
      .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
      .map((n) => {
        const nb = (neighbors.get(n.id) || []).slice(0, 3)
          .map((id) => (byId.get(id) || {}).label || id);
        return `<tr data-list-node="${esc(n.id)}" tabindex="0" ` +
          `style="cursor:pointer;border-bottom:1px solid var(--theme-border,#eee);">` +
          `<td style="padding:6px 8px;">${esc(T("graph.legend.nodes." + n.kind, n.kind))}</td>` +
          `<td style="padding:6px 8px;">${esc(n.label)}</td>` +
          `<td style="padding:6px 8px;text-align:right;">${n.degree}</td>` +
          `<td style="padding:6px 8px;color:var(--theme-text-secondary,#666);">${esc(nb.join(", "))}</td>` +
          `</tr>`;
      }).join("");
    return `<table data-graph-list="1" style="width:100%;border-collapse:collapse;font-size:13px;">` +
      `<thead><tr style="text-align:left;border-bottom:2px solid var(--theme-border,#ccc);">` +
      `<th style="padding:6px 8px;">${esc(T("graph.listView.kind", "Тип"))}</th>` +
      `<th style="padding:6px 8px;">${esc(T("graph.listView.label", "Название"))}</th>` +
      `<th style="padding:6px 8px;text-align:right;">${esc(T("graph.listView.degree", "Связей"))}</th>` +
      `<th style="padding:6px 8px;">${esc(T("graph.listView.neighbors", "Соседи"))}</th>` +
      `</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function navigateTo(node) {
    // Read-only navigation. No edit affordance anywhere.
    try {
      const kind = node.kind, raw = node.rawId;
      if (kind === "note" && typeof window.v3OpenNoteById === "function") {
        destroy(); window.v3OpenNoteById(raw); return;
      }
      if (kind === "text" && typeof window.v3LibraryOpenText === "function") {
        destroy(); window.v3LibraryOpenText(raw); return;
      }
      if ((kind === "root" || kind === "word") &&
          window.CrossTextUI && typeof window.CrossTextUI.open === "function") {
        window.CrossTextUI.open(raw); return; // keep graph open (side panel)
      }
      toast(T("graph.title", "Карта знаний") + ": " + (node.label || raw), "info");
    } catch (e) {
      console.warn("[graph] navigate failed:", e);
    }
  }

  function wireListNav(panel, g) {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    panel.querySelectorAll("[data-list-node]").forEach((tr) => {
      const id = tr.getAttribute("data-list-node");
      const go = () => { const n = byId.get(id); if (n) navigateTo(n); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
    });
  }

  // C4: click-through on SVG nodes (full keyboard arrow-nav is C5).

  function openLegend(panel) {
    const existing = panel.querySelector("[data-graph-legend-pane]");
    if (existing) { existing.remove(); return; }
    const pane = document.createElement("div");
    pane.setAttribute("data-graph-legend-pane", "1");
    pane.setAttribute("role", "region");
    pane.setAttribute("aria-label", T("graph.legend.title", "Легенда"));
    pane.style.cssText = "position:absolute;right:14px;bottom:14px;background:var(--theme-bg,#fff);border:1px solid var(--theme-border,#ccc);border-radius:8px;padding:12px 14px;font-size:12px;line-height:1.6;box-shadow:0 6px 20px rgba(0,0,0,0.2);z-index:5;max-width:280px;";
    const nk = ["note", "text", "sentence", "root", "word", "binyan"];
    pane.innerHTML =
      `<b>${esc(T("graph.legend.title", "Легенда"))}</b>` +
      `<button type="button" data-legend-close="1" aria-label="${esc(T("graph.toolbar.close", "Закрыть"))}" style="float:right;border:none;background:transparent;cursor:pointer;">×</button>` +
      `<div style="margin-top:8px;">` +
      nk.map((k) => `<div>● ${esc(T("graph.legend.nodes." + k, k))}</div>`).join("") +
      `</div><hr style="margin:8px 0;border:none;border-top:1px solid var(--theme-border,#eee);">` +
      `<div>${esc(T("graph.legend.edges.solid", "сплошная — ссылка [[…]]"))}</div>` +
      `<div>${esc(T("graph.legend.edges.dashed", "пунктир — заметка о тексте"))}</div>` +
      `<div>${esc(T("graph.legend.edges.dotted", "точки — морфология"))}</div>` +
      `<div>${esc(T("graph.legend.edges.auto", "длинный пунктир — заметка ↔ её текст (авто)"))}</div>` +
      `<div>${esc(T("graph.legend.edges.sharedRoot", "мелкий пунктир — общий корень (подсказка)"))}</div>` +
      `<div>${esc(T("graph.legend.edges.sharedLemma", "точечный пунктир — общая лемма (подсказка)"))}</div>` +
      `<hr style="margin:8px 0;border:none;border-top:1px solid var(--theme-border,#eee);">` +
      `<b>${esc(T("graph.legend.learnTitle", "Прогресс (кольцо заметки)"))}</b>` +
      ["weak", "stale", "learning", "new", "known"].map((s) =>
        `<div>● ${esc(T("graph.legend.learn." + s, s))}</div>`).join("");
    panel.appendChild(pane);
    pane.querySelector("[data-legend-close]").addEventListener("click", () => pane.remove());
  }

  function openHelp(panel) {
    const existing = panel.querySelector("[data-graph-help-pane]");
    if (existing) { existing.remove(); return; }
    const pane = document.createElement("div");
    pane.setAttribute("data-graph-help-pane", "1");
    pane.setAttribute("role", "dialog");
    pane.setAttribute("aria-label", T("graph.kbdHelp.title", "Клавиатурные сокращения"));
    pane.style.cssText = "position:absolute;inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--theme-bg,#fff);border:1px solid var(--theme-border,#ccc);border-radius:10px;padding:18px 22px;font-size:13px;line-height:1.8;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:6;";
    pane.innerHTML =
      `<b>${esc(T("graph.kbdHelp.title", "Клавиатурные сокращения"))}</b>` +
      `<button type="button" data-help-close="1" aria-label="${esc(T("graph.toolbar.close", "Закрыть"))}" style="float:right;border:none;background:transparent;cursor:pointer;font-size:16px;">×</button>` +
      `<div style="margin-top:10px;">` +
      ["arrows", "enter", "h", "r", "esc", "qmark"].map((k) =>
        `<div>${esc(T("graph.kbdHelp." + k, k))}</div>`).join("") +
      `</div>`;
    panel.appendChild(pane);
    const cb = pane.querySelector("[data-help-close]");
    cb.addEventListener("click", () => pane.remove());
    cb.focus();
  }

  // ── public open() ──────────────────────────────────────────────────────
  async function open(opts) {
    opts = opts || {};
    const panel = buildShell();
    // Set AFTER buildShell(): buildShell() calls destroy(), which
    // clears _focusReq (stale-request protection). Node id form is
    // `${kind}:${rawId}` (mirrors the data layer's _nid, which lives
    // in a different closure — keep this in sync).
    _focusReq = (opts.focus && opts.focus.id != null && opts.focus.id !== "")
      ? (opts.focus.kind || "note") + ":" + String(opts.focus.id)
      : null;
    renderState(panel, "loading", {});

    let timedOut = false;
    _loadTimer = setTimeout(() => {
      timedOut = true;
      renderState(panel, "error_data_load", {});
    }, LOAD_TIMEOUT_MS);

    let graph;
    try {
      if (typeof window === "undefined" || !window.NotesGraphData) {
        throw new Error("NotesGraphData not loaded");
      }
      // DB-readiness guard — mirror the app's own pattern
      // (index.html ~line 10686): await the init promise, surface init
      // error, verify isReady() BEFORE any query. Querying wa-sqlite
      // mid-boot throws an uncatchable WASM "memory access out of
      // bounds" — this guard prevents the graph from ever reaching
      // that code path. Routes to error_db_unavailable instead.
      try {
        if (window.__localDBInitPromise &&
            typeof window.__localDBInitPromise.then === "function") {
          await window.__localDBInitPromise;
        }
      } catch (_) { /* fall through to the readiness checks below */ }
      const dbBroken =
        !window.__localDB ||
        typeof window.__localDB.dbQuery !== "function" ||
        window.__localDBInitError ||
        (typeof window.__localDB.isReady === "function" &&
         !window.__localDB.isReady());
      if (dbBroken) {
        if (_loadTimer) { clearTimeout(_loadTimer); _loadTimer = null; }
        if (!timedOut) renderState(panel, "error_db_unavailable", {});
        return;
      }
      const filters = loadFilters();
      graph = await window.NotesGraphData.buildGraph();
      // Apply persisted filters (Λ5 — sessionStorage; layout still
      // re-simulates every open per Appendix A #5).
      // node-kind hide list (edgeSuggested is an edge-LAYER key, not a
      // node kind — handled separately below).
      const NODE_KEYS = ["note", "text", "sentence", "root", "word", "binyan"];
      const nodeHidden = NODE_KEYS.some((k) => filters[k] === false);
      const suggOff = filters.edgeSuggested === false;   // Phase 5 layer chip
      if (nodeHidden || suggOff) {
        const keep = new Set(graph.nodes
          .filter((n) => filters[n.kind] !== false).map((n) => n.id));
        const edgeHidden = (e) => suggOff &&
          (e.edge_kind === "auto_shared_root" || e.edge_kind === "auto_shared_lemma");
        graph = {
          nodes: graph.nodes.filter((n) => keep.has(n.id)),
          edges: graph.edges.filter((e) =>
            keep.has(e.source) && keep.has(e.target) && !edgeHidden(e)),
          stats: graph.stats, reduced: graph.reduced,
        };
      }
      // Phase 7 (A5) — learning-state overlay. Read-only aggregate,
      // ONE query per open, non-destructive (annotates note nodes
      // with `.learn`; the renderer draws a ring, never an edge).
      // Chip-toggleable (filters.learnOverlay, default-on).
      if (filters.learnOverlay !== false &&
          window.__localDB &&
          typeof window.__localDB.getLearningStateOverlay === "function") {
        try {
          const ov = await window.__localDB.getLearningStateOverlay();
          if (ov && typeof ov === "object") {
            for (const n of graph.nodes) {
              if (n.kind !== "note") continue;
              const rawId = n.id.indexOf("note:") === 0 ? n.id.slice(5) : n.rawId;
              const st = ov[rawId];
              if (st) n.learn = st;
            }
          }
        } catch (_) { /* overlay absent — graph still renders */ }
      }
    } catch (e) {
      if (_loadTimer) { clearTimeout(_loadTimer); _loadTimer = null; }
      console.error("[graph] data build failed:", e);
      if (!timedOut) renderState(panel, "error_data_load", {});
      return;
    }
    if (timedOut) return;
    if (_loadTimer) { clearTimeout(_loadTimer); _loadTimer = null; }

    if (!graph.nodes.length) {
      // Distinguish "no notes at all" from "notes but all filtered".
      const f = loadFilters();
      const anyHidden = Object.keys(f).some((k) => f[k] === false);
      renderState(panel, anyHidden ? "filtered_all_hidden" : "empty_no_notes", {});
      return;
    }
    // v3.5 Fix 3 — if there are NODES, always render them. Previously
    // a graph with no edges bailed to the blocking "empty_no_links"
    // card, so a user with notes-but-no-`[[`-links saw nothing. Now
    // the entities are shown and the linking teaching becomes a
    // dismissible banner (payload.sparse) instead of replacing the
    // canvas. The empty_no_links state still exists for callers/tests
    // but open() no longer routes there when nodes exist.
    const sparse = !graph.edges.length;
    if (!isFullGraphAllowed()) {
      renderState(panel, "fallback_mobile", { graph, sparse });
      return;
    }
    renderState(panel, "loaded", { graph, reduced: graph.reduced, sparse });
  }

  const api = { open, close: destroy, _state: () => {
    const p = document.getElementById(PANEL_ID);
    return p ? p.getAttribute("data-graph-state") : null;
  } };
  if (typeof window !== "undefined") window.NotesGraph = api;
})();
