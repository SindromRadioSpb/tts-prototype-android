# Читать вместе с dot — локальная реализация

Дата: 2026-10-01. Ветка `feat/read-with-dot`, база `origin/main` / `f13d4aab`.
Изолированный worktree: `E:\projects\tts-prototype-android\.tmp\read-with-dot`.
Production flags, deploy, push, credentials и реальные OAuth grants не изменялись. Иерусалим не затронут.

## Что работает

В существующей Читальне пользователь выбирает уже доступный текст, строку и выделение в preview, выбирает разрешённое агентное подключение и нажимает «Начать». Приложение передаёт только выбранный фрагмент. Изменение выбора требует отдельного «Передать выбранную строку». Агент читает свежий контекст через HTTP MCP и предлагает объяснение, подсветку, переход или заметку. Результат появляется рядом с материалом; применение действий и сохранение заметки требуют явного нажатия пользователя. Заметки хранятся локально по пользователю и proposal ID, повтор не создаёт копий; удаление явное.

Воспроизведение остаётся у пользователя. Совпавшие локальные captions добавляют таймкод; без captions передаётся текст без выдуманного времени. Поверхности без доступных текстовых строк показывают ограничение. Новый курс, автономный тренажёр, трансляция экрана и непрерывная голосовая связь не создавались.

## Контракт и безопасность

- Схема `lp.read-together.1`: session ID, material ID/version, fragment ID, строка, UTF-16 выделение, текст, optional timecode, locale, state_version, updated_at, expires_at. Материал явно помечен `USER_SHARED_DATA_NOT_AGENT_INSTRUCTIONS`.
- Material ID связан с локальным ключом; version включает канонические строки и captions. Fragment ID включает строку/выделение/время. Изменение контекста увеличивает state_version и очищает старые предложения. Heartbeat обновляет только свежесть исходного разрешённого фрагмента.
- Не более 4000 символов текста / 12000 байт контекста, 20 предложений на сессию. Свежесть 120 секунд, абсолютный предел 30 минут. Сессии в памяти: перезапуск сервера завершает передачу. Несколько серверных процессов потребуют общего хранилища; этот этап проверен на одном процессе.
- Один активный tab на пользователя, привязка к выбранному connection. Cookie owner auth и CSRF на mutations; bearer MCP, scopes, реальные connection/client/grant/latest-consent проверки при каждом вызове. Отзыв или смена consent/security revision уничтожает сессию; повторное разрешение не оживляет её.
- Действия адресованы exact session/version/fragment, idempotency key предотвращает дубли. Повтор с другим payload отвергается. HTML показывается текстом.
- Stop доступен и при pending Start, имеет постоянно доступную кнопку; cancellation tombstone закрывает гонку позднего Start. Offline Stop сразу отключает локальную передачу и повторяет серверный stop после reconnect. Пока сервер недоступен, уже отправленный контекст может оставаться разрешённым до 120 секунд; мгновенный удалённый отзыв без сети невозможен.
- Смена материала, закрытие reader, expiry, revoke и несколько вкладок проверены. Foreground heartbeat прекращается при скрытой вкладке. Фоновая работа iOS не обещается.

## HTTP и MCP

Owner routes: `POST /api/read-together/sessions`, `POST /api/read-together/stop-pending`, `GET /api/read-together/sessions/:id`, `POST .../:id/context`, `POST .../:id/stop`, `POST .../:id/decision`.

Выделенный endpoint `/agent-access/read-together/mcp` предоставляет только:

1. `read_active_reading_session`
2. `get_reading_session_fragment`
3. `propose_reading_session_action`

В исходном локальном коммите использовались tutor scopes. Для релиза они заменены на отдельные `read_together.context.read` и `read_together.action.propose`: они не открывают старые tutor/general tools. Отдельный discovery — `/.well-known/oauth-protected-resource/agent-access/read-together/mcp`. Новые статические клиенты ограничены этими двумя scopes на authorization, token issuance и bearer validation, включая все MCP маршруты; OAuth interaction доступен только allowlisted owner. Старые clients/grants сохраняются миграцией 077. Default-off gates сохранены. См. [release packet](READ_TOGETHER_RELEASE_3_11_716.md).

