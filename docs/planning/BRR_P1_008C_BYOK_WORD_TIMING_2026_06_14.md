# BRR-P1-008c — BYOK word-timing для ЛЮБОГО текста (вкл. Корпус), само-кеш — AS-BUILT (2026-06-14)

> Статус: **IMPLEMENTED** (SW `v3.10.54-byok-word-timing`). Owner prod-verify (с BYOK-ключом) — последний шаг.
> Продолжение BRR-P1-008b (пословная подсветка). Роли: R4 (premium-UX), R2 (SLA), R5 (стоимость), R10 (дрейф mark).

## Проблема
P1-008b дал «бегущее слово» только на **КАНОНЕ** — там озвучка+тайминг забейканы (`<assetKey>.timing.json` рядом с
клипом). Тексты **Корпуса** (и любой не-забейканный текст) озвучиваются на лету через BYOK (`/api/tts`), но сервер
синтезировал **обычный** текст (GCP v1, `input.text`, без SSML-меток) → таймпойнтов нет → пословной подсветки нет.

Owner (2026-06-14): при установленном ключе озвучка должна идти **с таймингами по словам** и **кешироваться** →
пословная подсветка для любого текста, само-наполнение для всех.

## Что уже было готово (recon)
- **Клиент почти готов** (из 008b): `attachRowAudio` tier-2 (BYOK) уже вызывал `ensureTiming(assetKey)` + rAF-подсветку
  (`paintSpeakingWord` красит `.rm-w[data-w-offset]`). Корпус играется тем же `attachReaderAudio`, те же `.rm-w`
  (reader-morph.tokenize), строки Зала несут `_v3_sentenceId/_v3_textId` → `/api/tts` идёт v3-context-путём → `assetKey`.
- **Сервер — недостающее звено:** `/api/tts` (v3-context) → `ensureAudioAsset` → `synthesizeMp3Buffer` (v1, без
  `enableTimePointing`) → писал mp3, тайминг НЕ писал.
- **Готовое к переиспользованию:** `scripts/premium/lib/ttsBake.synthesizeWithTimepoints(apiKey,text,profile)` (v1beta1,
  `enableTimePointing:["SSML_MARK"]`, SSML-метки по `reader-morph.tokenize` → mark-index == `.rm-w` offset; returns
  `{mp3:Buffer, timing}`). `GET /api/audio/:key/timing` + `POST /api/audio/cache/upload` (timingJson) — уже были.
  `computeAssetKey` хеширует по плоскому тексту+профилю → ключ стабилен (mp3+timing рядом).

## Реализация
1. **`server.js`** — `require` `synthesizeWithTimepoints` (+ `utf8Len`) из `scripts/premium/lib/ttsBake` (DB-free,
   key-from-arg, require-safe в Node). Новая `ensureAudioAssetWithTiming(params)` (sibling к `ensureAudioAsset`):
   - тот же `computeAssetKey` (плоский текст+профиль) → пути `<key>.mp3` + `<key>.timing.json` в `DATA_DIR/audio-cache`.
   - mp3+timing **оба** есть → вернуть из кеша (без синтеза, **без ключа**).
   - иначе `utf8Len(text) > TTS_SAFE_TARGET_BYTES` → graceful: обычный `synthesizeMp3Buffer` (mp3 без тайминга, честный
     sentence-level; warn-лог) — не пытаться SSML за пределами лимита.
   - иначе → `synthesizeWithTimepoints` (v1beta1) → **перезаписать** mp3 (`fs.writeFileSync`, чтобы клип совпадал с
     таймпойнтами) + записать `<key>.timing.json`.
   - дальше как `ensureAudioAsset`: probe duration + DB upsert + `setSentenceDefaultAudio/setTextDefaultAudio` (non-fatal).
   - возвращает `{audioContent, fromCache, assetKey, relativePath}` (тайминг НЕ инлайн — клиент берёт его существующим
     `ensureTiming`→`GET /timing`; сайдкар пишется синхронно ДО ответа → гонки нет).
   - **Гейт в `/api/tts` (v3-context):** `const withTiming = !!(req.body && req.body.withTimepoints === true);`
     `await (withTiming ? ensureAudioAssetWithTiming : ensureAudioAsset)({...})` — без флага поведение Studio/прочих НЕ меняется.
   - **Honest-fail:** ключ не задан → `byokKey=""` (нет серверного фолбэка) → `synthesizeWithTimepoints` бросает
     `TTS_KEY_REQUIRED` → catch `/api/tts` → структурный **401** (не 500) → клиент уходит на tier-3 браузер-речь.
