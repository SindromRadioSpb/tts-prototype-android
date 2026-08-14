# Findings and future verification matrix

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit / branch | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` / `main` |
| Dirty tree | `DIRTY`, 34 pre-existing porcelain entries at baseline; preserved |
| Production | owner tab at `https://linguistpro.kolosei.com/library.html#room=benyehuda`, served `3.11.384` |
| Method | required canon + relevant fresh docs; four original owner screenshots; production read-only DOM/ARIA/geometry; source/query/CSS/locale/test review |
| Evidence separation | `CODE`, `OWNER_SCREENSHOT`, `OWNER_LIVE_READ_ONLY`, and inspected `ISOLATED_AUTOMATION_CODE` are not interchangeable |
| Limitations | no implementation, automated run, DB mutation/readback, destructive owner test, physical device or AT session occurred |

## Confirmed facts

1. L0 already owns the only source-neutral Continue query and bounded global bookmark/finished/note projections.
2. L0 does not render named reading lists even though its explanatory copy mentions the separate device-local “Читать позже” concept.
3. Ben simultaneously renders a corpus-local Continue hero and a separate Ben-only 12-card Continue shelf.
4. Ben’s Finished query is Ben-only, its Bookmark shelf is global/unscoped, its lists/saved searches are Ben localStorage, and Next/Ready are Ben catalog projections. The current stack has no single scope rule.
5. My Texts and Study Songs are already coherent corpus-local surfaces: hero, retrieval controls, vertical materials and secondary management.
6. `Тестовый список для чтения` is not present in repository code/tests/scripts/fixtures and production showed three real work cards. It must be treated as owner data.
7. Named lists live only in `corpus_reading_lists_v1`, are capped at 300 items/list, have no cross-device sync/export/recovery, and currently have no rename/hide/archive/pin.
8. Entire-list delete and per-item remove are separate DOM buttons and ARIA labels, but both are visually bare `✕`; list deletion has no confirmation.
9. Next uses a horizontal rail; Ready uses vertical compact rows. At 380 HE a 12-card rail measured `341px` client width versus `1726px` scroll width.
10. There was no document-level horizontal overflow on the inspected L0/Ben routes. My Texts and Study Songs nevertheless clipped filter controls outside the 380px RTL viewport.
11. The HE locale contains disclosure translations, but live disclosure text/ARIA remained Russian after switching locale.
12. Ready preview is bounded to 12, L0 Ready to 4 and My Texts to replace-pages of 48. Ben full results append 60 and group results append 48, so repeated “more” can still grow DOM to the full result set.
13. `public/js/local-db.js` is absent; the actual adapter is `public/db/local-db.js`.
14. The accepted B8 last-working-position, explicit bookmark separation, disclosure persistence and working-row overlay remain present in code/tests and are not reopened.

## Hypotheses accepted as recommendations, not facts

- Users will understand global journey ownership better on L0 than inside one arbitrarily privileged corpus.
- One corpus-scoped hero per corpus is enough; separate Continue shelves add more cost than value.
- Vertical rows will improve scanning and input-mode parity for text-heavy work collections.
- A 12-row preview and 48-row replace-page balance density, AT predictability and DOM budget without immediate virtualization.
- A consolidated lists module will preserve discoverability while preventing list count from determining page hierarchy.
- Explicit labeled destructive actions with named confirmation will materially reduce the current `✕` ambiguity.

These hypotheses require post-implementation isolated and owner-live verification after explicit approval.

## Unknowns / owner-policy questions deferred

- Whether owner/group-provided corpus names should support localized aliases or intentionally remain as authored identities.
- Whether “Hide from Home”, Pin and Archive are three distinct persisted states or one simpler visibility state.
- Whether reading lists should eventually sync/export; current behavior is device-local and must be labelled honestly.
- Whether list-detail deserves a dedicated hash route after the consolidated in-place module is proven.
- Whether 48-row replacement pages remain sufficient beyond current catalog scale; virtualization needs measurement, not assumption.
- Physical iPhone Safari, VoiceOver, network transition and actual service-worker update evidence for the future implementation.

## Research-only regressions

| ID | Evidence | Scope | Disposition |
|---|---|---|---|
| IA-R1 | My/Study filters have negative bounding rectangles at 380 HE and are clipped without page scroll | responsive/RTL retrieval controls | record; fix only in approved successor implementation |
| IA-R2 | HE disclosure visible text and ARIA remain Russian despite locale keys | dynamic i18n repaint of accepted disclosure | record; do not redesign disclosure |
| IA-R3 | Ben global Bookmark shelf lacks B8 authorized-group filtering | query/surface ownership risk; no observed leak | remove duplicate Ben projection, reuse L0 authorized reader |

