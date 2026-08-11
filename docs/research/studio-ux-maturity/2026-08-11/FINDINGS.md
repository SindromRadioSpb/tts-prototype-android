# FINDINGS — evidence-backed реестр

## Сводка

| Severity | Количество | IDs |
|---|---:|---|
| P0 | 1 | UXM-001 |
| P1 | 7 | UXM-002…UXM-008 |
| P2 | 6 | UXM-009…UXM-014 |
| P3 | 0 | — |

P3 намеренно пуст: эстетические предпочтения без измеримого последствия не включались.

## UXM-001 — ложный источник после captions import

- **Поверхность / сценарий:** main Studio status; A/D до canonical save.
- **Наблюдаемый факт:** после YouTube panel paste UI показывает `Источник: локальный ввод`,
  хотя `window.v3LastImportMeta` содержит `kind=captions`, `source=вставка расшифровки`,
  `method=captions-panel` и валидный media package reference. После reload resolver способен
  восстановить revision, но label остаётся default-local.
- **Evidence:** [mobile screenshot](screenshots/mobile-ru-imported-false-source.png);
  DOM readback `classicSourceStateChip`; `public/index.html:20634-20722` сводит source только к
  `saved/cache/default`; `public/js/studio-import.js:1936-2081` записывает корректный passport.
- **Последствие / severity:** **P0** по заданному определению — интерфейс сообщает ложный
  результат происхождения. Это может привести к неверному решению о privacy, timing и
  возможности karaoke.
- **Роли:** R4, R11, R12, R14, R15.
- **Рекомендуемое изменение:** строить source chip и next action из существующей
  `v3ResolveMediaContext()`/passport projection; при ambiguity показывать `Источник не
  подтверждён`, никогда не угадывать.
- **Общий Studio/Room контракт:** да, read-only projection shared provenance; canon не менять.
- **Риск регрессии:** medium — неправильный reducer может привязать stale passport.
- **Необходимые тесты:** red test captions/media/manual/library/cache/ambiguous; cold reload;
  exact line mismatch; Room save/reopen provenance parity; zero canonical writes.

## UXM-002 — `Материалы 1` ведёт в `Все · 0`

- **Поверхность / сценарий:** composer draft counter, Device workspace shelf, Import Center;
  E и mid-A/D.
- **Наблюдаемый факт:** unsaved transcript revision учитывается кнопкой `✎ Материалы 1`,
  но `Все материалы` открывает P4 materials view с `Все · 0`. Shelf title `Media transcript`
  и `Версия 1` доказывает существующий draft, однако P4 catalog считает learning materials.
- **Evidence:** [draft shelf](screenshots/mobile-ru-device-draft.png) и
  [count conflict](screenshots/mobile-ru-materials-count-conflict.png); live return
  `{before:"Материалы 1", materials:0}`; `studio-media-package.js:42,319-326` против
  `studio-portable-learning-package.js` P4 catalog; copy keys `ru.js:3497`.
- **Последствие / severity:** **P1** — пользователь не знает, потерян ли материал, и попадает
  в тупик при штатном возврате к работе.
- **Роли:** R4, R5, R11, R12, R15.
- **Рекомендуемое изменение:** одна lifecycle projection над существующими canonical
  repositories: `Черновики` и `Учебные материалы` как состояния одного Import Center, не
  второй список/хранилище. До такого slice немедленно переименовать counter в `Черновики 1`
  и не обещать, что P4 filter покажет его.
- **Общий контракт:** да; именно поэтому запрещён второй catalog.
- **Риск:** high для полноценной union projection, low для честного relabel/routing.
- **Тесты:** draft-only/media-only/material/archived/repairable union; no duplicates; stable
  catalog keys; zero promotion on read; cold reopen; Room catalog unchanged.

## UXM-003 — Add Material не изолирует focus

- **Поверхность / сценарий:** Add Material modal; A–F.
- **Наблюдаемый факт:** `aria-modal=true`, но open лишь снимает class `hidden`. Focus остаётся
  на background Add Material; четыре последовательных `Tab` идут в background actions;
  background не inert. После Close active element остаётся внутри скрытого modal. Для
  comparison Import Center ставит focus на close, traps Tab и возвращает opener.
- **Evidence:** keyboard trace: `Упростить → Импорт/перенос → Материалы 1 → Собрать таблицу`,
  всё `inModal=false`; `studio-import.js:1842-1888`; modal markup
  `index.html:49169`; working reference `studio-portable-learning-package.js:182-188,339-344`.
