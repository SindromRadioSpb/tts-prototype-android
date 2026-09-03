# Room Trainer maturity program — design spec

Date: 2026-09-02
Baseline runtime: `3.11.456`
Status: **RELEASE BOUNDARY REACHED** — T1–T4 SHIPPED and prod-verified (3.11.457 → 3.11.460). T5–T6 remain as the maturity tail.
Predecessor canon: `docs/planning/ROOM_TRAINING_PREMIUM_RELEASE_IMPLEMENTATION_PACKET_2026_08_11.md`
Related canon: `docs/planning/RETENTION_PROGRAM_RECON_2026_07_02.md`, `docs/planning/ROOM_DUE_CONTINUITY_2026_07_11.md`

| Wave | Status | Runtime | Evidence |
|---|---|---|---|
| T1 serving order | SHIPPED, prod-verified | `3.11.457` | `docs/superpowers/plans/2026-09-02-room-trainer-t1-serving-order.md`, `docs/research/room-trainer-maturity/2026-09-02/` |
| T2 context bank + scope | SHIPPED, prod-verified | `3.11.458` | `docs/superpowers/plans/2026-09-02-room-trainer-t2-context-bank-and-scope.md`, migration 050 |
| T3 Anki wrapper | SHIPPED, prod-verified | `3.11.459` | `docs/superpowers/plans/2026-09-02-room-trainer-t3-anki-wrapper.md` |
| T4 retention analytics | SHIPPED, prod-verified | `3.11.460` | `docs/superpowers/plans/2026-09-03-room-trainer-t4-retention-analytics.md` |
| T5 FSRS optimizer | after the release | — | §9 |
| T6 per-word channel | after the release | — | §9 |

T1 measured result (20 simulated days, 208-word backlog, size-matched to the old 12/session so the
ordering change is not credited with the session-size change): unique lemmas reached 36 → 137,
coverage 17.3% → 65.9%, starvation 87% → 38%. With the shipped defaults: 184 unique, 88.5%, 14%.

T2 measured result: a word banked in two sources returns `wc:by:1, wc:song:1, wc:by:1, wc:song:1`
across consecutive reviews — the SOURCE TEXT alternates, not merely the sentence id. Production
verified on `3.11.458`: schema version 50, `word_context` present, service worker activated.

T3 measured result, verified on the SERVED production build rather than a local file: twenty
words with identical histories all return on day 57 unfuzzed; with fuzz they spread across 50–65
with twelve distinct dates. The two-epoch contract holds live — a row carrying no recorded fuzz
replays to the due it already has, so switching fuzz on rescheduled nothing.

T4 measured result, verified on the SERVED production build: an overdue word lands on forecast
day 0 rather than falling outside the horizon; a skip is held separate from both sides of
retention; an empty bucket reports null rather than 0%; and the report's load arithmetic agrees
with the scheduler's own while being re-derived independently.

On seeded history the report reads recognition 92% against unsupported production 25% — the first
consumption of `meta.evidence_scope`, written on every grade event since 2026-08-11 and never
read until now, and the honest answer to "do I know this word or do I merely recognise it" that
the scaffolding contract deliberately left open.

**Owner step for T3 — DONE 2026-09-03** (`{ok: true, keys: 5464, recomputed: 470, removed: 0}`): run `POST /api/learner/projections/rebuild` from an
authenticated session. `ENGINE_VERSION` moved to `fsrs6-core-v3` and `db/learnerGraphRepo.js:188`
skips projection rows stamped with another engine, so the mentor's coverage view under-reports
until they are re-stamped. The rebuild moves no due dates.

Operational note: releasing T1 exposed six version stamps where the plan knew of three, and the
resulting service-worker breakage plus a full disk are recorded in
`docs/planning/PROD_INCIDENT_SW_INTEGRITY_AND_DISK_2026_09_02.md`. Three of the six are now gated.

Second operational finding (2026-09-02, during T3): **every commit triggers a full ~1.25 GB image
build, including documentation-only ones.** Production was observed running a docs-only commit,
and that is what drove the disk from 79% to 92% within an hour. A path filter on the deploy
webhook would stop it; that is an infrastructure change for the owner, not a code one.

