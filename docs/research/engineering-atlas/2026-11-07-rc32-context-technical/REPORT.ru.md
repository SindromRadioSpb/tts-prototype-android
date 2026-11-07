# RC3.2: локальный технический кандидат «В контексте (ИИ)»

Дата: 2026-11-07. База: `origin/main`, `1ae74d9e1f0c0396dbcf0c66acdfc8da4a074cf0`.
Реализация: `2f0944e838d7231cbe31b3a723a29bea9570232b`.
Ветка: `feat/atlas-rc32-context-technical`, worktree: `E:\projects\tts-prototype-android\.worktrees\atlas-rc32-context`.
Статус: локально проверен, готов к технической приёмке владельцем. Содержательная/терминологическая и научная приёмка не объявляются.

Production не изменялся. Deploy, push и merge не выполнялись. Основной checkout остался на `main`; чужой untracked-каталог `docs/LinguistPro World/` сохранён.
Профиль владельца, первоначальный прогресс, ручные правки, пользовательские БД и production-данные не открывались и не изменялись.

## Вход и контрольные суммы

Архив `C:\Users\lletp\Downloads\atlas97001-context-technical-rc-20261107.zip`: **1 712 828 байт**, SHA-256
`f466031512ed438e3d8ade9b9f1cef3af569a50f11802809cbbcd1b731edbc00` — совпали до распаковки.
Пути ZIP проверены на выход из корня и symlinks. Handoff прочитан.
Долговременная копия входа и распаковка: `E:\projects\tts-prototype-android\Архив\atlas97001-context-technical-rc-20261107`.

Оба скрипта поставщика выполнены. Проверены 103 файла инвентаря пакета, 264 карты, 1 848 защитных мутаций, 3 798 HE lookup, 21 section load и 126 отрицательных v2-проверок.
Проверка с `--source-export` подтвердила все **1 201 исходный файл** полного RC3.2 экспорта до проекции.
Исследование `d4fc5b77` / `210a0999` прочитано как справка; причины отказов сверены с кодом текущего main.

Новый context pin / SHA-256 байтов `manifest.json`:
`2f782372d533cbbe47fff439683f84d7fbb23bf44edc5486629f0dd1cb3b0dfd`.

Source edition revision: `cea369d48494fcf58e78e0567fb82477abe7bb21ba02112707c3d7ba31fc4fd7`.
Edition manifest SHA: `0211488a36ef6a03c6f277c6c913fb18165ab19430d13a4e623c95fc640ba332`.
PDF SHA: `eb4e4ee7f154bce30dbd61b094d6a42a9925af909bd7ecb2f80bce4639af0e0c`.
Dependency SHA: `40a1394203c35f94a81fa03b78f2f395fc26c112a4e079d0f9586c541d21cb00`.

## Что изменено

- `atlas-edition.js`: отдельный RC3.2 pin и `contextForRows`, проверка реально открытого source manifest перед созданием loader. SourceBinding берётся из кода, сверенного с полным экспортом, а не из ответа контекстного сервера. Прямой `contextJson` без строк RC3.2 отклоняется. Прежние source/context pins сохранены.
- Добавлены и подключены `atlas-context-addressed.js` и `atlas-context-rc32-loader.js`. Вход поставщика сохранён в отдельном immutable namespace. Глобальная нормализация, tokenizer и orthographic pairs не ослаблялись. Адресные карты проверяют точные ID, редакцию, HE/niqqud/RU, key, order, source_context и token arrays; отклоняют повреждённые spans. Изменения адаптера относительно кандидата поставщика: guard проверяется также до успешного обычного describe; lookup сохраняет ручные правки, MWE и причины uncertain в обоих представлениях.
- `library-ui.js` / `atlas-words.js`: полный inspection-контекст RC3.2, отдельный от lexical/term eligibility; HE offset проходит через адресную карту. Ответы кандидата живут в текущем проверенном section context и не записываются через `AI.remember` в IndexedDB. Замена раздела уничтожает эту связь; cache identity содержит корпус, edition и context pin.
- `word-gloss-ai.js` / `reader-morph.js`: для RC3.2 используется canonical occurrence key; исключён перенос common/legacy glosses в новый корпус. Настоящие occurrence manual corrections читаются по собственному ключу и имеют приоритет. Карточка получает колонку tapped span, причины uncertain/MWE и read-only режим без редактора/учебных действий. Данные правок не переписываются.
- В UI сохранены provenance, partial и source caveats, добавлена маркировка «Технический кандидат; содержание ожидает приёмки». Наличие gloss не снимает holds/неразборчивость и не допускает обучение.
- CLI `export-context`, `import-context`, `package-context`: отдельный явный маршрут `--corpus=a97001rc32`, общий `rc32-context.cjs`. Проверяет весь source-export, зависимости и source bytes до проекции, заново строит runtime inspection rows, проверяет их revisions, все секции и карты перед записью. Выход — отдельный новый каталог; пересечение с исходниками запрещено. Входной candidate сохраняется побайтно. Старые маршруты остальных атласов сохранены.
- Полный material exporter: контекст ищется по corpus ID, включает addressed-map, проверяет pin, source identity/revision, PDF и dependency digest. Прежний a97001 сохраняет свой namespace и пакет.
- SW обслуживает RC3.2 content-addressed namespace, а loader повторно проверяет bytes из кэша. URLs изменённых модулей согласованы в shell/SW/integrity. Production version не повышалась: это локальная ветка кандидата.
- v2-контракт дополнительно отклоняет перестановку answer rows. Остальные проверки identity, revision, count, MWE, provenance и uncertain сохранены.

