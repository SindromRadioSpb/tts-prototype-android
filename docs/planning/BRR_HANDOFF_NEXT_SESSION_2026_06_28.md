# BRR — HANDOFF для НОВОЙ СЕССИИ (READ FIRST) · 2026-06-28

Единая точка входа для продолжения разработки Читального зала (Ben-Yehuda Reading Room) без потери контекста. Открой ЭТОТ файл первым, затем ссылки из §0.

**Состояние на момент хэндоффа:** прод `v3.11.32`, SW синхронизирован, ветка `main` чистая, последний коммит `9bd47b8`. Эпик 4 (петля удержания) ЗАВЕРШЁН и live-подтверждён. Следующая работа — **одобренный Phase D (D1–D7)**.

> **UPDATE 2026-06-29 — D3 ОТГРУЖЕН (prod `v3.11.33`, `46536e9`).** Видимый due-счётчик «В работе: N · К повторению: M» (два глобальных числа; решение владельца после measure: srs=0/in-progress=41 на реальном профиле). PURE `ReaderMorph.dueCounts` + бейдж под «📚 Учить» и в шапке листа + строка «следующее повторение через X» в итоге сессии. Все гейты зелёные, live-Kapture подтвердил «В работе: 41 · К повт.: 0». Детали — план 4.3b §«D3 SHIPPED». **СЛЕДУЮЩЕЕ = D4** (weakness-weighting по `srs_lapses` в `buildTrainSession` + детерм. smoke на инъектированных lapse-данных).

---

## 0. Что прочитать первым (канон, в этом порядке)
1. **`docs/planning/BRR_EPIC4_3B_RECALL_CLOZE_2026_06_28.md`** — главный план 4.3b: что отгружено (A/B/C1/C2), прослеживаемость требование→версия→коммит→гейт, live-verify блок, и **Phase D (D1–D7) = одобренный плановый бэклог**.
2. **`docs/research/epic4-3b-cloze-audit/2026-06-28/SYNTHESIS.md`** (+ `README.md`, `first-run-findings.jsonl`) — конкурентный аудит (Clozemaster/LingQ/Quizlet/Anki), code-grounded находки, происхождение всех A/B/C/D пунктов.
3. **`docs/SESSION_STATE_BRR_2026_06_14.md`** — консолидированное состояние всего Зала (поверхности, гейты, OPFS, пайплайн корпуса, публикация).
4. **`CLAUDE.md`** — нормы проекта (роли R1–R11, CSS-ловушки index.html, UI-workflow @380px, prod-деплой, artifact storage rule).
5. **`docs/PROJECT_ROLES.md`** — определения ролей-линз R1–R11 (применять автоматически для любого содержательного решения).

> Норма владельца: **бескомпромиссное качество, без заглушек.** Любое содержательное решение — через релевантные роли R1–R11; развилка → варианты с разбором + рекомендация, владелец решает.

---

## 1. Что СДЕЛАНО (SHIPPED+PROD, не переоткрывать)
**Эпик 4 — петля удержания (collect → mark → recall) ЗАВЕРШЁН.** Конкретно по 4.3b и аудиту:

- **4.3b ядро (v3.11.26 `b3c7876`)** — cloze-тренировка из читаемого текста; тоггл «📋 Список / 🎯 Тренировка» в «📚 Учить»; эскалация MC→ввод; морфо-честные дистракторы; мягкие SRS-полы; перекраска статусов после ответа.
- **Phase A (v3.11.29 `7c1a58f`)** — корректность/честность: `buildClozeForTarget` (ключ по СКЕЛЕТУ, бланк ВСЕХ копий — фикс offset-дрейфа + утечки повтора); пре-фильтр строящихся в «X/N»; дедуп MC по форме + дистрактор ≠ ответ; mode-race bail; локализованные level-метки; уважение «скрыть имена». **A7 = полное аудио строки с целевым словом ОСТАВЛЕНО (решение владельца).**
- **Phase B (v3.11.30 `9162817`)** — B1 дистракторы предпочитают ОГЛАСОВАННЫЕ кандидаты (нет bare-consonant-тычка); B2 «Не знаю»/skip → reveal без угадывания (мягкий no-recall); B5 ввод принимает форму ИЛИ лемму ± проклитика (ו/ה/ב/כ/ל/ש/מ).
- **Phase C1 (v3.11.31 `d5bbdbb`)** — тап-сборка слова: 3-tier MC(new/l1/l2)→тап-буквы(l3/l4)→ввод(known); `_letterTiles` (буквы ответа +2 декоя, детерм. scramble); решает мобильный ивритский ввод.
- **Phase C2 (v3.11.32 `bfde91b`)** — time-based spacing: **миграция 058** (`word_status` +srs_due/interval/reps/lapses, аддитивно); `reader-morph.nextSrs` (PURE SM2-lite, nowMs-инъекция); `local-db.setWordStatus` перешёл на **UPSERT** (плоский set СОХРАНЯЕТ расписание); `getSrsSchedule()`; `buildTrainSession` берёт DUE.
- **Live-verify (post-ship, 2026-06-28, прод v3.11.32, реальный профиль wsCount=7035):** C2/миграция-058 SRS round-trip (write→preserve-after-plain-set→clean) ✓; движок без утечки + огласованные неколлидирующие дистракторы ✓; полный UI-кликтру (реальный текст → «Учить» → «Тренировка» рендерит клоуз + 🔊 + гло́сс форма↔лемма + перевод строки + C1 тап-буквы для l3) ✓. Детали в плане 4.3b §Верификация.

---

## 2. Карта кода (поверхности Зала — где что лежит)
- **`public/js/reader-morph.js`** — движок (engine). Ключевое: `statusKeyForCard` (общий keyer), `collectNewWords`/`_scanWords` (общий скан), `collectReviewItems`, `buildCloze`, `buildClozeForTarget(tokens,targetSkel)`, `nextLevel(status,correct)`, `isMcLevel`, `pickDistractors` (sameRoot≫samePOS+len, дедуп+огласовка), `nextSrs(prev,correct,nowMs)` (SM2-lite), `openWordCard`, `NAME_HINT`. Всё экспортится на `window.ReaderMorph`.
- **`public/js/library-ui.js`** — UI Зала. Study sheet (`ensureStudySheet`, `roomOpenStudyList`, `renderStudyControls/Body`, `studyFiltered/RowEl`, `onStudyStatusSet/Expand/Speak/Bulk`); training (`startTraining`, `buildTrainSession(all,nowMs)` due-aware, `_trainBuildCloze`, `renderTrainItem` 3-mode, `onTrainOption/Submit/Skip`, `checkTrainAnswer`, `renderTrainReveal/Summary`, `_normHe/_stripProclitic/_acceptedSkeletons`, `_letterTiles/onTrainTile/onTrainUnbuild/_renderBuild`); onboarding (`showReaderTip` 2-line, `tagReaderTableLang`, `roomFocusInto/Restore`, `readerSkeleton`).
- **`public/db/migrations.js`** — миграции; последняя = **058 (index 57)**: `word_status` +srs_* + `ix_word_status_due`.
- **`public/db/local-db.js`** — `setWordStatus(lemmaKey,status,sched?)` (UPSERT, сохраняет srs при плоском set), `getSrsSchedule()`.
- **`public/library.html`** — Зал-шелл + CSS (`.room-study-*`, `.room-train-*`, `.reader-tip-*`, `.reader-skeleton-*`, `--prov-*` контраст-vars, aidsPulse под reduced-motion). Футер `#roomFooterVersion`.
- **`public/index.html`** — Студия. **НЕ ТРОГАТЬ** при работе над Залом (до Stage 2). Live JS Студии — INLINE в index.html (public/check_script.js — мёртвая копия).
- **`public/i18n/locales/{ru,en,he}.js`** — `room.morph.study.*` + `room.onboard.readerTip1/2`.
- **Smoke:** `scripts/premium/reader-morph-smoke.js` (collectNewWords/collectReviewItems/buildClozeForTarget/pickDistractors-collision/nextSrs/openWordCard), `scripts/premium/reader-word-status-smoke.js` (+миграция 058 + persist/preserve).

---

