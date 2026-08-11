# Reading Room B7 Learning Compass 2.0 — engineering implementation

Дата: 2026-08-12

Статус: **IMPLEMENTED · ENGINEERING PASS · PHYSICAL/AT PENDING · NOT DEPLOYED**

Owner direction: `Переходи к реализации.`

Decision packet:
[`ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md`](./ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md)

Implementation: `main@845ddc71`

Release candidate: `3.11.361`

Production remains on the inherited B6 snapshot until a separately authorized
deploy and served-byte read-back. Automation below is not production,
physical-device, screen-reader, or owner-live evidence.

## Реализованный контракт

| Decision | Реализация |
|---|---|
| D1 shared recorded familiarity v2 | Один UMD semantic core используется Room и Agent Access; exact `familiar/new/untracked/unresolved`, excluded ignore/proper-name buckets, true-zero/profile-empty split, lower-bound copy и rank только при uncertainty `≤5 pp` |
| D2 local derived cache | Изолированная migration 049, content-free/LRU cache `1,000 / 64 MiB`, один page batch, exact revision/entitlement/resolver invalidation; Ben sidecar и bounded Worker для My/current materialized group |
| D3 local calibration | Только foreground explicit completion `30s–90m`; ready при `5 observations / 3 revision hashes / 2,500 tokens`; latest 12/8 KiB, median+IQR range, stale/unstable states, disable/reset без canonical writes |
| D4 typed provenance | Независимые `curated/asserted/derived/unknown` signals; audio/register/period/difficulty/familiarity/reason не заимствуют authority; group presenter больше не придумывает TTS/revision |
| D5 deterministic reasons | Versioned priority ladder и видимый reason; нет LLM, 70/90/95/98 readiness bands, comprehension/CEFR promise или opaque weighting |
| D6 budgets/matrix | Контрактные, browser, i18n, cache, migration и Agent gates зелёные; physical iPhone/Android/NVDA/VoiceOver/TalkBack остаются отдельной обязательной матрицей |

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
- Service Worker/Studio/Room version согласованы на candidate `3.11.361`;
  activation semantics B6 не ослаблены.

## Engineering evidence ledger

- B7 + frozen B6/B0–B5 unit contract: `37/37`.
- B7 responsive/status/privacy browser smoke: `92/92`.
- Matrix: `320/360/380/430/510/1280`, EN/RU/HE-RTL, light/dark, reduced
  motion and simulated 200% zoom; inspected RU 380 and HE/RTL 360 artifacts.
- Across the matrix: `0` horizontal overflow, `0` fabricated zero, `0`
  telemetry requests, `0` page errors, maximum `2` card signals, `470` DOM
  nodes in the bounded fixture.
- Cached page batch: `3,489 B`; observed p95 `8.82–11.71 ms`; projection
  `2.19–3.08 ms`; these are local lab timings, not field distributions.
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

## Что не доказано

- Candidate `3.11.361` не развёрнут и не прошёл production served-byte/health
  read-back.
- Ни один результат не считается iPhone/Android/macOS/NVDA/VoiceOver/TalkBack
  PASS. Chromium screenshots и keyboard automation — только lab evidence.
- Owner profile не использовался; owner-live checksum не записан.
- Field RUM сознательно отсутствует по D4/B6 privacy boundary.
- B7 нельзя закрыть или назвать GA до physical/AT acceptance и отдельного
  release verdict.

## Следующая граница

Выполнить
[`ROOM_UX_B7_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md`](./ROOM_UX_B7_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md).
После owner PASS — отдельный явно авторизованный production preflight/deploy/
read-back. Затем новый research-only goal B8 Reading Journey; B8 не входит в
этот implementation commit.
