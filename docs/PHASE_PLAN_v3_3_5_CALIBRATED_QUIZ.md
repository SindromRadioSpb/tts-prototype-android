# Phase Plan — v3.3.5 (Direction 13 — Calibrated Diagnostic Quiz)

> **Numbering note.** In the original v3.3 master plan this patch was tagged "v3.3.3 — Calibrated Quiz". Two unplanned hotfixes consumed v3.3.3 (search field-name mismatch, `7526f6c`) and v3.3.4 (cross-text panel z-index + root inflections, `d1317e0`) earlier today. **The calibrated-quiz patch is now v3.3.5.** Master plan §4 sequencing updated in the same commit as this doc.
>
> **Status.** Plan only — no implementation. C1 development opens on `feat/v3.3.5-calibrated-quiz` only after user re-approves this gate.
>
> **Hard constraints (locked by user 2026-05-14):**
> - No new `/api/research/v1/*` endpoints.
> - Item-level quiz responses MUST never leave the device.
> - Do not bump `CONSENT_VERSION` unless §3 audit proves the current template fails to cover the new fields.
> - Teacher CSV remains authoritative over quiz score (existing rule preserved).
> - Self-report remains available — quiz is a **parallel** outcome path.
> - No v3.4 scope creep (no Premium SRS, no multicohort writes, no DictaBERT, no monolith split).
> - Pre-kickoff gate: ulpan-teacher item-bank sign-off REQUIRED before C1 implementation begins (see §5 + §16).

---

## 1. Repo Audit Findings

### Existing outcome submission pipeline

- **`public/js/research.js` `submitOutcome({ post_test_score, confidence_self_report })`** (line 695-) — single existing public outcome surface. POSTs to `/api/research/v1/metrics` (the same endpoint as daily aggregates), with a payload containing **only** `metrics.outcome.*` fields plus the mandatory envelope (`format`, `student_id`, `cohort_code`, `upload_ts`, `since_ts`, `consent_version`, `context`). `outcome_capture_method` hardcoded to `"self-report"`.
- **`public/js/research-ui.js` `openOutcome()`** (Phase 11.6 §11.6.1) — modal with numeric score input + 5-option Likert confidence select.
- **`scripts/research/seed_research_fake_cohort.js`** — for synthetic test fixtures, generates `outcomes.csv` rows directly; never exercises submitOutcome.

### Existing server validation

- **`research/validate.js` `ALLOWED_OUTCOME_KEYS`** (line 92):
  ```js
  new Set(["post_test_score", "pre_test_score", "confidence_self_report", "outcome_capture_method"])
  ```
- **`outcome_capture_method` enum** (line 240): `"self-report" | "teacher-csv"`. Currently strict — adding `"calibrated-quiz"` requires editing this enum.
- **`validateOutcome(out)`** (line 215) — recursive type check + range bounds for numeric fields; rejects unknown keys with a `SCHEMA_VIOLATION`.
- **`MAX_PAYLOAD_BYTES = 64 * 1024`** — quiz outcome payloads are tiny (< 500 B); no pressure.

### Existing aggregation & dashboard rendering

- **`research/storage.js` `aggregateCohort()`** harvests `metrics.outcome` per-student (latest `upload_ts` wins); teacher `outcomes.csv` overrides on conflict. Result lands in `students[].outcome`.
- **`public/teacher.html` per-student table + correlations + scatter** consume `students[].outcome.{pre_test_score, post_test_score, exam_date, uploaded_by}`. No CEFR / SE columns yet.

### Existing consent surface

- **`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` §3.2 #3**: *"Опционально: поделиться вашим итоговым баллом экзамена в конце курса (для корреляционного анализа)."* — covers "exam score" as opt-in.
- **`docs/RESEARCH_CONSENT_RULE.md`** (shipped v3.3.1 A4) — decision tree for material-vs-cosmetic changes. §3 taxonomy: *"Adding a new metric to 'what we collect'"* → major bump.
- **`public/js/research.js` `CONSENT_VERSION = '1.0'`** — current.

### Existing transparency

- **`previewToday()` + `openTransparency()` modal** — show what was uploaded. Quiz uploads will appear here per the existing flow (no new transparency surface needed).

### Repository-wide gaps

- No quiz framework / authoring tooling exists. Greenfield.
- No `public/quiz/` directory.
- No IRT/Rasch scoring code anywhere in the codebase.
- No statistical-validation harness — needs to be authored fresh.

---

## 2. Existing research outcome contract

### Wire shape (server-side authoritative)

```
POST /api/research/v1/metrics
Headers: Content-Type: application/json
Body: {
  format: "linguistpro-research-v1",
  student_id: "<UUID>",
  cohort_code: "<COHORT>",
  upload_ts: "YYYY-MM-DD",     // ISO day (NOT precise timestamp)
  since_ts:  "YYYY-MM-DD",
  consent_version: "1.0",
  context: { app_version, platform },
  metrics: {
    outcome: {
      post_test_score?:         number,
      pre_test_score?:          number,
      confidence_self_report?:  int 1-5,
      outcome_capture_method?:  "self-report" | "teacher-csv",
    }
  }
}
```

### Aggregation rules (from §1 audit)

1. **Self-report path**: client POSTs via `submitOutcome` → server writes one JSON line per cohort/day → aggregator extracts `metrics.outcome` and attaches to the student record. Latest `upload_ts` wins per student.
2. **Teacher CSV path**: teacher uploads `outcomes.csv` via dashboard → server's `writeOutcomesCsv` merges (by `student_id`) and OVERRIDES self-report on conflict.
3. **Idempotency**: dedupe key `(student_id, since_ts, upload_ts)` — multiple submitOutcome calls on the same day deduplicate server-side.

### Constraints preserved by v3.3.5

- v3.3.5 only **extends** `metrics.outcome.*` with new optional fields. No new endpoints. No new wire-envelope fields. No semantics change to the dedupe key.
- Teacher CSV remains AUTHORITATIVE — if a cohort uploads teacher `post_test_score`, that wins over the calibrated quiz score on the dashboard. The two scores can coexist on disk (one in jsonl payload, one in `outcomes.csv`); the dashboard surfaces both.

