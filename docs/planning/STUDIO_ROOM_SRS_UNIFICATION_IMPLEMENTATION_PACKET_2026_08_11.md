# STUDIO–ROOM SRS unification — implementation packet

Date: 2026-08-11

Owner decision: approved implementation; one canonical Reading Room trainer, no alternative Studio trainer.

Source commit: `9fe9be241682a7ef0b08e0d7b070c622bb53c5e6`

Baseline: `APP_VERSION=3.11.352`, `CACHE_VERSION=v3.11.352`

Release target: `APP_VERSION=3.11.353`, `CACHE_VERSION=v3.11.353`

## Before / after

Before, Studio exposed a historical modal backed by the old `srs_cards`/`srs_review_events` surface while Reading Room owned the current cross-text FSRS queue and `review_log` write path. This created two user concepts and a risk of divergent counts and histories.

After, Studio displays the canonical due/in-progress projection and hands the user to Reading Room. Room alone builds and grades the session. The handoff is identifier-only, consumed once, and removed from the URL. Anki export remains independently available.

## Canonical contract and source eligibility

The invariant flow is:

`occurrence → lemma key → source anchor → word_status → getDueWithSource → Room training item → review_log → replay → word_status`.

Ben-Yehuda, Study Songs, and My Texts all materialize through common `texts`/`sentences` storage. Eligibility depends on due schedule/status, not source type. Study Songs are identified by `group_corpus.corpus_id/work_id`, Ben-Yehuda by corpus metadata, and personal material by stable text/material metadata. No title matching, quotas, songs-only scheduler, migration, or backfill was introduced.

## Implemented bounded slices

### 1. Evidence and three-source fixture

- Problem: a visible Study Songs tab did not prove end-to-end SRS eligibility.
- At-risk capability: pedagogical ordering and source continuity across all texts.
- Immutable contract: shared due query, stable source IDs, canonical lemma keys, unchanged FSRS-6.
- Regression test: isolated three-text OPFS fixture checks due retrieval, context resolution, mixed session, log deltas, replay, and source metadata.

### 2. Studio handoff and honest states

- Problem: Studio opened a second obsolete trainer and exposed a separate mental model.
- At-risk capability: current Room training, Back/refresh behavior, private local data, and truthful zero/recovery states.
- Immutable contract: Room is the only queue/session owner; URL carries no text, word, schedule, or review state.
- Regression test: visible CTA routes to `library.html?review=due&from=studio`; Room consumes it once; open/close/refresh write zero grade events; Back returns to Studio.

### 3. Count parity and accessibility

- Problem: Studio needed the same due truth without becoming a second projection.
- At-risk capability: localized mobile/RTL UI, keyboard use, and current Studio tools.
- Immutable contract: both surfaces use `ReaderMorph.dueCounts`; one primary CTA; no architecture vocabulary in product copy.
- Regression test: count equality after a grade, 44 px focusable named CTA, dark visibility, RU/HE 380 px overflow checks, desktop/mobile screenshots.

### 4. Bounded legacy cleanup and Anki continuity

- Problem: every historical `v3SrsTrainerOpen` consumer had to stop opening the modal.
- At-risk capability: `.apkg` export and adjacent Studio tools.
- Immutable contract: no broad inline-code deletion before a consumer sweep; existing Anki export implementation remains unchanged.
- Regression test: all visible entry points and compatibility function route to Room; standalone Anki entry remains visible; Studio UX smoke remains green.

No source-continuity production-code slice was needed: the red/green fixture proved that all three sources already traverse the same `local-db.js` and `reader-morph.js` contracts. Those files remain unchanged.

## Role synthesis

- R2: retained lapses/weakness/due priority and introduced no corpus quotas.
- R4: one mobile-first CTA, localized RU/EN/HE, RTL, focus, tap target, Back, and honest empty states.
- R5: Studio becomes an entry point into one daily review habit rather than a competing surface.
- R11: no source-data migration; Room reading/training and Anki are protected by regression gates.
- R12: one append-only `review_log`, one `word_status` projection, no dual-write.
- R14: the handoff URL contains only `review=due&from=studio`; personal text and learner state remain local.
- R15: deleted/unavailable source follows existing re-anchor/word-only recovery and never silently erases memory.
- R16: local SRS still requires no LLM or cloud call.
- R17: grades, replay, and `evidence_scope` stay deterministic; word-only fallback remains `lexeme` evidence.

## Actual allowlist

