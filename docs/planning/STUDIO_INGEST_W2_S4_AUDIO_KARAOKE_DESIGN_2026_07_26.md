# W2-S4: аудио-файл (иврит) → транскрипт → таблица + честное сегмент-караоке — дизайн

> **Что это.** Утверждённый дизайн первого слайса Wave 2 программы мульти-модального инжеста:
> сценарий S4 из decision-packet — пользователь загружает аудио-файл с ивритской речью, получает
> ASR-транскрипт (BYOK Gemini, аудио-модальность), билингвальную таблицу и **честное посегментное
> караоке** по реальному аудио (бегущая подсветка строк + повтор сегмента).
>
> **Статус.** ✅ **SHIPPED v3.11.246 2026-07-26, прод-верифицировано** (owner-приёмка на реальном
> аудио — pending). 4 развилки решены владельцем (§1); план `STUDIO_INGEST_W2_S4_IMPLEMENTATION_PLAN_2026_07_26.md`
> исполнен полностью (13 задач, 6 fix-раундов, финальное whole-branch ревью SHIP-WITH-FIXES → применено).
> Транспорт-спайк: live GO (Node + браузер CORS, AQ.-ключ). Fast-follows → W2-S4.1 в decision-packet §7.
>
> **Канон-контекст.** `STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` (§2 S4, §3 архитектура A,
> §4 Wave 2, §5 CLG-доктрина). Паттерн исполнения: `STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25.md`.
> База: прод v3.11.245.
>
> **Кому читать.** Исполнителю слайса — целиком (§3 контракты — точные схемы). Владельцу — §1, §2, §8.

---

## 1. Решения владельца (ЗАФИКСИРОВАНО 2026-07-26)

| # | Развилка | Решение |
|---|---|---|
| S4-TRANSPORT | Доставка аудио в Gemini | ✅ **Gemini Files API напрямую из браузера** (raw REST resumable upload, без SDK-зависимости; сервер не видит байты медиа). Единственный путь для любого размера |
| S4-CAP | Лимит длительности v1 | ✅ **20 минут** (hard cap; смета стоимости в UI всегда, до запуска — R16). Подкасты >20 мин → следующий слайс с chunked-таблицей |
| S4-ROWPLAY | Повтор сегмента оригинала по строке | ✅ **В v1** (кнопка у строки только для аудио-текстов; педагогическое ядро — shadowing, R2) |
| S4-CACHE | Серверный кэш транскриптов | ✅ **Нет** (ASR-вызов идёт браузер→Google; повтор-импорт дедупится в OPFS по sha256; новых серверных хранилищ не появляется — R15) |

**Уточнение честности по S4-CACHE:** сервер не видит *аудио* и *ASR-вызов*. Текст транскрипта
затем идёт через существующий `/api/translate-table` (как любой вставленный текст) и попадает в
существующий translate-кэш — это паритет текущего пайплайна, покрывается W2 privacy follow-up
(§7 decision-packet, TTL для `geminiCacheDir`).

## 2. Архитектура и поток данных

```
[аудио-файл ≤20 мин]
  → длительность (клиент, <audio> loadedmetadata) + смета $ (R16) + подтверждение
  → браузер → Gemini Files API: resumable upload (BYOK-ключ, 2×fetch), poll до ACTIVE
  → браузер → generateContent (fileUri + ASR-промпт) → {language, segments:[{start,text}], warnings}
  → клиент-валидация тайминга (R11): монотонность, clamp [0,duration]; провал → timing=null
  → превью в диалоге «Импорт» (1 строка = 1 сегмент, редактируемо)
  → «Использовать»: аудио → OPFS media/<sha256>.<ext>; текст → #inputText;
     v3LastImportMeta = {kind:'audio', …, audio:{media, asr, segments}}
  → «Перевести»: /api/translate-table + segments[] → prompt-вариант he-ru-table-seg-v1
     (1 сегмент → ≥1 строк, каждая строка несёт segment_index; he-ru путь НЕ тронут)
  → timing {unit:'row', entries:[{o,t}]} (o = первая строка сегмента, t = старт в сек)
  → караоке: «▶ Оригинал» (бегущая подсветка ДИАПАЗОНА строк сегмента, тап-строка = seek)
     + кнопка повтора сегмента у строки
  → «Сохранить»: всё едет в source_meta_json.audio существующим save-путём (проверено live-кодом)
```