## 3. Инварианты (нарушишь — регресс; держать ВСЕГДА)
1. **save-key == paint-key == collect-key.** Статус СОХРАНЯЕТСЯ ключом `resolveWordLight`, КРАСИТСЯ ключом `decorateWords` — они обязаны совпадать. Любое key-влияющее обогащение зеркалить в обоих (никуд-derived surface, function-link pid, await ensureReady перед paint). Канон: память `feedback_ktiv_surface_key_consistency`.
2. **UPSERT, не INSERT OR REPLACE.** `word_status` пишется ДВУМЯ путями (плоский set / recall+sched). INSERT OR REPLACE стёр бы srs-колонки. Только `ON CONFLICT DO UPDATE SET <owned cols>`. Гейт: reader-word-status persist/preserve. Память `feedback_upsert_preserve_columns`.
3. **Cloze по СКЕЛЕТУ.** Цель ключится никуд-stripped скелетом (не cross-tokenization индексом), бланкуются ВСЕ совпадающие копии, MC-варианты дедуп по ОТОБРАЖАЕМОЙ форме и никогда ≠ ответ. Память `feedback_cloze_key_by_skeleton`.
4. **Честность резолвера / do-no-harm (R11).** Бейдж «точно» только на решающих ячейках; гомографы → «вероятно»; обогащение НИКОГДА не перезаписывает корректное grounded-чтение менее надёжным источником; не валидировать источником-фичей сам себя (Dicta-feature ≠ Dicta-oracle). Память `feedback_no_override_grounded_reading`.
5. **Детерминизм.** Никаких `Math.random()`/`Date.now()` в чистом движке — seed по индексу; `nowMs` инъектируется. Чистые хелперы — Node-тестируемые.
6. **Room-only, parity-safe.** Не трогать `reader-core.js` парность (гейт `smoke:reader-parity`), `notes-autogen.js` (гейт `autogen-parity`), `index.html`. Зал работает пост-рендером по `.rm-w`.
7. **Premium UI:** строки-подсказки ломаются по ЛОГИЧЕСКОЙ границе (per-line i18n keys + block spans), не free-wrap посреди фразы. Память `feedback_premium_ui_logical_linebreak`. Проверять @380px скриншотом ДО `git add`.

---

## 4. Гейты / деплой / live-verify (рабочий цикл)
**Гейты (прогнать перед коммитом, релевантные к правке):**
```
npm run smoke:reader-morph          # движок: cloze/distractors/nextSrs/collect*
npm run smoke:reader-word-status    # word_status + миграция 058 + SRS persist/preserve
npm run smoke:reader-parity         # reader-core byte-parity (НЕ ломать)
npm run smoke:reader-scaffold       # niqqud-fade/tap-reveal/modes
npm run smoke:reader-context        # cross-text контекст
npm run smoke:corpus-vocab          # сбор словаря/частоты
npm run smoke:autogen-parity        # notes-autogen lock-step (НЕ ломать)
npm run smoke:reader-notes          # заметки
npm test                            # node --test
npm run test:api-smoke              # API smoke
# i18n-гейт ru/en/he (ключи room.morph.study.* / room.onboard.*)
```
**@380px:** обязательный скриншот реальным путём (Kapture/Playwright) перед `git add` — открыть Зал → текст → «📚 Учить» → «🎯 Тренировка» → проверить MC / тап-буквы / «Не знаю» / reveal. Свет + тёмная тема.

**Деплой (норма «commit+push+deploy by default»):** verified fix + зелёные гейты → bump `package.json` version + SW `CACHE_VERSION` + футеры (`#roomFooterVersion`, `#appFooterVersion`) при ЛЮБОМ изменении shell/locale → commit → `git push origin main` → Coolify авто-сборка Docker → **prod-verify Node fetch no-store** (НЕ curl — Windows curl коверкает иврит) → **live-verify Kapture** на реальном профиле. Docs-only коммиты — без бампа версии/SW.

**Live-verify через Kapture (как делалось):** один таб `library.html`, прочие linguistpro-вкладки ЗАКРЫТЬ (иначе OPFS multi-tab лок — «Библиотека открыта в другой вкладке»), eval включён. Прогон: `mcp__kapture__evaluate` (engine round-trip на синтетическом ключе, чтобы не трогать реальные слова) + `mcp__kapture__click` по реальному пути + `mcp__kapture__screenshot`. Прод-маркеры версии — Node fetch no-store.

