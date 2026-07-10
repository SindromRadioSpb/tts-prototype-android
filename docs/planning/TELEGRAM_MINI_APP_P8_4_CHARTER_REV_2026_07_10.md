# CLG-P8.4 — Training Charter Revision + write-flow staging (OWNER DECISION)

**Date:** 2026-07-10 · **Status:** owner-approved charter revision → staged specs (код по слайсам, «не смешивать всё в один diff») · **Parents:** `TELEGRAM_MINI_APP_P8_RECON_2026_07_09.md` (§0/§12), `TELEGRAM_MINI_APP_P8_3_SPEC_2026_07_10.md` (+§9 адъюдикация)
**Контекст решения:** P8.1–P8.3 owner-live; §2.3-замер: 84% due-пула покрыто production-модальностями — ситуация отличается от ранней критики §M8 («ухудшенная копия тренажёра»). Скриншот-сравнение с ПК-тренажёром 2026-07-10.

---

## §1 OWNER DECISION — P8 training charter revision (2026-07-10, дословно по пунктам)

1. **Mini App = полноценный клиент ежедневных тренировок**: пользователь может выполнить всю due-сессию внутри Telegram.
2. **Основной CTA — «Умная тренировка»**: серверный deterministic selector выбирает модальность и объясняет выбор.
3. **Второй полноценный путь — «Выбрать режим»**: Контекст / Аудио / RU→HE / Диктант. Пользователь выбирает МОДАЛЬНОСТЬ, сервер выбирает только eligible due-items. Ручной выбор фиксируется как `selection_origin='manual'` и НЕ обходит grader, challenge-binding, cooldown, evidence_scope, review_log.
4. **Browser остаётся основной средой** для Студии, длинного чтения, импорта, морфологии, расширенного управления. Telegram автономен для практики, но не копирует весь браузер.
5. **Cloze получает tap-to-play полного предложения** как явную подсказку, без autoplay. Прослушивание фиксируется как `hint_used='sentence_audio'`; assisted-успех не эквивалентен самостоятельному cloze.
6. **Отдельная рецептивная модальность «Аудио»** (listen): full-sentence audio + RU gloss/translation + выбор (MC/tiles/typed). Это НЕ диктант — отдельный channel/evidence-семантика.
7. **Форматы ввода: MC → tiles → keyboard.** Тайловый ввод приоритетен для мобильного UX; свободный ввод остаётся строгим вариантом.
8. **Реализация по слайсам**: сначала канонический write-flow **P8.4a**, затем manual mode, Аудио и настройки. Не смешивать в один diff.

**Формула:** умный наставник по умолчанию + полная пользовательская свобода по запросу + единый серверный канон и честный provenance. «Пользователь выбирает, что хочет тренировать. Система решает, какие слова честно подходят для этого режима.»

**Разделение продукта:** Telegram = ежедневное повторение · умная микро-сессия · ручной выбор режима · план/объяснения · прогресс дня · быстрый возврат по нуджу. Browser = чтение · Студия · импорт · морфология · управление словарём · длинные сессии.

**UI-набросок (owner):** Home: due-счётчик → [Продолжить умную тренировку] → «Выбрать режим: [📖 Контекст] [🎧 Аудио] [🔤 RU→HE] [✍️ Диктант]» → «Сегодня 6/10». Внутри тренировки: режим · n/N · компактная «Сменить режим» (МЕЖДУ карточками, не во время начатого challenge) · упражнение · подсказка · ответ · «Не знаю».

## §2 Manual eligibility contract (P8.4b)

Пользовательский выбор = МОДАЛЬНОСТЬ, никогда item. Сервер для запрошенной модальности применяет ровно те же honesty-гейты, что селектор:
- **Контекст (cloze):** только слова с якорем (unambiguous voc-форма в своих текстах, однозначный blank);
- **Аудио (listen):** только слова с запечённым sentence/word-ассетом;
- **RU→HE (reverse):** только strictSafe-глоссы;
- **Диктант:** только омофон-безопасные с ассетом; min-длина ≥3.
Плюс общие: cooldown/exposure, single-open-challenge, allocation (в manual-режиме reading-first-резервация НЕ применяется — manual = осознанный override, эквивалент all_due), consent-гейты по классам. Пустой eligible-пул для режима → честное «для этого режима сейчас нет подходящих слов» + предложить умную тренировку (не тихий 0, не подмена режима).

**Provenance (миграция 036, additive):** `selection_origin TEXT NOT NULL DEFAULT 'selector'` (`selector|manual`) + `requested_modality TEXT` на agent_challenges; в meta review-строки — через существующий канал challenge-провенанса. select_reason при manual = `user_choice` (новый enum-код, статичное объяснение не показывается).

