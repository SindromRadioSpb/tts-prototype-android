# LinguistPro Wave 2 — S2 Typed Artifact, Context and Handoff decision packet

**Date:** 2026-07-16
**Status:** `OWNER_APPROVED`; S2 contract direction A/A/A/A/A/A/A/A/A is canonical. Documentation and contract design only.
**Authority:** S2 only. No production code, schema/registry file, migration, API/UI/config, provider, deployment, background job, S3 enforcement, durable memory or material ingestion is authorized.
**Owner approval:** 2026-07-16 — Decisions 1–9: A/A/A/A/A/A/A/A/A. This approval closes S2 and permits S3 CP0 observe-only run-envelope, parity, storage/TTL, rollout and rollback design; it does not authorize S3 implementation or enforcement.
**Repository baseline:** `main` / `c778eba`; package `3.11.183`; `origin/main` aligned after the owner-approved S1 push.
**Predecessors:** owner-approved S0 B/B/B/B/B and owner-approved S1 A/A/A/A/A/A/A/A/A.
**S2 exit gate inherited from Wave 2:** every proposed handoff must be reproducible or verifiable from typed IDs, source/policy versions and content-safe manifests without persisting raw prompt content.

## 1. Executive recommendation

Adopt a **two-layer typed handoff contract**:

1. a small common envelope defines identity, schema, role/scenario, authority, data class, source/provenance references, policy/model route, retention and parent/child lineage;
2. each artifact type owns a closed scenario payload schema with `additionalProperties=false`, explicit bounds and a version;
3. raw selected text, prompt packets, answers, submissions and provider output remain transient unless the output is an explicitly approved user-visible product artifact such as an explanation or lesson draft;
4. operational persistence stores a content-free manifest: opaque IDs, source revision references, kinds, counts, byte sizes, versions, keyed digests, decision/error codes and lifecycle timestamps;
5. exact replay is promised only while an immutable or retained source revision exists and current consent still permits the read;
6. after source drift, consent revocation or deletion, the system may prove identity/integrity from allowed metadata but must not resurrect erased content;
7. deterministic grade candidates and canonical append commands remain separate typed handoffs;
8. S3 may observe these contracts in shadow, but S2 creates no tables, runtime envelope or enforcement.

This resolves a tension in the earlier wording. “Reproducible” cannot honestly mean permanent recovery of private content after deletion. S2 therefore distinguishes exact replay, authorized rebuild, audit verification and privacy tombstone instead of retaining raw prompts to make an audit look complete.

## 2. Epistemic labels

- **`VERIFIED_LIVE`** — the current code emits or persists the stated field/invariant.
- **`VERIFIED_PARTIAL`** — a useful mechanism exists, but it is not a complete typed S2 contract.
- **`EPHEMERAL_LIVE`** — the value exists during a request/session and is intentionally not durable.
- **`ABSENT`** — no live mechanism was found.
- **`PROPOSED_CONTRACT`** — the S2 target contract; no implementation authority.
- **`BLOCKED_BY_LIFECYCLE`** — exact replay cannot be guaranteed until a later approved revision/lifecycle capability exists.
- **`PROHIBITED`** — the field/content must not be persisted or used for authority.

Live code outranks dated design prose. Proposed control-plane schemas are inputs, not evidence that a runtime envelope already exists.

## 3. Replay and verification vocabulary

| Mode | Meaning | Permitted evidence | Failure/terminal state |
|---|---|---|---|
| `EXACT_REPLAY` | Rebuild identical canonical inputs under the same schema/policy versions | Immutable or retained source revision plus canonicalizer and versioned registries | `SOURCE_REVISION_UNAVAILABLE`, `CONSENT_REVOKED` |
| `AUTHORIZED_REBUILD` | Re-read an authorized source and accept it only if the new canonical digest matches the manifest | Source ref, revision marker, live consent, keyed digest | `SOURCE_DRIFT`, `SCOPE_DENIED` |
| `AUDIT_VERIFY_ONLY` | Compare supplied/available content to an old content-safe digest; do not recover the old value | Manifest, keyed digest, key ID and metadata | `CONTENT_UNAVAILABLE` is honest success state for privacy |
| `PRIVACY_TOMBSTONE` | Preserve only allowed lineage/reason fields after revoke/delete | Artifact ID, type, timestamps, purge reason and non-content authority refs | No replay or provider egress |

