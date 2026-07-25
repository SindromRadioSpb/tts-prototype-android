# C4 R&D report — live

## Session state

- Charter: C4, started 2026-07-25 by explicit owner command `стартуй C4`.
- Baseline HEAD: `7116cb9f`.
- Status: `IN_PROGRESS / DATASET_BLOCKED / UNDERPOWERED`.
- Real benchmark evidence: 0/20 pairs.
- Agent/Hermes personal-note reads: 0.
- Production/OAuth changes: 0.
- FSRS/`review_log`/grade/progress writes: 0.

## Preflight

- Д6-A portfolio research-go: PASS.
- C4 in `STATUS.md`: `PLANNED / RUNNABLE #4` before this session.
- H1/H2 monitor stop condition affecting C4: none recorded.
- C4 data/UI prerequisite: PASS (`notes_v2` + `note_occurrences`, v3.11.241 work).
- Owner gave the exact temporary-consent affirmation on 2026-07-25: PASS.
- Owner-local selector ran inside the authenticated LinguistPro origin and stopped fail-closed with
  `C4_NOT_ENOUGH_ELIGIBLE_NOTES eligible=1`; no private dataset was exported or copied.
- Hard gate before first agent/Hermes note read: NOT YET EXERCISED; dataset-bound receipt and
  exposure-before-packet provenance remain mandatory.

## Engineering evidence

The prototype is intentionally research-only. The CLI harness does not call Hermes, a provider,
LinguistPro APIs or a database. The separate owner-side selector reads only local OPFS inside the
authenticated LinguistPro origin and contains no network primitive.

Commands run from repository root:

```text
node --check docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/export-owner-notes.browser.js
node --check docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/c4-benchmark.mjs
node --test docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/c4-benchmark.test.mjs
git check-ignore -v docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/private/owner-notes.json
git diff --check
```

Result: syntax PASS; focused tests 7/7 PASS. Covered exact-20 and duplicate rejection, exact
affirmation, dataset binding, expiry, revoke→typed failure, content-free hash chain, ledger flush
before packet file, blind threshold 14/20, ties against success, and browser selector no-network +
exact-sample invariants. Private owner path is matched by the local `.gitignore`.

The first owner-local run exposed a performance defect in the selector's sequential WebCrypto
ordering. The selector now uses a synchronous UTF-8 SHA-256 implementation; five ASCII/Unicode
fixtures match Node `crypto` exactly, so the frozen seed and ordering are unchanged. The corrected
run completed and produced the honest `eligible=1` stop above.

Final consent audit before owner-live strengthened the exact affirmation to include explicit
external-chat retention acknowledgement; no real data had been read under the earlier wording.

Primary rendering is label-blind: it suppresses explicit «note supplied» metadata, while a separate
safety gate will test source separation. The owner may still recognize familiar wording; therefore
the study is label-blind, not guaranteed inference-blind.

## Result vs threshold

Not available. With 0/20 pairs and only 1/20 eligible private notes, no GO/NO-GO claim is permitted.

## Owner-live remaining

Add at least 19 more `user_touched=1` word-study notes containing a user-authored meaning,
mnemonic, explanation or example, then rerun the unchanged selector. Only after it yields exactly
20 notes may the dataset-bound consent receipt, exposure ledger, clean-context branches and blind
ratings be created.

## Files created/changed

- `docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/` — preregistration, report, handoff,
  browser-local selector and fail-closed benchmark harness.
- `05_HORIZON_3_RND_CHARTERS.md`, `STATUS.md`, `C4_NOTES_SURFACE_RECON_2026_07_25.md` and H2.7
  evidence — gate-consumer sweep from `PLANNED` to
  `IN_PROGRESS / DATASET_BLOCKED / UNDERPOWERED`.

No production source, migration, OAuth registry, Agent Access handler or Hermes installation was
changed. Scoped engineering commit: `9ef81893` (`research(c4): start private notes benchmark`).
