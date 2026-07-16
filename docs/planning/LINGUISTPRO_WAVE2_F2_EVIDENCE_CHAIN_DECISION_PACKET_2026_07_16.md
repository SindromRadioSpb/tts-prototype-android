# LinguistPro Wave 2 — F2 evidence-chain decision packet

**Дата:** 2026-07-16

**Статус:** `OWNER_APPROVED / CONTRACT_APPROVED`; Option B и подготовка отдельного execution approval packet утверждены владельцем.

**Owner approval:** 2026-07-16 — Option B; constructs/lifecycle/authority/evaluator/planner/AA boundaries приняты в рекомендуемой конфигурации. Approval разрешает только подготовку execution approval packet; production code, migration, provider call, CP0/live, AA2, commit/push/deploy всё ещё запрещены до отдельного утверждения execution packet.

**Рекомендуемое решение:** Option B — sufficient bounded end-to-end shadow evidence chain.

**Живая база проверки:** `main` / `bcf9482`, package `3.11.188`; server migrations до `040_f1_correctable_continuity.sql`; production F1 технически проверен для одного exact owner; CP0 выключен.

**Как подготовлено:** полное чтение F2 prompt и перечисленного им planning/research canon; статическая сверка live migrations/routes/UI/flags/contracts; локальный запуск `smoke:f1`, `smoke:memory-canon`, `smoke:fsrs`, `smoke:grader-gold`, `smoke:mentor-home`, `smoke:cp0`.

**Что ревьюить:** этот файл. Это decision artifact, не implementation spec и не evidence report.
**Authority:** документ не разрешает production-код, migration, API/UI/config change, provider-вызов, CP0/live window, AA2/OAuth/MCP runtime, commit, push, deploy или production operation.

## 1. Решение в одном абзаце

Рекомендую **Option B**: отдельный от F1 и канонической памяти слов owner-only shadow-контур, который проводит **два существенно разных repository-grounded construct** через полную цепочку:

```text
canonical observation
  -> falsifiable bounded hypothesis
  -> eligibility + consent
  -> source-distinct evidence request
  -> accept / skip / defer / expire
  -> attempt or explicit MNAR
  -> independent deterministic evaluation
  -> versioned rule-governed shadow decision
  -> visible outcome / dispute / correction / suppress / annul / delete
  -> content-safe audit + minimal future-planner handoff
```

Construct 1 проверяет **неподсказанное орфографическое воспроизведение слова после bounded canonical receptive-evidence pattern**. Construct 2 проверяет **перенос graded reading-tap self-report в другое corpus-предложение**. Оба используют canonical review refs, public target anchors и текущие deterministic grader/resolver contracts; ни один не пишет `review_log`, FSRS, mastery, grading, resolver truth, consent, identity или F1 memory. Delayed request хранится как обычный bounded row с `not_before` и предлагается только при следующем явном визите пользователя — без timer, retry, notification или background worker.

## 2. Фактическое состояние репозитория

### 2.1 Что уже существует

| Контур | Факт живого кода | Что F2 может переиспользовать |
|---|---|---|
| Canonical review truth | Server migration `021_cloud_event_log.sql` создаёт append-only `review_log`; допустимые kinds: `review`, `skip`, `seed`, `annul`, `mark`. | Только user-scoped immutable event refs и существующая annul-fold semantics. |
| Scheduler | `srs_projections` и клиентский FSRS replay производны от `review_log`; `smoke:memory-canon` 79/79, `smoke:fsrs` 30/30. | Read-only eligibility context; никогда не F2 output/write target. |
| Grading | `agent/grader.js` deterministic-first; `agent/reviewer.js` — отдельный canonical writer; `grade-policy.js` различает receptive/production, modality family и context-supported evidence. `smoke:grader-gold` 77/77, LLM structurally unreachable. | Non-writing evaluator core и versioned provenance; canonical reviewer writer запрещён. |
| Review modalities | Live review supports `reverse`, `cloze`, `dictate`, `listen`, `read`; challenge binding, hint provenance, `evidence_scope` и MNAR guards уже существуют. | Два разных request/evaluator contract без изобретения новой языковой authority. |
| Non-assessment telemetry | `learner_events` имеет closed vocabulary (`text_opened`, `sentence_read`, `word_clicked`, …) и прямо запрещает review facts. | Только opportunity/UX denominator и source recency; не hypothesis evidence и не failure/mastery. |
| Corpus/source | Public Ben-Yehuda corpus anchors, resolver facts и source-version checks существуют; F1 уже умеет валидировать `PUBLIC_CORPUS_ANCHOR`. | Public-only source selection, exact revision/digest, changed-context proof. |
| F1 | Migration 040, `agent/memory/*`, `db/learnerMemoryRepo.js`, `/api/agent/memory*`, Mentor Home UI, exact-owner flags, revisions/source links/query receipts/erasure journal. | Principal scope, closed-schema style, lifecycle UX, export/delete/restore patterns; не F2 tables или evidence. |
| F1 owner evidence | Production `3.11.188`; one-owner stages и one Gemini BYOK plan→Continue integration technically verified; `review_log` 6,146 before/after, F1 provider calls 0, CP0 rows 0. | Доказательство continuity path, не learner ability и не F2 outcome. |
| CP0 | Migration 039, 28 registered scenarios, default-off observer; `smoke:cp0` green. | Только будущая content-safe scenario registration после отдельного approval; не нужен для F2 engineering truth. |
| Identity/lifecycle | Principal-derived `user_id`, append-only consent history, dynamic account export/delete и restore-erasure replay существуют. | Механизмы расширения; F2 обязан иметь собственную per-artifact anti-resurrection lineage. |

