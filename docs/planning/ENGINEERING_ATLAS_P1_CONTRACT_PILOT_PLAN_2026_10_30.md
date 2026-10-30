# Инженерный атлас P1 — контракт поставки и пилотный пакет: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Выпустить для ИИ-наставника dots рабочий контракт поставки — JSON Schema, валидатор, вычислительное ядро, эталон, инструкцию — и исходный пакет пилотных страниц 7, 197, 282, 284, 288, 289, 485, а также импорт, который превращает ответ dots в граф атласа.

**Architecture:** Весь инструментарий P1 — Python (stdlib) в `scripts/atlas/`, потому что dots запускает проверку у себя в Python-песочнице, а импорт — сборочный шаг, не сервер. Экстрактор (PyMuPDF) выдаёт исходный пакет с нашими ID, bbox, сырым текстом и вырезками. Валидатор проверяет пакет содержимого dots против исходного пакета: структуру по JSON Schema (своя минимальная проверка подмножества схемы — один источник истины), ссылки, сохранность букв иврита, чисел, геометрию, оси статусов и расчёты ядра. Импорт присваивает постоянные ID новым объектам и собирает граф `linguistpro.atlas-graph.1.0.0` — вход для ридера (P2).

**Tech Stack:** Python ≥3.10 stdlib (`json`, `re`, `hashlib`, `unicodedata`, `zipfile`, `unittest`); PyMuPDF — только в экстракторе; JSON Schema draft 2020-12 (как документ и как вход нашей проверки подмножества).

**Spec:** `docs/planning/ENGINEERING_FORMULARY_ATLAS_DESIGN_2026_10_30.md` (OWNER_APPROVED v4), §4 (граф), §6 (роли и контракт), §7 (конвейер), §10 п. 1–2, §11.

## Global Constraints

- Валидатор, ядро, проверка схемы и импорт — только stdlib Python ≥3.10: они уходят dots в архиве и должны запускаться без установки пакетов.
- Схемы: исходный пакет `linguistpro.atlas-source-pack.1.0.0`, пакет содержимого `linguistpro.atlas-content-pack.1.0.0`, граф `linguistpro.atlas-graph.1.0.0`.
- `atlas_id` = `a97002`. ID: страница `a97002:p197`, блок `a97002:p197:b004`, формула `a97002:p197:f01`, символ `a97002:p197:f01:s03`, рисунок `a97002:p197:fig79` (по номеру «איור N», иначе `…:img02`), пример `a97002:p288:ex1`, термин `a97002:term:<slug>`, ссылка на смысл `a97002:term:<slug>#<sense>`. Номер страницы в ID — без ведущих нулей (`p7`, `p197`); номера объектов — с ведущими нулями: `b001`, `f01`, `s01`, `img01`.
- Временный ID нового объекта от dots: `new:<ID родителя>:<метка>`, метка `^[a-z0-9]+(-[a-z0-9]+)*$`, уникальна в пределах родителя. Постоянный ID при импорте: `<ID родителя>:r-<метка>` (область), `:t-<метка>` (таблица), `:e-<метка>` (опечатка), `:x-<метка>` (пример на растровой странице). Решение плана: ID по метке, а не «следующий номер», — стабилен между ревизиями поставки (§13 спеки обновляется в Task 6).
- Координаты: страница = индекс PDF с 1 (совпадает с печатным); bbox `[x0,y0,x1,y1]` в пунктах PDF, начало — левый верхний угол, y вниз; страница 595×842 pt.
- Оси статусов: `recognition` (`extracted | ocr_high | ocr_low`), `language_review` (`unreviewed | producer_checked | owner_reviewed`), `math_review` (`unchecked | core_verified | core_mismatch | not_applicable`), `owner_status` (`none | owner_confirmed | owner_rejected`). Поставщик может ставить только `recognition ∈ {ocr_high, ocr_low}` (и только у объектов без текстового слоя) и `language_review ∈ {unreviewed, producer_checked}`.
- Грамматика `compute`: операции `+ - * / ^`, унарный минус, скобки; константы `pi, e`; функции `sqrt, abs, exp, ln, log10, pow, min, max, sin, cos, tan, asin, acos, atan, atan2`; переменные — значения `var` символов формулы; при любой тригонометрии обязательно `angle_unit: "deg" | "rad"`; без `compute` обязательно `compute_absent_reason`.
- Ничего из пакета не содержит абсолютных путей диска владельца — только имя файла и SHA-256.
- Вырезки: PNG, имя = SHA-256 содержимого; страницы — 150 dpi, рисунки и формулы — 200 dpi. Изображения пилота коммитятся (≈ единицы МБ); полный атлас — на прод-том (вне P1).
- Без пуша в `main` (документы и инструменты без релиза — пуш стоит целого деплоя); коммиты — в ветку `feat/engineering-atlas`.
- Тесты: `python -m unittest discover -s scripts/atlas/tests -t scripts/atlas -v`; npm-скрипт `test:atlas` с этой командой.

