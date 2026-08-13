# Reading Room B6–B9 + Visual finishing — next-session handoff

Дата: 2026-08-11

Статус: **B6 CLOSED; B7 CLOSED WITH DOCUMENTED PHYSICAL/AT EXCEPTIONS; NEXT B8 RESEARCH-ONLY**

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

### B7 — Learning Compass 2.0 — CLOSED

Implementation `main@845ddc71`, production finishing `04f88328`/`85bdc9de`,
compact-copy follow-up plus cold-library/packet hardening `1298bb71` and
`73e74a37`, full-corpus preparation `d97930a8`/`86f5189c`, corpus finishing
  `9dd225f0`, sync contract/replay `4818cd6e`/`9cf51982`, and cross-device
  projection convergence `12f0e47f`, served in `3.11.373`:

- один local-first `recorded-familiarity-v2` core для Room и Agent Access;
- versioned derived cache + bounded local My pass, full membership-gated
  protected index и readable Ben sidecar, без card-paint body reads;
- exact buckets/lower bound и честные typed states вместо fabricated `0%`;
- local-only `5×3×2500` calibration range с disable/reset;
- typed per-field provenance и deterministic reason ladder без LLM/threshold
  promise;
- final engineering unit `50/50`, browser matrix `161/161`, cloud sync
  `32/32`, Studio↔Room SRS `49/49`, i18n `233/233`, memory canon/FSRS `79/79`; a 115-text owner library
  now self-prepares without Reader while DOM stays at 48; production page packet is `48/48`,
  `255,442 B < 256 KiB`; familiar sort retains first selection; canonical
  hashes remain unchanged;
- production served-byte/health, owner-profile read-only browser и
  owner-reported general production smoke PASS;
- по owner feedback visible familiarity copy сокращена до `X% знакомы` /
  `Не менее X% знакомы`; exact buckets и provenance остаются в details.
- B7 finishing production `3.11.372` унифицирует exact audio coverage и
  locale-based alignment во всех трёх корпусах, делает details single-open /
  outside-click / Escape-dismissable, объясняет различие token lower bound и
  lemma inventory и исцеляет rejected-row cloud cursor без новых learner
  events. Owner-profile read-only production traversal подтвердил My Texts
  `115/115`, Study Songs `77/77`, Ben-Yehuda `796/796`, `10/10` served assets,
  zero protected body/non-GET requests и неизменные canonical hashes;
  `review_log` local/cloud/cursors = `7,282`.
- B7 sync repair `3.11.373` делает projection-before-cursor атомарной
  границей, повторяет незавершённую страницу, выполняет одноразовый rebuild
  derived SRS/manual state и форсирует сериализованный sync после тренировки и
  foreground. Owner-profile read-back оставил `review_log` неизменным и равным
  cloud (`7,315`), а stale PC due projection исправил `210 → 205`. Владелец
  затем сообщил PASS production iPhone↔PC convergence smoke на `3.11.373`;
  compact physical smoke подтвердил iPhone Safari RTL/200%, PWA
  reopen/offline/reconnect и PC keyboard/200%; оставшиеся `NOT RUN` AT/Android
  строки владелец принял как documented exceptions и закрыл B7.5.

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

## Текущая следующая граница: B8 Reading Journey research-only

Стартовый запрос новой сессии:
[`ROOM_UX_B8_READING_JOURNEY_RESEARCH_SESSION_PROMPT_2026_08_13.md`](./ROOM_UX_B8_READING_JOURNEY_RESEARCH_SESSION_PROMPT_2026_08_13.md).

1. B7 closure:
   [`ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md`](./ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md).
2. Начать новый goal B8 только в research-only режиме; сначала recon живого
   кода/canonical stores и owner decision packet, затем STOP до approval.
3. B9 и Visual finishing не piggyback на B8 decision или release.

## Постоянный stop list

- не переоткрывать B0–B7 без regression evidence;
- не создавать вторую learner truth или silent state inference;
- не отправлять learner content в telemetry;
- не добавлять unexplained AI recommendations, mandatory quizzes, cover grid или gamified feed;
- не называть automation доказательством конкретного физического устройства.
