# 01 — Инвентарь: что реально работает

**Статус:** исследование, не решение · **Дата:** 2026-10-17 · **Исходный коммит:** `origin/main` `7dfd1369` (версия 3.11.785)
**Метки:** ФАКТ — проверено в коде, git или памяти проекта; ВЫВОД — следует из фактов; ПРЕДПОЛОЖЕНИЕ — не проверено; ПРОВЕРИТЬ — нужна внешняя проверка.

## Масштаб работы

- ФАКТ: проект начат 2025-12-07. С 2026-07-11 (июльская стратегия) в `main` ушло 1414 коммитов за 89 рабочих дней. Больше всего коммитов в областях `studio` (253), `room` (153), `ingest` (112), `agent-access` (72), `mediatheque` (26), `dictionary` (25), `worlds` (21).
- ФАКТ: `public/index.html` — 52 594 строки, `public/js/library-ui.js` — 15 442, `server.js` — 13 543. В `package.json` 270 smoke-скриптов, в `tests/` 346 файлов.
- ФАКТ: учеников на проде, кроме владельца, нет. Групповой корпус песен прошёл проверку доступа, но «active memberships: owner only» (`docs/planning/GROUP_SONG_CORPUS_P0_2026_07_23.md`, строки 106 и 129). Пилот с ульпаном отложен 2026-07-02 на неопределённый срок (память `project_strategic_plan_2026_05_29`).
- ВЫВОД: всё, что ниже отмечено «работает», проверено автотестами и владельцем на своём профиле. Ни одно из этого не проверено на внешнем ученике.

## Таблица возможностей

| Область | Что работает | Где в коде | Чем подтверждено |
|---|---|---|---|
| Студия: учебная таблица | Текст → строки с огласовкой, транслитом, переводом; длинные тексты по частям | `public/index.html` (inline), `public/js/table-chunks.js`, `db/premium/pipeline.js`, `db/premium/translit.js` | автотесты, владелец |
| Студия: импорт | Статья по ссылке, docx, фото/PDF (OCR Gemini), аудио/видео до 3 ч | `public/js/studio-import.js`, `ingest/urlExtract.js`, `ingest/docxExtract.js`, `ingest/geminiExtract.js`, `public/js/mp3-slice.js` | автотесты, live-smoke |
| Студия: YouTube | Распознавание речи по ссылке без скачивания | `public/js/youtube-asr.js`, `public/js/youtube-timing.js` | владелец; тайминг со своими дефектами (память `project_youtube_timing_probe_veto`) |
| Студия: локальное видео | Видео с субтитрами без LLM; локальный ASR/перевод через Companion | `public/js/subtitle-material-*.js`, `public/js/local-asr-client.js`, `public/js/local-mt-client.js`, `ai-local/` | владелец, RTX 3070 |
| Студия: огласовка | Dicta + второе мнение, правила невозможной огласовки | `ingest/niqqudSecondOpinion.js`, `public/js/niqqud-plausibility.js` | замер ~4% замен (память `project_niqqud_second_opinion`) |
| Студия: пересказ «под мой уровень» | Упрощённый пересказ текста LLM | `public/js/studio-retell.js`, `ingest/retell.js` | замеры 2026-07-28 |
| Зал: корпус | ~26K работ Бен-Иегуды, навигация, поиск, KWIC | `public/js/library-ui.js`, `public/js/corpus-*.js`, `public/data/benyehuda/` | автотесты, прод |
| Зал: морфология по тапу | Корень, биньян, часть речи, перевод с пометкой надёжности | `public/js/reader-morph.js`, `public/js/notes-autogen.js`, `public/js/reader-dicta.js` | гейт `smoke:reader-morph:audit` против Dicta (это не независимый эталон, см. 05) |
| Зал: i+1 | Рекомендация текстов по доле знакомых слов | `public/js/corpus-vocab.js` (`ZONE_LO: 0.70`, `ZONE_HI: 0.90`) | откалибровано на профиле владельца |
| Зал: подсказки с угасанием | Снятие огласовки и перевода с отменой | `public/js/scaffold-advisor.js` | владелец |
| Зал: медиа | Плеер, караоке, повтор сегмента | `public/js/media-host.js`, `public/js/studio-media-karaoke.js` | владелец |
| Словарь | «Мой словарь», единый ключ слова, спряжения из офлайн-набора Pealim | `public/js/dictionary-*.js`, `public/js/inflection-dict.js`, `public/data/inflection/pealim-infl-v12.json.gz` | слепая выборка: ~16% ложных ключей из Pealim/Dicta (память `project_dictionary_identity_audit`) |
| Память | FSRS-6, append-only `review_log`, отчёт об удержании, экспорт Anki | `public/js/fsrs-core.js`, `public/js/lemma-canon.js`, `public/js/retention-report.js`, `db/ankiExportRepo.js`, `lib/ankiApkg.js` | байт-паритет с ts-fsrs, гейты |
| ИИ-наставник | Объяснения, вопросы на понимание, ролевая игра, письмо с целями, план дня, следующий текст | `agent/explainer.js`, `agent/roleplay.js`, `agent/writing.js`, `agent/planner.js`, `agent/nextText.js`, `agent/tutor/`, `public/js/studio-agent.js`, `public/js/mentor-home.js` | владелец («тестирование пройдено») |
| Каналы | Telegram-бот, Mini App, доступ для внешних агентов (OAuth MCP) | `agent/telegram/`, `public/miniapp.html`, `agent/access/` | владелец |
| Речь | Экспериментальная оценка произношения (локально, по opt-in); голосовой черновик для ролевой игры | `public/pronunciation.html`, `public/js/pronunciation-lab.js`, `c1_companion/`, `public/js/voice-draft.js` | только владелец; MMS_FA под CC BY-NC |
| Исследования | Режим исследования по согласию, кабинет учителя с когортами и k-анонимностью, входной тест (20 вопросов, модель Раша) | `public/js/research.js`, `research/storage.js`, `public/teacher.html`, `public/js/teacher.js`, `public/quiz/ulpan_diagnostic_v1.json` | тест: сложности заданы экспертной оценкой ИИ, внешняя проверка учителем «pending» с мая (`docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md`) |
| Группы | Закрытый корпус для группы, приглашения | `db/groupCorpusRepo.js`, `db/groupInviteRepo.js`, `migrations/056_group_song_corpus_p0.sql` | участник — только владелец |
| Игровой слой | Скины «Миров» (выборы, Суккот) | `public/js/world-*.js` | владелец |
| Ключи и деньги | BYOK (свой ключ ученика), учёт вызовов LLM | `ingest/geminiKey.js`, `llm_usage_ledger` | серверного ключа Gemini нет (память `reference_key_architecture`) |

