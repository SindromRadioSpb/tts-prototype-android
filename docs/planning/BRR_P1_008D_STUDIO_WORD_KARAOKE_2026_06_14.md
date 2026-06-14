# BRR-P1-008d — Word-level karaoke in **Studio** (per-row play), self-caching — AS-BUILT (2026-06-14)

> Статус: **IMPLEMENTED**, гейты зелёные, e2e в браузере пройден (light+dark @380px). SW `v3.10.55-studio-word-karaoke`.
> Owner prod-verify с BYOK-ключом — последний шаг. Продолжение 008b/008c. Роли: R4 premium-UX, R2 SLA, R3 архитектура, R10 измеримость.

## Проблема
Пословная подсветка («бегущее слово») работала только в Reading Room (008b канон + 008c BYOK для любого текста).
**Studio** (`public/index.html`, prod-корень `/`) озвучивает построчно (кнопка ▶ в строке), но ячейка иврита —
один текст-узел: нет per-word спанов, нет fetch тайминга, нет rAF-подсветки. Owner: «реализуй то же в Studio».
**Scope (решение владельца):** ТОЛЬКО построчно (одиночный ▶ + авто-плейлист «следующая строка»). Главная кнопка
«весь текст» (`playTTS`) и Anki-карточка — вне scope.

## Recon (ключевой вывод: сервер ГОТОВ)
- **Сервер (008c) — не менять.** `/api/tts {withTimepoints:true}` → `ensureAudioAssetWithTiming` пишет mp3 +
  `<key>.timing.json`, отдаёт `assetKey`; `GET /api/audio/:key/timing` → `{v,n,got,words:[{o,t}]}`. Само-кеш по
  `computeAssetKey` (плоский текст+профиль) — **общий с Залом**: текст, озвученный в Зале, в Studio сразу с караоке.
- **Studio построчно** (`index.html`): два «keyed» места с известным `assetKey` — tier-1 prefetch (`~36588-36618`,
  `row._v3_audioAssetKey`) и tier-2 fresh (`~36624-36682`, `ttsBody`→`res.assetKey`). Оба для Library-строк (v3-context).
  Аудио — singleton `ensureRowAudioPlayer()` (`~18150`). GCP-ключ — `gcpTtsKeyGet()` ← localStorage `v3.gcpTtsApiKey`.
- **`renderTable()` выдаёт иврит ПЛОСКИМ текстом**, byte-identical к `reader-core.buildBilingualTableHtml` (гейт
  `smoke:reader-parity` грузит `/index.html?room=1`). ⇒ **renderTable НЕ трогаем**; разметка слов = POST-render.
- **`reader-morph.js` — IIFE → `window.ReaderMorph`** (не ES-модуль), грузится в Studio обычным `<script>`. `tokenize`
  — тот же токенайзер, что строит SSML-метки на сервере → **mark-index == data-w-offset гарантировано**.

## Реализация (Вариант α — внешний файл + POST-render, выбран из α/β/γ)
**Новый `public/js/studio-karaoke.js`** (IIFE → `window.StudioKaraoke`, + `module.exports` для Node-гейта):
- `activeWordIndex(words,t)` — чистая (копия reader-core; reader-core — ESM, Studio не импортит). Толерантна к частичному таймингу.
- `start(rowIdx, assetKey, audioEl)`: `stop()` предыдущего → `fetch /api/audio/:key/timing` (`force-cache`) → нет/пустой
  `words` → no-op (graceful, остаётся построчная `.row-playing`-подсветка, **DOM не трогаем**); есть `words[]` → лениво
  обернуть ивритские ячейки строки (`td[data-col=he|niqqud]`) спанами `<span class="rm-w" data-w-offset=N>` через
  `ReaderMorph.tokenize` (строим DOM-узлами, без innerHTML-конкатенации → без escaping-багов; сохраняем исходный
  `innerHTML` для отката) → rAF-цикл `activeWordIndex(words, audioEl.currentTime)` → красим `.rm-w[data-w-offset=off]`
  классом `.rm-w-speaking`. **Стоп само-управляется** через one-shot `ended/pause/error` на `audioEl`.
- `stop()`: cancel rAF, снять `.rm-w-speaking`, **восстановить исходный innerHTML ячеек** (un-wrap), снять листенеры.
- `wkDebug()` + `?wkdebug=1` overlay (паритет с Залом: mode/t/tN/off/ticks/key) для on-device диагностики.
**`public/index.html` — точечный диф** (renderTable НЕ тронут):
- 2 `<script src>`: `/js/reader-morph.js` затем `/js/studio-karaoke.js` (после tts-backends, `~12019`).
- `ttsBody.withTimepoints = true` в построчном TTS-хендлере (`~36633`).
- 2 вызова `try{ window.StudioKaraoke && StudioKaraoke.start(rowIdx, assetKey, audio); }catch(_){}` после `audio.play()`
  в tier-1 (`~36615`) и tier-2 (`~36678`). **`clearRowPlayingState` НЕ трогаем** (стоп — на событиях audioEl).
