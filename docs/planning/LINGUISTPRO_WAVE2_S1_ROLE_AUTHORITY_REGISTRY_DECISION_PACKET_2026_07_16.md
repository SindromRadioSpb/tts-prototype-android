# LinguistPro Wave 2 — S1 Role and Authority Registry decision packet

**Date:** 2026-07-16
**Status:** `OWNER_APPROVED`; S1 registry direction A/A/A/A/A/A/A/A/A is canonical. Documentation and contract design only.
**Authority:** S1 only. No production code, registry file, migration, API/UI/config, provider, deployment, background job, S2/S3 implementation, durable memory or material ingestion is authorized.
**Owner approval:** 2026-07-16 — Decisions 1–9: A/A/A/A/A/A/A/A/A. This approval closes S1 and permits S2 typed artifact, provenance, context-pack and handoff contract design; it does not authorize S2 implementation or S3 observe-only work.
**Repository baseline:** `main` / `a3928f3e8abc07d916470f0157949c7f55996640`; package `3.11.183`; `origin/main` aligned at inspection.
**Predecessor:** `LINGUISTPRO_WAVE2_S0_SCALE_ENVELOPE_DECISION_PACKET_2026_07_16.md`, owner-approved B/B/B/B/B.
**S1 exit gate inherited from Wave 2:** every logical role must declare allowed inputs, outputs, tools/data scope, authority, model route, budget, retention, publication gate and kill switch.

## 1. Executive recommendation

Adopt a **default-deny logical role registry** around the existing single-controller runtime. A role is a versioned contract, not a process, model, persona or free agent. The selected direction is:

1. preserve the existing deterministic single controller and repositories;
2. split policy, content generation, selection, grading and canonical writing into distinct logical authorities even when they remain in one Node process;
3. register all live scenarios plus explicitly disabled/reserved future roles;
4. make authority capabilities non-transitive and non-delegable: no role may grant another role a tool, data class, model route, budget or publication right;
5. keep all LLM roles advisory or derived-artifact-only;
6. keep deterministic grading and canonical event append as separate roles joined only by a bound challenge/attempt and stable provenance;
7. carry the paper registry into S2 typed artifact/context contracts and S3 observe-only enforcement design; do not refactor live code during S1.

The proposed registry contains 15 active or bounded roles and four reserved roles. This granularity is intentional: combining tutor, grader and writer would violate R17; combining policy, provider routing and content generation would make consent/budget enforcement self-authorizing.

## 2. Epistemic labels

- **`VERIFIED_LIVE`** — present and reachable in current code or current canonical handoff.
- **`VERIFIED_LIVE_DISABLED`** — implemented and reachable only behind a switch that is off by default; it has no live authority until explicitly enabled.
- **`VERIFIED_PARTIAL`** — a mechanism exists but does not yet enforce the full S1 contract.
- **`ABSENT`** — no live implementation was found.
- **`PROPOSED_CONTRACT`** — S1 target design; no implementation authority.
- **`RESERVED_DISABLED`** — named for future compatibility but must remain unavailable.

Live code outranks comments and dated planning prose. Several comments still describe production review flags as off even though the current closure canon records active review writes; those comments are not treated as live authority.

## 3. Why S1 is needed

### 3.1 What already works

The current architecture already has important enforcement primitives:

- authenticated principal-derived `userId`;
- CSRF on session mutations;
- a closed tool-name registry;
- hard rejection of `user_id`/`userId` in tool arguments;
- consent checks inside content repositories and again at sensitive delivery/write boundaries;
- pre-call model reservation and global kill switch;
- deterministic grader with locked provenance;
- challenge binding, single-use attempts, MNAR no-write and append-only correction;
- feature flags for review, Mini App review, lesson builder, shadow critic and notifications;
- no direct LLM access to SQLite.

### 3.2 What is not yet a role registry

| Gap | Live evidence | S1 consequence |
|---|---|---|
| No `role_id` or `scenario_id` at the tool boundary | `callTool(ctx,name,args)` receives principal, name and args only | A caller with code reachability can request any enabled tool; the router cannot prove role authorization. |
| No per-role tool allowlist | `REGISTRY` declares global tools only | S1 must define default-deny role→tool capabilities on paper. |
| No strict tool schemas | Tools read optional fields ad hoc; only `user_id` is globally rejected | S2 must define strict typed inputs/outputs; S1 assigns ownership and bounds. |
| Repository access bypasses the tool router | Lesson builder, role-play, reviewer, review session, Telegram adapters and runtime views import repositories directly | S1 must inventory these as explicit capabilities rather than falsely claim all access is tool-mediated. |
| Roles exist in comments, not immutable manifests | Planner/explainer/reviewer/grader names are descriptive modules | S1 must define stable role identifiers, versions and authority fields. |
| Provider route is mostly global | `AGENT_LLM_PROVIDER` plus a lesson-specific model override | No scenario-level approved route/privacy matrix is enforceable yet. |
| Budgets are mostly shared request counts | One managed user/global/provider ledger; only some scenario caps | S1 declares target budget classes; S3 will observe before enforcement. |
| Retention is distributed across code/tables | RAM TTLs, 24h lesson draft, indefinite tasks/explanations/ledgers | S1 assigns retention classes and exposes owner decisions. |
| Kill switches are uneven | Strong global/review/lesson/nudge flags, but no switch per advisory scenario | Registry needs a logical kill switch for every role even if several currently map to one global flag. |
| “Read-only” has two meanings | Telegram `/plan` is read-only for `review_log` but still spends model budget and writes an `agent_task`/ledger | Authority must distinguish canonical truth, derived persistence and spend. |

