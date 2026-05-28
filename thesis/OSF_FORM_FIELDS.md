# OSF Preregistration Form — Copy-Paste Field Mapping

> **Назначение.** Свести submit OSF preregistration к механической
> копи-пасте без размышлений. Открой этот файл рядом с OSF формой,
> копируй блок за блоком.
>
> **Источник.** `thesis/OSF_PREREGISTRATION_DRAFT.md` — структурированный
> draft. Этот файл — re-organized в порядке полей, в котором они появятся
> в OSF UI.
>
> **Status.** DRAFT — ready for user submit. Save as draft only; review
> before final Register click.
>
> **Время на submit.** ~15-20 минут механической вставки + ~10 минут
> review.

---

## Шаг 0 — Открыть форму

1. https://osf.io → Sign in (если ещё не) → My OSF → Registrations
2. Click **"Add new"** (top right)
3. **Schema (template) selection:**
   - Provider: **OSF Registries**
   - Template: **"OSF Preregistration"** (standard, ~22 fields, расширенный)

   *Альтернатива:* «Preregistration Template from AsPredicted.org»
   (короче, 8 fields). Если хочешь короче — используй §«Bonus» в конце
   этого файла. Default рекомендация: **OSF Preregistration**
   (стандартный, шире принят).
4. Click **"Create"** / **"Start preregistration"**

---

## Шаг 1 — Registration metadata (первая страница)

### Field: Title

**Что вставить:**
```
Correlation analysis of digital learning activity and outcomes in a Hebrew ulpan course: a single-cohort exploratory study with a privacy-preserving opt-in research-mode
```

*Длина:* 191 символ — OSF принимает до 200.

### Field: Description

**Что вставить:**
```
This preregistration locks the analysis plan for an exploratory single-cohort correlational study examining the relationship between digital learning activity (six-layer metric taxonomy collected via LinguistPro, an open-source language-learning application) and learning outcomes (growth from pre-test to post-test) in a Hebrew ulpan course.

The study has two contributions: (1) a methodological contribution — the design of a privacy-preserving opt-in research-mode (k-anonymity, two-key split-knowledge, schema-strict server-side validation, one-click withdrawal) — which is publishable and defensible independent of empirical findings; and (2) an empirical correlation analysis, explicitly framed as exploratory given expected sample size (single ulpan cohort, N ≈ 8-15).

The empirical part is underpowered for medium effect sizes (r = 0.5 requires N ≈ 28 at α=0.05, β=0.20). Any positive findings are reported with 95% confidence intervals and explicit acknowledgement of the sample-size bounds. Code, schema, data dictionary, and an anonymized replication package will be open-sourced.
```

### Field: License (dropdown / radio)

**Выбрать:** **CC-By Attribution 4.0 International**

*Rationale:* стандарт для open research, совместим с диссертацией.

### Field: Subjects (multi-select из controlled vocabulary)

**Выбрать (можно несколько):**
- Education → Higher Education
- Education → Online and Distance Education
- Education → Educational Methods
- Social and Behavioral Sciences → Linguistics → Applied Linguistics
- Social and Behavioral Sciences → Linguistics → Second Language Acquisition

*Если нет ровно таких — выбери ближайшие. Subjects не критичны для
самой preregistration; они нужны только для discoverability.*

### Field: Tags (free text, comma-separated или add one-by-one)

**Что вставить (по одному тегу):**
```
Hebrew
ulpan
CALL
computer-assisted language learning
privacy-preserving research
k-anonymity
two-key split-knowledge
opt-in consent
diploma research
LinguistPro
single-cohort correlational
learning analytics
Rasch model
SRS
```

### Field: Affiliated Institutions (optional)

Если у тебя есть affiliation с университетом в OSF profile — добавить.
Если нет — оставить пустым.

### Field: Contributors

По умолчанию ты сам как только автор. Добавлять supervisor'а — только
если у него OSF account И он согласен быть contributor. Если нет —
оставить только тебя.

---

## Шаг 2 — Schema fields (основная форма)

### Section 1: Study Information

#### 1.1 — Title

*Pre-filled from Шаг 1 metadata. Не трогать.*

#### 1.2 — Description (если schema просит отдельно от metadata)

*Pre-filled или скопировать Description из Шаг 1.*

#### 1.3 — Hypotheses

**Что вставить:**
```
The study tests four primary hypotheses (Bonferroni-corrected α = 0.05/4 = 0.0125, one-tailed predictions based on prior CALL literature on engagement → learning outcomes):

H1. total_active_minutes_real correlates POSITIVELY with growth_delta (Pearson r > 0).
   Rationale: time-on-task is a robust predictor of learning gain in the CALL literature (Hattie 2009; Ericsson & Pool 2016 deliberate practice framework).

H2. total_cards_added_to_srs correlates POSITIVELY with growth_delta.
   Rationale: active card creation indicates the learner is processing and curating new material — a metacognitive engagement signal beyond raw exposure time.

H3. total_notes_created correlates POSITIVELY with growth_delta.
   Rationale: note-taking is an effortful retrieval / elaboration activity associated with deeper encoding (Mueller & Oppenheimer 2014).

H4. srs_error_rate correlates NEGATIVELY with growth_delta.
   Rationale: higher error rate during practice indicates weaker recall; we expect inverse relationship with overall learning gain.

All other 20+ collected metrics (total_audio_ms, total_sentences_read_distinct, total_texts_opened_distinct, audio_replay_avg_per_row, total_search_queries, smart_tag_overrides_count, translit_toggles_count, active_days_count, streak_max, derived engagement_score / quality_score / efficiency_ratio, per-day timeseries fields, time-of-day distributions, audio replay distributions) are exploratory. They will be reported with descriptive statistics + 95% CI without statistical significance testing.
```

---

### Section 2: Design Plan

#### 2.1 — Study type

**Выбрать:** **Observational study**

*Rationale:* no manipulation; single-cohort correlational.

#### 2.2 — Blinding

**Выбрать:** **No blinding is involved in this study.**

#### 2.3 — Is there any additional blinding in your study?

**Что вставить:**
```
N/A. Single-cohort observational design without experimental conditions; no participants, researchers, or analysts are blinded because there are no conditions to be blinded to. The analysis is exploratory-correlational, and the dependent variable (growth_delta) is computed deterministically from teacher-reported scores.
```

#### 2.4 — Study design

**Что вставить:**
```
Single-cohort correlational design (no random assignment, no control group).

Participants: voluntary opt-in adult Hebrew-ulpan students from one cohort recruited by their teacher. Participants use LinguistPro (an open-source language-learning web application, github.com/SindromRadioSpb/tts-prototype-android) over the course duration (estimated 6-12 weeks). Participation requires explicit opt-in consent inside the application; default state is OFF.

Data collection: anonymous, aggregated, daily uploads of six-layer engagement metrics to a research-mode server (POST /api/research/v1/metrics). No raw text, note bodies, search strings, or PII ever leave the participant's device. Schema-strict server-side validation rejects any payload containing forbidden fields.

Outcome capture: teacher provides post-test (and optionally pre-test) exam scores via CSV upload, joined to anonymous student_id only when participants choose to share their UUID with the teacher (two-key split-knowledge architecture). Independent path: in-app calibrated diagnostic quiz (20-item Rasch 1PL instrument) as secondary outcome with standard error reported.

This design is NOT a randomized controlled trial. RCT is explicitly out of scope for the diploma scale due to single-cohort recruitment constraints.
```

