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

---

# CLG-P7.1b — read-only content-команды (/plan /explain /due /summary) (спека, к критике)

> Продолжение P7.1a (owner brief 2026-07-07). P7.1a дал безопасный канал; P7.1b передаёт через
> него ПОЛЕЗНЫЙ mentor-контент из УЖЕ готовых серверных контуров (P6 /plan, P6.2/P9 /explain,
> P5 /due, P9 /api/agent/constructs/summary) — БЕЗ Telegram-специфичной агрегации. Строго
> read-only: бот НЕ пишет учебную память, /due показывает но не запускает review (grade = P7.2).
> Webhook УЖЕ live на проде (owner live-verified P7.1a) → деплой P7.1b сразу включает команды.

## Скоуп P7.1b

Четыре read-only команды в боте. **Вне скоупа:** /review + challenge-binding + запись grade
(P7.2) · production-каналы · проактивные нуджи (P7.3) · генерация СВЕЖЕГО объяснения предложения
по якорю (нужен agent_read_texts + LLM + sentence-anchor — /explain здесь = purge-aware ЛЕНТА
готовых объяснений P9, не новое). Флаг AGENT_REVIEW_WRITE НЕ трогается (он про запись P7.2).

## 1. Архитектура: gate-in-txn, produce-out-of-txn

**Проблема:** /plan вызывает LLM (секунды) + пишет ledger/agent_task через СВОЙ withTxnLock →
внутри webhook-processUpdateTxn (держит BEGIN + txnLock) это (а) заблокировало бы все прочие
записи на секунды, (б) вложило бы withTxnLock → дедлок. И роутер обязан остаться транзитивно
read-only (критика P7.1a: import runtime→tools→reviewer ломает structural-ассерт).

**Решение — разделение фаз:**
- **Роутер (в txn, transitive-read-only):** для content-команды делает ГЕЙТ (read-only):
  active link по tg_user + telegramConsentActive(userId) + private-chat (webhook уже отфильтровал).
  Пройдено → возвращает дескриптор `{kind:'content', command, userId, tgUserId, chatId}` и НЕ
  производит контент; logBotAction(command, 'ok'). Провал → reply-текст («не связано» / «канал
  отключён») + log('rejected'). Роутер импортит ТОЛЬКО channelLinkRepo (+ helper
  telegramConsentActive) — transitive-read-only ассерт держится.
- **server.js webhook-handler (ВНЕ txn, после COMMIT):** если result.kind==='content' →
  `telegramContent.produce({command, userId, tgUserId, chatId})` → format → send частями.
  telegramContent.js импортит server.js (у него write-path уже есть) — НЕ роутер, ассерт цел.

## 2. `agent/telegram/content.js` — производитель контента (вне txn)

**АВТОРИТЕТНАЯ live-перепроверка на КАЖДОЙ команде в точке отдачи** (owner: pairing ≠ вечное
право; consent мог отозваться в окне между txn-гейтом и produce): `produce()` ПЕРВЫМ делом
заново читает getActiveLinkByTg(tgUserId) === active И telegramConsentActive(userId) И
link.user_id===userId И link.telegram_chat_id совпадает; ЛЮБОЙ провал → `{text: «Канал отключён —
подключите заново на сайте», served:false}`, контент НЕ производится (fail-closed).

Производители (из готовых контуров; provenance/id НЕ уходят):
- **/plan** → `agentRuntime.plan({userId, deviceId:null})` (тот же контракт, LLM-или-fallback,
  ledger/task как в вебе) → секции: title (ru/en по profile.language) + леммы
  (displayForItemKey, НЕ item_key) + est_minutes; LLM-проза если llm_used; construct-титулы.
- **/due** → `learnerGraphRepo.getDue(userId,{limit:20})` → «К повторению: N» + леммы
  (displayForItemKey). ЧТЕНИЕ — 0 записей (id-хвост review_log неизменен, гейт-ассерт).
- **/summary** → `agentRuntime.constructsSummary({userId})` (тот же /api/agent/constructs/summary:
  ⊆ registry, серверные титулы, purge-aware по построению) → титулы + счётчики.
- **/explain** → `agentRuntime.listExplanations({userId},{limit:5})` — P9 purge-aware ЛЕНТА:
  purged-строки отдаются как «(очищено по отзыву согласия)» БЕЗ контента (tombstone честный);
  живые → якорь + текст. **Purge-aware:** после revoke agent_read_texts контент уже занулён в
  БД (P6.2 purge-hook) → listExplanations его не несёт → бот физически не может показать старое.

## 3. `agent/telegram/format.js` — Telegram-safe форматирование

