# Research Metrics Schema — v1

> Formal specification of research-mode aggregation upload format. **Strict-validated** server-side (any unknown field rejects entire payload).
>
> Companion document to `docs/ULPAN_RESEARCH_PLAN_v3_2.md`.

## 1. Schema versioning

- Current version: **v1**
- Format identifier: `format: "linguistpro-research-v1"` in every payload root
- **Backwards-incompatible changes** require version bump (v2) with separate endpoint path `/api/research/v2/*`
- Server tracks per-cohort schema version in `cohort_meta.json`

## 2. Payload root — `POST /api/research/v1/metrics`

```json
{
  "format": "linguistpro-research-v1",
  "student_id": "<UUID v4>",
  "cohort_code": "<4-8 chars, alphanumeric, uppercase>",
  "upload_ts": "<ISO 8601, day-level granularity, e.g. '2026-05-10'>",
  "since_ts": "<ISO 8601, day-level, previous upload day>",
  "consent_version": "<semver string of consent agreed to>",
  "context": { ... },
  "metrics": { ... }
}
```

### Required field constraints

| Field | Type | Constraint |
|-------|------|------------|
| `format` | string | **Must equal** `"linguistpro-research-v1"`. |
| `student_id` | string | UUID v4. Server does NOT validate UUID structure beyond shape — student_id is the auth token. |
| `cohort_code` | string | 4–8 chars, `[A-Z0-9-]+`. Must exist in `research-data/<cohort_code>/cohort_meta.json`. |
| `upload_ts` | string | ISO 8601 date (no time component). Server rejects times. |
| `since_ts` | string | ISO 8601 date, ≤ `upload_ts`. Aggregation window. |
| `consent_version` | string | Semver. Server tracks for audit; rejects payloads with consent_version older than minimum required. |

## 3. `context` object (allowed fields)

```json
{
  "app_version": "<semver, e.g. '3.2.0'>",
  "platform": "<one of: 'web/desktop' | 'web/mobile-ios' | 'web/mobile-android' | 'web/pwa'>"
}
```

**No other fields permitted.** No userAgent, no IP, no geolocation, no device fingerprint, no locale, no timezone.

## 4. `metrics` object — Layer 1 (Engagement)

```json
{
  "sessions_count": <int>,
  "active_minutes_real": <int>,
  "active_days_count": <int>,
  "time_of_day_histogram": {
    "0": <int>, "1": <int>, ..., "23": <int>
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sessions_count` | int ≥ 0 | Number of distinct sessions in window. |
| `active_minutes_real` | int ≥ 0 | Sum of heartbeat-derived active minutes (Phase 11.1). |
| `active_days_count` | int ∈ [0, days_in_window] | Distinct days with ≥ 1 session. |
| `time_of_day_histogram` | object | 24 buckets, key = hour string ('0'..'23'), value = sessions in that hour. |

## 5. `metrics` object — Layer 2 (Volume)

```json
{
  "texts_opened_distinct": <int>,
  "texts_opened_total": <int>,
  "sentences_read_distinct": <int>,
  "sentences_read_total": <int>,
  "audio_play_ms_total": <int>,
  "words_encountered_total": <int>,
  "words_unique_estimate": <int>,
  "words_mastered": <int>,
  "cards_reviewed": <int>,
  "cards_added_to_srs": <int>,
  "notes_created": <int>,
  "notes_edited": <int>,
  "search_queries_count": <int>
}
```

| Field | Type | Constraint |
|-------|------|------------|
| `audio_play_ms_total` | int ≥ 0 | Sum of real `play_audio.duration_ms`. |
| `words_unique_estimate` | int ≥ 0 | Approximate (computed via Bloom filter or hash set; not exact for privacy). |
| `words_mastered` | int ≥ 0 | Cards in final SRS stage. |
| `search_queries_count` | int ≥ 0 | Count only. **Query strings NEVER uploaded.** |

## 6. `metrics` object — Layer 3 (Quality)

```json
{
  "cards_correct": <int>,
  "cards_again": <int>,
  "srs_error_rate": <float, 2 decimals>,
  "cards_due_completion_ratio": <float, 2 decimals>,
  "smart_tag_overrides_count": <int>
}
```

| Field | Type | Constraint |
|-------|------|------------|
| `srs_error_rate` | float ∈ [0.0, 1.0] | `cards_again / cards_reviewed` (0 if no reviews). |
| `cards_due_completion_ratio` | float ∈ [0.0, 1.0] | `cards_completed_in_window / cards_due_in_window`. |

## 7. `metrics` object — Layer 4 (Hebrew-specific)

