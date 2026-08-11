# Room Training premium-release implementation packet

Date: 2026-08-11

Status: APPROVED / IMPLEMENTATION ACTIVE
Owner decision: keep one canonical Reading Room trainer; harden it to release-grade quality.

## 1. Product decision

The existing Studio → Reading Room unification remains canonical:

`encounter in any supported text → canonical lemma + source anchor → word_status projection → shared due queue → one deterministic grade event → replay(review_log)`.

There is no Studio trainer, songs-only queue, corpus quota, second scheduler, or cloud/LLM dependency in this work.

### Immutable scaffold contract

The full Russian sentence translation and full-sentence audio remain available before the answer. They are intentional scaffolds, not accidental answer leakage:

- they keep the entry threshold low for the current learner cohort;
- the Russian headword is normally a citation/initial form while the required Hebrew answer is an inflected form;
- sentence meaning and sentence audio help the learner identify the required tense, person, gender, number, construct state, or other contextual form;
- the current morphology architecture cannot yet derive that required-form contract reliably enough to remove these supports.

Implementation must therefore preserve the visible translation and sentence-audio control. Evidence produced with these supports is recorded as context-supported or assisted; it must not be promoted to unsupported-production proof.

## 2. Approved release slices

### Slice A — canonical write integrity

Problem: Room currently writes the FSRS projection and `review_log` separately and swallows both failures. Automatic `nextLevel` also mutates the asserted manual-status axis and may mint a separate `mark` event.

Invariant:

- one completed answer creates one `review|skip` grade event;
- projection and event commit atomically;
- UI success is shown only after the commit succeeds;
- training does not mutate the manual status axis;
- exercise difficulty still progresses: the resulting `training_stage` is recorded on the canonical grade event and replayed at session load; a later explicit `mark` event overrides it;
- `replay(review_log) == stored FSRS state` after every accepted answer.

Regression gate: transaction fault injection, total/grade-event deltas, manual-status preservation, replayable exercise-stage advancement, duplicate-submit idempotence, replay oracle.

### Slice B — evidence honesty

Problem: `reverse:mc`, assisted tiles, and context-supported typing are currently grouped by channel prefix and can be interpreted as unsupported production.

Invariant:

- evidence is classified from the actual task mode, not the channel label alone;
- `mc` is recognition;
- tiles are assisted production;
- cloze/reverse with sentence scaffolds are context-supported;
- unsupported production is reserved for an actually unsupported typed task;
- translation and sentence audio remain present;
- FSRS-6 mathematics and grade meanings remain unchanged.

Regression gate: deterministic evidence-scope matrix, D1 matrix, no production latch from recognition/assisted/context-supported rows, channel switch provenance.

### Slice C — continuity and recovery

Problem: cross-text summary `Ещё` calls the open-text builder, and `Again` leaves a word due-now without returning it in the current learning flow.

Invariant:

- cross-text continuation stays cross-text;
- an initial miss/`Не знаю` returns once in a bounded reinforcement phase;
- every actual second answer is its own canonical grade event;
- opening/closing/navigation still writes no grade;
- direct source anchors pass the same canonical identity gate as recovered anchors.

Regression gate: cross-text `Ещё`, bounded retry, no infinite retry, stale/wrong-anchor fixture, open/close delta zero.

### Slice D — premium mobile/a11y surface

Problem: due review uses the title `Учить новые слова`, focus remains behind the modal, several targets are 25–30 px, and progress/verdict are not announced.

Invariant:

- due sessions are titled `Повторение`;
- 44 px minimum interactive height at 380 px RU and HE/RTL;
- focus enters, stays within, and returns from the dialog;
- tablist supports keyboard navigation;
- progress and verdict have screen-reader semantics;
- no horizontal overflow;
- the sentence translation and sentence-audio scaffold remains unchanged.

Regression gate: 380×844 RU and HE/RTL, keyboard/focus trap/return, accessible name and live status, light/dark, reduced motion.

## 3. Queue and source policy

Ranking remains source-neutral. Ben-Yehuda, Study Songs, and My Texts use the same due query, build path, FSRS state, and review writer. Ranking remains pedagogical (`lapses/weakness`, then due order); no corpus quotas are introduced.