---

## 3. Consent coverage audit

> **Question:** Does `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` v1.0 cover the v3.3.5 new outcome fields `quiz_score_normalized`, `quiz_cefr_band`, `quiz_se`, `quiz_completed_at`, `quiz_version`?

### Field-by-field walk through `RESEARCH_CONSENT_RULE.md` §2 decision tree

| Field | Current consent coverage | Q1 (new metric?) | Q2 (new retention?) | Q3 (new access?) | Q4 (mech change?) | Verdict |
|---|---|---|---|---|---|---|
| `quiz_score_normalized` | §3.2#3 "поделиться вашим итоговым баллом экзамена" — covers exam score generically | **No** — same kind of measurement (exam score), different instrument | No | No | No | **Cosmetic — no bump** |
| `quiz_cefr_band` | Derived classification of the exam score (A1-C1 placement) | **Borderline** — not a separately-collected datum; computed from `quiz_score_normalized` deterministically | No | No | No | **Cosmetic — no bump** (treats it as a presentation of the score, not a new metric) |
| `quiz_se` | Quality indicator of the measurement (Rasch standard error) | **Borderline** — not a "thing about the student" but "how well we measured" | No | No | No | **Cosmetic — no bump** (metadata of measurement quality) |
| `quiz_completed_at` | Timestamp of quiz completion | Q1: depends on granularity. Consent says "no precise timestamps; only hour-of-day distribution" | No | No | No | **Cosmetic — no bump IF day-level granularity** (matches existing `upload_ts` convention) |
| `quiz_version` | Identifier of the instrument used | **No** — metadata about the measurement instrument, not user data | No | No | No | **Cosmetic — no bump** |
| `outcome_capture_method: "calibrated-quiz"` | New enum value | The enum is metadata about HOW the score was captured. Self-report and teacher-csv already enumerated | No | No | **No** — same withdrawal/access rules apply | **Cosmetic — no bump** |

### Verdict

**No `CONSENT_VERSION` bump required** under the following conditions, which the implementation MUST enforce:

1. `quiz_completed_at` is **ISO day** (YYYY-MM-DD), matching the existing `upload_ts` granularity. The validator MUST reject any sub-day granularity per `DATE_ISO_DAY_RE` regex.
2. `quiz_score_normalized` is on the same `0-100` scale as `post_test_score` (no separate scale).
3. `quiz_cefr_band` is documented as a **derived presentation** of the score, not a separately-collected datum.
4. Consent template gets a **cosmetic edit** under §3.2 #3 to mention the quiz as an alternative path:
   ```
   3. Опционально: поделиться вашим итоговым баллом экзамена в конце курса
      (через self-report ИЛИ через встроенную калибровочную диагностику)
      для корреляционного анализа.
   ```
   This is a Q5-category "wording polish" per `RESEARCH_CONSENT_RULE.md` — no bump.

### Required artifacts in C1 / C9

- **§3 audit conclusion archived** in `docs/RESEARCH_CONSENT_RULE.md` Example E (new worked example: "calibrated-quiz fields added to metrics.outcome → no bump under conditions 1-4").
- **Consent template edit** in `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` §RU + §EN + §HE (HE marked TBD pending native review per existing brief).

### If conditions 1-4 cannot be met

Fall back to **minor bump** (`CONSENT_VERSION = '1.0.1'`). Re-consent prompt fires for all participants. Master-plan D5 invariant ("no consent bump in v3.3.x") would be violated and require user re-approval before kickoff. **Implementation MUST pin conditions 1-4 as smoke assertions** so any future drift surfaces in CI.

---

## 4. Quiz JSON schema

### File: `public/quiz/ulpan_diagnostic_v1.json`

```jsonc
{
  "format": "linguistpro-quiz-v1",
  "schema_version": 1,
  "instrument_id": "ulpan_diagnostic_v1",
  "instrument_label": {
    "ru": "Ulpan: калибровочная диагностика (v1)",
    "en": "Ulpan diagnostic (v1)",
    "he": "אבחון אולפן (v1)"
  },
  "calibrated_by": "<name or anonymous>",
  "calibrated_at": "YYYY-MM-DD",
  "calibration_method": "expert_judgement_v1",     // future: "real_data_irt"
  "scoring": {
    "model": "rasch_1pl",
    "theta_to_score": {
      "method": "linear",
      "domain": [-3.0, 3.0],
      "range": [0, 100]
    },
    "cefr_bands": [
      { "band": "A1", "lower": 0,  "upper": 19 },
      { "band": "A2", "lower": 20, "upper": 39 },
      { "band": "B1", "lower": 40, "upper": 59 },
      { "band": "B2", "lower": 60, "upper": 79 },
      { "band": "C1", "lower": 80, "upper": 100 }
    ]
  },
  "items": [
    {
      "id": "Q01",
      "cefr_level": "A1",
      "difficulty_logit": -2.4,                       // Rasch beta
      "type": "multiple_choice",
      "prompt_he": "<вопрос на иврите>",
      "prompt_ru": "<перевод вопроса на русский>",
      "prompt_en": "<English prompt>",
      "options": [
        { "id": "a", "text_he": "...", "text_ru": "...", "text_en": "..." },
        { "id": "b", "text_he": "...", "text_ru": "...", "text_en": "..." },
        { "id": "c", "text_he": "...", "text_ru": "...", "text_en": "..." },
        { "id": "d", "text_he": "...", "text_ru": "...", "text_en": "..." }
      ],
      "correct_option_id": "a",
      "tags": ["vocabulary", "greetings"],
      "audio_asset_key": null     // future: per-item TTS for listening items
    }
    // … 19 more items
  ],
  "validity_notes": {
    "sample_size": 0,
    "calibration_source": "expert_judgement",
    "known_limitations": [
      "Linear theta→score mapping is a v3.3.5 approximation. Real-data IRT recalibration deferred to v3.4+.",
      "Item difficulties are expert-assigned, not empirically estimated."
    ]
  }
}
```

### Schema invariants (enforced by the build validator in §5)

