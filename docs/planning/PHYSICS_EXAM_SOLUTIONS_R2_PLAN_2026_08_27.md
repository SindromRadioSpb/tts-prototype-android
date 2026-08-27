# PHYSICS-EXAM-SOLUTIONS-R2

Date: 2026-08-27
Status: implemented locally and in repository artifacts; not published to production

## Owner correction

The R1 solution cards were computational summaries. They were useful for answer
comparison but not acceptable as college-exam submissions: they skipped the
formal statement of givens and unknowns, often moved directly to a ready-made
formula, compressed algebra, and did not make every inference inspectable by a
school learner or examiner.

R2 supersedes the R1 presentation contract. It does not change the independent
answer ledger, the ten recorded key mismatches, source provenance, or the ban on
using handwritten solutions.

## Mandatory task contract

Every one of the 74 task derivatives must contain, in this order:

1. the canonical condition;
2. `Дано` with named physical quantities;
3. `Найти` with every requested quantity;
4. conversion to SI and an explicit sign/axis convention when relevant;
5. the physical model;
6. base laws before any numeric substitution;
7. symbolic derivation of the calculation formulas;
8. sequential equation solving, including discriminant/root selection where used;
9. numeric substitution only after the symbolic result;
10. a dimensional, sign, conservation-law, limiting-case, or geometric check;
11. a separately boxed answer;
12. answer-key comparison after the independent answer.

## Quality gates

- The exam ledger must contain exactly the canonical 74 unique task IDs.
- `given`, `find`, `si`, `laws`, `symbolic`, and `check` are non-empty for every task.
- Every symbolic derivation has at least two explicit steps.
- Every requested final numeric value is carried through the calculation section
  before it is repeated in the boxed answer.
- Tasks that explicitly request a graph or free-body diagram include a reproducible
  construction block with functions/key points or forces/directions.
- Quadratic equations show the standard form, discriminant/root logic, and rejection
  of a nonphysical root.
- Calculations never replace the symbolic derivation.
- Rounding is performed at the end and never widened to force agreement with the key.
- The ten R1 mismatches remain visible and are not silently normalized.
- Markdown and HTML are generated from the same ledgers.
- Mobile 380 px, RTL source, keyboard focus, reduced motion, print expansion, search,
  manifest hashes, and console state are checked again.

## Presentation direction

The solution surface is an examiner's engineering notebook rather than a generic
content card. A ruled calculation sheet, restrained proof margin, numbered reasoning
stages, and a boxed final answer encode the actual assessment sequence. Decorative
elements may not compete with formulas or create horizontal scrolling.

## Release boundary

R2 remains a local/repository review artifact. Production or Agent Access publication
still requires the owner's exact rights attestation for the answer-key derivative and
explicit disposition of the ten mismatches.
