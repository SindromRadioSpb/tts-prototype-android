# LinguistPro Agent Access AA2-C3 production-registration-still-disabled execution packet

**Date:** 2026-07-17

**Packet status:** `EXECUTION_COMPLETE / TWO_STATIC_PUBLIC_CLIENTS_SUSPENDED / C4_SEPARATE_APPROVAL_REQUIRED`

**Target status after a separately approved execution:** `TWO_STATIC_PUBLIC_CLIENTS_SUSPENDED / CLIENTS_GATE_OFF / MCP_GATE_OFF / ZERO_CONNECTIONS / ZERO_TOKENS / NO_LIVE_CONNECTION`

**Exact candidate:** `5d34eb3c71c1cee6545aa15f5eeab95b19480c60`, package `3.11.196`.

This packet did not authorize its own execution. Its initial preparation session authorized only read-only production preflight and this tracked planning artifact; it authorized no production mutation, deploy, restart, client row, flag change, authorization, consent, token issuance, client configuration or live connection.

**Execution authority:** separately supplied by the owner on 2026-07-17 using the exact wording in §11. Execution evidence: `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C3_PRODUCTION_REGISTRATION_STILL_DISABLED_EVIDENCE_2026_07_17.md`.

The preceding paragraph records the packet's original docs-only authority. The later separate approval authorized only the bounded backup, atomic suspended-row transaction, post-check, observation, rollback if required and evidence described here; it did not authorize AA2-C4.

## 1. Purpose and boundary

AA2-C1 completed the default-off MCP engineering. AA2-C2 proved exact Hermes Agent `0.18.2` and MCP Inspector `0.22.0` interoperability on two isolated synthetic loopback clients, including PKCE S256, exact resource binding, all five closed tools, protected token storage and exact zero DCR/CIMD/registration requests.

AA2-C3 has one purpose: place exactly two reviewed static public-client records in the production registry in `SUSPENDED` state while every client/MCP activation boundary remains off. Registration is not activation. C3 must create no subject mapping, connection, grant, authorization code, token family, refresh token, access-token denial or consent/audit lifecycle row.

This is not production MCP readiness, Hermes integration, a live connection, learning evidence or product-launch evidence.

## 2. Docs-only authority used in this session

Allowed and completed:

- read the private production runbook without copying credentials, secrets or private coordinates into tracked artifacts;
- read-only local/origin and production revision/package/flag inspection;
- read-only `/healthz`, migration, backup-readiness, container-boundary and aggregate row-count checks;
- prepare this packet and reconcile the parent AA2-C planning status.

Not allowed and not performed:

- production DB/env/config mutation, backup creation, deploy or restart;
- production client-row creation, status change or activation;
- `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1` or `AGENT_ACCESS_MCP_ENABLED=1`;
- authorization, interaction, consent, token, revoke or live MCP execution;
- Hermes/Inspector production configuration;
- real credential/token access, DCR/CIMD, provider call, private learner/F1/F2 read or canonical write;
- commit or push.

## 3. Content-safe read-only snapshot

Snapshot time: `2026-07-17T03:40:14Z`.

| Gate | Observed state | C3 interpretation |
|---|---|---|
| Local `HEAD` / `origin/main` | exact `5d34eb3c71c1cee6545aa15f5eeab95b19480c60` | candidate exact |
| Production revision | exact `5d34eb3c71c1cee6545aa15f5eeab95b19480c60` | already deployed before C3; C3 deploy/restart must be a no-op and is prohibited |
| Local/production package | `3.11.196` / `3.11.196` | exact |
| `/healthz` | HTTP `200`, `ok=true`, DB ready, migrations ready | healthy |
| Migration 042 | present; 42 migrations recorded | schema ready |
| Backup readiness | backup command present; eight non-empty backups; newest approximately 0.6 hours old | execution still creates a fresh pre-C3 backup only after approval |
| Public backend binding | zero directly published container bindings | retained private Traefik boundary |
| `AGENT_ACCESS_UI_ENABLED` | exact `1` | unchanged |
| `AGENT_ACCESS_OAUTH_ENABLED` | exact `1` | metadata-only OAuth runtime remains available |
| `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED` | exact `0` | mandatory invariant |
| `AGENT_ACCESS_MCP_ENABLED` | absent | mandatory fail-closed state; do not add it in C3 |
| First-party/OAuth proxy flags | exact `1` / `1` | previously verified single-hop boundary; no C3 change |
| OAuth clients | `0` | exact precondition |
| Subject mappings | `0` | exact precondition |
| Connections / grants / codes | `0 / 0 / 0` | exact precondition |
| Token families / refresh tokens / denials | `0 / 0 / 0` | exact precondition |

