# LinguistPro Agent Access AA2-C4B Hermes configuration, validation, rollback and evidence approval packet

**Date:** 2026-07-17

**Status:** `AWAITING_EXACT_OWNER_APPROVAL / NO_HERMES_MUTATION_AUTHORIZED`.

**Production baseline:** revision `bc037524d29771e1de7ac24b422df957dc4577b5`, package `3.11.198`.

**Required companion status:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_OWNER_RETRY_CLEANUP_STATUS_2026_07_17.md` from the same packet commit.

This packet is content-safe. Secret values, private production coordinates, owner/user/subject/connection identifiers, authorization material and learner payloads are excluded.

## 1. Goal, exception and non-goals

Goal: install/run one pinned isolated Hermes reference-client runtime, configure one disabled-then-bounded remote MCP entry for LinguistPro, prove configuration, OAuth transport, exact-one owner authorization, one bounded read-only tool sequence, one refresh rotation, revoke/delete, cleanup and five-minute zero-authority stability.

Owner exception required: C4A cleanup passed, but Inspector live protocol/tool validation did not pass and its 15-minute observation was waived. Approval of this exact packet explicitly accepts that evidence debt for this one Hermes window; it does not reclassify C4A as PASS.

Non-goals: permanent connected-agent enablement; product or learning-value validation; public/multi-user readiness; private learner/F1/F2 body access; writes; provider/model use; registration; CP0 live; Hermes messaging, cron, memory, browser, terminal, API-server or autonomous-agent use.

## 2. Exact Hermes provenance and execution mechanism

- Package: `hermes-agent==0.18.2` from `pyproject.toml`.
- Official source: `https://github.com/NousResearch/hermes-agent.git`.
- Exact source commit: `9de9c25f620ff7f1ce0fd5457d596052d5159596`.
- Exact repository tag at that commit: `v2026.7.7.2`.
- `uv.lock` SHA-256: `3c713791f30a660463d1b674c2760375b7c702687e1488b094535b0ed1375a61`.
- `pyproject.toml` SHA-256: `004344ec34d7eba58c0d674403bba71ccd9442751e42c9d4801cd6581b3efdb8`.
- Local reviewed checkout: `.tmp/agent-access-aa2c2/hermes-0.18.2`; it must be clean and exact before use.

The supported bounded mechanism is the checkout's locked `uv` project path, not the unpinned remote installer: create an isolated temporary `HERMES_HOME` and isolated `UV_PROJECT_ENVIRONMENT`, then run `uv sync --frozen` and `uv run --frozen --project <exact checkout>`. No global package, system Python, provider credential, model configuration or normal owner Hermes home is modified. A version, commit, lock or mechanism mismatch is a stop condition; no substitute version or installer is allowed.

The first Hermes mutation is creation of the isolated C4B runtime/home directories immediately after exact approval and repeated preflight.

## 3. Exact file and mutation allowlists

Tracked repository files allowed after approval:

- new `scripts/premium/agent-access-hermes-live-validation.py`, containing only the content-safe bounded harness described here;
- this packet, its companion C4A status and one new final C4B evidence/status document.

No existing product/runtime, migration, schema, scope, resource, dependency, client fixture, consent, UI or production-runbook file may change.

Local mutations allowed:

- create one isolated temporary Hermes home, locked uv environment, config and OAuth token directory;
- write one MCP entry named `linguistpro_owner_validation` with the exact fields in §5;
- create one isolated Edge profile used only for the first-party ceremony;
- remove those exact temporary directories during cleanup.

Production mutations allowed:

1. add one temporary exact-one owner allowlist and set MCP gate `1` while clients gate stays `0`; redeploy the same exact revision;
2. set only the Hermes client row `ACTIVE`; Inspector remains `SUSPENDED`;
3. set clients gate `1`; redeploy the same exact revision;
4. create at most one Hermes connection through one first-party authorization/consent ceremony;
5. revoke and delete that connection;
6. cleanup flag-first: clients gate `0` and redeploy; suspend Hermes; MCP gate `0`, remove owner allowlist and redeploy.

