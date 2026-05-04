# Задача для Claude Code: i18n Premium Completion + Mobile Header UX Fix

## Контекст

Проект: `tts-prototype-android`

В предыдущей итерации был реализован мультиязычный интерфейс RU / EN / HE:

- `ru` — язык по умолчанию;
- `en` — английский интерфейс;
- `he` — ивритский интерфейс с RTL;
- добавлены locale-файлы;
- добавлен `t()`;
- добавлен `appSetLocale()`;
- добавлен `applyI18n()`;
- добавлены smoke-тесты `tests/i18n.smoke.js`;
- создан DoD-документ `docs/I18N_MULTILINGUAL_UI_DOD.md`.

Однако после ручного smoke-check обнаружены реальные UI/i18n-пробелы. Необходимо не просто точечно заменить несколько строк, а довести реализацию до полноценного premium-уровня: системно закрыть все оставшиеся hardcoded user-facing строки, исправить мобильную компоновку переключателей и верхних панелей, усилить тесты, обновить DoD evidence.

---

## Важное требование перед началом

Перед планированием и изменением кода обязательно изучить текущую реализацию:

- `public/index.html`
- `public/i18n/index.js`
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js`
- `tests/i18n.smoke.js`
- `docs/I18N_MULTILINGUAL_UI_PLAN.md`
- `docs/I18N_MULTILINGUAL_UI_DOD.md`
- всю релевантную UI/UX-документацию в `docs/`
- текущие скриншоты smoke-check:
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\1.png`
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\2.png`
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\3.png`
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\4.png`
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\5.png`
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\6.png`
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\7.png`
  - `E:\projects\tts-prototype-android\docs\UI_localizatia\8.png`

Перед внесением правок составить короткий execution plan и зафиксировать:

1. Где именно генерируются проблемные строки.
2. Какие строки являются статическими HTML.
3. Какие строки генерируются динамически через JS.
4. Какие строки являются техническими ID и не должны переводиться.
5. Какие зоны UI ломаются на mobile.
6. Какие тесты нужно расширить.
7. Какие manual smoke checks нужно повторить.

Не делать массовые хаотичные замены без анализа текущих render-функций и DOM-контрактов.

---

# Главная цель итерации

Довести мультиязычный интерфейс до полноценного premium-качества:

1. Исправить мобильную компоновку верхних панелей Classic Mode и IDE Mode.
2. Сделать переключатель языка доступным и корректно размещённым на mobile.
3. Закрыть обнаруженные не локализованные строки в English и Hebrew.
4. Системно закрыть аналогичные i18n-пробелы, даже если они не перечислены в smoke-check явно.
5. Обеспечить корректный RTL для Hebrew во всех затронутых блоках.
6. Добавить тесты, которые ловят подобные регрессии в будущем.
7. Обновить DoD evidence после повторного smoke-check.

---

# Обнаруженные проблемы по smoke-check

## 1. Mobile UX: Classic Mode / IDE Mode header actions

### 1.1 Classic Mode на iPhone 14 Pro Max

На мобильном телефоне iPhone 14 Pro Max в вертикальной ориентации в Classic Mode кнопка/переключатель языка скрывается или визуально конфликтует с кнопкой `IDE режим`.

Текущая проблема:

- элементы верхней панели не адаптируются к узкой ширине;
- language selector и `IDE режим` конкурируют за место;
- часть UI становится скрытой или недоступной;
- это нарушает premium UX и доступность.

Нужно изучить текущую структуру:

- `.classic-utility-bar`
- `.classic-lang-wrap`
- `#appLangSelect`
- кнопку `IDE режим`
- связанные media queries;
- текущую логику скрытия language selector на `<480px`.

### 1.2 IDE Mode на iPhone 14 Pro Max, горизонтальная ориентация

В IDE Mode верхняя панель:

```text
📖 Library
📝 Inspector
📊 Dashboard
🎯 Train
English
↩ Classic
```

не вмещается в горизонтальной ориентации и не прокручивается.

Требуется:

- не допускать обрезания кнопок;
- не допускать недоступных действий;
- обеспечить scroll / wrap / overflow strategy;
- продумать premium mobile UX, а не просто уменьшить шрифт.

---

## Требование к premium mobile header/navigation solution

Claude Code должен изучить текущую реализацию и выбрать лучшее решение, но оно должно соответствовать следующим требованиям.