## Future verification matrix — planned, not executed

Every row below starts `NOT RUN`. Automation results may prove an isolated browser or DOM contract only. They may not be relabelled physical-device or owner-live evidence.

| Gate | Planned environment/method | Pass condition | Evidence class after run |
|---|---|---|---|
| desktop RU | isolated browser at ≥1024px, then production read-only | L0/Ben/My/Study hierarchy matches D1; no rails for material collections | isolated automation; separate production read-only |
| desktop HE/RTL | isolated browser, `lang=he`, `dir=rtl` | logical order, localized text/ARIA, no clipped controls | isolated automation |
| 380×844 RU | isolated browser | no page/nested material-list horizontal scroll; primary actions ≥44px where required | isolated automation |
| 380×844 HE/RTL | isolated browser | no negative off-canvas interactive rects; correct bidi and arrow direction | isolated automation |
| 200% zoom/reflow | desktop browser emulation plus DOM geometry | no two-dimensional scrolling, clipped header action or lost focus | isolated automation; not physical device |
| keyboard-only | tab/shift-tab/enter/space/escape script and manual desktop smoke | visual and DOM order match; off-screen focus absent; disclosure/detail focus returns predictably | isolated + owner-live manual, kept separate |
| screen-reader semantics | DOM/ARIA assertions; optional real VoiceOver later | stable heading ids, labelled regions, correct `aria-expanded/controls`, typed destructive names | DOM automation; VoiceOver only if actually run |
| reload | isolated fixture with collapsed sections | same sections remain collapsed; no learner state changes | isolated automation |
| close/reopen tab | isolated persistent context | same presentation state returns through existing store/fallback | isolated automation |
| offline/reconnect | isolated service-worker context | cached shell/list projections degrade honestly; no dead action; reconnect recovers | isolated automation |
| service-worker update | staged old→new version | version triplet matches; controlled reload; storage/learner data preserved | staging/production evidence separately |
| empty sections | fixture with zero items | section self-hides or shows typed empty copy as specified; no dead “Show all” | isolated fixture |
| one item | one-item fixture | count `1`, no misleading pager or partial layout | isolated fixture |
| over preview limit | 13-item fixture | exactly 12 preview rows and explicit total/Show all | isolated fixture |
| 796+ Ready | catalog fixture/live public catalog read-only | at most 48 detail rows mounted; count remains 796+; paging replaces DOM | isolated + production read-only |
| several named lists | synthetic isolated storage only | one module, one summary row/list, no top-level shelf multiplication | isolated fixture |
| long list name | synthetic isolated fixture | wraps/clamps without displacing typed header actions | isolated fixture |
| long Hebrew titles | synthetic isolated fixture | bidi isolation, readable wrap, no horizontal overflow | isolated fixture |
| unavailable list work | synthetic existing payload | visible “not ready” reason, disabled open, remove remains separate | isolated fixture |
| quota fallback | force `localStorage.setItem` failure only for existing disclosure path | existing bounded content-free cookie fallback persists collapse; no fallback invented for list truth | isolated fixture |
| direct destructive safety | disposable synthetic list, never owner list | visible labeled Delete; confirmation names list/count; cancel writes zero; confirm writes once | isolated fixture only |
| remove-item safety | disposable synthetic list | action says “Remove from list”; scope one item; optional Undo restores once | isolated fixture only |
| no progress/bookmark/review writes from navigation | DB counts/snapshots before/after 20 open/close/filter/disclosure cycles | `text_progress`, `bookmarks`, `review_log` unchanged unless explicit working/bookmark/grade action is invoked | isolated DB fixture; production owner read-only may check counts only if separately authorized |
| no horizontal overflow | geometry scan on all four surfaces/locales/viewports | document and all material collection containers have zero horizontal overflow | isolated + production read-only |
| list payload compatibility | seed legacy/current payloads, render/rename/delete in disposable fixture | current lists render unchanged; no payload version/schema rewrite; legacy migration behavior unchanged | isolated fixture |
| return context | list detail→Reader→Back and page navigation | focus/page/collapse state restored without writing learner state | isolated automation |

## Stop state

The research is sufficient for an owner decision. No implementation, data migration, recommendation change, B9 work, owner destructive smoke, commit, push or deploy is authorized by this document.