## Review Focus

1. **dots потерял, добавил или переставил слово иврита** (типично для RTL со скобками) → валидатор отклоняет блок: потеря/добавление — мультимножество букв `he` ≠ `he_raw` (`E_HEBREW_LETTERS`); перестановка — последовательность нормализованных слов `he` ≠ `he_raw` (`E_HEBREW_ORDER`); с `he_fix_note` обе становятся предупреждениями. Тесты — Task 4.
2. **Числа в переводе записаны с десятичной запятой (`0,15`) или пропали** → сравнение после нормализации запятой; отсутствующее число — ошибка. Тест — Task 4.
3. **bbox области дан в пикселях вырезки 200 dpi, а не в пунктах страницы** → выходит за bbox рисунка → ошибка с подсказкой про единицы. Тест — Task 4.
4. **Пакет содержимого сделан по другому или устаревшему исходному пакету** → `source_pack_sha256` в заголовке ≠ хэш `pages.jsonl` → ошибка до остальных проверок. Тест — Task 4.
5. **JSONL из Windows/ChatGPT с BOM, CRLF, пустыми строками или битой строкой** → BOM и пустые строки допускаются; битая строка — ошибка с номером строки, остальные строки проверяются. Тест — Task 4.

---

## File Structure

| Файл | Ответственность |
|---|---|
| `scripts/atlas/atlas_compute.py` | токенизатор, парсер, вычисление `compute`; список переменных; признак тригонометрии |
| `scripts/atlas/atlas_schema.py` | загрузка схем, проверка подмножества JSON Schema, чтение JSONL |
| `scripts/atlas/schemas/source-pack.schema.json` | контракт исходного пакета |
| `scripts/atlas/schemas/content-pack.schema.json` | контракт пакета содержимого |
| `scripts/atlas/atlas_extract.py` | экстрактор PDF → исходный пакет (+ CLI) |
| `scripts/atlas/atlas_validate.py` | валидатор пакета содержимого (+ CLI) |
| `scripts/atlas/atlas_import.py` | постоянные ID, граф, журнал соответствия (+ CLI) |
| `scripts/atlas/build_dots_bundle.py` | архив для dots |
| `scripts/atlas/README.dots.ru.md` | инструкция для dots |
| `scripts/atlas/tests/test_*.py` | тесты по модулю |
| `atlas/a97002/pilot/source-pack/` | исходный пакет пилота (manifest, pages.jsonl, assets/) |
| `atlas/a97002/pilot/reference/reference-content.jsonl` | эталон, заполненный вручную |
| `docs/research/engineering-atlas/2026-10-30-pilot-pack/` | архив для dots + README (артефакт владельца) |

---

### Task 1: Вычислительное ядро `compute`

**Files:**
- Create: `scripts/atlas/atlas_compute.py`
- Test: `scripts/atlas/tests/test_compute.py`
- Modify: `package.json` (скрипт `test:atlas`)

**Interfaces:**
- Produces:
  - `class ComputeError(ValueError)` — с полем `code` (`SYNTAX | UNKNOWN_FUNCTION | UNKNOWN_VARIABLE | ARITY | DOMAIN | ANGLE_UNIT_REQUIRED`).
  - `parse(expr: str) -> Node` — AST (кортежи или dataclass — выбор исполнителя).
  - `variables(expr: str) -> set[str]`
  - `uses_trig(expr: str) -> bool`
  - `evaluate(expr: str, bindings: dict[str, float], angle_unit: str | None = None) -> float`
  - `matches_printed(value: float, printed: str) -> bool` — сравнение с напечатанным числом: допуск = половина единицы последнего напечатанного разряда плюс `1e-9·|value|`; `printed` может содержать десятичную запятую.

- [ ] **Step 1: Тесты**

