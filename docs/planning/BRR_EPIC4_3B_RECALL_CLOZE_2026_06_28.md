# Эпик 4.3b — recall-loop / cloze (замыкание петли удержания) · P1 / L · вед. R2/R5/R8/R10

**Дата:** 2026-06-28 · **Статус:** ✅ SHIPPED+PROD (v3.11.26, `b3c7876`). Петля удержания замкнута. Live-verify ниже.
**Родитель:** `BRR_EPIC4_RETENTION_LOOP_2026_06_26.md` §4.3b · `BRR_EPIC4_3A_STUDY_LIST_PREMIUM_2026_06_27.md`. Память [[project_brr_ux_audit]] · [[project_srs_strategy]] · [[feedback_no_override_grounded_reading]].

## Зачем
4.3a даёт сбор/просмотр/фильтр/разметку словаря, но НЕ заставляет активно вспоминать. 4.3b = активное припоминание в реальном контексте + авто-движение статуса → moat: LinguistPro не только объясняет текст, но тренирует память на читаемом материале.

## Лучшие практики рынка (+ наш one-up)
- **Clozemaster** — cloze в реальном предложении, MC/ввод, SRS-раунды по частоте. → мы: предложение из ТЕКУЩЕЙ книги + твой перевод.
- **Anki/FSRS** — cloze-deletion + интервалы. → мы: ручные уровни l1–l4→знаю как ось SRS, отдельно от Anki-расписания.
- **Quizlet «Learn»/Memrise** — эскалация выбор→ввод по зрелости. → маппинг на l1–l4.
- **Duolingo** — сессии ~12–20, мгновенный фидбэк. **LingQ** — активности из слов урока. **Lute/LWT** — тест термина в контексте, статус 1–5.

## Ролевое исследование
- **R2 (вед.):** testing effect; тестировать ЛЕММУ в контексте; узнавание для свежих, воспроизведение для зрелых.
- **R10 (МОАТ):** дистракторы морфо-честные — та же POS, семья корня/гомограф-чтения, близкая длина, из лексики ТОГО ЖЕ текста. Невозможно в generic-приложениях без ивритского морфо-движка.
- **R1:** никуд-скаффолд (подсказка на низах, голо на верхах); ввод принимать КОНСОНАНТНО, огласовку показать на ответе.
- **R8:** контекст-родной (клоуз из читаемого текста); аудио-припоминание (🔊 reuse).
- **R11:** только уверенные (exact/likely); машинный никуд помечать; do-no-harm-полы (одна осечка не рушит знание); детерминизм (seed, без Math.random).
- **R5:** офлайн-first (всё из readerRows + офлайн-резолвер; аудио — существующий fallback). **R3:** дистракторы из rootIndex.

## Уникальные практики (moat)
1. Reading-native cloze (предложение из читаемой книги + твой перевод).
2. Морфо-честные дистракторы (корень-семья + гомографы через офлайн-резолвер).
3. Форма↔лемма (встречаешь склонённую форму → вспоминаешь лемму; на ответе openWordCard показывает разбор формы).
4. Do-no-harm SRS-lite (полы уровней; «знаю» не падает в «новое»).
5. Детерминированный shuffle (seed по индексу).

## Одобренные развилки (владелец 2026-06-28)
1. **Режим = эскалация выбор→ввод:** new/l1/l2 → MC (4 морфо-честных варианта); l3/l4/known → ввод.
2. **Набор = l1–l4 + new + редкое освежение «знаю»** (anti-forgetting, capped).
3. **Ошибка = мягко, с полами:** верно→+1 (…→знаю); ошибка→−1 шаг с полом: new→new, l1→l1, l2→l1, l3→l2, l4→l3, знаю→l4.
4. **Вход = тоггл «Список / Тренировка» в «📚 Учить».**

