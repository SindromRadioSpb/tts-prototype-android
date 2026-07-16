# LinguistPro Wave 2 — F2 evidence-chain execution approval packet

**Дата:** 2026-07-16

**Статус:** `CONTRACT_APPROVED / EXECUTION_AUTHORIZED`

**Contract:** `LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_DECISION_PACKET_2026_07_16.md`, Option B owner-approved 2026-07-16.

**Рекомендуемая execution resolution:** A/A/A/A/A/A/A/A/A/A/A/A в §22.

**Repository baseline:** `main` / `bcf9482`, package `3.11.188`; highest server migration `040_f1_correctable_continuity.sql`; CP0 default-off; F1 owner-only technically verified.

**Параллельный трек:** владелец отдельно запустил AA0/AA1 docs session. Эта execution packet не меняет её artifacts, не читает F1/F2 payloads для Agent Access и не начинает AA2.

**Owner resolution (2026-07-16):** `A/A/A/A/A/A/A/A/A/A/A/A`.

**Authority:** владелец разрешил bounded implementation, migration 041, локальные/mobile/load gates, scoped commit/push и default-off deployment. Не разрешены F2/CP0 live enablement, Option C provider evaluator, planner, S4 background jobs и AA2/OAuth/MCP.

## 1. Рекомендуемое execution authorization

После отдельного owner approval разрешить один bounded F2 engineering slice:

1. добавить additive server migration 041 с отдельными F2 artifact tables;
2. реализовать B1 `UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION` и B2 `READING_TO_NEW_CONTEXT_TRANSFER`;
3. добавить deterministic observation selectors, public-corpus target selector, two independent non-writing evaluators и shadow reducer;
4. добавить first-party authenticated APIs и отдельный F2 block в Mentor Home;
5. расширить consent/export/delete/restore anti-resurrection contracts;
6. зарегистрировать content-safe F2 CP0 scenarios, не включая CP0;
7. доказать full lifecycle, MNAR, authority, source drift, isolation, delete/restore, mobile UI и planner-handoff boundary;
8. выполнить ≥10,000 local operations под hard zero-external-provider/network tripwire;
9. сохранить evidence в stable repo path;
10. scoped commit/push и default-off deployment только после green gates;
11. проверить ordinary production health без F2/CP0 enablement;
12. вернуться со статусом `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` и отдельным owner-live launch request.

Не разрешать Option C real LLM evaluator, planner implementation, background job, notification, personal material, AA2/OAuth/MCP или public cohort.

## 2. Entry state и reconciliation

### 2.1 Live substrate

| Boundary | Live hook | Execution use |
|---|---|---|
| Canonical facts | `db/learnerLogRepo.itemRows(userId,itemKey)`; migration 021 | Read-only non-annulled review observations. |
| Projection | `db/learnerProjectionRepo.getProjection` и channel stats | B1 eligibility only; no mutation. |
| Deterministic grade | `agent/grader.js`, `public/js/grade-policy.js` | Pure non-writing oracle semantics. |
| Canonical writer | `agent/reviewer.js` | Explicitly unreachable/prohibited. |
| Public source read | `db/corpusSentenceRepo.js` exact sentence/window; shipped corpus works | Source-B validation/reveal. |
| Public shortlist | `corpus-vocab-v7.json` + current catalog version | `pid:` item -> bounded candidate work IDs. |
| Reading observation | `review_log` row: `source=reading-tap`, `channel=reading:tap`, `meta.text_key` | B2 self-reported retrieval observation, labelled as such. |
| Consent/identity | `consent_records`, authenticated PWA session, CSRF | New F2 keys and principal-derived scope. |
| Export/delete | `identityRepo` structural user-table sweep | Account lifecycle coverage. |
| Restore | `restoreErasureReplay.replayDeletionJournal` | Per-chain anti-resurrection extension. |
| UI | `public/js/mentor-home.js`, `public/library.html`, ru/en/he locales | Separate progressive F2 block. |
| Cleanup | bounded hourly ops sweep | Expiry/purge only; no candidate generation/evaluation. |
| CP0 | scenario registry + observer default-off | Registry parity only; no live observation. |

### 2.2 Missing hooks that this slice must add

