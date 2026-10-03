# Подготовка сохранения и адресные обновления вкладок

Дата: 2026-10-04. Запрос владельца: последовательно выделить подготовку/фиксацию сохранения, затем обновлять между вкладками только затронутые данные. Standing authorization: публиковать проверенные изменения и проверять production. База: `origin/main` 5093d37c / 3.11.725, worktree `.tmp/material-opening-lifecycle`, ветка `refactor/material-save-invalidation`. Дополнительный a30bf458 содержит отчёт предыдущего релиза. Чужой основной checkout сохранён.

**Быстродействие актуализировано после поставки:** [сравнительная серия 3.11.727](../../material-performance-refresh/2026-10-04/RESULTS.md). Обработка прогресса между вкладками 211→88 мс; изменения сохранения малы. Отдельно выявлено медленное первое открытие больших публичных материалов (O-069). Ниже сохранена история acceptance-проверок релиза.

## 1. Модуль сохранения — 3.11.726

`public/js/material-save.js` владеет синхронным снимком намерения, подготовкой payload, local/API записью новой карточки и обновлением существующей. В UI остались validation/toast, quota UX, отображение прогресса и принятие результата в редактор. Координатор не меняет DOM/сессию: возвращает данные, duplicate/not-found/media-bound решения и предупреждения.

Сохраняются канонические writers: новый материал — BEGIN/createText/addSentences/media binding/COMMIT с rollback; обновление — replaceStudioText с expectedUpdatedAt. Source, paid translation provenance, явный playback_source, TTS profile, media outcomes и последующее продвижение в learning material сохранены. Снимок метаданных формы теперь создаётся до первого await, вместе со строками и исходником. Поздний результат A не перепривязывает открытый B. Схема БД и review_log не менялись.

Проверки:
- Общий unit: **2396/2396**. Два прежних regex-контракта обновлены для нового расположения кода; executable tests отдельно проверяют поведение.
- 7 новых исполняемых тестов: detached payload/provenance/TTS; rollback строк; отказ binding с явным outcome; rollback неожиданной ошибки binding; явный выбор duplicate/copy; конфликт ревизий; тот же снимок в API adapter и отмена устаревшей записи.
- API smoke: PASS, client/SW 3.11.726, providers не вызываются.
- [Browser OPFS fixture](save/local-browser/result.json): Classic/IDE update → copy → update, правильные строки/материал/позиция; инъекция ошибки после настоящей записи строк откатывает новую карточку, active context и review_log неизменны; pageerror отсутствует.
- SW A/D/E/G: **8/8**. Integrity/precache parity проверен; новый модуль присутствует в обоих списках.

Production **3.11.726 / 4c5c986b**: Coolify 2599 finished; [CI success](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/37155129289). [Три сверки версии/health/22 ресурсов с Git](save/production/served-assets.json) и [сохранение/копия/rollback на опубликованных ресурсах](save/production/browser/result.json) прошли. Remote-режим browser runner использует одноразовый профиль, синтетические локальные карточки и GET/HEAD/OPTIONS к production; owner-data и paid providers не используются.

## 2. Адресные обновления вкладок

Опубликован **3.11.727**. `change-scope.js` определяет таблицы DML, объединяет их в пределах транзакции и учитывает savepoint/rollback. Уже зафиксированная часть составного SQL не теряется при откате следующей транзакции. `OperationLease` передаёт область после завершения записи и освобождения storage lock. BroadcastChannel остаётся `localdb-commits-v2`; сообщения старых вкладок и неизвестные SQL/таблицы обрабатываются консервативно. Текст, параметры SQL и ID материалов в уведомления не входят. Получатель объединяет пачку за 50 мс.

Области обновления: каталог и его метаданные, личные фильтры, прогресс, словарное состояние, доступность аудио, структура Медиатеки. Progress-only событие не вызывает `loadData` Зала и не сбрасывает morph cache. Медиатека читает только text_progress; если видимый статус не изменился, DOM сохраняется. Изменение структуры читает только структуру; изменение текстов/строк обновляет metadata projection. Studio перечитывает открытый каталог только для относящейся к нему области. Reader/Home сохраняются; Home предлагает явное обновление. Пачка, пришедшая во время обновления, остаётся ожидающей; ошибка чтения повторяется при следующем возврате, без бесконечного цикла.

Это адресация по таблицам/областям, не строковая репликация. Неизвестная область намеренно может потребовать полного обновления; схема/канонические writers не меняются.

