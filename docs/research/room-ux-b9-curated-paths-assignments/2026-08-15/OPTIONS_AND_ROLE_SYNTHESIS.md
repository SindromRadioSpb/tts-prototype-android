# Options and R1–R17 synthesis

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; preserved.
Production: `https://linguistpro.kolosei.com/library.html`, version `3.11.388`.
Evidence method: `CODE`, `PRODUCTION`, `OWNER_LIVE_READ_ONLY`, and dated `EXTERNAL_PRIMARY`; no new `ISOLATED_AUTOMATION`; prior closures remain bounded `OWNER_REPORTED`.
Limitations: comparative research only; no option was implemented or migrated.

## Top-level options

| Dimension | A — Reading Lists Plus | B — Path + Assignment | C — Corpus order + membership | Hybrid D — B core + adapters |
|---|---|---|---|---|
| Initial code/schema cost | lowest superficially | highest but bounded/additive | low for group-only demo | medium-high, same truth as B |
| Stable authored identity/version | poor; local mutable blob | strong; immutable version | poor; catalog reorder mutates meaning | strong |
| Optional vs required | conflated into list flags | explicit adoption vs assignment | membership falsely implies required | explicit |
| Cross-corpus/typed sequence | awkward and leaky | native | cannot model personal/review/comprehension well | native plus import helpers |
| Authority/audit/revoke | absent | explicit actor/scope/events | membership only, wrong granularity | explicit |
| Completion without dual writer | hard to keep honest | projection contract is first-class | catalog has no completion semantics | first-class |
| Sync/recovery | current lists are device-local | server definition/authority + local cache | server catalog only | server core; adapters never writers |
| Backward compatibility | high until semantics corrupt list lifecycle | high through separation | high for group demo, low product truth | highest honest path |
| Destructive lifecycle risk | list delete can erase “assignment” | assignment/version protected from delete | catalog/membership change rewrites history | protected |
| Recommendation | reject | acceptable | reject | **recommend** |

## Why A fails

Reading Lists are intentionally personal, local and mutable. Adding authority/version/completion to the same blob would turn rename/delete/reorder into high-impact assignment operations, produce a second sync/export system and silently change established list UX. Migration looks cheap only because the missing truths are hidden rather than solved.

## Why C fails

Corpus order is a content catalog concern and membership is access. It cannot honestly express a cross-corpus `text → song → review → optional comprehension` sequence, immutable assignment version, personal path, optional steps, due exception or withdrawal. The current `group_assignment` label demonstrates the semantic failure: UI wording can outrun authority truth.

## Why D is stronger than plain B

The canonical core is exactly B. Hybrid D adds one-way adapters:

- “Import Reading List into draft Path” copies stable refs and order after validation; the list remains untouched.
- “Start draft from corpus order” snapshots current refs/order into a draft; later catalog reorder has no effect.
- “Import human-reviewed Lesson draft” is a future default-off authoring aid; it cannot publish or assign.
- Corpus and L0 may show views of Paths, but they never become competing writers.

## Role analysis

| Role | Main test | A | B/D | C |
|---|---|---|---|---|
| R1 Hebrew semantics | do not treat generated/advisory language as truth | list metadata could hide provenance | typed source/provenance and human publish | catalog presence says nothing about pedagogical meaning |
| R2 SLA methodologist | sequence, spacing and optionality must be pedagogically honest | weak completion semantics | explicit typed steps; canonical review only | fixed catalog order is not a learning design |
| R3 knowledge graph | identities/edges should be explicit | overloaded list edges | PathVersion/Assignment/adoption/evidence edges explicit | membership edge is misused as assignment |
| R4 premium mobile/RTL UX | visible authority, no dead ends, 380/RTL | list UI becomes overloaded | distinct vertical learner/author surfaces | group catalog falsely looks assigned |
| R5 product/market | offline usefulness without LMS bloat | simple but not trustworthy | bounded, differentiated reading-first value | group-only and non-portable |
| R6 curator-librarian | collection order/provenance remain honest | curation and pedagogy merge | catalog can seed draft but stays separate | collection order is overwritten with course semantics |
| R7 Hebrew literary editor | human editorial judgment/version history | mutable list loses editorial record | publisher/provenance/version retained | reorder retroactively changes assigned canon |
| R8 graded-reading designer | scaffold, on-ramp, next step | flags insufficient | typed order/requiredness and completion rules | no mixed action/scaffold model |
| R9 authority-control | stable IDs; derived/asserted/curated separated | weak local IDs | stable refs, hashes, curated provenance | position/member inference masquerades as asserted assignment |
| R11 do-no-harm | do not regress closed truths | likely list/progress coupling | additive domains; immutable pinned history | membership/order mutation rewrites meaning |
| R12 cloud architecture | no dual write; event/projection separation | likely dual-write blob/sync | definition, events and projections distinct | authority absent; derived flag used as truth |
| R13 migration steward | additive, idempotent, rollbackable | semantic in-place migration risky | new tables/cache; old truths untouched; flag rollback | low schema cost but irrecoverable semantic drift |
| R14 tenant isolation | user/group scope and revoke | list is device-only, no tenant model | per-scope capability and per-item access | membership too broad for publish/assign |
| R15 lifecycle/GDPR | export/delete/retention from day one | lists not exported | separate definition/audit/evidence exports; no content copy | historical assignment cannot be represented |
| R16 cost governor | no hidden provider/background cost | may invite recommendation/AI shortcuts | deterministic core; AI default-off | low cost but low value/truth |
| R17 agent pedagogy / grader independence | next action helps reading; AI cannot grade | list flags can become fake completion | reading-first sequence; existing canonical grader only | catalog navigation is not pedagogy |

## Failure modes and mitigations

- **Version sprawl** → publish diff, content hash, archive and bounded version history; no auto-upgrade.
- **Teacher sees false completion** → label local-vs-synced evidence; review comes from canonical log; no route-view completion.
- **Protected content leaks** → refs only, access recheck, redacted export, membership prerequisite.
- **Role explosion** → small capability set in context; UI bundles roles, API checks capabilities.
- **Offline conflict** → immutable learner versions; optimistic draft revisions; append-only idempotent events/outbox.
- **LMS creep** → no gradebook, branching, rubrics, arbitrary quizzes or teacher telemetry in slice 1.
- **AI creep** → no provider call or AI path/content generation; future draft aid requires separate approval and human publish.

## Decision

Recommend **Hybrid D**, where the authoritative data model and lifecycle are Option B. A and C remain import/view adapters only and can be omitted from the first implementation slice without losing truth.
