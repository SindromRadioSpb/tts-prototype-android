# Наставник BYOA: исполнимый план и критерии поставки

Дата: 2026-09-29. Исходный commit `390486d3`. Статус: **OWNER APPROVED; M0 TECHNICAL PASS; M1 PRODUCTION FLAG-OFF VERIFIED; M2 SOURCE-RECALL TECHNICAL PASS / PRODUCTION FLAG-OFF VERIFIED**.
Владелец утвердил план и начало исполнения 2026-09-29. Ветки исполнения: M0 `feat/mentor-byoa-m0`, M1 `feat/mentor-byoa-m1`, M2 `feat/mentor-byoa-m2`.
Продукт: [решение и контракты](MENTOR_BYOA_PRODUCT_PLAN_2026_09_29.md). Основания: [аудит](../research/mentor-byoa/2026-09-29/AUDIT.md).
Финансирование: личный агент/подписка пользователя; для владельца без OpenAI API key и платного API fallback.

## 1. Леджер этой сессии

### M4 continuation · 2026-09-29

Ветка `feat/mentor-byoa-m4`, база production `e877e8ea`. Реализованы помощь после
ответа в Повторении, вход из карточки Медиатеки, точное окно сохранённых субтитров
и явно принимаемый локальный архив объяснений с продолжением/экспортом/удалением.
[Контракты, проверки и незакрытые части](../research/mentor-byoa/2026-09-29/M4_IMPLEMENTATION.md).
44 Node checks, 23 training guards, 233 i18n checks PASS. Изолированный browser
проверил четыре поверхности и отсутствие дополнительных review writes; архив
проверен на разделение аккаунтов, перезагрузку, дедупликацию, лимит, экспорт/удаление.
Релиз 3.11.695 опубликован: repeated health, served-byte integrity и guest browser PASS; owner pilot остаётся ограниченным.
Обнаруженный владельцем цикл loading главной Зала воспроизведён и исправлен отдельным 3.11.696: [evidence](../research/mentor-byoa/2026-09-29/ROOM_HUB_REFRESH_FIX.md). Production 696 pending.
M4 целиком не закрыт: lesson/proposal lifecycle, общий data lifecycle, MCP и живая
проверка видео остаются следующими шагами; редакционная зависимость M2/M5 сохраняется.

### M3 continuation · 2026-09-29

Владелец выбрал Windows → macOS/Linux; сначала установленный Hermes, затем
установка с нуля. Сертификата пока нет: неподписанный установщик разрешён для
ограниченного пилота. Редактора нет: [пакет проверки](../research/mentor-byoa/2026-09-29/HEBREW_REVIEW_PACKET.md)
подготовлен, semantic grades не включаются.

M3 existing-Hermes slice: [локальные проверки и ограничения](../research/mentor-byoa/2026-09-29/M3_IMPLEMENTATION.md).
Ветка `feat/mentor-byoa-m3`, релиз 3.11.694 verified (`e877e8ea`), owner-only grant на 7 дней;
внешний пилот и массовый доступ остаются закрыты до соответствующих gates.
Владелец подтвердил «Наставник подключён»; реальный ответ Hermes получен в Зале.
На 3.11.694 повторно открыт сохранённый ответ: у двухсловного заголовка недоступная
практика больше не предлагается, повторный модельный запрос не потребовался.
Следующий этап M4: общий контекст для Медиатеки/Повторения и явное сохранение занятия;
перед записью сверить существующие lesson-artifact и канонические writers, не
использовать cloud sync consent как согласие на память наставника.

