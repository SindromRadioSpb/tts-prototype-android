# Calibrated Diagnostic Quiz — Item Bank Native Review Brief

> **Version:** 1.1 · **Date:** 2026-05-15 · **Status:** ready to dispatch to reviewer
> **Goal:** довести `docs/QUIZ_ITEM_BANK_DRAFT.md` до production-quality для real-cohort deployment Direction 13 в LinguistPro.
>
> **Companion docs:**
> [`docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md`](PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md) (полный план; §5 описывает этот workflow) ·
> [`docs/QUIZ_ITEM_BANK_DRAFT.md`](QUIZ_ITEM_BANK_DRAFT.md) (20 items на review) ·
> [`docs/QUIZ_ITEM_BANK_REVIEWER_FORM.md`](QUIZ_ITEM_BANK_REVIEWER_FORM.md) (fillable form для возврата) ·
> [`docs/QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md`](QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md) (AI pre-review — supplementary context, override at will) ·
> [`docs/ULPAN_RESEARCH_PLAN_v3_2.md`](ULPAN_RESEARCH_PLAN_v3_2.md) §11.6 outcome capture.

## 0. Current state (v3.3.5 shipped 2026-05-15; gate reframed as soft)

LinguistPro v3.3.5 уже released на main с item bank в canonical form (`public/quiz/ulpan_diagnostic_v1.json`) — это **adoption of an AI-pre-reviewed Premium-alt draft + project-owner provisional sign-off**, см. `QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md` + `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §5` для history. Шипованы:

- UI quiz modal + i18n RU/EN/HE (`public/js/quiz-ui.js`)
- Rasch 1PL scoring engine (`public/js/quiz-scoring.js`)
- Server validator extension (`research/validate.js`)
- Teacher dashboard quiz/CEFR/SE columns
- Admin reset CLI (`scripts/research/reset_quiz_for_student.js`)
- 19 smoke suites / **283+ cases ALL GREEN** (incl. post-release admin CLI polish)
- Docs (`docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` — methodology + audit log)

**Update 2026-05-15 (gate reframing):** The hard pre-implementation gate (originally "no real-cohort deployment until external sign-off") was relaxed by user decision on 2026-05-15 — the project owner accepted the AI-pre-reviewed bank as good-enough for development + dogfood, so downstream runtime feature work (v3.3.6 M8 knowledge-graph) is no longer blocked. **Твой review остаётся РЕКОМЕНДОВАННЫМ перед запуском на реальной ulpan-группе** для диплома, но не блокирует код или планирование. Подробности — `docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md §5` + §7.

**Что твой review разблокирует теперь:** статус instrument's `production_ready` поле повысится с `"development_and_dogfood_only"` → `"full"`. Дополнительно `external_review_status` сменится с `"ai_pre_review_only"` → `"external_complete"`. В calibration audit log запишется sign-off с твоим attribution. Methodologically — это превращает quiz из "AI-validated" в "expert-validated" instrument для diploma claim.

Если ты найдёшь bugs / mis-calibrations — apply edits, я пересоберу JSON + re-run smoke + bump `instrument_id` only if items change materially. Если же items OK as-is — это short-form sign-off (просто подтверждение).

---

## 1. Cover message (для отправки в WhatsApp / Telegram / email)

> **Перед отправкой:** замените `<имя>`, `<контакт автора>`, `<deadline или «гибко»>` на конкретику. Привет от автора передаётся отдельно.

```
Привет, <имя>!

Можешь помочь с native review item bank для diploma research project?
В рамках LinguistPro я делаю калибровочную диагностику — короткий
тест из 20 вопросов, который позволит студентам ulpan-курса оценить
свой уровень иврита по шкале CEFR (A1-C1). Этот балл идёт parallel
к self-report экзамену в outcome-данных для дипломного исследования.

В двух словах:
- объём: 20 items (multiple choice, 4 options each), все вопросы
  представлены на иврите + переводы на русский + английский
- время: ~45-60 минут на сквозной review (можно по частям)
- срок: <deadline или «гибко, ориентируюсь по тебе»>
- задача: подтвердить, что каждый вопрос (a) грамматически корректен,
  (b) имеет однозначно правильный ответ, (c) соответствует
  заявленному уровню CEFR (A1/A2/B1/B2/C1), (d) не содержит
  культурных/политических/религиозных предубеждений

Распределение items:
- A1 (базовый) × 4
- A2 × 4
- B1 × 5
- B2 × 4
- C1 (продвинутый) × 3

Что нужно от тебя:
1. Прочитать `QUIZ_ITEM_BANK_DRAFT.md` (приложение).
2. Для каждого item: отметить чекбоксы «Грамматика / Уровень / Однозначность»,
   написать замечания если что-то нужно поменять.
3. Если item полностью забракован — предложить замену на том же уровне.
4. Подтвердить difficulty logits (placeholder values нужно reviewer-калибровать).
5. Если согласен на acknowledgment в дипломе — указать форму атрибуции.

Если возьмёшься — спасибо огромное; это разблокирует production-уровень
research-методологии. Без этого review мы не можем считать quiz
calibrated, а значит outcome-данные становятся слабее научно.

— <твоё имя>
<контакт автора>
```