- CSS `#proTable .rm-w.rm-w-speaking` — янтарь `#f7b733`/тёмный текст/glow + `prefers-reduced-motion` (тема-независимо;
  Зальное правило scoped к `#roomReaderTable`, поэтому Studio нужно своё под `#proTable`).
**`public/sw.js`:** `CACHE_VERSION` → `v3.10.55-studio-word-karaoke` + `/js/studio-karaoke.js` в `PRECACHE_URLS`.
**Гейт:** новый `scripts/premium/studio-karaoke-smoke.js` (`npm run smoke:studio-karaoke`).

## Поведение / итог
Library-строка в Studio → ▶ → (ключ задан и тайминга нет → tier-2 синтезит+кеширует; уже забейкано/само-закешировано →
tier-1 keyless) → `StudioKaraoke.start` тянет `/timing` → янтарное слово едет по строке; авто-плейлист подсвечивает
каждую следующую строку. Нет тайминга/ключа/не-Library → graceful построчная подсветка. Само-кеш общий с Залом.

## Верификация
- **Гейты зелёные:** `smoke:studio-karaoke` 18/0 (activeWordIndex == reader-core побайтно; offset-выравнивание
  `tokenize-words == words() == buildMarkedSsml.wordCount` на 5 ивр.-сэмплах с никудом/макаф/пунктуацией) ·
  `smoke:reader-parity` (renderTable byte-identical = НЕ тронут) · `test:api-smoke` (008c-кейсы целы) ·
  `smoke:reader-karaoke(-words)`/`reader-morph`/`reader-notes`/`reader-scaffold`/`room`/`corpus-room`.
- **Браузерный e2e** (Playwright, `/index.html?room=1`, fake-audio-объект + stubbed `/timing`): 3 слова обёрнуты
  (offset 0,1,2); подсветка едет 0→1→2 по currentTime; **ровно одно слово** в моменте; после `stop()` — спанов 0,
  подсветки 0, текст ячейки восстановлен побайтно. 5 console-ошибок — пред-существующие OPFS/wa-sqlite init (пустая
  тест-БД), НЕ из новых файлов.
- **@380px RTL** скрины: light (слово «אֶל», offset 3, янтарь на жёлтой row-playing) + dark (слово «הַקָּטָן», offset 1,
  янтарь на тёмной строке) — контраст высокий на обеих темах, никуд цел, RTL-safe.
- **Owner prod-verify (BYOK):** Studio → Library-текст → ▶ строки → `?wkdebug=1` → `mode=audio, tN>0, off↑, speaking=1`,
  янтарное слово едет; авто-плейлист подсвечивает следующие; повторно/без ключа → tier-1 из кеша.

## Уроки (журнал извлечённых уроков)
- **index.html-фичи = POST-render + внешний файл.** Защищённый `renderTable` (parity-гейт) НЕ трогаем; всю разметку
  слов делаем после рендера, а логику выносим в отдельный `/js/*.js` → диф в index.html минимален (2 тега + 1 поле +
  2 вызова + CSS-блок) и легко ревьюится. Тот же приём, что в Зале (reader-morph post-render).
- **Переиспользовать общий токенайзер, не писать свой.** Offset-выравнивание слова и SSML-метки — make-or-break:
  `ReaderMorph.tokenize` используется И клиентом (обёртка), И сервером (SSML-метки), поэтому `data-w-offset N` ==
  `mark wN` == `timing.o` без догадок. Свой токенайзер в Studio = риск дрейфа. Гейт это фиксирует (3 пути == равны).
- **Стоп караоке вешать на события самого audioEl**, не править централизованный `clearRowPlayingState` (он зовётся из
  многих мест; правка там = риск регрессий построчной озвучки). `start()` идемпотентен (зовёт `stop()` сам) → переключение строк чистое.
- **rAF, не `timeupdate`.** (Из 008b/iOS-фикса.) iOS Safari ненадёжно шлёт `timeupdate` на переиспользуемом `Audio()`;
  rAF + чтение `currentTime` — кросс-платформенно. Перенесли в Studio как есть.
- **Янтарь #f7b733 тема-независим.** `.row-playing` фон у Studio = жёлтый (light) / тёмно-золотой (dark) через
  `--row-hl-playing`; янтарный пилл с тёмным жирным текстом + glow читается на обеих (проверено скринами). Зальное
  `.rm-w-speaking` scoped к `#roomReaderTable` → Studio обязательно своё правило под `#proTable`.
- **Headless e2e без аудио-кодека возможен через fake-audio-объект** (`{currentTime, addEventListener, removeEventListener}`)
  + stubbed `/timing` fetch → детерминированная проверка wrap→rAF→paint→unwrap без реального mp3.

## Scope OUT
- `playTTS` (весь текст) и Anki-карточка — не трогаем (решение владельца; длинный текст всё равно > SSML-кап).
- Не-Library / base64 / system_fallback / browser-cache строки — без караоке (нет assetKey) → graceful построчно.
- 🔑 Напоминание (не блокер этой задачи): ротировать AUDIO_UPLOAD_TOKEN (GCP ротирован ✓).
