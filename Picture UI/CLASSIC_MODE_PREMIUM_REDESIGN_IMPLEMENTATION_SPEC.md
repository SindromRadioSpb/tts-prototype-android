# Implementation-ready ТЗ
## Classic Mode Premium Redesign
## Проект: `tts-prototype-android`
## Платформы: Desktop Web + Mobile Web
## Цель: довести Classic Mode до уровня профессионального premium-grade интерфейса без регрессии основного сценария, TTS/translation pipeline и табличного workflow

---

## 0. EXECUTION MODE

Перед любым изменением кода необходимо:

1. Прочитать всю релевантную документацию в репозитории, связанную с:
   - UI/UX;
   - mobile layout;
   - classic mode;
   - table rendering;
   - TTS/translation flow;
   - local cache / provenance;
   - feature flags / mode switching;
   - accessibility / keyboard behavior;
   - known bugs / previous audits.

2. Выполнить **repo audit** и **UI audit** до начала патчей.

3. Проверить, что:
   - нет уже начатого параллельного редизайна тех же поверхностей;
   - не существует скрытых зависимостей от текущего DOM/CSS/JS;
   - не ломаются mobile-specific сценарии;
   - не ломается IDE Mode;
   - не ломается existing table generation / save / export behavior.

4. До внесения изменений в код составить и зафиксировать:
   - audit summary;
   - patch plan;
   - risk map;
   - target component map;
   - acceptance checklist.

5. Во время реализации своевременно актуализировать план по фактическим находкам в репозитории.

6. Минимизировать риск регрессии. Не делать large bang rewrite, если можно сделать staged patch series.

---

# 1. Repo/UI audit assumptions

## 1.1. Что необходимо установить на этапе аудита

Нужно подтвердить, а не предполагать:

1. Где находится canonical implementation Classic Mode:
   - single-file UI;
   - multi-file component-based UI;
   - hybrid structure.

2. Где находятся:
   - layout shell;
   - form controls;
   - mobile breakpoints;
   - table rendering logic;
   - row actions;
   - TTS controls;
   - translation controls;
   - top quota/status section;
   - floating IDE Mode control;
   - local cache restore messaging;
   - export actions.

3. Какая текущая state model уже существует:
   - dirty/pristine;
   - translating;
   - TTS ready/not ready;
   - result draft/current/stale;
   - local cache restored;
   - provider availability;
   - disabled action logic.

4. Как устроен responsive layer:
   - CSS breakpoints;
   - media queries;
   - container widths;
   - sticky/fixed elements;
   - z-index hierarchy;
   - overflow containers;
   - mobile table behavior.

5. Где смешиваются:
   - global navigation;
   - workflow actions;
   - export actions;
   - technical diagnostics.

6. Есть ли текущие автотесты:
   - unit;
   - DOM/component;
   - visual/screenshot;
   - e2e/manual smoke docs.

7. Есть ли существующие UI tokens / CSS variables / theme contract.

---

## 1.2. Что именно нужно прочитать в репозитории до патчей

Нужно найти и изучить:

1. Документы по UI, mobile UX, classic mode и responsive behavior.
2. Документы/код по table workflow.
3. Код, связанный с:
   - quota/usage cards;
   - TTS provider + voice selection;
   - translation provider selection;
   - transliteration selection;
   - save/export actions;
   - playlist behavior;
   - status banners;
   - IDE Mode toggle/button;
   - local cache restore notices.

4. Если репозиторий всё ещё держит основной экран в одном большом HTML-файле — это нужно явно зафиксировать и запланировать безопасную модульную декомпозицию без поломки runtime.

---

## 1.3. Что должно быть результатом audit phase

До начала патчей обязателен краткий artefact в repo или в рабочем отчёте со следующими секциями:

- Current UI structure
- Current state model
- Current mobile issues
- Overlay / z-index issues
- Navigation/action mixing issues
- Table UX issues
- Localization/mixed-language issues
- Risky dependencies
- Recommended patch sequence

---

# 2. Patch strategy

Реализацию выполнять по staged patch series. Не смешивать весь редизайн в один giant patch.

## PATCH-00 — Audit + plan freeze
Сделать:
- repo audit;
- UI audit;
- map entrypoints/files;
- map states;
- map responsive behavior;
- map regression risks;
- patch plan.

Выход:
- audit summary;
- exact files list;
- planned patch series.

---

