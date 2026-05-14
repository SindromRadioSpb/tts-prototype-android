# v3.3.5 — Pre-Deployment Gate Status

> **Status:** CLOSED 2026-05-15 — project-owner provisional sign-off accepted (gate-for-development purpose). External ulpan-teacher review **remains RECOMMENDED before real-cohort launch** but no longer BLOCKS code, planning, or v3.3.6 kickoff.
> **What changed.** Original posture (frozen 2026-05-15, earlier the same day): the gate blocked real-cohort deployment AND new runtime feature work until external sign-off arrived. User decision 2026-05-15 (later same day): the user is the project owner + diploma researcher and accepts the AI-pre-reviewed bank as good-enough for development + dogfood + v3.3.6 unblocking. The pre-cohort-launch reviewer step survives as a soft caveat (see §5 closure record + §7 pre-launch checklist) rather than as a hard code gate.
> **What is still pinned.** `public/quiz/ulpan_diagnostic_v1.json` `validity_notes.known_limitations` carries an explicit PRE-LAUNCH entry naming the dispatch package + the six reviewer dimensions. `production_ready` field at JSON top-level reads `"development_and_dogfood_only"` until external review records change it. So the soft gate is visible to anyone reading the instrument JSON, not just buried in docs.

This document is the **single source of truth** for closing the gate. Future sessions (or future-me) read this top-to-bottom to resume exactly where we left off when reviewer feedback arrives.

---

## 1. What is already done

### 1.1 Code shipped on main

| Component | Path | Smoke |
|---|---|---|
| Item bank JSON | `public/quiz/ulpan_diagnostic_v1.json` | `scripts/quiz/bank-validate-smoke.js` (8 cases) |
| Rasch 1PL scoring engine | `public/js/quiz-scoring.js` | `scripts/quiz/scoring-smoke.js` (6 cases) |
| Reference fixture + generator | `scripts/quiz/__fixtures__/mirt-reference.json` + `scripts/quiz/generate-mirt-fixture.js` | (same scoring smoke) |
| External R cross-check | `scripts/quiz/validate-against-mirt.R` | (operator-run, not in smoke matrix) |
| UI modal + i18n | `public/js/quiz-ui.js` + `public/i18n/locales/{ru,en,he}.js` | `scripts/quiz/ui-smoke.js` (8 cases) |
| Privacy hardening | (LS state + payload contract pinned) | `scripts/quiz/privacy-smoke.js` (5 cases) |
| Client submit API | `public/js/research.js` (`submitQuizOutcome`) | `scripts/quiz/client-submit-smoke.js` (8 cases) |
| Server validator | `research/validate.js` (outcome schema extension) | `scripts/research/quiz-validator-smoke.js` (7 cases) |
| Teacher dashboard columns | `public/js/teacher.js` + `research/storage.js` (merge) | `scripts/research/teacher-quiz-smoke.js` (3 cases) |
| Admin reset CLI | `scripts/research/reset_quiz_for_student.js` | `scripts/research/quiz-reset-cli-smoke.js` (6 cases) |

### 1.2 Docs shipped on main

- `docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md` — full phase plan (17 sections, hard constraints, smoke matrix, commit sequence C0–C12)
- `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` — methodology + privacy invariants + audit log + consent posture
- `docs/RESEARCHER_GUIDE.md` §4.3 — third outcome path (operator guide)
- `docs/RESEARCH_METRICS_SCHEMA.md` §8 — wire shape addition
- `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` §3.2 #3 — cosmetic edit (calibrated quiz mention)
- `docs/RESEARCH_CONSENT_RULE.md` — Example E (calibrated-quiz coverage audit, NO bump)

### 1.3 Dispatch package shipped on main (2026-05-15, `681f06a`)

- `docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` v1.1 — revised to reflect shipped state, §0 explains what reviewer's sign-off unlocks
- `docs/QUIZ_ITEM_BANK_DRAFT.md` — canonical markdown source (Premium-alt content, 20 items)
- `docs/QUIZ_ITEM_BANK_REVIEWER_FORM.md` — fillable form (6-dimension checklist × 20 items + distribution + caveats + sign-off)
- `docs/QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md` — historical AI pre-review notes (supplementary)

