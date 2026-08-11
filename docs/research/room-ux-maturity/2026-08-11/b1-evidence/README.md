# Reading Room Option B · B1 evidence

Date: 2026-08-11
Status: automated local acceptance evidence; not owner-live and not production evidence.

## Scope

B1 replaces unbounded and inconsistent corpus cards with a bounded semantic inventory while preserving the existing LocalDb, corpus import, protected-membership, Reader and Trainer contracts.

- Ben-Yehuda home: 12-item ready preview plus an explicit route to all 796 ready works.
- My Texts: compact semantic rows, 48-item browse page and incremental reveal.
- Protected study corpus: the same row grammar, 48-item browse page and incremental reveal.
- Real title links and sibling secondary controls; no interactive element is nested inside another.
- Persistent field labels, 24 px hard target floor, AA text contrast and no horizontal overflow.

## Gate result

Command:

```text
node scripts/premium/room-ux-maturity-browser-smoke.js --stage=B1 --out=docs/research/room-ux-maturity/2026-08-11/b1-evidence
```

Result: `PASS 90/90 · B1 gate` across 380×844 RU/light, 380×844 HE/RTL/dark and 1280×900 RU/light.

| Surface | 380 px mounted rows | 380 px row height | Initial DOM (RU) |
|---|---:|---:|---:|
| Ben-Yehuda | 12 | 84–87 px | 737 |
| My Texts (65 seeded) | 48 | 84 px | 741 |
| Study Songs (81 seeded) | 48 | 96 px RU / 101 px HE | 1,074 |

Every matrix entry reports `nestedInteractive=0`, `smallTargets=0`, `unlabeledControls=0`, `contrastFailures=0` and `overflowPx=0`. `metrics.json` is the machine-readable source of truth.

## Visual evidence

For every locale/viewport/surface pair the folder contains:

- a top-of-surface screenshot (`<viewport>-<locale>-<theme>-<surface>.png`);
- a row-focused screenshot (`...-<surface>-rows.png`) so the compact inventory itself is reviewable;
- a hub screenshot for navigation context.

The corpus and personal-text data are deterministic smoke fixtures. They prove layout and interaction contracts, not linguistic quality or an owner-live account flow.
