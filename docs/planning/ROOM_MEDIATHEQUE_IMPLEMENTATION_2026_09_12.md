# Медиатека — реализация выбранного гибрида

Дата: 2026-09-12. Статус: LOCAL PASS; production deployment and live Kapture acceptance in progress. Пользователь утвердил гибрид и поручил начать реализацию, включая редакторскую витрину, гибкий каталог и конструктор представлений.
Исходный commit: a58dbcfbf49ec062f04159dbfdaa583eccab87d4. Изолированный checkout: `E:/projects/tts-room-mediatheque`, ветка `feat/room-mediatheque-2026-09-12`.
Этот файл — вручную поддерживаемый план и журнал проверок; исходная концепция: `ROOM_MEDIA_LIBRARY_OPTIONS_2026_09_12.md`. Команды воспроизведения проверок будут записаны ниже. Runtime и owner-device evidence разделяются.

## Контракт

- Отдельная `mediatheque.html` с переходом из Зала. Два пространства, четыре раздела: главная, каталог, темы, подборки. «Организовать» раскрывает редактирование; публичный режим редактора только владельцу.
- Категории (дерево), включения материалов (многие-ко-многим), подборки (порядок), сохранённые представления (фильтры/сортировка/вид) — организационные данные. Сами учебные материалы, их источники и learner-state остаются в существующих хранилищах.
- Личная структура хранится атомарным документом с revision/CAS в новой OPFS-таблице, с отменой и отдельным экспортом/восстановлением структуры. Ссылки используют text_key или идентичность публичной работы/снимка. Синхронизация структуры не обещается до отдельной реализации; интерфейс обозначает хранение в этом браузере.
- Публичная структура: черновик → предпросмотр → неизменяемая редакция → текущий указатель. Все записи через существующий publicationRepo и его очередь/idempotency; никакого второго писателя публичных материалов. Только общедоступные ссылки, действующая публичная доступность проверяется при публикации и чтении.
- Перенос/переименование не меняет ID; удаление категории сохраняет материалы; явный выбор переноса детей; объединение устраняет повторы. Недоступные ссылки сохраняются в личной структуре и объясняются, а не превращаются в потерянные данные.
- Массовое распределение, доступная перестановка (drag-and-drop плюс кнопки), шаблон тем по явному действию; ручное закрепление подборок и настройка редакторской главной. Сохранённые представления работают детерминированно без LLM.
- Поиск по названиям материалов/категорий/подборок и метаданным, включая огласовочно-независимый иврит. Поиск внутри расшифровок и методические маршруты не входят в этот этап.

## Визуальное решение

Тезис: спокойная современная учебная библиотека, где обложки реальных видео создают визуальный акцент, а читаемая типографика и свободное пространство держат структуру.
Палитра: светлая поверхность #f6f8fc, белый #ffffff, основной текст #162438, вторичный #536479, акцент #2358a8, разделитель #dce3ee; тёмная тема наследует системный выбор приложения. Шрифты — существующий системный стек с полноценным ивритом, без внешней загрузки.
Главная: один редакторский акцент, продолжение, закреплённые подборки, новые материалы, темы. Каталог: строка поиска, постепенное раскрытие фильтров, список/сетка. Редактор: отдельная панель, основное содержимое остаётся ориентиром.
Движение: открытие панели, раскрытие ветки, подсветка результата операции; reduced-motion отключает переходы. На 380px нет обязательного перетаскивания или горизонтального скролла.
Проверка против brief: пользователь явно выбрал карточки с обложками, поэтому сетка используется как вид материалов; служебные области оформляются простой композицией без мозаики карточек.

## Роли и гейты

R3/R12: единые ссылки, CAS, очередь публикации. R4/R6: mobile/RTL, организация большого фонда. R2/R8/R17: продолжение не означает усвоение, B9 не размораживается. R9/R11: неизвестная длительность/уровень/доступность не подменяется выдуманным значением. R13–R15: отмена, экспорт, изоляция, приватное не публикуется. R5/R16: без LLM, восстановление после ошибок, видео онлайн обозначено честно. Языковое содержимое R1/R7/R10 не изменяется.

План проверок: red unit на дерево/циклы/дедуп/переименование/удаление/фильтры; SQLite-тесты CAS/отмена/public snapshots/idempotency/owner-only/приватность; browser e2e реальная OPFS + изолированные public fixtures, перезапуск и экспорт, RU/EN/HE, 380px и desktop, открытие существующего reader, нулевые контекстные page errors; релевантные регрессии и test:api-smoke. Никаких операций с личными материалами владельца.

## Выполнение

- Recon: актуальный main сверён; существующие public reader, publicationRepo, OPFS proxy и discovery изучены. Основной dirty checkout сохранён.
- Реализованы runtime, OPFS migration 053, server migration 067, owner publication workflow and all three locales. Release: 3.11.520.
- `npm test`: 1563/1563 PASS. Windows checkout CRLF differed from the canonical LF bytes inside the unchanged iPhone helper archive; byte parity with `origin/main` was verified, files normalized for the test run and restored afterward. No helper changes included.
- `npm run test:api-smoke`: PASS. `npm run smoke:reader-parity`: PASS (37 leaf checks + 4 builder/golden cases).
- `node scripts/premium/mediatheque-browser-smoke.cjs`: PASS, real OPFS in isolated browser profiles and real local publication API. Includes multi-category identity, merge/undo, JSON restore, saved-view reloads, 36-card paging, RU/EN/HE 380px, reader navigation, exact unchanged review_log, owner/anonymous/CSRF boundaries, draft isolation, immutable publication, withdrawn-reference honesty, offline cold reload and offline edits.
- Visual review caught and corrected dark body background inheritance. Exact computed body background/text checked after fix. Screenshot refresh and production evidence follow deployment.
- User explicitly authorized deployment to main/production and live Kapture MCP testing on 2026-09-12. Physical iPhone/VoiceOver acceptance remains separate.

## Production observations and follow-up 3.11.521

- 3.11.520 / `52673149` deployed from main; live no-cache client config and Mediatheque shell integrity confirmed.
- Kapture MCP: entry from Room, existing owner OPFS library, video filter (28 matching materials at observation), cards/list and added-time sort, temporary category create/undo, original material reader, real YouTube playback start/stop — completed.
- Public runtime catalog: 211 readable published entries at observation. The current published items carry text/TTS data; no original-video identity was inferred from the presence of TTS assets.
- Kapture owner draft: temporary category → preview → publication confirmation → cancel → undo. Anonymous/public API never exposed the draft. Temporary test category was not published.
- Live finding: known YouTube videos without stored channel author showed “source unspecified”. Projection now retains caption-channel authors where present and uses factual “YouTube” platform fallback when the channel is unknown.
- Live finding: permitted YouTube playback generated report-only CSP frame violations. The report-only policy now names only the existing YouTube API/frame/thumbnail hosts; enforced standalone-page policies remain unchanged.
- Follow-up verification: metadata projection test, 47 relevant domain/release checks and API smoke PASS. Production re-verification follows the 3.11.521 rollout.

## Return continuity follow-up 3.11.522

Live navigation exposed a Room-only back button after a Mediatheque drill-down. Material links now carry an allowlisted same-origin return URL. The reader flushes the existing progress writer and tears down playback before returning to the precise space/search/filter/view/page. Pagination itself now survives reload. No arbitrary return host or path is accepted.

Verification: 73 relevant domain/release checks, API smoke and complete isolated browser scenario PASS, including a new actual reader-back assertion for exact personal search/list context and a second-page reload assertion.
