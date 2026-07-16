# F1 short owner-live evidence — 2026-07-16

**Status:** `OWNER_PATH_TECHNICALLY_VERIFIED / LONGITUDINAL_EVIDENCE_DEFERRED`

**Production version:** `3.11.188`

**Scope:** one same-session staged owner path. This proves technical operability for one exact allowlisted owner. It does not prove educational usefulness over days, retention impact, public-cohort safety or `OPERATIONALLY_COMPLETE`.

The exact production owner ID and digest secret are intentionally absent from git and evidence. The owner ID is stored only in the gitignored private coordinate; the digest secret exists only in production configuration.

## Development completed during the window

Owner-live exposed and closed three product gaps:

1. `6388269` added explicit `Continue later` actions to fresh plans and existing explanations, completing the direct unfinished-thread entry path.
2. `1e051dc` made `ANNULLED` and `EXPIRED` records visible in History with honest non-use labels.
3. `6ac91fa` made memory export append a compatible DOM download link and show an explicit success/failure result.

All targeted F1, Mentor Home and API gates passed after the changes.

## Stage results

### Stage 1 — explicit memory

- Global F1 enabled for one exact owner; context and candidates remained off.
- Short ru/en/he consent copy rendered.
- Store and unfinished-thread consent were explicitly granted.
- An isolated test goal was saved and later hard-deleted.
- One real owner-scoped explanation was explicitly saved with `Continue later`.
- Before Stage 2, context-query receipts remained zero.

### Stage 2 — Continue

- Context use enabled while candidates remained off.
- The explicit explanation thread was selected with an AVAILABLE source.
- Suppress immediately removed the Continue card.
- Use again restored the same thread.
- No derived pending item was involved.

### Stage 3 — deterministic proposals

- Candidate consent was granted separately.
- Exactly one explicit scan created three recent typed pending candidates.
- One was kept as `USER_CONFIRMED_DERIVED`; one was annulled; one remains pending.
- The direct user-saved explanation remained the higher-ranked Continue item.
- The pending item never entered Continue.

## Lifecycle and authority proof

- The isolated goal delete produced one erasure-journal row.
- The annulled proposal is visible in History as not used.
- Memory export reports a visible successful preparation result.
- `review_log` stayed exactly 6,146 rows before and after the window.
- F1 produced zero LLM ledger calls and zero CP0 observations.
- Unauthenticated memory access returned HTTP 401.
- CP0 stayed off throughout.

## Configuration incident

During the Stage 2 restart, the active container briefly received candidates=`1` together with context=`1` because an earlier Coolify row edit had persisted out of the intended order. Candidate consent was still off and no explicit scan occurred, so no proposal or provider action was possible. The value was reset to `0`, the container was reverified, and only then was Stage 2 adjudicated. Stage 3 later enabled candidates intentionally with separate consent.

This is evidence for retaining three independent gates: global owner allowlist, environment feature flag and category consent.

## Final production state

```text
F1 global: on
exact owner allowlist: one private principal
Continue context: on
deterministic candidates: on
CP0: off
```

Public health is green for app, DB and migrations. Disk returned to 80%, still at the inherited warning boundary; this is existing ops debt rather than an F1 green-disk claim.

Current content-safe owner counts are recorded in [metrics.json](./metrics.json). No personal text, goal text, explanation text, owner ID, key or digest appears in this evidence.

## Deferred

- multi-day usefulness and consent-comprehension measurement;
- personal-text-anchor owner smoke with a deliberately isolated source;
- destructive category revoke/delete-all after real F1 records exist;
- public cohort, wildcard allowlist or non-owner rollout;
- CP0 live window, F2 and AA2.
