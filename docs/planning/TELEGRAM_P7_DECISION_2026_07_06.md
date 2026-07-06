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

---

## P7.0b — техническая спека (к adversarial-критике)

Замер живого кода (2026-07-06): у Зала УЖЕ есть боевое правило приёма ответа —
`library-ui._normHe` (stripNiqqud + фолд конечных букв ך/ם/ן/ף/ץ + trim) и
`_acceptedSkeletons` (принимаются НОРМАЛИЗОВАННЫЕ скелеты: инфлектированная форма
предложения И лемма, каждая ± ОДНА ведущая проклитика ו/ה/ב/כ/ל/ש/מ при длине >2).
**R11-инвариант: серверный грейдер НЕ СТРОЖЕ Зала на тех же входах** — иначе один
ответ грейдится по-разному на разных поверхностях. Нормализатор сервера =
существующий `db/hebrewNorm.normalizeHebrew` (нику́д + финальные формы + пробелы) —
семантически совпадает с `_normHe`.

1. **Модуль `agent/grader.js`** (роль grader из §9-скелета) — pure deterministic;
   deps: hebrewNorm (нормализация) · keyingService (резолв item_key; уже stateless
   lazy) · grade-policy.js (D1, ОБЩИЙ с клиентом) · fsrs-core.withoutAnnulled
   (P7.0a: аннулированное — не свидетельство). **LLM не импортируется вовсе**
   (R17-B deterministic-first; llm-assisted feedback — advisory, отдельно, БЕЗ grade).
2. **API:** `gradeAnswer({ expected: {form, lemma?, item_key?}, answer, channel,
   prevState, rows })` → `{ decision, gradable, correct, grade, provenance }`.
   expected.item_key приходит ОТ ВЫЗЫВАТЕЛЯ (due-очередь уже несёт авторитетный
   ключ) — резолвер на грейде НЕ вызывается (v1 самодостаточен: hebrewNorm +
   grade-policy + fsrs-core; датасет нужен только гейту для свипа).
   Нормализация ответа: hebrewNorm.normalizeHebrew + строб не-ивритских символов
   (пунктуация/эмодзи; внутренние пробелы сохраняются) — «שלום!» == «שלום».
3. **Классификация (категории владельца):**
   - `correct` — нормализованный ответ == скелет формы (± проклитика:
     matched_variant='form'/'form_proclitic');
   - `accepted_variant` — скелет леммы (± проклитика; Зал это принимает как верный
     ответ — сервер сохраняет исход, но честно маркирует вариант). **Ktiv male/haser
     в v1 НЕ принимается** (ЗАМЕР 2026-07-06: (а) Зал ktiv-варианты не принимает —
     серверный accept сделал бы сервер МЯГЧЕ клиента, расхождение R11; (б) замок
     «тот же item_key» не работает: bare-surface резолв даёт surface-ключи,
     דיבר#≠דבר# — проверено живым keyingService). Ktiv-кандидат (расхождение только
     в י/ו) классифицируется near_miss с ОСОБОЙ причиной 'ktiv-candidate' — фидбек
     бота честный («возможно, это ktiv male/haser — тренируем форму как в тексте»),
     исход = как в Зале. Апгрейд до accept — отдельное владельческое решение после
     замера (потребует dataset-lookup форм парадигмы по item_key ЦЕЛИ);
   - `near_miss` — расстояние Левенштейна 1 до любого принятого скелета (не
     покрытое ktiv-правилом); ПРОВАЛ с фидбек-подсказкой, не успех;
   - `wrong` — иначе (иврит присутствует);
   - `empty` — нормализованный ответ пуст;
   - `ambiguous/unsupported` — в ответе нет ивритских букв, либо ожидаемое
     пусто/ненормализуемо.
4. **Маппинг в grade:** correct/accepted_variant → correct=true, grade 3 (Good —
   как boolean-путь Зала); near_miss/wrong → correct=false, grade через ОБЩИЙ
   `GradePolicy.decideGrade` (D1: production-провал на рецептивно-сильном → Hard(2);
   rows предварительно `withoutAnnulled`); **empty/unsupported → gradable=false,
   grade=null** — вызыватель НЕ пишет review_log (MNAR: не-ответ ≠ провал;
   переспросить/воздержаться — R17-A «честно воздержаться»).
5. **Провенанс (7 полей владельца):** policy_version='agent-grader-v1' (+
   grade_policy при D1) · normalizer_version='heb-norm-v1' · resolver_version =
   {resolver: keyingService.RESOLVER_ID, model_version, keyer_version} ·
   expected_form_id = item_key ожидаемого (резолв; null если нерезолвимо) ·
   matched_variant · decision · reason (машинная строка: 'exact-skeleton',
   'lemma-skeleton', 'ktiv-male-haser', 'lev1', 'no-hebrew', …).
