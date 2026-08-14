# Reading position + corpus disclosure — decision packet

**Date:** 2026-08-14

**Status:** IMPLEMENTATION AUTHORIZED by the owner's regression report and request to mature the behaviour

**Scope:** the reported Reading Room/Studio media-position regression, Ben-Yehuda corpus identity leak, and one shared disclosure pattern for long corpus sections

**Migration:** NONE

**Approved follow-up:** `APPROVE ROW-HIGHLIGHT: B_WORKING_ROW_WITH_PLAYBACK_OVERLAY; SCOPE=READING_ROOM_ONLY`

## 1. Boundary

This packet does not reopen B0-B7 or revise the approved B8 Reading Journey decisions. It responds to concrete post-release regression evidence. Canonical text rows, media passports, progress storage, bookmarks, corpus catalogues, and review history remain unchanged.

## 2. Evidence

### 2.1 Media learning materials lose the visible working row

The same symptom has two independent causes.

- **Reading Room:** `openReader()` restores the saved row before asynchronous media resolution has finished. When media becomes visible, `roomMediaApplyLayout()` converts the table from page scrolling to its own `.room-media-scroll` container. The logical row remains selected, but the new container starts at `scrollTop = 0`, so the reader sees the beginning. A production smoke of `3.11.377` exposed the remaining reload variant: read-only presentation restore correctly suppressed the DB write but also discarded the in-memory row needed by that late layout handoff.
- **Studio:** `v3MediaFollowTableRange()` follows timed media by scrolling the table, but does not write that row through the existing progress writer. A long karaoke session can therefore reach row 500 while the canonical continue position remains row 0.

RED browser evidence before the fix:

- Room composite media: saved/visible row 8 before close; after real card reopen `.room-media-scroll` exists, `scrollTop = 0`, the saved row is highlighted but not visible.
- Room browser reload after the first production deploy: stored row 12 remains canonical and page-level restore finds it, but the late media scroller starts at 0 because the read-only restore did not seed its session anchor. The same path was reproduced as a RED local regression before the hotfix.
- Studio media: following row 45 moves the table to `scrollTop = 4922`; stored row remains 0; resume returns to the top.

Plain own texts and baked Ben-Yehuda texts do not trigger the Room scroller transition and therefore explain the user's material-type split.

### 2.2 Ben-Yehuda contains a neighbouring corpus block

The supplied owner screenshots `C:\Users\lletp\Downloads\1408\1.png` and `2.png` show the Ben-Yehuda L1 page followed by a full `Мои тексты` shelf. Code inspection confirms that the Ben home calls a generic rail injector which unconditionally includes `injectMyTexts()` whenever the owner corpus is non-empty.

This violates corpus identity: `Мои тексты` is already a separate L1 corpus and belongs on the L0 corpus hub and its own corpus surface, not inside Ben-Yehuda.

### 2.3 Long corpus pages have no progressive disclosure

Live local inspection of Ben-Yehuda shows multiple consecutive 12-item shelves followed by period/author/work lists. The same structural issue exists in own-text, group, search, author, bookmark, finished, saved-search, and reading-list sections. Horizontal rails reduce card width but do not reduce vertical navigation cost or give the reader control over page density.

Owner-profile Kapture evidence on production `3.11.378` exposed two follow-up regressions after the first disclosure release:

- a collapsed section reopened after a normal browser reload because state existed only in a JavaScript `Map`;
- heterogeneous shelf headers let the same toggle occupy different places: most were at the inline end, while `Следующий для тебя` placed it on a separate line at the inline start.

The first owner-profile verification of `3.11.379` exposed a further real-data boundary that an isolated browser did not reproduce: the profile's `localStorage` was already effectively at quota. A one-character diagnostic write succeeded, but the 41-character disclosure payload raised `QuotaExceededError`, so the new primary store could not persist. No owner key was deleted to manufacture space. The fix keeps `localStorage` primary and falls back, only after that write fails, to one bounded SameSite cookie containing fixed-size hashes of stable disclosure keys. The fallback is content-free, remains authoritative across reload/tab reopen, and never touches OPFS, SQLite, progress, corpus rows, or review history.

## 3. Decisions

### D1 — one canonical working position

Keep the existing local DB progress row as the only Continue truth.

- A Studio media-follow row is a real working position and writes through the existing debounced progress writer.
- A Room media-layout transition repositions the already-restored logical row inside the new scroll container; it does not create a second progress store.
- A read-only history/reload restore may seed that in-memory layout anchor, while durable writes remain suppressed.
- A deliberate earlier-row visit remains the current Continue position, matching the owner's revised B8 learning-process decision.
- Explicit bookmarks remain separate named destinations.

No interpolation, derived timestamps, schema change, or media-passport rewrite is introduced.

### D2 — corpus identity stays local

- Ben-Yehuda no longer injects `Мои тексты`.
- The owner corpus remains available as its own corpus and from the L0 hub/switcher.
- Cross-corpus personal reading facts that are intentionally part of Reading Journey (Continue, bookmarks, finished items, named lists, saved searches) remain available; this change does not silently remove established navigation.