## 4. Registry semantics

### 4.1 Role identity

Every role record has this conceptual shape:

```json
{
  "role_id": "mentor.explainer",
  "role_version": "1.0.0",
  "status": "active",
  "purpose": "explain one bounded source context",
  "accountable_owner": "education_quality_owner",
  "allowed_scenarios": ["explain_sentence", "explain_word", "explain_followup"],
  "allowed_inputs": ["principal", "selected_source_ref", "resolver_facts", "learner_summary"],
  "allowed_outputs": ["advisory_explanation", "derived_explanation_record"],
  "allowed_tools": ["get_sentence_context_if_available", "resolve_item_key", "create_explanation"],
  "data_classes": ["A", "B_METADATA", "C_SELECTED", "D_TRANSIENT"],
  "required_consents": ["cloud_texts", "agent_read_texts"],
  "authority": ["ADVISORY_RENDER", "DERIVED_APPEND"],
  "autonomy": "A0_USER_INITIATED",
  "model_route_policy": "route.mentor_advisory.v1",
  "budget_class": "managed_advisory_standard",
  "retention_class": "DERIVED_HISTORY_180D_TARGET",
  "publication_gate": "USER_REQUEST_AND_SCHEMA_VALIDATION",
  "kill_switch": "role.mentor.explainer.enabled"
}
```

This is a paper schema. S1 creates no JSON registry file and changes no runtime.

### 4.2 Authority capabilities

Authority is a set of non-hierarchical capabilities, not a numeric ladder:

| Capability | Meaning | LLM eligible? |
|---|---|---:|
| `READ_SCOPED` | Read only the declared principal/data scope | Yes, through a controller/context boundary |
| `ADVISORY_RENDER` | Return ephemeral advice; no durable learner truth | Yes |
| `DERIVED_APPEND` | Append a user-visible derived artifact/task with provenance | Yes, after validation; never learner truth |
| `USER_ASSERTED_WRITE` | Persist a direct user preference/consent action | No model authorization; user action only |
| `POLICY_DECIDE` | Deterministically allow/deny/select/claim under fixed policy | No generative model |
| `GRADE_DETERMINISTIC` | Produce a versioned grade candidate from bounded evidence | No LLM |
| `CANONICAL_EVENT_APPEND` | Append one canonical event through the repository path | No LLM; requires deterministic verdict and bound command/challenge |
| `DELIVER_CHANNEL` | Deliver already-authorized content to a bound channel | No authority to select learner truth or expand context |

No capability implies another. In particular, `GRADE_DETERMINISTIC` does not imply `CANONICAL_EVENT_APPEND`; `DERIVED_APPEND` does not imply `USER_ASSERTED_WRITE`; `DELIVER_CHANNEL` does not imply content access.

### 4.3 Autonomy levels

| Level | Meaning | Current use |
|---|---|---|
| `A0_USER_INITIATED` | Every run starts from an explicit user action | All LLM content scenarios and review sessions |
| `A1_POLICY_INITIATED` | Deterministic policy may initiate a bounded message/action | Notification selection/delivery only |
| `A2_BACKGROUND_PREPARE` | Background work prepares a candidate but cannot publish | Not authorized; reserved for S4+ |
| `A3_GATED_PUBLISH` | Policy may publish a category after explicit owner gate | Not authorized |
| `A4_UNBOUNDED` | Self-directed goals/tools/publication | Prohibited |

## 5. Logical role catalog

### 5.1 Active and bounded roles