---

## 2. Контекст и почему точность критична

`ulpan_diagnostic_v1` — это **research measurement instrument**, не просто UI-фича. Он:

1. **Уходит в outcome-данные диплома.** Score, CEFR band, и SE становятся частью статистики, на которой строятся claims о correlation между LinguistPro engagement и языковой compétence. Mismatch difficulty → биассированный correlation → методологический изъян.
2. **Является альтернативой self-report.** Когда studиент завершает курс, ему предлагается заполнить self-report (subjective) ИЛИ пройти этот quiz (objective). Если quiz даёт неконсистентные оценки, мы получим «два outcome-источника, которые между собой не сходятся» — это хуже, чем просто self-report.
3. **Калибрует Rasch IRT.** В v3.3.5 difficulty_logit задаются reviewer-экспертом; в v3.4+ они empirically recalibrate after ≥30 responses. Если стартовые значения окажутся не в правильных bands, recalibration будет шатать score scale несколько cohort cycles.

Поэтому review должен покрыть **и грамматику, и difficulty calibration, и культурную нейтральность одновременно**. Если в чём-то сомнения — лучше зафлагать с комментарием «not sure», чем «отполировать гладко».

**Особенности контекста:**
- Аудитория — взрослые иммигранты, изучающие иврит в ulpan-курсе. Уровень иврита **mixed**: от A2 до B2. Quiz должен chase distinguishable signal across this range.
- Item bank публикуется под CC BY-SA 4.0, чтобы другие ulpan-группы могли расширять.
- Quiz не охватывает: listening, speaking, writing (только reading + grammar). Это документировано в validity caveats.

---

## 3. Что конкретно нужно сделать

### 3.1 Часть A — review каждый item (20 × ~2 мин)

Для каждого Q01-Q20:

- [ ] **Грамматика** — Hebrew correct? No typos? Spacing / niqqud не критичны (показ переключается).
- [ ] **Уровень** — соответствует ли заявленному CEFR band? Если нет, на каком уровне item на самом деле?
- [ ] **Однозначность** — единственный correct answer? Distractors разумные? Нет item-ов где 2 ответа можно считать правильными?
- [ ] **Locale parity** — RU/EN переводы передают тот же intent? Не сдвигают сложность (например, RU подсказка слишком намекает на ответ)?
- [ ] **Culturally neutral** — нет religious / political / regional bias? Подходит для diverse ulpan cohort?
- [ ] **Difficulty logit** — стартовое значение (placeholder) в разумном range для band? Можешь скорректировать ±0.5.

### 3.2 Часть B — distribution + balance

- [ ] **Total: 20 items?** ✓ (auto-checked)
- [ ] **4/4/5/4/3 распределение?** ✓ (auto-checked)
- [ ] **Difficulty monotonically increases по bands?** Должно быть mean(A1) < mean(A2) < mean(B1) < mean(B2) < mean(C1).
- [ ] **Стресс-точки разнообразны?** Не должно быть 5 items про smikhut и 0 про verb conjugation.
  - Q01-Q08 (A1+A2): basic vocab, pronouns, articles, past tense, possessives, time, food
  - Q09-Q13 (B1): smikhut, prepositions+pronouns, binyan recognition, reading comp, conditional
  - Q14-Q17 (B2): direct object marker, register, idiom, smikhut definiteness
  - Q18-Q20 (C1): literary register identification, metaphor, advanced idiom
- [ ] **Reviewer's gut check:** студент B1-уровня должен сдавать ~60-70% — это feels right на этом banking?

### 3.3 Часть C — validity caveats и acknowledgments

- [ ] Validity caveats в `QUIZ_ITEM_BANK_DRAFT.md §"Validity notes"` отражают реальность? Добавить что-то ещё?
- [ ] **Attribution preference:** acknowledgments в дипломе:
  - (a) Named credit ("Item bank reviewed by <full name>, <affiliation>")
  - (b) Initials only
  - (c) Generic ("native Hebrew reviewer")
  - (d) Anonymous

### 3.4 Часть D — общие предложения (optional)

- Альтернативные item formats — fill-in-blank вместо multiple-choice?
- Аудио-items в v3.4 — какие listening skills хочется покрыть?
- Идеи для recalibration после real data?

---

## 4. Формат возврата

Любой формат ОК (выбери самый удобный):

### Option 1 — Inline edit прямо в `QUIZ_ITEM_BANK_DRAFT.md`

