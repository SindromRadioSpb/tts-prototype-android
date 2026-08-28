# PHYSICS-YEAR1-R12 — production evidence

Дата: 2026-08-28

Authority: `OWNER_APPROVAL_PHYSICS_YEAR1_R12_2026_08_28`

Release: `3.11.444`

Content commit: `68f05e1b964dc5e6adaa66714ca970492d0084cf`

Corpus: `physics-year1-problems`

Edition: `ed_c345975244ff7bd33d86fcb9`, №2

Manifest SHA-256: `6926876557b93e984180a27a6cda01076b64a4649ff7287d4edd7ab35cbdde1b`

## Outcome

The reviewed learning layer is live for the learner in all 74 immutable Physics task cards. The same 74 hash-verified sources, agent scope, migration and append-only agent-rights facts are deployed. The global Agent Access MCP transport remains default-off under its separate all-corpora rollout gate, so no Hermes owner-live acceptance is claimed in this release.

Evidence classes used below:

- `PRODUCTION_LIVE_READ_ONLY`: anonymous production HTTP/browser observation.
- `PRODUCTION_CONTROLLED_WRITE`: allowlisted production configuration or append-only publication-rights mutation under owner authority.
- `PRODUCTION_INFRA`: container, backup, migration and health evidence.
- `LOCAL_TEST`: repository test against fixtures or temporary DB.
- `NOT_RUN`: not claimed.

## Release and health

- Scoped content commit `68f05e1b` was pushed to `origin/main`.
- Coolify deployed exact image `glmw0wjd6nm70fntxgjy6fkp:68f05e1b964dc5e6adaa66714ca970492d0084cf`.
- Migration 066 applied; `/healthz` reported `ok=true`, `db.ready=true`, `migrations.ready=true`.
- Enabling the public flag required a rolling redeploy of the same commit. One transient `502` occurred during container handover and was not accepted as success.
- After the old container was removed, five consecutive probes observed one exact target container, `window.APP_VERSION="3.11.444"`, healthy DB and ready migrations.
- `PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ=1` is present in the active container.
- Evidence: `PRODUCTION_INFRA`.

## Backup, rehearsal and production DB mutation

- Pre-mutation backup: `/opt/backups/linguistpro/app-data-20260828-064152.tar.gz`.
- Archive bytes: `1056896562`; SQLite snapshot bytes: `491057152`.
- SQLite SHA-256: `8facbb84f179dac60d05fc4d4055270e83289017f2a81fe2ee50657a0cb5f71e`.
- Backup method: SQLite online backup API. Restore/read verification completed before mutation.
- The backup temporarily filled the root filesystem. No backup or volume was deleted. Bounded `docker builder prune -f` runs removed only reclaimable build cache before and after the flag redeploy; final free space was 3.2 GiB (92% used), with only 42.68 MiB build cache reported reclaimable.
- Rehearsal on a restored temporary copy: dry-run `74 planned / 0 applied`; apply `74/74`; `PRAGMA integrity_check=ok`; rights read-back `74/74`; temporary directory removed.
- Production dry-run: 74 manifest items and 74 support files verified.
- Production apply used idempotency key `physics-r12-prod-20260828`: 74 append-only `DERIVATIVE_TEXT=true` facts.
- Independent production read-back: `PRAGMA integrity_check=ok`; latest allowed derivative rights `74/74`.
- Protected truth counts were identical before and after the mutation: `review_log=7459`, `learner_events=80`.
- Evidence: `PRODUCTION_CONTROLLED_WRITE`, `PRODUCTION_INFRA`.

## Anonymous production API

Command: `node scripts/premium/physics-learning-support-production-smoke.js`

Result:

```json
{"ok":true,"origin":"https://linguistpro.kolosei.com","version":"3.11.444","api_tasks":74,"db_ready":true,"migrations_ready":true,"browser_checks":["answer-first","full-walkthrough","unambiguous-math","mobile-no-overflow","he-rtl"],"screenshots":5,"authenticated":false,"production_writes":false}
```

For every manifest item the smoke independently checked:

- HTTP 200, JSON, `nosniff`, no `Set-Cookie`, immutable public cache;
- exact corpus, edition id/number/manifest, edition item, work, snapshot and source-image hashes;
- exact task number and derivative file SHA-256/ETag;
- `OWNER_APPROVED_FOR_PRODUCTION`, no open mismatch;
- public-read and agent-derivative rights in the immutable payload;
- non-empty beginner roadmap, exam laws/calculation, answer and agent guidance.

The first item also returned 304 for exact `If-None-Match`; an unknown work returned 404 without a cookie. Evidence: `PRODUCTION_LIVE_READ_ONLY`.

## Production browser acceptance

The smoke used a fresh anonymous Playwright context with service workers blocked for stale-cache isolation. The first load intentionally included full cold OPFS/catalog initialization. It verified:

