# Эпик 4 — Замкнуть петлю удержания в Зале (моат LingQ) · P1 / L · R2/R5

**Дата:** 2026-06-26 (обновл. 2026-06-28) · **Статус:** 🟢 Фазы 4.1+4.2+**4.3a SHIPPED+PROD** (v3.11.22) + **4.3a+ премиум-словарь** (v3.11.23, A+B+C+D — см. `BRR_EPIC4_3A_STUDY_LIST_PREMIUM_2026_06_27.md`); 4.3b (cloze recall) — next.
**Родитель:** `docs/planning/BRR_UX_AUDIT_2026_06_25.md` §ЭПИК 4 + аудит петли `docs/research/retention-loop-audit/2026-06-26/FINDINGS.md`. Память [[project_brr_ux_audit]] · [[project_srs_strategy]] · [[feedback_no_override_grounded_reading]]. Роли R2/R5 (вед.) · R4 · R3 · R8 · R11.

## Почему (из аудита петли)
Статус слова **полностью выводится из SRS/Anki-ревью** (`getLearningStateOverlay`), ручного «знаю» нет. Anki read-back работает ТОЛЬКО локально (AnkiConnect/127.0.0.1) → для удалённого прод-читателя статус застревает на `new` (синий), «синяя стена» не сходится. Движок i+1 (`corpus-vocab.js`) + раскраска (`decorateWords`) УЖЕ построены — заперт только ВХОД (статус). Keystone = ручной one-tap статус, **отдельно** от SRS/Anki (не плодить карты).

## Одобренные решения владельца (2026-06-26)
1. **Приоритет = ручной побеждает.** Явный выбор юзера = авторитет для раскраски чтения. SRS/Anki — отдельная ось (расписание ревью), видна в lifecycle-бейдже. R11-честно: разные оси, не молчаливая перезапись.
2. **Словарь = уровни LingQ:** `new(0) · 1 · 2 · 3 · 4 · known · ignore`. Уровни 1–4 = растущая знакомость; known = знаю; ignore = имена/числа/тривиальное (исключить из i+1, нейтральный цвет).
3. **UI = карточка + in-text.** Селектор в морфокарточке (one-tap) + быстрый статус прямо в тексте.

## Архитектура (по коду)
- Новая OPFS-таблица **`word_status(lemma_key PK, status, updated_at)`** (миграция 057) — отдельно от notes/srs/Anki. Ключ = канонический `NotesAutoGen.lemmaKey` (`pid:<id>` / `<norm-lemma>#<pos>`), байт-идентичен инлайн-ключу в `getKnownWordStates` (`local-db.js:2101`).
- DB API: `setWordStatus(lemmaKey, status)` (upsert; `status:''`/null → delete = сброс в new) · `getAllWordStatuses()` → `{lemmaKey: status}`.
- `getKnownWordStates()` расширяется: построить note-derived map (как сейчас) → наложить ручные статусы **manual-wins**, ВКЛЮЧАЯ lemmaKey без заметки (отметил «знаю» без заметки/карты — паттерн LingQ). Возвращает обогащённый словарь значений (`l1..l4/known/ignore/learning/known/weak/stale/new`).
- Downstream-маппинг: `decorateWords` (reader-morph) + чипы 3a → новые классы `.rm-w-l1..l4` (жёлтый градиент: 1 ярче → 4 бледнее), `known` → без тинта (стена сходится к прозрачному), `ignore` → нейтрал. `coverageForWork` (corpus-vocab): known→known, l1–l4→learning, ignore→исключить из frontier, new→unknown-gap.
- Recompute-триггеры как у word-status (инвалидировать `readerWordStates` + applyDecorations) на set.