R1: нет глобального допуска иных написаний. R2: inspection не разрешает обучение. R3: corpus identity отделена от supplier identity и learner keys. R4: карточки проверены на desktop/380px и Hebrew RTL.

## Покрытие и проверки

2366 inspection-строк = 2354 канонические Hebrew source rows + 12 явно связанных reader aliases.
2362 runtime answers = 2350 канонических ответов + 12 alias answers.
Четыре канонических nonlearning artifacts не заполнены: три в `s00`, один в `s17`. Эти секции остаются **partial**, полнота не заявляется.

- **99/99** тестов в 12 релевантных файлах: новый адресный контракт/loader/manual/isolation, прежние context/edition/inspection/native/scoped-learning/material-export/gloss portable и shell wiring/integrity. Ещё 5/5 адресных тестов повторены после добавления случая manual в отсутствующей строке partial-пакета.
- **233/233** i18n smoke. `git diff --check` чист.
- CLI → отдельный import → immutable package → текущий loader: **21/21**, построение rows из фактического SHA-проверенного источника. Повторная финальная проверка всех 1201 source files прошла.
- Проверены wrong pin/hash/revision/PDF/dependencies/overlay, чужие row/edition, HE/niqqud/RU/key/order/source_context, count, offsets, MWE вне границ, неверный provenance, manual в AI-ответе, uncertain без причины, явный partial. Нет fallback в старый корпус.
- Прежний **a97001: 21/21 секций** проходят текущие describe/revision/v2 validate с прежним context pin.
- QA runtime поставщика на текущем коде: 21 раздел / 203 страницы / 1196 immutable runtime files, 3011 reader rows, 70 таблиц, 570 images, все 262 формулы с MathML; нет duplicate refs, missing semantic targets и fallback. READY не опубликован (404).
- Scoped-learning QA: 456 source-find вопросов, 78 lexical rows, 33 term targets, 492 held due cases; исходные states не мутируют.
- Браузер Chromium, реальный локальный server.js, одноразовый persistent profile: **32 карточки HE/niqqud**, включая פלב״מ, דג״ח, מ״מ, כוח/ות נטוי/ים, acronym tokenization, обе p9 quote cases, table parts, s17/s19, p203, uncertain MWE, partial s00/s17. Карточки содержат нужные glosses; учебных/редакторских writers нет. Desktop/380px/RTL screenshots просмотрены.
- Предсуществующая синтетическая manual correction пережила полный reload/повторную проверку кандидата; corrupt manifest блокирует AI, но сохраняет manual. Оба корпуса открываются последовательно.
- Отдельный actual-SW прогон: offline full reload проходит; corrupt map в CacheStorage под правильным pin отклоняется; возвращение исходных bytes восстанавливает offline open без сброса данных.
- Compatibility browser: 88180 языковых полей сохранены; исходные synthetic SQL word/review states и 500 find-history записей не изменились после учебной оценки нового корпуса. 38 steel pages пройдены на 390px, peak decoded image estimate 17 395 436 байт. Это не RSS/physical-device evidence.
- Полный ZIP: **1224 файла**, `ai_layer_included=true`; dependency digest тот же. `verify → restore dry-run → restore --write → repack → verify` прошли. `restore` создаёт новый каталог и не подключает материал к профилю.

Evidence: [SUMMARY.json](SUMMARY.json), [browser.json](browser.json), [offline.json](offline.json), [compatibility.json](compatibility.json), [native-runtime.json](native-runtime.json), [scoped-learning.json](scoped-learning.json), [original-regression.json](original-regression.json), `cli-*.json`, `supplier-*.json`, `focused-tests.txt`, `i18n-tests.txt`.

