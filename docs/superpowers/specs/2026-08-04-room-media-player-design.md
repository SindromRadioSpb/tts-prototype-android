# Спека: премиум медиа-плеер в Читальном зале (Room Media Player)

**Дата:** 2026-08-04 · **Статус:** APPROVED (владелец, диалог 2026-08-04) · **Тип:** design/spec
**Следующий шаг:** имплементационный план (superpowers:writing-plans)

## 1. Задача и решения владельца

Учебные материалы, импортированные в Студии из медиа (Gemini ASR / локальный ASR / субтитры / YouTube), имеют в Студии медиа-плеер над билингвальной таблицей: построчная караоке-подсветка при воспроизведении, тап по строке — перемотка, per-row кнопка ▶︎ «оригинал-сегмент» с автостопом. Требуется тот же учебный процесс в Читальном зале (`public/library.html`).

Зафиксированные решения владельца:

1. **Room-native опыт**: материал открывается обычным ридером Зала (морфология-на-тапе, статусы слов, SRS/due-кольцо, скаффолдинг — работают без изменений); плеер — сверху, караоке-подсветка сегментов, тап по строке = перемотка, перевод — как обычно в Зале.
2. **Источники первой волны**: локальные OPFS-медиа (аудио и видео) с полным набором функций **и** YouTube-материалы с тем же ограничением, что в Студии (караоке + tap-seek, без per-row replay — документированная ловушка асинхронного `seekTo`).
3. **Две кнопки в строке, как в Студии**: TTS-▶ Зала остаётся; рядом (только у материалов с медиа+таймингом) инъецируется ▶︎ «оригинал-сегмент». Взаимоисключение в обе стороны.
4. **Архитектура — подход A**: общий модуль-хост, извлечённый из inline-кода Студии; никакого форка обвязки.

## 2. Ключевые факты кодовой базы (разведка 2026-08-04)

- Обе поверхности рендерят **одну и ту же таблицу** `#proTable` с `data-row-idx` через общий `reader-core.buildBilingualTableHtml` (`public/js/reader-core.js:275`, гейт `smoke:reader-parity` байт-локирует билдер; всё поверх — post-render DOM).
- Медиа-байты — в OPFS `media/<sha256>.<ext>` через `public/js/media-store.js`, **независимо от карточки**; карточка хранит только указатель (`opfsPath` + `sha256`).
- Паспорт (`{media, asr, segments[], timing:{entries:[{o,t,end?,blind?}]}, timingDropReason, video?}`) сохраняется в `texts.table_model_meta_json` **и/или** `texts.source_meta_json` (зависит от кнопки сохранения — фолбэк обязателен, `index.html:24455-24471`). Зал уже получает его через `localDb.getTextByIdLite` (`public/db/local-db.js:561-565`), но не читает.
- Ядро караоке `public/js/studio-media-karaoke.js` почти поверхностно-агностично: rAF-tick по `currentTime` (не `timeupdate`), `paintRange` → `#proTable tbody tr[data-row-idx]` + класс `.smk-row-active`, duck-typed источник (Blob | media-элемент | YouTube-адаптер). Жёсткие связи со Студией: `window.v3StopRowAudio()` (строки 109, 197), CSS-классы стилизованы только в `index.html`.
- Обвязка (~320 строк) живёт inline в `index.html:24103-24425` (паспорт-пайплайн) и `24473-24736` + `39882-39924` (плеер-бар, инъекция кнопок, seek-делегат).
- K1-карантин сжатых часов (`AsrTranscript.timingLooksDegenerate`) и K3 офлайн-довыравнивание (`v3AlignSavedTimingOffline`, `index.html:24368-24425`) выполняются **при каждом открытии** карточки, не персистятся; idempotency-guard сохраняет reference-equality массива `entries` — контракт resume-vs-restart ядра (`studio-media-karaoke.js:153,163`).
- В Зале уже есть TTS-караоке (BRR-P1-008: `.row-playing`, авто-скролл с уважением к ручному скроллу, `library-ui.js:3491-3581`) — образец UX и точка взаимоисключения.
- `text-card-v2` и Portable Learning Package переносят паспорт, но **не байты** (`media_file_included:false`); релинк по SHA-256 на принимающем устройстве. Планов/запретов на Room-медиа в docs/planning нет — greenfield.

## 3. Архитектура

### 3.1 Новый общий модуль `public/js/media-host.js`

Извлечение из `index.html` **без изменения логики** (чистый перенос функций):

