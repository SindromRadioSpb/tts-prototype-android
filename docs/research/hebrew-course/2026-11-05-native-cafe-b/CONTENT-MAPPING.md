# Native café B: content mapping and limits

Date: 2026-11-05. Base commit: `d3ad49e427482a9f87bc51d6b0b12684ce8d452c`.
Local pilot on `pilot/cafe-b`; not committed, pushed, merged or deployed by this content task.
Scope: `content/course/ulpan-cafe-b-pilot/**`. No existing `ulpan` lesson or progress is changed. This is an adaptation of Codex B alone, not a combination with A.

## Source and provenance

The parent materialized the selected Library package through its supported workflow and verified package identity. Content was read from `hebrew-course-strategy-and-exemplars-sol-ultra-2026-11-05/cafe_b`. SHA-256 of the four relevant source files:

- `student.ru.md`: `c428644244e6f4d94b297b829966e9a0f25d3e38bc45f0d26ff105d6550f7a37`
- `teacher-key.ru.md`: `f61ec619d8e0d905b96c0321f968ff64f99162de34a97c9e874bc213bf0b5ae0`
- `lesson-manifest.json`: `879e134351a652f9ee9273534712962659f330cdc8c1a9d3878f18971c8c3acf`
- `review-and-assessment.ru.md`: `803436ed81b9a7c83015592c41fa47ce7978aad87bb2f479e6f9efecbf74c7ac`

B's lexical source references and limited author review remain source provenance, not a fresh independent linguistic review of this native adaptation. The original author explicitly leaves human review, tested audio, measured duration and pedagogical efficacy unverified. The same limits apply here.

## Entry contract and exposure

`course.json` uses course ID `ulpan-cafe-b-pilot`, `preknown: []`, and lessons `B000-foundations`, `B001-cafe`. All content-owned lesson, lexical, turn, task, option, grammar and flow IDs have stable B prefixes. Scene roles in both modules use the native `staff` / `learner` keys so the reader displays localized role labels rather than raw custom IDs. No legacy lesson, task or lexical IDs are reused.

B000 explicitly teaches the original 14 prerequisite lexical units. The two readings of רוצה are represented by base `B-P07` (רוֹצֶה) and form `B-P07-f` (רוֹצָה), not counted as two lemmas. It teaches יש/אין availability and לא negation, then gives 7 atomic diagnostic/self-check tasks. B's five-part entry diagnostic is split to keep both רוצה readings separately visible. The final retry changes setting to a visit to someone's home. This is limited transfer practice, not proof of reading proficiency. Alphabet instruction is outside this pilot and is explicitly identified as needed if the learner cannot yet read the letters.

B001's first displayed step directs beginners back to B000 using “К урокам”. Neither course order nor completion is called proof of mastery. Reviews list all prerequisite IDs so the checker can parse them; that technical accessibility is not learner-state evidence.

The 8 main target lemmas remain exactly B-W01–B-W08: coffee, tea, milk, sugar, with, without, small, large. No new receptive lemmas, new adjective forms, takeaway language, article, conjunction or replacement preposition is added. “Small/large” concern serving volume of coffee and tea, not a numerical count of drinks or water agreement.

Exposure uses the optional `flow.steps[].metLexIds` extension. Foundation groups expose 5 + 4 + 5 lexical units (the feminine form accompanies the middle group). Main groups expose 4 + 4. All other steps explicitly have `metLexIds: []`; opening the lesson does not mark its entire word list encountered.

All 14 prerequisite units, both רוצה readings, and the 8 target lemmas have visible Cyrillic reading supports directly in their first-exposure grammar bodies; they do not depend on a separate lexicon-table UI. The route/first main vocabulary step explicitly calls this temporary, approximate reading support, not an audio model or pronunciation assessment. Sentence examples retain Hebrew without mandatory transliteration.

## Mapping of B's instructional sequence

