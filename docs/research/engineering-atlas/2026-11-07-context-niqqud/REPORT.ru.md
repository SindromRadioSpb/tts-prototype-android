# RC3.2: диагностика совместимости подготовленного ИИ-контекста

Дата: 2026-11-07. База: `origin/main`, `1ae74d9e1f0c0396dbcf0c66acdfc8da4a074cf0`.
Ветка: `fix/atlas-rc32-context-niqqud`. Статус: исследование выполнено; ссылка на адресный пакет получена, но его байты недоступны из-за сетевого 403. Реализация и интеграционная приёмка ожидают доступный пакет и чтение его инструкции. Production не изменялся.

## Установлено в актуальном коде

1. `public/js/atlas-edition.js`, `contextJson`: явный отказ `ATLAS_CONTEXT_NOT_PUBLISHED` для `a97001rc32` происходит до fetch. Это преднамеренное отключение отсутствующего пакета, отдельное от языковой проверки. Старый `CONTEXT_PIN=ca40870e…` привязан к первоначальной редакции `50253381…` и не подходит RC3.2 `cea369d4…`.
2. Тот же модуль проверяет исходные байты edition manifest/section по SHA-256, затем `projectCorpus` заменяет supplier identity `a97001` на corpus identity `a97001rc32`, сохраняя `source_id`. Контекст нужно проверять по SHA до адаптации и явно привязать к RC3.2; отключать проверку manifest/revision нельзя.
3. `public/js/atlas-context-contract.js`, `aligned`: исходные и огласованные токены сравниваются после удаления огласовок через Unicode NFD/NFC. Обычные огласовки совместимы. Изменённый буквенный состав допускается только через небольшой `ORTHOGRAPHIC_PAIRS`, общий для старого пилота. Неизвестное полное/дефектное написание вызывает отказ всей `describe`; разное число слов также отклоняется. Глобальное удаление ו/י скрыло бы подмены слов.
4. `WordGlossAI.rowPayloadFromData` строит `key` из огласованных слов и перевода; `storageKey` дополнительно содержит occurrence ID. `AtlasContextContract.revision` содержит ID, порядок, key, языковые поля и `source_context`. На синтетическом примере после projection текстовый key одинаков, revision различается. Простая замена ID в пакете оставляет неверный revision. Нельзя сохранять старую occurrence identity ради обхода проверки: она отделяет исправления пользователя двух корпусов.
5. `library-ui.js`, `attachAtlasWords` для RC3.2 уже использует `purpose:'inspection'`. `describe` вызывается до `validate`/`AI.remember`. Ошибка завершается через `.catch(() => {})`, поэтому неподключённый или несовместимый слой не появляется на карточке. Допуск ИИ не должен менять `learningItem`, inspection-only occurrences или запись прогресса.
6. `scripts/atlas/export-context.cjs` и `import-context.cjs`: строгая ветка рассчитана на supplier ID `a97001`, использует обычный учебный scope, а не полный RC3.2 inspection. Переданный полный контекст нельзя готовить через незаметное ослабление learning eligibility. Нужен согласованный scope экспортера, CLI и UI.
7. `scripts/atlas/package-context.cjs`: захардкожены SHA и revision первоначальной редакции. Нужен edition-aware путь упаковки или отдельный RC3.2 packager, не изменение прежнего pin задним числом.
8. `server.js` передаёт в `lib/atlasMaterialExport.js` context pin только первоначальному корпусу. При подключении нового контекста полный ZIP также должен включать именно новый пакет. Exporter ищет context directory по supplier `pin.atlas_id`; namespace должен быть согласован с loader и manifest. Не следует активировать UI pin до подготовки и проверки этих зависимостей.

## Подготовленное решение и границы

R1: адресный допуск проверенных написаний, а не глобальное смягчение орфографии. R3: отдельная идентичность corpus и supplier, SHA до projection. R2: inspection и содержательная подсказка не предоставляют права обучения.

После получения пакета сначала проверить его SHA, редакцию, 264 уникальных адреса и точные исходные/огласованные значения. Формат адресного допуска не фиксируется до получения интеграционной инструкции. Проверка должна отклонять устаревшую строку, иной раздел/редакцию, неразрешённую пару и изменённый порядок. Изменения количества токенов требуют явной карты соответствия, если такие случаи есть; разрешение whole-row mismatch само по себе не доказывает корректность каждого offset. Решение о таких случаях зависит от реального пакета.

Затем добавить отдельный RC3.2 context pin и согласовать loader, источник context revision и projected revision. Если пакет рассчитан на supplier identity, проверять исходный слой до projection и пересчитывать projected revision только по проверенным текущим строкам; сопоставление rows/key/count/MWE и provenance остаётся обязательным. Если пакет уже рассчитан на runtime identity, повторно не проецировать. В обоих случаях нельзя маскировать чужую source_revision новой, не доказав соответствие исходному материалу.

Сохранить исходный pin, все старые learning/storage keys, пользовательские исправления, term/source holds, неразборчивые фрагменты и маркировку uncertain. Не закреплять термины или содержимое ИИ до их окончательной передачи. Озвучивание вне задачи. Production запрещён до отдельной приёмки.

## Выполненные проверки

`NODE_PATH=/workspace/atlas-context-deps/node_modules node --test tests/atlasContextContract.test.js tests/atlasContextAi.test.js tests/atlasEdition.test.js tests/atlasNativeCorpus.test.js tests/atlasInspection.test.js tests/atlasRc3IndependentTermContext.test.js`