**Разделение ответственности (R12):** сервер получает ровно ОДНО расширение — опциональный
`segments[]` у `/api/translate-table`. Весь медиа-путь (upload, ASR, хранение, караоке) — клиент.
Ни одного нового серверного эндпоинта, ни байта медиа через CX23.

### Инвентарь переиспользования (снято с живого кода)

| Кирпич | Откуда | Как используется |
|---|---|---|
| `activeWordIndex([{o,t}], t)` | `studio-karaoke.js:34` (pure, dual-export) | та же функция для активного сегмента (o = row idx) |
| `segments[] + rows[].segment_index` | схема ответа translate-table (`server.js:6350`) | структурная привязка сегмент→строки, не текст-матчинг |
| `v3LastGeminiMeta.source` → `source_meta_json` | `v3AttachImportSource` (`index.html:23194`), save-core 25155 | провенанс+timing персистятся дословно, модал «Происхождение» уже рендерит |
| `classifyGeminiError` | `ingest/geminiError.js` | переезжает в `public/js/gemini-error.js` (dual-export), сервер re-require — один источник |
| `isPlausibleGeminiKey` (AIza\|AQ.) | `ingest/geminiKey.js` | клиентская проверка перед upload |
| ERROR_KEY-паттерн локализации | `studio-import.js:54` | расширяется аудио-кодами |

**Чего НЕТ и что создаём:** клиентского OPFS-хранилища медиа (пути `audio-cache/` в `audio_assets`
обслуживают экспорт-бандлы, файлов в браузере нет) → новый хелпер `media-store.js`.

## 3. Контракты (точные схемы)

### 3.1 ASR-вызов (браузер → Google, BYOK)

- Upload: `POST https://generativelanguage.googleapis.com/upload/v1beta/files` (resumable:
  start → upload_url → PUT байты) с заголовком `x-goog-api-key`. Poll `GET /v1beta/files/<name>`
  до `state=ACTIVE` (интервал 2с, таймаут 60с; `FAILED` → честная ошибка).
- ASR: `POST /v1beta/models/gemini-flash-latest:generateContent`, `temperature: 0`,
  contents = `[{file_data:{file_uri, mime_type}}, {text: ASR_PROMPT}]`, таймаут 180с.
- Форматы: mp3, wav, ogg/opus (WhatsApp/Telegram voice), aac/m4a, flac, aiff.
  ⚠ `.m4a` (iPhone voice memo) — контейнерный mime (`audio/mp4`/`audio/x-m4a`) при заявленном
  `audio/aac`: обязательная живая проверка в smoke; при отказе — honest-ошибка «конвертируйте в mp3».
- ASR_PROMPT-контракт (строгий JSON, стиль EXTRACT_PROMPT W1): транскрибируй ивритскую речь;
  сегменты = естественные фразы/предложения ≤ ~15 сек; `start` строго `"M:SS"`/`"H:MM:SS"`
  (родной формат аудио-понимания Gemini; парсер терпит опциональную дробную часть `M:SS.d`,
  гранулярность = секунды — для сегмент-уровня достаточно); niqqud НЕ добавлять; неразборчиво → `[…]` +
  warning `PARTIALLY_UNCLEAR`; не-иврит доминирует → warning `NOT_HEBREW` + language;
  музыка/тишина без речи → `{"segments":[],"warnings":["NO_SPEECH"]}`. Выход ТОЛЬКО JSON:
  `{"language":"he|mixed|other","segments":[{"start":"M:SS","text":"…"}],"warnings":[]}`.

### 3.2 Валидация тайминга (R11, клиент, pure)

`validateSegments(segments, durationSec)` → `{segments, timingOk, dropReason|null, warnings}`:
монотонность `start` (нестрого возрастает), clamp в `[0, duration+2с]`, первый сегмент ≤ 60с от
нуля. Нарушители монотонности отбрасываются; если валидных < 80% или < 2 — `timingOk=false`
(караоке честно выключено, импорт текста продолжается + warning-бейдж). Никакой интерполяции,
никакого фейк-тайминга.

### 3.3 Расширение `/api/translate-table` (единственное серверное изменение)

- Вход: `+ segments: [{i:int, text:string}]` (опционально; валидно только с `direction:"he-ru"`;
  максимум 400 сегментов). При наличии — вход промпта строится из нумерованных сегментов,
  промпт `HE_RU_SEG_PROMPT`: «границы сегментов сохраняй; дели внутри сегмента — можно;
  сливать сегменты НЕЛЬЗЯ; каждая строка несёт segment_index».
