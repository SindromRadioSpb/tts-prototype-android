# LinguistPro Agent Access AA2-C4-PRE default-off production-handler deployment approval packet

**Date:** 2026-07-17

**Packet status:** `DOCS_ONLY_COMPLETE / AWAITING_EXACT_OWNER_EXECUTION_APPROVAL / NO_PRODUCTION_MUTATION`.

**Engineering code revision:** `57527403893b8291a1648d989eead743a349cb96`, package `3.11.197`.

**Current production/main baseline expected at packet preparation:** `854411cd7069c6c0f8e3695cf295fc84e1d268ea`, package `3.11.196`.

**Intended deployment terminal status:**

```text
FIVE_PRODUCTION_HANDLERS_DEPLOYED_DEFAULT_OFF /
TWO_STATIC_CLIENTS_SUSPENDED /
OWNER_ALLOWLIST_UNCONFIGURED /
CLIENTS_GATE_OFF /
MCP_GATE_OFF /
ZERO_LIVE_AUTHORITY /
NO_PRODUCTION_CONNECTION
```

This packet authorizes nothing by itself. In particular it does not authorize a `main` push, production auto-deploy, production runbook access, backup, restart, config/env mutation, owner allowlist configuration, client activation, OAuth/MCP flag enablement, authorization/consent/token/revoke flow, Inspector/Hermes production configuration, MCP request, live connection or C4A/C4B.

## 1. Purpose and exact boundary

AA2-C4-PRE engineering completed five thin read-only handlers and exact-one owner validation on an isolated non-deploy branch. Production still runs the prior revision without those handlers. C4A therefore remains blocked.

The next separable step is deployment of the reviewed code while all external authority remains off. It proves only that the production image can start and serve the existing application/OAuth metadata with the new handler code dormant behind the existing exact gates. It is not production MCP readiness, Inspector evidence, Hermes integration, learning evidence or launch evidence.

The deployment may change only the application revision/package. It must not change database schema, production data, secrets, proxy/DNS, environment variables, client status or any OAuth/MCP lifecycle state.

## 2. Repo-grounded candidate

At packet preparation:

| Gate | State |
|---|---|
| Candidate branch | `aa2-c4pre-production-handlers` |
| Local/remote candidate | exact `57527403893b8291a1648d989eead743a349cb96` |
| Local/origin `main` | exact `854411cd7069c6c0f8e3695cf295fc84e1d268ea` |
| Package transition | `3.11.196 -> 3.11.197` |
| MCP SDK | exact `@modelcontextprotocol/sdk@1.29.0`, existing lock integrity retained |
| Protocol | exact `2025-11-25` |
| Production-handler smoke | PASS, 27 checks, five tools |
| C1 MCP smoke | PASS, 45 checks |
| C2 two-client fixture | PASS, Hermes `0.18.2`, Inspector `0.22.0`, zero DCR/production requests |
| C3 production registry | exactly two reviewed public clients, both `SUSPENDED` at last approved evidence |
| Lifecycle state at C3 close | subject/connection/grant/code/token-family/refresh/denial counts all zero |

The code revision changes only the approved handler/catalog modules, two read-only repository projections, dormant server wiring, focused smoke, package/lock version and tracked Agent Access documentation. It adds no migration, dependency upgrade, API route, UI, OAuth/MCP schema/scope, provider module or public corpus body.

The tracked deployment packet and handoff may be carried by a docs-only descendant of `5752740`. The execution approval must name the exact final commit to be pushed. Any non-doc code delta after `5752740`, any `main` divergence or any ambiguous merge/rebase is a stop condition.

## 3. Expected production pre-state — refresh required

The last approved content-safe evidence records:

```text
OAuth UI/runtime flags       = 1 / 1
OAuth clients gate           = 0
MCP gate                     = absent
static client rows           = 2
client statuses              = SUSPENDED / SUSPENDED
subject mappings             = 0
connections / grants         = 0 / 0
authorization codes          = 0
token families / refresh     = 0 / 0
access-token denials         = 0
production connection        = absent
```