## PATCH-01 — Layout architecture foundation
Сделать:
- ввести новую high-level структуру экрана;
- разделить:
  - global status/navigation,
  - input composer,
  - processing controls,
  - result surface,
  - export/downstream actions;
- если нужно — ввести новые container classes / layout wrappers / section shells.

Важно:
- не ломать existing business logic;
- сначала перестроить layout contract, потом polish.

---

## PATCH-02 — Action hierarchy and navigation separation
Сделать:
- вынести global navigation из линии основного workflow;
- определить primary / secondary / tertiary actions;
- убрать визуальную конкуренцию между:
  - Озвучить,
  - Перевести и сохранить,
  - Библиотека,
  - Дашборд,
  - SRS Trainer,
  - Обновить,
  - export actions.

Важно:
- сохранить все возможности;
- можно перегруппировать, но не удалять фичи молча.

---

## PATCH-03 — Input composer redesign
Сделать:
- переработать область ввода текста в полноценный composer;
- добавить явный статус input:
  - empty,
  - ready,
  - dirty;
- привести warning о необходимости пересборки к системному виду;
- упростить первый экран mobile.

---

## PATCH-04 — Processing controls redesign
Сделать:
- отдельную секцию TTS;
- отдельную секцию translation/translit;
- primary action logic;
- coherent disabled behavior;
- более ясную логику доступности downstream actions.

---

## PATCH-05 — Result surface redesign
Сделать:
- result header;
- status chips / provenance line;
- result summary;
- compact metadata;
- table toolbar contract;
- unified draft/current/stale presentation.

---

## PATCH-06 — Table UX redesign
Сделать:
- toolbar с пресетами колонок;
- второй уровень “настроить колонки”;
- row actions standardization;
- mobile row-detail pattern;
- sticky header / controlled horizontal scroll.

---

## PATCH-07 — Mobile-specific redesign
Сделать:
- mobile-first reflow;
- убрать длинную “стену” второстепенных контролов;
- обеспечить primary action within first screen;
- убрать overlay conflicts;
- переосмыслить IDE Mode placement;
- скрыть/свернуть advanced settings.

---

## PATCH-08 — Localization, copy, states, polish
Сделать:
- унифицировать язык интерфейса;
- убрать бессистемное смешение русского и английского;
- привести labels/statuses к product vocabulary;
- довести disabled/info/warning/success/error system.

---

## PATCH-09 — Accessibility + regression hardening
Сделать:
- keyboard/focus pass;
- touch target pass;
- contrast pass;
- RTL/LTR pass;
- reduced motion sanity;
- automated/manual regression coverage;
- DoD evidence pack.

---

# 3. Component breakdown

Ниже — целевая декомпозиция. Если репозиторий single-file, минимум нужно привести к логическим блокам с чистыми boundaries.

## 3.1. `ClassicModeShell`
Ответственность:
- верхнеуровневая композиция;
- desktop/mobile layout switching;
- section ordering;
- safe spacing.

---

## 3.2. `SystemStatusStrip`
Содержит:
- usage/quota summary;
- provider/system status;
- secondary link to cloud console;
- не конкурирует с main workflow.

Не должен быть большой карточной доминантой.

---

## 3.3. `ClassicModeNav`
Содержит:
- Библиотека;
- Дашборд;
- SRS Trainer;
- возможно Refresh, если это global/screen action.

Должен быть отделён от processing actions.

---

## 3.4. `InputComposer`
Содержит:
- title;
- textarea/editor;
- input status;
- optional helper text;
- clear/paste/restore/expand actions при наличии.

---

## 3.5. `InputStateBanner`
Содержит:
- dirty/stale warnings;
- cache restored notices;
- success/error/info states.

Должен быть unified alert component, а не случайные баннеры.

---

## 3.6. `TtsControlsCard`
Содержит:
- source language;
- font selection, если это реально нужно рядом;
- TTS provider;
- voice;
- speed;
- pitch;
- primary/secondary TTS action.

---

## 3.7. `TranslationControlsCard`
Содержит:
- translation provider;
- transliteration mode;
- translation primary action;
- save semantics;
- related availability logic.

---

## 3.8. `ResultHeader`
Содержит:
- title/result label;
- draft/current/stale badge;
- provider summary;
- provenance;
- source link;
- updated status.

---

## 3.9. `TableToolbar`
Содержит:
- preset chips:
  - Полная,
  - Иврит+рус,
  - Фонетика,
  - Только иврит;
