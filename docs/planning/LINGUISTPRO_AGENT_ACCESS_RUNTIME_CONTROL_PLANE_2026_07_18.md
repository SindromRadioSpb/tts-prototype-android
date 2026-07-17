# LinguistPro Agent Access — Runtime Control Plane (AA2-CP1)

Дата: 2026-07-18 · Статус: DESIGN → implementation в этой же сессии · Владелец одобрил направление (сессия 2026-07-17/18: «исправить архитектуру управления gates», «убрать избыточные ограничения», довести Hermes до зрелого постоянного использования).

## 1. Проблема

Все шесть gate-флагов Agent Access читаются из process env. Coolify-окружение меняется только редеплоем ⇒ каждое открытие/закрытие окна авторизации = 3–6 полных редеплоев (наблюдалось в C4-PRE/C4A/C4B). Это главный источник неэффективности программы AA и блокер постоянной интеграции Hermes.

## 2. Решение (bounded slice)

DB-backed runtime-управление **ровно двумя** флагами-переключателями окна:

| Флаг | Управление после CP1 |
|---|---|
| `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED` | env **ИЛИ** DB-событие (runtime) |
| `AGENT_ACCESS_MCP_ENABLED` | env **ИЛИ** DB-событие (runtime) |
| `AGENT_ACCESS_UI_ENABLED`, `AGENT_ACCESS_OAUTH_ENABLED` | env-only (стабильно «1» на проде, не участвуют в окнах) |
| `AGENT_ACCESS_OWNER_IDS`, ключи/JWKS/HMAC | env-only (identity/key pinning, задаются один раз) |

Плюс runtime-управление статусом статических клиентов (`ACTIVE`/`SUSPENDED`) через существующий `setClientStatus`.

### 2.1 Семантика эффективного флага

```
effective(flag) =
  env AGENT_ACCESS_EMERGENCY_OFF === "1"        → "0"   (аварийный kill, побеждает всё)
  env <flag> === "1"                             → "1"   (легаси/постоянное env-включение)
  env AGENT_ACCESS_RUNTIME_FLAGS_ENABLED !== "1" → "0"   (control plane выключен ⇒ поведение как сегодня)
  latest DB-событие: value="1" И (expires_at IS NULL ИЛИ expires_at > now) → "1"
  иначе (нет события / value="0" / TTL истёк / ошибка чтения DB / битая строка) → "0"  (fail-closed)
```

- `expires_at = NULL` — **постоянное включение** (осознанный выбор владельца для зрелого режима Hermes; отдельная кнопка, отдельный audit-код).
- `expires_at` в будущем — **окно** с автозакрытием: по истечении момент сравнения `now` даёт «0» без таймеров и без записи.
- Рестарт процесса ничего не «включает»: состояние читается из DB и так же fail-closed.
- Кэш резолвера in-process ≤ 2 с (не даёт DB-запрос на каждый MCP-запрос; гранулярность окон — минуты).

### 2.2 Хранение — append-only журнал (R12: log ≠ projection)

Миграция `043_agent_access_runtime_control.sql`, таблица `agent_access_control_events`:

| колонка | тип | смысл |
|---|---|---|
| `event_id` | INTEGER PK AUTOINCREMENT | порядок |
| `created_at` | TEXT ISO | момент действия |
| `actor_user_id` | TEXT NOT NULL | владелец (проверен по `AGENT_ACCESS_OWNER_IDS`) |
| `action` | TEXT CHECK | `FLAG_SET` / `CLIENT_STATUS_SET` / `WINDOW_OPEN` / `WINDOW_CLOSE` |
| `subject` | TEXT NOT NULL | `clients` / `mcp` / `<oauth_client_id>` |
| `value` | TEXT NOT NULL | `1`/`0` или статус клиента |
| `expires_at` | TEXT NULL | NULL = постоянное |
| `reason` | TEXT NOT NULL | обязательный человекочитаемый мотив |

Текущее состояние = последнее событие по subject (проекция вычисляется запросом, dual-write отсутствует). Статус клиента при этом канонически живёт в `agent_oauth_clients.status` (существующая таблица) — событие фиксирует **кто/когда/зачем** менял.

### 2.3 Точки врезки

- `createMcpDefaultOffGate` и `createOAuthDefaultOffGate` получают опцию `resolveFlags` (async → `{ui, oauth, clients, mcp}` строками "0"/"1"). Дефолт = чистый env-ридер ⇒ все существующие фикстуры/смоуки не меняют поведения; default-off сохраняется by construction.
- `server.js`: `getAgentAccessOAuthRuntime` / `getAgentAccessMcpRuntime` используют тот же резолвер для CLIENTS/MCP (UI/OAUTH — env, как раньше). Мемоизация рантаймов не мешает: гейт отсекает запросы ДО рантайма, когда эффективный флаг «0».
- `requireAgentAccessBoundary` (браузерный UI) остаётся env-only — UI-флаг не участвует в окнах.

### 2.4 Owner-only admin API (за existing boundary + requireUser + CSRF)

