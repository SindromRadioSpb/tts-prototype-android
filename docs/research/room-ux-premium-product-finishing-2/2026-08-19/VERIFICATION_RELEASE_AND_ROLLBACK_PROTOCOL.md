# Verification, release and rollback protocol

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=PREDECESSOR_CLOSURE_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Date/source: `2026-08-19`, `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`; `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty state: 34 unrelated pre-existing entries preserved; only PPF2 research/planning documents added.
- Production/client: API/Studio/Room/SW/owner Chrome `3.11.403`; `/healthz` green, DB/migrations ready, disk 64%, warning false.
- Evidence: `CODE_CURRENT`, `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `NOT_RUN`.
- Limitations/safety: physical device and AT not run; no owner-data/settings/provider/cache mutation; `review_log 7420 -> 7420`.

This protocol is prospective only. It creates no implementation authority before the exact owner approval gate.

## Red contract

The pre-change gate must reproduce all four current failures from the current commit:

- Library Journey types: `4.34:1` in light mode.
- Studio Classic next-step/phase label: `4.37:1` in light mode.
- Studio onboarding features title: `2.56:1` in light mode.
- Studio footer credit/version: `2.36:1` in light mode.

It must also prove that the fixtures target the reachable DOM nodes, not copied CSS text.

## Green contract

- Each target normal-text node is at least `4.5:1` in light, dark and both auto-system schemes; the intended semantic target is preferably above `6:1` where the current token provides it.
- Forced colors remains legible; reduced motion behavior is unchanged.
- RU and HE/RTL at 380×844, RU desktop and 200% have no new clipping, overlap, sticky/overlay obstruction or document overflow.
- Focus order, accessible names, target sizes, DOM order, copy, icons and behavior are unchanged.
- No non-GET request, content/progress/list/review/settings/provider/cache mutation or schema change occurs.
- Current i18n (`233/233`), targeted visual/media (`72/72`), reader parity, B8 unit/browser (`30/30` plus browser), Studio UX (`9/9`, browser `92/92`) and Room media gates remain green.
- `review_log` is unchanged before/after any owner-client smoke.

## Serialized release loop

1. Create the approved implementation packet and add red tests.
2. Make only allowlisted selector-local changes; bump the prospective version to `3.11.404` in the approved HTML/SW files.
3. Run red/green, unit, browser and cross-surface gates separately so a harness failure is not mislabeled as product failure.
4. Inspect desktop RU, 380×844 RU, 380×844 HE/RTL, 200% RU, dark/auto, forced colors and reduced motion.
5. Verify the exact diff allowlist and the absence of unrelated dirty-file changes.
6. Commit and push only the approved slice.
7. Wait for production HEAD and served API/Studio/Room/SW to converge on the pushed commit and `3.11.404`; verify `/healthz`, DB and migrations.
8. Update the actual owner Chrome client, resolve stale SW/cache state if necessary, and confirm the served version.
9. Run a read-only real-client smoke, preserving URL/material/data and proving `review_log` unchanged.
10. Fix any allowlisted defect and repeat the entire build/deploy/convergence/client loop.
11. Stop for explicit owner acceptance. Passing automation alone does not complete PPF2.

## Static compatibility and rollback

- There is no persisted-data or API contract change. Old HTML/new SW and new HTML/old SW must remain safe during convergence.
- Rollback target is the previously deployed `3.11.403` static set: `public/index.html`, `public/library.html`, `public/sw.js`.
- Rollback requires redeploy plus API/Studio/Room/SW convergence and actual-client refresh verification.
- No DB migration, data restoration or cache deletion is authorized. Controlled normal SW update/reload is distinct from storage/cache cleanup.

## Stop conditions

Stop and return to the owner if the correction needs a global token change, new file outside the allowlist, behavior/copy/DOM restructuring, a writer or schema change, provider/cache action, navigation ownership, or any evidence that the selected semantic token breaks another supported mode.
