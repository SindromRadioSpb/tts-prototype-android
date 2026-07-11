# 02 — State of the art snapshot

**Status:** RESEARCH SNAPSHOT · **Checked:** 2026-07-11 · **Date-sensitive:** yes

## Capability landscape

| Capability | Current fact | LinguistPro implication |
|---|---|---|
| Tool use + structured outputs | OpenAI, Anthropic and Gemini expose tool/function calling; Gemini structured output supports a JSON Schema subset. Reliability still requires local schema validation and idempotent tools. | Use typed bounded functions; never trust model JSON or tool selection as authorization. |
| Long context / RAG / caching | Frontier APIs support large contexts, retrieval and prompt/context caching. Long context increases cost, privacy surface and distraction; it is not learner memory. | Build minimized versioned context packs and cache approved common context, not whole histories. |
| Multimodal/vision/OCR | Major providers accept text/images and some audio/video. | OCR/photo import is a bounded candidate-extraction flow; resolver/learner confirmation remains authoritative. |
| Realtime voice/ASR/TTS | Realtime speech-to-speech and streaming ASR are commercially available; OpenAI and Google publish voice/ASR APIs. | Listening/role-play prototypes are possible; pronunciation certification is not, without Hebrew-specific independent scoring. |
| Computer/browser use | Providers/frameworks offer controlled computer/browser actions. | Backstage research/ops only in sandbox; no learner-state or production-write authority. |
| Multi-agent orchestration | Agents SDKs and frameworks provide manager/handoff patterns. MCP standardizes tools; A2A standardizes opaque agent tasks. Neither is a permission system. | Internal typed functions are sufficient NOW. Adopt MCP/A2A only at real interoperability boundaries. |
| Durable execution | Workflow engines such as Temporal and checkpointed agent graphs support retries/pause/resume. | Needed only for long background content/eval jobs; canonical writes still require idempotent activities/outbox. |
| Local/open-weight | Strong open-weight models enable local classification/extraction, but Hebrew/task quality and device capacity vary. | Keep deterministic/local core; evaluate small/open models for redaction/classification, never assume parity. |
| Routing/batch/cache | Provider batch commonly discounts non-urgent inference; model routing and caching reduce cost. | Small-model-first and batch backstage work; premium escalation only after eligibility/value gates. |
| Evals/tracing | Provider SDKs and open observability stacks support traces/evals. Payload logging can violate consent/retention. | Metadata-only privacy-safe traces, pinned prompt/model/tool versions, local gold/replay. |

## Provider/framework comparison

| Ecosystem | Strength | Material constraint | Suitable use |
|---|---|---|---|
| OpenAI Responses/Agents/Realtime | integrated tool, multimodal, realtime, tracing and model catalog; snapshots | default abuse-monitoring retention up to 30 days; some stateful/background/tools conflict with ZDR | bounded multimodal/realtime pilots after policy review; not canonical memory |
| Google Gemini/Cloud Speech/TTS | existing repo dependency; function/structured output, caching, Live API; Hebrew cloud speech/voice ecosystem | unpaid Gemini content may be used for product improvement; paid tier terms differ; model churn | current explanation fallback/routing, TTS/ASR evaluation; paid project only for personal text |
| Anthropic Claude | strong tool use, long context, prompt caching/batch | separate integration; pricing/retention and regional terms must be pinned | independent critic or complex backstage synthesis, not required NOW |
| OpenRouter | broad routing/fallback | additional processor and heterogeneous policies/SLAs | owner-only experimentation; avoid class C/D until provider-by-provider registry exists |
| MCP | portable tool/resource contracts | server descriptions/output are untrusted; auth/audience/scopes still application duties | external tool boundary after typed internal registry |
| A2A | discovery/tasks between opaque agents | unnecessary coordination/security surface for one product/team | future partner agents only |
| Custom controller | matches live Node system, easiest to reason/test | must build schemas/traces/durability deliberately | recommended transitional architecture |
| LangGraph/Temporal-like | checkpoint/durable execution | operational burden, replay/idempotency/versioning discipline | later background curation/eval, not interactive grading |

## Pricing/privacy snapshot

- [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) states paid requests are not used to improve products and offers batch discounts; unpaid service content may be used for improvement under [Gemini terms](https://ai.google.dev/gemini-api/terms).
- [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) state API data is not used for training by default; abuse logs may be retained up to 30 days, with approved ZDR/MAM controls and endpoint-specific exceptions.
- [Google Speech-to-Text pricing](https://cloud.google.com/speech-to-text/pricing) lists standard recognition at $0.016/min and dynamic batch at $0.003/min at the first tier. [Google TTS pricing](https://cloud.google.com/text-to-speech/pricing) varies materially by voice family.
- [OpenAI realtime model documentation](https://developers.openai.com/api/docs/models/gpt-realtime) shows materially higher audio-token cost than text; voice should be metered per minute/outcome.
- [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing) supports caching/batch economics but exact current model rates must be fetched at procurement time.

## Scientific state

**FACT:** retrieval practice can transfer, but effect depends on response congruence, elaboration and initial success ([meta-analysis](https://pubmed.ncbi.nlm.nih.gov/29733621/)). **FACT:** GenAI language-learning literature is rapidly growing but heterogeneous, often short-term and writing-heavy ([2025 systematic review](https://www.tandfonline.com/doi/full/10.1080/10494820.2025.2498537)). **INFERENCE:** commercial capability permits prototypes, not claims of delayed Hebrew transfer. Provider Hebrew quality, latency and structured/tool reliability must be evaluated on LinguistPro gold sets rather than benchmark leadership.