6. **Gold-набор:** `scripts/premium/fixtures/grader/grader-gold-v1.json` —
   курируемые кейсы (ktiv-пары из реального датасета · огласованные ответы ·
   финальные формы · проклитики · near-miss опечатки · пустые/не-иврит/шум) —
   **порог 100%** (набор рукописный); плюс derived-свип по shipped-датасету
   pealim-infl-v12 (детерминированная выборка парадигм: форма-с-огласовками ==
   correct против собственного скелета) — порог ≥99%.
7. **Гейт `smoke:grader-gold`:** gold 100% · свип ≥99% · провенанс-форма (7 полей)
   · детерминизм (два вызова byte-equal) · D1-интеграция (production-провал на
   рецептивно-сильных rows → 2; annulled production-успех отфильтрован → Hard
   восстанавливается) · empty/unsupported → gradable=false БЕЗ grade · модуль не
   импортирует llm (структурный ассерт по исходнику).
8. **Вне скоупа:** запись в review_log (P7.0c) · Telegram-вход (P7.1/P7.2) ·
   free-form сочинения (unsupported до отдельного решения — R17-B «сочинение не
   становится тренировочной единицей без подтверждения»).

---

## P7.0b — SHIPPED v3.11.116 (2026-07-06); адъюдикация adversarial-критики

Критика (wf_ccbad91d, 2 линзы, ЗАМЕР по 9279 парадигмам / 226 834 клеткам +
живые прогоны keyingService): **3 BLOCKER + 6 MAJOR + 3 MINOR.** Итоговая
семантика ПЕРЕРЕШЕНА по замерам:

- **BLOCKER «ktiv item_key-замок мертворождён»** (bare-surface ключи דיבר#≠דבר#;
  99.9% глагольных парадигм имеют же-парадигменные י/ו-пары клеток — 71 391 пара:
  כתב/כתבו, כתבתי/כתבת): ktiv-accept ВЫПИЛЕН ещё на спеке; ktiv-кандидат =
  near_miss/'ktiv-candidate'. Cell-level апгрейд (матч против male-написания
  именно ожидаемой КЛЕТКИ) — развилка владельца.
- **MAJOR «Зал НЕ принимает словарную лемму»** (замер: 2-й арг _acceptedSkeletons =
  item.surface, не лемма; комментарий 'form OR lemma' — мёртвый): lemma-accept
  ВЫПИЛЕН (закрыт и lemma-echo эксплойт: леммы видны в /plan → grade-3-фрод →
  ложный production-успех навсегда отключал бы D1). Ответ-лемма → near_miss/
  'lemma-not-form' (честный фидбек). Это закрыло и «446 глаголов» диктант-дыру
  (רוצה→רצות = провал).
- **MAJOR проклитик-строб дыряв (20 400 измеренных пар: כלב→לב, מלח→לח)** —
  унаследованный паритет Зала: исход сохранён (успех), но ЛЮБОЙ проклитик-путь =
  decision 'accepted_variant' с маркировкой matched_variant ('form_proclitic'/
  'answer_proclitic'/'proclitic_swap'); только чистый form-матч = 'correct'.
  **Развилка владельца:** ужесточать обе поверхности синхронно или жить с
  маркированной дырой.
- **MAJOR проклитик-СВОП** (Зал стрипает ОБЕ стороны — לבית при בבית принимается):
  алгебра зафиксирована {N(form),strip(N(form))} × {N(ans),strip(N(ans))} —
  байт-паритет с library-ui.js:1729; gold-вектор proclitic-swap.
- **BLOCKER «провенансу негде жить»** (META_ALLOW реджектил 6 из 7 полей):
  идентификаторные ключи добавлены в META_ALLOW (policy_version/normalizer_version/
  resolver_version/matched_variant/decision/expected_form_id) + гейт-ассерт;
  сырой ответ/скелеты — В META_STRIP КАК БЫЛИ (privacy-класс сырого ответа =
  явное решение владельца при P7.0c, не молчаливый провоз).
- **MAJOR skip-путь:** skipped добавлен в контракт gradeAnswer → decision 'skip',
  grade 1 БЕЗ смягчения (R17-B); P7.2 ОБЯЗАН иметь кнопку «Не знаю»;
  unsupported-уклонение → bot_action_log + shown-vs-graded (P7.2).
- **MAJOR словарь каналов:** P7.2 пишет channel = '<СУЩЕСТВУЮЩАЯ семья>:<tg-режим>'
  ('dictate:tg', 'reverse:tg') — 'telegram' голым НЕ семья (D1 был бы мёртв,
  production-успехи падали бы в receptive); гейт-ассерт isProductionChannel.
- **MAJOR expected_form_id:** item_key передаётся ВЫЗЫВАТЕЛЕМ (due-строка),
  asserted; гейт: байт-равенство. Ре-резолв на грейде не используется.
- **MINOR свип-тавтология:** свип переделан с зубами — позитив (клетка против
  себя, 452/452) + НЕГАТИВ (чужая клетка той же парадигмы: exact-false-accept=0,
  общий accept ≤10%, фактически 0/447).