### 1.4 Release artifacts

- main HEAD at gate-freeze time: see `git log --oneline -1` — current `git rev-parse HEAD`
- Tag `v3.3.5` pushed
- GitHub release: https://github.com/SindromRadioSpb/tts-prototype-android/releases/tag/v3.3.5
- Smoke matrix at release: **18 suites · 248 cases · ALL GREEN**

### 1.5 Decisions locked

- `CONSENT_VERSION` stays at `1.0` (Example E audit — four conditions hold)
- No new `/api/research/v1/*` endpoints (hard constraint)
- Teacher CSV remains authoritative for `post_test_score`; quiz fields preserved on merge (not replace)
- AI pre-review used as development-phase substitute for external sign-off
- Premium-alt draft adopted as canonical bank content (rejected the v0 draft)
- `instrument_id = "ulpan_diagnostic_v1"` (will bump if reviewer changes items materially)

---

## 2. What remains — external work

**Only one item is pending, and it is OUTSIDE my reach.**

The ulpan teacher must:
1. Receive the dispatch package (three .md files attached via email/WhatsApp/Telegram).
2. Read the 20 items in `QUIZ_ITEM_BANK_DRAFT.md`.
3. Fill in the response form `QUIZ_ITEM_BANK_REVIEWER_FORM.md` (any of the four return formats in brief §4).
4. Return the form to the project author.

There is **no time pressure**. The form supports partial review — even Q01–Q05 reviewed is useful. The form supports any of four return formats, so reviewer can use whatever channel works.

**What the user (project owner) must do:**

- [ ] Send the dispatch package to the reviewer.
- [ ] Track the conversation (no automated reminder system in place).
- [ ] When the form returns: hand it to me (paste contents into the chat, or drop the file path in the repo).

That's it on the human side. The rest is mechanical.

---

## 3. Resume checklist — when reviewer feedback arrives

When feedback returns, execute these steps in order. Each step is atomic and re-runnable.

### Step 3.1 — Stash the reviewer's response

Put the returned form at:

```
docs/external/QUIZ_ITEM_BANK_REVIEWER_RESPONSE_<YYYY-MM-DD>.md
```

(Create `docs/external/` if it doesn't exist; it's a stash dir, not a published doc.) If the reviewer used a different format (PR / Word / chat comments), convert into this canonical filename so the audit log has a single artifact to reference.

### Step 3.2 — Triage feedback severity

Read the form and classify each item's notes into one of:

| Severity | Threshold | Action |
|---|---|---|
| **Cosmetic** | Replaces 0 items, adjusts 0–3 difficulty_logits within ± 0.3 | Apply edits, no `instrument_id` bump |
| **Refinement** | Replaces 0 items, adjusts > 3 difficulty_logits OR any single shift > 0.3 | Apply edits, bump `calibrated_at` only, keep `instrument_id=v1` |
| **Material** | Replaces ≥ 1 item OR shifts CEFR band of any item | Apply edits, bump `instrument_id` to `ulpan_diagnostic_v1.1` |

The triage shapes how much downstream work follows. **Cosmetic** is fastest; **Material** triggers the full re-validation + re-release cycle.

### Step 3.3 — Apply edits to the canonical markdown source

Edit `docs/QUIZ_ITEM_BANK_DRAFT.md` (and **only that file** at this step — JSON regeneration happens in Step 3.4). Preserve the reviewer's wording verbatim where they wrote replacement items; do not re-engineer.

If the reviewer adjusted `difficulty_logit` placeholders, update them in the draft markdown too (per-item "Difficulty (logit, draft)" line).

If the reviewer added/removed validity caveats, update `validity_notes.known_limitations` (currently lives in the JSON, but mirror in the draft markdown too so they stay in sync).

### Step 3.4 — Regenerate the canonical JSON

`scripts/quiz/draft-to-json.js` was a planned tool that never shipped (premium-alt adoption merged the draft → JSON in one manual step). Two options:

