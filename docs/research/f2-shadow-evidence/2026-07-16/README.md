# F2 bounded shadow evidence — 2026-07-16

**Статус:** `ENGINEERING_COMPLETE / DEFAULT_OFF_DEPLOYED / LIVE_EVIDENCE_DEFERRED`

**Commit/version:** `ed3cf11`, package/service-worker cache `3.11.189`.

Этот bundle фиксирует bounded end-to-end shadow-срез Option B. Он не является
минимальной демонстрацией: покрыты два construct, observation -> hypothesis ->
request -> attempt -> evaluation -> shadow decision, consent, MNAR, expiry,
annulment, export/delete, restore anti-resurrection, tenant isolation, mobile UI,
CP0 registry parity и load envelope. Никаких canonical learning writes,
provider-вызовов, planner/S4 jobs или live enablement не выполнялось.

## Реализованный срез

- B1 `UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION`: canonical review-log eligibility,
  независимый deterministic Hebrew evaluator и non-writing shadow verdict.
- B2 `READING_TO_NEW_CONTEXT_TRANSFER`: явно маркированный self-report из
  `reading:tap`, bounded public-corpus target и независимый exact evaluator.
- Additive server migration 041 с десятью F2 tables и principal-derived scope.
- Global/exact-owner/construct/consent gates; wildcard не является валидным
  способом включения. Все deployment defaults остаются off.
- Ручной scan и offer; никаких фоновых candidate jobs или уведомлений.
- Отдельный Mentor Home block с storage/B1/B2 consent, lifecycle controls,
  export/delete и честными empty/boundary states.
- F2 context preview существует только как gated, redacted и non-consumed
  boundary; planner отсутствует.

## Gate results

| Gate | Результат |
|---|---|
| `npm run smoke:f2` | PASS: contract, observation, target, evaluator, lifecycle, isolation, restore, UI |
| `npm run smoke:f2:load` | PASS: 10,000 ops; network/provider/quota = 0; pure p95 0.002 ms; DB p95 2.304 ms, p99 3.108 ms |
| Corpus target | PASS: catalog v7, model `pealim-infl-v12`, 1 work / 33 rows / 6 ms, limits 24 works / 2,000 rows / 150 ms |
| Restore replay | PASS: 1 F2 chain replayed, 3 resurrected rows deleted |
| Mobile | PASS at requested 380×844 override; screenshot `mobile-380x844.png` |
| Existing focused regressions | PASS: F1, memory-canon 79/79, FSRS 30/30, grader gold 77/77, Mentor Home 25/25, CP0, API smoke |
| Full `npm test` | 278 total; 269 pass; 9 pre-existing unrelated failures |
| Default-off production | PASS: image `ed3cf11`; health/DB/migrations ready; migration 041 + 10 F2 tables; F2/CP0 flags off |

Full-suite baseline failures are outside the F2 diff: one classic-mode assertion
expects absent `btnTableCustomizeToggle` in `public/index.html`; eight are in the
untouched premium pipeline/provider/quota test path (tests 116–119, 121, 123,
126–127). F2 does not modify those files.

## Authority and lifecycle matrix

| Event | Learner truth | F2 artifact effect | Canonical schedule/memory |
|---|---|---|---|
| offer/accept | no claim | state transition + audit | no write |
| submit | bounded attempt | independent evaluation + shadow decision | no write |
| defer | MNAR `DEFERRED` | explicit non-response attempt | no write |
| skip | MNAR `SKIPPED` | terminal request/hypothesis | no write |
| expiry | MNAR `EXPIRED` | lifecycle terminalization | no write |
| correct/annul source | canonical event wins | stale chain suppressed/annulled | F2 cannot reverse source |
| consent revoke | learner authority | use disabled; scoped cleanup | no write |
| delete | learner authority | chain deletion + durable content-free tombstone | no write |
| restore old backup | deletion authority wins | tombstone replay prevents resurrection | no write |

## R1–R17 adversarial review

- R1/R10: no generated Hebrew paradigms; strict normalization, ambiguity and
  abstention are explicit; B2 target must have exactly one correct option.
- R2/R8/R17: both checks are small, skippable, delayed and non-punitive; MNAR is
  never treated as failure; shadow output cannot grade or reschedule learning.
- R3/R9: artifacts link by stable IDs with source revision/provenance; derived,
  self-reported and canonical authority remain distinct.
- R4: separate progressive block, honest copy and mobile proof; no dead-end when
  no eligible opportunity exists.
- R5/R6/R7: offline/public-corpus path only; attribution/source anchors remain;
  no claim that a synthetic technical slice proves pedagogical efficacy.
- R11: source correction/annulment dominates; no existing resolver or corpus
  content is rewritten.
- R12/R13: additive migration, default-off flags and disable-only rollback;
  old-backup erasure replay is idempotent.
- R14/R15: authenticated principal scope, transaction locking, caps, consent,
  redacted export, bounded answer retention and non-expiring content-free
  erasure tombstones.
- R16: bounded scans and hard zero-network/provider/quota load tripwire.
- R17-B: evaluators are pure, independent of writers/reviewer/planner/provider;
  disagreement/ambiguity can abstain and never becomes canonical truth.

## Epistemic limits and stop conditions

- Это local/synthetic engineering evidence, не owner-live и не efficacy proof.
- 150 ms относится к bounded corpus scan после инициализации кэшированного
  shipped asset/index; cold asset initialization измеряется отдельно и не
  маскируется как per-scan latency.
- B2 `reading:tap` является self-report о воспроизведении, не независимым
  измерением retrieval; UI и artifact authority это явно сохраняют.
- F2/CP0 live enablement, Option C provider evaluator, planner, S4 background
  jobs и AA2/OAuth/MCP остаются запрещены.
- Следующая ступень возможна только по отдельному owner approval и должна
  возвращать `INSUFFICIENT_COMPLETIONS`, если bounded live sample не набран.
