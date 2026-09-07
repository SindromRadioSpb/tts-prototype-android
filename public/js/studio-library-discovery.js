// Studio's discovery adapter; shared exact vocabulary rules and Room aggregate cache.
(function (root) {
  'use strict';
  let service = null, repaintTimer = null, progress = null, readyPromise = null, currentTexts = [], sortGatePending = false;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = (key, fallback) => { const value = root.t && root.t(key); return value && value !== key ? value : fallback; };
  function badgeContent(id) {
    const fit = service && service.get(id);
    let label;
    const pct = fit && fit.recorded_familiar_pct_lower_bound;
    if (fit && ['AVAILABLE', 'AVAILABLE_LIMITED'].includes(fit.status) && pct != null && Number.isFinite(Number(pct))) {
      label = Number(fit.unresolved_uncertainty_pp) > 0
        ? t('room.compass.recordedFamiliarLowerBound', 'Не менее {value}% знакомы').replace('{value}', Math.round(pct))
        : Math.round(pct) + '% ' + t('room.compass.recordedFamiliar', 'знакомы');
    } else {
      const key = !fit || fit.status === 'PENDING' ? 'preparing' : fit.status === 'NEEDS_PROFILE' ? 'needsProfile'
        : fit.status === 'STALE' ? 'stale' : fit.status === 'UNSUPPORTED' ? 'unsupported' : 'unavailable';
      label = t('room.compass.' + key, 'Оценка недоступна');
    }
    const explanation = fit && fit.status === 'NEEDS_PROFILE' ? t('discovery.profileHelp', 'Отмечайте знакомые слова во время чтения. Здесь появится их доля в тексте.')
      : t('discovery.familiarHelp', 'Доля слов, знакомство с которыми записано в вашем профиле. Это не оценка понимания текста.');
    const limited = fit && fit.status === 'AVAILABLE_LIMITED' ? '<p>' + esc(t('discovery.limitedHelp', 'Для надёжной сортировки слишком много неоднозначных слов. Показана только нижняя граница.')) + '</p>' : '';
    return '<summary>' + esc(label) + '</summary><div class="v3-familiarity-help"><p>' + esc(explanation) + '</p>' + limited + '</div>';
  }
  function badge(id) {
    return '<details class="v3-library-familiarity" data-library-familiarity="' + esc(id) + '">' + badgeContent(id) + '</details>';
  }
  function paint() {
    repaintTimer = null;
    document.querySelectorAll('[data-library-familiarity]').forEach(node => { node.innerHTML = badgeContent(node.dataset.libraryFamiliarity); });
    const status = document.getElementById('v3LibraryFamiliarityStatus');
    if (status && progress) {
      status.hidden = !progress.total;
      const text = progress.state === 'preparing' ? t('discovery.preparing', 'Знакомость: проверено {done} из {total}').replace('{done}', progress.done).replace('{total}', progress.total)
        : progress.state === 'needs-profile' ? t('discovery.profileHelp', 'Отмечайте знакомые слова во время чтения. Здесь появится их доля в тексте.')
          : progress.state === 'sort-needs-profile' ? t('room.mytexts.sortFamiliarNeedsProfile', 'Сначала отметьте несколько знакомых слов.')
            : progress.state === 'sort-no-reliable' ? t('room.compass.sortNoReliable', 'Пока нет текстов с достаточно достоверной оценкой для сортировки.')
          : progress.state === 'error' ? t('discovery.analysisRetry', 'Не удалось получить профиль слов. Обновите библиотеку, чтобы повторить.') : '';
      status.textContent = text;
      status.hidden = !text;
    }
    // Use the selected order throughout preparation; unrankable entries keep
    // their deterministic fallback position. Repaint at most once per batch.
    if (!sortGatePending && document.getElementById('v3LibrarySort')?.value === 'familiar_desc' && typeof root.v3LibraryApplyFilter === 'function') {
      root.v3LibraryApplyFilter();
    }
  }
  function queuePaint(value) {
    progress = value;
    if (!repaintTimer) repaintTimer = setTimeout(paint, 180);
  }
  async function start(db, texts, keepSortGate) {
    cancel();
    if (keepSortGate) sortGatePending = true;
    currentTexts = Array.isArray(texts) ? texts.slice() : [];
    service = root.LocalTextFamiliarity.createService({ db, compass: root.LearningCompassCore, onUpdate: queuePaint });
    readyPromise = service.prepare(currentTexts);
    await readyPromise;
  }
  async function requestSort(db, texts) {
    const list = Array.isArray(texts) ? texts : currentTexts;
    let projection = null;
    try { projection = await db.getLearningCompassProjection(); } catch (_) {}
    if (!projection || !Number(projection.tracked_lexeme_count)) {
      queuePaint({ done: 0, total: list.length, state: 'sort-needs-profile' });
      return { ok: false, reason: 'NEEDS_PROFILE' };
    }
    sortGatePending = true;
    try {
      if (!service) await start(db, list, true);
      else {
        // A profile may have changed after the cards were initially prepared
        // (including an earlier NEEDS_PROFILE pass). Re-evaluate every current
        // card against the fresh projection before promising a reliable order.
        currentTexts = list.slice();
        readyPromise = service.prepare(currentTexts);
        try { await readyPromise; } catch (_) {}
      }
    } finally { sortGatePending = false; }
    let reliable = 0;
    for (const item of list) {
      const fit = service && service.get(item && item.id);
      if (fit && fit.status === 'AVAILABLE' && fit.rank_eligible === true) reliable++;
    }
    if (!reliable) {
      queuePaint({ done: list.length, total: list.length, state: 'sort-no-reliable' });
      return { ok: false, reason: 'NO_RELIABLE' };
    }
    return { ok: true, reliable };
  }
  function cancel() {
    if (service) service.cancel();
    service = null;
    if (repaintTimer) clearTimeout(repaintTimer);
    repaintTimer = null; progress = null; readyPromise = null; currentTexts = []; sortGatePending = false;
  }
  root.StudioLibraryDiscovery = { start, cancel, badge, paint,
    requestSort,
    compare: (left, right) => root.CatalogDiscovery.compareFamiliarity(service && service.get(left.id), service && service.get(right.id)),
    get: id => service && service.get(id) };
})(window);