No production code push, package bump, schema/migration, backup, alternate image or main deployment is authorized. Configuration redeploys must retain exact revision/package. Production client/code/token mutations arise only through the reviewed OAuth lifecycle except the reviewed registry status transition.

## 4. Branch, commit and publication policy

- The approval packet and pre-execution C4A status are committed and pushed only on `aa2-c4a-inspector-approval-packet` (non-deploy).
- The bounded harness and final C4B evidence may be committed later only on that same non-deploy branch.
- No merge, rebase, force push or main push is authorized.
- Before every commit, stage only the exact paths named here, show staged names, run `git diff --cached --check`, scan for secrets/private coordinates and prove root owner dirty files are excluded.

## 5. Exact Hermes configuration

The isolated config contains one enabled server entry and no headers:

```yaml
mcp_servers:
  linguistpro_owner_validation:
    url: "https://linguistpro.kolosei.com/agent-access/mcp"
    auth: oauth
    oauth:
      client_id: "linguistpro-hermes-owner-v0"
      redirect_port: 8765
      scope: "learning.brief.read review.summary.read reading.public.search explanations.metadata.read agent.connection.read"
    enabled: true
    supports_parallel_tool_calls: false
    tools:
      include:
        - get_learning_brief
        - get_review_summary
        - search_public_reading_catalog
        - get_recent_explanation_metadata
        - get_agent_connection
      resources: false
      prompts: false
```

There is no client secret, static/custom bearer, shared token, token passthrough, DCR/CIMD/registration, TLS bypass, resource override, header, sampling, prompt/resource utility, background polling or second server.

## 6. Mandatory preflight and synthetic gates

Before any Hermes mutation prove:

- packet path/commit exactly match owner approval;
- root/engineering status and owner dirty exclusions are unchanged;
- `origin/main`, production revision and package remain exact;
- `/healthz=200`, DB/migrations ready, disk safe, canonical/alias PRM byte-identical;
- clients gate `0`, MCP gate `0`, owner allowlist absent, both clients suspended and authority `0/0/0/0/0/0`;
- exact Hermes commit/tag/version/hashes, clean checkout and uv availability;
- rollback commands and isolated-directory boundaries are ready.

Then run the existing OAuth/MCP/production-handler/two-client/Inspector regressions. The two-client gate must prove Hermes `0.18.2`, Inspector `0.22.0`, five tools, zero DCR/CIMD/registration, exact resource discovery, refresh/revoke isolation and zero external/provider/live-data calls. Any regression failure stops before production activation unless repaired solely in the new harness.

## 7. Activation and authorization invariants

Order is exact: default-off proof -> temporary owner + MCP `1` with clients `0` -> same-revision redeploy/fail-closed proof -> Hermes row active while Inspector stays suspended -> clients `1` -> same-revision redeploy -> fresh zero snapshot -> isolated Hermes login.

The ceremony uses one isolated Edge profile and one callback on exact loopback port `8765`. If lawful first-party login/consent requires a manual gesture, the agent may pause once for that gesture and then continue. One ceremony means one authorization request and one consent decision; no retry, paste-back, alternate callback or second Connect is allowed unless this packet names a deterministic recovery (it does not).

The exact-one owner, user, subject, Hermes client, connection, resource, callback, PKCE S256 and five-scope bindings must hold. Inspector activity must remain zero.

## 8. Bounded protocol and tool cardinality

The harness uses Hermes `MCPServerTask` directly, without any LLM/model/agent loop. Exactly:

- one successful MCP `initialize` using protocol `2025-11-25`;
- one successful `tools/list` performed by Hermes startup; the harness reads Hermes' cached `_tools` and must not issue another list;
- one call to `get_learning_brief` with `{}`;
- one call to `get_review_summary` with `{}`;
- one call to `search_public_reading_catalog` with `{language: "he", audio: "ANY", ready: "ANY", sort: "RELEVANCE", limit: 1}`;
- one call to `get_recent_explanation_metadata` with `{kinds: ["word"], limit: 1}`;
- one call to `get_agent_connection` with `{}`.

Results are inspected only as schema version, status, TTL, byte/cardinality bounds and booleans. Learner values, titles, authors, IDs, constructs, sources and bodies are never printed or written.

