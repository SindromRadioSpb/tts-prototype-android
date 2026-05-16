# Product Cohesion Plan — v3.4 (toward a group-test-ready product)

> **Status.** Consolidated plan for review. Read-only audit done
> 2026-05-16; **no code until the owner approves a phase**.
> Goal (owner, 2026-05-16): a *cohesive, user-friendly product ready
> for testing in a real learner group* — the note-creation flow and
> the Knowledge Graph still have deep "organic expectation" gaps.
>
> **Method.** Owner chose "A+B → unified plan": Phase A audited the
> note-creation flow; Phase B's Graph Tier-2 is already specced
> (`PHASE_PLAN_v3_3_7_GRAPH_UX.md §2`); both are folded here into
> Phase C (cross-flow cohesion) and Phase D (pilot-readiness gate).
>
> **Hard constraints (unchanged):** Knowledge Graph stays read-only
> (no edit-from-graph, no node/link creation from the graph canvas);
> no telemetry / events / research-payload mutation; no new
> `/api/research/v1/*`; no `metrics.outcome` fields; `CONSENT_VERSION`
> = `1.0`; lazy-load preserved; mobile graph = isolated-cluster
> fallback. Note-link **authoring** changes are in the Notes editor
> (allowed), not in the graph.

---

## Phase A — Note-creation flow: audit findings (ground truth)

Audited against the shipped monolith. Each finding cites the real
surface; **none are hypothetical**.

### A-G1. Linking is a hidden, power-user surface (HIGH)
- `[[…]]` markdown syntax is **not implemented** in the editor; the
  toolbar "link" button emits `<a>` HTML, not a note link
  (`index.html:10496`).
- The only way to link is a **separate collapsed "Links" panel**
  (`index.html:10553–10585`) where the user must **manually type the
  raw target ID** (note UUID / root string / sentence id) — **no
  autocomplete, no picker, no existence validation**
  (`index.html:35403–35442`, `local-db.js:962`).
- The note must be **saved first** before a link can be added
  (`index.html:35405–35407`).
- **Effect:** the `[[link]]` → graph value proposition is invisible
  to a normal user. The Knowledge Graph we just shipped will look
  empty/sparse for most users because nobody is creating links.

### A-G2. The create → link → graph loop is never surfaced (HIGH)
- After save there is **no breadcrumb / next-step / "see this in the
  graph"** affordance. Graph is a separate top-nav button
  (`index.html:9075`); it cannot be previewed from inside the editor.
- First-time users almost certainly: create a free note → save →
  never discover linking → never see a populated graph.

### A-G3. Notes absent from top-level onboarding (MED)
- The onboarding modal (`index.html:38056–38075`) lists text import /
  TTS / library / SRS — **notes are not mentioned at all**. The only
  notes hint is a help card that appears *only if* the user opens a
  sentence-row modal (`index.html:10197–10205`).

### A-G4. Note-type is locked at creation; wrong-intent = lost work (MED)
- `note_type` is fixed by the launching intent and **cannot be
  switched in-modal** (`index.html:36210–36222`). "I picked the wrong
  type" means close → reopen → lose unsaved edits (dirty warning at
  `index.html:37427`).

### A-G5. Autosave is silent + no error recovery (MED)
- 30 s debounced autosave (`index.html:35814–35831`) fires with
  **zero user feedback**; explicit save shows a toast, autosave does
  not. On save failure the note is left unsaved with only a transient
  toast; **no conflict handling** across tabs/devices.

### A-G6. Backlinks discoverable only by exploration (MED)
- Backlinks work (`local-db.js:992`, `index.html:35381`) but live in
  the same collapsed Links panel — no "N notes link here" indicator
  anywhere a user would naturally look.

### A-G7. Mobile notes layout unverified / likely broken (MED)
- The notes modal shrinks responsively (`index.html:3363–3376`) but
  the **Links row has no mobile breakpoint** (fixed-width dropdown +
  inputs) — horizontal overflow likely on phones. No notes-specific
  `@media`. **This matters now** because the build is on Railway for
  mobile testing.

### A-G8. Entry points are row-centric only (LOW)
- No global "new note" affordance; note creation is reachable only
  via a sentence-row badge. The Notes IDE tab shows a list but no
  create button (`index.html:8879`).

### A-G9. i18n mostly good; some hardcoded tooltips (LOW)
- `data-i18n` coverage is broad (ru/en/he) but inline `title=`
  tooltips on the editor toolbar are hardcoded Russian
  (`index.html:10488`).

---

## Phase B — Graph Tier-2 (already specced; folded in)

From `PHASE_PLAN_v3_3_7_GRAPH_UX.md §2`, unchanged:
- **U5** desktop in-graph node search + `/` jump-to.
- **U6** loading skeleton (replace bare spinner).
- **U7** explicit toolbar filter chips (mirror the legend).
- **U8** empty-state inline "how to add `[[links]]`" help — **this
  directly addresses A-G1/A-G2** (the graph empty state becomes the
  teaching surface for linking).

---

## Phase C — Cross-flow cohesion (the unified work)

The connective tissue that makes A + B feel like one product. Each
item maps to the findings it closes.