| Работа | Статус | Доказательство |
| --- | --- | --- |
| Текущий код и существующий канон | COMPLETE | Аудит E01–E11; чистое дерево до записи; origin/main 0/0 |
| Личный Hermes inventory | COMPLETE | Аудит E12–E19: старый Agent, custom WebUI, OpenRouter route |
| Текущая работоспособность MCP | TECHNICAL_PASS | После bounded OAuth recovery gateway обнаружил 31 tool; новая WebUI-сессия прочитала материал |
| Модель доступа массового продукта | OWNER_DECIDED | BYOA; расходы LinguistPro минимальны |
| Архитектура/учебные сценарии/backlog | OWNER_APPROVED | Владелец утвердил начало реализации |
| Проверка документации | PASS | Локальные ссылки, fences/UTF-8, secret-pattern scan, diff; согласованность BYOA проверена |
| Commit/push документации | SCOPED_BRANCH | `docs/mature-mentor-byoa-20260929`; факт доставки определяется remote commit, без merge/deploy |
| Upgrade/reconnect Hermes | TECHNICAL_PASS | Agent 0.21.5, WebUI 0.52.113, Codex OAuth gpt-6-sol, C1/C2 сохранены; [M0 evidence](../research/mentor-byoa/2026-09-29/M0_IMPLEMENTATION.md) |
| Контекст и транспорт M1 | TECHNICAL_PASS | 33 Node + 3 Python PASS; restart/isolation/cancel/revoke; [M1 evidence](../research/mentor-byoa/2026-09-29/M1_IMPLEMENTATION.md) |
| Общая панель и личный connector | M1_TECHNICAL_PASS | Реальные Studio/Room в isolated browser; actual Hermes/Codex synthetic-source roundtrip; flag off, без production deploy |
| Первый учебный цикл M2 | SOURCE_RECALL_TECHNICAL_PASS | [M2 evidence](../research/mentor-byoa/2026-09-29/M2_IMPLEMENTATION.md): эталон из источника, помощь/попытка/итог; canonical review не пишется |
| Полный M2 / новый MCP | IN_PROGRESS | Независимая языковая редактура и semantic grading ещё не приняты; MCP расширяется после соответствующих contracts |
| Постепенный production rollout | OWNER_AUTHORIZED | M1 3.11.691 и M2 slice 3.11.692 verified flag-off; [release evidence](../research/mentor-byoa/2026-09-29/PRODUCTION_ROLLOUT.md) |

## 2. Порядок поставок

Оценки длительности до spike не фиксируются: compatibility, публичная модель авторизации и Hebrew QA ещё требуют замеров. Порядок задают зависимости и проверяемые результаты. За каждую поставку отвечает один согласованный owner implementation; архитектурные роли ниже не означают требование запуска нескольких агентов.

| Этап | Конкретный результат | Зависит от | Критерий выхода |
| --- | --- | --- | --- |
| M0 · Личный working reference | Обновлённый/проверенный Hermes, Codex OAuth, восстановленный LP MCP, сохранённый C2 | Browser-вход владельца, совместимая пара образов | Новая обычная сессия реально читает разрешённый учебный материал; маршрут/отсутствие paid fallback подтверждены |
| M1 · Контекст и transport spike | Из Студии/Зала один и тот же ContextEnvelope идёт в личный runtime и возвращается в UI | M0 или изолированный contract fixture | Exact revision/anchor, stale context, cancel/reconnect, offline runtime, две тестовые учётки; модель не пишет state |
| M2 · Полный первый учебный цикл | Вопрос → объяснение → самостоятельная проверяемая попытка → итог/возврат | M1 + редакторский gold | Работает по реальному тексту на desktop/mobile; происхождение и помощь видны; старый review writer единственный |
| M3 · Мастер подключения и управление | Самостоятельная установка/подключение, повторный вход, отзыв, diagnostics, настройки | M1; M2 для полезного демо | Новые пользователи проходят без терминала/ручного URL/key; Telegram не prerequisite; отказ и quota recoverable |
| M4 · Четыре поверхности + артефакты | Медиатека/Повторение используют тот же tutor; сохранение/продолжение занятия | M2 + источник/редакция + receipt contracts | Ошибка→помощь→та же очередь; видео→точное окно; никакой скрытой платной обработки или дублированных карточек |
| M5 · Грамматика и следующая сессия | Первая редакционно проверенная карта конструкций, планы из evidence, мягкая инициатива | M2/M4 + approved evidence consumption | Разные навыки/помощь различаются; неизвестное остаётся неизвестным; каждое предложение объяснимо и отклоняемо |
| M6 · Письмо и голос | Собственные реплики, ASR confirmation, дозированные исправления, продолжение темы | M2/M4 + отдельные voice capabilities | ASR errors не оценивают как ошибки ученика; реальные устройства; отдельный provenance голосового пути |
| M7 · Массовая готовность | Ограниченный внешний pilot → staged availability | M3/M4 + изоляция/операции/качество | Совместимость/нагрузка/поддержка/отзыв/удаление; образовательные заявления только по отдельным данным |

