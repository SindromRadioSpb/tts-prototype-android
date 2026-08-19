# LinguistPro MASS-ACCESS — public corpora, sharing and onboarding decision packet

Date: 2026-08-19

Status: `RESEARCH COMPLETE · OWNER DECISION REQUIRED · NO CODE/MIGRATION/DEPLOY`

Branch: `main`

Source commit at recon start: `e80f2aef74f7c070101e55bd421051320d25f4be`

Production reference: `https://linguistpro.kolosei.com/library.html`, read-only
version `3.11.404`.

## Executive decision

Recommend a new bounded **MASS-ACCESS & PUBLIC CORPUS PUBLISHING** program with
four explicit trust domains:

```text
private editable source     publication boundary       public immutable edition
My Texts / owner source  -> checks + preview + copy -> anonymous Reading Room

protected group corpus   -- remains entitlement-gated; not a public-corpus backend
Ben-Yehuda pipeline      -- remains its own baked public source contract
```

The essential design choice is **publish a verified copy, never expose a live
private folder**. The owner gets a simple collection workflow; the system retains
rights, provenance, rollback and privacy boundaries needed for mass use.

The owner has authorized Study Songs as a public product. It should be the first
real corpus migrated through the new publisher **after** per-work text and recording
rights are cleared. The current `REVIEW_REQUIRED` data cannot honestly be converted
to public/downloadable merely because product permission is granted.

In parallel, fix sharing around one truthful `Send or save` interaction: My Texts
shares the full learning ZIP through the OS share sheet when supported; public
materials share stable links by default; protected materials share protected links.
Reading Room Mentor should offer one progressive in-context connection journey:
account, sync, Telegram, then optional Mentor/AI consents.

## Scope boundary

This program is adjacent to, but does not reopen:

- the closed Library/corpus surface contract;
- `ROOM-UX-B9` Curated Paths & Assignments;
- speculative AI curation or assignment authorship;
- automatic ASR, translation, timing interpolation or mass rebinding;
- owner learner-data mutation.

Study Songs becoming public is corpus publication, not an Assignment and not a B9
unfreeze. B9 remains frozen until its own qualified human-curator and explicit
`UNFREEZE ROOM-UX-B9` gates are satisfied.

Research details:

- [Current state and gaps](../research/mass-access-public-corpora/2026-08-19/CURRENT_STATE_AND_GAPS.md)
- [Capability/access matrix](../research/mass-access-public-corpora/2026-08-19/CAPABILITY_ACCESS_MATRIX.md)
- [Research passport](../research/mass-access-public-corpora/2026-08-19/README.md)

## Decisions requested

### D1 — Public-corpus architecture

#### Option A: add `PUBLIC` to `group_corpora.visibility`

Fastest schema delta, but not recommended. The table, routes, invitations, cache
assumptions, ownership and audit vocabulary all mean “group entitlement”. Public
traffic would inherit accidental membership branches and future contributors would
struggle to know which rules apply.

#### Option B: publish a static mirror/snapshot

A reasonable transition for one corpus. It can prove rights, asset delivery and
anonymous-reader load with limited writer UI. It becomes weak once the owner needs
many corpora, revisions, rollback and a clear editorial queue.

#### Option C: dedicated publication domain with immutable editions — recommended

Create a server-backed public-corpus aggregate whose draft references source
snapshots and whose publish operation produces an immutable edition. A stable public
URL resolves to the current edition. Updating creates the next edition; rollback
changes the pointer, not history.

Conceptual entities, names not yet migration-approved:

```text
published_corpus
  -> corpus_draft
       -> draft_item (copied source snapshot + checks)
  -> corpus_edition (immutable manifest)
       -> edition_item (content/audio/provenance/rights hashes)
  -> publication_event / withdrawal_event
```

Benefits: anonymous access is native; group membership stays protected; public
assets can be cached by edition/hash; preview and rollback are real; per-item rights
remain visible; future editor roles can be added without corrupting learner truth.

#### Option D: live-mirror a My Texts folder

Reject. My Texts is local/private and editable. A live mirror creates two writers,
surprising publication after local edits, fragile offline semantics and an unsafe
privacy boundary.

