# Reading Room B7 — Learning Compass 2.0 Decision Packet

**Дата:** 2026-08-12

**Статус:** `OWNER GO / IMPLEMENTED / ENGINEERING PASS / OWNER GENERAL SMOKE PASS / PHYSICAL-AT PARTIAL`

**Программа:** Reading Room B7 из B6–B9 handoff

**Canonical handoff:**

[`ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md`](./ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md)

**Closed predecessor:**

[`ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md`](./ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md)

**Research baseline:** `main@6a2e80a1`

**Implementation:** `main@845ddc71`; production finishing `04f88328`, `85bdc9de`;
cold-library/packet hardening `1298bb71`, `73e74a37`; full-corpus preparation
`d97930a8`; limited-only sort UX `86f5189c`

**Production release:** `3.11.369` (served-byte/health and owner-profile
read-only evidence; general owner smoke and physical/AT evidence remain
separately classified)

**Historical production snapshot inherited from B6:** `3.11.360`

**Evidence:**
[`docs/research/room-ux-b7-learning-compass/2026-08-12/`](../research/room-ux-b7-learning-compass/2026-08-12/README.md)
and
[`docs/research/room-ux-b7-learning-compass/2026-08-13/corpus-preparation/`](../research/room-ux-b7-learning-compass/2026-08-13/corpus-preparation/README.md)

---

## 0. Решение в одном абзаце

B7 следует реализовывать как локальный, детерминированный и проверяемый
Learning Compass: один `recorded-familiarity-v2` contract для Ben-Yehuda, My
Texts и доступных group editions; версия анализа и точные buckets вместо
псевдо-точного `0%`; индивидуальное время только после `5×3×2500` качественных
локальных наблюдений и только диапазоном; отдельная typed provenance на
register/period/audio/difficulty/coverage/reason; объяснимый reason ladder без
LLM и без обещаний, что `95/98%` означает понимание. Card paint остаётся
bounded B6: никаких 48 body reads, group mass-prefetch или второго learner
store. До owner approval продуктовый код не меняется.

Запрашиваемое approval:

```text
APPROVE B7-R: D1=shared-recorded-familiarity-v2;
D2=local-derived-cache+materialized-group-only;
D3=5x3x2500-local-calibration;
D4=typed-field-provenance;
D5=deterministic-reasons+no-threshold-promise;
D6=packet-budgets+full-physical-matrix.
```

---

## 1. Неподвижная граница

B0–B5 закрыты в
[`ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md`](./ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md),
B6 закрыт в predecessor выше. B7 **не переоткрывает**:

- Learning Home IA, 48-card browse window, cursor/exact-total и history state;
- narration, discovery/genre, cover/reveal, continuity, offline/SW semantics;
- LocalDb/FSRS/word-state/review/grading learner truth;
- progress, notes, bookmarks, vocabulary writers;
- operational local diagnostics и production RUM decision;
- B8 Reading Journey, B9 Curated paths или Visual finishing.

Постоянный stop list:

- не создавать второй learner/profile store и не выводить знание из
  навигации, скролла или самого факта открытия;
- не читать/скачивать все bodies ради карточек;
- не отправлять text content, learner state или raw reading behavior в
  telemetry;
- не превращать unavailable/empty/stale в `0%`;
- не называть lexical coverage пониманием, CEFR или гарантией готовности;
- не добавлять opaque AI/LLM recommender;
- не называть automation доказательством физического устройства или AT.

## 2. Линзы решения

Приоритетны R1 (pedagogical honesty), R4 (mobile/a11y), R5 (offline trust), R6
и R9 (source/access provenance), R11 (do-no-harm), R12 (одна истина и bounded
scale), R13 (migration evidence), R15 (privacy/lifecycle), R16 (ресурсные
бюджеты), R17 (проверяемая рекомендация).

Следствия:

1. Familiarity — наблюдаемый lower bound по canonical learner states, не
   модель понимания.
