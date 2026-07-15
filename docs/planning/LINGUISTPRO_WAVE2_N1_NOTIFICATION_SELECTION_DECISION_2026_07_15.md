# LinguistPro Wave 2 N1 — deterministic notification-channel selection

**Date:** 2026-07-15

**Status:** approved and implemented

**Scope:** proactive Web Push and Telegram nudges only

## Observed problem and baseline evidence

- **FACT:** `pushRepo.runPushSweep` and `nudgeRepo.runNudgeSweep` are two independent 15-minute jobs. Each enumerates users, evaluates its own eligibility and calls the shared `nudgeLedgerRepo.claimDay`.
- **FACT:** `nudge_ledger` has the correct atomic `PRIMARY KEY(user_id, local_day)`, so the current system prevents two sends on one local day.
- **FACT:** the winning channel is nevertheless determined by scheduler/process timing. The ledger arbitrates a race; it does not select a channel.
- **FACT:** Push and Telegram currently duplicate preference, mute, local-window, due and claim logic. Telegram additionally owns live consent, reason selection and adaptive backoff; Push owns subscription fanout and dead-endpoint cleanup.
- **FACT:** the current baseline is green: Web Push 21/21, Telegram nudge 54/54 and Telegram skill-gap 19/19.
- **FACT:** there is one canonical cross-channel daily budget already. N1 does not need a new table or database migration.

The product mechanism is fatigue-safe deterministic alternation: when both authorized delivery paths are eligible, the learner should not receive whichever scheduler happens to win. Channel selection must be explainable from durable state and must happen before the one atomic daily claim.

## Approved owner decisions

| Decision | Recommendation | Reason |
|---|---|---|
| Alternation anchor | **Last claimed channel** | `nudge_ledger.channel` is already the canonical at-most-once fact. A unified “last delivered” truth does not exist; adding it would introduce cross-adapter mutable state and ambiguous partial-fanout semantics. |
| Send failure | **Claim remains and counts for alternation** | Preserves the shipped claim-before-send/at-most-once rule: a lost nudge is safer than a duplicate. It also prevents a failing channel from winning again next day merely because delivery failed. |
| Only one eligible | **Choose that channel** | Alternation must never suppress the only usable path. |
| Both eligible, no history | **Push first, then alternate** | Stable cold-start tie-break and closest to current production ordering, where the Push timer is registered before Telegram. |
| Daily cap | **Exactly one claim per user/local day** | Retains the existing fatigue budget and PK invariant. |
| Neither eligible | **No claim** | Ineligibility and absence are not delivery attempts; the daily budget stays available if eligibility appears later inside the bounded local window. |

The owner approved all five choices on 2026-07-15 before implementation.

## Proposed visible behavior

There is no new UI. Existing Push and Telegram copy, `/stop`, `/resume`, `/notoday`, `/mute`, consent, deep links and on-demand commands remain unchanged.

For each user and tick:

1. Resolve the canonical local day and shared eligibility.
2. Resolve Push and Telegram channel eligibility without claiming.
3. If both are eligible, choose the opposite of the latest claimed channel; use Push for a no-history tie.
4. If only one is eligible, choose it.
5. Recheck action-time authorization for the selected channel.
6. Atomically claim `(user_id, local_day, selected_channel, reason)` once.
7. Invoke only the selected transport adapter.
8. Record content-free claimed-versus-delivered counters. A send failure does not release or move the claim.

## Typed policy boundary

```text
NotificationCandidate = {
  userId: UserId,
  localDay: YYYY_MM_DD,
  nowIso: UTC_ISO,
  prefs: {
    enabled: boolean,
    timezone: IANA_Timezone,
    window: "morning" | "evening",
    quietStartLocal: Hour,
    quietEndLocal: Hour,
    mutedUntil: UTC_ISO | null
  },
  dueCount: integer >= 0,
  channels: {
    push: { eligible: boolean, subscriptionCount: integer >= 0 },
    telegram: { eligible: boolean, chatId: string | null, backoffEligible: boolean }
  },
  lastClaimedChannel: "push" | "telegram" | null
}

SelectionDecision =
  | { selected: null, reason: SkipReason }
  | { selected: "push" | "telegram", reason: SelectReason }

ClaimOutcome = {
  claimed: boolean,
  selectedChannel: "push" | "telegram",
  delivered: boolean,
  deliveryCount: integer >= 0,
  failureCode: string | null
}
```

`SelectReason` is `ONLY_PUSH_ELIGIBLE`, `ONLY_TELEGRAM_ELIGIBLE`, `COLD_START_PUSH`, `ALTERNATE_AFTER_PUSH` or `ALTERNATE_AFTER_TELEGRAM`. Skip reasons remain content-free: disabled, muted, outside-window, already-claimed, nothing-due, no-channel, Telegram backoff or authorization failure.

## Authority, autonomy and component ownership

- **Deterministic controller:** candidate union, shared prefs/mute/window/local-day/due gates, channel eligibility, alternation and the one claim.
- **Push adapter:** subscription fanout, Web Push payload/send, 404/410 cleanup and per-subscription diagnostic timestamps. It cannot select or claim.
- **Telegram adapter:** final consent/link recheck, existing deterministic reason/copy, Telegram send, verb-only action log and Telegram-only backoff update. It cannot select or claim.
- **LLM/evaluator:** none. Notification content remains canonical class-A copy and no learner answer is evaluated.
- **Authority/autonomy:** existing bounded scheduler autonomy A1; N1 changes arbitration, not the permitted action or daily budget.

## Consent, privacy, retention, rights, trust and cost

