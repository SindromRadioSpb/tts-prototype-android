# CLASSIC_MODE_PREMIUM_REDESIGN_IMPLEMENTATION_SPEC_v2

## Проект
`tts-prototype-android`

## Документ
Implementation-ready спецификация для второй волны редизайна `Classic Mode`.

## Статус
`v2`

## Класс продукта
**Ultra-premium / executive-grade / trust-heavy / subscription-tier: 100 000 ₪ per month**

## Назначение документа
Этот документ задаёт **жёсткий implementation contract** для Codex / Claude Code / engineering team.

Он не заменяет продуктовый `classic_mode_redesign_tz_v2.md`, а переводит его в прикладной формат для:
- repo audit;
- patch planning;
- implementation;
- regression control;
- accessibility hardening;
- evidence-based acceptance.

---

# 0. EXECUTION MODE

## 0.1. Обязательный режим работы

Работа по `v2` должна выполняться не как косметическая итерация и не как ad hoc patching, а как **controlled premium hardening pass**.

Перед изменением кода обязательно:

1. Изучить:
   - `classic_mode_redesign_tz_v2.md`
   - `CLASSIC_MODE_PREMIUM_GAP_ANALYSIS.md`
   - актуальные screenshot-evidence после первой итерации
   - текущее состояние репозитория

2. Провести **post-v1 baseline audit**:
   - what is already improved;
   - what remains unresolved;
   - what must not regress;
   - what prevents the screen from feeling ultra-premium.

3. Зафиксировать:
   - current implementation map;
   - current state model;
   - remaining premium defects;
   - exact patch sequence;
   - regression risks;
   - acceptance evidence plan.

4. Не начинать кодинг до явного формулирования:
   - audit summary,
   - patch strategy,
   - files map,
   - risks map,
   - validation plan.

---

## 0.2. Главный принцип v2

`v2` — это не “сделать ещё чуть красивее”, а:

- устранить premium defects;
- довести mobile до truly premium поведения;
- убрать ambiguity в action hierarchy;
- убрать overlay/utility interference;
- довести result surface и visual rhythm до уровня дорогого продукта.

---

# 1. Current post-v1 audit baseline

## 1.1. Что считать baseline после первой итерации

Следующее считается уже достигнутым и не должно быть потеряно:

1. guided structure вместо хаотичной technical panel;
2. явное разделение input / actions / result / table;
3. улучшенный desktop split logic;
4. улучшенный mobile first screen относительно старой версии;
5. state/status chips как фундамент trust layer;
6. mobile row-detail bottom sheet как удачный UX pattern;
7. отделение части navigation/utility от главного workflow.

---

## 1.2. Что считается unresolved после первой итерации

Считать открытыми дефектами:

1. интерфейс ещё не ощущается как бесспорно ultra-premium;
2. primary action hierarchy местами недостаточно жёсткая;
3. mobile всё ещё слишком длинный и control-heavy;
4. floating utility/FAB logic остаётся premium risk;
5. mobile table settings still too operator-like;
6. result surface ещё не максимально сильна;
7. top status/usage layer всё ещё тяжеловат;
8. visual design system / rhythm не доведены до дорогой зрелости;
9. монолитная реализация остаётся инженерным риском.

---

## 1.3. Что обязательно проверить заново перед патчами

Подтвердить по коду, а не по памяти:

- canonical implementation Classic Mode;
- all visible entrypoints and utility layers;
- sticky/fixed/floating elements;
- table rendering lifecycle;
- row detail lifecycle;
- state sync functions;
- save/export gating;
- mobile breakpoints;
- z-index hierarchy;
- copy/localization visible strings;
- interaction between stale state and CTA priority.

---

# 2. Repo/UI audit assumptions

## 2.1. Что нужно установить на audit phase

Нужно точно установить:

1. где живёт canonical markup Classic Mode;
2. какие `id`, selectors, handlers являются фактическими contracts;
3. где определяется:
   - stale/dirty/current logic,
   - export readiness,
   - save gating,
   - restored/local status,
   - FAB/utility placement,
   - mobile disclosures,
   - row-detail open/close behavior;
4. есть ли уже готовые helper layers для:
   - utility strip,
   - action state sync,
   - mobile-only interaction;
5. какой объём изменений можно сделать без ломки legacy behavior;
6. какие тесты уже существуют и что нужно добавить.

---

## 2.2. Что надо прочитать в repo

Найти и изучить:

1. документацию по Classic Mode / UI / mobile / table / TTS / translation;
2. код layout/CSS/responsive;
3. код toolbar/table/detail sheet;
4. код status chips / alerts / provenance / restored flow;
5. код save/export/audio/anki/download readiness;
6. код utility/FAB/IDE mode behavior;
7. тесты, если уже есть:
   - DOM tests,
   - static contract tests,
   - smoke tests,
   - screenshot/e2e support.

---

## 2.3. Audit artefact before coding

До изменения кода должен существовать краткий audit output со следующими разделами:

- Post-v1 baseline
- Canonical files / entrypoints
- Remaining premium defects
- Action hierarchy issues
- Mobile-first issues
- Overlay / utility risks
- Result surface weaknesses
- Design-system rhythm issues
- Planned patch sequence
- Regression plan

---

# 3. v2 patch strategy

Реализацию выполнять строго по staged patch series.  
Не сливать всё в один giant patch.

---

## PATCH-00 — Post-v1 audit freeze
Сделать:
- repo audit;
- UI audit;
- remaining premium defects list;
- files/handlers/contracts map;
- validation plan.

Выход:
- audit summary;
- exact files list;
- final patch plan.

---

## PATCH-01 — Premium layout hardening
Сделать:
- убрать остаточную structural ambiguity;
- усилить screen hierarchy;
- выстроить более дорогой page rhythm;
- уменьшить perceived clutter;
- успокоить top system/status layer;
- проверить section spacing, section weight, section entry order.

Задача:
экран должен восприниматься как premium workspace, а не просто хороший улучшенный admin UI.

---

## PATCH-02 — Primary action hierarchy hardening
Сделать:
- окончательно зацементировать логику dominant CTA;
- stale-state должен однозначно менять приоритет действий;
- secondary actions ослабить;
- export/downstream actions перевести в контекстный статус;
- navigation/utility не должны спорить с workflow.

Задача:
при взгляде на экран не должно оставаться вопроса “что сейчас главное”.

---

## PATCH-03 — Mobile first-screen hardening
Сделать:
- ruthless simplification of first viewport;
- поднять только high-value actions;
- убрать лишнюю cognitive depth до главного шага;
- переосмыслить видимость secondary controls;
- убедиться, что mobile first screen действительно guided.

Задача:
mobile должен выглядеть как premium app surface, а не как перенос desktop на телефон.

---

## PATCH-04 — Utility / FAB / overlay discipline
Сделать:
- окончательно убрать ощущение overlay-артефакта;
- переосмыслить floating utility placement/behavior;
- suppress/hide/move in critical contexts;
- проверить table, sheet, CTA, keyboard and scroll scenarios.

Задача:
никакой utility control не должен мешать premium-perception.

---

## PATCH-05 — Result surface hardening
Сделать:
- усилить result header;
- объединить status/provenance/export readiness в более сильную surface;
- сделать result area одной из самых “дорогих” зон экрана;
- минимизировать fragmentation;
- сделать recommended next step особенно ясным.

Задача:
result должен ощущаться как центр доверия, а не как набор связанных блоков.

---

## PATCH-06 — Mobile table simplification + detail-first
Сделать:
- уменьшить low-level table mechanics на mobile;
- усилить роль presets;
- спрятать тонкую настройку глубже;
- сделать row-detail primary mobile pattern;
- проверить bottom sheet semantics and priority of actions inside it.

Задача:
на телефоне пользователь не должен бороться с таблицей как с техническим объектом.

---

## PATCH-07 — Visual language and design rhythm hardening
Сделать:
- typography pass;
- spacing pass;
- card rhythm pass;
- status chip discipline;
- toolbar discipline;
- visual weight rebalance;
- quieter secondary surfaces;
- stronger expensive-looking hierarchy.

Задача:
сделать не просто чисто, а дорого и уверенно.

---

## PATCH-08 — Localization and trust copy hardening
Сделать:
- полную ревизию visible strings;
- унифицировать product vocabulary;
- убрать оставшуюся лексическую двусмысленность;
- сделать success/warning/error/info/disabled language более зрелой;
- убрать техническую “болтовню”.

Задача:
дорогой продукт должен говорить как дорогой продукт.

---

## PATCH-09 — Accessibility + regression + DoD evidence
Сделать:
- touch target pass;
- keyboard pass;
- contrast pass;
- RTL/LTR pass;
- motion sanity;
- DOM/static regression tests;
- manual smoke matrix;
- before/after evidence;
- final DoD checklist.

---

# 4. Component breakdown v2

Если экран остаётся в одном большом файле, всё равно нужно мыслить и править его как набор логических компонентов с чёткими boundaries.

## 4.1. `ClassicModeShell`
Ответственность:
- общий layout;
- screen rhythm;
- desktop/mobile structural switching;
- order and hierarchy of major sections.