Проверки:
- Локальный общий unit **2401/2401**, затем два дополнительных теста составного SQL и rollback неопределённого результата; финальные профильные 23/23. Финальный CI: **2401 PASS, 0 FAIL, 2 SKIP из 2403** (два теста Physics corpus), отдельный набор надёжности **65/65**. CI дополнен новым браузерным сценарием.
- [OPFS, четыре вкладки](scopes/local-opfs/result.json) и [IndexedDB, четыре вкладки](scopes/local-idb/result.json): progress → 0 metadata/catalog reads, 0 word invalidations; word_status → 1 word invalidation, 0 refreshes Медиатеки. Finished status, structure-only refresh, focus, настоящий metadata update, Home/Reader identity, silent rollback/savepoint, legacy burst 10→1 — PASS. Внешние провайдеры заблокированы.
- Полный `smoke:material-reliability`: PASS — обе формы сохранения, новая вкладка/resume, поздние ответы, lifecycle, четыре поверхности/изолированные черновики/deferred dialog/local video, cold canon 79 текстов / 6646 строк с независимым digest, partial rollback и восстановлением после worker termination/browser restart.
- API smoke: PASS. SW A/D/E/G: 8/8; integrity/precache/module URL parity проверены.
- Замеры времени общего browser gate выполнялись вместе с SW-проверкой; они не являются сравнительным speed benchmark или production p95.
- Первый незастабилизированный cross-tab fixture увидел четыре word invalidations в окне проверки progress. Полного списка первых событий нет, причина не доказана (O-068). Runner теперь ждёт тишину уведомлений после boot и сохраняет диагностические области; последующие прогоны прошли. Это не объявлено исправлением неизвестного production-дефекта.

Production **3.11.727 / e878b850**: Coolify 2600 finished; [CI success](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/37156433999). [Три сверки версии/health/23 ресурсов с Git](scopes/production/served-assets.json) прошли. [Четыре вкладки на опубликованных ресурсах](scopes/production/browser/result.json): progress-only без чтения каталога и сброса словаря, word-only без перечитывания Медиатеки, rollback/savepoint без уведомления, структура/метаданные обновляются, Home/Reader и focus сохраняются, legacy burst 10→1 — PASS; pageerror отсутствует.

[Два реальных публичных материала](scopes/production/public-browser/browser.json): открытие настоящей ссылкой в новой вкладке, совпадение ID/заголовка/первой строки/перевода с серверным snapshot, query identity и возврат без reload — PASS. Снимки 380 px просмотрены: Home без горизонтального overflow; существующие узкие колонки Reader отражены в O-066. Автоматизация выполнялась в одноразовых профилях, с синтетическими локальными записями для cross-tab и read-only remote requests. Owner-live, paid-provider, physical-device и assistive-technology проверки не заявляются. [Итог релиза и ёмкости](scopes/production/release.json).

## Ёмкость сервера

После read-only inventory владелец отдельно разрешил удалить ровно два неиспользуемых образа f2f7fa29d2d6 (136213c2) и 7ac3af4559e7 (9d1d11e7). Повторно проверено отсутствие контейнерных ссылок, удаление без force выполнено. df: 2.1G / 95% → **4.4G / 88%**. Current 5093d37c и rollback d5e6c826, все 10 работающих контейнеров, volumes и backups сохранены. Ранее разрешённая очистка неиспользуемого build cache остаётся в своей области; удаление других образов этим действием не разрешено.


Дополнительная ёмкость перед вторым релизом: после 3.11.726 неиспользуемый build cache очищен в ранее разрешённой области (Docker 2.491 GB reclaimed; df 3.2G / 92%). Владелец отдельно разрешил удалить unused 7d408e2cb2f3 (d5e6c826), отсутствие container references повторно проверено; df **4.4G / 88%**. Current 4c5c986b и rollback 5093d37c сохранены. Подготовленные две поставки не дают общего разрешения на удаление будущих rollback images.

После завершения 3.11.727: df 1.2G / 97%; inventory показал 2.604 GB полностью неиспользуемого build cache. Разрешённый `docker builder prune -af` освободил 2.604 GB; итог **3.2G / 92%**, build cache 0, все 10 runtime containers и четыре volumes сохранены. Образы current e878b850, rollback 4c5c986b и более ранний 5093d37c остаются. Финальный health: ok, DB/migrations ready; `disk_warn=true`, `disk_pct_used=92`. O-047/O-055 остаются открытыми.
