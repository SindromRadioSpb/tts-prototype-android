# PREPARE report — Материаловедение. Задачник 2

Дата: 2026-08-30

Результат исходного PREPARE: `PASS`; owner decisions закрыты 2026-08-30,
последующий local mapping описан в `LOCAL_MAPPING_AND_DIAGRAM_REPORT.md`.

## Что подготовлено

- 73/73 source pages имеют page role, rotation, размер, embedded-image count,
  extracted-text count, render SHA-256, ink ratio и связанные task IDs.
- Созданы 60 уникальных page-bound candidate task identities.
- Созданы три task-condition PDF на 19, 20 и 22 страницы. В них не входят семь
  solution-only страниц; на восьми смешанных страницах условие отделено crop.
- Создан reference PDF на 12 страниц: оглавление, периодическая таблица,
  тематические reference pages и приложения 66–73.
- 58 legacy-карточек / 2 469 строк заморожены как hash-only projection без
  сырого текста, UUID, абсолютного пути и значений source URL.
- После утверждения локального mapping correction ledger получил две
  condition-only anchor-коррекции: №42 и №44 больше не захватывают решения
  предыдущих задач. Source bytes и смысл условий не менялись.
- Provider/API/TTS calls: 0. Secret access: 0. Imports/publications: 0.

## Новое source finding: два вопроса №38

В исходном PDF существуют два разных задания с одинаковым display number:

1. `materials-science-y1-pb2-p045-q038`, страница 45 — отжиг стали.
2. `materials-science-y1-pb2-p047-q038`, страница 47 — выбор стали по
   инженерным требованиям.

Оба сохранены как разные internal identities. Владелец утвердил display aliases
`38-A` (стр. 45) и `38-B` (стр. 47) без перенумерации source truth.

Итого в источнике: 59 нумерованных occurrences, 58 уникальных номеров и одно
ненумерованное упражнение. Владелец включил упражнение отдельной 60-й единицей;
canonical corpus size теперь равен 60.

Рекомендация R6/R11: сохранить обе задачи №38 без перенумерации source truth;
пользовательский alias `38-A/38-B` допустим как projection после подтверждения.

## Page-role envelope

| Роль | Страниц |
|---|---:|
| task condition | 46 |
| mixed condition / non-source material | 8 |
| embedded solution only | 7 |
| table of contents / reference / appendix | 12 |
| **Итого** | **73** |

Восемь mixed pages: 5, 12, 27, 47, 48, 51, 53, 57. Страница 5 содержит
продолжение вопроса 2 и отдельное упражнение; остальные mixed pages отделены от
встроенного решения. Full-page anchors используются там, где они не вносят
solution material и сохраняют схемы/формулы целиком.

## Prepared PDFs и read-back

| Файл | Страниц | Байты | SHA-256 |
|---|---:|---:|---|
| `materials-pb2-task-input-01.pdf` | 19 | 1 363 220 | `e4beb4a73677bfed7db254d0f7cc936947dd0529ad3aa36c77185803bd876f96` |
| `materials-pb2-task-input-02.pdf` | 20 | 1 751 885 | `7fc99f12252711c7e5c3eed78d129c02ca0f5ddb5daac8ba51cbb5b59fd729c5` |
| `materials-pb2-task-input-03.pdf` | 22 | 1 323 530 | `ab7b95ba9b2de208dc5a8ff82d81d5506a75b04baed4510a5c1cac48d09e2714` |
| `materials-pb2-reference-input-04.pdf` | 12 | 2 071 164 | `6f21b19c8520f249b09e38bb6e00c095e44fb0734bc1096843fc6e2f0038d8ae` |

Все PDF ниже внутреннего PREPARE ceiling 6 MiB; все 73 output pages прошли
nonblank render read-back. Первый визуальный прогон выявил double-rotation
reference pages 68–69. Генератор исправлен: full pages теперь копируются с
исходным `/Rotate`, после чего обе таблицы читаемы. Все четыре финальных contact
sheets просмотрены.

Повторная независимая сборка в другом `.tmp`-каталоге дала байтовое совпадение
20/20 generated JSON/PDF/contact-sheet/mapping файлов; см.
`determinism-verification.json`.

## Legacy mapping: только очередь, не verdict

| Статус | Карточек |
|---|---:|
| page + marker candidate, нужен row review | 18 |
| page-only candidate, нужен row review | 18 |
| source page содержит несколько задач, нужен row split | 8 |
| heuristic task-marker conflict, нужен manual review | 9 |
| duplicate legacy title | 2 |
| на указанной странице нет source task | 3 |
| **Итого** | **58** |

Heuristic marker может быть ссылкой вида «рисунок к вопросу 8», а не номером
текущей задачи. Поэтому девять строк — red queue для ручной проверки, не
автоматически доказанные ошибки. Три карточки без task на titled page: две
вариации страницы 46 и страница 13. Полный список и candidate anchors находятся
в `mapping-ledger.json`.

## Локальный cost envelope

Legacy-all-rows остаётся только верхней границей: 2 469 nonempty rows, 2 355
уникальных точных текстов, 181 665 уникальных символов. Source-only token/TTS
объём честно не вычисляется до reviewed row split. Это не разрешение на Gemini
или TTS.

## Owner decisions — закрыты

1. Упражнение «Аллотропия железа» включено как отдельная source-grounded unit.
2. Обе задачи №38 сохранены как `38-A` / `38-B`.
3. Row-level mapping и semantic diagram classification разрешены и выполнены
   локально без провайдеров.
4. Shadow-model, решения, TTS, импорт и публикация требуют отдельных approval.

## Evidence boundary

Это локальный PREPARE. Он не доказывает корректность legacy-перевода, огласовки,
решений или ответов; не является owner-live, physical-device, AT или production
acceptance. `review_log`, learner/private/group truth и B9 не изменялись.
