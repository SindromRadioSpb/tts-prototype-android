# Current capability and gap inventory

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=official current sources; INFERENCE=proposal/assumption.

## Capability map with exact anchors

| Domain | Current capability | Exact anchor | Gap for this program |
|---|---|---|---|
| Public publication | Dedicated publisher/draft/immutable edition/item/asset/event/idempotency aggregate | migrations/063_publication_domain.sql:15,91,113,155,170,180-219 | No solution, thread, post, report or moderation entity |
| Single writer | publicationRepo owns copy, validation, hash read-back and pointer flip inside BEGIN IMMEDIATE | db/publicationRepo.js:92,106,470,544-558 | Must not become forum writer; at most supplies read-only anchor resolution |
| Anonymous reads | Separate /api/public-corpora catalog/work/asset/package routes | server.js:3897-3990 | No task-bound resources or discussion projections |
| Writer security | Owner/publisher, strict same-origin JSON, CSRF, idempotency | server.js:3848-3873; server.js:474,1716 | Public contributor signup, recovery and granular community permissions absent |
| Physics corpus | 74 tasks, immutable edition 2, row audio, anonymous Reader | docs/research/physics-corpus/2026-08-25/README.md:3-9,36-63 | Corpus includes problem statements, not solution rights or forum lifecycle |
| Stable work ID | Hash of source_domain/source_corpus_id/source_work_id; snapshot hash and edition pin body | db/publicationRepo.js:470; public/js/public-corpus-adapter.js:43-83 | Current deep link only slug + work; no subpart route |
| Physics source rows | task_number plus source page/image hash; rows have order_index/source row/subrow | docs/research/physics-corpus/2026-08-24/physics-year1-corpus-records.json:49-155 | No globally stable semantic subpart ID; display 1.1 is unsafe across editions |
| Reader anchors | sentence_id and order_index scrolling | public/js/library-ui.js:7372-7389 | order_index is edition-local; DOM target is not durable external identity |
| Local import | Source metadata pins slug, corpus, edition, work, manifest and snapshot | public/js/public-corpus-adapter.js:59-78 | Local OPFS copy must not become canonical forum mapping |
| Reader state | openReader calls localDb.touchOpened except presentation restore | public/js/library-ui.js:7215-7330 | Anonymous server read is clean, but local device recency may change |
| Identity | Users, hashed sessions, CSRF, consent history, audit and deletion journal | migrations/020_identity.sql:12-75; db/identityRepo.js:44-279 | Owner bootstrap and invite-created member are not public registration/verification/recovery |
| Export/delete | Dynamic user_id sweep; secrets excluded; deletion journal survives | db/identityRepo.js:279-374; scripts/premium/auth-smoke.js:138-230 | Future author bodies, tombstones, legal audit and public attribution need an explicit deletion contract |
| Group access | ACTIVE membership checked on every restricted read; owner/member roles | db/groupCorpusRepo.js:5,47-63; migrations/056_group_song_corpus_p0.sql | Not a community role system; group membership cannot be reused as contributor/moderator authority |
| Invites | 24h one-time hashed JOIN/LOGIN tokens; revoke closes reads | db/groupInviteRepo.js:8,35-115 | No email verification, account recovery, public enrollment or multi-community tenancy |
| Telegram | Bilateral pairing, secret-first webhook, dedup and revocation patterns | migrations/027_channel_link.sql; scripts/premium/telegram-pairing-smoke.js:172-373 | Telegram link is optional delivery identity, not canonical community account or SSO proof |
| Mini App | HMAC initData, scoped short session, replay ledger/auth-context revocation | migrations/034_miniapp_session.sql; scripts/premium/miniapp-auth-smoke.js:121-173 | Does not authorize web forum posts and cannot be generalized without a new decision |
| Notifications | Preferences, quiet/mute, cross-channel daily claim, deterministic selection | migrations/032_notification_preferences.sql; db/nudgeCoordinator.js:3-155 | No subscription/outbox/mention/reply fan-out domain; nudge ledger must not be reused |
| Backup | Production Online Backup API, integrity, SHA, archive read-back, retention | scripts/ops/backup-linguistpro-online.sh:72-129 | External bodies are not backed up; attachments need independent inventory and restore proof |
| Share/link UI | Stable public corpus URL and generic Send or save service | public/js/public-corpus-adapter.js:80-83; public/js/share-service.js | No provider normalization, health state, warning interstitial or dead-link lifecycle |
| UI/i18n | RU/EN/HE, document lang/dir, public corpus presenter, mobile evidence | public/js/corpus-item-presenter.js:247-283; public/i18n/index.js | No solutions/thread hierarchy, moderation states or mixed-content dir=auto contract |