- direct public deep-link opens task 1.1 in Reader;
- `Проверить ответ` reveals the exact reviewed answer below the task table;
- `Понять и решить` opens the premium beginner bridge and exam solution;
- exam math contains semantic `<sub>` and visible multiplication operators, with no raw `*` shown;
- 380 px has no horizontal document overflow;
- Hebrew chrome renders RTL and the modal remains within the viewport.

Production screenshots:

- `production/screenshots/physics-learning-card-answer-desktop-ru.png`
- `production/screenshots/physics-learning-solution-desktop-ru.png`
- `production/screenshots/physics-learning-exam-desktop-ru.png`
- `production/screenshots/physics-learning-solution-380-ru.png`
- `production/screenshots/physics-learning-solution-380-he-rtl.png`

All five screenshots were visually inspected. This is browser/viewport evidence, not physical-device or assistive-technology evidence. Evidence: `PRODUCTION_LIVE_READ_ONLY`.

## Agent boundary

Deployed and production-backed:

- OAuth scope `reading.publication.derivative.read` and consent version `agent-access-consent-v4`;
- MCP tool implementation `read_published_learning_support`;
- migration 066 and exact 74-item append-only rights read-back;
- shared hash-verified task source used by both UI and MCP; no second solution store;
- old grants do not acquire the new scope silently.

Active production flags observed after deployment:

- `AGENT_ACCESS_UI_ENABLED=1`;
- `AGENT_ACCESS_OAUTH_ENABLED=1`;
- `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=OFF`;
- `AGENT_ACCESS_MCP_ENABLED=OFF`.

Turning on the last two flags would expose the entire 31-tool Agent Access surface and is explicitly governed by the owner-only/all-corpora rollout gates in `LINGUISTPRO_ALL_CORPORA_AGENT_ACCESS_MCP_DECISION_PACKET_2026_08_26.md`. It is not a Physics-only flag and was therefore not expanded by this release.

Status: agent content/data path is `PRODUCTION_DATA_READY`; network invocation is `NOT_RUN / DEFAULT_OFF`; Hermes owner-live is `NOT_RUN`. A future acceptance must use a fresh ordinary Hermes connection, explicit new-scope consent and an actual `read_published_learning_support` invocation. Inspector/OpenAI/Claude readiness must not be inferred from that result.

## Test accounting

- Target R12 tests: 41/41.
- i18n: 233/233.
- Agent domain: 56 checks / 31 capabilities.
- Agent MCP: 76 checks / 31 tools.
- Agent production handlers: 61 checks.
- Consent browser: 7 checks across RU/EN/HE/RTL/keyboard/380.
- Isolated R12 HTTP/browser/rights smoke: 12 checks.
- Full `npm test`: 1147/1160. The 13 failures are pre-existing historical UI/version assertions pinned to removed surfaces or `3.11.404`; they are unrelated to the allowlisted R12 paths and were not rewritten during this release.

## Rollback

- Learner UI stop: set `PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ=0` and redeploy the same known-good application revision.
- Agent data stop: append `DERIVATIVE_TEXT=false` for the same 74 edition items; never delete historical facts.
- Migration 066 down must refuse while any grant still contains the new scope.
- Do not mutate edition №2, content shards or existing PDF/resource revisions during rollback.

## Anonymous-browser hotfix acceptance

Final learner release: `3.11.446`

Hotfix commits:

- `c53771fd514a491916a6f4e56dab47e3e8fc4a7b` — revalidate a pre-rollout negative HTTP cache entry;
- `1342cc855ca47c783057ff5ed765bcbb2ecfd742` — explicitly reveal the populated inline answer and advance the shell/module cache cohort.

The defect was reproduced in the owner's existing Kapture Chrome tab before mutation. The failed `learning-support` request was an HTTP-cache hit: status `404`, `fromCache=true`, response date `2026-08-28 06:55:28 UTC`, body `PUBLIC_MATERIAL_NOT_FOUND`. The current public API already returned the reviewed derivative, but `library-ui.js` requested the dynamic endpoint with `cache: 'force-cache'`, allowing the browser to reuse the pre-flag negative response. The endpoint now revalidates with `cache: 'no-cache'`; the feature-off 404 is `Cache-Control: no-store`.

The first deployed hotfix (`3.11.445`) removed the unavailable toast and made the full walkthrough open. A fresh production smoke then caught a second acceptance failure: the answer text was populated but the inline container retained the `hidden` attribute. This was not accepted as closure. Release `3.11.446` removes that attribute explicitly, with a source regression assertion and the existing visible-browser assertion retained.

Final production evidence:

- exact single active image `glmw0wjd6nm70fntxgjy6fkp:1342cc855ca47c783057ff5ed765bcbb2ecfd742`;
- five consecutive probes: `version=3.11.446`, `ok=true`, `db.ready=true`, `migrations.ready=true`;
- fresh anonymous production smoke: 74/74 API tasks, `answer-first`, `full-walkthrough`, unambiguous math, 380 px no-overflow and Hebrew RTL; no authentication and no production writes;
- the same Kapture tab that reproduced the defect advanced from its coherent `3.11.445` service-worker shell through the product's guarded Update action to `3.11.446` without clearing profile, OPFS or browser storage;
- in that same tab, `Проверить ответ` exposed a visible, non-empty answer (`a = 0,249530 м/с²; v_C = 26,8762 м/с`) with no `hidden` attribute, and `Понять и решить` opened a visible full-screen walkthrough containing `Дано`, `Найти`, SI conversion, base laws, derived formulas, sequential calculation, result check and final answer.

Hotfix test accounting:

- targeted repository tests: 33/33;
- i18n: 233/233;
- isolated rights/API/browser smoke: 13 checks, 74 items, temporary DB only;
- final anonymous production smoke:

```json
{"ok":true,"origin":"https://linguistpro.kolosei.com","version":"3.11.446","api_tasks":74,"db_ready":true,"migrations_ready":true,"browser_checks":["answer-first","full-walkthrough","unambiguous-math","mobile-no-overflow","he-rtl"],"screenshots":5,"authenticated":false,"production_writes":false}
```

During deployment the root filesystem reached 100% and Coolify Redis temporarily refused writes because it could not persist an RDB snapshot. Only unused Docker images and reclaimable build cache were removed; active containers, volumes, the production DB and the verified backup were not touched. Redis `BGSAVE` returned `ok`. Final disk state was approximately 13 GiB free (65% used), with 9/9 images active and zero build cache.

Evidence: `PRODUCTION_LIVE_READ_ONLY`, `PRODUCTION_INFRA`, `LOCAL_TEST`.

## Owner-only Hermes MCP acceptance — 2026-08-29

Status: `OWNER_REPORTED_PASS` for the owner's Hermes profile only.

The owner explicitly approved enabling the already-deployed full Agent Access surface. Production now has `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1` and `AGENT_ACCESS_MCP_ENABLED=1`; this is the 31-tool owner-only surface, not a Physics-only or public/community entitlement. Five consecutive post-deploy probes observed `window.APP_VERSION="3.11.447"`, `ok=true`, `db.ready=true` and `migrations.ready=true`. OAuth metadata exposed exactly 27 supported scopes including `reading.publication.derivative.read`.

The first consent attempt exposed a real boundary defect before any grant was activated: a production-form connection id plus `reading.publication.derivative.read` produced an 81-character append-only consent key, while `oauthContracts.consentKey()` rejected keys longer than 80. Commit `c2ae0fd6fb84f25803585939f49dbc314b7aad26` raised the aligned contract/storage bound to 160, added an exact 81-character end-to-end consent regression, bumped the release to `3.11.447`, and passed consent, OAuth lifecycle/bridge and 11/11 publication-agent tests. Coolify deployment `g2dzoi36w60epsx9i15awcib` completed successfully before re-consent.

Fresh owner consent then completed with:

- `TOKEN_STORED`, 27 scopes;
- required publication scopes present;
- required derivative scope present;
- refresh token present (token values were never printed);
- token file mode `0600` under the Hermes runtime owner.

Hermes verification after restarting `hermes-agent` first and `hermes-webui` second:

- `hermes mcp test linguistpro`: connected, 31 tools discovered;
- publication diagnostic: 31 tools discovered, five publication tools callable, Physics edition №2 found with 74 items and exact task 1.1 anchor `ei_8d027f6f81e573ff98a6ff1d`;
- WebUI health returned healthy before the owner-live run.

Final acceptance used a completely new ordinary Hermes WebUI conversation, not a restored chat and not a CLI/SDK substitute:

- session: `aedb86a4562d`;
- run: `63e0707a7d574fce943e256255bbe7b9`;
- session metadata: `is_cli_session=false`, title `Проверка задачи 1.1: ускорение и скорость`;
- exactly one tool call in the session;
- journal sequence 19: `tool.started`, name `mcp__linguistpro__read_published_learning_support`;
- journal sequence 21: `tool.completed`, the same tool and `is_error=false`;
- exact request anchors: corpus `physics-year1-problems`, edition `ed_c345975244ff7bd33d86fcb9`, item `ei_8d027f6f81e573ff98a6ff1d`;
- Hermes grounded its response in the reviewed task source and returned the verified task 1.1 results.

This closes only the owner's Hermes path. It does not establish MCP Inspector, OpenAI, Claude, another user profile, or community readiness. No learner/review/private/group truth was written by the acceptance.
