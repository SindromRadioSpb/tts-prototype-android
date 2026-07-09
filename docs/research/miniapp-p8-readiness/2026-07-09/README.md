# CLG-P8 Mini App — readiness measurement artifacts (2026-07-09)

## What this is
Support artifacts for the §3.2 "measured readiness" table in
`docs/planning/TELEGRAM_MINI_APP_P8_RECON_2026_07_09.md`.

## Files
- **`measure-readiness.sql`** — read-only query set that emits **distributions, not verdicts**
  (overdue-day histogram, FSRS stability buckets, review-by-channel, challenge outcomes,
  exposure ledger, select_reason mix). Feeds the §7 threshold owner-forks (overdue /
  almost-lapsed / fresh-due reservation) — thresholds are set *from* these numbers, per the
  measure-before-code discipline (R10).

## How it was generated
Hand-authored against the confirmed schema of `data/app.db` (migrations 001–033), read via
`sqlite_master` on 2026-07-09. Every referenced column was verified to exist.

## Which file to run — and WHERE
`measure-readiness.sql`. **Run on PROD, read-only:**
```
sqlite3 -readonly /app/data/app.db < measure-readiness.sql
```
**Why not locally:** the local dev DB (`data/app.db`) has **zero owner rows** in every CLG/P7
table (`review_log`, `agent_challenges`, `channel_links`, `srs_projections`, `users` = 0; only
`sentences` = 7494, the shipped dataset). The real owner learner-graph profile lives **only on
the prod volume**. This is an **owner-gated** action (prod DB access).

## Status of these numbers
Raw query tooling — **not yet run** against the owner profile. The output, once captured, should
be pasted back into recon §2.2 with the run date.

## PENDING (not pure SQL — builder-driven, recon §2.3)
- **% of current due items with a resolvable, non-leaking source-sentence anchor** (the number
  that gates the context-first honesty claim + owner fork-4). Requires running the live
  context-first builder over the due set, not a static join. Do **not** design the missing-source
  UX before this number exists.
