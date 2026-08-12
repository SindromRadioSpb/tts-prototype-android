# Reading Room B7 Learning Compass 2.0 — engineering implementation

Дата: 2026-08-12; owner smoke и microcopy follow-up: 2026-08-13

Статус: **IMPLEMENTED · ENGINEERING PASS · PRODUCTION READ-BACK PASS · OWNER PRODUCTION SMOKE PASS · PHYSICAL/AT MATRIX PARTIAL**

Owner direction: `Переходи к реализации.`

Decision packet:
[`ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md`](./ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md)

Implementation: `main@845ddc71`; production finishing: `04f88328`, `85bdc9de`; compact-copy follow-up: release `3.11.364`

Production release: `3.11.364`

Владелец отдельно авторизовал production deploy. Первичный `3.11.363` развёрнут
и проверен direct no-store/served-byte read-back. Kapture-проверка использовала
реальный owner profile только для read-only navigation и раскрытия details;
она не является physical-device, screen-reader или owner acceptance evidence.
13 августа владелец сообщил PASS общего production smoke и приложил iPhone
Safari screenshot. Единственное замечание — длинная visible-copy familiarity;
в `3.11.364` она сокращена до `X% знакомы` / `Не менее X% знакомы`. Семантика
lower bound, exact buckets и provenance в details не менялись.

## Реализованный контракт

| Decision | Реализация |
|---|---|
| D1 shared recorded familiarity v2 | Один UMD semantic core используется Room и Agent Access; exact `familiar/new/untracked/unresolved`, excluded ignore/proper-name buckets, true-zero/profile-empty split, компактная lower-bound copy и rank только при uncertainty `≤5 pp`; полный audit остаётся в details |
| D2 local derived cache | Изолированная migration 049, content-free/LRU cache `1,000 / 64 MiB`, один page batch, exact revision/entitlement/resolver invalidation; Ben sidecar и bounded Worker для My/current materialized group |
| D3 local calibration | Только foreground explicit completion `30s–90m`; ready при `5 observations / 3 revision hashes / 2,500 tokens`; latest 12/8 KiB, median+IQR range, stale/unstable states, disable/reset без canonical writes |
| D4 typed provenance | Независимые `curated/asserted/derived/unknown` signals; audio/register/period/difficulty/familiarity/reason не заимствуют authority; group presenter больше не придумывает TTS/revision |
| D5 deterministic reasons | Versioned priority ladder и видимый reason; нет LLM, 70/90/95/98 readiness bands, comprehension/CEFR promise или opaque weighting |
| D6 budgets/matrix | Контрактные, browser, i18n, cache, migration и Agent gates зелёные; общий owner smoke/iPhone Safari layout имеет PASS/PARTIAL evidence, но Android/NVDA/VoiceOver/TalkBack и полные offline/focus сценарии остаются отдельной обязательной матрицей |

## Архитектурная граница

- `learning-compass-core.js` — pure buckets, statuses, provenance, reasons и
  calibration math; не читает DB и не делает network calls.
- `learning-compass-worker.js` — локальный conservative Hebrew analysis с
  token/type caps; возвращает агрегаты, не body.
- `local-db.js` — одна learner projection и один ingredient batch на текущий
  page; derived cache не является learner/content truth.
- `library-ui.js` — card stays usable при pending/stale/unsupported/failure;
  максимум два visible B7 signals, structured details, keyboard reset/disable.
- Agent `get_text_coverage` и group coverage используют ту же v2-семантику.
  Это versioned response evolution; оно не создаёт network dependency Room.
- Service Worker/Studio/Room version согласованы на production `3.11.364`;
  activation semantics B6 не ослаблены.

## Engineering evidence ledger

- B7 + frozen B6/B0–B5 unit contract: `37/37`.
- B7 responsive/status/privacy/browser-copy smoke: `125/125`, включая desktop
  paint/hit-test открытой details-панели и exact/limited compact copy.
- Matrix: `320/360/380/430/510/1280/1366`, EN/RU/HE-RTL, light/dark, reduced
  motion and simulated 200% zoom; inspected RU 380 and HE/RTL 360 artifacts.
