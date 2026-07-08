# CLG-P7.3 — proactive mentor nudges: RECON + SPEC (2026-07-08)

> Последний этап P7. Бот перестаёт быть чисто реактивным (/review) и САМ возвращает в петлю в
> подходящий момент — но как ПРЕМИАЛЬНЫЙ наставник, не reminder-спамер. Основа: owner-бриф 2026-07-08.
> Канон P7.3 (`TELEGRAM_P7_DECISION:70-71`): daily due reminder · quiet hours · notification_preferences
> · unsubscribe · rate limit. Предок — web-push return-trigger (`AI_MENTOR_RECON §8`, `pushRepo.js`).

## 0. Что уже есть (grounded infra map — REUSE, не изобретать)

| Механизм | Где | REUSE / ADD |
|---|---|---|
| Проактивный sweep-паттерн | `server.js:2120` (setInterval 15мин, DB-health guard, .unref, injectable nowMs) + `pushRepo.runPushSweep` (once/day UTC, due>0-гейт, «quiet»-skip, honest count, dead-cleanup) | **REUSE** паттерн 1:1 для Telegram-нуджа |
| Consent-recheck-before-send | `review.js::stillAuthorized` → `channelLinkRepo.{getActiveLinkByUser,telegramConsentActive}` (`tg-v1`, `telegram_delivery`, latest-granted+version) | **REUSE** как pre-send gate; link даёт `telegram_chat_id` |
| Dedup exactly-once | `channelLinkRepo.processUpdateTxn` (INSERT OR IGNORE + effect в ОДНОЙ txn, multi-worker-safe) · `last_notified_day`-маркер (single-writer) | **REUSE** INSERT OR IGNORE на nudge-id |
| Verb-only observability | `channelLinkRepo.logBotAction` (класс-A, только глагол, без контента) | **REUSE**; **ADD** outbound-контекст (своя txn, telegram_update_id=null) |
| Outbound API | `api.sendMessage/sendAudio` — `reply_markup` проброс verbatim | **REUSE**; inline_keyboard шлётся без правки api.js |
| Consent на напоминания | pairing-copy УЖЕ включает «напоминания» (`TELEGRAM_P7_DECISION:83-84`) | **REUSE** — новой consent-миграции НЕ нужно |
| `callback_query` (inline-кнопки) | **НЕ обрабатывается нигде** (webhook читает только `upd.message`, private text; `server.js:1954-1957`) | **ADD** (greenfield): webhook-ветка + `answerCallbackQuery` + callback-dedup/consent |
| Timezone | **нет нигде** (users/agent_profiles/channel_links/push — нет tz; web-push = global `PUSH_HOUR_UTC`) | **ADD** |
| notification_preferences | **нет** (планировалось `AI_MENTOR_RECON:673-676` как ЕДИНЫЙ КРОСС-КАНАЛЬНЫЙ бюджет push+бот+digest); `agent_profiles.mode` (silent/coach/intensive) — смежный knob | **ADD** |

**⚠ Канон-инвариант (AI_MENTOR_RECON:673-677):** `notification_preferences` = ЕДИНЫЙ бюджет по push+бот
СУММАРНО (mode + суточный cap + timezone + quiet hours). Значит Telegram-нудж НЕ должен быть отдельным
силосом, который дублирует web-push (иначе 2 нуджа/день). Гейт-предок: «число в нудже == due-кольцу».

## 1. Инварианты P7.3 (нельзя ослаблять)

- **Consent recheck перед КАЖДЫМ send** (`stillAuthorized`): pairing ≠ бессрочное право писать. Revoke/
  version-bump/unlink/чужой chat → не слать.
- **Deterministic reason** (R17, как selector): нудж отправляется ТОЛЬКО при РЕАЛЬНОЙ причине из
  состояния (код-enum), НИКОГДА LLM-мотивация. Нет причины → нет сообщения.
- **Honest count / no over-claim:** число в нудже == тому, что покажет due-кольцо (тот же getDue-rule).
- **Класс A — БЕЗ контента:** нудж несёт счётчик/титул причины, НИКОГДА ответ/целевую форму/текст
  пользователя (как web-push + P7.2 privacy). «Есть слова для проверки на слух» — да; какие — нет.