- Exactly **20 items**.
- Each item has a unique `id` matching `^Q\d{2}$`.
- `cefr_level` ∈ {A1, A2, B1, B2, C1}.
- `difficulty_logit` is a finite number in `[-4, 4]`.
- Each item has exactly 4 options with unique `id`s ∈ {a, b, c, d}.
- `correct_option_id` references one of the option ids.
- All three locales (`prompt_he`, `prompt_ru`, `prompt_en`) are non-empty.
- `cefr_bands` cover `[0, 100]` without gaps or overlaps.

### CEFR distribution target

| Band | Count | Rationale |
|---|---|---|
| A1 | 4 | Floor — distinguish absolute beginners |
| A2 | 4 | Stretch up from A1 |
| B1 | 5 | Largest band — most ulpan-level students cluster here |
| B2 | 4 | Stretch up from B1 |
| C1 | 3 | Ceiling — distinguishes advanced |

Build validator enforces this distribution exactly.

---

## 5. Item bank authoring workflow

### Pre-implementation gate (BLOCKING C1 kickoff)

The phase plan does NOT enter C1 until **all five** of these are signed off:

1. **Domain-expert (ulpan teacher) item-bank review.** Same path as HE consent native review — `docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` authored, sent to the ulpan teacher, signed-off responses received.
2. **Distribution check.** 20 items with the 4/4/5/4/3 CEFR breakdown verified.
3. **Difficulty calibration sanity.** No item more than 1.0 logit outside its band's expected range (e.g. A1 items should have `difficulty_logit ∈ [-3.0, -1.0]` approximately).
4. **No ambiguity.** Reviewer marked every item as "unambiguous correct answer" in their sign-off.
5. **Validity caveats added.** Reviewer (or author) listed known limitations under `validity_notes.known_limitations` in the JSON.

### Authoring workflow

1. Author drafts items in `docs/QUIZ_ITEM_BANK_DRAFT.md` (markdown format, easier to read/edit than JSON).
2. Author runs `node scripts/quiz/draft-to-json.js docs/QUIZ_ITEM_BANK_DRAFT.md` → emits `public/quiz/ulpan_diagnostic_v1.json`.
3. Author runs `node scripts/quiz/validate-bank.js public/quiz/ulpan_diagnostic_v1.json` → checks schema invariants from §4.
4. Author runs `node scripts/quiz/simulate-scoring.js` → see §7 / §14 statistical validation.
5. Author sends `QUIZ_ITEM_BANK_REVIEW_BRIEF.md` (with the draft markdown attached) to the ulpan teacher.
6. Reviewer returns annotations (any of the 4 return-format options in the `HE_CONSENT_REVIEW_BRIEF.md` pattern — markdown inline, GitHub PR, comments, Word).
7. Author merges annotations; re-runs validate-bank + simulate-scoring; sign-off recorded in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` §"Calibration audit log".

### Draft markdown format (for author + reviewer)

```markdown
## Item Q01 — A1
**Difficulty (logit):** -2.4
**Tags:** vocabulary, greetings

### He prompt
שלום, _____ קוראים?

### Options
- (a) ילד
- (b) **איך** ← correct
- (c) מה
- (d) למה

### RU
Здравствуйте, _____ зовут?
- (a) ребёнок
- (b) **как** ← правильно
- (c) что
- (d) почему

### EN
Hello, _____ is your name?
- (a) child
- (b) **how** ← correct
- (c) what
- (d) why

### Reviewer notes (filled in by ulpan teacher)
- Грамматика: ✓
- Уровень: ✓ A1
- Однозначность: ✓
- Замечания: —
```

---

## 6. CEFR / score mapping

### Decision (locked per D10 + user note)

**Linear mapping for v3.3.5.** Real-data IRT recalibration deferred to v3.4 once we have ≥30 student responses.

### Linear mapping definition

Theta (latent ability) → raw score → normalized 0-100 → CEFR band:

```
theta ∈ [-3.0, +3.0]   (Rasch latent ability)
    │
    ▼  linear projection
raw_score = round( (theta + 3.0) / 6.0 × 100 )
    │
    ▼  band lookup
A1: [0, 19]     mid = 10
A2: [20, 39]    mid = 30
B1: [40, 59]    mid = 50
B2: [60, 79]    mid = 70
C1: [80, 100]   mid = 90
```

Boundaries are inclusive at both ends per spec; the bands cover `[0, 100]` exactly (no gap, no overlap).

### Why linear (vs polynomial / spline)

- **Simple to explain to the participant** ("each band is 20 points wide").
- **Reversible** — researcher can convert dashboard score back to theta for analysis if needed.
- **Recalibration path is clear** — replace the linear projection with a fitted polynomial / spline after enough real data accumulates (v3.4).

### Reverse mapping (for analysis)

Documented in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` so researchers can recover theta from the score:

```
theta_estimate = (raw_score / 100 × 6.0) - 3.0
```

R / Python example snippet included in the doc.

---

## 7. Scoring algorithm and validation strategy

### Model: 1-parameter logistic (Rasch) IRT

For each item `i` with difficulty `beta_i` and a respondent with latent ability `theta`:

```
P(correct on item i | theta) = sigmoid(theta - beta_i)
                             = 1 / (1 + exp(-(theta - beta_i)))
```

### Estimation: MLE via Newton-Raphson (no external libraries)

The score for a 20-item static test reduces to a simple optimization:

```
log_lik(theta) = Σ_i [ x_i × log(P_i) + (1 - x_i) × log(1 - P_i) ]
  where x_i ∈ {0, 1} = response correctness

# Newton step:
score(theta)   = Σ_i (x_i - P_i)
info(theta)    = Σ_i P_i (1 - P_i)
theta_next     = theta + score / info
```

Converges in 5-10 iterations from `theta = 0` start. No external dependencies — pure JS.

### Edge cases

- **All correct** (`Σ x_i = 20`): theta → +∞. Cap at `+3.0`.
- **All incorrect** (`Σ x_i = 0`): theta → -∞. Cap at `-3.0`.
- **Singular cases** (info ≈ 0): same caps.

