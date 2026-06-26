# Эпик 2 — Уверенность читаема + в один тап от верного · P1 / M · R10

**Дата:** 2026-06-26 · **Статус:** ✅ **SHIPPED+PROD** (SW `v3.11.5`, `4b0532a`; Батч A `ffb5842` v3.11.4 + Батч B `4b0532a` v3.11.5). Прод-верифицировано Node-fetch no-store (22/22 маркера). Живой device-check (мобайл) — за владельцем.
**Родитель:** `docs/planning/BRR_UX_AUDIT_2026_06_25.md` (находки `morph-provenance-legend`, `morph-tier3-on-demand`, `machine-niqqud-provenance`). Память [[project_brr_ux_audit]]. Роли R10 (вед.) · R4 · R9 · R5.
**Цель:** таксономия уверенности (отгружена в Эпике 1) становится ЧИТАЕМОЙ для пользователя, а верное чтение — в один тап (per-card Tier-3), при честном провенансе огласовки. Всё Room-only; `index.html`/parity-билдер нетронуты (`smoke:reader-parity` зелёный).

---

## 0. Measure-before-code: аудит был частично устаревшим (R10)

Аудит (`BRR_UX_AUDIT_2026_06_25.md`) писался ДО завершения Эпика 1, который попутно локализовал морфокарточку. Сверка живого кода против аудита **до** написания кода:

| Утверждение аудита | Реальность (2026-06-26) | Итог |
|---|---|---|
| #1 «живой баг: `room.morph.prov.*` нет в EN/HE → не-RU видят русское» | **Уже исправлено в Эпике 1.** Все 3 локали имеют полные `prov.*` (6) + `pos.*` (11) + alts/consent. `smoke:i18n` 226/0. | Чинить НЕ нужно. Осталась только сама легенда. |
| #3 «чип не сообщает, что огласовка машинная» | `prov.note` во всех 3 локалях УЖЕ говорит «Перевод и огласовка — машинные». НО не выводилась в читалке Зала. | Нужно вынести ноту + пометить никуд в карточке. |
| #2 «Tier-3 достижим лишь глобальным OFF-тумблером» | Эпик-1-хвост уже добавил авто-на-каждый-тап + consent-модал. Пробел сузился до: нет пути для отклонивших/нерешивших разово уточнить ОДНО слово. | Реальная работа = per-card разовый refine. |

**Урок:** аудит, написанный до завершения зависимого эпика, нельзя брать как ground-truth — сверять с живым кодом (R10 measure-before-code). Сэкономлено: не переписан уже-рабочий i18n.

---

## 1. Что отгружено

### #1 — Легенда таксономии уверенности (`morph-provenance-legend`, P3)
Компактная «?»-кнопка у бейджа в морфокарточке → инлайн-легенда (свёрнута по умолчанию) с одной строкой-объяснением на каждый бейдж: `точно` / `вероятно` / `контекст (Dicta)` / `служебное слово` / `подобрано` / `не определено офлайн` + строка `возможно также`.
- **Код:** `reader-morph.js` — `LEGEND_DESC`/`LEGEND_ORDER`/`legendHtml()`/`onLegendToggle()` + `uiDir()` (направление по UI-локали, не по `dir="rtl"` заголовка). Бейджи легенды переиспользуют классы `.rm-prov-*` (DRY-цвета).
- **i18n:** `room.morph.legend.{title,exact,likely,context,function,guessed,unknown,alts}` (ru/en/he).
- **CSS:** `library.html` — `.rm-prov-line`, `.rm-prov-help`, `.rm-legend*` (переменные темы).

