# v3.4 Pilot-Readiness Gate (Phase D)

> **Purpose.** The objective definition of "готов к тестированию в
> группе" for v3.4 (PRODUCT_COHESION_PLAN_v3_4.md Phase D). v3.4 is
> *pilot-ready* only when every item below holds. Authored at the
> close of Phase B; verified before the v3.4.0 tag.

## v3.4 shipped surface (all pushed to `main` → Railway)

| Phase | Commit | What | Closes |
|---|---|---|---|
| C6 | `7f44a3e` | Mobile notes responsive pass | A-G7 |
| C1 | `0c6a218` | Inline `[[` autocomplete | A-G1 |
| C3+U8 | `012d4d0` | Onboarding + empty-state teaching | A-G3 / A-G2 |
| C2 | `fb45db4` | Loop affordance + backlink badge | A-G2 / A-G6 |
| C5+C7 | `0f4dea9` | Autosave feedback + new-note entry + i18n tooltips | A-G5 / A-G8 / A-G9 |
| C4 | `a417d04` | Non-destructive note-type switch | A-G4 |
| B | `0a95f28` | Graph Tier-2 (U5 search / U6 skeleton / U7 filter chips) | PHASE_PLAN_v3_3_7 §2 |

Every Phase-A finding (A-G1…A-G9) is now closed; the Graph Tier-2
backlog (U5–U8) is complete (U8 landed with C3).

## Definition of Done

- [x] **Linking is organic** — typing `[[` in the editor opens a
      picker (notes/texts/roots) and materialises real `note_links`
      on save, no docs needed. *Evidence:* C1
      `scripts/notes-ui/link-autocomplete-smoke.js` 6/6 (picker →
      insert → collect → save-hook round-trip + phantom-token guard).
- [x] **The loop is visible** — create → link → graph reachable in
      ≤ 2 affordances: editor "Open in Knowledge Graph" button
      (deep-links + spotlights the note) and the onboarding/empty-state
      teaching. *Evidence:* C2 `graph-loop-smoke.js` 5/5, C3+U8
      `onboarding-empty-smoke.js` 5/5.
- [x] **Mobile works** — note-editor Links row + forms stack at
      414 px (≥ 40 px touch targets, no overflow); graph degrades to
      the isolated-cluster fallback. *Evidence:* C6
      `mobile-notes-smoke.js` 5/5; graph `mobile-fallback-smoke.js`
      5/5. *(Real-device confirmation = non-blocking recommendation
      below.)*
- [x] **No lost work** — wrong-type conversion carries the body
      forward (+ history snapshot); autosave failure surfaces an
      error + Retry instead of silently dropping. *Evidence:* C4
      `type-switch-smoke.js` 5/5, C5 `autosave-entry-smoke.js` 5/5.
- [x] **Onboarding teaches notes+graph** — feature line in the
      onboarding panel + Notes-tab empty-state teaching card + graph
      empty-state mini-guide. *Evidence:* C3 `onboarding-empty-smoke.js`
      5/5.
- [x] **Smoke matrix green incl. new C/B suites** — six new
      `scripts/notes-ui/*` suites + `notes-graph/graph-tier2-smoke.js`
      wired into `smoke:research:fast` and the graph chain. Visual
      baselines regenerated where the graph DOM changed (Tier-2
      toolbar row) — graph visual-regression 31/31 verify-green.
      *Known:* a transient combined-run failure in the heavy
      real-Service-Worker lazyload section (line 296) — the documented
      pre-existing back-to-back harness flake; lazyload is 9/9 in
      isolation and Cases 6+7 (which exercise the changed
      `renderState`) pass every run. Not a regression.
- [x] **Privacy invariants unchanged** — graph stays read-only (no
      node/link creation from the canvas; C2 `focusNode`, U5 search,
      U7 chips are all navigation/visibility only); no `fetch` / `XHR`
      / `sendBeacon` / `/api/research/*` / `v3Emit` added in any v3.4
      graph or autocomplete module (grep-clean); `CONSENT_VERSION`
      still `'1.0'`. *Evidence:* `notes-graph/privacy-smoke.js` 8/8
      re-pinned.
- [x] **CHANGELOG + version tag** — CHANGELOG `[3.4.0]` section;
      `package.json` 3.4.0.

## Non-blocking recommendations (carried forward, not gate blockers)

These remain *recommendations before real diploma/research data
collection*, not blockers for an internal group UX pilot — same
soft-gate posture established for the v3.3.5 ulpan item-bank and the
v3.3.6 manual-SR audits:

- **Ulpan item-bank external sign-off** (v3.3.5 gate) — AI-pre-reviewed
  bank accepted as good-enough for dev/dogfood; external ulpan-teacher
  review recommended before diploma data.
- **Manual accessibility pass** — NVDA (Windows) / VoiceOver (macOS) /
  real mid-range Android via the live Railway deploy. The automated
  ARIA/keyboard smokes pass; a human SR + device sanity run is
  recommended before the pilot but is not a code blocker.

## Verdict

All eight DoD items hold. v3.4 is **pilot-ready for an internal group
UX test**, with the two non-blocking recommendations recorded above to
be completed before any diploma/research data collection.