- No F2 repository or schema.
- No read-only canonical-event interpretation adapter.
- No public-corpus reverse occurrence selector by `pid:` item key.
- No non-writing shadow attempt/evaluation path.
- No F2 API/UI/flags/consents/export/delete/restore/gates.

### 2.3 Stop-before-code recheck

Immediately before implementation verify:

- HEAD/package and worktree scope;
- migration 041 remains free;
- no overlapping F2 branch/files appeared;
- current corpus catalog/version and `corpus-vocab-v<N>.json` are aligned;
- `smoke:f1`, `smoke:memory-canon`, `smoke:fsrs`, `smoke:grader-gold`, `smoke:mentor-home`, `smoke:cp0` remain green;
- AA0/AA1 session has not introduced overlapping production/runtime files.

Any mismatch returns to owner before code.

## 3. Exact implementation file map

### 3.1 New production files

| File | Responsibility |
|---|---|
| `migrations/041_f2_shadow_evidence_chain.sql` | Ten bounded F2 tables, checks, FKs and indexes. |
| `db/f2EvidenceRepo.js` | Single writer for F2 artifacts/lifecycle/query receipts/export/purge. |
| `db/f2CorpusTargetRepo.js` | Read-only bounded public-corpus target shortlist/occurrence resolution. |
| `agent/evidence/contracts.js` | Closed enums/schemas/limits/versions/digests/error codes. |
| `agent/evidence/sourceAdapters.js` | Exact canonical-event, public-source, asset and consent-aware source checks. |
| `agent/evidence/observationSelector.js` | B1/B2 eligibility predicates and denominators. |
| `agent/evidence/requestBuilder.js` | Frozen request/expected contracts; no tutor/model. |
| `agent/evidence/evaluators.js` | B1 deterministic Hebrew answer oracle + B2 exact-option oracle; no writers. |
| `agent/evidence/shadowReducer.js` | Versioned evaluation -> advisory shadow-action code. |
| `agent/evidence/contextQuery.js` | Offer ranking, management view and planner-handoff preview receipts. |
| `agent/evidence/runtime.js` | Principal/flags/consent/controller boundary. |

No new dependency, SDK, provider client, queue, worker, vector index, object store or external service.

### 3.2 Modified production files

| File | Exact boundary |
|---|---|
| `server.js` | Import runtime/repo, `rlEvidence`, first-party routes, consent-revoke cascade, bounded expiry cleanup. |
| `db/identityRepo.js` | Redacted export and explicit `f2_erasure_journal` handling. |
| `db/restoreErasureReplay.js` | Replay retained F2 per-chain erasures after old-backup restore. |
| `agent/controlPlane/scenarioRegistry.js` | Add F2 scenarios/capabilities only; CP0 flags unchanged. |
| `public/js/mentor-home.js` | Separate F2 scan/offer/attempt/result/history/control UI; mount read-only. |
| `public/library.html` | F2 styles/mobile guards only. |
| `public/i18n/locales/{ru,en,he}.js` | Complete consent, why, MNAR, evaluator, dispute/delete/error copy. |
| `public/sw.js` | Package/cache bump for modified shell/locales/module. |
| `public/index.html` | Shared locale cache-bust only if required by existing convention. |
| `package.json` | Package patch version and `smoke:f2`, `smoke:f2:load`. |

Explicitly no changes to `review_log` schema, FSRS reducers, learner projections, canonical grader/reviewer behavior, resolver truth, F1 schemas/runtime, notification controllers, planner/Lesson Builder, AA0/AA1 docs or AA2 runtime.

### 3.3 New test/evidence files