M5/M6 расширяют педагогическую глубину; их отсутствие не оправдывает черновой интерфейс M2. Первый slice должен быть небольшим по охвату и законченным по качеству. Существующие endpoints/функции не выключаются раньше приёмки замены; feature flags допускают возврат.

## 3. Ближайшие engineering tickets

| ID | Изменение / предполагаемая область | Проверяемый результат |
| --- | --- | --- |
| T01 | `agent/` transport adapter + capability registry; новый контракт tutor session | Runtime implementation меняется без изменения UI и learner schema; идентификация пользователя не берётся из LLM |
| T02 | Context builder в `studio-agent.js`, `library-ui.js`, затем media/review adapters | Один формат, реальная source revision; sent context закреплён за сессией, navigation его не подменяет |
| T03 | Исходящий connector channel + bounded relay worker | Pairing с nonce/TTL, session binding, reconnect cursors, cancel, no arbitrary URL fetch/SSRF |
| T04 | Structured response validator | Только разрешённые display blocks/действия; sanitization; malformed output не становится упражнением/оценкой |
| T05 | Общая tutor panel в `public/js/`, host adapters вместо копий UI | Desktop рядом с источником, mobile с возвратом; текущие стили/шрифты/RTL проекта; без изменения стека |
| T06 | `mentor-connection-core.js` / `mentor-home.js`: capability-based onboarding | AI не заблокирован Telegram; optional sync; все account/consent writers существующие |
| T07 | `agent/access/{capabilities,mcpSchemas,contracts,productionHandlers,...}` | Аддитивные versioned tools, минимальные scopes, контрактные ошибки, revoke на read/write/result |
| T08 | Grammar registry + reviewed item bank + rubric | Первый редакторский набор; никакого LLM mastery; альтернативные корректные ответы и «не оценивается» |
| T09 | Session/evidence/artifact repositories и миграции при необходимости | Tenant keys, source links, versioning, correction/erase/restore; F1/F2 переиспользуются по authority |
| T10 | UI error mapping и original 402 reproduction | `connection_required`, `reauth_required`, `quota_exhausted`, `agent_offline`, `context_unavailable`, `invalid_output` вместо сырого числа |
| T11 | Feature flags и старые entry points | Notes/quiz доступны; successful migration существующих ссылок/историй, staged rollback |
| T12 | Независимый evaluation harness | Prompt/model/policy/source/grader версии, gold split, рубрика, стоимость/задержка и delayed outcome раздельно |

Файлы — точки интеграции, не обещание механически переписать огромный `server.js`. Сначала проверить фактическую ветку и свежий origin/main; changeset держать ограниченным. Для API — relevant smokes; для release — действующий shell/SW/integrity/version контракт проекта.

## 4. Контракт первого вертикального slice

Пример: пользователь выделяет `הייתי` в `כשהייתי ילד גרתי בחיפה` и спрашивает, почему не `היה`.

