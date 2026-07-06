# CLG-P7 Telegram Bot — readiness-анализ (2026-07-06)

> Вопрос владельца: CLG-P6 — зрелый или требует доработки/расширения? Чего
> недостаточно для старта CLG-P7 Telegram Bot?
> Источники: AI_MENTOR_RECON_2026_07_04.md (§6–§9, G-5), PROJECT_ROLES.md (R17,
> гейты 1–8), живой код (agent/*, db/*, migrations/, fsrs-core.js,
> fsrs-reference-replay.js). Каждый пункт «нет» проверен grep-ом по коду,
> не по памяти (feedback_verify_stale_plan_vs_live_code).

## Вердикт коротко

**CLG-P6 зрел для своего скоупа** — все 5 слайсов + P9 live-verified; /plan и
/explain готовы стать бот-командами БЕЗ серверных изменений (контракт семантический).
**Но P7 «/review в боте» блокируют 4 содержательных пробела** — все они были
НАМЕРЕННО стадированы из P6 (§9-план 4.8: record_review_answer = skeleton до гейтов).
Это не «доделать P6», а отдельная пред-P7 программа: грейдер-стек.

## Что уже готово (проверено)

**Гейт G-5 — ПРОЙДЕН целиком** (Telegram писать МОЖНО по букве канона):
1. принять review event — ✅ P2 ingest (24/24);
2. пересчитать FSRS — ✅ P4 projections в том же ingest-запросе;
3. отдать due list — ✅ P5 /api/learner/due (паритет с Залом, 14/14);
4. replay-оракул — ✅ P4 независимый оракул (ts-fsrs реф-реплей + golden, 41/41);
5. синк с OPFS без потери — ✅ P3 (32/32, hole-heal, owner dry-run 5402·5402).

**R17-гейты 1–8 — статус:**
| # | Гейт | Статус |
|---|---|---|
| 1 | Agent-message (5 категорий) | ✅ категория на каждой секции/объяснении, гейт-ассерты |
| 2 | No-free-chat | ✅ by construction (команды, не болталка) — P7 обязан сохранить |
| 3 | Grader provenance | 🟡 схема META_ALLOW (raw_grade/grade_policy/grader) есть, пишет её только КЛИЕНТ (Room checkTrainAnswer); серверного грейдера нет |
| 4 | Deterministic-first | ❌ серверного детерминированного грейдера НЕТ (см. пробел 2) |
| 5 | D1 channel-aware | 🟡 grade-policy.js pure UMD (общий клиент+сервер) + channel_stats в проекциях готовы; серверное ПРИМЕНЕНИЕ не свито |
| 6 | MNAR | ✅ на /plan и /explain (гейт-ассерты); для /review — реализовать в грейдер-слайсе |
| 7 | Gold-grade | ❌ gold-набора НЕТ (см. пробел 3) |
| 8 | Context-first | ✅ get_sentence_context_if_available включён; якоря text_key+order_index в meta |

**Инфраструктура, готовая к переиспользованию:** cost ledger (pre-call reserve,
scenario-поле) · LLM-провайдеры gemini|openrouter|mock + kill-switch · keyingService
(резолв поверхность→item_key, серверный) · agentSentenceRepo (consent-gated
предложение по якорю) · down-sync-механика P3 (agent:*-строки доедут в OPFS
автоматически — гейт обязан это ассертить) · mentor-home P9 = готовая веб-площадка
для pairing-блока и журнала действий (§8 «вкладка AI-наставник»).

## Чего НЕ хватает (пробелы, в порядке фундаментальности)

### 1. Annul-путь НЕ функционален (R17-B «обратимость» — жёсткий блокер)
`fsrs-core.js:227` и `fsrs-reference-replay.js:106`: `kind='annul'` — **neutral**
(«until the CLG-P4 reducer semantics land» — комментарий устарел: P4 отгружен,
семантика НЕ приземлилась). Схема annul_of в ingest есть, клиент строки принимает,
но аннулирование НИЧЕГО не отменяет. Пока это так, ошибочный grade агента
неисправим без ручной правки лога — красный флаг R17-B прямым текстом.
**Объём:** reducer-семантика (annulled id исключается из fold) в fsrs-core + реф-реплей
+ golden-вектора (+ сценарии: annul seed? annul из середины истории) + oracle +
клиентский recompute на down-sync. Замечание R11: изменение replay — do-no-harm,
существующие логи без annul обязаны фолдиться байт-идентично (annul-neutral логам).

### 2. Детерминированный грейдер-сервис — НЕ существует (R17-B гейты 3/4/5)
Room-грейдер живёт в клиенте (checkTrainAnswer); для Telegram нужен СЕРВЕРНЫЙ:
нормализация ответа (skeleton без никуда · ktiv male/haser-эквивалентность через
резолвер/keyingService · near-miss классификация) → сравнение с ожидаемым →
D1-грейд через ОБЩИЙ grade-policy.js (уже requirable в Node) → meta с grader-
провенансом (`grader: deterministic`, raw_grade, grade_policy). LLM в грейде не
участвует вовсе (MVP: только deterministic; llm-assisted feedback — advisory без grade).

### 3. Gold-набор ответов — НЕ существует (R17-гейт 7, прямое условие строки P7)
«gold-набор ответов (ktiv-пары, огласовки, near-miss) ≥ порога ДО права записи
grade». Нужен fixture-набор (реальные пары из pealim-infl-v12 + ktiv-варианты +
типовые опечатки/near-miss) + харнесс `smoke:grader-gold` с порогом. Источники под
рукой: датасет парадигм (9279), hebrewNorm, наработки R1.0 gold eval (резолверный —
методика переносится). Это measure-before-code (R10) для пробела 2.

### 4. record_review_answer — disabled skeleton (activation = пробелы 1–3 + гейты)
`agent/tools.js:96` — TOOL_DISABLED до «deterministic-first · D1 · провенанс ·
gold · annul · MNAR · down-sync». Активация: запись СТРОГО через штатный
ingest-путь (source='agent:telegram', конверт §6, id content-детерминированный)
→ проекции пересчитаются тем же запросом; гейт полного цикла: строка доезжает в
ЛОКАЛЬНЫЙ OPFS-лог (down-sync) и видна Залу. Активацию можно сделать и проверить
ДО Telegram (web-smoke) — Telegram лишь второй вызыватель.

### 5. Telegram-канальная инфраструктура — не начата (это и ЕСТЬ P7)
- **channel_links** (telegram_user_id+chat_id ↔ user_id) — миграции нет (только
  упоминание в §6); user_id-таблица → export/delete sweep покроет автоматически.
- **Pairing** (§8 hardening): код ≥128 бит, одноразовый, TTL, привязан к
  веб-сессии, двусторонний confirm; лимиты на /pair С МОМЕНТА P7. Веб-сторона —
  блок в доме наставника (P9 — площадка готова).
- **Webhook**: X-Telegram-Bot-Api-Secret-Token (bearer, не подпись!) в env,
  ротация независимо от bot-токена, дедуп по update_id, авторизация ТОЛЬКО по
  channel_links (никогда из тела).
- **Ops (владелец):** бот @LinguistProMentorBot, токен в Coolify secrets,
  webhook-URL на прод-домен.
- **agent_threads/agent_messages** — отложены «до чат-поверхности P7» (мигр. 026);
  для команд-MVP возможно достаточно журнала действий идентификаторами — развилка.

### 6. Кросс-канальный бюджет уведомлений — отложен (блокер только для ПРОАКТИВНОГО бота)
notification_preferences (§8: mode + суточный cap суммарно push+бот+digest + tz +
quiet hours) не существует (024: «до появления notification_preferences-механики
P7»). Команда-ответ (бот отвечает на /plan) — НЕ уведомление; бюджет блокирует
только bot-initiated сообщения. MVP «бот только отвечает» может стартовать без
него — но тогда это явная граница слайса.

### Непробелы (проверено, готово): LLM-бюджет/ledger — общий; фолбэки LLM-less —
работают; приватность /explain — контракт есть; здесь новая плоскость ТОЛЬКО одна…

## ⚠ Новая privacy-плоскость (решение владельца ДО кода — как для /explain)
Бот доставляет контент (предложения пользователя в /explain, леммы в /plan) через
**серверы Telegram** — это третья сторона ПОМИМО LLM-провайдера. Существующее
согласие agent_read_texts покрывает «отправить внешнему AI-провайдеру», НЕ
«доставить через мессенджер». Нужна consent-копия в pairing-флоу (situated, по
образцу AGENT_EXPLAIN_PRIVACY_DECISION) + PRIVACY.md-аддендум. Класс A
(telegram_user_id/chat_id в channel_links) уже размечен в §5.

## Рекомендованное стадирование (пред-P7 → P7)

- **P7.0a — annul-семантика** (пробел 1): reducer + оба реплея + golden + oracle +
  down-sync recompute. Самый фундаментальный, трогает канон памяти → идёт первым
  и отдельно (R11-режим, adversarial-critique перед кодом — feedback_adversarial_role_critique).
- **P7.0b — грейдер-сервис + gold-набор** (пробелы 2–3): db/graderService (или
  agent/grader) + fixtures + smoke:grader-gold с порогом. Без записи в лог — чистый
  замер (R10).
- **P7.0c — активация record_review_answer** (пробел 4): tool enabled за гейтами,
  web-smoke полного цикла ingest→projection→down-sync→OPFS. Telegram ещё не нужен.
- **P7.1 — pairing + channel_links + webhook + read-only команды** (/start /plan
  /explain по якорю): без записи grade — быстрая ценность, R17-гейты 1/2/8.
- **P7.2 — /review в боте**: последним, на готовом грейдер-стеке; гейт строки P7
  (полный цикл до Зала).

## Развилки владельца (до старта)

1. **Топология webhook:** роут в main-сервере (рекомендую для MVP: single-writer
   тривиально цел, RAM не давит, §13.4-шов сохранён) vs отдельный agent-сервис
   (§13.4-буква; переезд предусмотрен швом tools.js, можно позже по RAM/нагрузке).
2. **Privacy Telegram-доставки:** consent-копия при pairing (см. выше) — утвердить
   формулировку ДО кода.
3. **Журнал действий бота:** идентификаторами в agent_tasks (дёшево, MVP) vs
   полноценные agent_threads/messages (нужны для P8/чата позже) — что в P7?
4. **Проактивность MVP:** бот только отвечает (без notification_preferences) или
   сразу с нуджами (тогда +таблица бюджета)?
