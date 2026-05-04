# Задача для Claude Code: premium mobile UX для IDE Mode toolbar + регулировка ширины колонок таблицы на mobile

## Контекст

Проект: `tts-prototype-android`.

В проекте уже реализованы:

- Classic Mode;
- IDE Mode;
- мультиязычный интерфейс RU / EN / HE;
- переключатель локализации;
- RTL для иврита;
- верхняя IDE-панель с действиями:
  - `📖 Library`
  - `📝 Inspector`
  - `📊 Dashboard`
  - `🎯 Train`
  - language selector
  - `↩ Classic`;
- в Classic Mode уже реализована возможность регулировать ширину колонок таблицы.

После ручного smoke-check обнаружены две связанные UX-проблемы в мобильном IDE Mode:

1. Верхняя панель IDE Mode на мобильном устройстве в portrait отображается частично и обрезает часть кнопок.
2. В IDE Mode на мобильном устройстве необходимо реализовать возможность регулировать ширину колонок таблицы, включая последнюю колонку, так как в Classic Mode это уже реализовано и является ожидаемым поведением.

Задача — довести IDE Mode на мобильных устройствах до premium-качества для платного учебного продукта.

---

## Скриншоты для анализа

Обязательно изучить скриншоты:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\v3\3.PNG
E:\projects\tts-prototype-android\docs\UI_localizatia\v3\4.PNG
```

### Скриншот 1 — IDE Mode, mobile landscape

Файл:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\v3\3.PNG
```

На мобильном устройстве в горизонтальной ориентации верхняя панель IDE Mode в целом отображает все кнопки:

- `Library`;
- `Inspector`;
- `Dashboard`;
- `Train`;
- выбор языка интерфейса;
- `Classic`.

Но видно, что панель занимает слишком много вертикального и горизонтального пространства.

### Скриншот 2 — IDE Mode, mobile portrait

Файл:

```text
E:\projects\tts-prototype-android\docs\UI_localizatia\v3\4.PNG
```

На мобильном устройстве в вертикальной ориентации верхняя панель IDE Mode отображается частично:

- часть кнопок видна;
- часть панели уходит за пределы экрана;
- кнопка выбора языка видна частично;
- `Classic` может быть недоступна без понятного способа добраться до неё;
- пользовательский сценарий выглядит не как premium-продукт, а как desktop UI, сжатый в мобильный экран.

---

# Главная цель

Разработать и реализовать premium mobile UX для IDE Mode:

1. Исправить верхнюю панель IDE Mode на мобильных устройствах.
2. Сделать все основные действия доступными:
   - Library;
   - Inspector;
   - Dashboard;
   - Train;
   - language selector;
   - Classic / возврат в Classic Mode.
3. Реализовать в IDE Mode на мобильном устройстве регулировку ширины колонок таблицы, включая последнюю колонку.
4. Сохранить поведение desktop-версии.
5. Не сломать Classic Mode.
6. Не сломать i18n RU / EN / HE и RTL.
7. Не сломать существующие DOM id, event handlers, localStorage keys и пользовательские настройки.

---

# Обязательный предварительный этап

Перед изменением кода обязательно изучить:

- `public/index.html`
- CSS внутри `public/index.html`
- media queries для mobile/tablet/desktop
- DOM-структуру IDE Mode header
- DOM-структуру IDE Mode table
- DOM-структуру Classic Mode table
- JS-логику переключения IDE/Classic
- JS-логику language selector
- JS-логику регулировки ширины колонок в Classic Mode
- JS-логику сохранения настроек таблицы в Classic Mode
- i18n-модуль:
  - `public/i18n/index.js`
  - `public/i18n/locales/ru.js`
  - `public/i18n/locales/en.js`
  - `public/i18n/locales/he.js`
- документы:
  - `docs/I18N_MULTILINGUAL_UI_PLAN.md`
  - `docs/I18N_MULTILINGUAL_UI_DOD.md`
  - `docs/I18N_PREMIUM_COMPLETION_PLAN.md`, если файл есть
- текущие DoD/evidence-документы по UI/i18n, если есть.

Перед реализацией составить короткий audit/plan:

1. где находится IDE header markup;
2. какие классы отвечают за layout верхней панели;
3. почему toolbar не помещается в portrait;
4. какие breakpoints сейчас используются;
5. какие действия являются primary;
6. какие действия можно спрятать в overflow / More menu;
7. что должно остаться доступным в один tap;
8. как решение будет работать в RU / EN / HE;
9. как решение будет работать в RTL;
10. как сейчас реализована регулировка ширины колонок в Classic Mode;
11. почему эта регулировка не работает или отсутствует в IDE Mode mobile;
12. можно ли переиспользовать существующую логику Classic Mode;
13. как сохранить ширины колонок IDE Mode;
14. какие тесты и smoke-checks нужно добавить.

