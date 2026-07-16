# LinguistPro Wave 2 — F2 owner-live approval packet

**Дата:** 2026-07-16

**Статус:** `AWAITING_OWNER_APPROVAL / NO_LIVE_ENABLEMENT`

**Engineering basis:** commit `ed3cf11`, package `3.11.189`, migration 041;
`ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`.

Этот packet не включает F2. Он фиксирует отдельную следующую развилку после
успешного default-off deploy.

## 1. Варианты

### Option A — bounded owner-only end-to-end window (recommended)

Достаточный, но ограниченный live shadow-срез для одного exact owner principal:

- включить F2 global + B1 + B2 только для exact owner ID;
- оставить CP0, context use, planner handoff, external/provider evaluator,
  background jobs, notifications и AA2 выключенными;
- использовать только canonical review facts и shipped public corpus;
- только явный ручной scan, максимум одна новая chain в сутки;
- окно до 14 календарных дней или до 20 eligible opportunities, что наступит
  раньше;
- цель evidence: не менее 5 completed chains на construct; иначе честный статус
  `INSUFFICIENT_COMPLETIONS` без расширения cohort или окна;
- owner может skip/defer/delete/revoke consent в любой момент; MNAR не является
  ошибкой;
- никакого влияния на `review_log`, FSRS, memory, grade или planner.

Это минимальный live scope, который остаётся достаточным end-to-end shadow
срезом. Он проверяет обе гипотезы, lifecycle, consent, source drift и delete на
реальном owner path, не превращаясь в публичный pilot.

### Option B — один construct

Включить только B1 или только B2. Риск ниже, но это уже недостаточный F2
end-to-end срез: второй construct и его independent evaluator/source authority
останутся без live evidence. Не рекомендуется как closure F2.

### Option C — defer

Оставить production default-off. Engineering status сохраняется; live evidence
остаётся deferred без отрицательного вывода о качестве реализации.

## 2. Hard gates до включения Option A

1. Подтвердить exact owner principal без wildcard.
2. Сделать backup и проверить DB/migration health.
3. Зафиксировать, что семь запрещённых флагов остаются off; включаются только
   F2 global/B1/B2.
4. Owner вручную принимает storage/B1/B2 consent в UI.
5. Проверить обычный health и отсутствие provider/quota traffic.
6. Немедленно остановить окно при tenant leak, canonical write, source mismatch,
   consent bypass, resurrection, provider/network attempt или UI ambiguity.

## 3. Evidence и acceptance

- 100% chains имеют construct/schema/evaluator/source revisions и consent ref.
- 100% terminal states различают completed, skip, defer, expiry и annulment.
- 0 canonical learning writes; 0 provider/network/quota operations.
- 0 tenant, export/delete или restore authority incidents.
- B2 остаётся помеченным `SELF_REPORTED_RETRIEVAL`.
- Не менее 5 completed chains/construct; иначе
  `OWNER_PATH_TECHNICALLY_VERIFIED / INSUFFICIENT_COMPLETIONS` только для
  фактически проверенных границ.
- Никаких efficacy, retention или operational-complete claims.

## 4. Rollback

Disable-only: вернуть F2 global/B1/B2 в off и перезапустить приложение. Migration
041 и уже созданные artifacts не откатывать; lifecycle/export/delete остаются
доступными по утверждённому контракту. Любая дальнейшая очистка — только явным
owner action.

## 5. Требуемое отдельное решение

Для продолжения владелец должен явно выбрать `Option A`, `Option B` с exact
construct или `Option C`. До этого production остаётся default-off. Даже Option
A не разрешает CP0 live, Option C provider evaluator, planner, S4 jobs,
notifications или AA2/OAuth/MCP.

