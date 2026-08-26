# Физика — решения и форум: research index

Дата: 2026-08-25
Режим: RESEARCH_ONLY
Программа: PHYSICS_SOLUTIONS_FORUM
Source commit: 7293a9212279f2292b33c55a5994afa41340ccbd
Branch: main; local HEAD = локально известному origin/main на момент recon
Worktree: DIRTY до начала работы; все посторонние изменения сохранены
Production inspected this session: NONE
Predecessor production evidence: версия 3.11.435, commit e2e41ffa, physics-year1-problems edition 2, 74 карточки; это датированное evidence 2026-08-25, а не новый live probe
Метод: CODE, repository canon, predecessor LOCAL_TEST / ISOLATED_AUTOMATION / PRODUCTION_ANONYMOUS / OWNER_LIVE_READ_ONLY / OWNER_REPORTED, EXTERNAL_PRIMARY, INFERENCE

## Результат

Исследование не подтверждает необходимость сразу строить собственный форум. Рекомендация — D, staged hybrid:

1. Первый pilot: отдельный task-bound registry типизированных внешних решений и обсуждений. Авторизованный writer только owner; чтение публичных approved-записей anonymous. Контент остаётся у внешнего provider, LinguistPro владеет только anchor, provenance, language, access/health и quality/moderation metadata.
2. Native text solutions разрешать только после evidence gate спроса, link rot и готовности identity/moderation. Они получают собственные revisions и не превращают external projection во вторую истину.
3. Task-scoped Q&A/comments разрешать отдельным gate после доказанного количества задающих и отвечающих, модераторской мощности и account recovery.
4. Бинарные server attachments остаются последними: только после scanning, quota, retention, takedown, object-storage и restore proof.

Это даёт ценность одному пользователю через owner-curated решения, точный task context, поиск и устойчивые URL. Пустые ветки, фиктивная социальность и новый массовый identity perimeter в pilot не создаются.

## Канонические границы

- Public corpus publication, group corpus, learner state, review_log и forum metadata — разные aggregates и разные writers.
- Task anchor закрепляет corpus_id + edition_id + public_work_id + snapshot_sha256; подпункт использует edition-local semantic row anchor, а не display number и не DOM selector.
- Переход на новую edition никогда не переносит решения молча. Нужен явный equivalence decision с provenance.
- Author assertion, expert verification, community usefulness, moderation permission и official corpus status — пять независимых фактов.
- B9 остаётся FROZEN; assignments, teacher authority и curated paths не входят в программу.
- Existing identity/session foundation пригодна как security pattern, но не доказана как public community onboarding.
- Public GET не пишет server learner/account state. Текущий Room может локально обновить OPFS recency при открытии Reader; это не server/account write и должно быть явно объяснено.

## Индекс artifacts

1. [CURRENT_CAPABILITY_AND_GAP_INVENTORY.md](CURRENT_CAPABILITY_AND_GAP_INVENTORY.md)
2. [USER_JOURNEYS_AND_JOBS.md](USER_JOURNEYS_AND_JOBS.md)
3. [EXTERNAL_PRODUCT_AND_PLATFORM_RESEARCH.md](EXTERNAL_PRODUCT_AND_PLATFORM_RESEARCH.md)
4. [OPTIONS_AND_ROLE_SYNTHESIS.md](OPTIONS_AND_ROLE_SYNTHESIS.md)
5. [TRUTH_IDENTITY_LIFECYCLE_MAP.md](TRUTH_IDENTITY_LIFECYCLE_MAP.md)
6. [AUTH_ROLES_AND_MODERATION_MODEL.md](AUTH_ROLES_AND_MODERATION_MODEL.md)
7. [SECURITY_PRIVACY_AND_ABUSE_THREAT_MODEL.md](SECURITY_PRIVACY_AND_ABUSE_THREAT_MODEL.md)
8. [LINKS_ATTACHMENTS_AND_CONTENT_SAFETY.md](LINKS_ATTACHMENTS_AND_CONTENT_SAFETY.md)
9. [SCALE_COST_BACKUP_AND_OPERATIONS_MODEL.md](SCALE_COST_BACKUP_AND_OPERATIONS_MODEL.md)
10. [UX_ACCESSIBILITY_AND_SURFACE_MATRIX.md](UX_ACCESSIBILITY_AND_SURFACE_MATRIX.md)
11. [FINDINGS.md](FINDINGS.md)
12. [Owner decision packet](../../../planning/PHYSICS_SOLUTIONS_FORUM_DECISION_PACKET_2026_08_25.md)

## Post-approval implementation

После owner approval отдельный bounded R2 slice формализован и реализован локально. Research packet выше остаётся историческим decision evidence; актуальные implementation boundary и результаты находятся здесь:

- [R2 implementation packet](../../../planning/PHYSICS_SOLUTION_DOCUMENTS_R2_IMPLEMENTATION_PACKET_2026_08_26.md)
- [R2 implementation evidence](PHYSICS_SOLUTION_DOCUMENTS_R2_IMPLEMENTATION_EVIDENCE_2026_08_26.md)
- [R2 production rollout evidence](PHYSICS_SOLUTION_DOCUMENTS_R2_PRODUCTION_ROLLOUT_EVIDENCE_2026_08_26.md)

## Evidence vocabulary

| Label | Значение в этом пакете |
|---|---|
| CODE | Прочитанный текущий HEAD, schema, routes, repositories, UI и tests |
| LOCAL_TEST | Новый тест этого исследования; NONE, тесты не запускались |
| ISOLATED_AUTOMATION | Датированное predecessor evidence, не новый прогон |
| PRODUCTION_ANONYMOUS | Датированное predecessor evidence, не новый probe |
| OWNER_LIVE_READ_ONLY | В этой сессии NONE |
| OWNER_REPORTED | Owner acceptance physics edition 2 из predecessor handoff |
| EXTERNAL_PRIMARY | Официальные документы provider/OWASP/W3C/FTC/ICO, проверенные 2026-08-25 |
| INFERENCE | Вывод, assumption, модель нагрузки или рекомендация |

## Session boundary

CODE=NONE
MIGRATION=NONE_EXECUTED
OWNER_DATA_WRITES=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
COMMIT=NONE
PUSH=NONE