| File | Gate |
|---|---|
| `scripts/premium/f2-contract-smoke.js` | Closed schemas, flags, roles, routes, no canonical write. |
| `scripts/premium/f2-observation-smoke.js` | B1/B2 predicates, annul fold, self-report authority, denominators. |
| `scripts/premium/f2-target-smoke.js` | Public target selector, distinct context, ambiguity/source-drift limits. |
| `scripts/premium/f2-evaluator-smoke.js` | Independent B1/B2 gold, assisted/abstain/disagreement. |
| `scripts/premium/f2-lifecycle-smoke.js` | accept/skip/defer/expire/attempt/MNAR/dispute/suppress/annul/delete. |
| `scripts/premium/f2-isolation-smoke.js` | Cross-user IDs/sources/evaluation/export/delete negatives. |
| `scripts/premium/f2-restore-smoke.js` | Old-backup zero-resurrection and unaffected-user/canonical proof. |
| `scripts/premium/f2-ui-smoke.js` | Read-only mount, explicit scan/offer, ru/en/he/RTL/mobile states. |
| `scripts/premium/f2-load-smoke.js` | ≥10,000 operations, S0 thresholds, hard zero-network/provider tripwire. |
| `docs/research/f2-shadow-evidence/2026-07-16/README.md` | Stable engineering evidence and epistemic limits. |
| `docs/research/f2-shadow-evidence/2026-07-16/metrics.json` | Bounded machine-readable gate metrics. |

Final screenshots belong under the stable evidence directory; temp DB/logs remain scratch.

## 4. Logical roles и CP0 scenarios

### 4.1 Roles

| Role | Authority | May read/create | Forbidden |
|---|---|---|---|
| `evidence.selector` | `READ_SCOPED`, `POLICY_DECIDE` | Canonical refs, projection metadata, observations/hypotheses/requests | Grade, tutor prose, canonical/F1 writes. |
| `evidence.evaluator.deterministic` | `EVALUATE_SHADOW` | Frozen expected contract + one submitted attempt; evaluation artifact | Provider, reviewer, reducer, repository mutation. |
| `evidence.reducer.shadow` | `POLICY_DECIDE` | Versioned evaluation/evidence; shadow decision | Canonical state, planner execution, notification. |
| `evidence.manager` | `USER_CONTROLLED_WRITE` | Consent-approved lifecycle, dispute/export/delete/context receipts | Learning truth or external egress. |

All model routes `NONE_DETERMINISTIC`, budget `ZERO`. Reserved LLM evaluator role remains disabled with no tools/routes.

### 4.2 CP0 registry additions

| Scenario | Capabilities | Canonical write |
|---|---|---:|
| `evidence.scan` | `repo:evidence_read`, `repo:public_corpus_read` | No |
| `evidence.manage` | `repo:evidence` | No |
| `evidence.attempt` | `repo:evidence`, `eval:deterministic` | No |
| `evidence.context_offer` | `repo:evidence_query` | No |
| `evidence.handoff_preview` | `repo:evidence_query` | No |
| `evidence.export` | `repo:evidence_export` | No |
| `evidence.delete` | `repo:evidence_delete` | No |

Registry parity is tested while CP0 remains off. Content-safe codes/opaque refs only if CP0 is later separately enabled.

## 5. Migration 041 contract

### 5.1 Tables

| Table | Purpose | Hard bounds/indexes |
|---|---|---|
| `f2_observations` | Current typed projection of canonical pattern | ≤20 live/user; user/construct/status/expiry index. |
| `f2_hypotheses` | Falsifiable unverified claim lifecycle | ≤10 live/user; one live per user+construct+item. |
| `f2_requests` | Offer/not-before/expiry/frozen expected ref | ≤2 open/user; one open/construct; user/state/not_before index. |
| `f2_attempts` | Submitted answer or explicit MNAR state/revision | One finalized/request; answer ≤512 UTF-8 bytes; ≤2 deferrals. |
| `f2_evaluations` | Versioned verdict/uncertainty/rationale codes | One primary evaluator/request; no free rationale. |
| `f2_shadow_decisions` | Advisory reducer output and supersession | One current/hypothesis; no canonical FK target. |
| `f2_source_links` | Artifact-to-source provenance | ≤5/artifact; anchor ≤1,024 bytes; exact revisions/digests. |
| `f2_audit_events` | Content-free lifecycle/action history | closed action/reason codes; 30d TTL. |
| `f2_context_queries` | Offer/manage/handoff selection receipt | selected ≤2; manifests capped; 30d TTL. |
| `f2_erasure_journal` | Per-chain old-backup anti-resurrection | no FK/content/digest; retained beyond oldest backup. |

`f2.evidence.v1` and `f2.outcome.v1` remain typed projections over IDs; no duplicate evidence/outcome tables.

### 5.2 Common invariants

