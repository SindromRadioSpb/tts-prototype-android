# 10 — Security, privacy, cost and governance

**Status:** PROPOSAL · **Pricing checked:** 2026-07-11

## Security/privacy findings

**FACT:** principal-derived identity, audience separation, Mini App HMAC/freshness/replay checks, CSRF, closed tools, consent-gated artifacts/sentences, canonical idempotent review writes, export/delete/TTL and model kill switch are strong owner-live controls.

**BLOCKER:** external pilot still needs a single truthful public policy matching cloud/Telegram/provider reality; verified provider/age/region/retention eligibility; consistent off-host backup; delete→restore→journal-replay proof; secret rotation/incident/purge alerts; and injection/tenant isolation tests. Current top-level local-only privacy language and development addendum must not conflict for public users.

Every provider route records service tier, region, retention/ZDR, subprocessors and contract version. Class C personal text fails closed unless the route is approved. Revocation immediately blocks access and creates an idempotent durable cleanup job; UI distinguishes access disabled from cleanup complete. Untrusted learner/agent/provider content never enters instruction channels or chooses arbitrary tools.

## Cost assumptions

Planning profiles per MAU/month: low = 8 LLM actions, 2k new TTS chars, 0.5 transfers; medium = 40 actions, 15k chars, 3 transfers; active = 120 actions, 60k chars, 10 transfers. Bounded Flash/mini inference is estimated at roughly $0.01/$0.08/$0.32; Neural2-like TTS before shared free/cache effects roughly $0.03/$0.24/$0.96; data/telemetry reserve $0.02/$0.08/$0.25. These are assumptions, not observed bills.

| MAU | Low technical cash/month | Medium | Active |
|---:|---:|---:|---:|
| owner | $20–40 | $20–41 | $22–42 |
| 20 | $31–61 | $38–68 | $61–91 |
| 100 | $66–156 | $100–190 | $213–303 |
| 1,000 | $310–760 | $650–1,100 | $1,780–2,230 |

Fully loaded labor/human-review planning bands add approximately $360–720 owner, $750–1,500 at 20 MAU, $2.1k–4.2k at 100 and $12k–30k at 1,000. **INFERENCE:** review/support/operations dominate model tokens through 1,000 MAU.

Medium-profile technical cost/CCT is about $0.13 marginal; shared-platform allocation makes it roughly $0.63–1.13 at 20 MAU, $0.33–0.63 at 100 and $0.22–0.37 at 1,000. Fully loaded illustrative cost/CCT is about $13–26, $7–15 and $4–10 respectively. **UNKNOWN/BLOCKER:** CCT is not yet instrumented, so these are sensitivity bands. Halving transfer rate doubles cost/CCT; TTS cache/new-character volume and reviewer minutes dominate.

Other units: approved generated content is likely inference-cheap but human review at 2–6 minutes/unit costs about $1k–3k per 1,000 units at $30/h. Speaking cost is UNKNOWN and $0 baseline until ASR/TTS/grader telemetry exists. A 20-user pilot can cost $39–78/user-month fully loaded.

## Governance matrix

| Action | Data/write risk | Autonomy | Required gate |
|---|---|---|---|
| local deterministic read/derive | A, no egress | automatic | bounds/audit |
| plan/explanation candidate | A–C advisory | recommend | consent, provenance, route, cost, abstain |
| personal text egress/cloud/notification | C/D | none | explicit situated consent each expanded purpose |
| review event | canonical | deterministic bounded tool | challenge binding, grader, idempotency, annul |
| content candidate | public/curated | batch candidate | licence/schema/critic/human approval |
| semantic publish/remediation | high | prohibited to model | immutable approval + narrow tool + canary/rollback |

Operational gates: per-outcome usage ledger without content; provider/TTS budgets and disk/cache alerts; 5× peak load before 100 MAU; durable queue/outbox and no in-memory correctness dependency before 1,000; outage/billing/kill-switch/restore/deletion drills. Initial 20-user pilot cap proposal: ≤$100 technical cash/month and ≤$25 fully loaded per CCT.

Official snapshots: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Google TTS](https://cloud.google.com/text-to-speech/pricing), [Google STT](https://cloud.google.com/speech-to-text/pricing), [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint), [Telegram Mini Apps](https://core.telegram.org/bots/webapps), [OWASP excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/).