```python
def test_belt_ratio(self):
    self.assertAlmostEqual(C.evaluate('d*(1-xi)/D', {'d': 100, 'xi': 0.02, 'D': 250}), 0.392)
def test_power_and_sqrt(self):
    L = C.evaluate('pi/2*(D+d)+2*sqrt(A^2+((D-d)/2)^2)', {'D': 250, 'd': 100, 'A': 500})
    self.assertAlmostEqual(L, 1560.966, places=3)  # π/2·350 + 2·√255625 = 549.779 + 1011.187
def test_trig_requires_angle_unit(self):
    with self.assertRaises(C.ComputeError) as e: C.evaluate('F*sin(alpha)', {'F': 10, 'alpha': 30})
    self.assertEqual(e.exception.code, 'ANGLE_UNIT_REQUIRED')
def test_trig_degrees(self):
    self.assertAlmostEqual(C.evaluate('F*sin(alpha)', {'F': 10, 'alpha': 30}, 'deg'), 5.0)
def test_atan_returns_in_angle_unit(self):
    self.assertAlmostEqual(C.evaluate('atan(a/b)', {'a': 1, 'b': 1}, 'deg'), 45.0)
def test_unknown_function_rejected(self):  # e.g. 'floor(x)', '__import__(x)'
    ...code == 'UNKNOWN_FUNCTION'
def test_unbound_variable(self): ...code == 'UNKNOWN_VARIABLE'
def test_right_assoc_power_and_unary(self):
    self.assertEqual(C.evaluate('-2^2', {}), -4); self.assertEqual(C.evaluate('2^3^2', {}), 512)
def test_variables_and_trig_flag(self):
    self.assertEqual(C.variables('x_in*cos(alpha)+pi'), {'x_in', 'alpha'}); self.assertTrue(C.uses_trig('atan2(y,x)'))
def test_matches_printed(self):
    self.assertTrue(C.matches_printed(2200.0, '2200')); self.assertTrue(C.matches_printed(0.0316, '0,0316'))
    self.assertFalse(C.matches_printed(2280.0, '2200')); self.assertTrue(C.matches_printed(0.03158, '0.0316'))
def test_p289_source_inconsistency(self):  # 0.56*2000 + y*600 with y=2 vs printed 2200
    self.assertFalse(C.matches_printed(C.evaluate('x*Fr+y*Fa', {'x': .56, 'Fr': 2000, 'y': 2, 'Fa': 600}), '2200'))
```

- [ ] **Step 2:** `python -m unittest discover -s scripts/atlas/tests -t scripts/atlas -v` → FAIL (модуль отсутствует).
- [ ] **Step 3: Реализация** — рекурсивный спуск без `eval`; приоритет `^` (правоассоциативный) > унарный минус > `* /` > `+ -`; идентификаторы `^[A-Za-z][A-Za-z0-9_]*$`; угол: при `deg` прямые функции переводят аргумент в радианы, обратные (`asin, acos, atan, atan2`) возвращают градусы; область определения (`sqrt` от отрицательного, `ln` от ≤0, деление на 0) → `DOMAIN`. В `package.json` добавить `"test:atlas": "python -m unittest discover -s scripts/atlas/tests -t scripts/atlas -v"`.
- [ ] **Step 4:** та же команда → PASS.
- [ ] **Step 5: Commit** `feat(atlas): compute grammar core for formula checks`

---

### Task 2: Схемы и проверка подмножества JSON Schema

**Files:**
- Create: `scripts/atlas/atlas_schema.py`, `scripts/atlas/schemas/source-pack.schema.json`, `scripts/atlas/schemas/content-pack.schema.json`
- Test: `scripts/atlas/tests/test_schema.py`

**Interfaces:**
- Produces:
  - `load_schema(name: str) -> dict` — `name ∈ {'source-pack', 'content-pack'}`, из `scripts/atlas/schemas/`.
  - `check(schema: dict, obj, path='$') -> list[str]` — сообщения вида `$.status.language_review: not in enum [...]`. Поддерживает: `type` (включая список), `required`, `properties`, `additionalProperties: false`, `enum`, `const`, `pattern`, `minLength`, `items`, `minItems`, `minimum`, `maximum`, `$defs` + локальные `$ref`, и диспетчер по `type` объекта через `oneOf` из веток с `properties.type.const`.
  - `read_jsonl(path: str) -> tuple[list[tuple[int, dict]], list[str]]` — (номер строки, объект) и ошибки разбора; BOM, CRLF и пустые строки допустимы.

Содержание схем (поля — из §6 спеки):
- source-pack, объекты `pages.jsonl`: `page {id, page, image, has_text_layer}`, `block {id, page, bbox, he_raw, kind_guess, order}`, `formula {id, page, bbox, source_text, crop}`, `symbol {id, formula_id, page, bbox, symbol_raw, description_he_raw, unit_raw}`, `figure {id, page, bbox, crop, number|null, caption_block_id|null}`, `example {id, page, heading_block_id|null, image_only}`; `manifest.json {schema, atlas_id, source{filename, sha256, page_count, page_size_pt}, extractor{version}, pages[], logo_xref_digests[], warnings[]}`.
- content-pack: `header {schema, atlas_id, source_pack_sha256, producer, produced_at, pages[]}`; `block {id, kind, he, he_niqqud, translit, translit_ru?, ru, terms[], he_fix_note?, ambiguity_note?, status}`; `formula {id, display_latex, compute|null, compute_absent_reason?, angle_unit?, speech_ru?, speech_he?, ambiguity_note?, status}`; `symbol {id, formula_id?, symbol_latex, var, description_he, description_ru, unit, term?, ambiguity_note?}`; `figure {id, caption_he, caption_ru}`; `region {id, parent, bbox, label_he, label_ru, links[], status}`; `table {id, parent, bbox, title_he?, title_ru?, cells[{row, col, rowspan, colspan, bbox?, he, ru, unit?, note?}], status}`; `term {id, lemma_he, niqqud, translit, translit_ru?, senses[{sense, ru, context}]}`; `example {id, steps[{block?, compute, angle_unit?, bindings{}, printed}]}`; `erratum {id, page, target, as_printed, proposed, explanation_ru}`; `report {discrepancies[{ref, note}]}`.
- `kind` блока: `heading | prose | list_item | caption | formula_label | symbol_row | example_heading | example_text | table_note | other`.
- `status`: объект с полями четырёх осей; enum — из Global Constraints (схема разрешает все значения; ограничения поставщика проверяет валидатор, Task 4).