| Source | Native treatment |
| --- | --- |
| B-E01 | B000: explicit teaching followed by recognition, two separate רוצה forms, greeting/thanks and a new availability retry. |
| First four nouns / request frame | `B-first-four`; noun meanings, masculine gender, full/plain sugar spellings, and newly taught אפשר … בבקשה. |
| B-E02 | Separate availability sign; comprehension choices, then self-checked question and answer. It does not reveal visitor preference. |
| B-E03 | Recall four nouns after another task; coffee and tea requests checked as slot meanings; negated preference self-checked; additional recall before second group. |
| Second four / B-E04 | Explicit composition and size explanations; four contrast choices, followed by unprompted written recall with a hidden model. Recognition is not called retrieval. |
| B-E05 | Existing tiles assembly, free typed order, contextual size answer and four-field order card. Assembly evidence is not free production. |
| B-T01 / B-E06 | Original ten-turn dialogue, delayed until after teaching. Choices check initial order, limited lack of large tea, preserved size/no sugar, added milk, erroneous sugar confirmation, and unknown preparation status. |
| B-E07 | Eight-word retrieval after dialogue comprehension, different order composition and contextual size repair. |
| B-T02 / B-E08 | Independent written note, separate from the scene. Select exact order, explain distractor differences, identify unknown availability, and reconstruct order. |
| B-E09 | Availability versus request condition, repair condition, accept correct confirmation without assuming every confirmation is wrong, repair size. |
| B-E10 | K branch in separate native task steps: initial order → unavailable coffee → tea replacement preserving size and both conditions → size clarification → correct confirmation. Future task cues are not in the initial scene. T is an alternative source branch, not added to this linear pilot. |
| B-E11 | Open personal-order exercise and known-change solo rehearsal, explicitly self-checked against the learner's own four fields. An example is not a required taste. |
| B-E12 | Transfer to a seminar counter: ask for water first, then reveal its absence, request small tea with sugar/no milk, accept confirmation and explain availability facts. No unfamiliar Hebrew vocabulary is added for setting. |
| B-E13 | Prompted real break, new order, limited absence comprehension, full-composition repair and independent availability/offer. Actual elapsed time is not claimed. |
| R00/R01/R03/R07/R14/R30 and D07/D30 | Added in the later approved scope as optional `course.reviewPlan`, separately from the unchanged two lesson files. Full source schedule and separate rubric dimensions are preserved; keys are intended to remain hidden until the whole session is answered. See the review-plan section below. |

B001 has 45 atomic tasks, not a claim to the original 13-task timing. The source's two 20–25-minute sessions are not presented as measured duration for this native expansion. No optional summary page claims universal mastery.

## Honest assessment boundaries

Every task supplies `evidenceLexIds`. Choice, free semantic self-check and tiles assembly use `[]`. Machine-checked free orders list only required slot values. Confirm repairs list only changed slots, not all original conditions or every introduced word. Merely knowing the lexicon ID or opening a lesson is not evidence of successful production. This depends on the evidence extension implemented separately, not on a content-side workaround.

Free semantic outputs have no `spec`; the unchanged checker returns `unknown` and the reader offers its model/self-check path. Prompts say what to compare, and self-check is not called independent assessment. This covers vocabulary lists, question/answer about availability, negated wishes, own preference, correct confirmations with multiple natural forms, and extended repair/offer tasks. The reader's existing self-check button records a supported self attempt; it does not assess the Russian explanation or spoken performance.

The original checker rejects a full correct repetition when a confirmation already matches its card, even though the teacher key permits the repetition. Those tasks intentionally use self-check rather than enforcing a yes-only answer. Full repairs beginning with discourse לא can also be misread as slot negation in an `order` task, so B-E13-3 is self-check. These are known limitations, not reasons to loosen semantic correctness.

A further baseline semantic limitation was reproduced: the order checker accepted `אני לא רוצה קפה גדול עם חלב` for B-E05-2, because it did not recognize the scope of negation before רוצה. Final integration adds the optional `spec.requestOnly` guard to the pilot's order, short and confirm specs. Negated wishes, availability statements and meaning questions now return `unknown`; normal requests and leading-לא corrections remain accepted. The guard does not change unflagged legacy tasks and is not a general language-understanding claim. See the integration report and regression tests.

## Validation evidence

Run from the worktree:

- `npm run course:validate -- content/course/ulpan-cafe-b-pilot --json`
- Result after authored content: 0 errors; 23 `REAPPEAR_PENDING` warnings (15 foundation IDs including the feminine form, plus 8 main target lemmas). Two lessons cannot meet the validator's three-following-lesson horizon. This does not prove adequate spaced repetition.
- Every authored model attached to a machine spec was assessed using the existing CourseChecker and accepted.
- 13 focused checks passed: natural short order, אני רוצה order, wrong size, reversed adjective order, missing milk, short/full confirmation repair, incorrect yes, absence not replacing a request condition, preserved replacement, wrong replacement condition, and transfer condition inclusion/exclusion.
- These are local automated format/checker checks, not user trials, human linguistic acceptance, audio listening, production deployment, or owner-data evidence.

No `media`, `audioTurnId`, listening channels, image/animation files or audio manifests are included. Explicit Google Wavenet role names satisfy the format contract only; no speech asset has been created or accepted.

## Authored help refinement after browser QA (O-146)

All 52 tasks now carry two distinct Russian `hints` (7 foundation tasks, 45 café tasks; 104 hints total). First hints identify the relevant strategy or contrast; second hints give a more concrete lexical, grammatical or semantic scaffold. They adapt B's recovery guidance: isolate a lost condition, name the four fields in Russian, distinguish availability from preference, compare only the changed field, and separate recognition from recall. Source B supplies recovery principles rather than these exact two-click UI strings; the hint wording is newly authored for this pilot.

