# Findings

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=official current sources; INFERENCE=recommendation/unknowns. Research-only.

## Confirmed facts

1. Current HEAD has an isolated public publication aggregate with immutable editions/items/assets, idempotent writer and anonymous read routes.
2. Physics edition 2 predecessor evidence records 74 task cards, row audio and owner acceptance.
3. Work/edition/snapshot identity exists; row order_index exists, but a cross-edition semantic subpart UUID does not.
4. There is no canonical solution/thread/comment/moderation/attachment domain or route.
5. Existing identity supports owner sessions, consent/audit/export/delete and invite-created members, not public community onboarding/recovery.
6. Group membership, Telegram pairing, nudge ledger, notes, reading lists and review_log cannot safely serve as hidden forum authority/truth.
7. Current backup tooling has a strong SQLite online snapshot/integrity/read-back pattern.
8. B9 remains FROZEN.
9. External mature platforms already solve meaningful portions of identity/moderation/search/notifications; task-edition mapping remains product-specific.
10. Attachments radically change security, backup and cost and are unnecessary for the first value slice.

## Changed/rejected hypotheses

- Link-first is accepted only as owner-curated typed metadata with visible provider and no fetch/preview; arbitrary user links are rejected.
- Optional fine anchor is accepted only edition-locally using semantic metadata/fingerprint; DOM binding is rejected.
- Solution and comment remain separate. Comments are not in pilot.
- Anonymous read is accepted; all writes require proven identity/capability.
- Solo-first value is owner-curated resources and stable task return, not a new private notes/list writer.
- Full native forum is rejected as the first solution.
- External platform reuse remains a serious contingency: Discourse/Apache Answer, not iframe-by-default.

## Recommendation

D: hybrid staged, registry first. Proposed persisted pilot requires an additive migration if approved, because no existing table has correct semantics. No migration was created or executed.

Pilot:

- exact physics task anchor to immutable edition/work/snapshot;
- owner-only create/edit/approve/withdraw of typed external resources;
- anonymous read of approved public records;
- Google Drive/Telegram/owner-allowlisted HTTPS, explicit external warning, no preview/fetch;
- language, provenance, rights declaration, permission/health, independent trust dimensions;
- task-local list/search/filter; stable URL;
- no public accounts, native body, comments, notifications, votes, reports, attachments, B9 or group authority.

## Unknowns and assumptions

Unknown: current served version/disk, actual demand/link failure, intended age/jurisdictions, provider preference, moderator availability, FTS5 availability, future semantic segment IDs.

Assumptions: low initial write volume; owner can curate pilot; existing public corpus stays active; external links can satisfy early content needs; no server attachments needed.

Any failed assumption triggers a new owner decision rather than silent scope expansion.

## GO/NO_GO gates

GO to detailed design/red tests only after the owner approves D1–D16 and additive migration intent.
NO_GO to runtime/migration execution/production until a separately scoped implementation authorization.
Native text, Q&A and attachments each require the measured gates in USER_JOURNEYS_AND_JOBS.md.

## Required migration

Recommended pilot: YES, one additive bounded forum metadata domain, after temporary-DB rehearsal.
This session: MIGRATION=NONE_EXECUTED.

## Stop list

No runtime/API/UI/CSS/i18n; no schema/migration; no forum/user data; no production/config/deploy; no corpus pointer/assets; no identity/Telegram changes; no attachments/providers; no notes/list/group/review/publication writer reuse; no B9; no commit/push.

## Session assertions

CODE=NONE
MIGRATION=NONE_EXECUTED
OWNER_DATA_WRITES=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
