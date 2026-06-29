# BRR — HANDOFF для НОВОЙ СЕССИИ (READ FIRST) · 2026-06-28

Единая точка входа для продолжения разработки Читального зала (Ben-Yehuda Reading Room) без потери контекста. Открой ЭТОТ файл первым, затем ссылки из §0.

**СОСТОЯНИЕ — АКТУАЛЬНО 2026-06-29 (ЭТА секция авторитетна над §0–§5):** прод **`v3.11.41`**, SW синхронизирован (**auto-skipWaiting** — свежий код с первого reload), ветка `main` чистая, посл. код-коммит `9fa5599`. **Эпик 4 (петля удержания) ЗАВЕРШЁН + Phase D: D1·D3·D4·D5·D7·D6 ОТГРУЖЕНЫ (D1–D5 live-подтверждены; D7·D6 prod-verified Node no-store + adversarial-review pass — live-verify training-флоу за владельцем на ОДНОРАЗОВОМ тексте).** Следующее по очередности — **D2 (cross-text due — нужны тела работ)**.

> ⚠ §0–§5 (основной текст ниже) — baseline-снимок на `v3.11.32`, НАМЕРЕННО не переписан. Авторитетны: ЭТА «PHASE D — статус» секция + UPDATE-блоки ниже + план 4.3b §«Phase D». Карта кода §2 и гейты §4 ДОПОЛНЕНЫ D-функциями (см. там пометки «Phase D»).

**PHASE D — статус (prod `v3.11.39`):**
- **D1 ✅** slot-inflected MC-дистракторы, R10-моат (v3.11.35/36 `324645d`/`4baa3e8`) — `ReaderMorph.findSlot`(проклитика-aware, пин-по-лемме, синкретизм→ячейка по РЕАЛЬНОМУ никуду) + `buildMcSlotOptions`(банк = same-POS парадигмы из engine `pidMap`, фильтр по слоту, L4 корень-семья/глосс-поле; ВСЕ 4 варианта = голые слот-формы из ячеек Pealim → нет tell; откат к B1). Гейт `smoke:reader-cloze:audit` = **96.5%, bad-form 0**. Live: אָמַר→PERF-3ms, MC «אַף פַּעַם לֹא ___»→4×PERF-1s.
- **D3 ✅** видимый due-счётчик (v3.11.33 `46536e9`) — `ReaderMorph.dueCounts(statusMap,schedule,nowMs)` → бейдж «В работе:N · К повторению:M» под «📚 Учить» + в шапке листа + «следующее повторение через X» в итоге сессии. Live: 47/9.
- **D4 ✅** weakness-weighting + лич-няж (v3.11.34 `ef3ab0a`) — `ReaderMorph.rankByWeakness(items)`(стаб. lapses↓, tie=вход, all-zero=no-op) в `buildTrainSession`; `LEECH_LAPSES=4` → reveal opt-in «🚫 Игнорировать» (`onTrainLeechIgnore`).
- **D5 ✅** teach-before-test (v3.11.38/39 `dab62ea`/`dcc3433`) — never-tested new (`status==='new' && !item._srs`) → лёгкая `renderTrainTeach` (форма+гло́сс+🔊-слово+🔊-предложение+слово-в-предложении+Подробнее+«проверь») ПЕРЕД первым MC; показ НЕ пишет ничего (R2 «показ≠recall»); тест считается обычно. Live: לִינָה→teach→MC.
- **PWA ✅** auto-skipWaiting (v3.11.37 `bcae910`) — SW `skipWaiting`(install)+`clients.claim`(activate)+гард `controllerchange`→reload → свежий код с ПЕРВОГО reload.
- **D7 ✅** soft gamification — стрик + адаптивная дневная цель (v3.11.40 `4f7d449`) — OPFS-леджер `study_day` (mig 059, единый источник истины) + PURE `ReaderMorph.streakFromDays`/`streakView` (цель=`min(10,genuinely-due)`, `available==0`→rest-credit, banked-grace+soft-pause без punitive-reset, future-clamp R11; день инъектируется) + `local-db.recordRecall`/`noteAvailable`/`getStudyDays`. Честность: только настоящий recall (skip/teach пишут НИЧЕГО), `available`=due/new НЕ padding (цель не толкает not-yet-due), стрик ОТВЯЗАН от due-счётчика. UI: calm streak-группа на due-бейдже + строка итога + off-switch (`room.streakHidden`). Adversarial-review pass (honest-rest-credit + future-clamp фиксы). Prod-verify v3.11.40.
- **D6 ✅** reverse / listening / dictation — 3 канала извлечения (v3.11.41 `9fa5599`) — селектор канала (📖/🎧/🔤/✍️, `room.trainChannel`); все каналы делят ОДНУ answer/grading-машину, отличается ТОЛЬКО prompt (`renderTrainItem` ветвится по `s.channel`); listen=baked-аудио строки (`row._v3_audioAssetKey` keyless, reader-core НЕ тронут), dictate=`speakWord(built.cz.answer)`+production-only; PURE `ReaderMorph.availableChannels(caps)` honest-gate (listen/dictate off если аудio не сыграет: `rowHasBakedAudio`=ВСЕ айтемы baked); HE не светится в prompt; та же SRS+D7-стрик; `_stopTrainAudio` + no-double-score guard. Adversarial-review pass. Prod-verify v3.11.41.
- **СЛЕДУЮЩЕЕ = D2** (cross-text due — нужны тела работ для клоуза вне открытого текста; C2-расписание готово). Опц. **D7.1**: месячный heatmap из `study_day`.