| Экспорт | Из чего извлекается | Назначение |
|---|---|---|
| `adoptSavedMediaMeta(textRow)` | `v3AdoptSavedTableMeta` (24463-24471) | паспорт с фолбэком `table_model_meta_json` → `source_meta_json`; `.audio` \| `.captions` |
| `restoreMediaFromMeta(meta, rows)` | `v3RestoreMediaFromMeta` (24431-24453) | K1-карантин + вызов K3; возвращает паспорт или честный null |
| `alignSavedTimingOffline(audio, rows)` | `v3AlignSavedTimingOffline` (24368-24425) | K3-довыравнивание; сохранить idempotency-guard (24381-24384) |
| `resolveMediaBlob(audio)` | `v3MediaResolveBlob` (24489-24500) | OPFS через `MediaStore`, кэш по identity; `sessionOnly` → null вне Студии |
| `ensureLocalStage(opts)` | `v3MediaEnsureLocalStage` (24534-24560) | создание/своп `<audio>`/`<video>` по MIME **в переданном контейнере** (параметр, не жёсткий ID) |
| `augmentRowsWithReplay(opts)` | `v3MediaAugmentRows` + `v3MediaRenderRowReplay` (24656-24714) | post-render инъекция ▶︎ в последнюю ячейку строк; только при `timing && media` и реально доступном блобе |

Студийные `v3Media*` становятся тонкими обёртками (имена `window.v3*` сохраняются). Доказательство чистоты переноса: существующие `tests/mediaKaraoke.test.js`, `tests/asrTranscript.test.js` и `smoke:media-karaoke` зелёные без правок.

### 3.2 `studio-media-karaoke.js` — одно микро-изменение

`opts.stopOtherAudio` (function) вместо жёсткого `window.v3StopRowAudio`; фолбэк на `window.v3StopRowAudio` при отсутствии опции (обратная совместимость Студии). Прочее ядро не трогается; `#proTable` существует в обоих документах.

### 3.3 Хост Зала

- **Разметка**: `#roomMediaBar` в `library.html` между `.reader-bar` (~2051) и `#roomReaderTable` (~2064): кнопка Play/Pause, заметка состояния, стейдж `#roomMediaLocalStage` (аудио/видео), маунт YouTube. Sticky при прокрутке окна; видео-стейдж компактный/сворачиваемый на мобильном.
- **Логика**: секция в `library-ui.js` (~150–200 строк):
  - в `openReader` (5398-5473): после загрузки текста → `adoptSavedMediaMeta` → `restoreMediaFromMeta` → показать бар / честное состояние;
  - Play: `resolveMediaBlob` → `ensureLocalStage` → `StudioMediaKaraoke.bind/start` с `stopOtherAudio: () => readerAudio.stop()`;
  - `onRangeChange` → скролл Зала: переиспользовать `scrollToReaderRow` + karaoke-band логику (`3533-3569`) с уважением `karaokeUserScrolled` (НЕ `container.scrollTop` Студии — Зал скроллит окно);
  - тап по строке → `seekToRow` (делегат на `#roomReaderTable`; только перемотка);
  - ▶︎ в строке → `playSegment` (перемотка + play + автостоп по `end`/следующему `t`);
  - повторная инъекция ▶︎ — явным вызовом из `rerenderReader` (5206-5212) и после `attachReaderAudio`, БЕЗ MutationObserver (Зал сам управляет перерендерами);
  - взаимоисключение в обратную сторону: старт TTS-строки и `#roomReadAloud` → `StudioMediaKaraoke.stop()`;
  - тир-даун в `closeReader` (5530-5557): `stop()`, revoke object URL, скрыть бар;
  - YouTube: тот же адаптер, что в Студии; karaoke + tap-seek; per-row replay НЕ подключать.
- **Подключение скриптов** в `library.html`: `media-store.js`, `asr-transcript.js`, `studio-media-karaoke.js`, `media-host.js`, `studio-yt-player.js` (YouTube-адаптер, `window.StudioYtPlayer`; все, кроме `media-host.js`, уже в SW-precache — `sw.js:129,144,164,167`).
- **CSS Зала**: `.smk-row-active` (приоритет ниже `.row-playing`, по образцу приоритетного блока Студии `index.html:3099-3152`) + `.smk-row-replay`; проверка на 380px (мобильная ловушка `button{width:100%}` — исключение через ID/класс).
- **Бейдж 🎧/🎬** на карточках «Мои тексты» (`renderMyTextCard`, 6478-6497) при наличии паспорта в строке `listTexts`. Ловушка: `listTextsLight` срезает `table_model_meta_json` — при будущей миграции бейдж молча исчезнет; зафиксировать комментарием у бейджа.

### 3.4 Что НЕ делается (YAGNI / вне объёма)

- Никаких правок `reader-core.js:243-363` и `renderTable` — parity-гейт зелёный by construction.
- L3a exact-bindings (`StudioMediaPackage.activateTextBinding`) в Зале — **вторая волна** (требует `window.__localDB` или прямого `MediaPackageRepository`); первая волна работает по позиционному таймингу паспорта, как классический reload-путь Студии.
- Редактор медиа, экспорт LRC, media-package UI в Зале — нет.
- Персист K3-результата — нет (сознательное решение Студии, наследуем).

