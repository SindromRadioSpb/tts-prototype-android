# BRR continuation handoff — обновлено 2026-06-14

**★ READ FIRST:** `docs/SESSION_STATE_BRR_2026_06_14.md` (КОНСОЛИДИРОВАННЫЙ — открой первым) + `docs/PROJECT_ROLES.md` (R1–R10 авто).
Глубже: i+1 → `SESSION_STATE_BRR_I1_2026_06_13.md`; word-karaoke кандидат → `docs/planning/BRR_P1_008B_KARAOKE_WORD_TIMINGS_2026_06_14.md`.
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com.
**main HEAD `f9760ec`, SW `v3.10.53-canon-v4-refresh` (прод-верифицирован).**
> **Canon refresh (BRR-P1-008b fix для iPhone):** word-karaoke не работал на iPhone — `?wkdebug` показал `tN=0` (тайминг 404).
> Причина: застарелый канон-импорт держал СТАРЫЙ дефолт audio-link (asset_key 1654fe4a…) прежней редакции; текущий канон/тайминг = 73c099d0…;
> version-gate (haveVer 3 ≥ 3) блокировал ре-импорт. Фикс: **canon-v4.zip** (хирургический бамп canon_version 3→4, ключи БЕЗ изменений; `scripts/premium/bump-canon-version.js`)
> + library-ui→v4 (`CANON_BUNDLE_VERSION=4`) → застарелые устройства ре-импортят (mode:'skip', заметки целы) → `reconcileAudioLinks` перевешивает дефолт-аудио на текущий ключ → /timing 200 → подсветка едет.
> `?canon=refresh` форсит. `audio_asset_key`=виртуальный JOIN (sentence_audio→audio_assets). Подсветка слова = rAF (не timeupdate; iOS-fix v3.10.51), янтарный пилл `.rm-w-speaking` (v3.10.49). Диагностика `?wkdebug=1`.
> 008b follow-ups: канон-тайминг 6446/6446 (100%) на проде · подсветка слова = **тёплый янтарь** (dark-theme fix, v3.10.49) ·
> **тема-переключатель 🌗/☀️/🌙** в Зале (v3.10.50, делится со Studio appTheme_v1) · **подсветка через rAF** не timeupdate
> (iOS Safari не шлёт timeupdate на detached new Audio() — фикс v3.10.51) · **on-device диагностика `?wkdebug=1`** (overlay:
> mode/t/timingN/off/ticks/key + rm-w/speaking). Word-karaoke только на КАНОНЕ (Доступная/Литературная); Корпус=речь устройства, без тайминга.
> #2 (BYOK-таймпойнты для Корпуса, само-кеш) — СПРОЕКТИРОВАН, ждёт owner-go (server /api/tts withTimepoints). 🔑 ротировать AUDIO_UPLOAD_TOKEN (GCP уже ротирован).
Owner-инвариант: бескомпромиссное качество, без заглушек. Норма: index.html НЕ трогать (Зал=library.html);
MEASURE до кода (профиль-зависимое → НЕПУСТОЙ профиль); гейты до push; commit+push автономно (Coolify);
SW CACHE_VERSION бамп при shell-ассете (+CORPUS_VOCAB_DATA_REV при формате сайдкара); @380px RTL до UI-коммита;
SW-апдейт = тост «Обновить». ⚠ НЕ диагностировать «прод не достаёт Dicta» Windows-curl.

## Эта сессия (2026-06-14): BRR-P1-006 Scaffolded Reading Console — ОТГРУЖЕН + ПРОД
Разведочно-стратегическая сессия → владелец выбрал направление ① (Scaffolded Reading Console), модель = **Адаптивное (fade-as-you-learn)**.
Дизайн: `docs/planning/BRR_P1_006_SCAFFOLDED_READING_CONSOLE_2026_06_14.md`.
**Ключевая находка разведки:** бóльшая часть «консоли» УЖЕ была в проде (панель `#readerAids`: профиль транслита,
видимость колонок, **🎨 Статус слов = P1-009 раскраска жива**, Dicta-контекст). Истинные пробелы = затухание + персистентность + находимость.

**Что добавлено (всё в проде, SW v3.10.44):**
- **Огласовка «по нужде» (adaptive)** — niqqud де-вокализуется на словах, которые ты знаешь (тот же word-status-движок, что i+1);
  огласовка концентрируется на новых/архаичных. Honest-gate R10/R1: фейдят ТОЛЬКО уверенно-резолвнутые (exact|likely) СОХРАНЁННЫЕ
  слова; невиданные/неуверенные → остаются с огласовкой (раздельный raw-lookup: unseen=undefined≠familiar).
- **Перевод «по тапу» (reveal)** — перевод заблюрен, тап по строке раскрывает (active recall); ru-тап исключён из аудио + capture-хендлер.
- **Персистентность лесов** — localStorage `room.niqqudMode/translitProfile/translitOn/ruMode` (load на boot, save на change).
- **Находимость** — одноразовый pulse на кнопке «Аа» (`room.aidsHinted`).
- **Унификация:** раскраска (P1-009) + fade слиты в ОДИН `decorateWords(mount, states, {color, fadeMode})` (резолв слова раз, chunked 60/batch).

**Полиш (owner-фидбек, SW v3.10.45, `cc1d380`):** (1) тултип ⓘ+title на «Статус слов» (легенда+confidence-gate);
(3) тогл колонки **Иврит** (`room.heOn`, persisted) — можно читать транслит/огласовку без консонантного столбца;
(4) раскраска статуса = **ЗАЛИВКА** вместо подчёркивания (R4: чётче @380px, LingQ-parity, подчёркивание налезало на нижний никуд;
калибровка known спокойнее / new+learning ярче; `.rm-w.rm-w-active` перебивает заливку). i18n `room.reader.colHe`/`room.morph.statusHint`.