- **Exactly-once:** planned nudge не дублируется на scheduler-reran/рестарт/retry/webhook-redelivery
  (INSERT OR IGNORE nudge-id).
- **Backoff, не эскалация:** игнор → РЕЖЕ, никогда чаще. Долгое отсутствие → мягкая реактивация/пауза.
- **Quiet hours + tz:** ночью/неудобно — не слать. Нужны tz + окна.
- **Кросс-канальный бюджет:** не дублировать web-push (единый суточный cap).
- **Kill-switch:** глобальный флаг + per-user opt-out.
- Single-writer (in-process route, `TELEGRAM_P7_DECISION §1`) — как весь P7.

## 2. Детерминированная политика нуджа (skeleton)

Sweep (15-мин tick, DB-health guard) → для каждого пользователя с активной Telegram-связкой:
```
shouldNudge(user, nowMs) → { send:false, reason:'<skip-code>' } | { send:true, reason:'<REASON>' }
  1. prefs.enabled && telegram_enabled                         иначе skip:disabled
  2. stillAuthorized (link active + consent tg-v1 granted)     иначе skip:no-consent
  3. локальное время (tz) В окне доставки И вне quiet hours     иначе skip:outside-window
  4. кросс-канальный суточный cap не исчерпан (push+бот)        иначе skip:budget
  5. backoff: now >= next_eligible_at                          иначе skip:backoff
  6. РЕАЛЬНАЯ причина есть (см. reason enum ниже)              иначе skip:nothing
  → send с детерминированным reason-кодом
```
**Reason enum (детерминированный, → канон-текст, как selector select_reason):**
- `DUE_READY` — есть due-items (базовый honest сценарий, P7.3b).
- `RETURN_AFTER_GAP` — due + давно не занимался (реактивация).
- `SKILL_GAP_AVAILABLE` (P7.3d) — среди due есть flagship-годные (reading-strong+never-dictated —
  сигнал от P7.2d selector) → «есть слова для проверки на слух» (БЕЗ раскрытия слова).
Причина «нечего тренировать» (нет due / нет честной модальности) → НЕ слать (skip:nothing).

## 3. Стадирование (owner-брифом, grounded)

- **P7.3a — Preferences + scheduler foundation.** Миграция `notification_preferences` (единый
  кросс-канальный бюджет: enabled, telegram_enabled, timezone, quiet_start/end local, window,
  max_per_day, min_gap, mode?) + миграция `nudge_ledger` (dedup nudge-id + backoff-состояние:
  last_nudge_at, consecutive_ignored, next_eligible_at) + `notificationPrefsRepo` + `nudgeRepo.
  runNudgeSweep` (политика §2, consent-recheck, dedup, honest-count) + scheduler-tick (клон
  `server.js:2120`). За флагом `AGENT_NUDGE_ENABLED` (деф. OFF). Гейт независимый.
- **P7.3b — Due nudge.** Первый честный send: `DUE_READY` → одно краткое сообщение (класс A,
  count-only) + путь начать /review. Гейт: число == due-кольцу.
- **P7.3c — Adaptive backoff.** Игнор (нет /review в N ч после нуджа) → next_eligible_at дальше;
  несколько игноров → реже; долгий gap → `RETURN_AFTER_GAP` мягко / пауза. Кнопки отложить/не сегодня.
- **P7.3d — Premium reason-aware.** `SKILL_GAP_AVAILABLE` через selector-сигнал; разные типы возврата;
  детерминированные канон-тексты (ru/en). БЕЗ раскрытия ответов/форм.

## 4. Открытые форки (owner решает — §5 вопросы)

1. **Кросс-канальный бюджет.** notification_preferences ЕДИНЫЙ (push+бот, общий суточный cap-ledger;
   web-push тоже читает → без двойного нуджа; канон-верно, но малая правка pushRepo) **[rec]** vs
   Telegram-only prefs сейчас (быстрее, риск двойного нуджа если оба канала активны).
2. **Action-кнопки.** Inline callback_query с самого начала (`[Начать][Напомнить вечером][Не сегодня]`
   — премиально, но greenfield webhook-surface + answerCallbackQuery + callback-dedup/consent-binding)
   vs текст+/review MVP сначала, кнопки — отдельным шагом **[rec: текст MVP, кнопки следом]** (snooze
   всё равно потребует callbacks в P7.3c).
