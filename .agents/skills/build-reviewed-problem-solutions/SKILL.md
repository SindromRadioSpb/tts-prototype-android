---
name: build-reviewed-problem-solutions
description: Create and publish source-grounded, independently derived, exam-grade worked solutions and beginner tutor support for an existing problem corpus. Use for answer ledgers, discrepancy adjudication, agent Markdown, premium HTML, bilingual conditions, and full-print walkthroughs; do not use to build or alter the source corpus.
---

# Build Reviewed Problem Solutions

Create a solution program that a beginner can follow, an examiner can audit, and an
agent can explain without inventing missing facts.

## Boundary

This skill starts from a stable canonical task set. It does not:

- OCR or mutate the source corpus unless the user separately requests corpus repair;
- use the answer key to generate a derivation;
- infer missing diagram data;
- collapse reviewer decisions into computed comparison results;
- write learner state, grades, `review_log`, groups, assignments, or discussion truth;
- publish answer-derived content without rights and explicit publication authority.

Use `$build-bilingual-problem-corpus` first when task identity, conditions, diagrams,
or source provenance are not yet stable.

## Start here

1. Read `CLAUDE.md`, `docs/PROJECT_ROLES.md`, the target corpus evidence, and the
   newest solution-program decisions. Prefer live code over stale status prose.
2. Inspect the dirty tree and define a scoped allowlist before editing.
3. Copy [the solution program template](assets/solution-program-spec.template.json)
   into the corpus's stable research directory and fill the known decisions.
4. For answer transcription, independent derivation, tolerances, disagreement review,
   or handwritten evidence, read [solution truth and ledgers](references/solution-truth-and-ledgers.md).
5. For beginner explanations, agent support, premium HTML, print, Agent Access, or
   production rollout, read [pedagogy, rendering, and release](references/pedagogy-rendering-and-release.md).

## Select the operating mode

- **Recon**: pin the task set, inputs, rights, diagrams, answer-key shape, existing
  ledgers, mismatches, and owner decisions. No solutions or publication yet.
- **Answer ledger**: manually transcribe only the printed final answers and attach
  page/hash provenance. Do not derive.
- **Independent solutions**: solve from the condition, diagram, and declared constants;
  compare only after the result exists.
- **Adjudication**: inspect each mismatch, preserve both claims, and record owner/reviewer
  disposition without rewriting history.
- **Exam and pedagogy**: build full exam protocols and a separate beginner overlay from
  verified solution truth.
- **Render and agent package**: generate bounded per-task Markdown, premium semantic HTML,
  print output, tutor instructions, shards, and a hash manifest from common ledgers.
- **Publish**: exact-edition support, separate rights/content tier, pilot, rollback, and
  public/agent acceptance. Only with explicit authorization.

Do only the authorized mode. A request to create local solutions is not authority to
publish them or add Agent Access rights.

## Truth order

Use this precedence and retain provenance at every step:

`canonical condition + source diagram + declared constants -> independent derivation -> computed result -> answer-key comparison -> reviewer disposition`

- The answer key checks a result; it never supplies a missing premise or intermediate
  formula.
- Handwritten solutions are excluded by default. If the owner authorizes visual use,
  pin exact files/hashes/tasks and record whether each is correction evidence,
  verification evidence, or presentation reference. Never expand that scope silently.
- If the condition or diagram is insufficient, emit `SOURCE_INSUFFICIENT` and stop that
  task. A plausible answer is not evidence.
- Preserve guard digits and units; normalize units before tolerance comparison and
  round only at the end.

## Required per-task learning contract

Every complete task must expose, in order:

1. canonical condition and exact source identity;
2. independently verified short answer;
3. beginner physical/technical picture;
4. prerequisites and applicable principle;
5. a multi-step roadmap and task-specific trap;
6. `Дано` with named quantities;
7. `Найти` covering every requested part;
8. SI conversion plus axes, signs, phases, and assumptions where relevant;
9. physical/engineering model;
10. base laws or definitions before substitution;
11. symbolic derivation of the calculation formulas;
12. sequential equation solving and physical root/domain selection;
13. numeric substitution with units only after the symbolic result;
14. dimensional/sign/conservation/limit/geometric reasonableness check;
15. separately boxed answer and answer-key comparison;
16. provenance, review state, and unresolved limitations.

For graphs, force diagrams, phase diagrams, stress-strain curves, crystal directions,
or other required constructions, include reproducible axes/labels/points/forces or mark
the source insufficient. Do not replace a requested construction with prose alone.

## Notation and clarity

- Agent text uses unambiguous indices and explicit multiplication: `v_A`, `t_{AC}`,
  `v^2`, `2 * a * s`. Adapt symbols to the subject but preserve the rule.
- User HTML uses semantic `<var>`, `<sub>`, `<sup>`, and an accessible centered
  multiplication dot; do not inject solution HTML as executable markup.
- Trigonometric and other named functions have parenthesized arguments. Atomic segment,
  plane, direction, alloy, or phase labels remain distinguishable from products.
- One mathematical transformation is one inspectable step with its reason. Avoid
  “очевидно”, “просто подставим”, and unexplained ready-made formulas.
- Explain conventions and applicability conditions when they affect the result.

## Required acceptance envelope

Before local acceptance, prove:

- exact task-set equality across condition, answer, independent-solution, exam, and
  pedagogy ledgers;
- every requested quantity has a result or explicit insufficiency;
- every used number traces to source/diagram/declared constant;
- dimensional or subject-equivalent validation for every numeric result;
- every mismatch remains visible until disposition and is never normalized silently;
- exam protocols contain nonempty givens, unknowns, model/laws, at least two symbolic
  steps, calculation, and check;
- pedagogy introduces no new numbers, formulas, answer claims, or review states;
- Markdown, HTML, tutor prompt, per-task shards, and manifest rebuild deterministically
  from the same ledgers;
- desktop, 380 px RU/LTR and HE/RTL, keyboard/focus, reduced motion, and real A4 print
  preserve all content without horizontal overflow or clipped formulas.

## Stop conditions

Stop and report exact evidence when:

- task/source/edition pins drift;
- an answer-key page or part cannot be transcribed confidently;
- a required diagram is missing or ambiguous;
- a derivation would depend on the expected answer;
- comparison requires an undocumented tolerance widening;
- reviewer dispositions conflict or are absent for a publication-blocking mismatch;
- generated user and agent artifacts no longer share one content source;
- rights, backup, exact-edition anchoring, content-tier consent, read-back, or rollback
  are incomplete for publication.

## Handoff

Report the stable artifact path first, then task coverage, answer-ledger review,
comparison counts, unresolved mismatches/insufficiencies, corrected tasks and evidence,
exam/pedagogy/render gates, manifest hashes, and publication/agent acceptance boundaries.
Never turn automated browser evidence into owner, physical-device, printer, or
assistive-technology acceptance.
