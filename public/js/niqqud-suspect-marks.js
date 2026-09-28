// Marks implausible pointings in the Studio table (O-033, owner decision 2026-09-28 (b)). The
// rules are a pure function of the pointed text, so nothing is stored per row: every card, old or
// new, shows the marks the moment it is drawn. A mark goes away when the owner edits that row's
// niqqud (the edit is the review) or when Dicta pointed the word exactly the same way (recorded
// on this device). renderTable is frozen by the reader-parity gate, so this wraps it, like
// studio-agent.js; the badge is an empty span whose text comes from CSS, so it never enters the
// cell's textContent used by copy and edit.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NiqqudSuspectMarks = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var STORE_KEY = "lp.niqqudConfirmed.v1";
  var STORE_MAX = 5000;
  var BADGE = "niqqud-suspect-badge";

  function key(word) {
    return String(word || "").normalize("NFC").replace(/[^א-ת֑-ׇ]/g, "");
  }

  function readConfirmed() {
    try {
      var list = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      return new Set(Array.isArray(list) ? list : []);
    } catch (_) { return new Set(); }
  }

  function confirm(words) {
    try {
      var list = Array.from(readConfirmed());
      (words || []).forEach(function (w) { var k = key(w); if (k && list.indexOf(k) < 0) list.push(k); });
      localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-STORE_MAX)));
    } catch (_) { /* marks just stay; nothing depends on this */ }
  }

  function editedNiqqud(row) {
    try {
      var meta = row && row.edit_meta_json;
      if (typeof meta === "string") meta = JSON.parse(meta);
      return !!(meta && meta.edited && meta.edited.he_niqqud);
    } catch (_) { return false; }
  }

  // Pure: which words of a pointed text deserve a mark, given the confirmed set.
  function suspects(text, confirmed, P) {
    if (!P) return [];
    return P.scan(text).filter(function (s) { return !confirmed || !confirmed.has(key(s.word)); });
  }

  function label(found, tr) {
    var words = found.map(function (s) {
      var reasons = s.reasons.map(function (r) { return tr("table.niqqudSuspect" + r); }).join(", ");
      return key(s.word) + " (" + reasons + ")";
    }).join("; ");
    return tr("table.niqqudSuspect", { words: words });
  }

  function ensureStyle() {
    if (document.getElementById("niqqud-suspect-style")) return;
    var style = document.createElement("style");
    style.id = "niqqud-suspect-style";
    // The sign carries the warning colour; the words use the readable secondary text colour.
    style.textContent = "." + BADGE + "{display:block;margin-block-start:4px;font:500 12px/1.4 system-ui;" +
      "color:var(--theme-text-secondary,#475569)}." + BADGE + "::before{content:'⚠ ';color:var(--theme-warning,#b45309)}" +
      "." + BADGE + "::after{content:attr(aria-label);}";
    document.head.appendChild(style);
  }

  function paint() {
    if (typeof document === "undefined" || (document.body && document.body.classList.contains("room-mode"))) return;
    var P = window.NiqqudPlausibility;
    var table = document.getElementById("proTable");
    if (!P || !table) return;
    var tr = function (k, params) { return typeof window.t === "function" ? window.t(k, params) : k; };
    var host = window.StudioAgentHost;
    var confirmed = readConfirmed();
    var cells = table.querySelectorAll('tbody tr[data-row-idx] td[data-col="niqqud"]');
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i];
      if (td.querySelector("." + BADGE)) continue;
      var idx = Number(td.parentNode.getAttribute("data-row-idx"));
      var row = host && host.getRow && Number.isFinite(idx) ? host.getRow(idx) : null;
      if (editedNiqqud(row)) continue;
      var found = suspects(td.textContent, confirmed, P);
      if (!found.length) continue;
      ensureStyle();
      var badge = document.createElement("span");
      badge.className = BADGE;
      badge.setAttribute("role", "note");
      badge.setAttribute("dir", "auto");
      badge.setAttribute("aria-label", label(found, tr));
      td.appendChild(badge);
    }
  }

  function wrapRenderTable() {
    if (typeof window === "undefined") return false;
    var orig = window.renderTable;
    if (typeof orig !== "function" || orig.__nsmWrapped) return false;
    var wrapped = function () {
      var out = orig.apply(this, arguments);
      try { paint(); } catch (_) {}
      return out;
    };
    wrapped.__nsmWrapped = true;
    // Keep other wrappers' flags visible so they do not wrap twice.
    Object.keys(orig).forEach(function (k) { wrapped[k] = orig[k]; });
    window.renderTable = wrapped;
    try { paint(); } catch (_) {}
    return true;
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    if (!wrapRenderTable()) document.addEventListener("DOMContentLoaded", wrapRenderTable);
  }

  return { confirm: confirm, suspects: suspects, key: key, paint: paint, editedNiqqud: editedNiqqud, STORE_KEY: STORE_KEY };
});
