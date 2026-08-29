# PHYSICS-YEAR1-R13 — bilingual condition and print plan

Дата: 2026-08-30

Статус: `PRODUCTION_LIVE · READ_ONLY_ACCEPTED`

## Результат

Полный экран «Понять и решить» для каждой из 74 задач показывает перед
начальным объяснением два источниковых блока: каноническое условие на русском
и оригинал на иврите. Оба блока свёрнуты по умолчанию, чтобы не повторять
длинную таблицу, которую пользователь только что прочитал, и не отодвигать
низкопороговое объяснение. Печатная версия всегда содержит оба условия и все
остальные disclosure-разделы независимо от их экранного состояния.

## Источник данных и границы

- Нового хранилища условий нет. UI читает существующие `source.condition_ru`
  и `source.condition_he` из тех же 74 hash-verified
  `physics/year1-support/tasks/*.json`, которые обслуживают Agent Access.
- Исходный HTML использован как визуальная контрольная точка, но не как
  runtime-источник и не парсится браузером.
- Решения, edition №2, manifest, права, learner truth, `review_log` и Hermes
  output не изменяются.
- Ивритский текст всегда получает `lang="he"` и `dir="rtl"`; русская
  формулировка — `lang="ru"` и `dir="ltr"` независимо от языка chrome.

## Экранный контракт

Порядок остаётся answer-first:

1. краткий проверенный ответ;
2. «Условие задачи» с двумя закрытыми нативными `<details>`;
3. «Сначала поймём задачу»;
4. подсказка, экзаменационное решение и происхождение.

Каждый disclosure и кнопка печати имеют клавиатурную семантику, видимый
focus и мобильную цель не меньше 44 px. Новые строки существуют в RU/EN/HE.

## Печатный контракт

- Отдельная команда «Печать разбора» вызывает системный print dialog.
- Перед `window.print()` все `<details>` временно открываются; `afterprint`
  восстанавливает точное предыдущее состояние. Тот же prepare/restore
  подключён к `beforeprint`/`afterprint`, поэтому работает и системный
  `Ctrl+P` при открытом разборе.
- `@media print` изолирует разбор от chrome Зала, убирает overlay и кнопки,
  задаёт A4, поля, бумажную палитру, управляемые разрывы и колонтитулы
  `LinguistPro · Physics Year 1` + `page / pages`.
- Формулы, небольшие смысловые блоки и финальный ответ не разрываются внутри;
  для абзацев действуют `orphans`/`widows`.

## Ворота

1. 74/74 shards содержат непустые RU/HE условия, иврит проверяется по script range.
2. Source tests фиксируют оба блока, print handlers, A4 CSS и RU/EN/HE keys.
3. Изолированный browser smoke проверяет collapsed-by-default, RTL/lang,
   все disclosure открыты в момент печати и затем полностью восстановлены.
4. Реальный Chromium A4 PDF должен содержать условие RU, условие HE,
   beginner bridge, экзаменационное решение и provenance; все страницы
   проходят визуальный осмотр.
5. 1440, 380 RU и 380 HE RTL не имеют горизонтального overflow.
6. Version, module rev, locale rev, service-worker precache и server integrity
   manifest изменяются синхронно.

## Rollout и rollback

Rollout: `3.11.448`, allowlist commit → `main` → один устойчивый production
image → health/version/API/browser-приёмка. Rollback — предыдущий application
commit; edition, shards, DB и права не меняются.

Production rollout закрыт 2026-08-30: commit `8c4d1370`, успешный webhook
deploy, пять последовательных healthy-проб `3.11.448`, 74/74 read-only API
tasks и fresh-anonymous browser smoke. Существующий PWA-профиль также принят
после штатного пользовательского обновления с `3.11.447` на `3.11.448` без
очистки OPFS или данных.