- playlist toggle/control;
- configure columns action;
- reset table view;
- optional density control.

---

## 3.10. `ResultTable`
Содержит:
- desktop table;
- mobile table wrapper;
- sticky header;
- row actions;
- mobile row detail entrypoint.

---

## 3.11. `ExportActionsBar`
Содержит:
- Audio;
- Anki;
- Скачать таблицу;
- другие downstream actions.

Должен быть контекстным. Недоступные действия должны объясняться или скрываться до релевантного состояния.

---

## 3.12. `IdeModeControl`
Отдельный utility control.
Не должен:
- перекрывать контент;
- закрывать CTA;
- закрывать table cells;
- дублироваться из-за layout/scroll behavior.

---

# 4. Desktop/mobile layout contract

## 4.1. Desktop layout contract

На desktop экран должен иметь явное разделение на рабочую и результатную области.

### Допустимый целевой контракт
Вариант A — предпочтительный:
- левая колонка: input + controls + primary actions;
- правая колонка: result header + metadata + export + table/preview.

Вариант B — допустимый:
- верх: input + controls;
- низ: result surface full width.

### Обязательные правила
1. Global status/nav не должны разрывать основной workflow.
2. Input должен быть визуальной отправной точкой.
3. Processing actions должны быть группированы.
4. Result area должна иметь strong header.
5. Table toolbar не должен быть визуальным мусором.

---

## 4.2. Mobile layout contract

### Первый экран mobile обязан содержать
- input area;
- status/banner;
- primary action;
- только минимально нужные controls.

### Обязательные правила
1. Advanced settings свернуть.
2. Global nav не должна доминировать над workflow.
3. Disabled secondary actions не должны образовывать длинную серую колонну.
4. IDE Mode не должен перекрывать контент.
5. Таблица должна иметь отдельный mobile behavior.

---

## 4.3. Breakpoint contract

Нужно определить и использовать реальные breakpoints репозитория, но логика должна быть такой:

- desktop: multi-column / split workspace;
- tablet: compact split или stacked hybrid;
- mobile: single-column guided flow.

На mobile запрещено простое “сжать desktop”.

---

## 4.4. Scroll contract

1. Основной page scroll должен быть предсказуемым.
2. Table horizontal scroll — только в table container.
3. Sticky/fixed элементы не должны перекрывать контент.
4. Не должно быть случайного двойного scroll-конфликта.
5. Long sections должны уметь расти по высоте без layout break.

---

# 5. State contract

Нужно формализовать state machine и не держать её размазанной по DOM и ad hoc классам.

## 5.1. Input state
- `empty`
- `ready`
- `dirty`

### Переходы
- empty -> ready: текст введён
- ready -> dirty: текст изменён после актуального результата
- dirty -> ready: пересборка/сохранение завершены и result синхронизирован

---

## 5.2. TTS state
- `unavailable`
- `idle`
- `processing`
- `ready`
- `stale`
- `error`

### Правило
Если текст изменён после последней валидной озвучки, TTS state должен становиться `stale`.

---

## 5.3. Translation state
- `unavailable`
- `idle`
- `processing`
- `ready`
- `partial`
- `stale`
- `error`

### Правило
Если таблица/перевод были построены для старой версии текста, state = `stale`.

---

## 5.4. Result state
- `absent`
- `draft`
- `ready`
- `restored`
- `stale`
- `error`

### Правило
`restored` не равно `ready`; restored-result должен ясно сообщать происхождение.

---

## 5.5. Export state
- `hidden`
- `disabled`
- `ready`
- `processing`
- `done`
- `error`

### Правило
Не показывать длинный ряд `disabled`, если действия неактуальны. Использовать hide/collapse/explain.

---

## 5.6. UI state invariants

Обязательные инварианты:

1. Если `input = dirty`, то результат не может визуально выглядеть как fully current.
2. Если `result = absent`, то export actions не должны выглядеть fully available.
3. Если `processing = true`, то primary action должен отражать in-progress state.
4. Если результат восстановлен из local cache, это должно быть явно видно.
5. Если provider недоступен, это должно влиять на action availability предсказуемо.

---

# 6. Accessibility contract

## 6.1. Touch targets
Все mobile interactive targets:
- минимум 44x44 px;
- достаточный spacing;
- row actions не должны быть микроскопическими.