- **MINOR отложено:** различение 'lev1-typo' vs 'lev1-other-word:<pid>' (нужен
  датасет-инвентарь на грейде — P7.2-фидбек) · тикет качества датасета: 11 клеток
  с финальными буквами в середине слова (דרבן/קודם/יקום/משופשף — баг scrape) ·
  rows-контракт: полный per-item лог ВСЕХ kinds (записано в grader.js) ·
  prevState snake→camel адаптер для fsrsStep — P7.0c.

**Гейт `smoke:grader-gold` 58/58:** gold 22/22 (100%: точный/огласовки/финальные/
проклитик-варианты вкл. измеренные дыры/lemma-echo/диктант-чужое-слово/
male-vs-vocalized/ktiv-candidate/lev1/wrong/empty/не-иврит/multiword) · свип
позитивы 452/452, негативы 0/447 · провенанс 7 полей + expected_form_id
байт-равенство · детерминизм · D1 (Hard на рецептивно-сильном; annulled
production-успех отфильтрован P7.0a; контроль: живой успех блокирует смягчение) ·
skip=Again(1) без смягчения · каналы · META_ALLOW · LLM структурно недостижим.

---

## P7.0c — техническая спека (активация record_review_answer; к adversarial-критике)

Замер живого кода (2026-07-06): `record_review_answer` = статический disabled-skeleton
в agent/tools.js:96 (reason `GATED_UNTIL_GRADER_GATES`; agent-plan-smoke:116 ассертит
именно этот reason — гейт обновляется вместе с контрактом). Штатный ingest-путь =
`learnerLogRepo.ingestBatch` (валидация конверта §6 + txnLock + batch-идемпотентность)
→ `learnerProjectionRepo.recomputeForKeys` В ТОМ ЖЕ запросе (server.js:1582-1597,
recompute-провал не молчит). Клиентский down-sync (`cloud-sync.syncDown` →
`local-db.appendReviewLog`) принимает произвольные source/channel/meta-ключи →
agent-строки доезжают в OPFS БЕЗ клиентских изменений; annul-строки уже требуют
meta.annul_of на обеих сторонах. `grade-policy.hasMemoryState` читает prev.stability/
prev.due — серверная projection-строка несёт оба (snake==camel для этих имён), но
lastReviewedAt в ней зовётся reviewed_at и это ISO-строка, не ms → адаптер обязателен.

0. **Feature flag `AGENT_REVIEW_WRITE=1`** (env; отсутствует/иное → инструмент
   disabled с reason **`FEATURE_FLAG_OFF`** — новый честный reason: гейты 4.8
   пройдены, выключен именно ФЛАГ, не пред-условия). Прод: переменная НЕ задаётся
   до решения владельца. Kill-switch AGENT_LLM_DISABLED на инструмент НЕ влияет
   (грейдер детерминированный, LLM/ledger не участвуют — R16-бюджет не жжётся).

1. **Модуль `agent/reviewer.js`** (роль reviewer из §9-скелета): deterministic,
   LLM структурно недостижим (тот же гейт-ассерт по исходнику, что у grader).
   Прямого SQLite нет — только db/learnerLogRepo + db/learnerProjectionRepo +
   db/keyingService + agent/grader (шов §13.4 сохранён).

2. **Контракт инструмента — два взаимоисключающих режима (v2 после критики):**
   grade-режим `{ item_key, answer?, skipped?, channel, attempt_id }` XOR annul-режим
   `{ annul_of, reason }`; смешение → reject `AMBIGUOUS_MODE`; `skipped:true` +
   непустой answer → reject `SKIP_WITH_ANSWER`. **Аргументы — закрытый whitelist
   per-режим; любой посторонний ключ (в т.ч. `expected`, `grade`, `reviewed_at`,
   `source`) → reject `UNKNOWN_ARG`** (инвариант «клиентского expected не существует»
   держится кодом, не конвенцией). user_id — уже reject на роутере (B2).
   **attempt_id ОБЯЗАТЕЛЕН в grade-режиме** (8..64 симв.): idempotency_key =
   `'agentrev:'+attempt_id` — сетевой ретрай/даблклик/redelivery той же попытки
   реплеит сохранённый результат ingest_batches (replayed:true), НЕ вторую строку
   (критика ×3 линзы: id из серверного reviewed_at давал новый ключ на каждый
   ретрай — идемпотентность была тавтологична). P7.2 маппит update_id → attempt_id.

