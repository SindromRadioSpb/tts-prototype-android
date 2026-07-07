# Handoff

## State
- **P7.2a reverse:tg + P7.2b cloze:tg — SHIPPED (v3.11.120/121), deploy DORMANT (AGENT_REVIEW_WRITE
  OFF).** Полный Telegram review-поток: /review → reverse (RU-глосс→HE) ИЛИ cloze (пропуск в СВОЁМ
  тексте, expected=поверхность) → challenge-bound grader → single-use write → FSRS → verdict.
  Гейты: telegram-review 32/32, telegram-cloze 21/21. Owner P7.2a live-verified.
- **P7.2c dictate:tg — ЧАСТИЧНО (foundation + grade-policy D-4, dictate-канал ЕЩЁ НЕ СОБРАН).**
  Owner: word-prebake офлайн + keyless-раздача, СЕРВЕРНОГО TTS-ключа НЕТ. Критика wf_6732a80f
  (6 BLOCKER+8 MAJOR). Замер омофон-покрытия: **~78% лемм dictate-безопасны** (docs/research/
  dictate-homophone-coverage). Owner-форки: **D-4 = modality-сегментированный hasProductionSuccess**
  (dictate-успех не сертифицирует reverse) — СДЕЛАНО (grade-policy.hasProvenProduction, gate 28/28);
  **D-5 = частотный/курс-словарь лемм** (не PII, не due-проекции). Foundation СДЕЛАН: computeDictate
  AssetKey (нормализован NFC+trim, shared bake↔сервер) · keyingService.dictateFormForItemKey ·
  audioRepo.hasAsset. Канон TELEGRAM_P7_2c_DICTATE_SPEC (v1→v2 адъюдикация в конце).

## Next — ДОСОБРАТЬ P7.2c dictate (spec v2, все фиксы + D-4/D-5 в спеке)
1. keyingService: ОМОФОН-ФИЛЬТР в dictateFormForItemKey (фонемный индекс звук→написание; допускать
   ТОЛЬКО если РОВНО одно написание — иначе ложный lapse; коллапс ת/ט,כ/ק/ח,ס/ש,א/ע/ה,ב/ו,matres +
   niqqud-гласные, см. docs/research/dictate-homophone-coverage/measure.js).
2. audioRepo.hasAsset → FILE-FIRST (fs.existsSync(DATA_DIR/audio-cache/<key>.mp3); прод-push кладёт
   ФАЙЛ, не DB-ряд). 3. grader: strict=/^(cloze|dictate)/ + dictate write-gate (любой near_miss →
   recorded:false). 4. reviewer: ветка prompt_kind==='dictate' → expected=chal.expected_surface;
   evidence_scope FAIL-CLOSED для production (не '||lexeme'); CHALLENGE_CHANNEL_RE +=dictate:tg.
   5. api.sendAudio + file_id-кеш (migration 030 telegram_file_cache +bot_id, инвалидция+URL-retry);
   PUBLIC_BASE_URL env валидируется на старте. 6. review.js: selectEligible 2-ПРОХОДА (dictate по
   ВСЕМ items, потом reverse — анти-старвация) + dictate _capsFor (evidence_scope='cell', privacy=A,
   shown_stimulus=assetKey) + аудио-доставка. 7. bake-tool scripts/premium/bake-dictate-audio.js
   (ЧАСТОТНЫЙ словарь, не проекции; мой BYOK; push mp3 на том). 8. Гейт smoke:telegram-dictate —
   НЕЗАВИСИМЫЙ ОРАКУЛ (реальный bake-tool, файл прод-путём, file-first hasAsset, омофон-фильтр,
   dictate-strict, D-4 контраст). → deploy dormant. **P7.2d selector — после (3 модальности).**

## Context
- Каноны P7.2: TELEGRAM_P7_2_REVIEW_{ASSETS_PROPOSAL,SPEC_v3} · _P7_2b_CLOZE_SPEC · _P7_2c_DICTATE_SPEC
  (у каждой v→v адъюдикация критики в конце). Замеры: docs/research/{telegram-p72-gloss-ambiguity,
  dictate-homophone-coverage}.
- Рабочая дисциплина (сработала 3× подряд): spec → adversarial-критика в ФОНЕ (Workflow, 3 линзы,
  grounded file:line) → measure-before-code для сомнительного → адъюдикация → foundation → wiring →
  гейт (НЕЗАВИСИМЫЙ оракул, не тавтология) → регрессия → commit+push dormant.
- Гейт-урок (переиспользовать telegram-review/cloze harness): reply-таргет ИЗ БД (setPromptMessageId
  асинхронен); resetState() между тестами (успех продвигает FSRS-due); bootstrap-login = ОДИН юзер.
- Git: многострочные коммиты — `git commit -F файл` (heredoc). Флаг AGENT_REVIEW_WRITE прод OFF.
- ⚠ Инварианты P7.2: запись ТОЛЬКО challenge-bound · production-unlock webhook-trusted
  (ctx.viaTelegramReview) · privacy (сырой ответ/класс-C не персистятся) · consent recheck перед write
  · grader детерминированный · dictate: НЕТ серверного TTS-ключа, assetKey by construction, омофон-
  фильтр, D-4 modality-сегментация.
