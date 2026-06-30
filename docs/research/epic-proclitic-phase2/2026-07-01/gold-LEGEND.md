# Proclitic GOLD worksheet — verification guide (R1 / owner)

**Goal.** Produce an INDEPENDENT gold standard for proclitic segmentation, so we can honestly
measure the Phase-2 detector — **without** validating it against Dicta (the future Tier-2 oracle),
which would be circular ([[feedback_independent_oracle_gate]]). Your verdicts on the hard cases
ARE the independent oracle.

**The file to edit:** `gold-worksheet.tsv` (332 rows, hard cases first). Fill the **`R1_VERDICT`**
column. Rows are pre-sorted so the do-no-harm-critical classes are at the TOP — verify those first;
the agreeing content sample at the bottom can be spot-checked or trusted.

## How to fill `R1_VERDICT`
For each `surface` (vocalization in `niqqud`), write what the proclitic prefix sequence actually is:
- **`-`** → NO proclitic (the leading letter is a root/part of the word). *e.g. בית → `-`, משה → `-`, מורה → `-`, ביחוד → `-`.*
- **the prefix string** → e.g. `ב` (in), `ה` (the), `בה` (ב + fused article ה), `ולכשה` (multi-clitic stack, outermost-first).
- Leave blank to ACCEPT the `draft_proclitics` value as-is (so you only touch rows where the draft is wrong).
- Use `R1_NOTES` for the SENSE/label nuance, especially: **vav-consecutive** (write the ו but note "повеств. вав, не «и»"); **fossil** ("устойчивое — не живая приставка"); name residuals.

## Columns
- `stratum` — auto-class: **name-suspect** (proper noun residual — proclitic usually correct, but residual has no gloss) · **vav-consecutive** (וַ wayyiqtol — ו is narrative, NOT «and») · **fossil** (lexicalized adverb — expect `-`) · **archaic** (ל+ archaic infinitive — judge) · **content** / **other**.
- `depth` — number of stacked proclitics in the draft.
- `draft_proclitics` — Dicta-silver draft (`(unclear)` = Dicta diff wasn't a clean proclitic strip → please decide).
- `offline_agrees` — `Y/N` whether the offline heuristic matched the draft (`N` rows = where the detector would err → high value to verify).
- `needs_r1` — `YES` for every hard class + disagreement + niqqud-absent.
- `context` — the sentence (or `SEED — …` for injected hard-negative/canonical controls).

## Frozen ktiv-skeleton rule (declared before measurement, do not change after)
Comparison/lexicon-membership normalizes: niqqud-stripped → final-forms (ך→כ etc.) → a DOUBLED
mater collapsed (וו→ו, יי→י). Display keeps the real spelling. Applied symmetrically to detector
output and gold, so ktiv male/chaser noise cancels both ways.

## After you fill it
`gold-worksheet.tsv` → merged into `gold-frozen.json` → becomes the frozen gold the
`smoke:reader-proclitic` gate measures against (existence-precision ≥99 / labeled-seg ≥95 /
per-category floors / top-frequency 100%). Then Phase-2 offline detector is built and measured.
Regenerate the draft (re-pull corpus sample) with `npm run build:proclitic-gold` — but your
verdict column is the source of truth; re-running overwrites the draft, so keep your edits in a copy
or we merge before regenerating.

## Seeds (injected controls — confirm these)
Hard-negatives that MUST resolve to `-`: בית · משה · מרים · לאה · לבן · מים · שמן · כלב · מורה · ברוך.
Canonical positives: ויאמר/ויהי/וילך/ותהי (ו, narrative) · בבית (`בה`) · ולכשהמלך (`ולכשה`, depth-5).
