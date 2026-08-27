# Physics Year 1 learning derivatives - 2026-08-27

This directory contains the local R2 exam-solution derivative for the published
`physics-year1-problems` corpus. R2 supersedes the terse R1 presentation while
preserving its provenance and answer-comparison evidence.

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
  from handwritten work; every card now follows the R2 college-exam contract in
  `docs/planning/PHYSICS_EXAM_SOLUTIONS_R2_PLAN_2026_08_27.md`.
- Public rights for the new `Ответы.pdf` derivative: owner confirmation required.
- Production/API/Agent Access publication: not performed.

The generated guide is a review artifact. Every mismatch or insufficient source remains
visible and blocks publication of that task. Edit the ledgers, not generated files.
