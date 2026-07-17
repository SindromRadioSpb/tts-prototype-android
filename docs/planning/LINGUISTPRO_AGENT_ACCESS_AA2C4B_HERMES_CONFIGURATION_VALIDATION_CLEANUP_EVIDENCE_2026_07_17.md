# LinguistPro Agent Access AA2-C4B Hermes configuration, validation and cleanup evidence

**Date:** 2026-07-17

**Status:** `BOUNDED TECHNICAL VALIDATION COMPLETE / CLEANUP COMPLETE / STRICT PACKET PASS NOT CLAIMED`.

**Executed packet:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4B_HERMES_CONFIGURATION_VALIDATION_ROLLBACK_APPROVAL_PACKET_2026_07_17.md` at commit `b66ff1d63b10723dded7c0d776ebe323b21a4350`.

**Production revision/package:** `bc037524d29771e1de7ac24b422df957dc4577b5` / `3.11.198`.

This document is content-safe. It excludes secret values, private production coordinates, owner/user/subject/connection identifiers, authorization material, learner values and private bodies.

## 1. Outcome and claim boundary

The bounded window proved that pinned Hermes `0.18.2` can use LinguistPro's first-party public-client OAuth boundary and complete the exact read-only MCP sequence described below. The temporary connection and all reusable authority were then revoked/deleted, both clients were suspended, both gates were disabled, the owner allowlist was removed and the isolated local runtime/profile was deleted.

This is configuration, transport/protocol, authorization and bounded read-only validation evidence only. It is not evidence of product value, learning value, permanent integration, multi-user readiness, autonomous-agent readiness or general Hermes readiness. C4A remains not-PASS under the exception recorded in the executed packet.

Strict packet PASS is not claimed because the owner explicitly directed two operational exceptions after the approved packet:

- after the first harness attempt timed out before consent, one retry was authorized without the packet's intermediate flag-first redeploy;
- cleanup was compressed to server-side suspend/revoke/delete followed by one combined final safe-state redeploy, rather than two cleanup redeploy transitions.

The successful harness run emitted two browser-open events while exactly one owner consent decision was completed. Therefore exact-one consent is observed, but exact-one authorization-request creation is not claimed.

## 2. Configuration and provenance proof

- package: `hermes-agent==0.18.2`;
- source commit/tag: `9de9c25f620ff7f1ce0fd5457d596052d5159596` / `v2026.7.7.2`;
- locked `uv.lock` SHA-256: `3c713791f30a660463d1b674c2760375b7c702687e1488b094535b0ed1375a61`;
- reviewed `pyproject.toml` SHA-256: `004344ec34d7eba58c0d674403bba71ccd9442751e42c9d4801cd6581b3efdb8`;
- execution used the approved locked `uv` project mechanism and isolated home/environment/profile;
- one MCP entry, five included tools, resources/prompts/parallel calls disabled;
- headers, client secret, shared bearer, token passthrough and alternate server configuration absent;
- bounded harness SHA-256 before staging: `2114a2f9f1641eb58d9d34f1c9a961cde47de6632ca9b7c2a7ecd74d6826bc93`.

The isolated Hermes home, environment, token cache and Edge profile were removed after server-side authority cleanup.

## 3. Transport and protocol proof

- successful MCP protocol: `2025-11-25`;
- successful `initialize`: `1`;
- successful `tools/list`: `1`;
- successful tool calls: `5`;
- extra protocol calls reported by the harness: `0`;
- discovered tools matched the exact five-name allowlist.

No Hermes messaging, cron, memory, terminal, API server, browser-agent loop, provider/model call, DCR/CIMD/registration, client-secret flow or CP0 live operation was used.

## 4. Authorization proof and exception disclosure

- first-party owner login and one consent decision completed in an isolated Edge profile;
- public-client OAuth, exact loopback callback, PKCE S256, exact resource and five-scope boundary were exercised;
- one refresh rotation was observed before the final tool call;
- refresh reuse was not observed;
- Inspector remained suspended and showed no authorized activity;
- authorization material was not written into repository evidence.

During the interactive session, transient callback material was pasted into the conversation by the owner. It was already consumed before cleanup; the connection, token family and refresh authority were subsequently revoked/deleted. Separately exposed long-lived operational credentials/coordinates should be rotated by the owner after this run.

## 5. Bounded read-only validation

Exactly one successful call was made to each allowlisted tool:

1. `get_learning_brief` — schema, byte bound and future TTL checks passed;
2. `get_review_summary` — schema, byte bound and future TTL checks passed;
3. `search_public_reading_catalog` — schema/byte bounds passed; result cardinality was at most one;
4. `get_recent_explanation_metadata` — schema/byte/body-exclusion bounds passed; result cardinality was at most one;
5. `get_agent_connection` — schema/byte bounds, active-state check and five-scope cardinality passed.

No learner values, reading titles/authors/IDs, constructs, sources or private bodies were printed or persisted. Canonical writes and provider/LLM/BYOK calls were zero.

## 6. Cleanup proof

Server-side cleanup established:

- Hermes client `SUSPENDED`;
- Inspector client `SUSPENDED`;
- Hermes connection deleted through reviewed lifecycle operations;
- active authorization codes `0`;
- active token families `0`;
- active refresh tokens `0`;
- no reusable local OAuth token store remained;
- isolated runtime/profile removal completed.

The owner's combined final configuration redeploy established:

- OAuth clients gate `0`;
- MCP gate `0`;
- owner allowlist absent;
- exact production revision present in running-container metadata;
- package `3.11.198`;
- health green, DB ready, migrations ready and `disk_warn=false`.

## 7. Five-minute zero-authority observation

Six content-safe samples were taken from `2026-07-17T20:57:43.125Z` through `2026-07-17T21:03:41.308Z`, a window longer than five minutes. Every sample proved:

- health green and DB ready;
- package `3.11.198` and exact revision metadata present;
- OAuth clients/MCP gates `0/0`;
- owner allowlist absent;
- Hermes and Inspector both `SUSPENDED`;
- authority tuple `0/0/0/0/0/0` for pending/live connections, active grants, active codes, active token families, active refresh tokens and unexpired access-token denials;
- `disk_warn=false` (observed disk use `79%`).

No residual live authority or observation-window drift was detected.

## 8. Remaining unknowns and next boundary

- C4A Inspector live protocol/tool validation remains incomplete and is not reclassified by C4B.
- The owner-directed retry and compressed cleanup mean strict conformance to the originally approved C4B transition/cardinality rules was not proven.
- Permanent Hermes installation, persistent owner connection and normal agent operation were deliberately not tested.
- Any future permanent-agent or readiness slice requires a separately grounded scope, including an efficient runtime control mechanism if redeploy-heavy feature gating is to be replaced.
