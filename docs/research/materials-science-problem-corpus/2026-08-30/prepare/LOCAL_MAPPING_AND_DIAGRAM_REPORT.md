# Local mapping и diagram classification — Материаловедение. Задачник 2

Дата: 2026-08-30

Результат: `PASS`.

## Утверждённая идентичность корпуса

- Упражнение «Аллотропия железа» со страницы 5 включено как отдельная 60-я
  canonical unit: `materials-science-y1-pb2-exercise-p005-allotropy`.
- Оба разных задания с source number 38 сохранены без перенумерации:
  `materials-science-y1-pb2-p045-q038` отображается как `38-A`, а
  `materials-science-y1-pb2-p047-q038` — как `38-B`.
- Итого: 60 задач, 59 нумерованных occurrences, 58 уникальных source numbers и
  одно ненумерованное упражнение.

## Reviewed legacy row mapping

- 58/58 карточек и 2 469/2 469 строк получили точный target.
- 58/60 задач имеют legacy rows. Явно отсутствуют только №2 и №32; значения не
  заимствуются из соседних карточек.
- Две карточки страницы 46 назначены reference targets, а не выдуманным task ID.
- Три карточки разрезаны по доказанным row boundaries:

  - `48–49`: rows 0–36 → №39, rows 37–68 → №40;
  - `63`: rows 0–27 → №53, 28–47 → №54, 48–90 → №55;
  - `64–65`: rows 0–29 → №56, 30–49 → №57, 50–81 → №58.

- №6, №16 и №30 имеют больше одной legacy-карточки. Ни одна версия не была
  молча выбрана как canonical.
- Semantic content legacy rows не переоценён: 2 132 строки честно помечены как
  mixed condition-or-solution, 161 — как evidence после явного solution heading,
  61 — reference derivative. Это mapping, а не проверка правильности решений.
- `reviewed-legacy-row-mapping.json` не хранит raw text, UUID, абсолютные пути
  или source URL values; join доказан hash каждого aligned row.

Исходный `mapping-ledger.json` сохранён как heuristic PREPARE queue. Его ложные
конфликты вида «рисунок к вопросу 8» не являются verdict. Reviewed truth этого
шага — `reviewed-legacy-row-mapping.json`.

## Diagram classification

- 60/60 задач имеют semantic classification.
- 43 задачи содержат supplied semantic visuals; всего 90 visual instances.
- 11 задач имеют явные зависимости от reference appendices.
- Типы охватывают atom/unit-cell diagrams, data/response tables,
  stress-strain/S-N/Jominy/impact/time-temperature curves, micrographs,
  Fe–C diagram, corrosion/joint schematics и composite structures.
- Для 17 text/formula или user-drawn-output задач отсутствие supplied visual
  записано явно; диаграмма не генерируется по догадке.
- Все visual dependencies остаются привязаны к source page и prepared reference
  ID. Это не разрешение заменять скан сгенерированной картинкой.

## Две source-anchor коррекции

Manual render read-back показал, что full-page anchors №42 и №44 захватывали
решение предыдущей задачи. Condition anchors сужены до собственных условий:

- №42, source page 52: `[0.0, 0.65, 1.0, 1.0]`;
- №44, source page 54: `[0.0, 0.42, 1.0, 1.0]`.

Коррекции не меняют source bytes или смысл условия и записаны в
`correction-ledger.json`. Обратный render обеих страниц проверен визуально.

## Что этот PASS не доказывает

- Legacy translation, niqqud, transliteration, answers и solutions не признаны
  корректными.
- Source learning rows ещё не построены и не импортированы.
- Права, provider shadow, модель/prompt, TTS profile/cost, reviewed solutions,
  immutable publication, rollback и owner-live/device/AT gates не закрыты.
- Provider/API/TTS calls: 0. Secret access: 0. Import/publication: 0.
- `review_log`, learner/private/group truth и B9 не изменялись.

## Следующий gate

Никакого внешнего шага автоматически не следует. Если владелец захочет оценить
качество legacy относительно современных моделей, сначала нужен отдельный
shadow `PLAN`: pinned model/version, 10–12 стратифицированных случаев,
structured schema, raw cache, resume/batch, критерии решения
`LEGACY_REPAIR`/`FULL_RERUN` и денежный ceiling. До такого подтверждения APPLY
запрещён.