2. Один pure core вычисляет buckets; source adapters только доставляют
   ingredients и entitlement.
3. Missing evidence остаётся missing. `unknown → derived` запрещён.
4. Персонализация не имеет права делать Room network-dependent.
5. Reason виден пользователю и воспроизводится без модели.
6. Калибровка чтения может быть удалена/сброшена без изменения progress или
   learner truth.

## 3. Research-only recon: что требует решения

| ID | Severity | Наблюдение | Следствие B7 |
|---|---|---|---|
| P1 | P0 honesty | browser показывает `known/matched`, а Agent Access имеет другой denominator и buckets | нужен один versioned semantic core |
| P2 | P0 honesty | empty profile, unsupported, stale и настоящий zero не различаются | typed eligibility/status обязателен |
| P3 | P0 provenance | coarse confidence fallback превращает unknown в `derived-soft` | provenance только per field, fail closed |
| P4 | P0 access | group catalog не содержит body, body membership-bound | только current materialized edition, без mass-prefetch |
| P5 | P1 scale | My Texts card page намеренно не содержит body | локальный ingredient cache/Worker, не paint-time scan |
| P6 | P0 pedagogy | универсальный 95/98 comprehension threshold не подтверждён | процент не обещает понимание/readiness/CEFR |
| P7 | P0 correctness | нет revision-bound foreground reading calibration | time unavailable до qualifying samples |
| P8 | P1 trust | audio может получить default TTS/revision без source evidence | explicit unknown и exact field provenance |
| P9 | P1 UX/a11y | details/tooltip не дают полного доступного explanation contract | keyboard/AT details и restrained live status |
| P10 | Evidence gap | новый B7 UI не проверен на iPhone/Android/AT | отдельная full physical matrix до closure |

Детали, sidecar-метрики и первичные источники находятся в evidence README.

---

## 4. D1 — `shared-recorded-familiarity-v2`

### Рассмотренные варианты

| Вариант | Плюс | Риск | Решение |
|---|---|---|---|
| A. Сохранить browser `known/matched` | минимальный diff | скрывает unresolved share и расходится с Agent Access | reject |
| B. Вызывать Agent Access из Room | уже имеет rich output | нарушает local-first, расширяет content/profile network boundary | reject |
| C. Один pure v2 core + local/source adapters | одна семантика, offline, fixture parity | нужны versioned ingredients/cache/migration | **recommend** |

### Рекомендуемый semantic contract

```js
evaluateRecordedFamiliarityV2({
  ingredients: {
    schema: 'lexical-ingredients-v2',
    contentRevision,
    resolverVersion,
    totalHebrewLexicalTokens,
    tokenFrequenciesByCanonicalKey,
    unresolvedTokenCount,
    properNameTokenCount
  },
  learnerProjection: {
    schema: 'learner-familiarity-projection-v2',
    projectionVersion,
    generatedAt,
    trackedLexemeCount,
    stateByCanonicalKey,
    scheduledKeys
  }
}) -> {
  status,
  reasonCode,
  counts: {
    lexicalTotal,
    familiar,
    explicitNew,
    untracked,
    unresolved,
    ignoredExcluded,
    properNamesExcluded,
    eligibleDenominator
  },
  recordedFamiliarPctLowerBound,
  unresolvedUncertaintyPp,
  rankEligible,
  versions: { resolver, ingredients, learnerProjection }
}
```

### Canonical buckets

Mutually exclusive token buckets:

1. `familiar`: `known`, `learning`, `weak`, `stale`, `l1–l4`, plus a
   canonical scheduled/due item;
2. `explicitNew`: canonical learner state `new`;
3. `untracked`: resolver found a canonical key but projection has no state;
4. `unresolved`: a Hebrew lexical token was not safely resolved;
5. `ignoredExcluded`: canonical state `ignore`, shown separately and excluded
   from numerator/denominator;
