# LinguistPro Agent Access AA2-C4A discovery compatibility repair and autonomous revalidation packet

**Date:** 2026-07-17

**Packet status:** `OWNER_APPROVAL_REQUIRED / DEFAULT_OFF_REPAIR_THEN_INSPECTOR_REVALIDATION / HERMES_CONFIGURATION_BOUNDARY`

**Engineering/deployment baseline:** production and `origin/main` revision `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3`, package `3.11.197`, reviewed handler revision `57527403893b8291a1648d989eead743a349cb96`.

**Historical failure evidence:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_EVIDENCE_2026_07_17.md`.

**Durable terminal-goal prompt:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_NEXT_SESSION_PROMPT_2026_07_17.md`.

**Target terminal status:**

```text
INSPECTOR_DISCOVERY_COMPATIBILITY_REPAIRED /
DEFAULT_OFF_DEPLOYMENT_VERIFIED /
C4A_INSPECTOR_OWNER_WINDOW_PASS /
INSPECTOR_REVOKED_DELETED_SUSPENDED /
OWNER_ALLOWLIST_REMOVED /
CLIENTS_GATE_OFF /
MCP_GATE_OFF /
ZERO_LIVE_AUTHORITY /
HERMES_CONFIGURATION_PACKET_READY /
HERMES_UNTOUCHED
```

This packet turns the next approved run into one continuous terminal goal. Within its exact allowlists, the agent must continue autonomously through recon, repair, synthetic validation, regression repair, package bump, scoped commit, exact production deployment, default-off verification, one bounded Inspector live window, flag-first cleanup, observation and Hermes-packet preparation. It must not pause merely because an internal phase completed. It must stop before any Hermes installation, configuration, activation, authorization, token, MCP call or live connection.

## 1. Decision and root cause

The first C4A window stopped before consent, token issuance, MCP initialization or handler dispatch. Inspector `0.22.0` constructed protected-resource metadata discovery from the configured MCP endpoint `/agent-access/mcp`. Production exposed only:

```text
/.well-known/oauth-protected-resource/agent-access
```

The MCP `2025-11-25` authorization specification defines path-aware fallback discovery: an MCP endpoint at `/agent-access/mcp` may publish its protected-resource metadata at:

```text
/.well-known/oauth-protected-resource/agent-access/mcp
```

The selected repair is one exact compatibility alias at that path, returning the byte-equivalent existing protected-resource metadata document. The canonical resource remains exactly `https://linguistpro.kolosei.com/agent-access`; the authorization server, endpoints, five scopes, public client records, bearer challenge and MCP transport path remain unchanged.

This is an API-route compatibility change, not a new OAuth resource, schema, scope, capability or authority. DCR, CIMD, registration, alternate MCP transport paths and per-client metadata are still prohibited.

## 2. Frozen compatibility contract

| Item | Exact value/decision |
|---|---|
| Protocol | `2025-11-25` |
| MCP SDK | `@modelcontextprotocol/sdk@1.29.0` exact; lock integrity unchanged |
| Inspector | `@modelcontextprotocol/inspector@0.22.0` exact |
| MCP transport | `/agent-access/mcp` unchanged |
| Canonical OAuth resource | `https://linguistpro.kolosei.com/agent-access` unchanged |
| Canonical PRM URL | `/.well-known/oauth-protected-resource/agent-access` unchanged |
| Compatibility PRM alias | `/.well-known/oauth-protected-resource/agent-access/mcp` |
| Alias response | identical existing closed metadata document |
| Package target | `3.11.198` |
| Production gates after deploy | clients `0`; MCP absent/exact `0`; owner allowlist absent |
| Client state after deploy | Inspector and Hermes `SUSPENDED` |

The alias must use the existing OAuth discovery boundary, host/proxy validation, rate class, runtime readiness and content-safe error behavior. It must not bypass a gate or mount a second metadata implementation.

## 3. Exact engineering allowlist

Tracked implementation changes are permitted only in:

- `agent/access/oauthDefaultOffGate.js`;
- `server.js`;
- `scripts/premium/agent-access-oauth-deployment-smoke.mjs`;
- `scripts/premium/agent-access-two-client-smoke.mjs` only if needed to exercise Inspector's real path-derived discovery;
- `package.json` and `package-lock.json` for exact `3.11.197 -> 3.11.198` parity only;
- this packet, its durable prompt, the AA2-C parent status document, the historical C4A packet status pointer;
- new content-safe repair/deployment/C4A evidence and the later C4B/Hermes configuration approval packet and prompt.