| Role ID | Status | Purpose | Authority | Model route |
|---|---|---|---|---|
| `policy.controller` | `VERIFIED_PARTIAL` | Validate principal, consent, feature flags, route and budget; never generate content | `POLICY_DECIDE` | None |
| `mentor.planner` | `VERIFIED_LIVE` | Build a deterministic day plan and optionally rephrase it | `READ_SCOPED`, `ADVISORY_RENDER`, `DERIVED_APPEND` | Managed/BYOK advisory; deterministic fallback |
| `mentor.explainer` | `VERIFIED_LIVE` | Explain a selected sentence/word/follow-up with resolver facts | `READ_SCOPED`, `ADVISORY_RENDER`, `DERIVED_APPEND` | Managed/BYOK advisory; fallback for first explanation, hard fail for follow-up |
| `mentor.comprehension_coach` | `VERIFIED_LIVE` | Generate advisory comprehension questions from a bounded window | `READ_SCOPED`, `ADVISORY_RENDER` | Managed/BYOK structured; no grade |
| `mentor.dialogue_coach` | `VERIFIED_LIVE` | Run bounded grounded role-play and constrained-writing feedback | `READ_SCOPED`, `ADVISORY_RENDER` | Managed/BYOK advisory; role-play RAM session |
| `material.advisor` | `VERIFIED_LIVE` | Summarize what to learn and create an explicitly opened retell draft | `READ_SCOPED`, `ADVISORY_RENDER`, `DERIVED_APPEND` | Managed/BYOK advisory/structured |
| `lesson.composer` | `VERIFIED_LIVE` | Produce one typed, ephemeral lesson draft from selected sources | `READ_SCOPED`, `ADVISORY_RENDER` | Managed/BYOK, one bounded repair; deterministic fallback |
| `reading.recommender` | `VERIFIED_LIVE` | Explain a deterministic client-selected next text | `READ_SCOPED`, `ADVISORY_RENDER` | Managed/BYOK advisory |
| `review.selector` | `VERIFIED_LIVE` | Deterministically choose a due item/modality and bind a challenge | `READ_SCOPED`, `POLICY_DECIDE` | None |
| `review.grader` | `VERIFIED_LIVE` | Normalize and grade bounded responses with D1/MNAR policy | `GRADE_DETERMINISTIC` | None; LLM structurally prohibited |
| `review.writer` | `VERIFIED_LIVE` | Validate verdict/challenge/idempotency and append review/annul | `CANONICAL_EVENT_APPEND` | None; LLM structurally prohibited |
| `profile.editor` | `VERIFIED_LIVE` | Persist direct user-selected mentor mode/language/depth | `USER_ASSERTED_WRITE` | None |
| `notification.policy` | `VERIFIED_LIVE` | Select eligible channel/reason and atomically claim the day | `READ_SCOPED`, `POLICY_DECIDE` | None |
| `notification.delivery` | `VERIFIED_LIVE` | Render/deliver fixed policy-selected content to bound channel | `DELIVER_CHANNEL` | None in current nudge path |
| `quality.shadow_critic` | `VERIFIED_LIVE_DISABLED` | Score a lesson draft in shadow without edit/block/publish authority | `READ_SCOPED`, `ADVISORY_RENDER` to diagnostics only | Managed provider when explicitly enabled; not independent evidence |

### 5.2 Reserved roles

| Role ID | Status | Purpose | Why disabled |
|---|---|---|---|
| `material.processor` | `RESERVED_DISABLED` | Parse/revise/chunk/index permitted durable material | Requires S4–S7, rights/lifecycle/object storage and durable jobs |
| `memory.extractor` | `RESERVED_DISABLED` | Create a correctable learner-memory candidate | Requires S2 artifacts/context, S3 observe-only proof and separate F1 authorization |
| `evidence.selector` | `RESERVED_DISABLED` | Propose evidence requests from observations/hypotheses | F2 requires F1 foundation and independent evaluation protocol |
| `evaluation.independent` | `RESERVED_DISABLED` | Produce isolated evaluation artifacts | No approved evaluator route/oracle/threshold; tutor must never self-certify |

Reserved roles have empty tool sets, `authority=[]`, `model_route_policy=NONE`, `budget_class=ZERO`, `publication_gate=PROHIBITED` and a logical kill switch fixed off.

## 6. Role input, data and consent matrix

### 6.1 Data classes

| Registry class | Content | Rule |
|---|---|---|
| `A` | Learner state identifiers, review facts, projections, settings, channel state | Account/session required; principal scope mandatory |
| `B_METADATA` | Artifact IDs, text keys, timestamps and counts without body | `cloud_texts` where sourced from synced learner artifacts |
| `C_SELECTED` | Explicitly selected sentence/window/digest or current user submission | Exact live consent and purpose/scope; never ambient whole-account access |
| `C_PUBLIC` | Public-domain corpus sentence/window/work metadata | No learner-content consent; still bounded and cited |
| `D_TRANSIENT` | Prompt packet, role-play transcript, writing submission, provider response before validation | Memory/request TTL only; no stdout/audit persistence |

### 6.2 Role data boundaries

