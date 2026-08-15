# External primary benchmark

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; preserved.
Production: `https://linguistpro.kolosei.com/library.html`, inspected version `3.11.388` for local comparison.
Evidence method: `EXTERNAL_PRIMARY` official product/help documentation, checked 2026-08-15; local comparison uses `CODE`, `PRODUCTION` and `OWNER_LIVE_READ_ONLY`; no new `ISOLATED_AUTOMATION`; no new `OWNER_REPORTED`.
Limitations: documentation benchmark, not logged-in product testing; absence from docs is not proof a feature does not exist. Inferences are labelled.

## Canvas LMS

Official facts:

- Modules can contain heterogeneous items, require all or one, enforce listed sequence and apply type-specific requirements such as view, mark done, submit or score. Editing already-satisfied requirements forces an explicit choice between keeping progress and re-locking learners. [Canvas module requirements](https://community.instructure.com/en/kb/articles/660897-how-do-i-add-requirements-to-a-module)
- Modules can be targeted to individual learners or sections/tags; visibility of nested items remains independently access-controlled. Teacher apps do not support this assign-to operation. [Canvas module targeting](https://community.instructure.com/t5/Instructor-Guide/How-do-I-assign-a-module-to-individual-sections-or-students/ta-p/609337)
- Course export produces an IMS Common Cartridge package, but student interactions and grades are excluded and exported separately. [Canvas course export](https://community.instructure.com/en/kb/articles/660734-how-do-i-export-a-canvas-course)
- Canvas documents Hebrew support, screen-reader pairings, ARIA landmarks, keyboard alternatives to drag/reorder and rem-based zoom behavior. [Canvas languages](https://community.instructure.com/en/kb/articles/662726-which-languages-does-canvas-support), [Canvas accessibility standards](https://community.instructure.com/en/kb/articles/662723-what-are-the-canvas-accessibility-standards)

Transferable contract: heterogeneous typed steps and completion predicates are useful, but content structure, learner evidence and access must remain separate. Version changes after completion require an explicit policy. Keyboard reorder is mandatory.

Inference for LinguistPro: immutable published versions pinned by Assignment are safer than Canvas-style in-place requirement edits because LinguistPro has multiple local truth domains and must avoid re-lock ambiguity.

## Moodle LMS 5.0

Official facts:

- Activity completion criteria may be viewing, a score or learner-marked completion; an authorized teacher can override completion. [Moodle Activity completion](https://docs.moodle.org/500/en/Activity_completion)
- Availability can be restricted by date, grade, group or another activity’s completion. [Moodle Restrict access](https://docs.moodle.org/500/en/Restrict_access)
- Roles are permission collections assigned to users in a specific context. [Moodle roles and permissions](https://docs.moodle.org/500/en/Roles_and_permissions)
- Course backup can selectively include content, users, roles, groups, completion, logs and grade history, with anonymization and explicit restore workflows. [Moodle course backup](https://docs.moodle.org/500/en/Course_backup)
- Moodle’s official feature matrix lists responsive, RTL and multilingual support in web/app. [Moodle student features](https://docs.moodle.org/en/images_en/2/2a/Moodle_features_students.pdf)

Transferable contract: capability-in-context is more precise than a broad role string; manual override must be an explicit authority event; export must distinguish content definition from learner evidence and privacy-sensitive data.

Inference for LinguistPro: adopt the separation, not Moodle’s full course/gradebook complexity. A small capability matrix and typed waiver are sufficient for B9.

## Google Classroom

Official facts:

- Teachers can save an assignment as draft, schedule/post it, select classes or individual students, set due date and attach materials; student work has explicit statuses. [Google Classroom assignment](https://support.google.com/edu/classroom/answer/6020265?co=GENIE.Platform%3DDesktop&hl=en-EN)
- Group-targeted assignments snapshot the group’s current members when saved/assigned; later group edits do not change assignees unless the teacher explicitly updates them. [Google Classroom student groups](https://support.google.com/edu/classroom/answer/15263790?hl=en)
- Removing a student removes Classroom assignment visibility/gradebook presence while Drive work and prior contributions may remain. [Google Classroom removal](https://support.google.com/edu/classroom/answer/6069576?co=GENIE.Platform%3DDesktop&hl=en)
- Official accessibility guidance documents desktop and mobile screen-reader use, landmarks and assignment workflows. Android supports a bounded subset of offline assignment functions. [Classroom screen-reader guide](https://support.google.com/edu/classroom/answer/6084551?hl=en), [Classroom mobile/offline](https://support.google.com/edu/classroom/answer/16642670?hl=en)
- Gemini can propose/draft assignment content, while the teacher still performs the assignment action. [Classroom assignment](https://support.google.com/edu/classroom/answer/6020265?co=GENIE.Platform%3DDesktop&hl=en-EN)

Transferable contract: group assignment should snapshot recipients, later membership edits must not silently rewrite history, and AI assistance should stop at a human-controlled draft/publish boundary.

Inference for LinguistPro: retain audit after revocation but fail closed for protected content; do not copy Classroom’s Drive-retention behavior into Path exports.

## Compact comparison

| Contract | Canvas | Moodle | Google Classroom | B9 implication |
|---|---|---|---|---|
| Author/publish | module/items published in course | context capabilities + course edit | draft/schedule/post | mutable draft + explicit human publish |
| Versioning | mutable requirements; explicit relock decision | mutable course/activity | editable assignment | immutable PathVersion pinned to Assignment |
| Optional vs required | all/one requirements | criteria + restrictions | material vs assignment | optional adoption separate from authority assignment |
| Completion | item-specific predicate | view/score/self-mark + override | submit/status | project from canonical facts; typed authority waiver only |
| Group targeting | individual/section/tag | group/context restrictions | recipient snapshot | snapshot current group recipients |
| Resume/access | module progression | completion/access restrictions | Classwork status | one clear resume; fail closed per item |
| Export/recovery | content package; grades separate | selective backup including sensitive learner data | ecosystem-dependent retention | separate definition, assignment/audit and learner evidence exports |
| RTL/accessibility | Hebrew + documented AT/keyboard | responsive/RTL/multilingual | documented desktop/mobile screen readers | RU/EN/HE parity, logical CSS, non-drag reorder, physical gates |
| AI | conditional/mastery features exist, not needed here | AI placements outside this comparison | AI may draft, teacher assigns | AI draft-only, default-off, later approval |

## What not to import

- gradebooks, scoring rubrics, arbitrary conditional branching and course administration;
- completion by mere page view;
- content duplication into assignment records;
- mutable published sequences that retroactively change learner requirements;
- silent group membership propagation;
- AI publication or provider calls on learner navigation.
