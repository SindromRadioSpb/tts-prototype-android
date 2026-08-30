# Shadow APPLY — Материаловедение. Задачник 2

Статус: **TERMINAL / NO_MORE_GEMINI_REQUESTS**.

## Фактический результат

Выполнены четыре provider attempts B01 к `gemini-3.7-flash`, Standard,
`thinking_level=medium`:

1. HTTP 400 до inference: MIME-строка не соответствовала wire-enum;
2. HTTP 400 до inference: общий `invalid argument` для глубокого schema/PDF;
3. HTTP 200 после raster sanitation и schema simplification: raw response
   неизменно сохранён, но четыре пустых case-объекта отклонены валидатором;
4. HTTP 200 с flat required wire schema: ответ содержал 4 case/task records,
   22 source rows, 4 visuals и 13 legacy findings, но не прошёл строгую
   семантическую проверку.

В четвёртом ответе контролируемые значения `boundary_status`, `row_kind`,
`confidence`, visual `readability`, legacy `field` и `severity` не совпали с
каноническими enum. Сырые totals `12 critical / 1 major` согласованы между
findings, case summaries и batch summary, но не проходят канонический пересчёт,
поскольку severity возвращены как недопустимые uppercase-значения. Это не
отдельная арифметическая ошибка, а следствие нарушения контролируемого словаря.
Автоматически «исправлять» такой ответ небезопасно: это скрыло бы нарушение
контракта и превратило provider output в неаудируемую новую истину.

Четвёртый raw response сохранён неизменно со статусом
`REJECTED_INVALID_NOT_NORMALIZED_NOT_CORPUS_TRUTH`. B02 и B03 не отправлялись.
В corpus truth ничего не перенесено.

Ключ был прочитан только внутри процесса; его значение, hash и заголовок
запроса нигде не сохранены. Raw cache находится только в gitignored
`gemini-cache/`, stable packet содержит лишь SHA-256 и usage receipts.

## Usage / cost

Два HTTP 200 вернули usage:

| Attempt | Input | Candidate | Thinking | Расчётная стоимость |
|---|---:|---:|---:|---:|
| B01 weak schema | 14,309 | 90 | 1,355 | `$0.01615050` |
| B01 flat schema | 14,380 | 10,005 | 409 | `$0.04983750` |
| Итого measured | 28,689 | 10,095 | 1,764 | `$0.06598800` |

Для двух HTTP 400 без usage сохранён консервативный резерв `$0.19788000`.
Reserve + measured = `$0.26386800`, ниже утверждённого `MAX_USD=1.00`.

## Терминальное решение

До четвёртого вызова был зафиксирован конечный алгоритм: B01 запускается первым;
при любой API- или semantic-validation ошибке B02/B03 не выполняются, повторов и
нового recovery gate нет. Условие сработало.

`NO_MORE_GEMINI_REQUESTS` означает:

- не исправлять prompt/schema ради нового Gemini-вызова;
- не нормализовать и не принимать отвергнутый ответ как corpus truth;
- не просить владельца о ещё одном Shadow recovery token;
- сохранить локальный source-first mapping и diagram classification как основу
  следующей, отдельно утверждаемой Build-фазы.

Это останавливает именно неудачный Gemini Shadow, а не программу корпуса.
Будущий Build должен быть конечным по партиям и review gates, опираться на PDF,
60 task identities, проверенный mapping 2 469 legacy rows и классификацию 90
visual instances. Импорт, публикация, TTS, решения и answer adjudication остаются
запрещены.

## Decision

`HOLD_PROVIDER_SHADOW / KEEP_LOCAL_RECON_FOUNDATION`.

Ни один provider candidate не признан пригодным. Raw provider evidence является
диагностикой, а не источником условия, перевода, разметки или решения.