| Role | Allowed inputs | Consents / action gate | Explicitly forbidden |
|---|---|---|---|
| `policy.controller` | Principal, session/channel binding, consent records, flags, route/budget counters | Authenticated context; action-time recheck | Raw source body unless needed only to calculate bounded size/hash; pedagogical generation |
| `mentor.planner` | Due/weak/recent-struggle/lifecycle summaries, profile language/depth | User request or Telegram delivery consent for channel rendering | Raw personal text, free chat, grade/write to `review_log` |
| `mentor.explainer` | One selected personal sentence or public corpus sentence; resolver facts; bounded learner summary; prior explanation for ≤3 follow-ups | Personal: `cloud_texts` + `agent_read_texts`; public corpus: explicit user selection | Neighbor/full text in sentence-only scenario; invented morphology; mastery update |
| `mentor.comprehension_coach` | Selected public or personal window ≤5 rows | Personal: `cloud_texts` + `agent_read_texts`; explicit tap | Canonical grade, FSRS write, declaring comprehension mastery |
| `mentor.dialogue_coach` | Selected window ≤5; current submission; ≤6 replay transcript entries; eligible target IDs | Personal source: `cloud_texts` + `agent_read_texts`; writing submission is current action data | Generic chat; persistent transcript/submission; canonical grade |
| `material.advisor` | Personal digest ≤40×200 or selected window ≤5; due/weak IDs; public corpus window | Full personal digest: `cloud_texts` + `agent_read_texts` + `agent_read_texts_digest`; window: first two | Autonomous library scan; durable material publication; learner truth |
| `lesson.composer` | 1–3 explicitly selected sources; ≤8,000 provider chars; resolver/coverage facts | Personal source currently uses the three text consents; public source explicit selection | Ambient corpus, durable retention, cards/FSRS, self-certification |
| `reading.recommender` | Server-grounded public work card; device-reported coverage/frontier IDs; learner counts | Explicit “why” tap; no personal text | Server re-scoring as truth; plot invention; automatic navigation |
| `review.selector` | Due/projection/channel history, challenge cooldown, available source/audio | Explicit `/review`/Mini App session; text challenge needs live text consents | Model choice of item/modality; arbitrary item from client |
| `review.grader` | Server expected form, raw answer in memory, channel, prior state and item rows | Bound attempt; explicit skip is gradable; missing answer is MNAR | DB, provider, prompt, model feedback as grade |
| `review.writer` | Deterministic verdict/provenance, bound challenge/attempt, existing item rows | `AGENT_REVIEW_WRITE`; Mini App also `MINI_APP_REVIEW_WRITE`; action-time text consent for cloze | New item mint, direct projection/state edit, foreign/old annul |
| `profile.editor` | Direct user enum choices only | Session+CSRF | Model-suggested silent change; arbitrary goals JSON |
| `notification.policy` | Preferences, local time, due count, channel eligibility, backoff, daily claim | `telegram_delivery` for Telegram; push subscription for push | LLM-selected channel/reason, more than one daily claim |
| `notification.delivery` | Already-selected reason/count/minimal identifiers | Recheck bound channel/consent before send | Broader learner context, canonical writes, fallback channel after failed claim |
| `quality.shadow_critic` | Typed lesson draft plus declared rubric fields | Owner-only offline/default-off evidence mode | Source expansion, editing, blocking, publication, grading learner, quality promotion |

## 7. Tool and repository capability registry

### 7.1 Current closed tools and proposed role allowlist

| Tool | Allowed role(s) | Data / side effect | Live status |
|---|---|---|---|
| `get_due_words` | planner, dialogue coach, material advisor, lesson composer, review selector | A read | Enabled |
| `get_known_words` | lesson composer | A read | Enabled; lesson currently calls repository directly |
| `get_weak_words` | planner, dialogue coach, material advisor, lesson composer | A read | Enabled |
| `get_learner_context` | planner, explainer, reading recommender | A read | Enabled |
| `get_word_lifecycle` | planner, explainer | A read | Enabled |
| `get_recent_struggles` | planner | A read | Enabled |
| `resolve_item_key` | explainer, dialogue coach, material advisor, lesson composer, reading recommender, review selector | Resolver read; linguistic authority | Enabled |
| `get_user_texts_if_consented` | planner only if a future selected-text list scenario declares it | B metadata read | Enabled but no current caller found; treat as latent, not ambient permission |
| `get_sentence_context_if_available` | explainer | C selected sentence | Enabled |
| `get_sentence_window_if_available` | comprehension coach, dialogue coach, material advisor | C selected window | Enabled |
| `get_text_digest_if_available` | material advisor, lesson composer | C selected whole-text digest | Enabled |
| `get_corpus_sentence_context` | explainer | Public corpus sentence | Enabled |
| `create_agent_task` | planner | Derived append | Enabled but planner currently writes repository directly |
| `create_explanation` | explainer, material advisor | Derived append | Enabled |
| `record_review_answer` | review writer only | Canonical event append | Feature-gated and live in approved channels |
| `synthesize_audio` | none | Provider/spend/write | Disabled: `GATED_UNTIL_TTS_LIMITS` |

### 7.2 Direct repository capabilities that must be registered honestly

S1 does not require a forced “everything is a tool” rewrite. It does require that every direct capability be visible:

