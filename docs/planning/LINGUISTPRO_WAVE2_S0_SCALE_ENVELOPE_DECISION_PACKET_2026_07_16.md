# LinguistPro Wave 2 — S0 Scale Envelope decision packet

**Date:** 2026-07-16
**Status:** `OWNER_APPROVED`; S0 envelope B/B/B/B/B is canonical. Documentation and decision scope only.
**Authority:** S0 only. This document authorizes no S1–S7 implementation, migration, background worker, durable lesson retention, material ingestion, provider change, deployment or infrastructure mutation.
**Owner approval:** 2026-07-16 — Decision 1 B / Decision 2 B / Decision 3 B / Decision 4 B / Decision 5 B. This approval closes S0 and permits S1 role/authority registry design under the separate authority boundary in §16; it does not authorize S1 implementation.
**Repository baseline:** `main` / `60d68d3d6bd8d2451c3d61ce1d3023a5ed869aab`; package `3.11.183`; `origin/main` aligned at inspection.
**Production public check:** `/healthz` returned HTTP 200 on 2026-07-16 at `2026-07-16T11:10:43.534Z`, uptime 25,497 seconds, DB and migrations ready, disk 70%, `disk_warn=false`. No private production coordinates or authenticated production data were read.
**Predecessors:** `LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md` and `LINGUISTPRO_WAVE2_LB2_CLOSURE_HANDOFF_2026_07_16.md`.

## 1. Executive recommendation

Adopt a **100-DAU controlled-pilot envelope** as the S0 operating decision, with four distinct meanings for the requested tiers:

| Tier | Meaning | Decision |
|---:|---|---|
| 20 active users | Current architecture's first externally meaningful proof tier. | Stay on the current single-process SQLite architecture after the S0 load/restore/deletion gates are measured. |
| 100 active users | Controlled-pilot operating envelope, not an automatic launch promise. | Recommended S0 target. SQLite may remain only while the explicit lock, scheduler, backup, restore, disk and provider thresholds in §11 stay green. |
| 1,000 active users | Transition-design tier. | Prepare and prove the database/object-storage/job transition before onboarding reaches this tier. Do not depend on process-local locks, limiters, schedulers or RAM jobs for correctness. |
| 10,000 active users | Target-architecture scenario. | Capacity-planning input only. The current process/SQLite/volume topology is not an accepted 10k operating design. |

The recommendation is deliberately not “migrate now.” The present workload is owner-scale and the public health check is green. The immediate S0 conclusion is instead:

1. preserve SQLite for the bounded pilot;
2. measure the current writer and scheduler envelope before S1 implementation;
3. separate opaque learner artifacts and unbounded audio/object-like files from the future relational growth decision;
4. treat multi-process or horizontal execution as an immediate transition trigger because current correctness controls are process-local;
5. keep managed model demand capped and fairly shared; the current 300-request/day and 9-request/minute Gemini envelope cannot provide a material managed-agent allowance at 1,000 or 10,000 DAU.

## 2. Epistemic labels and calculation rules

Every quantitative claim uses one of these labels:

- **`MEASURED_FACT`** — observed in the repository, local database/filesystem, a preserved test/evidence run or the public production health endpoint.
- **`CODE_DERIVED_BOUND`** — enforced or implied directly by code, schema, configuration default or algorithmic structure.
- **`EXPLICIT_ASSUMPTION`** — a bounded planning input selected for S0; it must be replaced by telemetry when available.
- **`SCENARIO_ESTIMATE`** — arithmetic from labelled facts/assumptions; it is not observed production behavior.

All storage figures use decimal MB/GB for envelope readability unless a code limit is explicitly binary. All “active users” are **daily active users (DAU)**, not registered accounts. Peak rates use:

```text
daily_rows = DAU × rows_per_active_user_day
peak_rows_per_second = daily_rows / 86,400 × burst_factor
annual_structured_bytes = DAU × structured_MB_per_active_year
retained_artifact_bytes = DAU × sync_adoption × retained_MB_per_sync_user
model_cost = calls × ((input_tokens / 1,000,000 × input_price)
                    + (output_tokens / 1,000,000 × output_price))
```

False precision is prohibited: latency, lock duration, compression ratio, cache hit rate, provider success and restore duration remain `UNKNOWN_UNTIL_MEASURED` where no current trace exists.

## 3. Current measured baseline

### 3.1 Repository and production

| Observation | Value | Label | Qualification |
|---|---:|---|---|
| HEAD / branch | `60d68d3` / `main` | `MEASURED_FACT` | `origin/main` was `0/0` ahead/behind. |
| Package version | `3.11.183` | `MEASURED_FACT` | Read from `package.json`. |
| Unrelated untracked paths | `.agents/`; `docs/research/edu-quality-agentic/` | `MEASURED_FACT` | Preserved and excluded from S0 staging. |
| Public production health | HTTP 200; DB/migrations ready | `MEASURED_FACT` | Read-only public check; no authenticated status. |
| Production disk | 70% used; warning false | `MEASURED_FACT` | Point-in-time health value, not a growth rate. |
| Container limit | 1.5 CPU; 1,536 MB RAM | `MEASURED_FACT` | Current repository deployment canon. |
| Active managed Gemini limit | 300 requests/day; 9 requests/minute | `MEASURED_FACT` | Live-verified in the LB2 closure handoff; code derives it from 500 RPD / 15 RPM × 60%. |
| LB2 candidate latency | p90 3.477 s | `MEASURED_FACT` | One frozen 26-candidate engineering run; not a production SLO sample. |

### 3.2 Local database and volume sample

