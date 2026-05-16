# v3.6 Pilot-Readiness Gate (Phase 9)

> **Status.** Gate record for the **Smart Learning Graph** (v3.6) +
> the accumulated v3.5 dogfood prototype fixes. Same soft-gate
> pattern as v3.3.5 / v3.4: every DoD item must hold; the release
> tag is created **only on explicit owner instruction**. Authored
> 2026-05-17 at the close of Phases 0–8 + the pre-Phase-9 UX pass.

## Shipped surface (all pushed to `main` → Railway)

| Phase | Commit | What |
|---|---|---|
| 0 | `5da0802` | Frozen bundle fixture + morph-coverage baseline (0 morph calls) |
| 1 | `f25797b` | A2 read-only/offline/deterministic candidate generator |
| 2 | `b5a45b4` | Rarity + caps + pure suppression contract |
| 3 | `1c02afe` | «Подтвердите связи» Confirm panel (pedagogical, ARIA, 414 px) |
| 4 | `3b2049d` | Durable `note_link_suggestions` + confirm → `note_links` |
| 5 | `b4f1844` | Suggested graph layers + filter chip + explainability |
| 6 | `55cafa9` | SRS/quiz **candidate records only** (no engine, no UI) |
| 7 | `ad91cdd` | A5 learning-state node overlay (non-destructive ring) |
| 8 | `02880ea` | Mobile/perf/privacy hardening (O(1) hot loop) |
| UX | `69c4061` | Student-first polish (no dead surface, discoverable `[[`) |
| docs | `eca2c4b` | Roadmap progress log |

v3.5 dogfood fixes (auto-text backbone, render-don't-blank,
browse-on-`[[`) shipped earlier under `[Unreleased]`; folded into
this release.

## Definition of Done

- [x] **System proposes, learner confirms.** A2 generates local
      shared-root/lemma/binyan/same-text candidates; the editor
      Confirm panel lets the learner accept/reject/defer. *Evidence:*
      `suggest-generator-smoke` 10/10, `suggest-panel-smoke` 6/6,
      `suggest-fixture-smoke` 6/6 (frozen contract on the user's real
      bundle).
- [x] **Confirmation is durable + retrieval practice.** Confirm
      writes a real `note_links` row + a `note_link_suggestions`
      decision; survives editor reopen; reject = forever, later =
      cooldown. *Evidence:* `suggest-persist-smoke` 5/5; SRS/quiz
      candidate objects derivable from confirmed (`suggest-srs-
      candidate-smoke` 5/5).
- [x] **Graph stays read-only & honours decisions.** Suggested
      layers are computed view-only; rejected/later suppressed;
      confirmed promoted to `explicit_link`; no `note_links` write /
      `addNoteLink` / mutation from the canvas (bare-SELECT guard).
      *Evidence:* `suggest-graph-smoke` 6/6, `privacy-smoke` 9/9.
- [x] **Pedagogically framed, not technical.** «Подтвердите связи» /
      «Я понимаю связь / Не связано / Позже»; explainability chips +
      legend + native edge `<title>`; A5 progress ring. i18n ru/en/he.
      *Evidence:* `suggest-panel-smoke` (wording), `activity-overlay-
      smoke` 5/5.
- [x] **Low barrier for a first-time student.** No empty/dead panel;
      one-click discoverable `[[ ]]` smart-link toolbar button; plain-
      language tooltips everywhere. *Evidence:* `link-autocomplete-
      smoke` 7/7 (Case 7 trigger), `suggest-panel-smoke` Case 4b
      (zero-candidates → hidden).
- [x] **No hairball / performance bounded.** Per-token + per-note
      caps + rarity weighting + the O(1) pair-set hot loop; 200-note
      `buildGraph` < 400 ms; A2 200-note < 300 ms. *Evidence:*
      `suggest-graph-smoke` Case 5, `suggest-generator-smoke` Case 9.
- [x] **Mobile usable.** Confirm panel 414 px reflow; graph mobile
      fallback intact. *Evidence:* `suggest-panel-smoke` Case 5;
      `mobile-fallback-smoke` (matrix).
- [x] **Privacy invariants unchanged.** Offline/local-first; no AI;
      no embeddings; **no new telemetry / `events` writes**; no
      network in any v3.6 module (static call-site scans, comments
      excluded); `CONSENT_VERSION` still `'1.0'` (`research.js:50`);
      no new `/api/*`; `note_link_suggestions` **not exported** by
      the bundle (conservative default per roadmap §5). *Evidence:*
      `privacy-smoke` 9/9 (incl. Case 9 with suggested layer +
      overlay active), `suggest-persist-smoke` / `suggest-srs-
      candidate-smoke` static purity scans.
- [x] **Smoke matrix green + baselines current.** Full
      `smoke:research:fast` ALL GREEN; graph visual baselines
      regenerated where the canvas intentionally changed
      (Phases 5/7) and re-verified **31/31**; `bundle-data-smoke`
      5/5 on the user's real bundle. Known: the documented line-296
      SW back-to-back **lazyload flake** (always 9/9 in isolation,
      never a logic regression) — disclosed, not a blocker.
- [x] **Owner decisions honoured (roadmap §11).** A2 + Confirm Panel
      + A5; separate `note_link_suggestions` table + reuse
      `note_links`; export only confirmed (rejected only in a full
      learning-state profile — *export wiring deferred, current
      behaviour exports nothing = strictly safe*); Phase 6 candidate
      records only, **no SRS engine change, no card-creation UI**.
- [x] **CHANGELOG + version.** `[3.6.0]` section; `package.json`
      3.6.0.

## Non-blocking recommendations (carried forward, not gate blockers)

- **Export of `confirmed` decisions** — v3.6 ships the safe default
  (suggestions not exported at all). Adding the additive
  `confirmed`-by-default / `rejected`-in-full-profile export is a
  later additive step (no `export_schema_version` bump), recommended
  before cross-device learning-state sharing — not a pilot blocker.
- **Manual sanity** — NVDA/VoiceOver pass on the Confirm panel +
  graph chips/legend; real mid-range Android run of the
  create→`[[`→confirm→graph loop via the Railway deploy. Automated
  ARIA/keyboard/414 px smokes pass; a human pass stays a
  recommendation before real-cohort data collection (same posture as
  the v3.3.5 ulpan + v3.4 gates).

## Verdict

All DoD items hold. **v3.6 Smart Learning Graph is pilot-ready** for
an internal group test — the system proposes local connections, the
learner confirms them as retrieval practice, the graph stays
read-only and honours those decisions, and the entry barrier is a
student's, not an engineer's. The release tag / GitHub release is
created **only on explicit owner instruction**.