> **UPDATE 2026-06-29 — D3 ОТГРУЖЕН (prod `v3.11.33`, `46536e9`).** Видимый due-счётчик «В работе: N · К повторению: M» (два глобальных числа; решение владельца после measure: srs=0/in-progress=41 на реальном профиле). PURE `ReaderMorph.dueCounts` + бейдж под «📚 Учить» и в шапке листа + строка «следующее повторение через X» в итоге сессии. Все гейты зелёные, live-Kapture подтвердил «В работе: 41 · К повт.: 0». Детали — план 4.3b §«D3 SHIPPED».

> **UPDATE 2026-06-29 — D4 ОТГРУЖЕН (prod `v3.11.34`, `ef3ab0a`).** Weakness-weighting + лич-няж. PURE `ReaderMorph.rankByWeakness` (стаб. сорт по `_srs.lapses`↓, tie=входной порядок, all-zero=no-op) → `buildTrainSession` ранжирует due-пул; `LEECH_LAPSES=4` → reveal предлагает мягкий opt-in «🚫 Игнорировать». Гейты зелёные; live-Kapture: synOrder=b,e,d,a,c,f, identity, leech-логика ✓. Measure: профиль srs=3/lapses=0 → вес инертен сегодня (тождество), активируется по мере провалов. Детали — план 4.3b §«D4 SHIPPED».

> **UPDATE 2026-06-29 — D1 ОТГРУЖЕН (prod `v3.11.35` `324645d` + fix `v3.11.36` `4baa3e8`).** Slot-inflected MC-дистракторы (R10-моат). PURE `findSlot` (проклитика-aware, пин-по-лемме, синкретизм→ячейка по реальному никуду) + async `buildMcSlotOptions` (банк = same-POS парадигмы из engine `pidMap`, фильтр по слоту, L4 семантика корень-семья/глосс-поле; ВСЕ 4 варианта = голые слот-формы из ячеек Pealim → нет tell; откат к B1). Measure-before-code нашёл проклитики (61% токенов) как главный рычаг. **Аудит `smoke:reader-cloze:audit`: охват 96.5% (1249/1294), bad-form 0** — превышает цель. Live-Kapture: אָמַר→PERF-3ms (форма из текста), סֵפֶר→корень-семья. План `BRR_EPIC4_3B_D1_SLOT_DISTRACTORS_2026_06_29.md`; артефакт `docs/research/epic4-3b-d1-slot/2026-06-29/`. **СЛЕДУЮЩЕЕ = D5** (teach-before-test: перед первым тестом нового слова — краткий показ форма+значение+аудio; reuse openWordCard/speakWord; не считать показ за recall) или D7/D6/D2 по очередности.

> **UPDATE 2026-06-29 — D1 live-UI-кликтру ✓ + PWA auto-update (prod `v3.11.37`, `bcae910`).** D1 подтверждён РЕАЛЬНЫМ путём (текст→Аа→Учить→Тренировка): MC «אַף פַּעַם לֹא ____» (трогать) → 4 варианта נָגַעְתִּי(✓)/הִגַּעְתִּי/כָּתַבְתִּי/שָׁכַבְתִּי — все PERF-1s в ОДНОМ слоте, выбор только по значению (R10-моат живьём). Багов нет. SW `skipWaiting` на install → свежий код с первого reload (§6).