## 4. Поток данных

```
openReader → getTextByIdLite (паспорт уже в text.table_model_meta_json)
  → adoptSavedMediaMeta → restoreMediaFromMeta (K1-карантин → K3-довыравнивание)
  → #roomMediaBar: play | noTiming | fileMissing
  → Play: resolveMediaBlob (OPFS) → ensureLocalStage (<audio>/<video> + blob URL)
     → StudioMediaKaraoke.bind({media, entries, rowCount, stopOtherAudio, onRangeChange})
     → rAF tick → activeSegmentRange → paintRange(.smk-row-active) → скролл-слежение Зала
  → тап строки → seekToRow · ▶︎ строки → playSegment (автостоп в конце сегмента)
  → closeReader / rerenderReader → stop() + re-bind/re-augment
```

## 5. Честность и деградация (R11)

- `blind`-диапазоны (S12.7 clock-compression) → подсветки нет; уверенно-неверная подсветка запрещена. Ядро уже возвращает `null` — не обходить.
- `timingDropReason` → плеер играет, караоке молчит, заметка «тайминги недоступны» (ключ `studio.media.noTiming` переиспользуется).
- Байтов нет в OPFS этого устройства / `media.sessionOnly===true` → «файл недоступен на этом устройстве» (`studio.media.fileMissing`), per-row кнопки подавлены; для `sessionOnly` — подсказка переоткрыть материал в Студии (существующая лазейка `/index.html?room=1#/t/<b64>` остаётся fallback-путём).
- i18n: переиспользовать `studio.media.*`; новые ключи Зала → все три локали `{ru,en,he}` (гейт ru⊆en, ru⊆he) + **ручной** бамп `?v=` локалей в `library.html` (он не под гейтом Suite 10 — известная дыра) + `CACHE_VERSION` в `sw.js` + `APP_VERSION`.
- SW-precache: добавить `/js/media-host.js` в `sw.js` — иначе офлайн-сессии молча теряют плеер. `studio-media-karaoke.js`/`media-store.js`/`asr-transcript.js`/`studio-yt-player.js` уже в списке (`sw.js:129,144,164,167`).

## 6. Ловушки (переносятся в план как чек-пункты)

1. Reference-equality `entries` — никаких `.map()/.slice()` на массиве между вызовами; сохранить idempotency-guard K3.
2. Двойная колонка meta — фолбэк обязателен.
3. `v3StopRowAudio` в Зале отсутствует — без хука будет двойной звук (медиа + TTS).
4. YouTube + `playSegment` — запрещено (fire-and-forget seek, `studio-media-karaoke.js:177-192`).
5. Mobile 380px: `button{width:100%}`-ловушка; `[hidden]` vs author `display` — гвард-правило.
6. `listTextsLight` срезает паспорт — бейдж строить только от `listTexts`.
7. Синглтон `cur` в ядре — per-document ок, но обязателен stop-хук в `closeReader`.
8. Session-only блоб (`window.v3SessionMediaBlob`) никогда не виден из `library.html` — только честный fileMissing.
9. YouTube-адаптер (`v3YtStageAdapter`) привязан к КОНКРЕТНОМУ videoId (CRITICAL-ловушка `index.html:24197-24205`): при смене текста/закрытии ридера Зала адаптер обязан быть уничтожен (`StudioYtPlayer.destroy`) и маунт скрыт — иначе плеер управляет видео A при таблице B.

## 7. Тестирование

- **Юниты (новые)**: `media-host.js` — фолбэк двух meta-колонок; `sessionOnly` → null вне Студии; карантин деградировавшего тайминга; сохранение reference-equality после повторного `alignSavedTimingOffline`.
- **Юниты (существующие, без правок)**: `tests/mediaKaraoke.test.js`, `tests/asrTranscript.test.js`.
- **Новый смоук `smoke:room-media`** (детерминированный, офлайн): фикстурный текст с паспортом → бар появился; ▶︎-кнопки инъецированы и переживают `rerenderReader`; честные состояния noTiming/fileMissing; взаимоисключение (старт медиа глушит TTS-мок и наоборот).
- **Гейты перед коммитом**: `smoke:reader-parity`, `smoke:media-karaoke`, `smoke:reader-karaoke`, `smoke:reader-mytexts`, `smoke:room`, `smoke:room-mode`, `smoke:i18n`, `smoke:media-package`, `smoke:text-card`, `node --test`.
- **UI**: Playwright-скриншот 380×844 (бар + видео-стейдж + строка с двумя кнопками) до `git add`.
- **Owner-live**: реальный материал с медиа в Зале на устройстве владельца (OPFS-байты присутствуют) — финальная приёмка.
