# Materials PB2 reviewed solutions

Это стабильный каталог программы проверенных решений для корпуса
`materials-science-year1-problem-book-2`.

- `solution-program-spec.json` — машинно-читаемый контракт истины, таблицы, печати,
  ИИ-пакета, конечного процесса и публикационных ворот.
- `STUDENT_TABLE_AND_AI_CONTRACT.md` — человекочитаемое описание того, что увидит
  студент и что получит персональный ИИ.
- `schemas/student-solution-table.schema.json` — обязательная структура одной
  проверенной таблицы решения: source/review anchors, четыре языковые колонки,
  экзаменационная проекция, формулы, числовые таблицы, диаграммы и речевой слой.

Документы сформированы 2026-08-30 по canonical bundle SHA-256
`04bb4b69741a0ec4cdc188b04ab9e630ae90994f252e0cc233cb6d33f8bc97d5`.

Статус программы: `LOCAL_REVIEWED_60_OF_60_PRESENTATION_AND_RUNTIME_READY`.
Новые paid-provider вызовы не выполнялись и не нужны. Production publication
остаётся закрыта только явной owner-аттестацией прав; полный TTS намеренно отложен.

## Текущий прогресс решений

Все пакеты `B01`–`B06` (60 задач) независимо решены по canonical conditions и
source-assets, затем сравнены с legacy-кандидатами. Все адресные reviews закрыты;
publication-blocking и открытых содержательных расхождений нет. Студенческий слой
содержит 1 919 атомарных строк с обычным ивритом, огласовками, транслитерацией и
русским, включая две полностью source-only задачи и 19 точечных presentation repairs.

Runtime и UI используют один и тот же exact-edition shard для карточки, печати и
будущего ИИ-помощника. Локально прошли: deterministic rebuild, 3→60 publication
rehearsal, rollback/restore, learner/private/review no-write, desktop, mobile 380,
Hebrew RTL, immutable source-asset API и визуальная проверка двух PDF-проекций.
Физический принтер, production live и owner card-by-card review пока `NOT_RUN`.