**Proposed decision:** `D1=C`, with Option B allowed only as a disposable P0 rights
and delivery spike that does not become the long-term writer.

### D2 — One writer, two entrances

Recommended owner journey:

1. From Studio Library card or multi-select, choose **Add to corpus**.
2. Choose an existing draft or **New public corpus**.
3. The shared **Publication Center** opens with copied items and check results.
4. In Reading Room, owner-only **Manage corpus** deep-links to that same writer.
5. The Room never grows a second independent publication implementation.

“Move from My Texts” is exposed only as a safe compound operation:

```text
publish verified copy -> verify published edition -> optionally archive local source
```

The original is never deleted in the same transaction. The confirmation explains
that archive is local and reversible. Default action and language: **Publish a copy**.

**Proposed decision:** one server publication writer, Studio as the primary authoring
entrance, Room as a contextual management entrance.

### D3 — Study Songs release meaning

Record now:

```text
OWNER_PRODUCT_DECISION=STUDY_SONGS_MAY_BE_PUBLIC
CURRENT_RUNTIME_VISIBILITY=GROUP_RESTRICTED
CURRENT_RIGHTS_STATE=REVIEW_REQUIRED
PUBLIC_RELEASE=BLOCKED_PENDING_ITEM_RIGHTS
```

Required rights columns/checks must distinguish:

- public reading of text/annotations;
- public streaming of each recording;
- package/download redistribution of each recording;
- attribution/license text and evidence reference;
- withdrawal/takedown.

Possible outcomes per work are: public with stream+download, public with stream only,
public text with TTS but no supplied recording, or excluded. There is no honest
corpus-wide shortcut while rows are `REVIEW_REQUIRED`.

**Proposed decision:** Study Songs is the first production target, but rights review
is a release gate rather than a post-launch task.

### D4 — Learner access and account onboarding

Recommended **guest-first capability ladder**:

```text
Open public link
  -> browse/read immediately
  -> keep local progress without an account
  -> ask for identity only at a cloud boundary:
       sync / cross-device / Mentor history / Telegram
  -> explain benefit in the current context
  -> explicitly claim or merge the local profile
```

Candidate mass sign-in set:

- Telegram login as a low-friction primary option for the current audience;
- email magic link as the non-Telegram fallback;
- passkeys later after account recovery and multi-device evidence exist.

The choice of identity provider is an implementation-research decision, not yet an
authorization to ship auth. Existing owner bootstrap and group invitations remain
as-is until a separate threat model covers enumeration, token reuse, recovery,
profile binding, deletion/export and rate limits.

Never silently bind a browser profile already associated with another cloud user.
Show a dry-run summary and offer merge, keep separate, or cancel.

**Proposed decision:** anonymous public reading + contextual optional account;
identity, sync, Telegram delivery and Mentor/AI processing remain separate consents.

#### Reading Room entry without an onboarding wall

Preserve the closed Library hierarchy and add public inventory inside its existing
catalog ownership boundary:

```text
Reading Room
  Continue / Start
  Corpora
    Public: Ben-Yehuda · Study Songs · future owner-published corpora
    On this device: My Texts
    Your access: protected group corpora (only when entitled)
  Catalog / search
  Mentor
```

Each corpus row carries one plain trust label — `Public`, `On this device`, or
`Access required` — and one primary action. Owner-only Draft/Manage status is shown
only to publishers. Do not turn the learner home into an administration dashboard.

Deep links keep intent through authentication: after signing in or accepting an
invite, return to the requested corpus/work. If access still fails, show whether the
cause is sign-in, missing entitlement, expired invite or withdrawn publication and
offer only the relevant recovery action.

The Studio/Room bridge is likewise contextual:

- Room public/protected reader -> **Open in Studio** only when an editable local
  copy exists or the user explicitly chooses **Make my copy**;
- Studio private material -> **Read in Room** remains local; **Add to corpus** is
  owner/publisher-only;
- Room owner corpus -> **Manage corpus** opens Publication Center;
- no public reader sees import, rights-review or edition controls.

### D5 — Share interaction

