# P8.6 — Ops rollout Mini App: ранбук-чеклист (§19 TELEGRAM_MINI_APP_P8_RECON)

**Дата:** 2026-07-11 · **Прод на момент старта:** v3.11.151, `MINI_APP_ENABLED=1` (подтверждено live-пробой: `/api/miniapp/session` → 401 `NO_HASH`, не 503) · **Агентская часть SHIPPED v3.11.152** (гейты: `smoke:miniapp-rollback` 30/30 · `smoke:auth` 29/29 · `gate:log-hygiene` self-test 8/8 · регрессия api-smoke/miniapp-auth 32/32/home 15/15/review 68/68/review-session 24/24/telegram-review 32/32/selector 25/25/agent-review 66/66/cloze 21/21/dictate 30/30/pairing 33/33) · **Канон:** `TELEGRAM_MINI_APP_P8_RECON_2026_07_09.md` §15/§19, `MENTOR_ROLLOUT_NEXT_2026_07_11.md` §2 п.1.

**Adversarial-критика дизайна ДО кода** (workflow `wf_2e4d3fe5`, 3 линзы R14/R11/R15+R12): 24 находки, 11 MAJOR — все приняты с правками (devices-очистка в sweep; grace `processing` в pruneOld + удаление терминальных строк >7д; полностью явный env-словарь drill'а; бёрсты строго последними + XFF-teeth с ротацией левых спуфов; backdated-фикстуры + survival-ассерты; GDPR-энумерация независимой реимплементацией + chat-id-residue; log-гейт инвертирован в fail-closed allowlist аргументов + self-test). Отложено осознанно: (а) дозапись `complete()` по свипнутому в полёте challenge — гонка pre-existing и loud-fail'ится (`agentChallengeRepo.js` «replay source lost»), вернёмся если проявится в ops-логах; (б) перевод `purgeTelegramTraceForUser` из best-effort в блокирующий — ранний адъюдикат сознательный, residue теперь под гейтом.

Как читать: колонка «Кто» = **owner** (нужны секреты/консоли владельца) или **agent** (автоматизировано и верифицировано в этой сессии). Конкретные координаты прод-хоста — только в `.claude/PROD_OPS_PRIVATE.md` (gitignored), сюда не копируются.

## §1 Сводная таблица §19

| # | Пункт §19 | Кто | Статус | Свидетельство / действие |
|---|---|---|---|---|
| 1 | Rotate `AUDIO_UPLOAD_TOKEN` | **owner** | ⚠ рекомендована ре-ротация | Ротирован 2026-06-13 (см. PROD_OPS_PRIVATE), но с тех пор использовался в ops-сессиях (пуш dictate-аудио 2026-07-08). Симметричный shared-secret, сравнение constant-time (`db/premium/audioUploadAuth.js`, `server.js:1366`). Процедура: §2.1 |
| 2 | Firewall Coolify :8000 | **owner** | ❌ открыт | Готовый пошаговый ранбук (Hetzner Cloud Firewall, НЕ ufw) — `.claude/PROD_OPS_PRIVATE.md` §«RUNBOOK: closing Coolify :8000» |
| 3 | Scrub attack-roadmap/приватных доков | agent | ✅ верифицировано 2026-07-11 | Полный скан tracked-файлов: реальных IP/токенов/ключей НЕТ; `ssh -i` в CLAUDE.md — плейсхолдеры; `AIza…` — только fake-sentinel в smoke; приватные доки (`.claude/*`, `Архив/`) gitignored. Остаточный след в git history закрыт ротацией токена 2026-06-13 |
| 4 | Rollback-drill P3 **с MA-происхождёнными review-событиями** | agent | ✅ SHIPPED, 30/30 | НЕ существовал (cloud-sync-smoke гоняет только PWA-события). Новый гейт `smoke:miniapp-rollback` — см. §3.2 |
| 5 | Backup / integrity | agent (+owner решение по offsite) | ✅ **починен 2026-07-11** | Скрипт бэкапа был битым С 2026-05-28 (искажённая интерполяция при записи: `DATE=\2026…`, незакрытая кавычка) → 44 дня ни одного бэкапа, каждый ночной запуск падал синтакс-ошибкой. Переписан + `bash -n` + тестовый прогон: свежий `app-data-20260711-1751.tar.gz` 623M ✅. Ретенция find -mtime +14 удалила единственный майский снимок ПОСЛЕ создания свежего (потери нет). §2.3: offsite-копия — owner-решение |
| 6 | Disk alert | agent + **owner** (монитор) | ✅ код есть · ⚠ монитор не заведён | `/healthz` УЖЕ отдаёт `disk_pct_used`/`disk_warn` (порог 80%, `server.js:1251`). На 2026-07-11 было `disk_warn:true` (84%): docker build-cache съел диск → полный `docker builder prune` освободил 7.3G → **65%**. Owner: UptimeRobot keyword-монитор — §2.2 |
| 7 | Kill-switch `MINI_APP_ENABLED` | agent | ✅ код есть, drill-гейт добавлен | Fail-closed 503 на каждом /api/miniapp/* (`server.js:1991,2005`); api-smoke ассертит dormant-503. Полный rollback-контракт (§19: события сохраняются, down-sync жив, новые сессии/challenge не создаются) — гейт §3.2 |
| 8 | Session-purge job | agent | ✅ реализован | Гэп: protuхшие/revoked `user_sessions` и `miniapp_initdata_seen` копились бессрочно (только lazy-validate + GDPR-sweep). Новый часовой ops-sweep — §3.1 |
| 9 | Challenge-expiry cleanup | agent | ✅ реализован | `agentChallengeRepo.pruneOld()` и `handoffRepo.pruneOld()` были только lazy-on-read (reviewSession.js:428,633; review.js:177; issueHandoff) — при простое протухшее висело. Включены в тот же часовой sweep — §3.1 |
| 10 | Delete/export completeness (таблицы мигр. 034–038) | agent | ✅ teeth добавлены | Структурный sweep (`identityRepo.listUserScopedTables`) покрывает все новые таблицы по построению (у всех `user_id`); стрипы секретов: `user_sessions.token_hash+csrf_token`, `channel_pairing_tokens.token_hash`, `handoff_tokens.token_hash`. Гэп: auth-smoke ассертил фиксированные 4 старые таблицы → расширен динамическим zero-rows-ассертом по ВСЕМ swept-таблицам — §3.3 |
| 11 | Rate-limit burst | agent | ✅ ассерты добавлены | Код есть: `rlMiniapp` 120/мин/IP на всех BFF-маршрутах (`server.js:2049`), `/api/miniapp/session` — отдельный auth-fail-limiter (429 по фейлам, `:2008`); webhook — from.id 30/мин + content-cap 10/мин drop-with-200. Гэп: ни один smoke не ассертил 429 → burst-ассерты в drill-гейте §3.2 |
| 12 | Нет сырого initData/ответов в логах | agent | ✅ аудит чист + гейт | Ручной аудит всех `console.*` в agent/** и miniapp-регионе server.js + всех `identityRepo.audit`-payload: утечек НЕТ (только enum/id/счётчики/`e.message.slice(0,120)`); инварианты зафиксированы в коде (`miniappAuth.js:90`, `reviewer.js:30`, `llm.js:7`, `planner.js:16`). Анти-регрессия: статический гейт §3.4 |

## §2 Owner-шаги (требуют твоих секретов/консолей)

### 2.1 Ре-ротация `AUDIO_UPLOAD_TOKEN` (рекомендовано, ~5 мин)
1. Сгенерировать ≥32 случайных байт (например `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
2. Coolify UI → env-vars приложения → заменить `AUDIO_UPLOAD_TOKEN` → **Restart** (env применяется при старте).
3. Обновить локальный `.env` (клиенты: `push-corpus-works.js`, `bake-dictate-audio.js`, `push-*-overlay.js` и др. читают `process.env.AUDIO_UPLOAD_TOKEN`).
4. Верификация: любой push-скрипт с новым токеном → 200; со старым → 403 `BAD_UPLOAD_TOKEN`.

### 2.2 UptimeRobot disk-алерт (~5 мин)
Новый монитор типа **Keyword** на `https://linguistpro.kolosei.com/healthz`, keyword `"disk_warn":true`, alert **when keyword exists**. (Поле уже в проде; порог 80%, семпл раз в минуту, путей/чисел хост не раскрывает — только процент.)

### 2.3 Offsite-бэкап (решение)
Сейчас бэкапы лежат на том же диске (`/opt/backups/linguistpro`, ретенция 14 дней × ~623M ≈ 8.7G — на 38G-диске после чистки помещается, но single-point-of-failure остаётся). Варианты: Hetzner Storage Box (₤~4/мес, rsync по крону) · периодический pull на домашнюю машину. Также заметка: ночной tar снимает **горячую** SQLite (`app.db` 588M) — на однопользовательском пилоте в 03:00 UTC риск минимален, но при росте стоит перейти на `sqlite3 .backup`-снапшот внутри контейнера перед tar.

### 2.4 Firewall :8000 + SSH key-only (из PROD_OPS_PRIVATE, не новое)
Ранбук готов, шаги только через консоль Hetzner (владелец). После закрытия — проверить, что GitHub-webhook-деплой не сломался (тестовый push).

### 2.5 Docker-образы (опционально)
Build-cache почищен агентом (7.3G). Неиспользуемых образов ещё ~9.4G reclaimable — их чистка сузит окно 1-click-rollback в Coolify (любой коммит пересобираем из git за минуты). Если хочешь: `docker image prune -a -f` (агент может выполнить по команде).

## §3 Agent-шаги (код этой сессии)

### 3.1 Часовой ops-sweep (server.js) — SHIPPED v3.11.152
Таймер (boot-тик +2мин, далее каждый час; unref; гейт `getDbHealth().ready`; пачка под `withTxnLock` — критика r11 про чужие открытые транзакции): `identityRepo.purgeStaleSessions` (revoked>7д + истёкшие>7д по `COALESCE(absolute_expires_at, expires_at)`; PWA expires_at ФИКСИРОВАННЫЙ 90д, не sliding — бампается только last_used_at), `purgeStaleInitDataSeen` (>7д), `purgeOrphanDevices` (осиротевшие+невиденные>7д — критика: devices росли 1:1 с purged-сессиями), `agentChallengeRepo.pruneOld()` (+grace `processing` в полный TTL + удаление терминальных строк >7д), `handoffRepo.pruneOld()`. Лог — только счётчики (класс A). Плюс `BIND_HOST` env для app.listen (hermetic-гейты запирают write-enabled инстанс на loopback).

### 3.2 Rollback-drill гейт `smoke:miniapp-rollback` — SHIPPED, 30/30
`scripts/premium/miniapp-rollback-drill.js`: hermetic temp-DB + реальный HTTP-сервер в два запуска, child с ПОЛНОСТЬЮ явным env-словарём (dotenv/хост не долить):
- **Фаза ON**: сид (паттерн miniapp-review-smoke) + детерминированный challenge через repo → PWA bootstrap-login → минт miniapp-сессии независимым initData-оракулом → HTTP start (resume) → answer → MA-строка `review_log` (cloze:ma) → handoff-токен; бёрсты СТРОГО последними: BFF-120 c ротацией левых XFF-спуфов при константном правом (429 обязан сработать) + invalid-initData → 429 TOO_MANY_AUTH_FAILURES;
- **Sweep-лег** (сервер остановлен): backdated-фикстуры рядом со свежими → sweep-функции → точные счётчики удалений + survival-ассерты (свежая сессия/initdata/completed-challenge с вердиктом/unused-handoff живы);
- **Фаза OFF** (`MINI_APP_ENABLED=0`, та же DB): валидный initData → 503; старая кука → 503; события сохранены (прямой SQL row-count); PWA down-sync отдаёт MA-событие (superset); **handoff redeem = 200 в OFF (норма: capability переживает kill-switch, single-use цел)**; healthz 200.
Полный OPFS-leg по-прежнему за `smoke:cloud-sync` (playwright).

### 3.3 GDPR-полнота: teeth в auth-smoke — SHIPPED, 29/29
После account-delete: НЕЗАВИСИМАЯ энумерация user_id-таблиц (свой sqlite_master+PRAGMA, не `listUserScopedTables` — критика: делитель и проверка не смеют делить энумератор) + динамический zero-rows по ВСЕМ; кросс-чек живого `listUserScopedTables` == независимой энумерации (дрейф = FAIL); containment новых таблиц (`miniapp_initdata_seen`, `handoff_tokens`, `agent_challenges`, `tg_stimulus_exposure`, `channel_pairing_tokens`); **chat-id-residue**: сид NULL-user `bot_action_log` строки с telegram_chat_id связки → после delete 0 строк по этому chat_id (слепое пятно user_id-скана — критика r14/r15).

### 3.4 Лог-гигиена: `gate:log-hygiene` — SHIPPED, fail-closed
Критика убила денилист по словам (`console.log(req.body)` проходил бы) → инвертирован: КАЖДЫЙ аргумент каждого `console.*` в скоупе (agent/** + db/agent* + handoffRepo/identityRepo/channelLinkRepo + miniapp-регион server.js по СТРУКТУРНЫМ маркерам, не номерам строк) обязан быть литералом/числом/`e.message`-паттерном ЛИБО вызов допущен content-keyed allowlist'ом. Self-test (teeth-of-the-teeth): 5 канонических утечек обязаны детектироваться + 3 безопасных прототипа обязаны проходить.

## §4 Прод-операции, выполненные агентом 2026-07-11 (read-only + два обоснованных изменения)

1. **Бэкап-скрипт починен** (был 100% битый с 2026-05-28, лог — 44 ночи синтакс-ошибок) + тестовый прогон → свежий бэкап 623M ✅. Изменение обратимо, хуже полного фейла быть не могло.
2. **`docker builder prune -f`** → 7.3G освобождено, диск 84%→65%, `disk_warn` погаснет. Кэш пересоберётся при следующем деплое (он немного дольше).
3. Read-only: свежесть бэкапов, крон, состав тома (app.db 588M · audio-cache 483M · benyehuda 386M), docker df, live-пробы `/healthz` и `/api/miniapp/session`.

## §5 Гейты (все прогнаны зелёными перед push v3.11.152)
`test:api-smoke` OK · `smoke:miniapp-auth` 32/32 · `smoke:miniapp-home` 15/15 · `smoke:miniapp-review` 68/68 · `smoke:review-session` 24/24 · `smoke:auth` 29/29 · `smoke:telegram-review` 32/32 · `smoke:telegram-selector` 25/25 · `smoke:agent-review` 66/66 · `smoke:telegram-cloze` 21/21 · `smoke:telegram-dictate` 30/30 · `smoke:telegram-pairing` 33/33 · **новые:** `smoke:miniapp-rollback` 30/30 · `gate:log-hygiene` OK (self-test 8/8). SW bump НЕ нужен (precached-файлы не задеты — только сервер и scripts/).

## §6 Что остаётся до закрытия P8.6 целиком
Все **owner-шаги §2**: (1) UptimeRobot disk-keyword монитор — 5 мин; (2) firewall :8000 — ранбук готов; (3) ре-ротация `AUDIO_UPLOAD_TOKEN` — рекомендовано; (4) решение по offsite-бэкапу; (5) опционально — чистка старых docker-образов (~9.4G, сузит окно 1-click-rollback). Агентская часть §19 закрыта этим релизом.