1. Panel показывает источник; ContextEnvelope содержит строку, соседнее окно, редакцию, locale и доступные языковые факты.
2. Online connector выбирает только заранее настроенный личный route. Если его нет — actionable connect; если лимит исчерпан — сохранение draft и время/состояние возобновления при наличии данных провайдера.
3. Ответ объясняет 1-е/3-е лицо, не объявляя систематический пробел ученика без evidence.
4. «Проверить себя» предлагает независимо проверенное задание на целевое различие. LLM не создаёт одновременно непроверенный ключ и final grade.
5. Сохранение попытки учитывает показ перевода/подсказки/ответа. Открытое задание с недоказанной оценкой — advisory evidence.
6. Закрытие возвращает точно в исходную строку; следующий день/повторная сессия могут проверить перенос на иной контекст, если пользователь разрешил память.

Варианты теста: гость с локальным источником; пользователь без sync; неверная/отозванная связь; старая редакция; удалённый материал; поддельный user_id; prompt injection в тексте; обрыв сети после получения ответа; повторная доставка; пустой/невалидный ответ; смена профиля в другой вкладке; отказ в consent. Fixture и платный/live прогоны разделены.

## 5. Обновление личного Hermes и восстановление доступа

Текущий снимок: Agent 0.18.2 / `bd37ff91`; WebUI `linguistpro/hermes-webui-c2:20260725-1`; общий home volume и отдельный source volume. Upstream на дату исследования: Agent 0.21.5 / `v2026.9.24`. Нужна совместимая WebUI-версия и перенос кастомизации. Registry/image downloads не выполнялись; digest новой пары ещё не зафиксирован.

### Подготовка

- Инвентаризировать compose, image IDs/digests, named volumes, mounts, installed teaching skills, C2 extension и voice sidecar, active sessions. Не выводить env/token values.
- Сделать проверяемый backup home/state/config/skills и custom source patches; архив хранить приватно, не в git. Проверить чтение/восстановление в отдельный том; старые images сохранить.
- Получить pinned Agent/WebUI artifacts и сравнить breaking changes, Python deps, auth format, API/MCP, source-volume initialization. Staging запускается на новых портах/томах с fixture-auth; не давать двум процессам одновременно обновлять скопированный реальный refresh token.
- Сравнить C2 с upstream по матрице: реальный диалог против диктовки, interruption, Hebrew/Russian, мобильный микрофон/HTTPS, captions, consent, provider/billing, ephemeral retention. При неполной эквивалентности сохранить расширение отдельным адаптером.

### Переход

1. После локальных проверок остановить запись в старый runtime, сделать финальный snapshot. Сначала новая копия home и новый source volume; не удалять рабочий volume ради инструкции обновления.
2. В обновлённом runtime пройти официальный Hermes `hermes model` → ChatGPT/Codex Subscription либо документированный `hermes auth add openai-codex`. Не копировать текущую Codex-сессию этого рабочего агента. Пароль/2FA/consent выполняет владелец на странице провайдера.
3. Выбрать доступную модель из authenticated catalog, ограничить профиль учебными tools, запретить API fallback и неразрешённые auxiliary providers. Проверить расход отдельно для ASR/TTS/search. Не записывать заведомо выдуманное имя модели из старого примера.
4. Восстановить LP OAuth. Для старой топологии известен reconnect flood: переиспользовать bounded PKCE helper из `G:/HERMES_AGENT/HERMEX_SETUP.md`, предварительно проверив совместимость с новой auth-схемой. Один flow, state/PKCE validation, honor Retry-After. Никакого циклического `mcp test` до consent.
5. Проверить uid/gid/mode токена для реального gateway. Текущие 1000:1000/0600 уже правильные; изменения прав без причины не нужны.
6. Проверить gateway MCP, scopes и фактический `tools/list`; затем совершенно новая обычная WebUI-сессия с целевым read-only tool. SDK/CLI PASS и owner-chat PASS фиксируются отдельно.
7. Проверить PC и реальный iPhone/tailnet: вход, обычный chat, MCP material read, «◉ Разговор», stop/cancel, старые материалы/история. Восстановить прежнюю пару образов/volumes при regression. С учётом refresh-token rotation rollback авторизации может потребовать нового входа; старый архив токена не гарантирует его пригодность.

