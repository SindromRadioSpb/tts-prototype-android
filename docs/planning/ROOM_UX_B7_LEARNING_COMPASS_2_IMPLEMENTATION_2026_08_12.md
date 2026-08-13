# Reading Room B7 Learning Compass 2.0 — engineering implementation

Дата: 2026-08-12; owner smoke и microcopy follow-up: 2026-08-13

Статус: **IMPLEMENTED · ENGINEERING PASS · PRODUCTION READ-BACK PASS · OWNER PRODUCTION SMOKE PASS · PHYSICAL/AT MATRIX PARTIAL**

Owner direction: `Переходи к реализации.`

Decision packet:
[`ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md`](./ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md)

Implementation: `main@845ddc71`; production finishing: `04f88328`, `85bdc9de`;
compact-copy follow-up: `3.11.364`; cold-library + packet hardening:
`1298bb71`, `73e74a37`; three-corpus disclosure follow-up: `70dcffdc`;
full-corpus preparation: `d97930a8`; limited-only sort UX: `86f5189c`;
corpus finishing: `9dd225f0`; sync contract/replay: `4818cd6e`, `9cf51982`

Production release: `3.11.372`

Владелец отдельно авторизовал production deploy. Первичный `3.11.363` развёрнут
и проверен direct no-store/served-byte read-back. Kapture-проверка использовала
реальный owner profile только для read-only navigation и раскрытия details;
она не является physical-device, screen-reader или owner acceptance evidence.
13 августа владелец сообщил PASS общего production smoke и приложил iPhone
Safari screenshot. Единственное замечание — длинная visible-copy familiarity;
в `3.11.364` она сокращена до `X% знакомы` / `Не менее X% знакомы`. Семантика
lower bound, exact buckets и provenance в details не менялись.

После owner-report о скрытой зоне `3.11.365` устранил зависимость подготовки
карточки от открытия Reader: текущая 48-card page получает urgent queue, затем
bounded idle sweep готовит весь личный каталог (`240/session`, окно `1,000`),
показывая точный `prepared/total`. Реальная библиотека выявила второй дефект:
verbose ingredients для первой страницы занимали `560,093 B`, поэтому прежний
`256 KiB` batch честно отбрасывал 26 из 48 строк. `3.11.366` хранит те же
частоты compact tuples `[key,count]` под schema `2.0.1`; лимит не повышен, а
production packet стал `48/48`, `255,442 B`, stale/invalid = 0.

Follow-up hardening `3.11.367` закрыл четыре найденных при трёхкорпусной
проверке disclosure-дефекта. Catalog-only group card больше не заявляет
familiarity как `derived`: видимый статус предлагает «Откройте для анализа», а
details честно показывают unknown provenance и локальную подготовку после
первого открытия. Compact Ben-Yehuda rail теперь имеет то же структурированное
раскрытие, что result row. `AVAILABLE_LIMITED` явно объясняет, что высокая
неоднозначность исключает значение из сортировки; label сортировки уточнён до
«Сначала достоверно знакомые». Одновременно открывается только одна details-
панель, `Escape` закрывает её и возвращает focus на summary.

Full-corpus preparation hardening `3.11.368` реализует owner amendment
B7-D2A. Study Songs больше не зависит от первого открытия: membership-gated
server Worker строит immutable revision-bound sidecar из всех readable bundles,
а browser забирает только content-free aggregate packets и вычисляет
персональный процент локально. My Texts делает полный background pass до
проверенного B6 масштаба `5 000`; Ben-Yehuda до открытия оценивает все `796`
ready works из компактного публичного sidecar. Во всех трёх корпусах одна
команда `Сначала достоверно знакомые`, один profile-empty stop и один
rank-eligibility contract. Protected card paint не загружает work body.

Release hardening 13 августа: первые две image-сборки `3.11.364` остановились
до cutover после сетевого `socket hang up` при получении prebuilt `sqlite3`;
source fallback затем выявил отсутствующий Python 3.12 `distutils`. Production
продолжал обслуживаться предыдущим healthy image. В build-only stage
`Dockerfile` добавлен `py3-setuptools`, предоставляющий совместимый shim для
используемого `node-gyp 8`; проверка импорта в чистом `node:20-alpine` прошла.

