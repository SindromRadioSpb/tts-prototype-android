# Corpus, resource and rights matrix

Date: 2026-08-26
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`; branch `main`; dirty tree preserved
Production basis: `3.11.440`, anonymous public metadata; Physics rights from owner-approved production receipt
Method: `CODE`, `PRODUCTION_ANONYMOUS`, `OWNER_REPORTED`, `INFERENCE`

## Authority namespaces

| Namespace | Canonical truth / writer | Effective readers | This program |
|---|---|---|---|
| `LEGACY_PUBLIC_DOMAIN` | baked Ben-Yehuda corpus repo | anonymous UI; legacy Agent Access scopes | Keep unchanged; compatibility fixture only |
| `PUBLICATION_DOMAIN` | publication writer; immutable editions/items/assets | anonymous public projections | First program scope |
| `PHYSICS_RESOURCE_DOMAIN` | Physics task-resource writer; immutable revisions/rights | anonymous public projection when allowed | First binary fixture through read adapter |
| `GROUP_RESTRICTED` | group corpus writer + ACTIVE membership | members and existing group Agent Access scopes | Explicitly out of generic public pilot |
| `PERSONAL` | owner device/server replicas + per-object grants | owner/authorized connection | Explicitly out of generic public pilot |
| `LEARNER/REVIEW` | learner writers and `review_log` | first-party and existing scoped projections | Never read or written by this program |

“All corpora” therefore means a common typed identity vocabulary across namespaces, not a universal authority bypass. The first release is accurately named `ALL_PUBLISHED_PUBLIC_CORPORA`.

## Current corpus shapes

| Corpus | Public shape | Stable identity | Current agent right | Recommended pilot behavior |
|---|---|---|---|---|
| Study Songs edition 2 | 77 work snapshots, text/translation metadata, 2,155 audio assets, package | corpus/edition/edition-item/public-work/snapshot/asset hash | None in generic publication domain; public/stream/package rights only | Discover only after new agent rights are explicitly asserted; bounded text windows and asset descriptors; no audio bytes in MCP |
| Physics edition 2 | 74 task snapshots, 394 row-audio assets; 74 separate PDFs | same publication identity plus Physics resource/revision/hash | 74 `AGENT_READ=YES` facts for PDFs | Task/section discovery, resource descriptor and immutable PDF URL; no OCR/body claim |
| Ben-Yehuda legacy | baked works/chapters/rows | numeric work ID + text key | Existing `reading.public.search` / `reading.corpus.read` consent | Preserve as legacy surface; later adapter may expose common identity without changing old tools |

## Rights options

### A — Treat public as agent-readable

Rejected. It contradicts the explicit Physics separation, silently changes Study Songs attestation meaning and makes future opt-out impossible in the official agent interface.

### B — Rebuild immutable editions to materialize `AGENT_READ`

Safe for content snapshots but operationally heavy: every rights grant/revoke requires a new edition or mutable rights inside an immutable row. Revocation is too slow and semantically coupled to content.

### C — One cross-domain generic rights table

Rejected for the pilot. It would become a second writer over Physics rights and blur group/personal authorization.

### D — Domain-local append-only agent-right facts pinned to immutable targets

Recommended:

- Physics continues using `physics_task_resource_rights_facts`—no duplicate row;
- publication-domain text/assets gain a separate append-only `published_corpus_agent_rights_facts` aggregate keyed to immutable edition targets;
- the Agent Access read service computes effective access through a domain adapter and never writes rights;
- group/personal continue existing membership/grant models.

Proposed publication agent-right target tuple:

```text
fact_id
edition_id
target_kind = EDITION_ITEM | EDITION_ASSET | PACKAGE
target_id = edition_item_id | edition_asset_id | edition_id
use_class = DISCOVER | SOURCE_TEXT | SOURCE_BINARY | DERIVATIVE_TEXT
allowed
basis
asserted_at / asserted_by / created_at
```

The latest append-only fact for the exact tuple is effective. No update/delete; revocation appends `allowed=0`. `DISCOVER` may expose only non-sensitive metadata. `SOURCE_TEXT`, `SOURCE_BINARY` and future `DERIVATIVE_TEXT` are independent and must not be inferred from one another.

This migration is an option until approved. It must use one publication-rights writer/repository, unique idempotency receipts, `BEGIN IMMEDIATE`, a temporary-DB rehearsal and read-back. It is not a second content truth: it owns only agent-use authorization after publication.

## Study Songs gate

The existing owner attestation covered public read, public stream and package download. It did not state agent use. Before Study Songs enters the pilot, owner approval must identify:

- whether agents may discover all 77 items;
- whether bounded text/translation rows may be returned as model context;
- whether audio asset URLs may be disclosed to agents;
- whether package URLs remain excluded;
- any provider/copyright limitations and revocation behavior.

No batch inference from `PUBLIC_READ=YES` is permitted.

## Physics gate

Physics already records 74 separately approved `AGENT_READ=YES` PDF facts. The adapter must still re-evaluate:

- the resource revision is current and `PUBLISHED`;
- revision edition/item/work/snapshot exactly matches the corpus current edition;
- latest `PUBLIC_READ=YES` and `AGENT_READ=YES` are both true;
- the returned URL stays under the canonical first-party resource route;
- bytes/SHA/MIME match the immutable revision.

Current public URLs remain reachable anonymously, so agent-right enforcement governs LinguistPro's official MCP projection, not adversarial scraping of public pages. This residual limitation must be disclosed honestly.

## Edition changes

- Every search cursor pins one `edition_id` and manifest hash.
- A descriptor never silently rebinds from edition 2 to edition 3.
- `get` by old full identity may return `ARCHIVED_EDITION` metadata if retention permits, but never substitute the current work.
- Search without an edition selects the current edition at request start and returns that selected identity.
- A rights fact for one edition/target never automatically transfers to a new edition; owner copy-forward is an explicit reviewed writer action.
