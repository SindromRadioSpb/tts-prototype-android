# CLG-P7.1a — Telegram channel security + pairing + account-команды (спека v2, к коду)

> Канон-решения: `TELEGRAM_P7_DECISION_2026_07_06.md` (webhook in-process MVP · отдельный
> telegram-consent · bot_action_log-lite + ОБЯЗАТЕЛЬНЫЙ update_id dedup · command-response only).
> Readiness: `TELEGRAM_P7_READINESS_2026_07_06.md` §5 (**двусторонний confirm, привязан к
> веб-сессии** — восстановлено в v2). Заземление: миграции `.sql` (последняя 026); токены =
> `crypto.randomBytes` + `sha256Hex` (хранить ТОЛЬКО хэш) + `timingSafeEqual` (identityRepo.js);
> consent = append-only `consent_records`; все user_id-таблицы авто export/delete sweep;
> общий SQLite-коннект → многооператорная запись ТОЛЬКО под `withTxnLock` (identityRepo.js:170,
> learnerLogRepo.js:205). Гейт против ЗАМОКАННЫХ апдейтов + локального Telegram-stub; живой
> бот-токен — ТОЛЬКО для owner live-verify.
>
> **v2 = адъюдикация критики wf_a67874c5 (2 BLOCKER + 11 MAJOR + 4 MINOR).** Изменения от v1
> помечены `[C]`.

## Скоуп P7.1a (строго)

Telegram как **безопасный внешний read-only канал**: связка аккаунта + account-команды.
**НЕ входит:** запись review_log · grade · production · /review · content-команды
(/plan /explain /due /summary = P7.1b) · проактивные нуджи (P7.3). Бот НИЧЕГО не пишет в
учебную память. R17-гейт 2 (no-free-chat): бот отвечает ТОЛЬКО на известные команды, без LLM.

## 1. Миграция `027_telegram_channels.sql`

**`channel_links`** (класс A; user_id → авто export/delete sweep):
```
id TEXT PK · user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ·
channel TEXT NOT NULL DEFAULT 'telegram' · telegram_user_id TEXT · telegram_chat_id TEXT ·
status TEXT NOT NULL DEFAULT 'pending'   ([C] pending|active|revoked) ·
consent_version TEXT · last_update_id INTEGER ·
created_at · confirmed_at TEXT · revoked_at TEXT
```
- **partial-UNIQUE `(channel, telegram_user_id) WHERE status='active'`** — telegram-аккаунт
  активно связан не более чем с одним user (анти-hijack);
- **partial-UNIQUE `(user_id, channel) WHERE status='active'`** — один user = одна активная связка;
- [C] `CHECK(status!='active' OR telegram_user_id IS NOT NULL)` — активная связка обязана нести
  tg_user (иначе NULL-lookup мог бы «совпасть» — MINOR-находка);
- pending-строки НЕ уникальны (несколько попыток допустимы; уникальность только на active).

**`channel_pairing_tokens`** (одноразовые, TTL, хэш; [C] привязаны к веб-сессии минтера):
```
token_hash TEXT PK  (sha256 сырого токена; сам токен НЕ хранится) ·
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE · channel TEXT DEFAULT 'telegram' ·
session_id TEXT   ([C] сессия, минтившая токен — двусторонность) ·
created_at · expires_at TEXT NOT NULL · consumed_at TEXT · consumed_by_tg TEXT
```
- сырой токен = `crypto.randomBytes(24).toString('hex')` = **192 бита**; TTL 15 мин; single-use.

**`telegram_updates`** ([C] dedup, БЕЗ PII):
```
update_id INTEGER PK · received_at TEXT NOT NULL
```
- НЕ несёт chat_id/user_id (update_id — глобальная последовательность бота; PII здесь = R15-риск).
- [C] **осознанное исключение из user_id-sweep** — БЕЗ PII, TTL-prune реальным триггером (§6).

**`bot_action_log`** (журнал; [C] идентификаторы, НИКОГДА сырой токен/текст):
```
id INTEGER PK AUTOINCREMENT · user_id TEXT REFERENCES users(id) ON DELETE CASCADE  (nullable) ·
channel TEXT DEFAULT 'telegram' · telegram_update_id INTEGER · telegram_chat_id TEXT ·
command TEXT   ([C] ТОЛЬКО глагол: 'start'|'confirm'|'status'|… — аргумент-токен вырезан) ·
status TEXT  (ok|error|ignored|unlinked|rejected|pending) · error_code TEXT ·
linked_review_event_id TEXT  (P7.2) · created_at
```

