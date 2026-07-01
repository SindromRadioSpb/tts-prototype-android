# Context-overlay — P2 measure-before-code artifacts (2026-07-02)

Measurement set for the **offline context-disambiguation overlay** (strategic task #1).
Design + approved forks: `docs/planning/BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md` (§8/§9).

## Files

| File | Role | Status | Edit? |
|---|---|---|---|
| `budget-report.json` | Corpus-wide selection census: entry counts by merge-decision reason, sidecar size projection, enrich worklist size. **v2 = post-critique producer** (plain-skeleton keys + ktiv alias, sents discipline, no dictReachable filter, B3 guard). | derived (regenerable) | no |
| `promote-rate.json` | Measured path-A promote-rate: 104/398 = **26.1%** of candidate tokens promote to a context-exact reading once the Dicta context niqqud is present (+78 soften). Homograph-weighted sample — treat as an UPPER budget estimate (CI 21.8–30.4%), not a lift claim (R10#5). | derived (regenerable) | no |
| `promote-rate-measure.js` | The measurement script (runs over the Epic-1 audit Dicta cache, which stores FULL tokens). | source | no |
| `probe-keys.js` / `probe-replay.js` / `probe-dictreach.js` | Adversarial-critique probes (R10): ktiv male/chaser key-mismatch census (4.12% he-column / 5.36% producer), phantom-baseline on niqqud-less rows (6.25%), dictReachable false-negatives (14.6% of promotables). Numbers cited in recon §10. | source (evidence) | no |

## Headline numbers (full census v2, 2026-07-02, bake in flight — 687/796 works covered)

- Token match-rate after the B1 keying fix: **98.6%** (345,235/349,978; was 94.7% with the
  vocalized-skeleton keys). Authoritative sentences 45,877 (94%); 2,445 honestly partial;
  0 hash collisions; 4,557 ktiv alias keys; B3 promotion guard already rejected 2 marriages.
- Available with ZERO extra Dicta calls: 6,994 gloss-demotions (B) + 11,007 softens (C)
  + 2,200 promotions (A, from already-rich sentences) = **20,201 honest improvements**.
- `--enrich` worklist: **32,992 legacy sentences** (grew from 21.4K after dropping the
  dictReachable filter that forfeited 14.6% of real promotions, R10#3); at ~26% promote-rate
  ≈ **up to ~27K additional promotions** across 102K pending candidates (one gentle
  circuit-breaker pass, ~8h; the producer takes a lockfile and refuses to co-write the cache).
- Local sidecar size with pending-nq intermediates: 5.27 MB; SHIPPED size will be far smaller —
  the rollout invariant pushes only works with `entriesPendingNq === 0` (post-enrich re-bake
  resolves candidates to either a promoted entry or an authoritative miss).
- Recon §8 D4 correction: recon estimated the enrich set at 4–7K sentences; **measured = 33K**.
  Still below the full 48.8K re-fetch, and the value side is measured, not assumed.

## How to regenerate

```bash
node scripts/premium/build-context-overlay.js --budget          # census + budget-report.json + enrich worklist
node docs/research/context-overlay/2026-07-02/promote-rate-measure.js   # promote-rate (needs .tmp audit cache)
```

Scratch/cache inputs (gitignored, disposable): `.tmp/benyehuda/proclitic-overlay-dicta-cache.json`
(sentence→tokens; RICH entries carry nq/lem/lems/bin), `.tmp/benyehuda/reader-morph-audit-dicta-cache.json`
(Epic-1 audit cache, full parseToken shape), `.tmp/benyehuda/context-overlay-enrich-worklist.json`.
