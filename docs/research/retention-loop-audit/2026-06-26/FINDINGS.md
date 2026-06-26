# Reading-Room retention loop — how word-status is derived, where the loop breaks, and what Epic 4 must close

**Date:** 2026-06-26 · **Status:** 🔬 investigation complete (3 parallel role-lens code agents) · informs the Epic 4 vs Epic 3b decision.
**Trigger:** owner asked «how do I test the colour-status (known/learning/new) on the root-family chips? I don't understand the corpus↔Anki chain — is full integration planned?» (after Epic 3a shipped status-coloured chips). Read-only audit; no code changed.

> **What this is.** A grounded map of the learning-state model: how a word's status is computed, the full corpus→note→Anki→mastery→i+1→colouring chain, where it is one-way / local-only, and what Studio already has that the Room can reuse. The strategic recommendation (Epic 4 recon-first) is in §5. Citations are file:line from main `cfe6b3a`.

---

## 1. How word-status is derived (Agent A)
- `getKnownWordStates()` (`public/db/local-db.js:2101`) → `{ lemmaKey → status }`, statuses **`new / learning / known / weak / stale`**. Built from `getLearningStateOverlay()` (`local-db.js:1920`), which joins `srs_cards` + `srs_attempts` per note.
- Derivation: `suspended→learning` · accuracy<50% over ≥3 / ≥2 lapses → `weak` · >7d overdue → `stale` · `reps===0 && attempts===0` → `new` · learning/relearning → `learning` · else → `known`. A card studied in Anki has no in-app attempts → its synced `reps`/`state` is the authority.
- **Status is PURELY SRS/Anki-driven. There is NO manual "mark as known/learning/ignore" path** — no `manual_status` field anywhere. A freshly-saved word_study note = lifecycle `created` / status **`new` (blue)**. `learning`/`known` appear ONLY after reviews (in-app Trainer attempts OR Anki sync read-back, `reps>0`). The loop is **one-way** (no manual downgrade/revert).
- i+1 frontier already computed: `getTextLearningCoverage()` (`local-db.js:2044`).

## 2. The full corpus↔Anki loop + where it breaks (Agent B)
| Segment | Direction | Tech | User scope | State |
|---|---|---|---|---|
| 1 capture→note | one-way | tap → `roomSaveWord` (`library-ui.js:529`) → canonical `word_study` note + occurrence | universal | ✅ |
| 2 note→.apkg | one-way | `buildWordStudySpec`→`buildApkgBytes` (sql.js+jszip) | universal | ✅ |
| 3 Anki review→sync back | two-way | `v3AnkiFetchWordReviewStates`→`applyAnkiReviewStates` (`local-db.js:2156`) | **Desktop + AnkiConnect 127.0.0.1, LOCAL_MODE only** | ⚠️ **broken for remote prod users** |
| 4 mastery→i+1 | one-way | `getKnownWordStates`→`coverageForWork`/`pickPersonalRail` (`corpus-vocab.js:49/87`) | universal | ✅ |
| 5 i+1→colouring | one-way | `ensureWordStates`→`decorateWords` (.rm-w-known/learning/new/weak/stale) | universal | ✅ |

**The break (Segment 3) is the crux.** AnkiConnect listens on localhost; AnkiWeb/AnkiMobile have no public read API. So a **remote prod user (the owner on `linguistpro.kolosei.com`) cannot pull review state back** → the app never learns what was reviewed → mastery stays `new` → **the colour-status is effectively stuck at blue for the entire remote reading experience.** This is an architectural constraint (no remote-Anki tech exists), not a bug. The in-app SM2 Trainer can advance status without Anki, but project policy de-emphasizes it (`SRS_STRATEGY_v3_2.md`: "Anki = review layer").