Goal: bring the Reading Room trainer (`🎯 Тренировка` / `Повторение`) to a mature premium
state — an Anki-grade scheduler wrapper, corpus-wide coverage, explicit scoping, and varied
sentence contexts per word.

---

## 1. Grounded diagnosis

Every claim below was read out of the live source at baseline `3.11.456`.

### 1.1 The queue serves the same words forever — CONFIRMED

| Step | Location | Behaviour |
|---|---|---|
| due fetch | `public/db/local-db.js:3193` `getDueWithSource` | `ORDER BY w.srs_lapses DESC, w.srs_due ASC` |
| build | `public/js/library-ui.js:2961` `_buildDueSourcedItems` | `if (items.length >= TRAIN_N * 2) break;` — a hard prefix cut at 24 |
| rank | `public/js/library-ui.js:2806` `startDueReview` | `rankByWeakness(items).slice(0, TRAIN_N)` — sorts by `lapses` again |
| session size | `public/js/library-ui.js:2648` | `const TRAIN_N = 12` — fixed |

Selection is a total order on `srs_lapses`, truncated to a 24-row prefix, with no randomisation,
no per-day variation, and no "already answered today" suppression. With the owner's recorded
backlog (`К повторению: 208`, `В работе: 290` — predecessor packet §9) the tail of the queue is
unreachable by construction. A word with a high lapse count is pinned to the top permanently.

`rankByWeakness` (`public/js/reader-morph.js:2424`) is a stable sort on `lapses` only — it was
designed as a tie-break refinement but is applied as the primary key.

### 1.2 One word is trained in exactly one sentence — CONFIRMED for the main path

Open-text mode already rotates: `_trainBuildCloze` (`public/js/library-ui.js:3120`) collects up to
8 occurrences from the currently open text and serves `cands[reps % cands.length]`.

The cross-text `Повторение` path does not rotate at all. `word_status.srs_*` stores a single
anchor (`srs_text_key`, `srs_sentence_id`, `srs_order_index`, `srs_surface`, migration
`060_word_status_srs_source`) written with `COALESCE(...)` in `commitReviewAttempt`
(`public/db/local-db.js:3384`) and `updateSrsSource` (`:3689`). A live anchor is therefore never
replaced; a new sentence is chosen only when the anchor is proven dead and the R2 heal ladder runs.

Consequence (R2, encoding specificity): repeated success measures sentence memory, not word
knowledge. The defect is already named in the code — the rotation comment at
`public/js/library-ui.js:3139` cites `recon §6.5` — but the fix was applied only to the open-text
path.

### 1.3 Corpus coverage — the owner's assumption was wrong, the real gap is elsewhere

The queue is genuinely source-neutral. Every readable surface (Ben-Yehuda `Корпус`, Study Songs,
public corpora, group corpora, `Мои тексты`) is imported into the local OPFS store via
`localDb.importBundle(bundle, { mode: 'skip' })` before the reader opens it
(`public/js/library-ui.js:7688`), so its sentences live in the same `sentences` table and its words
enter the same `word_status` projection, the same FSRS state and the same `review_log`.

Two real limits remain:

1. only words the learner has actually touched carry `srs_due` and can be served — an opened but
   untouched work contributes nothing;
2. there is no way to restrict or direct a session to a text, a group of texts or a corpus.

### 1.4 Anki parity — the core is honest, the wrapper is missing

`public/js/fsrs-core.js` is a faithful FSRS-6 transcription of `ts-fsrs@5.4.1`, gated byte-exact by
`smoke:fsrs` (30/30). What is absent is everything Anki layers around the algorithm:

| Anki capability | Room today |
|---|---|
| interval fuzz | disabled (`enable_fuzz=false`, header `fsrs-core.js:8`) |
| learning / relearning steps | none (`learning_steps=[]`); only `Again → due = now` plus one in-session reinforcement pass |
| new/day and reviews/day limits | none |
| display order options | none — hard `lapses DESC` |
| bury siblings | none |
| configurable session size | none — `TRAIN_N = 12` |
| leech tag + suspend | partial: at `LEECH_LAPSES = 4` the UI offers `отметить ignore?` and nothing else |
| desired retention / weight optimizer | `REQUEST_RETENTION = 0.9` and `DEFAULT_W` are constants |

