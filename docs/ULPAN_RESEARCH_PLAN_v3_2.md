# Research-grade Analytics + Ulpan Research-mode — v3.2.0 Direction 11

> **Цель.** Не «добавим аналитику», а **сделать приложение научно-валидным инструментом измерения** — закрыть существующий долг event-emission, перевести time-spent на честные heartbeat-based metrics, и построить privacy-preserving opt-in research-mode для diploma project в иврит-ульпане.
>
> **Принцип** (формулировка пользователя): *«Direction 11 нужно делать не как аналитику, а как научно пригодный, этически защищённый и масштабируемый research-mode. Тогда приложение становится не просто учебным инструментом, а профессиональной EdTech-платформой для изучения иврита и проведения образовательных экспериментов.»*
>
> **Baseline.** v3.1.0 (premium polish complete). Direction 9 + Direction 10 параллельно строятся в v3.2.
>
> **Что НЕ входит в этот Direction.** Calibrated in-app diagnostic quiz (deferred → v3.3). Multi-cohort comparative dashboard (deferred → v3.3). Federated research platform (deferred → v4+). RCT methodology (out of scope для diploma scale, single-group correlational design).

---

## 1. Decisions log (утверждено пользователем 2026-05-10)

| # | Решение | Обоснование |
|---|---------|-------------|
| D1 | **Thesis theme:** «Анализ корреляции цифровой учебной активности и результатов в иврит-ульпане: проектирование privacy-preserving opt-in research-mode в language-learning приложении». | Empirical result + methodological contribution = две публикуемые компоненты в одной diploma'е. Privacy-preserving research-mode design — open-source artifact, переиспользуемый другими исследователями. |
| D2 | **k-anonymity threshold = 5.** Если cohort < 5 — individual breakdown и персональные сравнения недоступны; только общие агрегаты без детализации. | Ulpan-группы часто 8–15 students; k=5 даёт защиту от re-identification без жёсткого ограничения utility. |
| D3 | **Outcome capture для v3.2:** student self-report + teacher CSV upload. Calibrated in-app diagnostic quiz → v3.3. | Diploma scale — простые механизмы достаточны; quiz-calibration требует отдельной research validation. |
| D4 | **Server-side endpoint allowance:** namespace `/api/research/v1/*` разрешён как архитектурное исключение для Direction 11. **Только opt-in research aggregates** — никакого raw text, note bodies, audio, search strings, или персональных данных. | Direction 10 D1 был о sharing endpoints (peer-to-peer). Research endpoint — отдельный архитектурный класс: opt-in scientific consent flow, aggregate-only. Не нарушает offline-first invariant. |
| D5 | **Total v3.2 scope = Mega-v3.2** (все три directions: 9 + 10 + 11 в одном release). | Cohesive release; trade-off — 6–8 рабочих недель effort. Trade-off accepted because Directions 9 + 10 + 11 enable each other (10 prerequisite for 11; 9 + 11.0 share analytics infrastructure). |
| D6 | **Diploma timeline** — точный deadline пока не фиксирован. Plan ships когда готов. | Без deadline pressure — фокус на качество и научную валидность. |
| D7 | **Phase 11.0 + 11.1 (event emission + time-spent v2) выделены как mini-direction** и шипятся независимо от Direction 11 main scope. Полезны для всех users (Activity Heatmap accuracy, Dashboard quality), не только для research mode. | Decoupling foundation from research-mode позволяет shipить heatmap improvement раньше. Research mode (11.2–11.7) встаёт сверху на стабильную foundation. |

---

## 2. Стратегическое позиционирование

### Что отличает Direction 11 от «обычной аналитики»

| Обычная аналитика | LinguistPro Research-mode |
|-------------------|---------------------------|
| Default ON, opt-out | **Default OFF, opt-in** |
| User identity tracked | **Anonymous student_id, no PII** |
| Raw events uploaded | **Aggregated daily metrics only** |
| Vendor-controlled retention | **User one-click withdrawal** |
| Analytics for product team | **Research dashboard для diploma + ethics-defensible** |
| Goals: conversion, retention | **Goals: научная валидность измерений** |

### Конкурентное позиционирование

| Платформа | Privacy stance | Research-grade metrics | Ethics-defensible | Open-source |
|-----------|----------------|:----------------------:|:-----------------:|:-----------:|
| Anki | Local-first, no telemetry | ✗ (no ulpan metrics) | N/A | ✓ |
| Quizlet / Memrise | Cloud, telemetry | partial (engagement) | ✗ | ✗ |
| Duolingo | Cloud, heavy telemetry | proprietary | ✗ (closed) | ✗ |
| LingQ | Cloud, telemetry | partial | ✗ | ✗ |
| **LinguistPro v3.2** | **Offline-first, opt-in research** | **Research-grade (educational analytics framework)** | **✓ IRB-style consent** | **✓** |

### Ключевое сообщение

