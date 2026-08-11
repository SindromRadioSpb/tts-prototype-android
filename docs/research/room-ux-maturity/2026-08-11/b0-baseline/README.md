# B0 visual and geometry baseline

Status: **expected-red baseline**, captured from the isolated local browser fixture before Option B
application changes.

The matrix covers Ben-Yehuda, My Texts, and Study Songs at:

- `380 × 844`, RU/light;
- `380 × 844`, HE/RTL/dark;
- `1280 × 900`, RU/light.

`metrics.json` records DOM/item bounds, first useful content, semantic nesting, form labels,
touch-target geometry, approximate computed-color contrast, overflow, and switcher/meta state.
It is product-shape evidence from synthetic corpora (65 personal texts and 81 group songs), not
owner-live data and not an iPhone acceptance result.

Reproduce from the repository root:

```powershell
npm run smoke:room-ux-maturity:red -- --write-baseline
```

The red mode exits successfully only when the known pre-B1 failures are actually detected. Later
stages run the same browser script in green `--stage=Bn` mode against progressively stronger
contracts. Screenshots are unannotated first-viewport captures; the JSON ledger is the numeric
oracle.
