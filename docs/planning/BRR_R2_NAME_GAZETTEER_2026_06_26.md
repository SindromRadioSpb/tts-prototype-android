# BRR R2 — offline proper-name gazetteer (2026-06-26)

**Status:** APPROVED (owner "Ок", 2026-06-26) — build in progress.
**Predecessor:** R1.0 gold + tail-sweep L1–L5 (`docs/planning/BRR_RESOLVER_TAIL_FIXES_2026_06_26.md`, HEAD `323e1e3`, prod v3.11.2).
**Roles:** R10 lead (measure-before/after, gold-gated) · R1 (no fabricated gloss — a name is honest-empty) · R4 (honesty UX: homograph → «вероятно» + «возможно: имя», never assert) · R5 (offline-first: static ship, zero runtime network).

## Why

This is a **data** task, not an algorithm change. The L5 seed (~40 names) catches only the
unambiguous gold names (אֵירוֹפָּה/יַעֲקֹב/יִשְׂרָאֵל); the homograph personal names
(שָׁלוֹם «мир»/Шалом, וְהִלֵּל «хвала»/Гилель) still leak as false-«exact». A full
offline gazetteer, license-clean and **homograph-aware**, closes the last tail bucket and
generalizes corpus-wide.

### Gold anchor (the 8 propernoun rows — measured 2026-06-26)
| surface | offline (pre-R2) | gold | status |
|---|---|---|---|
| בְּאֵירוֹפָּה, יַעֲקֹב, יִשְׂרָאֵל | exact noun/verb / unknown | propernoun | **already fixed by L5 seed** (propernoun) |
| שָׁלוֹם, וְהִלֵּל | exact noun/verb | propernoun | **R2 target** — homograph, still false-exact |
| הָעוֹבֵד, הַצּוֹפִים, הָעוֹבְדִים | verb→noun | propernoun | **L4-demoted** (definite participle) — context-org, accept/Tier-3 |

R2 must: flip שָׁלוֹם+וְהִלֵּל from false-exact → honest demotion, hold control 97.2%,
keep the 3 seed names propernoun, and **not** over-trigger common words.

## R2.1 decision (research fork) — RESOLVED

**Do CC-clean sources cover archaic/biblical PERSONAL names? → YES (Wikidata).** Probed via
Node-fetch (not Windows curl): every test string — incl. homograph common words
דוד/שלום/הלל/חן/אור — is typed as a given name in Wikidata, with Hebrew label; biblical
forms (אברהם/יעקב…) present. Dedicated corpus-harvest is **not** required; instead we
**intersect Wikidata names with the baked-corpus skeleton set** (87 060 distinct skeletons
over 796 works) — bounds size, kills foreign-name noise, surfaces exactly the literary names
that occur in Ben-Yehuda. **KIMA** (`kima.nli.org.il`) is **unreachable from this env** and
covers only toponyms (no failing archaic toponyms in gold) → **deferred/optional**.

## Build (producer: `scripts/premium/build-name-gazetteer.js`, dev-only, Node-fetch)

1. **Harvest** corpus skeleton set from `public/data/benyehuda/works/*.json`
   (`library.texts[].rows[].hebrew_plain` → niqqud-strip → consonantal skeleton, len≥2, dedup).
2. **Pull** Wikidata given-names (Q12308941/Q11879590/Q3409032) + place-names
   (countries/cities/regions) with `he` labels, paginated SPARQL (UA header; COUNT-whole
   times out → page with LIMIT/OFFSET).
3. **Normalize** each label → strip niqqud / consonantal skeleton; keep single Hebrew token,
   len≥2, Hebrew-script only; dedup.
