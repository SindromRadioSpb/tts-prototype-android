# AI_MENTOR_RECON_2026_07_04 — AI-наставник + Cloud Learner Graph (программа-recon)

> **Статус:** RECON **v2** — направление и все решения §13 **УТВЕРЖДЕНЫ владельцем
> 2026-07-04** (sign-off-пакет вписан в §13 как решения); роли R12–R16 утверждены без
> консолидации и встроены в `docs/PROJECT_ROLES.md`. В CLG-P0 осталось: adversarial
> role-critique workflow → выжившие правки в этот док → старт CLG-P1.
> **v2-правки владельца (7):** canon transition (§4.6) · dual-write prohibition (§4.7) ·
> event schema versioning (§6) · migration dry-run gate (§9 CLG-P3) · SQLite operational
> constraints (§4.5) · agent provenance schema (§7) · external-pilot gate (§9 G-EXT).
> **Дата:** 2026-07-04. **Прод на момент написания:** v3.11.87.
> **Как создан:** сессия 2026-07-04 — синтез двух внешних концепт-текстов советника
> (v1 «LinguistPro Mentor / персональный языковой наставник», v2 «A-controlled / Cloud
> Learner Graph first»), оценки по ролям проекта R1–R11 и инвентаря живого кода
> (`public/db/migrations.js`, `public/js/fsrs-core.js`, `server.js`, `db/`).
> **Решение владельца (зафиксировано):** «раз архитектуру всё равно ломать — ломаем один
> раз, явно и правильно»: выбран вариант **A-controlled**, Cloud Learner Graph строится
> ПЕРВЫМ, агент и Telegram — поверх него.
> **Связанные доки:** `RETENTION_PROGRAM_RECON_2026_07_02.md` (retention-канон, P-нумерация
> ТАМ своя — не путать), `docs/SRS_STRATEGY_v3_2.md` (частично superseded),
> `docs/PROJECT_ROLES.md` (роли-канон), `docs/PRIVACY.md` + `.claude/SECURITY_AUDIT_2026-06-13.md`
> (privacy/security постура, которую этот пивот меняет).
> Этот файл — канон программы. Правки статуса фаз — сверху, в §9.

---

## §0. TL;DR

LinguistPro сознательно переводится из local-first single-browser app в **персональную
cloud-synced языковую платформу**. Сервер становится каноническим владельцем учебного
состояния (**Learner Graph**), браузер остаётся быстрым локальным клиентом с OPFS-кэшем,
AI-наставник — один из клиентов графа (наряду со Студией, Залом, Telegram Mini App и
будущими поверхностями). Пивот оформляется не как «фича агента», а как платформенный
эпик из 10+ фаз (§9), с неприкосновенным каноном `review_log`/FSRS (§1.3) и жёстким
правилом: **Telegram-агент не пишется, пока серверный learner-state не проходит
replay-оракул и lossless-sync** (§9, гейт G-5).

---

## §1. Architecture Decision Record

### 1.1 Формула решения

```text
Мы сознательно переводим LinguistPro из local-first single-browser app
в персональную cloud-synced языковую платформу.

Сервер становится каноническим владельцем учебного состояния.
Браузер остаётся быстрым локальным клиентом с OPFS-кэшем.
Агент — не внешнее дополнение, а полноценный клиент Learner Graph.

Не «прикручиваем Telegram к OPFS».
А «строим Cloud Learner Graph, делаем OPFS локальной репликой,
и подключаем Telegram/Agent как полноценных клиентов».
```

Выбор — **A-controlled**, а не B+ (Context Packs как хранилище-компромисс):
не наивный Cloud Profile «сервер хранит всё подряд», а управляемая архитектура
`Cloud Learner Graph + event-sourced review_log + OPFS как локальный cache/offline replica`.

### 1.2 Что меняется

| Было | Становится |
|---|---|
| OPFS = единственная база пользователя | OPFS = кэш, offline-реплика, outbox, fallback |
| Сервер не знает пользователя (только research-когорты k=5 + audio-кэш) | Сервер владеет каноном learner-state; появляются identity, consent, tenant isolation |
| Память слова живёт в одном браузере | Кросс-девайс: ПК → Telegram → телефон, одно состояние |
| Anki — единственный внешний канал повторений | Каналов много: Зал, Студия, Telegram bot, Mini App, Push; все сходятся в один лог |
| PRIVACY-постура «данные не покидают браузер» | Новая постура: классы данных A–D (§5), consent-записи, экспорт/удаление аккаунта |

### 1.3 Что НЕ меняется (неприкосновенный канон)

Эти инварианты пережили retention-программу (v3.11.81–87) и переносятся в облако как есть:

1. **`review_log` append-only.** Событие никогда не редактируется и не удаляется;
   слияние источников = только добавление строк (паттерн P4 Anki-ingest).
2. **FSRS-state = derived projection.** `srs_*` — пересчитываемый кэш; оракул
   `replay(log) == stored` обязателен и на сервере (расширение `smoke:memory-canon`).
3. **Агент не пишет state.** Ни при каких обстоятельствах не `word_status.known = true`;
   только событие в лог (`source: 'agent:telegram'`), state пересчитает редьюсер.