**Footers:** коммиты заканчивать
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: <session url>`.

---

## 5. Следующая работа — Phase D (ОДОБРЕНО владельцем 2026-06-28)
Владелец: «Включаем в план всё из v2-остатка». Полная таблица (ценность дословно + вед. роль + зависимость) — в плане 4.3b §«Phase D». Кратко:

| Код | Требование | Вед. | Зависимость |
|---|---|---|---|
| **D1** | Полный slot-inflection дистракторов | R10 | офлайн Pealim-парадигмы; B1 = частичный шаг |
| **D2** | Cross-text «due today» | R2/R5 | C2 готов; нужны ТЕЛА др. работ для клоуза вне открытого текста |
| ~~**D3**~~ ✅ | Видимый due-счётчик (ОТГРУЖЕН v3.11.33) | R4/R5 | done — два числа «В работе/К повторению» |
| **D4** | Weakness-weighting | R2 | C2 копит srs_lapses → вес в buildTrainSession |
| **D5** | Teach-before-test | R2/R8 | reuse openWordCard/speakWord; не считать показ за recall |
| **D6** | Reverse / listening / dictation | R8/R2 | reuse baked-аудио + B5 accepted-skeletons |
| **D7** | Gamification (стрик/дневная цель) | R5 | парн. к D2/D3; держать «мягкой» (без тёмных паттернов) |

**Предложенная очередность (владелец решает):** дешёвые на готовом C2 сначала → **D3 → D4 → D1 → D5 → D7 → D2/D6** (D2/D6 крупнее — нужны тела работ / новые каналы). Каждый пункт — отдельная фаза с гейтами по образцу A/B/C (headless-smoke + @380px реальным путём + прод/Kapture live-verify).

**Рекомендация на старт следующей сессии:** D3 ОТГРУЖЕН (v3.11.33). Следующее — **D4** (weakness-weighting): взвесить `buildTrainSession` в сторону слов с историей провалов (`srs_lapses` desc) поверх freq-ранжирования. ⚠ **Measure-факт:** на реальном профиле `getSrsSchedule()`=0, `srs_lapses`=0 — D4-вес инертен, пока не накопятся recall-сессии (которые и провоцирует видимый бейдж D3). Поэтому D4 строить с честным no-data fallback (нейтральный порядок) + ДЕТЕРМИНИРОВАННЫЙ smoke на инъектированных lapse-данных (корректность к моменту появления данных). R2-линза. Перед кодом — краткий план D4 + развилки владельцу.

---

## 6. Ловушки/память (не наступить повторно)
- **OPFS multi-tab лок:** live-тест Kapture блокируется, если открыт другой linguistpro-таб. Закрыть всё, кроме одного.
- **Windows curl + иврит:** коверкает не-ASCII тела → ложное «egress blocked». Прод-проверки иврита — Node fetch / браузер.
- **Headless OPFS:** `importBundle` крашит wa-sqlite headless (мелкие записи ок) → reader-фичи верить через logic-gate + parity + plumbing-smoke; полный клиент = устройство владельца.
- **SW кэш:** бампить `CACHE_VERSION` при любом index.html/locale/shell изменении, иначе сырые i18n-ключи / старый shell.
- **Студия live = INLINE в index.html** (не public/check_script.js).
- Полный журнал уроков — память-файлы `feedback_*` (см. MEMORY.md): linebreak, cloze-skeleton, upsert-preserve, no-override-grounded, ktiv-surface-key, workflow-front-size, verify-stale-plan-vs-live-code и др.

---

## 7. РЕКОМЕНДОВАННЫЙ СТАРТОВЫЙ ПРОМТ (вставить в начало новой сессии)
См. дублирующий блок в ответе сессии 2026-06-28. Суть: «Открой и прочитай `docs/planning/BRR_HANDOFF_NEXT_SESSION_2026_06_28.md` (READ FIRST) + по ссылкам §0. Прод v3.11.32, Эпик 4 завершён и live-подтверждён, ветка main чистая (`9bd47b8`). Следующее одобрено: Phase D (D1–D7), начни с D3 (видимый due-счётчик) — applied R-линзы, measure-before-code, держи инварианты §3, цикл деплоя §4. Перед кодом покажи мне краткий план D3 по ролям и развилки, я решу.»