4. **Intersect** with the corpus skeleton set → candidates that actually occur in the corpus.
5. **Homograph-split via the LIVE offline resolver** (self-consistent guard): run each
   candidate through the same `RM.resolveWordLight`. Lands a content «exact»/«likely»
   (= a real common word in our dict) → **HOMOGRAPH**; else → **UNAMBIGUOUS**.
   - **UNAMBIGUOUS** → extend `NAME_PROPER` (assert `propernoun`, honest-empty, morphology
     suppressed — like the seed). Built-in over-trigger guard: never assert over a word the
     resolver confidently reads.
   - **HOMOGRAPH** → new `NAME_HOMOGRAPH` set + an L3/L4-style demotion lever: on a content
     «exact» whose skeleton ∈ set → «точно»→«вероятно», `ambiguous=true`, alt
     `{pos:"propernoun", meaning:"возможно: имя собственное", root:null}`. **Never assert.**
6. **Emit** raw pull + split lists + provenance README → `docs/research/name-gazetteer/2026-06-26/`
   (tracked, Artifact storage rule) + the shippable list.

## Ship format

Decide by final post-intersection size: **<~800 entries → inline** literals in
`reader-morph.js` (like the seed); larger → small `public/data/inflection/name-gazetteer.json`
(plain, like CONTEXT_GLOSS — no OPFS/gz, overkill for a few hundred). Room-only in
`reader-morph.js`; `notes-autogen.js` has no functionGate/NAME_PROPER (only consumes
`kind:"propernoun"`) → parity-safe, like L1–L5.

## Forks (owner-delegated to recommendations)
1. **Ship format** — inline if <~800 else small JSON (threshold delegated). ✔ accepted.
2. **Homograph demotion aggressiveness** — (a) demote ALL homograph names (start here; over-hedge
   is measured) vs (b) add left-context honorific signal (מר/רבי/ר') later. ✔ start (a), measure.
3. **KIMA** — defer (unreachable here; no failing toponyms in gold). ✔ deferred.

## Gate (R10 measure-after)
- `gold:regold`: שָׁלוֹם+וְהִלֵּל leave false-exact → honest demotion; **control 97.2% must NOT
  drop**; honest-recall up; 3 seed names stay propernoun.
- Scratchpad over-trigger probe (סביבה/מעלה/שיר/אור/דוד/חן…): no common word flips to
  false-propernoun; homographs only soften, never assert.
- `smoke:reader-morph:audit` corpus-wide spot check; watch **over-hedge** (demoting super-common
  שלום «мир»/אור «свет» hedges those reads — R1-honest, but watch it doesn't balloon).
- `smoke:reader-morph` / `reader-context` / `autogen-parity` / `reader-parity` green before push.
- Bump SW `CACHE_VERSION` + `package.json` + both footers (reader-morph.js in SW precache).

## Status — SHIPPED v3.11.3

**Owner decisions (data-reshaped fork, 2026-06-26):** (1) **I curate conservatively** — auto
Wikidata∩corpus buckets were too noisy (Hebrew short-skeleton homograph collision); (2) **drop
homograph-demote for v1, defer to Tier-3** — blanket-demoting name-homographs would gut «точно»
on the most common Hebrew words; שלום/הלל handled by Tier-3 context (same class as the org-names).

- [x] producer built + run — `scripts/premium/build-name-gazetteer.js` (Wikidata pull 7633 →
      984 in-corpus candidates → split 608 unambiguous / 312 homograph / 33 seed / 31 function).
- [x] artifact → `docs/research/name-gazetteer/2026-06-26/` (raw pull, split, curation.tsv,
      curate.js, name-proper-final.json, README) — Artifact storage rule.
- [x] curated +293 UNAMBIGUOUS names → merged into `NAME_PROPER` in `reader-morph.js`. **No
      NAME_HOMOGRAPH demote lever** (deferred). Room-only, parity-safe.
- [x] gold-gate: **control 97.2% held**, honest-recall 79.2%→**81.8%**, no new false-«exact»,
      over-hedge flat. Over-trigger probe: 14/14 names assert, 0/37 common words false-assert.
- [x] smokes green: reader-morph / reader-context / autogen-parity / reader-parity.
- [x] version bump v3.11.2→**v3.11.3** (package.json + SW + both footers) + commit + push (deploy).

**Deferred:** homograph name-demotion (Tier-3 handles שלום/הלל); KIMA topo enrichment (host
unreachable); place-name recall (hspell-veto drops some in-hspell toponyms — acceptable, precision-first).