Rename the interaction to **Send or save** (`Отправить или сохранить`) and show the
actual payload before invoking the OS:

```text
+--------------------------------------------------+
| Send or save                                     |
| Learning archive · 84 MB                         |
| 36 rows · audio 34 included · 2 missing          |
| [ Share ZIP ]  [ Save ZIP ]                      |
|                                                  |
| Advanced: lightweight JSON                       |
+--------------------------------------------------+
```

Payload rules:

- My Texts: full learning ZIP is primary.
- Public work/corpus: stable public link is primary; ZIP only if download policy
  allows all included assets.
- Protected work: protected link plus “recipient needs access”; no member-side body
  export by implication.
- JSON remains available under Advanced/Compatibility.

Implementation contract for a later approved slice:

1. Build the ZIP once as a `Blob`/`File`; do not trigger download inside the builder.
2. Verify promised completeness; if “with audio” is claimed, missing expected audio
   must be zero. An explicitly labeled partial package can be a separate advanced
   choice.
3. If `navigator.canShare({files:[zip]})`, call `navigator.share` from the user's
   click activation.
4. Otherwise show Save/download and copy-link alternatives; never claim WhatsApp or
   Telegram delivery before their receiving app confirms it.
5. Track `archive built`, `share sheet opened` and `copy saved` as separate states.

Do not hard-code Telegram/WhatsApp buttons for local files: Web Share delegates the
available targets to the operating system and browser, and file sharing is not
uniformly supported. The fallback is part of the primary UX, not an error screen.

Reading Room should reuse the same pure package/share service and source-policy
resolver rather than fork Studio logic.

**Proposed decision:** approve this contract as a bounded early implementation slice
after decision approval; native ZIP share must get real Android/iPhone receiving-app
evidence before being called production-accepted.

### D6 — Mentor + Telegram connection

Keep Telegram inside **Mentor**, but replace the fragmented controls with one
progressive capability panel:

```text
Mentor connection
  1  Account          Connected / Connect
  2  Progress sync    On / Review data
  3  Telegram         Not linked / Connect
  4  AI enhancement   Optional / Review consent
```

Only the next relevant step is expanded. A guest is not bounced to an unexplained
cloud icon; an inline sheet explains why this capability needs an account.

Telegram states:

- **Not linked:** consent copy, bot identity and `Open @LinguistProMentorBot`.
- **Pending:** explicit “Confirm in Telegram”, reopen, generate a new link, cancel;
  refresh on page focus/return and via a short visible-only poll.
- **Linked:** masked Telegram identity, send-test action, notification settings and
  a confirmed disconnect/revoke.

Use a signed one-time, short-lived bot start token. The bot may present a Confirm
button directly after `/start`; this removes the learner's manual `/confirm` typing
without weakening two-sided confirmation. Token replay, account mismatch and expiry
remain server-enforced.

**Proposed decision:** preserve current security semantics; improve journey and
status recovery, with live Telegram bot/device evidence required later.

## Publication Center UX

The visual direction follows the already shipped Room system rather than introducing
a separate admin aesthetic. Its subject is a small Hebrew-learning press: editorial,
quiet and provenance-aware.

### Compact corpus creation

```text
New public corpus

Name *                 [________________________]
Short description      [________________________]
Access                  (●) Public  ( ) Restricted
Default item policy     [review every item's rights]

[ Create draft ]
```

After creation, the owner lands in the item workspace; no long wizard is required
before a draft exists.

### Draft workspace

```text
+ Publication Center ---------------- Draft --------+
| Study Songs                          Edition 1      |
| Description · cover · public URL                   |
|                                                    |
| Publication spine                                 |
|  ✓ 77 texts     ! 77 rights review     ✓ privacy   |
|  ! audio: 2,155 included / expected not certified  |
|                                                    |
| Items: search · filter issues · reorder            |
| [✓] Song title      text !rights  audio !rights    |
| [✓] Song title      text ✓        audio stream-only|
|                                                    |
| [ Anonymous preview ]           [ Publish edition ]|
+----------------------------------------------------+
```

