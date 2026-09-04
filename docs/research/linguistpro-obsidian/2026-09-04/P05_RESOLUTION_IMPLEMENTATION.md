# P0.5: реализация контура морфологических решений

Дата: 2026-09-04

Статус: `3.11.470_PRODUCTION_TECHNICAL_PASS · OWNER_RECHECK_PENDING`

## Реализовано

- pure core `lexical-resolution-core.js`;
- состояния `unresolved / resolved / deferred / rejected_all / stale`;
- `clear` без удаления истории;
- ручная коррекция переживает смену модели/кандидатов, но устаревает при
  изменении source anchor;
- подтверждение кандидата устаревает при изменении source или candidate set;
- browser SQLite migration 051 `lexical_resolution_events`;
- append-only repository без update/delete API;
- idempotent append и fail-closed ID collision;
- exact batch: один `batch_id`, уникальные occurrence IDs, общая транзакция;
- owner/teacher-only actor validation;
- экспорт событий в `notes_advanced` schema 3 для full и slim text bundle;
- импорт с remap `text_id/sentence_id/occurrence_id` и сохранением portable
  source/candidate fingerprints.
- async lifecycle overlay: resolved occurrences покидают активную очередь, но
  остаются в полном audit; stale/deferred/rejected остаются видимыми;
- после уменьшения кластера пакетное подтверждение автоматически отключается,
  если в нём осталось меньше двух активных occurrences.
- owner-facing UI в Reading Room для просмотра occurrence и кластеров;
- отдельный экран точного impact до любой записи: количество, все occurrence
  IDs и все контексты;
- executable full/slim export-import roundtrip с remap text/row/occurrence ID,
  идемпотентным повторным импортом и запретом переноса событий другого текста;
- Obsidian `receipt.json` и `resolution-audit.json` с полным снимком состояний и
  точными переходами `unresolved -> resolved` между последовательными
  выгрузками.
- learner-facing workflow `3.11.470`: локализованные названия и объяснения всех
  причин проверки вместо внутренних кодов, трёхшаговая инструкция, поиск по
  слову/лемме/переводу, фильтр причин и скрытые технические идентификаторы;
- доступные tooltip для счётчиков, полей и действий: hover, клавиатурный фокус,
  `aria-describedby`, подписанные поля и цели взаимодействия не меньше 24 px;
- кнопки и предварительный просмотр описывают пользовательский результат
  («Сохранить этот разбор», «Что изменится»), а не устройство хранилища.

Серверная таблица намеренно не создавалась: события локальны и text-bound.
Автоматический cloud sync не утверждён.

## Проверено

- lexical-resolution audit: 24/24 PASS;
- executable full/slim backup roundtrip: PASS в обоих режимах;
- exact single/batch impact и fail-closed batch: PASS;
- Obsidian unresolved -> resolved projection/receipt/audit: PASS;
- JS syntax и scoped `git diff --check`: PASS;
- в API отсутствуют операции update/delete;
- тест exact batch подтверждает rollback до прежнего количества строк.

Browser smoke в изолированном профиле на реальном ZIP «Кфар Аза - 2 544/573»:

- импорт: `+1 text`, audio `4/4`, skipped `0`;
- single impact: `1`, после записи очередь `558 -> 557`, resolved `0 -> 1`,
  кластер `יֵשׁ` `30 -> 29`;
- после полной перезагрузки состояние сохранилось;
- batch impact для `עַזָּה`: ровно `29` IDs/контекстов, затем отменён без записи;
- batch для неоднородного `יֵשׁ` недоступен fail-closed;
- окно проверено на ширине 380 px.

## Осталось до снятия P0.5 gate

Только owner acceptance на production. Технические и автоматизированные гейты
не заменяют решение владельца. До его отчёта статус нельзя повышать до
`OWNER_REPORTED_PASS`.

Vault `F:\УЧУ_ИВРИТ\УЧУ_ИВРИТ` не изменён.

## Owner finding 2026-09-04 и исправление 3.11.467

Первая проверка `3.11.466` доказала два дефекта:

- Pealim `#2710` (`אֶת`, маркер определённого прямого дополнения) имел в
  `pealim-infl-v12` исторически ошибочный `pos: noun`, хотя контекст, карточка и
  уже curated `function-usage.v1` связывают тот же точный sense-ID со служебным
  употреблением. Общий guard поэтому ложно помещал 82 базовых вхождения `אֶת`
  и связанные формы в очередь.
- редактор и exact-impact рендерились после полного списка контекстов; в
  кластере из 82 вхождений пользователь практически не мог до них добраться.

Исправление использует существующий curated `function-usage.v1` как точный
identity overlay только при буквальном совпадении Pealim ID. Несовпадающий ID
не может снять guard, а content-контекст с function sense по-прежнему
карантинируется. На исходном ZIP очередь изменилась `1019 -> 692`,
`identity_guarded 646 -> 319`, кластеры `315 -> 279`; 774 occurrences получили
аудируемую verified-identity provenance, из них 327 перестали быть ложными
guarded-случаями. `pid:2710` сохранил 134 контекстных occurrences и правильный
`lp_pos: preposition`; два действительно несовместимых контекста форм `את/אותו`
остались в очереди.

