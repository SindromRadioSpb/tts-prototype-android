# Next-session prompt — LinguistPro Agent Access D8 default-off production deployment

Работаем в `E:\projects\tts-prototype-android`.

Это отдельная production-сессия D8 для Agent Access. Не расширяй её до AA2-C, MCP или live client connection.

## Текущий подтверждённый статус

- `main` baseline на момент подготовки prompt: `8bf2b92`; package `3.11.194`.
- AA2-B3/B3.1: `ENGINEERING_COMPLETE / EXPLICIT_CLIENT_KILL_SWITCH / DEFAULT_OFF / FIXTURE_TWO_CLIENT / PRODUCTION_KEY_ABSENT / PRODUCTION_CLIENT_ABSENT / MCP_ABSENT`.
- `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED` является отдельным exact-`1` gate. При `0` authorization, interaction, token и revoke должны оставаться `404` до limiter/runtime/consent dispatch.
- Локальные deployment, OIDC loopback, OAuth lifecycle, Agent Access domain, auth, boundary и API gates зелёные.
- Production key/config/client rows не создавались; deploy, MCP, Hermes/Inspector config и live connection не начинались.
- D8 цель — только `metadata/JWKS readiness with clients explicitly off`.
- F1/F2 payloads не читать и не экспортировать.

## Authority precondition

Не выполняй production mutation, пока владелец в этой сессии явно не дал bounded approval, эквивалентный §15 D8 packet. Если prompt вставлен без такого approval, выполни только read-only recon, сообщи точный недостающий permission и остановись.

Даже после approval разрешены только:

- read-only repo/production preflight;
- локальное чтение private ops coordinates;
- безопасное создание/ввод трёх независимых Agent Access secrets без их вывода;
- изменение только D8 Agent Access env flags;
- default-off redeploy approved revision;
- metadata/JWKS, negative boundary validation и 30-minute observation;
- flag-first rollback при stop condition;
- content-safe evidence doc, scoped commit/push только если владелец отдельно разрешил документировать evidence в tracked repo.

Не разрешены: production client rows, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, consent/authorization/token flow, MCP endpoint/server/client/SDK, Hermes/Inspector installation/configuration, live connection, OAuth credential/token export, provider call, notification, CP0 live window, F1/F2/private learner payload read, migration/code/API/UI change, unrelated production repair, commit/push/deploy за пределами D8.

## Прочитай полностью и соблюдай

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
12. `.claude/PROD_OPS_PRIVATE.md` — только потому, что это отдельно утверждённая production operation; читай локально, не цитируй/не пересылай credentials, IP, resource names или secret values.

Код, migrations и фактическая production state первичнее planning docs. Если baseline ушёл вперёд, проверь каждый Agent Access diff после `8bf2b92`; не деплой неизвестную дельту автоматически.

## Сначала восстанови и доложи контекст

До любой mutation коротко сообщи владельцу:

1. текущие local/origin `main`, package version и production revision;
2. clean/dirty state и какие unrelated owner files будут исключены;
3. фактические D8 flags только как `present/absent` и `0/1`, без secret values;
4. количество production OAuth clients/connections/grants/codes/token families — только counts;
5. текущий `/healthz`, DB/migration readiness и backup/rollback readiness;
6. доказан ли ровно один Traefik hop, header replacement и отсутствие public backend access;
7. какие именно mutations разрешены approval;
8. все расхождения/stop conditions.

Не печатай полный env, connection strings, cookies, headers, credentials или private ops coordinates.

## Обязательный read-only preflight

Проверь:

- production действительно соответствует ожидаемому LinguistPro service/revision;
- approved commit `8bf2b92` присутствует в deploy candidate; все более новые Agent Access изменения просмотрены;
- публичный baseline `/healthz` стабилен;
- до D8 OAuth/discovery surface соответствует текущим flags;
- migration 042 применена/готова без создания новой migration;
- current client/connection/grant/code/token-family counts равны нулю; если нет — stop;
- существует актуальный DB/volume backup и точный rollback path;
- backend не открыт публично;
- Traefik — единственный hop и заменяет inbound forwarded headers;
- secret injection можно выполнить без stdout/chat/history/log exposure.

Если хоть один пункт нельзя доказать безопасно, mutation не начинай.

## Утверждённая Option B configuration

После успешного preflight и только при explicit execution approval:

```text
AGENT_ACCESS_UI_ENABLED=1
AGENT_ACCESS_OAUTH_ENABLED=1
AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0
AGENT_ACCESS_OAUTH_TRUST_PROXY=1
AGENT_ACCESS_OAUTH_PRIVATE_JWKS_JSON=<managed secret>
AGENT_ACCESS_OAUTH_COOKIE_KEYS_JSON=<independent managed secret>
AGENT_ACCESS_OAUTH_AUDIT_HMAC_KEY=<independent managed secret>
```

Создай/введи три независимых high-entropy secrets. ES256 key должен быть P-256, `alg=ES256`, `use=sig`, с non-secret unique `kid`; cookie key array и audit HMAC не связаны с ним или друг с другом. Не используй LinguistPro credentials, cookies, CSRF, owner token, BYOK/provider key или shared bearer.

