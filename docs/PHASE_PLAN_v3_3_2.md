# Phase Plan — v3.3.2 (Direction 12 + Direction 15)

> **Status.** Approved structure 2026-05-14. **Plan only — no implementation in this artifact.** The implementation patches start after user re-confirms this document.
>
> **Scope.** D12 Multicohort Teacher Dashboard + D15 Cross-text "Где встречается" Hub, per [`PREMIUM_RELEASE_PLAN_v3_3.md`](PREMIUM_RELEASE_PLAN_v3_3.md) §3.
>
> **Hard constraints (locked by user 2026-05-14):**
> - No new `/api/research/v1/*` endpoints.
> - No `CONSENT_VERSION` bump.
> - No new collected fields.
> - No raw events leaving device.
> - Multicohort = read-only compare only.
> - Cross-cohort writes deferred to v3.4.
> - Researcher-token rotation UI out of scope.
> - Cross-text hub must be all-local; reuse `MorphNormalize` invariant.

---

## 1. Repo Audit Findings

### D12 Multicohort — relevant surface

- **`public/teacher.html`** (156 LOC) — single-cohort login form (`#cohortInput` + `#tokenInput` → `#loginBtn`), header with cohort meta + action buttons (refresh, upload outcomes, 3 CSV exports, logout), main body with 6 cards (cohort overview, engagement timeline, audio chart, SRS/notes chart, per-student table, correlations, scatter).
- **`public/js/teacher.js`** (617 LOC) — IIFE; `LS = {cohort: 'teacherDashCohort_v1', token: 'teacherDashToken_v1'}`. Login writes both keys. `tryLogin()` validates cohort code regex `[A-Z0-9-]{4,16}`, fetches `/api/research/v1/cohort/:code/aggregates` with Bearer, stores both keys on success. `refresh()` re-reads keys. `logout()` removes both keys. `boot()` auto-resumes if both keys present.
- **`scripts/research/teacher-smoke.js`** (264 LOC) — 14 Playwright assertions, expects `#cohortInput`/`#tokenInput`/`#loginBtn` selectors. Asserts cohort_meta header text contains specific cohort code. Will break if those selectors change.
- **`research/storage.js`** `aggregateCohort(code)` — returns `{cohort_meta, cohort_size, k_anonymity_met, days_observed, daily_aggregates[], students[] (empty if !k_met), per_student_daily[] (empty if !k_met)}`. This is the single-cohort wire shape; multicohort just calls it N times in parallel.

**No server-side touch needed.** All multicohort behavior is client-side concurrent fan-out across existing endpoints.

### D15 Cross-text hub — relevant surface

- **`public/index.html`** lines 10337-10434 — `<div data-tpl="word_study">` template form. Contains `#v3NotesTplWordStudyWord` (RTL Hebrew input), `#v3NotesTplWordStudyRoot`, `#v3NotesTplWordStudyMeaning`, `#v3NotesTplWordStudyBinyan` etc. The Phase 9.4.D auto-fill hook (around line 33846) populates root + binyan from `MorphProvider.analyze(word)` when the user types into the word field.
- **`public/js/morph-provider.js`** — `MorphProvider.analyze(word)` returns array of `{r, l, b, p, s, k, u, d}` analyses. `r` is the 3-letter root. We can reuse this directly for the "find by root" path.
- **`public/js/morph-normalize.js`** + `MorphNormalize.normalizeHebrew(s)` — niqqud strip + final-letter map + ZWJ strip + NFC. Single source of truth for lookup-key normalization.
- **`public/db/local-db.js`** — `getSentences(textId)` returns rows with `he_plain`, `he_niqqud`, `translit`, `ru`. `searchSentences(q, limit=20)` does substring search via SQLite LIKE. Both are existing OPFS-backed queries; for cross-text lookup we'll use a custom indexed walk because LIKE is O(N) per query and slow.

**No server-side touch needed.** Lookup is purely local over OPFS-backed `sentences` table.

### Existing test infrastructure to reuse

- `scripts/research/teacher-smoke.js` pattern — spawns server + temp `RESEARCH_DATA_DIR` + seed cohort + Playwright.
- `scripts/research/all-smoke.js` — central runner; v3.3.2 adds two new suite entries.
- Existing `scripts/research/seed_research_fake_cohort.js` produces deterministic 12-student × 14-day cohorts; multicohort smoke needs **multiple seeded cohorts**. The seed script accepts `--code` so we can call it N times to seed `FAKE-COH-A` / `FAKE-COH-B` / `FAKE-COH-C` etc.

---

## 2. Files likely to change

### D12 — Multicohort dashboard

| File | Change | Rationale |
|---|---|---|
| `public/teacher.html` | Login screen gains a `<textarea>` for bulk paste + a single-pair form (collapsible toggle). Header gains `#cohortChipStrip` + active-view marker. New action button `⬇ Cross-cohort CSV`. | UX surface change |
| `public/js/teacher.js` | Replace `LS.cohort` / `LS.token` constants with `LS.cohorts` (array). Add `state.activeView` ∈ `<code>` | `'ALL'`. Add bulk-parse / per-cohort fetch coordinator / compare-view renderer / cross_cohort CSV exporter. Migrate legacy v1 keys on first boot. | Architecture |
| `scripts/research/teacher-smoke.js` | Existing 14 cases unchanged (single-cohort path stays default if 1 cohort entered). | Regression check |
| `scripts/research/teacher-multicohort-smoke.js` (new) | 6+ new Playwright cases for the multicohort surface. | Coverage |
| `scripts/research/all-smoke.js` | Wire new suite. | Plumbing |
| `package.json` | New scripts `smoke:research:teacher:multi`, `research:seed:multi` (helper to seed 3 cohorts at once). | UX |
| `docs/RESEARCHER_GUIDE.md` | §5 Teacher dashboard section gets §5.4 "Multicohort mode" subsection. | Doc |
| `CHANGELOG.md` | v3.3.2 entry. | Process |

### D15 — Cross-text hub

