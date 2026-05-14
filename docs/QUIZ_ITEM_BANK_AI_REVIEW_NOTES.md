# QUIZ_ITEM_BANK_DRAFT.md — Annotated Reviewer Feedback

> **Reviewer feedback draft**  
> **Date:** 2026-05-15  
> **Review type:** external reviewer-style annotated feedback  
> **Scope:** grammar · CEFR level · unambiguity · pedagogical validity · implementation readiness  
> **Source limitation:** the original GitHub file was not reachable during this review pass, so this annotation is based on the provided item inventory: Q01–Q20, CEFR distribution 4/4/5/4/3, topic list, and declared difficulty logits. Before merging, apply these comments against the actual `docs/QUIZ_ITEM_BANK_DRAFT.md` text.

---

## Overall verdict

**Verdict:** CONDITIONAL APPROVAL — item bank direction is acceptable, but several items require review before C1 JSON schema build.

The 20-item structure is pedagogically plausible for an ulpan diagnostic quiz. The CEFR spread is reasonable for a short placement-style instrument: A1 ×4, A2 ×4, B1 ×5, B2 ×4, C1 ×3. The difficulty range from approximately −2.5 to +2.7 logits is also plausible for a first Rasch-style draft.

However, this should not be treated as final sign-off yet. The item bank still needs a domain reviewer to verify natural Hebrew, distractor quality, RTL rendering, and item-level ambiguity. Several topic labels suggest possible reversed RTL display artifacts, especially `תא`, `ינוצרב`, `םיטרפל תדרל`, `דוסי ןבא`, and `הלימב סופתל`. These should be verified in the source file as actual Hebrew strings, not visually reversed fragments.

---

## Required global fixes before sign-off

### G1 — Verify RTL rendering and Hebrew token direction

**Severity:** High  
**Applies to:** Q14–Q20, possibly all Hebrew prompts/options  
**Reviewer checkbox:** ☐ required before approval

Several Hebrew examples in the summary appear visually reversed:

- `תא` likely intended as `את`
- `ינוצרב` likely intended as `ברצוני`
- `םיטרפל תדרל` likely intended as `לרדת לפרטים`
- `דוסי ןבא` likely intended as `אבן יסוד`
- `הלימב סופתל` likely intended as `לתפוס במילה`

This may be only a markdown/terminal bidi artifact, but it must be checked in the actual rendered GitHub document and in the app UI. If the quiz JSON stores correct logical-order Hebrew, the issue is only presentation. If the source strings are actually reversed, they must be corrected before implementation.

**Required action:** open `QUIZ_ITEM_BANK_DRAFT.md` in GitHub preview and in a local editor with bidi support; verify every Hebrew prompt and option is stored in logical Hebrew order.

---

### G2 — Add an explicit distractor-quality check to every item

**Severity:** Medium  
**Applies to:** Q01–Q20  
**Reviewer checkbox:** ☐ recommended before approval

The existing inline checkboxes cover grammar, level, ambiguity, and notes. Add one more reviewer check:

```md
- [ ] Distractors are plausible but clearly wrong
```

A multiple-choice diagnostic is only useful if wrong answers are not absurd. Distractors should target common learner errors: gender agreement, preposition+pronoun fusion, construct-state definiteness, tense/aspect, register mismatch, and idiom literalism.

---

### G3 — Keep item-level responses local-only

**Severity:** High  
**Applies to:** v3.3.3 implementation, not item wording  
**Reviewer checkbox:** ☐ privacy invariant

The reviewer should not request item-level analytics unless the consent model is revisited. The quiz can send final score, CEFR band, standard error, completion time, and quiz version, but not selected answers per item.

**Implementation note:** item-level choices may exist transiently during the active quiz session for scoring and refresh recovery, but must be deleted after final score calculation.

---

### G4 — Add item replacement policy

**Severity:** Medium  
**Applies to:** review workflow  
**Reviewer checkbox:** ☐ process improvement

For any item rejected by the reviewer, replace it with another item at the same intended CEFR band. Do not simply delete it, because the 20-item distribution is part of the calibration design.

Recommended policy:

```md
If an item is rejected, replace it with a new item at the same CEFR band and approximate logit range. Re-run reviewer approval for the replacement only.
```

---

## Item-by-item annotations

## Q01 — A1 — Greetings

**Draft level:** A1  
**Draft difficulty:** likely near −2.5 to −2.0  
**Reviewer verdict:** APPROVE WITH MINOR CHECKS

