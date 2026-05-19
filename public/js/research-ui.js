// public/js/research-ui.js — Direction 11.2 UX layer.
//
// Modal-driven flows for opt-in research mode. Uses the host app's
// v3ConfirmModal + showToast helpers; depends on window.LinguistProResearch
// (research.js) for state + business logic.
//
// Surface:
//   window.LinguistProResearchUI.open()             — main panel
//   window.LinguistProResearchUI.openConsent()      — consent screen (full text + checklist)
//   window.LinguistProResearchUI.openJoinCohort()   — cohort code input
//   window.LinguistProResearchUI.openTransparency() — "what we collected"
//   window.LinguistProResearchUI.openWithdraw()     — withdrawal confirm

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

  function api() { return (typeof window !== 'undefined') ? window.LinguistProResearch : null; }

  function ensureApi() {
    const a = api();
    if (!a) {
      toast(T('research.toast.moduleMissing', 'Research-модуль не загружен'), 'error');
      return null;
    }
    return a;
  }

  function fmtMs(ms) {
    const n = Number(ms) || 0;
    if (n < 1000) return n + ' ms';
    const sec = Math.round(n / 1000);
    if (sec < 60) return sec + 's';
    const min = Math.round(sec / 60);
    if (min < 60) return min + ' min';
    return Math.round(min / 60) + 'h ' + (min % 60) + 'min';
  }

  function fmtBytes(b) {
    const n = Number(b) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  // ── main panel ─────────────────────────────────────────────────────────
  function open() {
    const r = ensureApi(); if (!r) return;
    const s = r.getState();
    const reconsent = r.needsReconsent();
    const sid = s.studentId || '—';
    const cohort = s.cohortCode || '—';
    const consentV = s.consentVersion || '—';
    const lastUpload = s.lastUploadDate || '—';

    let body = '<div class="v3-research-panel">';
    body += '<div class="v3-research-panel-summary">';
    body += '<div><b>' + escapeHtml(T('research.panel.status', 'Статус')) + ':</b> ';
    if (!s.enabled) {
      body += '<span class="v3-research-tag v3-research-tag-off">' + escapeHtml(T('research.panel.disabled', 'Выключен')) + '</span>';
    } else if (reconsent) {
      body += '<span class="v3-research-tag v3-research-tag-warn">' + escapeHtml(T('research.panel.reconsent', 'Требуется повторное согласие')) + '</span>';
    } else if (!s.cohortCode) {
      body += '<span class="v3-research-tag v3-research-tag-warn">' + escapeHtml(T('research.panel.noCohort', 'Без cohort code')) + '</span>';
    } else {
      body += '<span class="v3-research-tag v3-research-tag-on">' + escapeHtml(T('research.panel.enabled', 'Активен')) + '</span>';
    }
    body += '</div>';

    if (s.enabled) {
      body += '<div><b>' + escapeHtml(T('research.panel.studentId', 'Anonymous student ID')) + ':</b> <code style="font-size:11px;">' + escapeHtml(sid) + '</code></div>';
      body += '<div><b>' + escapeHtml(T('research.panel.cohort', 'Cohort code')) + ':</b> ' + escapeHtml(cohort) + '</div>';
      body += '<div><b>' + escapeHtml(T('research.panel.consentVersion', 'Версия согласия')) + ':</b> ' + escapeHtml(consentV) + '</div>';
      body += '<div><b>' + escapeHtml(T('research.panel.lastUpload', 'Последний upload')) + ':</b> ' + escapeHtml(lastUpload) + '</div>';
      body += '<div><b>' + escapeHtml(T('research.panel.queueSize', 'В очереди')) + ':</b> ' + escapeHtml(String(s.queueSize)) + '</div>';
    }
    body += '</div>';

    body += '<div class="v3-research-panel-actions" style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">';
    if (!s.enabled || reconsent) {
      body += '<button type="button" class="btn-primary" onclick="window.LinguistProResearchUI.openConsent()">' +
        escapeHtml(reconsent ? T('research.btn.reconsent', '🔄 Обновить согласие') : T('research.btn.consent', '📊 Дать согласие на участие')) + '</button>';
    } else {
      if (!s.cohortCode) {
        body += '<button type="button" class="btn-primary" onclick="window.LinguistProResearchUI.openJoinCohort()">' + escapeHtml(T('research.btn.joinCohort', '🔗 Присоединиться к когорте')) + '</button>';
      } else {
        body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openJoinCohort()">' + escapeHtml(T('research.btn.changeCohort', '🔁 Сменить когорту')) + '</button>';
        body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openTransparency()">' + escapeHtml(T('research.btn.transparency', '👁 Что собрано')) + '</button>';
        body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.uploadNow()">' + escapeHtml(T('research.btn.uploadNow', '⬆ Отправить сейчас')) + '</button>';
        body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openOutcome()">' + escapeHtml(T('research.btn.outcome', '🎓 Сдать экзамен')) + '</button>';
        body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openQuiz()">' + escapeHtml(T('research.btn.quiz', '📝 Сдать диагностику')) + '</button>';
        body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openGraph()">' + escapeHtml(T('graph.launcher', '🕸 Карта знаний')) + '</button>';
      }
      body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openWithdraw()" style="margin-left:auto;color:#c0392b;">' + escapeHtml(T('research.btn.withdraw', '🗑 Отозвать согласие')) + '</button>';
    }
    body += '</div>';

    body += '<div style="margin-top:14px;font-size:11.5px;line-height:1.5;color:var(--theme-text-secondary,#666);">';
    body += escapeHtml(T('research.panel.privacyNote', 'Все метрики анонимны и опт-ин. Сырые данные (текст, заметки, поисковые запросы, аудио) никогда не покидают устройство.'));
    body += '</div>';

    // P2-5: collapsible aggregate list so users can see collected fields without opening consent
    body += '<details style="margin-top:10px;font-size:11.5px;">';
    body += '<summary style="cursor:pointer;color:var(--theme-accent,#2563eb);font-weight:500;">' +
      escapeHtml(T('research.panel.showCollectedList', 'Что конкретно собирается →')) + '</summary>';
    body += '<ul style="margin:6px 0 4px 18px;line-height:1.6;">';
    body += '<li>' + escapeHtml(T('research.consent.collect1', 'Количество сессий и активные минуты')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect2', 'Количество открытых текстов и прочитанных предложений')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect3', 'Длительность audio playback (мс)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect4', 'Счётчики: notes / SRS-карточки / search queries (только числа)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect5', 'Распределение активности по часам дня')) + '</li>';
    body += '</ul>';
    body += '</details>';

    // A+B: in-app door to the teacher/researcher dashboard + teacher-side
    // comprehension. Always shown (a cohort curator may not be opted-in as a
    // student themselves). Opens the standalone /teacher.html page.
    body += '<div class="v3-research-teacher" style="margin-top:14px;border-top:1px solid var(--theme-border,#ddd);padding-top:12px;">';
    body += '<div style="font-size:12px;font-weight:600;margin-bottom:8px;">' +
      escapeHtml(T('research.teacher.sectionTitle', '🎓 Для преподавателя / исследователя')) + '</div>';
    body += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openTeacherDashboard()">' +
      escapeHtml(T('research.teacher.btnOpen', '📊 Teacher dashboard')) + '</button>';
    body += '<button type="button" class="btn-secondary" onclick="window.LinguistProResearchUI.openTeacherHelp()">' +
      escapeHtml(T('research.teacher.btnHelp', '❓ Как это работает')) + '</button>';
    body += '</div>';
    body += '<div style="margin-top:8px;font-size:11px;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('research.teacher.sectionNote', 'Откроется отдельная страница. Нужен cohort code + researcher token.')) + '</div>';
    body += '</div>';

    body += '</div>';

    v3ConfirmModal({
      title: T('research.title', '📊 Research mode'),
      body,
      isHtml: true,
      okText: T('research.btn.close', 'Закрыть'),
      cancelText: '',
    }).catch(() => {});
  }

  // ── consent screen ─────────────────────────────────────────────────────
  function openConsent() {
    const r = ensureApi(); if (!r) return;
    const consentVersion = r.getCurrentConsentVersion();

    // Inline the canonical RU/EN/HE excerpts from
    // docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md — kept short here; the full
    // text is available at the link in the footer.
    let body = '<div class="v3-research-consent">';
    body += '<h4 style="margin:0 0 10px 0;">' + escapeHtml(T('research.consent.heading', 'Информированное согласие на участие в исследовании')) + '</h4>';
    body += '<p style="margin:0 0 10px 0;font-size:12.5px;line-height:1.55;">' +
      escapeHtml(T('research.consent.intro',
        'Вы приглашены участвовать в исследовании эффективности цифровых инструментов изучения иврита (дипломный проект). Участие — добровольное, анонимное, и opt-in.')) + '</p>';

    body += '<h5 style="margin:12px 0 6px 0;">' + escapeHtml(T('research.consent.collectedHeader', '✓ Что мы собираем (только агрегированные)')) + '</h5>';
    body += '<ul style="margin:0 0 10px 18px;font-size:12px;line-height:1.5;">';
    body += '<li>' + escapeHtml(T('research.consent.collect1', 'Количество сессий и активные минуты')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect2', 'Количество открытых текстов и прочитанных предложений')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect3', 'Длительность audio playback (мс)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect4', 'Счётчики: notes / SRS-карточки / search queries (только числа)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.collect5', 'Распределение активности по часам дня')) + '</li>';
    body += '</ul>';

    body += '<h5 style="margin:12px 0 6px 0;color:#c0392b;">' + escapeHtml(T('research.consent.forbiddenHeader', '✗ Что НЕ собирается никогда')) + '</h5>';
    body += '<ul style="margin:0 0 10px 18px;font-size:12px;line-height:1.5;">';
    body += '<li>' + escapeHtml(T('research.consent.forbid1', 'Содержимое текстов на иврите/русском/любом языке')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.forbid2', 'Содержимое ваших заметок (только их количество)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.forbid3', 'Строки поисковых запросов (только сколько раз искали)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.forbid4', 'Аудио, имя, email, IP, локация, fingerprint устройства')) + '</li>';
    body += '</ul>';

    body += '<h5 style="margin:12px 0 6px 0;">' + escapeHtml(T('research.consent.rightsHeader', '🛡 Ваши права')) + '</h5>';
    body += '<ul style="margin:0 0 10px 18px;font-size:12px;line-height:1.5;">';
    body += '<li>' + escapeHtml(T('research.consent.right1', 'Отозвать согласие в любой момент — одна кнопка')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.right2', 'Видеть exactly что отправлено («Что собрано»)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.right3', 'Удалить все ваши данные с сервера (одна кнопка → server-side delete)')) + '</li>';
    body += '<li>' + escapeHtml(T('research.consent.right4', 'Отказаться с самого начала — приложение работает идентично')) + '</li>';
    body += '</ul>';

    body += '<details style="margin-top:8px;font-size:11.5px;color:var(--theme-text-secondary,#666);"><summary>' + escapeHtml(T('research.consent.fullText', 'Полный текст согласия (docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md)')) + '</summary>';
    body += '<p style="margin:8px 0;line-height:1.5;">' + escapeHtml(T('research.consent.retentionNote', 'Хранение: 2 года post-cohort. Доступ: только главный исследователь (через researcher token). k-anonymity threshold = 5: индивидуальные показатели скрыты в когортах меньше 5 человек.')) + '</p>';
    body += '</details>';

    body += '<div class="v3-research-consent-checklist" style="margin-top:14px;border-top:1px solid var(--theme-border,#ddd);padding-top:10px;">';
    body += '<label style="display:block;font-size:12px;margin:4px 0;"><input type="checkbox" class="v3-research-consent-cb" data-i="1"> ' + escapeHtml(T('research.consent.cb1', 'Прочитал(а) и понял(а) информацию выше')) + '</label>';
    body += '<label style="display:block;font-size:12px;margin:4px 0;"><input type="checkbox" class="v3-research-consent-cb" data-i="2"> ' + escapeHtml(T('research.consent.cb2', 'Понимаю, что моё участие добровольно')) + '</label>';
    body += '<label style="display:block;font-size:12px;margin:4px 0;"><input type="checkbox" class="v3-research-consent-cb" data-i="3"> ' + escapeHtml(T('research.consent.cb3', 'Понимаю, что могу отозвать согласие в любой момент')) + '</label>';
    body += '<label style="display:block;font-size:12px;margin:4px 0;"><input type="checkbox" class="v3-research-consent-cb" data-i="4"> ' + escapeHtml(T('research.consent.cb4', 'Понимаю, что собираются только агрегированные метрики, без raw text или PII')) + '</label>';
    body += '<label style="display:block;font-size:12px;margin:4px 0;"><input type="checkbox" class="v3-research-consent-cb" data-i="5"> ' + escapeHtml(T('research.consent.cb5', 'Согласен(на) на участие в исследовании')) + '</label>';
    body += '</div>';

    body += '<div style="margin-top:6px;font-size:11px;color:var(--theme-text-secondary,#666);">' + escapeHtml(T('research.consent.versionLabel', 'Версия документа')) + ': <code>' + escapeHtml(consentVersion) + '</code></div>';
    body += '</div>';

    v3ConfirmModal({
      title: T('research.consent.title', '📋 Согласие на участие'),
      body,
      isHtml: true,
      okText: T('research.btn.accept', 'Принимаю'),
      cancelText: T('research.btn.cancel', 'Отмена'),
    }).then((ok) => {
      if (!ok) return;
      // Validate all 5 checkboxes are checked.
      const cbs = document.querySelectorAll('.v3-research-consent-cb');
      let allChecked = true;
      cbs.forEach((cb) => { if (!cb.checked) allChecked = false; });
      if (!allChecked || cbs.length < 5) {
        toast(T('research.toast.allCheckboxesRequired', 'Отметьте все 5 пунктов согласия'), 'error');
        // Re-open consent so user can complete.
        setTimeout(openConsent, 50);
        return;
      }
      const result = r.acceptConsent(consentVersion);
      if (result.ok) {
        toast(T('research.toast.consentSaved', '✓ Согласие сохранено. Теперь введите cohort code.'), 'success');
        setTimeout(openJoinCohort, 50);
      } else {
        toast(T('research.toast.consentError', 'Не удалось сохранить согласие'), 'error');
      }
    }).catch(() => {});
  }

  // ── cohort join ────────────────────────────────────────────────────────
  function openJoinCohort() {
    const r = ensureApi(); if (!r) return;
    const current = r.getState().cohortCode || '';

    const body = '<div class="v3-research-join">' +
      '<p style="margin:0 0 10px 0;font-size:12.5px;">' +
      escapeHtml(T('research.join.intro', 'Введите пригласительный код от вашего преподавателя. Код состоит из 4–16 символов: заглавные буквы, цифры и дефис.')) +
      '</p>' +
      '<input type="text" id="v3ResearchCohortInput" maxlength="16" ' +
      'value="' + escapeHtml(current) + '" ' +
      'style="width:100%;padding:8px 10px;font-family:monospace;font-size:14px;text-transform:uppercase;border:1px solid var(--theme-border,#ccc);border-radius:6px;" ' +
      'placeholder="ULPAN-A-W2026">' +
      '<p style="margin:10px 0 0 0;font-size:11.5px;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('research.join.note', 'Код — групповой идентификатор, а не персональный. Студенты в одной когорте делят cohort code, но имеют уникальные anonymous student_id.')) +
      '</p>' +
      '</div>';

    v3ConfirmModal({
      title: T('research.join.title', '🔗 Cohort code'),
      body,
      isHtml: true,
      okText: T('research.btn.join', 'Присоединиться'),
      cancelText: T('research.btn.cancel', 'Отмена'),
    }).then((ok) => {
      if (!ok) return;
      const inp = document.getElementById('v3ResearchCohortInput');
      const val = inp ? String(inp.value || '') : '';
      const res = r.joinCohort(val);
      if (res.ok) {
        toast(T('research.toast.joined', '✓ Вы в когорте: ') + res.cohortCode, 'success');
        setTimeout(open, 50);
      } else {
        toast(T('research.toast.badCohort', 'Неверный формат cohort code'), 'error');
        setTimeout(openJoinCohort, 50);
      }
    }).catch(() => {});
  }

  // ── transparency ───────────────────────────────────────────────────────
  // Renders a single pending-upload preview row (today's accumulated metrics,
  // not yet sent). Visually distinct from sent-log entries to prevent the
  // common misread "looks stored → already on server". Privacy-critical.
  function renderPreviewSection(preview) {
    const wrap = (inner) =>
      '<div data-testid="research-preview-section" style="' +
        'background:rgba(251,191,36,0.07);' +
        'border:1px solid rgba(251,191,36,0.45);' +
        'border-radius:8px;padding:12px 14px;margin:0 0 14px 0;' +
      '">' +
      '<div style="font-size:12.5px;font-weight:600;color:#fbbf24;margin-bottom:6px;">' +
        escapeHtml(T('research.transparency.previewHeader', '📋 Превью следующего upload-а')) +
      '</div>' +
      inner +
      '</div>';

    // Negative branches: render header + reason (no metrics row).
    if (!preview || !preview.ok) {
      let reasonMsg;
      switch (preview && preview.reason) {
        case 'NOT_ENABLED':       reasonMsg = T('research.transparency.previewNotEnabled', 'Research mode не активен — preview недоступен.'); break;
        case 'NOT_JOINED':        reasonMsg = T('research.transparency.previewNotJoined', 'Не задан cohort code — preview недоступен.'); break;
        case 'RECONSENT_NEEDED':  reasonMsg = T('research.transparency.previewReconsentNeeded', 'Требуется повторное согласие — preview недоступен.'); break;
        case 'AGGREGATE_ERROR':   reasonMsg = T('research.transparency.previewError', 'Не удалось построить preview: ') + ((preview && preview.message) || '?'); break;
        default:                  reasonMsg = T('research.transparency.previewUnavailable', 'Preview недоступен.');
      }
      return wrap(
        '<p style="margin:6px 0 0 0;font-size:12px;color:var(--theme-text-secondary,#94a3b8);">' +
          escapeHtml(reasonMsg) +
        '</p>'
      );
    }

    const m = preview.metrics || {};
    const periodLabel = (preview.sinceDay === preview.uploadDay)
      ? escapeHtml(preview.uploadDay)
      : escapeHtml(preview.sinceDay) + ' → ' + escapeHtml(preview.uploadDay);

    let header =
      '<p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:var(--theme-text-secondary,#cbd5e1);">' +
        escapeHtml(T('research.transparency.previewIntro',
          'Эти данные ещё не на сервере. Они отправятся автоматически, когда aggregator посчитает день как завершённый.')) +
      '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:11.5px;margin-bottom:8px;color:var(--theme-text-secondary,#94a3b8);">' +
        '<span>' + escapeHtml(T('research.transparency.previewPeriod', 'Период: ')) + '<code style="font-family:monospace;color:#e2e8f0;">' + periodLabel + '</code></span>' +
        '<span>' + escapeHtml(T('research.transparency.previewWillUpload', 'Будет отправлено: ')) + '<code style="font-family:monospace;color:#e2e8f0;">' + escapeHtml(preview.willUploadOn) + '</code></span>' +
      '</div>';

    // Determine whether anything was captured. If metrics are all-zero,
    // surface an explicit "empty" hint INSTEAD of a misleading numeric row.
    const hasActivity =
      Number(m.sessions_count || 0) > 0 ||
      Number(m.active_minutes_real || 0) > 0 ||
      Number(m.audio_play_ms_total || 0) > 0 ||
      Number(m.cards_reviewed || 0) > 0 ||
      Number(m.notes_created || 0) > 0 ||
      Number(m.texts_opened_total || 0) > 0;

    if (!hasActivity) {
      return wrap(header +
        '<p style="margin:8px 0 0 0;font-size:12px;color:var(--theme-text-secondary,#94a3b8);font-style:italic;">' +
          escapeHtml(T('research.transparency.previewEmpty', 'Сегодня ещё нет зарегистрированных событий.')) +
        '</p>'
      );
    }

    const minutes = Number(m.active_minutes_real || 0);
    const cards   = Number(m.cards_reviewed || 0);
    const notes   = Number(m.notes_created || 0);
    const table =
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">' +
        '<thead><tr style="border-bottom:1px solid rgba(251,191,36,0.25);">' +
          '<th style="text-align:left;padding:6px 4px;">' + escapeHtml(T('research.transparency.colDate', 'Дата')) + '</th>' +
          '<th style="text-align:left;padding:6px 4px;">' + escapeHtml(T('research.transparency.colStatus', 'Статус')) + '</th>' +
          '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colMinutes', 'Минут')) + '</th>' +
          '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colCards', 'SRS')) + '</th>' +
          '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colNotes', 'Заметок')) + '</th>' +
          '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colBytes', 'Bytes')) + '</th>' +
        '</tr></thead><tbody>' +
        '<tr data-testid="research-preview-row">' +
          '<td style="padding:6px 4px;font-family:monospace;">' + periodLabel + '</td>' +
          '<td style="padding:6px 4px;"><span style="color:#fbbf24;font-weight:600;">' + escapeHtml(T('research.transparency.previewStatus', '⏳ preview')) + '</span></td>' +
          '<td style="padding:6px 4px;text-align:right;">' + escapeHtml(String(minutes)) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + escapeHtml(String(cards)) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + escapeHtml(String(notes)) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">≈' + escapeHtml(fmtBytes(preview.payloadBytes)) + '</td>' +
        '</tr></tbody>' +
      '</table>';

    return wrap(header + table);
  }

  async function openTransparency() {
    const r = ensureApi(); if (!r) return;
    // Build the preview FIRST so we can splice it into the modal body atop the
    // sent-log table. previewToday() is a pure read — safe to call here.
    let preview = null;
    try { preview = await r.previewToday(); }
    catch (e) {
      preview = { ok: false, reason: 'AGGREGATE_ERROR', message: String((e && e.message) || e) };
    }

    const uploads = r.getRecentUploads(30);
    let body = '<div class="v3-research-transparency">';
    body += renderPreviewSection(preview);
    body += '<h4 style="margin:0 0 6px 0;font-size:12.5px;color:var(--theme-text-secondary,#cbd5e1);">' +
      escapeHtml(T('research.transparency.historyHeader', 'Отправленные uploads')) +
      '</h4>';
    body += '<p style="margin:0 0 10px 0;font-size:12.5px;">' +
      escapeHtml(T('research.transparency.intro', 'Здесь видны все последние uploads (до 30). Каждая запись — это то, что было отправлено за этот день.')) +
      '</p>';
    if (!uploads.length) {
      body += '<p style="text-align:center;color:var(--theme-text-secondary,#666);margin:24px 0;">' +
        escapeHtml(T('research.transparency.empty', 'Пока ничего не отправлено. Uploads появятся после первого полного дня активности.')) +
        '</p>';
    } else {
      body += '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">';
      body += '<thead><tr style="border-bottom:1px solid var(--theme-border,#ddd);">' +
        '<th style="text-align:left;padding:6px 4px;">' + escapeHtml(T('research.transparency.colDate', 'Дата')) + '</th>' +
        '<th style="text-align:left;padding:6px 4px;">' + escapeHtml(T('research.transparency.colStatus', 'Статус')) + '</th>' +
        '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colMinutes', 'Минут')) + '</th>' +
        '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colCards', 'SRS')) + '</th>' +
        '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colNotes', 'Заметок')) + '</th>' +
        '<th style="text-align:right;padding:6px 4px;">' + escapeHtml(T('research.transparency.colBytes', 'Bytes')) + '</th>' +
        '</tr></thead><tbody>';
      for (const u of uploads) {
        body += '<tr style="border-bottom:1px solid var(--theme-border-light,#eee);">';
        body += '<td style="padding:6px 4px;font-family:monospace;">' + escapeHtml(u.upload_ts || '—') + '</td>';
        let status = '';
        if (u.error)             status = '<span style="color:#c0392b;">⚠ ' + escapeHtml(u.error) + '</span>';
        else if (u.dedupe)       status = '<span style="color:#999;">↻ dedupe</span>';
        else if (u.replayed)     status = '<span style="color:#3498db;">↻ replayed</span>';
        else if (u.stored)       status = '<span style="color:#27ae60;">✓ stored</span>';
        else                     status = '—';
        body += '<td style="padding:6px 4px;">' + status + '</td>';
        const sum = u.metric_summary || {};
        body += '<td style="padding:6px 4px;text-align:right;">' + escapeHtml(String(sum.active_minutes_real != null ? sum.active_minutes_real : '—')) + '</td>';
        body += '<td style="padding:6px 4px;text-align:right;">' + escapeHtml(String(sum.cards_reviewed != null ? sum.cards_reviewed : '—')) + '</td>';
        body += '<td style="padding:6px 4px;text-align:right;">' + escapeHtml(String(sum.notes_created != null ? sum.notes_created : '—')) + '</td>';
        body += '<td style="padding:6px 4px;text-align:right;">' + escapeHtml(u.bytes != null ? fmtBytes(u.bytes) : '—') + '</td>';
        body += '</tr>';
      }
      body += '</tbody></table>';
    }
    body += '<div style="margin-top:12px;font-size:11px;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('research.transparency.footer', 'Сохраняются последние 30 uploads. Старые записи отбрасываются.')) +
      '</div>';
    body += '</div>';

    v3ConfirmModal({
      title: T('research.transparency.title', '👁 Что собрано'),
      body,
      isHtml: true,
      okText: T('research.btn.close', 'Закрыть'),
      cancelText: '',
    }).catch(() => {});
  }

  // ── withdraw ───────────────────────────────────────────────────────────
  function openWithdraw() {
    const r = ensureApi(); if (!r) return;
    const body = '<div class="v3-research-withdraw">' +
      '<p style="margin:0 0 10px 0;font-size:13px;">' +
      escapeHtml(T('research.withdraw.warn', 'Это отзовёт согласие и удалит все ваши данные с сервера. Действие нельзя отменить.')) +
      '</p>' +
      '<ul style="margin:0 0 0 18px;font-size:12px;line-height:1.5;">' +
      '<li>' + escapeHtml(T('research.withdraw.step1', 'Server-side DELETE: все ваши daily aggregates будут физически удалены из cohort-логов.')) + '</li>' +
      '<li>' + escapeHtml(T('research.withdraw.step2', 'Audit log: факт withdrawal будет записан в deletions.log (без вашего ID — только время + count записей).')) + '</li>' +
      '<li>' + escapeHtml(T('research.withdraw.step3', 'Локально: anonymous student_id, cohort code и upload log будут очищены.')) + '</li>' +
      '<li>' + escapeHtml(T('research.withdraw.step4', 'Если сервер недоступен, DELETE-запрос будет помещён в очередь и выполнен при следующем подключении.')) + '</li>' +
      '</ul></div>';

    v3ConfirmModal({
      title: T('research.withdraw.title', '🗑 Отозвать согласие на участие'),
      body,
      isHtml: true,
      okText: T('research.withdraw.btnConfirm', 'Да, отозвать согласие'),
      cancelText: T('research.btn.cancel', 'Отмена'),
    }).then(async (ok) => {
      if (!ok) return;
      try {
        const res = await r.withdraw();
        if (res.serverOk) {
          toast(T('research.toast.withdrawnOk', '✓ Согласие отозвано. Все данные удалены с сервера.'), 'success');
        } else if (res.serverError === 'NETWORK') {
          toast(T('research.toast.withdrawnQueued', '✓ Локально отозвано. DELETE будет повторён при подключении.'), 'success');
        } else {
          toast(T('research.toast.withdrawnPartial', 'Локально отозвано. Сервер вернул ошибку: ') + (res.serverError || '?'), 'warn');
        }
      } catch (e) {
        toast(T('research.toast.withdrawnError', 'Ошибка withdrawal: ') + String((e && e.message) || e), 'error');
      }
      setTimeout(open, 50);
    }).catch(() => {});
  }

  // ── outcome self-report (Phase 11.6 §11.6.1) ───────────────────────────
  function openOutcome() {
    const r = ensureApi(); if (!r) return;
    const body = '<div class="v3-research-outcome">' +
      '<p style="margin:0 0 12px 0;font-size:12.5px;line-height:1.5;">' +
      escapeHtml(T('research.outcome.intro', 'Введите итоговый балл по результатам ulpan-курса. Это поможет исследованию связать вашу учебную активность с результатом обучения. Заполнение опционально, можно пропустить.')) +
      '</p>' +
      '<label style="display:block;font-size:12px;margin-top:8px;">' +
      escapeHtml(T('research.outcome.scoreLabel', 'Итоговый балл (0-100)')) +
      '<input type="number" id="v3ResearchOutcomeScore" min="0" max="100" step="0.5" ' +
      'style="display:block;width:120px;padding:6px 10px;margin-top:4px;font-family:monospace;font-size:14px;border:1px solid var(--theme-border,#ccc);border-radius:6px;" ' +
      'placeholder="85">' +
      '</label>' +
      '<label style="display:block;font-size:12px;margin-top:14px;">' +
      escapeHtml(T('research.outcome.confidenceLabel', 'Уверенность в результате (1-5, опционально)')) +
      '<select id="v3ResearchOutcomeConfidence" style="display:block;margin-top:4px;padding:6px 10px;font-size:13px;border:1px solid var(--theme-border,#ccc);border-radius:6px;">' +
      '<option value="">— не указано —</option>' +
      '<option value="1">1 — низкая</option>' +
      '<option value="2">2</option>' +
      '<option value="3">3 — средняя</option>' +
      '<option value="4">4</option>' +
      '<option value="5">5 — высокая</option>' +
      '</select>' +
      '</label>' +
      '<p style="margin:14px 0 0 0;font-size:11.5px;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('research.outcome.note', 'Балл будет отправлен в составе обычного research-payload\'а с пометкой outcome_capture_method: self-report. Преподаватель может отдельно загрузить authoritative версию через teacher dashboard — она перезапишет ваш self-report.')) +
      '</p></div>';

    v3ConfirmModal({
      title: T('research.outcome.title', '🎓 Сдать экзамен'),
      body,
      isHtml: true,
      okText: T('research.outcome.btnSubmit', 'Отправить балл'),
      cancelText: T('research.btn.cancel', 'Отмена'),
    }).then(async (ok) => {
      if (!ok) return;
      const scoreEl = document.getElementById('v3ResearchOutcomeScore');
      const confEl = document.getElementById('v3ResearchOutcomeConfidence');
      const score = scoreEl && scoreEl.value !== '' ? Number(scoreEl.value) : null;
      const conf = confEl && confEl.value !== '' ? Number(confEl.value) : null;
      if (score == null && conf == null) {
        toast(T('research.toast.outcomeEmpty', 'Заполните хотя бы одно поле'), 'warn');
        return;
      }
      toast(T('research.toast.outcomeSending', 'Отправляю балл…'), 'info');
      try {
        const res = await r.submitOutcome({ post_test_score: score, confidence_self_report: conf });
        if (res.ok) {
          toast(T('research.toast.outcomeOk', '✓ Балл сохранён. Спасибо!'), 'success');
        } else if (res.error === 'BAD_SCORE' || res.error === 'BAD_CONFIDENCE') {
          toast(T('research.toast.outcomeBad', '⚠ Неверное значение: ') + (res.message || res.error), 'error');
        } else {
          toast(T('research.toast.outcomeFailed', '⚠ Ошибка: ') + (res.error || res.status || '?'), 'error');
        }
      } catch (e) {
        toast(T('research.toast.outcomeFailed', '⚠ Ошибка: ') + String((e && e.message) || e), 'error');
      }
      setTimeout(open, 100);
    }).catch(() => {});
  }

  // ── manual upload trigger (debug aid) ──────────────────────────────────
  async function uploadNow() {
    const r = ensureApi(); if (!r) return;
    toast(T('research.toast.uploadStarted', 'Отправляю агрегаты…'), 'info');
    try {
      const res = await r.runDailyAggregator();
      if (res.ok) {
        if (res.dedupe) toast(T('research.toast.uploadDedupe', '↻ Сегодня уже отправлено (server dedupe).'), 'info');
        else if (res.stored) toast(T('research.toast.uploadStored', '✓ Отправлено.'), 'success');
        else toast(T('research.toast.uploadOk', '✓ OK.'), 'success');
      } else if (res.skipped === 'NOTHING_NEW') {
        toast(T('research.toast.nothingNew', 'Нет новых данных для отправки.'), 'info');
      } else if (res.skipped === 'NOT_ENABLED') {
        toast(T('research.toast.notEnabled', 'Research mode не активен.'), 'warn');
      } else if (res.skipped === 'RECONSENT_NEEDED') {
        toast(T('research.toast.reconsentNeeded', 'Требуется повторное согласие.'), 'warn');
      } else if (res.skipped === 'BACKOFF') {
        toast(T('research.toast.backoff', 'Backoff активен. Повтор позже.'), 'info');
      } else if (res.status === 429) {
        toast(T('research.toast.rateLimit', '⚠ Rate limit. Повтор через час.'), 'warn');
      } else if (res.status === 404) {
        toast(T('research.toast.cohortNotFound', '⚠ Когорта не найдена. Проверьте cohort code.'), 'error');
      } else if (res.status === 400) {
        toast(T('research.toast.schemaError', '⚠ Schema violation: ') + (res.field || res.error || '?'), 'error');
      } else if (res.queued) {
        toast(T('research.toast.queued', 'Сеть недоступна. Поставил в очередь.'), 'info');
      } else {
        toast(T('research.toast.uploadFailed', '⚠ Ошибка: ') + (res.error || res.status || '?'), 'error');
      }
    } catch (e) {
      toast(T('research.toast.uploadFailed', '⚠ Ошибка: ') + String((e && e.message) || e), 'error');
    }
    setTimeout(open, 100);
  }

  // ── calibrated quiz launcher (delegates to quiz-ui.js) ─────────────────
  function openQuiz() {
    if (typeof window === 'undefined' || !window.LinguistProQuiz ||
        typeof window.LinguistProQuiz.open !== 'function') {
      toast(T('research.toast.quizMissing', '📝 Quiz-модуль не загружен'), 'error');
      return;
    }
    try { window.LinguistProQuiz.open(); }
    catch (e) {
      toast(T('research.toast.quizFailed', '⚠ Ошибка открытия диагностики: ') + String((e && e.message) || e), 'error');
    }
  }

  // ── knowledge graph launcher (delegates to notes-graph-loader.js) ──────
  function openGraph() {
    if (typeof window === 'undefined' || !window.LinguistProGraph ||
        typeof window.LinguistProGraph.open !== 'function') {
      toast(T('research.toast.graphMissing', '🕸 Graph-модуль не загружен'), 'error');
      return;
    }
    try { window.LinguistProGraph.open(); }
    catch (e) {
      toast(T('research.toast.graphFailed', '⚠ Ошибка открытия карты знаний: ') + String((e && e.message) || e), 'error');
    }
  }

  // ── teacher / researcher dashboard door (Gap B) ────────────────────────
  function openTeacherDashboard() {
    try {
      window.open('/teacher.html', '_blank', 'noopener');
    } catch (_) {
      toast(T('research.toast.teacherOpenFailed', 'Не удалось открыть teacher dashboard'), 'error');
    }
  }

  // ── teacher-side comprehension explainer (Gap A + master-key workflow) ─
  function openTeacherHelp() {
    function section(headerKey, headerFb, items) {
      let h = '<h5 style="margin:14px 0 6px 0;font-size:13px;color:var(--theme-accent,#3b82f6);">' +
        escapeHtml(T(headerKey, headerFb)) + '</h5>';
      let ul = '<ul style="margin:0 0 0 18px;padding:0;line-height:1.55;">';
      for (const [k, fb] of items) {
        ul += '<li style="margin:5px 0;">' + escapeHtml(T(k, fb)) + '</li>';
      }
      ul += '</ul>';
      return h + ul;
    }

    let body = '<div class="v3-research-teacher-help" style="font-size:12.5px;line-height:1.55;">';
    body += '<p style="margin:0 0 4px 0;font-weight:600;color:var(--theme-text-primary,inherit);">' +
      escapeHtml(T('research.teacher.help.introHeader', 'Что это')) + '</p>';
    body += '<p style="margin:0 0 6px 0;">' +
      escapeHtml(T('research.teacher.help.intro',
        'Teacher dashboard — отдельная страница для куратора когорты. Здесь учитель создаёт когорту, видит агрегаты и выгружает баллы. Вход — по cohort code + researcher token.')) + '</p>';

    body += section('research.teacher.help.rolesHeader', 'Три роли — кто что знает', [
      ['research.teacher.help.roleOperator',   'Оператор (администратор сервера) — задаёт RESEARCH_ADMIN_TOKEN («мастер-ключ») при деплое. Без него создавать когорты нельзя.'],
      ['research.teacher.help.roleTeacher',    'Учитель / куратор — получает мастер-ключ от оператора и через форму «＋ Создать новую когорту» придумывает запоминающиеся cohort code и researcher token.'],
      ['research.teacher.help.roleResearcher', 'Исследователь / ассистент — получает cohort code и researcher token (но НЕ мастер-ключ). Достаточно для просмотра агрегатов.'],
      ['research.teacher.help.roleStudent',    'Студент — получает только cohort code (общий идентификатор группы). Анонимен, опт-инит research mode в приложении.'],
    ]);

    body += section('research.teacher.help.workflowHeader', 'Процесс создания когорты', [
      ['research.teacher.help.step1', '1. Оператор задаёт RESEARCH_ADMIN_TOKEN в окружении (локально .env, на Railway → Variables) и перезапускает сервер.'],
      ['research.teacher.help.step2', '2. Учитель открывает teacher.html → «＋ Создать новую когорту». Вставляет мастер-ключ. Придумывает cohort code (4–16, A-Z 0-9 -) и researcher token (≥16 символов или 🎲).'],
      ['research.teacher.help.step3', '3. При успехе поля входа автозаполняются — учитель сразу нажимает «Войти» и попадает в дашборд.'],
      ['research.teacher.help.step4', '4. Учитель ЗАПИСЫВАЕТ cohort code и researcher token. Восстановления нет.'],
      ['research.teacher.help.step5', '5. Учитель раздаёт студентам ТОЛЬКО cohort code. Researcher token и мастер-ключ — не для студентов.'],
    ]);

    body += section('research.teacher.help.securityHeader', 'Безопасность мастер-ключа', [
      ['research.teacher.help.sec1', 'Мастер-ключ задаёт оператор. Учитель должен его получить; студентам он не нужен.'],
      ['research.teacher.help.sec2', 'При компрометации оператор меняет ключ и перезапускает сервер — существующие когорты не пострадают.'],
      ['research.teacher.help.sec3', 'На рабочем сервере мастер-ключ — длинная случайная строка ≥32 символа. Локально — что угодно.'],
    ]);

    body += '<p style="margin:14px 0 0 0;font-size:11.5px;color:var(--theme-text-secondary,#666);">' +
      escapeHtml(T('research.teacher.help.docsFooter',
        'Полная инструкция — docs/RESEARCHER_GUIDE.md. CLI-альтернатива: scripts/research/create_cohort.js.')) + '</p>';
    body += '</div>';

    v3ConfirmModal({
      title: T('research.teacher.help.title', '🎓 Как работает teacher dashboard'),
      body,
      isHtml: true,
      okText: T('research.btn.close', 'Закрыть'),
      cancelText: '',
    }).catch(() => {});
  }

  // ── expose ─────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.LinguistProResearchUI = { open, openConsent, openJoinCohort, openTransparency, openWithdraw, openOutcome, uploadNow, openQuiz, openGraph, openTeacherDashboard, openTeacherHelp };
  }
})();