Corpus finishing `3.11.370`–`3.11.372` устранил последние выявленные owner
review расхождения: единый exact audio contract и locale-based alignment во
всех трёх корпусах, single-open/outside-click/Escape disclosure, явную справку
token lower bound против lemma inventory и восстанавливаемый cloud replay без
пропуска rejected rows. Два production read-back последовательно обнаружили
legacy provenance allowlist drift и cached rejection; оба исправления вошли в
`4818cd6e`/`9cf51982`, не создавая learner events.

## Реализованный контракт

| Decision | Реализация |
|---|---|
| D1 shared recorded familiarity v2 | Один UMD semantic core используется Room и Agent Access; exact `familiar/new/untracked/unresolved`, excluded ignore/proper-name buckets, true-zero/profile-empty split, компактная lower-bound copy и rank только при uncertainty `≤5 pp`; полный audit остаётся в details |
| D2 local derived cache | Изолированная migration 049, content-free/LRU cache `1,000 / 64 MiB`, один page batch, exact revision/entitlement/resolver invalidation; full local My pass, полный membership-gated protected index и readable Ben sidecar без first-open dependency |
| D3 local calibration | Только foreground explicit completion `30s–90m`; ready при `5 observations / 3 revision hashes / 2,500 tokens`; latest 12/8 KiB, median+IQR range, stale/unstable states, disable/reset без canonical writes |
| D4 typed provenance | Независимые `curated/asserted/derived/unknown` signals; audio/register/period/difficulty/familiarity/reason не заимствуют authority; group presenter больше не придумывает TTS/revision |
| D5 deterministic reasons | Versioned priority ladder и видимый reason; нет LLM, 70/90/95/98 readiness bands, comprehension/CEFR promise или opaque weighting |
| D6 budgets/matrix | Контрактные, browser, i18n, cache, migration и Agent gates зелёные; общий owner smoke/iPhone Safari layout имеет PASS/PARTIAL evidence, но Android/NVDA/VoiceOver/TalkBack и полные offline/focus сценарии остаются отдельной обязательной матрицей |

## Архитектурная граница

- `learning-compass-core.js` — pure buckets, statuses, provenance, reasons и
  calibration math; не читает DB и не делает network calls.
- `learning-compass-worker.js` — локальный conservative Hebrew analysis с
  token/type caps; возвращает агрегаты, не body.
- `learning-compass-ingredients.js` — один pure/UMD lexical producer для
  browser Worker и server Worker; исключает расхождение resolver semantics.
- `groupCorpusLearningIndexWorker.js` + `groupCorpusRepo.getLearningIndex()` —
  membership-gated full protected index, exact corpus/work/SHA signature,
  single-flight build, immutable derived sidecar и packets `<=256 KiB`.
- `local-db.js` — одна learner projection и один ingredient batch на текущий
  page; compact schema `2.0.1` сохраняет семантическую эквивалентность и
  прежний `48 / 256 KiB` packet budget; derived cache не является
  learner/content truth.
- `library-ui.js` — card stays usable при pending/stale/unsupported/failure;
  максимум два visible B7 signals, structured details, keyboard reset/disable.
- Agent `get_text_coverage` и group coverage используют ту же v2-семантику.
  Это versioned response evolution; оно не создаёт network dependency Room.
- Service Worker/Studio/Room version согласованы на production `3.11.372`;
  activation semantics B6 не ослаблены.
- B6 history continuity сохраняется: non-presentation open заранее ставит
  `touchOpened` в очередь до фоновых body reads; Reader bar height синхронизирует
  sticky table offset через `ResizeObserver` при появлении/скрытии B7 chip.

## Engineering evidence ledger

- B7 + frozen B6/B0–B5 unit contract: `39/39`.
- B7 responsive/status/privacy/browser-copy/cold-library smoke: `145/145`,
  включая 115-text self-preparation without Reader, 48-card DOM ceiling,
  real-size compact packet fixture, desktop details paint/hit-test и
  exact/limited compact copy.
- Matrix: `320/360/380/430/510/1280/1366`, EN/RU/HE-RTL, light/dark, reduced
  motion and simulated 200% zoom; inspected RU 380 and HE/RTL 360 artifacts.
- Across the matrix: `0` horizontal overflow, `0` fabricated zero, `0`
  telemetry requests, `0` page errors, maximum `2` card signals, `549` DOM
  nodes in the bounded fixture.
- Synthetic real-size cached page batch: `48/48`, `230,631 B`, tuple storage;
  production owner packet: `48/48`, `255,442 B` из `262,144 B`. Earlier small
  fixture timing remained local-lab evidence, not a field distribution.