### 2.2 Чего нет

- Нет F2 observation/hypothesis/request/attempt/evaluation/shadow-decision/outcome schema.
- Нет F2 source adapters, eligibility policy, request selector, evaluator wrapper, state reducer, routes, UI, consent keys, flags или smoke commands.
- `db/corpusSentenceRepo.js` умеет прочитать exact public sentence/window по готовому anchor, но не умеет найти другое предложение по `item_key`/lemma. Для B2 потребуется новый bounded deterministic selector над существующими public-corpus indexes; это F2 implementation scope, а не уже существующая capability.
- Нет server-side evidence-request engine и нет planner handoff consumer.
- Нет durable background job/outbox для delayed creation, retries, notification или background A2.
- Нет independent LLM evaluator benchmark/calibration/runtime, и он не нужен рекомендуемому v1.
- Нет OAuth authorization/resource-server, external-client registry, MCP endpoint или AA2 scopes/runtime.

### 2.3 Расхождения с planning/research canon

| Утверждение | Актуальная поправка |
|---|---|
| Research 03/10: durable learner-memory layer отсутствует | Было верно 2026-07-13; F1 теперь реализован migration 040 и owner-only проверен. Skill/misconception/evidence memory всё ещё отсутствует. |
| Wave-2 replan inventory: F1 absent; G0 52/58 | Исторический baseline. Сегодня F1 engineering complete/owner-path verified; `smoke:grader-gold` проходит 77/77. |
| `CLAUDE.md` называет prod `3.11.181` | Устаревшая строка; package и F1 evidence подтверждают `3.11.188`. |
| Research chain заканчивается “rule-governed learner-state decision” | Для F2 v1 это только **shadow decision artifact**, не learner-state write. Любая будущая authoritative rule требует отдельного решения и pre-registered evidence. |
| Research пример “you recognised this in reading” | Допустим только если recognition — неаннулированный graded `review_log` факт. `word_clicked`/`sentence_read` сами по себе recognition не доказывают. |
| F1 `CANONICAL_EVENT_REF` существует | F1 adapter проверяет существование и намеренно не интерпретирует grade/mastery. F2 нужен отдельный read-only typed adapter; расширять F1 authority нельзя. |
| “Delayed tomorrow” | Без S4 означает `not_before` + offer-on-next-visit. Это не обещание фонового запуска или уведомления. |

## 3. Authority map: девять разных понятий

| Понятие | Точное значение | Никогда не означает |
|---|---|---|
| **Canonical truth** | Существующий `review_log`, deterministic grade provenance, FSRS replay/projection, resolver/curated Hebrew fact, consent/identity. | F2-owned statement. |
| **Observation** | Минимальная typed проекция существующего неаннулированного canonical факта с source ID/version. | Skill label, mastery, diagnosis или tutor interpretation. |
| **Hypothesis** | Фальсифицируемое, construct-specific утверждение об *непроверенном переносе*, с support/weaken/abstain rule и TTL. | Скрытый trait/profile или установленная слабость. |
| **Evidence request** | Один optional, source-distinct task, способный различить исходы гипотезы. | Review obligation, notification, FSRS card или agent task. |
| **Attempt / missingness** | Bounded answer либо explicit `SKIPPED/DEFERRED/EXPIRED/ABANDONED/UNAVAILABLE`. | Canonical review row; MNAR не является wrong. |
| **Evidence** | Immutable typed binding только между valid submitted attempt и его independent evaluation, с source/version lineage. | Raw engagement, pending request, missingness или evaluator prose. |
| **Evaluation** | Отдельный versioned evaluator artifact: verdict, uncertainty, rubric/oracle provenance. | Canonical grade или tutor self-certification. |
| **Shadow decision** | Versioned deterministic reducer output о том, что F2 *предложил бы* сделать. | Mastery/FSRS/profile/resolver/consent write. |
| **F1 memory / planner handoff** | F1 — user-controlled continuity. Handoff — minimized advisory F2 summary для будущего planner. | Evidence способности, готовый curriculum или permission на действие. |

Precedence: canonical fact > evaluation artifact > hypothesis > tutor/LLM prose. F1 user declarations authoritative только как факт декларации. External-agent memory и model output имеют нулевую learner-state authority.

## 4. Варианты A/B/C

| Вариант | Вертикальный срез | Плюсы | Почему принять/отклонить |
|---|---|---|---|
| **A — thin one-construct demo** | Один same-session cloze request, один result card, без cross-session defer, dispute/delete/restore и planner handoff. | Дешёвая демонстрация evaluator API. | Не доказывает governed chain, MNAR, delayed transfer, lifecycle или authority separation. **Отклонить как insufficient.** |
| **B — sufficient two-construct deterministic shadow** | Два разных construct; canonical review observations и public target corpus; full lifecycle; delayed/context-shift; independent deterministic evaluators; rule reducer; UI/audit/delete/restore/handoff; exact owner/default-off. | Даёт целостный, проверяемый control-plane и педагогический shadow-срез без provider/LLM зависимости. | **Рекомендуется.** Это минимальный достаточный, но не минималистичный объём. |
| **C — B + rubric-bound real LLM evaluator** | Всё B плюс отдельно consented/provider-gated evaluator comparison и disagreement workflow. | Проверяет будущую hybrid certification. | Рано увеличивает privacy/cost/calibration risk и не нужен для closed-answer constructs. Отложить как отдельный optional live experiment после B. |

