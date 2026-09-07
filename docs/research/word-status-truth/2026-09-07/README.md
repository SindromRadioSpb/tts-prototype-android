# Word Status Truth audit

Это воспроизводимый отчёт разведки, на основании которого владелец 2026-09-07
утвердил реализацию `new / unassessed / unresolved` и честный Studio familiarity
gate.

Артефакты:

- `ARCHIVE_AUDIT.json` — исходный измеренный дефект на pre-change `HEAD`.
- `POST_IMPLEMENTATION_VERIFICATION.json` — повторное измерение того же архива
  и список зелёных implementation gates.

Источник — локальный owner-provided `.lplp.zip`; архив не копируется в git.
Идентичность источника фиксируется именем, размером и SHA-256. Аудит выполнен
на `main@e92168de26e35ccbd199590ff6455f0ef769ecab` локальным Playwright Chromium
при заблокированном Service Worker и пустом изолированном профиле. Таблица
отрендерена штатным Studio-путём, затем выполнен полный
`ReaderMorph.decorateWords`; сохранённые статусы проверены через local DB.

`ARCHIVE_AUDIT.json` — raw measured aggregate, не ручная аннотация и не оценка
лингвистической точности. Исследовательский скрипт и полный token-level dump
остаются scratch-артефактами `.tmp`; продуктовые регрессии из этого решения
переносятся в детерминированные committed fixtures, не зависящие от личного
архива.

После реализации тот же пустой профиль дал `0` фиолетовых `new`, `464`
производных `unassessed`, `510` undecorated и по-прежнему `0` сохранённых
статусов. Это подтверждает изменение presentation-семантики без импорта или
создания learner truth.

Канон решения:
`docs/planning/LINGUISTPRO_WORD_STATUS_TRUTH_AND_FAMILIARITY_IMPLEMENTATION_2026_09_07.md`.