### Standard error

```
SE(theta) = 1 / sqrt(info(theta_hat))
```

Translated into the normalized 0-100 scale:

```
SE(score) = SE(theta) × (100 / 6.0)   # linear chain rule
```

`quiz_se` carries this value.

### Reference validation against R `mirt`

C8 smoke generates 100 synthetic respondents (random theta uniform in `[-3, +3]`) with 20 items at fixed difficulties; computes our MLE theta and standard error; compares to `mirt::fscores(model, response_pattern, method="ML")`.

Acceptance: Pearson correlation r > 0.99 between our theta and R's, mean absolute difference < 0.05 SD. Tolerance is generous to absorb numeric edge effects; the algorithm being correct will easily meet it.

R reference script included in `scripts/quiz/validate-against-mirt.R` for the operator to run when a reviewer's machine has R available. Our smoke does NOT depend on R — it ships a pre-computed reference output as a JSON fixture in `scripts/quiz/__fixtures__/mirt-reference.json`. The fixture is regenerated by hand when item difficulties change.

---

## 8. Local progress / privacy design

### Storage during quiz

```
localStorage.quizState_v1 = JSON.stringify({
  version: "ulpan_diagnostic_v1",
  started_at: "2026-05-14T10:23:45.123Z",
  current_item_index: 7,
  responses_transient: {
    "Q01": "b",
    "Q02": "a",
    "Q03": "d",
    ...
    "Q07": "c"
  }
})
```

### Invariants

| Field | Lifecycle |
|---|---|
| `version` | Set on quiz start; never changes during one run. |
| `started_at` | Set on quiz start (full ISO timestamp — local only, never uploaded). |
| `current_item_index` | Advances on each answer; allows refresh-resume. |
| `responses_transient` | Grows as user answers; allows refresh-resume **only**. |

### Cleanup on submit (HARD invariant)

```
async function submitQuiz() {
  // 1. Compute score from responses_transient (in-memory).
  const { theta, se, raw_score, cefr_band } = scoreQuiz(state.responses_transient);

  // 2. Build outcome payload (no item-level fields, no responses_transient).
  const payload = {
    quiz_score_normalized: raw_score,
    quiz_cefr_band: cefr_band,
    quiz_se: se,
    quiz_completed_at: todayIsoDay(),       // ISO DAY only — not ISO timestamp
    quiz_version: state.version,
    outcome_capture_method: "calibrated-quiz",
  };
  await LinguistProResearch.submitQuizOutcome(payload);

  // 3. IMMEDIATELY clear all item-level data from localStorage.
  localStorage.removeItem('quizState_v1');

  // 4. Set a one-shot completion marker (no item data).
  localStorage.setItem('quizCompleted_v1', JSON.stringify({
    version: state.version,
    completed_at: todayIsoDay(),       // day-level
    cohort_code: lsGet(LS.cohortCode),
  }));
}
```

### Privacy invariants pinned by smoke

- **Smoke case A**: after `submitQuiz`, `localStorage.quizState_v1` MUST be removed.
- **Smoke case B**: HAR audit during submit — POST body MUST NOT contain any `Q01`/`Q02`/`Q03`/.../`Q20` substring (item-level response leak).
- **Smoke case C**: HAR audit during submit — POST body MUST NOT contain any `responses_transient` substring.
- **Smoke case D**: `localStorage.quizCompleted_v1` exists after submit and carries only `{version, completed_at, cohort_code}` — no item data.

### Refresh-resume

If the user reloads mid-quiz, the modal re-opens at `current_item_index` with `responses_transient` populated. They can change earlier answers via "← Back" navigation. On final submit, the cleanup invariants apply.

### Abandoned-quiz cleanup

If `quizState_v1` is older than 24 hours (per `started_at`) and `current_item_index` < 20, prompt the user on next open: *"Возобновить незавершённый тест ИЛИ начать заново?"*. Default action is "resume" — same as current behaviour for partial uploads in the research client.

---

## 9. Research payload extension

### Wire format additions

```js
metrics: {
  outcome: {
    // Existing fields (unchanged):
    post_test_score?:        number,        // teacher CSV path; quiz path leaves null
    pre_test_score?:         number,        // teacher CSV path
    confidence_self_report?: int 1-5,       // self-report path

    // v3.3.5 additions (calibrated-quiz path only):
    quiz_score_normalized?:  number 0-100,
    quiz_cefr_band?:         "A1" | "A2" | "B1" | "B2" | "C1",
    quiz_se?:                number ≥ 0,
    quiz_completed_at?:      ISO day (YYYY-MM-DD; same constraint as upload_ts),
    quiz_version?:           string matching ^[a-z0-9_]+_v\d+$,

    // outcome_capture_method enum extended:
    outcome_capture_method?: "self-report" | "teacher-csv" | "calibrated-quiz",
  }
}
```

### Client-side flow

New public function on `window.LinguistProResearch`:

```js
async function submitQuizOutcome({
  quiz_score_normalized,
  quiz_cefr_band,
  quiz_se,
  quiz_completed_at,
  quiz_version,
})  → { ok, dedupe?, error?, message? }
```

Validates locally (mirrors server validator surface — see §10), builds the payload via the existing envelope assembler, POSTs to `/api/research/v1/metrics` exactly like `submitOutcome` does. Idempotent via the existing `(student_id, since_ts, upload_ts)` dedupe key.

### Server-side flow

**Zero new endpoints, zero new routes.** The existing POST `/api/research/v1/metrics` accepts the extended `metrics.outcome` shape because `validate.js` is updated in §10.

### Aggregation

`research/storage.js#aggregateCohort()` already harvests `metrics.outcome` per-student (latest `upload_ts` wins). No change needed — the new fields ride the existing harvest path.

**Teacher CSV override rule preserved**: if `outcomes.csv` has a row for a student with `post_test_score`, that value wins over `quiz_score_normalized` in the dashboard render. Both values are stored on the student record (jsonl-side: full outcome object including quiz_* fields; outcomes.csv-side: teacher fields). The render decision happens at display time (see §11).

---

## 10. Server validator changes