## 5. Рекомендуемый Option B: два точных construct

### 5.1 Construct B1 — `UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION`

**Педагогический вопрос:** может ли learner неподсказанно записать знакомое слово по аудио после устойчивого canonical receptive-evidence pattern, не объявляя этот pattern mastery?

**Canonical observation eligibility:**

1. один canonical `item_key` с текущей replayable projection;
2. минимум два неаннулированных `review` события grade ≥3 в receptive family на двух разных UTC dates за последние 60 дней;
3. нет неаннулированного grade ≥3 в `dictate` family с non-context-supported evidence scope за последние 90 дней;
4. последнее qualifying receptive событие старше 24 часов;
5. canonical source/item identity, expected surface и audio asset доступны; ambiguous/homophone/short-word deterministic safety gates проходят;
6. `skip`, `mark`, click, listen-only и F1 thread не удовлетворяют observation predicate.

**Фальсифицируемая hypothesis:** `H_B1_PRODUCTION_TRANSFER_UNVERIFIED` — “неподсказанное орфографическое воспроизведение этого item пока не подтверждено”. Это unknown, не weakness.

**Request:** один `dictate_shadow_v1` challenge, `not_before = max(observation_at + 24h, created_at)`, expiry 7 дней. Стимул — существующий immutable audio asset; expected form — frozen typed contract из existing item/source identity. Hint до attempt переводит evidence scope в `context_supported` и shadow reducer не считает его unsupported transfer.

**Evaluator:** отдельный non-writing wrapper над deterministic normalization/grader semantics; запрещён вызов `agent/reviewer.js`. Output: `CORRECT_UNASSISTED`, `CORRECT_ASSISTED`, `NEAR_MISS`, `INCORRECT`, `ABSTAIN`. Empty/timeout не вызывают evaluator.

**Shadow rule:**

- `CORRECT_UNASSISTED` -> `NO_EXTRA_TARGETED_PRACTICE`;
- `CORRECT_ASSISTED`/`NEAR_MISS` -> `ONE_CONTEXTUAL_RETRIEVAL_CANDIDATE`;
- `INCORRECT` -> `ONE_UNSUPPORTED_RETRIEVAL_CANDIDATE`;
- ambiguity/disagreement/source drift -> `ABSTAIN`;
- никакой branch не пишет canonical state.

### 5.2 Construct B2 — `READING_TO_NEW_CONTEXT_TRANSFER`

**Педагогический вопрос:** переносится ли graded recognition слова в Reading Room в воспроизведение формы в другом corpus-предложении?

**Canonical observation eligibility:**

1. неаннулированный canonical `review` grade ≥3 с `source=reading-tap`, `channel=reading:tap` и сохранённым `meta.text_key` за последние 30 дней;
2. событие имеет canonical `item_key` и keyer/scheduler provenance; observation authority явно `SELF_REPORTED_RETRIEVAL`, потому что Reading Room reveal-then-grade записывает learner rating, а не independent grader verdict; это не `mark`, plain click или ungraded reveal;
3. source-A `meta.text_key` резолвится в текущем public-corpus registry с exact work/revision; personal/unknown `text_key` для v1 ineligible без чтения его body;
4. найдено другое public-corpus предложение с тем же canonical lemma/item identity, но `text_key` отличен от source A; target фиксирует `(work_id,text_key,order_index)` и source revision;
5. новая occurrence имеет authoritative expected surface из самого corpus occurrence; F2 не синтезирует форму;
6. deterministic distractor/ambiguity gate даёт ровно один correct option; иначе candidate `INELIGIBLE_AMBIGUOUS`;
7. исходный success не старше 30 дней, новый request не раньше 24 часов после него; `word_clicked`, `sentence_read`, F1 activity и ungraded reveal не заменяют success.

**Фальсифицируемая hypothesis:** `H_B2_READING_TRANSFER_UNVERIFIED` — “успешное graded recognition в source text A ещё не подтверждает воспроизведение формы в новом context B”.

**Request:** один `new_context_cloze_shadow_v1`, expiry 7 дней, public source B отличен от source A. Closed answer — option ID/typed surface, не free prose. Исходное предложение не показывается до attempt; раскрытие/подсказка помечает attempt assisted.

**Evaluator:** exact option matcher + expected-form identity/source-revision validation, отдельно от request selector; затем deterministic answer-normalization oracle для typed fallback. Output: `CORRECT_NEW_CONTEXT`, `CORRECT_ASSISTED`, `INCORRECT_NEW_CONTEXT`, `AMBIGUOUS`, `SOURCE_DRIFT`, `ABSTAIN`.

**Shadow rule:**

- `CORRECT_NEW_CONTEXT` -> `TRANSFER_OBSERVED_ONCE_NO_ACTION`;
- `CORRECT_ASSISTED` -> `ONE_LOWER_SCAFFOLD_CANDIDATE`;
- `INCORRECT_NEW_CONTEXT` -> `ONE_CONTRASTIVE_CONTEXT_CANDIDATE`;
- ambiguity/drift/disagreement -> `ABSTAIN`;
- один correct outcome не означает mastery или general transfer.