4. **LLM объясняет — резолвер утверждает.** Морфологические факты (root/binyan/POS/формы/
   никуд) приходят ТОЛЬКО из нашего пайплайна (pealim-infl-v12, notes-autogen, Dicta-derived);
   LLM упрощает, связывает, подбирает порядок подачи — но не является источником языкового факта (R1).
5. **derived ≠ asserted (R9).** Каждое объяснение агента — derived-контент с провенансом
   в самом сообщении.
6. Клиентские миграции: следующая метка = РЕАЛЬНОМУ индексу массива (`public/db/migrations.js`);
   серверные — только через `db:migrate`; любой новый писатель SRS-состояния → gate-consumers-sweep.

### 1.4 Решения периметра (зафиксированы вместе с пивотом)

- **Один официальный Telegram-бот**, привязка по одноразовому pairing-code. «Свой бот на
  пользователя» — только как advanced-режим, не в программе. **Имя (решение §13.8):**
  пробуем `@LinguistProMentorBot`, fallback-порядок `@LinguistProTutorBot` →
  `@LinguistProHebrewBot` → `@LinguistProCoachBot`. **Владение:** бот создаётся с
  проектно-контролируемого Telegram-аккаунта (не случайного личного) с 2FA и
  подконтрольным recovery; токен — ТОЛЬКО в Coolify secrets/env, не в коде; процедура
  ротации документируется; BotFather-ownership фиксируется в `.claude/PROD_OPS_PRIVATE.md`.
- **WhatsApp исключён на старте** (business-платформа, тарификация per-message, 24-часовое
  service window — дорого для daily-nudge модели). Архитектурно предусмотрен как будущий
  channel adapter, не реализуется до зрелости Telegram-канала.
- **Telegram — только после серверного learner-state** (гейт G-5, §9). Иначе агент становится
  «вторым мозгом» рядом с продуктом, а не внутри него.

---

## §2. Продуктовая концепция: LinguistPro Mentor

### 2.1 Три среды и место агента

```text
Студия      — создаёт учебный материал (текст → никуд/перевод/аудио/карточки/разбор)
Читальный зал — превращает материал в управляемое чтение (due-кольцо, tap-морфология, retrieval)
AI-наставник — сопровождает МЕЖДУ сессиями: превращает опыт чтения в следующий точный шаг
               и возвращает пользователя в Студию/Зал с конкретным действием
```

Наставник выполняет 5 ролей: **тьютор** (объясняет на языке пользователя) · **тренер
памяти** (due-слова, ошибки, паузы) · **навигатор по корпусу** (что читать дальше из
реального словаря пользователя) · **экзаменатор** (диктанты, listening, cloze, reverse) ·
**куратор артефактов** (слабые места → план обучения).

### 2.2 Ключевые сценарии (концентрат исходной концепции)

- **Утренняя микро-сессия:** «11 слов на повторение, слабость недели — hitpael. 5 минут?»
  с кнопками [5 мин][15 мин][Позже][Только аудио].
- **Возврат в контекст чтения:** due-слова возвращаются в ИСХОДНЫЕ предложения текста,
  на котором пользователь остановился (механика P5 уже in-product — агент её триггерит).
- **Объясни последнее трудное предложение:** буквальный разбор + нормальный русский +
  мини-правило + 2 похожих примера ИЗ ТЕКСТОВ ПОЛЬЗОВАТЕЛЯ.
- **Диктант в чате:** аудио/задача → ответ пользователя → честная проверка → событие в `review_log`.
- **Генерация материала из переписки:** «текст про визит к врачу, алеф+, с никудом и аудио»
  → draft в Студии + кнопка [Открыть в Студии].
- **Живой хвост чтения:** после сессии — digest (прочитано/новые слова/одно правило/задание на завтра).
- **Миссии:** короткие целевые задания («закрыть 4 почти-закреплённых слова за 7 минут»)
  вместо абстрактных упражнений.
- **Недельный отчёт:** прочитано/новые слова по стадиям/слабые места/лучшее достижение/план.
- **Иврит для жизни (Израиль-пакеты):** купат холим, битуах леуми, муниципалитет, школа/сад,
  аренда, работа, ульпан; пользователь загружает реальное письмо → перевод + разбор
  официальных формулировок + словарь + тренировка ответа + шаблон.
- **Misconception Map:** тренируем не слово, а ошибочную модель (ל/אל/על, infinitive vs present,
  hitpael vs hifil, смихут, согласование рода, артикль с прилагательными).
- **Словарь по судьбе слова:** «להתקדם встречалось 4 раза; узнаёшь при чтении, ошибаешься
  в написании — сегодня только диктант».
- **AI-рецензент:** «проверь мой иврит» → исправление + ошибки уходят тренировочными единицами.

### 2.3 Принцип действия и анти-сценарии

Каждое действие агента обязано попадать в одну из 5 категорий: **объяснить · тренировать ·
вернуть к чтению · создать материал · обновить learner profile.** Всё остальное — вторично.

