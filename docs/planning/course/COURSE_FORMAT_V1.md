# Формат курса v1

Канон полей P1, 2026-11-05. Исполнение: `CourseFormat`, `CourseHebrew`,
`CourseChecker`; независимые примеры: `tests/fixtures/course/mini/`.
Это техническая фикстура, не принятый к публикации учебный урок.

## Общие типы

ID — строка `^[A-Za-z0-9][A-Za-z0-9._-]*$`. Правка содержания не меняет
существующие ID. Уникальность: записи и формы вместе в лексиконе; отдельно
слоты, роли, реплики, абзацы, задания и медиа внутри урока. Ключ значения
слота может повторяться для разных допустимых последовательностей.

Любой ученический текст — `{ru: string}`; дополнительные языки допускаются.
Иврит — `{niqqud: string, plain: string, functional?: string}`. Обе обязательные
строки непусты, plain хранится явно и не генерируется удалением огласовок.
Пример: `{niqqud: "סֻכָּר", plain: "סוכר"}`. Проверка скелета допускает
различия в ו/י, но не доказывает орфографическую или языковую правильность.

## Манифест и лексикон

`course.json`: `{format:"course-v1", id, version, title:{ru}, lexicon:"lexicon.json",
lessons:[lessonId], preknown:[lexId]}`. Порядок lessons — порядок обучения.

`lexicon.json`: `{entries:[{id,pos,gender?:"m"|"f",he,translit_ru,gloss:{ru},
srcIds?:[sourceId],forms?:[{id,he,tags:[string]}]}]}`. Tags могут включать `f`,
`m`, `sg`. Формы имеют собственные ID; при грамматическом разборе сохраняют baseId.
Пример: `lx.big` → `lx.big-f` с `{niqqud:"גְּדוֹלָה",plain:"גדולה"}`, tags `["f","sg"]`.

## Урок

`{format:"course-lesson-v1",id,version:int,title:{ru},goal:{ru},
introduces:{active:[lexId],receptive:[lexId]},reviews:[lexId],frame:[lexId],
slots:[Slot],orderRules:[OrderRule],repeatForms:[[lexId]],scene:Scene,
text?:Text,tasks:[Task],media?:[Media]}`. Version — положительное целое.

- Slot: `{id,label:{ru},head?:true,values:[{key,label:{ru},seq:[lexId]}]}`.
  Например service/here допускает `[lx.lashevet]`, `[lx.po-here]` и их сочетание.
- OrderRule: `{head:slotId,dependent:slotId,message:{ru}}`.
- Scene: `{id,roles:[{id,voice}],turns:[{id,role,he,ru:{ru},next?:turnId}]}`.
- Text: `{id,paras:[{id,he,ru:{ru}}]}`.
- Task: `{id,type:"choice"|"text"|"match"|"cloze"|"scene",channel:[string],
  prompt:{ru},model?:he,answers?:[he],spec?:Spec,transfer?:boolean}`.
- Media: `{id,target,brief:{ru},alt:{ru}}`; target ссылается на сцену, реплику,
  текст, абзац либо задание этого урока.

`HE_FIELDS`: `scene.turns[].he`, `text.paras[].he`, `tasks[].model`, `tasks[].answers[]`.

## Спецификации проверки

- order/short: `{kind,expect:{slotId:key},require:[slotId],preferFrame?:[lexId]}`.
  Необязательные ожидаемые слоты проверяют противоречия, но не полноту ответа.
- confirm: `{kind:"confirm",card:{slotId:key},claim:{slotId:key}}`.
- repeat: `{kind:"repeat"}`; варианты берутся из repeatForms урока.
- replacement: `{kind:"replacement",next:{slotId:key},prev:{slotId:key},via:lexId}`.

Пример задания 6: `expect:{drink:"tea",sugar:"without"}`, require `["drink","sugar"]`,
preferFrame `["lx.efshar"]`. Задание 19d: card `{milk:"without"}`, claim `{milk:"with"}`.

## Диагностика

`validateLexicon(lexicon)` и `validateLesson(lesson, lexiconIndex)` возвращают
`{level:"error"|"warning",code,path,message}[]`. Индекс — Map всех записей и форм.
Ошибки: FORMAT, ID_BAD, ID_DUP, HE_PAIR_MISSING, HE_PLAIN_HAS_MARKS,
HE_SKELETON_MISMATCH, REF_UNKNOWN, TASK_TYPE_UNKNOWN. HE_NIQQUD_BARE — предупреждение.
Некорректная структура данных возвращает FORMAT, а не исключение.

Манифест и межурочные связи проверяются CLI/графом. Порог новых слов в тексте
0.08 — предупреждение. Недостаточный горизонт курса откладывает проверку повторений.

Фикстура L001 хранит восемь a1-реплик; огласовки взяты из NIQQUD в
`docs/research/hebrew-course/2026-11-05-cafe-audio/bake-cafe-audio.js` без его запуска.
Полное письмо и переводы заданы явно. L002 повторяет lx.bli/lx.chalav, вводит lx.ein.
Независимая языковая приёмка содержания и голоса находятся за пределами P1.

## Проверяющий модуль (P1)