```json
{
  "translit_toggles_count": <int>,
  "audio_replay_distribution": {
    "1": <int>,
    "2": <int>,
    "3": <int>,
    "4plus": <int>
  },
  "niqqud_marked_time_ratio": <float, 2 decimals>
}
```

| Field | Type | Description |
|-------|------|-------------|
| `audio_replay_distribution` | object | Per-row replay counts in window. Bucket '1' = rows played exactly once, '2' = twice, etc. |
| `niqqud_marked_time_ratio` | float ∈ [0.0, 1.0] | Fraction of `active_minutes_real` spent on niqqud-marked text. |

**If Direction 9.4 morphology ships:**

```json
{
  "binyan_coverage": {
    "pa'al": <bool>,
    "nif'al": <bool>,
    "pi'el": <bool>,
    "pu'al": <bool>,
    "hif'il": <bool>,
    "huf'al": <bool>,
    "hitpa'el": <bool>
  },
  "root_encounter_diversity": <int>
}
```

| Field | Type | Description |
|-------|------|-------------|
| `binyan_coverage` | object | True if user has any note about that binyan. |
| `root_encounter_diversity` | int ≥ 0 | Count of distinct roots encountered. |

## 8. `metrics` object — Layer 5 (Outcome) — *populated by separate endpoint*

Outcome metrics are NOT in the daily upload — they're captured separately:

- **Self-report:** when student fills exam-score field, app sends a ONE-OFF `POST /api/research/v1/metrics` with `metrics.outcome` populated:
  ```json
  {
    "outcome": {
      "post_test_score": <number | null>,
      "confidence_self_report": <int 1..5 | null>,
      "outcome_capture_method": "self-report"
    }
  }
  ```
- **Teacher CSV upload:** stored in `research-data/<cohort_code>/outcomes.csv`, joined at dashboard render.

- **Calibrated diagnostic quiz (v3.3.5 Direction 13):** when student completes the in-app 20-item Hebrew diagnostic, app sends a ONE-OFF `POST /api/research/v1/metrics` with `metrics.outcome` populated:
  ```json
  {
    "outcome": {
      "quiz_score_normalized": <number 0..100>,
      "quiz_cefr_band":        "A1" | "A2" | "B1" | "B2" | "C1",
      "quiz_se":               <number ≥ 0>,
      "quiz_completed_at":     "YYYY-MM-DD",
      "quiz_version":          "<lowercase_with_underscores>_v<digits>",
      "outcome_capture_method": "calibrated-quiz"
    }
  }
  ```
  Hard constraint: per-item responses (`Q01`..`Q20`, `responses_transient`) MUST NOT leave the device. Item bank lives at `public/quiz/<instrument_id>.json`; scoring engine in `public/js/quiz-scoring.js` (Rasch 1PL MLE). `quiz_se` is the measurement-quality metric; `quiz_cefr_band` is a derived presentation, not a separate measurement (per `docs/RESEARCH_CONSENT_RULE.md` Example E — cosmetic addition, no `CONSENT_VERSION` bump).

  Teacher CSV remains authoritative for `post_test_score`; quiz fields are preserved on merge so the dashboard surfaces both alongside.

  Reverse mapping (for analysis): `theta_estimate = (raw_score / 100 * 6.0) - 3.0`. Real-data IRT recalibration deferred to v3.4+ once ≥ 30 quiz responses accumulate.

## 9. Forbidden fields

The schema validator MUST reject payload if any of these are present (server-side enforcement):

- `text_content`, `note_body`, `search_query` — actual text strings
- `audio_bytes`, `audio_url` — audio data
- `username`, `email`, `name`, `phone` — PII
- `ip`, `geolocation`, `latitude`, `longitude` — location
- `user_agent` — browser fingerprint
- `device_id`, `device_serial` — device fingerprint
- `timestamp` (with second-level precision in metrics) — only day-level allowed

Any unknown top-level field → reject with `400 SCHEMA_VIOLATION`.

## 10. Server-side storage layout

```
research-data/
├── <cohort_code>/
│   ├── cohort_meta.json          # { code, created_at, k_anonymity_threshold, retention_until, outcome_scale, schema_version }
│   ├── 2026-05-10.jsonl          # one line per upload received that day
│   ├── 2026-05-11.jsonl
│   ├── ...
│   ├── outcomes.csv              # teacher-uploaded exam scores
│   └── deletions.log             # audit log of withdrawal events
```

