# Atlas 97001 RC3.2 — дополнение после V2, локальная приёмка

Дата: 2026-11-08. База: `bdf23d7fabdb540777c12afc8dc182e6e8e8c537`.
Ветка: `feat/atlas-rc32-context-technical`. Реализация: `3003d49f5daa800fc21bceceaf785dca49a64c8e`.
Worktree: `E:\projects\tts-prototype-android\.worktrees\atlas-rc32-context`.

Production, main и профиль владельца этой работой не изменялись. Push, merge, deploy и озвучивание не выполнялись. Все оценки, закладки и ручные правки проверок — синтетические, в новых изолированных browser profiles. Контент остаётся техническим кандидатом для приёмки владельцем, а не окончательно принятым научным изданием.

## Вход и адресное применение

Архив `atlas97001-terms-addendum-after-v2-20261107.zip`: **298231 байт**, SHA-256 **`9e1f7345436ec4b99ebd26901ba5f007af335dd6b44276817e3e17195fbf6dcb`**, совпал до распаковки. Проверены пути, дубликаты, symlinks и суммарный размер. Архив распакован отдельно в `Архив/atlas97001-addendum-20261108/input`; все **28** файлов внутреннего inventory совпали по размеру и SHA. Прочитаны START-HERE, ADDENDUM-CONTRACT, ROUND5-REPORT и связанные отчёты/свидетельства. Исторические абсолютные пути из отчётов не выполнялись.

Фактический HEAD и чистый worktree сверены до первой правки. V2 revision `420c3427…`, native manifest `20f06244…`, context pin `88648966…` и все байты исходного native manifest проверены. Не выполнялся перенос старого runtime-reference поверх текущего кода. Непосредственная база — уже интегрированный V2, не старый supplier preview.

`build-terms-addendum.py` применяет только **48** записей `reviewed-scoped-addendum.json`: проверяет шесть canonical fields и их SHA, отдельное independent-review свидетельство, term/sense/section/source ID, точную цитату и её SHA. Из них **45 новых понятий**, ещё **3** — адресно пересмотренные held: molar-mass, extrusion, die-forging. Прежние 222 допущенные пары V2 не изменены.

Новый builder сохраняет исходный текст; он меняет только словарь и адресные term-context связи. Сопоставлены **6255** исходных records: `he/source_he/source_fields/he_niqqud/translit/translit_ru/ru/formula/latex/training_eligible`, lexical/source_find policies. Все они совпадают с интегрированным V2. Никакие новые числа, единицы, формулы или целые строки не получили учебного допуска.

Три авторские редакционные формы основного набора — **nonmetals, silicon-manganese-steel, metal-fiber**. Их `required_notice_ru` включена в учебную карточку; `source_word_span_verified=false` сохраняет связь с целым блоком без HE/niqqud word spans. Источник не заменяется каноном. Пять записей отдельного `editorial-scoped-proposals.json` не включены. Это не тот же набор, что прежние 48 holds: из них разрешены только три явно проверенные записи, оставшиеся **45** остаются закрытыми. Дополнительные четыре materials holds также не активированы. Generic-label для English/symbol targets не включён.

## Идентичности и пользовательские данные

На текущем runtime простое добавление term-context узлов сдвинуло бы `order_index` у **138** прежних блоков; подготовительный пакет сообщал 125 на закреплённом прежнем runtime. Число 125 не выдано за результат актуальной сборки. Полный список актуальных различий — [final-proof.json](final-proof.json).

`freeze-overlay-identities.cjs` строит проверяемые purpose-specific карты для lexical/source_find/term_context/inspection непосредственно из V2. Они входят в новую native revision и SHA manifest. `AtlasWords.sectionContext` сохраняет прежние ordinal/text key только при точном равенстве he/he_niqqud/ru и правильной corpus/section identity; новые места добавляются после существующих. При изменении текста старый ключ не используется. Дубликат caption ID сохраняет прежнюю Map-позицию и последнюю семантическую репрезентацию без повторного расходования индекса. Первоначальные данные редакций не меняются.

