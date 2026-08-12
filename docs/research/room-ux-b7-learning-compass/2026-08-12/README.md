# Reading Room B7 Learning Compass 2.0 — research evidence

**Date:** 2026-08-12

**Mode:** `RESEARCH PHASE COMPLETE / HISTORICAL READ-ONLY EVIDENCE`

**Repository baseline:** `main@6a2e80a1`

**Production baseline inherited from closed B6:** `3.11.360`

**Decision packet:**
[`ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md`](../../../planning/ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md)

The owner subsequently authorized implementation and, separately, production
deployment. Engineering implementation is `main@845ddc71`, production
finishing is `04f88328`/`85bdc9de`, with compact-copy follow-up served in
`3.11.364`; durable
automation and production read-back artifacts are in
[`automation/`](./automation/) and the current status is recorded in
[`ROOM_UX_B7_LEARNING_COMPASS_2_IMPLEMENTATION_2026_08_12.md`](../../../planning/ROOM_UX_B7_LEARNING_COMPASS_2_IMPLEMENTATION_2026_08_12.md).
This research record remains unchanged as the pre-code evidence boundary.

Follow-up 2026-08-13: owner-reported general production smoke passed and an
iPhone Safari screenshot exposed an overlong familiarity badge. Visible copy
is now `X% знакомы` / `Не менее X% знакомы` (with compact EN/HE equivalents),
while exact recorded buckets and provenance remain in details. The refreshed
Chromium matrix is `125/125`; it is still not a substitute for unreported AT
rows.

## 1. Scope and evidence boundary

This bundle answers only the B7 questions named in the canonical B6–B9
handoff:

- when a familiar-word signal is supportable for Ben-Yehuda, My Texts, and
  group items;
- what an honest unavailable/not-prepared/profile-empty state is;
- when an individualized reading-time range is supportable;
- how register, period, audio, difficulty, and recommendation reasons retain
  per-field provenance;
- what privacy, performance, integrity, accessibility, and physical-device
  gates must exist before B7 closure.

It does **not** reopen B0–B6, implement code, change the app version, touch the
service worker, deploy, mutate owner data, or run learner grades/reviews. B8,
B9, Visual finishing, opaque/LLM recommendations, and production telemetry are
outside this packet.

Evidence types used:

1. read-only repository inspection at the baseline above;
2. deterministic inspection of the checked-in Ben-Yehuda v7 ingredient
   sidecar;
3. primary/authoritative research and standards;
4. three independent audits: coverage/source support, provenance/privacy, and
   reading-comprehension/time literature.

No live owner content was opened. No physical-device or assistive-technology
acceptance was performed in this research phase.

## 2. Current contract evidence

### 2.1 The B4 presenter is intentionally incomplete for B7

`public/js/corpus-item-presenter.js` currently has one card-level
`readiness.confidence` chosen from `asserted`, `derived-high`, and
`derived-soft` (`:69`). Unknown confidence falls back to `derived-soft`, so
absence of evidence can look derived rather than unknown. A card exposes at
most two readiness signals (`:175-184`).

Source behavior at this baseline:

| Source | Familiarity now | Other facts now | B7 gap |
|---|---|---|---|
| Ben-Yehuda | derived from the browser vocab sidecar and local learner map | lexical level/load; audio status | denominator and unresolved uncertainty are hidden; one coarse confidence covers unlike fields |
| My Texts | always `null` | asserted level; passed-through media | no card ingredient/cache contract, provenance is not per field |
| Group | always `null` | asserted level; row/audio counts | absent audio revision defaults to `1`; audio kind can default to TTS, creating a stronger claim than the source contains |

`pct()` suppresses zero and the B4 presentation cannot distinguish an empty
learner profile, a true supported zero, an unsupported source, stale analysis,
or an analysis still in progress. That was acceptable for the bounded B4
surface; it is not an honest B7 contract.

### 2.2 The browser and Agent Access use different coverage semantics

The browser engine in `public/js/corpus-vocab.js`:

- uses a lazy v7 per-work ingredient sidecar;
- counts a configured collection of local states as familiar;
- presents `knownTok / matchedTokens` (`matchedDrillCov`) while separately
  computing but not presenting `knownTok / allTokens` (`totalCov`) at
  `:67-74`;
- classifies a personalized zone with configured `0.70/0.90` boundaries at
  `:26-30`, while stale comments at `:84-85` and `:119-123` still describe an
  older `80–95%` interpretation;
- cannot expose the unresolved-token contribution or an uncertainty interval
  to the card.

