# CLG-P7.3c — adaptive backoff + /notoday + /mute + RETURN_AFTER_GAP: RECON + SPEC (2026-07-09)

> Продолжение P7.3a (foundation + DUE_READY-нудж, owner live-verified 2026-07-09, флаг ON). P7.3a шлёт
> ОДИН нудж в разрешённый день. P7.3c добавляет АДАПТАЦИЮ к реакции пользователя: engagement CROSS-
> SURFACE, игнор→РЕЖЕ (не чаще!), /notoday, /mute, мягкий RETURN_AFTER_GAP БЕЗ guilt. Owner-бриф 2026-07-09.

## 0. Что уже есть (P7.3a foundation — REUSE)

- `nudge_ledger (user_id, local_day, channel, reason, last_nudge_at, consecutive_ignored)`, PK(user_id,
  local_day) — колонки `last_nudge_at`/`consecutive_ignored` ЗАЛОЖЕНЫ под backoff (migration 032).
- `nudgeRepo.runNudgeSweep` — ЕДИНСТВЕННЫЙ писатель ledger; политика prefs→authorize→окно/quiet→
  claimedToday→due→auth2→claim-before-send. `nudgeLedgerRepo.{claimDay, claimedToday, lastNudge}`.
- `notificationPrefsRepo` (getPrefs fail-closed, setTelegramEnabledTxn). `/stop//resume` в router+webhook-txn.
- Инвариант (адъюдикация P7.3a): engagement/ignored = DERIVED из review_log (не webhook-писатель) →
  единый писатель sweep, нет two-writer гонки. Честный cross-surface counting (R11 honest).

## 1. Engagement — CROSS-SURFACE (не Telegram-myopic; критика P7.3a BLOCKER)

Пользователь НЕ «проигнорировал», если занимался в Зале/PWA, а не написал /review в Telegram.
Источник истины = общий `review_log`. **ENGAGED(since) = ∃ строка review_log kind IN('review','skip')
с `reviewed_at > since` (ЛЮБОЙ канал: bot /review, reading:tap, read:mc, Studio, dictate:tg…).** since
= `lastNudge.last_nudge_at`. (reviewed_at = учебное время; cross-device clock-skew — см. форк.)
Пример: нудж 09:00 → вечером Зал-review → ENGAGED → backoff НЕ растёт.

## 2. Backoff (игнор → РЕЖЕ; НИКОГДА не чаще)

Sweep перед claim'ом дня: `lastNudge = lastNudge(userId)`.
```
если lastNudge == null → первый нудж: consecutive_ignored=0, нуджим (subject окно/due/бюджет)
иначе:
  engaged = ENGAGED(lastNudge.last_nudge_at)
  если engaged → нудж «сработал» → new consecutive_ignored=0, eligible (subject окно/due/once-day)
  иначе (проигнорирован):
    delay = backoffDays(lastNudge.consecutive_ignored)          // лестница (форк)
    если local_day(now) >= local_day(lastNudge) + delay → нуджим, new count = prev+1
    иначе → skip:backoff (ещё рано)
```
consecutive_ignored пишется на НОВУЮ ledger-строку (derived-running-count; single writer=sweep). delay
считается по ЛОКАЛЬНЫМ дням (tz). **Лестница-гипотеза (owner: интервалы через спец+критику):**
`{0→1день (норма), 1→2 (пропустить день), 2→4, ≥3→7 (недельно, «временно замолчать»)}`.

## 3. /notoday — «сегодня больше не напоминать»

Явный «не сегодня» ≠ игнор. Реализация: `claimDay(userId, todayLocal, 'notoday', 'notoday')` — занимает
день → sweep видит claim → skip:budget → нудж не уйдёт. НЕ влияет на SRS. НЕ инкрементит consecutive_
ignored (engagement-логика: 'notoday'-день исключён из ignore-счёта). Если день уже нуджнут (claim есть)
— /notoday идемпотентен (день уже занят). Гейт link+consent как /stop; запись в webhook-txn.

## 4. /mute [дней] — временно отключить напоминания

`notification_preferences.muted_until` (ISO, tz-aware дата конца). Sweep: `muted_until > now → skip:muted`.
Валидация диапазона (1..N дней, форк N); дефолт при `/mute` без арг (форк, напр. 3). fail-closed (кривой
арг → не молча-0, а reply «формат: /mute 3»). НЕ влияет на /review (по запросу работает). `/resume`
снимает mute тоже (или отдельно — форк). Миграция: +колонка muted_until (033).

