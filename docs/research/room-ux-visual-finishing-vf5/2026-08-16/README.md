# ROOM-UX-VF5-R research index

Artifact date: `2026-08-16`

> Historical research snapshot. Its `NO_GO_KEEP_PROGRAM_CLOSED` conclusion was
> correct for evidence available on this date. New owner production evidence on
> `2026-08-17` justified and closed exactly one bounded correction at `3.11.403`.
> Current successor record:
> [2026-08-17 regression-correction evidence](../2026-08-17/README.md).

Decision: `NO_GO_KEEP_PROGRAM_CLOSED`

## Evidence passport

- Source: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`.
- Local/remote: local `HEAD`, local `origin/main` and remote `refs/heads/main` matched.
- Dirty state: 34 unrelated pre-existing tracked/untracked entries at preflight. This session adds only this exact research directory and the VF5 decision packet; nothing is staged, committed or pushed.
- Production: `https://linguistpro.kolosei.com/library.html` and `https://linguistpro.kolosei.com/index.html`.
- Release: API/Studio/Room/SW `3.11.399`; `/healthz` green, DB and migrations ready; disk `86%`, `disk_warn=true`.
- Actual owner client: Chrome `3.11.399`, no visible update action, preserved at `https://linguistpro.kolosei.com/` with the pre-existing Studio material left open and untouched.
- Evidence classes: `CODE_CURRENT`, `AUTOMATED_LOCAL`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED_PROTOCOL_PASS`.
- Limitations: physical iPhone/Android and VoiceOver/NVDA/JAWS/TalkBack remain `NOT_RUN`; automation is not physical-device or AT evidence; no current owner-profile Library route was opened because changing presentation state was unnecessary.
- Owner-data safety: no owner text was opened, edited, saved, graded or synthesized; no TTS/ASR/MT/LLM action, presentation-key inspection/change, cache action, update click, non-GET production action or cleanup occurred.

## Result

No post-closure visual regression or accessibility necessity crosses the VF5 re-entry threshold. Current production bytes match current source for the inspected visual/runtime cohort, and there is no runtime commit after VF4. The shipped VF0–VF4 contract is green locally and in isolated production evidence.

One current owner-client console error is routed out of VF5: Studio failed to persist `ide.table.widths.v1` because `localStorage.setItem` raised `QuotaExceededError`. It was not visibly surfaced, the current 544-row layout had no page overflow, and diagnosing storage ownership/quota would exceed the visual-only boundary. No owner storage was inspected or mutated.

## Artifacts

1. [VF0_VF4_CLOSED_BASELINE.md](./VF0_VF4_CLOSED_BASELINE.md)
2. [POST_CLOSURE_SURFACE_COMPONENT_STATE_INVENTORY.md](./POST_CLOSURE_SURFACE_COMPONENT_STATE_INVENTORY.md)
3. [LIVE_OWNER_CLIENT_EVIDENCE.md](./LIVE_OWNER_CLIENT_EVIDENCE.md)
4. [A11Y_MOTION_RTL_REFLOW_REGRESSION_AUDIT.md](./A11Y_MOTION_RTL_REFLOW_REGRESSION_AUDIT.md)
5. [CSS_TOKEN_OWNERSHIP_AND_DEBT_RECHECK.md](./CSS_TOKEN_OWNERSHIP_AND_DEBT_RECHECK.md)
6. [VF5_OPTIONS_AND_ROLE_SYNTHESIS.md](./VF5_OPTIONS_AND_ROLE_SYNTHESIS.md)
7. [VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md](./VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md)
8. [FINDINGS.md](./FINDINGS.md)
9. [VF5 decision packet](../../../planning/ROOM_UX_VISUAL_FINISHING_VF5_DECISION_PACKET_2026_08_16.md)

No screenshots were captured. DOM/ARIA/computed-style values, exact served-byte comparison and deterministic contract gates were sufficient, so there is no `screenshots/README.md`.