- Principal-derived `user_id`; opaque random IDs.
- Closed CHECK enums plus application `additionalProperties=false` validators.
- `schema_version`, `policy_version`, predicate/rubric/evaluator/normalizer/reducer versions mandatory where applicable.
- Every mutation uses `withTxnLock` + `BEGIN IMMEDIATE`, expected revision/idempotency and one atomic commit.
- Same idempotency key/different digest -> `IDEMPOTENCY_CONFLICT`.
- Query-time consent/expiry/source status authoritative.
- No FK or trigger writes into F1/canonical/CP0 tables.
- Migration is additive/idempotent; rollback disables feature, never drops tables.

## 6. Observation selection

### 6.1 Shared canonical fold

1. Load user-scoped rows by item.
2. Collect all `annul` targets independent of ordering.
3. Exclude annulled facts before predicates.
4. Preserve row authority/provenance; never reinterpret `skip`, `mark`, missingness or learner event.
5. Copy IDs/enums/versions only, not source/answer content.

### 6.2 B1 exact predicate v1

- `item_key` must be `pid:<id>` and projection exists.
- ≥2 non-annulled `kind=review`, grade ≥3 receptive-family rows on distinct UTC dates within 60d.
- No non-context-supported `dictate` grade ≥3 within 90d.
- Latest qualifying receptive row ≥24h old.
- Existing deterministic dictate asset predicate passes: length/safety/homophone/asset available.
- `skip`, mark, click, passive audio, F1 and pending artifacts ineligible.

Stable result codes enumerate every exclusion; all canonical candidates enter the denominator before filtering.

### 6.3 B2 exact predicate v1

- Non-annulled `kind=review`, grade ≥3, `source=reading-tap`, `channel=reading:tap`, `meta.text_key` within 30d.
- Observation authority = `SELF_REPORTED_RETRIEVAL`; UI/handoff preserve that label.
- `item_key` must be `pid:<id>`.
- Source-A `text_key` resolves to current public corpus catalog/work/revision; private/unknown source is ineligible without reading body.
- Request not before +24h.
- Plain `word_clicked`, `sentence_read`, reveal, F1 thread or learner event never substitutes.

## 7. Public-corpus target selector

`db/f2CorpusTargetRepo.js` must not pretend an existing server recommendation exists. It implements only a bounded F2 occurrence lookup:

1. resolve current catalog version from the same root/config used by the Reading Room;
2. load/cache matching `corpus-vocab-v<N>.json` after version/schema/model checks;
3. map `pid:` to vocab dictionary ID and invert work profiles in memory to a stable sorted candidate-work list;
4. exclude source-A `text_key`/work and previously used F2 target refs;
5. scan at most 24 candidate works, at most 2,000 sentence rows and ≤150ms CPU/wall budget per explicit scan;
6. tokenize occurrence using the same pinned form-first/keyer contract, then verify exact canonical `pid:` identity;
7. require current work/source revision and one unambiguous expected surface;
8. for B2 create closed option set only if exactly one target is correct under independent validator;
9. stable selection: keyed hypothesis digest over sorted eligible anchors, not popularity/engagement;
10. no match/budget/ambiguity/version mismatch -> named `ABSTAIN/INELIGIBLE`, never fabricated target.

The selector reads shipped public assets only. It creates no corpus index, persists no private content and does not become a general server recommender.

## 8. Request and evaluator contracts

### 8.1 Frozen request

The builder persists before offer:

```text
request_id, hypothesis_id, construct_id,
source_a_ref, source_b_ref, target_revision,
expected_contract_digest, stimulus_kind,
not_before, expires_at, policy/predicate/schema versions
```

Expected raw answer is server-only and not returned before finalization. Request builder has no evaluator/reducer access.

### 8.2 B1 evaluator

- Input: frozen expected surface/item key, answer ≤512 bytes, input/assistance metadata.
- Reuse pure normalization semantics, not reviewer writer.
- Verdicts: `CORRECT_UNASSISTED`, `CORRECT_ASSISTED`, `NEAR_MISS`, `INCORRECT`, `ABSTAIN`.
- Homophone/ktiv/ambiguous/version/source defect -> abstain as specified by gold.

### 8.3 B2 evaluator

