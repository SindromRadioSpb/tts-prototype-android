# Reading Room B6 — D6 physical acceptance packet

Дата подготовки: 2026-08-12

Статус: **READY TO EXECUTE · ALL PHYSICAL/ASSISTIVE ROWS PENDING · GA NO-GO**

Release under test: `3.11.360` / implementation `485ba466`.

## Неподвижные правила

1. Owner profile используется read-only для Room navigation: не оценивать
   карточки, не менять word status, не завершать review и не создавать
   синтетические owner events.
2. До и после owner-live прогона фиксируются только агрегат `review_log` и его
   checksum. Они обязаны совпасть. Открытие очереди допустимо, grading — нет.
3. Synthetic 5k разрешён только в отдельном локальном профиле/установке. Не
   импортировать fixture в owner profile и не синхронизировать его в cloud.
4. Для каждого шага записать device/OS/browser/PWA mode, locale/theme,
   online/offline transition, observed result и ссылку на screenshot/video/log.
5. Automation evidence не заполняет physical или assistive row.

## Матрица исполнения

| ID | Среда | Обязательный сценарий | Acceptance | Статус/evidence |
|---|---|---|---|---|
| D6-WIN | Win11 Chrome, owner profile | read-only counts/browse; filter; Back/Forward; reload; waiting update в reader | exact route/filter/anchor; нет write/reload до safe point; review checksum unchanged | PENDING |
| D6-C380 | Chromium 380 RU + HE/RTL, light/dark | 1k/5k, paging, tail search, offline/reconnect | exact total; ≤48 cards; no overflow; honest status | AUTOMATION PASS, not physical |
| D6-ZOOM | Chromium desktop 1280 + 200% | keyboard order, visible focus, status/live regions, targets | no trap/overlap; logical order; ≥24×24 CSS px | AUTOMATION PASS · MANUAL PENDING |
| D6-IOS-S | iPhone Safari | reload and Back/Forward; warm/cold offline; missing remote work | restore best effort; no false empty catalog; exact offline-partial | PENDING |
| D6-IOS-P | iPhone standalone PWA | process eviction; pending update while reader open; reopen | no mid-write reload; restore/fallback explicit; local work opens warm offline | PENDING |
| D6-AND | Android Chrome PWA | offline/reconnect/update; synthetic 5k if capacity permits | single deduped refresh; no LocalDb loss; safe activation | PENDING |
| D6-NVDA | NVDA + Chrome | route, result count, filters, pager, reconnect | announcements meaningful/non-duplicated; focus retained | PENDING |
| D6-VO | VoiceOver + Safari/PWA | rotor/order, RTL, Back and post-update focus | logical reading order; exact restored control/context | PENDING |
| D6-TB | TalkBack + Android Chrome | browse/filter/page/reconnect announcements | controls named; state/count announced; no focus loss | PENDING |

## Safe-update сценарий

1. Открыть local text, перейти на строку без grading/review actions.
2. Дождаться `update-ready`; убедиться, что reload не произошёл автоматически.
3. Выполнить явное «Обновить» в safe point.
4. Подтвердить canonical progress flush/read-back и возврат в тот же
   presentation context. При dirty Studio workspace обновление должно быть
   отложено до явного safe point.
5. Сравнить `review_log` aggregate/checksum до/после.

## Offline/reconnect сценарий

1. Online один раз открыть shell и выбранный local work.
2. Перейти offline и выполнить reload/standalone reopen.
3. Local content должен оставаться доступным; недоступный remote body обязан
   дать `offline-partial`, не пустой каталог.
4. Вернуть сеть. Должен произойти один deduped capability refresh без full
   navigation и без очистки LocalDb.

## Evidence record

Для каждого ID заполнить:

```text
ID:
device / OS / browser build / display mode:
locale / direction / theme / zoom or text size:
precondition and network state:
steps actually executed:
observed result:
review_log before / after aggregate+checksum:
artifact paths:
verdict: PASS | FAIL | BLOCKED
tester / timestamp:
```

## Финальный verdict

- `GA GO` разрешён только если все physical/assistive rows имеют `PASS`,
  `review_log` unchanged и нет unresolved P0/P1.
- Любой `PENDING`, `FAIL` или недоказанный checksum сохраняет `GA NO-GO`.
- Owner acceptance должна быть явной строкой; отсутствие замечаний не считается
  подтверждением.
