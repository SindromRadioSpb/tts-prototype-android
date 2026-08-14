# Section and material-contract matrix

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit / branch | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` / `main` |
| Dirty tree | `DIRTY`, 34 pre-existing porcelain entries at baseline; preserved |
| Production | `https://linguistpro.kolosei.com/library.html#room=benyehuda`, served `3.11.384` |
| Method | screenshot comparison + production DOM/geometry + renderer/CSS/test inspection |
| Evidence classes | `OWNER_SCREENSHOT`, `OWNER_LIVE_READ_ONLY`, `CODE`, and inspected-but-not-run `ISOLATED_AUTOMATION_CODE` kept separate |
| Limitations | keyboard/AT and 200% behavior of the future design is not tested; performance estimates are architectural, not a new trace |

## Horizontal rails vs vertical rows

| Criterion | A — horizontal rail | B — vertical compact rows | C — adaptive mixed |
|---|---|---|---|
| Visual scanning | strong for image-led covers; weak for text-heavy Hebrew metadata and cross-item comparison | strongest for title/author/reason/status comparison | useful only if the exceptions are explicit (hero/editorial media), otherwise users must relearn layout |
| Visible quantity | viewport hides most items; count is not embodied by the list | predictable one-row-per-item density | depends on section; may weaken consistency |
| Hidden items | nested horizontal scroll and partial card | ordinary document flow; “Показать все” is explicit | risk persists in whichever sections keep rails |
| Mouse wheel | vertical wheel does not naturally reveal horizontal-only content | native page scroll | needs special handling for rail exceptions |
| Trackpad/touch | workable, but produces nested-scroll competition | native and predictable | acceptable for deliberate media carousel only |
| Keyboard | tab can move focus into visually off-screen cards; no section-level arrow-key contract | DOM order and visual order align; links/buttons remain visible | must document two navigation models |
| 380px | production rail shows `341/1726px`; only ~2 cards fit | full-width row uses available measure | acceptable if rail is excluded from working collections |
| 200% reflow | nested rail remains a second axis and card metadata wraps/clips | rows can stack actions under text | mixed testing cost is higher |
| HE/RTL | negative `scrollLeft` semantics and reversed discovery are browser-sensitive | logical inline layout is simpler; bidi can be isolated per title | rail exceptions still need full RTL behavior |
| Partial card | deliberate affordance but visually resembles clipping | none | only acceptable for explicit editorial carousel |
| DOM/performance | card chrome repeated; 12 is bounded but every named list currently renders up to 300 | compact markup; still requires paging for 796+/300 | safe only with the same bounds |
| Information density | low; repeated badges consume most card area | high; title and reason/status can align | can reserve a hero for one expressive action |
| Recommendation | reject for working material collections | **recommend** | retain only outside collection lists: global/corpus hero, Today actions, period/corpus doors |

Decision D3 is therefore B for material collections, with a narrow clarification: hero/action modules are not “collections” and need not become rows. This is not C’s per-section inconsistency; every repeated list of works uses rows.

## Shared row skeleton, typed semantics

Proposed structural contract:

```text
article.room-material-row[data-material-kind][data-state]
  a.room-material-primary
    span.title (bidi-isolated)
    span.creator-or-source
  div.room-material-reason
  div.room-material-status
  span.room-material-primary-label
  details/button.room-material-secondary-actions
```

The skeleton is shared; content is not homogenized:

| Kind | Required identity | Required truth-specific content | Primary action | Secondary action | Must not claim |
|---|---|---|---|---|---|
| Continue | title + source/corpus | last working row or honest position, media state | Continue at saved row | mark finished only as clearly labeled separate action | monotonic completion/furthest point |
| Bookmark | title + passage snippet | exact sentence/order pointer | Open bookmark | remove bookmark, separately labeled | generic saved work or Continue |
| Finished | title + source | asserted finished state; if partial, “marked” + honest position | Open/resume | remove finished mark | automatically completed because scrolled near end |
| Next for you | title + author | explicit recommendation reason and confidence/provenance | Start/Continue | author/details | unexplained personalization or fabricated comprehension percentage |
| Reading-list item | title + author | list membership; not-ready reason when applicable | Read when ready | “Убрать из списка” with optional undo | bookmark, availability or sync that does not exist |
| Ready | title + author | readiness/provenance, audio/media coverage, optional familiarity only when valid | Read | add to list, author/details | human review/audio/familiarity when absent |
| My Text | title + owner identity | level/provenance and last row when present | Read/Continue | existing enrichment menu | corpus-derived difficulty without ingredients |
| Study Song | title + artist/position | assignment/catalog identity, audio coverage, learner state | Read/Continue | share/details | group progress shared with owner/other learners |