- Reset and disable preserve exact `review_log`, `word_status` and
  `text_progress` fixture rows.
- B6 targeted regression: `45/45`.
- B0–B5 responsive/browser regression: `838/838`.
- Agent Access: text coverage `74`, group corpus `42`, domain `50` checks.
- i18n `233/233`; memory canon/FSRS `79/79`; canon version `18/18`; legacy
  corpus vocab engine `37/37`.
- `node --check` and scoped `git diff --check`: PASS.
- Финальный `3.11.372` rerun: B7 unit `46/46`, browser matrix `161/161`, cloud
  sync `32/32`, i18n `233/233`, memory canon/FSRS `79/79`, canon version
  `18/18`.

Durable automation evidence:
[`docs/research/room-ux-b7-learning-compass/2026-08-12/automation/`](../research/room-ux-b7-learning-compass/2026-08-12/automation/).

Follow-up three-corpus evidence (`159/159`, включая 380px Ben rail disclosure):
[`docs/research/room-ux-b7-learning-compass/2026-08-13/follow-up/automation/`](../research/room-ux-b7-learning-compass/2026-08-13/follow-up/automation/).

Full readable-corpus preparation candidate evidence (`161/161`, protected
API/UI, B6 `45/45`, Lighthouse Accessibility `100`):
[`docs/research/room-ux-b7-learning-compass/2026-08-13/corpus-preparation/`](../research/room-ux-b7-learning-compass/2026-08-13/corpus-preparation/).

Final corpus-finishing production evidence (`3.11.372`, ten served assets,
three corpora, canonical before/after and operations read-back):
[`docs/research/room-ux-b7-learning-compass/2026-08-13/corpus-finishing/`](../research/room-ux-b7-learning-compass/2026-08-13/corpus-finishing/README.md).

## Production, owner-profile and owner-smoke read-back

- Initial owner-profile evidence was recorded on `3.11.363`; compact-copy
  follow-up shipped in `3.11.364`; cold-library and exact-packet hardening are
  live on `3.11.366`.
- `3.11.366` committed-vs-served SHA-256 equality: `9/9` for Room HTML,
  `library-ui.js`, core, Worker, LocalDb, SW and RU/EN/HE locales.
- `/healthz`: DB and migrations ready in three samples. Deploy build-cache
  cleanup removed `1.837 GB` without deleting containers, volumes or images;
  root moved `96% → 92%` and then read `91%`. `disk_warn=true` remains an
  explicit ops risk.
- Clean isolated Chromium at 380 px: exact version, no UI error, no horizontal
  overflow or clipped B7 signal; only expected anonymous `401` auth probes.
- Owner «Мои тексты» on `3.11.366`: background preparation reached `115/115`
  without opening Reader; DOM stayed at 48 cards; visible
  `not prepared/pending = 0`; no overflow/error.
- The exact owner page packet returned `48/48`, `255,442 B`, schema `2.0.1`,
  stale/invalid = 0. «Больше знакомых» remained selected on the first attempt
  with no preparing fallback toast. One rank-eligible item led the page; 47
  `AVAILABLE_LIMITED` items stayed neutral per the approved uncertainty rule.
- Owner «Учебные песни»: `48/77` first-page cards, `48/48` Compass details,
  details paint/hit-test `3/3`, exact partial-audio count and honest unknown
  audio provenance, `0` fabricated zero/overflow/error.
- Before/after the `3.11.366` read-only owner flow, counts and SHA-256 were
  identical for `review_log`, `word_status`, `text_progress` and the complete
  `texts` table. No Reader, grade/review, word-status action, calibration
  reset or disable was invoked.
- Owner-reported production smoke on `3.11.363`: PASS. The supplied iPhone
  Safari screenshot exposed only the B7 copy-density issue; the `3.11.364`
  follow-up replaces the visible RU badge with `Не менее X% знакомы`, with
  corresponding compact EN/HE strings. Automation at RU 380 and HE/RTL 360
  records `0` clipping and preserves details/provenance.

Durable initial `3.11.363` production evidence:
[`PRODUCTION_READBACK_EVIDENCE.json`](../research/room-ux-b7-learning-compass/2026-08-12/automation/PRODUCTION_READBACK_EVIDENCE.json).