Скачать файл (или скопировать секции из e-mail), отметить чекбоксы, заменить items где нужно, прислать обратно как `.md` файл или текст в чате.

### Option 2 — GitHub PR

```bash
git clone https://github.com/SindromRadioSpb/tts-prototype-android
cd tts-prototype-android
git checkout -b review/quiz-item-bank
# edit docs/QUIZ_ITEM_BANK_DRAFT.md
# commit + push PR
```

Если работаешь с GitHub — это самый чистый путь, потому что PR diff = exactly что изменилось.

### Option 3 — Комментарии по items

Если правок мало:
> Q05: грамматика OK, но difficulty placeholder −1.4 слишком лёгкий для A2 — рекомендую −0.8. Иначе студенты ulpan-A2 будут все на максимуме.

### Option 4 — Word-документ с track changes

Если привычно — приложу `.docx` (на запрос), reviewer заполняет в Word.

---

## 5. Что произойдёт после возврата правок

1. Автор merges правки в `docs/QUIZ_ITEM_BANK_DRAFT.md` (canonical markdown source).
2. Если reviewer изменял Hebrew/RU/EN тексты или `difficulty_logit` — re-emit canonical JSON `public/quiz/ulpan_diagnostic_v1.json`.
3. Запускается `npm run quiz:validate` — schema invariants check (`scripts/quiz/validate-bank.js`).
4. Запускается `npm run quiz:regen-fixture` — fresh mirt-reference fixture, если difficulty_logits изменились.
5. Запускается полная smoke matrix — `npm run smoke:research:fast` (18 suites / 248 cases должны остаться ALL GREEN).
6. Re-run consent audit Example E — проверить что 4 conditions всё ещё hold; если нет — bump `CONSENT_VERSION`.
7. Sign-off запись в `ULPAN_DIAGNOSTIC_QUIZ_v1.md §5 Calibration audit log`:
   ```
   | <date> | Reviewer sign-off | <reviewer name / initials / "anonymous"> reviewed all 20 items. <N> modified, <N> replaced. Bank locked for production. |
   ```
8. Если items changed materially → bump `instrument_id` to `ulpan_diagnostic_v1.1` (item-level changes); если только difficulty_logits корректировались → оставить `v1` но zaupdate-ить `validity_notes.calibration_source` и `calibrated_at`.
9. **`ulpan_diagnostic_v1` (или v1.1) marked production-ready** — phase plan §5 pre-deployment gate ✓ passes; instrument can be used для real-cohort diploma data collection.
10. Reviewer credit в diploma acknowledgments per preference (§3.3 form filled out).

---

## 6. Acknowledgements

Reviewer указывается в acknowledgements диплома (RU + EN) согласно их предпочтению (см. §3.3). Если хочется указания на academic title / affiliation — сообщи автору. Default: simple named credit ("Item bank verified by <name>") в diploma + в `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §"Calibration audit log"`.

**Контакт автора для вопросов в процессе review:** `<контакт автора>`

---

## 7. Quick-reference: что review-er смотрит на каждой странице draft'а

Для удобства, каждый item в `QUIZ_ITEM_BANK_DRAFT.md` имеет:

```markdown
### Item QXX — <BAND> · <category>
**Difficulty (logit, draft):** <±X.X>
**Tags:** ...

**He prompt:** <текст на иврите>
**RU prompt:** <русский>
**EN prompt:** <английский>

| ID | He | RU | EN |
|---|---|---|---|
| ...4 options...

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ <BAND>
- Однозначность: ☐
- Замечания:
```

Reviewer ставит ✓ в чекбоксах если ОК, либо описывает проблему в «Замечания». Если item целиком заменяется — пишет новый prompt + options прямо там же.

---

## 8. Что НЕ нужно делать в этом review

- НЕ нужно полностью перепроектировать quiz framework — это уже зафиксировано в `PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md`. Только items / difficulties / wording.
- НЕ нужно добавлять / удалять item count (должно остаться 20).
- НЕ нужно менять CEFR distribution (4/4/5/4/3 — locked per plan §4).
- НЕ нужно изменять scoring algorithm (Rasch 1PL locked per plan §7).
- НЕ нужно беспокоиться о coding / build pipeline — это unblock после твоего sign-off'а.

---

**Сигнальные слова для финальной верификации:**

> "Items Q01-Q20 reviewed. <N> modifications applied. <N> items replaced.
> All bands distribution + difficulty monotonic ranges verified. Bank approved
> for production v1. Calibration based on expert judgement (no empirical data
> available yet; v3.4 will recalibrate from real responses)."

Когда reviewer пришлёт это (или аналог) — phase plan §16 pre-implementation gate ✓ passes, C1 unblocks.

—  *signed,* draft prepared by Claude Opus 4.7 (1M context) on 2026-05-15.