В UI editor/candidates/actions теперь предшествуют контекстам, exact-impact
вставляется там же до списка, а контексты имеют собственную ограниченную
прокрутку. Candidate evidence также сохраняет lemma и нормализованный POS,
поэтому больше не отображается как `— · unknown · #2710`.

## Owner findings 2026-09-04: `כָּל`, `לִי` и системная очередь

Вторая owner-проверка обнаружила не два изолированных слова, а три класса
дефектов:

- поле части речи было свободным вводом и показывало внутренние английские
  значения вместо локализованного контролируемого словаря;
- кандидат Pealim показывал только `#id`, не переносился в редактор даже при
  единственном варианте и заставлял пользователя вручную извлекать число из
  понятной ему ссылки;
- старый `pealim-infl-v12` содержит систематические расхождения метаданных:
  местоименные формы предлогов помечены как noun, одна устаревшая морфема/корень
  могла создавать collision для всех occurrences, а словарная часть речи и
  контекстная роль смешивались в одном поле.

Исправление `3.11.468`:

- заменяет POS на локализованный `<select>` с каноническими сохраняемыми
  значениями;
- принимает в поле Pealim числовой ID или полную официальную ссылку, показывает
  кликабельную ссылку, а в append-only событие сохраняет только нормализованный
  ID;
- предзаполняет редактор единственным кандидатом, но не записывает решение без
  exact-impact и явного подтверждения;
- распознаёт предлог по точной парадигме `P-*`, даже если legacy-запись названа
  noun; нормализует метаданные одной Pealim identity по exact PID;
- разделяет `lp_pos` (контекст), `lexical_pos` (класс словаря) и
  `context_role`. Поэтому `כָּל` связывается с Pealim 4158 как lexical noun,
  но остаётся contextual particle/quantifier, а `לִי` связывается с Pealim 6014
  как местоименная форма предлога;
- вводит маленький версионированный exact-ID overlay для десяти числительных;
  surface guessing и ослабление homograph guard не допускаются;
- добавляет read-only exhaustive queue audit, который относит каждый кластер
  ровно к одному remediation lane.

На неизменённом исходном ZIP SHA-256
`2ccd25cede12eb1a2a8347d2e2136e9040b4ef0ba6492c46b365794e0c93b4f4`
очередь сократилась `692 -> 345` occurrences (`-347`, `-50.1%`) и
`279 -> 186` кластеров (`-93`), coverage полного аудита — `100%`, collision
keys — `0`. Оставшееся распределение:

- named entity identity: 87 кластеров / 160 occurrences;
- POS coverage gap: 37 / 93;
- genuine context ambiguity: 36 / 58;
- wrong dictionary candidate: 12 / 15;
- tokenization/source repair: 10 / 14;
- ambiguity + POS gap: 4 / 5.

Эти категории намеренно не объединены в очередное массовое auto-resolve.
Имена требуют owner/gazetteer identity, настоящие омографы — occurrence-review,
ошибочные кандидаты — точного form+context resolver, а source/tokenization
дефекты должны исправляться у источника. Полный JSON-аудит воспроизводится
командой `npm run audit:lexical-resolution:queue -- --zip <bundle.zip> --title
"Кфар Аза - 2 544/573" --baseline-occurrences 692 --baseline-clusters 279`.

Production-проверка `3.11.468` дополнительно обнаружила legacy URL с пустым
slug (`/dict/6014-/`) в function-usage store. В `3.11.469` генератор публикует
проверенные ссылки `6014-le` и `4158-kol`, а для остальных записей — стабильный
официальный ID-only URL. UI также канонизирует входящую candidate-ссылку по
проверенному Pealim ID.

## Production verification 3.11.470

- код релиза: `52daefaf1fa48ae87f7c7441a31b8873fe937341`;
- public client-config и footer: `3.11.470`;
- после rolling deployment остался один production-контейнер указанного
  коммита;
- browser-smoke: русский 380 px, английский 1280 px, иврит 380 px RTL — PASS;
- в каждом сценарии: 14 доступных подсказок, 0 неподписанных полей, 0 основных
  целей взаимодействия меньше 24 px, точный single preview = 1;
- Lighthouse snapshot: Accessibility 100, Best Practices 100, SEO 100,
  Agentic Browsing 100;
- SHA-256 production/local совпали для `library.html`, CSS, UI JS и трёх locale;
- три последовательных `/healthz`: app/DB/migrations PASS, disk 77%, warning
  выключен;
- очищены только неиспользуемый третий старый app-image и build cache; сохранены
  текущий и предыдущий rollback-image, рабочий volume не изменялся.

Это `PRODUCTION_TECHNICAL_PASS`, а не пользовательская приёмка. Для статуса
`OWNER_REPORTED_PASS` владелец должен выполнить отдельный сценарий ниже.
