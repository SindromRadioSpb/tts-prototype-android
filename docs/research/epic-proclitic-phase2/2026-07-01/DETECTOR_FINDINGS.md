# Phase-2 offline detector — prototype measurement vs the R1 gold

**Prototype:** `detector-proto-v3.js` (FSA proclitic grammar + lexeme/name/fossil guards +
niqqud fused-article reconstruction), measured against the frozen R1 gold (332 rows).

## Algorithm (validated sound)
Skeleton (ktiv-normalized) → fossil guard → whole-word lexeme guard (lemmas ∪ names ∪
function ∪ verb/adjective inflections) → ordered FSA peel `ו? → {ש|כש|לכש|מש}? → {ב|ל|כ|מ}? →
ה?` with residual-must-be-content + abstain → fused-article from prep niqqud (patach/qamatz = +ה).

## Measured (Pealim lexicon)
- **existence-precision 94.9%** · recall 22.3% (gold is hard-weighted) · **labeled-seg 94.6%**.
- **Do-no-harm hard-negatives PASS** — names/fossils/vav strata: 0 false proclitic
  (`name-suspect fp0`, `fossil fp0`). The seeded בית/משה/מורה abstain correctly.
- **Residual 3 false positives** — `מתולעים`/`מסובלת` (participles Pealim lacks → not caught by
  the verb/adjective-inflection guard) + `לבינים`. All are **lexicon-coverage gaps**, not
  algorithm errors.

## Conclusion → next step
The FSA tier is correct; its ceiling is **lexicon coverage**:
- hspell-basic (34 755) is too sparse (missing מתולעים/בעת/הורגלנו); full tier is 87 MB.
- The 3 FPs + the recall gap close with broader lexeme coverage.
→ The **owner-authorized bake-time Dicta per-work overlay** (Phase 3) is the unlock: an
authoritative per-work proper-noun + segmentation map kills the name/participle FPs and lifts
existence-precision to the ≥99 do-no-harm bar. The offline FSA tier + bake-Dicta overlay ship
TOGETHER as the offline-confident tier (offline alone, at ~95%, must NOT ship past the gate).

Re-run: `node docs/research/epic-proclitic-phase2/2026-07-01/detector-proto-v3.js`.
