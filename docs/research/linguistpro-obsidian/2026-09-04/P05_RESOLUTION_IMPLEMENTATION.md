# P0.5: реализация контура морфологических решений

Дата: 2026-09-04

Статус: `CORE_STORAGE_OVERLAY_TECHNICAL_PASS · UI_BACKUP_ROUNDTRIP_PENDING`

## Реализовано

- pure core `lexical-resolution-core.js`;
- состояния `unresolved / resolved / deferred / rejected_all / stale`;
- `clear` без удаления истории;
- ручная коррекция переживает смену модели/кандидатов, но устаревает при
  изменении source anchor;
- подтверждение кандидата устаревает при изменении source или candidate set;
- browser SQLite migration 051 `lexical_resolution_events`;
- append-only repository без update/delete API;
- idempotent append и fail-closed ID collision;
- exact batch: один `batch_id`, уникальные occurrence IDs, общая транзакция;
- owner/teacher-only actor validation;
- экспорт событий в `notes_advanced` schema 3 для full и slim text bundle;
- импорт с remap `text_id/sentence_id/occurrence_id` и сохранением portable
  source/candidate fingerprints.
- async lifecycle overlay: resolved occurrences покидают активную очередь, но
  остаются в полном audit; stale/deferred/rejected остаются видимыми;
- после уменьшения кластера пакетное подтверждение автоматически отключается,
  если в нём осталось меньше двух активных occurrences.

Серверная таблица намеренно не создавалась: события локальны и text-bound.
Автоматический cloud sync не утверждён.

## Проверено

- новый набор core/repository/service/preview: 18/18 PASS;
- отдельные core/repository tests: 7/7 PASS;
- JS syntax и scoped `git diff --check`: PASS;
- в API отсутствуют операции update/delete;
- тест exact batch подтверждает rollback до прежнего количества строк.

Старые media/material tests содержат уже устаревший до этой работы guard
`MIGRATIONS.length === 49`: живой baseline до migration 051 содержал 50
миграций. Их падение не является продуктовой регрессией новой таблицы; hardcode
нужно исправлять отдельным scoped maintenance-срезом, не меняя индексы целевых
миграций.

## Осталось до снятия P0.5 gate

1. UI просмотра одного occurrence и кластера;
2. owner actions и batch-impact confirmation;
3. исполнимый full/slim export-import roundtrip test;
4. unresolved → resolved переход в Obsidian projection/receipt;
5. owner acceptance.

Vault `F:\УЧУ_ИВРИТ\УЧУ_ИВРИТ` не изменён.
