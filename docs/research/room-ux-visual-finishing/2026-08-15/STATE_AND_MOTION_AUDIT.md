# State and motion audit

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, runtime targets clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `CODE`, `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `EXTERNAL_PRIMARY`  
> Limitations: reduced-motion behavior was statically audited, not runtime-emulated; offline event was isolated and warm, not an offline cold start.

## Current state grammar

| State family | Current implementation | Maturity | Gap |
|---|---|---|---|
| Global loading/error | `showState(key, emoji)` builds `.room-state` | low | no role/live semantics, title/detail/action or scope |
| Reader loading | seven-row skeleton with `role=status`, polite live region | medium | shimmer has a safe no-preference gate, but no textual progress/retry |
| Reader busy/missing/error/empty | `readerStateBox(key, emoji)` | low | same generic box and no state-specific action/announcement |
| L0 preparation | “Собираем следующий шаг…” with `role=status` | medium | real isolated wait was ~30 s; no stage/context/recovery |
| My Texts true empty | explanatory copy plus Add/Studio action | high | needs shared visual anatomy, not semantic rewrite |
| My Texts filter empty/error | plain `.mytexts-empty` line | low | true empty, zero results and load failure are visually conflated |
| FTS loading | spinner + `role=status` | medium | reduced motion only slows the infinite spinner |
| Connection/offline/update | typed state machine, localized text, polite live region, bounded retry | high | visual treatment is mainly color/text; no icon/status token contract |
| Learning index/Compass | typed preparing/ready/limited status and progress | high | compact text can be optically faint; domain truth must stay local |
| Trainer | typed teach/prompt/reveal/save/leech/summary channels | high behavior, mixed visuals | many unique colors/emoji; no shared operational-state skin |
| Mentor/BYOK | many status/consent/error lines | mixed | inconsistent live semantics and action anatomy |
| Studio | extensive ready/stale/save/provider/disabled/error states | mixed | legacy and v3 systems use different tokens and inline overrides |

## State anatomy recommendation — V7

One shared **presentation grammar**, not a new data/state owner:

1. `kind`: loading, empty, offline, partial, error, stale/update, success/info.
2. title: one localized sentence.
3. detail: what remains available, what is delayed, and scope/provenance where material.
4. actions: at most one primary and one secondary, supplied by the owning surface.
5. icon: semantic SVG, redundant with title and hidden from AT.
6. accessibility: loading uses `aria-busy` on the affected region plus polite status; blocking error may use `role=alert` once; non-blocking error remains polite; focus never jumps without user action.

This layer may render existing typed state only. It cannot create retry calls, network calls, telemetry, recommendations or learner truth.

## Motion inventory

| Category | Current values | Finding |
|---|---|---|
| hover/press | 100/120/150 ms | close to target; some `translateY(-1px)` is decorative |
| row/focus continuity | 160/180 ms | appropriate and already no-motion gated in recent Room work |
| sheet/modal | 180/200/220 ms | 220 ms exceeds the requested range; shared sheets disable transition under reduced motion |
| toast | 200 ms opacity/transform | slightly over range; motion adds little information |
| spinner | 700 ms infinite | reduced mode slows to 1.6 s rather than removing motion |
| skeleton | 1.3 s infinite | correctly runs only with `no-preference` |
| aids hint | 1.6 s ×3 | correctly runs only with `no-preference` |
| lesson workbench | 180 ms | correctly disabled under reduced motion |
| audio pulse | 1.1 s infinite in reader core | no adjacent reduced-motion override found |

## Motion contract — V6

| Token/category | Value | Use | Reduced/no-motion equivalent |
|---|---:|---|---|
| `motion-instant` | 0 ms | selected, pressed, validation truth | identical end state |
| `motion-hover` | 120 ms | color/border/opacity only | 0 ms |
| `motion-continuity` | 140 ms | row/focus continuity | 0 ms plus persistent rail/outline |
| `motion-disclosure` | 160 ms | bounded accordion/details | 0 ms, content immediately present |
| `motion-overlay` | 180 ms | sheet/modal enter/exit | 0 ms, focus placement unchanged |

Recommended easing: `cubic-bezier(.2,0,0,1)` for enter/continuity and the inverse for exit; no spring/bounce. Loading loops become a static icon plus live text under reduced motion. Playback remains indicated by control/state/rail rather than pulse.

The W3C media-query specification defines `prefers-reduced-motion: reduce`; it does not mean “play the same loop more slowly”: https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion.

## Offline/partial/error decisions

- Offline-ready preserves and foregrounds local reading; it is informational, not red/error.
- Offline-partial keeps already available content visible, identifies only the unavailable network slice and offers bounded retry.
- Reconnect uses one polite transition and must not reflow the whole page or steal focus.
- Stale/SW-update is distinct from data error; update remains owner-confirmed and Reader position is saved by the existing contract.
- True empty explains the source and next action. Filter empty shows active filters and a clear-filter action. Error never masquerades as empty.
- Status cannot be conveyed by hue alone. W3C's use-of-color and 3:1 non-text contrast requirements are the baseline: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html and https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html.
