// public/js/knowledge-map-view.js — Knowledge Map v3.8 (root-centric) Phase 2.
//
// Focus-first root-radial VIEW. Dependency-free (plain SVG + DOM): a focus
// cluster is ≤ ~29 lemmas (Phase-0 finding) so no force simulation is needed —
// positions are deterministic, which also makes it fast on mid-range Android.
//
// Exposes window.KnowledgeMap = { open(opts), close(), isOpen() }.
// Data from window.KnowledgeMapData (Phase 1). Read-only; the view never
// writes. Status (known/learning/new) is the PRIMARY visual channel (color);
// frequency is node size. Desktop = ranked root list + radial focus + preview;
// mobile (≤640px) = ranked cluster list (primary), tap a root → its radial.
//
// Theme via CSS vars with fallbacks (v3.7 dark-theme trap: never hardcode).
// i18n via window.t with inline fallbacks. RTL-aware.

(function () {
  "use strict";

  var OVERLAY_ID = "knowledgeMapOverlay";
  var MOBILE_MAX = 640;

  // Status → color (Okabe-Ito-ish, accessible; theme-var override if present).
  var STATUS_COLOR = {
    known:    "var(--kmap-known, #2e7d32)",    // green  — mastered
    learning: "var(--kmap-learning, #f0a500)", // amber  — in progress
    new:      "var(--kmap-new, #4f7bd6)",      // blue   — not yet studied
  };
  var STATUS_ORDER = ["learning", "new", "known"];

  function T(key, fallback) {
    try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } }
    catch (_) {}
    return fallback;
  }
  function isRTL() {
    try { return document.documentElement.getAttribute("dir") === "rtl"; } catch (_) { return false; }
  }
  function isMobile() {
    try { return window.matchMedia("(max-width: " + MOBILE_MAX + "px)").matches; } catch (_) { return false; }
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function svgEl(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  var _state = { overlay: null, index: null, selectedRoot: null };

  // node radius from frequency (sqrt scale → area ∝ freq), clamped.
  function _radius(freq) {
    var r = 9 + Math.sqrt(Math.max(1, freq)) * 3.2;
    return Math.max(9, Math.min(30, r));
  }

  // ── lazy preview fetch (single row, on user action only — privacy minimal) ─
  async function _fetchPreview(noteId) {
    try {
      var ldb = window.__localDB;
      if (!ldb || typeof ldb.dbQuery !== "function" || !noteId) return null;
      var rows = await ldb.dbQuery(
        "SELECT json_extract(body_json,'$.meaning') AS meaning," +
        " json_extract(body_json,'$.niqqud_variant') AS niqqud" +
        " FROM notes_v2 WHERE id = ? LIMIT 1", [String(noteId)]);
      return (rows && rows[0]) || null;
    } catch (_) { return null; }
  }

  // ── overlay shell ──────────────────────────────────────────────────────
  function _buildShell() {
    var prev = document.getElementById(OVERLAY_ID);
    if (prev) prev.parentNode.removeChild(prev);

    var overlay = el("div", { id: OVERLAY_ID, "data-kmap-overlay": "1",
      role: "dialog", "aria-modal": "true", "aria-label": T("knowledgeMap.title", "Карта знаний") });
    overlay.style.cssText = "position:fixed;inset:0;z-index:10050;display:flex;flex-direction:column;" +
      "background:var(--theme-bg-page,var(--theme-bg,#f4f6f9));color:var(--theme-text-primary,var(--theme-text,#0f172a));" +
      "font-family:inherit;";

    // header
    var header = el("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;flex-shrink:0;" +
      "border-bottom:1px solid var(--theme-border-soft,var(--theme-border,#e2e8f0));";
    var title = el("strong", null, "🌳 " + T("knowledgeMap.title", "Карта знаний"));
    title.style.cssText = "font-size:16px;";
    var spacer = el("div"); spacer.style.cssText = "flex:1;";
    var legend = _buildLegend();
    var closeBtn = el("button", { "data-kmap-close": "1", "aria-label": T("knowledgeMap.close", "Закрыть") }, "✕");
    closeBtn.style.cssText = "width:auto;min-width:34px;height:34px;border-radius:8px;cursor:pointer;" +
      "border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;font-size:15px;";
    closeBtn.addEventListener("click", close);
    header.appendChild(title); header.appendChild(spacer); header.appendChild(legend); header.appendChild(closeBtn);

    var body = el("div", { "data-kmap-body": "1" });
    body.style.cssText = "flex:1;min-height:0;display:flex;overflow:hidden;";

    overlay.appendChild(header);
    overlay.appendChild(body);
    document.body.appendChild(overlay);

    // Esc to close
    overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    overlay.tabIndex = -1;
    _state.overlay = overlay;
    return { overlay: overlay, body: body };
  }

  function _buildLegend() {
    var wrap = el("div");
    wrap.style.cssText = "display:flex;gap:10px;align-items:center;font-size:11px;";
    [["known", T("knowledgeMap.status.known", "знаю")],
     ["learning", T("knowledgeMap.status.learning", "учу")],
     ["new", T("knowledgeMap.status.new", "новое")]].forEach(function (p) {
      var item = el("span"); item.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      var dot = el("span"); dot.style.cssText = "width:10px;height:10px;border-radius:50%;background:" + STATUS_COLOR[p[0]] + ";";
      item.appendChild(dot); item.appendChild(document.createTextNode(p[1]));
      wrap.appendChild(item);
    });
    return wrap;
  }

  // ── ranked root list (left pane / mobile primary) ──────────────────────
  function _buildRootList(roots, onPick) {
    var pane = el("div", { "data-kmap-rootlist": "1" });
    pane.style.cssText = "display:flex;flex-direction:column;min-height:0;border-inline-end:1px solid var(--theme-border-soft,#e2e8f0);" +
      (isMobile() ? "width:100%;" : "width:280px;flex-shrink:0;");

    var search = el("input", { type: "search", "data-kmap-search": "1",
      placeholder: T("knowledgeMap.searchPlaceholder", "Поиск корня…") });
    search.style.cssText = "margin:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--theme-border-soft,#e2e8f0);" +
      "background:var(--theme-bg-card,#fff);color:inherit;";
    pane.appendChild(search);

    var listWrap = el("div", { "data-kmap-rootlist-items": "1" });
    listWrap.style.cssText = "overflow-y:auto;padding:0 8px 12px;";
    pane.appendChild(listWrap);

    function render(q) {
      listWrap.innerHTML = "";
      var nq = String(q || "").replace(/[֑-ׇ]/g, "").trim();
      var shown = 0;
      for (var i = 0; i < roots.length; i++) {
        var r = roots[i];
        if (nq && r.rawId.indexOf(nq) === -1) continue;
        if (shown >= 300) break; // safety
        shown++;
        var card = el("button", { "data-kmap-root": r.rawId, type: "button" });
        card.style.cssText = "width:100%;text-align:start;display:flex;align-items:center;gap:8px;padding:9px 10px;margin:3px 0;" +
          "border-radius:8px;cursor:pointer;border:1px solid transparent;background:var(--theme-bg-card,#fff);color:inherit;";
        var dot = el("span"); dot.style.cssText = "width:10px;height:10px;border-radius:50%;flex-shrink:0;background:" + STATUS_COLOR[r.status] + ";";
        var lbl = el("span", null, r.label); lbl.style.cssText = "font-weight:600;font-size:15px;letter-spacing:1px;";
        var meta = el("span", null, "×" + r.freq + " · " + r.memberCount);
        meta.style.cssText = "margin-inline-start:auto;font-size:11px;opacity:.6;";
        card.appendChild(dot); card.appendChild(lbl); card.appendChild(meta);
        card.addEventListener("click", (function (rk) { return function () { onPick(rk); }; })(r.id));
        listWrap.appendChild(card);
      }
      if (shown === 0) {
        listWrap.appendChild(el("div", { style: "padding:16px;opacity:.6;font-size:13px;" },
          T("knowledgeMap.noRoots", "Ничего не найдено")));
      }
    }
    search.addEventListener("input", function () { render(search.value); });
    render("");
    return { pane: pane, render: render };
  }

  // ── radial focus (SVG) for one root family ─────────────────────────────
  async function _renderRadial(host, rootKey) {
    host.innerHTML = "";
    var cluster = await window.KnowledgeMapData.rootCluster(rootKey, { _index: _state.index });
    if (!cluster.root) {
      host.appendChild(el("div", { style: "margin:auto;opacity:.6;" },
        T("knowledgeMap.pickRoot", "Выберите корень слева")));
      return;
    }
    _state.selectedRoot = rootKey;

    var W = host.clientWidth || 600, H = host.clientHeight || 480;
    var cx = W / 2, cy = H / 2;
    var lemmas = cluster.lemmas.slice();
    var n = lemmas.length;
    var ringR = Math.max(70, Math.min(W, H) / 2 - 60);

    var svg = svgEl("svg", { width: "100%", height: "100%", viewBox: "0 0 " + W + " " + H,
      "data-kmap-svg": "1", style: "display:block;" });

    // edges first
    var positions = [];
    for (var i = 0; i < n; i++) {
      var ang = (i / Math.max(1, n)) * 2 * Math.PI - Math.PI / 2;
      var px = cx + ringR * Math.cos(ang), py = cy + ringR * Math.sin(ang);
      positions.push({ x: px, y: py, lemma: lemmas[i] });
      var line = svgEl("line", { x1: cx, y1: cy, x2: px, y2: py,
        stroke: "var(--theme-border-soft,#cbd5e1)", "stroke-width": "1.3" });
      svg.appendChild(line);
      // edge label (binyan/pos)
      var edge = cluster.edges.find(function (e) { return e.target === lemmas[i].id; });
      if (edge && edge.label) {
        var mx = cx + (ringR * 0.58) * Math.cos(ang), my = cy + (ringR * 0.58) * Math.sin(ang);
        var et = svgEl("text", { x: mx, y: my, "text-anchor": "middle", "dominant-baseline": "middle",
          "font-size": "9", fill: "var(--theme-text-secondary,#64748b)", opacity: "0.8" });
        et.textContent = edge.label;
        svg.appendChild(et);
      }
    }

    // lemma nodes
    for (var j = 0; j < positions.length; j++) {
      (function (p) {
        var g = svgEl("g", { "data-kmap-node": p.lemma.id, style: "cursor:pointer;" });
        var c = svgEl("circle", { cx: p.x, cy: p.y, r: _radius(p.lemma.freq),
          fill: STATUS_COLOR[p.lemma.status], stroke: "var(--theme-bg-card,#fff)", "stroke-width": "2" });
        var t = svgEl("text", { x: p.x, y: p.y + _radius(p.lemma.freq) + 12, "text-anchor": "middle",
          "font-size": "13", fill: "var(--theme-text-primary,#0f172a)", direction: "rtl" });
        t.textContent = p.lemma.label;
        g.appendChild(c); g.appendChild(t);
        g.addEventListener("click", function () { _showPreview(host, p.lemma); });
        svg.appendChild(g);
      })(positions[j]);
    }

    // center root node
    var rootG = svgEl("g", { "data-kmap-rootnode": cluster.root.id });
    var rc = svgEl("circle", { cx: cx, cy: cy, r: 34, fill: "var(--theme-bg-card,#fff)",
      stroke: STATUS_COLOR[cluster.root.status], "stroke-width": "3" });
    var rt = svgEl("text", { x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "middle",
      "font-size": "18", "font-weight": "700", fill: "var(--theme-text-primary,#0f172a)",
      direction: "rtl", "letter-spacing": "2" });
    rt.textContent = cluster.root.label;
    rootG.appendChild(rc); rootG.appendChild(rt);
    svg.appendChild(rootG);

    host.appendChild(svg);
  }

  // ── progressive-disclosure preview card ────────────────────────────────
  async function _showPreview(host, lemma) {
    var old = host.querySelector("[data-kmap-preview]");
    if (old) old.parentNode.removeChild(old);
    var card = el("div", { "data-kmap-preview": "1" });
    card.style.cssText = "position:absolute;inset-inline-end:12px;top:12px;width:240px;max-width:70%;" +
      "background:var(--theme-bg-card,#fff);color:var(--theme-text-primary,#0f172a);border:1px solid var(--theme-border-soft,#e2e8f0);" +
      "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:12px;font-size:13px;z-index:2;";
    var head = el("div"); head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
    var dot = el("span"); dot.style.cssText = "width:10px;height:10px;border-radius:50%;background:" + STATUS_COLOR[lemma.status] + ";";
    var lem = el("strong", null, lemma.label); lem.style.cssText = "font-size:17px;letter-spacing:1px;";
    var x = el("button", { "aria-label": T("knowledgeMap.close", "Закрыть") }, "✕");
    x.style.cssText = "width:auto;margin-inline-start:auto;border:none;background:none;cursor:pointer;color:inherit;font-size:13px;";
    x.addEventListener("click", function () { card.parentNode && card.parentNode.removeChild(card); });
    head.appendChild(dot); head.appendChild(lem); head.appendChild(x);
    card.appendChild(head);

    var sub = el("div");
    sub.style.cssText = "opacity:.75;margin-bottom:6px;";
    var bits = [];
    if (lemma.binyans && lemma.binyans.length) bits.push(lemma.binyans.join("/"));
    if (lemma.pos && lemma.pos.length) bits.push(lemma.pos.join("/"));
    bits.push("×" + lemma.freq);
    bits.push(T("knowledgeMap.status." + lemma.status, lemma.status));
    sub.textContent = bits.join(" · ");
    card.appendChild(sub);

    var glossEl = el("div", { "data-kmap-gloss": "1" }, T("knowledgeMap.loading", "…"));
    glossEl.style.cssText = "min-height:18px;";
    card.appendChild(glossEl);

    host.appendChild(card);

    // lazy gloss/niqqud
    var noteId = (lemma.noteIds && lemma.noteIds[0]) || null;
    var pv = await _fetchPreview(noteId);
    if (pv) {
      glossEl.textContent = "";
      if (pv.niqqud) {
        var nq = el("div", null, pv.niqqud);
        nq.style.cssText = "font-size:18px;direction:rtl;letter-spacing:1px;margin-bottom:2px;";
        glossEl.appendChild(nq);
      }
      glossEl.appendChild(el("div", null, pv.meaning || T("knowledgeMap.noGloss", "(нет перевода)")));
    } else {
      glossEl.textContent = T("knowledgeMap.noGloss", "(нет перевода)");
    }
  }

  // ── mobile cluster-list (primary on ≤640px) ────────────────────────────
  function _renderMobile(body, roots) {
    body.style.flexDirection = "column";
    var rl = _buildRootList(roots, function (rootKey) { _openRootSheet(body, rootKey); });
    body.appendChild(rl.pane);
  }
  async function _openRootSheet(body, rootKey) {
    var prev = document.querySelector("[data-kmap-sheet]");
    if (prev) prev.parentNode.removeChild(prev);
    var sheet = el("div", { "data-kmap-sheet": "1" });
    sheet.style.cssText = "position:fixed;inset:0;z-index:10060;background:var(--theme-bg-page,#f4f6f9);" +
      "display:flex;flex-direction:column;";
    var bar = el("div"); bar.style.cssText = "padding:10px 14px;border-bottom:1px solid var(--theme-border-soft,#e2e8f0);display:flex;gap:8px;align-items:center;";
    var back = el("button", null, isRTL() ? "→ " + T("knowledgeMap.back", "Назад") : "← " + T("knowledgeMap.back", "Назад"));
    back.style.cssText = "width:auto;border:none;background:none;cursor:pointer;color:inherit;font-size:14px;";
    back.addEventListener("click", function () { sheet.parentNode.removeChild(sheet); });
    bar.appendChild(back);
    sheet.appendChild(bar);
    var host = el("div"); host.style.cssText = "position:relative;flex:1;min-height:0;";
    sheet.appendChild(host);
    document.body.appendChild(sheet);
    await _renderRadial(host, rootKey);
  }

  // ── public open/close ──────────────────────────────────────────────────
  async function open(opts) {
    opts = opts || {};
    var shell = _buildShell();
    var body = shell.body;
    body.appendChild(el("div", { style: "margin:auto;opacity:.7;" }, T("knowledgeMap.loading", "Строим карту знаний…")));
    try { shell.overlay.focus(); } catch (_) {}

    try {
      _state.index = await window.KnowledgeMapData.build(opts.build || {});
    } catch (e) {
      body.innerHTML = "";
      body.appendChild(el("div", { style: "margin:auto;color:var(--theme-danger,#c0392b);" },
        T("knowledgeMap.error", "Не удалось построить карту") + " — " + (e && e.message ? e.message : e)));
      return;
    }
    var roots = await window.KnowledgeMapData.rankRoots({ _index: _state.index });
    body.innerHTML = "";

    if (!roots.length) {
      body.appendChild(el("div", { style: "margin:auto;text-align:center;opacity:.75;max-width:320px;padding:20px;" },
        T("knowledgeMap.emptyHint", "Нет корневых данных. Импортируйте библиотеку с word-заметками, чтобы построить карту корней.")));
      return;
    }

    if (isMobile()) { _renderMobile(body, roots); return; }

    // desktop two-pane
    var rl = _buildRootList(roots, function (rootKey) { _renderRadial(focus, rootKey); });
    var focus = el("div", { "data-kmap-focus": "1" });
    focus.style.cssText = "position:relative;flex:1;min-height:0;";
    body.appendChild(rl.pane);
    body.appendChild(focus);
    await _renderRadial(focus, roots[0].id); // open on the top root
  }

  function close() {
    var o = document.getElementById(OVERLAY_ID);
    if (o) o.parentNode.removeChild(o);
    var sheet = document.querySelector("[data-kmap-sheet]");
    if (sheet) sheet.parentNode.removeChild(sheet);
    _state.overlay = null; _state.index = null; _state.selectedRoot = null;
  }
  function isOpen() { return !!document.getElementById(OVERLAY_ID); }

  if (typeof window !== "undefined") {
    window.KnowledgeMap = { open: open, close: close, isOpen: isOpen };
  }
})();
