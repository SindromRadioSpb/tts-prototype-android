# Search & Discovery block — consolidated state + open requirements (READ-FIRST)

> Контекст-якорь для ПРОДУКТОВОГО закрытия блока поиска/Discovery Читального зала. Создан 2026-06-16, чтобы не потерять
> контекст при переходе от «починили ядро» к «закрыть блок качественно + премиально». Полные премиум-требования —
> исследуются и формализуются в ЭТУ сессию (см. §Open + будущий requirements-канон). Дизайн-канон + журнал находок:
> `BRR_P2_DISCOVERY_2026_06_14.md` (§B). Reading-row UX: `BRR_READING_UX_REQUIREMENTS_2026_06_15.md`. Роли: `docs/PROJECT_ROLES.md`.

## Где мы (всё SHIPPED + PROD-верифицировано)
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

## Open — требования к ПРОДУКТОВОМУ закрытию (формализуются в эту сессию)
Уже озвучено (P2-беклог):
- **Сниппет совпавшей строки в результатах** (Sefaria-style) — для готовых (тело с тома); неготовые — честно без. [REQ Reading-UX #10]
- **Прогрессивная phrase-группа** — рисовать точную фразу из префикс-шардов (1.34MB) ДО загрузки lemma (6.5MB) → убирает холод-пол первой вставки.
- **Инфлексия-толерантная фраза** (ниша) — фраза по lemma-pid, не только skeleton.
- **Рост покрытия FTS к 26K** (фоновое, механическое).
Reading-row смежные (затрагивают search-hit) → `BRR_READING_UX_REQUIREMENTS` P1/P2 (#7 tap-to-activate, #9 auto-scroll-band, #10 snippet, #11 mark-finished).

**TODO эту сессию (plan mode):** исследование + анализ по ролям R1–R10 — каких ещё КАЧЕСТВЕННЫХ и УНИКАЛЬНЫХ практик не хватает
(премиальность + удобство): бенчмарк Sefaria/LingQ/Reverso/Pealim/Readwise/Kindle/Google Books/Standard Ebooks + наш Studio;
gap-анализ нашей search-поверхности; формализация ПОЛНОГО набора требований (озвученные + найденные) в план → на утверждение.

## 🔑 OPEN (owner)
Ротация `AUDIO_UPLOAD_TOKEN` (засвечен) +Gemini +старый GCP — блокер публикации репо + ③ publish→каталог v8.