### `research/validate.js` — minimal diff

```js
// ALLOWED_OUTCOME_KEYS extended:
const ALLOWED_OUTCOME_KEYS = new Set([
  "post_test_score",
  "pre_test_score",
  "confidence_self_report",
  "outcome_capture_method",
  // v3.3.5 calibrated-quiz path:
  "quiz_score_normalized",
  "quiz_cefr_band",
  "quiz_se",
  "quiz_completed_at",
  "quiz_version",
]);

// outcome_capture_method enum extended:
//   was:  "self-report" | "teacher-csv"
//   now:  "self-report" | "teacher-csv" | "calibrated-quiz"

// New field validators inside validateOutcome():
const CEFR_BANDS = new Set(["A1", "A2", "B1", "B2", "C1"]);
const QUIZ_VERSION_RE = /^[a-z0-9_]+_v\d+$/;

if ("quiz_score_normalized" in out) {
  ensureFloatInRange(out.quiz_score_normalized, "$.metrics.outcome.quiz_score_normalized", { min: 0, max: 100 });
}
if ("quiz_cefr_band" in out) {
  if (!CEFR_BANDS.has(out.quiz_cefr_band)) {
    violation("$.metrics.outcome.quiz_cefr_band", "must be one of A1/A2/B1/B2/C1");
  }
}
if ("quiz_se" in out) {
  ensureFloatInRange(out.quiz_se, "$.metrics.outcome.quiz_se", { min: 0, max: 100 });
}
if ("quiz_completed_at" in out) {
  if (!DATE_ISO_DAY_RE.test(out.quiz_completed_at)) {
    violation("$.metrics.outcome.quiz_completed_at", "must be ISO day YYYY-MM-DD (sub-day granularity rejected per consent §3 audit invariant)");
  }
}
if ("quiz_version" in out) {
  if (!QUIZ_VERSION_RE.test(String(out.quiz_version || ""))) {
    violation("$.metrics.outcome.quiz_version", "must match ^[a-z0-9_]+_v\\d+$");
  }
}
```

### `scripts/research/validate-cli.js` automatically covers the new fields

The CLI (v3.3.1 A5) is a thin wrapper around `research/validate.js`. No CLI change required.

### Smoke regression

The existing 25 server-smoke cases plus 7 search-fallback-regression cases stay green. New server-smoke cases (§13) cover the calibrated-quiz path explicitly.

---

## 11. Teacher dashboard rendering

### Display rule (preserves teacher CSV authority)

For each student in the per-student table:

```
if student.outcome from outcomes.csv has post_test_score:
    display.score = post_test_score
    display.source = "teacher-csv"
    if student.outcome from jsonl has quiz_score_normalized:
        display.alt_score = quiz_score_normalized   # shown as small grey badge
elif student.outcome from jsonl has quiz_score_normalized:
    display.score = quiz_score_normalized
    display.source = "calibrated-quiz"
    display.cefr_band = quiz_cefr_band
    display.se = quiz_se
elif student.outcome from jsonl has post_test_score (self-report):
    display.score = post_test_score
    display.source = "self-report"
```

### New columns in per-student table (when k-met)

| Existing column | Becomes |
|---|---|
| `post_test_score` | Renamed to `score`. New tooltip showing `source` enum value. |
| (new) `cefr` | Shows CEFR band (e.g. "B1") when source = `calibrated-quiz`; empty otherwise. |
| (new) `se` | Shows quiz SE (e.g. "0.31") with 2-decimal precision when source = `calibrated-quiz`; empty otherwise. |

### Scatter / correlation rendering

- Pearson r already computed against `post_test_score`. v3.3.5 extends to also compute r against `quiz_score_normalized` when present.
- Scatter plot adds a second series: blue dots for self-report/teacher scores, orange dots for calibrated-quiz scores. Legend distinguishes.

### CSV export rules

- `cohort_<code>_aggregates.csv` (single-cohort) gains 3 new columns: `quiz_score_normalized`, `quiz_cefr_band`, `quiz_se`. Empty for students who didn't take the quiz.
- `cross_cohort_aggregates.csv` (v3.3.2) **does NOT gain quiz columns** — per §6 schema decision, that CSV is cohort-wide only; per-student outcomes don't appear there.

### Smoke

3 new teacher-smoke cases (added to `scripts/research/teacher-smoke.js`):
- Quiz score renders in per-student table when present
- CEFR band column shows correct band
- Teacher CSV still wins when both sources have a score

---

## 12. Retake policy and admin reset policy

### Default: one-shot per cohort

- After successful `submitQuizOutcome`, `localStorage.quizCompleted_v1` carries `{version, completed_at, cohort_code}`.
- Quiz UI checks this on open: if `quizCompleted_v1.cohort_code` matches the current cohort and `version` matches the loaded quiz version, the modal shows a "Вы уже прошли этот тест на YYYY-MM-DD. Reset через researcher только." message.
- No client-side reset button.

### Admin technical reset CLI (with audit log)

`scripts/research/reset_quiz_for_student.js`:

```bash
node scripts/research/reset_quiz_for_student.js \
  --cohort ULPAN-A-W2026 \
  --student <uuid> \
  --reason "test corruption observed; researcher granted retake"
```

**What it does:**

1. Validates `--reason` is non-empty (≥10 chars).
2. Walks `<cohort>/<date>.jsonl` files; removes any line where `student_id === --student` AND `metrics.outcome.outcome_capture_method === "calibrated-quiz"` AND `metrics.outcome.quiz_version === <current_version>`. (Other outcome rows for that student stay.)
3. Appends an audit entry to `<cohort>/deletions.log`:
   ```
   2026-05-14T15:23:45.123Z quiz_reset cohort=ULPAN-A-W2026 student=<uuid> version=ulpan_diagnostic_v1 reason="..."
   ```
4. Prints next-steps instructions: *"Student must clear `localStorage.quizCompleted_v1` (one-tap action in the Settings panel) to retake. Privacy-safe — server-side outcome is fully purged."*

### Client-side cooperation for admin reset

