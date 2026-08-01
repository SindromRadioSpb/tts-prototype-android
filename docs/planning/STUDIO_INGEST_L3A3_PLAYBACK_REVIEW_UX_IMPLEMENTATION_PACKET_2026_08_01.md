# Studio Ingest L3a.3 — Playback Review UX

> **Date:** 2026-08-01  
> **Status:** OWNER-APPROVED IMPLEMENTATION + PUSH/DEPLOY/LIVE-TEST  
> **Parent:** `STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`  
> **Shipped baseline:** `82a392e6`, client `3.11.283`, browser migrations `46`  
> **Scope:** browser-local UX and deterministic cue/row navigation; no schema or provider-contract change

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

  262  previous row — compact read context
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

When follow is active, the current row/group is placed at the second useful viewport
slot rather than merely made visible.

- Target top is approximately 28–32% of the scroll viewport, adjusted for sticky header
  and the measured previous compact row.
- Clamp normally at the beginning/end of the list.
- Scroll only when cue/range identity changes, never on every media time update.
- Playback follow uses `behavior:"auto"`; manual row/cue selection may use `smooth`.
- The main generated table adopts the same anchor policy for `smk-row-active` ranges.
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
4. Follow gate: active row is anchored in the second slot; repeated time updates do not scroll.
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
- **R4:** follow pause/resume and second-slot anchor.
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
row(s) remain visible with previous/current/next context; the owner can review one field
family at a time; manual browsing/editing is never fought by follow; both directions use
exact caption identity; no navigation causes model/canon mutation; desktop/380 RU/HE and
prod browser gates pass on the actually served release.