No handoff may silently downgrade from exact replay to “use current data.” A changed source, resolver, policy or model route creates a new artifact/run identity.

## 4. What exists today

| Live object | Status | Useful current contract | S2 gap |
|---|---|---|---|
| Authenticated API intent | `VERIFIED_PARTIAL` | Principal is server-derived; endpoints bound fields and reject malformed input | No common request/workflow/schema ID or request ID across scenarios |
| Tool call | `VERIFIED_PARTIAL` | Closed name registry; principal-derived `userId`; some physical caps | No role/scenario/tool version, strict per-tool schema, command ID or input/output digest |
| LLM prompt packet | `EPHEMERAL_LIVE` | Scenario modules separate system text and JSON data; prompt is not logged | No context-pack ID, template version/hash or item-level manifest |
| LLM usage ledger | `VERIFIED_PARTIAL` | Pre-call reservation for managed use; scenario/provider/status/units | No run/step, route-policy, model snapshot, prompt/context/output digest or validator version |
| Plan task | `VERIFIED_PARTIAL` | Opaque `at_` ID; identifier-only payload; user scope | Payload is open JSON without schema/policy/source lineage; no command ID |
| Explanation/material history | `VERIFIED_PARTIAL` | Opaque `ae_` ID, `facts_used`, model/body, source anchors, purge tombstones | Mixed free JSON; facts can contain content; no artifact/schema/route/prompt-validator versions |
| Lesson draft | `VERIFIED_LIVE` | UUID, schema/policy version, expiry, source refs/maps, resolver/keyer/model and validation diagnostics | Client-only artifact has no common envelope/context manifest or source revision digest |
| Role-play session | `EPHEMERAL_LIVE` | Server-owned RAM session, selected anchor and bounded transcript | No typed session/context manifest; exact old source revision not guaranteed |
| Writing/comprehension output | `EPHEMERAL_LIVE` | Bounded request, deterministic eligibility and response validator | No artifact ID/schema/provenance receipt |
| Review challenge | `VERIFIED_LIVE` | Server-owned ID, item/mode/scope, expected/stimulus provenance, attempt binding and TTL | Schema is table-shaped, channel-specific and unversioned as an artifact |
| Grade candidate | `EPHEMERAL_LIVE` | Deterministic verdict with policy/normalizer/resolver provenance | No artifact ID or explicit input lineage; correctly not independently persisted |
| Canonical review event | `VERIFIED_LIVE` | Stable event ID, item, grade, channel, policy/grader/resolver metadata and append-only correction | Handoff command is implicit in attempt/ingest keys; no common command envelope |
| Reading handoff token | `VERIFIED_LIVE` | Opaque hashed, user-bound, single-use capability with exact anchor and TTL | Transport capability is not a pedagogical artifact; no schema version |
| Notification claim/action | `VERIFIED_PARTIAL` | Deterministic reason/channel/day claim and content-safe action codes | No common decision/delivery artifact lineage or policy version |
| Run/context manifest | `ABSENT` | None | Required for S3 observation; must remain content-free |

## 5. Common artifact envelope

Every S2 artifact uses a conceptual envelope like this:

```json
{
  "artifact_id": "art_opaque_server_id",
  "artifact_type": "mentor.context_manifest.v1",
  "schema": {"id": "lp.mentor.context_manifest", "version": "1.0.0"},
  "role": {"id": "mentor.explainer", "version": "1.0.0"},
  "scenario": {"id": "explain_sentence", "version": "1.0.0"},
  "principal_scope_ref": "server_scoped_ref",
  "authority": "DERIVED",
  "data_classes": ["A", "C_SELECTED", "D_TRANSIENT"],
  "created_at": "2026-07-16T00:00:00.000Z",
  "expires_at": "2026-07-16T00:15:00.000Z",
  "parent_artifact_ids": ["art_request"],
  "source_refs": ["src_anchor"],
  "policy_refs": {
    "role_registry": "role-registry.1.0.0",
    "workflow": "explain_sentence.1.0.0",
    "consent_snapshot": "hmac:key-1:...",
    "route_policy": "mentor_advisory.1.0.0"
  },
  "content_descriptor": {
    "persistence": "MANIFEST_ONLY",
    "canonicalizer": "lp-cjson-v1",
    "bytes": 712,
    "digest": "hmac-sha256:key-1:..."
  },
  "retention_class": "EPHEMERAL_REQUEST",
  "payload": {}
}
```

This is a paper contract. S2 creates no JSON registry or runtime wrapper.

### 5.1 Envelope invariants

1. `artifact_id` is a server-generated opaque ID, never a raw user ID or private-content hash.
2. Schema, role and scenario identifiers are immutable for the artifact.
3. `principal_scope_ref` is added from authenticated context and is not accepted from model/tool payloads.
4. Authority is one of `ASSERTED`, `DETERMINISTIC_POLICY`, `USER_SUBMITTED`, `DERIVED`, `PROBABILISTIC_UNTRUSTED` or `TRANSPORT_ONLY`.
5. Parent/source references form lineage, not authority inheritance.
6. Unknown envelope or payload fields fail validation.
7. An artifact cannot widen the data class, role capability, retention or publication gate of its parent.
8. Expiry is semantic: an expired context/capability cannot be revived by copying its JSON.

## 6. Identity, canonicalization and digest contract

| Concern | S2 contract |
|---|---|
| Private artifact identity | Random/opaque server ID; never content-addressed across users |
| Public immutable corpus identity | Corpus/work/text/row or segment ID plus registry/revision version; plain content digest allowed |
| Private content equality | HMAC-SHA-256 under a per-user derived key with declared `key_id`; no global/service-wide equality namespace and no unsalted plain digest |
| Canonical bytes | `lp-cjson-v1`: UTF-8, Unicode NFC strings, lexicographically sorted object keys, arrays preserved, no undefined/NaN/infinity, timestamps UTC-Z |
| Key rotation | New manifests use the new key; old `key_id` remains resolvable only for its approved retention window |
| Deletion | Digests are user-scoped lifecycle data and are deleted with the account; revoke erases private-content digests/context refs when their consent scope is purged and leaves only the permitted non-content tombstone |
| Logging | IDs, type, versions, counts and error codes only; no content, capability token, raw digest key or provider body |

A digest proves equality to bytes supplied later; it does not make deleted content recoverable and is not encryption.

## 7. Typed artifact catalog

