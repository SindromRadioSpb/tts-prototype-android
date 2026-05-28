# Глава 3 — System Design

> **Статус.** ЧЕРНОВИК ЗАВЕРШЁН (sequential drafting по согласованной cadence 2026-05-22).
> **Целевая длина.** ~12 страниц (BRIEF §3 диапазон 10–15).
> **Bilingual workflow.** RU mirror EN-канонического `thesis/03_system_design.md`. Sync invariant по `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Glossary.** `thesis/GLOSSARY.md`.
> **Источники.** `docs/ULPAN_RESEARCH_PLAN_v3_2.md §2 + §5`, `docs/PRODUCT_COHESION_PLAN_v3_4.md`, `docs/PREMIUM_RELEASE_PLAN_v3_3.md`, `docs/SMART_LEARNING_GRAPH_ROADMAP_v3_6.md`, `docs/MOBILE_UX_REDESIGN_PLAN_v3_7.md`, `docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`, `docs/PREMIUM_NOTES_PLAN_v3_2.md`, `docs/TEXT_CARD_PLAN_v3_2.md`, `docs/OPFS_MIGRATION_PLAN.md`, `docs/PILOT_READINESS_GATE_v3_6.md`, `docs/SRS_STRATEGY_v3_2.md`, `docs/CLAUDE.md`, `README.md`, и сама кодовая база.
> **Стилистические соглашения.** Академическое «мы»; цитирование APA 7; маркеры `[TODO: процитировать X]`.
> **Последнее обновление.** 2026-05-22 (черновик завершён).

---

## 3.1 Введение и архитектурная философия

Эта глава описывает систему LinguistPro в том виде, в котором она существует на момент эмпирического исследования, представленного в Главах 5–6: privacy-preserving, offline-first, open-source workspace для изучения иврита, развёрнутый как Progressive Web Application с опциональной research-mode агрегацией. Глава организована таким образом, чтобы сделать архитектурные решения Главы 4 (privacy-preserving research-mode) и методологические выборы Главы 5 (эмпирическое исследование) понятными на фоне более широкой системы, в которой они находятся.

Архитектура формируется тремя философскими обязательствами, задокументированными в README проекта и в его планирующих документах: **(i) суверенитет данных** — библиотека пользователя, audio-кэш, заметки и прогресс живут в браузере пользователя, не на удалённом сервере; **(ii) иврит-как-первый-язык**, а не как локализационная пристройка — типографика, RTL-рендеринг, никуд и морфология обрабатываются как первичные продуктовые affordance; и **(iii) итеративное уточнение по реальным педагогическим наблюдениям** — система эволюционировала через версии 3.0 до 3.7 в ответ на идентифицированные точки трения изучения в ульпане, а не из единой up-front спецификации.

Мы описываем эти обязательства и их архитектурные последствия в §3.3, результирующую доменную архитектуру в §3.4, и интеграцию research-mode подсистемы в §3.5. UI-архитектура (§3.6), data-архитектура (§3.7), и build / deployment (§3.8) закрывают главу.

## 3.2 Эволюция системы: v3.0 → v3.7

Текущая форма LinguistPro — результат семи major-version циклов, каждый из которых адресовал конкретную педагогическую или архитектурную проблему, идентифицированную через iterative использование. Мы суммируем эволюцию, потому что система не была designed up-front — сам путь является частью вклада.

- **v3.0 (Offline-first миграция, 2026-05-08).** Система мигрировала с server-mediated storage model на OPFS (Origin Private File System) + SQLite WebAssembly, завершив то, что внутренне называется Phase 6 OPFS migration plan [TODO: процитировать `docs/OPFS_MIGRATION_PLAN.md`]. После v3.0 stateful серверные endpoint'ы стали `410 Gone`; библиотека пользователя, аудио, заметки и SRS-state жили полностью в браузере. Privacy posture Главы 4 наследует прямо из этой миграции: research-mode — архитектурное исключение из нормы «no server state», а не default.

- **v3.1 (Premium polish).** Audio handling, premium Hebrew typography (три self-hosted шрифта), и RTL stability через mixed-content rows. CSS surface стабилизировался как ~39 000-строчный `public/index.html` с задокументированными pitfalls (mobile-override `button { width: 100% }`; mobile-first `@media` block ordering против компонентного CSS), записанными в `docs/CLAUDE.md`.

- **v3.2 (Mega-release: Premium Notes + Text-card + Research-mode, 2026-05-13).** Три скоординированных direction'а: полиморфные typed-graph notes (Direction 9), three-mode система text-card sharing (Direction 10: Mode A bulk builder / Mode B peer-share через lightweight JSON / Mode C curator request), и opt-in research-mode (Direction 11). Research-mode shipped архитектурно полным (Direction 11B закрыт 2026-05-13) и детально описан в Главе 4. Morphology shipped на 34K стемах / 68K анализах с полным 250K словарём отложенным к более позднему патчу.

- **v3.3 (Master plan + admin polish).** Master plan `docs/PREMIUM_RELEASE_PLAN_v3_3.md` консолидировал direction'ы. Полный 250K hspell-derived морфологический словарь shipped 2026-05-14 (493 398 entries / 685 632 analyses, 4.24 MB gzipped, кэшированный в dedicated Service Worker bucket). Multicohort teacher dashboard и cross-text «Where occurs» hub приземлились в v3.3.2. Calibrated диагностический квиз (Direction 13, `ulpan_diagnostic_v1`) shipped под provisional sign-off в v3.3.5.

- **v3.4 (Отложено).** Anki Connect bidirectional sync, premium SRS Trainer (FSRS algorithm с audio-anchored review), и C-series peer-comparison disambiguation. Roadmap `docs/PRODUCT_COHESION_PLAN_v3_4.md` консолидирует эти вещи.

- **v3.5 (Dogfood prototype fixes).** Auto-text backbone, render-don't-blank invariant, и `[[` quick-link opening flow.

- **v3.6 (Smart Learning Graph, 2026-05-17).** Локальная read-only graph visualization заметок / текстов / корней / биньянов с `note_link_suggestions` как retrieval-practice instrument. Pilot-readiness gate пройден [TODO: процитировать `docs/PILOT_READINESS_GATE_v3_6.md`].

- **v3.7 (Mobile UX redesign, 2026-05-18).** Одиннадцать UX issues адресованы через mobile-first refactor; описан в §3.6.2.

Дипломное исследование, описанное в Главах 5–6, развёртывается против v3.7 build, замороженного на tag `v3.7.0-pilot` для cohort lockstep по `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md`.

## 3.3 Основные архитектурные принципы

### 3.3.1 Offline-First (OPFS + SQLite WebAssembly)

Библиотека пользователя, audio-кэш, заметки, SRS-state и engagement-события живут полностью в Origin Private File System браузера — per-origin приватной файловой системе, exposed для веб-приложений через File System Access API [TODO: процитировать спецификацию WHATWG OPFS]. SQLite скомпилирован в WebAssembly через библиотеку `wa-sqlite` и запускается в браузере, предоставляя relational query capability без серверного hop'а. Основное следствие — что пользователь может использовать LinguistPro неограниченно без интернет-соединения, за исключением cloud-only resources §3.3.3 (TTS, translation). Кэшированное аудио и кэшированные переводы остаются функциональны offline после получения.

### 3.3.2 Progressive Web Application

Приложение устанавливается на desktop и mobile браузеры как PWA, предоставляя offline-кэш через Service Worker, install-on-add-to-home-screen UX, и standalone window mode без browser chrome [TODO: процитировать `docs/PWA.md`]. Стратегии кэширования Service Worker настроены per resource class: статические ресурсы прекэшируются при установке; HTML и locale-файлы используют cache-bust URL-параметры во время dev-итерации; морфологические словари кэшируются в dedicated `MORPH_CACHE` bucket с явными invalidation hooks.

### 3.3.3 Cloud-Only Resources

Серверное взаимодействие — исключение, не норма. Два класса ресурса требуют server-side computation: text-to-speech (Google Cloud TTS как production provider) и AI-перевод (Google Gemini). Для обоих сервер действует как credentials-protecting прокси — GCP / Gemini API key пользователя хранится server-side в `data/gcp-tts-key.json` / `.env` и никогда не exposed для браузера. Вся остальная функциональность (text editing, морфологический lookup, заметки, создание SRS-карточек, рендеринг smart-графа) работает чисто client-side.

### 3.3.4 Open-Source by Default

Кодовая база — open-source на GitHub под permissive лицензированием (MIT для кода, CC-BY 4.0 для документации). Design contribution Главы 4 наследует свой claim на reusability от этого обязательства. Внутренние development-документы (CLAUDE.md, planning документы, audit reports) ship'ятся в репозитории вместе с production-кодом; эта прозрачность — deliberate trade-off — verbose внутренняя документация более полезна для future researchers, чем concise polished документация, скрывающая итеративный процесс.

## 3.4 Доменная архитектура

Домен LinguistPro структурирован вокруг центрального артефакта — **Hebrew текста** — каждый другой модуль orbit'ит вокруг text editor'а (§3.4.1) и contribute'ит конкретный learning affordance к нему.

### 3.4.1 Hebrew Text Editor — центральный учебный workspace

Участник pastes или импортирует Hebrew текст (статья, песня, разговор, литературный отрывок) и получает editor view с одной строкой на предложение. Каждая строка несёт: оригинальный Hebrew, опциональный никуд (vowel marks), опциональную транслитерацию, русско-английский перевод, и кликабельную ▶ audio-кнопку для TTS-проигрывания. Строки RTL-rendered с mixed-content `bdi` isolation для предотвращения bidi-багов в mixed Hebrew / Russian / English тексте [TODO: процитировать typography test page проекта `/typo-test.html`]. Этот editor — workspace, где происходит ульпан-style row-by-row работа; каждый другой модуль в системе (морфология, заметки, SRS, smart graph) attach'ится к конкретным строкам или словам в этом view.

### 3.4.2 Морфологический анализ

Иврит-морфология computationally нетривиальна: одно слово может иметь несколько legitimate анализов (биньян, корень, лицо / число / род, время). LinguistPro встраивает local-first pre-computed морфологический словарь, derived из hspell-проекта Нада́ва Хар-Эля и Дана Кенигсберга [TODO: процитировать hspell project Har'El & Kenigsberg]. Default tier несёт ~34K стемов / ~68K анализов; extended tier (shipped 2026-05-14) несёт 493 398 entries / 685 632 analyses на 4.24 MB gzipped, кэшированных в dedicated Service Worker bucket. Provider abstraction `MorphProvider` (`public/js/morph-provider.js`) позволяет future-расширение к Tier 3 server-side морфологическому анализатору для unhandled forms и Tier 4 probabilistic disambiguation layer (запланирован к v3.4+) без изменения consumer-side API [TODO: процитировать `docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`].

### 3.4.3 Text-to-Speech и Translation

TTS-слой использует Google Cloud TTS с WaveNet voice family, proxied через сервер для защиты API credentials. Translation-слой использует Google Gemini с daily quota (default 50 запросов / день), отслеживаемой в `data/usage.json` и daily reset на configured UTC-час. Оба слоя намеренно cloud-only — local TTS quality и local neural translation quality были оценены во время v3.0 цикла и отвергнуты как ниже-acceptable для adult-learner pedagogical use [TODO: процитировать `docs/TTS_HEBREW_DECISION.md`]. Архитектурная цена cloud-зависимости — fresh translations и fresh TTS-запросы требуют connectivity; после кэширования локально в OPFS оба функционируют offline.

### 3.4.4 Premium Notes (полиморфные typed-graph)

Notes-подсистема (Direction 9, shipped в v3.2) — полиморфный typed-graph: заметки **типизированы** (free / word_study / grammar / etc., по per-type input schema), **audio-anchored** (каждая заметка может attach'иться к timestamp'у конкретной строки аудио для playback во время review), **темплейтированы** (per-type schema управляет input form), **версионированы** (история редактирования retained, no destructive overwrites), **связаны** (cross-note `[[note]]` references, разрешаемые через autocomplete), и **SRS-card-creating** (любая заметка может spawn SRS micro-карточку через `🎴 Сделать карточкой` action) [TODO: процитировать `docs/PREMIUM_NOTES_PLAN_v3_2.md`]. Полиморфный граф — substrate для Smart Learning Graph §3.4.6.

### 3.4.5 Система Text-Card Sharing

Введена в v3.2 (Direction 10) [TODO: процитировать `docs/TEXT_CARD_PLAN_v3_2.md`], система text-card адресует prerequisite research-grade когортного исследования: идентичные учебные материалы across участников. **Mode A** — bulk-builder для учителя, чтобы compose curated text-card sets. **Mode B** — peer-share через lightweight JSON-файлы — один студент экспортирует text-card, другой импортирует его напрямую без серверного посредничества, сохраняя offline-first инвариант. **Mode C** — curator-request flow с Standard-vs-Curated split для institutional content. Без Mode B каждый ulpan-студент paste'ил бы свой собственный текст, produce-ируя inconsistent учебные материалы и ломая научную сопоставимость cohort-level engagement метрик, описанных в Главе 5.

### 3.4.6 SRS-слой

SRS-слой по `docs/SRS_STRATEGY_v3_2.md` (approved 2026-05-12) разделяет responsibilities: LinguistPro — слой **creation и linkage** — строки `srs_cards` создаются из заметок, полиморфны с `card_kind ∈ {sentence, note}`, retaining back-pointer `source_note_id` для linkage. In-app **Trainer** остаётся как minimum-viable стаб. **Recommended review** слой — Anki, интегрированный через `📥 Экспорт в Anki` (`btnAnki`) flow. Дипломное исследование обрабатывает `srs_error_rate` и `cards_added_to_srs` соответственно (Глава 5 §5.6.2 документирует proxy framing). Future v3.4+ работа запланирована для Anki Connect bidirectional sync, чтобы закрыть in-app retention measurement gap.

### 3.4.7 Smart Learning Graph

Введён в v3.6, Smart Learning Graph — локальная, read-only визуализация накопленных заметок / текстов / корней / биньянов учащегося с `note_link_suggestions` для retrieval-practice подтверждения [TODO: процитировать `docs/SMART_LEARNING_GRAPH_ROADMAP_v3_6.md`, `docs/PILOT_READINESS_GATE_v3_6.md`]. Система предлагает локальные shared-root / shared-lemma / shared-binyan / same-text candidate connections; учащийся подтверждает, defer'ит или отвергает каждое — retrieval-practice interaction, который превращает граф в learning instrument, а не пассивную visualization. Никакая телеметрия не покидает устройство для graph interactions; никаких writes в таблицу `events`; граф privacy-quiet by design и явно out-of-scope для research-mode data collection.

### 3.4.8 Cross-Text «Где встречается» Hub

Shipped в v3.3.2. Из любой `word_study` заметки кнопка `🔎 Где встречается` открывает side-panel, перечисляющий каждый другой текст в библиотеке учащегося, где встречается то же слово или его корень. Lookup чисто локальный — никакого серверного запроса — и inverted index строится lazy при первом использовании и кэшируется в памяти до idle. Архитектурное обязательство §3.3.1 (offline-first) сохранено.

## 3.5 Research-Mode слой

Research-mode (Direction 11B) детально описан в Главе 4. Здесь мы отмечаем его архитектурную интеграцию в более широкую систему:

- **Endpoint family.** `/api/research/v1/*` — единственный namespace, введённый как explicit архитектурное исключение из нормы §3.3.1 «no server state». Исключение justified, потому что research-mode aggregates категориально отличны от raw application state — aggregates это статистические summaries, на которые участник явно opt-in согласился делиться, а не application state, transparently реплицируемый. Архитектурное различие load-bearing для privacy posture: библиотека текстов пользователя, заметки и SRS-state всё равно никогда не покидают устройство.

- **Module boundary.** Серверный код живёт в `research/` (`validate.js`, `storage.js`, `rateLimit.js`); клиентский код живёт в `public/js/research.js` и `public/js/research-ui.js`. Module boundary явная: никакой другой модуль не imports из `research/`, и никакой `research/` модуль не imports из elsewhere, кроме как через schema contract, задокументированный в `docs/RESEARCH_METRICS_SCHEMA.md`.

- **Default OFF.** В соответствии с архитектурным принципом приватности research-mode OFF by default на fresh installs и требует explicit consent activation (Глава 4 §4.3.1). Пользователь, который устанавливает LinguistPro для изучения иврита и никогда не открывает Research panel, никогда не имеет каких-либо данных покидающих его устройство за пределы cloud-only TTS / translation requests §3.3.3.

- **Code-level enforcement privacy инвариантов.** Schema-strict валидатор (`research/validate.js`) и k-anonymity gate (`aggregateCohort` в `research/storage.js`) — runtime enforcement points; Глава 4 §4.4 детально прослеживает их.

Research-mode — единственное deliberate отклонение от чистой offline-first архитектуры. Цена документирована честно в Главе 4 §4.5; benefit — обеспечение этического эмпирического исследования на privacy-preserving фундаменте — это методологический вклад диплома.

Архитектура масштабирования, описанная в `docs/ULPAN_RESEARCH_PLAN_v3_2.md §5` (Stages 1–5: single-user → single-cohort → multi-cohort → институциональный → public research platform), не требует переписывания core архитектуры; cohort-isolated `research-data/<cohort_code>/` directory layout multi-cohort-ready by construction, даже хотя Stages 3–5 out of scope для текущего диплома.

## 3.6 UI-архитектура

### 3.6.1 Dual-Mode UX: Classic и IDE

Участник выбирает между двумя presentation modes для центрального text-editor workspace. **Classic mode** использует accordion-cards layout с row-by-row navigation и per-text Live State preview, который surface'ит текущие настройки (provider, transliteration profile, niqqud status) без expanding полной settings panel — v3.7 polish improvement, informed by dogfood observation, что пользователи часто теряли отслеживание того, какой TTS provider или niqqud mode active. **IDE mode** использует denser, multi-pane layout, более близкий к code editor — playlist queue, search-anywhere, side-by-side notes — для учащихся, предпочитающих keyboard-driven workflows. Оба mode share один и тот же underlying data model; различие чисто presentational.

### 3.6.2 Mobile UX redesign (v3.7)

Mobile-first redesign закрыт на 2026-05-18 адресовал одиннадцать UX issues, идентифицированных через dogfood observation [TODO: процитировать `docs/MOBILE_UX_REDESIGN_PLAN_v3_7.md`]: chip-based filter selectors, заменяющие dropdowns, grid layout для library cards, modal scrollability fixes, dark theme refinement, и bottom tab bar для IDE mode. Redesign обрабатывает mobile не как scaled-down desktop, а как primary use mode для ulpan-студента, изучающего на телефоне во время commutes или breaks between classes. Post-v3.7 polish (commits `4440aa5` через `9a1bfe2`, 2026-05-21) адресовал remaining issues: modal scrollability в confirm dialogs, IDE play-button wiring, filter chip polish, и live-state preview improvements.

### 3.6.3 Teacher dashboard `/teacher.html`

Отдельно от main application — teacher dashboard на `/teacher.html`, accessible только с cohort code и researcher token. Dashboard рендерит cohort aggregates, engagement timeline, per-student breakdown (k-anonymity gated), correlation analyses, и CSV export functionality. Это entry point исследователя к данным, описанным в Главах 5–6; полная operational документация — в `docs/RESEARCHER_GUIDE.md §5`. Teacher dashboard полностью интернационализирован (RU / EN / HE) и ships с in-dashboard Help drawer, объясняющим каждую card и action.

### 3.6.4 Component-Level структура

UI реализован как single `public/index.html` (≈ 39 000 строк) с inline CSS и JavaScript, организованным в named regions, задокументированным в `docs/CLAUDE.md`. Хотя unconventional по современным веб-стандартам (которые предпочитают component-framework decomposition такой как React или Vue), выбор служит offline-first инварианту: single файл с embedded resources installs быстрее, caches детерминистически как single Service Worker entry, и runs без build step на устройстве пользователя. Trade-off — build-tooling complexity (никакой automatic component extraction) и CSS-cascade pitfalls (`@media (max-width: 600px) button { width: 100% }` mobile override требует explicit per-component exception); они смягчены strict CSS-pitfall документацией режимом в `docs/CLAUDE.md` и paired-edit conventions во время разработки.

## 3.7 Data-архитектура

Данные приложения живут в двух tier'ах: **client-side** (OPFS-резидентная SQLite database и `localStorage`) и **server-side** (только research-mode `research-data/` directory tree).

### 3.7.1 Client-Side схема

OPFS-резидентная SQLite database (`data/app.db` относительно OPFS root приложения) несёт полное state пользователя: `texts`, `sentences`, `rows`, `notes`, `note_links`, `note_link_suggestions`, `srs_cards`, `srs_reviews`, `events` и различные supporting tables. Schema migrations версионированы и применяются на boot через migration runner; backups создаются автоматически перед risky migrations через npm-скрипт `db:backup`. Схема задокументирована в `docs/DB_SCHEMA.md`, а API contracts — в `docs/API_CONTRACTS.md`, `docs/CONTRACTS_SRS.md`, и `docs/CONTRACTS_ANALYTICS.md`.

### 3.7.2 Server-Side схема (только Research-Mode)

Единственные persistent server-side данные — это `research-data/` directory tree, описанный в Главе 4 §4.4.2: per-cohort `cohort_meta.json`, per-day `.jsonl` append-only files, `outcomes.csv`, и `deletions.log`. Никакой user account таблицы, никакого session state, никакой application telemetry, и никаких метаданных за пределами того, что research-mode opt-in явно authorizes. Сервер otherwise stateless across application requests; restart-recovery не требует replay, и fresh deployment operational из empty `research-data/` directory.

### 3.7.3 Audio Cache

Audio responses из Google Cloud TTS кэшируются в OPFS браузера (`data/audio-cache/`), keyed по `(text, voice, params)`. Cache hit возвращает мгновенно без network call; cache miss триггерит TTS request к server-side прокси, который fetch'ит из Google Cloud TTS, возвращает audio, и клиент сохраняет его. Cache per-user и persists across sessions до manual clearing через storage management UI приложения. Это кэширование делает repeat-playback ранее-encountered предложений feasible at zero latency и zero recurring server cost — важно для ulpan-студента, который review'ит тот же диалог много раз across дней.

## 3.8 Build и Deployment

Проект использует Node.js с малой npm-script surface для build, test, migrate, и start operations (задокументировано в `docs/CLAUDE.md` секции «Ключевые команды»). Морфологические словари строятся через `scripts/morph/build-morphology.mjs` против hspell source corpus. PWA icon set генерируется через `npm run pwa:icons`. Tests запускаются через `node --test`, supplemented domain-specific smoke runners'ами (`smoke:morph`, `smoke:quiz`, `smoke:crosstext`, `smoke:research:fast`).

Deployment — через Railway в EU регионе (по data-location disclosure consent template'а, Глава 4 §4.7.2). Deployment защищён во время pilot-фазы через tag-pinning по `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md §2`: production Railway service tracks `tag: v3.7.0-pilot`, а не `branch: main`, isolating pilot участников от in-progress development изменений. Любой hotfix во время pilot ships через dedicated `hotfix/v3.7.x` branch из frozen tag'а, никогда напрямую в main.

## 3.9 Резюме и переход к Главе 4

Эта глава описала LinguistPro как privacy-preserving, offline-first, open-source workspace для изучения иврита. Архитектурные обязательства — суверенитет данных, иврит-как-первый-язык, итеративное уточнение по педагогическим наблюдениям — формируют каждое subsystem decision: OPFS-резидентная database (§3.3.1), local-first морфологический анализатор (§3.4.2), полиморфные typed-graph notes (§3.4.4), локальный Smart Learning Graph (§3.4.7), и dual-mode UI (§3.6.1). Research-mode (§3.5) — единственное deliberate исключение из offline-first нормы — архитектурное исключение, justified by методологическим вкладом, защищаемым в Главе 4.

Глава 4 следует с детальным дизайном этого research-mode'а: семь архитектурных решений, их реализация как code-anchored артефакты, модель угроз, сравнение с альтернативами, этическая рамка, которая их anchors, и ограничения, честно признанные.

---

**Конец Главы 3.**
