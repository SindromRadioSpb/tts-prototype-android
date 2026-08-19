# Domain, API and security specification

Status: target contract only. Entity/route names are frozen for red tests, but no
migration, runtime, credential or production action is authorized.

## 1. Aggregate boundaries

### Publication aggregate

One repository, proposed path `db/publicationRepo.js`, owns:

- corpus identity and stable slug;
- mutable draft and ordered draft items;
- immutable edition manifest/items;
- current-public-edition pointer;
- publication, rollback, withdrawal and archive events;
- publisher role checks and idempotency receipts.

It does not own learner progress, notes, retention, source editing, group membership,
Telegram identity or Mentor memory.

### Existing domains remain unchanged

- My Texts OPFS/SQLite is the editable private source.
- `group_corpora` remains `GROUP_RESTRICTED` and entitlement-checked.
- Ben-Yehuda remains a baked/versioned pipeline source.
- `review_log` remains append-only learner truth.
- B9 Path/Assignment entities remain absent.

## 2. Conceptual schema

Names below are required by the red contract; columns may be refined only without
weakening the invariants.

### `published_corpora`

| Field | Contract |
|---|---|
| `corpus_id` | opaque stable primary ID |
| `slug` | unique public stable route component |
| `title`, `description` | editorial identity, localized later if needed |
| `status` | `DRAFT_ACTIVE`, `PUBLISHED`, `WITHDRAWN`, `ARCHIVED` |
| `current_edition_id` | nullable pointer; must reference same corpus |
| `created_by`, `updated_by` | authenticated publisher principal |
| timestamps | server assigned |

### `publication_drafts` / `publication_draft_items`

Draft is mutable under optimistic versioning. Each item stores:

- stable item ID and position;
- source domain/key plus source revision/hash;
- copied content snapshot/hash, never a live My Texts pointer;
- title/creator/provenance/attribution;
- text and recording rights evidence references;
- separate `public_read_allowed`, `public_stream_allowed`,
  `package_download_allowed` tri-state facts (`NULL` means unresolved, not false);
- expected/included/missing audio counts and content hashes;
- last validation result/version.

Draft edits never mutate the source. Re-copy is explicit and produces a new draft
item revision.

### `published_corpus_editions` / `published_corpus_edition_items`

An edition is insert-only after its manifest hash is assigned. It contains exact
content/asset hashes and resolved permissions. The public pointer is updated only
after full read-back. Database triggers or repository guards reject update/delete of
published edition content; withdrawal adds state/event rather than rewriting history.

### `publication_events`

Append-only content-free audit event:

```text
event_id · corpus_id · edition_id? · actor_user_id
event_type · request_id/idempotency_key · occurred_at · reason_code
```

No text body, token, email payload, learner data or private local path enters audit.

## 3. Rights state

Review state:

```text
REVIEW_REQUIRED -> CLEARED
REVIEW_REQUIRED -> REJECTED
CLEARED         -> WITHDRAWN
```

The three publication permissions are independent:

- `public_read_allowed`: text/learning annotations may be served publicly;
- `public_stream_allowed`: recording may be streamed in the reader;
- `package_download_allowed`: recording may be embedded in a downloadable package.

`CLEARED` requires evidence type, actor, checked date and attribution/license text.
The generic non-commercial/educational notice, source URL or a takedown email is not
rights evidence. Unknown is blocking.

Study Songs selection rule:

```text
every selected work public_read_allowed = true
every included recording public_stream_allowed = true
download package includes only assets package_download_allowed = true
no selected item remains REVIEW_REQUIRED, REJECTED or WITHDRAWN
```

## 4. Read API

Public, no session required:

```text
GET /api/public-corpora
GET /api/public-corpora/:slug
GET /api/public-corpora/:slug/works?cursor=&limit=&q=&sort=&facet=
GET /api/public-corpora/:slug/works/:workId
GET /api/public-corpora/:slug/assets/:assetKey
```

Requirements:

- returns only `PUBLISHED` current edition content;
- response names `edition_id`, `manifest_sha256`, cache policy and per-capability
  facts;
- search/facets use the shared corpus retrieval grammar;
- invalid/withdrawn is honest `404`/tombstone policy, never protected content;
- public cache key includes immutable edition/hash;
- asset route enforces stream/download policy by route/purpose, not UI hiding;
- no cookies, user profile or learner state required for catalog/content.

## 5. Writer API

Authenticated `OWNER` or administratively granted `PUBLISHER`, CSRF and strict
same-origin JSON/upload:

```text
POST   /api/publication/corpora
PATCH  /api/publication/corpora/:corpusId/draft
POST   /api/publication/corpora/:corpusId/draft/items:copy
PATCH  /api/publication/corpora/:corpusId/draft/items/:itemId
POST   /api/publication/corpora/:corpusId/draft/items:reorder
POST   /api/publication/corpora/:corpusId/draft:validate
POST   /api/publication/corpora/:corpusId/draft:preview
POST   /api/publication/corpora/:corpusId:publish
POST   /api/publication/corpora/:corpusId:rollback
POST   /api/publication/corpora/:corpusId:withdraw
```

Every mutation requires:

- authenticated principal-derived publisher scope;
- draft expected version / optimistic concurrency;
- request idempotency key;
- bounded input/size/item count;
- per-item best-effort result for bulk copy;
- content-free audit receipt;
- stable error code and no stack/private path in response.