The server-side Agent Access engine in
`agent/access/textCoverageResolver.js`:

- has explicit resolver and learner-projection versions (`:15`);
- supports public, granted personal, and membership-gated group sources;
- treats scheduled/due items as learning and treats explicit `new`/`ignore`
  as not familiar (`:67-73`);
- reports token, lemma, and content-word percentages plus unresolved/proper-name
  buckets;
- returns `COVERAGE_UNAVAILABLE` instead of fabricating a percentage
  (`:90-94`).

The server engine is useful contract evidence, but it is not a safe drop-in
Room source of truth: doing so would upload/resolve a browser-local learner
projection and protected content through a server path. B7 therefore needs one
pure semantic core with local Room adapters, not a second network-backed
learner truth.

### 2.3 Ben-Yehuda v7 ingredient inventory

Read-only deterministic inspection of
`public/data/benyehuda/corpus-vocab-v7.json` produced:

| Measure | Value |
|---|---:|
| File bytes | 940,806 |
| Ready works represented | 796 |
| Dictionary IDs | 6,887 |
| Matched tokens, sum `m` | 482,635 |
| All lexical tokens, sum `n` | 556,532 |
| Token-weighted matched share | 86.72% |
| Per-work matched share p10 / median / p90 | 81.25% / 87.50% / 93.33% |
| Minimum per-work matched share | 31.93% |
| Works below 80% / below 70% | 65 / 15 |
| Works with numeric `m`, `n`, and `ez` | 796 / 796 |

Consequences:

- the sidecar is already compact enough to prove the ingredient approach;
- unresolved/fallback share is material and varies sharply by work;
- a matched-only percentage can flatter difficult or poorly resolved texts;
- a single resolver-quality or comprehension label cannot be inferred from
  the corpus-wide median.

### 2.4 My Texts and group support boundary

B6 correctly keeps browse cards light and bounded. Its page contract does not
carry text bodies or full row models. Therefore card paint must not read 48
full bodies to compute B7 signals.

For My Texts, the canonical body is already local. The supportable path is a
discardable, versioned local ingredient cache keyed by content revision/hash
and resolver version, computed in a Worker on save/update, explicit first
open, or a bounded idle queue. A missing cache entry is `NOT_PREPARED`, never
`0%`.

For group items, catalog cards expose counts and bundle metadata, not the full
protected body. The body becomes available only through the existing
membership-bound materialization flow. B7 can support the current locally
materialized edition and bind ingredients to `bundle_sha256`; it must not mass
prefetch group content merely to decorate cards. Revocation, edition change,
or hash mismatch invalidates the cache and removes the personalized signal.

### 2.5 No valid individualized time baseline exists today

Reading Room has no text-revision-bound, foreground-only, completed-reading
calibration ledger. Existing global session heartbeats and open/close
wall-clock events are not reliably tied to an exact text span or completion;
orphan recovery can add synthetic time. B6 diagnostics are deliberately
content-free operational evidence and cannot become a learner behavior store.

An individualized estimate therefore remains unavailable until a separate
local-only calibration contract has enough qualifying observations. Exact
audio duration remains a different, source-asserted signal and must not be
presented as reading time.

### 2.6 Per-field provenance exists elsewhere but not in Compass cards

The repository already contains stronger patterns such as
`material-field-provenance-v1` in
`public/js/material-revision-repository.js:162`. Compass cards do not preserve
that granularity: level, familiarity, audio, and recommendation reason share a
coarse confidence and summary string.

B7 needs typed field provenance. In particular:

- `register` and `period` may be curated, source-asserted, or derived from a
  versioned catalog rule, but never silently promoted;
- `audio` needs exact availability/count/revision/type evidence and must not
  default to TTS;
- `difficulty` must separate asserted course level, intrinsic lexical load,
  and personal recorded familiarity;
- a missing field stays unknown and cannot inherit confidence from another
  field.

## 3. Literature and standards review

### 3.1 Lexical coverage is not a universal comprehension threshold

