# Studio: честная длинная задача и реальная приёмка сериями 5–9

Дата: 2026-08-07  
Статус: **APPROVED / IN PROGRESS** — владелец подтвердил порядок 2026-08-07.  
Предшественники: `STUDIO_HONEST_IMPORT_TO_CARD_DECISION_PACKET_2026_08_06.md`,
`STUDIO_INGEST_LOCAL_ASR_WINDOWS_BETA_ENABLEMENT_PACKET_2026_07_31.md`,
`STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md`.

## 1. Цель и измеримый результат

1. Сохранение большой карточки показывает реальный прогресс и остаётся одной атомарной
   локальной операцией: ошибка не оставляет полукарточку.
2. Число строк, которым доказательно доступен replay, считается одной функцией и не меняется
   после `save -> cold reload` при неизменных строках и ревизии.
3. Длинный Gemini-job показывает пользователю cache/generate/retry/repair/split, номер попытки,
   исчерпанный бюджет и точное следующее действие; готовые чанки можно продолжить после reload.
4. Серверный Gemini-ответ запрашивается в строгой JSON-схеме и всё равно проходит локальную
   семантическую валидацию. Это reliability-изменение, а не смена провайдера или модели.
5. Реальная приёмка: пять последовательных материалов `В сокрытии - 5` … `- 9` проходят
   Local ASR -> Gemini -> save-as-new -> cold reload; у каждого фиксируются card id, row count,
   media SHA-256, доказанное replay coverage и отсутствие потери медиа.

## 2. Read-only baseline

- repo/`origin/main`: `db46eca171ceb149ae6e51200742674aaff32f03`;
- production: `3.11.334`;
- browser OPFS `MIGRATIONS.length`: **48** (серверные SQL migrations — другая схема);
- Local ASR Companion слушает только `127.0.0.1:8799`; RTX 3070 доступна;
- все пять MP4 существуют, 101.31–142.20 MiB;
- незатронутые изменения владельца в dirty worktree сохраняются;
- baseline тестов из предыдущего шага: 848 total, 844 pass, четыре известных падения;
  блокирует только новое падение.

## 3. Порядок и stop conditions

Порядок жёсткий: **P0 -> gates/reload -> P1 -> gates/reload -> P2 -> gates/reload ->
реальные серии по одной**. Следующий шаг не начинается при новом падении.

Стоп без догадки:

- media SHA не совпал или content-addressed resolver неоднозначен;
- после save/reload изменилось доказанное покрытие;
- локальный ASR ушёл с pinned-модели/CUDA-профиля или предлагает cloud fallback;
- Gemini исчерпал объявленный retry/quota budget;
- транзакция сохранения оставила частичную карточку;
- требуется изменение схемы, provider default или массовая перепривязка.

## 4. P0 — coverage invariant и сохранение

### Контракт

- `playable row` — только строка, для которой текущий паспорт разрешает реальную кнопку replay.
  Для `aligned-partial-proven` это только целый `row_seg_idx`; для exact binding — только
  непустой caption id; нет интерполяции/соседа/голосования.
- DOM-наблюдатель не считает намеренно blind/unmapped строки «недорисованными» и не запускает
  бесконечный remove/re-add цикл.
- сохранение строк использует один guarded batch внутри уже открытой транзакции; прогресс
  `строк записано / всего` виден в save modal. Commit, binding и promotion названы отдельными
  фазами. Закрытие модалки до завершения запрещено.

### Allowlist P0

- `public/js/media-host.js`
- `public/db/local-db.js`
- `public/index.html`
- `public/i18n/locales/{ru,en,he}.js`
- `public/sw.js` and `tests/i18n.locale-version.lock.json` (release/cache lock only)
- `tests/mediaHost.test.js`
- `tests/studioSaveProgress.test.js`
- этот packet

### Red-before-fix

1. Partial map `[0,null,2]`: playable=2, blind row не требует augment, повторная проверка после
   рендера возвращает zero missing.
2. Exact map с дырой даёт те же правила и тот же count.
3. Save path обязан использовать batch writer и передавать монотонный row progress; writer
   делает guard/max-index/clear-derived/touch ровно по одному разу на batch.
4. 380 px RU/HE: длинный прогресс не вызывает горизонтальный overflow, кнопки disabled.

## 5. P1 — честный long-job

### Контракт

- единый видимый HUD: `cache | generate | retry | repair | split | done | stopped`;
- `chunk k/n`, attempt `a/b`, готовые/всего строки, elapsed и следующий шаг;
- retry никогда не скрыт и не создаёт новый логический job; готовые чанки не оплачиваются снова;
- reload восстанавливает только доказанные cached chunks и текущий план; автоматически не
  запускает ASR, перевод или расход провайдера;
- чип media continuity до запуска и после сборки показывает exact SHA / intended-but-unbound;
- реальная 380 px RU/HE проверка плюс owner iPhone Studio interactions.

### Точный allowlist P1 (зафиксирован после P0 gates)

- `public/index.html`
- `public/js/table-job.js` — один новый узкий pure job-journal module
- `public/i18n/locales/{ru,en,he}.js`
- `public/sw.js`, `tests/i18n.locale-version.lock.json` — только precache/release lock
- `tests/tableJob.test.js`, `tests/studioTableJobUi.test.js`

`public/js/table-chunks.js` не потребовал изменения. Любое расширение за этот список — стоп.

## 6. P2 — Gemini structured-output reliability

### Контракт

- сервер запрашивает JSON response MIME/schema для существующей табличной формы;
- локальный parser/validator остаётся обязательным: schema mode не объявляется гарантией смысла;
- один bounded retry и существующий 120 -> 60+60 fallback видимы клиенту;
- cache key/provider default/model default не меняются без отдельного решения;
- без миграций и без записи производного timing в канон.

### Точный allowlist P2 (зафиксирован после P1 gates)

- `server.js`
- `ingest/geminiTableSchema.js` — один узкий pure schema module
- `tests/geminiStructuredOutput.test.js`
- этот packet

Клиент, cache key, модель и provider default на P2 не меняются. `/api/client-config` получает
только проверяемые флаги `structuredOutput=true`, `semanticValidation=true` для prod-гейта.

## 7. Реальные материалы

Обработка строго последовательно, одна серия за раз:

1. `C:\Users\lletp\Downloads\В сокрытии\В сокрытии - 5\В сокрытии - 5.mp4`
2. `...\В сокрытии - 6\В сокрытии - 6.mp4`
3. `...\В сокрытии - 7\В сокрытии - 7.mp4`
4. `...\В сокрытии - 8\В сокрытии - 8.mp4`
5. `...\В сокрытии - 9\В сокрытии - 9.mp4`

Имена новых карточек: `В сокрытии - N gemini`. Один финальный Gemini text-card на серию;
Local ASR transcript остаётся канонической медиа-ревизией того же материала, отдельная
дублирующая text-card не создаётся.

Для каждой серии: exact file SHA -> Local ASR pinned profile -> human-review warning retained ->
Gemini chunks -> save-as-new -> cold reload -> media source `studio-exact-binding` или честный
`not_bound` -> replay coverage invariant -> запись card id/rows/provider.

## 8. Явные запреты

Нет интерполированного timing; нет массовой перезаписи существующих bindings; нет автоматического
ASR/перевода; нет derived timing в каноне; нет schema migrations; нет изменения provider defaults;
нет параллельных ASR/Gemini jobs; нет реализации общей L2b batch queue в этом слайсе. Запрос из
пяти файлов документирует demand-trigger для отдельного L2b решения, но не расширяет этот пакет.
