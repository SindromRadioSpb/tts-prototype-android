# Полный экспорт Atlas — production 3.11.874

Runtime: `8d696e1799db1b580e9fca72c7ad9df6e9d9cee4`. Проверяется 2026-11-07 на https://linguistpro.kolosei.com. Итоговая приёмка завершена: [acceptance.json](acceptance.json).

## Что выпущено

Общий owner-only экспорт для pinned Atlas 97001, legacy Atlas 97002 и стандартного atlas-reader корпуса. В интерфейсе Зала доступна ссылка «Скачать полную редакцию (ZIP)». API: `GET /api/atlas/:id/material-export` и `GET /api/atlas/:id/material-export.zip`. Другие роли не получают архив; отсутствие PDF/source package или нарушение source binding блокирует полный экспорт. Одновременно собирается один архив.

ZIP включает полный активный runtime, отдельный context-пакет 97001, исходный PDF, полные поставщицкие/редакционные архивы, инструменты сборки и коррекции, provenance, размеры и SHA-256 каждого файла. Копирование выполняется из замороженного снимка; изменение legacy-источника во время сборки приводит к отказу. Неизвестные поля JSON сохраняются побайтно. Данные профиля и прогресса в экспорт не входят.

В каждом ZIP есть русская инструкция и автономный `tools/material_package.py` (Python 3.12+, стандартная библиотека, без pip и сети). `verify` проверяет комплектность и хеши; `restore` по умолчанию выполняет dry-run, `--write` допускает только новый каталог; `repack` проверяет восстановленный материал и создаёт новый ZIP. Это восстановление файлов, без публикации новой редакции или импорта в профиль.

## Матрица проверки

| Требование | Доказательство | Результат |
|---|---|---|
| Полные источники обоих атласов | [source-packages.json](source-packages.json), [source-archives.json](source-archives.json), [source-coverage.json](source-coverage.json) | Проверены PDF SHA, 21/42 source bindings, чтение всех вложенных TAR и CRC supplier ZIP. Все 869 файлов материала прежнего снимка 97001 сохранены по SHA; четыре старых файла диагностики захвата заменены актуальным манифестом. |
| Совместимость общего механизма | `tests/atlasMaterialExport.test.js` | 7 проверок: pinned/legacy/future-atlas, неизвестные поля, auth, missing source/image, tampering, concurrent mutation, source provenance. |
| Unit / API / версии | [ci.json](ci.json) | Полный локальный набор: 3486 pass, 15 skip, 0 fail; API smoke и 233 i18n/version checks. CI runtime-коммита прошёл все jobs. |
| Served версия и assets | [served.json](served.json) | 3.11.874; 214 ресурсов совпали с integrity и локальными байтами; DB/migrations ready. |
| SW / offline | [service-worker.json](service-worker.json) | Управляющий SW874, 212 cache entries без missing/mismatch; Studio и Зал открылись офлайн. |
| Реальный UI/API download двух ZIP | [browser.json](browser.json), [проверка повторных ZIP](persistent-archive-verification.json) | Оба скачивания прошли в новом постоянном Chromium profile; 4 responsive-проверки, пустые учебные таблицы до/после совпали, ошибок страницы нет, logout 200. Все байты повторных ZIP проверены; манифесты совпали с полностью восстановленными ZIP. |
| Полное восстановление и повторный ZIP | [roundtrip.json](roundtrip.json) | Реальные production ZIP восстановлены и повторно упакованы только вложенным инструментом через Python `-I -B`: 872 / 2517 файлов, точные манифесты и SHA-256. |
| AI при изменении текста/PDF/image | 6 Python tests; [ai-invalidation.json](ai-invalidation.json) | На обоих реальных восстановленных атласах проверены все три типа изменения. Обновление обычного файлового хеша не переносит старую AI dependency binding. Изменённый материал требует перепроверки AI. |
| Сохранность редакций и данных | [preservation.json](preservation.json) | После двух полных скачиваний: 3527 файлов atlas, 845 edition, atlas-review и все 15 пользовательских таблиц совпали с исходным read-only снимком. |
| Capacity / retention | [capacity.json](capacity.json), [final-health.json](final-health.json) | Свободно 8292888576 байт (7.72 GiB); временные экспорты удалены штатно, build cache 0. Три health-проверки: DB/migrations ready, disk_warn false. Удалён только проверенный неиспользуемый образ 867; current, pre-task runtime, rollback, все 9 containers и 4 volumes сохранены. Данные и backups не удалялись. |

## Границы доказательства

Проверки браузера автоматизированы на production в отдельном Chromium-профиле, на ширинах 380 и 1280. Личный браузерный профиль владельца не открывался. Проверяется экспорт существующего материала; новая содержательная редакция, новая научная/редакторская приёмка и платная регенерация AI не выполнялись.

Ранние попытки и их исправления сохранены в [журнале выпуска 872–874](../release-872/README.md). Для responsive-проверки теперь ожидаются загруженное оглавление и стабильная геометрия: export-link появляется раньше начального remount проекции БД. Проверка горизонтального переполнения не отключалась. ZIP передаётся нативно, без перехвата больших тел через CDP.

Ранний прогон в ephemeral Chromium context успешно скачал оба ZIP, но повторное открытие OPFS после второго скачивания завершилось ошибкой. Он не засчитан как браузерная приёмка. Новый постоянный изолированный профиль прошёл весь сценарий без изменения runtime или VFS; причины ephemeral-сбоя не установлены, наблюдение O-165 оставлено открытым. Личный профиль владельца не использовался.

Приватные ZIP, контрольные снимки таблиц и ops-инвентари: `Архив/atlas-export-release-20261107/` в корне рабочей папки. Они не публикуются в git. Здесь находятся только санитарные отчёты и снимки блока экспорта.

## Проверенные переносимые ZIP

Архивы находятся в `E:/projects/tts-prototype-android/Архив/atlas-export-release-20261107/production-browser-874-bounded/`:

| Корпус | Файл | Байты | SHA-256 |
|---|---|---:|---|
| 97001 | `a97001-full-material.zip` | 265298342 | `1ea084b6e2fc1eb1a0c39b22236a9c188d7e0bbe46440cdf79f20b3a7e4580d6` |
| 97002 | `a97002-full-material.zip` | 521065221 | `209d6fe15eb293e0b584b9362e69494ca785639de133f3731703343cb74aa2fe` |

Рядом сохранены `.sha256` и `.acceptance.json`. Именно эти ZIP прошли полное восстановление в новые каталоги и повторную упаковку. Повторный браузерный прогон проверяет сохранность отдельного постоянного профиля; совпадение его манифестов и проверка всех байтов связывают обе проверки с одним материалом.

После извлечения `tools/material_package.py` из архива можно проверить ZIP командой `python -I -B material_package.py verify ARCHIVE.zip`, затем восстановить: `python -I -B material_package.py restore ARCHIVE.zip NEW_DIRECTORY --write`. Без `--write` восстановление выполняет только проверку. Повторная упаковка: `python -I -B material_package.py repack NEW_DIRECTORY NEW_ARCHIVE.zip`. Новые пути должны отсутствовать. Ни сеть, ни npm/pip для этих операций не нужны.
