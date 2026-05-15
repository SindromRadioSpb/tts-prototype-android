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
  const EDGE_KINDS = ["explicit_link", "target_anchor", "derived_morph"];

  // ── DB shim — identical access path to crosstext.js ────────────────────
  async function _q(sql, params) {
    const ldb = (typeof window !== "undefined") && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== "function") {
      throw new Error("notes-graph: local-db not ready (window.__localDB.dbQuery missing)");
    }
    return ldb.dbQuery(sql, params || []);
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

    // Degree.
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
