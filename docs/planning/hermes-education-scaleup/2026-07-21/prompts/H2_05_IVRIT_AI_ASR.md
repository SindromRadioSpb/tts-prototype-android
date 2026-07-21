# H2_05 — Слайс H2.5: ivrit.ai ASR MCP (локальный, Hermes-side)

> **BLOCKED UNTIL H1 CLOSURE + owner go (Д5).** Проверь STATUS.md: G-H2-START. Иначе СТОП.

## Роль и цель
Инженер-исполнитель одного слайса. Цель: локальный ASR-сервис на Hermes-хосте — faster-whisper
с CT2-весами `ivrit-ai/whisper-large-v3-turbo` + FastMCP-обёртка `transcribe_audio`.
Контракт — 04 §5. Кода LinguistPro в слайсе НЕТ.

## Рабочие каталоги
Hermes-хост: `G:\HERMES_AGENT` (не git); voice-inbox: `G:\HERMES_AGENT\voice-inbox\`;
канон-исходники: репо `docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/h2.5/`.

## Обязательное чтение
Пакет: `README.md`, `STATUS.md`, `04_HORIZON_2_ARCHITECTURE_AND_CONTRACTS.md` (§5),
`09_COST_CAPACITY_OPERATIONS.md` (строка ASR), `11_HANDOFF_TO_CODEX_5_6_SOL.md`;
research `03_TECH_ENABLERS_MCP.md` §1.1–1.2.

## Инварианты
Выход = ГИПОТЕЗА (`confidence_note:"ASR_HYPOTHESIS_NOT_GROUND_TRUTH"` в каждом ответе);
произносительный скоринг НЕ вычисляется и не имитируется (H3-чартер C1); path-валидация: только
файлы внутри voice-inbox, никаких произвольных путей; raw audio удаляется после транскрипции
(Д7); облачный STT-fallback ЗАПРЕЩЁН (только отдельным owner-решением); лог обёртки — факты
транскрипций без контента.

## Scope / Non-goals
Scope: модель на диск + faster-whisper + FastMCP-обёртка + config.yaml + замер производительности
+ smoke + канон + STATUS.
Non-goals: диаризация; realtime; выравнивание по фонемам; интеграция в LinguistPro; voice-петля
целиком (следующий слайс H2_06).

## Предпроверки
1. STATUS: H2.5 PLANNED. Диск: ~3 ГБ. Python-окружение хоста.
2. Живость: актуальные CT2-веса на HF (`ivrit-ai/whisper-large-v3-turbo-ct2` или актуальное имя —
   проверь), faster-whisper ставится.
3. CPU-бюджет: хост-машина владельца — зафиксируй фактические ядра/RAM до замера.

## Пошаговая работа
1. Установи faster-whisper + скачай CT2-веса (int8) в `G:\HERMES_AGENT\models\` (манифест:
   имя, ревизия HF, sha256/размер — в канон).
2. FastMCP-обёртка `transcribe_audio{file_path, language:"he"}` по контракту 04 §5: text +
   segments(start_s,end_s,text,avg_logprob) + confidence_note + model_version; path-валидация
   voice-inbox; после успешной транскрипции — удаление исходного файла; typed-ошибки
   (пустой/битый файл, путь вне inbox).
3. Config.yaml → restart контейнеров → новая сессия (listChanged:false); проверь достижимость
   (обёртка на хосте vs агент в контейнере — рабочую топологию зафиксируй, как в H1.5).
4. **Замер**: 3 записи (30с чистая; 2мин обычная; 30с шумная) → фактор реального времени на CPU,
   в отчёт и в 09-строку (обнови таблицу 09 фактом).
5. Smoke (транскрипты в `hermes-side/h2.5/ACCEPTANCE_TRANSCRIPTS.md`): чистая he-запись →
   разумный текст+сегменты; шумная → низкие logprob-сегменты помечаемы; пустой файл → ошибка;
   путь вне inbox → отказ; файл удалён после обработки (проверить ls).
6. Канон: `hermes-side/h2.5/` — исходник обёртки, MODELS_MANIFEST.md, README (установка/замер/
   проверка/откат).

## Acceptance
Smoke 5/5; замер зафиксирован; канон полон; STATUS.

## Owner-live
Владелец наговаривает 1 голосовое → транскрипт читаем; ошибки ASR видимы как гипотезы;
вердикт в STATUS.

## Rollback
Убрать секцию config.yaml + restart; модель на диске можно удалить (манифест восстановит).

## Отчёт
По 11 §4 + фактор реального времени + рабочая топология (хост/контейнер).
