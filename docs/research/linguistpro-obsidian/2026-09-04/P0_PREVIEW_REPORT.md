# P0: read-only lexical preview — Кфар Аза - 2

Дата прогона: 2026-09-04

Статус: `P0_CORE_TECHNICAL_PASS · FAIL-CLOSED_GUARDS_ACTIVE · P0_NOT_CLOSED`

## 1. Что реализовано

- чистое UMD-ядро `public/js/obsidian-lexical-preview.js`;
- read-only CLI `scripts/premium/obsidian-lexical-preview.js`;
- выбор ровно одного текста по `text_id` или title;
- объединение `library.json`, `notes_advanced.json`, `sentence_morph`,
  `notes_v2` и `note_occurrences` без нового морфологического resolver;
- нормализация полной утверждённой POS-таксономии;
- sense-lemma identity через общий `NotesAutoGen.lemmaKey`;
- сохранение occurrences, confidence, provider tags и конфликтующих evidence;
- виртуальный Obsidian package: Markdown lexemes, text hub, `.base`, TSV,
  projection и receipt — только в памяти, без записи;
- тесты детерминированности и запрета влияния на SRS/review state.

## 2. Свежий источник

Источник получен 2026-09-04 штатным пользовательским действием LinguistPro
`Отправить или сохранить → Сохранить ZIP` для текущей карточки. Внутренние
OPFS/cookies/profile storage напрямую не читались.

| Поле | Значение |
|---|---|
| Production UI | `3.11.464` |
| Generator | `room-mytext-send-or-save` |
| Manifest generated_at | `2026-09-04T10:40:36.445Z` |
| ZIP SHA-256 | `2ccd25cede12eb1a2a8347d2e2136e9040b4ef0ba6492c46b365794e0c93b4f4` |
| ZIP bytes | `5,689,102` |
| Text ID | `01354c2b-b192-4be3-a479-0176d6b52108` |
| Text key | `text-1786434607517` |
| Title | `Кфар Аза - 2 544/573` |
| Rows in bundle | `545` |
| Audio expected/included/missing | `4 / 4 / 0` |
| Advanced notes | present, schema `2` |

Title `544/573` не является фактическим количеством строк карточки: свежий
bundle содержит 545 строк. Экспортёр использует rows/manifest, а не число из
заголовка.

## 3. Фактический lexical preview

### Покрытие

| Метрика | Результат |
|---|---:|
| Строк | 545 |
| Строк с `sentence_morph` | 539 / 545 = 98.9% |
| Токенов в morph rows | 3,991 |
| Анализируемых occurrences | 3,977 |
| Пропущенных коротких/непригодных токенов | 14 |
| Occurrences, связанных с `word_study` notes | 3,783 / 3,977 = 95.1% |
| Уникальных context-safe sense-lemma | 1,097 |
| Повторных occurrences, схлопнутых в лексемы | 2,880 |
| Occurrences с измеренным ambiguity | 3,977 / 3,977 = 100% |
| Ambiguous occurrences | 63 |
| Context identity guard | 646 |
| Остаточных collision keys | 6 |

### Полнота полей occurrences

| Поле | Результат |
|---|---:|
| Lemma | 3,977 / 3,977 = 100% |
| POS | 3,777 / 3,977 = 95.0% |
| Niqqud | 3,977 / 3,977 = 100% |
| Pealim ID после fail-closed identity guard | 2,634 / 3,977 = 66.2% |
| Root среди применимых content occurrences после guard | 90.3% |
| Binyan среди verb occurrences | 98.9% |

### Уникальные лексемы по POS

| POS | Лексем |
|---|---:|
| Глаголы | 290 |
| Существительные | 424 |
| Прилагательные | 104 |
| Причастия | 0 |
| Имена собственные | 77 |
| Числительные | 14 |
| Местоимения | 11 |
| Наречия | 75 |
| Предлоги | 45 |
| Союзы | 8 |
| Частицы | 11 |
| Междометия | 0 |
| Другое | 7 |
| Без POS | 31 |

Нулевые `participle` и `interjection` нельзя интерпретировать как доказанное
отсутствие этих классов в тексте: это может быть свойством текущей provider
таксономии/маппинга. Они остаются отдельными views и должны быть проверены на
gold-примерах.

### Confidence occurrences

| Band | Occurrences |
|---|---:|
| `>=0.9` | 1,505 |
| `0.8–0.9` | 223 |
| `0.6–0.8` | 1,887 |
| `<0.6` | 168 |
| отсутствует | 194 |

## 4. Главные найденные data gaps

### Gap P0-1 — bundle не переносит ambiguity, preview восполняет его общим resolver

Исходный bundle не содержит наблюдаемого `ambiguous/alts` для occurrences.
Preview теперь выполняет тот же локальный `NotesAutoGen.formFirstResolve` над
версированным Pealim dataset в памяти. Coverage стал `3,977 / 3,977 = 100%`,
обнаружено 63 ambiguous occurrences. Никаких сетевых запросов или новых
морфологических эвристик не добавлено.

