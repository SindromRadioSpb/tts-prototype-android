# H2_03 — Слайс H2.3: W1-семейство (propose_import_text · propose_track_word · propose_goal · get_current_goal + goal-store)

> **BLOCKED UNTIL H1 CLOSURE + owner go (Д5).** Проверь STATUS.md: G-H2-START. Иначе СТОП.
> Самый большой H2-слайс; при необходимости дели на 2 сессии по границе
> (import_text+track_word) / (goal-семейство+миграция) — но обе половины по этому промту.

## Роль и цель
Инженер-исполнитель в `E:\projects\tts-prototype-android`. Цель: три новых propose-инструмента +
один read (get_current_goal) + goal-store (миграция) + owner-preview карточки. Контракты — 04 §3
(канон, включая идемпотентность §0.7).

## Обязательное чтение
Пакет: `README.md`, `STATUS.md`, `04_HORIZON_2_ARCHITECTURE_AND_CONTRACTS.md` (§0+§3),
`07_DATA_CONSENT_PROVENANCE_SECURITY.md` (§1 goal-store строка, §3 scopes, §4 церемонии),
`11_HANDOFF_TO_CODEX_5_6_SOL.md`. Живой код: `db/agentProposalsRepo.js` + существующий
propose_action путь (mcpSchemas/contracts/productionHandlers) + owner-preview UI подтверждения
(найди живой код карточек подтверждения в Студии/Mini App — grep по propose/proposal);
import-путь Библиотеки (как владелец добавляет текст — этот же детерминированный путь исполняет
подтверждённый import); track-путь слова (существующий ручной трекинг); `migrations/` (послед.
номер!) + `db/migrate.js` правила.

## Инварианты
Исполнение — ТОЛЬКО first-party LinguistPro после owner confirm; агент не исполняет никогда.
Goal пишет сервер. Import/track по owner correction 2026-07-23 исполняет текущий браузер через
одноразовый server ticket и существующие OPFS-функции; CONFIRMED только после receipt. Никаких новых kind
в СУЩЕСТВУЮЩЕМ propose_action (схемы не мутировать) — три НОВЫХ инструмента. Идемпотентность:
сервер derives ключ из содержимого; повтор → DUPLICATE с тем же proposal_id. TTL предложений 14д.
evidence-поле track_word обязательно (произведено/показано — провенанс); caveat честен.
Import: дедуп по телу, R11 — MACHINE_ADDED никуд помечен, ничего не перезаписывает. Goal-store:
класс A, правка/закрытие только владельцем в UI, агент не интерпретирует завершение. Миграция:
следующий РЕАЛЬНЫЙ номер (054+ — проверь ls migrations/), одна транзакция, без BEGIN/COMMIT,
перед прогоном db:backup. UPSERT — только ON CONFLICT DO UPDATE SET.

## Scope / Non-goals
Scope: 4 инструмента + миграция weekly_goals + preview-карточки (3 вида; i18n ru/en/he + SW bump)
+ consent-карточки 4 новых scopes + smoke + деплой + прод-верификация + скилл-дополнения.
Non-goals: автоимпорт чего-либо; изменение FSRS/track-механики; UI-редактор целей сверх
минимального (просмотр/закрыть/удалить); Spotify (Д2).

## Предпроверки
1. HEAD/версия; STATUS: H2.3 PLANNED; H2.1/H2.2 CLOSED (паттерн проложен).
2. Факт-проверка: реальная схема proposals-таблицы (kind generic? payload JSON?) — расширение
   новыми kind должно лечь в существующую структуру; иначе — вопрос владельцу, не самодеятельность.
3. Факт-проверка: живой import/track — OPFS `createText`/`addSentence`/`setWordStatus`; retired
   server REST writers отвечают 410. Использовать ticket+receipt, не параллельную server truth.
4. Снапшот схем «до»; `ls migrations/` — следующий номер.

## Пошаговая работа
1. Миграция weekly_goals по 07 §1 (поля из 04 §3.3); прогон на копии БД; откат-путь.
2. capabilities.js: 4 записи (scopes из 07 §3; rate: propose 6/min·60/day, get_current_goal
   6/min·200/day). mcpSchemas.js: схемы по 04 §3.
3. Хендлеры: PENDING-записи в proposals-леджер (дедуп-ключ по нормализованному содержимому);
   get_current_goal — чтение ACTIVE-строки.
4. Owner-preview карточки: import (источник+URL+полный body_preview+niqqud_status+disclosure+
   вердикт дедупа); track_word (по-словно, evidence/caveat видимы); goal (statement+type+anchor+
   period, пометка OUTCOME-целей). Goal подтверждается сервером; import/track получают 5-минутный
   одноразовый ticket, исполняются OPFS-браузером и подтверждаются receipt; провенанс-поля
   (imported_via_agent_proposal, source AGENT_PROPOSED_OWNER_CONFIRMED) пишутся.
5. Consent-церемонии 4 scopes (07 §4-тон).
6. Smoke `scripts/premium/agent-w1-family-smoke.js`: negative-кейсы из 04 §3 (дубль → DUPLICATE;
   >10 слов; body>лимита; external без url; period вне 7..14; нет активной цели → goal:null;
   REJECTED не исполняется; EXPIRED по TTL) + happy-paths трёх подтверждений (исполнение
   детерминированным путём, провенанс на месте). + существующие гейты (в т.ч. миграционный
   integrity).
7. Деплой → прод-верификация: миграция применена (проверь таблицу на проде), инструменты через
   Hermes живые (restart-ловушка), preview-карточка реально показалась владельцу.
8. Скилл-дополнения (`hermes-side/h2.3/`): когда предлагать import/track/goal, как формулировать
   reason, запрет пакетного спама предложениями.

## Acceptance
Smoke зелёный полностью; гейты; прод; диф схем только-добавление; 4 церемонии пройдены; STATUS.

## Owner-live
По одному реальному циклу каждого вида: песня → import → текст в Библиотеке с провенансом;
слова из письма → track; ретроспектива → goal в goal-store; get_current_goal возвращает её.
Вердикты в STATUS.

## Rollback
Capabilities отключаемы по одному. При выключенных scopes/ticket routes новые OPFS-исполнения
невозможны; уже импортированные владельцем тексты/слова остаются обычными пользовательскими данными.
Миграция — восстановление из db:backup (проверено на копии); preview-карточки исчезают за gate.

## Отчёт
По 11 §4 + номера миграции, факт-таблицы предпроверок.
