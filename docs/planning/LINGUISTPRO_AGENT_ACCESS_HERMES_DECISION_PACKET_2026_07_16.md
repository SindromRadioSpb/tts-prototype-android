# LinguistPro — Agent Access and Hermes reference-client decision packet

**Date:** 2026-07-16
**Status:** `OWNER_APPROVED`; Agent Access direction A/A/A/A/A/A/A/A/A/A is canonical. Research, architecture and roadmap decision only.
**Authority:** documentation only. No Hermes skill, MCP endpoint, OAuth server/client, token, scope, API/UI/config, migration, runtime hook, deployment, external connection, notification, durable lesson or canonical write is authorized.
**Owner approval:** 2026-07-16 — Decisions 1–10: A/A/A/A/A/A/A/A/A/A. This approval adds the parallel AA roadmap track and authorizes its documentation gates only; it does not authorize AA0 execution, Hermes configuration, AA2 implementation or any external data connection.
**Repository baseline:** `main` / `60e98dc`; package `3.11.183`; `origin/main` aligned after the owner-approved S3 design push.
**Current foundation:** S0, S1 and S2 are owner-approved; S3 is `DESIGN_APPROVED`, not `OPERATIONALLY_COMPLETE`. CP0 implementation/evidence remains separately gated.
**Execution-order decision:** for one primary implementer, the default critical path is S3 engineering implementation/zero-real-provider synthetic/default-off deployment → F1 correctable continuity → AA2 read-only runtime/MCP engineering → AA3 propose-first engineering → AA4-required S7 capabilities → AA4 product engineering. Unavailable live windows are deferred/remediated and gate activation/promotion, not default-off engineering. AA0 packaging/evidence and AA1 design proceed in parallel under separate authority.
**Owner implementation amendment:** 2026-07-16 — the complete AA0→AA4 engineering chain is an intended product direction and must not be blocked by currently unavailable owner-live windows. S3 `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` may unblock AA2 default-off engineering after AA1; AA0 and each AA live-evidence window are non-blocking evidence debts. Live connection/promotion remains separately gated, and AA4 public enablement still requires S7 plus resolved critical deferred findings.
**Question:** should the owner use LinguistPro with a personal Hermes agent, and should LinguistPro expose a vendor-neutral agent-access surface with Hermes as the first reference client?

## 1. Revised verdict

**Yes, with a narrower and stronger architecture than the brainstorm proposed.**

Hermes is useful as a **user-owned orchestration client** around LinguistPro. It should not become LinguistPro's agent backend, pedagogical controller, notification authority or memory system. MCP should be a transport adapter over a closed LinguistPro Agent Access domain service, not the domain boundary itself.

The durable formulation is:

> **LinguistPro remains the pedagogical system of record and policy authority. Hermes is an untrusted, user-authorized external client that may read minimized aggregates and create bounded in-app intents.**

Updated assessment:

| Direction | Revised value | Reason |
|---|---:|---|
| Personal Hermes coordinating LinguistPro with calendar/files/channels | **8/10** | Strong cross-application value; must avoid duplicate nudges and data over-sharing |
| Hermes as a replacement for the existing LinguistPro Telegram/Mini App/nudge surface | **4/10** | That product contour already exists and owns fatigue/consent policy |
| Owner-only read-only Agent Access with Hermes as first reference client | **8.5/10 after prerequisites** | High learning value for the architecture with bounded risk |
| Vendor-neutral Agent Access domain contract | **9/10 strategic direction** | Creates interoperability without making the product depend on Hermes/MCP |
| MCP-first business logic or direct repository exposure | **2/10** | Protocol is not authorization, pedagogy or truth governance |
| Hermes as the main mentor/backend/model router | **2/10** | Transfers prompt, memory, tool and execution control to a general agent runtime |
| Public connected-agent feature before S3 operational evidence and S7 tenancy/FinOps | **1/10 now** | Identity, OAuth, scopes, support, audit, lifecycle and abuse controls are absent |

## 2. External facts verified on 2026-07-16

The brainstorm's central interoperability claim is current:

- Hermes supports local stdio and remote HTTP MCP servers, automatic tool discovery, per-server include/exclude filtering and remote OAuth configuration: [Hermes MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/) and [MCP config reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference).
- Hermes remote MCP OAuth uses the SDK's OAuth/PKCE flow with metadata discovery, token exchange/refresh and locally persisted tokens: [Hermes MCP config reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference).
- Hermes provides messaging gateways, persistent sessions and a cron scheduler with delivery: [Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging), [Scheduled Tasks](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron), [Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions).
- The current Hermes memory/session model is broader than the brainstorm's small-file limit implied: full message history, tool calls/results, model/system metadata and searchable sessions are stored in `state.db`; automatic pruning is opt-in and disabled by default: [Hermes Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions/).
- Hermes security includes user authorization, destructive-command approval, file controls, container options, MCP credential filtering and injection scanning, but some protections are configuration-dependent and dangerous-command approval can be bypassed by the owner: [Hermes Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) and [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands).
- Hermes exposes an OpenAI-compatible API whose agent can use its full configured toolset, including terminal/file/web capabilities; the official documentation warns that the API grants broad agent access: [Hermes API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/).
- MCP Streamable HTTP is the standard remote transport; HTTP servers must validate Origin and should authenticate connections: [MCP transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
- MCP's HTTP authorization model treats the MCP server as an OAuth resource server and uses OAuth/OIDC discovery standards; token passthrough is explicitly unsafe: [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [MCP security guidance](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).
- MCP tool annotations are hints, not an authorization boundary, and outputs are untrusted inputs to the host/model: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) and [client security guidance](https://modelcontextprotocol.io/docs/develop/clients/client-best-practices).
- The official TypeScript SDK supports Node and Streamable HTTP adapters, but its middleware is intentionally thin and should not contain business logic. As of this packet, the repository's `main` branch is a v2 beta targeting the announced 2026-07-28 specification, while v1.x remains the supported production line; AA2 must refresh compatibility and pin an exact stable SDK/protocol/Hermes matrix rather than install from `main`: [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

These facts establish feasibility, not product safety or priority.

## 3. What the brainstorm got right

1. **Correct inversion of control.** Hermes should call LinguistPro; LinguistPro should not outsource pedagogy to Hermes.
2. **Correct system-of-record boundary.** FSRS, `review_log`, mastery, resolver facts, grading, consent and publication remain inside LinguistPro.
3. **Correct vendor-neutral ambition.** Hermes is a credible first reference client, not the product's protocol or brand dependency.
4. **Correct high-level tool shape.** A few domain tools are safer than dozens of repository/end-point wrappers.
5. **Correct propose-first direction.** External agents may create intentions/drafts for in-app confirmation, not silently publish or alter learning truth.
6. **Correct rejection of Hermes as primary backend.** Its broad tools, memory and execution loop are useful to its owner but too powerful to become LinguistPro's implicit controller.
7. **Correct need for remote OAuth rather than a shared permanent application token.**

## 4. Corrections required by the live repository

### 4.1 Hermes does not replace an unbuilt Telegram contour

The repository already has:

- Telegram pairing, commands, review and content flows;
- Telegram Mini App sessions/home/review/handoffs;
- deterministic notification selection;
- `nudge_ledger` one-local-day claim, backoff/mute state and Telegram/Push delivery;
- action-time `telegram_delivery` consent and channel binding.

Therefore Hermes is not a shortcut around building Telegram. Its incremental value is **cross-application orchestration** and owner-controlled channels. If both Hermes cron and LinguistPro nudge independently message the learner, they can violate the product's one-daily-claim/fatigue policy.

Product rule: an external agent may not claim to deliver an official LinguistPro nudge until LinguistPro itself authorizes and records that delivery. A personal AA0 experiment may instead disable one of the duplicate reminder paths and remain explicitly owner-local.

### 4.2 Lesson Builder is not a durable draft service

The live Lesson Builder returns a typed UUID-bearing draft, but:

- the server does not persist that draft;
- the browser retains it for at most 24 hours;
- source selection/search happens through the browser host;
- there is no server `get_lesson_draft_status` or stable edit URL for a remote agent;
- LB2 closed as `OPERATIONALLY_COMPLETE / EVIDENCE_DEFERRED`, not as a durable lesson platform.

Therefore the initial external action must be **`create_lesson_intent_handoff`**, not `create_lesson_draft`. It stores/encodes only bounded intent and source references in a short-lived, single-use, user-bound handoff. The user opens LinguistPro and explicitly triggers the existing builder. Durable draft status would be a new lifecycle/storage decision and is not implied.

### 4.3 “Recommend next reading” is not yet a server capability

The live D1 flow performs deterministic next-text selection on the learner's device and calls `/api/agent/next-text/explain` only to explain the already selected grounded work. The server does not currently own an authoritative equivalent of the device coverage/frontier selector.

An MCP tool named `recommend_next_reading` would overclaim current server authority. Initial choices are:

- expose public-corpus search/filter only;
- accept a signed/typed device selection artifact later and explain it;
- or separately prove a server selector against the device oracle before exposing a recommendation.

### 4.4 Personal library search is not remotely available as claimed

Personal library/lesson source discovery is primarily browser/OPFS state. Server-side personal artifacts are opaque LWW bundles and may be parsed only through exact consented bounded readers. A remote agent cannot safely receive ambient personal-library search.

Initial Agent Access may search the public corpus catalog. Personal metadata/content requires a separate scope, consent copy, bounded purpose and lifecycle proof.

### 4.5 Current identity is not remote OAuth

Live learner APIs use an owner bootstrap secret, an HttpOnly `lp_session` cookie and CSRF for mutations. There is no OAuth authorization server, protected-resource metadata, external client registry, access/refresh tokens, audience validation or incremental scopes.

Consequences:

- do not give Hermes a browser session cookie or CSRF token;
- do not reuse an admin/upload/shared bearer token;
- do not advertise remote MCP as production-ready;
- OAuth/resource-server work is a real identity/security slice, not SDK plumbing.

### 4.6 Hermes memory increases the privacy obligation

Hermes can retain full sessions and tool results, and its default session auto-prune is off. Even a read-only tool response may leave LinguistPro and persist in the user's agent, backups or upstream model context.

LinguistPro must treat every connected agent as a separate external recipient:

- dedicated `external_agent_access` consent and connection record;
- exact OAuth scopes and action-time checks;
- minimal structured outputs rather than raw learner history;
- disclosure that the external agent/provider controls downstream retention;
- revocation stops future access but cannot guarantee deletion from an already delivered external transcript;
- no claim that Hermes profile/memory isolation substitutes for LinguistPro authorization.

### 4.7 S3 is designed, not operational

S3 commit `60e98dc` records `DESIGN_APPROVED`. It does not provide CP0 traces or parity evidence. Agent Access is a new external scenario and must not leapfrog the observe-only foundation or be treated as covered by existing scenario parity.

## 5. Product and architectural decision

Name the product boundary **LinguistPro Agent Access**, not “Hermes integration.”

```text
Hermes / Claude / Codex / other MCP host
                    │
          MCP Streamable HTTP adapter
                    │
       OAuth resource-server boundary
                    │
      LinguistPro Agent Access Service
                    │
     policy + consent + scope + budget
                    │
         S1 roles / S2 artifacts
                    │
    existing deterministic controllers
                    │
 review_log / resolver / corpus / graph
```

### 5.1 The critical adapter rule

The domain service owns:

- principal and connection identity;
- scope/consent/purpose decisions;
- input/output schemas and size limits;
- calls into approved high-level LinguistPro controllers;
- audit/CP0 correlation;
- idempotency, handoff and publication policy;
- stable domain error codes.

The MCP adapter owns only:

- MCP initialization and protocol negotiation;
- `tools/list` projection from already-authorized capability metadata;
- `tools/call` decoding/encoding;
- Streamable HTTP transport;
- OAuth challenge/discovery integration;
- structured MCP results/errors.

No repository, FSRS reducer, grader or lesson logic belongs in MCP handlers. A future REST/native adapter must call the same Agent Access Service.

### 5.2 Why not expose the existing HTTP routes directly

- they assume browser cookie/CSRF or Mini App session identity;
- response shapes are UI/runtime contracts, not external-agent contracts;
- some routes spend managed model quota;
- next-text selection and lesson source discovery still depend on device/browser state;
- current route names do not express external scopes, connection ID or downstream retention;
- wrapping them mechanically would preserve accidental authority and bypass S1/S2 classification.

## 6. External principal and connection model

Every call is authorized as an intersection:

```text
authenticated user
∩ registered external client
∩ connected-agent instance
∩ granted OAuth scopes
∩ current LinguistPro consent
∩ S1 role/scenario capability
∩ S2 data/artifact scope
∩ live feature flag / quota / purpose
```

Required conceptual identities:

| Identity | Meaning |
|---|---|
| `user_id` | Server-derived LinguistPro principal; never a tool argument |
| `oauth_client_id` | Registered software/client identity, e.g. Hermes MCP client |
| `connection_id` | One user-approved connected-agent installation/profile |
| `external_actor_id` | Content-safe audit identity derived from connection, not a model persona |
| `request_id` | One external call; mapped to future CP0 run |
| `handoff_id` | Short-lived one-time in-app action capability |

Hermes profiles or session keys do not establish a LinguistPro user. OAuth subject/audience/scope and the connection record do.

## 7. OAuth and transport contract

For remote Agent Access:

1. use HTTPS Streamable HTTP;
2. expose MCP protected-resource metadata and authorization-server discovery compatible with the current MCP authorization specification;
3. use Authorization Code + PKCE for user authorization;
4. validate issuer, signature, audience, subject, client, expiry, scopes and revocation on every request;
5. issue short-lived access tokens and rotated/revocable refresh credentials under an explicit lifecycle;
6. never accept upstream/provider tokens through token passthrough;
7. bind every token to `connection_id` and an exact scope set;
8. support incremental consent without silently widening old grants;
9. validate `Origin`/Host and use strict CORS/non-browser behavior;
10. rate-limit by user, connection, client, scope and IP without trusting model-supplied identity;
11. revoke a connection independently from browser and Telegram sessions;
12. store no Hermes API/model credentials in LinguistPro.

Before implementation, pin and test one exact MCP protocol revision, stable TypeScript SDK release and Hermes client version. The adapter must negotiate/reject unsupported versions honestly; an upcoming SDK/spec release is not implementation authority.

Whether LinguistPro builds or delegates the authorization-server role is a later identity decision. The Agent Access resource server cannot be implemented safely by inserting a static token into `config.yaml`.

## 8. Proposed scope vocabulary

### 8.1 Initial read scopes

| Scope | Allows | Explicitly excludes |
|---|---|---|
| `learning.brief.read` | Due/priority/minutes/unfinished-action aggregates | Raw review log, answers, personal text, mastery mutation |
| `review.summary.read` | Due/urgent counts, estimated duration and review handoff eligibility | Items/answers/expected forms/grade/write |
| `reading.public.search` | Public-corpus metadata filters and bounded results | Personal library, private text bodies, device profile dump |
| `explanations.metadata.read` | Recent explanation IDs/timestamps/kinds/construct IDs and purge state | Explanation body/facts/source text by default |
| `agent.connection.read` | Current connection/scopes/expiry and capability version | Other users/connections or secrets |

### 8.2 Initial bounded mutation scopes

These are not canonical learner writes:

| Scope | Allows | Gate |
|---|---|---|
| `handoff.create` | Create one short-lived user-bound in-app handoff | Target/action allowlist, TTL, single use, rate limit |
| `lesson.intent.create` | Store/encode bounded lesson intent/source refs for in-app confirmation | No lesson body/build/provider call; user opens and confirms |

### 8.3 Deferred scopes

- `reading.personal.metadata.read` and any personal-content scope;
- `explanations.body.read`;
- `notification.delivery.claim`;
- plan-change proposals;
- lesson draft creation/status;
- any action that spends managed model budget without an in-app confirmation.

### 8.4 Permanently prohibited external scopes

```text
review_log.write
grade.execute_as_agent
fsrs.write
mastery.write
word_status.write
linguistic_truth.write
consent.write
profile.write_silently
sql.execute
server_command.execute
user_data.delete
purge.execute
provider_route.override
```

Account deletion remains a first-party authenticated account flow, never a model tool.

## 9. Corrected first tool surface

Expose tools only; no MCP resources/prompts in v0. Resources encourage ambient browsing/enumeration, while prompts would compete with Hermes' own system/skill layer.

### `get_learning_brief`

Returns a closed aggregate:

```json
{
  "schema_version": "1.0.0",
  "due_total": 12,
  "urgent_total": 4,
  "estimated_minutes": 8,
  "priority_code": "REVIEW_DUE",
  "unfinished_action": "READING_AVAILABLE",
  "generated_at": "...",
  "expires_at": "..."
}
```

No free pedagogical prose is required. Hermes may render the facts, but its wording is not LinguistPro truth.

### `get_due_review_summary`

Returns counts, duration and whether a review handoff can be created. It does not return prompts, expected answers or an item list.

### `search_public_reading_catalog`

Searches/filter public corpus metadata by query, era, genre, length, audio/review status and bounded page size. It does not claim learner-specific recommendation.

### `get_recent_explanation_metadata`

Returns bounded IDs, dates, type/category, construct IDs and tombstone state. Body/source facts require a later separate scope and consent.

### `create_app_handoff`

Creates a single-use short-lived link for an enum target such as `OPEN_REVIEW`, `OPEN_PUBLIC_READING`, `OPEN_MENTOR` or `OPEN_LESSON_BUILDER`. It cannot encode arbitrary URLs, prompts or tool calls.

### `create_lesson_intent_handoff`

Accepts one to three already permitted source refs plus bounded goal/duration/focus. It creates no lesson/model call. On open, LinguistPro re-authenticates, rechecks source/consent and asks the user to confirm the existing Lesson Builder action.

## 10. Explicitly deferred brainstorm tools

| Brainstorm tool | Decision | Reason / replacement |
|---|---|---|
| `recommend_next_reading` | Deferred | Current authoritative selection is device-side; expose public search or later typed device-selection handoff |
| `search_learning_library` | Narrowed | v0 public corpus only; personal OPFS/opaque artifacts are not ambient remote search |
| `get_recent_explanations` | Narrowed | Metadata first; bodies can persist in Hermes sessions and require separate scope |
| `create_lesson_draft` | Replaced | Use `create_lesson_intent_handoff`; current draft is client-only ≤24h |
| `get_lesson_draft_status` | Rejected in v0 | No durable server draft exists |
| `open_lesson_draft` | Replaced | One-time lesson intent handoff into first-party UI |
| `propose_learning_plan_change` | Deferred | Requires proposal lifecycle/UI, not free-form external write |
| `schedule_in_app_reminder` | Deferred | Must join notification claim/fatigue policy; Hermes cron alone is outside it |
| `publish_lesson_draft` | Prohibited until separate slice | Requires durable draft, confirmation token, revalidation, audit and publication authority |

## 11. Notification and cron policy

Hermes cron is useful for the owner's personal pilot, but it is not LinguistPro's notification policy.

### Owner-local AA0 rule

- use at most one scheduled learning message/day;
- disable or avoid the overlapping LinguistPro nudge for that owner channel;
- call no private API and store no LinguistPro credential in a skill;
- use public/deep links or manually supplied brief data;
- label the message as Hermes-generated, not a canonical LinguistPro decision.

### Product rule

An official external-agent notification later requires:

1. LinguistPro deterministic eligibility and fatigue decision;
2. atomic daily claim before delivery;
3. exact connection/channel/scope and consent;
4. idempotent delivery attempt/receipt;
5. no fallback to a second channel after claim;
6. CP0 lineage and 30-day operational retention;
7. revoke/mute/backoff behavior identical to first-party notifications.

Until that exists, Agent Access may return a brief only in response to an explicit tool call. Hermes decides whether to ask; LinguistPro does not certify its scheduling behavior.

## 12. Data-minimization and downstream-retention contract

| Data | Initial external form | Downstream warning |
|---|---|---|
| Due/review state | Counts and codes | May persist in Hermes session/tool history |
| Learner priority | Deterministic enum + expiry | Hermes prose is derived rendering |
| Public corpus | Public metadata and IDs | No private consent needed; still bounded |
| Explanation history | Metadata/construct IDs only | Body/source text deferred |
| Personal text/library | Not exposed in v0 | Later explicit recipient/retention consent required |
| Lesson intent | IDs/enums/bounds only | No generated lesson content leaves LinguistPro |
| Deep link | Opaque short-lived single-use token | Never place bearer state in query logs beyond the designed capability |

The consent screen must state:

- which connected agent receives which categories;
- that its model/provider/session storage is outside LinguistPro control;
- that revoking LinguistPro access prevents future calls but cannot erase data already delivered to the agent;
- how to revoke the connection and inspect its action log;
- that no learning result/mastery change can be made through the connection.

## 13. Audit, budgets and abuse controls

Every external call later maps to S3 CP0 fields plus:

- `connection_id`, `oauth_client_id`, granted scope and token audience;
- tool/schema version and content-safe input/output digests;
- decision/denial/error code;
- handoff ID/target where created;
- rate/quota bucket and cost class;
- no prompt, tool result body, token or provider secret.

Initial tools are deterministic and model-free. An external call must not spend LinguistPro managed LLM budget. If a later action can spend model budget, it requires a distinct scope, explicit user confirmation, S0 fairness reservation and no BYOK/managed fallback ambiguity.

Rate limits apply per IP, OAuth client, connection, user and tool. Tool filtering in Hermes is defense-in-depth only; the server enforces scopes even when every tool is visible or the Hermes owner disables local approvals.

## 14. Threat model and stop conditions

Treat the external agent as potentially mistaken, prompt-injected, over-permissioned or compromised.

| Threat | Required control |
|---|---|
| Prompt injection tells Hermes to call a broader tool | Server scope/purpose/schema enforcement; model reasoning grants nothing |
| Tool-description poisoning or annotations | Static server-owned descriptions; annotations never authorize |
| Stolen Hermes token store | Short access TTL, rotated refresh token, audience/client/connection binding, immediate revoke |
| Browser session copied to Hermes | Prohibited; OAuth boundary only |
| Cross-agent/profile confusion | One connection record per user-approved instance; Hermes profile name is metadata only |
| Replay/duplicate handoff | Single-use token, TTL and idempotency key |
| Personal data retained in Hermes transcript | Minimized output, explicit consent/disclosure, body scopes deferred |
| Tool chaining exfiltrates LinguistPro output elsewhere | Return minimum data; warn that host controls downstream flow; no raw private content v0 |
| Duplicate reminders | No delivery scope in v0; later LinguistPro daily claim owns delivery |
| Agent claims mastery/grade in prose | Outputs contain canonical codes only; client prose is untrusted and cannot write truth |

Immediate stop conditions for any later pilot:

- cross-user or wrong-connection data;
- raw session cookie/CSRF/API secret in Hermes config, skill, logs or prompt;
- unexpected private content/tool result persistence;
- duplicate official notification or canonical write;
- any external path to grading/FSRS/mastery/consent/profile mutation;
- OAuth audience/scope/revocation failure;
- Agent Access bypasses CP0 or S0 rate/load gates.

## 15. Revised staged roadmap

Use vendor-neutral names; Hermes is the first compatibility target.

### AA0 — personal Hermes usability experiment

**May proceed separately only after explicit owner authorization.** No LinguistPro code/API/auth changes:

- a local personal skill describing system-of-record boundaries;
- first-party deep links;
- one owner-controlled daily workflow with duplicate nudge disabled/avoided;
- a structured diary: task, time saved, mistaken claims, unwanted reminders, privacy/cost friction;
- no secrets, scraping, browser-cookie export or canonical action.

Engineering exit: reviewed no-secret skill/deep-link package, duplicate-notification policy and diary contract. The 14-day/20-use usability window becomes `LIVE_EVIDENCE_DEFERRED`: it informs prioritization and remediation but does not block AA1 or AA2 engineering.

### AA1 — Agent Access contract and OAuth/security design

Docs/schema/threat-model work may run in parallel with S3/F1. It does not change runtime.

Exit: exact tools/scopes/output schemas, authorization-server decision, consent copy, connection lifecycle, CP0 mapping, load/deletion/support gates.

### AA2 — owner-only read-only MCP reference implementation

Default-off engineering starts after:

- S3 is at least `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` for existing scenarios;
- separate implementation/migration/deploy authority;
- approved AA1 OAuth/resource-server/tool/schema/threat-model contract;
- Agent Access scenarios are added to CP0 before any live enablement;
- fixture/loopback OAuth and MCP clients can prove behavior without external user data or real provider spend.

Tools: learning brief, due summary, public search, explanation metadata and app handoff. Hermes is the first tested client; at least one second MCP client must pass contract tests before claiming vendor neutrality.

AA2 may be implemented, migrated and deployed default-off without completed S3-O. It may not accept a live Hermes/other external connection until an AA2 launch packet proves OAuth subject/audience/scope/connection binding, consent, tenant isolation, CP0 coverage, rollback and downstream-retention copy. Later S3-O findings are remediated against AA2 before its live promotion; critical authority/privacy/canonical-write findings keep the AA2 live switch off but do not erase already-green unrelated engineering.

### AA3 — propose-first in-app intents

Add lesson-intent handoff and later other reversible proposals after AA2 engineering gates. AA3 may also reach `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` behind default-off flags using contract/loopback clients. No durable lesson or managed model spend from the external call. Live mutation-like intent issuance remains separately gated and user-confirmed in LinguistPro.

### AA4 — connected agents product

The AA4 public/premium product may be engineered after AA2/AA3 engineering completion and the required S7 tenancy/FinOps/audit/support contracts and implementation. This includes connection management, consent UX, quotas, audit, revoke, incident/support paths and client registration behind default-off/allowlisted gates. Public enablement still waits for S7 operational readiness, external-agent abuse tests and resolution of critical deferred S3/AA2/AA3 findings. A measured owner pilot is desirable evidence, not a reason to freeze engineering when it is unavailable.

### 15.1 Engineering and promotion state model

Every AA stage uses the same non-conflating status ladder:

| Status | Meaning | May unblock |
|---|---|---|
| `CONTRACT_APPROVED` | Exact scope, schemas, threats, tests and rollback accepted | That stage's implementation packet |
| `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` | CI/fixture/load/lifecycle green and runtime deployed default-off; unavailable real-use evidence recorded as debt | Next default-off engineering stage |
| `LIVE_READY` | Exact owner/allowlisted launch gate, credentials/scopes/consent/rollback and critical remediation green | Bounded live enablement only |
| `PUBLIC_READY` | S7 operational controls, public abuse/support/incident gates and required evidence green | Staged public cohort after separate owner approval |

Engineering completion never self-promotes a switch. Conversely, lack of a currently feasible live window does not force the codebase to stop evolving.

### 15.2 Full AA dependency chain

| Stage | Engineering entry | Engineering exit | Live/public dependency |
|---|---|---|---|
| AA0 | Exact local Hermes host/profile/channel and reviewed no-secret package | Skill/deep links/notification policy/diary ready | 14-day/20-use evidence deferred if unavailable |
| AA1 | Agent Access direction approved | OAuth topology, scopes, tools, schemas, consent, lifecycle, threat/load/support contract approved | None; documentation stage |
| AA2 | S3 engineering-complete + AA1 contract + separate execution authority | Read-only Agent Access Service + thin MCP adapter + OAuth/resource boundary + CP0 tests deployed default-off | Exact owner connection and live evidence separately gated |
| AA3 | AA2 engineering gates green | Reversible intent/handoff tools, idempotency/audit/user-confirmation tests deployed default-off | Live intents separately gated; no silent publication |
| AA4 | AA2/AA3 engineering green + AA4-required S7 capabilities and any proven prerequisite slices | Connected-agent management, quotas, audit, revoke, consent UX, support/incident controls deployed default-off | Public enablement needs `PUBLIC_READY` and explicit cohort approval |

No stage may use deferred evidence to weaken schemas, tenant boundaries, deterministic truth or rollback. Deferred findings are attached to the first affected stage and must be closed before that stage's live/public promotion.

## 16. Effect on the current development direction

The idea **activates the previously deferred external-interoperability design trigger**, because a concrete client and owner use case now exist. It does not overturn the current foundation or reorder the core product around Hermes.

Recommended priority:

```text
single-owner critical path:
S3 execution authorization
  → CP0 implementation / CI + zero-real-provider synthetic
  → healthy default-off deploy
  → S3 ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED
  → F1 correctable continuity design / implementation / evidence
  → AA2 read-only Agent Access engineering / default-off deploy
  → AA3 propose-first engineering / default-off deploy
  → AA4-required S7 tenancy/FinOps/ops engineering
     (plus only those S4–S6 prerequisites proven necessary by the S7 contract)
  → AA4 connected-agents product engineering / default-off deploy

parallel evidence/design path:
AA0 no-secret package + deferred 14-day/20-use evidence
AA1 Agent Access / OAuth / tool-schema / threat-model contract
deferred S3-O and AA owner-live windows → remediation/re-run

dependency note:
S3/AA live evidence gates live enablement and promotion, not default-off engineering;
AA2 stays after F1 by scheduling default, not by technical prohibition

public promotion:
S7 operational readiness + critical deferred findings resolved → staged AA4 enablement
```

Why F1 remains ahead of public Agent Access:

- correctable learner continuity is core pedagogical value/moat;
- Agent Access without mature memory/authority only exports thin summaries;
- public agent auth/support/privacy adds platform burden before learning value is proven;
- owner AA0 can validate orchestration demand without delaying the core.

The roadmap therefore carries the **entire AA engineering track**, while keeping engineering completion distinct from live readiness and public promotion.

## 17. R1–R17 adversarial critique

| Role lens | Attack on Agent Access | Required resolution |
|---|---|---|
| R1 | Hermes may phrase a derived statement as authoritative Hebrew fact. | Return source/authority codes; no resolver-overriding prose or external linguistic writes. |
| R2 | Cross-app convenience may optimize reminders/tool calls rather than learning. | AA0 diary and later outcome gates track started/completed reading/review, not agent activity. |
| R3 | OAuth/connection/tool IDs may create decorative lineage. | S2 typed references and S3 CP0 correlation; no ambient chat history as graph truth. |
| R4 | Agent-generated links/errors can create dead ends. | Single-use first-party handoffs, stable codes and later mobile/RTL owner verification. |
| R5 | “Connect any agent” can become generic AI-OS marketing. | Narrow language-learning system-of-record positioning and five bounded tools first. |
| R6 | Personal-library search can silently become ungoverned ingestion. | Public catalog only v0; private materials require S6 lifecycle and exact consent. |
| R7 | Hermes/model/provider changes can alter tone/register invisibly. | LinguistPro returns facts/codes; client rendering is labeled external and never truth. |
| R8 | Remote lesson creation can persist scaffolding or overload. | Intent handoff only; in-app user confirmation and existing bounded Lesson Builder. |
| R9 | Agent memory may be mistaken for learner truth. | Hermes memory is external untrusted context; `review_log`/graph remain canonical. |
| R10 | A successful Hermes demo may be generalized to all clients/users. | Second-client contract test, AA0 measured diary and staged owner-only pilot. |
| R11 | Hermes and LinguistPro could self-certify each other's output. | Deterministic contract/security oracles; no external prose as grade/evidence. |
| R12 | MCP handlers may bypass controller/repositories. | Thin adapter over Agent Access Service; no direct DB/repository exposure. |
| R13 | OAuth/MCP rollout may break first-party sessions or canonical writes. | Separate auth boundary/flags, CP0 parity, owner allowlist and disable-only rollback. |
| R14 | External tokens/profile/session keys may cross tenants. | Subject/audience/client/connection binding and negative tests; profile names never authorize. |
| R15 | Read-only outputs may persist indefinitely in Hermes sessions. | Separate recipient consent, minimized outputs, prune guidance and honest revoke limitation. |
| R16 | Agent polling/model rendering can amplify cost and load. | Deterministic tools, TTL/cache, quotas by connection/tool and no managed LLM spend v0. |
| R17 | External agent could grade or replay answers. | No answer/item/expected-form tools; external grade/review scopes permanently prohibited. |

### Synthesis

The strategic opportunity is real because the external-interoperability boundary is now concrete. The safe product is not “LinguistPro inside Hermes”; it is a narrow user-authorized Agent Access surface whose first compatibility test happens to be Hermes.

## 18. Owner decisions

### Decision 1 — product position

- **A — LinguistPro system of record; Hermes is the first untrusted user-owned orchestration client (recommended).**
- **B — Hermes becomes the main mentor/backend:** transfers core authority and runtime control; reject.
- **C — no external-agent direction:** lowest burden but gives up a credible interoperability/usefulness experiment.

### Decision 2 — architecture boundary

- **A — vendor-neutral Agent Access Service with thin MCP/other adapters (recommended).**
- **B — implement business logic directly in MCP handlers:** protocol lock-in and policy duplication.
- **C — expose existing HTTP endpoints/repositories mechanically:** preserves browser-auth and authority mismatches.

### Decision 3 — immediate pilot

- **A — AA0 personal Hermes skill/deep-link/diary experiment with no private API or secrets (recommended).**
- **B — build remote MCP immediately:** jumps over S3/OAuth/consent evidence.
- **C — postpone even personal testing:** loses cheap demand evidence.

### Decision 4 — remote authentication

- **A — proper OAuth resource-server boundary with PKCE, audience/scopes/connection binding and revoke before AA2 (recommended).**
- **B — permanent personal API token:** simpler but poor rotation/scope/audit and weak product migration path.
- **C — give Hermes browser cookie/CSRF:** reject.

### Decision 5 — initial data surface

- **A — aggregates, public corpus metadata, explanation metadata and short-lived handoffs only (recommended).**
- **B — include personal library/explanation bodies:** high downstream-retention risk before consent/lifecycle proof.
- **C — deep links only forever:** safe but misses the main orchestration value.

### Decision 6 — reading capability

- **A — expose public search now; defer learner-specific recommendation until server/device-selection parity exists (recommended).**
- **B — name the current server explanation route a recommender:** false authority.
- **C — move all device state to server now:** scope expansion unrelated to the first pilot.

### Decision 7 — Lesson Builder bridge

- **A — create a short-lived lesson-intent handoff; user triggers the existing in-app builder (recommended).**
- **B — add durable server drafts/status now:** violates current lifecycle boundary.
- **C — allow Hermes to return its own lesson as LinguistPro output:** bypasses validator/provenance.

### Decision 8 — notification ownership

- **A — no official external delivery scope in v0; later delivery must use LinguistPro eligibility/daily claim/receipt (recommended).**
- **B — let Hermes cron independently send official nudges:** duplicate/fatigue/audit risk.
- **C — disable first-party notifications for the whole product:** unnecessary.

### Decision 9 — external retention and consent

- **A — separate connected-agent consent/scopes with explicit downstream-retention and revoke limitations (recommended).**
- **B — reuse `agent_read_texts`/browser consent:** copy does not describe an external recipient/session store.
- **C — rely on Hermes security/profile isolation:** client controls cannot replace server consent.

### Decision 10 — roadmap placement

- **A — implement the full AA0→AA4 engineering chain behind staged default-off gates; S3/AA live evidence is deferrable for engineering but mandatory before corresponding live/public promotion; AA4 enablement waits for S7 (recommended).**
- **B — make Agent Access the next critical-path implementation:** delays core continuity for platform work.
- **C — wait until after all S4–S7 even for docs/personal experiment:** misses low-risk evidence now.

## 19. Recommended owner resolution

Approve **A/A/A/A/A/A/A/A/A/A**:

1. Hermes is the first external orchestration client, never the pedagogical core.
2. Agent Access is vendor-neutral; MCP is a thin adapter.
3. Start with a no-secret personal AA0 experiment only after separate execution approval.
4. Require OAuth/PKCE/scopes/audience/connection/revoke before remote AA2.
5. v0 exports aggregates, public metadata, explanation metadata and handoffs only.
6. Do not claim server learner-specific reading recommendation until parity exists.
7. Use lesson-intent handoff, not durable remote drafts.
8. Do not let Hermes bypass LinguistPro notification fatigue/claim policy.
9. Treat each connected agent as a separate external data recipient.
10. Implement the full AA0→AA4 engineering track after its sequential contracts/gates; deferred live evidence does not block code/default-off deployment, but critical findings must be remediated before live/public promotion.

## 20. Exact next gates

### 20.1 After decision approval

Approval of this packet permits only:

- recording the AA roadmap direction in planning canon;
- preparing sequential AA0/AA1/AA2/AA3/AA4 execution packets;
- beginning AA1 OAuth/tool/schema/threat-model documentation under its docs-only boundary;
- no live connection, credential, skill install, API or code.

### 20.2 Before AA0 execution

- owner approves the exact Hermes host/profile/channel;
- no-secret skill contents and deep-link allowlist are reviewed;
- duplicate LinguistPro/Hermes notification policy is selected;
- diary fields, deferred 14-day/20-use evidence and stop conditions are locked;
- Hermes session retention/prune choice is explicit.

### 20.3 Before AA2 default-off implementation

- S3 is at least `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`;
- exact Agent Access schemas/scopes/consent copy and OAuth topology are approved;
- migration/export/delete/restore/rate/abuse/support design is approved;
- CP0 mapping for new external-agent scenarios is specified and implemented before live enablement;
- global default-off flag/allowlist/rollback and fixture/loopback second-client contract test are specified;
- separate implementation and deployment authority is granted.

### 20.4 Before AA2 or AA3 live enablement

- separate owner launch approval names the exact client/profile/scopes and rollback;
- OAuth negative, tenant isolation, consent/revoke, downstream retention, rate/abuse and CP0 gates pass;
- critical deferred S3 findings affecting Agent Access are resolved;
- live evidence is collected when feasible and every finding enters the remediation ledger.

### 20.5 Before AA4 public enablement

- AA2/AA3 engineering is complete and their critical findings are resolved;
- required S7 tenancy, quotas/FinOps, audit, purge, incident and support controls are operational;
- public OAuth client lifecycle, consent UX, abuse tests, rollback and staged cohort gates are approved;
- default-off engineering completion alone is never represented as public readiness.

## 21. Explicitly prohibited by this packet

- No Hermes installation/configuration/skill/cron or credential mutation.
- No MCP server, endpoint, SDK dependency or schema file until a separately approved AA2 execution packet.
- No OAuth/token/client/connection table or migration until that same separate authority.
- No browser cookie/CSRF/shared-token export to Hermes.
- No personal text/library/explanation-body egress.
- No durable lesson draft, remote build/status or publication.
- No external grading/review/FSRS/mastery/linguistic/consent/profile/delete write.
- No duplicate official notification path.
- No live/public Agent Access enablement merely from this roadmap amendment.
- No commit/push before owner approval of this packet; the recorded A/A/A/A/A/A/A/A/A/A approval now permits this documentation-only commit.

## 22. Source map

Repository sources inspected:

- `CLAUDE.md`; `docs/PROJECT_ROLES.md`.
- owner-approved Wave 2 replan and S0/S1/S2/S3 packets.
- `docs/planning/ai_agent_education_strategy_2026_07_11/02_STATE_OF_THE_ART_2026.md`.
- `docs/planning/ai_agent_education_strategy_2026_07_11/06_TARGET_AGENT_PLATFORM.md`.
- `docs/planning/ai_agent_education_strategy_2026_07_11/12_OPERATIONAL_PLAN.md`.
- `docs/planning/ai_agent_education_strategy_2026_07_11/19_AGENT_CONTROL_PLANE_DESIGN.md`.
- Live agent runtime/tools/model gate, Lesson Builder, next-text, reviewer/grader, Telegram/Mini App, notification, identity/consent, handoff, artifact and learner repositories/routes.
- Live Mentor Home/Reading Room client integration showing device-side next-text selection, OPFS source discovery and browser-only 24-hour lesson draft.

Official external sources are linked in §2. No community post or vendor marketing claim is used as architectural authority.

No `.claude/PROD_OPS_PRIVATE.md` or private production data was opened. Unrelated `.agents/` and `docs/research/edu-quality-agentic/` remain untouched.