#### 2.5 — Randomization

**Что вставить:**
```
No randomization. Single-cohort observational design. All consenting participants are pooled into one group.
```

---

### Section 3: Sampling Plan

> **2026-05-21 update.** Actual OSF UI uses 5 fields in Section 3 (no
> separate «Existing data» radio button — that radio is part of the
> older classic schema variant). The existing-data acknowledgement (PI
> dogfood exclusion + pilot-vs-study boundary) is folded into 3.1 (Data
> collection procedures, inclusion/exclusion criteria) + 3.5 (Starting
> and stopping rules, pilot boundary). Subsections re-numbered to
> match actual UI: 3.1 procedures / 3.2 file upload / 3.3 sample size /
> 3.4 rationale / 3.5 starting+stopping. Older subsection labels below
> were retained for traceability — use the NEW labels.

---

### Section 3 (re-organized for actual OSF UI) — Sampling

#### 3.1 — Data collection procedures

**OSF prompt:** «Describe the process by which you will define your
sampling strategy and collect new data or gather and prepare existing
data. This can include the relevant population from which you will
sample, the sampling frame, the recruiting method, the inclusion and
exclusion criteria for eligibility to be in the sample, the source or
location of the sample (e.g., geographic region for people, batch
numbers for reagents), and the expected duration of data collection.»

**Что вставить:**
```
SAMPLING STRATEGY: single-cohort opportunistic sampling. The unit of analysis is one Hebrew ulpan course cohort recruited by a single ulpan teacher. There is no recruitment beyond this natural cohort size; the study uses whatever participants the cohort happens to contain.

TARGET POPULATION: adult Hebrew-language learners (ages 18+) enrolled in an ulpan course. The cohort is expected to consist predominantly of Russian-L1 speakers learning Hebrew as a second language; ulpan-level estimated A2-B2 (CEFR) per typical ulpan group composition. Generalization is scoped to this population — see Discussion section in the thesis for explicit limits.

SAMPLING FRAME: the full roster of students enrolled in the single ulpan cohort at the time of study initiation. Frame size is the cohort enrollment count (estimated 8-15 students).

RECRUITING METHOD: indirect recruitment via the ulpan teacher. The teacher distributes the cohort code (a non-secret group identifier of the form [A-Z0-9-]{4,16}, e.g. "ULPAN-A-W2026") to her students through whichever channel she chooses (WhatsApp group / Telegram / printed handout / email). Students receive a brief explaining the study, then navigate to the LinguistPro web application, open the Research panel, and decide whether to opt in. The principal investigator does NOT contact participants directly during recruitment; this is intentional to preserve the two-key split-knowledge architecture (researcher knows anonymous UUIDs and metrics, teacher knows names and exam scores, linking is participant-initiated post-course).

INCLUSION CRITERIA:
- Enrolled in the recruiting ulpan cohort at study start.
- Age 18 or older.
- Has access to a device (desktop, mobile, or tablet) capable of running a modern web browser with localStorage and IndexedDB.
- Provides explicit informed consent inside the application (5 mandatory checkboxes: read & understood, voluntary, right to withdraw, aggregated-only collection, agree to participate).

EXCLUSION CRITERIA:
- Did not opt in to research mode (no consent click -> no data collected -> not a participant).
- Opted in but never produced any data upload during the course duration (no signal -- excluded from analysis).
- Withdrew mid-course via the one-click withdrawal flow (data fully deleted server-side; not included in final analysis but counted in attrition).
- Principal investigator's own dogfood UUID (used during development-phase testing on the PI's own device prior to participant recruitment) -- identified by known UUID value, excluded from cohort analysis by ID.
- Missing outcome (no exam score available via any of the three paths: teacher CSV, student self-report, in-app calibrated quiz) -- excluded from primary correlation analysis but retained in cohort descriptive statistics where possible.

SOURCE / LOCATION: the cohort recruits participants from one ulpan teacher's class. Geographic location is wherever the teacher's students reside (cohorts may be in-person at a physical ulpan facility OR online/remote depending on the teacher's instructional mode). No geographic data is collected from participants (no IP, no geolocation per the privacy architecture); the geographic scope is therefore documented only at the cohort level via teacher-supplied context, not via per-student capture.

EXPECTED DURATION OF DATA COLLECTION: tied to the natural course duration of the ulpan cohort. Typical ulpan terms run 6 to 12 weeks. Data collection begins on the date the first participant accepts consent and ends at the cohort term's conclusion (set by the teacher's syllabus). No extension of data collection beyond the cohort term.

DATA INSTRUMENTATION: participants use LinguistPro (open-source, github.com/SindromRadioSpb/tts-prototype-android) as one of their Hebrew study tools during the course. The application collects six layers of engagement metrics locally; once per day, daily aggregates (no raw text, no PII) are uploaded to a Railway-hosted research server (EU region) via POST /api/research/v1/metrics. Outcome capture happens via three independent paths: (a) teacher CSV upload at course end, mapping participant UUIDs to exam scores; (b) participant self-report through the application; (c) in-app 20-item calibrated Rasch 1PL diagnostic quiz (ulpan_diagnostic_v1).

FULL OPERATIONAL DETAIL: see docs/RESEARCHER_GUIDE.md in the open-source repository for the complete data collection procedure, including cohort provisioning CLI, consent flow, daily aggregator scheduling, withdrawal mechanics, and outcome capture workflows.
```

#### 3.2 — Data collection procedures — File upload (Optional)

**Рекомендация:** **пропустить** (skip / leave empty).

Rationale: всё уже описано в §3.1 + в open-source repo. Загрузка PDF —
лишний шаг, increases lock-in (uploaded file становится permanent OSF
archive). Если позже нужно — можно добавить к draft без re-registration.

*Если хочешь всё-таки upload-нуть* — наиболее useful был бы
`docs/RESEARCHER_GUIDE.md` (полная операционная процедура). Конвертируешь
в PDF (через pandoc или Save As PDF из markdown-viewer) и аттачишь.

#### 3.3 — Sample size

**OSF prompt:** «Describe the sample size for each unit of analysis,
including noting whether the sample size is expected to be the same
across conditions, treatments or clusters, or describe the planned
sample sizes for each condition, treatment, or cluster. If there is a
multi-level or mixed design, describe the sample size at each level and
any details needed to understand the nesting of sample sizes across
levels.»

**Что вставить:**
```
TARGET SAMPLE: the full single ulpan cohort recruited by one ulpan teacher. Expected enrollment N = 8-15 students (typical ulpan group size). All consenting opted-in participants form the analytic sample; there is no random subsampling within the cohort.

EFFECTIVE SAMPLE FOR PRIMARY ANALYSIS: the linked subsample of participants who simultaneously (a) opted in to research mode, (b) shared their anonymous student_id UUID with the teacher to enable outcome linkage, and (c) have a non-null outcome score in the teacher CSV upload. Expected effective N = 5-12. This is the sample to which the four primary hypotheses (H1-H4) are applied.

EFFECTIVE SAMPLE FOR EXPLORATORY DESCRIPTIVE ANALYSES: all opted-in participants regardless of outcome availability (engagement metrics are collected from every opted-in participant; outcome data is only required for correlation analyses involving growth_delta). Expected N = 8-15.

NO CLUSTERING OR MULTI-LEVEL STRUCTURE: single cohort, single level of analysis (per-student). There is no class-within-school nesting because the study is restricted to one cohort. Multi-level modeling is therefore not applicable.

NO BETWEEN-CONDITION COMPARISON: single-cohort observational design with no random assignment to conditions. All participants are pooled into one group.

NO RECRUITMENT TARGETS BEYOND COHORT SIZE: the study is opportunistic -- sample size equals whatever participants the natural cohort happens to contain. There is no recruitment campaign to boost N.
```

