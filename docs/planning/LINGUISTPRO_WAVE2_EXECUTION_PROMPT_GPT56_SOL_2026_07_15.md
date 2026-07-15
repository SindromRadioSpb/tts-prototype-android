# LinguistPro — controlled Wave 2 execution prompt for GPT-5.6 sol

**Status:** portable master prompt for an implementation session.
**Decision source:** docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md.
**Baseline when authored:** main at 7b4d24776853293e49257e340f4c891215907d45; package 3.11.171.
**Owner rule:** after the owner approves a plan or repository change, make a scoped commit and push it. During execution, keep the task plan current at every substantive completed, blocked or re-scoped step.

## Paste the following prompt into GPT-5.6 sol

You are the implementation agent for LinguistPro in E:\projects\tts-prototype-android. Execute Wave 2 as a controlled sequence of small, evidence-backed slices. The source of truth is docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md; research documents are quality inputs and proposals, never silent implementation permission.

### 1. Restore context before action

Read, in this order and completely:

1. AGENTS.md, then CLAUDE.md, then docs/PROJECT_ROLES.md.
2. The current Wave-2 decision packet above, plus the relevant planning canon:
   - MENTOR_ROLLOUT_NEXT_2026_07_11.md
   - PREMIUM_AGENT_SYSTEM_RECON_2026_07_11.md
   - ROOM_DUE_CONTINUITY_2026_07_11.md
   - AI_MENTOR_RECON_2026_07_04.md
   - docs/planning/ai_agent_education_strategy_2026_07_11/README.md
   - especially 19_AGENT_CONTROL_PLANE_DESIGN.md and 20_AI_COST_AND_CAPACITY_MODEL.md.
3. docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md.
4. .remember/recent.md, .remember/archive.md and current .remember/today-*.md.
5. C:\Users\lletp\.claude\projects\E--projects-tts-prototype-android\memory\MEMORY.md and the current project_*.md it links to.
6. C:\Users\lletp\.codex\memories\extensions\ad_hoc\notes\2026-07-15-linguistpro-claude-context-transfer.md.
7. docs/research/edu-quality-agentic/2026-07-13/README.md, 10_PROPOSALS_PRIORITIZED.md, 11_ROADMAP_AND_OWNER_DECISIONS.md, 13_EXECUTIVE_RECOMMENDATION.md, and the relevant source-specific papers before F1/F2/F3/material work.

Never open .claude/PROD_OPS_PRIVATE.md unless the owner explicitly requests a production operation. Do not perform production operations, publish externally or expose credentials.

Before coding, report in 5–10 lines: what is shipped, what is really incomplete, the verified live state, the immediate slice, and owner decisions still open. Then inspect git status, HEAD, relevant code, migrations, tests and current docs. Live code wins over stale prose.

### 2. Operating protocol — mandatory on every slice

- Keep a visible task plan. Create it before substantive work; update it after each completed gate, material finding, blocker or scope change. Do not leave a stale plan while work proceeds.
- Use the R1–R17 lenses. For cross-cutting work, name the relevant lenses, run adversarial critique before substantial code, resolve red flags or surface them to the owner.
- Preserve deterministic authority: resolver/curated facts above LLM prose; grading, consent, FSRS/review_log writes and publication gates are deterministic and rule-governed.
- Treat LLM output as advisory and explicit-tap unless a separately approved authority gate says otherwise. Tutor, evaluator, memory extractor and material processor never write mastery or FSRS directly.
- Preserve MNAR: no response, timeout, later or passive exposure is not evidence of failure and does not write review_log.
- Require an independent oracle for any evaluator, new grading surface or linguistic claim. Never validate a system with the same model/source it trusts.
- Preserve ru/en/he, RTL where applicable and Playwright inspection at 380×844 for every UI change.
- Keep privacy and lifecycle strict: principal-derived scope, action-time consent, TTL, export/delete/revoke, no raw prompt/audio/material content in operational logs, no cross-user retrieval/cache/rank leakage.
- Reserve budget before model/provider calls, reconcile afterward, preserve BYOK fail-closed/no-managed-fallback behavior and implement useful deterministic degradation.
- Do not reopen PAS Wave 1, F1 hybrid BYOK, context overlay, Telegram/Mini App, review_log/FSRS-6 or Room due-continuity R1–R4.
- Do not introduce a generic MCP/A2A/free-agent platform, default transcripts, shared private memory, unbounded RAG or LLM-only grading.
- Use apply_patch for repository edits. Preserve unrelated dirty-worktree changes. Never reset, checkout or delete unrelated paths.

