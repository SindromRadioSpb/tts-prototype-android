// O-021: in the Hebrew interface a YouTube material shows its original (Hebrew) title instead of
// the author's Russian label; the Russian stays as the tooltip. Elements opt in with
// data-orig-video="<videoId>"; titles come from /api/media/original-title (cached server-side).
// Switching back to another language restores the original text.
(function () {
  "use strict";
  var cache = {};   // videoId → { title, author } | null

  function uiLocale() {
    try { return String((window.appGetLocale && window.appGetLocale()) || document.documentElement.lang || ""); }
    catch (_) { return ""; }
  }

  function apply(node, value) {
    if (!value || !value.title) return;
    if (!node.hasAttribute("data-lp-ru-title")) node.setAttribute("data-lp-ru-title", node.textContent);
    node.textContent = value.title;
    node.setAttribute("lang", "he");
    node.setAttribute("dir", "rtl");
    node.setAttribute("title", node.getAttribute("data-lp-ru-title"));
  }

  function restore(node) {
    if (!node.hasAttribute("data-lp-ru-title")) return;
    node.textContent = node.getAttribute("data-lp-ru-title");
    node.removeAttribute("data-lp-ru-title");
    node.removeAttribute("lang");
    node.removeAttribute("title");
    node.setAttribute("dir", "auto");
  }

  function paint(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = Array.prototype.slice.call(scope.querySelectorAll("[data-orig-video]"));
    var hebrew = uiLocale().indexOf("he") === 0;
    var need = [];
    nodes.forEach(function (node) {
      var id = node.getAttribute("data-orig-video");
      if (!id) return;
      if (!hebrew) { restore(node); return; }
      if (Object.prototype.hasOwnProperty.call(cache, id)) apply(node, cache[id]);
      else if (need.indexOf(id) < 0) need.push(id);
    });
    if (!hebrew || !need.length || typeof fetch !== "function") return Promise.resolve();
    var ids = need.slice(0, 60);
    return fetch("/api/media/original-title?ids=" + ids.join(","), { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        ids.forEach(function (id) { cache[id] = j && j.titles ? (j.titles[id] || null) : null; });
        nodes.forEach(function (node) {
          var id = node.getAttribute("data-orig-video");
          if (node.isConnected && Object.prototype.hasOwnProperty.call(cache, id)) apply(node, cache[id]);
        });
      })
      .catch(function () {});
  }

  window.LpOriginalTitle = { paint: paint };
  document.addEventListener("i18n:changed", function () { paint(document); });
})();
