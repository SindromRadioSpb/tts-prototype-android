# Product Pulse — prompt следующей сессии зрелости и релиза

Скопируй текст ниже в новую сессию целиком.

---

Продолжи Product Pulse LinguistPro от production-базы после релиза `3.11.605`. Основной канон: `docs/PRODUCT_PULSE.md`; машинный источник правды: `product-pulse/contract.js`. Архитектурное решение владельца неизменно: Privacy-first Product Pulse — канонический контракт; self-hosted Umami — основной backend; PostHog Cloud допустим только как ограниченный сравнительный пилот или запасная замена, не как постоянный параллельный получатель всех событий. Новых обязательных подписок не вводить.

Цель сессии: довести `/pulse.html` и контур данных до зрелой release-ready панели, которая отвечает не только «есть ли посещения», но и «начинают ли заниматься, вовлекаются ли, завершают ли сценарии, возвращаются ли и не сломал ли релиз ключевые операции» — без учебного содержимого и без ложной точности.

Начни с read-only recon:

1. Проверь branch/status/worktrees, `HEAD...origin/main`, production `/healthz`, `/api/client-config`, фактический APP_VERSION/SW и текущую доступность owner-only `/pulse.html`.
2. Прочитай полностью `docs/PRODUCT_PULSE.md`, текущие `product-pulse/contract.js`, `product-pulse/umami.js`, `public/js/product-telemetry.js`, `public/js/pulse.js`, соответствующие server routes и tests.
3. Через owner-сессию проверь `GET /api/product-pulse/v1/contract` и `dashboard`; не раскрывай credentials и не изменяй owner learning state.
4. Сними реальный baseline Umami: какие named events уже приходят, какие три события остаются только integration points, как Umami считает visits/visitors/pageviews/events. Не складывай метрики с разными определениями.

Сначала зафиксируй короткий implementation packet в `docs/planning/`, затем реализуй один основной маршрут. Обязательный scope:

## A. Контракт v1.1 без скрытого дрейфа

- Ввести event-specific rules: для каждого события `required_properties`, `optional_properties`, запрещённые комбинации и точное условие emit.
- Решить совместимость: если ужесточение может отклонить ранее допустимый v1 payload, выпустить schema v2 с ограниченным transition window; не менять молча смысл `schema_version=1`.
- Добавить `contract_revision`, `introduced_in`, `owner`, `metric`, `retention_class` и `status` (`automatic`, `integrated`, `reserved`, `deprecated`) в манифест.
- Тестами доказать, что манифест, валидатор, endpoint и UI показывают один набор событий/свойств.
- Запретить свободные строки, URL/query, локальные material/text/note IDs и содержимое на любой глубине payload.

## B. Канонические точки отправки

- Подключить `material_open` только к подтверждённому открытию материала, без имени/id/URL.
- Определить per-surface meaning `study_completed` и подключить только там, где есть реальная финальная точка; отсутствие финальной точки не превращать в completion.
- Подключить `operation_result` к 2–3 дорогим/критичным операциям (например разрешённые TTS/translation/import results), только в каноническом success/failure point. `operation` — enum, не произвольная строка.
- Проверить semantics текущих `study_started`, `study_engaged`, `audio_engaged`: hidden tabs, idle, повторное воспроизведение, SPA/navigation, несколько вкладок, offline/retry. Автоматический таймер без первого действия не должен создавать started/engaged.
- Не отправлять одинаковый факт из нескольких обработчиков.

## C. Агрегация и панель

Добавить owner-only блоки:

- «Сейчас»: активные/вовлечённые сессии с честным окном и определением, без слова «онлайн», если это только recent activity.
- «Использование»: app opens, starts, engaged, completions, audio engaged, conversion rates с явными знаменателями.
- «Надёжность»: operation success/failure/cancelled по enum operation и app_version.
- «Возврат»: только если выбран и задокументирован допустимый псевдонимный ключ/окно. Если корректный retention нельзя получить из текущего session-per-tab id, показать «не измеряется», а не выдумывать D7/D30.
- Сравнение периодов и release markers, если источник поддерживает это без дорогого event scan.
- Для каждой метрики: definition, source, freshness, time zone, denominator, data state (`loading`, `available zero`, `unavailable`, `partial`).

Сервер должен кешировать read API на короткое безопасное окно, ограничить concurrency/timeouts и не отдавать Umami credentials клиенту. WebSocket не нужен без доказанной необходимости; начни с polling 30–60 секунд.

## D. Privacy, retention и эксплуатация

- Сверить `docs/PRIVACY.md`, реальный network payload и Umami retention. Зафиксировать срок хранения и процедуру удаления/ротации.
- Проверить reverse-proxy/IP/User-Agent поведение Umami и описать фактическое, не заявлять «анонимно» без доказательства.
- Исключить собственные owner/test/synthetic sessions из основной статистики воспроизводимым способом, не по контенту.
- Событийный outage не должен влиять на продукт. Панель отличает source outage от настоящего нуля.
- Добавить внешний uptime check как отдельный будущий/текущий источник; сервер не может доказать собственную полную недоступность.

## E. Quality gates

- Unit/contract/privacy tests на accepted/rejected payloads, event-specific matrix, time bounds, duplicates и manifest parity.
- API auth tests: owner success, non-owner 404, anonymous 401/штатный auth response, preview только test+loopback.
- Browser smoke панели на 380px, промежуточной и desktop ширине; keyboard/focus/contrast; source unavailable и legitimate zero.
- Integration test с локальным fake Umami или deterministic stub: pageview только для `app_open`, named event для каждого события, read aggregation без секретов.
- Проверить, что `docs/PRODUCT_PULSE.md`, privacy policy и panel copy совпадают с кодом.

## Release protocol

- Сохрани unrelated dirty files. Версии APP_VERSION/CACHE_VERSION/Room footer/изменённые asset query/integrity paths двигай по правилам проекта.
- До push запусти затронутые unit/API/UI gates и полный обязательный release subset.
- Сделай один scoped commit и push в `main` только при зелёных gates.
- Дождись Coolify deploy. Подтверди commit ancestry, минимум три no-cache `/healthz`, `/api/client-config`, served APP_VERSION/SW/integrity и active image identity.
- Owner-live проверка панели — read-only; не изменяй учебные данные. Отдельно отчитай automated, production и owner-live evidence.
- Если обнаружится нехватка диска или красный deploy gate, не маскируй: выполни только inventory-first безопасную диагностику и следуй production cleanup protocol.

Definition of Done: панель показывает определённые продуктовые и reliability метрики из единого версионированного контракта; три зарезервированных события либо реально интегрированы, либо честно остаются `reserved` с причиной; privacy/retention документированы; zero/unavailable/partial различимы; тесты и production evidence зелёные; PostHog не получает постоянный дублирующий поток.

---