## 2. Env / secrets (ops владельца — только live-verify)

- `TELEGRAM_BOT_TOKEN` — @BotFather (@LinguistProMentorBot); ЕДИНСТВЕННО для outbound sendMessage;
  нет → webhook принимает/логирует, не отвечает (честно `BOT_TOKEN_MISSING`, гейт ассертит моком).
- `TELEGRAM_WEBHOOK_SECRET` — bearer для `X-Telegram-Bot-Api-Secret-Token`; strict-без-фолбэка
  (нет → webhook 503 fail-closed, как AUTH_BOOTSTRAP_SECRET).
- `TELEGRAM_BOT_USERNAME` — deep-link (деф. 'LinguistProMentorBot').
- [C] `TELEGRAM_API_BASE` — деф. `https://api.telegram.org`; гейт указывает на локальный stub
  (мок sendMessage через fetch — Module-шим не ловит fetch, находка харнесса).

## 3. Pairing — [C] ДВУСТОРОННИЙ confirm, web-initiated (восстановлено, readiness §5)

Дефекты v1 (confused-deputy + consent-bypass) устранены СТРУКТУРНО порядком «consent на веб-стороне
ДО токена» + «связка active только после telegram-side /confirm»:

1. **Web `POST /api/agent/telegram/pair`** (session+CSRF, лимитер):
   (a) [C] записать consent `telegram_delivery` В ТОЙ ЖЕ транзакции ([C] version — СЕРВЕРНАЯ
   константа `TELEGRAM_CONSENT_VERSION='tg-v1'`, клиентская version игнорируется); нет намерения
   согласиться → 400 (consent — часть запроса pair, не отдельный молчаливый шаг);
   (b) revoke прежних неиспользованных токенов user (одна живая попытка);
   (c) минт токена (192 бита), хранит sha256 + `session_id` минтера; вернуть `{ deep_link,
   expires_at }` (сырой токен ТОЛЬКО в deep_link, в БД его нет).
2. Пользователь открывает `https://t.me/<bot>?start=<token>` → бот получает `/start <token>` от
   **верифицированного from T** (webhook secret прошёл) → resolve token→user_id U (по хэшу) →
   создать **PENDING** channel_link (U↔T, telegram_user_id/chat_id ИЗ from) + consume токен
   (атомарно, §4) → бот отвечает **описанием аккаунта U** (display_name/маска) + «/confirm чтобы
   привязать · /cancel». [C] Именно telegram-сторона видит, к какому аккаунту привязывается, и
   подтверждает — это и есть вторая сторона (жертва confused-deputy увидит ЧУЖОЙ аккаунт → /cancel).
3. Telegram `/confirm` → [C] анти-hijack ПРОВЕРКИ ЗДЕСЬ (tg уже active в другом user → reject;
   U уже active → reject) → status='active', confirmed_at, consent_version проставлен. `/cancel`
   или TTL → pending дропается. [C] Веб mentor-home показывает pending + маску telegram.
4. **`GET /api/agent/telegram/status`** (session) — { linked, telegram_user_masked, pending?,
   consent, since }; [C] одна истина связки с ботовым /status (cross-surface гейт).
5. **`POST /api/agent/telegram/unlink`** (session+CSRF) — revoke активной связки user (веб).

**Почему confused-deputy закрыт:** attacker минтит токен на СВОЁМ аккаунте A → жертва V
открывает deep-link → бот: «привязать к аккаунту **A**?» → V видит чужой аккаунт → /cancel.
Молчаливой привязки нет (v1-дыра). **Почему consent-bypass закрыт:** consent пишется на
веб-стороне ДО токена в одной транзакции; revoke (§6) атомарно гасит и pending, и токены →
активная связка не может пережить отзыв.

## 4. Webhook `POST /api/telegram/webhook` (in-process)

[C] **Порядок middleware (secret ДО парсинга тела — глобальный bodyParser НЕ применять):**
1. [C] путь `/api/telegram/webhook` ИСКЛЮЧЁН из глобального `bodyParser.json(10mb)`
   (`app.use((req,res,next)=> req.path===WEBHOOK ? next() : globalJson(...))`); нет env-секрета
   → 503 fail-closed;
2. [C] secret-middleware: `X-Telegram-Bot-Api-Secret-Token` timingSafeEqual (raw, БЕЗ чтения
   тела); mismatch/missing → **401 немедленно, тело НЕ парсится**;