### 5.3 Почему constructs materially different

| Dimension | B1 | B2 |
|---|---|---|
| Исходный пробел | Receptive strength без unsupported dictation proof | Graded reading recognition без cross-context production proof |
| Stimulus | Audio -> typed Hebrew | New public sentence -> form/option |
| Source-shift | Modality shift | `reading:tap` source `text_key` -> distinct public sentence/work anchor |
| Oracle | Hebrew production normalizer/grader | Exact option + corpus occurrence/resolver contract |
| Риск | Homophone/orthography ambiguity | Context leakage/distractor ambiguity |
| Shadow action | Unsupported retrieval candidate | Contrastive context/scaffold candidate |

Это не две labels над одной fixture: predicates, target builders, stimulus, oracle, uncertainty и downstream shadow action различны.

## 6. Lifecycle и state machines

### 6.1 Hypothesis

```text
PENDING -> ELIGIBLE -> OFFERED -> TESTED -> RESOLVED_SHADOW
   |          |          |          |
   |          |          |          +-> DISPUTED -> ANNULLED
   |          |          +-> SKIPPED | DEFERRED | EXPIRED | ABANDONED
   |          +-> SUPPRESSED | SOURCE_DRIFTED | CONSENT_REVOKED
   +-> INELIGIBLE | EXPIRED
```

`PENDING/ELIGIBLE/OFFERED` никогда не участвуют в planner handoff как learning result. `SUPPRESSED` означает “не использовать/не предлагать”, а не “ложно”. `ANNULLED` означает, что evaluation/decision недействительны из-за dispute/defect; F2 не аннулирует canonical review event.

### 6.2 Request/attempt/MNAR

- `ACCEPTED` резервирует один attempt, но не создаёт canonical review.
- `SKIPPED` — явный отказ от этого F2 request; не grade и не evidence против hypothesis.
- `DEFERRED` меняет только `not_before`, максимум два раза и не позже request expiry.
- `EXPIRED` — request не был завершён до TTL.
- `ABANDONED` — UI был открыт, но valid answer не submitted.
- `UNAVAILABLE` — source/audio/expected contract исчез или drifted.
- `MISSING` — аналитический umbrella denominator; не отдельный inferred learner state.
- Только `SUBMITTED` с immutable attempt ID может получить evaluation.

### 6.3 Correction/dispute/delete

- До evaluation learner может `REPLACE_ATTEMPT` один раз до submit-final; immutable revisions сохраняют lineage.
- После evaluation learner может `DISPUTE_EVALUATION` с closed reason code и optional ≤280-char note; dispute немедленно исключает decision из handoff.
- `CORRECT_SOURCE` ведёт к существующему first-party canonical correction/resolver route; F2 не редактирует source truth.
- `SUPPRESS_HYPOTHESIS` обратим до expiry; `ANNUL_EVALUATION` создаёт superseding audit artifact; `DELETE_F2_CHAIN` hard-deletes content-bearing F2 rows и оставляет content-free erasure tombstone.

## 7. Closed typed artifacts и schema proposal

Все input/output objects используют `additionalProperties=false`, opaque server IDs, principal-derived `user_id`, UTF-8 byte caps, expected revision/idempotency preconditions и mandatory versions.

| Artifact | Mandatory fields (closed) | Max/TTL |
|---|---|---|
| `f2.observation.v1` | `observation_id`, `construct_id`, `canonical_event_refs[]`, `item_key_ref`, `source_refs[]`, `predicate_version`, `observed_at`, `expires_at` | ≤5 event refs; 60d B1 / 30d B2 |
| `f2.hypothesis.v1` | `hypothesis_id`, `claim_code`, `observation_ids[]`, `status`, `confidence_band=UNVERIFIED`, `support/weaken/abstain_rule_version`, `consent_snapshot_ref`, timestamps | ≤2 observations; 14d |
| `f2.request.v1` | `request_id`, `hypothesis_id`, `request_kind`, `source_a_ref`, `source_b_ref`, `expected_contract_ref`, `not_before`, `expires_at`, `offer_policy_version`, `state` | one open/construct; 7d |
| `f2.attempt.v1` | `attempt_id`, `request_id`, `state`, `input_mode`, `assistance_codes[]`, `answer_ciphertext_or_bounded_value`, `mnar_code`, timestamps, revision | answer ≤512 bytes; content purge 30d |
| `f2.evaluation.v1` | `evaluation_id`, `attempt_id`, `evaluator_kind`, `evaluator_version`, `rubric_version`, `normalizer_version`, `input_digest`, `verdict`, `confidence`, `uncertainty_codes[]`, `rationale_codes[]` | no free rationale; 30d |
| `f2.evidence.v1` | `evidence_id`, `attempt_id`, `evaluation_id`, `source_link_ids[]`, `evidence_status`, all schema/policy/evaluator versions | immutable typed projection; only for evaluated `SUBMITTED` attempt |
| `f2.shadow_decision.v1` | `decision_id`, `hypothesis_id`, `evaluation_ids[]`, `decision_rule_version`, `decision_code`, `reason_codes[]`, `status`, `supersedes_id`, timestamps | 30d; advisory only |
| `f2.outcome.v1` | `request_id`, `attempt_state`, `evidence_id|null`, `evaluation_id|null`, `decision_id|null`, `user_control_state`, `terminal_code`, timestamps | typed projection; MNAR remains explicit |
| `f2.source_link.v1` | artifact ref, `source_kind`, `source_ref`, `source_revision_ref`, `relation_kind`, `authority_class`, bounded anchor, keyed digest/status | ≤5/artifact; no source body |
| `f2.audit_event.v1` | artifact ref, action enum, actor class, prior/new revision, closed reason/terminal code, timestamp | content-free; 30d |
| `f2.context_query.v1` | purpose, eligible/offered/selected IDs, exclusion counts, policy/consent versions, terminal code, generated/expiry | selected ≤2; 30d |
| `f2.planner_handoff.v1` | §11 exact fields | ≤1/construct; 7d |