### `cohort_meta.json`
```json
{
  "code": "ULPAN-A-W2026",
  "schema_version": "v1",
  "created_at": "2026-04-15T00:00:00Z",
  "k_anonymity_threshold": 5,
  "retention_until": "2028-04-15",
  "outcome_scale": "0-100",
  "researcher_token_hash": "<sha256 of researcher token, never plaintext>",
  "consent_version_minimum": "1.0"
}
```

### `<date>.jsonl`
One line per upload, each line is a complete payload from § 2.

### `outcomes.csv`
```
student_id,pre_test_score,post_test_score,exam_date,uploaded_by
abc-1234,72,87,2026-06-15,teacher
def-5678,65,71,2026-06-15,teacher
...
```

### `deletions.log`
```
2026-05-15T10:23:11Z student_id=abc-1234 reason=user_withdrawal records_removed=23
```

## 11. Data retention

- **Default retention:** 2 years post-cohort-end (date in `cohort_meta.retention_until`).
- **After retention:** automated deletion of cohort directory.
- **Withdrawal:** student-initiated DELETE removes ALL records for student_id from cohort logs (rewrite `.jsonl` files without that student's lines), audit-logs in `deletions.log`.

## 12. CSV export schema (from teacher dashboard)

Two CSV files exported simultaneously:

### `cohort_<code>_aggregates.csv` (per-student, see Plan § 8 Primary table)

Columns: `student_id, enrollment_date, withdrawal_date, total_active_minutes, total_audio_ms, total_cards_reviewed, total_cards_correct, total_cards_again, srs_error_rate, total_notes_created, total_notes_edited, total_search_queries, total_smart_tag_overrides, total_texts_opened_distinct, total_sentences_read_distinct, audio_replay_avg_per_row, active_days_count, streak_max, pre_test_score, post_test_score, confidence_self_report, continuation_flag`

### `cohort_<code>_timeseries.csv` (per-student per-day)

Columns: `student_id, date, active_minutes, audio_ms, cards_reviewed, notes_created, sessions_count`

### Derived metrics file `cohort_<code>_derived.csv`

Computed at export time from primary:

Columns: `student_id, engagement_score, quality_score, efficiency_ratio, growth_delta, engagement_consistency`

Formulas in Plan § 8 Derived metrics table.

## 13. Schema validation reference implementation

Server-side TypeScript (or JS):

```js
function validateMetricsPayload(payload) {
  // Check format identifier
  if (payload.format !== "linguistpro-research-v1") {
    throw new Error("SCHEMA_VIOLATION: invalid format");
  }
  // Check required top-level keys
  const requiredKeys = ["format", "student_id", "cohort_code", "upload_ts",
                        "since_ts", "consent_version", "context", "metrics"];
  for (const k of requiredKeys) {
    if (!(k in payload)) throw new Error(`SCHEMA_VIOLATION: missing ${k}`);
  }
  // Check no extra top-level keys
  for (const k of Object.keys(payload)) {
    if (!requiredKeys.includes(k)) {
      throw new Error(`SCHEMA_VIOLATION: unexpected field ${k}`);
    }
  }
  // Check forbidden fields recursively
  const forbidden = ["text_content", "note_body", "search_query",
                     "audio_bytes", "username", "email", "name", "phone",
                     "ip", "geolocation", "user_agent", "device_id"];
  function recurseCheck(obj, path) {
    if (typeof obj !== "object" || obj === null) return;
    for (const k of Object.keys(obj)) {
      if (forbidden.includes(k)) {
        throw new Error(`SCHEMA_VIOLATION: forbidden field ${path}.${k}`);
      }
      recurseCheck(obj[k], `${path}.${k}`);
    }
  }
  recurseCheck(payload, "$");
  // ...continue with type/range checks per § 4-7
}
```

## 14. Validation acceptance test cases

**Must accept:**
- Minimal valid payload (zero counts, all required keys present).
- Full valid payload (all metrics present).
- Idempotent upload (same `student_id` + `since_ts` + `upload_ts` — server dedupes silently).

**Must reject (with `400 SCHEMA_VIOLATION`):**
- Missing `format` field.
- `format` ≠ `"linguistpro-research-v1"`.
- Unknown top-level field.
- Forbidden field (e.g. `note_body: "..."`) anywhere in payload.
- `time_of_day_histogram` with > 24 buckets or non-numeric keys.
- `srs_error_rate` outside [0.0, 1.0].
- `consent_version` older than `cohort_meta.consent_version_minimum`.
- `cohort_code` not found.
- Payload size > 64 KB (unreasonable for daily aggregates).

**Must reject (with `429 RATE_LIMIT`):**
- > 10 uploads per day per `student_id`.

---

**Last updated:** 2026-05-10 (initial commit)
