# LinguistPro Wave 2 — F2 owner-live approval packet

**Дата:** 2026-07-16

**Статус:** `OWNER_APPROVED / PERMANENT_OWNER_ONLY_ENABLED / EVIDENCE_RUN_1_OPEN`

**Owner approval:** 2026-07-17 — Option A-P. Разрешено перманентно включить
F2 global/B1/B2 только для текущего exact owner principal; manual-only,
public-corpus-only, максимум одна новая chain/день. CP0, context use, planner
handoff, external evaluator, background jobs и notifications остаются off.

**Engineering basis:** commit `ed3cf11`, package `3.11.189`, migration 041;
`ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`.

**Owner UX addendum, 2026-07-17:** F2 remains a separate non-canonical shadow
artifact path, but its learner-facing attempt must use the established
`Учить новые слова` dialog grammar: visible `Тренировка` mode and the common
Reading/Audio/RU→HE/Dictation channel rail. Only the construct-valid channel is
enabled (B1 Dictation, B2 Reading), and the dialog must state that the attempt
does not change word memory, grade or schedule. An inline answer control without
this dialog, or B1 without playable already-baked audio, is materially ambiguous
and does not count as owner-live evidence. This addendum does not enable normal
training writes, providers, planner handoff, background work, CP0 or AA2.

Этот packet фиксирует утверждённую permanent owner-only capability и отдельный
bounded evidence run после успешного default-off engineering deploy.

## 1. Разделение постоянной capability и bounded evidence

Постоянная owner-only доступность и окно оценки — разные контуры:

- **capability lifetime:** F2/B1/B2 могут оставаться включёнными для одного exact
  owner principal без календарного срока, пока соблюдаются stop conditions;
- **evidence-run lifetime:** конкретный отчёт закрывается через 14 календарных
  дней или после достижения 20 eligible opportunities, что наступит раньше;
- закрытие evidence run не выключает capability и не превращает последующие
  owner chains в часть уже закрытого отчёта;
- расширение с owner на других пользователей никогда не происходит
  автоматически и требует отдельного cohort/public rollout packet.

## 2. Варианты

### Option A-P — permanent owner-only capability + bounded evidence runs (recommended)

Постоянный, но жёстко ограниченный shadow-контур для одного exact owner principal:

- включить F2 global + B1 + B2 только для exact owner ID;
- оставить CP0, context use, planner handoff, external/provider evaluator,
  background jobs, notifications и AA2 выключенными;
- использовать только canonical review facts и shipped public corpus;
- только явный ручной scan, максимум одна новая chain в сутки;
- F2/B1/B2 остаются owner-only доступными после закрытия первого evidence run;
- первый evidence run закрывается через 14 календарных дней или 20 eligible
  opportunities, что наступит раньше;
- цель первого evidence run: не менее 5 completed chains на construct; иначе честный статус
  `INSUFFICIENT_COMPLETIONS` без расширения cohort или окна;
- owner может skip/defer/delete/revoke consent в любой момент; MNAR не является
  ошибкой;
- никакого влияния на `review_log`, FSRS, memory, grade или planner.

Это минимальная постоянная capability, которая остаётся достаточным end-to-end
shadow-срезом. Первый bounded report проверяет обе гипотезы, lifecycle, consent,
source drift и delete на реальном owner path, не превращаясь в публичный pilot.
После report owner может продолжать ручное использование; это не продлевает и
не переписывает acceptance уже закрытого evidence run.

### Option B — один construct

Включить только B1 или только B2. Риск ниже, но это уже недостаточный F2
end-to-end срез: второй construct и его independent evaluator/source authority
останутся без live evidence. Не рекомендуется как closure F2.

### Option C — defer

Оставить production default-off. Engineering status сохраняется; live evidence
остаётся deferred без отрицательного вывода о качестве реализации.

## 3. Почему нельзя «включить всё»

Флаги представляют независимые уровни authority и риска, а не ступени одной
функции:

| Flag/capability | Для Option A-P | Причина |
|---|---|---|
| F2 global | ON, exact owner only | Открывает сам shadow-контур. |
| B1 | ON | Разрешает deterministic orthographic-production construct. |
| B2 | ON | Разрешает public-corpus transfer construct с self-report boundary. |
| CP0 | OFF | Это отдельный control-plane observer/telemetry contract; для ручного F2 не нужен. |
| Context use | OFF | Начинает использовать shadow evidence вне самой проверки. |
| Planner handoff | OFF | Даёт downstream-системе сигнал, который пока не имеет authority управлять обучением. |
| External evaluator | OFF | Добавляет provider, передачу данных, стоимость и отдельную Option C validation surface. |
| Background jobs/notifications | OFF | Меняет pull-модель на proactive processing и создаёт nuisance/consent/ops риски. |

