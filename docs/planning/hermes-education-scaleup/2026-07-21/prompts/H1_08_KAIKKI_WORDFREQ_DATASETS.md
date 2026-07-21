# H1_08 — Слайс H1.7: kaikki + wordfreq локальные датасеты

## Роль и цель
Инженер-исполнитель одного слайса. Цель: офлайн-словарь kaikki.org Hebrew (wiktextract JSONL,
~52 МБ, CC BY-SA) + частотники wordfreq на диске Hermes-хоста, с lookup-доступом для агента.

## Рабочие каталоги
Репо-канон: `E:\projects\tts-prototype-android`; датасеты: `G:\HERMES_AGENT\datasets\`
(workspace-маунт, виден агенту как /workspace/datasets).

## Обязательное чтение
Пакет: `README.md`, `STATUS.md`, `03_HORIZON_1_EXECUTION_DESIGN.md` (H1.7 + §Общее),
`11_HANDOFF_TO_CODEX_5_6_SOL.md`; research `03_TECH_ENABLERS_MCP.md` §3.3.

## Инварианты
kaikki = справка «по Викисловарю», НЕ канон морфологии (канон — LinguistPro/Pealim); конфликт
данных агент озвучивает, не разрешает сам (правило 12 политики). Датасеты в git НЕ кладутся —
только манифест (URL, дата, sha256, размер). Лицензия CC BY-SA — атрибуция «по Викисловарю»
в ответах агента её покрывает.

## Scope / Non-goals
Scope: скачивание + индекс + lookup-доступ (рекомендация: отдельный мини-FastMCP с двумя
инструментами `kaikki_lookup{lemma}` и `word_frequency{words[]}`, либо расширение обёртки H1.6 —
выбери по факту и зафиксируй) + манифест + smoke + STATUS.
Non-goals: Hebrew WordNet/MILA (нестабильны, non-commercial); полнотекстовые корпуса; регулярное
автообновление (вручную, ≤1/квартал).

## Предпроверки
1. HEAD/версия; STATUS: H1.0 CLOSED, H1.7 PLANNED; ~1 ГБ диска на G:.
2. Живость источников: kaikki.org/dictionary/Hebrew (актуальный URL JSONL) и pip wordfreq.

## Пошаговая работа
1. Скачай kaikki Hebrew JSONL в `G:\HERMES_AGENT\datasets\kaikki\`; посчитай sha256; строк/размер.
2. Индекс по лемме: замерь холодный полный скан JSONL; если >2s — построй sqlite-индекс
   (lemma → offset/запись); решение по замеру зафиксируй.
3. `pip install wordfreq` в окружение lookup-сервера; проверь he-поддержку.
4. Lookup-доступ агенту (mini-MCP или расширение H1.6-обёртки): `kaikki_lookup{lemma}` →
   {senses, forms, pron?, etymology?, source:"WIKTIONARY_VIA_KAIKKI", not_found?};
   `word_frequency{words[] ≤20}` → per-word zipf + ранг-комментарий. Config.yaml → restart →
   новая сессия.
5. Манифест-канон: `hermes-side/h1.7/DATASETS_MANIFEST.md` (URL, дата снапшота, sha256, размер,
   строк, процедура обновления) + `README.md` (установка/проверка/откат) + исходник mini-MCP
   (если отдельный).
6. Smoke (транскрипты в `hermes-side/h1.7/ACCEPTANCE_TRANSCRIPTS.md`):
   - A: частое слово (למד) — статья найдена, агент атрибутирует «по Викисловарю»;
   - B: редкая флексия/опечатка — честное not_found/деградация без выдумки;
   - C: частоты 5 слов из due-списка владельца — адекватные zipf-значения, агент интерпретирует
     («частое/редкое») без абсурда.

## Acceptance
3/3 smoke; lookup работает офлайн (выключи сеть на проверку A); манифест полон.

## Owner-live
1 сессия приоритизации: «какие 20 слов из моего плейлиста/текста учить первыми» — агент сочетает
частоты + kaikki-глоссы; вердикт в STATUS.

## Rollback
Убрать секцию config.yaml + restart; каталог datasets можно удалить (восстановим по манифесту).

## Документация, коммит, отчёт
hermes-side/h1.7/ + STATUS; коммит `docs(hermes-scaleup): H1.7 kaikki+wordfreq datasets`; push;
отчёт по 11 §4.