### 7.1 Proposed server migration, без создания

Следующий свободный **server** migration номер — `041`; предлагаемый файл после approval: `migrations/041_f2_shadow_evidence_chain.sql`. Это не тот же namespace, что client-side `public/db/migrations.js`, где labels 041/042 уже относятся к `review_log`/FSRS.

Предлагаемые tables: `f2_observations`, `f2_hypotheses`, `f2_requests`, `f2_attempts`, `f2_evaluations`, `f2_shadow_decisions`, `f2_source_links`, `f2_audit_events`, `f2_context_queries`, `f2_erasure_journal`. `f2.evidence.v1` и `f2.outcome.v1` — closed typed projections над immutable IDs этих tables, а не новые stored truths: это избегает дублирования attempt/evaluation/terminal state. Возможное дальнейшее сокращение через generic artifact store **не рекомендуется**: разные authority/lifecycle queries и FK требуют явных schemas.

Никаких F2 columns в `review_log`, `srs_projections`, `learner_memory_records`, `agent_tasks` или `cp0_observations`. Это исключает dual-write и ложную общую authority.

## 8. Consent, minimization, retention и isolation

### 8.1 Consent keys, все off по умолчанию

```text
f2_shadow_store
f2_shadow_b1_dictation
f2_shadow_b2_context_transfer
f2_shadow_planner_handoff
f2_shadow_external_evaluator   # reserved/off; Option B его не читает
```

Situated consent объясняет: F2 хранит небольшую проверку и shadow result; не меняет word memory/grade/FSRS; skip/later/no-answer не failure; learner может скрыть, dispute, export и delete. Existing F1/agent/model consent не расширяется автоматически.

### 8.2 Caps

- максимум два open requests/user, по одному на construct;
- максимум один offer на явный Mentor Home visit и не чаще одного F2 offer/local day;
- один finalized attempt/request; максимум два deferrals;
- public corpus only; no personal source body, transcript, embedding, external-agent memory или provider prompt;
- no raw audit/log content; operational logs содержат IDs/counts/codes;
- query-time expiry authoritative; cleanup timing не оживляет artifact.

### 8.3 Revoke/export/delete/restore

- Revoke немедленно блокирует offer/evaluate/handoff и синхронно purges bounded owner data; failure видим и fail-closed.
- F2-only export deterministic: current + revisions + learner-safe provenance + evaluation/decision versions; keyed digests/secrets omitted.
- Account export/delete включает все user-scoped tables structural sweep.
- Per-chain delete пишет `f2_erasure_journal` до cascade; journal content-free и живёт дольше oldest retained backup.
- Restore replay читает pre-restore safety snapshot и удаляет resurrected F2 IDs; unrelated user/F1/canonical rows обязаны сохраниться.

## 9. Evaluation independence, uncertainty и disagreement

1. Hypothesis selector, request builder, evaluator и shadow reducer — отдельные logical roles/contracts.
2. Tutor/LLM не создаёт expected form, verdict или decision. В Option B tutor prose вообще не нужен.
3. Expected contract замораживается до learner response и выводится из corpus occurrence/authoritative item identity, не из evaluator output.
4. Evaluator не импортирует `agent/reviewer.js`, planner/tutor/provider/`llmGate`, F2 reducer или repository writer.
5. Request builder не является correctness oracle: independent golden fixture пересчитывает expected answer из raw corpus occurrence; R11 head-regression включает homographs, ktiv, niqqud, homophones и source drift.
6. Любой mismatch версий, ambiguous occurrence, missing source, malformed provenance, unsupported answer или conflict -> `ABSTAIN`.
7. Если deterministic primary и independent audit oracle расходятся, оба artifacts сохраняются, decision = `DISAGREEMENT/INCONCLUSIVE`, handoff блокируется, affected evaluator version kill-switched.

## 10. Learner-visible UI contract

Первый F2 surface — progressive block в Mentor Home рядом с F1 continuity, но визуально и семантически отдельный.

До accept card показывает:

- “Почему предлагается”: exact canonical observation summary без grade dump/hidden profile;
- “Что неизвестно”: hypothesis в языке uncertainty;
- source A/source B и почему context действительно новый;
- evaluator kind/version и фразу “не изменяет ваши оценки и расписание”;
- `Попробовать`, `Позже`, `Пропустить`, `Не предлагать такое`, `Почему?`.

После attempt:

- answer/result, assisted/unassisted, evaluator/rubric provenance;
- uncertainty/disagreement и shadow action “что система предложила бы”;
- `Оспорить`, `Исправить источник`, `Аннулировать результат`, `Скрыть`, `Удалить цепочку`;
- честные `expired`, `source changed`, `consent off`, `abandoned`, `evaluator abstained`, offline/error states.

