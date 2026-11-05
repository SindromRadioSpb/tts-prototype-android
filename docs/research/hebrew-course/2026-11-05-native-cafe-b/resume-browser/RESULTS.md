# Resumed browser QA: cafe B

2026-11-06 UTC. Local pilot/cafe-b, base d3ad49e. Actual managed Chromium via supported sites-preview and cua_repl. No deployment, paid/audio calls, owner data, or source edits by QA.

## Verified

- Fresh test prefix loads course-review.js and course-review-reader.js plus all eight R/D schedule cards. Original cached navigation was stale and is not acceptance evidence.
- O-145: B001 step 32, draft `בדיקת טיוטה`, second hint and route survive ru → he → ru remount.
- O-146: B001 step 33 first hint asks to compare size without changing additions; second explicitly contrasts קטן/גדול and explains short repair. They differ; second click disables hint button.
- A real B001 answer `אפשר תה גדול עם סוכר, בלי חלב, בבקשה?` was saved and accepted in the UI. Existing anonymous test history already supplied first-attempt anchor; this run does not prove clean-profile anchor creation.
- R00 unchecked activity-break box blocks start. Initial generic error was reported and fixed by parent. Final -02 recheck displays: «Сначала сделайте паузу после урока и займитесь другим делом, затем отметьте это перед R00.»
- Checked break starts series. Unknown disclosures visibly classify it as practice, not independent assessment.
- R00 first-task draft `תה טיוטה` survives reload, ru → he, schedule navigation and browser Back. Forward returns schedule; Back restores run.
- All 15 R00 screens visited in order. First answer `תה`, remaining 14 intentionally blank for flow testing, not learning evidence. Each screen retained neutral saving wording, with no correctness feedback or key-opening button before completion.
- After all responses, only Finish is offered. Finish enables Open keys; only that action reveals keys and separate scoring controls. No total proficiency percentage.
- Repair: new coffee prompt appears without its key; submitting the new answer reveals repair key. Original blank answer remains unchanged.
- Final -02 repeat-practice preflight and first-task editing work. No accidental independent-test claim.

## Visual scope

- Desktop RTL: 1165 × 759 CSS px, document scrollWidth = clientWidth = 1165.
- Narrow RTL via ordinary browser 300% zoom: 388 × 253 CSS px, scrollWidth = clientWidth = 388 on R00 preflight and first task. Checkbox, practice-start button and text entry worked. This is a narrow desktop/zoom check, NOT a physical mobile or 380 × phone-height acceptance.
- Restored browser zoom to 100%.
- Screenshots: review-break-388-rtl.png (actual PNG 388 × 250) and review-task-desktop-rtl.png (actual PNG 1165 × 749). PNG capture dimensions differ slightly from the measured DOM viewport heights above. A full-page screenshot attempt timed out; the subsequent narrow-task capture was malformed and rejected after image inspection. Narrow-task geometry and interactions are DOM/UI evidence, not accepted screenshot evidence.

## Served-source verification

Test-only prefix `/__cafe_b_qa_resume-20261106-02/` transforms HTML asset URLs, module imports and course-reader data base. Application logic is unchanged except the parent’s explicit final break-message fix. Production cache keys and browser security/settings were not changed.

`source-manifest.json` contains server-reported source hashes, matched against local files. `served-module-hashes.json` hashes independently read browser-rendered source text for five modules. `served-verification.json` compares each with the expected prefix-transformed source; all five match. Large library-ui text was read in chunks because the tool truncates individual strings at 200,000 characters. Source/served hashes differ for course-reader and library-ui due solely to disclosed prefix transformations. HTML source hash is manifest/local evidence, not independent raw-response byte hashing.

Most flow checks ran on -01; final -02 rechecked the changed break message, practice start, narrow/desktop geometry and final served hashes. Other module source hashes remained unchanged.

## Remaining limitations

D07/D30 time advancement and actual control-series execution were not browser-tested. Their scheduled/blocked UI states were observed only. No clock/storage injection, production profile, physical Android/iPhone, WebKit, touch keyboard, screen reader, audio/ASR or cloud sync acceptance. Full B001 and all 123 review tasks were not solved. This bounded UI smoke does not close those release gates.