## Что уже есть, хотя кажется, что нет

Эти пункты меняют выводы разделов 02–05.

1. **Кабинет учителя** (`public/teacher.html`) — это исследовательская панель: агрегаты когорты, корреляции, выгрузка CSV. Учебного инструмента в нём нет: учитель не может выдать материал, увидеть трудные слова класса или дать обратную связь.
2. **Входной тест** с моделью Раша существует. Сложности заданий заданы суждением, а не оценены по ответам учеников. Внешняя проверка учителем ульпана ждёт с 2026-05-15.
3. **Групповой корпус и приглашения** — готовый фундамент для режима класса.
4. **Пересказ «под мой уровень»** — готовый механизм для лёгкой современной библиотеки, если добавить редактора-человека.
5. **Предрегистрация OSF** (DOI 10.17605/OSF.IO/ZDV9J) и план исследования в ульпане (`docs/WRITE_UP_BRIEF.md`) уже есть. Дизайн: одна группа, корреляции, без контроля.

## Лицензионная база

- ФАКТ: в 2026-05-10 владелец объявил продукт некоммерческим, и это открыло AGPL-компоненты (`docs/PREMIUM_NOTES_PLAN_v3_2.md`, строка 303; `docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`, строка 249).
- ФАКТ: от некоммерческого статуса зависят HebMorph (AGPL), некоммерческий модуль TTS (`docs/TTS_HEBREW_DECISION.md`) и MMS_FA (CC BY-NC 4.0) в C1. README C1 прямо говорит: «Monetization requires disabling C1-X or replacing/relicensing MMS_FA».
- ФАКТ: офлайн-словарь спряжений (9279 парадигм) собран скрейпингом Pealim. На pealim.com не найдено условий использования или лицензии (проверено 2026-10-17).
- ФАКТ: коммерческие условия API Dicta Nakdan в репозитории отмечены как непроверенные (`docs/research/hebrew-nlp-resources/2026-08-04/raw/agent-b-l4-verification.md`, строка 132).
- ФАКТ: DictaBERT-модели и `shoshan` открыты для коммерческого использования (CC BY 4.0 / MIT) — по тем же документам.
- ВЫВОД: любой коммерческий сценарий начинается с лицензионной очистки. Подробности — в 02 (Б1) и 07 (CR-2).