- [ ] **Step 1: Тесты** — `test_required_and_enum`, `test_additional_properties_false`, `test_ref_and_defs`, `test_oneof_dispatch_by_type_const` (объект `{"type":"region",...}` проверяется только веткой `region`; неизвестный `type` → одно сообщение `unknown type 'regoin'`), `test_read_jsonl_bom_crlf_blank_lines`, `test_read_jsonl_bad_line_reports_number` (строка 3 битая → ошибка `line 3: ...`, строки 1, 2, 4 прочитаны), `test_schemas_load_and_accept_minimal_objects` (по одному минимальному валидному объекту каждого типа обеих схем).
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализация `atlas_schema.py` и обеих схем (`$schema: https://json-schema.org/draft/2020-12/schema`, `$id` = имя схемы с версией).
- [ ] **Step 4:** запуск → PASS.
- [ ] **Step 5: Commit** `feat(atlas): source/content pack JSON schemas and subset checker`

---

### Task 3: Экстрактор исходного пакета и пилот

**Files:**
- Create: `scripts/atlas/atlas_extract.py`
- Test: `scripts/atlas/tests/test_extract.py`
- Create (вывод, коммитится): `atlas/a97002/pilot/source-pack/{manifest.json,pages.jsonl,assets/*.png,contact-sheet.png}`

**Interfaces:**
- Consumes: `atlas_schema.load_schema('source-pack')`, `check`.
- Produces:
  - Чистые функции (тестируются без PDF): `normalize_rtl_line(text: str) -> str` (перенос ведущей `.,:;` в конец у строки с ивритом; удаление управляющих символов bidi U+200E/200F/202A–202E); `classify_block(text: str) -> str` (`kind_guess`); `is_formula_text(text: str) -> bool` (символы U+1D400–U+1D7FF или `=`/`√` при доле ивритских букв < 30 %); `parse_symbol_rows(lines: list[str]) -> list[dict]` (строки таблицы после заголовка `סמל … תיאור … יחידות` → `{symbol_raw, description_he_raw, unit_raw}`); `figure_number(caption: str) -> int | None` (`איור 79 - …` → 79); `logo_xrefs(doc_image_counts: dict[int,int], page_count: int) -> set[int]` (xref, встречающиеся на > 50 % страниц).
  - `extract(pdf_path: str, pages: list[int], out_dir: str) -> dict` — пишет пакет, возвращает manifest.
  - CLI: `python scripts/atlas/atlas_extract.py --pdf <файл> --pages 7,197,282,284,288,289,485 --out atlas/a97002/pilot/source-pack`.

Правила, которые тест не определяет однозначно:
- Блоки = блоки `page.get_text('dict')`, кроме колонтитула (номер страницы в нижних 8 %); порядок `order` — сверху вниз, справа налево внутри строки блоков.
- Формула: блок, для которого `is_formula_text`; `source_text` — склейка спанов в порядке x, без нормализации; рядом стоящие по вертикали (≤ 6 pt) формульные блоки — одна формула.
- Таблица обозначений: блоки после заголовка `סמל`/`תיאור`/`יחידות` до следующего нетабличного блока → `symbol`, `formula_id` = последняя формула выше **на этой же странице**; иначе `null` и предупреждение `symbol_unbound:<id>` в `manifest.warnings` (соседство через страницы — не доказательство связи, в пилоте между страницами большие пропуски). Привязку несвязанного символа может предложить поставщик полем `symbol.formula_id` (→ `W_SYMBOL_BOUND_BY_PRODUCER`, на просмотр владельцу); менять привязку, выданную экстрактором, — `E_SYMBOL_BINDING`.
- Рисунок: изображение не из `logo_xrefs`; `number` и `caption_block_id` — от ближайшей ниже подписи «איור N» в пределах 40 pt; подпись без изображения рядом → предупреждение `caption_without_image:<page>:<N>`.
- Страница с < 50 символами текста → `has_text_layer: false`; на ней все изображения — рисунки; если есть подпись/заголовок «דוגמה» или страница стоит перед страницей, начинающейся с «פתרון», — объект `example` с `image_only: true` (стр. 288).
- Пример: блок, начинающийся с `דוגמה`, → `example` с `heading_block_id`.
- `manifest.source.filename` — только имя файла.