One restrained signature element — the **publication spine** — shows Draft, Ready
and Published state plus content/rights/audio/privacy checks. It is functional, not
decorative. Reuse current Room tokens (`--bg-page`, `--bg-card`, `--bg-muted`,
`--text-*`, `--border-soft`, `--accent`) and existing light/dark behavior. Avoid a
grid of generic dashboard cards, ornamental gradients and new palette drift.

On 380 px, the spine becomes a vertical disclosure, primary action remains sticky
within safe-area bounds, rows keep 44 px targets, Hebrew titles remain RTL and long
rights labels wrap rather than truncate essential status.

Design self-critique: the publication spine could become visually dominant and make
a simple three-item corpus feel bureaucratic. The implementation should therefore
show a compact `Ready to publish` summary when every check is green and expand the
full spine only for issues or owner request. Conversely, hiding rights behind a
generic success badge would be unsafe; text/audio permissions and missing assets
must remain one tap away and always expanded before the final Publish confirmation.

## Pre-publish and rollback contract

Every edition must pass:

1. non-empty title, description and stable slug;
2. at least one valid item and no broken content reference;
3. source provenance and content hash for every item;
4. explicit text and audio rights outcomes;
5. audio expected/included/missing truth;
6. no learner progress, notes, keys, personal metadata or hidden local paths;
7. duplicate/stale-source warnings resolved or explicitly accepted;
8. anonymous preview on 380 px plus desktop; RTL, keyboard and 200% gates in the
   later implementation matrix;
9. immutable manifest built and read back before the public pointer changes.

Canonical publication success and optional cache/CDN warm-up are separate outcomes.
If the immutable edition and pointer are committed, a later cache warning must not
tell the owner to republish or repeat a completed write.

Unpublish stops new discovery and changes the current pointer/tombstone. It cannot
promise retraction from recipients, caches or previously downloaded packages.

## “Maximum learner functionality” without dishonest parity

Public corpora should use the same mature reader, audio/TTS, morphology,
translation, progress, Finished and retention components wherever their truth
contracts are satisfied. The source adapter supplies capabilities; the UI exposes
only those capabilities.

Examples:

- no recorded audio -> TTS may remain, but no green recorded-audio indicator;
- no source timing -> no derived/interpolated karaoke timing;
- stream allowed, download forbidden -> reader playback works, ZIP omits the asset
  and labels why;
- guest -> local progress works, cloud history does not pretend to be active;
- public URL -> sharing works without an account;
- protected URL -> sharing never bypasses recipient entitlement.

The detailed matrix is canonical in
[CAPABILITY_ACCESS_MATRIX.md](../research/mass-access-public-corpora/2026-08-19/CAPABILITY_ACCESS_MATRIX.md).

## Scale, safety and operability

Mass readiness requires explicit non-visual work:

- immutable/hash-addressed public content and audio suitable for cache/object
  storage; do not make the app container generate or relay the same static package
  on every request;
- rate limits and abuse controls on account creation, magic links, pairing, share
  package generation and search;
- content quotas and owner-visible package size/audio completeness;
- audit events for draft changes, publication, withdrawal and role grants;
- least-privilege `OWNER`/`PUBLISHER` roles granted administratively, not public
  self-service;
- anonymous/public APIs separated from owner writers and protected group routes;
- cache keys that include edition/hash, and revocation-safe protected caches;
- consent receipts, export/delete paths and truthful data-retention copy;
- accessibility, 380 px, RTL, keyboard, 200%, offline/reconnect and service-worker
  gates;
- metrics split by browse/read/account-connect/pair/publish outcomes, without
  collecting text bodies or learner truth unnecessarily;
- takedown contact, response SLA and a per-item withdrawal path.

For corpus audio/TTS, generate reusable assets once where lawful; do not create a
per-user synthesis cost multiplier. Optional LLM features must degrade to the
existing useful deterministic Mentor behavior and expose quota/provider state.

## Roles R1–R17 synthesis