Existing unrelated owner worktree files remain outside the AA2-C3 allowlist:

- three modified Wave-2/F1 planning files;
- `.agents/`;
- two untracked Wave-2/F2 planning files;
- `docs/research/edu-quality-agentic/`.

## 4. Exact reviewed client records

Both records are public clients. Neither schema nor execution contains a client secret.

### Inspector

```text
oauth_client_id      = linguistpro-mcp-inspector-v0
display_name         = MCP Inspector fixture
software_id          = modelcontextprotocol-inspector
software_version     = 0.22.0
client_type          = PUBLIC
redirect_uris        = [
  http://localhost:6274/oauth/callback,
  http://localhost:6274/oauth/callback/debug
]
status               = SUSPENDED
registration_version = aa2-c3-static-v1
revoked_at           = null
```

### Hermes

```text
oauth_client_id      = linguistpro-hermes-owner-v0
display_name         = Hermes Agent owner fixture
software_id          = nousresearch-hermes-agent
software_version     = 0.18.2
client_type          = PUBLIC
redirect_uris        = [
  http://127.0.0.1:8765/callback
]
status               = SUSPENDED
registration_version = aa2-c3-static-v1
revoked_at           = null
```

Exact redirect matching remains mandatory. No wildcard, alternate port, hostname substitution, HTTPS-to-loopback rewrite, DCR metadata, secret, shared bearer or additional client is permitted.

## 5. Registration mechanism decision

The candidate repository exposes `registerClientFixture`, but that helper inserts a client initially as `ACTIVE`. It is therefore prohibited for AA2-C3. Register-then-suspend is also prohibited, even when the client gate is `0`, because C3 requires the rows to be initially inactive and must not create a transient active registry state.

The approved execution mechanism must be one content-safe, one-shot operation inside the running exact-candidate container:

1. load the exact two client objects from the reviewed deployment contract;
2. validate both through `agent/access/oauthContracts.validateClient`;
3. acquire `BEGIN IMMEDIATE` on the production SQLite DB;
4. recheck inside the transaction that the client table and every dependent lifecycle table have exact count zero;
5. insert both records with parameterized values and literal status `SUSPENDED`;
6. reread and compare all non-secret fields against the reviewed contract;
7. assert client count `2`, both statuses `SUSPENDED`, and every dependent lifecycle count `0`;
8. `COMMIT` only if all assertions pass; otherwise `ROLLBACK`.

The operation must print only a boolean/result code, two public client IDs, statuses and aggregate counts. It must not print environment values, DB paths, container identity, request headers, cookies, authorization material or private coordinates.

No migration, repository API, registration endpoint, DCR/CIMD implementation, application code change, image rebuild, deploy or restart is needed or allowed for this exact C3 candidate.

## 6. Exact execution sequence after separate approval

1. Re-read the production runbook privately; do not export coordinates or secrets.
2. Fetch `origin/main` and prove local, origin and production are still exact `5d34eb3c71c1cee6545aa15f5eeab95b19480c60`, package `3.11.196`.
3. Report dirty state and exclude all unrelated owner files.
4. Verify `/healthz`, DB/migration readiness, no direct backend binding and the verified single-hop proxy boundary.
5. Verify flag states without printing any unrelated environment value:
   - UI `1`;
   - OAuth `1`;
   - OAuth clients `0`;
   - MCP absent or exact `0`;
   - both proxy flags exact `1`.