- `promptId = "he-ru-table-seg-v1"` → отдельный кэш-неймспейс (существующий he-ru/any-he кэш
  не пересекается; `HE_RU_PROMPT`/`ANY_HE_PROMPT` не тронуты байт-в-байт).
- Пост-валидация (`ingest/segTable.js`, pure, unit-тестируемо): `segment_index` целые, в диапазоне,
  неубывающие. Провал → таблица возвращается БЕЗ `segment_index` (клиент честно отбросит timing),
  + `warnings:["SEG_MAPPING_LOST"]`. Строки в ответе: `{segmentId, he, he_niqqud, translit, ru, segment_index}`.

### 3.4 Тайминг-артефакт и хранение (R9/R15)

- OPFS: `media/<sha256>.<ext>` (root `navigator.storage.getDirectory()`); имя = sha256 содержимого
  (crypto.subtle) → идемпотентный повтор-импорт. Без строк в `audio_assets`/`sentence_audio` в v1
  (консьюмеры экспорта/prefetch ждут серверные TTS-ассеты — gate-consumers).
- `source_meta_json.audio` (едет существующим save-путём):

```json
{ "v": 1,
  "media": { "opfsPath": "media/<sha256>.<ext>", "sha256": "…", "mime": "…",
             "sizeBytes": 0, "durationSec": 0, "originalName": "…" },
  "asr": { "method": "gemini-asr", "model": "gemini-flash-latest", "at": "ISO",
           "language": "he", "filesApi": true, "warnings": [] },
  "segments": [{ "i": 0, "start": 3, "text": "…" }],
  "timing": { "v": 1, "unit": "row", "entries": [{ "o": 0, "t": 3 }] },
  "timingDropReason": null }
```

- `timing: null` = караоке честно отключено (причина в `timingDropReason`).
- Транскрипт/иврит-таблица = **derived, не asserted** (R9): янтарная панель в «Происхождении»,
  сегментов N, караоке вкл/выкл + причина. Событий памяти это не порождает (review_log не трогаем).

### 3.5 Караоке-модуль `studio-media-karaoke.js`

- Собственный `new Audio()` на blob-URL из OPFS — `rowAudioPlayer` НЕ трогаем (его `ended`-хендлер
  `index.html:18527` двигает плейлист — чужой инвариант). Взаимное исключение: старт медиа →
  пауза rowAudioPlayer + `StudioKaraoke.stop()`; старт row-TTS → `StudioMediaKaraoke.stop()`
  (hook в существующем обработчике `row-tts-btn`).
- Подсветка: активный сегмент = **диапазон строк** `[entries[k].o, entries[k+1].o)` (все строки
  сегмента говорятся — подсвечиваются все; класс поверх строк, POST-render, renderTable не тронут).
- Тап по строке при активном медиа = seek на `t` её сегмента. Кнопка повтора сегмента у строки
  (только аудио-тексты): играет `[t_k, t_{k+1})` того же Audio-элемента.
- rAF-цикл, lifecycle и debug-оверлей — по образцу studio-karaoke.js; pure-часть
  (`activeSegmentRange(entries, rowCount, t)`) — dual-export для Node-smoke.

### 3.6 UI «Импорт» (расширение диалога W1)

- Вход «Аудио» (`accept="audio/*,.m4a,.oga"`). После выбора: длительность, размер,
  **смета** (константы в одном месте: ASR ≈ 32 ток/сек × цена Flash-аудио; показываем
  «≈$X.XX с вашего Gemini-ключа») → кнопка «Транскрибировать».
- >20 мин или битый файл (нет метаданных) → честный отказ сразу, без upload.
- Прогресс-статусы: «Загрузка в Google…» → «Обработка файла…» → «Транскрибирование… (до 2-3 мин)».
- Превью: 1 строка = 1 сегмент, редактируемо. Правки при том же числе строк → тайминг сохраняется
  (правка ASR-ошибки внутри сегмента честна на сегмент-уровне); число строк изменилось → timing
  отброшен + предупреждение. «Использовать» → как W1 + запись аудио в OPFS.
- Повторное открытие сохранённого текста: наличие `media/<sha256>` проверяется; файла нет →
  кнопки караоке disabled + подсказка (тупик оформлен, R4).
- Все новые строки → `ru/en/he` локали + SW bump (tt-fallback мёртв).

## 4. Обработка ошибок

