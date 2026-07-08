# P7.2d selector — dictate word-quality measure (2026-07-08)

Measure-before-code для CLG-P7.2d premium modality selector, форк #3 (2-буквенный / function-word
фильтр диктанта). Отвечает: какой порог отсекает наблюдённую владельцем проблему («2-буквенные слова —
плохие цели аудио-диктанта», live-verify `פן` 2026-07-08).

## Файлы
- `dictate-length-pos-measure.txt` — **результат** (raw, machine-generated; НЕ редактировать вручную).
- этот `README.md`.

## Как сгенерировано
```
node scripts/premium/measure-dictate-length-pos.js
```
Источник-commit: ветка `main` на момент P7.2d (после `abc7358`, до коммита P7.2d).
Предикат — `db/keyingService.dictateFormForItemKey` (омофон-фильтр + vocForm-однозначность), тот же,
что использует сервер-селектор, bake-tool и оракул гейта. Замер выполнен на предикате **до** правки
(порог `written.length < 2`), чтобы показать полный dictate-безопасный набор и распределение длин.

## Итог (для решения форка #3)
- dictate-безопасных лемм: **6912** (74.5% из 9279) — совпадает с owner-bake.
- written ≤2 букв: **85 (1.23%)** — 74 CONTENT (של/בת/לב/**פן**), 11 function. Владельческий `פן` = **noun**.
- function-POS любой длины: **193 (2.8%)**, из них 182 — len≥3.
- «min≥3» и «exclude function» почти не пересекаются и лечат РАЗНОЕ; `פн` лечит ТОЛЬКО min≥3.

## Решение (owner 2026-07-08)
Форк #3 = **min written length ≥3** (БЕЗ exclude-function). Реализовано в
`keyingService.dictateFormForItemKey` (`written.length < 3`). Пост-фикс dictate-eligible набор =
**6827** (6912 − 85). Прод-ассеты 2-буквенных слов остаются на томе (безвредно, просто не выбираются).
Единая точка фильтра → сервер + bake + оракул согласованы по построению.
