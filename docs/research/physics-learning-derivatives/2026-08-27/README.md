# Physics Year 1 learning derivatives - 2026-08-27

This directory contains the local R3 exam-solution derivative for the published
`physics-year1-problems` corpus. R2 supplied full exam protocols; R3 adds one
unambiguous mathematical notation system for agent Markdown and semantic premium HTML
while preserving provenance and answer-comparison evidence.

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

## Generation

```powershell
node scripts/premium/build-physics-learning-derivatives.js
node --test tests/physicsLearningDerivatives.test.js
```

Source conditions come from
`docs/research/physics-corpus/2026-08-24/physics-year1-corpus-records.json`.
The answer key and source PDFs remain outside git on the owner drive; their exact
SHA-256 pins are stored in the ledgers. No source PDF is copied or recompressed here.
Handwritten solution pages are deliberately not OCRed, transcribed or used as solution
inputs.

## Status

- Conditions: existing corpus derivative, 74/74.
- Short answers: manual visual transcription, 74/74, single-reviewer source pass.
- Independent solutions: derived from canonical conditions/printed diagrams, never
  from handwritten work; every card follows the R2 college-exam contract in
  `docs/planning/PHYSICS_EXAM_SOLUTIONS_R2_PLAN_2026_08_27.md` and the R3 notation
  contract above.
- Public rights for the new `Ответы.pdf` derivative: owner confirmation required.
- Production/API/Agent Access publication: not performed.

The generated guide is a review artifact. Every mismatch or insufficient source remains
visible and blocks publication of that task. Edit the ledgers, not generated files.