Implementation gate: ru/en/he, RTL, keyboard/focus/reduced-motion, `textContent`, 380×844 screenshots и no horizontal overflow. Красный “ошибка/провал” запрещён для MNAR/uncertainty.

## 11. Context query, audit и safe planner handoff

Допустимые purpose enums: `F2_OFFER`, `F2_MANAGEMENT`, `F2_PLANNER_HANDOFF_PREVIEW`. Query rechecks principal, flags, exact owner, consent, source revisions, expiry, suppress/dispute/annul state и caps. Ranking deterministic: older qualified hypothesis first, B1/B2 alternating by last offered construct, stable ID tie-break. Никакого LLM rerank, embedding или ambient prompt injection.

Минимальный output будущему bounded next-session/weekly planner:

```json
{
  "schema_version": "f2.planner_handoff.1.0.0",
  "handoff_id": "opaque",
  "construct_id": "UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION|READING_TO_NEW_CONTEXT_TRANSFER",
  "request_outcome": "COMPLETED|SKIPPED|DEFERRED|EXPIRED|ABANDONED|UNAVAILABLE",
  "shadow_action_code": "NO_ACTION|ONE_UNSUPPORTED_RETRIEVAL_CANDIDATE|ONE_CONTEXTUAL_RETRIEVAL_CANDIDATE|ONE_CONTRASTIVE_CONTEXT_CANDIDATE|ONE_LOWER_SCAFFOLD_CANDIDATE|INCONCLUSIVE",
  "confidence_band": "ONE_OBSERVATION|INCONCLUSIVE",
  "uncertainty_codes": [],
  "item_ref": "opaque-canonical-ref",
  "source_anchor_ref": "opaque-public-ref",
  "policy_version": "...",
  "decision_rule_version": "...",
  "generated_at": "...",
  "expires_at": "..."
}
```

Handoff исключает answer, prompt, source body, raw grade history, F1 payload, hypothesis prose и learner trait. Planner может только рассмотреть **один bounded candidate action**; он обязан заново применить consent/time/fatigue/due/budget rules. Он не может трактовать `NO_ACTION` как mastery, создавать notification/background job, писать F2/canonical state или расширять TTL. Сам planner не проектируется и не реализуется здесь.

## 12. Flags, staged activation и rollback

Все defaults off:

```text
F2_SHADOW_ENABLED=0
F2_SHADOW_OWNER_IDS=
F2_SHADOW_B1_ENABLED=0
F2_SHADOW_B2_ENABLED=0
F2_SHADOW_CONTEXT_USE_ENABLED=0
F2_SHADOW_PLANNER_HANDOFF_ENABLED=0
F2_SHADOW_EXTERNAL_EVALUATOR_ENABLED=0
```

No wildcard. Три независимых gate: global/exact owner, construct flag, current consent. Proposed stages после отдельного execution approval:

1. **E0 storage/lifecycle only:** global owner + store; no offer/evaluate.
2. **E1 B1 synthetic/local:** B1 code path, no live flag.
3. **E2 B2 synthetic/local:** B2 code path, no live flag.
4. **E3 default-off deploy:** migrations/code present; every flag off.
5. **L1 optional owner technical window:** separately approved, one construct at a time; no CP0/provider.
6. **L2 optional real-evaluator experiment:** separate Option C approval only.

Rollback order: planner handoff off -> context use off -> B2/B1 off -> global off. Export/delete remain reachable for stored data. Migration/data не drop; canonical state не “откатывается”, потому что F2 его не менял.

## 13. Deterministic synthetic gates и acceptance thresholds

| Gate | Жёсткий threshold |
|---|---|
| Closed schemas | 100% unknown-field/oversize/invalid-enum rejection; migration idempotent. |
| Golden B1/B2 | 100% expected verdict/abstain на frozen positive/negative/ambiguity/source-drift fixtures; no false confident accept. |
| Canonical no-harm | `review_log`, projections/FSRS, grader config, resolver facts, consent, identity и F1 rows byte/count/replay-identical до/после. |
| MNAR | 100% skip/defer/expire/abandon/unavailable cases produce no evaluator call, grade, failure/mastery или canonical write. |
| Independence | Static import graph + runtime tripwire: evaluator has zero access to tutor/provider/reviewer-writer/reducer-writer. |
| Source/context shift | 100% B2 requests have distinct source tuple; leaked source-A/expected answer = gate failure. |
| Isolation | 0 cross-user reads/writes/guessed-ID/export/delete/source links across every F2 table/action. |
| Lifecycle | 100% valid transition matrix; stale revision conflicts; query-time expiry; dispute blocks handoff immediately. |
| Delete/restore | 0 live derived refs after delete/revoke; 0 resurrection from old backup; other user/F1/canonical rows intact. |
| Audit/content safety | 0 answer/source body/prompt/secret/sentinel in operational logs, CP0, stdout/stderr/query receipts. |
| Load | ≥10,000 mixed local operations; S0 DB/WAL p95 <50ms, p99 <250ms; lock errors <0.1%; deterministic API p95 <1s, p99 <2s. |
| Provider tripwire | **0 DNS/HTTP/non-loopback attempts, 0 provider calls, 0 real quota reservations. Любая попытка = hard fail.** |
| UI | ru/en/he complete; 380×844/RTL/focus/empty/error/MNAR/dispute/delete states reviewed. |

Новые proposed commands после execution approval: `smoke:f2`, `smoke:f2:load`; existing regressions: F1, memory-canon, FSRS, grader-gold, mentor-home, CP0, API smoke. Этот packet команды не создаёт.

