# Token and CSS ownership map

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, runtime targets clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `CODE`, `OWNER_REPORTED`  
> Limitations: proposed filenames/layers are planning values only; no CSS or asset exists yet.

## Principle

The smallest safe contract is **foundations shared; components surface-owned**. Studio already defines the best generic vocabulary. The future layer should extract and stabilize existing `--theme-*` primitives, then expose backward-compatible Room aliases; it must not centralize all component CSS.

## Proposed cascade

```text
visual-foundations.css       tokens, fonts, focus, icon/status utilities
  -> reader-core.css         shared bilingual table and row interaction
  -> reader-morph.css        shared word/morph/SRS domain components
  -> surface stylesheet      Room late inline sheet OR Studio existing sheet
  -> state modifiers         local component state; no inline color
```

Use explicit layer order only after a compatibility spike. Introducing `@layer` around unlayered legacy CSS can reverse precedence; the first implementation should rely on deterministic link order and low-specificity `:where()` utilities.

## Shared token contract

| Group | Canonical tokens | Owner | Notes |
|---|---|---|---|
| surfaces | `--theme-bg-page/card/elevated/muted/hover` | foundations | values extracted from Studio, Room aliases map to these |
| text | `--theme-text-primary/secondary/muted/faint` | foundations | `faint` never used for essential 10–12 px text without contrast proof |
| borders | `--theme-border-soft/medium/strong` | foundations | fixes current Room/Morph single-border flattening |
| accent/status | `--theme-accent`, success/warning/danger + soft backgrounds; add neutral/info only if required | foundations | domain learning/provenance colors stay local |
| elevation | `--theme-shadow-sm/md/lg` | foundations | Room warm editorial shadow stays `--learning-*` local |
| space | `--space-1/2/3/4/6/8` = 4/8/12/16/24/32 px | foundations | do not replace every 6/10/14 px optical adjustment |
| radius | `--radius-sm/md/lg/xl/pill` = 8/10/12/16/999 px | foundations | word/table micro-radii remain local |
| motion | 0/120/140/160/180 ms plus two easings | foundations | no semantic state lives in a duration |
| focus | 3 px accent + 2 px offset, forced-colors fallback | foundations | header currently needs migration from UA 1 px outline |
| typography | system UI, editorial, HE UI, HE reading, numeric utility | foundations | aliases only; no new font asset in immediate scope |
| icon | 16/20/24 geometry, currentColor, logical mirroring metadata | foundations/asset | label and semantics belong to component owner |

## Shared versus local ownership

| File/surface | May own | Must not own |
|---|---|---|
| `visual-foundations.css` new | primitive values, font faces, focus/icon/status utilities, reduced-motion reset | Library IA, Reader table layout, Trainer grading, Studio workflow |
| `reader-core.css/js` | table markup, column/row states, TTS control visual contract | Room shell/card composition or Studio shell |
| `reader-morph.css` + `morph-host.js` | word-card, morphology, provenance and SRS presentation | canonical word/FSRS writer changes |
| Room `library.html` + `library-ui.js` | L0/corpus/Reader shell/Trainer composition and localized state copy | global learner truth, corpus ownership or new network calls |
| `mentor-home.js` | Mentor-specific copy/action composition using shared primitives | a new provider/status state machine |
| Studio `index.html` and modules | Classic/v3 workflow composition and staged adoption | redefinition of shared primitive values after foundations load |
| locale files | localized labels and accessible names in semantic parity | icons as the only meaning or new behavior |

## Compatibility aliases

During migration, existing Room/Morph names remain:

```css
--bg-page: var(--theme-bg-page);
--bg-card: var(--theme-bg-card);
--bg-muted: var(--theme-bg-muted);
--text-primary: var(--theme-text-primary);
--text-secondary: var(--theme-text-secondary);
--text-faint: var(--theme-text-muted);
--border-soft: var(--theme-border-soft);
--accent: var(--theme-accent);
--accent-contrast: #fff;
--shadow: var(--theme-shadow-md);
```

These are planning values, not an instruction to replace domain tokens such as `--row-*`, `--ws-*`, provenance colors or `--learning-warm`.

## Risks and controls

- **Studio inline styles:** immediate work can replace only allowlisted global shell/status instances. The 446-instance cleanup is backlog.
- **Specificity:** no broad `[style*=]`, `!important`, universal component rule or global button reset in the new sheet.
- **Reader parity:** no table builder markup or width contract change; run reader parity before any shared deploy.
- **Dark/auto:** preserve `appTheme_v1`; add `color-scheme: light dark` only after native controls are checked in all three locales.
- **Forced colors:** add explicit `forced-colors` focus/icon/status fallback; current code has none.
- **Legacy rails:** do not delete/reshape old shelf rules unless a separately evidenced dead-code task proves they are unreachable.
- **SW:** every new foundation/icon asset must be precached before HTML references it, or old/offline clients need a text fallback.

## Rollback

The design is static and additive: remove the new links/sprite references, restore old aliases/emoji text and bump APP/SW version. No schema, persisted state or data rollback is involved.
