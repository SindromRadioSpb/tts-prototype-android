# BRR-P1-008b — Word-level karaoke (перебейк озвучки с TTS-timepoints) — RECON-FIRST DESIGN

**Статус:** 🔵 PROPOSED (2026-06-14). Дизайн на утверждение; кода нет. Owner-приоритет («это важно»).
**Поверхность:** `public/library.html` Зал + bake-pipeline (`scripts/premium/*`, `lib/ttsBake.js`). **index.html НЕ трогать.**
Роли: R4 (UX/RTL), R2 (восприятие/орфография), **R10 (измеримость дрейфа)**, R5 (стоимость перебейка).
Базируется на BRR-P1-008 (sentence-level karaoke, SHIPPED `98d29e4`).

## Context — зачем
P1-008 связывает СТРОКУ со звуком (подсветка играющего предложения). Пословная подсветка («бегущее слово»
в момент произнесения) — следующий премиум-уровень: точная связка звук↔письмо↔орфография, как в LingQ/Beelinguapp,
которого для иврита нет ни у кого. Owner отметил приоритет.

## Recon (что есть / чего нет — факт по коду)
- **Sentence-level готов** (P1-008): `attachRowAudio` continuous + `.row-playing`/`.karaoke-on`.
- **Per-word DOM уже есть:** `reader-morph.js` `wrapCellHtml` оборачивает каждое слово в `<span class="rm-w"
  data-surface data-niqqud **data-w-offset**>` в ячейках he и niqqud (reader-morph.js:488–504). → цель подсветки на слово уже в DOM.
- **Аудио-путь:** `attachRowAudio` (reader-core.js) играет клип через `<audio>` (tier-1 кэш `/api/audio/:assetKey`,
  tier-2 BYOK, tier-3 браузер-речь). У `<audio>` есть `currentTime`/`timeupdate` — основа для sync.
- **ПРОБЕЛ:** у бейкнутых MP3 НЕТ per-word тайминга → невозможно знать, какое слово звучит. Нужен новый слой данных.
- **Бейк-стек:** `lib/ttsBake.js`, `scripts/premium/{bake-canon-audio,push-canon-audio,build-canon-v3}.js`;
  `db/premium/ttsAssetKey.js` (asset-key). Канон ≈ 79 текстов / ~6446 клипов, GCP WaveNet `he-IL-Wavenet-A`, keyless tier-1.

## Approach A — перебейк с SSML `<mark>` timepoints (основной)
**Синтез.** Перед синтезом строки токенизировать ТЕМ ЖЕ правилом, что `reader-morph.tokenize`, и обернуть слова
SSML-метками:
```
<speak><mark name="w0"/>שָׁלוֹם <mark name="w1"/>עוֹלָם …</speak>
```
GCP TTS (`v1beta1.synthesizeSpeech`, `enableTimePointing: ["SSML_MARK"]`) возвращает `audioContent` + **`timepoints:
[{ markName:"wN", timeSeconds:Float }]`** — время, когда достигнута каждая метка ≈ начало слова N.
**(verify на impl:** доступность timepointing для he-IL WaveNet в v1beta1; иначе fallback на standard-voice или Approach B.)

**Хранение — тайминг-сайдкар рядом с клипом** (не раздувать work-JSON):
`<assetKey>.timing.json` = `{ v:1, mark:"ssml", words:[{o:0,t:0.00},{o:1,t:0.62},…], dur:Float }` (o=word-offset,
t=start sec). ~КБ/клип. На прод-том рядом с mp3 (тот же owner-token push, паттерн P0-010/A4); раздаётся
`/api/audio/:assetKey/timing` ИЛИ статиком тома. Precache/served-on-open вместе с клипом.

**Клиент-sync (reader-core/library-ui, Room-only):** при старте строки загрузить её `timing.json`; на `timeupdate`
`<audio>` найти активное слово (`words[i].t <= currentTime < words[i+1].t`) и подсветить `.rm-w[data-w-offset="i"]`
в играющей строке (новый класс `.rm-w-speaking`). Снять при смене слова/конце. Маппинг mark→offset 1:1, т.к.
SSML-токенизация == `reader-morph.tokenize` (ОБЩЕЕ правило — вынести в одну чистую функцию, использовать и в баке, и в клиенте).

