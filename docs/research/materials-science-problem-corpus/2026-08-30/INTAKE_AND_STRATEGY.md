# Intake и corpus program strategy

> Актуализация 2026-08-30: Gemini Shadow терминально закрыт со статусом
> `NO_MORE_GEMINI_REQUESTS`. Владелец утвердил локальный source-first Build:
> 6 партий по 10 задач, максимум два прохода, provider calls = 0. B01/pass 2
> терминально закрыт: 1 `PASS`, 9 `INCOMPLETE`, третьего прохода нет. B01 не
> является каноном и не разрешён к импорту. B02/pass 2 терминально завершён:
> q010-q019 получили 0 `PASS` и 10 явных `INCOMPLETE`; девять заголовков
> source-backed исправлены, третьего прохода нет. Provider calls, secret access,
> решения, audio, import и publication = 0.

## 1. Цель продукта

Рабочее имя: **«Материаловедение. Задачник 2»**.

Цель — не перенос старых карточек, а зрелый source-grounded корпус с двумя
разными потребителями:

1. Пользователь получает точное условие, иврит, огласовку, транслитерацию,
   русский перевод, исходные схемы/таблицы и построчное аудирование с подсветкой
   звучащего слова.
2. Персональный ИИ-помощник получает версионированные, адресуемые по task ID
   материалы: условие, схему, проверенный ответ, экзаменационное решение,
   объяснение для начинающего, допущения, формулы, единицы и provenance.

Эти слои нельзя смешивать. Канонический source corpus отвечает только за то,
что поставлено в задаче. Решения и tutor-материалы — отдельная производная
программа после стабилизации source corpus. Будущий учебник — ещё один
независимый reference corpus с собственными правами, edition ID и точными
section anchors; он не изменяет идентичность или формулировку задачи.

## 2. Evidence envelope этого Recon

Подтверждено локальной проверкой трёх входов, source-first PREPARE, полным
row mapping и semantic diagram review. Не выполнялись:

- вызовы Gemini, Google TTS или иных платных/внешних провайдеров;
- чтение, копирование или хеширование файла секрета;
- импорт в Studio/Reading Room, изменение БД или пользовательских данных;
- создание или adjudication новых решений;
- owner-live, physical-device, assistive-technology или production acceptance;
- commit, push, deploy или публикация.

Следовательно, этот документ доказывает пригодность программы к следующему
решению, но не качество будущего корпуса.

## 3. Входы и фактическое состояние

### 3.1 Исходный задачник

`Задачник 2.pdf`, 6 556 604 байта, SHA-256
`3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435`,
73 страницы.

Это смешанный документ, а не чистый набор условий:

- страницы 1–65 содержат оглавление, задания, встроенные страницы решений,
  формулы, графики, микрофотографии, диаграммы и таблицы;
- страницы 66–73 выглядят как справочные приложения;
- страницы 68–70 требуют сохранения исходной ориентации;
- визуально присутствуют номера вопросов 1–58 и как минимум одно
  ненумерованное упражнение около страницы 5;
- PREPARE-read-back установил, что номер 38 присвоен двум разным заданиям на
  страницах 45 и 47: это 59 нумерованных occurrences при 58 уникальных номерах.

Владелец 2026-08-30 утвердил включение ненумерованного упражнения и сохранение
обоих №38 с aliases `38-A`/`38-B`. Поэтому canonical task count равен 60; page
count по-прежнему не является task count.

### 3.2 Legacy-экспорт Studio

`Материаловедение_library_export_20260119.json`, 5 440 492 байта, SHA-256
`2a2f3191dd73a5e5bc99b096cda704a54172b33ebd3416c969d2f03299e2cb21`.
Внутренний timestamp экспорта: `2026-01-19T00:54:28.690Z`.

Релевантная выборка по префиксу заголовка содержит:

- 58 карточек и 2 469 строк;
- 52 карточки с точным topic `Материаловедение`;
- 6 карточек с пустым topic: страницы 7, 7_, 9, 12, 13, 15;
- 57 уникальных заголовков; `Страница 21` существует в двух существенно
  похожих, но не одинаковых версиях;
- 56 карточек с legacy provider metadata и 2 без него (`6.3`, `7_`);
- 48 карточек с явными маркерами решения и 50 с маркерами условия;
- 0 строк с типизированной семантикой в `meta_json`;
- только 1 строку с `audio_asset_key`.

Все 2 469 строк заполнены в четырёх legacy-колонках, но это не является
доказательством точности. Локальные эвристики нашли 147 строк без знаков
огласовки в колонке `he_niqqud`, 3 строки с ивритом в transliteration и 1 строку
с ивритом в русском поле. Сравнение буквенных основ `he`/`he_niqqud` даёт 1 221
несовпадение; многие могут быть нормальными различиями מלא/חסר, поэтому эти
числа — очередь для проверки, а не автоматический verdict.