These values are dated evidence, not permission to assume current production state. A separately approved execution session must refresh them content-safely before any mutation. It must report only revisions, package, flag `0/1`/presence, public client metadata/status and aggregate counts—never owner IDs, secrets, tokens, private paths or learner content.

## 4. Exact allowed execution scope after approval

Only a separate owner approval may authorize:

1. read-only repository and production preflight;
2. local rerun of the exact candidate gates;
3. one fresh backup through the approved production mechanism, with path/content suppressed;
4. an exact linear fast-forward of `main` from the verified baseline to the owner-named candidate commit;
5. the resulting normal production auto-deploy and restart;
6. content-safe health/revision/package/default-off validation;
7. a 15-minute zero-lifecycle-delta observation;
8. content-safe evidence and scoped docs reconciliation committed/pushed only on a separate non-deploy branch;
9. flag-first/prior-image rollback if a stop condition fires.

The execution is not authorized to modify code while operating production. If any repair is needed, disable/rollback, return to a non-deploy branch and request a new engineering approval.

## 5. Mandatory preflight before `main` mutation

Report and require exact PASS for:

1. `HEAD`, candidate remote, local `main`, `origin/main`, package and lock parity;
2. candidate contains exact code revision `5752740` and only approved docs afterward;
3. clean staged state and explicit exclusion of all unrelated owner files;
4. no unknown Agent Access commit/diff after the candidate review;
5. production revision/package and `/healthz` readiness;
6. migration 042 present; no new migration in the candidate;
7. OAuth UI/runtime flags exact `1/1`, clients gate exact `0`, MCP gate absent or exact `0`;
8. `AGENT_ACCESS_OWNER_IDS` absent; its value must not be read, derived or configured;
9. exactly two reviewed static public rows, both `SUSPENDED`, with no unexpected client;
10. subject mappings, connections, grants, codes, token families, refresh tokens and denials exact zero;
11. existing metadata/JWKS readiness without reading private key/cookie/audit material;
12. backup, prior-image/revision rollback and auto-deploy monitoring readiness;
13. real `main` push is confirmed as the only intended deployment trigger;
14. all discrepancies and stop conditions.

Do not read `.claude/PROD_OPS_PRIVATE.md` until the owner has approved this production execution. In the approved session, use it locally only for the minimum deploy/rollback coordinates; never reproduce its contents.

## 6. Candidate gates immediately before push

All must pass on the exact owner-named candidate:

```text
npm run smoke:agent-access:production-handlers
npm run smoke:agent-access:mcp
npm run smoke:agent-access:oauth
npm run smoke:agent-access
npm run smoke:agent-access:oidc-loopback
npm run smoke:agent-access:oauth-deployment
node scripts/premium/agent-access-consent-smoke.js
node scripts/premium/agent-access-boundary-smoke.js
npm run smoke:agent-access:two-client
npm run smoke:auth
npm run smoke:cp0
npm run test:api-smoke
node --check server.js
git diff --check
```

The Hermes fixture must use exact release `v2026.7.7.2` / CLI `0.18.2` with its frozen MCP extra. The Inspector fixture must remain exact `0.22.0`. All tests are local/synthetic; no production MCP request, provider/LLM/BYOK call or private learner read is permitted.

If a gate fails, do not weaken it and do not repair on `main`. Determine whether a separately approved non-deploy code change is needed and stop.

## 7. Exact deployment sequence

After every preflight/gate passes and only under the exact execution approval:

1. create and verify one fresh backup without printing its coordinates or content;
2. re-read `origin/main`; require the exact approved baseline and linear ancestry;
3. ensure the owner-named candidate is the exact reviewed commit and contains no unrelated files;
4. push only that exact commit as a fast-forward to `main`; no merge commit, rebase, force-push or history rewrite;
5. allow the normal auto-deploy to build the exact candidate;
6. observe deployment state without changing environment, secrets, proxy, client rows or flags;
7. wait for consecutive healthy `/healthz` responses on the new exact revision/package;
8. run §8 content-safe validation;
9. observe §9 for 15 minutes;
10. record evidence on a separate non-deploy branch and stop. Do not push an evidence-only follow-up to auto-deployed `main`, configure an owner, activate Inspector or begin C4A.