### Acceptance M0

`MODEL_ROUTE=openai-codex`; `OPENAI_API_KEY_NOT_USED`; `PAID_FALLBACK=DISABLED`; подтверждён доступной диагностикой provider usage; `MCP_READ=PASS`; обычная новая сессия вызывает реальный инструмент; `C2_PRESERVED_OR_EQUIVALENCE_PROVEN`; backups/rollback проверены; owner acceptance отдельно от инженерной.

Это не обещание бесплатного безлимитного доступа и не новая backend-схема массового сервиса. Provider entitlement и правила конкретного runtime необходимо подтвердить на фактическом аккаунте.

## 6. Гейты массового запуска

| Gate | Условие |
| --- | --- |
| G1 · Account/entitlement | Документирован путь для выбранного runtime, отсутствует скрытый paid fallback, revoke/reauth проверены |
| G2 · Isolation | Два независимых пользователя, два коннектора и конкурентные сессии; ни одного межпользовательского чтения/receipt/cache hit |
| G3 · Canonical writes | Повторная доставка/обрыв/annul не дублируют review; advisory feedback не становится grade/mastery |
| G4 · Source grounding | Exact source/revision, private grants, local-only/remote boundary, stale invalidation, injection cases |
| G5 · Language | Независимый Hebrew gold; ни одной известной критической ошибки в gate-наборе; отдельно измерены false-confidence/abstention. Процентную цель задать до benchmark после определения выборки |
| G6 · UX | Новичок получает результат без терминала; наблюдаемые onboarding sessions; RU/EN/HE, desktop/mobile/keyboard/AT и recovery |
| G7 · Operations | Backup/restore/delete/revoke, connector version support, outage/timeout, quotas, нагрузка и стоимость relay/support |
| G8 · Learning | Заранее определённая unassisted delayed transfer метрика и контроль; достаточно данных для конкретного публичного заявления |

G1–G7 нужны для внешнего ограниченного пилота в соответствующем объёме. G8 нужен для заявлений об образовательном преимуществе; его ожидание не блокирует сбор добровольного пилотного evidence после остальных gates. Пилот не превращает owner-only scopes в общедоступные одним переключателем.

Нагрузочные ступени для стенда: 10 → 100 → 1000 одновременно подключённых fixture-коннекторов и отдельно активных stream-сессий; фактические границы выбирать по измеренным CPU/RAM/очередям/трафику. Это план испытаний, не заявленная ёмкость. Реальные подписки для load tests не использовать.

## 7. Решения до зависимых этапов

| Решение | Предлагаемое умолчание | Когда нужно |
| --- | --- | --- |
| Финансирование | **Решено владельцем: BYOA** | Учитывается сейчас |
| Первый поддержанный runtime | Hermes personal; независимый adapter interface | До M1; сравнить latency/capabilities на M0 |
| Поддержка новичка с одним телефоном | Личный hosted runtime, если есть совместимый доступ; иначе честно указать необходимость online-компьютера | До обещаний на экране подключения |
| Распространение коннектора | Подписанный installer, ограниченные auto-updates, pinned compatibility matrix | До публичной M3; publisher/signing — отдельная операционная задача |
| Учебная редактура | Независимый специалист по современному ивриту и преподаванию; blind sample review | До G5; бюджет не задан, платные услуги не заказывать |
| Голос | Сначала async с явной конфигурацией; C2 сохранить | До M6; ни одного нового платного voice provider без выбора пользователя |
| Исследовательский pilot | Небольшая UX-группа, затем рассчитанный эксперимент | До G8; не выдавать малый smoke за статистическое доказательство |

Эти решения не мешают реализовать/проверить локальные contracts, transport fixtures и общий интерфейс. Дополнительного разрешения на каждую обратимую операцию не требуется; реальные OAuth-входы нельзя заменить предположением о согласии или ожиданием таймера.
