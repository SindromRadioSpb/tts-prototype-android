# CLG-P7 Telegram Bot — решения владельца (2026-07-06)

> Контекст: CLG-P6+P9 закрыты (live-verified). Readiness-анализ =
> `TELEGRAM_P7_READINESS_2026_07_06.md`. Владелец рассмотрел анализ и принял
> решения по стадированию и всем 4 развилкам. Этот док — канон для сессий P7.*;
> НЕ пере-обсуждать без новых вводных.

## Главный принцип (владелец, дословно)

**«Telegram-бот должен быть тонким каналом, а не новым учебным мозгом.
Вся педагогика, грейдинг, память, consent и replay остаются на сервере.»**
P7 — расширение существующей архитектуры, не параллельная система.

## Вердикт по CLG-P6

CLG-P6 закрыт. Доработка P6 не нужна. P7 стартует НЕ с Telegram UI и НЕ с /review.

## Стадирование (утверждено)

### P7.0a — Annul semantics (ПЕРВЫЙ эпик)
Цель: `kind='annul'` реально исключает ошибочный review event из replay-проекции.

**Правило владельца (зафиксировано отдельно): annul НЕ удаляет событие — annul
меняет ТОЛЬКО projection.** Лог остаётся append-only; и target, и annul-строка
навсегда видимы в логе (auditability).

Acceptance criteria (владелец, 10 пунктов):
1. review_log остаётся append-only;
2. annul event указывает на target review event (meta.annul_of);
3. replay игнорирует annulled target;
4. повторный replay даёт тот же результат (детерминизм);
5. annul идемпотентен (double-annul = тот же результат);
6. нельзя annul вне своего user-scope;
7. нельзя annul event другого пользователя;
8. старые логи без annul-строк дают байт-идентичный результат (do-no-harm);
9. golden-тесты: нормальный grade · annul · double-annul · missing target ·
   cross-user target;
10. FSRS-оракул показывает do-no-harm.

### P7.0b — Server deterministic grader + gold
Минимальный состав: grade-policy.js (общий) · normalizeAnswer() ·
resolveHebrewVariants() · classifyAnswer() · grader provenance · gold fixtures.

Категории результата (утверждены): `correct · accepted_variant · near_miss ·
wrong · empty · ambiguous/unsupported`.

Провенанс КАЖДОГО grade (утверждён; цель — «через месяц понять, почему ответ
был засчитан/не засчитан»):
```json
{ "policy_version": "...", "normalizer_version": "...", "resolver_version": "...",
  "expected_form_id": "...", "matched_variant": "...", "decision": "...", "reason": "..." }
```

### P7.0c — Enable record_review_answer (web/server-smoke, ДО Telegram)
Порядок (утверждён): feature flag → включить в dev/staging → web-smoke →
проверить запись review_log → FSRS projection → annul ошибочного grade →
sync/down-sync → только после этого write-контур считается готовым для Telegram.

### P7.1 — Pairing + read-only Telegram-команды
Команды MVP: `/start /link /unlink /status /plan /explain /due /summary /help`.
Бот на этом этапе НЕ пишет grades. Быстрый продуктовый эффект (план и
объяснения в Telegram) без риска для SRS-памяти.

### P7.2 — Telegram /review (только после P7.0a/b/c + P7.1)
Flow: /review → сервер выбирает due item → бот показывает prompt → ответ →
серверный грейдер → record_review_answer пишет event → FSRS пересчитывает →
бот показывает результат и объяснение. Использует весь стек: annul · grader
provenance · gold-backed policy · dedup update_id · channel_links · privacy consent.

### P7.3 — Proactive reminders (ОТДЕЛЬНЫЙ эпик, если понадобится)
daily due reminder · quiet hours · notification_preferences · unsubscribe · rate limit.

## Развилки — решения владельца

1. **Webhook topology → in-process route в main-сервере (MVP).** Меньше
   инфраструктуры; single-writer проще; общий user/session/security-контекст;
   переиспользование ledger/LLM/keying/down-sync; меньше риск рассинхронизации.
   Отдельный bot-service — позже, когда появятся proactive nudges / очереди /
   retry / rate limiting / multi-channel / high traffic.
2. **Privacy consent → ОТДЕЛЬНЫЙ consent при pairing** (не прятать Telegram в
   общий agent-consent). Утверждённая формулировка (основа копии):
   > «Telegram-доставка может включать учебные слова, фразы, объяснения, задания
   > и напоминания. Эти сообщения будут передаваться через инфраструктуру
   > Telegram. Канал можно отключить в любой момент.»
   Сразу, не задним числом (миграция consent позже — грязнее).