## Залоченные дефолты (мои, документированы)
- **Размер сессии N=12** (+ «Ещё» = следующая порция). Прогресс «k / N».
- **Ранжирование:** активные [l1–l4 по freq desc] + [new по freq desc]; инъекция до ~2 known (freq desc) на расставленных позициях (освежение); итого N.
- **Выбор occurrence:** предложение с наибольшим числом слов-токенов (лучший контекст), tie-break rowIdx asc.
- **Клоуз:** огласованное предложение (he_niqqud) с пропуском целевого слова (`____`); подсказка = гло́сс слова; перевод предложения (ru) — на ответе (не выдавать). Никуд цели скрыт (это ответ).
- **MC:** 4 варианта (огласованные), приоритет дистрактора sameRoot > samePOS+близкая длина > samePOS > любой; детерминизм (seed=item-index), ответ на позиции `idx%4`.
- **Ввод:** принять консонантно (final→medial норм.) совпадение ФОРМЫ или ЛЕММЫ.
- **🔊** на ответе (озвучить слово; во время вопроса не играем — выдало бы).
- **Reveal:** верно/нет + правильное слово (огласовка) + гло́сс + 🔊 + «Подробнее» (openWordCard) + ru-контекст + индикатор движения уровня «1 → 2».
- **Итог сессии:** «X/N верно» + сколько уровней продвинулось + «Ещё»/«Список».

## Архитектура (на коде)
- **`reader-morph` engine `collectReviewItems(mount, statesMap, opts)`** — один чанковый скан he-спанов (reuse общего `_scanWords`): per lemmaKey {lemmaKey, surface, niqqud, gloss, root, pos, freq, status(effective: states[lk]||'new'), nameSuspect, occ:[{rowIdx,wordOffset}]}; уверенные (exact|likely). Возвращает ВСЕ уверенные леммы (library-ui фильтрует сессию по статусам И использует весь список как пул дистракторов). Ключ — через общий `statusKeyForCard` (parity).
- **Pure (Node-testable) экспорты:** `buildCloze(tokens, wordOffset)` (бланк n-го слова, сепараторы сохранены) · `nextLevel(status, correct)` (полы по развилке 3) · `pickDistractors(answer, pool, n, seed)` (морфо-честный, детерминированный).
- **`collectNewWords`** рефакторится на общий `_scanWords` (DRY; smoke ловит регресс).
- **library-ui:** тоггл «Список/Тренировка» в шапке листа; сессия из readerRows (rowIdx→предложение); рендер вопроса (MC/ввод по уровню); проверка→reveal→`localDb.setWordStatus(nextLevel)`→invalidate readerWordStates+applyDecorations(перекраска)→след.; итог. Reuse `ReaderMorph.openWordCard`/`speakWord`/`tokenize`.

## Гейты / инварианты
- reader-morph smoke: collectReviewItems (status+occ+pool, statuses-фильтр) · buildCloze · nextLevel (все переходы+полы) · pickDistractors (морфо-приоритет, детерминизм, без ответа). all reader gates + corpus-vocab + i18n. @380px свет+тёмная (MC+ввод+reveal).
- Room-only; resolver-ядро/notes-autogen/parity не тронуты; статус — тот же word_status (не плодить Anki-карты). i18n ru/en/he. Bump SW+футеры+package. commit+push→Coolify→prod-verify (Node no-store)→live-verify Kapture (реальный текст: сессия строится, уровни двигаются). Volume-тест (большой текст).

## ✅ SHIPPED v3.11.26 (`b3c7876`, 2026-06-28)
- **Движок (reader-morph):** общий `_scanWords` (occ+meta; `collectNewWords` переведён на него — без дрейфа) · `collectReviewItems` (все уверенные леммы + effective-status + occ + пул) · PURE Node-tested: `buildCloze`, `nextLevel` (мягкие полы), `isMcLevel`, `pickDistractors` (sameRoot≫samePOS+len>samePOS, детерминизм).
- **library-ui:** тоггл «📋 Список / 🎯 Тренировка»; сессия (ранж + known-refresh интерлив); клоуз из readerRows (self-contained + DOM-fallback); MC(new/l1/l2)/ввод(l3/l4/known) по уровню; проверка→reveal (🔊 + openWordCard + ru-контекст + движение уровня «new → l1») → setWordStatus → перекраска; итог + «Ещё». CSS `.room-train-*`, i18n ru/en/he.
- **Гейты:** reader-morph (+5 рекалл-блоков), parity, scaffold 234, word-status, notes, context, corpus-vocab 37, i18n 226. @380px: вопрос(MC) + reveal(«new → l1»).
- **Live-verify (Kapture, прод, профиль 7034):** «הכינור» 973-айтем sibling + «חֲרוּז נִשְׁכָּח» 36 айтемов с реальными статусами (new:29/l3:3/known:2/l2:1/ignore:1); пример אָמַר l3→**typed** (эскалация), клоуз «כָּךְ [__] לְבָבִי», дистракторы — все глаголы (морфо-честно), l3→l4. Прод-маркеры v3.11.26 ✓. ⚠ мульти-таб OPFS-лок (Студия-таб) — мерить при wsCount>0.
- **Эпик 4 (петля удержания) ЗАВЕРШЁН:** 4.1+4.2+4.3a+4.3a+премиум+4.3b.

