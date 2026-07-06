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