### Classic Mode

На мобильном экране должны быть доступны:

- Library;
- Dashboard;
- SRS Trainer;
- language selector;
- IDE Mode toggle.

Допустимые premium-решения:

1. Двухстрочная action panel:
   - первая строка: основные действия `Library`, `Dashboard`, `SRS Trainer`;
   - вторая строка: `Language` + `IDE Mode`.

2. Компактный responsive grid:
   - `grid-template-columns: repeat(auto-fit, minmax(...))`;
   - кнопки не перекрываются;
   - language selector занимает отдельную ячейку.

3. Горизонтально прокручиваемый action rail:
   - `overflow-x: auto`;
   - `scroll-snap-type`;
   - видимый hint/gradient;
   - без скрытия элементов.

4. More menu:
   - на desktop всё видно;
   - на mobile часть действий уходит в понятное меню;
   - language selector остаётся доступным не более чем в один tap.

Запрещено:

- полностью скрывать language selector на mobile без альтернативного entrypoint;
- абсолютным позиционированием накрывать один action другим;
- делать fixed width, который ломает iPhone viewport;
- уменьшать всё до нечитаемого размера;
- ломать keyboard/focus navigation.

### IDE Mode

В IDE Mode верхняя action bar должна:

- вмещаться или прокручиваться на iPhone 14 Pro Max landscape;
- не обрезать `Library`, `Inspector`, `Dashboard`, `Train`, language selector, `Classic`;
- иметь `overflow-x: auto` или адаптивный wrap;
- сохранять порядок действий;
- сохранять доступность language selector;
- корректно работать в LTR и RTL.

---

# 2. Не локализована верхняя панель статистики

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\1.png
```

При выбранном English остались русские строки:

```text
119 759
TTS Символы
Через это приложение
Standard voices • до 4M символов/мес бесплатно, далее ≈4 $ за 1M
Использовано: 119 759 / 4 000 000 символов (3% бесплатного лимита)

14
Запросы AI
Переводы таблиц (через это приложение)
Gemini 2.5 Flash · Free Tier
Сегодня: 0 / 50
Сброс квоты через: 5 ч 48 мин

Для просмотра общего лимита:
📊 Открыть Google Cloud Console
```

Требуется локализовать на RU / EN / HE:

- `TTS Символы`
- `Через это приложение`
- `до 4M символов/мес бесплатно`
- `далее ≈4 $ за 1M`
- `Использовано: ...`
- `бесплатного лимита`
- `Запросы AI`
- `Переводы таблиц (через это приложение)`
- `Сегодня: ...`
- `Сброс квоты через: ...`
- `Для просмотра общего лимита:`
- `Открыть Google Cloud Console`
- единицы времени:
  - `ч`
  - `мин`
  - дни/часы/минуты, если используются в других состояниях.

Важно:

- числовые значения и лимиты должны остаться динамическими;
- форматирование чисел не ломать;
- technical names вроде `Gemini 2.5 Flash · Free Tier` можно оставить как product/tier name;
- текст вокруг technical names должен быть локализован.

---

# 3. Не локализованы Result/status/provenance блоки

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\2.png
```

## 3.1 Status chips в блоке Result

Не локализованы:

```text
Актуальность: восстановлена
Library: сохранено
Экспорт: готов
```

Требуется локализовать labels и значения:

RU:

- `Актуальность`
- `восстановлена`
- `Library`
- `сохранено`
- `Экспорт`
- `готов`

EN:

- `Freshness`
- `restored`
- `Library`
- `saved`
- `Export`
- `ready`

HE:

- подобрать естественные UI-переводы, например:
  - `עדכניות`
  - `שוחזר`
  - `ספרייה`
  - `נשמר`
  - `ייצוא`
  - `מוכן`

Не hardcode exact Hebrew без проверки контекста — выбрать естественный краткий интерфейсный вариант.

## 3.2 Result provenance details

Не локализованы:

```text
Озвучка:
восстановлена из Library audio cache (без запроса к TTS)

Таблица:
перевод восстановлен из локального кэша браузера (без запроса к Gemini)
```

Требуется локализовать:

- `Озвучка`
- `Таблица`
- `восстановлена из Library audio cache`
- `без запроса к TTS`
- `перевод восстановлен из локального кэша браузера`
- `без запроса к Gemini`