No dependency graph, migration, database schema, OAuth/MCP schema, scope, handler, UI, consent prose, client fixture, provider module, public corpus or production runbook change is permitted. If a green result requires any other tracked file, stop with the failing gate, root cause and exact additional file.

## 4. Mandatory preflight

Before mutation, report content-safely:

1. exact HEAD/branch, local and origin `main`, production revision and package;
2. clean/dirty state and every unrelated owner file excluded from staging;
3. that `e77241a` / `3.11.197` is the exact expected baseline;
4. every Agent Access change after that baseline and whether it is docs-only;
5. exact SDK/protocol/Inspector pins and package-lock integrity;
6. the historical C4A failure and complete rollback state;
7. current canonical PRM route, missing path-scoped alias, MCP path and bearer challenge;
8. exact planned files and tests;
9. production pre-state: health, revision/package, clients/MCP gates off, owner allowlist absent, both clients suspended and zero live authority;
10. backup/prior-image/rollback readiness and all discrepancies.

Do not read the private production runbook until the exact approval in §13 has been supplied and local engineering gates have passed. Never read F1/F2/private learner bodies for fixtures or evidence.

Create a separate engineering branch from exact `origin/main`, preserving unrelated owner changes without broad checkout, reset or clean. If safe branch creation cannot preserve them, leave the verified local commit without production push and stop.

## 5. Synthetic repair gates

Implement the thinnest alias and prove:

- canonical and compatibility PRM paths both return `200` and deep-equal metadata;
- the returned `resource` is still the canonical `/agent-access` URI;
- no new field, scope, authorization server or endpoint appears;
- malformed suffixes, query variants, wrong method/host/origin/proxy and unknown paths fail closed;
- OAuth clients off still blocks lifecycle routes; MCP off still blocks `/agent-access/mcp` before bearer/runtime/owner parsing;
- Inspector `0.22.0`, configured only with the exact MCP transport URL and reviewed static public client ID, discovers the approved authorization endpoint without DCR/CIMD, root `/authorize` fallback, secret or custom bearer header;
- the synthetic flow reaches consent, token, `initialize`, `tools/list` and the five tools using only synthetic principals/data;
- Hermes `0.18.2` loopback regression remains green but no production Hermes configuration is read or changed;
- zero provider/LLM/BYOK/network calls occur except isolated loopback traffic required by the two-client test;
- no token, code, cookie, header, owner ID or private payload appears in stdout.

Run at minimum:

```text
npm run smoke:agent-access:oauth-deployment
npm run smoke:agent-access:mcp
npm run smoke:agent-access:two-client
npm run smoke:agent-access:production-handlers
npm run smoke:agent-access:oauth
npm run smoke:agent-access:oidc-loopback
npm run smoke:agent-access
```

Also run every adjacent Agent Access consent, boundary, API, deployment and restore command found in the current `package.json`. A failing gate triggers the autonomous repair loop: minimize, find root cause, repair only inside the allowlist, rerun focused and affected regressions. Do not weaken tests, add fixture-only production behavior, catch-and-empty, relax schemas or suppress unknown errors.

Only after all gates are green, bump to `3.11.198`, prove dependency graph and lock integrity unchanged, run `git diff --check`, scan the scoped diff for sensitive patterns, stage only the exact allowlist and create one scoped engineering commit.

## 6. Exact production deployment phase

The §13 approval authorizes an exact fast-forward push of the newly created scoped engineering commit to `main` only when:

- it descends directly from exact `e77241a`;
- its diff contains only §3 files;
- all §5 gates are green after the package bump;
- the commit hash and tree are printed content-safely before push;
- `origin/main` has not moved;
- normal main push is the only deployment trigger and no manual production mutation is required to deploy code.

Take one fresh verified backup, then push exactly that commit to `main` and observe the normal production auto-deploy. No merge commit, force push, rebase, unrelated docs follow-up or second code push is allowed.

Before opening any OAuth/MCP window prove the new exact revision/package, `/healthz=200`, both clients `SUSPENDED`, clients gate `0`, MCP absent/exact `0`, owner allowlist absent, lifecycle live-authority counts unchanged, canonical PRM `200`, compatibility PRM `200` and deep-equal public metadata. Observe default-off state for 15 minutes. Any drift or delta triggers prior-image/flag-first rollback and stops the live phase.

