// public/js/notes-graph-loader.js — v3.3.6 Knowledge Graph lazy-load shim.
//
// This file is the ONLY graph-related script eagerly loaded into
// index.html. Everything else (the d3 UMD bundles, the data layer,
// the SVG renderer, the main module) loads on first user intent —
// when `window.LinguistProGraph.open()` is called.
//
// Acceptance (smoke-pinned in scripts/notes-graph/lazyload-smoke.js):
//   • Classic-view DOMContentLoaded MUST NOT regress beyond
//     baseline + 200 ms.
//   • `window.NotesGraph === undefined` until the first .open() call.
//   • `window.LinguistProGraph` itself exists immediately after this
//     file parses, so launcher buttons can be bound at load time.
//
// On open():
//   1. Mark loading state.
//   2. Inject 4 scripts in dependency order:
//        /vendor/d3-force.min.js   (UMD, defines window.d3 partial)
//        /vendor/d3-zoom.min.js    (UMD, extends window.d3)
//        /js/notes-graph-render.js (uses window.d3 + window.NotesGraphData)
//        /js/notes-graph.js        (defines window.NotesGraph; orchestrates)
//   3. After all 4 loads succeed, call window.NotesGraph.open()
//      which renders the modal.
//   4. On any chunk load failure → render the `error_chunk_load`
//      state (graph.state.error.chunkLoad copy) inside a minimal
//      modal — never leave the user staring at nothing.
//
// Service Worker (added in C8) caches the 4 chunks in a versioned
// GRAPH_CACHE bucket so the second open is offline-instant.