Settings panel gets a new debug action (hidden behind `?dev=1` query param OR in research panel only): "🔄 Сбросить статус калибровочного теста (researcher action only)". Removes `quizCompleted_v1` from localStorage. No server interaction — the student already has the researcher's go-ahead OOB.

### NOT in scope

- Self-service retake (one-shot is sacred for measurement validity).
- Multiple-version coexistence in the same cohort (v3.4 backlog).
- Automatic invalidation on cohort changeover (user switches cohort = new tracking, automatically handled by the `cohort_code` check above).

---

## 13. Smoke matrix

### `scripts/quiz/bank-validate-smoke.js` (new) — 8 cases

1. Bank has exactly 20 items
2. CEFR distribution matches 4/4/5/4/3
3. All items have non-empty `prompt_he`/`prompt_ru`/`prompt_en`
4. All items have 4 options with unique ids
5. All `correct_option_id` references resolve to an option
6. All `difficulty_logit` are finite numbers in [-4, 4]
7. CEFR bands cover [0, 100] without gaps/overlaps
8. JSON parses + matches schema

### `scripts/quiz/scoring-smoke.js` (new) — 6 cases

1. All-correct response set → theta capped at +3.0, score = 100, band = C1
2. All-incorrect response set → theta capped at -3.0, score = 0, band = A1
3. Mid-pattern response set → theta in expected range, SE > 0
4. Newton-Raphson converges in ≤ 10 iterations
5. Score is deterministic across N=100 random response patterns (same input → same output)
6. Correlation with R `mirt` reference output r > 0.99, MAD < 0.05 SD on 100 simulated respondents (against pre-computed fixture)

### `scripts/quiz/privacy-smoke.js` (new) — 5 cases

1. After `submitQuiz`, `localStorage.quizState_v1` is removed
2. Captured POST body contains NO `Q01`-`Q20` substrings (item-level leak)
3. Captured POST body contains NO `responses_transient` substring
4. `localStorage.quizCompleted_v1` after submit has only `{version, completed_at, cohort_code}` keys
5. `quiz_completed_at` in POST body matches ISO day pattern `^\d{4}-\d{2}-\d{2}$` (NOT a sub-day timestamp)

### `scripts/quiz/ui-smoke.js` (new) — 8 cases (Playwright)

1. Quiz modal opens with title + intro + first item
2. Click an answer → "Next" enabled → click → advances to item 2
3. "← Back" returns to previous item with selection preserved
4. Refresh mid-quiz → `quizState_v1` restored; modal re-opens at the same item with selection preserved
5. Submit at item 20 → score reveal screen (no UI mention of individual responses)
6. Modal close after submit → `quizCompleted_v1` flag set
7. Re-open quiz modal after submit → "уже прошли" notice rendered, no retake button
8. No JS errors throughout

### `scripts/research/quiz-validator-smoke.js` (new) — 7 cases

1. Valid quiz outcome payload → 200, stored
2. `quiz_score_normalized = 105` → 400 SCHEMA_VIOLATION (out of range)
3. `quiz_cefr_band = "D1"` → 400 SCHEMA_VIOLATION (invalid enum)
4. `quiz_se = -1.0` → 400 SCHEMA_VIOLATION (negative)
5. `quiz_completed_at = "2026-05-14T10:23:45Z"` → 400 (sub-day granularity rejected)
6. `quiz_version = "Bad Format"` → 400 SCHEMA_VIOLATION
7. `outcome_capture_method = "calibrated-quiz"` accepted as new enum value

### `scripts/research/quiz-reset-cli-smoke.js` (new) — 5 cases

