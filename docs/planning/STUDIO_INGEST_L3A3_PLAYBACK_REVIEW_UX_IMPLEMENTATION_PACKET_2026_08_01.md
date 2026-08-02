# Studio Ingest L3a.3 — Playback Review UX

> **Date:** 2026-08-01  
> **Status:** SHIPPED `v3.11.287` / `2e8f4bf355a2babc0de619bfca817d1fff74b44f`;
> AUTOMATED PROD PASS; OWNER-OBSERVED REAL-MATERIAL FOLLOW remains PARTIAL OWNER PASS
> **Parent:** `STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`  
> **Shipped baseline:** foundation `82a392e6` / `3.11.283`; mapping/follow correction `3589c0ee` / `3.11.286`; browser migrations `46`
> **Scope:** browser-local UX and deterministic cue/row navigation; no schema or provider-contract change
> **Subsequent program state:** P2 Portable Learning Package v2 shipped independently as
> `v3.11.289` / `da30fdbaf79f6751bee74406f73b093be742e76b`; this does not alter the
> L3a.3 truth/authority contract. P3 real iPhone continuity is next and owner-gated.

## 0. Owner authorization

The owner approved the UX direction discussed against the real 36:17 / 514-row
material and gave this exact execution instruction:

> **Утверждаю. Формализируй, чтобы не потерять контекст, затем реализуй требования. Затем выкати на прод. Затем протестируй. В случае обнаружения багов или недочётов исправь, выкати на прод и протестируй повторно.**

This authorizes one coherent implementation/deployment loop for the requirements
below, including bounded repairs discovered by local or live verification. It does not
authorize production/server schema or data mutation, provider-default changes, cloud
sync, Hermes, L2/L4/L5/L6, full-media ZIP, or unrelated production cleanup.

## 1. Owner-observed problems

### 1.1 Material Workspace does not follow playback

The Transcript layer follows the current media cue, but the Learning Table layer does
not select or reveal the row(s) mapped to that cue. On a real 514-row material the owner
must search and scroll manually while the player continues.

### 1.2 Learning rows are too tall for contextual review

Every row currently renders all five learning fields as permanent textareas in a
two-column grid. Fixed textarea minimum height plus labels/provenance means the viewport
often contains only one partial learning row; the Russian field may be below the fold.

### 1.3 Main table follow anchors at the bottom edge

The shipped source-media follow path uses `scrollIntoView({block:"nearest"})`. When the
next active row enters from below it stops at the last visible position, leaving no
preview of what comes next.

### 1.4 Material Workspace has no field-focus controls

The ordinary table can hide broad columns, but the revision Workspace always shows all
five fields. This blocks the owner's sequential review loop: plain Hebrew → niqqud →
Latin transliteration → Russian transliteration → Russian translation.

## 2. Product decision

Implement a single **Playback Review** model, not four unrelated patches:

```text
[● Следовать за аудио]  [Все поля ▾]  [263 / 514]

╭──────────────────────────────────────────────────────╮
│ ▶ 263  CURRENT — expanded editor + provenance        │
╰──────────────────────────────────────────────────────╯
  264  next row — compact read context
  265  next row — compact read context
```

The signature element is one restrained teal playhead rail connecting playback state
to the current learning row. It moves to the inline end in RTL. There is no decorative
animation; playback transitions use immediate positioning and manual navigation may use
short smooth motion unless `prefers-reduced-motion` is set.

## 3. Cue ↔ learning-row synchronization

### 3.1 Contract

`StudioMediaEditor` publishes the selected/current `caption_segment_id` only when the
cue index changes. `MaterialRevisionWorkspace` accepts that identity and derives linked
rows from the current immutable/draft row set. No timestamp heuristics and no provider
call participate in the mapping.

The reverse direction is equally explicit: selecting a mapped learning row requests
the owning caption segment through `StudioMediaEditor.selectCaptionSegment(...)`, which
stages the current cue safely, moves the player to the cue start, and renders both
layers. Unmapped rows never seek a guessed cue.

### 3.2 Honest 0/1/N behavior

- `0`: show `Для этой реплики нет учебной строки` and an explicit local `Добавить строку` action;
- `1`: select the single linked row;
- `N`: mark the whole mapped group, select one row within it, and show `Строка X из N`;
- a row with one `caption_segment_id` may still carry N source-segment identities;
- mapping conflict remains fail-closed and never enables targeted regeneration by inference.

