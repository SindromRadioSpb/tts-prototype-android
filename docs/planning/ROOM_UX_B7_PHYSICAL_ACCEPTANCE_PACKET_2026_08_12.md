# Reading Room B7 — physical and assistive acceptance packet

Дата подготовки: 2026-08-12; обновлено 2026-08-13

Статус: **CLOSED · OWNER ACCEPTED · AVAILABLE PHYSICAL SMOKE PASS · REMAINING AT/ANDROID DOCUMENTED EXCEPTIONS**

Release under test: production `3.11.373` / implementation chain
`845ddc71` + `04f88328` + `85bdc9de` + compact-copy follow-up + cold-library
hardening `1298bb71` + packet hardening `73e74a37` + full-corpus preparation
`d97930a8` + limited-only sort UX `86f5189c` + corpus finishing `9dd225f0` +
sync contract/replay `4818cd6e` + `9cf51982` + cross-device projection
convergence `12f0e47f`.

Production deploy был отдельно явно авторизован владельцем и прошёл
served-byte/health read-back. В каждой строке всё равно фиксировать exact
served/installed version; staged/PWA cache может отличаться до safe update.

## Неподвижные правила

1. При agent-assisted проверке owner profile — только read-only Room navigation
   и B7 details. Reset/disable выполнять на synthetic profile либо самим
   владельцем/после отдельного явного разрешения. Не grade/review, не менять
   word status и не завершать review.
2. До/после фиксировать aggregate+checksum `review_log`; значения обязаны
   совпасть. По возможности также фиксировать `word_status` и progress
   checksum.
3. Reset/disable удаляет только local calibration ledger. Familiarity,
   progress, vocabulary, notes, bookmarks и cache ingredients не меняются.
4. Automation artifact не заполняет physical/AT row.
5. FAIL любого P0/P1 останавливает closure/deploy; записать exact repro,
   version, locale/theme/source/status и artifact path.

## Краткий общий smoke

Для каждой среды:

1. Открыть Room → My Texts, Study Songs и Ben-Yehuda; Reader не открывать,
   дождаться точного `prepared/total`, затем проверить карточки `available`,
   `limited`, `needs profile/not prepared`, `stale/unsupported` где доступны.
   `Сначала достоверно знакомые` должна быть доступна везде; limited-only
   выбор отклоняется с объяснением, пока uncertainty превышает D1 budget.
2. Открыть «Почему/Подробнее»: имя кнопки, logical reading order, exact buckets,
   provenance и caveat доступны без hover. На карточке остаётся ровно один
   audio label: `полностью N/N`, `частично N/N` или `отсутствует`.
3. Открыть details другой карточки, нажать вне панели и затем проверить
   `Escape`: одновременно открыта одна панель, а keyboard focus возвращается
   на исходный summary.
4. Проверить pending→available/failure: карточка остаётся читаемой, нет
   announcement storm, fabricated `0%` или обещания понимания.
5. При готовой калибровке проверить диапазон; выполнить disable, затем enable
   и reset. Familiarity остаётся, время исчезает, canonical checksums неизменны.
6. Warm offline: prepared local signal остаётся; unprepared group честно
   говорит `not prepared/offline`. После reconnect нет duplicate refresh.
7. HE/RTL и 200%/large text: без horizontal scroll, clipping, overlap или
   инверсии semantic order.

## Матрица исполнения