Агент НЕ должен: выдумывать грамматику без привязки к тексту; исправлять без записи события;
спамить; тащить полный текст в LLM без необходимости; ломать SRS-логику; перезаписывать
known/unknown без подтверждения; изображать знание прогресса при выключенной синхронизации;
быть «болталкой про иврит».

Режимы вмешательства (пользователь управляет явно): **Silent** (только по запросу) ·
**Coach** (1–2 мягких сообщения в день + digest) · **Intensive** (утро/день/вечер + недельный отчёт).

### 2.4 Критерий премиальности

Фича премиальна, когда пользователь чувствует: *«он помнит, что я читал; знает, где я
ошибаюсь; не даёт случайных упражнений; возвращает меня к МОИМ текстам; объясняет МОИ
предложения; помогает жить с ивритом»*. Уникальные оси, которые нельзя потерять при
облачном пивоте (иначе получится Duolingo-like облако): любой реальный текст → материал;
sentence-level привязка (`text_key`/`sentence_id`/`order_index`/`token_index`); SRS из
прочитанных предложений; агент объясняет именно встреченное и возвращает в живой текст.

---

## §3. Инвентарь: что уже построено и как переиспользуется

Измерено по живому коду 2026-07-04 (R10 measure-before-code). Ключевой вывод: **ядро
event-sourcing уже отгружено и уже спроектировано под multi-device merge** — облачный
пивот достраивает транспорт и identity, а не переизобретает модель памяти.

### 3.1 Есть и переносится как есть

| Актив | Где | Роль в новой архитектуре |
|---|---|---|
| `review_log` (клиент, мигр. 41) | `public/db/migrations.js:868` | **Фундамент облачного лога.** Схема: `id` PK, `item_key`, `kind` (review/skip/seed), `reviewed_at`, `grade` 1–4, `source`, `channel`, `latency_ms`, `meta_json`. `id` — content-детерминированный и глобально-уникальный (`app:<sha1-20>` \| `anki:<reviewId>` \| `seed:<item_key>`) → **серверный ingest = INSERT OR IGNORE, дедуп между устройствами бесплатно.** |
| `fsrs-core.js` (FSRS-6) | `public/js/fsrs-core.js` | UMD, **Node-requirable**, детерминированный (nowMs инъецируется, без Date.now/Math.random), golden-гейт `smoke:fsrs` vs ts-fsrs@5.4.1. → **Серверный replay (фаза P4) = require ТОГО ЖЕ файла; parity by construction.** |
| `lemma-canon.js` | `public/js/lemma-canon.js` | Единый кейер item_key для всех поверхностей; гейт `smoke:memory-canon` (replay==stored). Сервер использует тот же модуль. |
| Anki-ingest паттерн (P4) | `index.html` (~15502), `ingestAnkiReviewsToLog` | **Готовый шаблон внешнего канала:** события чужого источника вливаются в канон-лог, state пересчитывается, живая кросс-экранная сверка (`updateSrsState`). Агент = ещё один такой канал (`source: 'agent:telegram'`). |
| P5 reading-native retrieval | `reader-morph.js` | Due-кольцо в живом чтении + reveal-then-grade. Механика «возврата в контекст» готова — агент её адресует deep-link'ом. |
| Серверная БД + миграции | `db/` (`migrate.js`, `backup.js`, `integrity.js`, репозитории) | Дисциплина для новых learner-таблиц: только `db:migrate`, ежедневный бэкап тома уже настроен. |
| Токен-гейты | `server.js` (AUDIO_UPLOAD_TOKEN + `X-Audio-Upload-Token`, RESEARCH_ADMIN_TOKEN) | Паттерн защищённых endpoint'ов есть; это НЕ identity (см. 3.2). |
| Research API v1 (k=5) | `server.js`, `docs/ULPAN_RESEARCH_PLAN_v3_2.md` | Прецедент серверных пользовательских данных с privacy-дизайном и consent-механикой — образец для consent_records. |
| Инфра | Hetzner CX23, Coolify, том `/app/data`, `/healthz`+UptimeRobot | Контейнер: CPU 1.5 cores, RAM **1536 MB hard limit** — бюджет, в который должен влезть agent runtime (§11). |

### 3.2 Нет — строится с нуля

Identity/аккаунты/сессии/devices · sync bridge (outbox/cursor/ack) · серверные learner-таблицы ·
Web Push (проверено: в кодовой базе НИ одного упоминания pushManager/PushSubscription) ·
agent runtime · Telegram-что-либо (единственный WhatsApp в коде — deep-link фидбека
разработчику, `server.js:971`) · consent_records · per-user rate limits · tenant isolation ·
audit log критических действий.

---

## §4. Целевая архитектура

### 4.1 Центр — Learner Graph, не агент

```text
                    ┌────────────────────┐
                    │  Telegram Bot       │
                    └─────────┬──────────┘
                    ┌─────────▼──────────┐
                    │ Telegram Mini App   │
                    └─────────┬──────────┘
┌──────────────┐      ┌───────▼────────┐      ┌────────────────┐
│ Studio       │◄────►│ Cloud API       │◄────►│ Agent Runtime   │
└──────────────┘      └───────┬────────┘      └────────────────┘
┌──────────────┐      ┌───────▼────────┐
│ Reading Room │◄────►│ Learner Graph   │
└──────────────┘      └───────┬────────┘
                       ┌──────▼───────┐
                       │ Event Log     │  learner_events + review_log (append-only)
                       └──────┬───────┘
                       ┌──────▼───────┐
                       │ Projections   │  FSRS replay → srs_projections → agent_context
                       └──────────────┘
```

