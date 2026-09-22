# Product Pulse — cross-surface material coverage

Дата: 2026-09-22. База анализа: `e88f121772f59c277abc5f9ff3647ac5febaae5e` / 3.11.606.
Статус: реализовано для 3.11.608; production и owner-live gates выполняются.

## Подтверждённый разрыв

- `material_open` отправляется только после успешного `readerCore.openText` в Читальном зале.
- Успешные открытия сохранённого материала в Classic/IDE Студии не попадают в Product Pulse.
- Переход Медиатека → Читальный зал заканчивается `surface=reading_room`; маршрут через Медиатеку теряется.
- Бен-Иегуда, Мои тексты, public/group песни и публичные задачники схлопываются в одну поверхность.
- `study_started`/`study_engaged` имеют единицу «один документ браузера», поэтому их нельзя честно
  использовать как per-material вовлечение при нескольких открытиях без навигации.

Следствие: 3.11.606 честно измеряет общий first-action/engagement по странице и открытия материалов
в Зале, но не отвечает на вопрос «в какой поверхности, через какой маршрут и в каком корпусе
пользователь открывает материал и достигает вовлечения».

## Решение без дрейфа

Contract revision 1.2 остаётся на wire schema 2: изменение аддитивное и не отклоняет ни один
валидный payload revision 1.1.

Новые закрытые свойства:

- `entry_point`: `studio_library`, `reading_room`, `mediatheque`;
- `material_collection`: `my_texts`, `ben_yehuda`, `materials_science_pb2`,
  `public_study_songs`, `physics_year1`, `group_study_songs`, `other_public_corpus`,
  `other_group_corpus`, `unknown`;
- `material_media`: `none`, `audio`, `video`, `audio_video`, `unknown`.

Новые события:

- `material_started`: первое доверенное учебное действие после конкретного подтверждённого
  `material_open`;
- `material_engaged`: 30 секунд видимого сфокусированного активного времени в том же материальном
  эпизоде с idle cutoff 15 секунд.

Существующие `study_started`/`study_engaged` не переопределяются и остаются общим one-per-document
funnel. Это исключает скрытую смену единицы измерения. Один обработчик действия обновляет оба
явно различённых уровня, а не дублирующие обработчики одного факта.

## Канонические точки и классификация

- Студия Classic: только после успешной загрузки строк, отрисовки таблицы и активизации карточки.
- Студия IDE: только после успешной загрузки строк и `v3IdeRenderTable`.
- Читальный зал: существующий success-point `readerCore.openText`, непустые строки, актуальный epoch.
- Медиатека не объявляется учебной поверхностью: `from=mediatheque` становится только
  `entry_point`, после подтверждённого открытия в Зале.
- Корпус выводится только из уже проверенного `source_meta_json` и отображается в закрытый enum;
  незнакомые public/group значения становятся `other_*`, сырые slug/id не передаются.
- Медиа выводится только в enum из наличия row audio / media passport / video source; имена,
  asset keys, URL и video ID не передаются.

## Панель

Добавить «Работа с материалами»:

- строки по фактической поверхности, входному маршруту и корпусу;
- столбцы `material_open`, `material_started`, `material_engaged` и engaged/open;
- отдельное распределение открытий по `material_media`;
- для каждой строки source/state/UTC/freshness/denominator;
- покрытие старых событий без новых optional-свойств отмечать `partial`, не приписывать их
  категории `unknown`.

## Gates

- manifest/validator/UI parity и privacy rejection для новых свойств;
- Studio Classic + IDE и Room/Mediatheque success/failure integration points;
- несколько материалов в одном документе: независимые material started/engaged;
- скрытая вкладка/idle/offline не создают вовлечение или retry;
- deterministic Umami breakdown, zero/unavailable/partial и bounded concurrency;
- UI 380/intermediate/desktop, keyboard/focus/contrast;
- version/SW/integrity и обязательный release subset перед публикацией.

## Automated evidence до публикации

- Product Pulse unit/contract/privacy/integration: 26/26 PASS, включая network-only
  границу owner-shell в Service Worker.
- Полный `npm test`: 1875/1875 PASS.
- Product Pulse browser/API smoke: owner/non-owner/anonymous/loopback-preview,
  manifest parity, zero/partial/outage, 380/768/1440, keyboard focus и contrast — PASS.
- i18n: 233/233; learner ingest: 24/24; FSRS: 140/140; memory canon: 90/90 — PASS.
- API smoke и ingest smoke — PASS; `git diff --check` — PASS.
- Production deploy, served integrity и owner-live read-only остаются post-push gates.

Owner-live на промежуточном 3.11.607 обнаружил старый `/pulse.html` из runtime-cache
Service Worker при уже новом API/JS. Данные не раскрылись, но shell был несогласован с
контрактом. Релиз 3.11.608 делает `/pulse.html` строго network-only до server auth и
инвалидирует старые versioned caches; это обязательный release blocker, а не косметика.
