# Epic-3b — function-word USAGE: DRAFT sample for review

**What this is.** A 3-entry DRAFT (של / את / ב) of curated *usage* for function words, in the schema proposed by `docs/planning/BRR_EPIC3B_FUNCTION_USAGE_RECON_2026_06_30.md`. It exists to show the depth/tone bar so the owner can sign off the schema before any code is written.

**This is NOT live.** No usage store exists yet (`public/data/usage/` is absent). Nothing here is shown to users.

## Files
- **`function-usage.draft.v1.json` — REVIEW THIS (the full DRAFT, 32 entries).** Corpus-frequency-ordered: 7 proclitics (ה ב ל ו מ כ ש) + 25 standalone. 3 entries (של/את/ב) are the prior owner-approved samples; 29 were authored by R1-lens subagents from established grammar, then **adversarially R1-verified** (fabricated-vocalization / case-language / homograph / register hunt — 27 ok, 2 auto-corrected: `אך` false-dagesh, `או` collocation-gloss, see each entry's `_review`). Every entry carries `curator: "DRAFT — verify"`. Regenerate the authoring: see `_meta.authoring_note`. Producer ordering: `npm run build:fn-freq`.
- `draft-function-usage.json` — the original 3-entry bar sample (של/את/ב); superseded by the full DRAFT above (kept for provenance).
- **`function-word-frequency.json` — corpus measurement (producer output).** Frequency of function words over the local baked corpus (796 works / 556 537 Hebrew tokens). Drives authoring batch order/composition. Regenerate: `npm run build:fn-freq`. Source: `scripts/premium/build-function-frequency.js`. Honest caveats inline (`_meta.caveats`): proclitic counts are upper bounds (word-initial-letter over-counts); composition = closed class ranked by corpus; pronouns separated (scope-pending).
- `README.md` — this file.

## Owner decisions (CAPTURED 2026-06-30)
1. **Authoring** → assistant pre-drafts the whole batch from established grammar (DRAFT-tagged) → owner/R1 verifies (as with the bios).
2. **Schema depth** → **full** for every entry (role + governs + suffix_series + position + collocations + pitfalls + register + examples).
3. **Register flag** → **yes** — `register` field marks archaic/high-register usages (corpus is 19th-c., R11).
4. **Batch order/composition** → **corpus frequency** (this producer), not a textbook top-25.

**Corpus result (frequency order):** proclitics first by morpheme impact — ה ＞ ב ＞ ל ＞ ו ＞ מ ＞ ש ＞ כ (7); then standalone — את ＞ על ＞ של ＞ לא ＞ כל ＞ כי ＞ גם ＞ זה ＞ אשר ＞ אל ＞ אם ＞ עם ＞ אין ＞ מה ＞ אך ＞ רק ＞ עוד ＞ עד ＞ מן ＞ יש ＞ או ＞ זו ＞ אבל ＞ בין ＞ אלה … The composition-check added `אבל / זו / אלה` (missed conjunctions/demonstratives) and flagged **personal pronouns** (הוא/היא/אני/הם …) as a distinct, scope-pending category — NOT folded into the 3b core batch.

## How it was generated
Written by the assistant from **established Hebrew grammar** (textbook preposition government + pronominal-suffix series). Source commit: `9cc26ae`. Seed inventory it builds on: `reader-morph.js` FUNCTION_GLOSS (~200+ glosses) + `pealim-function-links.v1.json` (299 {id,pos}).

## R1 / honesty
Every entry is `curator: "DRAFT — verify"` + `confidence`. **Verify each before approving** — preposition government is well-documented, but the lexicographer (R1) owns the final wording. Key R1/R2 convention: the model describes what each word **governs**, NOT morphological *case* (Hebrew has none); «род./винит. падеж» appears only as a learner analogy.

## The decisions (§8) — RESOLVED above; one scope question remains for sign-off
§8 #1–#5 are answered (see «Owner decisions»). **Open for the owner at DRAFT review:** do personal pronouns (הוא/היא/אני/הם, see `function-word-frequency.json` → `pronoun_diagnostic`) belong in 3b, or are they their own feature? Default taken in the DRAFT: **3b core = prepositions + conjunctions + particles + proclitics; pronouns deferred** (distinct paradigm). Examples (§8 #5): textbook in DRAFT, swap to corpus `ref→work id` as a later pass.

## What ships only AFTER sign-off
`function-usage.v1.json` + R1-authored batch → lazy loader `function-usage.js` → reader-morph «Употребление» card section + honesty-gate + i18n → `smoke:function-usage` gate + audit → 380px + parity + deploy. No same-session ship (bottleneck = R1 content review).