### 3.3 Follow state

`Следовать за аудио` is enabled by default per Workspace and stored device-locally.

- Playback or explicit cue navigation updates highlight even when follow is paused.
- Wheel/touch scrolling inside the learning list, pointer selection, or focus in an
  editable field pauses automatic positioning.
- The UI shows `Вернуться к реплике N`; only that explicit action resumes and reanchors.
- Changing field preset must not resume follow implicitly.
- Opening/reopening the Workspace selects the current cue without writing a revision.

## 4. Context anchor

When follow is active, the current row/group is placed at the first useful viewport
slot rather than merely made visible. This is the owner's 2026-08-02 superseding choice:
the active editor begins the visible stream and all remaining height prepares the next rows.

- Target top is the top of the learning-row scroll viewport, adjusted only by the browser's
  normal clamping at the beginning/end of the list.
- Clamp normally at the beginning/end of the list.
- Scroll only when cue/range identity changes, never on every media time update.
- Playback follow uses `behavior:"auto"`; manual row/cue selection may use `smooth`.
- The ordinary generated table is not changed by this Workspace-specific owner refinement.
- If the user manually scrolls the ordinary table, later playback segment changes may
  resume follow because that surface has no editing draft; the Workspace requires the
  explicit resume contract above.

## 5. Row density and editing

Permanent textarea grids are replaced by a view/edit hybrid:

- only the selected learning row is expanded as an editor;
- other rows render compact, selectable read-context with bounded line clamping;
- the active editor uses two paired columns on desktop:
  `עברית / ניקוד`, `Translit / Транслит`, then full-width `Русский`;
- mobile remains one full-width field per line;
- active textareas auto-fit content up to a bounded height, then scroll internally;
- focus, selection and IME composition are preserved; a playback transition never
  destroys the focused editor;
- current, mapped-sibling and context states are distinguishable without color alone;
- user authority/manual lock and invalidated/conflict provenance remain visible.

The target is not a promise that every pathological long cue fits. For ordinary short
captions the viewport must expose previous context, the current editor and at least one
following row.

## 6. Field review modes

Primary control is a compact segmented/selectable review mode; advanced `Поля…` keeps
individual visibility toggles.

| Mode | Primary editable field | Always-visible reference |
|---|---|---|
| `Все` | all five | — |
| `Иврит` | `he_plain` | current Transcript cue |
| `Никуд` | `he_niqqud` | `he_plain` |
| `Latin` | `translit` | `he_niqqud` |
| `Рус. транслит` | `translit_ru` | `he_niqqud` |
| `Перевод` | `ru` | `he_plain`, `he_niqqud` |
| `Свои поля` | checked fields | none beyond checked fields |

Rules:

- modes only change presentation; they do not change authority, dirty mask or canon;
- custom visibility cannot result in zero visible fields;
- settings are local and separately keyed from the ordinary table settings because the
  Workspace has five distinct fields, including two transliterations;
- controls are keyboard-operable, named, and usable at 380 px without horizontal page overflow;
- HE locale preserves RTL shell ordering while Latin/Russian field direction remains correct.

## 7. Non-mutation invariants

The following actions must issue zero provider requests and zero revision writes:

- media playback and seeking;
- cue/row selection and automatic follow;
- follow pause/resume;
- field preset or custom visibility changes;
- compact/expanded row transitions;
- opening the already-promoted material after initial lazy promotion.

Manual field edits retain existing user-lock behavior. Save/regenerate/full-rebuild
semantics and stale-base protection remain exactly as defined in the parent packet.

## 8. Accessibility and performance

- Current row uses `aria-current`; mapped group and follow status have text equivalents.
- Follow pause/resume status is announced once, not on every media tick.
- No focus stealing on playback transitions.
- Keyboard: row selection seeks only on explicit activation; tab order follows visible fields.
- `prefers-reduced-motion` disables smooth manual positioning.
- Cue transition work is O(rows) at the current 514-row scale or better and runs only on
  cue identity changes; a cached caption→row index is preferred.
- No list rerender on media `timeupdate` when the active cue did not change.

## 9. Red-before-fix and regression gates

