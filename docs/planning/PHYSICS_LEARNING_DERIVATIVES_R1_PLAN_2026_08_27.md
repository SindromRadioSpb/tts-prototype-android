# Physics Year 1 learning derivatives R1

Date: 2026-08-27
Program: `PHYSICS-LEARNING-DERIVATIVES-R1`
Mode: local/repository implementation; no production content publication in this slice
Source branch: `main`
Worktree: dirty before this work; unrelated owner changes are outside the allowlist

## 1. Owner decision and outcome

Owner decision 2026-08-27: do **not** OCR or reuse the handwritten solution pages.
Create an independent solution for every task from the canonical condition and printed
source diagram, then compare the final quantities with `Ответы.pdf`, allowing only
explicit numerical tolerance caused by rounding/calculator precision.

Target chain:

`immutable condition -> independent derivation -> computed result -> answer-key comparison`

The answer key is a check, not a generator of the derivation. A known final number may
never be used to reverse-engineer missing premises or hide an underdetermined problem.

R1 produces:

- a 74-task answer ledger transcribed from the owner-provided answer key;
- a 74-task independent-solution ledger;
- deterministic per-task Markdown for agents;
- one offline premium HTML study guide for users;
- schema, provenance, tolerance and generation gates.

The original PDFs remain canonical evidence. Structured solutions, Markdown and HTML
are versioned derivatives and never overwrite the source PDF, corpus snapshot, learner
state or `review_log`.

## 2. Measured source inventory

- Canonical structured conditions: 74 tasks / 425 semantic rows in
  `docs/research/physics-corpus/2026-08-24/physics-year1-corpus-records.json`.
- Existing public task resources: 74 exact-byte PDFs, 145 pages: 32
  `CONDITION_AND_SOLUTION`, 42 `CONDITION_ONLY`.
- Only the printed condition/diagram pages are admissible solution inputs. The 103 pages
  in the solution folder were inventoried, but handwritten work is outside the R1 truth
  and generation path.
- `Ответы.pdf`: 5 raster-only pages, 6,171,707 bytes, SHA-256
  `5c5823f556ad4e7e892977bfbe6a0d86ef0b5b6bf241f58b5fb9d857905b84d9`.
- `Пояснения.xlsx` is a status/lesson register, not a text solution source.

## 3. Selected method

For every task:

1. Pin the canonical task record and its source image hash.
2. Read the validated Russian/Hebrew condition rows.
3. Inspect only the printed source diagram when rows refer to geometry/graph data.
4. Record `given`, `find`, coordinate/sign convention and physical assumptions.
5. Derive formulas symbolically before substituting numbers.
6. Compute with guard digits and attach units to every quantity.
7. Compare each requested result with the independently transcribed answer-key part.
8. Classify comparison as `EXACT`, `WITHIN_TOLERANCE`, `MISMATCH`,
   `NON_NUMERIC_MATCH`, or `SOURCE_INSUFFICIENT`.
9. Never change the derivation merely to make the answer match. Adjudicate disagreement
   against the printed condition/diagram and record it.

## 4. Tolerance policy

Tolerance is quantity-aware and is applied only after unit normalization:

- exact discrete/text claims: exact semantic match;
- integers and counts: exact;
- ordinary decimal results: `max(0.5 * answer-key last-place unit, |expected| * 0.2%)`;
- angles: `max(0.05 degree, last-place rounding)`;
- graph/diagram requests: structural/manual comparison, not numeric tolerance;
- inequalities: preserve the operator exactly and compare the threshold numerically;
- values derived from an explicitly rounded constant in the source may receive a
  documented task-specific override, never a silent wider global tolerance.

The ledger stores raw computed value, expected value, normalized unit, absolute delta,
relative delta, tolerance and verdict. Formatting agreement is not mathematical proof.

## 5. Independent-solution model

Each solution carries:

- immutable corpus/task/source identity;
- `given[]`, `find[]`, assumptions and sign convention;
- ordered steps with explanation, symbolic equation, substitution and result;
- significant-figure/rounding note;
- final results keyed to answer-part labels;
- comparison evidence and review state;
- diagram dependency and exact source-page provenance;
- generator/schema versions and output hashes.

Review states remain separate:

- `CONDITION_SUFFICIENT`
- `DERIVATION_COMPLETE`
- `DIMENSIONALLY_CHECKED`
- `ANSWER_COMPARED`
- `HUMAN_REVIEWED`
- `PUBLICATION_APPROVED`

Absence is explicit. If a diagram is illegible or a condition is incomplete, the task
stops at `SOURCE_INSUFFICIENT`; it does not receive a plausible solution generated from
the answer.

## 6. UX and agent representation

The HTML direction is an engineering notebook: graphite surface, blueprint-blue
coordinate rail, amber verification marks and a restrained grid derived from the source
notebooks. The signature evidence rail is:

`условие -> модель -> вывод -> ответ -> сверка`

User rules:

- answer and full solution are collapsed by default to preserve productive attempt;
- `Подсказка` reveals the model/formula without the numeric answer;
- every final value shows comparison status and tolerance;
- the original PDF remains one action away;
- Hebrew uses explicit RTL containers;
- mobile is single-column at 380 px; print/reduced-motion remain useful.

Agent rules:

- one Markdown file per task, so retrieval never requires a 74-task dump;
- bounded labeled sections and exact provenance;
- plain formulas plus LaTeX; reviewed HTML may additionally use native MathML;
- agent explanations must distinguish source facts, assumptions and derived values;
- no grading or learner-state write follows from reading a solution.

MathML Core is the browser-native semantic target for reviewed HTML mathematics:
https://www.w3.org/TR/mathml-core/

## 7. Quality gates

### Answer ledger

- exactly 74 unique task IDs matching the corpus;
- every entry pins source page and answer-source PDF hash;
- no unlabeled blank masquerades as an answer;
- graph/diagram answers remain typed references, not invented prose;
- second-person owner review is required before public publication.

### Independent solutions

- exactly one solution record per corpus task;
- zero access to handwritten solution pages in the builder or solution provenance;
- every used number traces to a condition row, printed diagram or declared constant;
- every requested quantity has a final result or explicit insufficiency;
- dimensional check for every numeric result;
- answer comparison is independently recomputed and reproducible;
- every mismatch is visible and blocks publication of that task;
- spot-check set covers each chapter and every formula family before batch acceptance.

### Generated artifacts

- deterministic rebuild and manifest hashes;
- HTML semantic headings/details, keyboard focus, RTL and 380 px no-overflow;
- no remote scripts/fonts or hidden network dependency;
- Markdown exposes no owner filesystem path as agent content;
- original PDF remains evidence fallback.

## 8. Rights and rollout

The 2026-08-26 attestation covered the earlier 74-PDF batch. `Ответы.pdf` is a new
2026-08-27 source, and the new independently authored solutions are a new publication
class. R1 stays local until the owner explicitly confirms the right to publish the
answer-key-derived facts and authorizes publication of the new solution derivatives.

Rollout:

1. Build local 74-task ledgers and artifacts.
2. Owner reviews answer ledger plus all mismatches/insufficient-source rows.
3. Obtain exact rights/publication attestation.
4. Add a separate derivative repository/writer and immutable rights facts.
5. Run local API/UI/Agent Access red tests; `DERIVATIVE_TEXT` remains default deny.
6. Owner-only production pilot; rollback by flag-off while preserving source/audit.

## 9. Stop list

- no production DB/config/deploy in R1;
- no mutation of the 74 source PDF revisions or corpus edition;
- no `review_log`, notes, progress, groups, forum or B9 writes;
- no handwritten-solution OCR or reuse;
- no answer-led derivation or hidden tolerance widening;
- no public answer/solution publication without exact owner rights approval.