---

# Проблема 1: текущий UX верхней панели IDE Mode

Сейчас IDE Mode toolbar ведёт себя как широкая desktop-панель:

```text
📚 Hebrew Learning IDE | Library | Inspector | Dashboard | Train | Русский | Classic
```

На mobile portrait это приводит к проблемам:

1. Горизонтальная ширина панели больше viewport.
2. Часть кнопок обрезается.
3. Нет очевидного premium overflow-поведения.
4. Language selector может быть частично скрыт.
5. Classic button может стать недоступной.
6. Пользователь не понимает, что панель можно прокручивать, если прокрутка вообще доступна.
7. Большие кнопки занимают слишком много места.
8. Таблица и учебный контент оказываются ниже тяжёлой навигационной панели.
9. Визуальная иерархия не адаптирована к учебному mobile-сценарию.

---

# Проблема 2: в IDE Mode mobile нет полноценной регулировки ширины колонок

В Classic Mode уже реализована возможность регулировать ширину колонок таблицы.

В IDE Mode на мобильном устройстве требуется аналогичное поведение:

- пользователь должен иметь возможность менять ширину колонок таблицы;
- регулировка должна работать пальцем на touch-экране;
- должна работать не только для внутренних колонок, но и для последней колонки;
- последняя колонка не должна быть «зажатой» и нерегулируемой;
- после изменения ширины колонок таблица должна оставаться читаемой;
- настройки ширины желательно сохранять на устройстве, как это уже сделано или ожидается в Classic Mode;
- горизонтальный scroll таблицы должен работать предсказуемо;
- регулировка ширины не должна конфликтовать с вертикальным scroll страницы и горизонтальным scroll таблицы.

---

# UX-принцип для premium-продукта

IDE Mode — это учебное рабочее пространство. На мобильном оно должно ощущаться как продуманное mobile-first приложение, а не как уменьшенная desktop-версия.

Нужно обеспечить:

- доступность всех основных действий;
- отсутствие обрезанных кнопок;
- ясную навигацию;
- хороший tap target;
- минимум визуального шума;
- сохранение места для учебного контента;
- понятный способ вернуться в Classic Mode;
- корректную работу language selector;
- корректную работу RTL;
- управляемую таблицу;
- возможность настраивать видимость и ширину колонок;
- возможность регулировать последнюю колонку;
- сохранение пользовательских настроек таблицы.

---

# Требования к верхней панели IDE Mode

## Desktop

На desktop можно сохранить расширенную панель:

```text
[📚 Hebrew Learning IDE] [Library] [Inspector] [Dashboard] [Train] [Language] [Classic]
```

Но нужно убедиться, что изменения для mobile не ломают desktop.

---

## Mobile landscape

На mobile landscape допустимо показывать почти полную панель, как сейчас, но с улучшениями:

- кнопки не должны быть чрезмерно крупными;
- панель не должна занимать слишком много высоты;
- все действия должны быть доступны;
- если ширины недостаточно, должен быть горизонтальный scroll с нормальным UX;
- не должно быть page-level horizontal overflow;
- scroll должен быть внутри toolbar, а не всей страницы.

---

## Mobile portrait

Для mobile portrait нужно реализовать специальный адаптивный режим.

Требования:

1. Все ключевые действия должны быть доступны.
2. Нельзя оставлять toolbar обрезанным.
3. Language selector должен быть доступен.
4. `Classic` должен быть доступен.
5. Toolbar не должен ломать таблицу.
6. Toolbar не должен создавать горизонтальный overflow всей страницы.
7. Пользователь должен понимать, где находятся дополнительные действия.

---

# Допустимые premium-решения для toolbar

Claude Code должен изучить текущий код и выбрать оптимальный вариант.

## Вариант A — Two-row mobile header

Для mobile portrait:

### Верхняя строка

- компактный логотип / название:
  - `Hebrew Learning IDE`
  - или коротко `IDE`
- справа:
  - language selector
  - `Classic`

### Вторая строка

Горизонтальный action rail:

- Library
- Inspector
- Dashboard
- Train

Требования:

- action rail имеет `overflow-x: auto`;
- есть `scroll-snap-type`;
- есть визуальный gradient/hint, если элементы выходят за пределы;
- кнопки не обрезаются;
- высота панели контролируемая.

## Вариант B — Compact icon-first toolbar

Для mobile portrait:

- кнопки становятся compact;
- `Hebrew Learning IDE` сокращается до `IDE`;
- language selector остаётся compact;
- Classic остаётся видимой.

## Вариант C — Primary actions + More menu

Для mobile portrait:

Видимые элементы:

- `Library`;
- `Train`;
- language selector;
- `Classic`;
- `More`.

В `More` уходят:

- Inspector;
- Dashboard;
- дополнительные действия.

Требования:

- More menu должен быть очевидным;
- меню должно закрываться по Escape/click outside;
- кнопки внутри меню должны быть локализованы;
- меню должно работать в RTL;
- нельзя прятать Classic глубоко в меню.

## Вариант D — Hybrid

Можно совместить:

- top row: IDE title + language + Classic;
- second row: horizontally scrollable nav actions.

Это предпочтительный premium-вариант, если он аккуратно ложится на текущую архитектуру.

---

# Требования к регулировке ширины колонок в IDE Mode mobile

## 1. Изучить Classic Mode implementation

Перед реализацией необходимо найти и изучить, как в Classic Mode реализованы:

- handles / resize grips;
- drag mouse behavior;
- touch behavior, если уже есть;
- расчёт ширины колонок;
- min/max ширины;
- сохранение настроек;
- сброс настроек;
- применение ширины после rerender;
- поведение последней колонки;
- взаимодействие с горизонтальным scroll таблицы.

Задача — по возможности **переиспользовать существующую проверенную логику**, а не писать независимый второй механизм.

---

## 2. Реализовать resize в IDE Mode table

В IDE Mode table пользователь должен иметь возможность менять ширину колонок:

- `Actions`;
- `Hebrew`;
- `Niqqud`;
- `Translit`;
- `Translation`;
- любые другие колонки, если они есть в текущей IDE table.

Особенно важно:

- должна регулироваться **последняя колонка**;
- последняя колонка не должна автоматически растягиваться так, что её нельзя уменьшить/увеличить;
- если таблица шире viewport, должен работать горизонтальный scroll внутри table container.

---

## 3. Touch-first поведение

На мобильном устройстве регулировка должна работать пальцем.

Требования:

- resize handle должен иметь достаточную touch-zone;
- touch target желательно не меньше 24–32px по ширине в зоне захвата, даже если визуальный handle тонкий;
- движение пальца должно менять ширину колонки;
- во время resize не должно случайно выделяться содержимое;
- во время resize не должен происходить случайный горизонтальный scroll таблицы, если пользователь явно тянет handle;
- после отпускания пальца ширина фиксируется;
- взаимодействие должно работать в Safari на iPhone.

---

## 4. Mouse / desktop behavior

На desktop IDE Mode resize тоже не должен ломаться:

- drag мышью работает;
- cursor показывает возможность resize;
- double click, если в Classic Mode уже есть auto-fit, можно поддержать, но это не обязательно;
- поведение не должно конфликтовать с выбором текста.

---

## 5. Persistence

Если в Classic Mode ширины колонок сохраняются, нужно реализовать аналогичное сохранение для IDE Mode.

Требования:

- использовать отдельный localStorage key для IDE Mode, если текущий ключ Classic Mode не подходит;
- не ломать существующий ключ Classic Mode;
- не менять старые настройки без миграции;
- при reload ширины колонок IDE Mode должны восстановиться;
- должен быть reset widths / reset columns, если в IDE Mode уже есть настройка колонок;
- если reset уже есть, он должен сбрасывать и ширины.

Пример возможного ключа:

```text
ide.table.columns.v2
```

Но фактическое имя выбрать с учётом уже существующих ключей. Если уже есть `ide.table.columns.v1`, проверить его структуру и не ломать совместимость.

---

## 6. Min/max widths

Добавить разумные ограничения:

- минимальная ширина колонки действий;
- минимальная ширина Hebrew/Niqqud;
- минимальная ширина Translation;
- максимальная ширина не должна ломать таблицу;
- последняя колонка должна иметь минимум, но не быть locked.

Примерно:

- Actions: min 56–72px;
- Hebrew/Niqqud: min 120–160px;
- Translit: min 120–160px;
- Translation: min 160–220px.

Точные значения выбрать по текущей типографике и UI.

---

## 7. Horizontal scroll strategy

Для IDE Mode table на mobile:

- table container должен иметь `overflow-x: auto`;
- body/page не должен получать горизонтальный scroll;
- resize может увеличивать общую ширину таблицы;
- пользователь должен иметь возможность прокрутить таблицу до последней колонки;
- последняя колонка должна быть полностью доступна для чтения и resize;
- resize handle последней колонки должен быть достижим.

---

## 8. RTL

При Hebrew UI / RTL:

- таблица не должна ломаться;
- Hebrew и Niqqud остаются RTL;
- Translit и Translation остаются LTR;
- resize handles должны быть логично расположены;
- регулировка ширины должна работать независимо от `document.dir`;
- если направление drag инвертируется в RTL, это должно быть осознанно и протестировано.

---

## 9. Visual polish для resize

Решение должно выглядеть как premium UI:

- resize handles видимы, но не мешают чтению;
- при hover/focus/touch active есть визуальная подсветка;
- на mobile можно сделать handle более крупным и понятным;
- не должно быть ощущения «случайной тонкой линии»;
- состояние resize не должно ломать таблицу.

---

# Технические требования к реализации

## 1. Не ломать существующие id/event contracts

Нельзя ломать:

- id кнопок;
- onclick handlers;
- функции переключения Classic / IDE;
- language selector;
- i18n;
- state restore;
- текущие shortcuts, если есть;
- table render lifecycle;
- Library/Inspector/Dashboard/Train actions.

Если нужно изменить DOM-структуру, сохранить id и JS-контракты.

---

## 2. Не создавать дублирующие кнопки

Нельзя сделать так, что:

- одна кнопка `Classic` видна;
- другая скрыта;
- и обе живут с разными event handlers.

Должна быть одна логическая кнопка/действие.

---

## 3. Toolbar должен быть самостоятельным scroll-container

Если используется горизонтальная прокрутка:

- `overflow-x: auto`;
- `overflow-y: hidden`;
- `-webkit-overflow-scrolling: touch`;
- `scroll-snap-type: x proximity` или `x mandatory`, если уместно;
- `overscroll-behavior-inline: contain`;
- не допускать `body` horizontal scroll.

---

## 4. Tap targets

На mobile:

- минимальная высота кнопок примерно 44px;
- расстояние между кнопками достаточное;
- кнопки не должны быть слишком мелкими;
- language selector должен быть удобен для пальца;
- resize handles должны иметь расширенную touch-zone.

---

## 5. Sticky behavior

Проверить, является ли IDE header sticky/fixed.

Если sticky:

- он не должен перекрывать контент;
- высота header должна учитываться;
- таблица не должна уходить под header;
- на mobile header не должен занимать половину экрана.

---

# Требования к локализации

Проверить, что все labels в IDE toolbar управляются через i18n:

- `Library`;
- `Inspector`;
- `Dashboard`;
- `Train`;
- `Classic`;
- language selector aria-label/title;
- More menu, если будет добавлен.

Также проверить i18n для table/column settings:

- `Columns`;
- `Reset`;
- `Table settings saved on this device`;
- column labels;
- resize/help tooltip, если будет добавлен.

Для RU:

- `Библиотека`;
- `Инспектор`;
- `Панель`;
- `Тренировка`;
- `Classic` или `Классический режим` — выбрать единообразно с текущей терминологией.

Для EN:

- `Library`;
- `Inspector`;
- `Dashboard`;
- `Train`;
- `Classic`.

Для HE:

- использовать естественные короткие labels;
- проверить, чтобы label не был слишком длинным для mobile.

---

# Требования к CSS

Нужно найти и привести в порядок стили для IDE header и IDE table, например:

- `.v3-ide-header`
- `.v3-ide-header-logo`
- `.v3-ide-header-actions`
- `.v3-ide-header-btn`
- `.v3-ide-mode`
- `.lang-select`
- `.v3-ide-table`
- `.v3-ide-table-wrap`
- `.v3-ide-col-resizer`
- `.v3-ide-*`

Точные классы определить по коду.

Добавить или обновить media queries:

```css
@media (max-width: 768px) {
  /* tablet / mobile */
}

@media (max-width: 480px) {
  /* phone portrait */
}
```

Если в проекте уже есть другие breakpoints, использовать существующую систему, а не плодить хаос.

---

# Требования к visual polish

Решение должно выглядеть premium:

1. Аккуратные отступы.
2. Консистентная высота кнопок.
3. Единый стиль кнопок.
4. Нет обрезанного текста.
5. Нет случайных переносов.
6. Нет «ползущей» панели.
7. Есть понятный active/focus state.
8. Хороший контраст.
9. Не перегружать верхнюю панель.
10. Учебный контент должен оставаться главным.
11. Resize handles видимы и удобны.
12. Последняя колонка доступна и регулируется.
13. Горизонтальный scroll таблицы не выглядит сломанным.

---

# Требования к тестированию

## Automated / lightweight tests

Если возможно, добавить или расширить smoke-тесты.

Возможный файл:

```text
tests/ide_mobile_toolbar.smoke.js
```

Минимальные проверки для toolbar:

1. В `public/index.html` есть IDE header container.
2. В toolbar присутствуют действия:
   - Library;
   - Inspector;
   - Dashboard;
   - Train;
   - language selector;
   - Classic.
3. Для mobile есть CSS strategy:
   - `overflow-x`;
   - или `flex-wrap`;
   - или compact/mobile layout classes.
4. Locale keys для toolbar есть во всех 3 языках.
5. Нет hardcoded русских/английских toolbar labels вне locale files, кроме технических иконок/ids.

Добавить проверки для IDE table column resize:

1. В IDE table есть resize handles или эквивалентный механизм.
2. Resize handles есть для всех регулируемых колонок.
3. Последняя колонка имеет resize handle или другой доступный способ изменения ширины.
4. Есть persistence key для IDE column widths.
5. Reset columns сбрасывает ширины, если такая функция есть.
6. CSS table wrapper имеет локальный horizontal overflow.
7. Нет CSS-правил, которые намеренно блокируют resize последней колонки.
8. Locale keys для column settings есть во всех 3 языках.

---

# Manual smoke checklist

После реализации обязательно вручную проверить.

## iPhone 14 Pro Max / mobile portrait — toolbar

- [ ] Верхняя панель IDE Mode не обрезается.
- [ ] Library доступна.
- [ ] Inspector доступен.
- [ ] Dashboard доступен.
- [ ] Train доступен.
- [ ] Language selector доступен.
- [ ] Classic доступен.
- [ ] Если есть горизонтальный scroll — он очевиден и работает.
- [ ] Нет горизонтального scroll всей страницы.
- [ ] Таблица не ломается.
- [ ] Первый учебный ряд таблицы виден нормально.
- [ ] Header не занимает слишком много высоты.

## iPhone 14 Pro Max / mobile landscape — toolbar

- [ ] Все actions доступны.
- [ ] Панель не обрезается.
- [ ] Language selector полностью виден.
- [ ] Classic полностью виден.
- [ ] Нет page-level horizontal overflow.
- [ ] Контент под header не перекрывается.

## iPhone 14 Pro Max / mobile portrait — column resize

- [ ] Можно изменить ширину колонки Actions.
- [ ] Можно изменить ширину колонки Hebrew.
- [ ] Можно изменить ширину колонки Niqqud.
- [ ] Можно изменить ширину колонки Translit, если она отображается.
- [ ] Можно изменить ширину колонки Translation.
- [ ] Можно изменить ширину последней видимой колонки.
- [ ] Горизонтальный scroll таблицы работает.
- [ ] Resize не вызывает случайный scroll всей страницы.
- [ ] После reload ширины восстановились, если persistence реализован.
- [ ] Reset columns сбрасывает ширины.

## Desktop

- [ ] Desktop toolbar не деградировал.
- [ ] Все действия на месте.
- [ ] Header выглядит premium.
- [ ] Нет лишних переносов.
- [ ] Нет дублирующих кнопок.
- [ ] Column resize в IDE Mode работает мышью.
- [ ] Последняя колонка регулируется мышью.

## RU / EN / HE

- [ ] Labels корректно переводятся.
- [ ] При Hebrew включается RTL.
- [ ] RTL toolbar читаем.
- [ ] RTL table resize работает.
- [ ] Language selector работает.
- [ ] Classic switch работает.

---

# Регрессионные сценарии

Проверить:

1. Открыть приложение.
2. Включить IDE Mode.
3. Открыть текст из Library.
4. Нажать Play.
5. Открыть Inspector.
6. Открыть Dashboard.
7. Открыть Train.
8. Переключить язык RU → EN → HE.
9. Изменить ширину нескольких колонок таблицы.
10. Изменить ширину последней колонки.
11. Перезагрузить страницу.
12. Проверить восстановление ширин колонок.
13. Вернуться в Classic.
14. Снова открыть IDE.
15. Проверить, что выбранный язык сохранился.
16. Проверить, что таблица и колонки не сломались.
17. Проверить, что Classic Mode column resize не сломан.