6. `properNamesExcluded`: safely classified proper names, separately shown and
   excluded.

No other UI-local state may count as familiarity. B7 does not silently change
adaptive-niqqud or FSRS semantics; those writers/readers remain outside this
slice unless regression evidence creates a separate approved change.

### Percentage and eligibility

```text
eligibleDenominator = familiar + explicitNew + untracked + unresolved
recordedFamiliarPctLowerBound = familiar / eligibleDenominator
unresolvedUncertaintyPp = unresolved / eligibleDenominator × 100
```

Rules:

- unresolved stays in the denominator; the displayed result cannot improve
  merely because the resolver abstained;
- `trackedLexemeCount = 0` gives `NEEDS_PROFILE`, never `0%`;
- a true `0%` is allowed only for a valid non-empty projection and a non-empty
  eligible denominator;
- exact `N%` is allowed when unresolved uncertainty is zero; otherwise copy is
  lower-bound (`не менее N%`) with exact unresolved count/share in details;
- personalized ranking is allowed only when unresolved uncertainty is
  `≤5 percentage points`; above it the signal can be shown as limited evidence
  but cannot drive ordering;
- `5 pp` is an engineering uncertainty budget, not a comprehension threshold;
- no `70/90/95/98%` pedagogical bands ship in B7. Relative ordering within an
  eligible cohort is allowed, with a visible reason.

### Status state machine

| Status | Meaning | UI behavior |
|---|---|---|
| `AVAILABLE` | valid profile, current ingredients, uncertainty within budget | percentage/lower-bound + details; may rank |
| `AVAILABLE_LIMITED` | current analysis but uncertainty over rank budget | show caveat/counts; do not personalize rank |
| `NEEDS_PROFILE` | no canonical tracked learner evidence | invite normal learning use; no percentage |
| `NOT_PREPARED` | supportable source but no current local ingredients | neutral “анализ ещё не подготовлен”; optional explicit prepare/open |
| `PENDING` | bounded Worker job is running | non-blocking status; card remains usable |
| `STALE` | content/resolver/projection version mismatch | do not show stale percentage; recompute locally when allowed |
| `UNSUPPORTED` | source/content exceeds contract or has no safe adapter | visible reason, no retry loop/fake zero |
| `UNAVAILABLE` | local DB/cache/runtime failure | recoverable error copy; no learner inference |

### D1 approval effect

Approval freezes the B7 semantic source of truth and its fixture parity across
Room source adapters and Agent Access presentation. It does not authorize a
learner-state migration or change to review/reading behavior.

---

## 5. D2A — full readable-corpus preparation

### Source support matrix

| Source/state | Coverage support after B7 | Ingredient authority | Forbidden behavior |
|---|---|---|---|
| Ben-Yehuda ready v7 | yes | baked public sidecar bound to work/revision/resolver | frozen personalized percentage in asset |
| My Text current local revision | yes after local preparation | Worker-derived cache keyed by content hash + resolver | reading all bodies during card paint |
| My Text missing/stale cache | background `PENDING`, then current result | full local Worker queue may recompute through B6 scale `5,000` | fake zero, first-open dependency or network upload |
| Group current catalog + valid membership | yes before Reader | proactively prewarmed content-free server sidecar plus local learner projection, exact revision-bound | protected body fetch during card paint or reuse after edition change |
| Group offline | yes only from a complete cached exact-revision derived index; otherwise honest unavailable state | local derived cache | partial/fabricated ranking or hidden first-open dependency |
| Revoked/foreign group edition | unsupported/inaccessible | cache purge/invalidate | stale personalized disclosure |
| Non-Hebrew/empty/over-cap source | `UNSUPPORTED` with reason | none | silent partial result |

### Cache contract

```js
{
  schema: 'room-lexical-ingredient-cache-v2',
  sourceClass,
  opaqueSourceKey,
  contentRevision,
  contentSha256,
  entitlementRevision: null | string,
  resolverVersion,
  tokenCounts,
  canonicalKeyFrequencies,
  unresolvedCounts,
  builtAt,
  lastUsedAt
}
```

