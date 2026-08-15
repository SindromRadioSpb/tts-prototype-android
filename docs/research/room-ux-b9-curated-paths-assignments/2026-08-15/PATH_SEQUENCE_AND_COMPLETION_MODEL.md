# Path sequence and completion model

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; preserved.
Production: `https://linguistpro.kolosei.com/library.html`, version `3.11.388`.
Evidence method: `CODE`, `PRODUCTION`, `OWNER_LIVE_READ_ONLY`; no new `ISOLATED_AUTOMATION`; prior truth closures remain bounded `OWNER_REPORTED`; no `EXTERNAL_PRIMARY` claim here.
Limitations: proposed contracts are options, not executable schema/API; no learner event was synthesized.

## Lifecycle

Owner resolution received 2026-08-15: snapshot recipients, existing-Finished credit, canonical explicit-key REVIEW, optional/no-credit comprehension, private-text assignment prohibition and the minimal evidence receipt were accepted for the proposed slice 1. They are now a frozen design baseline, not implementation authority. See [the historical owner decisions](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md) and [the controlling freeze record](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md).

```text
Path identity
  └─ mutable Draft (optimistic revision)
       └─ Publish transaction
            └─ immutable PathVersion Vn + ordered typed items + content hash
                 ├─ learner explicitly adopts Vn (optional path)
                 └─ authority creates Assignment pinned to Vn
```

Rename changes the stable Path header. Published version title/description/provenance remain frozen for historical display. Editing content creates a new draft and then Vn+1. Existing adopters/assignments do not move automatically.

## Typed version item

Conceptual contract:

```json
{
  "item_id": "uuid",
  "position_no": 10,
  "kind": "TEXT | SONG | REVIEW | COMPREHENSION",
  "requiredness": "REQUIRED | OPTIONAL",
  "prerequisite_item_ids": [],
  "target_ref": {},
  "completion_rule": {},
  "reason": "bounded human-authored explanation",
  "level": "optional asserted label with source",
  "provenance": {
    "source_kind": "public_corpus | group_corpus | personal",
    "source_id": "stable opaque id",
    "expected_revision": "revision or hash",
    "access_class": "public | protected | private"
  }
}
```

First slice is linear and bounded to 48 items. Prerequisites may reference only earlier items and are used for explicit sequential gating; general branching/DAG logic is deferred. Position changes occur only in a draft. Published item IDs and order are immutable.

### `TEXT`

- Typed stable material ref, never only local `text_id`.
- Required completion reads canonical `finished_at` (“ever Finished”). Current truth cannot prove a re-read after assignment, so “must reread after assigned_at” is unsupported in the first slice.
- Resume reads canonical last working position on the current device. Opening/Next/Back does not write progress.

### `SONG`

- Same stable material/revision discipline, with explicit media capability/provenance.
- Completion uses the material’s canonical explicit Finished action, not playback percentage, audio indicator or play telemetry.
- Audio availability may disappear independently; the text step remains honest and can be blocked/waived according to the authored policy.

### `REVIEW`

- Targets an explicit bounded set of canonical `item_key` values or an explicit previously defined source-item-derived set. It does not create cards automatically.
- Launches the existing Room Trainer with route context only.
- Completion reads qualifying canonical `review_log.kind='review'` events under a versioned rule. No B9 code calls `commitReviewAttempt()` except through normal explicit Trainer grading.
- First-slice rule: a qualifying review event at or after the pinned PathVersion publication time counts. A due review already completed through canonical `review_log` therefore projects complete; an ancient review before the version does not.
- If no eligible SRS items exist, author preview fails for a required REVIEW item; it must not become a no-op checkbox.

### `COMPREHENSION`

- First slice: `OPTIONAL` advisory launch only, with `completion_rule.type='NONE'`.
- It may open the current comprehension UI only after the learner explicitly invokes it and existing provider consent is satisfied.
- It never calls a provider on path open/resume and never contributes to required completion.
- Required/scored comprehension needs separately approved human-authored question identity, answer/attempt truth, accessibility, export and privacy. The current LLM response is not that domain.

## Required, optional and unavailable behavior

- All required items must be satisfied by their canonical predicate or an explicit authority waiver.
- Optional items never block path/assignment completion. Learner “Skip optional” is an explicit typed event only if the learner wants the UI to remember the choice.
- A missing/removed/protected required material is **Blocked**, not skipped or complete. The authority may waive it, withdraw/reassign, or publish a replacement version and explicitly reassign.
- An unavailable optional item is shown as unavailable and may be skipped explicitly.
- Reordering after assignment is impossible because the assignment is pinned to the immutable version.

## Completion projection

There is no `completed=true` canonical writer. The projection for one recipient/adoption is:

```text
ACTIVE and not withdrawn/revoked
AND for every REQUIRED item:
    canonical predicate satisfied
    OR authority WAIVED that exact version item
```

Inputs are:

- `text_progress.finished_at` for local text/song truth;
- canonical `review_log` events for review truth;
- append-only B9 events for explicit acknowledgement, optional skip, authority waiver, due exception and withdrawal;
- minimal assignment-scoped evidence receipts when a local Finished fact must survive cross-device/reinstall.

Bookmarks, notes, reading-list presence, catalog order, profile-fit, audio playback, disclosure state, route visits and LLM answers do not satisfy completion.

## Evidence receipt boundary

A receipt is justified only because group/public corpus Finished is currently local while B9 promises cross-device assignment recovery. Its payload is limited to:

- recipient/adoption ID;
- pinned version item ID;
- `source_domain='text_progress.finished_at'`;
- opaque source material key and canonical finish timestamp/hash;
- device/client idempotency key and observed/synced times.

It contains no last row, bookmark, note, text body, answer, grade or telemetry. It cannot be read by Reading Journey as a Finished writer. The learner UI distinguishes “complete locally; evidence waiting to sync” from “evidence synced.”

## Explicit events and actor policy

| Event | Actor | Meaning | Completion effect |
|---|---|---|---|
| `ACKNOWLEDGED` | learner, explicit Start/Acknowledge action | learner saw and accepted entry | none by itself |
| `OPTIONAL_SKIPPED` | learner | remember choice for one optional version item | optional item remains non-blocking |
| `REQUIRED_WAIVED` | scoped authority | documented exception for exact recipient/item/version | satisfies that required item |
| `DUE_EXCEPTION_SET` | scoped authority | replaces due display for recipient with reason | no content/progress effect |
| `WITHDRAWN` | scoped authority | assignment no longer required | removes active requirement; history retained |
| `RECIPIENT_ADDED` | scoped authority | explicit add after group snapshot | creates an auditable recipient relation |

No route visit, disclosure toggle, reload or navigation automatically appends one of these events.

## Conflict and idempotency rules

- Immutable versions eliminate edit conflicts for learners.
- Draft writes require `expected_draft_revision`; conflicts return current revision and a field/item diff, never last-write-wins.
- Create/publish/assign/event/receipt calls require a client idempotency key; same key+same payload returns the original result, same key+different payload fails.
- Append-only event merge is set-union by event ID. The latest valid due-exception event is a projection, not a row overwrite.
- Withdrawal/revocation dominates active presentation. A later reassign is a new explicit relation/event.
- Local cache/outbox can be deleted and rebuilt from server truth; unsynced events must be included in local export and clearly reported before reset.

## Honest unsupported cases in slice 1

- “Read again after assignment” when the text was already Finished.
- Required/scored LLM comprehension.
- Automatically branching/adaptive/AI-generated paths.
- Teacher assignment of a learner-private text.
- Dynamic auto-assignment to future group members.
- Server reconstruction of exact reading position across devices.