---

# Patch plan

## PATCH-01 — Audit current IDE toolbar and table resize

- Найти DOM и CSS IDE toolbar.
- Найти DOM и CSS IDE table.
- Изучить Classic Mode column resize.
- Зафиксировать, почему в IDE Mode mobile resize не работает или неполный.
- Проверить текущие breakpoints.
- Проверить i18n keys.

## PATCH-02 — Design responsive mobile toolbar

- Выбрать final UX variant:
  - two-row;
  - compact;
  - action rail;
  - more menu;
  - hybrid.
- Зафиксировать решение в кратком doc/comment.

## PATCH-03 — Implement mobile portrait toolbar layout

- Исправить mobile portrait.
- Убрать обрезание.
- Сохранить доступность всех actions.

## PATCH-04 — Implement mobile landscape hardening

- Проверить landscape.
- Уменьшить визуальную тяжесть header, если нужно.
- Добавить scroll/wrap strategy.

## PATCH-05 — Implement IDE Mode column width resize

- Переиспользовать или адаптировать Classic Mode resize logic.
- Добавить resize handles в IDE table.
- Обеспечить touch support.
- Обеспечить resize последней колонки.
- Добавить min/max widths.
- Добавить localStorage persistence, если применимо.
- Добавить reset behavior, если применимо.

## PATCH-06 — RTL/i18n/accessibility hardening

- Проверить RU / EN / HE.
- Проверить RTL.
- Добавить/исправить aria-label/title.
- Проверить focus states.
- Проверить resize в RTL.

## PATCH-07 — Tests + DoD evidence

- Добавить/обновить smoke tests.
- Обновить DoD/evidence-документ.
- Зафиксировать manual smoke checklist.

---

# Definition of Done

Задача считается завершённой только если:

1. В IDE Mode на mobile portrait верхняя панель больше не обрезается.
2. Library доступна.
3. Inspector доступен.
4. Dashboard доступен.
5. Train доступен.
6. Language selector доступен.
7. Classic доступен.
8. В mobile landscape панель не обрезается.
9. Нет горизонтального overflow всей страницы.
10. Если используется horizontal action rail, он прокручивается только внутри toolbar.
11. Desktop layout не деградировал.
12. RU / EN / HE labels работают.
13. RTL layout не ломается.
14. Tap targets на mobile удобные.
15. Header не занимает чрезмерно много высоты.
16. Учебная таблица остаётся основной рабочей зоной.
17. Не создано дублирующих конфликтующих кнопок.
18. Не сломаны existing ids/event handlers.
19. Не сломано переключение IDE ↔ Classic.
20. В IDE Mode можно регулировать ширину колонок на desktop.
21. В IDE Mode можно регулировать ширину колонок на mobile touch.
22. В IDE Mode можно регулировать последнюю видимую колонку.
23. Горизонтальный scroll таблицы работает внутри table container.
24. Resize не вызывает page-level horizontal overflow.
25. Ширины колонок сохраняются и восстанавливаются, если persistence реализован.
26. Reset columns сбрасывает ширины, если reset существует.
27. Classic Mode column resize не сломан.
28. Обновлены тесты или smoke checks.
29. Обновлена документация/evidence.
30. Git diff не содержит нерелевантного большого refactor.

---

# Non-goals

Не делать в этой итерации:

- не переписывать весь IDE Mode;
- не менять бизнес-логику Library/Inspector/Dashboard/Train;
- не менять API;
- не менять структуру данных таблицы;
- не менять TTS pipeline;
- не делать полный redesign всех экранов;
- не мигрировать проект на React/Vue;
- не удалять существующие действия;
- не ломать Classic Mode resize ради IDE Mode.

---

# Финальный отчёт

После реализации предоставить отчёт:

1. Какие файлы изменены.
2. Как была устроена старая IDE toolbar.
3. Как устроена новая responsive toolbar.
4. Какое UX-решение выбрано и почему.
5. Как решена mobile portrait проблема.
6. Как решена mobile landscape проблема.
7. Как была реализована регулировка ширины колонок в IDE Mode.
8. Как обеспечена регулировка последней колонки.
9. Как переиспользована или адаптирована логика Classic Mode.
10. Как обеспечен touch resize на mobile.
11. Как обеспечен RTL.
12. Как сохранён i18n.
13. Какие тесты выполнены.
14. Какие manual checks выполнены.
15. Остались ли known limitations.
16. Commit-ready summary.
