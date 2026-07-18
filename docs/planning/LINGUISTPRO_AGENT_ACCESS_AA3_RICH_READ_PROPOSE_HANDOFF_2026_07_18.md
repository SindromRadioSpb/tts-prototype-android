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

## 6. Вне scope AA3

Запись в учебную правду (Ярус C — Ментор, не Hermes); мультиарендность; новые LLM-вызовы от агента (R16 — агент не тратит серверный бюджет); client-side OPFS-мост для client-only данных.
