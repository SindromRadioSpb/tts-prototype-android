/*
 * Studio row bookmarks (3.11.904, owner request: «распространить возможность делать закладки с Зала
 * на Студию»). The same bookmark the Reading Room sets: one row of a saved text, keyed by
 * (text_id, sentence_id) in the local DB `bookmarks` table, so a bookmark set here shows on the
 * Room's «Закладки» shelf and on the row when the text is opened there, and vice versa.
 *
 * renderTable is frozen by the smoke:reader-parity byte gate, so — like studio-agent.js — the
 * control is injected post-render by wrapping window.renderTable. Rows that are not part of a
 * saved text (no _v3_textId/_v3_sentenceId) get no button: there is nothing to bookmark yet.
 * Room view of index.html (body.room-mode) is skipped: the Room injects its own.
 */
(function () {
  'use strict';
  if (window.StudioBookmarks) return;

  var tt = function (key, fallback) {
    try { return (window.t && window.t(key)) || fallback || key; } catch (_) { return fallback || key; }
  };
  var setsByText = new Map();     // text_id -> Promise<Set<sentence_id>>
  var metaByText = new Map();     // text_id -> Promise<{ title, text_key }>

  function host() { return window.StudioAgentHost || null; }
  async function db() {
    var h = host();
    if (!h || typeof h.ldb !== 'function') return null;
    try { return await h.ldb(); } catch (_) { return null; }
  }
  function loadSet(textId) {
    if (!setsByText.has(textId)) {
      setsByText.set(textId, (async function () {
        var set = new Set();
        var ldb = await db();
        if (!ldb || typeof ldb.listBookmarks !== 'function') return set;
        try { (await ldb.listBookmarks(textId)).forEach(function (b) { if (b.sentence_id) set.add(String(b.sentence_id)); }); } catch (_) {}
        return set;
      })());
    }
    return setsByText.get(textId);
  }
  function loadMeta(textId) {
    if (!metaByText.has(textId)) {
      metaByText.set(textId, (async function () {
        var ldb = await db();
        var t = null;
        try { t = ldb && (ldb.getTextByIdLite ? await ldb.getTextByIdLite(textId) : await ldb.getTextById(textId)); } catch (_) {}
        return { title: (t && t.title) || '', text_key: (t && t.text_key) || null };
      })());
    }
    return metaByText.get(textId);
  }

  function paint(btn, on) {
    btn.classList.toggle('bookmarked', on);
    btn.textContent = on ? '★' : '☆';
    btn.setAttribute('aria-pressed', String(on));
    btn.title = tt(on ? 'room.bookmark.remove' : 'room.bookmark.add', on ? 'Убрать закладку' : 'Закладка');
  }

  async function toggle(btn) {
    if (btn.disabled) return;
    var h = host();
    var idx = Number(btn.getAttribute('data-row-idx'));
    var row = h && h.getRow ? h.getRow(idx) : null;
    if (!row || !row._v3_textId || !row._v3_sentenceId) return;
    var textId = String(row._v3_textId), sid = String(row._v3_sentenceId);
    var ldb = await db();
    if (!ldb || typeof ldb.addBookmark !== 'function') return;
    var on = btn.classList.contains('bookmarked');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    paint(btn, !on);                       // answer the tap at once; roll back on failure
    try {
      var set = await loadSet(textId);
      if (on) {
        await ldb.removeBookmark(textId, sid);
        set.delete(sid);
      } else {
        var meta = await loadMeta(textId);
        var he = row.he || row.he_niqqud || '', ru = row.ru || '';
        await ldb.addBookmark({
          text_id: textId, text_key: meta.text_key, sentence_id: sid,
          order_index: row._v3_orderIndex != null ? row._v3_orderIndex : idx,
          title: meta.title, snippet: (he + (ru ? ' · ' + ru : '')).trim().slice(0, 200),
        });
        set.add(sid);
        try { if (typeof window.v3ShowToast === 'function') window.v3ShowToast(tt('room.bookmark.added', 'Закладка добавлена')); } catch (_) {}
      }
    } catch (e) {
      paint(btn, on);
      try { console.warn('[studio-bookmarks] write failed', e); } catch (_) {}
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }

  // Keep the edit/reading viewport steady for one synchronous layout batch.
  // Capture again after each idle yield: manual scroll or a new edit then owns
  // the next position. Do not retain anchors across DB reads or idle tasks.
  function captureBatchPosition(table, last) {
    var mount = table.parentElement, doc = table.ownerDocument, view = doc.defaultView;
    var editor = doc.activeElement;
    if (mount && editor && table.contains(editor) && editor.matches('.cell-editor-wrap textarea, .cell-editor-wrap input, .cell-editor-wrap [contenteditable="true"]')) {
      var page = doc.scrollingElement, scroller = mount;
      while (scroller && scroller !== page &&
        !(/auto|scroll|overlay/.test(view.getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
      scroller = scroller || page;
      var pos = editor.getBoundingClientRect();
      var clip = scroller === page ? { top: 0, bottom: view.innerHeight } : scroller && scroller.getBoundingClientRect();
      if (clip && pos.bottom > Math.max(0, clip.top) && pos.top < Math.min(view.innerHeight, clip.bottom)) {
        // scrollTop can round to an integer. Carry its residual while this
        // exact editor and offset persist, rather than accumulating it.
        var same = last.editor === editor && last.scroller === scroller &&
          last.expected === scroller.scrollTop && Math.abs(pos.top - last.top) <= 1;
        var top = same ? last.top : pos.top;
        last.editor = editor; last.scroller = scroller; last.top = top;
        return function () {
          if (!table.isConnected || doc.activeElement !== editor || !table.contains(editor)) return;
          var delta = editor.getBoundingClientRect().top - top;
          if (Math.abs(delta) > 0.5) scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'instant' });
          last.expected = scroller.scrollTop;
        };
      }
    }
    last.editor = null;
    return window.ReaderMorph && window.ReaderMorph.captureReadingPosition
      ? window.ReaderMorph.captureReadingPosition(mount) : function () {};
  }

  // A 2500-row table shows first. Bookmark controls use the cached set and
  // remain in their original actionable row layout, inserted in idle slices.
  var SLICE = 400;
  var injectTimer = 0;
  function scheduleInject() {
    if (injectTimer) return;
    var run = function () { injectTimer = 0; inject(); };
    injectTimer = (typeof window.requestIdleCallback === 'function')
      ? window.requestIdleCallback(run, { timeout: 1200 })
      : setTimeout(run, 120);
  }

  async function inject() {
    if (document.body && document.body.classList.contains('room-mode')) return;
    var h = host();
    if (!h || !h.getRow) return;
    var table = document.querySelector('#tableContainer #proTable');
    if (!table) return;
    var cells = table.querySelectorAll('td.col-action-cell');
    var todo = [];
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.querySelector('.row-bookmark-btn')) continue;
      var tts = cell.querySelector('.row-tts-btn[data-row-idx]');
      if (!tts) continue;
      var idx = Number(tts.getAttribute('data-row-idx'));
      var row = Number.isFinite(idx) ? h.getRow(idx) : null;
      if (!row || !row._v3_sentenceId || !row._v3_textId) continue;
      todo.push({ cell: cell, idx: idx, textId: String(row._v3_textId), sid: String(row._v3_sentenceId) });
    }
    if (!todo.length) return;
    var sets = {};
    var ids = Array.from(new Set(todo.map(function (p) { return p.textId; })));
    for (var k = 0; k < ids.length; k++) { try { sets[ids[k]] = await loadSet(ids[k]); } catch (_) { sets[ids[k]] = new Set(); } }
    // in slices, with an idle moment between them: the page answers taps (▶, video) while a long
    // table is still getting its ribbons; a newer render simply leaves the old cells disconnected
    var idle = function () {
      return new Promise(function (r) {
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(function () { r(); }, { timeout: 600 });
        else setTimeout(r, 16);
      });
    };
    var last = {};
    for (var start = 0; start < todo.length; start += SLICE) {
      if (start) await idle();
      if (!table.isConnected) return;
      var restore = null;
      try {
        for (var j = start; j < Math.min(start + SLICE, todo.length); j++) {
          var p = todo[j];
          if (!p.cell.isConnected || p.cell.querySelector('.row-bookmark-btn')) continue;
          if (!restore) restore = captureBatchPosition(table, last);
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'row-bookmark-btn';
          btn.setAttribute('data-row-idx', String(p.idx));
          btn.setAttribute('aria-label', tt('room.bookmark.add', 'Закладка'));
          paint(btn, sets[p.textId].has(p.sid));
          var wrap = document.createElement('div');
          wrap.className = 'col-action-row col-action-row-bm';
          wrap.appendChild(btn);
          var edits = p.cell.querySelector('.row-edit-actions');
          if (edits) p.cell.insertBefore(wrap, edits); else p.cell.appendChild(wrap);
        }
      } finally { if (restore) restore(); }
    }
  }
  // the Room may have changed a text's bookmarks while this tab was away: re-read on return
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setsByText.clear(); });

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#tableContainer .row-bookmark-btn') : null;
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(b);
  }, true);

  function wrapRenderTable() {
    var orig = window.renderTable;
    if (typeof orig !== 'function' || orig.__sbWrapped) return false;
    var wrapped = function () {
      var out = orig.apply(this, arguments);
      try { scheduleInject(); } catch (_) {}
      return out;
    };
    wrapped.__sbWrapped = true;
    // keep the agent wrapper's flag visible so it does not wrap twice
    if (orig.__saWrapped) wrapped.__saWrapped = true;
    window.renderTable = wrapped;
    try { scheduleInject(); } catch (_) {}
    return true;
  }
  if (!wrapRenderTable()) document.addEventListener('DOMContentLoaded', wrapRenderTable);

  // minimal look outside the gouache book (the gouache layer draws the ribbon glyph itself)
  try {
    var st = document.createElement('style');
    st.textContent = '#tableContainer .row-bookmark-btn{appearance:none;background:transparent;border:0;cursor:pointer;color:var(--theme-text-secondary,#64748b);font-size:17px;line-height:1;padding:2px 4px;min-width:32px;min-height:32px}' +
      '#tableContainer .row-bookmark-btn.bookmarked{color:var(--accent,#1d4ed8)}' +
      '#proTable.tbl-edit-mode .col-action-row-bm{display:none}';
    document.head.appendChild(st);
  } catch (_) {}

  window.StudioBookmarks = { inject: inject };
})();
