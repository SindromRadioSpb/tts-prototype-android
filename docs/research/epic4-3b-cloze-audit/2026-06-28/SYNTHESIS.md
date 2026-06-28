# Epic 4.3b cloze/recall — SYNTHESIS (2026-06-28)

Verdict: the **core design is competitive-grade** — cloze-in-the-user's-own-text + auto MC→typed escalation + morpho-honest distractors + status-clears-the-wall are exactly the modern best-in-class patterns (Clozemaster / Quizlet Learn / LingQ / Readlang), and the morphology distractors are a genuine moat no generic app can match. But the audit found **real correctness/honesty bugs** that quietly corrupt the level signal, plus high-value practices we don't yet have. Grouped by priority; every item is Room-only / parity-safe / resolver-untouched / no-Anki-cards / deterministic unless noted.

## TIER A — do-now bug & honesty fixes (S–M each, high confidence, code-verified)
A1. **Offset misalignment (HIGH, R10/R1/R11)** — `occ.wordOffset` is a HE-column index, but `_trainBuildCloze` blanks in the `he_niqqud` tokenization; when the two strings tokenize to different word counts (maqaf/punctuation), the WRONG word is blanked or the target stays visible. No guard that the blanked skeleton equals `item.surface`. Fix: in `_trainBuildCloze`, verify `stripNiqqud(cz.answer) === item.surface` skeleton; on mismatch try the next occurrence, else skip. Self-correcting + cheap. `library-ui.js` `_trainBuildCloze`.
A2. **Repeated-target leak (R8/R10/R11)** — `buildCloze` blanks only one occurrence; a twin of the answer stays visible (~1% live). Fix: blank ALL word tokens whose `_normHe` skeleton equals the target (one answer, multi-blank). `reader-morph.js` `buildCloze`.
A3. **Skipped items inflate the score (R8 bug)** — unbuildable items still count in `s.total` → «10/12» when 2 were skipped (masks A1 as user errors). Fix: pre-filter buildable items (or decrement total on skip). `library-ui.js` `renderTrainItem`/`startTraining`.
A4. **Duplicate MC option buttons (R1/R10/R11 — verify said DO-NOW)** — `pickDistractors` dedups by `lemmaKey`, not displayed surface; two visually-identical buttons can appear, one arbitrarily "correct". Fix: dedupe options by displayed (niqqud-stripped) form + drop any distractor equal to `cz.answer`. `reader-morph.js` `pickDistractors` + `library-ui.js` option build.
A5. **MC distractor starvation (R10/R2)** — no minimum-3 guard → degenerate/auto-correct MC on sparse texts inflates promotions. Fix: if `<3` distractors, fall back to typed for that item; add a min-distractor smoke assertion.
A6. **Mode-switch race (R4 bug)** — `recollectStudy` doesn't re-check `_studyMode` after its await, so a quick list→train switch can repaint the list over the training screen (`startTraining` already guards). Fix: bail in `recollectStudy` if `_studyMode !== 'list'`.
A7. **Question-🔊 leaks the answer (R11/R2/R10)** — the always-present row-audio speaks the WHOLE sentence incl. the target (contradicts the locked reveal-only invariant). Owner explicitly requested question-side audio → don't remove; instead **speak `before + after` (target muted)**, or move full-sentence audio to reveal. Owner confirm. `library-ui.js` `data-train-rowspeak` handler.
A8. **levelUps undercount (R2 nit)** — summary excludes `new→l1`; count any `next !== prior`. One line.
A9. **Raw status codes in reveal (R4 quality)** — «l1 → l2» shown unlocalized (the list localizes them). Map via STUDY_STATUS labels.
A10. **nameSuspect in session/distractors (R1/R10)** — honor the existing `_studyView.hideNames` toggle in `startTraining` (do NOT exclude names by default — soft heuristic, owner default-show).
A11. **Smoke coverage (R10/R11 gap)** — add deterministic gates for A1/A2/A4/A5 (repeated-word, target-match, option-dedupe, min-distractors).