**Option A** (preferred for **Cosmetic** + **Refinement** changes) — manually edit `public/quiz/ulpan_diagnostic_v1.json` to reflect the markdown changes. Faster, fewer moving parts.

**Option B** (preferred for **Material** changes — replacements of full items) — write `scripts/quiz/draft-to-json.js` first as a one-shot, then run it. Justified investment when many items change.

Either way, after edits update:

- `calibrated_at` — bump to today's date
- `calibration_method` — append the reviewer pass (e.g. `"expert_judgement_v1 + ulpan-teacher review 2026-MM-DD"`)
- `validity_notes.calibration_source` — append `"+ domain-expert sign-off"` if reviewer fully approved
- `instrument_id` — bump to `v1.1` ONLY if severity is **Material** (per Step 3.2)

### Step 3.5 — Re-run schema validator

```bash
npm run quiz:validate
```

Must exit 0. If it fails, fix the JSON before proceeding (most likely cause after manual edits: distribution drift, missing locale, malformed option ids).

### Step 3.6 — Regenerate the mirt reference fixture (only if logits changed)

```bash
npm run quiz:regen-fixture
```

This is deterministic (seeded PRNG) so it produces a byte-identical fixture across runs — what changes is the `bank_item_difficulties` block reflecting the new logits. Skip this step if no logits changed.

### Step 3.7 — Re-run the full smoke matrix

```bash
npm run smoke:research:fast
```

Must report `[all-smoke] ALL GREEN ✓` with **18 suites, 248 cases**.

If anything fails, diagnose before continuing. Common after-edit failures and their causes:

| Failure | Likely cause |
|---|---|
| `bank-validate-smoke` fails | Distribution drift (need 4/4/5/4/3), option-id collision, missing locale |
| `scoring-smoke` case 6 fails (correlation) | Fixture not regenerated after logit changes — run `quiz:regen-fixture` |
| `quiz-validator-smoke` fails | Server-side `research/validate.js` regex must match `^[a-z0-9_]+_v\d+$` — if `instrument_id` bumped to `v1.1`, that's still fine (digits part allows `1.1`? **NO** — the regex is `_v\d+$` which only allows digits, no dots). If bumping to `v1.1` is needed, also update the regex to `_v\d+(\.\d+)?$`. Decision point. |
| `teacher-quiz-smoke` fails | Storage merge logic regressed — check that quiz fields are preserved on teacher CSV merge |
| `ui-smoke` fails | i18n key collision, modal stacking issue (Phase 6 / Onboarding dismissal still wired correctly?) |

### Step 3.8 — Re-run consent audit (Example E)

Open `docs/RESEARCH_CONSENT_RULE.md` Example E. Re-verify that all four conditions still hold after the edits:

