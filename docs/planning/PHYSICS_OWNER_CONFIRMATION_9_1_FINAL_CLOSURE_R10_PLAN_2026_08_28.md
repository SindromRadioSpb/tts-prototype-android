# PHYSICS-OWNER-CONFIRMATION-9.1-FINAL-CLOSURE-R10

Date: 2026-08-28
Status: implemented in local/repository review artifacts; not published to production

## Owner decision

The owner confirmed both parts of the repository disposition for task 9.1:

- the correct result is `S = 168.03 m`;
- the printed `192.146 m` omits the `12.058 m` height gain and corresponding
  gravitational work on arc AB.

R10 therefore changes task 9.1 from `OWNER_REVIEW_PENDING` to
`OWNER_CONFIRMED_KEY_ERROR`. Its derivation, numerical result and explanation remain
unchanged from R9.

## Final answer-comparison state

- Corpus tasks: 74.
- Tasks matching the key within the declared tolerance: 67.
- Total `MISMATCH` comparisons: 7.
- Owner-confirmed answer-key errors: `1.10`, `2.3`, `4.13`, `6.2`, `7.8`, `8.1`, `9.1`.
- Open mismatch reviews: 0.

`MISMATCH` is retained as the factual comparison outcome. Owner confirmation is stored
separately as `review_disposition: OWNER_CONFIRMED_KEY_ERROR`; the key is not silently
rewritten and the tolerance is not widened.

## Publication boundary

Owner closure of the mathematical review does not authorize production publication.
The local derivative still requires the existing answer-transfer second pass, rights
attestation and the separate publication workflow before it may become public.

## Quality gates

- The task 9.1 result and derivation do not change; only owner disposition and explanatory
  provenance are added.
- Source, Russian localization, generated task Markdown, combined agent guide, premium
  HTML, comparison report and manifest all show 7 confirmed key errors and 0 open reviews.
- The report handles the zero-open state explicitly and does not request a decision on
  zero tasks.
- Deterministic generation, the full 15-test suite, `git diff --check` and a desktop
  browser status check pass before commit.
- Unrelated working-tree changes remain outside the allowlist.
