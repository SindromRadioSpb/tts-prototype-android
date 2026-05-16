# Changelog

Все заметные изменения в проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/),
версионирование — [SemVer](https://semver.org/).

## [Unreleased]

### v3.4 Product cohesion (in progress — docs/PRODUCT_COHESION_PLAN_v3_4.md)

- **C2 — Create → link → graph loop affordance + backlink badge
  (A-G2 / A-G6).** The note editor's Links panel now has an "Open in
  Knowledge Graph" button that deep-links the graph spotlighting the
  current note (`LinguistProGraph.open({focus:{kind:'note',id}})` →
  graph isolates that node's cluster and focuses it; the graph stays
  read-only). The links count badge gained an outgoing · incoming
  breakdown in its title/aria so backlinks ("N notes link here") are
  discoverable without expanding the panel. Graph plumbing:
  `loader.open(opts)` forwards a `focus` request, consumed once in the
  loaded state via a new read-only `focusNode(id)` renderer method.
  i18n ru/en/he. Pinned by `scripts/notes-ui/graph-loop-smoke.js`
  (5 cases) and wired into the fast matrix. (One transient combined-run
  failure observed in the heavy real-Service-Worker lazyload section —
  the documented pre-existing back-to-back harness flake; lazyload is
  9/9 green in isolation and the loader change is backward-compatible.)

- **C3 + U8 — Onboarding & empty-state teaching (A-G3 / A-G2).** The
  onboarding panel now has a 5th feature line introducing notes +
  `[[…]]` linking + the Knowledge Graph. The IDE Notes-tab empty-state
  (previously a hardcoded English one-liner) is now an i18n'd teaching
  card explaining the create → `[[link]]` → graph loop with a
  one-click "Open Knowledge Graph" affordance. The graph
  `empty_no_notes` / `empty_no_links` states gained an inline 3-step
  mini-guide (copy-only; graph stays read-only). i18n ru/en/he across
  all three surfaces. Pinned by
  `scripts/notes-ui/onboarding-empty-smoke.js` (5 cases); wired into
  the fast smoke matrix.

- **C1 — Inline `[[` autocomplete in the note editor (A-G1).** Typing
  `[[` in the WYSIWYG editor now opens a picker over notes / texts /
  roots by label (read-only candidate search); selecting one inserts a
  visible `[[Label]]` token and remembers its resolved target for the
  editor session. On save those tokens are materialised into real
  `note_links` rows via the existing idempotent `addNoteLink`
  (INSERT OR IGNORE; never deletes; self-loop guarded). Self-contained
  module `public/js/notes-link-autocomplete.js`; no graph changes
  (graph stays read-only); the raw-ID Links panel remains the power
  path for word/sentence/binyan + manual entry. i18n ru/en/he. Pinned
  by `scripts/notes-ui/link-autocomplete-smoke.js` (6 cases:
  picker → insert → collect → save-hook round-trip + phantom-token
  guard); wired into the fast smoke matrix.

- **C6 — Mobile notes pass (A-G7).** The note-editor "Links" add-row
  and template forms now have a `@media (max-width: 640px)` breakpoint:
  the add-row stacks to a full-width column, the kind/target/alias
  inputs lose their inline `max-width` cramp, touch targets are ≥ 40 px,
  and `.v3-notes-tpl-row-double` collapses to one column. Desktop
  layout unchanged. Pinned by `scripts/notes-ui/mobile-notes-smoke.js`
  (5 cases, 414 px + 1280 px control); wired into the fast smoke matrix.

(250K full-hspell под v3.4; v3.3.7 Tier-2 graph UX в backlog,
см. docs/PHASE_PLAN_v3_3_7_GRAPH_UX.md §2)

---

## [3.3.6] — 2026-05-16

### Knowledge Graph View (Direction 14) — shipped

Read-only, lazy-loaded, privacy-preserving knowledge graph over
notes ↔ texts ↔ sentences ↔ roots ↔ words ↔ binyanim.

- **Lazy-load:** only `notes-graph-loader.js` (~1 KB) is eager;
  d3 bundle + data layer + renderer load on first
  `LinguistProGraph.open()`. Classic-view DOMContentLoaded baseline
  unchanged (smoke-pinned ≤ baseline + 200 ms).
- **Vendored d3:** single self-contained esbuild IIFE
  `public/vendor/d3-graph.min.js` (window.d3graph, ~20.8 KB gz;
  d3-force + d3-zoom + d3-selection). sha256-pinned.
- **Service Worker:** new versioned `GRAPH_CACHE`
  (**`GRAPH_CACHE_VERSION = "v3.3.6-1"`**), independent of
  `CACHE_VERSION`. First open populates it; subsequent opens are
  offline-instant; a graph-asset change → bump `GRAPH_CACHE_VERSION`
  → old bucket evicted on SW activate. **Bump this version whenever
  `d3-graph.min.js` or `notes-graph*.js` change materially.**
- **Read-only:** data layer refuses any non-SELECT SQL; no
  edit-from-graph, no node/link creation/deletion.
- **Privacy:** zero fetch/XHR/sendBeacon/telemetry; no `events`
  writes; no research-payload mutation; no new endpoints; no
  `metrics.outcome` fields; `CONSENT_VERSION` stays `1.0`.
- **Accessibility:** SVG `aria-hidden`; always-present structured
  table is the canonical AT path; per-node keyboard nav (arrows /
  Enter / H isolate / R reset); role=status live summary.
- **Mobile:** below 1024 px landscape → premium searchable
  collapsible isolated-cluster cards (not a degraded graph).
- **i18n:** full `graph.*` subtree × ru/en/he.

- **Interaction hardening (drag bug):** node drag no longer pans the
  canvas (d3-zoom `.filter()`), the view no longer yanks on every
  settle (`fitToContent` runs once on initial settle + explicit
  reset only), and tap/drag/double-click are disambiguated (5 px
  threshold; tap = delayed navigate, drag = pin, dbl-click = unpin).
- **UX uplift (v3.3.7 Tier-1, folded in):** hover/focus detail panel
  (`role=status` aria-live), 1-hop neighbour highlight, visible
  pinned 📌 badge, ＋/−/⤢ zoom controls. Tier-2 (desktop node
  search, loading skeleton, filter chips) deferred — see
  `docs/PHASE_PLAN_v3_3_7_GRAPH_UX.md`.
- **Accessibility role decision:** canvas `role="application"` →
  `role="group"`. Forcing screen-reader focus-mode was
  unverifiable; the **structured table is the canonical AT path**
  (automation-pinned) and works without it; sighted keyboard
  arrow-nav is a real keydown handler independent of the role.
  Strictly safer default.
- **Manual screen-reader / real-device posture:** NVDA + VoiceOver +
  real-Android audits are a **pre-real-deployment RECOMMENDATION,
  not a release blocker** (same soft-gate pattern as the v3.3.5
  ulpan item) — automated a11y coverage + the canonical structured
  table stand in for the v3.3.6 tag.

Smoke at release: `smoke:research:fast` = **28 suites ALL GREEN**.
Graph chain `smoke:graph` = lazyload 9 / data 7 / perf 6 / a11y 6 /
mobile 5 / privacy 8 / interaction 7 / ux 5 (= 53 functional) +
visual-regression 31/31 (≤1% pixelmatch; 10 baselines committed).

(250K full-hspell remains под v3.4.)

---

## [3.3.5] — 2026-05-15

**Direction 13 — Calibrated diagnostic quiz.** A third outcome path
alongside self-report и teacher CSV: a 20-item Rasch-calibrated Hebrew
diagnostic that produces normalized 0-100 score + CEFR band (A1..C1) +
measurement SE. Item-level responses NEVER leave the device (HARD
privacy invariant pinned by 18+ smoke cases).

### Added — quiz instrument

- **`public/quiz/ulpan_diagnostic_v1.json`** — 20-item bank, CEFR
  distribution 4/4/5/4/3, trilingual prompts (RU/EN/HE), scoring
  config (Rasch 1PL, linear theta→score, 5 CEFR bands).
- **`scripts/quiz/validate-bank.js`** — schema validator enforcing
  20 items, exact distribution, `^Q\d{2}$` ids, `difficulty_logit ∈
  [-4, 4]`, 4-option uniqueness, monotonic mean difficulty across
  bands. Exit 3 on violation.
- **`docs/QUIZ_ITEM_BANK_DRAFT.md`** — canonical markdown source
  (Premium-alt content adopted after AI pre-review).
- **`docs/QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md`** — preserved historical
  reviewer feedback.
- **`docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md`** — dispatch brief for ulpan
  teacher external sign-off (still pending pre-deployment).

### Added — scoring engine

- **`public/js/quiz-scoring.js`** — Rasch 1PL MLE via Newton-Raphson,
  theta capping at [-3, +3], SE = 1/√info, linear theta→score
  projection, reverse mapping for analysis. Pure JS, no deps,
  browser+Node CommonJS compat.
- **`scripts/quiz/__fixtures__/mirt-reference.json`** — 100 synthetic
  respondents (Mulberry32 seed 0x517A9F1C), generative Rasch responses,
  truth theta + ref_theta_ml for cross-validation.
- **`scripts/quiz/generate-mirt-fixture.js`** — deterministic regenerator
  (run after item-difficulty changes).
- **`scripts/quiz/validate-against-mirt.R`** — operator-run external
  cross-check via `mirt::fscores(method="ML")`. Acceptance: r > 0.99,
  MAD < 0.05, mean |SE_js - SE_mirt| < 0.05.

### Added — quiz UI

- **`public/js/quiz-ui.js`** — self-contained fixed-overlay modal
  (z-index 10500). 20-item navigation with ← Back / Next →, mid-quiz
  resume from `localStorage.quizState_v1`, trilingual prompts +
  options with RTL auto-detect, finalize → score reveal → close →
  `quizCompleted_v1` marker (only `{version, completed_at, cohort_code}`,
  no item-level data).
- **Research panel launcher** — "📝 Сдать диагностику" button next to
  "🎓 Сдать экзамен" in research mode panel.
- **i18n** — ~30 quiz keys × 3 locales (ru / en / he) covering modal
  title, progress, privacy hint, button labels, completion notice,
  result labels, all 5 CEFR band labels.

### Added — research wire

- **`LinguistProResearch.submitQuizOutcome(payload)`** — new public
  API. POSTs to existing `/api/research/v1/metrics` (no new endpoint
  per hard constraint locked 2026-05-14). Defensive ITEM_LEVEL_LEAK
  reject + 6 client-side guards (BAD_SCORE / BAD_BAND / BAD_SE /
  BAD_COMPLETED_AT / BAD_VERSION / BAD_METHOD).
- **`research/validate.js`** — outcome schema extended with 5 new
  allowed keys + `outcome_capture_method` enum gains `"calibrated-quiz"`
  + 5 field-level validators raising `SCHEMA_VIOLATION` on miss.
- **`research/storage.js`** — `aggregateCohort` outcome harvest extended
  to detect quiz uploads; teacher CSV MERGES rather than REPLACES so
  quiz fields remain visible alongside teacher's authoritative
  `post_test_score`.

### Added — teacher dashboard

- **`public/js/teacher.js`** — 3 new columns in per-student table:
  `quiz` (quiz_score_normalized), `CEFR` (quiz_cefr_band), `SE`
  (quiz_se to 2 decimals). Sparse — `—` placeholder when absent.

### Added — admin tooling

- **`scripts/research/reset_quiz_for_student.js`** — admin CLI that
  strips calibrated-quiz fields for one student in one cohort. Drops
  quiz-only lines, modifies mixed lines, appends audit log entry
  (ISO ts + cohort + sid + reset_count + reason). Idempotent.

### Added — privacy invariants

- **Item-level responses (`Q01..Q20`, `responses_transient`) MUST never
  leave the device.** Pinned by:
  - `scripts/quiz/privacy-smoke.js` cases 2 + 3 (payload audit)
  - `scripts/quiz/client-submit-smoke.js` case 4 (POST body scan via
    fetch interception) + case 8 (ITEM_LEVEL_LEAK reject)
  - `submitQuizOutcome` defensive regex `^Q\d{2}$` + `responses_transient`
- **`quiz_completed_at` must be ISO day** (matches `upload_ts`).
  Pinned client-side (`client-submit-smoke.js` case 7) + server-side
  (`quiz-validator-smoke.js` case 5).
- **`quizState_v1` cleared on submit; `quizCompleted_v1` has ONLY
  `{version, completed_at, cohort_code}` keys.** Pinned by
  `privacy-smoke.js` cases 1 + 4 + `ui-smoke.js` case 6.

### Consent

**NO `CONSENT_VERSION` bump.** Per `docs/RESEARCH_CONSENT_RULE.md`
Example E audit: four enforced conditions hold (ISO day, 0-100 scale
parity, cefr_band as derived presentation, consent template §3.2 #3
mentions the quiz path). `CONSENT_VERSION` remains at `1.0`.

### Smoke

18 suites total, **248 cases ALL GREEN** — up from v3.3.4's 197:
+8 bank validate, +6 scoring, +8 UI, +5 privacy, +8 client submit,
+7 server validator, +3 teacher dashboard quiz cols, +6 reset CLI.

### Docs

- **NEW** `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` — methodology + audit log
  + privacy invariants table + consent posture + recalibration trigger.
- **UPDATED** `docs/RESEARCHER_GUIDE.md` §4.3 — third outcome path.
- **UPDATED** `docs/RESEARCH_METRICS_SCHEMA.md` §8 — wire shape.
- **UPDATED** `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` §3.2 #3 —
  cosmetic mention of the calibrated quiz alternative.

### Pre-deployment gate (unchanged)

Domain-expert (ulpan teacher) external sign-off on the item bank is
still REQUIRED before real-ulpan deployment. AI pre-review served as
the development-phase substitute. See
`docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` for dispatch template.

### Deferred to v3.4+

- Empirical IRT recalibration (requires ≥ 30 quiz responses per
  cohort + dashboard correlation signal).
- `scripts/quiz/recalibrate-from-data.R` — Rasch refit script.
- `ulpan_diagnostic_v2` bank with empirical difficulty estimates.
- Polynomial / spline theta→score projection (replacing v1 linear).

---

## [3.3.4] — 2026-05-14

**Hotfix release.** Двойной fix для cross-text "Где встречается" hub
(v3.3.2 D15), оба бага найдены user'ом сразу после v3.3.2 ship.

### Fixed — Bug 1: panel hidden behind notes modal

**Symptom:** User открывает word_study заметку из строки → клик
`🔎 Где встречается` → панель открывается, но **визуально находится
ЗА** «Заметка к строке» (v3-modal) — interactable области не видны,
выбрать «Перейти к строке» невозможно.

**Root cause:** Cross-text panel был `zIndex: 9001`, overlay `9000`.
`.v3-modal` (notes modal) — `z-index: 9999`. Поэтому notes modal
покрывал cross-text panel.

**Fix:** bump panel `z-index` → `10501` (overlay → `10500`). Стек:
- toasts (`100001`)
- nav-sticky (`99999`)
- notes modal (`9999`)
- **cross-text overlay/panel (`10501/10500`) ← теперь above notes modal**

### Fixed — Bug 2: includeRoot не находит инфлексии

**Symptom:** User создал 3 заметки `🔤 Слово` в 3 разных текстах, все с
`Корень = "עינ"`. Открыл одну из заметок (слово `עיני`, root `עינ`),
включил «Включая другие инфлексии корня», но панель показывает «Слово
не встречается в других текстах библиотеки» — несмотря на 2 другие
заметки с тем же корнем в других текстах.

**Root cause:** v3.3.2 cross-text service при `includeRoot=true`
добавлял к candidate keys только **сам root** (`עינ`) как surface form
для поиска. Но root как standalone токен редко встречается в
sentence-плэйнтексте — встречаются ИНФЛЕКСИИ корня (`עיני`,
`עיניים`, `עיניה` и т.п.). Без secondary index `root → all_forms`
поиск находил только литеральный root, что в реальных текстах == 0
совпадений.

**Fix:** новый secondary index `_index.rootIndex` —
`Map<normalized_root, Set<normalized_form>>`. Строится во время
`ensureIndex()` через iteration `forward.keys()` + `MorphProvider.analyze(key)`
для каждой → extract root → store в rootIndex. Cost: ~0.5ms per
unique forward key × ~5K keys → ~2.5s build extra (one-time per session).
Tolerant: если MorphProvider не загружен (нет full-tier dict,
например), rootIndex остаётся пустым и includeRoot degradates до
бывшего bare-root-key поведения.

`findOccurrences(word, {includeRoot:true})` теперь:
1. Resolves root from query word (как было).
2. Adds **root key** to candidate keys (как было).
3. **Adds all surface forms from `rootIndex.get(root)`** to candidate keys (NEW).
4. Searches forward index for union of all keys.

В пользовательском сценарии:
- Build: `rootIndex["עינ"] = {עיני, עיניים, עיניה}`.
- Query `עיני`: direct = forward.get("עיני"); +root resolution = "עינ"; +rootIndex["עינ"] expand = {עיני, עיניים, עיניה}; union → finds ALL 3 inflected forms across all texts.
- excludeTextId filters current text → user sees 2 (other 2 notes' parent texts).

`getStats()` exposes new fields `distinct_roots` и `analyses_resolved`
для diagnostics.

### Smoke

- `scripts/morph/crosstext-smoke.js` extended 13 → 14 cases (added
  rootIndex assertion).
- All 10 existing smoke suites stay green: **197 cases ALL GREEN**.

### Cycle replan

Этот hotfix consume patch-slot v3.3.4 в master plan. Сдвиг:
- Direction 13 calibrated quiz → **v3.3.5** (was v3.3.4)
- Direction 14 knowledge-graph view (M8) → **v3.3.6** (was v3.3.5)

`docs/PREMIUM_RELEASE_PLAN_v3_3.md §4` будет обновлён при authoring
v3.3.5 phase plan.

### Anchor commit

- (this commit) — z-index + rootIndex + smoke + version bump

---

## [3.3.3] — 2026-05-14

**Hotfix release.** Закрывает single-issue bug в Library Search,
обнаруженный user'ом сразу после v3.3.2.

### Fixed — Library → Search results rendered "Без названия" + broken "Перейти к строке"

**Symptom (reported by user):**
1. Library → 🔍 Search → ввести `עיניי` → "Совпадения в строках (15)".
2. Все 15 карточек показывали заголовок «Без названия».
3. Клик на "Перейти к строке" → toast "Невозможно перейти: пустой
   textId/sentenceId".

**Root cause:**
`v3RowsRender` (rows search) + the notes-hit render path читали поля
result-rows в **camelCase** (`r.textId`, `r.sentenceId`, `r.title`,
`r.orderIndex`, `r.he`, `r.sentenceText`, `r.noteUpdatedAt`), но
`public/db/local-db.js` `searchSentences()` / `searchNotes()` в
LOCAL_MODE возвращают **snake_case** SQLite-колонки напрямую (`r.id`,
`r.text_id`, `r.text_title`, `r.he_plain`, `r.order_index`,
`r.updated_at`). Имена не совпали → все эти reads давали пустые
строки или NaN. Карточки fallback'или на "Без названия", а
`v3NavOnHitJump` получал пустые id-шники.

**Fix:**
Добавлены snake_case fallback'и на оба render-сайта в `public/index.html`:
```js
const textId      = String(r.textId      || r.text_id     || "");
const sentenceId  = String(r.sentenceId  || r.id          || r.sentence_id || "");
const orderIndex  = Number(r.orderIndex != null ? r.orderIndex : r.order_index);
const tTitle      = String(r.title       || r.text_title  || "Без названия");
const he          = String(r.he          || r.he_plain    || "");
// (notes-hit path symmetric: r.sentenceText || r.he_plain, r.noteUpdatedAt || r.updated_at)
```

Это **строго additive** — если API-path (non-LOCAL_MODE) когда-либо
возвращал camelCase, он продолжает работать; LOCAL_MODE (по умолчанию
с v3.0) теперь тоже работает.

### Regression guard

Новый `scripts/research/search-fallback-regression.js` — статический
source-text check, гарантирующий, что 7 нужных fallback'ов остаются в
`public/index.html`. Без полноценного Playwright-бута на огромный
index.html: regression — это удаление одной строки, source-check
надёжнее и быстрее. Wired в `all-smoke.js` → `npm run smoke:research`.

### Cycle replan

Этот hotfix занимает patch-слот v3.3.3 в master plan. Сдвиг:
- Direction 13 calibrated quiz → **v3.3.4** (was v3.3.3)
- Direction 14 knowledge-graph view (M8) → **v3.3.5** (was v3.3.4)

Master plan в `docs/PREMIUM_RELEASE_PLAN_v3_3.md` §4 будет обновлён в
рамках v3.3.4 phase plan authoring (next session).

### Anchor commits

- (this commit) — hotfix + regression guard + version bump + CHANGELOG

---

## [3.3.2] — 2026-05-14

**Patch release.** Direction 12 (Multicohort Teacher Dashboard) +
Direction 15 (Cross-text "Где встречается" hub) from
[`docs/PREMIUM_RELEASE_PLAN_v3_3.md`](docs/PREMIUM_RELEASE_PLAN_v3_3.md).
Full phase plan at [`docs/PHASE_PLAN_v3_3_2.md`](docs/PHASE_PLAN_v3_3_2.md).

**No new collected fields. No `CONSENT_VERSION` bump. No new
`/api/research/v1/*` endpoints. No raw events leaving device.** All four
hard constraints from the user-locked v3.3.2 plan §12 honored.

### Added — Direction 12: Multicohort Teacher Dashboard (read-only compare)

- **Bulk-paste login.** Teacher dashboard login screen gains a `<textarea>`
  accepting N cohort credentials in `CODE  TOKEN` format (whitespace-
  separated, `#` comments, blank lines ignored). Concurrent
  `fetchAggregates` fan-out via `Promise.allSettled`; only successful
  pairs are persisted; failed cohorts surface in an error summary with
  the failing cohort code. Original single-pair form preserved inside a
  collapsible `<details open>` for the "I just want one cohort" path —
  existing 14 teacher-smoke selectors stay valid.
- **Chip strip.** Header gains `#cohortChipStrip` rendering one chip per
  stored cohort. Chip = pill shape, monospace code, status dot
  (green=ok, red=error, grey=unknown), inline `×` for one-click removal,
  click-to-switch active view. Max 6 visible inline; overflow becomes a
  `[+N more ▾]` dropdown. **`🌐 All cohorts` chip** always rendered when
  ≥ 2 cohorts are stored.
- **"All cohorts" compare view.** Side-by-side per-cohort summary tiles
  with deterministic color-coded left border (cohort_code → 8-color
  palette hash). Overlaid SVG charts (`svgMultiLineChart`) for
  engagement timeline / audio playback / SRS reviews — one line per
  cohort + legend. **Per-student / outcome correlations / scatter
  sections HIDDEN in compare view regardless of any cohort's k-status**
  (per `PHASE_PLAN_v3_3_2.md §7` invariant; prevents cross-cohort
  re-identification). Compare-mode notice card explains the gating.
- **`cross_cohort_aggregates.csv` export.** Long-format CSV (one row
  per `cohort × date`); 12 columns: `cohort_code, date, students_active,
  cohort_size_total, k_anonymity_met, active_minutes_real,
  audio_play_ms_total, sessions_count, cards_reviewed, notes_created,
  cohort_meta_consent_version, cohort_meta_retention_until`. **Cohort-
  wide only — no per-student data.** Sorted by `(cohort_code ASC, date
  ASC)`. Filename: `cross_cohort_aggregates_<YYYY-MM-DD>.csv`. New
  `[⬇ Cross-cohort CSV]` button visible only in compare view.
- **localStorage v2 schema** with auto-migration. New keys:
  `teacherDashCohorts_v2` (JSON array of `{code, token, added_at,
  last_ok_at, nickname?}`) + `teacherDashActiveView_v2` (cohort code |
  `'ALL'`). Legacy v1 keys (`teacherDashCohort_v1` /
  `teacherDashToken_v1`) auto-migrate on first v3.3.2 boot and are
  removed afterwards. Internal helpers: `_getCohorts` / `_setCohorts` /
  `_activeCohort` / `_upsertCohort` / `_clearAllCohorts` /
  `_migrateLegacy`. Server-side wire contract unchanged.
- **Other UX.** `[+ Add cohort]` button (prompt-driven inline form for
  v3.3.2; full bulk-paste inline form is a v3.3.3+ polish item).
  `[⎋ Logout]` renamed to `[⎋ Logout all]` with confirm dialog when
  ≥ 2 cohorts stored.

### Added — Direction 15: Cross-text "Где встречается" hub (all-local)

- **`window.CrossText` service** (`public/js/crosstext.js`). New public
  API: `findOccurrences(word, {includeRoot, limit, excludeTextId})` →
  `Promise<Occurrence[]>`, plus `invalidate()` and `getStats()`. Lazy-
  built inverted index `Map<normalized_key, IndexEntry[]>` walking the
  existing OPFS `sentences` table via `window.__localDB.dbQuery`. Niqqud-
  insensitive lookup via the single-source-of-truth
  `MorphNormalize.normalizeHebrew` invariant — final letter mapping +
  niqqud strip + ZWJ + NFC. Optional `includeRoot=true` resolves the
  morphology root via `MorphProvider.analyze()` and adds root-keyed
  occurrences to the result set. LRU memo cache of 200 query-result
  pairs. Visibility-change + 5 min idle → drop index (memory hygiene).
- **`window.LinguistProCrossTextUI` panel** (`public/js/crosstext-ui.js`).
  Side-panel slides in from the right on desktop (200 ms ease-out);
  full-screen on viewports < 1024 px. Per-text collapsible `<details>`
  groups (first 3 open by default), per-occurrence row with `<mark>`-
  wrapped match in the snippet. Click an occurrence → closes the panel,
  calls `v3LibraryOpenText(textId, {resumeSentenceId, origin:'crosstext'})`
  to navigate the host app to the matched sentence. Escape key + overlay
  click close.
- **Word-study integration.** New `🔎 Где встречается` button at the
  end of the `<div data-tpl="word_study">` template form. Reads the
  word + root + binyan inputs; auto-detects `excludeTextId` from
  `window.v3CurrentTextId` / `window.v3Library.currentTextId`.

### i18n

- +21 keys × 3 locales (ru/en/he) total:
  - `crossText.{title, rootLabel, binyanLabel, includeRootLabel,
    loading, empty, emptyCurrentTextHint, error, summary,
    summaryMatches, summaryTexts, sentenceLabel, clickHint, close,
    moduleMissing, toast.noWord}` — 16 keys
  - `notes.tpl.word_study.{crossText, crossTextTitle}` — 2 keys
  - (multicohort UI uses inline copy; chip strip is self-explanatory
    monospace cohort codes + emoji)

### Tests

- **`scripts/morph/crosstext-smoke.js`** (new) — 13 cases. 8 service-
  level + 5 UI-level. Live Playwright run with mocked `__localDB.dbQuery`
  + `MorphProvider` + real `morph-normalize.js`. `npm run smoke:crosstext`.
- **`scripts/research/teacher-multicohort-smoke.js`** (new) — 31 cases.
  Migration (v1 → v2 keys) + bulk paste + chip strip + add/remove/switch
  + error chip + compare view rendering + CSV export schema +
  cross-cohort CSV download verification via Playwright's
  `page.waitForEvent('download')`. `npm run smoke:research:teacher:multi`.
- **Both wired into `scripts/research/all-smoke.js`.** Existing 14
  teacher-smoke single-cohort cases stay 14/14 green.

### Smoke matrix at v3.3.2 cut

```
✓ Server (Phase 11.4 + 11.6):                     25/25
✓ Client opt-in (Phase 11.2 + 11.3):              28/28
✓ Teacher dashboard (Phase 11.5):                 14/14   regression check
✓ Teacher multicohort (D12, NEW):                 31/31
✓ Preview UI (transparency modal):                12/12
✓ Admin CLI rotate_token (A2):                    12/12
✓ Admin CLI link_student_ids (A3):                12/12
✓ Admin CLI validate-cli (A5):                    15/15
✓ Cross-text lookup service + UI (D15, NEW):      13/13
✓ Morph tier-switch + Settings + live:            28/28
─────────────────────────────────────────────────────
                                                  190 cases ALL GREEN
                                                  (was 146 at v3.3.1)
```

### Docs

- [`docs/PHASE_PLAN_v3_3_2.md`](docs/PHASE_PLAN_v3_3_2.md) — 17-section
  phase plan authored before C1, approved by user 2026-05-14, executed
  in 10 bisectable commits C1-C10.
- [`docs/RESEARCHER_GUIDE.md`](docs/RESEARCHER_GUIDE.md) §5.4 Multicohort
  mode + §6 Cross-text hub authored; downstream sections renumbered.

### Visual regression captures

Deferred to v3.3.3 backlog (planning §11.2 + §11.4). Not blocking the
patch — manual visual verification via the `UI_SMOKE_CHECK` protocol
remains the verification path.

### Anchor commits

- `0fca6d9` C1 — CrossText lookup service
- `44f592d` C2 — CrossText side-panel UI + word-study integration
- `d323bd6` C3 — teacher.js localStorage v2 migration
- `35b1476` C4 — chip strip + bulk paste UX
- `f1c68c1` C5 — "All cohorts" compare view
- `6bcc52a` C6 — cross_cohort_aggregates.csv export
- `1515424` C8 — RESEARCHER_GUIDE updates
- `31ba4c4` C9 — i18n keys × 3 locales
- (this commit) C10 — version bump + CHANGELOG

---

## [3.3.1] — 2026-05-14

**Patch release.** Workstream A2-A5 from the v3.3 master plan
([`docs/PREMIUM_RELEASE_PLAN_v3_3.md`](docs/PREMIUM_RELEASE_PLAN_v3_3.md))
— operational maturity: four admin/lint CLIs for researchers + a
material-change decision tree for consent edits.

**No new collected fields. No `CONSENT_VERSION` bump.** All four
deliverables ship as admin tooling and documentation only; no user-facing
UI, no new wire format, no new `/api/research/v1/*` endpoints. v3.2.x +
v3.3.0 pilot snapshot users are unaffected.

### Added — A2: `scripts/research/rotate_token.js`

CLI that rotates the researcher token of a live cohort in-place
(replaces `cohort_meta.researcher_token_hash`). Wraps Procedure B from
`RESEARCHER_GUIDE.md §2.1.1`. Atomic `.tmp` + rename rewrite. Appends
to a new `cohort_meta.token_rotations[]` audit array (`rotated_at` +
`prev_hash_prefix` + optional `reason`) and a `token_rotation` line to
`deletions.log`. Prints the new plaintext token to stdout once — capture
it immediately, not stored on disk. Old token stops working on the next
request. Available via `npm run research:rotate -- --cohort <CODE>
[--reason <text>]`. 12-case smoke (`npm run smoke:research:cli:rotate`).
Closes RESEARCHER_GUIDE §2.1.1 "deferred to v3.3 backlog" footnote.

### Added — A3: `scripts/research/link_student_ids.js`

CLI for the researcher-side path of manual multi-device link. When a
student uses LinguistPro on multiple devices (desktop + PWA), each
generates an independent anonymous `student_id`; the CLI merges two
IDs into one by rewriting all `<date>.jsonl` rows and the `outcomes.csv`
to use the chosen primary ID. Atomic per-file rewrite. If both IDs
already have outcome rows, primary wins (secondary's outcome is
dropped, not merged). Audit line written to `deletions.log` capturing
both IDs, row counts, optional OTP (captured but NOT verified — the
researcher confirms OTP out-of-band with the student before running
the CLI), and the operator-provided `--reason`. **The in-app companion
UX (6-digit OTP displayed on both devices, with student-driven flow) is
explicitly DEFERRED to a later patch** per the v3.3 master plan §3 and
the v3.3.1 user constraint. For v3.3.1 only the CLI/protocol/audit-log
shipped; the in-source-header protocol spec documents the eventual UX
shape so a later patch can wire it up without changing semantics.
Available via `npm run research:link -- --cohort <C> --primary <U>
--secondary <U> --reason <text> [--otp <6 digits>]`. 12-case smoke
(`npm run smoke:research:cli:link`).

### Added — A4: `docs/RESEARCH_CONSENT_RULE.md`

Formal decision tree for whether an edit to `RESEARCH_ETHICS_CONSENT_TEMPLATE.md`
requires a `CONSENT_VERSION` bump. Five-question walk (Q1-Q5) classifies
the change as **major bump** (forces re-consent — substantive change
to what is collected / how long / who can see it), **minor bump**
(forces re-consent — withdrawal mechanics, contact details, k-anonymity
threshold), **patch bump** (audit-only, reserved for future tolerant
comparator), or **no bump** (cosmetic / wording / translation of
already-approved section). Includes a 15-row material-change taxonomy
and four worked examples (material change, cosmetic edit, borderline,
pure UX i18n). Closes `ULPAN_RESEARCH_PLAN §14 Q2`.

### Added — A5: `scripts/research/validate-cli.js`

Standalone CLI wrapping `research/validate.js` so payloads can be
schema-checked without a server round-trip. Reads JSON from a file path
or stdin. `--json` flag emits machine-readable diagnostics (`{ok, code,
field, message, line}`). `--jsonl` flag validates every non-empty line
of a JSONL archive and exits 3 if any line fails. Exit codes: `0` valid,
`3` invalid (`SCHEMA_VIOLATION` or `PARSE_ERROR`), `2` argv/IO error.
Useful for: ulpan teachers preparing CSV uploads, smoke-checking JSONL
archives at rest, pre-flighting fixtures from
`seed_research_fake_cohort.js`. Available via `npm run research:validate
-- <path>`. 15-case smoke (`npm run smoke:research:cli:validate`).

### Smoke matrix post-v3.3.1

- Server (Phase 11.4 + 11.6): 25/25
- Client opt-in (Phase 11.2 + 11.3): 28/28
- Teacher dashboard (Phase 11.5): 14/14
- Preview UI (transparency modal): 12/12
- **Admin CLI: rotate_token (A2): 12/12 (new)**
- **Admin CLI: link_student_ids (A3): 12/12 (new)**
- **Admin CLI: validate-cli (A5): 15/15 (new)**
- Morph tier-switch + Settings + live: 28/28
- Visual regression: 9 PNGs

**Total: 146 cases + 9 PNGs ALL GREEN** at merge time (was 107).

### Docs

- `RESEARCHER_GUIDE.md` §2.1.1 expanded with the new CLI usage example;
  §2.1.2 added (multi-device link CLI); §2.1.3 added (validate lint
  CLI); §1.1.5 added (cross-link to `RESEARCH_CONSENT_RULE.md`).
- `package.json` script aliases: `research:rotate`, `research:link`,
  `research:validate`, `smoke:research:cli` + per-CLI granular shortcuts.
- `scripts/research/all-smoke.js` wires the 3 new CLI suites.

### Anchor commits

- (this commit) — Workstream A2-A5 + RESEARCHER_GUIDE updates +
  v3.3.1 release bump.

---

## [3.3.0] — 2026-05-14

**Minor release.** Closes the pilot-freeze window opened with v3.2.0 ([`docs/PARALLEL_WORK_PLAN_DURING_PILOT.md`](docs/PARALLEL_WORK_PLAN_DURING_PILOT.md)) and ships Workstream A1 — opt-in extended Hebrew morphology dictionary. Pilot did not run with real users; debrief in [`docs/PILOT_DEBRIEF_v3_2_to_v3_3.md`](docs/PILOT_DEBRIEF_v3_2_to_v3_3.md) documents the integrity audit that authorizes the merge.

### Added — Workstream A1: opt-in 250K hspell dictionary (Phase 1 + Phase 2 shipped together)

- **Two-tier morphology dictionary** with explicit user opt-in for the extended variant. Default behavior is unchanged for v3.2.x users (same filename, byte-identical dict content; `dictionary_sha256` unchanged).
  - **Basic tier (default).** `public/morph/heb_morphology.bin` — 34 755 entries / 68 826 analyses / ~7 MB raw / ~655 KB gzipped via HTTP. Ships in the app bundle.
  - **Full tier (opt-in).** `public/morph/heb_morphology_full.bin.gz` — **493 398 entries** / 685 632 analyses / **4.24 MB gzipped** on disk, decompresses to ~72 MB JSON in browser via `DecompressionStream`. Lazy-fetched only after user opts in via Settings. Acceptance targets exceeded: entries are ~197 % of the planned ≥250K, gzipped size is ~14 % of the planned ≤30 MB budget.
- **Provider API.** `MorphProvider` gains `getDictTier()` / `setDictTier(tier)` / `getStatus().dictTier`. Tier choice persists to `localStorage.morphDictTier_v1` ∈ {'basic', 'full'}. Tier switches purge the in-memory map + both tier filenames from caches.* so a flip can never serve stale data. `setDictTier` returns `{ok, tier, reloaded}` so callers can decide whether to eagerly re-fetch.
- **Decompression path.** Full-tier `.bin.gz` is fetched as raw bytes and decoded via `DecompressionStream('gzip')` — standards-based, no external deps, available in Chrome 80+, Firefox 113+, Safari 16.4+. Older browsers surface a clear error via the existing `T1.state='error'` path.
- **Service Worker dedicated bucket.** `linguistpro-morph-${CACHE_VERSION}` isolates the morph dict from the app shell so quota pressure can evict morph data without losing critical shell entries. `cache-first with background revalidate` semantics. New `MORPH_QUOTA_THRESHOLD = 0.80` guard — skips caching when device is within 80 % of its storage quota (iOS Safari friendliness). `CACHE_VERSION` bumped to `v3.3.0-morph-tier-1`.
- **Settings UI.** New `🔤` toolbar button (right of `📊` research-mode button) opens `LinguistProMorphSettings.open()` — modal with current status block, two-radio tier selector (with explicit caption + warning about download size + iOS Safari quota note), apply button (calls `setDictTier()`), and a "🗑 Clear SW cache + reload" advanced action that wraps `MorphProvider.forceUpdate()`. Distinct visual treatment per tier (amber accent for full, green for basic) so the opt-in nature reads clearly.
- **i18n.** +35 keys × 3 locales (ru/en/he) under `morph.settings.*` covering panel copy, status messages, tier descriptions, button labels, and 8 toast variants.

### Build pipeline

- **`scripts/morph/build-morphology.mjs` `--tier <basic|full>` flag.** Basic tier keeps the historical filename for back-compat. Full tier writes a parallel `_full` pair plus a sibling `.bin.gz` (level-9 gzip) — the gzipped file is what's served + committed; the 73 MB raw is gitignored.
- **`scripts/morph/extract-hspell-stems.c`** — small C utility built around hspell's internal `print_tree()` (50 LOC). Enumerates all 469 509 stems from hspell's radix-tree dictionary. Build via WSL: `gcc -O2 -DPREFIX_FILE -o extract-hspell-stems scripts/morph/extract-hspell-stems.c .external/hspell/dict_radix.c -I.external/hspell /usr/lib/x86_64-linux-gnu/libz.so.1`. Source is committed; the compiled binary is gitignored under `.external/build/`.
- **Wordlist source for full tier:** the 469 509 stems extracted by the utility above, converted from ISO-8859-8 → UTF-8 + sorted/deduped, then fed via `MORPH_WORDLIST=<path> npm run build:morphology:full`. Result is then gzipped to a separate sibling file.
- **NPM script shortcuts:** `build:morphology:basic`, `build:morphology:full`, `smoke:morph` (all 3 morph smokes chained), plus individual `smoke:morph:tier` / `smoke:morph:settings` / `smoke:morph:live`.

### Tests

- **9-case tier-switching smoke** (`scripts/morph/tier-switch-smoke.js`, Playwright). Mocks `fetch` + `caches`, asserts default tier, URL routing for each tier, persistence, invalid-tier rejection, same-tier no-op, dual SW cache purge, status exposure, basic↔full round-trip.
- **13-case Settings UI DOM smoke** (`scripts/morph/settings-ui-smoke.js`, Playwright). Mocks `v3ConfirmModal` + `showToast`, asserts modal title, intro copy, status block, radio preselection, Apply persists tier to localStorage, provider state, SW cache purge, toast surfaced, re-open shows new preselection, no JS errors.
- **6-case live integration smoke** (`scripts/morph/full-dict-live-smoke.js`, Playwright). Loads the actual committed `.bin.gz` artifact over HTTP, decompresses via DecompressionStream, parses 72 MB JSON, runs a sample `שלום` lookup. Soft-skips with exit 0 if the artifact is absent (fresh-checkout scenario). Verifies entry_count ≥ 250 000, matches meta count, decompressed size > 50 MB, lookup returns ≥ 1 analysis. Fetch+decode end-to-end in ~1.5 s on dev machine.
- **Wire into all-smoke matrix** via `npm run smoke:morph`. **107 cases + 9 PNGs ALL GREEN** (28 morph + 79 research) at merge time.

### Docs

- **HE consent native review brief authored** (2026-05-14). `docs/HE_CONSENT_REVIEW_BRIEF.md` — production-ready review brief для отправки native HE speaker (предпочтительно ulpan-преподаватель с academic-translation опытом). Section-by-section параллельный RU/EN/HE layout по 14 секциям consent template'а с явными asks: A1-A5 fill-in placeholders (purpose, retention, risks, benefits, contacts) + 2 отсутствующие секции целиком (who-conducts, what-is-asked-of-you) + B-checklist для уже-переведённых секций (грамматика, гендерные формы, терминология, loan-words, тон, культурная уместность, RTL/LTR mixing). 4 return-format options. Cover-message template для WhatsApp/Telegram/email. Cross-linked в `RESEARCHER_GUIDE.md §8` (pre-deployment checklist) + `ULPAN_RESEARCH_PLAN_v3_2.md §14 Q3` (open question status). Закрывает authoring side deployment-blocker Q3; closure теперь bottlenecked external reviewer response time, не нашей работой.
- **End-of-pilot debrief** at [`docs/PILOT_DEBRIEF_v3_2_to_v3_3.md`](docs/PILOT_DEBRIEF_v3_2_to_v3_3.md) — formal closure of the pilot-freeze window. Section 3 audits every freeze-zone path touched and the (semantics-preserving / opt-in) rationale; section 5 captures the 107-case smoke matrix integrity; section 7 contains the signed decision.
- **`scripts/morph/README.md` §"Two-tier dictionary"** expanded with a Phase 1 / Phase 2 status table, build commands, and the C-utility extraction recipe.

### Anchor commits

- `1c1bd47` — Phase 1 (infrastructure: build flag + provider tier-switching + tier-switch smoke)
- (this commit) — Phase 2 (Settings UI + SW cache strategy + `.bin.gz` + live smoke + extract-hspell-stems.c + 250K dict generation + debrief + i18n × 3 locales)
- (merge commit) — v3.3.0 release

### Operational note: pilot was not run

The 10-day pilot window approved on 2026-05-13 was a contingency-safety mechanism for protecting real participants. No real participants were recruited during the window; the protective constraints (freeze-zone paths untouched, default-OFF semantics, smoke green throughout) were honored anyway. The pilot-style mechanics remain available for a future activation when real participants are scheduled — re-pin Railway to `v3.2.0` or `v3.3.0` per `PARALLEL_WORK_PLAN_DURING_PILOT.md §2.A`.

---

## [3.2.1] — 2026-05-14

**Patch release.** Закрывает transparency-UX gap, обнаруженный пользователем во время первого smoke-теста v3.2.0 (TC-T-6 / TC-T-7 в `Smoke-check/SMOKE_CHECK_RESEARCH_MODE_v3_2_0.docx`). Без новых wire-format / consent-version изменений — обратно совместимо с v3.2.0; pilot-snapshot ничего не ломает.

### Added — Research transparency: pending-upload preview

- **UX gap closed.** В v3.2.0 пользователь, открывший «👁 Что собрано» в день своей активности, видел только уже отправленные uploads (≤ yesterday) — сегодняшняя работа отсутствовала, потому что daily aggregator by design никогда не аплоадит «сегодня» (неполный день). Текст empty-state («Uploads появятся после первого полного дня активности») не передавал эту нюансировку. После реализации pending-upload preview-секции студент видит live-аггрегаты сегодняшнего дня прямо в модальном окне «👁 Что собрано», что в свою очередь служит дополнительной transparency-гарантией ("see-before-send").
- **API.** Новая публичная функция `LinguistProResearch.previewToday()` — pure read поверх `_aggregateForRange(sinceDay, today)`. **Никаких side-effects**: ни POST, ни запись в `researchUploadLog_v1`, ни мутация `lastUploadDate` / `nextRetryAt` / upload queue. Возвращает `{ok, reason, sinceDay, uploadDay, willUploadOn, metrics, payloadBytes}`. Negative branches: `NOT_ENABLED` / `NOT_JOINED` / `RECONSENT_NEEDED` / `AGGREGATE_ERROR`.
- **UI.** `research-ui.js` `openTransparency()` теперь рендерит **отдельную амбер-bordered секцию** «📋 Превью следующего upload-а» поверх существующего лога. Внутри: период (`since → upload`), `Будет отправлено: <willUploadOn>`, и одностроковая мини-таблица с амбер-бэйджем **`⏳ preview`**. Визуальная различимость от «✓ stored» — privacy-критическое требование («ещё не на сервере» должно читаться однозначно). Empty-case (метрики все нули) → italic «Сегодня ещё нет зарегистрированных событий.»; error-case → красная подпись с message.
- **i18n.** +13 ключей × 3 локали (ru/en/he) под `research.transparency.preview*` + `historyHeader`.
- **Тесты.** 7 новых case'ов в `public/research-client-test.html` — pinning of privacy/state invariants (no fetch, no log mutation, no lastUploadDate change, clamp sinceDay ≤ uploadDay, всех 4 negative branches). Новый smoke runner `scripts/research/preview-ui-smoke.js` (Playwright, 12 DOM-assertions) — мокает `v3ConfirmModal` + `__localDB`, открывает реальный модал, проверяет наличие preview-секции, бэйджа `⏳ preview`, period+willUpload-меток, и нумерических ячеек со значениями из synthetic events. Wire'нут в `scripts/research/all-smoke.js`.
- **Smoke-табло post-change:** Server 25/25, Client opt-in **28/28** (+7), Teacher dashboard 14/14, **Preview UI 12/12 (новый)**, Visual regression 9 PNGs → итого **79 cases + 9 PNGs ALL GREEN**.

### Chore

- **Repo tidy** (`3000de7`). Зафиксированы давно висевшие в working tree pilot-prep артефакты: `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md` (план параллельной работы на pilot-окно), `scripts/research/prepare_smoke_artifacts.js` (idempotent smoke prep CLI), `scripts/research/gen_smoke_check_docx.py` (генератор smoke-check protocol DOCX), `tests/Pre-Phase-6 dogfood протокол.md`. `.gitignore` дополнен `.external/` (25 MB HebMorph + hspell локальных бандлов для morphology pipeline — не часть истории репо). Удалён `scripts/research/demo_daily_artifact.js` — одноразовый диагност от preview-investigation, перекрыт preview-ui-smoke'ом.

### Anchor commits

- `6722607` feat — preview-функционал + тесты + докcы (CHANGELOG, RESEARCHER_GUIDE §1.1)
- `3000de7` chore — repo tidy

---

## [3.2.0] — 2026-05-13

**Mega-release.** Approved 2026-05-10; closed 2026-05-13. Master plan: [`docs/PREMIUM_RELEASE_PLAN_v3_2.md`](docs/PREMIUM_RELEASE_PLAN_v3_2.md). All four Direction 11B smoke suites green pre-tag: **60 cases + 9 PNG, ~8s** (`npm run smoke:research`).

### Pre-release audit closures (B1 + P1-P6, 2026-05-13)

- **B1 — Privacy fix.** `deleteStudentFromCohort` previously only stripped `.jsonl` payloads; outcome rows in `outcomes.csv` survived withdrawal. Consent template promises «удаление всех ваших ранее загруженных данных», so this was a real privacy bug. Fix: storage now also rewrites `outcomes.csv` (atomic .tmp + rename) and `findCohortsForStudent` falls back to scanning `outcomes.csv` so DELETE without `?cohort_code=` still finds outcome-only students. Audit log line gains `outcomes_removed=N` field. Two new smoke cases (24 + 25) verify end-to-end. Server smoke now 25/25.
- **P1** — `ULPAN_RESEARCH_PLAN §15 Live status` updated: phases 11.2..11.7 marked `[x]` with anchor commits.
- **P2** — `CONTRACTS_ANALYTICS.md` Phase 11.4 closure section retired; replaced with Direction 11B closure summary table.
- **P3** — `PRIVACY.md` extended with outcome data flow section (self-report + teacher CSV upload paths, authority rules, withdrawal coverage).
- **P4** — `ULPAN_RESEARCH_PLAN §14 Open questions` formally resolved (4 of 6 closed implementation-side; Q3 HE native review remains as deployment blocker tracked in `RESEARCHER_GUIDE §8`; Q2 re-consent rule documented as ad-hoc reviewer judgement).
- **P5** — `RESEARCHER_GUIDE.md §2.1.1` adds explicit token rotation procedures (provision new cohort = preferred; in-place hash rotation = workaround).
- **P6** — `package.json` npm script shortcuts: `smoke:research` (full), `smoke:research:fast` (skip screenshots), per-suite aliases, `research:cohort` + `research:seed` admin shortcuts.

### Shipped (Direction 11B complete)

- **Phase 11.6 + 11.7 + 11.8 — Outcome capture + docs + smoke audit** *(2026-05-13, S4 of Direction 11B — closes Direction 11B and completes v3.2.0)*. Final session for the mega-release. Outcome data now flows both directions (self-report by student + authoritative CSV by teacher), researcher onboarding guide written, and a combined smoke runner ties all four suites together for a single precommit gate.
  - **Phase 11.6.1 — Student self-report.** `LinguistProResearch.submitOutcome({post_test_score, confidence_self_report})` POSTs a minimal payload (just `metrics.outcome`) tagged `outcome_capture_method: "self-report"` to the existing Phase 11.4 endpoint. Validates locally: `post_test_score` must be a finite non-negative number; `confidence_self_report` must be int 1..5 (both nullable, but at least one required). New "🎓 Сдать экзамен" button in the research-mode main panel; modal with numeric input + 5-option Likert select. ~14 new i18n keys per locale.
  - **Phase 11.6.2 — Teacher CSV upload.** New endpoint **`POST /api/research/v1/cohort/:code/outcomes`** with Bearer-auth (researcher token) + `Content-Type: text/csv` (256 KB cap, parsed via `express.text` middleware on this route only). CSV header row required (`student_id` column mandatory); rows merged with existing `outcomes.csv` (incoming wins on conflict, full file rewritten atomically, audit-logged to `deletions.log`). Returns `{ok, inserted, updated, total}`. New `storage.parseOutcomesCsvText()` (throws `CsvParseError` with `.lineNumber`) and `storage.writeOutcomesCsv()`. Teacher dashboard gains a **📤 Upload outcomes CSV** button in the header — hidden file picker → local size check → POST with auto-refresh.
  - **Aggregator merges both outcome paths.** `aggregateCohort()` now scans payloads for `metrics.outcome` (self-report harvest, latest `upload_ts` wins per student) → attaches as `students[].outcome.uploaded_by: "self-report"`. Teacher CSV from `outcomes.csv` overrides on conflict (teacher is authoritative; documented in `RESEARCHER_GUIDE.md` §4). Malformed CSV at rest is logged + skipped rather than failing the whole GET.
  - **Phase 11.7 — `docs/RESEARCHER_GUIDE.md`** (new, ~280 lines). Researcher quickstart covering privacy invariants, cohort provisioning, code distribution to students with brief template, two outcome capture paths, teacher dashboard walkthrough, k-anonymity gate, three CSV export schemas, R/Python/SPSS analysis snippets, withdrawal flow, pre-deployment operational checklist, scope deferrals to v3.3+, support contacts.
  - **Phase 11.8 — Smoke audit + combined runner.** `scripts/research/smoke.js` extended with 8 outcome-endpoint cases (401/403/400 EMPTY_BODY/400 BAD_CSV/400 NO_ROWS/404/200 insert/200 merge) → **23/23 PASS** (was 15). Browser smoke extended with 5 `submitOutcome` cases (rejection when disabled, valid payload shape via captured fetch body, BAD_SCORE on negative, BAD_CONFIDENCE on out-of-range, score-only + confidence-only paths) → **21/21 PASS** (was 16). Teacher smoke extended with 2 cases (Upload outcomes CSV button presence, outcomes joined into student table via direct cell query) → **14/14 PASS** (was 12). New `scripts/research/all-smoke.js` chains all four runners and reports per-suite pass/fail + total runtime; `--skip-screenshots` flag for fast CI loops.

  **Direction 11B aggregate smoke: 58 cases + 9 PNG captures, ~8s total.**

  ```bash
  node scripts/research/all-smoke.js                    # all 4 suites
  node scripts/research/all-smoke.js --skip-screenshots # just the 3 functional (4s)
  ```

  This closes Direction 11B (research mode) and completes v3.2.0 mega-release scope (Direction 9 + 10 + 11A + 11B).

- **Phase 11.5 — Teacher dashboard `/teacher.html` + fake cohort seed** *(2026-05-13, S3 of Direction 11B)*. Researcher-facing static page that reads cohort aggregates from the Phase 11.4 GET endpoint, renders charts + per-student table + outcome correlations, and exports CSV in the schema documented in `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §8.
  - **`public/teacher.html` + `public/js/teacher.js`** — standalone vanilla-JS page (no shared layout, dark theme, ~600 LOC JS). Login form (cohort code + Bearer token) auto-resumes via `localStorage.teacherDashCohort_v1` + `teacherDashToken_v1`. Six sections: summary tiles, engagement timeline (SVG line chart), audio playback chart, SRS + notes-created chart, per-student table (k-gated, click-to-sort), Pearson correlations table (computed in-browser, no R/Python dependency), engagement-vs-exam scatter with least-squares trendline. Three CSV exports: `cohort_<code>_aggregates.csv` (per-student), `cohort_<code>_timeseries.csv` (per-student per-day OR cohort-wide fallback when k not met), `cohort_<code>_derived.csv` (composite engagement_score + quality_score + efficiency_ratio + growth_delta + engagement_consistency per Plan §8).
  - **k-anonymity gate enforced client-side as well** — when `cohort_size < threshold`, the per-student table shows an empty state and a `⚠ k-anonymity not met (N < k=5)` badge. Cohort-wide daily aggregates remain visible (they don't reveal individuals). Correlations + scatter also hidden until k met.
  - **`research/storage.js` `aggregateCohort()` extended** — adds `daily_aggregates` (cohort-wide per-day totals across {active_minutes_real, audio_play_ms_total, sessions_count, cards_reviewed, notes_created, students_active}, always returned) and `per_student_daily` (per-student per-day breakdown, hidden when cohort < k). New `readOutcomesCsv(cohortCode)` parses `<cohort>/outcomes.csv` (header row required) and joins outcomes into `students[].outcome` (manual placement for v3.2-rc; CSV upload via teacher dashboard is Phase 11.6).
  - **`scripts/research/seed_research_fake_cohort.js`** — deterministic admin tool generating 12 fake students × 14 days across 3 engagement groups (high/medium/low) + 1 mid-cohort withdrawal + per-day metric noise ±15% + synthetic exam scores correlated with engagement (Pearson r ≈ 0.92 observed in smoke). Writes JSONL per upload date + `outcomes.csv` + `deletions.log` audit. Seeded PRNG (xmur3+sfc32) makes outputs reproducible given a known `--code`. CLI flags: `--code`, `--token`, `--start-date`, `--days`, `--students`.
  - **Smoke runner** — `node scripts/research/teacher-smoke.js` (Playwright). Pipeline: mktemp RESEARCH_DATA_DIR → run seed → capture token → spawn server → launch Chromium → login → assert (header populated, cohort_size=12, k-anonymity badge, table has 12 rows, all charts render, Pearson r > 0.4 for active_minutes×post_test, export buttons present). 12 assertions all green.

  Combined Direction 11B smoke (run before any Phase 11.x commit):
  ```
  node scripts/research/smoke.js          # 15/15 server-side
  node scripts/research/browser-smoke.js  # 16/16 client opt-in flow
  node scripts/research/teacher-smoke.js  # 12/12 teacher dashboard
  ```

- **Phase 11.2 + 11.3 — Client opt-in UX + aggregation pipeline** *(2026-05-13, S2 of Direction 11B)*. Stacks on top of the Phase 11.4 server endpoints to give users the full client-side surface for opt-in research participation. Default OFF; activation requires explicit consent click.
  - **`public/js/research.js`** — IIFE module exposing `window.LinguistProResearch`. State machine in localStorage (`researchEnabled_v1` / `researchStudentId_v1` / `researchCohortCode_v1` / `researchConsentVersion_v1` / `researchUploadLog_v1` / `researchUploadQueue_v1` / `researchLastUploadDate_v1` / `researchNextRetryAt_v1`). Public API: `init()` / `getState()` / `acceptConsent()` / `joinCohort()` / `withdraw()` / `runDailyAggregator()` / `getRecentUploads()` / `getCurrentConsentVersion()` / `needsReconsent()`. Anonymous `student_id` via `crypto.randomUUID()` with fallback. Platform detection by display-mode + UA (no fingerprinting beyond the four allowed values).
  - **Aggregator** — pulls from existing `events` table (Phase 11.0 schema) via `window.__localDB.dbQuery` and `getActiveMsReal`. Builds RESEARCH_METRICS_SCHEMA-conformant payload covering Layer 1 (sessions / active minutes / time-of-day histogram), Layer 2 (texts/sentences/audio_ms/cards/notes/search counts), Layer 3 (cards correct/again/error_rate), Layer 4 (translit_toggles / audio_replay_distribution buckets 1/2/3/4plus). Window: `[lastUploadDate+1, yesterday]` — never uploads "today" (incomplete day). First-ever upload window starts at the earliest event date in the local DB.
  - **Uploader + retry queue** — POST `/api/research/v1/metrics` with `Content-Type: application/json`, `credentials: 'omit'`. Status handling: 200 → log + `lastUploadDate`; 400 SCHEMA_VIOLATION → log + drop (dev bug, no retry); 404 COHORT_NOT_FOUND → log + drop (user must check cohort code); 429 RATE_LIMIT → 30 min backoff; 5xx / network → queue + escalating backoff (1m → 5m → 30m → 2h, capped). Queue persists in localStorage, replays on `online` event + on each aggregator tick. Withdrawal DELETE also queues if offline so local state can clear immediately while server cleanup is deferred.
  - **`public/js/research-ui.js`** — IIFE exposing `window.LinguistProResearchUI`. Five modal flows via `v3ConfirmModal`: main panel (status + actions) / consent screen (full IRB-style text + 5-checkbox checklist + version stamp) / cohort join (4–16 char `[A-Z0-9-]` validation) / transparency dashboard (per-day uploads table with status / minutes / SRS / notes / bytes columns) / withdraw confirm (4-step disclosure). Toast feedback via existing `showToast`. Theme + RTL inherited from host modal.
  - **Boot wire-up** — `window.LinguistProResearch.init()` called from `index.html` after OPFS/local-db ready (alongside morphology lazy-load). Schedules a 5-second post-init aggregator pass + hourly recurring pass + `online` event listener for queue drainage. Idempotent: aggregator no-ops on every tick when research mode is disabled (default).
  - **Toolbar entry point** — new `📊` button in `classic-utility-nav` next to `📬` Feedback. `onclick="LinguistProResearchUI.open()"`. Opens the main status panel.
  - **i18n** — full `research.*` namespace × RU (primary) / EN (translated) / HE (machine-grade, native review flagged for ulpan deployment per Direction 11 plan §9.3). ~75 keys covering panel / consent / join / transparency / withdraw / 22 toast variants.
  - **Service Worker** — `CACHE_VERSION` bumped `v3.2.0-morph-1` → `v3.2.0-research-1` so the precache invalidates on upgrade and clients get the new shell on next reload.
  - **Browser test** — `public/research-client-test.html`. 19 cases across 10 sections covering: state defaults, consent acceptance, student_id stability across re-consent, cohort join validation (good/bad/case-normalize), aggregator schema conformance with synthetic events, recursive forbidden-field guard on payload, 200/400/5xx upload paths, network-fail withdrawal queues DELETE, re-consent on stored < CONSENT_VERSION. Mocks `fetch` + `window.__localDB` so tests don't touch real OPFS or the network.

  Phase 11.4 server smoke continues at 15/15 unchanged.

- **Phase 11.4 — Server endpoints `/api/research/v1/*`** *(2026-05-13, S1 of Direction 11B)*. Architectural exception to offline-first (D4): the ONE server endpoint family permitted in v3.2, aggregates only, never raw events. Three endpoints + thin file-system storage layer.
  - **POST `/api/research/v1/metrics`** — strict-validated daily aggregates upload. Schema enforcement per `docs/RESEARCH_METRICS_SCHEMA.md` §13: format guard (`linguistpro-research-v1`), required top-level keys, no-extra-top-level-keys, recursive forbidden-field check (`text_content` / `note_body` / `search_query` / `audio_bytes` / PII / IP / UA / device_id / geo / sub-day `timestamp`), per-metric type+range checks, 64 KB size cap. Cohort existence + `consent_version` >= `cohort_meta.consent_version_minimum`. Idempotent dedupe by `(student_id, since_ts, upload_ts)` — re-uploads return `{stored: false, dedupe: true}`. Same-origin CSRF guard (`requireSameOriginJson`) + per-IP rate limiter (60/min) + per-student daily limit (10/day → 429 RATE_LIMIT).
  - **GET `/api/research/v1/cohort/:code/aggregates`** — researcher dashboard read. Bearer-token auth (sha256 hashed in `cohort_meta.json`, never plaintext on disk). k-anonymity gate: when `cohort_size < cohort_meta.k_anonymity_threshold` (default 5), `students: []` returned to hide per-student breakdown. Aggregator scans all `<date>.jsonl` lines and produces per-student totals (active minutes, audio ms, cards reviewed/correct/again, notes created/edited, search count, smart-tag overrides, translit toggles, distinct texts/sentences seen).
  - **DELETE `/api/research/v1/student/:student_id`** — withdrawal flow. UUID-as-auth per D4 (anonymous student_id is itself the credential — no PII to compromise). Optional `?cohort_code=` narrows scope; otherwise sweeps all cohorts. Atomic-ish rewrite (`.jsonl.tmp` → rename) removes all matching lines; audit-logs to `<cohort>/deletions.log` with timestamp + records_removed count.
  - **Storage layer** (`research/storage.js`): `<RESEARCH_DATA_DIR>/<cohort_code>/{cohort_meta.json, <YYYY-MM-DD>.jsonl, deletions.log}`. `RESEARCH_DATA_DIR` env (default `<DATA_DIR>/research`). `cohort_meta.json` carries `code`, `schema_version: "v1"`, `k_anonymity_threshold`, `retention_until`, `outcome_scale`, `researcher_token_hash` (sha256), `consent_version_minimum`. Schema validator (`research/validate.js`), in-memory rate limiter (`research/rateLimit.js`), admin CLI (`scripts/research/create_cohort.js`) — prints plaintext researcher token ONCE, never stored on disk.
  - **No-PII logging contract.** Server log lines for research routes carry only `student_id`/`cohort_code`/`upload_ts`/byte count/status — never payload bodies or any raw text.
  - **Acceptance:** `scripts/research/smoke.js` — 15-case acceptance suite covering §14 (minimal+full valid, dedupe, missing/wrong format, unknown top-key, forbidden field deep, oversize payload, cohort 404, rate-limit 429, GET 401/403/200, k=5 gate, withdrawal end-to-end, bad UUID 400). **15/15 pass.**

### v3.2.0 final scope: complete

All four sub-phases of Direction 11B shipped (S1 → S4). Mega-release scope
(D5) = Direction 9 + 10 + 11A + 11B all complete. Awaiting v3.2.0 tag.

---

## [3.2.0-rc1] — 2026-05-13

**Release candidate snapshot** of mega-release v3.2.0 in progress. Ships Directions 9 + 10 + 11A complete; Direction 11B (research mode) follows in v3.2.0 final. Tag locks the «shipped scope so far» state before 11B implementation starts.

### Shipped (Directions 9 + 10 + 11A)

- **Direction 9 Phase 9.4 — Hebrew morphology (local-first, offline)** *(2026-05-12, branch `phase-9-4-morphology`)*. Strategic scope-decision (`docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`, 17 load-bearing requirements) overrides the original Phase 9.0 §7 HebMorph-sidecar recommendation: morphology in v3.2 ships as a **fully local, offline-first, in-browser layer** — no Railway cost, no JVM, no installer, sub-millisecond lookups. Same data source as HebMorph (hspell-data-files, AGPL-3.0) pre-computed at build time and shipped as a static asset.
  - **9.4.A** *(commit `daccb19`)* — Roots seed JSON (100 entries with ru/en glosses + common-word arrays) + idle-time loader. Populates the `roots` table (migration 024 schema, no new SQL migration needed). Tier 2 fallback for autocomplete + OOV recovery. Privacy-safe (no events, just telemetry ring buffer).
  - **9.4.B** *(commit `a52c9a1`)* — Word-study UI: live root autocomplete merging seed + user-added roots via UNION (`searchRootsAutocomplete`). Locale-aware gloss rendering (ru/en/he). Keyboard nav (Arrow/Enter/Esc). Binyan select polished — 7 patterns reordered to pedagogical pa'al → nifal → pi'el → pu'al → hif'il → huf'al → hitpa'el order + "other/unsure" option for irregulars.
  - **9.4.C-local** *(commit `0fd95c5`)* — Build pipeline (`scripts/morph/build-morphology.mjs`, ~340 LOC) generates `public/morph/heb_morphology.bin` (~8 MB raw, ~655 KB gzipped on the wire) from real hspell-1.4 running via WSL on a Hebrew corpus. Yields **34 755 normalized keys → 68 826 multi-analysis entries** (#4 — flat-single-best forbidden, Hebrew is structurally ambiguous). Each analysis carries root / lemma / binyan / pos / source / rank / surface / derivation-hint. Shared normalization invariant (`scripts/morph/normalize.mjs` ≡ `public/js/morph-normalize.js`, #15): NFC → strip niqqud/cantillation/format → final-letter base mapping. Provenance recorded in `meta.json` with SHA-256 + build commit (#14 determinism). Prefix-attached forms captured (#16). hspell access path: native `hspell` on PATH OR WSL Ubuntu-24.04 fallback OR stub-only mode.
  - **9.4.D** *(commit `b08f497`)* — Runtime `IMorphologyProvider` chain (`public/js/morph-provider.js`). Tier 1: `LocalDictionaryMorphologyProvider` (lazy fetch on first word_study open, parses to `Map<key, Analysis[]>`, sub-ms thereafter, SW-cached). Tier 2: `SeedAutocompleteMorphologyProvider` (always-on local DB query, covers OOV + user-added). Chain returns first non-empty result. Auto-fill in word-study form: on word input debounce/blur, top-ranked analysis fills `root` + `binyan` IFF empty AND user hasn't touched the field (#9 — manual edits always win). Green-flash CSS animation on auto-fill. Settings panel (`v3MorphologyStatusShow`) shows lifecycle state / entry count / cache size / data provider / license / actions (Update / Clear cache) per #11. Provider abstraction keeps v3.4 Tier 3 (DictaBERT in-browser) and Tier 4 (optional cloud) slottable without consumer changes (#13). Privacy invariant (#17): morphology lookups emit zero events; only lifecycle telemetry to the operational ring buffer (no word content).
  - **9.4.E** *(this commit)* — 36-case smoke test suite (`tests/morphology/smoke.test.mjs`) covering: dictionary integrity, normalization invariant, 7 binyanim, regular + irregular nouns, adjectives, ambiguous forms, prefix-attached, OOV behaviour, schema compliance (root / lemma / binyan / pos / source / rank / surface), build determinism (SHA-256 match), coverage smoke. All 36 pass on the shipped dict. NOTICE.md created at repo root documenting hspell AGPL-3.0 obligation + Nadav Har'El & Dan Kenigsberg copyright. CHANGELOG + deploy + user-side smoke checklist.

- **Direction 9 Phase 9.3.5 — Foundation Reinforcement (Notes Premium redesign)** *(2026-05-11..12, branch `phase-9-3-5-foundation-reinforcement`)*. Mid-flight strategic redesign triggered by 2026-05-12 dogfood: six UX bugs surfaced in 9.3 (anchor disabled after play, sidebar hides on type switch, ghost data on reopen, cryptic toasts for root/binyan, 35-cell target×type matrix noisy, type-memorization burden). Strategic review (see `docs/research/9_3_5_TARGET_TYPE_REDESIGN.md` + `docs/research/9_3_5_STRATEGIC_REVIEW.md`) surveyed Anki/Pleco/LingQ/Obsidian/Notion/RemNote and proposed Option C — lock-at-creation + explicit Convert. Approved 2026-05-12 with WYSIWYG editor scope added.
  - **R1 — Lock-at-creation UX + intent quick-pick + word token picker** *(commit `b053ed0`)*. Removed Target × Type segmented controls (35-cell matrix gone from the UI; remains legal in DB). Modal header shows read-only locked badges. Row-index "+ Новая заметка" → 5 intent buttons (`row.free` / `row.word` / `row.grammar` / `row.translation` / `row.pronunciation`); each maps to a fixed (target_kind, note_type) pair. Word target opens a token picker (space-split heuristic; Phase 9.4 morphology slots in via same `'<sid>:<offset>'` target_id format with no UI change). Anchor button reactive — `play`/`pause`/`timeupdate` listeners re-evaluate `v3NotesAnchorAudioBelongsToModalRow` so the SET button transitions disabled→enabled mid-session (closes Bug 1.1). +25 i18n keys, -15 obsolete.
  - **R2 — WYSIWYG free-note editor + sidebar lift** *(commit `b2ceeba`)*. Replaced the 3-pane Markdown editor (toolbar + textarea + preview + legend) with native `contenteditable` + compact icon-toolbar + selection-bubble + markdown shortcuts. 8 inline/block formats: B / I / code / highlight / list / quote / link / heading. Selection bubble pops above the highlighted range (Medium/Notion pattern), 5 quick-format buttons. Markdown shortcuts auto-format inline (`**x**` → `<strong>`, `*x*` → `<em>`, `==x==` → `<mark>`, `# ` → `<h2>`, `- ` → `<ul>`, etc.). Hidden `<textarea id="v3NotesText">` retained as markdown serialization buffer so all save paths stay unchanged. New `v3NotesHtmlToMd` roundtrip-safe converter. History sidebar lifted out of the editor split container so it stays visible regardless of which template form is showing (closes Bug 1.2). Rationale for native-not-TipTap: ~600 LOC custom vs ~150 KB external + COEP/CORP fiddling + duplicate Hebrew RTL machinery; vanilla-JS monolithic codebase has no build step. Hebrew RTL + niqqud work natively via `dir="auto"` per paragraph. See `docs/research/9_3_5_WYSIWYG_DECISION.md`.
  - **R2.1 — Bug closure (bubble theme + sort + badge persistence)** *(commit `5087386`)*. Bubble icons were light-on-light in light theme; fixed by hardcoding dark surface (`#1e293b`) + light foreground regardless of theme. Row-index list sorted by `updated_at DESC` pushed first-created free note to the bottom; switched to `created_at ASC` (Anki / RemNote convention — notes appear in creation order). Count badge `📝 N` was off-by-one and lost on page refresh; root cause: `v3NotesUpdateButtonRow` read from a lazy main cache populated on row click (empty on cold load), AND save-flow timing read the cache BEFORE invalidation. Fixes: new `getRowNoteCounts(text_id)` API (single UNION query covering sentence + word targets), new `v3NotesRowCountsPrime(text_id)` bulk-prime on text load (wired into 3 ingest call sites), new dedicated count cache populated by both prime and per-row refresh, save/delete flow ordering — invalidate + await refresh BEFORE redrawing the row button in all 4 paths (legacy save/delete + polymorphic save/delete). Polymorphic save now updates badge for ANY sentence/word note, not just sentence/free.
  - **R3 — Convert flow + SRS warn** *(commit `63af80e`)*. Two-step Convert UX: anchored dropdown under the 🔄 button → confirm dialog with body archive promise + optional SRS warn banner. New `convertNoteType(id, newType)` API in local-db.js — snapshots current `body_json` as a new `note_versions` row via `_appendNoteVersion + _trimNoteVersions(50) + _stampVersionDiffSummary`, writes a blank body for the new type (free → empty markdown; templated → empty body object), bumps `updated_at`. `target_kind` / `target_id` stay fixed — convert changes content shape, not anchoring. New event `note_type_convert` (metadata only: note_id + from_type + to_type + flags). +15 i18n keys × 3 locales.
  - **R4 — DB-level bug-closure invariants** *(commit `83371a2`)*. 8-test suite in `public/db/notes-v2-test.html` locking in R1+R2.1+R3 invariants: Bug 3 (created_at ASC), Bug 2 (getRowNoteCounts UNION query + word-target prefix), R3 convert snapshot/blank/preserve-anchor/idempotence semantics, SRS card behavior on convert, API surface assertion.
  - **R2.2 — Close 8 dogfood-3 bugs** *(commit `dc5a759`)*. Second dogfood pass surfaced eight regressions in R1+R2+R3. (1) Row-click now ALWAYS opens row-index, even on empty rows — the panel's empty state already shows 5 intent buttons. (2) Multi-Free notes per row: `v3NotesOpen` treats `opts.intentKey` as a fresh-state signal (skips legacy pre-fill from `v3NotesGet` AND skips `v3NotesRestoreNoteIdIfMissing`), and `v3NotesSave` retires the legacy `upsertNote` branch entirely; each fresh "+ Свободная" save produces a new `notes_v2` row. (3) Row-button `📝 N` badge survives non-hover — `row-note-active` CSS class now driven by `v3NotesRowCount(sid) > 0` in addition to the legacy free-note cache, covering polymorphic-only rows. (4) Close button returns to row-index, not main screen — new `v3NotesModalReturnContext` tracks row-index origin across modal transitions; `v3NotesForceClose` re-dispatches `v3NotesRowEntryDispatch` with the captured context. Token-picker cancel honors the same context. (5) "🎴 ✓ В SRS" now opens SRS Trainer directly via `v3SrsTrainerOpen()` (earlier hash-based routing was a no-op). (6) Convert drops the linked SRS card instead of leaving an unrenderable orphan — `convertNoteType` deletes the card + reviews + nulls back-pointer; warn banner copy updated in 3 locales to promise removal. (7) One-time orphaned-card sweep on Trainer open via new `srs.cleanupOrphanedNoteCards()` — catches pre-R2.2 broken cards (cards whose `template_id` no longer matches the linked note's `note_type`). (8) Toast container z-index bumped 9999 → 100001 so success toasts render above modals; history diff pane max-height 240px → `min(60vh, 520px)` so multi-line v_N bodies are scannable.
  - **SRS scope decision** *(commit `f6213c8`)*. After R2.2 dogfood the user flagged the in-app Trainer as significantly behind Anki. Approved 2026-05-12 scope revision: LinguistPro is the *creation + linkage* layer; **Anki is the recommended review layer**. In-app Trainer stays as functional stub; premium SRS (FSRS-4.5 + Anki Connect sync + premium Trainer UX) deferred to **v3.4 Premium SRS Epic** (post-diploma). Research-mode retention metric replaced with `cards_exported_to_anki / cards_added_to_srs` engagement-mastery proxy; full retention validation gated on v3.4 Anki Connect bidirectional sync. See `docs/SRS_STRATEGY_v3_2.md` for the full decision record. PREMIUM_NOTES_PLAN M6 rewritten under new scope; ULPAN_RESEARCH_PLAN Layer-2 metrics updated.
  - **R5 — Onboarding refresh + Anki CTA banner + research event** *(commit `106fd33`)*. Row-index help-card body simplified (drops the SRS-card mention). Help-popover SRS section rewritten in 3 locales to reflect Anki-primary scope: *«Карточки создаются здесь, повторение — в Anki через 📥 Экспорт»*. New help-popover Convert section explains lock-at-creation + the SRS-drop-on-convert behavior. New dismissible "Повторяете в Anki?" CTA banner on SRS Trainer home view — opens existing `btnAnki` dialog directly. localStorage-gated dismiss (`srsAnkiCtaDismissed_v1`). New event `srs_card_exported_to_anki` emitted at success of both Anki export entry points (bulk-dialog + IDE single-card) — metadata only (counts + deck/model names + source field). Registered in `CONTRACTS_ANALYTICS.md`. Replaces in-app `srs_review` as the v3.2 mastery-proxy signal for research-mode (per SRS_STRATEGY).
  - **R6 — Final docs + smoke** *(this commit)*. CHANGELOG + WYSIWYG decision doc + PREMIUM_NOTES_PLAN final-state update + R6 smoke checklist.
  - **Test coverage**: notes-v2 suite at **67/67** (+10 cases for R2.1 + R3 + R2.2 + R5: `getRowNoteCounts`, `listNotesForRow created_at ASC`, `convertNoteType` snapshot/blank/preserve/idempotence/SRS-drop, `cleanupOrphanedNoteCards`, API export checks). Events emission 24/24 (+1 for `srs_card_exported_to_anki`). 0 new JS errors on `index.html` cold load.

### Phase 9.3.5 — Stubbed / deferred

- **In-app SRS Trainer premium UX** → v3.4+ Premium SRS Epic. Current stub stays functional (SM-2 grade + review). See `docs/SRS_STRATEGY_v3_2.md`.
- **Anki note-card .apkg bundling** (sentence-cards + note-cards in one .apkg per text) → R5.1 follow-up commit OR v3.4 Premium SRS Epic. R5 ships only the entry-point CTA + event emission; underlying export still bundles sentence-cards only.
- **Phase 9.4 morphology (HebMorph)** continues as planned — token-picker target_id format `'<sid>:<offset>'` already locked in R1 so morphology slots in without UI change.


- **Direction 9 Phase 9.1 — Foundation COMPLETE** *(2026-05-10..11, branch `worktree-agent-ad33453576637a27d`)*. All 5 sub-phases shipped: 9.1.A schema migrations + 9.1.B polymorphic API + 9.1.C modal UI revamp with premium hardening + 9.1.D bundle compat + 9.1.E i18n finalization. Test counts evolved 18 → 38 → 39 → **42** notes-v2 cases; events-emission stable at 23/23 throughout. See `docs/research/9_1_FOUNDATION_FINAL_REPORT.md` for the full closure record.
  - **9.1.A** *(commit `8da394e`, merged to main)*: migrations 021–025 — `notes_v2` polymorphic table, `note_versions`, `note_links`, `roots`, `sentence_notes` → notes_v2 data migration + read-only VIEW shim. 64k body_json cap + json_valid CHECK invariants. Diagnostic helpers `dbQuery` / `dbRun` exported. **18/18 tests**.
  - **9.1.B** *(commit `3a45833`, merged to main)*: notes API rewritten on top of new schema. Backwards-compat preserved (legacy `upsertNote/listNotes/deleteNote/searchNotes/resolveNote` work through VIEW + new schema). New polymorphic helpers: 16 exports including `createNote/updateNote/deleteNoteById/listNotesByTarget/listAllNotesForText/getNoteById/searchAllNotes/listNoteVersions/restoreNoteVersion/setNoteLinks/listOutgoingLinks/listBacklinks/seedRoots/searchRootsAutocomplete/getNotesSmartCollectionsSummary/getTextIdsForNotesSmartChip`. `updateNote` auto-snapshots versions with `+N/-M` diff_summary + 50-FIFO retention. `restoreNoteVersion` itself versioned. **38/38 tests**.
  - **9.1.C** *(branch-only, commits `949a932..a2d6efa`)*: Notes modal UI revamp + premium polish + hardening pass. Initial 5-stage agent implementation: target picker (7 kinds: sentence/word/root/binyan/text/note/free), note type switcher (5 kinds), M5 versioning sidebar with per-line diff view, M7 Library smart-chips (4 new: with-note/audio-noted/srs-noted/templated). Interactive premium polish: dynamic modal title per target_kind, i18n stubs, a11y focus rings, dark-mode contrast. Hardening pass closed 1 High + 5 Medium issues: H1 race condition in `_appendNoteVersion` → retry-on-conflict + new test; M1 delete confirm dialog (Direction 6 baseline); M2 i18n hooks for status strings; M3 Library smart-chip cache invalidation; M4 note-target self-loop prevention; M5 ~150 lines dead code removed (legacy `v3NotesForceClose`, `v3NotesBindHotkeysOnce`). **39/39 tests** + new H1 race case.
  - **9.1.D** *(branch-only, commit `d439683`)*: bundle compat via web-only `library/notes_advanced.json` file in ZIP. Android v2 schema_version=1 preserved; Android ignores unknown ZIP entries. Web→web roundtrip preserves full notes_v2 + 50-FIFO versions + outgoing links + user-customized roots. FK rewiring with 3 maps (textId/sentenceId/noteId) + sentence-bound free note MERGE semantics (no duplicate on collision). Manifest carries `notes_advanced_path` + `notes_advanced_present` flags. **42/42 tests** (+3 bundle roundtrip cases).
  - **9.1.E** *(branch-only)*: i18n finalization. ~90 new keys authored for `ru` / `en` / `he` locales across `notes.*` / `library.*` / `confirms.*` / `toast.*` namespaces. `noteTooLong` cap updated 16000 → 65,536 to match schema. Hebrew translations machine-grade; native review scheduled before Direction 11 ulpan deployment. Final regression: **23/0 events + 42/0 notes-v2 + main app 0 new JS errors**.
  - **Phase 9.3 — Templates + Links + SRS micro-cards (M3 + M4 + M6)** *(branch `phase-9-3-templates-links-srs`, 2026-05-11)*. Three milestones in one branch.
    - **M3 — Templates**: 4 structured forms for the non-free note types. `word_study` (word + niqqud + root + meaning + POS + binyan + mnemonic + example), `grammar_rule` (title + body + examples[] + counterexamples[] + tags[]), `translation_discrepancy` (source + seen + suggested + reasoning), `pronunciation_note` (word + IPA + common_mistakes; reuses Phase 9.2 audio anchor). Required-field validation surfaces missing fields by label in the toast. Switching `note_type` mid-edit stashes the current type's body so flipping back doesn't lose work (objects for templated, strings for free). The legacy "⏳ Phase 9.3" placeholder banner is retired.
    - **M4 — Links**: collapsible "🔗 Связи" panel below the body with outgoing + backlinks sections. Add via kind-selector + target input + optional alias; remove via per-chip ✕. Backlink chips are clickable — they close the current modal and open the source note. New atomic `addNoteLink` / `removeNoteLink` API replaces the wasteful "fetch all + setNoteLinks" pattern. INSERT OR IGNORE makes re-adding the same edge a no-op. Bundle export/import already covers `note_links` via 9.1.D.
    - **M6 — Note → SRS**: new modal-footer button "🎴 Сделать карточкой" (templated notes only); confirm dialog → `srs.createCardFromNote` → toast → button flips to "🎴 ✓ В SRS" + clicks navigate to the trainer. **Migration 026** seeds 4 SRS card templates with `card_kind='note'` (`tpl_note_word_study/grammar_rule/translation_discrepancy/pronunciation_note`), idempotent INSERT OR IGNORE. `notes_v2.srs_card_id` back-pointer set on conversion; re-conversion returns the existing card.
    - **Premium quality**: dark mode + RTL verified everywhere; focus-visible rings; `prefers-reduced-motion` honored. ~50 new i18n keys per locale (RU/EN/HE) covering field labels + placeholders + POS/binyan select options + toasts + confirms. Tests: **57/57** notes-v2 (+10 cases — 4 template roundtrips, link atomic helpers, free-note conversion rejection, etc.) + 23/23 events + 0 new JS errors.
    - **Deferred to v3.3**: multi-card-per-note (today one card per note), trainer-side renderer for `card_kind='note'` (cards are created and listable; reviewing them with proper front/back rendering follows in `/srs` page work).
    See `docs/research/9_3_TEMPLATES_LINKS_SRS_PLAN.md` and `docs/research/9_3_TEMPLATES_LINKS_SRS_REPORT.md`.
  - **Phase 9.2 — Audio anchoring (M2)** *(branch `phase-9-2-audio-anchoring`, 2026-05-11)*. A premium chip inside the Notes modal lets the user pin the note to a specific moment within the row's TTS audio. While the row's audio is playing, the SET button shows live current-time ("📍 Привязать к 0:01.4" → "0:01.5" → …) — click locks the moment. Once anchored, the chip flips to "📍 0:04.5 ▶︎" (clickable to seek + play from that point) + a separate ✕ to clear. Alt+A hotkey toggles set/clear while the modal is focused. Anchor persists on `notes_v2.audio_anchor_ms`, survives modal close/reopen via `v3NotesRestoreNoteIdIfMissing` + `v3NotesAnchorLoadForCurrentNote`. Row notes badge gets a 📍 sub-overlay when the sentence's free note has an anchor — visible without opening the modal. Smart-chip "📍 Audio-noted" already wired in 9.1.C now lights up. Bundle export/import roundtrip preserves anchors; replay from anchor on bundle-imported rows inherits 9.1.F's HEAD pre-flight → fresh regen on cache miss. RU/EN/HE locales got 10 new keys each; digit cluster uses `dir="ltr"` + `font-variant-numeric: tabular-nums` so timestamps render Western-ordered inside the HE-RTL modal. Dark mode + `:focus-visible` + `prefers-reduced-motion` all honored. **47/47** notes-v2 (+4 cases) + 23/23 events + 0 new JS errors. **Bonus fix**: discovered and closed a pre-existing Shape A import bug — `item.rows → sentences` reshape inside `importBundle` was silently dropping `row_id`, which left `oldToNewSentenceId` unpopulated and caused sentence-targeted polymorphic notes from `notes_advanced.json` to be dropped on import. See `docs/research/9_2_AUDIO_ANCHORING_REPORT.md`.
  - **9.1.F post-smoke hardening** *(branch-only, prior commit)*: three bugs caught during user smoke-check addressed.
    1. **Versioning semantics rewritten** — `v_N` now snapshots the body **after** the N-th save (was "previous body before update", which produced confusing "v1 = first edit" displays where the latest edit was never visible). `createNote` and `upsertNote` (legacy free notes) now both seed `v1` so history is meaningful from the first save. `restoreNoteVersion` snapshots the restored body as a new version, not the pre-restore body. Plus the **reopen fix**: `v3NotesOpen` now back-fills `v3NotesModalNoteId` from `notes_v2` via async lookup when a sentence-bound row is reopened, so the History sidebar shows existing versions across modal close/reopen cycles (was empty until the next save). New test `createNote seeds v1 = body at creation (snapshot semantics)`; existing version tests updated to match. **43/43 notes-v2**.
    2. **Notes Preview / textarea / sentence-ctx theming** — replaced hardcoded `background: #fff` (and no explicit `color`) with `var(--theme-bg-card)` + `var(--theme-text-primary)` everywhere in the modal so dark mode is readable (was white text on white background on Preview block).
    3. **Row TTS bundle-import bug** — Row TTS now does a HEAD pre-flight against `/api/audio/<key>` before setting `<audio>.src`, falling through to fresh TTS generation on cache miss instead of bubbling up `MEDIA_ERR_SRC_NOT_SUPPORTED` ("Failed to load because no supported source was found"). Tightened server: `POST /api/audio/cache/upload` now returns `ok:false` + 500 when `writeMp3IfNotExists` fails, instead of `ok:true` masking the write error.

- **Direction 9 Phase 9.0** — Hebrew root extractor research *(two-phase, 2026-05-10)*:
  - **v1** *(commit `39230f8`)* — initial recommendation Plan B+C (manual + autocomplete + seed dictionary). Cause: AGPL libraries (HebMorph, hspell) vetoed when commercial-friendly licensing was assumed.
  - **v2 / re-research** *(commit `6f5c1ad`)* — user clarified app is non-commercial open-source → **AGPL unlocked**. New recommendation **Option A: HebMorph sidecar** for native root extraction (250K word forms, 10+ years production maturity via Elasticsearch Hebrew plugin). Plan B+C retained as graceful offline/OOV fallback — three-tier layered architecture.
  - **Net for v3.2:** Phase 9.4 ships premium-tier auto-extraction. Effort revised 2.5–3.5d → **5.5–7d** (+3d). New endpoint `POST /api/morphology/v1/analyze` (stateless, same baseline as `/api/transliterate`). Risk Low → Medium (operational sidecar uptime; mitigated by graceful client-side fallback).
  - **v3.3 follow-up:** DictaBERT in-browser via transformers.js becomes new highest-priority morphology epic — fully-offline premium upgrade.

- **Direction 11A — Analytics Foundation** *(2026-05-10, commits `7ed309f` → `3f6b959`)*. Closes the long-standing CONTRACTS_ANALYTICS drift (Tier 0 audit gap) и переводит time-spent на heartbeat-based real measurements, useful to all users (not only research mode).
  - **Phase 11.0:** 12 event types wired into `events` table — `text_open`, `text_close`, `play_audio`, `save_note`, `note_edit`, `srs_review`, `srs_session_started`, `srs_session_finished`, `search_query`, `smart_tag_override`, `translit_toggle`, plus legacy `row_tts` preserved for backwards-compat. New `v3Emit()` helper + privacy-strict invariants enforced (no raw text / note bodies / search query strings ever leak — see `docs/CONTRACTS_ANALYTICS.md § 0`).
  - **Phase 11.1:** heartbeat-based session tracking with idle gating (5 min) + visibility gating + max-session cap (60 min). Three new aggregation API exports in `local-db.js`: `getActiveMsReal()`, `getActiveMinutesByDay()`, `getSessionMetrics()`. `getAnalytics()` shape evolved with new `active_ms_real` field alongside legacy `time_ms` (backwards-compat preserved). 23/23 browser-driven Playwright tests pass.
  - **Test page:** `public/db/events-emission-test.html` — runs all 12 emit + Phase 11.1 aggregation tests in browser; can be visited any time at `/db/events-emission-test.html`.

### Planned
- **Direction 9 — Premium Notes Redesign** (~13–17 days): polymorphic note targets (sentence / word / root / binyan / text / note / free), 4 templates (word_study / grammar_rule / translation_discrepancy / pronunciation_note), audio-anchored notes, bidirectional links + backlinks, versioning + diff (50 versions retention), note → SRS micro-card, Hebrew root extractor research. Schema migrations 021–025. Bundle compat preserved (sentence-bound free notes inline; advanced notes in new `library/notes_advanced.json` web-only). See [`docs/PREMIUM_NOTES_PLAN_v3_2.md`](docs/PREMIUM_NOTES_PLAN_v3_2.md).
- **Direction 10 — Text-card System** (~7–8.5 days): three-mode lifecycle (Mode A bulk builder / Mode B peer-share via lightweight JSON exploiting content-addressed audio cache / Mode C curator request with Standard-vs-Curated split). v3.2 без новых server endpoints. See [`docs/TEXT_CARD_PLAN_v3_2.md`](docs/TEXT_CARD_PLAN_v3_2.md).
- **Direction 11A — Analytics Foundation** (~5–7 days, ships independently): closes CONTRACTS_ANALYTICS gap (12 event types), heartbeat-based time-spent v2, improves Activity Heatmap accuracy for all users.
- **Direction 11B — Research Mode** (~11–14 days): opt-in privacy-preserving research infrastructure for ulpan diploma project. Anonymous student_id + cohort code + daily aggregate uploads + new endpoint family `/api/research/v1/*` (architectural exception: aggregates only, no PII) + teacher dashboard `/teacher.html` + IRB-style consent. See [`docs/ULPAN_RESEARCH_PLAN_v3_2.md`](docs/ULPAN_RESEARCH_PLAN_v3_2.md), [`docs/RESEARCH_METRICS_SCHEMA.md`](docs/RESEARCH_METRICS_SCHEMA.md), [`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`](docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md).

### Deferred → v3.3
- Functional code-split монолита `public/index.html`.
- Sherpa adapter lazy-load.
- Knowledge-graph view для notes (Direction 9 M8).
- Server-side TTL share-cache + short public URLs (Direction 10 v3.3 epic).
- End-to-end encryption на text-card share.
- Calibrated in-app diagnostic quiz.
- Multi-cohort comparative dashboard.
- Premium table-edit mechanics (long-press DnD).

### Documentation prep (2026-05-10)
- New plan docs: `PREMIUM_RELEASE_PLAN_v3_2.md`, `PREMIUM_NOTES_PLAN_v3_2.md`, `TEXT_CARD_PLAN_v3_2.md`, `ULPAN_RESEARCH_PLAN_v3_2.md`, `RESEARCH_METRICS_SCHEMA.md`, `RESEARCH_ETHICS_CONSENT_TEMPLATE.md`.
- Tier 0 audit reconciliation: `PREMIUM_RELEASE_PLAN_v3_1.md` audit checklist updated to reflect actual shipped state (16 feedback Tier 1+2 items + WCAG + sticky bar + suspend semantics flipped to `[x]`); honest gaps preserved as `[ ]` или `[~]` with cross-references to v3.2 directions.
- Plans archived (superseded): `FINAL_RELEASE_PLAN.md` → `FINAL_RELEASE_PLAN.archived-2026-05-10.md`; `LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.md` → `LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.archived-2026-05-10.md`.
- I18N_PREMIUM_COMPLETION_PLAN re-stated as COMPLETE.
- NAV_CODEMAP `(deferred)` markers removed (sticky bar давно работает).
- ROADMAP_PREMIUM P3/P4/P5/P6 statuses updated to reflect v3.1 partial closures + v3.2 cross-references.
- Top-level README Roadmap section expanded с v3.2 scope.

## [3.1.0] — 2026-05-10

**Premium polish release.** Восемь directions из [Premium Release Plan v3.1.0](docs/PREMIUM_RELEASE_PLAN_v3_1.md) — все `[x]`. Релиз о цельном premium-качестве: типография, темы, локализация, onboarding, smart-sort, error gentleness, PWA, trust signals. Никаких новых тяжёлых фич — каждый экран ощущается так же продуманно, как feedback-модалка.

Совместимость: ZIP-bundle формат не менялся (unified Android v2 spec из v3.0.0). OPFS-схема расширена миграцией 020 (`manual_smart_tag` column) — backwards-compatible, авто-применяется при upgrade.

### Added

#### Direction 1 — Hebrew typography & RTL
- Self-hosted woff2 шрифты в `public/fonts/`: Frank Ruhl Libre / Assistant / Noto Sans Hebrew (3 веса × 3 шрифта = 9 файлов, ~167 KB total). `font-display: swap`, premium fallback chain.
- Premium Hebrew rendering: `font-feature-settings: kern + calt + liga`, `text-rendering: optimizeLegibility`, line-height-1.65 для никуда.
- Bidi-isolation в mixed-content строках (иврит + русский + английский).
- Visual regression page `/typo-test.html` со всеми сложными комбинациями огласовок.

#### Direction 2 — App-wide theming (light / dark / auto)
- CSS-variable foundation на `:root` — 12 светлых + 12 тёмных переменных, shadow-trio, density tokens.
- Три режима: `light` / `dark` / `auto` (по системной prefers-color-scheme), persistent в `localStorage.appTheme_v1`.
- **Pre-paint inline boot** в `<head>` — блокирует FOWT (Flash Of Wrong Theme) перед первым кадром.
- Toggle `🌗` в IDE header + Classic toolbar (cycle auto → light → dark).
- Density modes (compact / comfortable / spacious) через `body.theme-density-*` + `localStorage.appDensity_v1`.
- Live-react на изменения OS-темы через `matchMedia`.
- Inline-style overrides для legacy hardcoded цветов (`#fff`, `#0f172a`, `#475569`) через theme-aware selectors.

#### Direction 3 — Full i18n coverage
- **3 локали**: русский, английский, **עברית** (с автоматическим RTL `dir`).
- **Phase 1**: smart-chip strings + 8 high-traffic toasts мигрированы.
- **Phase 2**: остальные ~120 hardcoded `showToast("…")` callsites мигрированы на `t("toast.*")` с поддержкой параметров (`{error}`, `{count}`, `{done}/{total}` etc.). Составные сообщения переписаны как композиция `t() + (cond ? t() : "")`.
- **Verification**: финальный `grep` по hardcoded toast-литералам в `public/index.html` = 0.
- Динамически отрендеренный контент реагирует на `i18n:changed` event без перезагрузки.

#### Direction 4 — Onboarding & discovery
- First-time welcome modal с двумя CTA: «Попробовать на демо» / «Начать с моего текста».
- Inline 5-предложение Hebrew demo с автоматической установкой языка `he-IL`.
- Persistent decision via `localStorage.onboardingSeen_v1`.
- Кнопка «Сбросить onboarding» в About modal для повторного показа.

#### Direction 5 — SRS + Library smart-sort
- **Activity heatmap** в Dashboard (GitHub-style 7×~30 grid за 30 дней, цвет → интенсивность).
- **Library smart-filter UI**: 4 чипа `⏱ Недавние / 🔥 Сложные / ✓ Освоено / ✨ Новые с прошлого визита`. Persistent в URL hash (`#smart=struggling`), one-click ✕ clear, mobile-responsive (2-up grid на ≤600px), full theme-aware.
- **Manual smart-tag override** (миграция 020): пользователь может вручную пометить карточку как «🔥 Сложно» / «✓ Освоено» через Text Meta Edit, переопределяя SRS-derived auto classification. Inline badge на library card.
- Last-visit timestamp tracking в `localStorage.v3LibraryLastVisit_v1` для «Новые с прошлого визита».
- Foundation helpers в `local-db.js`: `getActivityHeatmap`, `getStrugglingTexts`, `getMasteredTexts`, `getTextsCreatedAfter`, `setManualSmartTag`, `getManualSmartTag`.

#### Direction 6 — Error gentleness app-wide
- Все active-path `alert(...)` / `window.confirm(...)` callsites переведены на `v3ConfirmModal` / `showToast`.
- Остались только 3 fallback-path вызова (внутри самого `v3ConfirmModal`-ultimate-fallback, в feedback Phase6 alert try-catch, в WA-confirm fallback).
- В `public/index.html` нет ни одного destructive blocking-диалога в active code path.

#### Direction 7 — Performance / PWA
- **manifest.json** с `id`, `scope`, `start_url`, standalone display, тремя app shortcuts (Library / SRS / Dashboard), theme/background colors.
- **Icon set**: vector SVG + 192/512/512-maskable/180/32 PNG. LP monogram на slate-900 с blue accent bar (premium signal). Генерируется pure-Node скриптом `scripts/generate-pwa-icons.js` без external deps (built-in `zlib` для IDAT). Re-runnable через `npm run pwa:icons`.
- **PWA meta tags**: `theme-color` (light/dark via media query), `apple-touch-icon`, `apple-mobile-web-app-capable` + `status-bar-style`, `application-name`.
- **Tiered Cache-Control** на статику: fonts/icons immutable (1y), JS modules must-revalidate (1d), shell entry points (`index.html`, `manifest.json`, `sw.js`) no-cache.
- **JSZip lazy-load** (~95 KB сэкономлено на cold start). `v3LoadJSZip()` идемпотентный helper по образцу `v3FbLoadQr()` (qrcode.js уже был lazy).
- **Service Worker** (`public/sw.js`) с тремя стратегиями:
  - **Precache** (install): app shell + i18n + DB layer + TTS layer + fonts + icons. Полный offline cold start после первой загрузки.
  - **Stale-while-revalidate** (runtime): остальная same-origin статика (lazy modules, /typo-test.html, /mockups/*).
  - **Network-first** с timeout 2.5s + cache fallback: `/api/client-config`.
  - **Network-only**: все остальные `/api/*` (translate, tts, audio, transliterate, export-docx, feedback) — кеширование исказило бы корректность (квоты, состояние, upload).
- **Premium update UX**: новый SW устанавливается в `waiting`, не выполняет `skipWaiting()` автоматически. Приложение показывает toast «Доступно обновление» с кнопками «Обновить» / «Позже» — пользователь контролирует момент применения.
- **Cache invalidation** на activate, versioned cache names (`linguistpro-precache-v3.1.0-pwa-1`), `clients.claim()`.
- **Module preload hints**: `<link rel="modulepreload">` для `sqlite-api.js` / `local-db.js` / `i18n/index.js` — параллельная загрузка с HTML parsing.
- **Removed**: vestigial `fonts.googleapis.com` `<link>` из `<head>` (Direction 1 self-hosted woff2 сделал его dead code).

#### Direction 8 — Trust signals + content polish
- Footer на всех экранах: «🔒 Данные на этом устройстве» badge → `docs/OPFS_USER_GUIDE.md`, version + commit, GitHub link, Privacy link.
- About modal с full credits, license, dependencies, onboarding-reset кнопкой.
- `docs/PRIVACY.md`.
- Version из `package.json` через `/api/client-config`.

### Changed

- README — теперь premium WOW-first-impression top-level entry point.
- `docs/PREMIUM_RELEASE_PLAN_v3_1.md` — live-status переключён на complete для всех 8 directions.
- Server static-asset middleware — теперь tiered Cache-Control вместо одного дефолта.
- `package.json` version bumped 3.0.0 → 3.1.0.

### Fixed

- **Theming regressions** (Direction 2 follow-ups): premium color-system rework для table / headers / cards / panel cards / modal headers / mobile bottom-sheet / mobile card overflow / source-link colour / filter chip / heatmap cell outline.
- **IDE checkbox dark-mode**: column-settings panel («Настройки таблицы сохранены на устройстве») использовал hardcoded `#f8fafc` background, в dark theme labels становились white-on-white. Switched to `var(--theme-bg-muted / border-soft / text-primary / accent[-hover])`.
- **Library bundle export**: notes preserved в `exportBundle` (раньше CASCADE-related path терял notes для архивированных текстов).
- **Premium pipeline**: madlad fallback restoration + SBL gemination edge case.
- **Classic mode toggle**: contract restoration (placement + visibility).
- **IDE table headers**: refresh on locale change (i18n event listener).
- **Table editing** (post-Direction-1 follow-up): consecutive moves + mobile reorder/cell-editing; `tbl-edit-mode` class restoration after `renderTable`.

### Documentation

- New: [`docs/PWA.md`](docs/PWA.md) — install, offline, update lifecycle, troubleshooting, cache versioning, icon regeneration, deferred items.
- New: top-level [`README.md`](README.md) — WOW-first-impression entry point with what / why / how / architecture / roadmap.
- Updated: [`docs/PREMIUM_RELEASE_PLAN_v3_1.md`](docs/PREMIUM_RELEASE_PLAN_v3_1.md) — live-status finalized.
- Updated: this entry.

### Deferred → v3.2

- **Functional code-split** (Dashboard / SRS / IDE → отдельные dynamic-import ES-модули). Требует extraction inline `<script>` блоков из 30k-line `public/index.html` в ES-модули с явными imports/exports вместо `window.*` глобалов. Out of scope для v3.1.0 ради стабильности; v3.1.0 шипает PWA как **продукт** (install, offline, fast), а не как архитектурный refactor монолита.
- **Sherpa adapter lazy-load** (~13.7 KB) — небольшая экономия, но в чувствительной TTS startup-sequence.
- **Premium table-edit mechanics** — отложено per `docs/` backlog.

### Tooling

- New npm script: `npm run pwa:icons` → запускает `scripts/generate-pwa-icons.js`.

## [3.0.0] — 2026-05-08

Большой релиз: полный переход на offline-first архитектуру (OPFS + wa-sqlite),
агрессивная очистка серверных stateful-эндпоинтов, премиум-UX bundle.

### Breaking changes
- `localMode` теперь дефолтный — пользовательская библиотека хранится
  в OPFS (Origin Private File System) браузера, не на сервере.
- Серверные stateful API (`/api/library/*`, `/api/srs/*`, `/api/progress/*`,
  `/api/history/*`, `/api/notes/search`, `/api/sentences/search`,
  `/api/nav/resolve`, `POST /api/library/import`) возвращают `410 Gone`.
  Helper-функции в `server.js` сохранены для отката, но обработчики
  закрыты middleware `gone410`.
- Опт-аут (`localStorage.localMode='0'`) формально работает, но не имеет
  смысла — серверные ручки 410 Gone, в server-mode библиотека неработоспособна.
- Тест `tests/storage_location_audit.test.js` удалён — он документировал
  pre-Phase-6 контракт «данные на сервере», который инвертирован релизом.

### Added — Phases 0–5 (offline-first foundation)
- **Phase 0:** wa-sqlite (sync + async Asyncify) + VFS fallback chain
  (`AccessHandlePoolVFS` → `IDBBatchAtomicVFS`) + sticky VFS preference;
  19 SQLite миграций; `/db/db-init-test.html` с 16 тестами.
- **Phase 1:** все чтения из OPFS (texts/sentences/notes/audio_assets
  с JOIN, search, nav resolve, recent activity).
- **Phase 2:** все записи (CRUD, JSON+ZIP экспорт/импорт, stateless
  `POST /api/export/docx`).
- **Phase 3:** локальная аналитика (`getAnalytics({days, includeArchived})`),
  dashboard refresh, recent-rows из events.
- **Phase 4:** SRS-режим (templates, today/summary, sessions, review,
  trainer-view); премиум Anki-экспорт с кастомной моделью
  `LinguistPro SRS Card v1` и fuzzy grading.
- **Phase 5:** ZIP-bundle с аудио в unified Android v2 формате;
  re-upload MP3 в Railway audio-cache; 2-фазный импорт (texts → audio).

### Added — Pre-Phase-6 consolidated plan (A/B/D bundle)
- **A1:** first-open migration prompt с тремя кнопками (перенести /
  начать с чистого листа / решу позже).
- **A2:** mobile dogfood прошёл на iPhone iOS 17+ и Android Chrome.
- **A3:** cross-device ZIP roundtrip — Kotlin strict-schema compliance
  для Android v2 import (language default `'he-IL'`, content_hash explicit
  null, created_at/updated_at fallback к export-ts, tags coerce).
- **A4:** concurrent-tabs guard через `BroadcastChannel` — non-blocking
  minimisable banner.
- **B1:** storage quota monitoring (`navigator.storage.estimate()` widget +
  80%/95% thresholds в save-path).
- **B2:** migration failure rollback — per-text atomicity в `importBundle`
  через `deleteText`/CASCADE + `rollbackImportedTexts` +
  `window.v3Phase6UndoLastMigration`.
- **B3:** in-memory undo для delete-text — snapshot через
  `exportBundle({textIds})` + `v3UndoToast` 7s window.
- **B4:** per-IP rate limiting на stateless endpoints (60/min transliterate,
  30/min export-docx, 2000/min audio-cache-upload — после hotfix).
- **B5:** OPFS pre-Phase-6 telemetry (`window.v3OpfsTelemetry.list()` /
  `.summary()`).
- **D1:** user-facing OPFS storage guide (`docs/OPFS_USER_GUIDE.md`).
- **D2:** header trust audit — `requireSameOriginJson` middleware на
  stateless POSTs (Content-Type + Origin/Referer guard).
- **D3:** PRAGMA integrity_check on startup — idle-time после init.
- **D4:** notes audit Test 16 — multi-line/Unicode/2KB/RTL/JSON-shaped
  notes survive roundtrip + CASCADE при deleteText.
- **D5:** kill switch — env-var `KILL_LOCAL_MODE=1` на Railway →
  `/api/client-config` отдаёт `flags.killLocalMode=true` → 15-min cached
  на клиенте → принудительный сброс LOCAL_MODE без app-deploy.

### Added — Phase 6 release
- `LOCAL_MODE` теперь true по умолчанию (`localStorage.localMode !== '0'`).
- A1 prompt fires для всех первого-разовых посетителей; copy переписан
  под пост-flip реальность.
- `gone410` middleware на стейтфул-эндпоинтах.
- `GET /api/library/export(/bundle)` сохранён для last-mile recovery.

### Added — Premium UX (cross-cutting)
- Card-level TTS profile auto-apply + cache-first playback.
- Multi-select + bulk delete/archive в Library.
- Wipe-all с type-confirm modal.
- VFS fallback chain для mobile (iPhone iOS 17+, Android Chrome).
- One-time server→OPFS migration кнопка («Импорт из облака»).
- Stateless `POST /api/transliterate` + LOCAL_MODE lazy-fill при открытии
  карточки (восстановление translit для legacy-данных).
- Reconcile audio links после `importBundle` для уже существующих текстов.
- Diagnostic helper `window.__localDB.audioLinkDiag(titleSubstring)`.

### Fixed
- Bulk-delete + cache-restore FK constraint failure: session держал
  stale `textId` после delete, FK ломался при `addSentence`. Fix:
  `v3SessionForgetTextIfStale` + defense-in-depth в
  `v3LibraryUpdateCurrentCore`.
- «Сохранить как новый» теперь всегда доступен при наличии update-target
  (раньше было только при `baseTextId`/draft-fork).
- `v3Phase6ResetDecision` чистит все ключи (`phase6FirstOpenSeen`,
  `localMode`, `phase6LastMigration`).
- Bulk ZIP-import 429-storm: rate limit на `/api/audio/cache/upload`
  поднят с 200/min → 2000/min; client `uploadOne` retry'ит 429 с
  Retry-After + exponential backoff (3 попытки).
- Translit edits SBL-профиля не сохранялись — `tableEditSaveCell`
  безусловно удалял `payload.translit`.
- Edit-marker badge + niqqud column + activity panel
  (`(без названия) (пусто) 0`) + TTS settings ignored.
- Anki «all duplicates»: AnkiConnect Plus возвращает per-note ошибки
  как Python-stringified list — теперь регэкс + JSON.parse + retry-as-fresh.
- Mobile init failure: false-negative на `createSyncAccessHandle` per
  spec в main thread → VFS fallback chain в worker.
- AnkiConnect health-check в LOCAL_MODE: direct из браузера к
  `127.0.0.1:8765`, минуя Railway.

### Documentation
- `docs/OPFS_MIGRATION_PLAN.md` — статусная таблица + dated changelog
  по фазам и багфиксам.
- `docs/OPFS_USER_GUIDE.md` — user-facing reference: где живут данные,
  таблица endpoint'ов после Phase 6, kill switch, FAQ.
- `docs/C_SERIES_PLAN.md` — рекомендованный порядок реализации
  C-серии и premium-product требования (post-Phase-6 backlog).

---

## [2.0.0] и ранее

См. историю коммитов: `git log --oneline`. Включает Phase 4-9 SRS,
Anki-экспорт, dashboard аналитика, IDE-режим, audio-prefetch,
Hebrew TTS POC, classic mode, i18n.
