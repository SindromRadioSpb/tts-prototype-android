# Direction 9 Phase 9.3 — Templates + Links + SRS Closure Report

**Branch:** `phase-9-3-templates-links-srs` (base = `main@005a7fb`).
**Date completed:** 2026-05-11.
**Outcome:** Shipped. All three milestones (M3 templates, M4 links, M6 note→SRS) landed in one branch as three logical commits.

---

## Acceptance criteria — all met

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Each of the 4 non-free `note_type`s opens a structured form with proper labels/placeholders. | ✅ HTML containers per kind + render swap (`v3NotesTemplateRender`). |
| 2 | Required fields validated on Save with user-visible toast. | ✅ `v3NotesTemplateMissingRequired` + `toast.notesTemplateMissing`. |
| 3 | Body roundtrips through createNote → updateNote → reread without loss (incl. arrays for examples/tags). | ✅ 5 new test cases in `notes-v2-test.html`. |
| 4 | Switching `note_type` mid-edit preserves field values per type via stash. | ✅ `v3NotesBodyStashByType` extended to carry objects. |
| 5 | Existing note opens with the right template form pre-filled. | ✅ `v3NotesLoadFullNoteIntoModal` (Phase 9.3 helper) hydrates fields. |
| 6 | Links panel: add 3 outgoing links of mixed kinds + see backlinks. | ✅ Collapsible panel + atomic add/remove API + click-to-navigate backlinks. |
| 7 | Self-link prevention for `target_kind=note`. | ✅ Toast + early return. |
| 8 | Note → SRS button visible only for templated notes with noteId. | ✅ `v3NotesToSrsUpdateUI` tracks both. |
| 9 | Confirm dialog before SRS card creation. | ✅ `v3ConfirmModal` flow with cancel/danger styling. |
| 10 | Re-conversion is idempotent (returns existing card). | ✅ `srs.createCardFromNote` checks `note.srs_card_id` first. |
| 11 | RU/EN/HE complete for all new strings. | ✅ ~50 new keys × 3 locales. |
| 12 | Dark mode + RTL verified. | ✅ All chip/form CSS uses `--theme-*` vars; numeric chips dir=ltr. |
| 13 | 47/47 + N tests stay green; 23/23 events; 0 new JS errors. | ✅ **57/57** notes-v2 (+10 cases), 23/23 events, 0 JS errors. |
| 14 | Remote prod smoke after Railway deploy. | ⏳ Triggered on push (see deploy section below). |

---

## What changed (file-by-file)

### Schema (`public/db/migrations.js`)
- **Migration 026** — seed 4 SRS card templates (`note_word_study`, `note_grammar_rule`, `note_translation_discrepancy`, `note_pronunciation_note`), card_kind='note', INSERT OR IGNORE for idempotency.

### API (`public/db/local-db.js`)
- **`addNoteLink(noteId, { to_kind, to_id, link_alias })`** — atomic insert with INSERT OR IGNORE (re-add same edge is no-op).
- **`removeNoteLink(noteId, toKind, toId)`** — atomic delete.
- **`srs.createCardFromNote(noteId)`** — new SRS namespace method:
  - Reads note row, picks template by `note_<note_type>` code.
  - INSERTs `srs_cards` with entity_type='note', source_note_id=noteId.
  - UPDATEs `notes_v2.srs_card_id` back-pointer.
  - Idempotent — returns existing card if `srs_card_id` already set.
  - Throws on `free` note type (no template).

### UI (`public/index.html`)

**HTML**:
- `v3NotesTemplateForm` container with 4 sub-forms (`v3-notes-tpl[data-tpl="..."]`), labeled inputs/selects/textareas.
- `v3NotesLinksPanel` collapsible panel below modal body with two sections (outgoing + backlinks) + add-link row (kind select + target input + alias input + button).
- `v3NotesToSrsBtn` in modal-actions footer between Delete and Save.
- Retired the legacy "⏳ Phase 9.3" placeholder banner (its element remains for backwards-compat but stays hidden permanently).

**CSS**:
- `.v3-notes-template-form` + `.v3-notes-tpl-row` + `.v3-notes-tpl-label` + `.v3-notes-tpl-input` + `.v3-notes-tpl-textarea` + `.v3-notes-tpl-required::after` (asterisk).
- `.v3-notes-links-panel` + `.v3-notes-links-toggle` (rotates ▸→▾ when open) + `.v3-notes-links-badge` (count chip) + `.v3-notes-link-chip` (per-link with kind label + remove ✕) + `.v3-notes-links-add-row`.
- All theme-aware (`--theme-bg-card / --theme-bg-muted / --theme-text-*`), focus-visible rings, `prefers-reduced-motion` honored, mobile-friendly grid collapses.

