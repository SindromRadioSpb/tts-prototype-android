# FSRS golden fixture (Retention P1)

**Что это:** запиненные референс-векторы для гейта `npm run smoke:fsrs` — 12 сценариев / 51 шаг
(init-оценки 1–4, Good-цепочки, Again-тяжёлые, same-day t=0, длинные гэпы/overdue, Hard/Easy,
first-again-relearn, cap максимального интервала). Каждый шаг фиксирует
`{dt, grade, stability, difficulty, scheduled_days, reps, lapses, state}`.

**Провенанс (запинен в самом JSON, поле `provenance`):** референс = **ts-fsrs@5.4.1**
(devDependency, используется ТОЛЬКО генератором), поколение **FSRS-6.0**, опубликованные
дефолт-веса (21, decay=w20=0.1542), `request_retention=0.9`, `maximum_interval=36500`,
**long-term-режим**: `enable_short_term=false`, `learning_steps=[]`, `relearning_steps=[]`,
`enable_fuzz=false`. Elapsed-семантика: целочисленный UTC-календарный дифф дней
(все таймстампы фикстуры — UTC-полночь, так что dt точен).

**Как сгенерировано:** `node scripts/premium/generate-fsrs-fixture.js` (коммит той же серии).
Перегенерировать ТОЛЬКО при сознательном бампе поколения/весов — вместе с бампом
`FsrsCore.REFERENCE` (гейт сверяет соответствие и упадёт при рассинхроне).

**Потребитель:** `scripts/premium/fsrs-core-smoke.js` (гейт `smoke:fsrs`) — сверяет
`public/js/fsrs-core.js` с векторами (tol 1e-7; интервалы/reps/lapses — точно) + проверяет
продукт-контракты recon §4.1 (Again→due-now, Δt<0-кламп, skip-fold==nextState,
seed-ветки вкл. interval=0, replay-watermark, детерминизм). Гейт НЕ вызывает ts-fsrs.

**Править руками нельзя** — только перегенерация генератором.