1. Pure focus model: 0/1/N mapping, active group, selected row, field-mode visibility.
2. DOM gate: only active row has editable controls; compact rows preserve all visible text.
3. Player gate: cue changes select exact mapped rows; row activation seeks exact cue.
4. Follow gate: active row is anchored in the first slot; repeated time updates do not scroll.
5. Pause gate: wheel/touch/focus pauses positioning; explicit resume reanchors.
6. Main table gate: current media row has previous and next context when available.
7. Mutation gate: navigation/mode/follow operations cause zero provider calls and no revision advance.
8. Desktop RU/LTR and HE/RTL visual inspection.
9. Chrome-like 380×844: no page overflow, usable field controls, sticky player/navigation/actions.
10. Existing material revision, media package, media karaoke, i18n and docs gates remain green.

## 10. Engineering sequence

- **R0:** freeze this packet and owner authorization.
- **R1:** red pure focus/anchor tests.
- **R2:** cue identity bridge and cached 0/1/N row index.
- **R3:** active/context row renderer with focus-safe partial updates.
- **R4:** follow pause/resume and first-slot anchor (superseding the initial second-slot design).
- **R5:** review presets plus custom field popover.
- **R6:** replace ordinary-table nearest follow with shared/testable anchor math.
- **R7:** RU/HE desktop/380 browser and accessibility checks.
- **R8:** version bump, scoped commit, production preflight, push/auto-deploy.
- **R9:** wait for served SW/HTML/client-config equality, live browser test, bounded repair loop.

## 11. Deployment stop conditions

Stop without workaround if:

- implementation needs a server API/schema/data mutation;
- navigation triggers provider work or advances a revision;
- a manual locked field changes without explicit edit;
- focus is lost while the owner types because playback advances;
- 0/1/N mapping is guessed or ambiguous;
- prod health/DB/migrations regress;
- served SW/HTML/client-config do not converge to the same version;
- deployment requires Docker/image cleanup not separately authorized.

## 12. Definition of Done

Done means the real-media review loop can play continuously while the correct learning
row(s) remain visible with the current row first and following-row context; the owner can review one field
family at a time; manual browsing/editing is never fought by follow; both directions use
exact caption identity; no navigation causes model/canon mutation; desktop/380 RU/HE and
prod browser gates pass on the actually served release.

## 13. Owner-approved corrective addendum: Review Stream + legacy mapping repair

### 13.1 Authorization and observed production gap

After reviewing the first production implementation on the real 514-row material, the
owner approved the corrective recommendations and issued this execution instruction:

> **Утверждаю рекомендации. Стартуй и реализуй. Протестируй. Исправь баги, если обнаружишь. Протестируй после исправления багов, если такое будет. Выкати на прод. Затем я проведу ручной smoke-check**

The screenshots prove two separate defects. Compact context used an 11.5 px font and
one-line ellipsis, so the visible playback trail hid the learning content. More
importantly, the same card followed audio in the ordinary Studio table but reported
`0 · нет связи` in Material Workspace: its legacy promoted table revision did not carry
`caption_segment_id`, although the existing offline text aligner could prove the exact
row-to-caption relation.

### 13.2 One mapping authority; no guessed repair

The existing `AsrTranscript.alignRowsToSegments` proof is the only recovery algorithm.
Both the ordinary Studio timing path and Material Workspace consume its exact
`rowSegIdx` result. A recovery candidate is valid only when all of the following hold:

- alignment reports `ok` and covers every learning row;
- row indices are integer, in-range and monotonic;
- every referenced corrected segment has a stable `caption_segment_id`;
- any already-persisted caption identity agrees with the proof;
- the exact bound caption revision id and SHA match the table revision.

Failure is explicit and read-only. There is no positional fallback, timestamp heuristic,
partial repair or provider call. A valid candidate is shown as a local, zero-model action.
Only the owner's explicit confirmation creates one new immutable table revision, with
`aligned-offline`, algorithm version, counts and bound revision provenance. Text and
field authority are byte-for-byte preserved. Stale-base protection remains mandatory.

Fresh saves persist the same proven `rowSegIdx` into browser-local source metadata before
creating the text binding, so new cards do not need recovery. Legacy v1 bindings remain
readable and are promoted idempotently; no migration beyond existing browser v46 is
introduced.

### 13.3 Playback Review Stream presentation

Default mode is a continuous Review Stream, not a permanent textarea matrix:

- previous/current/next visible rows show every selected field in full; default mode has
  no ellipsis, one-line clamp or hidden overflow;
- only the selected row is editable; context rows are selectable, complete read views;
- the current row keeps the restrained teal playhead rail and first-slot anchor;
- Hebrew plain uses 18–19 px in the editor and at least 16 px in context; niqqud uses
  19–20 px with a generous line height; transliterations and Russian use 15–16 px;