3. **Grade-режим:**
   - `sent:`-префикс item_key → reject `SENT_ITEM_UNSUPPORTED` (state сентенс-карт
     живёт в srs_cards.meta_json.fsrs вне recompute-пути — P7.0a scope);
   - **R17-B существование единицы:** per-item лог пользователя НЕПУСТ (иначе reject
     `UNKNOWN_ITEM`) — агент НЕ минтит новые учебные единицы через грейд («сочинение
     не становится тренировочной единицей»); mark-only слово допустимо (ручная ось =
     asserted-единица learner-state);
   - **channel v1 = ТОЛЬКО рецептивные семьи:** `/^(read|listen):[a-z0-9_-]{1,20}$/`
     ('read:agent' в web-smoke, 'read:tg'/'listen:tg' в P7.2-рецептиве).
     **Production-семьи (dictate/reverse) → reject `PRODUCTION_CHANNEL_LOCKED` до
     challenge-binding (shown-vs-graded) P7.2** — адъюдикация критики (обе линзы,
     BLOCKER): v1-упражнение агента = продукция display-формы (лемма для pid- и
     большинства `#`-ключей), а лемма же отдаётся вызывателю в /plan → запись
     'dictate:*'-успеха делала бы hasProductionSuccess=true НАВСЕГДА (grade-policy:69-75)
     → D1-смягчение выключено, production_gap закрыт ложным свидетельством — ровно
     lemma-echo, закрытый в P7.0b. Рецептивная запись — безопасная сторона:
     успех = рецептивное свидетельство (включает D1), провал = честный lapse.
     Семья `reading` запрещена всегда (reading-native = только живое чтение, моат R17);
     голая семья/чужая семья → reject `BAD_CHANNEL`;
   - **expected — ТОЛЬКО серверной стороны** (разбор развилки — п. 7): form =
     display-форма item_key (`<skeleton>#<pos>` → skeleton из ключа; `pid:N` →
     keyingService.displayForItemKey — огласованная лемма парадигмы). **Нерезолвимость
     проверяет reviewer сам** (displayForItemKey честно фолбэчит СЫРЫМ ключом, null
     не возвращает — критика): display == item_key ИЛИ без ивритских букв → reject
     `EXPECTED_UNRESOLVED` (форму не выдумываем, R1) — ДО грейдера и ДЛЯ ОБОИХ путей,
     включая skip (нерезолвимый item не мог быть показан → и отказ по нему не факт);
   - **кап answer ≤ 400 симв.** → reject `ANSWER_TOO_LONG`, ничего не пишется
     (10MB-строка в normalizeAnswer/lev1 — DoS-рычаг; критика);
   - rows для грейдера = ПОЛНЫЙ per-item лог, ВСЕ kinds включая annul (новый
     `learnerLogRepo.itemRows(userId, itemKey)` — тот же SELECT/ORDER, что
     `learnerProjectionRepo._itemRows`); prevState = srs_projections-строка через
     **адаптер snake→camel** `{stability, difficulty, reps, lapses, due,
     lastReviewedAt: Date.parse(reviewed_at)}`; проекции нет → null (D1 честно
     не смягчает);
   - грейд = `grader.gradeAnswer({expected, answer, channel, prevState, rows,
     skipped})` — единственный судья (grader НЕ меняется — gold 58/58 цел);
   - **gradable=false (empty/unsupported) → НИЧЕГО не пишется (MNAR)**; decision/
     reason/feedback уходят вызывателю в ответе (переспросить — дело поверхности;
     bot_action_log = P7.1); **+ write-gate v1: reason='ktiv-candidate' →
     recorded:false (расширение MNAR)** — адъюдикация BLOCKER-критики: expected
     сервера = огласованная/хасер display-форма, честный ktiv-male ввод пользователя
     (דיבר при לדבר-лемме דבר) грейдился бы ложным lapse НАВСЕГДА в append-only лог;
     Зал в этой ситуации принимает male-ПОВЕРХНОСТЬ вхождения (второй скелет),
     которой у сервера v1 нет → честное воздержание вместо ложного провала;
     фидбек честный («возможно ktiv male/haser»); апгрейд до cell-level accept =
     существующая развилка владельца;
   - gradable=true → минт строки: kind = skip→'skip' иначе 'review'; grade =
     d.grade; reviewed_at = СЕРВЕРНОЕ now (UTC-Z; клиентскому времени не доверяем;
     известное ограничение: клиентская строка с +5мин skew может лексикографически
     обогнать агентскую — искажение фолда ≤ slack-окна, суб-дневное для utcDayDiff);
     source = **'agent:review'**; id = `LemmaCanon.reviewId(row)`; meta =
     keyer_version + грейдер-провенанс (policy_version/normalizer_version/
     resolver_version/expected_form_id/decision/reason + matched_variant при
     наличии) + D1-провенанс `GP.policyMeta` при applied; **сырой ответ/скелеты
     в meta НЕ кладутся** (и META_STRIP их не пропустит — двойная граница);
   - запись: `ingestBatch(userId, deviceId, {idempotency_key: 'agentrev:'+attempt_id,
     schema_version:1, keyer_version:1, review_log:[row]}, {trustedAgentSource:true})`;
     **recompute БЕЗУСЛОВНЫЙ**: `recomputeForKeys(userId, [item_key])` и на live-,
     и на replayed-ветке (критика: new_item_keys не персистится в batch-результате —
     крэш между COMMIT и recompute + ретрай с тем же ключом навсегда оставлял бы
     stale-проекцию); recompute-провал → `projections_recompute_failed` (не молчит);
   - **пост-ассерт записи (анти-«тихий 0»):** replayed==true ИЛИ review_log.new==1
     ИЛИ (dup==1 → recorded:true, dup:true — контент-дубль легитимен); rejected →
     `{ok:false, error:'ROW_REJECTED', reason}` — recorded:true при нуле строк
     невозможен;
   - ответ инструмента: `{recorded, replayed?, dup?, decision, grade, row_id,
     item_key, provenance, feedback?}` (feedback-скелеты — той же privacy-плоскости,
     что ответ /explain тому же принципалу; НЕ персистятся, в stdout не логируются).