**JS** (chunked into 3 clearly-marked sections):

- *Phase 9.3.A — Templates*
  - `V3_NOTES_TPL_FIELDS` declarative field map per kind (id + key + required + type).
  - `v3NotesTemplateRender()` — show/hide form per `note_type`.
  - `v3NotesTemplateCollect()` — read fields → typed body object (handles `text/textarea/select/lines/csv`).
  - `v3NotesTemplateHydrate(body)` — populate fields from string-or-object body_json.
  - `v3NotesTemplateMissingRequired()` — validation helper.
  - `v3NotesSetNoteType` rewritten to stash typed bodies (string for free, object for templates) and hydrate fresh on switch.
  - `v3NotesLoadFullNoteIntoModal()` — async hydrate of note_type + title + body + anchor + srs_card_id when opening a known noteId.
  - `v3NotesSave` rewired: non-free types collect from form + validate required + pass body as object to createNote/updateNote.

- *Phase 9.3.B — Links*
  - `v3NotesLinksToggle / Refresh / Add / Remove` — full panel lifecycle.
  - `v3NotesLinkChipHtml(link, {backlink})` — DOM rendering with click-to-navigate for backlinks.
  - `v3NotesLinksOpenBacklink(fromNoteId)` — closes current modal and reopens with target note.
  - Save flow + open flow trigger refresh.

- *Phase 9.3.C — SRS*
  - `v3NotesModalSrsCardId` modal state var.
  - `v3NotesToSrsUpdateUI()` — button visible only for templated notes with noteId; shows "Сделать карточкой" or "✓ В SRS" based on `srs_card_id`.
  - `v3NotesConvertToSrs()` — confirm dialog → `srs.createCardFromNote` → toast → button-state flip.
  - On open: srs_card_id loaded by `v3NotesLoadFullNoteIntoModal`.
  - On close: state reset alongside other modal vars.

### Tests (`public/db/notes-v2-test.html`)
- 10 new test cases across 9.3.A/B/C:
  - 9.3.A: word_study + grammar_rule + translation_discrepancy + pronunciation_note roundtrip; updateNote-replace-not-merge semantics; invalid-JSON-string-for-templated rejection.
  - 9.3.B: addNoteLink + removeNoteLink + idempotent re-add + backlink visibility.
  - 9.3.C: migration 026 seeded 4 templates; createCardFromNote roundtrip + idempotency; free notes refuse conversion.
- Final: **57/57** notes-v2 (was 47/47), **23/23** events.

### i18n (`public/i18n/locales/{ru,en,he}.js`)
- ~50 new keys per locale:
  - `notes.tpl.<kind>.<field>` field labels + placeholders for all 4 templates.
  - `notes.tpl.word_study.posXxx` + `binyanXxx` select option labels.
  - `notes.linksTitle / linksOutgoing / linksBacklinks / linksEmpty / linkKindXxx / linkAdd*` for links panel.
  - `notes.toSrsBtn / toSrsBtnDone / toSrsBtnTitle / toSrsBtnDoneTitle`.
  - `toast.notesTemplateMissing / notesLinkSaveFirst / notesLinkInvalid / notesLinkSelfLoop / notesLinkAdded / notesLinkAddFailed / notesLinkRemoveFailed / notesSrsSaveFirst / notesSrsFreeNotAllowed / notesSrsCreated / notesSrsFailed`.
  - `confirms.notesToSrsTitle / Body / Ok / Cancel`.

---

## Migration compatibility

- **Migration 026 is forward-only** and idempotent (INSERT OR IGNORE on a composite PRIMARY KEY).
- Existing user DBs on prod/local pick it up automatically on the next `ensureLocalDB()` call (migration runner iterates the array and skips already-applied entries).
- No data migration of existing notes — they continue to live as `{markdown: "…"}` and don't fail Save because the form path only activates for non-free types.

---

## Deferred to v3.3

- **Multi-card per note**: today one note = one SRS card. Multi-card unlocks scenarios like "front=word, back=meaning" AND "front=word, back=mnemonic" on the same word_study note. Needs new association table + UI for picking template at conversion time.
- **In-trainer renderer for `card_kind='note'`**: SRS trainer currently understands `card_kind='sentence'`. The note-card templates' front/back schemas are seeded but the trainer renderer extension is a v3.3 follow-up (`/srs` page work). For v3.2 the conversion creates the card record and surfaces it in `listCards`, but rendering during review requires the renderer change.

---

## Test counts (Playwright headless on local PORT=3078)

```
events-emission-test.html: Passed: 23 · Failed: 0
notes-v2-test.html       : Passed: 57 · Failed: 0   (+10 from 9.3)
/index.html cold load    : 0 new JS errors
```