| Artifact type | Producer → consumer | Authority | Persistence | Required core fields |
|---|---|---|---|---|
| `mentor.request_intent.v1` | authenticated surface → controller | `USER_SUBMITTED` intent only | Request | request ID, scenario, bounded intent, client deadline |
| `mentor.policy_decision.v1` | policy controller → scenario | `DETERMINISTIC_POLICY` | Manifest/observe | allow/deny code, role/scenario/policy/consent/budget refs |
| `mentor.source_anchor.v1` | scoped reader → context builder | source-dependent | Manifest | source kind/scope/revision/anchor/license/authority |
| `mentor.context_pack.v1` | context builder → model/role | mixed, item-level | Transient | purpose, items, bounds, consent/expiry and manifest ID |
| `mentor.context_manifest.v1` | context builder → audit/S3 | no pedagogical authority | Content-free manifest | item kinds/counts/source refs/versions/bytes/keyed digests |
| `mentor.model_call_receipt.v1` | model gateway → validator/ledger | `PROBABILISTIC_UNTRUSTED` | Content-free receipt | route/provider/model/template/context/reservation/attempt/status/units |
| `mentor.validation_result.v1` | deterministic validator → controller | `DETERMINISTIC_POLICY` | Manifest or product diagnostics | schema/validator versions, codes, accepted/rejected |
| `mentor.advisory_output.v1` | content role → renderer/product artifact | `DERIVED` | Scenario retention | source/context/model/validator lineage, publication state |
| `mentor.plan_task.v1` | planner → mentor home/history | `DERIVED` | 30d target | sections by IDs, reason/category, source snapshot refs |
| `mentor.explanation.v1` | explainer/material advisor → history/follow-up | `DERIVED` | 180d target/tombstone | bounded body, fact refs with authority, anchor, route/validator lineage |
| `mentor.lesson_draft.v1` | lesson composer → client draft | `DERIVED` | Client ≤24h | existing LB schema plus common lineage/context manifest refs |
| `mentor.dialogue_session.v1` | dialogue coach → same session | `DERIVED` | RAM ≤30m | session ID, anchor/source revision, turn counter, transcript digest only |
| `mentor.review_challenge.v1` | selector → grader | `DETERMINISTIC_POLICY` | TTL | challenge/item/mode/scope/expected/stimulus/attempt/surface binding |
| `mentor.grade_candidate.v1` | grader → review writer | `DETERMINISTIC_POLICY` | In-memory handoff | challenge/attempt/input digest, verdict, policy/normalizer/resolver versions |
| `mentor.append_command.v1` | controller/writer → canonical repository | command, not truth | Idempotency retention | command ID, input digest, target writer, expected artifact refs |
| `mentor.review_event_ref.v1` | canonical repository → controller | `ASSERTED` canonical ref | Account lifetime | review row ID, item, kind, provenance/version refs; no duplicate truth body |
| `mentor.delivery_decision.v1` | notification policy → delivery | `DETERMINISTIC_POLICY` | Operational | reason/channel/local-day/claim/policy/consent refs |
| `mentor.delivery_receipt.v1` | channel adapter → audit | `TRANSPORT_ONLY` | Operational 30d target | decision ID, channel, outcome code, provider message ref if safe |
| `mentor.degradation.v1` | any boundary → renderer | no pedagogical authority | Request/manifest | terminal code, failed boundary, fallback class, retryability |

Reserved S1 roles may not emit active artifacts. Their future schema namespaces may be named, but status remains `RESERVED_DISABLED` and publication is prohibited.

## 8. Source and revision references

| Source kind | Minimum reference | Exact-replay status |
|---|---|---|
| Personal synced text | owner-scoped `artifact_key`, text `updated_at`, row/window anchor, canonical payload/selection HMAC | `BLOCKED_BY_LIFECYCLE`: current LWW row overwrites old payload and has no immutable revision ID |
| Public corpus text | corpus, work ID, text key, row/order anchor, corpus registry/shard version and public digest | Exact if the referenced corpus revision remains addressable |
| Resolver fact | item key/analysis ID, resolver/keyer/model versions, asserted/derived authority | Exact if the versioned resolver artifact remains available |
| Review history | canonical review event IDs plus projection policy/reducer version | Canonical replay comes from `review_log`; projection row alone is never sufficient |
| Learner summary | ordered input event/artifact refs, cutoff instant, reducer/policy version and output HMAC | Rebuildable only from retained canon; never an authority shortcut |
| Device coverage/frontier | device/session ref, algorithm/data version, measured-at and digest | Derived estimate; server must not relabel as asserted learner truth |
| Direct user submission | request/session artifact ID, byte count/HMAC, purpose | Transient; audit-verify only after response unless user explicitly saves a product artifact |
| Profile/consent | authenticated record/version or ordered record IDs and snapshot HMAC | Re-read at action time; old approval never authorizes a later action |

### 8.1 Private source revision decision

S2 declares the logical `source_revision_ref` now but does not create revision storage. Until a later owner-approved lifecycle slice supplies immutable private revisions, a personal-text handoff must:

1. record `artifact_key`, `updated_at`, bounded anchor and keyed selection digest;
2. rebuild only while live consent permits it;
3. compare the rebuilt digest and return `SOURCE_DRIFT` on mismatch;
4. never retain raw text merely to satisfy replay;
5. label exact historical replay `BLOCKED_BY_LIFECYCLE`.