- [x] Grammar: likely OK if the prompt tests a standard greeting such as שלום / בוקר טוב / ערב טוב.
- [x] Level: A1 is appropriate.
- [x] Unambiguity: likely OK if only one option matches the situation.
- [ ] Notes: verify that distractors are not culturally strange or too close in meaning.

**Comment:** A1 greeting items should avoid multiple socially valid answers. For example, both `שלום` and `בוקר טוב` can be valid depending on context. The prompt must clearly specify time or situation if the answer is time-specific.

**Recommended status:** keep, after context check.

---

## Q02 — A1 — Pronouns

**Draft level:** A1  
**Draft difficulty:** likely near −2.2 to −1.8  
**Reviewer verdict:** APPROVE WITH GENDER CHECK

- [ ] Grammar: verify gender/number agreement.
- [x] Level: A1 is appropriate.
- [ ] Unambiguity: depends on whether the prompt gives enough gender/number cues.
- [ ] Notes: ensure Russian/English glosses do not accidentally reveal the answer too directly.

**Comment:** Hebrew pronoun items are useful at A1, but they must explicitly disambiguate masculine/feminine and singular/plural. If the prompt uses a name, make sure the name is culturally/gender-clear or add context.

**Recommended status:** keep with gender/number cue verification.

---

## Q03 — A1 — Definite article

**Draft level:** A1  
**Draft difficulty:** likely near −1.8 to −1.4  
**Reviewer verdict:** APPROVE WITH FORM CHECK

- [ ] Grammar: verify `ה־` is attached correctly to the noun.
- [x] Level: A1/A2 borderline, acceptable as A1 if the item is simple.
- [x] Unambiguity: likely OK.
- [ ] Notes: avoid nouns whose pronunciation/spelling introduces unrelated complexity.

**Comment:** The definite article is appropriate for early diagnostic testing. If the item tests only definiteness, do not combine it with construct state or adjective agreement at this level.

**Recommended status:** keep.

---

## Q04 — A1 — Negation

**Draft level:** A1  
**Draft difficulty:** likely near −1.6 to −1.2  
**Reviewer verdict:** APPROVE WITH CONTEXT CHECK

- [ ] Grammar: verify use of `לא` vs `אין` if relevant.
- [x] Level: A1 is appropriate.
- [ ] Unambiguity: depends on whether the sentence is verbal or nominal.
- [ ] Notes: if the item contrasts `לא` and `אין`, it may be A2 rather than A1.

**Comment:** Basic negation with `לא` is A1. Nominal negation or `אין לי` patterns may push the item to A2. Keep the item simple if it is intended to close the A1 band.

**Recommended status:** keep if it tests simple verbal negation; otherwise move to A2.

---

## Q05 — A2 — Past tense

**Draft level:** A2  
**Draft difficulty:** likely near −0.9 to −0.5  
**Reviewer verdict:** APPROVE WITH BINYAN CHECK

- [ ] Grammar: verify tense/person/gender/number agreement.
- [x] Level: A2 is appropriate for common past-tense forms.
- [ ] Unambiguity: ensure only one option agrees with subject and context.
- [ ] Notes: avoid rare roots or irregular forms if the target is basic past tense.

**Comment:** This is a good A2 diagnostic item if it tests a common verb form. If it includes less common binyanim or irregular spellings, level may shift upward.

**Recommended status:** keep with morphology verification.

---

## Q06 — A2 — Possessives

**Draft level:** A2  
**Draft difficulty:** likely near −0.7 to −0.3  
**Reviewer verdict:** APPROVE WITH REGISTER CHECK

- [ ] Grammar: verify possession construction: `שלי/שלך` or construct + suffix.
- [x] Level: A2 is appropriate for `שלי`, `שלך`, `שלו`, `שלה`.
- [ ] Unambiguity: verify gendered possessive option cannot be interpreted differently.
- [ ] Notes: if suffixal possession is used, consider raising difficulty.

**Comment:** Possessives with `של` are A1/A2. Possessive suffixes or construct-state possession may be B1 depending on form.

**Recommended status:** keep if using common `של` forms.

---

## Q07 — A2 — Time expressions

**Draft level:** A2  
**Draft difficulty:** likely near −0.5 to −0.1  
**Reviewer verdict:** APPROVE WITH VOCAB CHECK

- [x] Grammar: likely OK if focused on time phrase selection.
- [x] Level: A2 is appropriate.
- [ ] Unambiguity: verify only one answer matches the time context.
- [ ] Notes: avoid mixing clock-time and relative-time skills unless intentional.