Properties:

1. Cache is derived/discardable, never canonical content or learner truth.
2. It contains no title, raw body, translation, notes, learner ID, or timing.
3. Build triggers: canonical save/update, explicit first open/prepare, or a
   bounded idle queue; never unbounded app-start analysis.
4. Card paint reads one batch of compact ingredients for the current 48-card
   window plus one learner projection, not 48 bodies/projections.
5. Group entry is readable only while current membership and exact edition
   binding remain valid. Revocation/change invalidates it.
6. LRU bounds: maximum `1,000` entries and `64 MiB`; version mismatch and
   source deletion purge lazily and deterministically.
7. Per-item input caps: `250,000` lexical tokens and `50,000` canonical types;
   over-cap is explicit `UNSUPPORTED_CONTENT_LIMIT`.
8. No schema/index migration before an R13 query/storage probe proves it is
   required. A new store, if needed, is isolated and recoverable.

### D2 approval effect

Approval enables honest My Texts and downloaded/current group coverage without
weakening B6 browse or group access boundaries. It does not authorize corpus
downloads, protected sidecars, or server processing.

---

## 6. D3 — `5x3x2500-local-calibration`

### Рассмотренные варианты

| Вариант | Плюс | Риск | Решение |
|---|---|---|---|
| A. Global/default WPM | immediately available | false precision; ignores L2/genre/person | reject |
| B. Existing heartbeat/open-close wall clock | little new code | not revision/span/completion bound; orphan inflation | reject |
| C. Bounded local qualifying ledger | individual and auditable | needs several completed observations | **recommend** |

### Qualifying observation

One sample is accepted only when all are true:

- exact `contentRevision`, `resolverVersion`, and eligible token count exist;
- at least `100` eligible tokens are covered by the completed span;
- the reader/session explicitly reaches the existing completion boundary;
- accumulated time is only while the page is visible and the reader is in the
  foreground; `hidden`, `pagehide`, explicit pause, and audio-only periods are
  excluded;
- active duration is `30 seconds–90 minutes`; lifecycle gaps are not filled;
- no pointer/scroll activity is required, preserving keyboard and AT reading;
- the sample has no content/title/source ID and cannot write progress/review.

Multiple foreground sessions may accumulate toward one exact revision/span;
only the final completed observation enters calibration. Reopening or scrolling
alone never marks completion.

### Readiness gate and estimate

Calibration becomes `READY` only after:

- at least `5` qualifying observations;
- at least `3` distinct content revisions;
- at least `2,500` eligible tokens in total.

The ledger retains only the latest `12` qualifying samples. Each sample stores
an opaque random sample ID, content-revision hash, token count, active
milliseconds, modality, completion timestamp, and resolver version. Raw events,
titles, text, word states, exact row trails, and learner identifiers are
forbidden.

Estimate algorithm:

1. calculate seconds per eligible token for each sample;
2. use median as the center and interquartile range as observed spread;
3. for fewer than eight samples, enforce at least `±25%` around the median;
   thereafter enforce at least `±20%`;
4. multiply by target eligible tokens and round the interval outward to whole
   minutes;
5. if the evidence is stale (all samples older than 180 days), versions are
   incompatible, or dispersion exceeds `3×` from lower to upper pace, return
   `CALIBRATION_STALE` / `CALIBRATION_UNSTABLE` instead of a precise estimate.

The numbers above are product engineering safeguards, not scientific claims
about reading ability. UI says “примерно 7–10 мин по вашим завершённым
чтениям”, never “вы прочитаете за 8 минут”. Before readiness it shows neutral
length/audio facts or “нужно ещё N завершённых чтений для оценки”. Exact audio
duration remains a separate asserted signal.

### Privacy/lifecycle