### #2 — Per-card разовый Tier-3 «уточнить в контексте» (`morph-tier3-on-demand`, P2, R5)
Кнопка «🎯 Уточнить в контексте» на НЕ-решающих карточках (`label≠exact`, не служебное слово), показана ТОЛЬКО когда онлайн И глобальный авто-режим ВЫКЛ (granted-юзеры и так авто-уточняют каждый тап; офлайн скрыта → нет тихого исходящего). Тап → инлайн consent-подтверждение (R5): «Уточнить разово» = один Dicta-вызов для ЭТОГО слова, НЕ трогает глобальный consent; «Включить для всех слов» = выдать глобальный режим. Переразрешение с контекстом → перерендер; refine-без-результата → честное «контекст не дал уточнения».
- **Owner-развилка (выбрана):** «Разовый, не трогает глобальный» (самый гранулярный R5).
- **Код:** `reader-morph.js` — `_activeWordCtx` (surface/niqqud/sentence, null на чип-карточках), `onRefinePrompt`/`onRefine(grantAll)`, gate в `renderCardHtml`. `library-ui.js` — `makeRefineProvider()` (разовый Dicta БЕЗ consent-гейта — подтверждение И ЕСТЬ consent; null офлайн) + `canRefine()` (`navigator.onLine && contextConsent()!=='granted'`) + `grantContextConsent` wired в `attachReaderMorph`.
- **i18n:** `room.morph.{refine,refineNote,refineGo,refineAll,refineMiss,refining}` (ru/en/he).

### #3 — Машинная огласовка (`machine-niqqud-provenance`, P2, R9 derived-as-asserted)
- **Карточка:** пометка «ⓜ огласовка — машинная (Dicta)» под заголовком, когда слово несёт огласовку (`/[֑-ׇ]/`). i18n `room.morph.niqqudMachine`.
- **Читалка:** существующая `room.prov.note` («Перевод и огласовка — машинные, не вычитаны») вынесена в `<p id="readerProvNote">` под таблицей открытого текста.
- **Owner-развилка (выбрана):** «В карточке + нота в читалке».

---

## 2. Гейты + верификация
- **Зелёные:** `smoke:i18n` 226/0 · `smoke:reader-morph` (+ассерты: легенда-toggle, niqqud-caption, refine offer/confirm/miss/hidden-offline) · `smoke:reader-context` · `smoke:reader-dicta` · `smoke:reader-parity` · `smoke:reader-notes` · `smoke:reader-scaffold` 234/0 · `smoke:autogen-parity`.
- **@380px:** свет+тёмная (ru) + he-RTL — легенда раскрывается RTL-корректно; refine-кнопка + consent-подтверждение в обеих темах. (`notes-autogen.js` НЕ тронут — parity заметок не затронут.)
- **Прод:** Node-fetch no-store 22/22 (legendHtml/niqqudMachine/onRefine/_activeWordCtx; makeRefineProvider/canRefine/refineContext-wired/grantContextConsent; readerProvNote/CSS/footer; 3 локали legend/refine/niqqud).

### Пофикшены 2 reader-смоука (побочно)
1. **reader-context/reader-morph badge-асерты** (РЕГРЕСС Батча A): легенда рендерит ОБРАЗЕЦ каждого бейджа (вкл. `.rm-prov-context`) в каждой карточке (скрыто) → `document.querySelector(".rm-prov-context")` по всему DOM лгал. Фикс: скоуп на `.rm-head` (бейдж-вердикт), не весь документ. **Урок: легенда-образцы классов ломают doc-wide селекторы — скоупить на точку вердикта.**
2. **reader-dicta** (ПРЕ-СУЩЕСТВУЮЩИЙ флак, падал и на `ced6567`): единственный reader-смоук без `serviceWorkers:"block"` → SW перезагружал страницу посреди evaluate. Добавлен SW-block (как у сестёр).
3. **reader-notes** (ПРЕ-СУЩЕСТВУЮЩИЙ, от Эпик-1-хвоста): consent-overlay перехватывал клик «Сохранить» — пред-сеяно `contextConsent='declined'` в смоуке.

---

## 3. Остаток / следующее
- Эпик 2 закрыт. Рекомендация владельцу (волна B/C): **Эпик 3** (премиум-карточка: озвучка искомого слова — S-вин, есть keyless WaveNet) или **Эпик 4** (моат удержания: one-tap статус, recon-first — спорит с «creation+linkage» философией, нужен recon-тикет).
- Все обогащения наследуют honest-gate Эпика 1 (не делать богаче неверно-разрешённое) — инвариант §3 родительского плана.
