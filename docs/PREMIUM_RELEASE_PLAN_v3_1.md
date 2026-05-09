# Premium Release Plan — v3.1.0

> **Цель релиза:** довести `LinguistPro` до состояния **зрелого premium-приложения**.
> Не расширение функциональности — а повышение качества, удобства и доверия.
>
> **Baseline:** v3.0.0 (offline-first OPFS архитектура, Phase 6 default-on, feedback-модалка с Tier 1+2 polish).
>
> **Что не входит в этот релиз:** новых «тяжёлых» фич нет. Cloud sync, A/B framework, voice notes, rrweb recorder и весь Tier 3 — отложены. Это релиз о **цельном premium-качестве**.

---

## Принципы качества

1. **Каждый экран должен ощущаться так же продуманно, как feedback-модалка.** Если что-то выглядит «прототипным» — это блокер.
2. **Hebrew first.** Ни один компонент не должен ломаться в RTL. Огласовки рендерятся идеально.
3. **i18n coverage real.** Любая UI-строка переводится. «3 языка» — реальность, не маркетинг.
4. **Optimistic + gentle.** UI отвечает мгновенно; ошибки не блокируют, а предлагают путь дальше.
5. **Mobile = native-feel.** На телефоне продукт ощущается как нативное приложение, не как сжатый desktop.
6. **Trust on every screen.** Юзер всегда видит: где данные, кто разработчик, как связаться, что сейчас сохраняется.
7. **No regressions.** Каждое изменение проверяется на отсутствие поломок существующего.

---

## Структура релиза

3 спринта по группам направлений. Sprint 1 — фундамент, без которого остальное не имеет смысла. Sprint 2 — daily-use экраны (где юзер 80% времени). Sprint 3 — производительность и завершающий лоск trust-сигналов.

```
Sprint 1: Foundation
├── 1. Hebrew typography & RTL
├── 2. App-wide theming (light/dark/auto)
└── 3. Full i18n coverage

Sprint 2: Daily-use
├── 4. Onboarding & discovery
├── 5. SRS + Library smart-sort
└── 6. Error gentleness app-wide

Sprint 3: Performance + Trust
├── 7. Performance / PWA
└── 8. Trust signals + content polish
```

---

# Sprint 1 — Foundation

## Direction 1 — Hebrew typography & RTL

**Концептуально:** иврит-приложение должно выглядеть как сделанное под иврит, не как локализация поверх LTR. Огласовки (никуд) — самая чувствительная типографическая задача: знаки крепятся к буквам и могут визуально «прыгать» если шрифт неправильный.

### Scope (что входит)

- Подбор премиум-шрифта для иврита с правильной поддержкой никуда. Кандидаты: **SBL Hebrew** (научный стандарт), **Frank Ruehl CLM** (классический), **Noto Sans Hebrew** (Google), **David CLM**, **Open Sans Hebrew**.
- Vendor-инг шрифта в `public/fonts/` (offline-first, без CDN).
- CSS rule на ивритские блоки: `font-family: <hebrew-font>, <fallback-stack>`. Применяется к элементам с `lang="he"` и к `[dir="rtl"]` контекстам.
- **Edge-case тестовая страница** `/typo-test.html` со всеми проблемными комбинациями: шева на алеф+ламед, дагеш + патах, шурук, холам, малефим, RTL+LTR mix.
- Аудит ключевых компонентов на RTL: IDE workspace tabs, Library cards, SRS Trainer, Dashboard, audio markers, edit indicator.
- Bidi-isolation в смешанных строках (Hebrew + Russian + English): `<bdi>` или `unicode-bidi: isolate`.
- Корректный line-height для текстов с никудом (огласовки требуют запаса по вертикали).

### Out of scope

- Перевод алгоритмов транслитерации (это отдельная C-серия задача).
- Изменение бэкенд-обработки текста.

### Acceptance criteria