Technical IDs:

- `TTS`
- `Gemini`
- `Library audio cache`

можно оставить как technical/product names, но окружающий текст должен быть локализован.

## 3.3 Download audio button

Не локализована кнопка:

```text
⬇ Скачать audio
```

Требуется:

- RU: `⬇ Скачать аудио`
- EN: `⬇ Download audio`
- HE: `⬇ הורדת שמע` или другой естественный вариант.

## 3.4 Info line under generated table title

Не локализованы:

```text
Сохранён
Открыт из Library · Аудио: Огласовки → Иврит
```

Требуется локализовать:

- `Сохранён`
- `Открыт из Library`
- `Аудио`
- `Огласовки`
- `Иврит`

Technical/user data не ломать.

---

# 4. Не локализованы generated table controls and headers

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\3.png
```

## 4.1 Button: scenarios and columns

В PC-версии не локализована кнопка:

```text
Сценарии и колонки
```

Требуется:

- RU: `Сценарии и колонки`
- EN: `Scenarios and columns`
- HE: естественный перевод, например `תרחישים ועמודות`.

## 4.2 Generated table headers

В PC и mobile не локализованы заголовки сформированной таблицы:

```text
Иврит
Огласовки
Транслит
Перевод
```

Требуется локализовать:

- `Иврит`
- `Огласовки`
- `Транслит`
- `Перевод`

При этом:

- значения в строках таблицы не переводить;
- Hebrew/Niqqud columns должны остаться RTL;
- Translit и Translation columns должны остаться LTR;
- заголовки должны обновляться при переключении языка без перегенерации таблицы, если технически возможно.

---

# 5. Library v3: не локализованы фильтры, статус, карточки, кнопки

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\4.png
```

При нажатии на `📚 Library` открывается `Library (v3)`, где остались нелокализованные строки.

## 5.1 Фильтр уровней

Не локализовано:

```text
Все уровни
```

Требуется:

- RU: `Все уровни`
- EN: `All levels`
- HE: `כל הרמות`

Не менять option values:

- `alef`
- `alef+`
- `bet`
- etc.

Менять только display labels.

## 5.2 Status line

Не локализовано:

```text
Загружено: 78 · 02.05.2026, 18:20
```

Требуется:

- локализовать `Загружено`;
- дату оставить в текущем формате или аккуратно использовать locale-aware formatting, если уже есть инфраструктура;
- не ломать сортировку/фильтры.

## 5.3 Library card metadata

Не локализовано:

```text
Уровень: alef · Прогресс: строка № —
Источник: —
Последнее открытие: 02.05.2026, 14:56 · Создан: 07.01.2026, 02:46
```

Требуется локализовать labels:

- `Уровень`
- `Прогресс`
- `строка №`
- `Источник`
- `Последнее открытие`
- `Создан`

Не переводить:

- actual level value `alef`, если это техническое значение;
- URL;
- tag names;
- dates as values.

Опционально, если в UI уже есть display mapping уровней:

- `alef` можно отображать как localized display label, но value должен остаться `alef`.

## 5.4 Library card action buttons

Не локализованы:

```text
Открыть
Продолжить
Изменить
В архив
Удалить
```

Требуется добавить locale keys и использовать их во всех местах Library v3:

- RU;
- EN;
- HE.

---

# 6. Library v3 metadata modal: не локализованы заголовки и подсказки

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\5.png
```

При нажатии `Изменить` открывается окно `Метаданные текста`.

Не локализованы:

```text
Метаданные текста
Закрыть
ТЕМА
Tags вводите через запятую. Пустое поле = очистка значения.
```

Также на скриншоте видны labels:

```text
TITLE*
LEVEL
TAGS
SOURCE
TEMA
Cancel
Save
```

Нужно проверить: часть из них может уже быть на английском статически, но должна быть корректно управляемой через i18n.

Требуется:

- локализовать заголовок модального окна;
- локализовать кнопку закрытия;
- локализовать field labels:
  - Title
  - Level
  - Tags
  - Source
  - Topic/Theme
- заменить `TEMA` на нормальный ключ:
  - RU: `ТЕМА`
  - EN: `TOPIC` или `THEME` — выбрать единообразно с остальным UI;
  - HE: естественный вариант.
- локализовать help text:
  - RU: `Теги вводите через запятую. Пустое поле очищает значение.`
  - EN: `Enter tags separated by commas. Leave empty to clear the value.`
  - HE: естественный RTL-текст.
- проверить, что `Cancel` / `Save` берутся из i18n, а не hardcoded.

---

# 7. Learning Dashboard: не локализованы фильтры, статусы, карточки, activity

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\6.png
```