1. Reset removes quiz outcome lines from jsonl
2. Reset preserves other outcome (e.g. self-report)
3. Reset rejects empty `--reason`
4. Reset appends correctly-formatted audit log line
5. Reset is idempotent (running twice doesn't error or double-log)

### Teacher dashboard extensions to `scripts/research/teacher-smoke.js`

3 new cases (added to existing 14):

1. Quiz score renders in per-student table when present
2. CEFR band column shows correct band
3. Teacher CSV still wins when both sources have a score

### Wire into `all-smoke.js`

New v3.3.5 entries:

| Suite | Cases |
|---|---|
| Bank validate | 8 |
| Scoring | 6 |
| Privacy | 5 |
| UI | 8 |
| Quiz validator (server) | 7 |
| Quiz reset CLI | 5 |
| Teacher dashboard (extension) | +3 |
| **Total v3.3.5 additions** | **42 cases** |

Smoke matrix after merge: **197 (v3.3.4) + 42 (v3.3.5) = 239 cases ALL GREEN.**

---

## 14. Statistical validation

### Pre-merge gate: simulation against R `mirt`

1. Generate 100 synthetic respondents with `theta ~ Uniform(-3, +3)`.
2. For each respondent, simulate response to each of 20 items using the Rasch model with the actual `difficulty_logit` values from the item bank.
3. Compute theta + SE via our MLE implementation.
4. Compare against pre-computed `mirt` reference (from `scripts/quiz/__fixtures__/mirt-reference.json`).
5. Pass criteria:
   - Pearson r between our theta and mirt theta > **0.99**
   - Mean absolute difference < **0.05** SD
   - Mean absolute SE difference < **0.05**

### Per-merge gate: monotonicity check

Increasing the count of correct answers MUST monotonically increase the computed score (within the boundary caps). Smoke case asserts this on 100 random response patterns.

### Cross-cohort recalibration trigger (deferred to v3.4)

Once a cohort has ≥30 students who completed the quiz AND the dashboard surfaces correlation between quiz score and teacher post_test_score, we'll have enough signal to estimate item difficulties empirically. Recalibration plan:

1. Researcher exports `cohort_<code>_aggregates.csv` with quiz responses (still anonymized).
2. Runs `scripts/quiz/recalibrate-from-data.R` — fits Rasch model to the empirical response patterns.
3. Updates `public/quiz/ulpan_diagnostic_v1.json` `items[].difficulty_logit` with empirical estimates.
4. Bumps `instrument_id` to `ulpan_diagnostic_v2`.
5. Documents in `validity_notes.calibration_source` = `"empirical_irt_v1"`.

The recalibration bump is itself a research-mode CONSENT_VERSION concern (the *measurement* changes, but the *kind of data* doesn't — likely cosmetic per RESEARCH_CONSENT_RULE.md, but the v3.4 plan will run the audit fresh).

---

## 15. Documentation updates

### New documents

1. **`docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md`** — primary quiz reference.
   - Methodology overview (Rasch 1PL IRT).
   - CEFR mapping + linear projection rationale.
   - Item bank distribution + sample items.
   - Validity caveats + known limitations.
   - Recalibration roadmap (v3.4).
   - Reverse-mapping snippet (R + Python).
   - Calibration audit log (item-bank sign-off date, reviewer name).

2. **`docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md`** — pre-implementation reviewer brief.
   - Mirrors `HE_CONSENT_REVIEW_BRIEF.md` pattern.
   - Cover message + context + checklist + return-format options.
   - Item-by-item draft markdown + space for reviewer annotations.
   - Sign-off form at the bottom.

### Edits to existing documents

3. **`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`** — §3.2 #3 cosmetic edit mentioning quiz as alternative path (per §3 audit; no bump).

4. **`docs/RESEARCH_CONSENT_RULE.md`** — append worked example E (the calibrated-quiz coverage audit conclusion, with all 4 conditions enumerated).

5. **`docs/RESEARCHER_GUIDE.md`** — §4 Outcomes gains §4.3 "Calibrated quiz (in-app)" subsection. §5.3 CSV export schema documents the new quiz columns. §8 pre-deployment checklist adds an item: "item bank reviewed + signed off by domain expert".

6. **`docs/RESEARCH_METRICS_SCHEMA.md`** — Layer-5 outcome section documents the 5 new `quiz_*` fields and the extended `outcome_capture_method` enum.

7. **`docs/PREMIUM_RELEASE_PLAN_v3_3.md`** §4 — already updated in the master-plan-shift commit alongside this plan.

8. **`docs/PREMIUM_RELEASE_PLAN_v3_3.md`** §10 Live status — updates after v3.3.5 ships.

9. **`CHANGELOG.md`** `[3.3.5]` entry — full change list with hard-constraints checklist + privacy invariants restated.

---

## 16. Definition of Done

### Pre-implementation gate (BLOCKING C1)

- [ ] §3 consent coverage audit signed off by author (recorded in `RESEARCH_CONSENT_RULE.md` example E).
- [ ] Item bank draft (`docs/QUIZ_ITEM_BANK_DRAFT.md`) authored — 20 items, 4/4/5/4/3 CEFR distribution.
- [ ] `docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` authored and DISPATCHED to a domain expert (ulpan teacher).
- [ ] Reviewer signs off in writing: items unambiguous, difficulties calibrated within their bands, validity caveats documented.
- [ ] Sign-off recorded in `ULPAN_DIAGNOSTIC_QUIZ_v1.md` calibration audit log.

### Per-direction Definition of Done

**Quiz infrastructure (D13) is Done when:**

- [ ] `public/quiz/ulpan_diagnostic_v1.json` validates against §4 schema (smoke: 8/8 bank cases).
- [ ] Scoring algorithm validated against R `mirt` reference: r > 0.99, MAD < 0.05 SD on 100 simulated respondents (smoke: 6/6 scoring cases).
- [ ] Quiz UI modal: open, item flow, refresh-resume, submit, score reveal, completion gate (smoke: 8/8 UI cases).
- [ ] Privacy invariants pinned: localStorage cleared on submit, no item-level data in network HAR, ISO-day timestamps only (smoke: 5/5 privacy cases).
- [ ] Server validator accepts new fields with correct bounds + rejects malformed (smoke: 7/7 quiz-validator cases).
- [ ] Admin reset CLI: works, audit-logs, idempotent (smoke: 5/5 reset CLI cases).
- [ ] Teacher dashboard renders quiz score + CEFR + SE; teacher CSV still wins; scatter shows two series; CSV export includes new columns (smoke: 3 new teacher cases).
- [ ] `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` + `docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` authored.
- [ ] `RESEARCHER_GUIDE.md` §4.3 added; `RESEARCH_METRICS_SCHEMA.md` extended; `RESEARCH_CONSENT_RULE.md` example E added.

### Cycle-wide Definition of Done

**v3.3.5 patch ships when:**

- [ ] All 6 §13 smoke suites green: 42 new cases + 197 existing = **239 cases ALL GREEN**.
- [ ] Privacy checklist signed off (item-level data never on the wire — verified via HAR audit smoke).
- [ ] `CONSENT_VERSION` remained at `1.0` (no bump) AND consent template edit shipped (per §3 audit conditions).
- [ ] `package.json` version bumped to `3.3.5`.
- [ ] `CHANGELOG.md [Unreleased]` collapsed to `[3.3.5] — YYYY-MM-DD`.
- [ ] Annotated git tag `v3.3.5` pushed.
- [ ] `gh release create v3.3.5` published.
- [ ] Memory updates: `project_v3_3_backlog.md` v3.3.5 row marked ✅ shipped.

---

## 17. Commit sequence

```
v3.3.4 ────► C0 ──► C1 ──► C2 ──► C3 ──► C4 ──► C5 ──► C6 ──► C7 ──► C8 ──► C9 ──► C10 ──► C11 ──► tag v3.3.5

C0  docs(quiz): item-bank review brief + master plan §3 audit example E
    + docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md
    + RESEARCH_CONSENT_RULE.md example E
    + RESEARCH_ETHICS_CONSENT_TEMPLATE.md §3.2 #3 cosmetic edit
    ── (BLOCKING) ulpan teacher sign-off received before C1 ──

C1  feat(quiz): JSON schema + item bank scaffold + validator script
    + public/quiz/ulpan_diagnostic_v1.json (20 items, signed-off)
    + scripts/quiz/validate-bank.js
    + scripts/quiz/bank-validate-smoke.js
    smoke: 8/8 bank cases green

C2  feat(quiz): Rasch 1PL scoring engine + R-mirt fixture
    + public/js/quiz-scoring.js
    + scripts/quiz/__fixtures__/mirt-reference.json
    + scripts/quiz/scoring-smoke.js
    smoke: 6/6 scoring cases green

C3  feat(quiz): UI modal + word_study integration trigger + local progress
    + public/js/quiz-ui.js
    + public/index.html (+ "🎓 Калибровочная диагностика" button in research panel)
    + i18n placeholders (final keys in C10)
    smoke: 8/8 UI cases green

C4  feat(quiz): privacy hardening — submit cleanup + HAR audit smoke
    + Local privacy invariants enforced in quiz-ui.js submit handler
    + scripts/quiz/privacy-smoke.js
    smoke: 5/5 privacy cases green

C5  feat(research): submitQuizOutcome() in research.js + outcome_capture_method extension
    + public/js/research.js (new public submitQuizOutcome surface)
    + smoke: research-client-test.html +6 cases (matches submitOutcome coverage shape)

C6  feat(research): server-side validator accepts calibrated-quiz fields
    + research/validate.js (ALLOWED_OUTCOME_KEYS + enum extension + validators)
    + scripts/research/quiz-validator-smoke.js
    smoke: 7/7 validator cases green

C7  feat(research): teacher dashboard renders quiz score + CEFR + SE
    + public/teacher.html / public/js/teacher.js (per-student column extensions)
    + scatter shows 2 series
    + cohort_<code>_aggregates.csv adds quiz columns
    + teacher-smoke.js +3 cases

C8  feat(research): admin quiz-reset CLI
    + scripts/research/reset_quiz_for_student.js
    + scripts/research/quiz-reset-cli-smoke.js
    smoke: 5/5 reset cases green

C9  test(research): wire all 6 new smoke suites into all-smoke runner
    + scripts/research/all-smoke.js
    + package.json npm shortcuts
    full smoke matrix 239/239 ALL GREEN

C10 i18n: ~30 new keys × 3 locales for quiz UI
    + public/i18n/locales/{ru,en,he}.js

C11 docs(research): RESEARCHER_GUIDE §4.3 + RESEARCH_METRICS_SCHEMA L5
                    + ULPAN_DIAGNOSTIC_QUIZ_v1.md
    + memory/project_v3_3_backlog.md status update

C12 chore(release): v3.3.5 — bump package.json + CHANGELOG
    + package.json 3.3.4 → 3.3.5
    + CHANGELOG.md [Unreleased] → [3.3.5] — YYYY-MM-DD

Tag: git tag -a v3.3.5 -m "v3.3.5 — Direction 13 calibrated diagnostic quiz"
Push: git push origin main v3.3.5
Release: gh release create v3.3.5 --notes-file Smoke-check/release-notes-v3.3.5.md --latest
```

**Total estimated change:** ~4500 LOC + ~6 new modules + ~6 new smoke runners. Wall-clock estimate: **8-12 days** for a single developer (C0 includes reviewer wait-time, can run in parallel with other work).

**Critical path:** C0 → reviewer wait (1-N days external) → C1 onwards. The cycle's wall-clock is dominated by reviewer turnaround; the actual coding portion is ~6-8 dev-days.

---

## 18. Out of scope (deferred per user notes)

The following user-suggested polish items are NOT part of v3.3.5; they go to v3.3.6+ or v3.4:

- **Multicohort cohort nickname UI** (user note 7) — small polish patch under v3.3.6 alongside graph view, or its own patch.
- **Cross-text snippet improvements** (user note 8): per-row before/after context, exact/root/inflection badge, binyan display, current-text-down sort, "only other texts" filter, copy-examples button. → v3.3.7+ polish.
- **Cross-text large-library performance dogfood** (user note 9): 100/500/Tanakh/mobile/Android testing. → operational/QA work, not a code patch.
- **Real-data IRT recalibration** (this plan §14): waits for ≥30 quiz responses before v3.4 work.

Each item is its own micro-patch; none gates v3.3.5.

---

## 19. Open clarifications

These small decisions are pre-filled with defaults; the user can rebut any before C0:

| ID | Question | Default |
|---|---|---|
| Q1 | Quiz triggered from where? | Research panel new button (alongside 🎓 Сдать экзамен) — same placement convention. |
| Q2 | Time limit per item? | **None** — only soft target of ~10 min total surfaced in intro copy (matches user note 3). |
| Q3 | Can the user skip an item? | **No** — all 20 must be answered. Skip leads to undefined theta estimation. UI shows "Pick an option to continue". |
| Q4 | Audio items in v3.3.5? | **No** — text-only. Audio listening items deferred to v3.4. |
| Q5 | Item shuffle? | **No** — same fixed order for all respondents. Simpler IRT validity argument (no need to model order effects). Future: randomize via deterministic per-student hash. |
| Q6 | Locale switching mid-quiz? | **No** — locked at start. Mid-quiz switch could confuse reading comprehension scores. |
| Q7 | Show score immediately after submit? | **Yes** — privacy-safe (score is what's already uploaded). Reveal screen has CEFR band + score + SE + "your local data has been deleted; only this summary uploaded" reassurance. |
| Q8 | Allow take-test-just-for-fun mode (no upload)? | **Not in v3.3.5** — opens trust-question (would users worry data is uploaded anyway?). Defer to v3.4 along with calibration data. |
| Q9 | i18n RU/EN/HE for instrument label? | **RU/EN/HE** parity at item-bank level; UI strings as usual via i18n locales. |

---

## 20. Approval gate

This document is the **proposed phase plan**. Before C0 kicks off:

1. User reviews end-to-end.
2. User confirms or rebuts each §3 audit conclusion (the consent-coverage call is the most consequential decision — if user wants minor bump anyway, C0 must include the bump + re-consent prompt logic).
3. User confirms §19 open clarifications (or rebuts specific Q's).
4. User authorizes the C0 docs commit (item-bank review brief + audit example E + consent template cosmetic edit).
5. Sign-off received from ulpan-teacher domain expert before C1 implementation begins.

—  *signed,* draft prepared by Claude Opus 4.7 (1M context) on 2026-05-14 immediately after v3.3.4 hotfix ship.
