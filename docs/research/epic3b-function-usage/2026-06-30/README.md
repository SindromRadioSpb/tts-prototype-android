# Epic-3b — function-word USAGE: DRAFT sample for review

**What this is.** A 3-entry DRAFT (של / את / ב) of curated *usage* for function words, in the schema proposed by `docs/planning/BRR_EPIC3B_FUNCTION_USAGE_RECON_2026_06_30.md`. It exists to show the depth/tone bar so the owner can sign off the schema before any code is written.

**This is NOT live.** No usage store exists yet (`public/data/usage/` is absent). Nothing here is shown to users.

## Files
- **`draft-function-usage.json` — review this.** 3 entries across different grammatical roles (possession marker / definite-object marker / proclitic preposition), in the `function-usage.v1.json` shape.
- `README.md` — this file.

## How it was generated
Written by the assistant from **established Hebrew grammar** (textbook preposition government + pronominal-suffix series). Source commit: `9cc26ae`. Seed inventory it builds on: `reader-morph.js` FUNCTION_GLOSS (~200+ glosses) + `pealim-function-links.v1.json` (299 {id,pos}).

## R1 / honesty
Every entry is `curator: "DRAFT — verify"` + `confidence`. **Verify each before approving** — preposition government is well-documented, but the lexicographer (R1) owns the final wording. Key R1/R2 convention: the model describes what each word **governs**, NOT morphological *case* (Hebrew has none); «род./винит. падеж» appears only as a learner analogy.

## The decisions to sign off (full list in the recon doc §8)
1. **Schema depth** — lean (role+governs+suffix_series+1 example) vs full (+collocations+pitfalls+register+examples).
2. **Authoring** — assistant pre-drafts the batch (DRAFT, you verify) vs you/lexicographer author from scratch.
3. **First batch scope** — the ~15–25 core governing prepositions/proclitics (recon §7).
4. **Register flag** — mark archaic-vs-modern usages (corpus is 19th-c.)?
5. **Examples** — corpus-sourced (ref→work id) vs textbook.

## What ships only AFTER sign-off
`function-usage.v1.json` + R1-authored batch → lazy loader `function-usage.js` → reader-morph «Употребление» card section + honesty-gate + i18n → `smoke:function-usage` gate + audit → 380px + parity + deploy. No same-session ship (bottleneck = R1 content review).
