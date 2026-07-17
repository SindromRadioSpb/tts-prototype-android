# LinguistPro Agent Access AA2-C4-PRE default-off production-handler deployment evidence

**Date:** 2026-07-17

**Status:** `FIVE_PRODUCTION_HANDLERS_DEPLOYED_DEFAULT_OFF / TWO_STATIC_CLIENTS_SUSPENDED / OWNER_ALLOWLIST_UNCONFIGURED / CLIENTS_GATE_OFF / MCP_GATE_OFF / ZERO_LIVE_AUTHORITY / NO_PRODUCTION_CONNECTION`.

**Revision/package:** production `main` fast-forwarded from `854411cd7069c6c0f8e3695cf295fc84e1d268ea`, package `3.11.196`, to approved packet-carrier `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3`, containing reviewed handler revision `57527403893b8291a1648d989eead743a349cb96`, package `3.11.197`.

This is content-safe default-off deployment evidence. It is not production MCP readiness, Inspector evidence, Hermes integration, live evidence, learning evidence or product launch. It contains no owner ID, secret, credential, token, code, cookie, header, private path, production coordinate, learner payload, provider prompt or external transcript.

## 1. Preflight and exact deployment

- Candidate branch was `aa2-c4pre-production-handlers` at exact remote/local commit `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3`; `main`/`origin/main` were exact baseline `854411cd7069c6c0f8e3695cf295fc84e1d268ea`.
- Candidate contained exact reviewed handler revision `57527403893b8291a1648d989eead743a349cb96`; the six later files were docs-only. Package/lock were `3.11.197`, SDK exact `1.29.0`, protocol exact `2025-11-25`.
- Unrelated owner Wave-2/F1/F2/research and `.agents/` files were preserved and excluded; staged count before push was `0`.
- Production pre-state was package `3.11.196`, health/DB/migrations ready, OAuth UI/runtime `1/1`, clients gate `0`, MCP gate absent, owner allowlist absent/count `0`, exactly two reviewed clients both `SUSPENDED`, and all lifecycle counts `0`.
- One approved fresh backup completed: count delta `1`, latest artifact non-empty `true`, freshness age `0` seconds at verification. Coordinates and content were suppressed.
- The exact non-force refspec fast-forwarded only `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3` to `main`; no merge, rebase, history rewrite or evidence follow-up to `main` occurred.
- The deployment platform supplies no OCI revision label. Exact deployed identity was therefore proven content-safely by package `3.11.197` plus byte-for-byte SHA-256 comparison of all eight executable/package candidate artifacts: checked `8`, mismatches `0`.

## 2. Local candidate gates

| Command | Result |
|---|---|
| `npm run smoke:agent-access:production-handlers` | PASS, `27` checks; five tools; zero table/network/provider/LLM/BYOK/sentinel deltas |
| `npm run smoke:agent-access:mcp` | PASS, `45` checks; protocol `2025-11-25`; zero external/provider/live reads |
| `npm run smoke:agent-access:oauth` | PASS, lifecycle `24` plus restore |
| `npm run smoke:agent-access` | PASS, `20` checks |
| `npm run smoke:agent-access:oidc-loopback` | PASS, PKCE S256; `17` negative cases; no refresh token |
| `npm run smoke:agent-access:oauth-deployment` | PASS, default-off fixture plus B0/consent bridge |
| `node scripts/premium/agent-access-consent-smoke.js` | PASS, `10` checks; zero leaks/connections/endpoints/provider calls |
| `node scripts/premium/agent-access-boundary-smoke.js` | PASS, default-off and origin/CSP boundaries |
| `npm run smoke:agent-access:two-client` | PASS; Hermes `0.18.2`, Inspector `0.22.0`, five tools each, zero DCR/CIMD/registration/production/provider/live reads |
| `npm run smoke:auth` | PASS, `29/29` |
| `npm run smoke:cp0` | PASS, all six synthetic suites |
| `npm run test:api-smoke` | PASS |
| `node --check server.js` | PASS |
| `git diff --check` | PASS for scoped files; only unrelated owner line-ending warnings |

