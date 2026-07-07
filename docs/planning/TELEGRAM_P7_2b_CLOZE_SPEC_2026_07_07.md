# CLG-P7.2b — cloze:tg (контекст-cloze) spec (к коду)

> Продолжение P7.2a (reverse SHIPPED v3.11.120). cloze = вторая production-модальность: предложение
> из СОБСТВЕННОГО текста пользователя с пропуском → пользователь вписывает недостающее слово.
> Контекст снимает многозначность (решает то, что вырезано из reverse: expected = КОНКРЕТНАЯ
> поверхность вхождения, а не лемма → синонимы не проблема). Research wf_56ed38f5 (cloze-линза):
> примитивы готовы, но серверного якоря due→предложение НЕТ → строим bounded-scan. Заземление
> (2026-07-07): agentSentenceRepo.js (point-lookup + двойной consent), learnerArtifactsRepo.js
> (list/get синхронизированных текстов, payload texts[].rows[]), keyingService.resolveWords,
> reader-morph.buildClozeForTarget/tokenize (pure, Node-requirable), grader (channel-agnostic).

## 0. Модальность cloze:tg

Prompt = предложение с «_____» на месте due-слова + RU-перевод предложения (контекст). Ответ =
поверхность пропуска. Честное production-в-контексте. Данные = СОБСТВЕННЫЕ тексты пользователя
(класс C) за двойным consent (`cloud_texts` + `agent_read_texts`). Покрытие: только due-слова,
встреченные в синхронизированных текстах (в пределах scan-бюджета) → иначе fallback reverse/Зал.

## 1. Bounded sentence-scan (новый модуль `db/agentClozeRepo.js` — читатель, не писатель)

`selectClozeChallenge(userId, dueSet, exposedCheck)`:
1. двойной consent (learnerArtifactsRepo.hasConsent + agentSentenceRepo.hasAgentReadConsent) —
   fail-closed; нет → вернуть null (fallback на reverse).
2. `list(userId)` → артефакты (метаданные). Для каждого (до cap `MAX_ARTIFACTS_SCAN`): `get` →
   parse payload → texts[].rows[] (предложения: hebrew_plain, hebrew_niqqud, russian, order_index).
3. для каждого предложения (до глобального cap `MAX_SENTENCES_SCAN`, тайм-бюджет): tokenize
   (reader-morph) → resolveWords (keyingService) → найти ПЕРВЫЙ токен, чей item_key ∈ dueSet И
   не в cooldown (exposedCheck) → это cloze-цель. Early-exit на первом совпадении.
4. buildClozeForTarget(tokens, stripNiqqud(surface)) → { blanked sentence, answer=surface, count }.
   Годен ТОЛЬКО если ровно один пропуск в предложении (count===1) И длина предложения разумна
   (не одно слово, не гигант) → иначе следующее.
5. вернуть { item_key, surface, blanked_he, sentence_ru, text_key, order_index, sense_он? }.
   **shown_stimulus = blanked_he + перевод (класс C).** expected = surface (огласовка снимается grader).

Перф/стоимость (риск, критика замерит): resolveWords грузит ~306MB bundle; scan ограничен
жёсткими cap + early-exit + тайм-бюджет (~2с). Не найдено в бюджете → честный fallback (не «тихий 0»).
Индекс text→lemma на upload (как corpus-vocab-v7) — оптимизация НА ПОТОМ, не в MVP.

## 2. Схема challenge (расширение agent_challenges — миграция 029)

Добавить (nullable, обратно-совместимо с reverse):
```
expected_surface TEXT ·        -- для cloze: поверхность пропуска (grade против неё, НЕ леммы)
anchor_text_key TEXT ·         -- (text_key, order_index) вхождения — аудит/восстановление
anchor_order_index INTEGER
```
prompt_kind='cloze' · review_mode='cloze:tg' · stimulus_privacy_class='C' · stimulus_source='synced-sentence'.
Для reverse поля NULL (без изменений).

## 3. Reviewer — cloze grade-путь (expected=surface, challenge-bound)

- CHALLENGE_CHANNEL_RE: `/^(reverse|cloze):tg$/` (добавить cloze).
- expected: если chal.prompt_kind==='cloze' → display = chal.expected_surface (НЕ displayForItemKey);
  guard EXPECTED_UNRESOLVED если пусто. grader.gradeAnswer(expected:{form:surface}, answer, channel:
  'cloze:tg', ...) — skeleton-match (огласовка снимается) → correct; иначе wrong. Синоним-приём НЕ
  нужен (expected = конкретная форма из ЕГО текста).