**Comment:** Time expressions are suitable for A2. The item should not depend on advanced number morphology unless that is the target.

**Recommended status:** keep.

---

## Q08 — A2 — Everyday vocabulary

**Draft level:** A2  
**Draft difficulty:** likely near −0.2 to +0.1  
**Reviewer verdict:** APPROVE OR REPLACE DEPENDING ON SPECIFIC WORD

- [ ] Grammar: depends on item text.
- [ ] Level: verify vocabulary frequency.
- [ ] Unambiguity: confirm distractors are not synonyms in some contexts.
- [ ] Notes: everyday vocabulary can be too subjective; use corpus/common ulpan syllabus terms.

**Comment:** “Everyday vocabulary” is broad. The reviewer should verify that the target word is truly expected by A2 learners and not regionally/slang-dependent.

**Recommended status:** keep if the word is syllabus-standard; otherwise replace with a more canonical A2 item.

---

## Q09 — B1 — Smikhut

**Draft level:** B1  
**Draft difficulty:** likely near +0.2 to +0.5  
**Reviewer verdict:** APPROVE WITH DEFINITENESS CHECK

- [ ] Grammar: verify construct-state form and definiteness marking.
- [x] Level: B1 is appropriate.
- [ ] Unambiguity: ensure distractors isolate smikhut error rather than vocabulary gap.
- [ ] Notes: if both smikhut and adjective agreement are tested, difficulty may rise.

**Comment:** Smikhut is a strong B1 diagnostic topic. The item must clearly test construct-state logic, not just memorized phrase recognition.

**Recommended status:** keep with grammar review.

---

## Q10 — B1 — Prepositions + pronouns

**Draft level:** B1  
**Draft difficulty:** likely near +0.4 to +0.7  
**Reviewer verdict:** APPROVE WITH PARADIGM CHECK

- [ ] Grammar: verify fused preposition+pronoun form.
- [x] Level: B1 is appropriate.
- [ ] Unambiguity: ensure subject/object reference is clear.
- [ ] Notes: add context if `לו/לה/להם/להן`, `אותו/אותה`, or `בו/בה` could be confused.

**Comment:** This is a good B1 item because learners often struggle with fused forms. However, the prompt must make the referent gender and number unambiguous.

**Recommended status:** keep.

---

## Q11 — B1 — Binyan recognition/use

**Draft level:** B1  
**Draft difficulty:** likely near +0.6 to +0.9  
**Reviewer verdict:** APPROVE WITH TARGET CLARIFICATION

- [ ] Grammar: verify binyan label and form.
- [x] Level: B1 is appropriate if common binyanim are used.
- [ ] Unambiguity: the item should test either meaning/function or form, not both vaguely.
- [ ] Notes: avoid rare roots that make the binyan opaque.

**Comment:** Binyan items can easily become too technical. For a diagnostic quiz, prefer functional recognition through a sentence rather than asking for abstract grammatical terminology unless the course explicitly teaches binyan names.

**Recommended status:** keep if tied to sentence meaning; revise if it asks only a metalanguage question.

---

## Q12 — B1 — Reading comprehension

**Draft level:** B1  
**Draft difficulty:** likely near +0.7 to +1.0  
**Reviewer verdict:** APPROVE WITH LENGTH CHECK

- [ ] Grammar: verify source passage is natural Hebrew.
- [x] Level: B1 is appropriate.
- [ ] Unambiguity: ensure answer is directly supported by text.
- [ ] Notes: keep text short enough for a 20-item diagnostic.

**Comment:** Reading comprehension is valuable, but one long passage can dominate time-on-task. Keep it concise and ensure the correct answer does not require world knowledge.

**Recommended status:** keep with passage length review.

---

## Q13 — B1 — Conditional

**Draft level:** B1  
**Draft difficulty:** likely near +0.9 to +1.2  
**Reviewer verdict:** APPROVE WITH LEVEL CHECK

- [ ] Grammar: verify conditional structure.
- [ ] Level: B1/B2 borderline depending on form.
- [ ] Unambiguity: ensure tense/modal logic is clear.
- [ ] Notes: if using counterfactual or literary conditional, raise to B2.

**Comment:** Simple real conditionals can be B1. Hypothetical/counterfactual conditionals may be B2+. Reviewer should confirm the exact construction.

**Recommended status:** keep as B1 only if simple real conditional.

---

## Q14 — B2 — Direct object marker את

