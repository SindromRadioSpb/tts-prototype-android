# Reading Room UX maturity research — 2026-08-11

Status: **CLOSED — Option B implemented through B5, production-verified and accepted by the owner on 2026-08-11**.

During the research-only baseline, no application code, production state, corpus data, group
membership, or owner learner data was modified. The public site was inspected from a clean browser
profile. Private/owner surfaces were exercised only through the repository's isolated seeded smoke
fixtures; the later B0→B5 implementation evidence is separated below.

## Research set

1. [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md) — current journeys, desktop/mobile/RTL
   observations, performance and accessibility evidence, defect register.
2. [CORPUS_PARITY_MATRIX.md](CORPUS_PARITY_MATRIX.md) — one normalized contract across
   Ben-Yehuda, My Texts, and Study Songs; explicit intentional differences.
3. [PREMIUM_BENCHMARK.md](PREMIUM_BENCHMARK.md) — systematic primary-source study of premium
   libraries and learning readers, with `adopt / adapt / reject` decisions and priorities.
4. [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md) — LinguistPro-specific product thesis, proposed
   information architecture, card/list system, tokens, responsive behavior, and role critique.
5. [ROOM_UX_MATURITY_DECISION_PACKET_2026_08_11.md](../../../planning/ROOM_UX_MATURITY_DECISION_PACKET_2026_08_11.md)
   — owner-facing options, recommendation, bounded sequence, gates, and stop list.

## Implementation evidence

The research remains the decision foundation rather than being replaced by implementation notes.
The owner approved Option B; each bounded stage has its own durable red→green packet:

1. [B0 baseline](b0-baseline/README.md) — frozen visual/semantic/performance contract;
2. [B1 evidence](b1-evidence/README.md) — bounded density, semantic rows and performance safety;
3. [B2 evidence](b2-evidence/README.md) — learning-first home;
4. [B3 evidence](b3-evidence/README.md) — shared corpus shell and progressive disclosure;
5. [B4 evidence](b4-evidence/README.md) — normalized adapters and honest readiness;
6. [B5 evidence](b5-evidence/README.md) — continuity, finish handoff and release hardening.

The owner explicitly confirmed that B0–B5 had been checked and should be treated as closed on
2026-08-11. This is the product-program acceptance record; it does not retroactively identify a
specific device, VoiceOver pass, or network condition that was not named in that confirmation.
The durable closure and evidence boundary are recorded in
[ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md](../../../planning/ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md).
The next B6–B9 + Visual finishing horizon is a separate program and must not reopen B0–B5 without
new regression evidence.

## Evidence baseline

- Repository baseline: `f3fc06430e180842daba8ef0892f6230138a1c09` (`main`).
- Public Reading Room observed: `3.11.354` at
  `https://linguistpro.kolosei.com/library.html?uxaudit=20260811`.
- Viewports: desktop `1280px`; mobile `380 × 844`, touch/mobile emulation; RU light and HE/RTL
  checks; dark fixture for Study Songs.
- Functional fixtures:
  - `npm run smoke:reader-mytexts` — PASS;
  - `npm run smoke:group-corpus-ui` — PASS at 380/510/1280.
- Lighthouse snapshot: [lighthouse-benyehuda-mobile-snapshot.json](lighthouse-benyehuda-mobile-snapshot.json).
- Screenshots are listed below. Seeded screenshots are product-shape evidence, not owner-live
  proof and not evidence about a real learner's content.

### Capture / reproduction

```powershell
npm run smoke:reader-mytexts
npm run smoke:group-corpus-ui
```

The public pass used Chrome DevTools against the URL above with mobile/touch emulation
`380 × 844 × 1`, light theme, accessibility snapshot, Lighthouse navigation audit, and a manual
performance trace of `Library hub → Ben-Yehuda`. The Lighthouse JSON is raw tool output. PNGs are
unaltered smoke screenshots copied from `.tmp/` into this stable folder; they are previews/evidence,
not annotated gold artifacts. `.tmp/` remains scratch/cache and should not be reviewed or edited.
The My Texts smoke generated `.tmp/corpus-hub-380.png` and `.tmp/mytexts-380.png`; the Study Songs
smoke generated its light/dark/desktop captures under `.tmp/group-corpus-ui/`.

Owner review should start with the
[decision packet](../../../planning/ROOM_UX_MATURITY_DECISION_PACKET_2026_08_11.md), then use the
benchmark and parity matrix for rationale. No file in this folder is intended for learner-content
annotation.

## Visual evidence

| Artifact | Surface | Provenance | What it proves |
|---|---|---|---|
| [fixture-hub-380-ru.png](fixture-hub-380-ru.png) | L0 Library hub | isolated seeded smoke, 380 × 844 | corpus-entry hierarchy and mobile density |
| [fixture-mytexts-380-ru.png](fixture-mytexts-380-ru.png) | My Texts | isolated seeded smoke, 380 × 844 | filter stack and vertical-card density |
| [fixture-study-songs-380-light-ru.png](fixture-study-songs-380-light-ru.png) | Study Songs | isolated owner-role fixture, 380px light | owner controls before learning content |
| [fixture-study-songs-380-dark-ru.png](fixture-study-songs-380-dark-ru.png) | Study Songs | isolated owner-role fixture, 380px dark | theme geometry and contrast surface |
| [fixture-study-songs-1280-ru.png](fixture-study-songs-1280-ru.png) | Study Songs | isolated owner-role fixture, 1280px | low information density on desktop |

## Interpretation boundary

The existing browser smokes are valuable regression gates: they prove that routes load, controls
operate, and the tested viewports do not overflow. They do **not** establish premium hierarchy,
useful first-screen density, semantic accessibility, or acceptable DOM cost. This research adds
those missing quality contracts; it does not reinterpret a passing smoke as a failed functional
release.
