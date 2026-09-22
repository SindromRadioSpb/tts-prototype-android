# Product Pulse — privacy-first продуктовая аналитика

Статус: contract revision 1.2 / wire schema 2, релиз 3.11.609. Сверка: 2026-09-22.
Privacy-first контракт — канон; self-hosted Umami 3.0.3 — основной backend.
PostHog не подключён и не получает параллельный поток. Новых подписок нет.
Это измерение использования и технических исходов, не усвоения языка.

## 1. Единый контракт

`product-pulse/contract.js` задаёт events, required_properties, optional_properties,
forbidden_combinations, trigger, contract_revision, introduced_in, owner, metric,
retention_class и status. Валидатор, owner endpoint и UI используют этот манифест.
`tests/productPulseV2.test.js` проверяет event-specific matrix и parity. Revision 1.2
аддитивен: ранее допустимый payload schema 2 остаётся допустимым; новые свойства
optional для прежних событий и обязательны только для новых material-событий.

Статусы: automatic / integrated / reserved / deprecated. Резерв отдельных
поверхностей также виден в манифесте и панели; integrated не означает все поверхности.

## 2. Версионирование и граница данных

Новый sender использует schema_version=2:
```json
{
  "schema_version": 2,
  "event_id": "bf6ea3de-8c76-4eef-9663-8b505c32631c",
  "event_name": "material_engaged",
  "occurred_at": "2026-09-22T10:00:00.000Z",
  "session_id": "366d21e9-38c2-4a30-bb8e-f6765463d753",
  "app_version": "3.11.609",
  "properties": {"surface": "reading_room", "entry_point": "mediatheque",
    "material_collection": "public_study_songs", "material_media": "audio",
    "duration_bucket": "30_sec_2_min"}
}
```

- Envelope имеет только семь перечисленных ключей. Идентификаторы — UUID v4,
  версия — числовой semver либо unknown, время — canonical UTC ISO.
- Допустимое время: до 24 часов назад, до 5 минут вперёд.
- Properties — только плоские enum-значения из манифеста; неизвестные поля,
  произвольные строки, URL/query, local material/text/note IDs, содержимое,
  вложенные объекты и массивы отклоняются. Проверка действует также на envelope.
- Нельзя доказать отсутствие намеренного кодирования содержимого в UUID;
  штатный sender генерирует их независимо от данных через Web Crypto.
- Замороженный v1 validator сохранён в `legacy-contract.js`: до
  **2026-09-29 00:00 UTC** прежний допустимый payload получает 202 с
  `accepted:false, reason:legacy_transition` и НЕ доставляется в Umami.
  После срока — 400 SCHEMA_VERSION_EXPIRED. Семантика schema_version=1
  не ужесточается незаметно; legacy поток отделён от зрелых метрик.
- API path /v1 остаётся адресом сервиса; wire schema явно указана внутри.
- Dedupe: SHA-256(session_id:event_id), 24 часа, максимум 20 000 записей
  процесса. Максимум 8 одновременных доставок. Перезапуск сбрасывает dedupe.
  Доставка at-most-once в пределах процесса; повтор после downstream failure
  не выполняется. 202 — продукт не блокируется, а не гарантия хранения.
  Две отправки app_open (pageview + named event) не атомарны.

## 3. Реальные точки отправки

Точный перечень событий и свойств формируется машинным манифестом, не отдельным
UI-списком. Текущие точки:

- app_open: после конфигурации sender, один раз на документ поверхности.
  Только это событие создаёт pageview и named event.
- material_open: Студия Classic/IDE после успешной загрузки непустых строк и
  отрисовки канонической таблицы; Читальный зал — успешный readerCore.openText
  с непустыми строками и актуальным open epoch. `media_kind=text` обозначает
  контейнер таблицы, а `material_media` отдельно показывает none/audio/video/
  audio_video/unknown без asset key, URL или имени файла.
- material_started: первое trusted учебное действие после конкретного
  подтверждённого material_open; один раз на открытие материала.
- material_engaged: 30 секунд visible+focused активного времени после
  material_started с idle cutoff 15 секунд; один раз на открытие материала.
  Несколько материалов в одном документе создают отдельные материальные эпизоды.
- study_started: первое trusted pointerdown/keydown внутри учебной области
  (таблица, ввод текста, тренировка, media), visible + focus. Настройки/навигация
  вне этих областей не считаются занятием.
- study_engaged: 30 секунд после начала, visible + focus, максимум 15 секунд
  после последнего учебного действия. Время до первого действия, hidden и idle
  не засчитываются. Нет утверждения, что это всё время чтения.
- study_completed: только успешный setTextFinished из end-of-text карточки
  «Прочитано» в Читальном зале. Ошибка записи не создаёт completion.
  Отметка с полки не является прохождением занятия; она не инструментирована.
  Studio / study_video / mediatheque остаются reserved с причинами в манифесте.