Клиенты графа: Studio Web · Reading Room Web · Telegram Bot · Telegram Mini App ·
Web Push · (будущее: mobile app, teacher dashboard). **Сервер хранит не «чат с агентом»,
а learner graph; агент — только один из клиентов.**

Технический факт, делающий пивот безальтернативным для messenger-поверхностей:
**Telegram Mini App живёт в webview Telegram = другой origin и другое хранилище; OPFS
основного сайта ему недоступен принципиально.** Local-first и messenger-first несовместимы
без серверного состояния.

### 4.2 Новая роль OPFS

OPFS не выбрасывается: быстрый reader-cache · offline mode · корпус/аудио-кэш ·
**pending event outbox** · sync cursor · last known projections · emergency fallback.
Приложение остаётся быстрым и офлайн-способным; канон переезжает на сервер.

### 4.3 Sync bridge (браузер ↔ сервер)

```text
Действие в браузере → локальная запись (OPFS, как сейчас) → outbox
  → батч-ingest на сервер → server ack → cursor update → projection refresh
Офлайн: события копятся в outbox → отправка пачкой → server dedupe по event id
```

Дедуп не требует новой механики: id `review_log` уже content-детерминированные (§3.1).
Для `learner_events` — тот же принцип (детерминированный id из содержимого + device_id).
Конфликт-модель тривиальна по построению: append-only лог не конфликтует, состояние —
редьюсер поверх слитого лога (ровно та схема, что уже работает для Anki-merge).

### 4.4 Канон-цепочка состояния

```text
learner_events ──┐
                 ├─→ review_log ─→ FSRS replay (fsrs-core.js в Node) ─→ srs_projections ─→ agent_context
клиенты/агент ───┘
```

Запрещённый путь: `агент сказал «выучено» → word_status.known = true`. Правильная запись
от агента — событие:

```json
{
  "id": "app:<sha1-20>", "item_key": "<lemma-canon key>", "kind": "review",
  "reviewed_at": "2026-07-04T20:10:00+03:00", "grade": 1,
  "source": "agent:telegram", "channel": "dictation",
  "meta_json": {"answer": "מתקדם", "expected": "להתקדם", "sentence_id": "s_456"}
}
```

### 4.5 Выбор серверной БД — РЕШЕНО (§13.2): SQLite с эксплуатационными условиями

Старт — существующий SQLite-стек (`db/`) на томе: миграции/бэкап/integrity уже есть,
масштаб «владелец → десятки пользователей» он держит. **Обязательные условия старта:**

- WAL mode + `busy_timeout`;
- все ingest-пачки — только в транзакциях;
- idempotent `INSERT OR IGNORE` (content-детерминированные id, §3.1);
- ежедневный бэкап + integrity check (уже настроены: `db:backup` / `db:integrity` — расширить на learner-таблицы);
- disk budget + алёрт (урок инцидента 100%-диска 2026-07-04);
- явный лимит размера learner DB;
- **single-writer дисциплина:** никакой второй сервис не пишет в SQLite напрямую —
  agent runtime ходит только через Cloud API main-сервера (см. §13.4).

**Postgres = explicit scale gate**, рассмотреть при любом из: внешний пилот >20–50 активных
пользователей · отдельный agent runtime с высокочастотным writeback · p95
write-lock/busy_timeout начинает влиять на UX · teacher dashboard / organization accounts ·
потребность в горизонтальном масштабировании.

### 4.6 Canon transition — когда сервер становится источником истины

Пивот проходит по фазам; «сервер = канон» наступает НЕ в момент появления серверных таблиц:

```text
До CLG-P3:
  OPFS остаётся operational source of truth для владельца;
  сервер принимает read-only / mirror-копию событий (CLG-P2 = server mirror).

После прохождения lossless-гейта CLG-P3:
  сервер становится canonical source of truth для синхронизированного review_log;
  OPFS становится локальной репликой с outbox/inbox.

После прохождения replay-оракула CLG-P4:
  сервер становится canonical source of truth для SRS projections.

До прохождения P3+P4 (обоих):
  никакие внешние клиенты — Telegram, Mini App, Web Push с персональными due-данными —
  не имеют права писать или принимать решения от имени learner-state.
```

Считать сервер «каноном» на этапе P2 — ошибка: sync bridge ещё не доказал lossless-свойства.

### 4.7 Dual-write prohibition

Во время миграции **запрещено иметь двух независимых писателей одного и того же state**.
Любое состояние в системе — ровно одно из трёх:

```text
- append-only event (лог);
- derived projection (пересчитываемая из лога);
- local cache (реплика канона).
```

«Отдельная конкурирующая истина» (например, серверный state, правленный мимо лога, при
живом клиентском state) — не существует как категория. Это прямое продолжение урока
«два писателя `word_status.srs_*` → gate-consumers-sweep» на масштаб платформы.