3. **Журнал действий бота → лёгкий bot_action_log / agent_tasks-lite**, НЕ
   полноценные threads/messages. Поля: user_id · channel · telegram_update_id ·
   command · status · created_at · error_code · linked_review_event_id (если есть).
   **Dedup по update_id — ОБЯЗАТЕЛЕН** (Telegram может прислать update повторно).
4. **Проактивность → MVP только command-response.** Бот отвечает, когда
   пользователь пишет сам. Без notification_preferences/расписания/throttling
   на первом этапе. Проактивность = P7.3.

---

## P7.0a — техническая спека (проект реализации, к adversarial-критике)

Замер живого кода (2026-07-06): ingest уже принимает kind='annul' c обязательным
meta.annul_of (learnerLogRepo `annul_without_target`); клиент принимает annul в
down-sync; но ОБА реплея (fsrs-core.js:227, fsrs-reference-replay.js:106) трактуют
annul как neutral — семантика не приземлилась.

1. **Семантика:** двухпроходный fold. Проход 1 — собрать
   `annulled = Set(meta.annul_of всех kind='annul' строк лога)`. Проход 2 —
   существующий fold, дополнительно пропуская строки, чей `id ∈ annulled` И
   `kind ∈ {review, skip}` (фолдящиеся kinds). Порядок annul-строки относительно
   target не важен (двухпроходность), детерминизм сохранён.
1-бис. **annul-строка ОБЯЗАНА нести item_key target-а.** Фолд — per-item_key
   (getReviewLog(itemKey) выбирает строки одного ключа): annul с чужим/иным
   item_key фолд target-а физически не увидит → no-op by construction. Жёсткая
   валидация на ingest невозможна (out-of-order sync: target может прийти позже) —
   правило контрактное для минтера (P7.0c) + golden-вектор «annul с несовпадающим
   item_key = no-op». Побочный бонус: down-sync recompute уже подхватывает ключ
   (cloud-sync.js:166 addedKeys по item_key строки) — рекомпьют затронутого слова
   сработает без изменений sync-кода.
2. **Аннулируемые kinds — ТОЛЬКО review/skip.** Seed НЕ аннулируется (сдвиг
   D3-watermark = потеря истории); mark НЕ аннулируется (у ручной оси своя
   LWW-семантика — исправление = новый mark); annul-of-annul ИГНОРИРУЕТСЯ
   (un-annul не поддерживается; исправление ошибочного annul = новое
   review-событие). Все игнорируемые случаи — в golden.
3. **User-scope:** структурно (лог per-user, PK(user_id,id) на сервере; OPFS
   однопользовательский). Cross-user target = missing target в своём логе → no-op.
4. **Do-no-harm:** лог без annul-строк → проход 1 даёт пустой Set → fold
   байт-идентичен текущему. Golden v1 остаётся зелёным без изменений. На проде
   annul-строк НЕТ (писатель ещё не существует) → деплой безопасен по построению,
   oracle расхождений не покажет.
5. **Consumer-sweep (gate-consumers-sweep!):** семантику обязаны разделить ВСЕ
   читатели сырого лога, где аннулированный провал искажает картину:
   - fsrs-core.replay (клиент+сервер) — ядро;
   - fsrs-reference-replay (независимая спек-реимплементация, БЕЗ импорта core);
   - learnerProjectionRepo.channelStats (D1-агрегат — иначе production_gap
     фантомит от аннулированного провала);
   - learnerGraphRepo.getRecentStruggles (fresh_struggles считает провалы по
     сырому логу);
   - agentRepo.wordLifecycle → constructs.channelGapConstruct (детекция
     construct-id по событиям);
   - клиентские читатели сырого лога — прогнать grep-сврип, memory-canon гейт.
   Помечать, не прятать: lifecycle-события отдаются с флагом annulled (журнал
   честен), детекция/агрегаты флагнутые строки пропускают.
6. **Хелпер:** `collectAnnulled(rows)` — pure, в fsrs-core (UMD, общий клиент+
   сервер); реф-реплей реализует СВОЙ (независимость оракула, R11).
7. **Golden:** generator + новые вектора (annul середины истории · double-annul ·
   missing target · annul seed/mark/annul-of-annul игнорируются · annul
   раньше target по времени); v1-файл не трогается (do-no-harm доказательство).
8. **Гейты:** smoke:fsrs (golden) · smoke:server-replay (three-way parity + новые
   вектора) · smoke:memory-canon · smoke:cloud-sync · agent-plan/explain
   (constructs/струггалы) · SW-бамп (fsrs-core в precache).
9. **Вне скоупа P7.0a:** писатель annul-строк (мин-хелпер id/минт — P7.0c),
   UI аннулирования, grader.

