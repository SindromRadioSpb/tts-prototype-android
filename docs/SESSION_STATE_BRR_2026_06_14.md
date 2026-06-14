# SESSION STATE — Ben-Yehuda Reading Room (2026-06-14) — READ FIRST

> **Git: main = HEAD `<008c-commit>` (BRR-P1-008c в этой сессии), запушено. Prod SW `v3.10.54-byok-word-timing`.**
> **BRR-P1-008c (NEW):** пословный тайминг для ЛЮБОГО текста (вкл. **Корпус**) при BYOK-ключе, **само-кеш**. Сервер
> `ensureAudioAssetWithTiming` (opt-in `/api/tts {withTimepoints:true}`) синтезит v1beta1 SSML `<mark>` → пишет
> mp3+`<key>.timing.json` → отвечает assetKey; клиент `reader-core.postTts` шлёт флаг, дальше существующий
> `ensureTiming`→`/timing`→rAF `.rm-w-speaking`. Первый синтез на ключе пользователя → потом клип+тайминг отдаются
> ВСЕМ keyless (tier-1). Длинный текст → graceful sentence-level. Гейты `test:api-smoke` +2 (роутинг→честный 401 без
> ключа; self-cache keyless+`/timing` words[]). As-built `docs/planning/BRR_P1_008C_BYOK_WORD_TIMING_2026_06_14.md`.
> **Owner prod-verify с BYOK-ключом — последний шаг.** 🔑 ротировать AUDIO_UPLOAD_TOKEN (GCP ротирован ✓).
> **BRR-P1-008b word-karaoke полностью:** канон-тайминг 6446/6446; подсветка слова = янтарный `.rm-w-speaking` (v3.10.49),
> rAF-driven не timeupdate (iOS-fix v3.10.51); тема-переключатель 🌗 (v3.10.50); диагностика `?wkdebug=1`; **canon-v4 refresh**
> (v3.10.53) — застарелые устройства ре-импортят канон (mode:'skip', заметки целы) → `reconcileAudioLinks` чинит стале-asset-keys
> → /timing 200. `?canon=refresh` форсит.
> Project = LinguistPro (Node PWA, иврит↔рус). Prod: https://linguistpro.kolosei.com (Зал: `/library.html`).
> Роли R1–R10 авто (`docs/PROJECT_ROLES.md`). Owner-инвариант: **бескомпромиссное качество, без заглушек.**
> Это консолидированный READ-FIRST. Предыдущие (актуальны для глубины): i+1 → `SESSION_STATE_BRR_I1_2026_06_13.md`;
> resolver/Тиры → `SESSION_STATE_BRR_RESOLVER_2026_06_11.md`; 26K-доставка → `SESSION_HANDOFF_BRR_2026_06_10.md`.
> Live-буфер: `.remember/remember.md` (авто-load).

## Где мы (хронология последней работы — всё в проде, каждый prod-верифицирован)
1. **Keystone i+1 «Следующий для тебя» (BRR-P1-007)** — ЗАВЕРШЁН ранее (зона 70–90%, saved=familiar, движок `public/js/corpus-vocab.js`). Детали → I1-doc.
2. **① Scaffolded Reading Console (BRR-P1-006)** SHIPPED+PROD (`b30c2c1`→`cc1d380`, SW v3.10.45). Дизайн `docs/planning/BRR_P1_006_SCAFFOLDED_READING_CONSOLE_2026_06_14.md`.
   - Адаптивная огласовка «по нужде» (де-вокализация знакомых слов на word-status-движке i+1; honest-gate R10/R1: фейдят только уверенно-резолвнутые СОХРАНЁННЫЕ слова, **unseen≠familiar**).
   - Tap-to-reveal перевод (active recall); персистентность режимов (`room.heOn/niqqudMode/translitOn/translitProfile/ruMode`); тогл колонки **Иврит**.
   - Раскраска статуса = **ЗАЛИВКА** (была подчёркивание); тултип ⓘ «Статус слов»; одноразовый хинт «Аа».
   - Унификация colour+fade в один `reader-morph.decorateWords`. Гейт `smoke:reader-scaffold`.