### 1.5 Four further defects found during this review

**D-A — cross-text distractors are drawn from the session itself.**
`startDueReview` calls `_launchTrainSession(ranked, { cross: true })`
(`public/js/library-ui.js:2856`) with no `pool`; the launcher falls back to
`pool: opts.pool || items` (`:2775`). In cross-text mode the multiple-choice distractor bank is
therefore the twelve session words. Combined with §1.1 the learner sees the same twelve words and
the same twelve distractors, which trains recognition of the option set rather than of the word.
FSRS records those as genuine successes.

**D-B — the trainer cannot keep pace with its own queue.**
`TRAIN_N = 12` is not derived from any load model and conflicts with
`STREAK_GOAL_CAP = 10` (`public/js/reader-morph.js:2438`). With ~290 scheduled words in progress the
inbound review flow exceeds 12/day for any plausible mean interval, so the backlog is required to
grow. The product never states this.

**D-C — known-word refresh exists only in the open-text path.**
`buildTrainSession` interleaves ~15% `known` words (`public/js/library-ui.js:2669`). `startDueReview`
has no equivalent, so in the primary mode mature words are never refreshed.

**D-D — there is no instrument.**
No report of any kind is computed over `review_log`. The claim "the same words keep coming back"
cannot currently be confirmed or refuted with data, and neither can its fix.

---

## 2. Invariants this program does not touch

1. `review_log` is the append-only event truth and the synchronised surface; `word_status` is a
   disposable projection; `replay(review_log) == stored state` must hold after every accepted answer.
2. One memory per canonical lemma key (`public/js/lemma-canon.js`). **A scope is a serving filter and
   never forks a schedule.** No feature in this program may create a second FSRS state for a word.
3. Every served sentence passes the canonical-keyer identity gate before display. A homograph is
   never substituted; an unassemblable item is honestly skipped, never fabricated.
4. Determinism: no `Math.random()` anywhere in selection or scheduling.
5. Any new UI string lands in all three locales (`public/i18n/locales/{ru,en,he}.js`) with a service
   worker bump and `APP_VERSION` / `CACHE_VERSION` / locale-lock equality.
6. Derived is not asserted: the context bank is a device-local rebuildable cache, never synchronised,
   never an event.
7. The Room remains the single trainer. Studio only displays counts and deep-links
   (`public/index.html:32134` `refreshStudioReviewStatus`, `v3OpenRoomReview`).
8. **The sentence translation and the sentence audio are STRUCTURAL, not transitional.** For any
   target that is not the citation form, they are the only channel carrying *which* form is
   required: the prompt names the lemma while the gap wants the surface token, article and
   suffixes included (`ROOM_TRAINER_FORM_CONTRACT_ASSESSMENT_2026_09_03.md` §3, P1). The
   predecessor packet's framing of them as scaffolds kept "for the current learner cohort" is
   superseded — they may not be withdrawn as legacy. Owner decision, 2026-09-03.

   Two consequences a later wave must not undo. An item with an inflected target and neither a
   translation nor audio is unanswerable by construction, not merely hard. And P2 remains open by
   decision: the `read` typed grader accepts the citation form for any inflected slot, so
   **T4's «Воспроизведение без опор» row reads as an upper bound, not a measurement** —
   tightening it before the prompt names the required form would make `read` as unanswerable as
   `dictate`.

---

## 3. Owner decisions recorded

| Decision | Choice |
|---|---|
| scoping model | session filter on the launch screen, not saved decks |
| context source | context bank harvested from texts already opened on this device |
| scheduler scope | serving order + anti-repeat, daily limits + session size, failure ladder, leech policy + siblings |
| maturity tail | retention analytics, FSRS optimizer over own logs, per-word channel selection |
| fuzz | implemented inside `fsrs-core.js` as an opt-in flag, default off |
| learning steps | in-session spaced ladder, **not** persisted Anki steps |
| release boundary | T1–T4 is the release; T5–T6 follow |
| word due with no context inside the selected scope | excluded from that scope, stated honestly |
| leech action | auto-pause plus an explicit repair path |

