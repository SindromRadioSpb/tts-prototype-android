# Authority and access model

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; preserved.
Production: `https://linguistpro.kolosei.com/library.html`, version `3.11.388`.
Evidence method: `CODE`, `PRODUCTION`, `OWNER_LIVE_READ_ONLY`; no new `ISOLATED_AUTOMATION`; closure facts bounded as `OWNER_REPORTED`; external role patterns are discussed only in `EXTERNAL_BENCHMARK.md` as `EXTERNAL_PRIMARY`.
Limitations: conceptual authorization matrix only; no role, grant, migration or record was created.

## Recommendation

Path ownership and assignment capability must be scoped separately from material access. Current group membership remains the only group access writer. B9 adds **curation capability grants**, not another membership system.

Owner resolution received 2026-08-15: editor and teacher UI was required in the proposed first implementation slice; snapshot recipients, the exact B9 retention v1 policy and the separate protected-cache purge program were accepted as design. Execution was subsequently frozen because no qualified curator-mentor operating authority is currently available. See [the historical owner decisions](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md) and [the controlling freeze record](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md).

### Actors

- **Personal owner**: creates/publishes personal optional paths; may use owned personal texts and accessible public/group material. Cannot assign another learner’s private material.
- **Corpus editor**: edits/publishes paths whose owner scope is that corpus and whose items are authorized for it. Cannot manage group membership or assign unless separately granted.
- **Teacher**: creates/publishes/assigns within a group scope; can view assignment evidence for recipients in that group, waive required steps and grant due exceptions. Cannot edit corpus source truth.
- **Group owner**: retains group access administration and may hold all B9 group capabilities. Existing OWNER status does not automatically rewrite member roles.
- **Learner**: starts/leaves optional versions, reads assigned versions, explicitly acknowledges, skips optional steps and performs canonical reading/review actions.

### Capability grants

Conceptual grants are scoped `(scope_type, scope_id, user_id, capability)`:

- `PATH_EDIT`
- `PATH_PUBLISH`
- `PATH_ASSIGN`
- `ASSIGNMENT_WAIVE`
- `PATH_ARCHIVE`
- `PATH_EXPORT`

A group/corpus owner can grant/revoke capabilities only inside their scope. A grant is valid only while the user’s underlying membership/access is ACTIVE. Grant/revoke actions require actor, timestamp, reason and audit. A role name may bundle capabilities in UI, but APIs enforce capabilities, not labels.

## Authority matrix

| Action | Personal owner | Corpus editor | Teacher | Group owner | Learner |
|---|---:|---:|---:|---:|---:|
| Create/edit personal draft | yes | no | no | no | own-only |
| Edit corpus-scoped draft | if granted | yes | if granted | if granted | no |
| Edit group-scoped draft | if owner/granted | if granted | yes | yes | no |
| Publish | own scope | with `PATH_PUBLISH` | with `PATH_PUBLISH` | yes | no |
| Assign published version | no cross-user by default | only with `PATH_ASSIGN` | yes in active group | yes | no |
| Adopt optional version | yes | yes as learner | yes as learner | yes as learner | yes |
| Skip optional item | own recipient/adoption | own recipient/adoption | own recipient/adoption | own recipient/adoption | yes |
| Waive required item | no unless separately granted | if granted | yes in assignment scope | yes | no |
| Withdraw assignment | no | if granted | creator/scope authority | yes | no |
| Revoke membership/content | existing group owner writer only | no | no | yes | no |

## Assignment targeting

### Learner target

The assignee must be an active user with access to every non-public required item at create time. Assignment creation fails closed with an item-by-item access preview; it never copies protected content into the assignment.

### Group target

Recommended first-slice semantics are **snapshot recipients**: assigning to a group materializes the active learner set in the same transaction. Later membership edits do not silently add/remove assignees. This is auditable, idempotent and matches the least-surprising external pattern.

- A later joiner receives nothing until an authority explicitly “assigns to new members” or creates a new assignment.
- A removed/revoked member’s recipient becomes access-blocked/revoked. Historical authority/audit remains; protected titles/bodies are redacted where access is gone.
- Reassigning creates a new assignment or a typed recipient-add event; it never rewrites the original cohort snapshot.

Dynamic group assignments are a follow-up option only if the owner accepts retroactive enrollment semantics.

### Corpus target

“Assign to a corpus” is rejected as a target model. A corpus is content scope, not a learner population. A corpus-scoped Path may be published, but Assignment targets are learner or group.

## Material access policy

| Material | Optional personal path | Group assignment | Cross-corpus path |
|---|---|---|---|
| Public corpus item | allowed with stable revision/provenance | allowed | allowed |
| Group corpus item | allowed while owner has ACTIVE access | allowed only when every recipient has group access | allowed, but each item is independently gated |
| Learner personal text | owner-only | first slice: disallowed for teacher assignment | owner optional path only |
| Removed/protected item | keep immutable ref; show unavailable | required step blocks until authority waiver/new version/reassignment | never substitute silently |

Paths store references and a bounded provenance snapshot, never source bodies, notes, bookmarks or learner content. Export omits protected titles/metadata when current access no longer permits them, while retaining opaque IDs and audit timestamps needed to explain the assignment.

## Revocation and retention

- **Capability revoked**: actor loses edit/publish/assign immediately; published versions and historical audit remain.
- **Membership revoked**: group reads fail closed; current assignments become blocked/revoked for that recipient; no content leaks through Path APIs or export.
- **Assignment withdrawn**: append a withdrawal event. Learner history remains visible as “withdrawn”; it no longer appears as required/overdue.
- **Path archived**: no new adoption/assignment; existing pinned assignments remain readable subject to access.
- **Published version superseded**: existing assignments stay pinned. An authority previews and explicitly reassigns to a newer version.
- **Hard delete**: only a never-published, never-assigned draft can be deleted. Otherwise archive/redact.
- **Data retention**: assignment audit stores identifiers, actor, timestamps, policy and event kinds—not text bodies, notes, answer content or learner telemetry.

Exact approved retention: no TTL while an Adoption/Assignment is active; 730 days after explicit terminal/leave for assignment authority, recipient events and minimal evidence; 30 days for request/delivery metadata; 180 days for content-free anti-resurrection tombstones. Account/right-to-delete purges learner-scoped B9 data within 30 days and overrides the normal window. Completion projection alone never starts the retention clock.

Guaranteed deletion of already materialized protected group-corpus bytes belongs to `GROUP-CORPUS-CACHE-REVOCATION`. Protected group-item Assignment GA is blocked until that separate program proves revoke → local purge → offline denial → reconnect reconciliation.

## Audit minimum

Every create/edit/publish/archive/grant/revoke/assign/recipient-add/withdraw/waive/due-exception/export/import action records:

- stable object and version IDs;
- actor and effective capability/scope;
- UTC time;
- request idempotency key;
- before/after lifecycle value or event kind;
- content/version hash where relevant;
- bounded reason code, never learner text.

Learner reads, route opens and disclosure toggles are not audit/completion events. Provider/LLM calls are absent from the first slice.
