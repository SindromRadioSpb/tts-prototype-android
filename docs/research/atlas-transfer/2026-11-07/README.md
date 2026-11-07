# Безопасный перенос 97001 — 2026-11-07

Статус: побайтовый архив и локальный roundtrip доказаны. Допуск к содержательной пересборке НЕ выдан: семантический импорт изменённой редакции и автоматический gate ИИ требуют завершения. Production не изменён. Исходный commit eb5fad7c; отдельная ветка research/atlas-transfer-audit, не main.

## Что уже было

- `atlas_import.py` импортирует поставщицкий content pack в graph, переписывает временные ID, выставляет статусы. Это не обратный импорт опубликованного reader JSON.
- `build_reader_data.py` собирает производный reader из source/content; ограниченные списки полей означают, что обратная сборка из reader не доказана как lossless.
- `lib/atlasEdition.js` и `stage-edition.cjs`: immutable namespace, SHA-256, проверка sections/search/shards/train/assets, атомарный staging. Не включают PDF, supplier/editorial и отдельный context package.
- `export-context.cjs`/`import-context.cjs` — ИИ-слой; `export-snapshot-browser.cjs` — learner progress. Ни один не является полным экспортом материала.

## Снимок

Получены по HTTPS все 843 файла действующего edition manifest и 21 файл context manifest, проверен SHA-256 каждого ответа. Манифесты проверены по pin из фактически полученного `/js/atlas-edition.js`. Сохранены исходный PDF, supplier source ZIP, editorial TAR.GZ и исходные checksums из рабочей копии atlas-97001. Старые редакционные архивы сохранены как исторические исходники, не объявляются точным исходным деревом текущего runtime.

Архив: `E:/projects/tts-prototype-android/Архив/atlas-transfer-20261107/` — `source`, `export`, `candidate`, `reexport`. Всего 873 файла / 273212707 байт. Все поля JSON, неизвестные поля, таблицы/ячейки, формулы, термины, идентификаторы и бинарные файлы сохраняются без десериализации и перезаписи. Это доказательство сохранности существующих данных, не доказательство полноты их исходного распознавания.

Редакция: `50253381cb255822678b07e0ed41a608a3a701a661527eb796837b2f3ee64edc`.
Manifest: `085d33fddbd04a1eaaa4a9e625273591683cdcf9ff19d0b16899d503132ada7a`.
Context manifest: `ca40870e123fd81e1388918f8bf3babc3c1acbe1ef1daca6fb5059b3ad9384f4`.
PDF: `eb4e4ee7f154bce30dbd61b094d6a42a9925af909bd7ecb2f80bce4639af0e0c`, совпадает с checksums и просмотренным structure_provenance. Полный файловый список: inventory.json. Результат: verification.json.

## Добавлено и проверено

`scripts/atlas/material_snapshot.py`: произвольные файлы без потерь, инвентарь SHA-256/bytes, проверка лишних/пропавших/изменённых файлов, запрет symlink/junction и существующей цели, копирование через временный каталог и rename. Import без `--write` ничего не записывает. Никаких вызовов БД, публикации или изменения пользовательских настроек.

На реальном снимке export → import в новый candidate → reexport: полный инвентарь совпал. Unit test проверил roundtrip, повреждение/лишний файл, отказ перезаписи и invalidation report.

Команды из корня данной рабочей копии (пути SOURCE/PACKAGE/CANDIDATE абсолютные):

```text
python scripts/atlas/material_snapshot.py export SOURCE PACKAGE
python scripts/atlas/material_snapshot.py verify PACKAGE
python scripts/atlas/material_snapshot.py import PACKAGE CANDIDATE
python scripts/atlas/material_snapshot.py import PACKAGE CANDIDATE --write
python scripts/atlas/material_snapshot.py diff SOURCE CANDIDATE
python -m unittest discover -s scripts/atlas/tests -p test_material_snapshot.py
```

Diff выдаёт changed_files и ai_requires_review для всех изменённых разделов. Это консервативный отчёт, НЕ встроенная блокировка reader: до интеграции gate изменённую редакцию нельзя публиковать или показывать с прежним ИИ-слоем как актуальным. Исходные подсказки должны остаться evidence; новый слой проверяется существующим context contract по текущим строкам.

## Что ещё блокирует пересборку

Нужен структурный валидатор с областями ID: первичные объекты, повторные представления, legacy_groups, страницы, таблицы/ячейки, термины и occurrence compatibility. Пробный плоский обход нашёл 3199 разных ID и 43 явные ссылки, но повторы представлений и ссылки на неявные page IDs делают плоский тест непригодным для допуска. Текущий transport dry-run проверяет целостность файлов, а не семантическую корректность изменённого материала. Нужны тесты удаления объекта, разрыва ссылки и изменения текста с обязательной инвалидизацией ИИ. Полный roundtrip через графовую пересборку не доказан.

## Пилот и откат

Предлагаемый пилот: p50 (текст), p51–52 (таблицы геометрических характеристик), p56 (пример/формулы); дополнить p159 для рисунка/скана таблицы. Сначала завершить перечисленные gates, затем внести по одной контролируемой правке, получить diff по полям и links, пересобрать производные search/train и проверить UI на loopback с отдельным профилем. Не менять atlas_id внутри исходных объектов без явной карты миграции; изоляция редакции должна задаваться новым namespace.

Откат локального эксперимента — прекратить использовать candidate и снова импортировать неизменный export в ещё один новый каталог. Этот путь выполнен фактически при reexport и проверке равенства. Production rollback не требовался и не выполнялся: указатель действующей редакции, прогресс и профиль не менялись. Переключение опубликованной редакции и миграция прогресса в объём этого результата не входят.
