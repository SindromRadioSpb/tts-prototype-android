# LinguistPro Agent Access — AA3: Rich-Read + Propose/Handoff (DESIGN)

Дата: 2026-07-18 · Статус: DESIGN (owner выбрал «Rich-read + propose/handoff» 2026-07-18) · Предок: AA2 (5 read-only tools) + AA2-CP1 control plane · Роли: R17 (grader-independence, ведущая), R14 (security surface), R15 (data lifecycle/GDPR), R2 (methodist), R4 (premium UX), R16 (cost).

Цель: превратить Hermes из «докладчика агрегатов» в полезного компаньона — он видит **реальный учебный контент** (Ярус A) и умеет **предлагать действия + открывать первопартийные флоу** (Ярус B), НЕ нарушая инвариант «LinguistPro = источник учебной истины, внешний агент не сертифицирует» (Ярус C — запись — вне scope, доктрина A×10).

## 0. Механика расширения (как чисто добавить scope/tool)

Каждый новый инструмент трогает ровно эти точки (проверено по коду):
1. `agent/access/capabilities.js` — запись `{scope, purpose, scenario_id, max_output_bytes}`, бамп `CAPABILITY_VERSION`.
2. `agent/access/contracts.js` — scope в `SCOPES`; input+output валидаторы; регистрация в `INPUT_VALIDATORS`/`OUTPUT_VALIDATORS`.
3. `agent/access/mcpSchemas.js` — input JSON-schema (`closedObject`), output schema, описание, `toolDefinitions()` (readOnly-аннотация).
4. `agent/access/productionHandlers.js` — handler над реальными репозиториями.
5. `migrations/044_*.sql` — расширить CHECK-констрейнты scope в `agent_connection_grants` (и где ещё mirror'ится закрытый набор из 5).
6. `agent/access/oauthDeploymentContracts.js` — `FIXTURE_CLIENTS[*].scope` (Hermes + Inspector) + метаданные.
7. `agent/access/consentCeremony.js` + `public/js/agent-access.js` SCOPE_NAMES (ru/en/he) + `public/js/agent-access.js` (панель).
8. Смоуки: `smoke:agent-access` (домен), `:mcp`, `:production-handlers`.

**Data-class инвариант (R15):** новые scope'ы отдают КОНТЕНТ (класс данных выше агрегатов). Consent-ceremony обязана показывать это отдельной градацией (не «сводка», а «твои слова/тексты/объяснения»), с усиленным retention-notice. Каждый scope несёт `data_class` в consent-preview.

## 1. Ярус A — rich-read (ГРУНТОВАНО по карте источников)

Ключевой факт архитектуры: сервер держит **честную per-user основу = `review_log` (сырьё) + `srs_projections` (FSRS-расписание), ключ `item_key`**; всё человекочитаемое о слове **производится** поверх из ОБЩЕГО публичного датасета (`keyingService` над `pealim-infl-v12`), НЕ хранится per-user. Значит due-слова с контентом читаемы сервером без OPFS.

**Server-readable (строим):**
| tool | scope | источник | заметки |
|---|---|---|---|
| `get_due_review_items` | `review.items.read` | `learnerGraphRepo.getDue` + `keyingService.displayForItemKey`/`glossForItemKey` | реальные due-слова: поверхность, огласовка, RU-глосс, pos, синонимы, lapses/stability/due. Homograph/unkeyable → честная деградация (`null`/`ambiguous`, не выдумка). keyingService тяжёлый (~306MB, lazy) → cap items, rate-limit |
| `get_learner_profile` | `profile.read` | `agentRepo.getProfile` | mode/language/goals — контекст целей для агента |
| `get_explanation_body` | `explanations.body.read` | `agentRepo.getExplanationById` | ЧТИТЬ `purge_state` (revoke→tombstone); отдельный от metadata scope |
| `get_reading_content` | `reading.corpus.read` | `corpusSentenceRepo.getCorpusWindow`/`getCorpusLessonWindow` | ТОЛЬКО корпус Бен-Иегуды (public-domain), bounded окно ≤5 / lesson ≤N строк |

**НЕ server-readable (не строим — OPFS-only, инвариант честности):**
- Свободные ②-заметки пользователя / srs_card overlay — только браузер.
- Личные тексты — только если синхронизированы под consent `cloud_texts` (класс B); иначе OPFS. В слайсе-1 личные тела НЕ трогаем (только корпус).

Тихий «0»/пустой ≠ «нет данных» — различать (feedback_silent_empty_vs_real_empty): пустой из-за отсутствия синка ≠ пустой из-за нет due.

### Слайс-1 (этот билд) — максимум ценности, минимум consent-нюансов
1. **`get_due_review_items`** (`review.items.read`) — headline: «140 due» → реальные слова с контентом.
2. **`get_learner_profile`** (`profile.read`) — цели/режим.
3. **Фикс `get_agent_connection`** → поле `connection_persistence` (без нового scope) — §3.
4. **`create_reading_handoff`** (`reading.handoff.create`) — Ярус B, handoff-вариант (§2.1).

Отложено в слайс-2 AA3: `get_explanation_body` (purge-нюанс), `get_reading_content` (корпус-окна), `propose_action` (§2.2, новая таблица + confirm-UI), личные тексты.

## 2. Ярус B — propose / handoff

Две честные способности, обе сохраняют grader-independence (агент инициирует, LinguistPro исполняет):

### 2.1 Handoff (deep-link в первопартийный флоу)

Инфраструктура УЖЕ есть (карта §7): миграция 038 `handoff_tokens` (opaque capability: sha256 в DB, raw только в ссылке, single-use, 5-мин TTL) + `db/handoffRepo.js` (`mint`/`redeem`) + `GET /api/reading-handoffs/redeem?t=<raw>` (public, токен=capability, отдаёт только `{text_key, order_index, action}` — НЕ контент). Deep-link: `PWA?handoff=<token>` → PWA редимит → открывает reader на order_index.

Новый `create_reading_handoff` (scope `reading.handoff.create`): агент минтит first-party ссылку **на КОРПУСНУЮ работу** (public-domain, безусловно). Handler: вход `{work_id}` из каталога → `handoffRepo.mint` с action `open_corpus` → output `{ handoff_url: "https://linguistpro.kolosei.com/library.html?handoff=<token>", expires_in_ms, work_id }`. Валидатор output: `handoff_url` ТОЛЬКО на канон-origin, токен — opaque, без PII.

> Личные due-слова через `resolveAnchorLive` (consent-gated `cloud_texts`) — слайс-2 (нужен consent-нюанс + issueHandoff сейчас hard-gated на `telegram_miniapp`, нужен AA2-вариант источника анкера).

Существующий слот: `review_summary.handoff_eligible`/`handoff_scope_available` (форсятся false, `contracts.js:145`) — включим отражать наличие scope `reading.handoff.create` (по построению, не меняя другие поля).

### 2.2 Propose (предложение действия под подтверждение владельца)

Новый инструмент `propose_action` (scope `intent.propose`): агент создаёт **PENDING-предложение** (например «добавить слово X в список», «запланировать повтор корня Y»), которое владелец видит и **подтверждает в приложении**. Агент НЕ исполняет. Хранилище: новая таблица `agent_proposals` (миграция 044): `proposal_id, user_id, oauth_client_id, connection_id, kind (закрытый набор), payload (bounded, closed schema), status (PENDING/CONFIRMED/DENIED/EXPIRED), created_at, expires_at`. Владелец подтверждает через `/agent-access.html` (или Студию/Зал) → приложение исполняет первопартийно.

**R17:** propose ≠ execute; подтверждение — всегда владелец в первопартийном UI; никакой записи в SRS/оценки от агента. **R14:** payload — закрытая схема на каждый kind, byte-capped; kinds — короткий allowlist. **Идемпотентность:** повторный propose с тем же (kind,payload-hash) в окне → тот же proposal_id (feedback_shared_idempotency_key).

## 3. Фикс connection-инструмента (мелкий, из наблюдения Hermes)

`get_agent_connection` отдаёт `access_expires_at` (TTL 600 c access-токена) — агент читает это как «подключение истекает через 9 минут» и паникует, хотя окно постоянное и токен авто-рефрешится. Добавить в output поле `connection_persistence` = `WINDOW_PERSISTENT` / `WINDOW_UNTIL(<ts>)` / `TOKEN_ONLY`, чтобы агент отличал TTL токена от реального срока доступа. (Требует чтения control-plane состояния в handler — дешёвый резолвер уже есть.)

## 4. Инварианты (общие)

1. **Grader-independence (R17):** ни один новый scope не пишет в review_log/word_status/fsrs/mastery. Запрещённый список A×10 в силе. Propose создаёт PENDING, не факт.
2. **Fail-closed & bounded (R14):** каждый tool — byte-capped output, closed input/output schema, cardinality-cap, scope-gated. Новые scope'ы — по умолчанию НЕ в гранте (владелец выдаёт явно через панель/consent).
3. **Data-class consent (R15):** контент-scope'ы показываются в consent отдельной, усиленной градацией; retention-notice говорит «контент может остаться у агента».
4. **First-party-only handoff (R14+privacy):** deep-link только на канон-origin, из allowlist-паттернов, без PII в query.
5. **OPFS-честность:** строим серверный tool только на реально server-readable данных; client-only — не выдумываем.
6. **Independent-oracle гейты:** смоук на каждый tool с независимым оракулом (не повторный вызов билдера).

## 5. Rollout (staged)

Default-off по построению (новые scope'ы не в гранте, пока владелец не выдаст). Стадии: A1 (один самый ценный rich-read tool из карты) → B1 (handoff) → B2 (propose) → A2 (остальные rich-read). Каждая — свой гейт + адверсариальная критика до кода (R14/R15/R17) + owner live-verify.

## 5b. Commit 1 SHIPPED + owner live-verified (2026-07-18, v3.11.200)

Read-фундамент задеплоен default-off (`415ef50`), миграция 044 применена на проде (grants CHECK расширен до 11 scope), owner re-consent проведён (7 scope, content-class consent-экран с 2 усиленными карточками). Live на проде через токен Hermes:
- **`get_due_review_items`** → реальные due-слова владельца с глоссом + грубым struggle-band, БЕЗ ключа-ответов: `לקטון`/уменьшаться/high, `רב`/великий/high, `אב`/отец/high, `להיגרע`/быть убавленным/some (due_total 140, truncated, cap 5).
- **`get_learner_profile`** → `{mode:silent, language:ru, depth:detailed}` (без goals_json/user_id).
- **`get_agent_connection`** → `access_lifetime: PERSISTENT_WINDOW`, 7 granted scopes (фикс TTL-паники).
- Гейты зелёные (production-handlers 33, mcp 47/7-tools, domain 22, control-plane 54). two-client — live-Hermes-repo смоук (env-gated, не тронут).

Метод re-consent (воспроизводимо): owner-сессия в браузере → удалить старое подключение → authorize URL с 7 scope → approve content-класс consent (7 боксов + ack) → capture code с `127.0.0.1:8765/callback` → cookie-free `POST /oauth/token` → записать `HERMES_HOME/mcp-tokens/linguistpro.json` → restart hermes. Скрипты: scratchpad `aa-token-exchange.mjs` (SCOPE через env AA_SCOPE), `aa-owner-verify.mjs`.

**Commit 2 (actions) — остался:** `get_explanation_body` (purge_state), `get_reading_content` (корпус-окна), `create_reading_handoff` (corpus-only через `publicCatalog.resolveWork`, rate-limit), `propose_action` (W1, миграция 045 `agent_proposals`, owner-confirm UI). Спец — §1/§2 + план `toasty-greeting-balloon.md`.

## 5c. Commit 2 + 3a SHIPPED + owner live-verified (v3.11.201–204)

Итерации по фактам live-тестирования Hermes:
- **v3.11.201 `aff697b`** — schema-stability fix: `get_agent_connection` вернули к стабильной 11-полевой схеме (мутация выхода существующего инструмента ломала клиента с закешированной схемой `additionalProperties:false`), информацию об окне вынесли в новый additive `get_access_window` (scope agent.connection.read). **УРОК: не мутировать выходную схему существующего MCP-инструмента — добавлять новый.**
- **v3.11.202 `424cb60`** — commit 3a: `get_due_review_items` теперь ПАГИНИРУЕТ (limit 1–100 + opaque offset-курсор; next_cursor null на последней странице) — агент проходит все 140 due, не только топ-20; `get_explanation_body` (scope explanations.body.read, purge-aware) — читает тело объяснения ментора (text / retell lines), НЕ переэкспонирует цитируемое исходное предложение.
- **v3.11.203 `2218cbd`** — fail-closed consent поймал отсутствие SCOPE_PRESENTATION для explanations.body.read (AA_CONSENT_SCOPE_UNPRESENTED); добавили content-tier запись + independent-oracle смоук (каждый capability-scope обязан иметь presentation).
- **v3.11.204 `2f08015`** — byte-safe truncation: handler резал display/gloss/text по СИМВОЛАМ, а валидатор капает по БАЙТАМ (иврит/кириллица ~2 б/симв) → SCHEMA_INVALID при limit 100; `byteSlice(v,maxBytes)` для display(64)/gloss(120)/text(6000)/lines(500).

**Live через токен Hermes (9 инструментов):** пагинация — стр.1 (100 слов)+cursor → стр.2 (40)+null; `get_explanation_body` — kind sentence, AVAILABLE, реальный текст объяснения; purged → PURGED без контента. Owner re-consent на 8 scope (3 content-карточки). Гейты: production-handlers 38/9-tools, mcp 49/9, domain 25/9-caps, control-plane 54.

**Осталось — commit 3b (actions):** `get_reading_content` (нужен новый `corpusSentenceRepo.listWorkTexts(work_id)` для резолва text_key + мультиглавные работы), `create_reading_handoff` (corpus-only, mint напрямую), `propose_action` (W1, миграция 045 `agent_proposals` — шаблон из мигр.040 `learner_memory_records` с partial-unique dedupe-индексом; owner-confirm UI). Кандидат отдельно: delta/changelog-инструмент («что изменилось с прошлого раза») — Hermes отметил пробел.

## 5d. Commit 3b SHIPPED + owner live-verified (v3.11.205 `60289da`)

- **`get_reading_content`** (scope reading.corpus.read) — LIVE, читает реальный корпус на проде: work_id 11784 = «המרגלים» (Аронсон), 5 строк he+ru («Шпионы»…), chapters=1. Новый `corpusSentenceRepo.listWorkTexts(work_id)` резолвит work_id→text_key(и)+anchors серверно (window-функции требуют text_key, которого нет в каталоге); corpus-only by construction; byte-safe строки; available_text_keys = главы. (era иногда null — источник не всегда несёт валидный ERA enum; честная деградация.)
- **Cursor-error фикс (Hermes-наблюдение):** битый курсор get_due_review_items теперь декодируется/валидируется в input-валидаторе → чистый `ARGUMENT_SCHEMA_INVALID` (retryable:false) вместо `INTERNAL_ERROR` → клиент не ретраит и не роняет транспортный circuit-breaker на 3 страйка (Hermes видел «unreachable ~60c»).
- **`create_reading_handoff` — ПРИДЕРЖАН (dormant):** redeem-путь `library-ui.js:8381` открывает ТОЛЬКО личные OPFS-тексты (`SELECT ... FROM texts WHERE text_key=?`), а токен не несёт work_id → корпусная ссылка упёрлась бы в ложный «синхронизируйте Мои тексты». Отдавать нерабочую ссылку = silent dead-end (анти-честность). Контракт/схема/handler сохранены dormant (нет capability = не экспонируется); consent-презентация reading.handoff.create withheld (fail-closed). Ship когда: **handoff_tokens получит work_id (миграция) + library-ui обработает action=open_corpus** (открыть корпусную работу по work_id+text_key через openCorpusWork) + браузер-тест click-through.

**Осталось:** `create_reading_handoff` (см. выше) + **`propose_action` (W1)** — миграция 045 `agent_proposals` (шаблон миграции 040 `learner_memory_records`: PENDING-lifecycle + partial-unique dedupe-индекс), db/agentProposalsRepo.js (create-idempotent/list/decide), handler → PENDING, owner-confirm endpoints + UI-секция в панели, execution-модель per-kind (для W1 минимум: agent предлагает → owner подтверждает → LinguistPro исполняет/handoff). Кандидат: delta/changelog-инструмент (Hermes-flagged).

## 5e. Commit 3c SHIPPED (v3.11.206) — create_reading_handoff live + propose_action W1

3-роле адверсариальная критика ДО кода (R14 / R15+R9 / R17+R11) дала 8 BLOCKER + 13 MAJOR/MINOR; все BLOCKER и MAJOR зафиксированы в дизайне до первой строчки:

**Миграция 045** (`agent_proposals` + `handoff_tokens.work_id`):
- `oauth_client_id`/`connection_id` **NOT NULL** + композитный FK `(connection_id,user_id,oauth_client_id)` → cascade при удалении подключения И restore-erasure-replay (R15-B2: агентский текст не переживает отзыв);
- `authority` CHECK `AGENT_ASSERTED` / `USER_CONFIRMED_AGENT_ASSERTED` — confirm НЕ перелейбливает в user-authored (R9, паттерн F1 `USER_CONFIRMED_DERIVED`);
- dedupe-индекс `(user_id,connection_id,dedupe_key) WHERE status='PENDING'` — сервер-derived sha256(connection|kind|canonicalJson(payload)), в MCP-схеме dedupe-поля НЕТ (R17: анти-confusion);
- `display_title` резолвится ОДИН раз на create (R14: owner-GET без sync-IO fan-out); `decided_at` для retention.

**Lifecycle (R14-B1 zombie-фикс):** lazy-expire перед каждым insert/count/list; PENDING-cap 10 живых; deny-cooldown 7д (идентичный re-propose после DENIED возвращает отказ — MNAR-этикет, транспарентность заявлена в consent-карте); sweep в ops-каденции. **Retention (R15-M3, match-by-construction через `agent/access/proposalPolicy.js`):** PENDING 7д → EXPIRED; DENIED/EXPIRED purge 90д; CONFIRMED payload blank 180д, скелет purge 365д; consent-карта `intent.propose` показывает ровно эти границы (`internal_retention`) + `direction: AGENT_WRITES_INTO_YOUR_ACCOUNT` + scope-специфичный downstream (R15-B1). Экспорт стрипает `dedupe_key`; структурный GDPR-sweep покрывает таблицу автоматически (проверено оракулом auth-smoke).

**propose_action** (scope `intent.propose`, AGGREGATE): per-kind CLOSED валидация в contracts (`open_reading{work_id!,text_key?,order_index?,reason?}` / `note{body!,title?}` / `suggestion{body!}`), кросс-kind поля → UNKNOWN_FIELD (R14-B2); хранится НОРМАЛИЗОВАННЫЙ payload. Выход: `{proposal_id, status: PENDING|DENIED}` — CONFIRMED через этот канал НЕ возвращается никогда (R17).

**Owner-поток:** `GET /api/agent-access/proposals` (только живые PENDING подключений ACTIVE/SCOPE_REDUCED — revoked-агент теряет влияние, R14-M6) → панель `/agent-access.html` секция «Предложения агента» (enforced-CSP shell, только textContent, провенанс-строка «Предложение внешнего агента X — не проверено…» на каждой карте, R17-M6/R14-B3) → `POST …/:id/decision {confirm|deny}` (session+CSRF; mint ДО флипа PENDING→CONFIRMED — сбой mint'а оставляет строку re-confirmable, R14-M7) → для open_reading ответ несёт `handoff_url`. `DELETE /:id` — per-row owner-удаление (R15-m9; advisory-класс, резуррект из бэкапа документирован). Аудит обоих действий.

**create_reading_handoff un-hold:** mint несёт `workId`; `handoffRepo.countActive` cap 20 живых токенов; guard `HANDOFF_TEXT_KEY_REQUIRED` (анти-"undefined"-коэрсия). Redeem-ответ дополнен `work_id` (оба потребителя field-access — additive-safe). **PWA:** redeem-ветка строго по `action`: `open_corpus` → **`await loadCorpusIndex()`** (R17-B1: без этого карта-мапа детерминированно пуста на холодном боте) → `corpusReadyMap().get(work_id)` → `openCorpusWork({scrollToOrderIndex})`; фолбэк — локальный text_key-lookup; неизвестный action → честный тост (никогда не проваливается в чужой opener). Заодно починен пре-существующий баг P8.5: ключи `room.handoff.*` ОТСУТСТВОВАЛИ в локалях (тост показывал литеральный ключ) — добавлены ru/en/he + SW bump v3.11.206.

**Гейты с зубами (новые):** derived role-map в domain-smoke (write-инструменты → `agent_access.proposer`, reader-сценарии только `*_read`-capabilities; `agent_access.reading_handoff` реклассифицирован — mint это write); key-parity CAPABILITIES==валидаторы==TOOL_LIMITS==схемы==описания (R14-B4); W0-скан `productionHandlers.js` (code-only, без комментариев) + allowlist write-вызовов (`handoffRepo.mint/countActive`, `proposalsRepo.create`) + read-back fence `agent_proposals` (R17-M4/M7); XSS-sink скан панели; mint-args capture + raw-DB mint→redeem round-trip c work_id (R17-B2); zero-delta learner-truth таблиц при confirm (R17-M5); реальный repo-lifecycle (идемпотентность, deny-cooldown, zombie-expiry, cap, purge/blank, export-редакция).

Зелёные: domain 33 (12 caps), mcp 52 (12 tools), production-handlers 55, oauth, oauth-deployment, control-plane 54, api-smoke, миграция 045 — upgrade-путь на temp-БД с данными (строки сохранены). **Локально click-through проверен в реальном Chrome:** панель 380px → Подтвердить → «Открыть в Зале →» → Зал открыл «הַשַּׁחַר נִדְמֹה נִדְמָה» (работа 101, каталог v7) на нужной строке.

Принятые残-риски (documented): mint валидирует по works-тому (superset опубликованного каталога) — работа baked-но-не-published даст честный тост, не sync-совет (R17-m14); link-preview-префетч чужого канала может сжечь single-use токен (агент может пере-минтить, 6/мин) (R14-m9); NUL-байт в library-ui.js ломает repo-wide grep (R11-m11 — hazard записан здесь).

Кандидат следующего слайса: delta/changelog-инструмент («что изменилось с прошлого раза», Hermes-flagged) + Studio-surface подтверждений.

## 6. Вне scope AA3

Запись в учебную правду (Ярус C — Ментор, не Hermes); мультиарендность; новые LLM-вызовы от агента (R16 — агент не тратит серверный бюджет); client-side OPFS-мост для client-only данных.
