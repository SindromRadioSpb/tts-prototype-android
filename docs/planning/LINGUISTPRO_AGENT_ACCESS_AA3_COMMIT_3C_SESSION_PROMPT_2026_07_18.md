# AA3 commit 3c — session prompt (create_reading_handoff + propose_action W1)

> Вставь всё, что ниже разделителя, как первое сообщение новой сессии Claude Code в репозитории `E:\projects\tts-prototype-android`. Секреты (AUTH_BOOTSTRAP_SECRET, owner id) добавь в конце от себя — в этот файл они НЕ вписаны намеренно.

---

## Задача

Реализуй **AA3 commit 3c** подсистемы **Agent Access** (MCP-доступ личного агента Hermes к артефактам LinguistPro). Два инструмента + опциональный третий:

1. **`create_reading_handoff`** (scope `reading.handoff.create`) — агент минтит одноразовую first-party ссылку, открывающую **корпусную (public-domain) работу** в Читальном зале. Сейчас код инструмента лежит **dormant** (contract/schema/handler есть в `agent/access/*`, но БЕЗ записи в `capabilities.js` → не экспонируется; consent-презентация withheld). Придержан по конкретной причине (ниже) — надо довязать PWA и вернуть capability.
2. **`propose_action` (W1 propose-then-confirm)** (scope `intent.propose`) — агент создаёт **PENDING-предложение**, владелец подтверждает в панели `/agent-access.html`, LinguistPro исполняет. Агент НИКОГДА не исполняет сам.
3. (Опционально, если останется бюджет) **delta/changelog-инструмент** — Hermes отметил, что не может ответить «что изменилось с прошлого раза» (видит только текущий срез).

## Контекст (прочти сначала)