3. **Chrome Зала** SHIPPED+PROD (`12f24d1`, SW v3.10.46).
   - **SW-update тост «Обновить/Позже»** — library.html ТЕПЕРЬ сам регистрирует sw.js (раньше НЕ регистрировал) → апдейт виден и при прямом входе в Зал.
   - **Trust-footer**: 🔒 данные-на-устройстве · Made with ❤️ by **Kolosei Peter** · feedback→GitHub issues · Приватность · GitHub · Документация · версия (`/api/client-config`) · О Зале. + **атрибуция источника Бен-Иегуда→benyehuda.org** (R6/R9, «лучше Studio»).
   - **«О Зале» модалка** (что это · источник · офлайн · версия+статус обновления). devName «Sindrom Radio»→«Kolosei Peter» в ОБОИХ (общий `footer.devName` i18n; index.html НЕ тронут).
4. **② Karaoke (BRR-P1-008, sentence-level)** SHIPPED+PROD (`98d29e4`, SW v3.10.47). Дизайн `docs/planning/BRR_P1_008_KARAOKE_2026_06_14.md`.
   - `.row-playing`-подсветка уже была → добавлен ПОТОК: `attachRowAudio` continuous (`playAll/stop/onRowChange` + чистая `nextPlayableIndex`, skip пустых/упавших), кнопка **«▶ Читать вслух»** в reader-bar (▶↔■), авто-скролл (пауза на ручной скролл), усиленная подсветка `.karaoke-on`. Гейт `smoke:reader-karaoke`.
   - **Word-level подсветки НЕТ** (клипы без per-word тайминга) → вынесено в **BRR-P1-008b** (см. ниже).
5. **BRR-P1-008b Word-level karaoke (канон)** IMPLEMENTED+PROD (`7e5124c`, SW v3.10.48) + canon-v4 refresh (v3.10.53). Тайминг забейкан → «бегущее слово» на КАНОНЕ.
6. **BRR-P1-008c BYOK word-timing для ЛЮБОГО текста (вкл. Корпус), само-кеш** IMPLEMENTED (SW v3.10.54, эта сессия). Сервер `ensureAudioAssetWithTiming` (opt-in `/api/tts {withTimepoints:true}`, v1beta1 SSML `<mark>` → mp3+`<key>.timing.json`); клиент `reader-core.postTts` шлёт флаг (tier-2 уже грузит timing+rAF из 008b). Само-кеш: первый синтез на ключе пользователя → потом keyless tier-1 для всех. Длинный текст → graceful sentence-level. Гейты `test:api-smoke` +2 (честный 401 без ключа; self-cache keyless). As-built `docs/planning/BRR_P1_008C_BYOK_WORD_TIMING_2026_06_14.md`. **Owner prod-verify с BYOK — последний шаг.**

## Ключевые файлы / гейты
- Движки (Room-only): `public/js/reader-core.js` (builder parity-locked + `attachRowAudio` continuous + `nextPlayableIndex`),
  `public/js/reader-morph.js` (`decorateWords`/`fadeDecision`/wrap `.rm-w`), `public/js/corpus-vocab.js` (i+1).
  Координатор: `public/js/library-ui.js`. Поверхность: `public/library.html`. i18n: `public/i18n/locales/{ru,en,he}.js`.
- **index.html НЕ трогать** (Студия); общий движок шарится; `smoke:reader-parity` доказывает, что builder/index.html не тронуты — ВСЕ Room-фичи = post-render DOM-декорация на `.rm-w`/строках.
- Гейты (все зелёные на HEAD): `smoke:reader-parity` · `smoke:reader-scaffold` (234) · `smoke:reader-karaoke` (9) ·
  `smoke:reader-karaoke-words` (18) · `smoke:reader-morph` · `smoke:reader-notes` (56) · `smoke:corpus-vocab(-engine)` ·
  `smoke:room` (14) · `smoke:corpus-room` (18) · `test:api-smoke` (вкл. 008c: withTimepoints-роутинг→честный 401, self-cache keyless).
- SW: бамп `CACHE_VERSION` при смене shell-ассета (+`CORPUS_VOCAB_DATA_REV` при смене формата corpus-vocab-сайдкара). На устройстве = тост «Обновить».

## NEXT — меню направлений (из разведки 2026-06-13; владелец выбирает)
- ✅ ① Scaffolded Reading Console — закрыто. ✅ ② Karaoke (sentence-level) — закрыто.
- ✅ **BRR-P1-008b — Word-level karaoke (TTS-timepoints SSML `<mark>`)** — КОД ОТГРУЖЕН+ПРОД (`7e5124c`, SW v3.10.48);
  канон-перебейк тайминга выполнялся ключами владельца (gitignored `.tmp/`). As-built `docs/planning/BRR_P1_008B_KARAOKE_WORD_TIMINGS_2026_06_14.md`.
  Гейт `smoke:reader-karaoke-words`. Live audio-«бег» слова проверяется на реальном устройстве (headless без mp3-кодека).
