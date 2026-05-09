<div align="center">

<img src="public/icons/icon-512.png" alt="LinguistPro" width="160" height="160">

# LinguistPro

### Премиум-рабочее место для изучения иврита

**Hebrew ↔ Russian / English** · offline-first · PWA · open source

[![Version](https://img.shields.io/badge/version-3.1.0-2563eb?style=flat-square)](https://github.com/SindromRadioSpb/tts-prototype-android/releases/tag/v3.1.0)
[![PWA](https://img.shields.io/badge/PWA-installable-0f172a?style=flat-square)](docs/PWA.md)
[![Offline-first](https://img.shields.io/badge/offline-first-d97706?style=flat-square)](docs/OPFS_USER_GUIDE.md)
[![i18n](https://img.shields.io/badge/i18n-RU%20%C2%B7%20EN%20%C2%B7%20HE-94a3b8?style=flat-square)](public/i18n/locales)

[**User guide**](docs/OPFS_USER_GUIDE.md) · [**PWA setup**](docs/PWA.md) · [**Privacy**](docs/PRIVACY.md) · [**Changelog**](CHANGELOG.md)

</div>

---

## Что это

LinguistPro — это **полноценный учебный workspace** для изучения иврита, построенный вокруг одной идеи: **ваши данные принадлежат только вам**. Тексты, аудио, прогресс, заметки — всё хранится прямо в браузере (OPFS + SQLite WASM), не на чужих серверах. Облако используется только для тяжёлых вычислений: TTS-озвучки и нейронного перевода.

В отличие от приложений-учебников, которые ведут вас по жёсткому курсу, LinguistPro даёт **редактор для работы с любым ивритским текстом**: вставьте абзац — получите таблицу с никудом, транслитерацией, переводом и аудио по строкам. Работайте по строкам, выделяйте сложные предложения в карточки SRS, тренируйтесь, отслеживайте прогресс.

> Подходит тем, кто учит иврит по реальным текстам — статьям, песням, литературе, разговорам. Не подходит тем, кто хочет gamified-флоу с achievements.

---

## Почему стоит попробовать

### 🇮🇱 Иврит как основной язык, не локализация
- **Premium Hebrew typography** — три self-hosted шрифта (Frank Ruhl Libre / Assistant / Noto Sans Hebrew), правильный рендеринг **никуда** на всех платформах, full RTL.
- Каждая строка — `bdi`-изолированный mixed-content (иврит + русский + английский в одной строке без bidi-багов).
- Edge-case visual regression page `/typo-test.html` со всеми сложными комбинациями огласовок.

### 🔒 Offline-first, ваши данные у вас
- Вся библиотека — в **OPFS** (Origin Private File System) браузера. SQLite WASM (`wa-sqlite`) запускается прямо в браузере, без серверного посредника.
- Серверные stateful-эндпоинты возвращают **`410 Gone`** — архитектурно невозможно «случайно» отправить ваши данные кому-то.
- ZIP-bundle export/import — полная резервная копия (тексты + аудио в одном `.zip`), формат **совместим с нативным Android-приложением v2** (cross-device roundtrip).
- Storage quota monitoring (80% / 95% threshold), per-text rollback при ошибках импорта, in-memory undo на 7 секунд для удалений.

### 📦 Установка как нативное приложение
- **PWA installable** на iOS, Android, Windows, macOS. Standalone-окно, иконка на home screen, splash screen.
- **Полностью оффлайн** после первой загрузки — Service Worker precache'ит весь shell, шрифты, БД-слой, локали.
- Premium update lifecycle: новая версия не подменяется молча — пользователь видит toast «Доступно обновление» с кнопкой «Обновить».

### 🧠 SRS-тренажёр уровня Anki, в браузере
- Алгоритм **SM-2** (как в Anki), интервалы Hard/Good/Easy с предсказанием следующего интервала.
- **Activity heatmap** в Dashboard (GitHub-style сетка за 30 дней).
- **Smart-фильтры в библиотеке**: 🔥 Сложные / ✓ Освоено / ✨ Новые с прошлого визита / ⏱ Недавние. Persistent в URL hash — отправляешь ссылку, состояние восстанавливается.
- **Manual smart-tag override** — даже если SRS считает текст «освоенным», можно вручную пометить его как сложный (или наоборот).
- Anki-экспорт с кастомной моделью **`LinguistPro SRS Card v1`** + fuzzy grading.

### 🎙 Professional TTS
- Google Cloud Text-to-Speech (Hebrew premium voices), потокового качества.
- Audio prefetch — пакетная подготовка озвучки всех строк таблицы за раз, кэшируется локально.
- Опциональная интеграция Sherpa-ONNX для local neural TTS (offline-озвучка без облака).
- Per-card TTS profile (voice + rate + pitch) — каждый текст помнит свой звуковой стиль.

### 🌗 Premium UX, не прототипный
- **App-wide light/dark/auto theming** через CSS-variables, с pre-paint bootstrap (нет Flash Of Wrong Theme).
- **Density modes** (compact / comfortable / spacious) — адаптируйте плотность под свой экран.
- **Mobile-native feel**: drawer-модалки, bottom sheets, touch targets ≥ 44px, haptic-style feedback.
- **Onboarding** для первого визита: демо-текст в один клик, объяснение «что и зачем» за 30 секунд.
- **Premium error gentleness** — никаких `alert()` / `window.confirm()`, всё через мягкие toast'ы и custom-modals с undo.
- **Optimistic UI** — изменения видны мгновенно, откат при ошибке через 7-секундный undo-toast.

### 🌍 Real i18n, не маркетинг
- **Три локали:** русский, английский, **עברית** (с автоматическим RTL-переключением dir).
- **100% покрытие**: все toast'ы, кнопки, модалки, заголовки, placeholder'ы, aria-labels — переводятся.
- Переключение мгновенное, без перезагрузки. Динамически отрендеренный контент реагирует на `i18n:changed` event.

---

## Скриншоты

> Скриншоты — на отдельной странице, чтобы README быстро грузился.
> Pages: [`docs/SCREENSHOTS.md`](docs/SCREENSHOTS.md) *(добавляются по мере выпуска версий)*.

---

## Quick start

### Использовать как пользователь

Открой production-инстанс LinguistPro → нажми «Попробовать на демо-тексте» → дальше работай со своими текстами. На втором заходе можно установить как PWA: в Chrome → меню → «Установить приложение». На iOS — Safari → Share → «Add to Home Screen».

### Запустить локально (development)

```bash
git clone https://github.com/SindromRadioSpb/tts-prototype-android.git
cd tts-prototype-android
npm install
npm start
# открой http://localhost:3000
```

Для TTS и AI-перевода нужны ключи Google Cloud (TTS + Translate / Gemini). Положи их в `data/gcp-tts-key.json` / `data/gcp-translate-key.json` или загрузи через UI на странице настроек. Без ключей весь UI работает — просто кнопки TTS и «Собрать таблицу» вернут понятные ошибки.

Подробнее: [`docs/CONFIG.md`](docs/CONFIG.md).

---

## Что внутри

| Слой | Технология |
|------|-----------|
| Frontend | Vanilla JS + ES modules + CSS variables. Без framework'а — сознательное решение, чтобы remained debug-able и lightweight. |
| Local DB | **wa-sqlite** (SQLite в WASM) поверх **OPFS**. 21 миграция, integrity-check on startup. |
| TTS | Google Cloud Text-to-Speech (cloud) + Sherpa-ONNX (local, optional). Pluggable backend layer. |
| Translation | Google Translate v3 + Gemini (premium pipeline). Stateless API, retry с exponential backoff. |
| Server | Node.js + Express. **Stateless после v3.0.0** — все user data в OPFS, сервер только TTS/translate/transliterate proxy + static files. |
| PWA | Service Worker (precache + SWR + network-first для config), manifest.json, install prompt UX. |
| i18n | Lightweight in-house module. `data-i18n` attributes + `t(key, params)` resolver. 3 locale файла + один `applyI18n` event. |
| Hebrew | Hebrew transliteration via `hebrew-transliteration` (npm) — SBL, ASCII, IPA профили. Custom premium pipeline в `tests/premium/`. |

---

## Архитектурные решения

### Почему OPFS + SQLite WASM, а не сервер
До v3.0.0 библиотека жила на сервере. После аудита приватности данных мы инвертировали архитектуру: **сервер не должен видеть, что вы учите**. OPFS даёт серверный объём (миллионы строк, сотни мегабайт аудио) при браузерной приватности. SQLite WASM позволяет сложные queries (joins, aggregations) над локальными данными без edge-кейсов IndexedDB.

Полный план миграции — [`docs/OPFS_MIGRATION_PLAN.md`](docs/OPFS_MIGRATION_PLAN.md).

### Почему монолитный `index.html`
Это сознательный compromise. Frontend — vanilla JS без bundler'а. Это даёт прозрачную debug-experience (один файл — `view source` показывает всё, что происходит) и нулевые runtime-зависимости. Минус — большой initial parse. Service Worker precache + lazy-load JSZip/qrcode балансируют это в v3.1.0. Functional code-split в отдельные ES-модули — на v3.2.

### Почему нет cloud sync
Cloud sync **не запланирован**. Архитектура offline-first была бы скомпрометирована. Если нужна копия — `Library → Скачать ZIP-бэкап`, файл переносится между устройствами вручную. Cross-device ZIP roundtrip полностью совместим с нативным Android-приложением v2.

---

## Документация

| Документ | Что внутри |
|----------|-----------|
| [`docs/OPFS_USER_GUIDE.md`](docs/OPFS_USER_GUIDE.md) | Где живут данные, как сделать backup, kill switch, FAQ. |
| [`docs/PWA.md`](docs/PWA.md) | Install, offline behaviour, update lifecycle, troubleshooting, cache versioning. |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | Privacy policy: что отправляется в облако, что нет. |
| [`docs/PREMIUM_RELEASE_PLAN_v3_1.md`](docs/PREMIUM_RELEASE_PLAN_v3_1.md) | План v3.1.0 — 8 directions, audit checklist, что deferred. |
| [`docs/STORAGE_CONTRACT.md`](docs/STORAGE_CONTRACT.md) | Контракт локального хранилища (формат БД, аудио, ZIP-bundle). |
| [`docs/DB_SCHEMA.md`](docs/DB_SCHEMA.md) | Схема SQLite + миграции. |
| [`docs/CONTRACTS_*.md`](docs/) | Контракты подсистем: Navigation, Search, SRS, Analytics. |
| [`docs/CONFIG.md`](docs/CONFIG.md) | Environment variables, ключи Google Cloud, локальные артефакты. |
| [`docs/SMOKE-CHECK.md`](docs/SMOKE-CHECK.md) | Smoke checklist перед merge. |
| [`CHANGELOG.md`](CHANGELOG.md) | История версий. |

---

## Релизы

- **v3.1.0** (2026-05-10) — Premium polish release. Hebrew typography, app-wide theming, full i18n, onboarding, smart-sort, error gentleness, PWA, trust signals. **8 directions, все [x]**. См. [`CHANGELOG.md`](CHANGELOG.md#310--2026-05-10).
- **v3.0.0** (2026-05-08) — Offline-first OPFS architecture flip. См. [`CHANGELOG.md`](CHANGELOG.md#300--2026-05-08).

---

## Backwards compatibility

LinguistPro следует [SemVer](https://semver.org/). Major-релизы могут менять формат данных, но всегда поставляются с миграцией (browser-side migration runs автоматически при upgrade). ZIP-bundle формат стабилен с v3.0.0 (unified Android v2 spec) — экспорт из любой версии ≥ 3.0.0 импортируется в любую версию ≥ 3.0.0.

---

## Roadmap

### Что уже есть в v3.1.0
Все 8 directions из [Premium Release Plan v3.1.0](docs/PREMIUM_RELEASE_PLAN_v3_1.md) закрыты: Hebrew typography & RTL, app-wide theming, full i18n, onboarding, SRS + Library smart-sort, error gentleness, performance/PWA, trust signals.

### Deferred → v3.2
- **Functional code-split** (Dashboard / SRS / IDE → отдельные dynamic-import ES-модули) — требует extraction inline `<script>` из 30k-line монолита. Пропущено в v3.1.0 ради стабильности; v3.1.0 шипает PWA как продукт, не как архитектурный refactor.
- **Sherpa adapter lazy-load** — небольшая экономия на cold start, но в чувствительной TTS startup-sequence.

### Deferred long-term (без user signal)
- **Cloud sync** — без явного запроса не делается, противоречит offline-first.
- **A/B framework** — нужны метрики и трафик.
- **Multi-deck SRS support** — отдельный epic.
- **Push notifications** — нужны use-case и backend infra.

Полный список deferred + обоснования — в [`docs/C_SERIES_PLAN.md`](docs/C_SERIES_PLAN.md).

---

## Contributing

Issues и feedback приветствуются. Перед PR прочитайте:
- [`docs/SMOKE-CHECK.md`](docs/SMOKE-CHECK.md) — smoke checklist перед merge.
- [`docs/STORAGE_CONTRACT.md`](docs/STORAGE_CONTRACT.md) — контракт хранилища (если меняете БД-слой).
- [`docs/CONTRACTS_*.md`](docs/) — контракты конкретных подсистем (если меняете SRS / Search / Navigation / Analytics).

Принцип: **контракт важнее реализации**. Реализация должна соответствовать контракту, не наоборот.

Внутри приложения тоже есть feedback-канал: меню → 📬 Связаться с разработчиком (WhatsApp-first, с QR-кодом для desktop).

---

## License

См. About-modal внутри приложения — там перечислены LinguistPro и все зависимости с их лицензиями (MIT для большинства).

Made with ❤️ by **Sindrom Radio** · [GitHub](https://github.com/SindromRadioSpb/tts-prototype-android)
