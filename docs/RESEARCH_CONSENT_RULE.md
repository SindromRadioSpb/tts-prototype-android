# Research Consent — Material Change Rule

> **Closes:** [`ULPAN_RESEARCH_PLAN_v3_2.md`](ULPAN_RESEARCH_PLAN_v3_2.md) §14 Q2.
> **Status:** authoritative decision tree for whether a change to
> `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` requires a `CONSENT_VERSION`
> bump (which forces all participants to re-consent on their next
> session).
>
> **Authored:** 2026-05-14 (v3.3.1, Workstream A4).
> **Anchor:** `public/js/research.js` constant `CONSENT_VERSION` and the
> `needsReconsent()` semver-comparison guard.

---

## 1. Why this matters

Informed consent is a contractual statement: the participant agreed to
let LinguistPro collect *specific* metrics under *specific* retention
rules, using *specific* anonymity guarantees. Changing the substance of
that statement after the participant clicked "Я согласен(на)" without
asking again violates the contract.

But not every edit is a substantive change — typo fixes, clarification
of phrasing, even reordering paragraphs may leave the contractual
meaning intact. Forcing re-consent on every cosmetic edit creates
prompt fatigue and erodes trust ("why is it asking me again?"). So we
need an objective rule for telling them apart.

This document is that rule. It is the official answer to
ULPAN_RESEARCH_PLAN §14 Q2 ("re-consent on consent_version change —
when?").

---

## 2. Decision tree

For every PR that modifies `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`,
the reviewer walks this tree before merge:

```
┌──────────────────────────────────────────────────────────────────────┐
│ START                                                                │
│   |                                                                  │
│   ▼                                                                  │
│ Q1. Does the edit ADD a metric the participant didn't consent to,    │
│     OR REMOVE / WEAKEN a privacy guarantee they did consent to?      │
│   ├── YES → CONSENT_VERSION bump (major: 1.0 → 1.1)                  │
│   └── NO  → continue                                                 │
│                                                                      │
│ Q2. Does the edit extend the data retention window beyond what       │
│     was originally agreed (e.g. "2 years post-cohort" → "5 years")?  │
│   ├── YES → CONSENT_VERSION bump (major)                             │
│   └── NO  → continue                                                 │
│                                                                      │
│ Q3. Does the edit expand WHO has access to the data (new researcher, │
│     new third-party, new institution)?                               │
│   ├── YES → CONSENT_VERSION bump (major)                             │
│   └── NO  → continue                                                 │
│                                                                      │
│ Q4. Does the edit change the WITHDRAWAL mechanism, the CONTACT       │
│     details for raising privacy concerns, or the k-anonymity         │
│     threshold?                                                       │
│   ├── YES → CONSENT_VERSION bump (minor: 1.0 → 1.0.1)                │
│   └── NO  → continue                                                 │
│                                                                      │
│ Q5. Is the edit ONLY: typo fixes, grammar, phrasing-equivalent       │
│     rewording, paragraph reordering, formatting, adding a help link, │
│     translating an already-approved section to a new locale?         │
│   ├── YES → NO bump. Edit ships freely.                              │
│   └── NO  → If you reached here you're in a grey area; default       │
│             to a minor bump and call it out in the PR description.   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Material-change taxonomy

A **material change** is anything that, if a participant noticed it,
might reasonably make them want to revoke consent. Concretely:

| Type | Material? | Bump |
|---|---|---|
| Adding a new metric to "what we collect" | ✅ Yes | major |
| Removing a metric (we stop collecting it) | ❌ No | none (could even be cosmetic per Q1: privacy improves) |
| Extending retention | ✅ Yes | major |
| Shortening retention | ❌ No | none (privacy improves) |
| New researcher / collaborator with data access | ✅ Yes | major |
| Researcher leaves, no replacement | ❌ No | none (privacy improves) |
| New third-party processor (e.g. switching from Railway to AWS) | ✅ Yes | major (if location/jurisdiction changes) OR minor (if same jurisdiction, same access rules) |
| Changing the k-anonymity threshold (5 → 3) | ✅ Yes | minor |
| Changing the withdrawal UX flow (e.g. moving from one-click to two-click) | ⚠ Borderline | minor — bump |
| Changing where the "Contact" email goes | ⚠ Borderline | minor — bump |
| Changing the wording of an example to be clearer | ❌ No | none |
| Fixing a typo | ❌ No | none |
| Reordering paragraphs without changing meaning | ❌ No | none |
| Adding a new language version of an already-approved section | ❌ No | none (we treat translation as a no-op IF the source was already consent-approved) |
| Adding a NEW informational section that wasn't there before | ⚠ Borderline | minor IF the new section adds protections; major IF it weakens any |

---

## 4. Versioning scheme

```
CONSENT_VERSION : <major>.<minor>[.<patch>]
                  └── current: 1.0

major bump: substantively changes WHAT is collected, FOR HOW LONG,
            or WHO can see it. Forces re-consent.
minor bump: changes how participants withdraw, who to contact, or other
            non-collection mechanics. Forces re-consent.
patch bump: reserved for emergency clarifications that don't change
            anything substantive. Does NOT force re-consent (still
            stored alongside the consent timestamp for audit).
```

`research.js` compares stored `researchConsentVersion_v1` against the
current `CONSENT_VERSION` constant using `compareSemver`. Any positive
difference (stored < current) triggers `needsReconsent() === true`.

For a **patch bump** that should NOT trigger re-consent, the comparison
must be tolerant of patch differences. The current `compareSemver` in
`research.js` already treats `1.0` < `1.0.1` as a forcing condition;
patch-level tolerance would require a small additional `if (storedMajorMinor === currentMajorMinor) return 0;` branch. **This is not implemented in v3.3.x**. Until then, treat any version bump as forcing.

---

## 5. Procedural checklist (for the reviewer)

When you receive a PR that touches `RESEARCH_ETHICS_CONSENT_TEMPLATE.md`:

1. Walk §2 decision tree on the diff.
2. Categorize the change in the §3 taxonomy.
3. If a bump is required:
   - In the same PR, update `CONSENT_VERSION` in `public/js/research.js`.
   - In the same PR, add a `[3.x.y] — YYYY-MM-DD` entry in `CHANGELOG.md`
     stating the bump explicitly: *"`CONSENT_VERSION` bumped to X.Y;
     all participants will re-consent on next session."*
   - Verify `research/validate.js` `consent_version_minimum` for at
     least one production cohort allows the new version (typically
     this means leaving it at "1.0" so older bumped versions still
     accept; only raise minimum if a cohort wants to enforce only
     post-bump consent).
4. If no bump is required:
   - Add a `[Unreleased]` doc entry explicitly stating *"consent
     template edit; no `CONSENT_VERSION` bump"*.

This keeps the audit trail explicit at every step. Future researchers
reviewing the consent history can see exactly which edits were
considered material.

---

## 6. Worked examples

### Example A — material change (major bump)

> *PR diff: adds "device locale (e.g. ru-RU)" to the "what we collect"
> list because Phase 11.0.X started emitting it.*

- Q1: YES (adding metric → material).
- Verdict: **major bump**. `CONSENT_VERSION = '1.1'`.
- All participants re-consent on next session. Existing aggregates remain
  valid (they were collected under 1.0 consent which covered everything
  except device locale; the locale metric only starts collecting after
  the bump).

### Example B — cosmetic edit (no bump)

> *PR diff: reword "Active minutes (heartbeat-tracked, excluding idle)"
> → "Active minutes (heartbeat-derived; idle is excluded)". Meaning
> identical.*

- Q1-Q5: NO on all.
- Verdict: **no bump**. `CHANGELOG.md` notes "wording polish, no
  consent_version bump".

### Example C — borderline (minor bump)

> *PR diff: changes the privacy contact email from `pi@university.edu`
> to `pi-research@university.edu`.*

- Q1-Q3: NO. Q4: YES (contact mechanism changed).
- Verdict: **minor bump**. `CONSENT_VERSION = '1.0.1'`. Participants
  re-consent.

### Example D — pure UX (no bump)

> *PR diff: changes the WITHDRAW UX label from "🗑 Отозвать согласие"
> to "🗑 Withdraw consent" (i18n). Underlying flow identical.*

- Q1-Q5: NO. Translation of approved content is the §3 "translating an
  already-approved section to a new locale" entry.
- Verdict: **no bump**.

### Example E — calibrated diagnostic quiz fields (v3.3.5 audit)

> *Diff: adds five new fields under `metrics.outcome.*`:*
> - *`quiz_score_normalized`: number 0-100*
> - *`quiz_cefr_band`: enum A1/A2/B1/B2/C1*
> - *`quiz_se`: standard error*
> - *`quiz_completed_at`: ISO day*
> - *`quiz_version`: instrument identifier string*
>
> *Plus extends `outcome_capture_method` enum with `"calibrated-quiz"` value.*

This was a non-trivial walk through the decision tree. Verdict reached by going field-by-field:

| Field | Q1 (new metric?) | Q2-Q4 (other material?) | Verdict |
|---|---|---|---|
| `quiz_score_normalized` | **NO** — same kind of measurement (exam score) as the existing `post_test_score`, just measured by a different instrument. Same `0-100` scale. Consent §3.2 #3 already covers «итоговый балл экзамена» as opt-in. | NO | **No bump** |
| `quiz_cefr_band` | **NO** — derived classification of the score (deterministic linear bucket mapping). Not a separately-collected datum; it's a presentation of `quiz_score_normalized`. | NO | **No bump** |
| `quiz_se` | **NO** — metadata about HOW WELL the measurement was made, not WHAT was measured about the student. Same category as "this question's answer is uncertain" annotations on the score. | NO | **No bump** |
| `quiz_completed_at` | **NO** under condition that granularity is **ISO day** (matches existing `upload_ts` convention; consent §3.2 #6 ✗ "точное время суток ваших действий" is preserved by day-level only). Sub-day would be a material change. | NO | **No bump (conditional)** |
| `quiz_version` | **NO** — metadata about the measurement instrument, not user data. | NO | **No bump** |
| `outcome_capture_method = "calibrated-quiz"` (new enum value) | **NO** — categorization of HOW the score was captured. Self-report and teacher-csv already enumerated; this adds a third capture mechanism for the same kind of score. | NO | **No bump** |

**Enforced conditions** (without which the audit would conclude differently):

1. `quiz_completed_at` MUST be ISO day. The server validator REJECTS sub-day timestamps (validate.js v3.3.5 diff enforces `DATE_ISO_DAY_RE`).
2. `quiz_score_normalized` MUST be on the same `0-100` scale as `post_test_score`.
3. `quiz_cefr_band` is documented as **derived presentation** in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` — researchers cannot rely on it as a separately-captured measurement.
4. The consent template gets a **cosmetic edit** (per Q5 wording polish) to surface the quiz as an alternative outcome path:
   ```
   §3.2 #3: Опционально: поделиться вашим итоговым баллом экзамена
            в конце курса (через self-report ИЛИ через встроенную
            калибровочную диагностику) для корреляционного анализа.
   ```
   This edit ships in v3.3.5 C0 alongside this audit example. It's a wording change that does not alter the substantive content of what's collected, so per §3 taxonomy ("Changing the wording of an example to be clearer") it's **no bump**.

**Verdict:** **No `CONSENT_VERSION` bump under conditions 1-4 enforced.**

If any of conditions 1-4 fails (e.g. someone reverts the consent template edit, or the validator drift allows sub-day timestamps), the audit conclusion flips to **minor bump (1.0 → 1.0.1)**. The v3.3.5 phase plan §16 DoD requires smoke assertions pinning all four conditions to catch any drift in CI.

**Sign-off:** v3.3.5 phase plan author signed off this audit on 2026-05-15 (commit C0 anchor). Reviewer of consent template edit (the eventual HE/RU/EN native speaker per `HE_CONSENT_REVIEW_BRIEF.md`) should re-confirm during their review.

---

## 7. Cross-references

- Wire enforcement: `public/js/research.js` constant `CONSENT_VERSION` +
  `needsReconsent()` helper.
- Server-side: `research/validate.js` checks `consent_version` against
  `cohort_meta.consent_version_minimum` (currently set to 1.0 at cohort
  provision; raised only if a cohort wants to require participants to
  have re-consented after a specific bump).
- HE consent template review: see [`HE_CONSENT_REVIEW_BRIEF.md`](HE_CONSENT_REVIEW_BRIEF.md) — any HE translation that drifts in meaning from RU canonical follows the same rule.
- Master plan reference: `PREMIUM_RELEASE_PLAN_v3_3.md §3 D16-A4`.
- Closes: `ULPAN_RESEARCH_PLAN_v3_2.md §14 Q2`.
