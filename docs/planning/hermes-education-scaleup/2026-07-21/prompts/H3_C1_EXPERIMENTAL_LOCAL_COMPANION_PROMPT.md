# H3 C1-X — Experimental Local Companion implementation and verification

Use only after the owner-approved C1-X decision is present in `STATUS.md`.

## Read first

1. `CLAUDE.md`, `docs/PROJECT_ROLES.md`.
2. `C1_EXPERIMENTAL_LOCAL_COMPANION_PLAN_2026_07_24.md` in this package.
3. `05_HORIZON_3_RND_CHARTERS.md` §C1 and §C1-X.
4. `10_ACCEPTANCE_GATES_AND_CLOSURE.md` §5.1 and `11_HANDOFF_TO_CODEX_5_6_SOL.md`.
5. C1 `PREREGISTRATION.md`, `REPORT.md`, frozen `prototype/c1_score.py` and manifest.
6. `.claude/PROD_OPS_PRIVATE.md` only for approved production operations.

## Objective

Implement, deploy and verify the bounded `C1 Experimental Local Companion` described in the plan.
Do not change the frozen scorer, thresholds or negative research verdict.

## Hard boundaries

- Exactly 25 curated targets; no arbitrary pronunciation claim.
- Production server receives no audio/profile/features/result and loads no pronunciation model.
- Loopback companion only; token + exact origin allowlist + caps + temp deletion + single-flight.
- Opt-in and advisory wording with 60% / 30% / stress 2/10 visible before use and beside result.
- No FSRS, `review_log`, grade, mastery, progress, agent memory, analytics, LLM or provider path.
- MMS_FA use depends on the owner-declared noncommercial status; attribution visible; monetization
  stops/disables the path.
- Missing companion/profile/alignment is typed unavailable/unscorable, never guessed.
- `C1_EXPERIMENTAL_ENABLED=0` is the production rollback.

## Required execution

1. Live preflight: revision/version/worktree, health, disk/RAM, flag state and exact mutations.
2. Implement companion, local profile derivation, production UI, ru/en/he strings, CSP/microphone
   policy, runtime flag, SW/version bump and focused tests.
3. Run adversarial review against R1/R2/R4/R5/R10–R17; repair every blocker.
4. Run Python, Node, i18n, API and browser gates; inspect 380×844 screenshot.
5. Update plan/report/STATUS with evidence, commit only allowlisted files, push `main`.
6. Verify deploy landing, health, fresh config/assets, disclosure, opt-in, typed missing-companion
   state and rollback flag contract. Owner-device real local scoring remains an explicit final gate.

## Stop conditions

Stop before mutation/deploy if the design requires cloud/server audio, a learner-state write,
wildcard CORS, public companion bind, removal of visible limitations, a model inside the 1.5 GB
Node container, or any claim that the C1 research benchmark passed.