3-бис. **Резервирование source='agent:*' на ingest (критика R14, MAJOR):** штатный
   /api/learner/ingest ДО СИХ ПОР принял бы клиентскую строку с source='agent:review'
   и полным фальшивым грейдер-провенансом — провенанс переставал быть доказательством
   прохождения через grader.js, а annul-скоуп «только свои строки» авторизовался бы
   неаттестованным полем. Фикс: `ingestBatch(..., opts)` — БЕЗ `trustedAgentSource`
   НОВАЯ строка (id не существует у пользователя) с source `agent:*` → reject
   `reserved_source`; СУЩЕСТВУЮЩИЙ id → dup (echo-петля cloud-sync, re-аплоадящего
   down-синкнутые agent-строки, остаётся зелёной). Внутренний путь reviewer —
   единственный, кто выставляет trusted-флаг; endpoint его выставить не может.

4. **Annul-режим (минтер-контракт P7.0a, зафиксирован; v2-ужесточения критики):**
   - **сервер резолвит цель по (user_id, annul_of)** — новый
     `learnerLogRepo.getRowById(userId, id)`; цели нет → reject
     `ANNUL_TARGET_NOT_FOUND` (blind-минт запрещён — иначе no-op-мусор в логе);
   - target.kind ∉ {review, skip} → reject `ANNUL_TARGET_NOT_ANNULLABLE`;
   - target.item_key `sent:` → reject `ANNUL_SENT_TARGET` (P7.0a scope);
   - **target.source НЕ 'agent:*' → reject `ANNUL_FOREIGN_SOURCE`** — v1-скоуп:
     агент отменяет ТОЛЬКО собственные ошибочные грейды (с 3-бис поле source
     аттестовано сервером); аннулирование строк Зала/Anki = отдельное владельческое
     решение (у него будет свой UI-серфейс);
   - **`reason` ОБЯЗАТЕЛЕН** (1..40 симв., машинная строка — в meta.reason; ключ уже
     в META_ALLOW) + **окно 24ч**: target.reviewed_at старше 24ч → reject
     `ANNUL_TARGET_TOO_OLD` — критика: безлимитный ластик без причины = селективная
     инфляция памяти (MNAR-инверсия «провал ≠ провал, если стереть») и нулевой
     провенанс «почему аннулировано»; P7.2-диспут происходит сразу после грейда;
   - annul.item_key = item_key ЦЕЛИ (из найденной строки — контракт 1-бис P7.0a);
     id = `LemmaCanon.annulId(annul_of)` (reviewId ЗАПРЕЩЁН); double-annul → тот же
     id → dup (идемпотентность по построению); kind='annul', grade=null,
     source='agent:correction', reviewed_at = серверное now, meta =
     {keyer_version, annul_of, reason};
   - запись тем же ingest+recompute путём; **recompute безусловный по item_key цели**
     (см. п. 3 — replayed-ветка не имеет new_item_keys).

5. **Endpoint `POST /api/agent/review`** (СВОЙ лимитер 60/мин 'agent-review' —
   общий rlAgent 20/мин душил бы сессию из ~20 карточек и флакал гейт; session+CSRF):
   body → `runtime.recordReview(ctx, body)` → `tools.callTool(ctx,
   'record_review_answer', args)` — closed-router остаётся единственными воротами
   записи. Это НЕ UI: нужен web-smoke полного цикла и Mini App P8; P7.2-webhook
   пойдёт через runtime in-process. **Ошибки — по живому паттерну /explain
   (критика: «HTTP 200 {ok:false}» был выдуман):** reviewer ВОЗВРАЩАЕТ
   {ok:false,error} (не бросает — иначе callTool сплющит в TOOL_FAILED), runtime
   анврапит; endpoint мапит: контракт-реджекты → 400 · UNKNOWN_ITEM/
   ANNUL_TARGET_NOT_FOUND → 404 · TOOL_DISABLED (флаг) → 403 · TOOL_FAILED → 500 ·
   **abstain (gradable=false / ktiv-гейт) → 200 recorded:false — вердикт, не ошибка**.