| File | Change | Rationale |
|---|---|---|
| `public/js/crosstext.js` (new) | New module. Public surface: `CrossText.findOccurrences(word, {includeRoot, limit})`, `CrossText.invalidate()`, `CrossText.getStats()`. Inverted-index lazy-built on first call. | Service |
| `public/js/crosstext-ui.js` (new) | Modal/side-panel UI. Mirrors pattern of `research-ui.js` (v3ConfirmModal-based, escapeHtml helpers, i18n via `window.t`). | UI |
| `public/index.html` | Add `<script src="/js/crosstext.js">` + `<script src="/js/crosstext-ui.js">`. Inject `🔎 Где встречается` button near `#v3NotesTplWordStudyRoot` (read root from form, fallback to word). | Wire-up |
| `public/i18n/locales/{ru,en,he}.js` | ~12 new keys under `crossText.*`. | i18n |
| `scripts/morph/crosstext-smoke.js` (new) | 5 Playwright cases. | Coverage |
| `package.json` | `smoke:crosstext`. | UX |
| `scripts/research/all-smoke.js` | NOT touched — cross-text smoke lives under `smoke:morph` family OR a new top-level (TBD). Decision: **`smoke:crosstext` as standalone**; wire into `all-smoke.js` runner anyway so combined gate stays green. | Plumbing |

---

## 3. Existing contracts to preserve

### Wire format (server side — read by dashboard)

```
GET /api/research/v1/cohort/<code>/aggregates
  Authorization: Bearer <token>
  → 200 { cohort_meta, cohort_size, k_anonymity_met,
          days_observed, daily_aggregates[], students[], per_student_daily[] }
  → 401 missing/invalid bearer
  → 403 invalid token for this cohort
  → 404 cohort not found
```

**Single-cohort fetch shape is unchanged.** Multicohort orchestrates N concurrent calls; failure of one cohort fetch does NOT block others — the chip for that cohort shows a `⚠ error` indicator.

### Smoke surface (must NOT break)

- 14 existing teacher-smoke cases (cohort meta header, summary tiles, charts, k-anonymity badge, per-student rows, correlations, scatter, exports, logout).
- 12 existing preview-ui-smoke cases (preview section in transparency modal).
- 79 existing research smoke cases.

### localStorage keys (existing — for migration only)

```
teacherDashCohort_v1   (string)   — single cohort code (v1 single-cohort schema)
teacherDashToken_v1    (string)   — single researcher token
```

These must be **automatically migrated** on first v3.3.2 boot if present. Migration writes the new v2 array containing one entry derived from the v1 pair, then **removes** the v1 keys so the migration runs exactly once.

### Cross-text lookup contract

**No existing contract** — D15 is greenfield. The new `window.CrossText` module is the contract going forward; smoke pins it.

---

## 4. Data model / localStorage contract for multicohort credentials

### New key

```
teacherDashCohorts_v2  (JSON array)
```

Schema:

```ts
type StoredCohort = {
  code:       string;    // matches /^[A-Z0-9-]{4,16}$/
  token:      string;    // researcher Bearer plaintext (never logged)
  added_at:   string;    // ISO 8601; informational, used for chip ordering
  last_ok_at: string|null; // ISO 8601 of last successful fetch; null if never
  nickname?:  string;    // optional researcher-supplied alias, max 40 chars
};

type V2State = StoredCohort[];  // length 0..N; ordered as added
```

**No upper limit on N at storage layer.** The chip-strip UX (§5) limits visible cohorts to 6 with overflow dropdown; the underlying array may hold more.

### Active-view state

A separate companion key tracks which view is shown:

```
teacherDashActiveView_v2  (string)
  values: <COHORT_CODE>  — show that cohort's single-cohort dashboard
        | "ALL"          — show the compare view
        | ""             — show login screen (no cohorts stored)
```

This is **persistence-only** for "where did I leave off"; on boot we still validate that the chosen cohort is in `teacherDashCohorts_v2` and fall back to the first cohort if not.

### Migration path

Algorithm (runs once on boot if `teacherDashCohorts_v2` absent AND `teacherDashCohort_v1` present):

```
1. Read legacy v1 cohort + token strings.
2. If both present:
     teacherDashCohorts_v2 = [{ code, token, added_at: now(), last_ok_at: null }]
     teacherDashActiveView_v2 = code
3. Remove teacherDashCohort_v1 + teacherDashToken_v1 unconditionally.
4. Log a one-time toast: "Обновлено для multicohort режима".
```

The legacy keys are **deleted** (not preserved) — only one cohort can have been stored under them, and once migrated, the v2 array is authoritative.

### Privacy guarantee preserved

Researcher tokens (Bearer plaintexts) live in browser localStorage exactly as before — same threat model, same disclosure boundary. The only difference is that the JSON wrapper may contain multiple tokens. **No tokens are transmitted anywhere besides the existing Bearer header on `/api/research/v1/cohort/:code/aggregates` calls.**

---

## 5. UX flow

### 5.1 Login screen — bulk paste + single-pair form

Layout:

```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Teacher Dashboard                                         │
│                                                              │
│ Введите credentials одной когорты или вставьте список.       │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [textarea, monospace, ~7 rows]                           │ │
│ │ ULPAN-A-W2026  abc123def...                              │ │
│ │ ULPAN-B-W2026  ghi456jkl...                              │ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│ Формат: одна когорта на строку — `CODE  TOKEN` через         │
│ пробел или таб. Можно скопировать целый блок из вашего       │
│ password manager-а или из markdown-таблицы.                  │
│                                                              │
│ [Войти (N когорт)]                                           │
│                                                              │
│ — или —                                                      │
│                                                              │
│ ▾ Одну когорту по полям                                      │
│   (collapsed by default; expands to single cohort_code +    │
│   token input pair from v3.3.1 layout)                       │
│                                                              │
│ <err line>                                                   │
│                                                              │
│ Privacy hint (existing).                                     │
└─────────────────────────────────────────────────────────────┘
```

**Parser:** tolerant of mixed whitespace (`\s+` separator), blank lines, lines starting with `#` (treated as comments). Lines that don't match `^[A-Z0-9-]{4,16}\s+\S+$` are surfaced as parse errors with line numbers — the textarea is not auto-corrected, error message says exactly which lines failed.