Результат: **35 passed, 0 failed, 0 skipped**. Это baseline текущего кода, не проверка готового исправления. Минимальные зависимости `linkedom@0.18.13`, `express@4.21.2`, `jszip@3.10.1` установлены в отдельный `/workspace/atlas-context-deps` без изменения project lockfile. Полный npm test и браузерная приёмка исправления ещё не проводились.

Воспроизводимая синтетическая диагностика:

`NODE_PATH=/workspace/atlas-context-deps/node_modules node docs/research/engineering-atlas/2026-11-07-context-niqqud/diagnose.cjs`

[Результат](baseline.json): огласовки и существующая проверенная пара принимаются; новая пара написаний, подмена слова и изменение числа слов отклоняются; source/projected revisions различаются; RC3.2 loader отказывает без сетевого запроса. Исходные PDF/ZIP, production и профиль пользователя не читались и не менялись. Число 264 получено из задания и **не подтверждено этим прогоном**.

## Ожидающие действия

Зависимая операция: реализация адресного адаптера и подключение RC3.2 слоя. Цель: проверенный пакет 264 строк и интеграционная инструкция. Состояние: **pending / network blocked**. Отказа автоматического согласования или неопределённого внешнего результата нет.

Родительская задача передала Drive file `1x2aiCh0XZawmVIRtu0eZ-6AsbUoMFQMZ`, ожидаемые 1 712 828 байт и SHA-256 `f466031512ed438e3d8ade9b9f1cef3af569a50f11802809cbbcd1b731edbc00`. Drive metadata и `fetch(download_raw_file=true,include_base64=false)` подтвердили имя `atlas97001-context-technical-rc-20261107.zip`, размер и предоставили ссылку передачи. Материализация ссылки в `/workspace/atlas-context-technical.zip` через curl завершилась `curl: (22) The requested URL returned error: 403`; диагностический HEAD к тому же host подтвердил `HTTP/1.1 403 Forbidden`, `curl: (56) CONNECT tunnel failed, response 403`. Host: `sdmntprwestcentralus.oaiusercontent.com`; effective network allowlist не содержит его. `cloud_environment.request_changes` недоступен. По инструкции окружения попытки обхода proxy/domain policy не выполнялись. ZIP-файл не создан; SHA-256 и `CODEX_HANDOFF.ru.txt` **не проверены и не прочитаны**. Нужен доступный способ передачи архива в workspace либо разрешение его transfer host в настройках среды с новой ссылкой после истечения срока. Секретная временная ссылка в отчёт не включена.

После передачи: проверить весь пакет по реальным 21 разделам; добавить отрицательные тесты wrong pin/hash/revision/ID/order/token map, интеграцию CLI → package → loader → card, uncertain/MWE и сохранение ручных правок. Проверить новый и первоначальный корпуса в браузере, отсутствие изменения learning holds и learner state; ZIP verify/restore/repack с включённым новым ИИ. Только после этого возможен отчёт о готовности к пользовательской приёмке.

## Дополнительное исследование: подписи без ивритской леммы

### Повторная передача вложением

Пользователь прикрепил ZIP в чат: `file_0000000011788210a73daf2c89ed89bc`. `Library.prepare_materialize` разрешил file reference и предоставил transfer размером 1 712 828 байт, но не локальный workspace path. Официальный `library_file_transfer.py materialize` завершился `library file transfer failed: download failed`. Проверка transfer host `sdmntprdenmarkeast.oaiusercontent.com` установила `URLError: Tunnel connection failed: 403 Forbidden`. На момент проверки network policy revision 1/enforced по-прежнему разрешает только presets разработки; host вложения отсутствует. Файл в `/workspace/context-input` не появился. SHA и содержимое по-прежнему не проверены. Альтернатива через авторизованное устройство также недоступна: Desktop Commander сообщает Windows-устройство Offline. Для продолжения требуется разрешить указанный host в настройках сети Codex или передать файл напрямую в файловую систему среды. Повторное прикрепление того же ZIP само по себе этот сетевой запрет не снимает.

Запрос родительской задачи: 19 английских названий единиц/приставок и `Ra`; точные материалы и тесты ожидаются. Их количество и содержание здесь независимо не проверялись. Реализация не выполнялась.

В текущем пути `AtlasWords.wordsOf/plainWordsOf` используют Hebrew-only `ReaderMorph.tokenize(...).isWord`; `locateTerms` берёт `lemma_he || niqqud`. Ячейки таблиц дополнительно фильтруются по наличию иврита. Поэтому простого добавления английского alias недостаточно: строка может вообще отсутствовать в `sectionItems`, а `verifyOccurrence` требует Hebrew offset. `sectionTermItems` и `build-train-bank.cjs` также ожидают `lemma_he/niqqud` как отображаемый заголовок.

Возможный узкий путь: отдельный явно типизированный `source_label` для термина, точный текст/язык и semantic source ref (section/page/table/cell/part/field), explicit label eligibility, проверяемая связь с term ID/sense. Проверять полное значение указанного поля без token offsets и без удаления цифр/символов. Создавать только term-level SRS target; не создавать word-status occurrence, Hebrew gloss, произношение или числовую/formula goal. UI должен показывать исходный label, направление LTR и русский смысл; `Ra` допустим только с конкретной проверенной source binding, не как разрешение всех химических символов. Отдельный verifier label-place нужен наравне с Hebrew occurrence verifier; нельзя выдавать `word_offset=0` для строки без Hebrew tokens. В банк и due-item restore потребуется перенести тип/label/source binding, сохранив существующие `at1` keys и старую ветку term verification. Точный контракт нужно выбрать после получения материалов и тестов; это предложение, не проверенный generic-label механизм.