- local-only, default-on only as a local product feature; no RUM, sync,
  export, learner ingest, server log, or diagnostic-ring reuse;
- owner can disable and reset calibration; reset deletes the ledger and card
  estimate without changing progress/history/vocabulary;
- storage cap: 12 samples, maximum 8 KiB serialized;
- any future sync/telemetry is a new owner/privacy decision, default-off.

### D3 approval effect

Approval authorizes the calibration contract and minimum evidence, not the
display of a time estimate before the gate is met.

---

## 7. D4 — `typed-field-provenance`

### Contract

Every Compass signal is independent:

```js
{
  kind: 'recorded-familiarity|reading-time|register|period|audio|difficulty|reason',
  status: 'available|limited|unknown|not-prepared|stale|unsupported|unavailable',
  value: null | object,
  reasonCode: string,
  caveatCodes: string[],
  provenance: {
    authority: 'curated|asserted|derived|unknown',
    sourceId: null | string,
    sourceRevision: null | string,
    contentRevision: null | string,
    methodVersion: null | string,
    learnerProjectionVersion: null | string,
    updatedAt: null | string
  }
}
```

Precedence for the same field is `curated > asserted > derived > unknown`, but
only with matching current revisions. One field never lends its authority to
another. Unknown remains unknown.

### Field-specific rules

| Field | Allowed authority | Required detail | Explicitly forbidden |
|---|---|---|---|
| Familiarity | derived | numerator/denominator/buckets + resolver/profile versions | comprehension/CEFR claim |
| Reading time | derived | sample counts/token total/range/calibration age | global WPM disguised as personal |
| Register | curated/asserted/derived | source/rule revision and derived caveat | inference from title/tag without label |
| Period | curated/asserted/derived | catalog/author map + confidence/method version | collapsing author era into exact work date |
| Audio | asserted/curated | kind, coverage count, exact revision/duration if present | default TTS or invented revision |
| Difficulty | curated/asserted/derived | dimension: course level, lexical load, or personal familiarity | one blended “level” with hidden formula |
| Recommendation reason | derived/curated/asserted | stable reason code and facts used | free-form opaque model output |

Legacy era/register mappings may continue only as visibly `derived` with their
exact rule version. A future editorial correction overrides the derived value
without rewriting the source body.

### Accessible disclosure

- the card shows one concise primary reason;
- a real button opens structured details with programmatic name, keyboard
  operation, focus return, and logical RU/EN/HE/RTL order;
- `title` alone is forbidden;
- pending updates use a restrained status region and do not announce every
  card independently;
- unknown/not-prepared copy is useful and neutral, not an error-colored score.

### D4 approval effect

Approval removes the coarse fallback as a B7 authority and freezes the
per-field audit contract. It does not require an editorial CMS or a rewrite of
existing corpus catalog data.

---

## 8. D5 — `deterministic-reasons+no-threshold-promise`

### Reason ladder

The ranking/reason engine is deterministic and versioned. At most one primary
reason appears on a card; details show the secondary facts used.

| Priority | Stable reason | Required evidence |
|---:|---|---|
| 1 | `CONTINUE_READING` | canonical existing progress, not inferred activity |
| 2 | `GROUP_ASSIGNMENT` | current assignment authority/membership/due fact |
| 3 | `RECORDED_FAMILIARITY_FIT` | D1 `AVAILABLE` and uncertainty ≤5 pp |
| 4 | `CURATED_START` | curated pathway/start marker |
| 5 | `ASSERTED_LEVEL_MATCH` | source-asserted level + canonical learner level |
| 6 | `DERIVED_LEXICAL_LOAD` | versioned intrinsic load, not personal comprehension |
| 7 | `AUDIO_OR_LENGTH_FIT` | exact audio/length facts |
| 8 | `NEUTRAL_CATALOG_ORDER` | no defensible personalized reason |

Rules:

- progress/assignment authority preempts derived attractiveness;
- ranking may compare exact lower bounds only within the same current semantic
  version and eligible cohort;
