# Reading Room B6–B9 + Visual finishing — next-session handoff

Дата: 2026-08-11

Статус: **B6 CLOSED / OWNER ACCEPTED; NEXT: B7 RESEARCH-ONLY**

Предшествующие программы: Option B B0–B5 и B6 Scale & Resilience закрыты
владельцем; см. `ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md` и
`ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md`.

Текущий B6 baseline: implementation `main@485ba466`, production `3.11.360`,
D6 owner-reported PASS 2026-08-12.

## Почему продолжать в новой сессии

B6–B9 затрагивают новые продуктовые домены, а не polishing закрытого shell. Новая сессия должна
начаться с чистого recon и stop/go packet, используя closure/evidence как входные данные. Это
предотвращает смешивание завершённой release-истории B0–B5 с новыми state, telemetry, editorial и
cross-surface решениями.

## Предлагаемая программа

### B6 — Scale, resilience и наблюдаемость — CLOSED

- owner-content baseline и явно названная device/a11y evidence matrix;
- убрать `listTexts({ limit: 500 })` как масштабный потолок: cursor/page + honest total;
- gate на 1k/5k личных материалов, bounded DOM/search/filter/memory;
- URL/history presentation state для reload/PWA eviction/browser Back без learner store;
- offline/reconnect/SW-update states;
- privacy-safe production RUM для LCP/INP/open/return/error, без learner content.

### B7 — Learning Compass 2.0

- честная familiar-word coverage для поддерживаемых My Texts/group items;
- индивидуальное время чтения только после калибровки по реальному поведению;
- register/period/audio/difficulty reason и asserted/derived/curated provenance;
- ясное unsupported state вместо fabricated `0%`;
- никакого opaque AI recommender.

### B8 — Reading Journey

- отдельное owner decision по cross-corpus saved/bookmark identity;
- одна recoverable presentation progress + notes + vocabulary + media + last place;
- advanced saved/filtered views только поверх существующих canonical stores;
- запрет второго progress/vocabulary/notes writer.

### B9 — Curated paths и assignments

- editor/teacher-authored sequence: text/song/review/optional comprehension;
- reason, source, level и assignment authority видимы;
- использовать существующий comprehension/trainer контур, не создавать quiz wall;
- AI-generated paths/content — отдельное позднее решение, default-off.

### Visual finishing — bounded surface-local lane

- coherent SVG/system iconography вместо emoji-only identity;
- optical RU/HE typography и RTL alignment;
- 120–180ms continuity transitions с `prefers-reduced-motion`;
- empty/offline/partial/error state polish;
- две LinguistPro-native композиции на owner fixtures, без переоткрытия IA B0–B5.

Visual finishing может исследоваться параллельно B6, но shared `reader-core.css`, `morph-host.js`,
LocalDb/FSRS/media/i18n/SW contracts и production deployments остаются сериализованными.

## Начало следующей сессии: B7

1. Прочитать B0–B6 closure, этот handoff, `PREMIUM_BENCHMARK.md`,
   `PRODUCT_DIRECTION.md` и живой код Learning Compass/coverage.
2. Выполнить research-only recon B7: какие My Texts/group items имеют честный
   vocabulary coverage, где нужна calibration, какие provenance/unsupported
   states уже существуют и какие contracts shared.
3. Подготовить `ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_<date>.md` на
   owner approval до продуктового кода.
4. Не совмещать B7 с B8/B9 или Visual finishing deployment; каждый B остаётся
   отдельным owner stop/go решением.

## Постоянный stop list

- не переоткрывать B0–B5 без regression evidence;
- не создавать вторую learner truth или silent state inference;
- не отправлять learner content в telemetry;
- не добавлять unexplained AI recommendations, mandatory quizzes, cover grid или gamified feed;
- не называть automation доказательством конкретного физического устройства.
