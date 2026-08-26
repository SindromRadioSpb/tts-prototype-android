# Security, privacy, cost and operations

Date: 2026-08-26
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`; branch `main`; dirty tree preserved
Production basis: `3.11.440`; no production mutation or load test
Method: `CODE`, `EXTERNAL_PRIMARY`, `INFERENCE`

## Threat model

| Threat | Prevention | Detection / response / recovery | Residual risk |
|---|---|---|---|
| OAuth theft, fixation, confused deputy | Existing PKCE, exact issuer/audience/resource, bearer header only, no cookies/query tokens/passthrough; live connection/client/owner allowlist | Typed auth metrics; revoke connection/token family; rotate keys; audit without token/body | Compromised authorized client can read within granted scopes until revoke |
| IDOR / private or group enumeration | Exact public namespace, edition/item relationship checks and latest rights facts on every call; uniform not-found | Per-object denial counters; alert scan patterns; revoke/rate | Public website metadata remains scrapeable independently |
| Silent scope widening | New capability names/scopes/consent version; no aliasing old Ben-Yehuda scopes | Consent/scope diff gate and migration tests | Users may not understand model-context reuse; copy must be plain-language |
| Prompt injection in corpus text | Content labelled untrusted data; closed tools; no writes/sampling/fetch; output never changes tool authority | Injection-pattern aggregate only if content-free; client approval/filter guidance; suspend affected projection | Models may still follow malicious source text; client defenses remain necessary |
| SSRF/open redirect/tracking | No URL input/fetch/preview; only server-built canonical HTTPS URLs; visible destination; no external links pilot | Reject/counter non-canonical URL construction; configuration integrity alert | Agent may independently browse public links outside MCP |
| Malicious PDF/audio | No binary in MCP; exact MIME/hash/bytes, nosniff, Range; current first-party viewer boundary | Hash/read-back failures hard-stop; withdraw current resource pointer; restore exact backup | Downstream PDF parsers may have vulnerabilities; client sandboxing is external |
| Output amplification/scraping | Page/output caps, scope/subject/connection/IP/tool/resource rates, no package URL, no parallel pilot | Rate/denial/bytes aggregates; temporary throttle, revoke or flag off | Determined actors can scrape anonymous public UI separately |
| Cache authorization leak | Cache key includes auth/right epochs and immutable identity; authorize before read and before return | Canary tests, cache-hit-by-scope metrics; global purge/flags off | Implementation error can cross subjects; red tests mandatory |
| Edition confusion | Full edition/item/snapshot identity, pinned cursor, no silent rebind | Mismatch error and integrity alert; current pointer rollback does not rewrite descriptor | User may manually compare old/new sources incorrectly; response labels edition |
| Rights race/revoke | Latest append-only fact, single transaction writer, live epoch checked after data read | Race test; revoke latency SLO; invalidate cache and stop writer on anomaly | In-flight response already emitted cannot be recalled |
| Log/privacy leak | Content-free audit only: subject pseudonym, tool, purpose, result, counts, bytes, latency; no query/title/body/URL/token | Sentinel scans, retention purge and access audit | Operational timing/counts still reveal coarse interest patterns |
| Dependency/protocol supply chain | Exact lockfile, official SDK packages, SBOM/audit, dual-era red tests | Security advisory watch; rollback lockfile/server version | Ecosystem is rapidly changing; zero risk impossible |
| Moderator/content writes | None in program | Any discovered write path is release blocker | Future write tools need a separate threat model and owner approval |

## Privacy contract

- Pilot data is already approved public corpus content, but official agent use still requires owner rights facts and user OAuth consent.
- Anonymous public reading remains sessionless; MCP is authenticated because connection consent, rate/revoke and audit are required.
- No learner state, notes, grades, `review_log`, personal text, group membership, email, name or Telegram identity appears in output.
- Audit subject identifiers are pseudonymous; content-free events retain 30 days detailed and longer only as aggregate unless existing Agent Access policy is stricter.
- Export/delete of the user's Agent Access connection/audit follows existing identity policy; public corpus and owner rights records are not user-owned learner data.
- No minors-specific account flow is added. If accounts for minors become an intended audience, launch stops for a separate consent/guardian/safety review.
- Client/provider data retention applies after data leaves LinguistPro. OpenAI and Anthropic both warn that connected-server data flows across the connector boundary; consent copy must name this.

## Quantitative load model

Assumptions, not observed demand:

- 10–50 MCP calls per agent-active user per active day;
- 4–16 KiB bounded metadata/text output per call;
- 20x short burst over daily-average RPS on a popular task;
- direct binary download is separate; mean Physics PDF is about 1.54 MiB (`114,301,036 / 74`), but Study Songs asset bytes were not measured in this session;
- no server-side LLM/provider call, OCR job or binary duplication.

| Agent-active users | Calls/day range | Average RPS | 20x burst RPS | MCP payload/day | Architecture expectation |
|---:|---:|---:|---:|---:|---|
| 1 | 10–50 | <0.001 | <0.02 | <1 MiB | Existing single process trivial |
| 10 | 100–500 | <0.01 | <0.12 | 0.4–8 MiB | Existing single process |
| 100 | 1k–5k | 0.01–0.06 | 0.2–1.2 | 4–80 MiB | SQLite + small immutable cache |
| 1k | 10k–50k | 0.12–0.58 | 2.4–11.6 | 40–800 MiB | Measure DB queue, cache hit and egress |
| 10k | 100k–500k | 1.2–5.8 | 24–116 | 0.4–8 GiB | CDN/direct assets essential; load-gated DB evolution may be needed |

Binary egress dominates. If 10% of 500k calls fetch one mean Physics PDF, that is roughly 77 GiB/day; this is a sensitivity bound, not a forecast. Package download is excluded, and client caches should honor immutable hashes.

## SQLite and evolution triggers

SQLite/single process/single writer remains recommended initially because all MCP operations are bounded reads and the rights writer is owner-only. Evolve only on measured evidence sustained for seven days or reproduced in load tests:

- MCP DB-read p95 >50 ms or end-to-end p95 >400 ms at approved load;
- event-loop lag p95 >100 ms, CPU >70% sustained or memory >75% limit;
- SQLite busy/lock failures >0.1% of requests or write queue >2 seconds;
- cache hit <80% for immutable catalog/item descriptors at 1k+ users;
- sustained >10 authenticated read RPS or burst >50 RPS cannot meet SLO on current host;
- monthly asset egress or disk growth exceeds approved host allowance, or disk >80%;
- search corpus grows beyond 10k published items or bounded search p95 >100 ms.

Responses:

1. optimize indexes/query bounds and immutable cache;
2. offload immutable binary delivery/CDN without moving rights truth;
3. add a read replica/database evolution only after parity/restore rehearsals;
4. add a queue only for future OCR/derivative jobs, never for authorization.

No distributed search, object-storage migration or queue is justified by the current 151 published items.

## Rate and quota budgets

Pilot defaults per connection, with lower of connection/subject/IP budgets:

- catalog list: 30/min, 300/day;
- item search: 20/min, 500/day;
- item/resource descriptor: 60/min, 2,000/day;
- text window: 30/min, 1,000/day;
- concurrent calls: 1 in owner pilot, maximum 4 only after load evidence;
- response bytes: tool cap above; daily MCP output 16 MiB/connection in owner pilot;
- direct asset routes retain their existing public range limiter and host bandwidth controls.

These are initial safety values, not product entitlements. A legitimate owner pilot hitting a limit is measured before widening.

## SLO, backup and rollback

Pilot SLO targets:

- availability 99.5% monthly for the flagged MCP projection;
- authorized tool p95 <400 ms excluding direct binary download;
- rights/connection revocation effective within 60 seconds, target immediate;
- integrity mismatch returns no descriptor/body;
- zero cross-authority or content-bearing audit events.

Backup/restore contract:

- rights/scope migration only after pre-migration DB backup and temporary-copy rehearsal;
- daily DB backup, RPO 24h, pilot RTO 4h;
- read-back counts/latest-fact semantics plus `PRAGMA integrity_check=ok`;
- published source files/hashes remain in the existing corpus/resource backup layout; no new binary copy;
- restore drill verifies rights deny/allow, edition pins, 74 Physics hashes and representative Study Songs rows/assets;
- partial restore never enables MCP: fail closed until DB/file/hash parity passes.

Rollback:

1. flags off modern/publication MCP capabilities;
2. stop new rights writer operations;
3. preserve append-only rows and old MCP tools;
4. serve existing browser corpora unchanged;
5. if SDK regression exists, redeploy prior lock/server version;
6. only a rehearsed migration down/restore may remove schema; no ad-hoc row deletion.

## Cost envelope

No LLM or paid provider is called by the server, so costs are host CPU/DB, logs and egress. Exact provider unit pricing was not inspected because production coordinates are private and no purchase decision is needed for research.

Recommended owner budget stops—not market-price claims:

- owner/private pilot: incremental infrastructure ≤ USD 25/month and ≤5% of current host capacity;
- 1k agent-active users: review at USD 100/month or 100 GiB/month incremental egress;
- 10k: mandatory architecture/cost review before USD 500/month or 1 TiB/month egress;
- any unexpected paid provider/LLM/OCR charge: immediate NO_GO and flags off.

Record actual cost per 1,000 tool calls, per GiB MCP payload and per GiB asset egress before each rollout widening.