Legacy-источники некоторых карточек указывают на внешние chat-страницы. Они не
являются устойчивым provenance и намеренно не перенесены в этот пакет.

### 3.3 Owner-edited печатный решебник

`Решебник к Задачник2_v2026-01-15.pdf`, 7 664 344 байта, SHA-256
`9ac844e637e5740d9487642438387323f32a6edd6b9bd546e3c7c246b181f00f`,
148 страниц.

Это Word-производный трёхколоночный документ с ивритом, транслитерацией и
русским, формулами, схемами и owner-правками. Он важен как evidence, но не может
автоматически стать answer truth: сам документ предупреждает о возможных
ошибках, а часть страниц фактически пуста или содержит только оформление.

В нём найдено 54 уникальных секции `Title:`. Заголовки не дают взаимно
однозначного join с JSON:

- есть в JSON, но не найдены как title в PDF: 13, `30 ВАЖНО!`, 58, 59, `7_`;
- есть в PDF, но не найдены как title в JSON: 14, 30.

Следовательно, сопоставление только по заголовку или номеру страницы запрещено.

## 4. Решение о повторной обработке современным ИИ

Рекомендация: **не делать полный повторный прогон первым шагом** и одновременно
**не признавать legacy-данные достаточными без проверки**.

Правильная развилка:

1. **Выполнено.** Бесплатно и локально построить source-first manifest: каждая физическая
   страница, логическая задача, подзадача, продолжение, решение, схема и
   приложение получают явную роль и координаты.
2. **Выполнено для JSON.** JSON и печатный решебник заморожены как независимые
   legacy layers; все 58 карточек / 2 469 JSON rows получили reviewed target ID,
   ничего не перезаписано. Решебник остаётся вне solution adjudication.
3. После отдельного owner approval выполнить современный shadow-аудит на
   стратифицированной выборке 10–12 сложных случаев: первая задача; упражнение
   без номера; многочастное/многостраничное условие; дубликат страницы 21;
   расхождения 7/7_, 13/14, 30/`30 ВАЖНО!`, 58/59; задача со схемой; задача с
   таблицей; повёрнутое приложение; последняя задача.
4. Сравнить shadow не с legacy «в целом», а по отдельным критериям: source
   transcription, границы условия, схемы/подписи, иврит, огласовка,
   транслитерация, русский, формулы/единицы и solution consistency.
5. Если дефекты локальны и объяснимы — исправлять только allowlisted строки с
   correction ledger. Если дефекты системны, границы задач неустойчивы или
   существенная доля схем/формул потеряна — разрешать полный pinned-model run с
   raw cache, resume, batch и заранее утверждённым cost ceiling.

Shadow sample выбирает экономичный метод, но не уменьшает финальный gate:
source mapping, критические схемы и канонические строки проверяются на 100%.

## 5. Программа реализации

### Phase A — PREPARE и local mapping (выполнено)

Только локальная подготовка:

- создать page manifest 1:1 для всех 73 страниц с `page_role`, orientation,
  raster/vector status и checksum render;
- создать task manifest от источника, а не от заголовков Studio;
- выделить condition, subpart, note, diagram reference, embedded solution и
  appendix, сохранив точные page/crop anchors;
- зафиксировать canonical task set: 59 нумерованных occurrences (58 уникальных
  номеров, два разных вопроса №38) плюс утверждённое ненумерованное упражнение;
- нормализовать legacy export в comparison projection без изменения raw JSON;
- подготовить red tests на дубликат 21, 7/7_, расхождения заголовков PDF/JSON,
  пустые topic, отсутствующую типизацию и неполное аудио;
- рассчитать локальный prompt/token/character envelope без provider calls.

Gate A: **PASS**. 73/73 страниц и 60/60 задач классифицированы; 58/58 legacy
карточек и 2 469/2 469 строк имеют target mapping. У №2 и №32 нет legacy rows —
это явное отсутствие, не ошибка join. Legacy solutions остаются unvalidated.

### Phase B — SHADOW AUDIT (PLAN выполнен, APPLY только по отдельному разрешению)

- `PLAN` зафиксировал recommended stable model `gemini-3.7-flash`, Standard,
  medium thinking, frozen prompt/schema и 12 стратифицированных случаев;
- три resumable batches дают 20 PDF page exposures; hard caps составляют
  50 000 input и 16 384 output/thinking tokens на call;
- при тарифе, проверенном 2026-08-30, четыре максимально разрешённых вызова
  (3 primary + 1 общий retry) дают worst case USD 0,395760; предлагаемый
  owner ceiling — USD 0,50;
- затем `APPLY` только в пределах approved sample;
- хранить raw provider response неизменяемо и отдельно от reviewed correction;
- оценить расхождения двумя независимыми линзами: язык (R1) и предметная
  корректность/схемы (R11/R17).

