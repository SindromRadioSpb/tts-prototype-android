# P0.5: реализация контура морфологических решений

Дата: 2026-09-04

Статус: `RELEASE_CANDIDATE_TECHNICAL_PASS · OWNER_ACCEPTANCE_PENDING`

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
- owner-facing UI в Reading Room для просмотра occurrence и кластеров;
- отдельный экран точного impact до любой записи: количество, все occurrence
  IDs и все контексты;
- executable full/slim export-import roundtrip с remap text/row/occurrence ID,
  идемпотентным повторным импортом и запретом переноса событий другого текста;
- Obsidian `receipt.json` и `resolution-audit.json` с полным снимком состояний и
  точными переходами `unresolved -> resolved` между последовательными
  выгрузками.

Серверная таблица намеренно не создавалась: события локальны и text-bound.
Автоматический cloud sync не утверждён.

## Проверено

- lexical-resolution audit: 24/24 PASS;
- executable full/slim backup roundtrip: PASS в обоих режимах;
- exact single/batch impact и fail-closed batch: PASS;
- Obsidian unresolved -> resolved projection/receipt/audit: PASS;
- JS syntax и scoped `git diff --check`: PASS;
- в API отсутствуют операции update/delete;
- тест exact batch подтверждает rollback до прежнего количества строк.

Browser smoke в изолированном профиле на реальном ZIP «Кфар Аза - 2 544/573»:

- импорт: `+1 text`, audio `4/4`, skipped `0`;
- single impact: `1`, после записи очередь `558 -> 557`, resolved `0 -> 1`,
  кластер `יֵשׁ` `30 -> 29`;
- после полной перезагрузки состояние сохранилось;
- batch impact для `עַזָּה`: ровно `29` IDs/контекстов, затем отменён без записи;
- batch для неоднородного `יֵשׁ` недоступен fail-closed;
- окно проверено на ширине 380 px.

## Осталось до снятия P0.5 gate

Только owner acceptance на production. Технические и автоматизированные гейты
не заменяют решение владельца. До его отчёта статус нельзя повышать до
`OWNER_REPORTED_PASS`.

Vault `F:\УЧУ_ИВРИТ\УЧУ_ИВРИТ` не изменён.
