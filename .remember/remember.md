# BRR continuation handoff — обновлено 2026-06-14 (BRR-P1-008c)

**★ READ FIRST:** `docs/SESSION_STATE_BRR_2026_06_14.md` (КОНСОЛИДИРОВАННЫЙ — открой первым) + `docs/PROJECT_ROLES.md` (R1–R10 авто).
Глубже: 008c → `docs/planning/BRR_P1_008C_BYOK_WORD_TIMING_2026_06_14.md`; 008b → `docs/planning/BRR_P1_008B_KARAOKE_WORD_TIMINGS_2026_06_14.md`; i+1 → `SESSION_STATE_BRR_I1_2026_06_13.md`.
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал: `/library.html`).
**main HEAD `45307a3` (BRR-P1-008c), SW `v3.10.54-byok-word-timing`.**

## Эта сессия (2026-06-14): BRR-P1-008c — BYOK word-timing для ЛЮБОГО текста (вкл. Корпус), само-кеш — IMPLEMENTED
Owner-запрос: «озвучка с таймингами по словам для любых текстов, в т.ч. Корпуса, если установлен ключ» + кеширование.
- **Сервер** (`server.js`): новая `ensureAudioAssetWithTiming` (sibling к `ensureAudioAsset`) — `/api/tts` с
  `withTimepoints:true` синтезит **GCP v1beta1 SSML `<mark>`** (`ttsBake.synthesizeWithTimepoints`) → пишет
  `<key>.mp3` + `<key>.timing.json` в `DATA_DIR/audio-cache` → отвечает `assetKey`. mp3 перезаписывается из ТОГО ЖЕ
  SSML-рендера (клип совпадает с метками). `computeAssetKey` тот же (плоский текст+профиль) → **само-кеш**: первый
  синтез на ключе пользователя, потом mp3+timing отдаются ВСЕМ keyless (tier-1). Длинный текст (> `TTS_SAFE_TARGET_BYTES`)
  → graceful plain-mp3 без тайминга (честный sentence-level). Нет ключа → `byokKey=""` (нет серверного фолбэка) →
  `synthesizeWithTimepoints` бросает `TTS_KEY_REQUIRED` → catch `/api/tts` → структурный **401** (не 500) → tier-3 браузер-речь.
- **Клиент** (`public/js/reader-core.js`): `postTts` шлёт `withTimepoints: true` (Room-only). tier-2 уже грузил
  `ensureTiming`→`/timing`→rAF `.rm-w-speaking` из 008b — других правок не нужно. Корпус играется тем же
  `attachReaderAudio`, те же `.rm-w` (reader-morph.tokenize) → mark-index == data-w-offset → подсветка едет.
- **SW** (`public/sw.js`): `CACHE_VERSION` → `v3.10.54-byok-word-timing`.
- **Гейты** (зелёные): `test:api-smoke` +2 кейса — (5) `/api/tts {withTimepoints:true}` без ключа → 401 `TTS_KEY_REQUIRED`
  (не 500), и без флага контракт тот же; (6) self-cache: засеять `<key>.mp3`+`<key>.timing.json` → запрос без ключа →
  200 `fromCache:true assetKey=<key>`, `GET /api/audio/<key>/timing` → 200 words[]. + `smoke:room` 14, `smoke:corpus-room` 18,
  `smoke:reader-parity`, `smoke:reader-karaoke` 9, `smoke:reader-karaoke-words` 18, `smoke:reader-morph`, `smoke:reader-notes`.
- **Не-UI коммит** (server/JS/sw/test, без HTML/CSS) → @380px-скрин не требуется; подсветка идентична канону (008b).
- **ОСТАЛОСЬ: owner prod-verify с BYOK-ключом** (последний шаг): ключ задан → корпус-текст ▶ → `?wkdebug=1` →
  `mode=audio, tN>0, off↑, speaking=1`, янтарное слово едет; повторное открытие (даже сняв ключ) → tier-1 + тайминг из кеша.