*«LinguistPro — единственная Hebrew-learning платформа, в которой исследователи могут проводить ethically-defensible studies без compromise privacy студентов. Opt-in research-mode совместим с offline-first архитектурой; все agregaty воспроизводимы из локальной OPFS пользователя; one-click withdrawal — basic human right.»*

---

## 3. Метрики — шестислойная архитектура

Educational analytics framework (Bloom-style engagement taxonomy + learning analytics literature). Метрики собираются в **6 слоях**, корреляции **между слоями** — суть scientific result.

### Layer 1 — Engagement (показатели появления)
- `sessions_count` per week
- `active_days_count` per week (retention proxy)
- `active_minutes_real` per week (heartbeat-based, см. Phase 11.1)
- Time-of-day distribution (24-bucket histogram)
- Streak (consecutive days)

### Layer 2 — Volume (объём exposure)
- `texts_opened_distinct` / `texts_opened_total`
- `sentences_read_distinct` / `sentences_read_total`
- `audio_play_ms_total` (real playback duration, не plays × 4000)
- `words_encountered_total` / `words_unique`
- ~~`words_mastered` (final-stage SRS cards)~~ — **deferred (см. §3.SRS-scope-note)**
- ~~`cards_reviewed`~~ — **deferred to v3.4+ Anki Connect sync (см. §3.SRS-scope-note)**
- `cards_added_to_srs` (proactive learner — card created via `🎴 Сделать карточкой`)
- `cards_exported_to_anki` (mastery proxy — card moved into the "real" review pipeline)

#### 3.SRS-scope-note — retention metric deferred

> 2026-05-12 scope revision (see `docs/SRS_STRATEGY_v3_2.md`). LinguistPro is the *creation + linkage* layer for SRS cards; Anki is the *recommended review* layer. The in-app Trainer is a stub. Therefore in-app `srs_review` events are NOT a reliable retention signal for the diploma research — most cards land in Anki where we don't see reviews.
>
> **Interim retention proxy for v3.2 cohort study:** `cards_exported_to_anki / cards_added_to_srs` per active week. Tracks whether the user actually moves cards into a real review pipeline (a stronger signal than just creating them).
>
> **Full retention metric** (review-grade outcomes from Anki) is gated on **v3.4+ Anki Connect sync** — bidirectional sync that lands review results back in `srs_reviews`. Until then, the diploma narrative frames retention validation as future work and leans on engagement + mastery (creation → export ratio) proxies. User-accepted framing 2026-05-12.
- `notes_created` / `notes_edited`
- `search_queries_count` (без content!)

### Layer 3 — Quality (продуктивность времени)
- `srs_error_rate` (cards_again / cards_reviewed)
- `cards_due_completion_ratio` (discipline signal)
- `notes_per_text_ratio` (engagement signal)
- `smart_tag_overrides_count` (self-aware learners)

### Layer 4 — Hebrew-specific
- `niqqud_marked_time_ratio` (time on niqqud-marked vs niqqud-free, proxy для reading independence)
- `translit_toggles_count`
- `audio_replay_distribution` (histogram: 1 / 2 / 3 / 4+ replays per row)
- `binyan_coverage` (% of 7 binyanim user has notes about) — *if Direction 9.4 ships morphology layer*
- `root_encounter_diversity` (unique roots encountered)

### Layer 5 — Outcome (зависимая переменная)
- `pre_test_score` (baseline, ulpan diagnostic)
- `post_test_score` (final exam)
- `confidence_self_report` (Likert 1–5, optional)
- `continuation_flag` (used after course end?)

### Layer 6 — Cohort-level
- Distribution per metric (mean / std / median / quartiles)
- Cluster analysis (high-engager / low-engager / high-output-low-time / etc.)
- Time-to-mastery distribution per text
- Group completion rate per curriculum text

**Иерархия:** Layer 1 → Layer 2 → Layer 3 → Layer 5 (outcome). Корреляции между уровнями — это scientific result.

---

## 4. Privacy architecture — opt-in research mode

### Принципы (non-negotiable)

1. **Default OFF.** Research mode не активен у новых users. Должно быть явное «Принять участие в исследовании» с full disclosure.
2. **Informed consent.** IRB-style template (см. `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`).
3. **Anonymity.** Никакого user identity. Anonymous `student_id` (UUID, generated client-side).
4. **Aggregation by default.** Individual events **никогда** не покидают устройство. Server получает только daily aggregates.
5. **Right to withdraw.** One-click. Удаляет server data + opts out. Без вопросов.
6. **k-anonymity threshold = 5** (D2). Cohort < 5 → individual breakdown недоступен в dashboard.
7. **No raw text on server** (D4). Никакого Hebrew, никаких заметок, никаких queries — только counters + durations.
8. **Transparency.** В app есть «What we collected from you» dashboard — student видит exactly то, что было uploaded.

### Two-key design (privacy + research utility)

**Проблема:** для diploma research нужна корреляция `app metrics × exam score`. Но мы не хотим знать, кто такой student.

