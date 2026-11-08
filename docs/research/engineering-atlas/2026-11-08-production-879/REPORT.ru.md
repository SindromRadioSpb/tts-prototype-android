# Atlas 97001 RC3.2 — production 3.11.879

Дата: 2026-11-08. Основание публикации — прямое указание владельца «Выкладывай на прод» после локальной интеграции V2 и дополнения. Оно снимает прежний запрет deploy/main для этого выпуска; научную приёмку всего содержания не подменяет.

**Опубликовано и проверено:** [Инженерный атлас 97001 · RC3.2](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=1), версия **3.11.879**.
Runtime commit: **`15343c98e56aba87e0252975c96b8a0ba07e8d7d`**. Coolify deployment завершён; проверка фактически обслуживаемых байтов и повторный no-cache health прошли.

## Что выпущено

- **806 словарных записей, 303 учебные цели**. Из последних 48 дополнений 45 — новые понятия, три — адресно пересмотренные holds. Оставшиеся 45 holds V2, пять отдельных editorial proposals и четыре дополнительных materials holds не активированы.
- «В контексте (ИИ)»: **21 раздел, 2362 принятые строки, четыре строки без подготовленного разбора**. Сохранены partial coverage, uncertain/reasons, provenance, SHA/revision/identity/order/offset/MWE gates и 263 адресные карты. Нормализация орфографии и tokenizer глобально не ослаблялись.
- Компактные term cards, раскрываемые источники/ограничения и точные ссылки на source blocks. Три редакционные формы имеют оговорки и не получают ложные literal word spans.
- Проверенные ранее purpose-specific identity maps сохраняют старые ordinal/text keys. Все 4785 прежних привязок и 255 старых карточек сверены; переноса ручных правок между разными ключами нет.

При совмещении сохранены актуальные изменения `main` до **`a40502fea62233c6456fb945e0f04a60d565bcb4`** — material reader и выбранная строка playback. Конфликты касались только module query versions; версия shell/module cohort согласована для 879. Чужой untracked каталог основного checkout не затронут.

Дополнительный reader audit нашёл ограничения старого аудитора и два дефекта представления нативных данных. Reference-only layout grids теперь не рисуются пустыми поверх уже показанных точных source rows; native formula из исходного `he` отображается буквально, без изменения исходного JSON и числового учебного допуска. Аудитор понимает semantic cell.parts/figure_images и явные неучебные printed page numbers, сохраняя строгие проверки действительно пустых ссылок/формул. Итог — **21 раздел, 0 findings**, 12 раскрытых nonlearning dispositions. Эти случаи закреплены четырьмя тестами. O-168 исправлен: баннер сообщает о техническом кандидате и ограничениях, не делает ложного заявления, что опубликованный runtime ещё не выпущен.

## Привязки и сохранность

Native revision: `841fd6424e8428ba5ebd1f489f514c5dff058d841e415c5a13a42fe7504b47cc`.
Native manifest SHA: `17ad83041d068b2a0a53e669d47c69ea2a631bc25530ac847106d70e78994b3d`.
Context pin: `eca82a3b2697d22a5be49fbb91f170b9dd7b3e1d60e2b43c12048828ee8fee19`.
AI dependencies SHA: `afbcc17988b98a553f052c5859e7bb893c71c0a1829f592c2cd23addcf3d2722`.
Overlay SHA: `e746d12b32d13d69177cce6dc2a25002d595b4026f1fd4e7cfaf8889e197b765`.
PDF SHA прежний: `eb4e4ee7f154bce30dbd61b094d6a42a9925af909bd7ecb2f80bce4639af0e0c`.

Данные устанавливались адресно в два этапа: новые immutable namespaces проверены и размещены до переключения кода; export sources переключены после завершения deploy и проверки версии. До production установка проверена на изолированной копии с неизменным DB sentinel. Release tar SHA: `2b350e1b92452b2cef0315373d2527ec528d888c499a22d8ac40de7a5d64041c`.

Сохранены и после выпуска повторно проверены все файлы четырёх native namespaces: первоначальный `50253381…`, прежняя RC3.2 `cea369d4…`, V2 `420c3427…`, новый `841fd642…`. Прежние context directories/pins остаются в образе. Старый export source каталог сохранён как `atlas-sources/a97001rc32-backup-3.11.879`; SHA его manifest **`f7adba98ac86da16782422c654008e0575b5d113e4b1b12f294b16bf12a961b5`** совпадает с исходным. [Проверка сохранности](native-retention.json).

Профиль владельца не открывался. Agent не менял production learner data, не переносил и не сбрасывал прогресс/оценки/избранное/ручные правки. Изменений DB migrations между базовым main и release commit нет. Все browser grades/manual edits — только в новых синтетических локальных профилях; сетевые cloud learner writes заблокированы тестом. Тесты сохранности данных владельца не выдаются за owner-live проверку.