## 9. Context-pack contract

Each context item declares:

- `context_item_id` unique inside the pack;
- `kind` from a closed scenario allowlist;
- `source_ref` and source revision/version;
- `authority` and `trust` (`trusted_policy`, `asserted_source`, `derived`, `untrusted_user_content`, `probabilistic_untrusted`);
- `data_class`, purpose and recipient route;
- physical bounds: rows/items/bytes;
- `instructional=false` for all learner/material/provider content;
- transient `value` plus a durable-safe descriptor/digest.

The system template is selected from code by template ID/version. User/material content is serialized only in a separate data block and cannot supply system instructions, role IDs, tools, routes, consent or publication decisions.

### 9.1 Persistence rule

Default behavior is:

| Layer | May contain raw selected content? | Retention |
|---|---:|---|
| In-memory context pack | Yes, bounded and consented | Request/session TTL only |
| Provider request | Yes, only approved projection | Provider route policy; no local persistence |
| Operational context manifest | No | S1 operational/derived class |
| User-visible derived artifact | Only the approved output needed for the feature | S1 scenario retention and purge/tombstone rules |
| stdout/errors/metrics | No | Content-free only |

No default “debug mode” may persist raw context or provider output. A future content-bearing evidence capture requires a separate owner decision, encryption, allowlist, access controls and ≤24h TTL; it is not authorized by S2.

## 10. Model-call and validation receipts

A content-free model receipt must carry:

- run/step or observation ID;
- role/scenario/workflow versions;
- route-policy version, provider, model snapshot, adapter and schema mode;
- system-template ID/version/digest;
- context-manifest ID/digest and item-kind counts;
- consent snapshot and budget reservation references;
- attempt ordinal, start/finish, latency bucket, input/output unit and byte counts;
- output keyed digest, output schema and validator versions;
- terminal status/error class and whether deterministic fallback was used;
- key source `managed|byok` without key material.

Provider bodies, API keys, raw prompt/output and low-level error payloads are prohibited. A repair is a second attempt under the same logical scenario/run, not silent replacement; the first rejection codes remain observable.

## 11. Scenario handoff map

| Scenario | Required chain | Durable product artifact | Canonical write? |
|---|---|---|---:|
| Plan | request → policy → learner-summary manifest → optional model receipt → validation → plan task | plan task 30d target | No |
| Explain sentence/word | request → source anchor + resolver refs → context → model receipt → validation → explanation | explanation 180d target | No |
| Explain follow-up | request references explanation ID → rebuild source/context → model receipt → ephemeral response | existing explanation counter only | No |
| Comprehension | request → selected window → context → model receipt → validated question set | None | No |
| Role-play/writing | request/session → selected source/targets → context → per-turn receipt → advisory response | RAM session only | No |
| Study summary/retell | request → digest/window anchors → context → receipt → explanation/draft | explanation history where currently approved | No |
| Lesson Builder | request → 1–3 source anchors/maps → context → first/repair receipts → validator → lesson draft | client draft ≤24h | No |
| Next-text why | deterministic selection refs → context → receipt → advisory explanation | None | No |
| Review start | request → selector decision → review challenge | challenge TTL | No |
| Review answer | challenge + attempt → grade candidate → append command → review event ref | canonical event | Yes |
| Annul | direct user request + target event ref → deterministic eligibility → append command → annul event ref | canonical event | Yes |
| Profile update | authenticated direct intent → policy → user-asserted mutation receipt | profile row | User-asserted only |
| Proactive notification | deterministic decision/claim → delivery receipt | operational ledgers | No learner truth |

## 12. Handoff validation and failure rules