- Hu and Nation's small controlled English study is historically important,
  but does not establish a universal product threshold for adult L2 Hebrew:
  [University of Hawai'i repository](https://doi.org/10.64152/10125/66973).
- Schmitt, Jiang, and Grabe studied 661 readers and found an approximately
  linear relationship across 90–100% lexical coverage rather than a clean
  all-purpose cutoff:
  [The Modern Language Journal](https://doi.org/10.1111/j.1540-4781.2011.01146.x).
- Kremmel and colleagues' replication showed that genre and question format
  affect the relationship and did not fully reproduce the earlier threshold
  result:
  [Language Learning](https://doi.org/10.1111/lang.12622).
- The CEFR reading framework treats text, task, purpose, and reader variables
  as interacting conditions, not as a mapping from one lexical percentage to
  comprehension or CEFR level:
  [Council of Europe](https://www.coe.int/en/web/common-european-framework-reference-languages/reading-comprehension).

No direct evidence was found that validates one 95% or 98% readiness cutoff
for the product's adult L2 Hebrew sources. B7 should therefore label an
observable **recorded familiar lexical coverage** lower bound, show unresolved
uncertainty, and avoid a comprehension/readiness/CEFR promise.

### 3.2 Hebrew makes resolver uncertainty product-visible

Modern Hebrew is morphologically rich and surface forms can have multiple
analyses. More and Tsarfaty describe joint morphological and syntactic
disambiguation for Hebrew
([COLING 2016](https://aclanthology.org/C16-1033/)); Shmidman and colleagues
demonstrate the importance of context for Hebrew morphological disambiguation
([Findings of EMNLP 2020](https://doi.org/10.18653/v1/2020.findings-emnlp.297)).

Therefore B7 cannot silently assign every surface form to a learner lemma. It
must retain unresolved counts, abstain when context cannot justify a mapping,
and bind results to a resolver version.

### 3.3 Reading speed requires individual, contextual calibration

Brysbaert's meta-analysis spans 190 studies and shows substantial effects from
language, genre, task, and reader population
([Journal of Memory and Language](https://doi.org/10.1016/j.jml.2019.104047)).
It does not justify a single universal WPM value for this product.

The proposed minimum of five qualifying observations across at least three
texts and 2,500 eligible tokens is consequently an **engineering safety
budget**, not a published cognitive threshold. The output is a rounded range
and can become unavailable again when evidence is stale or too dispersed.

Page Visibility is the authoritative browser signal for excluding hidden-page
time: [W3C Page Visibility](https://www.w3.org/TR/2013/REC-page-visibility-20130514/).
Lack of pointer or scroll activity is not used as proof of idleness because it
would systematically undercount keyboard and screen-reader reading.

### 3.4 Accessibility and privacy

All explanation/status controls need programmatic names, keyboard access,
visible focus, logical RTL order, and non-noisy status announcements under
[WCAG 2.2](https://www.w3.org/TR/WCAG22/). A `title` tooltip alone is not an
accessible provenance disclosure.

The product's current no-analytics promise and B6 decision remain controlling.
B7 source text, learner IDs/states, exact reading history, and raw timing must
not enter RUM. The calibration ledger is local-only, bounded, resettable, and
separate from operational diagnostics.

## 4. Research conclusions

| ID | Conclusion | Evidence strength |
|---|---|---|
| R1 | A shared, versioned recorded-familiarity semantic core is necessary; current browser and Agent contracts drift | direct code evidence |
| R2 | Matched-only coverage is insufficient; exact numerator, denominator, unresolved, ignored, and profile eligibility are required | direct data/code evidence + Hebrew research |
| R3 | My Texts can be supported locally through a versioned ingredient cache without card-time body reads | direct architecture evidence |
| R4 | Group coverage is honest only for a current membership-bound locally materialized edition | direct access/materialization evidence |
| R5 | Empty profile, unsupported, not prepared, stale, and true zero must be different states | direct current-gap evidence |
| R6 | 95/98% must not be presented as universal comprehension/readiness thresholds | primary research review |
| R7 | Individualized reading time must wait for several qualifying local observations and be a range | current-gap evidence + reading-speed research |
| R8 | Register, period, audio, difficulty, coverage, and reason each need their own provenance | direct current-gap/repository precedent |
| R9 | Recommendation order must be deterministic and visibly reasoned; no LLM is needed | product canon + audit |
| R10 | B7 closure requires its own physical iPhone/Android/NVDA/VoiceOver/TalkBack evidence; automation remains a separate tier | WCAG/process canon |

## 5. Evidence limitations

- Repository inspection proves current contracts, not runtime performance on
  every target device.
- Sidecar statistics cover the 796 ready Ben-Yehuda works in v7, not all
  26,455 catalog records.
- Literature reviewed is largely cross-language/English; no direct adult L2
  Hebrew coverage-threshold validation was found.
- Proposed numeric calibration and performance budgets are owner decisions to
  validate in implementation; they are not achieved measurements.
- No owner-live, physical-device, screen-reader, production, or field-RUM claim
  is made by this bundle.
