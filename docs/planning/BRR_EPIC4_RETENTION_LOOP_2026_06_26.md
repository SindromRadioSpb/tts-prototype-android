# Эпик 4 — Замкнуть петлю удержания в Зале (моат LingQ) · P1 / L · R2/R5

**Дата:** 2026-06-26 · **Статус:** 🟢 RECON одобрен (решения ниже), фаза 4.1 в работе.
**Родитель:** `docs/planning/BRR_UX_AUDIT_2026_06_25.md` §ЭПИК 4 + аудит петли `docs/research/retention-loop-audit/2026-06-26/FINDINGS.md`. Память [[project_brr_ux_audit]] · [[project_srs_strategy]] · [[feedback_no_override_grounded_reading]]. Роли R2/R5 (вед.) · R4 · R3 · R8 · R11.

## Почему (из аудита петли)
Статус слова **полностью выводится из SRS/Anki-ревью** (`getLearningStateOverlay`), ручного «знаю» нет. Anki read-back работает ТОЛЬКО локально (AnkiConnect/127.0.0.1) → для удалённого прод-читателя статус застревает на `new` (синий), «синяя стена» не сходится. Движок i+1 (`corpus-vocab.js`) + раскраска (`decorateWords`) УЖЕ построены — заперт только ВХОД (статус). Keystone = ручной one-tap статус, **отдельно** от SRS/Anki (не плодить карты).

## Одобренные решения владельца (2026-06-26)
1. **Приоритет = ручной побеждает.** Явный выбор юзера = авторитет для раскраски чтения. SRS/Anki — отдельная ось (расписание ревью), видна в lifecycle-бейдже. R11-честно: разные оси, не молчаливая перезапись.
2. **Словарь = уровни LingQ:** `new(0) · 1 · 2 · 3 · 4 · known · ignore`. Уровни 1–4 = растущая знакомость; known = знаю; ignore = имена/числа/тривиальное (исключить из i+1, нейтральный цвет).
3. **UI = карточка + in-text.** Селектор в морфокарточке (one-tap) + быстрый статус прямо в тексте.

## Архитектура (по коду)
- Новая OPFS-таблица **`word_status(lemma_key PK, status, updated_at)`** (миграция 057) — отдельно от notes/srs/Anki. Ключ = канонический `NotesAutoGen.lemmaKey` (`pid:<id>` / `<norm-lemma>#<pos>`), байт-идентичен инлайн-ключу в `getKnownWordStates` (`local-db.js:2101`).
- DB API: `setWordStatus(lemmaKey, status)` (upsert; `status:''`/null → delete = сброс в new) · `getAllWordStatuses()` → `{lemmaKey: status}`.
- `getKnownWordStates()` расширяется: построить note-derived map (как сейчас) → наложить ручные статусы **manual-wins**, ВКЛЮЧАЯ lemmaKey без заметки (отметил «знаю» без заметки/карты — паттерн LingQ). Возвращает обогащённый словарь значений (`l1..l4/known/ignore/learning/known/weak/stale/new`).
- Downstream-маппинг: `decorateWords` (reader-morph) + чипы 3a → новые классы `.rm-w-l1..l4` (жёлтый градиент: 1 ярче → 4 бледнее), `known` → без тинта (стена сходится к прозрачному), `ignore` → нейтрал. `coverageForWork` (corpus-vocab): known→known, l1–l4→learning, ignore→исключить из frontier, new→unknown-gap.
- Recompute-триггеры как у word-status (инвалидировать `readerWordStates` + applyDecorations) на set.