> **UPDATE 2026-06-29 — D5 ОТГРУЖЕН + live-verified (prod `v3.11.38`, `dab62ea`).** Teach-before-test: never-tested new word → лёгкая teach-панель (форма+гло́сс+🔊+слово-в-предложении+Подробнее+«проверь») ПЕРЕД первым MC; показ не пишет ничего (R2), тест считается обычно. Live-Kapture: לִינָה «ночлег» → teach → «проверь» → MC (מְלוּנָה/לִינָה✓/מָלוֹן/תְּלוּנָה, D1+L4). Багов нет. ⚠ **Урок:** live-verify training-флоу ДОРОГ на реальном профиле — дошёл до teach-айтема через 11 skip (= soft-demote 11 слов). **В будущем training-флоу проверять на ОДНОРАЗОВОМ baked-тексте, не на рабочем профиле.** **СЛЕДУЮЩЕЕ = D7** (геймификация: стрик/дневная цель, R5; парная к D3-счётчику; держать «мягкой», без тёмных паттернов).

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
- **`public/js/reader-morph.js`** — движок (engine). Ключевое: `statusKeyForCard` (общий keyer), `collectNewWords`/`_scanWords` (общий скан), `collectReviewItems`, `buildCloze`, `buildClozeForTarget(tokens,targetSkel)`, `nextLevel(status,correct)`, `isMcLevel`, `pickDistractors` (sameRoot≫samePOS+len, дедуп+огласовка), `nextSrs(prev,correct,nowMs)` (SM2-lite), `openWordCard`, `NAME_HINT`. **Phase D (экспортированы):** `dueCounts(statusMap,schedule,nowMs)→{inProgress,dueNow,nextDue}` (D3) · `rankByWeakness(items)` стаб. lapses↓ (D4) · `findSlot(paradigm,niqqud)→{slot,count}` проклитика-aware (D1) · `buildMcSlotOptions(answerCard,n)→{correctHe,options,slot}|null` (D1) · `streakFromDays(rows,cap)→{cur,best,lastDay,grace}` fold + `streakView(rows,cap,todayStr)→{cur,best,grace,alive,todayRecalls,todayGoal,todayRest,todayQualified,cap}` + `STREAK_GOAL_CAP=10`/`STREAK_GRACE_MAX=2` (D7 — PURE, день инъектируется, future-clamp) · `availableChannels(caps)→{read,reverse,listen,dictate}` (D6 — honest audio-gate: read/reverse всегда, listen/dictate нужны key|voice|all-baked). Всё экспортится на `window.ReaderMorph`.
- **`public/js/library-ui.js`** — UI Зала. Study sheet (`ensureStudySheet`, `roomOpenStudyList`, `renderStudyControls/Body`, `studyFiltered/RowEl`, `onStudyStatusSet/Expand/Speak/Bulk`); training (`startTraining`, `buildTrainSession(all,nowMs)` due-aware, `_trainBuildCloze`, `renderTrainItem` 3-mode, `onTrainOption/Submit/Skip`, `checkTrainAnswer`, `renderTrainReveal/Summary`, `_normHe/_stripProclitic/_acceptedSkeletons`, `_letterTiles/onTrainTile/onTrainUnbuild/_renderBuild`); onboarding (`showReaderTip` 2-line, `tagReaderTableLang`, `roomFocusInto/Restore`, `readerSkeleton`). **Phase D UI:** `_dueBadgeEl/_paintDueBadge/refreshDueBadge` + `_humanizeUntil` (D3 бейдж; рефреш на open/close/статус/bulk/ответ) · `LEECH_LAPSES`+`onTrainLeechIgnore` (D4 лич-няж в reveal) · `renderTrainTeach/onTrainTeachDone` (D5 teach-экран; гейт `status==='new' && !item._srs && !_taught`) · `buildMcSlotOptions`-предсчёт `item._mcOptions` в `startTraining` + ветка в `renderTrainItem` (D1) · `_localDayStr()`+`streakHidden()`/`streakHiddenSet()`+streak-группа в `_dueBadgeEl`/`_paintDueBadge` (`_streakView`) + streak-строка в `renderTrainSummary` + off-switch `data-streak-toggle`; `startTraining` пишет `noteAvailable(day,dueAvail)` (genuinely-due, НЕ padding), `checkTrainAnswer` `await recordRecall(day,dueAvail)` только при `!skipped` (D7) · `_trainChannelBar`/`onTrainChannel` (D6 селектор, `room.trainChannel`) + ветки channel в `renderTrainItem` (read/listen/reverse/dictate; общий answer/grading, отличается ТОЛЬКО prompt) + `playClozeRowAudio(rowIdx)` (baked-asset keyless → speakWord-fallback) + `_trainAudioCaps(items)`/`_heVoiceAvailable`/`_stopTrainAudio` (D6).
- **`public/db/migrations.js`** — миграции; последняя = **059 (index 58)**: `study_day` (D7 per-day леджер `{day,recalls,available}`); пред. 058: `word_status` +srs_*.
- **`public/db/local-db.js`** — `setWordStatus(lemmaKey,status,sched?)` (UPSERT, сохраняет srs при плоском set), `getSrsSchedule()`; **D7:** `recordRecall(day,available)`/`noteAvailable(day,available)` (UPSERT, per-day MAX available) / `getStudyDays(since?)`.
- **`public/library.html`** — Зал-шелл + CSS (`.room-study-*`, `.room-train-*`, `.reader-tip-*`, `.reader-skeleton-*`, `--prov-*` контраст-vars, aidsPulse под reduced-motion). Футер `#roomFooterVersion`.
- **`public/index.html`** — Студия. **НЕ ТРОГАТЬ** при работе над Залом (до Stage 2). Live JS Студии — INLINE в index.html (public/check_script.js — мёртвая копия).
- **`public/i18n/locales/{ru,en,he}.js`** — `room.morph.study.*` + `room.onboard.readerTip1/2`.
- **Smoke:** `scripts/premium/reader-morph-smoke.js` (collectNewWords/collectReviewItems/buildClozeForTarget/pickDistractors/nextSrs/openWordCard + **D3 dueCounts · D4 rankByWeakness · D1 findSlot/buildMcSlotOptions · D7 streakFromDays/streakView (fold/grace/rest-credit/future-clamp, +13)**), `scripts/premium/reader-word-status-smoke.js` (+миграция 058/059 + persist/preserve + **D7 study_day леджер recordRecall/noteAvailable/getStudyDays**), **`scripts/premium/reader-cloze-audit.js`** (`smoke:reader-cloze:audit` — D1 slot-coverage аудит, 96.5%, отчёт → `docs/research/epic4-3b-d1-slot/2026-06-29/`).

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
npm run smoke:reader-morph          # движок: cloze/distractors/nextSrs/collect* + D3 dueCounts/D4 rankByWeakness/D1 findSlot+buildMcSlotOptions
npm run smoke:reader-cloze:audit    # D1: slot-inflection охват ≥96.5% + bad-form 0 (R1/R10/R11)
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
| ~~**D1**~~ ✅ | Полный slot-inflection дистракторов (ОТГРУЖЕН v3.11.35/36, охват 96.5%) | R10 | done — findSlot+buildMcSlotOptions, dict-as-bank, L4 |
| **D2** | Cross-text «due today» | R2/R5 | C2 готов; нужны ТЕЛА др. работ для клоуза вне открытого текста |
| ~~**D3**~~ ✅ | Видимый due-счётчик (ОТГРУЖЕН v3.11.33) | R4/R5 | done — два числа «В работе/К повторению» |
| ~~**D4**~~ ✅ | Weakness-weighting + лич-няж (ОТГРУЖЕН v3.11.34) | R2 | done — rankByWeakness lapses↓ + leech opt-in |
| ~~**D5**~~ ✅ | Teach-before-test (ОТГРУЖЕН v3.11.38/39) | R2/R8 | done — renderTrainTeach, показ≠recall, 🔊 слово+предложение |
| **D6** | Reverse / listening / dictation | R8/R2 | reuse baked-аудио + B5 accepted-skeletons |
| **D7** | Gamification (стрик/дневная цель) | R5 | парн. к D2/D3; держать «мягкой» (без тёмных паттернов) |