- LinguistPro (`https://linguistpro.kolosei.com`, прод Hetzner+Coolify, деплой = git push в `main`) — иврит↔русский, FSRS, корпус Бен-Иегуды. Репо называется `tts-prototype-android`, но это Node.js-приложение (`server.js`).
- **Читай канон:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA3_RICH_READ_PROPOSE_HANDOFF_2026_07_18.md` (весь дизайн + §5a критика + §5b/5c/5d что уже отгружено), `docs/planning/LINGUISTPRO_AGENT_ACCESS_HERMES_MATURE_INTEGRATION_2026_07_18.md`, `docs/planning/LINGUISTPRO_AGENT_ACCESS_RUNTIME_CONTROL_PLANE_2026_07_18.md`. В памяти есть `project_hermes_agent_access` — там сжатая история.
- **Уже отгружено (не переделывай):** control plane (v3.11.199), зрелая интеграция Hermes, 10 инструментов AA3 (get_learning_brief/review_summary/search_public_reading_catalog/recent_explanation_metadata/agent_connection/access_window/due_review_items[пагинация]/learner_profile/explanation_body/reading_content). Все scope AA3 (включая `reading.handoff.create`, `intent.propose`) уже в `oauthContracts.SCOPES` + `contracts.SCOPES` + CHECK миграции `044_agent_access_scope_expansion.sql` — **новой миграции для scope не нужно**.

## Инварианты (жёсткие — не нарушать)

- **W0 запрещён навсегда:** агент НЕ пишет каноническую учебную правду (review_log/grade/fsrs/mastery/word_status). `propose_action` создаёт только PENDING; исполняет LinguistPro после подтверждения владельца.
- **Single-tenant:** `AGENT_ACCESS_OWNER_IDS` = один id (владелец). Всё content-чтение — его информированный выбор. Но propose пишет в новую таблицу — это ОК (не учебная правда).
- **Никогда не мутируй выходную схему существующего MCP-инструмента** — MCP-клиенты кешируют outputSchema (`additionalProperties:false`), добавление поля их ломает («Additional properties are not allowed»). Всегда добавляй НОВЫЙ инструмент.
- **byte vs char:** output-валидаторы капают по БАЙТАМ, иврит/кириллица ~2 б/символ. Обрезай контент через `byteSlice(v, maxBytes)` (уже есть в `productionHandlers.js`), не `.slice(0, N)`.
- **fail-closed consent:** каждый capability-scope ОБЯЗАН иметь запись в `consentCeremony.SCOPE_PRESENTATION` с `data_class` + `retention_tier` (`AGGREGATE`|`CONTENT`), иначе `AA_CONSENT_SCOPE_UNPRESENTED` (гейт `smoke:agent-access` это проверяет independent-oracle'ом).
- **Ошибки ввода клиента = `ARGUMENT_SCHEMA_INVALID` (retryable:false)**, НЕ `INTERNAL_ERROR` — иначе агент ретраит и роняет транспортный breaker.
- **grader-independence (R17), fail-closed, bounded/typed output, per-tool rate-limit** — как у остальных инструментов.

## 8 точек врезки на каждый новый инструмент (проверено на коде)

1. `agent/access/capabilities.js` — `{scope, purpose, scenario_id, max_output_bytes}`.
2. `agent/access/contracts.js` — scope в `SCOPES` (уже есть); input+output валидаторы; регистрация в `INPUT_VALIDATORS`/`OUTPUT_VALIDATORS`.
3. `agent/access/mcpSchemas.js` — input/output JSON-schema + описание; для write-инструмента `readOnlyHint:false` в `toolDefinitions()` (create_reading_handoff уже так).
4. `agent/access/productionHandlers.js` — handler + новые injected-deps + проверка deps.
5. `agent/access/mcpRateLimiter.js` — `TOOL_LIMITS[name]` (иначе 429/unreachable — R14-m6).
6. `agent/controlPlane/scenarioRegistry.js` — запись `agent_access.<scenario>`.
7. `agent/access/consentCeremony.js` — `SCOPE_PRESENTATION[scope]`.
8. Смоуки: `scripts/premium/agent-access-{domain,mcp,production-handlers}-smoke.js` — fixture/validArgs + тест + счётчик tools.
+ server.js: инъекция deps в `createProductionHandlers` (~строка 1695).

## create_reading_handoff — что доделать

Причина hold: redeem-путь `public/js/library-ui.js:8381` (`boot()`, `?handoff=` → `GET /api/reading-handoffs/redeem?t=`) открывает ТОЛЬКО личные OPFS-тексты (`SELECT id,title FROM texts WHERE text_key=?`), а `handoff_tokens` (миграция 038) НЕ несёт `work_id` → корпусная ссылка упрётся в ложный тост «синхронизируйте Мои тексты».

Сделай:
1. **Миграция 045-или-046:** `ALTER TABLE handoff_tokens ADD COLUMN work_id TEXT` (nullable; ALTER ADD COLUMN в SQLite безопасен, без rebuild). `handoff_tokens.action` уже без CHECK — `open_corpus` пройдёт.
2. **`db/handoffRepo.js`** — `mint(userId,{textKey,orderIndex,action,workId})` пишет work_id; `redeem` возвращает `{text_key, order_index, action, work_id}`.
3. **`public/js/library-ui.js:8381`** — если `hj.action==='open_corpus'` (или `hj.work_id`): открыть корпусную работу через существующий `openCorpusWork(card,{scrollToOrderIndex})` — резолвь card из `corpusReadyById.get(work_id)` (Map id→ready-card, ~строка 66); если карта не готова — честный тост, не тихий no-op. Иначе (personal) — прежний путь. Проверь на 380px через Playwright/Chrome-MCP, что клик по ссылке реально открывает работу.
4. Верни **capability** `create_reading_handoff` в `capabilities.js` + consent-презентацию `reading.handoff.create` в `consentCeremony.js` (сейчас закомментированы/withheld) + смоук-тесты (в production-handlers снять «held → UNKNOWN_TOOL», добавить успешный mint через fixture handoffRepo, + corpus-only fail-closed на неизвестный work_id, + scope-gating). Handler уже резолвит work_id через `corpusSentenceRepo.listWorkTexts` и форсит `action:'open_corpus'` — сверь, что он пишет workId в mint.
5. `create_reading_handoff` — **write** (mint пишет в handoff_tokens), поэтому в production-handlers-smoke держи его тест ВНЕ zero-delta-окна или используй fixture handoffRepo (не трогающий БД). Rate-limit уже tight (`minute:6, day:60`). Добавь per-user cap активных токенов (R14-m7), если дёшево.

## propose_action W1 — что построить

Модель: `propose_action({kind, payload})` → создаёт PENDING `agent_proposals` → возвращает `{proposal_id, status:"PENDING", ...}`. Владелец видит PENDING в панели `/agent-access.html`, подтверждает/отклоняет. На confirm — LinguistPro исполняет per-kind (для W1 минимум: пометить CONFIRMED + для kind `open_reading` сминтить handoff/deep-link, для kind `note`/`suggestion` — сохранить артефакт агента с провенансом «сгенерировано агентом, не истина», R9). Kinds — короткий allowlist.

1. **Миграция 045 `agent_proposals`** (шаблон — `migrations/040_f1_correctable_continuity.sql` таблица `learner_memory_records`): `proposal_id TEXT PK`, `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `oauth_client_id TEXT`, `connection_id TEXT REFERENCES agent_connections(connection_id) ON DELETE CASCADE`, `kind TEXT NOT NULL CHECK(kind IN (<allowlist>))`, `payload_json TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB))<=<cap>)`, `dedupe_key TEXT`, `status TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','DENIED','EXPIRED'))`, `created_at/updated_at/expires_at TEXT NOT NULL` + **partial-unique dedupe-индекс**: `CREATE UNIQUE INDEX ... ON agent_proposals(user_id,dedupe_key) WHERE dedupe_key IS NOT NULL AND status='PENDING'` (идемпотентность «тот же kind+payload-hash → тот же proposal_id»). Новая таблица → `CREATE TABLE IF NOT EXISTS` (без rebuild-танца). Раннер миграций (`db/migrate.js`) запрещает BEGIN/COMMIT в .sql.
2. **`db/agentProposalsRepo.js`** — `create(userId,{oauthClientId,connectionId,kind,payload,dedupeKey})` (идемпотентно через dedupe-индекс), `listPending(userId)`, `decide(userId,proposalId,decision)` (PENDING→CONFIRMED/DENIED, транзакция). Стиль — как `db/agentAccessOAuthRepo.js` / `db/agentProposals`-соседи.
3. **Handler `propose_action`** в productionHandlers — валидирует kind+payload (closed schema per kind), создаёт PENDING, возвращает `{schema_version, proposal_id, kind, status, expires_at, generated_at}`. **write** → в смоуке тестируй через fixture repo или вне zero-delta.
4. **Owner API** (за `requireAgentAccessBoundary` + `requireUser` + CSRF, как соседние `/api/agent-access/*` в server.js ~1704): `GET /api/agent-access/proposals` (list PENDING), `POST /api/agent-access/proposals/:id/decision {decision, ...}` (confirm/deny → исполнить/handoff). Аудит через `identityRepo.audit`.
5. **UI-секция «Предложения агента»** в `public/agent-access.html` + `public/js/agent-access.js` (owner panel `#ownerPanel` уже есть) — список PENDING с «Подтвердить»/«Отклонить»; строки ru/en/he в TEXT-картах. 380px-скрин.
6. Capability + contract + schema + rate-limit + scenario + consent-презентация (`intent.propose` = tier `AGGREGATE`, «agent proposes, you confirm») + смоуки.