Cold-library `3.11.366` production evidence:
[`PRODUCTION_READBACK_EVIDENCE.json`](../research/room-ux-b7-learning-compass/2026-08-13/automation/PRODUCTION_READBACK_EVIDENCE.json).

### Follow-up production read-back: `3.11.367`

- Release commit: `70dcffdc`; direct no-store version and Room footer both
  `3.11.367`.
- Committed-vs-served SHA-256 equality: `8/8` changed shell assets (`index`,
  Room HTML, `library-ui`, presenter, SW, RU/EN/HE). Locale comparison uses Git
  blob bytes because the Windows worktree exposes CRLF while committed/prod
  bytes are LF.
- `/healthz`: `3/3` samples `ok`, DB ready, migrations ready; disk `86%`.
- Owner-profile read-only My Texts: `48/48` visible signals and details,
  readiness `115/115`; no old «зафиксировано знакомыми» copy. The actual
  familiarity sort promoted the one `AVAILABLE/rank_eligible` item and kept
  `47` limited items neutral, as required by D1.
- Owner-profile read-only Study Songs: `48/48` signals/details; `1`
  `AVAILABLE_LIMITED`, `47` actionable `NOT_PREPARED`; every cold detail says
  unknown provenance and first-open local preparation. Card paint issued only
  the catalog GET, `0` protected work-body fetches.
- Owner-profile read-only Ben-Yehuda: compact rail disclosure is present,
  viewport-contained and Escape-closeable; bounded result page rendered `60`
  rows with `12` lazy B7 details (`1 AVAILABLE`, `11 AVAILABLE_LIMITED`) and
  exact bucket/provenance lines.
- Whole traversal made `0` non-GET requests, `0` content uploads and `0`
  telemetry requests. Before/after rows and SHA-256 are identical for
  `review_log` (`7,200`), `word_status` (`5,371`), `text_progress` (`89`) and
  `texts` (`222`); Reader never opened.
- This is desktop Chromium/Kapture production evidence, not a new physical
  iPhone/Android, NVDA, VoiceOver or TalkBack acceptance claim.

### Full-corpus preparation release candidates: `3.11.368` → `3.11.369`

- Local automation prepares `115/115` My Texts without Reader and all `796`
  readable Ben-Yehuda works before selection; protected fixture proves every
  catalog work prepared, reordered `90% → 60% → 20%`, and `0` protected body
  GETs during card paint.
- Protected sidecars are proactively prewarmed after migrations; an exact-
  revision request build remains only a fallback for a corpus changed after
  process start. The API accepts OWNER/MEMBER, denies anonymous/revoked access, emits no
  title/body/translation, uses `private, no-store`, exact revision binding and
  `<=256 KiB` packets.
- Responsive group UX passes at `380/510/1280`; the long shared sort label is
  fully visible at 380 px.
- `3.11.369` closes the limited-only edge found during owner-profile readback:
  when no work is reliably rank-eligible, the selector returns to the prior
  order and gives a localized explanation instead of silently accepting a
  no-op sort. Lower-bound card facts remain available for manual selection.
- Chrome mobile Lighthouse improved from `93` to `100` after fixing footer
  contrast/targets; dynamic/hidden form controls now have names and labels.
  This remains automation, not physical screen-reader evidence.
- Production `3.11.369` passed deployment, health/DB/migrations and `7/7`
  changed-asset Git-blob read-back. Startup prewarm logged `1/1` protected
  corpus and `77` works.
- Owner-profile read-only production traversal without Reader confirmed My
  Texts `115/115`, Study Songs `77/77` and Ben-Yehuda `796/796` readable.
  Study Songs used five index GETs and zero protected body GETs; the all-limited
  owner profile reverted the no-op sort to library order and exposed the
  localized explanation. My Texts and Ben-Yehuda retained the shared sort when
  rank-eligible results existed.
- Before/after counts and SHA-256 remained identical for `review_log` (`7,200`),
  `word_status` (`5,371`), `text_progress` (`89`) and `texts` (`222`). Exact
  evidence is in
  [`PRODUCTION_READBACK_EVIDENCE.json`](../research/room-ux-b7-learning-compass/2026-08-13/corpus-preparation/PRODUCTION_READBACK_EVIDENCE.json).

### B7 corpus finishing production line: `3.11.370` → `3.11.372`

Owner review of the complete three-corpus experience found four cross-surface
gaps which belong to B7 rather than a later visual lane:

- all three corpus presenters now emit one explicit audio-coverage contract.
  The only visible forms are localized equivalents of `Audio full N/N`,
  `Audio partial N/N`, and `Audio unavailable`; the former duplicate
  `Audio is partial` caveat is removed. My Texts derives bounded integer counts
  in the B6 page query rather than loading media passports during card paint;
- card identity, evidence and recommendation-copy alignment follows the UI
  locale. In RU/EN the copy starts at the left even when the work title is
  Hebrew; HE/RTL keeps the mirrored reading order. The primary action remains
  a separate trailing control;
- Learning Compass disclosures are single-open. Pointer-down outside closes
  them, opening another closes its peer, and `Escape` closes the latest panel
  and restores focus to its summary control;
- cloud reconciliation no longer advances the upload cursor past a rejected
  `review_log` row. A count mismatch clears upload, download and cutover
  cursors, retries the idempotent union, propagates a failed heal, invalidates
  word-state/Compass projections, and also runs after `pageshow`, `online` and
  window focus. It never synthesizes a grade, mark or review event.

The owner fixture `Кфар Аза - 2 544/573` provides an exact audit example:

- eligible token denominator `3,945` = familiar `1,107` + explicitly new
  `1,679` + untracked `61` + unresolved `1,098`; another `37` ignored tokens
  are excluded from the denominator;
- the displayed lower bound is `1,107 / 3,945 = 28.0608%`, rounded to `28%`.
  It measures recorded familiar occurrences, not comprehension;
- `Новых слов: 479` is a different, deliberately non-additive inventory:
  distinct confidently resolved learnable lemmas that are new or unset,
  after grouping repeated inflections. It is neither an occurrence count nor
  `3,945 - 1,107`. Both surfaces now expose localized help for this distinction.

The first `3.11.370` production read-back correctly stopped on `13` legacy
Room Training rows with `meta_key:word_only` instead of silently advancing the
cursor. That exposed a pre-existing server/client contract drift: the local
canonical writer records bounded `word_only` and `training_stage` provenance,
but server `META_ALLOW` did not yet accept those non-content fields.
`3.11.371` aligns the ingest allowlist and adds integration/static regressions.
Its read-back then proved that the original rejection result itself remained
cached under the deterministic batch key. `3.11.372` versions that envelope
key and stops caching future row-level rejection results; accepted event IDs
remain the idempotency authority. Both failed attempts left the server count
unchanged and created no local row.

Final gates: B7 browser matrix `161/161`, frozen B0–B6 contracts `46/46`, cloud
sync `32/32`, i18n `233/233`, memory canon/FSRS `79/79`, canon version `18/18`,
plus RU desktop/380 px and HE/RTL 360 px visual read-back.

Production `3.11.372` then passed independent served-byte and owner-profile
read-back:

- app/footer/cache triad is `3.11.372`; all ten checked browser assets equal
  their Git blobs; three post-cleanup health samples returned `200`, app/DB/
  migrations ready;
- without opening Reader, My Texts reached `115/115`, Study Songs `77/77` and
  Ben-Yehuda `796/796`; the shared reliable-familiarity sort is present in all
  three. Study Songs correctly reverts the all-limited no-op selection with an
  explanation, while rank-eligible My Texts and Ben-Yehuda results retain it;
- exact audio labels are consistent, the duplicate partial-audio caveat is
  absent, RU card/hero copy remains left-start for Hebrew titles, and details
  close on peer open, outside pointer-down and `Escape` with focus return;
- Study Songs issued five bounded index GETs and zero protected body GETs;
  the complete traversal made no non-GET request;
- counts and SHA-256 remained identical before/after for `review_log` (`7,282`),
  `word_status` (`5,387`), `text_progress` (`90`) and `texts` (`222`). Cloud
  count and both sync cursors also equal `7,282`;
- safe operations cleanup reduced root disk use `97% → 82%` while retaining
  the active and immediate rollback images and removing no container/volume.
  `disk_warn=true` remains a recorded operational warning.

Exact machine-readable evidence:
[`PRODUCTION_READBACK_EVIDENCE.json`](../research/room-ux-b7-learning-compass/2026-08-13/corpus-finishing/PRODUCTION_READBACK_EVIDENCE.json).

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
`3.11.372`. После owner physical/AT PASS или явных documented exceptions
подготовить B7 closure; только затем начинать новый research-only goal B8
Reading Journey.
