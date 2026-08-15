# Icon and semantic audit

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, runtime targets clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `CODE`, `OWNER_LIVE_READ_ONLY`, `EXTERNAL_PRIMARY`  
> Limitations: source counts include Extended Pictographic plus common symbol-controls/arrows; they quantify dependence, not one-for-one replacement work.

## Current source dependence

| Source | Emoji/symbol occurrences | Unique symbols |
|---|---:|---:|
| `library.html` excluding styles/comments | 30 | 19 |
| `library-ui.js` | 317 | 62 |
| `reader-core.js` | 12 | 5 |
| `morph-host.js` | 0 | 0 |
| `mentor-home.js` | 88 | 29 |
| `index.html` excluding styles/comments | 583 | 93 |
| each RU/EN/HE locale file | 668–670 | 95 |

Production Room currently contains zero SVG and zero image UI nodes. The only established product vector is `public/icons/icon.svg`, a first-party geometric LP monogram used by PWA/favicons; PWA raster derivatives also exist.

## Semantic classes

| Class | Current examples | Finding | Policy |
|---|---|---|---|
| Product identity | `📖` Room, `📝` Studio, `🤖` Mentor | identity changes by OS and competes with the actual LP monogram | LP monogram identifies the product; restrained first-party sub-surface marks identify Room/Studio/Mentor |
| Global affordance | cloud, half-moon, magnifier, gear, X, arrows | recognizable but geometrically inconsistent; icon-only controls depend on localized `aria-label` | SVG is decorative inside a named button; function belongs to the control name |
| Action | play/stop, audio, study, train, add, bookmark, notes | the same symbol can mean identity, action or state | one glyph per action; state must not overwrite the accessible action name |
| Status | warning, loading, success/check, streak/fire, audio dots | many are color/multicolor and lack a shared state anatomy | icon + short label + optional detail/action; never color/icon alone |
| Decoration | Aleph watermark, heart credit, teaser accents | can add character but creates AT noise when literal text | CSS/pseudo or `aria-hidden=true`; no semantic text contribution |
| Directional | left/right arrows and chevrons | some code mirrors correctly, but literal arrows are scattered | logical `start/end` icon tokens; mirror only directional icons in RTL |

## Accessibility evidence

W3C requires functional imagery to describe the action rather than the picture, while purely decorative imagery should be omitted from the accessibility tree. Meaningful graphics and UI-state indicators need 3:1 non-text contrast. Sources:

- https://www.w3.org/WAI/tutorials/images/functional/
- https://www.w3.org/WAI/tutorials/images/decorative/
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html

## Source/provenance options

1. **First-party compact SVG set** — custom LP/surface identity plus 16–24 system actions. Best product character and provenance; highest drawing/QA cost.
2. **Pinned vendored Lucide subset + first-party identity** — mature neutral actions with no runtime dependency. Lucide is ISC; Feather-derived files in the set retain MIT notices. A vendored subset must pin source revision, exact filenames, hashes and licence notices. Official evidence: https://github.com/lucide-icons/lucide/blob/main/LICENSE.
3. **Keep Unicode/system glyphs** — zero bytes and easy fallback, but preserves platform variance and weak identity.

## Recommendation — V2

Use a **pinned, vendored, allowlisted SVG subset for system actions plus first-party LP/surface marks**, with no npm/runtime icon package. The implementation packet must include:

- exact upstream revision and per-file provenance;
- retained ISC/MIT notices;
- 20/24 viewBox, `currentColor`, 1.75–2 px optical stroke and filled exception only for state/playback when tested;
- RTL mirroring metadata per icon, never blanket `scaleX(-1)`;
- `aria-hidden=true focusable=false` when adjacent/control text names the action;
- text/Unicode fallback in old cached HTML/JS until the new sprite is available;
- no replacement of Hebrew letters, language abbreviations, mathematical symbols or provenance markers that are actual content.

## Immediate mapping candidate

Immediate icons should be limited to the global shell and repeated action/status grammar: Room/Studio/Mentor identity, sync, theme, search, settings/aids, play/pause/stop, audio, bookmark, note, list/add, train, info, success, warning, error, loading, chevrons and close. Rare specialist emoji and decorative accents remain backlog until their semantic role is proved.