1. `quiz_completed_at` ISO day — still enforced server-side ✓ (no change in this PR)
2. `quiz_score_normalized` 0–100 scale — still enforced server-side ✓ (no change unless reviewer asked for scale change, which would be Material)
3. `quiz_cefr_band` as derived presentation — still true ✓ (band definitions might have changed if reviewer altered the [0,19]/[20,39]/etc boundaries; that's Material → revisit)
4. Consent template §3.2 #3 still mentions the calibrated-quiz alternative — yes ✓

**If any condition fails, BUMP `CONSENT_VERSION`** from `1.0` → `1.1`:

- Edit `public/js/research.js` `CONSENT_VERSION` constant
- Update `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` header (`Version: 1.1`)
- Update `docs/RESEARCH_CONSENT_RULE.md` Example E conclusion to record the trigger
- Re-deploy consent template + force reconsent on all existing opted-in students (existing flow in `research.js` handles this via `needsReconsent()`)

This is the **only** consent-related branch that requires more than a doc edit. All other reviewer outcomes leave `CONSENT_VERSION` at `1.0`.

### Step 3.9 — Record sign-off in calibration audit log

Open `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` §5 (Calibration audit log). Add a new row:

```markdown
| YYYY-MM-DD | External reviewer sign-off | <reviewer attribution per their preference> reviewed all 20 items. <N> modified, <N> replaced. Bank approved for production v1<.1 if material>. Severity: <Cosmetic|Refinement|Material>. |
```

Use the reviewer's chosen attribution form (named / initials / generic / anonymous) from their reviewer-form §"Reviewer identity" entry.

### Step 3.10 — Update gate status doc (this file)

Change the **Status** line at the top of this doc:

```
> **Status:** CLOSED — sign-off received YYYY-MM-DD; ulpan_diagnostic_v1 production-ready.
```

Add a section §5 "Closure record" at the bottom with:
- Reviewer attribution (per their preference)
- Date of sign-off
- Severity classification
- Path to the stashed reviewer response file
- Path to the closing commit (filled in after the commit lands)
- Confirmation that all four Example E conditions held (or that `CONSENT_VERSION` bumped)
- Production-ready flag set on `ulpan_diagnostic_v1` (or `v1.1` if bumped)

### Step 3.11 — Commit the closure

```bash
git add docs/QUIZ_ITEM_BANK_DRAFT.md \
        docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md \
        docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md \
        public/quiz/ulpan_diagnostic_v1.json \
        scripts/quiz/__fixtures__/mirt-reference.json \
        docs/external/QUIZ_ITEM_BANK_REVIEWER_RESPONSE_<date>.md
        # + research/validate.js + locales if instrument_id changed
        # + public/js/research.js if CONSENT_VERSION bumped
        # + docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md if cosmetic edits
git commit -m "docs(quiz): close v3.3.5 pre-deployment gate — external reviewer sign-off

<short summary of severity + N modified + N replaced + sign-off attribution>

Smoke matrix: 248/248 ALL GREEN.
Consent audit Example E: <4/4 conditions hold | CONSENT_VERSION bumped to 1.1>.
ulpan_diagnostic_v<1|1.1> marked production-ready for real-cohort deployment.
"
git push origin main
```

If `instrument_id` bumped to `v1.1`, also tag the closure:

```bash
git tag -a v3.3.5-bank-v1.1 -m "Bank revision after external reviewer sign-off"
git push origin v3.3.5-bank-v1.1
```

No GitHub release needed — this is a quiet closure, not a new feature.

### Step 3.12 — Update memory

Edit `memory/project_v3_3_5_predeployment_gate.md` to reflect closure:

- Change description from "BLOCKED until external sign-off" to "CLOSED YYYY-MM-DD — instrument production-ready"
- Update body to summarize the closure (severity, reviewer attribution, any CONSENT_VERSION decision)

Update `memory/MEMORY.md` one-line hook accordingly.

### Step 3.13 — Notify and unblock downstream

Tell the user: "Gate closed. v3.3.6 (M8 knowledge-graph view) and any other new-runtime-feature work that was waiting on this is now unblocked."

If real-cohort deployment is imminent, also remind: re-verify that the production server is on the latest main, and that the cohort being deployed to has `cohort_meta.json` with `k_anonymity_threshold: 5` (default) — the quiz path inherits that threshold.

---

## 4. Decision points the reviewer might trigger

Things to think through if/when reviewer feedback comes back with these flavors:

### 4.1 Reviewer wants to change CEFR band of an item

This is **Material** (per Step 3.2 triage). Triggers:
- Distribution might shift away from 4/4/5/4/3 — must rebalance by promoting/demoting another item
- Monotonic-difficulty invariant must still hold across bands
- Re-run `quiz-validator-smoke` AND `scoring-smoke` (the latter validates monotonicity)
- Bump `instrument_id`

### 4.2 Reviewer wants to change the scoring scale (not 0–100)

This is **Material AND consent-affecting**. Triggers:
- `CONSENT_VERSION` bump (Example E condition #2 fails)
- Server validator range update in `research/validate.js`
- Teacher dashboard column re-format
- Reverse mapping snippet in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` re-derive
- Existing self-report `post_test_score` is on 0–100; a different scale for quiz means dashboards can't render them in the same column

If reviewer suggests this, **push back first** — different scales make teacher CSV vs quiz hard to compare. If the rationale is strong, escalate to the user for explicit approval before applying.

### 4.3 Reviewer wants the quiz to support listening / speaking / writing

This is **out of scope for v3.3.5**. Defer to v3.4+ per phase plan §2 "What this instrument doesn't cover". Document in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` §6 future work, no code change for now.

### 4.4 Reviewer wants > 20 items (a longer test)

This is **Material**. Triggers:
- Build validator must update `REQUIRED_DISTRIBUTION`
- Smoke case 1 (exactly 20 items) must update
- UI progress label format ("Q X / 20") works dynamically already
- Scoring engine works on any N items
- Time-cost on respondents grows; user-facing UX should warn if N > 25

If reviewer suggests this, **push back first** — longer tests get worse completion rates. 20 items is the field-standard sweet spot for a diagnostic.

### 4.5 Reviewer wants < 20 items (a shorter test)

This is **Material AND statistically risky**. Triggers:
- Information curve drops; SE rises; same theta gets less precise estimate
- Rasch reliability bound (Cronbach-α-equivalent) drops
- May fall below "useful diagnostic" threshold

If reviewer suggests this, **push back firmly** — anything below 15 items makes the SE column unreliable. If reviewer insists, get user sign-off + add a `validity_notes.known_limitations` caveat about reduced precision.

### 4.6 Reviewer doesn't return feedback at all

This is the **status quo**. No action required. The gate stays open indefinitely. The instrument exists in the codebase, can be used for development + smoke testing + dogfooding, but **cannot** be used for real-cohort deployment.

If real-cohort deployment becomes urgent and the reviewer hasn't responded after a long wait, options are:
- Find a different ulpan teacher reviewer (re-send dispatch package)
- Document the lack of external review as a known limitation in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §"Validity notes"` and proceed with caveat (loses some scientific rigor)
- Use a self-report-only outcome path for the first cohort while the gate stays open

Don't decide unilaterally — escalate to user.

---

## 5. Closure record

- **Date of decision:** 2026-05-15
- **Closure type:** Project-owner provisional sign-off (NOT external ulpan-teacher review)
- **Reviewer attribution:** "Project owner provisional approval (sindromradiospb@gmail.com), 2026-05-15. External ulpan-teacher review remains recommended before real-cohort deployment."
- **Severity classification:** ☐ Cosmetic ☐ Refinement ☐ Material — **N/A** (no item edits applied; this is a posture change, not a content change)
- **Items modified:** 0 (bank content unchanged; only `validity_notes` + `external_review_status` + `production_ready` fields updated)
- **Items replaced:** 0
- **Difficulty logits adjusted:** 0
- **`instrument_id` after closure:** ✅ `ulpan_diagnostic_v1` (unchanged — no item edits)
- **`CONSENT_VERSION` after closure:** ✅ `1.0` (unchanged — Example E conditions still hold; no items, scoring scale, or band boundaries changed)
- **Path to stashed reviewer response:** N/A (no external response received yet)
- **Closing commit SHA:** *(filled in by the gate-closure commit; see git log around tag `v3.3.5`)*
- **Smoke matrix at closure:** ✅ 283/283 ALL GREEN (19 suites — includes the post-release admin CLI polish)
- **Production-ready flag:** ⚠ Set to `"development_and_dogfood_only"` on `ulpan_diagnostic_v1`. Will move to `"full"` (or equivalent) only when an ulpan teacher completes the reviewer form per §7 pre-launch checklist.

### Rationale for closing without external review

The user is both the project owner and the diploma researcher who will run the eventual ulpan cohort. They understand the methodological tradeoff: shipping the calibrated quiz under AI pre-review only means item-difficulty placeholders are not yet expert-validated. They've accepted this risk for development + dogfood + downstream v3.3.6 unblocking, on the condition that real-cohort launch is preceded by an external review pass.

This is a legitimate authorization within the project — the original gate doc treated external review as BLOCKING because at gate-freeze time there was no explicit owner decision on the tradeoff. The 2026-05-15 user directive explicitly accepted the tradeoff and reframed the gate as soft.

---

## 6. Resume checklist — DEPRECATED

The 13-step closure flow originally in §3 is no longer the active path; the gate closed without going through it. Kept intact in this document's git history (`git log -- docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md`) for reference if a future pre-cohort-launch review actually arrives — at that point the operator can execute §3 steps 3.1–3.13 against the returned form.

If the ulpan teacher returns a filled form later, treat it as a **post-closure refinement** (apply edits per §3 + bump `external_review_status` + update §5 + lift `production_ready` flag). The instrument JSON, server schema, smoke matrix, and downstream consumers (teacher dashboard, admin CLI) are all already in place and will accept any update.

---

## 7. Pre-cohort-launch checklist (replaces the original blocking gate)

Before deploying `ulpan_diagnostic_v1` to a real ulpan cohort for diploma data collection — i.e. real participants completing the quiz with their data flowing into the diploma dataset — do the following in order:

- [ ] **Send dispatch package** (`docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` + `docs/QUIZ_ITEM_BANK_DRAFT.md` + `docs/QUIZ_ITEM_BANK_REVIEWER_FORM.md`) to an ulpan teacher with native Hebrew fluency.
- [ ] **Wait for filled form return** — any of the four formats supported by the brief §4.
- [ ] **Stash the return** at `docs/external/QUIZ_ITEM_BANK_REVIEWER_RESPONSE_<YYYY-MM-DD>.md`.
- [ ] **Apply edits** per the triage severity bands in §3.2 (Cosmetic / Refinement / Material).
- [ ] **Regenerate `public/quiz/ulpan_diagnostic_v1.json`** if items changed; bump `instrument_id` to `v1.1` if severity is Material.
- [ ] **Re-run** `npm run quiz:validate` + `npm run smoke:research:fast` — must stay ALL GREEN.
- [ ] **Update `validity_notes`** in the JSON: change `external_review_status` from `"ai_pre_review_only"` to `"external_complete"`; change `production_ready` from `"development_and_dogfood_only"` to `"full"`.
- [ ] **Re-run consent audit** (`docs/RESEARCH_CONSENT_RULE.md` Example E) — bump `CONSENT_VERSION` only if any of the four conditions fails.
- [ ] **Record** the post-review sign-off in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §5 Calibration audit log` (separate row from the 2026-05-15 provisional sign-off).
- [ ] **Then deploy** to the real cohort.

This list is a recommendation, not an enforced gate. The instrument as it stands today (project-owner provisional sign-off, AI-pre-reviewed) can technically run a cohort — the recommendation exists because a methodologically rigorous diploma study needs the external validity check, and we don't want the team forgetting it.

---

## 6. References

- [`docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md`](PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md) — phase plan (§5 pre-implementation gate, §13 smoke matrix, §17 commit sequence)
- [`docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md`](ULPAN_DIAGNOSTIC_QUIZ_v1.md) — instrument methodology + audit log (closure recorded in §5)
- [`docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md`](QUIZ_ITEM_BANK_REVIEW_BRIEF.md) — reviewer instructions + cover message template
- [`docs/QUIZ_ITEM_BANK_DRAFT.md`](QUIZ_ITEM_BANK_DRAFT.md) — canonical markdown source (items Q01–Q20)
- [`docs/QUIZ_ITEM_BANK_REVIEWER_FORM.md`](QUIZ_ITEM_BANK_REVIEWER_FORM.md) — fillable response form
- [`docs/QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md`](QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md) — historical AI pre-review notes
- [`docs/RESEARCH_CONSENT_RULE.md`](RESEARCH_CONSENT_RULE.md) — Example E audit (NO CONSENT_VERSION bump conditions)
- [`docs/RESEARCH_METRICS_SCHEMA.md`](RESEARCH_METRICS_SCHEMA.md) §8 — wire shape with quiz fields
- [`docs/RESEARCHER_GUIDE.md`](RESEARCHER_GUIDE.md) §4.3 — operator guide for the third outcome path
- [`public/quiz/ulpan_diagnostic_v1.json`](../public/quiz/ulpan_diagnostic_v1.json) — canonical bank JSON
- `memory/project_v3_3_5_predeployment_gate.md` — memory pointer