---

## §5. Классы данных и consent

| Класс | Содержимое | Политика |
|---|---|---|
| **A — учебное состояние** | user_id, devices, review_log, learner_events, srs_projections, derived known/learning/due, reading progress, agent settings, notification prefs, telegram pairing | Хранится на сервере всегда (это и есть Learner Graph) |
| **B — учебные артефакты** | созданные/обработанные тексты, sentence anchors, аннотации, переводы, никуд, транслит, ссылки на аудио, заметки, agent explanations, studio drafts | Хранится при включённом cloud sync (переключатель) |
| **C — чувствительное содержимое** | полные личные тексты, письма, мед./юр. документы, загруженные файлы | ТОЛЬКО явный opt-in, гранулярно: ☐ синхронизировать личные тексты ☐ разрешить агенту видеть полный текст ☐ разрешить использовать для персональных уроков |
| **D — временный LLM-контекст** | prompts, raw context packs, промежуточные объяснения, debug payloads | TTL или не хранить вообще; indefinite-хранение ЗАПРЕЩЕНО |

Каждое согласие — строка в `consent_records` (что, когда, какая версия текста согласия,
отзыв). Экспорт данных и удаление аккаунта — обязательства с первого дня (P1), не «потом».

**Context Pack** в этой архитектуре — не хранилище (как в отвергнутом B+), а **prompt
artifact**: временная сборка ровно того контекста, который нужен агенту для конкретного
действия (`Learner Graph → Context Pack Builder → LLM → ответ → событие/задача/артефакт`).

---

## §6. Серверная модель данных (ядро, не 40 таблиц)

```text
users, devices, user_sessions                 -- P1: identity
learner_events                                 -- P2: общий поток (text_opened, sentence_read,
                                               --      word_clicked, review_answered, audio_played,
                                               --      dictation_answered, agent_task_completed, ...)
review_log                                     -- P2: ЗЕРКАЛО клиентской схемы (мигр. 41)
                                               --      + user_id, device_id, ingested_at
srs_projections                                -- P4: derived, пересчитывается из review_log
channel_links                                  -- P7: telegram_user_id/chat_id ↔ user_id, pairing
notification_preferences                       -- P4.5/P7: режимы Silent/Coach/Intensive
agent_profiles, agent_threads, agent_messages  -- P6: роль/стиль/цели; переписка
agent_tasks, agent_explanations                -- P6: задачи агента + объяснения с провенансом
consent_records, audit_log                     -- P1: consent-история; критические действия
```

Принципиально: серверный `review_log` — **та же схема, что клиентский** (id/item_key/kind/
reviewed_at/grade/source/channel/latency_ms/meta_json) плюс серверные колонки. Симметрия
делает sync тривиальным, а replay — идентичным на обеих сторонах. `agent_memory` и
`misconception map` — производные проекции поверх лога и объяснений, НЕ источник истины.

**Обязательный конверт события (CLG-P2, event schema versioning):**

```text
event_id            -- content-детерминированный (принцип §3.1)
idempotency_key     -- ключ дедупа ingest-пачки
schema_version      -- версия схемы события
source_client_version  -- версия клиента-источника (app version)
device_id
created_at_client   -- когда событие произошло у пользователя
ingested_at_server  -- когда сервер его принял
```

Семантика двух времён строго разделена: **`created_at_client` — учебная семантика**
(FSRS elapsed, расписание, отчёты), **`ingested_at_server` — аудит и sync**. Использование
серверного времени в учебной математике запрещено (офлайн-пачка, пришедшая через сутки,
не должна сдвигать интервалы).

---

## §7. Agent Runtime: tool-based, не свободный LLM

LLM не получает прямой доступ к базе. Слой инструментов:

```text
get_due_words(user_id, limit)          create_review_task(user_id, word_ids)
get_recent_reading_context(user_id)    record_review_answer(...)        → событие в review_log
get_sentence_context(sentence_id)      create_studio_draft(...)
get_weak_patterns(user_id)             recommend_next_text(...)
get_word_lifecycle(item_key)           explain_sentence(...)            → agent_explanations + провенанс
```

Цикл «Повтори меня»: `get_due_words → выбор режима → вопрос → ответ пользователя →
record_review_answer → FSRS-replay пересчитывает → результат`. LLM никогда «сам не решает,
что пользователь знает».

Разделение труда (инвариант 1.3-4): резолвер/датасеты утверждают факты; LLM — объясняет
проще, даёт аналогию, связывает с русским, подбирает примеры из текстов пользователя,
собирает микро-урок, выбирает порядок подачи. Оценка ответов (грейдер): результат проверки —
это событие в логе; метрики качества агента считаются независимым проходом по логу, не
самоотчётом агента (независимость оракула, R11).

**LLM-провайдер (решение §13.3): Gemini first, обязательная provider abstraction**
(`agent_llm_provider: gemini | claude | mock`; `mock` — для гейтов и офлайн-тестов).
Обязательные лимиты: max agent messages/day/user · max explain calls/day/user · max weekly
digest tokens · cost ledger · **graceful degradation: без LLM агент всё равно показывает
due, план, ссылки, review** (детерминированные инструменты не зависят от LLM).

