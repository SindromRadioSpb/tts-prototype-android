# Reading position + corpus disclosure — decision packet

**Date:** 2026-08-14

**Status:** IMPLEMENTATION AUTHORIZED by the owner's regression report and request to mature the behaviour

**Scope:** the reported Reading Room/Studio media-position regression, Ben-Yehuda corpus identity leak, and one shared disclosure pattern for long corpus sections

**Migration:** NONE

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
- collapse state is presentation-only and retained in memory for the current tab/session, not stored as a second durable product truth;
- focus stays on the toggle after collapse/expand; Enter and Space work natively;
- the body is a labelled region and `[hidden]` removes it from both layout and the accessibility tree;
- controls keep a 44 px minimum target and work in RU, EN, HE/RTL, desktop, and 380 px layouts.

Applied surfaces: Ben start/ready/periods/authors/works/search groups, own-text results, group-corpus results, Continue, bookmarks, finished, named reading lists, and saved searches. Small fixed navigation blocks and primary search/actions are not collapsed.

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
| Long sections | default open; toggle closes/opens; ARIA and keyboard state match; no page errors |

## 5. Release gates

1. Targeted RED tests turn GREEN for Studio media progress, Room media reopen, and corpus isolation/disclosure.
2. Existing B8 maturity, history/reading journey, media, multi-corpus, and static tests remain green.
3. Browser smoke covers RU desktop, RU 380 px, HE/RTL 380 px, keyboard disclosure, reload/reopen, and no console/page errors.
4. Version tuple is bumped consistently; only allowlisted files are committed.
5. Deploy from the scoped commit, verify served version/health, repeat the production smoke, fix and redeploy if any regression appears.

## 6. Stop conditions

Stop instead of broadening scope if a fix would require a DB migration, alter canonical rows/media truth, synthesize progress/history, delete owner data, or reopen an already-closed B0-B7 contract without new regression evidence.
