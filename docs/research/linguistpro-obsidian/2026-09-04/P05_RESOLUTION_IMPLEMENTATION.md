# P0.5: реализация контура морфологических решений

Дата: 2026-09-04

Статус: `3.11.467_TECHNICAL_PASS · OWNER_FINDINGS_FIXED · RECHECK_PENDING`

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

## Owner finding 2026-09-04 и исправление 3.11.467

Первая проверка `3.11.466` доказала два дефекта:

- Pealim `#2710` (`אֶת`, маркер определённого прямого дополнения) имел в
  `pealim-infl-v12` исторически ошибочный `pos: noun`, хотя контекст, карточка и
  уже curated `function-usage.v1` связывают тот же точный sense-ID со служебным
  употреблением. Общий guard поэтому ложно помещал 82 базовых вхождения `אֶת`
  и связанные формы в очередь.
- редактор и exact-impact рендерились после полного списка контекстов; в
  кластере из 82 вхождений пользователь практически не мог до них добраться.

Исправление использует существующий curated `function-usage.v1` как точный
identity overlay только при буквальном совпадении Pealim ID. Несовпадающий ID
не может снять guard, а content-контекст с function sense по-прежнему
карантинируется. На исходном ZIP очередь изменилась `1019 -> 692`,
`identity_guarded 646 -> 319`, кластеры `315 -> 279`; 774 occurrences получили
аудируемую verified-identity provenance, из них 327 перестали быть ложными
guarded-случаями. `pid:2710` сохранил 134 контекстных occurrences и правильный
`lp_pos: preposition`; два действительно несовместимых контекста форм `את/אותו`
остались в очереди.

В UI editor/candidates/actions теперь предшествуют контекстам, exact-impact
вставляется там же до списка, а контексты имеют собственную ограниченную
прокрутку. Candidate evidence также сохраняет lemma и нормализованный POS,
поэтому больше не отображается как `— · unknown · #2710`.