**Провенанс объяснения — минимальная схема `agent_explanations`** (защита `derived ≠ asserted`):

```json
{
  "explanation_id": "ae_...",
  "user_id": "u_...",
  "sentence_id": "s_...",
  "facts_used": [
    { "type": "morphology",  "source": "resolver",           "confidence": "asserted" },
    { "type": "translation", "source": "studio_translation",  "confidence": "derived"  }
  ],
  "llm_model": "gemini-...",
  "created_at": "..."
}
```

Каждый языковой факт в объяснении обязан ссылаться на источник с уровнем доверия;
факт без `facts_used`-записи в утверждающей роли — красный флаг ревью.

---

## §8. Каналы

- **Telegram Bot (P7).** Один официальный бот; webhook с secret-token; pairing-code
  одноразовый, TTL, показывается во вкладке «AI-наставник»; связка `telegram_user_id +
  chat_id ↔ user_id` в `channel_links`; подмена chat_id невозможна (проверка привязки на
  каждом входящем). Команды MVP: `/start /plan /review /read /explain /settings`.
- **Telegram Mini App (P8).** Обычный клиент Cloud API с валидацией `initData` (подпись
  Telegram); тренировки due review/listening/dictation/cloze/reverse + прогресс.
- **Web Push (P4.5).** Дешёвый первый return-trigger: серверные projections знают due —
  PWA-нудж «N слов ждут повторения» без содержимого. Первая видимая ценность пивота
  задолго до Telegram.
- **WhatsApp — исключён** (§1.4). Канальный адаптер в архитектуре предусмотрен, реализация
  отложена до зрелости Telegram-канала и/или организационного сценария (ульпан/школа).
- **Вкладка «AI-наставник» (P9-смежное).** Статус подключения · Setup Wizard (мессенджер →
  роль → цель → расписание → pairing → тест) · конструктор роли (язык объяснений, стиль,
  цель, интенсивность) · **разрешения на данные** (чекбоксы классов B/C) · команды-шпаргалка ·
  **журнал действий агента** (что отправил/получил/обновил — основа доверия).

---

## §9. Roadmap (фазы CLG-P0…P10) и гейты

> Нумерация локальна для этого дока (префикс CLG — Cloud Learner Graph); не путать с
> P-фазами retention-программы.

| Фаза | Содержимое | Гейт выхода | Статус |
|---|---|---|---|
| **CLG-P0** | Этот recon + решения §13 ✅ + роли §12 ✅ + v2-правки ✅ + adversarial role-critique workflow по дизайну (норма проекта) | Sign-off владельца ✅ (2026-07-04) + критика отработана | 🟡 v2 — осталась критика |
| **CLG-P1** | Identity & Account: users/sessions/devices, owner-only bootstrap (но схема сразу multi-tenant), consent_records, удаление/экспорт данных, ревокация устройств; попутно закрыть долг ротации AUDIO_UPLOAD_TOKEN | Аккаунт создаётся/удаляется/экспортируется; audit_log пишет | ⬜ |
| **CLG-P2** | Cloud Event Log: серверные `review_log` + `learner_events`, ingest-endpoint с idempotency (готовые content-id), schema_version | Повторный ingest той же пачки = 0 новых строк | ⬜ |
| **CLG-P3** | Browser Sync Bridge: OPFS outbox, cursor, ack, офлайн-пачки, dedupe | **Lossless-гейт:** клиент-лог == сервер-лог после sync (в обе стороны). **+ Migration dry-run** на РЕАЛЬНОМ OPFS-профиле владельца: count строк review_log · checksum упорядоченных строк · replay до/после идентичен · повторный ingest = 0 новых строк · rollback возвращает прежнюю local-only работу | ⬜ |
| **CLG-P4** | Server-side FSRS replay + projections: `require('fsrs-core.js')` + `lemma-canon.js` в Node | **Оракул:** server replay == browser replay на реальном профиле владельца | ⬜ |
| **CLG-P4.5** | Web Push due-нудж (первая видимая ценность) | Нудж приходит на телефон владельца, deep-link открывает due-кольцо | ⬜ |
| **CLG-P5** | Learner Graph API: getDue/getReadingProgress/getKnownWords/getWeakPatterns/getRecentSentences/getNextRecommendedText/getAgentContext | API отдаёт то же, что видит Зал локально | ⬜ |
| **CLG-P6** | Agent Runtime: planner/tutor/reviewer/explainer/recommender/grader, tool router, context pack builder, лимиты стоимости | Агент проходит §7-цикл на синтетике + владельце | ⬜ |
| **CLG-P7** | Telegram Bot: pairing, команды, журнал действий во вкладке | Полный цикл «/review → ответ → review_log → Зал видит» | ⬜ |
| **CLG-P8** | Telegram Mini App: тренировки + прогресс | Due review в Mini App пишет в тот же лог | ⬜ |
| **CLG-P9** | Agent-кнопки в Зале/Студии: [Спросить агента][Объясни предложение][Добавь в тренировку][Создай мини-урок][Текст по слабым словам] + anchor-точность (text_key/sentence_id/order_index/token_index) | 380px light/dark, RTL, parity-гейты зелёные | ⬜ |
| **CLG-P10** | Premium Analytics: weekly digest, misconception map, personal curriculum engine («12 знакомых слов + 4 из зоны ближайшего развития»), retention-метрики; teacher dashboard — за горизонтом | — | ⬜ |