## Negative-domain proof

The exact schema scan of migrations found no table named solution, solution_revision, external_resource, task_anchor, thread, post/comment, report, moderation_action or attachment. The only matching generic subscription table is migrations/024_push_subscriptions.sql and belongs to Web Push.

The exact server route scan found no /api route whose resource is solution, thread, comment, moderation or attachment. The file-name/repository scan found no canonical forum/solution/thread/moderation repository. db/learnerMemoryRepo.js:132 uses the word eligibleThreads for Mentor memory continuity; it is not a discussion thread. Content-Disposition attachment headers are exports, not file-upload storage.

Conclusion [CODE]: canonical forum domain today is NONE. Therefore a new persisted registry would require an additive domain/migration; reuse of review_log, notes, reading lists, group membership, publication_events or nudge_ledger would create a second writer or false semantics.

## Rechecked closed baseline

- [CODE + predecessor evidence] Physics script targets slug physics-year1-problems and 74 tasks: scripts/premium/publish-physics-corpus.js:18-20.
- [CODE] Edition rows/items/assets are immutable by triggers: migrations/063_publication_domain.sql:208-219.
- [CODE] Anonymous routes are separate from publication writers: server.js:3848-3990.
- [CODE] Public import provenance pins edition and hashes: public/js/public-corpus-adapter.js:59-78.
- [CODE] B9 document remains FROZEN and requires exact UNFREEZE ROOM-UX-B9: docs/planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md:4,28,60.
- [PREDECESSOR PRODUCTION_ANONYMOUS + OWNER_REPORTED] Edition 2 had 74 items/394 assets, anonymous 206 Range, owner SUCCESS; host disk was 91% used: physics README lines 36-63. No current live claim is made.

No contradiction requiring a stop was found on current HEAD. The only nuance is local OPFS recency on Reader open; it does not violate the stated prohibition on learner/account server state, but future UX copy and tests must distinguish local device state from server truth.

## Existing patterns worth reusing, not tables to overload

- Transaction pattern: serialized BEGIN IMMEDIATE, idempotency request hash, immutable receipt.
- Authorization pattern: principal-derived scope, deny-by-default, generic not-found across tenant boundaries.
- Consent pattern: append-only history plus action-time recheck.
- Telegram pattern: bilateral confirmation, token TTL/replay guard, atomic effect + dedup.
- Notification pattern: explicit preference, mute/quiet hours, claim-before-send and content-free aggregates.
- Backup pattern: online snapshot, integrity, hash, archive read-back, explicit restore drill.
- UI pattern: pure presenter/adapters, immutable provenance, localized state vocabulary, 380px/RTL/keyboard/reflow gates.

These are contracts. Reusing their storage rows for forum semantics is explicitly rejected.

## Unknowns

- Current production version/disk state after predecessor evidence.
- Real demand: attempts, unanswered questions, link rot and moderator capacity.
- Jurisdiction and intended age policy.
- Whether any external provider will be accepted by owner/community.
- Whether current Node SQLite build has FTS5 enabled; implementation must verify PRAGMA compile_options.
- Stable semantic subpart mapping across a future edition; source rows currently lack a durable cross-edition subpart UUID.
