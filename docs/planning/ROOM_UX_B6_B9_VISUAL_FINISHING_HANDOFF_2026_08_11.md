# Reading Room B6–B9 + Visual finishing — next-session handoff

Дата: 2026-08-11

Статус: **B6 CLOSED; B7 ENGINEERING PASS / PHYSICAL-AT PENDING**

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

Implementation `main@845ddc71`, production finishing `04f88328`/`85bdc9de`,
served release `3.11.363`:

- один local-first `recorded-familiarity-v2` core для Room и Agent Access;
- versioned derived cache + bounded Worker для My Texts/current materialized
  group editions, без card-paint body reads;
- exact buckets/lower bound и честные typed states вместо fabricated `0%`;
- local-only `5×3×2500` calibration range с disable/reset;
- typed per-field provenance и deterministic reason ladder без LLM/threshold
  promise;
- engineering `118/118`, production served-byte/health и owner-profile
  read-only browser evidence PASS; physical/AT matrix не выполнялась, B7 не
  закрыт.

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

## Текущая следующая граница: B7.5 physical/AT acceptance

1. Использовать
   `ROOM_UX_B7_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md` на exact production release
   `3.11.363`; не подменять physical/AT automation/Kapture-скриншотами.
2. При agent-assisted owner-profile проверке выполнять только read-only
   navigation/details; calibration controls — только самим владельцем или
   после отдельного разрешения. Не grade/review и доказать неизменность
   `review_log`.
3. Production preflight/deploy/served-byte read-back уже выполнен; после
   owner-reported physical PASS подготовить B7 closure verdict.
4. Только после B7 closure начать новый research-only goal B8 Reading Journey.
   B8/B9/Visual finishing не piggyback на B7 release.

## Постоянный stop list

- не переоткрывать B0–B5 без regression evidence;
- не создавать вторую learner truth или silent state inference;
- не отправлять learner content в telemetry;
- не добавлять unexplained AI recommendations, mandatory quizzes, cover grid или gamified feed;
- не называть automation доказательством конкретного физического устройства.
