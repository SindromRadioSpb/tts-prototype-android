# CLG-P8.4c — Рецептивная модальность «Аудио» (listen-MC) — SPEC-дельта

**Date:** 2026-07-10 · **Parents:** чартер-ревизия §4 (owner) + continuity-директива (v3.11.135) · write-путь P8.4a без изменений.
**Продуктовая роль:** continuity-замыкание — хвост due, непригодный для письменных модальностей, получает честную рецептивную тренировку вместо отсылки в Зал.

## §1 Упражнение (зеркало ПК-«Аудио», v1 на word-ассетах)
Звучит СЛОВО (запечённый dictate-ассет — те же 6912 форм; для СЛУШАНИЯ омофонность цели не порок, но v1 использует существующий safe-набор ассетов) + показан RU-глосс → выбор ОГЛАСОВАННОЙ ивритской формы из 4 → детерминированный грейд (совпадение поверхности → 3; чужая → 1; «Не знаю» → skip). Канал `listen:ma` — рецептив (grade-policy: не production; D1 receptive-семантика штатно).

## §2 Механика (все инварианты P8.4a наследуются)
- **Challenge-bound** (`prompt_kind='listen'`, `evidence_scope='receptive'`): single-use/exposure/TTL/replay/annul — тот же конвейер. `shown_stimulus` = JSON `{assetKey, gloss, options[4]}` (класс A: словарные данные; опции ПЕРСИСТЯТСЯ — resume стабилен).
- **Reviewer-дельта:** `CHALLENGE_CHANNEL_RE` += `listen`; `PRODUCTION_RE` listen не матчит → EXPECTED_SCOPE-проверка (production-only) не применяется by construction; `GRADE_ARGS.input_mode` += `'mc'`.
- **Дистракторы — серверные, без LLM:** огласованные формы ДРУГИХ due-слов (dictate-форма как источник) — crypto-выбор 3 шт.; исключаются совпадающие СКЕЛЕТЫ с целью (skeleton-матч грейдера не должен ложно принять дистрактор) и дубль-глоссы; <3 кандидатов → listen для слова не eligible (честно).
- **selectForModality('listen')** — тот же snapshot/cooldown; **в selectEligible НЕ добавляется** (бот не рендерит MC — parity бота цел, §20.1 не нарушен: ladder не трогаем).
- **Авто-continuity в start():** all_due-селектор пуст при due>0 → перед `nothing-production-eligible` пробуем `selectForModality('listen')` → challenge с `select_reason='receptive_fallback'` (объяснение fail-safe пустое). Тупик остаётся только когда честно НЕЧЕГО.
- **Manual:** кнопка 🎧 Аудио (4-я, `MANUAL_MODALITIES.listen`).

## §3 Shell
Карточка: заголовок «Аудио: выберите услышанное слово» · плеер (opaque-токен, класс A) · глосс · 4 кнопки-опции (RTL, крупно) · «Не знаю». Пик → submit `{answer: <опция>, input_mode:'mc'}`. Result-карточка штатная (reveal-предложение через resolveAnchorLive, если якорь есть).

## §4 Гейт-дельта (miniapp-review)
listen-challenge: опции=4, содержит цель, скелеты дистракторов ≠ скелету цели · answer верной опцией → одна строка `listen:ma`, meta.input_mode='mc', grade 3 · неверной → grade 1 · «Не знаю» → kind=skip · receptive: hasProductionSuccess по listen-строке = false · авто-fallback: продукционный пул пуст + listen-eligible due → challenge listen с select_reason='receptive_fallback' · manual listen без ассетов → nothing-for-modality.

## §5 Инлайн-критика
| Вектор | Закрытие |
|---|---|
| Дистрактор — синоним цели (ложный wrong) | дистракторы из НЕсовпадающих глоссов (строчная дедупликация) + других слов |
| Дистрактор одинаков по скелету (ложный correct) | skeleton-фильтр при генерации |
| Опции меняются на resume (нечестный MC) | options персистятся в shown_stimulus |
| listen ломает bot-parity | не входит в selectEligible; :tg-канала listen нет |
| MC-угадайка инфлирует память | рецептивный канал: не production-evidence; FSRS получает честный receptive-грейд |
