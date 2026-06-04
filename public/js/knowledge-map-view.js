// public/js/knowledge-map-view.js — Knowledge Map v3.8 (root-centric).
// Phase 2: focus-first root-radial VIEW. Phase 3: customization facets.
//
// Dependency-free (plain SVG + DOM): a focus cluster is ≤ ~29 lemmas (Phase-0)
// so no force simulation is needed. Exposes window.KnowledgeMap = { open, close,
// isOpen }. Data from window.KnowledgeMapData. Read-only; the view never writes.
//
// FACETS (Phase 3, Kumu model):
//   • layout    : radial | tree
//   • colorBy   : status | binyan | pos          (status = default, LingQ)
//   • sizeBy    : freq | uniform
//   • filters   : pos[] / binyan[] / status[]     (empty = show all)
//   • depth     : 1 | 2 rings                     (radial density control)
//   • saved views (localStorage kmapViews_v1)
//
// Theme via CSS vars + fallbacks (v3.7 dark trap). i18n via window.t. RTL-aware.

(function () {
  "use strict";

  var OVERLAY_ID = "knowledgeMapOverlay";
  var MOBILE_MAX = 640;
  var VIEWS_KEY = "kmapViews_v1";

  var STATUS_COLOR = {
    known:    "var(--kmap-known, #2e7d32)",
    learning: "var(--kmap-learning, #f0a500)",
    new:      "var(--kmap-new, #4f7bd6)",
  };
  // Categorical palettes (Okabe-Ito-derived; colour-blind friendly).
  var BINYAN_COLOR = {
    paal: "#4f7bd6", piel: "#e1812f", hifil: "#3f9e6b", nifal: "#b5562f",
    hitpael: "#8a63c7", pual: "#c2466b", hufal: "#6b7280",
  };
  var POS_COLOR = {
    verb: "#4f7bd6", noun: "#3f9e6b", adjective: "#e1812f", preposition: "#8a63c7",
    adverb: "#c2466b", pronoun: "#0e8a8a", conjunction: "#9a7b1f", numeral: "#7d7d7d",
    interrogative: "#b5562f", negation: "#555", propernoun: "#444",
  };
  var FALLBACK_COLOR = "var(--theme-text-secondary, #6b7280)";

  function T(key, fb) { try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fb; }
  function isRTL() { try { return document.documentElement.getAttribute("dir") === "rtl"; } catch (_) { return false; } }
  function isMobile() { try { return window.matchMedia("(max-width: " + MOBILE_MAX + "px)").matches; } catch (_) { return false; } }
  function el(tag, attrs, text) { var n = document.createElement(tag); if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; }
  function svgEl(tag, attrs) { var n = document.createElementNS("http://www.w3.org/2000/svg", tag); if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); return n; }
  function uniq(arr) { var s = new Set(); arr.forEach(function (x) { if (x) s.add(x); }); return Array.from(s).sort(); }

  var _state = {
    overlay: null, index: null, selectedRoot: null,
    focusHost: null, legendHost: null,
    facets: { layout: "radial", colorBy: "status", sizeBy: "freq",
              filters: { pos: [], binyan: [], status: [] }, depth: 1 },
  };

  function _radius(freq, sizeBy) {
    if (sizeBy === "uniform") return 14;
    var r = 9 + Math.sqrt(Math.max(1, freq)) * 3.2;
    return Math.max(9, Math.min(30, r));
  }
  function _colorFor(lemma, colorBy) {
    if (colorBy === "binyan") { var b = (lemma.binyans && lemma.binyans[0]) || ""; return BINYAN_COLOR[b] || FALLBACK_COLOR; }
    if (colorBy === "pos") { var p = (lemma.pos && lemma.pos[0]) || ""; return POS_COLOR[p] || FALLBACK_COLOR; }
    return STATUS_COLOR[lemma.status] || FALLBACK_COLOR;
  }

  // apply inclusion filters (empty array for a dim = no filter on that dim)
  function _applyFilters(lemmas, f) {
    return lemmas.filter(function (l) {
      if (f.status.length && f.status.indexOf(l.status) === -1) return false;
      if (f.binyan.length && !(l.binyans || []).some(function (b) { return f.binyan.indexOf(b) !== -1; })) return false;
      if (f.pos.length && !(l.pos || []).some(function (p) { return f.pos.indexOf(p) !== -1; })) return false;
      return true;
    });
  }

  // ── read-only guard (parity with knowledge-map-data.js _q) ───────────────
  var _READONLY_RE = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
  var _FORBIDDEN_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
  async function _q(sql, params) {
    var ldb = (typeof window !== "undefined") && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== "function") throw new Error("knowledge-map: local-db not ready");
    var s = String(sql || "");
    if (!_READONLY_RE.test(s) || _FORBIDDEN_RE.test(s)) throw new Error("knowledge-map: refused non-SELECT SQL (read-only invariant)");
    return ldb.dbQuery(s, params || []);
  }
  // Lazy preview (single row, on user tap only). Allowed body scalars for the
  // preview = meaning + niqqud_variant (declared in spec §5); routed through the
  // read-only guard so the view cannot open a write path.
  async function _fetchPreview(noteId) {
    if (!noteId) return null;
    try {
      var rows = await _q(
        "SELECT json_extract(body_json,'$.meaning') AS meaning," +
        " json_extract(body_json,'$.niqqud_variant') AS niqqud" +
        " FROM notes_v2 WHERE id = ? LIMIT 1", [String(noteId)]);
      return (rows && rows[0]) || null;
    } catch (_) { return null; }
  }

  // ── overlay shell ────────────────────────────────────────────────────────
  function _buildShell() {
    var prev = document.getElementById(OVERLAY_ID);
    if (prev) prev.parentNode.removeChild(prev);
    var overlay = el("div", { id: OVERLAY_ID, "data-kmap-overlay": "1", role: "dialog",
      "aria-modal": "true", "aria-label": T("knowledgeMap.title", "Карта знаний"), tabindex: "-1" });
    overlay.style.cssText = "position:fixed;inset:0;z-index:10050;display:flex;flex-direction:column;" +
      "background:var(--theme-bg-page,var(--theme-bg,#f4f6f9));color:var(--theme-text-primary,var(--theme-text,#0f172a));font-family:inherit;";
    var header = el("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;flex-shrink:0;border-bottom:1px solid var(--theme-border-soft,var(--theme-border,#e2e8f0));";
    var title = el("strong", null, "🌳 " + T("knowledgeMap.title", "Карта знаний")); title.style.cssText = "font-size:16px;";
    var spacer = el("div"); spacer.style.cssText = "flex:1;";
    var closeBtn = el("button", { "data-kmap-close": "1", "aria-label": T("knowledgeMap.close", "Закрыть") }, "✕");
    closeBtn.style.cssText = "width:auto;min-width:34px;height:34px;border-radius:8px;cursor:pointer;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;font-size:15px;";
    closeBtn.addEventListener("click", close);
    header.appendChild(title); header.appendChild(spacer); header.appendChild(closeBtn);
    var body = el("div", { "data-kmap-body": "1" });
    body.style.cssText = "flex:1;min-height:0;display:flex;overflow:hidden;";
    overlay.appendChild(header); overlay.appendChild(body);
    document.body.appendChild(overlay);
    overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    _state.overlay = overlay;
    return { overlay: overlay, body: body };
  }

  // ── facets toolbar ─────────────────────────────────────────────────────
  function _selectControl(label, value, options, onChange, key) {
    var wrap = el("label"); wrap.style.cssText = "display:inline-flex;align-items:center;gap:4px;font-size:11px;opacity:.85;";
    wrap.appendChild(document.createTextNode(label));
    var sel = el("select", key ? { "data-kmap-ctl": key } : null); sel.style.cssText = "font-size:12px;padding:3px 6px;border-radius:6px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;";
    options.forEach(function (o) { var opt = el("option", { value: o.v }, o.label); if (o.v === value) opt.selected = true; sel.appendChild(opt); });
    sel.addEventListener("change", function () { onChange(sel.value); });
    wrap.appendChild(sel); return wrap;
  }
  function _chipFilter(label, dim, values) {
    var wrap = el("div"); wrap.style.cssText = "display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:11px;";
    wrap.appendChild(el("span", { style: "opacity:.7;" }, label + ":"));
    var active = _state.facets.filters[dim];
    values.forEach(function (v) {
      var on = active.indexOf(v) !== -1;
      var chip = el("button", { type: "button", "data-kmap-filter": dim + ":" + v });
      chip.style.cssText = "width:auto;cursor:pointer;font-size:11px;padding:2px 8px;border-radius:999px;display:inline-flex;align-items:center;gap:4px;border:1px solid var(--theme-border-soft,#e2e8f0);" +
        "background:" + (on ? "var(--theme-accent,#2563eb)" : "var(--theme-bg-card,#fff)") + ";color:" + (on ? "#fff" : "inherit") + ";";
      if (dim === "status" && STATUS_COLOR[v]) { var sd = el("span"); sd.style.cssText = "width:8px;height:8px;border-radius:50%;background:" + STATUS_COLOR[v] + ";"; chip.appendChild(sd); }
      chip.appendChild(document.createTextNode(v));
      chip.addEventListener("click", function () {
        var a = _state.facets.filters[dim]; var i = a.indexOf(v);
        if (i === -1) a.push(v); else a.splice(i, 1);
        _rerenderFocus(); _rebuildFacets();
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function _clusterValues() {
    // distinct pos/binyan present in the current cluster (for filter chips)
    var cl = _currentClusterLemmas(true); // unfiltered
    var pos = [], bin = [];
    cl.forEach(function (l) { (l.pos || []).forEach(function (p) { pos.push(p); }); (l.binyans || []).forEach(function (b) { bin.push(b); }); });
    return { pos: uniq(pos), binyan: uniq(bin), status: ["known", "learning", "new"] };
  }
  function _currentClusterLemmas(unfiltered) {
    if (!_state.index || !_state.selectedRoot) return [];
    var root = _state.index.roots.find(function (r) { return r.id === _state.selectedRoot; });
    if (!root) return [];
    var set = new Set(root.lemmaKeys);
    var lemmas = _state.index.lemmas.filter(function (l) { return set.has(l.id); });
    return unfiltered ? lemmas : _applyFilters(lemmas, _state.facets.filters);
  }

  function _buildFacetsBar() {
    var bar = el("div", { "data-kmap-facets": "1" });
    bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:8px 12px;flex-shrink:0;" +
      "border-bottom:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);";
    var f = _state.facets;
    bar.appendChild(_selectControl(T("knowledgeMap.facets.layout", "Раскладка"), f.layout,
      [{ v: "radial", label: T("knowledgeMap.facets.radial", "радиал") }, { v: "tree", label: T("knowledgeMap.facets.tree", "дерево") }],
      function (v) { f.layout = v; _rerenderFocus(); }, "layout"));
    bar.appendChild(_selectControl(T("knowledgeMap.facets.color", "Цвет"), f.colorBy,
      [{ v: "status", label: T("knowledgeMap.facets.byStatus", "статус") }, { v: "binyan", label: T("knowledgeMap.facets.byBinyan", "биньян") }, { v: "pos", label: T("knowledgeMap.facets.byPos", "часть речи") }],
      function (v) { f.colorBy = v; _rerenderFocus(); }, "color"));
    bar.appendChild(_selectControl(T("knowledgeMap.facets.size", "Размер"), f.sizeBy,
      [{ v: "freq", label: T("knowledgeMap.facets.byFreq", "частотность") }, { v: "uniform", label: T("knowledgeMap.facets.uniform", "одинаково") }],
      function (v) { f.sizeBy = v; _rerenderFocus(); }, "size"));
    bar.appendChild(_selectControl(T("knowledgeMap.facets.depth", "Глубина"), String(f.depth),
      [{ v: "1", label: "1" }, { v: "2", label: "2" }],
      function (v) { f.depth = Number(v) || 1; _rerenderFocus(); }, "depth"));
    // filters (cluster-scoped)
    var cv = _clusterValues();
    bar.appendChild(_chipFilter(T("knowledgeMap.facets.status", "Статус"), "status", cv.status));
    if (cv.binyan.length) bar.appendChild(_chipFilter(T("knowledgeMap.facets.binyan", "Биньян"), "binyan", cv.binyan));
    if (cv.pos.length) bar.appendChild(_chipFilter(T("knowledgeMap.facets.pos", "Часть речи"), "pos", cv.pos));
    // saved views
    bar.appendChild(_buildSavedViews());
    // dynamic legend
    var legend = el("div", { "data-kmap-legend": "1" }); legend.style.cssText = "margin-inline-start:auto;display:flex;gap:10px;flex-wrap:wrap;font-size:11px;";
    _state.legendHost = legend; bar.appendChild(legend);
    return bar;
  }
  function _rebuildFacets() {
    var old = _state.overlay && _state.overlay.querySelector("[data-kmap-facets]");
    if (old && old.parentNode) { var fresh = _buildFacetsBar(); old.parentNode.replaceChild(fresh, old); _renderLegend(); }
  }

  // ── saved views (localStorage) ───────────────────────────────────────────
  function _loadViews() { try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]") || []; } catch (_) { return []; } }
  function _storeViews(v) { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch (_) {} }
  function _buildSavedViews() {
    var wrap = el("div"); wrap.style.cssText = "display:inline-flex;align-items:center;gap:4px;font-size:11px;";
    var views = _loadViews();
    var sel = el("select", { "data-kmap-views": "1", "aria-label": T("knowledgeMap.facets.views", "Сохранённые виды…") }); sel.style.cssText = "font-size:12px;padding:3px 6px;border-radius:6px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;";
    sel.appendChild(el("option", { value: "" }, T("knowledgeMap.facets.views", "Сохранённые виды…")));
    views.forEach(function (v) { sel.appendChild(el("option", { value: v.name }, v.name)); });
    sel.addEventListener("change", function () {
      var v = _loadViews().find(function (x) { return x.name === sel.value; });
      if (v && v.facets) {
        _state.facets = JSON.parse(JSON.stringify(v.facets));
        if (v.selectedRoot && _state.index && _state.index.roots.some(function (r) { return r.id === v.selectedRoot; })) _state.selectedRoot = v.selectedRoot;
        _rerenderFocus(); _rebuildFacets();
      }
    });
    var save = el("button", { type: "button", "aria-label": T("knowledgeMap.facets.save", "Сохранить вид") }, isMobile() ? "＋" : "＋ " + T("knowledgeMap.facets.saveShort", "Сохранить"));
    save.style.cssText = "width:auto;cursor:pointer;font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;";
    save.title = T("knowledgeMap.facets.save", "Сохранить вид");
    save.addEventListener("click", function () {
      var name = (window.prompt && window.prompt(T("knowledgeMap.facets.savePrompt", "Название вида:"))) || "";
      name = String(name).trim(); if (!name) return;
      var vs = _loadViews().filter(function (x) { return x.name !== name; });
      vs.push({ name: name, facets: JSON.parse(JSON.stringify(_state.facets)), selectedRoot: _state.selectedRoot });
      _storeViews(vs); _rebuildFacets();
    });
    var del = el("button", { type: "button", "aria-label": T("knowledgeMap.facets.delete", "Удалить вид") }, "🗑");
    del.style.cssText = "width:auto;cursor:pointer;font-size:12px;padding:2px 7px;border-radius:6px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;";
    del.title = T("knowledgeMap.facets.delete", "Удалить выбранный вид");
    del.addEventListener("click", function () {
      var name = sel.value; if (!name) return;
      _storeViews(_loadViews().filter(function (x) { return x.name !== name; })); _rebuildFacets();
    });
    wrap.appendChild(sel); wrap.appendChild(save); wrap.appendChild(del);
    return wrap;
  }

  // ── dynamic legend (reflects colorBy) ────────────────────────────────────
  function _renderLegend() {
    var host = _state.legendHost; if (!host) return; host.innerHTML = "";
    var cb = _state.facets.colorBy, items = [];
    if (cb === "status") items = [["known", T("knowledgeMap.status.known", "знаю")], ["learning", T("knowledgeMap.status.learning", "учу")], ["new", T("knowledgeMap.status.new", "новое")]].map(function (p) { return [STATUS_COLOR[p[0]], p[1]]; });
    else {
      var present = uniq(_currentClusterLemmas(false).map(function (l) { return cb === "binyan" ? (l.binyans[0] || "") : (l.pos[0] || ""); }));
      items = present.map(function (v) { return [(cb === "binyan" ? BINYAN_COLOR[v] : POS_COLOR[v]) || FALLBACK_COLOR, v]; });
    }
    items.forEach(function (it) {
      var s = el("span"); s.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      var d = el("span"); d.style.cssText = "width:10px;height:10px;border-radius:50%;background:" + it[0] + ";";
      s.appendChild(d); s.appendChild(document.createTextNode(it[1])); host.appendChild(s);
    });
    // the cluster-dominant binyan is hidden from per-spoke labels — name it once here
    if (_state._dom) host.appendChild(el("span", { style: "opacity:.6;" }, T("knowledgeMap.facets.mainBinyan", "осн. биньян") + ": " + _state._dom));
  }

  // ── ranked root list ─────────────────────────────────────────────────────
  function _buildRootList(roots, onPick) {
    var pane = el("div", { "data-kmap-rootlist": "1" });
    pane.style.cssText = "display:flex;flex-direction:column;min-height:0;border-inline-end:1px solid var(--theme-border-soft,#e2e8f0);" + (isMobile() ? "width:100%;" : "width:260px;flex-shrink:0;");
    var search = el("input", { type: "search", "data-kmap-search": "1", placeholder: T("knowledgeMap.searchPlaceholder", "Поиск корня…") });
    search.style.cssText = "margin:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;";
    pane.appendChild(search);
    var listWrap = el("div", { "data-kmap-rootlist-items": "1" }); listWrap.style.cssText = "overflow-y:auto;padding:0 8px 12px;"; pane.appendChild(listWrap);
    function render(q) {
      listWrap.innerHTML = ""; var nq = String(q || "").replace(/[֑-ׇ]/g, "").trim(); var shown = 0;
      for (var i = 0; i < roots.length; i++) {
        var r = roots[i]; if (nq && r.rawId.indexOf(nq) === -1) continue; if (shown >= 400) break; shown++;
        var card = el("button", { "data-kmap-root": r.rawId, type: "button" });
        card.style.cssText = "width:100%;text-align:start;display:flex;align-items:center;gap:8px;padding:9px 10px;margin:3px 0;border-radius:8px;cursor:pointer;border:1px solid " + (r.id === _state.selectedRoot ? "var(--theme-accent,#2563eb)" : "transparent") + ";background:var(--theme-bg-card,#fff);color:inherit;";
        var dot = el("span"); dot.style.cssText = "width:10px;height:10px;border-radius:50%;flex-shrink:0;background:" + STATUS_COLOR[r.status] + ";";
        var lbl = el("span", null, r.label); lbl.style.cssText = "font-weight:600;font-size:15px;letter-spacing:1px;";
        var meta = el("span", null, "×" + r.freq + " · " + r.memberCount); meta.style.cssText = "margin-inline-start:auto;font-size:11px;opacity:.6;";
        card.appendChild(dot); card.appendChild(lbl); card.appendChild(meta);
        card.addEventListener("click", (function (rk) { return function () { onPick(rk); }; })(r.id));
        listWrap.appendChild(card);
      }
      if (shown === 0) listWrap.appendChild(el("div", { style: "padding:16px;opacity:.6;font-size:13px;" }, T("knowledgeMap.noRoots", "Ничего не найдено")));
    }
    search.addEventListener("input", function () { render(search.value); });
    render("");
    var st = _state.index && _state.index.stats;
    if (st && st.rootless > 0) pane.appendChild(el("div", { style: "padding:8px 12px;font-size:11px;opacity:.6;border-top:1px solid var(--theme-border-soft,#e2e8f0);flex-shrink:0;" }, "+ " + st.rootless + " " + T("knowledgeMap.functionWords", "служебных слов (вне карты корней)")));
    return { pane: pane, render: render };
  }

  // ── focus render (radial | tree), facet-aware ────────────────────────────
  function _rerenderFocus() {
    if (_state.focusHost && _state.selectedRoot) _renderFocus(_state.focusHost, _state.selectedRoot);
  }
  function _renderFocus(host, rootKey) {
    _state.selectedRoot = rootKey;
    var preview = host.querySelector("[data-kmap-preview]");
    host.innerHTML = ""; if (preview) host.appendChild(preview);
    var root = _state.index.roots.find(function (r) { return r.id === rootKey; });
    if (!root) { host.appendChild(el("div", { style: "margin:auto;opacity:.6;" }, T("knowledgeMap.pickRoot", "Выберите корень"))); return; }
    var lemmas = _currentClusterLemmas(false);
    var f = _state.facets;
    // dominant binyan → labelled once (legend) instead of on every spoke (R2/R4 declutter)
    var binCount = {}; lemmas.forEach(function (l) { var b = (l.binyans && l.binyans[0]) || ""; if (b) binCount[b] = (binCount[b] || 0) + 1; });
    _state._dom = Object.keys(binCount).sort(function (a, b) { return binCount[b] - binCount[a]; })[0] || "";
    // Option C: nodes are now sense-keyed, so a root family can hold two nodes
    // with the same lemma label (homograph senses). Mark colliding labels so
    // _placeNode disambiguates ONLY those with a gloss sub-label (no clutter on
    // the common case where every label is unique — R4 declutter).
    var labCount = {}; lemmas.forEach(function (l) { var k = l.label || ""; if (k) labCount[k] = (labCount[k] || 0) + 1; });
    _state._labelDupes = new Set(Object.keys(labCount).filter(function (k) { return labCount[k] > 1; }));
    var W = host.clientWidth || 600, H = host.clientHeight || 480;
    var svg = svgEl("svg", { width: "100%", height: "100%", viewBox: "0 0 " + W + " " + H, "data-kmap-svg": "1", style: "display:block;" });
    if (!lemmas.length) {
      host.appendChild(svg);
      var ef = el("div", { "data-kmap-emptyfilter": "1", style: "position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;opacity:.85;text-align:center;padding:20px;" });
      ef.appendChild(el("div", { style: "opacity:.7;" }, T("knowledgeMap.filteredEmpty", "Нет лемм под текущими фильтрами")));
      var reset = el("button", { type: "button" }, T("knowledgeMap.resetFilters", "Сбросить фильтры"));
      reset.style.cssText = "width:auto;cursor:pointer;font-size:13px;padding:6px 14px;border-radius:8px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;";
      reset.addEventListener("click", function () { _state.facets.filters = { pos: [], binyan: [], status: [] }; _rerenderFocus(); _rebuildFacets(); });
      ef.appendChild(reset); host.appendChild(ef);
      _renderLegend(); return;
    }
    if (f.layout === "tree") _layoutTree(svg, root, lemmas, W, H);
    else _layoutRadial(svg, root, lemmas, W, H);
    host.appendChild(svg);
    _renderLegend();
  }

  function _placeNode(svg, x, y, lemma) {
    var f = _state.facets;
    var g = svgEl("g", { "data-kmap-node": lemma.id, style: "cursor:pointer;" });
    var c = svgEl("circle", { cx: x, cy: y, r: _radius(lemma.freq, f.sizeBy), fill: _colorFor(lemma, f.colorBy), stroke: "var(--theme-bg-card,#fff)", "stroke-width": "2" });
    var t = svgEl("text", { x: x, y: y + _radius(lemma.freq, f.sizeBy) + 12, "text-anchor": "middle", "font-size": "13", fill: "var(--theme-text-primary,#0f172a)", direction: "rtl" });
    t.textContent = lemma.label; g.appendChild(c); g.appendChild(t);
    // Disambiguate homograph senses sharing a label: small muted gloss line.
    if (lemma.meaning && _state._labelDupes && _state._labelDupes.has(lemma.label)) {
      var gloss = lemma.meaning.length > 18 ? (lemma.meaning.slice(0, 17) + "…") : lemma.meaning;
      var st = svgEl("text", { x: x, y: y + _radius(lemma.freq, f.sizeBy) + 25, "text-anchor": "middle", "font-size": "10", fill: "var(--theme-text-secondary,#64748b)", opacity: "0.85" });
      st.textContent = gloss; g.appendChild(st);
    }
    g.addEventListener("click", function () { _showPreview(_state.focusHost, lemma); });
    svg.appendChild(g);
  }
  function _centerRoot(svg, root, cx, cy) {
    var g = svgEl("g", { "data-kmap-rootnode": root.id });
    var rc = svgEl("circle", { cx: cx, cy: cy, r: 34, fill: "var(--theme-bg-card,#fff)", stroke: STATUS_COLOR[root.status], "stroke-width": "3" });
    var rt = svgEl("text", { x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": "18", "font-weight": "700", fill: "var(--theme-text-primary,#0f172a)", direction: "rtl", "letter-spacing": "2" });
    rt.textContent = root.label; g.appendChild(rc); g.appendChild(rt); svg.appendChild(g);
  }
  function _edgeLabelFor(root, lemma) {
    var e = (_state.index.edges || []).find(function (x) { return x.source === root.id && x.target === lemma.id; });
    return (e && e.label) || "";
  }

  function _showEdgeLabel(lab) {
    // never on mobile (clutter); on desktop skip the cluster-dominant binyan
    // (shown once in the legend) so only the informative minority binyanim show.
    return lab && !isMobile() && lab !== _state._dom;
  }
  function _layoutRadial(svg, root, lemmas, W, H) {
    var cx = W / 2, cy = H / 2;
    var rings = (_state.facets.depth >= 2 || (isMobile() && lemmas.length > 8)) ? 2 : 1;
    var maxR = Math.max(70, Math.min(W, H) / 2 - 60);
    var groups;
    if (rings === 2 && lemmas.length > 6) {
      var sorted = lemmas.slice().sort(function (a, b) { return b.freq - a.freq || a.id.localeCompare(b.id); });
      var half = Math.ceil(sorted.length / 2);
      groups = [{ r: maxR * 0.58, items: sorted.slice(0, half) }, { r: maxR, items: sorted.slice(half) }];
    } else { groups = [{ r: maxR, items: lemmas.slice() }]; }
    groups.forEach(function (grp) {
      var n = grp.items.length;
      grp.items.forEach(function (lemma, i) {
        var ang = (i / Math.max(1, n)) * 2 * Math.PI - Math.PI / 2;
        var px = cx + grp.r * Math.cos(ang), py = cy + grp.r * Math.sin(ang);
        svg.appendChild(svgEl("line", { x1: cx, y1: cy, x2: px, y2: py, stroke: "var(--theme-border-soft,#cbd5e1)", "stroke-width": "1.2" }));
        var lab = _edgeLabelFor(root, lemma);
        if (_showEdgeLabel(lab)) { var mx = cx + (grp.r * 0.55) * Math.cos(ang), my = cy + (grp.r * 0.55) * Math.sin(ang); var et = svgEl("text", { x: mx, y: my, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": "9", fill: "var(--theme-text-secondary,#64748b)", opacity: "0.8" }); et.textContent = lab; svg.appendChild(et); }
        _placeNode(svg, px, py, lemma);
      });
    });
    _centerRoot(svg, root, cx, cy);
  }

  function _layoutTree(svg, root, lemmas, W, H) {
    var cx = W / 2, topY = 70;
    _centerRoot(svg, root, cx, topY);
    var sorted = lemmas.slice().sort(function (a, b) { var ba = (a.binyans[0] || "zz"), bb = (b.binyans[0] || "zz"); return ba.localeCompare(bb) || b.freq - a.freq; });
    var perRow = Math.max(4, Math.min(8, Math.ceil(Math.sqrt(sorted.length) + 1)));
    var rows = Math.ceil(sorted.length / perRow);
    var rowGap = Math.max(90, (H - topY - 80) / Math.max(1, rows));
    sorted.forEach(function (lemma, i) {
      var row = Math.floor(i / perRow), col = i % perRow;
      var inRow = Math.min(perRow, sorted.length - row * perRow);
      var x = (W / (inRow + 1)) * (col + 1);
      var y = topY + 90 + row * rowGap;
      svg.appendChild(svgEl("line", { x1: cx, y1: topY + 34, x2: x, y2: y - 18, stroke: "var(--theme-border-soft,#cbd5e1)", "stroke-width": "1.1" }));
      var lab = _edgeLabelFor(root, lemma);
      if (_showEdgeLabel(lab)) { var et = svgEl("text", { x: (cx + x) / 2, y: (topY + 34 + y - 18) / 2, "text-anchor": "middle", "font-size": "9", fill: "var(--theme-text-secondary,#64748b)", opacity: "0.75" }); et.textContent = lab; svg.appendChild(et); }
      _placeNode(svg, x, y, lemma);
    });
  }

  // ── preview card ─────────────────────────────────────────────────────────
  async function _showPreview(host, lemma) {
    if (!host) return;
    var old = host.querySelector("[data-kmap-preview]"); if (old) old.parentNode.removeChild(old);
    var card = el("div", { "data-kmap-preview": "1" });
    card.style.cssText = "position:absolute;inset-inline-end:12px;top:12px;width:240px;max-width:70%;background:var(--theme-bg-card,#fff);color:var(--theme-text-primary,#0f172a);border:1px solid var(--theme-border-soft,#e2e8f0);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:12px;font-size:13px;z-index:2;";
    var head = el("div"); head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
    var dot = el("span"); dot.style.cssText = "width:10px;height:10px;border-radius:50%;background:" + STATUS_COLOR[lemma.status] + ";";
    var lem = el("strong", null, lemma.label); lem.style.cssText = "font-size:17px;letter-spacing:1px;";
    var x = el("button", { "aria-label": T("knowledgeMap.close", "Закрыть") }, "✕"); x.style.cssText = "width:auto;margin-inline-start:auto;border:none;background:none;cursor:pointer;color:inherit;font-size:13px;";
    x.addEventListener("click", function () { card.parentNode && card.parentNode.removeChild(card); });
    head.appendChild(dot); head.appendChild(lem); head.appendChild(x); card.appendChild(head);
    var sub = el("div"); sub.style.cssText = "opacity:.75;margin-bottom:6px;"; var bits = [];
    if (lemma.binyans && lemma.binyans.length) bits.push(lemma.binyans.join("/"));
    if (lemma.pos && lemma.pos.length) bits.push(lemma.pos.join("/"));
    bits.push("×" + lemma.freq); bits.push(T("knowledgeMap.status." + lemma.status, lemma.status));
    sub.textContent = bits.join(" · "); card.appendChild(sub);
    var glossEl = el("div", { "data-kmap-gloss": "1" }, T("knowledgeMap.loading", "…")); glossEl.style.cssText = "min-height:18px;"; card.appendChild(glossEl);
    // provenance + onward path (no dead-end): show source-text count + open it
    var nTexts = (lemma.textIds || []).length;
    if (nTexts) card.appendChild(el("div", { style: "opacity:.6;margin-top:6px;font-size:11px;" }, T("knowledgeMap.inTexts", "в текстах") + ": " + nTexts));
    var tId = (lemma.textIds && lemma.textIds[0]) || null;
    if (tId && typeof window.v3IdeOpenTextFromLibrary === "function") {
      var openBtn = el("button", { type: "button", "data-kmap-opentext": "1" }, "📖 " + T("knowledgeMap.openText", "Открыть текст"));
      openBtn.style.cssText = "width:auto;margin-top:8px;cursor:pointer;font-size:12px;padding:6px 12px;border-radius:8px;border:1px solid var(--theme-accent,#2563eb);background:var(--theme-accent,#2563eb);color:#fff;";
      openBtn.addEventListener("click", function () { var fn = window.v3IdeOpenTextFromLibrary; close(); try { fn(tId); } catch (_) {} });
      card.appendChild(openBtn);
    }
    host.appendChild(card);
    var noteId = (lemma.noteIds && lemma.noteIds[0]) || null;
    var pv = await _fetchPreview(noteId);
    glossEl.textContent = "";
    if (pv && pv.niqqud) { var nq = el("div", null, pv.niqqud); nq.style.cssText = "font-size:18px;direction:rtl;letter-spacing:1px;margin-bottom:2px;"; glossEl.appendChild(nq); }
    glossEl.appendChild(el("div", null, (pv && pv.meaning) || T("knowledgeMap.noGloss", "(нет перевода)")));
  }

  // ── mobile ───────────────────────────────────────────────────────────────
  function _renderMobile(body, roots) {
    body.style.flexDirection = "column";
    var rl = _buildRootList(roots, function (rootKey) { _openRootSheet(body, rootKey); });
    body.appendChild(rl.pane);
  }
  function _openRootSheet(body, rootKey) {
    var prev = document.querySelector("[data-kmap-sheet]"); if (prev) prev.parentNode.removeChild(prev);
    var sheet = el("div", { "data-kmap-sheet": "1" });
    sheet.style.cssText = "position:fixed;inset:0;z-index:10060;background:var(--theme-bg-page,#f4f6f9);display:flex;flex-direction:column;";
    var bar = el("div"); bar.style.cssText = "padding:10px 14px;border-bottom:1px solid var(--theme-border-soft,#e2e8f0);display:flex;gap:8px;align-items:center;";
    var back = el("button", null, (isRTL() ? "→ " : "← ") + T("knowledgeMap.back", "Назад")); back.style.cssText = "width:auto;border:none;background:none;cursor:pointer;color:inherit;font-size:14px;";
    back.addEventListener("click", function () { sheet.parentNode.removeChild(sheet); });
    var gear = el("button", { "aria-expanded": "false" }, "⚙ " + T("knowledgeMap.facets.settings", "Вид")); gear.style.cssText = "width:auto;margin-inline-start:auto;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;cursor:pointer;border-radius:8px;padding:4px 10px;font-size:13px;";
    bar.appendChild(back); bar.appendChild(gear); sheet.appendChild(bar);
    var fbar = _buildFacetsBar(); fbar.style.display = "none"; sheet.appendChild(fbar);
    gear.addEventListener("click", function () { var open = fbar.style.display === "none"; fbar.style.display = open ? "flex" : "none"; gear.setAttribute("aria-expanded", String(open)); });
    var host = el("div"); host.style.cssText = "position:relative;flex:1;min-height:0;"; sheet.appendChild(host);
    document.body.appendChild(sheet);
    _state.focusHost = host; _renderFocus(host, rootKey); _renderLegend();
  }

  // ── open / close ───────────────────────────────────────────────────────
  async function open(opts) {
    opts = opts || {};
    var shell = _buildShell(); var body = shell.body;
    body.appendChild(el("div", { style: "margin:auto;opacity:.7;" }, T("knowledgeMap.loading", "Строим карту знаний…")));
    try { shell.overlay.focus(); } catch (_) {}
    try { _state.index = await window.KnowledgeMapData.build(opts.build || {}); }
    catch (e) { body.innerHTML = ""; body.appendChild(el("div", { style: "margin:auto;color:var(--theme-danger,#c0392b);" }, T("knowledgeMap.error", "Не удалось построить карту") + " — " + (e && e.message ? e.message : e))); return; }
    var roots = await window.KnowledgeMapData.rankRoots({ _index: _state.index });
    body.innerHTML = "";
    if (!roots.length) { body.appendChild(el("div", { style: "margin:auto;text-align:center;opacity:.75;max-width:320px;padding:20px;" }, T("knowledgeMap.emptyHint", "Нет корневых данных. Импортируйте библиотеку с word-заметками, чтобы построить карту корней."))); return; }
    if (isMobile()) { _renderMobile(body, roots); return; }
    // desktop: root list + (facets bar over focus)
    _state.selectedRoot = roots[0].id;
    var rl = _buildRootList(roots, function (rootKey) { _renderFocus(_state.focusHost, rootKey); _rebuildFacets(); _highlightRoot(rootKey); });
    var col = el("div"); col.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;";
    var facets = _buildFacetsBar();
    var focus = el("div", { "data-kmap-focus": "1" }); focus.style.cssText = "position:relative;flex:1;min-height:0;";
    col.appendChild(facets); col.appendChild(focus);
    body.appendChild(rl.pane); body.appendChild(col);
    _state.focusHost = focus;
    _renderFocus(focus, roots[0].id);
    _highlightRoot(roots[0].id);
  }
  function _highlightRoot(rootKey) {
    if (!_state.overlay) return;
    var raw = String(rootKey || "").replace(/^root:/, "");
    _state.overlay.querySelectorAll("[data-kmap-root]").forEach(function (b) {
      b.style.borderColor = (b.getAttribute("data-kmap-root") === raw) ? "var(--theme-accent,#2563eb)" : "transparent";
    });
  }
  function close() {
    var o = document.getElementById(OVERLAY_ID); if (o) o.parentNode.removeChild(o);
    var sheet = document.querySelector("[data-kmap-sheet]"); if (sheet) sheet.parentNode.removeChild(sheet);
    _state.overlay = null; _state.index = null; _state.selectedRoot = null; _state.focusHost = null; _state.legendHost = null;
    _state.facets = { layout: "radial", colorBy: "status", sizeBy: "freq", filters: { pos: [], binyan: [], status: [] }, depth: 1 };
  }
  function isOpen() { return !!document.getElementById(OVERLAY_ID); }

  if (typeof window !== "undefined") window.KnowledgeMap = { open: open, close: close, isOpen: isOpen };
})();