- Primary input is closed option ID; optional typed fallback uses strict deterministic normalization.
- Revalidate target/source revision and one-correct-option invariant at submit time.
- Verdicts: `CORRECT_NEW_CONTEXT`, `CORRECT_ASSISTED`, `INCORRECT_NEW_CONTEXT`, `AMBIGUOUS`, `SOURCE_DRIFT`, `ABSTAIN`.

### 8.4 Structural independence

Static/import gate forbids evaluator imports of:

```text
agent/reviewer
agent/planner
agent/explainer
agent/llmGate
agent/evidence/shadowReducer
db/f2EvidenceRepo
any network/provider client
```

Evaluator returns an object only. Runtime persists it after schema validation. Independent raw-corpus oracle/golden fixtures do not reuse builder output. Disagreement -> `INCONCLUSIVE`, handoff blocked, evaluator version disabled.

## 9. Shadow reducer

Pinned `f2-shadow-rule.1.0.0` maps only valid, non-disputed evaluation:

| Construct/verdict | Decision code |
|---|---|
| B1 correct unassisted | `NO_EXTRA_TARGETED_PRACTICE` |
| B1 assisted/near miss | `ONE_CONTEXTUAL_RETRIEVAL_CANDIDATE` |
| B1 incorrect | `ONE_UNSUPPORTED_RETRIEVAL_CANDIDATE` |
| B2 correct new context | `TRANSFER_OBSERVED_ONCE_NO_ACTION` |
| B2 assisted | `ONE_LOWER_SCAFFOLD_CANDIDATE` |
| B2 incorrect | `ONE_CONTRASTIVE_CONTEXT_CANDIDATE` |
| Any abstain/drift/disagreement/dispute | `INCONCLUSIVE` |

These codes are advisory and capped at one future candidate. They never call planner, create tasks/reviews/notifications or imply mastery.

## 10. Lifecycle/API contract

All routes require first-party authenticated PWA session; mutations require CSRF, dedicated rate limit and unknown-field rejection.

| Route | Method | Purpose |
|---|---|---|
| `/api/agent/evidence` | GET | Management/history page, cursor ≤5. |
| `/api/agent/evidence/scan` | POST | Explicit deterministic eligibility/target scan; max one/day offer. |
| `/api/agent/evidence/:id/action` | POST | `ACCEPT`, `SKIP`, `DEFER`, `SUPPRESS`, `UNSUPPRESS`, `DISPUTE`, `ANNUL`, `DELETE`. |
| `/api/agent/evidence/:id/attempt` | POST | One bounded final submission; no user/item/expected authority args. |
| `/api/agent/evidence/offer` | GET | One eligible visit-time offer; no mount write besides explicit user-open receipt policy. |
| `/api/agent/evidence/handoff-preview` | GET | Minimized §12 output, never planner execution. |
| `/api/agent/evidence/export` | GET | Deterministic redacted F2-only export. |
| `/api/agent/evidence/delete-all` | POST | Exact typed confirmation and synchronous bounded erase. |

