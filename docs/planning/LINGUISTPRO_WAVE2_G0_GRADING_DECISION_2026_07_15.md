# LinguistPro Wave 2 G0 — grading contract adjudication

**Date:** 2026-07-15

**Status:** `OWNER_APPROVED_IMPLEMENTED`; G0 repair v3.11.172.

**Scope:** G0 only. The owner approved G0-D1 option A and the recommended G0-P vector on 2026-07-15. No C3a/N1/LB0/F1-F3/control-plane work is included.

**Source command:** `npm run smoke:grader-gold` at `main@c5079f0c43f3afe01cffa109a8a26405c7a1c252`, package `3.11.171`.

**Adjudication:** `explicit production skip on receptively strong = Hard(2)`; `read = resolver-guarded non-strict`; `reverse/cloze/dictated typing = strict`.

## 1. Verified result

`smoke:grader-gold` reproducibly fails `52/58`:

| Contract area | Result | Evidence |
|---|---:|---|
| Dataset positive sweep | 452/452 | Exact vocalized-cell answers remain accepted. |
| Dataset negative sweep | 0/447 accepted | The strict dictated-typing sweep has no measured false accept. |
| Handwritten gold | 18/22 | Four inherited proclitic cases expect non-strict Room behavior but the harness sends every case through `dictate:typed`. |
| D1 explicit skip | fail | Smoke expects Again(1); the canonical shared policy returns Hard(2) for a production skip on a receptively strong item. |
| Total | 52/58 | Four case failures + gold threshold + stale skip assertion. |

This is contract drift, not evidence that the deterministic grader should be weakened. `agent/grader.js` has treated `cloze:*` and `dictate:*` as strict since `cd56c3b`; `public/js/grade-policy.js` has treated receptively-strong production skip as Hard(2) since the owner-decision implementation in `10c6cfb`. The original v1 gold/harness still encodes the older generic-channel assumptions from `fc1aecb`.

## 2. Pre-repair verified channel behavior

`strict` means exact normalized Hebrew surface only: niqqud, final-letter folding and punctuation normalization still apply, but no leading-letter proclitic stripping is accepted. `non-strict` means the current one-letter heuristic may strip one of `ו/ה/ב/כ/ל/ש/מ` from either side.

| Surface/channel family | Task evidence | Live expected form | Live proclitic policy | Important consequence |
|---|---|---|---|---|
| Room `read:*` typed/tiles | Source sentence + gloss | Cloze surface plus `item.surface` | non-strict in Room-local `_acceptedSkeletons` | Preserves current reading flow, but the heuristic can confuse lexical initials with proclitics. |
| `read:ma` / `listen:ma` | Receptive multiple choice | Persisted correct option | MC identity, not free-text proclitic grading | Must stay outside a typed-answer gold matrix. |
| `reverse:tg` / `reverse:ma` | Meaning to Hebrew lemma | Canonical display lemma | non-strict in server grader today | An added/changed leading letter can be accepted even though the task asks for the lemma. |
| `cloze:tg` / `cloze:ma` | Context with a blank | Exact source surface | strict | Dropping or swapping a meaningful preposition/article is a production error. |
| `dictate:tg` / `dictate:ma` / `dictate:typed` | Audio to written form | Exact written cell/surface | strict | Prevents known collisions such as `כלב` → `לב`. |

At reproduction time, Room and server also disagreed on explicit production skip. The shared server policy returned Hard(2) when the item was receptively strong, while Room called D1 only for `!skipped && !correct`, so a Room production skip remained Again(1). Section 8 records the repaired state.

## 3. Independent channel answer matrix

This matrix is the proposed human-adjudicated oracle boundary. It is intentionally specified outside `agent/grader.js`; after owner approval it should be frozen as channel-labelled gold input and the harness should consume the declared channel per row. The grader or a fixture builder must not generate its own expected outcomes.

Legend: `A` = accept, `R` = reject as a gradable production miss, `NA` = this answer shape is not the channel's free-text contract.

| Answer relationship | Read typed | Reverse | Cloze | Dictated typing | Recommended rationale |
|---|---:|---:|---:|---:|---|
| Exact normalized surface | A | A | A | A | Deterministic base case. |
| Same surface with/without niqqud | A | A | A | A | Existing normalizer contract. |
| Final-letter normalized equivalent | A | A | A | A | Existing normalizer contract. |
| Answer adds one plausible proclitic | A | R | R | R | Reading tolerance only; production channels test the requested lemma/surface. |
| Expected surface has a proclitic, answer omits it | A | R | R | R | Contextual production must retain the grammatical prefix. |
| Answer swaps one proclitic for another | A | R | R | R | A swapped prefix can change syntax/meaning. |
| Lexical-initial collision, e.g. `כלב` → `לב` | **R** | **R** | **R** | **R** | Independent negative must override naive one-letter stripping. Read non-strict therefore needs a collision/identity guard, not unconditional acceptance. |
| Dictionary lemma instead of requested inflected surface | Channel-specific existing Room contract | A only when lemma is the declared reverse target | R | R | No lemma-echo privilege for surface tasks. |
| Ktiv male/haser candidate without a cell-level oracle | R / abstain from write | R / abstain from write | R / abstain from write | R / no write for near-miss | Preserve current non-authoritative `near_miss` gate. |
| Empty, timeout, later, passive exposure | no write | no write | no write | no write | MNAR; not a skip and not evidence of failure. |
| Explicit learner action “I don't know” | grade by G0-D1 | grade by G0-D1 | grade by G0-D1 | grade by G0-D1 | This is an observed action, unlike absence/timeout. |