## 6.2. Keyboard
На desktop обязательно:
- корректный tab order;
- видимый focus ring;
- без focus traps;
- доступность primary action с клавиатуры;
- dropdown/select/toolbar controls должны быть keyboard reachable.

## 6.3. Contrast
Нужно проверить:
- мелкие подписи;
- warning/info banners;
- secondary buttons;
- disabled text;
- links;
- chips.

## 6.4. Screen semantics
Нужно использовать корректные:
- labels;
- button names;
- grouped controls;
- aria/state semantics там, где это нужно стеку проекта.

## 6.5. RTL/LTR
Обязательно:
- корректная direction isolation;
- Hebrew, Russian, Latin и SBL text не должны ломать layout;
- table cells должны быть direction-safe;
- mixed rows должны оставаться читаемыми.

## 6.6. Motion
Если есть анимации:
- уважать reduced motion;
- не использовать анимацию, которая ломает восприятие статуса.

---

# 7. Regression risks

## 7.1. Layout regressions
Риск:
- ломаются desktop widths;
- mobile controls переполняют контейнер;
- sticky/fixed overlays перекрывают контент.

Митигация:
- breakpoint screenshots;
- layout smoke;
- z-index audit.

---

## 7.2. Workflow regressions
Риск:
- ломается основной сценарий input -> translate/save -> table;
- ломается TTS flow;
- ломается refresh/update semantics.

Митигация:
- сохранить event wiring;
- staged patches;
- manual smoke after each patch.

---

## 7.3. State regressions
Риск:
- stale/dirty/current logic становится несогласованной;
- UI misleadingly shows ready when state is stale.

Митигация:
- formal state contract;
- unit tests for state transitions;
- manual stale flow smoke.

---

## 7.4. Mobile regressions
Риск:
- первый экран становится ещё длиннее;
- floating control продолжает перекрывать;
- table unusable on touch.

Митигация:
- first viewport contract;
- mobile screenshot tests;
- physical/touch manual QA.

---

## 7.5. Localization regressions
Риск:
- новый UI сохраняет смесь русского и английского;
- labels inconsistency.

Митигация:
- copy pass;
- centralized vocabulary list;
- grep audit of visible strings.

---

## 7.6. Table regressions
Риск:
- ломаются колонки, пресеты, row actions, playlist behavior.

Митигация:
- keep data contract untouched where possible;
- add acceptance tests for table modes;
- manual compare before/after.

---

# 8. UI/UX CONSTRAINTS

## Non-negotiable UI/UX constraints

1. **Запрещены фиксированные высоты** для блоков, где контент может расти:
   - input composer,
   - alerts,
   - result header,
   - table toolbar,
   - metadata blocks,
   - mobile sheets,
   - mixed-language rows.

2. **Длинный контент обязан корректно прокручиваться**.  
   Нельзя создавать layout, где:
   - длинные блоки обрезаются,
   - появляются неуправляемые nested scrolls,
   - table scroll конфликтует со scroll страницы.

3. **Все sticky/fixed/floating элементы обязаны уважать safe areas и inset logic**.  
   Ничто не должно перекрывать:
   - primary CTA,
   - result header,
   - table rows,
   - text content,
   - bottom actions.

4. **Все интерактивные элементы на mobile — минимум 44x44 px**.

5. **Desktop должен быть полностью keyboard-usable** для основного сценария.

6. **RTL/LTR mixed content — обязательный first-class case**, а не edge case.

7. **Нельзя удалять пользовательскую возможность только ради упрощения UI**.  
   Допустимо:
   - перегруппировать,
   - скрыть в advanced,
   - вынести в secondary panel,  
   но нельзя silently remove feature.

8. **Disabled states не должны быть “мертвыми серыми блоками” без причины**.  
   Нужно:
   - либо скрыть,
   - либо объяснить,
   - либо показать условия доступности.

9. **Primary action должен быть визуально и семантически однозначен**.

10. **UI DoD evidence обязательно**.  
   Без пакета визуальных и тестовых доказательств задача не считается завершённой.

---

# 9. Acceptance tests

Нужно добавить или обновить автоматические и ручные проверки. Если в проекте нет зрелого e2e-стека, минимум требуется reproducible manual QA matrix плюс доступные DOM/screenshot tests.

## 9.1. Desktop acceptance tests

### A1. Main workflow discoverability
Проверка:
- экран читается за 3–5 секунд;
- input composer — явная стартовая точка;
- global nav не смешана с processing.