3. [C] dedicated `express.json({limit:'256kb'})` ТОЛЬКО после секрета (апдейт Telegram мал);
4. [C] **вся обработка — в ОДНОЙ `withTxnLock` транзакции** (общий коннект; иначе nested BEGIN
   + 500 под конкурентным ingest): dedup `INSERT OR IGNORE telegram_updates(update_id)` +
   роутинг-эффект + bot_action_log — атомарно; changes==0 (dup) → COMMIT-ветка «уже обработано»
   без эффекта; **при сбое эффекта → ROLLBACK (включая dedup) → non-200 → Telegram переиграет**
   (at-least-once честен; [C] fix «at-most-once потеря /unlink/redeem» — dedup не отделён от
   эффекта);
5. [C] обрабатывать ТОЛЬКО `message` с `chat.type==='private'` и числовым `message.from.id`;
   edited/callback/channel/group/без-from → 200 ignored (fix «leak в группу» + «нет from.id»);
6. роутинг команды (первое слово lowercase, до '@botname'):
   - `/start <token>` → redeem→pending (§3.2); `/confirm` `/cancel` → §3.3; `/unlink` → revoke;
   - **прочие команды: user_id ТОЛЬКО из channel_links(active, tg_user)** — НИКОГДА из тела;
     не связан → «/link на сайте»;
   - `/status` `/help` → §6; неизвестное → короткая справка ([C] БЕЗ LLM — no-free-chat);
7. [C] outbound sendMessage — ТОЛЬКО на `telegram_chat_id` из активной/pending связки (не на
   произвольный incoming chat); токена нет → лог `BOT_TOKEN_MISSING`, 200;
8. [C] **rate-limit по from.id** (post-secret, post-parse), не по IP (весь трафик с IP Telegram);
   отдельный тайтовый cap на redeem/from.id; превышение → **drop-with-200 + лог** (не 429 —
   иначе self-DoS + retry-шторм); брутфорс токена держит энтропия (192 бита), не лимитер;
9. bot_action_log на каждый апдейт (verb-only command); last_update_id в связку.

## 5. Модули

- `db/channelLinkRepo.js` — прямой SQLite ПОД `withTxnLock`: mintPairingToken(user, session) ·
  redeemToken→pending (атомарный `UPDATE ... SET consumed_at WHERE consumed_at IS NULL AND
  expires_at>? ` + changes==1) · confirmLink (анти-hijack, партиал-unique catch→user-reply, НЕ
  500) · cancelPending · getActiveLink(tg_user) · getLinkForUser · unlink · dedupUpdate ·
  logBotAction(verb) · revokeTelegramConsentCascade(user) [atomic] · pruneOld.
- [C] `agent/telegram/router.js` — pure команда→{chat_id,text}: deps **ТОЛЬКО** channelLinkRepo +
  read-only learnerGraphRepo (P7.1b); **НЕ импортирует agent/runtime, agent/tools, reviewer,
  llm** (транзитивный require дотянулся бы до write-path+LLM — находка харнесса). Гейт: обход
  require-графа от router.js падает, если достижимы reviewer/tools/llm.
- `agent/telegram/api.js` — sendMessage(chat_id,text) через fetch к `TELEGRAM_API_BASE`;
  [C] пишет call-log (AGENT_TG_CALLLOG: chat_id-хэш+статус, НЕ текст) — гейт наблюдает вызовы.
- server.js — webhook (§4 pipeline) + `/api/agent/telegram/{pair,status,unlink,confirm?}`
  (session+CSRF). [C] confirm/cancel — только в боте (telegram-сторона); веб не может confirm
  чужую pending (двусторонность).

## 6. Privacy / GDPR (R14/R15)

- Класс A: telegram_user_id/chat_id (user-scoped, авто delete/export).
- **consent `telegram_delivery`** ([C] server-pinned version tg-v1; не склеен с agent_read_texts):
  pair fail-closed без него; [C] **revoke** (через /api/auth/consent granted=0) → **атомарный
  каскад в ОДНОЙ txn**: consent-строка + revoke всех active-связок + инвалидация pending + всех
  невыгашенных токенов user (fix fail-open «связка переживает revoke»); [C] P7.1b доставка
  ре-проверяет ЖИВОЙ consent, не только факт связки.
- [C] server.js consent-эндпоинт: добавить ветку `telegram_delivery` (сейчас только
  agent_read_texts) — каскад unlink атомарен, провал → revoke НЕ подтверждается (honest-fail).