6. Verify exact zero clients, subjects, connections, grants, codes, token families, refresh tokens and denials.
7. Create one fresh labelled pre-C3 backup using the approved production backup mechanism; verify only success, age and nonzero size.
8. Run the single atomic registration transaction from §5.
9. Verify exactly two reviewed public rows, both `SUSPENDED`, and zero lifecycle/dependent rows.
10. Verify `/healthz` remains healthy and metadata/JWKS discovery remains content-safe.
11. Verify `/agent-access/mcp` remains default-off without presenting a bearer token. Do not initiate authorization, consent, token or revoke requests.
12. Observe health and aggregate Agent Access counts for 15 minutes; expected delta is zero.
13. Record content-safe evidence and, only if included in the execution approval, make a scoped docs-only evidence commit/push.
14. Stop. Do not enter AA2-C4.

## 7. Content-safe verification matrix

| Surface | Required result |
|---|---|
| Candidate identity | local = origin = production exact target SHA; package `3.11.196` |
| Health | `/healthz` HTTP 200; DB/migrations ready; no new disk warning |
| Registry cardinality | exactly `2` |
| Registry identities | only the two IDs in §4 |
| Type/authentication | both `PUBLIC`; no secret column/value/material |
| Status | both exactly `SUSPENDED`; no transient `ACTIVE` state |
| Software identity | Inspector `0.22.0`; Hermes `0.18.2` |
| Redirects | canonical JSON exactly equal to §4; no wildcard/additional URI |
| Registration version | both `aa2-c3-static-v1` |
| Subject mappings | `0` |
| Connections / grants | `0 / 0` |
| Authorization codes | `0` |
| Token families / refresh tokens | `0 / 0` |
| Access-token denials | `0` |
| Client/MCP flags | clients exact `0`; MCP absent or exact `0` |
| OAuth lifecycle calls | authorization/interaction/consent/token/revoke count `0` during C3 |
| MCP/live calls | `0`; endpoint remains default-off |
| DCR/CIMD/registration HTTP calls | `0`; endpoints remain absent |
| Provider/LLM/BYOK calls | `0` |
| Private learner/F1/F2 reads | `0` |
| Canonical learner writes | `0` |
| Deploy/restart | `0` when production is already on the exact candidate |
| Observation | 15 minutes; health stable; all lifecycle counts unchanged |

Evidence may contain revision/package, flag presence and `0/1`, public client metadata, status, aggregate counts, HTTP status/result codes and timestamps. It must not contain secret values, tokens, cookies, authorization codes, PKCE values, CSRF, private keys, private paths, raw headers, user IDs, subject IDs, connection IDs, private infrastructure coordinates or learner data.

## 8. Immediate stop conditions

Stop before mutation if any of the following is true:

- local, origin or production revision/package differs from the exact candidate;
- a deploy/restart or code/migration change appears necessary;
- health, DB, migration 042, backup, volume or rollback readiness is not exact;
- backend exposure or proxy topology is ambiguous;
- OAuth clients flag is not exact `0`, or MCP is exact `1`;
- any production OAuth client or any subject/connection/grant/code/token/denial row already exists;
- the exact client objects differ in ID, version, public-client type or redirect URI;
- the operation cannot insert both records atomically as initially `SUSPENDED`;
- execution would call `registerClientFixture`, create a transient `ACTIVE` row or bypass contract validation;
- a secret, credential, token, cookie, code, PKCE value, private path/header or learner payload appears in output/log;
- DCR/CIMD, client secret, shared bearer or token passthrough becomes necessary;
- any authorization, consent, token, revoke, MCP tool or live client request occurs;
- any connection, grant, code, token-family, refresh-token, denial or subject row appears;
- health degrades, DB integrity changes, counts drift, or an unrelated production repair is needed.

There is no workaround inside C3. Report the discrepancy and request a new decision.

## 9. Rollback contract

### Before transaction commit