Publish transaction order:

```text
lock draft version
-> recompute validation from raw snapshots/assets
-> build immutable manifest
-> insert edition/items/event
-> read back and verify hashes
-> atomically set current_edition_id
-> commit
-> optional cache warm outside canonical transaction
```

No source delete/archive is part of this transaction.

## 6. Anonymous preview

Preview token is signed, single-purpose, short-lived and bound to exact draft version
and corpus. It grants read-only preview of that candidate, not writer access, group
membership or another draft. It is excluded from public indexes and carries
`Cache-Control: private, no-store`. Revoking/replacing the draft version invalidates
the token.

## 7. Share service contract

Proposed pure module: `public/js/share-service.js`.

```js
resolveSharePlan({ domain, access, rights, packageFacts })
buildLearningPackage({ sourceSnapshot, audioResolver, signal, onProgress })
shareFile({ file, title, text })
saveFile({ file, suggestedName })
```

`resolveSharePlan` returns one of:

```text
PUBLIC_LINK
PROTECTED_LINK
LEARNING_ZIP
PREVIEW_LINK
UNAVAILABLE(reason_code)
```

The package builder is side-effect free with respect to download/share. Its manifest
names expected, included and missing audio. Native file share requires both
`navigator.share` and `navigator.canShare({files})`; browser download/Files is a
first-class fallback. Cancel is not an error. No target app is claimed before the OS
offers it.

## 8. Mentor connection core

Proposed pure module: `public/js/mentor-connection-core.js`.

It maps independent backend facts to the ordered steps:

```text
ACCOUNT -> SYNC -> TELEGRAM -> AI_CONSENT
```

It does not create accounts, write progress or grant consent itself. UI actions call
existing/future dedicated APIs. Telegram token contract:

- random/signed, one-time, ≤ existing server TTL;
- bound to web user and purpose `telegram_pair`;
- bot user becomes a pending candidate, not linked identity;
- explicit bot Confirm finalizes only on exact token/account match;
- replay/expiry/mismatch fail closed and remain content-free in audit;
- unlink revokes future delivery, while retention copy truthfully states what prior
  Telegram messages cannot be recalled.

## 9. Threat and abuse matrix

| Threat | Required control |
|---|---|
| anonymous scrape/load | CDN/cache, pagination, rate limits, asset size ceilings |
| unauthorized publish | principal-derived OWNER/PUBLISHER, CSRF, same-origin, audit |
| cross-tenant draft read | corpus publisher scope on every writer/preview operation |
| stale overwrite | expected draft version; `409 DRAFT_VERSION_CONFLICT` |
| duplicate publish retry | idempotency key returns the same edition receipt |
| source changes after copy | hash mismatch warning; explicit re-copy |
| private-data leak | allowlisted snapshot serializer + forbidden-key scanner |
| rights bypass in UI | server publish recomputes rights from stored evidence |
| asset download bypass | purpose-specific route enforcement |
| takedown abuse | reviewed request; withdraw exact item/edition; preserve audit, not body |
| Telegram confused deputy | bilateral confirm, token binding/TTL/replay guard |
| large ZIP memory pressure | size preflight, bounded concurrency, cancel, stream/spill design |

## 10. Data lifecycle

- Draft can be archived; deletion policy needs a separately approved retention period.
- Published edition manifest remains immutable audit/rollback evidence.
- Withdrawal removes current public availability and cache eligibility; it cannot
  recall downloads.
- Public content is not learner data. Publisher principal/audit is account data and
  participates in export/delete policy without erasing required legal/audit facts.
- Local My Texts remains under existing local deletion/archive semantics.
- Share/package never includes progress, notes, `review_log`, account, consent, keys,
  Mentor memory or Telegram identifiers.

## 11. Error vocabulary

Minimum stable codes:

```text
UNAUTHENTICATED
PUBLISHER_FORBIDDEN
CORPUS_NOT_FOUND
DRAFT_VERSION_CONFLICT
SOURCE_SNAPSHOT_INVALID
SOURCE_CHANGED
RIGHTS_REVIEW_REQUIRED
PUBLIC_READ_NOT_ALLOWED
PUBLIC_STREAM_NOT_ALLOWED
PACKAGE_DOWNLOAD_NOT_ALLOWED
AUDIO_EXPECTED_MISSING
PRIVACY_FIELD_FORBIDDEN
EDITION_HASH_MISMATCH
PREVIEW_TOKEN_EXPIRED
PUBLICATION_ALREADY_COMMITTED
```

Messages name the next action. A committed publish receipt never returns a Retry
Publish action because optional cache warming failed.

## 12. Implementation sequencing after a new GO

1. Green the domain/schema/repository red tests in an isolated temporary DB.
2. Green anonymous read and publisher authorization tests before UI.
3. Green source snapshot privacy/hash and rights gates.
4. Implement Publication Center against fixtures; 380 RU/HE and keyboard/200% proof.
5. Implement shared Send or save service and Studio entry; device receiving-app proof
   remains later owner/device evidence.
6. Implement Room public adapter and owner deep link.
7. Implement Mentor connection core/journey in a separate serialized slice.
8. Only then request migration/release authority and a rights-cleared pilot.

No step authorizes B9, AI curation, automatic ASR/translation/timing or owner data
mutation.
