# Room: два подтверждения обновления в старом профиле

Дата: 2026-10-05. Статус: ограниченное исследование и локальный кандидат для отдельного ревью; **нового production-релиза нет**.

## Результат

После первого релиза discovery пользовательский облачный профиль обновился до 3.11.730 со второго нажатия. В одноразовом Chromium воспроизведены два разных пути с таким результатом. Первый соответствует наблюдавшемуся URL с `room_update=3.11.730`, но единственная причина конкретного облачного эпизода не установлена: до первого нажатия там не были записаны версии controller, active, waiting и installing worker.

Локальный кандидат 3.11.731 завершает уже подтверждённый переход при раннем клике, оставившем точный маркер целевой версии. Он **не исправляет** цепочку промежуточного waiting worker без маркера. Ниже приведены обе границы; успешные тесты кандидата не означают универсального исправления legacy-профилей.

Production остаётся 3.11.730, PR [#11](https://github.com/SindromRadioSpb/tts-prototype-android/pull/11), merge `5f683507fd5bc993e468f9785648cdb070843ef2`. Базовый commit этого worktree — тот же `origin/main`; перед работой divergence 0/0. Изменения находятся только в `fix/room-legacy-update`, worktree `.tmp/room-legacy-update-fix`. Исходный checkout `feat/worlds-sukkot-catalog` с чужими dirty-файлами сохранён.

## Что наблюдалось в облаке

Это сообщение независимого наблюдателя, а не локальный browser trace:

- 00:54 UTC: прежняя оболочка 3.11.729 и toast обновления.
- 00:55:06 UTC: первое подтверждение, URL `library.html?room_update=3.11.730#room=hub`, footer 729, module `/js/library-ui.js?v=729`, toast повторился.
- 00:56:52 UTC: второе подтверждение, оболочка 730, маркер исчез.
- Кэш и OPFS этого профиля не очищались.

В версии module URL нет достаточной информации о версии worker. Реальный исторический HTML 728 уже ссылается на `library-ui.js?v=729`. В локальных опытах версия controller и промежуточного waiting worker устанавливалась отдельным `GET_VERSION` через `MessageChannel`.

## Источники и метод

Исторические файлы приложения экспортировались через `git archive`; их версии и тела не переписывались:

| Источник | Commit | Роль |
| --- | --- | --- |
| Реальный 728 | `54ae3733e069f8f7b2a7a0923957f80c2f84c2f3` | Старый controller в цепочке |
| Реальный 729 | `3a4a68619c8e3483b6b1f7c68e5f6e21463f79de` | Старый controller либо промежуточный waiting worker |
| Выпущенный 730 | `be27ad8452d9e5226d959971ffb0dc6804ae9b87` | Утверждённое дерево, совпадающее с merge main |
| Локальный 731 | База `5f683507fd5bc993e468f9785648cdb070843ef2` + изменения этой ветки | Узкий кандидат; runtime SHA-256 в evidence |

Каждый опыт использовал отдельные loopback-серверы с очищенным окружением, выключенным чтением `.env`, портами ОС и подтверждением запуска собственного child через IPC. Chromium-профиль и DATA_DIR одноразовые. Целевой запрос критического module удерживался прокси, чтобы установить точное состояние `installing` до клика. После подтверждения запрос отпускался. Прокси не заменял HTML, JS или SW приложения.

В профиль каноническими SQL-записями fixtures добавлялись синтетические текст, ручной перевод, позиция чтения, заметка и review_log. До и после сравнивались количество строк и SHA-256 содержимого 50 таблиц. Служебные/cache/projection/FTS/lexicon таблицы не входят в эту выборку. Это доказательство сохранности именно синтетического локального learner state, а не обследование owner-профиля или всех видов медиа. Сырые строки не помещены в evidence.

Для основного пути создан [real legacy browser smoke](../../../../scripts/premium/sw-legacy-room-browser-smoke.js). Цепочка проверена отдельным диагностическим `.tmp/sw-chain-browser.cjs`, использующим реальные 728/729/target. Он пока не включён в CI и опирается на локальный snapshot 729. Его исходный console label `legacy: 3.11.729` и имя состояния `Server730...` статические; для цепочки авторитетны `legacyCommit`, `targetVersion`, `intermediateWaitingVersion` и реальные `states[*].workerVersion` в JSON.

## Два воспроизведённых пути

| Начальное состояние и действие | Результат с выпущенным 730 | Результат с локальным 731 | Evidence |
| --- | --- | --- | --- |
| Controller 729, target ещё installing, waiting отсутствует; click mismatch-toast | Первый click оставляет marker 730, footer/worker 729; после установки требуется второй click | Первый click оставляет marker 731; после проверки и установки worker переход завершается автоматически | [before](evidence/sw-legacy-before.json), [after](evidence/sw-legacy-after.json) |
| Controller 728, waiting 729 подтверждён GET_VERSION, сервер target ещё installing; click | Первый click активирует 729 без marker; второй доставляет 730 | Первый click активирует 729 без marker; второй доставляет 731 | [chain 730](evidence/sw-chain.json), [chain 731](evidence/sw-chain-candidate.json) |

Во всех четырёх опытах: `canonicalUnchanged: true`, 50 таблиц, `errors: []`, `otherTabNavigations: 0` в наблюдаемом этапе завершения. PASS в chain JSON означает, что **воспроизведён ожидаемый результат с двумя подтверждениями**; это не PASS исправления цепочки.

### Раннее подтверждение

Подтверждённые контракты в [library-ui.js](../../../../public/js/library-ui.js):

1. `loadRoomVersion` сравнивает server config с версией оболочки и показывает mismatch-toast, даже когда `reg.waiting` ещё отсутствует.
2. `applyRoomUpdate` сначала сохраняет позицию reader через `prepareRoomUpdateSafePoint`. Если waiting worker нет, mismatch-ветка перечитывает `/api/client-config` и вызывает `reloadRoomShellFromNetwork`.
3. Эта навигация записывает `room_update=<server version>`. Она не активирует installing worker.
4. В [sw.js](../../../../public/sw.js) `staleWhileRevalidate` для navigation получает fallback из precache по pathname. Поэтому старый controller может вернуть старый `/library.html` несмотря на query marker. Название `reloadRoomShellFromNetwork` само по себе не гарантирует обход controlling SW.
5. Навигация заново загружает старую страницу, сбрасывая её in-memory `roomUpdateActivationRequested`. После появления waiting worker простое controllerchange уже не завершает старую mismatch-ветку.

Эта последовательность воспроизведена на неизменённых файлах 729/730. Наблюдавшийся облачный marker совместим с ней. Без исходных worker trace нельзя доказать, что только она объяснила облачный эпизод.

### Промежуточный waiting worker

Подтверждённые наблюдения: controller 728, отдельным `GET_VERSION` установлен waiting 729, сервер уже target, installing target задержан. `applyRoomUpdate` выбирает существующий waiting worker и отправляет ему `SKIP_WAITING`. Первый переход заканчивается coherent 729, но сервер сообщает target и toast появляется снова. Query marker отсутствует; второй click доставляет target.

Это подтверждает предложенную гипотезу как реальный класс поведения, но не как установленную причину облачного случая. В нашей цепочке первого marker нет, в сообщении наблюдателя marker 730 есть. История облачного профиля до первого клика не сохранена.

## Локальный кандидат: конкретная реализация и ограничения

Функциональный production-diff — в `public/sw.js`:

- После прежней проверки совпадения deployment version и SHA-256 критической оболочки install проверяет окна того же origin, только pathname `/library.html`, только `room_update`, равный версии этого worker.
- При наличии такого окна worker вызывает `skipWaiting`, трактуя marker как уже выраженное подтверждение legacy-страницы.
- После существующих cache lifecycle и `clients.claim()` activate инициирует `client.navigate(client.url)` только для таких окон. Навигация остальных окон не вызывается.
- Navigation promises намеренно не включаются в activation waitUntil: functional events ждут завершения activation, поэтому ожидание собственной следующей navigation может создать цикл. Это воспроизвелось в раннем локальном прототипе и устранено; отрицательная проверка есть в unit. Нормативный порядок activation и functional events описан в [Service Workers specification](https://www.w3.org/TR/service-workers/).
- `library-ui.js` не получает новой функциональной логики; в нём меняются только dependency/alias cache keys. `index.html`, `library.html`, `server.js`, `sw.js` и critical module keys согласованы на 731.

Это исключение из старого правила «install никогда не вызывает skipWaiting»: install может закончить уже подтверждённый legacy-переход по точному marker. Обычный клиент без marker продолжает ждать явного подтверждения. Старый B6.3 regex-запрет заменён проверками выполнения настоящих install/activate handlers в [swLegacyRoomUpdate.test.js](../../../../tests/swLegacyRoomUpdate.test.js); явный message-контракт сохранён. Изменение семантики требует отдельного ревью.

Оставшиеся ограничения и вопросы ревью:

- Marker — признак URL, а не отдельная защищённая запись пользовательского подтверждения. Ручной или переданный URL с точным marker тоже может разрешить этот путь. Нужно отдельно оценить достаточно ли legacy-контракта для такой трактовки.
- Цепочка 728/waiting729/target без marker не исправлена. Поэтому кандидат нельзя описывать как универсальный one-click legacy update.
- `clients.claim()` меняет controller всех подходящих клиентов, как и прежняя activation; отсутствие принудительной navigation второго окна не означает отсутствия любого влияния на это окно. Lazy imports/долгие незавершённые операции других старых вкладок отдельно не исследовались.
- Результат `client.navigate` не сохраняется для повторной попытки; offline/закрытие целевого окна и изменение marker в гонке не дают общего обещания завершения. Ошибка не должна блокировать activation.
- В реальном тесте действие выполнено из hub после сохранения synthetic learner state. Открытый reader, его pending save и physical-device профиль с историческими данными не покрыты этим follow-up.
- Изменение только новых page handlers не способно исправить уже исполняющиеся старые JS-файлы; для общего решения legacy нужно отдельно проектировать перенос намерения между worker/page поколениями, выбор требуемой версии, состояние установки и ограниченный recovery. Такая перестройка здесь не выполнялась.

## Проверки и их точный смысл

| Проверка | Итог | Что доказывает |
| --- | --- | --- |
| `npm test` | 2453/2453, fail/cancel/skip 0 | Unit/regression кандидата; первоначальный obsolete B6 regex failure сохранён локально |
| Новые runtime SW unit | 4/4 | Точный marker; обычные/wrong-target/other-origin/other-path окна; incoherent integrity; activation без ожидания navigation |
| Real legacy 729 → real 730 | 2 confirmations | Воспроизведение раннего mismatch-класса без переписывания приложения |
| Real legacy 729 → candidate 731 | 1 confirmation | Узкий candidate исправляет этот класс |
| Real chain 728/waiting729 → real 730 | 2 confirmations | Независимое воспроизведение промежуточного класса |
| Real chain 728/waiting729 → candidate 731 | 2 confirmations | Подтверждённый оставшийся пробел кандидата |
| Полный `npm run smoke:sw-update` | 12 сценариев: 9 PASS + 3 строгих KNOWN O-015, exit 0 | Candidate 731 → синтетический 732; это общий lifecycle gate, а не historical 729 → 730 proof |
| Corpus guard | 115 файлов, 796 ready IDs, 26455 catalog IDs unchanged | Материалы, корпуса, writers/schema/publisher не изменены |

Новый historical gate добавлен в `.github/workflows/smoke-check.yml`, включая fetch точного public historical SHA для shallow checkout. На момент локального evidence capture hosted CI этого follow-up ещё не запускался; итоговый статус проверяется отдельно по точному candidate commit.

В полном SW gate сначала наблюдался H failure с пустым `after`. Старый harness мог нажать mismatch-toast раньше появления waiting worker: тогда H вообще не отправлял перехватываемый `SKIP_WAITING`. H теперь ждёт installed waiting worker и требует фактический `staleInjected: true`; A/H ждут согласованного target после возможных двух navigation events вместо фиксированных 1500 ms. Финальный H имеет `staleInjected: true`. Старые строгие KNOWN O-015 сохранены; первый failure не переименован в KNOWN и его лог сохранён.

Machine-readable сводка и hashes исходных логов: [gates](evidence/gates.json). Raw transient logs остаются в `.tmp`, не публикуются как пользовательские данные. Автогенерируемые physics research artifacts после aggregate восстановлены только в изолированном worktree по точному allowlist; исходный checkout не тронут.

Основные команды из isolated worktree (Windows перед browser gate: `PLAYWRIGHT_BROWSERS_PATH=D:\playwright-browsers`):

```text
npm test
node scripts/premium/sw-legacy-room-browser-smoke.js
node scripts/premium/sw-legacy-room-browser-smoke.js --expect-two-confirmations --current-root=<immutable real730 source>
node .tmp/sw-chain-browser.cjs --expect-two-confirmations --current-root=<immutable real730 source>
node .tmp/sw-chain-browser.cjs --expect-two-confirmations --report=.tmp/sw-chain-candidate.json
npm run smoke:sw-update
node scripts/premium/room-discovery-corpus-guard.js
git diff --check
```

Локальные immutable snapshots: 730 — `C:\Users\lletp\AppData\Local\Temp\lp-sw-current-b3JXyP\source`; 729 — `C:\Users\lletp\AppData\Local\Temp\lp-sw-baseline-lHa6cI\source`. Первые пять actual runtime hashes записаны в каждом browser JSON, результат 730 совпадает с выпущенным деревом. Эти временные paths не являются условием production.

## Следующий минимальный шаг

Сохранить рабочий production 730. При следующем обычном обновлении до первого клика, после клика и после завершения записать read-only trace: timestamp; footer; module URL; server `/api/client-config` version; URL/marker; версии `GET_VERSION` и state отдельно у controller, registration.active, waiting и installing; controllerchange/statechange последовательность. Содержимое SQLite/OPFS и запросы пользователя для этого не нужны. Если installing ещё не принимает сообщения, записать timeout/state, не подменять его guessed version.

Такая запись отличит раннее подтверждение, промежуточный waiting worker и rolling deployment в конкретном профиле. Затем можно отдельно решить, достаточно ли marker bridge или нужен более полный protocol. Очистка browser cache/OPFS не является диагностическим шагом или исправлением.

До этого локальный 731 остаётся **частичным кандидатом**, с отдельным review и без merge/deploy. Производственный дефект не объявлен закрытым. Наблюдение зарегистрировано как O-075 в [журнале](../../../planning/OBSERVATIONS_LOG.md).
