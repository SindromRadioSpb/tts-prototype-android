// public/js/crosstext-ui.js — CrossText side-panel UI (v3.3.2 D15 C2).
//
// Modal/side-panel surface for the "Где встречается" cross-text hub.
// Reads window.CrossText for the data; renders results into a DOM panel
// that slides in from the right on desktop / full-screen on mobile.
//
// Public surface (window.LinguistProCrossTextUI):
//   openForCurrentWord()     — reads the word_study form, calls open().
//   open({word, root, binyan, excludeTextId, includeRoot}) — programmatic.
//   close()                  — close the panel.
//   _setNavigateHandler(fn)  — TEST/integration hook for click-through
//                              navigation. fn(textId, sentenceId) is called
//                              when a user clicks a snippet. Default tries
//                              window.v3LibraryOpenText(textId, {resumeSentenceId}).
//
// Privacy invariants (matches v3.3.2 plan §12):
//   - No fetch() calls. The panel queries the local CrossText service only.
//   - No telemetry of the queried word.
//   - No event emissions.

(function () {
  'use strict';

  // ── helpers ────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function T(key, fallback) {
    try {
      const fn = (typeof window !== 'undefined' && typeof window.t === 'function') ? window.t : null;
      if (!fn) return fallback;
      const v = fn(key);
      return (typeof v === 'string' && v !== key) ? v : fallback;
    } catch (_) { return fallback; }
  }

  function api() { return (typeof window !== 'undefined') ? window.CrossText : null; }

  // ── module state ───────────────────────────────────────────────────────
  let _root = null;          // <aside> root DOM
  let _overlay = null;       // backdrop
  let _currentParams = null; // last open() params
  let _navigateHandler = null;
  let _pendingDestroyTimer = null;  // setTimeout id from close() animation

  function _navigate(textId, sentenceId) {
    if (typeof _navigateHandler === 'function') {
      try { _navigateHandler(textId, sentenceId); } catch (_) {}
      return;
    }
    // Default: integrate with the host app's library navigation if present.
    if (typeof window.v3LibraryOpenText === 'function') {
      try { window.v3LibraryOpenText(textId, { resumeSentenceId: sentenceId, origin: 'crosstext' }); }
      catch (_) {}
    }
  }

  // ── panel construction ────────────────────────────────────────────────
  function _buildPanel() {
    if (_root) return;
    // Overlay click closes the panel (desktop only — on mobile the panel
    // is full-screen so there's nothing behind to click).
    _overlay = document.createElement('div');
    _overlay.setAttribute('data-testid', 'v3-crosstext-overlay');
    Object.assign(_overlay.style, {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(15, 23, 42, 0.55)', zIndex: '9000', opacity: '0',
      transition: 'opacity 180ms ease-out', pointerEvents: 'none',
    });
    _overlay.addEventListener('click', close);

    _root = document.createElement('aside');
    _root.setAttribute('data-testid', 'v3-crosstext-panel');
    _root.setAttribute('role', 'dialog');
    _root.setAttribute('aria-label', T('crossText.title', 'Где встречается'));
    Object.assign(_root.style, {
      position: 'fixed', top: '0', right: '0', height: '100vh',
      width: 'min(480px, 100vw)', maxWidth: '100vw',
      background: 'var(--theme-bg, #0f172a)', color: 'var(--theme-text, #e2e8f0)',
      boxShadow: '-8px 0 24px rgba(0,0,0,0.4)', zIndex: '9001',
      transform: 'translateX(100%)', transition: 'transform 200ms ease-out',
      display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(_overlay);
      document.body.appendChild(_root);
    }

    // Esc to close.
    _root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    // Slight delay so the transition kicks in.
    requestAnimationFrame(() => {
      if (_root)    _root.style.transform = 'translateX(0)';
      if (_overlay) { _overlay.style.opacity = '1'; _overlay.style.pointerEvents = 'auto'; }
    });
  }

  function _destroyPanel() {
    if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _root = null;
    _overlay = null;
  }

  // ── render ─────────────────────────────────────────────────────────────
  function _renderHeader(params) {
    const subtitle = [
      params.root ? T('crossText.rootLabel', 'корень') + ': ' + params.root : '',
      params.binyan ? T('crossText.binyanLabel', 'биньян') + ': ' + params.binyan : '',
    ].filter(Boolean).join(' · ');
    return (
      '<header style="padding:14px 18px;border-bottom:1px solid var(--theme-border,#334155);' +
      'display:flex;flex-direction:column;gap:4px;">' +
      '  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">' +
      '    <div style="flex:1;min-width:0;">' +
      '      <div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.04em;' +
      '                  color:var(--theme-text-secondary,#94a3b8);">' +
              escapeHtml(T('crossText.title', '🔎 Где встречается')) +
      '      </div>' +
      '      <div style="font-size:20px;font-weight:600;font-family:monospace;direction:rtl;' +
      '                  text-align:right;margin-top:2px;word-break:break-all;">' +
              escapeHtml(params.word || '') +
      '      </div>' +
            (subtitle ? '<div style="font-size:11.5px;color:var(--theme-text-secondary,#94a3b8);margin-top:4px;">' +
                        escapeHtml(subtitle) + '</div>' : '') +
      '    </div>' +
      '    <button type="button" id="v3CrossTextCloseBtn"' +
      '            data-testid="v3-crosstext-close"' +
      '            style="background:transparent;border:0;color:var(--theme-text,#e2e8f0);font-size:22px;' +
      '                   cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;"' +
      '            aria-label="' + escapeHtml(T('crossText.close', 'Закрыть')) + '">✕</button>' +
      '  </div>' +
      '  <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
      '    <input type="checkbox" id="v3CrossTextIncludeRoot"' +
      '           data-testid="v3-crosstext-include-root"' +
            (params.includeRoot ? ' checked' : '') +
      '           style="margin:0;">' +
      '    <label for="v3CrossTextIncludeRoot" style="font-size:12px;cursor:pointer;">' +
            escapeHtml(T('crossText.includeRootLabel', 'Включая другие инфлексии корня')) +
      '    </label>' +
      '  </div>' +
      '</header>'
    );
  }

  function _renderBodyLoading() {
    return '<div data-testid="v3-crosstext-loading" style="padding:24px 18px;font-size:13px;color:var(--theme-text-secondary,#94a3b8);">' +
           escapeHtml(T('crossText.loading', 'Поиск…')) + '</div>';
  }

  function _renderEmptyState(params) {
    return '<div data-testid="v3-crosstext-empty" style="padding:32px 18px;text-align:center;font-size:13px;color:var(--theme-text-secondary,#94a3b8);">' +
           escapeHtml(T('crossText.empty', 'Слово не встречается в других текстах библиотеки.')) +
           (params.excludeTextId ? '<br><span style="font-size:11px;opacity:0.8;">' +
             escapeHtml(T('crossText.emptyCurrentTextHint', '(в текущем тексте найдено — открой Search, чтобы посмотреть)')) +
             '</span>' : '') +
           '</div>';
  }

  function _renderErrorState(message) {
    return '<div data-testid="v3-crosstext-error" style="padding:24px 18px;color:#c0392b;font-size:13px;">' +
           escapeHtml(T('crossText.error', 'Ошибка: ')) + escapeHtml(message) + '</div>';
  }

  function _renderResultBody(occurrences, params) {
    if (!occurrences.length) return _renderEmptyState(params);

    // Group by text_id, preserving order_index within each group.
    const groups = new Map();
    for (const o of occurrences) {
      let g = groups.get(o.text_id);
      if (!g) { g = { text_id: o.text_id, text_title: o.text_title, occurrences: [] }; groups.set(o.text_id, g); }
      g.occurrences.push(o);
    }
    const groupList = Array.from(groups.values());
    // First 3 groups open by default.
    const totalCount = occurrences.length;
    const distinctTexts = groupList.length;

    let html = '<div data-testid="v3-crosstext-results" style="padding:14px 18px;overflow-y:auto;flex:1;">';
    html += '<div style="font-size:12px;color:var(--theme-text-secondary,#94a3b8);margin-bottom:10px;">' +
            escapeHtml(T('crossText.summary', 'Найдено: ')) +
            '<b>' + totalCount + '</b> ' + escapeHtml(T('crossText.summaryMatches', 'совпадений в ')) +
            '<b>' + distinctTexts + '</b> ' + escapeHtml(T('crossText.summaryTexts', 'текстах')) +
            '</div>';

    groupList.forEach((g, gi) => {
      const openAttr = gi < 3 ? ' open' : '';
      html += '<details' + openAttr + ' data-testid="v3-crosstext-group" data-text-id="' + escapeHtml(g.text_id) + '"' +
              ' style="margin-bottom:10px;border:1px solid var(--theme-border,#334155);border-radius:6px;background:rgba(15,23,42,0.4);">';
      html += '<summary style="padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer;list-style:none;">' +
              '▾ ' + escapeHtml(g.text_title || '—') +
              ' <span style="font-weight:400;color:var(--theme-text-secondary,#94a3b8);">(' + g.occurrences.length + ')</span>' +
              '</summary>';
      html += '<div style="padding:4px 12px 10px 12px;">';
      g.occurrences.forEach((o) => {
        // Wrap matched span in <mark>.
        const s = o.snippet || '';
        const sm = o.snippet_match || { start: 0, end: 0 };
        const before = escapeHtml(s.slice(0, sm.start));
        const mark   = escapeHtml(s.slice(sm.start, sm.end));
        const after  = escapeHtml(s.slice(sm.end));
        html += '<div data-testid="v3-crosstext-row" data-text-id="' + escapeHtml(o.text_id) + '"' +
                ' data-sentence-id="' + escapeHtml(o.sentence_id) + '"' +
                ' style="padding:6px 8px;margin:4px 0;border-radius:4px;cursor:pointer;font-size:13px;line-height:1.55;background:rgba(30,41,59,0.5);"' +
                ' onmouseover="this.style.background=\'rgba(59,130,246,0.18)\'"' +
                ' onmouseout="this.style.background=\'rgba(30,41,59,0.5)\'"' +
                ' tabindex="0">' +
                '  <div style="font-size:10.5px;color:var(--theme-text-secondary,#94a3b8);">' +
                     escapeHtml(T('crossText.sentenceLabel', 'Стих ')) + (o.order_index + 1) +
                     (o.positions_in_sentence > 1 ? ' · ' + o.positions_in_sentence + '×' : '') +
                '  </div>' +
                '  <div style="direction:rtl;text-align:right;font-family:monospace;margin-top:2px;">' +
                     before + '<mark style="background:#fbbf24;color:#0f172a;padding:0 2px;border-radius:2px;">' + mark + '</mark>' + after +
                '  </div>' +
                '</div>';
      });
      html += '</div></details>';
    });

    html += '<div style="padding:8px 0 16px 0;font-size:11px;color:var(--theme-text-secondary,#64748b);text-align:center;">' +
            escapeHtml(T('crossText.clickHint', 'Тыкни на стих, чтобы перейти к нему в библиотеке.')) +
            '</div>';
    html += '</div>'; // body
    return html;
  }

  function _wireBodyEvents() {
    if (!_root) return;
    const closeBtn = _root.querySelector('#v3CrossTextCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    const incRootCb = _root.querySelector('#v3CrossTextIncludeRoot');
    if (incRootCb) incRootCb.addEventListener('change', async () => {
      if (!_currentParams) return;
      _currentParams.includeRoot = !!incRootCb.checked;
      await _refresh();
    });

    const rows = _root.querySelectorAll('[data-testid="v3-crosstext-row"]');
    rows.forEach((row) => {
      const onActivate = () => {
        const textId = row.getAttribute('data-text-id');
        const sentenceId = row.getAttribute('data-sentence-id');
        close();
        _navigate(textId, sentenceId);
      };
      row.addEventListener('click', onActivate);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
      });
    });
  }

  async function _refresh() {
    if (!_root || !_currentParams) return;
    const bodyEl = _root.querySelector('[data-testid="v3-crosstext-body-slot"]');
    if (bodyEl) bodyEl.innerHTML = _renderBodyLoading();

    const r = api();
    if (!r) {
      if (bodyEl) bodyEl.innerHTML = _renderErrorState(T('crossText.moduleMissing', 'CrossText не загружен'));
      return;
    }
    let occurrences = [];
    try {
      occurrences = await r.findOccurrences(_currentParams.word, {
        includeRoot: _currentParams.includeRoot,
        excludeTextId: _currentParams.excludeTextId || undefined,
      });
    } catch (e) {
      if (bodyEl) bodyEl.innerHTML = _renderErrorState(String((e && e.message) || e));
      return;
    }
    if (bodyEl) bodyEl.innerHTML = _renderResultBody(occurrences, _currentParams);
    _wireBodyEvents();
  }

  // ── public API ─────────────────────────────────────────────────────────
  async function open(params) {
    params = params || {};
    _currentParams = {
      word: String(params.word || '').trim(),
      root: params.root || null,
      binyan: params.binyan || null,
      excludeTextId: params.excludeTextId || null,
      includeRoot: !!params.includeRoot,
    };
    if (!_currentParams.word) {
      try { if (window.showToast) window.showToast(T('crossText.toast.noWord', 'Введите слово сначала'), 'warn'); } catch (_) {}
      return;
    }

    // Cancel any pending destroy from a recent close() — otherwise the
    // re-opened panel gets ripped out mid-render by the previous timer.
    if (_pendingDestroyTimer) {
      clearTimeout(_pendingDestroyTimer);
      _pendingDestroyTimer = null;
    }
    // Re-show if we're in the middle of a close animation.
    if (_root) {
      _root.style.transform = 'translateX(0)';
      if (_overlay) { _overlay.style.opacity = '1'; _overlay.style.pointerEvents = 'auto'; }
    }
    _buildPanel();
    _root.innerHTML = _renderHeader(_currentParams) +
      '<div data-testid="v3-crosstext-body-slot" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">' +
        _renderBodyLoading() +
      '</div>';
    _wireBodyEvents();
    // Focus management — focus the close button for keyboard users.
    const closeBtn = _root.querySelector('#v3CrossTextCloseBtn');
    if (closeBtn) closeBtn.focus();

    await _refresh();
  }

  function close() {
    if (!_root) return;
    _root.style.transform = 'translateX(100%)';
    if (_overlay) { _overlay.style.opacity = '0'; _overlay.style.pointerEvents = 'none'; }
    if (_pendingDestroyTimer) clearTimeout(_pendingDestroyTimer);
    _pendingDestroyTimer = setTimeout(() => {
      _pendingDestroyTimer = null;
      _destroyPanel();
    }, 220);
  }

  function openForCurrentWord() {
    if (typeof document === 'undefined') return;
    const wordEl   = document.getElementById('v3NotesTplWordStudyWord');
    const rootEl   = document.getElementById('v3NotesTplWordStudyRoot');
    const binyanEl = document.getElementById('v3NotesTplWordStudyBinyan');
    const word   = wordEl ? String(wordEl.value || '').trim() : '';
    const root   = rootEl ? String(rootEl.value || '').trim() : '';
    const binyan = binyanEl ? String(binyanEl.value || '').trim() : '';
    // currentTextId is set by the host app when a text is open; available via
    // a few possible globals — try them in order.
    let excludeTextId = null;
    try {
      if (typeof window.v3CurrentTextId === 'string') excludeTextId = window.v3CurrentTextId;
      else if (window.v3Library && window.v3Library.currentTextId) excludeTextId = window.v3Library.currentTextId;
    } catch (_) {}
    return open({ word, root: root || null, binyan: binyan || null, excludeTextId, includeRoot: !!root });
  }

  function _setNavigateHandler(fn) {
    _navigateHandler = (typeof fn === 'function') ? fn : null;
  }

  // ── expose ─────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.LinguistProCrossTextUI = {
      open, close, openForCurrentWord,
      _setNavigateHandler,
    };
  }
})();