**Per-cohort validation on submit:**
- Parse the textarea → list of `(code, token)` pairs.
- For each pair: validate cohort code regex; queue a fetch.
- Concurrent fetches with `Promise.allSettled`.
- After all settle: build `teacherDashCohorts_v2` array containing **only successful** pairs. Surface error summary for failed ones ("ULPAN-B-W2026: 401 invalid token — пропущена.").
- If zero succeeded: stay on login screen with errors highlighted.
- If ≥1 succeeded: write array, set active view to first successful cohort, transition to dashboard.

**Single-pair form (collapsed by default):** preserves the v3.2.0/v3.3.0 UX for the common "I just want to look at one cohort" case. Submitting this form is functionally identical to entering a single line into the bulk textarea.

### 5.2 Chip strip selector (header)

After login, header shows chip strip + actions:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 Teacher Dashboard                                            │
│ [ULPAN-A] [ULPAN-B] [ULPAN-C] [ULPAN-D] [ULPAN-E] [+2 more ▾]  │
│ [🌐 All cohorts]                                                │
│ ──────                                                          │
│ [🔄 Refresh] [📤 Upload outcomes CSV] [⬇ Aggregates CSV]        │
│ [⬇ Timeseries CSV] [⬇ Derived CSV] [⬇ Cross-cohort CSV]         │
│ [+ Add cohort] [⎋ Logout all]                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Chip rules:**
- Each chip = one cohort. Style: pill shape, monospace code, small × to remove.
- **Active chip**: yellow border, bold weight. Click any chip to switch the active view.
- **Max 6 visible** as inline pills. If `teacherDashCohorts_v2.length > 6`, show first 6 + a `[+N more ▾]` dropdown listing the remainder.
- **Per-chip status indicator** (after fetch settles): green dot if `last_ok_at` is recent; red dot if last fetch errored (401/403/404). Hover shows tooltip with the error.
- The "🌐 All cohorts" chip is always last in the strip (after the overflow dropdown if any). Click it → render compare view.
- "+ Add cohort" → opens an inline form (same parser as login textarea, but adds to existing array rather than replacing).
- "⎋ Logout all" → confirm modal "Удалить все N когорт?" → on confirm, clear `teacherDashCohorts_v2` + `teacherDashActiveView_v2`, return to login screen.

**Mobile fallback:** below 720 px viewport, chips wrap to multiple rows; "🌐 All cohorts" stays on the right. The overflow dropdown still triggers at >6 chips for predictability.

### 5.3 All cohorts compare view

When `🌐 All cohorts` is active:

```
┌──────────────────────────────────────────────────────────────────┐
│ Cohort overview (compare)                                        │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐         │
│ │ ULPAN-A     │ ULPAN-B     │ ULPAN-C     │ ULPAN-D     │         │
│ │ Size: 12    │ Size: 4     │ Size: 8     │ Size: 9     │         │
│ │ Days: 14    │ Days: 12    │ Days: 14    │ Days: 11    │         │
│ │ Min: 4320   │ Min: 980    │ Min: 2156   │ Min: 3010   │         │
│ │ k-anon: ✓   │ k-anon: ✗   │ k-anon: ✓   │ k-anon: ✓   │         │
│ └─────────────┴─────────────┴─────────────┴─────────────┘         │
├──────────────────────────────────────────────────────────────────┤
│ Engagement timeline — overlaid                                   │
│ [SVG: one line per cohort, color-keyed; legend at bottom]        │
├──────────────────────────────────────────────────────────────────┤
│ Audio playback (per day) ┊ SRS reviews + notes (per day)         │
│ [overlaid]               ┊ [overlaid]                            │
├──────────────────────────────────────────────────────────────────┤
│ Per-student breakdown — НЕ доступен в compare-режиме.            │
│ Выберите конкретную когорту в chip strip выше.                   │
├──────────────────────────────────────────────────────────────────┤
│ Outcome correlations — также per-cohort. Выберите конкретную.    │
└──────────────────────────────────────────────────────────────────┘
```

**Color coding:** deterministic palette of 8 colors (cohort_code → color via stable hash); shown in the chart legend at the bottom of each chart. Defines an implicit cohort identity in the visualization.

**Cohort failure handling in compare view:** if a cohort's fetch errored, its tile shows `⚠ Не удалось загрузить` in red; its line is omitted from the overlaid charts; the legend mentions it grey-out-strikethrough.

---

## 6. CSV schema for `cross_cohort_aggregates.csv`

**Filename:** `cross_cohort_aggregates_<YYYY-MM-DD>.csv` (date = today).

**Structure:** long-format (one row per `cohort × date` cell) — friendlier for `dplyr`/`pandas` than wide-format would be.

**Columns (in fixed order):**

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | `cohort_code` | string | matches `[A-Z0-9-]{4,16}` |
| 2 | `date` | ISO day | `YYYY-MM-DD` |
| 3 | `students_active` | int | from `daily_aggregates[i].students_active` |
| 4 | `cohort_size_total` | int | constant per cohort (size as observed by the dashboard at export time) |
| 5 | `k_anonymity_met` | int | 1 or 0 (cohort-level, not per-row) |
| 6 | `active_minutes_real` | int | cohort-wide sum that day |
| 7 | `audio_play_ms_total` | int | cohort-wide sum that day |
| 8 | `sessions_count` | int | cohort-wide sum that day |
| 9 | `cards_reviewed` | int | cohort-wide sum that day |
| 10 | `notes_created` | int | cohort-wide sum that day |
| 11 | `cohort_meta_consent_version` | string | from `cohort_meta.consent_version_minimum` |
| 12 | `cohort_meta_retention_until` | ISO day | from `cohort_meta.retention_until` |

**Row count:** `sum_over_cohorts(days_observed)`. Sorted by `(cohort_code ASC, date ASC)`.

**Privacy invariant preserved:** **no per-student data** in this CSV. All values are already-aggregated cohort-wide daily numbers. This matches the diploma research narrative — cross-cohort comparison happens at the cohort level.

**Header row identity:**
```
cohort_code,date,students_active,cohort_size_total,k_anonymity_met,active_minutes_real,audio_play_ms_total,sessions_count,cards_reviewed,notes_created,cohort_meta_consent_version,cohort_meta_retention_until
```