## D4 density and bounds

Recommended constants and behavior:

- L0 Ready remains `4` rows: it is a navigation preview, not the catalog.
- All other collection previews use the already-gated `ROOM_PREVIEW=12`; no count is reduced without new owner evidence.
- “Показать все” opens/replaces a bounded page of `ROOM_BROWSE_PAGE=48` rows.
- Page navigation replaces the prior 48-row window and preserves focus/return context. It does not append indefinitely.
- Ben’s current full Ready renderer appends `CORPUS_PAGE=60` until all 796 are mounted; the approved implementation should replace this with bounded pages.
- Group corpus currently grows by 48 on each click; it should also replace/window pages.
- Named lists currently render every item up to 300; the module preview must stop at 12 and its detail at 48/page.
- Virtualization is backlog, not immediate. A 48-row replacement page is simpler for keyboard/screen readers and meets the current performance budget. Add virtualization only after measurement shows it is necessary.
- Empty, one-item and unavailable-item states remain explicit. Counts always describe the full result set, not only mounted rows.

## D5 shared section header

The accepted disclosure behavior stays authoritative. The target DOM grammar is:

```text
section[aria-labelledby=<stable heading id>]
  header.room-section-head.room-long-list-head
    h2#<stable heading id>.room-long-list-title
      title
    span.room-section-count
    button.room-section-secondary-action?  # e.g. Show all
    button.room-section-toggle
      aria-expanded=true|false
      aria-controls=<region id>
      data-disclosure-key=<stable content-free key>
  p.room-section-explanation
  div#<region id>.room-long-list-body[role=region]
```

Contract requirements:

- title, count and action are separate nodes; no count hidden inside a long localized heading;
- disclosure remains in the accepted typed first-row right slot and explanatory copy stays on row two;
- `aria-expanded` and `aria-controls` always match `[hidden]` state;
- the controlled region has an accessible label/labelled-by relationship;
- toggling does not recreate or reorder learner data;
- collapsing from the header leaves focus on the disclosure; opening a detail view places focus predictably and Back returns it;
- stable state continues through `room.longListDisclosure.v1` with the existing bounded cookie fallback;
- locale changes repaint visible text and accessible names; the live HE stale-Russian regression gets a focused test;
- RU/EN/HE and RTL use the same DOM order; bidi is isolated per content string;
- no bare `✕` is accepted as the visible label for list deletion or item removal.

## Named-list module contract

At L0, one “Списки для чтения” module presents named-list summary rows:

```text
list name | total count | ready/not-ready count | Open | More actions
```

Opening a list displays typed material rows and a bounded 48-row page. The module must say that the current payload contains Ben-Yehuda catalog works and is stored on this device. L0 ownership is navigation ownership, not evidence that lists are already cross-corpus. Immediate actions:

- Rename — updates the existing `name` property through the sole list writer; no format change.
- Remove item — visible “Убрать из списка”, scoped to one item, ideally reversible with Undo.
- Delete list — visible “Удалить список…”, marked destructive, confirmation names the list and item count. No bare glyph and no string-match automation.

Pin/show on Library Home, hide and archive are legitimate target capabilities but require persisted metadata and unresolved semantics. They belong in backlog under D6. A collapsed module is presentation state; it is not “hidden/archived”.

## Existing reusable code

- `renderCorpusWorkRow()`, `renderMyTextCard()` and the group row already prove sibling primary/secondary controls.
- `corpus-item-presenter.js` already preserves semantic distinctions among Ben, My Texts and group items.
- `attachRoomLongListDisclosure()` already owns the accepted ARIA and persistence contract.
- `ROOM_PREVIEW=12` and `ROOM_BROWSE_PAGE=48` are existing bounded policies.

The implementation should extend these contracts, not create a universal “card” that erases source semantics or a second persistence layer.