## 5. RETURN_AFTER_GAP — мягкий возврат (guilt-free)

После долгого отсутствия (no review_log-активности ≥ X дней; форк X) + due>0 + backoff позволяет → нудж
с reason=`RETURN_AFTER_GAP`. **Копия НЕЙТРАЛЬНА, БЕЗ guilt** (owner-инвариант): «Когда будет удобно, у
тебя есть короткая тренировка на пару минут» — ЗАПРЕЩЕНО «пропустил»/«потерял серию»/«давно не». **Сырой
count ПОДАВЛЕН** (не «47 слов» — overwhelm; критика P7.2d-diff): «короткая тренировка», без числа. Reason-
priority: RETURN_AFTER_GAP > DUE_READY (детерминированный pick, decoupled от ledger-ключа).

## 6. Инварианты (нельзя ослаблять; наследуют P7.3a)

Единый писатель ledger=sweep; engagement DERIVED из review_log (cross-surface, честно) · backoff ТОЛЬКО
удлиняет (никогда чаще) · /notoday/mute НЕ влияют на SRS/review · RETURN_AFTER_GAP БЕЗ guilt + без сырого
count · claim-before-send/at-most-once · quiet/window/tz DST-safe · consent recheck · класс A · GDPR
user_id-колонки · /mute//notoday запись в webhook-txn (атомарно, роутер read-only) · fail-closed.

## 7. Гейт `smoke:telegram-nudge` (расширить, независимо)

+кейсы: engaged cross-surface (Зал-review между нуджами → backoff НЕ растёт, consecutive_ignored=0) ·
ignored ладдер (1→skip день, 2→+пауза, ≥3→недельно) · /notoday (claim день → нудж skip, НЕ ignore) ·
/mute N (muted_until → skip; кривой арг → reply, не молча) · RETURN_AFTER_GAP (long gap → soft copy БЕЗ
count/guilt) · backoff НЕ уходит в «чаще» ни в одном пути. Регрессия P7.3a + web-push зелёные.

## 8. Открытые форки (owner + критика)

1. **Backoff-лестница** (owner: «интервалы через спец+критику»): `{1,2,4,7}` дней по ignore-count vs
   мягче/жёстче vs экспоненциально. + порог «замолчать» (≥3 → недельно? или совсем стоп до engagement?).
2. **Engagement-сигнал**: review_log `reviewed_at > last_nudge_at` (учебное время, cross-device skew) vs
   `ingested_at` (серверный приём, монотонно) vs «due-count упал». Рекоменд.: reviewed_at + (due-drop как OR).
3. **Backoff-state модель**: DERIVED из ledger+review_log (running consecutive_ignored на строке; рекоменд.,
   single-writer) vs отдельная nudge_state-таблица (user_id PK).
4. **/mute диапазон + дефолт** (1..30? деф. 3?) · **RETURN_AFTER_GAP порог X** (≥7 дней тишины?) · снимает
   ли /resume также mute.

## 8b. OWNER-РЕШЕНИЯ (2026-07-09) — все 4 рекомендованные

1. **Backoff-лестница `{1,2,4,7}`** дней по consecutive_ignored: 0→ежедневно, 1→через 1 день, 2→через 3
   дня (delay 4-от-дня? — уточнить: «через N дней» = delay N; лестница delay = {1,2,4,7}), ≥3→раз в
   неделю. **ЛЮБАЯ активность (Зал/PWA/bot) → сброс к 0 → снова ежедневно.**
2. **Engagement = `reviewed_at > last_nudge_at` ИЛИ due-count упал** (двойной сигнал страхует cross-
   device clock-skew + синк-лаг).
3. **Backoff-state DERIVED на ledger-строке** (running consecutive_ignored, колонка уже в migration 032;
   единый писатель=sweep; GDPR авто-покрыт; без новой таблицы).
4. **/mute 1..30 дней (деф. 3)**; вне диапазона → reply «формат: /mute 1..30» (fail-closed). **RETURN_
   AFTER_GAP при ≥7 дней тишины** (no review_log-активности). **/resume снимает и mute.**

