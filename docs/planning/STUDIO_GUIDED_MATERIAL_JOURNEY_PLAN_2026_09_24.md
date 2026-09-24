# Ведущий путь «медиа → готовый материал»: план реализации

> Исполнение: владелец поручил реализацию в этой сессии (2026-09-24). Шаги — чекбоксы.

**Цель:** медиа-материал проходит одну задачу от транскрипта до финального экрана с привязанным видео и ▶, а любой разрыв останавливает названный этап.

**Архитектура:** расширяется существующий `LearningMaterialTask` (чистый runner в `public/js/learning-material-task.js`, UI в `public/js/learning-material-task-ui.js`, операции в `public/index.html`). Новый чистый модуль `public/js/media-rebind-core.js` выравнивает сохранённые строки по репликам для ремонта. Схема БД не меняется.

**Стек:** vanilla JS (UMD для node-тестов), `node:test`, wa-sqlite OPFS в браузере.

**Спецификация:** `docs/planning/STUDIO_GUIDED_MATERIAL_JOURNEY_SPEC_2026_09_24.md`.

## Global Constraints

- Строки задачи живут в словаре `words` модуля UI задачи (ru/en/he), как все существующие строки этого модуля. Строки Студии — в `public/i18n/locales/{ru,en,he}.js` с подъёмом `?v=` и лока.
- Любая правка shell-модуля: поднять `?v=` в `public/index.html`, `public/library.html` (если модуль там есть), `public/sw.js` и `server.js` (integrity), `CACHE_VERSION` = `APP_VERSION`.
- Никаких новых платных вызовов; ремонт бесплатен.
- Строки карточки, `word_status`, `review_log` ремонтом не меняются.
- Перед пушем в main: `curl /healthz` → `disk_pct_used` < 90, иначе владелец чистит кэш сборки.

## Review Focus

1. Реплика без слов («...», «♪») в выравнивании ремонта не должна сдвигать курсор и ломать соседей. Тест в Task 7.
2. Строка таблицы, которой нет в транскрипте (модель добавила слово), остаётся без ▶, но не сбивает следующие строки. Тест в Task 7.
3. Задача, созданная до этого релиза (журнал без `playback_proof`), должна продолжаться, а не падать. Тест в Task 1.
4. Проверка контекста перед таблицей должна читать текст этой задачи, а не прошлого материала: проверка стоит после присвоения глобалов в `translate()`. Структурный тест в Task 2.
5. Текстовая задача без медиа (OCR, вставка) не должна требовать привязки. Тест в Task 1.

---

### Task 1: доказательства медиа в runner задачи

**Files:** Modify `public/js/learning-material-task.js` (runner, ~стр. 205–265). Test `tests/learningMaterialTask.test.js`.

**Produces:** `job.playback_proof = {kind:'local'|'youtube', bound_rows, total_rows, missing_rows}`; ошибки `TASK_TABLE_UNSEGMENTED`, `TASK_PLAYBACK_UNBOUND`. `error_reason` берётся из `error.reason`, если он есть (для `TASK_MEDIA_CONTEXT_LOST`). Операция `operations.provePlayback(job) → proof` необязательна: без неё поведение прежнее.

Правило «медиа-задача»: `hasMedia(job) = !!(effectiveImportMeta(job)?.media_package_ref)`.

- [ ] Тесты (падают):
  - медиа-задача, строки без `segment_index` → `TASK_TABLE_UNSEGMENTED`, save не вызван;
  - локальная медиа-задача: после save вызывается `provePlayback`, `bound_rows:0` → `TASK_PLAYBACK_UNBOUND`, состояние `paused`, фаза `binding`; повторный `run` после починки `provePlayback` не вызывает save второй раз;
  - `bound_rows>0` → `playback_proof` в журнале, фаза `bound`, затем `ready`;
  - ошибка `translate` с `{code:'TASK_MEDIA_CONTEXT_LOST', reason:'line:221'}` → `error_reason:'line:221'`;
  - текстовая задача без `media_package_ref` проходит без `provePlayback`;
  - YouTube: `provePlayback` вызывается после `bindPlaybackSource`.
- [ ] Реализация (в runner):

```js
const hasMedia=job=>!!(effectiveImportMeta(job)&&effectiveImportMeta(job).media_package_ref);
// после получения таблицы, до table_ready:
if(hasMedia(job)&&!table.rows.every(r=>Number.isInteger(r&&r.segment_index)))throw codeError('TASK_TABLE_UNSEGMENTED');
// после saved (и после bind для YouTube):
if(hasMedia(job)&&operations.provePlayback&&!job.playback_proof){
  await update({phase:'binding'});
  const proof=await operations.provePlayback(clone(job));
  if(!proof||!(proof.bound_rows>0))throw codeError('TASK_PLAYBACK_UNBOUND');
  job=await update({playback_proof:safe(proof),phase:'bound'});
}
// catch: reason = error.reason || (TASK_SOURCE_MISMATCH ? sourceDiagnosis : null)
```

