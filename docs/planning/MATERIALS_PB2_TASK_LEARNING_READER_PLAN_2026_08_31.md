# MATERIALS-PB2 Task Learning Reader — implementation plan

Status: `OWNER_APPROVED · GOAL ACTIVE · IMPLEMENTATION AUTHORIZED`

Date: 2026-08-31
Corpus: `materials-science-year1-problem-book-2`
Production baseline at approval: edition 2, 60 tasks, 693 condition rows,
1,919 reviewed solution rows, zero published audio assets.

## 1. Product decision

The Reading Room will treat a Materials task as one learning document with two
separate immutable truth layers:

1. the published condition snapshot;
2. the exact-edition reviewed solution derivative.

The learner stays in the Reading Room and moves between `Condition`, `Solution`,
and `Condition + solution`. Hebrew words in both the plain and vocalized Hebrew
columns use the existing shared `ReaderMorph`/`MorphHost` stack. Studio remains
an editing surface, not a required detour for reading or morphology.

The implementation must not copy solution text into the condition snapshot,
publish a second solution work, or create a second morphology resolver.

## 2. Single user journey

`open task -> attempt/short answer -> open reviewed solution -> tap Hebrew word
-> inspect morphology -> optionally mark/save -> close -> return to the same
word and row`

Required continuity:

- the task, edition and solution revision remain visible;
- closing a word card restores focus to the activated token;
- refreshing or reopening an anchored solution returns to its exact `row_id`;
- opening or tapping does not write `review_log`; only an explicit grade can;
- a word encountered in a solution must never be attributed to the condition
  text key.

## 3. Visual direction

Subject: a first-year engineering student learning exam-ready Hebrew through a
reviewed Materials Science derivation. The page's single job is to let the
student follow and interrogate the derivation without leaving the task.

### Tokens

- `Metallurgy teal #0F6F74`: verified learning action and section continuity.
- `Tempering amber #C07C21`: answer/review boundary and cautions.
- `Graphite #172033`: primary technical text.
- `Steel mist #E7EEF0`: table structure and quiet separators.
- `Paper #FBFCFD`: reading surface.
- `Error oxide #A53A32`: real errors only, never decoration.

Typography continues the current deliberate pairing: Georgia for the task and
solution hierarchy, Arial/Noto Sans Hebrew for Hebrew prose, Cambria Math for
formulae, and system UI for controls and provenance. No new font dependency is
introduced.

### Layout and signature

Desktop keeps the verified five-column solution table. At 380 px each row
becomes a vertical learning block in the order Hebrew, vocalized Hebrew,
transliteration, Russian; horizontal page scrolling is forbidden.

The signature element is a quiet vertical **derivation rail** beside the step
column. It is not decoration: its labels and state encode `answer -> theory ->
given/find -> model/laws -> derivation -> calculation -> construction -> check
-> final`. It gives long solutions a stable engineering narrative without
turning every section into a generic card.

The visual risk is deliberately limited to this rail. All other chrome remains
calm and consistent with the shipped Materials viewer.

## 4. Interaction architecture

`ReaderMorph.attach()` becomes a backwards-compatible morphable-table adapter.
The default path remains the existing `#proTable` reader. A caller may supply:

- a Hebrew-cell selector;
- a row resolver;
- plain/vocalized column names;
- a stable occurrence builder;
- a sentence-context builder.

Materials solution tables pass their exact reviewed rows. Only `he` and
`he_niqqud` cells become morphable. Russian, transliteration, formula-only
tokens, units and Latin symbols do not.

Keyboard interaction uses roving focus inside a Hebrew cell rather than adding
every word to the global Tab sequence. Enter/Space opens the active word;
Left/Right follows visual Hebrew word order. Escape closes the word card first;
a second Escape may close the Task Learning Reader.

## 5. Immutable solution-source anchor

Each solution occurrence is constructed only from an already validated
learning-support payload:

```text
source_kind       = reviewed_solution
corpus_slug       = materials-science-year1-problem-book-2
edition_id
edition_number
edition_manifest_sha256
public_work_id
snapshot_sha256
derivative_sha256
task_id
row_id
row_order
word_offset
surface
```

The anchor is invalid if any exact-edition field is absent or if `row_id` does
not resolve in the currently validated derivative. Invalid anchors remain
read-only morphology: no occurrence/source write and no false fallback to the
condition text key.

The canonical word note and `review_log` remain unchanged domains. The
solution anchor is provenance for an encounter, not a second word or memory
truth.

## 6. TTS contract and current stop boundary

The target reader has one row-audio contract for both condition and solution:

- per-row play;
- continuous `Condition`, `Solution`, and `Condition + solution` sequences;
- synthesis from reviewed `he_niqqud`;
- word-level timings and karaoke over the vocalized line;
- one corpus-edition voice/rate/pitch profile;
- mutual exclusion between row audio and word-card pronunciation.

Formulae remain visually exact. A formula row may be synthesized only from its
separately reviewed `spoken_he_niqqud`; karaoke follows that spoken line, never
raw mathematical symbols.

Current production authority remains `ZERO_AUDIO`. This implementation may
carry and validate the TTS-ready contract, but it must not generate, publish,
stream, or expose controls for absent solution audio. Full TTS, timings and
audio publication require a separate owner approval after card review and
voice-profile selection.

## 7. Truth and write boundaries

- Public condition snapshot: unchanged.
- Reviewed solution derivative: read-only, exact-edition-bound.
- Public GET routes: no writes.
- Word notes/status/FSRS: existing local learner writers only.
- Plain word tap: no `review_log` write.
- Opening/closing/switching view: no learner-state write.
- No B9 assignment, curator, forum, comment or agent-authority work.
- No LLM call is required; optional Dicta context retains the existing consent.