Gate B: письменное решение `LEGACY_REPAIR` либо `FULL_RERUN`, с измеренной
частотой и классами дефектов. Если выборка не даёт честного бинарного verdict,
разрешён третий исход `EXPAND_SHADOW`; нельзя маскировать неопределённость.
Shadow output сам по себе не становится каноном. Source-corpus audit не пишет
и не adjudicates решения: это отдельная программа.

### Phase C — SOURCE CORPUS BUILD

- стабильные ID вида `materials-science-y1-pb2-q001`; ненумерованное упражнение
  имеет утверждённый отдельный ID;
- каждая каноническая запись привязана к source PDF SHA-256, странице и crop;
- таблица пользователя содержит `he`, `he_niqqud`, `transliteration`, `ru` и
  typed row kinds, но только для условия и source notes;
- схемы и таблицы сохраняются как first-class assets с хешем, подписью,
  orientation и task dependency;
- исправления оформляются append-only ledger с before/after, reason,
  evidence anchor и reviewer status;
- никакие решения не записываются в source truth.

Gate C: полное соответствие source/task/page, отсутствие пустых обязательных
полей, проверка формул/единиц/направления текста и визуальный readback каждой
схемы.

### Phase D — REVIEWED SOLUTIONS (отдельная программа)

Запускается только после freeze source edition и отдельным solution workflow:

- owner-edited PDF и встроенные страницы решений становятся evidence inputs;
- решение выводится/проверяется независимо и сопоставляется с legacy;
- расхождения имеют статусы, доказательства и reviewer disposition;
- экзаменационное решение отделено от beginner tutor walkthrough;
- таблицы ответов проверяются формулами, единицами, знаками и граничными
  случаями;
- agent Markdown/JSON содержит точный task ID/edition, condition, diagrams,
  answer, solution, assumptions, formulas, units, pitfalls, provenance и
  `not_found` вместо домысла.

Gate D: нет unresolved critical discrepancy; tutor не может получить материал
другой задачи через fuzzy title match.

### Phase E — TIMED AUDIO И КАРАОКЕ

Требование продукта — не просто MP3 строки. Для каждой утверждённой строки
нужны аудио и timing sidecar, чтобы reader подсвечивал текущее слово.

Техническая стратегия:

- TTS input — только утверждённый `he_niqqud`, нормализованный детерминированно;
- cache key связывает exact text, voice, language, rate, pitch и synthesis
  profile; одинаковые строки дедуплицируются;
- синтез выполняется с SSML marks/timepoints; timing sidecar версионируется и
  хешируется вместе с MP3;
- существующий reader уже умеет читать timing sidecars, но Physics TTS builder
  создаёт только MP3. Для этого корпуса нужен обобщённый timed builder; нельзя
  объявить sentence-only Physics путь word-karaoke реализацией;
- `PLAN` показывает missing unique clips, unique billable characters, voice
  profile, free-tier assumptions и worst-case ceiling;
- `APPLY` возможен только после approval профиля и ceiling.

На текущем смешанном legacy-наборе 2 469 строк дают 2 355 уникальных точных
текстов и 181 665 уникальных символов. Это лишь верхняя оценка legacy-all-rows
до source/solution split, а не финальная квота и не разрешение на синтез.

