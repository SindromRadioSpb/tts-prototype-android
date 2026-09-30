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
| keyart-dusk-v1 | gemini-3-pro-image | эталон стиля | 0356085581c944b4… |
| layer-hills-dusk-v1 | gemini-3-pro-image | layer-hills-* | 797bb8219f520f35… |
| layer-city-dusk-v1 | gemini-3-pro-image | layer-city-* | 29ee618461024949… |
| layer-street-dusk-v1 | gemini-3-pro-image | layer-street-* | f4a74fc9359aee73… |
| place-hq-v1 | gemini-3-pro-image | place-hq-* (баннер нейтрализован) | 217ba4827624f4a1… |
| place-press-v1 | gemini-3-pro-image | place-press-* | 4e74d04871b8cfd0… |
| place-polling-v1 | gemini-3-pro-image | place-polling-* | 386898c2fe48a326… |
| place-count-v1 | gemini-3-pro-image | place-count-night (оранжевый→нейтральный, клинья удалены, px-clean) | c2dfe2c07954b520… |
| props-ballot-v1 | gemini-3-pro-image | ballot.px | 3163e6dd249d415c… |
| npc-street-v1 | gemini-3-pro-image | cat.px | 95c92ff8a647b939… |
| npc-people-v2 | gemini-3-pro-image | people.px (сумка перенесена в кадр B) | 8844491b3f568b77… |
| timsah-actions-v1 | gemini-3-pro-image | timsah-act.px (листовки, штамп, планшет; ручные разрезы) | 27b33b1af47691ff… |
| setpieces-v1 | gemini-3-pro-image | setpieces.px (столик, верёвка, кабинка, доска; px-clean) | 411dbff9afcd418d… |

Итого по журналу: 14 генераций, оценка $2.10 из $10.

## Цепочка

генерация → `pixelize.py` (хромакей, одна шкала, мажоритарная сетка, палитра по классам тона,
бесшовный шов для слоёв) → `.px` (редактируемый исходник) → `grade-lighting.py` (день/ночь) →
`build-world-art.js` (детерминированный PNG + `atlas.json`, проверка `--check` в тестах).
Ручные: `sign.px` (доска-тренога), `ui.px` (рамка пузыря, иконки остановок, голова-маркер), `scenery-sky-*.px` (облака, солнце, луна, птицы) через
`compose-elections-scenery.py`.

## Файлы пакета (`public/worlds/israel-elections-2026/`)

| Атлас | Файл | Размер (лог. px) | Байт | Кадры | sha256 |
|---|---|---|---|---|---|
| ballot | ballot.png | 83×26 | 455 | box, box-glint, envelope, papers | 78704207080a |
| cat | cat.png | 53×18 | 521 | a, b, sit | 7be44674bce7 |
| layer-city-day-strip | layer-city-day-strip.png | 309×94 | 9532 | strip | 26d8ef56782b |
| layer-city-dusk-strip | layer-city-dusk-strip.png | 309×94 | 9491 | strip | 74751d60b95a |
| layer-city-night-strip | layer-city-night-strip.png | 309×94 | 9519 | strip | 907a4121a13f |
| layer-hills-day-strip | layer-hills-day-strip.png | 335×118 | 5200 | strip | c47449ea6d53 |
| layer-hills-dusk-strip | layer-hills-dusk-strip.png | 335×118 | 6173 | strip | 79c7e4ef713d |
| layer-hills-night-strip | layer-hills-night-strip.png | 335×118 | 5082 | strip | 0dfc461a3854 |
| layer-street-day-strip | layer-street-day-strip.png | 287×91 | 6715 | strip | b8dd622fa345 |
| layer-street-dusk-strip | layer-street-dusk-strip.png | 287×91 | 7032 | strip | b508102a5836 |
| layer-street-night-strip | layer-street-night-strip.png | 287×91 | 6382 | strip | 08de48e1083f |
| people | people.png | 99×44 | 1264 | w-a, w-b, m-a, m-b | 0b1e8edef9e0 |
| place-count-night | place-count-night.png | 97×70 | 1691 | count | 8ed47e7e3a5c |
| place-hq-day | place-hq-day.png | 92×66 | 1907 | hq | 58de21103d15 |
| place-hq-dusk | place-hq-dusk.png | 92×66 | 1960 | hq | 6c8a6332ced3 |
| place-hq-night | place-hq-night.png | 92×66 | 1788 | hq | a8bf27b6fc92 |
| place-polling-day | place-polling-day.png | 105×60 | 2340 | polling | 3ccae3d0f4c5 |
| place-polling-dusk | place-polling-dusk.png | 105×60 | 2405 | polling | ebfed8734b20 |
| place-polling-night | place-polling-night.png | 105×60 | 2293 | polling | e231ce623710 |
| place-press-day | place-press-day.png | 83×64 | 1997 | press | 8de752e8c286 |
| place-press-dusk | place-press-dusk.png | 83×64 | 1985 | press | b9e8f052221f |
| place-press-night | place-press-night.png | 83×64 | 2052 | press | 5f7e0782f443 |
| scenery-sky-day | scenery-sky-day.png | 63×7 | 215 | cloud-a, cloud-b, sun, moon, bird-1, bird-2 | 96b84e413af6 |
| scenery-sky-dusk | scenery-sky-dusk.png | 63×7 | 220 | cloud-a, cloud-b, sun, moon, bird-1, bird-2 | 49060ef69ae7 |
| scenery-sky-night | scenery-sky-night.png | 63×7 | 219 | cloud-a, cloud-b, sun, moon, bird-1, bird-2 | fb19b66bb22e |
| setpieces | setpieces.png | 171×45 | 1693 | table, line, booth, board | 69ed1048db0c |
| sign-board | sign-board.png | 16×16 | 129 | board | 7418f313e332 |
| sign-legs | sign-legs.png | 18×8 | 118 | legs | 9a26b22e1d29 |
| timsah-act | timsah-act.png | 185×41 | 2080 | flyer, flyer-up, stamp-up, stamp-down, clip, clip-wow | 19ddfc6c191c |
| timsah | timsah.png | 191×42 | 2202 | idle, blink, walk-a, walk-b, hold, jump | dc699c347ed7 |
| ui-bubble | ui-bubble.png | 12×12 | 115 | bubble | f1dc5dd38bfc |
| ui-tail | ui-tail.png | 8×6 | 96 | tail | bec115e19a42 |
| ui-icon-hq | ui-icon-hq.png | 10×10 | 112 | icon-hq | f66e5ccec754 |
| ui-icon-press | ui-icon-press.png | 10×10 | 116 | icon-press | 04df2d3f6871 |
| ui-icon-polling | ui-icon-polling.png | 10×10 | 117 | icon-polling | dd57f7777b70 |
| ui-icon-count | ui-icon-count.png | 10×10 | 107 | icon-count | 4c0199e3fa1d |
| ui-here | ui-here.png | 10×6 | 116 | here | 8ef43bef6afb |

Одно освещение со спрайтами ≈ 40–42 КБ; грузятся только листы текущего освещения.

## Ручные правки поверх генераций

- `place-hq-*`: синие тона баннера → один нейтральный кремовый (синий — реальный партийный цвет; стирает псевдотекст генератора).
- `place-count-night`: оранжевые тона → нейтральный тёплый белый (оранжевый — протестный цвет); нарисованные «клинья» прожекторов удалены — лучи рисует движок.
- `people.px`: сумка и держащая рука перенесены из кадра `w-a` в `w-b` (генератор терял реквизит).
- Слои: проход очистки одиночных пикселей (`pixelize.py --clean`).