The checked-in workspace's `data/app.db` is a **local development/sample database**, not a production-capacity sample. It is still useful for file-layout and row-shape evidence.

| Observation | Value | Label | Qualification |
|---|---:|---|---|
| Main DB pages | 4,057 × 4,096 bytes = 16.62 MB | `MEASURED_FACT` | WAL was 4.19 MB at inspection; main file timestamp is older than the WAL. |
| Schema migrations | 38 | `MEASURED_FACT` | Through `038_reading_handoff.sql`. |
| Local learner account rows | 1 user; 4 devices; 4 sessions | `MEASURED_FACT` | Not representative of production population. |
| Local cloud learning rows | 3 `review_log`; 3 projections; 1 artifact | `MEASURED_FACT` | Too sparse for per-row capacity inference. |
| Local opaque artifact | about 242 KB allocated | `MEASURED_FACT` | One artifact including page allocation; payload can be much larger. |
| Local `audio-cache/` | 2,963 files; 70.69 MB | `MEASURED_FACT` | No production inference. |
| Local backups | 30 files; 168.98 MB | `MEASURED_FACT` | App helper default keeps 10 only when cleanup is invoked; external ops retention is separate. |
| Local other caches | inflection 38.27 MB; Gemini 0.22 MB | `MEASURED_FACT` | Shared/operator caches, not per-user state. |

The earlier real-profile sync dry run measured roughly 5,400 review events and 81 synced texts across the owner's devices. **`MEASURED_FACT_DATED`**: useful as a migration proof, not a present production count.

## 4. Live store, writer and lifecycle inventory

### 4.1 Browser OPFS

| Data | Authority | Writers / reads | Growth and lifecycle |
|---|---|---|---|
| Local `review_log` replica and sync cursor | Local replica of server canon for cloud users; local truth for Tier 1 | Browser append paths; `cloud-sync.js` uploads by rowid watermark and merges down with `INSERT OR IGNORE` | Append-only until local/account erasure. Full-scan/reconciliation can reread all rows. |
| Local SRS/cache state | Derived from local log replica | Browser FSRS replay | Rebuildable; must never be a second server writer. |
| Texts, sentences, notes, reading progress, local audio links | Browser/local user data | Studio/Reading Room local DB modules | Volume-dependent; not visible to server unless explicit artifact sync. |
| Artifact sync outbox | Same opaque per-text bundle, not a second queue | `syncArtifacts` best-effort per text | Retryable state transfer; no durable server job. |

**Boundary:** server capacity cannot be inferred from the owner's OPFS size. OPFS remains a separate failure, export and device-storage domain.

### 4.2 Server SQLite

| Store | Current writer | Retention / bound | Important scale property |
|---|---|---|---|
| `users`, `devices`, `user_sessions` | `identityRepo` | PWA sessions 90 days; Mini App idle 2h / absolute 24h by default; hourly purge | Every authenticated request may update session/device timestamps, creating write amplification. |
| `consent_records`, `audit_log`, `deletion_journal` | `identityRepo` and consent routes | Consent history append-only; audit user-scoped; deletion journal survives user delete | Audit is best-effort and may fail without breaking the action. |
| `review_log` | `learnerLogRepo.ingestBatch`; trusted agent reviewer through the same path | Append-only account lifetime; whole-stream erase; annul/correction instead of edit | Canonical educational write. PK is `(user_id,id)`; batch max 5,000. |
| `learner_events` | `learnerLogRepo.ingestBatch` | No TTL in current schema | Analytics-only append stream; can outgrow review rows because taps/reading events are higher frequency. |
| `ingest_batches` | `learnerLogRepo` | No TTL in current schema | One row per idempotency key; retained result JSON makes sync retries durable but grows forever. |
| `srs_projections` | `learnerProjectionRepo` | One row per scheduled item; rebuildable | Ingest triggers recomputation for affected item keys; replay cost grows with per-item history. |
| `learner_artifacts` | `learnerArtifactsRepo.put` | Max 2,000 artifacts/user; max 8 MiB each; no age/quota-bytes policy | Theoretical per-user ceiling is 16,000 MiB in the SQLite file. Opaque blobs make backup/export/delete expensive. |
| `agent_profiles`, `agent_tasks` | `agentRepo` | No general task TTL | Plan/task payload identifiers only; tasks can accumulate. |
| `agent_explanations` | `agentRepo` | Body tombstoned on consent revoke; no age TTL | Derived content, not learner truth. |
| `llm_usage_ledger` | `agentRepo` through `llmGate` | No purge in current code | One row per managed/BYOK call; quotas query daily and last-minute windows. |
| channel/link/pairing/update/action tables | `channelLinkRepo`, Telegram router | Pairing 15m; updates 48h; nullable-user bot log 30d; six-hour prune | User-scoped bot actions can remain beyond 30d because the TTL comment/prune targets nullable-user rows. Confirm in S1 instrumentation. |
| `agent_challenges`, `tg_stimulus_exposure` | challenge/review repositories | Challenge 10m; exposure 45m; hourly cleanup | One open challenge/user enforced; historical terminal cleanup is code-driven. |
| notification prefs, `nudge_ledger`, `nudge_state` | webhook prefs writer; sweep state writer | Ledger/state have no general retention window | One ledger row/user/local-day can grow linearly forever. |
| push subscriptions | `pushRepo` | Removed on 404/410 or account delete | Fan-out can exceed users when several devices subscribe. |
| Mini App replay/session/handoff rows | identity/handoff repositories | InitData/session hourly purge; handoff 5m | Short-lived but process timer is required for prompt cleanup. |