R example consumer:
```r
df <- read.csv("cross_cohort_aggregates_2026-05-14.csv")
library(dplyr)
df %>%
  group_by(cohort_code) %>%
  summarise(total_minutes = sum(active_minutes_real),
            avg_daily_students = mean(students_active))
```

---

## 7. k-anonymity per-cohort behavior matrix

The k-anonymity gate is **per-cohort, evaluated independently**.

| View | Cohort A (size=12) | Cohort B (size=4) | Cohort C (size=8) |
|---|---|---|---|
| Single-cohort view of A | Per-student table: **visible** (12 rows) · summary tiles: visible · charts: visible · correlations: visible · scatter: visible | n/a | n/a |
| Single-cohort view of B | n/a | Per-student table: **HIDDEN** (k-warn badge "⚠ k-anonymity not met (4 < k=5)") · summary tiles: visible · charts: visible · correlations: HIDDEN · scatter: HIDDEN | n/a |
| Single-cohort view of C | n/a | n/a | Per-student: **visible** (8 rows) · everything else: visible |
| **Compare view ("🌐 All cohorts")** | Summary tile: visible · timeline contributes its line · cohort badge "✓ k-met" | Summary tile: visible · timeline contributes its line · cohort badge "⚠ k-not-met" · NO per-student detail in the compare view at all | Summary tile: visible · timeline contributes its line · cohort badge "✓ k-met" |

**Important:** in compare view, per-student tables are ALWAYS hidden regardless of any cohort's k-status. This prevents accidental cross-cohort re-identification (e.g. a researcher mentally cross-referencing student row indices across cohorts).

CSV export rule (matches the table):
- `cross_cohort_aggregates.csv` is cohort-wide; safe to export regardless of k-status.
- Existing `cohort_<code>_aggregates.csv` per-student CSV: only exports rows for cohorts where `k_anonymity_met === true`. If exported in compare view, the file contains per-cohort blocks for each k-met cohort; k-not-met cohorts are omitted with a header comment.

---

## 8. Cross-text lookup service design

### 8.1 Public surface — `window.CrossText`

```ts
type Occurrence = {
  text_id:        string;
  text_title:     string;
  sentence_id:    string;
  order_index:    number;     // position within the text
  snippet:        string;     // ~80 chars, original surface form
  snippet_match: { start: number; end: number };  // offsets within snippet
  root?:          string;     // 3-letter root if we know it
  binyan?:        string;     // if matched word's analysis included one
  matched_form:   string;     // the actual word as it appeared (may differ from query due to inflection)
};

type FindOptions = {
  includeRoot?:  boolean;     // default false: only surface-form matches.
                              // true: also include other inflections sharing
                              // the same root (uses MorphProvider.analyze()).
  limit?:        number;      // default 200; cap to avoid runaway UI.
  excludeTextId?: string;     // skip occurrences in this text (typical use:
                              // exclude the text the user is currently in)
};

window.CrossText = {
  // First call builds the index lazily; subsequent calls use the cache.
  // Returns a flat list of occurrences sorted by (text_id ASC, order_index ASC).
  findOccurrences(word: string, opts?: FindOptions): Promise<Occurrence[]>,

  // Force-invalidate the in-memory index. Called automatically on
  // text add/edit/delete (wire-ups in §8.3); also callable manually
  // (e.g. after a bulk library import).
  invalidate(): void,

  // Diagnostic — returns { textsIndexed, sentencesIndexed, distinctNormalizedKeys, builtAt, lastQueryMs }.
  // Used by smoke + dev tooling.
  getStats(): object,
};
```

### 8.2 Internal index structure

```ts
type IndexEntry = {
  text_id:     string;
  text_title:  string;
  sentence_id: string;
  order_index: number;
  he_plain:    string;   // original sentence text; we slice snippets out of this
  positions:   number[]; // char offsets in he_plain where the normalized key appears
};

type IndexState = {
  forward: Map<string /* normalized word key */, IndexEntry[]>;
  reverse: Map<string /* sentence_id */, IndexEntry>;
  built_at: number;
  texts_indexed:    number;
  sentences_indexed: number;
  distinct_keys:     number;
};
```

Build algorithm (runs lazily on first `findOccurrences` call OR after `invalidate`):

```
1. Query SQLite: SELECT s.id, s.text_id, s.order_index, s.he_plain,
                        t.title AS text_title
                 FROM sentences s
                 JOIN texts t ON t.id = s.text_id
                 WHERE t.is_archived = 0
                 ORDER BY t.last_opened_at DESC NULLS LAST, s.order_index ASC

2. For each sentence row:
     - Split he_plain into word tokens by /[\s\p{P}]+/u (Unicode-aware).
     - For each token:
         - Normalize via MorphNormalize.normalizeHebrew(token).
         - If the normalized key is empty → skip.
         - Append IndexEntry to forward[key]; record the char offset in positions[].
3. Stash IndexState in module-private variable; emit a telemetry event
   `crosstext.index.built` (no word content; just counts + duration).
```

**Memory budget:** library of 100 texts × 100 sentences avg × 10 words avg = ~100K word→sentence edges. Each entry ~150 bytes (string refs + small array). Total ~15 MB held in memory. iOS Safari quota considerations — see §10.

### 8.3 Cache invalidation hooks

Wire up listeners so the in-memory index dies when its underlying data changes:

- `local-db.js` already emits events for text add/edit/delete (or we add a listener at the call site). On any of those, call `CrossText.invalidate()`.
- ZIP bundle import (existing flow) — invalidate after the transaction commits.
- Tab visibilitychange → "hidden" for > 5 minutes → invalidate (saves memory in idle tabs).
- Manual library reset (rare admin action) — invalidate.

**No persistent cache.** The index is in-memory only. Rebuild cost is O(sentences) and runs once per browser session unless invalidated.

### 8.4 Lookup algorithm

