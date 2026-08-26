# Scale, cost, backup and operations model

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current backup/runtime patterns; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=provider prices/limits; INFERENCE=all load/cost/capacity ranges.

## Assumptions

Ranges deliberately avoid false precision:

- DAU/MAU 15–35%;
- active day: 6–20 task/resource reads and 1–4 searches;
- community phase: 0.05–0.5 write actions per DAU/day; 10–30% are solution/question bodies, rest comments/reports/votes;
- mean text body 2–8KB plus roughly 2–4× indexes/audit/projections;
- 1–10 notification intents per new post depending on subscriptions; digest reduces fan-out;
- flag/report rate 0.5–3% of writes; 2–10 minutes human triage each plus appeals;
- attachments are zero in recommended phases 1–3.

## Quantitative bands

| MAU | DAU | Reads/day | Searches/day | Writes/day after community opens | Notification intents/day | New DB rows/year | Text+index growth/year | Moderation/month |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 6–20 | 1–4 | 0–1 | 0–2 | 100–1k | under 10MB | owner minutes |
| 10 | 2–4 | 12–80 | 2–16 | 0–2 | 0–20 | 1k–10k | 10–100MB | under 1h |
| 100 | 15–35 | 90–700 | 15–140 | 1–18 | 5–180 | 10k–100k | 0.1–1GB | 1–12h |
| 1,000 | 150–350 | 900–7k | 150–1.4k | 8–175 | 80–1.8k | 0.1–1m | 0.5–5GB | 8–100h |
| 10,000 | 1.5k–3.5k | 9k–70k | 1.5k–14k | 75–1.75k | 0.8k–17.5k | 1–10m | 5–50GB | 80–1,000h |

The upper 10k moderation band is operationally unacceptable without stronger prevention and paid/staffed coverage. It is a human limit, not a database limit.

## Hot-task burst

Model: 2,000 anonymous readers in 10 minutes, 100 authenticated users, 20 writes, one post with 500 subscribers.

- Immutable task statement and approved resource list should be cacheable; target cache hit above 90%.
- Reads: about 3.3 requests/sec base, perhaps 20–50 req/sec with assets/retries; current single service can plausibly handle this only if bodies are cached and no DB write/session is created.
- Writes serialize through short transactions; 20 writes are safe if transaction p95 under 50ms and queue wait under 250ms.
- 500 notifications must not be sent inside request or DB transaction. One outbox event expands in a worker with recipient/channel budgets.
- Slow mode, duplicate search and a per-task write bucket protect the hot anchor.

## SQLite and one-process boundary

SQLite remains reasonable for link metadata and bounded text at 10k MAU if measured:

- DB under 10GB initially;
- sustained writes under 10/sec and burst queue p95 under 250ms;
- write transaction p95 under 50ms, busy/lock failures below 0.1%;
- cached read API p95 under 250ms and uncached search p95 under 500ms;
- backup snapshot under 15 minutes and restore/read-back under 60 minutes;
- WAL normally under 1GB and disk below warning threshold;
- process CPU under 60% and memory under 70% during peak.

Evolution triggers:

- Queue/worker: any event has over 100 immediate recipients, fan-out request exceeds 1s, or provider retry must survive restart.
- Search service: FTS/search p95 exceeds 500ms for two weeks after query/index tuning, index exceeds 5–10GB, or multilingual ranking needs unsupported analyzers. First verify SQLite FTS5 compile support.
- DB evolution: sustained write queue over 250ms, over 10 writes/sec, backup/RTO misses, or horizontal writers become an approved requirement.
- Object storage: before the first server attachment, never after local volume has already become canonical.
- CDN/cache: anonymous resource projections exceed 20 req/sec sustained or origin bandwidth/cost ceiling.

## Storage and bandwidth

Text phase at 10k MAU: 5–50GB/year worst-range DB+indexes is manageable but requires partition/retention review. Public metadata responses of 5–20KB at 9k–70k reads/day are roughly 45MB–1.4GB/day before compression/cache; high cacheability sharply reduces origin egress.

If attachments were casually enabled, an assumption of 1–5MB mean and 0.05–0.5 uploads/MAU/month yields 0.5–25TB/year at 10k MAU before replicas/backup. This nonlinear change justifies deferral.

## Cost ceilings

No live cloud quote was obtained and no paid provider was called.

- Native owner-only registry: target incremental infrastructure under USD 10/month and near-zero human moderation beyond curation, using existing service/DB capacity.
- Bounded native community at 1k MAU: target incremental infrastructure under USD 50/month excluding human labor; alert at 50%, hard stop/owner decision at 100%.
- 10k MAU: infrastructure planning band USD 100–500/month excluding staff, driven by email, backups/search/cache; human moderation is likely dominant.
- Discourse official hosted reference on 2026-08-25: Pro USD 100/month, Business USD 500/month.
- NodeBB hosted reference: USD 20/100/250/750 per month across published page-view/storage bands.
- Google Drive API page says no additional standard-use cost at the research date but planned over-quota charging later in 2026; therefore no cost promise.

## Rate and quota starting budgets

Options for pilot red tests:

- anonymous reads 300/IP/5min with cache and global circuit breaker;
- owner writes 60/hour, resource creates 20/hour;
- later new account: 3 questions/day, 5 comments/hour, 2 links/post, 5 reports/day;
- search 30/account/min and 20/IP/min anonymous;
- mentions max 5/post; subscriptions max 500/account; notification max 20/day/account and one digest/thread window;
- payload 16KB metadata, 64KB text revision, pagination max 50.

These are tunable safety ceilings, not entitlement promises.

## Backup/restore

Current production script uses SQLite Online Backup API, PRAGMA integrity_check, SHA256, tar/gzip verification, extracted DB hash read-back and retention (scripts/ops/backup-linguistpro-online.sh:72-129). Recommended new domain must be covered automatically by the DB snapshot.

Before pilot:

1. Temporary DB migration up/down/reapply and invariant tests.
2. Seed anchors/resources/revisions/moderation tombstone/outbox.
3. Online snapshot; integrity and row/hash manifest.
4. Restore into isolated volume/process.
5. Recompute counts, anchor references and cache projections.
6. Prove no publication pointer, review_log, group truth or owner state changed.
7. Measure RPO/RTO and store a durable receipt.

Targets:

- owner pilot RPO 24h, RTO 4h;
- bounded community RPO 1h, RTO 2h;
- wider community RPO 15min, RTO 1h only after operations investment.

External provider bodies are excluded. Future attachment restore must reconcile DB inventory and every object hash/version; partial restore fails closed to QUARANTINED.

## Alerts

- disk warning/critical and predicted days to full;
- DB/WAL/backup size, backup age, integrity/read-back failure;
- p95/p99 read/search/write queue and SQLite busy rate;
- cache hit, 4xx auth/CSRF/IDOR and 429 rates;
- report backlog/SLA/appeal overturn;
- link dead/auth-required trend;
- outbox oldest age, dedup conflict, fan-out/spend;
- moderation concentration and unexplained mass actions;
- provider cost at 50/80/100% budget.

All operational metrics are content-free.
