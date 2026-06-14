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

### BRR-P2-003 Закладки — ✅ SHIPPED (Stage 2, SW v3.10.57)
- **Миграция 056** `bookmarks(id, text_id FK CASCADE, text_key, sentence_id, order_index, title, snippet, note, created_at)` +
  индексы + `UNIQUE(text_id, sentence_id)` (идемпотентный тогл). (НЕ `notes_v2 note_type='bookmark'` — CHECK бросит.)
- DB-API `local-db.js`: `addBookmark/removeBookmark/removeBookmarkById/listBookmarks(textId?)/searchBookmarks/isBookmarked`
  (стиль `addNoteOccurrence` + LIKE как `searchAllNotes`; `INSERT OR IGNORE`; `IS`-null-safe). `title`+`snippet` денормализованы → полка/поиск без тела.
- **Ридер-UI parity-safe**: POST-render ☆/★ в `.col-action-cell` (`attachBookmarks` из `attachReaderAudio`); occ из модели строки
  (`_v3_sentenceId/_v3_orderIndex`), сниппет = plain-he · ru; тост; состояние ★ грузится из БД на каждый attach.
- Полка «🔖 Закладки» (`renderBookmarkCard`/`injectBookmarksShelf`, билингв-снипет + название) открывает текст и прыгает к
  предложению (`openReader{scrollToSentence}` → `scrollToSentence` по `_v3_sentenceId`, устойчиво к gap в order_index).
  Порядок home: Продолжить → 🔖 Закладки → i+1 → ready → периоды.
- Гейт `smoke:bookmarks` (11/0: add/list/idempotent/search-he+ru/order/global-title/remove/CASCADE; реальный OPFS headless).
  i18n `room.bookmark.*` (ru/en/he). **@380px** light+dark + e2e (☆→★+тост, персист, полка, открытие-прыжок, 0 console-errors).
  Поиск закладок в общей results-поверхности — придёт со Stage 3 (группировка результатов).

### BRR-P2-001 Full-text search (find-only, растёт к 26K) — ✅ SHIPPED (Stage 3, SW v3.10.58)
- **Новый** `scripts/premium/build-corpus-fts.js`: тела из `works/<id>.json` (ready) + `ingestCore.fetchTxt` (кеш `.tmp/benyehuda/txt`,
  опц. GitHub-дамп); нормализатор = импортируемый `corpus-fts.normalizeToken` (никуд-strip + **фолд финалов** ך→כ…). **Dual-field
  по эффективности:** контентные слова (есть pid) → **lemma-поле** `pid→works` (схлопывает инфлексии/проклитики — Dicta-class,
  компактно, без проклитик-взрыва); fallback-токены без pid (имена собств./архаика ~14%) → **exact-skeleton-поле** `skel→works`
  (имя/место-поиск). Шардинг exact по первой ивр-букве (`fts/ex-<L>-v<N>.json`), lemma+lemmamap отдельно. `lemmamap`=`skel→pid`
  (корпус-скелеты + ВСЕ словарные формы выживших pid → любая форма запроса резолвится, parity, без 3.3MB-словаря на клиенте).
  DF-cap 0.92 (только вездесущие служебные). Постинги delta+tf. Детерминизм (стабильная сортировка). Works-таблица = `corpus-search-v<N>`.
- **Новый** `public/js/corpus-fts.js` (dual-export `window.CorpusFTS`): `normalizeToken/tokenizeText/bucketOf/decodePostings/scoreHits`
  (чистые, гейт-тестятся) + ленивый загрузчик (манифест precache → шард(ы) по нужде, force-cache, `?v=cat.FTS_DATA_REV`). Запрос:
  токен→скелет→exact-бакет ∪ lemmamap→pid→lemma → AND по терминам, exact>lemma. Группа «🔎 в тексте» в `renderResultsInto`
  (`appendFtsGroup`/`appendPagedWorkRows`); ready-хит открывается, non-ready — честный «перевод позже» (display-only); lemma-only →
  бейдж «по форме слова» (R10).
- **Хостинг (размер):** индекс 10 228/26 455 работ = 48MB raw / 13MB gz (растёт к ~34MB gz @26K) → **шарды на прод-том**
  (`.gitignore public/data/benyehuda/fts/`), эндпоинт `POST /api/benyehuda/fts/upload` (owner-token) + `scripts/premium/push-corpus-fts.js`;
  тонкий манифест `corpus-fts-v<N>.json` — в git+precache. Покрытие РАСТЁТ: `scripts/premium/fetch-corpus-bodies.js` доливает тела →
  ребилд+пуш (модель как у бейка корпуса). **Открываемость хитов растёт бейком ③.**
- Гейты `smoke:corpus-fts-parity` (20/0: нормализатор/токенайзер/скоринг) + `smoke:corpus-fts` (11/0: niqqud-insensitivity, same-form
  recall, dict-expansion, детерминизм, структура). `CACHE_VERSION` v3.10.58 + `FTS_DATA_REV`. i18n `room.corpus.search.{inText,byForm}`.
  **@380px** + e2e (поиск «אהבה»→2726 в тексте lemma; «ירושלים»→687 exact-fallback; «מלך אהבה» AND; honest-бейджи; 0 console-errors).
  **R10-честность:** офлайн form-first НЕ схлопывает омографы (מלך-сущ vs глаг — разные pid); поле помечено «по форме слова».

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