**Предложенная очередность (владелец решает):** дешёвые на готовом C2 сначала → **D3 → D4 → D1 → D5 → D7 → D2/D6** (D2/D6 крупнее — нужны тела работ / новые каналы). Каждый пункт — отдельная фаза с гейтами по образцу A/B/C (headless-smoke + @380px реальным путём + прод/Kapture live-verify).

**Рекомендация на старт следующей сессии:** D1+D3+D4+D5 ОТГРУЖЕНЫ (v3.11.33–38). Следующее по очередности — **D7 (геймификация, R5):** мягкий стрик / дневная цель повторений → внешнее давление возврата (привычка — двигатель SRS); парная к D3-due-счётчику; локальное хранилище стрика/цели; ⚠ держать «мягкой», без тёмных паттернов. Затем **D6** (reverse RU→HE / listening / dictation — новые каналы извлечения, reuse baked-аудио + B5) · **D2** (cross-text due — нужны тела др. работ для клоуза вне открытого текста; крупнее). Перед кодом — краткий план + развилки + measure (как обычно). ⚠ training-флоу live-verify — на ОДНОРАЗОВОМ тексте (см. §6 урок).

**D7 — техно-скаффолд для старта (ПОДСКАЗКИ-зацепки, НЕ решения — дизайн через план+развилки+measure, владелец решает):**
- **Ценность (из плана 4.3b §Phase D, дословно):** внешнее давление возврата (стрик, дневная цель) → двигает ЕЖЕДНЕВНЫЕ повторения (привычка — то, что заставляет SRS работать) → выше удержание. Парная к D3-due-очереди. ⚠ «мягкая», без тёмных паттернов (R5).
- **Источник данных «сделано сегодня»:** `localDb.getSrsSchedule()` + `ReaderMorph.dueCounts(states,schedule,now)` уже дают `{inProgress,dueNow,nextDue}` (D3). Прогресс дня = сколько recall-ответов/слов сегодня. Запись расписания идёт в `checkTrainAnswer` (там же удобно инкрементить дневной счётчик/стрик).
- **Хранилище стрика/цели (развилка):** localStorage (просто, device-local, как `wordStatusEnabled`/`contextConsent`) ИЛИ новая мелкая таблица/строка в OPFS (переживает, синкабельно). Детерминизм: `Date.now()` только в UI-слое (не в чистом движке) — день считать по локальной дате; чистую логику стрика (`nextStreak(prev, lastDayStr, todayStr, goalMet)`) вынести pure+Node-тест (как dueCounts/nextSrs).
- **Хуки:** `checkTrainAnswer` → инкремент дневного счёта + обновление стрика при достижении цели; `refreshDueBadge`/итог сессии (`renderTrainSummary`) → показ «🔥 N дней · сегодня k/цель». Reuse паттерн D3-бейджа (`_dueBadgeEl`/`refreshDueBadge`) для отображения.
- **Развилки на план:** где показывать (бейдж рядом с due-счётчиком / строка в итоге сессии / тост); что считать «целью дня» (N recall-ответов? N слов? due-очередь пуста?); считать ли стрик по любому заходу или только по достижению цели; жёсткость («мягкая» — без потери при пропуске дня? grace-day?).
- **Гейт:** pure `nextStreak`/дневной-счёт → reader-morph smoke (детерм., инъекция дат); @380px бейдж/итог; live на ОДНОРАЗОВОМ тексте.

