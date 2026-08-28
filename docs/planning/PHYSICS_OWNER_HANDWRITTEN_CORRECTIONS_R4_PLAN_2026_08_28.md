# PHYSICS-OWNER-HANDWRITTEN-CORRECTIONS-R4

Date: 2026-08-28
Status: implemented in local/repository review artifacts; not published to production

## Owner decision

The owner authorized a visual review of three selected handwritten solution PDFs and
explicitly rejected OCR as unnecessary for this correction pass. The handwritten work
is evidence for the scoped decisions below; it is not treated as a new bulk-ingestion
source and is not copied into the repository.

## Pinned evidence

| Task | Source filename | Pages | SHA-256 | Evidentiary role |
|---|---|---:|---|---|
| 1.5 | `1.5 верно.pdf` | 6 | `62b94e3c010206edd0d7386b820358844117d5b394f4036f22b4ad31f9dd0d2e` | Correct the solution and verify all four key values |
| 1.10 | `1.10.pdf` | 4 | `5e707357d47d56d8d9898030e4a81a6f42b9fb5ba87253b2030aa1a5f6915cee` | Verify the repository result and adopt the strongest exam-ordering practices |
| 6.1 | `6.1 верно.pdf` | 2 | `ca7a8a74e6d6a283d1c453da3a6240ab5415566f79f52148ad20199c05ac7b64` | Correct the review disposition and verify the listed works |

Method: page-by-page visual inspection of rendered PDF pages. OCR and automated
handwriting transcription were not used. Absolute owner-drive paths are deliberately
excluded from committed and generated artifacts.

## Implemented decisions

### Task 1.5

- Choose east as positive and record the truck's deceleration as
  `a = -0.6 m/s^2`.
- Derive, in order, `v_0 = 21 m/s`, `v_B = 15 m/s`, truck displacement to the
  meeting `79.2 m`, car displacement `100.8 m`, car speed `25.2 m/s` west, and
  truck meeting speed `18.6 m/s` east.
- Mark comparison `EXACT` and owner disposition `OWNER_CONFIRMED_MATCH`.

### Task 1.10

- Preserve the repository result: B travels `26.095 s`; A travels `40.095 s`;
  `v_B = 36.095 m/s`; meeting coordinate `x = 601.42 m`.
- Show the common clock, coordinate equality, standard quadratic form,
  `D = 1780`, both roots, rejection of the negative root, time-offset conversion,
  speed-limit comparison and coordinate cross-check.
- Keep comparison `MISMATCH`, but set disposition
  `OWNER_CONFIRMED_KEY_ERROR`: only part ג of the key is wrong (`391.42 m`).

### Task 6.1

- Use the down-slope displacement shown in the reviewed solution.
- State the force-displacement angles before calculation: normal `90°`, friction
  `180°`, weight `50°`, applied force `50°`.
- Derive `N = 30.64 N`, `f = 9.19 N`, `W_N = 0`, `W_f = -13.79 J`,
  `W_G = 192.84 J`, `W_Q = 154.27 J`, and `W_total = 333.3 J`.
- Mark comparison `EXACT` and owner disposition `OWNER_CONFIRMED_MATCH`.

## Mismatch state after R4

- Confirmed answer-key error, no further mathematical disposition required: `1.10`.
- Owner review still pending, and no solution content changed in R4: `2.3`, `4.13`,
  `6.2`, `6.12`, `7.8`, `8.1`, `9.1`.
- Aggregate comparison count remains eight because the confirmed key error is still a
  truthful `MISMATCH`; only seven are open decisions.

## Quality gates

- The independent, localized and exam ledgers contain the same exact 74-task set.
- Provenance records visual review without falsely claiming OCR or bulk transcription.
- Task Markdown and premium HTML show distinct statuses for a confirmed key error and
  an open mismatch.
- 1.5, 1.10 and 6.1 include full college-exam sequencing, explicit multiplication,
  semantic indices and stepwise equation solving.
- The generated guide, comparison report and manifest agree on 8 total mismatches,
  1 confirmed key error and 7 open reviews.
- Generated artifacts are deterministic and contain no absolute owner-drive path.
- Desktop and 380 px browser views must remain readable and free of horizontal
  overflow or console errors.

## Release boundary

R4 updates local/repository review artifacts only. It does not publish to production,
attest rights, modify the public corpus, or resolve the seven tasks still under owner
review.
