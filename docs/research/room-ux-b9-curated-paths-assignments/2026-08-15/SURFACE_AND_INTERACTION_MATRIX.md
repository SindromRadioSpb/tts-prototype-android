# Surface and interaction matrix

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; preserved.
Production: `https://linguistpro.kolosei.com/library.html`, version `3.11.388`.
Evidence method: `CODE`, `PRODUCTION`, `OWNER_LIVE_READ_ONLY`; no accepted new `ISOLATED_AUTOMATION`; prior acceptance is bounded `OWNER_REPORTED`; no `EXTERNAL_PRIMARY` claim.
Limitations: future UI contract and verification plan only; no HTML/CSS/locale/DOM change and no destructive owner test.

## Surface ownership

Owner resolution received 2026-08-15: editor/curator and teacher Assignment UI was mandatory in the proposed first implementation slice; a backend-only or owner-only release would not satisfy B9 maturity. Because no qualified curator-mentor is currently available, that slice and its migration are frozen. Exact historical design values remain in [the owner-decision record](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md); current authority is in [the freeze record](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md).

| Surface | Immediate B9 responsibility | Reads | Explicit writes | Must remain separate |
|---|---|---|---|---|
| Library/L0 | Distinct “Paths & Assignments” module; active required first, then optional/adopted; one resume projection may feed Today | versions, adoptions, recipients, completion projection | explicit adopt/leave/acknowledge only | Journey, Reading Lists, profile-fit and disclosure state |
| Public/personal/group corpus | Context link/badge for paths using current corpus; source picker for authorized curator | accessible version refs and material metadata | author adds item to mutable draft only | corpus catalog/order and group membership writers |
| Group home/management | Entry to scoped authoring; assignments/history/access-blocked summary | group scope, capabilities, recipient snapshot | draft/publish/assign/withdraw/waive through typed APIs | invite/member/catalog import writers |
| Reader | Compact path context: authority, version, step N/M, requiredness, Back/Next | current item, local last position/Finished | existing explicit Finished interaction only; optional skip/ack through explicit controls | Reader progress/bookmark/note writers |
| Trainer | Path context and return destination around existing Room Trainer | explicit target keys, `review_log` projection | existing explicit grade writer only | B9 events and SRS state |
| Mentor/Lesson Studio | Future “import human-reviewed draft” entry, disabled in immediate slice | source anchors/artifact metadata | none in slice 1 | provider consent, lesson session artifact, B9 publication |
| Curator/teacher workspace | List drafts/published/archived; edit sequence; validate access; preview; publish; assign; revise; archive; withdraw | scoped grants, materials, versions, assignments/audit | B9 draft/version/assignment APIs only | cohort `teacher.html`, corpus membership, source content truth |

## Learner interaction grammar

- **Assigned** always includes assigner/role, assigned date, pinned version and required/optional language. A group badge alone never says “assigned.”
- **Optional path** says “Start path” and creates learner adoption only after explicit activation.
- **Resume** opens the first accessible incomplete required step, otherwise the next optional step; it does not synthesize progress.
- **Blocked** names the access/material problem and offers Back/contact-authority; it never silently advances.
- **Finished** is shown only when canonical Finished/evidence projection says so.
- **Reviewed** is shown only from canonical `review_log` rule.
- **Advisory comprehension** is labelled optional and “not a grade; no completion credit.”
- **Withdrawn/archived/version available** remain visible in history with bounded explanation.

## Authoring interaction grammar

1. Create a path shell in a visible owner scope.
2. Edit a mutable draft with typed vertical rows.
3. Add sources through bounded paginated pickers; show provenance/access for every item.
4. Set required/optional and supported completion rule; invalid combinations fail before preview.
5. Preview as learner in RU/EN/HE without writing learner data.
6. Publish to immutable version after a clear diff/hash summary.
7. Assign that version to learner/current group snapshot, or expose it as optional.
8. Revise by forking a new draft from a version; never edit the assigned version.
9. Archive the path or withdraw a specific assignment with separate confirmation.

Drag-and-drop may be an enhancement, never the only reordering control. Each item needs keyboard-accessible Move before/after/top/bottom actions and a live-region announcement. Destructive actions remain separated from routine editing.

## Proposed DOM and locale contract

Suggested stable DOM hooks, subject to implementation approval:

- `#roomPathsModule`, `#roomPathDetail`, `#roomPathAuthoring`
- `[data-path-id]`, `[data-path-version-id]`, `[data-path-item-id]`
- region headings with explicit names; list/ordered-list semantics for sequence
- status text in `aria-describedby`; `aria-current="step"` for current item
- `aria-expanded`/`aria-controls` only for true disclosures
- polite live region for reorder/save/sync outcomes; errors focus the summary

Locale families must be added in all RU/EN/HE roots together, for example:

- `room.paths.*`
- `room.assignments.*`
- `room.pathAuthoring.*`
- `room.pathItem.*`
- `room.assignmentStatus.*`
- `room.pathAccess.*`

No English fallback may ship in HE/RU. Bidi-safe interpolation isolates path titles, names, version numbers and dates. Long Russian/Hebrew titles wrap; controls use logical margin/padding/inset properties.

## Future implementation verification matrix

These gates are prepared, not executed in this research session.

| Area | Cases | Required evidence |
|---|---|---|
| Viewports/locales | desktop RU; desktop HE/RTL; 380×844 RU; 380×844 HE/RTL; 200% zoom/reflow; long RU/Hebrew titles | screenshots + DOM; no horizontal page overflow |
| Input/accessibility | keyboard-only; screen-reader DOM/ARIA; focus return after dialogs/reorder; non-drag reorder | automated semantics plus physical/AT evidence explicitly labelled |
| Persistence | reload; close/reopen tab; offline/reconnect; service-worker update | local/server cursor and no duplicate events |
| Path shapes | empty; one item; mixed text/song/review/comprehension; optional/required; bounded 48-item; cross-corpus; multiple paths/assignments | validation and vertical bounded rendering |
| Material/access | unavailable/removed/protected; member revoked; assignment withdrawn; content access restored | fail-closed reads, redacted export, no content leakage |
| Versioning | new version after assignment; draft conflict; explicit reassign; archived path | original recipient stays pinned; diff/audit correct |
| Learner history | no progress; partial; already-Finished text; canonical due review already completed | deterministic projection; no duplicate Finished/review writer |
| Sync/recovery | conflict/replay/idempotency; eviction/reinstall; export/import/read-back; unsynced outbox | checksums/cursors; repeat import adds zero logical events |
| Privacy/cost | no learner-content telemetry; no implicit provider/LLM call; revoked access | network log and audit inspection |
| Non-write navigation | open/resume/back/next/reload/disclosure | zero progress/bookmark/review/ack event unless explicit action |
| Service worker | old client/new server, new client/old cache, update/reload/offline | version parity and rollback evidence |

Automation must never be labelled as physical iPhone, VoiceOver or owner-live evidence. Owner-profile execution remains read-only until a separately approved smoke script enumerates exact writes and rollback.

## Visual Finishing boundary

B9 needs only the minimum coherent components: section header, version/status/provenance rows, vertical typed items, author actions, dialogs and empty/blocked/offline states. Global icon replacement, typography program, motion polish and broad component restyling remain outside B9.
