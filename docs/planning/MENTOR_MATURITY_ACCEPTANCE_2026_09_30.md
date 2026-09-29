# Приёмка зрелого ИИ-ассистента-ментора

Дата: 2026-09-30. Source baseline: `2509e9b1`. Статус: критерии нового
[продуктового плана](MENTOR_PRODUCT_RESET_2026_09_30.md), **не PASS продукта**.
На baseline соответствующие longitudinal/learning сценарии не были закрыты.

## 1. Как читать статус

`TECHNICAL_PASS` — конкретный transport/API/fixture прошёл.
`PRODUCTION_VERIFIED` — конкретный commit/assets/image/health опубликован.
`OWNER_REPORTED_PASS` — владелец прошёл названный реальный сценарий.
`LANGUAGE_REVIEW_PASS` — независимый языковой набор принят.
`LEARNING_EVIDENCE` — есть данные заранее заданной образовательной проверки.
Ни один из них отдельно не означает «зрелый наставник».

Зрелость требует закрытия обязательного пользовательского scope C1–C7.
Полезный ограниченный текстовый pilot может поставляться раньше с явным
объёмом. Сценарий без нужного evidence остаётся `NOT_VERIFIED` или
`BLOCKED_DEPENDENCY`; длительность разработки не меняет статус.

## 2. Продолжение через время — обязательный C1 gate

| ID | Сценарий | Независимый oracle | Что считается отказом |
| --- | --- | --- | --- |
| L01 | День 0: ученик спрашивает по материалу A, уточняет, пишет свою реплику; вкладка закрывается | Persisted turns/source refs/sequence, видимый transcript, completion receipts | Ответ принят только в памяти вкладки/одного job |
| L02 | После job TTL и перезапуска server/connector открыть A в пустом браузере того же аккаунта | API чтение durable turns, UI history, прежняя цель | История требует старого IndexedDB/session ID/live handoff |
| L03 | День 1: в материале B спросить «Мы такое уже разбирали?» без ID/clipboard | Реальный целевой query/model read; найден именно факт A, source refs | Ответ угадывает прошлое, получает заранее вручную скопированный transcript или заявляет, что не помнит |
| L04 | Новый обычный Hermes-чат: «Продолжим вчерашний разбор» при standing grant | Target-tool trace, receipt нужного turn/lesson, actual model continuation | Только capabilities/discovery/SDK probe; зависимость от 15-минутного handoff |
| L05 | День 7: вернуть unfinished lesson, сохранив старые/новые anchors | Lesson lifecycle + chronology + source versions, видимая продолженная цель | «Следующая сессия» — новое независимое объяснение |
| L06 | Более четырёх прошлых turns, много материалов, перефразированный запрос | Retrieval relevance набор с pinned expected refs; pagination/truncation | Последние N turns приняты за всю память; нужное старое событие не находится |
| L07 | Re-pair/смена совместимого runtime после revoke | Старый credential отказан, persistent history сохранена, новые grants оформлены | История каскадно удалена или старые grants скопированы автоматически |
| L08 | Две вкладки/два устройства: ответы одновременно и reconnect после offline draft | Immutable turn IDs, monotonic sequence, idempotent replay | Потеря/дублирование ответа или last-write-wins transcript |
| L09 | Local history import дважды; старый удалённый turn снова приходит из cache | Dry-run/read-back checksum+identity, zero second import, tombstones | Потеря source/ответа, дублирование, resurrection |
| L10 | Не включать память или отключить её | Отсутствие durable content writes/standing reads, честный режим UI | Скрытый upload или обещание долгой памяти без данных |

Сначала automated fake-clock tests для lifetime и replay. Затем фактические
день 0/1/7 на owner/согласованном pilot. Fake clock доказывает retention,
но не реальное обучение/возвращение человека. До реальных поздних checkpoints
не повышать статус. Результаты сохраняются без исходных личных payload в logs.

## 3. Педагогика и адаптация — C2/C4

| ID | Сценарий | Oracle |
| --- | --- | --- |
| P01 | Объяснение выбранной конструкции в контексте и верном регистре | Reviewed source/grammar example; independent Hebrew rubric |
| P02 | Прямой вопрос без требования сначала решить тест | Пользователь получает ответ; практика optional; UX record |
| P03 | Собственная реплика/попытка с подсказкой, переводом, показом ответа и без них | Assistance receipts, grader policy; aided результат не объявлен independent |
| P04 | Такая же конструкция в другом материале после перерыва | Reviewed new-context item, unassisted attempt, source/version и время |
| P05 | Полезная приоритетная правка собственной реплики | Independent rubric по смыслу/языку; исправление не навязано на каждое слово |
| P06 | Наставник выбирает следующий шаг по реальному наблюдению | Evidence refs существовали до рекомендации; learner goal, давность, причины доступны |
| P07 | Пробел данных, ambiguous Hebrew form, ошибочный transcript, stale evidence | Abstention/уточнение/unknown; no fabricated mastery/diagnosis |
| P08 | Пользователь исправляет ложную память/оспаривает feedback | Corrected summary revision, invalidated projection; assessment receipt не подделан |
| P09 | Silent/Coach/Intensive, «позже», пропуск, усталость | Cooldown и controls; skip не создаёт ошибку/понижение навыка |
| P10 | Повторная доставка задания/оценки или отмена после подсказки | Canonical writer один, review_log idempotency; no duplicated grades |

