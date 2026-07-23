# Hermes — закрытый Group Song Corpus

Аддитивный серверный слайс после H2.2. Он не возобновляет отложенные OPFS-мутации H2.3.

Инструменты:

- `search_group_reading_catalog` — поиск только по корпусам с ACTIVE membership;
- `get_group_reading_content` — окно до 20 строк из найденной работы;
- `get_group_text_coverage` — детерминированное покрытие работы по learner-проекции без тела текста.

Scopes: `reading.group_corpus.read` и отдельно `learner.group_coverage.read`. Отзыв membership
немедленно закрывает все три пути независимо от OAuth-токена. Другие группы не перечисляются и
не подтверждаются: недоступный corpus/work даёт общий `AA_NOT_FOUND`.

Existing 18 schemas remain byte-identical. Snapshot: `schema-before-sha256.json`.
Rollback: disable/remove only the three capability records and two scopes; corpus, membership,
progress, `review_log` and FSRS data are untouched.

## Hermes rule

For a study-song request, call `search_group_reading_catalog` before naming available works.
Call `get_group_reading_content` only for the bounded passage needed by the owner's request.
Before claiming that a work is suitable by difficulty, call `get_group_text_coverage` and state
its numeric percentages/band. `COVERAGE_UNAVAILABLE` means “not measured”, never “easy”.
`AA_NOT_FOUND` means the work is not available to this connection; do not guess whether it exists
or whether membership was revoked. Never reproduce or aggregate the complete restricted corpus.