- [C] **delete-completeness:** deleteUserData ДО каскада собирает telegram_chat_id/user_id из
  channel_links (вкл. revoked) → `DELETE FROM bot_action_log WHERE telegram_chat_id IN(...) OR
  user_id=?` (NULL-user строки этого chat тоже гибнут — fix R15-остаток); telegram_updates
  переживает (без PII). [C] export стрипает channel_pairing_tokens.token_hash (как user_sessions).
- [C] **prune-триггер РЕАЛЕН:** unref'd setInterval (образец push-sweep server.js) + admin-эндпоинт:
  telegram_updates >48ч, bot_action_log(user NULL) >N дней.
- PRIVACY.md-аддендум: telegram-канал, класс A/PII (chat_id), consent-копия, TTL журнала.

## 7. Гейт `smoke:telegram-pairing` ([C] «зубы» по критике)

- [C] **≥2 пользователя; id-хвост, НЕ counts** (урок P7.0c): снимок множества review_log id
  (per-user через /api/learner/log) ДО и ПОСЛЕ всего прогона → byte-равенство; отдельно: тело
  апдейта с чужим user_id не меняет ничей лог.
- [C] **secret-гейт с зубами:** >256kb с ПЛОХИМ секретом → 401 БЕЗ парсинга тела (spy на
  JSON.parse / ассерт лимита), не только «sendMessage 0»; нет env-секрета → 503.
- [C] **sendMessage наблюдаем реально:** сервер с мок-BOT_TOKEN + TELEGRAM_API_BASE→локальный
  stub; happy-path → call-log ровно 1 (ассерт «==1», не тавтологичный «0»); secret-fail → 0.
- **dedup:** тот же update_id дважды → второй без эффекта; [C] сбой эффекта → ROLLBACK dedup →
  ретрай переигрывает (симуляция).
- **pairing двусторонний happy-path:** pair (consent записан server-version) → deep-link → бот
  /start → PENDING (не active!) → бот показал аккаунт → /confirm → active; /status веб==бот.
- [C] **confused-deputy:** токен user A, redeem от tg жертвы → бот показывает аккаунт A → БЕЗ
  /confirm связки НЕТ; /cancel → pending дропнут, active не создан.
- **pairing без consent** → 400, токен НЕ выдан.
- **token single-use / TTL** (хирургия expires_at) → reject; **анти-hijack** на /confirm
  (tg уже active / user уже active) → reject + user-reply, не 500.
- [C] **consent revoke → атомарный каскад:** active-связка + pending + токены гибнут В ОДНОЙ txn;
  симуляция сбоя unlink → revoke НЕ подтверждён (fail-closed); последующие команды → «не связано».
- [C] **private-only:** /status из group chat_id → 200 ignored, состояние НЕ раскрыто в группу.
- [C] **read-only структурно ТРАНЗИТИВНО:** require-граф от router.js НЕ достигает reviewer/
  tools/llm/planner; неизвестная команда → 0 инстансов LLM-провайдера (call-log пуст).
- [C] **rate-limit from.id:** burst redeem с одного from.id → drop-with-200 (не 429), лог.
- [C] **delete-completeness:** после delete — 0 строк bot_action_log с chat_id/user_id
  удалённого (вкл. NULL-user), channel_links пуст; export содержит связку БЕЗ token_hash.
- **bot_action_log:** verb-only (сырой токен НЕ в БД/stdout/логах — ассерт substring).
- [C] **сопутствующее:** SW CACHE_VERSION-бамп (mentor-home.js меняется); новые роуты в
  test:api-smoke (401/403 без сессии/CSRF) + auth-smoke CSRF-матрица.

## 8. Вне скоупа P7.1a

Content-команды /plan /explain /due /summary (P7.1b — они ре-проверяют живой consent) · /review +
challenge-binding (P7.2) · проактивные нуджи (P7.3) · agent_threads/messages · inline/callback ·
QR (deep-link текстом) · ротация bot-токена в UI.

## Остаточные риски (задокументированы, не баги)

- [C] Двусторонний confirm защищает от confused-deputy через РАСПОЗНАВАНИЕ аккаунта telegram-
  стороной (жертва видит чужой descriptor → cancel). Для single-owner-продукта (сейчас) владелец
  свой аккаунт распознаёт тривиально; при многих юзерах descriptor должен быть человекочитаем
  (display_name + дата). Инверсия «код от бота вводится в веб-сессии» — ещё сильнее, но UX-тяжелее;
  оставлено как возможное усиление P7.2, если появятся реальные сторонние юзеры.
- Redeem от tg, уже имеющего pending с другим токеном — последний pending выигрывает (idempotent
  по (channel,tg_user) pending — переписывается).
