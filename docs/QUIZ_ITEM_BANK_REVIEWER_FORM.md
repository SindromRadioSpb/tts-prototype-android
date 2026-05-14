# Quiz Item Bank — Reviewer Feedback Form

> **For:** ulpan-teacher native review of `ulpan_diagnostic_v1`.
> **Pair with:** [`QUIZ_ITEM_BANK_REVIEW_BRIEF.md`](QUIZ_ITEM_BANK_REVIEW_BRIEF.md) (instructions) + [`QUIZ_ITEM_BANK_DRAFT.md`](QUIZ_ITEM_BANK_DRAFT.md) (the items themselves).
> **Optional:** [`QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md`](QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md) — AI pre-review notes for supplementary context. You can confirm, refine, or override any AI judgement.
> **Return as:** completed `.md` file (any of the formats in brief §4 — inline markdown, GitHub PR, freeform chat comments, Word with track changes).

---

## How to fill in

For each Q01–Q20, mark the six checkboxes with one of:

- `[x]` — looks good as-is.
- `[!]` — issue, with details in **Замечания**.
- `[?]` — not sure, with question in **Замечания**.

If an item is wholly broken — write a replacement in **Replacement** at the end of that item's block (free-form, any locale). I'll re-emit the JSON + re-run smoke + bump `instrument_id` if the change is material.

If you only have time for a partial pass — that's still useful. Just skip items you don't review. Mark **Partial review** in the summary at the end.

---

## Reviewer identity

> Used only for the diploma acknowledgements + audit log entry. Override defaults if needed.

- **Name (preferred form):** ___________________
- **Affiliation (if any):** ___________________
- **Attribution preference** (mark one):
  - [ ] (a) Named credit ("Item bank reviewed by `<full name>`, `<affiliation>`")
  - [ ] (b) Initials only
  - [ ] (c) Generic ("native Hebrew reviewer")
  - [ ] (d) Anonymous
- **Date of review:** ___________________
- **Time spent (approximate):** ___________________

---

## Part A — Per-item review (Q01 .. Q20)

For each item: open `QUIZ_ITEM_BANK_DRAFT.md` side-by-side to see the prompt + 4 options + correct answer.

### Q01 — A1 · vocabulary, greetings, classroom · `difficulty_logit = -2.6`

- [ ] **Грамматика** — Hebrew correct (typos, spacing, niqqud non-critical)
- [ ] **Уровень** — appropriate CEFR band? If not, what band actually fits?
- [ ] **Однозначность** — single unambiguous correct answer; distractors plausible but wrong
- [ ] **Locale parity** — RU/EN translations preserve intent + difficulty (no give-away hints)
- [ ] **Cultural neutrality** — no religious / political / regional bias; suitable for diverse ulpan cohort
- [ ] **Difficulty** — `-2.6` reasonable for the item shown? Adjust ± 0.5 if not.

**Замечания:**

```
[ваш комментарий]
```

**Suggested difficulty_logit (if changed):** ___________________

**Replacement (only if item is unsalvageable):**

```
[full replacement item — He prompt + RU + EN + 4 options + correct]
```

---

### Q02 — A1 · grammar, pronouns, sentence-completion · `difficulty_logit = -2.3`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q03 — A1 · grammar, definite-article, noun-phrase · `difficulty_logit = -2.0`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q04 — A1 · grammar, negation, basic-sentence · `difficulty_logit = -1.7`

> AI pre-review flagged this item for level/wording re-examination. Your judgement supersedes; please confirm or correct.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q05 — A2 · grammar, verbs, past-tense, first-person · `difficulty_logit = -1.4`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q06 — A2 · grammar, possession, noun-phrase · `difficulty_logit = -1.1`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q07 — A2 · vocabulary, time, comprehension · `difficulty_logit = -0.9`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q08 — A2 · vocabulary, everyday, functional-language · `difficulty_logit = -0.7`

> AI pre-review flagged this item for level/wording re-examination. Your judgement supersedes; please confirm or correct.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q09 — B1 · grammar, smikhut, definiteness · `difficulty_logit = -0.4`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q10 — B1 · grammar, prepositions, pronouns, verb-government · `difficulty_logit = -0.1`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q11 — B1 · grammar, binyan, verb-pattern · `difficulty_logit = 0.2`

> Tests meta-linguistic binyan knowledge. Validity-notes flag: reviewer should confirm acceptability for the target ulpan population.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q12 — B1 · reading-comprehension, connectors, cause · `difficulty_logit = 0.4`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q13 — B1 · grammar, conditional, hypothetical · `difficulty_logit = 0.6`

> AI pre-review flagged this item for level/wording re-examination. Your judgement supersedes; please confirm or correct.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q14 — B2 · grammar, syntax, direct-object-marker · `difficulty_logit = 0.9`

> AI pre-review flagged this item for level/wording re-examination. Your judgement supersedes; please confirm or correct.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q15 — B2 · register, formality, productive-phrases · `difficulty_logit = 1.2`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q16 — B2 · idiom, figurative-language · `difficulty_logit = 1.4`

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q17 — B2 · grammar, smikhut, definiteness, adjective-agreement · `difficulty_logit = 1.7`

