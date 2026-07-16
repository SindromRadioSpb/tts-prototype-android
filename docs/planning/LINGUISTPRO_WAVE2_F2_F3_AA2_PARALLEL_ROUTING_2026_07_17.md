# LinguistPro Wave 2 — F2/F3 and AA2 parallel routing

**Date:** 2026-07-17

**Status:** `CURRENT_ROUTING / DOCS_ONLY / NO_NEW_EXECUTION_AUTHORITY`

**Repository baseline:** `main` at `dac5199`; package `3.11.194`.

**Authority boundary:** this document reconciles current sequencing and names the
next decision surface. It authorizes no F2 expansion, planner/context handoff,
F3 implementation, S4-S7 implementation, AA2 change, migration, provider call,
production operation, deploy, cohort expansion or live external connection.

## 1. Why this routing update is needed

The earlier Wave-2 route placed:

```text
F2 sufficient shadow chain
  -> bounded next-session/weekly preparation
  -> AA2 read-only runtime
  -> later F3/M1
```

That line mixed a dependency statement with an owner scheduling preference.
Current owner-approved work has already advanced AA2 through B0-B2 and into the
AA2-B3 D1-D7 implementation session. This does not violate an F2 transport or
data dependency: AA2-B3 is explicitly prohibited from reading F1/F2 payloads and
from exposing MCP or a live client. The documentation must therefore show AA2-B3
as an independently approved parallel engineering line, not as work blocked by
the still-open F2 evidence run.

## 2. Reconciled current state

| Track | Current factual state | Remaining boundary |
|---|---|---|
| F1 correctable continuity | Engineering complete; exact-owner path technically verified; longitudinal evidence deferred. | No automatic promotion to mastery or hidden profile authority. |
| F2 shadow evidence chain | Migration 041 and the complete B1/B2 chain are shipped. Permanent exact-owner, manual-only, public-corpus-only capability is enabled with one-new-chain/day cap. Evidence run 1 is open. UX regressions found by the owner were repaired through app `3.11.194`. | Context use, planner handoff, external evaluator, CP0, jobs, notifications and non-owner rollout remain off. The bounded report is not closed and the target of at least five completed chains per construct is not yet evidenced in canon. |
| AA2-B3 | B3 decision packet is committed at `dac5199`. The owner reports a parallel D1-D7 implementation session is in progress. | B3 remains default-off engineering only: no production key, deploy, MCP, real client, token, connection or F1/F2/private payload access unless separately approved. |
| Bounded next-session/weekly preparation | Required by the approved F2 sequencing decision, but no dedicated decision packet or implementation authority exists. | Must define a typed, reviewable draft and exact F2 handoff authority before code. |
| Wave-2 F3 / M1 | Research proposal exists for a private user learning corpus: selected notes/permitted text, rights/trust tiers, revisions/chunks and deletion lineage. No F3 decision or implementation packet exists. | Persistent corpus implementation remains behind material-rights decisions and S4-S7 runway. |

The open F2 evidence run is evidence debt, not a blanket engineering pause. It
blocks claims of owner-live sufficiency, cohort promotion and learning efficacy;
it does not block separately approved docs, isolated default-off engineering or
AA2-B3 work that consumes no F2 authority.

## 3. F3 terminology is not interchangeable

Three names must remain distinct:

1. **PAS-F3** was the Wave-1 product fork for explanation follow-up up to three
   turns. It shipped in PAS Slice A and is not pending work.
2. **Bounded next-session/weekly preparation** is the still-missing bridge after
   F2. It combines explicit F1 continuity, canonical due/review/reading facts,
   completed F2 shadow evidence and user effort/preferences into a reviewable
   draft. It has no approved F-number and must not be silently relabelled F3.
3. **Wave-2 F3 / M1** is the proposed private user learning corpus. It introduces
   material rights, trust, revision/chunk lineage and cascade deletion. It is not
   a continuation of the F2 UI and is not authorized for implementation.

## 4. What remains in F2

F2 feature expansion is not the next engineering task. The current safe work is:

- keep owner-only B1/B2 available under the frozen manual/public/one-per-day
  policy;
- continue evidence run 1 until its fixed closure condition: 14 calendar days
  or 20 eligible opportunities, whichever comes first;
- obtain, if naturally available, at least five completed chains for each
  construct; MNAR, skip, defer and lack of opportunity are not failures;
- update the stable run log from F2 metadata, not from screenshots or assumed
  button clicks;
- fix only reproducible safety, lifecycle or learner-UX defects during the run;
- at closure, record either sufficient owner-path evidence or
  `INSUFFICIENT_COMPLETIONS` without extending the denominator retroactively.

No additional F2 construct, provider evaluator, planner action, background scan,
notification or public cohort should be added while this run is open.