| Lens | Required decision/guardrail |
|---|---|
| R1 Architecture | dedicated publication aggregate; one writer; immutable editions |
| R2 Data integrity | snapshot + hash; read-back; no private-to-public live binding |
| R3 Security | separate anonymous reads, publisher writes and group entitlements |
| R4 Offline/PWA | guest local progress; edition caches; explicit revoked-content policy |
| R5 Mobile UX | guest-first, contextual sheet, native share with fallback, 380 px |
| R6 Cost/performance | hashed static assets/CDN; build once; quotas and telemetry |
| R7 QA | source × capability × device × access matrix; negative entitlement tests |
| R8 Accessibility | semantic states, focus return, 44 px targets, RTL, 200%, AT gates |
| R9 Product | public reading first; account only for durable cloud benefit |
| R10 Data lifecycle | Draft/Published/Superseded/Withdrawn; export/delete/retention |
| R11 Honest UX | distinguish stream/download, local/cloud, built/shared/saved states |
| R12 Dual-write | publish copied edition; do not synchronize two editable truths |
| R13 Privacy | exclude learner data/keys; consent separately for sync/Telegram/AI |
| R14 Release | rights and anonymous read-back before pointer flip; rollback target |
| R15 Observability | publication audit, package completeness, pairing and auth health |
| R16 Internationalization | RU/EN/HE copy; Hebrew RTL and mixed-direction titles |
| R17 Owner operations | simple writer, issue filters, preview, rollback, takedown |

## Delivery slices and gates

### P0 — decisions and rights inventory

No runtime change. Approve D1–D6, name the first public corpus, produce the per-item
rights inventory and decide whether each recording allows stream and/or download.

Exit:

```text
DECISIONS_LOCKED
STUDY_SONGS_RIGHTS_INVENTORY_COMPLETE
NO_REVIEW_REQUIRED_ITEM_SELECTED_FOR_PUBLICATION
```

### P1 — publication foundation and owner writer

Schema/API for draft + immutable edition, owner/publisher authorization, Studio
entrance, Publication Center, anonymous preview, public registry adapter and rollback.
Use a small cleared pilot before the full Study Songs corpus.

Gates: migrations forward/backward rehearsal; API authorization; read-back hashes;
privacy exclusion; anonymous cache; 380/RTL/keyboard/200%; no B9 entities.

### P2 — Send or save

A separable, early usability slice: pure ZIP builder, Web Share file path, fallback,
source-policy resolver, Studio integration, then Room integration.

Gates: complete audio count; unsupported-share fallback; cancel/error; large-file
behavior; Android Telegram/WhatsApp; iPhone Share Sheet/Files; received package
import/read-back. Automation alone is not owner/device PASS.

### P3 — mass account and Mentor connection

Threat-model and implement guest claim, chosen providers, recovery, device identity
handling and the in-Mentor Telegram journey.

Gates: enumeration/replay/rate limiting; account mismatch; consent receipts;
unlink/revoke; bot return/focus; multi-device; account export/delete; owner-live
read-only plus explicit device rows.

### P4 — controlled public beta and scale

Publish a cleared bounded corpus, observe cache/audio/search/auth/package load,
exercise takedown and rollback, then expand. `BETA` is not `GA`; owner-reported
acceptance is recorded exactly as reported and does not synthesize missing device/AT
evidence.

## Immediate work versus backlog

### Immediate after owner approval

1. P0 decision record and Study Songs rights inventory.
2. P2 Share contract can run as a small independent fix because its root cause and
   target are already clear; release still needs real receiving-app evidence.
3. P1 publication-domain detailed design and red tests, then a rights-cleared pilot.
4. P3 identity/Mentor research only after the auth-provider decision and threat model.

### Backlog / explicitly excluded

- public self-service corpus creation for arbitrary learners;
- multi-editor collaboration, review comments and contributor submissions;
- subscriptions/payments;
- AI-generated curriculum or AI acting as qualified curator;
- Paths, Assignments, cohort grading or B9 schema;
- social feed, likes, public annotations and leaderboards;
- automatic translation/ASR/timing during publication;
- full-corpus ZIP export before rights, size and delivery policies are proven.

## Verification matrix for later implementation