### A2. Action hierarchy
Проверка:
- primary action очевиден;
- secondary/tertiary не конкурируют;
- export actions не доминируют до появления результата.

### A3. Dirty/stale flow
Шаги:
1. Ввести текст.
2. Сгенерировать результат.
3. Изменить текст.
4. Проверить, что:
   - результат помечен stale/dirty;
   - UI не вводит в заблуждение;
   - primary action предлагает актуализацию.

### A4. Restored-from-cache flow
Шаги:
1. Открыть экран с локально восстановленным результатом.
2. Проверить:
   - статус restored явно виден;
   - provenance line корректна;
   - downstream behavior логичен.

### A5. Table toolbar
Проверка:
- пресеты колонок работают;
- configure columns открывается отдельно;
- toolbar не ломает layout.

### A6. Keyboard navigation
Проверка:
- tab order корректен;
- focus visible;
- основные controls достижимы с клавиатуры.

---

## 9.2. Mobile acceptance tests

### M1. First-screen contract
Проверка:
- в первом экране присутствуют input + status + primary action;
- нет необходимости длинного скролла до главного действия.

### M2. Overlay safety
Проверка:
- IDE Mode и другие floating/sticky элементы не перекрывают контент.

### M3. Advanced settings collapse
Проверка:
- второстепенные настройки свернуты;
- mobile screen не перегружен визуально.

### M4. Mobile result usability
Проверка:
- таблица usable;
- sticky header работает корректно;
- horizontal scroll ограничен контейнером;
- row detail pattern доступен.

### M5. Disabled actions behavior
Проверка:
- mobile не показывает длинную колонну бессмысленных disabled buttons;
- есть либо скрытие, либо объяснение.

---

## 9.3. Localization acceptance tests

### L1. Visible strings audit
Проверка:
- нет хаотичного смешения русского/английского;
- product vocabulary единообразен.

### L2. Mixed language rendering
Проверка:
- Hebrew + Russian + Latin + SBL text читаемы;
- не ломаются alignment/direction.

---

## 9.4. Regression smoke matrix

После каждого крупного patch:
1. Открытие Classic Mode
2. Ввод текста
3. Озвучить
4. Перевести и сохранить
5. Просмотр таблицы
6. Переключение колонок
7. Refresh/update
8. Mobile open + scroll
9. IDE Mode visibility
10. Local cache restored path
11. Export availability path

---

# 10. Definition of Done Evidence

Задача не считается завершённой без фактического evidence pack.

## 10.1. Обязательные артефакты

1. **Repo/UI audit summary**
2. **Patch plan final**
3. **Files changed list с краткой ролью каждого файла**
4. **Before/after screenshots**
   - desktop full screen;
   - mobile first screen;
   - mobile result area;
   - table toolbar state;
   - stale/dirty banner state;
   - restored-from-cache state.

5. **Responsive screenshots**
   - desktop;
   - tablet;
   - mobile narrow width.

6. **Accessibility evidence**
   - keyboard path notes;
   - touch target pass notes;
   - contrast sanity notes;
   - RTL/LTR notes.

7. **Regression evidence**
   - automated test results;
   - manual smoke checklist;
   - fixed risk list.

8. **State evidence**
   - screenshots or notes for:
     - ready,
     - dirty,
     - stale,
     - restored,
     - processing,
     - error.

9. **DoD checklist**
   - every acceptance item marked pass/fail with evidence reference.

---

## 10.2. Финальный выход задачи

Финальный handoff должен содержать:

### Summary
- что изменено;
- что не изменено сознательно;
- какие компромиссы были сделаны.

### Files
- список изменённых файлов;
- зачем менялся каждый.

### Tests
- какие тесты добавлены/обновлены;
- что именно покрывают.

### Manual QA
- какие сценарии прогнаны руками.

### Remaining risks
- что осталось как follow-up, если не было критично для этого этапа.

### DoD status
- полный pass/fail по checklist.

---

# 11. Краткая формулировка задачи для Codex / Claude Code

Нужно выполнить **staged premium-grade redesign Classic Mode**, не как косметическое обновление, а как архитектурную переработку экрана с чётким разделением:

- global status/navigation,
- input composer,
- processing controls,
- result surface,
- export/downstream actions,

с полноценным desktop/mobile layout contract, formal state contract, accessibility pass, regression hardening и обязательным DoD evidence pack.