3. **Первый инкремент.** P7.3a = plumbing + due-нудж send ЗА ФЛАГОМ (деф. OFF, есть что live-verify)
   **[rec]** vs строго-dormant 3a (нечего верифицировать) vs объединить 3a+3b.
4. **Окно доставки / tz-модель.** Once/day в начале предпочтённого окна (morning ~09:00 / evening
   ~19:00 local) + quiet hours **[rec]** vs непрерывно вне quiet hours; tz по умолчанию Asia/Jerusalem
   (owner), настраиваемый позже (команда/кнопки).

## 5. Гейт (независимый, с зубами)

`smoke:telegram-nudge`: сид профилей → assert shouldNudge == политике для: enabled/disabled ·
consent-revoked → не слать · quiet-hours/вне окна → не слать · due=0 → skip:nothing (не спам) · cap
исчерпан → skip:budget · backoff (недавний нудж/игнор) → skip · exactly-once (2 sweep-рана → 1 send) ·
класс-A (нудж без контента/ответа/формы) · honest-count == getDue · reason-код детерминирован. Плюс
регрессия (P7.2 наборы + web-push + pairing/content зелёные).

## 6. Дисциплина

Существенный дизайн → adversarial-критика в ФОНЕ (3 линзы R14-R15-security / R2-R5-UX / R11-R16) ДО
кода → owner-форки → код P7.3a → критика диффа → независимый гейт → регрессия → commit+push.

---

## АДЪЮДИКАЦИЯ (owner-форки + 3-линзовая критика wf_f60b0e58, 2026-07-08) — 3 BLOCKER, дизайн ПЕРЕСОБРАН

**Owner 2026-07-08:** (1) ЕДИНЫЙ кросс-канальный бюджет · (2) текст+/review MVP, кнопки следом · (3)
plumbing + due-нудж за флагом OFF · (4) once/day в начале окна + quiet hours, tz Asia/Jerusalem.

**Критика (3 линзы) → 3 BLOCKER + MAJOR-ы. Резолюции (ДО кода):**

- **[BLOCKER×2 exactly-once] send-vs-mark + рестарт-дубль.** pushRepo шлёт ПОТОМ маркирует (для web-push
  ок); для нуджа рестарт между send и mark → ДВОЙНОЙ нудж. **РЕЗОЛ: claim-BEFORE-send** — INSERT OR
  IGNORE в `nudge_ledger (user_id, local_day)`; `changes===1` ⇒ звать sendMessage; иначе skip. Принимаем
  **at-most-once** (редкий потерянный нудж честнее дубля для премиум-канала — owner-инвариант «не
  спамить»). **Single-flight** guard на sweep (setInterval + admin-force не входят одновременно). Гейт:
  2 sweep→1 send · краш-после-claim→НЕ пере-шлёт.
- **[BLOCKER GDPR] delete/export структурны по колонке `user_id`** (identityRepo.js:135-146
  listUserScopedTables). **РЕЗОЛ: ОБЕ таблицы — first-class `user_id`** (notification_preferences PK
  user_id; nudge_ledger user_id-колонка) → авто-покрыты sweep'ом. Гейт: deleteUserData → countUserRows==0
  на сид prefs+ledger. tz/quiet = класс A (user-provided).
- **[BLOCKER кросс-канал day-key] push=UTC-day-per-subscription, нудж=local-day-per-user → общий cap не
  дедупит.** **РЕЗОЛ: ЕДИНЫЙ ключ = `local_day` пользователя (по tz)** для ОБОИХ каналов. `nudge_ledger
  (user_id, local_day)` UNIQUE — кто первый (push ИЛИ бот) claim'ит день, второй видит row → skip. pushRepo
  claim-before-send в ТОТ ЖЕ ledger (аддитивно: пустой ledger → push claim'ит → шлёт → web-push-smoke
  зелён). Гранулярность = НУДЖ-СОБЫТИЕ (1/local_day суммарно); push всё ещё веерит на все устройства как
  ОДНО событие (claim до веера). web-push-smoke +кейс «telegram claim'ил → push skip:budget».