---

## 4. Wave decomposition

| Wave | Delivers | Fixes | Schema | Memory risk |
|---|---|---|---|---|
| T1 | serving order, limits, session size, distractor pool, audit harness | §1.1, D-A, D-B, D-C, D-D | none | none |
| T2 | context bank + scope filter | §1.2, §1.3 | one table | none (additive) |
| T3 | fuzz, failure ladder, leech policy, sibling burying | §1.4 | none | medium |
| T4 | retention analytics | D-B, D-D | none | none |
| T5 | FSRS optimizer over own logs | §1.4 | none | by decision |
| T6 | per-word channel by weakest evidence | §1.4 | none | low |

This document is the **program** design. Each wave gets its own implementation plan, its own red-to-
green cycle and its own release; no wave begins before the previous one is live and measured.

Ordering rationale: T1 changes only which words are selected and touches nothing that writes memory,
so it is fully reversible by reverting the revision. T2 is additive — with an empty bank the runtime
behaves exactly as today. T3 is the only wave that changes scheduling semantics and therefore ships
after T1 and T2 are live and measured. T4 is the user-facing instrument; its pure core is written in
T1 as a headless audit so that T1 itself is provable.

---

## 5. T1 — serving order, limits and honesty

### 5.1 Selection pipeline

Replaces the `lapses` total order in `startDueReview` / `_buildDueSourcedItems`.

```
1. Candidates: ALL due rows. The 24-item prefix cut is removed; assembly becomes lazy
   (build until the session is full or the candidate list is exhausted), not a prefix slice.
2. Exclude words already answered today — folded from review_log over the local day.
3. Bucket each candidate (first match wins, in this order):
     learning  srs.lapses > 0 AND the most recent non-annulled grade for the item was 1
     overdue   relativeOverdueness = elapsedDays / max(intervalDays, 1) >= 1
     known     effective status 'known' (statesMap in open-text mode, row status
               cross-text)             (closes D-C, capped at ~15% as buildTrainSession
                                        already does for the open-text path)
     new       srs.reps == 0
4. Order WITHIN a bucket by a deterministic permutation keyed on
     hash(lemmaKey + localDayString)
   — stable for the whole day, different tomorrow, no Math.random.
5. Weakness (lapses) becomes a BOUNDED quota (default 25% of the session), not a total order.
6. Compose against the daily limits, then cut to the session size.
```

Step 4 is the core of the fix. It restores variety without violating invariant §2.4: a session is
reproducible within a day (a refresh returns the same session) and different the next day.

`rankByWeakness` keeps its current signature and gate but is demoted to filling the weakness quota;
its existing tests stay valid.

### 5.2 Daily limits without a migration

`reviews/day` and `new/day` are counted by folding `review_log` over the local day: rows with
`kind IN ('review','skip')` and `reviewed_at >= <local midnight, ISO>`, classified as *new* when the
item has no earlier non-annulled `review` row and as *review* otherwise. Annulled rows are excluded
through the existing `FsrsCore.withoutAnnulled`.

No column and no migration. The count is automatically correct after a sync from another device,
which a local counter column could not guarantee.

Defaults: `reviews/day = 60`, `new/day = 10`, `session size = 20`. All three are adjustable on the
launch screen and persisted in `localStorage` alongside `room.trainChannel`
(`public/js/library-ui.js:1835`). `TRAIN_N` becomes the default value of a setting, not a constant.

`STREAK_GOAL_CAP` (`public/js/reader-morph.js:2438`, currently the constant `10`) is the second half
of D-B: a fixed cap contradicts a configurable session. The daily goal becomes
`min(configured reviews/day, available)`, keeping the existing honest rest-credit rule for
`available === 0`. `streakView` stays a pure fold and its gate stays valid; only the cap source
changes from a constant to the configured limit.

### 5.3 Distractor pool (D-A)

`_launchTrainSession` must receive an explicit distractor pool in cross-text mode. The pool is built
from resolved words outside the session — the same `collectReviewItems` shape, drawn from the
learner's scheduled vocabulary rather than from the twelve served items. When no wider pool can be
assembled the existing `buildMcSlotOptions` paradigm bank remains the source and the item honestly
falls back to a non-MC tier rather than reusing session words.

