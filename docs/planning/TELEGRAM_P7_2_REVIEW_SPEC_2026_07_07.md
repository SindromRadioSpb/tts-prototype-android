# CLG-P7.2 — Telegram /review + challenge-binding (спека, к adversarial-критике)

> Owner brief 2026-07-07 (детальный). Последний Telegram-слайс: превращает бота из read-only
> (P7.1a/b) в учебный интерфейс, ПИШУЩИЙ в память — но ТОЛЬКО через challenge-binding. Запись
> через УЖЕ live-verified `record_review_answer` (P7.0c) + `agent/grader.js` (P7.0b) — НЕ новый
> writer. Privacy=A (сырой ответ не персистится). Флаг `AGENT_REVIEW_WRITE` включает ВЛАДЕЛЕЦ
> к контролируемому live-verify (порядок: реализовать → гейты → stub → deploy dormant → флаг ON →
> один реальный review → проверить review_log/projection/oracle/OPFS → annul при нужде).
>
> Заземление (2026-07-07): reviewer.js GRADE_ARGS={item_key,answer,skipped,channel,attempt_id} +
> PRODUCTION_CHANNEL_LOCKED (production dictate/reverse заблокированы в P7.0c до challenge-binding) +
> CHANNEL_RE рецептив-only; ingestBatch trustedAgentSource + attempt_id-идемпотентность;
> LemmaCanon.reviewId/annulId; grader.gradeAnswer 7 категорий; getDue (learnerGraphRepo).

## Скоуп P7.2

`/review` + ответ (текст / «Не знаю») + verdict. Challenge-binding как ЕДИНСТВЕННЫЙ мост к
production-записи. **Вне скоупа:** annul как пользовательская Telegram-команда (MVP = серверное/
операторское действие; гейт лишь ДОКАЗЫВАЕТ, что Telegram-created review аннулируется как P7.0c) ·
проактивность (P7.3) · Mini App (P8) · множественные параллельные review-сессии.

## 1. Миграция `028_agent_challenges.sql`

```
challenge_id  TEXT PRIMARY KEY
user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
telegram_user_id TEXT NOT NULL
telegram_chat_id TEXT NOT NULL
item_key      TEXT NOT NULL          -- СЕРВЕРНАЯ истина задания (не из Telegram)
review_mode   TEXT NOT NULL          -- channel: 'read:tg'|'dictate:tg'|'reverse:tg'
expected_form_id TEXT                 -- = item_key (сервер выводит expected из ключа, как P7.0c)
prompt_version TEXT NOT NULL DEFAULT 'p1'
status        TEXT NOT NULL DEFAULT 'active'   -- active|completed|expired|cancelled
telegram_update_id INTEGER            -- update, закрывший challenge (аудит)
created_at, expires_at TEXT NOT NULL, completed_at TEXT
```
- **partial-UNIQUE `(user_id) WHERE status='active'`** — не более ОДНОГО активного challenge на
  пользователя (owner: «/review создаёт только один активный challenge»); гонка конкурентного
  /review → SQLITE_CONSTRAINT → graceful «у вас уже есть активное задание».
- user_id-таблица → авто export/delete sweep (identityRepo §10).

## 2. Выбор задания (сервер — источник истины)

`startReview` берёт СЕРВЕРНЫЙ due item (learnerGraphRepo.getDue → первый due, status!=ignore).
review_mode: MVP по политике — production-канал `dictate:tg` для рецептивно-сильных слов (те же,
что D1 маркирует), иначе `read:tg` (рецептив). **Telegram НЕ выбирает item и НЕ присылает его
как доверенный параметр** — challenge создаётся сервером, item_key/mode/expected фиксируются в
строке challenge. expected_form = display-форма item_key (keyingService.displayForItemKey / skeleton
из '#'-ключа — тот же серверный вывод, что P7.0c reviewer). Нерезолвимый item → пропустить,
взять следующий (не создавать challenge с мусорным expected).

## 3. Flow

**Шаг 1 — `/review`** (webhook; как content-команда, но создаёт challenge):
gate: private (webhook отфильтровал) · active link · ЖИВОЙ telegram_delivery consent ·
**AGENT_REVIEW_WRITE on** (флаг off → «тренировка через бота пока недоступна» — честно; смысла в
challenge без права записи нет) · нет конфликтующего active challenge (есть → показать ЕГО prompt,
идемпотентно) · есть due item (нет → «на сегодня повторять нечего»). Создать challenge (TTL 10 мин)
→ отправить prompt + reply-keyboard-кнопку «Не знаю».

