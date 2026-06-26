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
- **4.2 in-text быстрый статус:** жест по слову в тексте без открытия карточки. **Рекоменд. (R4):** long-press → компактный popover уровней (не коллизит с tap=карта / tap=аудио / tap=reveal; явный, дискаверабельный). Альтернативы: «режим статуса»-тумблер (tap циклит уровень) / инлайн-точка. Volume-тест на большом профиле.
- **4.3 recall-loop + frontier-study:** cloze/recall из собранных occurrence-якорей (`note_occurrences`) + «выучи эти 6 / убери эти 6» из частотного фронтира — переиспользуя граф-квиз Студии `KnowledgeMapQuizLoader` (5 честных типов). НЕ второй планировщик.

## Инварианты
- Ручной стор **отдельно** от srs_cards (не создаёт Anki-карт). Anki=review остаётся (SRS_STRATEGY). Lifecycle-бейдж (расписание) и manual-статус (знание-чтения) — раздельные сигналы в карточке.
- R11: manual-wins для РАСКРАСКИ (ось знания-чтения); SRS/Anki-данные не затираются молча — показаны отдельно.
- Room-only (index.html/builder нетронуты, smoke:reader-parity). Миграция — клиентская OPFS (db:migrate-паттерн, массив MIGRATIONS). i18n ru/en/he. @380px свет+тёмная. WCAG: уровень = не только цвет (число/иконка-канал). Volume-тест.
- measure-before-code: палитра/жест проверяются скрином перед коммитом; merge в getKnownWordStates держать быстрым (один запрос + наложение map).