- Push requires a user-scoped subscription. Telegram requires an active user-derived link and action-time `telegram_delivery` consent. Any revoked path is ineligible and is rechecked before claim/send.
- Notification payload remains count/reason only. No word, answer, source text, prompt or private material enters transport logs or policy telemetry.
- `nudge_ledger` remains the retained claim fact and continues to be covered by export/delete/revoke cascades. No new personal-data table is proposed.
- N1 introduces no material-rights path and no model/provider cost. Cost class is deterministic DB reads plus at most one existing transport attempt per user/day.
- Trust semantics are explicit: `claimed` means the daily attempt was reserved; `delivered` means at least one adapter send reported success. A claim is never presented as proof that a device displayed the notification.

## Dependencies, implementation shape, flag and rollback

- Add a pure selector module with no DB or transport imports.
- Add one coordinator that enumerates the union of Push subscriptions and active Telegram links by `user_id`, resolves policy once and calls one adapter.
- Add `lastClaimedChannel(userId)` to the existing ledger repository; no migration.
- Refactor the two current send bodies into adapters while retaining their current payload, consent, dead-endpoint, reason, action-log and backoff behavior.
- Replace the two production intervals with one coordinator interval while N1 is enabled. Admin compatibility endpoints may delegate to the coordinator but cannot force a channel or bypass the daily claim.
- Runtime flag: `NUDGE_CHANNEL_SELECTOR_ENABLED`. Rollback off restores the two legacy sweep paths; only one mode may schedule jobs in a process.
- Version/policy identifier: `nudge-channel-selector-v1`, emitted only in content-free aggregate diagnostics.

## Telemetry

Aggregate only:

- users examined;
- eligibility combination (`push_only`, `telegram_only`, `both`, `neither`);
- selected channel and select reason;
- claim won/lost;
- delivered/not-delivered and content-free provider error class;
- existing mute/window/backoff/consent skip counts.

No item keys, due items, notification body, chat ID, endpoint, user text or source content belongs in operational logs.

## Acceptance fixtures and independent oracle

The independent oracle is a pure table-driven policy matrix. It receives typed candidates and expected decisions without importing the coordinator, repositories or adapters.

| Fixture | Expected result |
|---|---|
| both, no history | Push selected |
| both, last claim Push | Telegram selected |
| both, last claim Telegram | Push selected |
| Push only | Push selected regardless of history |
| Telegram only | Telegram selected regardless of history |
| neither | no selection and no claim |
| same user, two concurrent coordinator calls | exactly one ledger row and at most one adapter invocation |
| two users with inverse histories | decisions stay user-scoped; no crossing |
| selected send fails | claim remains; no same-day fallback/retry; next eligible day alternates from the failed claim |
| Push dead subscription | existing cleanup; claim remains under at-most-once policy |
| Telegram consent revoked between select and claim | no claim and no send |
| mute/quiet/outside local window | neither channel claims or sends |
| DST boundary | local day/window derives from IANA timezone, not fixed offset |
| Telegram backoff + Push eligible | Push only; Push remains daily as currently approved |
| Telegram `/stop` + Push eligible | Push only |
| global disabled | neither channel eligible |
| already claimed today | no second adapter call |

Required gates: pure selector gold; coordinator concurrency/claim fixture; existing Web Push, Telegram nudge and skill-gap suites; send-failure claim semantics; mute/quiet/DST/backoff; consent/revoke; GDPR/export; no-cross-user; log hygiene; API smoke. There is no UI change, so a new ru/en/he or 380×844 visual is not applicable.

## Five primary failure modes

1. **Timing race survives:** both legacy jobs remain active with the coordinator. Shield: mutually exclusive scheduling under one runtime mode plus concurrency fixture.
2. **Alternation suppresses the only channel:** policy blindly flips to an ineligible path. Shield: filter eligibility first; alternate only inside the `both` branch.
3. **Delivery failure creates duplicate fallback:** coordinator tries the other channel after a failed send. Shield: claim-before-send remains final for that local day; failure never releases the PK.
4. **Consent changes after selection:** Telegram is selected from stale authorization. Shield: selected adapter authorization recheck occurs before claim/send; failed recheck makes no claim.
5. **Cross-user history leakage:** global “last channel” alternates users together. Shield: history query and pure candidate are keyed by principal-derived `userId`; inverse-history multi-user fixture.

## Adversarial R1-R17 critique

- **R1/R10/R11 — truth and evidence:** due count continues to use the canonical learner graph; “claimed” is not mislabeled “delivered”; notification absence is MNAR and never a learning failure.
- **R2/R4/R5 — pedagogy and UX:** exact one-per-local-day, bounded windows, mute and adaptive Telegram backoff protect against fatigue. No UI or command semantics change.
- **R3/R6 — architecture and data:** one controller owns policy and claim; adapters own delivery only. The existing ledger remains the single budget truth, with no dual-write delivery table.
- **R7/R8/R9 — operations, security and cost:** action-time consent, atomic claim, fail-closed preference reads, content-free telemetry, kill switch and no model call bound risk and cost.
- **R12/R13/R14 — platform consistency:** union enumeration is user-scoped; channel eligibility is explicit; old and new schedulers cannot run together; SQLite remains sufficient for this bounded atomic claim.
- **R15/R16/R17 — privacy, governance and educational authority:** export/delete/revoke remain structural; no content enters logs; controller has no mastery/review authority; policy version and accountable rollback flag are explicit.

## Owner gate — resolved

Approved before code:

1. alternate by **last claimed**, not last delivered;
2. a failed send keeps the claim and participates in next-day alternation;
3. when only one channel is eligible, select it;
4. cold-start tie chooses Push;
5. retain exactly one claim per user/local day.

Any future move to last-delivered fairness requires a separate durable delivery-state and partial-fanout contract and remains outside N1.