**Решение — split knowledge:**
- **Student знает** свой `student_id` UUID + cohort code (in-app).
- **Teacher знает** student name + exam score (на бумаге, как обычно).
- **Researcher видит** anonymous `student_id` + aggregated metrics + cohort code (в dashboard'е).
- **Корреляция возможна только если student сам share'нул свой student_id с teacher** (e.g. подписав на бумаге «мой UUID = abc123» при сдаче экзамена).

Это **opt-in для linking**: student может opt-in в research-mode (анонимные метрики) **без** дальнейшего sharing своего ID. Тогда researcher видит cohort-level patterns, но individual-level outcome correlation недоступен. Если student хочет contribute fully — sharing ID при экзамене.

### Aggregation upload format

См. `docs/RESEARCH_METRICS_SCHEMA.md` для полного schema'а.

### Что **НЕ** uploaded (D4 enforced)
- Raw Hebrew text content
- Note bodies / titles
- Audio
- Specific text titles (только counts!)
- Specific search query strings (только count)
- Timestamps below day-level
- Username, email, IP, device fingerprint
- Geolocation
- Browser fingerprint outside `app_version` + `platform`

### Server-side architecture (минимум для v3.2)

Один endpoint family — `/api/research/v1/*`:

- `POST /api/research/v1/metrics` — receives daily aggregates, stores in append-log per cohort.
- `GET /api/research/v1/cohort/:code/aggregates` — researcher dashboard read (auth via researcher token).
- `DELETE /api/research/v1/student/:student_id` — withdrawal (auth via student token).

Storage: file-system append-log per cohort (`research-data/<cohort_code>/<date>.jsonl`). No database. Retention: 2 years post-cohort-end (configurable in privacy policy).

---

## 5. Scaling architecture (за пределы diploma)

Direction 11 архитектура **должна оставлять место** для multi-tenant эволюции **без rewrite**.

### Stage 1 — Single user (v3.0–v3.1, current)
Offline-first, OPFS, no server stateful storage. Privacy total.

### Stage 2 — Single ulpan group (**v3.2 Direction 11 — текущий scope**)
Opt-in research mode. Single cohort. Server-side aggregates per cohort. Privacy preserved.

### Stage 3 — Multi-cohort (v3.3+, ~0.5 work item incremental)
Multiple ulpans simultaneously. Cohort isolation (per-cohort append-log already designed for this). Per-teacher dashboards. Comparative analysis between cohorts (e.g. «cohort A: traditional + app vs cohort B: traditional only»).

### Stage 4 — Institutional (v4.0)
Educational institution adopts platform. Multi-class structure (classes within institution). Curriculum builder. Soft authentication (institution email, не personal account, не нарушает privacy promise).

### Stage 5 — Public research platform (v5.0)
Open: any researcher может run a Hebrew learning study. Federated cohort design. Public anonymized dataset (with consent) для replication studies.

**Этот путь не требует rewrite на каждом этапе** — потому что fundamental architecture уже multi-cohort-ready (`cohort_code` в schema).

### Соответствие offline-first invariant

На всех этапах:
- User data stays on user's device.
- Only aggregated metrics upload — opt-in only.
- Withdrawal one-click.
- Никакого server-side database с raw events.

---

## 6. Direction 11A (mini-direction) — Analytics Foundation

> **Phases 11.0 + 11.1 выделены как mini-direction (D7).** Шипится независимо от Direction 11B research-mode. Полезно всем users — улучшает Activity Heatmap accuracy + закрывает CONTRACTS_ANALYTICS drift.

### Phase 11.0 — Event emission gap closure

**Problem:** `docs/CONTRACTS_ANALYTICS.md` documents 7 event types. Tier 0 audit подтвердил: **only `row_tts` is actually emitted** (Tier 0 audit § P4 partial). Это contract-vs-impl drift, который должен быть закрыт регardless of research mode.

**Scope — emit these event types** (all into existing `events` table, all local-only):

| Event type | Trigger | Payload (anonymized — no raw content) |
|------------|---------|---------------------------------------|
| `text_open` | Library card opened in IDE / Classic | `text_id`, `source` (library/search/smart-chip/share-import) |
| `text_close` | Closed / navigated away | `text_id`, `duration_ms` (active session on this text) |
| `play_audio` | Row audio playback start | `text_id`, `sentence_id`, `duration_ms` (real playback time), `replay_count` (>1 if replay) |
| `save_note` | Note saved | `text_id`, `sentence_id`, `note_kind` (free/word_study/etc), `body_length` (chars, no content) |
| `note_edit` | Note edited (each save) | `note_id` hash, `chars_added`, `chars_removed` |
| `srs_review` | Card graded **in the in-app stub Trainer** (see `docs/SRS_STRATEGY_v3_2.md`) | `card_id` hash, `grade` (again/hard/good/easy), `interval_before_days`, `interval_after_days` |
| `srs_session_started` | Stub Trainer opened | `session_id` |
| `srs_session_finished` | Stub Trainer closed | `session_id`, `cards_reviewed`, `duration_ms` |
| `srs_card_exported_to_anki` | `btnAnki` export with ≥1 note-card | `payload_json.{cards_total, cards_note_kind, cards_sentence_kind}` |
| `search_query` | Search submitted | `query_length` (no text!), `result_count` |
| `card_added_to_srs` | Note flagged for review (Direction 9 M6 integration) | `note_id` hash |
| `smart_tag_override` | Manual smart-tag set | `text_id`, `tag` (struggling/mastered) |
| `translit_toggle` | Translit column toggled | (no payload — just count) |

**Effort:** 2–3 дня. Все события local-only в OPFS `events` table.

**Acceptance:**
- [ ] All 12 event types emit with correct anonymized payloads.
- [ ] `events` table grows linearly with usage; no hot-spot indexing issues.
- [ ] CONTRACTS_ANALYTICS doc updated to reflect actual emission state.

### Phase 11.1 — Time-spent v2

**Problem:** Existing `time_ms = plays × 4000` (estimated). Непригодно для research'а — корреляция «exam score × estimated minutes» = noise, не signal.

**Solution — heartbeat-based:**

- `session_start` — page load + active focus.
- `session_heartbeat` — каждые 30s пока active (focus + interaction в последние 60s).
- `session_end` — page blur + 30s timeout, или explicit close.
- **Idle detection** — 5 min без interaction → session pauses (not counted).
- **Tab visibility tracking** — в background → not counted.
- **Active interaction signals** — keyboard, click, audio play, scroll.

`active_minutes_real` = sum heartbeats × 30s, ограничено max 60 min per session.

**Browser APIs:**
- `document.visibilityState` (Page Visibility API)
- `window.addEventListener("focus" / "blur")`
- Throttled interaction handlers (keydown / click / scroll / pointermove)

**Migration of existing `getAnalytics`:**
- `time_ms` field continues to exist для backwards-compat.
- New field `active_ms_real` next to it.
- Activity Heatmap в Dashboard использует `active_ms_real` если доступно, fallback на `time_ms`.

**Effort:** 3–4 дня. Browser API quirks (особенно iOS Safari) могут добавить дни.

**Acceptance:**
- [ ] `active_minutes_real` за неделю в Activity Heatmap accurate (validated against manual stopwatch test, ±10%).
- [ ] Idle detection корректен (5 min idle → not counted).
- [ ] Background tab → not counted.
- [ ] iOS Safari + Android Chrome + Desktop Chrome — все работают.

### Direction 11A ship strategy

**Standalone shippable** — может уйти как minor release раньше Direction 11B.

**Dependencies:** None. Только существующие OPFS + events table.

**Total Direction 11A:** 5–7 дней.

---

## 7. Direction 11B — Research Mode

> **Главная Direction 11.** Встаёт сверху на 11A foundation.

### Phase 11.2 — Research mode opt-in + consent

**Scope:**
- Settings panel section «📊 Research mode» с consent flow.
- Anonymous `student_id` generation (UUID v4, generated client-side, stored в `localStorage.researchStudentId_v1`).
- Cohort join via 4–8-char invitation code (teacher distributes).
- IRB-style consent screen с full disclosure (см. § Phase 11.7 ethics template).
- In-app «What we collected from you» dashboard — список последних 7 daily uploads, scrollable.
- **Withdrawal flow:** one-click → confirms → deletes server data via `DELETE /api/research/v1/student/:student_id` → opts out + clears local research state.

**Storage:**
- `localStorage.researchEnabled_v1` — boolean.
- `localStorage.researchStudentId_v1` — UUID.
- `localStorage.researchCohortCode_v1` — joined cohort.
- `localStorage.researchUploadLog_v1` — last 30 uploads (for transparency view).
- `localStorage.researchConsentVersion_v1` — version of consent agreed (for re-consent on consent doc updates).

**Effort:** 2 дня.

**Acceptance:**
- [ ] Default OFF; activation requires explicit consent click.
- [ ] Consent screen lists exactly what's collected per § 4.
- [ ] `student_id` UUID never linked to any PII.
- [ ] Withdrawal flow tested manually — server data удаляется, local state cleared.
- [ ] Re-consent prompt при изменении consent version.

### Phase 11.3 — Aggregation pipeline

**Scope:**
- Daily aggregator (web worker / setInterval): scans `events` table since last upload → computes daily aggregates per § 3 metrics → schedules upload.
- Upload queue: retry on network failure (exponential backoff, max 3 attempts), persist queue в OPFS for survival across page reloads.
- **Idempotency:** server-side dedupes by `(student_id, since_ts, upload_ts)` — re-uploads tolerated.

**Effort:** 2 дня.

**Acceptance:**
- [ ] Aggregator runs at most 1× per day per student (debounced).
- [ ] Network failures don't lose data — retry queue persists.
- [ ] Aggregator output identical to manual SQL queries on `events` (validation test).

### Phase 11.4 — Server-side ingestion (D4 architectural exception)

**Scope — new endpoint family `/api/research/v1/*`:**

- `POST /api/research/v1/metrics`
  - Body: aggregation upload format (см. `RESEARCH_METRICS_SCHEMA.md`)
  - Validation: schema-strict (rejects unknown fields, ensures NO raw text leaked).
  - Storage: append to `research-data/<cohort_code>/<YYYY-MM-DD>.jsonl`.
  - Auth: cohort_code присутствует и valid (no per-student auth — student_id is the auth token).
  - Rate limit: 10/day/student (prevents abuse).

- `GET /api/research/v1/cohort/:code/aggregates`
  - Auth: researcher token (Bearer header). Token generated locally via `scripts/research/generate_token.js`, configured в env.
  - Returns: cohort aggregates + per-student-id breakdown (only if cohort_size ≥ k=5 per D2).
  - Read-only.

- `DELETE /api/research/v1/student/:student_id`
  - Auth: student знает свой UUID — UUID is the auth token (since student_id is anonymous, no PII to compromise).
  - Effect: scans all cohort logs, removes lines matching student_id, audit-logs deletion timestamp.

**Server-side privacy enforcement:**
- Schema validation ensures no raw text fields slip through.
- Logging: server logs выщрабатывает payload (logs only `student_id` + `cohort_code` + `upload_ts` + total bytes).

**Storage layout:**
```
research-data/
  <cohort_code>/
    2026-05-10.jsonl
    2026-05-11.jsonl
    cohort_meta.json    # { created_at, k_anonymity_threshold: 5, retention_until }
```

**Retention policy:** 2 years post-cohort-end. Configurable per cohort in `cohort_meta.json`.

**Effort:** 2 дня.

**Acceptance:**
- [ ] POST endpoint accepts valid payload, rejects invalid (schema-strict).
- [ ] DELETE endpoint successfully removes all data for given student_id.
- [ ] No PII in server logs.
- [ ] Rate limiter functional.
- [ ] Researcher token auth functional.

### Phase 11.5 — Teacher / researcher dashboard `/teacher.html`

**Scope:**
- Static HTML page at `/teacher.html` (separate from main app).
- Login: cohort code + researcher token (paste).
- **Cohort overview:**
  - Header: cohort code, total students opted-in, k-anonymity status.
  - Engagement timeline (active_minutes per day, line chart).
  - Volume distributions (histograms: cards_reviewed / notes_created / audio_play_ms).
  - Top-engaging texts (если text_id collected).
  - **Per-student breakdown** (only if cohort_size ≥ k=5):
    - Sortable table (columns per § 8 analysis schema).
    - Drill-down on student_id (если individual analysis enabled by student linking).
- **Outcome capture:**
  - Manual entry: per-student `student_id` → `exam_score` mapping.
  - CSV upload: paste/upload CSV `student_id,exam_score`.
- **Correlation analysis:**
  - Scatter plot: any metric × exam_score.
  - Pearson r computed per pair.
  - Multiple regression (basic, in-browser via simple JS — no R/Python).
- **Export to CSV** для offline analysis (R / SPSS / Python).

**Effort:** 3–4 дня (dashboard UI with charts is the biggest item).

**Acceptance:**
- [ ] Dashboard loads cohort aggregates given valid cohort_code + researcher token.
- [ ] k-anonymity enforced: per-student breakdown hidden when cohort < 5.
- [ ] Outcome entry persists in cohort meta.
- [ ] Pearson r computed correctly (validated against R/Python).
- [ ] CSV export schema matches § 8.

### Phase 11.6 — Outcome capture (D3)

**Scope:**

#### 11.6.1 Student self-report
- In-app prompt at end-of-course (or manually triggered): «Введите ваш итоговый балл (опционально)».
- Field added to next research-mode upload as `outcome_score`.
- Stored in cohort logs.

#### 11.6.2 Teacher CSV upload
- Teacher dashboard accepts CSV: `student_id, exam_score, [optional: pre_test_score, post_test_score]`.
- Validated server-side (numeric exam_score, valid student_id format).
- Stored in `research-data/<cohort_code>/outcomes.csv`.
- Joined with aggregates at dashboard render time.

**Effort:** 1–2 дня.

**Acceptance:**
- [ ] Self-report flow tested.
- [ ] CSV upload tested with valid + malformed inputs.
- [ ] Outcomes correctly joined with aggregates in dashboard.

### Phase 11.7 — Documentation + ethics

**Scope:**
- `docs/RESEARCH_METRICS_SCHEMA.md` (separate doc) — formal data schema spec.
- `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` (separate doc) — IRB-style consent form (RU primary, EN translation, HE pending native review).
- `docs/PRIVACY.md` — extended section on research mode.
- `docs/CONTRACTS_ANALYTICS.md` — updated to reflect Phase 11.0 actual emission state + Phase 11.1 v2 timing.
- Researcher quickstart: `docs/RESEARCHER_GUIDE.md` — how to set up cohort, distribute code, analyze results.

**Effort:** 1–2 дня.

**Acceptance:**
- [ ] All docs created and cross-linked.
- [ ] Consent template reviewed (RU complete; EN translated; HE flagged for native review before deployment).

---

## 8. Pre-prepared analysis schema (recommendation b)

**Каждый CSV export из dashboard содержит фиксированную схему, готовую для статистического анализа:**

### Primary table — per-student aggregated

| Column | Type | Description |
|--------|------|-------------|
| `student_id` | UUID | Anonymous identifier |
| `cohort_code` | string | Cohort joined |
| `enrollment_date` | ISO date | First research-mode upload |
| `withdrawal_date` | ISO date \| null | Withdrawal date if applicable |
| `total_active_minutes` | int | Sum of `active_minutes_real` over cohort lifespan |
| `total_audio_ms` | int | Sum of `audio_play_ms_total` |
| `total_cards_reviewed` | int | Cumulative |
| `total_cards_correct` | int | Sum of grade ∈ {good, easy} |
| `total_cards_again` | int | Sum of grade = again |
| `srs_error_rate` | float | `cards_again / cards_reviewed` |
| `total_notes_created` | int | Cumulative |
| `total_notes_edited` | int | Cumulative |
| `total_search_queries` | int | Cumulative |
| `total_smart_tag_overrides` | int | Cumulative |
| `total_texts_opened_distinct` | int | Cumulative distinct |
| `total_sentences_read_distinct` | int | Cumulative distinct |
| `audio_replay_avg_per_row` | float | Mean replays per row |
| `active_days_count` | int | Days with ≥ 1 session |
| `streak_max` | int | Longest consecutive-day streak |
| **Outcome columns:** | | |
| `pre_test_score` | float \| null | Baseline (from teacher CSV upload) |
| `post_test_score` | float \| null | Final (from teacher CSV upload OR self-report) |
| `confidence_self_report` | int \| null | 1–5 Likert (from self-report) |
| `continuation_flag` | boolean \| null | Continued using app post-course |

### Derived metrics (computed from primary)

| Column | Formula | Purpose |
|--------|---------|---------|
| `engagement_score` | `0.4 × normalize(total_active_minutes) + 0.4 × normalize(total_cards_reviewed) + 0.2 × normalize(total_notes_created)` | Composite engagement index |
| `quality_score` | `1 - srs_error_rate` | Higher = better recall |
| `efficiency_ratio` | `total_cards_correct / total_active_minutes` | Cards mastered per minute |
| `growth_delta` | `post_test_score - pre_test_score` | Pre→post improvement |
| `engagement_consistency` | `active_days_count / cohort_total_days` | Discipline measure |

### Time-series table (separate CSV) — per-student per-day

| Column | Type |
|--------|------|
| `student_id` | UUID |
| `date` | ISO date |
| `active_minutes` | int |
| `audio_ms` | int |
| `cards_reviewed` | int |
| `notes_created` | int |
| `sessions_count` | int |

Это позволяет researcher'у в R / Python сразу запускать `ggplot2` / `seaborn` визуализации без data wrangling.

---

## 9. Research readiness checklist (recommendation a)

**Перед deployment в реальной ulpan group, ВСЕ checkboxes должны быть `[x]`.** Иначе — abort, не запускать.

### Privacy & consent
- [ ] Consent screen ready in RU (primary).
- [ ] Consent screen ready in HE (native-reviewed).
- [ ] Consent screen ready in EN.
- [ ] Privacy policy (`docs/PRIVACY.md`) updated с new section «Research mode».
- [ ] Withdrawal works (manually tested DELETE + UI flow).
- [ ] «What we collected from you» dashboard работает.
- [ ] Re-consent prompt fires on consent version change.

### Data integrity
- [ ] Raw text не уходит на сервер (manual inspection of payloads + grep for Hebrew chars in `research-data/`).
- [ ] Notes не уходят на сервер (only counts + lengths).
- [ ] Search query strings не уходят (only `query_length` + `result_count`).
- [ ] Audio bytes не уходят (only `play_ms` durations).
- [ ] Daily aggregates корректны (validated against manual SQL queries on `events`).
- [ ] No PII in server logs (grep audit).

### Operational
- [ ] Teacher CSV upload работает.
- [ ] Export CSV работает (download + open in Excel/Sheets/R).
- [ ] k-anonymity enforced (verified by creating cohort with 4 students → individual breakdown hidden).
- [ ] DELETE withdrawal test пройден end-to-end.
- [ ] Manual test на 2–3 fake students пройден (через seed script).
- [ ] Researcher token auth работает.
- [ ] Cohort code distribution mechanism готов (teacher хочет distribute via QR code? printed handout? WhatsApp? — decide).

### Documentation
- [ ] `RESEARCH_METRICS_SCHEMA.md` — complete.
- [ ] `RESEARCH_ETHICS_CONSENT_TEMPLATE.md` — complete (3 locales).
- [ ] `RESEARCHER_GUIDE.md` — complete with step-by-step setup.
- [ ] Thesis methodology section drafted.

### Pre-deployment (after checklist green)
- [ ] Pilot run with 2–3 friendly users (not real ulpan students) — find UX bugs.
- [ ] After pilot — review 7 days of data, validate dashboards.
- [ ] After validation — deploy to real ulpan cohort.

---

## 10. Fake cohort seed script (recommendation c)

**Deliverable:** `scripts/seed_research_fake_cohort.js`

**Spec:**
```
Generate a mock cohort for dashboard development + testing without real ulpan deployment.

Output: writes to research-data/<test_cohort_code>/ matching production layout.

Configuration:
  - 12 fake students
  - 14 days of activity per student
  - Synthetic exam scores (correlated with engagement, with noise)
  - 3 engagement groups:
    - "high-engager" (4 students): 60+ min/day, 30+ cards/day, exam 85+
    - "medium-engager" (5 students): 30 min/day, 15 cards/day, exam 70-85
    - "low-engager" (3 students): 10 min/day, 5 cards/day, exam 50-70
  - 1 withdrawal case (one student deleted mid-cohort, day 7)
  - Realistic noise on metrics (random ±15%)
  - Audio replay distribution per § 3 Layer 4
```

**Use cases:**
- Development of teacher dashboard charts (validate handling of distribution).
- k-anonymity testing (try cohort_size 4 vs 5).
- CSV export schema validation.
- Pre-flight before real deployment.

**Effort:** 0.5 дня (added to Phase 11.5 deliverables).

**Acceptance:**
- [ ] Script generates exactly 12 students × 14 days of data.
- [ ] All 3 engagement groups represented.
- [ ] 1 withdrawal case present (verify DELETE flow tested).
- [ ] Synthetic correlation between engagement and exam_score visible (Pearson r > 0.6 after aggregation).

---

## 11. Phasing & total effort

### Direction 11A (Mini-direction — Analytics Foundation)

| Phase | Scope | Effort | Risk |
|-------|-------|-------:|------|
| 11.0 | Event emission gap closure (12 event types) | 2–3 дня | Low |
| 11.1 | Time-spent v2 (heartbeat + idle + visibility tracking) | 3–4 дня | Medium (browser API quirks) |
| **Total 11A** | | **5–7 дней** | |

### Direction 11B (Research Mode)

| Phase | Scope | Effort | Risk |
|-------|-------|-------:|------|
| 11.2 | Opt-in consent + student_id + cohort join + transparency dashboard + withdrawal | 2 дня | Low |
| 11.3 | Aggregation pipeline (daily aggregator + upload queue + retry) | 2 дня | Low–medium |
| 11.4 | Server endpoint family `/api/research/v1/*` (POST + GET + DELETE + storage layout + retention) | 2 дня | Medium (privacy review) |
| 11.5 | Teacher dashboard `/teacher.html` (cohort overview + per-student + outcome capture + correlation analysis + CSV export) + fake cohort seed script | 3–4 дня | Low (charts complexity) |
| 11.6 | Outcome capture (self-report + teacher CSV upload + correlation join) | 1–2 дня | Low |
| 11.7 | Documentation (3 docs: schema, ethics, researcher guide) + privacy.md update + CONTRACTS_ANALYTICS update | 1–2 дня | Low |
| **Total 11B** | | **11–14 дней** | |

### Total Direction 11 (11A + 11B): **16–21 дней** (~3–4 рабочих недели)

### Total v3.2.0 (D5: mega-release)

| Direction | Effort |
|-----------|-------:|
| 9 — Premium Notes | 13–17 дней |
| 10 — Text-card system | 7–8.5 дней |
| 11A — Analytics Foundation | 5–7 дней |
| 11B — Research Mode | 11–14 дней |
| **Total v3.2.0** | **36–46.5 дней (~7–9 рабочих недель)** |

> ⚠ Большой scope. Trade-off accepted (D5) potому что cohesive: Direction 10 prerequisite для 11; Direction 9 + 11A share analytics infrastructure (note save events, etc.); все три directions образуют premium EdTech-платформу.

---

## 12. Cross-direction interactions

### С Direction 9 (Premium Notes)
- Phase 11.0 emit `save_note`, `note_edit`, `card_added_to_srs` events — **closing existing CONTRACTS_ANALYTICS gap** одновременно с notes redesign.
- Direction 9 M6 (note → SRS micro-card) → emits `card_added_to_srs` (handled in 11.0).
- Note metrics в research-mode aggregates: `notes_created`, `notes_edited` (counts only, no body).

### С Direction 10 (Text-card system)
- **Direction 10 является prerequisite для Direction 11 deployment.** Без Mode B sharing — каждый студент paste'ит свой текст → разные results, разное аудио → no scientific control.
- Phase 11.0 emit `text_open` event from text-card import path (`source: 'share-import'`).

### С Direction 7 (Performance / PWA, v3.1.0)
- Service Worker уже precaches research mode endpoints? **No** — `/api/research/v1/*` использует network-only strategy (см. Direction 7 Phase C). Это правильно — research data не должна кэшироваться.

---

## 13. Out of scope (явно не в этом Direction)

- **Calibrated in-app diagnostic quiz** (D3) — deferred → v3.3.
- **Multi-cohort comparative dashboard** — deferred → v3.3.
- **Federated research platform** (Stage 5) — deferred → v4+.
- **RCT methodology** (control vs experimental groups) — out of scope для diploma scale; single-group correlational design.
- **Encrypted-at-rest server storage** — out of scope для v3.2; server data already privacy-minimal.
- **Real-time per-student monitoring dashboard** — anti-pedagogical (surveillance signal), explicit non-goal.
- **Auto-grading / AI-feedback** — out of scope.
- **Cross-cohort student transfer** — out of scope (each cohort isolated).

---

## 14. Open questions — resolution log

1. **Cohort code distribution mechanism** — ✅ **resolved 2026-05-13.** Decision: teacher chooses channel (WhatsApp / printed handout / QR-code / email). Trade-off table documented in `docs/RESEARCHER_GUIDE.md` §3.3. Cohort code is a group identifier (not a secret); leakage doesn't compromise privacy because participation still requires opt-in consent click.
2. **Re-consent on consent version change** — ⏳ **deferred to ad-hoc.** Decision rule formalized: a `CONSENT_VERSION` bump (`public/js/research.js`) is required when consent template materially changes (additions to "what we collect", retention extension, access scope expansion). Cosmetic wording fixes do NOT bump. The bump itself triggers re-consent prompt automatically via `needsReconsent()` semver compare. No further design work needed; reviewer applies judgement when editing the template.
3. **HE consent template native review** — ⏸ **deployment blocker remaining.** RU complete + EN translated; HE skeleton machine-grade per `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` §HE. Resolution path: partner with ulpan teacher for native review (Default option b). Tracked in `RESEARCHER_GUIDE.md` §8 pre-deployment checklist as a blocker for actual ulpan deployment, not for v3.2.0 tag (RU/EN sufficient for development + non-Hebrew-speaking pilots).
4. **Researcher token rotation** — ✅ **resolved 2026-05-13.** Decision: provision a new cohort with a fresh token (preferred), or manually edit `cohort_meta.json` `researcher_token_hash` field with sha256 of new plaintext. Documented in `RESEARCHER_GUIDE.md` §2.1. Convenience CLI (`scripts/research/rotate_token.js`) deferred to v3.3 backlog.
5. **Outcome score normalization** — ✅ **resolved 2026-05-13.** Implemented via `cohort_meta.outcome_scale` field (default `"0-100"`, configurable at cohort creation via `--outcome-scale` flag). Dashboard accepts arbitrary numeric values; researcher documents the scale in their thesis methodology section.
6. **Multi-device student_id** — ✅ **resolved 2026-05-13.** Per-device UUIDs by design — each device generates its own `localStorage.researchStudentId_v1`; aggregates appear as separate "students" in the dashboard. Documented in `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` and `RESEARCHER_GUIDE.md` §1. Manual link mechanism deferred to v3.3.

---

## 15. Live status

> Обновляется по мере реализации. Каждая Phase — `[ ]` planned → `[~]` in-progress → `[x]` done.

### Direction 11A (mini-direction)
- [x] **Phase 11.0** — Event emission gap closure *(commit 7ed309f, 2026-05-10)*
- [x] **Phase 11.1** — Time-spent v2 *(commits 44619f5 + 3f6b959, 2026-05-10)*

### Direction 11B (research mode) — closed 2026-05-13

- [x] **Phase 11.4** — Server-side ingestion (`/api/research/v1/*`) *(commit 25b93b6, S1)*
- [x] **Phase 11.2** — Research mode opt-in + consent *(commit 6a4bb80, S2)*
- [x] **Phase 11.3** — Aggregation pipeline *(commit 6a4bb80, S2)*
- [x] **Phase 11.5** — Teacher dashboard `/teacher.html` + fake cohort seed *(commit 77acb15, S3)*
- [x] **Phase 11.6** — Outcome capture (self-report + CSV upload) *(commit 062027e, S4)*
- [x] **Phase 11.7** — Documentation + ethics *(commit 062027e, S4 — `RESEARCHER_GUIDE.md` added)*

### Combined smoke (precommit gate)

```
node scripts/research/all-smoke.js
# → 4 suites, 60 cases + 9 PNG, ~8s
```

### Research readiness checklist
- See § 9. ALL checkboxes must be `[x]` before real ulpan deployment.
- Implementation-side checklist items are closed; **deployment blockers
  remaining**: HE consent native review (Q3) + pilot run with 2-3 users.

---

**Last updated:** 2026-05-13 (Direction 11B complete — v3.2.0 mega-release scope closed)
