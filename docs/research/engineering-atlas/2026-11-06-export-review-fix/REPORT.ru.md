# Экспорт 97001: исправления независимого ревью

Только локальная работа. Production867, исходный профиль, runtime атласа и его пометки не менялись. Нет push/deploy, новой очистки или AI-слоя. Старые commit5be3a432(869) и15850b08(870) содержат подтверждённые дефекты и не являются готовыми к выпуску. Их прежние зелёные suite не доказывали отсутствие этих ошибок.

## Воспроизведение

На прежнем869 `surface:{token:'SYNTHETIC_NOT_A_SECRET',foreign_material:'a97002'}` прошёл capture и validate. Это исключительно синтетические данные. Отдельная native SQLite последовательность BEGIN → INSERT review → capture → ROLLBACK экспортировала1review/0status и прошла validate, хотя после rollback в БД0review. Оба исходных результата сохранены в новом локальном evidence-пакете.

## Строгая схема

Общая проверка применяется при capture и независимо при validate. Неизвестный ключ, неподдержанный тип/значение или повреждённая выбранная запись останавливают весь файл. Исходные значения не исправляются, не приводятся к строкам/числам и не удаляются из выбранных записей. Другие атласы отбираются до экспорта по явным идентичностям; validate не принимает snapshot с чужими выбранными записями. Нет импорта в исходную БД.

Snapshot требует ровно schema/atlas_id/captured_at/scope/word_status/review_log/find_history/find_stale/integrity_sha256. Schema и scope фиксированы, atlas_id=a97001, captured_at — существующее UTC ISO время, hash —64строчных hex. Массивы плотные. Принимаются только JSON-данные без getters, class instances, symbol keys, toJSON, циклов или nonfinite чисел. SHA проверяет целостность, не заменяет схему и не является подписью доверенного автора.

Обозначения: status = пустая строка/new/l1/l2/l3/l4/known/ignore; counter = safe integer0..MAX_SAFE_INTEGER; days = finite number0..MAX_SAFE_INTEGER. Text — строка до1024 UTF-16 code units без управляющих символов; строка, содержащая целиком JSON-контейнер, не считается словом/id. ID непустой. Неизвестные будущие версии требуют явного расширения схемы, а не молчаливого пропуска.

| Поле metadata | Допустимое значение |
|---|---|
| status, level, training_stage | status |
| keyer_version, seedAlgoVersion | integer1 |
| backfill, postTeach, word_only, leech_released | integer0 или1, не boolean |
| interval | days |
| reps, lapses, fuzz_days, order_index, orderIndex | counter |
| scheme | fsrs / sm2 / sm2-lite / manual-mark |
| evidence_scope | lexeme / cloze / context_supported / recognition / assisted_production / unsupported_production |
| surface | Text, включая пустую строку |
| annul_of | ID |
| pos | пустая строка, verb/noun/adjective/adverb/preposition/pronoun/propernoun/determiner/conjunction/interjection/particle/numeral/number/prefix/suffix/copula/question/punctuation/other/unknown |
| text_key, textKey | строка atlas-block-v1:a97001:<section>:<revision>, ограниченный ASCII формат, ≤256 |
| sentence_id, sentenceId | строка a97001:p<positive page>:<block>, ограниченный ASCII формат, ≤256 |
| grade_policy_version, grade_policy | d1.v1 |
| raw_grade, effective_grade | integer1..4 |
| policy_reason | correct / skip / receptive-fail / production-fail / skip-production-receptive-strong / production-fail-receptive-strong |
| grader | deterministic |
| source | только text_key/textKey/sentence_id/sentenceId/order_index/orderIndex/surface с теми же leaf-типами; необходим хотя бы text_key или textKey |
| scheduler | fsrs требует ровно scheme, engine_version=fsrs6-core-v1/v2/v3, finite request_retention строго между0и1; sm2 или sm2-lite допускают только scheme |

Metadata — исходная JSON-строка ≤16384 UTF-16 code units. Повторяющиеся декодированные ключи запрещены на любой вложенности: иначе JSON.parse мог скрыть недопустимое значение, которое оставалось бы в экспортируемой исходной строке. Контракт сверён с writers в local-db.js, morph-host.js, reader-morph.js, fsrs-core.js, lemma-canon.js и grade-policy.js. grade_policy/grader/leech_released разрешены только в указанных узких формах реальных writers.

Все15полей word_status и9полей review_log обязательны и типизированы. SQL NOT NULL interval/reps/lapses не принимают null; прочие nullable проекции принимают только null или свой тип. Даты проверяются по календарю, не только Date.parse. difficulty0..10, grades1..4, latency/counters — неотрицательные safe integers. Для review/skip grade обязателен; seed/mark/annul требуют null, annul требует annul_of. Event source/channel — короткие ASCII tokens (channel nullable), а не объекты. Структурные исходные ссылки допускают только97001. Сохранённые ID/словесные поля остаются bounded text: схема не является классификатором секретов и не доказывает, что произвольный текст под разрешённым строковым полем действительно относится к книге. Поэтому реальные данные всё ещё требуют минимальной штатной копии и изолированной проверки.

Find-history требует ровно id/sid/section/page/ms/at: строковые идентичности, boolean section, page exact/near/wrong, целочисленные неотрицательные ms/at. Некорректная выбранная запись, массив вместо строки или другой скрытый контейнер дают отказ. Отбор известных чужих atlas-ID при capture — штатная граница экспорта, не частичное исправление повреждённой выбранной истории.