## 8c. АДЪЮДИКАЦИЯ дизайн-критики (wf_e9b7e615, 2026-07-09) — 2 BLOCKER + 2 owner-форка ПЕРЕСМОТРЕНЫ

Критика (3 линзы) нашла 2 BLOCKER и реальные дефекты в 2 из 4 owner-форков. Скорректированный дизайн
(к подтверждению owner ДО кода — критика перевернула его явные выборы):

- **[BLOCKER×2 — /notoday через ledger]** claimDay из webhook = (а) ВТОРОЙ писатель ledger (ломает
  single-writer, на котором держится вся модель); (б) lastNudge() `ORDER BY last_nudge_at DESC` БЕЗ
  channel-фильтра → notoday/push-строка СБРАСЫВАЕТ telegram-backoff в 0 → «не сегодня»/push дают БОЛЬШЕ
  нуджей. **ФИКС:** /notoday//mute — НЕ ledger; snooze в `notification_preferences` (webhook-писатель),
  запись в phase-1 txn (setSnoozeTxn(db,…) как setTelegramEnabledTxn); sweep ЧИТАЕТ как skip-предикат.
- **[ПЕРЕСМОТР форк-3 — backoff-state]** derived-на-ledger СЛОМАН: ledger общий кросс-канальный (push+
  telegram+notoday делят PK(user,local_day)) → lastNudge берёт чужую строку → reset backoff. Плюс reset
  теряется в дни без send (push занял день / due=0 / окно закрыто). **ФИКС: отдельная `nudge_state
  (user_id PK, consecutive_ignored, last_nudge_at, last_engaged_at)` — ЕДИНСТВЕННЫЙ писатель=sweep,
  мутируется на КАЖДОМ tick** (не только на send). ledger остаётся кросс-канальным per-day CLAIM-арбитром;
  nudge_state держит telegram-backoff. Каждая таблица = ОДИН писатель (prefs←webhook, nudge_state←sweep,
  ledger←sweep).
- **[ПЕРЕСМОТР форк-2 — engagement]** reviewed_at (клиентское) vs last_nudge_at (серверное) → clock-skew/
  синк-лаг → ложный ignore → backoff на активном. review_log ловит ТОЛЬКО оценённые тапы, не reading-only
  Зал (learner_events). **ФИКС: engagement = ∃ строка (review_log ИЛИ learner_events sentence_read/
  word_clicked/audio_played) с `ingested_at > nudge_state.last_nudge_at`** (серверное, монотонно; худший
  случай = ложный engaged = сброс к норме ≤1/день, безвреден). ИЛИ reviewed_at>since (lenient OR).
  due-drop ОТЛОЖЕН (нужен снапшот due-at-nudge — колонки нет; не в MVP).
- **[MAJOR — /mute×backoff]** mute-перерыв без учёбы → post-mute sweep засчитывает pre-mute нудж как
  ignored → наказание за честность. **ФИКС:** muted-интервал = как notoday (НЕ инкрементит; на unmute
  не считать pre-mute нудж ignored).
- **[MAJOR — backoff telegram-only, push игнорит backoff]** push делит бюджет, но не подчиняется backoff
  → на backed-off день push всё равно нуджит. **ФИКС (обсудить):** либо push тоже чтит telegram-backoff
  (единый), либо явно задокументировать push = ежедневно-в-окне независимо (backoff = telegram-only УХ).
  Рекоменд.: для MVP push остаётся ежедневным (он уже за общим бюджетом 1/день; backoff — про telegram-
  канал), задокументировать.
- **[MINOR]** RETURN_AFTER_GAP = COPY-SWAP на eligible-нудже при last_engaged_at ≥7дн (не отдельное
  раннее касание; guilt-free, без count) — не «выбирается» из backoff, просто меняет копию. muted_until =
  конец N-го LOCAL-дня через localParts (DST-safe), хранить UTC-Z. /notoday ответ раздельный (день не
  нуджнут → «понял, сегодня не напомню»; уже был → «на сегодня всё, до завтра»). /mute//notoday запись
  phase-1 txn (не phase-2 best-effort). Формулировку router.js /stop-коммента поправить (пишется в txn).