- **Последствие / severity:** **P1** — keyboard/screen-reader user взаимодействует с
  невидимым фоном и теряет позицию после закрытия.
- **Роли:** R4, R11, R15.
- **Изменение:** перенести проверенный focus lifecycle Import Center в bounded modal helper
  или локально реализовать opener capture, initial focus, trap, Escape/backdrop close и
  focus return. Shared extraction разрешить только после двух доказанных consumers.
- **Общий контракт:** нет, presentation/interaction only.
- **Риск:** medium — nested dialogs/file chooser/editor.
- **Тесты:** keyboard order, Shift+Tab, Escape, backdrop, close after preview, editor handoff,
  focus return to exact opener, screen-reader dialog name.

## UXM-004 — основной media picker недоступен с клавиатуры

- **Поверхность / сценарий:** Device → `Медиа на иврите → транскрипт`; B/C.
- **Факт:** control визуально выглядит кнопкой, но это `<label>` без `role`, `tabindex` и
  `for`, оборачивающий hidden input. DOM: label `tabIndex=-1`, input `hidden=true`, нет
  accessible name; control отсутствует в focusable/AX button path.
- **Evidence:** [device screenshot](screenshots/mobile-ru-device-draft.png);
  `index.html:49292-49295`; keyboard/DOM readback.
- **Последствие / severity:** **P1** — основной local media сценарий невозможен без pointer.
- **Роли:** R4, R11, R15.
- **Изменение:** настоящий `<button>` вызывает hidden input (как captions button ниже) либо
  видимый labelled input; сохранить тот же handler/accept и не менять provider defaults.
- **Общий контракт:** нет.
- **Риск:** low; iOS file picker activation обязан оставаться в прямом user gesture.
- **Тесты:** Enter/Space; accessible name RU/HE/EN; iPhone Files/Photos owner-live; accept
  filters; cancel picker; no double invocation.

## UXM-005 — основной вход в Studio ниже первого mobile viewport

- **Поверхность / сценарий:** Studio start, `380×844`, A–D.
- **Факт:** Add Material расположен на `y=1171`; table/TTS на `y≈1463`. До главного дела
  показаны quota, generic title и крупная сетка Library/Dashboard/SRS/Room/tools. Ни одна из
  пяти composer actions не видна в первом viewport; horizontal overflow при этом `0`.
- **Evidence:** [mobile start](screenshots/mobile-ru-start.png),
  [desktop start](screenshots/desktop-ru-start.png), DOM boxes.
- **Последствие / severity:** **P1** — первый запуск не объясняет следующего действия и
  выглядит как product switcher, а не Studio workspace.
- **Роли:** R4, R5, R11.
- **Изменение:** на mobile поднять компактный phase header + единственный next CTA над
  secondary navigation; navigation остаётся доступной в collapsible/utility layer. Desktop
  сохранить dense workspace.
- **Общий контракт:** нет; ссылки в Room/Library не менять.
- **Риск:** medium — responsive CSS shared shell.
- **Тесты:** 320/360/380/430 widths, long locales, safe areas, scroll restoration,
  navigation reachability, desktop parity.

## UXM-006 — равноправные действия заставляют помнить порядок

- **Поверхность / сценарий:** composer и captions preview; A–E.
- **Факт:** composer показывает пять primary-like actions; transcript preview одновременно
  предлагает `Исправить`, `Продолжить`, `Упростить`, `Закрыть`, сохраняя выше captions и
  Downr actions. Между `Исправить` и `Продолжить` не объяснено, какой выбор сохраняет timing
  и какой является рекомендуемым.
- **Evidence:** [transcript preview](screenshots/mobile-ru-transcript-preview.png); live button
  list; markup `index.html:49345-49347`.
- **Последствие / severity:** **P1** — основной сценарий превращается в выбор архитектурной
  ветки, пользователь несёт workflow в памяти.
- **Роли:** R4, R5, R11, R15.
- **Изменение:** один primary по phase (`Проверить транскрипт` → `Создать таблицу` →
  `Сохранить` → `Учиться`), остальные действия — secondary/overflow; recommended path
  вычисляется из existing state, не записывается в новый canon.
- **Общий контракт:** косвенно да — нельзя автоматически ASR/translate/promote.
- **Риск:** medium — hidden secondary action может ухудшить expert flow.
- **Тесты:** every state exactly one primary-like CTA; all old actions reachable; keyboard;
  analytics-free deterministic state matrix; no implicit provider calls.

## UXM-007 — HE/RTL dark делает навигацию почти невидимой