При нажатии `📈 Dashboard` открывается `Learning Dashboard`, где много не локализованных строк.

## 7.1 Header / filters

Не локализованы или частично локализованы:

```text
Learning Dashboard
Refresh
Close
Все уровни
Архив: включён
Reset
```

Требуется:

- решить, должен ли заголовок `Learning Dashboard` переводиться. Для RU должен быть русский UI label, для EN — английский, для HE — иврит.
- локализовать все filter labels/options:
  - `Все уровни`
  - `Tags: ALL`
  - `Search: Texts`
  - `Learning`
  - `View`
  - `Show archived`
  - `Autoplay on Continue`
  - `Архив: включён`
  - `Reset`

## 7.2 Dashboard counters / summary

Не локализованы:

```text
Закреплено: 0 · Недавние: 5 · Активность: 42

За 7 дней: Воспроизведено строк 25 · из них - уникальных 15 · уникальных текстов 3 · время прослушивания 1м 24с

Всего: Воспроизведено строк 92 · из них - уникальных 42 · уникальных текстов 5 · время прослушивания 5м 10с
```

Требуется локализовать:

- `Закреплено`
- `Недавние`
- `Активность`
- `За 7 дней`
- `Всего`
- `Воспроизведено строк`
- `из них уникальных`
- `уникальных текстов`
- `время прослушивания`
- units:
  - `м`
  - `с`
  - часы/минуты/секунды, если используются.

Сделать через параметризованные ключи:

```js
t("dashboard.summaryCounts", { pinned, recent, activity })
t("dashboard.weeklyStats", { playedRows, uniqueRows, uniqueTexts, listenTime })
t("dashboard.totalStats", { playedRows, uniqueRows, uniqueTexts, listenTime })
```

или аналогично.

## 7.3 Pinned empty state

Не локализовано:

```text
Пока нет закреплённых текстов.
```

Требуется локализовать RU / EN / HE.

## 7.4 Activity section

Не локализованы:

```text
🧾 Activity
Все тексты
Показано: 42 (из 42) · Источник: Все тексты
```

Требуется:

- локализовать заголовок, если он user-facing;
- локализовать `Все тексты`;
- локализовать `Показано`;
- локализовать `из`;
- локализовать `Источник`.

## 7.5 Recent / Activity cards

Не локализованы metadata labels:

```text
Источник:
тема:
прослушано:
последний раз:
прослушано: 1 · последний раз: 28.04.2026, 16:44
```

Требуется:

- локализовать labels;
- не переводить user content, URLs, tag values, dates;
- проверить карточки в Recent и Activity отдельно.

## 7.6 Dashboard action buttons

Не локализованы:

```text
Продолжить
Открыть
Изменить
Закрепить
Перейти
Прослушать
```

Требуется:

- вынести в общие action keys;
- использовать одинаково в Library и Dashboard там, где действия совпадают;
- не плодить дублирующиеся ключи без необходимости.

---

# 8. System diagnostics: не локализованы заголовки, статусы, labels

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\7.png
```

Блок:

```text
🔧 System diagnostics
Sidecar (AI local)
Python sidecar
онлайн
Nakdan (niqqud)
готов
MADLAD-400
unloaded
Idle timeout
15 мин

GCP Translate
GCP Translate
не настроен

Кэш (pipeline)
Doc cache
Segment cache
Overrides

Библиотека
Текстов (активных)
Предложений

Версии компонентов
Segmenter
Nikud model
Translit/sbl
Translit/ru-phonetic
madlad
gcp
google-free
legacy-gemini
manual