Production evidence/status docs created after main deploy must be committed only to a separate non-deploy branch. They must not be pushed to `main` in this session.

## 7. Autonomous C4A Inspector revalidation

After successful default-off observation, continue without requesting another intermediate approval because §13 preauthorizes this exact window:

1. confirm the exact-one owner ID is available through the already approved local private input seam; never derive it from email, session, DB ordering or client ID and never print it;
2. take a fresh content-safe lifecycle count snapshot;
3. activate only `linguistpro-mcp-inspector-v0`; Hermes remains `SUSPENDED` and unconfigured;
4. configure exact-one `AGENT_ACCESS_OWNER_IDS` and MCP gate `1` while clients gate remains `0`; redeploy the same revision and prove lifecycle routes still closed;
5. set clients gate to exact `1`, redeploy the same revision and prove exact pre-flow zero;
6. launch isolated Inspector `0.22.0` with no custom bearer header, the exact static public client ID, exact MCP URL and exactly the five reviewed scopes;
7. use an existing authenticated first-party browser session when safely available; pause only for the owner's bounded login/consent gesture if the first-party UI requires human authentication or consent that cannot lawfully be automated;
8. perform one authorization/consent, one `initialize`, one `tools/list`, exactly one call to each of the five allowlisted tools from the historical C4A packet, one refresh rotation without reuse and one revoke;
9. validate results only in memory as schema/status/bytes/cardinality/booleans; never emit learner values, IDs, titles, authors, constructs or connection identifiers;
10. close clients gate first and redeploy before any cleanup;
11. prove OAuth/MCP fail closed, suspend Inspector, revoke/delete its connection, clear/destroy its isolated token store/profile;
12. remove the owner allowlist, disable/remove MCP, retain clients `0`, redeploy the same revision;
13. prove zero live authority and stable health for 15 minutes;
14. write content-safe evidence and continue to §8. Do not enter Hermes.

Expected non-authoritative residue remains the historical C4A §11 contract: opaque subject mapping, consent history, erasure tombstone, bounded denial and audit metadata may remain. They grant no live authority and must not be deleted merely to make physical counts zero.

## 8. Hermes-boundary deliverable

Only after C4A passes and cleanup completes, prepare a separate AA2-C4B Hermes configuration approval packet and paste-ready prompt. It must bind the exact deployed revision/package and evidence commit, revalidate pinned Hermes `0.18.2`, static public client/no-DCR behavior, protected local token storage, minimal scopes, owner-only isolation, bounded calls, flag sequence, revoke/delete/residue and rollback.

The C4B packet is planning authority only. In this terminal goal do not open Hermes configuration, inspect its token store/profile, activate its production row, set a Hermes endpoint/client ID, start authorization, call MCP or create a Hermes connection. Stop immediately after the packet/prompt are committed and pushed to the same non-deploy evidence branch.

## 9. Content-safe proof

Evidence may contain revisions, package, public route classes and client IDs, versions, status codes, booleans, byte/cardinality counts, aggregate lifecycle counts, test commands and commit hashes. It must not contain owner/user/subject/connection/grant IDs, tokens/codes/cookies/PKCE/state/CSRF, Authorization/full headers, private paths/coordinates, learner values, titles/authors, explanation/construct IDs, provider prompts or F1/F2 content.

Required explicit proofs:

- both PRM paths return one identical closed document and bind the same canonical resource;
- Inspector discovery no longer falls back to `/authorize` and makes exact zero DCR/CIMD/registration calls;
- five handler calls pass schema/TTL/byte/cardinality checks with zero body/source/model leakage;
- exact owner/user/client/connection isolation holds;
- canonical learner writes, provider/LLM/BYOK calls and background polling are zero;
- after cleanup, active clients, live connections/grants/codes/families/refresh tokens and usable access tokens are exact zero;
- Hermes was not configured, contacted or activated.

## 10. Immediate stop conditions

Stop without workaround on baseline/package/pin drift; unknown overlapping Agent Access code; need for a file outside §3; dependency/schema/scope/resource/client change; inability to make alias metadata identical; Inspector fallback or DCR; sensitive stdout/evidence; missing exact-one private owner input; private learner body/source or F1/F2 need; canonical write/provider call; cross-user/client/connection failure; production health/lifecycle delta; inability to revoke/delete/disable; Hermes contact; or any need for a second main code push.

Do not create a DCR/CIMD/registration endpoint, client secret, shared bearer, token passthrough, alternate resource, per-client route, fallback handler or synthetic production result.

