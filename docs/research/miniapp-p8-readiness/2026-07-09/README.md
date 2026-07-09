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
**Partially MEASURED 2026-07-09** — the HTTP-reachable subset was captured via the owner's
authenticated prod browser session (kapture, `/api/learner/context|due|log`), aggregated in-page
(no `item_key`/content persisted), and folded into **recon §2.2 "MEASURED 2026-07-09"**. Headline:
51 due / 98 scheduled, all overdue; 15 fragile (stability<1); 36/51 zero-lapse; 10 Telegram
production reviews to date (dictate 6 / cloze 4 / reverse 0). This `.sql` file still covers the
subset **not** exposed over HTTP and must be run on the prod DB to complete the table:
- §6 challenge outcomes (`agent_challenges.status` abandonment proxy)
- §8 exposure ledger, §9 `select_reason` mix
Plus the builder-driven §2.3 anchor-coverage probe (the gating number) is still outstanding.

## PENDING (not pure SQL — builder-driven, recon §2.3)
- **% of current due items with a resolvable, non-leaking source-sentence anchor** (the number
  that gates the context-first honesty claim + owner fork-4). Requires running the live
  context-first builder over the due set, not a static join. Do **not** design the missing-source
  UX before this number exists.
