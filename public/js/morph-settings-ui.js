// public/js/morph-settings-ui.js — Workstream A1 Phase 2 Settings surface.
//
// Modal-driven UI for the Hebrew morphology dictionary tier toggle, paired
// with `MorphProvider.setDictTier()` from morph-provider.js. Mirrors the
// pattern of research-ui.js (v3ConfirmModal + showToast + i18n via window.t).
//
// Public surface (window.LinguistProMorphSettings):
//   open()    — main modal: current tier, status, toggle, advanced actions
//
// Privacy/UX invariants:
//   - The "📚 Расширенный словарь" toggle is the ONLY entry point for
//     enabling the ~30 MB full-tier download. NEVER auto-enable.
//   - Show explicit warnings about: download size, iOS Safari quota
//     considerations, and the fact that the toggle is "beta" until the
//     full dict file is actually shipped via deploy.
//   - On toggle flip, call MorphProvider.setDictTier() which purges
//     in-memory map + SW cache for both tier variants. The next lookup
//     triggers a fresh fetch.
//   - Status block surfaces what's loaded (tier, entry count, size, error
//     state) so the user can verify their action took effect.

(function () {
  'use strict';

  function escapeHtml(s) {
    const v = String(s == null ? '' : s);
    return v.replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function T(key, fallback) {
    try {
      const fn = (typeof window !== 'undefined' && typeof window.t === 'function') ? window.t : null;
      if (!fn) return fallback;
      const v = fn(key);
      return (typeof v === 'string' && v !== key) ? v : fallback;
    } catch (_) { return fallback; }
  }

  function toast(msg, kind) {
    try {
      if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(msg, kind || 'info');
      }
    } catch (_) {}
  }

  function fmtBytes(b) {
    const n = Number(b) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function api() { return (typeof window !== 'undefined') ? window.MorphProvider : null; }
  function ensureApi() {
    const a = api();
    if (!a) {
      toast(T('morph.settings.toast.moduleMissing', 'Morphology provider не загружен'), 'error');
      return null;
    }
    return a;
  }

  // Build the modal body HTML. Pulls live status from MorphProvider so the
  // user sees the actual loaded state, not a cached value.
  function buildBody(p) {
    const status = p.getStatus();
    const currentTier = status.dictTier || 'basic';
    const t1 = status.tier1 || {};
    const loaded = t1.state === 'ready';
    const errored = t1.state === 'error';

    let statusLine;
    if (loaded) {
      statusLine = T('morph.settings.statusLoaded',
        'Загружен tier ') + '<b>' + escapeHtml(t1.loadedTier || currentTier) + '</b>' +
        ' · ' + escapeHtml(String(t1.entries || 0)) + ' ' + escapeHtml(T('morph.settings.entries', 'записей')) +
        ' · ' + escapeHtml(fmtBytes(t1.sizeBytes || 0));
    } else if (errored) {
      statusLine = '<span style="color:#c0392b;">' + escapeHtml(T('morph.settings.statusError', '⚠ Ошибка: ')) +
        escapeHtml(String(t1.error || '?')) + '</span>';
    } else if (t1.state === 'fetching' || t1.state === 'loading') {
      statusLine = escapeHtml(T('morph.settings.statusFetching', '⏳ Загружается…'));
    } else {
      statusLine = escapeHtml(T('morph.settings.statusIdle', 'Словарь ещё не загружен (lazy fetch на первый word-study).'));
    }

    let body = '<div class="v3-morph-settings">';

    body += '<h4 style="margin:0 0 10px 0;">' +
      escapeHtml(T('morph.settings.heading', '🔤 Морфологический словарь')) +
      '</h4>';

    body += '<p style="margin:0 0 14px 0;font-size:12.5px;line-height:1.5;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('morph.settings.intro',
        'Локальный pre-computed словарь Hebrew-морфологии (hspell). Tier 1 — встроенный (~7 MB), всегда доступен. Tier 2 — opt-in расширенный (~25-30 MB), ~250K записей. Все данные локальные, ничего не отправляется на сервер.')) +
      '</p>';

    // Status row.
    body += '<div class="v3-morph-status" style="' +
      'padding:10px 12px;margin:0 0 14px 0;background:rgba(59,130,246,0.07);' +
      'border-left:3px solid rgba(59,130,246,0.5);border-radius:4px;font-size:12px;line-height:1.6;">' +
      '<div><b>' + escapeHtml(T('morph.settings.statusLabel', 'Состояние:')) + '</b> ' + statusLine + '</div>' +
      '<div><b>' + escapeHtml(T('morph.settings.currentTierLabel', 'Выбранный tier:')) + '</b> <code>' + escapeHtml(currentTier) + '</code></div>' +
      '</div>';

    // Tier toggle group.
    body += '<div class="v3-morph-toggle" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">';

    body += '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid var(--theme-border,#ddd);border-radius:6px;cursor:pointer;' +
      (currentTier === 'basic' ? 'background:rgba(52,211,153,0.08);border-color:rgba(52,211,153,0.5);' : '') +
      '">';
    body += '<input type="radio" name="v3MorphTier" value="basic" data-testid="v3-morph-tier-basic" ' +
      (currentTier === 'basic' ? 'checked ' : '') +
      'style="margin-top:3px;">';
    body += '<div><b>' + escapeHtml(T('morph.settings.tier.basicLabel', 'Базовый словарь (по умолчанию)')) + '</b><br>' +
      '<span style="font-size:11.5px;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('morph.settings.tier.basicNote',
        '~34K записей · 7 MB · 655 KB gzip · ships с приложением, не требует загрузки.')) +
      '</span></div>';
    body += '</label>';

    body += '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid var(--theme-border,#ddd);border-radius:6px;cursor:pointer;' +
      (currentTier === 'full' ? 'background:rgba(251,191,36,0.08);border-color:rgba(251,191,36,0.5);' : '') +
      '">';
    body += '<input type="radio" name="v3MorphTier" value="full" data-testid="v3-morph-tier-full" ' +
      (currentTier === 'full' ? 'checked ' : '') +
      'style="margin-top:3px;">';
    body += '<div><b>' + escapeHtml(T('morph.settings.tier.fullLabel', '📚 Расширенный словарь (бета)')) + '</b><br>' +
      '<span style="font-size:11.5px;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('morph.settings.tier.fullNote',
        '~250K записей · ~25-30 MB · ~3-5 MB gzip · скачивается lazily при первом lookup. Безопасно для desktop/Android; на iOS Safari может задеть storage quota (учти).')) +
      '</span></div>';
    body += '</label>';

    body += '</div>';

    // Phase D — corpus morphology auto-enrich toggle (Dicta-at-import).
    try {
      const autoOn = (typeof window.v3MorphAutoEnrichEnabled === 'function') && window.v3MorphAutoEnrichEnabled();
      body += '<label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--theme-border,#ddd);border-radius:6px;cursor:pointer;margin-bottom:14px;">' +
        '<input type="checkbox" id="v3MorphAutoEnrichToggle" ' + (autoOn ? 'checked ' : '') +
        'style="width:17px;height:17px;flex:0 0 auto;">' +
        '<span style="font-size:12.5px;line-height:1.4;">' +
        escapeHtml(T('morph.autoEnrichToggle', 'Авто-обогащать новые тексты через Dicta (онлайн)')) +
        '</span></label>';
    } catch (_) {}

    // Stage 3 (Concept A) — eager auto-build of ②-notes (off/conservative/aggressive).
    try {
      const mode = (typeof window.v3NotesAutogenMode === 'function') ? window.v3NotesAutogenMode() : 'off';
      const opt = (v, lbl) => '<option value="' + v + '"' + (mode === v ? ' selected' : '') + '>' + escapeHtml(lbl) + '</option>';
      body += '<label style="display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--theme-border,#ddd);border-radius:6px;margin-bottom:14px;">' +
        '<span style="font-size:12.5px;line-height:1.4;font-weight:600;">' +
        escapeHtml(T('library.autogenModeLabel', 'Авто-строить знания из текстов (②-заметки)')) + '</span>' +
        '<select id="v3NotesAutogenModeSelect" style="font-size:12.5px;padding:6px 8px;border-radius:6px;border:1px solid var(--theme-border,#ddd);background:var(--theme-bg-card,#fff);color:inherit;">' +
        opt('off', T('library.autogenModeOff', 'Выкл')) +
        opt('conservative', T('library.autogenModeConservative', 'Консервативно (надёжные + i+1)')) +
        opt('aggressive', T('library.autogenModeAggressive', 'Агрессивно (все надёжные)')) +
        '</select>' +
        '<span style="font-size:11px;color:var(--theme-text-secondary,#999);line-height:1.35;">' +
        escapeHtml(T('library.autogenModeHint', 'После обогащения текста морфологией надёжные слова добавляются в базу автоматически; сомнительные — в очередь «на проверку». Ваши правки не затираются.')) +
        '</span></label>';
    } catch (_) {}

    // Stage 5 (Concept B) — one-tap collect-while-reading toggle.
    try {
      const collectOn = (typeof window.v3NotesCollectMode === 'function') && window.v3NotesCollectMode() === 'on';
      body += '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid var(--theme-border,#ddd);border-radius:6px;cursor:pointer;margin-bottom:14px;">' +
        '<input type="checkbox" id="v3NotesCollectModeToggle" ' + (collectOn ? 'checked ' : '') +
        'style="width:17px;height:17px;flex:0 0 auto;margin-top:1px;">' +
        '<span style="display:flex;flex-direction:column;gap:3px;">' +
        '<span style="font-size:12.5px;line-height:1.4;font-weight:600;">' +
        escapeHtml(T('library.collectModeLabel', 'Собирать слова одним тапом (при чтении)')) + '</span>' +
        '<span style="font-size:11px;color:var(--theme-text-secondary,#999);line-height:1.35;">' +
        escapeHtml(T('library.collectModeHint', 'Тап по слову в выборе слова сразу сохраняет ②-заметку (морфология подставляется), без редактора. Можно отменить.')) +
        '</span></span></label>';
    } catch (_) {}

    // Stage 4 (Concept D) — opt-in auto-seed of the i+1 SRS frontier after a build.
    try {
      const seedOn = (typeof window.v3NotesSrsSeedMode === 'function') && window.v3NotesSrsSeedMode() === 'on';
      body += '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid var(--theme-border,#ddd);border-radius:6px;cursor:pointer;margin-bottom:14px;">' +
        '<input type="checkbox" id="v3NotesSrsSeedToggle" ' + (seedOn ? 'checked ' : '') +
        'style="width:17px;height:17px;flex:0 0 auto;margin-top:1px;">' +
        '<span style="display:flex;flex-direction:column;gap:3px;">' +
        '<span style="font-size:12.5px;line-height:1.4;font-weight:600;">' +
        escapeHtml(T('library.srsSeedModeLabel', 'Авто-сеять frontier в SRS после построения')) + '</span>' +
        '<span style="font-size:11px;color:var(--theme-text-secondary,#999);line-height:1.35;">' +
        escapeHtml(T('library.srsSeedModeHint', 'Слова на грани «знаю→учу» автоматически становятся SRS-карточками. Повторение — в Anki (экспорт). По умолчанию выкл; есть и ручная кнопка после построения.')) +
        '</span></span></label>';
    } catch (_) {}

    // Advanced actions.
    body += '<div class="v3-morph-advanced" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">';
    body += '<button type="button" id="v3MorphClearCacheBtn" class="btn-secondary" style="font-size:12px;padding:6px 10px;">' +
      escapeHtml(T('morph.settings.btn.clearCache', '🗑 Очистить SW cache + перезагрузить')) +
      '</button>';
    body += '</div>';

    body += '<p style="margin:8px 0 0 0;font-size:11px;color:var(--theme-text-secondary,#999);">' +
      escapeHtml(T('morph.settings.privacyNote',
        'Все данные хранятся локально. Никакие лукапы (запросы по словам) НЕ логируются и НЕ отправляются на сервер.')) +
      '</p>';

    body += '</div>';
    return body;
  }

  function open() {
    const p = ensureApi(); if (!p) return;

    const body = buildBody(p);

    v3ConfirmModal({
      title: T('morph.settings.title', '🔤 Морфология: словарь'),
      body,
      isHtml: true,
      okText: T('morph.settings.btn.apply', 'Применить'),
      cancelText: T('morph.settings.btn.cancel', 'Отмена'),
    }).then(async (confirmed) => {
      if (!confirmed) return;

      // Read selected tier from the radio group.
      const radios = document.querySelectorAll('input[name="v3MorphTier"]');
      let selected = null;
      for (const r of radios) if (r.checked) { selected = r.value; break; }
      if (!selected || (selected !== 'basic' && selected !== 'full')) {
        toast(T('morph.settings.toast.noSelection', 'Выберите tier'), 'warn');
        return;
      }

      const current = p.getDictTier();
      if (selected === current && p.getStatus().tier1.loadedTier === current) {
        toast(T('morph.settings.toast.unchanged', '✓ Без изменений: уже на выбранном tier'), 'info');
        return;
      }

      try {
        const res = await p.setDictTier(selected);
        if (!res.ok) {
          toast(T('morph.settings.toast.applyFailed', '⚠ Не удалось применить: ') + (res.error || '?'), 'error');
          return;
        }

        if (selected === 'full') {
          toast(T('morph.settings.toast.fullEnabled',
            '✓ Расширенный словарь активирован. Скачается при первом lookup (~25-30 MB).'), 'success');
        } else {
          toast(T('morph.settings.toast.basicEnabled',
            '✓ Базовый словарь активирован.'), 'success');
        }

        // Trigger lazy reload so user sees the new tier load.
        try { p.ensureReady(); } catch (_) {}
      } catch (e) {
        toast(T('morph.settings.toast.applyFailed', '⚠ Не удалось применить: ') + String((e && e.message) || e), 'error');
      }
    }).catch(() => {});

    // Wire up the "Clear cache" button while modal is open. It bypasses
    // the OK/Cancel flow and operates immediately.
    setTimeout(() => {
      const enr = document.getElementById('v3MorphAutoEnrichToggle');
      if (enr) enr.addEventListener('change', () => {
        try { if (typeof window.v3MorphSetAutoEnrich === 'function') window.v3MorphSetAutoEnrich(enr.checked); } catch (_) {}
      });
      const agm = document.getElementById('v3NotesAutogenModeSelect');
      if (agm) agm.addEventListener('change', () => {
        try { if (typeof window.v3NotesSetAutogenMode === 'function') window.v3NotesSetAutogenMode(agm.value); } catch (_) {}
      });
      const col = document.getElementById('v3NotesCollectModeToggle');
      if (col) col.addEventListener('change', () => {
        try { if (typeof window.v3NotesSetCollectMode === 'function') window.v3NotesSetCollectMode(col.checked); } catch (_) {}
      });
      const seed = document.getElementById('v3NotesSrsSeedToggle');
      if (seed) seed.addEventListener('change', () => {
        try { if (typeof window.v3NotesSetSrsSeedMode === 'function') window.v3NotesSetSrsSeedMode(seed.checked); } catch (_) {}
      });
      const btn = document.getElementById('v3MorphClearCacheBtn');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        try {
          await p.forceUpdate();
          toast(T('morph.settings.toast.cacheCleared', '✓ Cache очищен, словарь будет переcкачан.'), 'success');
        } catch (e) {
          toast(T('morph.settings.toast.cacheClearFailed', '⚠ Не удалось очистить cache: ') + String((e && e.message) || e), 'error');
        }
      });
    }, 50);
  }

  if (typeof window !== 'undefined') {
    window.LinguistProMorphSettings = { open };
  }
})();
