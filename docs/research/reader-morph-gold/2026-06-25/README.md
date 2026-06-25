# R1.0 — Reader-morph resolver gold eval (2026-06-25)

Gold-evaluation artifact set for the tap-morphology resolver (Reading Room "морфология-на-тапе").
Purpose: measure the **true** precision of the resolver on **archaic, vocalized** Hebrew
(baked Ben-Yehuda), independent of the Dicta silver oracle — which is circular and drifts on
archaic text. This breaks that circularity with **human gold** annotated by the owner.

Part of the R1 plan in [`docs/planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md`](../../../planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md)
(§R1 BUILD SPEC). Measure-before-code (R10).

## Status

**ANNOTATED + SCORED (2026-06-26).** Owner hand-annotated 172/180 rows (8 `skip` — target token
not visible in the truncated context of the first batch; that producer bug is now fixed, see
below). 0 `ambig`. Report: `reader-morph-gold-report.json`.

## Results (verb-citation-aware; vs HUMAN gold, non-circular)

> Sampling is **homograph-weighted**, so the blended headline is NOT a corpus base-rate —
> read **per stratum** (`control` ≈ representative clean «exact»; `tail` = deliberately
> oversampled vocalized homographs).

| metric | value | reading |
|---|---|---|
| precision of «exact» — **control** | **35/36 = 97.2%** | the «точно» badge is trustworthy on clean cells |
| precision of «exact» — **tail** | 18/68 = 26.5% | the real leak: single-id vocalized homographs |
| precision of «exact» — blended | 54/105 = 51.4% | inflated-down by the oversampled tail |
| honest-degradation recall | 49/100 = 49.0% | of wrong/ambig, fraction NOT sold as «точно» |
| over-hedge rate | 18/52 = 34.6% | hedged but actually unique → lost moat value |
| lemma/lexeme accuracy | 91/172 = 52.9% (verb 92.9%, non-verb 45.1%; strict-string 37.8%) | non-verb dragged by tail false-exacts |
| **Nakdan-silver ↔ gold** | **143/165 = 86.7%** | Dicta is ~87% right on archaic → prior silver had ~13% noise |

**Finding:** «точно» is highly reliable on clean cells (~97%); the precision leak is concentrated
in **vocalized homographs that map to a single Pealim cell but read differently in context** —
adverbs (הַרְבֵּה→adverb, בֶּאֱמֶת→adverb, לְהֶפֶךְ→adverb), nouns (הוֹרָה→"parent", בְּחָזְקָה→noun),
participle-as-adjective (מַעֲצִיב, סוֹעֶרֶת), and names (בְּאֵירוֹפָּה→propernoun). The structural
collision-check can't catch these (the rival lexeme isn't in the Pealim verb-paradigm index).
This validates **R2 (F6 names gazetteer)** and surfaces a new lever — a curated context-POS
demotion list for high-frequency homographic adverbs/participles. Over-hedge 34.6% also shows
value left on the table (hedged cells that were actually decidable). Next steps are *improvement*
work to be planned, not part of R1 (measurement).

## Files

| File | Role | Edit? |
|---|---|---|
| `reader-morph-gold-worksheet.tsv` | The worksheet — 180 tokens, **annotated** (`gold_pos`/`gold_lemma` filled). | the gold record |
| `reader-morph-gold-report.json` | Scorer output (precision/recall/coverage). Regenerate with `gold:score`. | derived |
| `reader-morph-gold-annotation-summary.md` | Owner's annotation notes (coverage, skips, conventions). | owner record |
| `reader-morph-gold-LEGEND.md` | How it was filled: POS vocab, lemma rules, verdict semantics, columns. | read-only |
| `reader-morph-gold-worksheet-PREVIEW.tsv` | First 15 rows of the **raw** worksheet (format/RTL reference). | historical |

Scratch/cache (gitignored, **not** here): the Dicta context cache and the ordinary audit
report live in `.tmp/benyehuda/` by design — they are disposable.

## Known producer fix (next batch)

8 rows were `skip`ped because the `sentence` context truncated before the judged token on very
long lines. Fixed: the producer now windows the context **centered on the token** (`ctxWindow`,
±150 chars) so the token is always visible. Applies to future worksheets; this batch's already
annotated, so it's unaffected.

## How it was generated

- **Command:** `npm run gold:worksheet`  (= `node scripts/premium/reader-morph-audit.js --worksheet=180`)
- **Producer:** `scripts/premium/reader-morph-audit.js` (`--worksheet` mode) — dev-only harness; nothing ships, no SW bump.
- **Source commit:** harness landed in `b193ca0` (`feat(resolver): R1.0 gold eval harness`); this folder lands in the path-stabilization commit that follows.
- **Sampling:** deterministic, **homograph-weighted** (not corpus base-rate). Pool of 380 rows
  across 35 works; strata `collision=1 · tail=71 · hedged=54 · control=36 · fill=18`.
  `nakdan_pos` (Dicta silver, **reference only**) populated on 171/180.
- **Regenerate:** `npm run gold:worksheet`. Token *selection* is deterministic, but since the
  `ctxWindow` fix the `sentence` column is now windowed around the token — so a regen is no longer
  byte-identical to this batch's worksheet. It refuses to overwrite an annotated worksheet without
  `--force` — so annotate a copy or commit first.

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