`CourseChecker.buildIndex(entries)` возвращает Map однословных ключей со всеми кандидатами;
`index.multiword` — Map многословных ключей, `index.byId` — формы по ID.
Перед `assess(input, task, lesson, index)` вызывающая сторона может задать
`index.preknown = course.preknown` (массив ID). Контракт `assess` не получает `course`,
поэтому это явный контекст индекса, а не добавленное поле урока. Доступный словарь:
`introduces.active/receptive`, `reviews`, `frame`, `index.preknown`. Формы доступны по
собственным ID: знакомство с леммой не объявляет все формы изученными.
Одинаковые омографические ключи сохраняют всех кандидатов; неизвестный или
противоречивый разбор даёт `unknown`. Отрицание ожидаемого значения — `mismatch`.

Для confirm наборы слотов card и claim должны совпадать: при разных наборах checker возвращает unknown, поскольку карточка не задаёт проверяемое значение для всей реплики.

## Проверки графа и CLI

`npm run course:validate -- tests/fixtures/course/mini` читает манифест, затем лексикон и уроки в порядке `course.lessons`. `--json` выводит массив Issue; выход 1 означает хотя бы одну ошибку. Пути должны оставаться внутри каталога курса. Перед `checkGraph` вызывающий код обязан проверить формат; CLI делает это автоматически.

Граф сопоставляет канонический `plain` с обеими формами словаря, включая многословные единицы и все омографы. Для проверки изученности достаточно одного изученного кандидата; доля новых токенов считается консервативно по наличию нового кандидата. Автоматика не разрешает семантическую неоднозначность омографов и не доказывает новизну контекста повторного появления. Формы имеют отдельные ID и проверяются отдельно. Предупреждение `REAPPEAR_PENDING` откладывает оценку, пока после урока нет трёх уроков.

### P3 UI extensions (optional)

`lesson.grammar` maps stable IDs to `{title:{ru}, body:{ru}, pattern?:[he]}`. A task's `grammarRef` must resolve in this map. Patterns preserve authored niqqud/plain pairs.

For `choice`, `options:[{id,he?:he,label?:{ru}}]` provides displayed alternatives and `correctOption` identifies exactly one option. An option uses `he` or a localized label. The first wrong response does not reveal the correct alternative. For `match`, `pairs:[{id,he:he,label:{ru}}]` describes authored Hebrew/meaning pairs; matching uses their IDs. `scene` may add `cue:he`; `text`, `cloze`, and `scene` use the P1 checker. Optional `hints:[{ru}]` supplies up to two contextual hints. Existing P1 tasks without these UI extensions remain valid; a choice/match pilot must provide its authored data.

The introductory page combines goal and scene (step 0); an optional study text follows, then individual tasks. `Progress.reader` holds resumable position and task drafts/model visibility, separately from immutable attempts. Revealing scene/text translation records translation assistance conservatively for every task of that lesson. Store failures remain visible. Unknown answers may be compared with an authored model and recorded as `self`; without a model, skipping is offered without inventing successful evidence. P1 checker feedback is Russian authored feedback; UI chrome is localized in ru/en/he. Content falls back to its authored Russian layer.

P3 semantic fingerprints additionally include authored `options`, `correctOption`, `pairs` and `cue` when present; absent fields preserve the exact P1/P2 hash. Version migration therefore invalidates success/drafts after answer-key or pairing changes. Partial matching stores selected and completed pairs in `Progress.reader`; remount restores them without recording another attempt.

### Аудио задания (P3)

Необязательное `tasks[].audioTurnId` ссылается на ID реплики `scene.turns`. Для задания с каналом `listen` ридер показывает клип этой реплики и скрытый текст. Канал попытки становится `listen` только после полного воспроизведения; открытие текста фиксируется как помощь `transcript`. Объявление канала и нажатие ▶ сами по себе не доказывают прослушивание. Без связи или готового клипа письменный ответ остаётся `write_he`, карточки — `cards`. Видимый текст вводной сцены отмечается как transcript-помощь для связанных заданий.

Манифест `audio/<lessonId>.json` — объект `{turnId: audioKey}`, где ключ — SHA-256 из 64 строчных hex-символов, клип обслуживается `/api/audio/<audioKey>`. Наличие манифеста означает допуск проверенных записей издателем; ридер не генерирует и не проверяет их звучание. Отсутствующий/невалидный ключ не рисует ▶. `audioTurnId` входит в отпечаток задания.

### Огласовки урока (P3-F1)

`lesson.niqqud?: "full" | "new" | "tap"`, по умолчанию `full`. Общая настройка Зала `room.niqqudMode` не применяется к курсу. Все пары в сцене, тексте, образце, choice, match, реплике задания, транскрипте и грамматическом образце используют одно правило. `full` показывает authored niqqud; `new` заменяет только токены вводимых active/receptive единиц (включая формы введённой леммы) на соответствующие токены authored niqqud, прочее оставляет из authored plain. Ключи обеих форм словаря используются для сопоставления, включая многословные единицы. Пунктуация берётся из plain. При неодинаковом числе токенов двух авторских строк частичная огласовка не угадывается: строка остаётся plain. Полное письмо не получается удалением огласовок.

`tap` сначала показывает plain. Первая активация ивритской строки (касание, Enter/Space) показывает niqqud; последующая активация доступна карточке слова или выбору ответа. Раскрытие само не отправляет ответ. Раскрытые пары сохраняются только в памяти открытого ридера. Переключатель «Огласовки: как в уроке / всегда / никогда» хранит `lesson|always|never` в `course.<courseId>.niqqudOverride` локально и одинаково управляет всеми парами. Это настройка отображения курса на устройстве, не пользовательский прогресс и не переносимый результат обучения.
