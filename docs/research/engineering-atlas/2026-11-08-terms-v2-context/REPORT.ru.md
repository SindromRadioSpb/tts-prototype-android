# Термины V2 + контекст RC3.2: локальный кандидат приёмки

Дата: 2026-11-08. Рабочая база — готовая context integration `b1c39a41`; исходный main/пакетный reference — `1ae74d9e`.
Ветка: `feat/atlas-rc32-context-technical`. Реализация: **`62c62b9f9c57892b0a54e77dc4f4c4f7027464fc`**.
Worktree: `E:\projects\tts-prototype-android\.worktrees\atlas-rc32-context`.

**Готово к технической приёмке владельцем. Production, main и профиль владельца не изменялись этой работой; push/deploy/merge не выполнялись.** Параллельные dirty-файлы основного checkout сохранены. Исходная редакция `a97001`, её source/context pins и первоначальные learner keys не менялись. Прежняя RC3.2 тоже сохранена как отдельный immutable namespace и явный rollback release.

## Результат

- **222 новых проверенных term/sid/sense/source пары; 255 целей с прежними 33.** 48 оставшихся кандидатов удержаны. Из 248 полностью оформленных новых dictionary entries 26 остаются read-only; 22 неполные записи не превращены в native учебные цели.
- Все **513 прежних term IDs**, их section canonicals и train entries сохранены. Whole-row lexical остаётся **78**; source_find/lexical flags и числовые поля не расширялись.
- Карточка 97001 приведена к схеме 97002: компактные форма, транслитерация, русский смысл, пояснение именно термина и допустимое действие «Учить этот термин». Общие примечания страницы, provenance и source holds находятся в закрытом по умолчанию блоке **«Источник и ограничения»**, откуда можно перейти к точной строке. Причины uncertain конкретного слова/MWE сохранены видимыми.
- «Учить этот термин» в RC3.2 предлагается только для проверенного места. Например, исходные слова на страницах оглавления p2/p3 не получают новый учебный допуск лишь из-за компактного отображения. Общие word-status/SRS действия по неподтверждённой строке остаются выключенными; термин изучается отдельно.
- Две опечатки и раскрытая аббревиатура сохраняют loose term-to-source связь без word offsets в HE **и niqqud**. Поиск теперь индексирует четыре ранее пропущенных термина table.parts с адресом самой части, а не layout cell.
- Исправлен restore due-place для явно разрешённых терминов вступительного раздела. Обычные заголовки/оглавление не активируются. Проверены сохранённая оценка с источником и fallback без source fields для всех 222 новых целей.

## Вход, сверка и построение

Прочитаны пользовательская CLI-инструкция, README и CODEX-INTEGRATION-HANDOFF. Архив V2 — **33 547 328 байт**, SHA-256:
`3de437c6424889f52389217bf961c6104ad8714fe6305d9d0b7579cee3568069` — совпал до распаковки.
Проверены пути/дубликаты/symlinks/суммарный размер ZIP и 270 файлов delivery inventory. Секции, index и train исходного package baseline побайтно совпали с уже проверенным RC3.2 source-export текущей ветки. Предыдущая context integration не заменялась старым runtime-reference из пакета.

`build-terms-v2-edition.py` проверяет ZIP SHA и равенство критических распакованных входов байтам ZIP. Он заново применяет ровно ledger-approved операции, проверяет каждое before и canonical hash, сохраняет held, сравнивает итог с reviewed runtime-preview, затем вычисляет новый revision. Это не копирование preview с его прежним revision.

Особенности фактического пакета:

- Для 75 ранних допусков `canonical_hash_algorithm` ошибочно называет default separators, хотя digest вычислен compact JSON. Каждый digest проверен по полным canonical fields и отдельной сохранённой linguistic-review записи. Исходный ZIP не исправлялся; точная техническая коррекция metadata записана в overlay/build report. SHA gate не отключался.
- `after` snapshots source-link diff содержат разделяемые policy-объекты, дополненные позднейшими терминами того же source row. Builder не накладывает их слепо: восстанавливает отдельные разрешённые операции, проверяет последовательные before, затем точное равенство итогов reviewed preview.
- S: исправлены три авторских поля чтения по переданному diff. K: исправлены две транслитерации. Дипломатические HE/source_he, source_fields и числа сохранены. Только S меняет контекстный text key; это отражено явно, а не скрыто заменой source_revision.

Штатные `build-structure-derivatives`, `build-search-index`, `build-train-bank` и `stage-edition` построили индексы, новый manifest и READY. Сборка/привязка проверена с текущими модулями этой ветки.

