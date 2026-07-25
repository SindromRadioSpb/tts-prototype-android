# H2.7 — closure audit evidence

Status: **IN_PROGRESS; G-H2-CLOSURE is not yet PASS.**

Canonical prompt: `prompts/H2_07_OWNER_LIVE_AND_CLOSURE.md`.

Audit source HEAD: `f61c59b3ae6b7bd878e66149a795bfd8a2e636e7`.

## 1. Per-slice precheck

H2.1, H2.2, H2.3, H2.4, H2.5, H2.6 and the additive H2.G1 group-corpus slice are `CLOSED` in
`STATUS.md`. Their canonical evidence directories were read in full. The first G-H2-CLOSURE
checkbox therefore passes; this audit does not reopen a slice.

## 2. Closure checklist

| G-H2-CLOSURE item | Current verdict | Evidence / remaining action |
|---|---|---|
| H2.1–H2.6 closed | PASS | `STATUS.md` and per-slice evidence |
| Schema snapshots | PASS | `SCHEMA_SNAPSHOT.md`: LinguistPro 16→25, nine additions, zero original-schema mutations |
| Consent: ru/en/he plus revoke→typed deny→regrant for every new scope | PENDING OWNER-LIVE | Source/i18n gates prove all cards exist; earlier slice ceremonies prove grants and selected denials, but one consolidated live cycle for every new scope has not been performed |
| Goal-store backup restore | PASS ON COPY | Temp-only migration/backup/restore test retained two goals and did not mutate the live DB |
| Disable each capability without breaking the others | PARTIAL | H2.5/H2.6 ASR disable/re-enable isolation is recorded; local scope/capability denial smokes pass; consolidated live isolation for every new LinguistPro tool remains |
| Prod version/health and each new tool through live Hermes | PARTIAL | Current health/version and 25-tool discovery pass; per-slice live transcripts cover the nine tools, but the prompt's consolidated current manual rerun remains owner-live work |
| Goal-store export/delete | PASS ON COPY | General export contains `weekly_goals`; delete sweep includes the table; other-user row survives; pre-restore backup exists |
| Initial metrics, parallel two-week monitor and costs | PARTIAL; NO LONGER TIME-BLOCKED | Owner amendment 2026-07-24 moves the 14-day window to mandatory parallel monitoring, 2026-07-24—2026-08-06. Initial voice metrics exist; exact proposal-ledger and metered-cost/account snapshot still remain closure evidence |
| STATUS H2 CLOSED | NOT ALLOWED YET | Depends on every row above becoming PASS and owner closure verdict |

## 3. Schema and current live health

- Local schema gates: `npm run smoke:agent-word-morphology` → PASS 72; `npm run
  smoke:agent-access:mcp` → PASS 65, 25 tools, protocol `2025-11-25`.
- Live Hermes on 2026-07-24: LinguistPro connected and discovered 25 tools; local `ivrit_asr`
  remained enabled with exactly one selected tool.
- Host Hermes health: localhost OK, Tailscale OK, ASR runtime/model/inbox ready.
- Production read-only check on 2026-07-24: `/healthz` returned `ok:true`, DB ready, migrations
  ready, disk 77% used and no disk warning. `/api/client-config` returned app `3.11.237`.
- No deploy, cleanup, image deletion, consent mutation or other production mutation was performed
  by this audit.

## 4. Rollback, export and delete evidence

The check ran only against disposable migrated SQLite files. It created two active goals for two
users, exported one user through the general identity export, backed up, deleted that user through
the general delete path, restored the backup to a separate copy and inspected the restored copy.

```json
{"export_weekly_goals":1,"backup_ok":true,"delete_sweep_includes_weekly_goals":true,"deleted_user_rows":0,"other_user_rows":1,"restore_copy_rows":2,"restore_statuses":["ACTIVE","ACTIVE"],"pre_restore_backup":true}
```

The initial same-process restore probe was invalid because `closeDb()` does not reset the module's
`ready` flag, making a second `initDb(copy)` a no-op. The final test used a separate read-only
SQLite descriptor for the restored copy and passed. No product code was changed to mask this test
process behavior.

## 5. Gate rerun, 2026-07-24

| Command | Result |
|---|---|
| `npm run smoke:agent-word-morphology` | PASS 72 |
| `npm run smoke:agent-text-coverage` | PASS 75 |
| `npm run smoke:agent-group-corpus` | PASS 40 |
| `node scripts/premium/agent-w1-family-smoke.js` | PASS 25 |
| `node scripts/premium/nakdan-integration-smoke.js` | PASS 7 |
| `npm run smoke:agent-access:mcp` | PASS 65, 25 tools |
| `npm run smoke:agent-access:oauth` | PASS 24 + restore PASS |
| `npm run smoke:agent-access:production-handlers` | PASS 61 |
| `npm run smoke:agent-access:control-plane` | PASS 54 |
| `npm run smoke:i18n` | PASS 226/226 |
| `npm run test:api-smoke` | PASS on isolated rerun |

