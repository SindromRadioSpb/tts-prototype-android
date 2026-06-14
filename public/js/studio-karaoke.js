// public/js/studio-karaoke.js
// BRR-P1-008d · Word-level karaoke ("running word") for the STUDIO app (index.html).
//
// The Reading Room (library.html) already highlights the spoken word via reader-core's
// attachRowAudio (008b/008c). Studio plays per-row TTS but renders the Hebrew cell as a
// single text node — no per-word spans, no audio→word sync. This module adds that, WITHOUT
// touching index.html's renderTable (which is byte-parity-locked to reader-core by
// smoke:reader-parity): word markup is a LAZY, per-row, POST-render DOM transform applied
// only while a row is playing, then fully reverted on stop.
//
// Offset alignment is the make-or-break: the server's SSML <mark> offsets (ttsBake) are
// produced by reader-morph.tokenize, so we wrap with the SAME tokenizer (window.ReaderMorph)
// → mark index N == data-w-offset N == timing words[].o. We deliberately do NOT add the
// Room's role="button"/tabindex/data-surface (those imply tap-interactivity we don't wire in
// Studio) — these spans are inert highlight targets only.
//
// Lifecycle: start(rowIdx, assetKey, audioEl) fetches <key>.timing.json, wraps the row's
// Hebrew cell(s), and runs a requestAnimationFrame loop reading audioEl.currentTime (rAF, not
// 'timeupdate' — iOS Safari fires timeupdate unreliably on a reused Audio()). It self-manages
// stop via the audio element's own ended/pause/error events, so the host's central
// clearRowPlayingState() is never touched. No timing (404 / partial-empty) → no-op (graceful:
// the existing .row-playing sentence-level highlight remains).
//
// Dual export: window.StudioKaraoke (browser) + module.exports (Node — smoke:studio-karaoke
// tests the pure activeWordIndex). Depends on window.ReaderMorph (load reader-morph.js first).