#### 3.4 — Sample size rationale (Optional)

**OSF prompt:** «Explain the basis for the planned sample size such as
a power analysis, arbitrary constraint (time, money), or pre-specified
decision rule for bayesian or other responsive designs.»

**Что вставить:**
```
SAMPLE SIZE BASIS: opportunistic. A single ulpan cohort is the natural unit of analysis for this diploma research, and the sample size equals the cohort enrollment (expected 8-15) -- not a power-targeted recruitment number. There is no resource-based justification (the marginal cost of recruiting additional cohorts to reach a power target was considered out of scope for the diploma timeline).

POWER CALCULATION (acknowledgement of underpower):
With alpha = 0.0125 (Bonferroni-corrected one-tailed for 4 primary hypotheses) and conventional 80% power:
- N = 28 is required to detect r = 0.5 (medium effect).
- N = 14 is required to detect r = 0.7 (large effect).
- At expected N approx. 10 (linked subsample), the study has 80% power only for r >= 0.78.
- Medium effects (0.3 <= r < 0.5) are statistically UNDETECTABLE at this sample size.

INTERPRETATION OF UNDERPOWER:
- Null findings on the 4 primary hypotheses must be interpreted as "no evidence of a large effect at this sample size" -- they do NOT rule out smaller effects, and they do NOT support the null hypothesis with confidence.
- Positive findings will be reported with 95% confidence intervals, which at small N will be wide (e.g., at N=10, a sample r = 0.5 has approximate 95% CI approx. [-0.10, 0.83] -- statistically indistinguishable from zero or from very strong).
- Effect-size estimates are therefore the primary inferential output, NOT p-values.

WHY PRE-REGISTER AT THIS SAMPLE SIZE:
The diploma's PRIMARY contribution is methodological -- the design of a privacy-preserving opt-in research-mode (k-anonymity, two-key split-knowledge, schema-strict server-side validation, one-click withdrawal). This contribution is independent of empirical findings. The empirical correlation analysis is a secondary demonstration that the methodological framework can be deployed on a real cohort and produce interpretable output even at small N. Pre-registration at this sample size protects the empirical analysis against HARKing and multiple-comparison inflation, and provides a citable artifact for the open-source methodological release.

BAYESIAN OR OTHER RESPONSIVE DESIGN: NOT applicable. This is a frequentist correlational design with fixed-N analysis at cohort end; no Bayes-factor stopping, no adaptive design.
```

#### 3.5 — Starting and stopping rules

**OSF prompt:** «For studies generating new data or research using a
portion of a larger existing dataset, specify how you will decide when
pilot testing ends and data collection for the study begins, and how
you will decide when to terminate data collection.»

**Что вставить:**
```
PILOT TESTING vs STUDY BOUNDARY:
- DEVELOPMENT-PHASE DOGFOOD (pre-study): the principal investigator has been using LinguistPro on the PI's own device during the implementation phase to validate the data collection pipeline, dashboard, and end-to-end flow. This dogfood data is identifiable by the PI's known student_id UUID and is NOT part of the study. It will be excluded from analysis by UUID.
- PILOT testing of recruitment / cohort provisioning protocol: BEFORE the real cohort opt-in, a 2-3 friendly-user pilot run (per docs/PRE_PILOT_MATURITY_REVIEW_2026_05_21.md and docs/PARALLEL_WORK_PLAN_DURING_PILOT.md) is planned to validate the end-to-end deployment on a tagged frozen build. Pilot users are NOT part of the study cohort. Pilot data is collected on a separate cohort_code (e.g. ULPAN-PILOT-2026-MM) and is NOT analyzed.
- STUDY BEGINS: at the date when the FIRST real cohort participant (not PI dogfood, not pilot user) accepts the informed-consent screen inside the application and joins the recruiting teacher's cohort_code. This date is recorded server-side as cohort_meta.created_at + first .jsonl line timestamp.

DATA COLLECTION DURATION:
- Tied to the natural duration of the ulpan course as set by the teacher's syllabus (typically 6-12 weeks).
- No fixed calendar deadline imposed by the study; the cohort term length is determined externally by the educational program.

STOPPING DATA COLLECTION:
- Data collection ENDS at the date of the cohort's course end (final ulpan session date) as confirmed by the teacher.
- After the course end date, no further .jsonl appends are processed for that cohort (the cohort is conceptually closed even though the server still accepts late uploads from any participant who happened to use the app post-course; such late uploads are noted but the primary analysis window is the cohort term).
- An additional 14-day "settling window" after course end is allowed for the teacher to complete CSV outcome upload + for any last-minute participant self-report submissions. Analysis begins after the settling window.

NO INTERIM ANALYSIS:
- There is NO interim analysis, NO early-stopping rule based on accumulating effect size, p-value, or other test statistics.
- The principal investigator does NOT inspect the cohort-level engagement-vs-outcome relationship until after the settling window closes and the analytic dataset is locked.
- The teacher dashboard's correlation view IS available throughout the cohort but the PI commits not to use it for inference decisions during the cohort (it is intended for the teacher's pedagogical awareness, not for premature analyst conclusions).

WITHDRAWAL:
- Any participant may withdraw at any time via the in-app one-click button (DELETE /api/research/v1/student/:uuid).
- Withdrawal removes ALL of that participant's records from the cohort jsonl files + outcomes.csv + audit-logs the removal to deletions.log.
- Withdrawn participants are NOT included in final analysis but are counted in the cohort attrition report.

DATA FREEZE:
- At the end of the settling window, the analytic dataset is exported to CSV (cohort_<code>_aggregates.csv + cohort_<code>_timeseries.csv + cohort_<code>_derived.csv) via the teacher dashboard.
- The CSV export is the FROZEN analytic dataset; subsequent server-side changes (e.g., a late uploads or a late withdrawal) do not affect the frozen dataset for the primary analysis. They will be noted in a "post-freeze events" section of the thesis if any occur.
- Analysis proceeds on the frozen export only.
```

---

### Section 4: Variables

#### 4.1 — Manipulated variables

**Что вставить:**
```
None. Observational correlational design — no experimental manipulation.
```

#### 4.2 — Measured variables