| Capability | Current callers | Target owner role |
|---|---|---|
| profile/usage/history reads | runtime, planner, explainer, material, role-play, writing, next-text | corresponding content role under `READ_SCOPED` |
| plan task append | planner direct `agentRepo.createTask` | `mentor.planner` / `DERIVED_APPEND` |
| lesson source/learner reads | lesson builder direct personal/corpus/keying/graph repos | `lesson.composer` |
| public corpus window | role-play/material direct corpus repo | dialogue coach/material advisor |
| challenge creation/claim/exposure | review session and Telegram adapter | `review.selector` |
| canonical ingest/recompute | reviewer | `review.writer` only |
| channel pairing/action log | Telegram router/repositories | `policy.controller` / channel adapter, never content role |
| notification claim/state | nudge coordinator/repos | `notification.policy` |

S2 should type these capabilities. S3 should observe role/capability parity before any enforcement. No compatibility bypass may survive later CP1 enforcement.

## 8. Output, retention and publication matrix

### 8.1 Retention classes

| Class | Target policy | Current examples |
|---|---|---|
| `EPHEMERAL_REQUEST` | Destroy after response; never persist/log | Writing submission, comprehension candidate, next-text explanation |
| `EPHEMERAL_SESSION_30M` | RAM only; ≤30m; revoke drops personal session | Role-play transcript |
| `CLIENT_DRAFT_24H` | Client session storage; expires ≤24h; no server durable copy | Lesson Builder draft |
| `DERIVED_TASK_30D_TARGET` | User-visible task/plan identifiers; target purge after 30d | `agent_tasks` currently unbounded |
| `DERIVED_HISTORY_180D_TARGET` | User-visible explanation/material history; revoke tombstone; target purge after 180d or explicit clear | `agent_explanations` currently unbounded |
| `OPERATIONAL_30D` | Content-free channel/action diagnostics | Bot action log policy |
| `CANONICAL_ACCOUNT_LIFETIME` | Account lifetime; whole-stream delete; correction by append | `review_log`, consent history where legally required |
| `PROJECTION_REBUILDABLE` | One current row/item; rebuildable from canon | `srs_projections` |

The 30/180-day target values are `PROPOSED_CONTRACT`, not current behavior. Implementing purge requires later lifecycle/job authority; S1 only asks the owner to select the target.

### 8.2 Role output controls

| Role | Allowed output | Retention | Publication gate | Never publish |
|---|---|---|---|---|
| planner | Typed plan + optional prose; identifier-only plan task | response + task 30d target | Explicit request or authorized Telegram command | grade, mastery claim, unsolicited multi-message plan |
| explainer | Advisory explanation with `facts_used` | derived history 180d target; purge/tombstone on revoke | Explicit selected anchor + schema/quality validation | resolver-overriding fact |
| comprehension coach | Advisory question set and answer key | request only | Explicit tap; UI must label non-assessment | canonical score/review event |
| dialogue coach | Advisory turn or writing feedback | request/session only | Explicit user turn | transcript, learner profile inference, grade |
| material advisor | Advisory study summary / retell draft | history 180d target for current explanation record | Explicit user request; Studio open is a second explicit action | autonomous material/card publication |
| lesson composer | Typed draft with provenance/quality tier | client 24h | Explicit build; learner edit/open; validator owns eligibility | expert certification, durable lesson, FSRS/card writes |
| reading recommender | Explanation of deterministic selection | request only | Explicit “why” tap | changing selected work or learner state |
| review selector | Bound challenge | challenge TTL 10m; exposure 45m | Explicit review start; server selection | answer/grade |
| grader | Verdict candidate + provenance | passed in memory to writer; no independent DB record | Deterministic contract only | user-facing certification without writer checks |
| review writer | Append-only review/skip/annul | canonical account lifetime | Bound challenge/attempt, flags, existing item, deterministic verdict | direct state, LLM verdict, unanswered event |
| profile editor | Enum profile values | account lifetime until changed/deleted | Explicit authenticated user mutation | inferred/silent preference |
| notification policy | Channel/reason/claim decision | ledger lifecycle; target operational rollup later | Deterministic eligibility + one daily atomic claim | content generation, fallback resend after claim |
| notification delivery | One authorized message | action log 30d | Action-time consent/channel recheck | extra context or second channel |
| shadow critic | Content-free score/failure codes in evidence artifact | declared research packet only | Offline/default-off; no learner-visible publication | blocking/editing/promotion claim |

## 9. Model routes and budgets

### 9.1 Route classes

| Route policy | Eligible roles | Rules |
|---|---|---|
| `NONE_DETERMINISTIC` | policy, selector, grader, writer, profile, notification | Network model structurally prohibited |
| `ADVISORY_DEGRADABLE` | planner, first explanation, writing coach, study summary | Managed or BYOK through `llmGate`; deterministic useful fallback required |
| `ADVISORY_HARD_FAIL` | follow-up, comprehension, role-play turn, retell, next-text explanation | Managed or BYOK; no fabricated fallback when task inherently requires generation |
| `LESSON_COMPOSITION_BOUNDED` | lesson composer | Gemini 3.1 Flash-Lite current override; one first candidate + at most one repair; optional shadow call only when explicitly enabled |
| `SHADOW_EVAL_ONLY` | shadow critic | No edit/publication authority; same-provider output is not independent evidence |

