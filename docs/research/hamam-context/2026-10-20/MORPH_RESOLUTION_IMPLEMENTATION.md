# Выбор чтения и объект знания — 3.11.801

2026-10-20. База кода `32204e7c`, ветка `fix/morph-card-resolution`.
[Утверждённый план](../../../planning/word-layer/MORPH_CARD_RESOLUTION_PLAN_2026_10_20.md), O-111–O-114.
Статус: локальная реализация и проверки; production acceptance будет добавлена после выпуска.

## Реализация

- Общий resolver сохраняет локальные кандидаты, включая статьи без cells; используются существующие индексы форм и небольшой индекс заголовков, формы нормализуются по мере запроса. Поддержано יוֹפִי/יֹפִי; различия гласных и shin/sin сохраняются, исходники не нормализуются на запись.
- Совпадение формы не доказывает единственность смысла. Неразрешённый набор вариантов блокирует молчаливую запись знания для другого анализа; существующие отметки остаются видны с их объектом.
- PealimFunctionLinks больше не присваивает ID другой части речи. Каждая статья показывает свой перевод/POS/прямую ссылку.
- Выбор вхождения — existing append-only confirm_candidate; имя — manual_correction, сброс — clear. Перед записью проверяются точный источник, набор кандидатов и актуальность открытой карты. Чтение confirm_candidate теперь проверяет реальный fingerprint; устаревший выбор не применяется.
- Один effective analysis используется в карте, раскраске, коллекции слов/повторов и ключе статуса. Для выбранных наречия/существительного — отдельные pid:5857/pid:5856. Выбор сам не пишет статус, seed или grade; старые отметки/FSRS не мигрируют.
- Источник огласовки, подстрочника и конкретного разбора подписан у своих данных. Общий badge Dicta в заголовке скрыт; «Имя собственное» находится в общем уточнении. После подтверждения основной ответ — выбранный разбор, сохранённый подстрочник остаётся доступен отдельно и не переписывается.
- Восстановление источника повторения теперь проверяет чтение точного места; все пропуски одинакового написания в cloze должны относиться к одному объекту. Подтверждение инвалидирует только соответствующий отрицательный lookup-кэш источника.
- RESOLVER_REV ctx-r3; release keys/SW/locales/manifest согласованы на 801. Изменения существующих статей/истории/исходного ZIP не выполнялись; новых платных ответов нет.

## Проверки

- Релевантные Node suites: readerMorph, morphCardResolution, DictaLexicon, MorphHost, lexicalResolution core/service/repository/UI/backup, wordGloss/quality/AI/portable, portableLearningPackage, provenance, shell/integrity/version/UI gates — PASS.
- scripts/premium/morph-card-resolution-browser-smoke.js: Studio/Room, настоящие OPFS и общие оболочки приложения с изолированной fixture-публикацией. Кандидаты, preview без записи, подтверждение, отдельные статусы, раскраска, сбор повторов, переоткрытие, таблица существительного, clear без переноса знания, full/slim export/import и идемпотентность — PASS, paidCalls=0. Desktop/380px/RU/HE RTL.
- scripts/premium/context-provenance-browser-smoke.js: имя שאול, источник, gloss вхождения, strict fallback и поздний словарный ответ — PASS на Studio/Room, review_log неизменен, paidCalls=0.
- lexical-resolution-reader-browser-smoke: восстановление ручного решения — PASS.
- reader-parity: 37 leaf, 6 builder, 6 golden — PASS. i18n: 233 PASS. API smoke: PASS, версия 3.11.801, provider/auth/upload boundaries без живых провайдеров.
- memory-canon: 92/92 PASS. Исходный R4a тест был 90/92 и на baseline reader 3.11.800: он предполагал adjective для реального noun/adjective омографа צריכה без контекстного решения. В обновлённом сценарии проверено воздержание без выбора и восстановление источника после явного confirm_candidate; остальные 90 проверок сохранены.
- Полный исходный ZIP: 499 строк/2193 gloss, mismatches=[], attribution/restoration=499, sameExport=true, reviewLogUnchanged=true, paidCalls=0.
- [Структурный read-only аудит](morph-resolution/structural-audit.json): 2193 слова, локальные кандидаты у 1598, несколько кандидатов у 360, статьи без cells участвуют в 458 вхождениях; несовместимых ID/POS=0. Это проверка структуры, не независимая языковая вычитка.

Замеры cold tap на изолированных профилях: baseline Studio ~1.48s / Room ~1.90s;
после переиспользования индексов повторные пары ~1.32/1.44s и ~1.61/2.04s. Это локальные автоматизированные замеры, не физический телефон и не SLA.

## Визуальная приёмка

[Studio 380](morph-resolution/studio-380-chosen.png), [Room 380](morph-resolution/room-380-chosen.png),
[Studio Hebrew](morph-resolution/studio-380-hebrew.png), [Room Hebrew](morph-resolution/room-380-hebrew.png).
Скриншоты синтетического материала; профиль владельца и raw learner data в git не добавляются.

## Предрелизный capacity

Production: 5.3 GiB free, 86%, DB/migrations ready, disk_warn=true; build cache 0 B,
14 images / 11 running containers / 4 active volumes. Очистка в рамках этого выпуска не выполнялась.
После выпуска нужны повторные version/hash/health, исходная карта יוֹפִי/שאול и сравнение owner learner-state.