- As-built → `docs/planning/BRR_P1_008C_BYOK_WORD_TIMING_2026_06_14.md`. Plan (утверждён) → `~/.claude/plans/linguistpro-node-pwa-snoopy-lampson.md`.

## Предыдущее (в проде, кратко)
- **008b word-karaoke (КАНОН):** канон-тайминг 6446/6446; янтарный `.rm-w-speaking` (v3.10.49); rAF не timeupdate
  (iOS-fix v3.10.51); тема-переключатель 🌗 (v3.10.50); диагностика `?wkdebug=1`; **canon-v4 refresh** (v3.10.53) —
  застарелые устройства ре-импортят канон (mode:'skip', заметки целы) → `reconcileAudioLinks` чинит стале-asset-keys →
  /timing 200. `?canon=refresh` форсит. `audio_asset_key` = виртуальный JOIN (sentence_audio→audio_assets).
- **① Scaffolded Console** (v3.10.44–45): adaptive niqqud fade + tap-reveal + persist + тогл колонки Иврит + заливка-статус.
- **Chrome Зала** (v3.10.46): SW-update тост, trust-footer (Kolosei Peter), «О Зале» модалка, Бен-Иегуда атрибуция.
- **② Karaoke sentence-level** (v3.10.47): `attachRowAudio` continuous + «▶ Читать вслух».

## Архитектура/швы (стоячее)
index.html НЕ трогать (Зал = library.html, шарят OPFS-движок). Всё Room = post-render DOM-декорация на `.rm-w`-спанах →
`smoke:reader-parity` ЗЕЛЁН. `reader-morph.js` Room-only (decorateWords/fadeDecision/tokenize). `reader-core.js` —
builder parity-locked + `attachRowAudio` (karaoke + word-timing) + `ensureTiming`/rAF. Координатор `library-ui.js`.

## НОРМЫ (стоячие)
MEASURE до кода (профиль-зависимое → НЕПУСТОЙ профиль). Крупные фичи → recon-first дизайн в `docs/planning/<TICKET>.md`
НА УТВЕРЖДЕНИЕ до кода. Развилка → варианты по ролям + рекомендация (AskUserQuestion), решает владелец. Гейты зелёные до
push; commit+push автономно (Coolify авто-деплой); prod-verify после (Node fetch/браузер, ⚠ НЕ Windows-curl для не-ASCII).
SW `CACHE_VERSION` бамп при shell-ассете. @380px RTL скрин перед UI-коммитом. SW-апдейт = тост «Обновить».

## NEXT (опционально, владелец выбирает)
- ✅ ① Scaffolded Console · ✅ ② Karaoke(sentence) · ✅ 008b word-karaoke(канон) · ✅ **008c BYOK word-timing(любой текст)**.
- ③ Накормить i+1: опубликовать ~132 бейкнутых→каталог v8 (`publish-corpus-batch`) + leveling; дефицит modern (73 в каталоге). **Зависит от AUDIO_UPLOAD_TOKEN.**
- ④ Качество/измеримость R10: replace recall/FP тап-глосса vs Dicta-silver + provenance-бейджи + 47097 идиш.
- ⑤ Anki-sync (mobile-ограничение) · ⑥ Discovery: full-text search wiring + фильтр/сорт полок + закладки.
- Хвосты ①: per-word translit-fade · native HE-review строк `room.reader.*`/`room.about.*`.

## 🔑 OPEN (owner) — СРОЧНО
Ротация: **AUDIO_UPLOAD_TOKEN** (+ если ещё не: Gemini, старый GCP TTS key — GCP TTS уже ротирован ✓). Репо готовится к
PUBLIC (`.claude/SECURITY_AUDIT_2026-06-13.md`) — блокер публикации + предусловие ③ (publish). ⚠ GCP+AUDIO_UPLOAD_TOKEN снова светились в чате.
Бейк-леджер: 928/24641 done (в каталоге v7 опубликовано 796 → ~132 ждут публикации).
