# BRR-P1-006 — Scaffolded Reading Console (адаптивное затухание лесов) — APPROVED

**Статус:** дизайн УТВЕРЖДЁН владельцем (2026-06-14, AskUserQuestion). Направление ① выбрано; модель
затухания = **Адаптивное (fade-as-you-learn)**. Реализация в этой сессии.
**Поверхность:** `public/library.html` (Зал). **index.html НЕ трогать.** Роли: R2/R8 (ядро), R4, R10/R1.

## Context — зачем
Keystone i+1 «Следующий для тебя» отгружен (read→tap→карточка→Save→цвет→Anki→ЧТО ДАЛЬШЕ). Петля замкнута
структурно, но доставочный конец — *чтение рекомендованного i+1-текста* — не дотягивает до премиум-планки SLA.
Прямой мандат **R8 — «леса, что затухают»** (red-flag: «леса, что НЕ затухают»).

**Разведка изменила scope (факт по коду):** бóльшая часть «консоли» уже в проде. Панель `#readerAids`
(`buildAidsPanel()`, library-ui.js:443–489) уже содержит: профиль транслита (SBL/Рус), видимость колонок
niqqud/translit/ru, **🎨 Статус слов = BRR-P1-009 ПОЛНОСТЬЮ ЖИВ** (per-word раскраска, `.rm-w-*`
library.html:423–425, single-flight, parity-safe), 🎯 Точный режим Dicta. **Истинные пробелы:**
1. **Нет ЗАТУХАНИЯ** — всё бинарно «колонка вкл/выкл»; нет огласовки «по нужде» и нет раскрытия перевода.
2. **Нет персистентности лесов** — `readerCfg` (library-ui.js:256) только в памяти, сброс каждую загрузку.
3. **Находимость** — главная фича (раскраска) дефолт-OFF и закопана.

**Итог:** ① = добавить слой **адаптивного затухания + персистентность + витрину**. Корона = огласовка,
затухающая на знакомых словах, на том же word-status-движке, что и i+1 (никто из конкурентов не связывает
огласовку с ТВОИМ словарём — StoryHebrew даёт ручное full/partial/off без персонализации).

## MEASURE (до кода; норма) — выполнено
Структурный харнесс `.tmp/benyehuda/scaffold-fade-recon.js` на shipped-сайдкаре corpus-vocab-v7 (796 работ,
6887 лемм). Симулированный учащийся = top-K частотных лемм. Результат: **на in-zone-работах адаптивный fade
де-вокализует медиану ~65–75% всех токенов**, оставляя огласовку на оставшихся ~25–35% (новые/архаичные) —
точно «огласовка концентрируется там, где нужна». Трекает §7 на реальном профиле владельца (in-zone=15,
drill 70–90% → totalCov ~65–75%). Фича осмысленна → код оправдан.
```
K=500  inZone=127 medDrill_inzone=72.8 medFade_inzone=65.2
K=1000 inZone=568 medDrill_inzone=78.2 medFade_inzone=68.0
K=1500 inZone=663 medDrill_inzone=83.5 medFade_inzone=72.3
K=2000 inZone=446 medDrill_inzone=85.7 medFade_inzone=74.4
```
Авторитетный per-profile замер — on-device сниппет `.tmp/benyehuda/scaffold-fade-snippet.js` (владелец
вставляет в консоль Зала на реальном OPFS-профиле; считает де-вокализованные niqqud-слова vs оставленные).

## Архитектура (швы)
| Слой | Файл | Трогать? |
|---|---|---|
| Builder (parity-locked) | `reader-core.js` `buildBilingualTableHtml` | НЕТ — `smoke:reader-parity` |
| Studio | `index.html` | НЕТ |
| Post-render морфо-слой (**Room-only**, НЕ в index.html) | `reader-morph.js` | ДА — здесь fade |
| Координатор/тоглы/persist | `library-ui.js` | ДА |
| CSS/i18n | `library.html`, `i18n/locales/*` | ДА |
| SW | `sw.js` | ДА (бамп) |

**Parity-гарантия:** гейт сравнивает нормализованную HTML-строку builder-вывода. Все изменения =
**post-render DOM-мутации** на уже-существующих `.rm-w`-спанах (несут `data-surface` плоскую + `data-niqqud`
огласованную, reader-morph.js:498–501) → гейт не видит, зелёный.

## Deliverables