5-бис. **Клиентский crash-window annul-to-null (критика R13, MAJOR — cloud-sync.js):**
   syncDown продвигает down-курсор ПО-СТРАНИЧНО, а recomputeSrsFromLog зовёт один раз
   ПОСЛЕ цикла → краш вкладки между сохранением курсора и рекомпьютом терял addedKeys
   НАВСЕГДА: annul-строка уже в OPFS, курсор за ней, clearSrsState не вызовется никогда
   (counts-reconcile равен, engine-heal не срабатывает, будущих событий по слову нет —
   сервер память удалил). До P7.0c окно было теоретическим (annul-строк не существовало),
   первый писатель делает его живым. Фикс: recompute ключей СТРАНИЦЫ ДО продвижения
   курсора (идемпотентен; финальный recompute уходит). Это client-файл → SW-бамп.

6. **Гейт `smoke:agent-review` (v2 — «зубы» по критике):** матрица двух бутов.
   **Boot OFF:** pure-нога реестра → TOOL_DISABLED/FEATURE_FLAG_OFF; ПОЛНОЦЕННЫЙ
   валидный grade-запрос в endpoint → ошибка И counts+/api/learner/log-хвост (ids)
   байт-неизменны (флаг, проверенный ПОСЛЕ записи, гейт бы поймал). **Boot ON:**
   401/CSRF · status показывает enabled:true · correct → строка через штатный ingest
   (id == пересчитанный LemmaCanon.reviewId, source='agent:review', grade 3,
   провенанс-ключи в meta на сервере) · проекция пересчитана В ТОМ ЖЕ запросе ·
   **идемпотентность: тот же attempt_id повторно → replayed:true, counts
   байт-неизменны** · wrong по read:agent на слове с рецептивной историей → grade 1
   (рецептивный lapse) · PRODUCTION_CHANNEL_LOCKED на dictate:agent — И контроль:
   echo display-леммы по production-каналу НЕ выключает D1 (запись не произошла) ·
   skip → kind='skip' grade 1 · MNAR: empty/не-иврит → /api/learner/log-хвост (ids)
   до/после идентичен (counts-только ассерт слеп к cross-user записи) ·
   ktiv-male ответ → recorded:false, reason='ktiv-candidate', ничего не записано ·
   ANSWER_TOO_LONG · UNKNOWN_ITEM / BAD_CHANNEL / UNKNOWN_ARG / SKIP_WITH_ANSWER /
   sent: / EXPECTED_UNRESOLVED (вкл. skip-путь) → reject, ничего не записано ·
   reserved_source: клиентский батч с НОВОЙ source='agent:review'-строкой →
   rejected; echo СУЩЕСТВУЮЩЕЙ agent-строки → dup · **annul: byte-снимок
   srs_projections-строки ДО ошибочного грейда == снимку ПОСЛЕ annul
   (движко-независимый ассерт — сравнение с FC.replay было бы «согласен сам
   с собой»)**, annul.id==annulId, item_key==цели, meta.reason сохранён ·
   annul-реджекты (missing / sent: / foreign-source / annul-of-annul / без reason /
   старше 24ч) · double-annul идемпотентен · грейд `#`-ключа НЕ грузит
   pealim-датасет (keyingService.status().loaded==false — R16 write-path) ·
   stdout-гигиена: sentinel item_key И sentinel-ответ НЕ в логах сервера ·
   **браузер-нога (паттерн cloud-sync-smoke; ГРЕЙДЫ минтятся в Node-ноге ДО
   открытия страницы — браузерные акты только fullSync+чтение, act-retry-safe):**
   login → fullSync → agent-строки (review+annul) в ЛОКАЛЬНОМ OPFS review_log →
   recomputeSrsFromLog применён → «Зал видит»: локальный getSrsSchedule()[key] ==
   FC.replay(локальный лог) == серверная проекция; annul-to-null → clearSrsState
   (расписание слова исчезло локально).

7. **R17-B разбор развилки «источник expected»** (v2 — формулировки уточнены критикой):
   - (A) клиентский expected — ОТКЛОНЁН: показ и грейд разъезжаются («грейд не того,
     что спрошено»). NB критики: анти-фрод аргумент НЕ преувеличивать — верный ответ
     выводим из самого item_key/из /plan, а /api/learner/ingest и так принимает
     произвольные grade-строки принципала: self-fraud против собственного лога вне
     модели угроз. Реальная ценность (B) = показ==грейд из одного источника, а
     ЧЕСТНОСТЬ production-оси защищается НЕ источником expected, а v1-запретом
     production-каналов (п. 3) до shown-vs-graded.
   - **(B) v1, ВЫБРАН: expected выводится сервером из item_key** + единица обязана
     существовать в логе. Поверхность P7.2 показывает prompt из ТОГО ЖЕ
     displayForItemKey → показ и грейд из одного источника by construction.
     Честное ограничение (уточнено критикой): display-форма = ЛЕММА и для
     pid-ключей, и для большинства `#`-ключей (кейер приоритизирует body.lemma
     над body.word — notes-autogen:377; «skeleton == форма вхождения» верно только
     для слов без утверждённой леммы) → v1-упражнение агента = лемма-рецептив/
     лемма-продукция, НЕ форма-в-предложении (surface-якоря srs_surface —
     device-local OPFS, сервера их нет). Отсюда и рецептивный-only v1 (п. 3).
     NB: для лемма-expected reason 'lemma-not-form' не срабатывает by construction
     (ответ-лемма и есть верный ответ) — не баг, а семантика упражнения.
   - (C) shown-vs-graded через bot_action_log (бот регистрирует показанный prompt,
     record сверяет; prompt_id/update_id → attempt_id) — обязательное условие
     разблокировки production-каналов в P7.2; P7.0c не блокирует.

