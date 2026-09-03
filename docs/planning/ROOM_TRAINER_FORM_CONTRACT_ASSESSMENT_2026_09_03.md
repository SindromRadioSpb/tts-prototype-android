# Room Trainer — the form contract: assessment

Date: 2026-09-03
Runtime assessed: `3.11.460`
Status: ASSESSMENT ONLY — no fix proposed for implementation, no owner decision taken
Trigger: owner field report with nine screenshots (`אזור`, `קביעתך`, `השיר`, `השמש`)
Canon: `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md`

## 1. The owner's finding, restated precisely

The cloze asks for the **surface token as it appears in the sentence** — including the definite
article, proclitics and pronominal suffixes. The prompt describes the **citation lemma**.

Nothing in the prompt carries the difference. For `קְבִיעָתְךָ` ("your decision") the hint reads
*постановление, решение, утверждение* — the gloss of `קְבִיעָה`. The required possessive is
knowable only from the sentence translation or the audio.

The owner's conclusion — that the translation and audio scaffolds are therefore **necessary, not
optional** — is correct, and this document adds the evidence for it.

## 2. What was measured, not assumed

The two graders were exercised directly against the owner's own examples.

| Target in sentence | Learner types | `read` channel | `dictate` / `reverse` |
|---|---|---|---|
| `הַשֶּׁמֶשׁ` | `שמש` | **accepted** | rejected |
| `הַשֶּׁמֶשׁ` | `השמש` | accepted | accepted |
| `קְבִיעָתְךָ` | `קביעה` | **accepted** | rejected |
| `הַשִּׁיר` | `שיר` | **accepted** | rejected |

The two channels disagree about what the exercise even is, and neither disagreement is visible to
the learner.

**Why `read` accepts the lemma.** `library-ui.js` passes
`acceptReadAnswer([built.cz.answer, item.surface, item.niqqud], …)`. `item.niqqud` is the card's
**citation** form, so the citation skeleton is inside the accepted set and matches on the exact
branch before any proclitic logic runs.

**Why `dictate`/`reverse` reject it.** They call
`acceptStrictAnswer(built.cz.answer, val)` — the sentence form and nothing else.

## 3. Problems

### P1 — The prompt names the lemma; the gap wants the surface form
**Severity: structural.** This is the root cause; P2, P3 and P6 are its consequences.

The hint line renders `item.gloss` — the citation gloss. The blank is `cz.answer` — the surface
token. For any inflected or clitic-bearing target the two differ, and no element of the prompt
names the difference.

**Solvable: yes, and the machinery already exists.** `reader-morph.js findSlot(paradigm, niqqud)`
already resolves a surface form to its paradigm cell — that is how `buildMcSlotOptions` builds
same-slot distractors. `inflection-render.js slotLabel(slot)` already renders that cell as a
localized human label ("ТВОЙ (М)", "ЕД, СОПР"), which the word card shows today. The proclitic is
separately derivable: `findSlot` strips it to reach the stem, so the difference between surface
skeleton and stem names it.

**Limits to be honest about:** `findSlot` needs a paradigm from the shipped inflection dictionary
(9 279 paradigms). A word outside it has no slot label, and the hint would have to degrade to the
proclitic alone or to nothing — which is the existing behaviour, not a regression.

**Advisability: recommended for typed and dictate.** For slot-MC it adds nothing (all four options
are already the same slot), and it must not be shown in a way that turns the B1 fallback into a
give-away.

### P2 — The `read` grader accepts the citation form for any inflected slot
**Severity: high — and this is a measurement defect, not a leniency.**

Typing `קביעה` for `קְבִיעָתְךָ` is accepted. The learner passes without producing the required
form, and the reveal then shows a form they never wrote.

The damage is not only pedagogical. That answer is recorded with
`evidence_scope: unsupported_production`, so **T4's retention numbers overstate production
competence by exactly this margin.** The instrument built two waves ago is measuring an answer
that proved only the lexeme.

**Solvable: yes**, three ways, in ascending honesty:
1. narrow `expectedForms` to forms that actually occur in the sentence;
2. keep accepting the lemma but record a *different, weaker* evidence scope for it;
3. do (1) only after P1 is fixed, so the learner can know what is being asked.