## 11. Rollback

Before live authority exists, restore the prior approved image/config if deployment health, route parity or lifecycle invariants fail. After any live gate opens, rollback is flag-first:

```text
AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0
-> redeploy same/prior approved revision and prove OAuth/MCP closed
-> suspend Inspector; Hermes remains SUSPENDED
-> revoke/delete Inspector connection and credentials
-> destroy isolated Inspector token residue
-> AGENT_ACCESS_MCP_ENABLED=0/absent
-> remove AGENT_ACCESS_OWNER_IDS
-> redeploy and prove zero live authority for 15 minutes
```

Restore the backup only for DB integrity damage. Preserve deliberate audit/consent/erasure residue.

## 12. R1-R17 record

- **R2/R5:** Inspector interoperability is not learning value, Hermes integration, readiness or launch evidence.
- **R9/R12:** external memory and MCP business-logic authority remain absent; the alias and handlers are thin projections with no dual-write.
- **R11/R17:** external prose, evaluator, grade and evidence authority remain absent.
- **R14:** exact owner/user/client/connection/resource isolation is mandatory at every call and cleanup transition.
- **R15:** outputs/evidence are metadata-minimized; deliberate subject/consent/audit/erasure residue is reported honestly, not erased ad hoc.
- **R16:** polling and provider/managed-LLM/BYOK cost remain zero.
- **R1/R3/R4/R6/R7/R8/R10/R13:** deterministic authority, public-metadata honesty, bounded consent UX, independent verification, rollback and do-no-harm remain primary.

## 13. Exact owner approval required

After this packet is committed and pushed on a non-deploy branch, replace the placeholder and send the following approval as one message:

> Утверждаю AA2-C4A discovery compatibility repair and autonomous revalidation packet для exact packet commit `<EXACT_PACKET_COMMIT>`, baseline/production revision `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3`, package `3.11.197`, target package `3.11.198`. Разрешаю один непрерывный terminal-goal по packet §§3-11: read-only repo/production preflight; allowlisted local route-alias engineering; synthetic Inspector `0.22.0` и соседние regressions; in-allowlist autonomous repair; package bump; scoped engineering commit; один fresh backup; exact fast-forward push созданного commit в `main` и normal production auto-deploy только если commit прямо наследует exact baseline, origin/main не сдвинулся, diff exact allowlist и gates green; content-safe default-off production validation и 15-minute zero-lifecycle-delta observation; затем одну bounded C4A owner-only Inspector window по §7 с уже переданным локально opaque owner ID, exact-one owner allowlist, активацией только Inspector, exact gates, одной authorization/consent ceremony, одним initialize/tools-list, пятью allowlisted read-only calls, одним refresh rotation без reuse, revoke/delete, flag-first rollback, удалением allowlist, очисткой isolated profile и 15-minute zero-live-authority observation; content-safe evidence/status/C4B packet docs commit/push только в отдельную non-deploy ветку. Разрешаю private runbook только после local green и только для minimal production coordinates. Если first-party login/consent невозможно законно завершить автоматически, разрешаю один bounded pause только для моего browser gesture, после чего агент продолжает сам. Не разрешаю второй code push в main, evidence push в main, force/merge/rebase, иной code/docs diff, migration/schema/scope/resource/dependency/client change, production secret disclosure, private learner/F1/F2 body reads, canonical writes, provider/LLM/BYOK calls, DCR/CIMD/registration, client secret/shared bearer/token passthrough, Hermes configuration/contact/activation/authorization/MCP/live connection, AA2-C4B execution, CP0 live или product/learning/Hermes-readiness claims. При stop condition разрешаю только packet rollback; после подготовки и non-deploy push C4B packet остановись.

The approval must name the exact final packet commit. The opaque owner ID must remain outside chat, git, stdout and evidence. A short approval without the commit and bounded production wording is insufficient.

## 14. Public source and authority map

- [MCP authorization specification `2025-11-25`](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), including path-scoped protected-resource metadata fallback;
- local Inspector `0.22.0` pinned source used in the failed-window root-cause analysis;
- `agent/access/oauthDefaultOffGate.js`, `agent/access/oauthDeploymentContracts.js`, `agent/access/mcpAdapter.js` and `server.js` as current route/resource authority;
- the historical C4A packet/evidence and C4-PRE engineering/deployment evidence as production-state authority.

Code, package lock, deployed artifacts and direct gate results outrank planning prose on any discrepancy.