8. **Развилка владельца (privacy): класс/TTL сырого ответа — РЕШЕНО владельцем
   2026-07-07 = (A).** Сырой ответ НЕ персистится нигде (META_STRIP на обеих
   сторонах + reviewer его не кладёт ни в meta, ни в task-payload; TTL=0 по
   построению) — «не знаем» остаётся по построению. Обоснование владельца: у нас
   уже есть deterministic grader + category + provenance + attempt_id + annul +
   gold-гейты, поэтому для MVP raw answer не обязателен; апелляция несправедливого
   грейда = annul (не нужен сырой ответ ради «судебного разбирательства»).
   **(B) класс C + consent + TTL — НЕ включать до Telegram MVP** (мощнее, но тяжелее:
   consent, TTL, purge-aware; рассматривать при реальных спорах о грейдах в P7.2+).
   (C) derived-скелет — не рассматривается. Дефолт (A) уже реализован в v3.11.117 —
   код-правок НЕТ.

9. **Вне скоупа P7.0c:** Telegram (P7.1/P7.2) · UI-серфейс · включение флага на
   проде · un-annul · annul чужих (не-agent) строк · приватность сырого ответа
   (развилка п. 8) · synthesize_audio (свои гейты) · production-каналы записи
   (разблокировка = P7.2 challenge-binding) · cell-level ktiv-accept (развилка
   владельца) · pid→display сайдкар-индекс без полного бандла (R16-заметка P7.2:
   idle-выгрузка 5 мин + неторопливая tg-сессия = перезагрузка 306MB-бандла на
   каждый pid-ответ) · source-разрез в struggles/lifecycle (наблюдаемость
   анти-циркулярности — вместе с bot_action_log P7.1).

10. **Известные ограничения (зафиксированы, не баги):** серверное reviewed_at может
   лексикографически проиграть клиентской строке с future-skew ≤5мин (FUTURE_SLACK_MS
   ingest-а) — искажение фолда суб-дневное (utcDayDiff), детерминизм и оракул целы ·
   один и тот же контент-ответ в ту же миллисекунду → reviewId-dup (отдаётся
   dup:true честно) · crash-window LWW-марок в syncDown (курсор до применения марок)
   — ПРЕ-существующий, annul-фикс 5-бис его не расширяет; отдельный тикет.

---

## P7.0c — SHIPPED v3.11.117 (2026-07-06); адъюдикация adversarial-критики

Спека v1 → критика (wf_28ac3c6e, 3 линзы R17-B/R11 · R12/R14 · R13/R16+харнесс, замер
по живому коду) нашла **4 BLOCKER (2 из них — одна и та же дыра идемпотентности,
названная независимо всеми 3 линзами) + 8 MAJOR + 8 MINOR** → спека переписана в v2,
затем код. Самое опасное:

- **BLOCKER «идемпотентность мертворождена» (ВСЕ 3 линзы независимо):** id из
  СЕРВЕРНОГО reviewed_at → каждый ретрай/redelivery/act-retry гейта = НОВЫЙ id →
  вторая review-строка за один ответ (reps/lapses завышены, лечится только ручным
  annul). Фикс: **ОБЯЗАТЕЛЬНЫЙ caller-side `attempt_id`** → idempotency_key
  `'agentrev:'+attempt_id`; ретрай реплеит ingest_batches. Гейт: тот же attempt_id
  дважды → replayed, лог байт-неизменен.
- **BLOCKER «lemma-echo переоткрыт для pid/#-ключей» (R17-B + R13):** expected =
  display-лемма, которую /plan сам отдаёт вызывателю → grade-3 по 'dictate:agent' →
  hasProductionSuccess=true НАВСЕГДА → D1 выключен, production_gap отравлен (ровно
  вектор, закрытый P7.0b). Фикс: **channel v1 = ТОЛЬКО рецептивные семьи
  (read/listen)**; production (dictate/reverse) → reject `PRODUCTION_CHANNEL_LOCKED`
  до P7.2 challenge-binding (shown-vs-graded). Рецептив — безопасная сторона (успех =
  рецептивное свидетельство, провал = честный lapse). Гейт-контроль: echo леммы по
  production-каналу НЕ выключает D1 (запись не произошла).