Не выводи secret. Если текущие tools/UI неизбежно показывают значение в transcript/log, остановись и попроси владельца вручную ввести его в trusted Coolify UI. В evidence разрешены только public `kid` и public thumbprint.

## Deployment order

1. Зафиксируй content-safe preflight evidence.
2. Подтверди backup и rollback.
3. Введи secrets и exact flags; client flag обязательно явный `0`.
4. Redeploy только approved candidate через текущий documented Coolify path.
5. Дождись стабильного `/healthz`, DB и migrations ready.
6. Проверь exact public metadata/JWKS.
7. Проверь negative client/security matrix.
8. Снова проверь zero rows/state.
9. Наблюдай 30 минут, сообщая владельцу краткий update не реже чем раз в 10 минут.
10. Запиши итоговый content-safe status и остановись. Не переходи к client registration.

## Positive production checks

Проверь exact issuer/resource/endpoints и отсутствие лишних grants/features:

```text
GET /.well-known/oauth-protected-resource/agent-access        -> 200
GET /.well-known/oauth-authorization-server/oauth             -> 200
GET /oauth/.well-known/openid-configuration                   -> 200
GET /oauth/jwks                                                -> 200
GET /healthz                                                   -> 200, ready
```

JWKS: только public EC key material, expected unique `kid`, ES256, без private `d`; максимум active + one previous during planned rotation. Вычисли/зафиксируй только public thumbprint. Не сохраняй целые headers или secret config.

First-party Agent Access management surface: authenticated exact owner получает пустое состояние; unauthenticated/cross-origin read и mutation запрещены. Не выполнять consent.

## Negative production checks

При `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0` докажи:

- realistic query-bearing `/oauth/auth?...` -> `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED`;
- form POST `/oauth/token` -> тот же client-disabled `404`, zero token;
- form POST `/oauth/token/revocation` -> тот же `404`;
- interaction path не стартует;
- browser preflight/CORS и non-interaction `Origin` fail closed;
- DCR/CIMD/registration, userinfo, introspection, device, CIBA, PAR, token exchange и прочие запрещённые endpoints отсутствуют и не advertised;
- malformed/comma/suffix/alternate Host/forwarded values fail closed на правильной boundary;
- public proxy действительно заменяет hostile forwarded input, а private app boundary отвергает malformed values;
- cookie/CSRF/bearer/token passthrough не принимается;
- никакая OAuth/consent/client lifecycle row не создана.

Не отправляй реальные cookies, CSRF или tokens для negative proof. Используй синтетические sentinel values и не логируй их целиком.

## 30-minute observation

Наблюдай только content-safe:

- `/healthz`/UptimeRobot continuity;
- restart loop/error-rate/memory/disk indicators;
- route class + status/error code counts;
- zero clients/connections/grants/codes/token families;
- отсутствие secret/error leakage.

Это не CP0 live evidence и не product/learning evidence. Не включай CP0, polling, cron, notification или provider/LLM call.

## Stop and rollback

При любом stop condition из D8 packet немедленно:

1. `AGENT_ACCESS_OAUTH_ENABLED=0`;
2. сохранить `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0`;
3. восстановить prior UI/config state;
4. redeploy/restart prior known-good state при необходимости;
5. migration 042/tables не удалять;
6. проверить baseline OAuth `404` и health/auth/API recovery;
7. при любом token/key incident отозвать families/epochs и остановить дальнейшую работу.

Особые немедленные stop conditions: secret в output/log; unknown revision; отсутствие backup; ambiguous proxy; public backend; unexpected client row; authorization/token route проходит при client flag `0`; любой token/connection/grant/code создаётся; wrong issuer/JWKS/private key exposure; auth/CSRF/CORS regression; health degradation; необходимость code/migration/MCP/Hermes/F1/F2 change.

## R1–R17 обязательны

Особенно явно проверь:

- R2/R5: metadata deployment не является learning value или vendor-neutral integration evidence;
- R9/R12: external memory отсутствует; MCP/business logic не появляется;
- R11/R17: external prose/evaluator/grade/evidence отсутствуют;
- R14/R15: client kill switch, zero registry, no consent/downstream delivery;
- R16: zero polling/provider/managed LLM cost.

## Результат production-сессии

Верни владельцу:

1. exact before/after без private coordinates;
2. deployed revision и итоговый статус;
3. positive и negative gate table;
4. public `kid`/thumbprint и rotation due date;
5. zero-state counts;
6. 30-minute observation result;
7. любые deviations/stop/rollback evidence;
8. список того, что всё ещё не разрешено;
9. предложение отдельного AA2-C decision/execution packet — без его реализации.

Успешный exact status:

`PRODUCTION_METADATA_READY / CLIENTS_EXPLICITLY_OFF / ZERO_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS / NO_MCP / NO_LIVE_CONNECTION`.

Не называй D8 Hermes integration, MCP readiness, OAuth client proof, live evidence или product launch.
