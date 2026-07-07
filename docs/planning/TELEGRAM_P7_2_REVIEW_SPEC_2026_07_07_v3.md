# CLG-P7.2a — reverse:tg + challenge-binding core (спека v3, к коду)

> v3 = решения владельца 2026-07-07 (10 пунктов) + adversarial-критика v1 (wf_ebf8a550, 4 BLOCKER) +
> research (wf_56ed38f5: gloss ready) + ЗАМЕР неоднозначности (docs/research/telegram-p72-gloss-
> ambiguity/2026-07-07: строгий-safe 25.5%, коллизия 57.3%, перечисления 60.2%). Supersedes v1
> (наивная, отклонена) и уточняет PROPOSAL. Скоуп = ТОЛЬКО P7.2a reverse:tg (cloze P7.2b, dictate
> P7.2c, selector P7.2d — отдельно). Флаг AGENT_REVIEW_WRITE dormant до владельческого live-verify.

## 0. Модальность reverse:tg (RU-смысл → HE-форма)

Prompt = русский глосс (НЕ ответ) → честное lexeme-production-припоминание. Глосс и sense-
дизамбигуация УЖЕ на сервере (pealim `.meaning`, `keyingService`+`notes-autogen`). Замер: только
25.5% глоссов строго-однозначны → синоним-приём (§3) обязателен, иначе ~75% валидных ответов =
ложный lapse.

## 1. Миграция `028_agent_challenges.sql`

```
challenge_id TEXT PK · user_id · telegram_user_id · telegram_chat_id ·
telegram_prompt_message_id INTEGER ·                       -- §решение-6: reply-binding
item_key TEXT NOT NULL · review_mode TEXT NOT NULL ('reverse:tg') ·
prompt_kind TEXT NOT NULL ('reverse') · evidence_scope TEXT NOT NULL DEFAULT 'lexeme' · -- §решение-5
expected_form_id TEXT ·                                    -- ожидаемая HE-форма (item_key)
sense_id TEXT ·                                            -- pealim_id выбранного значения
shown_stimulus TEXT ·                                      -- показанный RU-глосс (аудит shown≠expected)
stimulus_source TEXT · stimulus_source_version TEXT · stimulus_privacy_class TEXT · stimulus_hash TEXT · -- §решение-privacy
accepted_alts_json TEXT ·                                  -- набор HE-лемм того же сенса (синоним-приём)
claimed_attempt_id TEXT ·                                  -- §BLOCKER-1 single-use binding
status TEXT NOT NULL DEFAULT 'active' (active|processing|completed|declined|expired|cancelled) ·
created_at · expires_at TEXT NOT NULL · completed_at
```
partial-UNIQUE `(user_id) WHERE status IN ('active','processing')`. user_id-таблица → авто sweep.
Новая таблица `tg_stimulus_exposure` (§решение-7 cooldown, БЕЗ сырого текста):
```
user_id · item_key · exposure_kind ('due_form'|'review_prompt') · shown_at   -- prune >30мин
```

## 2. Eligibility-гейт (что делает reverse ЧЕСТНЫМ; замер-обоснован)

`selectReverseChallenge(userId)`: берёт due (getDue), для каждого item по порядку проверяет
(первый прошедший → challenge; иначе следующий; ни один → «сейчас нечего / в Зал»):
1. **decisive HE-sense** — resolveWord не ambiguous (один pealim_id); гомограф → skip (research ready);
2. **meaning есть** и confidence ≥ порог (SUSPECT/no-meaning → skip);
3. **[§решение-4/-cooldown] недавняя экспозиция:** expected-форма НЕ показывалась этому user в
   Telegram (/due или прошлый prompt) за последние 30 мин (tg_stimulus_exposure) → иначе skip;
4. **[§решение-5] evidence_scope='lexeme'** проставляется всегда (reverse доказывает лемму, не клетку);
5. собрать `accepted_alts` = все HE-леммы того же RU-сенса (карта sense→lemmas из датасета) —
   это синоним-набор; если сенс перечислительный, выбрать ОДИН показанный сенс, alts = его леммы;
6. **[§BLOCKER-4] structural prompt≠answer:** shown_stimulus (RU) заведомо не содержит expected (HE);
   гейт-ассерт.

Замер: строго-safe ≈25% пойдут прямым grade; коллизирующие (~57%) — с синоним-приёмом (§3);
широкие/фразовые — часть отсеется гейтом → следующий item / Зал. Живое покрытие профиля
проверяется на live-verify (owner-данные), дизайн-политика — из датасет-замера.

## 3. Синоним-приём (премиальная честность; §решение-4, замер-обоснован)

