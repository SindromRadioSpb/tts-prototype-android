// public/js/studio-media-karaoke.js
// W2-S4 · Караоке по РЕАЛЬНОМУ импортированному аудио: сегмент-уровень (R11 — никакого
// word-level), подсветка ДИАПАЗОНА строк активного сегмента [entries[k].o, entries[k+1].o).
// Собственный new Audio() на blob-URL из OPFS: rowAudioPlayer (index.html:18522) НЕ трогаем —
// его ended-хендлер двигает TTS-плейлист (чужой инвариант). Взаимное исключение: start()
// зовёт window.v3StopRowAudio (hook в index.html), а row-tts обработчик зовёт наш stop().
// W2-S5a: время может идти и от внешнего медиа-адаптера (YouTube, studio-yt-player.js) вместо
// локального блоба — см. комментарий над ensureRun() ниже про утиный тип и владение адаптером.
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
    // url === null for an external media adapter (YouTube) — nothing to revoke, that is normal.
    // Note what we deliberately do NOT do here: call cur.audioEl.destroy(). An adapter is not ours
    // to destroy (see ensureRun) — pause() above plus listener removal is the module's whole
    // teardown contract; destroying the adapter itself is the caller's job.
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

  // W2-S5a: источник времени может быть локальным блобом (S4) ИЛИ внешним медиа-адаптером
  // (YouTube-плеер, studio-yt-player.js). Всё ниже работает с любым из них — нужен лишь
  // currentTime/play/pause/paused/addEventListener. Object-URL отзываем только свой (url остаётся
  // null для адаптера — stop() уже отзывает условно). Владение адаптером: модуль его НЕ создаёт и
  // НЕ destroy()-ит — им владеет вызывающая сторона (Task 8, StudioYtPlayer.create()); pause() в
  // stop() достаточно, чтобы остановить цикл, а уничтожение чужого ресурса — не наша забота.
  function ensureRun(source, entries, rowCount) {
    stop();
    if (typeof window.v3StopRowAudio === "function") { try { window.v3StopRowAudio(); } catch (_) {} }
    var url = null, audioEl;
    if (source && typeof source.addEventListener === "function" && !(source instanceof Blob)) {
      audioEl = source;                       // внешний адаптер — своего элемента не создаём
    } else {
      url = URL.createObjectURL(source);
      audioEl = new Audio(url);
      audioEl.preload = "auto";
    }
    var run = { audioEl: audioEl, url: url, entries: entries || null, rowCount: rowCount, rafId: 0, lastIdx: -2, stopAtT: null, listeners: null };
    // W2-S4.1 FIX C: пауза ≠ teardown (позиция сохраняется), НО rAF-цикл обязан остановиться —
    // иначе уже запланированный кадр перерисует подсветку поверх paintRange(null) (гонка).
    var onPause = function () {
      if (cur !== run) return;
      if (run.rafId) { try { window.cancelAnimationFrame(run.rafId); } catch (_) {} }
      run.rafId = 0;
      paintRange(null);
      run.lastIdx = -2;
    };
    // play (start()/playSegment() resume) → перезапустить цикл; двойной старт исключён проверкой rafId.
    var onPlayResume = function () {
      if (cur !== run) return;
      if (run.rafId) return;
      run.rafId = window.requestAnimationFrame(tick);
    };
    var onGone = function () { if (cur === run) stop(); };
    run.listeners = { pause: onPause, play: onPlayResume, ended: onGone, error: onGone };
    for (var ev in run.listeners) {
      if (Object.prototype.hasOwnProperty.call(run.listeners, ev)) audioEl.addEventListener(ev, run.listeners[ev]);
    }
    cur = run;
    run.rafId = window.requestAnimationFrame(tick);
    return run;
  }

  async function start(opts) {
    try {
      var source = opts.media || opts.blob;
      var run = (cur && cur.entries === (opts.entries || null)) ? cur : ensureRun(source, opts.entries || null, opts.rowCount || 0);
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

  // IMPORTANT 3 (whole-branch review 2026-07-28) — TRAP for whoever wires per-row replay to the
  // YouTube adapter next (it is deliberately NOT wired today — index.html only renders the
  // "▶︎ replay segment" row button when `audio.media` exists, i.e. never for a captions/video-
  // URL passport, so `cur.audioEl` here is only ever a native <audio> in practice right now).
  // On the adapter, `currentTime = X` is `player.seekTo(X, true)` — a fire-and-forget postMessage
  // call, same mechanism Task 10's live smoke measured at ~100ms round-trip for play/pause state
  // (studio-yt-player.js:73-82). `getCurrentTime()` lags that same seek by roughly the same
  // window: it keeps reporting the PRE-seek position until the round-trip lands. Replaying an
  // EARLIER segment while playback is currently further along would seek backward, immediately
  // set `stopAtT` to a value BELOW the still-stale (later) `currentTime` tick() reads on the very
  // next rAF frame, and `tick()`'s `t >= cur.stopAtT` fires instantly — the segment pauses on its
  // first frame instead of playing. A native <audio> element's `currentTime` updates synchronously
  // on assignment, so this trap does not exist for the local-file path. Fixing it for real needs
  // either a short grace window before arming `stopAtT` on an adapter source, or reading the
  // adapter's own seek-confirmation rather than racing tick()'s next poll — do that BEFORE
  // wiring this to the adapter, not after.
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