1. Producer and consumer schemas are both versioned; the controller validates at the boundary.
2. Unknown fields, unknown authority values, missing source refs and unbounded collections fail closed.
3. A consumer may read only the declared projection, not the producer's whole internal object.
4. Input artifact IDs and digests are immutable for one attempt.
5. Same ID plus different canonical digest is `IDEMPOTENCY_CONFLICT`.
6. Missing/changed source is `SOURCE_REVISION_UNAVAILABLE` or `SOURCE_DRIFT`, never “best current match.”
7. Consent is rechecked before source read, provider egress, derived persistence and canonical write.
8. Revocation during a call makes the returned candidate ineligible for persistence/delivery.
9. A validator can reject or classify; it cannot expand scope, authority or route.
10. A terminal denial cannot be converted into a wider context or different provider without a new authorized request.
11. Timeout/missing learner response cannot create a grade/review event.
12. Canonical append returns an event reference; derived consumers replay from canon, not from a copied state blob.

Stable boundary codes include `SCHEMA_INVALID`, `SCOPE_DENIED`, `CONSENT_REVOKED`, `SOURCE_DRIFT`, `SOURCE_REVISION_UNAVAILABLE`, `CONTEXT_EXPIRED`, `BUDGET_EXHAUSTED`, `PROVIDER_UNAVAILABLE`, `OUTPUT_INVALID`, `IDEMPOTENCY_CONFLICT`, `DEADLINE_EXCEEDED` and `DEPENDENCY_FAILED`.

## 13. Schema evolution policy

1. Schema identity is `<namespace>.<name>` plus semantic version.
2. Patch changes clarify validation without changing accepted canonical meaning.
3. Minor changes may add optional fields only when old consumers ignore them through an explicit adapter; closed wire schemas themselves still reject unknown fields.
4. Major changes alter required fields/meaning and require a new producer plus an explicit compatibility adapter or dual-read window.
5. Stored artifacts retain their original schema version; no in-place reinterpretation.
6. Adapters are named/versioned transformations with input/output digests and cannot promote authority.
7. Policy, resolver, canonicalizer, template, validator and route versions are separate references; changing one does not masquerade as a schema patch.
8. S3 observation compares current live result with the S2-shaped shadow manifest; it must not rewrite live responses.

## 14. S3 observe-only minimum

S2 recommends that the later S3 design observe, content-free:

- observation/run ID and request ID;
- role/scenario/workflow/schema/policy versions;
- source/context artifact IDs, kinds, counts, versions and keyed digests;
- consent snapshot reference and action-time recheck outcomes;
- tool/repository capability names and versions;
- route/provider/model/template/validator versions;
- budget reservation and attempt counts;
- output artifact ID/digest, publication/degradation decision and error code;
- canonical command/event refs where applicable;
- latency/unit/byte buckets and terminal status.

No S3 implementation is authorized here. S3 must separately decide storage, sampling, TTL, parity criteria, rollout, rollback and content-safety tests.

## 15. R1–R17 adversarial critique

| Role lens | Attack on S2 | Required resolution |
|---|---|---|
| R1 | A derived explanation can cite morphology without showing which resolver version asserted it. | Item-level authority/source refs; resolver facts remain `ASSERTED`, prose remains `DERIVED`. |
| R2 | Rich manifests can optimize trace completeness instead of learning value. | No trace-volume KPI; artifacts exist only for bounded learner scenarios and correction/safety. |
| R3 | IDs without typed relationships become decorative strings. | Parent/source refs have closed relation semantics; S3 must detect missing/orphan/cross-scope links. |
| R4 | Typed internal failures can still become dead-end UX. | Stable degradation codes require localized actionable rendering in later UI work. |
| R5 | A large artifact taxonomy can become a generic agent framework. | One common envelope, scenario payloads, existing controller; no event bus/service/agent society. |
| R6 | A source anchor could be misread as durable material ingestion. | Personal LWW and selected-source limits stay explicit; durable revisions/material lifecycle remain S4–S7. |
| R7 | Replaying with a different model can erase register/era behavior. | Route/model/template versions are immutable lineage; substitution creates a new artifact. |
| R8 | Persisting lesson context to aid replay creates permanent scaffolding. | Context remains transient; lesson draft stays client ≤24h and learner-gated. |
| R9 | Hashes/provenance labels can promote derived content to truth. | Authority is explicit and non-transitive; a digest proves bytes, not truth. |
| R10 | Paper schemas could claim reproducibility the LWW store cannot provide. | Private exact replay is labelled `BLOCKED_BY_LIFECYCLE`; S3 observes drift rather than hiding it. |
| R11 | Same code can generate and validate mutually flattering artifacts. | Deterministic validators prove contract only; shadow critic is not independent educational evidence. |
| R12 | Copying full objects between modules creates a second truth path. | Consumers receive typed projections/refs; canonical state remains `review_log` plus replayable reducers. |
| R13 | In-place schema upgrades can strand old clients or mutate history. | Immutable stored version, named adapters, dual-read/parity before enforcement, no S2 runtime change. |
| R14 | Global content hashes permit cross-user correlation/dictionary attacks. | Private digests use per-user derived keys; raw user ID never enters artifact IDs or exported telemetry. |
| R15 | “Audit replay” can become an excuse to retain revoked text. | Privacy tombstone outranks replay; no raw debug persistence; digests follow lifecycle/delete. |
| R16 | Receipts may record requests but not actual token/cost exposure. | Receipt separates reservation, attempts and actual units; S0 micro-dollar/token direction remains required later. |
| R17 | Persisting a grade candidate could let another path treat it as canon. | Grade candidate is an in-memory handoff; only writer append command can return canonical event ref. |

