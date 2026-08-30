# Shadow PLAN — Материаловедение. Задачник 2

Статус: **PLAN COMPLETE / APPLY BLOCKED**. Provider calls: **0**. Secret access: **0**.

## Рекомендация

Использовать stable `gemini-3.7-flash` в Standard-режиме, `thinking_level=medium`, без
grounding/tools. Модель принимает PDF и structured output; runtime APPLY обязан
записать фактический `modelVersion` и остановиться, если он меняется между
батчами. Provider output остаётся `generated_unreviewed` и не переписывает canon.

Выборка: 12 кейсов / 13 task IDs / 3 resumable requests / 20 PDF page exposures
(5160 page-image tokens по опубликованному правилу). Полный список и
hash-bound legacy refs: `shadow-sample-manifest.json`.

## Cost governor (R16)

- 3 primary calls + не более 1 общего retry;
- hard cap: 50,000 input и 16,384 output/thinking tokens на call;
- worst case при тарифе $0.75/M input и $3.75/M output = **$0.395760**;
- предлагаемый owner ceiling: **USD 0.50**;
- любое изменение цены/model/schema/sample возвращает работу в PLAN.

Актуальные основания: [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash),
[pricing](https://ai.google.dev/gemini-api/docs/pricing),
[PDF processing](https://ai.google.dev/gemini-api/docs/document-processing),
[structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

## APPLY protocol

1. Повторно проверить официальный тариф и получить явное подтверждение egress
   выбранных source pages и legacy condition candidates.
2. Локально собрать три page-faithful cropped PDF и визуально read-back; решение
   предыдущей задачи не должно попадать в crop.
3. Не читать и не копировать секрет в артефакты: runner получает ключ только в
   process environment; stdout/stderr и JSON redaction запрещают credential fields.
4. Перед каждым запросом проверить request hash и token caps. Сохранить complete
   raw response атомарно до normalization. Resume skips только exact identity hit.
5. Валидировать schema, task IDs, row kinds, Hebrew/niqqud consonant skeleton,
   numerals/formulas/units, diagram counts and source pages детерминированно.
6. Независимый manual source read-back оценивает provider findings. Та же модель
   не может быть единственным генератором и судьёй.

## Decision policy

- `LEGACY_REPAIR`: нет identity/boundary/source-leak critical; не более 1/12
  critical case; major+critical затрагивают <10% audited condition rows; каждый
  repair имеет exact page/row/hash anchor.
- `FULL_RERUN`: identity/boundary failure; solution leakage; одна системная
  категория в >=3 cases; critical defects в >=3/12 cases; либо major+critical
  затрагивают >=20% audited condition rows.
- `EXPAND_SHADOW`: промежуточная зона, расхождение manual/provider или
  недостаточно читаемый источник. Это безопасный третий исход; бинарный verdict
  нельзя выдавливать из неубедительной выборки.

Независимо от verdict, task identity, required diagrams, formulas and units
проверяются на 100% в Build. Shadow не авторизует Build, import, TTS или publish.

## Owner APPLY token

`APPROVE MATERIALS-PB2-SHADOW-APPLY MODEL=gemini-3.7-flash MODE=STANDARD MAX_USD=0.50`

Дополнительно владелец должен явно подтвердить, что выбранные страницы исходника
и legacy condition candidates разрешено отправить в Gemini paid tier.
