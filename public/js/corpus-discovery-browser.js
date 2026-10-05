// Presentation-only helpers. No database, imports, learner state or telemetry.
(function (root) {
  'use strict';
  const MAX_BYTES = 128 * 1024, MAX_CACHE = 8;
  const cache = new Map();
  const copy = {
    ru: { read: 'Читать сейчас', explore: 'Исследовать каталог', passport: 'О материале', close: 'Закрыть', preview: 'Предпросмотр', previewLoading: 'Загружаем первые строки…', previewUnavailable: 'Предпросмотр недоступен. Полный текст можно открыть кнопкой «Читать».', metadata: 'Карточка каталога — учебная версия ещё не опубликована', available: 'Учебная версия доступна', source: 'Открыть оригинал', list: 'В список чтения', share: 'Поделиться поиском', shareHint: 'Запрос войдёт в ссылку. Личные заметки, теги и групповой поиск не публикуются.', link: 'Ссылка на поиск', search: 'Найти автора или произведение', find: 'Найти', readyReason: 'Есть учебная версия с переводом', catalogReason: 'Есть сведения в каталоге', periodUnknown: 'Период по источнику неизвестен', unchecked: 'Поле источника ещё не проверено', absent: 'Поле проверено: период не указан', sourcePeriod: 'Период произведения по источнику', appEra: 'Раздел приложения · вычислен по автору', groups: 'групп каталога', grouping: 'Группы объединены по идентификатору автора; соавторство сохранено.', length: 'Длина учебной версии', allLengths: 'Любая длина', short: 'До 20 строк', medium: '21–80 строк', long: 'Больше 80 строк', unknownLength: 'Длина неизвестна', coverage: 'Полнота перевода', unmeasured: 'Не измерена для всего произведения', partial: 'Переведена часть строк', full: 'Переведены все строки учебной версии', review: 'Проверка перевода', machine: 'Машинный перевод', human: 'Проверено человеком', audio: 'Аудио', none: 'Не заявлено', provenance: 'Источник и версия', curated: 'Учебные подборки с озвучкой', coauthors: 'Варианты авторства в этой группе' },
    en: { read: 'Read now', explore: 'Explore catalog', passport: 'Material details', close: 'Close', preview: 'Preview', previewLoading: 'Loading first lines…', previewUnavailable: 'Preview unavailable. Use Read to open the full text.', metadata: 'Catalog record — study edition not published yet', available: 'Study edition available', source: 'Open original', list: 'Add to reading list', share: 'Share search', shareHint: 'The query will be included in the link. Personal notes, tags and group searches cannot be shared.', link: 'Search link', search: 'Find an author or work', find: 'Find', readyReason: 'Study edition with translation', catalogReason: 'Catalog information available', periodUnknown: 'Source period unknown', unchecked: 'Source field not checked yet', absent: 'Checked: source period absent', sourcePeriod: 'Work period from source', appEra: 'App section · inferred from author', groups: 'catalog groups', grouping: 'Groups use author IDs; coauthorship is preserved.', length: 'Study edition length', allLengths: 'Any length', short: 'Up to 20 rows', medium: '21–80 rows', long: 'Over 80 rows', unknownLength: 'Length unknown', coverage: 'Translation coverage', unmeasured: 'Not measured for the whole work', partial: 'Some rows translated', full: 'All study edition rows translated', review: 'Translation review', machine: 'Machine translation', human: 'Human reviewed', audio: 'Audio', none: 'Not declared', provenance: 'Source and version', curated: 'Study selections with audio', coauthors: 'Authorship variants in this group' },
    he: { read: 'לקרוא עכשיו', explore: 'לחקור את הקטלוג', passport: 'פרטי היצירה', close: 'סגירה', preview: 'תצוגה מקדימה', previewLoading: 'טוענים שורות ראשונות…', previewUnavailable: 'התצוגה המקדימה אינה זמינה. אפשר לפתוח את הטקסט המלא בכפתור הקריאה.', metadata: 'רשומת קטלוג — גרסת לימוד טרם פורסמה', available: 'גרסת לימוד זמינה', source: 'פתיחת המקור', list: 'הוספה לרשימת קריאה', share: 'שיתוף החיפוש', shareHint: 'השאילתה תיכלל בקישור. הערות, תגיות וחיפוש קבוצתי אינם ניתנים לשיתוף.', link: 'קישור לחיפוש', search: 'חיפוש מחבר או יצירה', find: 'חיפוש', readyReason: 'גרסת לימוד עם תרגום', catalogReason: 'פרטים זמינים בקטלוג', periodUnknown: 'התקופה לפי המקור אינה ידועה', unchecked: 'שדה המקור טרם נבדק', absent: 'נבדק: אין תקופה במקור', sourcePeriod: 'תקופת היצירה לפי המקור', appEra: 'מדור באפליקציה · מוסק מהמחבר', groups: 'קבוצות קטלוג', grouping: 'הקבוצות מאוחדות לפי מזהה מחבר; מחברים שותפים נשמרים.', length: 'אורך גרסת הלימוד', allLengths: 'כל אורך', short: 'עד 20 שורות', medium: '21–80 שורות', long: 'מעל 80 שורות', unknownLength: 'אורך לא ידוע', coverage: 'שלמות התרגום', unmeasured: 'לא נמדדה לכל היצירה', partial: 'חלק מהשורות תורגמו', full: 'כל שורות גרסת הלימוד תורגמו', review: 'בדיקת התרגום', machine: 'תרגום מכונה', human: 'נבדק בידי אדם', audio: 'שמע', none: 'לא צוין', provenance: 'מקור וגרסה', curated: 'מבחרי לימוד עם שמע', coauthors: 'גרסאות שם המחבר בקבוצה זו' },
  };
  const extraCopy = {
    ru: { niqqud: 'Огласовка', transliteration: 'Транслитерация', unknown: 'Неизвестно', present: 'Заявлена, полнота не измерена', partial: 'Частично', full: 'Полностью', declared: 'По метаданным', textLocal: 'Текст на этом устройстве', yes: 'Есть', no: 'Ещё не открыт', offline: 'Полная доступность без сети', machineAssisted: 'Машинный перевод с участием редактора', provider: 'Провайдер перевода', model: 'Модель', edition: 'Версия каталога', evidence: 'Проверенный снимок источника' },
    en: { niqqud: 'Vocalization', transliteration: 'Transliteration', unknown: 'Unknown', present: 'Declared, completeness not measured', partial: 'Partial', full: 'Complete', declared: 'From metadata', textLocal: 'Text on this device', yes: 'Available', no: 'Not opened yet', offline: 'Complete offline availability', machineAssisted: 'Machine translation with editorial involvement', provider: 'Translation provider', model: 'Model', edition: 'Catalog version', evidence: 'Checked source snapshot' },
    he: { niqqud: 'ניקוד', transliteration: 'תעתיק', unknown: 'לא ידוע', present: 'צוין, השלמות לא נמדדה', partial: 'חלקי', full: 'מלא', declared: 'לפי המטא־נתונים', textLocal: 'הטקסט במכשיר הזה', yes: 'זמין', no: 'טרם נפתח', offline: 'זמינות מלאה ללא רשת', machineAssisted: 'תרגום מכונה במעורבות עורך', provider: 'ספק התרגום', model: 'מודל', edition: 'גרסת הקטלוג', evidence: 'צילום מקור שנבדק' },
  };
  const editionCopy = {
    ru: { sourceVersion: 'Версия оригинала', sourceEdition: 'Издание источника', revisionDate: 'Дата учебной редакции', contributors: 'Переводчик источника', rights: 'Права по данным источника', publishedScope: 'Показаны данные опубликованной учебной редакции. Версия на устройстве может отличаться.', machineLimitations: 'Перевод, добавленная огласовка и транслитерации подготовлены и проверены автоматически. Экспертная филологическая проверка не заявлена; пояснения и неоднозначные чтения сохранены.', sourceRightsLimit: 'Обозначение прав передано из источника; отдельная юридическая проверка не заявлена.', deviceEdition: 'Редакция на устройстве', earlierEdition: 'Сохранена прежняя редакция', publishedEdition: 'Опубликованная учебная редакция', newEditionAvailable: 'Доступна новая учебная редакция', openSeparateEdition: 'Открыть новую редакцию отдельно', preservedLearning: 'Прежние заметки, закладки и прогресс сохранены в прежней копии.', rows: 'строк' },
    en: { sourceVersion: 'Original version', sourceEdition: 'Source edition', revisionDate: 'Study revision date', contributors: 'Source translator', rights: 'Source-reported rights', publishedScope: 'These facts describe the published study edition. The device edition may differ.', machineLimitations: 'Translation, added vocalization and transliterations were prepared and reviewed automatically. Expert philological review is not claimed; notes and ambiguous readings are retained.', sourceRightsLimit: 'Rights labels are reported by the source; independent legal clearance is not claimed.', deviceEdition: 'Device edition', earlierEdition: 'Earlier edition retained', publishedEdition: 'Published study edition', newEditionAvailable: 'A new study edition is available', openSeparateEdition: 'Open the new edition separately', preservedLearning: 'Earlier notes, bookmarks and progress remain in the earlier copy.', rows: 'rows' },
    he: { sourceVersion: 'גרסת המקור', sourceEdition: 'מהדורת המקור', revisionDate: 'תאריך גרסת הלימוד', contributors: 'מתרגם המקור', rights: 'זכויות לפי המקור', publishedScope: 'הנתונים מתארים את גרסת הלימוד שפורסמה. הגרסה במכשיר עשויה להיות שונה.', machineLimitations: 'התרגום, הניקוד שנוסף והתעתיקים הוכנו ונבדקו אוטומטית. לא נטענת בדיקה פילולוגית מקצועית; הערות וקריאות לא ודאיות נשמרו.', sourceRightsLimit: 'סימון הזכויות נמסר לפי המקור; לא נטענת בדיקה משפטית עצמאית.', deviceEdition: 'הגרסה במכשיר', earlierEdition: 'הגרסה הקודמת נשמרה', publishedEdition: 'גרסת הלימוד שפורסמה', newEditionAvailable: 'זמינה גרסת לימוד חדשה', openSeparateEdition: 'פתיחת הגרסה החדשה בנפרד', preservedLearning: 'הערות, סימניות והתקדמות קודמות נשמרות בעותק הקודם.', rows: 'שורות' },
  };
  function label(key) { const locale = root.appGetLocale?.() || 'ru'; return (copy[locale] || copy.ru)[key] || (extraCopy[locale] || extraCopy.ru)[key] || (editionCopy[locale] || editionCopy.ru)[key] || key; }
  function node(tag, text, cls) { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
  function lengthPass(card, value) {
    if (!value) return true;
    const n = Number(card?.segments || card?.rows_count || 0);
    return value === 'unknown' ? n <= 0 : n > 0 && (value === 'short' ? n <= 20 : value === 'medium' ? n > 20 && n <= 80 : n > 80);
  }
  async function loadRows(card, { signal, fetchImpl = root.fetch.bind(root) } = {}) {
    const file = card?.preview_file || card?.file;
    if (!/^works\/[0-9]+\.json$/.test(file || '') && !root.BenYehudaLearningEdition?.PREVIEW.test(file || '')) throw new Error('preview path');
    const version = card.catalog_version || 7;
    const key = file + ':' + version;
    if (cache.has(key)) return cache.get(key);
    // A separate range request avoids downloading a large work just to preview it.
    // The SW explicitly leaves this request to the browser, without cloning or caching.
    const response = await fetchImpl('/data/benyehuda/' + file + '?v=' + version + '&preview=bounded-v1', { cache: 'no-store', headers: { Range: 'bytes=0-' + (MAX_BYTES - 1) }, signal, referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('preview fetch');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('preview budget'); }
    const rangeTotal = /\/([0-9]+)$/.exec(response.headers.get('content-range') || '');
    if (rangeTotal && Number(rangeTotal[1]) > MAX_BYTES) { await response.body?.cancel(); throw new Error('preview budget'); }
    if (!response.body?.getReader) { await response.body?.cancel(); throw new Error('preview stream unavailable'); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('preview budget'); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    const bundle = card.preview_file ? await root.BenYehudaLearningEdition.verifyBytes(bytes, card.preview_sha256) : JSON.parse(new TextDecoder().decode(bytes));
    const rows = (bundle?.library?.texts || []).flatMap(text => Array.isArray(text.rows) ? text.rows : []);
    if (!Array.isArray(rows)) throw new Error('preview format');
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, rows); return rows;
  }
  function modal(title, trigger) {
    const dialog = node('dialog', '', 'corpus-material-dialog');
    const heading = node('h2', title); heading.id = 'corpusMaterialDialogTitle'; heading.dir = 'auto'; dialog.setAttribute('aria-labelledby', heading.id);
    const close = node('button', label('close'), 'corpus-passport-close'); close.type = 'button';
    dialog.append(close, heading); document.body.append(dialog);
    const controller = new AbortController();
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    const finish = () => { controller.abort(); dialog.remove(); if (trigger?.isConnected) trigger.focus(); };
    close.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', finish, { once: true });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    dialog.showModal(); return { dialog, controller };
  }
  function sourceLink(card) {
    const id = String(card?.id || ''); if (!/^[0-9]+$/.test(id)) return null;
    const a = node('a', label('source')); a.href = 'https://benyehuda.org/read/' + id; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function addFact(dl, name, value) { dl.append(node('dt', name), node('dd', value)); }
  function passport(card, ready, { trigger, read, addToList, eraLabel, localText = null } = {}) {
    const { dialog, controller } = modal(card.title || '—', trigger);
    const ruTitle = card.title_ru_verified === true ? card.title_ru : '';
    if (ruTitle) dialog.append(node('p', ruTitle));
    dialog.append(node('p', card.author || '', 'corpus-passport-author'));
    dialog.append(node('p', label(ready ? 'available' : 'metadata'), 'corpus-passport-status'));
    const facts = node('dl', '', 'corpus-passport-facts');
    const material = root.CorpusDiscovery.describeMaterial(card, { published: ready, catalogRevision: card.catalog_version || 7, localText });
    const sourcePeriod = material.sourcePeriod;
    addFact(facts, label('sourcePeriod'), sourcePeriod.status === 'known' ? sourcePeriod.label : label('periodUnknown'));
    if (sourcePeriod.status !== 'known') addFact(facts, label('provenance'), [label(sourcePeriod.status === 'checked-absent' ? 'absent' : 'unchecked'), sourcePeriod.snapshot].filter(Boolean).join(' · '));
    if (sourcePeriod.status === 'known') addFact(facts, label('provenance'), [sourcePeriod.sourceLabel, sourcePeriod.snapshot].filter(Boolean).join(' · '));
    if (card.era) addFact(facts, label('appEra'), eraLabel?.(card.era) || card.era);
    addFact(facts, label('length'), Number(card.segments) > 0 ? String(card.segments) : label('unknownLength'));
    const translation = material.coverage.translation;
    addFact(facts, label('coverage'), ['partial', 'full', 'none'].includes(translation.status) ? label(translation.status) : label('unmeasured'));
    for (const key of ['niqqud', 'transliteration']) {
      const locale = root.appGetLocale?.() || 'ru', status = material.coverage[key].status;
      addFact(facts, label(key), (extraCopy[locale] || extraCopy.ru)[status] || label(status));
    }
    addFact(facts, label('review'), card.review_status === 'human_proofread' ? label('human') : card.review_status === 'machine_assisted' ? label('machineAssisted') : card.review_status === 'machine' ? label('machine') : label('none'));
    addFact(facts, label('audio'), card.audio_status && card.audio_status !== 'none' ? card.audio_status : label('none'));
    addFact(facts, label('textLocal'), label(localText === true ? 'yes' : localText === false ? 'no' : 'unknown'));
    addFact(facts, label('offline'), label('unknown'));
    if (material.provenance.provider) addFact(facts, label('provider'), material.provenance.provider);
    if (material.provenance.model) addFact(facts, label('model'), material.provenance.model);
    addFact(facts, label('edition'), String(card.catalog_version || 7));
    if (card.public_learning) {
      const info = card.public_learning;
      for (const [key, value] of [['sourceVersion', info.source_version], ['sourceEdition', info.source_edition], ['revisionDate', info.revision_date], ['contributors', info.contributors], ['rights', info.source_reported_rights]]) {
        if (value) addFact(facts, label(key), value);
      }
      dialog.append(node('p', label('publishedScope'), 'corpus-passport-status'));
      dialog.append(node('p', label('machineLimitations')));
      dialog.append(node('p', label('sourceRightsLimit')));
    }
    dialog.append(facts);
    if (sourcePeriod.sourceUrl) { const a = node('a', label('evidence')); a.href = sourcePeriod.sourceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; dialog.append(a); }
    const actions = node('div', '', 'corpus-passport-actions');
    if (ready && read) { const b = node('button', label('read')); b.type = 'button'; b.addEventListener('click', () => { dialog.close(); read(); }); actions.append(b); }
    const source = sourceLink(card); if (source) actions.append(source);
    if (addToList) { const b = node('button', label('list')); b.type = 'button'; b.addEventListener('click', () => { dialog.close(); addToList(); }); actions.append(b); }
    dialog.append(actions);
    if (ready && card.file) {
      const previewButton = node('button', label('preview')); previewButton.type = 'button';
      const preview = node('div', '', 'corpus-passport-preview'); preview.setAttribute('aria-live', 'polite');
      previewButton.addEventListener('click', async () => {
        previewButton.disabled = true; preview.textContent = label('previewLoading');
        try {
          const rows = await loadRows(card, { signal: controller.signal }); if (!dialog.isConnected) return;
          preview.replaceChildren();
          for (const row of rows.slice(0, 4)) {
            const line = node('div', '', 'corpus-preview-line');
            const he = node('p', row.hebrew_niqqud || row.hebrew_plain || ''); he.lang = 'he'; he.dir = 'rtl'; line.append(he);
            if (row.russian) { const ru = node('p', row.russian); ru.lang = 'ru'; ru.dir = 'ltr'; line.append(ru); }
            preview.append(line);
          }
          if (!rows.length) preview.textContent = label('previewUnavailable');
        } catch (_) { if (!controller.signal.aborted) preview.textContent = label('previewUnavailable'); }
      });
      dialog.append(previewButton, preview);
    }
    return dialog;
  }
  function shareSearch(url, trigger) {
    if (!url) return;
    const { dialog } = modal(label('share'), trigger); dialog.append(node('p', label('shareHint')));
    const field = node('input'); field.type = 'url'; field.readOnly = true; field.value = url; field.setAttribute('aria-label', label('link')); dialog.append(field); field.focus(); field.select();
  }
  root.CorpusDiscoveryBrowser = { label, lengthPass, loadRows, passport, shareSearch, MAX_BYTES, MAX_CACHE };
})(typeof window !== 'undefined' ? window : globalThis);