## Фазы
- **4.1 (keystone, в работе):** миграция 057 + DB API + getKnownWordStates manual-overlay + **card-селектор уровня** + раскраска уровней (текст + чипы) + i+1 учитывает ignore/levels. Гейты + @380px свет+тёмная. → статус становится реальным для ВСЕХ; чипы 3a + раскраска + i+1 осмыслены.
- **4.2 in-text быстрый статус — ✅ SHIPPED (v3.11.10):** long-press по слову → компактный floating popover уровней (new/1-4/known/ignore), без открытия карточки; pointerdown+timer(480ms), движение/скролл отменяет, long-press подавляет следующий click (не коллизит с tap=карта/аудио/reveal); resolve→lemmaKey→setWordStatus→мгновенная перекраска; не определилось → фолбэк на карточку (не тупик); Escape/скролл/тап-вне закрывают. CSS `.rm-statpop`, гейт +long-press-ассерт, @380px свет+тёмная. (Дискаверабельность long-press — отметить в Эпике 8 onboarding.)
- **4.3 recall-loop + frontier-study (RECON одобрен 2026-06-26):** owner-развилки — **recall = in-session cloze из `readerRows`** (НЕ kmap-граф-квиз: тот root-centric + требует kmap-индекс; cloze reading-native, самодостаточен, R2-сильнее) · **scope = frontier-study ПЕРВЫМ, потом recall**. `note_occurrences` текст НЕ хранит (ids+surface) → cross-text cloze требует тел работ (отложено); in-session по `readerRows` в памяти.
  - **4.3a frontier-study (next):** «📚 Учить» в панели подсказок → новый `ReaderMorph.collectNewWords(mount, statesMap, {topN})` (скан `.rm-w` → resolveCore → группа по lemmaKey → фильтр status∈{new/undefined} → ранг по частоте → top-N~8). library-ui рендерит лист niqqud+глосс+компактный статус-селектор → one-tap mark → перекраска. Self-contained (резолвер+getKnownWordStates+setWordStatus). i18n room.morph.study.*. Гейт + @380px.
  - **4.3b recall-loop:** in-session cloze — бланкуем сохранённое/учимое слово в РЕАЛЬНОМ предложении (readerRows) → узнавание (MC из честных ривалов) или ввод; верно→уровень↑, нет→↓ (manual статус, НЕ Anki-карта; Anki держит расписание). Детерминированный shuffle.

## Палитра — исследование конкурентов (2026-06-26) → решение
Сверка LingQ · LWT · Lute · Readlang. **Единый кросс-конкурентный стандарт:** текст «расходится» к чистому по мере изучения — это и есть мотивационный моат.
- **LingQ:** new=синий · LingQ-learning=жёлтый (уровни) · **known=БЕЗ подсветки (белый/чистый)**. Клик/«paging moves to known» массово.
- **LWT:** статусы 1–5 (unknown→well-known) + WKn + Ign; градиент, well-known/ignored — светлый/без подсветки.
- **Lute (эталон, документирован):** CSS `span.status1..5` (градиент) · `.status98`=ignored · `.status99`=well-known; пример из мануала — `span.status99 { background-color: none }` → **known БЕЗ заливки**; клавиши `1 2 3 4 5 w i`. Цвета кастомизируемы.
- **Readlang:** green=saved; пользователи просили градиент familiarity.
- **A11y:** цвет — не единственный канал (добавить второй: подсветка-vs-чистый уже несёт сигнал known≠new; + число уровня в селекторе).

**РЕШЕНИЕ (evidence-backed, LingQ-faithful — кросс-конкурентный стандарт):**
| статус | подсветка текста |
|---|---|
| new (не отмечено + не ревью) | синий (existing `.rm-w-new`) |
| l1 (только встретил) → l4 (почти знаю) | АМБЕР-градиент (l1 ярче → l4 бледнее) |
| learning (SRS-derived, без ручного уровня) | существующий оранж |
| **known** | **БЕЗ подсветки (прозрачный)** — стена сходится к чистому (меняет текущий зелёный) |
| ignore | без подсветки + слабый пунктир-underline (отличить «пропускаю» от «знаю» при инспекции) |
| weak/stale (SRS) | существующие |
A11y: known≠new кодируется присутствием-подсветки (не только цветом); уровень 1–4 — число в card-селекторе. Источники в `docs/research/retention-loop-audit/2026-06-26/` (раздел палитры).

## Инварианты
- Ручной стор **отдельно** от srs_cards (не создаёт Anki-карт). Anki=review остаётся (SRS_STRATEGY). Lifecycle-бейдж (расписание) и manual-статус (знание-чтения) — раздельные сигналы в карточке.
- R11: manual-wins для РАСКРАСКИ (ось знания-чтения); SRS/Anki-данные не затираются молча — показаны отдельно.
- Room-only (index.html/builder нетронуты, smoke:reader-parity). Миграция — клиентская OPFS (db:migrate-паттерн, массив MIGRATIONS). i18n ru/en/he. @380px свет+тёмная. WCAG: уровень = не только цвет (число/иконка-канал). Volume-тест.
- measure-before-code: палитра/жест проверяются скрином перед коммитом; merge в getKnownWordStates держать быстрым (один запрос + наложение map).
