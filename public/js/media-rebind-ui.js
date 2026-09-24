// «Привязать медиа» у сохранённого материала (ведущий путь 2.4, владелец, 2026-09-24).
// Карточка, сохранённая без видео, получает привязку к транскрипту бесплатно: строки выравниваются
// по репликам (MediaRebindCore), человек видит «▶ получат K из N строк» и подтверждает. Пишется
// только запись привязки; строки карточки, статусы слов и журнал повторений не меняются.
(function () {
  'use strict';
  const words = {
    ru: { title: 'Видео не привязано', help: 'Карточка сохранена без видео. Её строки можно привязать к транскрипту бесплатно: сами строки не изменятся.',
      find: 'Привязать медиа', finding: 'Ищем транскрипт этой карточки…', preview: '▶ получат {k} из {n} строк · {file}',
      rebuild: 'Меньше 80% строк нашли свои реплики. Чтобы ▶ были у всех, пересоберите таблицу по сегментам через «Собрать учебный материал» — это платно и со сметой.',
      apply: 'Привязать', cancel: 'Отмена', applying: 'Привязываем…', changed: 'Карточка изменилась после предпросмотра. Проверьте новый результат.',
      done: 'Готово: ▶ у {m} из {n} строк.', NO_MATCH: 'Транскрипт этой карточки на устройстве не найден.',
      AMBIGUOUS: 'Карточке одинаково подходят два транскрипта. Автоматически выбирать не будем.', failed: 'Привязать не удалось: {code}' },
    en: { title: 'Video not linked', help: 'This card was saved without its video. Its rows can be linked to the transcript for free; the rows themselves stay unchanged.',
      find: 'Link media', finding: 'Looking for this card’s transcript…', preview: '▶ for {k} of {n} rows · {file}',
      rebuild: 'Under 80% of rows found their cues. For ▶ on every row, rebuild the table by segments with “Build the study material” — paid, with an estimate.',
      apply: 'Link', cancel: 'Cancel', applying: 'Linking…', changed: 'The card changed after the preview. Check the new result.',
      done: 'Done: ▶ on {m} of {n} rows.', NO_MATCH: 'This card’s transcript was not found on this device.',
      AMBIGUOUS: 'Two transcripts fit this card equally well. It will not be chosen automatically.', failed: 'Linking failed: {code}' },
    he: { title: 'הסרטון לא מקושר', help: 'הכרטיס נשמר בלי הסרטון. אפשר לקשר את השורות שלו לתמלול בחינם; השורות עצמן לא ישתנו.',
      find: 'קישור מדיה', finding: 'מחפשים את התמלול של הכרטיס…', preview: '▶ ל־{k} מתוך {n} שורות · {file}',
      rebuild: 'פחות מ־80% מהשורות מצאו את המשפטים שלהן. כדי שלכל שורה יהיה ▶, בנו מחדש את הטבלה לפי מקטעים דרך «בניית חומר הלימוד» — בתשלום, עם הערכת עלות.',
      apply: 'קישור', cancel: 'ביטול', applying: 'מקשרים…', changed: 'הכרטיס השתנה אחרי התצוגה המקדימה. בדקו את התוצאה החדשה.',
      done: 'הושלם: ▶ ב־{m} מתוך {n} שורות.', NO_MATCH: 'התמלול של הכרטיס לא נמצא במכשיר.',
      AMBIGUOUS: 'שני תמלולים מתאימים לכרטיס באותה מידה. לא נבחר אוטומטית.', failed: 'הקישור נכשל: {code}' },
  };
  const t = (key, values) => String(((words[document.documentElement.lang] || words.ru)[key]) || key)
    .replace(/\{(\w+)\}/g, (m, k) => (values && values[k] != null ? String(values[k]) : m));

  async function db() { return typeof window.ensureLocalDB === 'function' ? window.ensureLocalDB() : window.__localDB; }
  function repo() { return window.StudioMediaPackage.browserRepository(); }

  // Столько ▶, сколько увидит человек: та же мера, что рисует кнопки.
  async function playableCount(textId) {
    const ctx = await window.StudyVideoSourceUI.context(textId);
    const n = Array.isArray(ctx.rows) ? ctx.rows.length : 0;
    return { playable: ctx.audio ? window.MediaHost.replayCoverage(ctx.audio, n).playable_rows : 0, total: n };
  }

  async function plan(textId) {
    const ldb = await db();
    const rows = (await ldb.getSentences(String(textId))).map((r) => r.he_plain || r.he || '');
    const candidates = [];
    for (const ws of await repo().listWorkspaces({ limit: 50 })) {
      if (!ws.current_revision_id) continue;
      const revision = await repo().getRevision(ws.current_revision_id);
      if (!revision) continue;
      candidates.push({ ws, revision, plan: window.MediaRebindCore.planRebind(rows, revision) });
    }
    const chosen = window.MediaRebindCore.chooseCandidate(candidates);
    return { rows, ...chosen };
  }

  async function apply(textId, previewed) {
    const fresh = await plan(textId);
    if (!fresh.candidate || JSON.stringify(fresh.candidate.plan.mapping) !== JSON.stringify(previewed.plan.mapping)) {
      return { changed: true, fresh };
    }
    const { ws, revision } = fresh.candidate;
    await repo().bindText({ text_id: String(textId), package_id: ws.package_id, track_id: revision.track_id,
      revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256, mapping: fresh.candidate.plan.mapping });
    try { if (typeof window.v3LibraryRefresh === 'function') window.v3LibraryRefresh(); } catch (_) {}
    return { changed: false, count: await playableCount(textId) };
  }

  function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }

  async function mount(container, textId) {
    if (!container || !textId || !window.MediaRebindCore || !window.StudioMediaPackage || !window.StudyVideoSourceUI) return;
    let count;
    try { count = await playableCount(textId); } catch (_) { return; }
    if (count.playable > 0 || !count.total) return;
    const box = el('section', null, 'p4-rebind'); box.setAttribute('aria-live', 'polite');
    box.append(el('h5', t('title')), el('p', t('help')));
    const status = el('p', '', 'p2-portable-status'); status.setAttribute('role', 'status');
    const actions = el('div', null, 'p4-material-actions');
    const find = el('button', t('find')); find.type = 'button';
    actions.append(find); box.append(actions, status); container.append(box);
    find.onclick = async () => {
      find.disabled = true; status.textContent = t('finding');
      try {
        const result = await plan(textId);
        if (!result.candidate) { status.textContent = t(result.reason); find.disabled = false; return; }
        showPreview(result);
      } catch (e) { status.textContent = t('failed', { code: e && (e.code || e.message) || 'ERROR' }); find.disabled = false; }
    };
    function showPreview(result) {
      const c = result.candidate;
      const file = c.ws.original_name || c.ws.package_id;
      status.textContent = t('preview', { k: c.plan.bound, n: c.plan.total, file });
      actions.replaceChildren();
      if (c.plan.needsRebuild) box.insertBefore(el('p', t('rebuild'), 'lmt-quality-note'), actions);
      const go = el('button', t('apply')); go.type = 'button'; go.className = 'btn-primary';
      const cancel = el('button', t('cancel')); cancel.type = 'button';
      actions.append(go, cancel);
      cancel.onclick = () => { actions.replaceChildren(find); find.disabled = false; status.textContent = ''; };
      go.onclick = async () => {
        go.disabled = true; status.textContent = t('applying');
        try {
          const out = await apply(textId, c);
          if (out.changed) { status.textContent = t('changed'); if (out.fresh.candidate) showPreview(out.fresh); return; }
          actions.replaceChildren();
          status.textContent = t('done', { m: out.count.playable, n: out.count.total });
        } catch (e) { status.textContent = t('failed', { code: e && (e.code || e.message) || 'ERROR' }); go.disabled = false; }
      };
    }
  }

  window.MediaRebindUI = { mount, plan, apply, playableCount };
})();