---

## 6. Ловушки/память (не наступить повторно)
- **OPFS multi-tab лок:** live-тест Kapture блокируется, если открыт другой linguistpro-таб. Закрыть всё, кроме одного.
- **Windows curl + иврит:** коверкает не-ASCII тела → ложное «egress blocked». Прод-проверки иврита — Node fetch / браузер.
- **Headless OPFS:** `importBundle` крашит wa-sqlite headless (мелкие записи ок) → reader-фичи верить через logic-gate + parity + plumbing-smoke; полный клиент = устройство владельца.
- **SW кэш:** бампить `CACHE_VERSION` при любом index.html/locale/shell изменении, иначе сырые i18n-ключи / старый shell.
- **SW авто-обновление (v3.11.37+):** SW теперь `self.skipWaiting()` на install + `clients.claim()` на activate + гард `controllerchange`→reload в library-ui → **свежий код подхватывается с ПЕРВОГО reload** (live-verify: один Kapture-reload с v3.11.36→v3.11.37 без SKIP_WAITING/unregister). Прежний 2-reload/unregister-танец БОЛЬШЕ НЕ НУЖЕН. (Память [[feedback_browser_verify_fresh_code]] обновлена.)
- **Live-verify training-флоу — на ОДНОРАЗОВОМ baked-тексте, НЕ на рабочем профиле.** В сессии `buildTrainSession` ранжирует leveled+previously-failed ПЕРЕД never-tested-new; дойти до нужного айтема (teach/конкретный режим) можно только листая, а skip/ответ ПИШУТ srs/level (skip=soft-demote+lapse). На D5-проверке дошёл до teach через 11 skip = soft-demote 11 слов владельца. **Движок-уровень** (`window.ReaderMorph.*`) live-verify-ить напрямую через `mcp__kapture__evaluate` — БЕЗ сессии, нулевая мутация (как D1 `buildMcSlotOptions` на реальных словах). Память [[feedback_live_verify_training_throwaway_text]].
- **Студия live = INLINE в index.html** (не public/check_script.js).
- Полный журнал уроков — память-файлы `feedback_*` (см. MEMORY.md): linebreak, cloze-skeleton, upsert-preserve, no-override-grounded, ktiv-surface-key, workflow-front-size, verify-stale-plan-vs-live-code и др.