- [ ] **Step 1: Тесты чистых функций** — `normalize_rtl_line('.הממסרת') == 'הממסרת.'`; латинская строка не меняется; `classify_block('איור 79 - תמסורת רצועה') == 'caption'`; `is_formula_text('𝑖= 𝑑∙(1 −𝜉)')`; не формула — `'מהירות חיתוך – 𝐯𝐜'`; `parse_symbol_rows` на строках стр. 365 (`vc מהירות חיתוך m/min`, `d קוטר עובד או כלי mm`, `n מהירות סיבוב rpm`) → 3 записи с правильными единицами; `figure_number('איור  80   -   מידות יסוד') == 80`; `logo_xrefs({5: 564, 6: 564, 40: 1}, 564) == {5, 6}`.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализация модуля и CLI.
- [ ] **Step 4:** тесты → PASS.
- [ ] **Step 5: Интеграционный тест по живому PDF** — `test_pilot_pdf` пропускается (`skipUnless`), если не задана переменная окружения `ATLAS_SOURCE_PDF`. Проверки: 7 страниц; на стр. 197 есть `figure` с `number` 79 и 80 и формула, `source_text` которой содержит `𝜉`; на стр. 7 есть символы `Fx`, `Fy`, `F`, `α`, привязанные к формуле; стр. 282, 284, 288 — `has_text_layer: false` (288) или рисунки-таблицы (282, 284); стр. 288 → `example` с `image_only: true`; каждый объект проходит `check(source-pack)`; ни одна строка не содержит `G:\`.
- [ ] **Step 6:** выполнить CLI на пилоте и сделать `contact-sheet.png` (миниатюры страниц с рамками bbox: блоки — серые, формулы — бирюзовые, рисунки — оранжевые, символы — фиолетовые). **Осмотреть глазами** все 7 страниц; расхождения разметки — исправить правила и повторить. Записать в `manifest.warnings` то, что осталось неразмеченным.
- [ ] **Step 7: Commit** `feat(atlas): source-pack extractor and pilot pages 7,197,282,284,288,289,485`

---

### Task 4: Валидатор пакета содержимого

**Files:**
- Create: `scripts/atlas/atlas_validate.py`
- Test: `scripts/atlas/tests/test_validate.py` (+ маленькие фикстуры прямо в тесте: синтетический исходный пакет из 1 страницы)

**Interfaces:**
- Consumes: `atlas_schema.read_jsonl`, `load_schema`, `check`; `atlas_compute.parse`, `variables`, `uses_trig`, `evaluate`, `matches_printed`, `ComputeError`.
- Produces:
  - `load_source_pack(dir: str) -> SourcePack` — `manifest`, `objects: dict[id, dict]`, `pages_sha256` (SHA-256 байтов `pages.jsonl`).
  - `validate(source: SourcePack, content_path: str) -> Report` — `Report` = dict `{ok: bool, errors: [Finding], warnings: [Finding], findings: [Finding], stats: {...}}`, `Finding = {code, ref, line, message}`.
  - CLI: `python scripts/atlas/atlas_validate.py --source <dir> --content <file.jsonl> [--json]`; код выхода 0 при `ok`, 1 при ошибках; человекочитаемый вывод на русском.

Коды (каждый — отдельный тест; E — ошибка, W — предупреждение, F — находка ядра):
- `E_PARSE` — строка JSONL не разобрана (номер строки). `E_SCHEMA` — нарушение схемы.
- `E_HEADER` — первой строкой не `header`; `E_SOURCE_MISMATCH` — `source_pack_sha256` ≠ хэш `pages.jsonl` (остальные проверки не выполняются); `atlas_id` ≠ `a97002`.
- `E_UNKNOWN_ID` — неновый ID объекта страницы (`block, formula, symbol, figure, example`) отсутствует в исходном пакете; `E_TYPE_MISMATCH` — тип не совпадает; `E_DUPLICATE_ID`.
- **Термины создаёт поставщик** (это не геометрия страницы, в исходном пакете их нет): ID `a97002:term:<slug>`, slug и `sense` — шаблон меток; `E_TERM` — дубликат термина, дубликат `sense` внутри термина, пустой `ru` смысла; `W_TERM_UNUSED` — на термин/смысл не ссылается ни один блок, символ или область. Термины пилота — пилотные; общий реестр терминов всего атласа — P3.
- `E_NEW_ID` — временный ID не по шаблону, родитель отсутствует или метка повторяется у родителя; `E_BBOX_OUTSIDE` — bbox нового объекта выходит за bbox родителя (допуск 2 pt) или за страницу; сообщение подсказывает «bbox — в пунктах страницы, не в пикселях вырезки».
- `E_STATUS_OWNER` — поставщик выставил `math_review`, `owner_status` ≠ `none` или `language_review = owner_reviewed`; `E_STATUS_RECOGNITION` — `ocr_*` у объекта с текстовым слоем или `extracted` от поставщика.
- `E_COVERAGE` — блок исходного пакета с ивритом на странице из `header.pages` не покрыт или пустое `he`/`he_niqqud`/`translit`/`ru`.
- `E_HEBREW_LETTERS` — мультимножество букв U+05D0–U+05EA в `he` ≠ в `he_raw` (сравнение без учёта конечных форм: ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ); при наличии `he_fix_note` — `W_HEBREW_FIXED`. `E_NIQQUD_BASE` — `he_niqqud` без огласовок (удалить Mn) ≠ `he` по буквам.
- `E_HEBREW_ORDER` — последовательность слов иврита в `he` ≠ в `he_raw`. Слово = максимальная последовательность букв U+05D0–U+05EA (после снятия огласовок, с заменой конечных форм; гереш/гершаим/кавычки внутри слова удаляются, макаф и дефис — разделители); пунктуация, скобки, цифры, латиница и математика не участвуют, поэтому перенос точки или зеркальные скобки RTL не дают ложной ошибки. С `he_fix_note` — `W_HEBREW_ORDER_FIXED`.
- `E_NUMBERS` — число из `he_raw` (после замены `,`→`.` между цифрами) отсутствует в `ru`.
- `E_REF` — ссылка на несуществующий термин/смысл, символ, рисунок или цель опечатки.
- `E_COMPUTE` — `compute` не разбирается; переменная не из `var` символов формулы; тригонометрия без `angle_unit`; нет ни `compute`, ни `compute_absent_reason`.
- `F_CORE_MISMATCH` / `F_CORE_VERIFIED` — **только арифметика**: `core_verified` значит «вычисление по выражению с данными подстановками совпало с напечатанным числом», а не «инженерная модель верна». Размерности и единицы в P1 не проверяются (P5: единицы в ядре). Шаг примера: `evaluate(compute, bindings, angle_unit)` против `printed`; несовпадение — находка (кандидат в опечатку), не ошибка.
- `W_TERM_RU` — у блока, ссылающегося на `term#sense`, в `ru` нет основы перевода смысла (первые `max(4, len-2)` букв каждого слова перевода, без учёта регистра).
- `W_TRANSLIT_RU_MISSING`, `W_SYMBOL_UNUSED` (символ формулы не встречается в `compute`), `W_FIGURE_NO_REGIONS`.

