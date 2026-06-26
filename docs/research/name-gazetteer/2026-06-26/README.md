# R2 — offline proper-name gazetteer (2026-06-26)

License-clean gazetteer of Hebrew proper names for the Reading-Room tap-morphology resolver
(`public/js/reader-morph.js`). Extends the Epic-1 / R1-tail name coverage. Plan:
`docs/planning/BRR_R2_NAME_GAZETTEER_2026_06_26.md`. Shipped v3.11.3.

## Outcome

**+293 curated UNAMBIGUOUS names** merged into `NAME_PROPER` (assert «имя собственное»,
morphology suppressed), on top of the ~40-name L5 seed. **No homograph-demote lever** — owner
decision (R2.1): names that are also common words (שלום «мир», הלל «хвалить», דוד «дядя», and
the long tail יום/אור/מים/חיים…) are deferred to **Tier-3 context**, because a static demotion
would over-hedge «точно» on the most common Hebrew words. Gold gate: control **97.2% held**,
honest-degradation recall **79.2% → 81.8%**, no new false-«exact», over-hedge flat.

## Why curation was needed (R10 finding)

A raw Wikidata-namesake ∩ corpus list is **too noisy to ship** — Hebrew's short consonantal
skeletons collide with *some* Wikidata namesake for nearly every common word. The auto buckets:
- homograph-demote (312) was dominated by the most common Hebrew words → harmful to blanket-demote;
- unambiguous-assert (608) contained construct/common forms the engine misses (פני/בני/בן/רוב/חטא)
  → would create R1 false-asserts.
No single oracle (resolver / hspell / freq) cleanly separates names from words, so the final list
was **conservatively curated** (owner-chosen): keep the not-in-hspell base minus identified
common-word/construct/junk skeletons, recover clear toponyms + theophoric/compound classical
names from the hspell side, exclude single-stem homographs (עוז/ארי/דוב/יעל/עמוס…).

## Files

| File | What | Edit? |
|---|---|---|
| `wikidata-names-raw.json` | Raw Wikidata pull (he labels) by P31 type. Cache — re-pull with `--refresh`. | regenerated |
| `candidates.json` | Post-intersection candidates (984) before the homograph split. | derived |
| `gazetteer-split.json` | Resolver homograph-split: unambiguous(608)/homograph(312)/seed/function buckets + detail. | derived |
| `curation.tsv` | **The curation record** — every unambiguous-bucket candidate + keep/drop + reason. | the human record |
| `curate.js` | The exact conservative curation logic (DROP/RECOVER lists) producing the final list. | the decision source |
| `name-proper-final.json` | The 293 curated names merged into `reader-morph.js`. | the shipped list |
| `gazetteer-snippet.js` | (auto) raw split snippet — superseded by the curated `name-proper-final.json`. | superseded |

## How it was generated

- **Producer:** `node scripts/premium/build-name-gazetteer.js` (dev-only; nothing runs at app
  runtime — the gazetteer is static inside `reader-morph.js`).
  - Sources: Wikidata SPARQL (`he` labels) — given names + places — via **Node-fetch, not Windows
    curl** (curl mangles Hebrew UTF-8). **KIMA deferred** (host unreachable here; toponym-only).
  - Intersect with baked-corpus skeletons (796 works, ~87K distinct, with real corpus niqqud).
  - Homograph-split via the **live in-browser resolver** (Playwright + `library.html`).
- **Curation:** `curate.js` (in this folder) — hspell common-word veto + explicit DROP/RECOVER
  lists. Re-run: `node docs/research/name-gazetteer/2026-06-26/curate.js`.

## Gate (passed)

`npm run gold:regold` (control 97.2% held) · over-trigger probe (14/14 names assert, 0/37 common
words false-assert) · `smoke:reader-morph` / `reader-context` / `autogen-parity` / `reader-parity`.
