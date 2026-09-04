# Формальный контракт: лексика и морфология карточки текста

Дата: 2026-09-04

Статус: `OWNER_APPROVED · CONTRACT_V1 · P0_VISIBLE_QUEUE_TECHNICAL_PASS · P0.5_BLOCKING`

Связанный документ: [общая концепция](./README.md).

Первый фактический прогон: [P0 preview report](./P0_PREVIEW_REPORT.md).

Контур исправления неоднозначных occurrences:
[lexical resolution lifecycle](./LEXICAL_RESOLUTION_LIFECYCLE.md).

## 1. Утверждённое решение

Каждая учебная карточка текста LinguistPro получает возможность выгрузить в
Obsidian слова по частям речи вместе с доступным контекстным морфологическим
анализом.

Выгрузка допустима при соблюдении четырёх различий:

1. **Token** — конкретная словоформа в конкретной позиции строки.
2. **Occurrence analysis** — разбор этой словоформы именно в данном контексте.
3. **Lexeme/sense** — словарная сущность, общая для разных форм и текстов.
4. **Learning selection** — элементы, которые пользователь действительно решил
   учить.

Полный список лексем текста является `reference index`. Он не создаёт карточки
FSRS, не меняет статус знания и не превращается автоматически в active study
set.

## 2. Пользовательская функция

В карточке текста появляется действие:

```text
Экспорт → Obsidian → Лексика и морфология
```

Параметры экспорта:

- scope: `текущий текст`;
- granularity:
  - `уникальные лексемы` — default;
  - `все появления` — дополнительный диагностический файл;
- POS:
  - `все` — default;
  - один или несколько выбранных классов;
- content:
  - `контекстная морфология` — default;
  - `+ доступная парадигма`;
- learning filter:
  - `весь reference index` — утверждённый режим;
  - `только выбранные/неизвестные/изучаемые`;
- output:
  - `Obsidian package` — default;
  - `TSV` — дополнительный переносимый отчёт;
  - `JSON projection` — машинный диагностический артефакт.

До записи обязательно показывается preview:

```text
Строк:                         573
Токенов:                       N
Уникальных sense-lemma:        N
Глаголов / существительных:    N / N
Функциональных слов:           N
Неоднозначных:                 N
Без леммы или POS:             N
С Pealim ID:                   N
Создать / обновить / конфликт: N / N / N
```

Значения вычисляются по живому snapshot; пример не является ожидаемым счётчиком
для `Кфар Аза - 2`.

## 3. Контролируемая система частей речи

Экспортёр хранит исходный provider tag и нормализованный `lp_pos`.

| `lp_pos` | Представление | Примечание |
|---|---|---|
| `verb` | Глаголы | Биньян и корень только при наличии evidence |
| `noun` | Существительные | Не смешивать с именами собственными |
| `adjective` | Прилагательные | Отдельно от причастий |
| `participle` | Причастия / бейнони | Не принуждать к noun/verb без основания |
| `propernoun` | Имена собственные | По умолчанию вне active study set |
| `numeral` | Числительные | Отдельное представление |
| `pronoun` | Местоимения | Функциональный класс |
| `adverb` | Наречия | Функциональный класс |
| `preposition` | Предлоги | Учитывать слитные проклитики |
| `conjunction` | Союзы | Учитывать слитные проклитики |
| `particle` | Частицы | Артикль, отрицание, вопрос, relativizer и др. |
| `interjection` | Междометия | Например, разговорные сигналы |
| `other` | Другое | Известный, но не сопоставленный класс |
| `unknown` | Требует разбора | Нет достаточного evidence |

Нельзя терять `propernoun`, `participle`, `numeral`, служебные слова и неизвестные
единицы только потому, что исходный черновик имел четыре таблицы.

## 4. Нормальная единица экспорта

По умолчанию экспортируется одна запись на **уникальную sense-lemma**, а не одна
запись на токен и не одна запись на написание.

Канонический ключ берётся из существующего LinguistPro keyer:

```text
pid:<pealim_id>
```

при известном Pealim ID, иначе:

```text
<lemma_without_niqqud>#<lp_pos>
```

Гомографы с разными `pealim_id` остаются разными лексемами. Разные словоформы
одной лексемы объединяются, но сохраняют отдельные occurrences. Неоднозначная
словоформа не схлопывается с выбранной sense без флага ambiguity/evidence.

## 5. Структура Obsidian package

```text
_LinguistPro/
  texts/
    <lp_text_id>/
      Текст.md
      Лексика.base
      Лексика — переносимый снимок.md
      occurrences.tsv
      projection.json
      receipt.json
  lexemes/
    <stable-lexeme-id>.md
  dashboards/
    Все глаголы.base
    Все существительные.base
    Неоднозначные разборы.base
```

### `Лексика.base`

Это один generated Base с представлениями:

- Все слова;
- Глаголы;
- Существительные;
- Прилагательные;
- Причастия;
- Наречия;
- Служебные слова;
- Имена и числа;
- Неоднозначные;
- Требуют проверки;
- Мой active subset.

Все views фильтруют глобальные заметки `lp-lexeme` по `lp_text_ids`, поэтому одна
лексема не копируется физически в папку каждого текста.

### Переносимый Markdown-снимок

Генерируется как удобный для чтения индекс ссылок, сгруппированный по POS. Он
не является местом ручного редактирования и может быть полностью пересоздан.
Большие морфологические таблицы непосредственно в нём не хранятся.

### TSV

TSV содержит одну строку на occurrence и предназначен для аудита/Excel, а не
для редактирования канона. UTF-8 with BOM допустим как отдельная опция для
надёжного отображения иврита в Excel.

## 6. Контракт лексемы

Пример frontmatter:

```yaml
---
type: lp-lexeme
lp_schema: 1
lp_lexeme_id: "pid:2321"
lemma: "לִשְׂרֹף"
lemma_unpointed: "לשרוף"
lp_pos: verb
provider_pos: verb
root: "שרף"
binyan: paal
meaning_ru: "жечь; сжигать"
pealim_id: 2321
pealim_url: "https://www.pealim.com/ru/dict/2321/"
resolution_channel: form-first
confidence: 0.92
ambiguity: false
verification_state: generated
morph_provider: dicta-morph
morph_model_version: "..."
lp_text_ids: ["..."]
occurrence_count: 2
managed_by: linguistpro
lp_source_hash: "sha256:..."
lp_exported_at: "2026-09-04T...Z"
---
```

Обязательны:

- `lp_lexeme_id`;
- pointed и unpointed форма, если pointed evidence существует;
- нормализованный и исходный POS;
- `verification_state`;
- provider/model/channel/confidence;
- тексты и occurrences;
- source hash и schema version.

Пустой корень, биньян или Pealim ID остаётся пустым. Экспортёр не дополняет их
догадкой только ради заполнения колонки.

## 7. Контекстная морфология

Для каждого occurrence сохраняются только поля, реально подтверждённые
провайдером или resolver pipeline:

```json
{
  "text_id": "...",
  "row_id": "...",
  "order_index": 23,
  "word_offset": 4,
  "surface": "שרפו",
  "niqqud": "שָׂרְפוּ",
  "lemma": "לשרוף",
  "lp_pos": "verb",
  "provider_pos": "verb",
  "root": "שרף",
  "binyan": "paal",
  "features": {
    "person": 3,
    "gender": "common",
    "number": "plural",
    "tense": "past"
  },
  "confidence": 0.92,
  "ambiguous": false,
  "alternatives": [],
  "sentence_he": "...",
  "sentence_ru": "..."
}
```

`features` — открытый versioned object. Поля person/gender/number/tense/state/
definiteness добавляются только когда они присутствуют в исходном анализе или
детерминированно получены утверждённым resolver. Отсутствие поля означает
«неизвестно», а не нейтральное значение.

## 8. Полная парадигма

