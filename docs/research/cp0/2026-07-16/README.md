# S3 CP0 engineering evidence — 2026-07-16

**Artifact status:** S3-T and S3-L green; default-off deployment pending at artifact creation. This is engineering evidence, not owner-live evidence and not `OPERATIONALLY_COMPLETE`.
**Source baseline:** `2c367764cba1020f0f9cca1aade617d9c0f11962`.
**Implementation version:** `3.11.184`; final implementation commit is the commit that contains this directory.
**Raw vs scored:** `metrics.json` is a bounded scored summary copied from witnessed command output. Disposable SQLite files and verbose smoke logs were created under OS temp directories and are not user artifacts.
**Commands:** `npm run smoke:cp0`, `npm run smoke:cp0:load`, plus the existing product smoke matrix listed below.

## Outcome

- Migration 039 creates two bounded CP0 tables.
- CP0 remains globally default-off unless `CP0_OBSERVER_ENABLED=1` and an exact principal appears in `CP0_OBSERVER_OWNER_IDS`.
- Enabled integration was proven on the real `agent.plan` runtime with the mock provider: six actual capability boundaries, one start/terminal pair, `ALLOW`, and zero `review_log` delta.
- The 10,000-run gate covered all 23 registered scenarios using fixture/local work and a hard outbound-network tripwire.
- Start and terminal coverage were both 100%; drops, content leaks, cross-user rows, external calls and shadow mismatches were zero.
- Route p95 changed from 5.045 ms to 5.248 ms on the declared 5 ms deterministic fixture: +4.02%, below the 5% instrumentation budget.
- Queue wait p95/p99 were 37/52 ms; flush p95/p99 were 12/27 ms; the inherited p95 <50 ms and p99 <250 ms gates passed.
- The first load attempts caught and caused fixes for a concurrent-flush queue accumulation bug and excessive queue wait under a CPU-blocking fixture. Failed attempts are retained here as lessons, not silently discarded.

## Hook matrix

| Scenario family | Entry hook | Trusted surface/principal | Observed boundaries | Existing independent oracle |
|---|---|---|---|---|
| Plan | `agent/runtime.js` export wrapper | PWA/Mini App/Telegram server context | closed tools, `llmGate`, task artifact | `smoke:agent-plan`, runtime integration smoke |
| Explain sentence/word/follow-up | runtime wrapper | PWA authenticated context | closed tools, `llmGate`, explanation artifact | explain/follow-up/corpus/word smokes |
| Comprehension | runtime wrapper | PWA authenticated context | closed tools, `llmGate` | comprehension smoke; zero canonical write |
| Role-play | runtime wrapper | PWA authenticated context | scoped controller, `llmGate` on turns | role-play lifecycle/consent smoke |
| Constrained writing | runtime wrapper | PWA authenticated context | scoped controller, `llmGate` on review | writing no-persist smoke |
| Study summary/retell | runtime wrapper | PWA authenticated context | tools/scoped reads, `llmGate`, derived explanation | material consent/purge smoke |
| Lesson Builder | runtime wrapper | PWA authenticated context | scoped controller, `llmGate`, existing validator | 102/102 Lesson Builder smoke |
| Next-text explanation | runtime wrapper | PWA authenticated context | scoped controller, `llmGate` | next-text grounding/no-persist smoke |
| Profile update | runtime wrapper | PWA authenticated context | profile repository write code | profile validation/read-back smoke |
| Review start | Mini App and Telegram adapter wrappers | bound surface and user | challenge repository path | review-session, Telegram review/selector smokes |
| Review answer/skip | Mini App/Telegram/runtime wrappers | bound surface and user | challenge, deterministic grader, canonical event ref | agent/Telegram/Mini App review smokes |
| Review hint | Mini App wrapper | Mini App bound user | challenge/hint path | Mini App review smoke |
| Review annul | Mini App/runtime wrappers | bound surface and user | canonical annul ref | agent review and Mini App rollback smokes |
| Proactive nudge | per-user coordinator wrapper | background + server-derived user | daily claim and channel delivery receipt | Telegram nudge and channel-selector smokes |
| BYOK check | route wrapper | PWA authenticated context | `llmGate` route receipt | BYOK and provider smokes |

Observation hooks receive codes/opaque references only. Arguments, results, prompts, source content, answers and provider bodies are never passed to CP0.

## CP0-specific gates

`npm run smoke:cp0`:

- schema/start/terminal/allowlist/sentinel/cross-user/denominator;
- actual runtime integration and canonical-write parity;
- 23-scenario registry completeness and default-off exact-output identity;
- export/delete/TTL lifecycle;
- old-backup deletion replay including CP0 rows;
- circuit-open fail-open behavior.

`npm run smoke:cp0:load` final witnessed result is recorded exactly in `metrics.json`.

## Existing product regression matrix

Green after the CP0 diff:

- agent plan 32/32; explain 43/43; review 66/66; Lesson Builder 102/102;
- review session 24/24; Mini App review 68/68;
- Telegram content 15/15; review 32/32; nudge 54/54; channel selector 31/31;
- provider 22/22; corpus explanation 27/27; word explanation 15/15; follow-up 18/18; comprehension 20/20; material 51/51;
- role-play, writing, next-text and profile complete gates;
- BYOK 49/49; Mini App auth 32/32; Mini App home 15/15;
- Telegram cloze 21/21; dictate 30/30; selector 25/25; Mini App rollback 30/30;
- auth 29/29 and learner ingest 24/24.

`npm test` is not globally green because a pre-existing classic-mode test expects `btnTableCustomizeToggle`, absent from the baseline `public/index.html`. CP0 changes do not touch that UI or assertion. The failure is recorded rather than repaired in this platform slice.

## Restore-erasure finding and resolution

The lifecycle drill found that the repository claimed deletion-journal replay after restore, but the restore CLI only copied the selected database. Restoring an old backup could therefore replace the journal and resurrect user-scoped rows, including CP0 rows.

Resolution:

- restore refuses to continue when it cannot create its automatic pre-restore safety snapshot;
- after copying the selected backup, the CLI reads deletion records from that current-state snapshot;
- it dynamically removes every restored `user_id` row, related null-user Telegram action residue and the user row;
- it restores the deletion-journal entries idempotently;
- the independent restore smoke proves deleted CP0 rows stay deleted while another user survives.

## R1–R17 diff critique

- R1/R2/R6–R8: no linguistic, pedagogical, source or lesson body enters CP0; parity is not a quality claim.
- R3/R9: only typed scenario/domain references are accepted; shadow `ALLOW` remains diagnostic.
- R4/R5: observer failure is invisible to the learner and cannot become an orchestration platform.
- R10/R11: independent eligible counters, off/on product smokes and restore/sentinel oracles prevent self-certification.
- R12/R13: CP0 has a separate references-only store, fail-open bounded queue and disable-only rollback; restore replay preserves erasure.
- R14/R15: exact owner allowlist, relational user scope, dynamic export/delete, TTL and cross-user negatives are green.
- R16: zero external provider calls, fixed record/queue bounds and measured S0 thresholds are green.
- R17: CP0 observes only canonical event references; it cannot grade, append or replay a verdict.

## Remaining evidence debt

- CP0 production switch remains off and no owner ID is configured.
- Seven-day S3-O owner-live evidence is unavailable and explicitly deferred.
- Any later S3-O finding requires a corrective slice and relevant gate reruns before live Agent Access/CP1 promotion.
