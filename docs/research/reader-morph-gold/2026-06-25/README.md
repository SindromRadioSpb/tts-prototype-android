# R1.0 — Reader-morph resolver gold eval (2026-06-25)

Gold-evaluation artifact set for the tap-morphology resolver (Reading Room "морфология-на-тапе").
Purpose: measure the **true** precision of the resolver on **archaic, vocalized** Hebrew
(baked Ben-Yehuda), independent of the Dicta silver oracle — which is circular and drifts on
archaic text. This breaks that circularity with **human gold** annotated by the owner.

Part of the R1 plan in [`docs/planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md`](../../../planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md)
(§R1 BUILD SPEC). Measure-before-code (R10).

## Status

**RAW — awaiting owner annotation.** The worksheet's `gold_pos` / `gold_lemma` / `verdict`
columns are empty. The scored report does not exist yet; it is produced by `gold:score` once
the worksheet is annotated.

## Files

| File | Role | Edit? |
|---|---|---|
| `reader-morph-gold-worksheet.tsv` | **The worksheet — 180 homograph-focused tokens to hand-annotate.** | ✏️ **YES — edit this** |
| `reader-morph-gold-LEGEND.md` | How to fill it: POS vocab, lemma rules, verdict semantics, columns. | read-only |
| `reader-morph-gold-worksheet-PREVIEW.tsv` | First 15 rows, for a quick RTL/format sanity-check. | derived — don't edit |
| `reader-morph-gold-report.json` | Scorer output (precision/recall/coverage). Created by `gold:score`. | derived — don't edit |

Scratch/cache (gitignored, **not** here): the Dicta context cache and the ordinary audit
report live in `.tmp/benyehuda/` by design — they are disposable.

## How it was generated

- **Command:** `npm run gold:worksheet`  (= `node scripts/premium/reader-morph-audit.js --worksheet=180`)
- **Producer:** `scripts/premium/reader-morph-audit.js` (`--worksheet` mode) — dev-only harness; nothing ships, no SW bump.
- **Source commit:** harness landed in `b193ca0` (`feat(resolver): R1.0 gold eval harness`); this folder lands in the path-stabilization commit that follows.
- **Sampling:** deterministic, **homograph-weighted** (not corpus base-rate). Pool of 380 rows
  across 35 works; strata `collision=1 · tail=71 · hedged=54 · control=36 · fill=18`.
  `nakdan_pos` (Dicta silver, **reference only**) populated on 171/180.
- **Regenerate** (identical output, deterministic): `npm run gold:worksheet`. It refuses to
  overwrite an annotated worksheet without `--force` — so annotate a copy or commit first.

## Annotate → score

1. Open `reader-morph-gold-worksheet.tsv` in Excel / Google Sheets / LibreOffice (UTF-8 + BOM
   → Hebrew and niqqud render correctly, RTL per cell).
2. Fill **`gold_pos`** (required to score a row) and **`gold_lemma`** per the rules in
   `reader-morph-gold-LEGEND.md`. `verdict` is optional: `ambig` = both readings genuinely
   valid, `skip` = unjudgeable (OCR/garbage). Annotate in any order / in batches.
3. Save in place, then score:

   ```
   npm run gold:score
   # = node scripts/premium/reader-morph-audit.js --gold=docs/research/reader-morph-gold/2026-06-25/reader-morph-gold-worksheet.tsv
   ```

   It counts only filled rows (reports coverage X/N) and writes `reader-morph-gold-report.json`
   here. Commit the annotated worksheet + report so the gold pass is preserved.

## What the score means

Headline = **precision of «exact»** vs human gold (true trust of the «точно» badge), plus
honest-degradation recall, over-hedge rate, lemma accuracy, **Nakdan-silver ↔ gold agreement**
(how much to trust Dicta on archaic — retroactively validates/discounts every prior
silver-based number, incl. Epic 1's 90.3%), per-stratum/label breakdown. Because sampling is
homograph-weighted, read precision **per stratum**, not as a corpus base-rate.