### Synthesis

The useful S2 unit is neither a raw prompt nor a generic event. It is a bounded typed artifact with explicit authority and lineage. Privacy deletion, canonical truth and deterministic grading remain stronger than replay convenience.

## 16. Owner decisions

### Decision 1 — artifact shape

- **A — common envelope plus closed scenario payload schemas (recommended):** consistent lineage without a generic untyped event bus.
- **B — one monolithic schema for every scenario:** simpler registry count, but accumulates nullable/ambiguous fields.
- **C — independent shapes with no common envelope:** preserves current drift and weakens S3 parity.

### Decision 2 — identity and digest

- **A — opaque server IDs; keyed private digests; public digests only for immutable public artifacts (recommended).**
- **B — content-address every artifact:** enables private cross-user correlation and leaks low-entropy content.
- **C — IDs without digests:** cannot prove drift/equality content-safely.

### Decision 3 — replay semantics

- **A — four explicit modes: exact, authorized rebuild, audit verify and privacy tombstone (recommended).**
- **B — promise exact replay forever:** requires retention that conflicts with deletion/consent.
- **C — always rebuild from current state:** silently rewrites history.

### Decision 4 — context persistence

- **A — transient raw context; durable-safe manifest only; no default raw debug capture (recommended).**
- **B — encrypted raw context for 24h by default:** increases breach/deletion surface before a demonstrated need.
- **C — no manifest:** S3 cannot establish parity or diagnose scope drift.

### Decision 5 — private source revisions

- **A — declare revision refs now, mark exact private replay blocked, fail on drift; defer storage to lifecycle authority (recommended).**
- **B — add immutable revision storage now:** implementation and material-lifecycle expansion outside S2.
- **C — treat `updated_at` as sufficient exact history:** false under current LWW overwrite.

### Decision 6 — provenance authority

- **A — item-level closed authority/trust vocabulary with non-transitive lineage (recommended).**
- **B — one artifact-level `trusted` boolean:** collapses asserted, derived, user and probabilistic evidence.

### Decision 7 — model receipts

- **A — content-free route/template/context/validator/budget receipt for every attempt, including repair and BYOK (recommended).**
- **B — keep scenario/provider/count only:** insufficient for route substitution, validation and cost audits.
- **C — persist raw prompts/responses for audit:** privacy and prompt-injection retention risk; reject.

### Decision 8 — schema evolution

- **A — immutable semantic versions plus named non-authority-promoting adapters and later parity window (recommended).**
- **B — mutate stored JSON to latest shape:** destroys original meaning and rollback evidence.
- **C — version endpoint only:** internal handoff drift remains invisible.

### Decision 9 — S3 observation scope