- **[n=1 phasing — owner-решение]** лестница {1,2,4,7} на 1 юзере — недоказуемые константы. Рекоменд.:
  СРАЗУ ценно = engagement-reset (не наказывать занимавшегося) + RETURN_AFTER_GAP guilt-free + /mute//
  notoday; лестницу оставить {1,2,4,7} как ТЮНИНГ-КОНСТАНТУ (легко поменять). Owner: строить полностью
  или поэтапно?

**Скорректированные форки к owner:** (2) engagement ingested_at+learner_events (не reviewed_at); (3)
отдельная nudge_state (не derived-на-ledger). + push×backoff политика + phasing.

**OWNER 2026-07-09 (финал):** push = ЕЖЕДНЕВНЫЙ (backoff = TELEGRAM-only, документировать) · строить ВСЁ
сразу (лестница {1,2,4,7} = тюнинг-константа). Итоговая модель к коду:
- `notification_preferences` += `muted_until TEXT` (UTC-Z instant; /notoday=start-of-tomorrow-local,
  /mute N=start-of-(today+N)-local; sweep skip если now<muted_until), `last_interaction_at TEXT`
  (/mute//notoday ставят → считается engagement, backoff-reset; webhook-писатель, sweep читает).
- `nudge_state (user_id PK, consecutive_ignored INT, last_nudge_at TEXT, last_engaged_at TEXT)` —
  sweep-ЕДИНСТВЕННЫЙ писатель, мутируется каждый tick.
- engagedSince(userId, sinceIso) = ∃ (review_log ИЛИ learner_events) `ingested_at > since` ИЛИ
  prefs.last_interaction_at > since. LADDER delay-days = [1,2,4,7][min(count,3)]. engaged→count=0.
- reason RETURN_AFTER_GAP если last_engaged_at ≥7дн назад / null (copy-swap, guilt-free, БЕЗ count).
- /notoday//mute//resume — router-дескриптор → server.js phase-1 txn (setSnoozeTxn/setMuteTxn/clearMute).
- push (pushRepo) НЕ трогаем backoff (остаётся ежедневным за общим бюджетом).

## 8d. ДИФФ-КРИТИКА (3 линзы wf_7218a4f4, 2026-07-09) — NO BLOCKER; 2 MAJOR + MINOR исправлены ДО коммита

Backoff-механика (лестница, once-per-local-day, muted-skip до backoff, cross-surface ingested_at, single-
writer nudge_state, GDPR) — ВЕРНА. Исправлено:
- **[MAJOR mute сокращал backoff]** setMuteTxn писал last_interaction_at, sweep считал это engagement →
  RESET consecutive_ignored → после mute ЧАЩЕ (недельно→ежедневно). Нарушало «backoff только удлиняет».
  **ФИКС:** last_interaction_at УБРАН ЦЕЛИКОМ (миграция 033 + repo); engagement-reset = ТОЛЬКО реальная
  учёба (review_log/learner_events). mute/notoday НЕЙТРАЛЬНЫ к backoff. Гейт: MC (/mute+/resume → count 2→2).
- **[MAJOR push игнорил mute]** /notoday//mute гасили только Telegram; push шёл во время тишины («сегодня
  не напомню» ложь). **ФИКС:** pushRepo чтит muted_until (кросс-канальная тишина). Гейт web-push +muted-skip.
- **[MINOR ledger reason]** claimDay hardcoded 'DUE_READY' даже для RETURN_AFTER_GAP. **ФИКС:** reason
  вычисляется ДО claim, пишется в ledger. **[MINOR last_engaged_at]** stamped nowIso на non-engaged send
  → ложный «engaged now». **ФИКС:** `engaged ? nowIso : state.last_engaged_at` (COALESCE сохраняет).
  **[MINOR mark-kind]** engagedSince фильтровал review_log kind 'mark' — убран (engagement = review/skip +
  learner_events reading). **[MINOR router-коммент]** /stop «вне txn» → поправлен на «phase-1 txn».
- **[MINOR гейт-дыры → закрыты]** ladder-INCREMENT-on-send (INCR: count 1→2), delay-4-skip (INCR2), mute-
  нейтральность (MC), push-muted (web-push). Гейт telegram-nudge 51→**54**, web-push 20→**21**.

## 9. Дисциплина

Существенный дизайн → adversarial-критика в ФОНЕ (3 линзы R2-R5-педагогика/R11-honest/R14-15-security)
ДО кода → owner-форки → код → критика диффа → независимый гейт → регрессия → commit+push → live-verify.
