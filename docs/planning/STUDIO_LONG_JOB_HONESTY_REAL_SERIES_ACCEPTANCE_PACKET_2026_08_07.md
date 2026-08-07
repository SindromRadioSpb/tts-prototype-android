# Studio: честная длинная задача и реальная приёмка сериями 5–9

Дата: 2026-08-07  
Статус: **IMPLEMENTATION SHIPPED / OWNER DECISIONS OPEN** — P0–P3 на production; реальный набор
серий 5–9 сохранён, но смешанные провайдеры и дубль серии 6 требуют решения владельца.
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

## 9. P3 — терминальное сохранение без двусмысленного второго клика

Владелец утвердил реализацию после живого наблюдения сохранения `В сокрытии - 7`.
До исправления атомарная запись завершалась успешно, но success-path вызывал закрытие, пока
`v3SaveMetaSaving === true`; busy-guard отклонял закрытие и оставлял форму с устаревшими
действиями `Отмена / Сохранить как новый / Обновить`. Пользователь не мог отличить завершённое
сохранение от незавершённого и был вынужден решать, нажимать ли повторно.

### Контракт P3

- успешная запись заканчивается устойчивым receipt в той же модалке: название, число строк,
  фактический провайдер, именованный media-binding outcome, состояние необязательного кэша и
  время сохранения;
- receipt прямо говорит, что повторно сохранять не нужно, и предлагает только терминальные
  действия `Открыть в библиотеке / Экспорт / перенос / Готово`;
- неизменённая уже сохранённая карточка имеет disabled-состояние `Сохранено`, поэтому повторный
  клик не создаёт дубль;
- восстановление результата другого провайдера из локального table cache переводит сессию в
  `draft`, поэтому новую версию можно сохранить, а не застрять на кнопке `Сохранено`;
- если карточка уже связана с immutable media material, UI предлагает явную новую версию и не
  показывает заведомо запрещённое destructive update;
- отказ обычного save и save-as-new остаётся в модалке и называет повторное действие; rejection
  не утекает как невидимая ошибка;
- отказ необязательного `TABLE_CACHE_KEY` отделён от результата канонической записи: карточка не
  объявляется потерянной, но пользователь получает named next action;
- несвязанная TTS-команда называется `Сохранить ключ`, а не вторым общим `Сохранить`;
- 380 px RU/HE: нет горизонтального overflow, terminal actions имеют 48 px, receipt получает
  фокус и доступен через `role=status` + `aria-live=polite`.

### Allowlist P3

- `public/index.html`
- `public/i18n/locales/{ru,en,he}.js`
- `public/sw.js`
- `tests/i18n.locale-version.lock.json`
- `tests/studioSaveProgress.test.js`
- этот packet

### Доказательства до production deploy

- red-before-fix: шесть исходных P3-контрактов упали до реализации; отдельный save-as-new
  rejection-контракт также доказан красным до catch-path;
- targeted: `tests/studioSaveProgress.test.js` — **11/11 PASS**;
- 380 px Playwright RU/HE — `scrollWidth=380`, settled action height `48px`, focus на receipt,
  HE panel bottom `838 <= 844`;
- `smoke:i18n` — **233/233 PASS**;
- media-package **72/72 PASS**, material-revision **19/19 PASS**, оба browser-smoke PASS;
- Import Center browser, room-media, media-karaoke и text-card round-trip PASS;
- полный suite после P3: **866 total / 862 pass / 4 fail** — прежний набор из четырёх baseline
  failures, новых падений нет. `smoke:studio-chunks` (двойной retry count) и portability
  `studio-exact-binding` отдельно воспроизведены на чистом `HEAD 0db64fd6` и не относятся к P3.

Release/cache target: **3.11.338**. Production и owner-live evidence дописываются только после
фактически отданной этой версии и cold reload; push/webhook сами по себе не являются PASS.

### Production / owner-live evidence

- `3.11.338` реально отдан production после cold reload; `MIGRATIONS.length === 48`.
- На реальном материале `В сокрытии - 8.mp4` Local ASR сохранил content identity
  `681642eca00f799c8919834aff11c0308af408d7af308a890316fcfee0fb77c1`; Google Free собрал
  `566` строк из `527` ASR-сегментов без смены выбранного провайдера.
