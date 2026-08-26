# LinguistPro All-Corpora Agent Access MCP — owner research decision packet

Date: 2026-08-26
Program: `ALL-CORPORA-AGENT-ACCESS-MCP-R`
Authority: research-only packet; no implementation authorization
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`
Branch: `main`; `HEAD == origin/main` at recon
Dirty tree: yes before research; unrelated owner files preserved
Production inspected: anonymous GET only; served version basis `3.11.440`
Evidence: `CODE`, `LOCAL_TEST`, `PRODUCTION_ANONYMOUS`, predecessor `OWNER_LIVE_READ_ONLY` / `OWNER_REPORTED`, `EXTERNAL_PRIMARY`, `INFERENCE`
Research index: [all-corpora-agent-access-mcp/2026-08-26](../research/all-corpora-agent-access-mcp/2026-08-26/README.md)
Predecessor: [docs-only decision record](LINGUISTPRO_ALL_CORPORA_AGENT_ACCESS_MCP_DECISION_2026_08_26.md)

## Owner outcome

Approve a staged, vendor-neutral, read-only Agent Access projection for **all published public corpora first**. Do not build a Physics-only MCP, do not widen the legacy Ben-Yehuda tools, and do not merge public, group or personal authority.

The first useful product is:

```text
agent authenticates and consents
  -> lists agent-readable published corpora
  -> selects an immutable edition/item
  -> receives bounded text or a hash-pinned resource descriptor
  -> fetches PDF/audio directly from first-party immutable HTTPS when allowed
  -> cites edition/item/revision/hash in its answer
