# LinguistPro All-Corpora Agent Access MCP — decision record

Date: 2026-08-26
Decision: `DOCUMENT_ONLY_NOW`
Implementation: `DEFERRED_PENDING_ALL_CORPORA_APPROVAL`
Scope: `ALL_CORPORA_TYPED_PUBLICATION_ACCESS`
Physics-only MCP extension: `NO`
Source commit inspected: `2c4360348e07ac1637f119c620f5edb935108f22`
Branch: `main`; source commit matched locally known `origin/main` before this documentation change
Dirty tree: `YES`; unrelated owner changes were present and were not edited or staged
Production basis: LinguistPro `3.11.440`; Physics owner acceptance and production backup follow-up recorded 2026-08-26
Evidence: `CODE`, predecessor `LOCAL_TEST` / `OWNER_LIVE`, `PRODUCTION_READ_ONLY`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`, `INFERENCE`

## 1. Owner question and decision

The owner asked whether to implement MCP now as a Physics follow-up or keep it in documentation and design it as a wider typed capability for every corpus.

**Recommendation and recorded decision:** do not add a Physics-specific MCP tool now. Preserve the already useful public Physics PDFs and document a separate all-corpora Agent Access program. Implementation starts only after a dedicated owner decision packet approves the generic identity, rights, resource, protocol-version, output-budget and compatibility contracts.

This is not a rejection of agent access. It prevents a convenient one-corpus shortcut from becoming the permanent public-corpus API.

## 2. Confirmed current state

### 2.1 Existing Agent Access is real, mature and reusable

`CODE`:

- `server.js:1796,1981` mounts `/agent-access/mcp` behind the existing default-off runtime boundary.
- `agent/access/mcpAdapter.js:12-14,50,64,78-95` pins MCP protocol `2025-11-25`, limits request bodies to 16 KiB, advertises tools only, and requires UI/OAuth/client/MCP flags.
- `agent/access/mcpResourceValidator.mjs:33-61` validates issuer and exact audience, client and owner allowlists, token denial, connection state, security epoch and subject epoch.
- `agent/access/oauthAudit.js:21-46` stores an allowlisted, content-free security audit projection.
- `agent/access/capabilities.js` and `agent/access/mcpRateLimiter.js` supply closed capability and rate boundaries.

Predecessor `OWNER_LIVE`: Hermes completed OAuth, discovery, tool calls, refresh rotation and reconnect against production. This proves the security perimeter and MCP transport can be reused; it does not prove a generic publication-resource contract.

### 2.2 Existing public-reading MCP semantics are not all-corpora semantics

`CODE`:

- `agent/access/capabilities.js:8,18` exposes `search_public_reading_catalog` and `get_reading_content` under `reading.public.search` and `reading.corpus.read`.
- `agent/access/productionHandlers.js:229-238` resolves `get_reading_content` through legacy `corpusRepo.listWorkTexts()` and hard-codes `corpus: "benyehuda"` for the reading window.
- `agent/access/consentCeremony.js:24,31` describes the content as public-domain corpus text and excludes private text; it does not describe immutable public editions or binary task resources.
- Current input/output schemas use numeric legacy `work_id` and baked `text_key`, not `corpus_id + edition_id + public_work_id + snapshot_sha256`.

`INFERENCE`: silently widening these tools to Physics would change their identity, rights and consent meaning while preserving the old names and scopes. That is an incompatible authority expansion.

### 2.3 The publication domain already has the stronger identity

`CODE`:

- `db/publicationRepo.js:591-604,691` reads the active immutable publication edition and works by `corpus_id`, `edition_id`, `public_work_id`, `manifest_sha256` and `snapshot_sha256`.
- `db/physicsTaskResourceRepo.js:130-163,211-253` pins each Physics resource revision to the exact publication edition item and snapshot hash, stores independent `PUBLIC_READ` and `AGENT_READ` facts, and can filter reads with `agent: true`.
- The public Physics projection currently serves approved metadata and immutable range-capable PDFs, but it is a Physics-specific adapter and is not registered in MCP.

`INFERENCE`: the correct next seam is a generic read-only publication adapter over existing canonical domains. A new shared storage table is not yet proven necessary.

## 3. Options

| Option | Value | Main failure | Decision |
|---|---|---|---|
| A. Add Physics-only `get_physics_pdf` now | Fastest demo | Bakes one corpus, one MIME and one schema into Agent Access; bypasses generic publication identity | `REJECT` |
| B. Silently widen current Ben-Yehuda tools | Few new tool names | Changes scope/consent semantics and accepts the wrong IDs | `REJECT` |
| C. Implement the entire generic layer now | Reaches target sooner | Protocol, resource shape, rights mapping and compatibility gates are not yet owner-approved | `DEFER` |
| D. Document all-corpora contract now; implement as a separate gated program | Preserves current value and yields one durable API | Delays native discovery until the packet is approved | `RECOMMEND` |

## 4. Target product contract for the future packet

The future program should be corpus-neutral. Physics is the first binary-resource fixture, not a special authority model.

### 4.1 Stable identity

Every returned work or resource descriptor must carry:

```text
corpus_slug
corpus_id
edition_id
edition_number
edition_manifest_sha256
public_work_id
work_snapshot_sha256
resource_id (when present)
resource_revision_id (when present)
resource_sha256 / bytes / mime (when present)
```

No client may address an immutable public work only by display number, title, DOM anchor or legacy numeric `work_id`. A new edition must not silently rebind an old agent citation.

### 4.2 Tools versus Resources

The [official MCP TypeScript SDK server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) describes Resources as application-controlled read-only data and Tools as model-invoked actions. The [official Resources guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/resources.md) supports fixed resources and dynamic `ResourceTemplate` URI patterns.

Recommended split:

- tools: bounded search, filtering, task/work discovery and selection;
- resource descriptors or resource links: immutable public work snapshots and approved files;
- direct immutable HTTPS: large PDF/audio/archive transfer with Range, ETag and cache controls;
- never inline a multi-megabyte PDF as base64 in a normal tool response;
- no remote preview fetch, OCR provider call or server-side agent action merely to list a resource.

Candidate additive surface, subject to the future packet:

```text
search_public_corpora
list_public_corpus_works
get_public_work_descriptor
list_public_work_resources
read_public_text_window          # only where a bounded text projection exists
linguistpro://public-corpora/{corpus}/editions/{edition}/works/{work}
```

Exact names are not approved here. Existing Ben-Yehuda tools remain compatible until an explicit versioning/deprecation decision.

### 4.3 Canonical writers and projections

| Fact | Canonical writer | MCP behavior |
|---|---|---|
| corpus and immutable edition | publication domain | read projection only |
| public work snapshot | publication domain | read projection only |
| Physics PDF revision | Physics task-resource domain | read projection only; require current valid task pin |
| public/agent rights | domain-specific rights facts | require the relevant effective permission; never infer from owner role |
| OCR text | future derivative pipeline | separate versioned derivative with engine/version/confidence/page provenance |
| learner/group/private state | existing respective domain | excluded from public-corpus tools |
| MCP consent, connection and audit | Agent Access | existing writer and security boundary |

An OCR derivative must never overwrite the source PDF or claim canonical task text. It needs source revision hash, extractor identity/version, language, page coordinates, confidence/quality state and replaceable revision semantics.

## 5. Security and rights invariants

- Keep OAuth audience binding, no token passthrough, client/owner allowlists, live epoch/revocation checks, content-free audit and per-tool output/rate limits. These align with the official [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), which requires token audience validation and prohibits token passthrough.
- Public anonymous availability is not itself an MCP authorization decision. An MCP projection of a resource must evaluate its explicit effective `AGENT_READ` fact as well as the immutable task/work binding.
- Private, group and public corpora retain separate scopes and object-level authorization. No public tool may enumerate private/group existence.
- Resource-template inputs need closed normalization and path-containment checks. No client-controlled filesystem path or storage key is accepted.
- Descriptors disclose no owner filesystem path, backup coordinate, internal storage path or signing detail.
- Large files remain bandwidth-bounded through normal HTTP Range/caching/rate controls; tool responses carry metadata and links, not file bytes.
- Agent-side OCR, summarization and solving are user/client responsibilities until a separately approved server-processing and retention model exists.

## 6. Protocol compatibility gate

`CODE`: the current adapter accepts exactly MCP `2025-11-25` and advertises tools only.

`EXTERNAL_PRIMARY`: the current official Streamable HTTP specification dated 2026-07-28 removes the GET stream and protocol sessions and uses one POST per client request: [MCP Streamable HTTP 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx).

`INFERENCE`: before adding Resources or new clients, the implementation packet must choose a supported protocol/version strategy and prove compatibility against the actual owner clients. A speculative in-place protocol bump is not part of this decision.

Required red evidence:

1. legacy Hermes tools remain unchanged;
2. wrong protocol version fails closed with the approved code;
3. wrong audience/client/owner/epoch/revoked token fails before lookup;
4. a resource pinned to another edition/work hash is indistinguishable from absent;
5. `PUBLIC_READ=YES, AGENT_READ=NO` is not returned by MCP;
6. cursor and byte budgets cannot be bypassed;
7. no cookie, learner, group, `review_log` or corpus writer is touched;
8. a large PDF returns a bounded descriptor/link, not embedded bytes;
9. RU/EN/HE metadata and Unicode queries preserve deterministic ordering;
10. current and chosen protocol clients pass initialize, discovery, read and revoke tests.

## 7. Staged implementation boundary (not executed)

### R0 — decision packet and fixtures

- inventory all published corpus shapes: prose/text, Study Songs audio/package and Physics PDF resources;
- approve tool/resource names, schemas, scopes, rights evaluation, cursors and version policy;
- use fixture manifests only; no production registration or data writes.

### R1 — generic read adapter, owner-only/default-off

- add a read-only publication projection behind existing Agent Access flags and an additional capability gate;
- start with catalog/work/resource descriptors and stable links;
- no OCR, no binary-in-MCP, no write tools, no new content storage;
- validate at least Physics plus one text/audio corpus to prevent one-corpus coupling.

### R2 — bounded text projection and client compatibility

- only for works with an authoritative text projection;
- cursor/window and UTF-8 byte caps;
- owner-live with two independent clients or one client plus protocol Inspector;
- content-free aggregate telemetry only.

### R3 — broader allowlist

- only after zero authorization leaks, bounded p95 latency, acceptable bandwidth and revocation proof;
- explicit consent/scope ceremony version bump if users beyond the owner are supported.

### R4 — OCR derivatives (separate approval)

- demand and quality gate first;
- immutable source remains primary;
- derivative lifecycle, correction, export/delete/retention and cost ceilings approved separately.

## 8. GO / NO_GO triggers

Start the all-corpora implementation packet when all are true:

- owner wants at least two corpus classes exposed through the same contract;
- exact tools/resources and compatibility policy are approved;
- current Agent Access security tests are green on HEAD;
- rights mapping is explicit for each exposed artifact class;
- output, request, file-bandwidth and per-client rate budgets are specified;
- owner-only rollback is flags-off with no corpus or learner mutation.

Do not implement if the only demand is “let an agent open one known Physics PDF”. The existing immutable public URL already supports that job without a new permanent MCP API.

Measured expansion triggers:

- generic discovery is needed repeatedly across two or more corpora or agent clients;
- manual URL copying is a material failure in owner workflows;
- agents need stable edition/hash citations rather than page navigation;
- bounded text/resource retrieval demonstrates useful task completion without exposing private state;
- protocol compatibility and operations capacity are proven.

## 9. Decision and exact boundary

```text
DECISION=DOCUMENT_ONLY_NOW
MCP_PHYSICS_ONLY=NO
TARGET=ALL_CORPORA_TYPED_PUBLICATION_ACCESS
CURRENT_AGENT_ACCESS=REUSE_SECURITY_PERIMETER_NOT_LEGACY_PUBLIC_TOOL_SEMANTICS
PUBLIC_CORPUS_WRITER=UNCHANGED
PHYSICS_RESOURCE_WRITER=UNCHANGED
OCR=DEFERRED_SEPARATE_DERIVATIVE
BINARY_IN_MCP=NO
RUNTIME_CODE=NONE
MIGRATION=NONE
PRODUCTION_DATA_WRITES=NONE
```

Future approval must be a separate owner statement; the Physics R2 approval and successful corpus test do not authorize this implementation implicitly.
