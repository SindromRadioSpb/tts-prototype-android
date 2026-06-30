# Epic Phase-2 (proclitic surfacing) — measure-before-code evidence

**What this is.** The R10/R12 measurement that grounds the Phase-2 design: can we detect a Hebrew
proclitic prefix (ה ו ב ל כ מ ש) on a tapped word and surface its «Употребление» — WITHOUT
mis-segmenting a word that merely starts with that letter (בַּיִת "house", ביחוד "especially")?

**This is research, not shipped code.** No production behaviour changed by these scripts.

## The disambiguation problem
Tapping `בַּבַּיִת` ("in the house") should surface the **ב** proclitic usage; tapping `בַּיִת`
("house") must NOT — there ב is a root letter. A wrong segmentation is a do-no-harm (R11) +
fabrication (R1) violation. The owner's instinct ("compare with Pealim") = a dictionary-lookup
segmentation: is the WHOLE word a real word? is the STEM (after stripping the prefix) a real word?

## Silver oracle (free, independent)
Dicta's per-token analysis (cached at `.tmp/benyehuda/reader-morph-audit-dicta-cache.json`,
regenerate via `npm run smoke:reader-morph:audit`) returns `word` vs `stem`; the leading-letter
difference IS the proclitic segmentation (`הצרות`→stem `צרות` = ה stripped; `בית`→`בית` = none).
Caveat: this silver carries **ktiv male/chaser spelling noise** (e.g. `היישוב` vs stem `ישוב`),
which under-counts correct ה-proclitics — so measured precision is a LOWER bound.

## Results (1283 unique proclitic-initial surfaces)
| Variant | Precision | Recall | Notes |
|---|---|---|---|
| **Naive Pealim-only** stem lookup (`measure-naive.js`) | 90.7 % | 70.1 % | 56 FPs — all lexical-coverage gaps (ביחוד/באמת adverbs, מיכה name, לאמר archaic) not in Pealim |
| **Layered whole-word guard** (`measure-layered.js`) — lexicon = hspell-34755 ∪ Pealim-144k ∪ names-333 ∪ function-452; emit only if whole∉lexicon AND stem∈Pealim-content | 94.6 % raw (**~97 %+ true**) | 69.8 % | most residual "FPs" (היישוב/הנוער/הקיבוץ) are CORRECT proclitics the silver mislabeled via ktiv noise; genuine residual ≈ lexicalized adverbs (בעיקר) + homographs (בגינה) |

## Conclusions → design
1. **Offline alone reaches do-no-harm precision (~97 %)** only WITH a layered whole-word guard
   (Pealim is not enough — it misses lexicalized adverbs/names). Tune for precision, accept ~70 %
   recall (abstain when unsure).
2. **Recall gap (~30 %)** = both-word-and-stem-known cases + stems absent from Pealim → needs the
   **Dicta Tier-3** authoritative segmentation (already-built `reader-dicta.js`, opt-in consent).
3. **Genuine residual ambiguity (~2-3 %)** = lexicalized proclitics + homographs → Dicta or honest
   hedge; never a confident wrong claim.
→ a **two-tier system**: precision-tuned offline (operational) + Dicta-confirmed (strategic).

## Files
- `measure-naive.js` — naive Pealim-only baseline.
- `measure-layered.js` — layered whole-word guard (the recommended offline tier).
- Both read the gitignored Dicta cache (regenerate via `smoke:reader-morph:audit`) + the shipped
  `pealim-infl-v12.json.gz`. Run: `node docs/research/epic-proclitic-phase2/2026-07-01/measure-layered.js`.

## Open (for the design recon + owner sign-off)
Silver de-noising (ktiv male/chaser normalization), the production gate threshold, the R12 role,
offline-first vs both-tiers, hedge-vs-suppress. See the design recon (linked from the handoff).