### 4.3 Docker volume and object-like files

| Path/class | Writer | Current lifecycle | S0 conclusion |
|---|---|---|---|
| `DATA_DIR/audio-cache/*.mp3` and timing JSON | Interactive TTS, operator uploads, prefetch/bake paths | `TTS_CACHE_MAX_MB=250` is exposed as configuration/status but no cache eviction enforcement was found | File growth is operationally unbounded unless an external/operator cleanup policy exists. Do not model 250 MB as an enforced cap. |
| `DATA_DIR/benyehuda/works`, `fts`, `proclitic`, `context` | Corpus publication tooling/operator endpoints | Versioned/operator lifecycle; bodies live outside git | Shared corpus growth, not per-user relational growth. Still competes for the same disk and backup/incident budget. |
| `DATA_DIR/vapid-keys.json` and service-account material | Ops/bootstrap | Long-lived secret/config files | Excluded from user export and S0 content measurements. |
| SQLite backups / external volume snapshots | App helpers and production ops | Helper default 10; production canon says daily with 14-day retention | Current helper copies DB + WAL/SHM files; restore is file-copy based. Consistent backup and deletion-journal replay require witnessed drills. |

### 4.4 Provider calls

| Provider path | Current gate | Retry/timeout | Scale boundary |
|---|---|---|---|
| Managed Gemini agent/LB2 | Pre-call SQLite reservation; user/global/provider day and minute counts | Managed free-tier: one HTTP attempt; 30s timeout | 300/day and 9/min active envelope. Count-based, not token/dollar-based. |
| OpenRouter agent | User/global count gate | One transient retry; 30s timeout | Code does not enforce the documented OpenRouter account-wide 50/day and 20/min free limit; provider remains the effective limit. No paid SLO. |
| BYOK Gemini/OpenRouter | Per-request user key; no managed fallback | Provider path rules; telemetry best-effort | Platform direct model cost is zero, but fairness, privacy and support are not zero. BYOK ledger failure does not block delivery. |
| Google Cloud TTS | General TTS/cache paths; agent TTS tool is disabled until TTS limits exist | Endpoint-specific | `llm_usage_ledger.kind='tts_chars'` exists in schema but no active reservation/write path was found. Current spend accounting is not an agent-grade hard stop. |
| Telegram/Web Push | Daily claim before send; adapter call | At-most-once nudge claim; delivery failure retains claim | Honest fatigue policy, but not guaranteed delivery. |

### 4.5 Ephemeral RAM state and job-like work

| RAM state | Bound | Crash / multi-process behavior |
|---|---|---|
| IP rate-limit buckets | Map capped by opportunistic sweep above 5,000 keys | Resets on restart; independent in every process; cannot enforce global fairness. |
| Transaction lock | One module-level Promise chain | Coordinates only one Node process. A second process writing the same SQLite file does not share it. |
| Nudge single-flight | Boolean; one sequential user loop | Resets on crash; second process can run a competing sweep; current DB claim prevents duplicates but not duplicated scan/load. |
| Role-play sessions | One Map entry/user; 30m TTL; five-minute sweep | Transcript disappears on restart; each process has a divergent session map. This is intentional ephemeral UX, not durable work. |
| Audio prefetch jobs | Up to 2,000 rows/job; concurrency max 6; finished jobs retained 30m in RAM | Lost on restart; no lease, replay, DLQ or durable cancellation. |
| Keying dataset/cache | About 306 MB RSS when loaded; idle unload default 5m | Replicated per process; a second app process can add another ~306 MB peak. |

There is no general durable queue/outbox worker contract. The browser's cursor-over-log sync outbox is durable by construction, but it is not a background-job system.

## 5. Workload assumptions

These are proposed S0 inputs, not forecasts.

### 5.1 Per-active-user daily activity

| Variable | Low | Base | High | Label / rationale |
|---|---:|---:|---:|---|
| Interactive/API reads | 20 | 60 | 180 | `EXPLICIT_ASSUMPTION`; Room/Studio remain mostly local, so server reads are account/sync/agent/channel calls. |
| New `review_log` rows | 5 | 20 | 60 | `EXPLICIT_ASSUMPTION`; includes review/skip/mark/annul, not unanswered prompts. |
| New `learner_events` rows | 10 | 50 | 150 | `EXPLICIT_ASSUMPTION`; reading telemetry dominates. |
| Ingest batches | 2 | 6 | 15 | `EXPLICIT_ASSUMPTION`; sync cadence/device count. |
| Projection upserts | 4 | 15 | 40 | `EXPLICIT_ASSUMPTION`; distinct reviewed item keys/day. |
| Agent/channel/account rows | 1 | 6 | 20 | `EXPLICIT_ASSUMPTION`; ledger, actions, challenges, audit/task/explanation rows. |
| Notification claim rows | 0.2 | 1 | 1 | `CODE_DERIVED_BOUND`; at most one claim/user/local-day. |
| Managed/BYOK model calls demanded | 0.3 | 2 | 8 | `EXPLICIT_ASSUMPTION`; demand before global caps. |
| TTS characters requested | 100 | 400 | 2,000 | `EXPLICIT_ASSUMPTION`; before content-addressed cache hits. |

Write-row totals are 22.2 / 98 / 286 per active user-day. They count logical row mutations, not WAL pages or index writes.

### 5.2 Notification scheduler read amplification

The unified scheduler runs every 15 minutes: 96 ticks/day. It enumerates candidate users and processes them **sequentially**. For each candidate it performs several awaited preference, claim, channel, due and state reads; most ticks should short-circuit outside a delivery window, but they still enumerate the candidate set.