- [ ] **Step 1: Тесты** — по тесту на каждый код выше; плюс Review Focus: `test_dropped_word_rejected`, `test_swapped_words_rejected` (два слова переставлены, буквы те же → `E_HEBREW_ORDER`), `test_moved_period_and_mirrored_parens_ok`, `test_decimal_comma_accepted`, `test_missing_number_rejected`, `test_pixel_bbox_rejected_with_hint` (область рисунка `[189,269,406,383]`, bbox ×2.78), `test_stale_source_pack_stops_early`, `test_bom_crlf_blank_lines_ok`; и `test_clean_pack_ok` (полностью корректный синтетический пакет → `ok`, 0 ошибок).
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализация.
- [ ] **Step 4:** запуск → PASS.
- [ ] **Step 5: Commit** `feat(atlas): content-pack validator with independent letter, number, geometry and core checks`

---

### Task 5: Эталон, заполненный вручную

**Files:**
- Create: `atlas/a97002/pilot/reference/reference-content.jsonl`, `atlas/a97002/pilot/reference/README.md`
- Test: `scripts/atlas/tests/test_reference.py`

**Interfaces:**
- Consumes: `atlas_validate.load_source_pack`, `validate`; пилотный пакет Task 3.

Эталон — образец качества для dots, не весь пилот. Содержит:
- стр. 7 — **все** блоки (he, he_niqqud, translit, translit_ru, ru), формулы `Fx = F·cos α`, `Fy = F·sin α` (display_latex, compute, `angle_unit: "deg"`), символы `Fx, Fy, F, α` с переводом и единицами, рисунок 4 с подписью и ≥ 2 областями (`new:a97002:p7:fig4:…`), опечатка `new:a97002:p7:e-fy-cos` (`as_printed: "Fy = F ∙cos α° (רכיב אנכי)"`, `proposed: "Fy = F ∙ sin α°"`, объяснение);
- стр. 197 — все блоки, обе формулы `i` (`n_out/n_in` и `d·(1−ξ)/D`) с предупреждающим `ambiguity_note` о соглашении `i = n_out/n_in`, формула длины ремня `L` с compute, рисунки 79 и 80 с областями `shkiv-small`, `shkiv-large`, `center-distance`, `angle-beta`;
- стр. 289 — пример 2: шаг `x*Fr+y*Fa` с `bindings {x: 0.56, Fr: 2000, y: 2, Fa: 600}`, `printed: "2200"` (должен дать `F_CORE_MISMATCH`) и шаг `Fa/C0 → 0.0316` (должен дать `F_CORE_VERIFIED`);
- стр. 282 — одна растровая таблица `new:a97002:p282:t-…` с 2 строками ячеек как образец структуры;
- ≥ 6 терминов со смыслами (`retsua#belt`, `galgal-mania#driving-pulley`, `galgal-muna#driven-pulley`, `moment-sivuv#torque`, `mehirut-sivuv#rotational-speed`, `kiv-anchi#vertical-component`);
- `header.pages = [7, 197]` (покрытие требуется только для них), `report` с одним расхождением.
Все `status.language_review = producer_checked`. Огласовки эталона сверить с «вторым мнением Dicta» (`dicta-niqqud`-путь проекта) или вручную по словарю; транслит — в конвенции существующих корпусов (`She'ela`).