---

## 4.2. `SystemStatusStrip`
Ответственность:
- usage/quota summary;
- system/provider status;
- secondary utility links;
- premium-quiet presentation.

Обязательное требование:
не доминировать над workflow.

---

## 4.3. `GlobalUtilityNav`
Ответственность:
- library/dashboard/srs/utility actions;
- secondary navigation access;
- не спорить с main workflow;
- быть визуально и логически вторичным.

---

## 4.4. `InputComposer`
Ответственность:
- input area;
- immediate input actions;
- local status chips;
- dirty/ready context;
- immediate workflow entry point.

---

## 4.5. `PrimaryWorkflowActions`
Ответственность:
- current dominant CTA;
- secondary workflow CTA;
- stale-sensitive emphasis;
- explanation of current recommended step.

---

## 4.6. `InputStateBanner`
Ответственность:
- warnings;
- stale notices;
- restored notices;
- success/info/error context.

---

## 4.7. `TtsControlsSurface`
Ответственность:
- TTS config;
- voice/speed/pitch;
- provider logic;
- optional advanced disclosure.

---

## 4.8. `TranslationControlsSurface`
Ответственность:
- provider;
- translit profile;
- table/font-related settings;
- advanced disclosure;
- not overload first interaction zone.

---

## 4.9. `ResultSurface`
Ответственность:
- result header;
- draft/current/stale/restored signal;
- provenance;
- export readiness;
- recommended next step;
- result card coherence.

---

## 4.10. `ExportActionsSurface`
Ответственность:
- Audio / Anki / Download / related actions;
- contextual availability;
- no dead-gray-wall behavior;
- hide/collapse/explain model when unavailable.

---

## 4.11. `TableScenarioToolbar`
Ответственность:
- presets;
- playlist;
- configure columns;
- reset;
- optionally advanced controls.

---

## 4.12. `ResultTableDesktop`
Ответственность:
- data-rich desktop table;
- polished row actions;
- scroll discipline;
- premium data-surface appearance.

---

## 4.13. `ResultTableMobile`
Ответственность:
- mobile-safe preview of rows;
- reduced control density;
- controlled horizontal behavior only if unavoidable;
- detail-first companion model.

---

## 4.14. `RowDetailSheet`
Ответственность:
- mobile detailed row reading;
- row-level actions;
- strong content hierarchy;
- premium modal/sheet feel;
- no interference from floating utilities.

---

## 4.15. `UtilityFloatingControl`
Ответственность:
- any remaining floating mode/utility control.

Требование:
либо интегрировать в safe utility pattern, либо перепроектировать так, чтобы он перестал быть premium defect.

---

# 5. Desktop/mobile layout contract v2

## 5.1. Desktop layout contract

Desktop должен выглядеть как **executive workspace**, а не как “улучшенная форма”.

### Required structure
- structured system strip at top;
- clear main workspace below;
- input/workflow side;
- result/trust/data side;
- no heavy wasted space;
- no random visual competition.

### Required desktop properties
1. Input — явная стартовая точка.
2. CTA hierarchy — без двусмысленности.
3. Result surface — цельная и дорогая.
4. Table — disciplined and lighter.
5. Navigation/utility — secondary.
6. Usage/status — compact and quiet.

---

## 5.2. Mobile layout contract

Mobile должен быть **guided, concise, calm, trust-heavy**.

### Required first viewport
- input;
- status;
- dominant action;
- at most minimal secondary controls.

### Required mobile properties
1. No overlay artifacts.
2. No long wall of controls before main step.
3. Detail-first interaction for row complexity.
4. High-value controls on surface, low-level controls deeper.
5. Result and export layer calmer and shorter.
6. Utility controls not visually intrusive.

---

## 5.3. Breakpoint contract
Нужно использовать реальные breakpoint-правила repo, но логика должна быть такой:

- desktop: split premium workspace;
- tablet: compact workspace with preserved hierarchy;
- mobile: single-column guided flow with ruthless prioritization.

Запрещено:
просто переносить desktop hierarchy вниз без пересборки приоритетов.

---

## 5.4. Scroll contract
1. Main page scroll — predictable.
2. Sticky/fixed/floating elements — never obscure important content.
3. Table scroll — localized and controlled.
4. Detail sheet — stable, not conflicting with page scroll.
5. No accidental nested-scroll anti-patterns.

---

# 6. State contract v2

Нужно formalize and strengthen state model.  
UI не должен быть ambiguity-prone.

## 6.1. Input states
- `empty`
- `ready`
- `dirty`

## 6.2. Processing states
- `idle`
- `processing`
- `success`
- `partial`
- `error`

