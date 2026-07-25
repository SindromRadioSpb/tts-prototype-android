# C4 R&D — доступ Hermes к личным ②-заметкам

Статус: `DONE_NO_GO / CLOSED / SMOKE_LIMITED`: 20/20 пар и 20/20 owner ratings завершены;
note-enabled предпочтен в 4/20 при frozen threshold 14/20, без заметки — 3/20, ничья — 13/20.

Это стабильная папка исследовательского C4-слайса. Она содержит preregistration,
research-only прототип и агрегатный отчёт. Реальные заметки, ответы агента, consent receipts,
blind-mapping и exposure-ledger должны находиться только в локальной подпапке `private/`, которая
игнорируется git.

## Что уже разрешено

- Research-go Д6-A и запуск `ЧАРТЕР=C4` подтверждены владельцем.
- Разрешены preregistration, синтетическая инженерная проверка и подготовка локального benchmark.
- Разрешение не является production-go и не добавляет Hermes доступ к `notes_v2`.

## Что ещё запрещено

- Не читать реальные заметки агентом до временного `personal.notes.read`, отдельного consent
  receipt и note-exposure provenance.
- Не публиковать содержимое заметок, ответы benchmark или blind mapping в git/отчёте.
- Не изменять FSRS, `review_log`, grades, mastery, progress или agent memory.
- Не превращать личную формулировку в словарный факт без явного разделения источников.

## Файлы

- `PREREGISTRATION.md` — замороженный протокол и правило решения.
- `REPORT.md` — живой агрегатный отчёт, пока без реальных результатов.
- `prototype/` — локальный fail-closed harness; он не вызывает модель и не подключается к prod.

## Следующий owner-live этап

1. Подготовить локальный файл ровно из 20 выбранных `word_study`-заметок по схеме прототипа.
2. Создать временный consent receipt с точной owner-фразой из `prototype/README.md`.
3. Материализовать blinded author packets. Harness сначала пишет content-free exposure ledger и
   лишь затем создаёт файл с note-enabled prompts.
4. Получить 20 пар ответов в двух независимых Hermes-контекстах, собрать слепые оценки и посчитать
   результат. GO возможен только при ≥14 предпочтениях note-enabled варианта из 20.

Исходный commit среза до работы: `7116cb9f`. Источник контракта:
`docs/planning/hermes-education-scaleup/2026-07-21/05_HORIZON_3_RND_CHARTERS.md` §C4.