---

## 7. РЕКОМЕНДОВАННЫЙ СТАРТОВЫЙ ПРОМТ (вставить в начало новой сессии)

```
Продолжаем разработку Читального зала (Ben-Yehuda Reading Room) в проекте
tts-prototype-android (Node.js/PWA, иврит↔русский; несмотря на имя — не Android).

ПЕРВЫМ ДЕЛОМ прочитай (Read), не пересказывай:
1. docs/planning/BRR_HANDOFF_NEXT_SESSION_2026_06_28.md ← READ FIRST. Верхний блок
   «СОСТОЯНИЕ — АКТУАЛЬНО» + «PHASE D — статус» АВТОРИТЕТНЫ (§0–§5 — baseline на
   v3.11.32, намеренно не переписан; карта кода §2 и гейты §4 дополнены D-функциями).
2. по ссылкам §0: BRR_EPIC4_3B_RECALL_CLOZE_2026_06_28.md (план 4.3b + Phase D, §«D1/D3/D4/D5 SHIPPED»),
   BRR_EPIC4_3B_D1_SLOT_DISTRACTORS_2026_06_29.md (D1), CLAUDE.md (нормы, CSS-ловушки
   index.html, prod-деплой, artifact storage rule), docs/PROJECT_ROLES.md (R1–R11).

СОСТОЯНИЕ: прод v3.11.39, ветка main чистая (последний коммит dcc3433).
Эпик 4 (петля удержания collect→mark→recall) ЗАВЕРШЁН. Phase D: D1 (slot-inflected
MC-дистракторы, R10-моат, охват 96.5%) · D3 (видимый due-счётчик) · D4 (weakness-
weighting + лич-няж) · D5 (teach-before-test) — ОТГРУЖЕНЫ и live-подтверждены.
PWA auto-skipWaiting: свежий код подхватывается с первого reload.

СЛЕДУЮЩЕЕ (одобрено владельцем) — D7 (геймификация, R5): мягкий стрик / дневная
цель повторений → внешнее давление возврата (привычка — двигатель SRS); парная к
D3-due-счётчику; БЕЗ тёмных паттернов. Техно-зацепки (НЕ решения) — в §5 handoff
«D7 — техно-скаффолд». Затем по очередности D6 (reverse/listening/dictation), D2
(cross-text due — нужны тела работ).

КАК РАБОТАТЬ: применяй роли-линзы R1–R11 автоматически; measure-before-code (R10);
держи 7 инвариантов §3 (key-parity save==paint==collect · UPSERT не INSERT OR REPLACE ·
cloze по СКЕЛЕТУ · R11 do-no-harm/oracle-independence · детерминизм без Math.random/
Date.now в чистом движке · Room-only/parity-safe, index.html и reader-core не трогать ·
premium-UI перенос строк по логической границе). Цикл деплоя §4 (зелёные гейты →
bump version+SW+футер → push → Coolify → prod-verify Node fetch no-store, НЕ curl →
live-verify). ⚠ training-флоу live-verify — на ОДНОРАЗОВОМ baked-тексте или через
движок-eval (window.ReaderMorph.*), НЕ листая рабочий профиль (skip/ответ мутируют srs).

СНАЧАЛА: покажи краткий план D7 по релевантным ролям (R5 + R2/R4), развилки с
рекомендацией (где показывать стрик/цель · что считать «целью дня» · хранилище
localStorage vs OPFS · жёсткость/grace-day) и нужные измерения (есть ли смысл; что
уже дают getSrsSchedule()/dueCounts) — я решу, прежде чем писать код. Без заглушек,
бескомпромиссное качество.
```
