# BRR-P2 «Discovery» — Читальный зал: full-text поиск + закладки + «Продолжить чтение» + фильтр/сорт

> Дизайн-док на блок Discovery (одобрен владельцем 2026-06-14). Тикет-семейство **BRR-P2-001…004**.
> Источник решений: план-сессия + 5 разведок + конкурентное исследование. Роли R1–R10 применены (см. ниже).
> Owner-инвариант: **бескомпромиссное премиум-качество, без заглушек.** Норма: `index.html` не трогаем; всё —
> Room-only (`library.html` / `library-ui.js` / `local-db.js` / миграция); `reader-core` builder parity-locked.

## Context — зачем

Семейство Karaoke закрыто; по стратегии **discovery — «единственный реальный gap» Читального зала**. Было: только
title/author-поиск по `corpus-search-v7.json`; нет поиска внутри текстов; нет закладок; позиция чтения пишется
(`text_progress`), но Зал не возвращает к ней; на L1-результатах и L3-работах нет сорта/фильтра.

## Решения владельца (зафиксированы)

1. **Покрытие FTS = поиск по всем 26K (find-only) + чтение растёт бейком.** Индекс над всеми 26 455 работами: ready
   (796→растёт) — сниппет + полное билингвальное открытие; non-ready — честное «найдено · перевод готовится» (без
   сниппета, открыть пока нельзя). Премиум-чтение растёт через бейк/публикацию ③ (токен). **Сырые иврит-тела НЕ пушим**
   (R4 «второй сорт»: без перевода/никуда/аудио/разбивки — ниже планки Зала).
2. **Закладки + «Продолжить чтение»** — обе фичи в блоке.
3. Стадийность: Continue Reading → Bookmarks → FTS → filter/sort (каждая стадия — отгружаемая, prod-верифицируемая, не заглушка).

## Жёсткие технические факты (ground truth разведки)

- **FTS5 НЕ скомпилирован** в наших wa-sqlite (`public/db/wa-sqlite.wasm`, `wa-sqlite-async.wasm`; 0 хитов
  `fts5/unicode61/snippet/trigram/tokenize`; JSON1 есть). Пересборка wasm = риск для общего DB-слоя Studio+Зал →
  **собственный Hebrew-aware инвертированный индекс в чистом JS**, SQLite не трогаем.
- **Иврит-источник всех 26 455 работ доступен на СБОРКЕ**: GitHub-дамп `projectbenyehuda/public_domain_dump/master/txt/<path>.txt`
  + локальный `.tmp/benyehuda/pseudocatalogue.csv`. Тела на клиенте только у 796 ready (`works/<id>.json`, gitignored,
  ~5 245 ивр-симв/работа). Весь иврит ≈ 136MB+ raw → шардинг обязателен.
- **Node-лемматизация уже решена** в `scripts/premium/build-corpus-vocab.js` (`buildFormIndex`/`tokenToPid`/delta-кодирование) —
  FTS-билд переиспользует тот же хребет → ключ-джойн с движком i+1 не разъедется.
- **`notes_v2` CHECK-констрейнт запрещает `note_type='bookmark'`** (`migrations.js:477-483`) → закладки = новая таблица (056).
- **`text_progress` есть** (`migrations.js:50-57`), но Room-open его не читал; `touchOpened` Залом не вызывался.
- **SW уже runtime-кеширует ленивые `/data/benyehuda/*`** → шардам FTS precache не нужен, только бамп `CACHE_VERSION`.

## Роли (линзы)

R6 библиотекарь (discoverability весь канон) · R7 гебраист · R8 graded («что дальше», без тупиков) · R4 премиум-UX
(RTL@380, без «второго сорта», провенанс, надёжный resume vs Apple Books) · R5 рынок (планка Sefaria/Dicta/LingQ,
offline-first) · **R10 морфолог (нормализатор index=query byte-parity; без наивного многобукв. стрипа; измеримость) · R1**.

---

## Стадии и статус

### BRR-P2-002 «Продолжить чтение» — ✅ SHIPPED (Stage 1)
Wire `text_progress` в Room без изменения parity-locked билдера.
- **Новый** `public/js/reader-progress.js` (UMD, `window.ReaderProgress`): чистые `resumeTarget(progress,rowCount)` /
  `continuePercent(lastIdx,nRows)` / `topVisibleRowIdx(rows,topOffset)` — гейтятся в Node.
- **Запись позиции** (только `library-ui.js`): debounced на скролл (топовая видимая `tr[data-row-idx]`) + на karaoke-смену
  строки + **синхронный flush в `closeReader`** (быстрый «Назад» не теряет позицию). `touchOpened` на открытие.