grader/reviewer при reverse получает `accepted_alts` (HE-леммы сенса). Классификация ответа:
- N(ans) == expected-скелет (±проклитика) → **correct** (grade через §4);
- N(ans) ∈ accepted_alts (другой валидный синоним сенса, не target) → **alternative_valid** →
  **abstain: НЕ пишется review, FSRS не двигается**; verdict: «Это тоже подходящий перевод. Я
  проверял слово „<expected>“, поэтому не меняю расписание» (§решение-4 премиум);
- N(ans) — валидная HE-форма, но вне сенса → **wrong** (grade через §4);
- пусто/не-иврит → **empty/unsupported** (MNAR, не пишется);
- **лемма-эхо/ktiv** — как P7.0b (near_miss, не пишется на ktiv-гейте).

grader.js расширяется опциональным `acceptedAlts` (skeleton-set); чистая функция, детерминизм цел.

## 4. Grade + запись (через ГОТОВЫЙ record_review_answer, каналы production-unlock challenge-bound)

- channel = 'reverse:tg' (production-семья); reviewer снимает PRODUCTION_CHANNEL_LOCKED ТОЛЬКО
  при валидном challenge (§5).
- **[§решение-2 skip] skip → тот же D1-путь, что production-провал** (НЕ безусловный Again):
  grade-policy.decideGrade получает skipped=true, но при рецептивной силе → Hard(2), иначе Again(1);
  decision='skip', reason='explicit_dont_know' сохраняются отдельно (провенанс различает skip vs
  wrong). ТРЕБУЕТ правки grade-policy: сейчас skipped→1 безусловно; изменить на D1-aware для skip.
- correct/alternative — correct=true grade 3 (alternative → abstain, не пишется).
- **[§решение-5 evidence_scope=lexeme]:** meta.evidence_scope='lexeme'; hasProductionSuccess/
  productionImbalance/channelStats должны учитывать scope (см. §6-замер: где индексируется).
- meta: keyer_version + грейдер-провенанс + channel + challenge_id + evidence_scope + sense_id;
  **сырой ответ НЕ в meta** (privacy=A).
- запись через record_review_answer (attempt_id, trustedAgentSource) — §5 транзакция.

## 5. Challenge-binding v2 (4 BLOCKER-фикса + транзакционная граница §решение-8)

- **[§BLOCKER-1] single-use claim ВНУТРИ reviewer:** атомарно active→processing→completed;
  claimed_attempt_id = attempt_id; reviewer для completed требует attempt_id==claimed → replay
  ловит ledger, не повторный accept. Завершённый challenge — НЕ многоразовый токен.
- **[§BLOCKER-2] детерминированный review-id:** id='chrev:'+sha1(challenge_id) (не wall-clock) →
  resend схлопывается INSERT OR IGNORE. reviewed_at тоже стабилизировать по challenge (не new Date).
- **[§BLOCKER-3] запрет challenge_id+production на /api/agent/review:** HTTP-эндпоинт стрипает/
  реджектит challenge_id и production-каналы; production ТОЛЬКО через review.js (webhook-trusted).
- **[§BLOCKER-4] prompt≠answer:** §2.6 structural + гейт.
- **[§решение-8 транзакционная граница]:** claim + INSERT review + recompute в ОДНОЙ
  withTxnLock-транзакции (challenge и review_log — один SQLite writer): BEGIN → verify challenge
  active → active→completed → INSERT chrev-id → recompute → COMMIT. Крэш → rollback (ни completed,
  ни review). Ассерт: **completed challenge НЕВОЗМОЖЕН без review-event** (кроме declined без grade).
  Если по инфра-причине нельзя одной txn — processing-состояние с восстановлением.

## 6. Reply-binding + кнопки (§решение-6, premium UX)

- prompt отправляется с **ForceReply** + inline-кнопками [«Не знаю»][«Не сейчас»];
  сохраняется telegram_prompt_message_id (из ответа Telegram sendMessage → result.message_id).
- ответ принимается как review ТОЛЬКО если `message.reply_to_message.message_id ===
  challenge.telegram_prompt_message_id` (или нажата кнопка). Иначе (свободный «спасибо/ок») —
  НЕ review (challenge не сжигается). api.sendMessage расширяется reply_markup + возвратом message_id.
- **«Не знаю»** → skip (§4 D1-путь). **«Не сейчас»** → status='declined', grade НЕ пишется,
  FSRS не меняется, challenge закрыт (педагогически ≠ skip). callback_query или reply-текст —
  MVP reply-текст стабильным токеном (локализация по языку — §решение-локализация).
- **[§MAJOR claim-timing]:** claim ТОЛЬКО на write-ветке (correct/wrong/skip, реально пишущей);
  MNAR/alternative_valid/ktiv/«не сейчас» → challenge остаётся active (кроме declined) → не сжигается.

## 7. Verdict (безопасно, педагогично; §решение-premium; без сырых id)

- correct → «✅ Верно. Теперь слово подтверждено не только в чтении, но и в самостоятельном
  воспроизведении.»; D1-Hard → «Почти — в чтении уже знакомо, прогресс не обнуляю, но верну раньше.»;
