# UX, accessibility and surface matrix

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current UI; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor 380/RTL only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=WAI/WCAG/W3C; INFERENCE=proposed UX and acceptance.

## Information architecture

Task statement
→ Solutions and resources
→ Ask about this task, only after Q&A gate
→ One Q&A item
→ Answers
→ Clarifying comments

The task context always names corpus, edition and task title/number. A subpart chip shows human text plus edition, not an opaque ID alone. On new edition, old content shows “for edition N” and a successor/equivalence banner.

Pilot has only Solutions and resources. No empty “0 discussions” tab.

## Surface matrix

| Surface | Anonymous | Authenticated | Offline | Error/moderation |
|---|---|---|---|---|
| Public catalog card | count of approved resources, no activity vanity | same | cached count marked stale | corpus unavailable vs resources unavailable distinct |
| Reader task context | open solution drawer, task remains visible | later save/report if authorized | cached metadata; external link disabled/explained | dead/quarantined states |
| Resource card | type, language, author/provenance, expert/useful/moderation/official facts, provider hostname | owner edit/review controls by capability | metadata only | access unknown/auth required/dead |
| Question editor, later | sign-in explanation | anchor preview, duplicate results, visibility, body, submit | draft local only with explicit unsynced label | field errors + retry without loss |
| Thread, later | approved public Q&A | answer/comment/subscribe by capability | cached read only | locked/archived/quarantined/tombstone |
| Moderation | none | assigned queue and conflict notice | unavailable | required audit failure blocks action |

## Mobile 380px

- Single column; no mandatory side-by-side task/thread layout.
- Sticky header at most one compact row and never obscures focused control.
- Task context collapses after title/edition/subpart but is one action away.
- Cards use normal document flow; long URLs display hostname/ellipsized path without horizontal scroll.
- Primary touch targets 44×44 CSS px where practical; absolute WCAG floor/spacing is tested.
- Composer actions remain below body; no horizontal toolbar. Formatting, if later, is a disclosure.
- Keyboard opening the editor must not hide task anchor or submit/error state.

## RU/EN/HE and bidi

Required localized state keys, exact names to freeze during implementation:

- physicsForum.title
- physicsForum.resources.heading / empty / count
- physicsForum.resource.type.*
- physicsForum.resource.access.*
- physicsForum.resource.health.*
- physicsForum.quality.authorAsserted / expertReviewed / communityUseful / moderationAllowed / official
- physicsForum.anchor.edition / task / subpart / changedEdition
- physicsForum.external.warning / open / report
- physicsForum.question.ask / duplicateHeading / visibility / submit
- physicsForum.thread.resolved / locked / archived / quarantined
- physicsForum.form.errorSummary / saved / conflict / rateLimited / offline
- physicsForum.moderation.report / appeal / reason.*

Document lang/dir follows app locale. User/provider title and post body use declared content language; unknown user text gets dir=auto. Author names/titles in mixed sentences use bdi. Hebrew transliteration is lang=he-Latn dir=ltr. CSS uses logical start/end properties.

## Keyboard and screen reader

- Heading hierarchy exposes task, solutions, Q&A, answers and comments.
- Tabs are used only if true tab behavior/arrow keys are implemented; otherwise links/headings.
- Every icon action has visible or accessible localized name; state not color-only.
- External link announces provider and new context in accessible text.
- Dynamic save/report/moderation results use appropriate polite status; destructive/error alerts are assertive sparingly.
- Error summary receives focus, links to fields and each field uses aria-describedby/aria-invalid.
- Modal/drawer focus is trapped only while open, background inert, Escape works, focus returns to trigger.
- Deep-linked post/task target receives programmatic focus without stealing focus during ordinary updates.
- Accepted/helpful/expert/official states use distinct text, not icons alone.

## Reflow and zoom

Acceptance:

- 380×844 RU, EN and HE RTL, no horizontal overflow;
- 320 CSS px equivalent/200% reflow, no two-dimensional scrolling except intrinsically two-dimensional math/table regions with their own labelled scroll;
- WCAG text-spacing override without clipping;
- focus not obscured by sticky task header/composer;
- 24px minimum target or sufficient spacing, product goal 44px;
- reduced motion and high contrast/forced colors;
- long 200-character Hebrew/Russian title, long pseudonym, URL and moderation reason fixtures.

Math must reflow or provide an accessible labelled horizontal region and text alternative; an image of a formula without alternative is not acceptable.

## Loading, empty, error, offline

- Loading skeleton retains headings and no false count.
- Empty distinguishes no curated solution, filtered-out results and offline/unloaded.
- 401 asks to authenticate; 403 names insufficient capability; private object enumeration may use generic 404.
- 409 preserves draft and offers reload/compare.
- 429 gives retry time without shame.
- External failure never labels learner action failed; it names provider/access.
- Moderation state preserves context without exposing complaint details.
- Offline composer does not promise sync; pilot has no offline write queue.

## Acceptance evidence separation

Required future rows:

- LOCAL_TEST: pure presenter/i18n/anchor/error state tests.
- ISOLATED_AUTOMATION: 1280 and 380 RU/EN/HE, keyboard, reflow, contrast, no overflow.
- PRODUCTION_ANONYMOUS: task/resource reads and cache behavior in clean profile.
- OWNER_LIVE_READ_ONLY: exact owner profile read only, before/after data fingerprints.
- OWNER_REPORTED: subjective usefulness/readability.
- PHYSICAL_DEVICE/AT: iOS/Android, VoiceOver/TalkBack/NVDA or explicitly NOT_RUN.

No category may be inferred from another.