Нужно различать два уровня:

1. **Контекстный разбор** — что за форма встретилась здесь. Он включён по
   умолчанию.
2. **Парадигма лексемы** — другие формы глагола/существительного/прилагательного.
   Она включается опционально.

Парадигма допустима только если уже доступна в каноническом локальном
`lemma_inflection`/Pealim-derived dataset и связана с точной sense-lemma. Нельзя
scrape-ить Pealim при каждом экспорте или генерировать отсутствующие формы ИИ.

В Obsidian по умолчанию показывается компактный учебный блок:

- для глагола: инфинитив, биньян, корень и встреченные в тексте формы;
- для существительного: словарная форма и встреченные число/state/definiteness;
- для прилагательного/причастия: словарная форма и встреченные согласованные
  формы;
- для служебного слова: тип, функция и найденные конструкции, без фиктивного
  корня;
- ссылка на полную карточку LinguistPro/Pealim.

Полная таблица парадигмы хранится только по явному выбору пользователя и с
provider/version/provenance.

## 9. Доверие и неоднозначность

`verification_state` принимает:

- `generated`;
- `source_confirmed`;
- `teacher_confirmed`;
- `owner_confirmed`;
- `rejected`.

`confidence` не заменяет verification state.

Если resolver обнаружил несколько Pealim IDs или несовместимые разборы:

- запись получает `ambiguity: true`;
- alternatives сохраняются;
- она появляется в view `Неоднозначные`;
- не получает ярлык «точно»;
- не входит автоматически в active study set;
- повторный экспорт не должен возвращать rejected alternative как выбранный.

`fail-closed` не имеет права превращаться в слепую зону. Каждое ambiguous,
identity-guarded, unknown, collision или skipped occurrence обязано попасть в
derived resolution queue с точным контекстом и candidate evidence. Каноническое
решение принимается только в LinguistPro и хранится append-only; Obsidian
показывает очередь read-only.

OCR/ASR-мусор и обрезанные формы получают `unknown`/`skip_reason`, но не
исчезают из диагностических счётчиков.

## 10. Связь reference index и обучения

Каждая лексема может иметь независимое поле проекции статуса:

```text
learning_projection: new | learning | known | ignored | unset
```

Оно read-only и отражает состояние LinguistPro на момент snapshot. Obsidian не
изменяет его напрямую. Views используют его для фильтрации, но сам факт наличия
лексемы в vault не означает `learning`.

Действия владельца в Obsidian — собственный пример, заметка, ошибка, вопрос —
остаются личными знаниями. Будущий обратный канал может только предложить
операцию LinguistPro через review queue.

## 11. Идемпотентность и конфликты

- exporter пишет только в `_LinguistPro`;
- одна лексема имеет один устойчивый путь;
- второй экспорт того же snapshot не создаёт новый файл;
- обновляются source-controlled fields, ручные файлы не затрагиваются;
- удаление occurrence уменьшает счётчик и фиксируется в receipt, но не удаляет
  личную заметку;
- source hash предотвращает silent overwrite;
- `receipt.json` содержит create/update/unchanged/conflict/tombstone counts;
- dry-run не пишет ни в vault, ни в OPFS;
- экспорт не вызывает FSRS/review события.

## 12. Ворота реализации P0

На `Кфар Аза - 2` read-only прототип обязан показать:

1. token count и unique sense-lemma count;
2. распределение по полной POS-таксономии;
3. долю occurrences с lemma/POS/niqqud/root/binyan/Pealim ID;
4. число ambiguous, review, unknown и skipped;
5. примеры каждого resolution channel и confidence band;
6. доказательство homograph-safe dedup;
7. оценку числа/размера Markdown-файлов;
8. Base-preview всех утверждённых views;
9. содержательный diff двух последовательных экспортов;
10. доказательство неизменности `review_log`, FSRS, progress и исходного vault.

До прохождения P0 действующий vault `F:\УЧУ_ИВРИТ\УЧУ_ИВРИТ` не мигрируется.
