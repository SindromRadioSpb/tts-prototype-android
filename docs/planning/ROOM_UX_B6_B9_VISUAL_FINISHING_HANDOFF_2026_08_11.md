# Reading Room B6–B9 + Visual finishing — next-session handoff

Дата: 2026-08-11

Статус: **DIRECTION CONFIRMED; SCOPE/SEQUENCE NOT YET APPROVED FOR CODE**

Предшествующая программа: Option B B0–B5 закрыта владельцем; см.
`ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md`.

Baseline: `main@940148f663f2861dc8d94e617e4034619937b4b1`, production `3.11.359`.

## Почему продолжать в новой сессии

B6–B9 затрагивают новые продуктовые домены, а не polishing закрытого shell. Новая сессия должна
начаться с чистого recon и stop/go packet, используя closure/evidence как входные данные. Это
предотвращает смешивание завершённой release-истории B0–B5 с новыми state, telemetry, editorial и
cross-surface решениями.

## Предлагаемая программа

### B6 — Scale, resilience и наблюдаемость

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

## Начало следующей сессии

1. Прочитать closure, этот handoff, `PREMIUM_BENCHMARK.md`, `PRODUCT_DIRECTION.md` и живой код.
2. Выполнить read-only recon B6: real limits, URL/history, offline/SW, telemetry/privacy, owner matrix.
3. Подготовить `ROOM_UX_B6_SCALE_RESILIENCE_DECISION_PACKET_<date>.md` на утверждение до кода.
4. Не планировать единый B6→B9 mega-release: каждый B — отдельное owner stop/go решение.

## Постоянный stop list

- не переоткрывать B0–B5 без regression evidence;
- не создавать вторую learner truth или silent state inference;
- не отправлять learner content в telemetry;
- не добавлять unexplained AI recommendations, mandatory quizzes, cover grid или gamified feed;
- не называть automation доказательством конкретного физического устройства.