- alternative_valid → «Это тоже подходящий перевод. Я проверял „<expected>“, расписание не меняю.»;
- wrong → «Не засчитано. Ожидалось: „<expected-форма>“.»; skip → «Отмечено „не знаю“.»;
- **explain-выбор ПЕРЕД prompt** (детерминированно из reason-code, НЕ LLM): «В чтении устойчиво,
  а произвести самостоятельно не пробовал — напиши на иврите: „<gloss>“.»
- denylist (P7.1b + item_key/challenge_id/sense_id/attempt_id/provenance/policy).

## 8. Privacy / consent / stimulus-класс (§решение-privacy)

- сырой ответ: грейдеру во время запроса, НЕ в review_log/bot_action_log/agent_challenges/stdout
  (§MAJOR: bot_action_log.command = фикс-метка 'review-answer', НЕ verb=сырой ответ).
- shown_stimulus reverse: source='pealim-infl', version='v12', privacy_class='A' (словарь, не
  контент пользователя); stimulus_hash для аудита. (cloze P7.2b: class='C' + purge на revoke.)
- consent recheck перед write (delivery-point §P7.1b): active link + живой telegram_delivery +
  tg_user/chat + reply-binding; revoke/unlink между prompt и answer → НЕ пишет (revokeCascade
  гасит active/processing challenges).

## 9. Модули

- `db/agentChallengeRepo.js` — createChallenge (partial-unique, catch constraint → вернуть
  существующий idempotent) · selectReverseChallenge (eligibility §2) · getActiveForTg ·
  claimAndRecord (§5 одна txn) · decline · expireOld/pruneExposure · recordExposure.
- `db/keyingService.js` — +glossForItemKey (pid→meaning зеркало _pidLemma; lemma#pos→meaning) +
  acceptedAltsForSense (sense→HE-леммы карта, строится из bundle при загрузке).
- `agent/reviewer.js` — challenge-bound production-unlock + acceptedAlts + evidence_scope +
  claim-inside + детерминированный id; /api/agent/review challenge_id-запрет (§BLOCKER-3).
- `public/js/grade-policy.js` — skip → D1-aware (§решение-2).
- `agent/grader.js` — +acceptedAlts (alternative_valid).
- `agent/telegram/{review.js,api.js(+reply_markup/sendMessage message_id),router.js(review-start/
  answer descriptor, reply-binding),format.js(verdict, локализация)}` + server.js webhook.

## 10. Acceptance-gate `smoke:telegram-review` (§решение 14 пунктов + база)

1. RU-глосс содержит expected HE → challenge ЗАПРЕЩЁН. 2. Ambiguous HE-sense → запрещён.
3. Коллизирующий RU-глосс → синоним-набор собран (accepted_alts непуст). 4. Семантически
допустимый альтернативный HE-ответ → **alternative_valid, no lapse, review НЕ создан**.
5. Ответ не reply на prompt → НЕ review (challenge жив). 6. Недавняя Telegram-exposure формы
(cooldown) → item НЕ выбран. 7. skip и wrong → одна D1-policy, но разные decision/reason.
8. «Не сейчас» → review НЕ пишется, status='declined'. 9. completed challenge НЕВОЗМОЖЕН без
review-event (grade-ветка). 10. crash/retry → ровно один детерминированный review (chrev-id).
11. raw answer отсутствует во ВСЕХ SQL/log/stdout (сентинел-ответ не встречается). 12. revoke
между prompt и answer → блокирует write. 13. evidence_scope='lexeme' (не повышается до form/
paradigm). 14. stimulus_source/version сохранены. + база: flag-off /review недоступен (zero-write) ·
challenge принадлежит user/tg/chat · TTL/expired · чужой tg не отвечает · dedup update_id ·
single-use (второй /api/agent/review с completed challenge → НЕ пишет) · production-unlock только
challenge-bound (без challenge → LOCKED) · браузер-нога down-sync review+annul в OPFS · id-хвост
review_log (2 юзера) — ожидаемая строка + отсутствие чужих · annul восстанавливает projection ·
транзитивный read-only router.

## Известные ограничения (задокументированы)

- reverse:tg покрывает ≈25% строго + коллизирующие с синоним-приёмом; остальное (широкие/фразовые/
  no-decisive) → cloze/dictate/Зал (P7.2b+). Живое покрытие профиля — на live-verify.
- «слаб слух» отдельно не отслеживается (channelStats read+listen вместе) — dictate-выбор P7.2c
  по production-провалу, не слушательной слабости.
- evidence_scope='lexeme' требует, чтобы hasProductionSuccess/productionImbalance учитывали scope
  (§6 замер: где индексируется) — если индексируется по item_key (лемме), lexeme-успех НЕ должен
  претендовать на клеточную/парадигменную production-компетенцию; уточнить в коде.