The first API run reached `/healthz` but immediately received `DB_NOT_AVAILABLE` from
`/api/library/export`; the isolated rerun passed every endpoint. This is recorded as an unrelated
readiness race: the smoke accepts HTTP 200 health before SQLite is ready. It did not affect the
production health check, where DB and migrations were explicitly ready.

## 6. Metrics currently available

- H2.6 owner voice: 2 sessions; 2 confirmed previews; 1 corrected preview; 205.28 seconds =
  3.421 minutes; ASR correction rate 1/2 = 50%; owner rating 5/5.
- H2.6 owner confirmed POST_ANALYSIS+RETRY and confirmed that ASR differences were not presented as
  learner errors.
- H2.3 has confirmed import, track-word and weekly-goal receipts; H2.4 has a confirmed final
  real-song import plus documented failed-input/pending proposal incidents. A canonical end-window
  ledger count of created/confirmed/rejected proposals has not yet been captured.
- The stable local gates report zero provider calls for H2.1/H2.2/H2.G1/H2.3. H2.5 uses a pinned
  local public model. H2.4 uses on-demand Dicta. No trustworthy account/invoice artifact currently
  establishes the complete actual H2 metered spend, so the audit does **not** invent `$0`.
- Owner amendment 2026-07-24 explicitly moves the two-week H2 observation to parallel monitoring,
  by analogy with H1. The window remains mandatory for 2026-07-24—2026-08-06, but its calendar
  completion no longer blocks closure. Initial ledger/cost evidence and all non-time closure gates
  still apply.

## 7. H3 charter readiness map

Owner decisions Д6-P/Д6-A on 2026-07-24 authorize C1–C5 parallel H3 R&D before G-H2-CLOSURE.
Duration/data-volume/case-count thresholds are recommended parallel maturity targets, not start
gates; early results must say `UNDERPOWERED`. This does not change H2.7 verdicts: its
consent/cost/live-tool evidence remains mandatory and an active H2 stop condition pauses any
affected H3 path. Hard per-action privacy/consent/cost/no-write gates remain independent.

| Charter | Prerequisite state | Readiness |
|---|---|---|
| C1 Hebrew pronunciation scoring | 3.421 min available; ≥60 min recommended parallel target | PLANNED / RUNNABLE #1; UNDERPOWERED until target |
| C2 Realtime Hebrew voice | ≥4 weeks baseline recommended; live cloud call still needs exact cap+consent | PLANNED / RUNNABLE #2 |
| C3 MC-glosses | H2.2 closed; technically runnable, but owner deferred it on 2026-07-25 | DEFERRED / OWNER-BACKLOG; explicit owner resume required |
| C4 Agent sees owner ②-notes | Cases accumulate in parallel; note-read still needs scope/consent/provenance | PLANNED / RUNNABLE #4 |
| C5 Phase-2 exposure weighting | Preliminary offline analysis allowed; ≥8 weeks/≥200 events recommended | PLANNED / RUNNABLE #5; UNDERPOWERED until target |

Д6-A historically authorized all five research charters in parallel, not a production bundle.
Later owner decision Д6-C3-D defers C3 without marking it `NO-GO` or `CLOSED`; do not open its
session until explicit owner resume. Priority and consolidated reporting otherwise retain the
original order; each active charter uses a separate clean session and artifact path.

## 8. Exact remaining closure work

1. Capture the initial W1 created/confirmed/rejected ledger and actual cost-envelope evidence;
   continue all metrics through the parallel window and perform the mandatory day-14 follow-up.
2. In an owner-controlled live ceremony, switch the consent card through ru/en/he and perform
   revoke → typed denial → regrant for each of the eight H2 scopes.
3. Capture the consolidated live capability-isolation and manual-call transcript for all nine new
   LinguistPro tools while verifying unaffected tools remain usable.
4. Recheck production version/health, update this evidence and `STATUS.md`, then request the owner
   verdict for G-H2-CLOSURE. Calendar time is no longer the blocker; until the remaining evidence
   passes, H2.7 remains `IN_PROGRESS` and H2 remains open.

## 9. Hermes profile reload and current-tool check, 2026-07-24

The owner explicitly approved updates to live `MEMORY.md`, `USER.md` and `SOUL.md`, restart of both
containers, manifest reload verification and new-tool checks. Full hashes, backup location and
incidents are recorded in `HERMES_RUNTIME_AUDIT.md`.

- Final new WebUI chat `69d469542242`: 25 tools; `get_word_morphology` and `get_current_goal`
  both `ok:true`; updated restart/new-chat memory rule present in the response.
- Current live read calls: morphology PASS; public coverage PASS; group search/content/coverage
  PASS; current goal read PASS.
- `propose_import_text`, `propose_track_word`, `propose_goal`: visible and callable; validation-only
  calls returned `ARGUMENT_SCHEMA_INVALID`, retryable false, and created no proposal IDs.
- WebUI-owned `ivrit_asr`: exactly one `transcribe_audio`; typed missing-file error; zero raw write.
- No proposal, import, tracked word, goal mutation, transcript retention or raw-audio write occurred.

This advances the consolidated tool check but does not replace the remaining per-scope live
revoke→typed-denial→regrant ceremony or initial production cost/proposal-ledger snapshot.
