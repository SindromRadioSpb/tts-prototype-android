# HANDOFF · 2026-07-02 (вечер) — READ FIRST для новой сессии

> Заменяет `BRR_HANDOFF_NEXT_SESSION_2026_06_30.md` как точка входа. Прод **v3.11.80**,
> main `994cbf2`. Сессия 2026-07-02 отгрузила 13 прод-версий (v3.11.68→80); параллельная
> «дежурная» сессия babysit-ит Dicta-конвейер (см. §3 — НЕ трогать из новой сессии).

## §1. Что отгружено сегодня (всё на проде, все гейты зелёные)

1. **Context-overlay (стратег. задача №1) P0–P4 + P5-плюминг** — офлайн авторитетная
   контекст-морфология тап-карты. Канон: `BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md`
   (§9 sign-off D1–D7, §10 адверс-критика: 4 BLOCKER+9 MAJOR исправлены). Гейт
   `smoke:reader-ctx-overlay` (герметичный, vs frozen human-gold: control 97.2%→97.2%,
   tail 44.1%→60.3% уже на текущих фактах). Осталось ТОЛЬКО Dicta-bound (§3).
2. **Мульти-корпусная «Библиотека»** (гибрид B+C «витрина+линза») — реестр
   `public/js/corpus-registry.js` (манифесты + честные бейджи + **единый retrieval-контракт
   §4 дока = требование по умолчанию для будущих корпусов**), L0-хаб, свитчер-пилюля, корпус
   «Мои тексты» (PRO-поиск `#тег`/скоупы строк-заметок/ALL-ANY/5 сортов/смарт-рейл ⏱🔥✓✨📝📍🎯⭐),
   тот же смарт-рейл + #tag + сорт «Последние открытые» в Бен-Иегуде. Канон:
   `BRR_MULTI_CORPUS_DESIGN_2026_07_02.md`. Гейт `smoke:reader-mytexts`.
3. **Студия↔Зал совместимость Ф1** — корпус-тексты управляемы из «Библиотеки (v3)»:
   пилюли Мои/Бен-Иегуда/Все, бейдж «🏛 канон», личная мета в **overlay-таблице
   `text_user_meta` (мигр. 061, ключ text_key — переживает re-import)**, канон-поля read-only,
   «Убрать с устройства», «Обогатить» заблокирован (R11), deep-link `?open=<text_key>` (Room),
   «В Зале» на своих текстах. Канон: `BRR_STUDIO_ROOM_COMPAT_2026_07_02.md`. Гейт
   `smoke:studio-corpus`.
4. **Мульти-вкладки разблокированы (P0-1 v2)** — фолловер-вкладки прозрачно проксируют весь
   localDb-API во вкладку-владельца (BroadcastChannel; OPFS-соединение одно; failover прежний;
   активный late-join самоподключает застрявшего фолловера; транзиент носит тост, модал только
   после 25с). 5 живых Kapture-отладок; урок `feedback_gate_consumers_sweep` (5 разбросанных
   потребителей состояния = 3 деплой-раунда). Гейт `smoke:multitab` 8/0.

## §2. Стратегическая последовательность (владелец, recon §9; пилот отложен бессрочно)

1. ✅→§3 #1 context-overlay · 2. ✅ B «Мои тексты» (перевыполнено) ·
3. **← СЛЕДУЮЩЕЕ: retention-программа** (#2 FSRS + #5 канон-модель памяти + #6 reading-native
   retrieval — ОДНА программа; см. промт запуска в конце handoff) ·
4. #3 инструментовка пилота (триггер: новая дата, лид ~3 нед) · 5. #4 E2E-sync recon ·
6. AI-graded-генератор recon.
Буфер мелочей: i+1-покрытие своих текстов (measure-first) · i18n-хвост проклитик-чипов ·
byline/W1-b/Wave-2 · сниппеты совпадений в PRO-поиске.

## §3. Dicta-конвейер (дежурит ДРУГАЯ сессия — НЕ трогать: lock на кэше)

Dicta nakdan `/api` = 503 с 01:09 (второй длинный аутэйдж за двое суток). Весь код готов,
конвейер самоходный после восстановления:
proclitic-добейк (идёт, PID-lock `.tmp/benyehuda/dicta-cache.lock`; ledger 530/796, 32 degraded)
→ re-push proclitic (без --skip-existing) + `--attested` → context `--enrich` (33K предл., ~8ч)
→ `--bake --force` → `npm run push:corpus-context` (энфорсит `entriesPendingNq===0`) →
прод-верифи. Новая сессия: не запускать Dicta-жадное, не писать в `.tmp/benyehuda/*`.

## §4. Grounding для retention-recon (следующая сессия)

- **Что уже есть:** Room mini-SRS (Эпик 4.3b: `word_status.srs_*` (due/interval/reps/lapses/
  source-anchor), `study_day` ledger, D2 cross-text due-очередь «🔁 К повторению», recall-loop
  cloze→MC→typed; pure-движок в `reader-morph.js`: nextSrs/dueCounts/rankByWeakness/streak) ·
  Studio Trainer = **SM2-стаб** (inline index.html @~28663) · Anki: export .apkg
  production-grade + двусторонний sync (R-2/R-3), GUID-канон · notes_v2 полиморфные ·
  канон lemmaKey (`feedback_ktiv_surface_key_consistency`).
- **Доки:** `docs/SRS_STRATEGY_v3_2.md` (LinguistPro=creation, Anki=review, FSRS отложен) ·
  `docs/ANKI_SYNC_ENGINE_DESIGN_2026_06_17*` · `docs/planning/BRR_EPIC4_RETENTION_LOOP_2026_06_26.md`
  · память [[project_srs_strategy]] [[project_anki_sync_design]] [[project_review_anki_roadmap]].
- **Сложное ядро recon:** (1) канон-модель памяти — унификация word_status.srs_* / srs_cards /
  notes_v2 / Anki-GUID вокруг lemmaKey (derived≠asserted; миграция без потери прогресса);
  (2) FSRS-планировщик (pure dual-export, замена SM2-стаба и Room-mini-SRS, дефолтные веса vs
  оптимизатор, калибровка); (3) взаимодействие с Anki-sync (кто истина при конфликте ревью);
  (4) reading-native retrieval — due-слова в живом чтении (уникальная фича; D2-очередь =
  фундамент); (5) метрика удержания + честные гейты.
- **Уроки-инварианты:** адверс-критика R-ролей ДО кода · live-verify тренинга на ОДНОРАЗОВОМ
  тексте (D5!) · test-with-nonempty-profile · gate-consumers-sweep · UPSERT-preserve ·
  commit+push+prod-verify · i18n×3.
