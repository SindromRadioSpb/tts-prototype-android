# Search & Discovery block — state + ★КАНОН утверждённых требований S1–S19 (READ-FIRST)

> Контекст-якорь + **КАНОН требований** к ПРОДУКТОВОМУ закрытию блока поиска/Discovery Читального зала. Создан 2026-06-16;
> требования **сформированы (исследование+анализ по ролям) и УТВЕРЖДЕНЫ владельцем 2026-06-16** (см. §ТРЕБОВАНИЯ). Реализация —
> в НОВОЙ сессии, всё одним заходом (промт в конце файла). Дизайн-канон + журнал находок: `BRR_P2_DISCOVERY_2026_06_14.md` (§B).
> Reading-row UX: `BRR_READING_UX_REQUIREMENTS_2026_06_15.md`. Роли: `docs/PROJECT_ROLES.md`.

## ✅ ВЕСЬ НАБОР S1–S16 + P3 РЕАЛИЗОВАН + ОТГРУЖЕН 2026-06-16 (SW `v3.10.70-fts-translit`, main `4908937`)
> **P3 (дополнительно, 2026-06-16):** «⚙» свёртка продвинутых чипов фильтр-бара · несколько ИМЕНОВАННЫХ списков чтения ·
> **S18** транслит-помощник рус→иврит (авторитетный обратный индекс из `translit_ru`; `build:translit`; gate `smoke:translit`).
> **Отложено (по решению владельца):** S17 инфлексия-фраза (позиц.-lemma бьёт мобайл-бюджет+токен) · S19 KMap-link (Studio-only,
> тронуло бы index.html) · рост FTS→26K (push требует ротации токена). Детали — `BRR_SEARCH_IMPL_2026_06_16.md`.
> **Follow-up ОТГРУЖЕН 2026-06-17 (SW `v3.10.71-list-nonready`):** «➕ В список» теперь на КАЖДОЙ строке результата (и ⏳ non-ready, и title-only),
> а не только в ленивом сниппете → можно сохранить нечитаемую пока работу «на потом». Хранится честно `r:false` (авторитетный `openable`
> прокинут до `cardToListItem`); полка авто-апгрейдит запись (бейдж снят + открывает) как только работа появляется в живом ready-индексе (`corpusReadyMap`).
> Только `library-ui.js` (+ CSS); без новых i18n/токена; index.html/reader-core не тронуты. Из P3-беклога остаётся только S18 latin/SBL (owner-deprioritized).
> Реализация-лог + детали по каждому S → **`docs/planning/BRR_SEARCH_IMPL_2026_06_16.md`**. Большие кирпичи (S8/S11/S13/S15)
> УТВЕРЖДЕНЫ владельцем (все V1) — рекон-дизайны `BRR_S{8,11,13,15}_*.md`.
> **P0** S1 сниппет билингв · S2 `<mark>` · S3 прогрессивная фраза · S4 ✕/Enter/Esc · S5 релевантность · S6 ясность счётчика.
> **P1** S7 readability-фильтр+бейдж · S8 KWIC-конкорданс · S9 точная-форма/по-корню · S10 поиск→заметки(context+pid).
> **P2** S11 scoped (автор/период) · S12 recent+suggestions · S13 сохранённые-поиски+список-чтения · S14 ещё-у-автора · S15 in-reader-find · S16 провенанс-фильтры(аудио/проверено).
> Гейты зелёные (`smoke:corpus-snippet` 30 · `corpus-fts` 48 · `-parity` 30 · `reader-parity`/`-resume`/`bookmarks`/`i18n`).
> Прод-верифи (Node-fetch + браузер @380px light+dark, 0 console-errors). НЕ ОТГРУЖЕНО (P3-беклог): S17 инфлексия-толерантная ФРАЗА · S18 транслит-помощник · S19 link в Knowledge-Map · рост FTS-покрытия к 26K.
> Никуд-ловушки/нюансы: index.html не тронут; reader-core builder parity-locked; S10 НЕ блокируется токеном (клиентский createNote); ротация `AUDIO_UPLOAD_TOKEN`+Gemini+GCP всё ещё блокер публикации репо + ③.

