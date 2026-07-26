// public/js/studio-media-karaoke.js
// W2-S4 · Караоке по РЕАЛЬНОМУ импортированному аудио: сегмент-уровень (R11 — никакого
// word-level), подсветка ДИАПАЗОНА строк активного сегмента [entries[k].o, entries[k+1].o).
// Собственный new Audio() на blob-URL из OPFS: rowAudioPlayer (index.html:18522) НЕ трогаем —
// его ended-хендлер двигает TTS-плейлист (чужой инвариант). Взаимное исключение: start()
// зовёт window.v3StopRowAudio (hook в index.html), а row-tts обработчик зовёт наш stop().
(function () {
  "use strict";

  function activeSegmentRange(entries, rowCount, currentTime) {
    if (!Array.isArray(entries) || !entries.length) return null;
    var t = Number(currentTime) || 0, k = -1;
    for (var i = 0; i < entries.length; i++) {
      if (t >= (Number(entries[i].t) || 0)) k = i; else break;
    }
    if (k < 0) return null;
    var rowStart = entries[k].o;
    var rowEnd = k + 1 < entries.length ? entries[k + 1].o : Math.max(Number(rowCount) || 0, rowStart + 1);
    return { idx: k, rowStart: rowStart, rowEnd: rowEnd };
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = { activeSegmentRange: activeSegmentRange };
    return;
  }

  var CLS = "smk-row-active";
  var cur = null; // {audioEl, url, entries, rowCount, rafId, lastIdx, stopAtT, listeners}

  function paintRange(range) {
    var table = document.getElementById("proTable");
    if (!table) return;
    var hot = table.querySelectorAll("tr." + CLS);
    for (var i = 0; i < hot.length; i++) hot[i].classList.remove(CLS);
    if (!range) return;
    for (var r = range.rowStart; r < range.rowEnd; r++) {
      var tr = table.querySelector('tbody tr[data-row-idx="' + String(r) + '"]');
      if (tr) tr.classList.add(CLS);
    }
  }

  function tick() {
    if (!cur) return;
    var t = cur.audioEl ? cur.audioEl.currentTime : 0;
    if (cur.stopAtT != null && t >= cur.stopAtT) { try { cur.audioEl.pause(); } catch (_) {} cur.stopAtT = null; }
    var range = activeSegmentRange(cur.entries, cur.rowCount, t);
    var idx = range ? range.idx : -1;
    if (idx !== cur.lastIdx) { paintRange(range); cur.lastIdx = idx; }
    cur.rafId = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (!cur) { paintRange(null); return; }
    if (cur.rafId) { try { window.cancelAnimationFrame(cur.rafId); } catch (_) {} }
    if (cur.audioEl) {
      try { cur.audioEl.pause(); } catch (_) {}
      if (cur.listeners) for (var ev in cur.listeners) {
        if (Object.prototype.hasOwnProperty.call(cur.listeners, ev)) {
          try { cur.audioEl.removeEventListener(ev, cur.listeners[ev]); } catch (_) {}
        }
      }
    }
    if (cur.url) { try { URL.revokeObjectURL(cur.url); } catch (_) {} }
    paintRange(null);
    cur = null;
  }

  // segIdxForRow: последний entry с o <= rowIdx (строка внутри его диапазона)
  function segIdxForRow(entries, rowIdx) {
    if (!Array.isArray(entries)) return -1;
    var k = -1;
    for (var i = 0; i < entries.length; i++) { if (entries[i].o <= rowIdx) k = i; else break; }
    return k;
  }

  function ensureRun(blob, entries, rowCount) {
    stop();
    if (typeof window.v3StopRowAudio === "function") { try { window.v3StopRowAudio(); } catch (_) {} }
    var url = URL.createObjectURL(blob);
    var audioEl = new Audio(url);
    audioEl.preload = "auto";
    var run = { audioEl: audioEl, url: url, entries: entries || null, rowCount: rowCount, rafId: 0, lastIdx: -2, stopAtT: null, listeners: null };
    var onEnd = function () { if (cur === run) { paintRange(null); cur.lastIdx = -2; } }; // пауза ≠ teardown: позиция сохраняется
    var onGone = function () { if (cur === run) stop(); };
    run.listeners = { pause: onEnd, ended: onGone, error: onGone };
    for (var ev in run.listeners) {
      if (Object.prototype.hasOwnProperty.call(run.listeners, ev)) audioEl.addEventListener(ev, run.listeners[ev]);
    }
    cur = run;
    run.rafId = window.requestAnimationFrame(tick);
    return run;
  }

  async function start(opts) {
    try {
      var run = (cur && cur.entries === (opts.entries || null)) ? cur : ensureRun(opts.blob, opts.entries || null, opts.rowCount || 0);
      run.stopAtT = null;
      await run.audioEl.play();
    } catch (_) { /* best-effort: никогда не ломаем Студию */ }
  }

  function seekToRow(rowIdx) {
    if (!cur || !cur.entries) return;
    var k = segIdxForRow(cur.entries, Number(rowIdx));
    if (k < 0) return;
    try { cur.audioEl.currentTime = Number(cur.entries[k].t) || 0; } catch (_) {}
  }

  async function playSegment(rowIdx) {
    if (!cur || !cur.entries) return;
    var k = segIdxForRow(cur.entries, Number(rowIdx));
    if (k < 0) return;
    if (typeof window.v3StopRowAudio === "function") { try { window.v3StopRowAudio(); } catch (_) {} }
    try {
      cur.audioEl.currentTime = Number(cur.entries[k].t) || 0;
      cur.stopAtT = k + 1 < cur.entries.length ? Number(cur.entries[k + 1].t) : null;
      await cur.audioEl.play();
    } catch (_) {}
  }

  function isActive() { return !!(cur && cur.audioEl && !cur.audioEl.paused); }
  function getAudioEl() { return cur ? cur.audioEl : null; }

  var API = { activeSegmentRange: activeSegmentRange, start: start, stop: stop, isActive: isActive,
              seekToRow: seekToRow, playSegment: playSegment, getAudioEl: getAudioEl,
              _ensureRun: ensureRun };
  window.StudioMediaKaraoke = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
