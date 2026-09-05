# Verification matrix

## Автоматические контракты

| Область | Проверка | Статус |
|---|---|---|
| точный Pealim | парадигма только при совпавшей и не guarded identity | PASS |
| глаголы | INF-L + AP-ms/fs/mp/fp; missing не выводятся | PASS |
| другие POS | noun/adjective/preposition/invariant используют общий slot taxonomy | PASS |
| форма / headword / root | форма предложения видима первой; Pealim headword и корень раздельны; root-as-word запрещён | PASS |
| много текстов | shared reference контекст-независим; примеры text-scoped | PASS |
| аудио | dedup, concurrency 6, partial failure, без dead embeds | PASS |
| active recall | перевод свёрнут; есть listen/repeat/produce workflow | PASS |
| безопасный импорт | HTML и Markdown из пользовательского текста не исполняются и не ломают заметки | PASS |
| queue | все uncertain occurrences сохраняются в видимой очереди | PASS |
| SRS | review_log и srs_cards не читаются как состояние Obsidian и не меняются | PASS |
| ZIP | receipt count, ссылки, аудио, UUID body и path safety | PASS |

## Реальный пакет Кфар Аза

Источник локального прогона:
text-card-кфар-аза-2-544-573-learning.zip.

Снимок источника датирован раньше текущего состояния production и используется
только как масштабный структурный fixture.

- 545 фраз;
- 3 977 проанализированных вхождений;
- 1 090 text-scoped лексем;
- 813 общих Pealim reference-карточек;
- 186 групп проверки;
- 4/4 доступных в source ZIP аудиофайла;
- 2 138 файлов в материальном архиве;
- 25 672 836 байт после распаковки;
- 5 908 289 байт в ZIP;
- SHA-256 ZIP: `4937ce5e693d5f86c7ce67fbf28b7248fc995a620671c7c61290f4c949506351`;
- все внутренние ссылки и аудио-вложения разрешаются.

Проверенный локальный экземпляр:

    F:\УЧУ_ИВРИТ\УЧУ_ИВРИТ\linguistpro-obsidian-Кфар-Аза-2-544-573-premium-v3-2026-09-05.zip

Распакованная копия:

    F:\УЧУ_ИВРИТ\УЧУ_ИВРИТ\ТЕСТ-V3-FINAL-2026-09-05

## Выполненные gates

- `npm run audit:lexical-resolution` — PASS;
- `npm run smoke:i18n` — 233/233;
- `npm run smoke:lexical-resolution:browser` — PASS, RU, 380 px;
- `npm run smoke:lexical-resolution:reader` — PASS;
- `npm run smoke:conj` — parser 33/33, browser 17/17;
- `npm run smoke:conj:audit` — 175/175;
- `npm run smoke:conj:dict` — 7/7;
- `npm run audit:note-fields` — 0 hard violations;
- `obsidian-study-package-audit.js` — PASS для 2 138 файлов.

## Регрессия surface → headword → root

На том же полном source fixture после введения контракта:

- 1 090 лексем и 3 977 морфологических вхождений сохранены;
- 811 headword получены из точной Pealim identity;
- 226 получены из машинной леммы, допустимой для данного класса;
- 53 не названы начальной формой без достаточного доказательства;
- 415 вхождений в 255 группах видимы в очереди, включая 70 вхождений с новой
  причиной `headword_missing`, которые раньше могли выглядеть готовыми;
- `נִמְצָאִים` отображается как
  `נִמְצָאִים (לְהִמָּצֵא)`, а `מצא` остаётся только корнем;
- материальный архив: 2 207 файлов, 4/4 аудио, SHA-256
  `85f6b7d936884dae91702857e7ced03f19e76b245d8293f37f8cd1ed4749177a`;
- `obsidian-study-package-audit.js` — PASS.

Увеличение очереди с 345 до 415 на датированном fixture является ожидаемым
fail-closed результатом: это не новые ошибки анализа, а устранение слепой зоны,
где корень или неинфинитивная форма могли выдаваться за headword.

## Границы приёмки

- Windows Computer Use 2026-09-05 не подключился к native pipe (os error 2);
  автоматическая визуальная приёмка в Obsidian не заявляется.
- После production deploy требуется экспортировать свежий ZIP из карточки,
  проверить его audit-скриптом и выполнить owner smoke в Obsidian.
- Текущий source fixture содержит 345 unresolved occurrences и не является
  доказательством актуального production-счётчика.

## Production deployment recovery

Первый webhook для implementation commit `dd9c37f3` был принят, но сборка не
завершилась: корневой раздел достиг 100%, а Redis включил штатный
`stop-writes-on-bgsave-error`. Старый application container продолжал отдавать
здоровую версию 3.11.477.

Bounded recovery удалила только 3.171 GB неиспользуемого Docker build cache.
Контейнеры, volumes, пользовательские данные, активный image и rollback images
не удалялись. После очистки корневой раздел имел 2.4 GB свободного места (94%
used), Coolify вернулся в healthy, а authenticated Redis BGSAVE завершился с
`rdb_last_bgsave_status:ok`. Production PASS требует отдельного подтверждения
живой версии 3.11.478 и её конкретных ассетов после нового non-empty webhook.
