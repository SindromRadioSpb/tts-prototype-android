## 2026-06-27 | main | Track-any-word T-a + T-b + кросс-колоночный фикс окраски

**Прод app+SW → v3.11.16** (верифи ✓). Зал-only, parity-safe, resolver не тронут.

**v3.11.16 (`965f91f`) — фикс кросс-колоночной окраски (ktiv male/chaser):** владелец на «חֲרוּז נִשְׁכָּח» — статус, поставленный 1 раз, красил только ОДНУ колонку у части слов. Измерено: для слова с расхождением плене/дефектного написания (`חרישי` простой текст vs `חֵרִשִׁי`→`חרשי` огласовки) (a) `alignSurfaceNiqqud` не сматчивал (равенство снятых огласовок) → плене-слово без огласовки, (b) surface-ключ неуверенного слова из расходящегося `card.word`. Фикс (Room-only, resolveCore/card.word/notes НЕ тронуты): позиционный fallback в `alignSurfaceNiqqud` (остаток токенов 1:1) + `_statusKeyWord` деривирует ключ из огласовки. Регрессия в smoke reader-morph; зонд `colorall.js` (тап 1 колонки → красятся ВСЕ спаны обеих). **«Синий» на тапнутом слове = `.rm-w-active`(accent), маскирует статус-заливку пока карточка открыта — НЕ баг.** Память [[feedback_ktiv_surface_key_consistency]].

### Что сделано в этой сессии (Эпик «отмечать любое слово честно»)
- **T-a — SHIPPED (v3.11.14, `d42dada`):** `decorateWords` (reader-morph.js) снял confident-гейт с ПОИСКА цвета. confident → lemma-key (default `new`/синий); unconfident (function/unknown) → красится ТОЛЬКО если есть запись `states[surfaceKey]` (явный manual-статус ИЛИ сохранённая заметка), иначе plain (честно, не фабрикуем 'new'). R11-прецедент: surface-статус не течёт на confident-гомограф. Smoke: `על`/`בנימה` без engagement → plain; со статусом → красятся по surface.
- **T-b — SHIPPED (v3.11.15):** ручной перевод неизвестных. Карточка unknown (нет офлайн-глосса) → CTA «＋ Добавить перевод» → инлайн-редактор (input+Сохранить+Отмена, Enter/Esc) → `_attachOpts.saveUserMeaning` создаёт/обновляет ТУ ЖЕ канон-заметку word_study с `meaning_source='user'` (синк Anki; dedup-key = `pid:`/`surface#pos`, meaning-independent → lookup стабилен). На карточке user-meaning помечен **«ваш»** + ✎. `resolveWordLight` ре-сёрфит сохранённый перевод при ре-открытии через `lookupUserMeaning` (ТОЛЬКО в honest-empty глосс; машинное/Tier-3 чтение всегда побеждает).
  - Файлы: `library-ui.js` (`roomLookupUserMeaning`/`roomSaveUserMeaning` + opts `lookupUserMeaning`/`saveUserMeaning`), `reader-morph.js` (resolveWordLight lookup-branch + renderCardHtml meaning-block/editor + `onMeaningSave`/`onMeaningEditToggle` + delegation + keydown), `library.html` CSS (.rm-meaning-mine/-add/-edit/-editor/-input/-save/-cancel + **`.rm-meaning-editor[hidden]{display:none}` гард** над author `display:flex`), locales ru/en/he (room.morph.addMeaning/editMeaning/meaningPlaceholder/saveMeaning/cancel/yourMeaning/yourMeaningHint/meaningSavedToast), smoke `reader-morph` (T-b блок).
- **Ловушка (записать в память при желании):** author `display:flex` на классе перебивает UA `[hidden]{display:none}` (специфичность класса == атрибута, но author>UA) → инлайн-редактор был виден всегда. Фикс: `.cls[hidden]{display:none}`. Smoke теперь проверяет **computed display**, не только `.hidden`-проперти.

### Гейты (все зелёные локально)
reader-morph (+T-a +T-b), reader-notes, reader-word-status, reader-context, reader-scaffold 234, reader-parity, i18n 226.

### NEXT
1. **Прод-верифи v3.11.15** (T-a+T-b вместе): Node-fetch no-store на `sw.js` CACHE_VERSION=v3.11.15 + проба маркеров reader-morph.js (`saveUserMeaning`/`rm-meaning-add`). НЕ curl (Windows curl манглит иврит).
2. **Volume-тест на большом профиле владельца** (заметки/статусы — OPFS): owner-device проверка карточки unknown→добавить перевод→ре-открыть→«ваш»; служебное/unknown слово отметить статусом→красится.
3. **Эпик 4.3** (recall-loop + frontier-study, граф-квиз Студии) — designed/locked, в очереди (task #10).

### Инварианты сессии (НЕ нарушать)
index.html/Studio не трогать без крайней необходимости (тронут только footer-версия). Резолвер морфологии не трогать. Если фикс затрагивает resolver/notes-autogen lock-step → стоп, развилка владельцу. Канон концепции: `docs/planning/BRR_TRACK_ANY_WORD_CONCEPT_2026_06_27.md` (§СТАТУС РЕАЛИЗАЦИИ).