| C-item | What | Closes | Notes |
|---|---|---|---|
| **C1** | **Inline `[[` autocomplete in the editor.** Typing `[[` opens a picker (notes/roots/words/texts/sentences by label), inserts a real `note_links` row + a visible chip on save. Raw-ID panel stays as the power path. | A-G1 | Biggest single lever — turns linking from hidden to organic. Editor + parse-on-save; **no graph code** (graph stays read-only). |
| **C2** | **"Open in Knowledge Graph" affordance from the note editor + a backlinks/links count badge in the note list and row badge.** Closes the create→link→graph loop and surfaces backlinks. | A-G2, A-G6 | Editor button → `LinguistProGraph.open()` focused on this note's id (graph already supports node focus). |
| **C3** | **Onboarding + empty-state teaching.** Add a notes+graph step to onboarding; make the graph empty-state (U8) and the Notes-tab empty-state explain the `[[link]]` → map loop with a one-click sample. | A-G3, A-G2 | Pure UX/content; ties to U8. |
| **C4** | **In-modal note-type switch** (where data-compatible) OR a non-destructive "change type" that preserves the body. At minimum: warn-and-carry-body instead of lose-edits. | A-G4 | Scope-bounded; conversion matrix decided in the phase plan. |
| **C5** | **Autosave feedback** — a subtle "saving… / saved HH:MM / save failed — retry" status line (reuse the existing status element) + a retry affordance on failure. | A-G5 | Low risk; existing status surface. |
| **C6** | **Mobile notes pass** — responsive Links row (stack on < 640 px), template-form reflow, touch target sizes; verified at 414 px. | A-G7 | Urgent given the live Railway mobile testing. |
| **C7** | **Global "＋ New note" entry** in the Notes IDE tab + i18n the hardcoded toolbar tooltips. | A-G8, A-G9 | Small, high discoverability gain. |

**Out of scope for v3.4 (explicit):** editing/creating links *from
the graph canvas* (graph stays read-only — hard constraint);
multi-device sync/conflict resolution (separate epic); full
WYSIWYG-link rendering rework.

---

## Phase D — Group-test readiness gate (definition of "ready")

A single checklist that makes "готов к тестированию в группе"
objective. v3.4 is *pilot-ready* only when ALL hold:

- [ ] **Linking is organic:** a first-time user can create a note and
      link it without docs (C1) — verified by a fresh-user smoke +
      manual run.
- [ ] **The loop is visible:** create → link → graph is reachable in
      ≤ 2 affordances from the editor (C2/C3).
- [ ] **Mobile works:** note create + link + graph fallback usable at
      414 px on a real Android device via the Railway deploy (C6).
- [ ] **No lost work:** wrong-type / autosave-fail paths preserve the
      body (C4/C5).
- [ ] **Onboarding teaches notes+graph** (C3).
- [ ] **Smoke matrix green** incl. new C-phase suites; visual
      baselines regenerated where the editor/graph DOM changes.
- [ ] **Privacy invariants unchanged** (graph read-only; no telemetry/
      endpoints/collected-fields; `CONSENT_VERSION` 1.0) — re-pinned.
- [ ] **Recommendations recorded (non-blocking):** ulpan item-bank
      external sign-off (v3.3.5 gate) + manual NVDA/VoiceOver pass —
      these stay *recommendations before real diploma data
      collection*, not blockers for an internal group UX test.
- [ ] **CHANGELOG + version tag** for the pilot build.

---

## Proposed sequencing & effort (for owner decision)

Recommended order — value/risk optimised, mobile-urgent first:

1. **C6 mobile notes pass** (~0.5 d) — urgent: build is live on
   Railway for phone testing now.
2. **C1 inline `[[` autocomplete** (~2–3 d) — the single biggest
   cohesion lever; unblocks the graph's whole value prop.
3. **B/U8 + C3 onboarding/empty-state teaching** (~1 d) — cheap, ties
   to C1.
4. **C2 loop affordance + backlink badges** (~1 d).
5. **C5 autosave feedback** (~0.5 d), **C7 new-note entry + i18n
   tooltips** (~0.5 d).
6. **C4 note-type switch** (~1 d) — bounded by a conversion matrix.
7. **B/U5–U7 graph Tier-2** (~2 d) — polish once linking produces
   real graphs to search/filter.
8. **D gate** — verify + tag the pilot build.

≈ 9–10 dev-days. Each phase = its own approved plan slice + smoke +
(if DOM changes) regenerated visual baselines, committed per the
established per-commit-green discipline.

## Risks

| Risk | Mitigation |
|---|---|
| `[[` autocomplete is a large editor change in the monolith | Scope C1 to a self-contained picker module + parse-on-save; no graph changes; smoke-pin the link round-trip |
| Note-type conversion data loss | C4 ships "preserve body + warn" first; true conversion only where the body_json schema is compatible (decided in the slice plan) |
| Mobile reflow regresses desktop notes | C6 adds breakpoints only; visual-regression + manual desktop check |
| Scope creep toward graph-editing | Hard line restated in this plan; D-gate re-pins read-only |

---

**Authored 2026-05-16 by Claude Opus 4.7 (1M context). Read-only
audit + consolidated plan. Implementation starts only after the owner
picks a phase to begin.**