```
findOccurrences(word, opts):
  await ensureIndex()  // lazy build if needed

  const t0 = performance.now();
  const key = MorphNormalize.normalizeHebrew(word)
  const directHits = forward.get(key) || []

  let allHits = directHits.slice()

  if (opts.includeRoot):
    const analyses = await MorphProvider.analyze(word)  // already-fast (in-memory map)
    const roots = new Set(analyses.map(a => a.r).filter(Boolean))
    for (const r of roots):
      const rKey = MorphNormalize.normalizeHebrew(r)
      const rHits = forward.get(rKey) || []
      // also search for words whose normalized form happens to equal the root
      // (the morphology dict has root entries keyed under the root itself)
      // — a future v3.4 improvement is a secondary "all-forms-of-this-root"
      // reverse index built from MorphProvider data; out of scope here.
      allHits.push(...rHits)

  // De-dupe by sentence_id; preserve first occurrence order.
  const seen = new Set()
  const out = []
  for (const e of allHits):
    if (seen.has(e.sentence_id)) continue
    seen.add(e.sentence_id)
    if (opts.excludeTextId && e.text_id === opts.excludeTextId) continue
    out.push(toOccurrence(e, word, key))
    if (out.length >= (opts.limit || 200)) break

  lastQueryMs = performance.now() - t0
  return out
```

Snippet construction: take `he_plain.slice(pos - 40, pos + 40)` clamped to sentence bounds. Mark the start/end offsets of the matched word within the snippet so the UI can wrap them in `<mark>`. Snippets are *raw* — not niqqud-stripped — so the user sees the text as authored.

### 8.5 Privacy