### Gap P0-2 — словарный sense не всегда равен контекстной сущности

Первый прогон обнаружил 40 конфликтующих sense keys. После fail-closed guard:

- 160 proper-name occurrences отделены от dictionary common-noun sense;
- 486 occurrences с несовместимыми context POS и Pealim POS получили отдельную
  context identity;
- словарные Pealim/root/meaning сохранены как candidate evidence, но не показаны
  пользователю как подтверждённый контекстный факт;
- число остаточных collision keys сократилось до 6; они остаются в review queue.

Показательные случаи:

- `נטע` как имя человека сталкивается с `pid:7361` «посаженный/укоренённый»;
- `אלון` как имя сталкивается с `pid:9153` «дуб»;
- `אורי` как имя несёт несколько словарных значений без Pealim ID;
- `דרך` объединяет noun/preposition occurrences;
- `צד` объединяет noun/preposition и два root evidence;
- `שום` имеет noun/unknown и два root evidence.

Это подтверждает, что Pealim ID нельзя считать достаточной контекстной истиной
для имени собственного или служебного употребления. Реализованный guard
срабатывает до материализации Obsidian-лексемы.

### MAJOR P0-3 — неполный POS

200 occurrences не имеют нормализуемого POS; 29 самостоятельных лексем попали
в `unknown`. Они сохраняются в диагностическом представлении и не должны молча
исчезать либо назначаться к `noun`.

## 5. Виртуальный Obsidian package

Никакие файлы не записывались. Ядро построило точный in-memory план:

| Артефакт | Количество |
|---|---:|
| Lexeme Markdown | 1,097 |
| Text hub | 1 |
| Base | 1 |
| Portable Markdown snapshot | 1 |
| Occurrences TSV | 1 |
| Projection JSON | 1 |
| Receipt JSON | 1 |
| **Всего** | **1,103 файла** |
| **Суммарный UTF-8 размер** | **8,630,342 bytes = 8.23 MiB** |

Base-preview содержит отдельные views для всей POS-таксономии, ambiguity,
conflicts и unknown. Его синтаксис сверён с официальным Bases schema на уровне
статического контракта; реальный render в Obsidian ещё не выполнялся.

1,103 файла для одного текста технически допустимы, но это важный scale-сигнал.
До экспорта всей библиотеки нужен глобальный dedup/spike: сколько уникальных
lexemes получится для 329 текстов и как Obsidian desktop/mobile индексирует этот
объём.

## 6. Детерминированность и неизменность

Два последовательных запуска на одном свежем ZIP дали одинаковый output hash:

```text
b3b2c79617bc621ca941cb1d0f5731870fb0900bb5733494c6f1131932727962
```

Input SHA-256 до и после обоих запусков одинаков:

```text
2ccd25cede12eb1a2a8347d2e2136e9040b4ef0ba6492c46b365794e0c93b4f4
```

Ядро не возвращает и не обрабатывает `review_log`/`srs_cards`; unit test также
фиксирует byte-equivalent вход после анализа.

## 7. Гейты

| Gate | Статус | Evidence |
|---|---|---|
| Pure unit tests | PASS | 6/6 |
| Scoped fresh production bundle | PASS | manifest + SHA-256 |
| Sense-lemma dedup через общий keyer | PASS | 3,977 → 1,097 context-safe keys |
| Deterministic repeat | PASS | одинаковый output hash |
| Input unchanged | PASS | одинаковый input SHA-256 |
| No vault write | PASS | virtual package only |
| Shared resolver regression | PASS | `smoke:autogen-parity`, thresholds passed |
| Real Obsidian Base parse/render | PENDING | no test-vault write yet |
| Ambiguity completeness | PASS | shared resolver, 100% evaluated, 63 ambiguous |
| Context-safe identity | TECHNICAL_PASS | 646 guarded, 6 residual conflicts quarantined |
| Whole-library scale | PENDING | single-text pilot only |
| Owner acceptance | PENDING | no generated package opened yet |

P0 нельзя закрыть целиком до реального открытия generated Base в отдельном
тестовом vault и whole-library scale spike. Действующий vault на `F:` не изменён.

## 8. Следующий безопасный срез

1. Добавить red fixtures для шести остаточных root/meaning collisions, включая
   `שום`, `תודה`, `אמור`, `כל`, `היה`, `רב`.
2. Выполнить whole-library aggregate spike без вывода содержимого личных текстов.
3. Сгенерировать пакет в отдельный test vault и проверить Bases/RTL/mobile.
4. После owner-review test vault спроектировать UI dry-run в карточке текста.

Перенос в `F:\УЧУ_ИВРИТ\УЧУ_ИВРИТ` остаётся закрыт.