По опубликованному на дату Recon [тарифу Google Cloud
TTS](https://cloud.google.com/text-to-speech/pricing/) такой объём после полного
исчерпания free tier дал бы ориентир около USD 0,73 для Standard либо USD 2,91
для WaveNet. Это не quote: timed-совместимый voice ещё не выбран, итоговый
source-only набор будет другим, а тариф и free-tier status нужно обновить в
непосредственном `PLAN` перед любым `APPLY`. Стоимость Gemini сейчас не
оценивается без готового page/split/token envelope; перед shadow-аудитом она
берётся заново с [официальной страницы Gemini API
pricing](https://ai.google.dev/gemini-api/docs/pricing), а не из legacy alias.

Audio gate:

- MP3 есть, декодируется и совпадает по хешу для 100% eligible строк;
- timing count совпадает с числом токенов, offsets монотонны и помещаются в
  duration; отсутствующие timepoints — ошибка сборки, а не тихий fallback;
- sidecar schema и ссылки пакета валидны, HTTP Range и timing fetch проверены;
- 380px RTL smoke проверяет строку, слово, play/pause/replay и reduced motion;
- browser smoke, physical-device и AT evidence отмечаются раздельно.

### Phase F — PACKAGE, IMPORT, PUBLICATION

Только после отдельных разрешений и подтверждения прав:

1. deterministic local package + manifest + snapshot hash;
2. isolated/private import rehearsal и read-back;
3. owner reopen/smoke без записи в learner truth;
4. immutable edition publication с rollback proof;
5. отдельные production probes для HTML, assets, audio, timings и agent files.

Публичный доступ к задачам, доступ к решениям, доступ ИИ-помощника и будущий
доступ к учебнику — четыре независимых policy decisions.

## 6. Права и provenance

До публикации отдельно подтверждаются:

1. исходный текст задачника;
2. схемы, фотографии, графики и справочные приложения;
3. созданные `he_niqqud`/transliteration/ru производные;
4. TTS-аудио и timing metadata;
5. answer facts и independently reviewed solutions;
6. публичная раздача agent-facing Markdown/JSON и будущего учебника.

Статус всех шести классов в Recon: `UNCONFIRMED`. Наличие локального файла или
старой карточки Studio не доказывает право публичной публикации.

## 7. Синтез ролей R1–R17

- **R1:** нельзя массово «исправлять» различия `he`/`he_niqqud`; нужен
  лингвистический ledger, reverse-check и сохранение source meaning.
- **R2:** пользовательская строка должна быть достаточно короткой для
  аудирования и достаточно цельной для понимания; condition и solution не
  перемешиваются.
- **R4:** premium mobile/RTL опыт включает схемы, формулы, читаемую типографику,
  точную word highlight и честные состояния загрузки/ошибки.
- **R6:** curator работает с immutable edition, page/task provenance и явными
  правами, а не с импортом «похожих» карточек.
- **R11:** исходник не переписывается; схемы, ориентация, формулы и единицы
  проходят source-first readback.
- **R12:** raw source, legacy projection, reviewed correction, source corpus,
  solutions, learner state и publication snapshot — разные домены истины.
- **R16:** дорогая работа имеет PLAN/APPLY, cache/resume/batch, стоимость на
  missing unique items и owner ceiling.
- **R17:** ИИ-помощник получает bounded task package с доказанными решениями и
  `not_found`; он не должен сочинять ответ из соседней задачи или учебника.

Остальные роли применяются на соответствующих gates: accessibility/AT,
security/secret hygiene, QA/evals, production rollback и privacy.

## 8. Owner decisions

Закрыто 2026-08-30:

1. Упражнение страницы 5 включено; оба №38 сохранены как `38-A`/`38-B`.
2. Неоднозначности 58 legacy-карточек разрешены page/content-bound mapping;
   все 2 469 строк назначены без fuzzy title join.
3. Phase A PREPARE и последующий local mapping/diagram classification выполнены.

Остаётся за владельцем:

4. Указать права/режим доступа по шести классам из раздела 6.
5. Shadow APPLY был отдельно утверждён и терминально закрыт: четыре B01 attempts,
   два HTTP 200, ноль семантически пригодных результатов; B02/B03 не отправлялись.
   Переоткрытие provider recovery требует нового отдельного решения.
6. Позже отдельно разрешить solution program.
7. Выбрать TTS voice/rate/pitch после прослушивания короткого бесплатного или
   явно одобренного sample; legacy `he-IL-Standard-A`, rate 0.8, pitch 2 — лишь
   историческое состояние, не автоматически утверждённый профиль.
8. Отдельно решить private/premium/public доступ для source, solutions, audio,
   agent files и будущего textbook corpus.

## 9. Stop conditions

Работа немедленно останавливается до owner decision, если:

- task mapping требует угадывать между противоречащими источниками;
- source PDF/диаграмма нечитабельны или отсутствуют;
- correction изменяет смысл задачи без точного evidence anchor;
- внешний вызов, импорт, TTS APPLY, решение или публикация не имеют отдельного
  разрешения;
- стоимость превысит approved ceiling или cache/resume не доказаны;
- права на требуемый класс контента не подтверждены;
- предлагается запись в learner/private/group truth, `review_log` или B9;
- package/read-back/rollback не воспроизводятся.

## 10. Текущая конечная граница

PREPARE, полный local row mapping, semantic diagram classification и весь
конечный Build 6×10×2 завершены. Все 60 задач терминально классифицированы,
третьего прохода нет. Итог: 693 строки, 51 reviewed, 642 blocked, одна задача
`PASS`, 59 задач `INCOMPLETE`. Все 43 visual-bearing tasks и 90 visual instances
классифицированы; appendix dependencies сохранены. Локальный Build не вызывал
провайдер, не обращался к секрету, не создавал решения или аудио, не импортировал
и не публиковал данные.

Канонический ZIP не выпущен. Следующий content gate — отдельная конечная
программа `MATERIALS-PB2-SEPARATE-CANONICAL-REPAIR`, а не третий проход:
один provider generation pass по 59 неполным задачам и максимум один repair
pass только по failed rows. До её запуска владелец должен заново утвердить
provider/model, hard MAX_USD и egress исходных страниц и legacy condition
candidates. TTS APPLY, solution generation, import, deploy и publication
остаются отдельными запрещёнными до явного одобрения действиями.
