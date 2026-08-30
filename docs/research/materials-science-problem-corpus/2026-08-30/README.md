# Материаловедение. Задачник 2 — корпусная программа

Дата среза: 2026-08-30
Режим: `LOCAL CANONICAL TEXT+VISUAL CORPUS PASS / PRODUCTION PUBLICATION READY / RIGHTS ATTESTATION PENDING`

Канонический repair и локальный bake завершены: 60 задач, 693 строки с четырьмя
учебными колонками и 72 materialized source/reference assets. Две сборки ZIP
байт-в-байт совпали; Android-v2 compatibility, in-memory import rehearsal и
deep ZIP audit прошли. Подробности и честные границы следующего этапа — в
[repair/CANONICAL_CORPUS_COMPLETION_AUDIT.md](repair/CANONICAL_CORPUS_COMPLETION_AUDIT.md).

При подготовке solution program повторный визуальный аудит обнаружил и исправил
два source-condition дефекта: в задаче 5 пропущенный подпункт A (50→55 мм) был
заменён дублем подпункта B, а в задаче 19 значения энергии удара были обращены
относительно столбцов температуры. Исправления привязаны к исходным страницам и
matching legacy rows в `repair/source-condition-corrections.json`; провайдер не
вызывался. После отдельной проверки приложения к задаче 43 актуальный ZIP имеет
SHA-256 `04bb4b69741a0ec4cdc188b04ab9e630ae90994f252e0cc233cb6d33f8bc97d5`.
Он установлен по официальному локальному пути; прежняя редакция сохранена рядом
как `Материаловедение — задачник 2-learning.pre-q043-f7ef3851.zip` и может быть
восстановлена без повторной сборки.

Локальный source-first Build завершён в утверждённом конечном envelope:
6 партий × 10 задач × максимум 2 прохода, без третьего прохода. Все 60 задач
имеют стабильные identity, source anchors, классификацию иллюстраций и явную
терминальную disposition. Отдельная программа решений завершила 60/60 задач и
подготовила 1 919 строк. Полный TTS не выполнялся. Публикация отрепетирована на
временной БД, но production pointer ещё не создавался: требуется явная
аттестация прав по классам контента.

## Исторический pre-repair результат

- 60 уникальных задач и 693 строки условия;
- 656 строк взяты из legacy только как comparison candidates;
- 37 source-строк транскрибированы локально для отсутствующих или ошибочных
  legacy-фрагментов;
- 51 строка подтверждена, 642 заблокированы;
- 1 задача получила `PASS`, 59 — `INCOMPLETE`;
- 54 source-backed текстовых исправления; 7 наборов source anchors исправлены
  в закрытом Build и ещё 3 — аддитивным preflight correction layer;
- 43 задачи содержат 90 семантических visual instances;
- 11 задач требуют materialized appendix dependencies;
- provider calls / secret access / solutions / audio / import / publication:
  `0 / false / 0 / 0 / 0 / 0` в локальном Build.

Этот раздел сохраняет историческое состояние до отдельного canonical repair.
Текущий результат заменяет прежний blocker: локальный ZIP создан и проверен,
но не импортирован и не опубликован.

## Главные артефакты

- [INTAKE_AND_STRATEGY.md](INTAKE_AND_STRATEGY.md) — intake, truth boundaries,
  продуктовая стратегия и owner gates.
- [corpus-program-spec.json](corpus-program-spec.json) — актуальная
  машинно-читаемая программа.
- [prepare/task-manifest.json](prepare/task-manifest.json) — 60 source-bound
  identities, включая упражнение страницы 5 и две отдельные задачи 38-A/38-B.
- [prepare/reviewed-legacy-row-mapping.json](prepare/reviewed-legacy-row-mapping.json)
  — точное назначение всех 2 469 legacy rows.
- [prepare/diagram-manifest.json](prepare/diagram-manifest.json) — визуалы и
  appendix dependencies всех задач.
- [build/AGGREGATE_TERMINAL_AUDIT.md](build/AGGREGATE_TERMINAL_AUDIT.md) —
  итоговый человекочитаемый аудит.
- [build/aggregate-terminal-audit.json](build/aggregate-terminal-audit.json) —
  проверяемые агрегаты шести batch.
- [build/terminal-task-index.json](build/terminal-task-index.json) — disposition,
  source pages, visual/reference counts и blockers каждой задачи.
- [build/separate-canonical-repair-gate.json](build/separate-canonical-repair-gate.json)
  — конечный отдельный repair gate, пока не утверждённый владельцем.
- [build/SEPARATE_CANONICAL_REPAIR_EXECUTION_PLAN.md](build/SEPARATE_CANONICAL_REPAIR_EXECUTION_PLAN.md)
  — точный egress/cost/call envelope и owner approval token; провайдер не запускался.
- [repair/README.md](repair/README.md) — шесть визуально проверенных
  raster-sanitized source payloads, 642 точных row candidates и три
  post-Build boundary corrections; всё локально, provider calls = 0.
- [repair/GOAL_BLOCKED_AUDIT_2026-08-30.md](repair/GOAL_BLOCKED_AUDIT_2026-08-30.md)
  — requirement-by-requirement доказательство незавершённости и точный unblock gate.
- [repair/CANONICAL_CORPUS_COMPLETION_AUDIT.md](repair/CANONICAL_CORPUS_COMPLETION_AUDIT.md)
  — фактическое завершение repair/bake, стоимость, provenance, проверки и
  оставшиеся отдельные owner gates.
- `build/batch-B01` … `build/batch-B06` — неизменённые pass-1 и pass-2 evidence.

## Важные source findings

- legacy-карточки смешивали условия и решения; solution rows исключены;
- задача 16: source-matching вариант Ø50 выбран, конфликтующий Ø35 отклонён;
- задача 27 продолжается на странице 36;
- задача 30 разделена между двумя legacy-карточками, сегменты собраны в
  source-порядке без решения;
- задача 32 отсутствует в legacy и транскрибирована из источника с пустыми
  производными колонками;
- условие 38-A продолжается на странице 46; 38-A и 38-B остаются разными задачами;
- у задачи 39 исправлен усечённый source anchor;
- у задачи 49 legacy ошибочно подменял аустенит мартенситом в описании Duplex;
  конфликтующая строка исключена, source-текст сохранён отдельно.

## Следующий gate после завершённого text+visual корпуса

Программа `MATERIALS-PB2-SEPARATE-CANONICAL-REPAIR` завершена в утверждённом
envelope: 9 подтверждённых ответов, 10 сетевых стартов, `$1.099227` measured и
`$1.259607` conservative upper bound при потолке `$2.00`.

После успешного repair фактически завершены:

1. локальный canonical bake и deterministic ZIP readback;
2. программа независимо проверенных решений через
   `$build-reviewed-problem-solutions`;
3. row-level audio/karaoke contract без синтеза;
4. временная DB-репетиция: pilot 3 → full 60 → rollback → restore;
5. desktop/380/RTL и два browser-PDF print gate.

Следующий gate: owner rights attestation, затем production backup, pilot, full
immutable publication, exact-edition runtime build, deploy и anonymous live verify.
Полный TTS остаётся отдельной будущей программой после покарточной owner-проверки.

Права на source text, diagrams, bilingual derivatives, audio, solutions,
downloads и public access остаются отдельным owner decision.