## Где мы (ядро P2-001..006a — было SHIPPED + PROD-верифицировано ДО этого захода)
- **main `fff01aa`, SW `v3.10.63-fts-fast`.** Зал `/library.html` + `public/js/library-ui.js`; движок `public/js/corpus-fts.js`;
  билд `scripts/premium/build-corpus-fts.js`; индекс на ПРОД-ТОМЕ (gitignored), пуш `push-corpus-fts.js`; манифест в git+precache.
- **P2-001** Full-text «в тексте» (свой Hebrew-aware инвертированный индекс; FTS5 нет в wa-sqlite).
- **P2-002** Continue Reading · **P2-003** Bookmarks · **P2-004** L3 sort/filter · **P2-005/005.2** jump-highlight + last-played.
- **P2-006** ПОЗИЦИОННЫЙ фразовый поиск — две группы «🔎 Точная фраза» / «Слова в тексте»; маркер «по форме слова» снят;
  drill-in на строку фразы (`firstPhraseRow`→jump-highlight).
- **P2-006a** скорость + обратная связь — индикатор «Ищем в текстах…», анти-гонка `corpusFtsSeq`, прогрев на загрузке
  (`warm()`+`warmQuery()`), **2-уровневое под-шардирование тяжёлых букв** (`ex-<L1L2>`). Вставка-фразы: exact 30MB→1.34MB; тёплый поиск 313–932мс.

## Архитектурные инварианты (НЕ ломать)
- **Двухслойный индекс:** `lemma` = COUNT-only (pid, ~6.5MB, всегда — word-AND + «слова»); `exact` = ПОЗИЦИОННЫЙ skeleton по
  ВСЕМ токенам, шардирован: лёгкие буквы `ex-<L>`, тяжёлые (`sharded_letters`, 14) по 2-й букве `ex-<L1L2>` (≤8MB, upload-cap).
- **Parity нормализатора** (R10): билд и клиент через ОДИН `corpus-fts.normalizeToken` (никуд-strip + фолд финалов). Гейт `smoke:corpus-fts-parity`.
- **Фраза = точный консонантный run** (`phraseHit`, slop) по exact-позициям; «слова» инфлексия-толерантны через lemma-pid.
- **Манифест** `corpus-fts-v<V>.json`: `schema:2`, `positions`, `max_pos:16`, `lemma_files`, `lemmamap_file`, `bucket_files`(ключ→файлы),
  `sharded_letters`. Версии: `FTS_DATA_REV` (library-ui) + `CACHE_VERSION` (sw) бамп при смене формата/контента.
- **Гейты:** `smoke:corpus-fts` 48/0 + `-parity` 30/0 + `reader-parity` (reader-core НЕ трогать). `index.html` НЕ трогать.
- **Покрытие:** 10 229 / 26 455 работ (find-only; растёт `fetch:corpus-bodies`→`build:corpus-fts`→`push:corpus-fts`). Тела в `.tmp/benyehuda/txt/p*`.

## Текущая поверхность поиска (что видит юзер)
L1 «Корпус»: фильтр-бар (поиск + ✓Готовые + Жанр/Язык select + ✕Сбросить) → сводка «запрос N» → группа **заголовки/авторы** →
**«🔎 Точная фраза (N)»** (для фраз) → **«Слова в тексте (M)»** (или одна «🔎 В тексте» для 1 слова). Готовый хит ▶ → читалка
НА строке (jump-highlight); неготовый — «перевод позже» (display-only). Пагинация «Показать ещё».

## ✅ ТРЕБОВАНИЯ — ФОРМАЛИЗОВАНЫ + УТВЕРЖДЕНЫ владельцем 2026-06-16 (этот раздел = КАНОН)
> Решение владельца: **реализовать ВЕСЬ набор P0+P1+P2 ОДНИМ большим пушем, в НОВОЙ сессии** (без промежуточных чекпоинтов).
> Источник: исследование 3 Explore-агентов (этой сессии) + ролевой анализ R1–R10 + бенч (Sefaria KWIC/scope · LingQ
> readability/sentence · Reverso/Pealim morph · Readwise/Kindle history+highlight+in-text-find · Apple Books · Beelinguapp).
> **Гл. вывод рекона: ВСЕ фичи DATA-FEASIBLE сейчас** (тела билингв `works/<id>.json`; readability per-hit
> `CorpusVocab.coverageForWork`; корень `lemmamap`; позиции для KWIC; `roomSaveWord`+`ankiExportRepo` для поиск→изучение) —
> крупных новых продюсеров НЕ нужно (кроме сниппет-поля Anki-экспорта). План: `~/.claude/plans/linguistpro-node-pwa-smooth-wozniak.md`.