No automatic cross-provider fallback is authorized. BYOK failure never borrows managed budget. A route change requires a new route-policy version and provider privacy/price review.

### 9.2 Budget classes

| Budget class | Proposed limits / relationship | Current enforcement |
|---|---|---|
| `ZERO` | No model/provider call | Structural for deterministic roles |
| `managed_advisory_standard` | Shared managed pool plus per-user and per-scenario reservation | User/global/provider counts live; per-scenario mostly absent |
| `managed_dialogue_bounded` | Shared pool; role-play ≤8 turns/session and 16 calls/day/user | Live |
| `managed_followup_bounded` | ≤3 follow-ups/explanation | Live |
| `managed_lesson_bounded` | First + at most one repair; shadow call separate and default off | Live call count; no dedicated daily lesson cap |
| `byok_user_paid` | No managed fallback; still rate/concurrency/privacy bounded | Live; telemetry best-effort |
| `tts_zero_until_reserved` | No agent TTS until character reservation exists | Live disabled tool |

S1 recommendation: S3 observe model calls under role/scenario budget classes before enforcing new per-scenario quotas. The S0-approved managed fairness and micro-dollar/token hard-stop direction remains mandatory before external managed access.

## 10. Kill-switch registry

| Role(s) | Current switch/gate | Target logical switch | Gap |
|---|---|---|---|
| All model roles | `AGENT_LLM_DISABLED` | `route.managed.enabled` plus role switch | Global switch exists; no per-role advisory switch |
| Lesson composer | `LESSON_BUILDER_LB0_ENABLED` | `role.lesson.composer.enabled` | Adequate coarse switch |
| Shadow critic | `LESSON_BUILDER_SHADOW_CRITIC_ENABLED` default off | `role.quality.shadow_critic.enabled` | Adequate; must remain off by default |
| Review writer | `AGENT_REVIEW_WRITE` | `role.review.writer.enabled` | Live |
| Mini App review selector/writer | `MINI_APP_ENABLED`, allowlist, `MINI_APP_REVIEW_WRITE` and review flag | surface + role switches | Live layered gate |
| Telegram channel | consent/link/webhook secret; no single content-role flag | `surface.telegram.enabled` and per-command family switches | Partial |
| Notifications | `AGENT_NUDGE_ENABLED`, `NUDGE_CHANNEL_SELECTOR_ENABLED`, preferences/mute | `role.notification.policy.enabled` / delivery switches | Live but two modes complicate rollback |
| Planner/explainer/coach/material/recommender | only global LLM switch, auth/rate limits | one logical switch per role; deterministic fallback behavior declared | `ABSENT` per-role switch |
| Profile editor | auth/CSRF only | `role.profile.editor.enabled` | Low risk but still needs incident disable path |
| Reserved roles | none live | hard-coded disabled | Required |

Logical switches are registry fields, not new environment variables in S1. S3 must prove shadow parity before any enforcement implementation.

## 11. Scenario-to-role map

| Scenario / surface | Primary role | Supporting roles | Canonical write? |
|---|---|---|---:|
| `/api/agent/plan`, Mini App/Telegram plan | planner | policy controller | No; derived task + ledger only |
| explain sentence/word/follow-up | explainer | policy controller, resolver authority | No; derived explanation only |
| comprehension | comprehension coach | policy controller, bounded source reader | No |
| role-play | dialogue coach | policy controller, bounded source reader | No |
| constrained writing | dialogue coach | deterministic resolver matcher | No |
| study summary / retell | material advisor | policy controller, source reader | No; derived explanation/draft only |
| Lesson Builder | lesson composer | policy controller, resolver, shadow critic if enabled | No |
| next-text “why” | reading recommender | deterministic client selector, resolver | No |
| web/Telegram/Mini App review start | review selector | policy controller, channel adapter | Challenge only |
| review answer | grader then writer | selector/challenge store, projection reducer | Yes, one append-only event |
| annul | writer with deterministic eligibility | policy controller | Yes, compensating event |
| profile update | profile editor | policy controller | User-asserted profile only |
| proactive nudge | notification policy then delivery | learner graph/channel adapters | Daily claim/action log; no learner truth |
| BYOK check | policy/controller provider probe | model gateway | Telemetry only; not pedagogical role |
| status/tasks/explanations/constructs views | authenticated view adapter | repositories | No new authority |

## 12. Controller and delegation rules

