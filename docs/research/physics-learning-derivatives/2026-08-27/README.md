# Physics Year 1 learning derivatives - 2026-08-27

This directory contains the local R6 exam-solution derivative for the published
`physics-year1-problems` corpus. R2 supplied full exam protocols; R3 added one
unambiguous mathematical notation system for agent Markdown and semantic premium HTML
while preserving provenance and answer-comparison evidence. R4 records the
owner-authorized visual review of handwritten solutions 1.5, 1.10 and 6.1, corrects
1.5 and 6.1, and separates the confirmed key error in 1.10 from open reviews. R5
records the owner's later confirmation of repository solutions 2.3 and 4.13, including
the owner's report that the handwritten solution for 2.3 also agrees.
R6 corrects the force balance for task 6.12 after reinspection of its source diagram:
the B-only tangential equation uses `m_B * g * sin(α)`, while A's normal load is
carried through `N_1`; the result now agrees with the answer key within rounding.

## Open first

- `artifacts/physics-year1-solutions.html` - premium offline user view.
- `artifacts/physics-year1-agent-guide.md` - combined agent-readable guide.
- `artifacts/tasks/*.md` - bounded one-task files for retrieval.
- `answer-ledger.json` - 74-task source-grounded answer transcription.
- `solution-ledger.json` - independently derived solutions and answer comparisons.
- `solution-ledger.ru.json` - reviewed Russian presentation layer for the independent derivations.
- `exam-solution-ledger.ru.json` - 74 structured college-exam protocols: givens,
  unknowns, SI, base laws, symbolic derivation, calculation, required graph/force
  construction where applicable, and verification.
- `artifacts/manifest.json` - generated file hashes and source pins.

## Mathematical notation

- Agent files use `v_A`, `v_0`, `t_{AC}`, `v^2` and explicit `2 * a * s`.
- Premium HTML renders the same meaning with real subscripts and superscripts and a
  centered multiplication dot; the dot carries an accessible operation label.
- Trigonometric arguments are parenthesized, and segment labels such as `AB` are not
  confused with products.
- The contract and gates are recorded in
  `docs/planning/PHYSICS_MATH_NOTATION_R3_PLAN_2026_08_28.md`.
- The authorized handwritten-review scope and correction decisions are recorded in
  `docs/planning/PHYSICS_OWNER_HANDWRITTEN_CORRECTIONS_R4_PLAN_2026_08_28.md`.
- The subsequent owner dispositions for 2.3 and 4.13 are recorded in
  `docs/planning/PHYSICS_OWNER_REVIEW_DISPOSITIONS_R5_PLAN_2026_08_28.md`.
- The corrected force balance and dual free-body/system check for 6.12 are recorded in
  `docs/planning/PHYSICS_TASK_6_12_CORRECTION_R6_PLAN_2026_08_28.md`.

## Generation

```powershell
node scripts/premium/build-physics-learning-derivatives.js
node --test tests/physicsLearningDerivatives.test.js
```

Source conditions come from
`docs/research/physics-corpus/2026-08-24/physics-year1-corpus-records.json`.
The answer key and source PDFs remain outside git on the owner drive; their exact
SHA-256 pins are stored in the ledgers. No source PDF is copied or recompressed here.
The three owner-selected handwritten PDFs were visually reviewed without OCR. Their
filenames, hashes, task scope and evidentiary roles are pinned in `solution-ledger.json`;
no absolute owner-drive path is stored in generated artifacts.

## Status

- Conditions: existing corpus derivative, 74/74.
- Short answers: manual visual transcription, 74/74, single-reviewer source pass.
- Solutions: originally derived from canonical conditions and printed diagrams; tasks
  1.5 and 6.1 were corrected after owner-authorized handwritten review, and 1.10 was
  verified while its step sequence was expanded. Every card follows the R2 college-exam contract in
  `docs/planning/PHYSICS_EXAM_SOLUTIONS_R2_PLAN_2026_08_27.md` and the R3 notation
  contract above.
- Answer comparison: 67 matching tasks, three owner-confirmed answer-key errors
  (1.10, 2.3 and 4.13), and four open reviews (6.2, 7.8, 8.1 and 9.1).
- Public rights for the new `Ответы.pdf` derivative: owner confirmation required.
- Production/API/Agent Access publication: not performed.

The generated guide is a review artifact. Every mismatch or insufficient source remains
visible. The four open reviews block publication of those tasks; 1.10, 2.3 and 4.13
are retained as confirmed key errors. Edit the ledgers, not generated files.