### D3 — one reusable disclosure contract

Every long corpus content block receives the same semantic disclosure control:

- sections are **expanded by default**, so no existing content becomes hidden on first visit;
- the heading remains visible and contains a real `<button>` with `aria-expanded` and `aria-controls`;
- collapse state is presentation-only and stored as a bounded, content-free local preference so it survives reload and closing/reopening the tab; it is not a second corpus/progress truth;
- `localStorage` remains the primary preference store; a compact hashed cookie is the quota-only fallback, including an explicit empty-state marker so stale primary data cannot resurrect a collapsed section after the user expands it;
- focus stays on the toggle after collapse/expand; Enter and Space work natively;
- the body is a labelled region and `[hidden]` removes it from both layout and the accessibility tree;
- controls keep a 44 px minimum target and work in RU, EN, HE/RTL, desktop, and 380 px layouts.
- every header uses the same typed grid: title in the first slot, optional secondary action next, and disclosure in the first-row inline-end slot; explanatory copy follows on row two in both DOM and visual order.

Applied surfaces: Ben start/ready/periods/authors/works/search groups, own-text results, group-corpus results, Continue, bookmarks, finished, named reading lists, and saved searches. Small fixed navigation blocks and primary search/actions are not collapsed.

### D4 — Room working row with playback overlay

The existing `text_progress.last_row_idx` remains the only durable working-position truth. Reading Room derives exactly one presentation row from it:

- `rm-row-current` plus `aria-current="location"` marks the last working row before, during, and after playback;
- the warm row background is stable, while TTS/media playback adds a blue leading rail and removes only that overlay when playback stops;
- manual scroll after its existing debounce, pointer/focus engagement in another row, TTS/media row change, Continue, bookmark, and FTS navigation all reuse the existing `recordProgress()` path;
- unrelated controls and interactions inside the same row do not clear the current state;
- Reader rerender, browser reload, and presentation reopen re-project the row from the existing session/canonical position;
- error styling remains higher priority, motion is optional under `prefers-reduced-motion`, and no live-region announcement is added;
- Studio, shared reader-core state names, schema, migrations, and progress writers remain unchanged.

RED owner-profile evidence on production `3.11.380`: the saved row was visible and canonical `last_row_idx = 2`, but idle DOM exposed no persistent class or `aria-current`; the yellow state existed only while playback classes were present or until the old jump marker was dismissed by an unrelated interaction.

First production verification on `3.11.381` found a cascade regression that isolated browser automation had not exercised: the row remained canonical/current, but focusing its play control allowed the higher-specificity shared focus/hover selector to paint the row green. The Room-only current/playback selectors were strengthened without touching `reader-core.css`, and the release gate now focuses and hovers the semantic current row while requiring the same warm base.

Repeated composite-media reload also exposed a timing race in the earlier 1.5-second read-only window: a late smooth page-scroll event could arrive after the deadline and move the DOM current marker from saved row 8 to top-visible row 6, even though row 8 remained visible. Presentation restore is now read-only until a genuine wheel/touch/key/pointer or actual playback action, so layout-settling events cannot become learner progress while subsequent learner work still uses the canonical writer.

## 4. Acceptance matrix

| Surface/material | Required evidence |
|---|---|
| Studio own text, no media | saved earlier working row reopens there |
| Studio local audio/video passport | timed follow writes the followed row; reload/resume returns there |
| Room own text, no media | reload/reopen returns to saved row |
| Room local media passport | async media mount keeps saved row visible in the inner scroller |
| Room YouTube/composite media | late layout transition keeps the same logical row visible |
| Ben-Yehuda baked work | normal resume remains correct; no `Мои тексты` shelf |
| Group corpus work | normal resume and long-list disclosure remain correct |
| Long sections | default open when no preference exists; toggle closes/opens; state survives reload and tab reopen; one typed header slot; ARIA and keyboard state match; no page errors |
| Room working row | exactly one warm `aria-current="location"` row; playback adds/removes only its blue rail; stop, Aa rerender, reload and reopen retain the warm row; moving to another row moves the single marker |

## 5. Release gates

1. Targeted RED tests turn GREEN for Studio media progress, Room media reopen, and corpus isolation/disclosure.
2. Existing B8 maturity, history/reading journey, media, multi-corpus, and static tests remain green.
3. Browser smoke covers RU desktop, RU 380 px, HE/RTL 380 px, keyboard disclosure, reload/reopen, and no console/page errors.
4. Version tuple is bumped consistently; only allowlisted files are committed.
5. Deploy from the scoped commit, verify served version/health, repeat the production smoke, fix and redeploy if any regression appears.

## 6. Stop conditions

Stop instead of broadening scope if a fix would require a DB migration, alter canonical rows/media truth, synthesize progress/history, delete owner data, or reopen an already-closed B0-B7 contract without new regression evidence.