## Фазы
- **4.1 (keystone, в работе):** миграция 057 + DB API + getKnownWordStates manual-overlay + **card-селектор уровня** + раскраска уровней (текст + чипы) + i+1 учитывает ignore/levels. Гейты + @380px свет+тёмная. → статус становится реальным для ВСЕХ; чипы 3a + раскраска + i+1 осмыслены.
- **4.2 in-text быстрый статус — ✅ SHIPPED (v3.11.10):** long-press по слову → компактный floating popover уровней (new/1-4/known/ignore), без открытия карточки; pointerdown+timer(480ms), движение/скролл отменяет, long-press подавляет следующий click (не коллизит с tap=карта/аудио/reveal); resolve→lemmaKey→setWordStatus→мгновенная перекраска; не определилось → фолбэк на карточку (не тупик); Escape/скролл/тап-вне закрывают. CSS `.rm-statpop`, гейт +long-press-ассерт, @380px свет+тёмная. (Дискаверабельность long-press — отметить в Эпике 8 onboarding.)
- **4.3 recall-loop + frontier-study (RECON одобрен 2026-06-26):** owner-развилки — **recall = in-session cloze из `readerRows`** (НЕ kmap-граф-квиз: тот root-centric + требует kmap-индекс; cloze reading-native, самодостаточен, R2-сильнее) · **scope = frontier-study ПЕРВЫМ, потом recall**. `note_occurrences` текст НЕ хранит (ids+surface) → cross-text cloze требует тел работ (отложено); in-session по `readerRows` в памяти.
  - **4.3a frontier-study (next):** «📚 Учить» в панели подсказок → новый `ReaderMorph.collectNewWords(mount, statesMap, {topN})` (скан `.rm-w` → resolveCore → группа по lemmaKey → фильтр status∈{new/undefined} → ранг по частоте → top-N~8). library-ui рендерит лист niqqud+глосс+компактный статус-селектор → one-tap mark → перекраска. Self-contained (резолвер+getKnownWordStates+setWordStatus). i18n room.morph.study.*. Гейт + @380px.
  - **4.3b recall-loop:** in-session cloze — бланкуем сохранённое/учимое слово в РЕАЛЬНОМ предложении (readerRows) → узнавание (MC из честных ривалов) или ввод; верно→уровень↑, нет→↓ (manual статус, НЕ Anki-карта; Anki держит расписание). Детерминированный shuffle.

## Палитра — исследование конкурентов (2026-06-26) → решение
Сверка LingQ · LWT · Lute · Readlang. **Единый кросс-конкурентный стандарт:** текст «расходится» к чистому по мере изучения — это и есть мотивационный моат.
- **LingQ:** new=синий · LingQ-learning=жёлтый (уровни) · **known=БЕЗ подсветки (белый/чистый)**. Клик/«paging moves to known» массово.
- **LWT:** статусы 1–5 (unknown→well-known) + WKn + Ign; градиент, well-known/ignored — светлый/без подсветки.
- **Lute (эталон, документирован):** CSS `span.status1..5` (градиент) · `.status98`=ignored · `.status99`=well-known; пример из мануала — `span.status99 { background-color: none }` → **known БЕЗ заливки**; клавиши `1 2 3 4 5 w i`. Цвета кастомизируемы.
- **Readlang:** green=saved; пользователи просили градиент familiarity.
- **A11y:** цвет — не единственный канал (добавить второй: подсветка-vs-чистый уже несёт сигнал known≠new; + число уровня в селекторе).

**РЕШЕНИЕ (evidence-backed, LingQ-faithful — кросс-конкурентный стандарт):**
| статус | подсветка текста |
|---|---|
| new (не отмечено + не ревью) | синий (existing `.rm-w-new`) |
| l1 (только встретил) → l4 (почти знаю) | АМБЕР-градиент (l1 ярче → l4 бледнее) |
| learning (SRS-derived, без ручного уровня) | существующий оранж |
| **known** | **БЕЗ подсветки (прозрачный)** — стена сходится к чистому (меняет текущий зелёный) |
| ignore | без подсветки + слабый пунктир-underline (отличить «пропускаю» от «знаю» при инспекции) |
| weak/stale (SRS) | существующие |
A11y: known≠new кодируется присутствием-подсветки (не только цветом); уровень 1–4 — число в card-селекторе. Источники в `docs/research/retention-loop-audit/2026-06-26/` (раздел палитры).

## Инварианты
- Ручной стор **отдельно** от srs_cards (не создаёт Anki-карт). Anki=review остаётся (SRS_STRATEGY). Lifecycle-бейдж (расписание) и manual-статус (знание-чтения) — раздельные сигналы в карточке.
- R11: manual-wins для РАСКРАСКИ (ось знания-чтения); SRS/Anki-данные не затираются молча — показаны отдельно.
- Room-only (index.html/builder нетронуты, smoke:reader-parity). Миграция — клиентская OPFS (db:migrate-паттерн, массив MIGRATIONS). i18n ru/en/he. @380px свет+тёмная. WCAG: уровень = не только цвет (число/иконка-канал). Volume-тест.
- measure-before-code: палитра/жест проверяются скрином перед коммитом; merge в getKnownWordStates держать быстрым (один запрос + наложение map).

---

## 🟢 АКТУАЛИЗАЦИЯ 2026-06-27 (READ FIRST перед 4.3) — что изменилось и как это влияет на 4.3

**Прод: app+SW v3.11.22, HEAD `909fa2a`.** Все гейты зелёные. Фазы 4.1 (a+b) + 4.2 + **4.3a SHIPPED+PROD**. **4.3b (recall-loop cloze) — следующая, не начата.** После 4.2 в этой сессии отгружено много смежного — оно МЕНЯЕТ вход для 4.3:

### Отгружено 2026-06-27 (по порядку, всё PROD-verified)
- **Track-any-word T-a (v3.11.14 `d42dada`):** `decorateWords` красит ЛЮБОЕ engaged-слово. confident → lemma-key (дефолт `new`/синий); unconfident (служебное/неизвестное) → красится ТОЛЬКО при явной записи в states (manual-статус ИЛИ заметка), иначе plain. R11-прецедент: surface-статус не течёт на confident-гомограф.
- **T-b ручной перевод (v3.11.15 `ddb1ec8`):** карточка unknown → «＋ Добавить перевод» → редактируемая word_study-заметка (`meaning_source='user'`, синк Anki), бейдж «ваш»; `resolveWordLight` ре-сёрфит сохранённый перевод.
- **Кросс-колоночная окраска ktiv male/chaser (v3.11.16 `965f91f`):** `alignSurfaceNiqqud` — позиционный fallback (плене-слово получает огласовку); **`_statusKeyWord(card, niqqud, surface)`** — surface-ключ статуса деривируется из ОГЛАСОВКИ (одинакова для обеих колонок), не из плене-формы.
- **Служебные слова с function-link pid (v3.11.17 `3b2db33` + v3.11.18 `79c2f41`):** **`_statusPid(card, surface)`** зеркалит `PealimFunctionLinks` pid в save (resolveWordLight) И paint (decorateWords) → `גם`/`לא`→`pid:3304`/`pid:2943` теперь красятся; `await PealimFunctionLinks.ensureReady()` в decorateWords (lazy-map race).
- **Storable «new» (v3.11.19 `f41f07b`):** `setWordStatus("new")` ТЕПЕРЬ сохраняет (был no-op/DELETE) — неуверенные слова можно пометить «new»/фиолетовый; `_WS_VALUES`+=new (очищает только `''`); `onStatusSet`/`onStatPopSet` toggle по РЕАЛЬНОМУ статусу; «new»-дефолт-подсветка только у confident; `showStatusPopover` ключует через `_statusKeyWord`+`_statusPid`.
- **«new» НЕ читаемый (v3.11.20 `4718f2e`):** `corpus-vocab.KNOWN_STATES` БЕЗ `new` (новое=трекаю, но не знаю → не считать читаемым/frontier-known; иначе массовая разметка ломает i+1). FAMILIAR/niqqud-fade (другая ось) не тронут.
- **Continue-reading только канон (v3.11.21 `8306b57`):** `getContinueReading` фильтрует `json_extract(source_meta_json,'$.origin')='benyehuda-ingest'` → Студия-тексты не текут в «Корпус».