- **No telemetry on word lookups.** Matches the privacy invariant from `MORPHOLOGY_REQUIREMENTS_v3_2.md` (requirement #17). The diagnostic `getStats()` returns counts but never the query word.
- **No data leaves the device.** All operations run against the local `sentences` table and the local morphology dict.
- **No new event types.** The cross-text lookup does NOT emit any `events` row; D5 invariant preserved.

---

## 9. Cross-text side-panel UX

### 9.1 Entry point — button injection

Inside the `word_study` template form (`<div data-tpl="word_study">` in `index.html`), add a new button near the existing morphology auto-fill area:

```html
<div class="v3-notes-tpl-row">
  <button type="button" id="v3WordStudyCrossTextBtn"
          onclick="window.CrossTextUI && window.CrossTextUI.openForCurrentWord()"
          data-i18n="notes.tpl.word_study.crossText"
          title="Найти, где это слово / его корень встречается в библиотеке">
    🔎 Где встречается
  </button>
</div>
```

The handler reads `#v3NotesTplWordStudyWord` (surface form) and `#v3NotesTplWordStudyRoot` (if filled) and calls `CrossTextUI.open({word, root, excludeTextId: currentTextId})`.

### 9.2 Panel layout

Side-panel that slides in from the right edge (desktop ≥ 1024 px) OR full-screen modal on narrow viewports (< 1024 px). Z-index above the notes modal so they stack cleanly.

```
┌───────────────────────────────────────────────────┐
│ 🔎  Где встречается:  «שלום»                   ✕  │
│      (root: שלם, binyan: paal)                    │
│ ─────────────────────────────────────────────────  │
│  [✓] Включая другие инфлексии корня (toggle)      │
│      Сначала показываются точные совпадения.      │
│ ─────────────────────────────────────────────────  │
│                                                   │
│ Найдено: 42 совпадений в 8 текстах                │
│                                                   │
│ ▾ Берешит 1:1-15 (12 совпадений)                   │
│   • Стих 3 — «...וירא אלהים את־האור כי־טוב        │
│     ויהי בעולם **שלום** ועד...»                    │
│   • Стих 7 — «...של (binyan: paal) **שלום**     ...»│
│   ...                                              │
│                                                   │
│ ▾ Ulpan Aleph Lesson 5 (4 совпадений)              │
│   • Стих 1 — «...אומרת **שלום** לכולם...»          │
│   ...                                              │
│                                                   │
│ (other texts collapsible the same way)            │
│                                                   │
│ ─────────────────────────────────────────────────  │
│ Тыкни на стих чтобы перейти к нему в библиотеке.  │
└───────────────────────────────────────────────────┘
```

**Behavior:**
- **Header line** shows the queried word; if `includeRoot` is enabled and morphology auto-fill resolved a root/binyan, show them in muted text under the title.
- **Toggle row** — "Включая другие инфлексии корня" — bound to the `includeRoot` flag. Switching it triggers a re-query (~30 ms via cache).
- **Counts** — total occurrences + number of distinct texts.
- **Per-text groups** — collapsible (`<details>`). Default state: first 3 texts expanded, rest collapsed. Click the text title to toggle.
- **Per-occurrence row** — sentence number (e.g. "Стих 7") + snippet with the match wrapped in `<mark>` (or equivalent emphasis). Hover = hint "Кликни, чтобы открыть".
- **Click handler** — closes the cross-text panel, ensures the notes modal is also closed, opens the target text in classic view at the matched sentence (existing infrastructure: `v3OpenTextInClassic(textId, scrollToSentenceId)`), and briefly highlights the sentence (~2s yellow flash) so the user can find it visually.
- **Empty state** — "Слово не встречается в других текстах библиотеки.". If `excludeTextId` made the result empty, also show a secondary line "(в текущем тексте найдено N — открой Search чтобы увидеть)".
- **Error state** — if the morphology dict is unavailable (e.g. user disabled both tiers somehow), the toggle is disabled and a hint appears: "Расширенный поиск по корню требует загруженный морфологический словарь.".

### 9.3 Keyboard

- `Esc` closes the panel.
- `↑/↓` navigate through occurrences.
- `Enter` opens the highlighted occurrence.
- `Tab` cycles through collapsible group headers.

### 9.4 Mobile fallback

Below 1024 px, render as full-screen modal (same content). Slide-in animation from the right; close via `✕` button or back-swipe (browser-native).

---

## 10. Performance budgets and caching

| Metric | Budget | Measurement |
|---|---|---|
| Cold index build, library 100 texts × 100 sentences | ≤ 600 ms | `performance.now()` around the SQLite query + tokenization + Map build. Logged once per session via `getStats().builtAt`. |
| First lookup after cold build | ≤ 200 ms | Includes the cold-build cost. |
| Subsequent lookup (same word, cache hit) | ≤ 30 ms | Index already built; Map.get is O(1). |
| Subsequent lookup (different word) | ≤ 50 ms | Map.get + array slice + snippet generation for top 200 occurrences. |
| Snippet generation for one occurrence | ≤ 0.5 ms | Pure string slice. |
| `includeRoot` morphology call overhead | ≤ 10 ms | `MorphProvider.analyze()` is in-memory map lookup ~1 ms; the rest is extra forward.get(rootKey) hits. |
| Memory held by index | ≤ 20 MB on a 100-text library | Inspectable via `performance.memory.usedJSHeapSize` deltas before/after `ensureIndex`. |
| Memory held by index | ≤ 50 MB on a 500-text library (degradation OK) | Same. iOS Safari quota guard: see below. |

**Caching strategy:**
- Module-private `IndexState` variable. Single instance per page load.
- Cache key for query memo: `(normalized_word, includeRoot, excludeTextId, limit)` → `Occurrence[]`. LRU-bounded to 200 entries (most users will query 5-20 distinct words per session).
- `MorphProvider.analyze()` results are NOT cached separately — that module already has its own in-memory map.

**Quota guard:**
- Before building the index, check `navigator.storage.estimate()`. If `usage/quota > 0.85` and the library is "large" (>250 texts), warn the user via a one-line hint in the side-panel: "⚠ Storage близко к лимиту — поиск может работать медленнее.". The build proceeds anyway (it's in-memory, not OPFS).
- iOS Safari worst-case: per-origin quota can be 50 MB. If the index would exceed ~30 MB, switch to a "top-N texts" mode (most-recent 200 texts only) and surface a hint.

---

## 11. Smoke matrix

### 11.1 D12 Multicohort smoke (new — `scripts/research/teacher-multicohort-smoke.js`)

Spawns server + seeds 3 cohorts of different sizes (12 / 4 / 8 students) so the k-anonymity behavior matrix from §7 can be exercised. Uses Playwright.

| # | Case | Acceptance |
|---|---|---|
| 1 | Bulk-paste 3 cohorts, all valid | All 3 chips appear in strip; active view = first cohort. |
| 2 | Bulk-paste with 1 bad token | Valid cohorts persist; error summary lists the bad row by line number. |
| 3 | Add cohort via single-pair form | Chip appended; existing chips preserved; active view unchanged. |
| 4 | Switch active chip A → B | Dashboard re-renders B's data; URL of fetch confirmed = `/cohort/B/aggregates`. |
| 5 | Switch to "🌐 All cohorts" | Compare view renders; 3 summary tiles; overlaid timeline with 3 lines + legend; per-student section shows "недоступно в compare-режиме". |
| 6 | Remove cohort via chip × | Confirm modal; on accept, chip vanishes; if it was active, active view falls back to first remaining. |
| 7 | Export `cross_cohort_aggregates.csv` | File downloads; header row matches §6 schema; row count = sum of `days_observed` across cohorts; sorted by (cohort, date). |
| 8 | Cohort with k-not-met (size 4) in compare view | Tile renders with "⚠ k-not-met" badge; line appears in overlaid charts (cohort-wide aggregates are k-safe); per-student data NOT exposed anywhere. |
| 9 | "Logout all" with multiple cohorts | Confirm modal; on accept, localStorage `teacherDashCohorts_v2` cleared; login screen shown. |
| 10 | Legacy v1 keys migrated on first load | Set legacy `teacherDashCohort_v1` + `teacherDashToken_v1` before load; on boot, `teacherDashCohorts_v2` has 1 entry; v1 keys are gone. |
| 11 | Failed cohort fetch surfaces in chip | Set one cohort's token to invalid; chip shows red dot + tooltip "401 invalid token"; other cohorts unaffected. |
| 12 | Existing 14 single-cohort cases still green | Re-run `teacher-smoke.js`; all 14 pass. |

### 11.2 D12 visual regression (new screenshots in `Smoke-check/teacher-dashboard/<ts>/`)

Add to existing `teacher-screenshots.js`:
- `multicohort-3-chips-active-A.png`
- `multicohort-compare-view.png`
- `multicohort-error-chip.png` (one chip in error state)

### 11.3 D15 Cross-text smoke (new — `scripts/morph/crosstext-smoke.js`)

Spawns server, seeds a small fixture library (3 texts × ~20 sentences) into a temp OPFS, exercises CrossText via Playwright.

| # | Case | Acceptance |
|---|---|---|
| 1 | Direct surface-form lookup of `שלום` | Returns N occurrences; all in expected sentence IDs; snippets contain the match offset. |
| 2 | Niqqud-insensitive: lookup of `שָׁלוֹם` finds same occurrences as `שלום` | Both queries return identical occurrence set (modulo ordering). |
| 3 | `includeRoot=true` lookup of `שלום` returns more occurrences than `includeRoot=false` (provided the fixture has root-inflection variety) | Strictly superset; new occurrences include inflected forms. |
| 4 | Cache hit: second lookup of same word takes < 30 ms (measured) | `getStats().lastQueryMs < 30` on the second call. |
| 5 | Empty result for a Hebrew word not in fixture | Returns `[]`; UI shows empty-state copy. |
| 6 | `excludeTextId` filter omits the current text's occurrences | Result count matches manually-counted occurrences in OTHER texts. |
| 7 | Invalidate on text add: index rebuilds | Add a new text, query a word from that text; result includes it. |
| 8 | Click-through navigation | UI click on an occurrence closes the panel, opens the target text, scrolls to the matched sentence; verified via post-click DOM state. |

### 11.4 D15 visual regression

- `crosstext-panel-3-texts.png`
- `crosstext-panel-empty-state.png`

### 11.5 Wire into `all-smoke.js`

| Suite | Test count after v3.3.2 |
|---|---|
| Server (existing) | 25 |
| Client opt-in (existing) | 28 |
| Teacher single-cohort (existing) | 14 |
| **Teacher multicohort (new)** | **12** |
| Preview UI (existing) | 12 |
| Admin CLI rotate (existing) | 12 |
| Admin CLI link (existing) | 12 |
| Admin CLI validate (existing) | 15 |
| **Morph cross-text (new)** | **8** |
| Morph tier-switch + Settings + live (existing) | 9 + 13 + 6 = 28 |
| Visual regression | 9 → 14 PNGs (+5 from D12+D15) |
| **Total** | **166 cases + 14 PNGs** (was 146 + 9 at v3.3.1) |

---

## 12. Privacy checklist

| Invariant | Check | How verified at merge |
|---|---|---|
| No new collected fields | Diff `research/validate.js` `ALLOWED_METRIC_KEYS` — must be unchanged. | Manual review + grep. |
| No `CONSENT_VERSION` bump | Diff `public/js/research.js` `CONSENT_VERSION` constant — must be `"1.0"`. | Manual review. |
| No new `/api/research/v1/*` routes | Diff `server.js` + `research/routes*.js` — no new handlers. | Manual review + smoke pinning existing route count. |
| No raw events leaving device | `crosstext.js` and `teacher.js` make ZERO new `fetch` calls except `/api/research/v1/cohort/<code>/aggregates` (which is the existing endpoint). | Network audit in browser-smoke. |
| Multicohort credential storage same threat model as v3.3.1 | Tokens stored in plaintext localStorage as before; only the wrapper shape changes. | Doc-only, but auditable via `git diff`. |
| Cross-text lookup is purely local | No `fetch()` call in `crosstext.js` body (only SQLite reads via existing OPFS helpers). | Static grep. |
| No telemetry on word lookups | `crosstext.js` does NOT call `v3OpfsTelemetryPush`. | Static grep. |
| k-anonymity gate per-cohort respected | Compare view never reveals any cohort's per-student data, regardless of k-met state. | Smoke case 5 + 8 in §11.1. |
| Researcher tokens never logged | `teacher.js` doesn't `console.log` the token. Build artifacts (CSVs) don't contain tokens. | Static grep. |
| OTP / link CLI scope unchanged | No A3 UI work in this patch. | Source diff. |
| HE consent template untouched | `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` not in diff. | `git diff --name-only`. |

---

## 13. Patch sequence

**Single patch: v3.3.2.** Both directions ship together (matches plan §4 sequencing). Within the patch, commits are ordered to allow `git bisect` to point at any specific feature.

| Commit | Subject | Approx. lines | Smoke status after |
|---|---|---|---|
| C1 | `feat(morph): CrossText lookup service (D15)` | +400 | `smoke:morph:crosstext` 5/8 (some cases need UI commit) |
| C2 | `feat(morph): CrossText side-panel UI (D15)` | +500 | `smoke:morph:crosstext` 8/8 |
| C3 | `feat(research): teacher dashboard localStorage v2 migration (D12)` | +200 | `teacher-smoke` 14/14 stays green; new "legacy migration" case +1 |
| C4 | `feat(research): teacher dashboard chip strip + bulk paste (D12)` | +400 | `teacher-multicohort-smoke` cases 1-4 green |
| C5 | `feat(research): teacher dashboard "All cohorts" compare view (D12)` | +500 | cases 5, 7, 8 green |
| C6 | `feat(research): teacher dashboard cross_cohort CSV export (D12)` | +150 | case 7 still green; +visual regression PNGs |
| C7 | `test(research): teacher-multicohort-smoke.js + visual captures` | +400 | `teacher-multicohort-smoke` 12/12 green |
| C8 | `docs(research): RESEARCHER_GUIDE §5 multicohort + §6 cross-text` | +120 | docs only |
| C9 | `i18n: +12 keys × 3 locales for cross-text panel` | +90 | UI labels final |
| C10 | `chore(release): v3.3.2 — bump package.json + CHANGELOG` | +60 | full smoke matrix re-run; 166/166 green |
| Tag | `git tag -a v3.3.2 -m "..."` | — | release surface |
| Release | `gh release create v3.3.2` | — | public artifact |

**Total estimated change:** ~2400 LOC across ~12 files + 2 new smoke runners + 2 new modules + i18n × 3.

**Wall-clock estimate:** 14-16 days for a single developer (D15 ~5 d + D12 ~11 d, allowing for ~1-2 day buffer per direction for QA + docs + i18n + smoke authoring). Matches the v3.3 master plan §4 estimate (~16 d).

---

## 14. Definition of Done

### Per direction

**D15 — Cross-text hub is Done when:**
- [ ] `window.CrossText.findOccurrences()` API matches §8.1 surface.
- [ ] Index build on 100-text fixture completes in ≤ 600 ms.
- [ ] Cache hit returns in ≤ 30 ms.
- [ ] Niqqud-insensitive lookup confirmed (smoke case 2).
- [ ] `includeRoot` produces a strict superset of `includeRoot=false` (smoke case 3).
- [ ] Side-panel renders for desktop + mobile viewports; keyboard nav works (`Esc`/`↑↓`/`Enter`).
- [ ] Click-through navigation lands at the matched sentence with a brief highlight.
- [ ] `MorphNormalize` is the single normalization point (no `toLowerCase` or ad-hoc unicode munging in `crosstext.js`).
- [ ] No `fetch()` calls in `crosstext.js`. No event emission. No telemetry of word content.
- [ ] 8 smoke cases green. 2 visual regression PNGs captured.
- [ ] `RESEARCHER_GUIDE §6 Cross-text hub` paragraph authored.

**D12 — Multicohort dashboard is Done when:**
- [ ] Bulk paste parses tolerantly; line-numbered error reporting works (smoke case 2).
- [ ] Legacy v1 keys auto-migrate on first boot; v1 keys are removed after migration (smoke case 10).
- [ ] Chip strip respects max-6-visible rule with overflow dropdown (visual regression).
- [ ] "🌐 All cohorts" view renders side-by-side summary tiles + overlaid charts.
- [ ] Per-student data is hidden in compare view regardless of any cohort's k-status (smoke case 5 + 8 + privacy checklist §12).
- [ ] `cross_cohort_aggregates.csv` schema matches §6 exactly; sorted; long-format; cohort-wide only.
- [ ] Per-cohort fetch failures degrade gracefully (smoke case 11).
- [ ] Existing 14 single-cohort smoke cases stay green (smoke case 12).
- [ ] 12 multicohort smoke cases green + 3 visual regression PNGs.
- [ ] `RESEARCHER_GUIDE §5.4 Multicohort mode` paragraph authored.

### Cycle-wide

**v3.3.2 patch ships when:**
- [ ] All §11 smoke matrix green (166 cases + 14 PNGs).
- [ ] Privacy checklist §12 walked end-to-end by reviewer; no `[ ]` left unticked.
- [ ] `CHANGELOG.md` `[Unreleased]` collapsed to `[3.3.2] — YYYY-MM-DD`; entry explicitly states "no new collected fields / no CONSENT_VERSION bump / no new endpoints".
- [ ] `package.json` version bumped to `3.3.2`.
- [ ] Annotated tag `v3.3.2` pushed.
- [ ] `gh release create v3.3.2` published with notes (template mirroring v3.3.1).
- [ ] Memory updates: `project_v3_3_backlog.md` patch row marked ✅ shipped.

---

## 15. Commit plan

```
v3.3.1 ────► C1 ──► C2 ──► C3 ──► C4 ──► C5 ──► C6 ──► C7 ──► C8 ──► C9 ──► C10 ──► tag v3.3.2

C1  feat(morph): CrossText lookup service (D15 server)
    + public/js/crosstext.js (~400 LOC)
    + scripts/morph/crosstext-smoke.js (initial 5 cases — service-level)

C2  feat(morph): CrossText side-panel UI (D15 client)
    + public/js/crosstext-ui.js (~500 LOC)
    + public/index.html (button injection in word_study form)
    + i18n keys × 3 locales (deferred to C9 — placeholder copy here)
    + crosstext-smoke.js extended to 8 cases (UI-level cases)

C3  feat(research): teacher dashboard localStorage v2 migration (D12 storage layer)
    + public/js/teacher.js (LS schema swap, migration function, defensive boot)
    + public/teacher.html (header skeleton — chip strip empty, no UX yet)
    Existing teacher-smoke 14/14 stays green; +1 new case: legacy migration.

C4  feat(research): teacher dashboard chip strip + bulk paste (D12 input layer)
    + public/teacher.html (textarea + collapsible single-pair form)
    + public/js/teacher.js (parser, concurrent fetch, chip rendering, switch handler)
    teacher-multicohort-smoke cases 1-4 + 6 + 11 green.

C5  feat(research): teacher dashboard "All cohorts" compare view (D12 view layer)
    + public/js/teacher.js (compare view renderer, color hash, overlaid SVG charts)
    cases 5 + 8 green.

C6  feat(research): teacher dashboard cross_cohort CSV export (D12 export layer)
    + public/js/teacher.js (cross-cohort CSV builder, button wiring)
    + public/teacher.html (new ⬇ Cross-cohort CSV button)
    case 7 green.

C7  test(research): teacher-multicohort-smoke.js + 3 visual regression PNGs
    + scripts/research/teacher-multicohort-smoke.js (~350 LOC)
    + scripts/research/teacher-screenshots.js update (+3 PNGs)
    + scripts/research/all-smoke.js wires the new suite
    + package.json adds smoke:research:teacher:multi shortcut
    Full smoke matrix 166/166 green.

C8  docs(research): RESEARCHER_GUIDE §5.4 multicohort + §6 cross-text
    + docs/RESEARCHER_GUIDE.md
    docs-only.

C9  i18n: +12 keys × 3 locales for cross-text panel
    + public/i18n/locales/{ru,en,he}.js (~36 entries total)
    UI labels finalized; replaces C2 placeholders.

C10 chore(release): v3.3.2 — bump + CHANGELOG
    + package.json 3.3.1 → 3.3.2
    + CHANGELOG.md [Unreleased] → [3.3.2] — YYYY-MM-DD
    + memory updates after merge

Tag: git tag -a v3.3.2 -m "v3.3.2 — Direction 12 multicohort + Direction 15 cross-text"
Push: git push origin main v3.3.2
Release: gh release create v3.3.2 --title "..." --notes-file Smoke-check/release-notes-v3.3.2.md --latest
```

Each commit is independently green on the smoke matrix it claims (per the "Smoke status after" column in §13). `git bisect` between v3.3.1 and v3.3.2 will land on a logically self-contained increment.

---

## 16. Approval gate

This document is the **proposed phase plan**. Before C1 implementation kicks off:

1. User reviews end-to-end.
2. User confirms or rebuts each §-level decision.
3. User answers any specific clarifications (§17 below if any open questions remain).
4. C1 commit opens v3.3.2 development on a feature branch `feat/v3.3.2-multicohort-crosstext`.
5. Final merge to `main` follows the same end-of-patch quality gate as v3.3.0 + v3.3.1.

---

## 17. Open clarifications (default behaviors assumed)

These small decisions are pre-filled with defaults; the user can rebut any of them before C1:

| ID | Question | Default |
|---|---|---|
| Q1 | Should bulk-paste accept Markdown table format (e.g. \| code \| token \|)? | **No** — pure space/tab separation only; password-manager dumps are the primary input source and they're whitespace-delimited. |
| Q2 | Cohort nickname / alias field — included in v3.3.2 or v3.3.3+? | **v3.3.3 backlog** — keep schema field but UI for editing is deferred. |
| Q3 | Should the "🌐 All cohorts" view persist across reloads, or always default to first cohort on boot? | **Persist** via `teacherDashActiveView_v2`. |
| Q4 | When a cohort fetch fails, retry automatically? | **Manual only** via refresh button. Auto-retry would mask token-rotation events. |
| Q5 | Cross-text panel: animate slide-in on desktop? | **Yes**, 200 ms ease-out. Respects `prefers-reduced-motion`. |
| Q6 | Cross-text: support cross-text "find in current text only" mode? | **No** — that's what the existing IDE Search tab already does (`grep public/index.html '"v3-ide-tab-icon">🔍'`). Cross-text is explicitly **other** texts. |
| Q7 | Cross-text snippet length | **80 chars (40 before + 40 after match)**, with ellipsis if truncated. |
| Q8 | Cross-text result cap | **200 occurrences per query**; UI shows a banner if capped. |
| Q9 | Visual regression PNGs gitignored or committed? | Same convention as existing `Smoke-check/teacher-dashboard/<ts>/` — gitignored, captured ephemerally per run; PNGs committed only as baselines via `git add -f` when explicitly requested. |

—  *signed,* draft prepared by Claude Opus 4.7 (1M context) on 2026-05-14.