Обновлено · 2026-05-02 15:29:04 UTC
```

Требуется разделить строки на 3 категории.

## 8.1 User-facing labels — локализовать

Локализовать:

- `System diagnostics`
- `Sidecar (AI local)`
- `Python sidecar`
- `Nakdan (niqqud)` — можно оставить product name, но label вокруг должен быть нормальным.
- `Idle timeout`
- `GCP Translate`
- `Кэш (pipeline)`
- `Doc cache`
- `Segment cache`
- `Overrides`
- `Библиотека`
- `Текстов (активных)`
- `Предложений`
- `Версии компонентов`
- `Обновлено`

## 8.2 Status values — локализовать

Локализовать:

- `онлайн`
- `готов`
- `не настроен`
- `unloaded`
- другие возможные статусы:
  - `offline`
  - `loading`
  - `ready`
  - `error`
  - `unknown`
  - `not configured`
  - `disabled`
  - `enabled`

## 8.3 Technical component IDs — не переводить

Не переводить:

- `regex-v1`
- `dictabert-large-char-menaked@dicta-il`
- `sbl-v4-nodagesh`
- `ru-phonetic-v1`
- `madlad-400-10b-ct2-int8f16`
- `gcp-translate-v3-nmt`
- `google-free-gtx-v1`
- `gemini-flash-latest`
- `manual-v1`

Но рядом с ними user-facing labels должны быть локализованы.

---

# 9. Status badges in Classic settings panels

Скриншот:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\8.png
```

В PC Classic Mode в блоках `TTS Settings` и `Translation & Table Settings` не локализованы статусные badge/buttons:

```text
🔑 загружен
```

Также проверить похожие статусы:

- `ключ загружен`
- `не загружен`
- `настроен`
- `не настроен`
- `доступен`
- `недоступен`
- `Online TTS`
- `TTS: Online TTS`
- `Selected provider`
- `Translation provider`
- `Transliteration profile`
- `Hebrew font in table`

Требуется:

- локализовать label/status text;
- technical provider names оставить как product names;
- добиться, чтобы при English не было русских badge status, а при Hebrew — русских/английских user-facing labels без необходимости.

---

# 10. Системный hardcoded-string audit

Нужно провести новый аудит строк после предыдущей i18n-итерации.

Использовать PowerShell:

```powershell
cd E:\projects\tts-prototype-android

git status
git branch --show-current

Get-ChildItem -Recurse -File public,docs -Include *.html,*.js,*.css,*.md |
  Select-String -Pattern "Актуальность|Озвучка|Таблица|Скачать audio|Сценарии и колонки|Иврит|Огласовки|Транслит|Перевод|Все уровни|Загружено|Уровень|Прогресс|Источник|Последнее открытие|Создан|Открыть|Продолжить|Изменить|В архив|Удалить|Метаданные текста|Закрыть|ТЕМА|Tags вводите|Архив|Закреплено|Недавние|Активность|Воспроизведено|прослушано|последний раз|Пока нет закреплённых|Все тексты|Показано|онлайн|готов|не настроен|Обновлено|загружен|Символы|Запросы AI|Сегодня|Сброс квоты|бесплатного лимита" |
  Select-Object Path, LineNumber, Line
```

Также выполнить обратный аудит английских user-facing строк:

```powershell
Get-ChildItem -Recurse -File public -Include *.html,*.js |
  Select-String -Pattern "Library|Dashboard|Result|Download|Save|Close|Refresh|Search|All levels|Source|Created|Last opened|Continue|Open|Edit|Archive|Delete|System diagnostics|Updated|Selected provider|Translation provider|Hebrew font|Transliteration profile|Ready|Loaded|Not configured|Unloaded" |
  Select-Object Path, LineNumber, Line
```

Важно:

- результаты аудита не использовать слепо;
- technical IDs, API paths, class names, DOM ids, localStorage keys не переводить;
- user-facing labels и messages — переводить через `t()`.

---

# 11. Требования к архитектуре исправления

## 11.1 Не плодить хаос в locale keys

Перед добавлением ключей проверить текущую структуру:

- `app`
- `classic`
- `library`
- `dashboard`
- `tts`
- `translation`
- `table`
- `status`
- `toast`
- `confirm`
- `diagnostics`
- `actions`
- `common`

Если таких namespaces нет — привести к аккуратной структуре без массового несовместимого refactor.

Предпочтительно:

- общие кнопки вынести в `actions.*`;
- общие статусы — в `status.*`;
- единицы времени — в `time.*`;
- Library-specific — в `library.*`;
- Dashboard-specific — в `dashboard.*`;
- Diagnostics-specific — в `diagnostics.*`.

