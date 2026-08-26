# Truth, identity and lifecycle map

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=official current sources; INFERENCE=all proposed entities/lifecycles. Proposed entities are options, not schema or implementation authority.

## One-writer map

| Entity | Needed when | Canonical writer | Immutable / mutable | ID and idempotency | Edition/access/lifecycle |
|---|---|---|---|---|---|
| task_anchor | pilot | forum registry, resolving publication read-only | tuple immutable; equivalence append-only | opaque anchor_id; unique tuple | pins corpus_id, edition_id, public_work_id, snapshot_sha256, optional semantic selector |
| external_resource | pilot | forum registry | URL revisions append-only; status mutable by events | resource_id; actor+operation+idempotency key+request hash | DRAFT → APPROVED/PRIVATE → QUARANTINED/DEAD/WITHDRAWN |
| solution | native-text gate | solution service only | identity immutable; current_revision pointer mutable | solution_id; create key | visibility and moderation evaluated per request |
| solution_revision | native-text gate | solution service only | append-only body/hash/provenance | revision_id; solution+client mutation UUID | DRAFT → SUBMITTED → PUBLISHED/SUPERSEDED/REDACTED |
| thread | Q&A gate | discussion service only | task anchor immutable; state event-driven | thread_id; anchor+dedup fingerprint advisory only | OPEN/RESOLVED/LOCKED/ARCHIVED/QUARANTINED |
| post/comment | Q&A gate | discussion service only | revisions append-only; tombstone mutable projection | post_id + client mutation UUID | visible/group/private; edit window; quarantine/redaction |
| subscription | notification gate | subscription service only | mutable explicit preference | principal+target unique; PUT idempotent | ACTIVE/MUTED/REVOKED; no implicit follows |
| notification | notification gate | outbox/delivery worker | append-only intent/attempt; derived display | event+recipient+channel unique | PENDING/CLAIMED/SENT/FAILED/SUPPRESSED |
| report | moderation gate | report service | report immutable; status event-driven | reporter+target+reason+time bucket dedup | OPEN/TRIAGED/ACTIONED/DISMISSED/APPEALED |
| moderation_action | moderation gate | moderation service | append-only | action_id + moderator idempotency | QUARANTINE/RESTORE/LOCK/REDACT; reason and appeal link |
| attachment | attachment gate only | attachment service/object inventory | immutable bytes/hash; metadata/state event-driven | attachment_id + SHA256 dedup within owner scope | UPLOADING/QUARANTINED/CLEAN/PUBLISHED/REJECTED/ORPHANED/DELETED |

External provider is canonical for external body and permissions. LinguistPro is canonical only for mapping, declared provenance, observed health and its own review/moderation projection. A native solution body never shares identity with an external body; an explicit relation may say derived_from or mirrors.

## Proposed task anchor contract

Required:

- corpus_id
- edition_id
- public_work_id
- snapshot_sha256
- anchor_kind = TASK or ROW or SUBPART or FORMULA_REGION
- anchor_ref_version

For TASK, no finer selector. For current physics rows, a safe edition-local option is order_index plus a normalized semantic fingerprint over kind + he_plain + source row metadata. source page/image hash may support evidence but is not the public identity. A future corpus edition should mint stable source_segment_id during bake; implementation may not fabricate one retrospectively.

New edition behavior:

1. Old anchor remains readable and immutable.
2. New task is unlinked until corpus editor records equivalence: EXACT, CHANGED_MINOR, CHANGED_MATERIAL, SPLIT, MERGED or NONE.
3. Only EXACT may project a successor suggestion, still visibly naming edition. No comments or official status copy automatically.
4. CHANGED task archives old discussion and starts a new anchor. A human may cite/relink a solution revision.

## Independent truth dimensions

| Dimension | Type | Writer | Meaning |
|---|---|---|---|
| author_asserted | provenance event | author/service | author claims authorship/rights; not correctness |
| expert_review | signed review event per revision | trusted reviewer | rubric verdict; may be superseded |
| community_useful | rate-limited aggregate of unique principals | vote service | perceived usefulness; not correctness |
| moderation_state | moderation projection | moderator service | allowed visibility/safety; not quality |
| official_corpus_status | corpus association event | corpus editor/owner | endorsed official relation to exact task edition |

No boolean verified may combine them.

## Lifecycle rules

- Edit: create a revision with expected current revision; conflict returns 409 and never overwrites.
- Delete: author withdrawal hides public body but leaves a tombstone and required audit; personal export/delete handling is defined per field and legal basis.
- Redaction: exceptional moderator/legal action; record prior hash and action, protect any retained body, never expose it in normal export.
- Quarantine: immediate reversible visibility stop; public returns generic unavailable, moderators retain evidence.
- Archive: read-only, stable URL and successor context.
- Appeal: separate event/actor; original moderator cannot unilaterally close their own challenged high-impact action.

## Readers, export, backup and retention

| Data | Readers | Export | Backup/restore | Retention recommendation |
|---|---|---|---|---|
| Public approved metadata/body | anonymous | public record + author export | DB snapshot; cache rebuildable | while published; tombstone after withdrawal |
| Private/group item | owner/member relation only | principal-scoped | encrypted DB backup | delete on account/group policy unless legal hold |
| Report body | assigned moderators only | reporter’s own submission, redacted third-party fields | protected DB backup | 12 months after closure as initial policy option |
| Moderation audit | authorized governance | action summary, not other users’ PII | append-only backup | 24 months initial option; legal review |
| Notification attempts | principal + ops aggregate | content-free delivery record | DB backup | 30–90 days details, aggregates longer |
| External URL | according to registry visibility | exact URL/provenance | DB backup; external content excluded | while valid + tombstone |
| Attachment | access policy | metadata + file if lawful | object version inventory + DB pointer | policy by state; orphan GC after grace |

Retention values are owner decisions requiring legal review; they are not implemented facts.

## Indexes, pagination and concurrency

- Unique task anchor tuple; anchor_id opaque.
- Resources: anchor_id, visibility, moderation_state, language, resource_type, quality sort, created_at/resource_id cursor.
- Solution revisions: solution_id + revision_no unique.
- Threads/posts: anchor_id/state/updated_at; posts cursor by created_at + post_id, never offset at scale.
- Reports: state/priority/created_at; reporter/target dedup.
- Notifications: recipient/state/next_attempt_at; unique event-recipient-channel.
- External health: provider/next_check_at/status; no arbitrary URL fetch in request path.
- Optimistic revision numbers for author edits; BEGIN IMMEDIATE only around bounded DB changes; slow external/delivery work outside transaction through outbox.
- Cache keys include visibility scope + edition/anchor + projection version. Moderation/withdrawal purges or bumps exact projection; immutable corpus caches remain separate.

## Relationship to existing truth

- Publication: supplies immutable task snapshot; forum never flips publication pointer.
- Group corpus/membership: may be one visibility relation only after explicit integration; does not grant contributor/reviewer/moderator role.
- Learner truth/review_log: read/write NONE for forum. Community helpfulness is not a review event.
- Notes/reading lists: no forum record or question is stored there.
- Notification/nudge ledger: not reused; community notifications need separate subscription/outbox semantics.
- Telegram channel link: delivery candidate only after explicit consent; not authorship proof.
