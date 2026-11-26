// A reader's outlets (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §7): «мои» in their order,
// hidden outlets, folded groups and «Все | Мои» of the overview. One shape for a visitor (localStorage) and a
// signed-in reader (the account, db/newsReaderPrefs.js cleans it the same way).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NewsPrefs = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var KEY = "lp_news_prefs_v1", PIN_KEY = "lp_news_pinned_v1", NEW_MS = 7 * 86400000;
  var GROUP_KEYS = ["national", "local", "religious", "haredi", "economy_tech", "science_env", "society", "radio", "local:north", "local:jerusalem", "local:center", "local:south"];

  function uniq(list, known) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (id) { if (typeof id === "string" && known.indexOf(id) >= 0 && out.indexOf(id) < 0 && out.length < 60) out.push(id); });
    return out;
  }
  function normalize(raw, known) {
    var r = raw && typeof raw === "object" ? raw : {};
    var mine = uniq(r.mine, known), hidden = uniq(r.hidden, known).filter(function (id) { return mine.indexOf(id) < 0; });
    var collapsed = (Array.isArray(r.collapsed) ? r.collapsed : []).filter(function (g, i, a) { return GROUP_KEYS.indexOf(g) >= 0 && a.indexOf(g) === i; });
    return { v: 1, mine: mine, hidden: hidden, collapsed: collapsed, overview: r.overview === "mine" ? "mine" : "all" };
  }
  // The stored prefs; a broken value gives the defaults; the old ★ pins become «мои» once.
  function load(store, known) {
    var raw = store.get(KEY);
    if (raw != null) { try { return normalize(JSON.parse(raw), known); } catch (_) { return normalize({}, known); } }
    var pins = []; try { pins = JSON.parse(store.get(PIN_KEY) || "[]"); } catch (_) {}
    var p = normalize({ mine: pins }, known);
    save(store, p);
    return p;
  }
  function save(store, prefs) { store.set(KEY, JSON.stringify(prefs)); }
  function stateOf(p, id) { return p.mine.indexOf(id) >= 0 ? "mine" : p.hidden.indexOf(id) >= 0 ? "hidden" : "shown"; }
  function setState(p, id, state) {
    var mine = p.mine.filter(function (x) { return x !== id; }), hidden = p.hidden.filter(function (x) { return x !== id; });
    if (state === "mine") mine.push(id); else if (state === "hidden") hidden.push(id);
    return { v: 1, mine: mine, hidden: hidden, collapsed: p.collapsed.slice(), overview: p.overview };
  }
  function move(p, id, dir) {
    var mine = p.mine.slice(), i = mine.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= mine.length) return p;
    mine[i] = mine[j]; mine[j] = id;
    return { v: 1, mine: mine, hidden: p.hidden.slice(), collapsed: p.collapsed.slice(), overview: p.overview };
  }
  function toggleCollapsed(p, key) {
    var c = p.collapsed.indexOf(key) >= 0 ? p.collapsed.filter(function (x) { return x !== key; }) : p.collapsed.concat([key]);
    return { v: 1, mine: p.mine.slice(), hidden: p.hidden.slice(), collapsed: c, overview: p.overview };
  }
  // shown: the outlets the owner keeps in the slice (GET /api/news/outlets). «Мои» in the reader's order.
  function visible(p, shown, mode) {
    var byId = {}; shown.forEach(function (o) { byId[o.outlet_id] = o; });
    if (mode === "mine") return p.mine.map(function (id) { return byId[id]; }).filter(Boolean);
    return shown.filter(function (o) { return p.hidden.indexOf(o.outlet_id) < 0; });
  }
  // What the list asks the server for: null when nothing is filtered out.
  function outletsParam(p, shown, mode) {
    if (mode !== "mine" && !p.hidden.length) return null;
    return visible(p, shown, mode).map(function (o) { return o.outlet_id; });
  }
  function isNew(o, now) { var t = Date.parse(o && o.enabled_at || ""); return isFinite(t) && (now || Date.now()) - t < NEW_MS; }
  return { KEY: KEY, PIN_KEY: PIN_KEY, normalize: normalize, load: load, save: save, stateOf: stateOf, setState: setState, move: move, toggleCollapsed: toggleCollapsed,
    visible: visible, outletsParam: outletsParam, isNew: isNew };
});