Stable errors include `F2_DISABLED`, `F2_NOT_ALLOWLISTED`, `CONSENT_REQUIRED`, `CONSTRUCT_DISABLED`, `NO_ELIGIBLE_OBSERVATION`, `TARGET_NOT_FOUND`, `TARGET_AMBIGUOUS`, `SOURCE_DRIFT`, `REQUEST_NOT_READY`, `REQUEST_EXPIRED`, `ATTEMPT_FINAL`, `EVALUATOR_ABSTAIN`, `EVALUATOR_DISAGREEMENT`, `STATE_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `PURGE_FAILED`.

Ordinary Mentor Home mount/list is read-only and creates no hypothesis/request. Only explicit scan can create bounded candidates. `GET offer` must not create or evaluate anything.

## 11. Consent, purge, export и restore

Exact versioned keys, default off:

```text
f2_shadow_store
f2_shadow_b1_dictation
f2_shadow_b2_context_transfer
f2_shadow_planner_handoff
f2_shadow_external_evaluator   # reserved, never read in this execution
```

- B1/B2 revoke hard-deletes that construct's non-content tombstoned chain.
- Store revoke blocks all F2 access immediately and synchronously purges bounded F2 content.
- Handoff revoke removes/blocks handoff projections without changing evidence chain.
- Any purge error visible and all F2 use fails closed.
- F2 export omits keyed digests/secrets and labels self-report/evaluator/shadow authority.
- Delete transaction inserts erasure journal before cascade.
- Account delete transfers authority to account `deletion_journal`.
- Restore replays account + F1 memory + F2 chain erasures idempotently; no deleted data resurrects.

No existing F1/model consent authorizes F2 automatically.

## 12. Context query и planner handoff

Offer ranking: unoffered older qualified hypothesis first; alternate B1/B2 by last offer; stable ID tie-break. Recheck flags/owner/consent/source/expiry/suppression/dispute and daily/open caps.

`f2.planner_handoff.1.0.0` returns only:

```text
handoff_id, construct_id, request_outcome,
shadow_action_code, confidence_band,
uncertainty_codes, opaque item/source refs,
policy_version, decision_rule_version,
generated_at, expires_at
```

No answer, raw grade history, F1 payload, hypothesis prose, source body or trait. Preview remains disabled by `F2_SHADOW_PLANNER_HANDOFF_ENABLED=0` in engineering/default-off deploy. No planner consumer is added.

## 13. Mentor Home UI

Separate block after F1 Memory and before explanation history:

```text
Evidence checks
  -> consent/boundary copy
  -> Find a small check (explicit scan)
  -> Offered / Later / History filters
  -> why + unknown + source shift + evaluator badge
  -> accept / later / skip / suppress
  -> bounded attempt
  -> visible evaluation + shadow outcome
  -> dispute / annul / delete
  -> export / delete all