**Что вставить:**
```
DEPENDENT VARIABLE (primary outcome):
- growth_delta = post_test_score − pre_test_score
  Source: teacher CSV upload (outcomes.csv); scale defined per cohort_meta.outcome_scale (default 0-100).

SECONDARY OUTCOME (if pre-test unavailable):
- post_test_score (absolute), same source.
  Acknowledged limitation: cannot differentiate "engagement caused learning" vs "stronger learners engaged more"; causal direction is not claimed.

TERTIARY OUTCOME (in-app calibrated diagnostic, secondary path):
- quiz_score_normalized: 0-100 normalized score from 20-item 1PL Rasch diagnostic (instrument_id: ulpan_diagnostic_v1).
- quiz_se: standard error of theta estimate (Rasch measurement precision), reported alongside score.
- quiz_cefr_band: derived presentation (A1/A2/B1/B2/C1), deterministic linear bucket of quiz_score_normalized.
  Acknowledged limitation: item difficulty parameters are expert-judgement based; external ulpan-teacher review pending; empirical IRT recalibration deferred to v3.4+.

INDEPENDENT VARIABLES (primary 4, pre-registered):
- total_active_minutes_real: cumulative active minutes derived from heartbeat tracking (30-second heartbeats while tab visible AND user interaction within preceding 5 minutes). Operationally captures interactive engagement, not passive listening.
- total_cards_added_to_srs: cumulative count of SRS card creations from notes (proactive learner signal).
- total_notes_created: cumulative count of note save events.
- srs_error_rate: cards_again / cards_reviewed (in-app stub Trainer reviews only; per SRS_STRATEGY_v3_2.md, Anki is the recommended review layer — this metric measures the secondary path).

INDEPENDENT VARIABLES (exploratory secondary, NOT pre-registered for confirmatory testing):
- total_audio_ms (audio playback duration)
- total_sentences_read_distinct
- total_texts_opened_distinct
- audio_replay_avg_per_row
- total_search_queries (count only; query strings never collected)
- smart_tag_overrides_count
- translit_toggles_count
- active_days_count
- streak_max
- engagement_score (derived composite: 0.4×norm(active_min) + 0.4×norm(cards_reviewed) + 0.2×norm(notes_created))
- quality_score = 1 - srs_error_rate
- efficiency_ratio = cards_correct / active_minutes
- engagement_consistency = active_days_count / cohort_total_days
- Per-day timeseries fields (per-student per-day metrics)
- Time-of-day activity histograms (24 buckets)
- Audio replay distributions (1 / 2 / 3 / 4+ buckets)
- cards_added_to_srs / cards_exported_to_anki ratio (mastery proxy per SRS_STRATEGY)

Full schema with units, ranges, semantics, and edge cases is documented in docs/RESEARCH_METRICS_SCHEMA.md in the open-source repository.
```

#### 4.3 — Measured variables — File upload (Optional)

**Рекомендация:** **пропустить.**

Если хочешь добавить — `docs/RESEARCH_METRICS_SCHEMA.md` (полная schema
с типами / диапазонами / edge cases per field). Сохранить как PDF и
attach. Но это lock-in: uploaded file становится permanent в OSF archive;
обновления schema будут идти отдельно, не в registration. Лучше оставить
ссылку на open-source repo в text response и обновлять там.

#### 4.4 — Indices

**OSF prompt:** «Describe how measured variables will be combined into
indices or derived variables. Include a formula or precise description
of the method of creating the derived variable.»

**Что вставить:**
```
DERIVED VARIABLES — computed at analysis time (not collected directly):

1. growth_delta (PRIMARY OUTCOME)
   Formula:  growth_delta = post_test_score − pre_test_score
   Inputs:   post_test_score (teacher CSV upload), pre_test_score (teacher CSV upload)
   Units:    same scale as outcome (default 0-100 per cohort_meta.outcome_scale)
   Edge case: if pre_test_score is null, growth_delta is null → participant excluded from primary correlation analyses; falls back to post_test_score absolute as secondary outcome.

2. engagement_score (composite engagement index, EXPLORATORY)
   Formula:  engagement_score = 0.4 × normalize(total_active_minutes_real)
                              + 0.4 × normalize(total_cards_reviewed)
                              + 0.2 × normalize(total_notes_created)
   Normalization: min-max scaling within the cohort:
                  normalize(x) = (x − min(x)) / (max(x) − min(x)), clamped to [0, 1].
   Edge cases: if max(x) == min(x) for any component (no cohort variance), that component contributes zero to the score (i.e., effectively a 60% weighting on the remaining components). Such a degenerate-cohort case is flagged in the analysis output rather than silently dropped.
   Range:    [0, 1]
   Source:   formula from docs/ULPAN_RESEARCH_PLAN_v3_2.md §8 Derived metrics table.

3. quality_score (EXPLORATORY)
   Formula:  quality_score = 1 − srs_error_rate
   Inputs:   srs_error_rate = cards_again / cards_reviewed (with cards_reviewed > 0)
   Edge case: if cards_reviewed == 0, quality_score is null (not zero); participant has no quality signal.
   Range:    [0, 1]

4. efficiency_ratio (EXPLORATORY)
   Formula:  efficiency_ratio = total_cards_correct / total_active_minutes_real
   Inputs:   cards_correct (sum across reviews where grade in {good, easy}), active_minutes_real
   Edge case: if total_active_minutes_real == 0, efficiency_ratio is null (division by zero); participant has no engagement signal.
   Units:    cards per minute
   Range:    [0, ∞)

5. engagement_consistency (EXPLORATORY)
   Formula:  engagement_consistency = active_days_count / cohort_total_days
   Inputs:   active_days_count (distinct days with ≥1 session), cohort_total_days (calendar days between cohort start and end)
   Edge case: cohort_total_days is computed at analysis time from cohort_meta.created_at and the documented cohort end date; if either is missing, falls back to (max(upload_ts) − min(upload_ts)) + 1.
   Range:    [0, 1]

6. cards_creation_to_export_ratio (EXPLORATORY mastery proxy, per docs/SRS_STRATEGY_v3_2.md)
   Formula:  cards_creation_to_export_ratio = total_cards_exported_to_anki / total_cards_added_to_srs
   Inputs:   cards_exported_to_anki, cards_added_to_srs
   Edge case: if total_cards_added_to_srs == 0, ratio is null.
   Range:    [0, 1] under normal use (exports cannot exceed creations); higher values indicate the participant moved more of their created cards into the "real" review pipeline (Anki).

7. words_unique_estimate (collected directly via Bloom filter / hash set, NOT a derived variable but documented here for completeness; range [0, ∞), integer)

ANALYTIC TRANSFORMATIONS (applied at analysis time, not stored as variables):
- Bonferroni-corrected α for primary hypothesis tests: α_corrected = 0.05 / 4 = 0.0125 (used in inference criteria).
- 95% confidence intervals for Pearson r: Fisher z-transformation, standard formula z' = 0.5 × ln((1+r)/(1−r)); CI in z-space then back-transformed to r-space.

ALL FORMULAS are documented in docs/ULPAN_RESEARCH_PLAN_v3_2.md §8 (Derived metrics table) and will be computed in the R analysis notebook released as part of the replication package.
```

#### 4.5 — Indices — File upload (Optional)

**Рекомендация:** **пропустить.** Формулы выше purely numeric и
self-contained — PDF не нужен.

> **2026-05-21 update.** §4.1-4.3 above written for compact OSF
> Preregistration variant. Actual OSF UI uses 5 fields in Variables
> (Manipulated / Measured / Measured-file-upload / Indices /
> Indices-file-upload). Use §4.1 «Manipulated variables» content +
> §4.2 «Measured variables» content + §4.3 «Measured-file-upload»
> recommendation + §4.4 «Indices» content (expanded with per-formula
> edge cases) + §4.5 «Indices-file-upload» recommendation.
>
> For the «Manipulated variables» field, OSF prompt says «If the
> investigation has no randomization, then respond none.» You can paste
> the brief block from §4.1 OR just literally type «None». Either is
> accepted.