- [ ] `node --test tests/learningMaterialTask.test.js` зелёный. Commit.

### Task 2: операции Студии — контекст перед таблицей, доказательство ▶, два финала

**Files:** Modify `public/index.html` (`LearningMaterialTaskUI.configure`, ~стр. 34708–34878). Test `tests/learningMaterialTaskUi.test.js` (структурный).

**Consumes:** Task 1. **Produces:** операции `provePlayback(job)`, `openInRoom(job)`, `openInStudio(job)`.

- [ ] `translate()`: после `setActiveWorkspace(ref)` и до `translateTable()`, если `ref`:

```js
const ctx=await v3ResolveMediaContext();
if(!ctx){const res=window.v3LastMediaContextResolution||{};const e=new Error('TASK_MEDIA_CONTEXT_LOST');
  e.code='TASK_MEDIA_CONTEXT_LOST';e.reason=String(res.reason||'NO_CONTEXT')+(res.first_mismatch_line!=null?':'+res.first_mismatch_line:'');throw e;}
```

  `v3ResolveMediaContext` при отказе пишет `first_mismatch_line` — первую строку, где текст расходится с ревизией `intendedPackageId` (через `MediaHost.firstMismatchLine`, новая чистая функция в `media-host.js` с тестом в `tests/mediaHost.test.js`).
- [ ] `provePlayback(job)`: `StudyVideoSourceUI.context(job.saved_text_id)`, привязка `repo.getTextBinding`. `bound_rows` = число строк, у которых `audio.timing` даёт запись; `kind` = youtube/local; `missing_rows` = total − bound.
- [ ] `openInRoom(job)`: закрыть импорт, `location.href = '/library.html?my_text=' + id`. `openInStudio(job)`: `v3LibraryOpenText(id)`.
- [ ] Структурный тест: в теле `translate` строка `v3ResolveMediaContext()` стоит после `setActiveWorkspace` и до `translateTable()`; `provePlayback`/`openInRoom`/`openInStudio` объявлены.
- [ ] Commit.

### Task 3: шкала 7 этапов и финальный экран

**Files:** Modify `public/js/learning-material-task-ui.js` (`stageModel`, `showTask`, `words`). CSS `.lmt-*` в `public/index.html`. Test `tests/learningMaterialTaskUi.test.js`.

- [ ] Тесты `stageModel`:
  - медиа-задача (`import_meta.media_package_ref`): 7 ключей `media, transcript, review, translating, saved, bound, ready`; у локальной задачи в фазе `imported` первые три — `done`, `translating` — `current`;
  - фаза `binding` + `paused` → `bound` = `stalled`;
  - `state:'ready'` → все `done`;
  - текстовая задача — прежние `TEXT_STAGES`, YouTube без `media_package_ref` на старте — те же 7 (media done, transcript current при `transcribing`).
- [ ] `PHASE_AT_MEDIA={imported:3,transcribing:1,transcribed:3,translating:3,table_ready:4,saving:4,saved:5,binding:5,bound:6,exporting:6,ready:6}`.
- [ ] Финальный экран при `state==='ready'` и `playback_proof`: строка «{title} · {n} строк · ▶ у {m} · видео привязано ({kind})», при `missing_rows>0` — «без ▶: {k}», для `local` — «видео хранится в этом браузере». Кнопки «Открыть в Зале» (главная) и «Открыть в Студии»; «Скачать ZIP» — второстепенная.
- [ ] Узкая ширина: `.lmt-stages` при `max-width:480px` скрывает неактивные пункты, показывает «Этап {i} из 7 · {label}». RTL — logical properties.
- [ ] Новые слова ru/en/he: `stageMedia, stageTranscript, stageReview, finalLine, finalMissing, finalLocal, openRoom, openStudio, stageOf, TASK_MEDIA_CONTEXT_LOST, TASK_TABLE_UNSEGMENTED, TASK_PLAYBACK_UNBOUND, mismatchLine, rebindAction, reviewTranscript`.
- [ ] Commit.

### Task 4: экран транскрипта — одна главная кнопка и проверка внутри процесса

**Files:** Modify `public/index.html` (`#v3ImportPreviewWrap`), `public/js/learning-material-task-ui.js` (`start`), locales.

- [ ] Порядок кнопок: `#v3ImportPrepareTask` «Собрать учебный материал» — единственная `btn-primary`, первая. «Исправить транскрипт» и «Продолжить в Студии вручную» (переименование `continueDraftBtn`) — `btn-secondary`.
- [ ] `start()` для медиа-входа показывает этап ③: кнопки «Проверить и исправить транскрипт» и «Собрать учебный материал». Проверка открывает `StudioMediaEditor.open(track)` и по закрытию редактора перечитывает текущую ревизию рабочего пространства: `input.source_text` = реплики, `import_meta.media_package_ref.revision_id` = новая ревизия. Отметка `transcript_review:'edited'|'skipped'` в журнале.
- [ ] Тест: `start` с медиа-входом рисует кнопку проверки; без медиа — нет.
- [ ] Commit.