- Карточка `В сокрытии - 8` сохранена один раз: id
  `bf9ca39a-eb14-46cc-ad02-73f400fb1fd6`, provider `google-free`, media outcome
  `bound_verified`, package `mpkg:681642ec…77c1`, revision `rev:3bfbb66a…e15`.
- Реальный receipt доказал терминальный success-state, но выявил противоречие: при отказе
  необязательного draft-cache он одновременно показывал `Повторно сохранять не нужно` и старое
  pre-save действие `сохраните карточку сейчас`. Новый red-контракт воспроизвёл дефект до кода.
- В `3.11.339` post-save cache copy отделён от pre-save recovery copy: receipt честно сообщает,
  что карточка и таблица уже сохранены и сейчас ничего делать не требуется. Targeted
  `studioSaveProgress` — **12/12 PASS**, `smoke:i18n` — **233/233 PASS**, полный suite —
  **867 total / 863 pass / те же 4 baseline fail**, новых падений нет.

Cold reload `3.11.339` сохранил read-back карточки, но обнаружил второй UX-дефект: boot-restore
принимал только `mode=library`, а только что сохранённая карточка имела `mode=saved`. Поэтому
данные оставались в БД, но редактор был пуст, а несинхронизированная кнопка снова выглядела как
`Сохранить`. Отдельный red-контракт фиксирует, что оба канонических режима обязаны переоткрыть
карточку через `v3LibraryOpenText`.

После boot-restore исправления: `studioSaveProgress` — **13/13 PASS**, полный suite —
**868 total / 864 pass / те же 4 baseline fail**, новых падений нет.

### Final production read-back (`3.11.340`)

- Served shell после cold reload: `3.11.340`, commit `5913b044`; browser schema — 48 миграций.
- `В сокрытии - 8` переоткрылась из `mode=saved` через канонический Library path: в редакторе
  `566` строк, `tableStale=false`, кнопка disabled `✓ Сохранено`, console errors — 0.
- Read-back сохранил единственную карточку `bf9ca39a-eb14-46cc-ad02-73f400fb1fd6`, provider
  `google-free`, `bound_verified`, package `mpkg:681642ec…77c1`, revision `rev:3bfbb66a…e15`.
- Финальный локальный gate: **868 total / 864 pass / те же 4 baseline fail**; новых падений нет.

### Фактический owner-live набор 5–9

| Карточка | ID | Провайдер | Строки | Медиа |
|---|---|---:|---:|---|
| `В сокрытии - 5` | `6ef735e8-f04a-424a-a0b0-354333b57d2a` | Gemini | 469 | `bound_verified`, `mpkg:1cc8090c…f554` |
| `В сокрытии - 6` | `af96921b-3ddc-4d3c-97cf-a29d575105eb` | Gemini | 503 | `bound_verified`, `mpkg:0b91006a…508d` |
| `В сокрытии - 6` | `d271b2bf-b71f-459c-9bb0-1d01b0d73504` | Gemini | 503 | тот же exact package; вероятный дубль |
| `В сокрытии - 7` | `f28cb766-3e6c-4969-baed-1b92344f40c2` | Google Free | 555 | `bound_verified`, `mpkg:fd67047f…bc44` |
| `В сокрытии - 8` | `bf9ca39a-eb14-46cc-ad02-73f400fb1fd6` | Google Free | 566 | `bound_verified`, `mpkg:681642ec…77c1` |
| `В сокрытии - 9` | `670dd59b-5383-420c-b642-6e0ab1daf1bc` | Google Free | 567 | `bound_verified`, `mpkg:76c4da5f…1dbc` |

Не закрывать пакет как полную первоначальную Gemini-приёмку без двух решений владельца:

1. какую из двух карточек `В сокрытии - 6` оставить (до решения не архивировать и не удалять);
2. принять ли Google Free для 7–9 как финальный результат либо отдельно создать Gemini-версии.

Отдельно остаётся owner-iPhone interaction PASS для Студии. Автоматические и 380 px RU/HE gates
его не заменяют.