---

### Section 5: Analysis Plan

> **2026-05-21 update.** Actual OSF UI uses 7 fields here (Statistical
> models / file upload / Transformations / Inference criteria / Data
> inclusion+exclusion / Missing data / Other planned analysis). The
> «Statistical models» field explicitly requests positive/negative
> controls, manipulation checks, convergence criteria, and tests of
> model assumptions — §5.1 below expanded accordingly. Subsections
> re-numbered: 5.1 models / 5.2 file upload / 5.3 transformations /
> 5.4 inference / 5.5 inclusion+exclusion / 5.6 missing data /
> 5.7 other planned (renamed from "exploratory").

#### 5.1 — Statistical models

**OSF prompt:** «Describe the statistical model that will be used to
test each research question or hypothesis. Explain the type of model
(e.g. ANOVA, multiple regression, SEM, etc) and the specification of
the model. List each variable that will be included, all interactions,
subgroup analyses, pairwise or complex contrasts, and any follow-up
tests from omnibus tests. Be detailed so that others can run the same
analysis with the provided information. Mention if any positive
controls, negative controls, manipulation checks, convergence criteria,
or tests of model assumptions will be used. If analysis of some models
are contingent on controls, checks, convergence, or assumption tests,
then describe the decision criteria of whether the model will or will
not be used depending on those outcomes.»

**Что вставить:**
```
PRIMARY HYPOTHESIS TESTS (H1-H4) — Pearson correlation:

Model type: bivariate Pearson product-moment correlation coefficient, r.

Specification (each tested separately):
- H1: r(total_active_minutes_real, growth_delta), one-tailed positive prediction
- H2: r(total_cards_added_to_srs, growth_delta), one-tailed positive prediction
- H3: r(total_notes_created, growth_delta), one-tailed positive prediction
- H4: r(srs_error_rate, growth_delta), one-tailed negative prediction

For each: report r point estimate + 95% confidence interval (Fisher z-transformation method: z' = 0.5 × ln((1+r)/(1−r)); CI in z-space then back-transformed). Compare against Bonferroni-corrected α = 0.05 / 4 = 0.0125. p-value is reported but NOT the primary inferential statistic — effect size + CI is the primary output (rationale: with expected effective N ≈ 5-12, p-value-based inference is unreliable; effect-size-with-CI framing is more honest about uncertainty).

INTERACTIONS: none planned. Each primary hypothesis is tested bivariately; the multiple-regression model below jointly estimates the four predictors but does NOT include interaction terms (insufficient N for interaction power).

CONFIRMATORY MULTIPLE LINEAR REGRESSION (single model, supplementary to bivariate primary tests):

Model type: ordinary least squares (OLS) multiple linear regression with continuous outcome.

Specification:
   growth_delta ~ active_minutes_real + cards_added_to_srs + notes_created + srs_error_rate
                + [optional covariates if collected: pre_test_score, motivation, hours_per_week, prior_hebrew_exposure]

Reported: standardized β coefficients with 95% CIs, omnibus R², adjusted R² (penalized for small N via standard formula), variance inflation factors (VIF) for each predictor as collinearity diagnostic.

INTERACTIONS: none planned (justification above).
SUBGROUP ANALYSES: none planned in the primary model.
PAIRWISE / COMPLEX CONTRASTS: not applicable (continuous outcome, no group levels).
FOLLOW-UP TESTS FROM OMNIBUS: not applicable (no ANOVA / omnibus F-test driving secondary contrasts).

POSITIVE CONTROLS: not applicable — this is an observational study with no manipulation that could be paired with a "should-show-an-effect" positive control.

NEGATIVE CONTROLS: not applicable for the same reason.

MANIPULATION CHECKS: not applicable — no manipulation.

CONVERGENCE CRITERIA: OLS regression has a closed-form analytic solution, so there is no iterative convergence to monitor. The Fisher z-transformation for Pearson r CI is also deterministic.

TESTS OF MODEL ASSUMPTIONS (post-fit diagnostics, REPORTED with the primary analyses):
- Normality of residuals: Shapiro-Wilk test + visual Q-Q plot. Reported as descriptive — NOT used as a gate.
- Linearity of relationships: residuals-vs-fitted scatter plot; locally weighted smoothing (loess) overlay.
- Homoscedasticity: Breusch-Pagan test reported as descriptive.
- High-influence observations: Cook's distance for each observation; report any with Cook's d > 4/N (conventional cutoff for small N) as flagged observations — NOT excluded.
- Multicollinearity (regression only): VIF for each predictor. Conventional concern threshold VIF > 5; if exceeded, the affected predictor pair is reported as collinear and the joint interpretation is qualified accordingly.

DECISION CRITERIA CONTINGENT ON ASSUMPTION TESTS:
- If Shapiro-Wilk indicates non-normal residuals AT small N: report Spearman ρ as a robust alternative ALONGSIDE Pearson r; this is a sensitivity check, not a replacement.
- If Breusch-Pagan indicates heteroscedasticity: report Huber-White heteroscedasticity-consistent (HC3) standard errors for regression coefficients alongside the OLS standard errors.
- If Cook's distance flags >1 high-influence observation in a sample of N=10: report the analysis BOTH with and without the flagged observation(s) to show sensitivity. We do NOT silently exclude them (per the data-exclusion field below — outlier exclusion at small N is too aggressive).
- If VIF > 5 for any pair: report the bivariate Pearson r for that pair separately, qualifying the joint regression interpretation.
- If ALL three of {normality, homoscedasticity, linearity} fail catastrophically AND robust methods diverge from primary in magnitude or direction: explicitly downgrade the affected primary hypothesis from "confirmatory" to "exploratory" in the thesis, with the disagreement reported transparently. This downgrade is decided BEFORE seeing any of the primary effect sizes, based only on the assumption-test outcomes.

SOFTWARE: All analyses conducted in R (version ≥ 4.0). Base R + tidyverse + olsrr (for VIF / Cook's distance / Breusch-Pagan) + ggplot2 (diagnostic plots). The complete R analysis notebook (.Rmd) will be released as part of the open replication package alongside the thesis.
```

#### 5.2 — Statistical models — File upload (Optional)

**Рекомендация:** **пропустить.** Если очень хочешь — finished R
notebook после анализа (но это уже post-pilot, не сейчас).

#### 5.3 — Transformations

**OSF prompt:** «Describe the coding scheme that will be used for
categorical variables and the process of transforming, centering, or
recoding data to be used in the models. If no transformations will be
performed on the data, say so.»