Planning formula:

```text
scheduler_reads_per_candidate_day
  = 96 × cheap_reads_outside_window + open_window_ticks × additional_reads
base assumption = about 240 logical reads/candidate/day
```

Low assumes 25% notification adoption and 240 scheduler reads/adopter/day; base assumes full adoption and 240; high assumes full adoption and 300. This yields total read assumptions of approximately 80 / 300 / 480 per active user-day including interactive reads.

## 6. Tier calculations

### 6.1 Daily logical reads and writes

| DAU | Reads/day low | Reads/day base | Reads/day high | Writes/day low | Writes/day base | Writes/day high |
|---:|---:|---:|---:|---:|---:|---:|
| 20 | 1,600 | 6,000 | 9,600 | 444 | 1,960 | 5,720 |
| 100 | 8,000 | 30,000 | 48,000 | 2,220 | 9,800 | 28,600 |
| 1,000 | 80,000 | 300,000 | 480,000 | 22,200 | 98,000 | 286,000 |
| 10,000 | 800,000 | 3,000,000 | 4,800,000 | 222,000 | 980,000 | 2,860,000 |

`SCENARIO_ESTIMATE`. These are application-level operations. Each write can touch multiple indexes and WAL pages; projection recompute can read historical rows.

### 6.2 Peak logical write rates

Burst factors are `EXPLICIT_ASSUMPTION`: 10× low, 30× base, 60× high over the uniform daily average.

| DAU | Low peak writes/s | Base peak writes/s | High peak writes/s |
|---:|---:|---:|---:|
| 20 | 0.05 | 0.68 | 3.97 |
| 100 | 0.26 | 3.40 | 19.86 |
| 1,000 | 2.57 | 34.03 | 198.61 |
| 10,000 | 25.69 | 340.28 | 1,986.11 |

`SCENARIO_ESTIMATE`. The current code has no measured sustained-write benchmark establishing that any row/s value is safe. The 100-DAU base is plausible but must be load-tested. The 1k/10k base is not accepted on a single shared SQLite connection.

### 6.3 Peak concurrent users and requests

| DAU | Low (2%) | Base (5%) | High (10%) |
|---:|---:|---:|---:|
| 20 | 1 | 1 | 2 |
| 100 | 2 | 5 | 10 |
| 1,000 | 20 | 50 | 100 |
| 10,000 | 200 | 500 | 1,000 |

`EXPLICIT_ASSUMPTION`. A concurrent user can issue several requests; load tests must separately model sync bursts, Mini App review answers and post-notification thundering herds.

### 6.4 Structured relational retention

Planning allowance per active-user-year, excluding opaque artifacts and audio:

- low 5 MB;
- base 25 MB;
- high 80 MB.

The base is consistent with 20 reviews/day and 50 learner events/day at sub-kilobyte row-plus-index allowances, plus projections, ledger/channel/account rows and SQLite overhead. It is an `EXPLICIT_ASSUMPTION`, not a measured row average.

| DAU retained for one year | Low | Base | High |
|---:|---:|---:|---:|
| 20 | 0.10 GB | 0.50 GB | 1.60 GB |
| 100 | 0.50 GB | 2.50 GB | 8.00 GB |
| 1,000 | 5 GB | 25 GB | 80 GB |
| 10,000 | 50 GB | 250 GB | 800 GB |

`SCENARIO_ESTIMATE`. Append-only review, telemetry, ingest-batch, LLM-ledger and nudge-ledger retention currently has no general compaction policy.

### 6.5 Opaque artifact retention

Assumptions combine sync adoption and retained payload per synced user:

| Case | Sync adoption | Retained per synced user | Effective per DAU |
|---|---:|---:|---:|
| Low | 25% | 10 MB | 2.5 MB |
| Base | 50% | 100 MB | 50 MB |
| High | 80% | 500 MB | 400 MB |

| DAU | Low | Base | High |
|---:|---:|---:|---:|
| 20 | 0.05 GB | 1 GB | 8 GB |
| 100 | 0.25 GB | 5 GB | 40 GB |
| 1,000 | 2.5 GB | 50 GB | 400 GB |
| 10,000 | 25 GB | 500 GB | 4 TB |

`SCENARIO_ESTIMATE`. The current schema's code-derived theoretical ceiling is much larger: 2,000 × 8 MiB ≈ 16 GiB/user. That is a validation cap, not an acceptable quota or SQLite operating target.

### 6.6 Model-call demand versus current managed capacity

| DAU | Low demand (0.3/user/day) | Base demand (2/user/day) | High demand (8/user/day) | Base demand served by current 300/day cap |
|---:|---:|---:|---:|---:|
| 20 | 6 | 40 | 160 | 100% |
| 100 | 30 | 200 | 800 | 100% |
| 1,000 | 300 | 2,000 | 8,000 | 15% |
| 10,000 | 3,000 | 20,000 | 80,000 | 1.5% |

`SCENARIO_ESTIMATE` demand; current cap is `MEASURED_FACT`. At 9 managed requests/minute, even the allowed 300/day cannot be delivered in a short synchronized burst. Fair scheduling and per-scenario reservations become mandatory before external multi-user managed use.

## 7. Cost envelopes

### 7.1 Price snapshot

Price inputs are dated 2026-07-16 and must be refreshed before a budget decision:

- Gemini 3.1 Flash-Lite: **$0.25 / 1M text input tokens and $1.50 / 1M output tokens** on the standard paid tier (`MEASURED_FACT_EXTERNAL`, [Google Gemini 3 developer guide](https://ai.google.dev/gemini-api/docs/gemini-3)).
- OpenRouter `nvidia/nemotron-3-super-120b-a12b:free`: **$0/M input and $0/M output** on the named free route (`MEASURED_FACT_EXTERNAL`, [OpenRouter model page](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b%3Afree/pricing)). Free availability is capacity, privacy and reliability constrained; zero price is not an SLO.
- Google Cloud WaveNet/Neural2 TTS: first 1M characters/month free, then **$16 / 1M characters** (`MEASURED_FACT_EXTERNAL`, [Google Cloud TTS pricing](https://cloud.google.com/text-to-speech/pricing/)).

### 7.2 Gemini scenario unit assumptions

| Scenario unit | Input tokens | Output tokens | Calls | Estimated paid cost |
|---|---:|---:|---:|---:|
| Low short advisory | 1,500 | 150 | 1 | $0.00060 |
| Base plan/explain/turn | 3,000 | 400 | 1 | $0.00135 |
| Base lesson composition | 8,000 | 1,000 | 1 | $0.00350 |
| High lesson/repair unit | 12,000 | 1,500 | 1 | $0.00525 |

`EXPLICIT_ASSUMPTION` tokens; `SCENARIO_ESTIMATE` cost. Current code records output units but does not reserve or enforce a micro-dollar ceiling or input-token budget.

### 7.3 Monthly Gemini demand cost before current caps/free allowance

Low uses 0.3 short advisory calls/user/day. Base uses 2 base advisory calls. High uses 8 high units. Thirty-day month:

| DAU | Low | Base | High |
|---:|---:|---:|---:|
| 20 | $0.11 | $1.62 | $25.20 |
| 100 | $0.54 | $8.10 | $126 |
| 1,000 | $5.40 | $81 | $1,260 |
| 10,000 | $54 | $810 | $12,600 |

`SCENARIO_ESTIMATE`. The active 300-call/day cap would limit base-shaped paid exposure to about $12.15/month, but it is a **request cap, not a dollar cap**; large inputs/outputs can cost more. Free-tier data-use/Terms and quota availability remain separate product constraints.

### 7.4 OpenRouter and BYOK

- OpenRouter free route: direct invoice estimate is $0, but current code comments/documentation identify an account-wide free allowance around 50 requests/day and 20/minute. The app does not enforce those provider-specific limits. Treat this route as opportunistic, not external-pilot capacity.
- BYOK: platform direct model invoice is $0. The user bears provider cost and provider-data terms. BYOK failures never fall back to managed spend; this must remain.
- A paid OpenRouter route is **not selected** by S0. It requires an owner-approved provider/model/region/retention and price snapshot.

### 7.5 TTS gross and post-free monthly scenario

Using 100 / 400 / 2,000 characters per active user-day and WaveNet/Neural2 pricing:

| DAU | Low monthly cost after 1M free | Base | High |
|---:|---:|---:|---:|
| 20 | $0 | $0 | $3.20 |
| 100 | $0 | $3.20 | $80 |
| 1,000 | $32 | $176 | $944 |
| 10,000 | $464 | $1,904 | $9,584 |

`SCENARIO_ESTIMATE`, before cache hits. The content-addressed cache may lower calls materially, but no measured hit-rate or enforced cache-size policy exists. Therefore S0 must not net costs down by an invented cache rate.

### 7.6 Recommended hard stops and fairness policy

No limits change in S0. The recommended owner direction for S1/S3 design is:

1. retain reserve-before-call and global kill switch;
2. add a versioned price snapshot and reserve input/output token plus micro-dollar ceilings, not request count alone;
3. allocate managed capacity by user and scenario class so role-play/lesson repair cannot starve plan/explain;
4. cap concurrent provider calls globally and per user; queue only explicitly approved background work, never interactive correctness;
5. keep at least one deterministic/local result for every managed scenario;
6. leave BYOK outside managed spend but inside abuse, privacy and concurrency controls;
7. implement TTS character reservation before enabling the disabled agent TTS tool.

## 8. Current concurrency, scheduler and recovery limits

### 8.1 SQLite and transaction limits

- `journal_mode=WAL` is enabled (`CODE_DERIVED_BOUND`).
- `PRAGMA foreign_keys=ON` is enabled (`CODE_DERIVED_BOUND`).
- No `busy_timeout` setting was found in `db/sqlite.js` (`MEASURED_FACT_CODE`). Earlier canon required one; live code currently does not demonstrate it.
- One shared `node-sqlite3` connection is used (`MEASURED_FACT_CODE`).
- `withTxnLock` serializes explicit transactions only inside one process (`CODE_DERIVED_BOUND`).
- Several older repositories still contain direct `BEGIN IMMEDIATE` paths without `withTxnLock` (`historyRepo`, `libraryRepo`, `audioRepo`, `srsRepo`). Some server-side stateful routes are described as retired, but reachability must be proven by a call-site sweep before claiming universal transaction safety (`MEASURED_FACT_CODE`).
- Ingest batch max is 5,000 events (`CODE_DERIVED_BOUND`). Large batches hold the writer transaction while validating/inserting rows and then trigger projection work.

### 8.2 Scheduler limits

- Unified nudge sweep interval is 15 minutes (`CODE_DERIVED_BOUND`).
- Candidate users are enumerated every tick and processed sequentially (`MEASURED_FACT_CODE`).
- Single-flight is process-local; a sweep longer than 15 minutes causes later in-process ticks to skip (`CODE_DERIVED_BOUND`).
- The atomic `(user_id,local_day)` claim prevents duplicate successful nudges across competing scans, but it does not prevent duplicate scanning/provider eligibility work (`CODE_DERIVED_BOUND`).

At 10,000 candidates, even 100 ms of average awaited work/user is about 16.7 minutes. This is a `SCENARIO_ESTIMATE`, not a benchmark; it demonstrates why scheduler duration must become a gate well before 10k.

### 8.3 Backup, restore and erasure limits

- App backup copies the main DB plus WAL/SHM as separate files (`MEASURED_FACT_CODE`). It does not use SQLite's online backup API.
- Production canon specifies daily backup and 14-day retention, but the application cannot prove external cron freshness from `/healthz` (`MEASURED_FACT_DOC` + `UNKNOWN_CURRENT`).
- Restore is file copy after removing target WAL/SHM; correctness depends on quiescence and post-restore integrity/deletion-journal procedure (`MEASURED_FACT_CODE`).
- Account export loads every user-scoped table into one in-memory JSON object (`MEASURED_FACT_CODE`). A 100MB artifact profile can therefore create >100MB process allocation before JSON serialization/HTTP overhead.
- Account delete enumerates all user-scoped tables and deletes them in one `BEGIN IMMEDIATE` transaction (`MEASURED_FACT_CODE`). Large artifacts/event histories can create a long global writer stall.
- Account deletion does not itself delete user-derived object-like audio/material files because current personal artifacts are opaque SQLite blobs and lesson audio retention is not authorized. Any future object store requires a deletion lineage and asynchronous verified purge.

## 9. SLO and failure-budget options

### 9.1 Owner options

| Class | Option A: owner-only | Option B: controlled pilot **recommended** | Option C: commercial target |
|---|---|---|---|
| Control-plane availability | best effort, measured | 99.5% monthly | 99.9% monthly |
| Deterministic interactive API | p95 <2s | p95 <1s; p99 <2s | p95 <500ms; p99 <1s |
| Managed composition | p95 <20s; hard 30s | p95 <12s; hard 30s; honest fallback | p95 <8s; hard 20s |
| Notification | same delivery window | ≥95% eligible decisions within 30m window; at-most-once | ≥99% within 15m window |
| Immediate revoke/access block | required | required, <1 minute externally visible | required, <1 minute |
| Content purge | p95 <24h | p95 <1h; p99 <24h | p95 <15m; p99 <1h |
| Backup RPO / restore RTO | 24h / witnessed manual | 24h / 2h | ≤1h / ≤30m |

`PROPOSAL`. Availability failure budgets for a 30-day month are about 3h39m at 99.5% and 43m12s at 99.9%.

### 9.2 Recommended failure-budget semantics

- Provider outage does not count against deterministic control-plane availability when the app returns an explicit, useful degradation within the interactive SLO.
- Cross-tenant access, unauthorized canonical write, duplicate logical grade, deletion resurrection and prompt/content leakage have **zero acceptable budget**.
- A notification delivery failure consumes the at-most-once daily claim under the current policy. Count it as a delivery failure, not retry it into duplicate fatigue.
- `MNAR`: timeout/no response/later/passive audio produces no review event, regardless of availability target.
- Restore is successful only after integrity, schema, deletion-journal replay and zero-resurrection checks.

## 10. R1–R17 adversarial critique

| Role | Adversarial finding | Required response |
|---|---|---|
| R1 | Scale pressure could tempt model-only morphology or cache shortcuts. | Resolver remains authority; no throughput target weakens abstention or provenance. |
| R2 | “More notifications/model calls” is not educational value and can cannibalize reading. | Capacity models due/context actions and fatigue, not engagement spam; one daily claim stays. |
| R3 | Artifact/event growth can create text-key or relationship shortcuts. | IDs and provenance remain explicit; no cross-user semantic merge. |
| R4 | Overload/degradation can become dead-end UI. | Every model/provider limit returns typed, localized, actionable fallback; future UI still needs 380×844/RTL proof. |
| R5 | A 10k headline without provider and deletion capacity would be market-damaging. | Publish only the accepted operating tier; 1k/10k remain transition/scenario tiers. |
| R6 | Opaque artifact bundles are a dump, not a governed library. | Do not call them a personal corpus; S6 owns material lifecycle before durable M1. |
| R7 | Cost-driven model substitutions can flatten register/era and source context. | Provider/route changes require quality evidence; no silent route fallback. |
| R8 | High-volume generated lessons can create permanent scaffolding and overload. | LB2 remains ephemeral; durable series/background generation is excluded. |
| R9 | Shared caches/indexes risk turning derived/private data into asserted/common data. | Physical sharing needs logical scope, provenance and negative isolation tests; no private cross-user reuse. |
| R10 | The envelope relies on assumptions, not measured load. | Load, lock, scheduler, export/delete and restore measurements are S0/S1 gates; label every estimate. |
| R11 | Same-process tests can falsely prove a process-local lock/scheduler safe. | Independent multi-process/failure injection is required before horizontal scale; validate backup with restore, not copy success. |
| R12 | SQLite blobs, process-local locks and RAM jobs couple unrelated growth domains. | Separate relational metadata, object-like payloads and durable jobs before 1k; preserve single writer abstraction. |
| R13 | A premature migration can lose append-only truth; a late one can make export/delete impossible. | Trigger preparation early, then require dual-run/backfill/reconciliation/rollback and real-profile replay proof. |
| R14 | In-memory per-IP limits and process-local scopes fail under multiple replicas. | Before multi-process, move correctness/rate/fairness controls to a shared authoritative mechanism and run cross-tenant negative tests. |
| R15 | No TTL on several ledgers/telemetry streams and materialized full export threaten lifecycle promises. | Decide retention classes, stream export, chunk delete and restore-without-resurrection before external scale. |
| R16 | Request-count quotas do not bound token/dollar cost; TTS has no active pre-call ledger. | Add cost-unit reservation, concurrency/fairness and TTS hard stops before broader managed use. |
| R17 | Load shedding could skip deterministic grading or treat timeouts as failure. | Deterministic-first, grader provenance, D1, annul and MNAR remain zero-budget invariants. |

### Synthesis

The strongest common objection is not “SQLite is always wrong.” It is that the current system's correctness and operations are **coincident with one process**: one connection, one Promise lock, one set of Maps, one scheduler and one volume. That is acceptable only while the accepted tier and measurements keep it explicit. The first architectural transition should separate durability domains and shared coordination; it should not begin with a fashionable database selection.

## 11. Stay-on-SQLite and transition triggers

### 11.1 Stay on current SQLite only while all are true

1. Single application writer process; no second worker writes the DB file.
2. DB + WAL p95 transaction queue wait <50 ms and p99 <250 ms under 5× accepted pilot peak.
3. `SQLITE_BUSY`/locked/nested-transaction errors <0.1% of writes and zero lost/duplicate canonical events.
4. Deterministic interactive API p95 <1s and p99 <2s during sync/nudge/model bursts.
5. Unified nudge sweep p95 <5 minutes, max <10 minutes, and <1% scheduled ticks skipped by single-flight.
6. Main DB <5 GB, daily growth <100 MB/day sustained, and forecast stays below 10 GB for the next 12 months.
7. Consistent backup completes <10 minutes; witnessed restore + integrity + deletion-journal replay completes <2 hours.
8. Base-profile export peak RSS stays below 50% of the 1,536 MB container limit; deletion writer lock <5 seconds for p95 users and <30 seconds for the largest allowed user.
9. Volume disk remains <80% warning and forecasted >30 days from exhaustion.
10. Managed provider demand fits owner-approved fairness allocations; no user can consume another user's minimum daily allowance.

These are `PROPOSAL` thresholds for owner adjudication. They require instrumentation before they can be enforced.

### 11.2 Begin transition preparation when any occurs

- 100 DAU is approved for onboarding, even if current metrics are green: prepare portability/load/restore evidence before growth removes the option.
- Structured DB forecast reaches 5 GB within 12 months.
- Artifact payloads exceed 25% of DB bytes or any normal user exceeds 250 MB opaque artifacts.
- Sustained peak exceeds 25 logical writes/s or 100 writes/s for any five-minute interval.
- p95 writer queue >50 ms, p99 >250 ms, or lock errors exceed 0.1%.
- Nudge sweep p95 >5 minutes or scans >2,000 candidates/tick sequentially.
- Backup >10 minutes, restore >2 hours, or export/delete breaches its SLO.
- A durable background job, second writer process, horizontal app replica, teacher/organization tenancy or RLS-like policy is approved.
- Object-like user material, OCR/media, embeddings or background ingestion is approved.

### 11.3 Mandatory transition before operation

- Before 1,000 DAU unless load/restore evidence and owner adjudication explicitly re-accept a narrower SQLite topology.
- Before any correctness dependency on multiple processes or process-local rate/scheduler state.
- Before persistent M1/M2/M3 material ingestion or durable F3 corpus work.
- Before 10,000 DAU under all scenarios in this packet.

S0 does **not** select Postgres, an object store, a queue or a retrieval engine. S5 must compare options against these triggers and prove dual-run, backfill, reconciliation, rollback, deletion and restore.

## 12. Required measurements and gates

### 12.1 S0 evidence harness to authorize a 100-DAU pilot

Run from an isolated copy/synthetic database; never the owner's live profile:

1. Seed 100 tenants at low/base/high one-year row shapes plus bounded artifact payloads.
2. Replay 5× base peak: sync ingest, Mini App review, session touches, graph reads and nudge scans.
3. Record p50/p95/p99 route latency, transaction queue time, transaction duration, WAL growth, RSS/CPU and error codes.
4. Inject two concurrent ingests, account deletion, hourly ops sweep and nudge sweep.
5. Run one second process in **read-only fault-probe mode** to prove which controls are process-local; do not permit dual writers.
6. Measure scheduler duration at 20/100/1k/10k synthetic candidates without delivering providers.
7. Measure full export memory/latency and delete lock time for low/base/high profiles.
8. Create a consistent backup during write load, restore into an isolated directory, run integrity/oracle, replay deletion journal and verify no deleted user returns.
9. Measure audio/object-file growth separately; do not include secret files or private production data.
10. Preserve raw metrics and commands in a stable research/evidence folder if executed; S0 packet remains the decision summary.

### 12.2 Observability gaps to close before enforcement

- request and route latency histograms;
- transaction queue wait/duration and `SQLITE_BUSY` counters;
- DB/WAL bytes and growth/day by table/domain where possible;
- nudge candidate count, sweep duration and skipped-tick count;
- backup age/duration/size and last witnessed restore;
- export/delete duration, bytes and peak RSS;
- provider demand, reservation, token input/output, cost estimate, concurrency and denial by fairness reason;
- artifact bytes/user and audio-cache bytes/growth/eviction status;
- purge backlog/age and zero-reference verification.

Operational labels must remain low-cardinality and content-free.

## 13. Rejected alternatives

1. **“SQLite is fine until it visibly breaks.”** Rejected: migration, restore and deletion work becomes least reversible after growth.
2. **“Migrate immediately because 10k was mentioned.”** Rejected: no present load justifies a premature database selection, and storage/job boundaries matter more than brand choice.
3. **“Put opaque 8 MiB artifacts and future media into the relational DB with higher caps.”** Rejected: backup/export/delete and writer-lock coupling becomes the dominant failure mode.
4. **“Run more Node replicas against the same SQLite volume.”** Rejected: `withTxnLock`, RAM limiters, role-play sessions and scheduler single-flight are process-local.
5. **“Use free providers as the 1k/10k cost plan.”** Rejected: free price has no accepted capacity, privacy or availability SLO.
6. **“Count cache hits we have not measured.”** Rejected: both TTS cost and disk envelopes would become fictitiously precise.
7. **“Make notifications parallel without a durable/fair claim design.”** Rejected: concurrency could amplify provider calls and fatigue; bounded concurrency requires measurement and shared policy.
8. **“Add a generic job or multi-agent platform during S0.”** Rejected by authority boundary and R12/R17; S0 defines triggers/contracts only.

## 14. Owner decision options

### Decision 1 — accepted operating tier

- **A — 20 DAU proof tier:** lowest operational burden; delays 100-user load work.
- **B — 100 DAU controlled-pilot envelope (recommended):** keep SQLite conditionally, require §12 evidence and §11 thresholds, start transition preparation before growth.
- **C — 1,000 DAU implementation target now:** requires S4/S5 architecture work before onboarding; premature without a pilot signal.
- **D — claim 10,000 DAU on current topology:** reject.

### Decision 2 — SLO set

- **A — owner-only best effort.**
- **B — controlled-pilot SLOs in §9 (recommended).**
- **C — commercial SLOs now:** requires shared coordination, stronger backup/restore, provider capacity and on-call ownership.

### Decision 3 — storage boundary

- **A — keep current opaque bundles in SQLite through 20 DAU only.**
- **B — keep them through the controlled pilot with 250 MB/user preparation trigger and measured export/delete gates (recommended).**
- **C — approve object-storage implementation now:** outside S0 and requires S5/S6.

### Decision 4 — cost/fairness boundary

- **A — retain owner-only 300/day managed pool without external guarantee.**
- **B — for any external pilot, reserve per-user/per-scenario minimums and micro-dollar/token ceilings before expanding managed access (recommended).**
- **C — BYOK-only external pilot:** lower platform invoice, higher setup/support/privacy friction.

### Decision 5 — purge and restore target

- **A — p95 purge <24h; RPO 24h / RTO best effort.**
- **B — p95 purge <1h, p99 <24h; RPO 24h / RTO 2h (recommended).**
- **C — commercial p95 purge <15m and RTO <30m:** requires durable purge jobs and different recovery operations.

## 15. Owner-approved resolution

The owner approved the following S0 envelope on 2026-07-16:

1. Tier B: 100 DAU controlled pilot, with 20 DAU as the first witnessed proof.
2. Controlled-pilot SLO option B.
3. SQLite remains allowed only while every §11.1 threshold is green.
4. Transition preparation begins at 100-DAU approval or any §11.2 trigger; transition is mandatory before 1,000 DAU/multi-process/persistent material jobs.
5. Opaque artifacts remain bounded pilot data, not a personal corpus; 250 MB/user or 25% of DB bytes triggers storage-boundary preparation.
6. Managed model access remains capped; external managed use requires fair per-user/scenario allocation and token/micro-dollar reservation. No free provider is treated as guaranteed capacity.
7. Agent TTS stays disabled until character reservation and hard-stop accounting exist.
8. Backup/restore/delete claims require witnessed, content-safe evidence rather than configuration presence.

## 16. Exact S0 exit criteria for starting S1

S1 role/authority registry design may start only after all are true:

1. An operating tier (20/100/1k/10k meaning) is selected.
2. The SQLite stay/prepare/mandatory-transition triggers are accepted.
3. One SLO/failure-budget option is selected for interactive, model, notification, purge and restore work.
4. Managed model/TTS cost and fairness hard-stop direction is selected.
5. Artifact storage trigger and export/delete SLA are selected.
6. The S0 evidence harness scope is approved; estimates remain labelled until measured.
7. No new DB/provider/object store has been selected by implication.
8. S1 remains a documentation/contract slice unless separately authorized.
9. The final owner-approved S0 document passes link and whitespace checks, stages only the S0 documentation path, and is committed/pushed as a scoped docs change.

Owner approval satisfies criteria 1–5. Criteria 6–9 remain execution gates for the next separately bounded S1 documentation/contract slice and for publication of this S0 canon. No S1/S2/S3/F1/database/job/material implementation is authorized by this approval.

## 17. Source map

Primary repository sources read for this packet:

- `CLAUDE.md`; `docs/PROJECT_ROLES.md`.
- `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md`.
- `docs/planning/LINGUISTPRO_WAVE2_LB2_CLOSURE_HANDOFF_2026_07_16.md` and `LINGUISTPRO_WAVE2_LB2_LESSONS_LEARNED_2026_07_16.md`.
- `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`.
- `docs/planning/AI_MENTOR_RECON_2026_07_04.md`.
- `docs/planning/ai_agent_education_strategy_2026_07_11/19_AGENT_CONTROL_PLANE_DESIGN.md`.
- Live `migrations/020`–`038`, `db/*Repo.js`, `db/sqlite.js`, `db/txnLock.js`, `db/backup.js`, `db/integrity.js`, `agent/llm*.js`, `agent/lessonBuilder.js`, `agent/roleplay.js` and scheduler/rate-limit paths in `server.js`.

External price sources are linked directly in §7. No private production operations file was opened.