1. The controller selects a registered scenario and role; model output never selects either.
2. Principal, tenant/user, device and channel binding come from authenticated context, never model/tool args.
3. Effective capability is the intersection of role, scenario, live consent, surface, route, budget, feature flags and request scope.
4. A role cannot mint or widen another role's capability.
5. Supporting roles return typed candidates only. The controller revalidates before any write or delivery.
6. There is no role-to-role free conversation, voting truth or shared autonomous memory.
7. A model never sees API keys, capability tokens, arbitrary tool names or raw account-wide history.
8. Revocation during a provider call invalidates the returned candidate before persistence/delivery.
9. A terminal denial cannot be converted to a broader route or context by retry.
10. Any future specialist remains advisory until the control-plane promotion gate and separate owner approval.

## 13. R1–R17 adversarial critique

| Role lens | Attack on the registry | Resolution required in S1/S2/S3 |
|---|---|---|
| R1 | “Explainer” or “lesson composer” could be mistaken for linguistic authority. | Resolver remains a separate asserted-fact authority; LLM roles may phrase but not mint morphology. |
| R2 | Role separation can become bureaucratic while plans/notifications optimize activity rather than learning. | Every content role retains one of five action categories and reading-first outcome; no notification/model-volume KPI. |
| R3 | Role IDs can become fake graph nodes without stable artifact IDs. | S2 must type handoffs and provenance by IDs; role names alone create no truth edge. |
| R4 | Honest internal roles can still surface confusing provenance or dead ends. | Publication gates require typed origin/degradation and actionable fallback; later UI changes need mobile/RTL proof. |
| R5 | Nineteen roles could look like a generic agent platform. | Roles remain contracts inside one controller; reserved roles are disabled; no framework/service proliferation. |
| R6 | Material advisor might silently become a library ingester. | It reads only explicit selected source/digest; durable material processor remains reserved. |
| R7 | Provider substitution could erase register/era constraints. | Route versions and source facts are fixed inputs; no silent provider fallback. |
| R8 | Lesson composer might publish scaffolding permanently or overload learners. | Ephemeral draft, bounded load, learner edit/open gate; no durable series or cards. |
| R9 | Derived role output could be promoted to asserted truth. | Output types and authority capability are explicit; `DERIVED_APPEND` never implies canonical assertion. |
| R10 | A paper allowlist could claim enforcement it does not have. | Mark current gaps `VERIFIED_PARTIAL`; S3 observe-only parity precedes enforcement. |
| R11 | Same-controller tests could validate a circular tutor/critic/grader chain. | Grader is deterministic and separate; shadow critic is not independent evidence; use external/human oracle for quality promotion. |
| R12 | Direct repository imports can bypass a future tool policy. | Register repository capabilities now; S2 types them; S3 traces them before CP1 refactor. |
| R13 | Enforcing a new registry abruptly could drop writes or strand old clients. | Observe-only shadow decisions and parity window; no S1 runtime change; rollback preserves canonical log. |
| R14 | Role allowlist without principal/surface binding still leaks tenants/channels. | Effective scope always intersects authenticated principal and surface/channel binding; negative tests required. |
| R15 | Consent and retention could be declared but not executable. | Current consent keys remain exact; target TTLs are owner decisions and require later purge evidence before external scale. |
| R16 | Shared request quota lets dialogue/lesson calls starve simple plans. | Budget classes and scenario reservation are explicit; observe demand before enforcement; deterministic value remains. |
| R17 | Combining selector, grader and writer would let the tutor certify itself or write on timeout. | Three distinct roles; deterministic verdict; bound attempt; MNAR no-write; append-only correction. |

### Synthesis

The registry is valuable only if it exposes existing exceptions and authority splits. Pretending that `tools.js` already mediates every access would be more dangerous than the current code because it would create false assurance. The recommended progression is paper registry → typed S2 capabilities/artifacts → S3 observe-only traces → later default-deny enforcement, with no big-bang rewrite.

## 14. Owner decisions

### Decision 1 — role granularity

- **A — 15 active/bounded + 4 reserved roles (recommended):** keeps policy, tutor/composer, selector, grader and writer separate without creating services.
- **B — collapse content roles into one `mentor` role:** simpler but weakens scenario budgets, consent and publication boundaries.
- **C — one role per endpoint:** precise but operationally noisy and encourages framework over-design.

### Decision 2 — authority model

- **A — non-hierarchical capability set (recommended):** read/advisory/derived/user-asserted/policy/grade/canonical/deliver are separate.
- **B — numeric authority levels:** easier to display, but “higher” roles accidentally inherit unrelated powers.

### Decision 3 — current repository bypasses

- **A — register them as explicit capabilities, type in S2, trace in S3, refactor only after parity (recommended).**
- **B — require immediate tool-router refactor:** outside S1 and risks a big-bang behavior change.
- **C — ignore direct imports:** false security; reject.

### Decision 4 — model route and evaluator boundary

- **A — no silent fallback; deterministic roles model-free; shadow critic remains advisory and non-independent (recommended).**
- **B — permit provider fallback within shared budget:** requires privacy/region/quality adjudication not available in S1.
- **C — let critic block lessons now:** rejected by LB2 evidence boundary.

