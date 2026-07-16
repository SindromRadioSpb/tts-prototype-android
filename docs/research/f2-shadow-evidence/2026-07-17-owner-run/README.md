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