- **Plain-text, БЕЗ parse_mode** (sendMessage не ставит parse_mode) → Telegram трактует как
  текст → **экранирование Markdown/HTML НЕ требуется** (нет активной разметки; сырой `_*[]` —
  безопасны как текст). Это закрывает «экранирование» структурно, а не заплаткой.
- **Лимит 4096:** splitMessage(text) → массив частей ≤4096 на границах строк (длинный ответ —
  несколько sendMessage; api.sendMessage доп. slice(4096) — второй предохранитель).
- **Без сырых внутренних id:** форматтеры берут ТОЛЬКО user-facing поля (леммы/титулы/счётчики);
  displayForItemKey-фолбэк «pid:N»/«…#pos» → показать лемма-часть или скрыть, никогда сырой ключ
  (гейт-ассерт: в исходящем тексте нет 'pid:', 'item_key', '#noun', 'policy_version', 'provenance').
- **Без debug/provenance:** ни одно поле meta/provenance/policy/raw_grade не форматируется.
- **Стабильность при повторном update_id:** dedup P7.1a (update_id в txn) → повтор не
  перепроизводит (нет двойного LLM/двойного ответа); content-produce ВНЕ txn best-effort —
  сбой produce после dedup-commit = потеря ответа (пользователь повторит команду вручную;
  для read-only это приемлемо, задокументировано — в отличие от account-команд, атомарных).

## 4. Живая перепроверка consent — helper

`channelLinkRepo.telegramConsentActive(db, userId)` — читает ПОСЛЕДНЮЮ consent_records строку
key='telegram_delivery' (granted). Роутер (в txn) и content.produce (вне txn, свежий read) оба
её зовут. revoke consent (P7.1a) уже гасит связку атомарно → и link, и consent falsy → двойной
барьер. Owner-инвариант «прекратить отдавать контент СРАЗУ, без ожидания новой сессии» —
обеспечен produce-time recheck (не кэшируется, не по сессии).

## 5. Гейт `smoke:telegram-content`

Расширяет stub: локальный Telegram-stub ЗАПИСЫВАЕТ тело sendMessage ({chat_id, text}) в файл →
гейт ассертит НА ТЕКСТЕ (иначе «контент отдан» недоказуемо). Кейсы:
- link+consent → /plan /due /summary /explain: бот отвечает непустым контентом (текст в stub),
  релевантным (леммы/титулы присутствуют);
- **live consent recheck:** revoke telegram_delivery → /plan → produce.served=false, текст
  «канал отключён», НЕ план (даже если link ещё миг active — produce-recheck ловит);
- **purge-aware /explain:** создать объяснение → revoke agent_read_texts (purge) → /explain →
  контент purged-строки НЕ в тексте (только «очищено»);
- **read-only:** /due /plan /summary /explain → id-хвост review_log (2 юзера) БАЙТ-неизменен;
- **no raw ids / no provenance:** исходящий текст всех команд НЕ содержит 'pid:'/'item_key'/
  '#noun'/'policy_version'/'provenance'/'facts_used'/'raw_grade';
- **splitting:** искусственно длинный /plan (много секций) → >1 sendMessage, каждый ≤4096;
- **redelivery:** тот же update_id повторно → 0 доп. sendMessage (dedup);
- **not-linked:** content-команда от непривязанного tg → «подключите на сайте», 0 контента;
- **транзитивный read-only СОХРАНЁН:** require-граф router.js по-прежнему НЕ достигает
  reviewer/tools/llm (content.js — отдельный модуль, импортит server, не router).
- Регрессия: smoke:telegram-pairing (не сломан) · agent-plan/mentor-home/agent-review/auth/api.

## Развилки для критики

(а) content-produce вне txn best-effort — приемлема ли потеря ответа при сбое produce (read-only,
ручной повтор) vs нужна ли атомарность; (б) /plan в боте тратит LLM-бюджет пользователя — ок для
MVP? (owner: reuse /plan-контракт — да); (в) двойной consent-recheck (txn-гейт + produce) — нет ли
окна, где txn-гейт прошёл, а produce отдал после revoke (produce-recheck закрывает); (г) leading
через getActiveLinkByTg вне txn — консистентность с только что закоммиченным link; (д)
displayForItemKey на pid-ключах в боте тянет 306MB-бандл — латентность/RAM (P7.2-заметка,
сайдкар отложен).

---

## P7.1b v2 — адъюдикация критики wf_72c44361 (2 BLOCKER + 5 MAJOR + 8 MINOR)

