# Next-session prompt — LinguistPro Agent Access D8 rerun after OIDC remediation

Работаем в `E:\projects\tts-prototype-android`.

Это отдельная production-сессия повторного D8. Не расширяй её до AA2-C, MCP, client registration, Hermes/Inspector configuration или live connection.

## Подтверждённый статус

- Production и `origin/main`: `b9fd359`; package `3.11.194`.
- Production после первого D8 корректно rolled back: UI/OAuth/client flags exact `0`; metadata/JWKS/client routes `404`; health/DB/migrations ready; zero clients/connections/grants/codes/token families/refresh tokens/Agent Access consents.
- Локальный reviewed engineering commit: `a6300db` (`fix(agent-access): close OIDC discovery contract`). Он не pushed, потому что push в `main` автоматически запускает Coolify deployment.
- `a6300db` добавляет closed HTTPS OIDC compatibility metadata, exact discovery allowlist, PAR/DPoP/auth-method closure, downstream-only Koa proxy trust и real-`server.js` production-like regression.
- Все gates из remediation packet зелёные. Production code/config после rollback не менялись.
- Три D8 secrets уже установлены в Coolify и не были скомпрометированы; значения не читать и не выводить. Public `kid`: `lp-aa2-es256-2026q3-01`; public thumbprint: `euxjU4GvmFXKRvdGgA8P_ZGbVbmhlLHeniGKNP5Z40I`; rotation due `2026-10-15`.

## Authority precondition

Не push’ить и не выполнять production mutation, пока владелец в этой новой сессии явно не разрешил:

> Утверждаю повторный D8 после OIDC remediation. Разрешаю read-only preflight, allowlisted push reviewed local Agent Access remediation commits в `main`, вызванный этим default-off Coolify deploy, включение только утверждённых D8 UI/OAuth flags при client flag exact `0`, metadata/JWKS и negative validation, 30-minute observation и flag-first rollback. Не разрешаю client rows/activation, authorization/token flow, MCP, Hermes/Inspector configuration, live connection, provider calls, CP0 live, F1/F2 reads или иные code/production changes.

Без такого approval выполнить только read-only recon и остановиться.

## Прочитать полностью

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/LINGUISTPRO_AGENT_ACCESS_D8_DEFAULT_OFF_PRODUCTION_DEPLOYMENT_APPROVAL_PACKET_2026_07_17.md`
5. `docs/planning/LINGUISTPRO_AGENT_ACCESS_D8_OIDC_DISCOVERY_REMEDIATION_EXECUTION_PACKET_2026_07_17.md`
6. этот prompt
7. `.claude/PROD_OPS_PRIVATE.md` локально, без цитирования private coordinates

Не читать F1/F2 payloads. Не открывать Coolify env page через DOM/screenshot automation: интерфейс раскрывает secret values. Любые flag changes выполняет владелец вручную либо через доказанно non-echo trusted path.

## Preflight

- проверить `origin/main`, local `main`, `git log origin/main..main` и exact allowlist; неизвестная дельта = stop;
- повторно прогнать remediation gates перед push;
- проверить production revision, health, migration 042, backup/rollback, one-hop Traefik/header replacement/no public backend;
- проверить D8 flags только как `0/1/present`, secrets только как `present`;
- доказать zero clients/connections/grants/codes/token families/refresh tokens/Agent Access consents;
- исключить все unrelated owner Wave-2/F1/F2/research files из commit/push.

## Approved D8 state

```text
AGENT_ACCESS_UI_ENABLED=1
AGENT_ACCESS_CANONICAL_ORIGIN=https://linguistpro.kolosei.com
AGENT_ACCESS_TRUST_PROXY=1
AGENT_ACCESS_OAUTH_ENABLED=1
AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0
AGENT_ACCESS_OAUTH_TRUST_PROXY=1
AGENT_ACCESS_OAUTH_PRIVATE_JWKS_JSON=<existing managed secret, do not read>
AGENT_ACCESS_OAUTH_COOKIE_KEYS_JSON=<existing managed secret, do not read>
AGENT_ACCESS_OAUTH_AUDIT_HMAC_KEY=<existing managed secret, do not read>
```

## Required production proof

Positive:

- `/healthz` → `200`, ready;
- protected-resource metadata → exact `200`;
- static RFC 8414 metadata → exact `200` HTTPS coordinates;
- OIDC compatibility metadata → exact closed HTTPS document, scopes exact, auth methods `[none]`, no PAR/DPoP/secret auth/extra endpoints;
- JWKS → expected public P-256/ES256 `kid`, no `d`, expected public thumbprint;
- authenticated owner management read → empty; unauthenticated/cross-origin denied.

Negative with client flag `0`:

- query-bearing authorization, token and revocation → `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` before runtime/limiter/consent;
- interaction cannot start;
- alternate well-known, PAR, DCR/CIMD, userinfo, introspection, device, CIBA, token exchange and suffix routes → absent;
- Host/forwarded/CORS/cookie/CSRF/bearer sentinel matrix fails closed;
- zero OAuth/consent lifecycle rows after validation.

Observe for 30 minutes with content-safe updates at least every 10 minutes. No CP0, polling, notification, provider/LLM call or learner-data read.

## Stop/rollback

При любом mismatch немедленно set `AGENT_ACCESS_OAUTH_ENABLED=0`, retain client flag `0`, restore UI flag `0`, redeploy known-good state if needed, retain migration 042, verify baseline `404` and zero rows. Не чинить production code в этой сессии.

Успешный статус только после полного observation:

`PRODUCTION_METADATA_READY / CLIENTS_EXPLICITLY_OFF / ZERO_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS / NO_MCP / NO_LIVE_CONNECTION`.