## Материалы и воспроизведение

Готовые ZIP и SHA-инвентарь:
`E:\projects\tts-prototype-android\Архив\atlas97001-context-technical-rc-20261107\delivery`.

- `a97001rc32-context-technical-full-material.zip` — 184849015 байт, SHA `cc0d7955e4dadab5223f7001b7363ba113d6aed524d21498f2cfe32d683f9cab`.
- `a97001rc32-context-candidate.zip` — только отдельный pinned context namespace; не installer/deploy.
- `FILES.sha256.json` — контрольные суммы. Исходная редакция, PDF, supplier archive и context в полном ZIP; learner data исключены.

Рабочие восстановленные данные: `.tmp/rc32-source`; локальная копия runtime data: `.tmp/runtime-data`. Долговременный источник восстановления — полный ZIP выше, не `.tmp`.

Команды из корня **worktree** (назначения записи должны отсутствовать):

```powershell
node --test tests/atlasRc32Context.test.js tests/atlasContextContract.test.js tests/atlasContextAi.test.js tests/atlasEdition.test.js tests/atlasNativeCorpus.test.js tests/atlasInspection.test.js tests/atlasRc3IndependentTermContext.test.js tests/atlasMaterialExport.test.js tests/wordGlossAiLayer.test.js tests/wordGlossAiPortable.test.js tests/shellIntegrityPrecacheParity.test.js tests/shellModuleWiring.test.js
node scripts/atlas/export-context.cjs --corpus=a97001rc32 --source-export=.tmp/rc32-source --context-package=atlas-context/a97001rc32/2f782372d533cbbe47fff439683f84d7fbb23bf44edc5486629f0dd1cb3b0dfd --out=.tmp/new-context-export
node scripts/atlas/import-context.cjs --corpus=a97001rc32 --source-export=.tmp/rc32-source --context-package=atlas-context/a97001rc32/2f782372d533cbbe47fff439683f84d7fbb23bf44edc5486629f0dd1cb3b0dfd --out=.tmp/new-context-import --dry-run
node scripts/atlas/package-context.cjs --corpus=a97001rc32 --source-export=.tmp/rc32-source --context-package=atlas-context/a97001rc32/2f782372d533cbbe47fff439683f84d7fbb23bf44edc5486629f0dd1cb3b0dfd --out=.tmp/new-context-package
node scripts/atlas/rc32-context-browser.cjs .tmp/runtime-data .tmp/rc32-source .tmp/new-browser-check
node scripts/atlas/rc32-context-offline.cjs .tmp/runtime-data .tmp/new-offline-check
node scripts/atlas/rc32-context-preview.cjs .tmp/runtime-data .tmp/rc32-source 3217
```

Локальный preview запущен на `http://127.0.0.1:3217/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=1`, в изолированном окружении без credentials владельца. Controller PID 57620, server PID 66224. Для остановки: `Stop-Process -Id 66224,57620` после сверки, что это те же процессы. Preview не является production.

## Границы и приёмка владельцем

1. Открыть локальный preview, проверить выбранные значения/терминологию, раскрытия сокращений и различия HE/niqqud. При правке source_context/терминологии потребуется новый проверенный digest после последней проекции; текущий pin не переносится на изменённый источник.
2. Проверить source caveats, uncertain и partial. Особенно p1/p9/p12/p53/p136/p203 и длинные s17/s19. Не отмечать весь контент принятым только по результатам программной проверки.
3. Оценить на собственных устройствах; проверка выполнена в автоматическом Chromium. Физический iPhone, accessibility и научная вычитка не заявляются.
4. Любая будущая публикация — отдельное разрешение и релизная проверка. В этой задаче нет deploy/push/main и нет озвучивания.

Отдельная граница исходного supplier checkpoint: вложенный `rc3-corrected-input-checkpoint.zip` содержит 17 raw-разделов/5618 записей, отсутствуют s08/s09/s11/s12. Исследовательский повтор source-find scanner дал 412 auto-eligible и **не засчитан** как повтор полного эталона 6255/443; raw parity остановлен на отсутствующем `s08-friction.json`. Для полной редакторской пересборки нужен полный reviewed raw input 21 раздела. Это не блокирует выполненную интеграцию: runtime source bytes и все 1201 файла уже сверены с полным экспортом; текущие 456 scoped source-link вопросы и semantic targets проверены runtime QA. См. O-169.

Дополнительная задача: [узкий generic-label механизм — только исследование](GENERIC_LABEL_RESEARCH.ru.md). Изменений токенизатора, новой eligibility или выдуманной ивритской леммы нет.