**Что вставить:**
```
NO TRANSFORMATIONS of count metrics: all count-based metrics (active_minutes, cards, notes, sentences, etc.) are kept on the raw integer scale for primary Pearson correlation analyses. Log-transformation is NOT applied. This is a deliberate choice: at expected N ≈ 10, distributional assumptions are weak in any case, and log-transformation reduces interpretability of the effect-size estimate.

NO RE-CODING of measured variables: outcome (growth_delta, post_test_score, quiz_score_normalized), engagement metrics, and any covariates collected via teacher survey are used as raw values without re-coding.

NO CATEGORICAL VARIABLE CODING in the primary models: all variables in H1-H4 and the confirmatory regression are continuous. If a covariate happens to be ordinal (e.g., self-reported motivation on a Likert 1-5 scale) it is treated as continuous (per common practice for 5-point ordinal in regression with small N).

MIN-MAX NORMALIZATION applied ONLY when computing the derived engagement_score index (see §4 Indices: normalize(x) = (x − min(x)) / (max(x) − min(x))). NOT applied when computing Pearson r between primary metrics and growth_delta — those use raw cohort-scale values.

CENTERING: not applied for primary analyses. For the regression, predictors are NOT centered (interpretation of coefficients is in original-unit scale).

If exploratory analyses motivated by post-hoc diagnostics suggest transformation (e.g., severe right-skew of a metric), the transformation will be applied as a sensitivity check ONLY, with both raw and transformed results reported.

ROBUST SENSITIVITY: Spearman ρ (rank-based) is reported alongside Pearson r as an inherently transformation-invariant robust check; this requires no explicit data transformation.
```

#### 5.4 — Inference criteria

**OSF prompt:** «Describe the criteria that will be used to make
inferences. Include the information that will be used (e.g. specify the
p-values, bayes factors, specific model fit indices), as well as cut-off
criterion, where appropriate. Include if you will be using one or two
tailed tests for each of your analyses. Explain how comparing multiple
conditions or testing multiple hypotheses will be accounted for.»

**Что вставить:**
```
PRIMARY HYPOTHESES (H1-H4):

α threshold: Bonferroni-corrected α = 0.05 / 4 = 0.0125 per hypothesis (one-tailed test in each case, with directionality pre-specified in the Hypotheses section).

Test direction:
- H1, H2, H3: one-tailed positive (r > 0 predicted).
- H4: one-tailed negative (r < 0 predicted).

Primary inferential output: effect size r with 95% confidence interval (Fisher z-transformation).

Decision rule for "support":
- "DIRECTIONALLY SUPPORTED" if (a) r is in the predicted direction AND (b) 95% CI excludes zero AND (c) p < α_corrected.
- "DIRECTIONALLY CONSISTENT BUT UNDERPOWERED" if r is in the predicted direction AND 95% CI overlaps zero (regardless of p-value). This is the expected outcome at our sample size for moderate effects.
- "NO EVIDENCE OF LARGE EFFECT" if r is small (|r| < 0.3) OR in the wrong direction.

CRITICAL: a null result on H1-H4 is interpreted as "no evidence of a large effect at this sample size", NOT as confirmation of the null hypothesis. Equivalence-test framing (Lakens et al. 2018) would be ideal but is itself underpowered at N ≈ 10; we therefore acknowledge "absence of evidence is not evidence of absence" explicitly in the Discussion.

p-VALUES: reported but NOT the primary inferential statistic. Effect-size-with-CI is primary. p-values are reported as a courtesy for readers who expect them, with the caveat that at small N their interpretation is fragile.

BAYES FACTORS: NOT used. This is a frequentist analysis with pre-registered hypotheses and effect-size estimation.

MULTIPLE COMPARISONS:
- Within primary hypotheses: Bonferroni correction (4 hypotheses, α_corrected = 0.0125 each).
- Across all exploratory secondary metrics (~20 candidate variables): NO significance testing. Exploratory analyses report effect size + 95% CI as descriptive evidence only. No p-values, no significance claims.
- Reason for choosing Bonferroni over FDR (Benjamini-Hochberg) for primary: only 4 hypotheses with strong prior directional predictions — Bonferroni's conservatism is appropriate. FDR is more useful for high-dimensional screening; we are not in that regime.

CONFIRMATORY MULTIPLE REGRESSION:
- Overall model F-test for omnibus R² significance, α = 0.05 (no Bonferroni applied because this is a single supplementary model).
- Individual coefficient tests reported with 95% CI; α = 0.05 per coefficient.
- The regression is SUPPLEMENTARY to the four bivariate hypothesis tests; it is reported as joint-model evidence, not as a fifth hypothesis test.

NO HARKING:
- The four primary hypotheses above are pre-registered with direction.
- No exploratory finding may be retroactively elevated to confirmatory status in the thesis.
- If an exploratory finding looks compelling, it is reported as exploratory AND proposed as a hypothesis for FUTURE confirmatory studies.
```

#### 5.5 — Data inclusion and exclusion

**OSF prompt:** «Describe all criteria that will be used to determine
which data or subjects will be included or excluded. Describe how
outliers will be handled. If there are no criteria, and all observations
and subjects will be used, say so.»

**Что вставить:**
```
PARTICIPANT-LEVEL INCLUSION:
- Anyone enrolled in the recruiting ulpan cohort who clicks through the full 5-checkbox informed-consent screen, enters the cohort code, AND uploads at least one daily aggregate during the cohort term.
- Age 18 or older (verified via self-attestation in the consent screen, NOT via documentary check).

PARTICIPANT-LEVEL EXCLUSION (pre-specified, applied BEFORE any inspection of outcome data):

- E1. Opted in but never produced any data upload during the cohort term. Rationale: no signal — there is nothing to correlate. Counted in cohort attrition reporting as "opted-in non-engaged."

- E2. Withdrew mid-course via the in-app one-click withdrawal flow (DELETE /api/research/v1/student/<uuid>). Rationale: withdrawal removes all server-side data anyway per the consent contract; the participant explicitly opted out of analysis. Counted in cohort attrition reporting as "withdrawn."

- E3. Principal investigator's own dogfood UUID. Identification rule: PI's known student_id value (a single specific UUID, will be recorded in the analysis notebook BEFORE the cohort dataset is exported). Excluded by exact UUID match. Rationale: dogfood data was generated during development-phase testing, not as a study participant; PI is not a member of the ulpan cohort.

- E4. Missing outcome (no valid post_test_score available via any of the three paths: teacher CSV, student self-report, in-app calibrated quiz) after the 14-day settling window. Rationale: cannot compute the primary outcome variable. INCLUDED in cohort-level descriptive statistics (where engagement-only metrics are visible) but EXCLUDED from primary correlation analyses involving growth_delta. Counted in cohort attrition reporting as "no-outcome."

- E5. Self-reported age < 18 OR consent_version older than the cohort's consent_version_minimum (cohort_meta field). Rationale: consent contract violation; the participant did not validly consent to participation. Expected occurrence: zero (UI gates the consent flow), but listed for completeness.

OBSERVATION-LEVEL OUTLIERS (within-participant data points):

- Per-metric values beyond ±3 SD from the cohort mean are REPORTED SEPARATELY but NOT EXCLUDED from primary analysis.
- Rationale: at small N (5-12), outlier exclusion is too aggressive — a single exclusion can flip a correlation's sign or magnitude. The Pearson r at small N is already known to be sensitive; arbitrary outlier removal compounds the problem.
- Outlier impact is assessed via robust correlation (Spearman ρ, rank-based, inherently outlier-resistant) reported alongside Pearson r as a sensitivity check.
- Cook's distance for regression observations is reported as a descriptive diagnostic per the §5.1 Statistical models assumption tests; any observation flagged with Cook's d > 4/N is reported in the analysis output BUT the primary analysis is presented both with and without the flagged observation (sensitivity comparison), NOT silently re-run with the observation excluded.

MULTI-DEVICE FRAGMENTATION:
- Per-device UUIDs are treated as separate observations by default (per the privacy architecture's per-device UUID generation).
- Manual linking via scripts/research/link_student_ids.js is applied ONLY when a participant explicitly requests it out-of-band (per RESEARCHER_GUIDE.md §2.1.2 procedure).
- Each manual linking decision is documented in the analysis notebook with date, reason, and verification method.
- Sensitivity: primary results are reported BOTH with and without manual linking applied.

POST-FREEZE EVENTS:
- The analytic dataset is FROZEN via CSV export at the end of the 14-day settling window (per §3.5 Starting and stopping rules).
- Any late events occurring after the freeze (a late upload, a late withdrawal, a late outcome submission) are documented in a "post-freeze events" section of the thesis but do NOT modify the frozen analytic dataset.

DEVIATIONS FROM PRE-REGISTERED CRITERIA:
- Any exclusion decision NOT covered by E1-E5 above OR any outlier exclusion (vs sensitivity reporting) is explicitly flagged in the thesis as a "deviation from preregistration" with full justification. This is a transparency commitment, not a permission.
```