**Advisability: (3), and only (3).** Tightening the grader before naming the required form would
convert `read` into the same unanswerable state as `dictate` (P3). Doing (2) alone leaves the
learner passing on a form they cannot produce.

### P3 — `dictate` and `reverse` are strict on a form the prompt never specifies
**Severity: high.** Measured above. Without the translation or the audio these items are not
difficult — they are **unanswerable by construction**.

**Solvable: yes** — the same slot label as P1. An alternative, grading stem and clitic separately,
is available but weaker: it would accept `שמש` for `השמש` and quietly stop testing the article,
which is a real part of Hebrew.

**Advisability: fix via P1, not by loosening the grader.**

### P4 — In slot-MC the option text differs from the revealed answer
Example: the learner picks `שִׁיר`, is told "Верно", and the reveal shows `הַשִּׁיר`.

This is **deliberate**, and the code says so: all four options are bare slot forms specifically so
the correct one is not identifiable by carrying a proclitic, and correctness is flagged rather
than string-matched. The design is sound; the presentation is not — it reads as a bug.

**Solvable: yes, cheaply** — the reveal can show both ("`שִׁיר` → в тексте: `הַשִּׁיר`").

**Not advisable:** "fixing" it by putting the proclitic back on the correct option. That restores
the give-away the design removed.

### P5 — The B1 fallback MC carries a proclitic give-away
When slot options are unavailable the correct option is `built.cz.answer` — the full surface token,
proclitic included — while the distractors are citation forms. If the target carries `ה`, `ב`, `ל`,
`ו`, `כ`, `ש` or `מ`, the correct answer is identifiable **without knowing the word at all**.

**Solvable: yes** — strip the leading clitic from the correct option in this path too, since
grading is already by flag, not by string.

**Advisability: recommended.** It is a fairness defect: the item currently rewards pattern-spotting
over knowledge, and every such success is recorded as genuine recall.

### P6 — The scaffolds are load-bearing, but documented as a temporary convenience
The predecessor packet §1 describes the sentence translation and audio as scaffolds kept "for the
current learner cohort", implying they could later be withdrawn.

The evidence above says otherwise: for any target that is not the citation form, they are the
**only** channel carrying the required-form information. They are structural, not transitional.

**Solvable: it is a doctrine change, not code.** The testable consequence is that an item with an
inflected target, no translation *and* no audio should be honestly skipped rather than served —
today nothing prevents serving it.

**Advisability: recommended**, and it should be stated in the canon so a future wave does not
"clean up" the scaffolds as legacy.

### P7 — Audio as sole disambiguator is fragile
The owner notes case 3 is "solved by the audio being there". Where baked audio is absent and no
TTS key is configured, the same item loses its only disambiguator.

A second-order limit: vocalization is often machine-generated (the word card labels it
*огласовка — машинная (Dicta)*), so synthesized audio can carry a wrong vowel and thereby a wrong
form.

**Solvable: partially.** P1's slot label removes the dependence on audio for the *form*. It does
not fix machine-vocalization error, which is a data-quality matter outside this trainer.

## 4. What would be a mistake to do

**Blank the citation form instead of the surface form.** This removes P1–P5 at a stroke and is the
obvious shortcut. It is also the wrong answer: in Hebrew the inflection *is* the learning. The
exercise would degrade into a vocabulary quiz and the product would lose the thing that
distinguishes it from a flashcard app.

**Accept any form of the correct lemma everywhere.** That is effectively what `read` does today
(P2). Applied deliberately and universally, it makes every channel a lexeme test and makes T4's
production metric meaningless.

**Make the translation more prominent to compensate.** The translation is already shown before the
answer. Strengthening it further pushes the learner toward reading Russian and reconstructing, and
the item stops testing Hebrew retrieval at all. The tension between "enough scaffold to be
answerable" and "not so much that Hebrew is bypassed" is real and should be resolved by naming the
required form, not by enlarging the crutch.

## 5. Ordering, if this becomes a wave

P2 and P5 are the two that corrupt measurement, and P5 is self-contained. P1 is the enabler for
everything else. A defensible order is P5 → P1 → P2/P3 → P4 → P6, with P7 partly closed by P1.

Nothing here is scheduled. T5 and T6 stay deferred: the owner's judgement that the product is not
yet mature for them is supported by this assessment — an optimizer fitted to retention numbers
inflated by P2 would be fitting to a distorted signal.