- [ ] **Step 1: Тест** `test_reference_passes`: `validate(...)['ok']`, 0 ошибок; ровно одна `F_CORE_MISMATCH` с `ref` шага стр. 289 и ≥ 1 `F_CORE_VERIFIED`; есть объекты типов `block, formula, symbol, figure, region, table, term, example, erratum, report`.
- [ ] **Step 2:** запуск → FAIL (файла нет).
- [ ] **Step 3:** заполнить эталон и README (что это, как сделан, коммит источника, статус `reference · producer_checked`).
- [ ] **Step 4:** запуск → PASS; дополнительно `python scripts/atlas/atlas_validate.py --source atlas/a97002/pilot/source-pack --content atlas/a97002/pilot/reference/reference-content.jsonl` → выход 0, человекочитаемый отчёт показывает находку стр. 289.
- [ ] **Step 5: Контрольная точка «контракт»** — сверить вручную, поле за полем: схемы (Task 2) ↔ коды валидатора (Task 4) ↔ эталон (Task 5) ↔ раздел контракта в спеке §6; каждое поле эталона есть в схеме, каждое правило README будет иметь код. Расхождения исправить до коммита.
- [ ] **Step 6: Commit** `feat(atlas): hand-made reference content for pilot pages 7, 197, 289, 282`

---

### Task 6: Импорт в граф

**Files:**
- Create: `scripts/atlas/atlas_import.py`
- Test: `scripts/atlas/tests/test_import.py`
- Modify: `docs/planning/ENGINEERING_FORMULARY_ATLAS_DESIGN_2026_10_30.md` (§6 п. 1 и §13: постоянный ID по метке)

**Interfaces:**
- Consumes: `atlas_validate.load_source_pack`, `validate`.
- Produces:
  - `permanent_id(temp_id: str, type_: str) -> str` — `new:<parent>:<label>` → `<parent>:r-<label>` / `:t-<label>` / `:e-<label>` по типу (`region | table | erratum`); для `example` из `new:` → `<parent>:x-<label>`.
  - `build_graph(source: SourcePack, content_path: str) -> tuple[dict, dict]` — (граф, журнал `{temp_id: permanent_id}`); бросает `ImportRejected` с отчётом валидатора, если `ok` ложно.
  - CLI: `python scripts/atlas/atlas_import.py --source <dir> --content <file.jsonl> --out <dir>` → `<out>/graph.json`, `<out>/id-map.json`, `<out>/validation-report.json`.

Граф `linguistpro.atlas-graph.1.0.0`: `{schema, atlas_id, source_pack_sha256, content_pack_sha256, built_at, objects: {id: obj}, pages: {"197": [ids в порядке order]}, terms: {id: term}, findings: [...]}`. Каждый объект = поля исходного объекта + поля содержимого; ссылки переписаны на постоянные ID; `status` выставляет импорт: `recognition = extracted` у объектов с текстовым слоем (иначе — от поставщика), `math_review` у формул и шагов примеров — по ядру (`core_verified | core_mismatch | not_applicable | unchecked`), `owner_status = none`. Находки `F_CORE_MISMATCH` становятся объектами `erratum` с `origin: "core"`, если поставщик не прислал опечатку с той же целью.

- [ ] **Step 1: Тесты** — `test_permanent_ids_label_based`; `test_reimport_same_ids` (повторный импорт → идентичный `id-map`, граф совпадает кроме `built_at`); `test_refs_rewritten` (ссылка `links` региона и `target` опечатки указывают на постоянные ID); `test_status_axes_set_by_import`; `test_core_mismatch_becomes_erratum`; `test_rejects_invalid_pack` (`ImportRejected`); `test_reference_import` (эталон → граф, на стр. 197 ≥ 4 области и 2 рисунка).
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализация; правка спеки §6 п. 1 («постоянный ID = `<родитель>:r-<метка>`, стабилен между ревизиями») и §13.
- [ ] **Step 4:** запуск → PASS.
- [ ] **Step 5: Commit** `feat(atlas): import content pack into atlas graph with stable label-based IDs`