- audio_engaged: ≥8 секунд подтверждённого продвижения HTML audio/video
  на видимой сфокусированной странице. Seek/pause/waiting не дают кредит;
  повтор того же источника на том же элементе не создаёт второй факт.
  YouTube iframe не покрыт; это не универсальный счётчик всего аудио продукта.
- operation_result: серверный finish/close ровно один раз для POST /api/tts,
  /api/translate-table и /api/translate-table-v2. Два enum operation:
  tts / translate_table. HTTP 2xx=success, иной HTTP=failure, преждевременный
  close=cancelled. Это запрос/попытка, а не вся задача/весь материал;
  batch/job/import и client-side validation пока не покрыты.
  Для серверного факта surface=unknown, session_id — случайный per-request
  UUID; он не используется для пользовательских conversion/retention.

Sender: свежий случайный session_id при каждой загрузке документа; записывается
в sessionStorage, но не переиспользуется. Дублированные вкладки и навигации
получают разные ключи. Same-document SPA не начинает новую сессию.
Offline/config failure/ранние события до готовности sender пропускаются;
очереди повторов и отправки накопленного содержимого нет.
Синтетические DOM events не создают started. Проверки работают на изолированных fixtures.

Материальный контекст имеет только закрытые enum. `surface` — где фактически
работают (`studio`/`reading_room`); `entry_point` — как вошли
(`studio_library`/`reading_room`/`mediatheque`). Поэтому выбор в Медиатеке
измеряется как entry_point=mediatheque, surface=reading_room. `material_collection`
различает my_texts, ben_yehuda, два задачника, public/group песни и закрытые
other/unknown классы. Сырые corpus slug/id, title и query не отправляются.

## 4. Исключения и доставка

`GET /api/product-pulse/v1/config` сообщает только collect/schema_version,
с private,no-store. С релиза 3.11.609 реальные действия владельца, включая ручные
проверки с ПК и телефона, учитываются на общих основаниях по решению владельца
от 2026-09-22. До этого authenticated owner исключался: старые пропущенные события
не восстанавливаются. Сравнение периодов через эту границу имеет разный состав
выборки; рост сам по себе не доказывает привлечение новых учеников.
Test NODE_ENV и явный `X-Product-Pulse-Exclude: 1` также исключаются.
Browser sender выключен на loopback и navigator.webdriver. Для synthetic
production API probes заголовок исключения обязателен. Это сигнал opt-out,
не средство аутентификации; он только убирает событие.

Primary read API фильтрует `tag=eq.pulse-v2`. Исторический v1 baseline (на recon:
app_open=1, visits=1, visitors=1, pageviews=1) не считается чистой выборкой.
Роль/account ID не передаются в Umami: отделить owner от учеников задним числом
невозможно. Недействительная cookie или ошибка проверки сессии отключает сбор
для этого запроса; неавторизованные посещения без cookie допускаются.

Umami получает фиксированный hostname, surface path и title=LinguistPro,
случайный ID, секунды occurred_at, named event и только разрешённые data.
У operation_result path детерминирован из двух enum:
`/pulse-v2/operations/{operation}/{result}`. Настоящего URL/referrer/query нет.
User-Agent транспорта фиксирован `LinguistPro-Product-Pulse/1`; IP и UA
пользовательского запроса не проксируются.

## 5. Панель и определения

Owner-only /pulse.html: polling 60 секунд на видимой странице, без WebSocket.
Read cache 30 секунд, общий in-flight на период, максимум 3 чтения Umami,
timeout каждого read 3,5 секунды, login/send 3 секунды. Секреты остаются на сервере.

Периоды today (00:00 UTC), 7d, 30d. Previous — предшествующий период
равной длительности; не предыдущие календарные сутки при неполном today.
UI и API разделяют loading, available zero, available, unavailable, partial.
Ноль только из валидного полученного агрегата; отсутствующие поля не приводятся
к нулю. При outage прошлые числовые значения скрываются.

- Usage — named event counts (Umami metrics/expanded поле pageviews в контексте
  custom event является числом этого события). Список берётся из манифеста.
- Ratios — отношения **событий**, не cohort conversion людей. Знаменатели:
  started/app_open, engaged/started, а completion — только
  completed/reading_room material_open; открытия Студии не занижают Room completion. Numerator и
  denominator явно возвращаются. Нулевой/недоступный denominator даёт «—».
  Повторения и границы периодов могут дать >100%; это не скрывается.
- Сейчас — distinct Umami session_id с started либо engaged за последние
  5 минут. Это недавние сигналы, не присутствие/heartbeat; множества пересекаются.
- Reliability — operation/result/app_version; Umami агрегирует app_version
  с фильтром enum path. Максимум 100 версий на ячейку: достижение лимита
  помечается partial. Произвольные версии и ответы источника не отражаются в UI.
