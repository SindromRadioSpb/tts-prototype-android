# Independent browser QA: delayed cafe B reviews

2026-11-05 UTC (execution-host date). Initial checkout d3ad49e; final base 0c686b8 after an unrelated atlas-documentation update, worktree `pilot/cafe-b`, with the uncommitted pilot and fixes identified by `source-hashes.json`. Test-path names retain the earlier `20261106` tag and are not timestamps. This is bounded managed-Chromium evidence, not production acceptance.

## Result

PASS for the tested D07/D30 flow after three defects found during this run were fixed by the implementation owner and independently rechecked:

1. The preflight gave the answer `סוכר` before a later sugar-retrieval task. The final preflight for all eight R/D sessions contains no Hebrew target form. The general permission to write without niqqud remains.
2. Keyboard Submit discarded focus to BODY. Start and successful Submit now focus the current/next task heading; the final Submit focuses Finish; Finish focuses Open keys; Open keys focuses the first result heading. Failed writes focus the retained answer field.
3. A real browser double-click on L01 Submit recorded L01 and an unintended blank L02, advancing to L03. The final real `dblclick()` advances only to L02 and leaves exactly one response in the persisted journal. This was not a synthetic stale-element click test.

No outstanding blocker was found within this bounded test. Physical-device, screen-reader, full-shell, sync, production, and language-learning acceptance remain separate gates.

## Environment and isolation

- Browser: actual managed Chromium, operated only with `cua_repl`, through the URL returned by `sites-preview`. No alternate browser server or permission bypass.
- Page: a test-only static host around the real `CourseReader.mount`, `CourseStore.localStore`, all thirteen unchanged application modules, the real course CSS, and an integrity-built copy of the complete pilot bundle. This tests the native reader integration, not only a stand-alone review renderer, but does not mount the complete `library.html` application shell.
- Synthetic B001 anchor: 2026-10-01 12:00:00 UTC, recorded with `CourseEvidence.record` and `CourseReview.ensureAnchor`. Fixed time is passed through the reader's existing `opts.now` seam. The OS/browser clock was not changed.
- Every store key is wrapped in an explicit QA-only prefix and uses a non-anonymous QA user key. No real profile, server data, cloud sync, FSRS/review_log, audio provider, payment, or production endpoint was used. Fixture controls create artificial conflicts and simulate failed saves only inside this namespace.
- Existing root-URL cache returned an old studio page. It was not used as evidence. Unique test paths were used without changing service-worker/security settings or deleting existing caches.
- The first fixture accidentally used `B001` rather than the actual `B001-cafe` anchor ID. That fixture was corrected, and accepted testing began with the fresh `-02` path and a valid synthetic anchor. This was a harness error, not a product defect.

## Verified behavior

### Time and order

- At D07 minus 1 ms, D07 and R07 are disabled; exactly seven 24-hour days after the anchor, D07 is enabled and marked due.
- At D30 minus 1 ms, D30 and R30 are disabled; exactly thirty days after the anchor, D30 is enabled while R30 remains blocked.
- D07 started on day 12 retains its day-7 due date and shows an actual interval of 12.00 days. Its completion opens R07 as five days overdue, without shifting D30.
- D30 started on day 35 retains its day-30 due date and shows 35.00 days. Completion opens R30 as five days overdue.
- Browser-local dates cross the October DST change: the displayed hour changes while the interval remains thirty times 24 hours. No calendar-day shortcut was substituted.
- Rolling the test clock back from day 35 to day 30 during D30 rejects the attempted answer write and retains the unsent value. Restoring day 35 allows continuation.

### Deferred keys and saving

