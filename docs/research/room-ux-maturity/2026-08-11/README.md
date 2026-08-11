# Reading Room UX maturity research — 2026-08-11

Status: **research complete; owner decision required before implementation**.

No application code, production state, corpus data, group membership, or owner learner data was
modified. The public site was inspected from a clean browser profile. The private/owner surfaces
were exercised only through the repository's isolated seeded smoke fixtures.

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