Точка runtime rollback — прежняя 3.11.878 (`a40502fe…`), её образ сохранён вместе с новым 879. При откате runtime использовать соответствующий сохранённый source descriptor; старые immutable namespaces не перезаписывать и не удалять.

## Проверки

| Проверка | Результат |
|---|---|
| Полный локальный набор на совмещённом коде | **3574 total: 3559 passed, 15 skipped, 0 failed** |
| Python atlas suite, корректный cwd и локальный KaTeX | **215 tests, 12 skipped, 0 failures/errors** |
| i18n / API smoke | **233 passed / OK** |
| Actual native/source/term validator | **303 целей, 6255 records, 4785 identities, 240 negative guards, 69 held source cases — passed** |
| GitHub CI release commit | **success**, все три jobs |
| Production served assets | **15/15 SHA совпали**, включая shell и новые модули |
| Production pinned native/context loader | **21/21**, dictionary **806**, targets **303** |
| Production term browser | **passed**, 7 новых headers, p2/p3, desktop, 380px/RTL, Learn→grade→global review→source, search torsion, три editorial notices |
| Production context browser | **passed**, 32 HE/niqqud cards, expansions, uncertainty, source hold, manual после reload, исходный a97001, corrupt manifest fail-closed |
| Production actual SW/offline | **passed**, offline reopen, corrupt cached map rejected, recovery без learner reset |
| Production native presentation | **passed**, source rows/table, literal formula, 380px/RTL без overflow |
| Production full export → verify → restore → repack → verify | **passed**, 1230 файлов, AI included |

[GitHub CI](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/42427893468), [проверка обслуживаемых байтов](served.json), [термины](browser-terms.json), [контекст](browser-context.json), [offline](browser-offline.json), [presentation](browser-presentation.json).

Автоматизацию production скорректировали после диагностических таймаутов: широкий CDP interception отключал обычный HTTP cache и задерживал холодную загрузку 3.5 MB morphology gzip. Для production статические файлы передаются обычным браузерным путём; fetch/XHR/beacon guard блокирует network mutations. Словарь прогревается реальным запросом до проверки тапов. SW install в cold profile получает до 180 секунд. SHA/revision/identity/offset assertions не снимались. Финальные проверки выше прошли; первичные таймауты не засчитаны как успешные. V2→addendum upgrade был проверен локально; production term runner проверяет опубликованную редакцию без подмены AtlasEdition.

Снимки: [термин RTL 380px](term-rtl-380.png), [desktop](term-desktop.png), [редакционное раскрытие p203](editorial-metal-fiber.png), [исправленный כוח](compact-force-380.png), [буквальная формула RTL](source-formula-rtl-380.png).

## Экспорт и эксплуатация

Production backend собрал полный material тем же штатным сервисом экспорта; owner/browser download ранее проверен локально, а production owner-сессия не использовалась. Полный ZIP: **219226934 байт**, SHA **`9a84f7ae76daa3fa15995001ca868f7e54bb9bffc0ba9b926bcb405a4e33e9d1`**. Включены AI и sources, learner data исключены. Скачанный с production ZIP проверен, восстановлен в новый каталог, перепакован и снова проверен. ZIP hash отличается от локального архива из-за упаковки/времени файлов; native/context pins и SHA самих файлов совпадают.

Долговременные материалы: `E:\projects\tts-prototype-android\Архив\atlas97001-production-879-20261108`. Там production ZIP, release data tar, installer, raw verification logs, отчёт, bundle и inventory с SHA. Restore не публикует материал и не подключает его к профилю.

До deploy: около **10.8 GiB available**, активной сборки нет, build cache пуст; перед push после staging около **9.9 GiB**, выше cold build gate 6 GiB. После сборки выполнена разрешённая bounded cleanup: unused build cache, затем ровно один более старый unreferenced образ 3.11.877. Новый 879 и последний рабочий 878 сохранены; контейнеры/volumes/backups/data не удалялись. После очистки и экспортной проверки повторный health: **ok, db ready, migrations ready, disk_warn=false**. Удаления volumes, containers, backups, системного prune не было.

Ограничения содержания и learning eligibility остаются действующими. Полная научная приёмка, физический iPhone/assistive technology и сплошной новый page-by-page аудит не заявляются. Четыре неподготовленные AI-строки, исходные буквальные holds и generic-label случаи не заполнены догадками. Озвучивание не входило в выпуск.

Для пользователя: обновить приложение до **3.11.879** обычной кнопкой «Обновить» и открыть отдельный корпус RC3.2. Очистка данных приложения не требуется.