### Видение
**«Найди строку · найди слово · читай, что можешь · из находки — в изучение».** Вставил фразу → видишь СТРОКУ с переводом;
ищешь слово → все формы + где встречается (конкорданс); видишь, что по силам; из хита — сразу в заметки/Anki.

### Граница блока
**IN:** UX строки, презентация результатов (сниппет/подсветка/релевантность), перф фразы, scoped-поиск, история/подсказки,
KWIC/конкорданс, режим поиск-по-корню, readability-aware поиск, сохранённые поиски/списки, related/in-reader-find, ЛЁГКИЙ хук
поиск→изучение. **OUT (отдельные направления, тут только ссылки/хуки):** движок Anki-sync (⑤), полное R10-качество+идиш (④), движок Knowledge-Map (R3).

### P0 — завершить «найти» (планка категории)
- **S1 Сниппет совпавшей строки** в результатах — билингв для готовых (`hebrew_niqqud`+`russian`); KWIC-окно ±N по `order_index`; неготовые честно без. [R4/R6 · reuse reader-core body-fetch + `firstPhraseRow`]
- **S2 `<mark>`-подсветка** запроса в заголовке + сниппете (niqqud-insensitive через skeleton/`corpusNrm`). [R4]
- **S3 Прогрессивная phrase-группа** — «Точная фраза» из префикс-шардов (1.34MB) ДО lemma (6.5MB); «Слова» дорисовывается → убирает холод-пол первой вставки. [R4/R5 · `phraseSearch` split]
- **S4 Полировка инпута** — inline ✕-clear · Enter=искать сейчас (мимо debounce) · Escape=очистить · возврат фокуса. [R4]
- **S5 Релевантность** — phrase>exact>lemma (есть) + title/author-boost + опц. readability-boost; стабильный порядок. [R5/R10 · `scoreHits`]
- **S6 Ясность сводки** — «0» = совпадения по ЗАГОЛОВКУ ≠ «ничего»; переименовать/объединить, не путать с FTS. [R4]

### P1 — уникальные дифференциаторы (выше LingQ/Beelinguapp)
- **S7 Readability-aware поиск** (УНИКАЛЬНО): бейдж «≈N% тебе по силам» в результатах + фильтр «Читаемые для меня» (zone in/easy) + опц. сорт. [R8/R2 · `CorpusVocab.coverageForWork` per-hit; reuse coverage-badge/`observeCardCoverage`]
- **S8 KWIC / Конкорданс** (УНИКАЛЬНО, scholar): «все вхождения слова/фразы по корпусу» с контекст-строкой + частота. [R7/R10 · exact-offsets + `order_index`; новый view]
- **S9 Поиск по корню/лемме** (Pealim/Reverso-class): режим «по корню» «מלך»→все формы; показать лемму/корень хита. [R10/R1 · `lemmamap` skeleton→pid]
- **S10 Поиск→изучение HOOK**: из хита (слово/фраза) «Сохранить в заметки / Anki» с совпавшей СТРОКОЙ как контекст-пример. [R2 · `roomSaveWord`+`notes_v2 word_study`+`ankiExportRepo` (доб. snippet-поле)]

### P2 — широта Discovery
- **S11 Scoped-поиск** «в этом авторе/периоде/жанре» + сохранение запроса при drill (сейчас сбрасывается). [R6/R5]
- **S12 Recent searches + подсказки** (cold-start промпты · история). [R5 · i18n namespace готов]
- **S13 Сохранённые поиски / списки чтения** (коллекции). [R6]
- **S14 Related / «ещё у автора» / «похожие»** в результатах и на карточке. [R6]
- **S15 In-reader find** (поиск внутри открытого текста). [R5/R4 · Kindle/Apple-Books table-stakes]
- **S16 Advanced filters** — длина · огласованность (`coverage.niqqud`) · review-status · есть-аудио. [R6 · corpus-index]

