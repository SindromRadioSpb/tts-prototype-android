# Product Pulse maturity — implementation packet

База: `3332685ac26103cb4d1610745b28e81a57fe93ae`, production 3.11.605.
Дата: 2026-09-22. Статус: implementation + automated gates PASS, ожидается production deploy 3.11.606. Production evidence фиксируется отдельно после push; эта запись не подменяет его.

## Recon

- main clean, после fetch HEAD...origin/main = 0/0; единственный worktree.
- Production health: DB/migrations ready; disk_warn=true, 92%, 3.2 GB свободно.
- Активный Docker image соответствует base commit; Umami 3.0.3 self-hosted.
- Anonymous pulse.html = 401; существующая owner-панель доступна, показывает 1 посещение во всех периодах и manifest 7 events / 5 properties.
- Read-only Umami stats: pageviews=1, visitors=1, visits=1. Baseline ещё содержит owner/test активность, его нельзя считать чистой продуктовой выборкой.
- Дефекты: pageviews ошибочно названы events; таймер вовлечения считает время до первого действия; аудио проверяет currentTime вместо проигранного времени; три integration points не подключены.

## Один маршрут

Privacy-first contract revision 1.1 / wire schema 2 → first-party sender → self-hosted Umami → cached owner-only read API → pulse.html. PostHog не подключать, подписок не добавлять.

1. Сохранить v1 validator неизменным на ограниченное окно до 2026-09-29T00:00:00Z; новый sender использует строгий v2. Старые payloads не подмешивать в зрелые метрики. Неизвестные/свободные поля v2 отклоняются на всех уровнях; только enum properties, UUID identifiers, semver app version.
2. Подключить material_open в подтверждённой точке открытия; completion только в сценарии с явным финалом, остальные поверхности reserved с причиной. Operation results: 2–3 проверяемые канонические операции, enum, без содержимого.
3. Исправить starts/engagement/audio: meaningful interaction, visible+focused activity, idle bound, actual playback progress без seek credit. Один факт — одна точка. Offline best effort без накопления учебных данных.
4. Dashboard: usage, recent activity, reliability, comparisons where supported; определения, UTC, знаменатели и freshness. Retention пользователей не измерять: session-per-tab не является допустимым ключом D7/D30. Ноль / unavailable / partial различать.
5. Read API: bounded concurrency, timeout, short cache, in-flight sharing; секреты только server-side. Poll 60 sec.
6. Privacy/ops: проверить Umami proxy/IP/UA, retention и удаление; исключение owner/test до отправки. Uptime — независимый внешний источник, статус подключения честно отдельно.

R4: мобильная панель и честные состояния; R5: метрики для решений; R10: evidence и знаменатели; R15: минимизация данных. Учебное содержимое и owner learning state не менять.

## SEO — расширение плана

Google Search Console и Bing Webmaster Tools подключены владельцем 2026-09-22, данных ещё нет (owner-reported). Основа: `E:/projects/kolosei-hub/docs/planning/SEO/SEO_START_AND_GROWTH_GUIDE_2026_09_08.md`.
Показы/клики поисковиков — отдельный будущий acquisition source со своим lag, property scope и периодом. Не складывать с app opens/visits и не выдавать отсутствие выгрузки за ноль. Интеграция аккаунтов/OAuth и cross-site identity не входят в этот релиз.

## Gates и остановки

- Contract/event matrix/privacy/time/dedupe/parity; deterministic fake Umami; API owner/non-owner/anonymous/test-loopback.
- Browser 380/intermediate/desktop, keyboard/focus/contrast, zero/outage/partial; read-only owner check отдельно.
- Обязательный release subset из CI, согласованные version/SW/footer/assets/integrity.
- Один scoped commit/push main только после зелёных gates. Coolify ancestry, 3 no-cache health, client-config, served assets/SW и active image.
- Disk: до deploy устранить или явно разрешить capacity gate. Сейчас только inventory, без удаления образов, данных или кэша.

## Evidence journal

- Contract 1.1 / schema 2: event-specific required/optional/forbidden matrix, 7 событий, 5 enum properties, замороженный v1 с discard во время transition.
- material_open: непустой подтверждённый reader в Зале. study_completed: успешная запись end-card «Прочитано». Остальные поверхности честно reserved. operation_result: серверные TTS/table response finish/close, один факт на запрос.
- Sender: per-document UUID (новая вкладка/навигация не наследует ID), trusted study interaction, idle/visibility/focus bounds, playback delta без seek credit. Offline без retry.
- Primary Umami tag=pulse-v2; owner role/test/header exclusion. Lifetime v1 baseline не подмешивается.
- Aggregation: usage/recent/reliability, previous-period counts и event ratios, source states и определения. D7/D30, deployment timeline, SEO и uptime read integration явно не измеряются/не подключены.
- Umami 3.0.3 source inspected at upstream tag commit `2a71cc721bf99874fa773e681ea14e9bf826da1e`; production read endpoints metrics/expanded и event-data/values возвращают 200. Secrets не выводились.
- Retention 90 дней: отдельный scope-ограниченный скрипт, cron 04:20 UTC. Dry-run expired=0, первый transaction DELETE 0 x4; ни одной строки не удалено. Docker Umami logs ограничены 3x10MB; это не временной TTL.
- Cleanup: owner разрешил только build cache; повторная инвентаризация уже показала cache=0 и 72%/11GB свободно, поэтому агент ничего не очищал. Активный image + 2 rollback, 12 containers / 4 volumes сохранены.
- Automated: `npm test` **1869/1869**, i18n **233/233**. API smoke, ingest, learner-ingest **24/24**, FSRS **140/140**, memory-canon **90/90** PASS. Дополнительный live-shape regression: Umami PostgreSQL SUM возвращается строкой; принимаются только точные safe integers, malformed/missing не становятся нулём.
- `node scripts/product-pulse-smoke.js`: owner 200, non-owner 404, anonymous 401, loopback test preview + non-loopback rejection, manifest/UI parity; UI 380/768/1440; keyboard focus, palette contrast, zero/partial/outage. Screenshots reviewed in `.tmp/product-pulse-smoke/` (не owner/physical/AT evidence).
- Real browser fetch captured in disposable fixture: v2 accepted by canonical validator, trusted action, no learning text/URL; fake Umami proves 1 pageview only for app_open + named event per manifest event, read cache/concurrency and no secrets.
- Owner-live baseline: существующая production-панель доступна, manifest 7/5 отображается из GET contract, dashboard показывает baseline 1. Навигация отдельной вкладки прямо на API была blocked_by_client; не обходилась. Owner learning UI/DB не открывались и не изменялись.
- Версии APP_VERSION/SW/Room footer = 3.11.606; изменённые telemetry/pulse/library-ui query pins согласованы с SW/integrity. Version-lock тесты обновлены, прочие assets не переверсионировались.
- Release gates готовы к одному scoped commit/push. После deploy нужны ancestry, 3 no-cache health, served integrity/SW, active image, owner panel refresh. Физическое устройство и AT в этой сессии не проверяются.