**Шаг 2 — ответ** (webhook; текст ИЛИ «Не знаю»):
роутер: если у tg-пользователя есть ACTIVE challenge И текст НЕ команда (или /skip или текст
«Не знаю») → дескриптор `{kind:'review-answer', ...}`; server.js вне txn → `review.submitAnswer`.
skipped = (текст==="Не знаю" ИЛИ /skip). Резолв challenge по (user_id, telegram_user_id,
telegram_chat_id, status active). Нет/истёк → «нет активного задания» / «задание истекло».

**Шаг 3 — attempt_id + идемпотентность:**
`attempt_id = LemmaCanon.sha1Hex(challenge_id + '|' + telegram_update_id).slice(0,32)` —
детерминирован по (challenge, update). Повтор webhook (тот же update) → тот же attempt_id →
record_review_answer replay → второго grade НЕТ. Соединяет transport-dedup (telegram_updates
P7.1a) и ledger-идемпотентность (P7.0c attempt_id).

**Шаг 4 — атомарный claim (single-use):**
`UPDATE agent_challenges SET status='completed', completed_at=now, telegram_update_id=? WHERE
challenge_id=? AND user_id=? AND status='active' AND expires_at>now` → changes==1 = мы захватили →
пишем review. changes==0 → не захватываемо: (а) если review с attempt_id уже существует (ingest
replay) → replayed:true (идемпотентный повтор того же update); (б) иначе → reject STALE_CHALLENGE
(истёк / уже закрыт / второй иной ответ на одноразовый challenge). Сбой записи после claim →
un-claim (status назад в active) чтобы не потерять challenge.

**Шаг 5 — grade через ГОТОВЫЙ путь:**
`runtime.recordReview(ctx, {item_key: challenge.item_key, channel: challenge.review_mode, answer,
skipped, attempt_id, challenge_id})` → closed router → reviewer.record. Item/channel/expected —
ИЗ challenge (сервер), НЕ из Telegram. grader.gradeAnswer — единственный судья (LLM недостижим).

## 4. Изменения reviewer.js (production-unlock ТОЛЬКО challenge-bound)

- GRADE_ARGS += `challenge_id` (whitelist; иначе UNKNOWN_ARG).
- если `args.challenge_id` присутствует: загрузить challenge (agentChallengeRepo, USER-scoped) →
  верифицировать `item_key===args.item_key && review_mode===args.channel && status∈{active,
  completed-by-this-attempt} && telegram_user/chat совпадают`. Валидно → **production-канал
  РАЗРЕШЁН** (PRODUCTION_CHANNEL_LOCKED снят: challenge = доказательство, ЧТО показали); challenge_id
  в meta (аудит). Невалидно → reject `CHALLENGE_INVALID`. **Item НЕЛЬЗЯ подменить** (item_key
  сверяется с challenge). **Lemma-echo:** production-успех теперь возможен, НО только против
  challenge с зафиксированным expected — «просто повторить лемму из /plan» без challenge не даёт
  production-успеха (нет challenge → production locked; с challenge → grader судит против
  server-expected). Рецептив-каналы (read:tg) работают и без challenge (как P7.1a?) — НЕТ: в P7.2
  запись всегда challenge-bound (иначе произвольный текст = review). Свободный текст без challenge →
  НЕ пишется (роутер не создаёт review-answer дескриптор без active challenge).
- attempt_id-идемпотентность, ktiv-gate, empty/unsupported MNAR, D1 — как P7.0c (не трогаем).
- privacy=A: сырой ответ НЕ в meta (META_STRIP + reviewer не кладёт). challenge_id — идентификатор
  (в META_ALLOW добавить).

## 5. Verdict пользователю (безопасное преобразование, без сырых полей)

`agent/telegram/review.js` строит verdict-текст из grader-исхода:
- correct/accepted_variant → «✅ Верно» (+ «Следующее повторение: <дата>» из проекции due);
- near_miss → «Почти — ожидалась другая грамматическая форма» (безопасная причина; БЕЗ expected
  skeleton? owner: «может использовать безопасно преобразованную причину» — показать ожидаемую
  форму допустимо, это обучающая обратная связь, НЕ сырой id);
- wrong → «Не засчитано. Ожидалось: <display-форма>»;
- skip → «Отмечено «не знаю» — вернёмся к этому слову»;
- empty/unsupported → «Не понял ответ — пришлите слово на иврите» (MNAR, НЕ записано).
НЕ раскрывать: item_key, challenge_id, provenance, policy_version, grader-поля, attempt_id.
format.js denylist P7.1b расширить + гейт-ассерт.

