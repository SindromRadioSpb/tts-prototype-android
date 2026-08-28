# PHYSICS-YEAR1-R12 — production plan

Дата: 2026-08-28
Статус: `PRODUCTION_PUBLIC_LIVE · AGENT_DATA_READY · OWNER_LIVE_PENDING`
Владелец разрешил публикацию: 2026-08-28
Basis: `OWNER_APPROVAL_PHYSICS_YEAR1_R12_2026_08_28`

## Результат

В каждую из 74 карточек публичного корпуса `physics-year1-problems` добавляется один проверенный учебный источник, пригодный одновременно для интерфейса Зала и пользовательского ИИ-агента. Интерфейс показывает ответ по явному действию «Проверить ответ» и открывает полный разбор «Понять и решить»: физическая картина, необходимые знания, маршрут, ловушки, `Дано`, `Найти`, СИ, модель, базовые законы, вывод формул, последовательную подстановку, проверку и происхождение.

## Архитектурные инварианты

- Единственная содержательная истина — 74 hash-verified JSON-shard в `physics/year1-support/tasks/`; UI и MCP не держат вторую копию решений.
- Каждый shard привязан к точным `edition_id`, `manifest_sha256`, `edition_item_id`, `public_work_id`, `snapshot_sha256` и `source_image_sha256` действующей неизменяемой редакции №2.
- При любом дрейфе якоря результат — одинаковый 404; подбор «похожей задачи» запрещён.
- Публичная выдача закрыта feature flag `PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ` и не читает/не пишет learner, review, private или group truth.
- Агентская выдача дополнительно требует отдельный OAuth-scope `reading.publication.derivative.read` и последний разрешающий append-only факт `DERIVATIVE_TEXT` для точного edition item.
- Старые соединения не расширяются автоматически: пользователь должен заново дать согласие на новый content-tier scope.
- Формулы рендерятся безопасными DOM-узлами: индексы — `<sub>`, степени — `<sup>`, явное умножение — `×`; HTML из содержимого не исполняется.

## Rollout

1. Локальные ворота: 74/74 shard, drift-deny, migration 066 up/down, dry-run/apply 74 agent-rights, API flag off/on, ETag/404, RU/EN/HE, 1440/380/RTL и отсутствие overflow.
2. Allowlist-коммит и push в `main`; дождаться миграции 066 и трёх последовательных healthy-ответов версии `3.11.444`.
3. До мутации production DB создать и проверить backup; на копии production-подобной БД повторить dry-run/apply/read-back.
4. В production применить ровно 74 `DERIVATIVE_TEXT=true` факта с exact manifest и idempotency key; проверить read-back 74/74.
5. Включить `PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ=1`, выполнить redeploy той же версии и повторную health/version/API/browser-приёмку.
6. Отдельная owner-live граница: новое обычное подключение Hermes, явное согласие на scope и реальный вызов `read_published_learning_support`. До него не заявлять owner acceptance агентского пути.

## Rollback

- Мгновенный публичный stop: `PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ=0` + redeploy.
- Агентский stop: append-only `DERIVATIVE_TEXT=false` для тех же 74 edition items; исторические факты не удалять.
- Migration 066 down разрешена только при отсутствии грантов нового scope; иначе должна отказать.
- Контентные файлы и edition №2 не изменять; откат приложения — обычным предыдущим commit/deploy после подтверждения совместимости схемы.

## Stop conditions

- production edition/manifest/item/snapshot отличается от pin-файла;
- backup или read-back не подтверждён;
- одновременно обслуживаются старая и новая версии после окна rolling deploy;
- хотя бы одна карточка даёт не exact support, raw i18n key, горизонтальный overflow или пустой раздел;
- агент получает производную без нового scope либо без `DERIVATIVE_TEXT`.