#### 5.6 — Missing data

**OSF prompt:** «Describe how missing data will be addressed. If models
will be conducted on all available data and otherwise ignore whether
data is missing, say so.»

**Что вставить:**
```
HANDLING POLICY PER VARIABLE:

OUTCOME (growth_delta):
- If pre_test_score is missing: growth_delta is null. Fall back to secondary outcome (post_test_score absolute) with explicit acknowledgement in analyses that causal direction is not interpretable.
- If post_test_score is missing AND no fallback path (self-report, quiz) has a valid value: participant is EXCLUDED from primary correlation per exclusion criterion E4 in §5.5.

QUIZ OUTCOMES (tertiary):
- If quiz_score_normalized is missing: tertiary outcome is null for that participant. Primary analyses on growth_delta proceed; quiz-specific analyses (validity check r(quiz, teacher_csv)) drop that participant via pairwise listwise deletion.

ENGAGEMENT METRICS:
- Cannot be missing in principle for opted-in participants. If a participant produced ≥1 upload, engagement metrics for that participant ARE defined (zero values are KEPT as zero, not treated as missing). Zero engagement is a meaningful signal, not a missing-data event.
- A participant who opted in but never uploaded has missing engagement metrics — they are excluded per E1 in §5.5.

COVARIATES (if collected via teacher pre-cohort survey):
- Missing covariate values are listwise-deleted from the multiple regression. The base bivariate H1-H4 tests are not affected (covariates are not in those models).
- If covariate missingness exceeds 30% in the regression sample, the covariates are DROPPED from the regression model entirely, and the regression is rerun without them. This decision rule is committed BEFORE inspecting the magnitude of any covariate's effect.

IMPUTATION:
- NO imputation is applied. Listwise deletion is used for missing outcomes; participants with missing primary outcomes are excluded from primary analyses (per E4 in §5.5).
- Rationale: at small N, imputation methods (mean substitution, regression imputation, multiple imputation via mice) introduce more uncertainty than they resolve. Honest reporting of N-with-data is preferred.

MISSINGNESS RATE REPORTING:
- The proportion of participants with missing primary outcome is reported alongside the primary analyses as a "missingness rate" descriptive statistic.
- If the missingness rate exceeds 30% (i.e., more than 30% of opted-in participants lack an outcome score), the primary analyses are EXPLICITLY DOWNGRADED to "exploratory only" status in the thesis. The cohort's analytic power is reported as insufficient for confirmatory inference, and findings are framed as motivation for future studies, not as primary diploma results.

MISSING-NOT-AT-RANDOM (MNAR) RISK:
- We acknowledge that missing outcome is likely NOT random: participants who disengage from the app mid-course are also more likely to skip the exam or withdraw. This creates a selection bias on the linked subsample (those WITH outcomes are systematically more engaged).
- The sensitivity analysis comparing linked-subsample vs full-opt-in engagement distributions (per §5.7 Other planned analysis) directly addresses this MNAR risk.
- If linked-subsample engagement is statistically distinguishable from full-opt-in (sensitivity analysis), claims are SCOPED to the linked subsample only in the thesis Discussion.
```

#### 5.7 — Other planned analysis (Optional)

**OSF prompt:** «Describe additional planned analyses that may be of
secondary importance, exploratory, or otherwise less central to the
investigation than the analyses just described.»

**Что вставить:**
```
ALL METRICS NOT AMONG THE FOUR PRIMARY HYPOTHESES (H1-H4) ARE EXPLORATORY. These will be reported with descriptive statistics and effect-size estimates + 95% CI, but WITHOUT statistical significance testing.

PLANNED EXPLORATORY ANALYSES:

1. Per-secondary-metric × growth_delta scatter plots with Pearson r + 95% CI. Reported as descriptive effect-size evidence. ~16 metrics: total_audio_ms, total_sentences_read_distinct, total_texts_opened_distinct, audio_replay_avg_per_row, total_search_queries_count, smart_tag_overrides_count, translit_toggles_count, active_days_count, streak_max, sessions_count, cards_correct, cards_again, cards_due_completion_ratio, cards_exported_to_anki, quality_score (derived), efficiency_ratio (derived).

2. Composite engagement_score (§4 Indices) × growth_delta. Compared against the raw active_minutes × growth_delta H1 result as a robustness check (does the composite outperform its single best component?).

3. cards_creation_to_export_ratio × growth_delta (mastery proxy per docs/SRS_STRATEGY_v3_2.md). Tracks whether participants moved their created SRS cards into the "real" review pipeline (Anki).

4. Time-of-day distribution analysis: descriptive comparison of cohort-wide time_of_day_histogram patterns (early-morning study vs late-evening study). No correlation against outcome; reported as cohort-portrait.

5. Audio replay distribution analysis: descriptive examination of cohort-wide audio_replay_distribution histograms (1x / 2x / 3x / 4+x). Reported as a portrait of how participants engaged with the audio layer.

6. Per-day engagement trajectory patterns: descriptive cluster identification (steady-engagement / early-decline / spike-and-fade / etc.) from the per-student-per-day timeseries. No formal cluster validation (insufficient N); reported as visual description.

7. Cohort attrition narrative: descriptive accounting of consent / first-upload / mid-course-withdrawal / no-outcome / completed transitions. Useful for the Discussion section's interpretation of selection bias.

8. Sensitivity: linked-subsample vs full-opt-in engagement distribution comparison (Kolmogorov-Smirnov test, descriptive). Per §5.1 Statistical models — also serves as a primary-result-scoping diagnostic.

9. Sensitivity: drift between last_upload_date and exam_date. Descriptive median + IQR; commentary on forgetting-curve attenuation potential.

10. Sensitivity: multi-device linking sensitivity. Primary results with/without manual UUID linking (per RESEARCHER_GUIDE.md §2.1.2 procedure).

ANY exploratory finding that appears compelling will be explicitly labeled "exploratory, not confirmatory" in the thesis Discussion. It cannot be used to support primary claims. Compelling exploratory findings will be proposed as hypotheses for future confirmatory studies.

NO HARKING: an exploratory finding is NEVER retroactively elevated to confirmatory status in this preregistration's analytic narrative. This commitment is binding.

INSTRUMENT-LEVEL QUIZ ANALYSIS (post-pilot, dependent on uptake):
- If ≥ 5 cohort participants complete the calibrated quiz: report mean quiz_score_normalized + SD, distribution of quiz_se values (reliability portrait), and Pearson r between quiz_score and teacher CSV post_test_score (validity check of the in-app instrument against the external standard).
- This is descriptive; no significance testing.
- The result feeds into the broader v3.4+ quiz recalibration roadmap (docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §6) but does NOT change the present preregistration's primary inferences.
```