- **A — observe IDs/versions/kinds/counts/keyed digests/decisions/cost/latency only; content prohibited (recommended).**
- **B — sample raw content for easier debugging:** requires separate evidence-capture authority not present.
- **C — observe only errors:** cannot prove successful-path parity or scope containment.

## 17. Recommended owner resolution

Approve **A/A/A/A/A/A/A/A/A**:

1. Common envelope plus closed scenario payloads.
2. Opaque IDs and keyed private digests.
3. Exact replay, authorized rebuild, audit verify and privacy tombstone are distinct.
4. Raw context is transient; operational persistence is manifest-only.
5. Private revision refs are required, but exact historical replay stays blocked until lifecycle authority exists.
6. Provenance authority is item-level, closed and non-transitive.
7. Every model attempt gets a content-free receipt; raw prompt/output remains prohibited.
8. Schemas are immutable/versioned and adapters cannot promote authority.
9. S3 observes content-free parity only.

## 18. Exact S2 exit criteria for S3

S2 closes and S3 observe-only design may start only when:

1. The owner selects the artifact envelope and identity/digest model.
2. Replay modes and privacy-tombstone precedence are accepted.
3. Every live S1 scenario maps producer → typed handoff → consumer → persistence/publication gate.
4. Context items have source revision, authority, trust, data class, purpose, bounds and recipient route.
5. Model receipts capture route/template/context/validator/budget lineage without raw content.
6. Grade candidate, append command and canonical event reference remain distinct.
7. Private LWW replay limitations are explicitly accepted rather than hidden.
8. Schema compatibility and stable failure codes are adjudicated.
9. S3 content-free observation fields are selected.
10. The packet passes source-path, whitespace, structure and scope checks.
11. After owner approval, only the S2 documentation path is staged, committed and pushed.

S3 must then define the CP0 observe-only run envelope, parity metrics, storage/TTL, sampling, rollout, rollback and negative content-leak tests. S3 does not inherit authority to enforce roles/tools, create durable jobs, store raw prompts, implement memory or ingest materials.

## 19. Explicitly prohibited by S2

- No production artifact registry, JSON schemas, runtime envelope or tracing table.
- No migration, run/step/command table, durable queue or revision store.
- No raw prompt/context/provider-response persistence or stdout logging.
- No new provider/model, cross-provider fallback or critic promotion.
- No tool-router/repository refactor or capability-token implementation.
- No LLM grade, mastery, FSRS, profile/consent or canonical write authority.
- No permanent private-content hash usable across users.
- No durable lesson, personal corpus, OCR/media, embedding or memory extractor.
- No S3 observation/enforcement implementation.
- No commit/push until owner approval of this packet.

## 20. Source map

Primary sources inspected:

- `CLAUDE.md`; `docs/PROJECT_ROLES.md`.
- `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md`.
- `docs/planning/LINGUISTPRO_WAVE2_S0_SCALE_ENVELOPE_DECISION_PACKET_2026_07_16.md`.
- `docs/planning/LINGUISTPRO_WAVE2_S1_ROLE_AUTHORITY_REGISTRY_DECISION_PACKET_2026_07_16.md`.
- `docs/planning/ai_agent_education_strategy_2026_07_11/19_AGENT_CONTROL_PLANE_DESIGN.md`.
- Live `agent/runtime.js`, `agent/tools.js`, `agent/llmGate.js`, scenario modules, lesson contract, reviewer, grader and review-session modules.
- Live `db/agentRepo.js`, `db/agentSentenceRepo.js`, `db/learnerArtifactsRepo.js`, challenge, learner-log/projection, identity, handoff, notification and channel repositories.
- `migrations/020_identity.sql`, `021_cloud_event_log.sql`, `023_learner_artifacts.sql`, `026_agent_runtime.sql`, `027_telegram_channels.sql`, `028_agent_challenges.sql`, `032_notification_prefs_nudge_ledger.sql`, `033_nudge_state_snooze.sql` and `038_reading_handoff.sql`.

No `.claude/PROD_OPS_PRIVATE.md` or private production data was opened. Unrelated `.agents/` and `docs/research/edu-quality-agentic/` remain untouched.