## 14. Evidence denominators и live evidence plan

### 14.1 Обязательные denominators

Per construct, predicate/policy/evaluator version и window:

```text
canonical_candidates
eligible
ineligible_by_reason
offered
accepted
completed
skipped
deferred
expired
abandoned
unavailable
evaluator_abstain
evaluator_agreement
evaluator_disagreement
corrected
disputed
suppressed
annulled
deleted
context_shift_correct_unassisted
context_shift_correct_assisted
context_shift_incorrect
handoff_eligible
handoff_emitted
```

Rates всегда имеют явный denominator: offer/eligible; accept/offered; complete/accepted; MNAR/offered; disagreement/evaluated; dispute/evaluated; context outcome/completed. `missing = deferred + expired + abandoned + unavailable` только аналитически; оно не объединяется с incorrect.

### 14.2 Bounded owner evidence, отдельно от engineering

Optional L1 technical window требует отдельного approval. Control-plane acceptance: ≥20 eligible opportunities total, ≥5 completed chains/construct либо честный `INSUFFICIENT_COMPLETIONS`; source/version completeness 100%; canonical/provider incidents 0; correction/dispute каждый видим и блокирует handoff; nuisance cap соблюдён. Это не learning efficacy и не `OPERATIONALLY_COMPLETE`.

Learning/transfer claim требует отдельной preregistration/holdout с power analysis по реальному cohort baseline. До него даже 100% owner completion означает только technical/use evidence.

### 14.3 Optional real LLM evaluator evidence (Option C only)

Отдельный approval должен зафиксировать exact provider/model/region/data-use, rubric/prompt/evaluator versions, consent copy, public-corpus-only payload, max 20 preselected completed attempts, max currency/tokens, no retries/fallback, blinded deterministic + human gold, output schema и kill switch. Acceptance: 100% schema/provenance, 0 unsafe confident accepts, ≥95% agreement на gradable gold, 100% disagreements -> `INCONCLUSIVE`, cost within cap. Любой raw personal/F1 payload, provider fallback, self-evaluation или canonical write немедленно останавливает эксперимент и аннулирует affected artifacts. LLM output не управляет Option B shadow rule.

## 15. S4–S7, bounded preparation и AA0–AA2

| Track | F2 B разрешает | Stop line |
|---|---|---|
| F1 | Read current F1 ID/status только как optional continuity context. | Не читать payload как ability evidence; не создавать F1 skill/misconception kind. |
| Bounded preparation | Emit §11 handoff после completed/non-disputed chain. | Не проектировать/строить planner; не создавать curriculum/notification. |
| S4 | Visit-time query по persisted `not_before`. | Любой timer, retry, notification, scheduled creation, worker lease, outbox или background A2 требует S4 сначала. |
| S5 | Bounded SQLite exact-owner tables в S0 limits. | Postgres/object/vector/multiprocess scale требует S5 decision. |
| S6 | Public corpus only. | Personal materials, immutable private revisions, rights/trust/chunks требуют S6. |
| S7 | Exact owner/existing user scope. | Public cohort, tenant/teacher sharing, quotas/support/SLO требуют S7. |
| AA0 | No-secret local package/diary, без LinguistPro private API/F1/F2. | Никаких F2 exports в Hermes. |
| AA1 | Docs-only OAuth topology, scopes/tool schemas, recipient consent, threat/load/delete/support contracts. | Не читать F1/F2 payload; не создавать runtime/schema files/credentials/dependency. |
| AA2 | Ничего. | MCP endpoint, OAuth client/server, SDK, migration, live connection запрещены до AA1 + separate execution packet и текущего scheduling gate. |

### 15.1 Что AA1 безопасно делать параллельно

AA1 может документировать: OAuth resource-server/authorization-server decision; PKCE/audience/client/connection/revoke; generic `learning.brief.read` и public catalog schemas без F1/F2 fields; recipient/downstream-retention copy; rate/abuse/CP0 mapping; connection export/delete/restore; fixture/loopback/second-client threat plan. Можно зарезервировать enum `advisory_evidence_summary` как **deferred scope**, но нельзя определять его payload из реальных F2 data до отдельного amendment.

Нельзя: читать/экспортировать F1/F2 records, добавлять `f2.*.read` scope в AA2 v0, создавать MCP/OAuth/schema runtime files, client/credential/table/SDK dependency или вызывать внешний client.

## 16. R1–R17 adversarial review