## TIER B — quality / pedagogy (M, real, lower urgency)
B1. **Distractor form/slot mismatch (R10/R2)** — the correct option is the inflected sentence form (vocalized), distractors are lemma citation forms → only the answer grammatically fits + a niqqud-presence tell; the moat is undercut. Fix: render all options vocalized + prefer slot-plausible inflections.
B2. **«Не знаю» / skip control (R2/R4, HIGH-value gap)** — MC forces a blind guess (25% lucky promotion). Add skip→reveal with soft no-recall demotion (no false success).
B3. **ru over-scaffolds the question (R2/R8)** — full sentence translation shown during the question (esp. typed) hands over the meaning. Owner requested it; consider tap-to-reveal ru at typed/known tiers, keep the gloss. Owner decision.
B4. **Missed items not re-queued in session (R2/R8)** — a miss only reveals; never re-produced. Add end-of-session requeue of misses.
B5. **Typed-answer over-strict (R1/R11)** — rejects valid ktiv male/chaser variants and lemma-with/without-proclitic; accept any inflected surface of the lemma from the pool.
B6. **Machine niqqud shown as gold on reveal (R9/R11/R1)** — add the existing machine-niqqud provenance marker to the revealed answer.
B7. **Answer-position telegraph (R11)** — `idx%len` puts the answer in the same slot every replay; seed by `lemmaKey` to vary placement deterministically.
B8. **a11y (R4 gap)** — no `aria-live` on the verdict; focus not moved into the question / onto «Дальше» after answer.
B9. **applyDecorations repaints the whole text every answer (R4 perf)** — fine on small texts; consider a targeted repaint on big ones.

## TIER C — adopt new practices (M–L, competitor-grounded, mostly v2)
C1. **Hebrew word-bank / tap-the-letters production tier (R8/R5, HIGH)** — free Hebrew typing is unusable on mobile → l3/l4/known typed tiers systematically wrong-demote mature words. Add a tap-to-assemble tier between MC and free-typing (Duolingo word-bank). Highest-value new tier.
C2. **Time-based cross-session «due today» queue (R2/R5, HIGH)** — the single biggest retention lever (Anki/FSRS/Busuu). Store `nextDue`/`lastCorrect` per `lemmaKey` in `word_status`; surface due items across all read texts. Offline-feasible; pairs with cross-text recall.
C3. **Two-correct-in-a-row gate before leaving MC (R2)** — defends the 25% MC guess; but session-local is a no-op → needs a persisted streak (pairs with C2).
C4. **Teach-before-test for new words (R2/R8)** — new words go straight to MC; optional peek/teach first encounter.
C5. **Reverse (RU→HE) + listening/dictation activities (R8/R5)** — second retrieval routes over the same baked text + audio.
C6. **Weakness-weighted selection + leech detection (R2)** — once lapse history exists (C2), weight toward recently-missed; suggest «игнор» after repeated misses.
C7. **Massive-context ±N sentences for thin cloze (R8/Lute MCD)** — extend context for very short host sentences.
C8. **Macro-progress / closure vs the frontier (R5/R4)** — session is endless; show progress against the text's frontier.
C9. **Anki .apkg export from the recall sheet (R5)** — we already ship .apkg; surface it as the "borrowed FSRS" path until C2 lands.
C10. **Gamification (streak/daily goal) + session-length control + number-key MC shortcuts (R4/R5 polish)** — minimal, pairs with C2's daily queue.

## Recommended sequencing
1. **Tier A** as one batch (correctness/honesty — they silently corrupt the level signal the whole loop depends on) + smoke gates. S–M, high confidence.
2. **B2 (skip), B1 (distractor slot-match), B5 (typed tolerance)** — the pedagogy quality wins.
3. **C1 (word-bank tier)** then **C2 (time-based due-queue)** — the two highest-value new capabilities (mobile typing + real spacing).