Direct and recovered source occurrences must both resolve to the scheduled canonical lemma. A deleted source may degrade to verified re-anchor or honest word-only evidence; it must not erase the word from memory.

## 4. Scope and allowlist

Expected implementation files:

- `public/js/library-ui.js`
- `public/db/local-db.js`
- `public/js/grade-policy.js`
- `public/library.html`
- `public/i18n/locales/{ru,en,he}.js`
- `scripts/premium/room-training-premium-smoke.js`
- `scripts/premium/grade-policy-smoke.js`
- `package.json`
- `public/index.html` and `public/sw.js` for the release version only
- `tests/i18n.locale-version.lock.json` for the mandatory locale cache-bust lock
- this implementation packet and bounded research evidence

Stop list: `public/js/fsrs-core.js`, schema/migrations, lemma canon, server learner graph/API, corpus assets, user data, Anki contract, media player, Studio ingest, dirty owner files.

## 5. Role synthesis

- R2/R17: scaffolds remain because they serve form selection and low-threshold retrieval; evidence is demoted honestly by actual assistance.
- R4/R5: one calm session, no dead-end continuation, mobile/RTL/focus correctness, clear completion feedback.
- R11: direct-anchor identity gate and fail-closed persistence prevent a plausible but wrong learning event.
- R12: `review_log` stays event truth; `word_status` stays projection; no manual-axis dual-write from an answer.
- R14/R15: no text or learner state enters the handoff URL; deleted/private sources degrade locally.
- R16: local deterministic training remains useful without LLM calls.

## 6. Deployment and rollback

Release only after red→green focused tests, existing FSRS/memory/Reader/Room/Studio gates, i18n/version equality, and `git diff --check`. Commit only allowlisted files, push, deploy through the private production runbook, wait for the exact revision, then perform read-only owner-profile verification. Do not grade for the owner.

Rollback is the previous application revision. No migration or mass data rewrite is part of this packet, so rollback does not require a data rollback.

## 7. Implemented bounded changes

| Problem | Capability at risk | Immutable contract | Regression evidence |
|---|---|---|---|
| grade event and FSRS projection could diverge | replayable scheduling and cross-device history | one local transaction; success only after read-back | fault injection, exact log delta, replay oracle |
| channel label overstated evidence | pedagogical escalation and deterministic grading | translation/audio remain; actual task assistance defines scope | 36-case grade-policy matrix, channel-switch guard |
| misses left the current session | bounded 12-item daily habit | one retry pass, every retry is a new canonical attempt | isolated browser reinforcement path |
| direct source anchor could be stale/wrong | correct context and private-text continuity | canonical lemma identity before serving; honest local fallback | three-source and recovery fixture |
| manual status was silently moved by a grade | explicit learner assertion and sync LWW | grade advances replayable `training_stage`; later `mark` overrides | status unchanged + stage advanced in one event |
| dialog was weak on mobile/a11y | existing Room, media and reader flows | one modal, focus lifecycle, 44px targets, no overflow | 1280 RU, 380 RU, 380 HE/RTL, dark, focus trap/return |
| session launch scanned global history/future schedule | responsiveness as histories grow | same lapses/due ranking and no source quota | SQL due predicate + bounded per-session stage reader |

## 8. Local release gates

Final pre-production results on version `3.11.354`:

- `smoke:grade-policy` — 36/36;
- `smoke:room-training-premium` — 21/21;
- `smoke:studio-room-srs` — 49/49;
- `smoke:fsrs` — 30/30;
- `smoke:memory-canon` — 79/79;
- `smoke:i18n` — 233/233;
- `smoke:reader-morph`, `smoke:reader-parity`, `smoke:room-study`, `smoke:room`, `smoke:room-mode`, `smoke:room-media`, and `smoke:canon-version` — PASS;
- APP/CACHE equality and locale cache-bust lock — PASS;
- `git diff --check` — PASS.

The one transient `DbUnavailableError` seen during verification was caused by two overlapping copies of the same OPFS smoke after a tool-level timeout. The stale test processes were removed, and the gate passed 79/79 when rerun alone. It is not a product-runtime failure.

## 9. Production and owner-live evidence

Pending the exact allowlisted release commit and production deployment. This section is completed after the served revision and `3.11.354` are independently verified. Owner-profile production checks remain read-only; no grade is submitted for the owner.