- All 16 D07 and 17 D30 task screens were traversed, and both full series were repeated after the final reader focus/double-click fix.
- Responses were deliberately a mixture of test strings, one correct lexical answer, and blanks. This establishes UI/control flow, not learning proficiency or editorial correctness of every answer.
- Before completion, the flow shows neutral saving language and no key-opening/scoring controls. Optional authored stimuli remain absent from the DOM until opened and disappear when hidden.
- After the last answer, only Finish is offered. After Finish, keys are still absent; a separate Open keys action is required. The completed-but-unrevealed D30 state survives reload.
- Open keys reveals exactly 16 D07 or 17 D30 keys. Exact lexical/gender comparison and open-task self-assessment remain separate. One exact score and one self-assessment were saved in the initial D30 pass. No overall language-proficiency percentage is presented.
- Failed response save leaves the current task and draft unchanged and stores zero responses in that fresh run. Failed key-event save does not reveal keys.
- D07 draft survives reload and RU/HE direction remount. Final D30 result persists across a fresh-path reload.
- The lesson-attempt count stays at one synthetic anchor throughout completed review runs. Review answers do not create fabricated lesson mastery attempts.

### Honesty and conflicts

- With prior stimulus/key exposure and help declared absent, the initial D07/day-12 and D30/day-35 runs receive the written independent-check label. This is the application's self-report eligibility, not independently verified human performance.
- An aided D30 response changes the run to practice. Unknown preflight conditions also produce practice. Repeating D07 remains practice even when all disclosure controls are later set to No.
- Two fixture-generated offline anchors block all sessions and offer two explicit choices. Choosing the later anchor preserves both attempts, both anchor events, and a separate resolution event, with dates changing only after that selection.
- Same event ID with different bodies preserves both events, shows the integrity-error blocker, disables all sessions, and offers no ineffective anchor-choice button.
- These are browser checks of synthetic merged histories. No live multi-device/cloud conflict was created or accepted.

### Accessibility scope

- Textarea has an accessible name, `dir=auto`, and the expected length limit; neutral feedback has `role=status`.
- Keyboard textarea → assistance checkbox → Submit works. The post-action focus defect was fixed and retested with actual Enter key activation.
- The tested reader buttons were 44 CSS px high, and the desktop reader had no horizontal overflow.
- RU/HE remount used the reader's authored-language/direction behavior with Russian fallback strings; it is not a full translated-shell audit.
- No screen reader, touch keyboard, physical phone, WebKit, or visual contrast audit was performed. No screenshots are claimed in this report.

## Final source verification

`served-source-hashes.json` was derived by navigating the browser to each script URL actually present in the final page and hashing its rendered source text after `trimEnd()`. All thirteen application script hashes match the final local files, and the files were unchanged at comparison time; see `served-verification.json`. These are rendered-source comparisons, not independent raw HTTP response byte hashes. `source-hashes.json` also preserves exact local-byte hashes for CSS and source course JSON.

Path history:

- `-02`: initial valid-anchor run; found preflight leak and began D07.
- `-03`: D-preflight fix; completed initial D30, conflicts, keyboard, and real double-click diagnosis.
- `-04`: final reader focus/activation changes; repeated complete D07 and D30 series.
- `-05`: only the six R instructions changed from `-04`; verified all eight preflights and current source hashes. D tasks, engine, and reader code did not change between those final two paths.

One browser input-dispatch timeout occurred on a test-only Apply clock control. The visible clock showed the action had not executed; normal keyboard activation then completed it. No product failure or double execution was inferred from the timeout.

## Reproduction and artifacts

- `browser-evidence.json`: 116 browser observation records, including before/after defect evidence and synthetic journal snapshots.
- `browser-evidence-before-focus.json`: retained intermediate observations before the final activation/focus fixes. The final evidence file supersedes it.
- `harness/index.html.txt` and `harness/qa.js.txt`: exact final fixture host and controls. Not production assets.
- `harness/build.cjs.txt`: reproducible fixture builder. Copy it to an executable `.cjs` outside production assets, then run `node <builder> <repository-root> <fresh-output-directory> <unique-path-name>`. Output must be beneath `/workspace`; use a new path and fresh output each run.
- Start with `sites-preview start <output-directory>`, open the exact returned origin, then the generated unique path. Stop with `sites-preview stop` after QA. Do not register or deploy this fixture as a Site.

This report does not replace production served-asset checks, the complete library-shell acceptance, all 123 R/D tasks, lesson screens, physical/assistive testing, audio/ASR acceptance, or human pedagogical review.