| Endpoint | Метод | Действие |
|---|---|---|
| `/api/agent-access/admin/state` | GET | эффективные флаги + источник (env/db/off) + TTL + статусы клиентов + хвост журнала (≤50) |
| `/api/agent-access/admin/flags` | POST | `{flag: "clients"\|"mcp", value, ttl_minutes?, reason}`; `ttl_minutes` 5–1440 или отсутствует (=постоянно, только при `value:"1"`) |
| `/api/agent-access/admin/clients/:clientId/status` | POST | `{status: "ACTIVE"\|"SUSPENDED", reason}` (REVOKED — только вручную из ops) |
| `/api/agent-access/admin/window/open` | POST | пресет: оба флага «1» + TTL + активация перечисленных клиентов, один клик |
| `/api/agent-access/admin/window/close` | POST | пресет: оба флага «0» + suspend перечисленных клиентов, один клик |

Доступ: `user.id ∈ agentAccessOwnerIds()` (ровно один id из env). Не владелец / allowlist не задан → 404 (не раскрываем существование). POST-ы при `AGENT_ACCESS_RUNTIME_FLAGS_ENABLED !== "1"` → 503 с явным кодом (громкий отказ, не тихий no-op). Каждое действие: строка в журнал + `identityRepo.audit`.

### 2.5 UI

Панель «Управление доступом (владелец)» в `public/agent-access.html`: карточка состояния (флаг/источник/осталось TTL), кнопки «Открыть окно 60 мин» / «Постоянный режим» / «Закрыть всё», переключатель клиентов, лента журнала. Тексты ru/en/he в существующих TEXT-картах. Панель рендерится только если `GET admin/state` вернул 200. Mobile-first 380px.

## 3. Инварианты

1. **Fail-closed везде**: любая аномалия чтения (нет таблицы, ошибка DB, битое событие, истёкший TTL) ⇒ флаг «0». Никаких исключений наружу из резолвера.
2. **Env-kill доминирует**: `AGENT_ACCESS_EMERGENCY_OFF=1` (редеплой) гасит всё независимо от DB; прежний путь «выключить env-флаги» тоже продолжает работать (DB может только добавить «1» к env-«0», а emergency перекрывает и это).
3. **Default-off by construction**: без `AGENT_ACCESS_RUNTIME_FLAGS_ENABLED=1` поведение бит-в-бит сегодняшнее (дефолт опции `resolveFlags` = env-ридер).
4. **Запрещённые scope и клиентская модель не меняются**: никакого DCR, клиенты — прежний статический allowlist, пять read-only инструментов, все запреты Hermes decision packet (A×10) в силе.
5. **Единственный писатель состояния** — admin API; журнал append-only; ручные UPDATE в DB остаются возможными как break-glass, но вне контракта.
6. **Наблюдаемость**: каждый переход — журнал + audit + `disk`-безопасные логи; `admin/state` всегда показывает «почему флаг такой» (source: env/db-window/db-permanent/off + expires_at).

## 4. Гейты

- `npm run smoke:agent-access:control-plane` (новый, `scripts/premium/agent-access-control-plane-smoke.js`): семантика резолвера (env-kill > env-on > cp-off > db-ttl > fail-closed), TTL-экспирация, fail-closed на DB-ошибке, owner-gate админ-эндпоинтов, пресеты open/close, append-only журнал.
- Существующие: `smoke:agent-access`, `smoke:agent-access:mcp`, `smoke:agent-access:oauth-deployment`, `smoke:agent-access:production-handlers` — обязаны остаться зелёными без правок фикстур.

## 5. Rollout

1. Код + миграция 043 + смоуки → commit main → авто-деплой (миграция применится штатно).
2. **Один** конфиг-редеплой Coolify: `AGENT_ACCESS_RUNTIME_FLAGS_ENABLED=1` + `AGENT_ACCESS_OWNER_IDS=<owner id>` (остальное уже стоит).
3. Дальше все окна/постоянный режим — из UI/API без редеплоев.
4. Rollback: `AGENT_ACCESS_RUNTIME_FLAGS_ENABLED=0` (редеплой) возвращает сегодняшнее поведение; аварийно — `AGENT_ACCESS_EMERGENCY_OFF=1`.

## 5a. Адверсариальная критика (R14 / R11 / R12+R16) — резолюции

Дизайн прошёл трёхролевую критику до кода. Принятые изменения:

| # | Находка | Резолюция |
|---|---|---|
| B1 | (R12) Restore из бэкапа тихо переоткрывает закрытое окно и воскрешает revoked-креды | Restore-путь append'ит синтетические `FLAG_SET "0"` (clients+mcp) + suspend всех ACTIVE клиентов, actor `system:restore`, action `RESTORE_FAIL_CLOSED`. После restore владелец переоткрывает явно. Смоук-кейс обязателен |
| B2 | (R11) Rejected memo-promise рантайма кешируется навсегда → 503 до рестарта | Оба memo (`agentAccessOAuthRuntimePromise`, `agentAccessMcpRuntimePromise`) сбрасываются при rejection: `.catch(err => { promise = null; throw err; })` |
| B3 | (R11) Гейт и `getAgentAccessMcpRuntime` резолвят флаги независимо → 503 внутри DB-окна | Резолв **один раз за запрос** в гейте; снапшот передаётся `getRuntime(effectiveFlags)`; геттер проверяет снапшот (env только для UI/OAUTH) |
| M1 | (R11) `window/close` через suspend клиента терминально ревокает token families → каждое переоткрытие = новый consent | Закрытие окна = **flags-only** (боундари всё отсекает, refresh-токены сохраняются для резюма). Suspend клиента — отдельное, явно-деструктивное действие с предупреждением в UI |
| M2 | (R14) Runtime-включение де-эскалирует привилегию до session cookie; permanent усиливает | **Step-up**: любой ВКЛЮЧАЮЩИЙ переход (flag 0→1, окно, permanent, client→ACTIVE) требует повторного ввода `AUTH_BOOTSTRAP_SECRET` в теле запроса (timing-safe). Выключающие — без step-up (fail-safe направление). TTL-окна ≤ 1440 мин |
| M3 | (R11+R14) `setClientStatus` воскрешает REVOKED клиента | Control plane разрешает только `ACTIVE ↔ SUSPENDED`; из `REVOKED` — отказ `AA_CP_CLIENT_REVOKED_TERMINAL` |
| M4 | (R12+R11) Молчаливый провал миграции 043 (SQLITE_BUSY на rolling-деплое, нет busy_timeout, retry нет, healthz зелёный) | `PRAGMA busy_timeout=5000` в `initDb` (давний канон-долг); `admin/state` различает `source:"error"` (нет таблицы/ошибка чтения) от честного «off» |
| M5 | (R12+R14) Статус клиента + журнал = dual-write из двух транзакций | Журнальная строка пишется **внутри** транзакции `setClientStatus` (опциональный параметр `controlEvent`) |
| M6 | (R12) Reject резолвера = crash процесса (Express 4 + Node 20) | Контракт резолвера «никогда не reject» (внешний try/catch всего тела) + гейт всё равно оборачивает вызов |
| M7 | (R12+R11) Пять read-site'ов флагов, включая аргументы `validateOAuthHttpRequest`; позиции аргументов и literal-строки "0"/"1" обязаны сохраниться | Полный свод: `mcpAdapter:83` (mcp), `mcpAdapter:86-88` (ui/oauth/clients → boundary), `oauthDefaultOffGate:41-43` (то же), `server.js` OAuth-getter (ui/oauth env), MCP-getter (снапшот). Смоук гонит полный HTTP-запрос при env«0»+DB«1» до bearer-challenge |
| M8 | (R11+R12) env-pinned «1» делает «Закрыть всё» тихим no-op | Выключающий переход при env-pin → `409 AA_CP_FLAG_ENV_PINNED`; UI показывает pin. Rollout-шаг явно фиксирует env CLIENTS/MCP=0 (на проде уже так) |
| M9 | (R11) Существующие смоуки флипают env между запросами при уже-созданном гейте; кеш в дефолтном пути их сломает | Дефолтный `resolveFlags` = **per-request некешированный env-ридер**; кеш ≤2 c живёт только в DB-ветке server.js-резолвера; при `RUNTIME_FLAGS_ENABLED!=1` DB не трогается вовсе |
| M10 | (R11) `production-handlers-smoke` парсит server.js между `agentAccessOwnerIds` и `getAgentAccessMcpRuntime` | Весь новый код вне этого спана; сигнатура-маркер `async function getAgentAccessMcpRuntime` сохраняется префиксно |
| m1 | (R14) TTL-сравнение: пустая строка/не-Z оффсет могут дать fail-open | `expires_at === null` — явная проверка (не truthiness); инстансы сравниваются через `Date.parse` (NaN → «0»); формат `...Z` CHECK-ом в схеме; смоук-кейсы `""` и `+03:00` |
| m2 | (R14) Порядок guard'ов admin: 503 до owner-check раскрывает поверхность | Порядок: boundary → requireUser(401) → owner(404, ловя throw `agentAccessOwnerIds`) → CSRF → cp-enabled(503) → step-up → env-pin → исполнение |
| m3 | (R14+R11) Кеш: не отдавать last-known-good «1» на ошибке; инвалидация при admin-записи; кешировать и ошибку («0») от probe-штормов | Принято всё: ошибка кешируется как «0» на TTL, admin-запись инвалидирует синхронно, single-flight |
| m4 | (R12) Пресеты неатомарны | Порядок безопасности: open = клиенты, затем флаги; close = флаги (only). Per-step result array (норма bulk-partial) |
| m5 | (R12) 5 эндпоинтов → единый guard-pipeline | API схлопнут до `GET admin/state` + `POST admin/transition {type,...}` |
| m6 | (R14) `AGENT_ACCESS_OWNER_IDS` может не совпасть с реальным `users.id` → тихий lockout | `admin/state` возвращает `owner_env_matches_user`; rollout-шаг требует проверить его = true |

## 6. Вне scope CP1

Runtime-управление UI/OAUTH-флагами и owner allowlist; новые scope/инструменты; AA3 (propose-first intents); мультиарендность admin-панели (единственный владелец); web-push уведомления о переходах.