---

## P7.0a — SHIPPED v3.11.115 (2026-07-06); адъюдикация adversarial-критики

Критика (wf_1bf34023, 3 линзы R11/R12-R13/R10 завершились, R17-B завис и добит
вручную по 10 критериям владельца) нашла **3 BLOCKER + 8 MAJOR + 6 MINOR** —
все существенные отработаны:

- **BLOCKER «клиент не умеет "память стёрта"»** (все 3 линзы независимо):
  recomputeSrsFromLog при null-фолде ПРОПУСКАЛ ключ → stale-расписание навсегда
  (сервер проекцию удаляет — расхождение поверхностей). Фикс: `clearSrsState` —
  ''-carrier удаляется, у manual-строки чистятся ТОЛЬКО srs_* (ручная ось цела).
  Ловушка схемы: srs_interval/reps/lapses NOT NULL → нейтральные нули (поймано
  гейтом memory-canon, а не глазами).
- **BLOCKER «annul.item_key == target.item_key»:** зафиксировано в спеке (1-бис) +
  golden missing-target; жёсткое правило минтера — P7.0c (сервер резолвит цель,
  item_key ИЗ найденной строки, отсутствие цели = reject).
- **MAJOR grade-policy = write-time читатель сырого лога:** аннулированное
  свидетельство отравляло БУДУЩИЕ D1-грейды (новая порча в append-only лог,
  реплеем не лечится). Фикс: вызыватель фильтрует через FsrsCore.withoutAnnulled
  (клиент library-ui; серверный грейдер P7.0b обязан так же).
- **MAJOR канон id:** LemmaCanon.annulId(target) = 'annul:'+sha1(target) —
  детерминирован (двойная доставка дедупится) и различен по целям; reviewId
  для annul ЗАПРЕЩЁН (не включает annul_of → bulk-annul схлопнулся бы).
- **MAJOR version-skew:** ENGINE_VERSION → fsrs6-core-v2; клиентский one-shot
  heal в fullSync (sync_state 'annul_engine_v' ≠ версия ядра → пересчёт всех
  ключей с annul-строками); ☁-оракул авто-rebuild расширен на mismatched>0;
  oracle отдаёт annul_rows + engine (наблюдаемость; прод-ожидание annul_rows=0).
- **MAJOR SQL-агрегаты:** getRecentStruggles → JS-агрегация с annul-set по ВСЕМУ
  логу пользователя (annul вне 24ч-окна гасит цель внутри окна — clock skew);
  last_review_at в getAgentContext не считает аннулированные; wordLifecycle
  расширен (id+meta для флага annulled, наружу meta не уходит), детекция
  channelGapConstruct пропускает флагнутые.
- **MAJOR nsRows гейта:** server-replay-smoke переписывает meta.annul_of тем же
  неймспейс-префиксом (иначе v2-вектора с реальной целью падали бы в e2e-ноге).
- **MINOR клиентская валидация:** appendReviewLog зеркалит annul_without_target
  (иначе локально принятая строка вечно реджектится сервером → heal-цикл синка).
- **MINOR ingest-recompute не молчит:** провал пересчёта после ingest →
  projections_recompute_failed в ответе + console.error.
- **Sentence-карточки (MAJOR R11):** annul-скоуп P7.0a = word-key review/skip
  строки; sent:-цели ВНЕ скоупа (их state живёт в srs_cards.meta_json.fsrs без
  recompute-пути) — write-path P7.0c обязан отклонять annul на sent:-цели.
  Зафиксированное ограничение, не тихая дыра.

**Гейты:** server-replay **65/65** (three-way parity ×18 вкл. 8 annul-векторов
golden-v2; v1 байт-стабилен = do-no-harm; e2e annul-to-null удаляет проекцию) ·
memory-canon **63/63** (+6 клиентских annul) · fsrs 30/30 · agent-plan **32/32**
(+2: annul гасит fresh_struggles e2e) · agent-explain **43/43** (+1 pure) ·
learner-graph 14/14 · mentor-home 25/25 · grade-policy 24/24 · cloud-sync · api.

**Критерии владельца 1–10:** все закрыты (1 append-only структурно · 2 annul_of
обязателен обеими сторонами · 3+4 двухпроходный детерминированный фолд · 5 Set-
идемпотентность + golden double-annul · 6+7 per-user PK + per-item fold + golden
missing-target · 8 v1-golden байт-стабилен · 9 golden-v2 8 векторов · 10 oracle
clean + TEETH). Правило «annul не удаляет событие — только projection» —
в коде комментарием и в гейтах (лог-строки видимы после annul).
