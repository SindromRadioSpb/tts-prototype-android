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
    // S12.7: часы чанка остались сжатыми после починки ⇒ внутри него мы НЕ ЗНАЕМ, где идёт
    // воспроизведение. Не подсвечиваем ничего: удерживать последнюю честную строку — это тот же
    // запрещённый путь «уверенно показываем не ту строку», только тише (R11).
    if (entries[k].blind) return null;
    if (entries[k].end != null && Number.isFinite(Number(entries[k].end)) && t >= Number(entries[k].end)) return null;
    var rowStart = entries[k].o;
    var rowEnd = k + 1 < entries.length ? entries[k + 1].o : Math.max(Number(rowCount) || 0, rowStart + 1);
    return { idx: k, rowStart: rowStart, rowEnd: rowEnd };
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { activeSegmentRange: activeSegmentRange, _segIdxForRow: segIdxForRow };
    }
    return;
  }

  var CLS = "smk-row-active";
  var cur = null; // {source, audioEl, url, entries, rowCount, rafId, pollId, lastIdx, stopAtT, listeners, onRangeChange, persistent}

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

  function cancelLoop(run) {
    if (!run) return;
    if (run.rafId) { try { window.cancelAnimationFrame(run.rafId); } catch (_) {} }
    if (run.pollId && typeof window.clearTimeout === "function") { try { window.clearTimeout(run.pollId); } catch (_) {} }
    run.rafId = 0; run.pollId = 0;
  }

  function scheduleLoop(run) {
    if (!run || cur !== run || run.rafId || run.pollId) return;
    if (run.audioEl && !run.audioEl.paused) {
      run.rafId = window.requestAnimationFrame(tick);
    } else if (run.audioEl && run.audioEl.isYouTube && typeof window.setTimeout === "function") {
      // Some real embeds advance getPlayerState()/getCurrentTime but omit the
      // IFrame API onStateChange callback when playback starts in native controls.
      // A low-rate paused probe notices that transition without burning a 60 Hz
      // loop; once playing, the regular rAF clock resumes precise row following.
      run.pollId = window.setTimeout(function () {
        if (cur !== run) return;
        run.pollId = 0;
        tick();
      }, 250);
    }
  }

  function tick() {
    if (!cur) return;
    var run = cur;
    run.rafId = 0; run.pollId = 0;
    var t = run.audioEl ? run.audioEl.currentTime : 0;
    if (run.stopAtT != null && t >= run.stopAtT) { try { run.audioEl.pause(); } catch (_) {} run.stopAtT = null; }
    var range = run.seeking ? null : activeSegmentRange(run.entries, run.rowCount, t);
    var idx = range ? range.idx : -1;
    if (idx !== run.lastIdx) {
      paintRange(range); run.lastIdx = idx;
      if (typeof run.onRangeChange === "function") { try { run.onRangeChange(range); } catch (_) {} }
    }
    if (cur === run) scheduleLoop(run);
  }

  function syncCurrent() {
    if (!cur) return null;
    var range = cur.seeking ? null : activeSegmentRange(cur.entries, cur.rowCount, cur.audioEl ? cur.audioEl.currentTime : 0);
    paintRange(range); cur.lastIdx = range ? range.idx : -1;
    if (typeof cur.onRangeChange === "function") { try { cur.onRangeChange(range); } catch (_) {} }
    return range;
  }

  function stop() {
    if (!cur) { paintRange(null); return; }
    cancelLoop(cur);
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

  // segIdxForRow: последний entry с o <= rowIdx (строка внутри его диапазона).
  // S12.7: попал на слепую запись (сжатые часы чанка) ⇒ -1 — «повторить эту строку» нечем, время
  // её сегмента недостоверно. Проигрывать по нему значило бы отдать владельцу чужой звук.
  function segIdxForRow(entries, rowIdx) {
    if (!Array.isArray(entries)) return -1;
    var k = -1;
    for (var i = 0; i < entries.length; i++) { if (entries[i].o <= rowIdx) k = i; else break; }
    return k >= 0 && entries[k].blind ? -1 : k;
  }

  // W2-S5a: источник времени может быть локальным блобом (S4) ИЛИ внешним медиа-адаптером
  // (YouTube-плеер, studio-yt-player.js). Всё ниже работает с любым из них — нужен лишь
  // currentTime/play/pause/paused/addEventListener. Object-URL отзываем только свой (url остаётся
  // null для адаптера — stop() уже отзывает условно). Владение адаптером: модуль его НЕ создаёт и
  // НЕ destroy()-ит — им владеет вызывающая сторона (Task 8, StudioYtPlayer.create()); pause() в
  // stop() достаточно, чтобы остановить цикл, а уничтожение чужого ресурса — не наша забота.
  function ensureRun(source, entries, rowCount, onRangeChange, persistent, stopOtherAudio) {
    stop();
    // Room media player (spec 2026-08-04): хук взаимоисключения параметризован — у Зала нет
    // window.v3StopRowAudio; без опции остаётся прежний студийный фолбэк.
    var stopHook = stopOtherAudio || window.v3StopRowAudio;
    if (typeof stopHook === "function") { try { stopHook(); } catch (_) {} }
    var url = null, audioEl;
    if (source && typeof source.addEventListener === "function" && !(source instanceof Blob)) {
      audioEl = source;                       // внешний адаптер — своего элемента не создаём
    } else {
      url = URL.createObjectURL(source);
      audioEl = new Audio(url);
      audioEl.preload = "auto";
    }
    var run = { source: source, audioEl: audioEl, url: url, entries: entries || null, rowCount: rowCount, rafId: 0, pollId: 0, lastIdx: -2, stopAtT: null, listeners: null, onRangeChange: onRangeChange || null, persistent: !!persistent, stopOtherAudio: stopOtherAudio || null };
    // W2-S4.1 FIX C: пауза ≠ teardown (позиция сохраняется), НО rAF-цикл обязан остановиться —
    // иначе уже запланированный кадр перерисует подсветку поверх paintRange(null) (гонка).
    var onPause = function () {
      if (cur !== run) return;
      cancelLoop(run);
      syncCurrent(); scheduleLoop(run);
    };
    // play (start()/playSegment() resume) → перезапустить цикл; двойной старт исключён проверкой rafId.
    var onPlayResume = function () {
      if (cur !== run) return;
      cancelLoop(run); scheduleLoop(run);
    };
    var onEnded = function () {
      if (cur !== run) return;
      if (!run.persistent) { stop(); return; }
      cancelLoop(run);
      run.stopAtT = null; syncCurrent(); scheduleLoop(run);
    };
    var onError = function () { if (cur === run) stop(); };
    run.listeners = { pause: onPause, play: onPlayResume, ended: onEnded, error: onError };
    for (var ev in run.listeners) {
      if (Object.prototype.hasOwnProperty.call(run.listeners, ev)) audioEl.addEventListener(ev, run.listeners[ev]);
    }
    cur = run;
    scheduleLoop(run);
    return run;
  }

  function bind(opts) {
    opts = opts || {};
    var source = opts.media || opts.blob;
    if (!source) return null;
    if (cur && cur.source === source && cur.entries === (opts.entries || null)) {
      cur.rowCount = opts.rowCount || 0; cur.onRangeChange = opts.onRangeChange || null; cur.persistent = true;
      cur.stopOtherAudio = opts.stopOtherAudio || null;
      return cur;
    }
    return ensureRun(source, opts.entries || null, opts.rowCount || 0, opts.onRangeChange || null, true, opts.stopOtherAudio);
  }

  async function start(opts) {
    try {
      var source = opts.media || opts.blob;
      var run = (cur && cur.source === source && cur.entries === (opts.entries || null)) ? cur : ensureRun(source, opts.entries || null, opts.rowCount || 0, opts.onRangeChange || null, false, opts.stopOtherAudio);
      if (opts.onRangeChange) run.onRangeChange = opts.onRangeChange;
      run.seekSerial = (run.seekSerial || 0) + 1; run.seeking = false;
      if (run.audioEl._cancelSeek) run.audioEl._cancelSeek();
      run.stopAtT = null;
      await run.audioEl.play();
    } catch (_) { /* best-effort: никогда не ломаем Студию */ }
  }

  function seekToRow(rowIdx) {
    if (!cur || !cur.entries) return;
    var k = segIdxForRow(cur.entries, Number(rowIdx));
    if (k < 0) return;
    cur.seekSerial = (cur.seekSerial || 0) + 1; cur.seeking = false; cur.stopAtT = null;
    if (cur.audioEl._cancelSeek) cur.audioEl._cancelSeek();
    try { cur.audioEl.currentTime = Number(cur.entries[k].t) || 0; syncCurrent(); } catch (_) {}
  }

  // YouTube seeks are asynchronous. Arm the segment end only after the adapter confirms
  // its clock reached the target; a newer command or teardown invalidates this request.
  async function playSegment(rowIdx) {
    if (!cur || !cur.entries) return;
    var k = segIdxForRow(cur.entries, Number(rowIdx));
    if (k < 0) return;
    var stopHook = (cur && cur.stopOtherAudio) || window.v3StopRowAudio;
    if (typeof stopHook === "function") { try { stopHook(); } catch (_) {} }
    var run = cur, serial = run.seekSerial = (run.seekSerial || 0) + 1;
    try {
      var exactEnd = Number(cur.entries[k] && cur.entries[k].end);
      var stopAt = Number.isFinite(exactEnd) && exactEnd > Number(cur.entries[k].t)
        ? exactEnd
        : (k + 1 < cur.entries.length ? Number(cur.entries[k + 1].t) : null);
      run.stopAtT = null;
      if (typeof run.audioEl.seekAndWait === 'function') {
        run.seeking = true; run.audioEl.pause(); syncCurrent();
        await run.audioEl.seekAndWait(Number(run.entries[k].t) || 0, {end:stopAt});
        if (cur !== run || run.seekSerial !== serial) return {ok:false,reason:'YT_SEEK_CANCELLED'};
        run.seeking = false;
      } else run.audioEl.currentTime = Number(run.entries[k].t) || 0;
      run.stopAtT = stopAt;
      await run.audioEl.play();
      return {ok:true};
    } catch (error) {
      if (cur === run && run.seekSerial === serial) { run.seeking = false; run.stopAtT = null; run.audioEl.pause(); }
      return {ok:false,reason:error && (error.code || error.message) || 'YT_SEEK_FAILED'};
    }
  }

  // Explicit user/lifecycle pause also invalidates a pending asynchronous replay.
  function pause() {
    if (!cur) return;
    cur.seekSerial = (cur.seekSerial || 0) + 1; cur.seeking = false; cur.stopAtT = null;
    if (cur.audioEl._cancelSeek) cur.audioEl._cancelSeek();
    cur.audioEl.pause(); syncCurrent();
  }

  function isActive() { return !!(cur && cur.audioEl && !cur.audioEl.paused); }
  function getAudioEl() { return cur ? cur.audioEl : null; }

  var API = { activeSegmentRange: activeSegmentRange, bind: bind, start: start, stop: stop, pause: pause, isActive: isActive,
              seekToRow: seekToRow, playSegment: playSegment, syncCurrent: syncCurrent, getAudioEl: getAudioEl,
              _ensureRun: ensureRun };
  window.StudioMediaKaraoke = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
