# Масштабирование публичной Медиатеки

Дата: 2026-09-22. База: `a7f64511`, актуальный `origin/main` (0/0), чистый checkout перед началом. Ветка: `feat/mediatheque-editorial-scale-2026-09-22`. Статус: локальная реализация проверена, commit 8aa2072f отправлен в origin/feat/mediatheque-editorial-scale-2026-09-22; production не изменён.

## Заказанный результат

1. Структура публичных тем и подборок на основании исследования владельца и готовых материалов Telegram.
2. Редакторское добавление учебного архива с YouTube либо вложенным/отдельным медиа; преимущественно без хранения видео на сервере.
3. Редизайн навигации и редакторской работы для растущего каталога.

## Источники и установленные факты

- Исследование владельца: `C:/Users/lletp/Downloads/500 каналов. Продуктовое исследование/youtube_hebrew_media_library_research_bundle_2026-09-14/`. Прочитан основной Markdown-отчёт; в нём 500 кандидатов, 66 предварительных Hebrew-first, Recommended-50. Рейтинг страны не равен проверенному языковому каталогу. Метрики относятся к 14 сентября.
- Telegram: https://web.telegram.org/a/#-5547276758, чтение открытой вкладки, от сообщения создания группы 6 августа до материалов 21 сентября. Видны учебные ZIP, `.lpmedia.zip`, отдельные MP4, YouTube URL и описания. Архивы пока не проверены изнутри.
- Повторы: «В сокрытии», эпизод 4 — Google и Gemini; «Входящий звонок», эпизод 1 — повторная отправка; «Нова» — несколько архивов. Есть явное «Гугл транслейт. Переделать».
- Несоответствие: вложения «Безумный Юг-1/2/3» ссылаются на `7.10 - גרסת יו״ש`; не смешивать их с `הדרום הפרוע`. Короткий `list=PLACmvHcJM5hc` позднее подтверждён официальной страницей KAN11; исходное подозрение на обрезку снято.
- Канон организации: `mediatheque-core.js`, `publicationRepo.js`, `ROOM_MEDIATHEQUE_IMPLEMENTATION_2026_09_12.md`. Публичные ссылки относятся к опубликованному снимку; личные материалы, provenance и learner-state не изменять.
- Публичный редактор меняет структуру с CAS/undo/preview/publish, но не импортирует архивы. Центр публикаций использует MY_TEXTS/GROUP_CORPUS и специальный preset для песен; его нельзя автоматически применять к новым видео.

## Решение

- Темы поддерживают каналы, тематические рубрики и вложенные темы. Названия каналов сохраняются на иврите.
- Подборка содержит упорядоченные выпуски серии/сезона/плейлиста либо сквозную редакционную выборку. Нужна явная связь подборки с темой, включая пустой редакторский черновик.
- Исследовательский кандидат не является опубликованным учебным материалом. Публичная витрина показывает доступные учебные выпуски; редактор видит заготовки и очередь.
- Единица дедупликации: source video ID + идентичность учебного архива, а не имя ZIP. Не назначать уровень и длительность по догадке.
- Основной сценарий: архив → проверка содержимого/источника → YouTube или медиа → тема/подборка → предпросмотр → публикация существующим каноническим писателем. Сохранять оригинал и не запускать платную генерацию заново.

## Дизайн

Существующая палитра: фон `#f6f8fc`, поверхность `#ffffff`, текст `#162438`, вторичный `#536479`, акцент `#2358a8`, границы `#dce3ee`. Системные шрифты с ивритом. Визуальный акцент — реальные обложки выпусков. Страница канала объединяет описание, серии и выпуски; поиск и фильтры остаются доступными. Редактор получает отдельное явное действие добавления и предсказуемую последовательность шагов. Проверить RU/EN/HE, 380px, промежуточную ширину, desktop, dark mode и клавиатуру.

## Этапы и проверки