## 8. Acceptance gates

### Contract and regression

1. Existing `#proTable` morphology behavior remains byte-compatible in effect.
2. Both Materials Hebrew columns expose the same lemma/card for the same
   vocalized token.
3. A solution occurrence carries the exact derivative anchor and never the
   condition text key.
4. Formula-only rows are not wrapped as Hebrew words.
5. Open/tap/view-mode actions leave `review_log` unchanged.
6. Audio controls remain absent while `full_tts_generated=false`.
7. Printing contains plain text without interactive token chrome.

### UI and accessibility

- desktop RU;
- 380x844 RU;
- 380x844 HE RTL;
- 320 CSS px equivalent / 200% reflow;
- no horizontal page overflow;
- 44 px primary controls;
- roving token focus, visible focus, correct focus return;
- first Escape closes morphology only;
- reduced-motion and print checks;
- no page errors or failed public payloads.

### Evidence separation

`LOCAL_TEST`, `ISOLATED_BROWSER`, `PRODUCTION_ANONYMOUS`, `OWNER_REPORTED`,
`PHYSICAL_DEVICE_AT`, and future `TTS_OWNER_ACCEPTED` remain separate rows.

## 9. Release sequence

1. Red contract tests.
2. Generic ReaderMorph adapter without changing default Reader behavior.
3. Materials Task Learning Reader integration and exact anchor validation.
4. Focused morphology/Materials/i18n/cache tests.
5. Desktop/380/RTL browser screenshots and adversarial R1-R17 review.
6. Allowlisted commit and push.
7. Repeated target-version production health plus anonymous task/solution
   verification.

No audio generation or publication is part of this release.

## 10. Stop conditions

Stop before mutation or release if:

- exact edition/snapshot/derivative identity cannot be proven;
- morphology requires a fork of `ReaderMorph` or `MorphHost`;
- solution taps would persist the condition source key;
- formula speech would be inferred from raw symbols;
- viewing writes learner or review truth;
- mobile requires horizontal page scrolling;
- current zero-audio rights are interpreted as full-TTS authority;
- an unrelated dirty-tree file would need to be staged.

## 11. Local implementation record

Implementation target: `3.11.452`.

Completed in the first vertical slice:

- the existing `ReaderMorph` gained a backwards-compatible table adapter and
  roving Hebrew-token focus; the default `#proTable` path remains unchanged;
- both condition and reviewed-solution Hebrew columns use that shared adapter;
- each solution encounter is bound to the exact edition, manifest, work,
  snapshot, derivative, task, row, order and word offset;
- `MorphHost` accepts such an encounter only through the explicit verifier and
  fails closed without relabelling it as the currently open condition;
- URL continuity stores the task view and exact solution `row_id`;
- the Materials viewer exposes no audio control while
  `full_tts_generated=false`, while retaining the condition-and-solution row
  audio contract for the separately approved future TTS phase;
- the task viewer, morphology sheet and first-Escape/focus-return behavior are
  composed as one accessible dialog stack;
- desktop, 380 px RU, 380 px HE RTL and 200% reflow use the derivation rail and
  contain no horizontal page overflow.

### Local evidence

- `LOCAL_TEST`: 99/99 focused Room/Materials/morphology/release tests passed;
- `LOCAL_TEST`: 233/233 i18n checks passed;
- `LOCAL_TEST`: all 1,919 reviewed solution rows and all 14,941 Hebrew word
  positions round-trip through the exact derivative verifier; 11,836 positions
  also have an unambiguous future audio-token coordinate and the rest remain
  safely `null`;
- `ISOLATED_BROWSER`: 60 tasks, 693 condition rows, zero audio assets, 270
  morphable tokens in task 1, zero invalid roving-focus cells, zero tiny
  controls, zero page errors and zero failed public responses;
- `ISOLATED_BROWSER`: opening and closing morphology changed `review_log` by
  zero, first Escape closed only morphology, focus returned to the word, and a
  reload restored the exact anchored row;
- `ISOLATED_BROWSER`: study and exam print variants were generated without
  interactive word chrome.

The repository-wide test run reached 1,232 tests: 1,226 passed. One in-scope
stale release lock was corrected. Six unrelated pre-existing contract/implementation drifts
remain in Classic Mode, Add Material and Room Library IA tests; comparison with
`HEAD` proves their missing contracts predate this slice. They are recorded as
baseline debt and are not broadened into this allowlist.

### R1-R17 adversarial review

- R1/R10/R11: morphology claims remain provenance-labelled; invalid derivative
  anchors cannot fall through to condition truth or a review-log source key;
- R2/R8/R17: reading and morphology are available before grading; ordinary
  open/tap/view actions are write-free;
- R3/R9: task, solution revision and exact row survive refresh without a second
  progress or solution store;
- R4/R5/R6/R7: responsive/RTL/reflow, 44 px controls, roving focus, focus return,
  reduced motion and print behavior are explicit and browser-verified;
- R12/R13: one `ReaderMorph`, one `MorphHost`, one immutable derivative and no
  copied solution snapshot;
- R14/R15: public reads remain anonymous/read-only; learner writes remain the
  existing explicit local writers; optional context morphology retains consent;
- R16: no LLM or provider call is added to opening the task or solution; the
  morphology dataset remains lazy.

Production and owner-live evidence are deliberately not inferred from these
local gates. They are added only after the scoped release is served and tested.