- **Поверхность / сценарий:** `380×844`, HE/RTL, dark.
- **Факт:** nav labels contrast `1.07:1`, MT `1.11:1`, footer `2.35:1` при требуемых
  `4.5:1`. CSS использует undefined `--theme-text` fallback `#1a202c` на background
  `#1e293b`. Lighthouse accessibility `94`, contrast audit fail.
- **Evidence:** [dark screenshot](screenshots/mobile-he-rtl-dark-contrast.png);
  `index.html:599-625`; Lighthouse selectors `#btnLibrary`, `#btnDashboard`,
  `#btnSrsTrainer`, `#btnReadingRoom`, `#btnLocalMtSettings`.
- **Последствие / severity:** **P1** — основные destinations визуально недоступны.
- **Роли:** R4, R5, R11.
- **Изменение:** use `--theme-text-primary/secondary`, remove opacity compounding, set tool
  foreground explicitly; validate all supported theme×locale pairs.
- **Общий контракт:** нет.
- **Риск:** low-medium, CSS specificity.
- **Тесты:** axe contrast snapshots light/dark RU/HE; visual regression 380/desktop; forced
  colors sanity.

## UXM-008 — Downr continuity существует только в живом modal state

- **Поверхность / сценарий:** B.
- **Факт:** после успешного handoff `Я скачал — выбрать файл` появляется и правильно
  переводит в Device picker. Но `open()` всегда очищает URL, возвращает tab на Article и
  `resetDownrHandoff()` скрывает recovery CTA. Refresh/reopen заставляет помнить URL,
  внешний шаг и нужную вкладку.
- **Evidence:** [video/Downr screenshot](screenshots/mobile-ru-video-downr.png);
  `studio-import.js:997-1044`, `1842-1872`; actual return ended on `С устройства`.
- **Последствие / severity:** **P1** — ожидаемая external handoff ветка ломается от обычного
  mobile tab eviction/reload.
- **Роли:** R4, R11, R14, R15.
- **Изменение:** хранить bounded non-canonical handoff intent (`videoId`, startedAt, next
  action) session-locally; после reopen предложить `Продолжить: выбрать скачанный файл` и
  явный discard. Не хранить downloaded media и не создавать acquisition service.
- **Общий контракт:** нет canonical write; transient projection only.
- **Риск:** medium — stale intents/не тот ролик.
- **Тесты:** reload, close/reopen, expired intent, new URL replaces old, no stale provenance,
  popup blocked, iPhone tab return owner-live.

## UXM-009 — техническая архитектура просачивается в primary copy

- **Поверхность / сценарий:** captions preview, media readiness, local ASR, recovery.
- **Факт:** пользователь видит `провайдер Gemini`, `Pairing token`, `local job`, `чанки`,
  `relink по SHA-256`, `slim Media Package`. Часть нужна в Technical details, но не как
  объяснение ближайшего действия.
- **Evidence:** [preview](screenshots/mobile-ru-transcript-preview.png),
  [device modal](screenshots/mobile-ru-device-draft.png); markup `index.html:49272-49328`;
  code error mapping `studio-import.js:803-824`.
- **Последствие / severity:** **P2** — заметно снижает premium clarity, хотя путь остаётся
  функциональным.
- **Роли:** R4, R5, R14, R15, R16.
- **Изменение:** primary copy через intent (`На этом компьютере`, `В облаке`, `Подключить
  локальную обработку`); provider/model/hash/cost сохранить в disclosure/technical details.
- **Общий контракт:** да для honesty; сведения нельзя удалить, только правильно слоить.
- **Риск:** medium — oversimplification privacy/cost.
- **Тесты:** copy assertions local/cloud/cost; technical detail retains provider/model/SHA;
  no false fallback.

## UXM-010 — HE/RTL остаётся частично русским

- **Поверхность / сценарий:** HE/RTL main/settings/modal.
- **Факт:** `61 символ`, aria-label `Язык интерфейса`, `Авто (по умолчанию)`, `Транслит:` и
  `TTS: System fallback` остаются mixed-language. RTL mirroring и overflow при этом работают.
- **Evidence:** [HE light modal](screenshots/mobile-he-rtl-device-modal.png),
  [HE dark](screenshots/mobile-he-rtl-dark-contrast.png); DOM locale readbacks.
- **Последствие / severity:** **P2** — premium finish и screen-reader consistency нарушены.
- **Роли:** R4, R5, R11.
- **Изменение:** убрать hardcoded formatted strings, локализовать accessible name и composed
  labels; не менять canonical values/provider ids.
