# Reading Room B7 — physical and assistive acceptance packet

Дата подготовки: 2026-08-12; обновлено 2026-08-13

Статус: **OWNER GENERAL PROD SMOKE PASS · IOS SAFARI PARTIAL · AUTOMATION/PRODUCTION READ-BACK PASS · FULL PHYSICAL/AT MATRIX PENDING**

Release under test: production `3.11.364` / implementation chain
`845ddc71` + `04f88328` + `85bdc9de` + compact-copy follow-up.

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

1. Открыть Room → My Texts и Ben-Yehuda; проверить карточки `available`,
   `limited`, `needs profile/not prepared`, `stale/unsupported` где доступны.
2. Открыть «Почему/Подробнее»: имя кнопки, logical reading order, exact buckets,
   provenance и caveat доступны без hover.
3. Закрыть details клавиатурой/AT и проверить возврат фокуса на исходную
   карточку.
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
| B7-IOS-S | iPhone Safari | details, pending, offline, large text, HE/RTL | focus returns; statuses/provenance readable; no overflow/fake zero | PARTIAL — owner general production smoke PASS on `3.11.363`; supplied iPhone screenshot; copy-density issue fixed in `3.11.364`; full row not attested |
| B7-IOS-P | iPhone standalone PWA | eviction/reopen, warm offline, update waiting | no mid-flow reload/data loss; prepared cache survives | NOT RUN |
| B7-IOS-VO | iPhone Safari/PWA + VoiceOver | rotor/order, details, status, reset/disable | controls named; no duplicate announcements; logical RTL | NOT RUN |
| B7-AND | Android Chrome/PWA | Worker failure/quota/reconnect, text scaling | usable cards; honest failure; one refresh | NOT RUN |
| B7-TB | Android Chrome/PWA + TalkBack | browse/details/status/reset | named controls, focus retained, no announcement storm | NOT RUN |
| B7-NVDA | Windows 11 Chrome + NVDA | reason/buckets/provenance order and focus return | exact facts announced; no tooltip-only data | NOT RUN |
| B7-MAC-VO | macOS Safari + VoiceOver | WebKit details/status semantics and HE/RTL | logical order/focus; no clipped facts | NOT RUN |
| B7-KBD-200 | physical keyboard, desktop 200% | full browse/details/disable/reset without pointer | visible focus, no trap/overlap, all actions reachable | NOT RUN |
| B7-AUTO | isolated Chromium matrix | 320–1366/status/privacy/budgets/desktop paint/copy density | `125/125`; compact RU/EN/HE copy; not physical/AT | PASS — automation |
| B7-OWNER-DESKTOP | signed-in owner Chrome via Kapture, read-only | My Texts + group details, SW safe update, checksums | `3.11.363`; 48/48 details on both surfaces; canonical hashes unchanged; not physical/AT | PASS — owner-profile read-only browser evidence |

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

B7 остаётся `ENGINEERING PASS / OWNER GENERAL SMOKE PASS / PHYSICAL-AT PARTIAL`, пока обязательные строки
не имеют owner evidence или явного documented exception. Только после owner
acceptance можно подготовить closure; production `3.11.364` уже развёрнут и
проверен, но сам по себе physical/AT строки не закрывает.