### 5.4 Honest load arithmetic (D-B)

The launch screen states, from the T1 audit core: due now, how many will be served today under the
current limits, and — when the inbound flow exceeds the limit — the daily review count required for
the queue to stop growing. Presented as a fact, not a nag.

### 5.5 Measurement (D-D)

`scripts/premium/train-queue-audit.js` — headless, reads a real profile export or a synthetic
schedule, simulates N consecutive daily sessions and reports:

- unique lemmas served over 20 sessions (before/after);
- repeat rate of the top-12 across consecutive days;
- backlog trajectory under the configured limits;
- distractor reuse rate;
- bucket composition per session.

This is the acceptance evidence for T1 and the pure core that T4 renders.

### 5.6 T1 gates

- new `smoke:train-queue` — deterministic selection matrix: day-permutation stability within a day
  and change across days, weakness quota bound, answered-today suppression, limit arithmetic, bucket
  composition, empty-pool honesty, and absence of `Math.random` in the module;
- a `train-queue-audit` run recorded under `docs/research/room-trainer-maturity/2026-09-02/`;
- unchanged and green: `smoke:room-training-premium`, `smoke:studio-room-srs`, `smoke:fsrs`,
  `smoke:memory-canon`, `smoke:grade-policy`, `smoke:reader-morph`, `smoke:room-study`,
  `smoke:i18n`, `smoke:canon-version`.

---

## 6. T2 — context bank and scope

### 6.1 Schema

One migration. The next label must equal the real array index in `public/db/migrations.js` — the
existing comment labels have drifted (`049` and `061` each appear twice), so the index is computed at
implementation time, not copied from the last comment.

```sql
-- word_context — DEVICE-LOCAL DERIVED cache. Never synchronised, never an event,
-- rebuildable from the local texts/sentences tables at any time.
CREATE TABLE IF NOT EXISTS word_context (
  lemma_key     TEXT NOT NULL,
  text_key      TEXT NOT NULL,
  order_index   INTEGER NOT NULL,
  sentence_id   TEXT,
  surface       TEXT NOT NULL,
  source_class  TEXT NOT NULL CHECK(source_class IN ('mytext','byehuda','public','group')),
  corpus_id     TEXT,
  keyer_version TEXT NOT NULL,
  verified_at   TEXT NOT NULL,
  PRIMARY KEY (lemma_key, text_key, order_index)
);
CREATE INDEX IF NOT EXISTS ix_word_context_lemma ON word_context(lemma_key, source_class);
CREATE INDEX IF NOT EXISTS ix_word_context_scope ON word_context(source_class, corpus_id, lemma_key);
```

`surface` is the verified inflected form **in that sentence**, so rotation can re-cloze without
re-resolving. `keyer_version` lets a canonical-keyer bump invalidate the bank wholesale; because the
bank is derived, invalidation is a delete, never a data loss.

### 6.2 Single source classifier

One shared SQL expression, `_sourceClassSql()` in `public/db/local-db.js`, derives `source_class` and
`corpus_id` from `texts.source_meta_json`, extending the existing convention at
`public/db/local-db.js:603` (`_PERSONAL_TEXT_PREDICATE`) and the `json_extract` pattern at `:700`.

It is consumed by **both** the scope counter and the context harvester. Forking it would mean the
"Ben-Yehuda" a counter reports and the "Ben-Yehuda" a session serves are different sets.

### 6.3 Harvest

1. **Open-text grade** — `item.occ` already carries up to 8 verified occurrences of the word in the
   open text; all are written. Free, no extra resolution.
2. **Cross-text grade** — the served context is written.
3. **Bounded backfill** — for scheduled words with fewer than 3 contexts, the existing
   `findSentencesForWords` + `_r2VerifyCandidate` pipeline runs on idle with a per-session budget and
   the existing 7-day negative cache (`R2_MISS_KEY`, `public/js/library-ui.js:3070`).

