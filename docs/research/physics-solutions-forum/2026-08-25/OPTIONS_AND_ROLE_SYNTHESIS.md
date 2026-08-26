# Options and R1–R17 synthesis

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=official current sources; INFERENCE=score/adjudication/recommendation.

## High-level options

Scores: 1 poor, 5 strong for the stated criterion. Cost score 5 means least operational cost.

| Criterion | A Link registry | B External community | C Native bounded | D Staged hybrid |
|---|---:|---:|---:|---:|
| Solo-first value | 5 | 2 | 4 | 5 |
| Task-edition integrity | 5 | 3 | 5 | 5 |
| Moderation maturity day one | 2 | 5 | 1 | 3 |
| Identity risk day one | 5 with owner-only write | 3 | 1 | 5 |
| Searchability | 3 | 5 | 5 | 4 |
| Portability | 3 | 3–5 by provider | 5 | 4 |
| Cost/ops first pilot | 5 | 2–4 | 1 | 5 |
| Long-term control | 2 | 3 | 5 | 5 |
| Double-truth risk | 3 | 3 | 5 | 4 with strict writer map |
| Recommendation | viable pilot | contingency | NO_GO first | GO |

### A — External link registry

Value: immediate owner-curated solutions and exact task context. Failure: permission rot, unsafe URLs, external deletion, fragmented moderation and no searchable body. Correct use: registry metadata is canonical only for mapping/provenance; external provider is canonical for body. Export cannot claim content backup.

### B — Embedded/external community

Value: real moderation, accounts, search, notifications and exports without inventing them. Failure: SSO mapping, separate privacy/consent, provider outage/price, CSP/mobile embedding and task mapping projection. Preferred products for a trial: Discourse for forum/community or Apache Answer for Q&A; evaluate standalone deep links before iframe embedding.

### C — Native bounded solutions + comments

Value: exact task semantics and full control. Failure: identity, recovery, CSRF, sanitization, moderation, notifications, backup, abuse and accessibility are all part of the first public write. It is not a small feature. Reject as first slice.

### D — Hybrid staged

Stage 1 is A with a new bounded registry and owner-only writer. Stage 2 adds native text solution revisions only after gate. Stage 3 adds task Q&A/comments after a second gate. Stage 4 adds attachments last. One writer per body type prevents hybrid dual truth.

## R1–R17 adjudication

| Lens | Finding | Design consequence |
|---|---|---|
| R1 Architecture | Publication and forum facts have different lifecycle/authority | New bounded aggregate; publicationRepo read-only anchor source |
| R2 Pedagogy | Viewing a full solution can short-circuit productive attempt | Progressive reveal and hint/solution types; no shame/fatigue metrics |
| R3 Security | Existing owner/member identity is not public community security | owner-only pilot; public write NO_GO until identity program |
| R4 UX | Empty forum is worse than no forum | Do not render threads/comments before supply/demand gate |
| R5 Mobile | Task context, cards and editor compete at 380px | Single-column hierarchy, collapsible context, no side rail dependency |
| R6 Data | Display number and DOM are unstable | Immutable edition/work/snapshot + semantic local anchor |
| R7 Ops | Moderation and restore are ongoing duties | queue SLO, on-call/owner capacity, restore drill before public writes |
| R8 Cost | Attachments/notifications cause nonlinear egress and work | text/link first, budgets and fan-out queue triggers |
| R9 Failure | External access and providers fail independently | explicit access/health state, no transparent proxy, visible provider |
| R10 Evidence | Popularity is not correctness | separate review/useful/moderation/official dimensions |
| R11 Honest learning | Content surveillance would corrupt trust | content-free aggregates only; no answer-body analytics |
| R12 One writer | Reusing notes/review/group/publication creates semantic dual writes | each entity owns its repository and transaction |
| R13 Platform | RU/EN/HE, RTL, local/offline and service worker matter | pure presenter, localized states, cache versioning and offline honesty |
| R14 Release | Additive schema is not rollback by DROP | feature flag off, stop writers, retain data, code rollback |
| R15 Observability | Reports/appeals need evidence without leaking bodies | content-free operational log + protected moderation audit |
| R16 Privacy | Public authorship and minors raise durable risk | pseudonymity, no DMs, PII warning, age/legal gate, export/delete contract |
| R17 Governance | Moderator, reviewer and corpus editor are not interchangeable | capability registry, conflict checks, two-person destructive actions |

## D1–D16 concise decisions

| ID | Options considered | Recommendation | Principal failure/rollback | Approval value |
|---|---|---|---|---|
| D1 | registry / external / native / hybrid | HYBRID_STAGED_REGISTRY_FIRST | native scope explosion; rollback flag off | lock staged product shape |
| D2 | display number / work / immutable semantic | EDITION_WORK_SNAPSHOT_SUBPART | wrong-task carry; no silent rebind | lock anchor tuple |
| D3 | link / native text / both | EXTERNAL_LINK_FIRST_NATIVE_REVISIONS_GATED | double body truth; writer map | lock independent truth states |
| D4 | one thread / many / Q&A | NO_DISCUSSION_PILOT_THEN_TASK_QA | empty/noisy threads; disable writes/read archive | lock Q&A semantics |
| D5 | new notes/queue / curated / reuse writers | OWNER_CURATED_SOLO_VALUE | duplicate personal writer; none created | lock solo value without community |
| D6 | existing invites / Telegram / new identity | ANON_READ_OWNER_WRITE_IDENTITY_PROGRAM_LATER | account takeover/recovery gap; no public write | lock onboarding boundary |
| D7 | single role / RBAC / capabilities+ReBAC | LEAST_PRIVILEGE_CAPABILITY_REGISTRY | moderator privilege creep; revoke role | lock separation of duties |
| D8 | reactive delete / quarantine+appeal | QUARANTINE_AUDIT_APPEAL | irreversible abuse; restore visibility | lock moderation lifecycle |
| D9 | arbitrary URL / allowlisted typed providers | HTTPS_TYPED_NO_FETCH_NO_PREVIEW | phishing/SSRF; quarantine link | lock provider policy |
| D10 | local files / object storage / none | DEFER_ATTACHMENTS | malware/cost/orphans; feature absent | lock deferral gate |
| D11 | all channels / in-app / none | NONE_PILOT_THEN_IN_APP_OPT_IN | amplification; disable outbox | lock consent/dedup policy |
| D12 | global feed / task-local / external search | TASK_LOCAL_FIRST_BOUNDED_FTS_LATER | empty/noisy discovery; rebuild index | lock pagination/ranking |
| D13 | public default / private default / bounded | PUBLIC_APPROVED_READ_WRITES_RESTRICTED | PII/minors/copyright; quarantine/takedown | lock privacy/legal gate |
| D14 | distributed upfront / SQLite measured | SQLITE_SINGLE_WRITER_WITH_TRIGGERS | hot writes/backups; gate queue/DB evolution | lock quantified thresholds |
| D15 | separate forum / Reader-integrated hierarchy | TASK_CONTEXT_SOLUTIONS_QA_PROGRESSIVE | 380/RTL/focus failures; flag off | lock acceptance matrix |
| D16 | big launch / staged pilot | OWNER_ONLY_LINK_PILOT | unsafe rollout; stop at each stage | lock release sequence |

Detailed compatibility, migration and rollback live in the decision packet and specialized artifacts.

## Recommendation and NO_GO boundaries

GO only for planning an additive owner-only metadata pilot. NO_GO for public account creation, native comments, Telegram SSO, external preview fetching, attachments, reputation automation, B9/assignments and production migration until separate approval and gates.