---

### Task 7: Архив для dots и инструкция

**Files:**
- Create: `scripts/atlas/README.dots.ru.md`, `scripts/atlas/build_dots_bundle.py`
- Test: `scripts/atlas/tests/test_bundle.py`
- Create (вывод, коммитится): `docs/research/engineering-atlas/2026-10-30-pilot-pack/{a97002-pilot-for-dots.zip, README.md}`

**Interfaces:**
- Consumes: всё выше.
- Produces: `build_bundle(out_zip: str) -> list[str]` — список путей в архиве; CLI `python scripts/atlas/build_dots_bundle.py --out docs/research/engineering-atlas/2026-10-30-pilot-pack/a97002-pilot-for-dots.zip`.

Архив (пути внутри): `README.ru.md` (= `README.dots.ru.md`), `schemas/*.json`, `tools/{atlas_compute.py, atlas_schema.py, atlas_validate.py}`, `source-pack/**`, `reference/reference-content.jsonl`, `TASK.ru.md` (что сдать: `content-pilot.jsonl` по страницам 7, 197, 282, 284, 288, 289, 485).

`README.dots.ru.md` — разделы: роли и что нельзя (`owner_*`, `math_review`, собственные ID); формат JSONL и порядок строк; координаты (с примером пересчёта пикселей вырезки 200 dpi в пункты: `pt = px · 72 / 200 + bbox родителя x0/y0`); временные ID и метки; формулы (три поля, грамматика, `angle_unit`, `compute_absent_reason` — не подгонять формулу); язык (`he` — исправленный по изображению текст, `he_fix_note` при расхождении с `he_raw`, транслит в конвенции эталона, «одно значение — один перевод», `ambiguity_note`); таблицы; примеры (шаги с `bindings` и `printed`); опечатки (только предложение, подтверждает владелец); запуск проверки `python tools/atlas_validate.py --source source-pack --content content-pilot.jsonl`; что значит каждый код ошибки; «валидатор не заменяет смысловую вычитку».

- [ ] **Step 1: Тест** `test_bundle_contents`: архив содержит перечисленные пути; `tools/atlas_validate.py`, распакованный во временную папку, запускается `python -I` (без доступа к репозиторию) на `reference/reference-content.jsonl` → выход 0; ни один файл архива не содержит `G:\` или `E:\`.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализация, README, сборка архива, README артефакта (что это, команда, коммит, статус `ready-for-dots`).
- [ ] **Step 4:** запуск → PASS; полный `npm run test:atlas` → PASS; `npm test` → без новых падений.
- [ ] **Step 5: Commit** `feat(atlas): dots delivery bundle for the pilot`

---

### Task 8: Передача и учёт

**Files:**
- Modify: `docs/planning/ENGINEERING_FORMULARY_ATLAS_DESIGN_2026_10_30.md` (статус: «P1 выполнен, пилотный пакет передан dots», ссылка на план и архив)
- Modify: `docs/architecture/AGENT_DOMAIN_GUIDE.md` (короткий абзац «Инженерный атлас»: где инструменты, схемы, пилот, спека)

- [ ] **Step 1:** обновить документы.
- [ ] **Step 2: Контрольная точка «перед передачей»** — распаковать архив во временную папку вне репозитория и выполнить по `README.ru.md` как сторонний пользователь (`python -I tools/atlas_validate.py …` → выход 0 на эталоне); ещё раз осмотреть `contact-sheet.png` всех 7 страниц; `npm run test:atlas` PASS. Затем — одна независимая проверка всей ветки свежим ревьюером (контракт, экстрактор, валидатор).
- [ ] **Step 3: Commit** `docs(atlas): P1 handoff status and domain guide entry`
- [ ] **Step 4:** сообщить владельцу путь к архиву и что передать dots.

---

## Дальше (отдельные планы после ответа dots)

- **P2.** Импорт ответа dots по пилоту → ридер атласа в Зале (экран по макету стр. 197) и печать варианта Б на пилотных страницах; проверка владельцем; фиксация схемы 1.0.0.
- **P3.** Экстракция всех 564 страниц, ядро терминов, выборочная сверка огласовок «вторым мнением Dicta», поток разделов от dots, публикация издания, изображения на прод-томе, офлайн.
- **P4.** Тренажёр: снятие перевода по ступеням, «Найди в книге», «Что это за символ?», термины в SRS; приём экзаменационных задач владельца.
- **P5.** Пилот мастерской «Ременная передача» (JS-версия ядра `compute` с тестом паритета против Python-ядра).