- **[MAJOR sweep authorize тавтология] stillAuthorized cross-check вырождается** (нет входящего update →
  tgUserId/chatId из самого link). **РЕЗОЛ: `authorizeForSweep(userId)` = active link + telegramConsentActive
  (tg-v1); chatId из link; chatId IS NULL → skip (не слать в null).** Re-check НЕПОСРЕДСТВЕННО перед
  send (per-user в цикле, revoke mid-sweep не течёт).
- **[BLOCKER R2 backoff Telegram-myopic] «нет /review в N ч» ≠ неактивность** (Зал/PWA кормят review_log
  кросс-поверхностно). **РЕЗОЛ: engagement ВЫВОДИТСЯ из review_log** (есть review reviewed_at >
  last_nudge_at ЛЮБОГО канала ⇒ ENGAGED → без backoff/RETURN_AFTER_GAP). **Единственный писатель
  nudge_ledger = sweep**; engaged/ignored — derived (не webhook-писатель → нет two-writer гонки).
  (Backoff сам = P7.3c; принцип фиксируем сейчас.)
- **[MAJOR dedup-key + reason]** ключ = `(user_id, local_day)`; reason = детерминированный **priority-pick**
  (SKILL_GAP > RETURN_AFTER_GAP > DUE_READY), decoupled от ключа. Multi-reason день → 1 send.
- **[MAJOR revoke не чистит ledger]** revokeTelegramCascade/unlink → **очистить nudge_ledger** юзера в
  той же txn (backoff не переживает re-pair); prefs (tz/enabled) — оставить. Гейт: unlink→re-pair→не
  suppress'ед.
- **[MAJOR in-channel opt-out]** нет способа отключить нудж ИЗ Telegram (webhook без callback; кнопки
  отложены). **РЕЗОЛ: текст-команды `/stop` `/resume` (P7.3a)** → notification_preferences.telegram_enabled.
  Snooze = `/mute [дней]` / `/notoday` текстом (P7.3c, ForceReply-токены как NOT_NOW), БЕЗ callbacks.
- **[MAJOR honest-count гейт тавтологичен]** (getDue дважды). **РЕЗОЛ: independent-oracle** — гейт
  КОНСТРУИРУЕТ due-состояние (K by construction) → assert нудж показывает K. Прод: N as-of-send-time.
- **[MAJOR tz/DST/quiet-wrap]** **РЕЗОЛ: Intl.DateTimeFormat({timeZone})** local-час+local_day (DST-safe);
  валидация tz на write + fallback Asia/Jerusalem; per-user try/catch в sweep (битый профиль → skip, не
  падение всего sweep — silent_batch_partial_failure); quiet круговой: `start<=end ? start<=h<end :
  h>=start||h<end`.
- **[MINOR fail-closed]** prefs/consent read-error → skip (не слать). Missing prefs-row → enabled
  (pairing-consent покрывает «напоминания»); opt-out = явный enabled=false (durable).
- **[MAJOR SKILL_GAP over-claim] (P7.3d)** «на слух» считать ТЕМ ЖЕ dictateEligible (base+hasAsset+
  homophone+!history), что selector, иначе нейтральная копия. Гейт reason↔selector. **[MAJOR
  RETURN_AFTER_GAP guilt] (P7.3c/d)** подавить сырое N, запретить streak/«пропустил»-копию.