Baseline source recall по выбранному/самому длинному слову может проверять
совпадение с источником. Он не закрывает P01/P04/P05/P06. Два LLM того же
семейства не объявляются независимым языковым oracle.

## 4. Основной пользовательский путь — C3/C5/C6

| ID | Сценарий | Критерий |
| --- | --- | --- |
| U01 | Новичок подключает собственный runtime и получает первое объяснение | Самостоятельно, без терминала/оператора/ручного key/URL; реальные clicks/time/errors записаны |
| U02 | Студия → Зал → Медиатека → Повторение | Один наставник и lesson context; source anchors и очередь/позиция сохраняются |
| U03 | Обычное обучение после активации памяти | Нет repeated consent checkbox, save/download/import/context copying/tool choice |
| U04 | Материал из нескольких строк/видео и смена предмета обсуждения | Несколько anchors внутри занятия; source/time revision точные; плеер возвращается к исходной позиции |
| U05 | Обсуждение/ролевая беседа и письмо | Общая история/цель, дозированные исправления и сохранённая собственная продукция |
| U06 | Голос: сомнительный ASR, interruption, микрофон/stop | Подтверждение сомнительного transcript; ASR не выдаётся за языковую ошибку; отдельный provenance |
| U07 | RU/EN/HE, 360/390/768/1280, keyboard/focus/AT | Воспроизводимая visual/a11y проверка; реальные устройства/AT отдельно от browser fixture |
| U08 | Runtime спит, quota/re-auth, обрыв после completion | Сохраняются цель/draft/history; причина и конкретное восстановление; no silent paid fallback |

Подключённая owner beta.4 с OAuth callback не закрывает U01: clean-machine
Hermes и новый пользователь ещё не проверены. Существующий C2 voice не
закрывает U06 нового runtime без отдельной equivalence/реальной приёмки.

## 5. Данные, доверие и эксплуатация — gates каждого среза

| ID | Проверка | Обязательный результат |
| --- | --- | --- |
| D01 | Два аккаунта, два агента, чужие IDs/cursors/context refs | Отказ чтения/записи, нулевое раскрытие чужого transcript/source/evidence |
| D02 | Старые consent/scope после добавления history tools | Не получают новые права; фактическая новая авторизация ограничена учебными scopes |
| D03 | Revoke во время tool read/job и late result | Нет дальнейшего access/acceptance; revoke не стирает пользовательскую историю |
| D04 | Delete conversation/account после summary/index/context pack | Содержимое и зависимые projections недоступны; zero remaining account rows при account delete |
| D05 | Restore старого backup/cache/import после удаления | Erasure replay исключает resurrection; content-free receipt и отдельная backup retention |
| D06 | Prompt injection в тексте, saved turn и summary | Только learning-data authority; no credentials/system prompt/tools escape/произвольный write |
| D07 | Account export | Полная сохранённая история/provenance, no secret hashes; local pending отдельно обозначен |
| D08 | Load/storage/quotas/concurrent lessons | Измеренные p50/p95, bounded context/tool loop, честный limit/offline; budget/support/capacity отчёт |
| D09 | Реальная publication | Commit ancestry, repeated no-cache health/config, served assets/SW, active image; owner/model evidence отдельно |
| D10 | Subscription/provider contract | Личный route, no copied independent OAuth refresh stores, no unexpected API/voice/embedding spend |

## 6. Доказательство образовательной эффективности — C7

До набора участников фиксируются цели выборки, задания, baseline, способ
независимой проверки и критерии анализа. Небольшой owner walkthrough — UX
приёмка, а не статистическое доказательство.

Основной показатель: самостоятельное применение целевой конструкции/навыка
в новом контексте на отложенном checkpoint. Отдельно: aided и unaided,
понимание/распознавание/продукция, давность, ошибки языка/ASR, dropout.
Нельзя обобщать source recall или активность на полноценное владение языком.

Сравнение: текущая локальная помощь/базовое чтение с повторением против
нового наставника при сопоставимых источниках, времени и начальном состоянии.
Метод и размер выборки выбираются до эксперимента со специалистом; платный
набор/редактура требуют бюджета. На маленьком pilot фиксируются наблюдения
и ограничения без выдуманных процентов/значимости.

Независимый language review покрывает правильность современного иврита,
регистр, омографию, допустимые варианты, уверенность/abstention и приоритет
feedback. Known critical language errors не остаются в принятом наборе.
Оценка retrieval отдельно от качества model ответа: fluent пересказ не
считается памятью, если целевой turn не был получен.

## 7. Формат evidence и закрытие

Для каждого ID: source commit/protocol/runtime versions, data origin,
сценарий и environment, независимый expected result, actual result,
receipt/tool refs, статус, ограничения и дата. Fixture/production/owner/
physical-device/AT/language/learning evidence разделяются.

C1 закрывается L01–L10 и D01–D07/D09/D10 для выбранного пилотного scope,
плюс U03/U08. C2 — P01–P05/P07/P10. C3 — U02–U04/U07. C4 — P06/P08/P09.
C5 — U05 и отдельно U06. C6 — U01/U08 и D01–D10 в supported-runtime matrix.
C7 — весь согласованный scope и раздел 6. Не выполненное не замещается
«технически готово» и не удаляется из активного плана.