### P3 — полиш / отложенное
S17 инфлексия-толерантная ФРАЗА (lemma-pid) · S18 транслит-помощник рус→иврит · S19 link в Knowledge Map (корень→граф) · **рост покрытия FTS к 26K** (фоновое).

### Gap-анализ (что ОТСУТСТВУЕТ сегодня — из рекона)
Нет: сниппета/превью строки · `<mark>`-подсветки терма · scoped-поиска (всегда глобальный; запрос сбрасывается при drill) ·
истории/подсказок · сохранённых поисков/списков · related/«ещё у автора» · in-reader-find · readability-фильтра поиска ·
KWIC/конкорданса · режима поиск-по-корню · хука поиск→изучение · ✕-clear/Enter/Escape в инпуте · advanced-фильтров.
Reading-row смежные → `BRR_READING_UX_REQUIREMENTS` P1/P2 (#7 tap-to-activate, #9 auto-scroll-band, #10 snippet, #11 mark-finished).

### Порядок реализации (новая сессия, один заход): P0(S1–S6) → P1(S7–S10) → P2(S11–S16). Крупные кирпичи (S8/S11/S13/S15) — свой рекон-`<TICKET>` на утверждение внутри захода.

## 🔑 OPEN (owner)
Ротация `AUDIO_UPLOAD_TOKEN` (засвечен) +Gemini +старый GCP — блокер публикации репо + ③ publish→каталог v8. S10 (Anki-хук) использует тот же экспорт.

## ПРОМТ для НОВОЙ сессии (копипаст — реализация утверждённого набора)
```
Продолжаем LinguistPro (Node PWA, иврит↔рус, prod linguistpro.kolosei.com; Зал /library.html, Studio /index.html).
READ FIRST: docs/planning/BRR_SEARCH_DISCOVERY_STATE_2026_06_16.md (★ КАНОН требований S1–S19, УТВЕРЖДЕНО 2026-06-16) +
docs/planning/BRR_P2_DISCOVERY_2026_06_14.md + docs/PROJECT_ROLES.md (R1–R10 авто) + CLAUDE.md + .remember/remember.md.
Owner-инвариант: бескомпромиссное качество, без заглушек.
ЗАДАЧА: реализовать ВЕСЬ утверждённый набор S1–S19 ОДНИМ заходом, по порядку P0(S1–S6)→P1(S7–S10)→P2(S11–S16); каждый
крупный кирпич (S8 KWIC · S11 scoped · S13 lists · S15 in-reader) — короткий рекон-дизайн docs/planning/<TICKET>.md НА
УТВЕРЖДЕНИЕ перед кодом; остальное реализовывать по канону. Все фичи DATA-FEASIBLE (см. канон §рекон).
Нормы: reader-core builder/index.html НЕ трогать (smoke:reader-parity); ридерные фичи POST-render на Room-mount; MEASURE до
кода (НЕПУСТОЙ профиль); гейты зелёные до push (smoke:corpus-fts/-parity/reader-parity + новые corpus-snippet/readability);
commit+push автономно (Coolify); prod-verify Node-fetch (НЕ Windows-curl для иврита) + браузер на СВЕЖЕМ коде (проба свежести,
не очищать кэш перед замером тёплой скорости); SW CACHE_VERSION + FTS_DATA_REV бамп при формате; @380px RTL light+dark скрин.
СОСТОЯНИЕ (main fff01aa, SW v3.10.63-fts-fast): ядро поиска (P2-001..006a) в проде; этот заход = ПРОДУКТОВОЕ закрытие блока.
Архитектура: двухслойный индекс (lemma count-only always-load 6.5MB + exact позиционный, тяжёлые буквы по 2-й букве ex-<L1L2>);
фраза = точный консонантный run; снять данные для S1/S7/S8/S9/S10 из works/<id>.json + corpus-vocab + lemmamap (всё есть).
🔑 СРОЧНО (owner): ротация AUDIO_UPLOAD_TOKEN (засвечен) +Gemini +старый GCP — блокер публикации репо + S10/③.
Начни с P0-S1 (сниппет): сначала рекон где рендерятся результаты (appendPagedWorkRows/renderCorpusWorkRow) + как тянуть тело
(reader-core openText / works/<id>.json) + firstPhraseRow → дизайн → реализация → гейты → prod-verify. Затем S2…S16 по порядку.
```