| Ошибка | Поведение |
|---|---|
| CORS/сеть на upload | честная ошибка «не удалось загрузить в Google» + retry-кнопка; НЕ молчаливый фолбэк |
| `state=FAILED` / таймаут ACTIVE | честная ошибка, файл у Google сам истечёт (48ч TTL) |
| ASR: ключ отвергнут / квота / перегрузка | `classifyGeminiError` (клиент, из `gemini-error.js`) → существующие локализованные коды `GEMINI_KEY_REJECTED/QUOTA/OVERLOADED` |
| Модель вернула не-JSON | 1 повтор с усилением «ONLY JSON», затем честный отказ |
| `NO_SPEECH` / пустые сегменты | «Речь не найдена» — без пустой таблицы |
| Тайминг не прошёл валидацию | импорт текста продолжается, караоке выключено, бейдж + `timingDropReason` |
| `SEG_MAPPING_LOST` от translate-table | таблица есть, timing честно отброшен, warning в провенансе |

## 5. Инварианты программы (перенос в план)

- **R11:** никакого word-level на реальном аудио (анти-приоритет пакета); только сегмент-уровень;
  фейковая подсветка запрещена — нет тайминга → нет караоке. `HE_RU_PROMPT`/`ANY_HE_PROMPT` и
  he-ru путь не тронуты; `renderTable`/reader-ядро не тронуты (`smoke:reader-parity` зелёный).
- **R9:** транскрипт и таблица = derived; провенанс-паспорт обязателен и виден.
- **R16:** BYOK-only (серверного ключа нет и не появляется), смета до запуска, hard cap 20 мин.
- **R14/R12:** ноль новых серверных эндпоинтов; ноль медиа-байтов через сервер.
- **R15:** медиа = класс данных пользователя, OPFS-first; у Google — 48ч TTL Files API.
- Зал (`library.html`) в v1 не тронут: сохранённый текст виден там как обычный личный текст.

## 6. Тесты и гейты

- **Unit (node --test):** `validateSegments` (монотонность/clamp/пороги/drop), `secondsFromTimestamp`,
  парсер ASR-JSON (фикстуры хорошего/плохого ответа), `activeSegmentRange`, `ingest/segTable.js`
  (валидация mapping), смета-калькулятор, `gemini-error.js` (паритет с текущими 7 тестами).
- **Smoke:** `smoke:media-karaoke` (pure-функции в Node, по образцу `smoke:studio-karaoke`);
  существующие `smoke:ingest`, `smoke:reader-parity`, `test:api-smoke` — зелёные.
- **Live-smoke (обязателен ДО релиза — урок v3.11.243):** `scripts/premium/ingest-audio-live-smoke.js`
  с реальным ключом владельца: resumable upload → ACTIVE → ASR на he-фикстуре (~10 сек, генерится
  `bake-voice-sample`-путём), assert JSON-контракта; + браузерная CORS-проверка (Playwright) —
  upload и generateContent именно из browser-контекста, на обоих форматах ключа (AIza и AQ.);
  + проверка `.m4a`.
- **UI:** Playwright-скриншот @380×844 перед каждым UI-коммитом (глобальный `button{width:100%}` —
  исключения для новых контейнеров).
- **De-risk порядок:** live-smoke транспорта — ПЕРВАЯ задача плана (spike): если браузерный
  Files API не пройдёт CORS — план откатывается на «инлайн ≤7МБ через прокси» ДО написания UI
  (решение S4-TRANSPORT ревизится с владельцем).

## 7. Анти-скоуп v1 (решено НЕ делать)

Word-level alignment; воспроизведение медиа в Зале; S6-дубляж; экспорт оригинала (S7/W3);
chunked-таблица >20 мин; песни (S9); GC осиротевших OPFS-медиа (follow-up R15 вместе с
privacy-пунктом W2); строки в `audio_assets` для медиа.

## 8. Риски

| Риск | Контрмера |
|---|---|
| CORS браузер→Files API не работает | spike-задача №1; фолбэк-план «инлайн ≤7МБ» согласован как ревизия |
| AQ.-ключ не работает против upload/v1beta | live-smoke на обоих форматах ключа |
| ASR-таймстампы систематически кривые на реальном контенте | валидатор R11 + owner-приёмка на реальных файлах до анонса пилотникам |
| generateContent 20-мин аудио — латентность/таймауты | статус-прогресс, таймаут 180с, cap 20 мин |
| Таблица ~200 строк одним вызовом | в пределах текущей практики he-ru; chunked — следующий слайс |
| Правки превью ломают mapping | контракт «число строк = число сегментов», иначе честный drop |
