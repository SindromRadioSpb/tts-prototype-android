# F2 permanent owner-only — evidence run 1

**Start:** 2026-07-17, Asia/Jerusalem

**Status:** `OPEN / OWNER_ONLY / MANUAL_ONLY`

**Capability:** permanent exact-owner F2/B1/B2

**Run closure:** 14 calendar days or 20 eligible opportunities, whichever is
earlier

## Frozen configuration

- one exact authenticated owner principal; no wildcard;
- F2 global, B1 and B2 enabled;
- maximum one newly created chain per owner-local day;
- explicit manual scan only;
- canonical facts read-only and targets from shipped public corpus only;
- no canonical learning write;
- no provider/LLM or quota use;
- no context use or planner handoff;
- no background candidate jobs or notifications;
- CP0 off;
- B2 remains labelled `SELF_REPORTED_RETRIEVAL`.

## Entry evidence

- Pre-change production backup completed successfully.
- Production package `3.11.190`, current source/image commit `4138cac`.
- F2 implementation commit `ed3cf11`.
- Migration 041 applied; ten F2 tables present.
- Post-redeploy health, DB and migrations ready.
- Runtime env verified: F2/B1/B2 on, exact owner match; context/planner/external
  evaluator/CP0 off.
- Agent created zero live F2 chains. The first scan is an owner UI action.

## Acceptance ledger

| Metric | Current | Closure target |
|---|---:|---:|
| Eligible opportunities | 0 | up to 20 |
| B1 completed chains | 0 | >=5 |
| B2 completed chains | 0 | >=5 |
| Canonical writes caused by F2 | 0 | 0 |
| Provider/network/quota operations caused by F2 | 0 | 0 |
| Tenant/consent/source/restore incidents | 0 | 0 |

Counts remain zero until verified from F2 metadata after explicit owner actions;
they must never be inferred from ordinary product activity. Skip, defer, expiry
and no response are MNAR, not failure.

## Stop conditions

Disable F2 global/B1/B2 and preserve content-safe evidence if any tenant leak,
canonical write, consent bypass, source mismatch, deleted-chain resurrection,
provider/network attempt, unexpected proactive delivery or materially ambiguous
UI occurs.

## Operational note

Production disk reported approximately 90% used after backup/deploy, with
reclaimable Docker images/build cache. This is a separate maintenance item, not
an F2 evidence result.

## Owner UX finding 2026-07-17

The first owner interaction found a material UI ambiguity: manual scan created
or offered an F2 chain inline, but discarded the `/offer` response instead of
opening the established `Учить новые слова` training dialog. B1 also exposed a
text field without a playable stimulus. Per the run stop condition, the owner
path is not counted as completed evidence until remediation is deployed and
reverified.

Remediation keeps F2 storage and evaluation separate while reusing the familiar
training dialog vocabulary: `Тренировка` plus the visible Reading/Audio/RU→HE/
Dictation channel rail. Only the construct-valid channel is enabled (B1
Dictation, B2 Reading). B1 eligibility now requires an already-baked public
audio asset and playback uses an authenticated owner-scoped endpoint; it cannot
invoke a provider or write canonical learning state.

## Owner UX finding 2 — terminal-state and learner-copy defects

The owner completed the B1 attempt on a real mobile device and found two more
material defects:

1. the result exposed internal evaluator/reducer vocabulary
   (`CORRECT_UNASSISTED`, `NO_EXTRA_TARGETED_PRACTICE`) instead of learner copy;
2. after submission, closing the dialog outside the `Готово` path left a stale
   `Продолжить` action. Reopening it displayed an audio control for a request
   already terminal on the server, producing an audio error and a dead end.

The remediation keeps the server's terminal-state protection intact, updates
the client request to `COMPLETED` immediately, refreshes the mentor projection,
and maps all closed verdict/decision codes to RU/EN/HE learner copy. B1 now
uses the canonical large speaker stimulus and `Прослушай и впиши слово`
hierarchy from the ordinary training flow. Durable prevention rules are in
`docs/planning/LINGUISTPRO_WAVE2_F2_LESSONS_LEARNED_2026_07_17.md`.

## Kapture owner-live regression — 2026-07-17

The remediated production flow was exercised through the authenticated owner
profile with real button presses at a 380x844 viewport:

1. opened an existing `OFFERED` B1 chain through the top-level `Продолжить`;
2. pressed `Начать` and confirmed the canonical large speaker stimulus,
   `Прослушай и впиши слово`, inline input/check controls and `Не знаю`;
3. pressed the speaker control and observed successful playback startup with no
   visible audio error; the replay control returned to enabled state;
4. submitted the explicit synthetic value `TESTONLY`, received only learner
   copy (`Пока не совпало` plus the later-practice guidance), and observed no
   evaluator or reducer enum in the dialog;
5. closed the completed result with `X`, not `Готово`, and confirmed that the
   mentor surface showed `Найти небольшую проверку`, not stale `Продолжить`;
6. confirmed the completed history card also used learner copy, then deleted
   the entire synthetic chain;
7. pressed `Найти небольшую проверку` from the empty state, confirmed that the
   newly created offer opened directly in the training dialog, closed it and
   deleted that second test chain before any attempt.

Final owner state after the regression: evidence list empty; both agent-created
test chains deleted. No provider/LLM, planner, CP0, background job, notification
or canonical learner-memory write was invoked by this test.

## Owner UX finding 3 — stale locale bundle exposed dotted keys

The next real mobile attempt produced `NEAR_MISS`, but the result panel showed
the dotted i18n keys `room.mentor.evidence.verdictNearMiss` and
`room.mentor.evidence.adviceContext`. The mobile PWA had loaded the new result
renderer with an older locale bundle, and the mentor host adapter did not treat
`translated === key` as a missing translation.

Remediation is two-layered: Reading Room locale script URLs are now versioned
in lockstep with Studio, and the mentor translation adapter always falls back
to its user-facing copy when the host translator returns a missing dotted key.
This prevents raw namespace leakage even during partial service-worker/browser
cache activation.