| Surface | Required evidence |
|---|---|
| Anonymous public corpus | unauthenticated API + 380/desktop + RTL + reload/offline/reconnect |
| Owner writer | permission negatives, draft persistence, anonymous preview, publish read-back, rollback |
| My Texts copy | source unchanged, snapshot hash, no progress/notes/keys, stale-source warning |
| Protected corpus | anonymous 401/403, revoked membership, cache purge, protected link copy |
| Share ZIP | unit/integration/browser + Android/iPhone receiving-app import/read-back |
| Mentor/Telegram | none/pending/linked/expired/replay/mismatch/unlink; live bot return |
| Account claim | local-only, clean claim, mismatch, merge dry-run, cancel, recovery, deletion |
| Accessibility | keyboard/focus, semantic states, screen reader, 200%, reduced motion |
| Scale | edition cache, audio/package load, rate limits, queue/storage alerts, rollback drill |

`review_log` and owner learner state are read-only throughout validation unless the
owner separately authorizes a disposable test identity. Opening a queue does not
authorize grading or synthesized review events.

## Implementation allowlist after a separate GO

Exact filenames must be derived in P1 recon; the bounded areas are:

- a new numbered publication migration and its tests;
- publication repository/service/routes with anonymous read and owner writer split;
- public-corpus registry adapter;
- shared publication-center UI and localized copy;
- Studio **Add to corpus** entry and Room owner management link;
- shared package/share service and focused tests;
- Mentor connection UI and auth/pairing changes only in its own approved slice;
- planning/research/evidence artifacts and version bump required by a released slice.

## Stop list

Stop and return to the owner if any of these occurs:

- the desired public item has unresolved text or recording rights;
- “public” is proposed as a bypass around group membership without a publication
  edition and anonymous threat model;
- implementation requires mutating/deleting owner My Texts, progress, notes,
  `review_log`, Telegram binding or cloud identity;
- browser profile identity would be rebound or merged without a user-visible dry run;
- a cache/CDN success is treated as canonical publication success or vice versa;
- a partial/missing-audio archive would be labeled complete;
- B9 Path/Assignment/curator scope appears;
- automatic timing/translation/ASR or mass rebinding appears;
- a physical-device, assistive-technology, WhatsApp or Telegram PASS is inferred
  from automation;
- unrelated dirty-tree files enter the allowlist.

## Owner decision syntax

Approve the recommended decisions and authorize the next **research/design + red
test** slice, not migrations or production, with:

```text
APPROVE MASS-ACCESS-P0:
D1=DEDICATED_PUBLICATION_DOMAIN_IMMUTABLE_EDITIONS;
D2=ONE_WRITER_STUDIO_PRIMARY_ROOM_DEEP_LINK;
D3=STUDY_SONGS_FIRST_AFTER_PER_ITEM_RIGHTS_CLEARANCE;
D4=GUEST_FIRST_CONTEXTUAL_OPTIONAL_ACCOUNT;
D5=UNIFIED_SEND_OR_SAVE_SOURCE_SPECIFIC_PAYLOAD;
D6=MENTOR_INLINE_ACCOUNT_SYNC_TELEGRAM_JOURNEY;
NEXT=DETAILED_DESIGN_AND_RED_TESTS_ONLY;
B9=KEEP_FROZEN;
MIGRATION=NO;
OWNER_DATA_WRITES=NO;
DEPLOY=NO;
COMMIT=YES;
PUSH=YES
```

If the architecture or rights boundary is not accepted, the successful outcome is:

```text
NO_GO_KEEP_MASS_ACCESS_RESEARCH_ONLY
```

A later implementation authorization must name the selected slice, exact allowlist,
migration authority, deployment authority and owner-live boundary. This packet does
not imply them.

## Research execution record

```text
CODE=NONE
MIGRATION=NONE
OWNER_DATA_WRITES=NONE
PRODUCTION_WRITES=NONE
PRODUCTION_READ_ONLY=HEALTH_VERSION_AND_ANONYMOUS_BOUNDARY
CHROME_INTERACTIVE=NOT_AVAILABLE_PROFILE_IN_USE
PHYSICAL_DEVICE=NOT_RUN
ASSISTIVE_TECHNOLOGY=NOT_RUN
B9=FROZEN
```