- `AVAILABLE_LIMITED`, `NEEDS_PROFILE`, `NOT_PREPARED`, and `STALE` never drive
  personalized ordering;
- no “ideal”, “легко”, “готово”, “поймёте” solely from a percentage;
- no universal `70/90/95/98` comprehension/readiness bands;
- no LLM/model call, prompt, BYOK dependency, remote feature generation, or
  uninspectable weighting;
- if facts tie or disappear, deterministic source/catalog order remains.

Recommended user-facing distinction:

- `Не менее 76% знакомы` — compact visible recorded lower bound; exact counts and provenance remain in details;
- `8% слов пока не удалось уверенно сопоставить` — resolver uncertainty;
- `Подходит по отмеченным знакомым словам` — reason, only rank-eligible;
- never `Вы поймёте 76% текста`.

### D5 approval effect

Approval freezes explainable priority and copy boundaries. It does not approve
AI-generated recommendations, lessons, quizzes, or B9 paths.

---

## 9. D6 — `packet-budgets+full-physical-matrix`

All numbers below are **proposal acceptance budgets**, not achieved results.
B6 budgets remain binding and may not be weakened.

### 9.1 Correctness and parity

- golden fixtures cover every bucket/state/status, including empty profile,
  true zero, `ignore`, scheduled/due, unresolved Hebrew ambiguity, stale
  versions, deleted My Text, changed/revoked group edition, and over-cap input;
- Room Ben/My/group and Agent Access presentation return identical D1 counts
  for identical ingredients/projection fixtures;
- `review_log`, `word_status`, FSRS schedule, progress, notes, bookmarks, text
  body, media, and material revision checksums remain unchanged after browse,
  analysis, calibration reset, offline, and failure gates;
- cache deletion/rebuild produces the same result; corrupted cache fails closed
  to `NOT_PREPARED/UNAVAILABLE`, never stale percentage;
- no fabricated audio kind/revision, no unknown-to-derived fallback;
- RU/EN/HE strings and RTL ordering pass canon-version/i18n gates.

### 9.2 Scale and performance

- preserve B6: page size `≤48`, hard API max `96`, card payload `≤256 KiB`,
  visible cards `≤48`, DOM ceiling `2,438`;
- card paint performs `0` full-body reads and `0` group content fetches;
- per page: at most `1` batch ingredient-cache read and `1` canonical learner
  projection read; no per-card DB/profile query loop;
- B7 ingredient batch for 48 cards `≤256 KiB`; cached 48-card projection on
  reference desktop p50 `≤100 ms`, p95 `≤250 ms`; all cached B7 enrichments
  settle p95 `≤500 ms` without blocking the usable page;
- no main-thread task `>50 ms`; analysis runs in Worker, yielding/chunking so
  UI input remains responsive;
- mobile concurrency `1`, desktop concurrency maximum `2`; foreground reader
  and canonical writes preempt background analysis;
- per item `≤250k` lexical tokens and `≤50k` canonical types; larger input is
  explicit unsupported, not truncated silently;
- cache maximum `1,000` entries / `64 MiB`; calibration `12` samples / `8 KiB`;
- 1k/5k My Texts browse retains exact total/tail search and B6 query budgets;
  B7 analyzes only current/changed/explicit/bounded-idle items, never all 5k at
  startup;
- after controlled GC, 20 open/filter/back cycles retain `≤10 MiB` total B6
  budget and no detached card/Worker trees; B7 incremental retained objects are
  identified separately in the heap diff.

### 9.3 Offline, access, privacy, and failure

- Ben and prepared My Text coverage remain available warm offline;
- unmaterialized group item offline says `NOT_PREPARED/OFFLINE`, without empty
  card truth or retry storm;
- group membership/edition check gates read and invalidates on revoke/change;
- no text/title/source ID/learner ID/state/raw timing enters B6 diagnostics,
  network, RUM, URLs, history, console, or server logs;