```

Copy must say: this does not alter word memory, grade or schedule; skip/later/no-answer is not failure; Reading Room observation may be self-report. No red failure styling for MNAR. All ru/en/he/RTL/focus/reduced-motion/380×844 states and source/error/offline/abstain/disagreement/delete confirmation must be verified. Dynamic content via `textContent`.

## 14. Flags, allowlist и rollback

Defaults:

```text
F2_SHADOW_ENABLED=0
F2_SHADOW_OWNER_IDS=
F2_SHADOW_B1_ENABLED=0
F2_SHADOW_B2_ENABLED=0
F2_SHADOW_CONTEXT_USE_ENABLED=0
F2_SHADOW_PLANNER_HANDOFF_ENABLED=0
F2_SHADOW_EXTERNAL_EVALUATOR_ENABLED=0
```

No wildcard. Startup validates malformed allowlists. No env change in implementation commit. Default-off deployment is the only proposed deployment authority. Export/delete remain available for stored data under flag-off.

Rollback: planner handoff off -> context use off -> B2/B1 off -> global off. Retain migration/data/lifecycle access. CP0 remains unchanged/off.

## 15. Required commands and acceptance

New commands:

```text
npm run smoke:f2
npm run smoke:f2:load
```

Required regressions:

```text
npm run smoke:f1
npm run smoke:memory-canon
npm run smoke:fsrs
npm run smoke:grader-gold
npm run smoke:mentor-home
npm run smoke:cp0
npm run test:api-smoke
npm test
```

Acceptance:

- 100% closed-schema/golden/transition/source-version expected results;
- zero false confident accept in B1/B2 gold;
- zero cross-user access;
- zero canonical/F1/consent/identity mutation outside explicit existing consent route;
- zero evaluator access to writer/tutor/provider/reducer;
- zero MNAR evaluation/write/failure/mastery;
- zero deleted-chain resurrection;
- zero content/secret sentinel in logs/CP0/query receipts;
- exactly zero non-loopback/network/provider calls and real quota reservations;
- ≥10,000 operations; DB/WAL p95 <50ms, p99 <250ms, lock errors <0.1%; deterministic API p95 <1s, p99 <2s;
- all defaults off/non-owner hidden; ru/en/he/RTL/380×844 green.

`npm test` baseline failures, if any, must be recorded and proven pre-existing; unrelated repair is not folded into F2.

## 16. Hard zero-provider tripwire

Both smoke suites install process-level guards before F2 modules load:

- deny `http`, `https`, `fetch`, DNS, socket connect and child-process network clients except explicit loopback fixture server;
- replace/spy `llmGate`, Gemini/OpenRouter/Dicta/TTS/Translate entry points and usage reservation;
- assert attempts=0, provider calls=0, real reservations=0 at terminal;
- any attempted import/call fails immediately, not merely increments a metric.

Public corpus reads are local filesystem fixture/shipped assets only.

## 17. Evidence artifact and completion states

Stable path:

```text
docs/research/f2-shadow-evidence/2026-07-16/
```

Required: README with source commit/commands/raw-vs-scored/limitations; metrics; schema/authority/lifecycle matrix; target-selector manifest; evaluator gold summary; 10k zero-network result; export/delete/restore reconciliation; screenshot manifest; post-diff R1–R17 critique; deferred live evidence.

Status ladder:

| Status | Meaning |
|---|---|
| `CONTRACT_APPROVED` | This execution packet A/A... approved. |
| `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` | All local/regression/mobile gates green and default-off deploy healthy. |
| `LIVE_READY` | Separate exact-owner launch packet approved. |
| `OWNER_PATH_TECHNICALLY_VERIFIED` | Bounded owner chain works; no efficacy claim. |
| `OPERATIONALLY_COMPLETE` | Requires separately pre-registered sufficient real evidence; not granted by engineering/owner smoke. |

## 18. Staged execution

1. Re-read current decision/execution/S0–S3 and check AA session overlap.
2. Produce exact source/consumer/import graph.
3. Write failing contract/observation/target/evaluator/lifecycle/isolation/restore gates first.
4. Implement migration/repository/contracts with flags off.
5. Implement B1 and prove canonical parity.
6. Implement B2 bounded public selector and independent oracle.
7. Implement lifecycle/APIs/UI/locales.
8. Run full gates/load/tripwire/mobile evidence.
9. Post-diff R1–R17 review and reconcile findings.
10. Preserve evidence, then scoped commit/push/default-off deploy if authorized by approved Decision 1.
11. Verify public health/migrations only; assert all F2/CP0 flags off.
12. Return for adjudication and separate owner-live packet.

## 19. R1–R17 pre-code critique

| Lens | Execution attack | Required response |
|---|---|---|
| R1 | Target selector chooses wrong homograph/form | `pid:` only, exact occurrence, ambiguity abstain, no synthesis. |
| R2 | Daily test becomes nuisance | Explicit scan, one offer/day, two open max, delay/expiry/suppress. |
| R3 | Source links decorative | Exact current catalog/work/text/order/revision and no fuzzy re-anchor. |
| R4 | Complex lifecycle overwhelms mobile | Progressive block, valid-state actions, uncertainty and 380px proof. |
| R5 | Shadow marketed as learner understanding | One bounded check, no mastery/profile claim, deterministic core. |
| R6 | Selector becomes private corpus ingestion | Shipped public corpus only; no personal body/index. |
| R7 | Context shift changes register/meaning | Visible sources; exact occurrence; ambiguity/register risk abstains. |
| R8 | Scaffold persists | One request/hypothesis, expiry/resolution, no auto-loop. |
| R9 | Self-report promoted to fact | Explicit `SELF_REPORTED_RETRIEVAL`; separate evidence/evaluation authority. |
| R10 | Builder validates itself | Independent raw occurrence/gold oracle, FP/abstain measures. |
| R11 | Shared resolver hides same error | Corpus niqqud precedence, head regression and disagreement stop. |
| R12 | F2 becomes second learner-state writer | Dedicated tables/projections only; no canonical/F1 columns/writes. |
| R13 | Restore resurrects or rollback drops | Additive migration, erasure replay, disable-only rollback. |
| R14 | Guessed IDs cross users | Principal scope and negatives on every table/action/cache. |
| R15 | Consent/delete cosmetic | Versioned opt-in, immediate block/purge, export/restore proof. |
| R16 | Selector/evaluator spends hidden quota | Local assets only, hard network tripwire, zero budget. |
| R17 | Tutor/self-grade or MNAR lapse | No tutor/model/reviewer writer; independent evaluator; MNAR no-eval. |

## 20. Parallel AA0/AA1 boundary

The already-running AA0/AA1 session may continue independently. F2 implementation must not modify its docs or assume their unapproved results. AA1 may reserve generic advisory vocabulary only; no F2 payload scope, MCP/OAuth runtime, SDK, client/credential or external read is added here. Any file overlap or new runtime dependency is a stop condition and requires owner reconciliation.

## 21. Stop conditions

Stop and return to owner if:

- server migration 041/overlapping F2 work appears;
- AA session touches overlapping production/runtime files;
- B2 cannot select exact public target within fixed bounds without new ingestion/index asset;
- any personal source body, embedding, transcript or LLM expected form becomes necessary;
- evaluator needs reviewer/tutor/provider/reducer/writer access;
- any F2 path changes canonical/F1/consent/identity truth;
- learner event/F1 thread/MNAR is treated as ability/failure;
- delete/revoke/restore cannot prove zero-resurrection;
- external network/provider attempt occurs;
- delayed flow needs background/retry/notification without S4;
- AA2/OAuth/MCP or CP0 live is required;
- exact-owner/default-off gates cannot be maintained;
- S0 limits or mobile/RTL integrity fail.

## 22. Owner execution decisions

### Decision 1 — execution authority

- **A — implement migration/code/tests, scoped commit/push and default-off deploy; no live enablement (recommended).**
- B — code/tests only, no deploy/migration evidence.
- C — enable F2/CP0 or start live evaluator automatically; reject.

### Decision 2 — migration/storage

- **A — dedicated migration 041 and ten tables in §5 (recommended).**
- B — generic artifact table or reuse F1/tasks.
- C — external/vector store.

### Decision 3 — constructs

- **A — exact B1/B2 predicates in §6; `pid:` and public-source bounds (recommended).**
- B — B1 only; insufficient approved slice.
- C — add open writing/misconception model evaluation now.

### Decision 4 — public target selector

- **A — bounded runtime selector over current catalog/vocab/work assets, strict caps/abstain (recommended).**
- B — new generated global target index; expands artifact/publish lifecycle.
- C — personal text search; requires S6.

### Decision 5 — evaluator

- **A — two deterministic non-writing evaluators with structural isolation (recommended).**
- B — reuse canonical reviewer path; authority violation.
- C — real LLM evaluator; separate Option C only.

### Decision 6 — lifecycle/API

- **A — explicit scan + full request/MNAR/dispute/suppress/annul/delete routes in §10 (recommended).**
- B — result-card-only API; insufficient.
- C — automatic mount/background generation.

### Decision 7 — consent/data lifecycle

- **A — per-construct opt-in, bounded retention, F2 export/delete and restore journal (recommended).**
- B — blanket F1/model consent and account-delete-only.
- C — indefinite answer/history retention.

### Decision 8 — UI

- **A — separate Mentor Home Evidence block with full why/uncertainty/MNAR/control UI (recommended).**
- B — hidden settings/debug UI.
- C — new standalone app.

### Decision 9 — planner handoff

- **A — implement disabled preview contract only; no consumer/planner (recommended).**
- B — omit handoff contract; approved vertical incomplete.
- C — build weekly planner/background delivery.

### Decision 10 — evidence

- **A — full §15–17 matrix, 10k load, hard zero-provider tripwire, stable evidence (recommended).**
- B — unit smoke only.
- C — substitute owner/provider live calls for engineering proof.

### Decision 11 — CP0/rollout

- **A — register scenarios, keep CP0/F2 off, default-off deploy, separate owner launch (recommended).**
- B — omit scenario parity.
- C — enable CP0/F2 with deploy.

### Decision 12 — parallel boundaries

- **A — AA0/AA1 docs continue independently; no AA2/S4/S5–S7 expansion (recommended).**
- B — pause AA docs unnecessarily.
- C — consume AA1 draft/start AA2 during F2.

## 23. Recommended owner resolution

Approve **A/A/A/A/A/A/A/A/A/A/A/A**.

This authorizes bounded deterministic Option B engineering, migration 041, full local/mobile/load evidence, scoped publication and default-off deployment. It authorizes no F2/CP0 live enablement, real provider/LLM evaluator, planner/background job, personal material, AA2/OAuth/MCP or public cohort.

## 24. After approval / next return

After execution approval the implementer follows §18 and returns with:

- exact commits/version;
- gate results and stable evidence path;
- migration/default-off production health;
- R1–R17 post-diff findings;
- remaining risks/deferred evidence;
- separate owner-live launch packet.

Without explicit approval of §22, stop at this document.
