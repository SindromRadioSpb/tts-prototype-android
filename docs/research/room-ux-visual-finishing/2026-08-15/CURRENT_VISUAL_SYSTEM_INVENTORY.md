# Current visual system inventory

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, target runtime files clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `CODE`, `OWNER_LIVE_READ_ONLY`, `HISTORICAL_AUTOMATION`  
> Limitations: inventory is code/DOM based; historic screenshots are fixture evidence, not current owner-live or physical evidence.

## System shape

There is already a visual system, but it is split across three generations:

1. Studio has the most complete primitive vocabulary: 60 custom properties, including `--theme-*`, table, row-state, elevation and density tokens in `public/index.html:40–180`.
2. Room defines 15 custom properties and most layout/components inside the late inline stylesheet in `public/library.html`; its aliases omit Studio's intermediate borders, status roles and elevations.
3. Shared Reader and Morphology own table/interaction truth in `reader-core.css`, `reader-morph.css`, `reader-core.js` and `morph-host.js`, but duplicate or bridge theme values.

The task is extraction and aliasing, not inventing a parallel design system.

## Surface × component × state inventory

| Surface | Primary components | Observable states | Current owner | Shared dependency / exception |
|---|---|---|---|---|
| Library / L0 | sticky sub-brand header, top actions, tracks, editorial next-action, Today, Journey, Reading Lists, ready rows, corpus entries, footer | loading, empty typed views, active/pressed disclosure, due CTA, online/offline/update banner | `library.html` + `library-ui.js` | `room-b6-core.js`, Learning Compass core; L0 journey remains global truth owner |
| Ben-Yehuda corpus | corpus switcher, identity/trust header, next action, filter chrome, period/author/work drill, vertical material rows, Compass details, FTS | canon loading/error, index preparing/ready, filter empty, FTS loading/error, audio none/partial/full, profile unavailable/limited | `library.html` + `library-ui.js` | corpus item presenter and baked catalog; corpus-local identity is frozen |
| My Texts corpus | corpus switcher, identity header, next action, PRO search, scope/sort/smart filters, facets, paged vertical rows, management disclosure | DB/loading, true empty, filtered empty, page error, local analysis pending, media/status variants | `library-ui.js`, local DB read models | Studio alone manages/imports/deletes; Room only reads/opens |
| Reader | reader bar, title/byline, find, aids, media, bilingual table, current/playing/error rails, end card | skeleton, DB busy, missing/error, empty, ready, resume, media/FTS state | `library-ui.js` shell + `reader-core.js/.css` | table markup/parity shared with Studio; Room-local CSS may override only room shell |
| Morph card | word target, sheet/card, meaning, morphology, familiarity, SRS, inflection, provenance, explain | loading, exact/likely/context provenance, meaning empty, word status, due, suspended, pulse/focus | `morph-host.js` + `reader-morph.css` | canonical shared host; zero emoji/symbol tokens in host code |
| Trainer | study sheet, list/training tabs, channels, prompt, answer options/input/tiles, reveal, summary | loading, empty, teach, prompt, correct/bad/skip, save error, leech, next due, summary | Room inline CSS + `library-ui.js` | grading and `review_log` writers frozen; visual lane cannot grade |
| Mentor | home/status, consent, plan/history, next-text, writing, lesson builder, memory/evidence, BYOK | loading/empty/error, consent required, checking/saved/error, action failed, tier unavailable | Room inline CSS + `mentor-home.js` | API-only behavior and consent boundaries frozen |
| Studio | Classic and v3 shells, text/result workspace, ingest/import/media, library/dashboard, table, SRS, modals/toasts | many ready/stale/empty/loading/disabled/provider/save/error states | `index.html` + Studio modules | 446 `style=` occurrences and high-specificity dark overrides make wholesale migration unsafe |

## Primitive inventory

| Primitive | Current evidence | Assessment |
|---|---|---|
| Color/theme | Studio: 26 `--theme-*` primitives; Room/Morph: duplicated 10-token aliases; light/dark/auto | Reuse Studio names as canonical; Room aliases provide compatibility |
| Typography | system sans UI; Georgia/Times editorial; existing Frank Ruhl Libre, Noto Sans Hebrew and Assistant assets | useful foundation, but optical rules and language tagging are inconsistent |
| Spacing | mostly 4/6/8/10/12/14/16/18/24/32; no named cross-surface scale | normalize only common gaps/paddings, not every local measurement |
| Radius | 3–16 px plus `999px` pills | converge on 8/10/12/16/pill aliases; leave table/word micro-radii local |
| Elevation | Studio `sm/md/lg`; Room many literal shadows including editorial brown depth | map common elevations; keep warm editorial shadow as local composition token |
| Focus | strong 3 px blue on recent Room components; older header controls use UA 1 px outline | one shared two-color-capable `:focus-visible` contract is needed |
| Density | Studio has compact/comfortable/spacious variables; Room mostly fixed | do not make a new density program; set component bounds only |
| Motion | `.1s`–`.22s`, plus 0.7–1.6 s loops | regular continuity is close to target; reduced-motion coverage is incomplete |

## CSS and specificity risks

- `library.html` loads `reader-core.css`, then `reader-morph.css`, then a ~2,400-line inline stylesheet. The late Room sheet deliberately wins the cascade.
- `reader-core.css` explicitly says Studio/Room must stay synchronized; touching table builders or `#proTable` breaks the parity contract.
- Actual inline-style attributes are low in Room (`library.html` 1, `library-ui.js` 1, `reader-core.js` 1, Morph/Mentor 0) but high in Studio (`index.html` 446).
- Studio dark mode uses broad attribute selectors and `!important` to override old inline colors. A shared foundation loaded after those rules would be unsafe.
- `reader-morph.css` duplicates Room's page/card/text tokens but uses a different light `--text-faint` (`#94a3b8` vs Room `#64748b`).
- Legacy shelf/carousel rules and comments remain in Room although the closed successor program now requires vertical typed rows. They are not an invitation to change IA in this lane.

## Existing verification fixtures

- `tests/roomUxMaturity.test.js`, B6/B7/B8 and audio indicator tests: 58/58 passed in this session.
- `npm run smoke:i18n`: passed locale symmetry, RTL and cache-bust contract.
- `npm run smoke:reader-parity`: passed 37 leaf checks plus 4 builder/golden cases.
- Recent fixture families cover 320/360/380/1280/1366, RU/EN/HE, light/dark, My Texts, Ben-Yehuda, Reader, Trainer and Studio. They are regression inputs, not a substitute for fresh owner-live/physical evidence.
