# C4 R&D report — live

## Session state

- Charter: C4, started 2026-07-25 by explicit owner command `стартуй C4`.
- Baseline HEAD: `7116cb9f`.
- Status: `IN_PROGRESS / UNDERPOWERED`.
- Real benchmark evidence: 0/20 pairs.
- Personal-note reads: 0.
- Production/OAuth changes: 0.
- FSRS/`review_log`/grade/progress writes: 0.

## Preflight

- Д6-A portfolio research-go: PASS.
- C4 in `STATUS.md`: `PLANNED / RUNNABLE #4` before this session.
- H1/H2 monitor stop condition affecting C4: none recorded.
- C4 data/UI prerequisite: PASS (`notes_v2` + `note_occurrences`, v3.11.241 work).
- Hard gate before first note read: NOT YET EXERCISED; scope/consent/provenance remain mandatory.

## Engineering evidence

The prototype is intentionally research-only and synthetic until the owner-live ceremony. It does
not call Hermes, a provider, LinguistPro APIs or a database.

Commands run from repository root:

```text
node --check docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/export-owner-notes.browser.js
node --check docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/c4-benchmark.mjs
node --test docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/c4-benchmark.test.mjs
git check-ignore -v docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/private/owner-notes.json
git diff --check
```

Result: syntax PASS; focused tests 6/6 PASS. Covered exact-20 and duplicate rejection, exact
affirmation, dataset binding, expiry, revoke→typed failure, content-free hash chain, ledger flush
before packet file, blind threshold 14/20, ties against success, and browser selector no-network +
exact-sample invariants. Private owner path is matched by the local `.gitignore`.

Primary rendering is label-blind: it suppresses explicit «note supplied» metadata, while a separate
safety gate will test source separation. The owner may still recognize familiar wording; therefore
the study is label-blind, not guaranteed inference-blind.

## Result vs threshold

Not available. With 0/20 pairs, no GO/NO-GO claim is permitted.

## Owner-live remaining

Prepare the frozen private 20-note dataset, create the temporary consent receipt, execute the two
clean-context answer branches, complete blind ratings, and record only aggregate counts here.

## Files created/changed

- `docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/` — preregistration, report, handoff,
  browser-local selector and fail-closed benchmark harness.
- `05_HORIZON_3_RND_CHARTERS.md`, `STATUS.md`, `C4_NOTES_SURFACE_RECON_2026_07_25.md` and H2.7
  evidence — gate-consumer sweep from `PLANNED` to `IN_PROGRESS / UNDERPOWERED`.

No production source, migration, OAuth registry, Agent Access handler or Hermes installation was
changed. Scoped commit hashes are recorded in the final session handoff after commit creation.