- [ ] Шрифт загружается оффлайн (нет внешних CDN-вызовов).
- [ ] Тестовая страница `/typo-test.html` показывает все edge-cases без визуальных багов.
- [ ] На реальных текстах (например, `library-bundle-top100maco-150verb-150pril.zip`) огласовки рендерятся аккуратно.
- [ ] При переключении языка интерфейса на `עברית` — `dir="rtl"` корректно применяется ко всем модалкам и панелям без поломок layout'а.
- [ ] Mixed-content row («Привет שלום world») — каждый язык в правильном направлении.

### Test plan

- Browser-side: открыть тестовую страницу, визуально сверить с эталонным изображением.
- На реальных данных — открыть Hebrew-text из библиотеки, прокрутить таблицу.
- На mobile (iOS Safari, Android Chrome) — проверить рендеринг шрифта.

### Effort

2–3 дня.

### Risk

Низкий. Шрифты — изолированное изменение. Откат тривиален.

### Deliverables

- `public/fonts/<chosen-font>.woff2` (vendored)
- `public/css/typography.css` (или inline в head)
- `public/typo-test.html`
- Изменения в `public/index.html` (CSS rules)

---

## Direction 2 — App-wide theming (light/dark/auto)

**Концептуально:** премиум-продукт в 2026 ОБЯЗАН поддерживать тёмную тему. Сейчас тёмная тема есть только в feedback-модалке. Распространяем на весь интерфейс.

### Scope

- CSS-переменные на `:root` для палитры:
  - `--bg-page`, `--bg-card`, `--bg-elevated`
  - `--text-primary`, `--text-secondary`, `--text-muted`
  - `--border-soft`, `--border-medium`, `--border-strong`
  - `--accent`, `--accent-hover`, `--success`, `--warning`, `--danger`
  - `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- Базовая тёмная тема через `:root.theme-dark { ... }`.
- Auto-режим через `@media (prefers-color-scheme: dark)` + кнопка переключения.
- Persistent preference в `localStorage.appTheme_v1` (`light` / `dark` / `auto`).
- Переключатель `🌗` в IDE header и Classic toolbar (рядом с language selector).
- Аудит inline-styles в `index.html` — заменить hardcoded цвета (`#fff`, `#0f172a`, `#475569` etc.) на `var(--*)`. Это самая трудоёмкая часть.
- Density modes: `theme-compact`, `theme-comfortable` (default), `theme-spacious`. Применяется к глобальному `--space-unit`.

### Out of scope

- Custom user-defined themes (defer to next release).
- Full per-component theme overrides.

### Acceptance criteria

- [ ] Кнопка `🌗` в IDE и Classic переключает тему между light/dark.
- [ ] При первом запуске — auto-режим (по системным настройкам).
- [ ] Тёмная тема применяется ко **всем** главным экранам: Library, Dashboard, IDE workspace, Classic mode, SRS Trainer, Notes modal, Save-meta modal, Confirm modal, Feedback modal (уже есть).
- [ ] При переключении не должно «мигать» (нет flash-of-wrong-theme).
- [ ] Density modes доступны через настройки (или dropdown), сохраняются.
- [ ] Контраст текст/фон проходит WCAG AA на всех экранах.

### Test plan

- Включить dark, переключиться по всем главным экранам — визуально оценить контраст и читаемость.
- Включить auto, изменить системную тему — приложение должно реагировать.
- Перезагрузить — preference сохраняется.
- Density modes: переключить — проверить что layout не ломается.

### Effort

3–4 дня (большая часть — аудит inline-styles).

### Risk

Средний. Inline-styles разбросаны по всему `index.html` (27к строк). Есть риск что-то пропустить.

### Deliverables

- `public/css/theme.css` (variables + theme rules)
- Кнопка переключателя в обеих toolbar'ах
- JS-логика theme persistence + apply
- Аудит и refactor inline-styles в `public/index.html`
- i18n keys для названий тем

---

## Direction 3 — Full i18n coverage