## Approach B — forced alignment (альтернатива, без перебейка)
Выровнять СУЩЕСТВУЮЩИЕ mp3 к тексту офлайн-инструментом (aeneas / Montreal Forced Aligner) → те же `timing.json`.
Плюс: не тратим GCP-квоту, работает на любых клипах. Минус: внешняя зависимость/качество выравнивания на иврите
с никудом; больше инфраструктуры. **Рекомендация:** A (timepoints — точнее и проще на нашем GCP-стеке); B — запасной.

## Scope OUT
Корпус-тексты без аудио (сначала надо их озвучить — отдельно); анимации «прыгающего мяча» сверх подсветки; index.html;
parity-locked `buildBilingualTableHtml`. Перебейк не начинать до ротации секретов (ниже).

## Измеримость (R10 — обязательно)
- Замер **дрейфа**: на выборке строк сравнить `words[].t` с реальным аудио (спот-чек/ручная разметка нескольких клипов)
  → медианный |Δ| и хвост; гейт «≤ ±150мс на p90». Никуд/проклитики на иврите могут смещать mark — измерить, не верить.
- Честная **деградация**: нет `timing.json` → молча fallback на sentence-level (`degraded:true` в логе), не фейк-sync.
- Маппинг mark→`.rm-w`-offset проверять на расхождение токенизации (гейт: count(words)==count(.rm-w в строке)).

## Гейты / верификация
- **Новый** `smoke:reader-karaoke-words` — чистый парсер `timing.json` + поиск активного слова по currentTime
  (таблица истинности: до первого слова, между, последнее, за концом) + маппинг offset.
- Producer-гейт: SSML-обёртка детерминирована; count(marks)==count(words); timepoints монотонно растут.
- Зелёные без регресса: `smoke:reader-parity` (builder/index.html не тронуты), `reader-karaoke`, `reader-morph`, `room`, `corpus-room`.
- @380px RTL запись пословной подсветки; измеренный дрейф зафиксирован в доке перед широким перебейком.

## Зависимости / порядок
1. **🔑 Ротация секретов** (`AUDIO_UPLOAD_TOKEN` + GCP TTS key) — ОБЯЗАТЕЛЬНО до любого перебейка/push (см. security-audit).
2. Общая токенизация слов (bake↔client) — вынести из `reader-morph.tokenize` в shared util.
3. Pilot-перебейк 1 текста → измерить дрейф (R10) → решить A vs B.
4. Перебейк канона (≈6446 клипов; план на free-tier/$0 если timepointing доступен на WaveNet free) → push timing-сайдкаров на том.
5. Клиент-sync + гейты → @380px → prod-verify.
6. Корпус-аудио + тайминг — позже (после канона; зависит от наполнения озвучки).

## Риски/митигации
- **Стоимость/время перебейка** (6446 клипов) → пилот сначала; free-tier батч; durable-леджер как у run-corpus-prebake.
- **Timepointing на he-IL WaveNet v1beta1** может быть недоступен → fallback standard-voice или Approach B (измерить на пилоте).
- **Дрейф mark на никуде** → R10-замер; при систематическом смещении — калибровочный офсет.
- **Токенизация bake≠client** → единая shared-функция + гейт count-parity.
- **Объём** тайминг-сайдкаров (~КБ×6446 ≈ единицы МБ) — на томе, lazy; precache только для канона по необходимости.

## Файлы (ожидаемые при impl)
`lib/ttsBake.js` (+SSML-marks/timepoints), `scripts/premium/bake-canon-audio.js` (+`--timepoints`), новый
`scripts/premium/push-canon-timing.js`, серв `/api/audio/:assetKey/timing` (server.js) ИЛИ том-статик,
`public/js/reader-core.js` (timing-load + timeupdate sync) + `public/js/library-ui.js` (wire), `public/library.html`
(`.rm-w-speaking` CSS), shared `tokenizeWords` util, `scripts/premium/reader-karaoke-words-smoke.js`.

## Open questions (на утверждении)
1. A (timepoints) vs B (forced-alignment) — рекомендация A; финал после пилот-замера дрейфа.
2. Хранение тайминга: сайдкар-файл (рек.) vs встроить в work-JSON vs новый эндпоинт.
3. Подсветка слова: фон-заливка (как `.karaoke-on`) vs обводка — решить на @380px скрине.
