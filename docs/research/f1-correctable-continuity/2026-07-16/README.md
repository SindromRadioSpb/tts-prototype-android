# F1 correctable continuity — engineering evidence

**Date:** 2026-07-16

**Status:** `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`

**Source:** implementation commit `4276cf5`; package `3.11.185`.
**Epistemic limit:** synthetic and local evidence proves implementation contracts, not learner usefulness. No owner-live window was opened.

## Scope proved

- migration 040 creates a bounded, user-scoped two-kind memory store, immutable revisions, typed source links, content-free query receipts and an erasure journal;
- direct declarations are distinct from pending deterministic candidates and user-confirmed derived records;
- pending, suppressed, expired, annulled, resolved, oversized or source-invalid items cannot enter `Continue`;
- Keep/Correct/Suppress/Unsuppress/Reconfirm/Resolve/Annul/Delete use closed actions and revision preconditions;
- task closure, explanation purge, public/private revision drift, personal-source consent and canonical-event ownership are rechecked by named adapters;
- hard delete and consent revoke purge content, while old-backup restore replay prevents resurrection;
- account export/delete covers F1 data without exporting keyed digests; `review_log`, FSRS, grading, profile truth, linguistic truth and consent authority remain unchanged;
- Mentor Home exposes opt-in controls, one Continue card, provenance, Active/Proposals/Hidden/History, lifecycle actions, memory export and delete-all in ru/en/he;
- all production flags remain default-off, CP0 remains off, and no wildcard allowlist is supported.

## Deterministic gates

| Gate | Result |
|---|---|
| `npm run smoke:f1` | PASS: contract, lifecycle, source revoke, isolation, restore and UI |
| `npm run smoke:f1:load` | PASS: 10,000 operations; 2,000 receipts; p95 2.88 ms; p99 3.712 ms |
| external/provider tripwire | PASS: 0 network attempts; 0 provider calls |
| `npm run smoke:memory-canon` | PASS 79/79 |
| `npm run smoke:fsrs` | PASS 30/30 |
| `npm run smoke:agent-profile` | PASS |
| `npm run smoke:mentor-home` | PASS 25/25 |
| `npm run smoke:agent-plan` | PASS 32/32 |
| `npm run smoke:agent-explain` | PASS 43/43 |
| `npm run smoke:cp0` | PASS; 28 registered scenarios; observer default-off |
| `npm run test:api-smoke` | PASS |
| `npm test` | Known baseline failure only: `classic mode keeps table fine-tuning in a secondary advanced area`; missing historical `btnTableCustomizeToggle` fixture, outside F1 |

Machine-readable load output is in [metrics.json](./metrics.json).

## Mobile UI evidence

The screenshots use a synthetic local owner, no external provider, and a measured browser content viewport of exactly 380×844.

- [Russian](./screenshots/f1-memory-ru-380x844.png)
- [English](./screenshots/f1-memory-en-380x844.png)
- [Hebrew RTL](./screenshots/f1-memory-he-380x844.png)

The visual pass confirmed 380px containment, readable authority/boundary copy, consent switches, Continue disclosure, no horizontal action overflow, English localization and Hebrew RTL direction. It is synthetic evidence, not owner-live evidence.

## Post-diff R1–R17 adversarial review

| Lens | Result |
|---|---|
| R1 linguistic truth | PASS — memory kinds cannot encode linguistic facts; resolver/canon untouched |
| R2 pedagogy | PASS — one explicit unfinished action; no engagement inference |
| R3 graph/provenance | PASS — closed, user-scoped adapters; no fuzzy re-anchor |
| R4 UX/accessibility | PASS — progressive mobile block, ru/en/he and RTL evidence |
| R5 product truth | PASS — copy says continuity, not hidden AI understanding |
| R6 corpus/privacy | PASS — bounded locators/digests only; no source body store |
| R7 register | PASS — no model paraphrase; correction is direct user input |
| R8 scaffolding | PASS — 7/30/90/365-day expiry plus 30-day terminal purge |
| R9 authority | PASS — `USER_CONFIRMED_DERIVED` never becomes `USER_DECLARED` |
| R10 evidence | PASS — synthetic contract claims are separated from live usefulness |
| R11 source drift | PASS — revision/digest mismatch excludes context |
| R12 dual truth | PASS — only two stored memory kinds; profile/review truth not copied |
| R13 rollback/restore | PASS — default-off rollback and per-memory resurrection proof |
| R14 authorization | PASS — principal-derived user scope and foreign-ID negatives |
| R15 revoke/delete | PASS — synchronous bounded purge, fail-closed use and erasure journal |
| R16 economics | PASS — deterministic only; external/provider count zero |
| R17 assessment integrity | PASS — no mastery/grade/FSRS writes; MNAR/canonical gates green |

No unresolved R1–R17 blocker remains for a default-off deployment. Live usefulness, consent comprehension and owner behavior remain deferred to a separately approved owner-live packet.

## Default-off deployment

The public rollout of `3.11.185` was witnessed after an uptime reset with `ok=true`, `db.ready=true` and `migrations.ready=true`. No F1 or CP0 configuration was changed, so all new feature gates remain at their code defaults. Disk usage returned from the transient build peak to the pre-existing 81% warning level already recorded by CP0; this is inherited ops debt, not an F1 green-disk claim.

## Boundaries retained

- CP0 was neither included nor enabled; only content-safe scenario parity was extended.
- AA2 was not started. AA0 inventory and AA1 documentation may continue independently, but OAuth, tool-schema, threat-model, recipient-consent and downstream-retention contracts remain promotion gates.
- F2 misconception/skill memory, S4 background jobs, S5 retrieval, S6 evaluation and S7 cohort operations remain out of scope.
- No production secret or `.claude/PROD_OPS_PRIVATE.md` was read for this evidence.

## Next step requiring separate authority

Do not enable F1/CP0 or start an owner-live window under this packet. A separate owner-live packet must approve exact owner IDs, consent copy, flags, rollback and the evidence window.
