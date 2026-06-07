// public/js/knowledge-map-quiz-loader.js — Knowledge Map v3.8 Phase 4
// lazy-load shim for the generative graph-quiz.
//
// This tiny file is eagerly loaded into index.html so launcher buttons (the
// root-sheet «Потренировать корень», the i+1 «Учить дальше» entry, the
// knowledge-commit toast) can bind at load time. The heavy quiz module
// (/js/knowledge-map-quiz.js) is injected on first .open() — keeping classic
// boot cost flat, mirroring notes-graph-loader.js.
//
// The quiz chunk IS precached in sw.js PRECACHE_URLS (offline-instant first
// open, same pattern as jszip) but executed lazily here.
//
// On open():
//   1. lazy-inject the quiz chunk (idempotent, dependency-order safe).
//   2. defer to window.KnowledgeMapQuiz.open(opts).
//   3. on chunk-load failure → minimal error dialog (never a blank screen).

(function () {
  "use strict";

  // Load the dormant connection-recall bridge (read-only, no consumer until now)
  // BEFORE the quiz module so item type (5) can source real confirmed links.
  var QUIZ_CHUNKS = ["/js/notes-graph-srs-candidates.js", "/js/knowledge-map-quiz.js"];
  var _loaded = false, _loading = null;

  function _loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-kmquiz-chunk="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load", function () { resolve(); }, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      var s = document.createElement("script");
      s.src = src; s.async = false; s.dataset.kmquizChunk = src;
      s.addEventListener("load", function () { s.dataset.loaded = "1"; resolve(); }, { once: true });
      s.addEventListener("error", function () { reject(new Error("km-quiz chunk failed: " + src)); }, { once: true });
      document.head.appendChild(s);
    });
  }
  async function _loadOnce() {
    if (_loaded) return;
    if (_loading) return _loading;
    _loading = (async function () {
      for (var i = 0; i < QUIZ_CHUNKS.length; i++) { await _loadScript(QUIZ_CHUNKS[i]); }
      _loaded = true;
    })();
    try { await _loading; } finally { _loading = null; }
  }

  function T(key, fb) { try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fb; }
  function _renderChunkLoadError(err) {
    var stale = document.getElementById("kmQuizErrOverlay");
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    var overlay = document.createElement("div");
    overlay.id = "kmQuizErrOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10520;display:flex;align-items:center;justify-content:center;padding:32px;";
    var panel = document.createElement("div");
    panel.setAttribute("role", "alertdialog"); panel.setAttribute("aria-modal", "true");
    panel.style.cssText = "background:var(--theme-bg,#fff);color:var(--theme-text,#000);border-radius:12px;max-width:520px;width:100%;padding:24px 26px;box-shadow:0 12px 40px rgba(0,0,0,0.35);";
    var h = document.createElement("h3"); h.style.cssText = "margin:0 0 12px 0;font-size:17px;"; h.textContent = T("kmquiz.title", "Тренировка корней");
    var p = document.createElement("p"); p.style.cssText = "margin:0 0 16px 0;line-height:1.5;";
    p.textContent = T("kmquiz.chunkError", "Не удалось загрузить модуль тренировки. Проверьте соединение и обновите страницу.");
    var row = document.createElement("div"); row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
    var closeB = document.createElement("button"); closeB.className = "btn-secondary"; closeB.textContent = T("kmquiz.close", "Закрыть");
    var retryB = document.createElement("button"); retryB.className = "btn-primary"; retryB.textContent = T("kmquiz.retry", "Повторить");
    row.appendChild(closeB); row.appendChild(retryB);
    panel.appendChild(h); panel.appendChild(p); panel.appendChild(row);
    overlay.appendChild(panel); document.body.appendChild(overlay);
    var close = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    closeB.addEventListener("click", close);
    retryB.addEventListener("click", function () {
      close(); _loaded = false; _loading = null;
      for (var i = 0; i < QUIZ_CHUNKS.length; i++) {
        var node = document.querySelector('script[data-kmquiz-chunk="' + QUIZ_CHUNKS[i] + '"]');
        if (node && node.dataset.loaded !== "1" && node.parentNode) node.parentNode.removeChild(node);
      }
      api.open(api._lastOpts || {});
    });
    overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    try { retryB.focus(); } catch (_) {}
    if (err && err.message) console.warn("[km-quiz] chunk load failed:", err.message);
  }

  var api = {
    _lastOpts: null,
    async open(opts) {
      api._lastOpts = opts || {};
      try { await _loadOnce(); }
      catch (e) { _renderChunkLoadError(e); return; }
      if (typeof window === "undefined" || !window.KnowledgeMapQuiz || typeof window.KnowledgeMapQuiz.open !== "function") {
        _renderChunkLoadError(new Error("KnowledgeMapQuiz module did not expose .open() after load"));
        return;
      }
      try { window.KnowledgeMapQuiz.open(opts || {}); }
      catch (e) { console.error("[km-quiz] open threw:", e); _renderChunkLoadError(e); }
    },
    isLoaded: function () { return _loaded; },
    _chunks: Object.freeze(QUIZ_CHUNKS.slice()),
  };

  if (typeof window !== "undefined") window.KnowledgeMapQuizLoader = api;
})();
