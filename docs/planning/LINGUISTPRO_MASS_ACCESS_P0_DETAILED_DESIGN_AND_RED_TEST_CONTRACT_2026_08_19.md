# LinguistPro MASS-ACCESS P0 — detailed design and red-test contract

Date: 2026-08-19

Status: `OWNER-APPROVED D1–D6 · DESIGN FROZEN · I3 LOCAL IMPLEMENTATION COMPLETE · 12/14 IMPLEMENTATION CHECKS RED`

Branch: `mass-access-p0-design-red-tests` (`NON-DEPLOY`)

Design baseline: `955bf3146ced22a4c9bfc55fa9eb4cb4a9ac88e8`

## 1. Owner authority

The owner issued:

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

Owner addendum: every corpus should expose polished RU/EN/HE copyright contact copy
naming `peter@kolosei.com`, stating that infringing materials will be removed, and
describing the project as non-commercial and primarily educational if relevant.

Normalization of that addendum:

- exact localized copy is frozen in this design and machine fixture;
- it appears consistently at corpus/reader/publisher boundaries without repeating
  a legal wall on every card;
- the statement is a contact/takedown process, not a rights grant;
- non-commercial educational purpose is relevant context but cannot clear an item;
- Study Songs release still requires per-item text/recording rights.

## 2. Scope completed by this packet

This P0 slice freezes:

- domain/entity lifecycle and single-writer boundary;
- read/writer API shapes and security requirements;
- exact learner, publisher, share and Mentor flows;
- Publication Center visual plan and responsive wireframes;
- exact RU/EN/HE copyright/takedown copy;
- executable green invariants and implementation-red checks;
- later implementation sequencing, allowlist, stop list and evidence gates.

It does not create runtime functionality.

## 3. Canonical artifacts

- [P0 artifact passport](../research/mass-access-public-corpora/2026-08-19/p0-detailed-design/README.md)
- [UX flow and copy specification](../research/mass-access-public-corpora/2026-08-19/p0-detailed-design/UX_FLOW_AND_COPY_SPEC.md)
- [Domain, API and security specification](../research/mass-access-public-corpora/2026-08-19/p0-detailed-design/DOMAIN_API_SECURITY_SPEC.md)
- [Red-test matrix](../research/mass-access-public-corpora/2026-08-19/p0-detailed-design/RED_TEST_MATRIX.md)
- frozen fixture: `scripts/premium/fixtures/mass-access-p0/contract-v1.json`
- executable red contract: `scripts/premium/mass-access-p0-contract-red.js`

Predecessor: [MASS-ACCESS decision packet](LINGUISTPRO_MASS_ACCESS_PUBLIC_CORPORA_DECISION_PACKET_2026_08_19.md).

## 4. Frozen domain decision

```text
PRIVATE_LOCAL My Texts
  -> explicit snapshot copy
  -> PUBLICATION DRAFT
  -> validation from raw snapshot/assets/rights evidence
  -> IMMUTABLE EDITION
  -> atomic current-edition pointer
  -> ANONYMOUS PUBLIC READ
```

Existing `GROUP_RESTRICTED` and Ben-Yehuda baked domains remain separate. Public
content is not served by adding a branch to group membership.

One proposed `db/publicationRepo.js` repository owns all publication writes. No
learner truth is copied or rewritten. Drafts are mutable/versioned; published edition
content is immutable; publication events are append-only. Rollback moves the public
pointer to a verified edition. Withdrawal adds a state/event and cannot promise to
recall downloads.

## 5. Source copy contract

Default UI language is **Publish a copy**. The copy contains only allowlisted content
and source/provenance facts. It excludes:

- progress and Finished state;
- `review_log`, SRS projections and memory state;
- bookmarks, personal notes and reading lists;
- account/session/consent records;
- Mentor memory/history and provider keys;
- Telegram identity/preferences;
- local absolute paths and browser-profile identifiers.

“Move” is a later compound workflow:

```text
publish copy -> verify edition read-back -> separately offer local archive
```

