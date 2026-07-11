# Room Due Continuity — диагноз + план (owner-директивы 2026-07-11)

**Триггер:** owner live-использование — «К повторению 35 / 1 / 0 в трёх местах», «2/2 пройдено при 33 due», размеченные слова не попадают в «сегодня», тупик при живом due.

## §1 Заземлённый диагноз (все цифры — РАЗНЫЕ метрики, каждая «честна» локально, вместе — противоречие)
| Счётчик | Источник | Что считает |
|---|---|---|
| Бейдж «К повторению» (Зал) | `ReaderMorph.dueCounts` ← `getSrsSchedule()` | ВСЕ scheduled-due (расписание FSRS) |
| CTA «🔁 К повторению: N» | `getDueReviewCount` (`local-db.js:2508`) | due **С сохранённым источником** (`srs_surface IS NOT NULL`) |
| Кросс-текстовая сессия | `_buildDueSourcedItems` (`library-ui.js:1433+`) | sourced **И** предложение доступно **И** cloze собрался — иначе skip |
| Mini App home | серверный `getAgentContext.due_now` | серверные проекции (все due) |

**Корневые факты:**
1. Источник (`srs_text_key/sentence_id/order_index/surface`) пишется ТОЛЬКО recall-ответом тренера (`checkTrainAnswer` → `setWordStatus(..., source)`).
2. **`markWordStatus` (разметка уровня из текста) источник НЕ передаёт** (`library-ui.js:3253` — `null`), хотя occurrence в момент тапа известен; адаптер `opts.setWordStatus=(lk,st)` (`:3367`) не несёт occurrence — контракт reader-morph (parity-locked, у Studio СВОЙ inline-адаптер в index.html!).
3. `gradeReadingTap` тоже пишет `source=null` (`:3301`), имея `occ` в руках.
4. Seed при разметке → due **+1 день** (`manualMarkSeed`) — «вернётся через ~1 дн.» честен, но owner ожидает тренируемость сегодня.
5. Корпус-тексты (Бен-Иегуда) не в OPFS `sentences` → `getSentenceForReview` их не достанет; re-anchor для корпуса = fetch work-JSON (reader-core путь).

## §2 Директивы owner (нормативно)
1. Слова поступают **по всем корпусам** (Мои тексты + Бен-Иегуда).
2. Due-на-сегодня исчерпан → **опция продолжить словами «в работе»** (ранний повтор). ✅ **v1 SHIPPED v3.11.141** — кнопка «▶ Продолжить: слова в работе» в пустом состоянии кросс-тренировки (earliest-due first, FSRS-нативный ранний повтор; пока только sourced-слова).
3. Счётчики не должны противоречить друг другу и тренажёру (P7.3d-класс).
4. Размеченные слова должны быть тренируемы сразу (через п.2-пул — при условии сорсинга, см. R1).

## §3 План слайсов
- **R1 — source-at-mark (приоритет):** пробросить occurrence через контракт карточки reader-morph → `markWordStatus(lk, st, source)` + `gradeReadingTap` строит source из `occ`. ВНИМАНИЕ: у Studio inline-двойник адаптера в index.html (memory: live-source INLINE) + parity-гейты. После R1 свежеразмеченные слова сорсованы → видимы очереди/ahead-пулу.
- **R2 — serve unsourced:** слово без источника → word-only recall-карточка (аналог miniapp read-MC; или локальный re-source скан по OPFS sentences как agentClozeRepo). Убирает класс «due есть — тренировать нечего».
- **R3 — унификация счётчиков:** после R2 servable==schedule → бейдж, CTA и сессия сходятся к одной цифре (плюс ярлыки: «сегодня/в работе»).
- **R4 — corpus sourcing:** re-anchor предложения корпусных работ через reader-core JSON fetch (для отображения/cloze), кэш-осторожно.
- Каждый слайс: спека-дельта → критика (R1 обязательно — канон-писатели) → гейты (`smoke:memory-canon`, `reader-parity`, oracle) → owner-verify.

## §4 Не делать
- Не менять seed-канон (+1д) — п.2-пул решает «сегодня» без сдвига расписания.
- Не фабриковать cloze без предложения (R11 остаётся).
- Не плодить четвёртую метрику due.
