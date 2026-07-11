# 06 — Hierarchy options

**Status:** PROPOSAL · **Source commit:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6` · **Date:** 2026-07-11

Ratings are directional (`++`, `+`, `0`, `-`, `--`) and deliberately not collapsed into one score.

| Criterion | M1 Reading-first | M2 Mentor-first | M3 OS-first | M4 Layered hybrid |
|---|---:|---:|---:|---:|
| User clarity / marketing | ++ | + | -- | ++ if external message stays reading-led |
| Activation | ++ | 0 (cold-start data gap) | - | ++ |
| Retention | + | ++ | + | ++ |
| Pedagogical strength | + | + (only with evidence) | + | ++ |
| Differentiation | ++ Hebrew-specific | 0 crowded AI category | + but abstract | ++ |
| Defensibility | + | + | ++ long term | ++ |
| Implementation readiness | ++ | + owner-only | 0 | + |
| Operating cost | + | -- | - | - controlled by gates |
| UX complexity | + | 0 | -- | 0 with strict boundaries |
| Near-term viability | ++ | 0 | -- | ++ |
| Long-term expansion | + | + | ++ | ++ |
| Dispersion risk | + | 0 | -- | 0; must enforce exclusions |

## Trade-offs

- **M1** is safest now but may underuse the shipped continuity stack and reduce long-term relationship to “reader with SRS.”
- **M2** promises a crowded category before cold-start context and public readiness are proven; it risks generic chat and expensive retention.
- **M3** mistakes architecture for demand and creates dashboard/feature pressure.
- **M4** best matches repository reality if expressed asymmetrically: users enter through concrete reading value; Mentor earns permission through evidence; OS remains mostly invisible.

## Recommendation

Adopt **M4: Wedge → Relationship → Platform**.

| Direction | Precise type | Role | Must not mean |
|---|---|---|---|
| A Reading Intelligence | product strategy + core user loop + domain moat | acquisition wedge and high-quality evidence generator | whole platform or translation feature |
| B Personal Mentor | engagement/continuity layer + optional surfaces | turn evidence into one next step and return | generic chat or state owner |
| D Hebrew OS | internal architecture + umbrella long-term vision | unify canon, governance and expansion | near-term slogan or equal-weight feature suite |

Marketing lead: A's outcome. Internal roadmap lead: D's contracts constrained by A's loop. B requires A/D maturity. Users need not know D.

## Facts / assumptions / unresolved / sources

**FACT:** A is broadest production surface; B stack is owner-live; D contracts exist. **INFERENCE:** M4 captures this asymmetry. **PROPOSAL:** owner approves M4 subject to external validation gates. Assumptions: reading is frequent enough and mentor improves continuity. Unresolved: cohort activation/retention and WTP. Sources: baseline and strategies 03–05.