- calibration disable/reset read-back proves deletion and zero changes to
  canonical stores;
- quota, Worker crash, corrupt cache, resolver load failure, and page eviction
  leave cards usable with an honest state;
- service worker/version/deploy changes, if implementation eventually needs
  them, use a separate serialized Room+Studio deployment gate; none are
  authorized by research approval alone.

### 9.4 Automated visual/interaction matrix

Before physical acceptance:

- widths `320, 360, 380, 430, 510, 1280`, plus desktop `200%` zoom;
- RU, EN, HE/RTL; light and dark; reduced motion; text zoom;
- keyboard-only route/card/details/reset flow; deterministic focus return;
- pending/available/limited/needs-profile/not-prepared/stale/unsupported/error;
- no clipping, horizontal scroll, logical-order inversion, tooltip-only facts,
  focus loss, duplicate live announcements, or target regression;
- automated axe/semantic/contrast/tap-target checks are recorded as automation,
  not physical/AT proof.

### 9.5 Required physical and assistive matrix

| Environment | Scenarios | Evidence class |
|---|---|---|
| iPhone Safari + standalone PWA + VoiceOver | browse, details, pending→available, offline prepared/unprepared, calibration copy/reset, RTL | physical owner-device + AT manual |
| Android Chrome/PWA + TalkBack | same, plus Worker/quota/reconnect behavior | physical device + AT manual |
| Windows 11 Chrome + NVDA | card/reason/status reading order, details, focus return, no announcement storm | assistive manual |
| macOS Safari + VoiceOver | WebKit semantics, details/focus/status, HE/RTL | physical + assistive manual |
| physical keyboard at 200% zoom | complete navigation/reset without pointer | manual |

Each record names hardware/OS/browser/build, installed/served app version,
locale/theme, source/status fixture, expected/actual result, and defects. Owner
acceptance is separate from engineering automation. B7 cannot close with a
generic “mobile checked”.

### D6 approval effect

Approval fixes budgets and the evidence hierarchy. It is not itself evidence
that any physical device or budget has passed.

---

## 10. Proposed implementation sequence after approval

| Slice | Scope | Stop/go boundary |
|---|---|---|
| B7.0 | commit red fixtures for D1 statuses/buckets, source/access, provenance, calibration, privacy/perf/a11y | no product behavior |
| B7.1 | pure recorded-familiarity-v2 core + parity adapters, no card UI | local unit/fixture approval |
| B7.2 | Ben adapter + My/group local Worker/cache and invalidation | local scale/access approval |
| B7.3 | typed card signals/details + deterministic reason ladder | responsive/i18n/a11y beta approval |
| B7.4 | local calibration ledger/range/reset | privacy/integrity beta approval |
| B7.5 | production preflight, served-version verification, physical/AT matrix, owner-live acceptance | B7 closure only |

Deployment is serialized. B8/B9/Visual finishing do not piggyback. A shared
module, schema/index, SW, privacy policy, or production RUM change requires its
own named boundary and evidence.

## 11. Owner decision table

| Decision | Recommended approval | If changed before code |
|---|---|---|
| D1 Coverage semantics | one lower-bound v2 core, exact buckets, no universal bands | provide alternate states/denominator/rank uncertainty |
| D2 Source support | D2A: full local My Texts, membership-gated content-free protected index, all readable Ben works | any wider protected/network boundary requires separate approval |
| D3 Reading time | `5 samples / 3 texts / 2,500 tokens`, local range | provide alternate minimum/range/staleness budget |
| D4 Provenance | typed per-field, `curated > asserted > derived > unknown` | identify fields allowed to omit provenance |
| D5 Recommendation | deterministic ladder, visible reason, no threshold promise/LLM | provide approved priority/copy/model boundary |
| D6 Gates | §9 budgets + full physical/AT matrix | provide replacement numeric budgets/environments |

