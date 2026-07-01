# Context-overlay — P2 measure-before-code artifacts (2026-07-02)

Measurement set for the **offline context-disambiguation overlay** (strategic task #1).
Design + approved forks: `docs/planning/BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md` (§8/§9).

## Files

| File | Role | Status | Edit? |
|---|---|---|---|
| `budget-report.json` | Corpus-wide selection census: entry counts by merge-decision reason, sidecar size projection, enrich worklist size. | derived (regenerable) | no |
| `promote-rate.json` | Measured path-A promote-rate: 104/398 = **26.1%** of candidate tokens promote to a context-exact reading once the Dicta context niqqud is present (+78 soften). | derived (regenerable) | no |
| `promote-rate-measure.js` | The measurement script (runs over the Epic-1 audit Dicta cache, which stores FULL tokens). | source | no |

## Headline numbers (full census, 2026-07-02, bake in flight — 687/796 works covered)

- Sidecar budget: **2.45 MB total / ~3.2 KB per work** (62,820 selected entries of 347,614 tokens).
- Available with ZERO extra Dicta calls: 6,835 gloss-demotions (B) + 10,360 softens (C)
  + 1,515 promotions (A, from already-rich sentences) = **18,710 honest improvements**.
- `--enrich` worklist: 21,364 legacy sentences contain dict-reachable path-A candidates;
  at the measured 26.1% promote-rate that buys **≈11.5K more context-exact promotions**
  (one gentle circuit-breaker pass, ~5h; run only AFTER the proclitic bake finishes —
  the producer refuses to co-write the shared cache).
- Recon §8 D4 correction: the recon estimated the targeted-enrich set at 4–7K sentences;
  **measured = 21.4K** (60% of legacy sentences hold ≥1 candidate). Still far below the
  full 43K re-fetch, and the value side is now measured (26.1%), not assumed.

## How to regenerate

```bash
node scripts/premium/build-context-overlay.js --budget          # census + budget-report.json + enrich worklist
node docs/research/context-overlay/2026-07-02/promote-rate-measure.js   # promote-rate (needs .tmp audit cache)
```

Scratch/cache inputs (gitignored, disposable): `.tmp/benyehuda/proclitic-overlay-dicta-cache.json`
(sentence→tokens; RICH entries carry nq/lem/lems/bin), `.tmp/benyehuda/reader-morph-audit-dicta-cache.json`
(Epic-1 audit cache, full parseToken shape), `.tmp/benyehuda/context-overlay-enrich-worklist.json`.