```

This creates no new content writer, forum, learner writer or grading authority.

## Evidence basis

- `CODE`: current MCP is a fail-closed, tools-only, stateless `2025-11-25` adapter. Legacy public tools use numeric Ben-Yehuda IDs and `public-domain` semantics.
- `CODE`: publication editions/items/assets are immutable and hash-pinned, but materialize only public read/stream/package permissions.
- `CODE`: Physics PDF revisions already pin edition/item/work/snapshot and store independent `PUBLIC_READ` / `AGENT_READ` facts.
- `PRODUCTION_ANONYMOUS`: Study Songs edition 2 has 77 items/2,155 assets; Physics edition 2 has 74 items/394 assets.
- `OWNER_REPORTED`: Physics production evidence records 74 exact-byte PDFs and 74 `AGENT_READ=YES` facts.
- `LOCAL_TEST`: publication/resource tests passed 27/27; Agent Access production-handler smoke passed 61 checks with zero table/network/provider deltas.
- `LOCAL_TEST BLOCKER`: current MCP smoke fixture still emits `aa.text_coverage.1.0.0` while runtime requires `2.0.0`; implementation must first restore a green baseline.
- `EXTERNAL_PRIMARY`: MCP `2026-07-28` is a major transport/auth era. Official SDK v2 supports modern plus legacy stateless handling; a string-only version bump is invalid.

## Decision table D1–D12

| ID | Options / failure modes | Recommendation | Approval value |
|---|---|---|---|
| D1 Scope | Physics-only hardcodes a corpus/MIME; old-tool widening changes consent; universal public/private namespace risks IDOR | Common identity; implement only published public domain first | `ALL_PUBLISHED_PUBLIC_CORPORA_FIRST_SEPARATE_AUTHORITY_NAMESPACES` |
| D2 Identity | Slug/display/current-pointer identity drifts | Full corpus/edition/manifest/item/work/snapshot/revision/hash tuple; no silent rebind | `IMMUTABLE_CORPUS_EDITION_ITEM_RESOURCE_HASH_NO_SILENT_REBIND` |
| D3 Surface | Resources-only loses hosted clients; tools-only loses URI value; two stores drift | Typed tools normative; Resources/ResourceLink call the same service | `TYPED_TOOLS_PRIMARY_RESOURCES_ADDITIVE_SINGLE_SERVICE` |
| D4 Rights | Public⇒agent violates current contract; generic table duplicates Physics | Existing Physics facts plus publication-local append-only agent use-class facts; default deny | `EXPLICIT_DOMAIN_LOCAL_AGENT_RIGHTS_NO_PUBLIC_INHERITANCE` |
| D5 Auth/scopes | Anonymous loses consent/revoke/rate; old scopes silently widen | Existing bearer OAuth perimeter, three new scopes, new consent version | `OAUTH_REQUIRED_NEW_PUBLICATION_SCOPES_AND_RECONSENT` |
| D6 Protocol | Legacy-only ages; breaking modern cutover breaks Hermes | Pin SDK v2 dual era: legacy 2025-11-25 plus modern 2026-07-28 under separate flags/tests | `SDK_V2_DUAL_ERA_LEGACY_PRESERVED_MODERN_ADDITIVE` |
| D7 Content | Binary-in-MCP amplifies; OCR can become false truth | Bounded text + exact descriptors; direct HTTPS Range; OCR deferred derivative | `BOUNDED_TEXT_HASHED_DESCRIPTORS_DIRECT_BINARY_OCR_DERIVATIVE_LATER` |
| D8 Clients | One client is not interoperability | Hermes + OpenAI Responses + Inspector required; Claude before wider launch | `HERMES_OPENAI_INSPECTOR_REQUIRED_CLAUDE_WIDER_GATE` |
| D9 Search | Corpus dump leaks/amplifies; offset shifts on edition change | Max-50 bounded search and HMAC cursor pinned to edition/filter/sort | `EDITION_PINNED_CURSOR_BOUNDED_DISCOVERY` |
| D10 Security/privacy | Prompt injection, SSRF, logs, scraping and cache leaks | Closed read tools, no fetch/write/sampling, canonical URLs, content-free audit, live epochs | `CLOSED_READ_TOOLS_NO_FETCH_CONTENT_FREE_AUDIT_LIVE_REVOCATION` |
| D11 Scale/cost | Distributed upfront is waste; unbounded host is dishonest | SQLite/single writer/cache first; direct assets; measured evolution triggers | `SQLITE_SINGLE_PROCESS_MEASURED_EVOLUTION_DIRECT_ASSET_CACHE` |
| D12 Release | Current smoke is red; big cutover combines rights/SDK/client risk | Baseline repair → temp DB → isolated clients → owner-only → bounded → wider | `RED_TEST_FIRST_DEFAULT_OFF_EVIDENCE_GATED_ROLLOUT` |

## Role synthesis R1–R17

| Roles | Decision contribution |
|---|---|
| R1/R2/R7/R8 | Preserve Hebrew/translation/source fidelity, edition context and learning usefulness; access never proves comprehension |
| R3/R9 | Immutable linked identity and `derived != asserted`; OCR, owner right and agent inference stay separate |
| R4/R5/R6 | Value is reliable discovery and exact source return; consent UI is RU/EN/HE, RTL/mobile accessible |
| R10/R11 | No invented OCR/formula truth; hashes and independent regression oracles precede convenience |
| R12/R13 | Thin adapter, one writer, additive migration, temporary-DB rehearsal and restore proof |
| R14/R15 | Namespace isolation, least privilege, consent/revoke, content-free audit and provider-boundary disclosure |
| R16 | No server LLM spend; bounded calls/bytes and explicit egress/cost triggers |
| R17 | Agent may retrieve/explain but cannot grade, certify or write learner truth |

## Data and migration decision

Migration is required if D4/D5 are approved; `NONE` is not honest.

1. Rebuild the current scope-constrained Agent Access table through the established SQLite pattern to add:
   - `reading.publication.catalog.read`
   - `reading.publication.item.read`
   - `reading.publication.resource.read`
2. Add publication-domain append-only agent-right facts pinned to immutable edition targets and use classes `DISCOVER`, `SOURCE_TEXT`, `SOURCE_BINARY`, `DERIVATIVE_TEXT`.
3. Add no content, asset, OCR, learner, group, personal or forum tables.
4. Do not alter immutable edition/item/asset rows or current corpus pointers.
5. Physics continues using migration 064 rights; no duplicate or backfill.

Recommended fact tuple:

```text
fact_id; edition_id;
target_kind=EDITION_ITEM|EDITION_ASSET|PACKAGE;
target_id; use_class; allowed;
basis; asserted_at; asserted_by; created_at
```

Latest exact fact wins; absent is deny. An exact asset fact may override its item-level use class. Revoke appends `allowed=0`; update/delete are forbidden. One publication rights repository owns the writer with idempotency, `BEGIN IMMEDIATE` and read-back.

Study Songs prior rights do not imply agent use. Recommended separately approved values:

```text
DISCOVER=YES
SOURCE_TEXT=YES
SOURCE_BINARY=YES
PACKAGE=NO
DERIVATIVE_TEXT=NO
```

## Smallest useful pilot

- Owner-only and default-off.
- Physics: 9 sections/74 tasks, exact task selection, approved PDF descriptor/URL/hash; no OCR.
- Study Songs: 77-item search, exact item metadata, bounded text rows and audio descriptors only after explicit new rights.
- Five tools: `list_published_public_corpora`, `search_published_public_items`, `get_published_public_item`, `list_published_item_resources`, `read_published_text_window`.
- Existing Ben-Yehuda tools remain unchanged regression fixtures.
- No anonymous MCP, group/personal corpora, package download, external links, write tools, tutoring grades, notifications or content telemetry.

If Study Songs rights are not approved, Physics can be a technical compatibility fixture but cannot close the all-corpora product pilot.

## Implementation-ready boundary

Likely allowlist after approval:

- Agent Access registries/contracts/schemas/handlers/consent/OAuth and MCP adapter;
- new `agent/access/publicPublicationReadService.js`;
- one publication agent-rights repository and one migration after `064`;
- `server.js` only for wiring/flags;
- official SDK package/lock changes;
- Agent Access consent UI and RU/EN/HE locales;
- dedicated unit, migration, smoke, two-client, load and a11y tests;
- implementation/production evidence docs.

Forbidden without later approval:

- learner/review/FSRS/notes/reading-list writers and `review_log`;
- group invite/membership/corpus schemas and personal text/grant semantics;
- publication edition/item/asset mutation or pointer change;
- Physics PDF/revision/right changes;
- OCR/LLM/provider/object storage/external fetch/package exposure;
- forum/solution/comment/attachment domains;
- production config/flags/deploy before rollout gates.

## Red-test-first gates

1. Repair the stale coverage fixtures and prove all existing MCP tools/scopes/schemas unchanged.
2. Public yes + agent absent/deny returns no content; revoke closes cached access within 60 seconds.
3. Wrong edition/item/work/snapshot/revision/hash relation returns no descriptor.
4. New edition never rebinds an old cursor/URI.
5. Private/group/personal IDs and existence never appear.
6. Scope A cannot call B/C; arbitrary URL/path/query fields are rejected.
7. Binary/base64 never appears; text rows/bytes are bounded.
8. Prompt-like content stays data and cannot invoke a write/fetch.
9. Audit sentinel scan finds no title/query/body/URL/token/user ID.
10. Retry/concurrency creates no content/owner/learner rows.
11. Legacy Hermes and modern Inspector pass OAuth/discovery/call/error/revoke; OpenAI passes tool compatibility.
12. Migration up/read/revoke/down/restore preserves counts/hashes and `integrity_check=ok`.
13. Consent RU/EN/HE, HE RTL, keyboard/focus, 380 px, 200% reflow and screen-reader names pass.

## Rollout and thresholds

Stages: green baseline → local closed contracts → temporary DB → isolated dual-era transport → owner-only production → hosted clients → bounded pilot → wider availability.

GO after owner pilot:

- at least 20 successful real tasks across both corpus shapes and at least 80% correct immutable source selection;
- zero cross-authority, wrong-edition, unbounded-output, content-log or write events;
- tool p95 <400 ms, non-denial error <1%, revoke ≤60 seconds;
- at least 70% of known-item jobs complete in ≤5 calls;
- owner confirms value beyond manually pasting a URL;
- incremental cost ≤USD 25/month and ≤5% current host capacity.

NO_GO/flags-off on any rights/cache/security leak, wrong-task binding, legacy regression, ambiguous Study Songs rights, >20% client/schema failures or a repeated p95/cost breach.

SQLite evolution triggers are measured: read p95 >50 ms, event-loop lag >100 ms, CPU >70%, lock errors >0.1%, sustained >10 authenticated RPS, burst >50 RPS failing SLO, disk >80%, search >10k items or search p95 >100 ms. Binary egress is reviewed at 100 GiB/month and 1 TiB/month bands. No queue/search service/distributed DB is justified by the current 151 items.

Rollback: flags off, stop rights writer, preserve append-only rows and legacy tools, leave browser corpora/pointers/files unchanged, redeploy prior SDK/app version if needed, and use only rehearsed migration down/restore.

## Exact approval line

```text
APPROVE ALL-CORPORA-AGENT-ACCESS-MCP-R:
D1=ALL_PUBLISHED_PUBLIC_CORPORA_FIRST_SEPARATE_AUTHORITY_NAMESPACES;
D2=IMMUTABLE_CORPUS_EDITION_ITEM_RESOURCE_HASH_NO_SILENT_REBIND;
D3=TYPED_TOOLS_PRIMARY_RESOURCES_ADDITIVE_SINGLE_SERVICE;
D4=EXPLICIT_DOMAIN_LOCAL_AGENT_RIGHTS_NO_PUBLIC_INHERITANCE;
D5=OAUTH_REQUIRED_NEW_PUBLICATION_SCOPES_AND_RECONSENT;
D6=SDK_V2_DUAL_ERA_LEGACY_PRESERVED_MODERN_ADDITIVE;
D7=BOUNDED_TEXT_HASHED_DESCRIPTORS_DIRECT_BINARY_OCR_DERIVATIVE_LATER;
D8=HERMES_OPENAI_INSPECTOR_REQUIRED_CLAUDE_WIDER_GATE;
D9=EDITION_PINNED_CURSOR_BOUNDED_DISCOVERY;
D10=CLOSED_READ_TOOLS_NO_FETCH_CONTENT_FREE_AUDIT_LIVE_REVOCATION;
D11=SQLITE_SINGLE_PROCESS_MEASURED_EVOLUTION_DIRECT_ASSET_CACHE;
D12=RED_TEST_FIRST_DEFAULT_OFF_EVIDENCE_GATED_ROLLOUT;
MIGRATION=ADDITIVE_SCOPES_AND_PUBLICATION_AGENT_RIGHTS_REHEARSAL_FIRST;
PILOT_SCOPE=OWNER_ONLY_PHYSICS_AND_STUDY_SONGS_READ_ONLY;
STUDY_SONGS_AGENT_RIGHTS=DISCOVER_YES_SOURCE_TEXT_YES_SOURCE_BINARY_YES_PACKAGE_NO_DERIVATIVE_NO;
PHYSICS_AGENT_RIGHTS=USE_EXISTING_74_FACTS_NO_RIGHTS_WRITE;
PROTOCOL=SDK_V2_DUAL_ERA_2025_11_25_AND_2026_07_28;
BINARY_IN_MCP=NO;
OCR=DEFERRED_VERSIONED_DERIVATIVE;
ROLLBACK=FLAGS_OFF_STOP_RIGHTS_WRITER_PRESERVE_ROWS_OLD_TOOLS_AND_PUBLIC_CORPORA_UNCHANGED;
```

## Research stop confirmation

```text
CODE=NONE
MIGRATION=NONE_EXECUTED
OWNER_DATA_WRITES=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
```

Stop here and await owner decision.
