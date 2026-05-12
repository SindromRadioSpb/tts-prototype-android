# Phase 9.3.5 R2 — WYSIWYG free-note editor: decision record

> **Status:** Shipped 2026-05-12 (commit `b2ceeba`, branch `phase-9-3-5-foundation-reinforcement`).
> **Companion:** `9_3_5_TARGET_TYPE_REDESIGN.md` (concept + Option C decision), `9_3_5_STRATEGIC_REVIEW.md` (Phase 9.3.5 approval).

## Problem

The R0 editor (lines 9710–9930 pre-redesign) was a 3-pane layout: a full-width Markdown toolbar (8 pill-style buttons), a `<textarea>` for raw Markdown, an HTML preview pane, and a Markdown-syntax legend block. On mobile the toolbar consumed the entire viewport width. The 2026-05-12 dogfood feedback flagged it as "engineered tool" — not premium learning surface. Convergent pattern across Anki / Pleco / LingQ / Obsidian / Notion / RemNote: **WYSIWYG with markdown shortcuts, not raw markdown + preview**.

## Decision

Native `contenteditable` div + compact icon-toolbar + selection-triggered floating bubble + markdown shortcuts. No external library.

## Why native, not TipTap / Lexical / Quill / ProseMirror

| Concern | Native | TipTap (UMD ~150 KB) | Lexical | Quill |
|---|---|---|---|---|
| LinguistPro is a vanilla-JS monolithic single-file (~35K LOC) — **no build step** | ✓ | needs bundler OR UMD + manual integration | needs build | needs build |
| COEP / CORP / cross-origin headers (already configured for OPFS wa-sqlite) | no churn | needs vetting | needs vetting | needs vetting |
| Hebrew RTL + niqqud (mixed direction in same paragraph) | works via `dir="auto"` per paragraph | requires custom extension | requires custom plugin | requires custom format |
| Markdown shortcuts we need (8 inline + block formats) | ~600 LOC custom | extension overhead | similar | similar |
| Add net weight to the bundle | 0 | +150 KB | +120 KB | +200 KB |

The decision is asymmetric: the external libraries are excellent for *generalised* rich-text editing, but our scope is **8 markdown shortcuts + paste sanitization + Hebrew RTL** — a narrow target. Native costs less to ship and less to maintain.

Also: TipTap's mobile selection-handle UX is currently buggier than the browser's native one on iOS Safari (per their issue tracker as of 2025-Q4). Native gets us the browser's mobile-tested selection model for free.

## Supported markdown subset

Inline:
- `**bold**` → `<strong>`
- `*italic*` (single-asterisk, requires non-space immediately after opening `*`) → `<em>`
- `` `code` `` → `<code>`
- `==highlight==` → `<mark>`
- `[label](url)` → `<a href="...">label</a>` (URL whitelisted via `v3NotesMdSafeUrl`)

Block (start-of-line shortcuts):
- `# heading` → `<h2>`
- `## heading` → `<h3>`
- `### heading` → `<h4>`
- `- item` → `<ul><li>item</li></ul>` (Enter extends; Enter on empty `<li>` exits the list)
- `> quote` → `<blockquote>`

Out of scope (intentionally):
- Tables — would expand the markdown surface area; users who want tables can move to free-form HTML or use a templated note.
- Images / image upload — separate epic; bundle import paths would need to handle uploaded assets.
- Math / KaTeX — language-learning context doesn't need it; deferred indefinitely.
- Multi-line code blocks (triple-backtick) — handled as plain `<code>` inline only; if a user needs a code block they can use a templated note's example field.

## Storage roundtrip

```
User types  →  HTMLContentEditable  →  v3NotesHtmlToMd(html)
                                          │
                                          ▼
                                  markdown string
                                          │
                                          ▼  (saved as)
                                  notes_v2.body_json
                                  {"kind":"free","markdown":"<md>"}

User reopens →  notes_v2.body_json  →  parsed.markdown
                                          │
                                          ▼
                                  v3NotesMdToSafeHtml(md)
                                          │
                                          ▼
                                  editor.innerHTML = <html>
```

`v3NotesMdToSafeHtml` and `v3NotesHtmlToMd` are roundtrip-safe — typing `**x** *y* ==z==` in the editor, saving, reloading, and inspecting the editor's `.innerHTML` yields exactly `<strong>x</strong> <em>y</em> <mark>z</mark>` (modulo whitespace). Verified by R4 test `WYSIWYG markdown roundtrip`.

The hidden `<textarea id="v3NotesText">` is preserved as a serialization buffer — every save flow reads `ta.value`, which `v3NotesEditorSyncToTextarea` keeps in sync with the editor's HTML→MD output. This lets the rest of the save pipeline (events emission, body_json schema validation, polymorphic API, autosave) stay unchanged.

## Selection bubble pattern