Новая **native revision**:
`420c34275a26fe37cae12a41e77a77dde173de207164f6b5421c5a5dcf1c92bc`.

Native manifest SHA:
`20f06244b634c8296456693ec2a9620e5b19eb67f7df32a11efe3340f925018f`.

Новый **context pin**:
`886489667313aaaf18d76676225af30395d1f5daebf16894b63ad6d921eb74d6`.

Source-overlay SHA:
`f6749c7bea7b08d5539baef08e2a887da19824d15ec59a11d02fe901c2a5d1b9`.

Dependency SHA:
`c994972077618ccc9c3d63277ee63ff1731a3180513fee8af702f8d2bd33a4f0`.

Source PDF SHA не изменился: `eb4e4ee7f154bce30dbd61b094d6a42a9925af909bd7ecb2f80bce4639af0e0c`.

`rebind-terms-v2-context.cjs` сначала принимает старый пакет настоящим loader по старому source-export. Затем доказывает сохранение ID/order/HE/RU/count/offsets/MWE и допустимость source_context delta, переносит только подтверждённую поправку S, обновляет guards и native-record hashes. Для S после поправки проходит прежний обычный alignment gate: карта больше не нужна. Осталось **263 адресные карты**. Revisions всех 21 секций вычислены после финальной corpus projection. Повторная сборка контекста дала `unchanged=true`, совпали весь inventory и каждый байт.

Ни глобальная орфография, ни Hebrew tokenizer, ни provenance/hash/identity gates не ослаблены. Старый и новый context pin не взаимозаменяемы. Старые namespaces не перезаписывались.

## Проверки

| Проверка | Результат |
|---|---|
| Полный проектный набор, изолированное хранилище и локальный KaTeX | **3550 passed, 15 skipped, 0 failed**, всего 3565 |
| i18n | **233 passed, 0 failed** |
| Финальные term targets | **33 + 222 = 255**, все 48 held исключены |
| Global due и неверный scope | **222/222** каждый; restored due без source fields тоже проходит |
| Поиск и видимые semantic source refs | **222/222** каждый |
| Старые term states | **33/33** due cases, исходный state не мутирует |
| Исходные записи / защищённые поля | **6255 / 37530**, сохранены |
| Старый a97001 prepared context | **21/21** секций с прежними pins |
| Новый context | **21/21**, coverage и partial сохранены |
| Карты и отрицательные защиты | **263** карт, **1841** guard mutations, **3797** HE lookups; hash/revision/overlay/foreign row/MWE/uncertain/manual regressions проходят |
| Полный ZIP, реальный browser download | **1227 файлов**, 380px/1280px, без изменений synthetic learner tables |
| Скачанный ZIP → verify → restore → repack → verify | **passed** |
| Реальный SW / offline / corrupt cached map | **passed**, повреждённая карта отклоняется без fallback |

3550/15 — полный набор с тем же recursive discovery, concurrency=4 и sanitized smoke environment, что `npm test`. В общей установленной копии отсутствовал KaTeX; использован существующий локальный `rc32-deps/node_modules`, без изменения shared install/lockfile. [Воспроизводимый runner](run-project-tests.cjs), [test-results.json](test-results.json); полные TAP logs сохранены в приватном delivery/evidence. 15 skipped — существующие fixtures, требующие дополнительных volume-only данных; это не засчитанные проверки.

Отдельно были принудительно подключены данные исторической `50253381`: **13/14**. Один старый тест требует точного равенства исторического train-bank результату современного builder, который добавляет scoped metadata. Этот же тест **падает на базовом коде main**; задействованные builder/words/test файлы main не изменены параллельной работой. Старый банк не переписывался ради теста. Runtime/контекстная совместимость этой редакции и её неизменные байты проверены отдельно. Точная граница записана в O-170.

Браузер: реальный локальный server.js и новые persistent Chromium profiles. Проверены 7 новых term headers (p1, table part p11, S/K p116, p203, s17, s19), оба предоставленных проблемных примера p2/p3 на 380px, desktop и Hebrew RTL. Сведения об источнике закрыты по умолчанию и раскрываются; переход возвращает фокус на точную строку. Просмотр не пишет SRS. Действие карточки → значение → учебная оценка → глобальное повторение → точный источник пройдено для вступительного термина и table part. Глобальная очередь проверена с синтетическим сдвигом часов, не реальным многодневным обучением.