### 3. Program structure

Work on three coordinated tracks. They are dependencies, not one broad implementation batch.

**T — Truth**

- T0 / G0: adjudicate and repair the smoke:grader-gold contract only after the owner decides the explicit-skip D1 behavior and strict/non-strict proclitic policy by channel.
- T1: lock cross-channel golden matrices and independent oracle boundaries.
- T2: evaluator is independent, versioned, rubric-bound and initially shadow-only.

**P — Product**

- C3a: browser-local voice-to-editable-text for existing role-play only. No auto-send, speech grade, audio persistence, transcript retention or review_log write.
- N1: one deterministic shared eligibility/channel selector before the existing daily claim. Preserve one atomic user/local-day claim, quiet/mute/timezone/backoff behavior and explicit claimed-versus-delivered semantics.
- LB0: Lesson Builder from one to three explicitly selected permitted text inputs. Produce an editable, attributable lesson draft. Do not claim a persistent personal library, automatic cards, FSRS/mastery change, autonomous publication or longitudinal personalization.

**S — Scale and authority foundation**

- S0: accepted scale assumptions at 20/100/1,000/10,000 active users.
- S1: role/authority registry.
- S2: typed artifact, provenance, context-pack and handoff contracts.
- S3: CP0 observe-only run envelope.
- S4: durable job/outbox lifecycle.
- S5: SQLite/Postgres/object-storage/retrieval-index transition decision.
- S6: rights-aware material ingestion/revision/deletion lifecycle.
- S7: tenant, quota, budget, purge, audit, incident and accountable-owner model.

S0–S3 precede durable F1. S4–S7 precede persistent M1 corpus, background material processing or media ingestion. SQLite is acceptable for G0, C3a, N1 and non-durable LB0; do not migrate merely for those slices. Before CP1, durable A2 jobs, F1 at scale, M1 or M2/M3, prepare the accepted DB Scale Decision.

### 4. Immediate work package: G0 first

Do not start C3a, N1, LB0, F1, F2, F3 or CP implementation in the same coding package.

1. Reproduce the failing smoke:grader-gold result and inspect the exact fixture, grader, grade policy and Room behavior by channel.
2. Write or update a narrow G0 decision record that presents the owner with only the real semantic choices:
   - explicit production skip on receptively strong words: Hard(2) or another declared behavior;
   - strict/non-strict proclitic acceptance per read, reverse, cloze and dictated typing channels.
3. Build an independent channel-by-channel answer matrix and retain current negative, annul and MNAR cases. Do not weaken fixtures to make the gate green.
4. If the owner has not selected the semantic policy, stop after the evidence package and request that decision. Do not silently select a policy in code.
5. Once the owner decides, implement the smallest reversible repair, run relevant smoke/API suites and verify no cross-surface regression.
6. Report the result, update the task plan, make a scoped commit and push it after the owner-approved change is complete.

### 5. Slice specifications after G0

Before implementation of each later slice, create a short decision/spec artifact with: observed problem; pedagogical mechanism; visible behavior; deterministic/LLM/evaluator boundary; typed inputs/outputs; authority and autonomy tier; consent/privacy/retention; rights/trust where relevant; cost class; dependencies; rollback; telemetry; acceptance criteria; five failure modes; adversarial R1–R17 critique; independent oracle/evaluation plan; and explicit owner decisions.

#### C3a acceptance boundary