2. **`public/js/reader-core.js`** — в `postTts` добавлен `withTimepoints: true` (Room-only; tier-1 канон не трогает —
   там нет вызова /api/tts; tier-2 уже грузит timing+стартует rAF). Больше изменений в tier-логике нет.
3. **`public/sw.js`** — `CACHE_VERSION` → `v3.10.54-byok-word-timing` (меняется reader-core.js).

## Поведение / итог
Ключ установлен → играешь корпус-строку → tier-2 `/api/tts {withTimepoints:true}` → сервер синтезит v1beta1 SSML →
пишет mp3 + `<key>.timing.json` → отвечает `assetKey` → клиент `ensureTiming(assetKey)` → `/timing` 200 → янтарное
слово едет. **Само-кеш:** дальше эта строка у ВСЕХ (даже без ключа, tier-1) отдаёт mp3+timing → пословная подсветка
везде. Стоимость — на ключе пользователя, один синтез на (текст,профиль), затем из кеша.

## Scope OUT / заметки
- Длинные строки (> `TTS_SAFE_TARGET_BYTES`, ~4700 байт) → без тайминга (graceful sentence-level); корпус-строки обычно влезают.
- tier-2b (base64, без assetKey — не-v3-context) тайминг не получает (нет ключа кеша); строки Зала всегда v3-context.
- Перезапись существующего plain-mp3 SSML-рендером: аудио ≈ идентично (тот же голос/текст), ради совпадения с метками. Приемлемо.
- Studio (`index.html`, свой TTS-путь) НЕ трогаем (флаг только из reader-core).

## Файлы
- `server.js` (require ttsBake; `ensureAudioAssetWithTiming`; флаг в `/api/tts`).
- `public/js/reader-core.js` (`postTts` + `withTimepoints`).
- `public/sw.js` (`CACHE_VERSION`).
- `scripts/api-smoke.js` (+2 кейса: withTimepoints-роутинг→честный 401; self-cache keyless + `/timing` words[]).
- docs: этот файл + SESSION_STATE + backlog + `.remember/remember.md`.

## Верификация
- **Гейты зелёные:** `test:api-smoke` (+ кейс 5: `/api/tts {withTimepoints:true}` без ключа → 401 `TTS_KEY_REQUIRED`,
  не 500, и без флага контракт тот же; + кейс 6: засеять `<key>.mp3`+`<key>.timing.json` → `/api/tts {withTimepoints}`
  без ключа → 200 `fromCache:true assetKey=<key>`, `GET /api/audio/<key>/timing` → 200 words[]). `smoke:room` 14,
  `smoke:corpus-room` 18, `smoke:reader-parity`, `smoke:reader-karaoke` 9, `smoke:reader-karaoke-words` 18,
  `smoke:reader-morph`, `smoke:reader-notes`.
- **Не-UI коммит** (server/JS/sw/test — без HTML/CSS) → @380px-скрин не требуется; подсветка идентична канону (008b).
- **Локальный e2e реального синтеза** требует GCP-ключ (ротирован) → покрыт hermetic-кейсами (роутинг+self-cache) +
  **owner prod-verify с BYOK-ключом** (последний шаг): корпус-текст ▶ → `?wkdebug=1` → `mode=audio, tN>0, off↑,
  speaking=1`, янтарное слово едет; повторное открытие (даже сняв ключ) → tier-1 + тайминг из кеша.

## 🔑 OPEN
Ротировать `AUDIO_UPLOAD_TOKEN` (GCP TTS key уже ротирован). Блокер публикации репо + предусловие ③ (publish).
