# Room Trainer T4b — Option Fairness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a multiple-choice item from giving its answer away by shape, and stop the reveal from looking like a bug when it does the right thing. Plus record, in the canon, that the sentence translation and audio are structural rather than transitional.

**Architecture:** One mechanism serves both fixes. The trainer records the text it actually displayed as the correct option; the reveal then names the relation between that text and the sentence form when they differ. The B1 distractor path additionally strips a leading proclitic from the displayed correct option, which is safe because multiple-choice grading is by flag, never by string.

**Tech Stack:** Vanilla ES5-style UMD JavaScript, Node 20 gates, Playwright for screenshots.

## Global Constraints

- Assessment of record: `docs/planning/ROOM_TRAINER_FORM_CONTRACT_ASSESSMENT_2026_09_03.md`. This wave takes **P5, P4 and P6 only** — the owner's decision of 2026-09-03.
- **Explicitly out of scope: P1, P3, P7.** The owner's scaffolds already carry the required-form information for him, and adding a form label to every prompt would make the product worse for him, not better. Do not "improve" the prompt.
- **P2 stays open by decision, not by oversight.** Tightening the `read` grader before P1 would make it as unanswerable as `dictate`. It is recorded as a known limitation with a consequence for T4's numbers.
- **No scheduling-semantics change, no migration, no new module.** Grading logic is untouched: MC correctness is already flagged, so changing the displayed text cannot change a verdict.
- New UI strings land in all three locales; **check for a key of the same name in the SAME object first**.
- **Release moves SIX version stamps.** Check prod `disk_pct_used` before pushing.
- Baseline runtime: `3.11.460`.
- Gates green at every commit: `smoke:train-queue`, `smoke:retention-report`, `smoke:fsrs`, `smoke:memory-canon`, `smoke:room-training-premium`, `smoke:studio-room-srs`, `smoke:reader-morph`, `smoke:i18n`.

## What was measured before planning

Both multiple-choice paths were read out of `library-ui.js`:

- **slot path** (`buildMcSlotOptions`): all four options are bare slot forms by design, so the correct one carries no proclitic tell. Sound — and the source of P4, because the learner picks `שִׁיר` and the reveal shows `הַשִּׁיר`.
- **B1 fallback** (`pickDistractors`): the correct option is `built.cz.answer`, the full surface token **including its proclitic**, while the distractors are citation forms. When the target carries `ה`, `ב`, `ל`, `ו`, `כ`, `ש` or `מ`, the correct answer is identifiable **without knowing the word**, and every such success is written to `review_log` as genuine recall and lengthens the interval.

**Honest residue, not fixed here.** Stripping addresses the *proclitic* tell. A target that differs from the citation form by a **suffix** (`קְבִיעָתְךָ` against `קְבִיעָה`) still stands out in the B1 path, and a suffix cannot be stripped without changing the word. The owner's reported cases were proclitic ones; broadening to a tiles fallback would cut how often multiple choice appears, which he explicitly likes. Recorded, not speculatively fixed.

---

### Task 1: Export the vocalized proclitic stripper

**Files:**
- Modify: `public/js/reader-morph.js`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Produces: `ReaderMorph.dropProclitic(vocalized) -> string` — drops a leading proclitic letter together with its combining marks, or returns the input unchanged.

`_dropProcliticNq` already exists and is used by `findSlot`; it is exported rather than reimplemented so the trainer and the morphology agree on what a proclitic is.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final report block:

```js
// ── Suite 19: proclitic stripper is shared, not reimplemented (T4b) ──────────
const RM4b = require(path.join(ROOT, "public/js/reader-morph.js"));
check(typeof RM4b.dropProclitic === "function", "the vocalized proclitic stripper must be exported");
check(RM4b.dropProclitic("הַשִּׁיר") === "שִּׁיר", "a leading ה and its vowel must go, got " + RM4b.dropProclitic("הַשִּׁיר"));
check(RM4b.dropProclitic("וְאָמַר") === "אָמַר", "a leading ו and its vowel must go");
check(RM4b.dropProclitic("קְבִיעָתְךָ") === "קְבִיעָתְךָ", "a word with no proclitic must come back untouched");
check(RM4b.dropProclitic("") === "", "an empty string must not throw");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — `dropProclitic` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `public/js/reader-morph.js`, add `dropProclitic: _dropProcliticNq,` to the exported API object, next to `findSlot`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:train-queue && npm run smoke:reader-morph`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/reader-morph.js scripts/premium/train-queue-smoke.js
git commit -m "feat(room): export the vocalized proclitic stripper for the trainer to share"
```

---

### Task 2: P5 — remove the proclitic give-away from the B1 option

**Files:**
- Modify: `public/js/library-ui.js` (`renderTrainItem`, the `mode === 'mc'` branch)
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `ReaderMorph.dropProclitic` (Task 1).
- Produces: `s._optionHe` — the text actually displayed as the correct option, recorded on the session for Task 3.

Safe by construction: the grid already sets `data-correct` per option and `onTrainOption` reads that flag, so the displayed string never participates in the verdict.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js`:

```js
// ── Suite 20: no proclitic give-away in the B1 option path (T4b / P5) ───────
const mcBranch = (room.match(/if \(mode === 'mc'\)[\s\S]*?body\.appendChild\(grid\);/) || [""])[0];
check(mcBranch.length > 0, "the multiple-choice branch must be locatable");
check(/dropProclitic/.test(mcBranch),
  "the B1 correct option must have its leading proclitic stripped — otherwise it is the only option "
  + "carrying ה/ב/ל and is identifiable without knowing the word");
check(/_optionHe/.test(mcBranch), "the displayed correct option must be recorded for the reveal");
// The verdict must still come from the flag, never from the string we changed.
const optHandler = (room.match(/function onTrainOption[\s\S]*?\n}\n/) || [""])[0];
check(/data-correct/.test(optHandler), "multiple-choice correctness must stay flag-based, not string-matched");
check(!/cz\.answer/.test(optHandler), "the option handler must not compare against the sentence form");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL on the `dropProclitic` and `_optionHe` checks.

- [ ] **Step 3: Write minimal implementation**

In `public/js/library-ui.js`, replace the `opts` construction in the `mc` branch:

```js
    // P5 — in the B1 path the correct option was the full surface token, proclitic included, while
    // every distractor was a citation form. A target carrying ה/ב/ל/ו/כ/ש/מ was therefore
    // identifiable WITHOUT knowing the word, and each such success was written to review_log as
    // genuine recall and lengthened the interval. Stripping is safe: the grid flags correctness
    // per option (data-correct) and onTrainOption reads the flag, never the string.
    // Residue, deliberately not chased here: a target differing from the citation form by a
    // SUFFIX still stands out, and a suffix cannot be stripped without changing the word.
    const RMx = window.ReaderMorph;
    const bareCorrect = (RMx && RMx.dropProclitic) ? RMx.dropProclitic(built.cz.answer) : built.cz.answer;
    const opts = slotMc
      ? [{ he: slotMc.correctHe, correct: true }].concat(slotMc.options.slice(0, 3).map((he) => ({ he, correct: false })))
      : [{ key: item.lemmaKey, he: bareCorrect, correct: true }].concat(
          distractors.map((d) => ({ key: d.lemmaKey, he: d.niqqud || d.surface, correct: false })));
    // Recorded so the reveal can name the relation when the option and the sentence form differ.
    s._optionHe = opts[0].he;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run smoke:train-queue && npm run smoke:room-training-premium && npm run smoke:studio-room-srs`
Expected: all PASS. The last two exercise a real multiple-choice answer end to end, so a broken verdict would surface there.

- [ ] **Step 5: Commit**

```bash
git add public/js/library-ui.js scripts/premium/train-queue-smoke.js
git commit -m "fix(room): stop the multiple-choice option giving its answer away by proclitic"
```

---

### Task 3: P4 — name the relation between the option and the sentence form

**Files:**
- Modify: `public/js/library-ui.js` (`renderTrainReveal`)
- Modify: `public/library.html` (CSS)
- Modify: `public/i18n/locales/{ru,en,he}.js`
- Modify: `scripts/premium/train-queue-smoke.js`
- Modify: `scripts/premium/train-queue-shots.js`

**Interfaces:**
- Consumes: `s._optionHe` (Task 2).
- Produces: a reveal line shown only when the displayed option differs from the sentence form.

This covers both paths with one mechanism: the slot path, where all options are bare slot forms by design, and the B1 path after Task 2's strip.

New locale key, checked for collision first: `answerInText`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js`:

```js
// ── Suite 21: the reveal names the option→form relation (T4b / P4) ──────────
check(/room\.morph\.study\.answerInText/.test(room), "library-ui must use the answerInText string");
localeSrc.forEach((L) => check(/\banswerInText\s*:/.test(L.src), `locale ${L.name} must define answerInText`));
const revealBody = (room.match(/function renderTrainReveal[\s\S]*?\n}\n/) || [""])[0];
check(revealBody.length > 0, "renderTrainReveal must be locatable");
check(/_optionHe/.test(revealBody), "the reveal must know which option text was shown");
check(/room-train-ansfrom/.test(revealBody), "the relation must have its own element to style");
check(/!==\s*built\.cz\.answer|built\.cz\.answer\s*!==/.test(revealBody),
  "the relation must appear only when the option and the sentence form actually differ");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL on all six.

- [ ] **Step 3: Add the locale string**

Confirm no collision: `grep -n "answerInText" public/i18n/locales/ru.js` must print nothing. Then add to each locale's `study:` object:

- `ru.js`: `answerInText: "в тексте: {form}",`
- `en.js`: `answerInText: "in the text: {form}",`
- `he.js`: `answerInText: "בטקסט: {form}",`

- [ ] **Step 4: Write minimal implementation**

In `renderTrainReveal`, directly after the `ansRow` is appended:

```js
  // P4 — the option the learner picked is deliberately NOT the sentence form: slot options are
  // bare by design so the correct one carries no inflection tell, and P5 strips the proclitic in
  // the B1 path for the same reason. Correct behaviour that reads as a bug unless it is named,
  // so name it instead of "fixing" it by putting the tell back.
  if (s._optionHe && built.cz.answer && s._optionHe !== built.cz.answer) {
    rev.appendChild(el('div', { class: 'room-train-ansfrom', attrs: { dir: 'rtl', lang: 'he' },
      text: s._optionHe + ' · ' + tt('room.morph.study.answerInText', 'в тексте: {form}').replace('{form}', built.cz.answer) }));
  }
```

- [ ] **Step 5: Style it**

In `public/library.html`, next to `.room-train-ansgloss`:

```css
    .room-train-ansfrom { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
```

- [ ] **Step 6: Run tests and capture the screenshot**

Run: `npm run smoke:train-queue && npm run smoke:i18n`
Extend `scripts/premium/train-queue-shots.js` so its leech pass answers a multiple-choice item whose target carries a proclitic, and capture the reveal. **Look at the image**: the picked option and the sentence form must both be visible and the relation legible.

- [ ] **Step 7: Commit**

```bash
git add public/js/library-ui.js public/library.html public/i18n/locales/*.js scripts/premium/train-queue-smoke.js scripts/premium/train-queue-shots.js docs/research/room-trainer-maturity
git commit -m "fix(room): name the relation between the chosen option and the sentence form"
```

---

### Task 4: P6 — record that the scaffolds are structural

**Files:**
- Modify: `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md`

The predecessor packet §1 calls the sentence translation and audio scaffolds kept "for the current learner cohort", which invites a future wave to withdraw them as legacy. The 2026-09-03 assessment shows they are the **only** channel carrying required-form information for any non-citation target. The canon must say so.

- [ ] **Step 1: Add the invariant**

Add to the program canon's invariants section:

```markdown
8. **The sentence translation and the sentence audio are STRUCTURAL, not transitional.** For any
   target that is not the citation form, they are the only channel carrying which form is
   required — the prompt names the lemma (`ROOM_TRAINER_FORM_CONTRACT_ASSESSMENT_2026_09_03.md`
   §3, P1). The predecessor packet's framing of them as scaffolds "for the current learner
   cohort" is superseded: they may not be withdrawn as legacy. Owner decision, 2026-09-03.
```

- [ ] **Step 2: Commit**

```bash
git add docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md
git commit -m "docs(room): record that the trainer's scaffolds are structural, not transitional"
```

---

### Task 5: Release

- [ ] **Step 1: Check prod disk first.** `curl -s https://linguistpro.kolosei.com/healthz` — prune above 85% before pushing.
- [ ] **Step 2: Move all six stamps to `3.11.461` / locale `195`**, then `node tests/i18n.smoke.js --write-lock`.
- [ ] **Step 3: Full gate sweep**, OPFS gates one at a time, plus `git diff --check`.
- [ ] **Step 4: Commit, push, verify** the served version, the shell-integrity agreement and a fresh service-worker install. Prune afterwards.

---

## Self-Review

**Scope coverage:** P5 → Task 2; P4 → Task 3; P6 → Task 4; the shared stripper → Task 1; release → Task 5. P1, P3 and P7 are deliberately absent, and P2 is recorded as an open decision — both stated in the constraints so a later reader does not mistake omission for oversight.

**Placeholder scan:** every code step carries literal code.

**Type consistency:** `ReaderMorph.dropProclitic(string) -> string` is defined in Task 1 and called in Task 2. `s._optionHe: string` is written in Task 2 and read in Task 3.

**Risks:**

1. **Task 2 changes what the learner sees but must not change any verdict.** Multiple-choice correctness is flagged, and Suite 20 asserts the handler still reads the flag and never the sentence form. `room-training-premium` and `studio-room-srs` both answer a real item end to end.
2. **The stripped option could collide with a distractor.** `pickDistractors` already dedupes displayed forms against the citation skeleton, which is what the stripped form reduces to, so a collision would already have been excluded. If one ever appears, the fix is in the distractor filter, not in restoring the tell.
3. **The suffix tell survives** in the B1 path. Recorded above as deliberate residue, with a tiles fallback as the option if it proves common — which would cost multiple-choice frequency the owner values.