The bubble (`<div id="v3NotesEditBubble">`) lives at the bottom of `<body>` so it isn't clipped by the modal. It is positioned via `position: fixed` and `getBoundingClientRect()` of the selection's range. On `selectionchange`:
- If selection is non-empty AND fully inside the editor → show, position above the selection.
- Otherwise → hide.

Five quick-format buttons: **B** / **I** / `</>`  / 🖍 / 🔗. They apply formatting to the live selection via Selection API + DOM Range manipulation (NOT `document.execCommand`, which is deprecated and inconsistent across browsers).

**Theme handling.** R2.1 (commit `5087386`) hardcoded the bubble surface and foreground to dark — `#1e293b` background with `#f8fafc` text — regardless of theme. The bubble is a floating tool affordance; high-contrast dark works well in both light and dark themes, and removes a CSS variable cascade that previously rendered light icons on a light bubble in light theme.

## Paste sanitization

`v3NotesEditorOnPaste` strips pasted content to plain text by default. Future work (out of scope for v3.2):
- HTML paste with whitelist subset (preserve `<strong>` / `<em>` / `<a>` from copy-paste, drop everything else).

This conservative default avoids users accidentally pasting `<script>` or styled HTML from external sources.

## Hebrew RTL + niqqud

Verified in modern Chrome / Firefox / Safari (desktop + iOS + Android Chrome):
- Mixed-direction paragraphs work via `dir="auto"` on the editor root + each `<p>` child.
- Niqqud (combining marks) renders correctly inside `<strong>` / `<em>` / `<mark>`.
- Cursor position in RTL text matches the visual direction.
- Selection bubble positions correctly above the selection regardless of the selection's text direction.

If LTR text follows RTL text in the same paragraph, the browser's bidi algorithm reorders the visual layout while preserving logical order in the DOM — `v3NotesHtmlToMd` walks the DOM in logical order, so markdown output matches user intent.

## Tradeoffs and known limitations

| Concern | Status |
|---|---|
| `document.execCommand('bold')` was tempting (one line) but deprecated and produces inconsistent DOM. Custom Range manipulation is the right call. | Resolved — custom implementation. |
| `<br>` vs `<p>` paragraph separation differs across browsers. Editor normalizes to `<p>` on input. | Resolved. |
| Markdown shortcut for `**bold**` fires on the closing `**` keystroke. If the user types `***triple***` it currently outputs `<strong>*triple</strong>*` (incorrect — should be `<strong><em>triple</em></strong>`). | Known. Documented limitation. Fix is a v3.3 polish. |
| Selection bubble can collide with the system toolbar on iOS Safari when text is selected near the top of the viewport. | Known. Bubble has a 6px margin below selection; native iOS toolbar typically clears it. |
| Pasting from Microsoft Word produces a lot of inline styles that get stripped — clean but the user may want to preserve some formatting. | Acceptable for v3.2; HTML-whitelist paste is a future enhancement. |

## Acceptance criteria (met)

- [x] Editor displays formatted text immediately as user types markdown shortcuts.
- [x] Selection bubble appears on text-selection with B / I / code / highlight / link buttons.
- [x] Save → reload → editor shows the same formatting (roundtrip-safe).
- [x] Hebrew RTL + niqqud render correctly in mixed-direction paragraphs.
- [x] Paste from external sources sanitizes to plain text.
- [x] No new JS errors on `index.html` cold load.
- [x] Mobile (≤600px) reflow: toolbar is one compact row of icons; bubble positions above on-screen keyboard.

## References in code

- HTML: `<div id="v3NotesEditor" contenteditable="true" dir="auto" spellcheck="true">` (line ~9930 area)
- Bubble: `<div id="v3NotesEditBubble" class="v3-notes-edit-bubble" role="toolbar">` (line ~9941)
- CSS: `.v3-notes-edit-bubble*` (lines ~4577-4609 area) + `.v3-notes-editor*`
- JS:
  - `v3NotesEditorInit` — bind input/selectionchange/paste/keydown handlers
  - `v3NotesEditorApplyFormat(kind)` — apply selection-aware formatting
  - `v3NotesEditorMarkdownShortcuts(ev)` — input-event handler scanning for shortcut patterns
  - `v3NotesEditorOnSelectionChange()` — show/hide + position the floating bubble
  - `v3NotesHtmlToMd(html)` — DOM walk → markdown string
  - `v3NotesMdToSafeHtml(md)` — kept from R0 (also still used by feedback/bug-report form)
  - `v3NotesEditorLoadFromMarkdown(md)` — open-flow hydration
  - `v3NotesEditorSyncToTextarea()` — keeps hidden textarea = editor's md output

## Future work (not v3.2)

- HTML paste with whitelist subset.
- Mixed bold/italic (`***x***`) handling.
- Inline images via paste / drag-drop (storage layer via OPFS).
- Slash-commands menu (`/heading`, `/code`, etc.) for users who prefer menu-driven over shortcut-driven editing.
- Collaborative editing (real-time multi-user) — explicit non-goal for v3.2; would require operational transform / CRDT and a server.
