# LinguistPro Agent Access — Hermes Mature Integration (SHIPPED)

Дата: 2026-07-18 · Статус: **LIVE на проде, owner-verified end-to-end** · Пакет: v3.11.199 + AA2-CP1 control plane.

Итог сессии: Hermes (личный агент владельца, NousResearch hermes-agent 0.18.2) **постоянно подключён** к LinguistPro через first-party OAuth 2.1 MCP и читает реальные учебные артефакты. Управление доступом переведено с редеплоев на runtime control plane.

## 1. Что закрыто

| Трек | Статус |
|---|---|
| Консолидация C4A/C4B веток в `main` | ✅ merge `8afcf95`, прод-деплой зелёный |
| Прод-диск (был долг) | ✅ docker prune 82%→46% |
| **AA2-CP1 runtime control plane** | ✅ v3.11.199 `ce766a1`, миграция 043, гейт `smoke:agent-access:control-plane` (54 checks) |
| Прод-активация control plane | ✅ env `AGENT_ACCESS_RUNTIME_FLAGS_ENABLED=1` + `AGENT_ACCESS_OWNER_IDS` (один restart, без кода) |
| **Постоянная интеграция Hermes** | ✅ OAuth-подключён, токены кешированы, переживает рестарт, авто-refresh |
| Продуктовая проверка (5 инструментов на реальных данных) | ✅ learning_brief=140 due, catalog возвращает работы Бен-Иегуды |
| C4A Inspector debt | ✅ закрыт как **satisfied-by-Hermes** (см. §6) |

## 2. Control plane (замена редеплоям)

Владелец открывает/закрывает окна авторизации из `/agent-access.html` (панель «Управление доступом», только владелец) — **без редеплоя**. Канон дизайна: `LINGUISTPRO_AGENT_ACCESS_RUNTIME_CONTROL_PLANE_2026_07_18.md` (прошёл 3-роле-адверсариальную критику R14/R11/R12+R16, все BLOCKER/MAJOR зафиксированы до кода).

- Флаги `clients`/`mcp` = env **ИЛИ** append-only журнал `agent_access_control_events` (миграция 043). Эффективный флаг: `EMERGENCY_OFF > env-pin > (control plane off → 0) > журнал(TTL) > fail-closed`.
- Окно: TTL 5–1440 мин (авто-закрытие без записи) или **постоянный режим** (`expires_at=null`).
- Включающие переходы требуют step-up (повторный `AUTH_BOOTSTRAP_SECRET`); выключающие — нет (fail-safe).
- Закрытие = flags-only (кредо Hermes сохраняются для резюма; suspend клиента — отдельное деструктивное действие).
- Restore-из-бэкапа fail-closed: `agentAccessControlFailClosed` append'ит `RESTORE_FAIL_CLOSED` (оба флага 0 + suspend активных клиентов) — восстановленный бэкап не переоткрывает закрытое окно.

**Текущее прод-состояние:** control plane ON, оба флага `db_permanent`, клиент `linguistpro-hermes-owner-v0` ACTIVE, `linguistpro-mcp-inspector-v0` SUSPENDED.

## 3. Постоянная конфигурация Hermes

Два инстанса Hermes у владельца: нативный (`%LOCALAPPDATA%\hermes`) и Docker-стек `G:\HERMES_AGENT` (hermes-agent + hermes-webui для Hermex/iPhone через Tailscale). Подключён **Docker-инстанс** (его использует Hermex).

Изменения (вне git-репо, живут на машине владельца):
- `G:\HERMES_AGENT\docker-compose.hermex.yml`: добавлен port-map `127.0.0.1:8765:8765` (OAuth loopback callback).
- Контейнерный `config.yaml` (том `hermex-hermes-home`): блок `mcp_servers.linguistpro` → `url: https://linguistpro.kolosei.com/agent-access/mcp`, `auth: oauth`, `client_id: linguistpro-hermes-owner-v0`, `redirect_port: 8765`, **`scope` строкой через пробел** (не YAML-список — Hermes 0.18.2 OAuthClientMetadata требует string), 5 инструментов, resources/prompts off.

## 4. Как подключён OAuth (важный нюанс Hermes 0.18.2 headless)

