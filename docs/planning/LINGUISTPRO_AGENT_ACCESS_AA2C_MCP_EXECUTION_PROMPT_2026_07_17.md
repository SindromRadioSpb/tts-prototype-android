# Next-session prompt — LinguistPro Agent Access AA2-C1 default-off MCP engineering

> **Completion note (2026-07-17):** AA2-C1 is engineering-complete. Do not reuse this prompt to repeat C1. Review `LINGUISTPRO_AGENT_ACCESS_AA2C1_DEFAULT_OFF_MCP_ENGINEERING_EVIDENCE_2026_07_17.md`; the next possible slice is separately approved AA2-C2 only.

Работаем в `E:\projects\tts-prototype-android`.

Это отдельная engineering-сессия AA2-C1. Не расширяй её до production client registration, client activation, OAuth consent/token lifecycle, Hermes/Inspector host configuration или live connection.

## Authority precondition

Не меняй код/dependencies, пока владелец в этой сессии явно не одобрил AA2-C1 формулировкой, эквивалентной §15 packet:

`docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C_MCP_STATIC_CLIENT_LIVE_CONNECTION_DECISION_EXECUTION_PACKET_2026_07_17.md`.

Если prompt вставлен без такого approval, выполни только read-only recon, сообщи точный недостающий permission и остановись.

Даже после approval разрешены только:

- exact pin `@modelcontextprotocol/sdk@1.29.0` с проверкой lockfile integrity;
- thin HTTPS Streamable HTTP adapter на `/agent-access/mcp`;
- новый независимый exact-`1` gate `AGENT_ACCESS_MCP_ENABLED`, default `0`;
- bearer resource validation через существующий OAuth/connection/grant domain;
- fixture-only протокольные, security, rate, lifecycle и regression tests;
- content-safe docs и scoped commit/push, если это отдельно включено в approval.

Не разрешены production env/deploy, production client rows, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, authorization/interaction/consent/token/revoke execution, реальный credential/token, Hermes/Inspector installation/configuration, live connection, DCR/CIMD/registration, MCP resources/prompts/sampling/tasks, provider/LLM call, notification, CP0 live window, F1/F2/private learner payload read, canonical learner-state write, migration/API/UI change вне узкого MCP adapter slice.

## Прочитай полностью

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`
5. `docs/planning/LINGUISTPRO_AGENT_ACCESS_HERMES_DECISION_PACKET_2026_07_16.md`
6. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA1_OAUTH_TOOL_SCHEMA_THREAT_MODEL_CONTRACT_2026_07_16.md`
7. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2_READ_ONLY_EXECUTION_APPROVAL_PACKET_2026_07_17.md`
8. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2B_OAUTH_PERSISTENCE_AUTHORIZATION_SERVER_EXECUTION_APPROVAL_PACKET_2026_07_17.md`
9. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2B2_FIRST_PARTY_CONSENT_RESOURCE_VALIDATOR_EXECUTION_PACKET_2026_07_17.md`
10. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2B3_DEFAULT_OFF_OAUTH_DEPLOYMENT_EXECUTION_PACKET_2026_07_17.md`
11. `docs/planning/LINGUISTPRO_AGENT_ACCESS_D8_DEFAULT_OFF_PRODUCTION_DEPLOYMENT_APPROVAL_PACKET_2026_07_17.md`
12. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C_MCP_STATIC_CLIENT_LIVE_CONNECTION_DECISION_EXECUTION_PACKET_2026_07_17.md`

Не читай `.claude/PROD_OPS_PRIVATE.md`: C1 не является production operation. Не читай и не экспортируй F1/F2 payloads.

Код и migrations первичнее planning docs. Если baseline ушёл вперёд, проверь каждый Agent Access diff после последнего approved commit; неизвестную дельту не включай автоматически.

## Сначала доложи контекст

До mutation сообщи:

1. local/origin `main`, package version, clean/dirty state;
2. unrelated owner files, которые будут исключены;
3. фактическое отсутствие MCP dependency/route/gate;
4. существующие Agent Access service/OAuth/resource-validator boundaries;
5. exact protocol/SDK pin и свежесть compatibility freeze;
6. exact files, которые планируешь менять;
7. разрешённые approval mutations и все stop conditions.

## Инварианты реализации

```text
resource identifier=https://linguistpro.kolosei.com/agent-access
transport URL=https://linguistpro.kolosei.com/agent-access/mcp
protocol=2025-11-25
SDK=@modelcontextprotocol/sdk@1.29.0 exact
AGENT_ACCESS_MCP_ENABLED=0 by default
```

Adapter owns only initialization/version negotiation, Streamable HTTP/session mechanics, protected-resource challenge integration, `tools/list`, `tools/call` decode and structured result/error mapping. Business logic remains in `agent/access/service.js` and existing deterministic controllers. No SQL, FSRS, grading, learner-state, consent, notification or corpus-ranking logic may enter MCP handlers.

Advertise exactly five existing v0 tools. No MCP resources, prompts, sampling, elicitation or tasks. Session IDs are never authorization. One request authorizes one tool call.

When MCP gate is absent/empty/not exact `1`, `/agent-access/mcp` must return content-safe `404` before bearer validation, session allocation, limiter, tool dispatch or audit lifecycle write. Existing D8 metadata/OAuth behavior and independent client kill switch must remain unchanged.

## Required engineering gates

- exact dependency and lockfile integrity; no floating/pre-release/v2 branch;
- default-off route proof and enable-chain unit/fixture proof;
- initialize/version negotiation and unsupported-version rejection;
- exact five-tool `tools/list`, closed schemas and byte caps;
- positive/negative `tools/call` mapping through Agent Access Service;
- missing/malformed/wrong issuer/signature/key/audience/subject/client/connection/scope/expiry/revoke/epoch tokens;
- cross-user/client/connection and cache-key isolation;
- POST/GET/DELETE, content-type, Accept, session/reconnect negatives;
- invalid Origin `403`, Host/CORS/DNS-rebinding/forwarded-header negatives;
- query/cookie/argument/session token-passthrough sentinels rejected;
- rates, polling/load and output caps;
- export/delete/restore zero-resurrection regression;
- zero provider/BYOK/managed-LLM calls;
- existing auth/session/Telegram/Mini App/review/account lifecycle gates;
- post-diff R1–R17 critique.

Use only synthetic fixtures. Never print complete bearer/cookie/CSRF/authorization values.

## Stop conditions

Stop if implementation requires production mutation, client row, client activation, consent/token flow, DCR, confidential client secret, Hermes/Inspector configuration, new migration, F1/F2/private payload, provider call, canonical write, permissive CORS, token passthrough, alternate endpoint, business logic in adapter, unrelated repair or any weakening of the D8 boundary.

## Result

Return:

1. exact before/after and changed files;
2. pinned dependency/integrity and protocol;
3. gate table with commands/results;
4. R1–R17 critique;
5. deviations/stop evidence;
6. commit/push status if approved;
7. remaining C2/C3/C4 prohibitions;
8. a separate proposed approval for C2 two-client loopback — do not execute it.

Successful C1 status:

`ENGINEERING_COMPLETE / MCP_DEFAULT_OFF / ZERO_PRODUCTION_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS / NO_LIVE_CONNECTION`.
