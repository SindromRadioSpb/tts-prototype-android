# CLG-P8.4b — Manual mode «Выбрать режим» — SPEC-дельта

**Date:** 2026-07-10 · **Parents:** `TELEGRAM_MINI_APP_P8_4_CHARTER_REV_2026_07_10.md` §2 (manual-eligibility contract, owner-продиктован) + §5 слайс 4b; write-путь P8.4a переиспользуется БЕЗ изменений.
**Скоуп:** выбор модальности пользователем (📖 Контекст / 🔤 RU→HE / ✍️ Диктант — «Аудио» появится в 4c, мёртвых кнопок не рисуем) + провенанс manual-выбора. **НЕ в 4b:** listen, настройки/opt-out'ы, handoff.

## §1 Контракт (из чартера §2, повторён нормативно)
Пользователь выбирает МОДАЛЬНОСТЬ — сервер выбирает слова. Per-modality honesty-гейты те же, что у селектора: cloze = якорь+однозначный blank (`selectClozeChallenge`); reverse = strictSafe-глосс; dictate = омофон-safe + ассет + https-base. Общие: exposure-cooldown СОХРАНЯЕТСЯ, single-open-challenge, consent-гейты. **Manual = осознанный override ⇒ reading-first-резервация НЕ применяется** (эквивалент all_due). Пустой пул модальности → честное `nothing-for-modality` + предложение умной тренировки (НИКОГДА тихая подмена режима).

## §2 Изменения
- **Миграция 037 (additive):** `agent_challenges` += `selection_origin TEXT NOT NULL DEFAULT 'selector'` (`selector|manual`) · `requested_modality TEXT`.
- **`selectForModality(userId, modality, {nowMs})`** в reviewSession: тот же due-snapshot (`REVIEW_DUE_WINDOW`, материализованный exposure, один nowMs); предикаты — те же модули-истины, что у селектора (`selectClozeChallenge` / `glossForItemKey.strictSafe` / `dictateFormForItemKey`+`computeDictateAssetKey`+`hasAsset`+`publicBaseUrl`); порядок — due-order (первый eligible). `select_reason='user_choice'` (новый enum; `format.selectExplanation` fail-safe вернёт "" — объяснение не показывается by construction).
- **`start({mode:'manual', modality})`**: валидация enum → `selectForModality` → caps + `selection_origin='manual'`, `requested_modality` → остальное 1:1 c P8.4a (preview при write-OFF тоже работает).
- **BFF**: body `{mode:'manual', modality:'cloze'|'reverse'|'dictate'}` (интент, ничего больше).
- **Shell**: home-ряд «Выбрать режим» (3 кнопки) → липкая сессия `{mode:'manual', modality}` через «Дальше»; result-карточка получает компактную **«Сменить режим»** → home (смена МЕЖДУ карточками, не внутри challenge — owner-правило); пустой пул → честная копия + кнопка умной тренировки.

## §3 Инлайн-критика (компакт; полный workflow сознательно downscoped — write-путь не меняется)
| Вектор | Закрытие |
|---|---|
| Клиент подделывает провенанс | клиент шлёт ТОЛЬКО enum mode/modality; `selection_origin/requested_modality/select_reason` пишет сервер |
| Manual обходит cooldown/binding/scope | нет: та же `createChallenge`→`reviewer`-цепочка P8.4a; exposure-фильтр в selectForModality |
| Тихая подмена модальности при пустом пуле | `nothing-for-modality` — отдельный none-код, shell не автостартует умную |
| `requested_modality` ≠ фактический `review_mode` | modality → caps той же веткой `_capsForSurface(kind)`; несовпадение невозможно by construction |
| Новые INSERT-колонки ломают писателя | `createChallenge` — явный column-list (не OR REPLACE); +2 колонки в тот же список; гейт проверяет roundtrip |
| Двойной селектор (нарушение §20.1) | selectForModality — НЕ ranking-селектор, а modality-фильтр над теми же предикатами-истинами; тир-лестница selectEligible не дублируется |
| reading-first дыра | обход резервации — ЯВНОЕ owner-решение чартера §2 («manual = эквивалент all_due») |

## §4 Гейт (дельта в smoke:miniapp-review)
manual-cloze (ON): challenge создан с `selection_origin='manual'`, `requested_modality='cloze'`, `select_reason='user_choice'`, `review_mode='cloze:ma'` · manual-dictate без PUBLIC_BASE_URL → честный `nothing-for-modality` (zero-write) · answer manual-challenge → штатная строка (write-путь не отличается) · клиентские поля провенанса в body игнорируются.
