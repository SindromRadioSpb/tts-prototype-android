# ROOM-UX-VF4-R — residual visual-quality research

> Date: `2026-08-16`
> Source commit: `71b2d48ced2ad607151520bacf8443f582ec46cc`
> Implementation commit: `8dda777d`, pushed to `origin/main`
> Branch at research start: `main`; local `origin/main` and remote `refs/heads/main` matched the source commit
> Worktree at research start: `DIRTY`, 34 pre-existing entries; all runtime, CSS, JS, locale, icon, font, SW and server targets remained untouched
> Production: `https://linguistpro.kolosei.com/library.html` and `https://linguistpro.kolosei.com/index.html`, release `3.11.399`
> Actual owner client: connected authorized Chrome/Kapture profile updated by the agent from `3.11.398` to `3.11.399`; starting and ending URL `https://linguistpro.kolosei.com/library.html#room=benyehuda`
> Evidence classes: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`, `OWNER_REPORTED_PREDECESSOR`, `EXTERNAL_PRIMARY`
> Limitations: no physical device, VoiceOver/NVDA/JAWS, or other assistive-technology session was run; actual desktop Chrome 200% is owner-reported protocol evidence, not agent-observed/physical/AT evidence; the agent did not invoke audio/provider actions.

> Successor status: `CLOSED · OWNER ACCEPTED · PRODUCTION 3.11.399`; the owner reported the supplied protocol passed successfully on 2026-08-16.

## Research result

The recommended F1 outcome is:

```text
TARGETED_RESIDUAL_A11Y_STATE
```

One residual successor was justified, but only for the shared Room/Studio **row-audio marker and row-TTS control family**. The `3.11.398` research baseline proved all of the following:

1. the actual owner Studio fixture contains 42 row-audio markers—29 `state-ok` and 13 `state-mismatch`—and all 42 are `aria-hidden` with no accessible name;
2. the production Reader CSS deliberately maps every forced-colors marker state to the same filled circle;
3. Studio's duplicate `state-working` pulse remains animated while `prefers-reduced-motion: reduce` matches;
4. the shared Reader builder emits Russian row-TTS names in EN and HE, and play/loading/stop/error transitions change glyph and function without updating the accessible action name.

This is a bounded accessibility/truthful-state defect. It is not authorization to replace remaining emoji, clean Studio's 446 inline styles, redesign the action column, change audio truth or writers, or reopen VF0–VF3.

## Artifact index

- [VF0_VF3_CLOSED_BASELINE.md](./VF0_VF3_CLOSED_BASELINE.md) — accepted baseline and immutable contracts.
- [RESIDUAL_SURFACE_COMPONENT_STATE_INVENTORY.md](./RESIDUAL_SURFACE_COMPONENT_STATE_INVENTORY.md) — exact residual inventory and dispositions.
- [LIVE_OWNER_CLIENT_EVIDENCE.md](./LIVE_OWNER_CLIENT_EVIDENCE.md) — source/release convergence and read-only browser evidence.
- [A11Y_MOTION_RTL_REFLOW_GAP_AUDIT.md](./A11Y_MOTION_RTL_REFLOW_GAP_AUDIT.md) — the qualifying accessibility-state defect and negative findings.
- [CSS_TOKEN_OWNERSHIP_AND_DEBT_MAP.md](./CSS_TOKEN_OWNERSHIP_AND_DEBT_MAP.md) — shared/local ownership, specificity and debt verdict.
- [SUCCESSOR_OPTIONS_AND_ROLE_SYNTHESIS.md](./SUCCESSOR_OPTIONS_AND_ROLE_SYNTHESIS.md) — A–D comparison, R-role critique and F1–F8 values.
- [VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md](./VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md) — future red/green, compatibility, deployment and rollback protocol.
- [FINDINGS.md](./FINDINGS.md) — concise decision record.
- [VF4_IMPLEMENTATION_EVIDENCE.md](./VF4_IMPLEMENTATION_EVIDENCE.md) — owner approval, red/green, isolated browser matrix, production and owner-client release rows.
- [ROOM_UX_VISUAL_FINISHING_VF4_DECISION_PACKET_2026_08_16.md](../../../planning/ROOM_UX_VISUAL_FINISHING_VF4_DECISION_PACKET_2026_08_16.md) — owner decision packet.
- [ROOM_UX_VISUAL_FINISHING_PROGRAM_CLOSURE_2026_08_16.md](../../../planning/ROOM_UX_VISUAL_FINISHING_PROGRAM_CLOSURE_2026_08_16.md) — final VF0–VF4 owner-accepted program closure.

## Evidence boundary

- `OWNER_CLIENT_READ_ONLY` means the real authorized profile and real fixtures were observed without content, progress, presentation, provider or cache mutation.
- `ISOLATED_AUTOMATION` means a separate service-worker-blocked browser context with no owner data. It is not physical-device, AT or owner-live evidence.
- `AUTOMATED_LOCAL` proves code contracts and regressions only. It does not prove owner acceptance.
- `OWNER_REPORTED_PROTOCOL_PASS` is the owner's final acceptance of the supplied checklist. It does not convert optional unenumerated, physical-device or AT rows into PASS.
- `OWNER_REPORTED_PREDECESSOR` records the accepted VF0–VF3 baseline, including `VF3 PROD=PASS` on 2026-08-16.

No screenshots were captured: the qualifying evidence is exact DOM/ARIA state, production byte identity and computed media-query behavior. There is therefore no `screenshots/` directory or screenshot provenance index.

## Closure boundary

The research phase itself made no runtime or production change. After the owner
approved the exact recommendation, the allowlisted implementation shipped in
`8dda777d`; production and the actual owner client converged on `3.11.399`.
The owner then reported the supplied verification protocol PASS, closing VF4
and the overall Visual Finishing successor program.
The agent handoff changed no owner content/learning/presentation/provider/cache
state and did not invoke audio; the later owner report contains no separate
provider/cache detail. Unrelated dirty files remain preserved. No further
visual, data, B9, security or cleanup lane is authorized by this closure.
