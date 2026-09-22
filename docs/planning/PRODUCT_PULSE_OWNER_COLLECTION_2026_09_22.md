# Product Pulse — включение реальной активности владельца

Дата: 2026-09-22. База: 5d678e9b / 3.11.608.
Статус: 3.11.610 released; сбор и рост подтверждены; полный owner-live matrix частичен.

Решение владельца: реальные действия owner с ПК/Android включаются в основную
статистику постоянно, включая период после проверки. Откат фильтра и удаление
проверочных owner-событий не планируются; действует общий TTL 90 дней.
Это меняет состав выборки с релиза 3.11.609, но не wire schema 2
и не определения событий. Исторически исключённые события не восстанавливаются.

Причина нулей: config возвращает authenticated owner collect:false; приём событий
и server operation_result повторно исключают owner. Определение устройства не участвует.

Маршрут: убрать role-based exclusion, сохранить исключение NODE_ENV=test,
loopback/webdriver и явного opt-out. Обновить copy/privacy/canon. Проверить реальный
API на disposable production-mode server с fake Umami: owner collect/accept,
named event/pageview, duplicate, explicit opt-out, недоступный backend и auth read.
Проверить sender, UI, version/integrity и обязательные release gates.

Production acceptance: исходные счётчики -> реальные открытия Studio/Room/Mediatheque
и учебные действия -> delivery -> Umami -> рост dashboard после истечения read cache.
Не подменять реальные события ручными POST. Owner walkthrough разрешён этим запросом;
не создавать оценок SRS, заметок или платных provider операций ради счётчиков.
Android остаётся отдельным физическим сценарием владельца.

Ops: по отдельному разрешению владельца удалены только три неиспользуемых app
image (3332685a, b533bb50, 1c4e2a5d). Текущий и два rollback-образа сохранены,
12 контейнеров и 4 volumes сохранены. Диск: 73%, около 10 ГБ свободно,
build cache=0. Фактически освобождено около 2,9 ГБ из-за общих слоёв.

Automated: npm test 1875/1875 PASS; Product Pulse API/browser (380/768/1440,
zero/partial/outage/privacy/focus/contrast) PASS; API smoke, ingest PASS;
learner-ingest 24/24, FSRS 140/140 PASS. После очистки health DB/migrations ready,
disk_warn=false, 73%. Production/owner-live evidence добавляется после deploy.

scripts/product-pulse-owner-smoke.js PASS — настоящий production-mode
HTTP API + disposable DB + fake Umami; owner collect=true, доставка трёх surfaces,
dedupe, opt-out, read auth и изоляция downstream outage.

3.11.609 / bc0c9d8d deployed. Owner-live: сервер отчитался о пяти доставках,
но Umami/panel оставались нулевыми. Дополнительный транспортный дефект:
установленный isbot отвергает фиксированный `LinguistPro-Product-Pulse/1`;
Umami send route возвращает HTTP 200 beep:boop без записи. Проверено read-only
на фактическом compiled module: старый UA isbot=true, новый фиксированный
`Mozilla/5.0 (LinguistPro Product Pulse)` isbot=false. Глобальный bot-check
не отключается, реальный UA пользователя не передаётся.
Сверенный upstream: https://github.com/umami-software/umami/blob/v3.0.3/src/app/api/send/route.ts
(bot check возвращает beep:boop; receipt выдаётся после saveEvent).

Расширение маршрута, hotfix 3.11.610: совместимый фиксированный UA, проверка
sessionId/visitId receipt вместо одного HTTP status; regression на silent drop.
Owner inclusion остаётся постоянным. До подтверждённого роста end-to-end
acceptance не закрыт; прежний delivery counter не считать доказательством записи.

Hotfix gates: npm test 1876/1876; Pulse owner/API/UI/wire smoke; API smoke;
ingest 22; learner-ingest 24/24; FSRS 140/140; memory-canon 90/90 — PASS.
Перед второй сборкой по прежнему разрешению удалён только unused build cache
(Docker reported 2,302 GB; после очистки 76%, 8,9 GB free, cache=0).
14 образов, 12 контейнеров, 4 volumes сохранены; новых image deletions нет.

## Production evidence 2026-09-22, 11:05–11:15 UTC

- Runtime commit `8a66e16cc1799d8496a7cf1d16966b3295677eab` включает
  `bc0c9d8d`; main/origin main совпадают. Активный app image имеет tag runtime commit.
- Served 3.11.610: 112 shellIntegrity assets сверены с committed bytes, отдельно
  SW/pulse JS/CSS; APP_VERSION, CACHE_VERSION, Room footer согласованы.
- После сборки health показывал disk_warn=true (84%). Inventory → только
  разрешённый unused builder prune. После: cache=0, 15 images, 12 containers,
  4 volumes; 7,9 GB free. Три no-cache health: DB/migrations ready,
  disk_pct_used=79, disk_warn=false. Дополнительные образы не удалялись.

## Owner-live evidence (реальный Chrome, не Android)

Реальные действия интерфейса; без ручных POST/вызовов telemetry emit. До hotfix
все v2 usage=0. После, видимо на owner /pulse.html (7 дней UTC):

| Сигнал | До | После |
| --- | ---: | ---: |
| app_open | 0 | 6 |
| material_open | 0 | 4 |
| material_started | 0 | 3 |
| material_engaged | 0 | 2 |
| study_started | 0 | 3 |
| study_engaged | 0 | 2 |
| study_completed / audio_engaged / operation_result | 0 | 0 |

Delivery: 20 подтверждённых named events, unavailable=0; Umami pageviews=6.
Это проверочные открытия/документы, не шесть людей. Данные owner остаются;
специальной послетестовой очистки не проводилось.

Подтверждены Studio restore из Library (my_texts): open+started; Room
Бен-Иегуда: open+started+engaged; Медиатека → Room/public_study_songs:
open+started+engaged с entry_point=mediatheque. Read-агрегат и видимая панель
показывают эти разрезы. 30s engagement проверен с доверенными UI-действиями
при фокусе, не одним ожиданием. Оценки SRS/заметки/«Прочитано» не нажимались,
новые платные запросы не запускались; независимый review_log diff не снимался.

Границы acceptance: повторный explicit Library-open и engagement в Studio
не завершены — контроль больших вкладок терял browser debugger attachment;
переоткрытие вкладки восстановило загрузку, но не устойчивый walkthrough.
Все шесть корпусов, IDE, HTML-media/audio, completion и платные operation outcomes
не объявляются полностью проверенными owner-live; contract/integration gates зелёные.
Физический Android и AT отдельно не проверены. Следующий контроль владельца:
применить обновление до 3.11.610, заново открыть поверхность/материал, совершить
учебные действия; затем дождаться cache ≤30s + polling 60s и сравнить прирост.
Не восстанавливать потерянные события искусственно; D7/D30 по-прежнему не измеряется.