Exactly one refresh rotation is triggered through Hermes' configured OAuth provider after forcing only its in-memory access-expiry clock to expired; no token bytes are read into logs or evidence. The old refresh credential is never replayed. Production aggregate state must show one current family/current refresh before revoke and zero current authority after revoke/delete. If a second authorization prompt appears, stop and clean up.

## 9. Cleanup, rollback and observation

After success or any stop condition:

1. clients gate `0`; redeploy the exact revision and prove OAuth/MCP lifecycle routes closed;
2. suspend Hermes; Inspector remains suspended;
3. revoke and delete the Hermes connection and credentials through reviewed lifecycle operations;
4. MCP gate `0`, remove owner allowlist, clients remain `0`; redeploy exact revision;
5. call Hermes' `remove_oauth_tokens` for only `linguistpro_owner_validation`, then remove the validated isolated Hermes home, uv environment and Edge profile;
6. prove no reusable access/refresh authority and aggregate authority `0/0/0/0/0/0`;
7. run a full five-minute observation with samples at start and each minute. Every sample requires health `200`, exact revision/package, flags `0/0`, allowlist absent, both clients suspended and authority zero.

Rollback is flag-first. Restore a backup/image only for demonstrated DB/image integrity damage. The C4A observation waiver does not waive this packet's five-minute C4B observation.

## 10. Evidence and separated claims

Evidence must separately record:

- configuration proof: version/provenance/hashes, isolated paths as booleans, closed config shape and absent secret/header fields;
- transport/protocol proof: exact initialize/list counts, protocol, tool-name set and zero extra traffic;
- authorization proof: one ceremony, exact-one bindings, scope/resource/PKCE invariants, refresh rotation and non-reuse facts;
- bounded read-only validation: five call names/counts plus schema/TTL/byte/cardinality booleans only;
- cleanup proof: revoke/delete, token-store removal, flags/client state and five-minute samples;
- future claims: no product value, learning value, general integration or readiness claim follows from this window.

Final evidence may be committed/pushed only on the non-deploy branch after exact allowlist and secret scans.

## 11. Stop conditions and prohibitions

Stop and complete cleanup on revision/package/ancestry drift; health/DB/disk failure; nonzero baseline authority; wrong client/version/hash/config; unexpected DCR/CIMD/registration; client secret/header/token passthrough; second ceremony; scope/resource/callback drift; Inspector activity; private body need; any canonical write; provider/LLM/BYOK call; CP0 live; extra initialize/list/tool call; refresh reuse; output of sensitive material; or need to change an existing file outside §3.

Always prohibited: force/merge/rebase; main/evidence push to main; migration/schema/scope/resource/dependency/client changes; alternate Hermes version/installer; permanent owner allowlist; private learner/F1/F2 body reads; canonical writes; provider/model/agent-loop use; DCR/CIMD/registration; client secret/shared bearer/token passthrough; CP0 live; Hermes messaging/cron/memory/browser/terminal/API server; and unsupported readiness/product claims.

## 12. Exact owner approval text

> Утверждаю `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4B_HERMES_CONFIGURATION_VALIDATION_ROLLBACK_APPROVAL_PACKET_2026_07_17.md` в exact commit `<EXACT_PACKET_COMMIT>` на non-deploy ветке `aa2-c4a-inspector-approval-packet`, включая exact allowlist §3, Hermes `0.18.2` provenance/locked uv mechanism §2, exact local и production mutations §§3/7, запрет code push/deploy в main, четыре bounded same-revision configuration redeploy transitions, один owner-only Hermes window, exact configuration §5, synthetic/production gates, одну authorization/consent ceremony, один initialize/tools-list, пять exact read-only calls, одну refresh rotation без reuse, revoke/delete, flag-first cleanup и полное five-minute C4B observation. Явно принимаю owner exception: C4A cleanup и immediate zero-authority proof завершены, но Inspector live protocol/tool validation не завершена и C4A 15-minute observation была отменена мной; это не C4A PASS. Разрешаю после проверки совпадения path/commit автономно выполнить весь bounded C4B scope без промежуточных подтверждений, кроме единственного законно необходимого first-party login/consent gesture. Не разрешаю операции из §11 или claims, не доказанные §10.