## 6. «Не знаю» — reply-keyboard (без callback_query)

Inline-кнопки дают callback_query (P7.1a их игнорит). MVP: **ReplyKeyboardMarkup** — кнопка
«Не знаю» шлёт свой ТЕКСT обычным сообщением. api.sendMessage расширить опциональным reply_markup.
Prompt отправляется с reply-keyboard [[«Не знаю»]]; нажатие → message text «Не знаю» → skip.
/skip-команда — альтернатива. skip → decision='skip', grade 1, БЕЗ D1-смягчения (grader-контракт).

## 7. Модули

- `db/agentChallengeRepo.js` — createChallenge (partial-unique active) · getActiveForTg(user,
  tg_user, chat) · getForReviewer(user, challenge_id) · claimAtomic(challenge_id, user, updateId) ·
  unclaim · expireOld (prune). Прямой SQLite; claim под single-statement UPDATE (атомарен без
  txnLock — одна операция).
- `agent/telegram/review.js` — startReview + submitAnswer (импортит runtime + agentChallengeRepo +
  learnerGraphRepo + keyingService + format); импортится server.js, НЕ роутером (транзитивный
  read-only роутера сохранён — роутер только гейтит + возвращает дескрипторы review-start/
  review-answer).
- reviewer.js — challenge-bound production-unlock (§4).
- router.js — /review → {kind:'review-start'}; active-challenge + non-command текст / «Не знаю» /
  /skip → {kind:'review-answer', text, skipped}. Гейт: link+consent как content.
- server.js webhook — review-start/review-answer вне txn (best-effort 200); флаг-гейт.

## 8. Privacy / consent / безопасность

- **consent recheck перед write** (delivery-point, как P7.1b): submitAnswer перед record
  перепроверяет active link + живой telegram_delivery + tg_user/chat совпадают; провал → НЕ пишет.
- **unlink/revoke немедленно блокирует ответ:** revokeTelegramCascade гасит link → submitAnswer
  recheck ловит → отказ (даже с активным challenge).
- сырой ответ: грейдеру во время запроса, НЕ в review_log (privacy=A).

## 9. Гейт `smoke:telegram-review` (owner-список, ~18 ассертов)

/review создаёт РОВНО один active challenge · challenge принадлежит user/link/chat · TTL · истёкший
challenge не принимается · чужой tg-user не отвечает · повтор update_id не дублирует (attempt_id
replay) · повтор answer (иной update на завершённый challenge) → STALE, без дубля · item нельзя
подменить (ответ с иным item в теле игнорируется — item из challenge) · lemma-echo без challenge
не даёт production-успех (production locked без challenge) · skip отдельно (grade 1, decision skip,
без D1) · grader deterministic · raw answer НЕ в review_log meta · review доезжает в review_log
(source agent:review, channel dictate:tg) · FSRS projection меняется · annul восстанавливает
projection (Telegram-created review аннулируется как P7.0c-вектор) · **браузер-нога:** down-sync
доставляет review И annul в OPFS, Зал видит (local==replay==server) · consent recheck перед write
(revoke telegram_delivery → ответ не пишется) · unlink немедленно блокирует · flag-off → /review
недоступен (challenge не создаётся, ничего не пишется). Регрессия: telegram-pairing/content ·
agent-review · agent-plan · server-replay · memory-canon · auth · api.

## Развилки для критики

(а) claim-атомарность vs attempt_id-идемпотентность — правильно ли разрешают edge (сбой записи
после claim → un-claim; двойной иной ответ) без потери/дубля; (б) reviewer грузит challenge —
консистентность с claim в review.js (двойная валидация? кто авторитет single-use); (в) production-
unlock через challenge_id в args — не может ли /api/agent/review (сессия владельца) послать
произвольный challenge_id+production и обойти lock (reviewer верифицирует challenge по item/channel/
tg — закрывает? self-fraud вне модели?); (г) review_mode-выбор (dictate:tg для рецептивно-сильных) —
не создаёт ли ложный production-провал; (д) expected из challenge пере-выводится или хранится —
дрейф; (е) verdict показывает expected-форму — не утечка ли (это обучающая обратная связь, не id);
(ж) reply-keyboard «Не знаю» шлёт локализованный текст — язык профиля vs хардкод; (з) флаг off во
время активного challenge (создан при on, ответ при off) — что происходит.
