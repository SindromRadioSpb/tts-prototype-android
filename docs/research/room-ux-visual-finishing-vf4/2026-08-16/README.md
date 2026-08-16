# ROOM-UX-VF4-R — residual visual-quality research

> Date: `2026-08-16`
> Source commit: `71b2d48ced2ad607151520bacf8443f582ec46cc`
> Implementation commit: `8dda777d`, pushed to `origin/main`
> Branch at research start: `main`; local `origin/main` and remote `refs/heads/main` matched the source commit
> Worktree at research start: `DIRTY`, 34 pre-existing entries; all runtime, CSS, JS, locale, icon, font, SW and server targets remained untouched
> Production: `https://linguistpro.kolosei.com/library.html` and `https://linguistpro.kolosei.com/index.html`, release `3.11.399`
> Actual owner client: connected authorized Chrome/Kapture profile updated by the agent from `3.11.398` to `3.11.399`; starting and ending URL `https://linguistpro.kolosei.com/library.html#room=benyehuda`
> Evidence classes: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`, `OWNER_REPORTED_PREDECESSOR`, `EXTERNAL_PRIMARY`
> Limitations: no physical device, browser zoom at actual 200%, VoiceOver/NVDA/JAWS, or other assistive-technology session was run; no text was opened from the owner Library, no audio/provider action was invoked, and no screenshot was necessary to establish the exact DOM/computed-state evidence.

> Successor status: owner approved the exact recommendation on 2026-08-16; the bounded implementation is production-green at `3.11.399` and the updated owner-client handoff is ready.

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

## Evidence boundary

- `OWNER_CLIENT_READ_ONLY` means the real authorized profile and real fixtures were observed without content, progress, presentation, provider or cache mutation.
- `ISOLATED_AUTOMATION` means a separate service-worker-blocked browser context with no owner data. It is not physical-device, AT or owner-live evidence.
- `AUTOMATED_LOCAL` proves code contracts and regressions only. It does not prove owner acceptance.
- `OWNER_REPORTED_PREDECESSOR` records the accepted VF0–VF3 baseline, including `VF3 PROD=PASS` on 2026-08-16.

No screenshots were captured: the qualifying evidence is exact DOM/ARIA state, production byte identity and computed media-query behavior. There is therefore no `screenshots/` directory or screenshot provenance index.

## Closure boundary

The research phase itself made no runtime or production change. After the owner
approved the exact recommendation, the allowlisted implementation shipped in
`8dda777d`; production and the actual owner client converged on `3.11.399`.
No owner content/learning/presentation/provider/cache state was changed, audio
was not invoked, and unrelated dirty files remain preserved. No further visual,
data, B9, security or cleanup lane is authorized by this closure.
