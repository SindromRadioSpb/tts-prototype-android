# ASSET_REGISTER — «Мир выборов в Израиле» (пакет 0.2.0)

Все права: генерации Gemini 3 Pro Image по промптам владельца проекта (Google Gemini API ToS —
выходные данные принадлежат пользователю API; проверить применимость для коммерческого выпуска),
ручные штампы — авторские (Claude Code), без чужих фото/карикатур/логотипов. Статус художественной
приёмки владельцем: **ожидает**.

## Генерации (источники, `art/worlds/israel-elections-2026/gen/`)

Промпты — `prompts/<id>.txt`; паспорт — `gen/<id>.json`; журнал расходов — `art/worlds/_gen/ledger.jsonl`
(оценка $0.15/изображение, лимит $10; факт по счёту Google — сверить в консоли).

| ID | Модель | Использование | sha256 |
|---|---|---|---|
| timsah-sheet-v1 | gemini-3-pro-image | timsah.px (6 поз) | 2a7919b268463183… |
| keyart-dusk-v1 | gemini-3-pro-image | эталон стиля (референс слоёв и зданий) | 0356085581c944b4… |
| layer-hills-dusk-v1 | gemini-3-pro-image | layer-hills-{day,dusk,night} | 797bb8219f520f35… |
| layer-city-dusk-v1 | gemini-3-pro-image | layer-city-{day,dusk,night} | 29ee618461024949… |
| layer-street-dusk-v1 | gemini-3-pro-image | layer-street-{day,dusk,night} | f4a74fc9359aee73… |
| place-hq-v1 | gemini-3-pro-image | place-hq-* | 217ba4827624f4a1… |
| place-press-v1 | gemini-3-pro-image | place-press-* | 4e74d04871b8cfd0… |
| place-polling-v1 | gemini-3-pro-image | place-polling-* | 386898c2fe48a326… |
| place-count-v1 | gemini-3-pro-image | place-count-night | c2dfe2c07954b520… |

## Цепочка

генерация → `pixelize.py` (хромакей, одна шкала, мажоритарная сетка, палитра по классам тона,
бесшовный шов для слоёв) → `.px` (редактируемый исходник) → `grade-lighting.py` (день/ночь) →
`build-world-art.js` (детерминированный PNG + `atlas.json`, проверка `--check` в тестах).
Ручные: `props.px` (урна, конверт), `scenery-sky-*.px` (облака, солнце, луна, птицы) через
`compose-elections-scenery.py`.

## Файлы пакета (`public/worlds/israel-elections-2026/`)

| Атлас | Файл | Размер (лог. px) | Байт | Кадры | sha256 |
|---|---|---|---|---|---|
| layer-city-day-strip | layer-city-day-strip.png | 309×94 | 12010 | strip | f4a3b9ae9619 |
| layer-city-dusk-strip | layer-city-dusk-strip.png | 309×94 | 12110 | strip | 5440eeb2e338 |
| layer-city-night-strip | layer-city-night-strip.png | 309×94 | 12158 | strip | e8cb58235664 |
| layer-hills-day-strip | layer-hills-day-strip.png | 335×118 | 8645 | strip | 9af8aea41e78 |
| layer-hills-dusk-strip | layer-hills-dusk-strip.png | 335×118 | 9742 | strip | 7348d9698e99 |
| layer-hills-night-strip | layer-hills-night-strip.png | 335×118 | 7703 | strip | fa5eb31926c2 |
| layer-street-day-strip | layer-street-day-strip.png | 287×91 | 8468 | strip | 66874d6b2a36 |
| layer-street-dusk-strip | layer-street-dusk-strip.png | 287×91 | 8831 | strip | 788cdc03a185 |
| layer-street-night-strip | layer-street-night-strip.png | 287×91 | 8007 | strip | 843b385b1bd6 |
| place-count-night | place-count-night.png | 97×70 | 1983 | count | 5424073eda2c |
| place-hq-day | place-hq-day.png | 92×66 | 1964 | hq | a106eee5aa2c |
| place-hq-dusk | place-hq-dusk.png | 92×66 | 2021 | hq | bc0c1df54d6d |
| place-hq-night | place-hq-night.png | 92×66 | 1851 | hq | b1a4e5158d21 |
| place-polling-day | place-polling-day.png | 105×60 | 2340 | polling | 3ccae3d0f4c5 |
| place-polling-dusk | place-polling-dusk.png | 105×60 | 2405 | polling | ebfed8734b20 |
| place-polling-night | place-polling-night.png | 105×60 | 2293 | polling | e231ce623710 |
| place-press-day | place-press-day.png | 83×64 | 1997 | press | 8de752e8c286 |
| place-press-dusk | place-press-dusk.png | 83×64 | 1985 | press | b9e8f052221f |
| place-press-night | place-press-night.png | 83×64 | 2052 | press | 5f7e0782f443 |
| props | props.png | 53×18 | 250 | box, box-glint, envelope | 4e8e5dd3bab2 |
| scenery-sky-day | scenery-sky-day.png | 63×7 | 215 | cloud-a, cloud-b, sun, moon, bird-1, bird-2 | 96b84e413af6 |
| scenery-sky-dusk | scenery-sky-dusk.png | 63×7 | 220 | cloud-a, cloud-b, sun, moon, bird-1, bird-2 | 49060ef69ae7 |
| scenery-sky-night | scenery-sky-night.png | 63×7 | 219 | cloud-a, cloud-b, sun, moon, bird-1, bird-2 | fb19b66bb22e |
| timsah | timsah.png | 191×42 | 2202 | idle, blink, walk-a, walk-b, hold, jump | dc699c347ed7 |
Итого: 24 PNG, 111 671 байт на три освещения; одно освещение ≈ 40–50 КБ.
