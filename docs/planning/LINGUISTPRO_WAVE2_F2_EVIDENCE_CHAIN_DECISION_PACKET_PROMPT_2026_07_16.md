# Next-session prompt — F2 sufficient shadow evidence-chain decision packet

Работаем в `E:\projects\tts-prototype-android`.

Текущий статус:

- S3 CP0: `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`, deployed default-off; CP0 owner-live не начинать.
- F1: `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; production `3.11.188`; все три стадии технически проверены и включены только для одного exact owner; longitudinal/public evidence отложен.
- Реальный integration smoke пройден: один Gemini BYOK plan → explicit `Continue later` → active source-linked `AGENT_TASK` thread → next-session Continue selection; `review_log` остался 6,146, CP0 — 0; сам F1 не вызывал provider.
- Владелец утвердил новый scheduling canon: F1 closure → достаточный F2 shadow evidence chain → bounded next-session/weekly preparation → AA2/AA3. AA1 docs-only contract может идти параллельно; AA2 implementation не начинать.

Прочитай полностью и соблюдай:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md`
5. `docs/planning/LINGUISTPRO_WAVE2_F1_CORRECTABLE_CONTINUITY_DECISION_PACKET_2026_07_16.md`
6. `docs/planning/LINGUISTPRO_WAVE2_F1_CORRECTABLE_CONTINUITY_EXECUTION_APPROVAL_PACKET_2026_07_16.md`
7. `docs/planning/LINGUISTPRO_WAVE2_F1_OWNER_LIVE_EXECUTION_PACKET_2026_07_16.md`
8. `docs/research/f1-owner-live/2026-07-16/README.md`
9. `docs/planning/LINGUISTPRO_WAVE2_F2_SUFFICIENT_SHADOW_SEQUENCE_DECISION_2026_07_16.md`
10. `docs/planning/LINGUISTPRO_AGENT_ACCESS_HERMES_DECISION_PACKET_2026_07_16.md`
11. `docs/research/edu-quality-agentic/2026-07-13/03_AGENT_MEMORY_MODEL.md`
12. `docs/research/edu-quality-agentic/2026-07-13/07_PEDAGOGY_AND_PERSONAL_MEMORY_ORCHESTRATION.md`
13. `docs/research/edu-quality-agentic/2026-07-13/10_PROPOSALS_PRIORITIZED.md`
14. `docs/research/edu-quality-agentic/2026-07-13/11_ROADMAP_AND_OWNER_DECISIONS.md`
15. `docs/research/edu-quality-agentic/2026-07-13/12_ADVERSARIAL_REVIEW.md`
16. `docs/research/edu-quality-agentic/2026-07-13/13_EXECUTIVE_RECOMMENDATION.md`

Сначала восстанови фактическое состояние кода, migrations, routes, UI, feature flags и tests. Проверь расхождения между живым кодом, F1 evidence, research-пакетом и planning canon. Коротко перескажи владельцу: что уже существует, что отсутствует и какие решения действительно нужны для F2.

Основная задача сессии — подготовить отдельный docs-only decision packet:

`docs/planning/LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_DECISION_PACKET_2026_07_16.md`

Не начинай F2 implementation до отдельного утверждения decision packet и последующего execution approval packet.

Пакет должен предложить варианты A/B/C и рекомендовать не минимальный demo, а достаточный bounded end-to-end shadow-срез. Он обязан формализовать:

- точный продуктовый вертикальный срез и не менее двух materially different repository-grounded constructs;
- цепочку canonical observation → falsifiable hypothesis → eligibility/consent → evidence request → accept/skip/defer/expire → attempt/MNAR → independent evaluation → rule-governed shadow decision → outcome/correction/annul/delete;
- distinction между canonical truth, observation, hypothesis, evidence, evaluation, shadow decision, F1 memory и planner handoff;
- typed artifacts, closed schemas, provenance/source links, policy/rubric/evaluator/schema versions;
- independent evaluator/oracle boundary, disagreement и uncertainty handling;
- delayed/context-shift request без преждевременного background-job/notification scope;
- consent, minimization, retention/TTL, correction/dispute, suppression/annul, export/delete/restore guarantees;
- context-query, audit и later-planner handoff contracts;
- UI для “why,” uncertainty, skip/defer, result/evaluation visibility и user correction;
- feature flags, exact owner allowlist, staged activation, rollback и stop conditions;
- deterministic synthetic gates с hard zero-external-provider tripwire;
- отдельный bounded real-evaluator evidence plan только как опционально утверждаемый live шаг;
- R1–R17 adversarial review;
- denominators и evidence metrics: eligible, offered, accepted, completed, skipped, deferred, expired, missing, evaluator agreement/disagreement, corrected/disputed, context-shift outcome;
- migration/schema proposal без создания migration;
- границы с F1, bounded preparation, S4–S7 и AA0–AA2.

Критические authority invariants:

- `review_log`, FSRS, mastery, grading, linguistic truth/resolver, consent и identity остаются детерминированными authority boundaries.
- F2 shadow ничего из этого не пишет и не переопределяет.
- Tutor/LLM не может самостоятельно подтвердить собственную гипотезу.
- Pending hypothesis, skipped/deferred request, engagement/click или отсутствие ответа не являются failure/mastery.
- LLM evaluation, если предлагается, остаётся versioned, rubric-bound, uncertainty-aware, independently audited и non-authoritative.
- F1 goals/threads можно ссылочно учитывать, но нельзя превращать в evidence способности.
- No full transcript, hidden trait/profile, vector-memory shortcut или external-agent memory.
- No CP0 enablement/owner-live, AA2/OAuth/MCP runtime, production code, migration, commit/push/deploy без отдельного разрешения.
- Synthetic gates не расходуют внешний provider quota.

Отдельно определи, какой минимальный typed output F2 может безопасно передать будущему bounded next-session/weekly planner. Не проектируй и не реализуй сам planner; зафиксируй только handoff и stop line. Если для delayed work, retries, notification или background A2 требуется durable job/outbox, явно поставь S4 prerequisite вместо скрытого in-process фонового механизма.

Проверь, какую AA1 OAuth/tool-schema/threat-model документацию можно вести параллельно без чтения F1/F2 payloads и без начала AA2. Не создавай MCP endpoint, OAuth client/credential, SDK dependency или schema/runtime files.

Результат сессии:

1. repo-grounded F2 decision packet с A/B/C;
2. рекомендуемая sufficient shadow configuration;
3. список owner decisions и stop conditions;
4. план отдельного execution approval packet;
5. краткое объяснение “до/после” для владельца.

Никакого production-кода, migration, commit/push/deploy или live provider/CP0/AA2 операции без отдельного разрешения.
