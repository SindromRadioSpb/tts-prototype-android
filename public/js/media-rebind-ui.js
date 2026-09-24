// «Привязать медиа» у сохранённого материала (ведущий путь 2.4, владелец, 2026-09-24).
// Карточка, сохранённая без видео, получает привязку к транскрипту бесплатно: строки выравниваются
// по репликам (MediaRebindCore), человек видит «▶ получат K из N строк» и подтверждает. Пишется
// только запись привязки; строки карточки, статусы слов и журнал повторений не меняются.
(function () {
  'use strict';
  const words = {
    ru: { linkedTitle: 'Видео привязано', linkedHelp: 'Откройте карточку заново: плеер и кнопки ▶ появятся в Студии и в Зале.', searchingCards: 'Ищем сохранённые карточки этого видео…', cardsTitle: 'Карточки без видео', cardsHelp: 'К этому транскрипту подходит сохранённая карточка без привязки. Выберите её: строки не изменятся.', noCards: 'Подходящих сохранённых карточек без привязки не нашлось.', cardOffer: 'Привязать к «{title}» · ▶ у {k} из {n}', title: 'Видео не привязано', help: 'Карточка сохранена без видео. Её строки можно привязать к транскрипту бесплатно: сами строки не изменятся.',
      find: 'Привязать медиа', finding: 'Ищем транскрипт этой карточки…', preview: '▶ получат {k} из {n} строк · {file}',
      rebuild: 'Меньше 80% строк нашли свои реплики. Чтобы ▶ были у всех, пересоберите таблицу по сегментам через «Собрать учебный материал» — это платно и со сметой.',
      apply: 'Привязать', cancel: 'Отмена', applying: 'Привязываем…', changed: 'Карточка изменилась после предпросмотра. Проверьте новый результат.',
      done: 'Готово: ▶ у {m} из {n} строк.', NO_MATCH: 'Транскрипт этой карточки на устройстве не найден.',
      AMBIGUOUS: 'Карточке одинаково подходят два транскрипта. Автоматически выбирать не будем.', failed: 'Привязать не удалось: {code}' },
    en: { linkedTitle: 'Video linked', linkedHelp: 'Open the card again: the player and ▶ buttons appear in the Studio and the Room.', searchingCards: 'Looking for saved cards of this video…', cardsTitle: 'Cards without video', cardsHelp: 'A saved card without a link fits this transcript. Choose it; its rows stay unchanged.', noCards: 'No matching saved cards without a link were found.', cardOffer: 'Link to “{title}” · ▶ on {k} of {n}', title: 'Video not linked', help: 'This card was saved without its video. Its rows can be linked to the transcript for free; the rows themselves stay unchanged.',
      find: 'Link media', finding: 'Looking for this card’s transcript…', preview: '▶ for {k} of {n} rows · {file}',
      rebuild: 'Under 80% of rows found their cues. For ▶ on every row, rebuild the table by segments with “Build the study material” — paid, with an estimate.',
      apply: 'Link', cancel: 'Cancel', applying: 'Linking…', changed: 'The card changed after the preview. Check the new result.',
      done: 'Done: ▶ on {m} of {n} rows.', NO_MATCH: 'This card’s transcript was not found on this device.',
      AMBIGUOUS: 'Two transcripts fit this card equally well. It will not be chosen automatically.', failed: 'Linking failed: {code}' },
    he: { linkedTitle: 'הסרטון מקושר', linkedHelp: 'פתחו את הכרטיס שוב: הנגן וכפתורי ▶ יופיעו בסטודיו ובאולם הקריאה.', searchingCards: 'מחפשים כרטיסים שמורים של הסרטון…', cardsTitle: 'כרטיסים בלי סרטון', cardsHelp: 'כרטיס שמור בלי קישור מתאים לתמלול הזה. בחרו בו; השורות שלו לא ישתנו.', noCards: 'לא נמצאו כרטיסים שמורים מתאימים בלי קישור.', cardOffer: 'קישור אל „{title}” · ▶ ב־{k} מתוך {n}', title: 'הסרטון לא מקושר', help: 'הכרטיס נשמר בלי הסרטון. אפשר לקשר את השורות שלו לתמלול בחינם; השורות עצמן לא ישתנו.',
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

  async function mount(container, textId, opts) {
    if (!container || !textId || !window.MediaRebindCore || !window.StudioMediaPackage || !window.StudyVideoSourceUI) return;
    let count;
    try { count = await playableCount(textId); } catch (_) { return; }
    if (count.playable > 0 || !count.total) return;
    const box = el('section', null, 'p4-rebind'); box.setAttribute('aria-live', 'polite');
    const heading = el('h5', t('title')), help = el('p', t('help'));
    box.append(heading, help);
    const status = el('p', '', 'p2-portable-status'); status.setAttribute('role', 'status');
    const actions = el('div', null, 'p4-material-actions');
    const find = el('button', t('find')); find.type = 'button';
    actions.append(find); box.append(actions, status); container.append(box);
    if (opts && opts.auto) setTimeout(() => find.click(), 0);
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
          heading.textContent = t('linkedTitle'); help.textContent = t('linkedHelp');
          status.textContent = t('done', { m: out.count.playable, n: out.count.total });
        } catch (e) { status.textContent = t('failed', { code: e && (e.code || e.message) || 'ERROR' }); go.disabled = false; }
      };
    }
  }

  // Со стороны видео: какие сохранённые карточки без привязки подходят к этому транскрипту.
  // Кандидаты: не в архиве, созданы не раньше импорта видео, текст начинается теми же словами.
  async function cardsForPackage(packageId) {
    const ws = (await repo().listWorkspaces({ limit: 50 })).find((w) => String(w.package_id) === String(packageId));
    const revision = ws && ws.current_revision_id ? await repo().getRevision(ws.current_revision_id) : null;
    if (!revision) return [];
    const ldb = await db();
    const since = ws.created_at ? String(ws.created_at).slice(0, 10) : '0000';
    const texts = await ldb.dbQuery(`SELECT id,title,source_text FROM texts t WHERE COALESCE(is_archived,0)=0
      AND created_at >= ? AND NOT EXISTS (SELECT 1 FROM studio_text_media_bindings b WHERE b.text_id=t.id)
      ORDER BY updated_at DESC LIMIT 200`, [since]);
    const out = [];
    for (const text of texts) {
      if (!window.MediaRebindCore.sharesOpening(text.source_text, revision.segments)) continue;
      const rows = (await ldb.getSentences(String(text.id))).map((r) => r.he_plain || r.he || '');
      const p = window.MediaRebindCore.planRebind(rows, revision);
      if (p.bound > 0) out.push({ text_id: String(text.id), title: text.title || '', bound: p.bound, total: p.total });
    }
    return out.sort((a, b) => b.bound - a.bound);
  }

  async function mountForPackage(container, packageId) {
    if (!container || !packageId || !window.MediaRebindCore || !window.StudioMediaPackage) return;
    const box = el('section', null, 'p4-rebind'); box.setAttribute('aria-live', 'polite');
    const status = el('p', t('searchingCards'), 'p2-portable-status'); status.setAttribute('role', 'status');
    box.append(el('h5', t('cardsTitle')), status); container.append(box);
    let cards = [];
    try { cards = await cardsForPackage(packageId); } catch (e) { status.textContent = t('failed', { code: e && (e.code || e.message) || 'ERROR' }); return; }
    if (!cards.length) { status.textContent = t('noCards'); return; }
    status.textContent = t('cardsHelp');
    const list = el('div', null, 'p4-material-actions');
    for (const card of cards) {
      const b = el('button', t('cardOffer', { title: card.title, k: card.bound, n: card.total })); b.type = 'button';
      b.onclick = () => { box.replaceChildren(); mount(box, card.text_id, { auto: true }); };
      list.append(b);
    }
    box.append(list);
  }

  // Студия: открытая сохранённая карточка без ▶ сама предлагает привязку.
  async function mountInto(host, textId) {
    if (!host) return;
    // Поздний повторный проход той же карточки не сбрасывает начатый человеком поиск.
    if (host.dataset.textId === String(textId) && host.childElementCount) return;
    host.replaceChildren(); host.hidden = true; host.dataset.textId = String(textId);
    await mount(host, textId);
    host.hidden = !host.childElementCount;
  }

  window.MediaRebindUI = { mount, mountInto, mountForPackage, cardsForPackage, plan, apply, playableCount };
  // Новый источник в Студии — предложение прошлой карточки больше не о том, что на экране.
  document.addEventListener('studio:source-context-changed', () => {
    const host = document.getElementById('v3RebindHost');
    if (host) { host.replaceChildren(); host.hidden = true; delete host.dataset.textId; }
  });
})();
