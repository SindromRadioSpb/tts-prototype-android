# Эпик 7 — Десктоп-раскладка Зала (recon-дизайн) · P1

**Дата:** 2026-06-25 · **Статус:** 🟡 RECON — ждёт approval по развилкам §5.
**Родитель:** `docs/planning/BRR_UX_AUDIT_2026_06_25.md` · Память [[project_brr_ux_audit]]. Роль R4 (вед.) · UX-сис.
**Цель:** дать Залу аддитивный десктоп-CSS-слой, чтобы на 1920px он не выглядел растянутой мобилкой. Чистый CSS, один файл, нулевой риск для логики/парити.

---

## 1. Факты (карта кода, проверено)
- ВСЯ Room-CSS — инлайн в `public/library.html <style>` (стр. 13–720). **НОЛЬ `@media (min-width)`** → greenfield, без коллизий.
- **Крюк reading-measure: `.reader-table-wrap`** (library.html:474, сейчас `padding:12px; overflow-x:auto`). Max-width вешаем СЮДА. `#proTable { width:100% }` живёт в `reader-core.css:144` — **общий со Studio, НЕ трогать** (инвариант parity/index.html). 100%-таблица внутри ~860px-обёртки даёт комфортную меру без изменения билдера.
- Сетка периодов `.corpus-period-grid` (library.html:198) — хардкод `1fr 1fr` на всех ширинах.
- Полки: `.shelf-rail` (102) горизонт-скролл, карты `.work-card` (109) фикс `width:132px` → на 1920px разрежено + скрытый скроллбар (мышь не видит, что есть ещё).
- `#roomContent`/`main` (95) и `.room-tabs` (82) — 100% во всю ширину. Body bg `--bg-page` (#f4f6f9 / dark #0f172a) → центрированный контейнер сольётся естественно.
- Dark: инлайн в library.html (27–46 + точечные) + `reader-core.css` (64–119). Тинты строк: jump-амбер `rgba(255,184,28,.20)` (library.html:541) **БЕЗ dark-override** (наследует светлый) → проверить на тёмном (пересекается с пробелом G10 Эпика 8). reader-core токены playing/error dark-варианты уже есть.
- Reader-parity = HTML-байт-парити (билдер), НЕ CSS-ширина → CSS-only слой держит гейт зелёным.

## 2. Дизайн (один новый блок `@media (min-width: 1024px)` в library.html `<style>`)
- **Центр-контейнер:** `#roomContent`, `.room-header-row`, `.room-tabs` → `max-width: ~1120px; margin-inline:auto` (вся комната = центрированная колонка на --bg-page; tabs не на весь 1920px).
- **Reading-measure:** `.reader-table-wrap { max-width: ~880px; margin-inline:auto }` (десктоп) → 5-кол билингв-таблица в комфортной мере. `#proTable` не трогаем.
- **Сетка периодов:** `.corpus-period-grid { grid-template-columns: repeat(auto-fill, minmax(220px,1fr)) }` → 3–4 колонки на ширине.
- **Полки → wrap-grid:** на десктопе `.shelf-rail { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr)); overflow: visible }` (вместо разреженной карусели) → карты заполняют центр-контейнер. Это **растворяет** `shelf-carousel-affordance` (нет скрытого скролла). `.work-card { width:auto }` в этом контексте.
- **reader-bar / find / aids** — тоже в центр-контейнере (max-width), чтобы не разъезжались.
- Опц. `@media (min-width: 1440px)` — чуть шире контейнер/мера, если нужно.

## 3. Dark + a11y проверка (в этом же эпике)
- Прогнать @1024/@1440 в светлой и тёмной (jump/find/playing тинты, prov-чипы, period-cards). jump-амбер без dark-override — добавить dark-вариант, если моется (координируется с Эпиком 8 G10).
- @380px НЕ тронут (новые правила только под min-width) — проверить скрином, что мобайл байт-идентичен.

## 4. Фазы / гейты
- **P7.1** Десктоп-слой (контейнер + reading-measure + period-grid + полки-grid) — один CSS-блок. Скрины @380px(светл/тёмн, не тронут) + @1024 + @1440 (светл/тёмн). `smoke:reader-parity` зелёный (билдер не тронут). SW CACHE_VERSION bump (shell-изменение). Прод-верифи.
- (shelf-carousel-affordance входит сюда — растворяется в wrap-grid.)
Файлы: только `public/library.html` (`<style>`) + `public/sw.js` (bump). НИЧЕГО в `reader-core.css`/`index.html`.

## 5. Развилки на approval
- **D1 (макс-ширина контента):** ~**1120px** центр-контейнер. ⇐ рекомендую (комфорт без «пустыни» на 1920px). Альт: 1280px.
- **D2 (мера чтения таблицы):** `.reader-table-wrap` ~**880px**. ⇐ рекомендую (билингв 5 колонок; уже таблицы — потеря; шире — плохая мера). Альт: 960px.
- **D3 (полки на десктопе):** **wrap-grid** (карты заполняют, скролл-проблема исчезает) ⇐ рекомендую. Альт: оставить карусель + edge-fade/стрелки.
- **D4 (брейкпоинт-порог):** старт **1024px** (+опц. 1440px). ⇐ рекомендую.

Все дефолты безопасны и обратимы (чистый аддитивный CSS). Независим от Эпика 1 — можно строить параллельно/первым.