The recommended vector is therefore `read=guarded non-strict`, `reverse=strict`, `cloze=strict`, `dictated typing=strict`. “Guarded non-strict” is not the current unconditional one-letter stripper: it must retain an independent collision-negative set or resolver-backed identity guard before an accepted variant may write learner truth.

## 4. Cases that the repaired gate must retain

The repair may re-label rows by channel; it must not delete or weaken these protections.

### Negative and abstention cases

- Wrong Hebrew word remains a gradable miss.
- Lemma echo remains a miss outside a declared lemma-target channel.
- Other inflection-cell answers remain negative; the derived sweep keeps exact false accepts at zero.
- Ktiv candidate remains non-authoritative unless a separately approved cell-level oracle exists.
- Dictation near-miss remains terminal `recorded:false`; hearing does not uniquely establish spelling.
- Non-Hebrew input remains unsupported and writes no review event.
- Missing expected form remains unsupported and writes no review event.

### Annul and provenance cases

- An annulled production success is excluded before D1; it cannot disable Hard mitigation.
- A live same-family production success still turns a later same-family failure into a real Again(1) lapse.
- Every written verdict retains deterministic grader, policy, expected-form, decision, reason, raw-grade and applied-policy provenance.
- The evaluator/gold remains independent of the implementation and of any LLM.

### MNAR cases

- Empty normalized answer, timeout, “later”, cancel and passive exposure write nothing.
- Explicit “I don't know” is not MNAR because it is an observed learner action; its FSRS grade is the G0-D1 owner choice below.

## 5. Approved reversible repair plan

Both semantic decisions were selected before these steps were implemented.

1. Freeze a v2 channel-labelled gold matrix from the approved table; keep v1 history rather than silently rewriting its meaning.
2. Make the harness pass each row's declared channel instead of forcing all 22 rows through `dictate:typed`.
3. Align `grader-gold` skip expectations with G0-D1 and add explicit receptively-strong/non-strong plus receptive/production cases.
4. Align Room and server skip behavior through the shared grade policy; one semantic rule must feed both schedule and log.
5. If G0-P selects strict reverse, narrow the current server policy for `reverse:*` and add Telegram + Mini App regression rows.
6. If read remains non-strict, replace unconditional collision acceptance with a separately tested guard; do not declare the current `כלב` → `לב` behavior correct merely to preserve parity.
7. Run `smoke:grader-gold`, `smoke:grade-policy`, relevant Telegram/Mini App/Room smokes, `smoke:memory-canon`, and `test:api-smoke`; inspect cross-surface event/schedule parity.

Rollback is one scoped code+fixture commit. No migration or canonical-log rewrite is needed because grading policy is applied at write time and carries versioned provenance.

## 6. Adversarial R1–R17 critique

- **R1/R10:** unconditional one-letter stripping is not morphological analysis and has a measured lexical-collision class. It cannot certify production truth.
- **R2:** Hard(2) for an explicit production “I don't know” on a receptively strong item preserves receptive memory while scheduling targeted production work; Again(1) treats the whole lemma as a lapse.
- **R4:** channel feedback must explain “expected the prefix/exact written form” rather than expose implementation language such as “strict mode”.
- **R11:** changing fixtures only to make the gate green is prohibited. Channel-labelled gold plus collision negatives is the independent do-no-harm oracle.
- **R12:** Room and server cannot keep divergent skip truth; the shared policy must be the single decision source and the same grade must drive FSRS plus `review_log`.
- **R14/R15:** no new data class or content logging is needed for G0; negative fixtures contain synthetic/public lexical examples only.
- **R16:** the repair is deterministic and LLM-free.
- **R17:** explicit skip is distinguishable from MNAR, tutor output has no grading authority, and annul/provenance/independent-gold gates remain mandatory.

## 7. Owner decisions — approved

### G0-D1 — explicit production “I don't know” on a receptively strong item

- **A — Hard(2), approved.** Confirms the already implemented server owner policy: production uncertainty does not erase established receptive memory. The repair brings Room and the stale gold assertion into parity.
- **B — Again(1).** Treats explicit production skip as a full lapse. This requires reversing the current shared server policy and its existing dedicated smoke coverage, then aligning Room/server and versioning the policy.

### G0-P — proclitic policy by channel

- **Approved vector:** `read=guarded non-strict; reverse=strict; cloze=strict; dictated typing=strict`.
- Or specify a different `strict/non-strict` value for each of `read`, `reverse`, `cloze`, and `dictated typing`. Any non-strict production choice must explicitly accept the measured lexical-collision risk and receive its own negative ceiling.

## 8. Implementation evidence

- v2 independent channel fixture: `scripts/premium/fixtures/grader/grader-channel-gold-v2.json`.
- Server production families `reverse/cloze/dictate` use strict normalized-surface grading.
- Room reading tolerance accepts only an explicit target form or a one-prefix variant whose stem resolves to the same canonical `lemmaKey`; `כלב → לב` remains negative.
- Room explicit production skip now passes through the shared D1 policy and therefore records Hard(2) when receptively strong.
- Legacy v1 proclitic rows remain preserved as historical evidence; they are not mis-run as dictated typing.
- Direct gates: `smoke:grader-gold` 77/77; `smoke:grade-policy` 28/28; `smoke:reader-morph` PASS with 380×844 visual inspection.
- Cross-surface regression: Telegram review 32/32, cloze 21/21, dictate 30/30; Mini App review 68/68; memory canon 79/79; reader parity PASS; API smoke PASS.

G0 is ready for the remaining regression suite and scoped publication.