Archive is never selected by default and is never in the publish transaction.

## 6. Rights and Study Songs

Product decision:

```text
OWNER_PRODUCT_DECISION=STUDY_SONGS_MAY_BE_PUBLIC
FIRST_TARGET=STUDY_SONGS
CURRENT_RUNTIME=GROUP_RESTRICTED
CURRENT_RIGHTS=REVIEW_REQUIRED
RELEASE=BLOCKED
```

Every selected item records independent facts:

```text
public_read_allowed
public_stream_allowed
package_download_allowed
```

`NULL`/unknown blocks the corresponding operation. A source URL, attribution,
takedown email or educational/non-commercial statement is not clearance evidence.
Stream-only is valid and blocks package embedding. Removed/withdrawn is not silently
replaced with TTS unless the resulting text publication and TTS use are separately
permitted and honestly labelled.

The current Israeli Copyright Act fair-use text names purpose/character as one of
several factors and gives education-related examples; it also requires considering
the work, amount used and market effect. The product therefore treats the owner's
non-commercial educational intent as relevant context, not a blanket authorization.
This packet is not legal advice.

Reference: [WIPO Lex — Copyright Act, 2007](https://www.wipo.int/wipolex/en/legislation/details/5016).

## 7. Copyright/takedown copy

Runtime keys frozen for a later implementation:

```text
room.copyright.title
room.copyright.summary
room.copyright.body
room.copyright.contactLabel
room.copyright.localPrivateNote
```

### RU

**О проекте и авторских правах**

LinguistPro — некоммерческий образовательный проект. Материалы размещаются прежде
всего для изучения языков. Если вы считаете, что какой-либо материал нарушает
авторские права, напишите на peter@kolosei.com и укажите ссылку на материал и, по
возможности, сведения о правообладателе. Мы рассмотрим обращение и удалим материал,
нарушающий права, либо ограничим доступ к нему.

### EN

**About this project and copyright**

LinguistPro is a non-commercial educational project. Materials are provided
primarily for language learning. If you believe that any material infringes
copyright, email peter@kolosei.com and include the material URL and, if possible,
information identifying the rightsholder. We will review the notice and remove
infringing material or restrict access to it.

### HE

**על המיזם וזכויות יוצרים**

LinguistPro הוא מיזם חינוכי לא־מסחרי. החומרים מוצגים בראש ובראשונה לצורך לימוד
שפות. אם לדעתכם חומר כלשהו מפר זכויות יוצרים, אנא כתבו ל־peter@kolosei.com וציינו
את הקישור לחומר, ואם אפשר, פרטים המזהים את בעל הזכויות. אנו נבדוק את הפנייה ונסיר
חומר מפר או נגביל את הגישה אליו.

Placement contract:

- compact disclosure on every corpus identity surface;
- full copy under About this material in public/protected readers;
- My Texts first explains that local texts are not published, then exposes the same
  project notice;
- Publication Center preview and confirmation show it without allowing it to
  satisfy a red rights check;
- public landing/share metadata provides the same contact path.

## 8. Learner access contract

Public browsing and reading are anonymous. Local progress is useful immediately.
Account creation is contextual and optional until the learner requests sync,
cross-device history, Mentor continuity or Telegram.

The contextual sheet names:

1. the requested benefit;
2. what stays on the device without an account;
3. what will sync after separate consent;
4. profile mismatch choices: dry-run merge, keep separate, cancel;
5. the exact return target after completion.

The current owner-secret bootstrap and group JOIN/LOGIN are not repurposed as mass
registration. Provider selection/recovery/deletion remain a separately threat-
modeled implementation decision.

## 9. Publication Center contract

Subject: a small Hebrew-learning press. Single job: turn selected private/cleared
material into a trustworthy public edition.

Visual vocabulary uses existing `visual-foundations.css` values and type roles. The
single signature is a publication spine representing actual Draft → Checks → Preview
→ Published states. It collapses to a compact Ready line when green and expands all
blocking issues before final confirmation.

Required zones, in order:

```text
corpus identity and draft state
publication spine
issue/all/order item views
item list with text/audio rights facts
anonymous preview
publish confirmation/receipt
```

On 380 px it is one vertical flow, 44 px targets, safe-area primary action, `dir=auto`
for mixed titles, no color-only status, no horizontal overflow. No generic admin-card
wall, new palette, gradient or decorative timeline is allowed.

## 10. Send or save contract

One shell, domain-specific payload:

| Domain | Primary payload |
|---|---|
| Public | stable public link |
| My Texts | learning ZIP |
| Protected group | protected link with recipient-access explanation |
| Publisher draft | expiring owner preview link only |

The future ZIP builder returns file+manifest and performs no download/share. The
click handler tries `navigator.canShare({files})` then `navigator.share`; Save is the
normal fallback. JSON moves to Advanced/Compatibility.

Package truth shows expected/included/missing audio before the action. A package with
missing expected audio is partial and cannot say “with all audio”. Built, share-sheet
opened and saved are separate receipts. Reading Room must reuse the same service.

## 11. Mentor connection contract

Ordered, independent steps:

```text
ACCOUNT -> SYNC -> TELEGRAM -> AI_CONSENT
```

Only the next unfinished step is expanded. Telegram states are Not linked, Pending,
Linked, Expired and Error. A signed one-time start token opens the bot; the bot shows
Confirm. Manual `/confirm` is removed from target copy, but bilateral confirmation,
TTL, replay rejection and exact account match remain.

Linked state includes masked identity, send test, notification settings and confirmed
disconnect. Unlink copy does not promise deletion of already delivered Telegram
messages.

## 12. API/security summary

Anonymous read namespace:

```text
/api/public-corpora/**
```

Publisher writer namespace:

```text
/api/publication/corpora/**
```

The namespaces have different authorization, rate limits and caching. Every writer
mutation has authenticated principal-derived publisher scope, CSRF, strict same
origin, optimistic draft version, idempotency key, bounded payload, content-free
audit and stable errors. Public assets enforce stream/download policy server-side.

Publish recomputes validation, inserts/read-backs an immutable edition, then flips the
pointer atomically. Optional cache warm runs afterward and cannot convert canonical
success into retry-publish copy.

## 13. Executable red baseline

```text
npm run smoke:mass-access:p0:red
```

Green guards prove current restrictions and frozen design fixture. Fourteen red checks
cover schema, editions/events, rights, repository, public/writer APIs, Room adapter,
Publication Center, Studio/Room entrances, share service, primary ZIP behavior,
Mentor connection core and exact RU/EN/HE runtime copy.

Original P0 baseline:

```text
GREEN_GUARDS=8/8
IMPLEMENTATION=RED
EXIT=1
```

Successor I3 execution on `mass-access-i3-share-implementation` intentionally turns
`P0-R11` and `P0-R12` green without weakening the contract. The expected post-I3
result is therefore `implemented=2/14`, `pending=12`, exit `1`. See
[the I3 implementation record](LINGUISTPRO_MASS_ACCESS_I3_SHARE_IMPLEMENTATION_2026_08_19.md).

The test is not in `npm test`, CI or deploy gates. Exit `2` is a guard failure and
invalidates the design baseline.

## 14. R1–R17 synthesis

| Lens | P0 outcome |
|---|---|
| R1 | no language data synthesis or automatic forms |
| R2 | public entry leads to reading; setup is progressive |
| R3 | content/source/edition relations use stable IDs and hashes |
| R4 | 380/RTL/focus/empty/error states frozen; no dead ends |
| R5 | guest-first/offline value; share fallback is first-class |
| R6 | corpus identity, attribution, order and takedown are editorial facts |
| R7 | creator/register/rights cannot be inferred from title/source URL |
| R8 | same reader affordances where truth permits; no fabricated parity |
| R9 | asserted rights, derived checks and owner decisions remain distinct |
| R10 | no morphology change |
| R11 | immutable edition/read-back; exact copy tests; red checks not weakened |
| R12 | one publication writer; no second learner truth |
| R13 | future migrations need separate authority, rehearsal and rollback |
| R14 | anonymous/publisher/group namespaces and tenant scopes are separate |
| R15 | private data exclusion, consent separation and withdrawal lifecycle |
| R16 | cache/static assets, bounded ZIP and rate limits prevent cost explosion |
| R17 | Mentor stays reading-first; no grader/review writer is added |

## 15. Later implementation slices

I3 was subsequently authorized as an isolated non-deploy slice. I1, I2, I4 and I5
remain unauthorized by that successor authority.

### I1 — domain/schema/repository

Temporary DB red→green for draft, immutable edition, events, rights, idempotency,
publisher isolation and rollback. Requires explicit `MIGRATION=YES` before execution.

### I2 — owner Publication Center

Studio entry, one writer, copy serializer, issues/order/preview/publish receipt.
Requires I1 green and exact UI allowlist; no production release bundled.

### I3 — shared Send or save

Pure package/share service, Studio then Room integration. Can be authorized separately
without the publication migration, but physical receiving-app proof remains a release
gate.

Execution status: local implementation and automated/browser evidence complete on a
non-deploy branch; physical Telegram/WhatsApp/Files receipt remains pending.

### I4 — anonymous Room adapter and public pilot

Requires rights-cleared content, public load/cache/security gates and separate deploy
authority. Start with a bounded cleared pilot, then Study Songs.

### I5 — account + Mentor connection

Separate provider/recovery/identity threat model and Telegram live/device evidence.

## 16. Proposed future implementation allowlist

Names are design targets, not current edit permission:

- one new numbered migration + isolated tests;
- `db/publicationRepo.js`;
- bounded server route/service modules for the two namespaces;
- `public/js/public-corpus-adapter.js`;
- `public/js/publication-center.js` plus bounded CSS/HTML hosts;
- `public/js/share-service.js`;
- `public/js/mentor-connection-core.js` and bounded Mentor host changes;
- Studio/Room entry points;
- RU/EN/HE locale additions, SW/version lockstep only in a separately authorized
  release slice;
- tests/smokes/evidence named by the implementation packet.

## 17. Stop list

Stop if:

- any item remains rights-unknown but is selected for publication;
- the copyright notice is proposed as rights clearance;
- public reads are routed through group membership or vice versa;
- publish edits/deletes My Texts or learner truth;
- a partial archive is labelled complete;
- Telegram login, pairing, sync and AI consent collapse into one action;
- an implementation test is weakened merely to become green;
- B9 Path/Assignment/AI-curator entities appear;
- migration, production, deploy or owner-data work is attempted under this P0;
- unrelated dirty-tree files enter the commit.

## 18. Next authority syntax

P0 ends at design + red tests. A later implementation authorization must select one
slice and restate migration/deploy boundaries. Recommended first choice is the
independent Share repair because it addresses a confirmed defect without requiring
the publication migration:

```text
APPROVE MASS-ACCESS-I3-SHARE-IMPLEMENTATION:
SCOPE=SHARED_SEND_OR_SAVE_STUDIO_FIRST;
ROOM=DESIGN_ADAPTER_ONLY_UNTIL_STUDIO_GREEN;
MIGRATION=NO;
OWNER_DATA_WRITES=NO;
DEPLOY=NO;
B9=KEEP_FROZEN;
COMMIT=YES;
PUSH=NON_DEPLOY_BRANCH
```

Alternatively, begin publication foundation only with a new explicit authority that
includes `MIGRATION=YES` and a named temporary-DB/rollback packet. No authority is
inferred from the present approval.

## 19. P0 execution record

```text
RUNTIME_IMPLEMENTATION=NONE
MIGRATION=NONE
OWNER_DATA_WRITES=NONE
PRODUCTION_READS=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
B9=FROZEN
DESIGN=FROZEN
RED_TEST=EXPECTED
```