- Across the matrix: `0` horizontal overflow, `0` fabricated zero, `0`
  telemetry requests, `0` page errors, maximum `2` card signals, `549` DOM
  nodes in the bounded fixture.
- Cached page batch: `3,489 B`; follow-up observed p95 `10.47–25.34 ms`;
  projection `2.32–4.22 ms`; these are local lab timings, not field
  distributions.
- Reset and disable preserve exact `review_log`, `word_status` and
  `text_progress` fixture rows.
- B6 targeted regression: `45/45`.
- B0–B5 responsive/browser regression: `838/838`.
- Agent Access: text coverage `74`, group corpus `42`, domain `50` checks.
- i18n `233/233`; memory canon/FSRS `79/79`; canon version `18/18`; legacy
  corpus vocab engine `37/37`.
- `node --check` and scoped `git diff --check`: PASS.

Durable automation evidence:
[`docs/research/room-ux-b7-learning-compass/2026-08-12/automation/`](../research/room-ux-b7-learning-compass/2026-08-12/automation/).

## Production, owner-profile and owner-smoke read-back

- Initial owner-profile evidence was recorded on `3.11.363`; compact-copy
  follow-up aligns public config, Room footer, Studio `APP_VERSION` and SW
  cache version on `3.11.364`.
- Committed-vs-served SHA-256 equality: `7/7` for Room HTML, Studio HTML,
  `library-ui.js`, core, Worker, LocalDb and SW.
- `/healthz`: app, DB and migrations ready. Bounded build-cache cleanup removed
  about `1.5 GB` without touching containers/volumes/data; root moved
  `90% → 85%`. `disk_warn=true` remains and old inactive images were preserved
  rather than silently narrowing rollback.
- Clean isolated Chromium at 380 px: exact version, no UI error, no horizontal
  overflow or clipped B7 signal; only expected anonymous `401` auth probes.
- Owner «Мои тексты»: `48/115` first-page cards, `48/48` Compass details,
  desktop details paint/hit-test `3/3`, exact bucket/time/provenance copy,
  `0` fabricated zero/overflow/error.
- Owner «Учебные песни»: `48/77` first-page cards, `48/48` Compass details,
  details paint/hit-test `3/3`, exact partial-audio count and honest unknown
  audio provenance, `0` fabricated zero/overflow/error.
- Before/after the read-only owner flow, counts and SHA-256 were identical for
  `review_log`, `word_status` and `text_progress`. No reader, grade/review,
  word-status action, calibration reset or disable was invoked. Normal signed-in
  background sync traffic was observed; request bodies were not inspected.
- Owner-reported production smoke on `3.11.363`: PASS. The supplied iPhone
  Safari screenshot exposed only the B7 copy-density issue; the `3.11.364`
  follow-up replaces the visible RU badge with `Не менее X% знакомы`, with
  corresponding compact EN/HE strings. Automation at RU 380 and HE/RTL 360
  records `0` clipping and preserves details/provenance.

Durable initial `3.11.363` production evidence:
[`PRODUCTION_READBACK_EVIDENCE.json`](../research/room-ux-b7-learning-compass/2026-08-12/automation/PRODUCTION_READBACK_EVIDENCE.json).

## Что не доказано

- Owner evidence confirms a general iPhone Safari production smoke, but does
  not attest every B7-IOS-S offline/pending/focus/large-text step. Android,
  macOS, NVDA, VoiceOver and TalkBack remain NOT RUN unless separately reported.
- Kapture owner-profile read-only evidence не является owner-reported
  physical/AT acceptance.
- Field RUM сознательно отсутствует по D4/B6 privacy boundary.
- B7 нельзя закрыть или назвать GA до physical/AT acceptance и closure verdict.

## Следующая граница

Выполнить
[`ROOM_UX_B7_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md`](./ROOM_UX_B7_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md).
Production preflight/deploy/read-back выполнен для release line through
`3.11.364`. После owner physical/AT PASS или явных documented exceptions
подготовить B7 closure; только затем начинать новый research-only goal B8
Reading Journey.