### ⚠ КЛЮЧЕВОЙ ИНВАРИАНТ для 4.3 (save-key == paint-key parity)
Статус слова СОХРАНЯЕТСЯ по `card.lemmaKey` (resolveWordLight) и КРАСИТСЯ по ключу `decorateWords`. Они ОБЯЗАНЫ совпадать. `resolveWordLight` делает обогащения, которых нет в голом `resolveCore`: **(1) огласовко-производный surface (`_statusKeyWord`), (2) function-link pid (`_statusPid`), (3) Dicta-контекст**. **Любая новая фича 4.3, которая читает/пишет статус слова (особенно `collectNewWords`), ОБЯЗАНА ключевать через `_statusKeyWord`+`_statusPid`, НЕ через голый `resolveCore`.lemmaKey** — иначе собранные слова не сойдутся с раскраской текста (это был #1 класс багов этой сессии). Память [[feedback_ktiv_surface_key_consistency]]. Рассмотреть экспорт хелпера `statusKeyForSpan(span)` из reader-morph, чтобы убрать дрейф между collectNewWords / decorateWords / showStatusPopover.

### Статус-модель СЕЙЧАС (вход для 4.3 готов)
- Стор: OPFS `word_status(lemma_key PK, status, updated_at)` (миграция 057). Значения: `new|l1|l2|l3|l4|known|ignore` — ВСЕ сохраняемые; `''`→delete.
- API (local-db): `setWordStatus(lk,st)` · `getWordStatus(lk)` · `getAllWordStatuses()` · `getKnownWordStates()` (note-derived + manual-overlay, manual-wins, канон-ключ).
- Раскраска: `.rm-w-{new,l1,l2,l3,l4,known,ignore}` (CSS-vars `--ws-*` + `-fill` в library.html). `decorateWords(#roomReaderTable, states, {color, fadeMode})`. `ReaderMorph` API: resolveCore · resolveWordLight · ensureEngine · decorateWords · attach (collectNewWords — НЕ существует, строить в 4.3a).
- Читаемость/frontier: `corpus-vocab.coverageForWork` (KNOWN_STATES без «new»; known/l1-4/learning/weak/stale/ignore считаются; new+undefined = unknown-gap = frontier-кандидаты).
- Аиды-панель (куда «📚 Учить»): `library-ui.js buildAidsPanel()` (≈стр.1072) — там уже toggle статуса + видимая легенда.

### 4.3a frontier-study — ✅ SHIPPED+PROD (v3.11.22, `909fa2a`, 2026-06-27)
1. **`ReaderMorph.collectNewWords(mount, statesMap, {topN=8})`** (НОВЫЙ, экспортирован): скан `.rm-w` (he-колонка, fallback niqqud — каждое слово 1 раз) → per-span resolveCore → ключ через **новый общий `statusKeyForCard(NA,card,niqqud,surface)`** → фильтр confident (exact|likely, content) + `status∈{new, undefined}` → ранг по частоте → top-N. Возврат `[{lemmaKey, surface, niqqud, gloss, root, pos, freq}]`. **Anti-drift:** `statusKeyForCard` = ЕДИНЫЙ кейер, на него переведены decorateWords/resolveWordLight/showStatusPopover (раньше ключ дублировался инлайн в 3 местах → риск дрейфа save≠paint).
2. **library-ui:** «📚 Учить» в `buildAidsPanel` → bottom-sheet `roomOpenStudyList` (niqqud + глосс + root·×freq + компактный `.rm-status`-селектор) → one-tap `setWordStatus` → инвалидировать readerWordStates + applyDecorations (мгновенная перекраска). i18n `room.morph.study.*` (ru/en/he).
3. **Гейт:** reader-morph smoke +collectNewWords-блок (фильтр new/undefined, freq-ранг, **key-parity: слово, помеченное 'known' по ключу, выпадает из collectNewWords**, function-word исключён). @380px свет+тёмная ✓. **Measure-before-code + live-verify (Kapture, реальный профиль 7026):** shipped-функция воспроизвела measure 1-в-1; `parityDrop` подтверждён на живом движке (pid:122 'known' → выпал).
**Файлы:** `reader-morph.js` (statusKeyForCard + collectNewWords + export), `library-ui.js` (study-sheet + кнопка), `library.html` (CSS .room-study/.reader-aids-study), locales ru/en/he, smoke. **NEXT → 4.3b recall-loop (cloze).**

### 4.3b recall-loop — план
In-session cloze из `readerRows` (в памяти; `note_occurrences` хранит ids+surface БЕЗ текста → cross-text cloze отложен). Бланкуем сохранённое/учимое слово в РЕАЛЬНОМ предложении readerRows → узнавание (MC из честных ривалов — родственные/похожие леммы) ИЛИ ввод → верно→уровень↑ (setWordStatus l→l+1/known), нет→↓. Manual-статус, НЕ Anki-карта (Anki держит расписание). **Детерминированный shuffle (НЕ Math.random — индекс/seed).** Гейт + @380px.

### Рабочий цикл (как в этой сессии)
- Гейты перед пушем: `node scripts/premium/{reader-morph,reader-scaffold,reader-parity,reader-word-status,reader-notes,reader-context}-smoke.js` + `corpus-vocab-engine-smoke.js` (если трогаешь читаемость) + `tests/i18n.smoke.js`.
- Версия-бамп при изменении shell/CSS/locale: `public/sw.js` CACHE_VERSION + оба футера (`library.html#roomFooterVersion` + `index.html#appFooterVersion`) + `package.json`.
- commit+push в main → Coolify auto-deploy → прод-верифи Node-fetch no-store на `sw.js` CACHE_VERSION + маркеры (**НЕ curl** — манглит иврит). На version-flip первый фетч ассета бывает stale (transient edge MISS) → перепроверь через 7с.
- Live-верифи: Kapture MCP на `linguistpro.kolosei.com/library.html`, `await import('/db/local-db.js')` для интроспекции БД. ⚠ **OPFS мульти-таб лок:** если `getAllWordStatuses().length===0` — это блокировка от 2-го таба (Студия), НЕ баг; reload вернёт доступ. Мерь только при `length>0`.
- Профиль владельца «жирный» (~5087 word_status + 4 крупных текста размечено «new» bulk-разметкой) — volume-тест реален.

### Жёсткие границы (НЕ нарушать)
`index.html`/Studio не трогать (smoke:reader-parity байт-парити reader-core). **Резолвер-ЯДРО не трогать** (`resolveCore`/датасет/`notes-autogen.js` lock-step) — если фикс затрагивает их или autogen-parity → СТОП, развилка владельцу. Manual-стор отдельно от srs_cards (Anki-карты не плодить). Канон концепции окраски/статусов: этот док + [[project_track_any_word]] + `BRR_TRACK_ANY_WORD_CONCEPT_2026_06_27.md`.