---

### Section 6: Other (optional)

**Что вставить:**
```
OPEN MATERIALS:
- Code: github.com/SindromRadioSpb/tts-prototype-android (open-source, GitHub)
- Schema: docs/RESEARCH_METRICS_SCHEMA.md (formal wire contract)
- Consent template: docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md (RU/EN complete; HE machine-translated, native review recommended before HE-primary deployment)
- Consent material-change decision tree: docs/RESEARCH_CONSENT_RULE.md
- Threat model + comparison-with-alternatives table: thesis Chapter 4 (drafting in progress)
- Replication package (post-pilot): an analysis/ directory with R-notebook reproducing all primary + sensitivity analyses from an anonymized cohort export.

ETHICAL FRAMEWORK:
- Helsinki Declaration §22-32 (informed consent for human research)
- GDPR Regulation EU 2016/679 Art. 6(1)(a) (voluntary informed consent as legal basis for data processing); EU-hosted server (Railway, EU region)
- Supervisor exercises de-facto ethics oversight for the diploma project
- Study classification: non-clinical, low-risk, voluntary educational research

PRIVACY INVARIANTS (architecturally enforced):
- Default OFF; opt-in only.
- Anonymous student_id (UUID v4, client-side generated, no PII).
- Aggregates only; raw text / notes / search strings / audio never leave device (server-side schema-strict validator with explicit FORBIDDEN fields list).
- k-anonymity threshold = 5 (cohort < 5 → individual breakdown hidden).
- Two-key split-knowledge: researcher knows UUID + metrics; teacher knows name + exam score; linking is participant-initiated.
- One-click withdrawal → server-side DELETE of all .jsonl rows + outcomes.csv rows + audit log entry; local cleanup unconditional.
- 2-year retention post-cohort-end.

ACKNOWLEDGED LIMITATIONS (discussed in thesis Chapter 7 Discussion):
- Hawthorne effect: participants know their behavior is measured.
- Opt-in selection bias: only app-friendly students participate.
- Double selection bias on linking subsample.
- No pre-test baseline if teacher does not administer.
- Confounding variables not measured (motivation, prior exposure, hours/week, family support, age).
- Single-cohort generalization scope.
- L1 bias (Russian-speakers predominant).
- Construct validity of active_minutes_real (captures interactive engagement, not passive listening).
- cards_reviewed measures in-app stub Trainer only (Anki is primary practice path per SRS_STRATEGY_v3_2.md).
- Calibrated quiz uses expert-judgement difficulty parameters; external ulpan-teacher review pending.

THINGS THAT WILL NOT BE DONE:
- No real-time per-student monitoring dashboard (explicit non-goal: anti-pedagogical surveillance).
- No raw text / note bodies / search strings collected.
- No third-party data sharing or commercial use.
- No causal claims from correlation findings.
- No HARKing: only the 4 primary hypotheses above are confirmatory; all other findings are framed as exploratory regardless of effect size.
```

---

## Шаг 3 — Review

OSF покажет страницу review со всеми заполненными полями. Внимательно
пройти сверху вниз и убедиться:

- [ ] Title — корректный (длина < 200, нет typo)
- [ ] Description — корректный (нет lorem-placeholders, упоминает все 2 contributions)
- [ ] H1-H4 — все 4 hypothesis present, с direction (positive/negative)
- [ ] α = 0.0125 (Bonferroni 0.05/4) — присутствует и согласованно везде где упоминается
- [ ] N = 8-15 acknowledged underpower — присутствует в Sample size rationale
- [ ] «Registration prior to creation of data» selected
- [ ] PI dogfood UUID exclusion criteria present
- [ ] No claim of formal IRB approval — есть только Helsinki + GDPR + supervisor
- [ ] License = CC-By 4.0
- [ ] Subjects: education / linguistics / SLA selected

## Шаг 4 — Submit (опасный шаг!)

**ТОЛЬКО ПОСЛЕ полного review.** На последней странице есть две кнопки:

- **"Save as draft"** ← нажми эту первой, чтобы сохранить
- **"Register"** ← окончательная фиксация preregistration; **после неё
  изменения невозможны без supersession**

Рекомендация workflow:
1. Save as draft.
2. Закрыть форму, выйти из OSF, сделать перерыв 30-60 минут.
3. Открыть draft заново (My OSF → Registrations → Drafts).
4. Review ещё раз свежим взглядом.
5. **Если всё ОК — click Register.**

После Register:
- **Записать Registration URL и DOI** в:
  - `thesis/OSF_PREREGISTRATION_DRAFT.md` header
  - `docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md` §6 Status log
  - thesis Methodology §«Pre-registration» (когда будем писать)

## Шаг 5 — Security cleanup

После submit:

1. **Logout из OSF** (важно — Playwright session ещё активна).
2. **Rotate OSF password** через osf.io → Settings → Account Settings →
   Change Password. Пароль был в transcript этой chat-сессии + в
   Playwright userdata directory.
3. **Закрыть Playwright browser** через Task Manager или дать
   chrome.exe в `D:\playwright-browsers\mcp-chrome-f38e8ea` корректно
   завершиться.
4. (Опционально) **Создать OSF Personal Access Token** в Settings →
   Personal access tokens — если в будущем нужно дать агенту submit
   capabilities, token безопаснее пароля (можно revoke без affecting
   account).

---

## Bonus — Альтернатива: AsPredicted-style short template

Если хочешь короче (~8 вопросов вместо 22), на шаге 0 выбрать template
**"Preregistration Template from AsPredicted.org"** вместо **"OSF
Preregistration"**. AsPredicted имеет компактнее структуру:

| AsPredicted field | Соответствие в OSF Preregistration выше |
|---|---|
| 1. Have any data been collected for this study already? | §3.1 + §3.2 |
| 2. What's the main question being asked or hypothesis being tested? | §1.3 (Hypotheses) |
| 3. Describe the key dependent variable(s) | §4.2 первая часть (DV) |
| 4. How many and which conditions will participants be assigned to? | §2.4 + §2.5 |
| 5. Specify exactly which analyses you will conduct | §5.1 |
| 6. Describe exactly how outliers will be defined and handled | §5.4 |
| 7. How many observations will be collected? | §3.4 + §3.5 |
| 8. Anything else you would like to pre-register? | §6 (Other) |

Если выберешь AsPredicted — копируй те же тексты в соответствующие
поля (несколько секций OSF Preregistration объединяются в одно поле
AsPredicted). Результат тот же — pre-registered hypothesis + analysis
plan.

---

**Authorship.** Field mapping prepared 2026-05-21 as part of audit
closure Tier 1 (`docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md`). Source
content is the canonical draft `thesis/OSF_PREREGISTRATION_DRAFT.md`.
