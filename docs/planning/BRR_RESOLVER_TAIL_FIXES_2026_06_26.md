# BRR resolver tail-fixes — gold-gated plan (2026-06-26)

**Status:** APPROVED (owner: "full sweep, resolution-first") — build in progress.
**Predecessor:** R1.0 gold eval (`docs/research/reader-morph-gold/2026-06-25/`, commit `522c965`).
**Roles:** R10 lead (measure-before/after-code) · R1 (lexicographer, no fabrication) · R4 (honesty UX) · R5 (offline-first).

## Why

R1 gold (vs human gold, non-circular) found «точно» is trustworthy on **clean** cells
(control 97.2%) but leaks on a **vocalized-homograph tail** (oversampled tail 26.5%). This plan
fixes that tail with offline, Room-only levers, each measured on the gold set before/after.

## Measured composition of the 51 false-exacts (R10)

| bucket | n | examples | fix type |
|---|---:|---|---|
| participle/beinoni → adj/noun | 17 | סוֹעֶרֶת, מַעֲצִיב, הוֹרָה, מְחַנֵּךְ, הַמַּקִּיף | honesty |
| adverbs | 11 | שׁוּב×3, הַיּוֹם×3, בֶּאֱמֶת, לְהֶפֶךְ, הַרְבֵּה, לְעֵרֶךְ | honesty |
| prepositions+suffix | 10 | בְּתוֹכוֹ, בְּפָנָיו, מֵעָלַיִךְ, לִקְרָאתִי, בִּשְׁבִילֵנוּ, לְשֵׁם | resolution |
| names (R2/F6) | 7 | יַעֲקֹב, אֵירוֹפָּה, שָׁלוֹם, הִלֵּל | resolution |
| numerals | 6 | אֶלֶף×3, מֵאָה, מֵאוֹת, שֵׁנִי | resolution |

(extract: `node -e` over the annotated worksheet; reproducible.)

## Regression gate — `--regold` (built first)

`scripts/premium/reader-morph-audit.js --regold=<annotated.tsv>`: re-resolve each annotated gold
token **live** with the *current* resolver, keep the human gold columns, re-score. Turns the gold
set into a fixed before/after gate. **Invariant after every lever:** `control` precision stays
≈97.2% (no regression on clean cells) while `tail` precision + honest-degradation recall rise.
Scoring is shared with `--gold` via `computeMetrics()`.

## Levers (order = resolution-first)

All Room-only, offline, in the honest-label / `functionGate` layer (`reader-morph.js` +
`notes-autogen.js` lock-step — keep `autogen-parity` green). `index.html`/builder untouched.

1. **L1 — inflected-preposition gate (10).** Extend `functionGate` `prep+suf` (`reader-morph.js:220`):
   add missing bases (תוך/פני/סביב/לקראת/שביל/עד/שם/מעל…); allow a ב/ל proclitic *before* a
   prep+suffix segmentation (currently only ו/ש stripped). Correct label = «предлог». Highest precision.
2. **L2 — numeral closed-class (6).** Extend `NUM_GLOSS` (אלף/מאה/אלפים/מאות + ordinals) → numeral.
3. **L3 — homographic-adverb demotion (11).** Curated list (שוב/היום/באמת/להפך/הרבה/לערך) → when
   form-first lands on a content cell, demote «точно»→«вероятно» + adverb gloss as alt (Epic-1 F1–F4).
4. **L4 — beinoni honesty demotion (17, biggest, highest-risk).** Form-first on a participle form →
   don't claim «точно» (verb/noun/adj-ambiguous). Sub-decision at build: universal offline demote vs
   Tier-3-gated (existing participle-soften). MUST NOT tank control 97.2% — measure both on gold.
5. **L5 — names gazetteer (R2/F6, 7).** Offline Wikidata/KIMA personal+place list → suppress
   morphology, label proper noun. Catches יעקב/אירופה/שלום/הלל; org-from-context not reliable.

## Norms / gates

Room-only · offline-first (no network/consent) · gold-gated each lever (`--regold`) ·
`autogen-parity`/`reader-parity`/`reader-context`/`smoke:reader-morph` green before push ·
commit+push per lever (deploy-by-default; dev-harness changes are inert) · measure-before/after.
