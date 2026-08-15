# Live browser evidence

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; untouched.
Production: `https://linguistpro.kolosei.com/library.html`, UI and `/api/client-config` version `3.11.388`.
Evidence method: `PRODUCTION` plus `OWNER_LIVE_READ_ONLY` DOM/accessibility inspection in the existing authenticated Chrome profile; `CODE` used to interpret route semantics; no accepted `ISOLATED_AUTOMATION`; no new `OWNER_REPORTED`; no `EXTERNAL_PRIMARY` claim.
Limitations: desktop RU only; no owner mutations, provider calls, destructive controls, 380×844/HE/RTL/200% physical verification or assistive-technology run.

## Guardrails actually observed

The investigation used route traversal, DOM snapshots, ARIA/role inspection, served-version reading and layout-width queries. It did not create, rename, reorder, assign, grade, finish, bookmark, note, invite, revoke, import, export or call a provider. Existing private content and account/provider identifiers were intentionally excluded from this record.

## Surface observations

### Library/L0

- “Today” owns immediate next actions, including Continue and the canonical Trainer entry.
- Reading Journey and Reading Lists are separate, consolidated modules.
- Libraries/corpora are separate vertical destinations.
- There is no visible Paths or Assignments destination and no authority/provenance affordance for a learning sequence.
- Expected B9 location: a distinct “Paths & Assignments” module after Today and before the lower-priority Journey/Reading Lists modules. Today may project one next assignment step, but must not become a new feed writer.

### Public corpus

- The surface clearly presents corpus provenance, a contextual next action, derived profile-fit and catalog controls.
- Profile-fit is explained as a vocabulary-based lower-bound, not comprehension or teacher authority.
- There is no path identity, version, assigner or requiredness marker.
- Expected B9 behavior: contextual “Paths using this corpus” links only. A cross-corpus path remains globally owned, not nested into one corpus.

### My Texts

- The boundary “on this device” is visible and honest.
- The catalog has its own search/filter/management grammar.
- No teacher or group authority is implied.
- A personal text can appear in an owner-authored optional path. It must not be assignable by another person without a separate explicit share/access grant; the first slice should disallow that case.

### Group corpus

- The surface distinguishes private group scope and owner/member role, shows curator order and has a management disclosure for member/invite and backup actions.
- Management contains no path draft, preview, publish, version, assignment, withdrawal or completion controls.
- The sampled cards all exposed a hidden Learning Compass reason equivalent to “assigned by your study group.” Code proves this is supplied for every group-corpus card from membership/catalog context, not from an assignment record.
- What looks assigned today is therefore presentation inference. It is insufficient for B9 and should become a neutral group-curation label unless a real typed Assignment targets the learner.

### Reader

- The inspected work showed canonical source/provenance, row structure and existing bookmark state.
- No path context, step position, authority label or next-step control exists.
- Expected B9 entry: a compact context bar — Back to path, step N of M, required/optional state and Next — that reads existing progress/Finished and never writes them merely on navigation.

### Mentor and Lesson Studio

- Mentor exposes explicit provider consent and a learner-controlled Lesson Studio launcher.
- Lesson Studio is a same-document region with a source-selection → setup → draft flow, 1–3 source bound and a disabled build action until selection.
- Its copy states a browser-bounded draft lifetime. There is no curator role, publish/version/assignment contract or durable completion.
- Expected B9 relationship: later “Import Lesson draft into Path draft” with mandatory human review. Opening a path must never trigger Lesson Builder, comprehension or any LLM/BYOK call.

### Existing teacher shell

The repository’s `teacher.html` is a privacy-bounded research cohort analytics surface, not a group/corpus authoring shell. Production group management is an owner shell for access and backup. B9 authoring should be a new scoped same-document workspace reached from Paths and group/corpus management, not a semantic overload of cohort analytics.

## Resume and next-step contract

| Context | Expected entry | Truth read | Forbidden side effect |
|---|---|---|---|
| Library/L0 | “Resume assignment/path” in distinct B9 module; at most one projection in Today | pinned version, recipient/adoption, existing Finished/review facts | recommendation-feed write, implicit acknowledgement |
| Corpus | “Used in N paths” / contextual resume | stable path refs filtered by access | reinterpreting catalog order as path order |
| Reader | path context bar | current version item + canonical last position/Finished | progress write on open/back/next |
| Trainer | “Return to path” context after canonical queue action | explicit review targets + `review_log` projection | auto-grade, synthetic review event |
| Teacher/editor | Draft → Preview → Publish → Assign/Withdraw | scoped grants, immutable version, assignment events/audit | editing a published version in place |

## Accessibility, RTL and responsive implications

- Current desktop RU Lesson Studio exposed meaningful regions, headings, buttons, tabs, comboboxes, pressed/disabled states and no desktop horizontal page overflow.
- Catalog item buttons can create a long keyboard sequence. B9 authoring therefore needs skip links/landmarks, explicit reorder buttons in addition to drag, and a bounded/paginated source picker.
- Shared typed section/disclosure grammar should be reused. Published version, assigner, due date and access loss must be text, not icon/color only.
- Mixed Hebrew titles need logical CSS, isolated/bidi-safe metadata and locale-aware truncation. Hebrew UI must set `lang=he` and `dir=rtl`; sequence numbering remains semantically ordered while controls mirror logically.
- At 380×844 and 200%, a single-column vertical sequence, wrapping titles/actions and no horizontal rail are mandatory. Teacher authoring should stack item summary above actions and expose “Move before/after” controls.
- Live HE/RTL/narrow claims are deliberately **not** made in this research: the isolated browser runtime was unavailable and Chrome’s viewport override did not change the actual viewport. These are mandatory implementation gates, not presumed passes.

## Browser evidence classification

- `PRODUCTION`: served version, routes and current rendered contracts.
- `OWNER_LIVE_READ_ONLY`: authenticated Library/L0, public corpus, My Texts, group corpus, Reader, Mentor and Lesson Studio observations.
- `ISOLATED_AUTOMATION`: none accepted. The failed viewport setup is a tooling limitation, not product evidence.
- `OWNER_REPORTED`: none for B9.