(function () {
  "use strict";

  // Pinned manifest — every chunk that may be loaded as part of the
  // graph feature. The privacy smoke uses this exact list as its
  // allow-list (see scripts/notes-graph/privacy-smoke.js case 1).
  const GRAPH_CHUNKS = [
    "/vendor/d3-force.min.js",
    "/vendor/d3-zoom.min.js",
    "/js/notes-graph-render.js",
    "/js/notes-graph.js",
  ];

  let _loaded = false;
  let _loading = null;       // Promise<void> while a load is in flight

  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      // Idempotent — if the script tag already exists, don't double-load.
      const existing = document.querySelector(`script[data-graph-chunk="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = false;     // preserve dependency order across chunks
      s.dataset.graphChunk = src;
      s.addEventListener("load", () => { s.dataset.loaded = "1"; resolve(); }, { once: true });
      s.addEventListener("error", () => reject(new Error(`graph chunk failed: ${src}`)), { once: true });
      document.head.appendChild(s);
    });
  }

  async function _loadOnce() {
    if (_loaded) return;
    if (_loading) return _loading;
    _loading = (async () => {
      for (const src of GRAPH_CHUNKS) {
        await _loadScript(src);
      }
      _loaded = true;
    })();
    try {
      await _loading;
    } finally {
      _loading = null;
    }
  }

  // Minimal error-state renderer used when chunks fail to load.
  // Mirrors the modal shell pattern from public/js/quiz-ui.js so the
  // user always sees a coherent dialog, never a blank page.
  function _renderChunkLoadError(err) {
    // Strip any partial state from a prior open() attempt.
    const stale = document.getElementById("notesGraphOverlay");
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

    const T = (key, fallback) => {
      try {
        if (typeof window !== "undefined" && typeof window.t === "function") {
          const v = window.t(key);
          if (typeof v === "string" && v !== key) return v;
        }
      } catch (_) {}
      return fallback;
    };
    const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

    const overlay = document.createElement("div");
    overlay.id = "notesGraphOverlay";
    overlay.setAttribute("data-graph-overlay", "1");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10500;display:flex;align-items:center;justify-content:center;padding:32px;";

    const panel = document.createElement("div");
    panel.id = "notesGraphPanel";
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "notesGraphErrorTitle");
    panel.setAttribute("data-graph-panel", "1");
    panel.setAttribute("data-graph-state", "error_chunk_load");
    panel.style.cssText = "background:var(--theme-bg,#fff);color:var(--theme-text,#000);border-radius:12px;max-width:520px;width:100%;padding:24px 26px;box-shadow:0 12px 40px rgba(0,0,0,0.35);";

    panel.innerHTML =
      `<h3 id="notesGraphErrorTitle" style="margin:0 0 12px 0;font-size:17px;">` +
        escapeHtml(T("graph.title", "Карта знаний")) +
      `</h3>` +
      `<p style="margin:0 0 16px 0;line-height:1.5;">` +
        escapeHtml(T("graph.state.error.chunkLoad",
          "Не удалось загрузить модуль графа. Проверьте соединение и обновите страницу.")) +
      `</p>` +
      `<div style="display:flex;justify-content:flex-end;gap:8px;">` +
        `<button type="button" class="btn-secondary" data-graph-close="1">` +
          escapeHtml(T("graph.toolbar.close", "Закрыть")) +
        `</button>` +
        `<button type="button" class="btn-primary" data-graph-retry="1">` +
          escapeHtml(T("graph.toolbar.retry", "Повторить")) +
        `</button>` +
      `</div>`;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = () => {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    panel.querySelector("[data-graph-close]").addEventListener("click", close);
    panel.querySelector("[data-graph-retry]").addEventListener("click", () => {
      close();
      // Reset cached failure so retry actually re-fetches.
      _loaded = false; _loading = null;
      // Drop the failed script tags so the next attempt is fresh.
      for (const src of GRAPH_CHUNKS) {
        const node = document.querySelector(`script[data-graph-chunk="${src}"]`);
        if (node && node.dataset.loaded !== "1" && node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
      window.LinguistProGraph.open();
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    // Initial focus on Retry — fastest path forward for the user.
    try {
      const retryBtn = panel.querySelector("[data-graph-retry]");
      if (retryBtn) retryBtn.focus();
    } catch (_) {}

    // Surface to console for diagnostics (not telemetry — local log only).
    if (err && err.message) {
      console.warn("[graph] chunk load failed:", err.message);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  //
  // window.LinguistProGraph.open()  — entry point bound to launcher buttons
  //                                   (research-panel, top-nav, URL #graph
  //                                   hash handler). Lazy-loads chunks
  //                                   then defers to window.NotesGraph.open().
  // window.LinguistProGraph.isLoaded() — boolean, exposed for smoke tests.
  // window.LinguistProGraph._chunks   — frozen chunk manifest, exposed for
  //                                     privacy-smoke allow-list.

  const api = {
    async open() {
      try {
        await _loadOnce();
      } catch (e) {
        _renderChunkLoadError(e);
        return;
      }
      if (typeof window === "undefined" || !window.NotesGraph ||
          typeof window.NotesGraph.open !== "function") {
        _renderChunkLoadError(new Error("NotesGraph module did not expose .open() after load"));
        return;
      }
      try {
        window.NotesGraph.open();
      } catch (e) {
        console.error("[graph] NotesGraph.open threw:", e);
        _renderChunkLoadError(e);
      }
    },
    isLoaded() { return _loaded; },
    _chunks: Object.freeze(GRAPH_CHUNKS.slice()),
  };

  if (typeof window !== "undefined") {
    window.LinguistProGraph = api;
    // URL deep-link: #graph in the location hash opens the graph at
    // page load. This is the third launcher entry point (Λ1 §"Premium-
    // Grade Decisions"). The handler is bound here so it stays close
    // to the rest of the lazy-load surface.
    const _hashOpen = () => {
      const h = (window.location && window.location.hash || "").toLowerCase();
      if (h === "#graph" || h === "#linguistpro-graph") {
        // Defer one tick so the rest of index.html startup finishes —
        // we don't want to race the DB initialization or i18n boot.
        setTimeout(() => { try { api.open(); } catch (_) {} }, 0);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _hashOpen, { once: true });
    } else {
      _hashOpen();
    }
    window.addEventListener("hashchange", _hashOpen);
  }
})();