Исходные synthetic SQL states/review_log и canonical personal-term storage сохранены при оценках RC3.2. Отдельный context browser проверил 32 HE/niqqud карточки, раскрытия/quotes, source holds, uncertain MWE, ручную правку после reload, обе редакции и corrupt manifest без потери manual. Старые data/keys не мигрировались и не очищались.

Снимки: [исправленный «כוח»](compact-force-380.png), [исправленное «התמצקות»](compact-solidification-380.png), [новый термин desktop](term-desktop.png), [RTL 380px](term-rtl-380.png).

## Материалы и локальная приёмка

Preview обновлён и запущен:
`http://127.0.0.1:3217/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=1`.
Для нового просмотра перезагрузить вкладку обычным способом; очищать данные приложения не требуется.
Preview controller PID **53776**, server PID **72112**. Останавливать только после сверки, что это те же процессы.

Долговременные материалы:
`E:\projects\tts-prototype-android\Архив\atlas97001-terms-v2-20261107\delivery`.

- `a97001rc32-terms-v2-context-full-material.zip` — **218505631 байт**, SHA `80b2e0a6e624d51e33081a1b4cd88fef87a447f0f5d6a975988718bd96593311`. Это реально скачанный браузером полный материал; learner data исключены.
- `a97001rc32-terms-v2-context-only.zip`, `terms-overlay-manifest.json`, `FILES.sha256.json`, git bundle/patch и evidence. Исходный ZIP V2 сохранён рядом как `input-reviewed-v2.zip`.
- Прежний source/пакет RC3.2 остаётся в архиве предыдущей задачи и в `.tmp/runtime-data` / `.tmp/rc32-source`; первоначальный a97001 не затронут.

Локальные рабочие данные: `data/atlas/a97001rc32-terms-v2-ready`, `.tmp/terms-v2-runtime-ready`, `.tmp/terms-v2-source-ready`. Их единственная копия не оставлена во временной папке: полный материал выше сохраняет edition, sources и context.

Основные команды из корня worktree:

```powershell
node scripts/atlas/verify-terms-v2.cjs .tmp/rc32-source .tmp/terms-v2-source-ready ../../Архив/atlas97001-terms-v2-20261107 .tmp/new-final-proof.json
node scripts/atlas/terms-v2-browser.cjs .tmp/terms-v2-runtime-ready .tmp/terms-v2-proof-ready.json .tmp/new-terms-browser
node scripts/atlas/rc32-context-browser.cjs .tmp/terms-v2-runtime-ready .tmp/terms-v2-source-ready .tmp/new-context-browser
node scripts/atlas/rc32-context-offline.cjs .tmp/terms-v2-runtime-ready .tmp/new-offline
node docs/research/engineering-atlas/2026-11-08-terms-v2-context/run-project-tests.cjs ../atlas97001-rc32/.tmp/rc32-deps/node_modules
node scripts/atlas/rc32-context-preview.cjs .tmp/terms-v2-runtime-ready .tmp/terms-v2-source-ready 3217
```

Для восстановления материала в **отсутствующий** каталог использовать `scripts/atlas/material_package.py restore <ZIP> <new-dir> --write`, затем verify/repack. Оно не публикует материал и не подключает его к профилю. Native READY создаёт штатный `stage-edition --source <new-dir>/edition --destination <new-atlas-editions-root>`; существующие namespaces не заменять.

## Оставшаяся приёмка и ограничения

Владельцу проверить выбранные значения/пояснения, компактность карточек и source restrictions на собственном устройстве. Это техническая интеграция проверенных пар, а не сплошная научная приёмка книги или финальное принятие AI-контента. Физический iPhone, assistive technology и полный page-by-page визуальный аудит 203 страниц не заявляются.

48 кандидатов остаются закрытыми: 20 исходных English/symbol labels, 12 имён с неподтверждённой Hebrew микроподписью, 15 нерешённых вопросов и 1 дубль tension. Generic-label механизм не включён. Две опечатки/раскрытие аббревиатуры явно авторские, source quote не изменён. p203 разрешён только как проверенный PDF text-layer context; визуальный поиск закрытой строки по-прежнему запрещён. Неизвестные числовые поля не заполнены.

S меняет один context key по проверенному reading diff. Старые записи и исходные keys не удалены и не переименованы; автоматического переноса ручных правок между разными text keys нет. Обычная ручная правка неизменённого source occurrence проверена после reload и нового context binding.

Публикация, переключение production pin, перенос данных в production и озвучивание **не выполнялись**. Выпуск возможен только после вашей приёмки и отдельного разрешения.
