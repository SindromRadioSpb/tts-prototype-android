# ROOM-UX-VF4-R findings

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local/remote origin converged
> Implementation commit: `8dda777d`, pushed to `origin/main`
> Dirty status: 34 unrelated pre-existing entries remain preserved and unstaged; VF4 runtime/release work is isolated in `8dda777d`
> Production/client: API, Studio, Room, SW and actual owner client `3.11.399`; update applied by the agent
> Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`, `OWNER_REPORTED_PREDECESSOR`, `EXTERNAL_PRIMARY`
> Limitations: no physical device or AT speech; implementation automation is not either.

## Decision

Recommend:

```text
F1=TARGETED_RESIDUAL_A11Y_STATE
SCOPE=ROW_AUDIO_MARKER_AND_ROW_TTS_CONTROL_ONLY
```

## Why the threshold is met

- The qualifying state exists in a real current owner workflow: Studio showed 42 row markers, including both ready and profile-mismatch truth.
- All Studio markers are hidden from AT.
- The exact production Reader forced-colors CSS makes every readiness state the same filled circle.
- Exact production Studio CSS leaves state collisions and a working pulse under reduced motion.
- Exact production Reader JS emits Russian row-TTS names in HE/EN and retains the play name while the actual action becomes stop.
- The correction can remain one component family with no audio/data/provider/writer change and a static rollback.

## Why other residuals do not qualify

- Remaining visible emoji are text-labelled affordances, content, decoration or compatibility fallbacks.
- My Texts empty/error conflation is known reliability/state debt without a current owner-visible production proof and is not a visual-only fix.
- Studio inline styles and `!important` counts are internal debt with a larger regression radius than user benefit.
- VF0–VF3 shell, corpus, Reader/Morph/Trainer/Mentor and Studio finishing remain owner-accepted and closed.
- Physical mobile, 200% and AT evidence gaps are verification rows, not manufactured scope.

## Boundary

Future implementation may change only the existing Room/Studio row-audio marker and row-TTS presentation/name state plus exact locale/cache/release locks and allowlisted tests/evidence. It may not change audio truth, persistence, TTS selection, provider invocation, table geometry, notes/editing, learning state, B9, security work or general visual debt.

## Closure state

The owner approved the exact recommendation. The bounded `3.11.399`
implementation is locally and production green in commit `8dda777d`. The agent
applied the visible update action in the real owner client, preserved the
Ben-Yehuda URL, and completed the read-only VF4 DOM/ARIA/focus/overflow/console
smoke without invoking audio or changing owner data. The handoff was ready.

That handoff was subsequently accepted by the owner.

The owner subsequently reported: **«Проверил по протоколу. Тестирование
пройдено успешно.»** VF4 is therefore `CLOSED_OWNER_ACCEPTED_PROD_PASS`.
Actual desktop Chrome 200% is owner-reported PASS because it was an explicitly
required checklist row. Physical mobile and AT speech remain `NOT_RUN`; optional
protocol rows not separately enumerated are not promoted to individual claims.
