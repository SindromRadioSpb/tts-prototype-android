# Tool, Resource, schema and identity contract

Date: 2026-08-26
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`; branch `main`; dirty tree preserved
Production basis: `3.11.440`; proposal only
Method: `CODE`, `EXTERNAL_PRIMARY`, `INFERENCE`

## Service boundary

```text
MCP legacy/modern adapter
  -> Agent Access authorization + consent + rate + audit
    -> PublicPublicationAgentReadService
      -> publication read projection
      -> Physics resource read projection (agent:true)
```

The MCP adapter owns only protocol mapping. `PublicPublicationAgentReadService` owns orchestration and closed output schemas. Existing domain repositories remain the only readers of their tables/files and their existing writers remain canonical. No MCP module imports SQLite or filesystem APIs.

## Pilot tools

| Tool | Scope | Input cap | Output cap | Purpose |
|---|---|---:|---:|---|
| `list_published_public_corpora` | `reading.publication.catalog.read` | 512 B | 12 KiB | List agent-discoverable current public editions |
| `search_published_public_items` | `reading.publication.catalog.read` | 2 KiB | 24 KiB | Bounded metadata search pinned to one edition |
| `get_published_public_item` | `reading.publication.item.read` | 2 KiB | 24 KiB | Exact immutable item snapshot/descriptor |
| `list_published_item_resources` | `reading.publication.resource.read` | 2 KiB | 24 KiB | Exact PDF/audio/other descriptors, never bytes |
| `read_published_text_window` | `reading.publication.item.read` | 2 KiB | 16 KiB | Bounded text rows only where `SOURCE_TEXT` is allowed |

All are `readOnlyHint=true`, `destructiveHint=false`, `idempotentHint=true`, `openWorldHint=false`; annotations are advisory only. Parallel execution remains disabled until isolation/load evidence.

No first-pilot tool accepts a URL, file path, SQL-like filter, arbitrary projection fields or raw page size. Queries are normalized NFC, 1–120 characters, no regex, and used only in parameterized domain search.

## Closed wire schemas

Normative schema families:

- `aa.published_public_corpora.1.0.0`
- `aa.published_public_items.1.0.0`
- `aa.published_public_item.1.0.0`
- `aa.published_item_resources.1.0.0`
- `aa.published_text_window.1.0.0`

Every object has `additionalProperties:false`. Common immutable identity:

```json
{
  "corpus": {
    "corpus_id": "pc_...",
    "slug": "physics-year1-problems",
    "title": "..."
  },
  "edition": {
    "edition_id": "ed_...",
    "edition_number": 2,
    "manifest_sha256": "64-hex"
  },
  "item": {
    "edition_item_id": "ei_...",
    "public_work_id": "work-...",
    "position_no": 1,
    "snapshot_sha256": "64-hex",
    "title": "...",
    "content_profile": "TEXT_ROWS|TASK|MIXED|METADATA_ONLY"
  }
}
```

The slug/title are projections; IDs and hashes are authority. Responses include `selected_at` and `generated_at`, but the immutable identity never uses time as a key.

Resource descriptor:

```json
{
  "resource_id": "domain stable id",
  "revision_id": "immutable revision or edition_asset_id",
  "kind": "PDF|AUDIO|TEXT_DERIVATIVE|EXTERNAL_LINK",
  "content_kind": "CONDITION_ONLY|CONDITION_AND_SOLUTION|SOURCE_AUDIO|OTHER",
  "mime": "application/pdf",
  "bytes": 2262821,
  "sha256": "64-hex",
  "language": "ru|he|en|und",
  "quality_status": "APPROVED|QUALITY_LIMITED",
  "first_party_url": "https://linguistpro.kolosei.com/...",
  "delivery": "HTTPS_RANGE",
  "canonical_body": false
}
```

`first_party_url` must be constructed server-side from allowlisted origin/path and the exact revision; it is never stored from client input. External links, package downloads, preview fetches and redirects are absent from the pilot.

Text windows contain at most 20 rows and 16 KiB, with stable row `order_index`, language fields, `next_cursor` and `has_more`. Long rows are rejected or losslessly bounded by the domain contract; no silent character corruption. The response labels source content as untrusted data and never as agent instruction.

## Pagination and concurrency

- Default page 20, maximum 50 metadata items; text maximum 20 rows.
- Cursor is opaque, HMAC-authenticated, maximum 512 bytes and binds scope, corpus, edition, filters, sort and last tuple.
- Current-edition search snapshots `edition_id` at request start; page 2 cannot jump to a new edition.
- Sort is deterministic: position/public-work for browse; bounded score then position/public-work for search.
- Repeated reads are side-effect free apart from content-free usage/audit aggregates.
- Client retries may repeat a call; no idempotency key is needed for reads, but request correlation is deduplicated in metrics.
- Cache key includes tool schema version, effective subject/connection authorization epoch, edition ID, target ID and latest rights epoch.
- Rights revoke or connection revoke increments/observes a live epoch and invalidates authorization before cached content is returned.

## MCP Resource projection

After tools pass the compatibility pilot, expose optional URIs:

```text
linguistpro://published/{corpus_id}/editions/{edition_id}/items/{edition_item_id}
linguistpro://published/{corpus_id}/editions/{edition_id}/items/{edition_item_id}/resources/{revision_id}
```

`resources/list` is bounded to authorized discoverable metadata; `resources/read` delegates to the same service methods. Tool results may include an MCP `ResourceLink` pointing at these URIs when the client supports it. The Resource has no independent cache, body or right. For binary descriptors, `resources/read` still returns metadata plus HTTPS URL, never base64 bytes.

## Stable errors

| Domain error | Client meaning | Retry |
|---|---|---|
| `AA_PUBLICATION_NOT_FOUND` | Absent or unauthorized; do not distinguish | No |
| `AA_PUBLICATION_EDITION_CHANGED` | Unpinned current pointer changed before selection completed | Once from page 1 |
| `AA_AGENT_RIGHT_REQUIRED` | Owner has not granted the required use class | No; ask owner in first-party UI |
| `AA_CURSOR_INVALID` | Malformed, filter-mismatched or expired cursor | No; restart page 1 |
| `AA_RESOURCE_INTEGRITY_UNAVAILABLE` | File/hash/read-back cannot be proven | No automatic content use; operator alert |
| `AA_CONTENT_PROFILE_UNSUPPORTED` | This immutable item has no supported bounded projection | No |
| `AA_OUTPUT_TOO_LARGE` | Requested/result window exceeds cap | Retry smaller window only |
| `AA_RATE_LIMITED` | Connection/subject/tool/resource budget exceeded | Respect bounded retry-after |

Errors expose no SQL, file path, user ID, token, rights basis, private/group existence or source body.

## OCR and derivative boundary

OCR is not required for the first pilot. When separately approved, a derivative must have:

- `derivative_id`, source resource revision/hash and page number;
- engine/provider/model/version, parameters and created time;
- page coordinates per block, language, confidence and review status;
- immutable derivative revision and independent `DERIVATIVE_TEXT` right;
- source PDF as canonical evidence and an explicit “machine transcription” label.

No agent correction overwrites the PDF, publication snapshot or OCR revision. Corrections become reviewed derivative revisions under a separate writer.

## Compatibility and versioning

- Existing tools/schemas/scopes remain byte-for-byte compatible.
- New capability names and scopes are additive and require new consent.
- SDK v2/protocol dual-era work is a separate red-test-first stage.
- Server advertises only capabilities actually available on the selected era.
- Schema version changes are additive minor fields only when current validators permit; breaking shapes get a new tool/schema version.
- Cache/version strategy includes exact SDK lock, MCP era, server app version and per-tool schema version.