If `main` has moved, the candidate is not a fast-forward, the deploy picks another revision, or a build requires an unapproved repair, stop without a merge/rebase workaround.

## 8. Required post-deploy validation

| Probe | Expected result |
|---|---|
| `/healthz` | `200`, DB/migrations ready, exact deployed revision/package |
| Protected-resource/AS/OIDC metadata and JWKS | existing D8 `200` contract unchanged; public fields only |
| Authorization, token, revoke and interaction client routes | `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` |
| `/agent-access/mcp` without bearer | `404 AGENT_ACCESS_MCP_DISABLED` before owner parsing/runtime/session/audit |
| Static registry | exactly two reviewed clients, both `SUSPENDED`, zero active |
| Owner allowlist | absent/unconfigured; count `0`, no value read |
| Lifecycle tables | subject/connection/grant/code/family/refresh/denial all exact zero |
| First-party management boundary | authenticated owner empty connection state; unauthenticated/cross-origin denied |
| Existing auth/API behavior | green, no regression |
| Provider/LLM/BYOK/network polling | zero new calls from Agent Access handlers |

Do not set `AGENT_ACCESS_MCP_ENABLED=1` merely to prove handlers load. The local production-handler smoke is the approved execution proof; production proves only dormant startup and default-off boundaries.

## 9. Fifteen-minute observation

At minute `0` and bounded checkpoints through minute `15`, record only:

- exact revision/package and health readiness;
- OAuth clients gate `0`, MCP gate absent/exact `0`;
- both clients still `SUSPENDED`;
- exact-zero subject/connection/grant/code/token/denial counts;
- restart/error/disk/memory status as content-safe booleans/counts;
- default-off OAuth client route and MCP route status;
- secret/private-content leak count `0`.

Any delta or instability is a stop condition. This observation is not CP0 live evidence, learning evidence or a client test.

## 10. Evidence contract

Allowed evidence:

- exact before/after revision, branch and package;
- public client IDs, versions and `SUSPENDED` status;
- protocol/SDK versions and public metadata schema/status;
- flag presence and exact `0/1` only;
- route class/status/result code;
- aggregate lifecycle, health, restart and leak counts;
- commands and PASS/FAIL summaries;
- backup success/age/size-nonzero booleans without path;
- deploy commit, non-deploy evidence commit/push, deployment and rollback status.

Forbidden evidence:

- owner ID or allowlist value;
- private key, key material, cookie/audit secret or env dump;
- credential, authorization header, code, token, verifier, state, CSRF or cookie value;
- private production/runbook coordinates or storage paths;
- user/subject/connection/grant/token IDs;
- learner counts/content, explanation/construct IDs, titles/authors or source bodies;
- private payloads, provider prompts or external transcript.

## 11. Immediate stop conditions

Stop without workaround if:

- repository, candidate, `main`, production revision/package or ancestry differs;
- an unknown overlapping Agent Access change exists;
- backup/rollback/deploy identity cannot be proved;
- a secret/private value would enter stdout, evidence or chat;
- any environment, proxy, DNS, secret or DB mutation is required;
- owner allowlist is present, must be configured or its value must be exposed;
- client/MCP gate is `1`, any client is active, or any unexpected client exists;
- any subject, connection, grant, code, token family, refresh token or denial exists;
- metadata/JWKS, client-disabled OAuth behavior or MCP-disabled behavior regresses;
- the handler build cannot start dormant with the gates off;
- any production MCP request, Inspector/Hermes configuration or live connection is needed;
- any canonical write, provider/LLM/BYOK call, polling or private learner read occurs;
- health, auth, API, DB, migration, disk, memory or restart behavior regresses;
- rollback requires destructive git history, schema change or unrelated repair.

## 12. Rollback

The OAuth-client and MCP authority gates are already off and remain off throughout. On a stop condition:

1. confirm OAuth clients gate remains exact `0` and MCP remains absent/exact `0`;
2. stop/cancel the failed deployment if still running;
3. restore the known prior application image/revision through the approved deployment mechanism;
4. do not change the two suspended rows or any Agent Access secret/config;
5. verify `/healthz`, prior exact revision/package, metadata/JWKS and both default-off routes;
6. verify the same two suspended clients and exact-zero lifecycle state;
7. observe stable recovery and record content-safe rollback evidence;
8. if a later git rollback is necessary, use a new reviewed scoped revert commit—never reset, force-push or rewrite `main`.

No DB restore is expected because this deployment has no schema/data mutation. Use the fresh backup only for demonstrated DB integrity damage under a separate recovery decision.

## 13. R1-R17 decision record

- **R1/R3/R6/R7/R8:** no linguistic, corpus-body, lesson or learner artifact is read or changed.
- **R2/R5:** dormant handler deployment is operational evidence only, not learning value, Hermes integration or launch evidence.
- **R4:** no consent/client UI is exercised; mobile/RTL validation remains in the later C4A window.
- **R9/R12:** handlers remain thin projections; MCP/external memory has no business-logic authority and no dual-write exists.
- **R10:** Inspector and Hermes remain independently suspended and untouched.
- **R11/R17:** no external prose, evaluator, grade, mastery or evidence authority is introduced.
- **R13:** linear exact-revision deployment, prior-image rollback and no migration preserve reversibility.
- **R14:** owner/user/client/connection isolation remains dormant behind independent gates; exact-zero live authority is mandatory.
- **R15:** no consent/downstream delivery occurs; existing deliberate lifecycle residue is not created or deleted.
- **R16:** zero polling, provider, managed-LLM and BYOK cost.

## 14. Definition of done and next boundary

Only after the full post-deploy gate and observation may this slice be marked:

```text
FIVE_PRODUCTION_HANDLERS_DEPLOYED_DEFAULT_OFF /
TWO_STATIC_CLIENTS_SUSPENDED /
OWNER_ALLOWLIST_UNCONFIGURED /
CLIENTS_GATE_OFF /
MCP_GATE_OFF /
ZERO_LIVE_AUTHORITY /
NO_PRODUCTION_CONNECTION
```

Then record content-safe evidence and rebase the C4A packet onto the exact deployed revision on a separate non-deploy branch, and request a new explicit C4A approval. Do not push that evidence/rebase commit to auto-deployed `main` under this authority. Do not infer C4A execution, Inspector activation or Hermes/C4B authority from this deployment.

## 15. Required separate owner execution approval

The future execution approval must name the exact packet-carrier/deploy commit supplied in the handoff and be equivalent to:

> Утверждаю AA2-C4-PRE default-off production-handler deployment packet для exact commit `<EXACT_PACKET_CARRIER_COMMIT>`, содержащего reviewed handler revision `57527403893b8291a1648d989eead743a349cb96`, package `3.11.197`. Разрешаю read-only repo/production preflight, локальные synthetic gates, один свежий backup, exact fast-forward push этого commit в `main` с normal production auto-deploy, content-safe health/revision/default-off validation, 15-minute zero-lifecycle-delta observation, content-safe evidence, allowlisted evidence/status docs commit и push только в отдельную non-deploy ветку, а также prior-image/flag-first rollback при stop condition. Не разрешаю иные code/docs изменения во время production execution, evidence follow-up push в `main`, migration/schema/API/UI/scope/dependency change, production env/config/secret/proxy mutation, owner allowlist configuration, client activation, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, `AGENT_ACCESS_MCP_ENABLED=1`, authorization/interaction/consent/token/refresh/revoke flow, Inspector/Hermes production configuration, production MCP request, live connection, DCR/CIMD/registration, credential/token/cookie disclosure, private learner reads, canonical writes, provider/LLM/BYOK calls, CP0 live, AA2-C4A или AA2-C4B.

Without that exact approval, the packet remains docs-only and production must not be touched.