## Committed snapshot

Capture больше не вызывает dbQuery и не имеет fallback на него. Он требует dbAtlasProgressSnapshot у уже инициализированного host-модуля; функция не вызывает init, не создаёт новый worker и не запускает миграции. Worker использует фиксированный SQL из atlas-progress-snapshot.js, игнорируя произвольный SQL страницы.

Новая операция выполняется под OperationLease с requireCommitted. Проверка активности транзакции стоит до сброса idle timer и до abortExpiredTransaction: занятый экспорт не продлевает транзакцию, не вызывает её rollback и не закрывает соединение. Внутри worker после получения штатного соединения повторно проверяется реальный sqlite3.get_autocommit. Проверка и единственный SELECT исполняются в одной арендованной операции, поэтому следующие RPC не могут вклинить BEGIN/INSERT между ними. Экспорт не выдаёт собственных BEGIN/COMMIT/ROLLBACK/INSERT/UPDATE. Если worker ещё не проходил штатную инициализацию, следует отказ до ensureOpen; повторное физическое открытие существующего соединения обычным lease не означает новую миграцию.

Доказанная гарантия: при штатной SQLite-изоляции SQL-снимок получен вне чужой незавершённой транзакции на этом соединении; все выбранные таблицы читаются одним SQLite statement. Незавершённые транзакции других соединений изолирует SQLite/VFS. Это не атомарность между SQLite и localStorage: два find-ключа проверяются до/после чтения, и замеченное изменение даёт отказ. Это также не обещание восстановить согласованность, если другой writer сам записал неполные данные вне транзакции.

## Проверки и ограничения

Регрессии: atlasProgressExportSchema.test.js независимо валидирует сохранённый допустимый файл и самостоятельно пересчитывает checksum для malformed snapshot, не используя capture; матрица покрывает каждый разрешённый metadata leaf, вложенные объекты/массивы, foreign source/corpus, дубликаты JSON-ключей, coercion, header/row/history shape и запрет unguarded dbQuery.

atlasProgressSnapshot.test.js выполняет настоящие SQLite INSERT/ROLLBACK/COMMIT под реальным OperationLease; callback активности native binding в этом unit-fixture моделируется по успешным transaction commands. Отдельный браузерный тест export-snapshot-browser.cjs проверяет реальный wa-sqlite worker/get_autocommit в Chromium и WebKit на обеих стадиях: межшаговый отказ, одновременные capture/ROLLBACK, повтор после rollback, полный commit, отсутствие дополнительных RPC/нового worker и сохранность исходных полей/версии схемы. SW в этом тесте выключен: это не новая приёмка WebKit offline/cache.

Полные результаты и точные финальные commit фиксируются в новом локальном пакете. Предыдущие отчёты сохранены как история; прежние зелёные тесты не покрывали обнаруженные дефекты.

Остаются незакрыты: настоящий поддерживаемый экспорт владельца; структурный WebKit offline/cache transition; будущие CI/runtime/release/capacity gates.11групп/10решений/108неучебныхстрок/20source limits сохраняются. Ни869, ни870 не объявляются опубликованными или полностью допущенными.

## Контекст сессии

Штатная метрика оставшегося контекста не доступна. Видно успешное завершение предыдущего turn и сохранённое summary продолжения. Признаков compaction failure или утраты существенных требований в доступной истории нет; это не измерение свободного контекста. Сохраняются оба checkout, ограничения пользователя, commit и артефакты. Оснований начинать новый чат или повторять реализацию сейчас нет. Сырые профили, секреты и внутренние файлы сессий не исследовались.

Промежуточные failures не скрыты: тест dependency graph ожидал прежний operation-lease727; он обновлён на869 с сохранением проверки SW/server и добавлением нового snapshot-модуля. Первый браузерный замер считал все RPC приложения как RPC экспорта; фоновые SELECT мешали измерению. Финальный стенд отмечает только синхронную отправку специальной команды из адаптера capture и отдельно сообщает число фоновых запросов, не приписывая их экспортёру. Штатный UI download затем проверяется независимо.

Validate не может доказать committed-происхождение произвольного вручную составленного файла с корректным checksum. Транзакционная гарантия относится к штатному capture через новый worker RPC. Проверка сохранённого файла доказывает типы/идентичности/целостность; checksum не является подписью worker или доказательством подлинности истории.

## Финальные локальные результаты

- Целевые regression/lease/module-contract:36/36 passed.
- Подготовительная стадия869:3457tests,3456passed,1skip,0failed.
- Структурная стадия870:3493tests,3491passed,2skips,0failed.
- API smoke обеих стадий:passed. Chromium SW/worker cohort + export + rollback:15cases passed.
- Настоящий SQLite worker: Chromium и WebKit на каждой стадии (4 отдельных синтетических контекста) прошли active transaction, одновременный capture/ROLLBACK, повтор, commit, metadata rejection и штатный UI download. Worker count/schema version и исходные записи не менялись экспортом.

Эти результаты получены после исправлений. Точные итоговые commit, патчи, bundles, логи и контрольные суммы находятся в новом локальном пакете atlas97001-export-review-fix-869-870. Прежний большой пакет остаётся источником неизменного runtime, но его старые code-кандидаты заменены новым фикс-пакетом; выпускать5be3a432/15850b08 нельзя.