Any validation or insert failure performs SQLite `ROLLBACK`. Verify zero client and lifecycle rows. No deploy/env rollback exists because C3 changes neither.

### After transaction commit, while dependent counts remain zero

Keep OAuth clients exact `0` and MCP absent/exact `0`. In one `BEGIN IMMEDIATE` transaction:

1. assert the registry contains only the exact two C3 IDs;
2. assert both are `SUSPENDED`;
3. assert every subject/connection/grant/code/token/denial count is zero;
4. delete only the two exact client rows;
5. assert registry and lifecycle counts return to zero;
6. commit and verify `/healthz`.

### If any dependent row exists or DB integrity is uncertain

Do not cascade, improvise or activate anything. Preserve flags off, capture content-safe counts, stop traffic if required by the established incident runbook and escalate to the owner. Restore from the fresh pre-C3 backup only under a new explicit recovery decision; replay deletion protections and verify all unrelated user data remain intact.

## 10. R1–R17 record

- **R1/R3/R6/R7/R8/R13:** deterministic schema, exact revision, atomic registration, zero lifecycle rows, aggregate evidence and reversible deletion remain authoritative.
- **R2/R5:** suspended client registration creates no learning value, mastery evidence, product validation or launch evidence.
- **R4:** no consent UI or live client exists in C3; 380×844/RTL validation remains a C4 prerequisite.
- **R9/R12:** no external memory and no second MCP/business-logic authority are introduced.
- **R10:** both clients remain independently addressable and independently activatable later; C3 activates neither.
- **R11/R17:** no external prose, evaluator, grade or evidence authority enters canonical truth.
- **R14/R15:** registry metadata only; production consent, connection, downstream delivery and real-user data remain absent.
- **R16:** zero polling, provider, BYOK, managed-LLM and MCP execution cost.

## 11. Exact execution approval wording

The following approval is intentionally bounded to AA2-C3 and must be supplied separately after review of this packet:

> Утверждаю AA2-C3 production-registration-still-disabled по packet от 2026-07-17 для exact revision `5d34eb3c71c1cee6545aa15f5eeab95b19480c60`, package `3.11.196`. Разрешаю read-only production preflight с приватным использованием production runbook, создание одного fresh pre-C3 backup, одну атомарную production DB transaction, которая при исходных нулевых lifecycle counts создаёт ровно две static public client rows — `linguistpro-mcp-inspector-v0` версии `0.22.0` и `linguistpro-hermes-owner-v0` версии `0.18.2` — сразу в статусе `SUSPENDED`, с exact redirect URIs и `registration_version=aa2-c3-static-v1`. Разрешаю content-safe post-check, 15-minute zero-delta observation, описанный delete-only rollback при exact zero dependent rows, подготовку evidence и scoped docs-only commit/push. Production уже должна оставаться на exact revision; deploy/restart не разрешаю. Не разрешаю `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, добавление/включение `AGENT_ACCESS_MCP_ENABLED=1`, client activation, subject/connection/grant/code/token/denial creation, authorization/interaction/consent/token/revoke, Hermes/Inspector production configuration, MCP/live call, DCR/CIMD, client secret/shared bearer/token passthrough, реальные credentials/tokens, private learner/F1/F2 reads, canonical writes, provider/LLM/BYOK calls, code/migration/API/UI changes, unrelated production repair или AA2-C4.

Anything shorter or broader must not be inferred as equivalent approval.

## 12. State after successful C3 and next boundary

Successful exact status:

```text
TWO_STATIC_PUBLIC_CLIENTS_SUSPENDED
CLIENTS_GATE_OFF
MCP_GATE_OFF
ZERO_CONNECTIONS
ZERO_TOKENS
NO_LIVE_CONNECTION
```

AA2-C4 remains separately prohibited. Its future approval must name one client, exact scopes, owner identity boundary, time window, activation/flag sequence, allowed calls, observation and rollback. Inspector must be validated and revoked first; Hermes requires a later separate live window. C3 approval must never be treated as C4 approval.