- metadata stays secondary at 11–12 px and provenance can be hidden without changing it;
- device-local `Вид` controls provide 100/115/130% text scale, Comfortable/Overview
  density and provenance visibility. They are presentation preferences only.

The field families use restrained, accessible semantic tints rather than arbitrary
per-cell formatting. Canonical learning content does not acquire font, fill or color
properties. A future annotation layer, if ever approved, must remain non-canonical.

### 13.4 Honest follow states

Follow has four user-visible states: active, manually paused, unavailable because exact
mapping is absent, and conflict requiring manual reconciliation. The UI must never show
`Следование включено` together with `Нет связанной учебной строки` when the entire table
mapping is absent. A valid legacy repair candidate replaces that contradiction with the
explicit recovery action and its exact `mapped/total` count.

### 13.5 Corrective gates

1. Red-before-fix pure tests cover 1:N recovery, complete coverage, monotonicity,
   persisted-identity disagreement and content/authority preservation.
2. Save-path regression uses the real `{o,t}` timing shape plus proven `rowSegIdx`.
3. Browser smoke starts from a legacy binding with no caption ids, confirms unavailable
   follow, performs the explicit repair, observes revision `v1 -> v2`, then follows 1:N.
4. Default computed styles prove full context text and the approved readable type floor.
5. Navigation, appearance controls and recovery preview make zero provider calls; only
   confirmed repair advances the immutable local revision.
6. Existing split/merge conflict, stale-base, 514/2800 performance, RU/LTR, HE/RTL and
   380 px no-overflow gates remain green.

### 13.6 Corrective completion criterion

The corrective slice is complete only when a real legacy material can recover its exact
mapping locally, follow playback row-by-row with the current row and upcoming trail visible,
show the selected field content without truncation at readable sizes, and retain one
immutable mapping authority across later saves and reopenings.

## 14. Owner-approved first-slot and compact-header polish

On 2026-08-02 the owner verified the repaired real material at revision `v2`: playback
selects the correct learning row and the Workspace shows the mapped stream. The remaining
polish is deliberately presentation-only:

1. In Workspace follow mode the selected playback row is the first visible row, not the
   second. Previous context remains reachable by scrolling; the visible budget is spent on
   the current editor and upcoming rows.
2. The table header has one semantic desktop line in this order:
   `Учебная таблица` → current/affected/conflict status → `История` + revision selector.
   Revision number remains adjacent to the title; the verbose local/immutable badge is
   visually suppressed because the history control already communicates the revision model.
3. At 380 px the same semantic order wraps predictably to two rows; HE/RTL mirrors inline
   order without changing Latin/Russian field direction.
4. No schema, revision, mapping, provider, field-authority, dirty-mask or OPFS data contract
   changes. Playback/header operations remain zero-call and zero-write.

Additional gates:

- pure anchor test proves `anchor_slot:first` ignores previous-row height;
- desktop browser geometry requires active offset ≤8% and at least one following row visible;
- header DOM order is title/status/history, vertically center-aligned on desktop;
- RU/LTR and HE/RTL 380 px screenshots have no horizontal overflow.

## 15. Production closure — 2026-08-02

- Auto-deploy container start: `2026-08-02 02:19:01 +03:00`.
- Actually served: HTML `APP_VERSION=3.11.287`, service worker
  `CACHE_VERSION=v3.11.287`, browser migrations `46`.
- Three consecutive cache-busted HTTP probes returned byte-identical release
  `index.html`, `sw.js`, `material-revision-core.js` and
  `studio-material-revision.js` with correct status/content types.
- Ephemeral Chromium `148.0.7778.96` / Playwright `1.60.0` ran the production-base
  browser gate at desktop RU, 380 px RU/LTR and 380 px HE/RTL. First-slot offset was
  approximately `0.07%`, a following row was visible, header order was
  title → state → history, horizontal overflow was absent, provider-call count was
  `0`, and page-error count was `0`.
- No release defect was found; no fix commit or second release push was required.
- Production health, database and migrations passed. Final disk after the separately
  approved pre/post-deploy cleanup was `79%` used with `7.69 GiB` free and
  `disk_warn=false`.
- Evidence status is `AUTOMATED PROD PASS`. The owner's earlier real-material repair/follow
  observation remains `PARTIAL OWNER PASS`; provider/fault/two-tab owner ceremonies were
  not inferred from automation.
