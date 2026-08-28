# PHYSICS-TASK-6.12-CORRECTION-R6

Date: 2026-08-28
Status: implemented in local/repository review artifacts; not published to production

## Trigger

The owner questioned whether task 6.12(c) correctly accounted for the weight of the
upper body A. Reinspection of the one-page source PDF and its force diagram confirmed
that the repository equation mixed the free-body equation for B with the equation for
the combined A+B system.

## Pinned source evidence

- Filename: `6.12.pdf`
- Pages: 1
- SHA-256: `e9ff879ad15e95954080c7813b52435b19690f9e1a2573baf3b3a75f04388705`
- Method: visual inspection of the rendered source page; no OCR or handwritten
  transcription was used.

The absolute owner-drive path and the PDF bytes are not stored in the repository.

## Correct force model

Choose the positive tangential direction down the 20 degree incline, the impending
direction of B.

- For A: `N_1 = m_A * g * cos(α)`, `f_1 = μ_{AB} * N_1`, and
  `T = m_A * g * sin(α) + f_1`.
- A transfers `N_1` and `f_1` to B through contact. The cable tension does not act
  directly on B.
- For B normal to the incline:
  `N_2 = (m_A + m_B) * g * cos(α) - P * sin(α)`.
- For B along the incline:
  `P * cos(α) + m_B * g * sin(α) = f_1 + μ_{B-пл} * N_2`.
- If A+B is instead treated as one system, the corresponding external-force equation
  must retain the cable tension:
  `P * cos(α) + (m_A + m_B) * g * sin(α) = T + μ_{B-пл} * N_2`.

The previous equation used the combined weight `(m_A + m_B) * g * sin(α)` while also
retaining the B-only contact friction `f_1` and omitting `T`. It therefore produced the
incorrect `128.83 N` result.

## Correct result and comparison

- `N_1 = 184.37 N`
- `f_1 = 55.31 N`
- `T = 122.41 N`
- `P_{min} = 189.24 N`
- Printed key: `P >= 189.19 N`

The 0.05 N difference is approximately 0.03 percent and is accepted as intermediate
rounding. Task 6.12 changes from `MISMATCH / OWNER_REVIEW_PENDING` to
`WITHIN_TOLERANCE` with no owner-confirmation claim.

## Aggregate state after R6

- Matching comparisons: 67.
- Total `MISMATCH` comparisons: 7.
- Owner-confirmed answer-key errors: `1.10`, `2.3`, `4.13`.
- Owner review still pending: `6.2`, `7.8`, `8.1`, `9.1`.

## Quality gates

- The independent, localized and exam ledgers use the B-only tangential equation.
- The task contains both the separate-B derivation and the A+B system cross-check.
- `P_{min}` remains a semantic composite subscript in Markdown and premium HTML.
- Generated guide, comparison report and manifest agree on 7 mismatches, 3 confirmed
  key errors and 4 open reviews.
- Automated tests and desktop/mobile browser checks pass before commit.

## Release boundary

R6 updates repository review artifacts only. It does not publish to production,
attest public rights, alter the public corpus, or resolve the four remaining tasks.
