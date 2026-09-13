# Acceptance and handoff

Read the sections for the requested corpus/solution deliverable. Publication and audio checks apply only to those operations; they remain mandatory when those operations are requested.

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

For a full exam/pedagogy deliverable, expose the applicable content below in this order. A short verified answer or ledger-only request does not require a full tutor overlay. Do not manufacture steps for simple or nonnumeric tasks:

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

For the requested deliverables, prove the applicable checks below. A ledger-only repair does not require rendering absent surfaces; regenerate and check affected downstream artifacts when they exist.

Before acceptance, prove:

- exact task-set equality across condition, answer, independent-solution, exam, and
  pedagogy ledgers;
- every requested quantity has a result or explicit insufficiency;
- every used number traces to source/diagram/declared constant;
- dimensional or subject-equivalent validation for every numeric result;
- every mismatch remains visible until disposition and is never normalized silently;
- exam protocols contain nonempty givens, unknowns, model/laws, the necessary symbolic
  derivation, calculation where applicable, and check;
- pedagogy introduces no new numbers, formulas, answer claims, or review states;
- Markdown, HTML, tutor prompt, per-task shards, and manifest rebuild deterministically
  from the same ledgers;
- any student row-table projection preserves every reviewed solution row in source
  order, and its exam projection is exactly the rows explicitly marked for copying;
- Agent Access discovery and derivative rights are independently materialized and read
  back; public visibility alone does not authorize the agent;
- desktop, 380 px RU/LTR and HE/RTL, keyboard/focus, reduced motion, and real A4 print
  preserve all content without horizontal overflow or clipped formulas.

## Stop conditions

Block the affected task or publication and report exact evidence when:

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