| ID | Среда | Дополнительный фокус | Acceptance | Статус/evidence |
|---|---|---|---|---|
| B7-IOS-S | iPhone Safari | details, pending, offline, large text, HE/RTL; cross-device counters after foreground sync | focus returns; statuses/provenance readable; no overflow/fake zero; due/in-work equal PC at the same observation time | PASS — owner-reported prescribed compact production smoke on `3.11.373`: all three corpora/details, RTL and 200% PASS, no remarks; iPhone↔PC convergence separately PASS; exact final counters not transcribed |
| B7-IOS-P | iPhone standalone PWA | eviction/reopen, warm offline, update waiting | no mid-flow reload/data loss; prepared cache survives | PASS for reopen/warm-offline/reconnect on `3.11.373`; isolated physical `update waiting` transition NOT RUN — owner-accepted documented exception |
| B7-IOS-VO | iPhone Safari/PWA + VoiceOver | rotor/order, details, status, reset/disable | controls named; no duplicate announcements; logical RTL | NOT RUN — owner-accepted documented exception; no VoiceOver PASS claim |
| B7-AND | Android Chrome/PWA | Worker failure/quota/reconnect, text scaling | usable cards; honest failure; one refresh | NOT RUN — owner-accepted documented exception; no Android PASS claim |
| B7-TB | Android Chrome/PWA + TalkBack | browse/details/status/reset | named controls, focus retained, no announcement storm | NOT RUN — owner-accepted documented exception; no TalkBack PASS claim |
| B7-NVDA | Windows 11 Chrome + NVDA | reason/buckets/provenance order and focus return | exact facts announced; no tooltip-only data | NOT RUN — owner-accepted documented exception; no NVDA PASS claim |
| B7-MAC-VO | macOS Safari + VoiceOver | WebKit details/status semantics and HE/RTL | logical order/focus; no clipped facts | NOT RUN — owner-accepted documented exception; no macOS/VoiceOver PASS claim |
| B7-KBD-200 | physical keyboard, desktop 200% | full browse/details without pointer | visible focus, no trap/overlap, all actions reachable | PASS — owner-reported prescribed PC keyboard + 200% smoke on `3.11.373`, no remarks |
| B7-AUTO | isolated Chromium matrix | 320–1366/status/privacy/budgets/desktop paint/copy density/full readable corpora; projection crash/retry/heal | final `3.11.373` rerun: unit `50/50`, B7 browser `161/161`, cloud sync `32/32`, Studio↔Room SRS `49/49`, i18n `233/233`, canon `18/18`, Memory Canon/FSRS `79/79`; real-browser word-status smoke PASS; earlier maturity `838/838` and Lighthouse a11y 100 remain release evidence; not physical/AT | PASS — automation |
| B7-OWNER-DESKTOP | signed-in owner Chrome via Kapture, read-only | three corpora, SW safe update, full preparation, exact audio/alignment/details, packet/body boundary, shared sort, sync/checksums | corpus-finishing `3.11.372`: 10/10 assets and all corpora prepared; sync repair `3.11.373`: 6/6 changed assets, heal marker `v1`, `review_log` unchanged local/cloud at 7,315, PC projection corrected `210/335 → 205/335` without learner events | PASS — owner-profile read-only browser evidence; not physical/AT |

## Evidence record

```text
ID:
hardware / OS / browser or PWA build / AT build:
served or installed app version:
locale / direction / theme / zoom or text size:
source and B7 statuses exercised:
steps actually executed:
expected / observed:
review_log aggregate+checksum before / after:
word_status/progress checksum before / after (if captured):
artifact paths:
verdict: PASS | FAIL | BLOCKED
tester / timestamp:
```

## Closure rule

B7 closure допускается, когда обязательные строки имеют owner evidence или
явный documented exception. Владелец, увидев точный остаток после компактного
smoke, сообщил `считаем эту проверку закрытой`; эта строка принимает перечисленные
`NOT RUN` строки как documented exceptions, но не как PASS. Engineering production read-back
завершён through `3.11.373`, включая все три корпуса, corpus-finishing и
cross-device projection repair
interactions. Exact evidence:
[`corpus-finishing/`](../research/room-ux-b7-learning-compass/2026-08-13/corpus-finishing/README.md).
Cross-device evidence:
[`cross-device-sync/`](../research/room-ux-b7-learning-compass/2026-08-13/cross-device-sync/README.md).
Closure verdict:
[`ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md`](./ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md).
Ни один production deploy сам по себе physical/AT строки не закрывает.

## Owner compact physical smoke — 2026-08-13

Owner report for production `3.11.373`:

```text
iPhone Safari + RTL + 200%: PASS
PWA reopen + offline/reconnect: PASS
PC keyboard + 200%: PASS
Замечания: нет
```

This evidence fills only the named interactions. VoiceOver, Android/TalkBack,
NVDA and macOS/VoiceOver remain `NOT RUN`; PWA `update waiting` remains a
separate unobserved transition. The owner subsequently closed the check with
these rows recorded as accepted exceptions. Structured record:
[`physical-at-owner-smoke/OWNER_SMOKE_EVIDENCE.json`](../research/room-ux-b7-learning-compass/2026-08-13/physical-at-owner-smoke/OWNER_SMOKE_EVIDENCE.json).