**Draft level:** B2  
**Draft difficulty:** likely near +1.2 to +1.5  
**Reviewer verdict:** REVISE LEVEL OR COMPLEXITY

- [ ] Grammar: verify `את` appears in correct logical order, not reversed as `תא`.
- [ ] Level: basic `את` may be A2/B1; advanced use with definiteness/complex objects can be B2.
- [ ] Unambiguity: ensure only one noun phrase is definite and direct object.
- [ ] Notes: current topic label suggests possible RTL reversal.

**Comment:** The direct object marker itself is not necessarily B2. To justify B2, the item must test a more advanced contrast: definite vs indefinite object, object fronting, embedded clause, or subtle overuse/omission.

**Recommended status:** revise or re-level. If the item is just “choose את before a definite direct object,” move lower. If it tests a nuanced contrast, keep B2.

---

## Q15 — B2 — Register/formality ברצוני

**Draft level:** B2  
**Draft difficulty:** likely near +1.4 to +1.7  
**Reviewer verdict:** APPROVE WITH RTL + REGISTER CHECK

- [ ] Grammar: verify the word is stored as `ברצוני`, not reversed.
- [x] Level: B2 is appropriate for register/formality.
- [ ] Unambiguity: ensure distractors differ by register, not by meaning only.
- [ ] Notes: add context: formal email, official request, workplace setting.

**Comment:** This is a strong B2 item if it tests formal register. The context should clearly demand formal Hebrew; otherwise colloquial alternatives may also be acceptable.

**Recommended status:** keep after RTL and context review.

---

## Q16 — B2 — Idiom לרדת לפרטים

**Draft level:** B2  
**Draft difficulty:** likely near +1.6 to +1.9  
**Reviewer verdict:** APPROVE WITH IDIOM CLARITY CHECK

- [ ] Grammar: verify phrase is stored as `לרדת לפרטים`, not reversed.
- [x] Level: B2 is appropriate.
- [ ] Unambiguity: ensure correct answer is idiomatic meaning, not literal movement.
- [ ] Notes: distractors should include one literal trap but not multiple plausible idioms.

**Comment:** Good B2 topic. The item should test whether the learner recognizes the idiom “go into details,” not whether they know rare vocabulary.

**Recommended status:** keep.

---

## Q17 — B2 — Smikhut definiteness

**Draft level:** B2  
**Draft difficulty:** likely near +1.8 to +2.0  
**Reviewer verdict:** APPROVE WITH FULL GRAMMAR REVIEW

- [ ] Grammar: verify construct definiteness is correct.
- [x] Level: B2 is appropriate for nuanced smikhut definiteness.
- [ ] Unambiguity: ensure no alternative colloquial construction is equally acceptable.
- [ ] Notes: this may be one of the strongest B2 grammar items.

**Comment:** Good advanced grammar diagnostic. Make sure the answer does not depend on prescriptive-only rules if common modern usage permits another variant.

**Recommended status:** keep after expert grammar check.

---

## Q18 — C1 — Literary register

**Draft level:** C1  
**Draft difficulty:** likely near +2.1 to +2.3  
**Reviewer verdict:** CONDITIONAL APPROVAL

- [ ] Grammar: verify literary phrase is natural, not artificially archaic.
- [x] Level: C1 is plausible.
- [ ] Unambiguity: ensure the answer tests register recognition, not obscure vocabulary alone.
- [ ] Notes: C1 items should not become trivia.

**Comment:** Literary register can be C1, but the item must remain fair. If only native-like cultural exposure reveals the answer, it may not be suitable for an ulpan diagnostic unless the target course includes advanced reading.

**Recommended status:** keep only if reviewer confirms relevance to course goals.

---

## Q19 — C1 — Metaphor אבן יסוד

**Draft level:** C1  
**Draft difficulty:** likely near +2.3 to +2.5  
**Reviewer verdict:** POSSIBLY LOWER TO B2

- [ ] Grammar: verify phrase is stored as `אבן יסוד`, not reversed.
- [ ] Level: may be B2 rather than C1 depending on phrasing.
- [x] Unambiguity: likely OK if asking for metaphorical meaning “cornerstone/foundation.”
- [ ] Notes: determine whether this is common academic Hebrew or truly C1.

**Comment:** `אבן יסוד` is an important phrase, but it may not be C1 if used in a transparent context. Consider re-leveling to B2 or making the item more C1 by using a denser academic sentence.

**Recommended status:** reviewer decision required: keep C1 with harder context, or re-level to B2.

---

