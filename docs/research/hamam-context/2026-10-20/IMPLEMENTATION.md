# Контекстный слой — реализация 3.11.800

Дата: 2026-10-20. Требования утверждены владельцем.
База: 030f2437, ветка fix/context-learning-provenance.
[Требования CP-1–CP-6](../../../planning/word-layer/CONTEXT_PROVENANCE_REQUIREMENTS_2026_10_20.md).
Статус: локальные проверки пройдены; выпуск 3.11.800 и исходный owner-сценарий подтверждены. [Production acceptance](PRODUCTION_ACCEPTANCE.md).

## Что изменено

- Источник огласовки читается из метаданных поля, а не из наличия знаков. Неизвестный источник остаётся неизвестным.
- field_meta сохранён при публикации архива. Для старых публикаций добавлено отдельное поле evidence ответа API: проверяются SHA-256 сохранённого ZIP и совпадение значений с неизменяемым snapshot.
- Existing public snapshot/hash и исходный архив не переписываются. На устройстве восстанавливаются только отсутствующие сведения об источнике, при совпадении полного набора строк и отсутствии неоднозначной атрибуции повторов; CAS сохраняет параллельную правку.
- Черновые вхождения сохраняют идентичность при клонированной перерисовке; алиас в edit_meta_json переносит последнюю ручную правку при сохранении и Save as New. Регрессионный word-gloss-ai-smoke сначала поймал потерю правки, после исправления проходит целиком.
- ИИ-gloss вхождения хранится по постоянному ID строки + ключу содержимого. Кэш оплаченных строк остаётся отдельно; старые ключи не удаляются. Общий старый ответ маркируется как общий, а не независимо проверенный для вхождения.
- Импорт слоя происходит после привязки к действительным локальным строкам. ZIP, text-card, публичная материализация и «Мой словарь» используют эту привязку. Ручные правки сохраняются.
- В обычном подстрочнике словарная подпись отмечается ◇. Режим «Только контекстный перевод» показывает — для пропусков. Покрытие считается по словам; строки только […] исключены.
- Контекстный перевод показывается первым. Неподтверждённый словарный разбор раскрывается отдельно. «Точно» заменено на «форма совпадает со словарём»; подтверждение владельца/преподавателя остаётся отдельным статусом.
- «Это имя здесь» требует явного подтверждения и записывает существующее anchored lexical-resolution event. Не анализирует свободный русский gloss как команду; не пишет word_status/FSRS/review_log. Устаревшая строка блокирует сохранение.
- Подтверждённая карта имени не наследует чужой корень, парадигму или статус другого словарного ключа. Позднее уточнение не заменяет подтверждённую карту.
- Поздний словарный ответ не перекрашивает более новый строгий режим. Источники и UI едины для Studio/Room; RU/EN/HE, desktop и 380 px проверены.

## Automated evidence

Изолированные fixtures; платные модели не вызывались:

- node --test: learningFieldProvenance, wordGlossAiLayer, wordGlossAiPortable, wordGloss, wordGlossQuality, portableLearningPackageRepository/Security/Core, lexicalResolutionService/Core/Repository, textCardShare, corpusMaterialize, mediathequeArchive, morphHost, publicationDomain/Center, publicCorpusAdapter, publicWorkSnapshotCache, premium/readerMorph, shellIntegrityPrecacheParity, shellModuleWiring, staticVersionGuard, studioBootIntegrityCadence, visualFinishingStudioShell/Room — PASS.
- reader-parity-smoke: 37 leaf checks, 6 builder cases и 6 golden cases — PASS.
- i18n.smoke: 233 PASS, cache-bust lock обновлён до 800.
- scripts/api-smoke.js: health, client-config 3.11.800, Phase-6 boundaries, recovery export, authenticated niqqud boundary, upload gates, keyless cache TTS, Mini App/OAuth boundaries — PASS.
- word-gloss-ai-smoke (mock provider, включая lazy/правку/перерисовку/откат): PASS. lexical-resolution-reader-browser-smoke: PASS.
- scripts/premium/context-provenance-browser-smoke.js: Studio и Room — PASS. Реальные OPFS и общий UI; публикация подменена fixture. Проверены разные gloss повторов, fallback/строгий режим, источник, подтверждение имени, поздний словарный ответ, 380/1280 px, Hebrew RTL; review_log неизменен, paid calls=0.

Команда полного архива: scripts/premium/context-archive-audit.js --archive <Hamam-1.learning.zip>.
Архив владельца только читается; импорт выполняется в отдельном чистом browser context.
Результат: rows=499, words=2193, mismatches=[], attributed=499, restoredAttribution=499,
sameExport=true, reviewLogUnchanged=true, paidCalls=0. Включает пять ранее схлопывавшихся различий повторов.

## Визуальная проверка

Проверены реальные снимки итогового общего компонента на локальном сервере:

- [Студия, неподтверждённый разбор](implementation/studio-380-unconfirmed.png)
- [Зал, неподтверждённый разбор](implementation/room-380-unconfirmed.png)
- [Зал, подтверждённое имя](implementation/room-380-confirmed.png)
- [Зал, Hebrew RTL](implementation/room-380-hebrew.png)

Это automated Chromium acceptance, не проверка физического устройства или экранного диктора.

## Предрелизный preflight

Production /healthz: ok, DB/migrations ready. df: 4.3 GiB available, 89%, disk_warn=true.
Docker: 13 images / 11 active, 11 running containers, 4 active volumes; cache 2.686 GB.
Очистка не выполнялась. Требуется повторная проверка capacity/health при сборке и после переключения.

## Границы

Новых языковых результатов не генерировали; независимую языковую правильность всех строк не заявляем.
Архивная атрибуция остаётся атрибуцией, а не доказательством исторической генерации/редактуры.
Если старый общий кэш уже потерял различия, они восстанавливаются из исходного архива/опубликованного слоя.
Без такого источника разные значения не выдумываются и автоматически повторно не оплачиваются.