В итоговой проекции проверены **4785** прежних привязок четырёх режимов. Изменённых старых text keys **0**; изменённых AI payload keys **0**. Старые word offsets проверены через actual occurrence/verifyOccurrence. Все **255** старых карточек совпали полностью; их synthetic due states остались неизменны. Нет копирования оценок или ручных правок между различными ключами.

Случаев нового изменившегося текстового ключа в этом дополнении нет. Известное прежнее изменение ключа S при переходе исходной RC3.2 → V2 остаётся отдельной границей из отчёта V2; автоматического переноса старой ручной правки S в новый ключ здесь не добавлено.

## Итоговые привязки и откат

- Native revision: `841fd6424e8428ba5ebd1f489f514c5dff058d841e415c5a13a42fe7504b47cc`.
- Native manifest SHA: `17ad83041d068b2a0a53e669d47c69ea2a631bc25530ac847106d70e78994b3d`.
- Context pin: `eca82a3b2697d22a5be49fbb91f170b9dd7b3e1d60e2b43c12048828ee8fee19`.
- Overlay SHA: `e746d12b32d13d69177cce6dc2a25002d595b4026f1fd4e7cfaf8889e197b765`.
- AI dependencies SHA: `afbcc17988b98a553f052c5859e7bb893c71c0a1829f592c2cd23addcf3d2722`.
- PDF SHA прежний: `eb4e4ee7f154bce30dbd61b094d6a42a9925af909bd7ecb2f80bce4639af0e0c`.

`rebind-terms-addendum-context.cjs` сначала проверяет настоящий V2 package его прежним loader/pin, затем сверяет source/порядок/слова/meaning/MWE и только разрешённую metadata delta. Обновлены projected source_revision всех 21 секций, native-record guards, SHA, manifest и READY. Сохранены **263** адресные карты. Новых alignment permissions нет. Повторная привязка дала `unchanged=true` с точным inventory и байтами. Частичность покрытия, uncertain/reasons и provenance не сняты.

Сохранены и повторно приняты текущим loader по **21/21** секций: V2 `420c3427… / 88648966…` и предшествующая RC3.2 `cea369d4… / 2f782372…`. Первоначальный a97001 сохраняет revision `50253381…` и context `ca40870e…`. Они остаются отдельными immutable namespaces; взаимозаменяемого fallback нет. Предыдущий полный V2 ZIP и коммит `bdf23d7f` сохранены как точка отката.

## Проверки

| Проверка | Итог |
|---|---|
| Полный проектный набор | **3570 total: 3555 passed, 15 skipped, 0 failed** |
| i18n | **233 passed, 0 failed** |
| Фактические учебные цели | **255 + 48 = 303** |
| Новый section/global due / source-free restored grades | **48/48** |
| Старые cards/global due/state | **255/255**, без изменений |
| Отрицательные term guards / оставшиеся held source cases | **240 / 69** |
| Поиск с точным semantic source ref | **48/48** |
| Source records / прежние source identities | **6255 / 4785** |
| Whole-row lexical / source_find projections | **78 / 501**, без расширения |
| RC3.2 context/browser/manual/both editions | **passed**, 32 HE/niqqud карточки |
| SW offline, повреждённая адресная карта | **passed**, fail closed без потери learner state |
| Реальный UI full export, 380/1280px | **passed**, synthetic learner tables unchanged |
| Скачанный ZIP → verify → restore → repack → verify | **passed**, 1230 файлов |

Полный набор запущен тем же recursive discovery/concurrency=4/sanitized smoke environment, что основной runner, с существующим локальным KaTeX через NODE_PATH. Shared install и lockfiles не менялись. Исправлен прежний вспомогательный runner: относительные имена тестов устраняют Windows ENAMETOOLONG после добавления теста. 15 skipped — дополнительные volume-only fixtures, не засчитанные как passed. Ранее зарегистрированное историческое несовпадение O-170 не объявляется исправленным и не маскируется переписыванием frozen train-bank.