Every candidate passes the same canonical-keyer identity gate used today
(`public/js/library-ui.js:3097` `_r2VerifyCandidate`), including the unvocalised-sentence rule that
demands a decisive resolve. Cap: 8 contexts per lemma.

### 6.4 Rotation

Contexts are ordered deterministically by `(source_class, text_key, order_index)` and the session
serves `contexts[reps % n]` — the rule already proven in `_trainBuildCloze`. No extra state is
stored; consecutive reviews walk the list.

`word_status.srs_*` anchor columns are left exactly as they are. They remain the first anchor and the
entry point to the heal ladder. The bank is a superset; with an empty bank behaviour is unchanged.

### 6.5 Scope filter

Launch-screen selector: `Всё`, `Этот текст` (only inside the reader), `Мои тексты`, and one entry per
corpus that actually has due words. Counts are computed by the same classifier.

**Membership rule:** a word belongs to a scope if and only if it has at least one verified context in
that scope. A due word with no in-scope context is excluded, and the screen states
`ещё N слов ждут повторения вне этого набора` with a one-tap switch to `Всё`. The scope promise is
never quietly broken.

### 6.6 T2 gates

- new `smoke:word-context` — harvest from all three points, identity-gate rejection of a homograph
  sentence, cap enforcement, rotation determinism, `keyer_version` invalidation, equality of the
  scope counter and the scope server, honest exclusion copy, and empty-bank behavioural parity with
  T1;
- `smoke:memory-canon` stays green — the bank writes nothing to `review_log` and nothing to the FSRS
  projection.

---

## 7. T3 — Anki wrapper

### 7.1 Interval fuzz

Implemented inside `public/js/fsrs-core.js` behind an explicit option, default off.

- the existing golden vectors (`scripts/premium/fixtures/fsrs/fsrs6-golden-v1.json`) run with fuzz
  off and must stay byte-identical — `smoke:fsrs` 30/30 is a hard precondition of the wave;
- new golden vectors are added for the fuzz-on path, transcribed from `ts-fsrs@5.4.1`;
- the fuzz seed is `(lemmaKey, reps)` — both derivable during `replay`, so
  `replay(review_log) == stored` continues to hold;
- `ENGINE_VERSION` is bumped and stamped into `review_log.meta.scheduler` as today.

This is the only file in the predecessor packet's stop list that this program opens, and it is opened
by the explicit owner decision recorded in §3.

### 7.2 In-session failure ladder

Replaces the current single reinforcement pass. A failed word returns after **at least 4 other
items** (or at the end of the session, whichever comes first) and once more in the closing
reinforcement phase — two spaced retrievals instead of one immediate one. The gap is a constant, not
a setting; it is bounded so a short session still delivers both returns.

Persisted Anki learning steps were considered and rejected: their purpose is to compensate for
Anki's lack of in-session return, which the Room already has, and they would require `replay` to
reconstruct a step position from the log.

Every return is its own canonical grade event, as today.

### 7.3 Leech policy

Threshold configurable (default keeps `LEECH_LAPSES = 4`). On reaching it the word is auto-paused
with an explicit notice and appears in a `Залипшие слова` list offering: change context, change
channel, open the word card, return to rotation.

Release is an assertion, so it is written to `review_log` as `kind='mark'` with
`meta.leech_released` — an event, synchronised and replayable. No column, no second axis, and the
manual status axis is untouched.

Rationale (R10/R11): a leech in a morphologically rich language is usually a bad context or an
unresolved homograph, not learner failure. Offering only `ignore` makes the product's single
suggestion "give up".

### 7.4 Sibling burying

Two lemmas sharing a root are not served in the same session. `root` is already carried on every item
(`public/js/reader-morph.js:2264` `collectReviewItems`, and the cross-text builder). When the root is
unknown the rule degrades to no burying — honest, never a guess.

### 7.5 T3 gates

`smoke:fsrs` with both vector sets, a fuzz replay-determinism assertion, ladder bound, leech release
round-trip through `review_log`, sibling exclusion, and the full T1/T2 suites.

---

## 8. T4 — retention analytics

Read-only over `review_log`, computed by an **independent fold** — not the code path that schedules
(R17: whoever teaches does not certify). The pure core is the T1 audit module.

