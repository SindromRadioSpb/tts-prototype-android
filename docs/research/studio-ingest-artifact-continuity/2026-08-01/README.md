# Studio Ingest artifact continuity research — 2026-08-01

Этот каталог — стабильный research-пакет по следующему этапу Studio Ingest после
production L3a.2 (`v3.11.282`): образовательное закрытие импорта, долговечность
артефактов, воспроизводимость и перенос между устройствами, iPhone-контур,
справочная поверхность и будущий доступ Hermes.

## Что читать

- [`REPORT.md`](REPORT.md) — полный repo-grounded анализ, варианты архитектуры,
  требования, риски и рекомендуемое направление.
- Каноническое планирование по результатам исследования:
  [`docs/planning/STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md`](../../../planning/STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md).

## Как получен пакет

- Исходный commit: `5c5239332093bb5a10e10e500c81eb0300a8be4b` (`v3.11.282`).
- Actual browser schema baseline: `MIGRATIONS.length=45`.
- Метод: полное чтение Studio Ingest canon и L3a owner packet; read-only recon
  live code (`media-package-*`, `studio-media-*`, `local-db`, `cloud-sync`,
  Agent Access contracts/handlers); безопасная проверка активной Hermes tool
  allowlist без чтения токенов/ключей; сверка официальной документации WebKit.
- Команды исследования были read-only. Production, browser OPFS, server schema/data,
  Hermes configuration и model/provider state не изменялись.

## Статус данных

Документы — аналитический и planning-артефакты. Они не содержат пользовательский
транскрипт, media bytes, credentials, OAuth tokens или production-private coordinates.
Утверждение направления владельцем не является разрешением на implementation,
push/deploy, server/cloud mutations либо автоматическое включение Agent Access scopes.
