# Library export — T3 «без фризов + поток на диск» (recon-СКЕЛЕТ, не одобрено к сборке)

**Дата:** 2026-06-25 · **Статус:** 🟡 **RECON-PENDING** — заготовка для следующей сессии. Кода НЕТ.
recon-дизайн + approval-гейт ОБЯЗАТЕЛЬНЫ перед сборкой (big brick ~1.5–3 д).
**Эпик:** [[LIBRARY_EXPORT_PROGRESS_T2]] · база P [[LIBRARY_EXPORT_PERF_P]] (оба SHIPPED). Память [[project_library_export_progress]].

## 0. Сначала ответить на гейт-вопрос (может отменить T3)
**После P (быстрый фетч, ~57/с серверно) + STORE (упаковка за секунды) — фризы UI и память всё ещё реальная проблема?**
- Измерить на профиле владельца (8906/~360 МБ): (а) джанк главного потока во время `generateAsync` (STORE → должен быть лёгким);
  (б) пиковую память вкладки при сборке 360-МБ blob (DevTools Memory). Если оба ОК — T3 можно сократить до **только FSA-стриминга**
  (выбор файла сразу, без 360 МБ в RAM) БЕЗ Web Worker, либо вовсе закрыть эпик. Не строить Worker «потому что в плане».

## 1. Цель (если гейт подтвердит необходимость)
- **Worker offload:** фетч аудио + сборка ZIP уходят с главного потока → UI (карточка/прогресс/прочий Studio) не дёргается.
- **File System Access streaming:** `showSaveFilePicker()` (выбор файла СРАЗУ, на user-gesture, главный поток) →
  `JSZip.generateInternalStream({type:'uint8array'})` эмитит чанки → `writableStream.write(chunk)` → ограниченная память
  (нет ~360 МБ blob в RAM), нет внезапного «Сохранить как» в конце.

## 2. Архитектурный эскиз (проверить в recon)
- Главный поток: пре-флайт (как сейчас) → на «с аудио (поток)» вызвать `showSaveFilePicker()` (нужен user-gesture + window) →
  получить `FileSystemFileHandle`. Сделать `exportBundle()` (OPFS-чтение — быстрое, оставить на main). Запустить Worker,
  `postMessage({payload, keys, handle})` (FileSystemFileHandle сериализуем через postMessage).
- Worker: `handle.createWritable()` (FileSystemWritableFileStream доступен в воркере) → фетч аудио (**параллелизм 12 + `X-Bulk`**
  из P, переносятся как есть) → JSZip `generateInternalStream` → `writable.write()` по чанкам → `writable.close()`.
  Прогресс/пропуски/байты → `postMessage` обратно в карточку. Cancel → `postMessage('cancel')` → worker: abort fetches + не писать дальше.
- JSZip в воркере: грузить через `importScripts('/db/jszip.min.js')` (UMD). Проверить, что текущий `v3LoadJSZip`-фолбэк не нужен в воркере.

## 3. Фолбэк-матрица (ГЛАВНАЯ часть дизайна — R4: без тупиков)
| Среда | FSA `showSaveFilePicker` | Web Worker | Путь |
|---|---|---|---|
| Chrome/Edge desktop | ✅ | ✅ | **T3 полный** (worker + streaming) |
| Firefox desktop | ❌ (нет FSA) | ✅ | worker-сборка blob (UI без фризов) + текущий `a.click()` download |
| Safari desktop | ❌ | ✅ | то же, что Firefox |
| iOS Safari / Android Chrome | ❌ (FSA нет/частично) | ✅ | текущий blob-путь (мобайл уже работает на T2) |
- Детект: `typeof window.showSaveFilePicker === 'function'` + `typeof Worker !== 'undefined'`. Грейсфул-деградация без тупиков.
- Инвариант: на каждом пути — та же карточка/прогресс/отмена/чип/manifest, что в T2 (T3 меняет транспорт, не UX-контракт).

## 4. Риски / края
- **R-T3-1:** `showSaveFilePicker` требует user-gesture — вызвать СИНХРОННО из клика пре-флайта «с аудио (поток)», до любого await.
- **R-T3-2:** cancel через границу воркера — нужен чёткий протокол (main→worker 'cancel'; worker прекращает запись, удаляет/обнуляет
  частичный файл через `writable.abort()`/truncate; FSA позволяет `writable.close()` без флаша? — проверить, чтобы не остался битый файл).
- **R-T3-3:** OPFS-источник аудио ОТПАДАЕТ (выяснено в P: аудио только на сервере) — воркер фетчит по сети. OPFS в воркере не нужен.
- **R-T3-4:** прогресс веса фаз: при стриминге «упаковка» и «запись» сливаются — пересмотреть веса бара (сейчас аудио85/упаковка15).
- **R-T3-5:** аборт частичного файла на диске при отмене/ошибке — не оставить пользователю битый .zip.

## 5. Гейты (как в эпике)
`smoke:reader-parity` (index.html), `smoke:i18n` (если новые ключи — фолбэк-сообщения/«выбрать файл»), `node --check`,
SW bump. server.js НЕ трогаем (P уже дал серверный путь). Прод-верифи: Chrome desktop полный путь + один не-FSA фолбэк.
@380px + RTL для любых новых элементов (кнопка «выбрать файл», статусы).

## 6. Открытые вопросы владельцу (на старте recon)
- (Q1) Гейт §0: после P+STORE фризы/память ещё проблема, или сократить/закрыть T3? (измерить → показать цифры → решить.)
- (Q2) Если строим: имя файла по умолчанию в `showSaveFilePicker` — `library-bundle-<timestamp>.zip`? (как сейчас.)
