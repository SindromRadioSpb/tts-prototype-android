# All-Corpora Agent Access MCP — research index

Date: 2026-08-26
Program: `ALL-CORPORA-AGENT-ACCESS-MCP-R`
Mode: `RESEARCH_ONLY`
Source commit at research: `e51e17ab8e88a378c221a9548a555539b6e18c2a`; production implementation: `33efb4c8d0b8c9d3bd83d433b0d436aae8675db8`
Branch: `main`; `HEAD == origin/main` at production verification
Dirty tree: yes before research; unrelated owner files preserved
Production inspected: anonymous browser plus owner-data read-only DB/service verification; served version `3.11.443`
Evidence vocabulary: `CODE`, `LOCAL_TEST`, `ISOLATED_AUTOMATION`, `PRODUCTION_ANONYMOUS`, `OWNER_LIVE_READ_ONLY`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`, `INFERENCE`

## Outcome

The implementation-ready recommendation is a generic, read-only Agent Access projection for **published public corpora first**, not a Physics-only MCP and not a single endpoint that mixes public, group and personal authority.

The smallest useful pilot exposes typed discovery and bounded reading descriptors for Physics and Study Songs through the existing OAuth/consent/audit perimeter. Typed tools are the compatibility baseline. MCP Resources and `ResourceLink` values are additive views over the same immutable publication identity. PDF/audio bytes remain on first-party immutable HTTPS delivery with hashes and Range support; no binary is embedded in MCP messages and no OCR is canonical truth.

The owner approved D1–D12, implementation and the bounded production rollout on 2026-08-26. Runtime 3.11.443 and migration 065 are live; the approved Study Songs agent-rights plan was applied exactly once. Server/anonymous production verification passed. On 2026-08-27 the owner completed explicit reconsent for all 26 selected scopes, Hermes discovered 30 tools, the five publication tools passed owner-authenticated read-only checks, and a fresh ordinary Hermes chat invoked the publication catalog successfully. The owner then reported the MCP implementation and test successful. `OWNER_REPORTED=PASS`; `OWNER_ONLY_SLICE=CLOSED`.

## Artifacts

- [Current capability and gap inventory](CURRENT_CAPABILITY_AND_GAP_INVENTORY.md)
- [External protocol and client research](EXTERNAL_PROTOCOL_AND_CLIENT_RESEARCH.md)
- [Corpus, resource and rights matrix](CORPUS_RESOURCE_AND_RIGHTS_MATRIX.md)
- [Tool, resource, schema and identity contract](TOOL_RESOURCE_SCHEMA_AND_IDENTITY_CONTRACT.md)
- [Security, privacy, cost and operations](SECURITY_PRIVACY_COST_AND_OPERATIONS.md)
- [Findings](FINDINGS.md)
- [Owner research decision packet](../../../planning/LINGUISTPRO_ALL_CORPORA_AGENT_ACCESS_MCP_R_DECISION_PACKET_2026_08_26.md)
- [Implementation evidence ledger](IMPLEMENTATION_EVIDENCE_2026_08_26.md)

## Evidence summary

- `CODE`: current MCP is a fail-closed, tools-only, stateless `2025-11-25` adapter; its legacy public reading tools are Ben-Yehuda-specific.
- `CODE`: publication editions/items/assets are immutable and hash-addressed; generic publication rights materialize only public read/stream/package permissions.
- `CODE`: Physics PDF revisions already have independent `PUBLIC_READ` and `AGENT_READ` append-only facts and exact edition/work/snapshot pins.
- `PRODUCTION_ANONYMOUS` 2026-08-26: two published corpora are visible—Study Songs edition 2 (77 items, 2,155 assets) and Physics edition 2 (74 items, 394 assets). GETs created no account/session state.
- `OWNER_REPORTED` / predecessor production evidence: Physics has 74 exact-byte PDFs, 32 condition+solution and 42 condition-only; all 74 have separately attested `AGENT_READ=YES`.
- `LOCAL_TEST`: publication/resource suites passed 28/28; production-handler smoke passed 61 checks with zero table/network/provider deltas.
- `LOCAL_TEST`: the stale coverage fixture was corrected before feature work; the MCP smoke now passes 74 checks across 30 tools and both `2025-11-25` and pinned `2026-07-28` eras.
- `EXTERNAL_PRIMARY`: MCP `2026-07-28` is a major transport/auth era; the official TypeScript SDK v2 supports a dual-era modern + legacy handler. A breaking in-place protocol bump is rejected.

## Approved transition and current stop line

The values in the decision packet were owner-approved on 2026-08-26 with the instructions `Формализуй и стартуй` and then to deploy and verify on production. The bounded server rollout and owner-operated Hermes acceptance are complete. Stop before wider/community availability until Inspector/OpenAI interoperability, live revoke within the approved bound, content-free audit inspection and the wider-launch GO thresholds are separately evidenced and approved. Claude interoperability remains a wider-launch gate, not part of the closed owner-only slice.

```text
CODE=PRODUCTION_3.11.443
MIGRATION=065_APPLIED
OWNER_DATA_WRITES=STUDY_SONGS_AGENT_RIGHTS_ONLY_309_FACTS
PRODUCTION_WRITES=MIGRATION_065_AND_APPROVED_RIGHTS_ONLY
DEPLOY=PRODUCTION_3.11.443
OWNER_RECONSENT=PASS_26_SCOPES
HERMES=OWNER_REPORTED_PASS_30_TOOLS
OWNER_ONLY_SLICE=CLOSED
WIDER_AVAILABILITY=NOT_APPROVED
```