## §3 Hint-таксономия (уточнение §9 п.7 адъюдикации P8.3)

Один дом факта — challenge-строка; scope выводится reviewer'ом в момент record:

| Hint | Модальности | Запись на challenge | Эффект на evidence_scope |
|---|---|---|---|
| «Показать контекст» (глосс+предложение) | dictate | `hint_used_at` (kind=`context`) | `cell → context_supported` (демоция) |
| 🔊 предложение (tap-to-play, no autoplay) | cloze | `hint_used_at` (kind=`sentence_audio`) | `cloze` остаётся (класс не меняется), meta-аудит отличает assisted |
| Тайловый ввод | dictate | input_mode=`tiles` в meta | `cell → context_supported` (letter-set = кьюинг письма) |
| Тайловый ввод | cloze / listen | input_mode=`tiles` в meta | без демоции (уже context-supported / рецептив) |

`hint_used_at` расширяется до `hint_used_at` + `hint_kind` (или JSON-поле) — решится в P8.4a-спеке; принцип: hint пишет СЕРВЕР до/в момент выдачи подсказки, клиентское самообъявление невозможно; reviewer перечитывает ПОСЛЕ claim (гонка закрыта, §9 п.7/12).

## §4 Модальность «Аудио» (listen, P8.4c — outline)

Рецептив: full-sentence audio (ассет предложения, если запечён; иначе word-audio) + RU gloss + RU-перевод предложения → выбор из 4 (MC) / tiles / typed. Канал `listen:ma` — уже проходит рецептивный `CHANNEL_RE /^(read|listen):/` reviewer'а; grade MC детерминирован (верный выбор → 3, неверный → 1, «Не знаю» → skip-семантика). Дистракторы — по образцу ПК-тренажёра (та же морфо-семья/форма-класс), генерация серверная, без LLM. Challenge-bound (prompt_kind='listen') для single-use/exposure-консистентности, хотя канал рецептивный. Детальная спека — перед P8.4c.

## §5 Стадирование (owner п.8: по слайсам)

| Слайс | Скоуп | Write |
|---|---|---|
| **P8.4a** | Канонический write-flow ТРЁХ существующих модальностей: answer/skip (+annul) через reviewSessionService → reviewer; attempt_eff сервером (§9 п.3); surface-binding (§9 п.4); reveal-на-терминале + resolve-до-record (§9 п.13/22); persist minimal verdict для lost-response replay (§9 п.21); hint «Показать контекст» (dictate) + 🔊 cloze (sentence_audio); ввод: keyboard + tiles (cloze); down-sync в OPFS; двойной флаг MINI_APP_REVIEW_WRITE | **review_log ON** (owner) |
| **P8.4b** | Manual mode «Выбрать режим» (4 кнопки) + миграция 036 (selection_origin/requested_modality) + manual eligibility contract + «Сменить режим» между карточками | — |
| **P8.4c** | Модальность «Аудио» (listen-MC) + дистракторы + sentence-asset resolution | — |
| **P8.5** | Handoff в Зал + Telegram-polish (MainButton/BackButton) + настройки (opt-out'ы модальностей) + session-прогресс n/N | — |

Каждый слайс: спека-дельта → adversarial-критика (P8.4a обязательно — write-путь) → код → гейты → регрессия → деплой → owner live-verify.

## §6 Гейты (дельта к smoke:review-session / новый smoke:miniapp-review)

- per-channel: `cloze:ma`/`dictate:ma`/`reverse:ma` пишут ровно одну строку с верным evidence_scope; `listen:ma` — рецептив (P8.4c);
- hint-матрица §3: context-hint → context_supported; sentence_audio-hint → scope cloze + meta-аудит; tiles-dictate → context_supported; non-hinted dictate → cell; hint на чужой модальности → 409;
- manual: requested_modality с пустым eligible → честный none; selection_origin в provenance; manual НЕ обходит cooldown/binding (P8.4b);
- attempt_eff: кросс-challenge replay невозможен; lost-response → реконструированный результат;
- down-sync: miniapp-строка появляется в OPFS, local replay == server replay;
- регрессия: весь telegram-* набор + agent-review + server-replay + memory-canon.

## §7 Изменения канона

- Recon §0 (роль P8): «context micro-session» → «автономный клиент ежедневных тренировок: smart-default + manual mode» (fork-1 evolved owner'ом 2026-07-10 на основании §2.3-замера 84%; анти-цель «не generic flashcard app» сохраняется через manual-eligibility contract + provenance, полный ручной тренажёр остаётся в браузере).
- P8.3 spec §1 таблица дополняется hint-таксономией §3 этого дока.
- P7.2d select_reason enum: + `user_choice` (P8.4b).