> Tests smikhut + adjective definiteness. Validity-notes flag: reviewer should confirm this does NOT exceed B2 for the intended cohort.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q18 — C1 · register, formal-language, discourse-marker · `difficulty_logit = 2.1`

> Tests advanced register. Validity-notes flag: reviewer may lower or replace if it feels more academic than ulpan C1.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q19 — C1 · vocabulary, metaphor, abstract-concepts · `difficulty_logit = 2.4`

> AI pre-review flagged this item for level/wording re-examination. Validity-notes flag: reviewer may lower or replace if it feels more academic than ulpan C1.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

### Q20 — C1 · idiom, pragmatics, advanced-expression · `difficulty_logit = 2.7`

> Tests advanced idiomatic interpretation. Validity-notes flag: reviewer may lower or replace if it feels more academic than ulpan C1.

- [ ] Грамматика — [ ] Уровень — [ ] Однозначность — [ ] Locale parity — [ ] Cultural neutrality — [ ] Difficulty

**Замечания:**

```

```

**Suggested difficulty_logit (if changed):** _______

**Replacement (if needed):**

```

```

---

## Part B — Distribution + balance

- [ ] **Total: 20 items** (auto-verified by build validator)
- [ ] **Distribution 4/4/5/4/3** across A1/A2/B1/B2/C1 (auto-verified)
- [ ] **Difficulty monotonically increases by band** — mean(A1) < mean(A2) < mean(B1) < mean(B2) < mean(C1). Auto-verified at current values:
   - mean(A1) ≈ −2.15, mean(A2) ≈ −1.03, mean(B1) ≈ +0.14, mean(B2) ≈ +1.30, mean(C1) ≈ +2.40
- [ ] **Stress-points diverse** — not 5 items on smikhut + 0 on verb conjugation. Current spread:
  - Q01–Q08 (A1+A2): vocab, pronouns, articles, negation, past tense, possessives, time, everyday
  - Q09–Q13 (B1): smikhut, prepositions+pronouns, binyan, reading comp, conditional
  - Q14–Q17 (B2): direct-object marker, register, idiom, smikhut+adjective definiteness
  - Q18–Q20 (C1): formal register, metaphor, advanced idiom
- [ ] **Gut check** — a B1-level ulpan student would score roughly 60–70% on this bank? Mark `[x]` if yes, `[!]` if expectation is materially off.

**Distribution notes:**

```
[overall observation, if any]
```

---

## Part C — Validity caveats

Current caveats in `public/quiz/ulpan_diagnostic_v1.json` (`validity_notes.known_limitations`):

1. Item difficulties are expert-judgement placeholders, not empirically estimated. Real-data IRT recalibration deferred to v3.4+ once ≥30 quiz responses accumulate.
2. Bank targets standard Modern Hebrew used in adult ulpan contexts; does not assess listening, spontaneous speaking, handwriting, free writing.
3. Q11 tests meta-linguistic binyan knowledge; reviewer should confirm acceptability for target ulpan population.
4. Q17 tests smikhut + adjective definiteness; reviewer should confirm it does not exceed B2 for the intended cohort.
5. Q18–Q20 test advanced register and idiomatic interpretation; reviewer may lower or replace any item that feels more academic than ulpan C1.
6. Domain-expert sign-off is required before real-ulpan deployment; AI pre-review does not substitute.

- [ ] All 6 caveats above accurately reflect the bank's limitations
- [ ] Add the following caveats:

```
[free-form additions]
```

- [ ] Remove the following caveats (with reason):

```
[which caveat, and why removed]
```

---

## Part D — Optional broader suggestions

- **Alternative item formats** (fill-in-blank vs multiple-choice, productive vs receptive) for v2:

```

```

- **Audio items for v3.4+** — what listening skills should we prioritize?

```

```

- **Ideas for recalibration after real data accumulates** — anything to watch for in the response patterns?

```

```

- **Other comments** — anything we missed:

```

```

---

## Final sign-off

Mark one:

- [ ] **Bank approved for production v1** (no material changes; my notes are optional refinements only).
- [ ] **Bank approved for production v1 with the modifications applied above** (please re-run smoke + verify).
- [ ] **Bank needs another iteration** — major items above need rework; please re-send after applying changes.
- [ ] **Partial review** — I reviewed Q__–Q__ only; other items not assessed. Treat my notes as advisory, not as a sign-off gate.

**Reviewer's verification signature (free-text):**

```
[e.g. "Items Q01-Q20 reviewed. 3 modifications applied. 0 items replaced.
All bands distribution + difficulty monotonic ranges verified. Bank approved
for production v1. Calibration based on expert judgement (no empirical data
available yet; v3.4 will recalibrate from real responses)."]
```

---

> When this form is returned, the author will: merge edits → regenerate JSON if needed → re-run `npm run smoke:research:fast` (must stay 248/248 ALL GREEN) → re-run consent audit Example E → record sign-off in `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §5` → bump `instrument_id` if items changed materially → mark instrument production-ready for real-cohort deployment.
