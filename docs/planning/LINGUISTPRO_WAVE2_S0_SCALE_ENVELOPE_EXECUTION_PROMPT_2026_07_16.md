# LinguistPro Wave 2 — S0 Scale Envelope execution prompt

**Status:** paste-ready prompt for a separate documentation/decision session.
**Authority:** S0 recon and decision preparation only; no production code, migration, deployment or infrastructure mutation.
**Predecessor:** `LINGUISTPRO_WAVE2_LB2_CLOSURE_HANDOFF_2026_07_16.md`.

## Paste into the next session

You are continuing LinguistPro development in `E:\projects\tts-prototype-android`. Execute **S0 Scale Envelope only** as a repository-grounded documentation and owner-decision slice. Do not implement S1, S2, S3, F1, database migration, background jobs, material ingestion or a generic agent platform.

Read completely, in order:

1. `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md`.
2. `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md`.
3. `docs/planning/LINGUISTPRO_WAVE2_LB2_CLOSURE_HANDOFF_2026_07_16.md` and `LINGUISTPRO_WAVE2_LB2_LESSONS_LEARNED_2026_07_16.md`.
4. `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`.
5. `docs/planning/AI_MENTOR_RECON_2026_07_04.md`, especially platform, cost, lifecycle and authority sections.
6. `docs/planning/ai_agent_education_strategy_2026_07_11/19_AGENT_CONTROL_PLANE_DESIGN.md`.
7. Live schema, repositories, schedulers, ledgers, storage paths and provider gates needed to measure the current system. Code is primary where documents drift.

Do not open `.claude/PROD_OPS_PRIVATE.md` unless a specific read-only production measurement cannot be obtained from public health/status data and the owner explicitly authorizes that production check.

Before analysis, report in 5–10 lines: current HEAD/version/status, completed Wave 2 product slices, paused LB2 boundary, currently authoritative stores/writers, and unresolved scale decisions. Create and maintain a visible task plan.

Produce a stable decision packet that:

1. Defines explicit workload envelopes for 20, 100, 1,000 and 10,000 active users.
2. Inventories current event, review, notification, artifact, session, material, audio, model-call and job-like writes from live code.
3. Quantifies daily/peak reads, writes, retained rows/bytes, model calls, concurrency, latency and deletion/export work using declared formulas and bounded low/base/high assumptions.
4. Separates browser OPFS, server SQLite, Docker volume/object-like files, provider calls and ephemeral RAM state.
5. Identifies single-process, single-writer, lock, scheduler, backup, restore, purge, queue, rate-limit and tenant-isolation limits.
6. Defines measurable trigger thresholds for staying on SQLite versus preparing a database/object-storage transition. Do not select a new database without owner adjudication.
7. Defines SLO and failure-budget options for interactive requests, notifications, LLM composition, background work, deletion and restore.
8. Presents cost envelopes by provider/scenario and hard-stop/fairness options without changing current limits.
9. Runs an R1–R17 adversarial critique, emphasizing R12–R17 and avoiding false precision.
10. Ends with owner decision options, a recommended S0 envelope, rejected alternatives, and exact exit criteria for starting S1.

Every number must be tagged as measured fact, code-derived bound, explicit assumption or scenario estimate. Preserve unrelated `.agents/` and `docs/research/edu-quality-agentic/` paths. Use `apply_patch`, validate links and whitespace, stage only S0 documentation, make a scoped docs commit and push after the owner-approved packet is complete.