Recommended approval string:

```text
APPROVE B7-R: D1=shared-recorded-familiarity-v2;
D2=local-derived-cache+materialized-group-only;
D3=5x3x2500-local-calibration;
D4=typed-field-provenance;
D5=deterministic-reasons+no-threshold-promise;
D6=packet-budgets+full-physical-matrix.
```

### Owner amendment 2026-08-13 — full readable-corpus preparation

После production-проверки владелец явно отверг функциональную асимметрию,
при которой protected catalog card становилась оцениваемой только после
открытия Reader, и потребовал единый зрелый UX: в любом доступном корпусе
пользователь должен иметь возможность выбрать знакомый текст до открытия.
Это новое решение заменяет только прежнюю часть D2
`materialized-group-only`; D1, D3–D6 и закрытые B0–B6 не переоткрываются.

```text
APPROVE B7-D2A: mytexts=full-local-background-up-to-b6-5k;
group=membership-gated-content-free-full-index;
benyehuda=full-readable-public-sidecar;
selection=shared-reliable-familiarity-sort-before-open.
```

Границы amendment:

- «полный корпус» означает все реально читаемые работы источника, а не
  catalog-only записи без тела/перевода; для текущего Ben-Yehuda это все
  `796` ready works из каталога `26 455`;
- My Texts выполняет один полный локальный background pass до проверенного B6
  масштаба `5 000`, а не per-card/first-open lazy calculation;
- protected group corpus получает полный revision-bound aggregate sidecar,
  proactively prewarmed after server migrations; выдача остаётся membership-
  gated, а exact-revision request build служит только fallback для корпуса,
  изменённого после старта. Response не содержит title/body/translation,
  learner state или identity, разбит на packets `<=256 KiB` и удаляется из
  local derived cache при потере доступа;
- одинаковая команда `Сначала достоверно знакомые` доступна в Ben-Yehuda,
  My Texts и group corpus; без профиля выбор одинаково отклоняется с явным
  объяснением, а `AVAILABLE_LIMITED` не участвует в персональном ranking;
- card paint не загружает protected bodies и не создаёт canonical learner
  writes. Server sidecar и local ingredient cache остаются derived и
  пересоздаваемыми.

Владелец 2026-08-12 дал явный переход к реализации рекомендованного packet,
а затем отдельно авторизовал production deploy. D1–D6 реализованы в
`main@845ddc71` с production finishing `04f88328`/`85bdc9de`; engineering,
served-byte/health и owner-profile read-only browser evidence прошли на
`3.11.363`. 13 августа owner general production smoke прошёл с одним замечанием
по плотности copy; compact-copy follow-up вошёл в `3.11.364`. Затем
owner-reported cold-library defect был устранён в `3.11.365`, а реальный
packet overflow — без повышения D6 budget — в `3.11.366`. Automation `145/145`;
owner library self-prepared `115/115` without Reader, exact batch returned
`48/48` at `255,442 B`, and canonical hashes remained unchanged. D6
physical/assistive matrix остаётся частично незаполненным gate,
поэтому B7 ещё не закрыт и не имеет GA/closure verdict. Реализованный
контракт и точная граница доказательства записаны в
[`ROOM_UX_B7_LEARNING_COMPASS_2_IMPLEMENTATION_2026_08_12.md`](./ROOM_UX_B7_LEARNING_COMPASS_2_IMPLEMENTATION_2026_08_12.md).

Финальный D2A release `3.11.369` прошёл production read-back: My Texts
`115/115`, Study Songs `77/77`, Ben-Yehuda `796/796` readable без открытия
Reader; одинаковая сортировка присутствует везде. Для реального all-limited
профиля Study Songs no-op сортировка отклоняется с объяснением, пять index GETs
не содержали protected body, а canonical counts/SHA-256 до/после совпали.
Это расширяет engineering/production evidence, но не заполняет physical/AT
матрицу D6.