- **Возврат** (R4 надёжность, бить Apple Books): `openReader(textId,title,{resume})` после покраски читает `getProgress`,
  через `resumeTarget` решает; нормальное открытие → ненавязчивый баннер «Вы остановились на строке N / ✕»; тап continue-card
  (`resume:true`) → прямой переход. Out-of-range/idx≤0 → честно без resume. Подпись `openText` НЕ менялась → parity цел.
- **Полка** «▶ Продолжить чтение» вверху корпус-home (`getContinueReading(12)`, `% прочитано` чип); порядок:
  Продолжить → i+1 → ready → периоды (`injectHomeRails`). Обновляется при возврате из ридера.
- **Гейт** `smoke:reader-resume` (22/0). **i18n** `room.resume.*` (ru/en/he; HE best-effort → native-review).
  **SW** `CACHE_VERSION=v3.10.56-room-discovery` + precache `reader-progress.js`. **@380px** light+dark + браузерный e2e
  (continue-shelf, баннер non-jump, «Продолжить»→scroll, 0 console-errors).

### BRR-P2-003 Закладки — ⏳ PLANNED (Stage 2)
- **Миграция 056** `bookmarks(id, text_id FK CASCADE, sentence_id, order_index, text_key, snippet, note, created_at)` +
  индексы. (НЕ `notes_v2 note_type='bookmark'` — CHECK бросит.)
- DB-API `local-db.js`: `addBookmark/removeBookmark/listBookmarks/searchBookmarks/isBookmarked` (стиль `addNoteOccurrence` +
  LIKE как `searchAllNotes`). `snippet` денормализован → поиск без тела.
- **Ридер-UI parity-safe**: POST-render ☆/★ в `.col-action-cell` строки на Room-mount; occ из модели (`_v3_textId/sentenceId/orderIndex`).
- Полка «🔖 Закладки» + список в ридере + поиск. Якорь — `text_key`+`sentence_id`/`order_index`. Гейт `smoke:bookmarks`.

### BRR-P2-001 Full-text search (26K find-only) — ⏳ PLANNED (Stage 3)
- **Новый** `scripts/premium/build-corpus-fts.js`: `ingestCore.fetchTxt()` по 26K; нормализатор (импортируемый, фолд финалов)
  + dual-поле **exact** (скелет) / **lemma** (`tokenToPid` pid); delta-кодир. постинги; шардинг по ивр-биграмме
  (`fts/ex-<bg>-v<N>.json.gz`); тонкий манифест `corpus-fts-v<N>.json` (precache); works-таблица = `corpus-search-v<N>`.
- **Новый** `public/js/corpus-fts.js` (dual-export): `normalizeQuery`=тот же нормализатор, `tokenizeQuery`=`ReaderMorph.tokenize`,
  бакет→ленивый fetch→пересечение→ранг exact>lemma. Группа «в тексте» в `renderResultsInto`; сниппет ready (fetch body),
  честное «перевод готовится» non-ready; маркер «по форме слова» для lemma-only.
- Гейты `smoke:corpus-fts-parity` (index≡query нормализатор; `tokenToPid` parity) + `smoke:corpus-fts` (манифест/детерминизм/
  размер-потолок/known-hit). `CACHE_VERSION`+`FTS_DATA_REV` бамп. **Measure-first**: размер → commit-gz vs прод-том.

### BRR-P2-004 Фильтр/сорт — ⏳ PLANNED (Stage 4)
- L1-результаты сорт (relevance/coverage/alpha/era; coverage — из ОДНОГО снапшота состояний, не per-card → анти-stampede).
- L3-работы сорт+фильтр (длина/жанр/ready). Чистый Room-UI.

---

## Риски / R-флаги

- **Дрейф нормализатора (R10, топ)** — единый импортируемый нормализатор + `smoke:corpus-fts-parity`.
- **Наивный стрип проклитик (R10)** — держать консервативный `tokenToPid`, не многобукв. угадайку; группа «по форме слова».
- **Размер индекса на мобиле (R4/R5)** — шардинг + гейт-потолок.
- **Stampede coverage-бейджа (S3-регрессия)** — single-flight `ensureWordStates` + IntersectionObserver; coverage-сорт из одного снапшота.
- **Эфемерные text_id** — закладки/резюм якорить на `text_key`+`sentence_id`/`order_index`. (Resume: `last_row_idx` + out-of-range guard.)
- **non-ready ≠ тупик** — честный «перевод готовится»; премиум-чтение растёт бейком, не сырьём.

## Параллельно (вне Discovery, токен-питаемый)
③ `publish-corpus-batch` (~132 бейкнутых → каталог v8) растит ready-набор → FTS-хиты становятся открываемыми. 🔑 токен
`AUDIO_UPLOAD_TOKEN` — только в prod/CI-env, засвечен в чате → ротировать после пуша тел. Discovery-FTS токен НЕ требует.