Reports: 30-day load forecast; true retention by channel and by `evidence_scope`; interval histogram;
coverage by scope; leech list; and the daily review count required for the queue to stop growing
(§5.4).

`evidence_scope` is already written to every grade event by the predecessor release and is currently
never read. T4 is its first consumer; T6 is its second.

---

## 9. T5 and T6 — after the release

**T5 — FSRS optimizer over own logs.** `step(w, mem, t)` already takes the weight vector as a
parameter, so per-user weights need no core surgery. Delivered as a Node script producing an honest
comparison report against `DEFAULT_W`; weights are never auto-applied, and the golden gate keeps
pinning the mathematics rather than the weights.

**T6 — per-word channel by weakest evidence.** Today the channel (`📖/🎧/🔤/✍️`) is a session-wide
switch. Mature behaviour selects per word from its `evidence_scope` history — a word with reading
evidence but no listening evidence is offered on the listening channel — while preserving the
reading-first moat as the default for words with no evidence at all.

---

## 10. Scope and allowlist

Expected files across the program:

- `public/js/library-ui.js`
- `public/db/local-db.js`
- `public/db/migrations.js` (T2 only)
- `public/js/reader-morph.js`
- `public/js/fsrs-core.js` (T3 only)
- `public/library.html`
- `public/i18n/locales/{ru,en,he}.js`
- `scripts/premium/train-queue-audit.js`, `scripts/premium/train-queue-smoke.js`,
  `scripts/premium/word-context-smoke.js`
- `scripts/premium/fixtures/fsrs/` (T3 only)
- `package.json`, `tests/i18n.locale-version.lock.json`
- `public/index.html` and `public/sw.js` for the release version only
- this spec and bounded research evidence under `docs/research/room-trainer-maturity/2026-09-02/`

Stop list: schema outside the single T2 table, `public/js/lemma-canon.js`, server learner graph and
APIs, corpus assets, the Anki export contract, media player, Studio ingest, and any user data.

---

## 11. Role synthesis

- **R2 (SLA methodist)** — variety and coverage are pedagogical requirements, not cosmetics: a fixed
  twelve-word rotation trains a set, not a vocabulary. Context rotation removes encoding specificity.
- **R4 (premium UX)** — the launch screen must state the real arithmetic (§5.4) and every scope must
  have an honest empty state. No dead ends.
- **R5 (product)** — Anki parity is the benchmark the learner silently compares against; missing
  limits and ordering options read as immaturity even when the algorithm is correct.
- **R10 (computational morphologist)** — context harvesting is a resolution problem; every candidate
  passes the identity gate, and a leech is treated as a possible resolution defect (§7.3).
- **R11 (regression/textology)** — no wave may let a plausible-but-wrong sentence reach the learner,
  and no wave may break `replay(log) == stored`. T1 is deliberately memory-inert.
- **R12 (platform architect)** — `review_log` stays the event truth, `word_status` the projection,
  `word_context` a derived cache. No dual-write, no second scheduler.
- **R16 (cost governor)** — the whole program is local and deterministic; no LLM call is introduced.
- **R17 (agent pedagogy / grader independence)** — the analytics fold in T4 is independent of the
  scheduling path, so the trainer cannot certify itself.

---

## 12. Acceptance

The program is complete when, on the owner's real profile:

1. the audit records the baseline and post-change unique-lemma counts over 20 simulated consecutive
   daily sessions; the post-change figure is at least double the baseline, and no lemma is served on
   more than 25% of those days unless FSRS genuinely schedules it there;
2. a word with several verified contexts is observed in different sentences on consecutive reviews;
3. a scoped session serves only words with a verified context in that scope, and states how many due
   words sit outside it;
4. cross-text multiple choice draws distractors from outside the session;
5. daily limits and session size are configurable and the stated arithmetic matches the ledger;
6. the leech list offers a repair path and a release round-trips through `review_log`;
7. `replay(review_log) == stored` holds after every wave, with `smoke:fsrs` and `smoke:memory-canon`
   green;
8. 380 px RU and HE/RTL show no overflow and no target under 44 px.

Owner-live physical-device verification remains a separate step and is not satisfied by browser
emulation.