## Q20 — C1 — Advanced idiom לתפוס במילה

**Draft level:** C1  
**Draft difficulty:** likely near +2.5 to +2.7  
**Reviewer verdict:** APPROVE WITH IDIOM NATURALNESS CHECK

- [ ] Grammar: verify phrase is stored as `לתפוס במילה`, not reversed.
- [ ] Level: C1/B2 borderline depending on context and distractors.
- [ ] Unambiguity: ensure the intended idiomatic meaning is clear.
- [ ] Notes: avoid answer options that translate too literally from Russian.

**Comment:** This is a plausible high-level idiom item. The reviewer should confirm naturalness in modern Hebrew and decide whether it belongs at late B2 or C1.

**Recommended status:** keep if reviewer confirms C1 difficulty; otherwise re-level to B2/C1 boundary.

---

## Calibration audit notes

### Current distribution

| CEFR band | Items | Count | Reviewer note |
|---|---:|---:|---|
| A1 | Q01–Q04 | 4 | Good basic coverage; check ambiguity in greeting/negation. |
| A2 | Q05–Q08 | 4 | Good practical coverage; Q08 depends on exact vocabulary. |
| B1 | Q09–Q13 | 5 | Strong grammar/comprehension core; Q13 may be B1/B2. |
| B2 | Q14–Q17 | 4 | Strong but Q14 may be over-leveled unless nuanced. |
| C1 | Q18–Q20 | 3 | Acceptable for short quiz; Q19 may be B2 unless context is advanced. |

### Suggested difficulty adjustments

| Item | Draft band | Suggested action |
|---|---|---|
| Q04 | A1 | Move to A2 if it contrasts `לא` vs `אין`. |
| Q08 | A2 | Keep only if vocabulary is syllabus-standard. |
| Q13 | B1 | Move to B2 if conditional is hypothetical/counterfactual. |
| Q14 | B2 | Move lower unless direct-object usage is advanced/nuanced. |
| Q19 | C1 | Consider B2 unless context is academic/literary enough. |
| Q20 | C1 | Confirm whether C1 or high-B2. |

### Suggested replacement candidates if items are rejected

If a B2/C1 item is rejected, replacement topics can include:

- B2: concessive clauses with `למרות ש־`; formal request phrasing; embedded relative clauses; passive/impersonal phrasing.
- C1: dense academic connector usage; metaphor in argumentative text; idiom in context; register shift between journalistic and colloquial Hebrew.

---

## Consent coverage reviewer note

The planned five quiz fields can be treated as covered by the existing outcome path only if the consent template already describes assessment/outcome collection broadly enough.

Expected final payload fields:

```json
{
  "quiz_score_normalized": 0,
  "quiz_cefr_band": "A1|A2|B1|B2|C1",
  "quiz_se": 0.0,
  "quiz_completed_at": "ISO timestamp",
  "quiz_version": "ulpan_diagnostic_v1"
}
```

**Reviewer note:** no item-level answers should be submitted. If product wants to submit selected answers, per-item correctness, time per item, or raw item responses, that becomes a new collected field class and should trigger a new consent review.

---

## Recommended reviewer response summary

```md
Reviewer verdict: CONDITIONAL APPROVAL

Approved in principle:
- 20-item structure
- CEFR distribution 4/4/5/4/3
- use of quiz as parallel outcome path
- no item-level responses leaving device

Required before final sign-off:
- Verify RTL/logical Hebrew order in Q14-Q20 and all Hebrew options.
- Confirm Q14 level: direct object marker may be below B2 unless nuanced.
- Confirm Q19 level: אבן יסוד may be B2 unless context is advanced.
- Confirm Q13 level depending on conditional type.
- Add distractor-quality checkbox or equivalent review criterion.

Items likely approved after minor checks:
Q01, Q02, Q03, Q05, Q06, Q07, Q09, Q10, Q11, Q12, Q15, Q16, Q17, Q18, Q20.

Items needing level/rewrite decision:
Q04, Q08, Q13, Q14, Q19.
```

---

## Final sign-off status

- [ ] All Hebrew strings verified in logical order
- [ ] All 20 grammar checks completed
- [ ] All 20 level checks completed
- [ ] All 20 ambiguity checks completed
- [ ] Distractor quality checked
- [ ] Required item rewrites merged
- [ ] Difficulty logits adjusted after reviewer notes
- [ ] Calibration audit log updated
- [ ] Ready for C1 JSON schema build

**Current status:** not final sign-off; ready for domain reviewer reconciliation.