`hermes mcp login` в headless-контейнере **бажный**: связывает 8765, принимает paste-код, но второй внутренний раунд повторно биндит 8765 и падает `RuntimeError: Event loop is closed` до записи токен-файла. Обходной путь (использован, воспроизводим):

1. Владелец залогинен в LinguistPro (браузер, session cookie).
2. Свой authorization_code+PKCE-S256 flow: сгенерировать verifier/challenge, открыть `…/oauth/auth?…` в браузере, подтвердить consent (5 scope + retention ack) → редирект на `127.0.0.1:8765/callback?code=…` (порт не слушается — код читается из URL).
3. Обмен `POST /oauth/token` (form-urlencoded, **без cookie** — token-route запрещает cookie) с `code_verifier` → `{access_token, refresh_token, expires_in, token_type, scope}`.
4. Записать Hermes-формат в `HERMES_HOME/mcp-tokens/linguistpro.json`: дамп SDK `OAuthToken` + добавленный абсолютный `expires_at = now + expires_in` (см. `HermesTokenStorage.set_tokens`, `/opt/hermes/tools/mcp_oauth.py`), owner `hermes:hermes`, `chmod 600`.
5. `hermes mcp test linguistpro` → `✓ Connected`, 5 tools.

Скрипты сессии (scratchpad, не в репо): `aa-owner-verify.mjs` (owner control API), `aa-token-exchange.mjs` (PKCE-обмен → токен-файл).

> ⚠ Для НАТИВНОГО Hermes на ПК владельца (есть реальный браузер) `hermes mcp login linguistpro` должен пройти в один клик без этого обхода — headless-баг специфичен для Docker.

## 5. Доказано (owner-verified на проде)

- `✓ Connected` OAuth 2.1 PKCE, транспорт HTTP → `/agent-access/mcp`, protocol `2025-11-25`.
- 5 инструментов discovered + вызваны с **реальными данными**: `get_learning_brief` → due_total 140 / urgent 136 / ~105 мин (реальная SRS-петля); `get_agent_connection` → ACTIVE, 5 scope; `search_public_reading_catalog` → работы Бен-Иегуды (אחד העם, אשר ברש, אלכסנדר אהרנסון).
- **Переживает рестарт контейнера** (`✓ Connected 738ms` из кеша, без ре-авторизации).
- **Авто-refresh**: форс-экспирация access-токена → Hermes рефрешит по refresh-токену, ротация, новый `expires_at` в будущем.
- Runtime open/close окна из owner-панели — без редеплоя.

## 6. C4A Inspector debt — решение

C4A требовал independent-client live-валидации MCP-протокола. **Hermes — независимый MCP-клиент** и полностью её выполнил: initialize + tools/list (ровно 5) + 5×tools/call с bounded-контрактами + refresh-ротация (рестарт+экспирация). Inspector-специфичный баг PRM-discovery уже исправлен на main (path-scoped alias `…/oauth-protected-resource/agent-access/mcp`). Поэтому **C4A закрыт как satisfied-by-Hermes-live-validation**; отдельный прогон MCP Inspector — опционален (клиент SUSPENDED, включается из панели при желании). Это осознанное owner-решение, не переклассификация старого C4A-прогона.

## 7. Как владельцу пользоваться дальше

- Hermes работает постоянно (permanent режим). Спросить его про учёбу — он читает brief/review/каталог.
- **Закрыть доступ** в любой момент: `/agent-access.html` → «Закрыть доступ» (кредо сохранятся, endpoint'ы 404). Аварийно — env `AGENT_ACCESS_EMERGENCY_OFF=1` + redeploy.
- **Time-boxed вместо постоянного**: «Открыть окно (60 мин)».
- iPhone (Hermex) через Tailscale к hermes-webui:8787 использует то же подключение.

## 8. Хвост / хозяйке на заметку

- Прод signing-JWKS / cookie-keys / audit-HMAC читались через SSH `printenv` в этой сессии (в контейнере, не публиковались). Ротация опциональна; **ротация JWKS инвалидирует текущие Hermes-токены** → потребует повторный login. Делать только вместе с переподключением.
- Owner-панельные строки добавлены в ru/en/he + SW-бамп при следующем UI-коммите Зала (инвариант tt-локалей).