Поэтому безопасная постоянная конфигурация — включить ровно F2 global, B1 и B2
для exact owner. Одновременное включение всех флагов нарушило бы approved Option
B и смешало бы несколько ещё не утверждённых экспериментов.

## 4. Hard gates до включения Option A-P

1. Подтвердить exact owner principal без wildcard.
2. Сделать backup и проверить DB/migration health.
3. Зафиксировать, что семь запрещённых флагов остаются off; включаются только
   F2 global/B1/B2.
4. Owner вручную принимает storage/B1/B2 consent в UI.
5. Проверить обычный health и отсутствие provider/quota traffic.
6. Немедленно остановить окно при tenant leak, canonical write, source mismatch,
   consent bypass, resurrection, provider/network attempt или UI ambiguity.

## 5. Evidence и acceptance первого bounded run

- 100% chains имеют construct/schema/evaluator/source revisions и consent ref.
- 100% terminal states различают completed, skip, defer, expiry и annulment.
- 0 canonical learning writes; 0 provider/network/quota operations.
- 0 tenant, export/delete или restore authority incidents.
- B2 остаётся помеченным `SELF_REPORTED_RETRIEVAL`.
- Не менее 5 completed chains/construct; иначе
  `OWNER_PATH_TECHNICALLY_VERIFIED / INSUFFICIENT_COMPLETIONS` только для
  фактически проверенных границ.
- Никаких efficacy, retention или operational-complete claims.
- После closure новые owner chains не пересчитывают зафиксированный denominator,
  acceptance или status первого run; для нового отчёта открывается новый
  явно датированный evidence run.

## 6. Путь к понятному включению для других пользователей

Permanent owner-only enablement сохраняет реализацию доступной и уменьшает риск,
что F2 будет забыта, но не является разрешением на public rollout. Перед
расширением нужен отдельный packet, который обязан:

1. выбрать exact cohort и запретить wildcard/public-by-default;
2. использовать owner evidence и явно учесть `INSUFFICIENT_COMPLETIONS`, если он
   возник;
3. повторно проверить consent copy, mobile/RTL, tenant isolation, delete/export,
   restore replay и nuisance caps;
4. определить cohort duration, enrollment/exit и support/incident owner;
5. сохранить canonical non-writing boundary и B2 self-report label;
6. оставить provider, planner, CP0 и jobs отдельными approvals;
7. пройти canary -> bounded cohort -> отдельно утверждённый general availability,
   без автоматического продвижения между стадиями.

## 7. Rollback

Disable-only: вернуть F2 global/B1/B2 в off и перезапустить приложение. Migration
041 и уже созданные artifacts не откатывать; lifecycle/export/delete остаются
доступными по утверждённому контракту. Любая дальнейшая очистка — только явным
owner action.

## 8. Owner resolution и production execution

Владелец выбрал `Option A-P` 2026-07-17.

Production execution выполнен на package `3.11.190`, image/source commit
`4138cac`; F2 implementation остаётся из `ed3cf11`:

- штатный pre-change backup создан и проверен;
- production содержит ровно один owner principal; allowlist exact, без wildcard;
- `F2_SHADOW_ENABLED=1`;
- `F2_SHADOW_B1_ENABLED=1`;
- `F2_SHADOW_B2_ENABLED=1`;
- context use, planner handoff, external evaluator и CP0 подтверждены off/unset;
- F2 background job или notification flag не добавлялся;
- migration `041_f2_shadow_evidence_chain` применена, десять F2 tables на месте;
- после финального redeploy health, DB и migrations ready;
- никакой F2 chain не создавалась агентом: первый scan остаётся ручным owner
  action.

Даже выполненный Option A-P не разрешает CP0 live, Option C provider evaluator,
context use, planner, S4 jobs, notifications или AA2/OAuth/MCP. Эти направления
сохраняют собственные approval boundaries.

## 9. Evidence run 1

- Start: `2026-07-17`, Asia/Jerusalem.
- Closure: через 14 календарных дней или после 20 eligible opportunities, что
  наступит раньше.
- Target: не менее 5 completed chains на B1 и на B2.
- Если target не достигнут: честный `INSUFFICIENT_COMPLETIONS`; permanent
  owner-only capability остаётся включённой.
- Stable run log:
  `docs/research/f2-shadow-evidence/2026-07-17-owner-run/README.md`.

## 10. Operational follow-up

После backup и двух последовательных deploy production disk достиг warning
около 90%. F2 health не затронут, но Docker сообщает значительный reclaimable
image/build cache. Очистка не входит в это approval и требует отдельного
maintenance action; до неё следует избегать лишних rebuild.