## 11.2 Параметризованные строки

Для строк с числами и датами использовать interpolation:

```js
t("library.loadedStatus", { count, date })
t("dashboard.summaryCounts", { pinned, recent, activity })
t("stats.ttsUsage", { used, limit, percent })
t("stats.quotaResetIn", { hours, minutes })
```

Не собирать локализованные строки конкатенацией русских слов.

Плохо:

```js
"Загружено: " + count + " · " + date
```

Хорошо:

```js
t("library.loadedStatus", { count, date })
```

## 11.3 Dynamic render functions

Проверить все render/update functions, которые создают:

- stats cards;
- result chips;
- provenance blocks;
- generated table header;
- Library v3 cards;
- metadata modal;
- Dashboard cards;
- Activity list;
- diagnostics block;
- settings badges.

Все user-facing strings внутри таких функций должны использовать `t()`.

## 11.4 Re-render on locale change

После переключения языка должны обновляться не только статические `data-i18n`, но и уже отрисованные динамические блоки:

- stats cards;
- Result/provenance;
- generated table headers;
- Library modal if open;
- metadata modal if open;
- Dashboard modal if open;
- System diagnostics block;
- settings status badges.

Требуется:

- использовать событие `i18n:changed`;
- либо на `appSetLocale()` вызывать набор безопасных re-render функций;
- не перегенерировать данные заново и не делать лишние API-запросы;
- переводить только UI labels.

---

# 12. UI/UX constraints

Обязательные требования:

1. На mobile не должно быть горизонтального overflow всей страницы.
2. Горизонтальный scroll допустим только внутри специальных контейнеров, например таблицы или action rail.
3. Любая верхняя панель с кнопками должна иметь:
   - wrap,
   - scroll,
   - responsive grid,
   - или More menu.
4. Нельзя прятать language selector без альтернативного mobile-доступа.
5. Минимальный tap target на mobile — примерно 44px.
6. Не использовать фиксированную ширину, которая ломает iPhone 14 Pro Max.
7. В RTL:
   - панели должны быть читаемы;
   - кнопки не должны менять смысловой порядок хаотично;
   - таблица не должна ломаться;
   - transliteration должна оставаться LTR.
8. Focus states и keyboard navigation не ломать.
9. `aria-label` у language selector и меню должен быть локализован.
10. Не ломать существующие DOM ids и event handlers.
11. Не менять API/data contracts.
12. Не менять provider IDs, voice IDs, localStorage keys.

---

# 13. Patch plan

## PATCH-08 — Smoke-check bug audit + fix plan

Создать документ:

```text
docs/I18N_PREMIUM_COMPLETION_PLAN.md
```

В документе зафиксировать:

- найденные проблемные зоны;
- где строки генерируются;
- какие файлы и функции будут изменены;
- какие строки нужно добавить в locale;
- какие mobile layout rules нужно исправить;
- какие тесты будут добавлены;
- какие non-goals остаются.

## PATCH-09 — Mobile header/action UX fix

Исправить Classic Mode и IDE Mode mobile action bars.

Ожидаемый результат:

- iPhone 14 Pro Max portrait: language selector и IDE Mode не перекрываются;
- iPhone 14 Pro Max landscape IDE: Library/Inspector/Dashboard/Train/Language/Classic доступны;
- нет обрезания кнопок;
- нет page-level horizontal overflow;
- UI выглядит premium, а не как аварийный перенос.

Добавить CSS/media-query tests или lightweight DOM/style smoke, если в проекте есть подходящая инфраструктура.

## PATCH-10 — Stats cards i18n

Локализовать верхние карточки статистики:

- TTS chars;
- AI requests;
- quota status;
- reset time;
- Cloud Console CTA.

Добавить locale keys RU / EN / HE.

## PATCH-11 — Result/provenance/table i18n

Локализовать:

- Result chips;
- Result provenance;
- Download audio;
- saved/opened/library/audio info line;
- table scenario button;
- table headers.

Проверить already-rendered table update при смене языка.

## PATCH-12 — Library v3 full dynamic i18n

Локализовать:

- filters;
- loaded status;
- card metadata;
- action buttons;
- empty states;
- save/current table controls if present.

Не ломать:

- library search;
- filters;
- sort;
- open/continue/edit/archive/delete.