## 🔬 Аудит 2026-06-28 (конкуренты + код + роли + adversarial-verify + live) → backlog A/B/C
Полное исследование: `docs/research/epic4-3b-cloze-audit/2026-06-28/SYNTHESIS.md` (+ сырьё агентов `first-run-findings.jsonl`). Вердикт: ядро дизайна — на уровне лучших (cloze из своей книги + эскалация + морфо-дистракторы + «стена к чистому»); нашлись реальные баги корректности/честности + ценные практики к перениманию.

### Phase A — ✅ SHIPPED+PROD (v3.11.29, `7c1a58f`)
A1+A2 `buildClozeForTarget` (ключ по СКЕЛЕТУ, не HE-offset; бланк ВСЕХ копий — фикс дрейфа offset + утечки повтора, ~1% live) · A3 пре-сборка→только строящиеся в сессии («X/N» честный) · A4 `pickDistractors` дедуп по отображаемой форме + ни один вариант ≠ ответу · A5 <3 дистракторов→ввод-fallback · A6 `recollectStudy` bail при смене режима · A8 levelUps incl new→l1 · A9 локализованный «новое → 1» · A10 тренировка уважает «скрыть имена». **A7 = оставлено полное аудио строки с целевым словом (решение владельца — подсказка).** Гейт reader-morph +buildClozeForTarget/collision; parity/notes/context/scaffold/word-status/i18n зелёные.

### Phase B — ✅ SHIPPED+PROD (v3.11.30, `9162817`): B1 pickDistractors предпочитает ОГЛАСОВАННЫЕ кандидаты (нет bare-consonant-тычка; полный slot-inflection отложен) · B2 «Не знаю»/skip (MC+ввод)→reveal без угадывания, мягкий no-recall (nextLevel-false, не correct), нейтральный «— Пропущено» · B5 ввод принимает форму ИЛИ лемму, ± проклитика (ו/ה/ב/כ/ל/ש/מ). Гейты зелёные.
### Phase C1 — ✅ SHIPPED+PROD (v3.11.31, `d5bbdbb`): тап-сборка слова. 3-tier эскалация MC(new/l1/l2)→тап-буквы(l3/l4)→ввод(known). `_letterTiles` (буквы ответа +2 декоя, детерм. scramble seed=idx); build-area + тайлы (тап→собрать, тап по собранной→вернуть); проверка через B5 accepted-skeletons. A5-fallback→тап-буквы (без клавиатуры). Гейты зелёные.
### Phase C2 — ✅ SHIPPED+PROD (v3.11.32, `bfde91b`): time-based spacing. Миграция 058 (word_status +srs_due/interval/reps/lapses, аддитивно). `reader-morph.nextSrs` (PURE SM2-lite, nowMs-инъекция: верно→1д→3д→×2.3 cap 365; неверно→reset+lapse, due now). `local-db.setWordStatus` +опц. sched + перешёл на UPSERT (плоский set СОХРАНЯЕТ расписание; было INSERT OR REPLACE→стирало); `getSrsSchedule()`. `buildTrainSession` берёт DUE (никогда-не-тест / просрочено), добивает soonest-due (никогда не пусто); checkTrainAnswer пишет статус+расписание одним UPSERT. Device-local, НЕ Anki-карта. Гейты: reader-word-status (+миграция 058 + persist/preserve), reader-morph (+nextSrs), parity/notes/context/scaffold.

## ✅ АУДИТ-БЭКЛОГ A+B+C1+C2 ЗАВЕРШЁН (v3.11.29→32). v2-остаток: full slot-inflection дистракторов · cross-text «due today» (нужны тела работ) · due-индикатор/счётчик · weakness-weighting · teach-before-test · reverse/listening · gamification.

## v2-беклог
Аудио-only cloze (listening); интервалы по времени (не только в одном тексте); cross-text recall (нужны тела работ); «сложность» по θ; стрик/геймификация; ввод с экранной ивритской раскладкой.