**Chrome Зала (owner-фидбек, SW v3.10.46, `12f24d1`):** (1) **SW-update тост** «Обновить/Позже» — library.html ТЕПЕРЬ
сам регистрирует sw.js (раньше НЕ регистрировал → Зал не показывал апдейт) + updatefound→тост→SKIP_WAITING→reload+poll;
(2) **trust-footer** (🔒 данные-на-устройстве · Made with ❤️ by **Kolosei Peter** · feedback→GitHub issues · Приватность ·
GitHub · Документация · версия из /api/client-config · О Зале) + **атрибуция источника Бен-Иегуда→benyehuda.org** (R6/R9, «лучше Studio»);
(3) **«О Зале» модалка** (что это · источник · офлайн · версия+статус обновления). devName «Sindrom Radio»→«Kolosei Peter»
в ОБОИХ (общий `footer.devName` i18n, ru/en/he; index.html НЕ тронут — меняется через i18n рантайм). i18n `room.footer.*`/`room.about.*`.

**② Karaoke ОТГРУЖЕН (BRR-P1-008, SW v3.10.47, `98d29e4`):** sentence-level. Дизайн `docs/planning/BRR_P1_008_KARAOKE_2026_06_14.md`.
`.row-playing`-подсветка УЖЕ была (reader-core.css) — добавлен ПОТОК: `attachRowAudio` (reader-core.js, Room-only) continuous-режим
`playAll/stop/onRowChange` + чистая `nextPlayableIndex` (skip пустых/упавших строк); кнопка **«▶ Читать вслух»** в reader-bar (▶↔■);
авто-скролл текущей строки (пауза на ручной скролл); усиленная подсветка `.karaoke-on` только при чтении вслух. Word-level OUT (нет тайминга).
Канон = tier-1 бесплатно; корпус без аудио = tier-3 браузер-речь keyless; BYOK только если ключ задан. Гейт `smoke:reader-karaoke` 9/0.
Прод-верифи: на реальном тексте 1 строка играет+подсвечена. Манульный тап строки отменяет караоке.

**Архитектура/швы:** всё = post-render DOM-декорация на `.rm-w`-спанах → `smoke:reader-parity` ЗЕЛЁН (builder+index.html не тронуты).
`reader-morph.js` — Room-only (НЕ в index.html), там `decorateWords`/`fadeDecision`/`clearDecorations`. Тоглы/persist — `library-ui.js`.
CSS `.ru-veiled/.ru-revealed` + pulse — `library.html`. i18n ru/en/he (`room.reader.niqqudMode/ruMode/...`, HE best-effort).

**Ключевые файлы:** `public/js/reader-morph.js` (decorateWords+fadeDecision), `public/js/library-ui.js` (readerCfg-режимы,
loadReaderCfg/saveReaderCfg, applyDecorations, applyReveal, buildAidsPanel addSelect), `public/library.html` (CSS),
`public/i18n/locales/{ru,en,he}.js`, `public/sw.js`, `scripts/premium/reader-scaffold-smoke.js`.
**Гейты ЗЕЛЁНЫЕ:** `smoke:reader-scaffold` 234/0 (pure fadeDecision honest-gate), reader-parity, reader-morph, reader-notes (56 colour),
corpus-vocab(-engine), room, room-mode, corpus-room, test:api-smoke.
**MEASURE:** `.tmp/benyehuda/scaffold-fade-recon.js` (структур.: in-zone fade ~65–75% токенов) + on-device `.tmp/benyehuda/scaffold-fade-snippet.js`
(владелец вставляет в консоль Зала для авторитетного per-profile числа). E2E проверено: 4/73 на 10-словном seed-профиле.

## NEXT (опционально, владелец выбирает) — из разведки направлений ①–⑥
- ✅ ① Scaffolded Console + ✅ ② Karaoke(sentence) + ✅ **BRR-P1-008b Word-level karaoke** (TTS-timepoints, `7e5124c`, SW v3.10.48) — ОТГРУЖЕНЫ.
  008b as-built: `docs/planning/BRR_P1_008B_KARAOKE_WORD_TIMINGS_2026_06_14.md`; гейт `smoke:reader-karaoke-words`; producer `ttsBake.synthesizeWithTimepoints` + runner `bake-and-push-timing.js`; канон-перебейк тайминга прогонялся ключами владельца. **Live audio-«бег» слова — проверить на реальном устройстве** (headless без mp3). **⚠ ротировать GCP+AUDIO_UPLOAD_TOKEN — снова светились в чате.**
- ③ Накормить i+1: опубликовать ~132 бейкнутых→каталог v8 (publish-corpus-batch) + leveling; **дефицит modern (73 в каталоге)**.
- ④ Качество/измеримость R10: replace recall/FP тап-глосса vs Dicta-silver + provenance-бейджи + 47097 идиш.
- ⑤ Anki-sync (mobile-ограничение) · ⑥ Discovery: full-text search wiring + фильтр/сорт полок + закладки.
- Полиш P1-006: per-word translit-fade (нужна токенизация translit-колонки — сейчас OUT); native HE-review строк `room.reader.*`.

## 🔑 OPEN (owner) — СРОЧНО (из security-audit перед публикацией репо)
Ротация: **AUDIO_UPLOAD_TOKEN** + **Gemini** + старый **GCP TTS key**. Репо готовится к PUBLIC — см. `.claude/SECURITY_AUDIT_2026-06-13.md`.
Бейк-леджер: 928/24641 done (опубликовано в каталог v7 = 796 → ~132 бейкнутых ждут публикации).