## PATCH-13 — Metadata modal i18n

Локализовать:

- title;
- close;
- field labels;
- help text;
- cancel/save;
- validation/error messages, если есть.

Исправить `TEMA` naming:

- использовать нормализованный ключ `topic` или `theme`;
- сохранить совместимость с текущими данными.

## PATCH-14 — Dashboard full dynamic i18n

Локализовать:

- dashboard title;
- filters;
- archive status chip;
- summary counters;
- weekly/total stats;
- pinned empty state;
- Recent cards;
- Activity section;
- card metadata;
- action buttons.

Проверить:

- refresh;
- filter;
- show archived;
- autoplay;
- continue/open/edit/pin/go/listen actions.

## PATCH-15 — System diagnostics and settings badges i18n

Локализовать:

- diagnostics headings;
- labels;
- statuses;
- updated timestamp label;
- settings badges:
  - loaded;
  - key loaded;
  - configured/not configured;
  - selected provider labels.

Technical IDs оставить как есть.

## PATCH-16 — Tests, grep guards, DoD appendix

Расширить `tests/i18n.smoke.js` или добавить новый файл:

```text
tests/i18n.premium-completion.smoke.js
```

Минимальные проверки:

1. Locale key symmetry RU/EN/HE сохраняется.
2. Новые keys есть во всех локалях.
3. Критичные новые keys resolve во всех 3 локалях.
4. Interpolation работает для:
   - stats usage;
   - library loaded status;
   - dashboard summary;
   - diagnostics updated.
5. `he` ставит RTL.
6. `ru/en` ставят LTR.
7. `appSetLocale()` не ломает dynamic re-render hooks.
8. Нет запрещённых русских фраз в English render fixtures.
9. Нет запрещённых русских фраз в Hebrew render fixtures, кроме intentional test data.
10. Mobile header classes содержат overflow/wrap strategy.

Добавить или обновить:

```text
docs/I18N_MULTILINGUAL_UI_DOD.md
```

или создать:

```text
docs/I18N_MULTILINGUAL_UI_DOD_APPENDIX.md
```

В DoD добавить:

- какие скриншоты smoke-check закрыты;
- какие команды тестов выполнены;
- grep audit summary;
- manual smoke checklist;
- known limitations;
- mobile UX decision.

---

# 14. Tests / commands

Перед изменениями:

```powershell
cd E:\projects\tts-prototype-android
git status
git branch --show-current
```

После изменений:

```powershell
node tests/i18n.smoke.js
```

Если добавлен новый тест:

```powershell
node tests/i18n.premium-completion.smoke.js
```

Если есть package scripts:

```powershell
npm test
```

Проверить grep-аудит после реализации:

```powershell
Get-ChildItem -Recurse -File public -Include *.html,*.js |
  Select-String -Pattern "Актуальность|Озвучка|Скачать audio|Сценарии и колонки|Все уровни|Загружено|Метаданные текста|Закрыть|ТЕМА|Архив: включён|Закреплено|Воспроизведено|Пока нет закреплённых|Все тексты|Показано|онлайн|готов|не настроен|Обновлено|загружен" |
  Select-Object Path, LineNumber, Line
```

Результат не обязан быть полностью пустым, потому что русские строки могут легитимно находиться в `ru.js`. Но вне `ru.js` и тестовых fixtures user-facing русские hardcoded строки должны быть устранены или объяснены.

---

# 15. Manual smoke checklist

После реализации вручную проверить.

## 15.1 iPhone 14 Pro Max — Classic Mode portrait

- [ ] Language selector доступен.
- [ ] `IDE режим` не перекрывает language selector.
- [ ] Library/Dashboard/SRS Trainer доступны.
- [ ] Нет горизонтального overflow всей страницы.
- [ ] Кнопки имеют нормальный tap target.
- [ ] Переключение RU/EN/HE работает.

## 15.2 iPhone 14 Pro Max — IDE Mode landscape

- [ ] Library доступна.
- [ ] Inspector доступен.
- [ ] Dashboard доступен.
- [ ] Train доступен.
- [ ] Language selector доступен.
- [ ] Classic доступен.
- [ ] Если используется horizontal scroll — он работает.
- [ ] Если используется wrap — панель не ломает layout.

## 15.3 English locale

Проверить, что на English больше нет русских UI labels в:

- [ ] верхней панели статистики;
- [ ] Result chips;
- [ ] provenance block;
- [ ] Download audio;
- [ ] table info line;
- [ ] table headers;
- [ ] scenarios/columns button;
- [ ] Library v3;
- [ ] metadata modal;
- [ ] Dashboard;
- [ ] System diagnostics;
- [ ] TTS Settings badges;
- [ ] Translation & Table Settings badges.

## 15.4 Hebrew locale

Проверить:

- [ ] весь UI переключается в RTL;
- [ ] language selector доступен;
- [ ] верхняя статистика локализована;
- [ ] Result/provenance локализованы;
- [ ] таблица не ломается;
- [ ] Hebrew/Niqqud columns RTL;
- [ ] Translit LTR;
- [ ] Translation LTR;
- [ ] Library v3 читаема;
- [ ] Dashboard читаем;
- [ ] Diagnostics читаем;
- [ ] mobile panels не ломаются.

## 15.5 Regression

- [ ] Сгенерировать таблицу из ивритского текста.
- [ ] Проверить niqqud.
- [ ] Проверить transliteration.
- [ ] Проверить translation.
- [ ] Скачать audio.
- [ ] Сохранить таблицу в Library.
- [ ] Открыть Library.
- [ ] Найти текст.
- [ ] Открыть/продолжить текст.
- [ ] Изменить metadata.
- [ ] Открыть Dashboard.
- [ ] Прослушать из Dashboard.
- [ ] Открыть System diagnostics.
- [ ] Вернуться в Classic.

---

# 16. Definition of Done

Итерация считается завершённой только если:

1. Исправлена мобильная проблема Classic Mode на iPhone 14 Pro Max portrait.
2. Исправлена мобильная проблема IDE Mode на iPhone 14 Pro Max landscape.
3. Language selector доступен на mobile.
4. Нет перекрытия language selector и IDE/Classic toggle.
5. Верхние stats cards локализованы RU/EN/HE.
6. Result chips локализованы RU/EN/HE.
7. Result provenance локализован RU/EN/HE.
8. Download audio button локализована RU/EN/HE.
9. Table info line локализована RU/EN/HE.
10. Scenarios and columns button локализована RU/EN/HE.
11. Generated table headers локализованы RU/EN/HE.
12. Library v3 filters/status/cards/buttons локализованы RU/EN/HE.
13. Metadata modal локализована RU/EN/HE.
14. Dashboard filters/summary/cards/activity/buttons локализованы RU/EN/HE.
15. System diagnostics labels/statuses локализованы RU/EN/HE.
16. TTS/Translation settings badges локализованы RU/EN/HE.
17. Technical IDs не переименованы.
18. localStorage keys не изменены.
19. Provider IDs не изменены.
20. API contracts не изменены.
21. Dynamic UI обновляется при переключении языка без перезагрузки, где это технически возможно.
22. Hebrew RTL не ломает таблицы, карточки и панели.
23. Smoke tests проходят.
24. Добавлены тесты на новые критичные ключи.
25. Выполнен grep-аудит hardcoded строк.
26. Обновлена документация DoD/evidence.
27. Git diff не содержит случайного большого refactor не по задаче.
28. Existing app behavior не регрессировал.

---

# 17. Non-goals

Не делать в этой итерации:

- не переводить пользовательский контент, сохранённые тексты, URL, tags;
- не переводить technical provider IDs;
- не переводить model IDs;
- не менять localStorage schema без необходимости;
- не переписывать весь `public/index.html` с нуля;
- не мигрировать проект на React/Vue/Svelte;
- не менять backend API;
- не менять бизнес-логику TTS/translation/Library;
- не делать косметический redesign вне задач mobile header/i18n completion.

---

# 18. Финальный отчёт

После реализации предоставить отчёт:

1. Какие строки и UI-зоны были найдены.
2. Какие функции/render blocks изменены.
3. Какие locale keys добавлены.
4. Как решена mobile header проблема.
5. Как решена IDE landscape проблема.
6. Как обеспечено dynamic re-render on locale change.
7. Какие тесты выполнены.
8. Результаты grep-аудита.
9. Какие скриншоты smoke-check закрыты.
10. Какие known limitations остались.
11. Commit-ready summary.

Отчёт должен быть конкретным: файлы, функции, тесты, результаты.