- `public/index.html`
- `public/js/library-ui.js`
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js`
- `public/sw.js`
- `package.json`
- `tests/i18n.locale-version.lock.json` (mechanical locale-version/hash gate)
- `scripts/premium/studio-room-srs-smoke.js`
- `docs/research/studio-room-srs-unification/2026-08-11/**`
- `docs/planning/STUDIO_ROOM_SRS_UNIFICATION_IMPLEMENTATION_PACKET_2026_08_11.md`

`public/library.html`, `public/js/reader-morph.js`, `public/db/local-db.js`, and `public/js/fsrs-core.js` were inspected but not modified.

## Stop list preserved

No schema/migration, `review_log` contract, lemma canon, FSRS math, sync/cloud graph, server API, provider default, Studio ingest/media, Room media, corpus body/data, production learner data, master roadmap, `.remember`, `.agents`, or unrelated dirty research/planning file was changed.

## Test matrix

| Gate | Result |
|---|---|
| `npm run smoke:studio-room-srs` | PASS 35/35 |
| `npm run smoke:fsrs` | PASS 30/30 |
| `npm run smoke:memory-canon` | PASS 79/79 |
| `npm run smoke:reader-morph` | PASS |
| `npm run smoke:reader-parity` | PASS |
| `npm run smoke:room` | PASS 14/14 |
| `npm run smoke:room-study` | PASS |
| `npm run smoke:studio-morph` | PASS |
| `npm run smoke:studio-ux-maturity` | PASS 9/9 unit + 92/92 browser |
| `npm run smoke:i18n` | PASS 233/233 |
| `npm run smoke:group-song-corpus` | PASS |
| `npm run smoke:anki-apkg-client` | PASS 28/28 |
| `npm run smoke:canon-version` | PASS 18/18 |
| `npm run test:api-smoke` | PASS; `/api/client-config` version equality included |
| service-worker / app-version equality | `3.11.353` / `v3.11.353` |
| `git diff --check` | PASS |

Red phase before implementation: Studio route, one-shot deep-link, due-count parity, independent Anki visibility, locale surface, and legacy-modal route assertions failed. The same gate is now green. The pre-existing common DB fixture path for all three sources was green during recon, which is why no DB/morph patch was justified.

## Rollback

Revert the single allowlisted implementation commit and redeploy its predecessor. No data rollback or migration is required because the release changes navigation/presentation only and preserves both `review_log` and `word_status`. If only deep-link launch regresses, removing `review=due&from=studio` from the Studio target safely degrades to opening Room without changing learner state.

## Production evidence

Pre-deploy baseline was revision `9fe9be24`, app/cache `3.11.352`, health ready, and the owner profile showed the canonical Room due CTA and a `1/12` session.

Deployed production revision: `669152eeb7d6d1084c180fffdbfff300cd0ef469`.

- `/api/client-config`, served `APP_VERSION`, and controlled service-worker cache all agree on `3.11.353` / `v3.11.353`.
- `/healthz` reports DB ready and migrations ready.
- Owner profile, read-only: Studio showed `К повторению: 220`, `В работе: 287`; the same Room queue opened at `1 / 12`.
- Room consumed and removed `review=due&from=studio`; close and refresh did not reopen the sheet; Back returned to Studio.
- No grade or manual-status control was used. Due remained `220` before and after the open/close/refresh/Back sequence. The browser boundary intentionally did not export private `review_log`; exact open/close delta `0`, grade delta `1`, duplicate delta `0`, and replay equality are fixture evidence.
- Anki remained visible in Studio.
- Owner-profile diagnostics contained no error-level messages attributable to the release; existing `MATERIAL_REVISION_REQUIRED` lazy-transliteration messages were debug-level and outside this slice.
- Fresh production 380 px RU and HE/RTL profiles rendered the truthful no-schedule state, localized correctly, had no horizontal overflow, and exposed a named CTA above the 44 px minimum. The controlled second page was served by `/sw.js` with only `v3.11.353` app caches.
- One mobile probe during the rollout window observed transient static-asset 502 responses. Two consecutive HE/RTL rechecks were clean with zero unexpected HTTP or page errors.
- Production disk was 94% used and health reported `disk_warn=true`. No cleanup was performed because this release completed successfully and cleanup was outside the bounded scope.

## Remaining owner-live iPhone checks

After production smoke, the owner must verify on iPhone: Studio/Room count equality; immediate Room session launch; no reopening after close; expected Back; real eligible words from Study Songs, My Texts, and Ben-Yehuda; one real answer syncing normally to another device; no overflow or RTL defect. Automation/emulation is not owner-live PASS.