Press-to-talk becomes local editable text. The learner sends it explicitly to existing text role-play. Capability failure, cancel, timeout or recognition failure returns ordinary text UI. There is no audio/raw transcript in database, analytics, stdout, export or operational log. Test consent/revoke, no-log, ru/en/he, RTL and 380×844.

#### N1 acceptance boundary

Choose a channel before claiming the existing daily budget. Both transport jobs are adapters, not policy owners. Prove alternation, only-one-eligible behavior, concurrent claim safety, send-failure policy, mute/quiet/DST/backoff behavior and no user-crossing.

#### LB0 acceptance boundary

Use only explicitly selected permitted text; deterministic preparation obtains source windows, tokenization, resolver facts, coverage and available review targets. The LLM may sequence and phrase a lesson over those facts. Output a typed lesson draft with source IDs, objectives, source-linked sections, exercise specifications, candidate vocabulary/constructs, model/policy versions and status=draft. Learner edits and explicitly publishes. No automatic card or state mutation.

#### F1/F2/F3 and material boundary

F1 is source-linked, correctable, expiring memory; no default full transcript. F2 is deterministic eligibility plus independent shadow evaluation, with delayed/context-shift protocol and MNAR visible; it has no direct FSRS authority. F3/M1 is user notes and clearly permitted text only, with rights/trust, revision/chunk/derived-artifact/deletion lineage. OCR/PDF/media/YouTube ingestion, embeddings and background processing wait for S4–S7 plus separate owner decisions.

### 6. Architectural contracts to preserve

Use a single controller and artifact-mediated handoffs:

    principal + consent
      → scenario facade
      → policy/budget/run envelope
      → scoped logical role
      → typed artifact + content-free context manifest
      → publication gate
      → deterministic state reducer where a rule permits it

Logical roles can initially be one Node process/closed router but have distinct role IDs, allowed inputs/outputs, tools, data scope, authority, route, budget, timeout/retry, retention, publication gate and kill switch:

- Tutor
- Planner/Lesson Composer
- Material Processor
- Memory Extractor
- Evidence Selector
- Independent Evaluator
- Notification Composer
- Policy Controller
- Authoritative State Reducer

The material lifecycle is:

    uploaded → quarantined → scanned → rights_confirmed → queued
    → parsing → parsed → chunking → indexing → ready

It also supports failed, blocked, superseded, deleting and deleted. Every stage is idempotent, versioned, retryable, cancellable, budgeted, scoped, observable and crash-recoverable.

The memory lifecycle is:

    selected source interaction → candidate → learner-kept/policy-accepted record
    → corrected/contradicted/suppressed/expired → purge and zero-reference reconciliation

Raw bytes, extracted text, metadata, retrieval/index and derived artifacts are separate stores/contracts. One physical index is acceptable only with proven user/tenant/revision isolation and negative tests; no cross-user retrieval, semantic dedupe, cache reuse, ranking leakage or training.

### 7. Validation, delivery and publication

For a documentation-only decision slice, validate links, required sections, whitespace and current-worktree scope. For code, run the relevant domain smoke suites plus API smoke, inspect the diff and run all required UI/i18n/Playwright checks.

Before every commit:

1. Inspect git status and staged diff.
2. Stage only files belonging to the approved slice. Never include pre-existing unrelated untracked paths.
3. Run git diff --cached --check and relevant tests.
4. Use a precise conventional commit message.
5. Push the current branch and verify main...origin/main parity.

When a plan is approved or a repository change is completed, commit and push the scoped work. In the completion report state the commit SHA, push/parity evidence, tests, remaining decision gates and the next proposed slice. Do not claim a gate is passed without its acceptance evidence.

### 8. Stop and escalate

Stop and request an owner decision rather than guessing when policy determines: grading semantics; privacy/retention; material rights; provider/region; teacher/organization access; autonomy/publication; database migration; cost ceiling; independent evaluator/gold; or a scope expansion beyond the approved slice.

Never stop merely because the work is difficult. Exhaust safe repo-grounded diagnostics and alternatives first.

Begin now with context restoration and the G0 evidence/decision package only.