- Работа с материалами — material_open/material_started/material_engaged по
  surface, entry_point и material_collection; дополнительно открытия по
  material_media. Engaged/open имеет явный знаменатель. Старые material_open
  без новых optional-свойств дают partial coverage, а не подставляются в unknown.
- Visits: distinct visit_id среди pageviews; visitors: distinct session_id
  среди pageviews; pageviews создаются только app_open. Их нельзя складывать
  с named events. В установленной Umami visit_id строится из session_id и
  часовой соли без x-umami-cache; это не универсальная «сессия 30 минут».
- Retention D7/D30: **не измеряется**, стабильного ключа возвращения нет.
- Release: версия в reliability доступна; deployment timeline не подключён.
  Сравнение периодов не доказывает причинный эффект релиза.
- UptimeRobot указан в ops-runbook как внешний монитор. Read-интеграция
  отсутствует; панель не выдаёт собственный /healthz за внешнюю доступность.
- SEO: Google/Bing подключены владельцем 2026-09-22, выгрузок нет
  (owner-reported). Это будущий отдельный источник с lag/timezone/denominator;
  показы и клики не суммируются с visits. OAuth/подписки не добавлены.

Для метрик указаны definition, source, observed_at, UTC, границы периода,
freshness, denominator (null для счётчиков), state. Счётчики delivery
показываются отдельно как данные только с последнего старта процесса.

## 6. Privacy и retention

Сверка исходников именно Umami tag v3.0.3:
[src/app/api/send/route.ts](https://github.com/umami-software/umami/blob/v3.0.3/src/app/api/send/route.ts),
[src/lib/detect.ts](https://github.com/umami-software/umami/blob/v3.0.3/src/lib/detect.ts).
Umami получает сетевой адрес серверного транспорта через инфраструктуру и
может вычислить географию этого адреса. Он не является географией ученика.
Custom distinct_id хранится в Umami session; это псевдонимная телеметрия,
не доказанная полная анонимность. Browser/os/device не отражают устройство
ученика при нашем фиксированном серверном UA.

Фактический recon: Umami DISABLE_BOT_CHECK=false, SKIP_LOCATION_HEADERS=false,
custom CLIENT_IP_HEADER отсутствует; собственный cron retention отсутствовал.
Traefik args не включают access log; Umami container logs json-file,
max-size=10m, max-file=3. Это размерная ротация логов, не гарантия TTL по дням.

Политика Product Pulse: raw events/properties — **90 дней**, ежедневный purge
в 04:20 UTC (максимальная задержка до суток). Скрипт
`scripts/product-pulse-retention.sh` поставлен в /opt, расписание
/etc/cron.d/linguistpro-product-pulse-retention. Scope — только явно указанный
Umami website. Сначала event_data, затем website_event, session_data и
старые неиспользуемые session; transaction + lock/statement timeouts.
Первый dry-run и apply: expired=0, DELETE 0; учебные данные не затронуты.

Процедура обслуживания: перед заменой container/website сверить inventory,
запустить --dry-run, проверить scope; затем cron --apply. Проверять journal
`linguistpro-pulse-retention` и сухой count старше 90 дней. При отказе purge
срок не считается соблюдённым: исправить расписание, не скрывать просрочку.
Откат приложения не удаляет независимое расписание retention.

Ротация ключа сессии — каждый документ. Индивидуальное удаление через account
ID невозможно, связи нет; очистка sessionStorage не стирает уже принятые
события. До TTL можно удалить данные website через админский Umami workflow
только с явным указанием объёма; это не штатный диагностический шаг.
Backup retention Umami требует отдельного контроля при добавлении backup:
не обещать удаление из копий, которые не были инвентаризированы.

## 7. Доступ и проверки

POST events — rate limit 120/min; operation_result принимается только от
серверной точки, браузерная попытка отклоняется. GET contract/dashboard и
HTML — owner only (non-owner 404, anonymous 401). Preview — только
NODE_ENV=test AND loopback; X-Forwarded-For проверяется через req.ip.

Gates: productPulse*.test.js, включая cross-surface coverage, scripts/product-pulse-smoke.js (изолированная
БД, owner/non-owner API, fake Umami, UI 380/768/1440, focus/palette/zero/outage),
полный CI subset. Automated, production, owner-live, physical-device и AT
evidence не взаимозаменяемы. Реестр исполнения:
[implementation packet](planning/PRODUCT_PULSE_MATURITY_IMPLEMENTATION_2026_09_22.md),
[cross-surface packet](planning/PRODUCT_PULSE_CROSS_SURFACE_COVERAGE_2026_09_22.md),
[постоянное включение владельца](planning/PRODUCT_PULSE_OWNER_COLLECTION_2026_09_22.md).