## 6.3. Result states
- `absent`
- `draft`
- `ready`
- `restored`
- `stale`
- `error`

## 6.4. Export states
- `hidden`
- `unavailable`
- `available`
- `processing`
- `done`
- `error`

## 6.5. CTA emphasis states
- `primary-rebuild`
- `primary-play`
- `primary-save/continue`
- `state-blocked`
- `state-recommendation-visible`

---

## 6.6. State invariants

Обязательные invariants:

1. `dirty` input cannot coexist with visually current result without stale signaling.
2. `stale` must influence dominant CTA emphasis.
3. `restored` must not masquerade as fully current.
4. `unavailable export` must not look like active functionality.
5. `processing` state must reshape visible action language.
6. `error` must be clear and actionable.
7. State copy must be concise and trust-heavy.

---

# 7. Accessibility contract v2

## 7.1. Touch contract
- all mobile primary interactions >= 44x44 px;
- comfortable spacing;
- no cramped chips/checkbox clusters in first-order interaction areas.

## 7.2. Keyboard contract
- clear tab order;
- visible focus;
- no traps;
- primary workflow reachable by keyboard;
- toolbar and disclosures keyboard-usable.

## 7.3. Contrast contract
Проверить:
- muted text,
- disabled actions,
- warnings,
- info chips,
- table text,
- subtle metadata,
- small captions.

## 7.4. Semantic contract
- proper labeling;
- grouped controls;
- meaningful button names;
- aria/state semantics where applicable in stack.

## 7.5. RTL/LTR contract
Обязательно:
- direction isolation;
- stable mixed Hebrew/Russian/Latin/SBL display;
- row/detail readability;
- no broken alignment in chips, cards, tables, sheets.

## 7.6. Motion contract
- reduced motion respected;
- transitions support clarity;
- no decorative motion that cheapens premium feel.

---

# 8. Regression risks v2

## 8.1. Business logic regression
Risk:
сломать TTS / translation / save / export gating.

Mitigation:
- do not casually rename/remove critical ids/handlers;
- keep behavior contracts unless deliberately remapped and verified;
- smoke after each patch.

---

## 8.2. State regression
Risk:
UI starts misrepresenting stale/current/restored/export readiness.

Mitigation:
- explicit state contract;
- state-based manual smoke scenarios;
- regression tests for status logic if feasible.

---

## 8.3. Mobile regression
Risk:
mobile gets visually nicer but functionally longer or harder.

Mitigation:
- first viewport contract;
- narrow-width screenshot evidence;
- row-detail flow testing;
- no uncontrolled surface growth.

---

## 8.4. Overlay regression
Risk:
utility/floating control continues to appear in critical contexts.

Mitigation:
- explicit overlay audit;
- check result area, table, row sheet, first screen, bottom zones.

---

## 8.5. Localization regression
Risk:
mixed-language UI remains inconsistent.

Mitigation:
- visible string audit;
- vocabulary checklist;
- grep/search pass over user-facing copy.

---

## 8.6. Table regression
Risk:
desktop or mobile table interactions degrade.

Mitigation:
- test presets;
- test row detail;
- test action buttons;
- test playlist and column logic.

---

## 8.7. Visual regression
Risk:
new patches improve one zone but break overall rhythm.

Mitigation:
- full-screen review after each major patch;
- desktop/mobile before-after compare;
- section-weight sanity pass.

---

# 9. UI/UX CONSTRAINTS v2

## Non-negotiable constraints

1. **No fixed heights** where content can grow:
   - result header,
   - banners,
   - cards,
   - row detail,
   - mobile disclosures,
   - metadata,
   - mixed-language content blocks.

2. **No intrusive floating controls** in critical workflow areas.

3. **No ambiguous primary CTA state** when stale/current logic is known.

4. **No dead-gray-wall export states**.  
   Must hide, collapse, or explain.

5. **No mobile-first overload**.  
   First viewport must remain strict and calm.

6. **No low-level table mechanics overload on phone**.

7. **No mixed-language chaos** in visible copy.

8. **No “good enough” semi-premium visual state**.  
   v2 must intentionally pursue expensive-looking calmness.

9. **No regressions in trust layer**:
   stale/current/restored/export readiness must remain highly legible.

10. **No completion claim without evidence pack**.

---

# 10. Acceptance tests v2

Если полноценного e2e-стека нет, минимум обязателен:
- static/DOM contract tests where possible;
- manual smoke matrix;
- screenshot evidence.

---

## 10.1. Desktop acceptance tests

### D1. Premium workspace perception
Проверка:
- screen reads as premium workspace, not form/admin panel.