## 3. What Studio already has to reuse (Agent C)
- **Working SM2 scheduler** `srsRepo.js:466 computeNextCardState` (Again/Hard/Good/Easy, interval/ease/lapses/due) — functional, just policy-deemphasized.
- **Knowledge Map** 3-colour status (`getLearningStateOverlay`+`_to3()`+`_aggStatus()`) + **generative graph-quiz** `knowledge-map-quiz.js` (5 honest types: recall_meaning/guess_binyan/word_to_root/which_form/connection_recall; practice + card-creation, NOT a 2nd scheduler).
- **Anki**: 3 export paths + read-back + tag strategy (`lp_note_<id>`/`lp_lemma_<hash>`).
- **No manual status in Studio either.** Reusable for the Room: `srsRepo.js` SM2 · `KnowledgeMapQuizLoader` · `v3AnkiPushLocalMode`+tags · events tracking. **Built nowhere (Room must add): manual one-tap status · per-text coverage dashboard · reading-driven scheduling.**

## 4. Direct answer to the owner's questions
- **«How to test the colour now?»** Enable «Статус слов». Everything you've saved is **blue (`new`)**. To see green/orange you must review the words — either the in-app Trainer (deemphasized) or Anki Desktop + AnkiConnect (LOCAL_MODE) + sync back. **On the prod web reader you effectively can't** — that's the gap, not a setup mistake.
- **«Is full integration planned / described?»** YES. Audit Epic 4 (`BRR_UX_AUDIT_2026_06_25.md`) + `SRS_STRATEGY_v3_2.md` + `ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md`. The audit's `word-status-one-tap-set` finding **predicted this exact confusion**: "статус выводится строго из SRS → продвинутый читатель НИКОГДА не очистит синюю стену, раскраска не сходится к прозрачной."

## 5. Recommendation (role-lens) — Epic 4 recon FIRST, before Epic 3b
**Epic 3a shipped a status signal whose input is inert for remote use. The highest-leverage next move is to make that signal real — the keystone `word-status-one-tap-set` — not to add more status-dependent card polish (3b).**
- **R2 (SLA, lead):** a status that never advances is pedagogically inert; the "blue wall" never clears → no felt progress. Manual one-tap status + recall-in-room is the core of retention.
- **R5 (market):** LingQ's entire moat IS the one-tap "known" count growing. The i+1 engine + colouring are already built; only the INPUT (status) is gated behind Anki for remote users. Closing it = the single highest-leverage step to the LingQ bar. 3b is polish by comparison.
- **R4 (UX):** tapping a word and seeing all-blue chips you can't move is a broken-promise premium UX. Either make it movable (Epic 4) or 3a's chips over-promise.
- **R8 (graded):** colour-status + i+1 is the progress/graduation signal; without it advancing there's no "what's next / you've outgrown this" momentum (Epic 5). Epic 4 unblocks Epic 5.
- **R3 (graph):** the manual status MUST be a clean separate OPFS store (NOT faked into `srs_cards`), so it never spawns Anki cards or pollutes the SRS pipeline (audit's explicit constraint).
- **R11 (do-no-harm / source-precedence):** a manual overlay must not silently clobber the SRS/Anki-derived truth where Anki HAS data. Needs an explicit precedence rule (manual = the user's authoritative "reading knowledge" assertion; derived = inferred) reconciled honestly — the same source-precedence discipline as the בקר fix.

**Epic 4 recon-ticket (what to design before code):** (a) a lightweight OPFS `word_status` store separate from notes/SRS; (b) the precedence/merge rule between manual status and the SRS-derived overlay (R11); (c) one-tap UI in the card + optionally in-text (new/learning/known/ignore); (d) volume-test on the owner's big profile; (e) how `ignore` interacts with i+1 + colouring. Recall-loop (`recall-loop-in-room`) and frontier-study (`frontier-words-study`) are the follow-on Epic-4 pieces, reusing Studio's `KnowledgeMapQuizLoader`.

**Alternative (not recommended):** continue Epic 3b (function-usage). It's independent polish that doesn't unblock anything and leaves the inert-status problem (and the owner's confusion) unaddressed. 3b can follow Epic 4 cheaply.