### D1 — Адаптивная огласовка «по нужде» (ядро)
- **UX:** select «Огласовка: всегда / по нужде / выкл» (full/adaptive/off) вместо niqqud-чекбокса.
- **Механизм:** объединить раскраску (P1-009) и fade в ОДИН проход `decorateWords(mount, states, {color, fadeMode})`
  в reader-morph.js (резолв слова ОДИН раз; chunked 60/batch + yields). Для `.rm-w` в niqqud-ячейке
  (`closest('td[data-col="niqqud"]')`): **honest-gate R10/R1** — если `resolveCore` label ∉ {exact,likely} →
  оставляем огласовку (никогда не прячем помощь на неуверенно-опознанном слове); если familiar
  (`CFG.KNOWN_STATES`) → `textContent=data-surface` (плоско), иначе `textContent=data-niqqud`.
  `paintLearningStatus`/`clearLearningStatus` остаются тонкими врапперами над `decorateWords`.

### D2 — Прогрессивное раскрытие перевода (active recall)
- **UX:** select «Перевод: показан / по тапу / выкл» (show/reveal/off).
- **Механизм (MUST-BUILD-NEW, parity-safe):** в reveal — класс `.ru-veiled` (blur) на ru-ячейках; capture-тап
  по ru-ячейке → toggle `.ru-revealed`. Per-row = DOM-класс (сброс на rerender — ок для v1; persist режима — да).
- **Конфликт тапа:** в reveal добавить `'ru'` в `tapToHearExcludeCols` (аудио на ▶ + translit), reveal-хендлер
  в capture-фазе (как морфо-тап). `attachReaderAudio` читает конфиг.
- **CSS:** `.ru-veiled{filter:blur(5px);cursor:pointer;user-select:none}` `.ru-veiled.ru-revealed{filter:none}` — RTL-safe.

### D3 — Персистентность + находимость
- **Persist:** localStorage `room.niqqudMode`(full|adaptive|off), `room.translitProfile`, `room.translitOn`,
  `room.ruMode`(show|reveal|off). Загрузка в `readerCfg` на boot; сохранение на change. `readerConfig()`
  выводит `visibleColumns` из режимов.
- **Находимость (R4, без dark-patterns):** дефолты консервативны (full niqqud, translit on, ru show, раскраска
  OFF — первый-открыт лёгкий/офлайн-дешёвый; adaptive/раскраска лениво греют 3.3МБ Pealim). Одноразовый
  ненавязчивый хинт у `#readerAidsToggle` (localStorage `room.aidsHinted`).

## i18n (ru/en/he)
`room.reader.niqqudMode`+`niqqudFull|niqqudAdaptive|niqqudOff`; `room.reader.ruMode`+`ruShow|ruReveal|ruOff`;
`room.reader.adaptiveHint`; `room.reader.revealHint`; `room.reader.aidsHintTip`. HE best-effort (native-review).

## SW / кэш
`CACHE_VERSION` v3.10.43 → **v3.10.44-room-scaffold** (shell: library.html, library-ui.js, reader-morph.js).
`CORPUS_VOCAB_DATA_REV` НЕ трогать (формат сайдкара не меняется). На устройстве = тост «Обновить».

## Scope OUT (честно)
**Per-word translit-fade невыполним чисто** — translit-колонка НЕ токенизируется (`wrapMount` оборачивает только
he+niqqud, reader-morph.js:508) → translit остаётся column-toggle; per-word translit-fade отложен (R10: чистая
огласовка > хрупкое выравнивание токенов). Также вне: karaoke (②), Anki-sync (⑤), бейк (③), 47097 идиш.

## Гейты / верификация
- **Новый** `smoke:reader-scaffold` — Node-тест чистой `fadeDecision(status,label,mode)→'plain'|'niqqud'`
  (таблица истинности вкл. honest-gate).
- **Зелёные:** `smoke:reader-parity`, `smoke:corpus-vocab(-engine)`, `smoke:room`, `smoke:corpus-room`, `test:api-smoke`.
- **@380px RTL скрины** (Playwright): niqqud full/adaptive/off; ru veiled+revealed; хинт — до `git add`.
- **Prod-verify:** linguistpro.kolosei.com/library.html — in-zone-текст: adaptive → знакомые плоские, новые
  огласованы; reveal → blur→тап раскрывает; reload → леса персистнули; тост «Обновить».

## Файлы к изменению
`reader-morph.js` (decorateWords+fade), `library-ui.js` (select-тоглы, reveal, persist, хинт),
`library.html` (CSS .ru-veiled), `i18n/locales/{ru,en,he}.js`, `sw.js` (CACHE_VERSION),
`scripts/premium/reader-scaffold-smoke.js` (+npm `smoke:reader-scaffold`). MEASURE: `.tmp/benyehuda/scaffold-fade-*.js`.