- evidence_scope: **см. решение D-1** (по умолчанию 'cloze' = context-supported, исключается из
  hasProductionSuccess как lexeme → cloze-успех НЕ отключает dictate-D1-Hard).
- всё остальное — как P7.2a (claim→ingest→complete/release, детерминир. chrev-id по challenge_id,
  reviewed_at=challenge.created_at, meta += challenge_id/evidence_scope/sense_id, privacy=A).

## 4. grade-policy — cloze как production

`PRODUCTION_PREFIXES = { dictate:1, reverse:1, cloze:1 }` — cloze требует ПОРОЖДЕНИЯ формы. Cloze-
провал на рецептивно-сильном → D1-Hard (как reverse). hasProductionSuccess исключает evidence_scope
∈ {'lexeme','cloze'} (context-supported ≠ unsupported dictate-компетенция). gate-consumers-sweep:
Зал не пишет channel 'cloze' → do-no-harm. **Owner-решение D-1 фиксирует scope-политику.**

## 5. Consent / privacy класс C (жёстче reverse)

- eligibility требует ОБА: cloud_texts + agent_read_texts (иначе cloze недоступен → reverse/Зал).
- shown_stimulus = blanked-предложение пользователя = **класс C** → на revoke ЛЮБОГО из
  {telegram_delivery, cloud_texts, agent_read_texts} или unlink: challenge cancelled + **shown_stimulus
  обнулён (tombstone)** (не только status — сам класс-C текст стирается). Расширить cancelOpenForUser
  → purgeClassCStimulus. Delivery-point recheck в submitAnswer включает ОБА text-consent'а.
- stdout-гигиена: предложение пользователя НИКОГДА в console/throw (как agentSentenceRepo класс D).

## 6. /review селекция (mini-selector; полный skill-selector = P7.2d)

`selectEligible`: (1) cloze если двойной consent + предложение найдено в бюджете → cloze:tg;
(2) иначе reverse strictSafe (P7.2a); (3) иначе «в Зал». Cooldown (exposure) общий: показанная в
cloze/reverse/`/due` форма не переиспользуется 30 мин.

## 7. Verdict (безопасно; предложение пользователя — класс C, но ЕГО же текст ему же)

- prompt = blanked_he + «\n\n(перевод: <ru>)» + «(ответь словом на пропуск · не знаю · не сейчас)».
- correct → «✅ Верно, слово подходит по контексту.»; wrong → «Не засчитано. Пропущено: «<surface>».»;
  D1-Hard → «Почти — в чтении знакомо, верну раньше.»; skip/не-сейчас — как P7.2a.
- denylist как P7.1b/P7.2a (item_key/challenge_id/text_key/order_index/sense_id/провенанс скрыты).

## 8. Гейт `smoke:telegram-cloze` (+ регрессия telegram-review/pairing/content/grade-policy/agent-review)

Сид: user + link + cloud_texts + agent_read_texts + синхронизированный артефакт (payload с
предложением, содержащим инфлектированную форму strict/любого due-слова) + due-проекция. Кейсы:
1. cloze выбран при двойном consent; prompt = предложение с «_____», содержит перевод, НЕ содержит
   surface (prompt≠answer). 2. expected=surface (не лемма): correct на surface-форме; лемма ≠ surface
   → (если отличается) wrong/near_miss честно. 3. класс C: revoke agent_read_texts → cloze недоступен
   → fallback reverse (ИЛИ Зал). 4. revoke cloud_texts/agent_read_texts между prompt и ответом →
   zero-write + challenge cancelled + **shown_stimulus обнулён**. 5. предложение пользователя НЕ в
   review_log meta / bot_action_log / stdout (класс C). 6. cloze production: cloze-провал на
   рецептивно-сильном → grade 2 (D1). 7. evidence_scope=cloze (не 'lexeme'; не защёлкивает dictate).
   8. scan-бюджет: due-слово БЕЗ синхронизированного предложения → cloze null → fallback (не «тихий 0»).
   9. single-use/детерминизм/reply-binding/«не сейчас» — как P7.2a (переиспользовать шаблон).

## Открытые owner-решения (рекомендации)

- **D-1 evidence_scope cloze**: cloze = context-supported production. Рекомендация: scope='cloze',
  ИСКЛЮЧАЕТСЯ из hasProductionSuccess (как lexeme) → cloze-успех НЕ отключает dictate-D1-Hard
  (диктант = unsupported, строже). Cloze-ПРОВАЛ всё равно → D1-Hard. Альтернатива: cloze='cell'
  считается полной production-компетенцией (тогда cloze-успех отключает dictate-мягкость — жёстче).