(function () {
  "use strict";

  // ── Pure: which word offset is being spoken at `currentTime`? ───────────────
  // Copy of reader-core.activeWordIndex (that one is an ES module Studio can't import).
  // words = sorted [{o,t}] from the timing sidecar. Returns the .o spoken now, or -1
  // before the first word. Tolerates partial timing (honest: no fake highlight).
  function activeWordIndex(words, currentTime) {
    if (!Array.isArray(words) || !words.length) return -1;
    var t = Number(currentTime) || 0;
    var active = -1;
    for (var i = 0; i < words.length; i++) {
      if (t >= (Number(words[i].t) || 0)) active = (Number.isInteger(words[i].o) ? words[i].o : -1);
      else break;
    }
    return active;
  }

  // Node export stops here — the rest needs a browser DOM.
  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = { activeWordIndex: activeWordIndex };
    return;
  }

  var SPEAKING = "rm-w-speaking";
  var WRAP_FLAG = "data-sk-wrapped"; // marks a cell we transformed (so we restore exactly once)

  // Live state for the single in-flight karaoke run (Studio plays one row at a time
  // via the rowAudioPlayer singleton).
  var cur = null; // { rowIdx, key, audioEl, words, wrappedCells:[], rafId, lastOff, ticks, listeners }

  // ── Timing sidecar fetch (force-cache: it's immutable & content-addressed) ───
  function fetchTiming(assetKey) {
    return fetch("/api/audio/" + encodeURIComponent(assetKey) + "/timing", { cache: "force-cache" })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) { return (j && Array.isArray(j.words) && j.words.length) ? j.words : null; })
      .catch(function () { return null; });
  }

  // ── Lazy per-row word wrapping (reverted on stop) ───────────────────────────
  // Uses ReaderMorph.tokenize so word offsets match the server's SSML marks. Builds
  // spans via DOM (no innerHTML string-concat → no escaping pitfalls). Saves the cell's
  // original innerHTML on the element so stop() restores it verbatim.
  function wrapCell(td) {
    var RM = window.ReaderMorph;
    if (!td || !RM || typeof RM.tokenize !== "function") return false;
    if (td.getAttribute(WRAP_FLAG)) return true; // already wrapped this run
    var text = td.textContent || "";
    if (!text.trim()) return false;
    var toks = RM.tokenize(text);
    var frag = document.createDocumentFragment();
    var off = 0, anyWord = false;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk.isWord) {
        var span = document.createElement("span");
        span.className = "rm-w";
        span.setAttribute("data-w-offset", String(off++));
        span.textContent = tk.text;
        frag.appendChild(span);
        anyWord = true;
      } else {
        frag.appendChild(document.createTextNode(tk.text));
      }
    }
    if (!anyWord) return false;
    td.__skOrigHtml = td.innerHTML; // restore target
    td.textContent = "";
    td.appendChild(frag);
    td.setAttribute(WRAP_FLAG, "1");
    return true;
  }

  function rowHebrewCells(rowIdx) {
    var table = document.getElementById("proTable");
    if (!table) return [];
    var tr = table.querySelector('tbody tr[data-row-idx="' + String(rowIdx) + '"]');
    if (!tr) return [];
    return Array.prototype.slice.call(tr.querySelectorAll('td[data-col="he"], td[data-col="niqqud"]'));
  }

  // ── Highlight paint ─────────────────────────────────────────────────────────
  function clearSpeaking() {
    var table = document.getElementById("proTable");
    if (!table) return;
    var hot = table.querySelectorAll("." + SPEAKING);
    for (var i = 0; i < hot.length; i++) hot[i].classList.remove(SPEAKING);
  }

  function paint(rowIdx, off) {
    clearSpeaking();
    if (off == null || off < 0) return;
    var table = document.getElementById("proTable");
    if (!table) return;
    var tr = table.querySelector('tbody tr[data-row-idx="' + String(rowIdx) + '"]');
    if (!tr) return;
    var spans = tr.querySelectorAll('.rm-w[data-w-offset="' + String(off) + '"]');
    for (var i = 0; i < spans.length; i++) spans[i].classList.add(SPEAKING);
  }

  // ── rAF loop ────────────────────────────────────────────────────────────────
  function tick() {
    if (!cur) return;
    var off = activeWordIndex(cur.words, cur.audioEl ? cur.audioEl.currentTime : 0);
    if (off !== cur.lastOff) { paint(cur.rowIdx, off); cur.lastOff = off; }
    cur.ticks++;
    cur.rafId = window.requestAnimationFrame(tick);
  }

  // ── Public: stop the current run (idempotent) ───────────────────────────────
  function stop() {
    if (!cur) { clearSpeaking(); return; }
    if (cur.rafId) { try { window.cancelAnimationFrame(cur.rafId); } catch (_) {} }
    // detach audio listeners
    if (cur.audioEl && cur.listeners) {
      for (var ev in cur.listeners) {
        if (Object.prototype.hasOwnProperty.call(cur.listeners, ev)) {
          try { cur.audioEl.removeEventListener(ev, cur.listeners[ev]); } catch (_) {}
        }
      }
    }
    clearSpeaking();
    // restore wrapped cells verbatim
    if (cur.wrappedCells) {
      for (var i = 0; i < cur.wrappedCells.length; i++) {
        var td = cur.wrappedCells[i];
        try {
          if (td && td.__skOrigHtml != null) { td.innerHTML = td.__skOrigHtml; }
          if (td) { td.removeAttribute(WRAP_FLAG); delete td.__skOrigHtml; }
        } catch (_) {}
      }
    }
    cur = null;
    updateDebug();
  }

  // ── Public: start a run for the playing row ─────────────────────────────────
  // rowIdx: the table row being played; assetKey: stable cache key (tier-1/tier-2);
  // audioEl: the <audio> element currently playing this row's clip.
  function start(rowIdx, assetKey, audioEl) {
    try {
      stop(); // never overlap two runs (row switch / replay)
      if (rowIdx == null || !assetKey || !audioEl) return;
      var run = {
        rowIdx: rowIdx, key: String(assetKey), audioEl: audioEl,
        words: null, wrappedCells: [], rafId: 0, lastOff: -2, ticks: 0, listeners: null,
      };
      cur = run;
      updateDebug();
      fetchTiming(run.key).then(function (words) {
        // Bail if a newer run replaced us, or the clip already ended/switched.
        if (cur !== run) return;
        if (!words) { updateDebug(); return; } // graceful: sentence-level row highlight only
        run.words = words;
        var cells = rowHebrewCells(run.rowIdx);
        for (var i = 0; i < cells.length; i++) { if (wrapCell(cells[i])) run.wrappedCells.push(cells[i]); }
        if (!run.wrappedCells.length) { updateDebug(); return; } // nothing to paint on
        // Self-managed stop: when this clip ends/pauses/errors, tear down.
        var onEnd = function () { if (cur === run) stop(); };
        run.listeners = { ended: onEnd, pause: onEnd, error: onEnd };
        for (var ev in run.listeners) {
          if (Object.prototype.hasOwnProperty.call(run.listeners, ev)) {
            try { audioEl.addEventListener(ev, run.listeners[ev]); } catch (_) {}
          }
        }
        run.rafId = window.requestAnimationFrame(tick);
        updateDebug();
      });
    } catch (_) { /* karaoke is best-effort; never break playback */ }
  }

  // ── ?wkdebug=1 on-device overlay (parity with the Reading Room) ──────────────
  var dbgEl = null;
  function wkDebugEnabled() {
    try { return /[?&]wkdebug=1\b/.test(window.location.search || ""); } catch (_) { return false; }
  }
  function wkDebug() {
    return {
      surface: "studio",
      mode: cur ? "audio" : "idle",
      t: cur && cur.audioEl ? Number(cur.audioEl.currentTime || 0).toFixed(2) : "0",
      tN: cur && cur.words ? cur.words.length : 0,
      off: cur ? cur.lastOff : -2,
      ticks: cur ? cur.ticks : 0,
      key: cur ? String(cur.key).slice(0, 8) : "",
    };
  }
  function updateDebug() {
    if (!wkDebugEnabled()) return;
    try {
      if (!dbgEl) {
        dbgEl = document.createElement("div");
        dbgEl.id = "skWkDebug";
        dbgEl.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99999;background:rgba(0,0,0,.82);" +
          "color:#7CFC9A;font:11px/1.45 monospace;padding:6px 8px;border-radius:6px;max-width:60vw;white-space:pre;pointer-events:none";
        document.body.appendChild(dbgEl);
      }
      var d = wkDebug();
      dbgEl.textContent = "studio-karaoke\nmode=" + d.mode + " t=" + d.t + " tN=" + d.tN +
        " off=" + d.off + " ticks=" + d.ticks + " key=" + d.key;
    } catch (_) {}
  }
  // Keep the overlay live while audio plays (rAF only repaints on offset change).
  if (typeof window !== "undefined") {
    try {
      if (wkDebugEnabled()) {
        var pump = function () { updateDebug(); window.setTimeout(pump, 250); };
        if (document.readyState === "complete" || document.readyState === "interactive") pump();
        else window.addEventListener("DOMContentLoaded", pump);
      }
    } catch (_) {}
  }

  var API = { start: start, stop: stop, activeWordIndex: activeWordIndex, wkDebug: wkDebug };
  window.StudioKaraoke = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
