# LinguistPro Wave 2 F2 — lessons learned journal

**Date:** 2026-07-17

**Scope:** owner-only F2 shadow evidence UX

**Status:** durable process guardrail

This journal records defects found by the owner on a real mobile profile and
the prevention rules that must be applied to later F2, CP0 and planner-facing
work. It does not change the approved F2 authority, consent or rollout scope.

## LL-F2-01 — Reusing a modal shell is not UX parity

**Observed:** the first F2 dialog reused the `Учить новые слова` shell and
channel rail, but B1 still rendered a small text button instead of the existing
large speaker stimulus and the instruction `Прослушай и впиши слово`.

**Cause:** implementation parity was checked at container level, not at the
complete learner interaction level.

**Rule:** when a new path claims parity with an existing learning surface,
reuse or match the full stimulus hierarchy, input layout, action vocabulary,
focus behaviour and mobile spacing—not only the title, tabs and colours.

**Required gate:** compare 380x844 screenshots of the canonical and new paths
at prompt, answer and result states.

## LL-F2-02 — Internal enums never belong in learner copy

**Observed:** `CORRECT_UNASSISTED` and `NO_EXTRA_TARGETED_PRACTICE` were shown
under the labels `Детерминированная оценка` and `Теневой совет`.

**Cause:** backend evaluator/reducer output was rendered directly instead of
passing through a learner-copy adapter.

**Rule:** internal verdict, policy, provenance and decision codes remain in
audit/export data. User surfaces must map every closed enum to plain,
actionable copy in RU/EN/HE, with an explicit safe fallback for unknown codes.
Adding an enum requires updating and testing that mapping.

## LL-F2-03 — Terminal transitions must invalidate every stale action

**Observed:** after a successful attempt the server changed the request from
`ACCEPTED` to `COMPLETED`, while the dialog and underlying mentor card retained
the old client object. Closing the result with `X` exposed a stale
`Продолжить`; pressing it reopened a task whose protected audio endpoint
correctly rejected terminal requests.

**Cause:** only the success panel was repainted. The local request state and
the underlying list were not synchronized on the terminal transition.

**Rule:** after any terminal mutation, update the local state synchronously,
remove or disable all now-invalid actions, refresh every visible projection,
and keep server authorization strict. Do not weaken the server state machine to
make a stale button appear functional.

**Required gate:** for every terminal action, test all exits—`Готово`, close
button, backdrop, Escape, navigation away and immediate reopen. No terminal
chain may expose `Начать`, `Продолжить`, submit or stimulus controls.

## LL-F2-04 — Happy-path playback is insufficient audio verification

**Observed:** an initial owner-live check proved playback while the chain was
`ACCEPTED`, but did not cover playback controls after submission or stale UI
after alternate dialog exits.

**Rule:** an audio-backed lifecycle test must cover eligibility, first play,
replay, network failure, terminal transition, alternate close paths and return
to the parent surface. A green first click is not end-to-end proof.

## LL-F2-05 — Errors must direct recovery and must not create a dead end

**Observed:** `Не удалось воспроизвести проверочное аудио` described a symptom
but offered no recovery and appeared for an action that should not have existed.

**Rule:** prevent impossible actions first. For recoverable failures, state
what the learner can do next. A visible retry remains enabled only when retry
can plausibly succeed; terminal or expired work returns to the parent surface
without counting as learner failure.

## Review checklist for the next F2 change

- R2/R17: learner feedback is educationally legible and non-authoritative.
- R4: prompt, action, result, empty and failure states are verified at 380px.
- R11: alternate exits and immediate reopen are part of the regression matrix.
- R12: canonical state and UI projections do not dual-write or drift.
- R15: terminal, expiry, deletion and revoked-consent paths expose no stale data.
- R16: audio recovery cannot silently invoke a provider.
- Internal enums appear only in machine-readable export/audit surfaces.