### Decision 5 — target retention classes

- **A — tasks 30d, derived explanations 180d, role-play 30m, lesson draft 24h, canonical log account lifetime (recommended).**
- **B — retain derived history for account lifetime:** simpler UX, higher lifecycle/storage burden.
- **C — derived history 30d across the board:** smaller footprint, likely too destructive for mentor continuity.

### Decision 6 — consent and provider egress

- **A — preserve current exact consent keys for live behavior; S2 adds a `provider_egress` policy field and requires public-copy adjudication before external users (recommended).**
- **B — declare existing `agent_read_texts` sufficient forever:** underspecifies provider/region/retention changes.
- **C — add a new consent immediately:** implementation outside S1; premature before copy/route matrix.

### Decision 7 — budget classes

- **A — freeze current limits; define classes now; observe per-role demand in S3 before new enforcement (recommended).**
- **B — assign new per-scenario quotas now:** false precision without usage evidence.
- **C — keep only one global count forever:** unfair at controlled-pilot scale.

### Decision 8 — logical kill switches

- **A — require a logical switch for every role/surface/route, map to current flags where possible, implement only after S3 parity (recommended).**
- **B — global LLM and review flags are sufficient:** leaves deterministic/derived paths without incident isolation.

### Decision 9 — accountable ownership

- **A — register four accountable functions: product, platform/security, privacy/lifecycle and education quality (recommended).** One person may temporarily hold several functions, but decisions/audits remain distinct.
- **B — single undifferentiated owner field:** simpler, but weak for incidents, consent and evaluator promotion.

## 15. Owner-approved resolution

The owner approved **A/A/A/A/A/A/A/A/A** on 2026-07-16:

1. 15 active/bounded and four reserved roles.
2. Non-hierarchical, non-transitive authority capabilities.
3. Honest registration of direct repository capabilities; no S1 refactor.
4. No silent provider fallback; no critic promotion.
5. Target retention: tasks 30d, explanations 180d, role-play 30m, lesson draft 24h, canonical log account lifetime.
6. Preserve current live consent behavior; type provider-egress policy in S2 before external use.
7. Define budget classes now and measure them in S3 before changing limits.
8. Require logical per-role/surface/route kill switches, implemented only after observe-only parity.
9. Separate accountable product/platform/privacy/education-quality functions.

## 16. Exact S1 exit criteria for S2

S1 closes and S2 typed artifact/context-pack design may start only when:

1. The owner selects the role granularity and authority model.
2. Every active/reserved role has declared inputs, outputs, tools/repository capabilities, data classes, authority, autonomy, route, budget, retention, publication gate and kill switch.
3. Selector, grader and writer remain separate and no LLM role has canonical truth authority.
4. Current direct repository capabilities are acknowledged as live exceptions, not hidden.
5. Current/live versus proposed/absent enforcement is labelled without ambiguity.
6. Consent/provider-egress and retention targets are owner-adjudicated.
7. No new provider, database, queue, role service or multi-agent framework is selected.
8. The S1 packet passes link/whitespace/scope checks.
9. After owner approval, only the S1 documentation path is staged, committed and pushed.

S2 must then define typed artifact, provenance, context-pack and handoff contracts. S2 does not inherit authority to implement CP0, durable jobs, memory or materials.

## 17. Explicitly prohibited by S1

- No production registry/config file or runtime enforcement.
- No new role service, model, provider or prompt.
- No tool-router/repository refactor.
- No migration, run/step/command tables or durable job queue.
- No shadow critic blocking/edit/publication authority.
- No LLM grade, mastery, FSRS or consent/profile write.
- No generic MCP/A2A/multi-agent framework.
- No durable lesson, material corpus, OCR/media, embedding or memory extractor.
- No commit/push until owner approval of this packet.

## 18. Source map

Primary sources inspected:

- `CLAUDE.md`; `docs/PROJECT_ROLES.md`.
- `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md`.
- `docs/planning/LINGUISTPRO_WAVE2_S0_SCALE_ENVELOPE_DECISION_PACKET_2026_07_16.md`.
- `docs/planning/LINGUISTPRO_WAVE2_LB2_CLOSURE_HANDOFF_2026_07_16.md`.
- `docs/planning/AI_MENTOR_RECON_2026_07_04.md`.
- `docs/planning/ai_agent_education_strategy_2026_07_11/19_AGENT_CONTROL_PLANE_DESIGN.md`.
- Live `agent/runtime.js`, `agent/tools.js`, planner/explainer/material/role-play/writing/lesson/next-text/reviewer/grader/review-session and Telegram modules.
- Live identity, consent, learner graph/log/projection, artifacts, challenge, notification and cost-ledger repositories plus agent/Mini App/Telegram routes in `server.js`.

No `.claude/PROD_OPS_PRIVATE.md` or private production data was opened. Unrelated `.agents/` and `docs/research/edu-quality-agentic/` remain untouched.