## Гейты (все должны остаться зелёными)

```
npm run smoke:agent-access            # domain (independent-oracle presentation guard)
npm run smoke:agent-access:mcp        # tools/list + per-tool scope gating
npm run smoke:agent-access:production-handlers
npm run smoke:agent-access:oauth
npm run smoke:agent-access:oauth-deployment
npm run smoke:agent-access:control-plane
npm run test:api-smoke
node --check <каждый изменённый .js>
npm run db:migrate   # на temp DB — проверь применение новой миграции + сохранность
```
Плюс `smoke:agent-access:two-client` — это LIVE-смоук (нужен `AA2C2_HERMES_REPO` + uv), в этом окружении env-gated, не трогай.

## Деплой + owner-активация (воспроизводимо)

1. Bump версии в `package.json`, коммит в `main` (→ авто-деплой Coolify), дождись рестарта (`curl https://linguistpro.kolosei.com/healthz`, uptimeSec<120). Новая таблица применится на старте (`server.js` runMigrations).
2. Обнови конфиг Hermes (Docker `hermes-agent`, `%volume%/config.yaml` → `mcp_servers.linguistpro`): добавь новые scope в `oauth.scope` (строкой через пробел, НЕ список) + новые tools в `tools.include`.
3. Re-consent (новые scope): в браузере залогинься владельцем на `/agent-access.html` (POST `/api/auth/bootstrap-login` секретом) → удали старое подключение → пройди `…/oauth/auth?…` с полным набором scope → отметь content-карточки + ack → сними code с `127.0.0.1:8765/callback` → **cookie-free** `POST /oauth/token` (form-urlencoded, PKCE verifier) → запиши `HERMES_HOME/mcp-tokens/linguistpro.json` (owner hermes:hermes, chmod 600) → `docker restart hermes-agent hermes-webui`. Скрипты прошлой сессии-помощники: scratchpad `aa-token-exchange.mjs` (SCOPE через env `AA_SCOPE`) + `aa-owner-verify.mjs`.
4. **Hermes подхватывает новые инструменты только в НОВОМ разговоре** (манифест грузится на старте сессии; `hermes mcp test`/`mcp list` в CLI всегда свежие).
5. Live-verify каждый новый инструмент через токен Hermes (curl `POST /agent-access/mcp` c bearer): propose → PENDING → подтверждение в панели → исполнение; handoff → клик реально открывает корпусную работу.

## Гочи, стоившие времени в прошлой сессии

- **sqlite3 «dependency not installed»** — `npx` задевает `node_modules/bindings`; лечится `npm install bindings --no-save`.
- **Hermes headless `hermes mcp login`** бажный в Docker (двойной bind 8765 → crash до записи токена). Обход — свой auth-code+PKCE flow + запись токен-файла (см. mature-integration doc §4). На нативном Hermes с реальным браузером login проходит в один клик.
- **fork-сессия браузера** не наследует tab group — `tabs_context_mcp{createIfEmpty:true}` заново.
- Консенсусные версии-константы (`CONSENT_VERSION`, `RETENTION_NOTICE_VERSION`, `CAPABILITY_VERSION`) провязаны через `oauthRuntime.mjs` + hardcoded-литералы в `contracts.js`/`mcpResourceValidator.mjs`/`mcpSchemas.js` — бампать только все разом. **Не бампай CAPABILITY_VERSION** без нужды (ломает live-подключение на resource-валидаторе).

## Норма процесса

Существенный дизайн → адверсариальная роле-критика (R14 security / R15 GDPR-класс / R17 grader-independence) ДО кода (см. `docs/PROJECT_ROLES.md`; в прошлый раз поймала 2 BLOCKER). Скрин UI на 380px перед UI-коммитом. Коммить+пуш по завершении с prod-верифаем. `.claude/PROD_OPS_PRIVATE.md` (gitignored) — координаты прода/SSH.
