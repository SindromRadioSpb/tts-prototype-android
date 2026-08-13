# Reading Room B6–B9 + Visual finishing — next-session handoff

Дата: 2026-08-11

Статус: **B6 CLOSED; B7 ENGINEERING + OWNER GENERAL SMOKE PASS / PHYSICAL-AT PARTIAL**

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
compact-copy follow-up plus cold-library/packet hardening `1298bb71` and
`73e74a37`, full-corpus preparation `d97930a8`/`86f5189c`, corpus finishing
`9dd225f0` and sync contract/replay `4818cd6e`/`9cf51982`, served in
`3.11.372`:

- один local-first `recorded-familiarity-v2` core для Room и Agent Access;
- versioned derived cache + bounded local My pass, full membership-gated
  protected index и readable Ben sidecar, без card-paint body reads;
- exact buckets/lower bound и честные typed states вместо fabricated `0%`;
- local-only `5×3×2500` calibration range с disable/reset;
- typed per-field provenance и deterministic reason ladder без LLM/threshold
  promise;
- final engineering unit `46/46`, browser matrix `161/161`, cloud sync
  `32/32`, i18n `233/233`, memory canon/FSRS `79/79`; a 115-text owner library
  now self-prepares without Reader while DOM stays at 48; production page packet is `48/48`,
  `255,442 B < 256 KiB`; familiar sort retains first selection; canonical
  hashes remain unchanged;
- production served-byte/health, owner-profile read-only browser и
  owner-reported general production smoke PASS; iPhone Safari evidence partial,
  full physical/AT matrix не выполнена, B7 не закрыт.
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
   `3.11.372`; не подменять незаполненные physical/AT строки automation или
   Kapture-скриншотами.
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