- **BLOCKER «ktiv-male ложный lapse» (R17-B):** expected сервера = хасер display-форма;
  честный ktiv-male ввод (דיבר при лемме דבר) → near_miss → grade 1/2, ложный lapse
  НАВСЕГДА в append-only лог; Зал же принимает male-ПОВЕРХНОСТЬ вхождения (второй
  скелет), которой у сервера v1 нет — сервер СТРОЖЕ Зала. Фикс: **write-gate
  reason='ktiv-candidate' → recorded:false** (расширение MNAR) — честное воздержание
  вместо ложного провала. grader НЕ тронут (gold 58/58 цел).
- **MAJOR «recompute не переигрывается на replay-ветке» (R12):** new_item_keys не
  персистится в batch-результате → крэш между COMMIT и recompute + ретрай оставлял бы
  stale-проекцию навсегда. Фикс: **recompute БЕЗУСЛОВНЫЙ** по известному item_key
  (и live, и replayed).
- **MAJOR «source='agent:*' подделывается» (R14):** штатный ingest принял бы
  клиентскую строку с фальшивым agent-провенансом байт-неотличимо → провенанс
  переставал быть доказательством, annul-scope авторизовался бы неаттестованным полем.
  Фикс: **резерв префикса** — `ingestBatch(..., {trustedAgentSource})`; без флага
  новая agent:-строка → reject `reserved_source`, существующий id → dup (echo-петля
  cloud-sync зелёная).
- **MAJOR «annul = безлимитный ластик» (R17-B):** любой возраст, без причины/окна/
  журнала → селективная инфляция памяти (MNAR-инверсия). Фикс: **reason обязателен +
  окно 24ч** (target старше → `ANNUL_TARGET_TOO_OLD`).
- **MAJOR «crash-window annul-to-null» (R13):** syncDown продвигал down-курсор
  по-странично, recompute — раз ПОСЛЕ цикла → краш терял addedKeys → clearSrsState
  не вызывался никогда (сервер память удалил, клиент планирует по отменённому грейду).
  До P7.0c окно теоретическое (annul-строк не было) — первый писатель делает его живым.
  Фикс: **recompute ключей СТРАНИЦЫ ДО продвижения курсора** (cloud-sync.js, SW-бамп).
- **MAJOR «тихий 0» (R12) + «EXPECTED_UNRESOLVED недостижим» (R12/R14/харнесс) +
  «гейт без зубов» (харнесс):** пост-ассерт записи (recorded только при new/dup/
  replayed); displayForItemKey фолбэчит сырым ключом → reviewer сам детектит (display
  == item_key ∨ без иврита) ДО грейдера И на skip-пути; гейт — движко-независимый
  byte-снимок проекции (не FC.replay «сам с собой»), log-хвост по ids (не counts),
  матрица двух бутов, flag-off zero-write.
- **MINOR-пачка (учтено в v2):** UNKNOWN_ARG whitelist (expected/grade в args →
  reject, не молчание) · SKIP_WITH_ANSWER · свой лимитер 60/мин (rlAgent 20/мин душил
  бы сессию) · ANSWER_TOO_LONG 400 симв · itemRows вынесен в ЕДИНУЮ точку истины
  (learnerProjectionRepo делегирует) · коды ошибок по живому /explain (не выдуманный
  «HTTP 200 {ok:false}») · anti-циркулярность/pid-latency/source-разрез — задокумент.
  как P7.1/P7.2-долг.

**Что критика подтвердила исправным (v2 не меняет):** annul.id=annulId (reviewId
запрещён) · item_key=цели · sent:/foreign/kind-реджекты · MNAR на empty/unsupported ·
grader как единственный судья · user-scope из принципала.

**Гейт `smoke:agent-review` 66/66** (матрица OFF/ON: flag-off zero-write · штатный
ingest+провенанс+id==reviewId · проекция в том же запросе · attempt_id идемпотентен ·
#-ключи без датасета · wrong/skip/MNAR по ids-хвосту · ktiv write-gate · production-lock ·
контракт-реджекты · reserved_source fake/echo · annul byte-restore проекции +
минтер-контракты + 24ч + double-replay + annul-to-null удаляет проекцию · oracle clean
annul_rows=2 · stdout-гигиена · браузер-нога: OPFS down-sync + Зал видит local==replay==
server + clearSrsState). **Регрессия:** grader-gold 58/58 · server-replay 65/65 (v1
golden байт-стабилен) · memory-canon 63/63 · cloud-sync 32/32 · agent-plan 32/32 ·
agent-explain 43/43 · burst 19/19 · mentor-home 25/25 · fsrs 30/30 · grade-policy 24/24 ·
learner-graph 14/14 · learner-ingest 24/24 · auth 26/26 · api-smoke.

**Прод:** флаг `AGENT_REVIEW_WRITE` НЕ задан → инструмент отдаёт FEATURE_FLAG_OFF;
write-контур деплоится dormant, включение — по решению владельца после web-верификации.

**Развилка владельцу (privacy, п. 8 — НЕ решена в коде):** класс/TTL сырого ответа
пользователя. Дефолт реализован = (A) не персистится нигде. См. финальное сообщение
сессии.