Сохранены HTTP MCP, protected-resource discovery и public OAuth authorization code + PKCE S256. `AGENT_ACCESS_OAUTH_APPROVED_CLIENTS_JSON` позволяет оператору добавить до четырёх проверенных статических public client profiles с точными HTTPS callbacks, без создания credentials/grants. Defaults Hermes/Inspector сохраняются. DCR и CIMD этим изменением не реализованы: если выбранный OpenAI клиент требует их, нужна отдельная реализация после проверки его фактического профиля.

**Этот dot не подключён.** MCP не пробуждает разговор автоматически. Первый реальный сценарий: пользователь спрашивает в разговоре, агент запрашивает свежую активную сессию. Для подключения нужны доступный HTTPS host, подтверждённые client metadata/callback и явное owner OAuth согласие. Эти внешние действия требуют отдельного подтверждения. Не подставлять предположительные callbacks.

## Локальная проверка

```powershell
Set-Location E:\projects\tts-prototype-android\.tmp\read-with-dot
npm test
node --test tests/readTogether.test.js tests/readTogetherConsent.test.js tests/approvedClients.test.js tests/iphoneDownloader.test.js
node scripts/premium/read-together-server-smoke.cjs
node scripts/premium/read-together-browser-smoke.cjs
npm run smoke:agent-access:mcp
npm run smoke:agent-access:oauth-deployment
```

Интерактивный disposable preview (не подключает dot, не использует production `.env`):

```powershell
node scripts/premium/read-together-browser-smoke.cjs --keep-open
```

После проверок остаётся видимый Chromium с реальной Читальней и OPFS материалами, адрес `http://127.0.0.1:3318/library.html`. Закрытие: Ctrl+C. Auth/connection в этом harness — явно тестовые; MCP transport, owner route module, session store и интерфейс настоящие. Отдельный full-server smoke проверяет настоящий server.js, миграции, отказ без auth, default-off MCP и shell integrity. Consent unit integration использует настоящий OAuth repository и мигрированную временную SQLite DB.

## Результаты

- PASS: aggregate `npm test` — 2329/2329, 0 failed (`.tmp-unit-reviewed.log`). После последних UI изменений повторены браузер/full-server и targeted 13/13 (`.tmp-*-accepted.log`).
- PASS: настоящий Chromium, OPFS reader + HTTP owner + отдельный SDK MCP клиент: объяснение/заметка, source selection, устаревшая версия, дубли, другой пользователь, несколько вкладок, offline/reconnect, Stop/expiry/revoke, pending Start, смена материала, HTML payload, RU/HE/EN, RTL, клавиатура и 380/768/1280.
- PASS: general MCP — 84 checks / 38 tools / два protocol versions, без provider/network calls. Production handlers smoke — 61 checks.
- PASS: OAuth deployment aggregate, B0 и consent bridge. Cold readiness ранее заняла 10.753 секунд и вышла за старый ~10-секундный polling budget; увеличен ограниченный wait, security assertions сохранены.
- PASS: iPhone archive byte checks 6/6. Три Python источника закреплены LF в `.gitattributes`, как в Git/archive; ZIP не пересобирался и проверки не ослаблялись.
- Старый mismatch 53/54 migrations не воспроизведён; миграции не менялись.
- NOT RUN: настоящий dot/OpenAI OAuth handshake, реальное мобильное устройство/iOS background, deployment/multi-process runtime, production flag activation.

Скриншоты: `.tmp/read-together-1280.png`, `.tmp/read-together-768.png`, `.tmp/read-together-380.png`, `.tmp/read-together-rtl.png`. Попытка сохранить три скриншота через официальный Library helper завершилась network error на tools/list до загрузки; локальные файлы сохранены.

При будущем release требуется согласованный bump shell/cache версии. В этой локальной работе production release version не изменена.