The focused handler smoke proves exact outputs/TTLs, manual-ignore parity, inclusive 24-hour urgency, overflow failure, unfinished-plan mapping, shipped v7 mappings, query/filter/sort/cursor determinism, stale/tampered/mismatched cursor rejection, catalog version/join corruption rejection, four explanation kinds, purge/construct registry, collision-safe timestamp boundaries, current connection binding, cross-user/client/connection isolation, exact-one owner positives/negatives, unknown-field/enum/ID/timestamp rejection, byte/cardinality limits and body/token sentinel count `0`.

## 3. Post-deploy default-off validation

| Boundary | Result |
|---|---|
| Health/package | `/healthz` `200`, DB/migrations ready; package `3.11.197` |
| Public metadata/JWKS | protected-resource, authorization-server, OIDC and JWKS all `200` |
| OAuth client routes | authorization/token/revoke/interaction all `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` |
| MCP gate | unauthenticated gate probe `404 AGENT_ACCESS_MCP_DISABLED` before runtime/owner dispatch |
| Registration | `404`, absent |
| Registry | exactly `2` public clients; Hermes `0.18.2` and Inspector `0.22.0`; both `SUSPENDED`; active `0` |
| Owner allowlist | absent/unconfigured; count `0`; no value read or derived |
| Runtime flags | OAuth UI/runtime `1/1`; clients gate `0`; MCP gate absent |
| Lifecycle | subjects/connections/grants/codes/families/refresh/denials all `0` |

An internal loopback OAuth probe without the canonical host was correctly rejected by the first-party boundary with `400 AA_OAUTH_BOUNDARY_BAD_HOST`; canonical public probes before and after the observation reached the intended clients gate and returned the exact disabled `404`. This was a probe-coordinate correction, not a product or configuration change.

## 4. Fifteen-minute zero-delta observation

At minutes `0`, `5`, `10` and `15`:

| Signal | Result at every checkpoint |
|---|---|
| Package/health | `3.11.197`; health, DB and migrations ready |
| Gates/owner | clients `0`; MCP absent; owner allowlist absent |
| Lifecycle tuple | `0/0/0/0/0/0/0` for subject/connection/grant/code/family/refresh/denial |
| Client state | suspended `2`; active `0` |
| Runtime stability | restart count `0`; memory sample present; disk warning `false` |
| Error/leak scan | fatal error count `0`; sensitive-pattern leak count `0` |

No rollback was required. No schema/data/env/config/secret/proxy/client/flag mutation, authorization lifecycle, provider/LLM/BYOK call, private learner read, canonical write, CP0 live action, Inspector/Hermes configuration or live connection occurred.

## 5. R1-R17 and authority

- **R2/R5:** handler/client interoperability remains transport proof, not learning value, Hermes integration or launch evidence.
- **R9/R12:** external memory and MCP business-logic authority remain absent; handlers are thin deterministic projections with no dual-write.
- **R11/R17:** external prose, evaluator, grade and evidence authority remain absent.
- **R14:** owner/user/client/connection isolation remains exact; live authority stayed zero.
- **R15:** metadata minimization held; no new subject/consent/erasure residue was created or deleted.
- **R16:** no polling, provider or managed-LLM/BYOK cost was introduced.
- **R1/R3/R4/R6/R7/R8/R10/R13:** deterministic authority, public-metadata honesty, unchanged UI/accessibility, independent client boundaries, reversibility and do-no-harm were preserved.

## 6. Remaining prohibition and next decision

C4A is still blocked. This execution grants no authority for production deploy/restart, env/config/secret/proxy mutation, owner allowlist configuration, client activation, OAuth clients or MCP gate enablement, authorization/interaction/consent/token/refresh/revoke flow, Inspector/Hermes production configuration, production MCP tool call, live connection, DCR/CIMD/registration, secret/shared-bearer/token passthrough, credential/cookie disclosure, private learner/F1/F2 reads, canonical writes, provider/LLM/BYOK calls, migration/API/UI/scope/schema/dependency change, CP0 live, C4A, C4B or launch claims.

The next possible decision is a separate exact-revision AA2-C4A Inspector-only owner-live approval packet. It must remain bounded to one owner, one Inspector client/window, exact five read-only calls, flag-first cleanup and zero residual live authority. Hermes/C4B remains later and separately prohibited.