**Гейт G-5 (жёсткое правило).** Telegram-агент не пишется, пока серверный learner state
не умеет всё пять: (1) принять review event; (2) пересчитать FSRS; (3) отдать due list;
(4) пройти replay-оракул; (5) синхронизироваться с OPFS без потери данных.

**Гейт G-EXT (external-pilot gate).** Owner-as-user допускается с CLG-P1. **Первый внешний
пользователь — только после того, как готово всё:** полная privacy-ревизия (§11) ·
экспорт данных протестирован · удаление аккаунта протестировано · per-user rate limits ·
tenant-isolation тесты (А не видит Б) · backup-restore drill на learner-данных ·
abuse/rate-limit policy. До прохождения G-EXT внешний пилот запрещён независимо от
готовности функциональности.

**Отношение к текущей очереди (retention-программа) — ПОДТВЕРЖДЕНО владельцем (§13.6):**
закрыть **P4.1** (дефект демоции 'new' в Anki-ingest) ДО CLG-P2 — этот ingest-путь
становится фундаментом облачного лога, дефект нельзя копировать в облако. **P6-метрику
ретеншена** — до/параллельно CLG-P0–P1: она даст baseline, без которого эффект агента
будет неизмерим (R10). Telegram — строго после G-5.

---

## §10. Сводные инварианты и запреты программы

Запрещено (даже при полном cloud-пивоте):

- прямая запись агента в SRS state (только события через ingest);
- LLM-only морфология (резолвер утверждает — LLM объясняет);
- indefinite-хранение полных prompt payloads (класс D — TTL);
- автозагрузка личных текстов без гранулярного opt-in (класс C);
- отдельный Telegram-бот на каждого обычного пользователя;
- WhatsApp на ранней стадии;
- Telegram до прохождения гейта G-5;
- agent memory как источник истины (только производная проекция);
- нарушение миграционных инвариантов (метка==индексу на клиенте; db:migrate на сервере);
- новый писатель SRS-состояния без gate-consumers-sweep по всем поверхностям;
- **два независимых писателя одного state во время миграции** (§4.7: event / projection / cache — третьего не дано);
- **прямая запись agent-сервиса в SQLite** (только через Cloud API main-сервера, пока БД = SQLite);
- **внешние клиенты действуют от имени learner-state до прохождения P3+P4** (§4.6);
- **серверное время в учебной математике** (`ingested_at_server` — только аудит/sync; §6);
- **внешний пилот до прохождения G-EXT** (§9).

---

## §11. Цена, риски, ограничения

**Принимаемая цена пивота:** privacy-пивот · аккаунты/авторизация · облачная база
персональных данных · backup/restore learner-данных · удаление/экспорт · multi-tenant
security · rate limits · мониторинг · миграция OPFS→cloud · новая поверхность атак ·
ответственность за learner-state.

Специфика проекта:

- **Ресурсы.** Контейнер: 1.5 cores / 1536 MB; на нём уже сервер+TTS-прокси. Agent runtime,
  webhook и планировщик должны влезть в бюджет или выехать в отдельный Coolify-сервис (§13.4).
  Диск CX23 — свежий инцидент 100% (docker-образы, 2026-07-04): рост learner-данных требует
  дискового бюджета и алёрта.
- **Security.** Пивот расширяет чек-лист `SECURITY_AUDIT_2026-06-13`: webhook-подпись,
  session security, tenant isolation, audit log. Давние долги (ротация AUDIO_UPLOAD_TOKEN,
  firewall :8000) закрываются в CLG-P1, не позже.
- **Privacy-тексты — два уровня ревизии (решение §13.5).** Формулировки в
  тезисе/PRIVACY.md писались под OPFS-only. **Уровень 1 (в CLG-P1):** короткий
  development-mode addendum — «LinguistPro начинает поддерживать cloud learner-state;
  owner-only режим; внешним не предлагается; классы данных A–D; как удалить/экспортировать».
  Документация обязана отражать dev-реальность с момента появления аккаунтов и
  consent_records. **Уровень 2 (перед первым внешним пользователем, часть G-EXT):** полная
  ревизия PRIVACY.md, terms/consent copy, research/thesis wording, UI consent screens,
  export/delete wording. Агентские данные — отдельная подсистема от research-когорт (k=5).
- **BYOK-напряжение.** Серверный агент не может использовать браузерный BYOK-ключ —
  для владельца работают env-ключи (как сейчас), для внешних пользователей нужен
  server-key + Cost Governor (лимиты: сообщений/день, LLM-бюджет/пользователь, graceful
  degradation без LLM). Решение по модели — §13.3.
- **Продуктовый риск.** Пользователей кроме владельца пока нет; вся программа до CLG-P7
  включительно верифицируется owner-as-user. Это осознанно: платформа строится под
  будущий пилот, но проживается на себе.