- ✅ **BRR-P1-008c — BYOK word-timing для ЛЮБОГО текста (вкл. Корпус), само-кеш** — IMPLEMENTED (SW v3.10.54, эта сессия).
  As-built `docs/planning/BRR_P1_008C_BYOK_WORD_TIMING_2026_06_14.md`. **Остался owner prod-verify с BYOK-ключом** (корпус-текст ▶ → `?wkdebug=1` → tN>0, янтарное слово едет; повторно → tier-1 из кеша).
- ③ **Накормить i+1**: опубликовать ~132 бейкнутых→каталог v8 (skill `publish-corpus-batch`) + leveling. **Зависит от `AUDIO_UPLOAD_TOKEN`.** Дефицит modern (73 в каталоге).
- ④ **Качество/измеримость R10**: replace recall/FP тап-глосса vs Dicta-silver + бейджи провенанса + **47097 идиш** (R6/R7).
- ⑤ **Anki-sync** (real mastery → строгая i+1 80–95%); mobile-ограничение Anki-Connect.
- ⑥ **Discovery**: full-text search wiring (индекс corpus-search-v7 есть) + фильтр/сорт полок + закладки.
- Хвосты ①: per-word translit-fade (нужна токенизация translit-колонки); native HE-review строк `room.reader.*`/`room.about.*`.

## 🔑 OPEN (owner) — СРОЧНО
**Ротация секретов** `AUDIO_UPLOAD_TOKEN` + Gemini + старый GCP TTS key — блокер публикации репо (PUBLIC, security-audit `.claude/SECURITY_AUDIT_2026-06-13.md`) И предусловие ③ (publish) и BRR-P1-008b (перебейк). Агент чек-лист соберёт по запросу — ротацию делает владелец.
Бейк-леджер: 928/24641 done; в каталоге v7 опубликовано 796 → ~132 бейкнутых ждут публикации (③).

## НОРМЫ (стоячие)
index.html НЕ трогать (Зал=library.html, шарят OPFS-движок). MEASURE до кода (.tmp-харнесс; профиль-зависимое → НЕПУСТОЙ профиль).
Большие фичи → recon-first дизайн в `docs/planning/<TICKET>.md` НА УТВЕРЖДЕНИЕ до кода. Развилка → варианты по ролям + рекомендация (AskUserQuestion), решает владелец.
Гейты зелёные до push; commit+push автономно (Coolify авто-деплой); prod-verify после (Node fetch/браузер, ⚠ НЕ Windows-curl для не-ASCII). @380px RTL скрин перед UI-коммитом. SW-апдейт = тост «Обновить».

## ПРОМТ для НОВОЙ сессии (копипаст)
```
Продолжаем LinguistPro (Node PWA, иврит↔рус, prod linguistpro.kolosei.com / Зал /library.html).
READ FIRST: docs/SESSION_STATE_BRR_2026_06_14.md (консолидированный), затем по нужде docs/planning/BRR_P1_008B_KARAOKE_WORD_TIMINGS_2026_06_14.md,
docs/PROJECT_ROLES.md (R1–R10 авто), CLAUDE.md, .remember/remember.md.
Owner-инвариант: бескомпромиссное качество, без заглушек. Нормы: index.html НЕ трогать; MEASURE до кода;
большие фичи → recon-first дизайн в docs/planning/<TICKET>.md НА УТВЕРЖДЕНИЕ; гейты до push; commit+push автономно
(Coolify); prod-verify после; SW бамп при shell-ассете; @380px RTL до UI-коммита.
Состояние: ①Scaffolded Console + ②Karaoke(sentence) ОТГРУЖЕНЫ (HEAD 98d29e4, SW v3.10.47). NEXT-меню: BRR-P1-008b
(word-karaoke, PROPOSED, owner-важно), ③publish+leveling, ④R10-качество+47097, ⑤Anki-sync, ⑥discovery.
🔑 СРОЧНО: ротация AUDIO_UPLOAD_TOKEN+Gemini+GCP (блокер публикации + ③ + 008b).
Спроси, какое направление берём, ИЛИ продолжай выбранное. Кода без утверждённого дизайна для крупной фичи не писать.
```
