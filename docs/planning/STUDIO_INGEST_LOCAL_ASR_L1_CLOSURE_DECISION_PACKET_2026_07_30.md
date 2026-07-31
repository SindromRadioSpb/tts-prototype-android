# Studio Ingest local ASR L1 — closure / owner decision packet

> **Дата:** 2026-07-30
> **Рекомендация:** принять ограниченную L1-A→L1-E engineering delivery как
> `PASS_WITH_OPEN_ACCEPTANCE_GATES`; **не разрешать permanent integration**.
> **Evidence:** `docs/research/studio-local-processing/2026-07-30/L1_IMPLEMENTATION_EVIDENCE.md`
> и `l1-evidence-report.json`.

> **Superseding owner decision — 2026-07-31:** the ten listen/read checkpoints, four-speaker
> human-gold beta study, and former 60-minute/12-speaker study are recommended rather than
> mandatory. Historical text below records the decision state on 2026-07-30; permanent integration
> is still unauthorized until a separate owner decision.

## Решение, которое предлагается владельцу

1. Принять локальные scoped-коммиты L1 как исследовательскую default-off capability.
2. Не менять production, schema, provider defaults и не включать capability обычным
   пользователям.
3. Отдельно решить, разрешён ли следующий evidence-only closure slice: batch-20 через sidecar,
   Chrome/Edge/Firefox matrix и подготовка blinded human-gold/owner acceptance window.
4. Human-gold and paired Gemini remain useful recommended evidence; permanent integration itself
   requires a separate explicit owner authorization and release-policy decision.

## Почему не GO к permanent integration

Engineering gates сильные: 117-min и 2:59:59 RTF <0.05, independent S12 gates PASS, restart
не дублирует accepted inference, cancel <500ms/<15s, storage deletion и model lifecycle
доказаны. Но quality claim всё ещё опирается на малый L0 gold и silver subtitle oracle;
Gemini set неполон из-за quota. Edge/Firefox и owner listen/read не проведены. Объявить
product-ready сейчас означало бы подменить отсутствующие evidence решением по умолчанию.

## Stop boundaries остаются

- sole pin: `ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5`;
- full large-v3 не default и не fallback;
- никакого silent cloud upload/fallback;
- никаких schema migration, deploy, production mutation, provider-default или push без
  отдельного разрешения владельца;
- human/private media и raw transcripts не коммитятся.

## Текст возможного следующего утверждения

> Утверждаю L1 closure packet от 2026-07-30 и разрешаю только evidence-closure slice:
> sidecar batch-20, Chrome/Edge/Firefox loopback matrix и подготовку blinded human-gold/owner
> acceptance packet с тем же pinned turbo CT2; permanent integration, schema, production,
> provider defaults, cloud spend и публикация по-прежнему не разрешены.

## Paste-ready prompt следующей сессии

```text
Продолжаем Studio Ingest local ASR после ограниченной L1-A→L1-E реализации.

Прочитай сначала:
1. docs/research/studio-local-processing/2026-07-30/L1_IMPLEMENTATION_EVIDENCE.md
2. docs/research/studio-local-processing/2026-07-30/l1-evidence-report.json
3. docs/planning/STUDIO_INGEST_LOCAL_ASR_L1_CLOSURE_DECISION_PACKET_2026_07_30.md
4. docs/planning/STUDIO_INGEST_LOCAL_ASR_L1_DESIGN_DECISION_PACKET_2026_07_30.md
5. CLAUDE.md и docs/PROJECT_ROLES.md

Сначала проверь dirty worktree и живой код. Permanent integration остаётся NO-GO. До exact
owner approval из closure packet не запускай batch/private media, browser matrix, cloud spend,
production/schema/provider-default changes, deploy или push. Сохрани sole pin
ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5;
full large-v3 не использовать как default/fallback.
```
