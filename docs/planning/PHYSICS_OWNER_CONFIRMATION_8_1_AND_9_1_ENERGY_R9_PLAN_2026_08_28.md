# PHYSICS-OWNER-CONFIRMATION-8.1-AND-9.1-ENERGY-R9

Date: 2026-08-28
Status: implemented in local/repository review artifacts; not published to production

## Owner decision for task 8.1

The owner confirmed the R8 result for task 8.1. The repository therefore changes only
the disposition from `OWNER_REVIEW_PENDING` to `OWNER_CONFIRMED_KEY_ERROR`; the verified
result remains `F_{EX} = 1650.8 N`. The printed `3300 N` is the sum of the magnitudes of
the equal and opposite interaction forces, not one force acting between the bodies.

## Source audit for task 9.1

The one-page source PDF was visually inspected without OCR:

- Filename: `9.1.pdf`
- SHA-256: `0a850c61eddfdea81a4c3f883b1fdbf125c31d126b39544ac6611a1a8e4c3224`
- The diagram makes the incline tangent to arc AB and makes `α = 30°` the central
  angle subtended by the arc.
- The Hebrew condition explicitly says `כוח דחף קבוע T השווה 2 ק"נ`: a constant
  thrust force `T = 2 kN`.
- The thrust ceases at B; the condition does not say that it merely reaches a maximum
  at B.

If `2 kN` were only a terminal maximum of an otherwise variable thrust, a function
`T(s)` or an equivalent graph would be required. That is a different, underdetermined
problem and is not the printed task.

## Direct full-path energy solution

Choose the initial rest point A and the final rest point after travelling distance S.
There is no friction, and the normal reaction performs no work. The constant thrust
acts only along arc AB.

- Arc length: `l_{AB} = R * α`, with `α = π/6 rad`.
- Rise on the arc: `h_{AB} = R * (1 - cos(α))`.
- Rise on the tangent incline: `h_{BC} = S * sin(α)`.
- Initial and final kinetic energies are both zero.

The single energy equation for the complete path is

`T * R * α = m * g * [R * (1 - cos(α)) + S * sin(α)]`.

Therefore

`S = [T * R * α/(m * g) - R * (1 - cos(α))]/sin(α) = 168.03 m`.

The existing two-stage route gives the same result:

1. `K_B = T * R * α - m * g * R * (1 - cos(α)) = 82419.2 J`.
2. `K_B = m * g * S * sin(α)`, hence `S = 168.03 m`.

## Exact reconstruction of the answer-key value

The printed `192.146 m` is reproduced exactly by

`S_{key} = T * R * α/(m * g * sin(α)) = 192.146 m`.

That equation assigns the entire thrust work to the rise after B and omits the rise
already completed on arc AB:

- omitted height: `R * (1 - cos(α)) = 12.058 m`;
- omitted gravitational work: `11828.6 J`;
- path overstatement: `12.058/sin(30°) = 24.115 m`;
- `192.146 - 24.115 = 168.031 m`.

This is strong evidence that the key is erroneous. Task 9.1 nevertheless remains
`MISMATCH / OWNER_REVIEW_PENDING` until the owner explicitly confirms its disposition.

## Aggregate state after R9

- Matching comparisons: 67.
- Total `MISMATCH` comparisons: 7.
- Owner-confirmed answer-key errors: `1.10`, `2.3`, `4.13`, `6.2`, `7.8`, `8.1`.
- Owner review still pending: `9.1` only.

## Quality gates

- The owner confirmation changes 8.1 status without changing its derivation or result.
- Task 9.1 carries a complete direct energy derivation and a two-stage cross-check.
- The source wording `קבוע` and the variable-thrust counterfactual are stated explicitly.
- The answer-key number is reproduced and its omitted physical term is identified.
- Generated Markdown, premium HTML, report and manifest agree on 7 mismatches,
  6 confirmed key errors and 1 open review.
- Automated tests and the R9 desktop browser check pass before commit; the responsive
  layout itself is unchanged from the prior R8 mobile/desktop gate, so R9 does not claim
  a fresh mobile-device or mobile-emulation run.

## Release boundary

R9 updates repository review artifacts only. It does not publish to production,
attest public rights, alter the public corpus, or claim owner confirmation for 9.1.