### Финальный объём P7.3a (folded 3a + минимальный DUE_READY-send, за `AGENT_NUDGE_ENABLED`=OFF)
migration `notification_preferences`(user_id PK, enabled, telegram_enabled, timezone, quiet_start_local,
quiet_end_local, window, ...) + `nudge_ledger`(user_id, local_day UNIQUE, last_nudge_at, reason,
consecutive_ignored) · `lib/localtime` (Intl DST-safe: localHour/localDay/inQuiet-wrap) ·
`notificationPrefsRepo` (get+defaults, set, /stop//resume, fail-closed) · `nudgeRepo.runNudgeSweep`
(single-flight, per-user try/catch, authorizeForSweep, окно+quiet, claim-before-send в общий ledger,
DUE_READY honest count, verb-only log, флаг) · `pushRepo` claim общий ledger before send · scheduler-tick
(клон server.js:2120) · `/stop`/`/resume` в router+TG_CONTENT_CMDS · revoke-cascade чистит ledger ·
GDPR user_id-колонки · гейт `smoke:telegram-nudge` (independent) + web-push кросс-канал кейс.
**Отложено:** backoff (3c) · reason-diversity/SKILL_GAP (3d) · inline-кнопки (полная callback-security-
секция ДО их выхода: from.id→link binding, private-only, per-from rate, update_id dedup, message_id
binding, consent recheck, answerCallbackQuery).

---

## ДИФФ-КРИТИКА (3 линзы wf_858259da, 2026-07-08) — NO BLOCKER; push-LIVE-gaps исправлены ДО коммита

claim-before-send ядро · GDPR user_id-колонки · DST-Intl · quiet-wrap · fail-closed prefs · revoke→ledger
во всех 3 путях — ВЕРНО реализованы. Главная тема: **push жив на проде (не за флагом), но был недо-
интегрирован с новыми prefs и НЕ покрыт гейтом.** Исправлено:

- **[MAJOR push half-config] push читал enabled+tz, но ИГНОРИРОВАЛ quiet/window** (единственный live-канал
  слал бы в quiet-hours/чужой tz; позже push claim'ил бы день вне окна и глушил корректно-таймированный
  Telegram). **ФИКС:** pushRepo чтит `LT.windowOpen(localHour, window, quiet)` как бот (fixed PUSH_HOUR_UTC
  → фактически morning-window; evening/quiet/чужой-tz → skip). Единый prefs-контракт для обоих каналов.
- **[MAJOR push untested] cross-channel/fail-closed push-ветка без гейта** (getPrefs-throw → все push молча
  стоп; claim только в одну сторону). **ФИКС:** web-push-smoke 15→**20** (реальный runPushSweep claim'ит
  общий ledger · Telegram-claim блокирует push · prefs.enabled=0 гасит push). Отдельный счётчик
  `prefsErr` (не `budget`) — оператор различает «Telegram занял день» vs «prefs-чтение упало»
  (silent_empty_vs_real_empty).
- **[MAJOR /stop fail-open] setTelegramEnabled в phase-2 best-effort** → транзиентный сбой молча терял
  durable opt-out (нудж продолжался). **ФИКС:** запись `setTelegramEnabledTxn(db,…)` ВНУТРИ webhook-txn
  (phase-1) — атомарно с dedup; сбой → rollback → Telegram переиграет. Роутер остаётся transitive-read-only
  (пишет server.js-обёртка, не роутер; pairing-гейт 33/33 цел).
- **[MINOR aborted-send жёг бюджет] claim был ДО auth2-recheck** → revoke между claim и send сжигал кросс-
  канальный день (push тоже молчал). **ФИКС:** порядок → auth2-recheck → claim → send (аборт не занимает
  день). Send-fail ПОСЛЕ claim → at-most-once (claim остаётся; гейт-кейс FAILU→500).
- **[MINOR bounded window] windowOpen без верхней границы** → «утренний» нудж после mid-day рестарта мог
  уйти в 21:59. **ФИКС:** окна [9,12)/[19,22); поздний first-tick откладывается на след. день.
- **[MINOR max_per_day dead knob]** колонка нормализовалась, но cap захардкожен ключом PK(user,local_day).
  **ФИКС:** убрана из миграции/prefs (не выставлять ложно-настраиваемое).
- **[MINOR getDue-cost]** getDue звался ДО claim каждый tick весь день у нуджнутого юзера. **ФИКС:** дешёвый
  `claimedToday` PK-SELECT короткозамыкает до getDue. **[MINOR dead code]** `clearForUser` убран (revoke
  инлайнит DELETE). **[MINOR force]** документирован force-TICK (не force-resend; ручной re-verify push =
  /api/push/test, не claim'ит).
- **[deferred, документировано]** honest count cap=500 (как web-push; owner-scale, N as-of-send) · send-fail
  retry = at-most-once (owner-выбор «потерянный нудж честнее дубля») · DST-winter + after-window + send-fail
  теперь в гейте (nudge 31→**37**).

**Гейты после фиксов (14):** telegram-nudge **37/37** · web-push **20/20** · pairing 33 · content 15 ·
review 32 · cloze 21 · dictate 30 · selector 25 · grade-policy 28 · server-keying 24 · memory-canon 63 ·
learner-graph 14 · agent-review 66.