---

## §12. Новые роли-линзы — УТВЕРЖДЕНЫ владельцем 2026-07-04

Решение: **утвердить R12–R16 как есть, БЕЗ консолидации R14/R15** (они ловят разные
провалы: R14 — «может ли А увидеть Б / подменить chat_id / украсть session», R15 — «что
хранится, сколько, как удалить/экспортировать, какое согласие»; объединение сделало бы
роль слишком широкой и менее зубастой). Встроены в `docs/PROJECT_ROLES.md`. Нумерация
продолжает канон R1–R11 (в концепт-тексте советника шли как R20–R24 — перенумерованы):

- **R12 — Cloud Platform Architect:** разделение event log / projections / artifacts;
  agent memory не смешан с learner state; архитектура держит 20→200→2000 пользователей;
  mobile/teacher dashboard добавляемы без переписывания.
- **R13 — Migration Steward:** OPFS→cloud без потери review_log; dry-run; checksum/replay
  validation; откат возможен.
- **R14 — Tenant Isolation / Security:** пользователь А не видит Б; pairing одноразовый;
  webhook защищён; session revoke; audit log.
- **R15 — Data Lifecycle / GDPR:** экспорт; удаление аккаунта и agent memory; TTL класса D;
  consent-история.
- **R16 — Cost Governor:** стоимость пользователя/день, digest, explain; лимиты; graceful
  degradation без LLM.

**R17 — Agent Pedagogy / Grader Independence (заготовка, НЕ утверждена):** педагогика
диалогового наставника + независимость грейдера от тьютора. Не блокирует CLG-P1;
определение подготовить и утвердить по норме propose-first **перед CLG-P6** (первым кодом
agent runtime).

---

## §13. Решения владельца (sign-off 2026-07-04)

1. **Auth: owner-only bootstrap на полноценной multi-tenant схеме.** users/devices/sessions
   полноценные с первого дня; создаётся первый owner-user; вход owner-only через bootstrap
   secret / invite code из env; после входа — нормальная session cookie; ВСЕ таблицы сразу
   с `user_id`; все API — только через authenticated user context. НЕ «сырой вечный токен
   как авторизация». Magic-link email — не первый код, но интерфейс закладывается так,
   чтобы добавить без переписывания users/sessions/devices. Внешний пилот невозможен до
   magic-link/email auth (+ G-EXT).
2. **БД: SQLite подтверждён для CLG-P1–P4** с обязательными эксплуатационными условиями
   (§4.5: WAL, busy_timeout, транзакционный ingest, idempotent INSERT OR IGNORE, backup,
   integrity, disk alert, лимит размера, single-writer). **Postgres — только по explicit
   scale gate** (§4.5).
3. **LLM: Gemini first, обязательная provider abstraction** (`gemini | claude | mock`),
   Claude — второй provider / adversarial-eval, НЕ блокер CLG-P6. Обязательные лимиты и
   graceful degradation без LLM (§7).
4. **Топология: CLG-P1–P5 — всё в основном контейнере; CLG-P6+ — agent runtime отдельным
   Coolify-сервисом**, но БЕЗ прямой записи в SQLite: main app/API — единственный владелец
   записи; agent service = stateless worker, все writeback-действия — через Cloud API
   (`Telegram/Agent Service → Cloud API → main server → SQLite`).
5. **Privacy: два уровня** — короткий dev-mode addendum в CLG-P1; полная публичная ревизия
   перед внешним пилотом (§11, часть G-EXT).
6. **Очерёдность: подтверждена** — retention P4.1 закрыть до CLG-P2; P6-метрика ретеншена
   до/параллельно CLG-P0–P1; Telegram строго после G-5.
7. **Роли: R12–R16 утверждены как есть, без консолидации R14/R15** (§12); R17 Agent
   Pedagogy / Grader Independence подготовить перед CLG-P6.
8. **Бот: пробовать `@LinguistProMentorBot`** (fallback §1.4); владение через
   проектно-контролируемый Telegram-аккаунт с 2FA; токен только в secrets; ротация
   документируется; ownership — в `.claude/PROD_OPS_PRIVATE.md`.

---

## §14. Следующие шаги

1. ✅ Решения владельца §13 + роли §12 получены и вписаны (v2, 2026-07-04).
2. ✅ 7 v2-правок владельца внесены: §4.6 canon transition · §4.7 dual-write prohibition ·
   §6 event schema versioning · §9 CLG-P3 migration dry-run · §4.5 SQLite constraints ·
   §7 agent provenance schema · §9 G-EXT external-pilot gate.
3. Adversarial role-critique workflow по этому дизайну (релевантные линзы из R1–R16,
   1 агент/роль) — ДО первого кода; выжившие BLOCKER/MAJOR-находки → правки в этот док.
4. CLG-P1 (identity) — первый код программы (после закрытия retention P4.1 / согласно
   §13.6). Telegram — не раньше гейта G-5.

**Напутствие программы (владелец):** первый код должен быть «скучным, платформенным и
почти невидимым» — identity, consent, event log, sync, replay, projections. Только после
этого агент станет премиальным продуктовым интерфейсом, а не опасной параллельной памятью.