- [x] Ветка/чистота/актуальность main, канон и первичное чтение источников.
- [x] Реестр каналов, серий и готовых выпусков с происхождением и неопределённостями.
- [x] Проверка выбранных YouTube источников и четырёх исходных плейлистов; остальные подборки обозначены редакционными.
- [x] Структура и навигация канал → подборки → выпуски.
- [x] Редакторский импорт и оба пути воспроизведения, сохранение provenance.
- [x] Изолированные domain/API/browser проверки, отсутствие записи в owner learner-state.
- [x] Целевой commit/push: 8aa2072f, origin/feat/mediatheque-editorial-scale-2026-09-22. Production evidence отдельно от локальной.

Локальная реализация и проверки завершены. Production и материалы владельца пока не изменены.

## Прогресс реализации

- OEmbed: 55/55 ссылок, 11 фактических каналов, 22 подборки. Четыре playlist ID подтверждены страницами KAN11/C14; для остальных используются video ID и редакторский порядок.
- Сохранены 500 исследовательских кандидатов и Recommended-50; редакторский поиск, добавление темы, скрытие пустых заготовок для читателя.
- Новый owner-only импорт LPLP/lpmedia, проверка хешей/источника, YouTube без копии видео, вложенное или отдельное медиа, раздельные права stream/download, канонический писатель публикаций.
- Реальные локальные архивы прочитаны без изменения: «День…-1» (679 строк, y5yyuy19TL8), «Безумный Юг-1» (270 строк, источник YouTube отсутствует, фактический заголовок 7.10), «Пятилетний план-3» (225 строк, yAeNOD8Vfzc). Это проверка архива, не проигрывания и не права публикации.
- Итог: 109/109 целевых unit/domain/shell/media-host проверок, 233/233 i18n. Новый browser flow проверяет RU/EN/HE × 380/820/1366, dark/focus, гостевой доступ, защиту загрузок, поиск исследования, вторую редакцию канала, MP4 playback и HTTP 206 ranges.
- Общий browser smoke PASS: исправлена версия DB в runner и ожидание отложенной перерисовки после закрытия второй вкладки. Офлайн/SW update и сохранность review_log проходят; 5000 материалов: загрузка 1340 мс, поиск 218 мс, DOM ограничен. Первый offline-прогон пересёкся с правкой версий файлов и не учитывается как acceptance; итоговый прогон выполнялся при стабильных файлах.
- Кеши/целостность: mediatheque UI17/CSS5, locales242, media-host576, public-adapter486, app611; новые зависимости включены в precache/integrity.

Следующий этап: production-выкладка и применение заготовки публичной структуры. Реальные архивы не публиковались массово: варианты Google/Gemini и помеченные «переделать» требуют редакторского выбора. Опубликованные версии/owner-live/device/AT в текущем локальном evidence не заявлены.

Итоговый publisher-browser: 33 PASS; regression-browser: 99 PASS; unit/domain/shell: 109 PASS; i18n: 233 PASS. Отчёт и сценарий редактора: `docs/research/mediatheque-editorial/2026-09-22/EDITORIAL_DECISIONS.md`.


## Owner UI audit — 2026-09-22, follow-up

Production 3.11.611: reproduced 211 text-only items, hidden empty topics/collections despite sidebar links. User clarified that published channel/series scaffolding must remain visible and text-only exercise/song corpora must stay outside Mediatheque.

- [x] Owner Chrome: actual ZIP + YouTube passed verification (270 rows); published «Пятилетний план-1» to C14 / תוכנית חומש through both UI review steps. Home settings saved with existing values; no learner actions.
- [x] Fix public catalogue eligibility (media metadata only), leave Room publication and corpus rights intact.
- [x] Expose published empty topics/collections; distinguish not-yet-published episodes from search mismatch.
- [x] Unit/domain: 109 passed initially; release-pin test updated and passed 7/7. i18n 233/233.
- [x] Publisher browser: 39/39; responsive screenshots reviewed.
- [x] Fix rapid Reader return race: route established before visible reader; affected shell/Room tests 41/41.
- [x] Broad Mediatheque regression: 99/99 after the return fix, including offline/SW/5000-item library.
- [ ] Deploy approved fix; verify live assets, catalogue, Room corpus preservation and owner navigation.

This supersedes the earlier decision to hide published empty scaffolding. Unpublished drafts remain private.