### D2. Dominant CTA clarity
Проверка:
- at each major state the dominant CTA is obvious.

### D3. Stale-state dominance
Шаги:
1. Generate result.
2. Edit input.
3. Verify stale signal.
4. Verify dominant rebuild/update emphasis.

### D4. Result surface trust
Проверка:
- provenance, freshness, export readiness, recommendation all readable quickly.

### D5. Export contextuality
Проверка:
- export actions do not dominate too early;
- unavailable actions do not degrade experience.

### D6. Table premium polish
Проверка:
- toolbar calmer;
- row actions readable;
- overall table feels lighter and more deliberate.

---

## 10.2. Mobile acceptance tests

### M1. First viewport ruthlessness
Проверка:
- input + status + primary action visible fast;
- no clutter-heavy top flow.

### M2. Utility overlay elimination
Проверка:
- floating utility no longer interferes visually.

### M3. Mobile control simplification
Проверка:
- low-level table controls not overexposed.

### M4. Row-detail primary pattern
Шаги:
1. Open table on mobile.
2. Tap row.
3. Verify sheet readability, CTA priority, visual polish.
4. Verify utility control does not conflict.

### M5. Result/export calmness
Проверка:
- result and downstream actions feel calm, not stacked aggressively.

---

## 10.3. Trust-layer acceptance tests

### T1. Restored result clarity
Проверка:
- restored/local result clearly identified.

### T2. Current vs stale clarity
Проверка:
- impossible to confuse outdated result for current.

### T3. Disabled/hidden logic clarity
Проверка:
- unavailable actions are understandable and not noisy.

---

## 10.4. Copy/localization acceptance tests

### L1. Visible copy audit
Проверка:
- visible strings are product-consistent and intentional.

### L2. Mixed text direction audit
Проверка:
- Hebrew/Russian/Latin/SBL remain stable and readable.

---

# 11. Definition of Done Evidence v2

`v2` cannot be accepted without evidence.

## 11.1. Required artefacts

1. **Post-v1 audit summary**
2. **v2 patch plan**
3. **Files changed list**
4. **Before/after screenshots**
   - desktop full screen;
   - desktop result surface;
   - mobile first screen;
   - mobile result area;
   - mobile row-detail sheet;
   - top status strip;
   - stale-state screen.

5. **Responsive evidence**
   - desktop;
   - tablet;
   - mobile narrow width.

6. **State evidence**
   - current;
   - stale;
   - restored;
   - processing;
   - export unavailable;
   - export ready;
   - error if available.

7. **Accessibility evidence**
   - touch target notes;
   - keyboard notes;
   - contrast sanity notes;
   - RTL/LTR notes.

8. **Regression evidence**
   - tests run;
   - manual smoke results;
   - known remaining risks.

9. **DoD checklist**
   - pass/fail per acceptance item with evidence reference.

---

## 11.2. Final handoff format

Финальный ответ / отчёт должен содержать:

### 1. Audit summary
- baseline;
- unresolved defects;
- files/entrypoints used.

### 2. Patch series completed
- what was changed per patch.

### 3. Files changed
- each file and why it changed.

### 4. Tests run
- automated + static + smoke.

### 5. Manual QA
- desktop/mobile scenarios.

### 6. Remaining risks
- honest unresolved items if any remain.

### 7. DoD evidence status
- explicit checklist state.

---

# 12. What v2 must not become

Нельзя, чтобы `v2` превратился в:

1. merely cosmetic skinning;
2. local style tweaks without hierarchy hardening;
3. mobile compromise pass only;
4. visual cleanup without trust-layer improvement;
5. another intermediate “better but still not premium-complete” iteration.

---

# 13. Implementation goal statement

Нужно выполнить **second-wave premium hardening** для `Classic Mode`, чтобы перевести экран:

из состояния:
- strong professional interface

в состояние:
- **unambiguously expensive, calm, trust-heavy, mobile-credible premium workspace**

для продукта уровня **100 000 ₪ / month subscription**.

---

# 14. Short execution formula

## Before coding
Audit -> defects -> patch plan -> risk map.

## During coding
Stage patches -> protect behavior -> verify often.

## After coding
Evidence -> tests -> smoke -> honest remaining risks -> DoD.

---

# 15. Final one-line requirement

`CLASSIC_MODE_PREMIUM_REDESIGN_IMPLEMENTATION_SPEC_v2` требует не “ещё одного улучшения”, а **жёсткого, измеримого, evidence-backed premium hardening pass**, который устранит remaining premium gaps и доведёт Classic Mode до уровня действительно дорогого и зрелого продукта.
