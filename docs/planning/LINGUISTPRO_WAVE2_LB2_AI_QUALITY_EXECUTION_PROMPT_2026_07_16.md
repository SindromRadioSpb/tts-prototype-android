# LinguistPro — LB2-A AI lesson quality execution prompt

**Status:** paste-ready prompt for the next implementation session.

**Decision source:** `docs/planning/LINGUISTPRO_WAVE2_LB2_AI_QUALITY_DECISION_2026_07_16.md`.

**Code baseline when authored:** implementation commit `befa734`, package and production `3.11.181`; inspect current HEAD because a later documentation-only commit publishes this prompt.

## Paste the following prompt into the next session

You are continuing LinguistPro development in `E:\projects\tts-prototype-android`. Implement **LB2-A only**: diagnosable deterministic lesson validation, schema-constrained generation where the existing provider route supports it, code-directed one-shot repair, honest localized degradation reasons, and an unscored Hebrew-gold packet. Do not promote the shadow critic or weaken any LB1 gate.

### 1. Restore current context

Read completely, in order:

1. `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md`.
2. `docs/planning/LINGUISTPRO_WAVE2_LB2_AI_QUALITY_DECISION_2026_07_16.md` — controlling contract.
3. `docs/planning/LINGUISTPRO_WAVE2_LB1_LESSON_STUDIO_DECISION_2026_07_16.md`.
4. `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md` and `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`.
5. Relevant educational-quality sources: `docs/research/edu-quality-agentic/2026-07-13/README.md`, `10_PROPOSALS_PRIORITIZED.md`, `11_ROADMAP_AND_OWNER_DECISIONS.md`, `13_EXECUTIVE_RECOMMENDATION.md`, and `docs/planning/ai_agent_education_strategy_2026_07_11/19_AGENT_CONTROL_PLANE_DESIGN.md`.
6. Live code and fixtures: `agent/lessonBuilder.js`, `agent/llmGate.js`, provider adapters used by `llmGate`, `agent/constructs.js`, `public/js/mentor-home.js`, `public/js/lesson-artifact.js`, `scripts/premium/lesson-builder-smoke.js`, and `scripts/premium/fixtures/lesson-builder-lb1/`.

Do not open `.claude/PROD_OPS_PRIVATE.md`; this slice requires no private production coordinates.

Before editing, report in 5-10 lines: shipped LB1 state, the observed `LLM_OUTPUT_INVALID` limitation, exact LB2-A boundary, current git status/HEAD/version, and remaining owner gates. Create and maintain a visible task plan.

### 2. Recon and adversarial design before code

Inspect the exact current provider/model route and determine whether it already supports provider-native JSON Schema or structured output. If current provider documentation is required, use only primary official provider documentation and record the verified capability; do not guess an API field.

Run an R1-R17 adversarial critique focused on:

- structural acceptance being mistaken for Hebrew correctness;
- a validator that silently drops invalid sections and accidentally accepts a partial lesson;
- repair codes leaking source/model content;
- BYOK falling back to a managed key;
- metrics becoming a raw prompt/response store;
- a critic certifying its own composer;
- acceptance-rate optimization weakening hard gates;
- mobile/RTL explanations becoming noisy or inaccessible.

Resolve blockers in the decision doc or stop for an owner decision if the resolution changes the approved boundary.

### 3. Implement the detailed validator

Refactor nullable composition validation into a pure detailed validator matching the LB2 contract:

```js
{ ok: true, value, codes: [] }
{ ok: false, value: null, codes: [...] }
```

Use the exact minimum code vocabulary from the decision doc. Codes must be stable, ordered, deduplicated and content-free. Do not accept a lesson by silently filtering away an invalid selected-focus exercise or a foreign anchor. Preserve a compatibility wrapper only if existing consumers require it.

Add independent fixtures for every code, including combined failures and valid controls. Lock the invariant that every selected focus has an admissible exercise and every controlled vocabulary/grammar exercise has an expected answer.

### 4. Constrain generation and repair

Represent the composition contract once. Reuse it for prompt instructions, provider schema where supported, validation and fixtures; do not create divergent hand-maintained schemas.

- Prefer verified provider-native structured output through the existing `llmGate` route.
- Keep strict post-parse validation even in native schema mode.
- If native mode is unavailable, keep strict JSON prompt mode and report `schema_mode=prompt_json`.
- Preserve BYOK fail-closed/no-managed-fallback behavior.
- Keep exactly one repair.
- Send the repair exact failure codes and the same frozen allowlists/facts. It may not expand sources, anchors, constructs or load.
- Never log raw first/repair candidates.

Do not change grading, `review_log`, FSRS, learner graph authority, consent, durable storage or lesson TTL.

### 5. Add content-free diagnostics and honest UI

Return/persist only the diagnostic fields approved in the decision doc. Use bounded buckets for latency/output size if such fields are persisted. Reuse the existing LLM usage ledger rather than creating a second cost truth.

In the Lesson Studio, add a compact localized disclosure explaining why the safe plan was used. Map internal codes into a small user-facing grouping; do not dump raw arrays or provider errors. Preserve the distinction among:

- provider/key/budget unavailable;
- invalid JSON;
- contract rejection such as anchors/focus/answers;
- accepted AI draft.

Update ru/en/he. Inspect at 380x844 and Hebrew RTL. Keep the same-document route and the closed `lesson -> source -> lesson` loop.

### 6. Create the unscored Hebrew-gold packet

Create the stable files specified by the decision under `docs/research/lesson-quality/2026-07-16/`. Reuse/link the LB1 rubric rather than silently changing its semantics. Use public-domain or synthetic inputs only. Include provenance, source commit, generation commands, artifact status and clear reviewer instructions.

The worksheet must be blank/`UNSCORED`. Do not invent human judgments, thresholds or promotion results. Do not enable the shadow critic for learner-visible behavior.

### 7. Required verification

At minimum run:

- `npm run smoke:lesson-builder`;
- `npm run smoke:agent-explain`;
- `npm run smoke:i18n`;
- `npm run gate:log-hygiene`;
- `npm run smoke:auth`;
- `npm run test:api-smoke`;
- syntax checks for changed JS;
- `git diff --check` and `git diff --cached --check`.

Add a sentinel proving source/model/learner content cannot enter diagnostics or logs. Test first-pass accept, first-pass reject plus repair recovery, double reject to safe plan, provider unavailable, BYOK failure, combined codes, foreign IDs, and prior schema-1/schema-2 session compatibility.

For UI changes, use Playwright at 380x844 and inspect the screenshot. Then commit and push the scoped slice, poll production version convergence, and verify through Kapture on the connected owner tab. Do not delete or overwrite the owner's existing lesson draft; use a separate browser session/tab for destructive test artifacts and clean those artifacts afterward.

### 8. Delivery discipline

- Use `apply_patch` for edits.
- Preserve unrelated `.agents/` and `docs/research/edu-quality-agentic/` worktree paths.
- Stage only LB2-A files.
- Bump package/SW coherently for changed precached assets.
- Keep task plan status current after each real gate.
- Make a scoped conventional commit and push after all approved gates pass.
- Final report: stable artifact paths first, commit SHA, tests, Kapture evidence, measured limitations, and explicit LB2-B owner decisions.

Stop rather than guess if implementation requires selecting a new provider/model, increasing cost ceilings, persisting raw content, enabling shadow publication authority, or changing lesson durability. Those decisions are not granted by LB2-A.

Begin now with context restoration, repo-grounded recon and the adversarial critique. Then implement LB2-A end to end.
