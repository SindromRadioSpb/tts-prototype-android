# Direction 9 — Target × Type Redesign Proposal

**Date:** 2026-05-12.
**Context:** Mid-Phase-9.3.5 (Workstream B shipped 2026-05-11). User dogfood revealed that the current polymorphic-everything model leaks complexity to the user. This doc re-examines the concept, reviews the market, proposes three redesign options, and recommends a path forward.

**Posture:** This is NOT a stopgap fix. It's a foundation-level redesign. Premium-product quality is the bar.

---

## 1. What the user observed (verbatim, 2026-05-12)

> **Scenario 1 — same-row, type switch breaks the mental model**
> 1.1 — In the edit modal, I press «▶︎ Играть» (the audio play button next to «🎧 Аудио:»). The «📍 Привязать к аудио» button stays disabled. Anchor doesn't get set.
> 1.2 — I save the first note (type=Free, body filled). Without closing, I switch type to Слово and press Save. Toast says «Заметка сохранена», but the «🕒 История» panel doesn't open afterwards. Going back to Free, history works again.
> 1.3 — Closing and re-opening: there's only ONE note showing on the row, of type Слово. But opening it, I see the Free body **AND** the Слово fields both filled. **It's unclear what's being saved and what isn't. Either the mechanic or the interface needs to be reworked for an intuitive premium feel.**
>
> **Scenario 2 — Target × Type combinations fail with cryptic errors**
> Trying combinations:
> - Type=Грамматика + Target=Биньян → toast «Укажите тип заметки», can't save.
> - Type=Грамматика + Target=Корень → same.
> - Type=Грамматика + Target=Заметка → same.
> - But Type=Грамматика + Target=Слово/Строка/Текст/Свободная → saves fine.
> - Type=Свободная + Target=Корень/Биньян/Заметка → won't save.
> - Type=Слово, Произношение + Target=Корень/Биньян/Заметка → won't save.
> 2.1 — **Way too complex for the user — huge noise and variations. Needs a fundamental rework with prior research.**
> 2.2 — **Neither a new user nor an experienced one should have to keep "what works with what" in their head. It must be intuitive.**

The user asked to: re-examine the concept, study the market, propose multiple premium implementation options. **No errors that hurt the customer experience. Not a stub, not a stopgap.**

---

## 2. Diagnosed root causes

### Bug 1.1 — anchor button stays disabled after «Play»

`v3NotesAnchorAudioBelongsToModalRow()` returns true only when `rowPlayingRowIdx === modalIdx` OR `aud.src && currentTime > 0`. If Row TTS triggers fresh `/api/tts` generation and the user clicks the modal's «Play» button:

- If the row has no `audio_asset_key` yet (no prior TTS), Row TTS proxies to `/api/tts`, which on prod returns audioContent base64. The audio element gets a blob URL.
- During the generation, `rowPlayingRowIdx` is set to the row idx, and `currentTime` should advance.
- But the modal's anchor live-time tracker hooks `timeupdate` only on the SHARED `rowAudioPlayer` instance. If the play started AFTER the modal's listener was attached, fine. If the player was reset by another flow in parallel — flake.

**Working hypothesis**: the modal opens BEFORE audio is loaded, anchor stays disabled, user clicks Play, audio plays, modal *should* re-evaluate `v3NotesAnchorAudioBelongsToModalRow` on next `timeupdate`. But the modal's anchor UI only re-checks `belongs` inside `v3NotesAnchorStartLiveTime`, which itself bails when "not belongs" — so once it's been disabled, no event fires to re-enable it.

**Severity**: real bug, but symptom of a broader UX issue. The modal's anchor row should be reactive to playback state changes, not snapshot-at-open.

### Bug 1.2 — Save after type-switch, history doesn't open

When `note_type` is changed inside the modal, `v3NotesSetNoteType` swaps form visibility. `v3NotesSave` runs validation against the *current* (new) type and persists. But:

- `v3NotesHistoryToggle` reads `v3NotesModalNoteId` and lists versions. For non-free types the noteId is set; versions should appear.
- The toast lands but history was on FREE mode previously — switching to Word type closes the sidebar (via `v3NotesHistoryClose` called by `v3NotesSetNoteType`? — actually not directly, but the sidebar IS the same element regardless of type).

**Working hypothesis**: `v3NotesHistoryClose` is called from somewhere on type switch (or the sidebar is hidden by template-render swap because it lives inside `v3-notes-md-split`, the same container as the markdown editor). When the markdown editor is `display: none`, the sidebar (nested inside it) is too.

