# All-Corpora Agent Access MCP — research index

Date: 2026-08-26
Program: `ALL-CORPORA-AGENT-ACCESS-MCP-R`
Mode: `RESEARCH_ONLY`
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`
Branch: `main`; `HEAD == origin/main` at recon
Dirty tree: yes before research; unrelated owner files preserved
Production inspected: anonymous GET only; served version basis `3.11.440` from predecessor live evidence
Evidence vocabulary: `CODE`, `LOCAL_TEST`, `ISOLATED_AUTOMATION`, `PRODUCTION_ANONYMOUS`, `OWNER_LIVE_READ_ONLY`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`, `INFERENCE`

## Outcome

The implementation-ready recommendation is a generic, read-only Agent Access projection for **published public corpora first**, not a Physics-only MCP and not a single endpoint that mixes public, group and personal authority.

The smallest useful pilot exposes typed discovery and bounded reading descriptors for Physics and Study Songs through the existing OAuth/consent/audit perimeter. Typed tools are the compatibility baseline. MCP Resources and `ResourceLink` values are additive views over the same immutable publication identity. PDF/audio bytes remain on first-party immutable HTTPS delivery with hashes and Range support; no binary is embedded in MCP messages and no OCR is canonical truth.

Implementation remains gated. This research created no runtime code, migration, account/content record, production write or deployment.

## Artifacts

- [Current capability and gap inventory](CURRENT_CAPABILITY_AND_GAP_INVENTORY.md)
- [External protocol and client research](EXTERNAL_PROTOCOL_AND_CLIENT_RESEARCH.md)
- [Corpus, resource and rights matrix](CORPUS_RESOURCE_AND_RIGHTS_MATRIX.md)
- [Tool, resource, schema and identity contract](TOOL_RESOURCE_SCHEMA_AND_IDENTITY_CONTRACT.md)
- [Security, privacy, cost and operations](SECURITY_PRIVACY_COST_AND_OPERATIONS.md)
- [Findings](FINDINGS.md)
- [Predecessor docs-only decision record](../../../planning/LINGUISTPRO_ALL_CORPORA_AGENT_ACCESS_MCP_DECISION_2026_08_26.md)
- [Owner research decision packet](../../../planning/LINGUISTPRO_ALL_CORPORA_AGENT_ACCESS_MCP_R_DECISION_PACKET_2026_08_26.md)

## Evidence summary

- `CODE`: current MCP is a fail-closed, tools-only, stateless `2025-11-25` adapter; its legacy public reading tools are Ben-Yehuda-specific.
- `CODE`: publication editions/items/assets are immutable and hash-addressed; generic publication rights materialize only public read/stream/package permissions.
- `CODE`: Physics PDF revisions already have independent `PUBLIC_READ` and `AGENT_READ` append-only facts and exact edition/work/snapshot pins.
- `PRODUCTION_ANONYMOUS` 2026-08-26: two published corpora are visible—Study Songs edition 2 (77 items, 2,155 assets) and Physics edition 2 (74 items, 394 assets). GETs created no account/session state.
- `OWNER_REPORTED` / predecessor production evidence: Physics has 74 exact-byte PDFs, 32 condition+solution and 42 condition-only; all 74 have separately attested `AGENT_READ=YES`.
- `LOCAL_TEST`: publication/resource suites passed 27/27; production-handler smoke passed 61 checks with zero table/network/provider deltas.
- `LOCAL_TEST BLOCKER`: `smoke:agent-access:mcp` fails because its `get_text_coverage` fixture remains `aa.text_coverage.1.0.0` while runtime contracts require `2.0.0`. This is a pre-existing test drift and is not fixed in research-only mode.
- `EXTERNAL_PRIMARY`: MCP `2026-07-28` is a major transport/auth era; the official TypeScript SDK v2 supports a dual-era modern + legacy handler. A breaking in-place protocol bump is rejected.

## Stop line

No implementation may begin until the owner returns the exact approval line in the decision packet. In particular: no SDK upgrade, scope migration, rights facts, new tools/resources, OAuth consent change, flags, client connection, production data or deploy.

```text
CODE=NONE
MIGRATION=NONE_EXECUTED
OWNER_DATA_WRITES=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
```