**Концептуально:** сейчас `data-i18n` есть только в навигационных кнопках + feedback-модалке. Огромное количество строк (toast'ы, лейблы кнопок, error-сообщения, modal-заголовки) захардкожено на русском. Англоязычный или ивритоязычный юзер видит интерфейс **наполовину** на своём языке.

### Scope

- Аудит всех hardcoded русских строк в `public/index.html`.
- Перенос в `public/i18n/locales/{ru,en,he}.js` под namespace'ами по смыслу:
  - `app.*` — общее
  - `library.*` — библиотека (уже частично)
  - `dashboard.*` — дашборд (уже частично)
  - `ide.*` — IDE workspace (уже частично)
  - `srs.*` — SRS Trainer (уже частично)
  - `editor.*` — table editor + cells
  - `tts.*` — голос/настройки TTS
  - `audio.*` — audio prefetch / cache
  - `confirm.*` — confirm-модалка
  - `notes.*` — notes feature
  - `error.*` — error messages
  - `meta.*` — save-meta modal
- В JS-коде — использование `t('key', params)` вместо литералов.
- На статических элементах — `data-i18n`/`data-i18n-title`/`data-i18n-aria-label`.
- Listener на `i18n:changed` event для динамически отрендеренных компонентов.

### Out of scope

- Backend-сообщения сервера (они и так возвращают англ. error codes).
- Hebrew-контент пользователя (это его данные).

### Acceptance criteria

- [ ] При установке локали `en` — каждая UI-строка на английском.
- [ ] При установке локали `he` — каждая UI-строка на иврите + dir="rtl".
- [ ] Toast'ы, alert'ы, modal-заголовки, button-лейблы, placeholder'ы — все локализованы.
- [ ] Динамически отрендеренный контент (например, открытая Library, открытый текст в IDE) — обновляется при смене локали без перезагрузки.
- [ ] Нет visible literal русских строк в EN/HE режимах (тщательный визуальный pass).

### Test plan

- Переключиться на en, пройти ключевые сценарии: создать текст, открыть библиотеку, удалить, экспорт ZIP, SRS Trainer.
- Повторить на he — проверить что RTL не ломает ничего.
- Поиск по `index.html` на наличие кириллицы вне data-* атрибутов и комментариев.

### Effort

3–4 дня (механическая, но очень объёмная работа).

### Risk

Средний-высокий. Легко пропустить редко встречающиеся строки. Потребует тщательного аудита.

### Deliverables

- Расширенные `public/i18n/locales/{ru,en,he}.js` — добавлены сотни ключей.
- Refactor JS-кода в `public/index.html` — `t()` calls.
- Refactor статического HTML — `data-i18n` атрибуты.
- Скрипт-checker `tests/i18n_coverage_check.js` — ищет русские строки вне допустимых мест (комментарии, console.log).

---

# Sprint 2 — Daily-use polish

## Direction 4 — Onboarding & discovery

**Концептуально:** новый пользователь сейчас попадает на пустой экран без подсказок. Premium-продукт должен за первые 30 секунд показать, что он умеет.

### Scope

- **First-time flow**: при первом открытии приложения (нет ни одного текста в OPFS) — приветственный modal с:
  - Краткое объяснение «что это и зачем»
  - Кнопка «Попробовать на демо-тексте» — один клик загружает 3-5 sample предложений на иврите.
  - Кнопка «Начать с моего текста» — закрывает модал, ставит фокус на composer.
  - Чекбокс «Не показывать снова».
- **Spotlight tour** (опционально, после демо-загрузки): 3-5 шагов с подсветкой ключевых элементов:
  - Композер источника
  - Кнопка «Собрать таблицу»
  - Audio markers
  - Library
  - SRS Trainer
- **Contextual tooltips** на нетривиальных элементах: при наведении на audio marker впервые — короткая подсказка «Зелёный = в кэше». Показывается 1 раз per element, dismissable.
- **«What's new» modal** при значимых обновлениях (post-deploy version bump). Не приоритет для v3.1.0, но фундамент.
- **Sample data**: один Hebrew-text «Привет, мир» с 5-10 предложениями + готовое аудио — bundled в код.

### Out of scope

- Полноценный multi-step wizard.
- Анимированные video-tutorials.

### Acceptance criteria

- [ ] При первом открытии (`localStorage.onboardingSeen` отсутствует) — модал появляется.
- [ ] Демо-текст загружается, юзер видит таблицу с готовыми переводами + аудио.
- [ ] Spotlight tour покрывает 3-5 ключевых элементов.
- [ ] Tooltip'ы появляются ровно 1 раз per element, потом не повторяются.
- [ ] Кнопка «Сбросить onboarding» в Dashboard для повторного просмотра.

### Test plan

- Очистить localStorage, открыть приложение — видим модал.
- Кликнуть «Попробовать демо» — таблица заполнена, audio play работает.
- Закрыть модал, перезагрузить — модал не показывается.
- Reset onboarding в настройках — снова показывается.

### Effort

2–3 дня.

### Risk

Низкий. Изолированный новый компонент.

### Deliverables

- Новый компонент onboarding modal в `public/index.html`.
- Sample data в `public/onboarding/sample-text.json` (или inline).
- Sample audio в `public/onboarding/audio/*.mp3` (3-5 файлов).
- localStorage flag `onboardingSeen_v1`.
- i18n keys.

---

## Direction 5 — SRS + Library smart-sort

**Концептуально:** SRS Trainer и Library — главные daily-use экраны. Сейчас функциональны, но не «приятны».

### Scope

#### Library smart-sort & filters

- Существующий «Recently opened» фильтр уже есть.
- Новые smart-фильтры:
  - **«Struggling with»** — тексты где SRS error rate > 30%.
  - **«Mastered»** — все sentence карточки в SRS на final-stage.
  - **«New since last open»** — тексты с created_at > last visit.
- Persistent tag-filter chips в URL hash (deep-link-ability).
- Pinned/favorites — улучшить визуальный signal (золотая рамка / star badge).

#### SRS premium UX

- **Activity heatmap** в Dashboard: GitHub-style 7×~30 grid с активностью SRS-сессий за последние 30 дней. Цвет → интенсивность.
- **Inline-подсказка** «Next review in 3h» на SRS-карточке в Library + Dashboard.
- **Leech tagging**: автоматическая пометка карточек проигранных >5 раз через «again» — иконка 🐌 + предложение reset.
- **Hard / Good / Easy** кнопки с подсказкой следующего интервала ниже («Easy → +14 дней»).

### Out of scope

- Изменение SRS-алгоритма (Anki SM-2 уже работает).
- Multi-deck support.
- Custom card templates.

### Acceptance criteria

- [ ] Все 4 smart-фильтра работают, корректно фильтруют по реальным данным.
- [ ] URL hash отражает активный фильтр; при копировании URL — состояние восстанавливается.
- [ ] Activity heatmap отображается в Dashboard, показывает реальную активность.
- [ ] Leech-tag появляется автоматически после 5+ «again» на одной карточке.
- [ ] Hard/Good/Easy кнопки показывают предсказанный интервал.

### Test plan

- Создать 10+ текстов с разной историей SRS-сессий, проверить что фильтры показывают correct subset.
- Прогнать одну карточку через 5+ «again» — проверить leech tag.
- Проверить heatmap отражает реальные события `events` table.

### Effort

3–4 дня.

### Risk

Средний. Нужно добавить SQL-aggregations над уже существующими таблицами.

### Deliverables

- Новые helper'ы в `public/db/local-db.js`: `getStrugglingTexts()`, `getMasteredTexts()`, `getActivityHeatmap()`, `getCardLeechStatus()`.
- UI компоненты для smart-фильтров в Library.
- Activity heatmap component в Dashboard.
- Hard/Good/Easy interval calculator на стороне SRS Trainer.
- i18n keys.

---

## Direction 6 — Error gentleness app-wide

**Концептуально:** после Tier 1.2 escape-hatch на тоастах работает в feedback-модалке. Но в остальном приложении ещё много `alert()` / `window.confirm()`. Premium-продукт не использует браузерные blocking-диалоги.

### Scope

- **Аудит** всех `alert()` и `window.confirm()` в `public/index.html`.
- Заменить:
  - `alert(msg)` → `showToast(msg, 'error')` или inline-сообщение в контексте.
  - `confirm(msg)` → `v3ConfirmModal({...})` (он уже premium).
- **Saved-state indicators**: на активной карточке header → `✓ Сохранено 2с назад` (live-обновление).
- **Optimistic UI** для save/delete/edit: UI рисует «сделано» мгновенно; при ошибке откат через `v3UndoToast` (паттерн уже есть в B3).
- **Loading skeletons** на list-views: Library, Dashboard, SRS Trainer — при загрузке вместо spinner — skeleton-rows.

### Out of scope

- Полная замена UX-флоу (только error-handling layer).

### Acceptance criteria

- [ ] В `public/index.html` нет ни одного `alert(...)` или `window.confirm(...)` (кроме тестовых helper'ов).
- [ ] Все destructive actions используют `v3ConfirmModal`.
- [ ] Save-операции показывают индикатор сохранения в активной карточке.
- [ ] Главные list-views показывают skeleton при загрузке.

### Test plan

- Grep `public/index.html` на `alert(` и `\.confirm(` — ожидаем 0 совпадений (кроме комментариев).
- Прогнать flow: создать текст, сохранить, удалить — на каждом шаге видим toast/modal вместо alert.
- Включить throttling сети в DevTools, открыть Library — увидеть skeleton.

### Effort

2–3 дня.

### Risk

Низкий-средний. В основном механическая замена, но требует careful testing.

### Deliverables

- Refactor всех `alert/confirm` callsites в `public/index.html`.
- Saved-state indicator component.
- Skeleton CSS classes (есть базовые в feedback-модалке — расширить).
- Hooks в save/delete/edit функциях для optimistic UI.

---

# Sprint 3 — Performance + Trust

## Direction 7 — Performance / PWA

**Концептуально:** `index.html` это 27к-строк монолит. Грузится всё сразу. На mobile это медленно при первом открытии. После Phase 6 приложение архитектурно offline-first, но фронт — нет (нужен интернет для статики на cold start).

### Scope

- **Code splitting**: разбить `public/index.html` на модули. Через `<script type="module">` + dynamic imports:
  - Dashboard module → loaded on first dashboard open.
  - SRS Trainer module → loaded on first trainer open.
  - Diagnostic page → loaded on demand.
  - IDE workspace already supported по separate path (если есть).
- **JSZip lazy-load**: только при export/import ZIP. Сейчас грузится всегда.
- **Service Worker**:
  - Precache: `index.html`, css, core JS, fonts, qrcode, jszip (когда нужны).
  - Runtime cache: stale-while-revalidate для статики.
  - Network-first для `/api/*`.
- **PWA manifest**:
  - `manifest.json` с name, short_name, description, icons (192px, 512px), theme_color, background_color, display=`standalone`.
  - Splash screen для iOS (apple-touch-icon).
  - Apple-mobile-web-app-capable.

### Out of scope

- Server-side rendering (overkill для offline-first).
- Push notifications (отдельная задача).
- Background sync (deferred).

### Acceptance criteria

- [ ] First load на mobile (3G simulation) < 3 секунды до interactive.
- [ ] После первой загрузки — приложение работает оффлайн (HTML/CSS/JS из кэша).
- [ ] Lighthouse PWA score ≥ 90.
- [ ] Установка на iOS/Android home screen работает (видна иконка, splash).
- [ ] Динамические features (Dashboard, SRS Trainer) грузятся по требованию.

### Test plan

- Lighthouse audit (Performance, PWA, Accessibility, Best Practices, SEO) — ≥ 90 на всех.
- DevTools Network → throttle to "Slow 3G", очистить cache, измерить TTI.
- DevTools → Application → Manifest — корректная конфигурация.
- DevTools → Application → Service Workers — registered, controlling.
- Install prompt на Chrome desktop — работает.

### Effort

4–5 дней.

### Risk

Высокий. Code splitting в монолитном `index.html` — серьёзный refactor. Может сломать существующее.

### Deliverables

- `public/sw.js` (Service Worker)
- `public/manifest.json`
- `public/icons/icon-192.png`, `icon-512.png` (или favicon.ico → derive)
- Refactored `public/index.html` с dynamic imports
- Build/bundling script (опционально — если используем bundler).

---

## Direction 8 — Trust signals + content polish

**Концептуально:** premium-продукты ясно говорят: «вот ваши данные, вот разработчик, вот версия». Эта прозрачность — отличие OSS-инструмента от случайного веб-приложения.

### Scope

- **Footer** на каждом экране:
  - Badge `🔒 Данные на этом устройстве` — link на `/docs/OPFS_USER_GUIDE.md`.
  - Version + commit hash («LinguistPro v3.1.0 · build abc123»).
  - «Made with ❤️ by Sindrom Radio» attribution.
  - Open-source / GitHub link.
  - Privacy policy link (минимальный текст в `/docs/PRIVACY.md`).
- **About modal**: при клике на logo / version → открывается с full credits, license, dependencies.
- **README.md polish**: на главной репо — скриншоты главных экранов, краткое описание, getting-started, link на live demo.
- **CHANGELOG.md presentation**: уже есть, добавить screenshot diff'ы для major versions.
- **FAQ extension**: текущий micro-FAQ в feedback-модалке — расширить до полноценного `/faq` page с 10-15 пунктами.

### Out of scope

- Полноценный landing page / маркетинг сайт.
- Documentation site (Docusaurus etc.).

### Acceptance criteria

- [ ] Footer виден на всех экранах (Library, Dashboard, IDE, Classic, SRS).
- [ ] About modal содержит version, license, link на repo, list of dependencies.
- [ ] `README.md` содержит ≥ 3 screenshots, getting-started, live demo link.
- [ ] `/docs/PRIVACY.md` существует и доступен через footer link.
- [ ] FAQ-page (или modal) содержит ≥ 10 вопросов.

### Test plan

- Визуально пройти по всем экранам, убедиться что footer присутствует.
- Открыть About modal — проверить content.
- Открыть README на GitHub — проверить screenshots грузятся.

### Effort

1–2 дня.

### Risk

Низкий. Аддитивный, не ломает existing.

### Deliverables

- Footer component (CSS + HTML).
- About modal.
- `docs/PRIVACY.md`.
- `README.md` polish.
- FAQ page или extended modal.
- `public/icons/` (favicon, apple-touch-icon).

---

# Quality gates

## Перед merge каждого направления

- [ ] Syntax check passed: `node -c server.js` + inline-script parse.
- [ ] i18n locale validation: новые ключи присутствуют во всех 3 языках.
- [ ] Манul smoke на desktop Chrome: главные сценарии работают.
- [ ] Manual smoke на mobile (или DevTools mobile mode): touch UX не сломан.
- [ ] Existing tests (`/db/db-init-test.html`) проходят.
- [ ] Если direction touches OPFS-данные — `tests/verify_zip_android_compat.js` валидирует export.

## Перед закрытием релиза v3.1.0

- [ ] Все 8 directions помечены как done в этом плане.
- [ ] Полный регрессионный pass: каждый сценарий из user-guide проходит.
- [ ] Lighthouse: Performance / Accessibility / Best Practices / PWA / SEO — все ≥ 90.
- [ ] Mobile dogfood pass: iPhone + Android + Desktop Chrome.
- [ ] Cross-device ZIP roundtrip ещё раз протестирован (web ↔ Android v2).
- [ ] Все три locale полностью покрыты (нет visible-literal hardcoded строк).
- [ ] Dark theme pass: каждый главный экран проверен в обоих режимах.
- [ ] CHANGELOG.md обновлён.
- [ ] Version bump в `package.json` → `3.1.0`.
- [ ] Git tag `v3.1.0` создан.
- [ ] GitHub Release с release notes опубликован.

---

# Audit checklist (финальный пасс)

После завершения всех 8 directions — глубокий аудит по этому checklist'у. Только если ВСЁ зелёное — релиз готов.

## Visual quality
- [ ] Hebrew typography: огласовки рендерятся идеально на всех экранах.
- [ ] Dark theme: контраст текст/фон ≥ 4.5:1 везде.
- [ ] Empty states: каждый пустой list имеет дизайн + CTA.
- [ ] Loading states: skeleton'ы где нужно, нет «голых» spinner'ов.
- [ ] Animations: соблюдают `prefers-reduced-motion`.

## Functional quality
- [ ] Все главные flow'ы работают: создать текст / сохранить / открыть / удалить / undo / экспорт ZIP / импорт ZIP / SRS-сессия / Anki push / feedback send.
- [ ] Mobile UX: drawer-модалки выезжают корректно; touch targets ≥ 44px.
- [ ] Offline после первой загрузки: всё кроме TTS работает без интернета.
- [ ] PWA install: иконка устанавливается на home screen.

## i18n quality
- [ ] Locale switch работает мгновенно, не требует reload.
- [ ] EN, HE — нет visible-literal русских строк.
- [ ] HE: dir="rtl" на всех модалках, стрелки и иконки развёрнуты корректно.

## Trust quality
- [ ] Footer на всех экранах с privacy badge + version.
- [ ] About modal доступен.
- [ ] FAQ extended.
- [ ] README на GitHub содержит screenshots.

## Premium feel
- [ ] Никаких `alert()` / `confirm()` в `public/index.html`.
- [ ] Toast'ы цветовые (success/warning/error/info) везде.
- [ ] Saved-state indicators на активных карточках.
- [ ] Optimistic UI на mutate-операциях.
- [ ] Tooltips на нетривиальных элементах.

## Regression check
- [ ] OPFS data integrity: после всех изменений `PRAGMA integrity_check` возвращает ok.
- [ ] Cross-device ZIP roundtrip: web → Android v2 → web без потери данных.
- [ ] Existing 16 tests в `db-init-test.html` все зелёные.
- [ ] No 410 регрессий: stateless эндпоинты (`/api/transliterate`, `/api/export/docx`, etc.) работают.

---

# Recommended order

```
1. Hebrew typography & RTL          (Sprint 1, foundation)
2. App-wide theming                 (Sprint 1, foundation)
3. Full i18n coverage               (Sprint 1, foundation — биззи, но обязательный)

4. Onboarding & discovery           (Sprint 2, daily-use)
5. SRS + Library smart-sort         (Sprint 2, daily-use)
6. Error gentleness app-wide        (Sprint 2, daily-use)

7. Trust signals + content polish   (Sprint 3, low-risk addtitive — делать перед PWA)
8. Performance / PWA                (Sprint 3, last because it's heavy refactor)
```

**Почему такой порядок:**
- Sprint 1 — фундамент. Без typography/theming/i18n остальные направления будут «забивать гвозди в фундамент, которого нет».
- Sprint 2 — daily-use полировка. После фундамента эти экраны автоматически получают consistency.
- Sprint 3 — **#8 Trust signals — ПЕРЕД #7 Performance**, потому что trust signals — мелкий аддитивный код, а performance — heavy refactor. Лучше сначала залить лоск, потом рискованный перебор.

---

# Что явно deferred

- **C2 Cloud sync** — без user-signal делать смысла нет.
- **C3 A/B framework** — нужны метрики и трафик.
- **Feedback Tier 3** (rrweb, voice notes, smart suggestions) — wait for real submission data.
- **Custom user themes** — после baseline theming.
- **Multi-deck SRS support** — отдельный epic.
- **Server-side TTS quota dashboard** — для админов, не для юзеров.
- **Marketing landing page** — отдельный проект.

---

# Live status

> Обновляется по мере реализации. Каждое направление — `[ ]` planned → `[~]` in-progress → `[x]` done.

**Session 1 (2026-05-09):**

- [x] **Direction 1** — Hebrew typography & RTL — *complete*. CSS-инфраструктура (@font-face + premium rendering + multi-tier fallback) shipped. Self-hosted woff2 (3 шрифта × 3 веса = 9 файлов, ~167 KB total) положены в `public/fonts/` (commit session 2). Visual regression page `/typo-test.html`.
- [x] **Direction 2** — App-wide theming — *complete*. CSS-variable foundation на `:root` (12 светлых + 12 тёмных переменных + shadow trio + density tokens); три режима — `light` / `dark` / `auto` (по системе) с persistent в `localStorage.appTheme_v1`; pre-paint inline boot блокирует FOWT (Flash Of Wrong Theme); toggle `🌗` в IDE header + Classic toolbar (cycle auto→light→dark); inline-style overrides для hardcoded `#fff`, `#0f172a`, `#475569` и т.п. через `body.theme-dark [style*="..."]` selectors с `!important` (баланс между «не трогать существующие inline-стили» и «всё работает в dark»); density modes (compact/comfortable/spacious) через `body.theme-density-*` + `localStorage.appDensity_v1`; live-react на изменения OS-темы через `matchMedia`. Локали ru/en/he.
- [~] **Direction 3** — Full i18n coverage — *Phase 1 partial* (Сессия 4): smart-chip strings + 8 high-traffic toasts мигрированы (textPasted, clipboardEmpty/Unavailable/ReadFailed, textArchived, archiveFailed, textDeleted, restored). **Phase 2 deferred:** ещё ~139 hardcoded `showToast("…")` callsites (плейлист, аудио ошибки, импорт/экспорт edge-cases) — отдельная сессия (~1-2 дня механической миграции). Существующая i18n инфраструктура зрелая (toast.* namespace + applyI18n), Phase 2 — продолжение паттерна.
- [x] **Direction 4** — Onboarding & discovery — *complete*. First-time welcome modal с двумя CTA («Попробовать на демо» / «Начать с моего текста»), inline 5-предложение Hebrew demo с автоматической установкой языка he-IL, persistent decision via `localStorage.onboardingSeen_v1`, кнопка «Сбросить onboarding» в About modal для повторного показа. 3 локали (ru/en/he).
- [x] **Direction 5** — SRS + Library smart-sort — *complete*. Activity heatmap в Dashboard (Сессия 2). Library smart-filter UI (Сессия 4): 4 чипа `⏱ Недавние / 🔥 Сложные / ✓ Освоено / ✨ Новые`, persistent в URL hash (`#smart=struggling`), one-click ✕ clear, mobile-responsive (2-up grid на ≤600px), full theme-aware. Last-visit timestamp tracked in `localStorage.v3LibraryLastVisit_v1` для "Новые с прошлого визита" фильтра. Foundation helpers в local-db: `getActivityHeatmap`, `getStrugglingTexts`, `getMasteredTexts`, `getTextsCreatedAfter`.
- [x] **Direction 6** — Error gentleness app-wide — *complete*. Все active-path alert/confirm callsites переведены на v3ConfirmModal/showToast. Остались только 3 fallback-path вызова (внутри самого v3ConfirmModal-ultimate-fallback, в feedback Phase6 alert try-catch, в WA-confirm fallback) — они срабатывают только если premium-modal недоступен. Все локали ru/en/he покрыты.
- [ ] **Direction 7** — Performance / PWA — *not started*. Heavy refactor (code splitting, SW, manifest).
- [x] **Direction 8** — Trust signals + content polish — *complete*. Footer на всех экранах, About modal, `docs/PRIVACY.md`, version из package.json через `/api/client-config`.

---

# Финальный отчёт

После завершения всех 8 directions — отдельный раздел в этом файле или в `CHANGELOG.md` с:

- Что сделано (per direction).
- Что обнаружено в audit (если что-то).
- Что оставлено deferred (если что-то).
- Метрики (Lighthouse scores, file size, regression count).
- Pre/post скриншоты ключевых экранов.

Релиз `v3.1.0` шипается **только** после полного зелёного audit'а.