That's the real bug: **the history sidebar shares container with the markdown editor**. When type is non-free, the markdown editor (and its sidebar) are hidden together. Sidebar should be a peer of the body, not a child of it.

### Bug 1.3 — Two type-fields visible after reopen

The fundamental cause is the stash interaction with `v3NotesLoadFullNoteIntoModal`:

1. User creates a Free note → saves. Cache populated with the free body.
2. User switches to Word in the same modal → stash[free] = current textarea (free body) → Word form opens empty.
3. User fills word fields → saves. DB now has `{ note_type: 'word_study', body_json: {kind:'word_study', word:'…', meaning:'…'} }`. The free body is lost.
4. User closes, reopens the modal:
   - `v3NotesOpen` reads cache → textarea pre-filled with the STALE free body ("first comment").
   - `v3NotesLoadFullNoteIntoModal` async kicks in → sees DB type is `word_study`, calls `v3NotesSetNoteType('word_study')` which **stashes the textarea content into stash[free]**.
   - Word form hydrated from body_json.
5. User switches to Free → stash[free] restored = "first comment" (the GHOST of the original free body).

**The user sees data for two types**. The system has no concept of "this note used to be free, and that text is dead history".

**Severity**: critical UX bug + a sign the entire model is wrong. Type-switching after persistence makes no semantic sense.

### Bug 2 — Cryptic target_id-missing errors

Inside `v3NotesSave`:

```js
const tkindNeedsId = (v3NotesModalTargetKind !== "free");
let targetIdToUse = v3NotesModalTargetId;
if (v3NotesModalTargetKind === "root" || ... === "binyan" || ... === "word" || ... === "note") {
  const input = document.getElementById("v3NotesTargetIdInput");
  const v = String((input && input.value) || "").trim();
  if (v) targetIdToUse = v;
}
if (tkindNeedsId && !targetIdToUse) {
  showToast("Укажите цель заметки", "error");
  return;
}
```

For target_kind ∈ {root, binyan, note}, the user must fill the target_id input. The toast message in the user's report ("укажите тип заметки") is actually "укажите ЦЕЛЬ заметки" — the user mis-typed in their report. But the result is the same: no clear visual signal of what's required *until* you try to save.

For root/binyan/note targets, the target_id input is shown via `v3NotesShowTargetIdRow(true, label, placeholder)`. But:
1. The label and placeholder are subtle; users miss them.
2. The required-ness is implicit. No red asterisk, no inline validation.
3. Some target+type combinations make no sense (e.g., target=Binyan + type=Pronunciation), but UI offers them anyway.

**The 7 × 5 = 35 combinations leak complexity to the user and the user has to learn them empirically.**

---

## 3. Concept re-examination

### Original concept (Direction 9 brief)
> "Replace the current single-note-per-sentence model with category-defining premium notes (audio-anchored, polymorphic targets including Hebrew root/binyan, structured templates, bidirectional links + backlinks, versioning with diff, note→SRS micro-cards, cross-text smart-collections)."

The flaw isn't in the goals — it's in giving the user a UI that exposes the polymorphism instead of orchestrating it.

A learner doesn't think *"I want a polymorphic note with target_kind=root and note_type=word_study."* They think:
- "I want to remember **this word**."
- "I want to capture **this rule**."
- "I want to fix in mind **how to say** this."
- "I want to comment on **this row**."

These are *intents*. The system should give the user **intents-as-buttons** and infer target_kind + note_type from intent + context.

This is what Phase 9.3.5.B's quick-pick was meant to be — but it's currently a thin sugar layer on top of a still-exposed underlying matrix.

### Polymorphism is a feature for queries, not for UX

The schema's polymorphism is the *right* foundation for:
- Cross-text aggregation ("all my Hebrew vocab cards").
- Backlinks ("everything that references root שלם").
- Smart-chips filters.

But the polymorphism should be **invisible to the user authoring a note**. They should never have to choose a target_kind. The intent + context determines it.

---

## 4. Market research

I surveyed how comparable tools handle this trade-off between structure and freedom.

### 4.1 Anki (gold standard for spaced-repetition)
- Notes have a **Note Type** (fixed at creation, has fields, has card templates).
- Changing a note's type is a destructive operation behind a Tools → Manage Note Types menu — explicit migration with field mapping.
- New note = new type chosen up front from a dropdown.
- Lesson: **type is identity, not a property to flip mid-write**.

### 4.2 Pleco (Chinese learning + dictionary)
- A "card" has fixed fields: hanzi, pinyin, definition, sample. One shape.
- No type concept. Custom fields possible per-user but globally, not per-card.
- Lesson: **prescribed structure prevents user confusion at the cost of flexibility**.