Vocabulary recall hints provide category/initial-sound support rather than simply copying the full hidden model. Choice-task second hints may make the correct distinction explicit; this is assisted practice, not an unassisted result. Correct confirmations are not treated as mandatory errors. Open personal choices remain the learner's own choices. B-E10-K0 does not reveal the later availability message, and B-E12-1 does not reveal the later absence of water. Later branch hints use only the current cue and already-established card.

This refinement changes only task `hints` and this mapping. A structural comparison after removing `hints` confirmed all other course fields unchanged, including IDs, task order, specs, exposure/evidence scopes and models. It does not reset or edit learner progress. Validation again returned 0 errors and the same 23 `REAPPEAR_PENDING` warnings. All 17 machine-spec authored models still returned `accepted`. Every task has exactly two nonempty, different hints; all 52 pairs are distinct. Browser re-QA of actual first/second-click presentation is a separate integration check, not claimed by this content pass.


## Full optional B review plan (later approved scope)

`course.reviewPlan` now contains `id: cafe-b-review-v1`, version 1, anchored to `B001-cafe`. This addition leaves `course.lessons`, preknown, the lexicon, and both lesson files unchanged. It does not add review tasks to the lesson sequence or reuse legacy lesson/task IDs. The runtime/store integration and its gating are owned separately.

The eight sessions preserve the source schedule relative to the actual initial lesson attempt: R00 at day 0 after another activity; R01 +1; R03 +3; D07 before R07 at +7; R14 +14; D30 before R30 at +30. `requiresActivityBreak` is explicit for R00; `after` is explicit for R07 and R30. Session ordering also places each D before its corresponding R. These are authored target intervals, not proof of a measured retention effect or a notification automation.

There are 123 tasks: each of six R sessions has 8 lexical retrieval tasks, 4 separate noun-gender tasks and 3 action tasks (15 each); D07 has 16 and D30 has 17. D30 action 2 is split into `2-facts` and `2-order` to preserve five-fact comprehension separately from four-field production. The eight lexical permutations match the source exactly. Gender checks follow all eight retrievals and use Russian prompts so they do not reveal a later lexical answer. Each lexical and gender response alone has a bounded `accepts` list; no open action has `accepts` or pretends to be automatically judged.

Each task has a full Russian key containing the exact answer, an example or allowed variants, and the criterion meaning. Hebrew examples may be unvocalized. All action assessment is honest self-rubric assessment. The dimensions remain separate:

- Each R: lexical /8, gender /4, actions /3. Each action point requires all of that action's conditions.
- D07: lexical /8, gender /4, comprehension /5 (four fields plus inference), replacement /4, repair /1, staff role /2 (report and offer).
- D30: lexical /8, gender /4, initial order /4, comprehension /5, replacement /4, confirmation /2 (reaction and explanation), staff role /2.

Repeated rubric IDs across a session's atomic tasks identify the same dimension; there are no duplicate criterion IDs within one task. No overall compensating mastery percentage is authored. Source working thresholds are not represented as a validated pass certificate. Listening and pronunciation remain untested, and actual delay, help, other encounters and self-corrections must be distinguished by the separate runtime.

R14 and D07 notes live in their own task `stimulus`, separate from prompt and hidden key. R14 tells the learner to close the note before reconstruction; D07 explicitly requests one reading followed by closure. Subsequent request tasks do not embed the note again. D30's five-fact message appears only in `2-facts`, not its first order or following `2-order`. Keys must remain hidden until the entire session. The content structure enables this but does not itself prove browser gating.

All 18 R actions additionally have a new `repair: {prompt:{ru}, key:{ru}}` exercise. Repairs vary the drink or serving size while retaining the relevant additive conditions, rather than flipping both with/without at once. Availability/condition practice is reapplied in a new drink context. R30 repairs depend on the learner's own card, not an imposed example. Repairs are explicitly practice after review; they do not erase the first error or become a new independent control merely through a new phase. No D repair is mislabeled a new unseen assessment. Reusing an already exposed D is explicitly practice and requires separately authored new material for an independent control.

Content verification: `node --test tests/courseCafeBReviewContent.test.js` checks all eight schedules, exact lexical permutations, separate gender coverage, the source rubric maxima, 123 unique task IDs, complete keys, bounded accepts, separate late stimuli, own-choice R30, and 18 repair tasks with no pretend D versions. `npm run course:validate -- content/course/ulpan-cafe-b-pilot --json` remains a separate format check. Browser timing, hidden-key enforcement, persistence, and recovery require integration tests and browser QA; this content report does not claim them.