- **D-2 приоритет cloze vs reverse** в /review: рекомендация — cloze первым (reading-first, контекст
  честнее и богаче), reverse как fallback. Полный выбор по навыку — P7.2d.
- **D-3 множественные вхождения**: если лемма встречается в неск. предложениях — берём первое в
  scan-порядке, ровно один пропуск (count===1); многопропускные предложения пропускаем.

## Инварианты (через слайс)

Запись ТОЛЬКО challenge-bound · expected=поверхность (cloze) доказуемо≠prompt · production-unlock
только webhook-trusted · privacy: сырой ответ не персистится + shown_stimulus класс C purge на revoke ·
двойной consent recheck перед write · grader детерминированный · scan bounded + честный fallback.

---

## v1 → v2 адъюдикация критики wf_cd5d049a (2026-07-07)

Критика (3 линзы: 6 BLOCKER + 6 MAJOR + 2 MINOR). Ключевой поворот + фиксы:

**[СДЕЛАНО в foundation] Гомограф-BLOCKER → vocalized-exact-match.** dataset-уникальность
консонантного skeleton ≠ контекстная дизамбигуация (в классическом тексте skeleton может быть
другим словом/именем). Фикс: матч по ОГЛАСОВАННОЙ форме против vocalized-ячеек целевого pid (niqqud
различает омографы) + functionGate (служебные/имена не кредитуем) + require-niqqud (токен без
огласовки → skip). Бонус: покрытие ЛУЧШЕ (לכתוב 27/27 vocalized-unambiguous vs 5/24 консонантных).
clozeFormsForItemKey теперь возвращает {voc, skeleton, unambiguous}; scan матчит voc-точно.
selectClozeChallenge → ДИСКРИМИНИРОВАННЫЙ результат ({none:'no-consent'|'no-due-forms'|'no-artifacts'|
'budget'|'no-match'}) — budget-timeout ≠ definitively-empty (не рендерить «нечего» на таймаут).

**[К СБОРКЕ — task #17/#18] Остальные BLOCKER/MAJOR:**
- expected=surface wiring: createChallenge INSERT + caps ДОЛЖНЫ писать expected_surface/anchor_*
  (029-колонки); reviewer cloze-ветка display=chal.expected_surface (НЕ displayForItemKey=лемма) +
  CHALLENGE_CHANNEL_RE=/^(reverse|cloze):tg$/ + EXPECTED_UNRESOLVED guard. Синхронный набор.
- КЛАСС-C purge: purgeClassCStimulus (NULL shown_stimulus+expected_surface+anchor_* где
  stimulus_privacy_class='C') в cancelOpenForUser + на complete/decline/expire для cloze (класс-C не
  переживает закрытие challenge, не только revoke). pruneOld тоже скрабит.
- consent-каскад: revoke cloud_texts И agent_read_texts → cancelOpenForUser+purge (server.js сейчас
  только telegram_delivery). Best-effort + audit, не молчит.
- double-consent recheck на ДВУХ границах: (1) reviewer._grade перед ingest (cloze → hasConsent
  cloud_texts && agent_read_texts, fail-closed → release, zero-write); (2) _deliverPrompt перед
  api.sendMessage (fail-closed → cancel+purge, не слать класс-C). stillAuthorized cloze-ветка
  недостаточна — нужен recheck у точки write и точки send.
- grade-policy: PRODUCTION_PREFIXES += cloze И hasProductionSuccess исключение → {lexeme,cloze}
  ОДНОВРЕМЕННО (иначе cloze-успех защёлкивает dictate-компетенцию). evidence_scope='cloze' на
  challenge. gate-consumers-sweep: channelStats/planner productionImbalance ТОЖЕ должны исключать
  {lexeme,cloze} из production-bucket (иначе cloze-успех снимает dictate-рекомендацию — рассинхрон с
  hasProductionSuccess); constructs.js имеет СВОЙ isProductionChannel (третье определение) — свести.
- grader проклитик: channel-aware — для cloze:tg НЕ добавлять проклитик-снятый вариант на expected-
  стороне (בבית требует предлог; ответ בית → near_miss/wrong, не accepted_variant).
- harness: гейт сидит due-проекцию из КЛИЕНТСКОГО keying (не только «fallback сработал»); ассерт
  item_key-parity (scan кредитует ТОТ ЖЕ ключ); surface≠lemma доказуемо (correct-on-surface,
  wrong-on-lemma); класс-C purge NULL всех полей после revoke; discriminated no-match≠consent-off.
- перф (MINOR): warm keyingService.ensureLoaded ДО тайм-бюджета (не считать load в 2.5с); индекс
  text→форма на upload — оптимизация на потом.
