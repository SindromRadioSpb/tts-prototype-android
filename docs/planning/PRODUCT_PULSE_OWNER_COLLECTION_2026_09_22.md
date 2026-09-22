# Product Pulse — включение реальной активности владельца

Дата: 2026-09-22. База: 5d678e9b / 3.11.608. Статус: implementation.

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