- **Общий контракт:** нет.
- **Риск:** low-medium из-за locale cache/version lock.
- **Тесты:** i18n symmetry + literal scanner + accessible-name snapshots + cache bump lock.

## UXM-011 — imported transcript помечает ещё не существовавший result как stale

- **Поверхность / сценарий:** A/D после `Исправить транскрипт`.
- **Факт:** shell показывает `Текст был изменён. Требуется повторная озвучка и пересборка
  таблицы`, хотя в fresh flow таблицы/аудио ещё не было. `markResultsStale()` всегда включает
  notice даже когда `hasTable=false` и `hasAudio=false`.
- **Evidence:** live observation; `index.html:21580-21615`.
- **Последствие / severity:** **P2** — первое создание выглядит как повреждение результата.
- **Роли:** R4, R5, R11.
- **Изменение:** показывать stale notice только если реально существовал derived result;
  иначе next state `Транскрипт готов к проверке/таблице`.
- **Общий контракт:** нет; stale flags не ослаблять при существующем result.
- **Риск:** medium — нельзя скрыть настоящую stale table.
- **Тесты:** 0/only-table/only-audio/both; import vs manual edit; cold restore.

## UXM-012 — tap targets неоднородны

- **Поверхность / сценарий:** mobile shell/modal.
- **Факт:** ряд utility/actions высотой `39–42px`; MT `45×40`; основные table/TTS `48px`.
  В Import Center close `55×55` и filters `44px`, то есть внутри продукта уже есть лучший
  эталон.
- **Evidence:** DOM bounding boxes; screenshots start/modal.
- **Последствие / severity:** **P2** — повышает miss-tap risk, особенно рядом с modal close.
- **Роли:** R4, R11.
- **Изменение:** минимум `44×44 CSS px`, preferred `48` для primary mobile targets; не
  растягивать все controls full-width без hierarchy.
- **Общий контракт:** нет.
- **Риск:** low-medium — wrapping/height.
- **Тесты:** box assertions 380/320, long HE/RU strings, no overflow.

## UXM-013 — после save нет одного явного следующего результата

- **Поверхность / сценарий:** A/C/D после save.
- **Факт:** canonical save работает, receipt предотвращает повторное сохранение (`Повторно
  сохранять не нужно`), Library reopen работает. Но success state не сводит выбор к
  `Продолжить учиться` / `Открыть в Читальном зале`; пользователь остаётся среди export,
  TTS, table и navigation actions.
- **Evidence:** actual isolated save/reopen; session `mode=saved`, Library source and table
  restored; existing button hierarchy in start screenshots.
- **Последствие / severity:** **P2** — результат достигнут, но product value не завершён.
- **Роли:** R4, R5, R15.
- **Изменение:** non-destructive success panel с одним context primary и secondary
  `Остаться в Студии`; destination uses existing Library/Room routes.
- **Общий контракт:** да, route-only; Room data/model не менять.
- **Риск:** low-medium — wrong route before save receipt.
- **Тесты:** success only after canonical save; cache failure still says saved; Room cold open;
  back to Studio.

## UXM-014 — базовая document semantics неполна

- **Поверхность / сценарий:** full Studio, screen reader.
- **Факт:** Lighthouse не находит один `<main>` landmark; visible `MT` не входит в accessible
  name `настройки локального перевода с MADLAD`.
- **Evidence:** Lighthouse accessibility `94`, failed audits `landmark-one-main` и
  `label-content-name-mismatch`.
- **Последствие / severity:** **P2** — ухудшается быстрая навигация и voice-control matching.
- **Роли:** R4, R11.
- **Изменение:** один main landmark вокруг workspace; accessible name включает visible
  token (`MT — …`) либо visible label становится понятным.
- **Общий контракт:** нет.
- **Риск:** low; проверить CSS selectors and nesting.
- **Тесты:** axe/Lighthouse, landmark count exactly one, label-in-name, VoiceOver/NVDA smoke.

## Сильные стороны, которые не являются finding-to-redesign

- Exact-source revisions, immutable original, explicit user-corrected track и no-interpolation
  guards защищены тестами.
- Canonical save и optional cache failure разделены; повторный write не требуется.
- Import Center — единый локальный recovery/catalog surface с receipt, archive, relink и
  privacy truth; он должен поглотить lifecycle projection, а не получить конкурента.
- Provider defaults честны: Local ASR default-off, Gemini не становится silent fallback из
  Local, cloud consent/cost существуют.
- Downr boundary явно внешняя; нет скрытого production downloader/API/iframe.
- Light RU/HE mobile не имеет horizontal overflow; RTL order зеркалится.