Отдельный browser runner проверил 7 новых compact term headers, оба прежних проблемных примера p2/p3, desktop и 380px/RTL; реальный Learn → grade → global review → source. V2 и новая редакция открывались в одном origin и одном новом persistent profile: выбор V2 сначала выполнял прежний code-pinned AtlasEdition из `bdf23d7f`, затем обычный reload загружал текущий pin. SQL word_status/review_log/bookmarks/text_progress, личные термины, stage и ручная AI-правка пережили обновление без изменений. Fixture избранного создан каноническими createText/addBookmark/setProgress и сверяется с точными text key/order/source quote актуального блока; это проверка синтетического сохранённого источника, не доступ к реальному избранному владельца.

Все три редакционные оговорки проверены видимыми в настоящих section review и global review; оба тренажёра возвращают точный source block. Для изоляции каждой карточки использованы только disposable scheduling fixtures. HE/niqqud term highlights для этих форм отсутствуют. Снимки: [редакционная форма p203](metal-fiber-global.png), [неметаллы](nonmetals-global.png), [RTL 380px](term-rtl-380.png), [desktop](term-desktop.png). Поиск новых терминов прошёл Node-проверку 48/48; browser search открыл конкретный источник torsion.

Полные логи — в приватном delivery/evidence; машинные отчёты — рядом с этим файлом. Проверки выполнялись текущими app functions и локальным server.js, без доступа к профилю владельца. Это не физический iPhone/assistive-technology тест и не сплошная научная или постраничная визуальная приёмка.

## Материалы и воспроизведение

Локальный preview: `http://127.0.0.1:3217/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=1`. Перезагрузить вкладку; очищать приложение не требуется. Перед остановкой preview сверять сохранённый controller PID и фактическую командную строку.

Delivery: `E:\projects\tts-prototype-android\Архив\atlas97001-addendum-20261108\delivery`.
Полный ZIP `a97001rc32-addendum-context-full-material.zip`: **219226934 байт**, SHA **`b7d368bf251f4f85a392aec1d4975d3d1dae7d699e0975f267911e6c2c2e03c8`**. Это реальный browser download; learner data в материал не входят. В delivery также overlay/build reports, evidence, bundle/patch и FILES.sha256.json. Входной ZIP сохранён рядом в архиве как input-addendum.zip.

Рабочие производные: `data/atlas/a97001rc32-addendum-ready`, `.tmp/addendum-runtime-acceptance`, `.tmp/addendum-source`. Их единственная копия не оставлена в .tmp: полный материал и bundle сохранены в архиве.

Основные повторяемые операции из корня worktree:

```powershell
node scripts/atlas/verify-terms-addendum.cjs .tmp/terms-v2-source-ready .tmp/addendum-source ../../Архив/atlas97001-addendum-20261108/input ../../Архив/atlas97001-terms-v2-20261107 .tmp/addendum-proof-new.json
node scripts/atlas/terms-addendum-browser.cjs .tmp/addendum-runtime-acceptance .tmp/addendum-proof-new.json .tmp/addendum-terms-browser-new
node scripts/atlas/rc32-context-browser.cjs .tmp/addendum-runtime-acceptance .tmp/addendum-source .tmp/addendum-context-browser-new
node scripts/atlas/rc32-context-offline.cjs .tmp/addendum-runtime-acceptance .tmp/addendum-offline-new
node scripts/atlas/material-export-browser-smoke.cjs --data .tmp/addendum-runtime-acceptance --out .tmp/addendum-export-browser-new --corpus a97001rc32
node docs/research/engineering-atlas/2026-11-08-terms-v2-context/run-project-tests.cjs ../atlas97001-rc32/.tmp/rc32-deps/node_modules
node scripts/atlas/rc32-context-preview.cjs .tmp/addendum-runtime-acceptance .tmp/addendum-source 3217
```

Restore выполняется штатным `material_package.py restore <ZIP> <новый отсутствующий каталог> --write`, затем verify/repack. Это не публикация и не подключение материала к пользовательскому профилю. Старые namespaces не перезаписывать.

Приёмка владельцем: проверить смысл новых терминов, три редакционные оговорки, переходы к источнику и удобство на своём устройстве. Любая публикация/смена production pin требует отдельного разрешения после этой приёмки.
