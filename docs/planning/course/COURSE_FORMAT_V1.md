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
