# PHYSICS-OWNER-REVIEW-7.8-AND-8.1-FORMULA-R8

Date: 2026-08-28
Status: implemented in local/repository review artifacts; not published to production

## Owner decisions and evidence

The owner independently rechecked task 7.8 and confirmed that the repository solution
is correct and the printed answer key is erroneous. R8 changes only its disposition;
the existing result remains `v_A = 5.000 m/s`, `v_B = 8.606 m/s` at 54.47 degrees
below horizontal, and `L = 3.569 m`.

For task 8.1(c), the owner supplied a formula image for an additional derivation:

- Filename: `8.1 формула.jpg`
- SHA-256: `bc6616b0ff2c4e705fb6447e0bf3c1db4856d2c5f3d5d8edbbf684ec30a37ee1`
- Formula: `F_{EX} = m * ΔV/Δt - V_{rel} * Δm/Δt`, with
  `V_{rel} = u_{потока} - V`.

The absolute owner-drive path and the image bytes are not stored in the repository.

## Task 8.1(c) formula review

The requested quantity is the average force acting between A and C. Choose either
body as a closed system during the collision. No mass crosses that body's boundary,
so `Δm = 0` and the mass-flow term in the supplied equation vanishes.

For block C:

- `v_D = √(2 * g * r) = 9.9045 m/s`.
- `u = m_A * v_D/(m_A + m_C) = 1.6508 m/s`.
- `F_{EX} = m_C * (u - 0)/Δt = 50 * 1.6508/0.05 = 1650.8 N`.

The cross-check on A gives
`m_A * (v_D - u)/Δt = 10 * (9.9045 - 1.6508)/0.05 = 1650.8 N`.
These are the equal and opposite forces of the interaction.

The printed `3300 N` is approximately `1650.8 N + 1650.8 N`: the sum of the
magnitudes of the action-reaction pair, not one force acting between the bodies.
Treating sticking as a nonzero `Δm` for a closed body would mix a closed-body force
question with an open-control-volume bookkeeping term.

R8 therefore preserves the repository result `F_{EX} = 1650.8 N`. Because the owner
asked for a formula-based attempt but did not yet confirm the final disposition of
8.1, the task honestly remains `MISMATCH / OWNER_REVIEW_PENDING`.

## Aggregate state after R8

- Matching comparisons: 67.
- Total `MISMATCH` comparisons: 7.
- Owner-confirmed answer-key errors: `1.10`, `2.3`, `4.13`, `6.2`, `7.8`.
- Owner review still pending: `8.1`, `9.1`.

## Quality gates

- Task 7.8 changes disposition without changing its derivation or numerical results.
- Task 8.1 carries the supplied equation, the closed-system `Δm = 0` step, both-body
  cross-check and explicit explanation of the doubled key value.
- Generated task Markdown, premium HTML, report and manifest agree on 7 mismatches,
  5 confirmed key errors and 2 open reviews.
- Generated artifacts remain deterministic and contain no absolute owner-drive path.
- Automated tests and mobile/desktop browser checks pass before commit.

## Release boundary

R8 updates repository review artifacts only. It does not publish to production,
attest public rights, alter the public corpus, or claim owner confirmation for 8.1.