### Task 5: полоса «Продолжить» после перезагрузки

**Files:** `public/js/learning-material-task-ui.js` (`resumeBanner`), `public/index.html` (контейнер `#lmtResumeBanner` над рабочей сеткой Студии).

- [ ] Чистая `pickResumable(jobs, now)`: `state ∈ {running,paused,stopping}`, `updated_at` не старше 14 дней, самая свежая. Тест.
- [ ] На `DOMContentLoaded` после `configure`: `store.list()` → полоса «Материал „{title}“ — {stage} · Продолжить / Скрыть». `running` после перезагрузки показывается как `paused` (раннер не активен). Причина остановки словами.
- [ ] Commit.

### Task 6: ручная Студия не теряет медиа молча

**Files:** `public/index.html` (`v3ResolveMediaContext` → `v3MediaLostBarRefresh()`, разметка `#v3MediaLostBar`, `v3LibrarySaveCurrentCore` guard), locales.

- [ ] Полоса видна при `window.v3MediaIntentLost && !acknowledged`: «Видео не будет привязано: строка {n} отличается от транскрипта». Действия: «Вернуть текст транскрипта» (текст текущей ревизии пакета `package_id` в `#inputText` + `input`-событие; прежний текст сохраняется в `window.v3MediaLostPreviousText` для «Отменить») и «Продолжить без видео» (`acknowledged=true`).
- [ ] Сохранение при неподтверждённом флаге останавливается: toast + фокус на полосу.
- [ ] Структурный тест: `v3LibrarySaveCurrentCore` проверяет `v3MediaIntentLost`; `v3ResolveMediaContext` вызывает `v3MediaLostBarRefresh`.
- [ ] Commit.

### Task 7: чистое выравнивание по диапазонам реплик

**Files:** Create `public/js/media-rebind-core.js`. Test `tests/mediaRebindCore.test.js`.

**Produces:** `MediaRebindCore.alignRowsToSegmentSpans(rowTexts, segments, {normalize}) → {rows:[{row_index, segment_index|null}], bound, total}`, `planRebind(rows, revision) → {mapping:{rows:[{row_index, caption_segment_id}]}, bound, total, ratio}`.

- [ ] Тесты:
  - 3 реплики → 2 строки (строка 0 = реплики 0+1) → индексы `[0, 2]`;
  - реплика «...» между словами не мешает (пропускается курсором);
  - строка с лишним словом → `null`, следующая строка привязывается;
  - строки в обратном порядке не привязываются задним числом;
  - пустые входы → `bound:0`.
- [ ] Алгоритм: поток слов реплик `{word, seg}`; курсор. Для строки: слова строки; поиск точного вхождения в потоке, начиная с курсора, окно ≤ 60 слов; найдено — `segment_index = seg первого слова`, курсор = конец вхождения; нет — `null`. Нормализация — `AsrTranscript.stitchNormalizeWords`, передаётся через deps.
- [ ] Commit.

### Task 8: «Привязать медиа» в Импорт-центре → «Материалы»

**Files:** `public/js/studio-portable-learning-package.js` (`openMaterialActions`), `public/index.html` (подключение `media-rebind-core.js`), locales.

- [ ] Кандидат пакета: `source_meta_json` карточки → `source.media_package_ref` (или `captions/audio`), иначе поиск рабочего пространства, чья текущая ревизия содержит все слова строк карточки. Нет — действие не показывается.
- [ ] Действие показывается, если привязки нет или `provePlayback`-подсчёт = 0.
- [ ] Предпросмотр: `planRebind` → «▶ получат {bound} из {total} строк». При `ratio < 0.8` — пояснение и ссылка «Пересобрать таблицу по сегментам» (запуск задачи со сметой).
- [ ] Подтверждение: пересчёт плана; при изменении строк — новый предпросмотр. `repo.bindText({text_id, package_id, track_id, revision_id, revision_sha256, mapping})`. Затем подсчёт ▶ тем же путём, что `provePlayback`, и итог на экране.
- [ ] Commit.

### Task 9: релиз и проверка

- [ ] Версии: `learning-material-task(-ui).js`, `media-host.js`, `studio-portable-learning-package.js`, новый `media-rebind-core.js` в index.html, sw.js PRECACHE, server.js integrity; локали `?v=` + лок; `CACHE_VERSION`/`APP_VERSION`.
- [ ] `npm test` (без новых падений относительно 7 известных), `node tests/i18n.smoke.js`.
- [ ] Браузер (локальный сервер, чистый профиль, провайдер подменён): финальный экран и полосы в ru/he, светлая/тёмная, 390 px.
- [ ] Диск прода < 90 → push в main → проверка версии.
- [ ] Ремонт «Хан Юнес» — владельцем, через «Привязать медиа».