## 5. The missing bridge: bounded preparation decision packet

The next pedagogical planning deliverable should be a separate A/B/C packet for
**manual bounded next-session/weekly preparation**, not F3 implementation.

### Option A — deterministic, manual, reviewable draft (recommended)

- exact owner only and explicit tap;
- no provider/LLM, background job, retry worker or notification;
- inputs limited to explicit F1 goals/unfinished threads, canonical
  due/review/reading facts, preferences/effort and only terminal valid F2
  evidence summaries;
- pending, skipped, deferred, expired, disputed or annulled F2 artifacts cannot
  become learner facts or preparation priorities;
- output is a typed draft with source references, uncertainty and omissions;
- no `review_log`, FSRS, mastery, F1 memory or canonical planner write;
- user may accept, edit, dismiss or delete the draft;
- enabling the currently-off F2 planner/context handoff requires a separate
  exact-owner execution approval and a reproducible read-only projection.

This is sufficient to prove the end-to-end bridge without waiting fourteen days:
engineering can use fixtures and whatever valid completed F2 evidence exists,
while the owner evidence run continues independently. The run is still required
for any owner-live sufficiency or promotion claim.

### Option B — deterministic draft without F2 input

Use only F1 plus canonical due/review/reading facts. This can be built earlier,
but it does not validate the intended F2-to-action handoff and risks creating a
second generic daily-plan surface. It is acceptable only as a deliberately
partial substrate, not as closure of the bridge.

### Option C — hybrid/provider or proactive preparation now

Use an LLM, automatic background preparation, notifications or planner writes.
Reject for the next slice: it reopens provider evaluation, S4 durable jobs,
nuisance/cost controls and higher authority before the manual contract is proven.

## 6. Parallel execution map

```text
NOW
├─ AA2-B3 D1-D7 implementation session
│  └─ default-off fixtures only; no MCP/live client/F1/F2 payloads
├─ F2 evidence run 1
│  └─ owner manual use + defect-only hardening + evidence ledger
└─ docs-only bounded-preparation A/B/C packet
   └─ recommended Option A; no code until owner approval

AFTER B3 ENGINEERING AND PREPARATION DECISION
├─ separately approved bounded-preparation implementation
│  └─ schedule against AA2 file ownership to avoid server/package conflicts
└─ F3/M1 policy and architecture packet
   └─ rights/trust/deletion decisions; planning may proceed in parallel

ONLY AFTER F3 RIGHTS + S4-S7 GATES
└─ separately approved F3/M1 persistent-corpus implementation
```

The bounded-preparation packet is safe to prepare while AA2-B3 code is in
progress because it is documentation-only. Two simultaneous implementation
sessions should not both modify `server.js`, package/dependency files, identity,
consent, export/delete/restore or control-plane code without an explicit file
ownership split.

## 7. R1-R17 synthesis

- **R2/R4/R5/R8:** keep the next visible value one small actionable draft, use
  familiar surfaces and avoid another generic plan or learner dead end.
- **R10/R11/R17:** only completed, valid, independently evaluated F2 artifacts
  may enter a draft; shadow evidence never becomes grade or mastery.
- **R12/R13:** preparation output is a derived artifact with reproducible inputs,
  not a second learner-state writer; rollback is disable/delete, not schema loss.
- **R14/R15:** exact principal, explicit purpose consent, export/delete and no
  AA2/F3 payload widening by implication.
- **R16:** manual deterministic first slice costs zero provider units and avoids
  opening S4 job economics before a useful contract exists.

## 8. Recommended owner route

1. Let the already-running AA2-B3 D1-D7 session continue under its packet.
2. Continue F2 only as the existing owner evidence run and defect-hardening
   surface; do not add F2 authority now.
3. Prepare the bounded-preparation A/B/C decision packet next and recommend
   Option A.
4. Do not start Wave-2 F3 implementation yet. After the preparation packet,
   prepare F3/M1 rights, trust, lifecycle and S4-S7 dependency decisions as a
   parallel docs track.
5. Reconcile implementation scheduling after AA2-B3 so the two sessions do not
   collide in shared runtime/security files.

## 9. Decisions still required from the owner

No decision is required to let the current F2 evidence run or already-approved
AA2-B3 session continue. Before new code, the owner must separately decide:

1. whether to authorize preparation of the bounded-preparation A/B/C decision
   packet (recommended: yes, Option A as the target);
2. after reviewing that packet, whether to authorize its bounded implementation
   and exact-owner F2 read-only handoff;
3. whether F3/M1 should enter policy/design work after that packet or remain
   deferred;
4. later, the F3 material-rights/trust/lifecycle choices and S4-S7 prerequisites;
5. independently, every AA2-B3 deploy, AA2-C MCP and owner-live connection gate.
