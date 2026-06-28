# Эпик 8 — a11y / онбординг / first-run · P2 / M-L · вед. R4/UX · R8/R2/R11

**Дата:** 2026-06-28 · **Статус:** 🟢 направление + развилки одобрены (8a+8b+8c+8d; онбординг = дисмисс-полоска+аффордансы) → build.
**Родитель:** `BRR_UX_AUDIT_2026_06_25.md` §ЭПИК 8. Память [[project_brr_ux_audit]] · [[feedback_verify_stale_plan_vs_live_code]] · [[feedback_hidden_attr_vs_display]].

## Зачем
Эпик 4 построил петлю удержания (тап-слово→карточка, долгий-тап→статус, тап-разворот, 📚 Учить, 🎯 Тренировка), но **жесты НЕВИДИМЫ** — нет аффордансов/подсказок. Моат, который не находят, = не моат (R2/R5). + a11y-долги (фокус, reduced-motion, цвет-один, SR, контраст).

## Current-state map (Explore, против живого кода — НЕ из устаревшего аудита)
- **Есть:** ARIA на табах/диалогах/кнопках + 2 aria-live (FTS/find); честные пустые состояния; aidsHint-пульс на «Аа»; видимая легенда статусов (отгружена в 4.1 — P1 word-status-a11y ЧАСТИЧНО закрыт); reduced-motion на sheet-переходах + FTS-спиннере; dark-vars.
- **Нет/долги:** аффордансов для тап-слово/долгий-тап/📚/🎯/тап-строка-аудио/reveal; фокус-менеджмента (нет .focus/трапа/возврата); `aria-modal="false"` на карточке; `aidsPulse` игнорит reduced-motion (library.html:579); `lang=he/ru` + sr-only на таблице; скелетонов (только спиннер/текст); контраст prov-pills в СВЕТЛОЙ теме ~2.1–2.8:1.

## Лучшие практики (рынок) + роли
- Онбординг (Duolingo/LingQ): прогрессивно, **дисмисс**, не апфронт-стена, в контексте, gated по «seen»-флагу. **Владелец: НЕ воскрешать Студия-модалку.**
- WCAG: фокус в диалог + возврат (2.4.3); reduced-motion (2.3.3); цвет не единственный канал (1.4.1); текст ≥4.5:1 (1.4.3).
- R11: Room-only, parity-safe; SR-семантика таблицы — **post-render** (как word-wrap), `index.html`/билдер не трогать; гейт reader-parity зелёный.

## Reusable (не строить заново)
`el()` · `tt()`/`applyI18n` · `roomToast` · `_lsGet/_lsSet` + `aidsHinted`-флаг-паттерн · `showState` · sheet-shells · `data-i18n-aria-label`/`-title`.

## Дизайн (залочено)
### 8a — Обнаруживаемость (дисмисс-полоска + аффордансы)
- **Дисмисс-полоска** над ридером при ПЕРВОМ открытии текста (флаг `room.readerTipSeen` в localStorage): «👆 Тап — разбор · долгий тап — статус · 📚 Учить — словарь · ▶ строка — аудио». ✕ закрывает + ставит флаг. i18n `room.onboard.*`. Не модалка, ненавязчиво, reduced-motion-safe.
- **Аффордансы:** `.rm-w{cursor:pointer}` (если нет); лёгкий one-time cue. Легенда — без изменений (полоска покрывает discovery).

### 8b — a11y быстрые победы
- **Фокус:** на открытии sheet (карточка/study/consent/statpop) — запомнить `document.activeElement`, увести фокус в карточку (close-кнопка); на закрытии — вернуть. (Мягкий трап опц.) WCAG 2.4.3.
- **aria-modal=true** на карточке (reader-morph ensureSheet) + study + consent (есть backdrop).
- **reduced-motion:** обернуть `aidsPulse` в `@media (prefers-reduced-motion: no-preference)` (или reduce-override). WCAG 2.3.3.
- **SR-таблица (parity-safe, post-render):** после openText проставить `lang="he"` на he/niqqud-ячейки, `lang="ru"` на ru; sr-only-подписи где нужно. Билдер reader-core НЕ трогать.

### 8c — Состояния
- **Скелетон** открытия корпус-работы (вместо голого ⏳): shimmer-строки, reduced-motion-safe. 
- **Первый-тап lazy-3.3МБ:** карточка показывает «Анализ… (загружаю словарь)» на первом тапе.
- **Честные offline/error** состояния каталога/работы; **«попробуй»**-гайд в ключевых пустых экранах.

### 8d — Контраст
- Светлая тема: затемнить текст prov-pills (.rm-prov-*) до ≥4.5:1 (override в light).

## Гейты / инварианты
reader-parity (КРИТИЧНО — трогаем sheet + post-render lang) · reader-morph (aria-modal/focus) · reader-scaffold/word-status/notes/context (регресс) · i18n (+onboard/state ключи) · corpus-vocab. @380px свет+тёмная (полоска, скелетон). Bump SW+футеры+package. commit+push→Coolify→prod-verify (Node no-store)→live-verify Kapture. Room-only; resolver/notes-autogen не тронуты.

## v2-беклог
Полный фокус-трап (Tab-цикл); интерактивный тур; SR aria-describedby; offline/error-матрица полностью; in-text второй канал статуса (ограничение: подчёркивание конфликтует с никудом — отложено).