| Lens | Attack | Locked response |
|---|---|---|
| R1 | F2 синтезирует неверную Hebrew form | Expected form только из authoritative occurrence/item; ambiguity -> abstain. |
| R2 | F2 превращается в nuisance testing | ≥24h delay, one/day, two open max, explicit skip/defer/suppress; one actionable task. |
| R3 | Decorative IDs или fuzzy re-anchor | Exact user/source/revision relations; source drift closes chain. |
| R4 | Uncertainty спрятана за score UI | Why/unknown/evaluator/result/dispute visible; 380px/RTL/no dead end. |
| R5 | “AI понял ваш уровень” | Product copy: one shadow check, no profile/mastery claim; deterministic core. |
| R6 | Public anchor маскирует private corpus expansion | Public-only v1, per-work provenance; S6 stop line. |
| R7 | Новый контекст меняет register/meaning | Exact corpus occurrence + visible source; conflict/rarity may abstain. |
| R8 | Повторная проверка становится постоянным scaffold | One request/hypothesis, expiry/resolution, no automatic loop. |
| R9 | Derived shadow decision выдан за asserted truth | Explicit authority class/version; never stored in F1/canonical tables. |
| R10 | Self-consistent grader объявлен independent gold | Raw-occurrence independent fixtures, ambiguity/FP measurement and human audit option. |
| R11 | Builder и oracle слепы к одной ошибке | Separate contracts; corpus niqqud/source precedence; head-regression; disagreement blocks. |
| R12 | F2 становится вторым learner-state writer | Dedicated artifacts only; no columns/writes in canonical/F1 stores. |
| R13 | Restore resurrects deleted chain | Additive migration, dry-run/backup, tombstone replay, disable-only rollback. |
| R14 | Foreign artifact/source guessed | Principal-derived scope and negatives across every action/table/cache. |
| R15 | Consent/delete только декоративны | Per-construct opt-in, immediate revoke, minimized TTL, export/delete/restore proof. |
| R16 | Hidden evaluator/background spend | Option B zero provider; hard network tripwire; caps; Option C separately budgeted. |
| R17 | Tutor self-certifies или MNAR становится fail | Independent deterministic evaluator, no reviewer write, MNAR no-eval/no-write. |

## 17. Stop conditions

Немедленно остановить implementation planning/execution и вернуться к владельцу, если:

- появляется competing server migration 041 или overlapping F2 work;
- construct требует личный source body, LLM-generated expected form, fuzzy re-anchor или hidden trait;
- любой F2 path пишет/переопределяет `review_log`, FSRS/projection, grade, resolver, consent, identity или F1;
- learner event/click/F1 thread трактуется как skill evidence;
- tutor/request builder может оценить собственный output;
- skip/defer/timeout/abandonment превращается в wrong/failure/mastery;
- delete/revoke/restore не гарантирует zero-resurrection;
- cross-user read/write или content/secret leak возможен;
- deterministic gate делает внешний network/provider attempt;
- delayed flow требует timer/retry/notification/background job без S4;
- AA2/OAuth/MCP runtime оказывается нужен для F2;
- exact owner/default-off/independent flags невозможно сохранить;
- UI скрывает uncertainty/dispute или overclaims learning outcome;
- S0 latency/lock/storage thresholds нарушены.

## 18. Owner decisions

1. **Product slice:** A thin demo / **B sufficient deterministic shadow (recommended)** / C hybrid evaluator now.
2. **Constructs:** approve B1 predicates/24h delay/60–90d evidence windows and B2 new-context corpus rule/30d window/7d request TTL.
3. **Shadow actions:** approve exact non-authoritative decision codes in §5; no mastery/FSRS promotion.
4. **Consent/retention:** approve five keys, public-only scope, answer retention ≤30d, hypothesis 14d, request/handoff 7d, audit 30d.
5. **Caps/burden:** approve one offer/day, two open total, one/construct, two deferrals.
6. **Schema:** approve dedicated proposed server migration 041/tables; no reuse of F1/canonical/task tables.
7. **Evaluator:** approve deterministic-only Option B and reserve real LLM evaluator for separately approved Option C.
8. **Planner handoff:** approve exact §11 minimized schema and stop line; no planner implementation/background delivery.
9. **Evidence:** approve hard thresholds, denominators, optional L1 minimums and explicit no-efficacy claim.
10. **Parallel boundaries:** approve AA1 docs-only work in §15.1; keep AA2, CP0 live, S4 background and S5–S7 expansion blocked.

Owner resolution: **B / approve / approve / approve / approve / approve / deterministic-only / approve / approve / approve** — утверждено 2026-07-16.

## 19. Отдельный execution approval packet

После owner approval подготовить `LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_EXECUTION_APPROVAL_PACKET_2026_07_16.md`, который обязан зафиксировать:

1. exact file/hook/source/consumer matrix и final migration 041 DDL proposal;
2. closed JSON schemas/error codes/roles/transactions/idempotency;
3. exact B1/B2 SQL/read adapters, annul fold, source selectors и independent fixtures;
4. API/UI/locale/CSS/SW boundaries;
5. flags/allowlist/consent/revoke/export/delete/restore implementation;
6. `smoke:f2`, load/network tripwire, all regression commands и expected outputs;
7. staged default-off deploy/rollback and evidence artifact paths;
8. post-diff R1–R17 critique;
9. отдельный owner-live launch request, без автоматического enablement;
10. явные exclusions: CP0 live, provider/Option C, planner, S4 jobs, AA2/OAuth/MCP, public cohort.

Этот decision packet не разрешает готовить migration/code до утверждения решений §18 и не заменяет execution approval.

## 20. До / после

**До F2:** LinguistPro умеет честно хранить word-memory canon, deterministic grades и F1 continuity, но между “мы наблюдали X” и “следующее педагогическое действие действительно оправдано” нет governed evidence chain. Engagement, tutor prose и unfinished thread нельзя безопасно превратить в learning conclusion.

**После Option B, всё ещё shadow:** продукт сможет предложить одну маленькую отложенную проверку, доказать её происхождение и новый контекст, независимо оценить ответ, честно обработать missingness/uncertainty/dispute/delete и передать будущему planner только bounded advisory action code. Canonical learner truth останется неизменной. Это доказательство безопасного контура и технической полезности, не доказательство улучшения обучения.