- **[C] BLOCKER `/explain` обходил agent_read_texts** (2 линзы): лента объяснений несёт
  sentence_he/text (класс C — предложения пользователя), а produce-recheck чекал ТОЛЬКО
  telegram_delivery; при best-effort провале purge (server.js:1522 revoke устаивает при provале
  purge) старый контент уехал бы в Telegram после отзыва agent_read_texts. **Фикс:** /explain
  требует ЖИВОЙ agent_read_texts (последняя consent-строка granted) fail-closed — off → контент
  НЕ включается (только «доступ к текстам отключён»), НЕЗАВИСИМО от purge; delivery-recheck тоже
  включает agent_read_texts. telegram_delivery ≠ авторизация на вынос класс-C текста.
- **[C] BLOCKER recheck на СТАРТЕ produce, не в точке доставки** (harness+consent): для /plan
  LLM думает секунды; revoke telegram_delivery/unlink в окно produce-start→send → план уходит
  после отзыва. **Фикс:** `content.serve` перепроверяет (active link + telegram_delivery
  [+ agent_read_texts для /explain] + link.user_id/chat совпадают) НЕПОСРЕДСТВЕННО ПОСЛЕ produce,
  перед возвратом частей на отправку; провал → части НЕ отдаются, вместо них refusal. Закрывает
  и LLM-окно /plan, и /explain-контент.
- **[C] MAJOR /plan не «read-only» по side-effect** (2 линзы): agentRuntime.plan резервирует LLM
  ($) + createTask ДО отправки; сбой send → ручной повтор → двойной расход + дубль plan-task
  (портит constructsSummary.from_plans). **Фикс:** (1) формулировка — «read-only w.r.t. учебной
  памяти (review_log нетронут)»; /plan несёт ТЕ ЖЕ ledger/task side-effects, что веб-/plan
  (двойной клик в вебе двоит так же — консистентно, приемлемо MVP); (2) produce ВНЕ txn обёрнут
  в СВОЙ try/catch → всегда 200 (best-effort, НЕ retry-шторм; 500 — ТОЛЬКО для сбоя внутри
  processUpdateTxn где rollback реально снимает dedup); (3) **тайтовый per-command cap** для
  content-команд (деф. 6/мин на from.id, отдельно от generic 30/мин) → drop-with-200.
  Per-update_id идемпотентность /plan — отложенное усиление (P7.2), задокументировано.
- **[C] MAJOR гейт-denylist неполон** (harness): контуры отдают sentence_id/anchor.text_key/
  'ae_'/'at_'/rid/provider/model/scope_level/construct-id — форматтер обязан их НЕ выводить
  (никакого JSON.stringify объекта; явный pick user-facing полей). **Фикс:** форматтер строит
  текст из белого списка полей; denylist гейта расширен (+ sentence_id/text_key/'ae_'/'at_'/
  provider/model/scope_level/construct:); гейт СИДИТ leak-capable вывод (due-строка с #pos-ключом,
  due-строка с неразрешимым pid:N, живое объяснение с anchor+provider) — ассерты не тавтологичны.
- **[C] MAJOR нет тайтового cap на LLM-дорогой /plan** — см. выше (per-command cap 6/мин).
- **[C] MINOR displayForItemKey фолбэк 'pid:N'/сырой ключ** → форматтер трактует результат,
  совпадающий с item_key ИЛИ матчащий /^pid:/, как «скрыть лемму»; гейт-фикстура с неразрешимым pid.
- **[C] MINOR splitMessage только по \n** → одна строка >4096 молча трункируется api.slice.
  **Фикс:** splitMessage ЖЁСТКО режет любой сегмент >4096 по символьной границе; гейт: строка
  >4096 → конкатенация частей == источник (ничего не потеряно).
- **[C] MINOR смешанный язык** → format.js принимает profile.language (из agent_profiles),
  ru/en для всех wrapper-меток/tombstone/refusal.
- **[C] MINOR stale /help** → HELP обновлён (перечисляет /plan /explain /due /summary); гейт:
  /help НЕ содержит «следующем обновлении».
- **[C] MINOR telegramConsentActive версия** → требует granted И version===TELEGRAM_CONSENT_VERSION.
- **[C] MINOR /summary purge-aware уточнение** → explanation-источник гейтится живым
  agent_read_texts; plan-источник (класс A из review_log) переживает revoke ОСОЗНАННО
  (не текст пользователя — реестровые диагностики). Формулировка спеки уточнена.

**Гейт smoke:telegram-content v2** (все [C] выше + база §5): seed leak-capable вывод ·
расширенный denylist на реальном тексте · delivery-point recheck (revoke → не доставлено) ·
/explain agent_read_texts fail-closed (off → без контента, даже если purge не отработал) ·
>4096-строка не теряется · /help свежий · per-command cap · транзитивный read-only сохранён.
