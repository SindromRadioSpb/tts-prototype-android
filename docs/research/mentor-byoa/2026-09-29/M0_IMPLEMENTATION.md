# M0 — личный Hermes через подписку, 2026-09-29

Базовый commit: `5e4a924a`. Реализация: `555ecafd`. Ветка: `feat/mentor-byoa-m0`.
Это evidence локального owner runtime; LinguistPro production не развёртывался.

## Результат

- Agent `0.18.2` → `0.21.5 (2026.9.24)`, upstream `f97608f1`.
- WebUI `0.52.41` → `0.52.113` с сохранёнными C1 audio bridge и C2 «◉ Разговор».
- Рабочий адрес прежний: `http://127.0.0.1:8787/`; Tailscale/пароль/порты не расширялись.
- Владелец завершил официальный ChatGPT device OAuth и отдельно вошёл в WebUI.
- Runtime подтвердил `openai-codex` → `https://chatgpt.com/backend-api/codex`.
- Получен каталог моделей с авторизацией аккаунта; основной route — `gpt-6-sol`.
  Настроенные auxiliary slots также направлены в `openai-codex`; model fallback отсутствует.
  `OPENAI_API_KEY` и `OPENROUTER_API_KEY` в окружении gateway отсутствуют.
- LP OAuth восстановлен одним bounded PKCE flow с прежними 27 scopes.
  Отдельный grant на тела всех личных текстов не выдавался.
- Gateway-side `hermes mcp test linguistpro`: connected, **31 tool**.
  Токен: UID/GID `1000:1000`, mode `0600`; значения не публиковались.
- В обычной новой WebUI-беседе `a2b83bd905d5` модель реально вызвала
  `mcp__linguistpro__get_reading_content` (`work_id=85`, `start=0`, `rows=1`),
  получила материал и дала короткий русский ответ. Это technical owner-runtime
  pass, не owner-reported оценка качества преподавания.

## Сохранность и совместимость

До миграции оба writer остановлены на время согласованного snapshot. Архивы:
home 1,177,893,885 bytes, source 322,397,596 bytes; hashes сохранены рядом в
приватной папке `G:/HERMES_AGENT/private/mentor-m0-20260929/`.
Архив home восстановлен в отдельный named volume, `state.db quick_check=ok`.
Перед переключением старые writers остановлены, свежие файлы скопированы в
новый home с сохранением нового Codex auth. Старые образы/volumes не удалены.
Порядок отката: [ops runbook](../../../../ops/hermes/README.md).

Исправлены три реальные несовместимости:

1. В upstream отсутствовала прежняя передача audio attachment paths. На чистом
   upstream профильные тесты падали; overlay: **4/4 PASS**. Исходник защищён SHA256.
2. Новый Hermes запрещает wheel install, а WebUI выполнял его при boot.
   Установлен editable package из сохраняемой staging-копии. Clean boot,
   импорт `AIAgent`, restart и последующий health прошли на fixture home.
3. WebUI Python был связан с SQLite `3.46.1`; Hermes выдал предупреждение WAL
   reset bug. В overlay включена SQLite `3.53.4` из того же pinned Agent image
   (обе базы Debian 13). Build assert проверяет реально связанную версию.
   При остановленных writers проверены копии всех 7 runtime databases вместе
   с WAL/SHM: **quick_check=ok**. Первая попытка проверки непосредственно через
   read-only mount не открыла WAL database; проверка копий устранила это
   ограничение, исходные файлы не менялись диагностикой.

Во время смены версии в уже открытой вкладке обнаружились старые JS `0.52.41`.
Обычный reload загрузил `0.52.113`, после чего реальная беседа завершилась.
Owner browser storage не очищался. Неудачный повтор убран из очереди;
сохранён один проверочный пользовательский запрос.

## Границы подтверждения

- Голосовая сессия/микрофон не запускались; C2 сохранён и окно проверено.
  Gemini Live остаётся самостоятельным провайдером, не частью ChatGPT allowance.
- В проверке использован только read-only corpus tool и локальные служебные
  чтения агента. Канонические learning writers не вызывались; отдельный
  before/after audit production `review_log` здесь не выполнялся.
- Старые беседы сохраняют свой model binding: продолжение старой беседы может
  показать прежнюю модель. Новый default не переписывает историю.
- Кнопки внутри LinguistPro ещё не вызывают этот runtime. Их новый transport,
  единая панель и учебный цикл — следующие M1/M2, а не результат M0.
- После финального обновления SQLite подтверждены health, импорт Agent,
  linked SQLite 3.53.4 и сохранённый ответ в браузере. `Show more` не раскрыл
  полный tool payload; записан O-044. Из DOM-атрибута кнопки подтверждены
  `ok:true`, `aa.reading_content.1.0.0`, work 85 и row_count 1. Raw-result UI
  не принят; одновременно видимый timeout toast не доказан как причина.

## Начало M1

Добавлен `agent/tutor/context.js`: immutable exact-source snapshot, material и
revision, Unicode spans, caption identity/clock, 24 KiB bound, TTL 15 минут,
server principal/connection/session/consent binding. Пять тестов проверяют
изоляцию, отзыв согласия, expiry, подмену редакции и неподдерживаемые поля.
Это пока server-side foundation без HTTP/MCP/UI wiring или relay; ограничения
прямо описаны в `agent/tutor/README.md`. Не выдаёт mastery или grade.

Миграция route отдельно проверена на fixture: **1/1 PASS**; сохраняет MCP,
голосовую конфигурацию и auth-файл, удаляет model fallback.
