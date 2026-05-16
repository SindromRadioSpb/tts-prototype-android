// public/js/notes-graph-render.js — v3.3.6 Knowledge Graph SVG renderer.
//
// C3 scope: SVG force renderer + d3-zoom + chunked tick scheduler +
// pin/unpin + fit-to-content + reduced-motion. No modal/state machine
// (that is C4). No keyboard nav / list view (that is C5).
//
// Consumes window.d3graph (the vendored bundle from C1):
//   forceSimulation, forceManyBody, forceLink, forceCenter,
//   forceCollide, zoom, zoomIdentity, zoomTransform, select.
//
// Public:
//   window.NotesGraphRender.renderGraph(container, graph, opts) → handle
//     graph = { nodes:[{id,kind,label,degree}], edges:[{source,target,edge_kind,...}] }
//     handle = { destroy(), resetView(), unpinAll(), simulationDone:Promise,
//                nodeSel, getTransform() }
//
// HARD: render layer never fetches, never writes storage, never emits
// telemetry. Pure DOM + d3 math. No raw document text (labels arrive
// pre-sanitized from the data layer).

(function () {
  "use strict";

  // 6 node kinds → distinct color AND distinct shape (color-independence,
  // blind-spot §I legend). Colorblind-safe-ish palette (Okabe-Ito based).
  const KIND_STYLE = {
    note:     { color: "#0072B2", shape: "circle" },
    text:     { color: "#009E73", shape: "rect" },
    sentence: { color: "#56B4E9", shape: "rect-sm" },
    root:     { color: "#E69F00", shape: "diamond" },
    word:     { color: "#CC79A7", shape: "circle-sm" },
    binyan:   { color: "#D55E00", shape: "hexagon" },
  };
  // 3 edge kinds → distinct stroke style (color-independent).
  const EDGE_STYLE = {
    explicit_link: { dash: "none",  width: 1.6 },
    target_anchor: { dash: "5,4",   width: 1.2 },
    derived_morph: { dash: "1.5,3", width: 1.2 },
    auto_text:     { dash: "8,3",   width: 1.0 },
    // Phase 5 — computed "suggested" view-only layers (distinct from
    // the four above; thinner + tight dashes read as "soft/derived").
    auto_shared_root:  { dash: "2,3",   width: 0.9 },
    auto_shared_lemma: { dash: "2,1.5", width: 0.9 },
  };

  const TICKS_PER_FRAME = 5;          // chunked scheduler (perf §7)
  const MAX_TICKS = 300;
  const ALPHA_MIN = 0.05;

  function _d3() {
    if (typeof window === "undefined" || !window.d3graph) {
      throw new Error("notes-graph-render: window.d3graph not loaded");
    }
    return window.d3graph;
  }

  function _prefersReducedMotion() {
    try {
      return typeof window !== "undefined" &&
             typeof window.matchMedia === "function" &&
             window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) { return false; }
  }

  function _shapeFor(kind, g, x, y, focused) {
    const st = KIND_STYLE[kind] || { color: "#888", shape: "circle" };
    const ns = "http://www.w3.org/2000/svg";
    let el;
    const r = focused ? 11 : 9;
    switch (st.shape) {
      case "rect":
        el = document.createElementNS(ns, "rect");
        el.setAttribute("width", 22); el.setAttribute("height", 16);
        el.setAttribute("x", -11); el.setAttribute("y", -8);
        el.setAttribute("rx", 2);
        break;
      case "rect-sm":
        el = document.createElementNS(ns, "rect");
        el.setAttribute("width", 14); el.setAttribute("height", 10);
        el.setAttribute("x", -7); el.setAttribute("y", -5);
        el.setAttribute("rx", 2);
        break;
      case "diamond":
        el = document.createElementNS(ns, "path");
        el.setAttribute("d", `M0,${-r} L${r},0 L0,${r} L${-r},0 Z`);
        break;
      case "hexagon": {
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i - Math.PI / 6;
          pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
        }
        el = document.createElementNS(ns, "polygon");
        el.setAttribute("points", pts.join(" "));
        break;
      }
      case "circle-sm":
        el = document.createElementNS(ns, "circle");
        el.setAttribute("r", 6);
        break;
      default:
        el = document.createElementNS(ns, "circle");
        el.setAttribute("r", r);
    }
    el.setAttribute("fill", st.color);
    el.setAttribute("stroke", "#ffffff");
    el.setAttribute("stroke-width", "1.5");
    return el;
  }

  function renderGraph(container, graph, opts) {
    opts = opts || {};
    const d3 = _d3();
    const ns = "http://www.w3.org/2000/svg";
    const W = container.clientWidth || opts.width || 800;
    const H = container.clientHeight || opts.height || 560;

    // Defensive deep-ish copy so the simulation's mutation of x/y/vx/vy
    // doesn't corrupt the caller's node objects.
    const nodes = graph.nodes.map((n) => Object.assign({}, n));
    const idToNode = new Map(nodes.map((n) => [n.id, n]));
    const edges = graph.edges
      .filter((e) => idToNode.has(e.source) && idToNode.has(e.target))
      .map((e) => ({ source: e.source, target: e.target,
                     edge_kind: e.edge_kind, also_target: !!e.also_target,
                     alias: e.alias || null }));

    container.innerHTML = "";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("data-graph-svg", "1");
    // The SVG visual layer is aria-hidden; the structured list/table
    // (added in C5) is the canonical AT path.
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "display:block;width:100%;height:100%;touch-action:none;background:var(--theme-bg,#fff);";

    const zoomLayer = document.createElementNS(ns, "g");
    zoomLayer.setAttribute("data-graph-zoom-layer", "1");
    const edgeG = document.createElementNS(ns, "g");
    edgeG.setAttribute("data-graph-edges", "1");
    const nodeG = document.createElementNS(ns, "g");
    nodeG.setAttribute("data-graph-nodes", "1");
    zoomLayer.appendChild(edgeG);
    zoomLayer.appendChild(nodeG);
    svg.appendChild(zoomLayer);
    container.appendChild(svg);

    // ── edges ──
    const edgeEls = edges.map((e) => {
      const ln = document.createElementNS(ns, "line");
      const st = EDGE_STYLE[e.edge_kind] || EDGE_STYLE.explicit_link;
      ln.setAttribute("stroke", "var(--theme-border,#9aa)");
      ln.setAttribute("stroke-width", String(st.width));
      if (st.dash !== "none") ln.setAttribute("stroke-dasharray", st.dash);
      ln.setAttribute("data-edge-kind", e.edge_kind);
      if (e.also_target) ln.setAttribute("data-also-target", "1");
      edgeG.appendChild(ln);
      return ln;
    });

    // ── nodes ──
    // Deterministic focus order: degree desc, then id (so Tab-into-graph
    // + arrow nav are reproducible — smoke-pinned). The visual placement
    // is force-driven but the tab/keyboard order is stable.
    const focusOrder = nodes.slice()
      .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
    const focusRank = new Map(focusOrder.map((n, i) => [n.id, i]));

    const a11yLabel = (n) =>
      `${n.kind}: ${n.label || n.rawId}, ${n.degree} ${n.degree === 1 ? "связь" : "связей"}`;

    const nodeEls = nodes.map((n) => {
      const gEl = document.createElementNS(ns, "g");
      gEl.setAttribute("data-graph-node", "1");
      gEl.setAttribute("data-node-id", n.id);
      gEl.setAttribute("data-node-kind", n.kind);
      // Keyboard + AT: each node is a focusable button. The SVG itself
      // is aria-hidden (the structured list is the canonical AT path),
      // but sighted keyboard users Tab/arrow through these.
      gEl.setAttribute("tabindex", "0");
      gEl.setAttribute("role", "button");
      gEl.setAttribute("aria-label", a11yLabel(n));
      gEl.style.cursor = "pointer";
      gEl.style.outline = "none";
      gEl.appendChild(_shapeFor(n.kind, gEl));
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", 0);
      label.setAttribute("y", 20);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", "var(--theme-text,#222)");
      label.setAttribute("pointer-events", "none");
      // Label is pre-sanitized by the data layer (no raw doc text).
      label.textContent = (n.label || n.rawId || "").slice(0, 28);
      gEl.appendChild(label);
      // Visible focus ring (currentColor + white inner; reduced-motion
      // and forced-colors friendly — no animation).
      gEl.addEventListener("focus", () => {
        const ring = document.createElementNS(ns, "circle");
        ring.setAttribute("data-focus-ring", "1");
        ring.setAttribute("r", 16);
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", "currentColor");
        ring.setAttribute("stroke-width", "3");
        gEl.insertBefore(ring, gEl.firstChild);
        // U1+U2: keyboard focus → detail panel + 1-hop highlight,
        // immediate (no debounce — keyboard users expect snappy).
        _emitDetail(n);
        _highlightNeighbours(n.id);
      });
      gEl.addEventListener("blur", () => {
        const ring = gEl.querySelector("[data-focus-ring]");
        if (ring) ring.remove();
        _emitDetail(null);
        _clearHighlight();
      });
      // U1+U2: pointer hover → detail panel + highlight, 200 ms
      // debounced to avoid thrash on dense graphs.
      let _hoverT = null;
      gEl.addEventListener("pointerenter", () => {
        if (_hoverT) clearTimeout(_hoverT);
        _hoverT = setTimeout(() => { _emitDetail(n); _highlightNeighbours(n.id); }, 200);
      });
      gEl.addEventListener("pointerleave", () => {
        if (_hoverT) { clearTimeout(_hoverT); _hoverT = null; }
        // Don't clear if this node is also the keyboard-focused one.
        if (document.activeElement !== gEl) { _emitDetail(null); _clearHighlight(); }
      });
      nodeG.appendChild(gEl);
      return gEl;
    });

    // ── simulation ──
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(28))
      .alphaDecay(0.05)
      .alphaMin(ALPHA_MIN)
      .stop();

    function paint() {
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = typeof e.source === "object" ? e.source : idToNode.get(e.source);
        const t = typeof e.target === "object" ? e.target : idToNode.get(e.target);
        if (!s || !t) continue;
        edgeEls[i].setAttribute("x1", s.x); edgeEls[i].setAttribute("y1", s.y);
        edgeEls[i].setAttribute("x2", t.x); edgeEls[i].setAttribute("y2", t.y);
      }
      for (let i = 0; i < nodes.length; i++) {
        nodeEls[i].setAttribute("transform",
          `translate(${nodes[i].x.toFixed(2)},${nodes[i].y.toFixed(2)})`);
      }
    }

    // Auto-fit runs ONCE on the initial settle and on explicit
    // resetView() — NEVER after a user drag/pin reheats the sim.
    // Re-fitting on every settle was a major cause of the
    // "unpredictable" feel: grabbing a node reheated the simulation
    // and the whole canvas jumped/recentred when it re-settled.
    let _pendingFit = true;
    function fitToContent() {
      if (!_pendingFit) return;
      _pendingFit = false;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
      }
      if (!Number.isFinite(minX)) return;
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      const margin = 0.10; // 10% (Appendix A #3)
      const scale = Math.min(
        W / (bw * (1 + 2 * margin)),
        H / (bh * (1 + 2 * margin)),
        2.5);
      const tx = W / 2 - scale * (minX + bw / 2);
      const ty = H / 2 - scale * (minY + bh / 2);
      currentTransform = { k: scale, x: tx, y: ty };
      applyTransform();
      _syncZoomTransform();
    }

    let currentTransform = { k: 1, x: 0, y: 0 };
    function applyTransform() {
      zoomLayer.setAttribute("transform",
        `translate(${currentTransform.x},${currentTransform.y}) scale(${currentTransform.k})`);
    }

    // d3-zoom — pan ONLY on empty canvas (a gesture that starts on a
    // node is reserved for node-drag); wheel/pinch zoom anywhere.
    // .filter() is the fix for the v3.3.6 "nodes jump unpredictably"
    // bug: previously a pointerdown on a node ALSO started a d3-zoom
    // pan, so dragging a node simultaneously panned the canvas.
    let zoomBehavior = null;
    function _syncZoomTransform() {
      // Keep d3-zoom's internal transform in lock-step with
      // currentTransform after a programmatic fit/reset, so the next
      // wheel/pan continues smoothly instead of snapping back to
      // identity.
      if (!zoomBehavior) return;
      try {
        const t = d3.zoomIdentity
          .translate(currentTransform.x, currentTransform.y)
          .scale(currentTransform.k);
        d3.select(svg).property("__zoom", t);
      } catch (_) {}
    }
    try {
      zoomBehavior = d3.zoom()
        .scaleExtent([0.2, 4])
        .filter((event) => {
          // Wheel/pinch zoom always allowed. Pan (pointer/touch drag)
          // only when the gesture did NOT start on a node.
          if (event.type === "wheel") return !event.ctrlKey;
          const t = event.target;
          return !(t && t.closest && t.closest("[data-graph-node]"));
        })
        .on("zoom", (ev) => {
          const tr = ev.transform;
          currentTransform = { k: tr.k, x: tr.x, y: tr.y };
          applyTransform();
        });
      d3.select(svg).call(zoomBehavior);
    } catch (_) { /* zoom optional; static layout still works */ }

    // Interaction callbacks (read-only). Declared here so both the
    // tap-vs-drag handler and the keyboard handler can use them.
    const onNodeActivate = typeof opts.onNodeActivate === "function" ? opts.onNodeActivate : null;
    const onClusterIsolate = typeof opts.onClusterIsolate === "function" ? opts.onClusterIsolate : null;
    const onResetCb = typeof opts.onReset === "function" ? opts.onReset : null;

    // ── node drag / pin / unpin (Appendix A #2) ──
    // Robust pointer-drag with a tap-vs-drag threshold:
    //   • move < ~5 px  → it's a TAP → onNodeActivate (navigate)
    //   • move ≥ ~5 px  → it's a DRAG → fx/fy follow the pointer; on
    //                      release the node stays PINNED (data-pinned)
    //   • double-click  → unpin
    // The threshold means a precise tap never accidentally pins, and a
    // post-drag click never spuriously navigates (suppressed below).
    const DRAG_THRESHOLD_SQ = 25; // 5 px
    let drag = null; // { node, el, sx, sy, moved }
    function clientToGraph(clientX, clientY) {
      const rect = svg.getBoundingClientRect();
      // client px → viewBox units → invert the zoomLayer transform.
      const sx = (clientX - rect.left) * (W / rect.width);
      const sy = (clientY - rect.top) * (H / rect.height);
      return {
        x: (sx - currentTransform.x) / currentTransform.k,
        y: (sy - currentTransform.y) / currentTransform.k,
      };
    }
    nodeEls.forEach((el, i) => {
      el.style.cursor = "grab";
      el.addEventListener("pointerdown", (ev) => {
        if (ev.button != null && ev.button > 0) return; // primary only
        drag = { node: nodes[i], el, sx: ev.clientX, sy: ev.clientY, moved: false };
        el.style.cursor = "grabbing";
        try { el.setPointerCapture(ev.pointerId); } catch (_) {}
        ev.preventDefault();
      });
      el.addEventListener("pointermove", (ev) => {
        if (!drag || drag.node !== nodes[i]) return;
        const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
        if (!drag.moved && (dx * dx + dy * dy) >= DRAG_THRESHOLD_SQ) {
          drag.moved = true;
          // Standard d3 drag: reheat while dragging, freeze on release.
          sim.alphaTarget(0.3).restart();
          scheduleTicks();
        }
        if (drag.moved) {
          const p = clientToGraph(ev.clientX, ev.clientY);
          nodes[i].fx = p.x; nodes[i].fy = p.y;
          // Repaint immediately so the node tracks the finger/cursor
          // 1:1 even between simulation ticks.
          paint();
        }
      });
      const endDrag = () => {
        if (!drag || drag.node !== nodes[i]) return;
        el.style.cursor = "grab";
        if (drag.moved) {
          _setPinned(el, true); // release pins + visible badge (U3)
          sim.alphaTarget(0);
          // Swallow the click the browser fires after a drag.
          el.__graphSuppressClick = true;
          setTimeout(() => { el.__graphSuppressClick = false; }, 350);
        } else {
          // True tap → navigate, but DELAYED so a double-click (unpin)
          // can cancel it. Without the delay the first click of a
          // dbl-click navigates + closes the modal before the dbl-click
          // fires. 250 ms ≈ platform double-click window.
          if (el.__tapTimer) { clearTimeout(el.__tapTimer); el.__tapTimer = null; }
          el.__tapTimer = setTimeout(() => {
            el.__tapTimer = null;
            if (onNodeActivate) onNodeActivate(nodes[i]);
          }, 250);
        }
        drag = null;
      };
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
      // Capture-phase guard: if a drag just happened, eat the click
      // before any bubble-phase handler can see it.
      el.addEventListener("click", (ev) => {
        if (el.__graphSuppressClick) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          el.__graphSuppressClick = false;
        }
      }, true);
      el.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        // Cancel the pending single-tap navigate — this gesture is an
        // unpin, not a navigate.
        if (el.__tapTimer) { clearTimeout(el.__tapTimer); el.__tapTimer = null; }
        nodes[i].fx = null; nodes[i].fy = null;
        _setPinned(el, false); // unpin + remove badge (U3)
        sim.alpha(0.3).restart();
        scheduleTicks();
      });
    });

    // ── keyboard navigation (C5) ──────────────────────────────────────
    // Arrow = geometric nearest neighbour in that direction.
    // Enter/Space = activate (read-only navigate). H = isolate cluster.
    // R = reset view. Esc/? handled by the modal shell.
    // (onNodeActivate/onClusterIsolate/onResetCb declared above the drag
    // block so the tap handler can reference them.)

    function _nearestInDirection(fromIdx, dir) {
      const a = nodes[fromIdx];
      let best = -1, bestScore = Infinity;
      for (let j = 0; j < nodes.length; j++) {
        if (j === fromIdx) continue;
        const b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        let aligned = false, primary = 0, secondary = 0;
        if (dir === "ArrowRight") { aligned = dx > 0; primary = dx; secondary = Math.abs(dy); }
        else if (dir === "ArrowLeft")  { aligned = dx < 0; primary = -dx; secondary = Math.abs(dy); }
        else if (dir === "ArrowDown")  { aligned = dy > 0; primary = dy; secondary = Math.abs(dx); }
        else if (dir === "ArrowUp")    { aligned = dy < 0; primary = -dy; secondary = Math.abs(dx); }
        if (!aligned) continue;
        // Prefer small angular deviation, then proximity.
        const score = secondary * 2 + primary;
        if (score < bestScore) { bestScore = score; best = j; }
      }
      return best;
    }

    nodeEls.forEach((el, i) => {
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowRight" || ev.key === "ArrowLeft" ||
            ev.key === "ArrowUp" || ev.key === "ArrowDown") {
          ev.preventDefault();
          const j = _nearestInDirection(i, ev.key);
          if (j >= 0) { nodeEls[j].focus(); }
          // else: no neighbour that way — silent no-op (the role=status
          // summary in the modal already gives orientation).
        } else if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          if (onNodeActivate) onNodeActivate(nodes[i]);
        } else if (ev.key === "h" || ev.key === "H") {
          ev.preventDefault();
          if (onClusterIsolate) onClusterIsolate(nodes[i]);
        } else if (ev.key === "r" || ev.key === "R") {
          ev.preventDefault();
          if (onResetCb) onResetCb();
        }
      });
    });

    // ── cluster isolation (H / toolbar) ───────────────────────────────
    // Fade (not remove) everything outside the connected component of
    // the given node, so the layout doesn't violently reflow.
    const adjacency = new Map();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const e of edges) {
      const sId = typeof e.source === "object" ? e.source.id : e.source;
      const tId = typeof e.target === "object" ? e.target.id : e.target;
      if (adjacency.has(sId)) adjacency.get(sId).push(tId);
      if (adjacency.has(tId)) adjacency.get(tId).push(sId);
    }
    let _isolated = false;
    function isolateCluster(nodeId) {
      const seen = new Set([nodeId]);
      const queue = [nodeId];
      while (queue.length) {
        const cur = queue.shift();
        for (const nb of (adjacency.get(cur) || [])) {
          if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
        }
      }
      nodes.forEach((n, idx) => {
        const inC = seen.has(n.id);
        nodeEls[idx].style.opacity = inC ? "1" : "0.12";
        nodeEls[idx].setAttribute("aria-hidden", inC ? "false" : "true");
        if (!inC) nodeEls[idx].setAttribute("tabindex", "-1");
        else nodeEls[idx].setAttribute("tabindex", "0");
      });
      edges.forEach((e, idx) => {
        const sId = typeof e.source === "object" ? e.source.id : e.source;
        const tId = typeof e.target === "object" ? e.target.id : e.target;
        edgeEls[idx].style.opacity = (seen.has(sId) && seen.has(tId)) ? "1" : "0.08";
      });
      _isolated = true;
    }
    function showAll() {
      nodeEls.forEach((el) => {
        el.style.opacity = "1";
        el.setAttribute("aria-hidden", "false");
        el.setAttribute("tabindex", "0");
      });
      edgeEls.forEach((el) => { el.style.opacity = "1"; });
      _isolated = false;
    }

    // ── U1: detail emit ───────────────────────────────────────────────
    const onNodeDetail = typeof opts.onNodeDetail === "function" ? opts.onNodeDetail : null;
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    function _emitDetail(n) {
      if (!onNodeDetail) return;
      if (!n) { onNodeDetail(null); return; }
      const nbIds = adjacency.get(n.id) || [];
      const neighbours = nbIds
        .map((id) => nodeById.get(id)).filter(Boolean)
        .sort((a, b) => (b.degree || 0) - (a.degree || 0))
        .slice(0, 5)
        .map((x) => ({ id: x.id, kind: x.kind, label: x.label }));
      let inD = 0, outD = 0;
      for (const e of edges) {
        const s = typeof e.source === "object" ? e.source.id : e.source;
        const t = typeof e.target === "object" ? e.target.id : e.target;
        if (s === n.id) outD++;
        if (t === n.id) inD++;
      }
      const idx = nodes.findIndex((x) => x.id === n.id);
      onNodeDetail({
        id: n.id, kind: n.kind, label: n.label, rawId: n.rawId,
        degree: n.degree || 0, inDegree: inD, outDegree: outD,
        pinned: idx >= 0 && nodeEls[idx].getAttribute("data-pinned") === "1",
        meta: n.meta || {}, neighbours,
      });
    }

    // ── U2: transient 1-hop neighbour highlight ───────────────────────
    // Distinct from isolateCluster (whole component, sticky). No-ops
    // while a cluster isolate is active so the two don't fight.
    let _hl = false;
    function _highlightNeighbours(nodeId) {
      if (_isolated) return;
      const keep = new Set([nodeId]);
      for (const nb of (adjacency.get(nodeId) || [])) keep.add(nb);
      nodes.forEach((n, idx) => {
        nodeEls[idx].style.opacity = keep.has(n.id) ? "1" : "0.18";
      });
      edges.forEach((e, idx) => {
        const s = typeof e.source === "object" ? e.source.id : e.source;
        const t = typeof e.target === "object" ? e.target.id : e.target;
        edgeEls[idx].style.opacity = (s === nodeId || t === nodeId) ? "1" : "0.10";
      });
      _hl = true;
    }
    function _clearHighlight() {
      if (!_hl || _isolated) { _hl = false; return; }
      nodeEls.forEach((el) => { el.style.opacity = "1"; });
      edgeEls.forEach((el) => { el.style.opacity = "1"; });
      _hl = false;
    }

    // ── U3: pinned badge ──────────────────────────────────────────────
    function _setPinned(el, on) {
      if (on) {
        el.setAttribute("data-pinned", "1");
        if (!el.querySelector("[data-pin-badge]")) {
          const b = document.createElementNS(ns, "text");
          b.setAttribute("data-pin-badge", "1");
          b.setAttribute("x", 11);
          b.setAttribute("y", -9);
          b.setAttribute("font-size", "11");
          b.setAttribute("pointer-events", "none");
          b.textContent = "📌";
          el.appendChild(b);
        }
      } else {
        el.removeAttribute("data-pinned");
        const b = el.querySelector("[data-pin-badge]");
        if (b) b.remove();
      }
    }

    // ── chunked tick scheduler (perf §7) ──
    let tickCount = 0;
    let rafId = null;
    let resolveDone;
    const simulationDone = new Promise((res) => { resolveDone = res; });
    const reduced = _prefersReducedMotion();

    function runChunk() {
      const perFrame = reduced ? MAX_TICKS : TICKS_PER_FRAME;
      for (let i = 0; i < perFrame; i++) {
        sim.tick();
        tickCount++;
        if (sim.alpha() < ALPHA_MIN || tickCount >= MAX_TICKS) break;
      }
      paint();
      if (sim.alpha() >= ALPHA_MIN && tickCount < MAX_TICKS && !reduced) {
        rafId = (typeof requestAnimationFrame === "function")
          ? requestAnimationFrame(runChunk)
          : setTimeout(runChunk, 0);
      } else {
        rafId = null;
        fitToContent();
        if (resolveDone) { resolveDone({ ticks: tickCount }); resolveDone = null; }
      }
    }
    function scheduleTicks() {
      if (rafId != null) return;
      rafId = (typeof requestAnimationFrame === "function")
        ? requestAnimationFrame(runChunk)
        : setTimeout(runChunk, 0);
    }

    // Reduced-motion: run all ticks synchronously, paint once, no
    // animation frames.
    if (reduced) {
      while (sim.alpha() >= ALPHA_MIN && tickCount < MAX_TICKS) {
        sim.tick(); tickCount++;
      }
      paint();
      fitToContent();
      if (resolveDone) { resolveDone({ ticks: tickCount, reducedMotion: true }); resolveDone = null; }
    } else {
      scheduleTicks();
    }

    return {
      svg,
      nodeEls,
      edgeEls,
      simulationDone,
      getTransform: () => Object.assign({}, currentTransform),
      // U4: programmatic zoom about the canvas centre, clamped to the
      // same [0.2, 4] extent as wheel zoom; keeps d3-zoom in sync.
      zoomBy(factor) {
        const k0 = currentTransform.k;
        const k1 = Math.max(0.2, Math.min(4, k0 * factor));
        if (k1 === k0) return;
        const cx = W / 2, cy = H / 2;
        // keep the canvas centre fixed while scaling
        currentTransform = {
          k: k1,
          x: cx - (cx - currentTransform.x) * (k1 / k0),
          y: cy - (cy - currentTransform.y) * (k1 / k0),
        };
        applyTransform();
        _syncZoomTransform();
      },
      // U4: explicit "fit to content" (re-arms the one-shot latch).
      fitView() { _pendingFit = true; fitToContent(); },
      resetView() {
        nodes.forEach((n, i) => {
          n.fx = null; n.fy = null;
          _setPinned(nodeEls[i], false);
        });
        showAll();
        _pendingFit = true;            // re-fit on this settle only
        sim.alpha(0.5).restart();
        tickCount = 0;
        scheduleTicks();
        // fitToContent re-runs once at the next settle (then locks).
      },
      unpinAll() {
        nodes.forEach((n, i) => {
          n.fx = null; n.fy = null;
          _setPinned(nodeEls[i], false);
        });
      },
      isolateCluster, showAll,
      // C2 (v3.4) — spotlight one node from a deep-link: isolate its
      // cluster (clears the visual noise) and move keyboard focus onto
      // it, which fires the existing focus handler → detail rail +
      // neighbour highlight + SR announcement. Read-only; no edit.
      focusNode(nodeId) {
        const idx = nodes.findIndex((n) => n.id === nodeId);
        if (idx < 0 || !nodeEls[idx]) return false;
        try { isolateCluster(nodeId); } catch (_) {}
        try { _pendingFit = true; fitToContent(); } catch (_) {}
        try { nodeEls[idx].focus(); } catch (_) {}
        return true;
      },
      isIsolated: () => _isolated,
      // Land focus on the deterministic first node (Tab-into-graph).
      focusFirst() {
        if (!focusOrder.length) return;
        const firstId = focusOrder[0].id;
        const idx = nodes.findIndex((n) => n.id === firstId);
        if (idx >= 0 && nodeEls[idx]) nodeEls[idx].focus();
      },
      focusRankOf: (id) => focusRank.get(id),
      destroy() {
        if (rafId != null) {
          if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
          else clearTimeout(rafId);
          rafId = null;
        }
        try { sim.stop(); } catch (_) {}
        if (container) container.innerHTML = "";
      },
    };
  }

  const api = { renderGraph, KIND_STYLE, EDGE_STYLE };
  if (typeof window !== "undefined") window.NotesGraphRender = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