### 4.3 LingQ (multi-language reader + vocab)
- Vocab is the only user-authored note. Status states (new/learning/known) are the only variable axis.
- A word's notes panel has free-text below it. No types.
- Lesson: **even casual learners want vocab cards; nothing else**.

### 4.4 Obsidian (extensible markdown PKM)
- Every page is markdown + optional YAML frontmatter. The frontmatter is the type signature.
- Templates are snippets — user copies a template into a new page.
- A page can be "any kind" via tags/frontmatter, but the user CHOOSES at creation.
- Lesson: **the user's first action sets the kind**.

### 4.5 Notion (database-driven PKM)
- Databases have properties of typed kinds. Each row in a database has one type (the database's type).
- Cross-database mixing requires explicit linked relations.
- Lesson: **structured data wins when each item lives in its own collection**.

### 4.6 RemNote (spaced-repetition + notes)
- Has a concept of "concept", "descriptor", "fact" — like a sense of types.
- Strict relationships: concept ← descriptor ← fact. UI enforces hierarchy.
- Lesson: **hierarchical types disambiguate cross-references**.

### 4.7 HelloChinese / Speak Hebrew / DuoCards / Tandem (consumer language apps)
- Either zero user notes, or one-shape vocab cards.
- Lesson: **simplicity wins for the casual segment; we differentiate via depth, not by exposing complexity raw.**

### 4.8 Common pattern across all premium tools

**Type/kind is decided at note creation, then it's identity.** Users don't switch types mid-edit. To "change" a type, you delete + recreate (or in Anki, use the manual migration tool).

**Target / context is inferred from where the user is when they create the note.** No tool asks "what is the target_kind?".

Our current model violates BOTH of these. That's the source of the friction.

---

## 5. Three implementation options

All three options keep the schema (notes_v2 + polymorphism in DB) intact. The difference is in the UX shell around it.

### Option A — Lock at creation (premium-safe)

**Rules:**
- Note's `note_type` and `target_kind` are decided when the note is created.
- After creation, both are **immutable** in UI. Shown as small read-only badges in modal header.
- "Quick-pick" buttons in the row-index panel and other entry points map intent → (target_kind, note_type) automatically. The user never sees these axes named "target" or "type" again.

**Entry points (intents-as-buttons):**

| Intent | UI button | target_kind | note_type |
|--------|-----------|-------------|-----------|
| Comment on this row | `✍ Заметка к строке` | sentence | free |
| Vocab card from a word in this row | `🔤 Слово отсюда` | word | word_study |
| Grammar rule observed here | `📐 Грамматика этой строки` | sentence | grammar_rule |
| Translation discrepancy | `↔ Разбор перевода` | sentence | translation_discrepancy |
| Pronunciation tip | `🔊 Произношение слова` | word | pronunciation_note |
| Comment on the whole text | `📄 Заметка к тексту` (from text header) | text | free |
| Root-level note | `🌳 Корень …` (from morphology panel — Phase 9.4) | root | word_study |
| Binyan rule | `🧬 Биньян …` (from morphology panel) | binyan | grammar_rule |
| Free journal entry | `✍ Свободная` (from main library nav) | free | free |
| Linked note (one-note-to-another) | `🔗 Связать с …` (from inside an existing note) | note | (inherited) |

10 button-intents map cleanly to 10 sensible (target, type) pairs. The remaining ~25 combinations from the 7×5 matrix simply don't exist in UI. Some are still valid in DB (e.g., a power user could write a `target_kind='text' + note_type='pronunciation_note'` via dev console) but normal users never reach them.

**To "change type" of an existing note:** menu action "Convert to type X", explicit migration step with field-mapping confirmation. Or just: delete + create new.

**Pros**: zero ambiguity. Mental model is "one note = one shape, immutable". Matches how every premium tool behaves (Anki, Pleco, Obsidian).
**Cons**: Loses the "explore types during write" flow. To switch from a half-written free note to a vocab card, user creates a new note. Minor friction.

### Option B — Type-first navigation (single-axis UI)

**Rules:**
- No "target_kind" axis in the UI. ALL notes are addressed by `note_type` only.
- Each `note_type` has a **fixed canonical target** (decided by context, not by user).
- The modal has just one segmented control: the 5 types. No second axis.

**Entry points are TYPE-first, not target-first:**

- Row-index panel quick-pick: same 5 types as today.
- After creation, note's target is shown as a small read-only badge (e.g., "🔗 Связано со строкой 12 текста «Урок 4»").
- If a user wants to write about a word INSIDE the sentence, they pick "Слово", and the next step asks "Какое слово?" with autocomplete from the sentence's lemmas (Phase 9.4 morphology will populate this list automatically).

**Pros**: simpler UI than Option A (one axis). Easier to learn. Matches "what am I capturing?" cognitive load.
**Cons**: Loses one degree of freedom — can't have a `target_kind=root + note_type=free` (general root commentary) since each type has fixed target.

### Option C — Hybrid: Lock-by-default + explicit Convert action

**Rules:**
- Same as Option A (locked at creation, quick-pick maps intent → pair).
- **PLUS** an explicit "🔄 Преобразовать в…" menu inside the edit modal:
  - Click → confirm dialog → "Convert this note to type X? Current content will be archived as v_N and the new shape will be empty."
  - Server-side migration: stash old body_json into a new version, then reset body_json to the new type's empty shape, then update `note_type`.
  - History sidebar shows the old version with a "type was: free" annotation.
- "target_kind" stays locked always — converting between targets makes no semantic sense.

**Pros**: best of both worlds. Premium safety (locked by default), explicit escape hatch (conversion is conscious + reversible via history). Matches Anki's "manage note types" flow.
**Cons**: slightly more code complexity, one more menu item.

---

## 6. Side-by-side comparison

| Axis | Today | Option A | Option B | Option C |
|------|-------|----------|----------|----------|
| User picks target_kind explicitly | yes | no — inferred | no — inferred | no — inferred |
| User picks note_type explicitly | yes | only via quick-pick | yes (single axis) | only via quick-pick |
| Type switch mid-edit allowed | yes (broken) | no | no | yes (via explicit Convert) |
| Mental model load | high (35 combinations) | low (10 intents) | medium (5 types) | low (10 intents + 1 menu) |
| Power-user flexibility | high but unusable | medium | low | high |
| Premium feel | poor (leaks complexity) | strong | strong | strongest |
| Phase 9.4 morphology compatibility | OK | OK | needs target picker | OK |
| Dev effort to redesign | — | ~3 days | ~3.5 days | ~4 days |
| Tests to rewrite | — | ~10 cases | ~12 cases | ~12 cases + 2 conversion |
| Schema migration needed | no | no | no | optional (history annotation) |

---

## 7. Recommendation: **Option C — Hybrid with explicit Convert**

### Why C beats A

C is **A + an escape hatch**. The escape hatch is rare-used but premium-essential:

- A user starts a Free comment → realises it's actually a vocab card mid-write. Option A makes them retype; Option C lets them convert. The conversion is **consciously initiated** (menu click), **explicit about what's lost** (confirm), and **non-destructive** (old version stays in history sidebar).
- For research analytics (diploma): `note_srs_convert` event already exists; add `note_type_convert` as a sibling. Captures user behaviour of "I had a half-formed thought and structured it later" — a deep-learning signal.

### Why C beats B

B's "single axis" simplicity is tempting, but it forces every type into one target shape. We lose nuanced cases like *"a free comment about the root שלם itself"* (target=root + type=free) which is a real use case for morphology study. C preserves the schema flexibility, hides it from the casual user, and exposes it through intent-buttons for the deep user.

### Premium positioning

Option C matches **Anki's manage-note-types** + **Obsidian's templates** + **RemNote's hierarchy**. It's the answer every premium tool converged on. For LinguistPro, it positions us as "the tool that takes your note-taking seriously enough to give it the type-as-identity treatment that Anki gives flashcards."

### What changes in code

1. **Quick-pick buttons** in row-index panel rewritten to intent labels (already 5 buttons, just rename + rewire to fixed pairs).
2. **Modal segmented controls** for target_kind + note_type **removed** (replaced by small read-only badges in modal header showing the chosen pair).
3. **New menu entry** in modal header: `⋯` → "🔄 Преобразовать в…" → submenu of 5 types → confirm + migrate.
4. **History sidebar moved** out of `.v3-notes-md-split` so it stays visible regardless of type. Fixes Bug 1.2.
5. **Anchor button refactored** to be reactive to playback events, fixes Bug 1.1.
6. **Save flow simplified** — no more target_id input drama for root/binyan/note targets; those targets are reached only through their own entry points which require the id up front.
7. **Stash mechanism removed** entirely. No type-switch-stash bug possible if there's no type-switch.

### What doesn't change

- Schema: notes_v2 stays polymorphic. 35 cells still legal in DB. Just not all reachable from UI.
- Bundle export/import: same — body_json + note_type + target_kind + target_id roundtrip as before.
- SRS conversion: untouched.
- Audio anchor: untouched (after the reactive-state fix for Bug 1.1).
- Multi-note row panel (Phase 9.3.5.B): keeps working, quick-pick just gains intent labels.

---

## 8. Effort estimate

Option C implementation, replacing the original Workstreams A + the type-switch bits:

| Step | Effort |
|------|--------|
| Rewrite quick-pick buttons → intent labels + (target,type) fixed mapping | 0.5 d |
| Remove segmented controls from modal; replace with read-only badges | 0.5 d |
| Add "🔄 Convert" menu + confirm dialog + migration logic | 1 d |
| Move history sidebar to be peer of body (Bug 1.2 fix) | 0.5 d |
| Refactor anchor button to reactive state (Bug 1.1 fix) | 0.5 d |
| Add `note_type_convert` event for research-mode | 0.25 d |
| Rewrite 10 affected tests + add conversion roundtrip tests | 1 d |
| Update i18n: remove obsolete keys, add new ones (Convert menu, intents) | 0.5 d |
| Onboarding refresh — help-card text simpler since UI is simpler | 0.25 d |
| Docs: PLAN_v3_2 update, CHANGELOG, this doc's §9 (decision record) | 0.25 d |
| **Total** | **~5 days** |

That replaces the original Workstream A (matrix guidance, ~1d) + parts of the in-modal type/target UX. The remaining Workstreams (D, C, E, F) are unaffected.

Total Phase 9.3.5 revised: **~10–11 days** instead of original 5–7 (the in-flight 9.3.5.A → reborn as the C redesign).

---

## 9. Blind spots / open questions

1. **"Convert" UX detail**: should converting Free → Word try to *parse* the free body for word/meaning hints, or always start blank? Recommendation: start blank, archive old body in v_N. Simpler + safer. Power-user can copy-paste from history.
2. **Multi-note flow when user always wants free comment + vocab card on same row**: today they have to make 2 notes. That's fine — `9.3.5.B`'s row-index panel handles it. No change needed.
3. **Backward compatibility with imported bundles** carrying weird combinations (e.g., target=root + type=pronunciation_note): keep them in DB, render in row-index panel as read-only with a "non-standard combination" badge. Schema is open; UI is opinionated.
4. **Convert from templated → free**: lossy by definition. Confirm dialog must explicitly say "structured fields will be archived". Recoverable via history.
5. **Cross-text behaviour after convert**: if note had backlinks, they survive (note id unchanged). If note had an SRS card, the card stays linked but its template may not match new type. Convert flow should also offer to "drop SRS card and create a fresh one of new type".

---

## 10. Decision points for the user

1. **Approve Option C as the redesign path?** Yes / No / Choose A or B instead.
2. **Phase 9.3.5.A** (original "matrix guidance") is replaced by this redesign. OK?
3. **Order**: should I land Bug 1.1 + 1.2 hotfixes as quick wins now (~1 d) before the full redesign, or roll them into the redesign? Recommendation: roll them in (~5 d total) — fixing them separately means double-touching the same code.
4. **Convert action menu**: confirm scope: 5-type conversion, no target conversion. Yes / extend to target_kind too?
5. **Research event `note_type_convert`**: add to Workstream C's event list? (privacy: metadata only — `note_id, from_type, to_type, ts`).

Once you decide, I write the formal plan doc for the redesign and start implementation.

---

## 11. What this fixes for the user, by their own report

| User's bug # | Fix in redesign |
|---|---|
| 1.1 — anchor button doesn't activate after Play | Bug 1.1 hotfix included; anchor row becomes reactive to playback events. |
| 1.2 — Save with type-switch, history doesn't open | History sidebar moved out of `v3-notes-md-split`, no longer hidden when template form is shown. |
| 1.3 — Two type-fields visible after reopen | Type switching in modal is REMOVED. No stash bug possible. To change type → explicit Convert menu (lossless via history). |
| 2.x — cryptic target_id-missing errors for root/binyan/note targets | These targets are no longer reachable via modal-side segments. They have their own entry points (morphology panel — Phase 9.4) which require id up front. |
| 2.1 — "huge noise and variations" | 35 combinations → 10 intent-buttons. Casual user never thinks about target_kind. |
| 2.2 — "user shouldn't have to keep what works in head" | Intent-buttons explicitly named in user language. No matrix to memorize. |

The redesign closes ALL six reported issues by changing the model, not by adding error messages or guidance.
